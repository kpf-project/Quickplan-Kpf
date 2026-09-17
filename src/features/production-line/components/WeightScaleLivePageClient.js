"use client";
import { assertReceiptCanReprint, isActiveScaleReceipt } from "@/lib/scale-receipt-visibility";
import { fetchScaleReceiptReport } from "@/features/production-line/services/scaleClient";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  CircleHelp,
  List,
  Loader2,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Scale,
  Settings,
  Wifi,
  X,
} from "lucide-react";
import {
  createScaleLot,
  saveScaleProductConfig,
  setScaleCurrentLot,
} from "@/features/production-line/services/scaleClient";
import {
  fetchLocalPrintAgentHealth,
  fetchLocalPrinters,
  printWeightScaleLabelViaAgent,
  saveLocalPrinterSelection,
} from "@/features/production-line/services/localPrintAgentClient";
import {
  fetchScaleAgentHealth,
  fetchScaleAgentPorts,
  fetchScaleAgentSerialConfig,
  getDefaultScaleAgentUrl,
  saveScaleAgentSerialConfig,
  subscribeScaleAgentStream,
} from "@/features/production-line/services/localScaleAgentClient";
import WeightScaleLiveProductPickerModal from "@/features/production-line/components/WeightScaleLiveProductPickerModal";
import { buildWeightScaleReceiptPrintLabel } from "@/features/production-line/services/weightScaleReceiptLabel";
import { saveWeightScaleLiveReceipt } from "@/features/production-line/services/weightScaleLiveClient";

const RECENT_RECEIPTS_LIMIT = 20;
const RAW_LOG_LIMIT = 10;
const STABLE_MIN_READINGS = 5;
const STABLE_WINDOW_MS = 3000;
const STABLE_MIN_SPAN_MS = 1500;
const STABLE_TOLERANCE_KG = 0.002;
const READING_STALE_AFTER_MS = 5000;
const BAUD_RATE_OPTIONS = [2400, 4800, 9600, 19200];
const DATA_BITS_OPTIONS = [7, 8];
const PARITY_OPTIONS = ["none", "even", "odd"];
const STOP_BITS_OPTIONS = [1, 2];
const SCALE_AGENT_UNAVAILABLE_MESSAGE = `ไม่พบ agent ที่ ${getDefaultScaleAgentUrl().replace(/^https?:\/\//, "")}`;
const PRINT_AGENT_UNAVAILABLE_MESSAGE =
  "ยังไม่พบ local print agent ในเครื่องนี้";

const DEFAULT_PRODUCT_PROFILE = Object.freeze({
  lotNo: "",
  passWeightKg: "",
  tareWeightKg: "",
});

const DEFAULT_SERIAL_CONFIG = Object.freeze({
  path: "",
  baudRate: 9600,
  dataBits: 8,
  parity: "none",
  stopBits: 1,
});

function parseWeightNumber(value, fallback = null) {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundToThree(value) {
  return Number(Number(value).toFixed(3));
}

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

function formatTimeOnly(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("th-TH", {
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

function getStatusTone(state) {
  if (state === "connected") {
    return "border-emerald-300 bg-emerald-50 text-emerald-700";
  }
  if (state === "warning") {
    return "border-amber-300 bg-amber-50 text-amber-700";
  }
  if (state === "error") {
    return "border-rose-300 bg-rose-50 text-rose-700";
  }
  return "border-slate-300 bg-slate-50 text-slate-700";
}

function normalizeProductProfile(input = {}) {
  return {
    lotNo: String(input?.lotNo || "").trim(),
    passWeightKg: String(input?.passWeightKg || "").trim(),
    tareWeightKg: String(input?.tareWeightKg || "").trim(),
  };
}

function normalizeProductOptions(products) {
  if (!Array.isArray(products)) {
    return [];
  }

  return products
    .map((product) => {
      const currentLot = product?.currentLot
        ? {
            id: String(product.currentLot.id || "").trim() || null,
            lotNo: String(product.currentLot.lotNo || "").trim(),
            status: String(product.currentLot.status || "").trim(),
          }
        : null;

      return {
        code: String(product?.code || "").trim().toUpperCase(),
        name: String(product?.name || "").trim(),
        unit: String(product?.unit || "").trim(),
        categoryCode: String(product?.categoryCode || "").trim(),
        categoryName: String(product?.categoryName || "").trim(),
        departmentId: String(product?.departmentId || "").trim(),
        departmentCode: String(product?.departmentCode || "").trim().toUpperCase(),
        departmentName: String(product?.departmentName || "").trim(),
        accessRole: String(product?.accessRole || "").trim().toLowerCase(),
        canOperate: Boolean(product?.canOperate),
        isOwner: Boolean(product?.isOwner),
        configId: String(product?.configId || "").trim() || null,
        lotFormat: String(product?.lotFormat || "").trim(),
        amountPerPallet: Number.isFinite(Number(product?.amountPerPallet))
          ? Number(product.amountPerPallet)
          : null,
        currentLotId: String(product?.currentLotId || "").trim() || null,
        currentLot,
        defaultProfile: normalizeProductProfile(product?.defaultProfile),
      };
    })
    .filter((product) => product.code && product.name);
}

function buildInitialProductsState(payload) {
  if (!payload || typeof payload !== "object") {
    return {
      products: [],
      error: "",
    };
  }

  const nextProducts = normalizeProductOptions(payload?.products);
  const accessMessage = String(payload?.access?.message || "").trim();
  return {
    products: nextProducts,
    error:
      accessMessage
      || (nextProducts.length
        ? ""
        : "ไม่พบสินค้า WIP ที่ผูกกับแผนกที่กำหนด"),
  };
}

function normalizeLotOptions(lots) {
  if (!Array.isArray(lots)) {
    return [];
  }

  return lots
    .map((lot) => {
      const code = String(lot?.code || "").trim().toUpperCase();
      const lotNo = String(lot?.lotNo || "").trim();
      if (!code || !lotNo) {
        return null;
      }

      return {
        selectionKey:
          String(lot?.selectionKey || "").trim() || `${code}::${lotNo}`,
        code,
        lotNo,
        productConfigId: String(lot?.productConfigId || "").trim() || null,
        lotId: String(lot?.lotId || lot?.id || "").trim() || null,
        status: String(lot?.status || "").trim() || "active",
        openedAt: lot?.openedAt || null,
        closedAt: lot?.closedAt || null,
        isCurrent: Boolean(lot?.isCurrent),
      };
    })
    .filter(Boolean);
}

function normalizeReceiptOptions(receipts) {
  if (!Array.isArray(receipts)) {
    return [];
  }

  return receipts
    .filter(isActiveScaleReceipt)
    .map((receipt) => {
      const id = String(receipt?.id || "").trim();
      if (!id) {
        return null;
      }

      return {
        id,
        barcode: String(receipt?.barcode || "").trim() || "-",
        productCode: String(receipt?.productCode || "").trim().toUpperCase(),
        productName: String(receipt?.productName || "").trim() || "-",
        lotNo: String(receipt?.lotNo || "").trim() || "-",
        grossWeightKg: parseWeightNumber(receipt?.grossWeightKg, null),
        tareWeightKg: parseWeightNumber(receipt?.tareWeightKg, null),
        netWeightKg: parseWeightNumber(receipt?.netWeightKg, null),
        passWeightKg: parseWeightNumber(receipt?.passWeightKg, null),
        weighedAt: receipt?.weighedAt || null,
        status: String(receipt?.status || "").trim(),
        isTest: Boolean(receipt?.isTest),
      };
    })
    .filter(Boolean);
}

function buildInitialReceiptsState(payload) {
  const emptySummary = {
    totalCount: 0,
    actualCount: 0,
    testCount: 0,
    totalNetWeightKg: 0,
  };

  if (!payload || typeof payload !== "object") {
    return { receipts: [], summary: emptySummary };
  }

  return {
    receipts: normalizeReceiptOptions(payload?.receipts),
    summary: {
      totalCount: Number.isFinite(Number(payload?.summary?.totalCount))
        ? Number(payload.summary.totalCount)
        : 0,
      actualCount: Number.isFinite(Number(payload?.summary?.actualCount))
        ? Number(payload.summary.actualCount)
        : 0,
      testCount: Number.isFinite(Number(payload?.summary?.testCount))
        ? Number(payload.summary.testCount)
        : 0,
      totalNetWeightKg: Number.isFinite(Number(payload?.summary?.totalNetWeightKg))
        ? Number(payload.summary.totalNetWeightKg)
        : 0,
    },
  };
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

function formatPrinterStatus(printer) {
  const statusParts = [];

  if (printer?.isOffline) {
    statusParts.push("ออฟไลน์");
  } else {
    statusParts.push("พร้อมใช้");
  }

  if (printer?.isDefault) {
    statusParts.push("ค่าเริ่มต้น");
  }

  return statusParts.join(" / ");
}

function normalizeSerialPorts(payload) {
  if (!Array.isArray(payload?.ports)) {
    return [];
  }

  return payload.ports
    .map((port) => ({
      path: String(port?.path || "").trim(),
      manufacturer: String(port?.manufacturer || "").trim(),
      friendlyName: String(port?.friendlyName || "").trim(),
      serialNumber: String(port?.serialNumber || "").trim(),
    }))
    .filter((port) => port.path);
}

function normalizeSerialConfig(payload) {
  const baudRate = Number(payload?.baudRate);
  const dataBits = Number(payload?.dataBits);
  const stopBits = Number(payload?.stopBits);
  const parity = String(payload?.parity || "").trim().toLowerCase();

  return {
    path: String(payload?.path || "").trim(),
    baudRate: BAUD_RATE_OPTIONS.includes(baudRate) ? baudRate : 9600,
    dataBits: DATA_BITS_OPTIONS.includes(dataBits) ? dataBits : 8,
    parity: PARITY_OPTIONS.includes(parity) ? parity : "none",
    stopBits: STOP_BITS_OPTIONS.includes(stopBits) ? stopBits : 1,
  };
}

function evaluateWeightReading(reading, productProfile) {
  const grossWeightKg = parseWeightNumber(reading?.weightKg);
  if (!Number.isFinite(grossWeightKg)) {
    return {
      grossWeightKg: null,
      tareWeightKg: null,
      netWeightKg: null,
      passWeightKg: null,
      hasPassWeight: false,
      isPass: null,
      message: "",
    };
  }

  const tareWeightKg = parseWeightNumber(productProfile?.tareWeightKg, 0);
  const passWeightKg = parseWeightNumber(productProfile?.passWeightKg);
  const netWeightKg = roundToThree(Math.max(grossWeightKg - tareWeightKg, 0));
  const hasPassWeight = Number.isFinite(passWeightKg) && passWeightKg > 0;
  const isPass = hasPassWeight ? netWeightKg >= passWeightKg : null;

  if (!hasPassWeight) {
    return {
      grossWeightKg,
      tareWeightKg,
      netWeightKg,
      passWeightKg: null,
      hasPassWeight,
      isPass,
      message: `น้ำหนักสุทธิ ${netWeightKg.toFixed(3)} Kg`,
    };
  }

  if (isPass) {
    return {
      grossWeightKg,
      tareWeightKg,
      netWeightKg,
      passWeightKg,
      hasPassWeight,
      isPass,
      message: `ผ่านเกณฑ์แล้ว: สุทธิ ${netWeightKg.toFixed(3)} / เกณฑ์ ${passWeightKg.toFixed(2)} Kg`,
    };
  }

  return {
    grossWeightKg,
    tareWeightKg,
    netWeightKg,
    passWeightKg,
    hasPassWeight,
    isPass,
    message: `น้ำหนักยังไม่ถึงเกณฑ์: สุทธิ ${netWeightKg.toFixed(3)} / เกณฑ์ ${passWeightKg.toFixed(2)} Kg`,
  };
}

function computeAppStable(buffer) {
  if (buffer.length < STABLE_MIN_READINGS) {
    return false;
  }

  const last = buffer[buffer.length - 1];
  const windowReadings = buffer.filter(
    (reading) => last.atMs - reading.atMs <= STABLE_WINDOW_MS
  );

  if (windowReadings.length < STABLE_MIN_READINGS) {
    return false;
  }

  const first = windowReadings[0];
  if (last.atMs - first.atMs < STABLE_MIN_SPAN_MS) {
    return false;
  }

  let min = Infinity;
  let max = -Infinity;
  windowReadings.forEach((reading) => {
    if (reading.weightKg < min) {
      min = reading.weightKg;
    }
    if (reading.weightKg > max) {
      max = reading.weightKg;
    }
  });

  return max - min <= STABLE_TOLERANCE_KG;
}

export default function WeightScaleLivePageClient({
  initialProductsPayload,
  initialLotsPayload,
  initialReceiptsPayload,
}) {
  const initialProductsState = useMemo(
    () => buildInitialProductsState(initialProductsPayload),
    [initialProductsPayload]
  );
  const initialReceiptsState = useMemo(
    () => buildInitialReceiptsState(initialReceiptsPayload),
    [initialReceiptsPayload]
  );

  const [products, setProducts] = useState(initialProductsState.products);
  const [productsError, setProductsError] = useState(initialProductsState.error);
  const [lotOptions, setLotOptions] = useState(() =>
    normalizeLotOptions(initialLotsPayload?.lots)
  );
  const [recentReceipts, setRecentReceipts] = useState(initialReceiptsState.receipts);
  const [recentSummary, setRecentSummary] = useState(initialReceiptsState.summary);

  const [selectedProductCode, setSelectedProductCode] = useState("");
  const [productProfile, setProductProfile] = useState(DEFAULT_PRODUCT_PROFILE);
  const [productError, setProductError] = useState("");
  const [productSearchTerm, setProductSearchTerm] = useState("");

  const [liveReading, setLiveReading] = useState(null);
  const [isStable, setIsStable] = useState(false);
  const [isReadingFresh, setIsReadingFresh] = useState(false);
  const [agentConnected, setAgentConnected] = useState(false);
  const [portOpen, setPortOpen] = useState(null);
  const [scaleAgentError, setScaleAgentError] = useState("");
  const [rawLog, setRawLog] = useState([]);

  const [serialConfig, setSerialConfig] = useState(DEFAULT_SERIAL_CONFIG);
  const [serialPorts, setSerialPorts] = useState([]);
  const [scaleAgentState, setScaleAgentState] = useState("offline");
  const [isLoadingSerial, setIsLoadingSerial] = useState(false);
  const [isSavingSerial, setIsSavingSerial] = useState(false);
  const [serialMessage, setSerialMessage] = useState("");

  const [printerOptions, setPrinterOptions] = useState([]);
  const [selectedPrinterName, setSelectedPrinterName] = useState("");
  const [printerAgentState, setPrinterAgentState] = useState("offline");
  const [printerAgentMessage, setPrinterAgentMessage] = useState("");
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
  const [isSavingPrinter, setIsSavingPrinter] = useState(false);
  const [reprintingReceiptId, setReprintingReceiptId] = useState("");
  const [printStatusByReceiptId, setPrintStatusByReceiptId] = useState({});

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isProductSetupOpen, setIsProductSetupOpen] = useState(false);
  const [isSavingWeight, setIsSavingWeight] = useState(false);
  const [isSavingProductConfig, setIsSavingProductConfig] = useState(false);
  const [status, setStatus] = useState({
    connected: false,
    state: "idle",
    message: "",
    readAt: null,
  });

  const readingsRef = useRef([]);
  const rawLogIdRef = useRef(0);
  const readingFreshnessTimerRef = useRef(null);
  const receiptRequestIdRef = useRef(null);

  const selectedProduct = useMemo(
    () => products.find((product) => product.code === selectedProductCode) || null,
    [products, selectedProductCode]
  );
  const selectedDepartmentId = selectedProduct?.departmentId || null;
  const canOperate = Boolean(selectedProduct?.canOperate);

  const selectedProductLots = useMemo(
    () => lotOptions.filter((lot) => lot.code === selectedProductCode),
    [lotOptions, selectedProductCode]
  );

  const selectedLotOption = useMemo(
    () =>
      selectedProductLots.find((lot) => lot.lotNo === productProfile.lotNo)
      || null,
    [selectedProductLots, productProfile.lotNo]
  );

  const filteredProducts = useMemo(() => {
    const searchTerm = String(productSearchTerm || "").trim().toLowerCase();
    if (!searchTerm) {
      return products;
    }

    return products.filter((product) =>
      [
        product.code,
        product.name,
        product.departmentCode,
        product.departmentName,
      ].some((value) => String(value || "").toLowerCase().includes(searchTerm))
    );
  }, [productSearchTerm, products]);

  const currentWeightEvaluation = useMemo(
    () => evaluateWeightReading(liveReading, productProfile),
    [liveReading, productProfile]
  );

  const canSave = Boolean(
    canOperate
    && selectedProduct
    && productProfile.lotNo
    && agentConnected
    && portOpen !== false
    && isReadingFresh
    && isStable
    && Number.isFinite(currentWeightEvaluation.grossWeightKg)
    && currentWeightEvaluation.grossWeightKg > 0
  );

  const stabilityPercentage = isStable
    ? 100
    : isReadingFresh
      ? Math.min(
          99,
          Math.round((readingsRef.current.length / STABLE_MIN_READINGS) * 100)
        )
      : 0;

  // Initialize profile when the selected product changes.
  useEffect(() => {
    if (!selectedProduct) {
      setProductProfile(DEFAULT_PRODUCT_PROFILE);
      return;
    }

    const baseProfile = normalizeProductProfile(selectedProduct.defaultProfile);
    setProductProfile({
      lotNo: baseProfile.lotNo || selectedProduct.currentLot?.lotNo || "",
      passWeightKg: baseProfile.passWeightKg,
      tareWeightKg: baseProfile.tareWeightKg,
    });
    setProductError("");
  }, [selectedProductCode, selectedProduct]);

  // Subscribe to the serial scale agent stream with auto-reconnect.
  useEffect(() => {
    const unsubscribe = subscribeScaleAgentStream({
      onOpen: () => {
        setAgentConnected(true);
        setScaleAgentState("online");
        setScaleAgentError("");
      },
      onClose: () => {
        setAgentConnected(false);
        setScaleAgentState("offline");
        setIsStable(false);
        setIsReadingFresh(false);
        readingsRef.current = [];
        if (readingFreshnessTimerRef.current) {
          clearTimeout(readingFreshnessTimerRef.current);
          readingFreshnessTimerRef.current = null;
        }
      },
      onError: () => {
        setScaleAgentState("offline");
      },
      onStatus: (payload) => {
        setPortOpen(Boolean(payload?.portOpen));
        setScaleAgentError(String(payload?.error || "").trim());
      },
      onReading: (payload) => {
        const parsedWeight = Number(payload?.weightKg);
        const weightKg = Number.isFinite(parsedWeight) ? parsedWeight : null;
        const atMs = Date.parse(payload?.at) || Date.now();
        const at = payload?.at || new Date(atMs).toISOString();

        setLiveReading({
          weightKg,
          unit: payload?.unit || null,
          raw: String(payload?.raw || ""),
          at,
        });
        setIsReadingFresh(true);
        if (readingFreshnessTimerRef.current) {
          clearTimeout(readingFreshnessTimerRef.current);
        }
        readingFreshnessTimerRef.current = setTimeout(() => {
          setIsReadingFresh(false);
          setIsStable(false);
          readingsRef.current = [];
          readingFreshnessTimerRef.current = null;
        }, READING_STALE_AFTER_MS);

        rawLogIdRef.current += 1;
        const logEntry = {
          id: rawLogIdRef.current,
          at,
          raw: String(payload?.raw || ""),
          weightKg,
          unit: payload?.unit || null,
        };
        setRawLog((current) => [logEntry, ...current].slice(0, RAW_LOG_LIMIT));

        if (weightKg === null) {
          readingsRef.current = [];
          setIsStable(false);
          return;
        }

        readingsRef.current.push({ weightKg, atMs });
        readingsRef.current = readingsRef.current.filter(
          (reading) => atMs - reading.atMs <= STABLE_WINDOW_MS * 2
        );

        if (payload?.stable === true || payload?.stable === false) {
          setIsStable(payload.stable);
          return;
        }

        setIsStable(computeAppStable(readingsRef.current));
      },
    });

    return () => {
      if (readingFreshnessTimerRef.current) {
        clearTimeout(readingFreshnessTimerRef.current);
        readingFreshnessTimerRef.current = null;
      }
      unsubscribe();
    };
  }, []);

  async function loadScaleAgentSettings() {
    setIsLoadingSerial(true);
    setSerialMessage("");

    try {
      const [healthResult, portsResult, configResult] = await Promise.all([
        fetchScaleAgentHealth(),
        fetchScaleAgentPorts(),
        fetchScaleAgentSerialConfig(),
      ]);

      setSerialPorts(normalizeSerialPorts(portsResult));
      setSerialConfig(normalizeSerialConfig(configResult));
      setPortOpen(Boolean(healthResult?.portOpen));
      setScaleAgentState("online");
      setScaleAgentError(String(healthResult?.error || "").trim());
    } catch (error) {
      setScaleAgentState("offline");
      setSerialMessage(error?.message || SCALE_AGENT_UNAVAILABLE_MESSAGE);
    } finally {
      setIsLoadingSerial(false);
    }
  }

  async function loadLocalPrinters() {
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
          ? "พร้อมใช้งาน local print agent"
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
  }

  useEffect(() => {
    void loadScaleAgentSettings();
    void loadLocalPrinters();
    // Load agent settings once on mount.
  }, []);

  async function handleSaveSerialConfig() {
    if (!serialConfig.path) {
      setSerialMessage("กรุณาเลือกพอร์ต COM ก่อนบันทึก");
      return;
    }

    setIsSavingSerial(true);
    setSerialMessage("");

    try {
      const result = await saveScaleAgentSerialConfig({
        path: serialConfig.path,
        baudRate: serialConfig.baudRate,
        dataBits: serialConfig.dataBits,
        parity: serialConfig.parity,
        stopBits: serialConfig.stopBits,
      });
      setSerialConfig(normalizeSerialConfig(result?.config || result));
      setSerialMessage("บันทึกค่า serial และเปิดพอร์ตใหม่เรียบร้อยแล้ว");
    } catch (error) {
      setSerialMessage(error?.message || "ไม่สามารถบันทึกค่า serial ได้");
    } finally {
      setIsSavingSerial(false);
    }
  }

  async function handleSavePrinterSelection() {
    if (!selectedPrinterName) {
      setPrinterAgentMessage("กรุณาเลือกเครื่องพิมพ์ก่อนบันทึก");
      return;
    }

    setIsSavingPrinter(true);

    try {
      await saveLocalPrinterSelection({ printerName: selectedPrinterName });
      setPrinterAgentState("online");
      setPrinterAgentMessage(`บันทึกเครื่องพิมพ์ ${selectedPrinterName} เรียบร้อยแล้ว`);
    } catch (error) {
      setPrinterAgentState("offline");
      setPrinterAgentMessage(error?.message || "ไม่สามารถบันทึกเครื่องพิมพ์ได้");
    } finally {
      setIsSavingPrinter(false);
    }
  }

  async function persistSelectedProductConfig() {
    const result = await saveScaleProductConfig({
        departmentId: selectedDepartmentId,
        skuCode: selectedProductCode,
        lotFormat: selectedProduct?.lotFormat || null,
        passWeightKg: productProfile.passWeightKg,
        tareWeightKg: productProfile.tareWeightKg,
        amountPerPallet: selectedProduct?.amountPerPallet,
        status: "พร้อมใช้งาน",
      });

    const productConfigId = String(
      result?.config?.id
      || result?.config?.configId
      || selectedProduct?.configId
      || ""
    ).trim();
    if (!productConfigId) {
      throw new Error("ไม่พบรหัสการตั้งค่าผลิตภัณฑ์สำหรับบันทึกผลชั่ง");
    }

    setProducts((current) =>
      current.map((product) =>
        product.code === selectedProductCode
          ? {
              ...product,
              configId: productConfigId,
              defaultProfile: normalizeProductProfile({
                ...product.defaultProfile,
                passWeightKg: productProfile.passWeightKg,
                tareWeightKg: productProfile.tareWeightKg,
              }),
            }
          : product
      )
    );

    return productConfigId;
  }

  function openProductSetup() {
    setProductSearchTerm("");
    setProductError("");
    setIsProductSetupOpen(true);
  }

  function selectProductForSetup(productCode) {
    setProductError("");
    setSelectedProductCode(productCode);
  }

  async function saveProductPickerSetup() {
    if (!canOperate) {
      setProductError("บัญชีนี้ไม่มีสิทธิ์ตั้งค่าการชั่งของแผนกสินค้านี้");
      return;
    }

    if (!selectedProduct || !selectedDepartmentId) {
      setProductError("กรุณาเลือกสินค้าก่อนเริ่มชั่ง");
      return;
    }

    const nextLotNo = String(productProfile.lotNo || "").trim();
    if (!nextLotNo) {
      setProductError("กรุณาระบุ LOT ปัจจุบันก่อนเริ่มชั่ง");
      return;
    }

    setIsSavingProductConfig(true);
    setProductError("");

    try {
      const productConfigId = await persistSelectedProductConfig();
      const existingLot = selectedProductLots.find(
        (lot) => lot.lotNo === nextLotNo
      );
      let currentLot;

      if (existingLot?.lotId) {
        if (!existingLot.isCurrent) {
          await setScaleCurrentLot({
            productConfigId,
            lotId: existingLot.lotId,
          });
        }
        currentLot = {
          id: existingLot.lotId,
          lotNo: existingLot.lotNo,
          status: existingLot.status,
          openedAt: existingLot.openedAt,
          closedAt: existingLot.closedAt,
        };
      } else {
        const result = await createScaleLot({
          productConfigId,
          lotNo: nextLotNo,
          setAsCurrent: true,
        });
        currentLot = {
          id: result.lot.id,
          lotNo: result.lot.lotNo,
          status: result.lot.status,
          openedAt: result.lot.openedAt,
          closedAt: result.lot.closedAt,
        };
      }

      setLotOptions((current) =>
        normalizeLotOptions(
          current
            .map((lot) =>
              lot.code === selectedProductCode
                ? { ...lot, isCurrent: lot.lotId === currentLot.id }
                : lot
            )
            .concat(
              existingLot
                ? []
                : [{
                    selectionKey: `${selectedProductCode}::${currentLot.lotNo}`,
                    code: selectedProductCode,
                    lotNo: currentLot.lotNo,
                    productConfigId,
                    lotId: currentLot.id,
                    status: currentLot.status,
                    openedAt: currentLot.openedAt,
                    closedAt: currentLot.closedAt,
                    isCurrent: true,
                  }]
            )
        )
      );
      setProducts((current) =>
        current.map((product) =>
          product.code === selectedProductCode
            ? {
                ...product,
                configId: productConfigId,
                currentLotId: currentLot.id,
                currentLot,
                defaultProfile: normalizeProductProfile({
                  ...product.defaultProfile,
                  lotNo: currentLot.lotNo,
                  tareWeightKg: productProfile.tareWeightKg,
                }),
              }
            : product
        )
      );
      setProductProfile((current) => ({
        ...current,
        lotNo: currentLot.lotNo,
      }));
      setStatus({
        connected: agentConnected,
        state: "connected",
        message: "ตั้งค่าสินค้า LOT และน้ำหนักภาชนะพร้อมเริ่มชั่งแล้ว",
        readAt: new Date().toISOString(),
      });
      setIsProductSetupOpen(false);
    } catch (error) {
      setProductError(error?.message || "ไม่สามารถตั้งค่าสินค้าก่อนเริ่มชั่งได้");
    } finally {
      setIsSavingProductConfig(false);
    }
  }

  async function resolveActiveLotId(productConfigId) {
    if (selectedLotOption?.lotId) {
      return selectedLotOption.lotId;
    }

    const nextLotNo = String(productProfile.lotNo || "").trim();
    const result = await createScaleLot({
      productConfigId,
      lotNo: nextLotNo,
      setAsCurrent: true,
    });

    const nextLot = {
      selectionKey: `${selectedProductCode}::${result.lot.lotNo}`,
      code: selectedProductCode,
      lotNo: result.lot.lotNo,
      productConfigId,
      lotId: result.lot.id,
      status: result.lot.status,
      openedAt: result.lot.openedAt,
      closedAt: result.lot.closedAt,
      isCurrent: true,
    };

    setLotOptions((current) =>
      normalizeLotOptions(
        current
          .map((lot) =>
            lot.code === selectedProductCode
              ? { ...lot, isCurrent: false }
              : lot
          )
          .concat(nextLot)
      )
    );

    return result.lot.id;
  }

  async function handleSaveWeightResult() {
    if (!canOperate) {
      setProductError("บัญชีนี้ไม่มีสิทธิ์บันทึกการชั่งรับเข้าของแผนกสินค้านี้");
      return;
    }

    if (!selectedProduct) {
      setProductError("กรุณาเลือกผลิตภัณฑ์ก่อนบันทึกผลชั่ง");
      return;
    }

    if (!productProfile.lotNo) {
      setProductError("กรุณาระบุ LOT ก่อนบันทึกผลชั่ง");
      return;
    }

    if (!Number.isFinite(currentWeightEvaluation.grossWeightKg)) {
      setStatus({
        connected: agentConnected,
        state: "warning",
        message: "กรุณาอ่านน้ำหนักก่อนบันทึกผลชั่ง",
        readAt: new Date().toISOString(),
      });
      return;
    }

    if (!selectedDepartmentId) {
      setStatus({
        connected: agentConnected,
        state: "warning",
        message: "ไม่พบแผนกสำหรับบันทึกผลชั่ง",
        readAt: new Date().toISOString(),
      });
      return;
    }

    setIsSavingWeight(true);
    setProductError("");

    try {
      const productConfigId = await persistSelectedProductConfig();
      const activeLotId = await resolveActiveLotId(productConfigId);

      const result = await saveWeightScaleLiveReceipt({
        requestId: receiptRequestIdRef.current || (receiptRequestIdRef.current = crypto.randomUUID()),
        departmentId: selectedDepartmentId,
        productConfigId,
        lotId: activeLotId,
        grossWeightKg: currentWeightEvaluation.grossWeightKg,
        tareWeightKg: currentWeightEvaluation.tareWeightKg,
        netWeightKg: currentWeightEvaluation.netWeightKg,
        passWeightKg: currentWeightEvaluation.passWeightKg,
        amountPerPallet: selectedProduct.amountPerPallet,
        recentLimit: RECENT_RECEIPTS_LIMIT,
        recentWeightSource: "serial-live",
        metadata: {
          productCode: selectedProduct.code,
          productName: selectedProduct.name,
          lotNo: productProfile.lotNo || null,
          unit: selectedProduct.unit || null,
          departmentCode: selectedProduct.departmentCode || null,
          departmentName: selectedProduct.departmentName || null,
          scaleHost: "local-scale-agent",
          scalePort: serialConfig.path || null,
          isTest: false,
          weightSource: "serial-live",
        },
      });

      setRecentReceipts(normalizeReceiptOptions(result?.recentReceipts));
      receiptRequestIdRef.current = null;
      setRecentSummary({
        totalCount: Number.isFinite(Number(result?.recentSummary?.totalCount))
          ? Number(result.recentSummary.totalCount)
          : 0,
        actualCount: Number.isFinite(Number(result?.recentSummary?.actualCount))
          ? Number(result.recentSummary.actualCount)
          : 0,
        testCount: Number.isFinite(Number(result?.recentSummary?.testCount))
          ? Number(result.recentSummary.testCount)
          : 0,
        totalNetWeightKg: Number.isFinite(Number(result?.recentSummary?.totalNetWeightKg))
          ? Number(result.recentSummary.totalNetWeightKg)
          : 0,
      });

      const nextPrintLabel = buildWeightScaleReceiptPrintLabel({
        receipt: result?.receipt,
        selectedProduct,
        unitLabel: "กก.",
      });

      let printErrorMessage = "";
      if (nextPrintLabel) {
        try {
          await printWeightScaleLabelViaAgent(nextPrintLabel);
          setPrinterAgentState("online");
          setPrinterAgentMessage("ส่งคำสั่งพิมพ์ฉลากอัตโนมัติเรียบร้อยแล้ว");
          if (result?.receipt?.id) {
            setPrintStatusByReceiptId((current) => ({
              ...current,
              [result.receipt.id]: "success",
            }));
          }
        } catch (printError) {
          setPrinterAgentState("offline");
          printErrorMessage =
            printError?.message || "ไม่สามารถพิมพ์ฉลากผ่าน local print agent ได้";
          setPrinterAgentMessage(printErrorMessage);
          if (result?.receipt?.id) {
            setPrintStatusByReceiptId((current) => ({
              ...current,
              [result.receipt.id]: "failed",
            }));
          }
        }
      }

      setStatus({
        connected: true,
        state: printErrorMessage ? "warning" : "connected",
        message: printErrorMessage
          ? `บันทึกผลชั่งสำเร็จ${result?.receipt?.barcode ? ` (${result.receipt.barcode})` : ""} แต่พิมพ์ฉลากอัตโนมัติไม่สำเร็จ: ${printErrorMessage}`
          : `บันทึกผลชั่งสำเร็จ${result?.receipt?.barcode ? ` (${result.receipt.barcode})` : ""} และส่งงานพิมพ์เรียบร้อย`,
        readAt:
          result?.receipt?.weighedAt
          || liveReading?.at
          || new Date().toISOString(),
      });
    } catch (error) {
      setStatus({
        connected: agentConnected,
        state: "error",
        message: error?.message || "ไม่สามารถบันทึกผลชั่งได้",
        readAt: new Date().toISOString(),
      });
    } finally {
      setIsSavingWeight(false);
    }
  }

  async function handleReprintReceipt(receipt) {
    if (!receipt?.id || !receipt?.barcode || receipt.barcode === "-") {
      setStatus({
        connected: agentConnected,
        state: "warning",
        message: "รายการนี้ไม่มีเลขบาร์โค้ดสำหรับพิมพ์ซ้ำ",
        readAt: new Date().toISOString(),
      });
      return;
    }

    const receiptProduct =
      products.find((product) => product.code === receipt.productCode) || null;
    const printLabel = buildWeightScaleReceiptPrintLabel({
      receipt,
      selectedProduct: receiptProduct,
      unitLabel: "กก.",
    });
    if (!printLabel) {
      return;
    }

    setReprintingReceiptId(receipt.id);
    try {
      await assertReceiptCanReprint(receipt, fetchScaleReceiptReport);
      await printWeightScaleLabelViaAgent(printLabel);
      setPrinterAgentState("online");
      setPrinterAgentMessage(`พิมพ์บาร์โค้ด ${receipt.barcode} ซ้ำเรียบร้อยแล้ว`);
      setPrintStatusByReceiptId((current) => ({
        ...current,
        [receipt.id]: "success",
      }));
      setStatus({
        connected: agentConnected,
        state: "connected",
        message: `ส่งพิมพ์บาร์โค้ด ${receipt.barcode} ซ้ำเรียบร้อยแล้ว`,
        readAt: new Date().toISOString(),
      });
    } catch (error) {
      setPrinterAgentState("offline");
      setPrinterAgentMessage(
        error?.message || "ไม่สามารถพิมพ์ฉลากผ่าน local print agent ได้"
      );
      setPrintStatusByReceiptId((current) => ({
        ...current,
        [receipt.id]: "failed",
      }));
      setStatus({
        connected: agentConnected,
        state: "warning",
        message:
          error?.message || "ไม่สามารถพิมพ์ฉลากผ่าน local print agent ได้",
        readAt: new Date().toISOString(),
      });
    } finally {
      setReprintingReceiptId("");
    }
  }

  function handleStartNewCycle() {
    readingsRef.current = [];
    setIsStable(false);
    setProductError("");
    setStatus({
      connected: agentConnected,
      state: agentConnected ? "connected" : "idle",
      message: "เริ่มรอบชั่งใหม่แล้ว กรุณาวางสินค้าบนเครื่องชั่ง",
      readAt: new Date().toISOString(),
    });
  }

  async function handleReconnect() {
    setIsSettingsOpen(true);
    await loadScaleAgentSettings();
  }

  return (
    <div className="min-h-screen bg-white text-[#0f172a]">
      <header className="flex min-h-20 items-center justify-between gap-5 border-b border-white/10 bg-[#001F3F] px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-5 lg:gap-8">
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded border border-white/20 text-[#E9C349]">
              <Scale size={25} strokeWidth={2.3} />
            </div>
            <div className="leading-none">
              <p className="text-sm font-black tracking-[0.12em] text-[#E9C349]">
                KPF WEIGH
              </p>
              <p className="mt-1 text-xl font-black text-white">
                PRO{" "}
                <span className="text-[10px] font-medium text-slate-400">รับเข้าผลิตภัณฑ์</span>
              </p>
            </div>
          </div>

          <div className="hidden h-10 w-px bg-white/10 sm:block" />

          <div className="hidden min-w-0 items-center gap-6 md:flex">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase text-slate-400">สินค้า</p>
              <p className="max-w-64 truncate text-sm font-black text-white">
                {selectedProduct?.name || "ยังไม่ได้เลือกสินค้า"}
              </p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase text-slate-400">รหัส / LOT</p>
              <p className="truncate text-sm font-black text-slate-200">
                {selectedProduct?.code || "-"}
                <span className="mx-2 text-slate-600">|</span>
                {productProfile.lotNo || "-"}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase text-slate-400">ภาชนะ</p>
              <p className="text-sm font-black text-[#E9C349]">
                {formatWeightDisplay(productProfile.tareWeightKg)} kg
              </p>
            </div>
          </div>
        </div>

        <div className="shrink-0 text-right">
          <div className="flex items-center justify-end gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                agentConnected && portOpen !== false
                  ? "bg-emerald-500"
                  : "bg-rose-500"
              }`}
            />
            <span
              className={`text-[11px] font-black uppercase ${
                agentConnected && portOpen !== false
                  ? "text-emerald-400"
                  : "text-rose-300"
              }`}
            >
              {agentConnected && portOpen !== false
                ? "ระบบพร้อมทำงาน"
                : "ยังไม่เชื่อมต่อ"}
            </span>
          </div>
          <p className="mt-1 text-xs font-semibold text-slate-400">
            {serialConfig.path || "ยังไม่ได้เลือกพอร์ต"}
          </p>
        </div>
      </header>

      <section className="relative flex min-h-[310px] flex-col items-center justify-center overflow-hidden bg-[#001F3F] px-4 py-8 text-center">
        <div className="relative z-10 flex w-full max-w-5xl flex-col items-center">
          <div className="mb-3 flex w-full max-w-md items-center justify-center gap-3">
            <p className="text-[11px] font-black uppercase tracking-[0.3em] text-slate-400">
              ความนิ่งของน้ำหนัก: {stabilityPercentage}%
            </p>
            <div className="h-1 w-40 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full transition-[width] duration-200 ${
                  isStable ? "bg-[#E9C349]" : "bg-rose-400"
                }`}
                style={{ width: `${stabilityPercentage}%` }}
              />
            </div>
          </div>

          <div className="flex items-baseline justify-center gap-2 sm:gap-4">
            <span
              className={`tabular-nums text-[5.5rem] font-black leading-none tracking-[-0.06em] sm:text-[8rem] lg:text-[10rem] ${
                currentWeightEvaluation.isPass
                  ? "text-emerald-400"
                  : currentWeightEvaluation.isPass === false
                    ? "text-rose-400"
                    : "text-[#E9C349]"
              }`}
              style={{ textShadow: "0 0 36px rgba(233,195,73,0.26)" }}
            >
              {Number.isFinite(currentWeightEvaluation.grossWeightKg)
                ? currentWeightEvaluation.grossWeightKg.toFixed(3)
                : "0.000"}
            </span>
            <span className="text-3xl font-black text-[#E9C349]/50 sm:text-4xl">kg</span>
          </div>

          <div className="mt-5 grid w-full max-w-xl grid-cols-3 divide-x divide-white/10">
            <div className="px-3 text-center">
              <p className="text-[10px] font-black uppercase text-slate-500">ภาชนะ</p>
              <p className="mt-1 text-lg font-black text-rose-400">
                {formatWeightDisplay(currentWeightEvaluation.tareWeightKg)}
              </p>
            </div>
            <div className="px-3 text-center">
              <p className="text-[10px] font-black uppercase text-slate-500">น้ำหนักสุทธิ</p>
              <p className="mt-1 text-2xl font-black text-white">
                {formatWeightDisplay(currentWeightEvaluation.netWeightKg)}
              </p>
            </div>
            <div className="px-3 text-center">
              <p className="text-[10px] font-black uppercase text-slate-500">เกณฑ์ขั้นต่ำ</p>
              <p className="mt-1 text-lg font-black text-rose-400">
                {formatWeightDisplay(currentWeightEvaluation.passWeightKg)}
              </p>
            </div>
          </div>

          <p
            className={`mt-4 text-sm font-black ${
              currentWeightEvaluation.isPass
                ? "text-emerald-400"
                : currentWeightEvaluation.isPass === false
                  ? "text-rose-400"
                  : "text-slate-400"
            }`}
          >
            {currentWeightEvaluation.message || "กรุณาวางสินค้าบนเครื่องชั่ง"}
          </p>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-slate-200 bg-slate-50 px-4 py-2 sm:px-6">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleStartNewCycle}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-sm bg-[#E9C349] px-5 text-sm font-black text-[#001F3F] transition hover:brightness-105"
          >
            <Plus size={18} />
            เริ่มรอบใหม่
          </button>
          <button
            type="button"
            onClick={openProductSetup}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-sm border border-slate-300 bg-white px-5 text-sm font-black text-[#001F3F] transition hover:border-[#E9C349]"
          >
            <ArrowLeftRight size={18} />
            เปลี่ยนสินค้า
          </button>
          <button
            type="button"
            onClick={() => void handleReconnect()}
            disabled={isLoadingSerial}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-sm border border-slate-300 bg-white px-5 text-sm font-black text-[#001F3F] transition hover:border-[#E9C349] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoadingSerial ? <Loader2 size={18} className="animate-spin" /> : <Wifi size={18} />}
            เชื่อมต่อ
          </button>
          <button
            type="button"
            onClick={() => void handleSaveWeightResult()}
            disabled={isSavingWeight || !canSave}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-sm bg-[#001F3F] px-5 text-sm font-black text-white transition hover:bg-[#0a3158] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {isSavingWeight ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
            บันทึกและพิมพ์บาร์โค้ด
          </button>
        </div>

        <div className="flex items-center gap-1 text-slate-500">
          <button
            type="button"
            onClick={() => setIsSettingsOpen((current) => !current)}
            className="flex h-10 w-10 items-center justify-center rounded-sm transition hover:bg-slate-200 hover:text-[#001F3F]"
            aria-label="ตั้งค่าการเชื่อมต่อ"
          >
            <Settings size={22} />
          </button>
          <button
            type="button"
            onClick={() => setStatus({
              connected: agentConnected,
              state: "idle",
              message: canSave
                ? "ระบบพร้อมบันทึกเมื่อค่าน้ำหนักนิ่ง"
                : "กรุณาเลือกสินค้า ระบุ LOT และตรวจสอบการเชื่อมต่อเครื่องชั่ง",
              readAt: new Date().toISOString(),
            })}
            className="flex h-10 w-10 items-center justify-center rounded-sm transition hover:bg-slate-200 hover:text-[#001F3F]"
            aria-label="คำแนะนำการใช้งาน"
          >
            <CircleHelp size={22} />
          </button>
        </div>
      </div>

      <div className="px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-5">
          {isSettingsOpen ? (
            <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#001F3F]/70 p-3 sm:p-6">
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="scale-settings-title"
                className="max-h-[92dvh] w-full max-w-6xl overflow-y-auto rounded-lg border border-white/20 bg-white shadow-2xl"
              >
                <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-white/10 bg-[#001F3F] px-5 py-4 text-white sm:px-6">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#E9C349]">
                      ตั้งค่า
                    </p>
                    <h2 id="scale-settings-title" className="mt-1 text-lg font-black sm:text-xl">
                      Serial / เครื่องพิมพ์ / ทดสอบการเชื่อมต่อ
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsSettingsOpen(false)}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-white/20 text-white transition hover:border-[#E9C349] hover:text-[#E9C349]"
                    aria-label="ปิดหน้าต่างตั้งค่า"
                  >
                    <X size={22} />
                  </button>
                </div>

              <div className="grid gap-4 p-4 lg:grid-cols-3">
                <div className="border border-[#d7dde5] bg-[#fbfcfd] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-black uppercase tracking-[0.08em] text-[#4f6076]">
                      ตั้งค่า Serial
                    </p>
                    <span
                      className={`inline-flex items-center border px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${
                        scaleAgentState === "online"
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                          : "border-rose-300 bg-rose-50 text-rose-700"
                      }`}
                    >
                      Scale Agent: {scaleAgentState === "online" ? "ออนไลน์" : "ออฟไลน์"}
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    <label className="block space-y-1">
                      <span className="text-xs font-bold text-[#4f6076]">พอร์ต COM</span>
                      <select
                        value={serialConfig.path}
                        onChange={(event) =>
                          setSerialConfig((current) => ({
                            ...current,
                            path: event.target.value,
                          }))
                        }
                        disabled={isLoadingSerial}
                        className="h-11 w-full border border-[#d7dde5] bg-white px-3 text-sm text-[#102C57] outline-none transition focus:border-[#d4af37] disabled:bg-[#f1f5f9]"
                      >
                        <option value="">
                          {isLoadingSerial ? "กำลังโหลดพอร์ต..." : "เลือกพอร์ต COM"}
                        </option>
                        {serialPorts.map((port) => (
                          <option key={port.path} value={port.path}>
                            {port.path}
                            {port.friendlyName ? ` / ${port.friendlyName}` : ""}
                            {port.manufacturer ? ` (${port.manufacturer})` : ""}
                          </option>
                        ))}
                      </select>
                    </label>

                    <div className="grid grid-cols-2 gap-3">
                      <label className="block space-y-1">
                        <span className="text-xs font-bold text-[#4f6076]">Baud rate</span>
                        <select
                          value={serialConfig.baudRate}
                          onChange={(event) =>
                            setSerialConfig((current) => ({
                              ...current,
                              baudRate: Number(event.target.value),
                            }))
                          }
                          className="h-11 w-full border border-[#d7dde5] bg-white px-3 text-sm text-[#102C57] outline-none transition focus:border-[#d4af37]"
                        >
                          {BAUD_RATE_OPTIONS.map((baudRate) => (
                            <option key={baudRate} value={baudRate}>
                              {baudRate}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block space-y-1">
                        <span className="text-xs font-bold text-[#4f6076]">Data bits</span>
                        <select
                          value={serialConfig.dataBits}
                          onChange={(event) =>
                            setSerialConfig((current) => ({
                              ...current,
                              dataBits: Number(event.target.value),
                            }))
                          }
                          className="h-11 w-full border border-[#d7dde5] bg-white px-3 text-sm text-[#102C57] outline-none transition focus:border-[#d4af37]"
                        >
                          {DATA_BITS_OPTIONS.map((dataBits) => (
                            <option key={dataBits} value={dataBits}>
                              {dataBits}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block space-y-1">
                        <span className="text-xs font-bold text-[#4f6076]">Parity</span>
                        <select
                          value={serialConfig.parity}
                          onChange={(event) =>
                            setSerialConfig((current) => ({
                              ...current,
                              parity: event.target.value,
                            }))
                          }
                          className="h-11 w-full border border-[#d7dde5] bg-white px-3 text-sm text-[#102C57] outline-none transition focus:border-[#d4af37]"
                        >
                          {PARITY_OPTIONS.map((parity) => (
                            <option key={parity} value={parity}>
                              {parity}
                            </option>
                          ))}
                        </select>
                      </label>

                      <label className="block space-y-1">
                        <span className="text-xs font-bold text-[#4f6076]">Stop bits</span>
                        <select
                          value={serialConfig.stopBits}
                          onChange={(event) =>
                            setSerialConfig((current) => ({
                              ...current,
                              stopBits: Number(event.target.value),
                            }))
                          }
                          className="h-11 w-full border border-[#d7dde5] bg-white px-3 text-sm text-[#102C57] outline-none transition focus:border-[#d4af37]"
                        >
                          {STOP_BITS_OPTIONS.map((stopBits) => (
                            <option key={stopBits} value={stopBits}>
                              {stopBits}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    {serialMessage ? (
                      <p className="border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-[#102C57]">
                        {serialMessage}
                      </p>
                    ) : null}

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => void loadScaleAgentSettings()}
                        disabled={isLoadingSerial}
                        className="inline-flex h-10 items-center justify-center gap-2 border border-[#d7dde5] bg-white px-4 text-xs font-black uppercase tracking-[0.14em] text-[#102C57] transition hover:border-[#d4af37] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isLoadingSerial ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <RefreshCw size={14} />
                        )}
                        รีเฟรช
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSaveSerialConfig()}
                        disabled={isSavingSerial || isLoadingSerial}
                        className="inline-flex h-10 items-center justify-center gap-2 border border-[#102C57] bg-[#102C57] px-4 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-[#0d3a71] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSavingSerial ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Save size={14} />
                        )}
                        บันทึก Serial
                      </button>
                    </div>
                  </div>
                </div>

                <div className="border border-[#d7dde5] bg-[#fbfcfd] p-4">
                  <p className="text-sm font-black uppercase tracking-[0.08em] text-[#4f6076]">
                    ทดสอบการเชื่อมต่อ
                  </p>
                  <p className="mt-1 text-xs leading-5 text-[#7d8795]">
                    ข้อมูลดิบล่าสุดจากตราชั่ง (raw) พร้อมค่าที่แปลงแล้ว
                  </p>

                  <div className="mt-3 max-h-72 overflow-y-auto border border-[#d7dde5] bg-white">
                    {rawLog.length ? (
                      <ul className="divide-y divide-[#eef1f5]">
                        {rawLog.map((entry) => (
                          <li key={entry.id} className="px-3 py-2 text-xs leading-5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-mono text-[#5f6b7b]">
                                {formatTimeOnly(entry.at)}
                              </span>
                              <span className="font-black text-[#102C57]">
                                {Number.isFinite(entry.weightKg)
                                  ? `${entry.weightKg.toFixed(3)} kg`
                                  : "-"}
                              </span>
                            </div>
                            <p className="mt-0.5 break-all font-mono text-[11px] text-[#7d8795]">
                              {entry.raw || "(ว่าง)"}
                            </p>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="px-3 py-6 text-center text-xs text-[#a0aec0]">
                        ยังไม่มีข้อมูลจากตราชั่ง
                      </p>
                    )}
                  </div>
                </div>

                <div className="border border-[#d7dde5] bg-[#fbfcfd] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-black uppercase tracking-[0.08em] text-[#4f6076]">
                      เครื่องพิมพ์
                    </p>
                    <span
                      className={`inline-flex items-center border px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${
                        printerAgentState === "online"
                          ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                          : "border-rose-300 bg-rose-50 text-rose-700"
                      }`}
                    >
                      Print Agent: {printerAgentState === "online" ? "ออนไลน์" : "ออฟไลน์"}
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    <select
                      value={selectedPrinterName}
                      onChange={(event) => setSelectedPrinterName(event.target.value)}
                      disabled={isLoadingPrinters || !printerOptions.length}
                      className="h-11 w-full border border-[#d7dde5] bg-white px-3 text-sm text-[#102C57] outline-none transition focus:border-[#d4af37] disabled:cursor-not-allowed disabled:bg-[#f1f5f9]"
                    >
                      {!printerOptions.length ? (
                        <option value="">
                          {isLoadingPrinters
                            ? "กำลังโหลดรายชื่อเครื่องพิมพ์..."
                            : "ไม่พบเครื่องพิมพ์จาก local print agent"}
                        </option>
                      ) : null}
                      {printerOptions.map((printer) => (
                        <option key={printer.name} value={printer.name}>
                          {printer.name}
                          {` / ${formatPrinterStatus(printer)}`}
                        </option>
                      ))}
                    </select>

                    <p className="text-xs leading-5 text-[#5f6b7b]">
                      {printerAgentMessage || PRINT_AGENT_UNAVAILABLE_MESSAGE}
                    </p>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => void loadLocalPrinters()}
                        disabled={isLoadingPrinters}
                        className="inline-flex h-10 items-center justify-center gap-2 border border-[#d7dde5] bg-white px-4 text-xs font-black uppercase tracking-[0.14em] text-[#102C57] transition hover:border-[#d4af37] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isLoadingPrinters ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <RefreshCw size={14} />
                        )}
                        รีเฟรชรายชื่อ
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSavePrinterSelection()}
                        disabled={isSavingPrinter || isLoadingPrinters || !selectedPrinterName}
                        className="inline-flex h-10 items-center justify-center gap-2 border border-[#102C57] bg-[#102C57] px-4 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-[#0d3a71] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isSavingPrinter ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Printer size={14} />
                        )}
                        บันทึกเครื่องพิมพ์
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              </section>
            </div>
          ) : null}

          {isProductSetupOpen ? (
            <WeightScaleLiveProductPickerModal
              canOperate={canOperate}
              filteredProducts={filteredProducts}
              isSaving={isSavingProductConfig}
              onClose={() => setIsProductSetupOpen(false)}
              onProductProfileChange={(field, value) =>
                setProductProfile((current) => ({
                  ...current,
                  [field]: value,
                }))
              }
              onSave={() => void saveProductPickerSetup()}
              onSearchChange={setProductSearchTerm}
              onSelectProduct={selectProductForSetup}
              productError={productError}
              productProfile={productProfile}
              products={products}
              productsError={productsError}
              searchTerm={productSearchTerm}
              selectedProduct={selectedProduct}
              selectedProductCode={selectedProductCode}
            />
          ) : null}

          {status.message ? (
            <div
              className={`border px-4 py-3 text-sm font-semibold ${getStatusTone(status.state)}`}
            >
              {status.message}
            </div>
          ) : null}

          <main className="min-h-[360px] overflow-hidden border border-slate-200 bg-white">
            <section className="min-w-0 flex-1 bg-white">
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
              <div className="flex items-center gap-2">
                <List size={20} className="text-[#E9C349]" />
                <h3 className="text-xs font-black uppercase tracking-[0.18em] text-[#001F3F]">
                  รายการชั่งล่าสุด
                </h3>
              </div>
              <p className="text-xs font-bold text-[#7d8795]">
                เฉพาะสถานีชั่งรับเข้าใหม่นี้
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[1180px] border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-white text-[10px] font-black uppercase text-slate-500">
                    <th className="w-14 px-5 py-4 text-left">#</th>
                    <th className="px-4 py-4 text-left">บาร์โค้ด</th>
                    <th className="px-4 py-4 text-left">สินค้า</th>
                    <th className="px-4 py-4 text-left">LOT</th>
                    <th className="px-4 py-4 text-right">น้ำหนักรวม</th>
                    <th className="px-4 py-4 text-right">ภาชนะ</th>
                    <th className="px-4 py-4 text-right">น้ำหนักสุทธิ</th>
                    <th className="px-4 py-4 text-right">เวลา</th>
                    <th className="px-5 py-4 text-center">พิมพ์ฉลาก</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-semibold leading-5 text-slate-700">
                  {recentReceipts.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="px-8 py-16 text-center font-bold text-slate-400"
                      >
                        ไม่พบรายการชั่งของวันนี้
                      </td>
                    </tr>
                  ) : (
                    recentReceipts.map((receipt, index) => {
                      const printState =
                        printStatusByReceiptId[receipt.id] || "ready";
                      const isReprinting = reprintingReceiptId === receipt.id;

                      return (
                        <tr
                          key={receipt.id}
                          className="border-b border-slate-100 transition-colors even:bg-slate-50/50 hover:bg-slate-50"
                        >
                          <td className="px-5 py-3 text-slate-400">
                            {String(index + 1).padStart(3, "0")}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 font-black text-[#001F3F]">
                            {receipt.barcode}
                          </td>
                          <td className="max-w-72 px-4 py-3">
                            <p className="font-black text-[#001F3F]">{receipt.productCode}</p>
                            <p className="truncate text-xs font-medium text-slate-500">
                              {receipt.productName}
                            </p>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3">
                            {receipt.lotNo}
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            {formatWeightDisplay(receipt.grossWeightKg)} Kg
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right">
                            {formatWeightDisplay(receipt.tareWeightKg)} Kg
                          </td>
                          <td className="whitespace-nowrap bg-[#E9C349]/10 px-4 py-3 text-right font-black text-[#001F3F]">
                            {formatWeightDisplay(receipt.netWeightKg)} Kg
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-right text-slate-400">
                            {formatTimeOnly(receipt.weighedAt)}
                          </td>
                          <td className="px-5 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => void handleReprintReceipt(receipt)}
                              disabled={
                                isReprinting
                                || !receipt.barcode
                                || receipt.barcode === "-"
                              }
                              className={`inline-flex h-9 items-center justify-center gap-2 rounded-sm border px-3 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
                                printState === "failed"
                                  ? "border-rose-300 text-rose-700 hover:bg-rose-50"
                                  : "border-[#001F3F] text-[#001F3F] hover:bg-[#001F3F] hover:text-white"
                              }`}
                            >
                              {isReprinting ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Printer size={14} />
                              )}
                              พิมพ์ซ้ำ
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
          </main>
        </div>
      </div>
    </div>
  );
}
