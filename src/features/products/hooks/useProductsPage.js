import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchIccatTypes, fetchProducts } from "@/features/products/services/productsClient";
import { exportProductsToExcel } from "@/features/products/utils/productsExcel";

export function useProductsPage() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    totalPages: 1,
    totalRecords: 0,
    pageSize: 100,
  });
  const [cursorInfo, setCursorInfo] = useState({ next: null, hasMore: false });
  const [cursorMap, setCursorMap] = useState({ 1: null });
  const [searchText, setSearchText] = useState("");
  const [iccatOptions, setIccatOptions] = useState([]);
  const [selectedIccat, setSelectedIccat] = useState([]);
  const [isIccatOpen, setIsIccatOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const iccatSelectionRef = useRef(false);
  const cursorMapRef = useRef(cursorMap);

  useEffect(() => {
    cursorMapRef.current = cursorMap;
  }, [cursorMap]);

  const fetchPage = useCallback(
    async (page = 1, options = {}) => {
      const cursorOverride = Object.prototype.hasOwnProperty.call(options, "cursor")
        ? options.cursor
        : undefined;
      const resetCursors = Boolean(options.resetCursors);
      setLoading(true);
      try {
        const cursorValue = cursorOverride !== undefined ? cursorOverride : cursorMapRef.current[page];
        const params = new URLSearchParams();
        params.set("page", page.toString());
        params.set("pageSize", pagination.pageSize.toString());
        if (searchText.trim()) {
          params.set("search", searchText.trim());
        }
        if (selectedIccat.length) {
          params.set("iccatCodes", selectedIccat.join(","));
        }
        if (cursorValue) {
          params.set("cursor", cursorValue);
        }

        const result = await fetchProducts(params);
        if (!result.ok) {
          throw new Error("Unable to load products data.");
        }

        const payload = result.data;
        setRecords(payload?.data ?? []);
        setPagination(
          payload?.pagination ?? {
            page: 1,
            totalPages: 1,
            totalRecords: 0,
            pageSize: 100,
          }
        );
        setCursorInfo(payload?.cursor ?? { next: null, hasMore: false });
        const nextCursor = payload?.cursor?.next ?? null;
        setCursorMap((prev) => {
          const base = resetCursors ? { 1: null } : { ...prev };
          base[page] = cursorValue ?? null;
          base[page + 1] = nextCursor;
          return base;
        });
      } catch (error) {
        // ignore error; we simply stop loading
      } finally {
        setLoading(false);
      }
    },
    [pagination.pageSize, searchText, selectedIccat]
  );

  useEffect(() => {
    fetchPage(1, { cursor: null, resetCursors: true });
  }, [fetchPage]);

  useEffect(() => {
    const loadIccatOptions = async () => {
      try {
        const result = await fetchIccatTypes({ group: "products" });
        if (!result.ok) {
          throw new Error("Unable to load categories.");
        }
        const options = result.data?.data ?? [];
        setIccatOptions(options);
        if (!iccatSelectionRef.current && options.length) {
          setSelectedIccat(options.map((option) => option.ICCAT_CODE));
        }
      } catch (error) {
        setIccatOptions([]);
      }
    };
    loadIccatOptions();
  }, []);

  const handleSearch = () => {
    fetchPage(1, { cursor: null, resetCursors: true });
  };

  const handleExportExcel = useCallback(async () => {
    setExporting(true);
    setExportError("");
    try {
      const pageSize = 500;
      let page = 1;
      let cursor = null;
      const allRows = [];

      while (true) {
        const params = new URLSearchParams();
        params.set("page", page.toString());
        params.set("pageSize", pageSize.toString());
        if (searchText.trim()) {
          params.set("search", searchText.trim());
        }
        if (selectedIccat.length) {
          params.set("iccatCodes", selectedIccat.join(","));
        }
        if (cursor) {
          params.set("cursor", cursor);
        }

        const result = await fetchProducts(params);
        if (!result.ok) {
          throw new Error("Unable to export products.");
        }

        const payload = result.data || {};
        const pageRows = Array.isArray(payload?.data) ? payload.data : [];
        allRows.push(...pageRows);

        const nextCursor = payload?.cursor?.next ?? null;
        const hasMore = Boolean(payload?.cursor?.hasMore && nextCursor);
        if (!hasMore) {
          break;
        }

        page += 1;
        cursor = nextCursor;
      }

      if (!allRows.length) {
        throw new Error("ไม่มีข้อมูลสินค้าให้ export");
      }

      await exportProductsToExcel(allRows);
    } catch (error) {
      setExportError(String(error?.message || "Export สินค้าไม่สำเร็จ"));
    } finally {
      setExporting(false);
    }
  }, [searchText, selectedIccat]);

  const toggleIccat = (code) => {
    iccatSelectionRef.current = true;
    setSelectedIccat((current) => (
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code]
    ));
  };

  const selectAllIccat = () => {
    iccatSelectionRef.current = true;
    setSelectedIccat(iccatOptions.map((option) => option.ICCAT_CODE));
  };

  const clearIccatSelection = () => {
    iccatSelectionRef.current = true;
    setSelectedIccat([]);
  };

  const rows = useMemo(
    () => records.map((record, index) => ({ id: `${record.SKU_CODE || "sku"}-${index}`, ...record })),
    [records]
  );
  const canGoNext = cursorInfo.hasMore && Boolean(cursorMap[pagination.page + 1]);

  return {
    rows,
    loading,
    pagination,
    cursorMap,
    cursorInfo,
    searchText,
    setSearchText,
    iccatOptions,
    selectedIccat,
    isIccatOpen,
    setIsIccatOpen,
    handleSearch,
    toggleIccat,
    selectAllIccat,
    clearIccatSelection,
    fetchPage,
    canGoNext,
    exporting,
    exportError,
    handleExportExcel,
  };
}
