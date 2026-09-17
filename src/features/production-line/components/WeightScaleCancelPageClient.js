"use client";

import { Html5Qrcode } from "html5-qrcode";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  CalendarRange,
  Camera,
  ChevronDown,
  Loader2,
  PackageSearch,
  RefreshCw,
  ScanSearch,
  Search,
  SwitchCamera,
  X,
} from "lucide-react";
import WeightScalePrimaryHeader from "@/features/production-line/components/WeightScalePrimaryHeader";
import {
  cancelScaleReceiptRequest,
  fetchCancelableScaleReceipts,
} from "@/features/production-line/services/scaleClient";

const PAGE_LIMIT = 50;

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

function normalizeRows(rows) {
  if (!Array.isArray(rows)) {
    return [];
  }

  return rows
    .map((row) => {
      const receiptId = String(row?.id || "").trim();
      if (!receiptId) {
        return null;
      }

      return {
        receiptId,
        barcode: String(row?.barcode || "").trim() || "-",
        productCode: String(row?.productCode || "").trim().toUpperCase() || "-",
        productName: String(row?.productName || "").trim() || "-",
        lotNo: String(row?.lotNo || "").trim() || "-",
        netWeightKg: Number(row?.netWeightKg || 0),
        weighedAt: row?.weighedAt || null,
      };
    })
    .filter(Boolean);
}

function normalizeSummary(summary) {
  return {
    totalCount: Number(summary?.totalCount || 0),
    totalNetWeightKg: Number(summary?.totalNetWeightKg || 0),
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
    barcode: String(filters?.barcode || "").trim(),
    productCodes: Array.isArray(filters?.productCodes)
      ? Array.from(
          new Set(
            filters.productCodes
              .map((value) => String(value || "").trim().toUpperCase())
              .filter(Boolean)
          )
        )
      : [],
    page: Number(filters?.page || 1),
    limit: PAGE_LIMIT,
  };
}

function normalizeBarcodeInput(value) {
  return String(value || "")
    .replace(/[\s\u200B-\u200D\uFEFF]/g, "")
    .trim();
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

function buildCancelableFilters(nextFilters, departmentId) {
  return {
    departmentId: departmentId || undefined,
    dateFrom: nextFilters.dateFrom || undefined,
    dateTo: nextFilters.dateTo || undefined,
    barcode: nextFilters.barcode || undefined,
    productCodes: nextFilters.productCodes,
    page: nextFilters.page,
    limit: PAGE_LIMIT,
  };
}

function buildPickerSummaryLabel(summary) {
  return `${summary.totalCount} รายการ`;
}

export default function WeightScaleCancelPageClient({
  scope,
  todayReceiptDate,
  initialRows,
  initialSummary,
  initialFilters,
  initialPagination,
}) {
  const barcodeInputRef = useRef(null);
  const productPickerRef = useRef(null);
  const scannerRegionIdRef = useRef(`weight-cancel-camera-${Math.random().toString(16).slice(2)}`);
  const cameraScannerRef = useRef(null);
  const isSubmittingRef = useRef(false);

  const [barcode, setBarcode] = useState("");
  const [feedback, setFeedback] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [toast, setToast] = useState(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [pickerRows, setPickerRows] = useState(() => normalizeRows(initialRows));
  const [pickerSummary, setPickerSummary] = useState(() => normalizeSummary(initialSummary));
  const [pickerFilters, setPickerFilters] = useState(() =>
    normalizeFilters(initialFilters, todayReceiptDate)
  );
  const [pickerPagination, setPickerPagination] = useState(() =>
    normalizePagination(initialPagination)
  );
  const [pickerFeedback, setPickerFeedback] = useState("");
  const [pickerErrorMessage, setPickerErrorMessage] = useState("");
  const [activeReceiptId, setActiveReceiptId] = useState("");
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isStartingCamera, setIsStartingCamera] = useState(false);
  const [cameraDevices, setCameraDevices] = useState([]);
  const [currentCameraId, setCurrentCameraId] = useState(null);
  const [isPending, startTransition] = useTransition();

  const [activeTab, setActiveTab] = useState("cancelable");
  const [voidedRows, setVoidedRows] = useState([]);
  const [voidedSummary, setVoidedSummary] = useState({ totalCount: 0, totalNetWeightKg: 0 });
  const [isLoadingVoided, setIsLoadingVoided] = useState(false);
  const [voidedErrorMessage, setVoidedErrorMessage] = useState("");
  const [sessionCancelledRows, setSessionCancelledRows] = useState([]);

  const productOptions = useMemo(
    () => normalizeProductOptions(scope?.products),
    [scope?.products]
  );

  const selectedProducts = useMemo(
    () => productOptions.filter((product) => pickerFilters.productCodes.includes(product.code)),
    [pickerFilters.productCodes, productOptions]
  );

  const productSummaryLabel = useMemo(() => {
    if (!selectedProducts.length) {
      return "ทุกสินค้า";
    }

    if (selectedProducts.length === 1) {
      return `${selectedProducts[0].code} - ${selectedProducts[0].name}`;
    }

    return `เลือกแล้ว ${selectedProducts.length} รายการ`;
  }, [selectedProducts]);

  useEffect(() => {
    barcodeInputRef.current?.focus();
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
    setPickerRows(normalizeRows(payload?.receipts));
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
          const payload = await fetchCancelableScaleReceipts(
            buildCancelableFilters(requestFilters, scope?.departmentId)
          );

          applyPickerPayload(payload);
          setPickerFilters({
            ...normalizeFilters(payload?.filters, todayReceiptDate),
            page: payload?.pagination?.page || requestFilters.page,
            limit: PAGE_LIMIT,
          });
          setPickerFeedback("อัปเดตรายการชั่งที่ยกเลิกได้เรียบร้อย");
          setPickerErrorMessage("");
        } catch (error) {
          setPickerErrorMessage(error?.message || "ไม่สามารถโหลดรายการชั่งที่ยกเลิกได้");
          setPickerFeedback("");
        }
      });
    },
    [applyPickerPayload, scope?.departmentId, startTransition, todayReceiptDate]
  );

  const mergeSessionVoidedRows = useCallback(
    (fetchedRows) => {
      let result = [...fetchedRows];
      sessionCancelledRows.forEach((sessionRow) => {
        if (!result.some((r) => r.receiptId === sessionRow.receiptId)) {
          result.unshift(sessionRow);
        }
      });
      return result;
    },
    [sessionCancelledRows]
  );

  const loadVoidedRows = useCallback(
    (page = 1) => {
      setIsLoadingVoided(true);
      setVoidedErrorMessage("");
      startTransition(async () => {
        try {
          const payload = await fetchCancelableScaleReceipts({
            departmentId: scope?.departmentId,
            status: "voided",
            page,
            limit: PAGE_LIMIT,
          });

          const normalized = normalizeRows(payload?.receipts);
          const merged = mergeSessionVoidedRows(normalized);
          setVoidedRows(merged);

          const extraRows = sessionCancelledRows.filter(
            (sr) => !normalized.some((nr) => nr.receiptId === sr.receiptId)
          );
          const extraWeight = extraRows.reduce((sum, r) => sum + r.netWeightKg, 0);

          setVoidedSummary({
            totalCount: Number(payload?.summary?.totalCount || 0) + extraRows.length,
            totalNetWeightKg: Number((Number(payload?.summary?.totalNetWeightKg || 0) + extraWeight).toFixed(3)),
          });
        } catch (error) {
          setVoidedErrorMessage(error?.message || "ไม่สามารถโหลดรายการชั่งที่ยกเลิกแล้วได้");
        } finally {
          setIsLoadingVoided(false);
        }
      });
    },
    [scope?.departmentId, mergeSessionVoidedRows, sessionCancelledRows]
  );

  const completeCancel = useCallback(
    (row, successPrefix = "ยกเลิกชั่ง") => {
      if (!row?.receiptId) {
        return;
      }

      setActiveReceiptId(row.receiptId);
      setFeedback("");
      setErrorMessage("");
      setPickerFeedback("");
      setPickerErrorMessage("");

      startTransition(async () => {
        try {
          await cancelScaleReceiptRequest(row.receiptId, {
            voidReason: "ยกเลิกจากหน้ายกเลิกชั่งผลิตภัณฑ์",
          });

          const refreshPayload = await fetchCancelableScaleReceipts(
            buildCancelableFilters(
              {
                ...pickerFilters,
                page: pickerPagination.page,
                limit: PAGE_LIMIT,
              },
              scope?.departmentId
            )
          );

          applyPickerPayload(refreshPayload);
          setPickerFilters({
            ...normalizeFilters(refreshPayload?.filters, todayReceiptDate),
            page: refreshPayload?.pagination?.page || 1,
            limit: PAGE_LIMIT,
          });

          const cancelledRow = {
            receiptId: row.receiptId,
            barcode: row.barcode,
            productCode: row.productCode,
            productName: row.productName,
            lotNo: row.lotNo,
            netWeightKg: row.netWeightKg,
            weighedAt: row.weighedAt,
          };

          setSessionCancelledRows((prev) => {
            if (prev.some((r) => r.receiptId === cancelledRow.receiptId)) {
              return prev;
            }
            return [cancelledRow, ...prev];
          });

          const voidedPayload = await fetchCancelableScaleReceipts({
            departmentId: scope?.departmentId,
            status: "voided",
            page: 1,
            limit: PAGE_LIMIT,
          });

          const normalized = normalizeRows(voidedPayload?.receipts);
          const updatedSession = [
            cancelledRow,
            ...sessionCancelledRows.filter((r) => r.receiptId !== cancelledRow.receiptId),
          ];

          let merged = [...normalized];
          updatedSession.forEach((sessionRow) => {
            if (!merged.some((r) => r.receiptId === sessionRow.receiptId)) {
              merged.unshift(sessionRow);
            }
          });

          setVoidedRows(merged);

          const extraRows = updatedSession.filter(
            (sr) => !normalized.some((nr) => nr.receiptId === sr.receiptId)
          );
          const extraWeight = extraRows.reduce((sum, r) => sum + r.netWeightKg, 0);

          setVoidedSummary({
            totalCount: Number(voidedPayload?.summary?.totalCount || 0) + extraRows.length,
            totalNetWeightKg: Number((Number(voidedPayload?.summary?.totalNetWeightKg || 0) + extraWeight).toFixed(3)),
          });

          const successMessage = `${successPrefix}บาร์โค้ด ${row.barcode} เรียบร้อยแล้ว`;
          setFeedback(successMessage);
          setToast({
            tone: "success",
            message: successMessage,
          });
          setBarcode("");
          setActiveReceiptId("");
          barcodeInputRef.current?.focus();
        } catch (error) {
          const message = error?.message || "ไม่สามารถยกเลิกชั่งได้";
          setErrorMessage(message);
          setPickerErrorMessage(message);
          setToast({
            tone: "error",
            message,
          });
          setActiveReceiptId("");
        }
      });
    },
    [
      applyPickerPayload,
      pickerFilters,
      pickerPagination.page,
      scope?.departmentId,
      startTransition,
      todayReceiptDate,
      sessionCancelledRows,
    ]
  );

  useEffect(() => {
    if (activeTab === "voided") {
      loadVoidedRows(1);
    }
  }, [activeTab, loadVoidedRows]);

  useEffect(() => {
    startTransition(async () => {
      try {
        const payload = await fetchCancelableScaleReceipts({
          departmentId: scope?.departmentId,
          status: "voided",
          page: 1,
          limit: 1,
        });

        setVoidedSummary({
          totalCount: Number(payload?.summary?.totalCount || 0),
          totalNetWeightKg: Number(payload?.summary?.totalNetWeightKg || 0),
        });
      } catch (error) {
        console.error("Unable to load initial voided summary:", error);
      }
    });
  }, [scope?.departmentId]);

  const resolveBarcodeForCancel = useCallback(
    (nextBarcode, sourceLabel = "ยกเลิกชั่ง") => {
      const normalizedBarcode = normalizeBarcodeInput(nextBarcode);
      if (!normalizedBarcode) {
        setErrorMessage("กรุณากรอกหรือสแกนรหัสบาร์โค้ดก่อน");
        setFeedback("");
        barcodeInputRef.current?.focus();
        return;
      }

      setFeedback("");
      setErrorMessage("");

      startTransition(async () => {
        try {
          const lookupFilters = normalizeFilters(pickerFilters, todayReceiptDate);
          const payload = await fetchCancelableScaleReceipts({
            departmentId: scope?.departmentId,
            dateFrom: lookupFilters.dateFrom,
            dateTo: lookupFilters.dateTo,
            barcode: normalizedBarcode,
            productCodes: lookupFilters.productCodes,
            page: 1,
            limit: PAGE_LIMIT,
          });

          const matchedRows = normalizeRows(payload?.receipts);
          if (!matchedRows.length) {
            throw new Error(`ไม่พบบาร์โค้ด ${normalizedBarcode} ที่พร้อมยกเลิกชั่ง`);
          }

          if (matchedRows.length === 1) {
            completeCancel(matchedRows[0], sourceLabel);
            return;
          }

          applyPickerPayload(payload);
          setPickerFilters({
            ...normalizeFilters(payload?.filters, todayReceiptDate),
            barcode: normalizedBarcode,
            page: payload?.pagination?.page || 1,
            limit: PAGE_LIMIT,
          });
          setIsPickerOpen(true);
          setPickerFeedback(
            `พบบาร์โค้ด ${normalizedBarcode} มากกว่า 1 รายการ กรุณาเลือกรายการที่ต้องการยกเลิก`
          );
          setPickerErrorMessage("");
        } catch (error) {
          const message = error?.message || "ไม่สามารถค้นหารายการชั่งจากบาร์โค้ดได้";
          setErrorMessage(message);
          setFeedback("");
          setToast({
            tone: "error",
            message,
          });
        }
      });
    },
    [
      applyPickerPayload,
      completeCancel,
      pickerFilters,
      scope?.departmentId,
      startTransition,
      todayReceiptDate,
    ]
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
      console.error("Unable to stop weight cancel camera scanner:", error);
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
      console.error("Unable to load weight cancel cameras:", error);
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

            const normalizedBarcode = normalizeBarcodeInput(decodedText);
            if (!normalizedBarcode) {
              return;
            }

            setBarcode(normalizedBarcode);
            resolveBarcodeForCancel(normalizedBarcode, "ยกเลิกชั่งด้วยกล้อง");
          },
          () => {}
        );
      } catch (error) {
        console.error("Unable to start weight cancel camera scanner:", error);
        const message = "ไม่สามารถเปิดกล้องสแกนบาร์โค้ดได้";
        setErrorMessage(message);
        setToast({
          tone: "error",
          message,
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

  const handleOpenPicker = useCallback(() => {
    setIsPickerOpen(true);
  }, []);

  const handleSubmitBarcode = useCallback((nextBarcode = barcode) => {
    resolveBarcodeForCancel(nextBarcode, "ยกเลิกชั่ง");
  }, [barcode, resolveBarcodeForCancel]);

  const handleResetPickerFilters = useCallback(() => {
    const nextFilters = {
      dateFrom: todayReceiptDate,
      dateTo: todayReceiptDate,
      barcode: "",
      productCodes: [],
      page: 1,
      limit: PAGE_LIMIT,
    };

    setPickerFilters(nextFilters);
    loadPickerRows(nextFilters);
    setIsProductPickerOpen(false);
  }, [loadPickerRows, todayReceiptDate]);

  const handlePickerSearch = useCallback(() => {
    loadPickerRows({
      ...pickerFilters,
      page: 1,
      limit: PAGE_LIMIT,
    });
  }, [loadPickerRows, pickerFilters]);

  const handlePickerDateChange = useCallback(
    (field, value) => {
      const nextFilters = {
        ...pickerFilters,
        [field]: value,
        page: 1,
        limit: PAGE_LIMIT,
      };

      setPickerFilters(nextFilters);
      loadPickerRows(nextFilters);
    },
    [loadPickerRows, pickerFilters]
  );

  const handlePickerPageChange = useCallback(
    (nextPage) => {
      const nextFilters = {
        ...pickerFilters,
        page: Math.max(1, nextPage),
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
        eyebrow="ยกเลิกชั่ง"
        badge="พร้อมใช้งาน"
        title="ยกเลิกชั่งผลิตภัณฑ์"
      />

      {isCameraOpen ? (
        <div className="fixed inset-0 z-[220] flex items-center justify-center bg-[#102C57]/80 px-4 py-6 backdrop-blur-sm">
          <div className="relative flex w-full max-w-3xl flex-col overflow-hidden border border-[#d9c27a] bg-white shadow-[0_24px_70px_rgba(8,17,29,0.35)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#d7dde5] bg-[#102C57] px-4 py-4 text-white sm:px-5">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#d4af37]">
                  Camera Scanner
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-[0.02em] text-white sm:text-2xl">
                  สแกนบาร์โค้ดเพื่อยกเลิกชั่ง
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
                  aria-label="ปิดหน้าต่างสแกนกล้อง"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="bg-[#f8fafc] p-4 sm:p-5">
              <div className="overflow-hidden border border-[#d9c27a] bg-[#102C57]">
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
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {isPickerOpen ? (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-[#102C57]/78 px-3 py-4 backdrop-blur-sm sm:px-4 sm:py-6">
          <div className="flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden border border-[#d9c27a] bg-white shadow-[0_24px_70px_rgba(8,17,29,0.35)]">
            <div className="flex items-start justify-between gap-4 border-b border-[#d7dde5] bg-[#102C57] px-4 py-4 text-white sm:px-5">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#d4af37]">
                  เลือกรายการย้อนหลัง
                </p>
                <h2 className="mt-1 text-xl font-semibold tracking-[0.02em] text-white sm:text-2xl">
                  เลือกรายการชั่งที่ต้องการยกเลิก
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setIsPickerOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center border border-white/15 bg-white/10 text-white transition hover:bg-white/15"
                aria-label="ปิดหน้าต่างเลือกรายการชั่ง"
              >
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto bg-[#f8fafc]">
              <div className="border-b border-[#d7dde5] bg-white px-4 py-4 sm:px-5">
                <div className="grid gap-4 lg:grid-cols-[repeat(3,minmax(0,1fr))_auto]">
                  <label className="block">
                    <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7d8795]">
                      จากวันที่
                    </span>
                    <div className="mt-2 flex h-12 items-center gap-3 border border-[#d7dde5] bg-[#fbfcfd] px-3">
                      <CalendarRange size={16} className="text-[#7f5d00]" />
                      <input
                        type="date"
                        value={pickerFilters.dateFrom}
                        onChange={(event) => handlePickerDateChange("dateFrom", event.target.value)}
                        className="w-full bg-transparent text-sm font-semibold text-[#102C57] outline-none"
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7d8795]">
                      ถึงวันที่
                    </span>
                    <div className="mt-2 flex h-12 items-center gap-3 border border-[#d7dde5] bg-[#fbfcfd] px-3">
                      <CalendarRange size={16} className="text-[#7f5d00]" />
                      <input
                        type="date"
                        value={pickerFilters.dateTo}
                        onChange={(event) => handlePickerDateChange("dateTo", event.target.value)}
                        className="w-full bg-transparent text-sm font-semibold text-[#102C57] outline-none"
                      />
                    </div>
                  </label>

                  <label className="block">
                    <span className="text-[11px] font-black uppercase tracking-[0.16em] text-[#7d8795]">
                      ค้นหาบาร์โค้ด
                    </span>
                    <div className="mt-2 flex h-12 items-center gap-3 border border-[#d7dde5] bg-[#fbfcfd] px-3">
                      <Search size={16} className="text-[#7f5d00]" />
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
                      className="inline-flex h-12 flex-1 items-center justify-center gap-2 border border-[#d4af37] bg-[#102C57] px-4 text-sm font-black uppercase tracking-[0.12em] text-[#fff7df] transition hover:bg-[#173b67] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isPending ? (
                        <RefreshCw size={16} className="animate-spin" />
                      ) : (
                        <Search size={16} />
                      )}
                      ค้นหา
                    </button>
                    <button
                      type="button"
                      onClick={handleResetPickerFilters}
                      className="inline-flex h-12 items-center justify-center border border-[#d7dde5] bg-white px-4 text-sm font-black uppercase tracking-[0.12em] text-[#102C57] transition hover:border-[#d4af37] hover:text-[#7f5d00]"
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
                      <span className="truncate">{productSummaryLabel}</span>
                      <ChevronDown
                        size={16}
                        className={`transition-transform ${isProductPickerOpen ? "rotate-180" : ""}`}
                      />
                    </button>

                    {isProductPickerOpen ? (
                      <div className="absolute left-0 top-full z-30 mt-2 max-h-72 w-full overflow-auto border border-[#d9c27a] bg-white shadow-[0_16px_30px_rgba(16,44,87,0.12)]">
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
                            className="text-[11px] font-black uppercase tracking-[0.14em] text-[#7f5d00]"
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
                          <p className="px-4 py-6 text-sm text-[#7d8795]">ไม่พบรายการสินค้า</p>
                        )}
                      </div>
                    ) : null}
                  </div>

                  <div className="text-sm font-semibold text-[#546274]">
                    หน้า {pickerPagination.totalPages ? pickerPagination.page : 1} จาก{" "}
                    {pickerPagination.totalPages || 1} | รวม {buildPickerSummaryLabel(pickerSummary)}
                  </div>
                </div>

                {pickerFeedback ? (
                  <p className="mt-3 text-sm font-semibold text-emerald-700">{pickerFeedback}</p>
                ) : null}
                {pickerErrorMessage ? (
                  <p className="mt-3 text-sm font-semibold text-rose-600">{pickerErrorMessage}</p>
                ) : null}
              </div>

              <div className="md:hidden">
                {pickerRows.length ? (
                  <div className="divide-y divide-[#e5ebf1] bg-white">
                    {pickerRows.map((row) => (
                      <article key={row.receiptId} className="space-y-3 px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#7f5d00]">
                              พร้อมยกเลิก
                            </p>
                            <p className="mt-1 truncate font-mono text-[13px] font-semibold text-[#102C57]">
                              {row.barcode}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => completeCancel(row)}
                            disabled={isPending && activeReceiptId === row.receiptId}
                            className="inline-flex h-9 shrink-0 items-center justify-center gap-2 border border-rose-200 bg-rose-50 px-3 text-[10px] font-black uppercase tracking-[0.1em] text-rose-700 transition hover:border-rose-400 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isPending && activeReceiptId === row.receiptId ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : null}
                            ยกเลิก
                          </button>
                        </div>

                        <p className="text-[13px] font-semibold leading-5 text-[#111111]">
                          {row.productCode} - {row.productName}
                        </p>

                        <div className="grid grid-cols-2 gap-3 text-[12px]">
                          <div>
                            <p className="font-black uppercase tracking-[0.08em] text-[#7d8795]">
                              LOT
                            </p>
                            <p className="mt-1 font-semibold text-[#111111]">{row.lotNo}</p>
                          </div>
                          <div>
                            <p className="font-black uppercase tracking-[0.08em] text-[#7d8795]">
                              น้ำหนัก
                            </p>
                            <p className="mt-1 font-semibold text-[#111111]">
                              {formatWeight(row.netWeightKg)} กก.
                            </p>
                          </div>
                        </div>

                        <p className="text-[12px] font-semibold text-[#111111]">
                          เวลา {formatDateTime(row.weighedAt)}
                        </p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="bg-white px-4 py-10 text-center text-sm text-[#546274]">
                    ยังไม่พบรายการชั่งที่ยกเลิกได้ตามเงื่อนไขที่เลือก
                  </div>
                )}
              </div>

              <div className="hidden overflow-x-auto bg-white md:block">
                <table className="min-w-full border-collapse">
                  <thead className="bg-[#fffdf7]">
                    <tr className="border-b border-[#e2d4a7] text-[13px] font-black uppercase tracking-[0.08em] text-[#111111]">
                      <th className="px-4 py-3 text-left">บาร์โค้ด</th>
                      <th className="px-4 py-3 text-left">สินค้า</th>
                      <th className="px-4 py-3 text-left">LOT</th>
                      <th className="px-4 py-3 text-right">น้ำหนัก</th>
                      <th className="px-4 py-3 text-left">เวลา</th>
                      <th className="px-4 py-3 text-right">การทำงาน</th>
                    </tr>
                  </thead>
                  <tbody className="bg-[#fbfcfd]">
                    {pickerRows.length ? (
                      pickerRows.map((row) => (
                        <tr
                          key={row.receiptId}
                          className="border-b border-[#e5ebf1] text-[13px] font-semibold text-[#111111] transition hover:bg-[#fffdf7] last:border-b-0"
                        >
                          <td className="whitespace-nowrap px-4 py-3 font-mono">{row.barcode}</td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {row.productCode} - {row.productName}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">{row.lotNo}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            {formatWeight(row.netWeightKg)} กก.
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {formatDateTime(row.weighedAt)}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => completeCancel(row)}
                              disabled={isPending && activeReceiptId === row.receiptId}
                              className="inline-flex h-9 items-center justify-center gap-2 border border-rose-200 bg-rose-50 px-3 text-[11px] font-black uppercase tracking-[0.12em] text-rose-700 transition hover:border-rose-400 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isPending && activeReceiptId === row.receiptId ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : null}
                              ยกเลิกชั่ง
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-[#546274]">
                          ยังไม่พบรายการชั่งที่ยกเลิกได้ตามเงื่อนไขที่เลือก
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between border-t border-[#d7dde5] bg-white px-4 py-4 sm:px-5">
                <p className="text-sm font-semibold text-[#546274]">
                  น้ำหนักรวม {formatWeight(pickerSummary.totalNetWeightKg)} กก.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handlePickerPageChange(pickerPagination.page - 1)}
                    disabled={isPending || pickerPagination.page <= 1}
                    className="inline-flex h-10 items-center justify-center border border-[#d7dde5] bg-white px-4 text-[11px] font-black uppercase tracking-[0.14em] text-[#102C57] transition hover:border-[#d4af37] hover:text-[#7f5d00] disabled:cursor-not-allowed disabled:opacity-50"
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
                    className="inline-flex h-10 items-center justify-center border border-[#102C57] bg-[#102C57] px-4 text-[11px] font-black uppercase tracking-[0.14em] text-white transition hover:bg-[#173b67] disabled:cursor-not-allowed disabled:opacity-50"
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
        <div className="fixed left-1/2 top-5 z-[230] -translate-x-1/2 px-4">
          <div
            className={`min-w-[18rem] border px-4 py-3 text-sm font-semibold shadow-lg ${
              toast.tone === "success"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {toast.message}
          </div>
        </div>
      ) : null}

      <section className="border-b border-[#1f3047] bg-[#08111d] text-white">
        <div className="mx-auto max-w-[84rem] px-4 pb-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between border-t border-white/10 pt-4">
            <div className="inline-flex items-center gap-2 border border-[#d4af37]/35 bg-white/[0.03] px-4 py-2 text-xs font-black uppercase tracking-[0.18em] text-[#fff7df]">
              <ScanSearch size={14} />
              พร้อมยกเลิกชั่ง
            </div>

            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">
              {scope?.departmentCode || "KP13"} / หมวด {scope?.categoryCode || "03"}
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[88rem] px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8">
          <section className="relative overflow-hidden border-2 border-[#d4af37] bg-white shadow-[0_30px_60px_rgba(0,0,0,0.16)]">
            <div className="grid border-b-2 border-[#d4af37]/30 bg-[#fbfcfd] lg:grid-cols-12">
              <div className="border-b border-[#e2e8f0] p-6 sm:p-8 lg:col-span-8 lg:border-b-0 lg:border-r lg:p-10">
                <div className="flex flex-col gap-6">
                  <div className="flex items-center gap-4">
                    <div className="flex h-16 w-16 shrink-0 items-center justify-center border border-[#d4af37]/35 bg-[#fff8df]">
                      <ScanSearch size={36} strokeWidth={1.8} className="text-[#7f5d00]" aria-hidden="true" />
                    </div>

                    <div className="min-w-0">
                      <span className="text-[10px] font-black uppercase tracking-[0.28em] text-[#d4af37]">
                        Cancel Station
                      </span>
                      <h2 className="mt-2 text-2xl font-medium leading-tight text-[#102C57] sm:text-3xl">
                        สแกนบาร์โค้ดเพื่อยกเลิกชั่ง
                      </h2>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4 border-t border-[#e2e8f0] pt-6 md:grid-cols-4 md:gap-8">
                    <div className="text-center">
                      <p className="text-[10px] font-black uppercase tracking-widest text-black">
                        หน่วยงาน
                      </p>
                      <p className="mt-1 text-base font-bold text-black sm:text-xl">
                        {scope?.departmentName || "แผนกบิสกิต"}
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] font-black uppercase tracking-widest text-black">
                        รายการที่ยกเลิกได้
                      </p>
                      <p className="mt-1 text-base font-bold text-black sm:text-xl">
                        {pickerSummary.totalCount} รายการ
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] font-black uppercase tracking-widest text-black">
                        น้ำหนักรวม
                      </p>
                      <p className="mt-1 text-base font-bold text-black sm:text-xl">
                        {formatWeight(pickerSummary.totalNetWeightKg)} <span className="text-sm">กก.</span>
                      </p>
                    </div>
                    <div className="text-center">
                      <p className="text-[10px] font-black uppercase tracking-widest text-black">
                        วันที่อ้างอิง
                      </p>
                      <p className="mt-1 text-base font-bold text-black sm:text-xl">{todayReceiptDate || "-"}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col justify-center gap-4 bg-white p-6 sm:p-8 lg:col-span-4 lg:p-10">
                <button
                  type="button"
                  onClick={() => void handleOpenCamera()}
                  className="flex items-center justify-center gap-2 border-2 border-[#102C57] px-4 py-4 text-[11px] font-black uppercase tracking-[0.18em] text-[#102C57] transition hover:bg-[#102C57] hover:text-white"
                >
                  <Camera size={16} />
                  สแกนด้วยกล้อง
                </button>
                <button
                  type="button"
                  onClick={handleOpenPicker}
                  className="flex items-center justify-center gap-2 border-2 border-[#d7dde5] px-4 py-4 text-[11px] font-black uppercase tracking-[0.18em] text-[#102C57] transition hover:border-[#d4af37] hover:bg-[#fffdf7]"
                >
                  <PackageSearch size={16} />
                  เปิดรายการย้อนหลัง
                </button>
              </div>
            </div>

            <div className="bg-[#102C57] px-4 py-8 text-center sm:px-10 lg:py-10">
              <div className="mx-auto max-w-4xl">
                <div className="flex items-center justify-center gap-3">
                  <div className="flex items-center gap-2 border-2 border-[#d4af37]/35 px-4 py-2 text-[10px] font-black uppercase tracking-[0.24em] text-[#f3d67a]">
                    <ScanSearch size={16} />
                    ยิงบาร์โค้ดหรือพิมพ์รหัส
                  </div>
                </div>

                <div className="mt-6 flex h-16 items-center gap-3 border-2 border-[#d4af37]/35 bg-white px-4 sm:px-5">
                  <ScanSearch size={20} className="shrink-0 text-[#7f5d00]" />
                  <input
                    ref={barcodeInputRef}
                    value={barcode}
                    onChange={(event) => setBarcode(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        handleSubmitBarcode(event.currentTarget.value);
                      }
                    }}
                    placeholder="สแกนหรือกรอกรหัสบาร์โค้ด"
                    className="w-full bg-transparent text-base font-semibold text-[#111111] outline-none placeholder:text-[#9aa5b1] sm:text-lg"
                  />
                </div>

                {feedback ? (
                  <p className="mt-4 text-sm font-semibold text-emerald-300">{feedback}</p>
                ) : null}
                {errorMessage ? (
                  <p className="mt-4 text-sm font-semibold text-rose-300">{errorMessage}</p>
                ) : null}
              </div>
            </div>
          </section>

          <section className="border border-[#c9d3df] border-t-2 border-t-[#d4af37] bg-white shadow-[0_18px_40px_rgba(16,44,87,0.06)]">
            <div className="border-b border-[#d7dde5] bg-[#fbfcfd] px-4 py-4 sm:px-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#7d8795]">
                    รายการล่าสุดของวันนี้ ({todayReceiptDate})
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveTab("cancelable")}
                      className={`inline-flex h-10 items-center gap-2 border px-4 text-xs font-black uppercase tracking-[0.12em] transition ${
                        activeTab === "cancelable"
                          ? "border-[#d4af37] bg-[#102C57] text-[#fff7df]"
                          : "border-[#d7dde5] bg-white text-[#102C57] hover:border-[#d4af37]"
                      }`}
                    >
                      <ScanSearch size={14} />
                      รายการที่ยังยกเลิกได้ ({pickerSummary.totalCount})
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveTab("voided")}
                      className={`inline-flex h-10 items-center gap-2 border px-4 text-xs font-black uppercase tracking-[0.12em] transition ${
                        activeTab === "voided"
                          ? "border-[#d4af37] bg-[#102C57] text-[#fff7df]"
                          : "border-[#d7dde5] bg-white text-[#102C57] hover:border-[#d4af37]"
                      }`}
                    >
                      <X size={14} />
                      รายการที่ยกเลิกแล้ว ({voidedSummary.totalCount})
                    </button>
                  </div>
                </div>

                <div className="inline-flex items-center gap-2 border border-[#d7dde5] bg-[#fbfcfd] px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-[#102C57]">
                  <RefreshCw size={14} />
                  {activeTab === "cancelable" ? pickerSummary.totalCount : voidedSummary.totalCount} รายการ
                </div>
              </div>
            </div>

            {/* Mobile View */}
            <div className="md:hidden">
              {activeTab === "cancelable" ? (
                pickerRows.length ? (
                  <div className="divide-y divide-[#e5ebf1]">
                    {pickerRows.map((row) => (
                      <article key={row.receiptId} className="space-y-3 px-4 py-4 text-[#111111]">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[#7f5d00]">
                              พร้อมยกเลิก
                            </p>
                            <p className="mt-1 truncate font-mono text-[13px] font-semibold text-[#102C57]">
                              {row.barcode}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => completeCancel(row)}
                            disabled={isPending && activeReceiptId === row.receiptId}
                            className="inline-flex h-8 shrink-0 items-center justify-center gap-1 border border-rose-200 bg-rose-50 px-2 text-[10px] font-black uppercase tracking-[0.08em] text-rose-700 transition hover:border-rose-400 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isPending && activeReceiptId === row.receiptId ? (
                              <Loader2 size={12} className="animate-spin" />
                            ) : null}
                            ยกเลิก
                          </button>
                        </div>

                        <p className="text-[13px] font-semibold leading-5 text-[#111111]">
                          {row.productCode} - {row.productName}
                        </p>

                        <div className="grid grid-cols-2 gap-3 text-[12px]">
                          <div>
                            <p className="font-black uppercase tracking-[0.08em] text-[#7d8795]">LOT</p>
                            <p className="mt-1 font-semibold text-[#111111]">{row.lotNo}</p>
                          </div>
                          <div>
                            <p className="font-black uppercase tracking-[0.08em] text-[#7d8795]">น้ำหนัก</p>
                            <p className="mt-1 font-semibold text-[#111111]">
                              {formatWeight(row.netWeightKg)} กก.
                            </p>
                          </div>
                        </div>

                        <div className="text-[12px]">
                          <p className="font-black uppercase tracking-[0.08em] text-[#7d8795]">เวลา</p>
                          <p className="mt-1 font-semibold text-[#111111]">{formatDateTime(row.weighedAt)}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-10 text-center text-sm text-[#546274]">
                    ยังไม่พบรายการชั่งที่ยกเลิกได้ของวันนี้
                  </div>
                )
              ) : (
                isLoadingVoided ? (
                  <div className="flex items-center justify-center py-10 text-sm font-semibold text-[#102C57]">
                    <Loader2 size={24} className="mr-2 animate-spin" />
                    กำลังโหลดรายการ...
                  </div>
                ) : voidedErrorMessage ? (
                  <div className="px-4 py-10 text-center text-sm font-semibold text-rose-600">
                    {voidedErrorMessage}
                  </div>
                ) : voidedRows.length ? (
                  <div className="divide-y divide-[#e5ebf1]">
                    {voidedRows.map((row) => (
                      <article key={row.receiptId} className="space-y-3 px-4 py-4 text-[#111111] bg-[#fffcfc]">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-rose-700">
                              ยกเลิกแล้ว
                            </p>
                            <p className="mt-1 truncate font-mono text-[13px] font-semibold text-[#102C57]">
                              {row.barcode}
                            </p>
                          </div>
                        </div>

                        <p className="text-[13px] font-semibold leading-5 text-[#111111]">
                          {row.productCode} - {row.productName}
                        </p>

                        <div className="grid grid-cols-2 gap-3 text-[12px]">
                          <div>
                            <p className="font-black uppercase tracking-[0.08em] text-[#7d8795]">LOT</p>
                            <p className="mt-1 font-semibold text-[#111111]">{row.lotNo}</p>
                          </div>
                          <div>
                            <p className="font-black uppercase tracking-[0.08em] text-[#7d8795]">น้ำหนัก</p>
                            <p className="mt-1 font-semibold text-[#111111]">
                              {formatWeight(row.netWeightKg)} กก.
                            </p>
                          </div>
                        </div>

                        <div className="text-[12px]">
                          <p className="font-black uppercase tracking-[0.08em] text-[#7d8795]">เวลา</p>
                          <p className="mt-1 font-semibold text-[#111111]">{formatDateTime(row.weighedAt)}</p>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-10 text-center text-sm text-[#546274]">
                    ยังไม่พบรายการที่ยกเลิกชั่งในวันนี้
                  </div>
                )
              )}
            </div>

            {/* Desktop View */}
            <div className="hidden overflow-x-auto md:block">
              {activeTab === "cancelable" ? (
                <table className="min-w-full border-collapse">
                  <thead className="bg-[#fffdf7]">
                    <tr className="border-b border-[#e2d4a7] text-[14px] font-black uppercase tracking-[0.08em] text-[#111111]">
                      <th className="px-4 py-3 text-left">บาร์โค้ด</th>
                      <th className="px-4 py-3 text-left">สินค้า</th>
                      <th className="px-4 py-3 text-left">LOT</th>
                      <th className="px-4 py-3 text-right">น้ำหนัก</th>
                      <th className="px-4 py-3 text-left">เวลา</th>
                      <th className="px-4 py-3 text-right">การทำงาน</th>
                    </tr>
                  </thead>
                  <tbody className="bg-[#fbfcfd]">
                    {pickerRows.length ? (
                      pickerRows.map((row) => (
                        <tr
                          key={row.receiptId}
                          className="border-b border-[#e5ebf1] text-[13px] font-semibold text-[#111111] transition hover:bg-[#fffdf7] last:border-b-0"
                        >
                          <td className="whitespace-nowrap px-4 py-3 font-mono">{row.barcode}</td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {row.productCode} - {row.productName}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">{row.lotNo}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            {formatWeight(row.netWeightKg)} กก.
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">{formatDateTime(row.weighedAt)}</td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            <button
                              type="button"
                              onClick={() => completeCancel(row)}
                              disabled={isPending && activeReceiptId === row.receiptId}
                              className="inline-flex h-9 items-center justify-center gap-2 border border-rose-200 bg-rose-50 px-3 text-[11px] font-black uppercase tracking-[0.12em] text-rose-700 transition hover:border-rose-400 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isPending && activeReceiptId === row.receiptId ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : null}
                              ยกเลิกชั่ง
                            </button>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-[#546274]">
                          ยังไม่พบรายการชั่งที่ยกเลิกได้ของวันนี้
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              ) : (
                isLoadingVoided ? (
                  <div className="flex items-center justify-center py-12 text-sm font-semibold text-[#102C57]">
                    <Loader2 size={28} className="mr-2 animate-spin" />
                    กำลังโหลดรายการที่ยกเลิก...
                  </div>
                ) : voidedErrorMessage ? (
                  <div className="px-4 py-12 text-center text-sm font-semibold text-rose-600">
                    {voidedErrorMessage}
                  </div>
                ) : (
                  <table className="min-w-full border-collapse">
                    <thead className="bg-[#fffdf7]">
                      <tr className="border-b border-[#e2d4a7] text-[14px] font-black uppercase tracking-[0.08em] text-[#111111]">
                        <th className="px-4 py-3 text-left">บาร์โค้ด</th>
                        <th className="px-4 py-3 text-left">สินค้า</th>
                        <th className="px-4 py-3 text-left">LOT</th>
                        <th className="px-4 py-3 text-right">น้ำหนัก</th>
                        <th className="px-4 py-3 text-left">เวลา</th>
                        <th className="px-4 py-3 text-right">สถานะ</th>
                      </tr>
                    </thead>
                    <tbody className="bg-[#fbfcfd]">
                      {voidedRows.length ? (
                        voidedRows.map((row) => (
                          <tr
                            key={row.receiptId}
                            className="border-b border-[#e5ebf1] text-[13px] font-semibold text-[#111111] transition hover:bg-[#fffdf7] last:border-b-0 bg-rose-50/10"
                          >
                            <td className="whitespace-nowrap px-4 py-3 font-mono">{row.barcode}</td>
                            <td className="whitespace-nowrap px-4 py-3">
                              {row.productCode} - {row.productName}
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">{row.lotNo}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-right">
                              {formatWeight(row.netWeightKg)} กก.
                            </td>
                            <td className="whitespace-nowrap px-4 py-3">{formatDateTime(row.weighedAt)}</td>
                            <td className="whitespace-nowrap px-4 py-3 text-right text-rose-600 font-bold">
                              ยกเลิกแล้ว
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan={6} className="px-4 py-10 text-center text-sm text-[#546274]">
                            ยังไม่พบรายการที่ยกเลิกชั่งในวันนี้
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
