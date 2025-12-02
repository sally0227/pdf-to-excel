import { GoogleGenAI } from "@google/genai";
import { PDFDocument } from "pdf-lib";
import { PageDataMap } from "../types";

// Number of pages to process in a single AI request.
// 3 pages is a safe balance between speed and preventing output token truncation.
const BATCH_SIZE = 3;

const processFile = async (
  base64Data: string,
  apiKey: string,
  onProgress?: (message: string) => void
): Promise<PageDataMap> => {
  if (!apiKey) {
    throw new Error("找不到 API 金鑰，請確認環境變數 process.env.API_KEY 已設定。");
  }

  // Load the PDF document
  let pdfDoc;
  try {
    pdfDoc = await PDFDocument.load(base64Data);
  } catch (e) {
    throw new Error("無法讀取 PDF 檔案，請確認檔案是否損毀。");
  }

  const totalPages = pdfDoc.getPageCount();
  const aggregatedData: PageDataMap = {};
  const ai = new GoogleGenAI({ apiKey });

  // Loop through the PDF in batches
  for (let i = 0; i < totalPages; i += BATCH_SIZE) {
    const startPage = i + 1;
    const endPage = Math.min(i + BATCH_SIZE, totalPages);
    
    if (onProgress) {
      onProgress(`正在分析第 ${startPage} - ${endPage} 頁 (共 ${totalPages} 頁)...`);
    }

    // Create a new sub-document for this batch
    const subDoc = await PDFDocument.create();
    // Copy pages from source (indices are 0-based)
    const pageIndices = [];
    for (let j = 0; j < (endPage - startPage + 1); j++) {
        pageIndices.push(i + j);
    }
    
    const copiedPages = await subDoc.copyPages(pdfDoc, pageIndices);
    copiedPages.forEach((page) => subDoc.addPage(page));

    // Save sub-document as base64
    const subPdfBase64 = await subDoc.saveAsBase64();

    // Call Gemini for this batch
    try {
        const batchResult = await callGeminiWithRetry(ai, subPdfBase64);
        
        // Merge batch result into aggregated data
        // IMPORTANT: Gemini might return keys "1", "2" relative to the chunk.
        // We need to map them to the global page number.
        
        // Strategy: Iterate through keys returned by Gemini
        // If Gemini returns "1", map to startPage. If "2", map to startPage + 1.
        Object.keys(batchResult).forEach(localKey => {
            // Attempt to parse the key as a number
            const localNum = parseInt(localKey.replace(/\D/g, ''));
            
            if (!isNaN(localNum)) {
                // Calculate global page number
                // Note: localNum is usually 1-based relative to the chunk provided.
                // e.g., if we sent pages 4,5,6. AI sees a 3-page PDF. It calls them Page 1, 2, 3.
                // globalPage = (batchStartOffset) + localNum
                // i is the batchStartOffset (0, 3, 6...)
                const globalPageNum = i + localNum;
                aggregatedData[String(globalPageNum)] = batchResult[localKey];
            } else {
                // Fallback for weird keys, just append
                aggregatedData[`${localKey}_batch_${startPage}`] = batchResult[localKey];
            }
        });

    } catch (batchError) {
        console.error(`Error processing batch ${startPage}-${endPage}:`, batchError);
        // We generally want to continue even if one batch fails, but maybe log it?
        // For now, let's throw to stop and let user retry, or we could skip.
        // Let's try to return partial data if we crash? No, throw is safer to alert user.
        throw new Error(`第 ${startPage}-${endPage} 頁處理失敗: ${batchError instanceof Error ? batchError.message : "未知錯誤"}`);
    }
  }

  return aggregatedData;
};

// Extracted AI call logic for cleaner batch loop
async function callGeminiWithRetry(ai: GoogleGenAI, base64Data: string): Promise<PageDataMap> {
    const systemInstruction = `
    你是一個高階會計報表結構還原引擎。
    任務：將 PDF 文件轉換為結構化的 JSON 資料。

    **核心原則：1 格 = 1 字串 (One Cell = One String)**
    請將 PDF 中的表格視為一個固定的網格 (Grid)。
    JSON 陣列中的每一個元素，必須嚴格對應 PDF 表格中的一個「視覺儲存格」。

    **關鍵規則 (防止錯位與拆分)**：
    1.  **結構**：回傳 JSON 物件，Key="1", "2"... (相對頁碼)，Value=二維陣列。
    
    2.  **斜線儲存格處理 (定位關鍵)**：
        *   **有文字**：若單一格子內有斜線區分文字（例如左下「日期」、右上「項目」），請務必合併為**單一字串** (使用 " / " 分隔)，例如 "項目 / 日期"。
        *   **嚴禁拆分**：絕對**禁止**將其拆分為兩個陣列元素（例如 ["項目", "日期"]），這會導致該列所有資料向右錯位。它在陣列中必須只佔據**一個位置**。
        *   **無文字**：若格子內只有斜線表示無數值，請輸出空字串 \`""\`。

    3.  **嚴格對齊 (防止左移)**：
        *   請先計算表頭有幾欄 (例如 11 欄)。
        *   底下的每一列數據都**必須**剛好有 11 個元素。
        *   **空白格**：如果 PDF 上某個欄位是空白的 (或只有斜線)，務必輸出 \`""\`，**絕對禁止跳過**，也禁止為了省空間而將後面的數據往左移。
        *   **範例**：如果第 3 欄空白，應輸出 \`["A", "B", "", "D"]\`，不可輸出 \`["A", "B", "D"]\`。

    4.  **視覺還原**：
        *   包含頁首、頁尾、附註。
        *   上下堆疊的文字請合併為單行（如 "身分證\\n字號" -> "身分證字號"）。
    
    5.  **轉義**：所有雙引號 " 必須轉義為 \\"。

    **JSON 格式範例**：
    {
      "1": [
         ["報表標題"],
         ["項目 / 月份", "1月", "2月"],  <-- 斜線格合併為單一字串，沒有拆分
         ["營收", "100", ""]            <-- 空白格保留 ""
      ]
    }
  `;

  const prompt = `
    分析此 PDF 片段並回傳 JSON。
    請注意：這是一個大型文件的其中一部分。請回傳本片段中每一頁的資料。
    Key 請使用 1, 2, 3... 代表此片段的第幾頁。
    請特別注意空白欄位的對齊，不要將數值填錯欄位。
  `;

  const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: {
        parts: [
          { inlineData: { mimeType: "application/pdf", data: base64Data } },
          { text: prompt }
        ]
      },
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
      }
    });

    const textResponse = response.text;
    if (!textResponse) throw new Error("Gemini 沒有回傳資料");

    let jsonString = textResponse.trim();
    if (jsonString.startsWith('```')) {
        jsonString = jsonString.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
    }
    jsonString = jsonString.replace(/^\s*\/\/.*$/gm, '');
    const firstBracket = jsonString.indexOf('{');
    if (firstBracket !== -1) jsonString = jsonString.substring(firstBracket);

    try {
        return JSON.parse(jsonString) as PageDataMap;
    } catch (parseError) {
        console.warn("JSON Parse Failed, attempting repair...");
        const repaired = tryRepairJson(jsonString);
        if (repaired) return repaired as PageDataMap;
        throw new Error("JSON 解析失敗 (Truncated)");
    }
}

function tryRepairJson(jsonStr: string): any {
    const lastRowEnd = jsonStr.lastIndexOf('],');
    const lastRowEndBracket = jsonStr.lastIndexOf(']');
    let cutIndex = -1;
    if (lastRowEnd !== -1) cutIndex = lastRowEnd + 1; 
    else if (lastRowEndBracket !== -1) cutIndex = lastRowEndBracket + 1;

    if (cutIndex === -1) return null;

    let fixedStr = jsonStr.substring(0, cutIndex);
    const candidates = ['}}', ']}', ']]}'];
    for (const suffix of candidates) {
        try {
            return JSON.parse(fixedStr + suffix);
        } catch (e) {}
    }
    try { return JSON.parse(fixedStr + ']}'); } catch (e) { return null; }
}

export const GeminiService = {
  processFile
};
