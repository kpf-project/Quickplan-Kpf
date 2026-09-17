"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Cable,
  Loader2,
  Printer,
  Radar,
  RefreshCw,
  Save,
  Settings,
  X,
  ScanLine,
  ScanSearch,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  Search,
} from "lucide-react";
import {
  DEFAULT_SCALE_CONFIG,
  normalizeScaleConfig,
} from "@/lib/scale/config";
import WeightScalePrimaryHeader from "@/features/production-line/components/WeightScalePrimaryHeader";
import {
  createScaleStream,
} from "@/features/production-line/services/scaleClient";
import {
  fetchLocalPrintAgentHealth,
  fetchLocalPrinters,
  printWeightScaleLabelViaAgent,
  saveLocalPrinterSelection,
} from "@/features/production-line/services/localPrintAgentClient";
import { printWeightScaleLabelViaUsb } from "@/features/production-line/services/webUsbPrinter";
import {
  validateIssuedBarcodeRequest,
  createStockReturnRequest,
  loadReturnableIssuedItemsRequest,
} from "@/features/production-line/services/productionStockReturnClient";
import { calculateStockReturnWeights } from "@/features/production-line/services/stockReturnWeight";

const SCALE_STORAGE_KEY = "kpf-weight-scale-profile-v1";
const PRINT_MODE_STORAGE_KEY = "kpf-weight-scale-print-mode-v1";
const RECENT_RETURNS_LIMIT = 20;
const AUTO_SAVE_RESET_THRESHOLD_KG = 0.1;
const AUTO_SAVE_STABLE_TOLERANCE_KG = 0.01;
const AUTO_SAVE_STABLE_WINDOW_MS = 2500;
const TEST_WEIGHT_STEP = "0.001";
const PRINT_AGENT_UNAVAILABLE_MESSAGE =
  "ยังไม่พบ local print agent ในเครื่องนี้";

const CONFIG_FIELDS = [
  {
    key: "host",
    label: "ไอพี / โฮสต์",
    placeholder: "192.168.211.243",
  },
  {
    key: "port",
    label: "พอร์ต",
    placeholder: "9761",
    inputMode: "numeric",
  },
];

function formatDateTime(value) {
  if (!value) {
    return "-";
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(parsed);
}

function formatWeightDisplay(value) {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  if (!Number.isFinite(parsed)) {
    return "-";
  }
  return parsed.toFixed(2);
}

function buildReturnPrintLabel({ result, sourceItem, unitLabel = "kg" }) {
  if (!result?.barcode) {
    return null;
  }

  return {
    barcodeValue: String(result.barcode).trim(),
    barcodeText: String(result.barcode).trim(),
    productName:
      String(result.productName || sourceItem?.productName || "").trim() || "-",
    productCode:
      String(result.productCode || sourceItem?.productCode || "").trim() || "-",
    lotNo: String(result.lotNo || sourceItem?.lotNo || "").trim() || "-",
    tareWeightKg: Number.parseFloat(String(result.tareWeightKg ?? 0)) || 0,
    netWeightKg: Number.parseFloat(String(result.netWeightKg ?? 0)) || 0,
    weighedAt: result.returnedAt || new Date().toISOString(),
    unitLabel: String(unitLabel).trim().toLowerCase() === "kg" ? "กก." : unitLabel,
    printer: {
      labelWidthMm: 80,
      labelHeightMm: 50,
      symbology: "CODE128",
    },
  };
}

function buildTestPrintLabel() {
  const issuedAt = new Date();
  const timestamp = [
    issuedAt.getFullYear(),
    String(issuedAt.getMonth() + 1).padStart(2, "0"),
    String(issuedAt.getDate()).padStart(2, "0"),
    String(issuedAt.getHours()).padStart(2, "0"),
    String(issuedAt.getMinutes()).padStart(2, "0"),
    String(issuedAt.getSeconds()).padStart(2, "0"),
  ].join("");

  return buildReturnPrintLabel({
    result: {
      barcode: `TEST-RETURN-${timestamp}`,
      productCode: "TEST-RETURN",
      productName: "ทดสอบพิมพ์ฉลากคืน",
      lotNo: "TEST",
      netWeightKg: 0,
      returnedAt: issuedAt.toISOString(),
    },
    sourceItem: null,
  });
}

function normalizePrinterOptions(printers) {
  if (!Array.isArray(printers)) {
    return [];
  }

  return printers
    .map((printer) => ({
      name: String(printer?.name || "").trim(),
      isDefault: Boolean(printer?.isDefault),
      isOffline: Boolean(printer?.isOffline),
      portName: String(printer?.portName || "").trim(),
      driverName: String(printer?.driverName || "").trim(),
    }))
    .filter((printer) => printer.name);
}

function getStatusTone(state) {
  if (state === "connected" || state === "ready" || state === "success") {
    return "border-emerald-300 bg-emerald-50 text-emerald-700";
  }
  if (state === "warning" || state === "connecting" || state === "processing") {
    return "border-amber-300 bg-amber-50 text-amber-700";
  }
  if (state === "error") {
    return "border-rose-300 bg-rose-50 text-rose-700";
  }
  return "border-slate-300 bg-slate-50 text-slate-700";
}

export default function WeightScaleReturnPageClient({
  initialScaleConfig = null,
}) {
  const barcodeInputRef = useRef(null);
  const streamRef = useRef(null);
  const isSubmittingRef = useRef(false);
  const closingStreamRef = useRef(false);
  const connectWatchdogRef = useRef(null);
  const autoConnectKeyRef = useRef("");
  const autoConnectPausedRef = useRef(false);
  const autoSaveStateRef = useRef({
    phase: "armed",
    stableSince: null,
    baselineWeightKg: null,
  });
  
  const [scaleConfig, setScaleConfig] = useState(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(SCALE_STORAGE_KEY) : null;
    if (stored) {
      try {
        return normalizeScaleConfig(JSON.parse(stored), initialScaleConfig || DEFAULT_SCALE_CONFIG);
      } catch {
        // Fall through to the server-provided configuration.
      }
    }
    return normalizeScaleConfig(initialScaleConfig || DEFAULT_SCALE_CONFIG);
  });

  const [barcode, setBarcode] = useState("");
  const [sourceItem, setSourceItem] = useState(null);
  const [status, setStatus] = useState({
    state: "ready",
    message: "พร้อมรับสแกนบาร์โค้ดที่ต้องการคืน",
    readAt: null,
  });
  
  const [liveReading, setLiveReading] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [recentReturns, setRecentReturns] = useState([]);
  const [isTestMode, setIsTestMode] = useState(false);
  const [testWeightInput, setTestWeightInput] = useState("");
  const [tareWeightInput, setTareWeightInput] = useState("0");
  const [isSaving, setIsSaving] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [printMode, setPrintMode] = useState(() => {
    if (typeof window === "undefined") {
      return "agent";
    }
    return window.localStorage.getItem(PRINT_MODE_STORAGE_KEY) || "agent";
  });
  const [usbDevice, setUsbDevice] = useState(null);
  const [usbDeviceName, setUsbDeviceName] = useState("");
  const [isConnectingUsb, setIsConnectingUsb] = useState(false);
  const [printerOptions, setPrinterOptions] = useState([]);
  const [selectedPrinterName, setSelectedPrinterName] = useState("");
  const [printerAgentMessage, setPrinterAgentMessage] = useState("");
  const [printerAgentState, setPrinterAgentState] = useState("unknown");
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
  const [isTestingPrinter, setIsTestingPrinter] = useState(false);
  const [isReprintingLatestLabel, setIsReprintingLatestLabel] = useState(false);
  const [latestReturnLabel, setLatestReturnLabel] = useState(null);
  const [isReturnPickerOpen, setIsReturnPickerOpen] = useState(false);
  const [isReturnPickerLoading, setIsReturnPickerLoading] = useState(false);
  const [returnPickerError, setReturnPickerError] = useState("");
  const [returnPickerRows, setReturnPickerRows] = useState([]);
  const [returnPickerSummary, setReturnPickerSummary] = useState({
    totalCount: 0,
    totalRemainingWeightKg: 0,
  });
  const [returnPickerPagination, setReturnPickerPagination] = useState({
    page: 1,
    limit: 50,
    totalCount: 0,
    totalPages: 0,
  });
  const [returnPickerProductOptions, setReturnPickerProductOptions] = useState([]);
  const [returnPickerFilters, setReturnPickerFilters] = useState({
    dateFrom: "",
    dateTo: "",
    search: "",
    productCode: "",
  });

  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, []);

  useEffect(() => {
    setStatus((current) => (
      current.readAt
        ? current
        : { ...current, readAt: new Date().toISOString() }
    ));
  }, []);

  const closeStream = useCallback(() => {
    if (connectWatchdogRef.current) {
      window.clearTimeout(connectWatchdogRef.current);
      connectWatchdogRef.current = null;
    }
    closingStreamRef.current = true;
    streamRef.current?.close();
    streamRef.current = null;
  }, []);

  useEffect(() => () => {
    closeStream();
  }, [closeStream]);

  const loadLocalPrinters = useCallback(async () => {
    setIsLoadingPrinters(true);
    setPrinterAgentMessage("");
    try {
      const [healthResult, printersResult] = await Promise.all([
        fetchLocalPrintAgentHealth(),
        fetchLocalPrinters(),
      ]);
      const nextPrinters = normalizePrinterOptions(printersResult?.printers);
      setPrinterOptions(nextPrinters);
      setSelectedPrinterName(
        String(
          printersResult?.selectedPrinterName
          || healthResult?.printerName
          || nextPrinters.find((printer) => printer.isDefault)?.name
          || ""
        ).trim()
      );
      setPrinterAgentState("online");
      setPrinterAgentMessage(
        nextPrinters.length
          ? "Local print agent พร้อมใช้งาน"
          : "ไม่พบเครื่องพิมพ์ใน Windows ของเครื่องนี้"
      );
    } catch (error) {
      setPrinterOptions([]);
      setSelectedPrinterName("");
      setPrinterAgentState("offline");
      setPrinterAgentMessage(error?.message || PRINT_AGENT_UNAVAILABLE_MESSAGE);
    } finally {
      setIsLoadingPrinters(false);
    }
  }, []);

  useEffect(() => {
    if (isSettingsOpen && printMode === "agent") {
      void loadLocalPrinters();
    }
  }, [isSettingsOpen, loadLocalPrinters, printMode]);

  useEffect(() => {
    if (typeof window === "undefined" || !navigator.usb || printMode !== "webusb") {
      return;
    }

    void navigator.usb.getDevices().then((devices) => {
      if (devices[0]) {
        setUsbDevice(devices[0]);
        setUsbDeviceName(devices[0].productName || "USB Printer");
      }
    }).catch(() => {});
  }, [printMode]);

  const loadReturnPickerRows = useCallback(async ({
    page = 1,
    filters = returnPickerFilters,
  } = {}) => {
    setIsReturnPickerLoading(true);
    setReturnPickerError("");
    try {
      const payload = await loadReturnableIssuedItemsRequest({
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        search: filters.search,
        productCodes: filters.productCode ? [filters.productCode] : [],
        page,
        limit: returnPickerPagination.limit,
      });
      setReturnPickerRows(Array.isArray(payload?.rows) ? payload.rows : []);
      setReturnPickerSummary(payload?.summary || {
        totalCount: 0,
        totalRemainingWeightKg: 0,
      });
      setReturnPickerPagination((current) => ({
        ...current,
        ...(payload?.pagination || {}),
      }));
      const nextProductOptions = Array.isArray(payload?.productOptions)
        ? payload.productOptions
        : [];
      setReturnPickerProductOptions((current) => {
        if (!filters.productCode) {
          return nextProductOptions;
        }
        const mergedByCode = new Map(
          [...current, ...nextProductOptions].map((product) => [product.code, product])
        );
        return Array.from(mergedByCode.values());
      });
    } catch (error) {
      setReturnPickerRows([]);
      setReturnPickerSummary({ totalCount: 0, totalRemainingWeightKg: 0 });
      setReturnPickerError(error?.message || "ไม่สามารถโหลดรายการที่ชั่งคืนได้");
    } finally {
      setIsReturnPickerLoading(false);
    }
  }, [returnPickerFilters, returnPickerPagination.limit]);

  const openReturnPicker = () => {
    if (autoSaveStateRef.current.phase === "awaiting-reset") {
      setStatus({
        state: "warning",
        message: "กรุณายกสินค้าออกจากเครื่องชั่งก่อนเลือกรายการถัดไป",
        readAt: new Date().toISOString(),
      });
      return;
    }
    setIsReturnPickerOpen(true);
    void loadReturnPickerRows({ page: 1, filters: returnPickerFilters });
  };

  const handleBarcodeSubmit = async (barcodeOverride = "") => {
    const normalizedBarcode = String(barcodeOverride || barcode).trim().toUpperCase();
    if (!normalizedBarcode) return;
    if (autoSaveStateRef.current.phase === "awaiting-reset") {
      setStatus({
        state: "warning",
        message: "กรุณายกสินค้าออกจากเครื่องชั่งก่อนสแกนรายการถัดไป",
        readAt: new Date().toISOString(),
      });
      return;
    }

    setStatus({
      state: "processing",
      message: `กำลังตรวจสอบบาร์โค้ด ${normalizedBarcode}...`,
      readAt: new Date().toISOString(),
    });

    try {
      const item = await validateIssuedBarcodeRequest(normalizedBarcode);
      autoSaveStateRef.current = {
        phase: "armed",
        stableSince: null,
        baselineWeightKg: null,
      };
      autoConnectPausedRef.current = false;
      autoConnectKeyRef.current = "";
      setSourceItem(item);
      setTareWeightInput(String(item.sourceTareWeightKg ?? 0));
      setStatus({
        state: "ready",
        message: "สแกนสำเร็จ กำลังเชื่อมต่อเครื่องชั่งอัตโนมัติ",
        readAt: new Date().toISOString(),
      });
      setBarcode("");
    } catch (error) {
      setSourceItem(null);
      setTareWeightInput("0");
      setStatus({
        state: "error",
        message: error.message || "ไม่สามารถตรวจสอบบาร์โค้ดได้",
        readAt: new Date().toISOString(),
      });
    }
  };

  const handlePickedReturnItem = async (row) => {
    if (!row?.barcode || isReturnPickerLoading) {
      return;
    }
    setIsReturnPickerOpen(false);
    await handleBarcodeSubmit(row.barcode);
  };

  const handleReturnPickerPageChange = (nextPage) => {
    const totalPages = returnPickerPagination.totalPages || 1;
    const resolvedPage = Math.max(1, Math.min(nextPage, totalPages));
    if (resolvedPage === returnPickerPagination.page) {
      return;
    }
    void loadReturnPickerRows({ page: resolvedPage, filters: returnPickerFilters });
  };

  const handleReturnPickerSearch = () => {
    void loadReturnPickerRows({ page: 1, filters: returnPickerFilters });
  };

  const closeReturnPicker = () => {
    setIsReturnPickerOpen(false);
    window.setTimeout(() => barcodeInputRef.current?.focus(), 0);
  };

  const stopPreview = useCallback(() => {
    closeStream();
    autoConnectPausedRef.current = true;
    setIsStreaming(false);
    setStatus({
      state: "ready",
      message: "เครื่องชั่งถูกตัดการเชื่อมต่อ",
      readAt: new Date().toISOString(),
    });
  }, [closeStream]);

  const startPreview = useCallback(() => {
    if (!scaleConfig.host) {
      setStatus({
        state: "error",
        message: "กรุณาระบุไอพีหรือโฮสต์ของเครื่องชั่ง",
        readAt: new Date().toISOString(),
      });
      return;
    }

    closeStream();
    closingStreamRef.current = false;
    autoConnectPausedRef.current = false;
    setIsStreaming(true);
    setStatus({
      state: "connecting",
      message: "กำลังเชื่อมต่อเครื่องชั่ง...",
      readAt: new Date().toISOString(),
    });

    const stream = createScaleStream(scaleConfig, {
      onStatus: (payload) => {
        if (payload?.state === "connected" && connectWatchdogRef.current) {
          window.clearTimeout(connectWatchdogRef.current);
          connectWatchdogRef.current = null;
        }
        setStatus({
          state: payload.state || "connected",
          message: payload.message || "เชื่อมต่อเครื่องชั่งแล้ว",
          readAt: new Date().toISOString(),
        });
      },
      onWeight: (payload) => {
        if (connectWatchdogRef.current) {
          window.clearTimeout(connectWatchdogRef.current);
          connectWatchdogRef.current = null;
        }
        setLiveReading(payload);
        setStatus({
          state: "connected",
          message: "เชื่อมต่อเครื่องชั่งสำเร็จแล้ว",
          readAt: payload.readAt || new Date().toISOString(),
        });
      },
      onDeviceError: (payload) => {
        setStatus({
          state: "error",
          message: payload.message || "เครื่องชั่งขัดข้อง",
          readAt: new Date().toISOString(),
        });
        setIsStreaming(false);
        closeStream();
      },
      onTransportError: () => {
        if (closingStreamRef.current) {
          return;
        }
        closeStream();
        setStatus({
          state: "error",
          message: "ไม่สามารถสื่อสารกับเครื่องชั่งได้",
          readAt: new Date().toISOString(),
        });
        setIsStreaming(false);
      },
    });

    streamRef.current = stream;
    const expectedConnectMs =
      scaleConfig.timeoutMs * (scaleConfig.connectRetryCount + 1)
      + scaleConfig.connectRetryDelayMs * scaleConfig.connectRetryCount
      + 1500;
    connectWatchdogRef.current = window.setTimeout(() => {
      if (!streamRef.current || closingStreamRef.current) {
        return;
      }
      closeStream();
      setIsStreaming(false);
      setStatus({
        state: "error",
        message: "เชื่อมต่อเครื่องชั่งไม่สำเร็จภายในเวลาที่กำหนด",
        readAt: new Date().toISOString(),
      });
    }, expectedConnectMs);
  }, [closeStream, scaleConfig]);

  const autoConnectKey = useMemo(
    () => [
      String(scaleConfig.host || "").trim(),
      scaleConfig.port,
      sourceItem?.barcode || "",
    ].join("|"),
    [scaleConfig.host, scaleConfig.port, sourceItem?.barcode]
  );

  useEffect(() => {
    if (!sourceItem?.barcode || !scaleConfig.host) {
      return;
    }
    if (
      autoConnectPausedRef.current
      || isStreaming
      || isSettingsOpen
      || isSaving
      || autoConnectKeyRef.current === autoConnectKey
    ) {
      return;
    }
    autoConnectKeyRef.current = autoConnectKey;
    startPreview();
  }, [autoConnectKey, isSaving, isSettingsOpen, isStreaming, scaleConfig.host, sourceItem?.barcode, startPreview]);

  const handlePairUsbDevice = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.usb) {
      setPrinterAgentState("offline");
      setPrinterAgentMessage("เบราว์เซอร์นี้ไม่รองรับ WebUSB");
      return;
    }
    setIsConnectingUsb(true);
    try {
      const device = await navigator.usb.requestDevice({ filters: [] });
      setUsbDevice(device);
      setUsbDeviceName(device.productName || "USB Printer");
      setPrinterAgentState("online");
      setPrinterAgentMessage(`เชื่อมต่อ ${device.productName || "USB Printer"} แล้ว`);
    } catch (error) {
      if (error?.name !== "NotFoundError") {
        setPrinterAgentState("offline");
        setPrinterAgentMessage(error?.message || "เชื่อมต่อ USB ไม่สำเร็จ");
      }
    } finally {
      setIsConnectingUsb(false);
    }
  }, []);

  const saveSelectedPrinter = useCallback(async () => {
    if (!selectedPrinterName) {
      throw new Error("กรุณาเลือกเครื่องพิมพ์ก่อน");
    }
    await saveLocalPrinterSelection({ printerName: selectedPrinterName });
    setPrinterAgentState("online");
    setPrinterAgentMessage(`บันทึกเครื่องพิมพ์ ${selectedPrinterName} แล้ว`);
  }, [selectedPrinterName]);

  const handleTestPrint = useCallback(async () => {
    const testLabel = buildTestPrintLabel();
    setIsTestingPrinter(true);
    try {
      if (printMode === "webusb") {
        if (!usbDevice) {
          throw new Error("กรุณาเชื่อมต่อเครื่องพิมพ์ USB ก่อน");
        }
        await printWeightScaleLabelViaUsb(usbDevice, testLabel);
      } else {
        await saveSelectedPrinter();
        await printWeightScaleLabelViaAgent(testLabel);
      }
      setPrinterAgentState("online");
      setPrinterAgentMessage("ทดสอบพิมพ์ฉลากสำเร็จ");
    } catch (error) {
      setPrinterAgentState("offline");
      setPrinterAgentMessage(error?.message || "ทดสอบพิมพ์ไม่สำเร็จ");
    } finally {
      setIsTestingPrinter(false);
    }
  }, [printMode, saveSelectedPrinter, usbDevice]);

  const handleReprintLatestLabel = useCallback(async () => {
    if (!latestReturnLabel) {
      return;
    }
    setIsReprintingLatestLabel(true);
    try {
      if (printMode === "webusb") {
        if (!usbDevice) {
          throw new Error("กรุณาเชื่อมต่อเครื่องพิมพ์ USB ก่อน");
        }
        await printWeightScaleLabelViaUsb(usbDevice, latestReturnLabel);
      } else {
        await printWeightScaleLabelViaAgent(latestReturnLabel);
      }
      setPrinterAgentState("online");
      setPrinterAgentMessage(`พิมพ์ฉลาก ${latestReturnLabel.barcodeValue} ซ้ำสำเร็จ`);
    } catch (error) {
      setPrinterAgentState("offline");
      setPrinterAgentMessage(error?.message || "พิมพ์ฉลากล่าสุดซ้ำไม่สำเร็จ");
    } finally {
      setIsReprintingLatestLabel(false);
    }
  }, [latestReturnLabel, printMode, usbDevice]);

  const saveReturn = useCallback(async (grossWeightKg) => {
    const weights = calculateStockReturnWeights({
      grossWeightKg,
      tareWeightKg: tareWeightInput,
    });
    if (
      !sourceItem
      || isSubmittingRef.current
      || !weights.isValid
      || weights.netWeightKg > Number(sourceItem.remainingWeightKg)
    ) return;

    const activeSourceItem = sourceItem;
    isSubmittingRef.current = true;
    setIsSaving(true);
    setStatus({
      state: "processing",
      message: `กำลังบันทึกคืนสต็อกสุทธิ ${weights.netWeightKg.toFixed(2)} Kg...`,
      readAt: new Date().toISOString(),
    });

    try {
      const result = await createStockReturnRequest({
        sourceBarcode: activeSourceItem.barcode,
        grossWeightKg: weights.grossWeightKg,
        tareWeightKg: weights.tareWeightKg,
        tareSource:
          Math.abs(
            weights.tareWeightKg - Number(activeSourceItem.sourceTareWeightKg || 0)
          ) < 0.001
            ? "source_receipt"
            : "manual",
      });
      const completedReturn = {
        ...result,
        productCode: result?.productCode || activeSourceItem.productCode,
        productName: result?.productName || activeSourceItem.productName,
        lotNo: result?.lotNo || activeSourceItem.lotNo,
        returnedAt: result?.returnedAt || new Date().toISOString(),
      };
      setRecentReturns((prev) => [
        completedReturn,
        ...prev.slice(0, RECENT_RETURNS_LIMIT - 1),
      ]);
      const nextPrintLabel = buildReturnPrintLabel({
        result: completedReturn,
        sourceItem: activeSourceItem,
        unitLabel: liveReading?.unitLabel || scaleConfig.unitLabel,
      });
      setLatestReturnLabel(nextPrintLabel);
      let printErrorMessage = "";
      if (nextPrintLabel) {
        try {
          if (printMode === "webusb") {
            if (!usbDevice) {
              throw new Error("ไม่ได้เลือกเครื่องพิมพ์ USB");
            }
            await printWeightScaleLabelViaUsb(usbDevice, nextPrintLabel);
          } else {
            await printWeightScaleLabelViaAgent(nextPrintLabel);
          }
          setPrinterAgentState("online");
          setPrinterAgentMessage(`พิมพ์ฉลากคืน ${result.barcode} อัตโนมัติแล้ว`);
        } catch (printError) {
          printErrorMessage = printError?.message || "พิมพ์ฉลากคืนอัตโนมัติไม่สำเร็จ";
          setPrinterAgentState("offline");
          setPrinterAgentMessage(printErrorMessage);
        }
      }
      autoSaveStateRef.current = {
        phase: "awaiting-reset",
        stableSince: null,
        baselineWeightKg: null,
      };
      setStatus({
        state: printErrorMessage ? "warning" : "success",
        message: printErrorMessage
          ? `บันทึกคืนสำเร็จ (${result.barcode}) แต่พิมพ์ไม่สำเร็จ: ${printErrorMessage} กรุณายกสินค้าออก`
          : `บันทึกและพิมพ์ ${result.barcode} สำเร็จ กรุณายกสินค้าออกจากเครื่องชั่ง`,
        readAt: new Date().toISOString(),
      });
    } catch (error) {
      autoSaveStateRef.current = {
        phase: "armed",
        stableSince: null,
        baselineWeightKg: null,
      };
      setStatus({
        state: "error",
        message: error.message || "ไม่สามารถบันทึกคืนได้",
        readAt: new Date().toISOString(),
      });
    } finally {
      setIsSaving(false);
      isSubmittingRef.current = false;
    }
  }, [liveReading?.unitLabel, printMode, scaleConfig.unitLabel, sourceItem, tareWeightInput, usbDevice]);

  // Auto-Save Logic
  useEffect(() => {
    const currentWeight = Number.parseFloat(String(liveReading?.weightKg ?? ""));
    const readAt = liveReading?.readAt || new Date().toISOString();
    const currentState = autoSaveStateRef.current;

    if (currentState.phase === "awaiting-reset") {
      if (Number.isFinite(currentWeight) && currentWeight <= AUTO_SAVE_RESET_THRESHOLD_KG) {
        autoSaveStateRef.current = {
          phase: "armed",
          stableSince: null,
          baselineWeightKg: null,
        };
        setSourceItem(null);
        setTareWeightInput("0");
        setBarcode("");
        setStatus({
          state: "ready",
          message: "น้ำหนักกลับสู่จุดเริ่มต้นแล้ว พร้อมสแกนรายการถัดไป",
          readAt,
        });
        window.setTimeout(() => barcodeInputRef.current?.focus(), 0);
      }
      return;
    }

    if (!Number.isFinite(currentWeight)) {
      autoSaveStateRef.current = {
        ...currentState,
        stableSince: null,
        baselineWeightKg: null,
      };
      return;
    }

    if (
      !isStreaming
      || isTestMode
      || !sourceItem
      || isSubmittingRef.current
      || isSaving
      || isSettingsOpen
    ) {
      autoSaveStateRef.current = {
        ...currentState,
        stableSince: null,
        baselineWeightKg: null,
      };
      return;
    }

    if (currentWeight <= AUTO_SAVE_RESET_THRESHOLD_KG) {
      autoSaveStateRef.current = {
        phase: "armed",
        stableSince: null,
        baselineWeightKg: null,
      };
      return;
    }

    const weights = calculateStockReturnWeights({
      grossWeightKg: currentWeight,
      tareWeightKg: tareWeightInput,
    });
    if (!weights.isValid) {
      autoSaveStateRef.current = {
        phase: "armed",
        stableSince: null,
        baselineWeightKg: null,
      };
      setStatus({
        state: "warning",
        message: weights.error,
        readAt,
      });
      return;
    }

    if (weights.netWeightKg > Number(sourceItem.remainingWeightKg)) {
      autoSaveStateRef.current = {
        phase: "armed",
        stableSince: null,
        baselineWeightKg: null,
      };
      setStatus({
        state: "warning",
        message: `น้ำหนักสุทธิ ${weights.netWeightKg.toFixed(2)} Kg เกินยอดที่คืนได้ ${Number(sourceItem.remainingWeightKg).toFixed(2)} Kg`,
        readAt,
      });
      return;
    }

    if (!currentState.stableSince || !Number.isFinite(currentState.baselineWeightKg)) {
      autoSaveStateRef.current = {
        phase: "armed",
        stableSince: readAt,
        baselineWeightKg: currentWeight,
      };
      setStatus({
        state: "connected",
        message: "กำลังรอค่าน้ำหนักนิ่ง",
        readAt,
      });
      return;
    }

    if (Math.abs(currentWeight - currentState.baselineWeightKg) > AUTO_SAVE_STABLE_TOLERANCE_KG) {
      autoSaveStateRef.current = {
        phase: "armed",
        stableSince: readAt,
        baselineWeightKg: currentWeight,
      };
      return;
    }

    const stableElapsedMs =
      new Date(readAt).getTime() - new Date(currentState.stableSince).getTime();
    if (stableElapsedMs < AUTO_SAVE_STABLE_WINDOW_MS) {
      return;
    }

    autoSaveStateRef.current = {
      phase: "saving",
      stableSince: currentState.stableSince,
      baselineWeightKg: currentState.baselineWeightKg,
    };
    setStatus({
      state: "processing",
      message: "น้ำหนักนิ่งแล้ว กำลังบันทึกและพิมพ์ฉลากอัตโนมัติ",
      readAt,
    });
    void saveReturn(currentWeight);
  }, [isSaving, isSettingsOpen, isStreaming, isTestMode, liveReading, saveReturn, sourceItem, tareWeightInput]);

  const displayedReturnWeights = calculateStockReturnWeights({
    grossWeightKg: isTestMode ? testWeightInput : liveReading?.weightKg,
    tareWeightKg: tareWeightInput,
  });

  const handleManualSave = () => {
    if (!displayedReturnWeights.isValid) {
      setStatus({
        state: "error",
        message: displayedReturnWeights.error,
        readAt: new Date().toISOString(),
      });
      return;
    }
    if (displayedReturnWeights.netWeightKg > Number(sourceItem?.remainingWeightKg || 0)) {
      setStatus({
        state: "warning",
        message: `น้ำหนักสุทธิ ${displayedReturnWeights.netWeightKg.toFixed(2)} Kg เกินยอดที่คืนได้ ${Number(sourceItem?.remainingWeightKg || 0).toFixed(2)} Kg`,
        readAt: new Date().toISOString(),
      });
      return;
    }
    void saveReturn(displayedReturnWeights.grossWeightKg);
  };

  const updateScaleField = (key, value) => {
    const next = normalizeScaleConfig({ ...scaleConfig, [key]: value }, scaleConfig);
    setScaleConfig(next);
    window.localStorage.setItem(SCALE_STORAGE_KEY, JSON.stringify(next));
    autoConnectPausedRef.current = false;
    autoConnectKeyRef.current = "";
  };

  return (
    <div className="min-h-screen bg-[#f4f6f8] text-[#262626]">
      <WeightScalePrimaryHeader
        eyebrow="ระบบชั่งคืนผลิตภัณฑ์"
        badge="Stock Return"
        title="ชั่งคืนสต็อกผลิตภัณฑ์"
        actions={(
          <button
            type="button"
            onClick={() => setIsSettingsOpen(true)}
            className="inline-flex h-10 w-10 items-center justify-center border border-[#d4af37]/35 bg-white/[0.03] text-white transition hover:border-[#d4af37] hover:bg-white/[0.06] hover:text-[#f3d67a]"
            aria-label="ตั้งค่าการเชื่อมต่อ"
          >
            <Settings size={18} />
          </button>
        )}
      />

      <section className="border-b border-[#1f3047] bg-[#102C57] text-white">
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
                {!sourceItem ? (
                  <div className="flex h-full flex-col items-center justify-center py-4 text-center">
                    <div className="flex items-center gap-4 text-[#102C57]/20">
                       <ScanLine size={48} strokeWidth={1} />
                       <div className="text-left">
                          <p className="text-[10px] font-black uppercase tracking-[0.3em]">Ready to Return</p>
                          <h2 className="text-3xl font-black uppercase tracking-widest">SCAN ISSUED BARCODE</h2>
                       </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[#a0aec0]">บาร์โค้ดที่อ้างอิง</span>
                        <span className="mt-1 bg-[#102C57] text-[#d4af37] px-3 py-1 text-sm font-black tracking-wider self-start">
                          {sourceItem.barcode}
                        </span>
                      </div>
                      <div className="hidden sm:block h-10 w-px bg-[#e2e8f0]" />
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[#a0aec0]">ชื่อผลิตภัณฑ์</span>
                        <h2 className="mt-1 font-serif text-2xl sm:text-3xl font-medium text-[#102C57] truncate">
                          {sourceItem.productName}
                        </h2>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 pt-6 border-t border-[#e2e8f0] md:flex md:items-center md:gap-8">
                      <div className="flex-1 min-w-0 text-center">
                        <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-black">รหัสสินค้า</p>
                        <p className="mt-1 text-lg sm:text-xl font-bold text-black truncate">{sourceItem.productCode}</p>
                      </div>
                      <div className="hidden md:block h-12 w-px bg-[#e2e8f0]" />
                      <div className="flex-1 min-w-0 text-center">
                        <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-black">หมายเลขล็อต</p>
                        <p className="mt-1 text-lg sm:text-xl font-bold text-black">{sourceItem.lotNo}</p>
                      </div>
                      <div className="hidden md:block h-12 w-px bg-[#e2e8f0]" />
                      <div className="flex-1 min-w-0 text-center">
                        <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-black">น้ำหนักที่เบิกไป</p>
                        <p className="mt-1 text-lg sm:text-xl font-bold text-black">{formatWeightDisplay(sourceItem.originalWeightKg)} Kg</p>
                      </div>
                      <div className="hidden md:block h-12 w-px bg-[#e2e8f0]" />
                      <div className="flex-1 min-w-0 text-center">
                        <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-black">คืนแล้ว</p>
                        <p className="mt-1 text-lg sm:text-xl font-bold text-black">{formatWeightDisplay(sourceItem.returnedWeightKg)} Kg</p>
                      </div>
                      <div className="hidden md:block h-12 w-px bg-[#e2e8f0]" />
                      <div className="flex-1 min-w-0 text-center">
                        <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-black">เหลือคืนได้</p>
                        <p className="mt-1 text-lg sm:text-xl font-bold text-emerald-700">{formatWeightDisplay(sourceItem.remainingWeightKg)} Kg</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="lg:col-span-4 p-6 sm:p-8 lg:p-10 flex flex-col justify-center gap-4 bg-white">
                <button
                  type="button"
                  onClick={() => {
                    const currentWeightKg = Number(liveReading?.weightKg);
                    if (Number.isFinite(currentWeightKg) && currentWeightKg > AUTO_SAVE_RESET_THRESHOLD_KG) {
                      setStatus({
                        state: "warning",
                        message: "กรุณานำสินค้าออกจากเครื่องชั่งให้น้ำหนักกลับใกล้ 0 ก่อนสแกนสินค้าใหม่",
                      });
                      return;
                    }
                    autoSaveStateRef.current = {
                      phase: "armed",
                      stableSince: null,
                      baselineWeightKg: null,
                    };
                    setSourceItem(null);
                    setTareWeightInput("0");
                    setBarcode("");
                    barcodeInputRef.current?.focus();
                  }}
                  disabled={
                    autoSaveStateRef.current.phase === "awaiting-reset" ||
                    isSaving ||
                    (Number.isFinite(Number(liveReading?.weightKg)) &&
                      Number(liveReading?.weightKg) > AUTO_SAVE_RESET_THRESHOLD_KG)
                  }
                  className="flex items-center justify-center gap-2 h-14 border-2 border-[#102C57] text-[10px] font-black uppercase tracking-wider text-[#102C57] transition hover:bg-[#102C57] hover:text-white"
                >
                  <RefreshCw size={16} />
                  ล้างข้อมูลเพื่อสแกนใหม่
                </button>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={isStreaming ? stopPreview : startPreview}
                    className={`flex items-center justify-center gap-2 h-14 border-2 text-[10px] font-black uppercase tracking-wider transition ${
                      isStreaming 
                        ? "border-rose-200 text-rose-600 hover:bg-rose-50" 
                        : "border-[#102C57] text-[#102C57] hover:bg-[#102C57] hover:text-white"
                    }`}
                  >
                    {isStreaming ? <X size={16} /> : <Radar size={16} />}
                    {isStreaming ? "หยุดเชื่อมต่อ" : "เชื่อมเครื่องชั่ง"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsTestMode(!isTestMode)}
                    className={`flex items-center justify-center gap-2 h-14 border-2 text-[10px] font-black uppercase tracking-wider transition ${
                      isTestMode
                        ? "border-amber-400 bg-amber-50 text-amber-700"
                        : "border-[#d7dde5] text-[#7d8795] hover:border-[#102C57] hover:text-[#102C57]"
                    }`}
                  >
                    <Activity size={16} />
                    {isTestMode ? "โหมด: TEST" : "โหมด: ON"}
                  </button>
                </div>
              </div>
            </div>

            <div className="relative bg-[#102C57] px-4 sm:px-10 py-8 text-center lg:py-12">
              <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#d4af37_1px,transparent_1px)] [background-size:20px_20px]" />
              
              <div className="relative flex flex-col items-center justify-center">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.25em] border-2 shadow-sm ${getStatusTone(status.state)}`}>
                    <Activity size={14} />
                    <span>{status.message}</span>
                  </div>
                </div>

                {!sourceItem ? (
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
                            handleBarcodeSubmit();
                          }
                        }}
                        placeholder="สแกนบาร์โค้ดที่เบิกไปเพื่อคืน..."
                        className="w-full bg-transparent px-6 text-2xl sm:text-3xl md:text-4xl font-mono font-bold text-white outline-none placeholder:text-white/10"
                      />
                      {status.state === "processing" && (
                        <Loader2 size={32} className="animate-spin text-[#d4af37]" />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={openReturnPicker}
                      disabled={isSaving || status.state === "processing"}
                      className="mt-5 inline-flex h-12 w-full items-center justify-center gap-3 border border-[#d4af37]/70 bg-[#d4af37]/10 px-5 text-sm font-black text-[#f3d67a] transition hover:bg-[#d4af37] hover:text-[#102C57] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <ListChecks size={19} />
                      เลือกรายการที่ชั่งคืนได้
                    </button>
                  </div>
                ) : (
                  <div className="relative inline-flex items-baseline gap-2 sm:gap-4 animate-in zoom-in-95 duration-500">
                    <span className="font-bold tracking-tighter drop-shadow-[0_0_15px_rgba(212,175,55,0.3)] text-[5.5rem] xs:text-[7rem] sm:text-[10rem] md:text-[12rem] lg:text-[14rem] leading-none text-[#d4af37]">
                      {isTestMode ? (
                        testWeightInput || "0.00"
                      ) : (
                        Number.isFinite(Number(liveReading?.weightKg))
                          ? Number(liveReading.weightKg).toFixed(2)
                          : "0.00"
                      )}
                    </span>
                    <span className="text-xl sm:text-2xl md:text-3xl font-black text-white/40 uppercase tracking-[0.2em]">
                      Kg
                    </span>
                  </div>
                )}

                {sourceItem && (
                  <div className="mt-6 grid w-full max-w-2xl gap-3 sm:grid-cols-2">
                    <label className="border border-white/20 bg-white/5 p-4 text-left">
                      <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-white/60">
                        น้ำหนักภาชนะ (Tare)
                      </span>
                      <div className="mt-2 flex items-baseline gap-2">
                        <input
                          type="number"
                          min="0"
                          step={TEST_WEIGHT_STEP}
                          value={tareWeightInput}
                          onChange={(event) => {
                            autoSaveStateRef.current = {
                              phase: "armed",
                              stableSince: null,
                              baselineWeightKg: null,
                            };
                            setTareWeightInput(event.target.value);
                          }}
                          disabled={isSaving || autoSaveStateRef.current.phase === "awaiting-reset"}
                          className="min-w-0 flex-1 border-b border-[#d4af37] bg-transparent text-2xl font-black text-white outline-none"
                        />
                        <span className="text-sm font-bold text-white/50">Kg</span>
                      </div>
                      <span className="mt-2 block text-[10px] text-[#d4af37]">
                        ค่าเริ่มต้นจากใบรับเข้า แก้ไขได้หากเปลี่ยนภาชนะ
                      </span>
                    </label>

                    <div className="border border-[#d4af37]/50 bg-[#d4af37]/10 p-4 text-left">
                      <span className="block text-[10px] font-black uppercase tracking-[0.18em] text-white/60">
                        น้ำหนักสุทธิ
                      </span>
                      <div className="mt-2 flex items-baseline gap-2">
                        <strong className="text-3xl font-black text-[#d4af37]">
                          {formatWeightDisplay(
                            displayedReturnWeights.isValid
                              ? displayedReturnWeights.netWeightKg
                              : 0
                          )}
                        </strong>
                        <span className="text-sm font-bold text-white/50">Kg</span>
                      </div>
                      <span className="mt-2 block text-[10px] text-white/50">
                        น้ำหนักรวม - น้ำหนักภาชนะ
                      </span>
                    </div>
                  </div>
                )}

                {sourceItem && (
                  <div className="mt-8 w-full max-w-lg min-h-[4rem]">
                    {isTestMode ? (
                      <div className="space-y-4">
                        <input
                          type="number"
                          step={TEST_WEIGHT_STEP}
                          value={testWeightInput}
                          onChange={(e) => setTestWeightInput(e.target.value)}
                          placeholder="กรอกน้ำหนักรวม..."
                          className="h-10 w-full border-b border-[#d4af37] bg-transparent text-center text-lg font-bold text-white outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleManualSave}
                          disabled={isSaving}
                          className="flex items-center justify-center gap-3 w-full h-16 bg-[#d4af37] text-[#102C57] text-lg font-black uppercase tracking-[0.25em] shadow-[0_10px_20px_rgba(212,175,55,0.15)] transition-all hover:bg-[#e6c15c] active:scale-[0.98] disabled:opacity-50"
                        >
                          {isSaving ? <Loader2 size={24} className="animate-spin" /> : <Save size={24} />}
                          ยืนยันการคืนสต็อก
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-4">
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">
                          วางผลิตภัณฑ์บนเครื่องชั่ง ระบบจะบันทึกคืนอัตโนมัติเมื่อค่านิ่ง
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="bg-white border border-[#e2e8f0] shadow-sm">
            <div className="px-8 py-6 border-b border-[#e2e8f0] flex items-center justify-between bg-[#fbfcfd]">
              <div className="flex items-center gap-6">
                <h3 className="text-xs font-black uppercase tracking-[0.25em] text-[#102C57]">รายการที่เพิ่งคืนสต็อก</h3>
              </div>
              <button
                type="button"
                onClick={() => void handleReprintLatestLabel()}
                disabled={!latestReturnLabel || isReprintingLatestLabel}
                className="inline-flex h-10 items-center gap-2 border border-[#102C57] px-4 text-xs font-black text-[#102C57] transition hover:bg-[#102C57] hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
              >
                {isReprintingLatestLabel ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
                พิมพ์ฉลากล่าสุดซ้ำ
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-[#d7dde5]">
                <thead>
                  <tr className="bg-[#f8fafc] text-sm font-black uppercase tracking-wider text-black">
                    <th className="border border-[#d7dde5] px-4 py-4 text-center w-16">#</th>
                    <th className="border border-[#d7dde5] px-6 py-4 text-center">รหัสอ้างอิงคืน</th>
                    <th className="border border-[#d7dde5] px-6 py-4 text-center">สินค้า</th>
                    <th className="border border-[#d7dde5] px-6 py-4 text-center">ล็อต</th>
                    <th className="border border-[#d7dde5] px-4 py-4 text-center w-24">จำนวน</th>
                    <th className="border border-[#d7dde5] px-6 py-4 text-center">น้ำหนักคืน</th>
                    <th className="border border-[#d7dde5] px-6 py-4 text-center">เวลาที่คืน</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-bold text-black">
                  {recentReturns.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="border border-[#d7dde5] px-8 py-16 text-center uppercase tracking-widest text-[#a0aec0]">ยังไม่มีรายการคืนสต็อกในรอบนี้</td>
                    </tr>
                  ) : (
                    recentReturns.map((item, index) => (
                      <tr key={`${item.id}-${index}`} className="group hover:bg-[#fbfcfd] transition-colors">
                        <td className="border border-[#d7dde5] px-4 py-4 text-center text-[#7d8795]">
                          {index + 1}
                        </td>
                        <td className="border border-[#d7dde5] px-6 py-4 font-mono text-center">
                          {item.movementNo || item.id.slice(0, 8)}
                        </td>
                        <td className="border border-[#d7dde5] px-6 py-4 text-center whitespace-nowrap">
                          {item.productCode}-{item.productName}
                        </td>
                        <td className="border border-[#d7dde5] px-6 py-4 text-center">{item.lotNo}</td>
                        <td className="border border-[#d7dde5] px-4 py-4 text-center">1</td>
                        <td className="border border-[#d7dde5] px-6 py-4 text-center whitespace-nowrap text-emerald-600">
                          + {formatWeightDisplay(item.weightInKg || item.netWeightKg)} Kg
                        </td>
                        <td className="border border-[#d7dde5] px-6 py-4 text-center">{formatDateTime(item.returnedAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      {isReturnPickerOpen ? (
        <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/60 px-3 py-4 backdrop-blur-sm sm:px-6">
          <div className="flex max-h-[92vh] w-full max-w-[86rem] flex-col overflow-hidden border-2 border-[#d4af37] bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 bg-[#102C57] px-5 py-4 text-white sm:px-7">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[#d4af37]">
                  Stock Return Picker
                </p>
                <h2 className="mt-1 flex items-center gap-3 text-xl font-black sm:text-2xl">
                  <ListChecks size={23} />
                  เลือกรายการที่ชั่งคืนได้
                </h2>
                <p className="mt-1 text-xs font-semibold text-white/60">
                  เลือกได้ครั้งละ 1 บาร์โค้ด แล้วระบบจะตรวจสอบซ้ำก่อนเริ่มชั่ง
                </p>
              </div>
              <button
                type="button"
                onClick={closeReturnPicker}
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center border border-white/20 text-white transition hover:border-[#d4af37] hover:text-[#d4af37]"
                aria-label="ปิดหน้าต่างเลือกรายการชั่งคืน"
              >
                <X size={18} />
              </button>
            </div>

            <div className="border-b border-[#d7dde5] bg-[#fbfcfd] p-4 sm:p-5">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.4fr_1.2fr_auto]">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-black">
                    วันที่เบิกเริ่มต้น
                  </span>
                  <input
                    type="date"
                    value={returnPickerFilters.dateFrom}
                    onChange={(event) => setReturnPickerFilters((current) => ({
                      ...current,
                      dateFrom: event.target.value,
                    }))}
                    className="h-11 w-full border border-[#d7dde5] bg-white px-3 text-sm font-bold text-black outline-none focus:border-[#d4af37]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-black">
                    วันที่เบิกสิ้นสุด
                  </span>
                  <input
                    type="date"
                    value={returnPickerFilters.dateTo}
                    onChange={(event) => setReturnPickerFilters((current) => ({
                      ...current,
                      dateTo: event.target.value,
                    }))}
                    className="h-11 w-full border border-[#d7dde5] bg-white px-3 text-sm font-bold text-black outline-none focus:border-[#d4af37]"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-black">
                    ค้นหา
                  </span>
                  <div className="flex h-11 items-center border border-[#d7dde5] bg-white px-3 focus-within:border-[#d4af37]">
                    <Search size={16} className="text-[#102C57]" />
                    <input
                      type="search"
                      value={returnPickerFilters.search}
                      onChange={(event) => setReturnPickerFilters((current) => ({
                        ...current,
                        search: event.target.value,
                      }))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          handleReturnPickerSearch();
                        }
                      }}
                      placeholder="บาร์โค้ด / สินค้า / LOT"
                      className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm font-bold text-black outline-none"
                    />
                  </div>
                </label>
                <label className="block">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-black">
                    สินค้า
                  </span>
                  <select
                    value={returnPickerFilters.productCode}
                    onChange={(event) => setReturnPickerFilters((current) => ({
                      ...current,
                      productCode: event.target.value,
                    }))}
                    className="h-11 w-full border border-[#d7dde5] bg-white px-3 text-sm font-bold text-black outline-none focus:border-[#d4af37]"
                  >
                    <option value="">สินค้าทั้งหมด</option>
                    {returnPickerProductOptions.map((product) => (
                      <option key={product.code} value={product.code}>
                        {product.code} - {product.name || "-"}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={handleReturnPickerSearch}
                  disabled={isReturnPickerLoading}
                  className="mt-auto inline-flex h-11 items-center justify-center gap-2 bg-[#102C57] px-5 text-xs font-black text-white transition hover:bg-[#173b72] disabled:opacity-50"
                >
                  {isReturnPickerLoading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Search size={16} />
                  )}
                  ค้นหา
                </button>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm font-bold text-[#102C57]">
                <span className="border border-[#d7dde5] bg-white px-4 py-2">
                  คืนได้ {returnPickerSummary.totalCount || 0} รายการ
                </span>
                <span className="border border-[#d7dde5] bg-white px-4 py-2">
                  น้ำหนักคงเหลือ {formatWeightDisplay(returnPickerSummary.totalRemainingWeightKg)} Kg
                </span>
                {returnPickerError ? (
                  <span className="inline-flex items-center gap-2 border border-rose-300 bg-rose-50 px-4 py-2 text-rose-700">
                    <AlertCircle size={16} />
                    {returnPickerError}
                  </span>
                ) : null}
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-auto bg-white">
              <table className="min-w-[78rem] w-full border-collapse">
                <thead className="sticky top-0 z-10 bg-[#f8fafc] text-xs font-black text-black shadow-sm">
                  <tr>
                    <th className="border border-[#d7dde5] px-4 py-3 text-left">บาร์โค้ด</th>
                    <th className="border border-[#d7dde5] px-4 py-3 text-left">สินค้า</th>
                    <th className="border border-[#d7dde5] px-4 py-3 text-center">LOT</th>
                    <th className="border border-[#d7dde5] px-4 py-3 text-center">น้ำหนักเบิก</th>
                    <th className="border border-[#d7dde5] px-4 py-3 text-center">คืนแล้ว</th>
                    <th className="border border-[#d7dde5] px-4 py-3 text-center">ของเสีย</th>
                    <th className="border border-[#d7dde5] px-4 py-3 text-center">คืนได้</th>
                    <th className="border border-[#d7dde5] px-4 py-3 text-center">วันที่เบิก</th>
                    <th className="w-28 border border-[#d7dde5] px-4 py-3 text-center">เลือก</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-bold text-black">
                  {isReturnPickerLoading ? (
                    <tr>
                      <td colSpan={9} className="border border-[#d7dde5] px-6 py-16 text-center text-[#102C57]">
                        <span className="inline-flex items-center gap-2 font-black">
                          <Loader2 size={18} className="animate-spin" />
                          กำลังโหลดรายการที่ชั่งคืนได้...
                        </span>
                      </td>
                    </tr>
                  ) : returnPickerRows.length ? (
                    returnPickerRows.map((row) => (
                      <tr key={row.issueItemId} className="bg-white transition hover:bg-[#fffaf0]">
                        <td className="border border-[#d7dde5] px-4 py-3 font-mono whitespace-nowrap">
                          {row.barcode}
                        </td>
                        <td className="border border-[#d7dde5] px-4 py-3 whitespace-nowrap">
                          {row.productCode} - {row.productName}
                        </td>
                        <td className="border border-[#d7dde5] px-4 py-3 text-center whitespace-nowrap">
                          {row.lotNo || "-"}
                        </td>
                        <td className="border border-[#d7dde5] px-4 py-3 text-center whitespace-nowrap">
                          {formatWeightDisplay(row.originalWeightKg)} Kg
                        </td>
                        <td className="border border-[#d7dde5] px-4 py-3 text-center whitespace-nowrap">
                          {formatWeightDisplay(row.returnedWeightKg)} Kg
                        </td>
                        <td className="border border-[#d7dde5] px-4 py-3 text-center whitespace-nowrap">
                          {formatWeightDisplay(row.wastedWeightKg)} Kg
                        </td>
                        <td className="border border-[#d7dde5] px-4 py-3 text-center font-black text-emerald-700 whitespace-nowrap">
                          {formatWeightDisplay(row.remainingWeightKg)} Kg
                        </td>
                        <td className="border border-[#d7dde5] px-4 py-3 text-center whitespace-nowrap">
                          {formatDateTime(row.issuedAt)}
                        </td>
                        <td className="border border-[#d7dde5] px-4 py-3 text-center">
                          <button
                            type="button"
                            onClick={() => void handlePickedReturnItem(row)}
                            className="h-9 bg-[#d4af37] px-4 text-xs font-black text-[#102C57] transition hover:bg-[#e7c85c]"
                          >
                            เลือก
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="border border-[#d7dde5] px-6 py-16 text-center font-black text-[#94a3b8]">
                        ไม่พบรายการเบิกที่ยังมีน้ำหนักให้ชั่งคืน
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-3 border-t border-[#d7dde5] bg-[#fbfcfd] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <p className="text-xs font-bold text-[#64748b]">
                แสดงเฉพาะใบเบิกที่ยืนยันแล้วและยังมีน้ำหนักให้คืน
              </p>
              <div className="flex items-center gap-2 text-sm font-bold text-[#102C57]">
                <button
                  type="button"
                  onClick={() => handleReturnPickerPageChange(returnPickerPagination.page - 1)}
                  disabled={returnPickerPagination.page <= 1 || isReturnPickerLoading}
                  className="inline-flex h-10 items-center gap-2 border border-[#d7dde5] bg-white px-4 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <ChevronLeft size={16} />
                  ก่อนหน้า
                </button>
                <span className="px-2">
                  หน้า {returnPickerPagination.page || 1} / {returnPickerPagination.totalPages || 1}
                </span>
                <button
                  type="button"
                  onClick={() => handleReturnPickerPageChange(returnPickerPagination.page + 1)}
                  disabled={
                    returnPickerPagination.page >= (returnPickerPagination.totalPages || 1)
                    || isReturnPickerLoading
                  }
                  className="inline-flex h-10 items-center gap-2 border border-[#d7dde5] bg-white px-4 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  ถัดไป
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* Settings Modal */}
      {isSettingsOpen ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 py-6">
          <div className="w-full max-w-xl border-2 border-[#d4af37] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#d7dde5] bg-[#102C57] px-6 py-4 text-white">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#d4af37]">Connection Settings</p>
                <h2 className="mt-2 text-2xl font-light uppercase tracking-[0.04em]">ตั้งค่าเครื่องชั่ง</h2>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center border border-white/20 text-white transition hover:border-[#d4af37] hover:text-[#d4af37]"
              >
                <X size={18} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {CONFIG_FIELDS.map((field) => (
                <label key={field.key} className="block space-y-2">
                  <span className="text-sm font-black uppercase tracking-[0.08em] text-[#4f6076]">{field.label}</span>
                  <input
                    value={scaleConfig[field.key]}
                    onChange={(e) => updateScaleField(field.key, e.target.value)}
                    inputMode={field.inputMode}
                    placeholder={field.placeholder}
                    className="h-12 w-full border border-[#d7dde5] bg-[#fbfcfd] px-4 text-[#102C57] outline-none transition focus:border-[#d4af37] focus:bg-white"
                  />
                </label>
              ))}
              <div className="space-y-3 border-t border-[#d7dde5] pt-4">
                <p className="text-sm font-black uppercase tracking-[0.08em] text-[#4f6076]">โหมดเครื่องพิมพ์</p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setPrintMode("agent");
                      window.localStorage.setItem(PRINT_MODE_STORAGE_KEY, "agent");
                    }}
                    className={`h-11 border text-xs font-black ${printMode === "agent" ? "border-[#d4af37] bg-[#102C57] text-[#f3d67a]" : "border-[#d7dde5] text-[#4f6076]"}`}
                  >
                    LOCAL AGENT
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPrintMode("webusb");
                      window.localStorage.setItem(PRINT_MODE_STORAGE_KEY, "webusb");
                    }}
                    className={`h-11 border text-xs font-black ${printMode === "webusb" ? "border-[#d4af37] bg-[#102C57] text-[#f3d67a]" : "border-[#d7dde5] text-[#4f6076]"}`}
                  >
                    WEBUSB
                  </button>
                </div>

                {printMode === "agent" ? (
                  <div className="space-y-3">
                    <select
                      value={selectedPrinterName}
                      onChange={(event) => setSelectedPrinterName(event.target.value)}
                      disabled={isLoadingPrinters}
                      className="h-12 w-full border border-[#d7dde5] bg-white px-4 text-[#102C57]"
                    >
                      <option value="">เลือกเครื่องพิมพ์ Windows</option>
                      {printerOptions.map((printer) => (
                        <option key={printer.name} value={printer.name}>
                          {printer.name}{printer.isDefault ? " / Default" : ""}{printer.isOffline ? " / Offline" : ""}
                        </option>
                      ))}
                    </select>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => void loadLocalPrinters()}
                        disabled={isLoadingPrinters}
                        className="inline-flex h-11 items-center justify-center gap-2 border border-[#102C57] text-xs font-black text-[#102C57]"
                      >
                        {isLoadingPrinters ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                        โหลดรายการ
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void saveSelectedPrinter().catch((error) => {
                            setPrinterAgentState("offline");
                            setPrinterAgentMessage(error?.message || "ไม่สามารถบันทึกเครื่องพิมพ์ได้");
                          });
                        }}
                        disabled={!selectedPrinterName}
                        className="inline-flex h-11 items-center justify-center gap-2 bg-[#102C57] text-xs font-black text-[#f3d67a] disabled:opacity-40"
                      >
                        <Save size={15} />
                        บันทึกเครื่องพิมพ์
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handlePairUsbDevice()}
                    disabled={isConnectingUsb}
                    className="inline-flex h-12 w-full items-center justify-center gap-2 border border-[#102C57] text-xs font-black text-[#102C57]"
                  >
                    {isConnectingUsb ? <Loader2 size={15} className="animate-spin" /> : <Cable size={15} />}
                    {usbDevice ? usbDeviceName : "เชื่อมต่อเครื่องพิมพ์ USB"}
                  </button>
                )}

                <div className="flex items-center justify-between gap-3 border border-[#d7dde5] bg-[#fbfcfd] px-3 py-2 text-xs text-[#4f6076]">
                  <span>Printer: {printerAgentState}</span>
                  <span className="truncate">{printerAgentMessage || PRINT_AGENT_UNAVAILABLE_MESSAGE}</span>
                </div>
                <button
                  type="button"
                  onClick={() => void handleTestPrint()}
                  disabled={isTestingPrinter || (printMode === "webusb" ? !usbDevice : !selectedPrinterName)}
                  className="inline-flex h-11 w-full items-center justify-center gap-2 border border-[#d4af37] bg-[#fffaf0] text-xs font-black text-[#102C57] disabled:opacity-40"
                >
                  {isTestingPrinter ? <Loader2 size={15} className="animate-spin" /> : <Printer size={15} />}
                  ทดสอบพิมพ์ฉลาก
                </button>
              </div>
              <div className="pt-4 border-t border-[#d7dde5]">
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="w-full h-12 bg-[#102C57] text-[#f3d67a] font-black uppercase tracking-widest hover:bg-[#1a3a6e] transition-colors"
                >
                  ตกลง
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
