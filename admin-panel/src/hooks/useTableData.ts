import { useState, useMemo } from 'react';

export type SortDirection = 'asc' | 'desc';

export interface UseTableDataOptions<T> {
  defaultSortKey?: keyof T | string;
  defaultSortDir?: SortDirection;
  initialPageSize?: number;
}

export function useTableData<T extends { id?: string | number }>(
  data: T[],
  options: UseTableDataOptions<T> = {}
) {
  const {
    defaultSortKey = 'id',
    defaultSortDir = 'desc',
    initialPageSize = 25,
  } = options;

  const [sortKey, setSortKey] = useState<string>(String(defaultSortKey));
  const [sortDir, setSortDir] = useState<SortDirection>(defaultSortDir);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(initialPageSize);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Handle Sort Toggle
  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setCurrentPage(1);
  };

  // Sort raw data
  const sortedData = useMemo(() => {
    if (!sortKey) return [...data];

    return [...data].sort((a: any, b: any) => {
      let valA = a[sortKey];
      let valB = b[sortKey];

      // Handle undefined / null
      if (valA === undefined || valA === null) valA = '';
      if (valB === undefined || valB === null) valB = '';

      // Number comparison
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDir === 'asc' ? valA - valB : valB - valA;
      }

      // Boolean comparison
      if (typeof valA === 'boolean' && typeof valB === 'boolean') {
        return sortDir === 'asc' ? (valA === valB ? 0 : valA ? 1 : -1) : (valA === valB ? 0 : valA ? -1 : 1);
      }

      // Date string comparison
      const isDateA = typeof valA === 'string' && !isNaN(Date.parse(valA)) && (valA.includes('T') || valA.includes('-') || valA.includes(':'));
      const isDateB = typeof valB === 'string' && !isNaN(Date.parse(valB)) && (valB.includes('T') || valB.includes('-') || valB.includes(':'));
      if (isDateA && isDateB) {
        const timeA = new Date(valA).getTime();
        const timeB = new Date(valB).getTime();
        if (!isNaN(timeA) && !isNaN(timeB)) {
          return sortDir === 'asc' ? timeA - timeB : timeB - timeA;
        }
      }

      // Fallback String comparison
      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();
      if (strA < strB) return sortDir === 'asc' ? -1 : 1;
      if (strA > strB) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, sortKey, sortDir]);

  // Total pages
  const totalPages = Math.max(1, Math.ceil(sortedData.length / pageSize));

  // Ensure current page is valid when data shrinks
  const safeCurrentPage = Math.min(currentPage, totalPages);

  // Paginated slice
  const paginatedData = useMemo(() => {
    const start = (safeCurrentPage - 1) * pageSize;
    return sortedData.slice(start, start + pageSize);
  }, [sortedData, safeCurrentPage, pageSize]);

  // Selection handlers
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAllVisible = () => {
    const visibleIds = paginatedData
      .map((item) => String(item.id || ''))
      .filter(Boolean);

    setSelectedIds((prev) => {
      const allSelected = visibleIds.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allSelected) {
        visibleIds.forEach((id) => next.delete(id));
      } else {
        visibleIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    const allIds = sortedData.map((item) => String(item.id || '')).filter(Boolean);
    setSelectedIds(new Set(allIds));
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  const isSelected = (id: string) => selectedIds.has(id);

  const isAllVisibleSelected =
    paginatedData.length > 0 &&
    paginatedData.every((item) => selectedIds.has(String(item.id || '')));

  const isSomeVisibleSelected =
    paginatedData.some((item) => selectedIds.has(String(item.id || ''))) &&
    !isAllVisibleSelected;

  return {
    sortKey,
    sortDir,
    handleSort,
    currentPage: safeCurrentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    totalPages,
    totalCount: sortedData.length,
    sortedData,
    paginatedData,
    selectedIds,
    selectedCount: selectedIds.size,
    toggleSelect,
    toggleSelectAllVisible,
    selectAllFiltered,
    clearSelection,
    isSelected,
    isAllVisibleSelected,
    isSomeVisibleSelected,
  };
}
