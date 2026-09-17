import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSkuMinMax } from "@/features/sku-min-max/services/skuMinMaxClient";

export function useSkuMinMaxPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, totalRecords: 0, pageSize: 100 });
  const [cursorInfo, setCursorInfo] = useState({ next: null, hasMore: false });
  const [cursorMap, setCursorMap] = useState({ 1: null });
  const [iccatSearch, setIccatSearch] = useState("");
  const hasLoadedInitial = useRef(false);

  const loadData = useCallback(async (page = 1, options = {}) => {
    const cursorOverride = Object.prototype.hasOwnProperty.call(options, "cursor")
      ? options.cursor
      : undefined;
    const resetCursors = Boolean(options.resetCursors);
    setLoading(true);
    setErrorMessage("");
    try {
      const cursorValue = cursorOverride !== undefined ? cursorOverride : cursorMap[page];
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("pageSize", pagination.pageSize.toString());
      if (iccatSearch.trim()) {
        params.set("iccat", iccatSearch.trim());
      }
      if (cursorValue) {
        params.set("cursor", cursorValue);
      }

      const result = await fetchSkuMinMax(params);
      if (!result.ok) {
        throw new Error("Unable to load data.");
      }

      const payload = result.data;
      setRecords(payload?.data ?? []);
      setPagination(payload?.pagination ?? { page: 1, totalPages: 1, totalRecords: 0, pageSize: 100 });
      setCursorInfo(payload?.cursor ?? { next: null, hasMore: false });
      const nextCursor = payload?.cursor?.next ?? null;
      setCursorMap((prev) => {
        const base = resetCursors ? { 1: null } : { ...prev };
        base[page] = cursorValue ?? null;
        base[page + 1] = nextCursor;
        return base;
      });
    } catch (error) {
      setErrorMessage(error?.message || "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, [pagination.pageSize, iccatSearch, cursorMap]);

  useEffect(() => {
    if (hasLoadedInitial.current) {
      return;
    }
    loadData(1, { cursor: null, resetCursors: true });
    hasLoadedInitial.current = true;
  }, [loadData]);

  const canGoNext = cursorInfo.hasMore && Boolean(cursorMap[pagination.page + 1]);

  return {
    records,
    loading,
    errorMessage,
    pagination,
    iccatSearch,
    setIccatSearch,
    loadData,
    canGoNext,
  };
}
