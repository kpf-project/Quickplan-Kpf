"use client";



import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import styles from "./WeightScaleLivePageClient.module.css";
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  ArrowLeftRight,
  Ban,
  List,
  Loader2,
  Printer,
  RefreshCw,
  Save,
  Scale,
  Settings,
  X,
} from "lucide-react";
import {
  saveWeightScaleLiveReceipt,
  fetchCentralInboundReadiness,
  resolveCentralInboundPending,
} from "@/features/production-line/services/weightScaleLiveClient";
import {
  fetchCentralPrintAgentHealth as fetchLocalPrintAgentHealth,
  fetchCentralPrinters as fetchLocalPrinters,
  saveCentralPrinterSelection as saveLocalPrinterSelection,
  printCentralReceipt,
} from "@/features/production-line/services/centralScalePrintClient";
import { readPendingReceipt, persistPendingReceipt, clearConfirmedReceipt, withCentralReceiptLock, assertCentralReceiptMatches } from "@/lib/scale/pending-receipt";
import {
  fetchScaleAgentHealth,
  fetchScaleAgentPorts,
  fetchScaleAgentSerialConfig,
  getDefaultScaleAgentUrl,
  subscribeScaleAgentStream,
  saveScaleAgentSerialConfig,
} from "@/features/production-line/services/localScaleAgentClient";
import WeightScaleLiveProductPickerModal from "@/features/production-line/components/WeightScaleLiveProductPickerModal";
import { requestDepartmentProductHotkeys } from "@/lib/departmentProductHotkeysClient";
import { productHotkeyFromEvent } from "@/lib/productHotkeys";
import WeightScaleLiveSubHeader, { STATION_MODES } from "@/features/production-line/components/WeightScaleLiveSubHeader";
import WeightScaleLiveVoidModal from "@/features/production-line/components/WeightScaleLiveVoidModal";
import CentralInboundHistory from "./CentralInboundHistory";
import WeightScaleLiveVoidSection from "@/features/production-line/components/WeightScaleLiveVoidSection";
import WeightScaleLiveReturnSection from "@/features/production-line/components/WeightScaleLiveReturnSection";
import WeightScaleLiveIssueSection from "@/features/production-line/components/WeightScaleLiveIssueSection";


const RECENT_RECEIPTS_LIMIT = 20;
const RAW_LOG_LIMIT = 10;
const STABLE_MIN_READINGS = 5;
const STABLE_WINDOW_MS = 3000;
const STABLE_MIN_SPAN_MS = 1500;
const STABLE_TOLERANCE_KG = 0.002;
const READING_STALE_AFTER_MS = 5000;
const SCALE_CLEAR_THRESHOLD_KG = 0.05;
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

function StationClock() {
  const [clock, setClock] = useState(null);
  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <div className={styles.date}><CalendarDays size={20} /><span>{clock ? clock.toLocaleDateString("th-TH") : "—"}<small>{clock ? clock.toLocaleTimeString("th-TH") : "—"}</small></span></div>;
}

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
        imageUrl: String(product?.imageUrl || "").trim(),
        unit: String(product?.unit || "").trim(),
        categoryCode: String(product?.categoryCode || "").trim(),
        categoryName: String(product?.categoryName || "").trim(),
        departmentId: String(product?.departmentId || "").trim(),
        departmentCode: String(product?.departmentCode || "").trim().toUpperCase(),
        departmentName: String(product?.departmentName || "").trim(),
        subcategoryName: String(product?.subcategoryName || "").trim(),
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
    .filter((receipt) => receipt?.status !== "voided")
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
        workstationId: String(receipt?.workstationId || "").trim() || null,
        departmentId: String(receipt?.departmentId || "").trim() || null,
      };
    })
    .filter(Boolean);
}

function filterStationReceipts(receipts, workstationId, departmentId) {
  if (!workstationId) return [];
  return receipts.filter((receipt) =>
    receipt.workstationId === workstationId
    && Boolean(departmentId) && receipt.departmentId === departmentId
  );
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
  const [selectedProductDepartmentId, setSelectedProductDepartmentId] = useState("");
  const [productProfile, setProductProfile] = useState(DEFAULT_PRODUCT_PROFILE);
  const [productError, setProductError] = useState("");
  const [productSearchTerm, setProductSearchTerm] = useState("");

  const [liveReading, setLiveReading] = useState(null);
  const [isStable, setIsStable] = useState(false);
  const [isReadingFresh, setIsReadingFresh] = useState(false);
  const [agentConnected, setAgentConnected] = useState(false);
  const [portOpen, setPortOpen] = useState(null);
  const [scaleAgentError, setScaleAgentError] = useState("");
  const [workstation, setWorkstation] = useState(null);
  const [awaitingScaleClear, setAwaitingScaleClear] = useState(false);
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
  const printLockRef = useRef(false);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("scale");
  const [isProductSetupOpen, setIsProductSetupOpen] = useState(false);
  const [isSavingWeight, setIsSavingWeight] = useState(false);
  const [pendingReceipt, setPendingReceipt] = useState(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const [readiness, setReadiness] = useState(null);
  const [readinessError, setReadinessError] = useState("");
  const [readinessVersion, setReadinessVersion] = useState(0);
  const saveLockRef = useRef(false);
  useEffect(() => {
    function syncPending() {
      try { setPendingReceipt(readPendingReceipt(window.localStorage)); }
      catch (error) { setProductError(error.message); setPendingReceipt({ requestId: "invalid" }); }
    }
    syncPending();
    window.addEventListener("storage", syncPending);
    return () => window.removeEventListener("storage", syncPending);
  }, []);
  const [isSavingProductConfig, setIsSavingProductConfig] = useState(false);
  const [activeStationMode, setActiveStationMode] = useState("inbound");
  useEffect(() => {
    function syncMode() {
      const mode = new URL(window.location.href).searchParams.get("mode");
      setActiveStationMode(STATION_MODES.some((item) => item.key === mode) ? mode : "inbound");
    }
    syncMode();
    window.addEventListener("popstate", syncMode);
    return () => window.removeEventListener("popstate", syncMode);
  }, []);

  function handleModeChange(mode) {
    if (!STATION_MODES.some((item) => item.key === mode)) return;
    const url = new URL(window.location.href);
    url.searchParams.set("mode", mode);
    window.history.pushState(null, "", url);
    setActiveStationMode(mode);
  }
  const [voidTargetReceipt, setVoidTargetReceipt] = useState(null);
  const [isVoidModalOpen, setIsVoidModalOpen] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);

  const [status, setStatus] = useState({
    connected: false,
    state: "idle",
    message: "",
    readAt: null,
  });

  async function handleConfirmVoidReceipt() {
    setProductError("ยังไม่เปิดยกเลิก ระบบข้อมูลอิสระของหน้ากลางยังไม่พร้อม");
  }

  const readingsRef = useRef([]);
  const rawLogIdRef = useRef(0);
  const readingFreshnessTimerRef = useRef(null);
  const receiptRequestIdRef = useRef(null);
  const awaitingScaleClearRef = useRef(false);

  const selectedProduct = useMemo(
    () => products.find((product) => product.code === selectedProductCode && product.departmentId === selectedProductDepartmentId) || null,
    [products, selectedProductCode, selectedProductDepartmentId]
  );
  const selectedDepartmentId = selectedProduct?.departmentId || null;
  const [departmentHotkeys, setDepartmentHotkeys] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    let current = true;
    setDepartmentHotkeys(null);
    async function load() {
      if (!selectedDepartmentId || isProductSetupOpen) return;
      try {
        const payload = await requestDepartmentProductHotkeys(selectedDepartmentId, null, controller.signal);
        if (current) setDepartmentHotkeys({ departmentId: selectedDepartmentId, bindings: payload.bindings });
      } catch (error) {
        if (current && error.name !== "AbortError") setProductError(error.message);
      }
    }
    void load();
    window.addEventListener("focus", load);
    return () => { current = false; controller.abort(); window.removeEventListener("focus", load); };
  }, [selectedDepartmentId, isProductSetupOpen]);

  const selectProductForSetup = useCallback((productCode, departmentId) => {
    if (saveLockRef.current || pendingReceipt) return;
    setProductError("");
    readingsRef.current = [];
    setLiveReading(null);
    setIsStable(false);
    setIsReadingFresh(false);
    setSelectedProductCode(productCode);
    setSelectedProductDepartmentId(departmentId);
  }, [pendingReceipt]);

  useEffect(() => {
    function handleProductHotkey(event) {
      if (event.defaultPrevented || activeStationMode !== "inbound" || isProductSetupOpen || isSettingsOpen
        || isVoidModalOpen || isSavingWeight || pendingReceipt || saveLockRef.current || printLockRef.current
        || document.querySelector('[role="dialog"][aria-modal="true"]')
        || departmentHotkeys?.departmentId !== selectedDepartmentId) return;
      const key = productHotkeyFromEvent(event);
      const product = key && products.find(item => item.departmentId === selectedDepartmentId
        && item.canOperate && departmentHotkeys.bindings[item.code] === key);
      if (!product || product.code === selectedProductCode) return;
      event.preventDefault();
      selectProductForSetup(product.code, product.departmentId);
    }
    window.addEventListener("keydown", handleProductHotkey);
    return () => window.removeEventListener("keydown", handleProductHotkey);
  }, [activeStationMode, isProductSetupOpen, isSettingsOpen, isVoidModalOpen, isSavingWeight,
    pendingReceipt, departmentHotkeys, selectedDepartmentId, selectedProductCode, products, selectProductForSetup]);
  const canOperate = Boolean(selectedProduct?.canOperate);
  const readinessKey = `${selectedDepartmentId}:${workstation?.id}:${selectedProductCode}`;
  useEffect(() => {
    let active = true;
    setReadiness(null);
    setReadinessError("");
    if (!selectedDepartmentId || !workstation?.id || !selectedProductCode) return;
    fetchCentralInboundReadiness({ departmentId: selectedDepartmentId, pointId: workstation.id, productCode: selectedProductCode })
      .then(data => { if (active) {
        setReadiness({ ...data, key: readinessKey });
        if (!data.productRegistered || !data.deviceRegistered) setReadinessError("สินค้า หรือเครื่องชั่งยังไม่ได้ลงทะเบียนระบบกลาง กรุณาติดต่อผู้ดูแล");
      } })
      .catch(error => { if (active) setReadinessError(error.message); });
    return () => { active = false; };
  }, [selectedDepartmentId, workstation?.id, selectedProductCode, readinessKey, readinessVersion]);

  const stationReceipts = useMemo(
    () => filterStationReceipts(recentReceipts, workstation?.id, selectedDepartmentId, products),
    [recentReceipts, workstation?.id, selectedDepartmentId, products]
  );

  const departmentOptions = useMemo(() => {
    const map = new Map();
    products.forEach((p) => {
      if (p.departmentId && p.departmentName && !map.has(p.departmentId)) {
        map.set(p.departmentId, p.departmentName);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [products]);

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
        product.subcategoryName,
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
    && !pendingReceipt
    && Boolean(liveReading?.centralCaptureToken)
    && readiness?.key === readinessKey && readiness.productRegistered && readiness.deviceRegistered
    && /^\d{1,7}(\.\d{1,3})?$/.test(String(productProfile.tareWeightKg || "0"))
    && Number(productProfile.tareWeightKg || 0) < currentWeightEvaluation.grossWeightKg
    && agentConnected
    && portOpen !== false
    && isReadingFresh
    && isStable
    && !awaitingScaleClear
    && Boolean(liveReading?.cycleId)
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
        setWorkstation(payload?.workstation || null);
      },
      onReading: (payload) => {
        const parsedWeight = Number(payload?.weightKg);
        const weightKg = Number.isFinite(parsedWeight) ? parsedWeight : null;
        const atMs = Date.parse(payload?.at) || Date.now();
        const at = payload?.at || new Date(atMs).toISOString();

        setWorkstation(payload?.workstation || null);
        if (
          awaitingScaleClearRef.current
          && weightKg !== null
          && Math.abs(weightKg) <= SCALE_CLEAR_THRESHOLD_KG
        ) {
          awaitingScaleClearRef.current = false;
          setAwaitingScaleClear(false);
          receiptRequestIdRef.current = null;
          readingsRef.current = [];
          setStatus({
            connected: true,
            state: "connected",
            message: "เครื่องชั่งกลับสู่ศูนย์แล้ว พร้อมรับสินค้าชิ้นถัดไป",
            readAt: at,
          });
        }

        setLiveReading({
          weightKg,
          unit: payload?.unit || null,
          raw: String(payload?.raw || ""),
          cycleId: String(payload?.cycleId || "").trim() || null,
          centralCaptureToken: payload?.centralCaptureToken || null,
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
    }, { localOnly: true });

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
        fetchScaleAgentHealth({ localOnly: true }),
        fetchScaleAgentPorts({ localOnly: true }),
        fetchScaleAgentSerialConfig({ localOnly: true }),
      ]);

      setSerialPorts(normalizeSerialPorts(portsResult));
      setSerialConfig(normalizeSerialConfig(configResult));
      setPortOpen(Boolean(healthResult?.portOpen));
      setWorkstation(healthResult?.workstation || null);
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
      }, { localOnly: true });
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

  function openProductSetup() {
    if (saveLockRef.current || pendingReceipt) {
      setProductError("ต้องตรวจผลคำขอรับเข้าที่ค้างก่อนเปลี่ยนสินค้า");
      return;
    }
    setProductSearchTerm("");
    setProductError("");
    setIsProductSetupOpen(true);
  }

  async function saveProductPickerSetup() {
    if (!selectedProduct) {
      setProductError("กรุณาเลือกสินค้า");
      return;
    }
    setProductError("");
    setIsProductSetupOpen(false);
  }

  async function handleSaveWeightResult() {
    try { await withCentralReceiptLock(navigator.locks, saveCentralWeightResult); }
    catch (error) { setProductError(error.message); }
  }

  async function saveCentralWeightResult() {
    if (!canSave || saveLockRef.current) return;
    saveLockRef.current = true;
    setIsSavingWeight(true);
    try {
      const payload = { requestId: crypto.randomUUID(), departmentId: selectedDepartmentId,
        pointId: workstation?.id, productCode: selectedProduct.code,
        tareWeightKg: String(productProfile.tareWeightKg || "0"), captureToken: liveReading.centralCaptureToken };
      persistPendingReceipt(window.localStorage, payload);
      setPendingReceipt(payload);
      const receipt = await saveWeightScaleLiveReceipt(payload);
      confirmCentralReceipt(receipt, payload.requestId);
      await handleReprintReceipt({ id: receipt.request_id, departmentId: receipt.department_id,
        productCode: receipt.product_code });
    } catch (error) {
      setProductError(`${error.message} — หากส่งคำขอแล้ว ให้ตรวจรายการค้างก่อน ห้ามชั่งรับซ้ำ`);
    } finally { saveLockRef.current = false; setIsSavingWeight(false); }
  }

  function confirmCentralReceipt(receipt, requestId) {
    const pending = readPendingReceipt(window.localStorage);
    assertCentralReceiptMatches(receipt, pending);
    if (receipt.request_id !== requestId || (workstation?.id && receipt.point_id !== workstation.id)) {
      throw new Error("คำตอบใบรับเข้าไม่ตรงกับจุดชั่งนี้");
    }
    clearConfirmedReceipt(window.localStorage, requestId);
    setPendingReceipt(null);
    setHistoryVersion(value => value + 1);
    setRecentReceipts(current => [{ id: receipt.request_id, barcode: receipt.barcode,
      productCode: receipt.product_code, productName: products.find(p => p.code === receipt.product_code)?.name || receipt.product_code,
      lotNo: receipt.lot_no, grossWeightKg: Number(receipt.gross_kg), tareWeightKg: Number(receipt.tare_kg),
      netWeightKg: Number(receipt.net_kg), weighedAt: receipt.created_at,
      workstationId: receipt.point_id, departmentId: receipt.department_id, status: "active" }, ...current.filter(r => r.id !== receipt.request_id)].slice(0, RECENT_RECEIPTS_LIMIT));
    awaitingScaleClearRef.current = true;
    setAwaitingScaleClear(true);
    setProductError("รับเข้าสต็อกกลางสำเร็จ — ยังไม่ได้พิมพ์ฉลาก กรุณายกสินค้าออกจากเครื่องชั่ง");
  }

  async function handleRecoverPendingReceipt() {
    if (!pendingReceipt || saveLockRef.current) return;
    saveLockRef.current = true;
    setIsSavingWeight(true);
    try {
      await withCentralReceiptLock(navigator.locks, async () => {
        const pending = readPendingReceipt(window.localStorage);
        if (!pending || pending.requestId !== pendingReceipt.requestId) throw new Error("คำขอค้างเปลี่ยนแล้ว กรุณาโหลดหน้าใหม่");
        const result = await resolveCentralInboundPending(pending);
        if (result.status === "received") {
          confirmCentralReceipt(result.receipt, pending.requestId);
        } else if (result.status === "not_received" && result.requestId === pending.requestId) {
          clearConfirmedReceipt(window.localStorage, pending.requestId);
          setPendingReceipt(null);
          awaitingScaleClearRef.current = true;
          setAwaitingScaleClear(true);
          setProductError("ยืนยันแล้วว่ายังไม่รับเข้า และปิดคำขอเดิมถาวร กรุณายกสินค้าออกให้เครื่องชั่งกลับศูนย์ แล้วชั่งใหม่");
        } else throw new Error("ยังยืนยันผลคำขอไม่ได้");
      });
    }
    catch (error) { setProductError(`${error.message} — ยังไม่ยืนยันผล ห้ามรับซ้ำ กรุณาตรวจสอบกับผู้ดูแล`); }
    finally { saveLockRef.current = false; setIsSavingWeight(false); }
  }

  async function handleReprintReceipt(receipt) {
    if (!receipt?.id || !workstation?.id || printLockRef.current) return;
    printLockRef.current = true;
    setReprintingReceiptId(receipt.id);
    try {
      await printCentralReceipt({ requestId: receipt.id, pointId: workstation.id,
        departmentId: receipt.departmentId,
        productName: products.find(product => product.code === receipt.productCode)?.name });
      setPrintStatusByReceiptId(current => ({ ...current, [receipt.id]: "printed" }));
      setProductError("บันทึกรับเข้าแล้ว และส่งงานเข้าคิวเครื่องพิมพ์แล้ว กรุณาตรวจฉลากจริง");
    } catch (error) {
      setPrintStatusByReceiptId(current => ({ ...current, [receipt.id]: "failed" }));
      setProductError(`รับเข้าแล้ว แต่ยังยืนยันการพิมพ์ไม่ได้: ${error.message} — ตรวจฉลากก่อนพิมพ์ซ้ำ ห้ามบันทึกรับใหม่`);
    } finally { printLockRef.current = false; setReprintingReceiptId(""); }
  }

  function handleStartNewCycle() {
    if (awaitingScaleClearRef.current) {
      setStatus({
        connected: agentConnected,
        state: "warning",
        message: `กรุณายกสินค้าออกจนเหลือไม่เกิน ${SCALE_CLEAR_THRESHOLD_KG.toFixed(2)} kg ก่อนเริ่มรอบใหม่`,
        readAt: new Date().toISOString(),
      });
      return;
    }
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
    <div className={styles.page}>
      <WeightScaleLiveSubHeader
        activeMode={activeStationMode}
        onModeChange={handleModeChange}
        agentConnected={agentConnected && portOpen !== false}
        printerOnline={printerAgentState === "online"}
        leading={
        <div className={styles.brand}>
          <h1>KPF <span>WEIGH PRO</span></h1>
        <div className={styles.stationIdentity}>
          <strong>{selectedProduct?.departmentName || "ยังไม่ได้เลือกแผนก"}</strong>
          <span>{workstation?.name || "ยังไม่ได้ตั้งค่าจุดชั่ง"}</span>
        </div>
        </div>
        }
        trailing={<>
        <StationClock />
        <button type="button" className={styles.secondary} onClick={() => void handleReconnect()} disabled={activeStationMode !== "inbound" || isSavingWeight || Boolean(pendingReceipt) || Boolean(reprintingReceiptId)}><Settings size={19} />ตั้งค่าอุปกรณ์</button>
        </>}
      />
      <div role="status" className={styles.notice}>
        รับเข้าผ่าน API กลาง · ต้องยืนยัน SQL และจุดชั่งก่อนใช้งาน · เบิก คืน และยกเลิกยังไม่เปิด
        {pendingReceipt ? <button type="button" onClick={() => void handleRecoverPendingReceipt()} disabled={isSavingWeight}>ตรวจผลคำขอรับเข้าที่ค้าง</button> : null}
      </div>

      {activeStationMode === "return" ? (
        <WeightScaleLiveReturnSection
          key={`${selectedDepartmentId}:${workstation?.id}:return`}
          workstationId={workstation?.id}
          products={products}
          liveWeightKg={currentWeightEvaluation.grossWeightKg || liveReading?.weightKg || 0}
          isStable={isStable}
          agentConnected={agentConnected && portOpen !== false}
          departmentId={selectedDepartmentId}
          departmentName={selectedProduct?.departmentName}
          departmentOptions={departmentOptions}
        />
      ) : activeStationMode === "issue" || activeStationMode === "cancel_issue" ? (
        <WeightScaleLiveIssueSection
          key={`${selectedDepartmentId}:${workstation?.id}:issues`}
          workstationId={workstation?.id}
          products={products}
          initialSubTab={activeStationMode}
          departmentId={selectedDepartmentId}
          departmentName={selectedProduct?.departmentName}
          departmentOptions={departmentOptions}
        />
      ) : activeStationMode === "void" ? (
        <WeightScaleLiveVoidSection
          key={`${selectedDepartmentId}:${workstation?.id}:void`}
          workstationId={workstation?.id}
          products={products}
          recentReceipts={recentReceipts}
          departmentId={selectedDepartmentId}
          departmentName={selectedProduct?.departmentName}
          departmentOptions={departmentOptions}
          onVoidSuccess={(voidedId) => {
            setRecentReceipts((current) =>
              current.map((r) => (r.id === voidedId ? { ...r, status: "voided" } : r))
            );
          }}
        />
      ) : (
        <>

          <section className={styles.weighing} aria-label="ชั่งรับเข้าสด">
            <div className={styles.product}>
              {selectedProduct?.imageUrl ? (
                <div className={styles.productImage}><Image src={selectedProduct.imageUrl} alt={selectedProduct.name} fill unoptimized /></div>
              ) : null}
              <div className={styles.productDetails}>
              <small>สินค้า</small>
              <h2>{selectedProduct?.code || "ยังไม่ได้เลือกสินค้า"}</h2>
              <p>{selectedProduct?.name || "เลือกสินค้าและ LOT ก่อนเริ่มชั่ง"}</p>
              <small>LOT</small>
              <strong>{productProfile.lotNo || "—"}</strong>
              <button type="button" className={styles.changeProduct} onClick={openProductSetup}><ArrowLeftRight size={16} />เปลี่ยนสินค้า / LOT</button>
              </div>
            </div>
            <div className={styles.instrument}>
              <div className={styles.weightHeading}>
                <span>น้ำหนักสุทธิ (NET)</span>
                <span className={isStable && isReadingFresh ? styles.stable : styles.waiting}>
                  {isStable && isReadingFresh ? <CheckCircle2 size={18} /> : <Activity size={18} />}
                  {isStable && isReadingFresh ? "น้ำหนักนิ่ง" : "รอน้ำหนักนิ่ง"} {stabilityPercentage}%
                </span>
              </div>
              <div className={styles.weight} data-testid="live-net-weight">
                <strong>{Number.isFinite(currentWeightEvaluation.netWeightKg) ? currentWeightEvaluation.netWeightKg.toFixed(3) : "0.000"}</strong><span>kg</span>
              </div>
              <div className={styles.metrics}>
                <div><small>น้ำหนักรวม (GROSS)</small><strong>{formatWeightDisplay(currentWeightEvaluation.grossWeightKg)} kg</strong></div>
                <div><small>น้ำหนักภาชนะ (TARE)</small><strong>{formatWeightDisplay(currentWeightEvaluation.tareWeightKg)} kg</strong></div>
              </div>
              {currentWeightEvaluation.hasPassWeight ? <p className={currentWeightEvaluation.isPass ? styles.pass : styles.warning}>เกณฑ์ขั้นต่ำ {formatWeightDisplay(currentWeightEvaluation.passWeightKg)} kg · {currentWeightEvaluation.message}</p> : null}
              {selectedProduct && !liveReading?.centralCaptureToken ? <p className="text-xs text-slate-500">รอหลักฐานน้ำหนักรวมที่นิ่งจาก agent ที่ลงทะเบียน ต้องกลับศูนย์หลังเปิดเครื่องก่อนชั่ง</p> : null}
            </div>
            <div className={styles.actions}>
              <button type="button" className={styles.primary} onClick={() => void handleSaveWeightResult()} disabled={isSavingWeight || !canSave}>
                {isSavingWeight ? <Loader2 size={23} className="animate-spin" /> : <Save size={23} />}บันทึกรับเข้าและพิมพ์ฉลาก
              </button>
              <button type="button" className={styles.secondary} onClick={handleStartNewCycle}><RefreshCw size={18} />เริ่มรอบใหม่</button>
              {awaitingScaleClear ? <p className={styles.warning} role="status">บันทึกแล้ว — กรุณายกสินค้าออกให้ค่าน้ำหนักกลับใกล้ศูนย์ก่อนชั่งรายการถัดไป</p> : null}
            </div>
          </section>

      <div className="px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-5">
          {isSettingsOpen ? (
            <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[var(--surface-navy,#001F3F)]/70 p-3 sm:p-6">
              <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="scale-settings-title"
                className="max-h-[92dvh] w-full max-w-6xl overflow-y-auto rounded-lg border border-white/20 bg-white shadow-2xl"
              >
                <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-white/10 bg-[var(--surface-navy,#001F3F)] px-5 py-4 text-white sm:px-6">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#E9C349]">
                      ตั้งค่า
                    </p>
                    <h2 id="scale-settings-title" className="mt-1 text-lg font-black sm:text-xl">
                      ตั้งค่าอุปกรณ์
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

              <div className={styles.settingsTabs} role="tablist" aria-label="ประเภทอุปกรณ์">
                <button type="button" role="tab" id="scale-settings-tab" aria-selected={settingsTab === "scale"} aria-controls="scale-settings-panel" onClick={() => setSettingsTab("scale")}><Scale size={18} />เครื่องชั่งและการเชื่อมต่อ</button>
                <button type="button" role="tab" id="printer-settings-tab" aria-selected={settingsTab === "printer"} aria-controls="printer-settings-panel" onClick={() => setSettingsTab("printer")}><Printer size={18} />เครื่องพิมพ์</button>
              </div>
              <div className="grid gap-4 p-4 lg:grid-cols-2">
                <div id="scale-settings-panel" role="tabpanel" aria-labelledby="scale-settings-tab" hidden={settingsTab !== "scale"} className="border border-[#d7dde5] bg-[#fbfcfd] p-4">
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
                        className="inline-flex h-10 items-center justify-center gap-2 border border-[#102C57] bg-[var(--surface-navy,#102C57)] px-4 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-[#0d3a71] disabled:cursor-not-allowed disabled:opacity-60"
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

                <div hidden={settingsTab !== "scale"} className="border border-[#d7dde5] bg-[#fbfcfd] p-4">
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

                <div id="printer-settings-panel" role="tabpanel" aria-labelledby="printer-settings-tab" hidden={settingsTab !== "printer"} className="border border-[#d7dde5] bg-[#fbfcfd] p-4 lg:col-span-2">
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
                        className="inline-flex h-10 items-center justify-center gap-2 border border-[#102C57] bg-[var(--surface-navy,#102C57)] px-4 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-[#0d3a71] disabled:cursor-not-allowed disabled:opacity-60"
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
              stationId={workstation?.id}
              stationName={workstation?.name}
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

          {productError ? <p role="status" className="border border-amber-200 bg-amber-50 px-4 py-2 text-sm">{productError}</p> : null}
          {readinessError ? <p role="status" className="border border-rose-200 bg-rose-50 px-4 py-2 text-sm">{readinessError} <button type="button" onClick={() => setReadinessVersion(value => value + 1)}>ตรวจความพร้อมอีกครั้ง</button></p> : null}

          <CentralInboundHistory key={`${selectedDepartmentId}:${workstation?.id}`} departmentId={selectedDepartmentId}
            pointId={workstation?.id} products={products} refreshVersion={historyVersion}
            onPrint={receipt => void handleReprintReceipt(receipt)} printingId={reprintingReceiptId} printStatuses={printStatusByReceiptId} />
        </div>
      </div>
        </>
      )}

      {/* Quick Void Confirmation Modal with Stock Guard */}
      <WeightScaleLiveVoidModal
        receipt={voidTargetReceipt}
        isOpen={isVoidModalOpen}
        onClose={() => {
          setIsVoidModalOpen(false);
          setVoidTargetReceipt(null);
        }}
        onConfirmVoid={handleConfirmVoidReceipt}
        isProcessing={isVoiding}
      />
    </div>
  );
}
