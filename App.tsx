import React, { useState, useRef } from 'react';
import { FileText, Upload, Download, AlertCircle, RefreshCw, ScanLine, Wand2, Layers, FileSpreadsheet } from 'lucide-react';
import { GeminiService } from './services/geminiService';
import { downloadExcel } from './utils/excelHelper';
import ProcessingStatus from './components/ProcessingStatus';
import DataTable from './components/DataTable';
import { PageDataMap, FileData, ProcessingState } from './types';

const App: React.FC = () => {
  const [fileData, setFileData] = useState<FileData | null>(null);
  const [extractedData, setExtractedData] = useState<PageDataMap>({});
  const [status, setStatus] = useState<ProcessingState & { message?: string }>({
    isProcessing: false,
    progress: 0,
    error: null,
    message: ''
  });
  const [isDragging, setIsDragging] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = (file: File) => {
    if (file.type !== 'application/pdf') {
      setStatus({ ...status, error: "請上傳有效的 PDF 檔案。" });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      const base64Content = base64String.split(',')[1];
      
      setFileData({
        name: file.name,
        type: file.type,
        size: file.size,
        base64: base64Content
      });
      setStatus({ isProcessing: false, progress: 0, error: null, message: '' });
      setExtractedData({});
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleProcess = async () => {
    if (!fileData) return;

    setStatus({ isProcessing: true, progress: 0, error: null, message: '準備開始...' });
    
    try {
      const result = await GeminiService.processFile(
        fileData.base64, 
        process.env.API_KEY || '',
        (progressMsg) => {
          setStatus(prev => ({ ...prev, message: progressMsg }));
        }
      );
      setExtractedData(result);
      setStatus({ isProcessing: false, progress: 100, error: null, message: '' });
    } catch (err: any) {
      setStatus({ 
        isProcessing: false, 
        progress: 0, 
        error: err.message || "發生未知錯誤。",
        message: ''
      });
    }
  };

  const handleDownloadMerged = () => {
    if (Object.keys(extractedData).length === 0) return;
    try {
      const fileName = fileData?.name ? fileData.name.replace('.pdf', '_merged.xlsx') : 'data_merged.xlsx';
      downloadExcel(extractedData, fileName, 'merge');
    } catch (error) {
      console.error("Download failed:", error);
      setStatus(prev => ({ ...prev, error: "Excel 產生失敗，請稍後再試。" }));
    }
  };

  const handleDownloadSplit = () => {
    if (Object.keys(extractedData).length === 0) return;
    try {
      const fileName = fileData?.name ? fileData.name.replace('.pdf', '_split.xlsx') : 'data_split.xlsx';
      downloadExcel(extractedData, fileName, 'split');
    } catch (error) {
      console.error("Download failed:", error);
      setStatus(prev => ({ ...prev, error: "Excel 產生失敗，請稍後再試。" }));
    }
  };

  const handleReset = () => {
    setFileData(null);
    setExtractedData({});
    setStatus({ isProcessing: false, progress: 0, error: null, message: '' });
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const hasData = Object.keys(extractedData).length > 0;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="bg-blue-600 p-2 rounded-lg">
              <FileText className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">PDF 轉 Excel 專家</h1>
          </div>
          <div className="text-sm text-gray-500 hidden sm:block">
            由 Gemini 2.5 AI 驅動
          </div>
        </div>
      </header>

      <main className="flex-grow max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        
        {/* Error Notification */}
        {status.error && (
          <div className="mb-6 bg-red-50 border-l-4 border-red-500 p-4 rounded-r-md flex items-start">
            <AlertCircle className="h-5 w-5 text-red-500 mr-3 mt-0.5" />
            <div>
              <h3 className="text-sm font-medium text-red-800">錯誤</h3>
              <p className="text-sm text-red-700 mt-1">{status.error}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Controls */}
          <div className="space-y-6">
            
            {/* File Upload Card */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center justify-between">
                <span className="flex items-center">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold mr-2">1</span>
                  選擇檔案
                </span>
                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-green-50 text-green-700 border border-green-100">
                  <ScanLine className="w-3 h-3 mr-1" />
                  支援掃描檔 / OCR
                </span>
              </h2>
              
              {!fileData ? (
                <div 
                  className={`border-2 border-dashed rounded-lg p-8 transition-all cursor-pointer flex flex-col items-center text-center group ${
                    isDragging 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-300 hover:border-blue-400 hover:bg-blue-50'
                  }`}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <Upload className={`h-10 w-10 mb-3 transition-colors ${isDragging ? 'text-blue-600' : 'text-gray-400 group-hover:text-blue-500'}`} />
                  <p className="text-sm font-medium text-gray-700">點擊或拖曳 PDF 檔案至此</p>
                  <p className="text-xs text-gray-500 mt-1">支援一般 PDF 與掃描文件</p>
                </div>
              ) : (
                <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-3 overflow-hidden">
                      <FileText className="h-8 w-8 text-blue-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{fileData.name}</p>
                        <p className="text-xs text-gray-500">{(fileData.size / 1024).toFixed(1)} KB</p>
                      </div>
                    </div>
                    <button 
                      onClick={handleReset}
                      className="p-1 hover:bg-blue-200 rounded-full text-blue-600 transition-colors"
                      title="移除檔案"
                    >
                      <RefreshCw className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
              <input 
                type="file" 
                accept="application/pdf" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
              />
            </div>

            {/* Feature Info Card */}
            <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-xl shadow-sm border border-indigo-100 p-6">
              <div className="flex items-start space-x-3">
                <Wand2 className="h-5 w-5 text-indigo-600 mt-0.5" />
                <div>
                  <h3 className="text-sm font-semibold text-indigo-900">智慧版面分析</h3>
                  <p className="text-xs text-indigo-700 mt-1 leading-relaxed">
                    自動批次處理大型文件，並在最後合併為完整報表。AI 將完整還原 PDF 視覺結構。
                  </p>
                </div>
              </div>
            </div>

            {/* Action Button */}
            <button
              onClick={handleProcess}
              disabled={!fileData || status.isProcessing}
              className={`w-full py-3.5 px-4 rounded-xl text-white font-medium shadow-sm transition-all flex items-center justify-center space-x-2 ${
                !fileData || status.isProcessing
                  ? 'bg-gray-300 cursor-not-allowed'
                  : 'bg-gray-900 hover:bg-black hover:shadow-md active:transform active:scale-[0.98]'
              }`}
            >
              <span>{status.isProcessing ? '正在處理中...' : '開始轉換為 Excel'}</span>
            </button>
          </div>

          {/* Right Column: Preview */}
          <div className="lg:col-span-2 flex flex-col h-full">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col h-full min-h-[500px]">
              <div className="p-6 border-b border-gray-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gray-50 rounded-t-xl">
                <h2 className="text-lg font-semibold text-gray-900 flex items-center">
                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-blue-100 text-blue-600 text-xs font-bold mr-2">2</span>
                  資料預覽
                </h2>
                
                {hasData && (
                  <div className="flex space-x-2">
                    <button
                      onClick={handleDownloadMerged}
                      className="flex items-center px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors shadow-sm"
                      title="所有資料在同一個工作表"
                    >
                      <Layers className="h-4 w-4 mr-2" />
                      合併工作表
                    </button>
                    <button
                      onClick={handleDownloadSplit}
                      className="flex items-center px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition-colors shadow-sm"
                      title="每頁一個工作表"
                    >
                      <FileSpreadsheet className="h-4 w-4 mr-2" />
                      依頁面分表
                    </button>
                  </div>
                )}
              </div>
              
              <div className="flex-grow p-6 overflow-hidden flex flex-col relative">
                <DataTable data={extractedData} />
              </div>
              
              {hasData && (
                <div className="p-4 border-t border-gray-200 bg-gray-50 rounded-b-xl text-xs text-gray-500 flex justify-between">
                  <span>已提取 {Object.keys(extractedData).length} 頁資料</span>
                  <span>可選擇合併下載或分頁下載</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
      
      <ProcessingStatus isProcessing={status.isProcessing} message={status.message} />
    </div>
  );
};

export default App;
