"use client";

import { Html5Qrcode } from "html5-qrcode";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Activity,
  CalendarRange,
  Camera,
  ChevronDown,
  Check,
  ClipboardList,
  Loader2,
  Package,
  RefreshCw,
  RotateCcw,
  ScanSearch,
  Search,
  SwitchCamera,
  X,
} from "lucide-react";
import WeightScalePrimaryHeader from "@/features/production-line/components/WeightScalePrimaryHeader";

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
import {
  cancelProductionPrisonInboundRequest,
  cancelProductionPrisonIssueRequest,
  fetchProductionPrisonInboundCancelable,
  fetchProductionPrisonIssueCancelable,
} from "@/features/production-line/services/productionPrisonClient";

const PAGE_LIMIT = 50;

const MODE_CONFIG = Object.freeze({
  issue: {
    eyebrow: "ระบบเรือนจำ",
    badge: "ยกเลิกเบิก",
    title: "ยกเลิกเบิกเรือนจำ",
    readyMessage: "พร้อมรับสแกนบาร์โค้ดเพื่อยกเลิกเบิกเรือนจำ",
    scanningMessage: "กำลังค้นหารายการเบิกเรือนจำ...",
    confirmLabel: "ยืนยันยกเลิกเบิก",
    modalTitle: "เลือกรายการเบิกเรือนจำ",
    triggerLabel: "เปิดรายการที่เบิกแล้ว",
    emptyMessage: "ยังไม่พบรายการเบิกเรือนจำที่ยกเลิกได้",
  },
  inbound: {
    eyebrow: "ระบบเรือนจำ",
    badge: "ยกเลิกชั่ง",
    title: "ยกเลิกชั่งเรือนจำ",
    readyMessage: "พร้อมรับสแกนบาร์โค้ดเพื่อยกเลิกชั่งเรือนจำ",
    scanningMessage: "กำลังค้นหารายการรับเข้าเรือนจำ...",
    confirmLabel: "ยืนยันยกเลิกชั่ง",
    modalTitle: "เลือกรายการรับเข้าเรือนจำ",
    triggerLabel: "เปิดรายการที่ยกเลิกชั่งได้",
    emptyMessage: "ยังไม่พบรายการรับเข้าเรือนจำที่ยกเลิกได้",
  },
});

function formatWeight(value) {
  return Number(value || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
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

function normalizeRows(mode, rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows.map((row) => ({
    rowId:
      mode === "issue"
        ? String(row?.issueItemId || "").trim()
        : String(row?.inboundItemId || "").trim(),
    docNo:
      mode === "issue"
        ? String(row?.issueNo || "").trim()
        : String(row?.inboundNo || "").trim(),
    issueDate: String(row?.issueDate || "").trim(),
    issuedAt: row?.issuedAt || null,
    barcode: String(row?.barcode || "").trim() || "-",
    productCode: String(row?.productCode || "").trim().toUpperCase() || "-",
    productName: String(row?.productName || "").trim() || "-",
    lotNo: String(row?.lotNo || "").trim() || "-",
    quantity: Number(row?.quantity || 0),
    weightKg: Number(row?.weightKg || 0),
    statusLabel:
      mode === "inbound"
        ? String(row?.itemStatusLabel || "พร้อมเบิก").trim()
        : "เบิกแล้ว",
  }));
}

function normalizeSummary(summary) {
  return {
    totalCount: Number(summary?.totalCount || 0),
    totalQuantity: Number(summary?.totalQuantity || 0),
    totalWeightKg: Number(summary?.totalWeightKg || 0),
  };
}

function normalizePagination(pagination) {
  const page = Number(pagination?.page || 1);
  const limit = Number(pagination?.limit || PAGE_LIMIT);
  const totalCount = Number(pagination?.totalCount || 0);
  const totalPages = Number(pagination?.totalPages || 0);

  return {
    page: page > 0 ? page : 1,
    limit,
    totalCount,
    totalPages,
  };
}

function normalizeFilters(filters, fallbackDate) {
  return {
    dateFrom: String(filters?.dateFrom || fallbackDate || "").trim(),
    dateTo: String(filters?.dateTo || fallbackDate || "").trim(),
    productCodes: Array.isArray(filters?.productCodes)
      ? Array.from(
          new Set(
            filters.productCodes
              .map((value) => String(value || "").trim().toUpperCase())
              .filter(Boolean)
          )
        )
      : [],
    barcode: String(filters?.barcode || "").trim(),
    page: Number(filters?.page || 1),
    limit: PAGE_LIMIT,
  };
}

function normalizeProductOptions(products) {
  if (!Array.isArray(products)) {
    return [];
  }

  return products
    .map((product) => ({
      code: String(product?.code || "").trim().toUpperCase(),
      name: String(product?.name || "").trim() || "-",
    }))
    .filter((product) => product.code)
    .sort((left, right) => left.code.localeCompare(right.code));
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

export default function ProductionPrisonCancelPageClient({
  mode,
  scope,
  todayIssueDate,
  initialRows,
  initialSummary,
  initialFilters,
  initialPagination,
}) {
  const config = MODE_CONFIG[mode] || MODE_CONFIG.issue;
  const barcodeInputRef = useRef(null);
  const productPickerRef = useRef(null);
  const scannerRegionIdRef = useRef(`prison-cancel-camera-${Math.random().toString(16).slice(2)}`);
  const scannerRef = useRef(null);
  const isSubmittingRef = useRef(false);
  const hasInitializedRef = useRef(false);
  const [barcode, setBarcode] = useState("");
  const [status, setStatus] = useState({
    state: "ready",
    message: config.readyMessage,
    readAt: null,
  });
  const [toast, setToast] = useState(null);
  const [lastActionRow, setLastActionRow] = useState(null);
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [pickerRows, setPickerRows] = useState(() => normalizeRows(mode, initialRows));
  const [pickerSummary, setPickerSummary] = useState(() => normalizeSummary(initialSummary));
  const [pickerFilters, setPickerFilters] = useState(() => normalizeFilters(initialFilters, todayIssueDate));
  const [pickerPagination, setPickerPagination] = useState(() => normalizePagination(initialPagination));
  const [activeRowId, setActiveRowId] = useState("");
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [cameraDevices, setCameraDevices] = useState([]);
  const [currentCameraId, setCurrentCameraId] = useState(null);
  const [isPending, startTransition] = useTransition();

  const productOptions = useMemo(
    () => normalizeProductOptions(scope?.products),
    [scope?.products]
  );

  const selectedProducts = useMemo(
    () => productOptions.filter((product) => pickerFilters.productCodes.includes(product.code)),
    [pickerFilters.productCodes, productOptions]
  );

  const fetchCancelable = mode === "issue"
    ? fetchProductionPrisonIssueCancelable
    : fetchProductionPrisonInboundCancelable;
  const cancelRequest = mode === "issue"
    ? cancelProductionPrisonIssueRequest
    : cancelProductionPrisonInboundRequest;

  useEffect(() => {
    barcodeInputRef.current?.focus();
    setStatus((current) => ({
      ...current,
      readAt: current.readAt || new Date().toISOString(),
    }));
  }, []);



  useEffect(() => {
    if (!toast) {
      return undefined;
    }

    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!isProductPickerOpen) {
      return undefined;
    }

    const handlePointerDown = (event) => {
      if (!productPickerRef.current?.contains(event.target)) {
        setIsProductPickerOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isProductPickerOpen]);

  const applyPickerPayload = useCallback((payload) => {
    setPickerRows(normalizeRows(mode, payload?.rows));
    setPickerSummary(normalizeSummary(payload?.summary));
    setPickerPagination(normalizePagination(payload?.pagination));
  }, [mode]);

  const loadPickerRows = useCallback((nextFilters) => {
    const requestFilters = {
      dateFrom: nextFilters.dateFrom || undefined,
      dateTo: nextFilters.dateTo || undefined,
      productCodes: nextFilters.productCodes,
      barcode: nextFilters.barcode || undefined,
      page: nextFilters.page,
      limit: PAGE_LIMIT,
    };

    startTransition(async () => {
      try {
        const payload = await fetchCancelable(requestFilters);
        applyPickerPayload(payload?.data || payload);
      } catch (error) {
        const message = error?.message || "ไม่สามารถโหลดรายการได้";
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
  }, [applyPickerPayload, fetchCancelable]);

  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const clientDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());

    if (todayIssueDate && clientDate !== todayIssueDate) {
      const next = {
        dateFrom: clientDate,
        dateTo: clientDate,
        productCodes: [],
        barcode: "",
        page: 1,
        limit: PAGE_LIMIT,
      };
      setPickerFilters(next);
      loadPickerRows(next);
    }
  }, [todayIssueDate, loadPickerRows]);

  const refreshTopSection = useCallback(() => {
    loadPickerRows({
      dateFrom: todayIssueDate,
      dateTo: todayIssueDate,
      productCodes: [],
      barcode: "",
      page: 1,
    });
  }, [loadPickerRows, todayIssueDate]);

  const cancelRow = useCallback((row) => {
    if (!row?.rowId || isSubmittingRef.current) {
      return;
    }

    const confirmed = window.confirm(`ต้องการ${config.confirmLabel} บาร์โค้ด ${row.barcode} ใช่หรือไม่`);
    if (!confirmed) {
      return;
    }

    isSubmittingRef.current = true; // Synchronous Lock!

    setActiveRowId(row.rowId);
    setStatus({
      state: "processing",
      message: `${config.confirmLabel} บาร์โค้ด ${row.barcode}...`,
      readAt: new Date().toISOString(),
    });

    startTransition(async () => {
      try {
        const payload = await cancelRequest(row.rowId);
        const data = payload?.data || payload;
        playSuccessBeep(); // Audio Feedback on Success
        setLastActionRow(row);
        setStatus({
          state: "success",
          message: `${config.confirmLabel} ${row.barcode} เรียบร้อยแล้ว`,
          readAt: new Date().toISOString(),
        });
        setToast({
          tone: "success",
          message: `${config.confirmLabel} ${row.barcode} เรียบร้อยแล้ว`,
        });
        setBarcode("");
        setActiveRowId("");

        isSubmittingRef.current = false; // Release lock!

        // No setRecentRows call

        loadPickerRows({
          ...pickerFilters,
          page: pickerPagination.page,
        });

        window.setTimeout(() => {
          barcodeInputRef.current?.focus();
          barcodeInputRef.current?.select();
        }, 0);
      } catch (error) {
        isSubmittingRef.current = false; // Release lock!
        playErrorBeep(); // Audio Feedback on Error
        const message = error?.message || "ไม่สามารถยกเลิกรายการได้";
        setStatus({
          state: "error",
          message,
          readAt: new Date().toISOString(),
        });
        setToast({
          tone: "error",
          message,
        });
        setActiveRowId("");
      }
    });
  }, [cancelRequest, config.confirmLabel, loadPickerRows, pickerFilters, pickerPagination.page]);

  const submitFromBarcode = useCallback((nextBarcode) => {
    const normalizedBarcode = String(nextBarcode || "").trim();
    if (!normalizedBarcode || isSubmittingRef.current) {
      return;
    }

    isSubmittingRef.current = true; // Synchronous Lock!
    setBarcode(""); // Clear the input buffer immediately so new scans don't append!

    setStatus({
      state: "processing",
      message: config.scanningMessage,
      readAt: new Date().toISOString(),
    });

    (async () => {
      try {
        const payload = await fetchCancelable({
          barcode: normalizedBarcode,
          page: 1,
          limit: 1,
        });

        const responseData = payload?.data || payload;
        const matchedRows = normalizeRows(mode, responseData?.rows);
        const row = matchedRows.find((entry) => entry.barcode === normalizedBarcode) || matchedRows[0];

        if (!row) {
          throw new Error(config.emptyMessage);
        }

        isSubmittingRef.current = false; // Release lock before cancelRow
        cancelRow(row);
      } catch (error) {
        isSubmittingRef.current = false; // Release lock!
        playErrorBeep(); // Audio Feedback on Error
        const message = error?.message || "ไม่สามารถค้นหารายการได้";
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
    })();
  }, [cancelRow, config.emptyMessage, config.scanningMessage, fetchCancelable, mode]);

  const handleInputChange = (event) => {
    if (isSubmittingRef.current) {
      playErrorBeep();
      return;
    }
    const val = event.target.value;
    setBarcode(val);

    const normalized = String(val || "").trim();
    if (normalized.length === 14) {
      submitFromBarcode(normalized);
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
      console.error("Unable to stop prison cancel camera scanner:", error);
    }
  }, []);

  const loadCameras = useCallback(async () => {
    try {
      const devices = await Html5Qrcode.getCameras();
      if (Array.isArray(devices) && devices.length) {
        setCameraDevices(devices);
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
          if (!normalizedBarcode || isSubmittingRef.current) {
            return;
          }
          setBarcode(normalizedBarcode);
          submitFromBarcode(normalizedBarcode);
        },
        () => {}
      );
    } catch (error) {
      console.error("Unable to start prison cancel camera scanner:", error);
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
  }, [submitFromBarcode]);

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

  const statusTone = useMemo(() => getStatusTone(status.state), [status.state]);

  return (
    <div className="min-h-screen bg-[#f4f6f8] text-[#262626]">
      <WeightScalePrimaryHeader
        eyebrow={config.eyebrow}
        badge={config.badge}
        title={config.title}
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
              {!lastActionRow ? (
                <div className="flex h-full flex-col items-center justify-center py-6 text-center">
                  <div className="flex items-center gap-4 text-[#102C57]/20">
                    <RotateCcw size={48} strokeWidth={1} />
                    <div className="text-left">
                      <p className="text-[10px] font-black uppercase tracking-[0.3em]">Reverse Flow</p>
                      <h2 className="text-3xl font-black uppercase tracking-widest">READY TO REVERSE</h2>
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
                        ยกเลิกสำเร็จ
                      </span>
                    </div>
                    <div className="hidden h-10 w-px bg-[#e2e8f0] sm:block" />
                    <div className="min-w-0 flex-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#a0aec0]">
                        บาร์โค้ดล่าสุด
                      </span>
                      <h2 className="mt-1 truncate font-mono text-2xl font-medium text-[#102C57] sm:text-3xl">
                        {lastActionRow.barcode}
                      </h2>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 border-t border-[#e2e8f0] pt-6 md:flex md:items-center md:gap-8">
                    <div className="min-w-0 flex-1 text-center">
                      <p className="text-[10px] font-black uppercase tracking-widest text-black">รหัสสินค้า</p>
                      <p className="mt-1 truncate text-lg font-bold text-black sm:text-xl">
                        {lastActionRow.productCode}
                      </p>
                    </div>
                    <div className="hidden h-12 w-px bg-[#e2e8f0] md:block" />
                    <div className="min-w-0 flex-1 text-center">
                      <p className="text-[10px] font-black uppercase tracking-widest text-black">ล็อต</p>
                      <p className="mt-1 text-lg font-bold text-black sm:text-xl">
                        {lastActionRow.lotNo}
                      </p>
                    </div>
                    <div className="hidden h-12 w-px bg-[#e2e8f0] md:block" />
                    <div className="min-w-0 flex-1 text-center">
                      <p className="text-[10px] font-black uppercase tracking-widest text-black">น้ำหนัก</p>
                      <p className="mt-1 text-lg font-bold text-black sm:text-xl">
                        {formatWeight(lastActionRow.weightKg)} <span className="text-xs sm:text-sm">Kg</span>
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
                onClick={() => {
                  document.getElementById("search-section")?.scrollIntoView({ behavior: "smooth" });
                }}
                className="flex h-14 items-center justify-center gap-2 bg-[var(--surface-navy,#102C57)] text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-[var(--surface-navy,#173b72)]"
              >
                <ClipboardList size={16} />
                {config.triggerLabel}
              </button>
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
                        if (isSubmittingRef.current) {
                          playErrorBeep();
                          return;
                        }
                        submitFromBarcode(barcode);
                      }
                    }}
                    readOnly={isPending}
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

        <section id="search-section" className="overflow-hidden border-2 border-[#d4af37] bg-white shadow-[0_20px_40px_rgba(0,0,0,0.12)]">
          <div className="flex items-center justify-between border-b border-[#d4af37]/30 bg-[var(--surface-navy,#102C57)] px-4 py-4 text-white sm:px-6">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#d4af37]">รายการเบิกออกเรือนจำ</p>
              <h2 className="mt-1 text-2xl font-black tracking-[0.08em]">ค้นหารายการเบิกและยกเลิก</h2>
            </div>
          </div>

          <div className="border-b border-slate-200 bg-slate-50/50 p-4 sm:p-6">
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_16rem_16rem]">
              <label className="flex flex-col gap-2">
                <span className="inline-flex items-center gap-2 text-sm font-black text-black">
                  <Search size={16} />
                  ค้นหาบาร์โค้ด
                </span>
                <input
                  type="text"
                  value={pickerFilters.barcode}
                  onChange={(event) =>
                    setPickerFilters((current) => ({
                      ...current,
                      barcode: event.target.value,
                    }))
                  }
                  className="h-12 border border-[#d7dbe3] px-4 text-[14px] font-semibold text-black outline-none transition focus:border-[#d4af37]"
                  placeholder="กรอกหรือสแกนบาร์โค้ด"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="inline-flex items-center gap-2 text-sm font-black text-black">
                  <CalendarRange size={16} />
                  จากวันที่
                </span>
                <input
                  type="date"
                  value={pickerFilters.dateFrom}
                  onChange={(event) =>
                    setPickerFilters((current) => ({
                      ...current,
                      dateFrom: event.target.value,
                    }))
                  }
                  className="h-12 border border-[#d7dbe3] px-4 text-[14px] font-semibold text-black outline-none transition focus:border-[#d4af37]"
                />
              </label>

              <label className="flex flex-col gap-2">
                <span className="inline-flex items-center gap-2 text-sm font-black text-black">
                  <CalendarRange size={16} />
                  ถึงวันที่
                </span>
                <input
                  type="date"
                  value={pickerFilters.dateTo}
                  onChange={(event) =>
                    setPickerFilters((current) => ({
                      ...current,
                      dateTo: event.target.value,
                    }))
                  }
                  className="h-12 border border-[#d7dbe3] px-4 text-[14px] font-semibold text-black outline-none transition focus:border-[#d4af37]"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="relative w-full max-w-md" ref={productPickerRef}>
                <span className="mb-2 inline-flex items-center gap-2 text-sm font-black text-black">
                  <Package size={16} />
                  สินค้า
                </span>
                <button
                  type="button"
                  onClick={() => setIsProductPickerOpen((current) => !current)}
                  className="flex h-12 w-full items-center justify-between border border-[#d7dbe3] px-4 text-left text-[14px] font-semibold text-black transition hover:border-[#d4af37]"
                >
                  <span className="truncate">
                    {selectedProducts.length
                      ? `เลือกแล้ว ${selectedProducts.length} รายการ`
                      : "ทุกสินค้าในรายการ"}
                  </span>
                  <ChevronDown size={16} />
                </button>

                {isProductPickerOpen ? (
                  <div className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto border border-[#d7dbe3] bg-white shadow-[0_16px_30px_rgba(16,44,87,0.12)]">
                    {productOptions.map((product) => {
                      const checked = pickerFilters.productCodes.includes(product.code);
                      return (
                        <label
                          key={product.code}
                          className="flex cursor-pointer items-start gap-3 border-b border-slate-100 px-4 py-3 text-sm font-semibold text-black hover:bg-[#fff8e7]"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setPickerFilters((current) => ({
                                ...current,
                                page: 1,
                                productCodes: checked
                                  ? current.productCodes.filter((entry) => entry !== product.code)
                                  : [...current.productCodes, product.code],
                              }))
                            }
                            className="mt-0.5 h-4 w-4 border-slate-300 text-[#102C57]"
                          />
                          <span className="truncate">{`${product.code} - ${product.name}`}</span>
                        </label>
                      );
                    })}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    const nextFilters = {
                      dateFrom: todayIssueDate,
                      dateTo: todayIssueDate,
                      productCodes: [],
                      barcode: "",
                      page: 1,
                      limit: PAGE_LIMIT,
                    };
                    setPickerFilters(nextFilters);
                    loadPickerRows(nextFilters);
                  }}
                  className="inline-flex h-12 items-center gap-2 border border-[#d7dbe3] px-4 text-sm font-bold text-[#102C57] transition hover:border-[#d4af37] hover:bg-[#fff8e7]"
                >
                  <RefreshCw size={16} />
                  ล้างตัวกรอง
                </button>
                <button
                  type="button"
                  onClick={() =>
                    loadPickerRows({
                      ...pickerFilters,
                      page: 1,
                    })
                  }
                  className="inline-flex h-12 items-center gap-2 bg-[var(--surface-navy,#102C57)] px-4 text-sm font-bold text-white transition hover:bg-[var(--surface-navy,#173b72)]"
                >
                  <Search size={16} />
                  ค้นหา
                </button>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-600">
              <span className="rounded-none border border-[#eadfb8] bg-[#fff8e7] px-3 py-2 text-[#7a5f00]">
                จำนวนรายการ {pickerSummary.totalCount}
              </span>
              <span className="rounded-none border border-[#eadfb8] bg-[#fff8e7] px-3 py-2 text-[#7a5f00]">
                จำนวนรวม {pickerSummary.totalQuantity}
              </span>
              <span className="rounded-none border border-[#eadfb8] bg-[#fff8e7] px-3 py-2 text-[#7a5f00]">
                น้ำหนักรวม {formatWeight(pickerSummary.totalWeightKg)} กก.
              </span>
            </div>
          </div>

          <div className="overflow-hidden border-b border-slate-200">
            <div className="hidden md:block">
              <table className="w-full border-collapse border border-[#d7dde5]">
                <thead>
                  <tr className="bg-[#f8fafc] text-sm font-black uppercase tracking-wider text-black">
                    <th className="border border-[#d7dde5] px-4 py-4 text-center">บาร์โค้ด</th>
                    <th className="border border-[#d7dde5] px-6 py-4 text-center">สินค้า</th>
                    <th className="border border-[#d7dde5] px-6 py-4 text-center">LOT</th>
                    <th className="border border-[#d7dde5] px-6 py-4 text-center">น้ำหนัก</th>
                    <th className="border border-[#d7dde5] px-6 py-4 text-center">เวลา</th>
                    <th className="border border-[#d7dde5] px-6 py-4 text-center">การทำงาน</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-bold text-black bg-white">
                  {pickerRows.length ? pickerRows.map((row) => (
                    <tr key={row.rowId} className="group hover:bg-[#fbfcfd] transition-colors">
                      <td className="border border-[#d7dde5] px-4 py-4 font-mono text-center">{row.barcode}</td>
                      <td className="border border-[#d7dde5] px-6 py-4 text-center">{`${row.productCode} - ${row.productName}`}</td>
                      <td className="border border-[#d7dde5] px-6 py-4 text-center">{row.lotNo}</td>
                      <td className="border border-[#d7dde5] px-6 py-4 text-center whitespace-nowrap">{formatWeight(row.weightKg)} กก.</td>
                      <td className="border border-[#d7dde5] px-6 py-4 text-center whitespace-nowrap">{formatDateTime(row.issuedAt)}</td>
                      <td className="border border-[#d7dde5] px-6 py-4 text-center">
                        <button
                          type="button"
                          onClick={() => cancelRow(row)}
                          disabled={isPending && activeRowId === row.rowId}
                          className="inline-flex h-11 items-center gap-2 bg-[var(--surface-navy,#102C57)] px-4 text-sm font-bold text-white transition hover:bg-[var(--surface-navy,#173b72)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isPending && activeRowId === row.rowId ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <RotateCcw size={16} />
                          )}
                          ยกเลิกเบิก
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} className="border border-[#d7dde5] px-8 py-16 text-center uppercase tracking-widest text-[#a0aec0]">
                        {config.emptyMessage}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="space-y-3 p-3 md:hidden">
              {pickerRows.length ? pickerRows.map((row) => (
                <article key={row.rowId} className="rounded-none border border-[#e6dcc0] bg-[#fffdf7] px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="truncate font-mono text-[13px] font-bold text-black">{row.barcode}</span>
                    <span className="whitespace-nowrap text-[12px] font-bold text-slate-600">{formatDateTime(row.issuedAt)}</span>
                  </div>
                  <p className="mt-2 truncate text-[13px] font-bold text-black">{`${row.productCode} - ${row.productName}`}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] font-bold text-slate-700">
                    <span>LOT {row.lotNo}</span>
                    <span>{formatWeight(row.weightKg)} กก.</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => cancelRow(row)}
                    disabled={isPending && activeRowId === row.rowId}
                    className="mt-3 inline-flex h-10 w-full items-center justify-center gap-2 bg-[var(--surface-navy,#102C57)] px-4 text-xs font-bold uppercase tracking-[0.12em] text-white"
                  >
                    {isPending && activeRowId === row.rowId ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <RotateCcw size={14} />
                    )}
                    ยกเลิกเบิก
                  </button>
                </article>
              )) : (
                <div className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
                  {config.emptyMessage}
                </div>
              )}
            </div>
          </div>

          <div className="p-4 sm:p-6 flex flex-col gap-3 border-t border-slate-200 pt-4 sm:flex-row sm:items-center sm:justify-between bg-white">
            <p className="text-sm font-semibold text-slate-600">
              หน้า {pickerPagination.page} จาก {pickerPagination.totalPages || 1} | ทั้งหมด {pickerPagination.totalCount} รายการ
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() =>
                  loadPickerRows({
                    ...pickerFilters,
                    page: Math.max(1, pickerPagination.page - 1),
                  })
                }
                disabled={pickerPagination.page <= 1 || isPending}
                className="inline-flex h-11 items-center gap-2 border border-[#d7dbe3] px-4 text-sm font-bold text-[#102C57] transition hover:border-[#d4af37] hover:bg-[#fff8e7] disabled:cursor-not-allowed disabled:opacity-50"
              >
                ก่อนหน้า
              </button>
              <button
                type="button"
                onClick={() =>
                  loadPickerRows({
                    ...pickerFilters,
                    page: pickerPagination.page + 1,
                  })
                }
                disabled={
                  pickerPagination.totalPages === 0
                  || pickerPagination.page >= pickerPagination.totalPages
                  || isPending
                }
                className="inline-flex h-11 items-center gap-2 bg-[var(--surface-navy,#102C57)] px-4 text-sm font-bold text-white transition hover:bg-[var(--surface-navy,#173b72)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                ถัดไป
              </button>
            </div>
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

      {isCameraOpen ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-[#08111f]/85 px-4">
          <div className="w-full max-w-3xl border-2 border-[#d4af37] bg-white shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between border-b border-[#d4af37]/30 bg-[var(--surface-navy,#102C57)] px-4 py-4 text-white sm:px-6">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#d4af37]">Mobile Scanner</p>
                <h3 className="mt-1 text-xl font-black tracking-[0.08em]">{config.title}</h3>
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
                  {isStartingCamera ? "กำลังเปิดกล้อง..." : "สแกนสำเร็จแล้วระบบจะยกเลิกรายการทันที และคง modal ไว้สำหรับสแกนต่อเนื่อง"}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (cameraDevices.length < 2) {
                        return;
                      }
                      const currentIndex = currentCameraId
                        ? cameraDevices.findIndex((camera) => camera.id === currentCameraId)
                        : 0;
                      const nextIndex = (currentIndex + 1) % cameraDevices.length;
                      setCurrentCameraId(cameraDevices[nextIndex]?.id || null);
                    }}
                    disabled={cameraDevices.length < 2 || isStartingCamera}
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

      {isCameraOpen ? (
        <div className="fixed inset-0 z-[140] flex items-center justify-center bg-[#08111f]/85 px-4">
          <div className="w-full max-w-3xl border-2 border-[#d4af37] bg-white shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between border-b border-[#d4af37]/30 bg-[var(--surface-navy,#102C57)] px-4 py-4 text-white sm:px-6">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#d4af37]">Mobile Scanner</p>
                <h3 className="mt-1 text-xl font-black tracking-[0.08em]">{config.title}</h3>
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
                  {isStartingCamera ? "กำลังเปิดกล้อง..." : "สแกนสำเร็จแล้วระบบจะยกเลิกรายการทันที และคง modal ไว้สำหรับสแกนต่อเนื่อง"}
                </div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      if (cameraDevices.length < 2) {
                        return;
                      }
                      const currentIndex = currentCameraId
                        ? cameraDevices.findIndex((camera) => camera.id === currentCameraId)
                        : 0;
                      const nextIndex = (currentIndex + 1) % cameraDevices.length;
                      setCurrentCameraId(cameraDevices[nextIndex]?.id || null);
                    }}
                    disabled={cameraDevices.length < 2 || isStartingCamera}
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

      {/* Historical picker modal has been removed since the searchable table is now inline on the main page */}
    </div>
  );
}
