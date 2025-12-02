import * as XLSX from 'xlsx';
import { PageDataMap, GridData } from "../types";

// Helper to sanitize data before passing to SheetJS
// This ensures no null/undefined values cause silent failures
const sanitizeGridData = (rows: GridData): string[][] => {
  if (!Array.isArray(rows)) return [];
  
  return rows.map(row => {
    if (!Array.isArray(row)) return [];
    return row.map(cell => {
      if (cell === null || cell === undefined) return "";
      return String(cell);
    });
  });
};

export const downloadExcel = (data: PageDataMap, filename: string, mode: 'merge' | 'split') => {
  const wb = XLSX.utils.book_new();

  if (mode === 'merge') {
    // Mode 1: Merge all pages into one big sheet
    let allRows: string[][] = [];
    
    // Sort pages naturally (1, 2, 3...)
    const sortedPages = Object.keys(data).sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.replace(/\D/g, '')) || 0;
      return numA - numB;
    });

    sortedPages.forEach(pageKey => {
      // Sanitize the rows for this page
      const cleanRows = sanitizeGridData(data[pageKey]);
      
      allRows = [...allRows, ...cleanRows];
      // Add an empty row between pages for readability
      allRows.push([]); 
    });

    const ws = XLSX.utils.aoa_to_sheet(allRows);
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");

  } else {
    // Mode 2: One sheet per page
    const sortedPages = Object.keys(data).sort((a, b) => {
      const numA = parseInt(a.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.replace(/\D/g, '')) || 0;
      return numA - numB;
    });

    sortedPages.forEach(pageKey => {
      // Create a clean sheet name (e.g., "Page 1")
      let sheetName = pageKey.includes("Page") || pageKey.includes("頁") ? pageKey : `Page ${pageKey}`;
      // Excel sheet names max 31 chars and no special chars ideally
      sheetName = sheetName.replace(/[:\/\\?*\[\]]/g, "").substring(0, 31);
      
      const cleanRows = sanitizeGridData(data[pageKey]);
      const ws = XLSX.utils.aoa_to_sheet(cleanRows);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);
    });
  }

  // Generate file and trigger download
  XLSX.writeFile(wb, filename);
};
