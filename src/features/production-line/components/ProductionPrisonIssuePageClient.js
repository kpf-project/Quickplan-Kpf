"use client";

import { Html5Qrcode } from "html5-qrcode";
import { useCallback, useEffect, useId, useMemo, useRef, useState, useTransition } from "react";
import {
  Activity,
  AlertTriangle,
  Camera,
  CheckSquare,
  ChevronDown,
  Check,
  Filter,
  ListChecks,
  Loader2,
  Search,
  ScanLine,
  ScanSearch,
  Square,
  SwitchCamera,
  X,
} from "lucide-react";

/* ── Audio Feedback Helpers ─────────────────────────────────────────── */
function playBeep(frequency, duration) {
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = "sine";
    oscillator.frequency.value = frequency;

    gainNode.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration / 1000);

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + duration / 1000);
  } catch (err) {
    console.error("Audio playback failed:", err);
  }
}

const playSuccessBeep = () => playBeep(850, 120);
const playErrorBeep = () => playBeep(180, 400);

/* ── Custom Prison Icon ─────────────────────────────────────────────── */
function PrisonIcon({ size = 24, className = "" }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
    >
      {/* outer wall */}
      <rect x="4" y="12" width="40" height="32" rx="2" stroke="currentColor" strokeWidth="2.2" fill="none" />
      {/* roof / pediment */}
      <path d="M2 14 L24 3 L46 14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* horizontal lintel */}
      <line x1="4" y1="18" x2="44" y2="18" stroke="currentColor" strokeWidth="1.6" />
      {/* vertical bars */}
      <line x1="14" y1="18" x2="14" y2="44" stroke="currentColor" strokeWidth="1.8" />
      <line x1="21" y1="18" x2="21" y2="44" stroke="currentColor" strokeWidth="1.8" />
      <line x1="27" y1="18" x2="27" y2="44" stroke="currentColor" strokeWidth="1.8" />
      <line x1="34" y1="18" x2="34" y2="44" stroke="currentColor" strokeWidth="1.8" />
      {/* mid horizontal bar */}
      <line x1="4" y1="31" x2="44" y2="31" stroke="currentColor" strokeWidth="1.2" />
      {/* small shield / emblem on pediment */}
      <circle cx="24" cy="10" r="3.2" stroke="currentColor" strokeWidth="1.4" fill="none" />
      <circle cx="24" cy="10" r="1" fill="currentColor" />
    </svg>
  );
}
import WeightScalePrimaryHeader from "@/features/production-line/components/WeightScalePrimaryHeader";
import {
  createProductionPrisonIssueRequest,
  createProductionPrisonIssuesBatchRequest,
  fetchProductionPrisonIssueAvailable,
} from "@/features/production-line/services/productionPrisonClient";

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

function normalizeRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((row) => ({
    issueItemId: String(row?.issueItemId || "").trim(),
    issueNo: String(row?.issueNo || "").trim(),
    issueDate: String(row?.issueDate || "").trim(),
    issuedAt: row?.issuedAt || null,
    barcode: String(row?.barcode || "").trim() || "-",
    productCode: String(row?.productCode || "").trim().toUpperCase() || "-",
    productName: String(row?.productName || "").trim() || "-",
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
    inboundItemId: String(row?.inboundItemId || "").trim(),
    inboundNo: String(row?.inboundNo || "").trim(),
    issueDate: String(row?.issueDate || "").trim(),
    issuedAt: row?.issuedAt || null,
    barcode: String(row?.barcode || "").trim() || "-",
    productCode: String(row?.productCode || "").trim().toUpperCase() || "-",
    productName: String(row?.productName || "").trim() || "-",
    lotNo: String(row?.lotNo || "").trim() || "-",
    quantity: Number(row?.quantity || 0),
    weightKg: Number(row?.weightKg || 0),
  }));
}

function normalizeSummary(summary) {
  return {
    totalCount: Number(summary?.totalCount || 0),
    totalQuantity: Number(summary?.totalQuantity || 0),
    totalWeightKg: Number(summary?.totalWeightKg || 0),
  };
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

export default function ProductionPrisonIssuePageClient({
  todayIssueDate,
  initialRecentIssues,
  initialSummary,
  scope,
}) {
  const scannerRegionId = useId().replaceAll(":", "-");
  const barcodeInputRef = useRef(null);
  const scannerRef = useRef(null);
  const scannerRegionIdRef = useRef(`prison-issue-camera-${scannerRegionId}`);
  const isSubmittingRef = useRef(false);
  const blockingErrorRef = useRef(null);
  const productOptions = useMemo(
    () => (Array.isArray(scope?.products) ? scope.products : []),
    [scope?.products]
  );
  const [barcode, setBarcode] = useState("");
  const [status, setStatus] = useState({
    state: "ready",
    message: "พร้อมรับสแกนบาร์โค้ดเพื่อเบิกออกเรือนจำ",
    readAt: null,
  });
  const [rows, setRows] = useState(() => normalizeRows(initialRecentIssues));
  const [summary, setSummary] = useState(() => normalizeSummary(initialSummary));
  const [lastScannedItem, setLastScannedItem] = useState(null);
  const [toast, setToast] = useState(null);
  const [blockingError, setBlockingError] = useState(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [currentCameraId, setCurrentCameraId] = useState(null);
  const [isPending, startTransition] = useTransition();
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isPickerLoading, setIsPickerLoading] = useState(false);
  const [isProductFilterOpen, setIsProductFilterOpen] = useState(false);
  const [pickerRows, setPickerRows] = useState([]);
  const [selectedPickerItems, setSelectedPickerItems] = useState(() => new Map());
  const [pickerSummary, setPickerSummary] = useState({
    totalCount: 0,
    totalQuantity: 0,
    totalWeightKg: 0,
  });
  const [pickerPagination, setPickerPagination] = useState({
    page: 1,
    limit: 50,
    totalCount: 0,
    totalPages: 0,
  });
  const [pickerFilters, setPickerFilters] = useState({
    dateFrom: "",
    dateTo: todayIssueDate || "",
    search: "",
    productCodes: [],
  });

  useEffect(() => {
    barcodeInputRef.current?.focus();
    setStatus((current) => ({
      ...current,
      readAt: current.readAt || new Date().toISOString(),
    }));
  }, []);



  useEffect(() => {
    const clientDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    if (todayIssueDate && clientDate !== todayIssueDate) {
      startTransition(async () => {
        try {
          const response = await fetch(`/api/production-stock/prison/issues?date=${clientDate}`);
          if (response.ok) {
            const result = await response.json();
            const payload = result.data ?? result;
            setRows(normalizeRows(payload.recentIssues));
            setSummary(normalizeSummary(payload.summary));
          }
        } catch (err) {
          console.error("Failed to refetch client-date recent issues:", err);
        }
      });
    }
  }, [todayIssueDate]);

  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const closeBlockingError = useCallback(() => {
    blockingErrorRef.current = null;
    setBlockingError(null);
    setBarcode("");
    window.setTimeout(() => {
      barcodeInputRef.current?.focus();
      barcodeInputRef.current?.select();
    }, 0);
  }, []);

  const showBlockingError = useCallback(({ barcode: failedBarcode, message }) => {
    const nextError = {
      barcode: String(failedBarcode || "").trim(),
      message: message || "ไม่สามารถบันทึกรายการเบิกออกเรือนจำได้",
      occurredAt: new Date().toISOString(),
    };
    blockingErrorRef.current = nextError;
    setBlockingError(nextError);
    setBarcode("");
  }, []);

  useEffect(() => {
    if (!blockingError) {
      return undefined;
    }

    const handleBlockingKeyDown = (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        closeBlockingError();
      }
    };

    window.addEventListener("keydown", handleBlockingKeyDown, true);
    return () => window.removeEventListener("keydown", handleBlockingKeyDown, true);
  }, [blockingError, closeBlockingError]);

  const applyMutationResult = useCallback((payload, successMessage) => {
    playSuccessBeep();
    setRows(normalizeRows(payload?.recentIssues));
    setSummary(normalizeSummary(payload?.summary));
    setLastScannedItem(payload?.issue || null);
    setStatus({
      state: "success",
      message: successMessage,
      readAt: new Date().toISOString(),
    });
    setToast({
      tone: "success",
      message: successMessage,
    });
    setBarcode("");
    isSubmittingRef.current = false; // Release Lock
    window.setTimeout(() => {
      barcodeInputRef.current?.focus();
      barcodeInputRef.current?.select();
    }, 0);
  }, []);

  const submitIssue = useCallback((nextBarcode) => {
    const normalizedBarcode = String(nextBarcode || "").trim();
    if (!normalizedBarcode || isSubmittingRef.current || blockingErrorRef.current) {
      return;
    }

    isSubmittingRef.current = true; // Synchronous Lock!
    setBarcode(""); // Clear the input buffer immediately so new scans don't append!

    const now = new Date();
    const issuedAt = now.toISOString();

    setStatus({
      state: "processing",
      message: `กำลังบันทึกการเบิกออกเรือนจำ ${normalizedBarcode}...`,
      readAt: now.toISOString(),
    });

    startTransition(async () => {
      try {
        const payload = await createProductionPrisonIssueRequest({
          barcode: normalizedBarcode,
          issuedAt,
        });

        applyMutationResult(
          payload,
          `เบิกออกเรือนจำสำเร็จ: บาร์โค้ด ${payload?.issue?.barcode || normalizedBarcode}`
        );
      } catch (error) {
        isSubmittingRef.current = false; // Release Lock!
        playErrorBeep(); // Audio Feedback on Error
        const message = error?.message || "ไม่สามารถบันทึกรายการเบิกออกเรือนจำได้";
        setStatus({
          state: "error",
          message,
          readAt: new Date().toISOString(),
        });
        setToast({
          tone: "error",
          message,
        });
        showBlockingError({
          barcode: normalizedBarcode,
          message,
        });
      }
    });
  }, [applyMutationResult, showBlockingError]);

  const handleInputChange = (event) => {
    if (isSubmittingRef.current || blockingErrorRef.current) {
      playErrorBeep();
      return;
    }
    const val = event.target.value;
    setBarcode(val);

    const normalized = String(val || "").trim();
    if (normalized.length === 14) {
      submitIssue(normalized);
    }
  };

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
      console.error("Unable to stop prison camera scanner:", error);
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

  const startCameraScanner = useCallback(async (cameraId) => {
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
          if (!normalizedBarcode || isSubmittingRef.current || blockingErrorRef.current) {
            return;
          }
          setBarcode(normalizedBarcode);
          submitIssue(normalizedBarcode);
        },
        () => {}
      );
    } catch (error) {
      console.error("Unable to start prison camera scanner:", error);
      setStatus({
        state: "error",
        message: "ไม่สามารถเปิดกล้องสแกนบาร์โค้ดได้",
        readAt: new Date().toISOString(),
      });
      setToast({
        tone: "error",
        message: "ไม่สามารถเปิดกล้องสแกนบาร์โค้ดได้",
      });
      showBlockingError({
        message: error?.message || "ไม่สามารถเปิดกล้องสแกนบาร์โค้ดได้",
      });
      setIsCameraOpen(false);
    } finally {
      setIsStartingCamera(false);
    }
  }, [showBlockingError, submitIssue]);

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

  const selectedPickerRows = useMemo(
    () => Array.from(selectedPickerItems.values()),
    [selectedPickerItems]
  );

  const selectedPickerSummary = useMemo(
    () => selectedPickerRows.reduce(
      (summary, row) => ({
        totalCount: summary.totalCount + 1,
        totalQuantity: summary.totalQuantity + (row.quantity || 0),
        totalWeightKg: summary.totalWeightKg + (row.weightKg || 0),
      }),
      { totalCount: 0, totalQuantity: 0, totalWeightKg: 0 }
    ),
    [selectedPickerRows]
  );

  const loadPickerRows = useCallback(
    async ({ page = pickerPagination.page, filters = pickerFilters } = {}) => {
      setIsPickerLoading(true);

      try {
        const payload = await fetchProductionPrisonIssueAvailable({
          ...filters,
          page,
          limit: pickerPagination.limit,
        });

        setPickerRows(normalizeAvailableRows(payload?.rows));
        setPickerSummary(normalizeSummary(payload?.summary));
        setPickerPagination((current) => ({
          ...current,
          page: Number(payload?.pagination?.page || page),
          limit: Number(payload?.pagination?.limit || current.limit),
          totalCount: Number(payload?.pagination?.totalCount || 0),
          totalPages: Number(payload?.pagination?.totalPages || 0),
        }));
      } catch (error) {
        setToast({
          tone: "error",
          message: error?.message || "ไม่สามารถโหลดรายการที่พร้อมเบิกออกเรือนจำได้",
        });
      } finally {
        setIsPickerLoading(false);
      }
    },
    [pickerFilters, pickerPagination.limit, pickerPagination.page]
  );

  const openIssuePicker = useCallback(() => {
    setIsPickerOpen(true);
    setIsProductFilterOpen(false);
    setSelectedPickerItems(new Map());
    setPickerPagination((current) => ({ ...current, page: 1 }));
    void loadPickerRows({ page: 1 });
  }, [loadPickerRows]);

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
    if (!barcodes.length || isSubmittingRef.current) {
      setToast({
        tone: "error",
        message: "กรุณาเลือกรายการที่ต้องการเบิกออกเรือนจำ",
      });
      return;
    }

    isSubmittingRef.current = true; // Synchronous Lock!

    const now = new Date();
    const issuedAt = now.toISOString();

    setStatus({
      state: "processing",
      message: `กำลังบันทึกเบิกออกเรือนจำ ${barcodes.length} รายการ...`,
      readAt: now.toISOString(),
    });

    startTransition(async () => {
      try {
        const payload = await createProductionPrisonIssuesBatchRequest({
          barcodes,
          issuedAt,
        });
        const successCount = Number(payload?.batch?.successCount || 0);
        const failedCount = Number(payload?.batch?.failedCount || 0);
        const message = failedCount
          ? `เบิกออกเรือนจำสำเร็จ ${successCount} รายการ และไม่สำเร็จ ${failedCount} รายการ`
          : `เบิกออกเรือนจำสำเร็จ ${successCount} รายการ`;

        applyMutationResult(payload, message);
        setIsPickerOpen(false);
        setSelectedPickerItems(new Map());
        setPickerRows([]);
      } catch (error) {
        isSubmittingRef.current = false; // Release Lock!
        playErrorBeep(); // Audio Feedback on Error
        const message = error?.message || "ไม่สามารถเบิกออกเรือนจำรายการที่เลือกได้";
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

  const statusTone = useMemo(() => getStatusTone(status.state), [status.state]);

  return (
    <div className="min-h-screen bg-[#f4f6f8] text-[#262626]">
      <WeightScalePrimaryHeader
        eyebrow="ระบบเรือนจำ"
        badge="สแกนเบิก"
        title="เบิกออกเรือนจำ"
      />

      <section className="border-b border-[#1f3047] bg-[var(--surface-navy,#102C57)] text-white">
        <div className="mx-auto max-w-[84rem] px-4 pb-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between border-t border-white/10 pt-4">
            <div className={`inline-flex items-center gap-2 border px-4 py-2 text-xs font-black uppercase tracking-[0.18em] ${statusTone}`}>
              <Activity size={14} />
              {status.state}
            </div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">
              {formatDateTime(status.readAt)}
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto flex max-w-[88rem] flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="overflow-hidden border-2 border-[#d4af37] bg-white shadow-[0_30px_60px_rgba(0,0,0,0.14)]">
          <div className="grid border-b-2 border-[#d4af37]/30 bg-[#fbfcfd] lg:grid-cols-12">
            <div className="border-b border-[#e2e8f0] p-6 sm:p-8 lg:col-span-8 lg:border-b-0 lg:border-r lg:p-10">
              {!lastScannedItem ? (
                <div className="flex h-full flex-col items-center justify-center py-8 text-center">
                  <div className="flex flex-col items-center gap-5 rounded-lg border-2 border-[#d4af37]/40 bg-[var(--surface-navy,#102C57)] px-10 py-8 shadow-[0_12px_40px_rgba(16,44,87,0.45)]">
                    <PrisonIcon size={72} className="text-[#d4af37]" />
                    <div className="flex flex-col items-center gap-2">
                      <p className="text-[11px] font-black uppercase tracking-[0.35em] text-[#d4af37]">ระบบเบิกเรือนจำ</p>
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
                <div className="flex flex-col gap-6">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#a0aec0]">
                        รายการล่าสุด
                      </span>
                      <span className="mt-1 self-start bg-emerald-600 px-3 py-1 text-sm font-black tracking-wider text-white">
                        เบิกสำเร็จ
                      </span>
                    </div>
                    <div className="hidden h-10 w-px bg-[#e2e8f0] sm:block" />
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#a0aec0]">
                        บาร์โค้ดล่าสุด
                      </span>
                      <h2 className="mt-1 truncate font-mono text-2xl font-medium text-[#102C57] sm:text-3xl">
                        {lastScannedItem.barcode}
                      </h2>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 border-t border-[#e2e8f0] pt-6 md:flex md:items-center md:gap-8">
                    <div className="min-w-0 flex-1 text-center">
                      <p className="text-[10px] font-black uppercase tracking-widest text-black">รหัสสินค้า</p>
                      <p className="mt-1 truncate text-lg font-bold text-black sm:text-xl">
                        {lastScannedItem.productCode}
                      </p>
                    </div>
                    <div className="hidden h-12 w-px bg-[#e2e8f0] md:block" />
                    <div className="min-w-0 flex-1 text-center">
                      <p className="text-[10px] font-black uppercase tracking-widest text-black">ล็อต</p>
                      <p className="mt-1 text-lg font-bold text-black sm:text-xl">
                        {lastScannedItem.lotNo}
                      </p>
                    </div>
                    <div className="hidden h-12 w-px bg-[#e2e8f0] md:block" />
                    <div className="min-w-0 flex-1 text-center">
                      <p className="text-[10px] font-black uppercase tracking-widest text-black">น้ำหนัก</p>
                      <p className="mt-1 text-lg font-bold text-black sm:text-xl">
                        {formatWeight(lastScannedItem.weightKg)} <span className="text-xs sm:text-sm">Kg</span>
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-col justify-center gap-4 bg-white p-6 sm:p-8 lg:col-span-4 lg:p-10">
              <button
                type="button"
                onClick={async () => {
                  setIsCameraOpen(true);
                  await loadCameras();
                }}
                className="flex h-14 items-center justify-center gap-2 border-2 border-[#d4af37] text-[10px] font-black uppercase tracking-wider text-[#102C57] transition hover:bg-[#fff8e1]"
              >
                <Camera size={16} />
                สแกนด้วยกล้อง
              </button>

              <button
                type="button"
                onClick={openIssuePicker}
                className="flex h-14 items-center justify-center gap-2 bg-[var(--surface-navy,#102C57)] text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-[var(--surface-navy,#173b72)]"
              >
                <ListChecks size={16} />
                เลือกรายการเบิกออก
              </button>

              <div className="rounded-none border border-[#eadfb8] bg-[#fffaf0] px-4 py-3 text-sm font-semibold text-[#6b5500]">
                สแกนบาร์โค้ดจากรายการรับเข้าเรือนจำ เพื่อบันทึกเบิกออกทันที
              </div>
            </div>
          </div>

          <div className="relative bg-[var(--surface-navy,#102C57)] px-4 py-8 text-center sm:px-10 lg:py-12">
            <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#d4af37_1px,transparent_1px)] [background-size:20px_20px]" />

            <div className="relative flex flex-col items-center justify-center">
              <div className="mb-4 flex items-center gap-3">
                <div className={`flex items-center gap-2 border-2 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.25em] shadow-sm sm:px-4 sm:text-[10px] ${statusTone}`}>
                  <Activity size={14} />
                  <span>{status.message}</span>
                </div>
              </div>

              <div className="w-full max-w-2xl">
                <div className="relative flex h-20 items-center border-b-4 border-[#d4af37] bg-white/5 px-6 transition focus-within:bg-white/10 sm:h-24 md:h-28">
                  <ScanSearch size={32} className="text-[#d4af37]" />
                  <input
                    ref={barcodeInputRef}
                    type="text"
                    value={barcode}
                    onChange={handleInputChange}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        if (blockingErrorRef.current) {
                          closeBlockingError();
                          return;
                        }
                        if (isSubmittingRef.current) {
                          playErrorBeep();
                          return;
                        }
                        submitIssue(barcode);
                      }
                    }}
                    readOnly={isPending || Boolean(blockingError)}
                    placeholder="สแกนหรือพิมพ์รหัสบาร์โค้ด"
                    className="h-full w-full bg-transparent px-5 font-mono text-2xl font-medium tracking-[0.08em] text-white outline-none placeholder:text-white/35 sm:text-3xl md:text-4xl"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="border border-[#e2e8f0] bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-[#e2e8f0] bg-[#fbfcfd] px-8 py-6">
            <div className="flex items-center gap-6">
              <h3 className="text-xs font-black uppercase tracking-[0.25em] text-[#102C57]">
                รายการเบิกเรือนจำวันนี้
              </h3>
            </div>
            <div className="flex items-center gap-8">
              <div className="text-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#7d8795]">จำนวนรายการ</p>
                <p className="mt-1 text-lg font-bold text-[#102C57]">{summary.totalCount}</p>
              </div>
              <div className="h-8 w-px bg-[#e2e8f0]" />
              <div className="text-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#7d8795]">จำนวนรวม</p>
                <p className="mt-1 text-lg font-bold text-[#102C57]">{formatQuantity(summary.totalQuantity)}</p>
              </div>
              <div className="h-8 w-px bg-[#e2e8f0]" />
              <div className="text-center">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#7d8795]">น้ำหนักรวม</p>
                <p className="mt-1 text-lg font-bold text-[#102C57]">{formatWeight(summary.totalWeightKg)} <span className="text-xs">Kg</span></p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[550px] overflow-y-auto">
            <table className="w-full border-collapse border border-[#d7dde5]">
              <thead className="sticky top-0 z-10 bg-[#f8fafc] shadow-[0_1px_0_rgba(0,0,0,0.1)]">
                <tr className="text-sm font-black uppercase tracking-wider text-black">
                  <th className="w-16 border border-[#d7dde5] bg-[#f8fafc] px-4 py-2 text-center">#</th>
                  <th className="border border-[#d7dde5] bg-[#f8fafc] px-6 py-2 text-center">บาร์โค้ด</th>
                  <th className="border border-[#d7dde5] bg-[#f8fafc] px-6 py-2 text-center">สินค้า</th>
                  <th className="border border-[#d7dde5] bg-[#f8fafc] px-6 py-2 text-center">ล็อต</th>
                  <th className="w-24 border border-[#d7dde5] bg-[#f8fafc] px-4 py-2 text-center">จำนวน</th>
                  <th className="border border-[#d7dde5] bg-[#f8fafc] px-6 py-2 text-center">น้ำหนัก</th>
                  <th className="border border-[#d7dde5] bg-[#f8fafc] px-6 py-2 text-center">เวลาเบิก</th>
                </tr>
              </thead>
              <tbody className="text-sm font-bold text-black">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="border border-[#d7dde5] px-8 py-16 text-center uppercase tracking-widest text-[#a0aec0]">
                      ยังไม่มีรายการเบิกเรือนจำในวันนี้
                    </td>
                  </tr>
                ) : (
                  rows.map((row, index) => (
                    <tr key={`${row.issueItemId || row.barcode}-${index}`} className="group transition-colors hover:bg-[#fbfcfd]">
                      <td className="border border-[#d7dde5] px-4 py-2 text-center text-[#7d8795]">{index + 1}</td>
                      <td className="border border-[#d7dde5] px-6 py-2 text-center font-mono">{row.barcode}</td>
                      <td className="border border-[#d7dde5] px-6 py-2 text-center whitespace-nowrap">
                        {row.productCode}-{row.productName}
                      </td>
                      <td className="border border-[#d7dde5] px-6 py-2 text-center whitespace-nowrap">{row.lotNo}</td>
                      <td className="border border-[#d7dde5] px-4 py-2 text-center">{formatQuantity(row.quantity)}</td>
                      <td className="border border-[#d7dde5] px-6 py-2 text-center whitespace-nowrap">
                        {formatWeight(row.weightKg)} Kg
                      </td>
                      <td className="border border-[#d7dde5] px-6 py-2 text-center">{formatDateTime(row.issuedAt)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

        </section>
      </div>

      {toast ? (
        <div className="pointer-events-none fixed right-4 top-4 z-[120] flex items-center gap-3 border border-[#d4af37] bg-white px-4 py-3 shadow-[0_18px_36px_rgba(16,44,87,0.18)]">
          {toast.tone === "success" ? (
            <Check className="text-emerald-600" size={18} />
          ) : (
            <X className="text-rose-600" size={18} />
          )}
          <span className="text-sm font-bold text-[#102C57]">{toast.message}</span>
        </div>
      ) : null}

      {blockingError ? (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-[#08111f]/85 px-4 py-6 backdrop-blur-sm">
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="prison-issue-blocking-error-title"
            aria-describedby="prison-issue-blocking-error-message"
            className="w-full max-w-xl overflow-hidden border-2 border-[#d4af37] bg-white shadow-[0_30px_80px_rgba(0,0,0,0.35)]"
          >
            <div className="border-b border-[#d4af37]/35 bg-[var(--surface-navy,#102C57)] px-5 py-4 text-white sm:px-6">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center border border-[#d4af37] bg-[#d4af37]/10 text-[#d4af37]">
                  <AlertTriangle size={24} />
                </div>
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#d4af37]">
                    Scan Locked
                  </p>
                  <h3 id="prison-issue-blocking-error-title" className="mt-1 text-xl font-black text-white sm:text-2xl">
                    หยุดสแกนชั่วคราว
                  </h3>
                </div>
              </div>
            </div>

            <div className="space-y-4 px-5 py-5 sm:px-6">
              <div className="border-l-4 border-[#d4af37] bg-[#fffaf0] px-4 py-3">
                <p id="prison-issue-blocking-error-message" className="text-sm font-bold leading-6 text-[#102C57] sm:text-base">
                  {blockingError.message}
                </p>
              </div>

              <div className="grid gap-3 text-sm sm:grid-cols-2">
                <div className="border border-[#d7dde5] bg-[#fbfcfd] px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#7d8795]">บาร์โค้ด</p>
                  <p className="mt-1 break-all font-mono text-base font-black text-[#102C57]">
                    {blockingError.barcode || "-"}
                  </p>
                </div>
                <div className="border border-[#d7dde5] bg-[#fbfcfd] px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-[#7d8795]">เวลา</p>
                  <p className="mt-1 text-base font-black text-[#102C57]">
                    {formatDateTime(blockingError.occurredAt)}
                  </p>
                </div>
              </div>

              <p className="text-xs font-semibold leading-5 text-slate-600">
                ระบบจะไม่รับการยิงบาร์โค้ดถัดไปจนกว่าจะกด Enter หรือกดปุ่มตกลง
              </p>
            </div>

            <div className="flex flex-col-reverse gap-3 border-t border-[#e2e8f0] bg-[#fbfcfd] px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
              <button
                type="button"
                onClick={closeBlockingError}
                autoFocus
                className="inline-flex h-12 items-center justify-center gap-2 border border-[#102C57] bg-[var(--surface-navy,#102C57)] px-6 text-sm font-black uppercase tracking-[0.14em] text-white transition hover:bg-[var(--surface-navy,#173b72)]"
              >
                <Check size={17} />
                ตกลง
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isPickerOpen ? (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-[#08111f]/80 px-3 py-4 backdrop-blur-sm sm:px-6">
          <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden border-2 border-[#d4af37] bg-white shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
            <div className="flex flex-col gap-4 border-b border-[#d4af37]/30 bg-[var(--surface-navy,#102C57)] px-4 py-4 text-white sm:px-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.24em] text-[#d4af37]">
                  <PrisonIcon size={14} /> เบิกออกเรือนจำแบบกลุ่ม
                </p>
                <h3 className="mt-1 flex items-center gap-3 text-2xl font-black tracking-[0.04em] text-white">
                  <ListChecks size={24} />
                  เลือกรายการเบิกออกเรือนจำ
                </h3>
                <p className="mt-1 text-sm font-semibold text-white/70">
                  แสดงเฉพาะรายการที่เบิกไปเรือนจำแล้ว และยังไม่ได้เบิกออกจากเรือนจำ
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsPickerOpen(false)}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center border border-white/15 bg-white/10 text-white transition hover:bg-white/15"
                aria-label="ปิดหน้าต่างเลือกรายการเบิกออกเรือนจำ"
              >
                <X size={18} />
              </button>
            </div>

            <div className="border-b border-[#e2e8f0] bg-[#fbfcfd] p-4 sm:p-5">
              <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.2fr_auto]">
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

                <label className="block">
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
                  className="mt-5 inline-flex h-11 items-center justify-center gap-2 bg-[var(--surface-navy,#102C57)] px-5 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-[var(--surface-navy,#173b72)] lg:mt-auto"
                >
                  {isPickerLoading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
                  ค้นหา
                </button>
              </div>

              <div className="mt-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsProductFilterOpen((current) => !current)}
                    className="inline-flex h-11 w-full min-w-[17rem] items-center justify-between gap-3 border border-[#d7dde5] bg-white px-4 text-left text-sm font-black text-[#102C57] transition hover:border-[#d4af37] sm:w-auto"
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

                <div className="grid grid-cols-2 gap-3 text-sm sm:flex sm:items-center">
                  <div className="border border-[#d7dde5] bg-white px-4 py-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#64748b]">พร้อมเบิกออก</p>
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

            <div className="min-h-0 flex-1 overflow-auto bg-white">
              <table className="min-w-[58rem] w-full border-collapse">
                <thead className="sticky top-0 z-10 bg-[#fff8e7] text-sm font-black text-black shadow-sm">
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
                    <th className="border border-[#d7dde5] px-4 py-3 text-center">LOT</th>
                    <th className="border border-[#d7dde5] px-4 py-3 text-center">จำนวน</th>
                    <th className="border border-[#d7dde5] px-4 py-3 text-center">น้ำหนัก</th>
                    <th className="border border-[#d7dde5] px-4 py-3 text-center">เวลาเบิกไปเรือนจำ</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-bold text-black">
                  {isPickerLoading ? (
                    <tr>
                      <td colSpan={7} className="border border-[#d7dde5] px-6 py-16 text-center text-[#102C57]">
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
                          <td className="whitespace-nowrap border border-[#d7dde5] px-4 py-3 font-mono">{row.barcode}</td>
                          <td className="whitespace-nowrap border border-[#d7dde5] px-4 py-3">
                            {row.productCode} - {row.productName}
                          </td>
                          <td className="whitespace-nowrap border border-[#d7dde5] px-4 py-3 text-center">{row.lotNo}</td>
                          <td className="whitespace-nowrap border border-[#d7dde5] px-4 py-3 text-center">{row.quantity}</td>
                          <td className="whitespace-nowrap border border-[#d7dde5] px-4 py-3 text-center">
                            {formatWeight(row.weightKg)} Kg
                          </td>
                          <td className="whitespace-nowrap border border-[#d7dde5] px-4 py-3 text-center">
                            {formatDateTime(row.issuedAt)}
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="border border-[#d7dde5] px-6 py-16 text-center font-black uppercase tracking-widest text-[#94a3b8]">
                        ไม่พบรายการที่พร้อมเบิกออกเรือนจำ
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-[#d7dde5] bg-[#fbfcfd] px-4 py-4 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2 text-sm font-bold text-[#102C57]">
                <button
                  type="button"
                  onClick={() => handlePickerPageChange(pickerPagination.page - 1)}
                  disabled={pickerPagination.page <= 1 || isPickerLoading}
                  className="h-10 border border-[#d7dde5] bg-white px-4 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ก่อนหน้า
                </button>
                <span className="px-2">
                  หน้า {pickerPagination.page || 1} / {pickerPagination.totalPages || 1}
                </span>
                <button
                  type="button"
                  onClick={() => handlePickerPageChange(pickerPagination.page + 1)}
                  disabled={pickerPagination.page >= (pickerPagination.totalPages || 1) || isPickerLoading}
                  className="h-10 border border-[#d7dde5] bg-white px-4 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ถัดไป
                </button>
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => setIsPickerOpen(false)}
                  className="h-11 border border-[#d7dde5] bg-white px-5 text-sm font-black text-[#102C57] transition hover:bg-[#f8fafc]"
                >
                  ปิด
                </button>
                <button
                  type="button"
                  onClick={confirmPickedIssues}
                  disabled={isPending || selectedPickerSummary.totalCount === 0}
                  className="inline-flex h-11 items-center justify-center gap-2 bg-[#d4af37] px-6 text-sm font-black text-[#102C57] transition hover:bg-[#e7c85c] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  ยืนยันเบิกออก {selectedPickerSummary.totalCount} รายการ
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isCameraOpen ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-[#08111f]/85 px-4">
          <div className="w-full max-w-3xl border-2 border-[#d4af37] bg-white shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between border-b border-[#d4af37]/30 bg-[var(--surface-navy,#102C57)] px-4 py-4 text-white sm:px-6">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#d4af37]">Mobile Scanner</p>
                <h3 className="mt-1 text-xl font-black tracking-[0.08em]">สแกนด้วยกล้อง</h3>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await stopCameraScanner();
                  setIsCameraOpen(false);
                }}
                className="inline-flex h-10 w-10 items-center justify-center border border-white/15 bg-white/5 transition hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 p-4 sm:p-6">
              <div className="overflow-hidden border border-[#d4af37]/30 bg-[#0b1728]">
                <div id={scannerRegionIdRef.current} className="min-h-[320px] w-full" />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-600">
                  {isStartingCamera ? "กำลังเปิดกล้อง..." : "สแกนสำเร็จแล้วระบบจะบันทึกทันที และคง modal ไว้สำหรับสแกนต่อเนื่อง"}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSwitchCamera}
                    disabled={cameras.length < 2 || isStartingCamera}
                    className="inline-flex h-11 items-center gap-2 border border-[#d4af37] px-4 text-sm font-bold text-[#102C57] transition hover:bg-[#fff7df] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <SwitchCamera size={16} />
                    สลับกล้อง
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      await stopCameraScanner();
                      setIsCameraOpen(false);
                    }}
                    className="inline-flex h-11 items-center gap-2 bg-[var(--surface-navy,#102C57)] px-4 text-sm font-bold text-white transition hover:bg-[var(--surface-navy,#173b72)]"
                  >
                    <X size={16} />
                    ปิด
                  </button>
                </div>
              </div>

              {isStartingCamera ? (
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-600">
                  <Loader2 size={16} className="animate-spin" />
                  กำลังเตรียมกล้องสแกน...
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
