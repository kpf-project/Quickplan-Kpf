"use client";

import { Html5Qrcode } from "html5-qrcode";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Activity,
  CalendarRange,
  Camera,
  ChevronDown,
  ClipboardList,
  Loader2,
  Package,
  PackageSearch,
  RefreshCw,
  ScanSearch,
  ScanLine,
  Search,
  SwitchCamera,
  X,
  History,
  RotateCcw,
  Check,
} from "lucide-react";
import WeightScalePrimaryHeader from "@/features/production-line/components/WeightScalePrimaryHeader";
import {
  cancelProductionStockIssueRequest,
  fetchCancelableProductionStockIssues,
} from "@/features/production-line/services/productionStockIssueClient";

const PAGE_LIMIT = 50;

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
    issueType: String(row?.issueType || "").trim().toUpperCase(),
    issueDate: String(row?.issueDate || "").trim(),
    issuedAt: row?.issuedAt || null,
    barcode: String(row?.barcode || "").trim() || "-",
    productCode: String(row?.productCode || "").trim().toUpperCase() || "-",
    productName: String(row?.productName || "").trim() || "-",
    targetProductCode: String(row?.targetProductCode || "").trim().toUpperCase(),
    targetProductName: String(row?.targetProductName || "").trim(),
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
    issueType: String(filters?.issueType || "").trim().toUpperCase() || "ALL",
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

function getIssueTypeLabel(issueTypes, issueType) {
  return issueTypes.find((item) => item.value === issueType)?.label || issueType;
}

function buildCancelableFilters(nextFilters) {
  return {
    dateFrom: nextFilters.dateFrom || undefined,
    dateTo: nextFilters.dateTo || undefined,
    issueType: nextFilters.issueType === "ALL" ? undefined : nextFilters.issueType,
    productCodes: nextFilters.productCodes,
    barcode: nextFilters.barcode || undefined,
    page: nextFilters.page,
    limit: PAGE_LIMIT,
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

export default function ProductionStockIssueCancelPageClient({
  scope,
  issueTypes,
  todayIssueDate,
  initialRows,
  initialSummary,
  initialFilters,
  initialPagination,
}) {
  const barcodeInputRef = useRef(null);
  const productPickerRef = useRef(null);
  const scannerRegionIdRef = useRef(`issue-cancel-camera-${Math.random().toString(16).slice(2)}`);
  const cameraScannerRef = useRef(null);
  const isSubmittingRef = useRef(false);
  const [barcode, setBarcode] = useState("");
  const [status, setStatus] = useState({
    state: "ready",
    message: "พร้อมรับสแกนบาร์โค้ด",
    readAt: null,
  });
  const [lastScannedItem, setLastScannedItem] = useState(null);
  const [toast, setToast] = useState(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [pickerRows, setPickerRows] = useState(() => normalizeRows(initialRows));
  const [pickerSummary, setPickerSummary] = useState(() => normalizeSummary(initialSummary));
  const [pickerFilters, setPickerFilters] = useState(() => normalizeFilters(initialFilters, todayIssueDate));
  const [pickerPagination, setPickerPagination] = useState(() => normalizePagination(initialPagination));
  const [activeIssueItemId, setActiveIssueItemId] = useState("");
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [cameraDevices, setCameraDevices] = useState([]);
  const [currentCameraId, setCurrentCameraId] = useState(null);
  const [recentCancelations, setRecentCancelations] = useState([]);
  const [isPending, startTransition] = useTransition();

  const productOptions = useMemo(
    () => normalizeProductOptions(scope?.products),
    [scope?.products]
  );

  const selectedProducts = useMemo(
    () => productOptions.filter((product) => pickerFilters.productCodes.includes(product.code)),
    [pickerFilters.productCodes, productOptions]
  );

  useEffect(() => {
    barcodeInputRef.current?.focus();
    setStatus((current) => ({
      ...current,
      readAt: current.readAt || new Date().toISOString(),
    }));
  }, []);

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
    setPickerRows(normalizeRows(payload?.rows));
    setPickerSummary(normalizeSummary(payload?.summary));
    setPickerPagination(normalizePagination(payload?.pagination));
  }, []);

  const loadPickerRows = useCallback(
    (nextFilters) => {
      const requestFilters = {
        ...nextFilters,
        limit: PAGE_LIMIT,
      };

      startTransition(async () => {
        try {
          const payload = await fetchCancelableProductionStockIssues(
            buildCancelableFilters(requestFilters)
          );

          applyPickerPayload(payload);
          setPickerFilters((current) => ({
            ...current,
            ...normalizeFilters(payload?.filters, todayIssueDate),
            page: payload?.pagination?.page || requestFilters.page,
            limit: PAGE_LIMIT,
          }));
          setStatus({
            state: "ready",
            message: "อัปเดตรายการที่เบิกแล้วเรียบร้อย",
            readAt: new Date().toISOString(),
          });
        } catch (error) {
          setStatus({
            state: "error",
            message: error?.message || "ไม่สามารถโหลดรายการที่เบิกแล้วได้",
            readAt: new Date().toISOString(),
          });
        }
      });
    },
    [applyPickerPayload, todayIssueDate]
  );

  const completeCancel = useCallback(
    (row, successPrefix = "ยกเลิกเบิก") => {
      if (!row?.issueItemId) {
        return;
      }

      setActiveIssueItemId(row.issueItemId);
      setStatus({
        state: "processing",
        message: `กำลังยกเลิกบาร์โค้ด ${row.barcode}...`,
        readAt: new Date().toISOString(),
      });

      startTransition(async () => {
        try {
          await cancelProductionStockIssueRequest(row.issueItemId, {
            voidReason: "ยกเลิกจากหน้ายกเลิกเบิกผลิตภัณฑ์",
          });

          const refreshPayload = await fetchCancelableProductionStockIssues(
            buildCancelableFilters({
              ...pickerFilters,
              page: pickerPagination.page,
              limit: PAGE_LIMIT,
            })
          );

          applyPickerPayload(refreshPayload);
          setPickerFilters((current) => ({
            ...current,
            ...normalizeFilters(refreshPayload?.filters, todayIssueDate),
            page: refreshPayload?.pagination?.page || 1,
            limit: PAGE_LIMIT,
          }));

          const successMessage = `${successPrefix}บาร์โค้ด ${row.barcode} และคืนสต็อกกลับเรียบร้อย`;
          setStatus({
            state: "success",
            message: successMessage,
            readAt: new Date().toISOString(),
          });
          setToast({
            tone: "success",
            message: successMessage,
          });
          
          setLastScannedItem(row);
          setRecentCancelations((prev) => [
            { ...row, canceledAt: new Date().toISOString() },
            ...prev.slice(0, 19),
          ]);
          
          setBarcode("");
          setActiveIssueItemId("");
          barcodeInputRef.current?.focus();
        } catch (error) {
          const message = error?.message || "ไม่สามารถยกเลิกเบิกได้";
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
    },
    [applyPickerPayload, pickerFilters, pickerPagination.page, todayIssueDate]
  );

  const resolveBarcodeForCancel = useCallback(
    (nextBarcode, sourceLabel = "ยกเลิกเบิก") => {
      const normalizedBarcode = String(nextBarcode || "").trim();
      if (!normalizedBarcode) {
        setStatus({
          state: "error",
          message: "กรุณากรอกหรือสแกนรหัสบาร์โค้ดก่อน",
          readAt: new Date().toISOString(),
        });
        barcodeInputRef.current?.focus();
        return;
      }

      setStatus({
        state: "processing",
        message: `กำลังค้นหาบาร์โค้ด ${normalizedBarcode}...`,
        readAt: new Date().toISOString(),
      });

      startTransition(async () => {
        try {
          const payload = await fetchCancelableProductionStockIssues({
            barcode: normalizedBarcode,
            page: 1,
            limit: PAGE_LIMIT,
          });

          const matchedRows = normalizeRows(payload?.rows);
          if (!matchedRows.length) {
            throw new Error(`ไม่พบรายการเบิกของบาร์โค้ด ${normalizedBarcode}`);
          }

          if (matchedRows.length === 1) {
            completeCancel(matchedRows[0], `${sourceLabel}`);
            return;
          }

          applyPickerPayload(payload);
          setPickerFilters({
            ...normalizeFilters(payload?.filters, todayIssueDate),
            barcode: normalizedBarcode,
            page: payload?.pagination?.page || 1,
            limit: PAGE_LIMIT,
          });
          setIsPickerOpen(true);
          setStatus({
            state: "ready",
            message: `พบบาร์โค้ด ${normalizedBarcode} มากกว่า 1 รายการ กรุณาเลือกรายการที่ต้องการยกเลิก`,
            readAt: new Date().toISOString(),
          });
        } catch (error) {
          const message = error?.message || "ไม่สามารถค้นหารายการเบิกจากบาร์โค้ดได้";
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
    },
    [applyPickerPayload, completeCancel, todayIssueDate]
  );

  const stopCameraScanner = useCallback(async () => {
    const scanner = cameraScannerRef.current;
    if (!scanner) {
      return;
    }

    try {
      if (scanner.isScanning) {
        await scanner.stop();
      }
    } catch (error) {
      console.error("Unable to stop cancel camera scanner:", error);
    }
  }, []);

  const loadCameraDevices = useCallback(async () => {
    try {
      const devices = await Html5Qrcode.getCameras();
      if (Array.isArray(devices) && devices.length) {
        setCameraDevices(devices);
        setCurrentCameraId((current) => current || devices[0]?.id || null);
      }
    } catch (error) {
      console.error("Unable to load cancel cameras:", error);
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

        if (!cameraScannerRef.current) {
          cameraScannerRef.current = new Html5Qrcode(regionId);
        }

        const scanner = cameraScannerRef.current;
        if (scanner.isScanning) {
          await scanner.stop();
        }

        await scanner.start(
          cameraId ? { deviceId: { exact: cameraId } } : { facingMode: "environment" },
          { fps: 10, qrbox: { width: 240, height: 160 }, aspectRatio: 1.3333333 },
          (decodedText) => {
            if (isSubmittingRef.current) {
              return;
            }

            const normalizedBarcode = String(decodedText || "").trim();
            if (!normalizedBarcode) {
              return;
            }

            setBarcode(normalizedBarcode);
            resolveBarcodeForCancel(normalizedBarcode, "ยกเลิกเบิกด้วยกล้อง ");
          },
          () => {}
        );
      } catch (error) {
        console.error("Unable to start cancel camera scanner:", error);
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
    [resolveBarcodeForCancel]
  );

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

  const handleOpenCamera = useCallback(async () => {
    setIsCameraOpen(true);
    await loadCameraDevices();
  }, [loadCameraDevices]);

  const handleCloseCamera = useCallback(async () => {
    await stopCameraScanner();
    setIsCameraOpen(false);
  }, [stopCameraScanner]);

  const handleSwitchCamera = useCallback(() => {
    if (cameraDevices.length < 2) {
      return;
    }

    const currentIndex = currentCameraId
      ? cameraDevices.findIndex((camera) => camera.id === currentCameraId)
      : 0;
    const nextIndex = (currentIndex + 1) % cameraDevices.length;
    setCurrentCameraId(cameraDevices[nextIndex]?.id || null);
  }, [cameraDevices, currentCameraId]);

  const handleSubmitBarcode = useCallback(() => {
    resolveBarcodeForCancel(barcode, "ยกเลิกเบิก");
  }, [barcode, resolveBarcodeForCancel]);

  const handleOpenPicker = useCallback(() => {
    setIsPickerOpen(true);
  }, []);

  const handleResetPickerFilters = useCallback(() => {
    const nextFilters = {
      dateFrom: todayIssueDate,
      dateTo: todayIssueDate,
      issueType: "ALL",
      productCodes: [],
      barcode: "",
      page: 1,
      limit: PAGE_LIMIT,
    };

    setPickerFilters(nextFilters);
    loadPickerRows(nextFilters);
    setIsProductPickerOpen(false);
  }, [loadPickerRows, todayIssueDate]);

  const handlePickerSearch = useCallback(() => {
    loadPickerRows({
      ...pickerFilters,
      page: 1,
      limit: PAGE_LIMIT,
    });
  }, [loadPickerRows, pickerFilters]);

  const handlePickerPageChange = useCallback(
    (nextPage) => {
      const targetPage = Math.max(1, nextPage);
      const nextFilters = {
        ...pickerFilters,
        page: targetPage,
        limit: PAGE_LIMIT,
      };

      setPickerFilters(nextFilters);
      loadPickerRows(nextFilters);
    },
    [loadPickerRows, pickerFilters]
  );

  const toggleProductCode = useCallback((productCode) => {
    const normalizedCode = String(productCode || "").trim().toUpperCase();
    if (!normalizedCode) {
      return;
    }

    setPickerFilters((current) => {
      const exists = current.productCodes.includes(normalizedCode);
      return {
        ...current,
        productCodes: exists
          ? current.productCodes.filter((code) => code !== normalizedCode)
          : [...current.productCodes, normalizedCode],
        page: 1,
      };
    });
  }, []);

  return (
    <div className="min-h-screen bg-[#f4f6f8] text-[#262626]">
      <WeightScalePrimaryHeader
        eyebrow="ระบบยกเลิกเบิกผลิตภัณฑ์"
        badge="Reverse Movement"
        title="ยกเลิกเบิกผลิตภัณฑ์"
        actions={(
          <div className="flex items-center gap-3">
             <button
                type="button"
                onClick={handleOpenPicker}
                className="inline-flex h-10 items-center justify-center gap-2 border border-[#d4af37]/35 bg-white/[0.03] px-4 text-sm font-black uppercase tracking-[0.14em] text-white transition hover:border-[#d4af37] hover:bg-white/[0.06] hover:text-[#f3d67a]"
              >
                <History size={16} />
                ประวัติย้อนหลัง
              </button>
          </div>
        )}
      />

      <section className="border-b border-[#1f3047] bg-[#08111d] text-white">
        <div className="mx-auto max-w-[84rem] px-4 pb-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between border-t border-white/10 pt-4">
            <div
              className={`inline-flex items-center gap-2 border px-4 py-2 text-xs font-black uppercase tracking-[0.18em] ${getStatusTone(status.state)}`}
            >
              <Activity size={14} />
              {status.state}
            </div>

            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">
              {formatDateTime(status.readAt)}
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[88rem] px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8">
          
          <section className="relative overflow-hidden border-2 border-[#d4af37] bg-white shadow-[0_30px_60px_rgba(0,0,0,0.2)]">
            <div className="grid lg:grid-cols-12 border-b-2 border-[#d4af37]/30 bg-[#fbfcfd]">
              <div className="lg:col-span-8 p-6 sm:p-8 lg:p-10 border-b lg:border-b-0 lg:border-r border-[#e2e8f0]">
                {!lastScannedItem ? (
                  <div className="flex h-full flex-col items-center justify-center py-4 text-center">
                    <div className="flex items-center gap-4 text-[#102C57]/20">
                       <ScanLine size={48} strokeWidth={1} />
                       <div className="text-left">
                          <p className="text-[10px] font-black uppercase tracking-[0.3em]">System Ready</p>
                          <h2 className="text-3xl font-black uppercase tracking-widest">READY TO SCAN</h2>
                       </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[#a0aec0]">สถานะการยกเลิกล่าสุด</span>
                        <span className="mt-1 px-3 py-1 text-sm font-black tracking-wider self-start bg-rose-600 text-white">
                          ยกเลิกสำเร็จ
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
                        <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-black">ชื่อสินค้า</p>
                        <p className="mt-1 text-lg sm:text-xl font-bold text-black truncate">{lastScannedItem.productName}</p>
                      </div>
                      <div className="hidden md:block h-12 w-px bg-[#e2e8f0]" />
                      <div className="flex-1 min-w-0 text-center">
                        <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-black">ล็อต</p>
                        <p className="mt-1 text-lg sm:text-xl font-bold text-black">{lastScannedItem.lotNo}</p>
                      </div>
                      <div className="hidden md:block h-12 w-px bg-[#e2e8f0]" />
                      <div className="flex-1 min-w-0 text-center">
                        <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-black">น้ำหนัก</p>
                        <p className="mt-1 text-lg sm:text-xl font-bold text-black">{formatWeight(lastScannedItem.weightKg)} <span className="text-xs sm:text-sm font-bold">Kg</span></p>
                      </div>
                    </div>
                    {lastScannedItem.targetProductCode ? (
                      <div className="border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-black text-amber-900">
                        สินค้าปลายทางเดิม: {lastScannedItem.targetProductCode} - {lastScannedItem.targetProductName || "-"}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              <div className="lg:col-span-4 p-6 sm:p-8 lg:p-10 flex flex-col justify-center gap-4 bg-white">
                <button
                  type="button"
                  onClick={handleOpenCamera}
                  className="flex items-center justify-center gap-2 h-14 border-2 border-[#102C57] text-[10px] font-black uppercase tracking-wider text-[#102C57] transition hover:bg-[var(--surface-navy,#102C57)] hover:text-white"
                >
                  <Camera size={16} />
                  สแกนด้วยกล้อง
                </button>
                <button
                  type="button"
                  onClick={handleOpenPicker}
                  className="flex items-center justify-center gap-2 h-14 border-2 border-[#d4af37] text-[10px] font-black uppercase tracking-wider text-[#102C57] transition hover:bg-[#fff8e1]"
                >
                  <ClipboardList size={16} />
                  ค้นหารายการเบิก
                </button>
              </div>
            </div>

            <div className="relative bg-[var(--surface-navy,#102C57)] px-4 sm:px-10 py-8 text-center lg:py-12">
              <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#d4af37_1px,transparent_1px)] [background-size:20px_20px]" />
              
              <div className="relative flex flex-col items-center justify-center">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.25em] border-2 shadow-sm ${getStatusTone(status.state)}`}>
                    <Activity size={14} />
                    <span>{status.message}</span>
                  </div>
                </div>

                <div className="w-full max-w-2xl">
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
                          handleSubmitBarcode();
                        }
                      }}
                      placeholder="ยิงบาร์โค้ดเพื่อยกเลิก..."
                      className="w-full bg-transparent px-6 text-2xl sm:text-3xl md:text-4xl font-mono font-bold text-white outline-none placeholder:text-white/20"
                    />
                    {isPending && (
                      <Loader2 size={32} className="animate-spin text-[#d4af37]" />
                    )}
                  </div>
                </div>

                <div className="mt-6 flex flex-col items-center justify-center py-4">
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">
                    ระบบจะค้นหาและยกเลิกรายการเบิกให้อัตโนมัติทันที
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-white border border-[#e2e8f0] shadow-sm">
            <div className="px-8 py-6 border-b border-[#e2e8f0] flex items-center justify-between bg-[#fbfcfd]">
              <div className="flex items-center gap-6">
                <h3 className="text-xs font-black uppercase tracking-[0.25em] text-[#102C57]">รายการที่เพิ่งยกเลิก (ล่าสุด 20 รายการ)</h3>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-[#d7dde5]">
                <thead>
                  <tr className="bg-[#f8fafc] text-sm font-black uppercase tracking-wider text-black">
                    <th className="border border-[#d7dde5] px-4 py-4 text-center w-16">#</th>
                    <th className="border border-[#d7dde5] px-6 py-4 text-center">บาร์โค้ด</th>
                    <th className="border border-[#d7dde5] px-6 py-4 text-center">สินค้า</th>
                    <th className="border border-[#d7dde5] px-6 py-4 text-center">สินค้าปลายทางเดิม</th>
                    <th className="border border-[#d7dde5] px-6 py-4 text-center">ล็อต</th>
                    <th className="border border-[#d7dde5] px-4 py-4 text-center w-24">จำนวน</th>
                    <th className="border border-[#d7dde5] px-6 py-4 text-center">น้ำหนัก</th>
                    <th className="border border-[#d7dde5] px-6 py-4 text-center">เวลายกเลิก</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-bold text-black">
                  {recentCancelations.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="border border-[#d7dde5] px-8 py-16 text-center uppercase tracking-widest text-[#a0aec0]">ยังไม่มีรายการยกเลิกในรอบนี้</td>
                    </tr>
                  ) : (
                    recentCancelations.map((row, index) => (
                      <tr key={`${row.issueItemId}-${index}`} className="group hover:bg-[#fbfcfd] transition-colors">
                        <td className="border border-[#d7dde5] px-4 py-4 text-center text-[#7d8795]">
                          {index + 1}
                        </td>
                        <td className="border border-[#d7dde5] px-6 py-4 font-mono text-center text-rose-600 line-through opacity-70">
                          {row.barcode}
                        </td>
                        <td className="border border-[#d7dde5] px-6 py-4 text-center whitespace-nowrap">
                          {row.productCode}-{row.productName}
                        </td>
                        <td className="border border-[#d7dde5] px-6 py-4 text-center whitespace-nowrap">
                          {row.targetProductCode ? `${row.targetProductCode}-${row.targetProductName}` : "ไม่ระบุ"}
                        </td>
                        <td className="border border-[#d7dde5] px-6 py-4 text-center">{row.lotNo}</td>
                        <td className="border border-[#d7dde5] px-4 py-4 text-center">{formatQuantity(row.quantity)}</td>
                        <td className="border border-[#d7dde5] px-6 py-4 text-center whitespace-nowrap">
                          {formatWeight(row.weightKg)} Kg
                        </td>
                        <td className="border border-[#d7dde5] px-6 py-4 text-center">{formatDateTime(row.canceledAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      {isCameraOpen ? (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-[var(--surface-navy,#102C57)]/80 px-4 py-6 backdrop-blur-sm">
          <div className="relative w-full max-w-3xl border-2 border-[#d4af37] bg-white shadow-[0_24px_70px_rgba(8,17,29,0.35)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#d7dde5] bg-[var(--surface-navy,#102C57)] px-4 py-4 text-white sm:px-5">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#d4af37]">
                  Mobile Scanner
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-[0.02em] text-white sm:text-2xl">
                  สแกนบาร์โค้ด
                </h2>
              </div>

              <div className="flex items-center gap-2">
                {cameraDevices.length > 1 ? (
                  <button
                    type="button"
                    onClick={handleSwitchCamera}
                    className="inline-flex h-10 items-center justify-center gap-2 border border-[#d4af37] bg-white/10 px-3 text-sm font-black uppercase tracking-[0.12em] text-[#fff2c2] transition hover:bg-white/15"
                  >
                    <SwitchCamera size={16} />
                    สลับกล้อง
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => void handleCloseCamera()}
                  className="inline-flex h-10 w-10 items-center justify-center border border-white/15 bg-white/10 text-white transition hover:bg-white/15"
                  aria-label="ปิดกล้อง"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="bg-[#f8fafc] p-4 sm:p-5">
              <div className="overflow-hidden border-2 border-[#d4af37] bg-[var(--surface-navy,#102C57)]">
                <div
                  id={scannerRegionIdRef.current}
                  className="mx-auto aspect-[4/3] w-full max-w-[34rem] overflow-hidden bg-black"
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

      {isPickerOpen ? (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-[var(--surface-navy,#102C57)]/78 px-3 py-4 backdrop-blur-sm sm:px-4 sm:py-6">
          <div className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden border-2 border-[#d4af37] bg-white shadow-[0_24px_70px_rgba(8,17,29,0.35)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#d7dde5] bg-[var(--surface-navy,#102C57)] px-6 py-4 text-white">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#d4af37]">
                  ยกเลิกย้อนหลัง
                </p>
                <h2 className="mt-2 text-2xl font-light uppercase tracking-[0.04em]">
                  เลือกรายการที่เบิกแล้ว
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setIsPickerOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center border border-white/20 text-white transition hover:border-[#d4af37] hover:text-[#d4af37]"
                aria-label="ปิด"
              >
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto bg-[#f8fafc]">
              <div className="border-b border-[#d7dde5] bg-white px-4 py-4 sm:px-5">
                <div className="grid gap-4 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
                  <label className="block">
                    <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7d8795]">
                      วันที่เริ่มต้น
                    </span>
                    <div className="mt-2 flex h-12 items-center gap-3 border border-[#d7dde5] bg-[#fbfcfd] px-3">
                      <CalendarRange size={16} className="text-[#d4af37]" />
                      <input
                        type="date"
                        value={pickerFilters.dateFrom}
                        onChange={(event) =>
                          setPickerFilters((current) => ({
                            ...current,
                            dateFrom: event.target.value,
                            page: 1,
                          }))
                        }
                        className="w-full bg-transparent text-sm font-semibold text-[#102C57] outline-none"
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7d8795]">
                      วันที่สิ้นสุด
                    </span>
                    <div className="mt-2 flex h-12 items-center gap-3 border border-[#d7dde5] bg-[#fbfcfd] px-3">
                      <CalendarRange size={16} className="text-[#d4af37]" />
                      <input
                        type="date"
                        value={pickerFilters.dateTo}
                        onChange={(event) =>
                          setPickerFilters((current) => ({
                            ...current,
                            dateTo: event.target.value,
                            page: 1,
                          }))
                        }
                        className="w-full bg-transparent text-sm font-semibold text-[#102C57] outline-none"
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7d8795]">
                      ประเภทการเบิก
                    </span>
                    <select
                      value={pickerFilters.issueType}
                      onChange={(event) =>
                        setPickerFilters((current) => ({
                          ...current,
                          issueType: event.target.value,
                          page: 1,
                        }))
                      }
                      className="mt-2 h-12 w-full border border-[#d7dde5] bg-[#fbfcfd] px-3 text-sm font-semibold text-[#102C57] outline-none"
                    >
                      <option value="ALL">ทุกประเภท</option>
                      {issueTypes.map((issueType) => (
                        <option key={issueType.value} value={issueType.value}>
                          {issueType.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block">
                    <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7d8795]">
                      ค้นหาบาร์โค้ด
                    </span>
                    <div className="mt-2 flex h-12 items-center gap-3 border border-[#d7dde5] bg-[#fbfcfd] px-3">
                      <Search size={16} className="text-[#d4af37]" />
                      <input
                        type="text"
                        value={pickerFilters.barcode}
                        onChange={(event) =>
                          setPickerFilters((current) => ({
                            ...current,
                            barcode: event.target.value,
                            page: 1,
                          }))
                        }
                        placeholder="กรอกเลขบาร์โค้ด"
                        className="w-full bg-transparent text-sm font-semibold text-[#102C57] outline-none placeholder:text-[#9aa5b1]"
                      />
                    </div>
                  </label>

                  <div className="flex items-end gap-2">
                    <button
                      type="button"
                      onClick={handlePickerSearch}
                      disabled={isPending}
                      className="inline-flex h-12 flex-1 items-center justify-center gap-2 border border-[#d4af37] bg-[var(--surface-navy,#102C57)] px-4 text-sm font-black uppercase tracking-[0.12em] text-[#fff7df] transition hover:bg-[#173b67] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isPending ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Search size={16} />
                      )}
                      ค้นหา
                    </button>
                    <button
                      type="button"
                      onClick={handleResetPickerFilters}
                      className="inline-flex h-12 items-center justify-center border border-[#d7dde5] bg-white px-4 text-sm font-black uppercase tracking-[0.12em] text-[#102C57] transition hover:border-[#d4af37]"
                    >
                      ล้าง
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="relative" ref={productPickerRef}>
                    <button
                      type="button"
                      onClick={() => setIsProductPickerOpen((current) => !current)}
                      className="inline-flex h-11 min-w-[18rem] items-center justify-between gap-3 border border-[#d7dde5] bg-white px-4 text-sm font-semibold text-[#102C57] transition hover:border-[#d4af37]"
                    >
                      <span className="truncate">
                        {selectedProducts.length
                          ? `เลือกสินค้าแล้ว ${selectedProducts.length} รายการ`
                          : "เลือกสินค้า"}
                      </span>
                      <ChevronDown
                        size={16}
                        className={`transition-transform ${isProductPickerOpen ? "rotate-180" : ""}`}
                      />
                    </button>

                    {isProductPickerOpen ? (
                      <div className="absolute left-0 top-full z-30 mt-2 max-h-72 w-full overflow-auto border-2 border-[#d4af37] bg-white shadow-[0_16px_30px_rgba(16,44,87,0.12)]">
                        <div className="flex items-center justify-between border-b border-[#e8edf2] px-4 py-3">
                          <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7d8795]">
                            เลือกสินค้า
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setPickerFilters((current) => ({
                                ...current,
                                productCodes: [],
                                page: 1,
                              }))
                            }
                            className="text-[11px] font-black uppercase tracking-[0.14em] text-[#d4af37]"
                          >
                            ล้างทั้งหมด
                          </button>
                        </div>

                        {productOptions.length ? (
                          productOptions.map((product) => {
                            const checked = pickerFilters.productCodes.includes(product.code);
                            return (
                              <label
                                key={product.code}
                                className="flex cursor-pointer items-start gap-3 border-b border-[#f1f4f7] px-4 py-3 text-sm text-[#102C57] last:border-b-0 hover:bg-[#fffdf7]"
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleProductCode(product.code)}
                                  className="mt-0.5 h-4 w-4 border-[#d7dde5] text-[#102C57] focus:ring-[#d4af37]"
                                />
                                <span className="min-w-0">
                                  <span className="block font-semibold">{product.code}</span>
                                  <span className="mt-0.5 block text-xs text-[#6a7684]">
                                    {product.name}
                                  </span>
                                </span>
                              </label>
                            );
                          })
                        ) : (
                          <p className="px-4 py-6 text-sm text-[#7d8795]">
                            ไม่พบรายการสินค้า
                          </p>
                        )}
                      </div>
                    ) : null}
                  </div>

                  <div className="text-sm font-semibold text-[#546274]">
                    แสดงหน้า {pickerPagination.totalPages ? pickerPagination.page : 1} จาก{" "}
                    {pickerPagination.totalPages || 1} | รวม {pickerSummary.totalCount} รายการ
                  </div>
                </div>
              </div>

              <div className="hidden overflow-x-auto bg-white md:block">
                <table className="min-w-full border-collapse">
                  <thead className="bg-[#fffdf7]">
                    <tr className="border-b-2 border-[#d4af37] text-[13px] font-black uppercase tracking-[0.08em] text-[#111111]">
                      <th className="px-4 py-4 text-left">ประเภทการเบิก</th>
                      <th className="px-4 py-4 text-left font-mono">บาร์โค้ด</th>
                      <th className="px-4 py-4 text-left">สินค้า</th>
                      <th className="px-4 py-4 text-left">สินค้าปลายทาง</th>
                      <th className="px-4 py-4 text-left">LOT</th>
                      <th className="px-4 py-4 text-center">จำนวน</th>
                      <th className="px-4 py-4 text-right">น้ำหนัก</th>
                      <th className="px-4 py-4 text-left">เวลาที่เบิก</th>
                      <th className="px-4 py-4 text-right">การทำงาน</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white">
                    {pickerRows.length ? (
                      pickerRows.map((row) => (
                        <tr
                          key={row.issueItemId}
                          className="border-b border-[#e5ebf1] text-[14px] font-bold text-black transition hover:bg-[#fffdf7] last:border-b-0"
                        >
                          <td className="whitespace-nowrap px-4 py-4">
                            {getIssueTypeLabel(issueTypes, row.issueType)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 font-mono">{row.barcode}</td>
                          <td className="whitespace-nowrap px-4 py-4">
                            {row.productCode}-{row.productName}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4">
                            {row.targetProductCode
                              ? `${row.targetProductCode}-${row.targetProductName}`
                              : "ไม่ระบุ"}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4">{row.lotNo}</td>
                          <td className="whitespace-nowrap px-4 py-4 text-center">
                            {formatQuantity(row.quantity)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-right">
                            {formatWeight(row.weightKg)} Kg
                          </td>
                          <td className="whitespace-nowrap px-4 py-4">
                            {formatDateTime(row.issuedAt)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-4 text-right">
                            <button
                              type="button"
                              onClick={() => completeCancel(row)}
                              disabled={isPending && activeIssueItemId === row.issueItemId}
                              className="inline-flex h-10 items-center justify-center gap-2 border-2 border-rose-100 bg-rose-50 px-4 text-[11px] font-black uppercase tracking-[0.12em] text-rose-700 transition hover:border-rose-400 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isPending && activeIssueItemId === row.issueItemId ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : <RotateCcw size={14} />}
                              ยกเลิกเบิก
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={9} className="px-4 py-16 text-center text-sm font-black uppercase tracking-widest text-[#a0aec0]">
                          ไม่พบรายการที่เบิกตามเงื่อนไข
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t border-[#d7dde5] bg-white px-4 py-4 sm:px-5">
                <p className="text-sm font-semibold text-[#546274]">
                  แสดงครั้งละ {PAGE_LIMIT} รายการ
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePickerPageChange(pickerPagination.page - 1)}
                    disabled={isPending || pickerPagination.page <= 1}
                    className="inline-flex h-10 items-center justify-center border border-[#d7dde5] bg-white px-4 text-[11px] font-black uppercase tracking-[0.14em] text-[#102C57] transition hover:border-[#d4af37] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    ก่อนหน้า
                  </button>
                  <button
                    type="button"
                    onClick={() => handlePickerPageChange(pickerPagination.page + 1)}
                    disabled={
                      isPending
                      || !pickerPagination.totalPages
                      || pickerPagination.page >= pickerPagination.totalPages
                    }
                    className="inline-flex h-10 items-center justify-center border border-[#102C57] bg-[var(--surface-navy,#102C57)] px-4 text-[11px] font-black uppercase tracking-[0.14em] text-white transition hover:bg-[#173b67] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    ถัดไป
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {toast ? (
        <div className="pointer-events-none fixed right-4 top-24 z-[230] w-[min(24rem,calc(100vw-2rem))]">
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
