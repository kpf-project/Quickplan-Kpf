"use client";

import { Html5Qrcode } from "html5-qrcode";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Activity,
  CalendarRange,
  Camera,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
  ClipboardList,
  Filter,
  ListChecks,
  Loader2,
  ScanSearch,
  Search,
  Square,
  SwitchCamera,
  X,
  History,
  RotateCcw,
  Check,
  ScanLine,
  Boxes,
} from "lucide-react";

/* ── Custom Stock Issue Icon ──────────────────────────────────────────── */
function StockIssueIcon({ size = 24, className = "" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
    >
      {/* open box */}
      <path d="M6 18 L6 40 C6 41.1 6.9 42 8 42 L40 42 C41.1 42 42 41.1 42 40 L42 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* box lid / flaps */}
      <path d="M3 14 L24 6 L45 14 L24 18 Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" fill="none" />
      {/* center line */}
      <line x1="24" y1="18" x2="24" y2="42" stroke="currentColor" strokeWidth="1.4" strokeDasharray="3 2" />
      {/* upward arrow – the 'issue / เบิก' action */}
      <line x1="24" y1="35" x2="24" y2="23" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <polyline points="18,28 24,22 30,28" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

import ProductionJamUsageDialog from "@/features/production-line/components/ProductionJamUsageDialog";
import WeightScalePrimaryHeader from "@/features/production-line/components/WeightScalePrimaryHeader";
import { createBarcodeScanQueue } from "@/features/production-line/lib/barcodeScanQueue";
import {
  cancelProductionStockIssueRequest,
  createProductionStockIssueRequest,
  createProductionStockIssuesBatchRequest,
  fetchProductionStockIssueAvailableReceipts,
} from "@/features/production-line/services/productionStockIssueClient";

const ISSUE_TYPE_VISUALS = Object.freeze({
  KPF: {
    logoSrc: "/brand/LOGO-KPF1.png",
    logoAlt: "KPF",
  },
  PB: {
    logoSrc: "/brand/LOGO PB1.png",
    logoAlt: "PB",
  },
  PRISON: {
    shortLabel: "RJ",
  },
});

function formatWeight(value) {
  return Number(value || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatQuantity(value) {
  return Number(value || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function formatDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(date);
}

function normalizeIssueRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((row) => ({
    issueItemId: String(row?.issueItemId || "").trim(),
    issueNo: String(row?.issueNo || "").trim(),
    issueType: String(row?.issueType || "").trim().toUpperCase(),
    issueDate: String(row?.issueDate || "").trim(),
    issuedAt: row?.issuedAt || null,
    barcode: String(row?.barcode || "").trim() || "-",
    productCode: String(row?.productCode || "").trim().toUpperCase() || "-",
    productName: String(row?.productName || "").trim() || "-",
    targetProductCode: String(row?.targetProductCode || "").trim().toUpperCase(),
    targetProductName: String(row?.targetProductName || "").trim(),
    targetProductCategoryCode: String(row?.targetProductCategoryCode || "").trim().toUpperCase(),
    destinationRoomCode: String(row?.destinationRoomCode || "").trim().toUpperCase(),
    destinationRoomName: String(row?.destinationRoomName || "").trim(),
    lotNo: String(row?.lotNo || "").trim() || "-",
    quantity: Number(row?.quantity || 0),
    weightKg: Number(row?.weightKg || 0),
  }));
}

function normalizeAvailableRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((row) => ({
    receiptId: String(row?.receiptId || "").trim(),
    barcode: String(row?.barcode || "").trim() || "-",
    productCode: String(row?.productCode || "").trim().toUpperCase() || "-",
    productName: String(row?.productName || "").trim() || "-",
    lotNo: String(row?.lotNo || "").trim() || "-",
    quantity: Number(row?.quantity || 1),
    weightKg: Number(row?.weightKg ?? row?.netWeightKg ?? 0),
    weighedAt: row?.weighedAt || null,
  }));
}

function getIssueTypeLabel(issueTypes, issueType) {
  return issueTypes.find((option) => option.value === issueType)?.label || issueType;
}

function getStatusTone(state) {
  if (state === "ready") {
    return "border-emerald-300 bg-emerald-50 text-emerald-700";
  }
  if (state === "processing") {
    return "border-amber-300 bg-amber-50 text-amber-700";
  }
  if (state === "error") {
    return "border-rose-300 bg-rose-50 text-rose-700";
  }
  if (state === "success") {
    return "border-emerald-300 bg-emerald-50 text-emerald-700";
  }
  return "border-slate-300 bg-slate-50 text-slate-700";
}

export default function ProductionStockIssuePageClient({
  scope,
  issueTypes,
  destinationRooms = [],
  initialRecentIssues,
  todayIssueDate,
  initialSummary,
}) {
  const barcodeInputRef = useRef(null);
  const issueTypeMenuRef = useRef(null);
  const scannerRef = useRef(null);
  const scannerRegionIdRef = useRef(`issue-barcode-reader-${Math.random().toString(16).slice(2)}`);
  const isSubmittingRef = useRef(false);
  const scanQueueRef = useRef(null);
  if (!scanQueueRef.current) {
    scanQueueRef.current = createBarcodeScanQueue();
  }
  const [issueType, setIssueType] = useState(issueTypes[0]?.value || "KPF");
  const [destinationRoomCode, setDestinationRoomCode] = useState("");
  const [isJamUsageOpen, setIsJamUsageOpen] = useState(false);
  const [issueDate, setIssueDate] = useState(todayIssueDate || "");
  const [isIssueTypeMenuOpen, setIsIssueTypeMenuOpen] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [status, setStatus] = useState({
    state: "ready",
    message: "พร้อมรับสแกนบาร์โค้ดเพื่อเบิก",
    readAt: null,
  });
  const [lastScannedItem, setLastScannedItem] = useState(null);
  const [toast, setToast] = useState(null);
  const [rows, setRows] = useState(() => normalizeIssueRows(initialRecentIssues));
  const [summary, setSummary] = useState(initialSummary || { totalCount: 0, totalWeightKg: 0 });
  const [activeIssueItemId, setActiveIssueItemId] = useState("");
  const [isPending, startTransition] = useTransition();
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [currentCameraId, setCurrentCameraId] = useState(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isMobileFiltersOpen, setIsMobileFiltersOpen] = useState(false);
  const [isProductFilterOpen, setIsProductFilterOpen] = useState(false);
  const [isPickerLoading, setIsPickerLoading] = useState(false);
  const [pickerRows, setPickerRows] = useState([]);
  const [pickerSummary, setPickerSummary] = useState({ totalCount: 0, totalWeightKg: 0 });
  const [pickerPagination, setPickerPagination] = useState({
    page: 1,
    limit: 50,
    totalCount: 0,
    totalPages: 0,
  });
  const [pickerFilters, setPickerFilters] = useState({
    dateFrom: "",
    dateTo: "",
    search: "",
    productCodes: [],
  });
  const [selectedPickerItems, setSelectedPickerItems] = useState(() => new Map());

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  const totalPages = Math.ceil(rows.length / itemsPerPage);
  const paginatedRows = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return rows.slice(startIndex, startIndex + itemsPerPage);
  }, [rows, currentPage]);

  const productSummaries = useMemo(() => {
    const map = new Map();
    for (const row of rows) {
      const code = row.productCode || "-";
      const name = row.productName || code;
      const current = map.get(code) || {
        productCode: code,
        productName: name,
        count: 0,
        totalQuantity: 0,
        totalWeightKg: 0,
      };
      current.count += 1;
      current.totalQuantity += Number(row.quantity || 0);
      current.totalWeightKg = Number((current.totalWeightKg + Number(row.weightKg || 0)).toFixed(3));
      map.set(code, current);
    }
    return Array.from(map.values()).sort((a, b) => a.productCode.localeCompare(b.productCode));
  }, [rows]);

  useEffect(() => {
    setCurrentPage(1);
  }, [rows.length]);

  const focusBarcodeInput = useCallback((preventScroll = false) => {
    if (!barcodeInputRef.current) {
      return;
    }

    if (preventScroll) {
      barcodeInputRef.current.focus({ preventScroll: true });
      return;
    }

    barcodeInputRef.current.focus();
  }, []);

  useEffect(() => {
    focusBarcodeInput();
    setStatus((current) => ({
      ...current,
      readAt: current.readAt || new Date().toISOString(),
    }));
  }, [focusBarcodeInput]);

  useEffect(() => {
    isSubmittingRef.current = isPending;
  }, [isPending]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      setToast(null);
    }, 2200);

    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!isIssueTypeMenuOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!issueTypeMenuRef.current?.contains(event.target)) {
        setIsIssueTypeMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isIssueTypeMenuOpen]);

  const selectedIssueType = issueTypes.find((option) => option.value === issueType) || issueTypes[0] || null;
  const selectedIssueTypeVisual = ISSUE_TYPE_VISUALS[selectedIssueType?.value] || null;
  const productOptions = useMemo(() => (
    Array.isArray(scope?.products) ? scope.products : []
  ), [scope?.products]);
  const selectedDestinationRoom = destinationRooms.find(
    (room) => room.value === destinationRoomCode
  ) || null;
  const selectedPickerRows = useMemo(
    () => Array.from(selectedPickerItems.values()),
    [selectedPickerItems]
  );
  const selectedPickerSummary = useMemo(
    () => selectedPickerRows.reduce(
      (accumulator, row) => ({
        totalCount: accumulator.totalCount + 1,
        totalWeightKg: Number((accumulator.totalWeightKg + Number(row.weightKg || 0)).toFixed(3)),
      }),
      { totalCount: 0, totalWeightKg: 0 }
    ),
    [selectedPickerRows]
  );
  const activeMobileFilterCount = [
    pickerFilters.dateFrom,
    pickerFilters.dateTo,
    pickerFilters.productCodes.length ? "products" : "",
  ].filter(Boolean).length;

  const applyMutationResult = useCallback((payload, successMessage, item) => {
    setRows(normalizeIssueRows(payload?.recentIssues));
    if (payload?.summary) {
      setSummary(payload.summary);
    }
    
    setStatus({
      state: "success",
      message: successMessage,
      readAt: new Date().toISOString(),
    });
    
    setToast({
      tone: "success",
      message: successMessage,
    });
    
    if (item) {
      setLastScannedItem(item);
    } else if (payload?.issue) {
      setLastScannedItem(payload.issue);
    }
    
    setActiveIssueItemId("");
    
    window.setTimeout(() => {
      focusBarcodeInput();
      barcodeInputRef.current?.select();
    }, 0);
  }, [focusBarcodeInput]);

  const loadPickerRows = useCallback(
    async ({ page = pickerPagination.page, filters = pickerFilters } = {}) => {
      setIsPickerLoading(true);

      try {
        const payload = await fetchProductionStockIssueAvailableReceipts({
          ...filters,
          page,
          limit: pickerPagination.limit,
        });

        setPickerRows(normalizeAvailableRows(payload?.rows));
        setPickerSummary(payload?.summary || { totalCount: 0, totalWeightKg: 0 });
        setPickerPagination((current) => ({
          ...current,
          page: Number(payload?.pagination?.page || page),
          limit: Number(payload?.pagination?.limit || current.limit),
          totalCount: Number(payload?.pagination?.totalCount || 0),
          totalPages: Number(payload?.pagination?.totalPages || 0),
        }));
      } catch (error) {
        const message = error?.message || "ไม่สามารถโหลดรายการพร้อมเบิกได้";
        setToast({
          tone: "error",
          message,
        });
      } finally {
        setIsPickerLoading(false);
      }
    },
    [pickerFilters, pickerPagination.limit, pickerPagination.page]
  );

  const openIssuePicker = useCallback(() => {
    setIsPickerOpen(true);
    setIsMobileFiltersOpen(false);
    setIsProductFilterOpen(false);
    setSelectedPickerItems(new Map());
    setPickerPagination((current) => ({ ...current, page: 1 }));
    void loadPickerRows({ page: 1 });
  }, [loadPickerRows]);

  const closeIssuePicker = useCallback(() => {
    setIsPickerOpen(false);
    setIsMobileFiltersOpen(false);
    setIsProductFilterOpen(false);
  }, []);

  const updatePickerFilter = (key, value) => {
    setPickerFilters((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const handleSearchPicker = () => {
    setPickerPagination((current) => ({ ...current, page: 1 }));
    void loadPickerRows({ page: 1, filters: pickerFilters });
  };

  const togglePickerProduct = (productCode) => {
    const normalizedCode = String(productCode || "").trim().toUpperCase();
    if (!normalizedCode) {
      return;
    }

    setPickerFilters((current) => {
      const currentCodes = current.productCodes || [];
      const hasCode = currentCodes.includes(normalizedCode);
      return {
        ...current,
        productCodes: hasCode
          ? currentCodes.filter((code) => code !== normalizedCode)
          : [...currentCodes, normalizedCode],
      };
    });
  };

  const togglePickerItem = (row) => {
    if (!row?.barcode || row.barcode === "-") {
      return;
    }

    setSelectedPickerItems((current) => {
      const next = new Map(current);
      if (next.has(row.barcode)) {
        next.delete(row.barcode);
      } else {
        next.set(row.barcode, row);
      }
      return next;
    });
  };

  const togglePickerPage = () => {
    const selectableRows = pickerRows.filter((row) => row.barcode && row.barcode !== "-");
    const isEveryRowSelected = selectableRows.length > 0
      && selectableRows.every((row) => selectedPickerItems.has(row.barcode));

    setSelectedPickerItems((current) => {
      const next = new Map(current);
      selectableRows.forEach((row) => {
        if (isEveryRowSelected) {
          next.delete(row.barcode);
        } else {
          next.set(row.barcode, row);
        }
      });
      return next;
    });
  };

  const handlePickerPageChange = (nextPage) => {
    const resolvedPage = Math.max(1, Math.min(nextPage, pickerPagination.totalPages || 1));
    setPickerPagination((current) => ({ ...current, page: resolvedPage }));
    void loadPickerRows({ page: resolvedPage, filters: pickerFilters });
  };

  const confirmPickedIssues = () => {
    const barcodes = selectedPickerRows.map((row) => row.barcode).filter(Boolean);
    if (!barcodes.length) {
      setToast({
        tone: "error",
        message: "กรุณาเลือกรายการที่ต้องการเบิก",
      });
      return;
    }
    if (issueType === "KPF" && !destinationRoomCode) {
      setToast({ tone: "error", message: "กรุณาเลือกห้องปลายทางก่อนเบิก KPF" });
      return;
    }

    setStatus({
      state: "processing",
      message: `กำลังบันทึกเบิก ${barcodes.length} รายการ...`,
      readAt: new Date().toISOString(),
    });

    startTransition(async () => {
      try {
        const payload = await createProductionStockIssuesBatchRequest({
          barcodes,
          issueType,
          issueDate,
          destinationRoomCode: issueType === "KPF" ? destinationRoomCode : null,
        });
        const successCount = Number(payload?.batch?.successCount || 0);
        const message = `เบิกสำเร็จ ${successCount} รายการ`;

        applyMutationResult(payload, message, payload?.issue || selectedPickerRows[0]);
        closeIssuePicker();
        setSelectedPickerItems(new Map());
      } catch (error) {
        const message = error?.message || "ไม่สามารถเบิกรายการที่เลือกได้";
        setStatus({
          state: "error",
          message,
          readAt: new Date().toISOString(),
        });
        setToast({
          tone: "error",
          message,
        });
      }
    });
  };

  const submitIssue = useCallback(
    (nextBarcode) => {
      const normalizedBarcode = String(nextBarcode || "").trim();
      if (issueType === "KPF" && !destinationRoomCode) {
        setStatus({
          state: "error",
          message: "กรุณาเลือกห้องปลายทางก่อนสแกน",
          readAt: new Date().toISOString(),
        });
        setToast({ tone: "error", message: "กรุณาเลือกห้องปลายทางก่อนสแกน" });
        return;
      }
      if (!normalizedBarcode) {
        setStatus({
          state: "error",
          message: "กรุณากรอกหรือสแกนรหัสบาร์โค้ดก่อนทำรายการเบิก",
          readAt: new Date().toISOString(),
        });
        focusBarcodeInput();
        return;
      }

      const queuedIssueType = issueType;
      const queuedIssueDate = issueDate;
      const queuedDestinationRoomCode = issueType === "KPF" ? destinationRoomCode : null;
      const queued = scanQueueRef.current.enqueue(normalizedBarcode, async (queuedBarcode) => {
        setStatus({
          state: "processing",
          message: `กำลังบันทึกรายการเบิก ${queuedBarcode}...`,
          readAt: new Date().toISOString(),
        });

        try {
          const payload = await createProductionStockIssueRequest({
            barcode: queuedBarcode,
            issueType: queuedIssueType,
            issueDate: queuedIssueDate,
            destinationRoomCode: queuedDestinationRoomCode,
          });

          applyMutationResult(
            payload,
            `เบิกสำเร็จ: บาร์โค้ด ${payload?.issue?.barcode || queuedBarcode} (${getIssueTypeLabel(issueTypes, queuedIssueType)})`,
            payload?.issue
          );
        } catch (error) {
          const message = error?.message || "ไม่สามารถบันทึกรายการเบิกได้";
          setStatus({
            state: "error",
            message,
            readAt: new Date().toISOString(),
          });
          setToast({
            tone: "error",
            message,
          });
        } finally {
          focusBarcodeInput(true);
        }
      });

      setBarcode("");
      focusBarcodeInput(true);

      if (queued.accepted) {
        setStatus({
          state: "processing",
          message: `รับบาร์โค้ด ${normalizedBarcode} แล้ว กำลังบันทึก...`,
          readAt: new Date().toISOString(),
        });
      }
    },
    [applyMutationResult, destinationRoomCode, focusBarcodeInput, issueType, issueTypes, issueDate]
  );

  const handleSubmitIssue = useCallback(() => {
    submitIssue(barcode);
  }, [barcode, submitIssue]);

  const stopCameraScanner = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner) {
      return;
    }

    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }
    } catch (error) {
      console.error("Unable to stop issue camera scanner:", error);
    }
  }, []);

  const loadCameras = useCallback(async () => {
    try {
      const devices = await Html5Qrcode.getCameras();
      if (Array.isArray(devices) && devices.length) {
        setCameras(devices);
        setCurrentCameraId((current) => current || devices[0]?.id || null);
      }
    } catch (error) {
      console.error("Unable to load cameras:", error);
    }
  }, []);

  const startCameraScanner = useCallback(
    async (cameraId) => {
      setIsStartingCamera(true);

      try {
        const regionId = scannerRegionIdRef.current;
        if (!document.getElementById(regionId)) {
          return;
        }

        if (!scannerRef.current) {
          scannerRef.current = new Html5Qrcode(regionId);
        }

        const scanner = scannerRef.current;
        if (scanner.isScanning) {
          await scanner.stop();
        }

        await scanner.start(
          cameraId ? { deviceId: { exact: cameraId } } : { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 160 }, aspectRatio: 1.3333333 },
          (decodedText) => {
            const normalizedBarcode = String(decodedText || "").trim();
            if (!normalizedBarcode || isSubmittingRef.current) {
              return;
            }
            setBarcode(normalizedBarcode);
            submitIssue(normalizedBarcode);
          },
          () => {}
        );
      } catch (error) {
        console.error("Unable to start issue camera scanner:", error);
        setStatus({
          state: "error",
          message: "ไม่สามารถเปิดกล้องสแกนบาร์โค้ดได้",
          readAt: new Date().toISOString(),
        });
        setToast({
          tone: "error",
          message: "ไม่สามารถเปิดกล้องสแกนบาร์โค้ดได้",
        });
        setIsCameraOpen(false);
      } finally {
        setIsStartingCamera(false);
      }
    },
    [submitIssue]
  );

  const handleOpenCamera = useCallback(async () => {
    setIsCameraOpen(true);
    await loadCameras();
  }, [loadCameras]);

  const handleCloseCamera = useCallback(async () => {
    await stopCameraScanner();
    setIsCameraOpen(false);
  }, [stopCameraScanner]);

  const handleSwitchCamera = useCallback(() => {
    if (cameras.length < 2) {
      return;
    }

    const currentIndex = currentCameraId
      ? cameras.findIndex((camera) => camera.id === currentCameraId)
      : 0;
    const nextIndex = (currentIndex + 1) % cameras.length;
    setCurrentCameraId(cameras[nextIndex]?.id || null);
  }, [cameras, currentCameraId]);

  useEffect(() => {
    if (!isCameraOpen) {
      void stopCameraScanner();
      return undefined;
    }

    const timer = window.setTimeout(() => {
      void startCameraScanner(currentCameraId);
    }, 120);

    return () => window.clearTimeout(timer);
  }, [currentCameraId, isCameraOpen, startCameraScanner, stopCameraScanner]);

  useEffect(() => {
    return () => {
      void stopCameraScanner();
    };
  }, [stopCameraScanner]);

  const handleCancelIssue = (row) => {
    if (!row?.issueItemId) {
      return;
    }

    const confirmed = window.confirm(
      `ต้องการยกเลิกการเบิกบาร์โค้ด ${row.barcode} ใช่หรือไม่`
    );
    if (!confirmed) {
      return;
    }

    setActiveIssueItemId(row.issueItemId);
    setStatus({
      state: "processing",
      message: `กำลังยกเลิกรายการเบิกบาร์โค้ด ${row.barcode}...`,
      readAt: new Date().toISOString(),
    });

    startTransition(async () => {
      try {
        const payload = await cancelProductionStockIssueRequest(row.issueItemId, {
          voidReason: "ยกเลิกจากหน้าจอเบิกผลิตภัณฑ์",
        });

        applyMutationResult(
          payload,
          `ยกเลิกรายการเบิกบาร์โค้ด ${row.barcode} และคืนสต็อกกลับเรียบร้อย`,
          null
        );
        if (lastScannedItem?.issueItemId === row.issueItemId) {
          setLastScannedItem(null);
        }
      } catch (error) {
        const message = error?.message || "ไม่สามารถยกเลิกรายการเบิกได้";
        setStatus({
          state: "error",
          message,
          readAt: new Date().toISOString(),
        });
        setToast({
          tone: "error",
          message,
        });
        setActiveIssueItemId("");
      }
    });
  };

  const openJamUsage = () => setIsJamUsageOpen(true);

  return (
    <div className="min-h-screen min-w-0 overflow-hidden bg-[#f4f6f8] text-[#262626]">
      <WeightScalePrimaryHeader
        eyebrow="ระบบเบิกผลิตภัณฑ์"
        badge="Issue Movement"
        title="เบิกสต็อกผลิตภัณฑ์"
      />

      <section className="border-b border-[#1f3047] bg-[var(--surface-navy,#102C57)] text-white">
        <div className="mx-auto max-w-[84rem] px-4 pb-4 sm:px-6 lg:px-8">
          <div className="flex flex-col items-start gap-3 border-t border-white/10 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <div
              className={`inline-flex items-center gap-2 border px-4 py-2 text-xs font-black uppercase tracking-[0.18em] ${getStatusTone(status.state)}`}
            >
              <Activity size={14} />
              {status.state}
            </div>

            <p suppressHydrationWarning={true} className="text-[11px] font-bold uppercase tracking-[0.12em] text-white/50 sm:tracking-[0.18em]">
              {formatDateTime(status.readAt)}
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto min-w-0 max-w-[88rem] px-3 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
        <div className="flex flex-col gap-8">
          
          <section className="relative min-w-0 overflow-hidden border-2 border-[#d4af37] bg-white shadow-[0_30px_60px_rgba(0,0,0,0.2)]">
            <div className="grid lg:grid-cols-12 border-b-2 border-[#d4af37]/30 bg-[#fbfcfd]">
              <div className="min-w-0 border-b border-[#e2e8f0] p-3 sm:p-8 lg:col-span-8 lg:border-b-0 lg:border-r lg:p-10">
                {!lastScannedItem ? (
                  <div className="flex h-full min-w-0 flex-col items-center justify-center py-4 text-center sm:py-8">
                    <div className="flex w-full min-w-0 flex-col items-center gap-5 border-2 border-[#d4af37]/40 bg-[var(--surface-navy,#102C57)] px-3 py-5 shadow-[0_12px_40px_rgba(16,44,87,0.45)] sm:px-8 sm:py-8">
                      <div className="w-full min-w-0 max-w-3xl">
                        <div className="relative flex h-16 min-w-0 items-center border-b-4 border-[#d4af37] bg-white/5 px-3 transition focus-within:bg-white/10 sm:h-24 sm:px-6 md:h-28">
                          <ScanSearch size={32} className="h-6 w-6 shrink-0 text-[#d4af37] sm:h-8 sm:w-8" />
                          <input
                            ref={barcodeInputRef}
                            type="text"
                            value={barcode}
                            onChange={(e) => setBarcode(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleSubmitIssue();
                              }
                            }}
                            placeholder="ยิงบาร์โค้ดเพื่อบันทึกเบิก..."
                            aria-label="สแกนหรือกรอกบาร์โค้ดเพื่อเบิกสินค้า"
                            className="min-w-0 w-full bg-transparent px-3 text-base font-mono font-bold text-white outline-none placeholder:text-white/35 focus-visible:ring-2 focus-visible:ring-[#d4af37] sm:px-6 sm:text-3xl md:text-4xl"
                          />
                          {isPending ? (
                            <Loader2 size={32} className="h-6 w-6 shrink-0 animate-spin text-[#d4af37] sm:h-8 sm:w-8" />
                          ) : null}
                        </div>
                      </div>
                      <StockIssueIcon size={72} className="hidden text-[#d4af37]" />
                      <div className="hidden flex-col items-center gap-2">
                        <p className="text-[11px] font-black uppercase tracking-[0.35em] text-[#d4af37]">ระบบเบิกผลิตภัณฑ์</p>
                        <h2 className="text-4xl font-black tracking-[0.12em] text-white sm:text-5xl">พร้อมสแกน</h2>
                        <div className="mt-2 flex items-center gap-2">
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">กำลังรอบาร์โค้ด...</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[#a0aec0]">สถานะการเบิกล่าสุด</span>
                        <span className="mt-1 px-3 py-1 text-sm font-black tracking-wider self-start bg-emerald-600 text-white">
                          เบิกสำเร็จ
                        </span>
                      </div>
                      <div className="hidden sm:block h-10 w-px bg-[#e2e8f0]" />
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[#a0aec0]">บาร์โค้ดล่าสุด</span>
                        <h2 className="mt-1 font-mono text-2xl sm:text-3xl font-medium text-[#102C57] truncate">
                          {lastScannedItem.barcode}
                        </h2>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:flex md:items-center gap-4 md:gap-8 pt-6 border-t border-[#e2e8f0]">
                      <div className="flex-1 min-w-0 text-center">
                        <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-black">รหัสสินค้า</p>
                        <p className="mt-1 text-lg sm:text-xl font-bold text-black truncate">{lastScannedItem.productCode}</p>
                      </div>
                      <div className="hidden md:block h-12 w-px bg-[#e2e8f0]" />
                      <div className="flex-1 min-w-0 text-center">
                        <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-black">ล็อต</p>
                        <p className="mt-1 text-lg sm:text-xl font-bold text-black">{lastScannedItem.lotNo}</p>
                      </div>
                      <div className="hidden md:block h-12 w-px bg-[#e2e8f0]" />
                      <div className="flex-1 min-w-0 text-center">
                        <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-black">ประเภท</p>
                        <p className="mt-1 text-lg sm:text-xl font-bold text-black">
                          {getIssueTypeLabel(issueTypes, lastScannedItem.issueType)}
                        </p>
                      </div>
                      <div className="hidden md:block h-12 w-px bg-[#e2e8f0]" />
                      <div className="flex-1 min-w-0 text-center">
                        <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-black">น้ำหนัก</p>
                        <p className="mt-1 text-lg sm:text-xl font-bold text-black">{formatWeight(lastScannedItem.weightKg)} <span className="text-xs sm:text-sm font-bold">Kg</span></p>
                      </div>
                    </div>

                    {lastScannedItem.destinationRoomName ? (
                      <div className="border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-800">
                        ห้องปลายทาง: {lastScannedItem.destinationRoomName}
                      </div>
                    ) : null}

                    <div className="pt-6 border-t border-[#e2e8f0]">
                      <div className="relative flex h-16 min-w-0 items-center border-b-4 border-[#d4af37] bg-[var(--surface-navy,#102C57)] px-3 transition focus-within:bg-[var(--surface-navy,#173b72)] sm:h-24 sm:px-6 md:h-28">
                        <ScanSearch size={32} className="h-6 w-6 shrink-0 text-[#d4af37] sm:h-8 sm:w-8" />
                        <input
                          ref={barcodeInputRef}
                          type="text"
                          value={barcode}
                          onChange={(e) => setBarcode(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleSubmitIssue();
                            }
                          }}
                            placeholder="ยิงบาร์โค้ดเพื่อบันทึกเบิก..."
                          aria-label="สแกนหรือกรอกบาร์โค้ดเพื่อเบิกสินค้ารายการถัดไป"
                          className="min-w-0 w-full bg-transparent px-3 text-base font-mono font-bold text-white outline-none placeholder:text-white/35 focus-visible:ring-2 focus-visible:ring-[#d4af37] sm:px-6 sm:text-3xl md:text-4xl"
                        />
                        {isPending ? (
                            <Loader2 size={32} className="h-6 w-6 shrink-0 animate-spin text-[#d4af37] sm:h-8 sm:w-8" />
                        ) : null}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex min-w-0 flex-col justify-center gap-4 bg-white p-4 sm:p-8 lg:col-span-4 lg:p-10">
                <div className="relative" ref={issueTypeMenuRef}>
                   <span className="mb-2 block text-[10px] font-black uppercase tracking-widest text-[#a0aec0]">เลือกประเภทการเบิก</span>
                    <button
                      type="button"
                      onClick={() => setIsIssueTypeMenuOpen((prev) => !prev)}
                      className="flex h-14 w-full items-center justify-between gap-3 border-2 border-[#102C57] bg-white px-4 text-left text-sm font-black uppercase tracking-wider text-[#102C57] transition hover:bg-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37] focus-visible:ring-offset-2"
                    >
                      <span className="flex min-w-0 items-center gap-3">
                        {selectedIssueTypeVisual?.logoSrc ? (
                          <span className="flex h-8 w-12 items-center justify-center overflow-hidden">
                            <Image
                              src={selectedIssueTypeVisual.logoSrc}
                              alt={selectedIssueTypeVisual.logoAlt}
                              width={36}
                              height={20}
                              className="h-auto max-h-5 w-auto object-contain"
                            />
                          </span>
                        ) : (
                          <span className="inline-flex h-8 min-w-[3rem] items-center justify-center rounded border border-[#eadfb8] bg-white px-2 text-[11px] font-black uppercase tracking-[0.14em] text-[#7f5d00]">
                            {selectedIssueTypeVisual?.shortLabel || "TYPE"}
                          </span>
                        )}
                        <span className="truncate">{selectedIssueType?.label || "-"}</span>
                      </span>
                      <ChevronDown
                        size={16}
                        className={`shrink-0 text-[#102C57] transition-transform ${
                          isIssueTypeMenuOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {isIssueTypeMenuOpen ? (
                      <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden border-2 border-[#102C57] bg-white shadow-[0_16px_30px_rgba(16,44,87,0.12)]">
                        {issueTypes.map((option) => {
                          const visual = ISSUE_TYPE_VISUALS[option.value] || null;
                          const isActive = option.value === issueType;

                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => {
                                setIssueType(option.value);
                                setIsIssueTypeMenuOpen(false);
                                window.setTimeout(() => {
                                  focusBarcodeInput(true);
                                }, 0);
                              }}
                              className={`flex w-full items-center gap-3 px-4 py-3 text-left transition ${
                                isActive
                                  ? "bg-[var(--surface-navy,#102C57)] text-white"
                                  : "bg-white text-[#102C57] hover:bg-[#f8fafc]"
                              }`}
                            >
                              {visual?.logoSrc ? (
                                <span className="flex h-8 w-12 items-center justify-center overflow-hidden">
                                  <Image
                                    src={visual.logoSrc}
                                    alt={visual.logoAlt}
                                    width={36}
                                    height={20}
                                    className="h-auto max-h-5 w-auto object-contain"
                                  />
                                </span>
                              ) : (
                                <span
                                  className={`inline-flex h-8 min-w-[3rem] items-center justify-center rounded border px-2 text-[11px] font-black uppercase tracking-[0.14em] ${
                                    isActive
                                      ? "border-[#d4af37] bg-white/10 text-[#fff2c2]"
                                      : "border-[#eadfb8] bg-white text-[#7f5d00]"
                                  }`}
                                >
                                  {visual?.shortLabel || "TYPE"}
                                </span>
                              )}
                              <span className="font-semibold">{option.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>

                <button
                  type="button"
                  onClick={openJamUsage}
                  className="flex h-14 w-full items-center justify-center gap-2 border-2 border-[#d4af37] bg-[#fff8e1] text-sm font-black text-[#102C57] transition hover:bg-[#f7e5a6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#102C57] focus-visible:ring-offset-2"
                >
                  <Boxes size={19} />
                  เบิกแยม / บันทึกใช้จริง
                </button>

                {issueType === "KPF" ? (
                  <div className="flex flex-col gap-1">
                    <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-[#a0aec0]">
                      ห้องปลายทาง
                    </span>
                    <select
                      value={destinationRoomCode}
                      onChange={(event) => {
                        setDestinationRoomCode(event.target.value);
                        window.setTimeout(() => focusBarcodeInput(true), 0);
                      }}
                      className="h-14 w-full border-2 border-[#102C57] bg-white px-4 text-sm font-black text-[#102C57] outline-none transition focus:border-[#d4af37] focus-visible:ring-2 focus-visible:ring-[#d4af37] focus-visible:ring-offset-2"
                    >
                      <option value="">— เลือกห้องปลายทาง —</option>
                      {destinationRooms.map((room) => (
                        <option key={room.value} value={room.value}>{room.label}</option>
                      ))}
                    </select>
                    {selectedDestinationRoom ? (
                      <span className="text-xs font-semibold text-emerald-700">
                        {selectedDestinationRoom.label} จะค้างไว้จนกว่าจะเปลี่ยนห้อง
                      </span>
                    ) : (
                      <span className="text-xs font-semibold text-rose-600">ต้องเลือกก่อนสแกนป้าย</span>
                    )}
                  </div>
                ) : null}

                  <div className="flex flex-col gap-1">
                    <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-[#a0aec0]">เลือกวันที่ทำรายการเบิก</span>
                    <input
                      type="date"
                      value={issueDate}
                      onChange={(e) => setIssueDate(e.target.value)}
                      className="flex h-14 w-full items-center justify-between gap-3 border-2 border-[#102C57] bg-white px-4 text-left text-sm font-black text-[#102C57] outline-none transition focus:border-[#d4af37] focus-visible:ring-2 focus-visible:ring-[#d4af37] focus-visible:ring-offset-2"
                    />
                  </div>

                <button
                  type="button"
                  onClick={handleOpenCamera}
                  className="flex h-14 w-full items-center justify-center gap-2 border-2 border-[#d4af37] text-[10px] font-black uppercase tracking-wider text-[#102C57] transition hover:bg-[#fff8e1] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#102C57] focus-visible:ring-offset-2"
                >
                  <Camera size={16} />
                  สแกนด้วยกล้อง
                </button>

                <button
                  type="button"
                  onClick={openIssuePicker}
                  className="flex h-14 w-full items-center justify-center gap-2 border-2 border-[#102C57] bg-[var(--surface-navy,#102C57)] text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-[var(--surface-navy,#173b72)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37] focus-visible:ring-offset-2"
                >
                  <ListChecks size={16} />
                  เลือกรายการเบิก
                </button>
              </div>
            </div>

            <div className="hidden">
              <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#d4af37_1px,transparent_1px)] [background-size:20px_20px]" />
              
              <div className="relative flex flex-col items-center justify-center">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.25em] border-2 shadow-sm ${getStatusTone(status.state)}`}>
                    <Activity size={14} />
                    <span>{status.message}</span>
                  </div>
                </div>

                <div className="hidden w-full max-w-2xl">
                  <div className="relative flex items-center h-20 sm:h-24 md:h-28 border-b-4 border-[#d4af37] bg-white/5 px-6 transition focus-within:bg-white/10">
                    <ScanSearch size={32} className="text-[#d4af37]" />
                    <input
                      ref={barcodeInputRef}
                      type="text"
                      value={barcode}
                      onChange={(e) => setBarcode(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleSubmitIssue();
                        }
                      }}
                      placeholder="ยิงบาร์โค้ดเพื่อบันทึกเบิก..."
                      className="w-full bg-transparent px-6 text-2xl sm:text-3xl md:text-4xl font-mono font-bold text-white outline-none placeholder:text-white/10"
                    />
                    {isPending && (
                      <Loader2 size={32} className="animate-spin text-[#d4af37]" />
                    )}
                  </div>
                </div>

                <div className="mt-6 flex flex-col items-center justify-center py-4">
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">
                    ระบบจะบันทึกรายการเบิกให้อัตโนมัติทันที
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="min-w-0 bg-white border border-[#e2e8f0] shadow-sm">
            <div className="flex flex-col gap-5 border-b border-[#e2e8f0] bg-[#fbfcfd] px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8 sm:py-6">
              <div className="flex items-center gap-6">
                <h3 className="text-xs font-black uppercase tracking-[0.25em] text-[#102C57]">รายการเบิกล่าสุดวันนี้</h3>
              </div>
              <div className="grid w-full grid-cols-2 items-center gap-4 sm:w-auto sm:flex sm:gap-8">
                  <div className="text-center">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#7d8795]">จำนวนรายการ</p>
                      <p className="mt-1 text-lg font-bold text-[#102C57]">{summary.totalCount}</p>
                  </div>
                  <div className="h-8 w-px bg-[#e2e8f0]" />
                  <div className="text-center">
                      <p className="text-[10px] font-black uppercase tracking-widest text-[#7d8795]">น้ำหนักรวม</p>
                      <p className="mt-1 text-lg font-bold text-[#102C57]">{formatWeight(summary.totalWeightKg)} <span className="text-xs">Kg</span></p>
                  </div>
              </div>
            </div>

            {productSummaries.length > 0 && (
              <div className="border-b border-[#e2e8f0] bg-[#f8fafc] px-4 py-3 sm:px-8">
                <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-[#7d8795] mr-1 hidden min-[480px]:inline-block">
                    สรุปแยกตามสินค้า:
                  </span>
                  {productSummaries.map((item) => (
                    <div
                      key={item.productCode}
                      className="inline-flex items-center gap-2 rounded-full border border-[#cbd5e1] bg-white px-3 py-1 text-xs shadow-xs transition hover:border-[#102C57]"
                    >
                      <span className="font-mono font-black text-[#102C57]">
                        {item.productCode}
                      </span>
                      {item.productName && item.productName !== item.productCode && (
                        <span className="max-w-[120px] truncate text-[11px] font-medium text-[#64748b] sm:max-w-[180px]">
                          {item.productName}
                        </span>
                      )}
                      <span className="h-3 w-px bg-[#e2e8f0]" />
                      <span className="font-black text-[#102C57]">
                        {item.count} <span className="text-[10px] font-bold text-[#64748b]">ใบ</span>
                      </span>
                      <span className="text-[#cbd5e1]">·</span>
                      <span className="font-mono font-bold text-[#102C57]">
                        {formatWeight(item.totalWeightKg)} <span className="text-[10px] font-normal text-[#64748b]">Kg</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div
              className="min-w-0 max-h-[550px] overflow-x-auto overflow-y-auto overscroll-x-contain [touch-action:pan-x_pan-y] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#d4af37]"
              role="region"
              aria-label="ตารางรายการเบิกล่าสุด เลื่อนในแนวนอนเพื่อดูทุกคอลัมน์"
              tabIndex={0}
            >
              <table className="min-w-[84rem] w-full border-collapse border border-[#d7dde5]">
                <thead className="sticky top-0 bg-[#f8fafc] z-10 shadow-[0_1px_0_rgba(0,0,0,0.1)]">
                  <tr className="text-sm font-black uppercase tracking-wider text-black">
                    <th className="border border-[#d7dde5] bg-[#f8fafc] px-4 py-2 text-center w-16">#</th>
                    <th className="border border-[#d7dde5] bg-[#f8fafc] px-6 py-2 text-center">ประเภท</th>
                    <th className="border border-[#d7dde5] bg-[#f8fafc] px-6 py-2 text-center">บาร์โค้ด</th>
                    <th className="border border-[#d7dde5] bg-[#f8fafc] px-6 py-2 text-center">สินค้า</th>
                    <th className="border border-[#d7dde5] bg-[#f8fafc] px-6 py-2 text-center">สินค้าปลายทาง</th>
                    <th className="border border-[#d7dde5] bg-[#f8fafc] px-6 py-2 text-center">ล็อต</th>
                    <th className="border border-[#d7dde5] bg-[#f8fafc] px-4 py-2 text-center w-24">จำนวน</th>
                    <th className="border border-[#d7dde5] bg-[#f8fafc] px-6 py-2 text-center">น้ำหนัก</th>
                    <th className="border border-[#d7dde5] bg-[#f8fafc] px-6 py-2 text-center">เวลาเบิก</th>
                    <th className="border border-[#d7dde5] bg-[#f8fafc] px-6 py-2 text-center">การทำงาน</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-bold text-black">
                  {paginatedRows.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="border border-[#d7dde5] px-8 py-16 text-center uppercase tracking-widest text-[#a0aec0]">ยังไม่มีรายการเบิกในวันนี้</td>
                    </tr>
                  ) : (
                    paginatedRows.map((row, index) => {
                      const absoluteIndex = (currentPage - 1) * itemsPerPage + index + 1;
                      return (
                        <tr key={`${row.issueItemId}-${index}`} className="group hover:bg-[#fbfcfd] transition-colors">
                          <td className="border border-[#d7dde5] px-4 py-2 text-center text-[#7d8795]">
                            {absoluteIndex}
                          </td>
                          <td className="border border-[#d7dde5] px-6 py-2 text-center whitespace-nowrap">
                              <span className="inline-flex items-center px-2 py-1 rounded bg-[#f1f5f9] text-[10px] font-black uppercase">
                                  {getIssueTypeLabel(issueTypes, row.issueType)}
                              </span>
                          </td>
                          <td className="border border-[#d7dde5] px-6 py-2 font-mono text-center">
                            {row.barcode}
                          </td>
                          <td className="border border-[#d7dde5] px-6 py-2 text-center whitespace-nowrap">
                            {row.productCode}-{row.productName}
                          </td>
                          <td className="border border-[#d7dde5] px-6 py-2 text-center">
                            {row.destinationRoomName
                              ? row.destinationRoomName
                              : "ไม่ระบุ"}
                          </td>
                          <td className="border border-[#d7dde5] px-6 py-2 text-center">{row.lotNo}</td>
                          <td className="border border-[#d7dde5] px-4 py-2 text-center">{formatQuantity(row.quantity)}</td>
                          <td className="border border-[#d7dde5] px-6 py-2 text-center whitespace-nowrap">
                            {formatWeight(row.weightKg)} Kg
                          </td>
                          <td className="border border-[#d7dde5] px-6 py-2 text-center">{formatDateTime(row.issuedAt)}</td>
                          <td className="border border-[#d7dde5] px-6 py-2 text-center">
                              <button
                                  type="button"
                                  onClick={() => handleCancelIssue(row)}
                                  disabled={isPending && activeIssueItemId === row.issueItemId}
                                  className="inline-flex h-8 items-center justify-center gap-2 border-2 border-rose-100 bg-rose-50 px-3 text-[11px] font-black uppercase tracking-[0.12em] text-rose-700 transition hover:border-rose-400 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                  {isPending && activeIssueItemId === row.issueItemId ? (
                                      <Loader2 size={14} className="animate-spin" />
                                  ) : <RotateCcw size={14} />}
                                  ยกเลิกเบิก
                              </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination for Today's Issues (Floating/Sticky at the bottom) */}
            {totalPages > 1 && (
              <div className="sticky bottom-0 z-20 flex flex-col gap-2 border-t border-[#d7dde5] bg-[#fbfcfd] px-3 py-3 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-4">
                <div className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-1 text-sm font-bold text-[#102C57] sm:w-auto sm:gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((current) => Math.max(current - 1, 1))}
                    disabled={currentPage <= 1}
                    className="h-11 border border-[#d7dde5] bg-white px-3 transition hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-50 sm:px-4"
                  >
                    ก่อนหน้า
                  </button>
                  <span className="min-w-0 px-1 text-center text-xs sm:px-2 sm:text-sm">
                    หน้า {currentPage} / {totalPages} (ทั้งหมด {rows.length} รายการ)
                  </span>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((current) => Math.min(current + 1, totalPages))}
                    disabled={currentPage >= totalPages}
                    className="h-11 border border-[#d7dde5] bg-white px-3 transition hover:bg-[#f8fafc] disabled:cursor-not-allowed disabled:opacity-50 sm:px-4"
                  >
                    ถัดไป
                  </button>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>

      {isJamUsageOpen ? (
        <ProductionJamUsageDialog
          initialDate={issueDate}
          onClose={() => setIsJamUsageOpen(false)}
          onSaved={() => setToast({ tone: "success", message: "บันทึกยอดแยมแยกตามผลผลิตเรียบร้อย" })}
        />
      ) : null}

      {isPickerOpen ? (
        <div className="fixed inset-0 z-[210] flex items-stretch p-0 sm:items-center sm:p-4 justify-center bg-[var(--surface-navy,#102C57)]/80 backdrop-blur-sm">
          <div className="flex max-h-[100dvh] min-w-0 w-full max-w-6xl flex-col overflow-hidden border-y-2 border-[#d4af37] bg-white shadow-[0_24px_70px_rgba(8,17,29,0.35)] sm:max-h-[92vh] sm:border-2">
            <div className="flex flex-col gap-4 border-b border-[#d7dde5] bg-[var(--surface-navy,#102C57)] px-4 py-4 text-white sm:px-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.24em] text-[#d4af37]">
                  <StockIssueIcon size={14} /> เบิกผลิตภัณฑ์แบบกลุ่ม
                </p>
                <h2 className="mt-1 flex items-start gap-2 text-lg font-black leading-tight text-white sm:items-center sm:gap-3 sm:text-2xl">
                  <ListChecks size={24} className="mt-0.5 h-5 w-5 shrink-0 sm:mt-0 sm:h-6 sm:w-6" />
                  เลือกรายการเบิกหลายรายการ
                </h2>
                <p className="mt-1 hidden text-sm font-semibold text-white/70 sm:block">
                  เลือกรายการที่ยังไม่ถูกเบิก แล้วระบบจะบันทึกด้วยประเภท {selectedIssueType?.label || "-"}
                </p>
              </div>

              <button
                type="button"
                onClick={closeIssuePicker}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center border border-white/15 bg-white/10 text-white transition hover:bg-white/15"
                aria-label="ปิดหน้าต่างเลือกรายการเบิก"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[44dvh] shrink-0 overflow-y-auto border-b border-[#e2e8f0] bg-[#fbfcfd] p-4 sm:max-h-none sm:overflow-visible sm:p-5">
              <div className="flex items-end gap-2 lg:hidden">
                <label className="min-w-0 flex-1">
                  <span className="sr-only">ค้นหารายการเบิก</span>
                  <div className="flex h-11 min-w-0 items-center border border-[#d7dde5] bg-white px-3 focus-within:border-[#d4af37] focus-within:ring-2 focus-within:ring-[#d4af37]/30">
                    <Search size={16} className="shrink-0 text-[#102C57]" />
                    <input
                      type="search"
                      value={pickerFilters.search}
                      onChange={(event) => updatePickerFilter("search", event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleSearchPicker();
                        }
                      }}
                      placeholder="บาร์โค้ด / สินค้า / Lot"
                      className="h-full min-w-0 flex-1 bg-transparent px-2 text-sm font-bold text-black outline-none"
                    />
                  </div>
                </label>

                <button
                  type="button"
                  onClick={handleSearchPicker}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center bg-[var(--surface-navy,#102C57)] text-white transition hover:bg-[var(--surface-navy,#173b72)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37] focus-visible:ring-offset-2"
                  aria-label="ค้นหารายการเบิก"
                >
                  {isPickerLoading ? <Loader2 size={17} className="animate-spin" /> : <Search size={17} />}
                </button>

                <button
                  type="button"
                  onClick={() => setIsMobileFiltersOpen((current) => !current)}
                  className={`relative inline-flex h-11 w-11 shrink-0 items-center justify-center border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37] focus-visible:ring-offset-2 ${
                    isMobileFiltersOpen || activeMobileFilterCount
                      ? "border-[#d4af37] bg-[#fff8e1] text-[#7f5d00]"
                      : "border-[#d7dde5] bg-white text-[#102C57]"
                  }`}
                  aria-label="ตัวกรองเพิ่มเติม"
                  aria-expanded={isMobileFiltersOpen}
                  aria-controls="mobile-issue-picker-filters"
                >
                  <Filter size={17} />
                  {activeMobileFilterCount ? (
                    <span className="absolute -right-1 -top-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[#d4af37] px-1 text-[10px] font-black text-[#102C57]">
                      {activeMobileFilterCount}
                    </span>
                  ) : null}
                </button>
              </div>

              <div
                id="mobile-issue-picker-filters"
                className={`${isMobileFiltersOpen ? "grid" : "hidden"} mt-3 gap-3 sm:grid-cols-2 lg:mt-0 lg:grid lg:grid-cols-[1fr_1fr_1.2fr_auto]`}
              >
                <label className="block">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-black">วันที่เริ่มต้น</span>
                  <input
                    type="date"
                    value={pickerFilters.dateFrom}
                    onChange={(event) => updatePickerFilter("dateFrom", event.target.value)}
                    className="h-11 w-full border border-[#d7dde5] bg-white px-3 text-sm font-bold text-black outline-none focus:border-[#d4af37]"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-black">วันที่สิ้นสุด</span>
                  <input
                    type="date"
                    value={pickerFilters.dateTo}
                    onChange={(event) => updatePickerFilter("dateTo", event.target.value)}
                    className="h-11 w-full border border-[#d7dde5] bg-white px-3 text-sm font-bold text-black outline-none focus:border-[#d4af37]"
                  />
                </label>

                <label className="hidden lg:block">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-black">ค้นหา</span>
                  <div className="flex h-11 items-center border border-[#d7dde5] bg-white px-3 focus-within:border-[#d4af37]">
                    <Search size={16} className="text-[#102C57]" />
                    <input
                      type="search"
                      value={pickerFilters.search}
                      onChange={(event) => updatePickerFilter("search", event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleSearchPicker();
                        }
                      }}
                      placeholder="บาร์โค้ด / สินค้า / Lot"
                      className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm font-bold text-black outline-none"
                    />
                  </div>
                </label>

                <button
                  type="button"
                  onClick={handleSearchPicker}
                  className="hidden h-11 w-full items-center justify-center gap-2 bg-[var(--surface-navy,#102C57)] px-5 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-[var(--surface-navy,#173b72)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37] focus-visible:ring-offset-2 lg:mt-auto lg:inline-flex lg:w-auto"
                >
                  {isPickerLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  ค้นหา
                </button>
              </div>

              <div className={`${isMobileFiltersOpen ? "flex" : "hidden"} mt-3 flex-col gap-3 lg:flex lg:flex-row lg:items-center lg:justify-between`}>
                <div className="relative min-w-0">
                  <button
                    type="button"
                    onClick={() => setIsProductFilterOpen((current) => !current)}
                    className="inline-flex h-11 w-full min-w-0 sm:min-w-[17rem] items-center justify-between gap-3 border border-[#d7dde5] bg-white px-4 text-left text-sm font-black text-[#102C57] transition hover:border-[#d4af37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37] focus-visible:ring-offset-2"
                  >
                    <span className="inline-flex min-w-0 items-center gap-2">
                      <Filter size={16} />
                      <span className="truncate">
                        {pickerFilters.productCodes.length
                          ? `เลือกสินค้า ${pickerFilters.productCodes.length} รายการ`
                          : "สินค้าทั้งหมด"}
                      </span>
                    </span>
                    <ChevronDown size={16} className={isProductFilterOpen ? "rotate-180 transition" : "transition"} />
                  </button>

                  {isProductFilterOpen ? (
                    <div className="absolute left-0 top-full z-30 mt-2 max-h-80 w-[min(34rem,calc(100vw-2rem))] overflow-hidden border-2 border-[#102C57] bg-white shadow-[0_18px_40px_rgba(8,17,29,0.18)]">
                      <div className="flex items-center justify-between border-b border-[#e2e8f0] px-4 py-3">
                        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#102C57]">เลือกสินค้า</p>
                        <button
                          type="button"
                          onClick={() => updatePickerFilter("productCodes", [])}
                          className="text-xs font-black text-[#7f5d00] underline-offset-4 hover:underline"
                        >
                          ล้างตัวเลือก
                        </button>
                      </div>
                      <div className="max-h-64 overflow-y-auto p-2">
                        {productOptions.map((product) => {
                          const code = String(product.code || "").toUpperCase();
                          const checked = pickerFilters.productCodes.includes(code);
                          return (
                            <button
                              key={code}
                              type="button"
                              onClick={() => togglePickerProduct(code)}
                              className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm font-bold text-black transition hover:bg-[#f8fafc]"
                            >
                              {checked ? (
                                <CheckSquare size={18} className="text-[#102C57]" />
                              ) : (
                                <Square size={18} className="text-[#94a3b8]" />
                              )}
                              <span className="min-w-0 flex-1 truncate">
                                {code} - {product.name || "-"}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="hidden w-full grid-cols-2 gap-3 text-sm sm:flex sm:w-auto sm:items-center">
                  <div className="border border-[#d7dde5] bg-white px-4 py-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#64748b]">พร้อมเบิก</p>
                    <p className="text-lg font-black text-[#102C57]">{pickerSummary.totalCount || 0}</p>
                  </div>
                  <div className="border border-[#d7dde5] bg-white px-4 py-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#64748b]">ที่เลือก</p>
                    <p className="text-lg font-black text-[#102C57]">
                      {selectedPickerSummary.totalCount} / {formatWeight(selectedPickerSummary.totalWeightKg)} Kg
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div
              className="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto overscroll-contain bg-white [touch-action:pan-x_pan-y] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#d4af37]"
              role="region"
              aria-label="ตารางเลือกรายการเบิก เลื่อนในแนวนอนเพื่อดูทุกคอลัมน์"
              tabIndex={0}
            >
              <table className="min-w-[56rem] w-full border-collapse">
                <thead className="sticky top-0 z-10 bg-[#f8fafc] text-sm font-black text-black shadow-sm">
                  <tr>
                    <th className="w-14 border border-[#d7dde5] px-3 py-3 text-center">
                      <button
                        type="button"
                        onClick={togglePickerPage}
                        className="inline-flex items-center justify-center text-[#102C57]"
                        aria-label="เลือกทั้งหมดในหน้านี้"
                      >
                        {pickerRows.length > 0 && pickerRows.every((row) => selectedPickerItems.has(row.barcode)) ? (
                          <CheckSquare size={20} />
                        ) : (
                          <Square size={20} />
                        )}
                      </button>
                    </th>
                    <th className="border border-[#d7dde5] px-4 py-3 text-left">บาร์โค้ด</th>
                    <th className="border border-[#d7dde5] px-4 py-3 text-left">สินค้า</th>
                    <th className="border border-[#d7dde5] px-4 py-3 text-center">Lot</th>
                    <th className="border border-[#d7dde5] px-4 py-3 text-center">น้ำหนัก</th>
                    <th className="border border-[#d7dde5] px-4 py-3 text-center">เวลาชั่ง</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-bold text-black">
                  {isPickerLoading ? (
                    <tr>
                      <td colSpan={6} className="border border-[#d7dde5] px-6 py-16 text-center text-[#102C57]">
                        <span className="inline-flex items-center gap-2 font-black">
                          <Loader2 size={18} className="animate-spin" />
                          กำลังโหลดรายการ...
                        </span>
                      </td>
                    </tr>
                  ) : pickerRows.length ? (
                    pickerRows.map((row) => {
                      const checked = selectedPickerItems.has(row.barcode);
                      return (
                        <tr
                          key={row.barcode}
                          className={checked ? "bg-[#fff8e1]" : "bg-white hover:bg-[#fbfcfd]"}
                        >
                          <td className="border border-[#d7dde5] px-3 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => togglePickerItem(row)}
                              className="inline-flex items-center justify-center text-[#102C57]"
                              aria-label={`เลือกรายการ ${row.barcode}`}
                            >
                              {checked ? <CheckSquare size={20} /> : <Square size={20} />}
                            </button>
                          </td>
                          <td className="border border-[#d7dde5] px-4 py-3 font-mono whitespace-nowrap">{row.barcode}</td>
                          <td className="border border-[#d7dde5] px-4 py-3 whitespace-nowrap">
                            {row.productCode} - {row.productName}
                          </td>
                          <td className="border border-[#d7dde5] px-4 py-3 text-center whitespace-nowrap">{row.lotNo}</td>
                          <td className="border border-[#d7dde5] px-4 py-3 text-center whitespace-nowrap">
                            {formatWeight(row.weightKg)} Kg
                          </td>
                          <td className="border border-[#d7dde5] px-4 py-3 text-center whitespace-nowrap">
                            {formatDateTime(row.weighedAt)}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="border border-[#d7dde5] px-6 py-16 text-center font-black uppercase tracking-widest text-[#94a3b8]">
                        ไม่พบรายการที่พร้อมเบิก
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-[#d7dde5] bg-[#fbfcfd] px-3 py-3 sm:px-6 sm:py-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center justify-between gap-3 border border-[#d7dde5] bg-white px-3 py-2 text-[#102C57] sm:hidden">
                <span className="text-xs font-black">
                  เลือกแล้ว {selectedPickerSummary.totalCount} รายการ
                </span>
                <span className="text-xs font-black text-[#7f5d00]">
                  {formatWeight(selectedPickerSummary.totalWeightKg)} Kg
                </span>
              </div>

              <div className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-1 text-sm font-bold text-[#102C57] sm:w-auto sm:gap-2">
                <button
                  type="button"
                  onClick={() => handlePickerPageChange(pickerPagination.page - 1)}
                  disabled={pickerPagination.page <= 1 || isPickerLoading}
                  className="inline-flex h-11 w-11 items-center justify-center border border-[#d7dde5] bg-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-4"
                  aria-label="หน้าก่อนหน้า"
                >
                  <ChevronLeft size={18} className="sm:hidden" />
                  <span className="hidden sm:inline">ก่อนหน้า</span>
                </button>
                <span className="min-w-0 px-1 text-center text-xs sm:px-2 sm:text-sm">
                  หน้า {pickerPagination.page || 1} / {pickerPagination.totalPages || 1}
                </span>
                <button
                  type="button"
                  onClick={() => handlePickerPageChange(pickerPagination.page + 1)}
                  disabled={pickerPagination.page >= (pickerPagination.totalPages || 1) || isPickerLoading}
                  className="inline-flex h-11 w-11 items-center justify-center border border-[#d7dde5] bg-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto sm:px-4"
                  aria-label="หน้าถัดไป"
                >
                  <ChevronRight size={18} className="sm:hidden" />
                  <span className="hidden sm:inline">ถัดไป</span>
                </button>
              </div>

              <div className="grid grid-cols-[5rem_1fr] gap-2 sm:flex sm:items-center">
                <button
                  type="button"
                  onClick={closeIssuePicker}
                  className="h-11 w-full border border-[#d7dde5] bg-white px-5 text-sm font-black text-[#102C57] transition hover:bg-[#f8fafc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#102C57] focus-visible:ring-offset-2 sm:w-auto"
                >
                  ปิด
                </button>
                <button
                  type="button"
                  onClick={confirmPickedIssues}
                  disabled={isPending || selectedPickerSummary.totalCount === 0}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 bg-[#d4af37] px-6 text-sm font-black text-[#102C57] transition hover:bg-[#e7c85c] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#102C57] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                >
                  {isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  ยืนยันเบิก {selectedPickerSummary.totalCount} รายการ
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isCameraOpen ? (
        <div className="fixed inset-0 z-[220] flex items-stretch justify-center bg-[var(--surface-navy,#102C57)]/80 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="relative max-h-[100dvh] min-w-0 w-full max-w-3xl overflow-y-auto border-y-2 border-[#d4af37] bg-white shadow-[0_24px_70px_rgba(8,17,29,0.35)] sm:max-h-[92vh] sm:border-2">
            <div className="flex flex-col items-stretch gap-3 border-b border-[#d7dde5] bg-[var(--surface-navy,#102C57)] px-4 py-4 text-white min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between sm:px-5">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#d4af37]">
                  Mobile Scanner
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-[0.02em] text-white sm:text-2xl">
                  สแกนบาร์โค้ด
                </h2>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                {cameras.length > 1 ? (
                  <button
                    type="button"
                    onClick={handleSwitchCamera}
                    className="inline-flex h-11 items-center justify-center gap-2 border border-[#d4af37] bg-white/10 px-3 text-xs font-black uppercase tracking-[0.08em] text-[#fff2c2] transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37] sm:text-sm sm:tracking-[0.12em]"
                  >
                    <SwitchCamera size={16} />
                    สลับกล้อง
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => void handleCloseCamera()}
                  className="inline-flex h-11 w-11 items-center justify-center border border-white/15 bg-white/10 text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]"
                  aria-label="ปิดกล้อง"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="bg-[#f8fafc] p-3 sm:p-5">
              <div className="overflow-hidden border-2 border-[#d4af37] bg-[var(--surface-navy,#102C57)]">
                <div
                  id={scannerRegionIdRef.current}
                  className="mx-auto aspect-[4/3] max-h-[calc(100dvh-12rem)] w-full max-w-[34rem] overflow-hidden bg-black"
                />
              </div>

              {isStartingCamera ? (
                <div className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#7f5d00]">
                  <Loader2 size={16} className="animate-spin" />
                  กำลังเปิดกล้อง...
                </div>
              ) : (
                <div className="mt-4 text-center">
                  <p className="text-sm font-bold text-[#102C57]">{status.message}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="pointer-events-none fixed inset-x-3 top-20 z-[230] sm:left-auto sm:right-4 sm:top-24 sm:w-[min(24rem,calc(100vw-2rem))]">
          <div
            className={`border-l-4 px-4 py-4 text-sm font-bold shadow-[0_18px_40px_rgba(8,17,29,0.2)] ${
              toast.tone === "success"
                ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                : "border-rose-500 bg-rose-50 text-rose-700"
            }`}
          >
            <div className="flex items-center gap-3">
              {toast.tone === "success" ? <Check size={18} /> : <X size={18} />}
              {toast.message}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
