"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Activity,
  Grid3x3,
  List,
  Search,
  Warehouse,
  Download,
  AlertTriangle,
  CircleCheck,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { usePermissions } from "@/lib/usePermissions";
import { fetchSkuMinMax } from "@/features/sku-min-max/services/skuMinMaxClient";
import { fetchSuppliers } from "@/features/suppliers/services/suppliersClient";
import { fetchIccatTypes } from "@/features/products/services/productsClient";
import { usePersistentRouteState } from "@/lib/usePersistentRouteState";
import {
  combineLotQuantityBreakdowns,
  formatLotUnitReference,
  formatQuantityNumber,
  formatReadableLotQuantity,
  formatReadableLotQuantityAmount,
  formatReadableLotQuantityUnit,
  getLotQuantityBreakdown,
} from "@/lib/inventoryUnitDisplay";
import {
  fetchRawMaterials,
  fetchRawMaterialsSummary,
  fetchRawMaterialsMovement,
  fetchRawMaterialsWithDeduction,
} from "@/features/raw-materials/services/rawMaterialsClient";
import LiveClock from "@/components/LiveClock";

const DEFAULT_ICCAT_CODES = ["01", "02", "03", "05", "08", "10"];
const RAW_MATERIAL_COST_CODES = ["01", "02", "03", "05", "08", "10"];
const EMPTY_LOT_SUMMARY = Object.freeze({
  totalProducts: 0,
  totalBaseQty: 0,
  totalInventoryValue: 0,
  incompleteCostRows: 0,
});
const HOLD_DAYS = 5;
const SUMMARY_GRID_TEMPLATE = "minmax(0,80fr) minmax(0,180fr) minmax(0,72fr) minmax(0,96fr) minmax(0,72fr) minmax(0,58fr) minmax(0,92fr) minmax(0,52fr) minmax(0,52fr) minmax(0,68fr) minmax(0,78fr) minmax(0,62fr) minmax(0,68fr) minmax(0,58fr) minmax(0,70fr)";
const STATUS_OPTIONS = [
  { value: "all", label: "ทั้งหมด" },
  { value: "ต้องสั่งซื้อ", label: "ต้องสั่งซื้อ" },
  { value: "ปกติ", label: "ปกติ" },
];
const pad2 = (value) => String(value).padStart(2, "0");
const formatDateInputValue = (date) => (
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
);
const getDefaultDateRange = () => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    from: formatDateInputValue(startOfMonth),
    to: formatDateInputValue(now),
  };
};
const DEFAULT_RAW_MATERIALS_FILTER_STATE = Object.freeze({
  brandCodes: "",
  iccatOptions: [],
  selectedIccat: DEFAULT_ICCAT_CODES,
  statusFilter: "all",
  lotCostStatus: "all",
  lotWarehouseCode: "",
  skuName: "",
  movementDateFrom: getDefaultDateRange().from,
  movementDateTo: getDefaultDateRange().to,
});
const getDaysInYear = (year) => {
  const start = new Date(year, 0, 1);
  const end = new Date(year + 1, 0, 1);
  return Math.round((end - start) / (1000 * 60 * 60 * 24));
};
const getPreviousYearRange = () => {
  const now = new Date();
  const year = now.getFullYear() - 1;
  return {
    year,
    from: formatDateInputValue(new Date(year, 0, 1)),
    to: formatDateInputValue(new Date(year, 11, 31)),
  };
};

// Helper to parse DD/MM/YYYY for sorting
const parseDate = (dateStr) => {
  if (!dateStr) return 0;
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
  }
  return new Date(dateStr).getTime();
};

const escapeCsv = (value) => {
  const text = (value ?? "").toString();
  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, "\"\"")}"`;
  }
  return text;
};

const toNumberValue = (value) => {
  const parsed = Number((value ?? "").toString().replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : "";
};

const toNumberOrZero = (value) => {
  const parsed = Number((value ?? "").toString().replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatCostNumber = (value) => {
  if (value === null || value === undefined || value === "") return "—";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return parsed.toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

const createPerfLogger = (label) => {
  if (typeof performance === "undefined" || process.env.NODE_ENV === "production") {
    return () => { };
  }
  const startedAt = performance.now();
  return (meta) => {
    const duration = Math.round((performance.now() - startedAt) * 100) / 100;
    if (meta) {
      console.info(`[perf] ${label} ${duration}ms`, meta);
      return;
    }
    console.info(`[perf] ${label} ${duration}ms`);
  };
};

export default function RawMaterialsPageClient({ initialView = "summary", skipDeduction = false }) {
  /*
  const {
    // State
    activeView,
    setActiveView,
    records,
    loading,
    errorMessage,
    pagination,
    canGoNext,

    // Filters
    skuName,
    setSkuName,
    statusFilter,
    setStatusFilter,
    brandCodes,
    setBrandCodes,
    selectedIccat,
    setSelectedIccat,
    movementDateFrom,
    setMovementDateFrom,
    movementDateTo,
    setMovementDateTo,

    // Options / Metadata
    iccatOptions,
    iccatNameByCode,
    minMaxBySku,
    supplierHistory,
    avgUsageBySku,

    // Actions
    loadData,
    mutate
  } = useRawMaterialsPage({ initialView, skipDeduction });
  */

  const [dataState, setDataState] = useState({
    records: [],
    summaryRecords: [],
    movementRecords: [],
    minMaxBySku: new Map(),
    supplierHistory: new Map(),
    avgUsageBySku: new Map(),
    lotSummary: EMPTY_LOT_SUMMARY,
  });

  const [summaryFilterState, setSummaryFilterState] = useState({
    allRecords: [],
    loading: false,
    key: ""
  });

  const [uiState, setUiState] = useState({
    loading: false,
    errorMessage: "",
    isIccatOpen: false,
    isStatusOpen: false,
    isHistoryModalOpen: false,
    isExportOpen: false,
    exportLoading: false,
    avgUsageLoading: false,
    supplierHistoryLoading: false,
    selectedSkuForHistory: null
  });

  const [paginationState, setPaginationState] = useState({
    pagination: { page: 1, totalPages: 1, totalRecords: 0, pageSize: 100 },
    summaryCursorInfo: { next: null, hasMore: false },
    lotCursorInfo: { next: null, hasMore: false },
    movementCursorInfo: { next: null, hasMore: false },
    summaryCursorMap: { 1: null },
    lotCursorMap: { 1: null },
    movementCursorMap: { 1: null }
  });

  const [filterState, setFilterState] = usePersistentRouteState(
    "raw-materials.filters",
    DEFAULT_RAW_MATERIALS_FILTER_STATE
  );

  // Vercel Best Practice: rerender-functional-setstate - Use functional setState
  const updateDataState = useCallback((updater) => {
    setDataState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      return { ...prev, ...next };
    });
  }, []);

  const updateUiState = useCallback((updater) => {
    setUiState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      return { ...prev, ...next };
    });
  }, []);

  const updatePaginationState = useCallback((updater) => {
    setPaginationState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      return { ...prev, ...next };
    });
  }, []);

  const updateFilterState = useCallback((updater) => {
    setFilterState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      return { ...prev, ...next };
    });
  }, [setFilterState]);

  const activeView = initialView === "lot"
    ? "lot"
    : initialView === "movement"
      ? "movement"
      : "summary";
  const hasLoadedInitial = useRef(false);
  const skipNextViewReload = useRef(true);
  const hasCustomIccat = useRef(false);
  const appliedSkuNameRef = useRef("");
  const supplierHistoryLoadedRef = useRef(false);
  const supplierHistoryPromiseRef = useRef(null);
  const pageCacheRef = useRef(new Map());
  const inFlightRef = useRef(new Map());
  const summaryFilterKeyRef = useRef("");
  const scrollRef = useRef(null);
  const iccatDropdownRef = useRef(null);
  const statusDropdownRef = useRef(null);
  const exportDropdownRef = useRef(null);
  const summaryCursorMapRef = useRef(paginationState.summaryCursorMap);
  const lotCursorMapRef = useRef(paginationState.lotCursorMap);
  const movementCursorMapRef = useRef(paginationState.movementCursorMap);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const permissionState = usePermissions();
  const canViewSummary = permissionState.loaded
    ? (permissionState.isAdmin ||
      ["raw-materials-summary", "raw-materials-summary-view"].some((key) => permissionState.permissions.includes(key)))
    : false;
  const canViewLot = permissionState.loaded
    ? (permissionState.isAdmin ||
      ["raw-materials-lot", "raw-materials-lot-view"].some((key) => permissionState.permissions.includes(key)))
    : false;
  const canViewMovement = permissionState.loaded
    ? (permissionState.isAdmin ||
      ["raw-materials-movement", "raw-materials-movement-view"].some((key) => permissionState.permissions.includes(key)))
    : false;

  useEffect(() => {
    if (!permissionState.loaded) {
      return;
    }
    if (!canViewSummary && !canViewLot && !canViewMovement) {
      router.replace("/unauthorized");
      return;
    }
    if (activeView === "summary" && !canViewSummary) {
      const fallback = canViewLot
        ? "/raw-materials/lot"
        : canViewMovement
          ? "/raw-materials/movement"
          : "/unauthorized";
      router.replace(fallback);
      return;
    }
    if (activeView === "lot" && !canViewLot) {
      const fallback = canViewSummary
        ? "/raw-materials/summary"
        : canViewMovement
          ? "/raw-materials/movement"
          : "/unauthorized";
      router.replace(fallback);
      return;
    }
    if (activeView === "movement" && !canViewMovement) {
      const fallback = canViewSummary
        ? "/raw-materials/summary"
        : canViewLot
          ? "/raw-materials/lot"
          : "/unauthorized";
      router.replace(fallback);
    }
  }, [activeView, canViewSummary, canViewLot, canViewMovement, permissionState.loaded, router]);

  useEffect(() => {
    summaryCursorMapRef.current = paginationState.summaryCursorMap;
  }, [paginationState.summaryCursorMap]);

  useEffect(() => {
    lotCursorMapRef.current = paginationState.lotCursorMap;
  }, [paginationState.lotCursorMap]);

  useEffect(() => {
    movementCursorMapRef.current = paginationState.movementCursorMap;
  }, [paginationState.movementCursorMap]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      const target = event.target;
      if (uiState.isIccatOpen && iccatDropdownRef.current && !iccatDropdownRef.current.contains(target)) {
        updateUiState({ isIccatOpen: false });
      }
      if (uiState.isStatusOpen && statusDropdownRef.current && !statusDropdownRef.current.contains(target)) {
        updateUiState({ isStatusOpen: false });
      }
      if (uiState.isExportOpen && exportDropdownRef.current && !exportDropdownRef.current.contains(target)) {
        updateUiState({ isExportOpen: false });
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [uiState.isExportOpen, uiState.isIccatOpen, uiState.isStatusOpen, updateUiState]);

  const loadSupplierHistoryOnce = useCallback(async () => {
    if (supplierHistoryLoadedRef.current) {
      return dataState.supplierHistory;
    }
    if (supplierHistoryPromiseRef.current) {
      return supplierHistoryPromiseRef.current;
    }
    const promise = (async () => {
      try {
        const result = await fetchSuppliers({ pageSize: "10000" });
        if (!result.ok) {
          throw new Error("Failed to load supplier history");
        }
        const payload = result.data;
        const records = payload?.data ?? [];

        const historyMap = new Map();
        records.forEach((record) => {
          if (!record.SKU_CODE) return;

          if (!historyMap.has(record.SKU_CODE)) {
            historyMap.set(record.SKU_CODE, new Map()); // SupplierCode -> Info
          }
          const skuMap = historyMap.get(record.SKU_CODE);

          if (!skuMap.has(record.AP_CODE)) {
            skuMap.set(record.AP_CODE, {
              AP_CODE: record.AP_CODE,
              AP_NAME: record.AP_NAME,
              DI_DATE: record.DI_DATE,
              dateVal: parseDate(record.DI_DATE),
              PRICE: record.TRD_U_PRC,
              QTY: record.TRD_QTY,
              SELL_AMOUNT: record.TRD_B_SELL,
              VAT_AMOUNT: record.TRD_B_VAT,
              AMOUNT: record.TRD_B_AMT,
              UNIT: record.TRD_UTQNAME
            });
          } else {
            const existing = skuMap.get(record.AP_CODE);
            const newDateVal = parseDate(record.DI_DATE);
            if (newDateVal > existing.dateVal) {
              existing.DI_DATE = record.DI_DATE;
              existing.dateVal = newDateVal;
              existing.PRICE = record.TRD_U_PRC;
              existing.QTY = record.TRD_QTY;
              existing.SELL_AMOUNT = record.TRD_B_SELL;
              existing.VAT_AMOUNT = record.TRD_B_VAT;
              existing.AMOUNT = record.TRD_B_AMT;
              existing.UNIT = record.TRD_UTQNAME;
            }
          }
        });

        // Flatten to sorted arrays per SKU
        const finalMap = new Map();
        historyMap.forEach((skuMap, skuCode) => {
          const list = Array.from(skuMap.values()).sort((a, b) => b.dateVal - a.dateVal);
          finalMap.set(skuCode, list);
        });
        updateDataState({ supplierHistory: finalMap });
        supplierHistoryLoadedRef.current = true;
        return finalMap;
      } catch (err) {
        console.error("Failed to load supplier history", err);
        throw err;
      } finally {
        supplierHistoryPromiseRef.current = null;
      }
    })();
    supplierHistoryPromiseRef.current = promise;
    return promise;
  }, [dataState.supplierHistory, updateDataState]);

  const openHistoryModal = useCallback(async (skuCode, skuName) => {
    updateUiState({
      supplierHistoryLoading: true,
      isHistoryModalOpen: true,
      selectedSkuForHistory: { skuCode, skuName, history: [] }
    });
    try {
      const historyMap = await loadSupplierHistoryOnce();
      const history = historyMap.get(skuCode) || [];
      updateUiState({
        selectedSkuForHistory: { skuCode, skuName, history },
      });
    } catch (error) {
      updateUiState({
        selectedSkuForHistory: { skuCode, skuName, history: [] },
      });
    } finally {
      updateUiState({ supplierHistoryLoading: false });
    }
  }, [loadSupplierHistoryOnce, updateUiState]);

  // Background load supplier history for summary view (fills "ข้อมูลการซื้อ" columns)
  useEffect(() => {
    if (activeView !== "summary" || !canViewSummary) {
      return;
    }
    if (supplierHistoryLoadedRef.current || supplierHistoryPromiseRef.current) {
      return;
    }
    const run = () => {
      loadSupplierHistoryOnce().catch((err) => {
        console.error("Lazy load supplier history failed", err);
      });
    };
    if (typeof requestIdleCallback !== "undefined") {
      const id = requestIdleCallback(run);
      return () => {
        if (typeof cancelIdleCallback === "function") {
          cancelIdleCallback(id);
        }
      };
    }
    const timer = setTimeout(run, 0);
    return () => clearTimeout(timer);
  }, [activeView, canViewSummary, loadSupplierHistoryOnce]);
  const iccatCodesList = filterState.iccatOptions.length
    ? filterState.iccatOptions.map((option) => option.code)
    : DEFAULT_ICCAT_CODES;
  const iccatNameByCode = useMemo(() => {
    const mapping = new Map();
    filterState.iccatOptions.forEach((option) => {
      if (option?.code) {
        mapping.set(option.code, option.name || "");
      }
    });
    return mapping;
  }, [filterState.iccatOptions]);

  const buildCacheKey = useCallback((view, page, cursorValue, params) => {
    const keyParams = new URLSearchParams(params.toString());
    keyParams.set("page", page.toString());
    keyParams.set("pageSize", paginationState.pagination.pageSize.toString());
    if (cursorValue) {
      keyParams.set("cursor", cursorValue);
    }
    return `${view}::${keyParams.toString()}`;
  }, [paginationState.pagination.pageSize]);

  const getCachedPayload = useCallback((cacheKey) => {
    if (!cacheKey) return null;
    return pageCacheRef.current.get(cacheKey) || null;
  }, []);

  const setCachedPayload = useCallback((cacheKey, payload) => {
    if (!cacheKey || !payload) return;
    pageCacheRef.current.set(cacheKey, payload);
  }, []);

  const fetchWithDedupe = useCallback(async (cacheKey, fetcherFn) => {
    const inFlight = inFlightRef.current.get(cacheKey);
    if (inFlight) {
      return inFlight;
    }
    const promise = (async () => {
      try {
        return await fetcherFn();
      } finally {
        inFlightRef.current.delete(cacheKey);
      }
    })();
    inFlightRef.current.set(cacheKey, promise);
    return promise;
  }, []);

  const prefetchPage = useCallback(async (view, page, cursorValue, params, fetcherFn) => {
    if (!cursorValue && page > 1) return null;
    const cacheKey = buildCacheKey(view, page, cursorValue, params);
    if (pageCacheRef.current.has(cacheKey)) return pageCacheRef.current.get(cacheKey);

    try {
      const payload = await fetchWithDedupe(cacheKey, () => fetcherFn(page, cursorValue));
      if (payload) {
        setCachedPayload(cacheKey, payload);
      }
      return payload;
    } catch (error) {
      // Silent prefetch failure
      return null;
    }
  }, [buildCacheKey, fetchWithDedupe, setCachedPayload]);

  const buildLotParams = useCallback((page, cursorValue) => {
    const params = new URLSearchParams();
    const selectedRawCodes = filterState.selectedIccat.filter((code) => RAW_MATERIAL_COST_CODES.includes(code));
    const iccatCodesParam = selectedRawCodes.length
      ? selectedRawCodes.join(",")
      : RAW_MATERIAL_COST_CODES.join(",");
    params.append("page", page.toString());
    params.append("pageSize", paginationState.pagination.pageSize.toString());
    if (filterState.brandCodes.trim()) {
      params.append("brandCodes", filterState.brandCodes.trim());
    }
    params.append("iccatCodes", iccatCodesParam);
    if (filterState.lotWarehouseCode) {
      params.append("warehouseCode", filterState.lotWarehouseCode);
    }
    if (filterState.lotCostStatus && filterState.lotCostStatus !== "all") {
      params.append("costStatus", filterState.lotCostStatus);
    }
    if (appliedSkuNameRef.current) {
      params.append("skuName", appliedSkuNameRef.current);
    }
    if (cursorValue) {
      params.append("cursor", cursorValue);
    }
    params.append("view", "lot");
    params.append("positiveOnly", "true");
    if (skipDeduction) {
      params.append("skipDeduction", "true");
    }
    return params;
  }, [
    filterState.brandCodes,
    filterState.lotCostStatus,
    filterState.lotWarehouseCode,
    filterState.selectedIccat,
    paginationState.pagination.pageSize,
    skipDeduction,
  ]);

  const buildSummaryParams = useCallback(() => {
    const params = new URLSearchParams();
    const iccatCodesParam = filterState.selectedIccat.length ? filterState.selectedIccat.join(",") : "";
    if (filterState.brandCodes.trim()) {
      params.append("brandCodes", filterState.brandCodes.trim());
    }
    params.append("iccatCodes", iccatCodesParam);
    if (appliedSkuNameRef.current) {
      params.append("skuName", appliedSkuNameRef.current);
    }
    return params;
  }, [filterState.brandCodes, filterState.selectedIccat]);

  const buildMovementParams = useCallback(() => {
    const params = new URLSearchParams();
    const iccatCodesParam = filterState.selectedIccat.length ? filterState.selectedIccat.join(",") : "";
    if (filterState.brandCodes.trim()) {
      params.append("brandCodes", filterState.brandCodes.trim());
    }
    params.append("iccatCodes", iccatCodesParam);
    if (appliedSkuNameRef.current) {
      params.append("skuName", appliedSkuNameRef.current);
    }
    if (filterState.movementDateFrom) {
      params.append("dateFrom", filterState.movementDateFrom);
    }
    if (filterState.movementDateTo) {
      params.append("dateTo", filterState.movementDateTo);
    }
    return params;
  }, [
    filterState.brandCodes,
    filterState.selectedIccat,
    filterState.movementDateFrom,
    filterState.movementDateTo,
  ]);

  const fetchLotMaterials = useCallback(async (page = 1, cursorValue) => {
    const params = buildLotParams(page, cursorValue);
    const result = await fetchRawMaterials(params);
    if (!result.ok) {
      throw new Error("Unable to load raw materials data.");
    }
    return result.data;
  }, [buildLotParams]);

  const fetchSummaryMaterials = useCallback(async (page = 1, cursorValue) => {
    const params = buildSummaryParams();
    params.append("page", page.toString());
    params.append("pageSize", paginationState.pagination.pageSize.toString());
    if (cursorValue) {
      params.append("cursor", cursorValue);
    }
    const result = await fetchRawMaterialsSummary(params);
    if (!result.ok) {
      throw new Error("Unable to load raw materials data.");
    }
    return result.data;
  }, [buildSummaryParams, paginationState.pagination.pageSize]);

  const loadRawMaterials = useCallback(async (page = 1, options = {}) => {
    const cursorOverride = Object.prototype.hasOwnProperty.call(options, "cursor")
      ? options.cursor
      : undefined;
    const resetCursors = Boolean(options.resetCursors);
    const cursorValue = cursorOverride !== undefined ? cursorOverride : lotCursorMapRef.current[page];
    const params = buildLotParams(page, cursorValue);

    const cacheKey = buildCacheKey("lot", page, cursorValue, params);
    const cachedPayload = getCachedPayload(cacheKey);
    updateUiState({ loading: !cachedPayload, errorMessage: "" });
    const logPerfLot = createPerfLogger("raw-materials:lot fetch");
    try {
      if (cachedPayload) {
        const nextCursor = cachedPayload?.cursor?.next ?? null;
        startTransition(() => {
          updateDataState({
            records: cachedPayload?.data ?? [],
            lotSummary: cachedPayload?.summary ?? EMPTY_LOT_SUMMARY,
          });
          updatePaginationState(prev => ({
            ...prev,
            pagination: { ...(cachedPayload?.pagination ?? prev.pagination), page },
            lotCursorInfo: cachedPayload?.cursor ?? { next: null, hasMore: false },
            lotCursorMap: {
              ...prev.lotCursorMap,
              [page]: cursorValue ?? null,
              [page + 1]: nextCursor
            }
          }));
        });
      } else {
        updatePaginationState(prev => ({
          ...prev,
          pagination: { ...prev.pagination, page }
        }));
      }

      const payload = await fetchWithDedupe(cacheKey, () => fetchLotMaterials(page, cursorValue));
      const nextCursor = payload?.cursor?.next ?? null;
      logPerfLot({ page, count: payload?.data?.length ?? 0 });
      setCachedPayload(cacheKey, payload);
      startTransition(() => {
        updateDataState({
          records: payload?.data ?? [],
          lotSummary: payload?.summary ?? EMPTY_LOT_SUMMARY,
        });
        updatePaginationState(prev => ({
          ...prev,
          pagination: { ...(payload?.pagination ?? prev.pagination), page },
          lotCursorInfo: payload?.cursor ?? { next: null, hasMore: false },
          lotCursorMap: {
            ...prev.lotCursorMap,
            [page]: cursorValue ?? null,
            [page + 1]: nextCursor
          }
        }));
      });

    } catch (error) {
      updateUiState({ errorMessage: error?.message || "Failed to load data." });
    } finally {
      updateUiState({ loading: false });
    }
  }, [
    buildCacheKey,
    buildLotParams,
    fetchLotMaterials,
    fetchWithDedupe,
    getCachedPayload,
    setCachedPayload,
    startTransition,
    updateDataState,
    updatePaginationState,
    updateUiState,
  ]);

  const loadSummaryMaterials = useCallback(async (page = 1, options = {}) => {
    const cursorOverride = Object.prototype.hasOwnProperty.call(options, "cursor")
      ? options.cursor
      : undefined;
    const resetCursors = Boolean(options.resetCursors);
    const cursorValue = cursorOverride !== undefined ? cursorOverride : summaryCursorMapRef.current[page];
    const params = buildSummaryParams();
    const cacheKey = buildCacheKey("summary", page, cursorValue, params);
    const cachedPayload = getCachedPayload(cacheKey);
    updateUiState({ loading: !cachedPayload, errorMessage: "" });
    const logPerfSummary = createPerfLogger("raw-materials:summary fetch");
    try {
      if (cachedPayload) {
        const nextCursor = cachedPayload?.cursor?.next ?? null;
        startTransition(() => {
          updateDataState({ summaryRecords: cachedPayload?.data ?? [] });
          updatePaginationState(prev => ({
            ...prev,
            pagination: { ...(cachedPayload?.pagination ?? prev.pagination), page },
            summaryCursorInfo: cachedPayload?.cursor ?? { next: null, hasMore: false },
            summaryCursorMap: {
              ...prev.summaryCursorMap,
              [page]: cursorValue ?? null,
              [page + 1]: nextCursor
            }
          }));
        });
      } else {
        updatePaginationState(prev => ({
          ...prev,
          pagination: { ...prev.pagination, page }
        }));
      }

      const payload = await fetchWithDedupe(cacheKey, () => fetchSummaryMaterials(page, cursorValue));
      const nextCursor = payload?.cursor?.next ?? null;
      logPerfSummary({ page, count: payload?.data?.length ?? 0 });
      setCachedPayload(cacheKey, payload);
      startTransition(() => {
        updateDataState({ summaryRecords: payload?.data ?? [] });
        updatePaginationState(prev => ({
          ...prev,
          pagination: { ...(payload?.pagination ?? prev.pagination), page },
          summaryCursorInfo: payload?.cursor ?? { next: null, hasMore: false },
          summaryCursorMap: {
            ...prev.summaryCursorMap,
            [page]: cursorValue ?? null,
            [page + 1]: nextCursor
          }
        }));
      });

      const nextPage = page + 1;
      if (nextCursor) {
        prefetchPage("summary", nextPage, nextCursor, params, fetchSummaryMaterials);
      }
      const prevPage = page - 1;
      const prevCursor = summaryCursorMapRef.current[prevPage];
      if (prevPage >= 1 && prevCursor !== undefined) {
        prefetchPage("summary", prevPage, prevCursor, params, fetchSummaryMaterials);
      }
    } catch (error) {
      updateUiState({ errorMessage: error?.message || "Failed to load data." });
    } finally {
      updateUiState({ loading: false });
    }
  }, [
    buildCacheKey,
    buildSummaryParams,
    fetchSummaryMaterials,
    fetchWithDedupe,
    getCachedPayload,
    prefetchPage,
    setCachedPayload,
    startTransition,
    updateDataState,
    updatePaginationState,
    updateUiState
  ]);

  const fetchMovementMaterials = useCallback(async (page = 1, cursorValue) => {
    const params = buildMovementParams();
    params.append("page", page.toString());
    params.append("pageSize", paginationState.pagination.pageSize.toString());
    if (cursorValue) {
      params.append("cursor", cursorValue);
    }
    const result = await fetchRawMaterialsMovement(params);
    if (!result.ok) {
      throw new Error("Unable to load raw materials movement.");
    }
    const payload = result.data;
    return payload;
  }, [buildMovementParams, paginationState.pagination.pageSize]);

  const loadMovementMaterials = useCallback(async (page = 1, options = {}) => {
    const cursorOverride = Object.prototype.hasOwnProperty.call(options, "cursor")
      ? options.cursor
      : undefined;
    const resetCursors = Boolean(options.resetCursors);
    const cursorValue = cursorOverride !== undefined ? cursorOverride : movementCursorMapRef.current[page];
    const params = buildMovementParams();
    const cacheKey = buildCacheKey("movement", page, cursorValue, params);
    const cachedPayload = getCachedPayload(cacheKey);
    updateUiState({ loading: !cachedPayload, errorMessage: "" });
    try {
      if (cachedPayload) {
        const nextCursor = cachedPayload?.cursor?.next ?? null;
        startTransition(() => {
          updateDataState({ movementRecords: cachedPayload?.data ?? [] });
          updatePaginationState(prev => ({
            ...prev,
            pagination: { ...(cachedPayload?.pagination ?? prev.pagination), page },
            movementCursorInfo: cachedPayload?.cursor ?? { next: null, hasMore: false },
            movementCursorMap: {
              ...prev.movementCursorMap,
              [page]: cursorValue ?? null,
              [page + 1]: nextCursor
            }
          }));
        });
      } else {
        updatePaginationState(prev => ({
          ...prev,
          pagination: { ...prev.pagination, page }
        }));
      }

      const payload = await fetchWithDedupe(cacheKey, () => fetchMovementMaterials(page, cursorValue));
      const nextCursor = payload?.cursor?.next ?? null;
      setCachedPayload(cacheKey, payload);
      startTransition(() => {
        updateDataState({ movementRecords: payload?.data ?? [] });
        updatePaginationState(prev => ({
          ...prev,
          pagination: { ...(payload?.pagination ?? prev.pagination), page },
          movementCursorInfo: payload?.cursor ?? { next: null, hasMore: false },
          movementCursorMap: {
            ...prev.movementCursorMap,
            [page]: cursorValue ?? null,
            [page + 1]: nextCursor
          }
        }));
      });

      const nextPage = page + 1;
      if (nextCursor) {
        prefetchPage("movement", nextPage, nextCursor, params, fetchMovementMaterials);
      }
      const prevPage = page - 1;
      const prevCursor = movementCursorMapRef.current[prevPage];
      if (prevPage >= 1 && prevCursor !== undefined) {
        prefetchPage("movement", prevPage, prevCursor, params, fetchMovementMaterials);
      }
    } catch (error) {
      updateUiState({ errorMessage: error?.message || "Failed to load data." });
    } finally {
      updateUiState({ loading: false });
    }
  }, [
    buildCacheKey,
    buildMovementParams,
    fetchMovementMaterials,
    fetchWithDedupe,
    getCachedPayload,
    prefetchPage,
    setCachedPayload,
    startTransition,
    updateDataState,
    updatePaginationState,
    updateUiState
  ]);

  const fetchPreviousYearAverageUsage = useCallback(async () => {
    const exportPageSize = 1000;
    let page = 1;
    let cursorValue = null;
    let hasMore = true;
    const totalsBySku = new Map();
    const { year, from, to } = getPreviousYearRange();
    const daysInYear = getDaysInYear(year);

    while (hasMore) {
      const params = buildSummaryParams();
      params.append("page", page.toString());
      params.append("pageSize", exportPageSize.toString());
      params.append("dateFrom", from);
      params.append("dateTo", to);
      if (cursorValue) {
        params.append("cursor", cursorValue);
      }

      const result = await fetchRawMaterialsMovement(params);
      if (!result.ok) {
        throw new Error("Unable to load raw materials movement.");
      }
      const payload = result.data;
      const data = payload?.data ?? [];
      data.forEach((record) => {
        const skuCode = record.SKU_CODE ?? "";
        if (!skuCode) return;
        const outQty = toNumberOrZero(record.OUT_QTY);
        totalsBySku.set(skuCode, (totalsBySku.get(skuCode) ?? 0) + outQty);
      });
      const cursorInfo = payload?.cursor ?? {};
      const nextCursor = cursorInfo.next ?? null;
      hasMore = Boolean(cursorInfo.hasMore);
      if (!nextCursor) {
        hasMore = false;
      }
      cursorValue = nextCursor;
      page += 1;
    }

    const avgBySku = new Map();
    totalsBySku.forEach((total, skuCode) => {
      avgBySku.set(skuCode, total / daysInYear);
    });
    return avgBySku;
  }, [buildSummaryParams]);

  const loadMinMax = useCallback(async () => {
    try {
      const result = await fetchSkuMinMax({ pageSize: "10000" });
      if (!result.ok) {
        // Silent fail or minimal log
        return;
      }
      const payload = result.data;
      const nextMap = new Map();
      (payload?.data ?? []).forEach((row) => {
        if (row?.SKU_CODE) {
          nextMap.set(row.SKU_CODE, {
            SKU_MIN_QTY: row.SKU_MIN_QTY,
            SKU_MAX_QTY: row.SKU_MAX_QTY,
            SKU_MIN_ORDER: row.SKU_MIN_ORDER,
            PACK_QTY: row.UTQ_QTY_1,
            SKU_LEAD_TIME: row.SKU_LEAD_TIME,
          });
        }
      });
      updateDataState({ minMaxBySku: nextMap });
    } catch (error) {
      console.error("Failed to load min-max", error);
      updateDataState({ minMaxBySku: new Map() });
    }
  }, [updateDataState]);

  useEffect(() => {
    if (hasLoadedInitial.current) {
      return;
    }
    if (!permissionState.loaded) {
      return;
    }
    const loadIccatOptions = async () => {
      try {
        const result = await fetchIccatTypes({});
        if (!result.ok) {
          throw new Error("Unable to load types.");
        }
        const payload = result.data;
        const options = (payload?.data ?? [])
          .filter((item) => activeView !== "lot" || RAW_MATERIAL_COST_CODES.includes(item.ICCAT_CODE))
          .map((item) => ({
          code: item.ICCAT_CODE,
          name: item.ICCAT_NAME,
          }));
        updateFilterState({ iccatOptions: options });
        if (!hasCustomIccat.current && options.length) {
          updateFilterState({ selectedIccat: options.map((item) => item.code) });
        }
      } catch (error) {
        const fallbackCodes = activeView === "lot" ? RAW_MATERIAL_COST_CODES : DEFAULT_ICCAT_CODES;
        updateFilterState({
          iccatOptions: fallbackCodes.map((code) => ({ code, name: "" })),
          selectedIccat: fallbackCodes,
        });
      }
    };

    if (activeView === "summary") {
      loadSummaryMaterials(1, { cursor: null, resetCursors: true });
    } else if (activeView === "movement") {
      loadMovementMaterials(1, { cursor: null, resetCursors: true });
    } else {
      loadRawMaterials(1, { cursor: null, resetCursors: true });
    }
    loadIccatOptions();
    if (canViewSummary) {
      loadMinMax();
    }
    hasLoadedInitial.current = true;
  }, [
    activeView,
    canViewLot,
    canViewMovement,
    canViewSummary,
    loadRawMaterials,
    loadSummaryMaterials,
    loadMovementMaterials,
    loadMinMax,
    permissionState.loaded,
    updateUiState,
    updateFilterState
  ]);

  useEffect(() => {
    if (!hasLoadedInitial.current) {
      return;
    }
    if (skipNextViewReload.current) {
      skipNextViewReload.current = false;
      return;
    }
    if (!permissionState.loaded) {
      return;
    }
    if (activeView === "summary" && !canViewSummary) {
      return;
    }
    if (activeView === "movement" && !canViewMovement) {
      return;
    }
    if (activeView === "lot" && !canViewLot) {
      return;
    }

    if (activeView === "summary") {
      loadSummaryMaterials(1, { cursor: null, resetCursors: true });
    } else if (activeView === "movement") {
      loadMovementMaterials(1, { cursor: null, resetCursors: true });
    } else {
      loadRawMaterials(1, { cursor: null, resetCursors: true });
    }
  }, [
    activeView,
    canViewLot,
    canViewMovement,
    canViewSummary,
    loadMovementMaterials,
    loadRawMaterials,
    loadSummaryMaterials,
    permissionState.loaded,
  ]);

  useEffect(() => {
    if (activeView !== "summary" || !canViewSummary) {
      return;
    }
    if (!canViewMovement) {
      updateDataState({ avgUsageBySku: new Map() });
      updateUiState({ avgUsageLoading: false });
      return;
    }

    let isActive = true;
    const controller = new AbortController();

    const run = () => {
      startTransition(() => {
        updateUiState({ avgUsageLoading: true });
        updateDataState({ avgUsageBySku: new Map() });
        fetchPreviousYearAverageUsage()
          .then((avgMap) => {
            if (isActive && !controller.signal.aborted) {
              updateDataState({ avgUsageBySku: avgMap });
            }
          })
          .catch((error) => {
            console.error("Failed to load average usage", error);
            if (isActive && !controller.signal.aborted) {
              updateDataState({ avgUsageBySku: new Map() });
            }
          })
          .finally(() => {
            if (isActive && !controller.signal.aborted) {
              updateUiState({ avgUsageLoading: false });
            }
          });
      });
    };

    if (typeof requestIdleCallback !== "undefined") {
      const idleId = requestIdleCallback(run);
      return () => {
        isActive = false;
        controller.abort();
        if (typeof cancelIdleCallback === "function") {
          cancelIdleCallback(idleId);
        }
      };
    }

    run();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [activeView, canViewSummary, canViewMovement, fetchPreviousYearAverageUsage, updateDataState, updateUiState, startTransition]);

  const formatDateTime = (date) => {
    return `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())}`;
  };

  const formatDateDisplay = useCallback((dateStr) => {
    if (!dateStr) return "-";
    try {
      let date;
      if (dateStr.includes("T")) {
        date = new Date(dateStr);
      } else if (dateStr.includes("/")) {
        const parts = dateStr.split("/");
        date = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      } else {
        return dateStr;
      }

      if (isNaN(date.getTime())) return dateStr;

      const d = String(date.getDate()).padStart(2, "0");
      const m = String(date.getMonth() + 1).padStart(2, "0");
      const y = date.getFullYear();
      return `${d}-${m}-${y}`;
    } catch (e) {
      return dateStr;
    }
  }, []);

  const formatQtyDisplay = useCallback((value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return value ?? "-";
    }
    return parsed.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }, []);

  const isExcludedDept = useCallback(
    (row) => String(row?.ICDEPT_CODE || "").trim().toUpperCase() === "NM",
    []
  );

  const formatTruncNumberDisplay = useCallback((value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return value ?? "-";
    }
    return parsed.toLocaleString(undefined, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    });
  }, []);

  const formatWholeNumberDisplay = useCallback((value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return value ?? "-";
    }
    return Math.round(parsed).toLocaleString();
  }, []);

  const formatCeilNumberDisplay = useCallback((value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return value ?? "-";
    }
    return Math.ceil(parsed).toLocaleString();
  }, []);

  const formatCeilToTenDisplay = useCallback((value) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return value ?? "-";
    }
    return (Math.ceil(parsed / 10) * 10).toLocaleString();
  }, []);

  const parseDateToObject = (dateStr) => {
    if (!dateStr) return null;
    if (dateStr instanceof Date && !Number.isNaN(dateStr.getTime())) {
      return dateStr;
    }
    const text = dateStr.toString();
    if (text.includes("T")) {
      const parsed = new Date(text);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    if (text.includes("/")) {
      const parts = text.split("/");
      if (parts.length === 3) {
        const [day, month, year] = parts.map(Number);
        const parsed = new Date(year, month - 1, day);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      }
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const parsed = new Date(`${text}T00:00:00`);
      return Number.isNaN(parsed.getTime()) ? null : parsed;
    }
    return null;
  };

  const formatDateDDMMYYYY = (dateObj) => {
    if (!dateObj || Number.isNaN(dateObj.getTime?.())) return "";
    const pad = (value) => String(value).padStart(2, "0");
    return `${pad(dateObj.getDate())}/${pad(dateObj.getMonth() + 1)}/${dateObj.getFullYear()}`;
  };

  const formatDateForCsv = (dateStr) => {
    const parsed = parseDateToObject(dateStr);
    return parsed ? formatDateDDMMYYYY(parsed) : (dateStr ?? "");
  };

  const buildExportParams = (page, pageSize, cursorValue) => {
    const params = new URLSearchParams();
    const selectedRawCodes = selectedIccat.filter((code) => RAW_MATERIAL_COST_CODES.includes(code));
    const iccatCodesParam = activeView === "lot"
      ? (selectedRawCodes.length ? selectedRawCodes.join(",") : RAW_MATERIAL_COST_CODES.join(","))
      : (selectedIccat.length ? selectedIccat.join(",") : "");
    params.append("page", page.toString());
    params.append("pageSize", pageSize.toString());
    if (brandCodes.trim()) {
      params.append("brandCodes", brandCodes.trim());
    }
    params.append("iccatCodes", iccatCodesParam);
    if (activeView === "lot" && lotWarehouseCode) {
      params.append("warehouseCode", lotWarehouseCode);
    }
    if (activeView === "lot" && lotCostStatus && lotCostStatus !== "all") {
      params.append("costStatus", lotCostStatus);
    }
    if (appliedSkuNameRef.current) {
      params.append("skuName", appliedSkuNameRef.current);
    }
    if (cursorValue) {
      params.append("cursor", cursorValue);
    }
    params.append("positiveOnly", "true");
    return params;
  };

  const getLeadTimeDays = useCallback((minMax) => (
    Number.isFinite(Number(minMax?.SKU_LEAD_TIME))
      ? Number(minMax.SKU_LEAD_TIME) + 2
      : null
  ), []);

  const getAvgUsageNumber = useCallback((avgUsageValue) => (
    Number.isFinite(Number(avgUsageValue))
      ? Math.ceil(Number(avgUsageValue))
      : null
  ), []);

  const getLeadTimeDemand = useCallback((avgUsageValue, minMax) => {
    const leadTimeDays = getLeadTimeDays(minMax);
    const avgUsageNumber = getAvgUsageNumber(avgUsageValue);
    return leadTimeDays !== null && avgUsageNumber !== null
      ? avgUsageNumber * leadTimeDays
      : null;
  }, [getAvgUsageNumber, getLeadTimeDays]);

  const getStatusForRow = useCallback((row) => {
    const minMax = dataState.minMaxBySku.get(row.SKU_CODE);
    const avgUsageValue = dataState.avgUsageBySku.get(row.SKU_CODE);
    const remainingQty = toNumberOrZero(row.QTY);
    const leadTimeDemand = getLeadTimeDemand(avgUsageValue, minMax);
    if (leadTimeDemand === null) {
      return "-";
    }
    return remainingQty <= leadTimeDemand ? "ต้องสั่งซื้อ" : "ปกติ";
  }, [dataState.minMaxBySku, dataState.avgUsageBySku, getLeadTimeDemand]);

  const calculateActualUsage = (outQty, inReturnQty) => {
    const outValue = toNumberValue(outQty);
    const inReturnValue = toNumberValue(inReturnQty);
    if (typeof outValue !== "number" || typeof inReturnValue !== "number") {
      return null;
    }
    return outValue - inReturnValue;
  };

  const downloadBlob = (blob, filename) => {
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  const buildMetadataRows = () => {
    const reportLabel = activeView === "summary"
      ? "สินค้าคงเหลือคลังวัตถุดิบ (รวม)"
      : activeView === "movement"
        ? "ความเคลื่อนไหวสต็อคคลังวัตถุดิบ"
        : "สินค้าคงเหลือคลังวัตถุดิบ (แยก LOT)";
    const rows = [
      ["รายงาน", reportLabel],
      ["วันเวลาออกรายงาน", formatDateTime(new Date())],
    ];
    if (activeView === "movement") {
      const rangeParts = [movementDateFrom, movementDateTo].filter(Boolean).map(formatDateDisplay);
      rows.push(["ช่วงวันที่", rangeParts.length ? rangeParts.join(" - ") : "-"]);
    }
    rows.push(
      ["หมวดสินค้า (ICCAT)", selectedIccat.length ? selectedIccat.join(", ") : "ทั้งหมด"],
      ["Brand Codes", brandCodes.trim() || "ทั้งหมด"],
      ["ค้นหา", skuName.trim() || "-"]
    );
    return rows;
  };

  const addReportSheet = (workbook, {
    sheetName,
    headers,
    rows,
    metadataRows,
    reportTitle,
    columnSettings,
  }) => {
    const worksheet = workbook.addWorksheet(sheetName);
    const totalColumns = headers.length;

    if (reportTitle) {
      worksheet.headerFooter = {
        oddHeader: `&C&"Calibri,Bold"${reportTitle}`,
      };
    }

    const headerRow = worksheet.addRow(headers);
    headerRow.height = 20;
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF102C57" } };
    headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    headerRow.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FF1E293B" } },
        left: { style: "thin", color: { argb: "FF1E293B" } },
        bottom: { style: "thin", color: { argb: "FF1E293B" } },
        right: { style: "thin", color: { argb: "FF1E293B" } },
      };
    });

    rows.forEach((row) => {
      worksheet.addRow(row);
    });

    headers.forEach((_, index) => {
      const column = worksheet.getColumn(index + 1);
      const settings = columnSettings?.[index];
      column.width = settings?.width ?? 16;
      if (settings?.numFmt) {
        column.numFmt = settings.numFmt;
        column.alignment = { ...(column.alignment || {}), horizontal: settings.align ?? "right" };
      }
    });

    const dataEndRow = headerRow.number + rows.length;
    worksheet.views = [{ state: "frozen", ySplit: 1 }];
    worksheet.autoFilter = {
      from: { row: headerRow.number, column: 1 },
      to: { row: dataEndRow, column: headers.length },
    };

    if (metadataRows?.length) {
      worksheet.addRow([]);
      metadataRows.forEach(([label, value]) => {
        const row = worksheet.addRow([label, value]);
        row.getCell(1).font = { bold: true };
        if (totalColumns > 2) {
          worksheet.mergeCells(row.number, 2, row.number, totalColumns);
        }
      });
    }
  };

  const exportWorkbookXlsx = async ({ sheets, filename }) => {
    const excelModule = await import("exceljs/dist/exceljs.min.js");
    const ExcelJS = excelModule.default ?? excelModule;

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "KPF Quickplan";
    workbook.created = new Date();

    sheets.forEach((sheet) => addReportSheet(workbook, sheet));

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    downloadBlob(blob, filename);
  };

  const fetchAllRawMaterials = async () => {
    const exportPageSize = 1000;
    let page = 1;
    let cursorValue = null;
    let hasMore = true;
    const allRecords = [];

    while (hasMore) {
      const params = buildExportParams(page, exportPageSize, cursorValue);
      const result = await fetchRawMaterials(params);
      if (!result.ok) {
        throw new Error("Unable to load raw materials data.");
      }
      const payload = result.data;
      const data = payload?.data ?? [];
      allRecords.push(...data);
      const cursorInfo = payload?.cursor ?? {};
      const nextCursor = cursorInfo.next ?? null;
      hasMore = Boolean(cursorInfo.hasMore);
      if (!nextCursor) {
        hasMore = false;
      }
      cursorValue = nextCursor;
      page += 1;
    }

    return allRecords;
  };

  const fetchAllSummaryMaterials = useCallback(async () => {
    const exportPageSize = 1000;
    let page = 1;
    let cursorValue = null;
    let hasMore = true;
    const allRecords = [];

    while (hasMore) {
      const params = buildSummaryParams();
      params.append("page", page.toString());
      params.append("pageSize", exportPageSize.toString());
      if (cursorValue) {
        params.append("cursor", cursorValue);
      }
      const result = await fetchRawMaterialsSummary(params);
      if (!result.ok) {
        throw new Error("Unable to load raw materials summary.");
      }
      const payload = result.data;
      const data = payload?.data ?? [];
      allRecords.push(...data);
      const cursorInfo = payload?.cursor ?? {};
      const nextCursor = cursorInfo.next ?? null;
      hasMore = Boolean(cursorInfo.hasMore);
      if (!nextCursor) {
        hasMore = false;
      }
      cursorValue = nextCursor;
      page += 1;
    }

    return allRecords;
  }, [buildSummaryParams]);

  const fetchAllMovementMaterials = async () => {
    const exportPageSize = 1000;
    let page = 1;
    let cursorValue = null;
    let hasMore = true;
    const allRecords = [];

    while (hasMore) {
      const params = buildMovementParams();
      params.append("page", page.toString());
      params.append("pageSize", exportPageSize.toString());
      if (cursorValue) {
        params.append("cursor", cursorValue);
      }
      const result = await fetchRawMaterialsMovement(params);
      if (!result.ok) {
        throw new Error("Unable to load raw materials movement.");
      }
      const payload = result.data;
      const data = payload?.data ?? [];
      allRecords.push(...data);
      const cursorInfo = payload?.cursor ?? {};
      const nextCursor = cursorInfo.next ?? null;
      hasMore = Boolean(cursorInfo.hasMore);
      if (!nextCursor) {
        hasMore = false;
      }
      cursorValue = nextCursor;
      page += 1;
    }

    return allRecords;
  };

  const isSummaryStatusFiltered = activeView === "summary" && filterState.statusFilter !== "all";

  useEffect(() => {
    if (!isSummaryStatusFiltered || !canViewSummary) {
      return;
    }

    const params = buildSummaryParams();
    const key = params.toString();
    if (summaryFilterKeyRef.current === key && summaryFilterState.allRecords.length) {
      return;
    }

    let isActive = true;
    summaryFilterKeyRef.current = key;
    setSummaryFilterState((prev) => ({ ...prev, loading: true, key }));
    updateUiState({ loading: true, errorMessage: "" });

    fetchAllSummaryMaterials()
      .then((records) => {
        if (!isActive) return;
        setSummaryFilterState({ allRecords: records, loading: false, key });
        updateUiState({ loading: false });
      })
      .catch(() => {
        if (!isActive) return;
        setSummaryFilterState((prev) => ({ ...prev, loading: false }));
        updateUiState({ loading: false });
      });

    return () => {
      isActive = false;
    };
  }, [
    buildSummaryParams,
    canViewSummary,
    fetchAllSummaryMaterials,
    isSummaryStatusFiltered,
    summaryFilterState.allRecords.length,
    updateUiState,
  ]);

  const getStatusForRowWithMaps = (row, minMaxMap, avgUsageMap) => {
    const minMax = minMaxMap.get(row.SKU_CODE);
    const avgUsageValue = avgUsageMap.get(row.SKU_CODE);
    const remainingQty = toNumberOrZero(row.QTY);
    const leadTimeDemand = getLeadTimeDemand(avgUsageValue, minMax);
    if (leadTimeDemand === null) {
      return "-";
    }
    return remainingQty <= leadTimeDemand ? "ต้องสั่งซื้อ" : "ปกติ";
  };

  const buildSummaryExportData = (records, minMaxMap, avgUsageMap) => {
    const rows = [];
    records.forEach((row) => {
      if (isExcludedDept(row)) {
        return;
      }
      const minMax = minMaxMap.get(row.SKU_CODE);
      const avgUsageValue = avgUsageMap.get(row.SKU_CODE);
      const leadTimeDemand = getLeadTimeDemand(avgUsageValue, minMax);
      const minQtyValue = leadTimeDemand;
      const maxQtyValue = leadTimeDemand !== null
        ? leadTimeDemand * HOLD_DAYS
        : null;
      const statusText = getStatusForRowWithMaps(row, minMaxMap, avgUsageMap);
      if (statusFilter !== "all" && statusText !== statusFilter) {
        return;
      }
      const history = dataState.supplierHistory.get(row.SKU_CODE);
      const latestSup = history && history.length > 0 ? history[0] : null;
      const stockBreakdown = getLotQuantityBreakdown(row);
      rows.push({
        ...row,
        LARGE_UNIT_QTY: stockBreakdown.hasPackUnit && stockBreakdown.wholeStockUnits > 0
          ? stockBreakdown.wholeStockUnits
          : "",
        LARGE_UNIT_NAME: stockBreakdown.hasPackUnit && stockBreakdown.wholeStockUnits > 0
          ? stockBreakdown.stockUnitName
          : "",
        REMAINDER_QTY: stockBreakdown.valid ? stockBreakdown.remainderBaseQuantity : "",
        BASE_UNIT_NAME: stockBreakdown.baseUnitName || "",
        STANDARD_QTY: stockBreakdown.valid ? stockBreakdown.baseQuantity : "",
        STATUS: statusText,
        MIN_QTY_DISPLAY: minQtyValue !== null ? formatCeilToTenDisplay(minQtyValue) : "-",
        MAX_QTY_DISPLAY: maxQtyValue !== null ? formatCeilNumberDisplay(maxQtyValue) : "-",
        MIN_QTY_VALUE: minQtyValue !== null ? Math.ceil(minQtyValue / 10) * 10 : "",
        MAX_QTY_VALUE: maxQtyValue !== null ? Math.ceil(maxQtyValue) : "",
        MIN_ORDER: minMax?.SKU_MIN_ORDER ?? "",
        LEAD_TIME: minMax?.SKU_LEAD_TIME ?? "",
        LAST_SUP_CODE: latestSup?.AP_CODE ?? "",
        LAST_SUP_NAME: latestSup?.AP_NAME ?? "",
        LAST_PURCHASE_DATE: latestSup?.DI_DATE ?? "",
        LAST_PRICE: latestSup?.PRICE ?? "",
        LAST_UNIT: latestSup?.UNIT ?? "",
      });
    });
    return rows;
  };

  const handleExport = async (format) => {
    updateUiState({ isExportOpen: false });
    updateUiState({ exportLoading: true });
    updateUiState({ errorMessage: "" });

    try {
      const rawMaterialsPromise = activeView === "lot"
        ? fetchAllRawMaterials()
        : Promise.resolve([]);
      const summaryRecordsPromise = activeView === "summary"
        ? fetchAllSummaryMaterials()
        : Promise.resolve([]);
      const movementRecordsPromise = activeView === "movement"
        ? fetchAllMovementMaterials()
        : Promise.resolve([]);
      const avgUsagePromise = activeView === "summary" && canViewMovement
        ? fetchPreviousYearAverageUsage()
        : Promise.resolve(new Map());

      const [
        allRecords,
        summaryRecordsForExport,
        movementRecordsForExport,
        avgUsageForExport,
      ] = await Promise.all([
        rawMaterialsPromise,
        summaryRecordsPromise,
        movementRecordsPromise,
        avgUsagePromise,
      ]);
      const baseMetadataRows = buildMetadataRows();
      const timestamp = new Date();
      const filenameSuffix = `${timestamp.getFullYear()}${String(timestamp.getMonth() + 1).padStart(2, "0")}${String(timestamp.getDate()).padStart(2, "0")}_${String(timestamp.getHours()).padStart(2, "0")}${String(timestamp.getMinutes()).padStart(2, "0")}`;
      const viewLabel = activeView === "summary"
        ? "summary"
        : activeView === "movement"
          ? "movement"
          : "lot";
      const reportTitle = activeView === "summary"
        ? "สินค้าคงเหลือคลังวัตถุดิบ (รวม)"
        : activeView === "movement"
          ? "ความเคลื่อนไหวสต็อคคลังวัตถุดิบ"
          : "สินค้าคงเหลือคลังวัตถุดิบ (แยก LOT)";

      const skuInfoMap = new Map();
      const summaryExportData = activeView === "summary"
        ? buildSummaryExportData(summaryRecordsForExport, dataState.minMaxBySku, avgUsageForExport)
        : [];
      const skuSource = activeView === "summary"
        ? summaryExportData
        : activeView === "movement"
          ? movementRecordsForExport
          : allRecords;
      skuSource.forEach((record) => {
        const skuCode = record.SKU_CODE ?? "";
        if (!skuCode) return;
        if (!skuInfoMap.has(skuCode)) {
          skuInfoMap.set(skuCode, { SKU_CODE: skuCode, SKU_NAME: record.SKU_NAME ?? "" });
        }
      });
      const purchaseData = [];
      skuInfoMap.forEach((skuInfo, skuCode) => {
        const history = dataState.supplierHistory.get(skuCode) || [];
        history.forEach((entry) => {
          purchaseData.push({
            SKU_CODE: skuInfo.SKU_CODE,
            SKU_NAME: skuInfo.SKU_NAME,
            AP_CODE: entry.AP_CODE,
            AP_NAME: entry.AP_NAME,
            PRICE: entry.PRICE,
            UNIT: entry.UNIT,
            DI_DATE: entry.DI_DATE,
          });
        });
      });

      const purchaseHeaders = [
        "SKU Code",
        "SKU Name",
        "Supplier Code",
        "Supplier Name",
        "Purchase Date",
        "Price",
        "Unit",
      ];

      const purchaseRowsCsv = purchaseData.map((row) => [
        row.SKU_CODE,
        row.SKU_NAME,
        row.AP_CODE,
        row.AP_NAME,
        formatDateForCsv(row.DI_DATE),
        row.PRICE ?? "",
        row.UNIT ?? "",
      ]);

      const purchaseRowsXlsx = purchaseData.map((row) => [
        row.SKU_CODE,
        row.SKU_NAME,
        row.AP_CODE,
        row.AP_NAME,
        parseDateToObject(row.DI_DATE) || "",
        toNumberValue(row.PRICE),
        row.UNIT ?? "",
      ]);

      const purchaseMetadataRows = [
        ["รายงาน", "ประวัติการซื้อ (ทุกบริษัท)"],
        ...baseMetadataRows.slice(1),
        ["จำนวนรายการ", purchaseRowsXlsx.length.toLocaleString()],
      ];

      if (activeView === "summary") {
        const summaryRowsCsv = summaryExportData.map((row) => [
          row.SKU_CODE,
          row.SKU_NAME,
          row.LARGE_UNIT_QTY,
          row.LARGE_UNIT_NAME,
          row.REMAINDER_QTY,
          row.BASE_UNIT_NAME,
          row.STANDARD_QTY,
          row.ICCAT_CODE,
          row.ICCAT_NAME,
          row.MIN_QTY_DISPLAY,
          row.MAX_QTY_DISPLAY,
          row.STATUS,
          row.MIN_ORDER,
          row.LEAD_TIME,
          row.LAST_SUP_CODE,
          row.LAST_SUP_NAME,
          formatDateForCsv(row.LAST_PURCHASE_DATE),
          row.LAST_PRICE,
          row.LAST_UNIT,
        ]);

        const summaryRowsXlsx = summaryExportData.map((row) => [
          row.SKU_CODE,
          row.SKU_NAME,
          toNumberValue(row.LARGE_UNIT_QTY),
          row.LARGE_UNIT_NAME,
          toNumberValue(row.REMAINDER_QTY),
          row.BASE_UNIT_NAME,
          toNumberValue(row.STANDARD_QTY),
          row.ICCAT_CODE,
          row.ICCAT_NAME,
          toNumberValue(row.MIN_QTY_VALUE),
          toNumberValue(row.MAX_QTY_VALUE),
          row.STATUS,
          toNumberValue(row.MIN_ORDER),
          toNumberValue(row.LEAD_TIME),
          row.LAST_SUP_CODE,
          row.LAST_SUP_NAME,
          parseDateToObject(row.LAST_PURCHASE_DATE) || "",
          toNumberValue(row.LAST_PRICE),
          row.LAST_UNIT,
        ]);

        const headers = [
          "Goods Code",
          "SKU Name",
          "Large Unit Qty",
          "Large Unit",
          "Remainder Qty",
          "Base Unit",
          "Standard Qty",
          "Category Code",
          "Category Name",
          "Min Qty",
          "Max Qty",
          "Status",
          "Min Order",
          "Lead Time",
          "Last Supplier Code",
          "Last Supplier Name",
          "Last Purchase Date",
          "Last Price",
          "Price Unit",
        ];

        const metadataRows = [...baseMetadataRows, ["จำนวนรายการ", summaryRowsCsv.length.toLocaleString()]];

        if (format === "csv") {
          const lines = [];
          metadataRows.forEach((row) => lines.push(row.map(escapeCsv).join(",")));
          lines.push("");
          lines.push(headers.map(escapeCsv).join(","));
          summaryRowsCsv.forEach((row) => lines.push(row.map(escapeCsv).join(",")));
          const csvContent = `\uFEFF${lines.join("\r\n")}`;
          const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
          downloadBlob(blob, `raw-material_${viewLabel}_${filenameSuffix}.csv`);
        } else {
          await exportWorkbookXlsx({
            filename: `raw-material_${viewLabel}_${filenameSuffix}.xlsx`,
            sheets: [
              {
                sheetName: "Summary",
                headers,
                rows: summaryRowsXlsx,
                metadataRows,
                reportTitle,
                columnSettings: [
                  { width: 16 },
                  { width: 42 },
                  { width: 14, numFmt: "#,##0.000" },
                  { width: 18 },
                  { width: 14, numFmt: "#,##0.000" },
                  { width: 12 },
                  { width: 16, numFmt: "#,##0.000" },
                  { width: 16 },
                  { width: 22 },
                  { width: 10, numFmt: "#,##0.00" },
                  { width: 10, numFmt: "#,##0.00" },
                  { width: 12, align: "center" },
                  { width: 12, numFmt: "#,##0.00" },
                  { width: 10, numFmt: "0" },
                  { width: 18 },
                  { width: 26 },
                  { width: 16, numFmt: "dd/mm/yyyy", align: "center" },
                  { width: 12, numFmt: "#,##0.00" },
                  { width: 12 },
                ],
              },
              {
                sheetName: "Purchase History",
                headers: purchaseHeaders,
                rows: purchaseRowsXlsx,
                metadataRows: purchaseMetadataRows,
                reportTitle: "ประวัติการซื้อ (ทุกบริษัท)",
                columnSettings: [
                  { width: 16 },
                  { width: 42 },
                  { width: 18 },
                  { width: 32 },
                  { width: 16, numFmt: "dd/mm/yyyy", align: "center" },
                  { width: 12, numFmt: "#,##0.00" },
                  { width: 10 },
                ],
              },
            ],
          });
        }
      } else if (activeView === "movement") {
        const movementData = movementRecordsForExport.map((record) => ({
          SKU_CODE: record.SKU_CODE ?? "",
          SKU_NAME: record.SKU_NAME ?? "",
          UTQ_NAME: record.UTQ_NAME ?? "",
          OPENING_QTY: record.OPENING_QTY ?? "",
          IN_PURCHASE_QTY: record.IN_PURCHASE_QTY ?? "",
          IN_RETURN_QTY: record.IN_RETURN_QTY ?? "",
          OUT_QTY: record.OUT_QTY ?? "",
          ENDING_QTY: record.ENDING_QTY ?? "",
          ACTUAL_USAGE: calculateActualUsage(record.OUT_QTY, record.IN_RETURN_QTY) ?? "",
        }));

        const movementRowsCsv = movementData.map((row) => [
          row.SKU_CODE,
          row.SKU_NAME,
          row.UTQ_NAME,
          row.OPENING_QTY,
          row.IN_PURCHASE_QTY,
          row.IN_RETURN_QTY,
          row.OUT_QTY,
          row.ENDING_QTY,
          row.ACTUAL_USAGE,
        ]);

        const movementRowsXlsx = movementData.map((row) => [
          row.SKU_CODE,
          row.SKU_NAME,
          row.UTQ_NAME,
          toNumberValue(row.OPENING_QTY),
          toNumberValue(row.IN_PURCHASE_QTY),
          toNumberValue(row.IN_RETURN_QTY),
          toNumberValue(row.OUT_QTY),
          toNumberValue(row.ENDING_QTY),
          row.ACTUAL_USAGE,
        ]);

        const headers = [
          "SKU Code",
          "SKU Name",
          "Unit",
          "Opening Qty",
          "In Purchase Qty",
          "In Return Qty",
          "Out Qty",
          "Ending Qty",
          "Actual Usage",
        ];

        const metadataRows = [...baseMetadataRows, ["จำนวนรายการ", movementRowsCsv.length.toLocaleString()]];

        if (format === "csv") {
          const lines = [];
          metadataRows.forEach((row) => lines.push(row.map(escapeCsv).join(",")));
          lines.push("");
          lines.push(headers.map(escapeCsv).join(","));
          movementRowsCsv.forEach((row) => lines.push(row.map(escapeCsv).join(",")));
          const csvContent = `\uFEFF${lines.join("\r\n")}`;
          const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
          downloadBlob(blob, `raw-material_${viewLabel}_${filenameSuffix}.csv`);
        } else {
          await exportWorkbookXlsx({
            filename: `raw-material_${viewLabel}_${filenameSuffix}.xlsx`,
            sheets: [
              {
                sheetName: "Movement",
                headers,
                rows: movementRowsXlsx,
                metadataRows,
                reportTitle,
                columnSettings: [
                  { width: 16 },
                  { width: 42 },
                  { width: 10 },
                  { width: 12, numFmt: "#,##0.00" },
                  { width: 12, numFmt: "#,##0.00" },
                  { width: 12, numFmt: "#,##0.00" },
                  { width: 12, numFmt: "#,##0.00" },
                  { width: 12, numFmt: "#,##0.00" },
                  { width: 12, numFmt: "#,##0.00" },
                ],
              },
              {
                sheetName: "Purchase History",
                headers: purchaseHeaders,
                rows: purchaseRowsXlsx,
                metadataRows: purchaseMetadataRows,
                reportTitle: "ประวัติการซื้อ (ทุกบริษัท)",
                columnSettings: [
                  { width: 16 },
                  { width: 42 },
                  { width: 18 },
                  { width: 32 },
                  { width: 16, numFmt: "dd/mm/yyyy", align: "center" },
                  { width: 12, numFmt: "#,##0.00" },
                  { width: 10 },
                ],
              },
            ],
          });
        }
      } else {
        const lotData = allRecords
          .filter((record) => {
            if (isExcludedDept(record)) {
              return false;
            }
            const qtyValue = Number(record.QTY_BASE ?? record.QTY_K);
            return !Number.isFinite(qtyValue) || qtyValue > 0;
          })
          .map((record) => {
            const breakdown = getLotQuantityBreakdown(record);
            return {
              BASE_GOODS_CODE: record.BASE_GOODS_CODE ?? record.GOODS_CODE ?? record.SKU_CODE ?? "",
              SKU_NAME: record.SKU_NAME ?? "",
              LOT_NO: record.SKM_LOT_NO ?? "",
              WL_CODE: record.WL_CODE ?? "",
              READABLE_QTY: breakdown.valid ? formatReadableLotQuantity(breakdown) : "-",
              QTY_BASE: breakdown.valid ? breakdown.baseQuantity : "",
              BASE_UNIT_NAME: breakdown.baseUnitName,
              UNIT_REFERENCE: breakdown.valid ? formatLotUnitReference(breakdown) : "-",
              ICCAT_CODE: record.ICCAT_CODE ?? "",
              ICCAT_NAME: record.ICCAT_NAME ?? "",
              UNIT_COST: record.COST_STATUS === "ready" ? record.UNIT_COST : "",
              INVENTORY_VALUE: record.COST_STATUS === "ready" ? record.INVENTORY_VALUE : "",
              COST_STATUS: record.COST_STATUS === "ready"
                ? "มีต้นทุน"
                : record.COST_STATUS === "review"
                  ? "รอตรวจสอบ"
                  : "ไม่มีต้นทุน",
            };
          });

        const lotRowsCsv = lotData.map((row) => [
          row.BASE_GOODS_CODE,
          row.SKU_NAME,
          row.LOT_NO,
          row.WL_CODE,
          row.READABLE_QTY,
          row.QTY_BASE,
          row.BASE_UNIT_NAME,
          row.UNIT_REFERENCE,
          row.ICCAT_CODE,
          row.ICCAT_NAME,
          row.UNIT_COST,
          row.INVENTORY_VALUE,
          row.COST_STATUS,
        ]);

        const lotRowsXlsx = lotData.map((row) => [
          row.BASE_GOODS_CODE,
          row.SKU_NAME,
          row.LOT_NO,
          row.WL_CODE,
          row.READABLE_QTY,
          toNumberValue(row.QTY_BASE),
          row.BASE_UNIT_NAME,
          row.UNIT_REFERENCE,
          row.ICCAT_CODE,
          row.ICCAT_NAME,
          toNumberValue(row.UNIT_COST),
          toNumberValue(row.INVENTORY_VALUE),
          row.COST_STATUS,
        ]);

        const headers = [
          "รหัสสินค้า",
          "ชื่อสินค้า",
          "หมายเลข LOT",
          "รหัสคลัง",
          "คงเหลืออ่านง่าย",
          "จำนวนมาตรฐาน",
          "หน่วยฐาน",
          "รหัสหน่วยอ้างอิง",
          "รหัสประเภท",
          "ประเภทวัตถุดิบ",
          "ต้นทุน/หน่วยหลัก",
          "มูลค่าคงเหลือ",
          "สถานะต้นทุน",
        ];

        const metadataRows = [...baseMetadataRows, ["จำนวนรายการ", lotRowsCsv.length.toLocaleString()]];

        if (format === "csv") {
          const lines = [];
          metadataRows.forEach((row) => lines.push(row.map(escapeCsv).join(",")));
          lines.push("");
          lines.push(headers.map(escapeCsv).join(","));
          lotRowsCsv.forEach((row) => lines.push(row.map(escapeCsv).join(",")));
          const csvContent = `\uFEFF${lines.join("\r\n")}`;
          const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
          downloadBlob(blob, `raw-material_${viewLabel}_${filenameSuffix}.csv`);
        } else {
          await exportWorkbookXlsx({
            filename: `raw-material_${viewLabel}_${filenameSuffix}.xlsx`,
            sheets: [
              {
                sheetName: "Lot",
                headers,
                rows: lotRowsXlsx,
                metadataRows,
                reportTitle,
                columnSettings: [
                  { width: 16 },
                  { width: 42 },
                  { width: 16 },
                  { width: 10, align: "center" },
                  { width: 24 },
                  { width: 16, numFmt: "#,##0.000" },
                  { width: 12 },
                  { width: 32 },
                  { width: 16 },
                  { width: 22 },
                  { width: 18, numFmt: "#,##0.00" },
                  { width: 20, numFmt: "#,##0.00" },
                  { width: 16 },
                ],
              },
              {
                sheetName: "Purchase History",
                headers: purchaseHeaders,
                rows: purchaseRowsXlsx,
                metadataRows: purchaseMetadataRows,
                reportTitle: "ประวัติการซื้อ (ทุกบริษัท)",
                columnSettings: [
                  { width: 16 },
                  { width: 42 },
                  { width: 18 },
                  { width: 32 },
                  { width: 16, numFmt: "dd/mm/yyyy", align: "center" },
                  { width: 12, numFmt: "#,##0.00" },
                  { width: 10 },
                ],
              },
            ],
          });
        }
      }
    } catch (error) {
      updateUiState({ errorMessage: error?.message || "Export failed." });
    } finally {
      updateUiState({ exportLoading: false });
    }
  };

  const { records } = dataState;
  const { loading, errorMessage, isIccatOpen, isStatusOpen, isExportOpen, isHistoryModalOpen, selectedSkuForHistory, avgUsageLoading, exportLoading } = uiState;
  const {
    skuName,
    movementDateFrom,
    movementDateTo,
    selectedIccat,
    statusFilter,
    brandCodes,
    lotCostStatus,
    lotWarehouseCode,
  } = filterState;

  const toggleIccat = (code) => {
    hasCustomIccat.current = true;
    updateFilterState(prev => ({
      ...prev,
      selectedIccat: prev.selectedIccat.includes(code)
        ? prev.selectedIccat.filter((item) => item !== code)
        : [...prev.selectedIccat, code]
    }));
  };

  const summaryPagination = useMemo(() => {
    if (!isSummaryStatusFiltered) {
      return {
        totalRecords: paginationState.pagination.totalRecords,
        totalPages: paginationState.pagination.totalPages,
      };
    }

    const baseRows = summaryFilterState.allRecords.filter(
      (row) => !isExcludedDept(row)
    );
    const filteredRows = baseRows.filter((row) => getStatusForRow(row) === filterState.statusFilter);
    const totalRecords = filteredRows.length;
    const totalPages = Math.max(1, Math.ceil(totalRecords / paginationState.pagination.pageSize));
    return { totalRecords, totalPages, filteredRows };
  }, [
    filterState.statusFilter,
    getStatusForRow,
    isExcludedDept,
    isSummaryStatusFiltered,
    paginationState.pagination.pageSize,
    paginationState.pagination.totalPages,
    paginationState.pagination.totalRecords,
    summaryFilterState.allRecords
  ]);

  useEffect(() => {
    if (!isSummaryStatusFiltered) {
      return;
    }
    const maxPage = summaryPagination.totalPages || 1;
    if (paginationState.pagination.page > maxPage) {
      updatePaginationState((prev) => ({
        ...prev,
        pagination: { ...prev.pagination, page: maxPage },
      }));
    }
  }, [isSummaryStatusFiltered, paginationState.pagination.page, summaryPagination.totalPages, updatePaginationState]);

  const pagination = isSummaryStatusFiltered
    ? {
      ...paginationState.pagination,
      totalPages: summaryPagination.totalPages,
      totalRecords: summaryPagination.totalRecords,
    }
    : paginationState.pagination;

  const summaryRows = useMemo(() => {
    if (!isSummaryStatusFiltered) {
      return dataState.summaryRecords.filter(
        (row) => !isExcludedDept(row)
      );
    }
    const filteredRows = summaryPagination.filteredRows || [];
    const start = (paginationState.pagination.page - 1) * paginationState.pagination.pageSize;
    const end = start + paginationState.pagination.pageSize;
    return filteredRows.slice(start, end);
  }, [
    dataState.summaryRecords,
    isExcludedDept,
    isSummaryStatusFiltered,
    paginationState.pagination.page,
    paginationState.pagination.pageSize,
    summaryPagination.filteredRows
  ]);

  const movementRows = useMemo(
    () => dataState.movementRecords,
    [dataState.movementRecords]
  );

  const lotRows = useMemo(() => {
    if (activeView !== "lot") {
      return [];
    }

    const recordsToProcess = [];

    // First pass: filter and prepare data
    records.forEach((record) => {
      if (isExcludedDept(record)) {
        return;
      }
      const qtyValue = Number(record.QTY);
      if (!Number.isFinite(qtyValue) || qtyValue > 0) {
        recordsToProcess.push({ record, qtyValue });
      }
    });

    // Second pass: build rows with grouping
    const rows = [];
    let groupBreakdowns = [];
    let groupInventoryValue = 0;
    let groupCostComplete = true;
    let prevSku = null;

    recordsToProcess.forEach(({ record, qtyValue }, index) => {
      const breakdown = getLotQuantityBreakdown(record);
      if (breakdown.valid) groupBreakdowns.push(breakdown);

      const currentDisplayCode = record.BASE_GOODS_CODE || record.GOODS_CODE || record.SKU_CODE;
      const nextDisplayCode = recordsToProcess[index + 1]?.record.BASE_GOODS_CODE
        || recordsToProcess[index + 1]?.record.GOODS_CODE
        || recordsToProcess[index + 1]?.record.SKU_CODE;
      const showSku = currentDisplayCode !== prevSku;
      const qtyDisplay = Number.isFinite(qtyValue)
        ? formatTruncNumberDisplay(qtyValue)
        : record.QTY ?? "-";
      const unitCost = Number(record.UNIT_COST);
      const inventoryValue = Number(record.INVENTORY_VALUE);
      const hasUsableCost = record.COST_STATUS === "ready"
        && Number.isFinite(unitCost)
        && Number.isFinite(inventoryValue);
      if (hasUsableCost) {
        groupInventoryValue += inventoryValue;
      } else {
        groupCostComplete = false;
      }

      rows.push({
        type: "data",
        key: `${currentDisplayCode}-${record.SKM_LOT_NO}-${record.WL_CODE || "warehouse"}-${index}`,
        record,
        showSku,
        qtyDisplay,
        breakdown,
        readableDisplay: breakdown.valid
          ? formatReadableLotQuantity(breakdown)
          : `${qtyDisplay} ${record.UTQ_NAME || ""}`.trim(),
        readableAmountDisplay: breakdown.valid
          ? formatReadableLotQuantityAmount(breakdown)
          : qtyDisplay,
        readableUnitDisplay: breakdown.valid
          ? formatReadableLotQuantityUnit(breakdown)
          : record.UTQ_NAME || "-",
        standardDisplay: breakdown.valid
          ? `${formatQuantityNumber(breakdown.baseQuantity)} ${breakdown.baseUnitName}`
          : "-",
        standardAmountDisplay: breakdown.valid
          ? formatQuantityNumber(breakdown.baseQuantity)
          : "-",
        standardUnitDisplay: breakdown.baseUnitName || "-",
        referenceDisplay: breakdown.valid ? formatLotUnitReference(breakdown) : "-",
        unitCost: hasUsableCost ? unitCost : null,
        inventoryValue: hasUsableCost ? inventoryValue : null,
        costStatus: record.COST_STATUS || "missing",
      });

      if (!nextDisplayCode || nextDisplayCode !== currentDisplayCode) {
        const combinedBreakdown = combineLotQuantityBreakdowns(groupBreakdowns);
        rows.push({
          type: "subtotal",
          key: `${currentDisplayCode}-subtotal-${index}`,
          skuCode: currentDisplayCode,
          readableDisplay: combinedBreakdown
            ? formatReadableLotQuantity(combinedBreakdown)
            : "-",
          readableAmountDisplay: combinedBreakdown
            ? formatReadableLotQuantityAmount(combinedBreakdown)
            : "-",
          readableUnitDisplay: combinedBreakdown
            ? formatReadableLotQuantityUnit(combinedBreakdown)
            : "-",
          standardDisplay: combinedBreakdown
            ? `${formatQuantityNumber(combinedBreakdown.baseQuantity)} ${combinedBreakdown.baseUnitName}`
            : "-",
          standardAmountDisplay: combinedBreakdown
            ? formatQuantityNumber(combinedBreakdown.baseQuantity)
            : "-",
          standardUnitDisplay: combinedBreakdown?.baseUnitName || "-",
          inventoryValue: groupCostComplete ? groupInventoryValue : null,
          costStatus: groupCostComplete ? "ready" : "incomplete",
        });
        groupBreakdowns = [];
        groupInventoryValue = 0;
        groupCostComplete = true;
      }
      prevSku = currentDisplayCode;
    });

    return rows;
  }, [activeView, records, formatTruncNumberDisplay, isExcludedDept]);

  const mobileLotGroups = useMemo(() => {
    if (activeView !== "lot") return [];
    const groups = new Map();
    records.forEach((record) => {
      if (isExcludedDept(record)) return;
      const baseQuantity = Number(record.QTY_BASE ?? record.QTY_K);
      if (!Number.isFinite(baseQuantity) || baseQuantity <= 0) return;
      const skuCode = record.BASE_GOODS_CODE || record.GOODS_CODE || record.SKU_CODE;
      if (!groups.has(skuCode)) {
        groups.set(skuCode, {
          skuCode,
          skuName: record.SKU_NAME,
          categoryCode: record.ICCAT_CODE,
          categoryName: record.ICCAT_NAME,
          rows: [],
          breakdowns: [],
        });
      }
      const group = groups.get(skuCode);
      const breakdown = getLotQuantityBreakdown(record);
      group.rows.push({ record, breakdown });
      if (breakdown.valid) group.breakdowns.push(breakdown);
    });

    return Array.from(groups.values()).map((group) => {
      const combined = combineLotQuantityBreakdowns(group.breakdowns);
      return {
        ...group,
        readableDisplay: combined ? formatReadableLotQuantity(combined) : "-",
        standardDisplay: combined
          ? `${formatQuantityNumber(combined.baseQuantity)} ${combined.baseUnitName}`
          : "-",
      };
    });
  }, [activeView, isExcludedDept, records]);

  const activeRows = activeView === "lot"
    ? lotRows
    : activeView === "movement"
      ? movementRows
      : summaryRows;
  const rowVirtualizer = useVirtualizer({
    count: activeRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (activeView === "lot" ? 38 : 52),
    overscan: 10,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const lotIsVirtualized = lotRows.length > 0;
  const movementIsVirtualized = movementRows.length > 0;

  const currentCursorInfo = activeView === "summary"
    ? paginationState.summaryCursorInfo
    : activeView === "movement"
      ? paginationState.movementCursorInfo
      : paginationState.lotCursorInfo;

  const currentCursorMap = activeView === "summary"
    ? paginationState.summaryCursorMap
    : activeView === "movement"
      ? paginationState.movementCursorMap
      : paginationState.lotCursorMap;

  const canGoNext = isSummaryStatusFiltered
    ? paginationState.pagination.page < summaryPagination.totalPages
    : currentCursorInfo.hasMore && Boolean(currentCursorMap[paginationState.pagination.page + 1]);

  const prefetchAdjacentPage = useCallback((direction) => {
    if (activeView === "summary" && isSummaryStatusFiltered) {
      return;
    }
    const delta = direction === "next" ? 1 : -1;
    const targetPage = paginationState.pagination.page + delta;
    if (targetPage < 1) {
      return;
    }

    const cursorValue = currentCursorMap[targetPage];
    if (direction === "next" && (!currentCursorInfo.hasMore || !cursorValue)) {
      return;
    }
    if (direction === "prev" && cursorValue === undefined) {
      return;
    }

    if (activeView === "summary") {
      const params = buildSummaryParams();
      prefetchPage("summary", targetPage, cursorValue, params, fetchSummaryMaterials);
      return;
    }
    if (activeView === "movement") {
      const params = buildMovementParams();
      prefetchPage("movement", targetPage, cursorValue, params, fetchMovementMaterials);
      return;
    }

    const params = buildLotParams(targetPage, cursorValue);
    prefetchPage("lot", targetPage, cursorValue, params, fetchLotMaterials);
  }, [
    activeView,
    buildLotParams,
    buildMovementParams,
    buildSummaryParams,
    currentCursorInfo.hasMore,
    currentCursorMap,
    fetchLotMaterials,
    fetchMovementMaterials,
    fetchSummaryMaterials,
    isSummaryStatusFiltered,
    paginationState.pagination.page,
    prefetchPage,
  ]);

  const handleSearch = () => {
    appliedSkuNameRef.current = filterState.skuName.trim();
    if (activeView === "summary") {
      loadSummaryMaterials(1, { cursor: null, resetCursors: true });
    } else if (activeView === "movement") {
      loadMovementMaterials(1, { cursor: null, resetCursors: true });
    } else {
      loadRawMaterials(1, { cursor: null, resetCursors: true });
    }
  };

  const handlePrevPage = () => {
    const prevPage = paginationState.pagination.page - 1;
    if (prevPage < 1) return;
    if (isSummaryStatusFiltered && activeView === "summary") {
      updatePaginationState((prev) => ({
        ...prev,
        pagination: { ...prev.pagination, page: prevPage },
      }));
      return;
    }
    if (activeView === "summary") {
      loadSummaryMaterials(prevPage);
    } else if (activeView === "movement") {
      loadMovementMaterials(prevPage);
    } else {
      loadRawMaterials(prevPage);
    }
  };

  const handleNextPage = () => {
    if (!canGoNext) return;
    const nextPage = paginationState.pagination.page + 1;
    if (isSummaryStatusFiltered && activeView === "summary") {
      updatePaginationState((prev) => ({
        ...prev,
        pagination: { ...prev.pagination, page: nextPage },
      }));
      return;
    }
    if (activeView === "summary") {
      loadSummaryMaterials(nextPage);
    } else if (activeView === "movement") {
      loadMovementMaterials(nextPage);
    } else {
      loadRawMaterials(nextPage);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  if (activeView === "lot") {
    const lotSummary = dataState.lotSummary || EMPTY_LOT_SUMMARY;
    const rawSelectedCodes = selectedIccat.filter((code) => RAW_MATERIAL_COST_CODES.includes(code));

    return (
      <div className="flex h-screen flex-col overflow-hidden bg-[#f8fafc] text-[#102C57]">
        <header className="shrink-0 border-t-[3px] border-[#102C57] bg-white">
          <div className="flex items-center justify-between gap-4 px-4 pb-2 pt-2">
            <div>
              <h1 className="text-lg font-bold leading-tight">สินค้าคงเหลือและต้นทุนวัตถุดิบ · แยก LOT</h1>
              <p className="text-[10px] text-slate-500">คงเหลือและต้นทุนราย LOT ในหน้าจอเดียว · คำนวณมาตรฐานด้วยหน่วยฐาน</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <nav className="flex overflow-hidden rounded border border-slate-300 bg-slate-100 text-[10px] font-bold" aria-label="มุมมองสต็อกวัตถุดิบ">
                {canViewLot ? (
                  <Link href="/raw-materials/lot" aria-current="page" className="bg-[#d4af37] px-3 py-1.5 text-[#102C57]">แยก LOT</Link>
                ) : null}
                {canViewSummary ? (
                  <Link href="/raw-materials/summary" className="border-l border-slate-300 px-3 py-1.5 text-slate-600 hover:bg-white">รวม</Link>
                ) : null}
                {canViewMovement ? (
                  <Link href="/raw-materials/movement" className="border-l border-slate-300 px-3 py-1.5 text-slate-600 hover:bg-white">เคลื่อนไหว</Link>
                ) : null}
              </nav>
              <LiveClock plain />
            </div>
          </div>

          <div className="flex min-w-max items-center gap-3 border-y border-slate-200 px-4 py-2 text-[11px]">
            <label className="relative w-[390px] shrink-0">
              <Search className="pointer-events-none absolute left-2.5 top-2 h-4 w-4 text-slate-400" />
              <input
                value={skuName}
                onChange={(event) => updateFilterState({ skuName: event.target.value })}
                onKeyDown={handleKeyDown}
                placeholder="ค้นหารหัสสินค้า ชื่อสินค้า หรือ LOT..."
                className="h-8 w-full rounded border border-slate-300 bg-white pl-8 pr-3 outline-none focus:border-[#102C57] focus:ring-1 focus:ring-[#102C57]"
              />
            </label>

            <span className="font-bold">ประเภทสินค้า</span>
            <div className="flex items-center gap-1">
              {RAW_MATERIAL_COST_CODES.map((code) => {
                const checked = rawSelectedCodes.includes(code);
                return (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={checked}
                    onClick={() => {
                      hasCustomIccat.current = true;
                      updateFilterState({
                        selectedIccat: checked
                          ? (rawSelectedCodes.length === 1 ? rawSelectedCodes : rawSelectedCodes.filter((item) => item !== code))
                          : [...rawSelectedCodes, code],
                      });
                    }}
                    className={`h-8 rounded border px-2 font-mono font-bold ${checked
                      ? "border-[#102C57] bg-[#e8eef7] text-[#102C57]"
                      : "border-slate-300 bg-white text-slate-400"
                    }`}
                  >
                    {code}
                  </button>
                );
              })}
            </div>

            <label className="flex items-center gap-2">
              <span className="font-bold">คลัง</span>
              <select
                value={lotWarehouseCode}
                onChange={(event) => updateFilterState({ lotWarehouseCode: event.target.value })}
                className="h-8 w-28 rounded border border-slate-300 bg-white px-2"
              >
                <option value="">ทั้งหมด</option>
                {["02", "04", "05", "17"].map((code) => <option key={code} value={code}>{code}</option>)}
              </select>
            </label>

            <label className="flex items-center gap-2">
              <span className="font-bold">สถานะต้นทุน</span>
              <select
                value={lotCostStatus}
                onChange={(event) => updateFilterState({ lotCostStatus: event.target.value })}
                className="h-8 w-32 rounded border border-slate-300 bg-white px-2"
              >
                <option value="all">ทั้งหมด</option>
                <option value="ready">มีต้นทุน</option>
                <option value="review">รอตรวจสอบ</option>
                <option value="missing">ไม่มีต้นทุน</option>
              </select>
            </label>

            <label className="ml-auto flex items-center gap-1.5 whitespace-nowrap font-semibold">
              <input type="checkbox" checked readOnly className="h-4 w-4 accent-[#102C57]" />
              เฉพาะมีคงเหลือ
            </label>
            <button
              type="button"
              onClick={handleSearch}
              disabled={loading}
              className="h-8 rounded bg-[#d4af37] px-4 font-bold text-[#102C57] disabled:opacity-50"
            >
              {loading ? "กำลังโหลด" : "ค้นหา"}
            </button>
            <span className="whitespace-nowrap font-mono text-slate-500">{pagination.totalRecords.toLocaleString("th-TH")} รายการ</span>
          </div>
        </header>

        {errorMessage ? (
          <div className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-2 text-xs text-red-700">{errorMessage}</div>
        ) : null}

        <div ref={scrollRef} className="relative min-h-0 flex-1 overflow-auto overscroll-contain">
          <table className="w-full min-w-[1320px] table-fixed border-separate border-spacing-0 text-xs">
            <colgroup>
              {[7, 14, 6, 6, 4, 7, 8, 7.5, 4.5, 10.5, 8, 9, 8.5].map((width, index) => (
                <col key={index} style={{ width: `${width}%` }} />
              ))}
            </colgroup>
            <thead className="sticky top-0 z-30 bg-[var(--surface-navy,#102C57)] text-white shadow-md [&_th]:bg-[var(--surface-navy,#102C57)]">
              <tr className="border-t-[3px] border-[#d4af37] text-center text-xs">
                <th colSpan={3} className="border-r border-[#526987] border-t-[3px] border-t-[#d4af37] px-1.5 py-1.5">สินค้า</th>
                <th colSpan={7} className="border-r border-[#526987] border-t-[3px] border-t-[#d4af37] px-1.5 py-1.5">คงเหลือ</th>
                <th colSpan={3} className="border-t-[3px] border-t-[#d4af37] px-1.5 py-1.5">ต้นทุน</th>
              </tr>
              <tr className="text-[11px] [&_th]:border-t [&_th]:border-[#526987] [&_th]:px-1.5 [&_th]:py-1.5">
                <th className="border-r border-[#526987] text-left">รหัสสินค้า</th>
                <th className="border-r border-[#526987] text-left">ชื่อสินค้า</th>
                <th className="border-r border-[#526987] text-left">ประเภท</th>
                <th className="border-r border-[#526987] text-center">LOT</th>
                <th className="border-r border-[#526987] text-center">คลัง</th>
                <th className="border-r border-[#526987] text-right">คงเหลืออ่านง่าย</th>
                <th className="border-r border-[#526987] text-left">หน่วยบรรจุ</th>
                <th className="border-r border-[#526987] text-right">จำนวนมาตรฐาน</th>
                <th className="border-r border-[#526987] text-left">หน่วยหลัก</th>
                <th className="border-r border-[#526987] text-left">รหัสหน่วยอ้างอิง</th>
                <th className="border-r border-[#526987] text-right">ต้นทุน/หน่วยหลัก</th>
                <th className="border-r border-[#526987] text-right">มูลค่าคงเหลือ</th>
                <th className="text-center">สถานะ</th>
              </tr>
            </thead>
            <tbody className="bg-white text-slate-900 [&_td]:border-b [&_td]:border-slate-300">
              {loading && lotRows.length === 0 ? (
                <tr><td colSpan={13} className="h-48 text-center text-xs text-slate-500">กำลังโหลดข้อมูล...</td></tr>
              ) : lotRows.length === 0 ? (
                <tr><td colSpan={13} className="h-48 text-center text-xs text-slate-500">ไม่พบข้อมูล</td></tr>
              ) : lotRows.map((row, rowIndex) => {
                if (!row) return null;

                if (row.type === "subtotal") {
                  return (
                    <tr
                      key={row.key}
                      className="bg-slate-100 font-bold text-[#102C57] [&_td]:border-b-[#d4af37]"
                    >
                      <td className="w-[105px] border-r border-slate-200 px-2 py-1.5">รวมยอด</td>
                      <td className="w-[190px] border-r border-slate-200 px-2 py-1.5 font-mono">{row.skuCode}</td>
                      <td className="w-[90px] border-r border-slate-200" />
                      <td className="w-[90px] border-r border-slate-200" />
                      <td className="w-[55px] border-r border-slate-200" />
                      <td className="w-[92px] border-r border-slate-200 px-2 py-1.5 text-right">{row.readableAmountDisplay}</td>
                      <td className="w-[115px] border-r border-slate-200 px-2 py-1.5">{row.readableUnitDisplay}</td>
                      <td className="w-[105px] border-r border-slate-200 px-2 py-1.5 text-right font-mono">{row.standardAmountDisplay}</td>
                      <td className="w-[65px] border-r border-slate-200 px-2 py-1.5">{row.standardUnitDisplay}</td>
                      <td className="w-[180px] border-r border-slate-200" />
                      <td className="w-[110px] border-r border-slate-200" />
                      <td className="w-[125px] border-r border-slate-200 px-2 py-1.5 text-right font-mono">{formatCostNumber(row.inventoryValue)}</td>
                      <td className="w-[105px] px-2 py-1.5 text-center text-[10px]">{row.costStatus === "ready" ? "ครบ" : "ต้นทุนไม่ครบ"}</td>
                    </tr>
                  );
                }

                const record = row.record;
                const status = row.costStatus;
                const statusLabel = status === "ready" ? "มีต้นทุน" : status === "review" ? "รอตรวจสอบ" : "ไม่มีต้นทุน";
                const statusClass = status === "ready"
                  ? "bg-emerald-500"
                  : status === "review"
                    ? "bg-amber-400"
                    : "bg-slate-500";

                return (
                  <tr
                    key={row.key}
                    className={`border-b border-slate-200 hover:bg-slate-50 ${rowIndex % 2 === 1 ? "bg-slate-50/30" : "bg-white"}`}
                    title={record.COST_REVIEW_REASON || undefined}
                  >
                    <td className="w-[105px] border-r border-slate-200 px-2 py-1.5 font-mono font-bold text-[#102C57]">{row.showSku ? (record.BASE_GOODS_CODE || record.GOODS_CODE || record.SKU_CODE) : ""}</td>
                    <td className="w-[190px] border-r border-slate-200 px-2 py-1.5 font-semibold">{row.showSku ? record.SKU_NAME : ""}</td>
                    <td className="w-[90px] border-r border-slate-200 px-2 py-1.5"><span className="font-mono font-bold text-[#102C57]">[{record.ICCAT_CODE || "-"}]</span> {record.ICCAT_NAME || ""}</td>
                    <td className="w-[90px] border-r border-slate-200 px-2 py-1.5 text-center font-mono">{record.SKM_LOT_NO || "—"}</td>
                    <td className="w-[55px] border-r border-slate-200 px-2 py-1.5 text-center font-mono font-bold">{record.WL_CODE || "—"}</td>
                    <td className="w-[92px] border-r border-slate-200 px-2 py-1.5 text-right font-mono font-bold">{row.readableAmountDisplay}</td>
                    <td className="w-[115px] border-r border-slate-200 px-2 py-1.5 font-semibold">{row.readableUnitDisplay}</td>
                    <td className="w-[105px] border-r border-slate-200 px-2 py-1.5 text-right font-mono">{row.standardAmountDisplay}</td>
                    <td className="w-[65px] border-r border-slate-200 px-2 py-1.5 font-semibold">{row.standardUnitDisplay}</td>
                    <td className="w-[180px] border-r border-slate-200 px-2 py-1.5 font-mono text-[11px] font-semibold text-slate-900">{row.referenceDisplay}</td>
                    <td className="w-[110px] border-r border-slate-200 px-2 py-1.5 text-right font-mono font-semibold">{formatCostNumber(row.unitCost)}</td>
                    <td className="w-[125px] border-r border-slate-200 px-2 py-1.5 text-right font-mono font-semibold">{formatCostNumber(row.inventoryValue)}</td>
                    <td className="w-[105px] px-1.5 py-1 text-center"><span className="inline-flex items-center gap-1.5 whitespace-nowrap text-[10px] font-semibold"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusClass}`} />{statusLabel}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <footer className="flex h-11 shrink-0 items-center gap-3 border-t-[3px] border-[#d4af37] bg-[var(--surface-navy,#102C57)] px-4 text-[11px] font-semibold text-white">
          <span>รวม {Number(lotSummary.totalProducts || 0).toLocaleString("th-TH")} สินค้า</span>
          <span>·</span>
          <span>{pagination.totalRecords.toLocaleString("th-TH")} รายการ</span>
          <span>·</span>
          <span>{formatCostNumber(lotSummary.totalBaseQty)} KG</span>
          <span>·</span>
          <span>มูลค่าที่คำนวณได้ {formatCostNumber(lotSummary.totalInventoryValue)} บาท</span>
          {Number(lotSummary.incompleteCostRows || 0) > 0 ? (
            <span className="text-amber-300">({Number(lotSummary.incompleteCostRows).toLocaleString("th-TH")} รายการต้นทุนไม่ครบ)</span>
          ) : null}
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={handlePrevPage} disabled={pagination.page <= 1 || loading} className="h-7 rounded border border-white/20 px-3 disabled:opacity-40">ก่อนหน้า</button>
            <span className="rounded bg-[#d4af37] px-3 py-1 text-[#102C57]">{pagination.page.toLocaleString("th-TH")}</span>
            <span className="text-white/70">/ {pagination.totalPages.toLocaleString("th-TH")}</span>
            <button type="button" onClick={handleNextPage} disabled={!canGoNext || loading} className="h-7 rounded border border-white/20 px-3 disabled:opacity-40">ถัดไป</button>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#f8f9fa] text-[#1e293b] font-sans overflow-hidden">
      <div className="bg-gradient-to-r from-[#102C57] to-[#0f172a] shadow-xl text-white shrink-0 z-40">
        <div className="max-w-[95%] mx-auto py-4">

          <div className="flex flex-col gap-4">
            {/* Top Row: Title & Toggles */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h6 className="text-[#d4af37] font-bold tracking-[0.2em] text-[10px] uppercase">
                    Raw Material
                  </h6>
                  <span className="text-[10px] bg-[#d4af37] text-[#102C57] px-2 py-0.5 rounded-full font-sans font-bold tracking-wider">
                    {pagination.totalRecords.toLocaleString()} รายการ
                  </span>
                </div>
                <h1 className="text-lg sm:text-xl md:text-2xl font-bold font-serif text-white flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-2 sm:gap-3">
                  <span className="flex items-center gap-2 min-w-0">
                    <Warehouse size={26} className="text-[#d4af37] shrink-0" />
                    <span className="min-w-0 leading-tight text-balance">
                      สินค้าคงเหลือคลังวัตถุดิบ
                    </span>
                    <span className="sm:hidden flex items-center gap-1">
                      {canViewLot && (
                        <Link
                          href="/raw-materials/lot"
                          className={`flex h-7 w-7 items-center justify-center rounded-full border transition ${activeView === "lot"
                            ? "border-[#d4af37] bg-[#d4af37] text-[#102C57]"
                            : "border-white/15 text-white/60 hover:text-white hover:border-white/40"
                            }`}
                          aria-label="แยก LOT"
                        >
                          <List size={14} />
                        </Link>
                      )}
                      {canViewSummary && (
                        <Link
                          href="/raw-materials/summary"
                          className={`flex h-7 w-7 items-center justify-center rounded-full border transition ${activeView === "summary"
                            ? "border-[#d4af37] bg-[#d4af37] text-[#102C57]"
                            : "border-white/15 text-white/60 hover:text-white hover:border-white/40"
                            }`}
                          aria-label="รวม"
                        >
                          <Grid3x3 size={14} />
                        </Link>
                      )}
                      {canViewMovement && (
                        <Link
                          href="/raw-materials/movement"
                          className={`flex h-7 w-7 items-center justify-center rounded-full border transition ${activeView === "movement"
                            ? "border-[#d4af37] bg-[#d4af37] text-[#102C57]"
                            : "border-white/15 text-white/60 hover:text-white hover:border-white/40"
                            }`}
                          aria-label="เคลื่อนไหว"
                        >
                          <Activity size={14} />
                        </Link>
                      )}
                    </span>
                  </span>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-sans">
                    <div className="hidden sm:block">
                      <LiveClock />
                    </div>
                  </div>
                </h1>
              </div>

              {/* View Toggles (Compact) */}
              <div className="hidden sm:flex bg-black/20 p-1 rounded-lg self-start lg:self-auto">
                {canViewLot && (
                  <Link
                    href="/raw-materials/lot"
                    className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${activeView === "lot"
                      ? "bg-[#d4af37] text-[#102C57] shadow-sm"
                      : "text-white/50 hover:text-white hover:bg-white/5"
                      }`}
                  >
                    <List size={14} />
                    แยก LOT
                  </Link>
                )}
                {canViewSummary && (
                  <Link
                    href="/raw-materials/summary"
                    className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${activeView === "summary"
                      ? "bg-[#d4af37] text-[#102C57] shadow-sm"
                      : "text-white/50 hover:text-white hover:bg-white/5"
                      }`}
                  >
                    <Grid3x3 size={14} />
                    รวม
                  </Link>
                )}
                {canViewMovement && (
                  <Link
                    href="/raw-materials/movement"
                    className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${activeView === "movement"
                      ? "bg-[#d4af37] text-[#102C57] shadow-sm"
                      : "text-white/50 hover:text-white hover:bg-white/5"
                      }`}
                  >
                    <Activity size={14} />
                    เคลื่อนไหว
                  </Link>
                )}
              </div>
            </div>

            {/* Filter Toolbar (Grid on Mobile, Flex on Desktop) */}
            <div className="grid grid-cols-2 lg:flex lg:flex-row items-center gap-2 bg-white/5 p-2 rounded-xl text-sm border border-white/10">

              {/* SKU Search - Inline on mobile */}
              <div className="col-span-2 lg:col-span-1">
                <div className="flex gap-2 lg:block">
                  <div className="relative flex-1 lg:w-64">
                    <input
                      value={skuName}
                      onChange={(e) => updateFilterState({ skuName: e.target.value })}
                      onKeyDown={handleKeyDown}
                      placeholder="ค้นหารหัสสินค้า..."
                      className="w-full h-9 pl-3 pr-8 rounded-lg bg-black/20 border border-white/10 text-white placeholder:text-white/30 text-xs focus:ring-1 focus:ring-[#d4af37] outline-none"
                    />
                  </div>
                  <button
                    onClick={handleSearch}
                    disabled={loading}
                    className="h-9 px-4 bg-[#d4af37] hover:bg-[#b5952f] text-[#102C57] text-xs font-bold rounded-lg shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2 lg:hidden"
                  >
                    <Search size={14} />
                    {loading ? "..." : "ค้นหา"}
                  </button>
                </div>
              </div>

              {activeView === "movement" && (
                <div className="col-span-2 lg:col-span-1 flex gap-2">
                  <div className="flex-1">
                    <label className="block text-[10px] text-white/60 mb-1">จากวันที</label>
                    <input
                      type="date"
                      value={movementDateFrom}
                      onChange={(e) => updateFilterState({ movementDateFrom: e.target.value })}
                      className="w-full h-9 px-2 rounded-lg bg-black/20 border border-white/10 text-white text-xs focus:ring-1 focus:ring-[#d4af37] outline-none"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] text-white/60 mb-1">ถึงวันที</label>
                    <input
                      type="date"
                      value={movementDateTo}
                      onChange={(e) => updateFilterState({ movementDateTo: e.target.value })}
                      className="w-full h-9 px-2 rounded-lg bg-black/20 border border-white/10 text-white text-xs focus:ring-1 focus:ring-[#d4af37] outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Categories + Export - Same row on mobile */}
              <div className="col-span-2 lg:col-span-1 flex gap-2">
                <div className="relative flex-1 lg:flex-none lg:w-48 group" ref={iccatDropdownRef}>
                  <button
                    onClick={() => updateUiState({ isIccatOpen: !isIccatOpen })}
                    className="w-full h-9 px-2 rounded-lg bg-black/20 border border-white/10 text-white text-xs flex items-center justify-between hover:bg-black/30 transition-colors"
                  >
                    <span className="truncate max-w-[80px] lg:max-w-[120px]">
                      {selectedIccat.length > 0 ? `${selectedIccat.length} หมวด` : "ทั้งหมด"}
                    </span>
                    <span className="opacity-50 text-[10px]">▼</span>
                  </button>
                  {isIccatOpen && (
                    <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 border border-gray-100">
                      <div className="flex justify-between items-center p-2 border-b border-gray-100 text-[10px] uppercase font-bold text-gray-500 mb-1">
                        <span>เลือกหมวดหมู่</span>
                        <div className="flex gap-2">
                          <button onClick={() => { updateFilterState({ selectedIccat: iccatCodesList }); hasCustomIccat.current = true; }} className="text-[#102C57] hover:underline">ทั้งหมด</button>
                          <button onClick={() => { updateFilterState({ selectedIccat: [] }); hasCustomIccat.current = true; }} className="text-red-500 hover:underline">ล้าง</button>
                        </div>
                      </div>
                      <div className="max-h-48 overflow-y-auto custom-scrollbar flex flex-col gap-0.5">
                        {iccatCodesList.map(code => (
                          <label key={code} className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded cursor-pointer">
                            <input type="checkbox" checked={selectedIccat.includes(code)} onChange={() => toggleIccat(code)} className="rounded w-3 h-3 text-[#102C57] border-gray-300" />
                            <span className="text-xs text-gray-700 truncate">{code} - {iccatNameByCode.get(code)}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {activeView === "summary" && (
                  <div className="relative flex-1 lg:flex-none lg:w-40" ref={statusDropdownRef}>
                    <button
                      onClick={() => updateUiState({ isStatusOpen: !isStatusOpen })}
                      className="w-full h-9 px-2 rounded-lg bg-black/20 border border-white/10 text-white text-xs flex items-center justify-between hover:bg-black/30 transition-colors"
                    >
                      <span className="truncate max-w-[90px] lg:max-w-[120px]">
                        {statusFilter === "all" ? "สถานะ: ทั้งหมด" : `สถานะ: ${statusFilter}`}
                      </span>
                      <span className="opacity-50 text-[10px]">▼</span>
                    </button>
                    {isStatusOpen && (
                      <div className="absolute top-full left-0 mt-1 w-40 bg-white rounded-xl shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 border border-gray-100">
                        <div className="p-2 border-b border-gray-100 text-[10px] uppercase font-bold text-gray-500 mb-1">
                          สถานะ
                        </div>
                        <div className="flex flex-col gap-0.5">
                          {STATUS_OPTIONS.map((option) => (
                            <button
                              key={option.value}
                              onClick={() => {
                                updateFilterState({ statusFilter: option.value });
                                updateUiState({ isStatusOpen: false });
                              }}
                              className={`text-left px-2 py-1.5 text-xs rounded hover:bg-gray-50 ${statusFilter === option.value ? "text-[#102C57] font-semibold" : "text-gray-700"
                                }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="relative flex-1 lg:flex-none hidden sm:flex" ref={exportDropdownRef}>
                  <button
                    onClick={() => updateUiState(prev => ({ ...prev, isExportOpen: !prev.isExportOpen }))}
                    disabled={uiState.exportLoading}
                    className="w-full lg:w-auto h-9 px-5 bg-[var(--surface-navy,#102C57)] hover:bg-[#0b1f3f] text-white text-xs font-bold rounded-lg shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <Download size={14} className="text-[#d4af37]" />
                    {uiState.exportLoading ? "กำลังดาวน์โหลด..." : "ดาวน์โหลด"}
                  </button>
                  <div
                    className={`absolute right-0 top-full mt-2 w-40 rounded-xl border border-white/10 bg-[#0f172a] text-white shadow-xl overflow-hidden transform transition-all duration-200 ${uiState.isExportOpen ? "opacity-100 translate-y-0 max-h-40" : "opacity-0 -translate-y-2 max-h-0 pointer-events-none"}`}
                  >
                    <button
                      onClick={() => handleExport("xlsx")}
                      className="w-full text-left px-4 py-2 text-xs hover:bg-white/10 transition-colors"
                    >
                      Excel (.xlsx)
                    </button>
                    <button
                      onClick={() => handleExport("csv")}
                      className="w-full text-left px-4 py-2 text-xs hover:bg-white/10 transition-colors"
                    >
                      CSV (.csv)
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex-1 hidden lg:block"></div>

              {/* Actions - Full width on mobile bottom */}
              <button
                onClick={handleSearch}
                disabled={loading}
                className="hidden lg:flex col-span-2 lg:col-span-1 w-full lg:w-auto h-9 px-6 bg-[#d4af37] hover:bg-[#b5952f] text-[#102C57] text-xs font-bold rounded-lg shadow-sm active:scale-95 transition-all items-center justify-center gap-2"
              >
                <Search size={14} />
                {loading ? "..." : "ค้นหา"}
              </button>

              <div className="col-span-2 lg:col-span-1 flex items-center justify-between lg:justify-start gap-2 rounded-lg px-2 py-1 text-[10px] text-white/90 border border-white/10 bg-black/20 shadow-[0_6px_18px_rgba(15,23,42,0.2)]">
                <button
                  onClick={handlePrevPage}
                  onMouseEnter={() => prefetchAdjacentPage("prev")}
                  disabled={pagination.page <= 1 || loading}
                  className="h-7 px-3 rounded-md border border-[#b5952f] bg-[#d4af37] text-[#102C57] hover:bg-[#b5952f] disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  ก่อนหน้า
                </button>
                <span className="px-3 py-1 rounded-md bg-black/30 border border-white/10 text-[10px] tracking-wide">
                  หน้า {pagination.page} / {pagination.totalPages}
                </span>
                <button
                  onClick={handleNextPage}
                  onMouseEnter={() => prefetchAdjacentPage("next")}
                  disabled={!canGoNext || loading}
                  className="h-7 px-3 rounded-md border border-[#b5952f] bg-[#d4af37] text-[#102C57] hover:bg-[#b5952f] disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  ถัดไป
                </button>
              </div>
            </div>

            {
              errorMessage && (
                <div className="text-[10px] text-red-300 bg-red-500/10 border border-red-500/20 px-3 py-1 rounded">
                  {errorMessage}
                </div>
              )
            }
          </div >
        </div >
      </div >

      <div
        ref={scrollRef}
        className="flex-1 -mt-1 overflow-x-auto overflow-y-auto w-full px-0 pb-4 relative z-10 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
      >

        <div className="bg-white rounded-none shadow-sm border border-gray-200 overflow-visible">

          {/* Desktop Table View */}
          <div className="hidden lg:block table-scroll">
            {activeView === "lot" ? (
              <div className="bg-[#f1f5f9] py-2 scroll-smooth">
                <div className="max-w-[98%] mx-auto bg-white rounded-sm border border-slate-300 overflow-hidden">
                  
                  {/* Document Header Block */}
                  <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-slate-200 bg-white text-xs">
                    <div className="min-w-0">
                      <h2 className="font-bold text-[#102C57] truncate">สินค้าคงเหลือวัตถุดิบ · แยก LOT</h2>
                      <p className="text-[10px] text-slate-500 truncate">
                        คงเหลืออ่านง่ายจากหน่วยจริงใน ERP · คำนวณมาตรฐานด้วยหน่วยฐาน
                      </p>
                    </div>
                    <div className="shrink-0 text-[10px] text-slate-500 font-mono">
                      {pagination.totalRecords.toLocaleString()} รายการ
                    </div>
                  </div>

                  <table className="w-full table-fixed border-collapse text-left text-sm table-compact">
                    <thead
                      className="bg-[var(--surface-navy,#102C57)] text-xs font-bold uppercase tracking-wider text-white text-center sticky top-0 z-20 shadow-md border-t-4 border-t-[#d4af37] border-b-2 border-[#102C57]"
                      style={lotIsVirtualized ? { display: "table", tableLayout: "fixed", width: "100%" } : undefined}
                    >
                      <tr>
                        <th className="px-2 py-2 text-left w-[100px] font-bold text-white text-xs border-r border-white/20">รหัสสินค้า</th>
                        <th className="px-2 py-2 text-left w-[170px] font-bold text-white text-xs border-r border-white/20">ชื่อสินค้า</th>
                        <th className="px-2 py-2 text-center w-[95px] font-bold text-white text-xs border-r border-white/20">หมายเลข LOT</th>
                        <th className="px-2 py-2 text-center w-[55px] font-bold text-white text-xs border-r border-white/20">คลัง</th>
                        <th className="px-2 py-2 text-right w-[95px] font-bold text-white text-xs border-r border-white/20">คงเหลืออ่านง่าย</th>
                        <th className="px-2 py-2 text-left w-[125px] font-bold text-white text-xs border-r border-white/20">หน่วย</th>
                        <th className="px-2 py-2 text-right w-[105px] font-bold text-white text-xs border-r border-white/20">จำนวนมาตรฐาน</th>
                        <th className="px-2 py-2 text-left w-[65px] font-bold text-white text-xs border-r border-white/20">หน่วย</th>
                        <th className="px-2 py-2 text-left w-[180px] font-bold text-white text-xs border-r border-white/20">รหัสหน่วยอ้างอิง</th>
                        <th className="px-2 py-2 text-left w-[130px] font-bold text-white text-xs">ประเภทวัตถุดิบ</th>
                      </tr>
                    </thead>
                    <tbody
                      className="bg-white text-gray-950"
                      style={lotRows.length > 0 ? { height: `${totalSize}px`, position: "relative", display: "block", width: "100%" } : undefined}
                    >
                      {loading && lotRows.length === 0 ? (
                        <tr>
                          <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                            กำลังโหลดข้อมูล...
                          </td>
                        </tr>
                      ) : lotRows.length > 0 ? (
                        virtualRows.map((virtualRow) => {
                          const row = lotRows[virtualRow.index];
                          if (!row) {
                            return null;
                          }
                          if (row?.type === "subtotal") {
                            return (
                              <tr
                                key={row.key}
                                ref={rowVirtualizer.measureElement}
                                data-index={virtualRow.index}
                                className="bg-slate-100 border-t border-b-2 border-b-[#d4af37] border-t-slate-300"
                                style={{
                                  position: "absolute",
                                  top: 0,
                                  left: 0,
                                  width: "100%",
                                  transform: `translateY(${virtualRow.start}px)`,
                                  display: "table",
                                  tableLayout: "fixed",
                                }}
                              >
                                <td className="px-2 py-1.5 w-[100px] align-middle border-r border-slate-200">
                                  <span className="text-xs font-bold text-[#102C57]">รวมยอด</span>
                                </td>
                                <td className="px-2 py-1.5 w-[170px] font-mono text-xs font-semibold text-[#102C57] border-r border-slate-200">{row.skuCode}</td>
                                <td className="px-2 py-1.5 w-[95px] border-r border-slate-200" />
                                <td className="px-2 py-1.5 w-[55px] border-r border-slate-200" />
                                <td
                                  colSpan={2}
                                  className="px-2 py-1.5 w-[220px] text-right text-xs font-bold text-[#102C57] border-r border-slate-200"
                                >
                                  {row.readableDisplay}
                                </td>
                                <td className="px-2 py-1.5 w-[105px] text-right font-mono text-xs font-bold text-[#102C57] border-r border-slate-200">{row.standardAmountDisplay}</td>
                                <td className="px-2 py-1.5 w-[65px] text-xs font-bold text-[#102C57] border-r border-slate-200">{row.standardUnitDisplay}</td>
                                <td className="px-2 py-1.5 w-[180px] border-r border-slate-200" />
                                <td className="px-2 py-1.5 w-[130px]" />
                              </tr>
                            );
                          }

                          const record = row.record;
                          const isAlternating = virtualRow.index % 2 === 1;
                          return (
                            <tr
                              key={row.key}
                              ref={rowVirtualizer.measureElement}
                              data-index={virtualRow.index}
                              className={`hover:bg-slate-50 border-b border-slate-200 transition-colors align-middle ${
                                isAlternating ? "bg-slate-50/10" : "bg-white"
                              }`}
                              style={{
                                position: "absolute",
                                top: 0,
                                  left: 0,
                                  width: "100%",
                                  transform: `translateY(${virtualRow.start}px)`,
                                  display: "table",
                                  tableLayout: "fixed",
                                }}
                              >
                                <td className="px-2 py-1.5 w-[100px] align-middle text-xs border-r border-slate-200">
                                  {row.showSku ? (
                                    <span className="font-mono font-bold text-[#102C57] text-xs">
                                      {record.BASE_GOODS_CODE || record.GOODS_CODE || record.SKU_CODE}
                                    </span>
                                  ) : (
                                    ""
                                  )}
                                </td>
                                <td className="px-2 py-1.5 w-[170px] align-middle text-xs border-r border-slate-200">
                                  {row.showSku ? (
                                    <div className="font-bold text-slate-800 text-xs break-words leading-tight">
                                      {record.SKU_NAME}
                                    </div>
                                  ) : (
                                    ""
                                  )}
                                </td>
                                <td className="px-2 py-1.5 w-[95px] align-middle text-center text-xs font-mono text-slate-800 border-r border-slate-200">
                                  {record.SKM_LOT_NO}
                                </td>
                                <td className="px-2 py-1.5 w-[55px] align-middle text-center text-xs font-mono font-bold text-[#102C57] border-r border-slate-200">
                                  {record.WL_CODE || "-"}
                                </td>
                                <td className="px-2 py-1.5 w-[95px] align-middle text-right text-xs font-mono font-bold text-[#102C57] border-r border-slate-200">
                                  {row.readableAmountDisplay}
                                </td>
                                <td className="px-2 py-1.5 w-[125px] align-middle text-xs font-bold text-[#102C57] border-r border-slate-200">
                                  {row.readableUnitDisplay}
                                </td>
                                <td className="px-2 py-1.5 w-[105px] align-middle text-right text-xs font-mono text-slate-800 border-r border-slate-200">
                                  {row.standardAmountDisplay}
                                </td>
                                <td className="px-2 py-1.5 w-[65px] align-middle text-xs font-semibold text-slate-700 border-r border-slate-200">
                                  {row.standardUnitDisplay}
                                </td>
                                <td className="px-2 py-1.5 w-[180px] align-middle text-[10px] font-mono text-[#8a6508] border-r border-slate-200">
                                  {row.referenceDisplay}
                                </td>
                                <td className="px-2 py-1.5 w-[130px] align-middle text-xs">
                                  <div className="text-xs text-slate-600 truncate max-w-[190px]" title={record.ICCAT_NAME || undefined}>
                                    {record.ICCAT_CODE || record.ICCAT_NAME ? (
                                      <>
                                        {record.ICCAT_CODE ? (
                                          <span className="font-mono font-bold text-[#102C57] mr-1">[{record.ICCAT_CODE}]</span>
                                        ) : null}
                                        {record.ICCAT_NAME}
                                      </>
                                    ) : (
                                      <span className="text-slate-400">-</span>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                              ไม่พบข้อมูล
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : activeView === "movement" ? (
              <table className="w-full table-fixed border-collapse text-left text-[10px] xl:text-xs table-bordered table-compact">
                <thead
                  className="bg-[var(--surface-navy,#102C57)] text-[10px] xl:text-xs uppercase tracking-wider text-white text-center sticky top-0 z-20 shadow-md"
                  style={movementIsVirtualized ? { display: "table", tableLayout: "fixed", width: "100%" } : undefined}
                >
                  <tr>
                    <th className="px-1 py-2 xl:px-2 xl:py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap w-[120px]">รหัส</th>
                    <th className="px-1 py-2 xl:px-2 xl:py-3 font-semibold border-b border-[#0f172a] w-[200px]">ชื่อสินค้า</th>
                    <th className="px-1 py-2 xl:px-2 xl:py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap w-12">หน่วย</th>
                    <th className="px-1 py-2 xl:px-2 xl:py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap w-[90px] text-center">ยกยอด</th>
                    <th className="px-1 py-2 xl:px-2 xl:py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap w-[120px] text-center">รับเพิ่มจากการซื้อ</th>
                    <th className="px-1 py-2 xl:px-2 xl:py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap w-[120px] text-center">รับเพิ่มจากการเบิกคืน</th>
                    <th className="px-1 py-2 xl:px-2 xl:py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap w-[90px] text-center">จ่ายออก</th>
                    <th className="px-1 py-2 xl:px-2 xl:py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap w-[90px] text-center">คงเหลือ</th>
                    <th className="px-1 py-2 xl:px-2 xl:py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap w-[90px] text-center">ใช้จริง</th>
                  </tr>
                </thead>
                <tbody
                  className="divide-y divide-gray-100 bg-white text-gray-950"
                  style={movementRows.length > 0 ? { height: `${totalSize}px`, position: "relative", display: "block", width: "100%" } : undefined}
                >
                  {loading && movementRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                        กำลังโหลดข้อมูล...
                      </td>
                    </tr>
                  ) : movementRows.length > 0 ? (
                    virtualRows.map((virtualRow) => {
                      const row = movementRows[virtualRow.index];
                      if (!row) {
                        return null;
                      }
                      const actualUsageValue = calculateActualUsage(row.OUT_QTY, row.IN_RETURN_QTY);

                      return (
                        <tr
                          key={`movement-${row.SKU_CODE}-${virtualRow.index}`}
                          ref={rowVirtualizer.measureElement}
                          data-index={virtualRow.index}
                          className="hover:bg-blue-50/50 transition-colors"
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            transform: `translateY(${virtualRow.start}px)`,
                            display: "table",
                            tableLayout: "fixed",
                          }}
                        >
                          <td className="px-1 py-2 xl:px-2 xl:py-3 w-[120px] font-mono text-[#102C57] whitespace-nowrap align-top text-sm">
                            {row.SKU_CODE}
                          </td>
                          <td className="px-1 py-2 xl:px-2 xl:py-3 w-[200px] align-top text-sm">
                            <div className="break-words leading-tight">{row.SKU_NAME}</div>
                          </td>
                          <td className="px-1 py-2 xl:px-2 xl:py-3 w-12 align-top text-sm">{row.UTQ_NAME}</td>
                          <td className="px-1 py-2 xl:px-2 xl:py-3 w-[90px] text-center text-[#102C57] font-semibold align-top text-sm">
                            {formatQtyDisplay(row.OPENING_QTY)}
                          </td>
                          <td className="px-1 py-2 xl:px-2 xl:py-3 w-[120px] text-center text-emerald-600 font-semibold align-top text-sm">
                            {formatQtyDisplay(row.IN_PURCHASE_QTY)}
                          </td>
                          <td className="px-1 py-2 xl:px-2 xl:py-3 w-[120px] text-center text-sky-600 font-semibold align-top text-sm">
                            {formatQtyDisplay(row.IN_RETURN_QTY)}
                          </td>
                          <td className="px-1 py-2 xl:px-2 xl:py-3 w-[90px] text-center text-rose-600 font-semibold align-top text-sm">
                            {formatQtyDisplay(row.OUT_QTY)}
                          </td>
                          <td className="px-1 py-2 xl:px-2 xl:py-3 w-[90px] text-center text-[#102C57] font-semibold align-top text-sm">
                            {formatQtyDisplay(row.ENDING_QTY)}
                          </td>
                          <td className="px-1 py-2 xl:px-2 xl:py-3 w-[90px] text-center text-[#102C57] font-semibold align-top text-sm">
                            {actualUsageValue === null ? "-" : formatQtyDisplay(actualUsageValue)}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                        ไม่พบข้อมูล
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            ) : (
              <table className="w-full table-fixed border-collapse text-left text-[10px] xl:text-xs table-bordered table-compact">
                <thead
                  className="bg-[var(--surface-navy,#102C57)] text-[10px] xl:text-xs uppercase tracking-wider text-white text-center sticky top-0 z-20 shadow-md"
                  style={summaryRows.length > 0
                    ? {
                      display: "grid",
                      gridTemplateColumns: SUMMARY_GRID_TEMPLATE,
                      gridTemplateRows: "34px 54px",
                      width: "100%",
                    }
                    : { display: "none" }}
                >
                  <tr style={{ display: "contents" }}>
                    <th className="px-2 py-2 font-semibold border-l border-r border-white/50 border-b border-[#0f172a] whitespace-nowrap flex items-center justify-center" style={{ gridColumn: "1", gridRow: "1 / 3" }}>รหัส</th>
                    <th className="px-2 py-2 font-semibold border-r border-white/50 border-b border-[#0f172a] flex items-center justify-center" style={{ gridColumn: "2", gridRow: "1 / 3" }}>ชื่อสินค้า</th>
                    <th className="px-2 py-1.5 font-bold border-r border-white/50 border-b border-[#d4af37] text-sm tracking-wide flex items-center justify-center" style={{ gridColumn: "3 / span 5", gridRow: "1" }}>สต็อก</th>
                    <th className="px-1 py-2 font-semibold border-r border-white/50 border-b border-[#0f172a] flex items-center justify-center" style={{ gridColumn: "8", gridRow: "1 / 3" }}>ต่ำสุด</th>
                    <th className="px-1 py-2 font-semibold border-r border-white/50 border-b border-[#0f172a] flex items-center justify-center" style={{ gridColumn: "9", gridRow: "1 / 3" }}>สูงสุด</th>
                    <th className="px-1 py-2 font-semibold border-r border-white/50 border-b border-[#0f172a] flex items-center justify-center" style={{ gridColumn: "10", gridRow: "1 / 3" }}>ถัวเฉลี่ย/วัน</th>
                    <th className="px-1 py-2 font-semibold border-r border-white/50 border-b border-[#0f172a] flex items-center justify-center" style={{ gridColumn: "11", gridRow: "1 / 3" }}>สั่งซื้อ<br />(ขั้นต่ำ)</th>
                    <th className="px-1 py-2 font-semibold border-r border-white/50 border-b border-[#0f172a] flex items-center justify-center" style={{ gridColumn: "12", gridRow: "1 / 3" }}>ใช้ได้/วัน</th>
                    <th className="px-1 py-2 font-semibold border-r border-white/50 border-b border-[#0f172a] flex items-center justify-center" style={{ gridColumn: "13", gridRow: "1 / 3" }}>ระยะเวลาส่ง<br />(วัน)</th>
                    <th className="px-1 py-2 font-semibold border-r border-white/50 border-b border-[#0f172a] flex items-center justify-center" style={{ gridColumn: "14", gridRow: "1 / 3" }}>ข้อมูล<br />การซื้อ</th>
                    <th className="px-1 py-2 font-semibold border-r border-white/50 border-b border-[#0f172a] flex items-center justify-center" style={{ gridColumn: "15", gridRow: "1 / 3" }}>สถานะ</th>
                  </tr>
                  <tr style={{ display: "contents" }}>
                    <th className="px-1 py-1.5 font-semibold border-r border-white/50 bg-[#163967] flex items-center justify-center text-center" style={{ gridColumn: "3", gridRow: "2" }}>จำนวน<br />หน่วยใหญ่</th>
                    <th className="px-1 py-1.5 font-semibold border-r border-white/50 bg-[#163967] flex items-center justify-center text-center" style={{ gridColumn: "4", gridRow: "2" }}>หน่วยใหญ่</th>
                    <th className="px-1 py-1.5 font-semibold border-r border-white/50 bg-[#163967] flex items-center justify-center text-center" style={{ gridColumn: "5", gridRow: "2" }}>จำนวนเศษ</th>
                    <th className="px-1 py-1.5 font-semibold border-r border-white/50 bg-[#163967] flex items-center justify-center text-center" style={{ gridColumn: "6", gridRow: "2" }}>หน่วยฐาน</th>
                    <th className="px-1 py-1.5 font-semibold border-r border-white/50 bg-[#163967] flex items-center justify-center text-center" style={{ gridColumn: "7", gridRow: "2" }}>จำนวน<br />มาตรฐาน</th>
                  </tr>
                </thead>
                <tbody
                  className="divide-y divide-gray-100 bg-white text-gray-950"
                  style={summaryRows.length > 0
                    ? { height: `${totalSize}px`, position: "relative", display: "block", width: "100%" }
                    : loading
                      ? { display: "block", width: "100%" }
                      : undefined}
                >
                  {loading && summaryRows.length === 0 ? (
                    <tr
                      className="w-full"
                      style={{
                        display: "grid",
                        gridTemplateColumns: SUMMARY_GRID_TEMPLATE,
                      }}
                    >
                      <td
                        colSpan={15}
                        className="col-span-full flex min-h-44 w-full items-center justify-center px-6 py-12 text-center text-sm text-slate-500"
                        style={{ gridColumn: "1 / -1" }}
                      >
                        กำลังโหลดข้อมูล...
                      </td>
                    </tr>
                  ) : summaryRows.length > 0 ? (
                    virtualRows.map((virtualRow) => {
                      const row = summaryRows[virtualRow.index];
                      if (!row) {
                        return null;
                      }
                      const stockBreakdown = getLotQuantityBreakdown(row);
                      const minMax = dataState.minMaxBySku.get(row.SKU_CODE);
                      const avgUsageValue = dataState.avgUsageBySku.get(row.SKU_CODE);
                      const hasAvgUsage = dataState.avgUsageBySku.has(row.SKU_CODE);
                      const remainingQty = toNumberOrZero(row.QTY);
                      const leadTimeDays = getLeadTimeDays(minMax);
                      const avgUsageNumber = getAvgUsageNumber(avgUsageValue);
                      const leadTimeDemand = getLeadTimeDemand(avgUsageValue, minMax);
                      const minQtyValue = leadTimeDemand;
                      const maxQtyValue = leadTimeDemand !== null
                        ? leadTimeDemand * HOLD_DAYS
                        : null;
                      const minOrderValue = Number.isFinite(Number(minMax?.SKU_MIN_ORDER))
                        ? Number(minMax.SKU_MIN_ORDER)
                        : null;
                      const packQtyValue = Number.isFinite(Number(minMax?.PACK_QTY))
                        ? Number(minMax.PACK_QTY)
                        : null;
                      const minOrderPackDisplay = minOrderValue !== null && packQtyValue
                        ? formatCeilNumberDisplay(minOrderValue / packQtyValue)
                        : "-";
                      const hasThreshold = minQtyValue !== null || leadTimeDemand !== null;
                      const needsOrder = (minQtyValue !== null && remainingQty <= minQtyValue)
                        || (leadTimeDemand !== null && remainingQty <= leadTimeDemand);
                      const statusText = hasThreshold
                        ? (needsOrder ? "ต้องสั่งซื้อ" : "ปกติ")
                        : "-";
                      const minQtyDisplay = minQtyValue !== null
                        ? formatCeilToTenDisplay(minQtyValue)
                        : "-";
                      const maxQtyDisplay = maxQtyValue !== null
                        ? formatCeilNumberDisplay(maxQtyValue)
                        : "-";
                      const avgUsageDisplay = hasAvgUsage
                        ? formatCeilNumberDisplay(avgUsageNumber)
                        : avgUsageLoading
                          ? "..."
                          : "-";
                      const availableDaysDisplay = hasAvgUsage && Number.isFinite(avgUsageValue) && avgUsageValue > 0
                        ? formatWholeNumberDisplay(toNumberOrZero(row.QTY) / avgUsageValue)
                        : avgUsageLoading
                          ? "..."
                          : "-";

                      return (
                        <tr
                          key={`summary-${row.SKU_CODE}-${row.ICCAT_CODE}-${virtualRow.index}`}
                          ref={rowVirtualizer.measureElement}
                          data-index={virtualRow.index}
                          className="hover:bg-blue-50/50 transition-colors"
                          style={{
                            position: "absolute",
                            top: 0,
                            left: 0,
                            width: "100%",
                            transform: `translateY(${virtualRow.start}px)`,
                            display: "grid",
                            gridTemplateColumns: SUMMARY_GRID_TEMPLATE,
                          }}
                        >
                          <td className="px-2 py-2 min-w-0 font-mono font-semibold text-[#102C57] whitespace-nowrap align-middle text-xs border-r border-slate-200">{row.SKU_CODE}</td>
                          <td className="px-2 py-2 min-w-0 align-middle text-xs border-r border-slate-200">
                            <div className="break-words leading-tight font-medium" title={row.SKU_NAME}>{row.SKU_NAME}</div>
                          </td>
                          <td className="px-1 py-2 min-w-0 text-center font-mono font-bold text-[#102C57] align-middle text-xs border-r border-slate-200">
                            {stockBreakdown.hasPackUnit && stockBreakdown.wholeStockUnits > 0 ? formatQuantityNumber(stockBreakdown.wholeStockUnits) : "-"}
                          </td>
                          <td className="px-1 py-2 min-w-0 align-middle text-center text-xs font-semibold border-r border-slate-200">
                            {stockBreakdown.hasPackUnit && stockBreakdown.wholeStockUnits > 0 ? stockBreakdown.stockUnitName : "-"}
                          </td>
                          <td className="px-1 py-2 min-w-0 text-center font-mono font-bold text-[#102C57] align-middle text-xs border-r border-slate-200">
                            {stockBreakdown.valid ? formatQuantityNumber(stockBreakdown.remainderBaseQuantity) : "-"}
                          </td>
                          <td className="px-1 py-2 min-w-0 align-middle text-center text-xs font-semibold border-r border-slate-200">{stockBreakdown.baseUnitName || "-"}</td>
                          <td className="px-1 py-2 min-w-0 text-center font-mono text-slate-800 align-middle text-xs border-r border-slate-200">
                            {stockBreakdown.valid ? formatQuantityNumber(stockBreakdown.baseQuantity) : "-"}
                          </td>
                          <td className="px-1 py-2 min-w-0 align-middle text-center text-xs text-amber-600 border-r border-slate-200">{minQtyDisplay}</td>
                          <td className="px-1 py-2 min-w-0 align-middle text-center text-xs text-sky-700 border-r border-slate-200">{maxQtyDisplay}</td>
                          <td className="px-1 py-2 min-w-0 align-middle text-center text-xs border-r border-slate-200">{avgUsageDisplay}</td>
                          <td className="px-1 py-2 min-w-0 align-middle text-center text-xs border-r border-slate-200">{minOrderPackDisplay}</td>
                          <td className="px-1 py-2 min-w-0 align-middle text-center text-xs border-r border-slate-200">{availableDaysDisplay}</td>
                          <td className="px-1 py-2 min-w-0 align-middle text-center text-xs border-r border-slate-200">
                            {Number.isFinite(Number(minMax?.SKU_LEAD_TIME))
                              ? Number(minMax.SKU_LEAD_TIME) + 2
                              : "-"}
                          </td>
                          <td className="px-1 py-2 min-w-0 align-middle text-center border-r border-slate-200">
                            <button
                              type="button"
                              onClick={() => openHistoryModal(row.SKU_CODE, row.SKU_NAME)}
                              className="inline-flex items-center justify-center gap-1 min-h-7 px-1 text-[#102C57] text-[10px] font-bold hover:text-[#8a6508] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37] focus-visible:ring-offset-1 transition-colors"
                              title="ดูประวัติการซื้อ"
                              aria-label={`ดูประวัติการซื้อ ${row.SKU_CODE}`}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" /><circle cx="12" cy="12" r="3" /></svg>
                              ดู
                            </button>
                          </td>
                          <td
                            className={`px-1 py-2 min-w-0 align-middle text-center text-xs ${statusText === "ต้องสั่งซื้อ"
                              ? "bg-red-600 text-white font-semibold"
                              : statusText === "ปกติ"
                                ? "bg-emerald-600 text-white font-semibold"
                                : ""
                              }`}
                          >
                            {statusText === "ต้องสั่งซื้อ" ? (
                              <span className="inline-flex items-center justify-center gap-1">
                                <AlertTriangle className="w-3.5 h-3.5" />
                                {statusText}
                              </span>
                            ) : statusText === "ปกติ" ? (
                              <span className="inline-flex items-center justify-center gap-1">
                                <CircleCheck className="w-3.5 h-3.5" />
                                {statusText}
                              </span>
                            ) : (
                              statusText
                            )}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={15} className="px-6 py-12 text-center text-gray-500">
                        ไม่พบข้อมูล
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* Mobile Card View */}
          <div className="lg:hidden flex flex-col gap-3 p-4">
                {activeView === "lot" ? (
                  loading && mobileLotGroups.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 text-sm">กำลังโหลดข้อมูล...</div>
                  ) : mobileLotGroups.length > 0 ? (
                    mobileLotGroups.map((group) => (
                      <section key={`mobile-lot-${group.skuCode}`} className="bg-white border border-slate-300 rounded-sm overflow-hidden">
                        <div className="px-3 py-2 bg-slate-100 border-b border-slate-300">
                          <div className="flex items-start justify-between gap-2 text-xs">
                            <span className="font-mono font-bold text-[#102C57]">{group.skuCode}</span>
                            <span className="text-[10px] text-slate-600">[{group.categoryCode}] {group.categoryName}</span>
                          </div>
                          <p className="mt-0.5 text-xs text-slate-600 truncate">{group.skuName}</p>
                          <div className="mt-1.5 flex items-baseline justify-between gap-2">
                            <span className="text-sm font-bold text-[#102C57]">{group.readableDisplay}</span>
                            <span className="text-[10px] text-slate-500">รวม {group.standardDisplay}</span>
                          </div>
                        </div>
                        <div>
                          {group.rows.map(({ record, breakdown }, index) => (
                            <div
                              key={`${group.skuCode}-${record.SKM_LOT_NO}-${record.WL_CODE || "warehouse"}-${index}`}
                              className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 px-3 py-2 border-b border-slate-200 last:border-b-0 text-xs"
                            >
                              <span className="font-mono font-semibold text-slate-800">
                                LOT {record.SKM_LOT_NO || "-"} · คลัง {record.WL_CODE || "-"}
                              </span>
                              <span className="font-bold text-[#102C57] text-right">{formatReadableLotQuantity(breakdown)}</span>
                              <span className="font-mono text-[10px] text-[#8a6508] truncate">{formatLotUnitReference(breakdown)}</span>
                              <span className="text-[10px] text-slate-500 text-right">
                                มาตรฐาน {breakdown.valid ? `${formatQuantityNumber(breakdown.baseQuantity)} ${breakdown.baseUnitName}` : "-"}
                              </span>
                            </div>
                          ))}
                        </div>
                      </section>
                    ))
              ) : (
                <div className="text-center py-12 text-gray-400 text-sm">ไม่พบข้อมูล</div>
              )
            ) : activeView === "movement" ? (
              loading && movementRows.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">กำลังโหลดข้อมูล...</div>
              ) : movementRows.length > 0 ? (
                movementRows.map((row, index) => (
                  <div key={`mob-move-${row.SKU_CODE}-${index}`} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col gap-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <span className="inline-block bg-[var(--surface-navy,#102C57)] text-white text-[10px] px-2 py-0.5 rounded font-mono mb-1">{row.SKU_CODE}</span>
                        <h3 className="text-sm font-bold text-gray-800 leading-tight">{row.SKU_NAME}</h3>
                      </div>
                    </div>

                    <div className="flex items-center text-[10px] text-gray-400">
                      <span>{row.UTQ_NAME}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-gray-50 text-xs">
                      <div>
                        <span className="text-gray-400 block text-[10px]">ยกยอด</span>
                        <span className="font-semibold text-gray-700">{formatQtyDisplay(row.OPENING_QTY)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-gray-400 block text-[10px]">รับเพิ่มจากการซื้อ</span>
                        <span className="font-semibold text-emerald-600">{formatQtyDisplay(row.IN_PURCHASE_QTY)}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block text-[10px]">รับเพิ่มจากการเบิกคืน</span>
                        <span className="font-semibold text-sky-600">{formatQtyDisplay(row.IN_RETURN_QTY)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-gray-400 block text-[10px]">จ่ายออก</span>
                        <span className="font-semibold text-rose-600">{formatQtyDisplay(row.OUT_QTY)}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-gray-400 block text-[10px]">คงเหลือ</span>
                        <span className="font-semibold text-[#102C57]">{formatQtyDisplay(row.ENDING_QTY)}</span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-gray-400 text-sm">ไม่พบข้อมูล</div>
              )
            ) : (
              // Summary View Mobile
              loading && summaryRows.length === 0 ? (
                <div className="text-center py-12 text-gray-400 text-sm">กำลังโหลดข้อมูล...</div>
              ) : summaryRows.length > 0 ? (
                summaryRows.map((row, index) => {
                  const stockBreakdown = getLotQuantityBreakdown(row);
                  const minMax = dataState.minMaxBySku.get(row.SKU_CODE);
                  const leadTimeDays = getLeadTimeDays(minMax);
                  const avgUsageValue = dataState.avgUsageBySku.get(row.SKU_CODE);
                  const leadTimeDemand = getLeadTimeDemand(avgUsageValue, minMax);
                  const minQtyDisplay = leadTimeDemand !== null
                    ? formatCeilToTenDisplay(leadTimeDemand)
                    : "-";
                  const maxQtyDisplay = leadTimeDemand !== null
                    ? formatCeilNumberDisplay(leadTimeDemand * HOLD_DAYS)
                    : "-";
                  const minOrderValue = Number.isFinite(Number(minMax?.SKU_MIN_ORDER))
                    ? Number(minMax.SKU_MIN_ORDER)
                    : null;
                  const packQtyValue = Number.isFinite(Number(minMax?.PACK_QTY))
                    ? Number(minMax.PACK_QTY)
                    : null;
                  const leadTimeValue = Number.isFinite(Number(minMax?.SKU_LEAD_TIME))
                    ? Number(minMax.SKU_LEAD_TIME)
                    : null;
                  const minOrderPackDisplay = minOrderValue !== null && packQtyValue
                    ? formatCeilNumberDisplay(minOrderValue / packQtyValue)
                    : "-";
                  return (
                    <div key={`mob-sum-${row.SKU_CODE}-${row.ICCAT_CODE}-${index}`} className="bg-white rounded-sm p-3 border border-slate-300 flex flex-col gap-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="inline-block bg-[var(--surface-navy,#102C57)] text-white text-[10px] px-2 py-0.5 font-mono mb-1">{row.SKU_CODE}</span>
                          <h3 className="text-sm font-bold text-gray-800 leading-tight">{row.SKU_NAME}</h3>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 border border-slate-200 divide-x divide-slate-200">
                        <div className="p-2">
                          <span className="block text-[9px] text-slate-500">หน่วยใหญ่</span>
                          <span className="text-sm font-bold text-[#102C57]">
                            {stockBreakdown.hasPackUnit && stockBreakdown.wholeStockUnits > 0
                              ? `${formatQuantityNumber(stockBreakdown.wholeStockUnits)} ${stockBreakdown.stockUnitName}`
                              : "-"}
                          </span>
                        </div>
                        <div className="p-2">
                          <span className="block text-[9px] text-slate-500">จำนวนเศษ</span>
                          <span className="text-sm font-bold text-[#102C57]">
                            {stockBreakdown.valid ? formatQuantityNumber(stockBreakdown.remainderBaseQuantity) : "-"} {stockBreakdown.baseUnitName}
                          </span>
                        </div>
                        <div className="col-span-2 flex items-center justify-between px-2 py-1.5 border-t border-slate-200 bg-slate-50">
                          <span className="text-[9px] text-slate-500">จำนวนมาตรฐาน</span>
                          <span className="text-xs font-mono font-bold text-slate-800">
                            {stockBreakdown.valid ? formatQuantityNumber(stockBreakdown.baseQuantity) : "-"} {stockBreakdown.baseUnitName}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-2 pt-2 border-t border-gray-50 text-xs text-center bg-gray-50/50 rounded-lg p-2">
                        <div>
                          <span className="block text-[9px] text-gray-400 uppercase">ต่ำสุด</span>
                          <span className="font-semibold text-amber-600">{minQtyDisplay}</span>
                        </div>
                        <div>
                          <span className="block text-[9px] text-gray-400 uppercase">สูงสุด</span>
                          <span className="font-semibold text-sky-700">{maxQtyDisplay}</span>
                        </div>
                        <div>
                          <span className="block text-[9px] text-gray-400 uppercase">สั่งซื้อขั้นต่ำ</span>
                          <span className="font-semibold text-gray-700">{minOrderPackDisplay}</span>
                        </div>
                        <div>
                          <span className="block text-[9px] text-gray-400 uppercase">สั่งขั้นต่ำ</span>
                          <span className="font-semibold text-blue-600">{minMax?.SKU_MIN_ORDER ?? "-"}</span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => openHistoryModal(row.SKU_CODE, row.SKU_NAME)}
                        className="min-h-9 border border-[#d4af37]/70 bg-[#fffdf5] text-[#102C57] text-xs font-bold hover:bg-[#fff7d6]"
                      >
                        ดูประวัติการซื้อ
                      </button>
                    </div>
                  )
                })
              ) : (
                <div className="text-center py-12 text-gray-400 text-sm">ไม่พบข้อมูล</div>
              )
            )}
          </div>


        </div>
      </div>

      {/* Supplier History Modal */}
      {
        isHistoryModalOpen && selectedSkuForHistory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-sm shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[84vh] border-t-4 border-[#d4af37]">
              <div className="px-4 sm:px-6 py-3 bg-[var(--surface-navy,#102C57)] text-white flex justify-between items-center shrink-0">
                <div>
                  <h2 className="text-lg font-bold">ประวัติการสั่งซื้อ</h2>
                  <div className="text-xs text-blue-200 font-mono mt-0.5">{selectedSkuForHistory.skuCode} - {selectedSkuForHistory.skuName}</div>
                </div>
                <button
                  onClick={() => updateUiState({ isHistoryModalOpen: false })}
                  className="text-white/70 hover:text-white transition-colors"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m15 9-6 6" /><path d="m9 9 6 6" /></svg>
                </button>
              </div>

              <div className="overflow-auto p-3 sm:p-4">
                {uiState.supplierHistoryLoading ? (
                  <div className="text-center py-8 text-gray-500 text-sm">กำลังโหลดประวัติการสั่งซื้อ...</div>
                ) : selectedSkuForHistory.history.length > 0 ? (
                  <table className="w-full min-w-[760px] text-sm text-left border-collapse">
                    <thead className="bg-gray-50 text-gray-500 font-medium">
                      <tr>
                        <th className="px-3 py-2 border-b border-gray-100">ผู้ขาย</th>
                        <th className="px-3 py-2 border-b border-gray-100 text-center">วันที่ซื้อล่าสุด</th>
                        <th className="px-3 py-2 border-b border-gray-100 text-right">ราคาต่อหน่วย</th>
                        <th className="px-3 py-2 border-b border-gray-100 text-right">จำนวน</th>
                        <th className="px-3 py-2 border-b border-gray-100">หน่วย</th>
                        <th className="px-3 py-2 border-b border-gray-100 text-right">ยอดก่อนภาษี</th>
                        <th className="px-3 py-2 border-b border-gray-100 text-right">ภาษี</th>
                        <th className="px-3 py-2 border-b border-gray-100 text-right">รวมภาษี</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {selectedSkuForHistory.history.map((record, idx) => (
                        <tr key={`${record.AP_CODE}-${idx}`} className="hover:bg-blue-50/30">
                          <td className="px-3 py-2">
                            <div className="font-bold text-[#102C57]">{record.AP_NAME}</div>
                            <div className="text-[10px] text-gray-400 font-mono">{record.AP_CODE}</div>
                          </td>
                          <td className="px-3 py-2 text-center text-gray-600">{formatDateDisplay(record.DI_DATE)}</td>
                          <td className="px-3 py-2 text-right font-bold text-[#d4af37]">{record.PRICE?.toLocaleString()}</td>
                          <td className="px-3 py-2 text-right font-semibold text-[#102C57]">{formatQtyDisplay(record.QTY)}</td>
                          <td className="px-3 py-2 text-gray-500">{record.UNIT}</td>
                          <td className="px-3 py-2 text-right font-semibold text-slate-700">{formatQtyDisplay(record.SELL_AMOUNT)}</td>
                          <td className="px-3 py-2 text-right font-semibold text-orange-700">{formatQtyDisplay(record.VAT_AMOUNT)}</td>
                          <td className="px-3 py-2 text-right font-bold text-emerald-700">{formatQtyDisplay(record.AMOUNT)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    ไม่พบประวัติการสั่งซื้อ
                  </div>
                )}
              </div>
              <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 text-right shrink-0">
                <button
                  onClick={() => updateUiState({ isHistoryModalOpen: false })}
                  className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm"
                >
                  ปิดหน้าต่าง
                </button>
              </div>
            </div>
          </div>
        )
      }



    </div >
  );
}
