"use client";

import Barcode from "react-barcode";
import { assertReceiptCanReprint, isActiveScaleReceipt, resolveActiveReceiptCount } from "@/lib/scale-receipt-visibility";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Cable,
  Check,
  ChevronDown,
  Clock3,
  Hash,
  Loader2,
  Package,
  Plus,
  Printer,
  Radar,
  RefreshCw,
  Save,
  Search,
  Settings,
  Scale,
  Tag,
  X,
} from "lucide-react";
import {
  DEFAULT_SCALE_CONFIG,
  normalizeScaleConfig,
} from "@/lib/scale/config";
import WeightScalePrimaryHeader from "@/features/production-line/components/WeightScalePrimaryHeader";
import {
  createScaleStream,
  createScaleLot,
  fetchScaleCurrent,
  fetchScaleLots,
  fetchScaleProducts,
  fetchScaleRecentReceipts,
  fetchScaleReceiptReport,
  saveScaleProductConfig,
  saveScaleReceipt,
  setScaleCurrentLot,
} from "@/features/production-line/services/scaleClient";
import {
  fetchLocalPrintAgentHealth,
  fetchLocalPrinters,
  printWeightScaleLabelViaAgent,
  saveLocalPrinterSelection,
} from "@/features/production-line/services/localPrintAgentClient";
import { buildWeightScaleReceiptPrintLabel } from "@/features/production-line/services/weightScaleReceiptLabel";
import { buildAutoScaleLotNo } from "@/features/production-line/services/scaleLotNumber";
import { printWeightScaleLabelViaUsb } from "@/features/production-line/services/webUsbPrinter";
import {
  fetchScaleAgentHealth,
  fetchScaleAgentPorts,
  fetchScaleAgentSerialConfig,
  saveScaleAgentSerialConfig,
} from "@/features/production-line/services/localScaleAgentClient";
import useWeightScaleSerialInput from "@/features/production-line/hooks/useWeightScaleSerialInput";
import {
  normalizeWeightScaleSerialConfig,
  resolveWeightScaleReading,
  resolveWeightScaleSourceMetadata,
  WEIGHT_SCALE_INPUT_MODES,
} from "@/lib/weight-scale-input-source";

const SCALE_STORAGE_KEY = "kpf-weight-scale-profile-v1";
const SCALE_PRODUCTS_STORAGE_KEY = "kpf-weight-scale-products-v1";
const SCALE_LOTS_STORAGE_KEY = "kpf-weight-scale-lots-v2";
const SCALE_SELECTED_PRODUCT_STORAGE_KEY =
  "kpf-weight-scale-selected-product-v1";
const SCALE_PRODUCT_SETTINGS_STORAGE_KEY =
  "kpf-weight-scale-product-settings-v1";
const PRODUCT_OVERVIEW_PAGE_SIZE = 10;
const RECENT_RECEIPTS_LIMIT = 20;
const AUTO_SAVE_RESET_THRESHOLD_KG = 0.1;
const AUTO_SAVE_STABLE_TOLERANCE_KG = 0.01;
const AUTO_SAVE_STABLE_WINDOW_MS = 2500;
const TEST_WEIGHT_STEP = "0.001";
const DEFAULT_SERIAL_CONFIG = Object.freeze(
  normalizeWeightScaleSerialConfig()
);
const LEGACY_SCALE_DEFAULTS = {
  host: "192.168.211.243",
  port: 9761,
  unitId: 1,
  registerAddress: 1,
  registerCount: 1,
  divisor: 100,
  timeoutMs: 5000,
  connectRetryCount: 2,
  connectRetryDelayMs: 400,
};

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

const PRODUCT_STATUS_OPTIONS = [
  "พร้อมใช้งาน",
  "รอชั่ง",
  "ปิดใช้งาน",
];

const DEFAULT_PRODUCT_PROFILE = Object.freeze({
  lotNo: "",
  passWeightKg: "",
  tareWeightKg: "",
  status: "พร้อมใช้งาน",
});

const NO_MATCHED_PRODUCTS_MESSAGE =
  "ไม่พบสินค้าที่ผูกกับแผนก KP13 และอยู่ในหมวด 03";
const PRODUCTS_CACHE_FALLBACK_MESSAGE =
  "ไม่สามารถอัปเดตรายการสินค้าได้ กำลังใช้ข้อมูลล่าสุดที่บันทึกไว้ในเครื่อง";
const LOAD_PRODUCTS_FAILED_MESSAGE = "ไม่สามารถโหลดรายการสินค้าได้";
const PRINT_AGENT_UNAVAILABLE_MESSAGE =
  "ยังไม่พบ local print agent ในเครื่องนี้";

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

function calculateProductionShift(timestamp = new Date()) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  const bangkokTime = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  const hours = bangkokTime.getHours();
  const minutes = bangkokTime.getMinutes();
  const timeInMinutes = hours * 60 + minutes;
  let shift = 1;
  const productionDate = new Date(bangkokTime);
  if (timeInMinutes >= 361 && timeInMinutes <= 1140) {
    shift = 1;
  } else {
    shift = 2;
    if (timeInMinutes <= 360) {
      productionDate.setDate(productionDate.getDate() - 1);
    }
  }
  const year = productionDate.getFullYear();
  const month = String(productionDate.getMonth() + 1).padStart(2, "0");
  const day = String(productionDate.getDate()).padStart(2, "0");
  return {
    productionDate: day + "/" + month + "/" + String(year + 543).slice(-2),
    shift,
  };
}

function formatShiftLabel(shift) {
  if (shift === 1) return "กะ1 [06:01 - 19:00]";
  if (shift === 2) return "กะ2 [19:01 - 06:00]";
  return "กะ " + shift;
}

function parseWeightNumber(value, fallback = null) {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundToTwo(value) {
  return Number(Number(value).toFixed(2));
}

function getLotStatusLabel(status) {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  if (normalizedStatus === "active") {
    return "กำลังใช้งาน";
  }
  if (normalizedStatus === "closed") {
    return "ปิดล็อตแล้ว";
  }
  if (normalizedStatus === "archived") {
    return "เก็บถาวร";
  }
  return "";
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
  const netWeightKg = roundToTwo(Math.max(grossWeightKg - tareWeightKg, 0));
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
      message: `น้ำหนักสุทธิ ${netWeightKg.toFixed(2)} Kg`,
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
      message: `ผ่านเกณฑ์แล้ว: สุทธิ ${netWeightKg.toFixed(2)} / เกณฑ์ ${passWeightKg.toFixed(2)} Kg`,
    };
  }

  return {
    grossWeightKg,
    tareWeightKg,
    netWeightKg,
    passWeightKg,
    hasPassWeight,
    isPass,
    message: `น้ำหนักยังไม่ถึงเกณฑ์: สุทธิ ${netWeightKg.toFixed(2)} / เกณฑ์ ${passWeightKg.toFixed(2)} Kg`,
  };
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
  if (state === "connecting") {
    return "border-amber-300 bg-amber-50 text-amber-700";
  }
  return "border-slate-300 bg-slate-50 text-slate-700";
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
            openedAt: product.currentLot.openedAt || null,
            closedAt: product.currentLot.closedAt || null,
          }
        : null;

      return {
        code: String(product?.code || "").trim().toUpperCase(),
        name: String(product?.name || "").trim(),
        unit: String(product?.unit || "").trim(),
        categoryCode: String(product?.categoryCode || "").trim(),
        categoryName: String(product?.categoryName || "").trim(),
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

function resolveSelectedProductCode(products, preferredCode = "") {
  const normalizedPreferredCode = String(preferredCode || "")
    .trim()
    .toUpperCase();

  if (normalizedPreferredCode) {
    const matchedProduct = products.find(
      (product) => product.code === normalizedPreferredCode
    );
    if (matchedProduct) {
      return matchedProduct.code;
    }
  }

  const ownerProduct = products.find((product) => product.isOwner);
  if (ownerProduct) {
    return ownerProduct.code;
  }

  return products[0]?.code ?? "";
}

function readStorageItem(key) {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorageItem(key, value) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (value === null || value === undefined || value === "") {
      window.localStorage.removeItem(key);
      return;
    }

    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures so the page still works.
  }
}

function readCachedProductsFromStorage() {
  const storedProducts = readStorageItem(SCALE_PRODUCTS_STORAGE_KEY);
  if (!storedProducts) {
    return [];
  }

  try {
    return normalizeProductOptions(JSON.parse(storedProducts));
  } catch {
    return [];
  }
}

function normalizeProductProfile(input = {}) {
  const nextStatus = String(input?.status || "").trim();
  return {
    lotNo: String(input?.lotNo || "").trim(),
    passWeightKg: String(input?.passWeightKg || "").trim(),
    tareWeightKg: String(input?.tareWeightKg || "").trim(),
    status: PRODUCT_STATUS_OPTIONS.includes(nextStatus)
      ? nextStatus
      : DEFAULT_PRODUCT_PROFILE.status,
  };
}

function normalizeProductProfiles(input = {}) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(input)
      .map(([productCode, profile]) => [
        String(productCode || "").trim().toUpperCase(),
        normalizeProductProfile(profile),
      ])
      .filter(([productCode]) => Boolean(productCode))
  );
}

function buildInitialProductProfiles(products = []) {
  return Object.fromEntries(
    products
      .map((product) => {
        const productCode = String(product?.code || "").trim().toUpperCase();
        if (!productCode) {
          return null;
        }

        return [productCode, normalizeProductProfile(product?.defaultProfile)];
      })
      .filter(Boolean)
  );
}

function mergeProductProfilesWithProducts(products, currentProfiles = {}) {
  const normalizedCurrentProfiles = normalizeProductProfiles(currentProfiles);
  const mergedProfiles = buildInitialProductProfiles(products);

  products.forEach((product) => {
    const productCode = String(product?.code || "").trim().toUpperCase();
    if (!productCode) {
      return;
    }

    const serverProfile = normalizeProductProfile(product?.defaultProfile);
    const currentProfile = normalizeProductProfile(
      normalizedCurrentProfiles[productCode]
    );

    mergedProfiles[productCode] = normalizeProductProfile({
      lotNo: currentProfile.lotNo || serverProfile.lotNo,
      passWeightKg:
        currentProfile.passWeightKg || serverProfile.passWeightKg,
      tareWeightKg:
        currentProfile.tareWeightKg || serverProfile.tareWeightKg,
      status:
        currentProfile.status !== DEFAULT_PRODUCT_PROFILE.status
          ? currentProfile.status
          : serverProfile.status || currentProfile.status,
    });
  });

  return mergedProfiles;
}

function buildInitialProductsState(payload) {
  if (!payload || typeof payload !== "object") {
    return {
      products: [],
      error: "",
      hasPayload: false,
    };
  }

  const nextProducts = normalizeProductOptions(payload?.products);
  return {
    products: nextProducts,
    error: nextProducts.length ? "" : NO_MATCHED_PRODUCTS_MESSAGE,
    hasPayload: true,
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

      const quantity = Number.parseFloat(String(lot?.quantity ?? ""));

      return {
        selectionKey:
          String(lot?.selectionKey || "").trim() || `${code}::${lotNo}`,
        code,
        name: String(lot?.name || "").trim(),
        lotNo,
        unit: String(lot?.unit || "").trim(),
        categoryCode: String(lot?.categoryCode || "").trim(),
        categoryName: String(lot?.categoryName || "").trim(),
        productConfigId: String(lot?.productConfigId || "").trim() || null,
        lotId: String(lot?.lotId || lot?.id || "").trim() || null,
        status: String(lot?.status || "").trim() || "active",
        openedAt: lot?.openedAt || null,
        closedAt: lot?.closedAt || null,
        quantity: Number.isFinite(quantity) ? quantity : 0,
        isCurrent: Boolean(lot?.isCurrent),
        isOwner: Boolean(lot?.isOwner),
      };
    })
    .filter(Boolean);
}

function buildInitialLotsState(payload) {
  if (!payload || typeof payload !== "object") {
    return {
      lots: [],
      hasPayload: false,
    };
  }

  return {
    lots: normalizeLotOptions(payload?.lots),
    hasPayload: true,
  };
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
        amountPerPallet: Number.isFinite(Number(receipt?.amountPerPallet))
          ? Number(receipt.amountPerPallet)
          : null,
        weighedAt: receipt?.weighedAt || null,
        status: String(receipt?.status || "").trim() || "recorded",
        isTest: Boolean(receipt?.isTest),
      };
    })
    .filter(Boolean);
}

function buildInitialReceiptsState(payload) {
  if (!payload || typeof payload !== "object") {
    return {
      receipts: [],
      summary: {
        totalCount: 0,
        actualCount: 0,
        testCount: 0,
        totalNetWeightKg: 0,
      },
      hasPayload: false,
    };
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
    hasPayload: true,
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

  return {
    barcodeValue: `TEST-${timestamp}`,
    barcodeText: `TEST-${timestamp}`,
    productName: "ทดสอบพิมพ์ฉลาก",
    productCode: "TEST-PRINT",
    lotNo: "TEST",
    tareWeightKg: 0,
    netWeightKg: 0,
    weighedAt: issuedAt.toISOString(),
    unitLabel: "กก.",
    printer: {
      labelWidthMm: 80,
      labelHeightMm: 50,
      symbology: "CODE128",
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

function getPrintAgentStatusMeta(state) {
  if (state === "online") {
    return {
      label: "พร้อมใช้งาน",
      className: "border-emerald-200 bg-emerald-50 text-emerald-700",
    };
  }

  if (state === "offline") {
    return {
      label: "ออฟไลน์",
      className: "border-rose-200 bg-rose-50 text-rose-700",
    };
  }

  return {
    label: "ยังไม่ตรวจสอบ",
    className: "border-slate-200 bg-slate-50 text-slate-700",
  };
}

export default function WeightScalePageClient({
  initialScaleConfig,
  initialProductsPayload = null,
  initialLotsPayload = null,
  initialReceiptsPayload = null,
}) {
  const initialProductsState = buildInitialProductsState(initialProductsPayload);
  const initialLotsState = buildInitialLotsState(initialLotsPayload);
  const initialReceiptsState = buildInitialReceiptsState(initialReceiptsPayload);
  const [scaleConfig, setScaleConfig] = useState(() =>
    normalizeScaleConfig(
      {
        ...LEGACY_SCALE_DEFAULTS,
        ...initialScaleConfig,
      },
      DEFAULT_SCALE_CONFIG
    )
  );
  const [status, setStatus] = useState({
    connected: false,
    state: "idle",
    message: "พร้อมเชื่อมต่อเครื่องชั่ง",
    readAt: null,
  });
  const [products, setProducts] = useState(() => initialProductsState.products);
  const [productsPreset, setProductsPreset] = useState(
    () => initialProductsPayload?.preset ?? null
  );
  const [selectedProductCode, setSelectedProductCode] = useState("");
  const [productProfiles, setProductProfiles] = useState(() =>
    buildInitialProductProfiles(initialProductsState.products)
  );
  const [productError, setProductError] = useState(
    () => initialProductsState.error
  );
  const [isLoadingProducts, setIsLoadingProducts] = useState(
    () => !initialProductsState.hasPayload
  );
  const [lotOptions, setLotOptions] = useState(() => initialLotsState.lots);
  const [isLoadingLots, setIsLoadingLots] = useState(
    () => !initialLotsState.hasPayload
  );
  const [draftLotNo, setDraftLotNo] = useState("");
  const [productOverviewPage, setProductOverviewPage] = useState(1);
  const [productSearchTerm, setProductSearchTerm] = useState("");
  const [liveReading, setLiveReading] = useState(null);
  const [isTestMode] = useState(false);
  const [testWeightInput, setTestWeightInput] = useState("");
  const [recentReceipts, setRecentReceipts] = useState(
    () => initialReceiptsState.receipts
  );
  const [recentReceiptsSummary, setRecentReceiptsSummary] = useState(
    () => initialReceiptsState.summary
  );
  const [isLoadingRecentReceipts, setIsLoadingRecentReceipts] = useState(
    () => !initialReceiptsState.hasPayload
  );
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingProductConfig, setIsSavingProductConfig] = useState(false);
  const [isCreatingLot, setIsCreatingLot] = useState(false);
  const [isSwitchingLot, setIsSwitchingLot] = useState(false);
  const [isReadingOnce, setIsReadingOnce] = useState(false);
  const [isSavingWeight, setIsSavingWeight] = useState(false);
  const [printLabel, setPrintLabel] = useState(null);
  const [isPrintingLabel, setIsPrintingLabel] = useState(false);
  const [printerOptions, setPrinterOptions] = useState([]);
  const [selectedPrinterName, setSelectedPrinterName] = useState("");
  const [printerAgentMessage, setPrinterAgentMessage] = useState("");
  const [printerAgentState, setPrinterAgentState] = useState("unknown");
  const [isLoadingPrinters, setIsLoadingPrinters] = useState(false);
  const [isTestingPrinter, setIsTestingPrinter] = useState(false);
  const [isReprintingLatestLabel, setIsReprintingLatestLabel] = useState(false);
  const [isSavingPrinterSelection, setIsSavingPrinterSelection] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [inputMode, setInputMode] = useState(WEIGHT_SCALE_INPUT_MODES.IP);
  const [serialConfig, setSerialConfig] = useState(DEFAULT_SERIAL_CONFIG);
  const [serialPorts, setSerialPorts] = useState([]);
  const [serialSettingsMessage, setSerialSettingsMessage] = useState("");
  const [isLoadingSerialSettings, setIsLoadingSerialSettings] = useState(false);
  const [isSavingSerialSettings, setIsSavingSerialSettings] = useState(false);
  const serialInput = useWeightScaleSerialInput(
    inputMode === WEIGHT_SCALE_INPUT_MODES.SERIAL
  );

  const [printMode, setPrintMode] = useState(() => {
    if (typeof window !== "undefined") {
      return window.localStorage.getItem("kpf-weight-scale-print-mode-v1") || "agent";
    }
    return "agent";
  });
  const [usbDevice, setUsbDevice] = useState(null);
  const [usbDeviceName, setUsbDeviceName] = useState("");
  const [isConnectingUsb, setIsConnectingUsb] = useState(false);
  const [settingsViewMode, setSettingsViewMode] = useState("config");
  const [isProductPickerOpen, setIsProductPickerOpen] = useState(false);
  const [isSettingsMenuOpen, setIsSettingsMenuOpen] = useState(false);
  const eventSourceRef = useRef(null);
  const closingStreamRef = useRef(false);
  const settingsMenuRef = useRef(null);
  const autoConnectKeyRef = useRef("");
  const autoConnectPausedRef = useRef(false);
  const autoDraftLotNoRef = useRef("");
  const receiptRequestIdRef = useRef(null);
  const connectWatchdogRef = useRef(null);
  const initialProductsRef = useRef(initialProductsState.products);
  const autoSaveStateRef = useRef({
    phase: "armed",
    stableSince: null,
    baselineWeightKg: null,
  });

  const [currentShiftInfo, setCurrentShiftInfo] = useState(() => calculateProductionShift());

  const applyAutoDraftLotNo = useCallback((productCode, { force = false } = {}) => {
    const nextAutoLotNo = buildAutoScaleLotNo(productCode);
    if (!nextAutoLotNo) {
      return;
    }

    const previousAutoLotNo = autoDraftLotNoRef.current;
    autoDraftLotNoRef.current = nextAutoLotNo;

    setDraftLotNo((currentDraftLotNo) => {
      const normalizedDraftLotNo = String(currentDraftLotNo || "").trim();
      if (
        force
        || !normalizedDraftLotNo
        || normalizedDraftLotNo === previousAutoLotNo
      ) {
        return nextAutoLotNo;
      }
      return currentDraftLotNo;
    });

    setProductProfiles((current) => {
      const currentProfile = normalizeProductProfile(current[productCode]);
      const normalizedProfileLotNo = String(currentProfile.lotNo || "").trim();
      if (
        !force
        && normalizedProfileLotNo
        && normalizedProfileLotNo !== previousAutoLotNo
      ) {
        return current;
      }

      return {
        ...current,
        [productCode]: normalizeProductProfile({
          ...currentProfile,
          lotNo: nextAutoLotNo,
        }),
      };
    });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setCurrentShiftInfo(calculateProductionShift());
    }, 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!selectedProductCode) {
      return;
    }

    applyAutoDraftLotNo(selectedProductCode);
  }, [
    applyAutoDraftLotNo,
    currentShiftInfo.productionDate,
    currentShiftInfo.shift,
    selectedProductCode,
  ]);

  const handlePrintModeChange = useCallback((mode) => {
    setPrintMode(mode);
    writeStorageItem("kpf-weight-scale-print-mode-v1", mode);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !navigator.usb) return;

    const initUsbDevice = async () => {
      try {
        const devices = await navigator.usb.getDevices();
        if (devices.length > 0) {
          setUsbDevice(devices[0]);
          setUsbDeviceName(
            devices[0].productName || 
            `USB Device (0x${devices[0].vendorId.toString(16).toUpperCase()}:0x${devices[0].productId.toString(16).toUpperCase()})`
          );
        }
      } catch (err) {
        console.error("Failed to load paired WebUSB devices:", err);
      }
    };

    if (printMode === "webusb") {
      initUsbDevice();
    }
  }, [printMode]);

  const handlePairUsbDevice = useCallback(async () => {
    if (typeof window === "undefined" || !navigator.usb) {
      alert("เบราว์เซอร์นี้ไม่รองรับ WebUSB (กรุณาใช้ Chrome, Edge หรือ Opera บน HTTPS)");
      return;
    }
    setIsConnectingUsb(true);
    try {
      const device = await navigator.usb.requestDevice({ filters: [] });
      setUsbDevice(device);
      setUsbDeviceName(
        device.productName || 
        `USB Device (0x${device.vendorId.toString(16).toUpperCase()}:0x${device.productId.toString(16).toUpperCase()})`
      );
      setPrinterAgentState("online");
      setPrinterAgentMessage(`เชื่อมต่อเครื่องพิมพ์ USB: ${device.productName || "สำเร็จ"}`);
    } catch (error) {
      console.error("WebUSB pairing failed:", error);
      if (error.name !== "NotFoundError") {
        setPrinterAgentState("offline");
        setPrinterAgentMessage(`เชื่อมต่อ USB ล้มเหลว: ${error.message}`);
      }
    } finally {
      setIsConnectingUsb(false);
    }
  }, []);

  const persistSelectedProductCode = useCallback((productCode) => {
    const nextProductCode = String(productCode || "").trim().toUpperCase();
    setSelectedProductCode(nextProductCode);
    writeStorageItem(SCALE_SELECTED_PRODUCT_STORAGE_KEY, nextProductCode);
  }, []);

  useEffect(() => {
    const storedScale = readStorageItem(SCALE_STORAGE_KEY);
    if (storedScale) {
      try {
        const parsedStoredScale = JSON.parse(storedScale);
        const normalizedStoredScale = {
          ...parsedStoredScale,
          timeoutMs:
            Number(parsedStoredScale?.timeoutMs) > 1000
              ? parsedStoredScale.timeoutMs
              : LEGACY_SCALE_DEFAULTS.timeoutMs,
        };
        setScaleConfig((current) =>
          normalizeScaleConfig(
            {
              ...LEGACY_SCALE_DEFAULTS,
              ...normalizedStoredScale,
            },
            current
          )
        );
      } catch {
        // Ignore invalid saved config so the station can still load.
      }
    }

    const cachedProducts = readCachedProductsFromStorage();
    if (cachedProducts.length && initialProductsState.products.length === 0) {
      setProducts(cachedProducts);
      setIsLoadingProducts(false);
    }

    const storedLots = readStorageItem(SCALE_LOTS_STORAGE_KEY);
    if (storedLots && initialLotsState.lots.length === 0) {
      try {
        const parsedLots = normalizeLotOptions(JSON.parse(storedLots));
        if (parsedLots.length) {
          setLotOptions(parsedLots);
          setIsLoadingLots(false);
        }
      } catch {
        // Ignore invalid cached lots so the station can still load.
      }
    }

    const storedProductCode = readStorageItem(
      SCALE_SELECTED_PRODUCT_STORAGE_KEY
    );
    if (storedProductCode) {
      setSelectedProductCode(String(storedProductCode).trim().toUpperCase());
    }

    const storedProductProfiles = readStorageItem(
      SCALE_PRODUCT_SETTINGS_STORAGE_KEY
    );
    if (storedProductProfiles) {
      try {
        setProductProfiles((current) =>
          mergeProductProfilesWithProducts(
            initialProductsRef.current,
            {
              ...current,
              ...JSON.parse(storedProductProfiles),
            }
          )
        );
      } catch {
        // Ignore invalid saved product settings so the station can still load.
      }
    }
  }, [initialLotsState.lots.length, initialProductsState.products.length]);

  useEffect(() => {
    if (initialProductsState.hasPayload) {
      return undefined;
    }

    let isActive = true;

    async function loadProducts() {
      setIsLoadingProducts(true);
      setProductError("");

      try {
        const payload = await fetchScaleProducts();
        if (!isActive) {
          return;
        }

        const nextProducts = normalizeProductOptions(payload?.products);
        setProducts(nextProducts);
        setProductsPreset(payload?.preset ?? null);
        setProductProfiles((current) =>
          mergeProductProfilesWithProducts(nextProducts, current)
        );
        setIsLoadingProducts(false);
        writeStorageItem(
          SCALE_PRODUCTS_STORAGE_KEY,
          JSON.stringify(nextProducts)
        );

        const preferredCode = readStorageItem(
          SCALE_SELECTED_PRODUCT_STORAGE_KEY
        );
        const nextSelectedCode = resolveSelectedProductCode(
          nextProducts,
          preferredCode
        );
        persistSelectedProductCode(nextSelectedCode);

        if (!nextProducts.length) {
          setProductError(
            "ไม่พบสินค้าที่ผูกกับแผนก KP13 และอยู่ในหมวด 03"
          );
        }
      } catch (error) {
        if (!isActive) {
          return;
        }

        const cachedProducts = readCachedProductsFromStorage();
        setIsLoadingProducts(false);
        setProductError(
          cachedProducts.length
            ? "ไม่สามารถอัปเดตรายการสินค้าได้ กำลังใช้ข้อมูลล่าสุดที่บันทึกไว้ในเครื่อง"
            : error?.message || "ไม่สามารถโหลดรายการสินค้าได้"
        );
      }
    }

    loadProducts();

    return () => {
      isActive = false;
    };
  }, [initialProductsState.hasPayload, persistSelectedProductCode]);

  useEffect(() => {
    if (initialLotsState.hasPayload) {
      return undefined;
    }

    let isActive = true;

    async function loadLots() {
      setIsLoadingLots(true);

      try {
        const payload = await fetchScaleLots();
        if (!isActive) {
          return;
        }

        setLotOptions(normalizeLotOptions(payload?.lots));
        setIsLoadingLots(false);
      } catch {
        if (!isActive) {
          return;
        }

        setIsLoadingLots(false);
      }
    }

    loadLots();

    return () => {
      isActive = false;
    };
  }, [initialLotsState.hasPayload]);

  useEffect(() => {
    if (initialReceiptsState.hasPayload) {
      return undefined;
    }

    if (!productsPreset?.departmentId) {
      setIsLoadingRecentReceipts(false);
      return undefined;
    }

    let isActive = true;

    async function loadRecentReceipts() {
      setIsLoadingRecentReceipts(true);

      try {
        const payload = await fetchScaleRecentReceipts({
          departmentId: productsPreset.departmentId,
          limit: RECENT_RECEIPTS_LIMIT,
        });
        if (!isActive) {
          return;
        }

        setRecentReceipts(normalizeReceiptOptions(payload?.receipts));
        setRecentReceiptsSummary({
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
        });
      } catch {
        if (!isActive) {
          return;
        }

        setRecentReceipts([]);
        setRecentReceiptsSummary({
          totalCount: 0,
          actualCount: 0,
          testCount: 0,
          totalNetWeightKg: 0,
        });
      } finally {
        if (isActive) {
          setIsLoadingRecentReceipts(false);
        }
      }
    }

    loadRecentReceipts();

    return () => {
      isActive = false;
    };
  }, [initialReceiptsState.hasPayload, productsPreset?.departmentId]);

  useEffect(() => {
    if (!products.length) {
      return;
    }

    writeStorageItem(SCALE_PRODUCTS_STORAGE_KEY, JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    if (!products.length) {
      return;
    }

    setProductProfiles((current) =>
      mergeProductProfilesWithProducts(products, current)
    );
  }, [products]);

  useEffect(() => {
    if (!lotOptions.length) {
      return;
    }

    writeStorageItem(SCALE_LOTS_STORAGE_KEY, JSON.stringify(lotOptions));
  }, [lotOptions]);

  useEffect(() => {
    if (!products.length) {
      if (selectedProductCode) {
        persistSelectedProductCode("");
      }
      return;
    }

    const hasSelectedProduct = products.some(
      (product) => product.code === selectedProductCode
    );
    if (hasSelectedProduct) {
      return;
    }

    persistSelectedProductCode(resolveSelectedProductCode(products));
  }, [persistSelectedProductCode, products, selectedProductCode]);

  useEffect(() => {
    return () => {
      closingStreamRef.current = true;
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!isSettingsMenuOpen) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (!settingsMenuRef.current?.contains(event.target)) {
        setIsSettingsMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isSettingsMenuOpen]);

  useEffect(() => {
    if (
      !isPrintingLabel
      || !printLabel
      || printLabel.mode !== "browser"
      || typeof window === "undefined"
    ) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      document.body.classList.add("weight-scale-label-printing");
      window.print();
    }, 120);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isPrintingLabel, printLabel]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleAfterPrint = () => {
      document.body.classList.remove("weight-scale-label-printing");
      setIsPrintingLabel(false);
      setPrintLabel(null);
    };

    window.addEventListener("afterprint", handleAfterPrint);
    return () => {
      window.removeEventListener("afterprint", handleAfterPrint);
      document.body.classList.remove("weight-scale-label-printing");
    };
  }, []);

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
          ? "พร้อมเชื่อมต่อเครื่องชั่งอ่านน้ำหนักล่าสุดสำเร็จ"
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

  const loadSerialSettings = useCallback(async () => {
    setIsLoadingSerialSettings(true);
    setSerialSettingsMessage("");
    try {
      const [healthResult, portsResult, configResult] = await Promise.all([
        fetchScaleAgentHealth(),
        fetchScaleAgentPorts(),
        fetchScaleAgentSerialConfig(),
      ]);
      setSerialPorts(
        Array.isArray(portsResult?.ports)
          ? portsResult.ports.filter((port) => String(port?.path || "").trim())
          : []
      );
      setSerialConfig(normalizeWeightScaleSerialConfig(configResult));
      setSerialSettingsMessage(
        healthResult?.portOpen
          ? "Local Scale Agent พร้อมใช้งาน"
          : "Agent ทำงานอยู่ แต่พอร์ตเครื่องชั่งยังไม่เปิด"
      );
    } catch (error) {
      setSerialPorts([]);
      setSerialSettingsMessage(
        error?.message || "ไม่สามารถติดต่อ Local Scale Agent พอร์ต 41952 ได้"
      );
    } finally {
      setIsLoadingSerialSettings(false);
    }
  }, []);

  useEffect(() => {
    if (!isSettingsOpen || settingsViewMode !== "config" || printMode !== "agent") {
      return;
    }

    void loadLocalPrinters();
  }, [isSettingsOpen, loadLocalPrinters, printMode, settingsViewMode]);

  useEffect(() => {
    if (
      !isSettingsOpen
      || settingsViewMode !== "config"
      || inputMode !== WEIGHT_SCALE_INPUT_MODES.SERIAL
    ) {
      return;
    }

    void loadSerialSettings();
  }, [inputMode, isSettingsOpen, loadSerialSettings, settingsViewMode]);

  const closeStream = useCallback(() => {
    if (connectWatchdogRef.current) {
      window.clearTimeout(connectWatchdogRef.current);
      connectWatchdogRef.current = null;
    }
    closingStreamRef.current = true;
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  const changeInputMode = useCallback((nextMode) => {
    const normalizedMode = nextMode === WEIGHT_SCALE_INPUT_MODES.SERIAL
      ? WEIGHT_SCALE_INPUT_MODES.SERIAL
      : WEIGHT_SCALE_INPUT_MODES.IP;
    closeStream();
    setIsStreaming(false);
    setLiveReading(null);
    autoConnectPausedRef.current = false;
    autoConnectKeyRef.current = "";
    autoSaveStateRef.current = {
      phase: "armed",
      stableSince: null,
      baselineWeightKg: null,
    };
    setInputMode(normalizedMode);
    setStatus({
      connected: false,
      state: "idle",
      message: normalizedMode === WEIGHT_SCALE_INPUT_MODES.SERIAL
        ? "กำลังรอข้อมูลจากเครื่องชั่ง RS232"
        : "พร้อมเชื่อมต่อเครื่องชั่งผ่าน IP",
      readAt: new Date().toISOString(),
    });
  }, [closeStream]);

  useEffect(() => {
    if (inputMode !== WEIGHT_SCALE_INPUT_MODES.SERIAL) return;

    if (serialInput.agentConnected && serialInput.portOpen !== false) {
      setStatus({
        connected: serialInput.isReadingFresh,
        state: serialInput.isReadingFresh ? "connected" : "connecting",
        message: serialInput.isReadingFresh
          ? "เชื่อมต่อเครื่องชั่ง RS232 สำเร็จแล้ว"
          : "เชื่อมต่อ Agent แล้ว กำลังรอน้ำหนักจากเครื่องชั่ง",
        readAt: serialInput.reading?.at || new Date().toISOString(),
      });
      return;
    }

    setStatus({
      connected: false,
      state: serialInput.error ? "error" : "connecting",
      message: serialInput.error || "กำลังเชื่อมต่อ Local Scale Agent พอร์ต 41952",
      readAt: new Date().toISOString(),
    });
  }, [
    inputMode,
    serialInput.agentConnected,
    serialInput.error,
    serialInput.isReadingFresh,
    serialInput.portOpen,
    serialInput.reading?.at,
  ]);

  const startPreview = useCallback(() => {
    if (!selectedProductCode) {
      setProductError("กรุณาเลือกผลิตภัณฑ์ก่อนเริ่มอ่านน้ำหนัก");
      return;
    }

    if (!scaleConfig.host) {
      setStatus({
        connected: false,
        state: "error",
        message: "กรุณาระบุไอพีหรือโฮสต์ของเครื่องชั่ง",
        readAt: new Date().toISOString(),
      });
      return;
    }

    closeStream();
    autoConnectPausedRef.current = false;
    closingStreamRef.current = false;
    setIsStreaming(true);
    setStatus({
      connected: false,
      state: "connecting",
      message: `กำลังเชื่อมต่อ ${scaleConfig.host}:${scaleConfig.port}`,
      readAt: new Date().toISOString(),
    });

    eventSourceRef.current = createScaleStream(scaleConfig, {
      onStatus: (payload) => {
        if (payload?.state === "connected" && connectWatchdogRef.current) {
          window.clearTimeout(connectWatchdogRef.current);
          connectWatchdogRef.current = null;
        }
        setStatus(payload);
      },
      onWeight: (payload) => {
        if (connectWatchdogRef.current) {
          window.clearTimeout(connectWatchdogRef.current);
          connectWatchdogRef.current = null;
        }
        setLiveReading(payload);
        setStatus({
          connected: true,
          state: "connected",
          message: "เชื่อมต่อเครื่องชั่งสำเร็จแล้ว",
          readAt: payload.readAt,
        });
      },
      onDeviceError: (payload) => {
        if (connectWatchdogRef.current) {
          window.clearTimeout(connectWatchdogRef.current);
          connectWatchdogRef.current = null;
        }
        setStatus(payload);
        setIsStreaming(false);
        closeStream();
      },
      onTransportError: () => {
        if (connectWatchdogRef.current) {
          window.clearTimeout(connectWatchdogRef.current);
          connectWatchdogRef.current = null;
        }
        if (closingStreamRef.current) {
          return;
        }

        closeStream();
        setStatus({
          connected: false,
          state: "error",
          message: "ไม่สามารถเชื่อมต่อเครื่องชั่งได้",
          readAt: new Date().toISOString(),
        });
        setIsStreaming(false);
      },
    });

    const expectedConnectMs =
      scaleConfig.timeoutMs * (scaleConfig.connectRetryCount + 1)
      + scaleConfig.connectRetryDelayMs * scaleConfig.connectRetryCount
      + 1500;

    connectWatchdogRef.current = window.setTimeout(() => {
      if (closingStreamRef.current || !eventSourceRef.current) {
        return;
      }

      closeStream();
      setIsStreaming(false);
      setStatus({
        connected: false,
        state: "error",
        message: "พร้อมเชื่อมต่อเครื่องชั่งอ่านน้ำหนักล่าสุดสำเร็จ?",
        readAt: new Date().toISOString(),
      });
    }, expectedConnectMs);
  }, [closeStream, scaleConfig, selectedProductCode]);

  const stopPreview = useCallback(() => {
    closeStream();
    autoConnectPausedRef.current = true;
    setIsStreaming(false);
    setStatus({
      connected: false,
      state: "idle",
      message: "พร้อมเชื่อมต่อเครื่องชั่ง??",
      readAt: new Date().toISOString(),
    });
  }, [closeStream]);

  function updateScaleField(key, value) {
    setScaleConfig((current) =>
      normalizeScaleConfig({ ...current, [key]: value }, current)
    );
  }

  async function saveProfile() {
    if (settingsViewMode === "product") {
      await saveProductSettings();
      return;
    }

    setIsSaving(true);
    try {
      if (inputMode === WEIGHT_SCALE_INPUT_MODES.SERIAL) {
        if (!serialConfig.path) {
          setSerialSettingsMessage("กรุณาเลือกพอร์ต COM ก่อนบันทึก");
          return;
        }
        setIsSavingSerialSettings(true);
        const savedSerial = await saveScaleAgentSerialConfig(serialConfig);
        setSerialConfig(normalizeWeightScaleSerialConfig(savedSerial?.config || savedSerial));
        setSerialSettingsMessage("บันทึกค่า RS232 และเปิดพอร์ตใหม่เรียบร้อยแล้ว");
      }
      if (printMode === "agent" && selectedPrinterName) {
        await saveSelectedPrinter();
      }

      writeStorageItem(SCALE_STORAGE_KEY, JSON.stringify(scaleConfig));
      writeStorageItem(
        SCALE_PRODUCT_SETTINGS_STORAGE_KEY,
        JSON.stringify(normalizeProductProfiles(productProfiles))
      );
      closeStream();
      autoConnectPausedRef.current = false;
      autoConnectKeyRef.current = "";
      setIsStreaming(false);
      setStatus({
        connected: false,
        state: "idle",
        message: "บันทึกค่าการเชื่อมต่อไว้ในเครื่องนี้แล้ว",
        readAt: new Date().toISOString(),
      });
      setIsSettingsOpen(false);
    } finally {
      setIsSavingSerialSettings(false);
      setIsSaving(false);
    }
  }

  async function readOnce() {
    if (!selectedProductCode) {
      setProductError("กรุณาเลือกผลิตภัณฑ์ก่อนอ่านน้ำหนัก");
      return;
    }

    setIsReadingOnce(true);
    try {
      closeStream();
      setIsStreaming(false);
      const result = await fetchScaleCurrent(scaleConfig);
      setLiveReading(result);
      setStatus({
        connected: true,
        state: "connected",
        message: "อ่านน้ำหนักล่าสุดสำเร็จ",
        readAt: result.readAt,
      });
    } catch (error) {
      setStatus({
        connected: false,
        state: "error",
        message: error?.message || "อ่านน้ำหนักไม่สำเร็จ",
        readAt: new Date().toISOString(),
      });
    } finally {
      setIsReadingOnce(false);
    }
  }

  async function legacySaveWeightResult() {
    if (!selectedProductCode) {
      setProductError("กรุณาเลือกผลิตภัณฑ์ก่อนบันทึกผลชั่ง");
      return;
    }

    if (!Number.isFinite(currentWeightEvaluation.grossWeightKg)) {
      setStatus({
        connected: false,
        state: "warning",
        message: "กรุณาอ่านน้ำหนักก่อนบันทึกผลชั่ง",
        readAt: new Date().toISOString(),
      });
      return;
    }

    setIsSavingWeight(true);
    try {
      if (
        currentWeightEvaluation.hasPassWeight
        && currentWeightEvaluation.isPass === false
      ) {
        setStatus({
          connected: true,
          state: "warning",
          message: `น้ำหนักยังไม่ถึงเกณฑ์: สุทธิ ${currentWeightEvaluation.netWeightKg.toFixed(2)} / เกณฑ์ ${currentWeightEvaluation.passWeightKg.toFixed(2)} Kg`,
          readAt: effectiveWeightReading?.readAt || new Date().toISOString(),
        });
        return;
      }

      setStatus({
        connected: true,
        state: "connected",
        message: "บันทึกผลชั่งสำเร็จ",
        readAt: liveReading?.readAt || new Date().toISOString(),
      });
    } finally {
      setIsSavingWeight(false);
    }
  }

  const selectedProduct = products.find(
    (product) => product.code === selectedProductCode
  );
  const selectedDepartmentId = productsPreset?.departmentId || null;
  const selectedProductProfile = normalizeProductProfile(
    productProfiles[selectedProductCode]
  );
  const selectedLotOption = lotOptions.find(
    (lot) =>
      lot.code === selectedProductCode
      && lot.lotNo === selectedProductProfile.lotNo
  );
  const selectedProductLots = useMemo(
    () =>
      lotOptions.filter((lot) => lot.code === selectedProductCode),
    [lotOptions, selectedProductCode]
  );
  const filteredRecentReceipts = useMemo(
    () => recentReceipts.filter((receipt) => !receipt.isTest),
    [recentReceipts]
  );
  const latestReceipt = filteredRecentReceipts[0] || null;
  const actualReceiptCount = useMemo(
    () => resolveActiveReceiptCount(recentReceiptsSummary.actualCount, recentReceipts),
    [recentReceipts, recentReceiptsSummary.actualCount]
  );
  const printAgentStatusMeta = getPrintAgentStatusMeta(printerAgentState);
  const sourceWeightReading = useMemo(
    () => resolveWeightScaleReading({
      mode: inputMode,
      ipReading: liveReading,
      serialReading: serialInput.isReadingFresh ? serialInput.reading : null,
    }),
    [inputMode, liveReading, serialInput.isReadingFresh, serialInput.reading]
  );
  const isInputStreaming = inputMode === WEIGHT_SCALE_INPUT_MODES.SERIAL
    ? Boolean(
      serialInput.agentConnected
      && serialInput.portOpen !== false
      && serialInput.isReadingFresh
    )
    : isStreaming;
  const effectiveWeightReading = useMemo(() => {
    if (!isTestMode) {
      return sourceWeightReading;
    }

    const manualWeightKg = parseWeightNumber(testWeightInput);
    if (!Number.isFinite(manualWeightKg)) {
      return {
        connected: false,
        unitLabel: scaleConfig.unitLabel,
        weightKg: null,
      };
    }

    return {
      connected: true,
      unitLabel: scaleConfig.unitLabel,
      weightKg: manualWeightKg,
    };
  }, [isTestMode, scaleConfig.unitLabel, sourceWeightReading, testWeightInput]);
  const currentWeightEvaluation = evaluateWeightReading(
    effectiveWeightReading,
    selectedProductProfile
  );

  const saveSelectedPrinter = useCallback(async () => {
    if (!selectedPrinterName) {
      throw new Error("กรุณาเลือกเครื่องพิมพ์ก่อน");
    }

    setIsSavingPrinterSelection(true);
    try {
      await saveLocalPrinterSelection({
        printerName: selectedPrinterName,
      });
      setPrinterAgentState("online");
      setPrinterAgentMessage(`บันทึกเครื่องพิมพ์ ${selectedPrinterName} เรียบร้อยแล้ว`);
    } finally {
      setIsSavingPrinterSelection(false);
    }
  }, [selectedPrinterName]);

  const handleTestPrint = useCallback(async () => {
    setIsTestingPrinter(true);

    try {
      if (printMode === "webusb") {
        if (!usbDevice) {
          throw new Error("กรุณาเชื่อมต่อและเลือกเครื่องพิมพ์ USB ก่อนทดสอบพิมพ์");
        }
        setPrinterAgentState("unknown");
        setPrinterAgentMessage("กำลังส่งคำสั่งทดสอบไปที่เครื่องพิมพ์ USB...");
        const printPayload = buildTestPrintLabel();
        const usbPrintResult = await printWeightScaleLabelViaUsb(usbDevice, printPayload);
        setPrinterAgentState("online");
        setPrinterAgentMessage(
          `ส่งคำสั่งทดสอบพิมพ์ไปที่เครื่องพิมพ์ USB ${usbDeviceName} เรียบร้อยแล้ว`
        );
        console.info("[weight-scale-webusb-test]", usbPrintResult);
      } else {
        await saveSelectedPrinter();
        const printPayload = buildTestPrintLabel();
        await printWeightScaleLabelViaAgent(printPayload);
        setPrinterAgentState("online");
        setPrinterAgentMessage(
          `ส่งคำสั่งทดสอบพิมพ์ไปที่ ${selectedPrinterName} เรียบร้อยแล้ว`
        );
      }
    } catch (error) {
      setPrinterAgentState("offline");
      setPrinterAgentMessage(
        error?.message || "ไม่สามารถส่งคำสั่งทดสอบพิมพ์ได้"
      );
    } finally {
      setIsTestingPrinter(false);
    }
  }, [saveSelectedPrinter, selectedPrinterName, printMode, usbDevice, usbDeviceName]);

  const handleReprintLatestLabel = useCallback(async () => {
    if (!latestReceipt) {
      setStatus({
        connected: false,
        state: "warning",
        message: "ยังไม่มีรายการล่าสุดให้พิมพ์ฉลากซ้ำ",
        readAt: new Date().toISOString(),
      });
      return;
    }

    const matchedProduct = products.find(
      (product) => product.code === latestReceipt.productCode
    );
    const nextPrintLabel = buildWeightScaleReceiptPrintLabel({
      receipt: latestReceipt,
      selectedProduct: matchedProduct,
      unitLabel: liveReading?.unitLabel || scaleConfig.unitLabel,
    });

    if (!nextPrintLabel) {
      setStatus({
        connected: false,
        state: "warning",
        message: "ไม่พบข้อมูลฉลากของรายการล่าสุด",
        readAt: new Date().toISOString(),
      });
      return;
    }

    setIsReprintingLatestLabel(true);

    try {
      await assertReceiptCanReprint(latestReceipt, fetchScaleReceiptReport);
      if (printMode === "webusb") {
        if (!usbDevice) {
          throw new Error("กรุณาเชื่อมต่อและเลือกเครื่องพิมพ์ USB ก่อนพิมพ์");
        }
        await printWeightScaleLabelViaUsb(usbDevice, nextPrintLabel);
        setPrinterAgentState("online");
        setPrinterAgentMessage(
          `พิมพ์ฉลากล่าสุดซ้ำที่เครื่องพิมพ์ USB ${usbDeviceName} เรียบร้อยแล้ว`
        );
        setStatus({
          connected: true,
          state: "connected",
          message: `พิมพ์ฉลากล่าสุดซ้ำเรียบร้อย (${latestReceipt.barcode})`,
          readAt: new Date().toISOString(),
        });
      } else {
        await saveSelectedPrinter();
        await printWeightScaleLabelViaAgent(nextPrintLabel);
        setPrinterAgentState("online");
        setPrinterAgentMessage(
          `พิมพ์ฉลากล่าสุดซ้ำที่ ${selectedPrinterName} เรียบร้อยแล้ว`
        );
        setStatus({
          connected: true,
          state: "connected",
          message: `พิมพ์ฉลากล่าสุดซ้ำเรียบร้อย (${latestReceipt.barcode})`, 
          readAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      setPrinterAgentState("offline");
      setPrinterAgentMessage(
        error?.message || "ไม่สามารถพิมพ์ฉลากล่าสุดซ้ำได้"
      );
      setStatus({
        connected: false,
        state: "warning",
        message:
          error?.message || `ไม่สามารถพิมพ์ฉลากล่าสุดซ้ำผ่าน ${printMode === "webusb" ? "USB" : "local print agent"} ได้`,
        readAt: new Date().toISOString(),
      });
    } finally {
      setIsReprintingLatestLabel(false);
    }
  }, [
    latestReceipt,
    liveReading?.unitLabel,
    products,
    saveSelectedPrinter,
    scaleConfig.unitLabel,
    selectedPrinterName,
    setStatus,
    printMode,
    usbDevice,
    usbDeviceName,
  ]);

  const handleSaveWeightResult = useCallback(async () => {
    if (!selectedProductCode) {
      setProductError("กรุณาเลือกผลิตภัณฑ์ก่อนบันทึกผลชั่ง");
      return;
    }

    if (!Number.isFinite(currentWeightEvaluation.grossWeightKg)) {
      setStatus({
        connected: false,
        state: "warning",
        message: "กรุณาอ่านน้ำหนักก่อนบันทึกผลชั่ง",
        readAt: new Date().toISOString(),
      });
      return;
    }

    setIsSavingWeight(true);
    try {
      if (
        currentWeightEvaluation.hasPassWeight
        && currentWeightEvaluation.isPass === false
      ) {
        setStatus({
          connected: true,
          state: "warning",
          message: `น้ำหนักยังไม่ถึงเกณฑ์: สุทธิ ${currentWeightEvaluation.netWeightKg.toFixed(2)} / เกณฑ์ ${currentWeightEvaluation.passWeightKg.toFixed(2)} Kg`,
          readAt: effectiveWeightReading?.readAt || new Date().toISOString(),
        });
        return;
      }

      if (!selectedDepartmentId || !selectedProduct?.configId) {
        setStatus({
          connected: false,
          state: "warning",
          message: "กรุณาบันทึกค่าผลิตภัณฑ์ในหน้าตั้งค่าก่อนบันทึกผลชั่ง",
          readAt: effectiveWeightReading?.readAt || new Date().toISOString(),
        });
        return;
      }

      const activeLotId =
        selectedProduct.currentLotId
        || selectedLotOption?.lotId
        || null;

      if (!activeLotId) {
        setStatus({
          connected: false,
          state: "warning",
          message: "กรุณาตั้งค่า LOT ปัจจุบันของสินค้านี้ก่อนบันทึกผลชั่ง",
          readAt: effectiveWeightReading?.readAt || new Date().toISOString(),
        });
        return;
      }

      const sourceMetadata = resolveWeightScaleSourceMetadata({
        mode: inputMode,
        ipConfig: scaleConfig,
        serialConfig,
      });
      const result = await saveScaleReceipt({
        requestId: receiptRequestIdRef.current || (receiptRequestIdRef.current = crypto.randomUUID()),
        departmentId: selectedDepartmentId,
        productConfigId: selectedProduct.configId,
        lotId: activeLotId,
        grossWeightKg: currentWeightEvaluation.grossWeightKg,
        tareWeightKg: currentWeightEvaluation.tareWeightKg,
        netWeightKg: currentWeightEvaluation.netWeightKg,
        passWeightKg: currentWeightEvaluation.passWeightKg,
        amountPerPallet: selectedProduct.amountPerPallet,
        recentLimit: RECENT_RECEIPTS_LIMIT,
        metadata: {
          productCode: selectedProduct.code,
          productName: selectedProduct.name,
          lotNo:
            selectedProductProfile.lotNo
            || selectedProduct.currentLot?.lotNo
            || null,
          unit: selectedProduct.unit || null,
          ...sourceMetadata,
          isTest: isTestMode,
          weightSource: isTestMode ? "manual_test" : sourceMetadata.weightSource,
        },
      });

      applyResolvedReceiptLot(result?.receipt);
      receiptRequestIdRef.current = null;
      setRecentReceipts(normalizeReceiptOptions(result?.recentReceipts));
      setRecentReceiptsSummary({
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
        unitLabel: effectiveWeightReading?.unitLabel || scaleConfig.unitLabel,
      });
      let printErrorMessage = "";
      if (nextPrintLabel) {
        try {
          if (printMode === "webusb") {
            if (!usbDevice) {
              throw new Error("ไม่ได้เลือกเครื่องพิมพ์ USB");
            }
            await printWeightScaleLabelViaUsb(usbDevice, nextPrintLabel);
            setPrinterAgentState("online");
            setPrinterAgentMessage("ส่งคำสั่งพิมพ์ฉลากอัตโนมัติ (USB) เรียบร้อยแล้ว");
          } else {
            await printWeightScaleLabelViaAgent(nextPrintLabel);
            setPrinterAgentState("online");
            setPrinterAgentMessage("ส่งคำสั่งพิมพ์ฉลากอัตโนมัติเรียบร้อยแล้ว");
          }
        } catch (printError) {
          setPrinterAgentState("offline");
          printErrorMessage =
            printError?.message || `ไม่สามารถพิมพ์ฉลากผ่าน ${printMode === "webusb" ? "USB" : "local print agent"} ได้`;
          setPrinterAgentMessage(printErrorMessage);
          setPrintLabel({
            ...nextPrintLabel,
            mode: "browser",
          });
        }
      }
      autoSaveStateRef.current = {
        phase: "awaiting-reset",
        stableSince: null,
        baselineWeightKg: null,
      };
      setStatus({
        connected: true,
        state: printErrorMessage ? "warning" : "connected",
        message: printErrorMessage
          ? `บันทึกผลชั่งสำเร็จ${result?.receipt?.barcode ? ` (${result.receipt.barcode})` : ""} แต่พิมพ์ฉลากอัตโนมัติไม่สำเร็จ: ${printErrorMessage}`
          : `บันทึกผลชั่งสำเร็จ${result?.receipt?.barcode ? ` (${result.receipt.barcode})` : ""} และส่งงานพิมพ์เรียบร้อย`,
        readAt:
          result?.receipt?.weighedAt
          || effectiveWeightReading?.readAt
          || new Date().toISOString(),
      });
    } catch (error) {
      autoSaveStateRef.current = {
        phase: "armed",
        stableSince: null,
        baselineWeightKg: null,
      };
      setStatus({
        connected: false,
        state: "error",
        message: error?.message || "ไม่สามารถบันทึกผลชั่งได้",
        readAt: new Date().toISOString(),
      });
    } finally {
      setIsSavingWeight(false);
    }
  // applyResolvedReceiptLot only uses the selected-product values listed below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    currentWeightEvaluation.grossWeightKg,
    currentWeightEvaluation.hasPassWeight,
    currentWeightEvaluation.isPass,
    currentWeightEvaluation.netWeightKg,
    currentWeightEvaluation.passWeightKg,
    currentWeightEvaluation.tareWeightKg,
    effectiveWeightReading?.readAt,
    effectiveWeightReading?.unitLabel,
    inputMode,
    scaleConfig.host,
    scaleConfig.port,
    scaleConfig.unitLabel,
    serialConfig,
    selectedDepartmentId,
    selectedLotOption?.lotId,
    selectedProduct,
    selectedProductCode,
    selectedProductProfile.lotNo,
    isTestMode,
    setStatus,
    printMode,
    usbDevice,
  ]);
  const productOverviewTotalPages = Math.max(
    1,
    Math.ceil(products.length / PRODUCT_OVERVIEW_PAGE_SIZE)
  );
  const currentProductOverviewPage = Math.min(
    productOverviewPage,
    productOverviewTotalPages
  );
  const paginatedOverviewProducts = useMemo(() => {
    const startIndex =
      (currentProductOverviewPage - 1) * PRODUCT_OVERVIEW_PAGE_SIZE;
    return products.slice(
      startIndex,
      startIndex + PRODUCT_OVERVIEW_PAGE_SIZE
    );
  }, [currentProductOverviewPage, products]);
  const paginatedOverviewStart = products.length
    ? (currentProductOverviewPage - 1) * PRODUCT_OVERVIEW_PAGE_SIZE + 1
    : 0;
  const paginatedOverviewEnd = products.length
    ? paginatedOverviewStart + paginatedOverviewProducts.length - 1
    : 0;
  const autoConnectKey = useMemo(
    () =>
      [
        String(scaleConfig.host || "").trim(),
        scaleConfig.port,
        selectedProductCode,
      ].join("|"),
    [scaleConfig.host, scaleConfig.port, selectedProductCode]
  );

  useEffect(() => {
    autoSaveStateRef.current = {
      phase: "armed",
      stableSince: null,
      baselineWeightKg: null,
    };
  }, [isTestMode, selectedProductCode]);

  useEffect(() => {
    if (!selectedProductCode) {
      autoSaveStateRef.current = {
        phase: "armed",
        stableSince: null,
        baselineWeightKg: null,
      };
      return;
    }

    const grossWeightKg = Number(currentWeightEvaluation.grossWeightKg);
    const readAt = effectiveWeightReading?.readAt || new Date().toISOString();
    const currentState = autoSaveStateRef.current;

    if (!Number.isFinite(grossWeightKg)) {
      autoSaveStateRef.current = {
        ...currentState,
        stableSince: null,
        baselineWeightKg: null,
      };
      return;
    }

    if (currentState.phase === "awaiting-reset") {
      if (grossWeightKg <= AUTO_SAVE_RESET_THRESHOLD_KG) {
        autoSaveStateRef.current = {
          phase: "armed",
          stableSince: null,
          baselineWeightKg: null,
        };
        setStatus((previous) => ({
          connected: previous.connected,
          state: "connected",
          message: "น้ำหนักกลับสู่จุดเริ่มต้นแล้ว",
          readAt,
        }));
      }
      return;
    }

    if (
      currentState.phase === "saving"
      || isSavingWeight
      || isTestMode
      || !isInputStreaming
      || isSettingsOpen
      || isProductPickerOpen
      || !currentWeightEvaluation.hasPassWeight
      || currentWeightEvaluation.isPass !== true
    ) {
      autoSaveStateRef.current = {
        ...currentState,
        stableSince: null,
        baselineWeightKg: null,
      };
      return;
    }

    if (!currentState.stableSince || !Number.isFinite(currentState.baselineWeightKg)) {
      autoSaveStateRef.current = {
        phase: "armed",
        stableSince: readAt,
        baselineWeightKg: grossWeightKg,
      };
      setStatus((previous) => {
        if (previous.message === "น้ำหนักผ่านเกณฑ์แล้ว กำลังรอค่านิ่ง") {
          return previous;
        }
        return {
          connected: true,
          state: "connected",
          message: "น้ำหนักผ่านเกณฑ์แล้ว กำลังรอค่านิ่ง",
          readAt,
        };
      });
      return;
    }

    if (
      Math.abs(grossWeightKg - currentState.baselineWeightKg)
      > AUTO_SAVE_STABLE_TOLERANCE_KG
    ) {
      autoSaveStateRef.current = {
        phase: "armed",
        stableSince: readAt,
        baselineWeightKg: grossWeightKg,
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
    setStatus((previous) => ({
      connected: previous.connected,
      state: "connected",
      message: "น้ำหนักนิ่งแล้ว กำลังบันทึกอัตโนมัติ",
      readAt,
    }));
    void handleSaveWeightResult();
  }, [
    currentWeightEvaluation.grossWeightKg,
    currentWeightEvaluation.hasPassWeight,
    currentWeightEvaluation.isPass,
    handleSaveWeightResult,
    isProductPickerOpen,
    isSavingWeight,
    isSettingsOpen,
    isTestMode,
    isInputStreaming,
    effectiveWeightReading?.readAt,
    selectedProductCode,
  ]);

  useEffect(() => {
    if (productOverviewPage <= productOverviewTotalPages) {
      return;
    }
    setProductOverviewPage(productOverviewTotalPages);
  }, [productOverviewPage, productOverviewTotalPages]);

  const filteredProducts = useMemo(() => {
    const normalizedSearchTerm = String(productSearchTerm || "")
      .trim()
      .toLowerCase();

    if (!normalizedSearchTerm) {
      return products;
    }

    return products.filter((product) => {
      const productCode = String(product.code || "").toLowerCase();
      const productName = String(product.name || "").toLowerCase();
      return (
        productCode.includes(normalizedSearchTerm)
        || productName.includes(normalizedSearchTerm)
      );
    });
  }, [productSearchTerm, products]);
  // Main station picker must always select product first.
  // LOT selection/creation is handled in settings panel only.
  const filteredLotOptions = [];
  const hasLotOptions = false;

  function openProductPicker() {
    setProductSearchTerm("");
    setIsProductPickerOpen(true);
  }

  function selectProduct(productCode) {
    const nextProduct = products.find((product) => product.code === productCode);
    const selectedIndex = products.findIndex(
      (product) => product.code === productCode
    );
    const autoLotNo = buildAutoScaleLotNo(productCode);
    setProductError("");
    closeStream();
    setIsStreaming(false);
    autoConnectPausedRef.current = false;
    autoConnectKeyRef.current = "";
    autoDraftLotNoRef.current = autoLotNo;
    setDraftLotNo(autoLotNo);
    persistSelectedProductCode(productCode);
    if (selectedIndex >= 0) {
      setProductOverviewPage(
        Math.floor(selectedIndex / PRODUCT_OVERVIEW_PAGE_SIZE) + 1
      );
    }
    setProductProfiles((current) => ({
      ...current,
      [productCode]: normalizeProductProfile({
        ...nextProduct?.defaultProfile,
        ...current[productCode],
        lotNo:
          autoLotNo
          || String(current?.[productCode]?.lotNo || "").trim()
          || String(nextProduct?.defaultProfile?.lotNo || "").trim(),
      }),
    }));
  }

  function selectLotOption(lotOption) {
    if (!lotOption?.code || !lotOption?.lotNo) {
      return;
    }

    setProductError("");
    closeStream();
    setIsStreaming(false);
    autoConnectPausedRef.current = false;
    autoConnectKeyRef.current = "";
    setDraftLotNo(lotOption.lotNo);
    persistSelectedProductCode(lotOption.code);
    const selectedIndex = products.findIndex(
      (product) => product.code === lotOption.code
    );
    if (selectedIndex >= 0) {
      setProductOverviewPage(
        Math.floor(selectedIndex / PRODUCT_OVERVIEW_PAGE_SIZE) + 1
      );
    }
    setProductProfiles((current) => ({
      ...current,
      [lotOption.code]: normalizeProductProfile({
        ...current[lotOption.code],
        lotNo: lotOption.lotNo,
        status:
          lotOption.status === "active"
            ? "พร้อมใช้งาน"
            : "ปิดใช้งาน",
      }),
    }));
    setIsProductPickerOpen(false);
  }

  function updateSelectedProductProfile(field, value) {
    if (!selectedProductCode) {
      return;
    }

    setProductProfiles((current) => ({
      ...current,
      [selectedProductCode]: normalizeProductProfile({
        ...current[selectedProductCode],
        [field]: value,
      }),
    }));
  }

  function applyScaleConfigToProduct(productCode, config, currentLotNo = null) {
    if (!productCode || !config) {
      return;
    }

    setProducts((currentProducts) =>
      currentProducts.map((product) => {
        if (product.code !== productCode) {
          return product;
        }

        return {
          ...product,
          configId: config.id ?? product.configId ?? null,
          lotFormat: config.lotFormat ?? product.lotFormat ?? "",
          amountPerPallet: config.amountPerPallet ?? product.amountPerPallet ?? null,
          currentLotId: config.currentLotId ?? product.currentLotId ?? null,
          currentLot:
            currentLotNo && config.currentLotId
              ? {
                  id: config.currentLotId,
                  lotNo: currentLotNo,
                  status: "active",
                  openedAt: product.currentLot?.openedAt ?? null,
                  closedAt: null,
                }
              : product.currentLot,
          defaultProfile: normalizeProductProfile({
            ...product.defaultProfile,
            lotNo:
              currentLotNo
              || product.defaultProfile?.lotNo
              || product.currentLot?.lotNo
              || "",
            passWeightKg:
              typeof config.passWeightKg === "number"
                ? String(config.passWeightKg)
                : product.defaultProfile?.passWeightKg || "",
            tareWeightKg:
              typeof config.tareWeightKg === "number"
                ? String(config.tareWeightKg)
                : product.defaultProfile?.tareWeightKg || "",
            status: config.isActive === false ? "ปิดใช้งาน" : "พร้อมใช้งาน",
          }),
        };
      })
    );

    setProductProfiles((current) => ({
      ...current,
      [productCode]: normalizeProductProfile({
        ...current[productCode],
        lotNo:
          currentLotNo
          || current[productCode]?.lotNo
          || "",
        passWeightKg:
          typeof config.passWeightKg === "number"
            ? String(config.passWeightKg)
            : current[productCode]?.passWeightKg || "",
        tareWeightKg:
          typeof config.tareWeightKg === "number"
            ? String(config.tareWeightKg)
            : current[productCode]?.tareWeightKg || "",
        status: config.isActive === false ? "ปิดใช้งาน" : "พร้อมใช้งาน",
      }),
    }));
  }

  function applyResolvedReceiptLot(receipt) {
    const resolvedLotId = String(receipt?.lotId || "").trim();
    const resolvedLotNo = String(receipt?.lotNo || "").trim();
    if (!selectedProductCode || !resolvedLotId || !resolvedLotNo) {
      return;
    }

    setProducts((currentProducts) =>
      currentProducts.map((product) => {
        if (product.code !== selectedProductCode) {
          return product;
        }

        return {
          ...product,
          currentLotId: resolvedLotId,
          currentLot: {
            id: resolvedLotId,
            lotNo: resolvedLotNo,
            status: "active",
            openedAt:
              product.currentLot?.id === resolvedLotId
                ? product.currentLot.openedAt ?? null
                : receipt?.weighedAt ?? null,
            closedAt: null,
          },
          defaultProfile: normalizeProductProfile({
            ...product.defaultProfile,
            lotNo: resolvedLotNo,
          }),
        };
      })
    );

    setProductProfiles((current) => ({
      ...current,
      [selectedProductCode]: normalizeProductProfile({
        ...current[selectedProductCode],
        lotNo: resolvedLotNo,
      }),
    }));

    setLotOptions((currentLots) => {
      const hasResolvedLot = currentLots.some(
        (lot) =>
          lot.code === selectedProductCode && lot.lotId === resolvedLotId
      );
      const nextLots = currentLots.map((lot) => {
        if (lot.code !== selectedProductCode) {
          return lot;
        }

        const isResolvedLot = lot.lotId === resolvedLotId;
        return {
          ...lot,
          isCurrent: isResolvedLot,
          status: isResolvedLot
            ? "active"
            : lot.isCurrent
              ? "closed"
              : lot.status,
          closedAt:
            !isResolvedLot && lot.isCurrent
              ? receipt?.weighedAt ?? lot.closedAt
              : lot.closedAt,
        };
      });

      if (!hasResolvedLot) {
        nextLots.push({
          selectionKey: `${selectedProductCode}::${resolvedLotNo}`,
          code: selectedProductCode,
          name: selectedProduct?.name || "",
          lotNo: resolvedLotNo,
          unit: selectedProduct?.unit || "",
          categoryCode: selectedProduct?.categoryCode || "",
          categoryName: selectedProduct?.categoryName || "",
          productConfigId: selectedProduct?.configId || null,
          lotId: resolvedLotId,
          status: "active",
          openedAt: receipt?.weighedAt || null,
          closedAt: null,
          quantity: 0,
          isCurrent: true,
          isOwner: true,
        });
      }

      return normalizeLotOptions(nextLots);
    });

    autoDraftLotNoRef.current = resolvedLotNo;
    setDraftLotNo(resolvedLotNo);
  }

  async function persistSelectedProductConfig() {
    const result = await saveScaleProductConfig({
      departmentId: selectedDepartmentId,
      skuCode: selectedProductCode,
      lotFormat: selectedProduct?.lotFormat || null,
      passWeightKg: selectedProductProfile.passWeightKg,
      tareWeightKg: selectedProductProfile.tareWeightKg,
      amountPerPallet: selectedProduct?.amountPerPallet,
      status: selectedProductProfile.status,
    });

    applyScaleConfigToProduct(
      selectedProductCode,
      result.config,
      selectedProductProfile.lotNo
    );
    writeStorageItem(
      SCALE_PRODUCT_SETTINGS_STORAGE_KEY,
      JSON.stringify(
        normalizeProductProfiles({
          ...productProfiles,
          [selectedProductCode]: {
            ...selectedProductProfile,
            passWeightKg: result.defaultProfile?.passWeightKg ?? selectedProductProfile.passWeightKg,
            tareWeightKg: result.defaultProfile?.tareWeightKg ?? selectedProductProfile.tareWeightKg,
            status: result.defaultProfile?.status ?? selectedProductProfile.status,
          },
        })
      )
    );

    return result;
  }

  async function saveProductSettings() {
    if (!selectedProductCode || !selectedDepartmentId) {
      setProductError("กรุณาเลือกสินค้าและแผนกก่อนบันทึกการตั้งค่า");
      return;
    }

    setIsSavingProductConfig(true);
    setProductError("");

    try {
      await persistSelectedProductConfig();
      setStatus({
        connected: status.connected,
        state: "connected",
        message: "บันทึกค่าผลิตภัณฑ์เรียบร้อยแล้ว",
        readAt: new Date().toISOString(),
      });
      setIsSettingsOpen(false);
    } catch (error) {
      setProductError(error?.message || "ไม่สามารถบันทึกค่าผลิตภัณฑ์ได้");
    } finally {
      setIsSavingProductConfig(false);
    }
  }

  async function saveProductPickerSetup() {
    const nextLotNo = String(selectedProductProfile.lotNo || "").trim();
    if (!selectedProductCode || !selectedDepartmentId) {
      setProductError("กรุณาเลือกสินค้าและแผนกก่อนเริ่มชั่ง");
      return;
    }
    if (!nextLotNo) {
      setProductError("กรุณาระบุ LOT ปัจจุบันก่อนเริ่มชั่ง");
      return;
    }

    setIsSavingProductConfig(true);
    setProductError("");

    try {
      const persistedConfig = await persistSelectedProductConfig();
      const productConfigId = String(
        persistedConfig?.config?.id
        || selectedProduct?.configId
        || ""
      ).trim();
      const existingLot = lotOptions.find(
        (lot) => lot.code === selectedProductCode && lot.lotNo === nextLotNo
      );

      if (existingLot?.lotId) {
        const result = await setScaleCurrentLot({
          productConfigId,
          lotId: existingLot.lotId,
        });

        setLotOptions((current) =>
          normalizeLotOptions(
            current.map((lot) => {
              if (lot.code !== selectedProductCode) {
                return lot;
              }

              return {
                ...lot,
                isCurrent: lot.lotId === existingLot.lotId,
              };
            })
          )
        );
        applyScaleConfigToProduct(selectedProductCode, result.config, nextLotNo);
      } else {
        const result = await createScaleLot({
          productConfigId,
          lotNo: nextLotNo,
          setAsCurrent: true,
        });

        const nextLot = {
          selectionKey: `${selectedProductCode}::${result.lot.lotNo}`,
          code: selectedProductCode,
          name: selectedProduct?.name || "",
          unit: selectedProduct?.unit || "",
          categoryCode: selectedProduct?.categoryCode || "",
          categoryName: selectedProduct?.categoryName || "",
          productConfigId,
          lotId: result.lot.id,
          lotNo: result.lot.lotNo,
          status: result.lot.status,
          openedAt: result.lot.openedAt,
          closedAt: result.lot.closedAt,
          quantity: 0,
          isCurrent: true,
          isOwner: Boolean(selectedProduct?.isOwner),
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
        applyScaleConfigToProduct(
          selectedProductCode,
          {
            ...persistedConfig.config,
            currentLotId: result.lot.id,
          },
          result.lot.lotNo
        );
      }

      setStatus({
        connected: status.connected,
        state: "connected",
        message: "ตั้งค่าสินค้าพร้อมเริ่มชั่งแล้ว",
        readAt: new Date().toISOString(),
      });
      setIsProductPickerOpen(false);
    } catch (error) {
      setProductError(error?.message || "ไม่สามารถตั้งค่าสินค้าก่อนเริ่มชั่งได้");
    } finally {
      setIsSavingProductConfig(false);
    }
  }

  async function handleCreateLot() {
    const nextLotNo = String(draftLotNo || "").trim();
    if (!selectedProductCode) {
      setProductError("กรุณาเลือกสินค้าก่อนสร้าง LOT");
      return;
    }
    if (!nextLotNo) {
      setProductError("กรุณาระบุ LOT ใหม่");
      return;
    }

    setIsCreatingLot(true);
    setProductError("");

    try {
      let productConfigId = selectedProduct?.configId;
      if (!productConfigId) {
        const persistedConfig = await persistSelectedProductConfig();
        productConfigId = String(
          persistedConfig?.config?.id
          || persistedConfig?.config?.configId
          || ""
        ).trim() || null;
      }
      if (!productConfigId) {
        throw new Error("ไม่พบรหัสการตั้งค่าผลิตภัณฑ์สำหรับสร้าง LOT");
      }

      const result = await createScaleLot({
        productConfigId,
        lotNo: nextLotNo,
        setAsCurrent: true,
      });

      const nextLot = {
        selectionKey: `${selectedProductCode}::${result.lot.lotNo}`,
        code: selectedProductCode,
        name: selectedProduct?.name || "",
        unit: selectedProduct?.unit || "",
        categoryCode: selectedProduct?.categoryCode || "",
        categoryName: selectedProduct?.categoryName || "",
        productConfigId,
        lotId: result.lot.id,
        lotNo: result.lot.lotNo,
        status: result.lot.status,
        openedAt: result.lot.openedAt,
        closedAt: result.lot.closedAt,
        quantity: 0,
        isCurrent: true,
        isOwner: Boolean(selectedProduct?.isOwner),
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

      applyScaleConfigToProduct(
        selectedProductCode,
        {
          id: productConfigId,
          currentLotId: result.lot.id,
          passWeightKg: parseWeightNumber(selectedProductProfile.passWeightKg),
          tareWeightKg: parseWeightNumber(selectedProductProfile.tareWeightKg),
          isActive: selectedProductProfile.status !== "ปิดใช้งาน",
          lotFormat: selectedProduct?.lotFormat || "",
          amountPerPallet: selectedProduct?.amountPerPallet ?? null,
        },
        result.lot.lotNo
      );
      setDraftLotNo("");
      setStatus({
        connected: status.connected,
        state: "connected",
        message: `สร้าง LOT ${result.lot.lotNo} เรียบร้อยแล้ว`, 
        readAt: new Date().toISOString(),
      });
    } catch (error) {
      setProductError(error?.message || "สร้าง LOT ไม่สำเร็จ");
    } finally {
      setIsCreatingLot(false);
    }
  }

  async function handleSetCurrentLot() {
    if (!selectedProduct?.configId || !selectedLotOption?.lotId) {
      setProductError("กรุณาเลือก LOT ที่ต้องการใช้งาน");
      return;
    }

    setIsSwitchingLot(true);
    setProductError("");

    try {
      const result = await setScaleCurrentLot({
        productConfigId: selectedProduct.configId,
        lotId: selectedLotOption.lotId,
      });

      setLotOptions((current) =>
        normalizeLotOptions(
          current.map((lot) => {
            if (lot.code !== selectedProductCode) {
              return lot;
            }

            return {
              ...lot,
              isCurrent: lot.lotId === selectedLotOption.lotId,
            };
          })
        )
      );

      applyScaleConfigToProduct(
        selectedProductCode,
        result.config,
        selectedLotOption.lotNo
      );
      setStatus({
        connected: status.connected,
        state: "connected",
        message: `ตั้ง LOT ${selectedLotOption.lotNo} เป็น LOT ปัจจุบันแล้ว`, 
        readAt: new Date().toISOString(),
      });
    } catch (error) {
      setProductError(error?.message || "ตั้งค่า LOT ไม่สำเร็จ");
    } finally {
      setIsSwitchingLot(false);
    }
  }

  function openSettingsPanel(mode) {
    setIsSettingsMenuOpen(false);
    setSettingsViewMode(mode);
    if (mode === "product") {
      setDraftLotNo("");
    }
    setIsSettingsOpen(true);
  }

  useEffect(() => {
    if (
      inputMode !== WEIGHT_SCALE_INPUT_MODES.IP
      || !selectedProductCode
      || !scaleConfig.host
    ) {
      autoConnectKeyRef.current = "";
      return;
    }

    if (
      autoConnectPausedRef.current
      || isStreaming
      || isReadingOnce
      || isSaving
      || isSettingsOpen
      || isProductPickerOpen
    ) {
      return;
    }

    if (autoConnectKeyRef.current === autoConnectKey) {
      return;
    }

    autoConnectKeyRef.current = autoConnectKey;
    startPreview();
  }, [
    autoConnectKey,
    isProductPickerOpen,
    isReadingOnce,
    isSaving,
    isSettingsOpen,
    isStreaming,
    inputMode,
    scaleConfig.host,
    selectedProductCode,
    startPreview,
  ]);

  return (
    <div className="min-h-screen bg-[#f4f6f8] text-[#262626]">
      {printLabel ? (
        <section
          id="weight-scale-print-label"
          aria-hidden="true"
          className="fixed -left-[9999px] top-0 bg-white text-black"
        >
          <div
            style={{
              width: "85mm",
              minHeight: "50mm",
              padding: "4mm 5mm",
              background: "#ffffff",
              color: "#000000",
              fontFamily: "Tahoma, Noto Sans Thai, sans-serif",
              border: "1px solid #000000",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              boxSizing: "border-box",
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  justifyContent: "space-between",
                  gap: "4mm",
                }}
              >
                <div style={{ minWidth: 0, flex: "1 1 auto" }}>
                  <div style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.08em" }}>
                    ข้อมูลฉลาก
                  </div>
                  <div style={{ marginTop: "1.5mm", fontSize: "14px", fontWeight: 700, lineHeight: 1.2 }}>
                    {printLabel.productName}
                  </div>
                  <div style={{ marginTop: "1mm", fontSize: "10px", fontWeight: 700 }}>
                    รหัสสินค้า {printLabel.productCode}
                  </div>
                </div>
                <div style={{ fontSize: "9px", textAlign: "right", whiteSpace: "nowrap" }}>
                  <div style={{ marginTop: "1mm", fontWeight: 700 }}>LOT {printLabel.lotNo}</div>
                </div>
              </div>

              <div
                style={{
                  marginTop: "3mm",
                  display: "grid",
                  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                  gap: "2mm",
                  fontSize: "10px",
                }}
              >
                <div style={{ border: "1px solid #000000", padding: "2mm" }}>
                  <div style={{ fontWeight: 700 }}>เวลา</div>
                  <div style={{ marginTop: "1mm", fontSize: "11px", fontWeight: 700 }}>
                    {formatDateTime(printLabel.weighedAt)}
                  </div>
                </div>
                <div style={{ border: "1px solid #000000", padding: "2mm" }}>
                  <div style={{ fontWeight: 700 }}>น้ำหนักสุทธิ</div>
                  <div style={{ marginTop: "1mm", fontSize: "13px", fontWeight: 700 }}>
                    {formatWeightDisplay(printLabel.netWeightKg)} {printLabel.unitLabel}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ marginTop: "3mm", textAlign: "center" }}>
              <Barcode
                value={printLabel.barcodeValue}
                format="CODE128"
                width={1.25}
                height={44}
                fontSize={11}
                margin={0}
                displayValue
                background="#ffffff"
                lineColor="#000000"
              />
              <div style={{ marginTop: "1.2mm", fontSize: "10px", fontWeight: 700 }}>
                {printLabel.barcodeText}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      <WeightScalePrimaryHeader
        eyebrow="ชั่งน้ำหนัก"
        badge="พร้อมใช้งาน"
        title="ชั่งน้ำหนักผลิตภัณฑ์"
        compact
        actions={(
          <div className="relative" ref={settingsMenuRef}>
            <button
              type="button"
              onClick={() => setIsSettingsMenuOpen((current) => !current)}
              className="inline-flex h-10 items-center justify-center gap-2 border border-[#d4af37]/35 bg-white/[0.03] px-4 text-sm font-black uppercase tracking-[0.14em] text-white transition hover:border-[#d4af37] hover:bg-white/[0.06] hover:text-[#f3d67a]"
            >
              <Settings size={16} />
              <ChevronDown size={15} />
              ตั้งค่า
            </button>

            {isSettingsMenuOpen ? (
              <div className="absolute right-0 top-full z-20 mt-2 w-56 border border-[#d7dde5] bg-white shadow-[0_12px_30px_rgba(8,17,29,0.18)]">
                <button
                  type="button"
                  onClick={() => openSettingsPanel("config")}
                  className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-[#102C57] transition hover:bg-[#fbf8ef]"
                >
                  <span>คอนฟิก</span>
                  <span className="text-[11px] font-black uppercase tracking-[0.14em] text-[#7d8795]">
                    IP / RS232
                  </span>
                </button>
              </div>
            ) : null}
          </div>
        )}
      />

      <section className="border-b border-[#1f3047] bg-[#102C57] text-white">
        <div className="mx-auto max-w-[84rem] px-4 py-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div
                className={`inline-flex items-center gap-2 border px-4 py-2 text-xs font-black uppercase tracking-[0.18em] ${getStatusTone(status.state)}`}
              >
                <Activity size={14} />
                {status.state}
              </div>

              <div className="flex items-center gap-4 border-l border-white/10 pl-6">
                <div className="flex flex-col">
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">วันที่ผลิต</span>
                  <span className="text-xs font-bold text-[#f3d67a]">{currentShiftInfo.productionDate}</span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-white/40">กะทำงาน</span>
                  <span className="text-xs font-bold text-[#f3d67a]">{formatShiftLabel(currentShiftInfo.shift)}</span>
                </div>
              </div>
            </div>

            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-white/50">
              {formatDateTime(effectiveWeightReading?.readAt || status.readAt)}
            </p>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[88rem] px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-5">
          
          {/* THE MASTER CONSOLE - RESTRUCTURED */}
          <section className="relative overflow-hidden border-2 border-[#d4af37] bg-white shadow-[0_30px_60px_rgba(0,0,0,0.2)]">
            
            {/* 1. PREMIUM PRODUCT HEADER (Context First) */}
            <div className="grid lg:grid-cols-12 border-b-2 border-[#d4af37]/30 bg-[#fbfcfd]">
              <div className="lg:col-span-8 p-4 sm:p-5 lg:p-6 border-b lg:border-b-0 lg:border-r border-[#e2e8f0]">
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-5">
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black uppercase tracking-widest text-black">รหัสผลิตภัณฑ์</span>
                      <span className="mt-1 bg-[#102C57] text-[#d4af37] px-3 py-1 text-sm font-black tracking-wider self-start">
                        {selectedProduct ? selectedProduct.code : "ยังไม่เลือก"}
                      </span>
                    </div>
                    <div className="hidden sm:block h-8 w-px bg-[#e2e8f0]" />
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-black uppercase tracking-widest text-black">ชื่อผลิตภัณฑ์ที่กำลังดำเนินการ</span>
                      <h2 className="mt-1 font-serif text-2xl font-medium text-[#102C57] truncate">
                        {selectedProduct ? selectedProduct.name : "กรุณาเลือกผลิตภัณฑ์จากระบบ"}
                      </h2>
                    </div>
                    <div className="hidden sm:block h-8 w-px bg-[#e2e8f0]" />
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black uppercase tracking-widest text-black">หน่วยนับ</span>
                      <span className="mt-1 text-xl font-bold text-[#102C57]">
                        {selectedProduct?.unit || "Kg"}
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:flex md:items-center gap-3 md:gap-6 pt-4 border-t border-[#e2e8f0]">
                    <div className="flex-1 min-w-0 text-center md:min-w-[15rem] md:flex-[1.4]">
                      <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-black">หมายเลขล็อต</p>
                      <p className="mt-1 whitespace-nowrap text-base font-bold text-black sm:text-xl xl:text-2xl">{selectedProductProfile.lotNo || "-"}</p>
                    </div>
                    
                    <div className="hidden md:block h-10 w-px bg-[#e2e8f0]" />
                    
                    <div className="flex-1 min-w-0 text-center">
                      <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-black">เป้าหมาย (MIN)</p>
                      <p className="mt-1 text-lg sm:text-xl font-bold text-black">{selectedProductProfile.passWeightKg || "0.00"} <span className="text-xs sm:text-sm font-bold">Kg</span></p>
                    </div>
                    
                    <div className="hidden md:block h-10 w-px bg-[#e2e8f0]" />
                    
                    <div className="flex-1 min-w-0 text-center">
                      <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-black">หักภาชนะ (TARE)</p>
                      <p className="mt-1 text-lg sm:text-xl font-bold text-black">{selectedProductProfile.tareWeightKg || "0.00"} <span className="text-xs sm:text-sm font-bold">Kg</span></p>
                    </div>
                    
                    <div className="hidden md:block h-10 w-px bg-[#e2e8f0]" />
                    
                    <div className="flex-1 min-w-0 text-center">
                      <p className="text-[10px] sm:text-xs font-black uppercase tracking-widest text-black">ชั่งแล้ววันนี้</p>
                      <p className="mt-1 text-lg sm:text-xl font-bold text-black">{actualReceiptCount} รายการ</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ACTION PANEL (Top-Right) */}
              <div className="lg:col-span-4 p-4 sm:p-5 lg:p-6 flex flex-col justify-center gap-3 bg-white">
                <button
                  type="button"
                  onClick={openProductPicker}
                  className="flex items-center justify-center gap-2 h-11 border-2 border-[#102C57] text-[10px] font-black uppercase tracking-wider text-[#102C57] transition hover:bg-[#102C57] hover:text-white"
                >
                  <Plus size={16} />
                  เปลี่ยนผลิตภัณฑ์
                </button>
                <button
                  type="button"
                  onClick={inputMode === WEIGHT_SCALE_INPUT_MODES.SERIAL
                    ? () => {
                      setSettingsViewMode("config");
                      setIsSettingsOpen(true);
                    }
                    : (isStreaming ? stopPreview : startPreview)}
                  className={`flex items-center justify-center gap-2 h-11 border-2 text-[10px] font-black uppercase tracking-wider transition ${
                    inputMode === WEIGHT_SCALE_INPUT_MODES.IP && isStreaming
                      ? "border-rose-200 text-rose-600 hover:bg-rose-50"
                      : "border-[#102C57] text-[#102C57] hover:bg-[#102C57] hover:text-white"
                  }`}
                >
                  {inputMode === WEIGHT_SCALE_INPUT_MODES.SERIAL ? <Cable size={16} /> : (isStreaming ? <X size={16} /> : <Radar size={16} />)}
                  {inputMode === WEIGHT_SCALE_INPUT_MODES.SERIAL
                    ? "RS232 เชื่อมต่ออัตโนมัติ"
                    : (isStreaming ? "หยุดเชื่อมต่อ" : "เชื่อมเครื่องชั่ง")}
                </button>
              </div>
            </div>

            {/* 2. MASTER WEIGHT DISPLAY (Hero Bottom) - Fully Responsive */}
            <div className="relative bg-[#102C57] px-4 sm:px-10 py-8 text-center lg:py-12">
              <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#d4af37_1px,transparent_1px)] [background-size:20px_20px]" />
              
              <div className="relative flex flex-col items-center justify-center">
                <div className="flex items-center gap-3 mb-4">
                  <div className={`flex items-center gap-2 px-3 sm:px-4 py-1.5 text-[9px] sm:text-[10px] font-black uppercase tracking-[0.25em] border-2 shadow-sm ${getStatusTone(status.state)}`}>
                    <Activity size={14} />
                    <span className="hidden xs:inline">{status.state === "connected" ? "ระบบเครื่องชั่งออนไลน์" : status.state}</span>
                    <span className="xs:hidden">{status.state}</span>
                  </div>
                </div>

                <div className="relative inline-flex items-baseline gap-2 sm:gap-4">
                  {/* RESPONSIVE GLOWING NUMBERS */}
                  <span className={`font-bold tracking-tighter transition-all duration-300 drop-shadow-[0_0_15px_rgba(212,175,55,0.3)] text-[5.5rem] xs:text-[7rem] sm:text-[10rem] md:text-[12rem] lg:text-[14rem] leading-none ${
                    currentWeightEvaluation.isPass ? "text-emerald-400 drop-shadow-[0_0_20px_rgba(52,211,153,0.4)]" : 
                    currentWeightEvaluation.isPass === false ? "text-rose-500" : "text-[#d4af37]"
                  }`}>
                    {Number.isFinite(Number(effectiveWeightReading?.weightKg))
                      ? Number(effectiveWeightReading.weightKg).toFixed(2)
                      : "0.00"}
                  </span>
                  
                  <div className="flex flex-col items-start gap-1 text-left">
                    <span className="text-xl sm:text-2xl md:text-3xl font-black text-white/40 uppercase tracking-[0.2em]">
                      {effectiveWeightReading?.unitLabel || scaleConfig.unitLabel}
                    </span>
                    <div className="h-1 w-12 sm:w-24 bg-[#d4af37]/20 rounded-full overflow-hidden">
                       <div 
                        className={`h-full transition-all duration-700 ${currentWeightEvaluation.isPass ? "bg-emerald-400" : "bg-[#d4af37]"}`}
                        style={{ width: currentWeightEvaluation.hasPassWeight ? `${Math.min((currentWeightEvaluation.netWeightKg / currentWeightEvaluation.passWeightKg) * 100, 100)}%` : "0%" }}
                      />
                    </div>
                  </div>
                </div>

                <div className="mt-4">
                  <p className={`text-lg font-black uppercase tracking-[0.3em] ${
                     currentWeightEvaluation.isPass ? "text-emerald-400" : 
                     currentWeightEvaluation.isPass === false ? "text-rose-500" : "text-white/60"
                  }`}>
                    {currentWeightEvaluation.message || "กรุณาวางสินค้าบนเครื่องชั่ง"}
                  </p>
                </div>

                {/* BIG SAVE BUTTON - Only visible in Test Mode */}
                <div className="mt-8 w-full max-w-lg min-h-[4rem]">
                  {isTestMode ? (
                    <>
                      <div className="mb-3">
                        <input
                          type="number"
                          value={testWeightInput}
                          onChange={(e) => setTestWeightInput(e.target.value)}
                          placeholder="กรอกน้ำหนักทดสอบ..."
                          className="h-10 w-full border-b border-[#d4af37] bg-transparent text-center text-lg font-bold text-white outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleSaveWeightResult}
                        disabled={isSavingWeight || !selectedProductCode}
                        className="flex items-center justify-center gap-3 w-full h-16 bg-[#d4af37] text-[#102C57] text-lg font-black uppercase tracking-[0.25em] shadow-[0_10px_20px_rgba(212,175,55,0.15)] transition-all duration-300 hover:bg-[#e6c15c] hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                      >
                        {isSavingWeight ? <Loader2 size={24} className="animate-spin" /> : <Save size={24} />}
                        บันทึกข้อมูลการชั่ง
                      </button>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-4">
                      <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">
                        ระบบจะบันทึกข้อมูลอัตโนมัติเมื่อค่านิ่ง
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>

          {/* LOWER SECTION: ACTIVITY JOURNAL */}
          <section className="bg-white border border-[#e2e8f0] shadow-sm">
            <div className="px-8 py-6 border-b border-[#e2e8f0] flex items-center justify-between bg-[#fbfcfd]">
              <div className="flex items-center gap-6">
                <h3 className="text-xs font-black uppercase tracking-[0.25em] text-[#102C57]">บันทึกรายการย้อนหลัง</h3>
              </div>
              
              <button
                type="button"
                onClick={() => void handleReprintLatestLabel()}
                disabled={!latestReceipt || isReprintingLatestLabel || (printMode === "webusb" ? !usbDevice : !selectedPrinterName)}
                className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-[#d4af37] hover:text-[#102C57] transition-colors disabled:opacity-40"
              >
                <Printer size={16} />
                พิมพ์ฉลากล่าสุดซ้ำ
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-[#d7dde5]">
                <thead>
                  <tr className="bg-[#f8fafc] text-sm font-black uppercase tracking-wider text-black">
                    <th className="border border-[#d7dde5] px-3 py-2 text-center leading-5 w-14">ลำดับ</th>
                    <th className="border border-[#d7dde5] px-4 py-2 text-center leading-5">บาร์โค้ด</th>
                    <th className="border border-[#d7dde5] px-4 py-2 text-center leading-5">รหัสสินค้า</th>
                    <th className="border border-[#d7dde5] px-4 py-2 text-center leading-5">ชื่อสินค้า</th>
                    <th className="border border-[#d7dde5] px-4 py-2 text-center leading-5">หมายเลขล็อต</th>
                    <th className="border border-[#d7dde5] px-3 py-2 text-center leading-5 w-20">จำนวน</th>
                    <th className="border border-[#d7dde5] px-4 py-2 text-center leading-5">น้ำหนักสุทธิ</th>
                    <th className="border border-[#d7dde5] px-4 py-2 text-center leading-5">เวลาที่ชั่ง</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-bold leading-5 text-black">
                  {isLoadingRecentReceipts ? (
                    <tr>
                      <td colSpan={8} className="border border-[#d7dde5] px-8 py-16 text-center uppercase tracking-widest text-[#a0aec0]">กำลังโหลดข้อมูล...</td>
                    </tr>
                  ) : filteredRecentReceipts.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="border border-[#d7dde5] px-8 py-16 text-center uppercase tracking-widest text-[#a0aec0]">ไม่พบรายการชั่งของวันนี้</td>
                    </tr>
                  ) : (
                    filteredRecentReceipts.map((receipt, index) => (
                      <tr key={receipt.id} className="group hover:bg-[#fbfcfd] transition-colors">
                        <td className="border border-[#d7dde5] px-3 py-2 text-center text-[#7d8795]">
                          {filteredRecentReceipts.length - index}
                        </td>
                        <td className="border border-[#d7dde5] px-4 py-2 font-mono text-center">{receipt.barcode}</td>
                        <td className="border border-[#d7dde5] px-4 py-2 text-center whitespace-nowrap">{receipt.productCode}</td>
                        <td className="border border-[#d7dde5] px-4 py-2 text-center whitespace-nowrap">{receipt.productName}</td>
                        <td className="border border-[#d7dde5] px-4 py-2 text-center">{receipt.lotNo}</td>
                        <td className="border border-[#d7dde5] px-3 py-2 text-center">1</td>
                        <td className="border border-[#d7dde5] px-4 py-2 text-center whitespace-nowrap">
                          {formatWeightDisplay(receipt.netWeightKg)} Kg
                        </td>
                        <td className="border border-[#d7dde5] px-4 py-2 text-center">{formatDateTime(receipt.weighedAt)}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      {isSettingsOpen ? (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/45 px-3 py-3 sm:py-5">
          <div className={`w-full border border-[#d7dde5] bg-white ${settingsViewMode === "product" ? "max-h-[88vh] max-w-[88vw] overflow-hidden xl:max-w-[1360px]" : "max-w-xl"}`}>
            <div className="flex items-center justify-between border-b border-[#d7dde5] bg-[#102C57] px-6 py-4 text-white">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#d4af37]">
                  {settingsViewMode === "product"
                    ? "ตั้งค่าผลิตภัณฑ์"
                    : "การเชื่อมต่อ"}
                </p>
                <h2 className="mt-2 text-2xl font-light uppercase tracking-[0.04em]">
                  {settingsViewMode === "product"
                    ? "ข้อมูลผลิตภัณฑ์"
                    : "ตั้งค่าเครื่องชั่ง"}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center border border-white/20 text-white transition hover:border-[#d4af37] hover:text-[#d4af37]"
                aria-label="ปิดหน้าต่างตั้งค่า"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[calc(88vh-9.5rem)] space-y-4 overflow-y-auto px-5 py-5">
              {settingsViewMode === "config" ? (
                <>
                  <div className="space-y-3 border border-[#d7dde5] bg-[#fbfcfd] p-4">
                    <span className="text-sm font-black uppercase tracking-[0.08em] text-[#4f6076]">
                      แหล่งอ่านน้ำหนัก
                    </span>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => changeInputMode(WEIGHT_SCALE_INPUT_MODES.IP)}
                        className={`h-11 border text-xs font-black uppercase tracking-[0.08em] transition ${inputMode === WEIGHT_SCALE_INPUT_MODES.IP ? "border-[#102C57] bg-[#102C57] text-white" : "border-[#d7dde5] bg-white text-[#102C57]"}`}
                      >
                        IP Network (เดิม)
                      </button>
                      <button
                        type="button"
                        onClick={() => changeInputMode(WEIGHT_SCALE_INPUT_MODES.SERIAL)}
                        className={`h-11 border text-xs font-black uppercase tracking-[0.08em] transition ${inputMode === WEIGHT_SCALE_INPUT_MODES.SERIAL ? "border-[#102C57] bg-[#102C57] text-white" : "border-[#d7dde5] bg-white text-[#102C57]"}`}
                      >
                        RS232 → USB
                      </button>
                    </div>
                  </div>

                  {inputMode === WEIGHT_SCALE_INPUT_MODES.IP ? CONFIG_FIELDS.map((field) => (
                      <label key={field.key} className="block space-y-2">
                        <span className="text-sm font-black uppercase tracking-[0.08em] text-[#4f6076]">
                          {field.label}
                        </span>
                        <input
                          value={scaleConfig[field.key]}
                          onChange={(event) =>
                            updateScaleField(field.key, event.target.value)
                          }
                          inputMode={field.inputMode}
                          placeholder={field.placeholder}
                          className="h-12 w-full border border-[#d7dde5] bg-[#fbfcfd] px-4 text-[#102C57] outline-none transition focus:border-[#d4af37] focus:bg-white"
                        />
                      </label>
                    )) : (
                      <div className="space-y-3 border border-[#d7dde5] p-4">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-[#102C57]">เครื่องชั่ง RS232 → USB</p>
                            <p className="text-xs text-[#5f6b7b]">Weight Scale Agent · Port 41952</p>
                          </div>
                          <span className={`border px-2 py-1 text-[10px] font-black ${serialInput.agentConnected ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
                            {serialInput.agentConnected ? "AGENT ONLINE" : "AGENT OFFLINE"}
                          </span>
                        </div>
                        <label className="block space-y-2">
                          <span className="text-xs font-black text-[#4f6076]">พอร์ต COM</span>
                          <select
                            value={serialConfig.path}
                            onChange={(event) => setSerialConfig((current) => ({ ...current, path: event.target.value }))}
                            className="h-11 w-full border border-[#d7dde5] bg-white px-3 text-[#102C57]"
                          >
                            <option value="">เลือกพอร์ต COM</option>
                            {serialPorts.map((port) => (
                              <option key={port.path} value={port.path}>
                                {port.path}{port.friendlyName ? ` · ${port.friendlyName}` : ""}
                              </option>
                            ))}
                          </select>
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            ["baudRate", "Baud rate", [9600, 19200, 38400, 57600, 115200]],
                            ["dataBits", "Data bits", [7, 8]],
                            ["parity", "Parity", ["none", "even", "odd"]],
                            ["stopBits", "Stop bits", [1, 1.5, 2]],
                          ].map(([key, label, options]) => (
                            <label key={key} className="block space-y-2">
                              <span className="text-xs font-black text-[#4f6076]">{label}</span>
                              <select
                                value={serialConfig[key]}
                                onChange={(event) => setSerialConfig((current) => ({
                                  ...current,
                                  [key]: key === "parity" ? event.target.value : Number(event.target.value),
                                }))}
                                className="h-11 w-full border border-[#d7dde5] bg-white px-3 text-[#102C57]"
                              >
                                {options.map((option) => <option key={option} value={option}>{option}</option>)}
                              </select>
                            </label>
                          ))}
                        </div>
                        <div className="bg-[#102C57] px-4 py-4 text-center text-white">
                          <p className="text-xs text-white/60">น้ำหนักทดสอบ Realtime</p>
                          <p className="mt-1 text-4xl font-black">{Number(serialInput.reading?.weightKg || 0).toFixed(3)} <span className="text-base">kg</span></p>
                          <p className="mt-2 text-xs text-white/70">พอร์ต {serialInput.portOpen ? "เปิด" : "ปิด"} · {serialInput.isReadingFresh ? "LIVE" : "รอข้อมูล"}</p>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs text-[#5f6b7b]">{serialSettingsMessage || serialInput.error}</p>
                          <button
                            type="button"
                            onClick={() => void loadSerialSettings()}
                            disabled={isLoadingSerialSettings}
                            className="inline-flex h-9 items-center gap-2 border border-[#d7dde5] px-3 text-xs font-black text-[#102C57] disabled:opacity-50"
                          >
                            <RefreshCw size={14} className={isLoadingSerialSettings ? "animate-spin" : ""} />
                            รีเฟรชพอร์ต
                          </button>
                        </div>
                      </div>
                    )}

                  <div className="space-y-4 border border-dashed border-[#d7dde5] p-4 bg-[#fbfcfd]">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-black uppercase tracking-[0.08em] text-[#4f6076]">
                        โหมดการพิมพ์
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handlePrintModeChange("agent")}
                        className={`h-11 text-xs font-black uppercase tracking-[0.08em] border transition ${
                          printMode === "agent"
                            ? "bg-[#102C57] text-white border-[#102C57]"
                            : "bg-white text-[#102C57] border-[#d7dde5] hover:border-[#102C57]"
                        }`}
                      >
                        Local Agent
                      </button>
                      <button
                        type="button"
                        onClick={() => handlePrintModeChange("webusb")}
                        className={`h-11 text-xs font-black uppercase tracking-[0.08em] border transition ${
                          printMode === "webusb"
                            ? "bg-[#102C57] text-white border-[#102C57]"
                            : "bg-white text-[#102C57] border-[#d7dde5] hover:border-[#102C57]"
                        }`}
                      >
                        Direct WebUSB
                      </button>
                    </div>

                    {printMode === "webusb" ? (
                      <div className="space-y-3 pt-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-bold text-[#4f6076]">
                            เครื่องพิมพ์ USB ที่จับคู่ไว้
                          </span>
                          <span
                            className={`inline-flex items-center px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] border ${
                              usbDevice
                                ? "border-green-500 bg-green-50 text-green-700"
                                : "border-amber-500 bg-amber-50 text-amber-700"
                            }`}
                          >
                            {usbDevice ? "เชื่อมต่อแล้ว" : "ยังไม่ได้เลือก"}
                          </span>
                        </div>

                        {usbDevice ? (
                          <div className="border border-green-200 bg-green-50/50 px-3 py-2 text-xs text-green-800 rounded-sm">
                            <p className="font-semibold">{usbDeviceName}</p>
                            <p className="text-[10px] text-green-600 mt-0.5">
                              Vendor ID: 0x{usbDevice.vendorId.toString(16).toUpperCase()} / 
                              Product ID: 0x{usbDevice.productId.toString(16).toUpperCase()}
                            </p>
                          </div>
                        ) : (
                          <div className="border border-amber-200 bg-amber-50/50 px-3 py-2 text-xs text-amber-800 rounded-sm">
                            กรุณาคลิกปุ่มจับคู่เครื่องพิมพ์ USB เพื่อเริ่มใช้งาน
                          </div>
                        )}

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handlePairUsbDevice}
                            disabled={isConnectingUsb}
                            className="flex-1 inline-flex h-10 items-center justify-center gap-2 border border-[#102C57] bg-[#102C57] text-white px-4 text-xs font-bold transition hover:bg-[#0d3a71] disabled:opacity-60"
                          >
                            {isConnectingUsb ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <RefreshCw size={14} />
                            )}
                            จับคู่เครื่องพิมพ์ USB
                          </button>
                          
                          <button
                            type="button"
                            onClick={() => void handleTestPrint()}
                            disabled={isTestingPrinter || !usbDevice}
                            className="inline-flex h-10 items-center justify-center gap-2 border border-green-700 bg-green-700 text-white px-4 text-xs font-bold transition hover:bg-green-800 disabled:opacity-50"
                          >
                            {isTestingPrinter ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Printer size={14} />
                            )}
                            ทดสอบพิมพ์
                          </button>
                        </div>
                        {printerAgentMessage ? (
                          <p className="rounded-sm border border-slate-200 bg-white px-3 py-2 text-xs leading-5 text-[#102C57]">
                            {printerAgentMessage}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <div className="space-y-2 pt-2">
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-xs font-bold text-[#4f6076]">
                            เลือกเครื่องพิมพ์จาก Agent
                          </span>
                          <span
                            className={`inline-flex items-center border px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] ${printAgentStatusMeta.className}`}
                          >
                            Agent: {printAgentStatusMeta.label}
                          </span>
                        </div>

                        <select
                          value={selectedPrinterName}
                          onChange={(event) => setSelectedPrinterName(event.target.value)}
                          disabled={isLoadingPrinters || !printerOptions.length}
                          className="h-12 w-full border border-[#d7dde5] bg-[#fbfcfd] px-4 text-[#102C57] outline-none transition focus:border-[#d4af37] focus:bg-white disabled:cursor-not-allowed disabled:bg-[#f1f5f9]"
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

                        {selectedPrinterName ? (
                          <div className="border border-[#d7dde5] bg-[#fbfcfd] px-4 py-3 text-xs text-[#102C57]">
                            {(() => {
                              const selectedPrinter = printerOptions.find(
                                (printer) => printer.name === selectedPrinterName
                              );

                              if (!selectedPrinter) {
                                return (
                                  <p>
                                    เครื่องที่เลือก: <span className="font-semibold">{selectedPrinterName}</span>
                                  </p>
                                );
                              }

                              return (
                                <div className="space-y-1">
                                  <p>
                                    เครื่องที่เลือก: <span className="font-semibold">{selectedPrinter.name}</span>
                                  </p>
                                  <p className="text-[#5f6b7b]">
                                    สถานะ: {formatPrinterStatus(selectedPrinter)}
                                    {selectedPrinter.portName ? ` / พอร์ต ${selectedPrinter.portName}` : ""}
                                    {selectedPrinter.driverName ? ` / ไดรเวอร์ ${selectedPrinter.driverName}` : ""}
                                  </p>
                                </div>
                              );
                            })()}
                          </div>
                        ) : null}

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
                            onClick={() => void handleTestPrint()}
                            disabled={
                              isTestingPrinter
                              || isLoadingPrinters
                              || !selectedPrinterName
                            }
                            className="inline-flex h-10 items-center justify-center gap-2 border border-[#102C57] bg-[#102C57] px-4 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-[#0d3a71] disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isTestingPrinter ? (
                              <Loader2 size={14} className="animate-spin" />
                            ) : (
                              <Printer size={14} />
                            )}
                            ทดสอบพิมพ์
                          </button>
                        </div>
                      </div>
                    )}
                  </div>


                </>
              ) : (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,13fr)_minmax(0,7fr)]">
                  <section className="overflow-hidden border border-[#102C57] bg-white">
                    <div className="border-b border-[#102C57] bg-[#102C57] px-4 py-3 text-white">
                      <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#d4af37]">
                        ภาพรวมสินค้า
                      </p>
                      <h3 className="mt-2 text-base font-light uppercase tracking-[0.06em] text-white">
                        เลือกสินค้าจากรายการทางซ้าย
                      </h3>
                    </div>

                    <div className="border-b border-[#d7dde5] bg-[#fafafa] px-4 py-2 text-[11px] leading-4 text-[#5f6b7b]">
                      คลิกที่แถวของสินค้าเพื่อเปิดรายละเอียดและแก้ค่า LOT ปัจจุบัน น้ำหนักผ่าน และน้ำหนักภาชนะได้ทันที
                    </div>

                    <div className="bg-white">
                      <div className="grid grid-cols-[1.1fr_3fr_1.4fr_1.3fr_1.2fr_1.2fr] border-b border-[#102C57] bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#5f6b7b]">
                          <span>รหัสสินค้า</span>
                          <span>ชื่อสินค้า</span>
                          <span>LOT ปัจจุบัน</span>
                          <span>สถานะ</span>
                          <span>น้ำหนักผ่าน</span>
                          <span>น้ำหนักภาชนะ</span>
                        </div>

                        {paginatedOverviewProducts.length ? (
                          paginatedOverviewProducts.map((product) => {
                            const productCode = String(product.code || "").trim().toUpperCase();
                            const overviewProfile = normalizeProductProfile(
                              productProfiles[productCode] ?? product.defaultProfile
                            );
                            const overviewAutoLot = buildAutoScaleLotNo(productCode);
                            const overviewLot =
                              overviewProfile.lotNo
                              || overviewAutoLot
                              || product.currentLot?.lotNo
                              || "-";
                            const isSelected = selectedProductCode === productCode;

                            return (
                              <button
                                key={product.code}
                                type="button"
                                onClick={() => selectProduct(product.code)}
                                className={`grid w-full grid-cols-[1.1fr_3fr_1.4fr_1.3fr_1.2fr_1.2fr] border-b px-3 py-2 text-left transition ${isSelected ? "border-[#102C57] bg-[#102C57] text-white" : "border-[#e4e7eb] bg-white text-[#102C57] hover:bg-[#f5f5f5]"}`}
                              >
                                <span className="whitespace-nowrap pr-2 text-[13px] font-black uppercase tracking-[0.08em]">
                                  {product.code}
                                </span>
                                <span className={`whitespace-nowrap pr-3 text-[13px] leading-5 ${isSelected ? "text-white/92" : "text-black"}`}>
                                  {product.name}
                                </span>
                                <span className={`whitespace-nowrap pr-2 text-[13px] font-semibold ${isSelected ? "text-white" : "text-[#102C57]"}`}>
                                  {overviewLot}
                                </span>
                                <span className="whitespace-nowrap pr-2 text-[11px] font-black uppercase tracking-[0.12em]">
                                  {overviewProfile.status || "พร้อมใช้งาน"}
                                </span>
                                <span className="whitespace-nowrap pr-2 text-[13px]">
                                  {overviewProfile.passWeightKg || "-"}
                                </span>
                                <span className="whitespace-nowrap text-[13px]">
                                  {overviewProfile.tareWeightKg || "-"}
                                </span>
                              </button>
                            );
                          })
                        ) : (
                          <div className="px-5 py-10 text-sm text-[#5f6b7b]">
                            ไม่มีรายการสินค้าที่ต้องตั้งค่า
                          </div>
                        )}

                        {products.length ? (
                          <div className="flex items-center justify-between border-t border-[#d7dde5] bg-[#fafafa] px-3 py-2">
                            <p className="text-xs font-medium text-[#5f6b7b]">
                              {`แสดง ${paginatedOverviewStart}-${paginatedOverviewEnd} จาก ${products.length} รายการ`}
                            </p>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setProductOverviewPage((current) =>
                                    Math.max(1, current - 1)
                                  )
                                }
                                disabled={currentProductOverviewPage <= 1}
                                className="inline-flex h-8 items-center justify-center border border-[#d7dde5] bg-white px-3 text-xs font-black uppercase tracking-[0.14em] text-[#102C57] transition hover:border-[#102C57] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                ก่อนหน้า
                              </button>
                              <span className="text-xs font-black uppercase tracking-[0.14em] text-[#5f6b7b]">
                                {`${currentProductOverviewPage}/${productOverviewTotalPages}`}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setProductOverviewPage((current) =>
                                    Math.min(productOverviewTotalPages, current + 1)
                                  )
                                }
                                disabled={
                                  currentProductOverviewPage >= productOverviewTotalPages
                                }
                                className="inline-flex h-8 items-center justify-center border border-[#d7dde5] bg-white px-3 text-xs font-black uppercase tracking-[0.14em] text-[#102C57] transition hover:border-[#102C57] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                ถัดไป
                              </button>
                            </div>
                          </div>
                        ) : null}
                    </div>
                  </section>

                  <section className="space-y-4 border border-[#d7dde5] bg-white p-4">
                    <div className="border-b border-[#102C57] pb-4">
                      <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#d4af37]">
                        รายละเอียดสินค้า
                      </p>
                      <h3 className="mt-2 break-words text-xl font-light tracking-[0.06em] text-[#102C57]">
                        {selectedProduct ? selectedProduct.name : "เลือกสินค้า"}
                      </h3>
                      {selectedProduct ? (
                        <p className="mt-2 text-sm leading-6 text-[#5f6b7b]">
                          รหัส {selectedProduct.code}
                          {selectedProduct.unit ? ` / หน่วย ${selectedProduct.unit}` : ""}
                        </p>
                      ) : null}
                    </div>

                  <div className="space-y-4 md:col-span-2">
                    <div className="border border-[#d7dde5] bg-[#fbfcfd] p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-black uppercase tracking-[0.08em] text-[#4f6076]">
                            LOT ปัจจุบัน
                          </p>
                          <p className="mt-2 text-lg font-semibold text-[#102C57]">
                            {selectedProductProfile.lotNo || "ยังไม่ได้ตั้ง LOT"}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-[#7d8795]">
                            {selectedProductLots.length
                              ? "สร้าง LOT ใหม่ หรือเลือก LOT เดิมที่ต้องการใช้งานได้ทันที"
                              : "ยังไม่มี LOT ในระบบสำหรับสินค้านี้"}
                          </p>
                        </div>

                        {selectedLotOption?.isCurrent ? (
                          <span className="inline-flex h-10 items-center border border-[#d4af37] bg-white px-3 text-[11px] font-black uppercase tracking-[0.16em] text-[#102C57]">
                            ใช้งานอยู่
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                        <input
                          value={draftLotNo}
                          onChange={(event) => setDraftLotNo(event.target.value)}
                          placeholder="สร้าง LOT ใหม่ เช่น BIS-260417-A"
                          className="h-12 w-full border border-[#d7dde5] bg-white px-4 text-[#102C57] outline-none transition focus:border-[#d4af37]"
                        />
                        <button
                          type="button"
                          onClick={handleCreateLot}
                          disabled={
                            isCreatingLot
                            || !selectedProductCode
                          }
                          className="inline-flex h-12 items-center justify-center gap-2 border border-[#102C57] bg-[#102C57] px-4 text-sm font-black uppercase tracking-[0.14em] text-white transition hover:bg-[#0d2448] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isCreatingLot ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Plus size={16} />
                          )}
                          สร้าง LOT
                        </button>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                        <select
                          value={selectedProductProfile.lotNo}
                          onChange={(event) =>
                            updateSelectedProductProfile("lotNo", event.target.value)
                          }
                          disabled={!selectedProductLots.length}
                          className="h-12 w-full border border-[#d7dde5] bg-white px-4 text-[#102C57] outline-none transition focus:border-[#d4af37] disabled:cursor-not-allowed disabled:bg-[#f1f5f9]"
                        >
                          {!selectedProductLots.length ? (
                            <option value="">ยังไม่มี LOT สำหรับสินค้า</option>
                          ) : null}
                          {selectedProductLots.map((lot) => (
                            <option key={lot.selectionKey} value={lot.lotNo}>
                              {lot.lotNo}
                              {lot.isCurrent ? " / ใช้งานอยู่" : ""}
                              {getLotStatusLabel(lot.status)
                                ? ` / ${getLotStatusLabel(lot.status)}`
                                : ""}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={handleSetCurrentLot}
                          disabled={
                            isSwitchingLot
                            || !selectedLotOption
                            || selectedLotOption.isCurrent
                            || !selectedProduct?.configId
                          }
                          className="inline-flex h-12 items-center justify-center gap-2 border border-[#d7dde5] bg-white px-4 text-sm font-black uppercase tracking-[0.14em] text-[#102C57] transition hover:border-[#d4af37] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isSwitchingLot ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Check size={16} />
                          )}
                          ใช้ LOT นี้
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <label className="block space-y-2">
                      <span className="text-sm font-black uppercase tracking-[0.08em] text-[#4f6076]">
                        สถานะ
                      </span>
                      <select
                        value={selectedProductProfile.status}
                        onChange={(event) =>
                          updateSelectedProductProfile("status", event.target.value)
                        }
                        className="h-12 w-full border border-[#d7dde5] bg-white px-4 text-[#102C57] outline-none transition focus:border-[#d4af37]"
                      >
                        {PRODUCT_STATUS_OPTIONS.map((statusOption) => (
                          <option key={statusOption} value={statusOption}>
                            {statusOption}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block space-y-2">
                      <span className="text-sm font-black uppercase tracking-[0.08em] text-[#4f6076]">
                        น้ำหนักผ่าน
                      </span>
                      <input
                        value={selectedProductProfile.passWeightKg}
                        onChange={(event) =>
                          updateSelectedProductProfile(
                            "passWeightKg",
                            event.target.value
                          )
                        }
                        inputMode="decimal"
                        placeholder="เช่น 1.500"
                        className="h-12 w-full border border-[#d7dde5] bg-white px-4 text-[#102C57] outline-none transition focus:border-[#d4af37]"
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="text-sm font-black uppercase tracking-[0.08em] text-[#4f6076]">
                        น้ำหนักภาชนะ
                      </span>
                      <input
                        value={selectedProductProfile.tareWeightKg}
                        onChange={(event) =>
                          updateSelectedProductProfile(
                            "tareWeightKg",
                            event.target.value
                          )
                        }
                        inputMode="decimal"
                        placeholder="เช่น 0.250"
                        className="h-12 w-full border border-[#d7dde5] bg-white px-4 text-[#102C57] outline-none transition focus:border-[#d4af37]"
                      />
                    </label>
                  </div>
                  </section>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-[#d7dde5] px-6 py-5">
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="inline-flex h-11 items-center justify-center border border-[#d7dde5] px-5 text-sm font-black uppercase tracking-[0.14em] text-[#5a6b80] transition hover:border-[#d4af37] hover:text-[#102C57]"
              >
                ปิด
              </button>

              <button
                type="button"
                onClick={saveProfile}
                disabled={settingsViewMode === "product" ? isSavingProductConfig : isSaving}
                className="inline-flex h-11 items-center justify-center gap-2 border border-[#102C57] bg-[#102C57] px-5 text-sm font-black uppercase tracking-[0.14em] text-white transition hover:bg-[#0d2448] disabled:opacity-60"
              >
                {(settingsViewMode === "product" ? isSavingProductConfig : isSaving) ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                บันทึก
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {false && isProductPickerOpen ? (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-w-5xl border border-[#d7dde5] bg-white">
            <div className="flex items-center justify-between border-b border-[#d7dde5] bg-[#102C57] px-6 py-4 text-white">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#d4af37]">
                  {hasLotOptions ? "เลือกล็อต" : "เลือกสินค้า"}
                </p>
                <h2 className="mt-2 text-2xl font-light uppercase tracking-[0.04em]">
                  {hasLotOptions
                    ? "เลือกล็อตสำหรับชั่ง"
                    : "เลือกผลิตภัณฑ์"}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setIsProductPickerOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center border border-white/20 text-white transition hover:border-[#d4af37] hover:text-[#d4af37]"
                aria-label="ปิดตัวเลือกสินค้า"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[calc(88vh-9.5rem)] space-y-4 overflow-y-auto px-5 py-5">
              {settingsViewMode === "config" ? (
                <>
                  {CONFIG_FIELDS.map((field) => (
                    <label key={field.key} className="block space-y-2">
                      <span className="text-sm font-black uppercase tracking-[0.08em] text-[#4f6076]">
                        {field.label}
                      </span>
                      <input
                        value={scaleConfig[field.key]}
                        onChange={(event) =>
                          updateScaleField(field.key, event.target.value)
                        }
                        inputMode={field.inputMode}
                        placeholder={field.placeholder}
                        className="h-12 w-full border border-[#d7dde5] bg-[#fbfcfd] px-4 text-[#102C57] outline-none transition focus:border-[#d4af37] focus:bg-white"
                      />
                    </label>
                  ))}

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm font-black uppercase tracking-[0.08em] text-[#4f6076]">
                        เครื่องพิมพ์ฉลาก
                      </span>
                      <span
                        className={`inline-flex items-center border px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] ${printAgentStatusMeta.className}`}
                      >
                        Local Agent: {printAgentStatusMeta.label}
                      </span>
                    </div>

                    <select
                      value={selectedPrinterName}
                      onChange={(event) => setSelectedPrinterName(event.target.value)}
                      disabled={isLoadingPrinters || !printerOptions.length}
                      className="h-12 w-full border border-[#d7dde5] bg-[#fbfcfd] px-4 text-[#102C57] outline-none transition focus:border-[#d4af37] focus:bg-white disabled:cursor-not-allowed disabled:bg-[#f1f5f9]"
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

                    {selectedPrinterName ? (
                      <div className="border border-[#d7dde5] bg-[#fbfcfd] px-4 py-3 text-sm text-[#102C57]">
                        {(() => {
                          const selectedPrinter = printerOptions.find(
                            (printer) => printer.name === selectedPrinterName
                          );

                          if (!selectedPrinter) {
                            return (
                              <p>
                                เครื่องที่เลือก: <span className="font-semibold">{selectedPrinterName}</span>
                              </p>
                            );
                          }

                          return (
                            <div className="space-y-1">
                              <p>
                                เครื่องที่เลือก: <span className="font-semibold">{selectedPrinter.name}</span>
                              </p>
                              <p className="text-[#5f6b7b]">
                                สถานะ: {formatPrinterStatus(selectedPrinter)}
                                {selectedPrinter.portName ? ` / พอร์ต ${selectedPrinter.portName}` : ""}
                                {selectedPrinter.driverName ? ` / ไดรเวอร์ ${selectedPrinter.driverName}` : ""}
                              </p>
                            </div>
                          );
                        })()}
                      </div>
                    ) : null}

                    <p className="text-sm leading-6 text-[#5f6b7b]">
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
                        onClick={() => void handleTestPrint()}
                        disabled={
                          isTestingPrinter
                          || isLoadingPrinters
                          || !selectedPrinterName
                        }
                        className="inline-flex h-10 items-center justify-center gap-2 border border-[#102C57] bg-[#102C57] px-4 text-xs font-black uppercase tracking-[0.14em] text-white transition hover:bg-[#0d3a71] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isTestingPrinter ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Printer size={14} />
                        )}
                        ทดสอบพิมพ์
                      </button>
                    </div>
                  </div>


                </>
              ) : (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,13fr)_minmax(0,7fr)]">
                  <section className="overflow-hidden border border-[#102C57] bg-white">
                    <div className="border-b border-[#102C57] bg-[#102C57] px-4 py-3 text-white">
                      <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#d4af37]">
                        ภาพรวมสินค้า
                      </p>
                      <h3 className="mt-2 text-base font-light uppercase tracking-[0.06em] text-white">
                        เลือกสินค้าจากรายการทางซ้าย
                      </h3>
                    </div>

                    <div className="border-b border-[#d7dde5] bg-[#fafafa] px-4 py-2 text-[11px] leading-4 text-[#5f6b7b]">
                      คลิกที่แถวของสินค้าเพื่อเปิดรายละเอียดและแก้ค่า LOT ปัจจุบัน น้ำหนักผ่าน และน้ำหนักภาชนะได้ทันที
                    </div>

                    <div className="bg-white">
                      <div className="grid grid-cols-[1.1fr_3fr_1.4fr_1.3fr_1.2fr_1.2fr] border-b border-[#102C57] bg-white px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#5f6b7b]">
                          <span>รหัสสินค้า</span>
                          <span>ชื่อสินค้า</span>
                          <span>LOT ปัจจุบัน</span>
                          <span>สถานะ</span>
                          <span>น้ำหนักผ่าน</span>
                          <span>น้ำหนักภาชนะ</span>
                        </div>

                        {paginatedOverviewProducts.length ? (
                          paginatedOverviewProducts.map((product) => {
                            const productCode = String(product.code || "").trim().toUpperCase();
                            const overviewProfile = normalizeProductProfile(
                              productProfiles[productCode] ?? product.defaultProfile
                            );
                            const overviewAutoLot = buildAutoScaleLotNo(productCode);
                            const overviewLot =
                              overviewProfile.lotNo
                              || overviewAutoLot
                              || product.currentLot?.lotNo
                              || "-";
                            const isSelected = selectedProductCode === productCode;

                            return (
                              <button
                                key={product.code}
                                type="button"
                                onClick={() => selectProduct(product.code)}
                                className={`grid w-full grid-cols-[1.1fr_3fr_1.4fr_1.3fr_1.2fr_1.2fr] border-b px-3 py-2 text-left transition ${isSelected ? "border-[#102C57] bg-[#102C57] text-white" : "border-[#e4e7eb] bg-white text-[#102C57] hover:bg-[#f5f5f5]"}`}
                              >
                                <span className="whitespace-nowrap pr-2 text-[13px] font-black uppercase tracking-[0.08em]">
                                  {product.code}
                                </span>
                                <span className={`whitespace-nowrap pr-3 text-[13px] leading-5 ${isSelected ? "text-white/92" : "text-black"}`}>
                                  {product.name}
                                </span>
                                <span className={`whitespace-nowrap pr-2 text-[13px] font-semibold ${isSelected ? "text-white" : "text-[#102C57]"}`}>
                                  {overviewLot}
                                </span>
                                <span className="whitespace-nowrap pr-2 text-[11px] font-black uppercase tracking-[0.12em]">
                                  {overviewProfile.status || "พร้อมใช้งาน"}
                                </span>
                                <span className="whitespace-nowrap pr-2 text-[13px]">
                                  {overviewProfile.passWeightKg || "-"}
                                </span>
                                <span className="whitespace-nowrap text-[13px]">
                                  {overviewProfile.tareWeightKg || "-"}
                                </span>
                              </button>
                            );
                          })
                        ) : (
                          <div className="px-5 py-10 text-sm text-[#5f6b7b]">
                            ไม่มีรายการสินค้าที่ต้องตั้งค่า
                          </div>
                        )}

                        {products.length ? (
                          <div className="flex items-center justify-between border-t border-[#d7dde5] bg-[#fafafa] px-3 py-2">
                            <p className="text-xs font-medium text-[#5f6b7b]">
                              {`แสดง ${paginatedOverviewStart}-${paginatedOverviewEnd} จาก ${products.length} รายการ`}
                            </p>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setProductOverviewPage((current) =>
                                    Math.max(1, current - 1)
                                  )
                                }
                                disabled={currentProductOverviewPage <= 1}
                                className="inline-flex h-8 items-center justify-center border border-[#d7dde5] bg-white px-3 text-xs font-black uppercase tracking-[0.14em] text-[#102C57] transition hover:border-[#102C57] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                ก่อนหน้า
                              </button>
                              <span className="text-xs font-black uppercase tracking-[0.14em] text-[#5f6b7b]">
                                {`${currentProductOverviewPage}/${productOverviewTotalPages}`}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  setProductOverviewPage((current) =>
                                    Math.min(productOverviewTotalPages, current + 1)
                                  )
                                }
                                disabled={
                                  currentProductOverviewPage >= productOverviewTotalPages
                                }
                                className="inline-flex h-8 items-center justify-center border border-[#d7dde5] bg-white px-3 text-xs font-black uppercase tracking-[0.14em] text-[#102C57] transition hover:border-[#102C57] disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                ถัดไป
                              </button>
                            </div>
                          </div>
                        ) : null}
                    </div>
                  </section>

                  <section className="space-y-4 border border-[#d7dde5] bg-white p-4">
                    <div className="border-b border-[#102C57] pb-4">
                      <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#d4af37]">
                        รายละเอียดสินค้า
                      </p>
                      <h3 className="mt-2 break-words text-xl font-light tracking-[0.06em] text-[#102C57]">
                        {selectedProduct ? selectedProduct.name : "เลือกสินค้า"}
                      </h3>
                      {selectedProduct ? (
                        <p className="mt-2 text-sm leading-6 text-[#5f6b7b]">
                          รหัส {selectedProduct.code}
                          {selectedProduct.unit ? ` / หน่วย ${selectedProduct.unit}` : ""}
                        </p>
                      ) : null}
                    </div>

                  <div className="space-y-4 md:col-span-2">
                    <div className="border border-[#d7dde5] bg-[#fbfcfd] p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-black uppercase tracking-[0.08em] text-[#4f6076]">
                            LOT ปัจจุบัน
                          </p>
                          <p className="mt-2 text-lg font-semibold text-[#102C57]">
                            {selectedProductProfile.lotNo || "ยังไม่ได้ตั้ง LOT"}
                          </p>
                          <p className="mt-1 text-xs leading-5 text-[#7d8795]">
                            {selectedProductLots.length
                              ? "สร้าง LOT ใหม่ หรือเลือก LOT เดิมที่ต้องการใช้งานได้ทันที"
                              : "ยังไม่มี LOT ในระบบสำหรับสินค้านี้"}
                          </p>
                        </div>

                        {selectedLotOption?.isCurrent ? (
                          <span className="inline-flex h-10 items-center border border-[#d4af37] bg-white px-3 text-[11px] font-black uppercase tracking-[0.16em] text-[#102C57]">
                            ใช้งานอยู่
                          </span>
                        ) : null}
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                        <input
                          value={draftLotNo}
                          onChange={(event) => setDraftLotNo(event.target.value)}
                          placeholder="สร้าง LOT ใหม่ เช่น BIS-260417-A"
                          className="h-12 w-full border border-[#d7dde5] bg-white px-4 text-[#102C57] outline-none transition focus:border-[#d4af37]"
                        />
                        <button
                          type="button"
                          onClick={handleCreateLot}
                          disabled={
                            isCreatingLot
                            || !selectedProductCode
                          }
                          className="inline-flex h-12 items-center justify-center gap-2 border border-[#102C57] bg-[#102C57] px-4 text-sm font-black uppercase tracking-[0.14em] text-white transition hover:bg-[#0d2448] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isCreatingLot ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Plus size={16} />
                          )}
                          สร้าง LOT
                        </button>
                      </div>

                      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                        <select
                          value={selectedProductProfile.lotNo}
                          onChange={(event) =>
                            updateSelectedProductProfile("lotNo", event.target.value)
                          }
                          disabled={!selectedProductLots.length}
                          className="h-12 w-full border border-[#d7dde5] bg-white px-4 text-[#102C57] outline-none transition focus:border-[#d4af37] disabled:cursor-not-allowed disabled:bg-[#f1f5f9]"
                        >
                          {!selectedProductLots.length ? (
                            <option value="">ยังไม่มี LOT สำหรับสินค้า</option>
                          ) : null}
                          {selectedProductLots.map((lot) => (
                            <option key={lot.selectionKey} value={lot.lotNo}>
                              {lot.lotNo}
                              {lot.isCurrent ? " / ใช้งานอยู่" : ""}
                              {getLotStatusLabel(lot.status)
                                ? ` / ${getLotStatusLabel(lot.status)}`
                                : ""}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={handleSetCurrentLot}
                          disabled={
                            isSwitchingLot
                            || !selectedLotOption
                            || selectedLotOption.isCurrent
                            || !selectedProduct?.configId
                          }
                          className="inline-flex h-12 items-center justify-center gap-2 border border-[#d7dde5] bg-white px-4 text-sm font-black uppercase tracking-[0.14em] text-[#102C57] transition hover:border-[#d4af37] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isSwitchingLot ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : (
                            <Check size={16} />
                          )}
                          ใช้ LOT นี้
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <label className="block space-y-2">
                      <span className="text-sm font-black uppercase tracking-[0.08em] text-[#4f6076]">
                        สถานะ
                      </span>
                      <select
                        value={selectedProductProfile.status}
                        onChange={(event) =>
                          updateSelectedProductProfile("status", event.target.value)
                        }
                        className="h-12 w-full border border-[#d7dde5] bg-white px-4 text-[#102C57] outline-none transition focus:border-[#d4af37]"
                      >
                        {PRODUCT_STATUS_OPTIONS.map((statusOption) => (
                          <option key={statusOption} value={statusOption}>
                            {statusOption}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block space-y-2">
                      <span className="text-sm font-black uppercase tracking-[0.08em] text-[#4f6076]">
                        น้ำหนักผ่าน
                      </span>
                      <input
                        value={selectedProductProfile.passWeightKg}
                        onChange={(event) =>
                          updateSelectedProductProfile(
                            "passWeightKg",
                            event.target.value
                          )
                        }
                        inputMode="decimal"
                        placeholder="เช่น 1.500"
                        className="h-12 w-full border border-[#d7dde5] bg-white px-4 text-[#102C57] outline-none transition focus:border-[#d4af37]"
                      />
                    </label>

                    <label className="block space-y-2">
                      <span className="text-sm font-black uppercase tracking-[0.08em] text-[#4f6076]">
                        น้ำหนักภาชนะ
                      </span>
                      <input
                        value={selectedProductProfile.tareWeightKg}
                        onChange={(event) =>
                          updateSelectedProductProfile(
                            "tareWeightKg",
                            event.target.value
                          )
                        }
                        inputMode="decimal"
                        placeholder="เช่น 0.250"
                        className="h-12 w-full border border-[#d7dde5] bg-white px-4 text-[#102C57] outline-none transition focus:border-[#d4af37]"
                      />
                    </label>
                  </div>
                  </section>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 border-t border-[#d7dde5] px-6 py-5">
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="inline-flex h-11 items-center justify-center border border-[#d7dde5] px-5 text-sm font-black uppercase tracking-[0.14em] text-[#5a6b80] transition hover:border-[#d4af37] hover:text-[#102C57]"
              >
                ปิด
              </button>

              <button
                type="button"
                onClick={saveProfile}
                disabled={settingsViewMode === "product" ? isSavingProductConfig : isSaving}
                className="inline-flex h-11 items-center justify-center gap-2 border border-[#102C57] bg-[#102C57] px-5 text-sm font-black uppercase tracking-[0.14em] text-white transition hover:bg-[#0d2448] disabled:opacity-60"
              >
                {(settingsViewMode === "product" ? isSavingProductConfig : isSaving) ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                บันทึก
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isProductPickerOpen ? (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/45 px-4">
          <div className="w-full max-h-[88vh] max-w-[92vw] overflow-hidden border border-[#d7dde5] bg-white xl:max-w-[1280px]">
            <div className="flex items-center justify-between border-b border-[#d7dde5] bg-[#0a1422] px-6 py-4 text-white">
              <div>
                <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#d4af37]">
                  {hasLotOptions ? "เลือกล็อต" : "เลือกสินค้า"}
                </p>
                <h2 className="mt-2 text-2xl font-light uppercase tracking-[0.04em]">
                  {hasLotOptions
                    ? "เลือกล็อตสำหรับชั่ง"
                    : "เลือกผลิตภัณฑ์"}
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setIsProductPickerOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center border border-white/20 text-white transition hover:border-[#d4af37] hover:text-[#d4af37]"
                aria-label="ปิดตัวเลือกสินค้า"
              >
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-5 px-6 py-6 lg:grid-cols-[minmax(0,1fr)_380px]">
              <div className="space-y-4">
                <div className="relative">
                  <Search
                    size={16}
                    className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#7d8795]"
                  />
                  <input
                    value={productSearchTerm}
                    onChange={(event) => setProductSearchTerm(event.target.value)}
                    placeholder={
                      hasLotOptions
                        ? "ค้นหาชื่อสินค้า หรือรหัส LOT"
                        : "ค้นหาชื่อสินค้า หรือรหัสสินค้า"
                    }
                    className="h-12 w-full border border-[#d7dde5] bg-[#fbfcfd] pl-11 pr-4 text-sm text-[#102C57] outline-none transition focus:border-[#d4af37] focus:bg-white"
                  />
                </div>

                <div className="max-h-[calc(88vh-13rem)] overflow-y-auto border border-[#d7dde5]">
                {isLoadingProducts || isLoadingLots ? (
                  <div className="flex items-center justify-center gap-3 px-6 py-12 text-sm text-[#5f6b7b]">
                    <Loader2 size={18} className="animate-spin" />
                    {hasLotOptions || isLoadingLots
                      ? "กำลังโหลดรายการล็อต..."
                      : "กำลังโหลดรายการสินค้า..."}
                  </div>
                ) : hasLotOptions ? (
                  !filteredLotOptions.length ? (
                    <div className="px-6 py-12 text-center text-sm text-[#7d8795]">
                      {lotOptions.length
                        ? "พร้อมเชื่อมต่อเครื่องชั่ง"
                        : "ยังไม่มี LOT สำหรับสินค้า"}
                    </div>
                  ) : (
                    <div className="divide-y divide-[#e2e8f0]">
                      {filteredLotOptions.map((lot) => {
                        const isSelected =
                          lot.code === selectedProductCode
                          && lot.lotNo === selectedProductProfile.lotNo;
                        return (
                          <button
                            key={lot.selectionKey}
                            type="button"
                            onClick={() => selectLotOption(lot)}
                            className={`flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition ${
                              isSelected
                                ? "bg-[#fff8e2]"
                                : "bg-white hover:bg-[#f8fafc]"
                            }`}
                          >
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-[#102C57]">
                                {lot.name}
                              </p>
                              <p className="mt-1 text-xs text-[#5f6b7b]">
                                รหัส {lot.code}
                                {" / "}
                                LOT {lot.lotNo}
                                {getLotStatusLabel(lot.status)
                                  ? ` / ${getLotStatusLabel(lot.status)}`
                                  : ""}
                              </p>
                            </div>

                            <span
                              className={`shrink-0 border px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] ${
                                isSelected
                                  ? "border-[#d4af37] bg-white text-[#102C57]"
                                  : "border-[#d7dde5] bg-white text-[#5f6b7b]"
                              }`}
                            >
                              {isSelected ? "เลือกแล้ว" : "เลือก"}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )
                ) : !filteredProducts.length ? (
                  <div className="px-6 py-12 text-center text-sm text-[#7d8795]">
                    {products.length
                      ? "ไม่พบล็อตที่ตรงกับคำค้นหา"
                      : "ไม่พบรายการสินค้า"}
                  </div>
                ) : (
                  <table className="w-full border-collapse text-sm">
                    <thead className="sticky top-0 z-10 bg-[#102C57] text-white">
                      <tr className="text-left text-[11px] font-black uppercase tracking-[0.16em]">
                        <th className="w-[8%] border-r border-white/10 px-4 py-3 text-center text-[#f3d67a]">{"\u0e25\u0e33\u0e14\u0e31\u0e1a"}</th>
                        <th className="w-[16%] border-r border-white/10 px-4 py-3 text-[#f3d67a]">{"\u0e23\u0e2b\u0e31\u0e2a"}</th>
                        <th className="border-r border-white/10 px-4 py-3 text-[#f3d67a]">{"\u0e0a\u0e37\u0e48\u0e2d\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32"}</th>
                        <th className="w-[14%] border-r border-white/10 px-4 py-3 text-center text-[#f3d67a]">{"\u0e2b\u0e19\u0e48\u0e27\u0e22"}</th>
                        <th className="w-[14%] px-4 py-3 text-center text-[#f3d67a]">{"\u0e08\u0e31\u0e14\u0e01\u0e32\u0e23"}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#e2e8f0]">
                      {filteredProducts.map((product, productIndex) => {
                        const isSelected = product.code === selectedProductCode;
                        return (
                          <tr
                            key={product.code}
                            className={`transition ${
                              isSelected
                                ? "bg-[#fff8e2]"
                                : "bg-white hover:bg-[#f8fafc]"
                            }`}
                          >
                            <td className="border-r border-[#edf1f5] px-4 py-3 text-center align-middle text-xs font-black text-[#5f6b7b]">
                              {productIndex + 1}
                            </td>
                            <td className="border-r border-[#edf1f5] px-4 py-3 align-middle font-mono text-xs font-bold text-[#102C57]">
                              {product.code}
                            </td>
                            <td className="border-r border-[#edf1f5] px-4 py-3 align-middle">
                              <div className="font-semibold leading-5 text-[#102C57]">
                                {product.name}
                              </div>
                            </td>
                            <td className="border-r border-[#edf1f5] px-4 py-3 text-center align-middle text-xs font-bold uppercase tracking-[0.1em] text-[#5f6b7b]">
                              {product.unit || "-"}
                            </td>
                            <td className="px-4 py-3 text-center align-middle">
                              <button
                                type="button"
                                onClick={() => selectProduct(product.code)}
                                className={`inline-flex h-9 min-w-20 items-center justify-center border px-3 text-[11px] font-black uppercase tracking-[0.14em] transition ${
                                  isSelected
                                    ? "border-[#d4af37] bg-[#fff8e2] text-[#102C57]"
                                    : "border-[#d7dde5] bg-white text-[#102C57] hover:border-[#d4af37] hover:text-[#8a6a00]"
                                }`}
                              >
                                {isSelected ? "\u0e40\u0e25\u0e37\u0e2d\u0e01\u0e41\u0e25\u0e49\u0e27" : "\u0e40\u0e25\u0e37\u0e2d\u0e01"}
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
                </div>
              </div>

              <aside className="border border-[#d7dde5] bg-[#fbfcfd]">
                <div className="border-b border-[#d7dde5] bg-[#102C57] px-5 py-4 text-white">
                  <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#d4af37]">
                    ตั้งค่าก่อนเริ่มชั่ง
                  </p>
                  <h3 className="mt-2 text-lg font-bold text-white">
                    {selectedProduct ? selectedProduct.name : "เลือกสินค้าจากตาราง"}
                  </h3>
                  <p className="mt-1 text-xs font-semibold text-white/65">
                    {selectedProduct
                      ? `รหัส ${selectedProduct.code}${selectedProduct.unit ? ` / หน่วย ${selectedProduct.unit}` : ""}`
                      : "เลือกสินค้า แล้วตรวจ LOT, MIN และ TARE ก่อนใช้งาน"}
                  </p>
                </div>

                <div className="space-y-4 p-5">
                  {productError ? (
                    <div className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                      {productError}
                    </div>
                  ) : null}

                  <label className="block">
                    <span className="text-[11px] font-black uppercase tracking-[0.18em] text-[#102C57]">
                      LOT ปัจจุบัน
                    </span>
                    <input
                      value={selectedProductProfile.lotNo}
                      onChange={(event) => updateSelectedProductProfile("lotNo", event.target.value)}
                      disabled={!selectedProductCode}
                      className="mt-2 h-11 w-full border border-[#d7dde5] bg-white px-3 text-base font-black text-[#102C57] outline-none transition focus:border-[#d4af37] disabled:bg-[#edf1f5] disabled:text-[#8b95a3]"
                    />
                    <p className="mt-2 text-xs leading-5 text-[#5f6b7b]">
                      ระบบเติม LOT ตามวันที่และกะให้อัตโนมัติ แต่ยังแก้ไขหรือใช้ LOT ย้อนหลังได้
                    </p>
                  </label>

                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-[11px] font-black uppercase tracking-[0.18em] text-[#102C57]">
                        น้ำหนักขั้นต่ำ
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step={TEST_WEIGHT_STEP}
                        value={selectedProductProfile.passWeightKg}
                        onChange={(event) => updateSelectedProductProfile("passWeightKg", event.target.value)}
                        disabled={!selectedProductCode}
                        placeholder="เช่น 30.000"
                        className="mt-2 h-11 w-full border border-[#d7dde5] bg-white px-3 text-base font-black text-[#102C57] outline-none transition focus:border-[#d4af37] disabled:bg-[#edf1f5] disabled:text-[#8b95a3]"
                      />
                    </label>

                    <label className="block">
                      <span className="text-[11px] font-black uppercase tracking-[0.18em] text-[#102C57]">
                        น้ำหนักภาชนะ
                      </span>
                      <input
                        type="number"
                        inputMode="decimal"
                        step={TEST_WEIGHT_STEP}
                        value={selectedProductProfile.tareWeightKg}
                        onChange={(event) => updateSelectedProductProfile("tareWeightKg", event.target.value)}
                        disabled={!selectedProductCode}
                        placeholder="เช่น 10.000"
                        className="mt-2 h-11 w-full border border-[#d7dde5] bg-white px-3 text-base font-black text-[#102C57] outline-none transition focus:border-[#d4af37] disabled:bg-[#edf1f5] disabled:text-[#8b95a3]"
                      />
                    </label>
                  </div>

                  <div className="border border-[#e2e8f0] bg-white px-4 py-3">
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-black uppercase tracking-[0.16em] text-[#5f6b7b]">
                        สถานะ
                      </span>
                      <span className="font-black text-[#102C57]">
                        {selectedProductProfile.status}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void saveProductPickerSetup()}
                    disabled={!selectedProductCode || isSavingProductConfig}
                    className="flex h-12 w-full items-center justify-center gap-2 border-2 border-[#d4af37] bg-[#d4af37] px-4 text-sm font-black uppercase tracking-[0.18em] text-[#102C57] transition hover:bg-[#e6c15c] disabled:border-[#d7dde5] disabled:bg-[#edf1f5] disabled:text-[#8b95a3]"
                  >
                    {isSavingProductConfig ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}
                    ใช้สินค้านี้
                  </button>
                </div>
              </aside>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
