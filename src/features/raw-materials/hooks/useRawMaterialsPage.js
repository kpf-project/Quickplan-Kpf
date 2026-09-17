import { useState, useMemo, useEffect, useCallback } from "react";
import useSWRInfinite from "swr/infinite";
import { useSWRConfig } from "swr";
import { fetcher } from "@/lib/clientFetch";
import { fetchSkuMinMax } from "@/features/sku-min-max/services/skuMinMaxClient";
import { fetchSuppliers } from "@/features/suppliers/services/suppliersClient";
import { fetchIccatTypes } from "@/features/products/services/productsClient";
import { fetchRawMaterialsMovement } from "@/features/raw-materials/services/rawMaterialsClient";

const DEFAULT_ICCAT_CODES = ["01", "02", "03", "05", "08", "10"];
const BUSINESS_REFRESH_INTERVAL = 120000; // 2 minutes
const OFF_HOURS_REFRESH_INTERVAL = 0;

// Debounce hook
function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);
    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);
  return debouncedValue;
}

// Helper: Format date input
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

// Helper: Parse DD/MM/YYYY
const parseDate = (dateStr) => {
  if (!dateStr) return 0;
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).getTime();
  }
  return new Date(dateStr).getTime();
};

const toNumberOrZero = (value) => {
  const parsed = Number((value ?? "").toString().replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
};

// Helper: Normalize SKU
const normalizeSku = (sku) => String(sku || "").trim().toUpperCase();

export function useRawMaterialsPage({ initialView = "summary", skipDeduction = false }) {
  // --- View State ---
  const [activeView, setActiveView] = useState(
    initialView === "lot" ? "lot" : initialView === "movement" ? "movement" : "summary"
  );

  // --- Filter State ---
  const [skuName, setSkuName] = useState("");
  const debouncedSkuName = useDebounce(skuName, 300);
  const [statusFilter, setStatusFilter] = useState("all");
  const [brandCodes, setBrandCodes] = useState("");
  const [selectedIccat, setSelectedIccat] = useState(DEFAULT_ICCAT_CODES);
  const [movementDateFrom, setMovementDateFrom] = useState(getDefaultDateRange().from);
  const [movementDateTo, setMovementDateTo] = useState(getDefaultDateRange().to);
  const [refreshTick, setRefreshTick] = useState(0);
  const { mutate: mutateCache } = useSWRConfig();
  const prefetchKeyRef = useRef("");

  // --- Metadata State ---
  const [iccatOptions, setIccatOptions] = useState([]);
  const [minMaxBySku, setMinMaxBySku] = useState(new Map());
  const [supplierHistory, setSupplierHistory] = useState(new Map());
  const [avgUsageBySku, setAvgUsageBySku] = useState(new Map());

  // --- SWR Key Generator ---
  const getKey = useCallback((pageIndex, previousPageData) => {
    if (previousPageData && !previousPageData.cursor?.next) return null;
    const cursor = previousPageData?.cursor?.next;

    const params = new URLSearchParams();
    params.set("page", (pageIndex + 1).toString());
    params.set("pageSize", "100");
    if (skipDeduction) {
      params.set("skipDeduction", "true");
    }

    // Filters
    if (debouncedSkuName) params.set("skuName", debouncedSkuName);
    if (brandCodes) params.set("brandCodes", brandCodes);
    if (selectedIccat.length) params.set("iccatCodes", selectedIccat.join(","));
    if (cursor) params.set("cursor", cursor);

    // Endpoint selection based on view
    let endpoint = "";
    if (activeView === "summary") {
      endpoint = "/api/raw-materials-summary";
    } else if (activeView === "movement") {
      endpoint = "/api/raw-materials-movement";
      if (movementDateFrom) params.set("dateFrom", movementDateFrom);
      if (movementDateTo) params.set("dateTo", movementDateTo);
    } else {
      endpoint = "/api/raw-materials";
    }

    return `${endpoint}?${params.toString()}`;
  }, [
    activeView,
    debouncedSkuName,
    brandCodes,
    selectedIccat,
    movementDateFrom,
    movementDateTo,
    skipDeduction
  ]);

  // --- Main Data Fetching (SWR Infinite) ---
  const refreshInterval = (() => {
    const now = new Date();
    const hour = now.getHours();
    const isBusinessHours = hour >= 8 && hour < 19;
    return isBusinessHours ? BUSINESS_REFRESH_INTERVAL : OFF_HOURS_REFRESH_INTERVAL;
  })();

  useEffect(() => {
    const timerId = setInterval(() => {
      setRefreshTick((value) => value + 1);
    }, 60000);
    return () => clearInterval(timerId);
  }, []);

  const { data, error, isLoading, size, setSize, mutate } = useSWRInfinite(getKey, fetcher, {
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    revalidateIfStale: true,
    revalidateFirstPage: true,
    refreshInterval,
    keepPreviousData: true,
    parallel: true, // Attempt parallel fetching if supported
    dedupingInterval: 5000,
  });

  useEffect(() => {
    if (!data || !data.length) return;
    const previousPageData = data[size - 1];
    const nextKey = getKey(size, previousPageData);
    if (nextKey && prefetchKeyRef.current !== nextKey) {
      prefetchKeyRef.current = nextKey;
      mutateCache(nextKey, fetcher(nextKey), { populateCache: true, revalidate: false });
    }

    if (size > 1) {
      const prevKey = getKey(size - 2, data[size - 2]);
      if (prevKey) {
        mutateCache(prevKey, fetcher(prevKey), { populateCache: true, revalidate: false });
      }
    }
  }, [data, getKey, mutateCache, size]);

  // Reset pagination when filters or view change
  useEffect(() => {
    setSize(1);
  }, [
    activeView,
    debouncedSkuName,
    statusFilter,
    brandCodes,
    selectedIccat,
    movementDateFrom,
    movementDateTo,
    setSize
  ]);

  // --- Derived Data ---
  const currentPageData = data ? data[size - 1] : null;
  const records = data ? data.flatMap(page => page.data || []) : [];

  const pagination = currentPageData?.pagination ?? {
    page: size,
    pageSize: 100,
    totalRecords: 0,
    totalPages: 1,
  };

  const cursorInfo = currentPageData?.cursor ?? { next: null, hasMore: false };
  const canGoNext = cursorInfo.hasMore && Boolean(cursorInfo.next);

  // --- Metadata Fetching Effects ---
  // Load ICCAT Options
  useEffect(() => {
    fetchIccatTypes({}).then(result => {
      if (result.ok) {
        const options = (result.data?.data ?? []).map((item) => ({
          code: item.ICCAT_CODE,
          name: item.ICCAT_NAME,
        }));
        setIccatOptions(options);
      }
    });
  }, []);

  // Load MinMax Data (for Summary View)
  useEffect(() => {
    if (activeView === "summary" && minMaxBySku.size === 0) {
      fetchSkuMinMax({ pageSize: "10000" }).then(result => {
        if (result.ok) {
          const nextMap = new Map();
          (result.data?.data ?? []).forEach((row) => {
            if (row?.SKU_CODE) {
              nextMap.set(normalizeSku(row.SKU_CODE), {
                SKU_MIN_QTY: row.SKU_MIN_QTY,
                SKU_MAX_QTY: row.SKU_MAX_QTY,
                SKU_MIN_ORDER: row.SKU_MIN_ORDER,
                PACK_QTY: row.UTQ_QTY_1,
                SKU_LEAD_TIME: row.SKU_LEAD_TIME,
              });
            }
          });
          setMinMaxBySku(nextMap);
        }
      });
    }
  }, [activeView, minMaxBySku.size]);

  // Load Supplier History (for Summary View)
  useEffect(() => {
    if (activeView === "summary" && supplierHistory.size === 0) {
      fetchSuppliers({ pageSize: "10000" }).then(result => {
        if (result.ok) {
          const historyMap = new Map();
          (result.data?.data ?? []).forEach((record) => {
            if (!record.SKU_CODE) return;
            const sku = normalizeSku(record.SKU_CODE);

            if (!historyMap.has(sku)) {
              historyMap.set(sku, new Map());
            }
            const skuMap = historyMap.get(sku);
            const newDateVal = parseDate(record.DI_DATE);

            if (!skuMap.has(record.AP_CODE) || newDateVal > skuMap.get(record.AP_CODE).dateVal) {
              skuMap.set(record.AP_CODE, {
                AP_CODE: record.AP_CODE,
                AP_NAME: record.AP_NAME,
                DI_DATE: record.DI_DATE,
                dateVal: newDateVal,
                PRICE: record.TRD_U_PRC,
                UNIT: record.TRD_UTQNAME
              });
            }
          });

          const finalMap = new Map();
          historyMap.forEach((skuMap, skuKey) => {
            const list = Array.from(skuMap.values()).sort((a, b) => b.dateVal - a.dateVal);
            finalMap.set(skuKey, list);
          });
          setSupplierHistory(finalMap);
        }
      });
    }
  }, [activeView, supplierHistory.size]);

  const fetchAvgUsage = useCallback(async () => {
    const exportPageSize = 1000;
    let page = 1;
    let cursorValue = null;
    let hasMore = true;
    const totalsBySku = new Map();
    const { year, from, to } = getPreviousYearRange();
    const daysInYear = getDaysInYear(year);

    while (hasMore) {
      const fetchParams = new URLSearchParams();
      fetchParams.append("page", page.toString());
      fetchParams.append("pageSize", exportPageSize.toString());
      fetchParams.append("dateFrom", from);
      fetchParams.append("dateTo", to);
      if (cursorValue) {
        fetchParams.append("cursor", cursorValue);
      }

      const result = await fetchRawMaterialsMovement(fetchParams);
      if (!result.ok) {
        throw new Error("Unable to load raw materials movement.");
      }
      const payload = result.data;
      const data = payload?.data ?? [];
      data.forEach((record) => {
        const skuCode = normalizeSku(record.SKU_CODE);
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
    setAvgUsageBySku(avgBySku);
  }, []);

  useEffect(() => {
    if (activeView === "summary" && avgUsageBySku.size === 0) {
      const timerId = setTimeout(() => {
        fetchAvgUsage().catch(console.error);
      }, 0);
      return () => clearTimeout(timerId);
    }
  }, [activeView, fetchAvgUsage, avgUsageBySku.size]);

  // --- Handlers ---
  const loadData = (targetPage) => {
    if (targetPage > size) {
      setSize(targetPage);
    } else if (targetPage < size) {
      setSize(targetPage);
    } else {
      mutate();
    }
  };

  const iccatNameByCode = useMemo(() => {
    const mapping = new Map();
    iccatOptions.forEach((option) => {
      if (option?.code) mapping.set(option.code, option.name || "");
    });
    return mapping;
  }, [iccatOptions]);

  return {
    // State
    activeView,
    setActiveView,
    records,
    loading: isLoading,
    errorMessage: error?.message || "",
    pagination: { ...pagination, page: size },
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
    mutate // Expose for manual refresh
  };
}
