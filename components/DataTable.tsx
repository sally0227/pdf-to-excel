import React from 'react';
import { PageDataMap } from '../types';

interface DataTableProps {
  data: PageDataMap;
}

const DataTable: React.FC<DataTableProps> = ({ data }) => {
  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="text-center py-12 text-gray-400 bg-gray-50 rounded-lg border border-dashed border-gray-300">
        尚未提取資料，請上傳 PDF 檔案。
      </div>
    );
  }

  const sortedPages = Object.keys(data).sort((a, b) => {
    const numA = parseInt(a.replace(/\D/g, '')) || 0;
    const numB = parseInt(b.replace(/\D/g, '')) || 0;
    return numA - numB;
  });

  return (
    <div className="overflow-x-auto border border-gray-200 rounded-lg shadow-sm h-full">
      {sortedPages.map((pageKey) => {
        const rows = data[pageKey];
        // Determine max columns for this page to render full grid
        const maxCols = Math.max(...rows.map(r => r.length));

        return (
          <div key={pageKey} className="mb-8 last:mb-0">
            <div className="bg-gray-100 px-4 py-2 text-sm font-bold text-gray-700 border-y border-gray-200">
               第 {pageKey} 頁 / Page {pageKey}
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <tbody className="bg-white divide-y divide-gray-200">
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="hover:bg-gray-50 transition-colors">
                    {/* Render cells. If row is shorter than maxCols, fill with empty cells */}
                    {Array.from({ length: Math.max(row.length, 1) }).map((_, colIndex) => (
                      <td 
                        key={`${rowIndex}-${colIndex}`} 
                        className="px-4 py-2 whitespace-nowrap text-sm text-gray-700 border-r border-gray-100 last:border-r-0"
                      >
                        {row[colIndex] || ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
};

export default DataTable;
