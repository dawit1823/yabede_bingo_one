import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface TablePaginationProps {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
  selectedCount?: number;
  onClearSelection?: () => void;
}

export const TablePagination: React.FC<TablePaginationProps> = ({
  currentPage,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  selectedCount = 0,
  onClearSelection,
}) => {
  if (totalCount === 0) return null;

  const startRecord = Math.min((currentPage - 1) * pageSize + 1, totalCount);
  const endRecord = Math.min(currentPage * pageSize, totalCount);

  // Generate page numbers with ellipses
  const getPageNumbers = () => {
    const pages: (number | string)[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push('...');
      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (currentPage < totalPages - 2) pages.push('...');
      pages.push(totalPages);
    }
    return pages;
  };

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-4 border-t border-slate-800/80 text-xs text-slate-400">
      {/* Left: Info & Selection Status */}
      <div className="flex items-center gap-3 flex-wrap">
        <div>
          Showing <span className="font-bold text-white">{startRecord}</span> to{' '}
          <span className="font-bold text-white">{endRecord}</span> of{' '}
          <span className="font-bold text-amber-400">{totalCount}</span> entries
        </div>

        {selectedCount > 0 && (
          <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5 rounded-lg text-[11px] text-amber-300 font-bold">
            <span>{selectedCount} selected</span>
            {onClearSelection && (
              <button
                onClick={onClearSelection}
                className="text-amber-400 hover:text-white underline cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {/* Page size dropdown */}
        <div className="flex items-center gap-1.5 ml-auto sm:ml-2">
          <span className="text-[11px]">Rows:</span>
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-white font-bold focus:outline-none focus:border-amber-500"
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Right: Page Navigation Controls */}
      <div className="flex items-center gap-1 self-center sm:self-auto">
        <button
          onClick={() => onPageChange(1)}
          disabled={currentPage <= 1}
          className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-slate-950 text-slate-300 transition"
          title="First Page"
        >
          <ChevronsLeft className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-slate-950 text-slate-300 transition"
          title="Previous Page"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>

        <div className="flex items-center gap-1 px-1">
          {getPageNumbers().map((p, idx) =>
            typeof p === 'number' ? (
              <button
                key={idx}
                onClick={() => onPageChange(p)}
                className={`min-w-[28px] h-7 px-2 rounded-lg font-bold text-xs transition ${
                  p === currentPage
                    ? 'bg-amber-500 text-slate-950 shadow-md font-black'
                    : 'bg-slate-950 border border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                {p}
              </button>
            ) : (
              <span key={idx} className="px-1 text-slate-600 font-bold">
                {p}
              </span>
            )
          )}
        </div>

        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-slate-950 text-slate-300 transition"
          title="Next Page"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={() => onPageChange(totalPages)}
          disabled={currentPage >= totalPages}
          className="p-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-slate-950 text-slate-300 transition"
          title="Last Page"
        >
          <ChevronsRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export const TableSortHeader: React.FC<{
  label: string;
  sortKeyName: string;
  currentSortKey: string;
  currentSortDir: 'asc' | 'desc';
  onSort: (key: string) => void;
  className?: string;
}> = ({ label, sortKeyName, currentSortKey, currentSortDir, onSort, className = 'p-3' }) => {
  const isActive = currentSortKey === sortKeyName;

  return (
    <th
      onClick={() => onSort(sortKeyName)}
      className={`${className} cursor-pointer select-none hover:text-amber-400 transition group`}
    >
      <div className="flex items-center gap-1">
        <span>{label}</span>
        <span className="inline-block transition text-[10px]">
          {isActive ? (
            currentSortDir === 'asc' ? (
              <span className="text-amber-400 font-black">▲</span>
            ) : (
              <span className="text-amber-400 font-black">▼</span>
            )
          ) : (
            <span className="text-slate-600 opacity-40 group-hover:opacity-100">⇅</span>
          )}
        </span>
      </div>
    </th>
  );
};
