"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, ChevronUp, Loader2, Lock, Printer, Radar, Keyboard } from "lucide-react";
import { submitPieceRateLog } from "@/features/attendance/services/pieceRateWorkClient";
import { normalizeEmployeeCode } from "@/lib/employeeCode";
import { printPieceRateSlipDirect } from "@/features/printing/sunmiDirectPrintClient";
import { printPieceRateLabelViaAgent } from "@/features/production-line/services/localPrintAgentClient";
import { buildPieceRateDesktopLabel } from "@/lib/piece-rate-desktop-label";
import {
  findPieceRateOutboxDuplicate,
  getPieceRateNeedsReviewEntries,
  getPieceRateOutboxSummary,
  getPieceRateReadyToPrintEntries,
  markPieceRateOutboxPrinted,
  PIECE_RATE_OUTBOX_CHANGE_EVENT,
  queuePieceRateSubmission,
  requeueFailedPieceRateOutboxEntries,
  requeuePieceRateNeedsReviewEntries,
} from "@/lib/offline/pieceRateOffline";
import { syncPendingPieceRateOutbox } from "@/lib/offline/pieceRateSync";
import {
  getConnectivitySnapshot,
  isAppOnline,
  WRAPPER_NETWORK_CHANGE_EVENT,
} from "@/lib/offline/networkStatus";
import { createSubmitLock } from "@/lib/submitLock";
import {
  disconnectScale,
  getLatestScaleStatusSnapshot,
  getLatestScaleWeightSnapshot,
  getScaleState,
  hasAndroidScaleBridge,
  readStableScaleWeight,
  SCALE_STATUS_CHANGE_EVENT,
  SCALE_WEIGHT_CHANGE_EVENT,
  startScalePreview,
  stopScalePreview,
} from "@/lib/sunmiScaleClient";
import PieceRateDesktopWorkstation from "./PieceRateDesktopWorkstation";

const MACHINE_STORAGE_KEY = "daily_work_machine_code";
const MACHINE_CODE_REGEX = /^[A-Z0-9]{2,8}$/;
const SCALE_CONFIG = Object.freeze({
  baudRate: 9600,
  dataBits: 8,
  stopBits: 1,
  parity: "N",
  handshake: "none",
  previewCommand: "SI",
  stableCommand: "S",
  readTimeoutMs: 900,
  stableReadTimeoutMs: 2500,
  previewIntervalMs: 450,
});
const STABLE_DISPLAY_CONFIG = Object.freeze({
  minSamples: 4,
  holdDurationMs: 1400,
  maxSamples: 12,
  toleranceKg: 0.002,
  sampleWindowMs: 2500,
});
const EMPTY_POPUP_STATE = {
  open: false,
  duplicated: false,
  queued: false,
  title: "",
  tone: "success",
  message: "",
  savedData: null,
};
const DEFAULT_CONNECTIVITY = Object.freeze({
  online: true,
  source: "initial",
});
const DEFAULT_SCALE_STATUS = Object.freeze({
  connected: false,
  state: "idle",
  message: "พร้อมเชื่อมต่อเครื่องชั่ง",
  latestWeightKg: null,
  latestDisplayText: "",
});

function parseScaleValue(value, { allowZero = false } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  if (allowZero ? parsed < 0 : parsed <= 0) {
    return null;
  }
  return Number(parsed.toFixed(4));
}

function parsePositiveScaleNumber(value) {
  return parseScaleValue(value, { allowZero: false });
}

function parseScaleDisplayNumber(value) {
  return parseScaleValue(value, { allowZero: true });
}

function extractDisplayWeight(displayText) {
  const normalized = String(displayText || "").trim();
  if (!normalized) return null;
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  return match ? parseScaleDisplayNumber(match[0]) : null;
}

function resolveScaleResultWeightKg(result) {
  if (!result || typeof result !== "object") {
    return null;
  }

  const unit = String(result?.unit || "").trim().toLowerCase();
  if (unit === "kg") {
    const displayWeight = parseScaleDisplayNumber(result?.displayWeight);
    if (displayWeight !== null) {
      return displayWeight;
    }

    const displayTextWeight = extractDisplayWeight(result?.displayText);
    if (displayTextWeight !== null) {
      return displayTextWeight;
    }
  }

  return parseScaleDisplayNumber(result?.weightKg);
}

function buildRequestId() {
  if (typeof window !== "undefined" && window.crypto?.randomUUID) {
    return window.crypto.randomUUID();
  }
  return `piece-rate-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeMachineCode(value) {
  const normalized = String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return MACHINE_CODE_REGEX.test(normalized) ? normalized : null;
}

async function resolveMachineCode() {
  if (typeof window === "undefined") return null;
  const bridge = window.AndroidPrinter;
  if (bridge && typeof bridge.getMachineCode === "function") {
    try {
      const bridgeResult = bridge.getMachineCode();
      const machineCode = normalizeMachineCode(
        bridgeResult && typeof bridgeResult.then === "function" ? await bridgeResult : bridgeResult
      );
      if (machineCode) {
        window.localStorage?.setItem(MACHINE_STORAGE_KEY, machineCode);
        return machineCode;
      }
    } catch {
      // Fall back to cached machine code.
    }
  }
  return normalizeMachineCode(window.localStorage?.getItem(MACHINE_STORAGE_KEY));
}

function getBangkokDateKey(date = new Date()) {
  const utc = date.getTime() + (date.getTimezoneOffset() * 60000);
  const bangkokDate = new Date(utc + (3600000 * 7));
  return [
    bangkokDate.getFullYear(),
    String(bangkokDate.getMonth() + 1).padStart(2, "0"),
    String(bangkokDate.getDate()).padStart(2, "0"),
  ].join("");
}

const PIECE_RATE_DOC_SEQ_MAX = 999;

function readLocalPieceRateCounter(dateKey) {
  if (typeof window === "undefined" || !dateKey) {
    return { lastRound: 1, lastSeq: 0 };
  }
  try {
    const key = `piece_rate_offline_counter_${dateKey}`;
    const cached = window.localStorage?.getItem(key);
    if (cached) {
      const parsed = JSON.parse(cached);
      const lastSeq = Math.floor(Number(parsed?.lastSeq));
      if (Number.isFinite(lastSeq) && lastSeq > 0) {
        return { lastRound: 1, lastSeq };
      }
    }
  } catch (e) {
    console.error("Failed to parse local counter", e);
  }
  return { lastRound: 1, lastSeq: 0 };
}

function writeLocalPieceRateCounter(dateKey, lastSeq) {
  if (typeof window === "undefined" || !dateKey) return;
  try {
    const key = `piece_rate_offline_counter_${dateKey}`;
    window.localStorage?.setItem(key, JSON.stringify({ lastRound: 1, lastSeq }));
  } catch (e) {
    console.error("Failed to write local counter", e);
  }
}

function raiseLocalPieceRateCounter(docNo, docSeq) {
  const seq = Math.floor(Number(docSeq));
  const dateKey = String(docNo || "").slice(0, 8);
  if (!/^\d{8}$/.test(dateKey) || !Number.isFinite(seq) || seq <= 0) return;
  const localCounter = readLocalPieceRateCounter(dateKey);
  if (seq > localCounter.lastSeq) {
    writeLocalPieceRateCounter(dateKey, seq);
  }
}

function isAmbiguousSubmitFailure(result) {
  if (!result) return true;
  if (result.ok) return false;
  return (
    result.status === 0
    || result.status === 408
    || result.status === 425
    || result.status === 429
    || result.status >= 500
  );
}

function formatPrintTimestamp(timestamp) {
  const parsed = new Date(timestamp || new Date().toISOString());
  if (Number.isNaN(parsed.getTime())) return { timeText: "-", dateText: "-" };
  return {
    timeText: new Intl.DateTimeFormat("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(parsed),
    dateText: new Intl.DateTimeFormat("th-TH", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(parsed),
  };
}

function formatDisplayDateTime(value) {
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(parsed);
}

function formatAmount(value, inputMode) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "-";
  return parsed.toLocaleString("th-TH", {
    minimumFractionDigits: inputMode === "kg" ? 3 : 0,
    maximumFractionDigits: inputMode === "kg" ? 3 : 2,
  });
}

function formatScaleDebugValue(value) {
  if (value === null || value === undefined || value === "") return "-";
  if (Array.isArray(value)) {
    if (!value.length) return "-";
    return value.map((item) => formatScaleDebugValue(item)).join(" | ");
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function resolveStableDisplayWeight(samples, config = STABLE_DISPLAY_CONFIG) {
  if (!Array.isArray(samples) || samples.length < config.minSamples) {
    return null;
  }

  const latestSample = samples[samples.length - 1];
  const stableWindowSamples = samples.filter((sample) => (
    latestSample.measuredAt - sample.measuredAt <= config.holdDurationMs
  ));

  if (stableWindowSamples.length < config.minSamples) {
    return null;
  }

  const stableDuration = latestSample.measuredAt - stableWindowSamples[0].measuredAt;
  if (stableDuration < config.holdDurationMs) {
    return null;
  }

  const weights = stableWindowSamples
    .map((sample) => Number(sample?.weightKg))
    .filter((value) => Number.isFinite(value));

  if (weights.length < config.minSamples) {
    return null;
  }

  const spread = Math.max(...weights) - Math.min(...weights);
  if (spread > config.toleranceKg) {
    return null;
  }

  const average = weights.reduce((sum, value) => sum + value, 0) / weights.length;
  return Number(average.toFixed(4));
}

function formatWeightReadout(value) {
  if (!Number.isFinite(Number(value))) {
    return "--.---";
  }

  return Number(value).toLocaleString("th-TH", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

function formatSegmentWeightReadout(value) {
  const normalized = String(value || "").trim();
  if (normalized) {
    const match = normalized.match(/-?\d+(?:\.\d+)?/);
    if (match) {
      const parsed = Number(match[0]);
      if (Number.isFinite(parsed)) {
        return parsed.toFixed(3);
      }
    }
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return "--.---";
  }
  return parsed.toFixed(3);
}

const SEVEN_SEGMENT_MAP = Object.freeze({
  "0": ["a", "b", "c", "d", "e", "f"],
  "1": ["b", "c"],
  "2": ["a", "b", "g", "e", "d"],
  "3": ["a", "b", "c", "d", "g"],
  "4": ["f", "g", "b", "c"],
  "5": ["a", "f", "g", "c", "d"],
  "6": ["a", "f", "g", "e", "c", "d"],
  "7": ["a", "b", "c"],
  "8": ["a", "b", "c", "d", "e", "f", "g"],
  "9": ["a", "b", "c", "d", "f", "g"],
  "-": ["g"],
});

function ModernDigitalDisplay({ value, isStable, unit }) {
  const [whole, decimal] = String(value || "0.000").split(".");
  
  return (
    <div className="relative w-full flex flex-col items-center justify-center py-2">
      {/* Dynamic Background Glow */}
      <div 
        className={`absolute inset-0 blur-[120px] opacity-25 transition-colors duration-1000 ${
          isStable ? "bg-emerald-500" : "bg-amber-500"
        }`} 
      />
      
      <div className="relative z-10 flex flex-col items-center w-full">
        {/* Status Indicator Badge */}
        <div className={`mb-4 px-8 py-2 rounded-2xl text-[12px] font-black uppercase tracking-[0.4em] transition-all duration-500 border-2 ${
          isStable 
            ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-[0_0_30px_rgba(16,185,129,0.4)] scale-110" 
            : "bg-slate-800/80 text-slate-400 border-slate-700/50 animate-pulse"
        }`}>
          <div className="flex items-center gap-3">
            <div className={`h-3 w-3 rounded-full ${isStable ? "bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,1)]" : "bg-amber-400"}`} />
            {isStable ? "STABLE" : "WAITING..."}
          </div>
        </div>

        {/* Main Weight Readout - MASSIVE SIZE */}
        <div className="flex flex-col items-center justify-center w-full">
          <div className={`flex items-baseline font-black tabular-nums tracking-tighter transition-all duration-300 ${
            isStable ? "text-emerald-400 drop-shadow-[0_0_45px_rgba(52,211,153,0.6)]" : "text-white"
          }`}>
            <span className="text-[clamp(9rem,38vw,18rem)] leading-[0.75]">
              {whole}
            </span>
            <span className="text-[clamp(5rem,20vw,10rem)] leading-[0.75] opacity-80 ml-2">
              .{decimal || "000"}
            </span>
          </div>
          
          <div className="mt-4 flex items-center gap-4">
            <span className="text-[clamp(2.5rem,10vw,5rem)] font-black text-slate-500 italic tracking-tighter leading-none uppercase">
              {unit === "กก." ? "Kg" : unit}
            </span>
            {isStable && (
              <CheckCircle2 size={64} className="text-emerald-500 animate-in zoom-in duration-500 shadow-2xl" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function buildScaleAuditMetadata({
  scaleStatus,
  scaleWeight,
  rawLiveWeightKg,
  stableLiveWeightKg,
  stableResult = null,
}) {
  return {
    capturedAt: new Date().toISOString(),
    displayFilter: {
      holdDurationMs: STABLE_DISPLAY_CONFIG.holdDurationMs,
      toleranceKg: STABLE_DISPLAY_CONFIG.toleranceKg,
      minSamples: STABLE_DISPLAY_CONFIG.minSamples,
    },
    preview: {
      connected: Boolean(scaleStatus?.connected),
      state: scaleStatus?.state || null,
      message: scaleStatus?.message || null,
      rawLiveWeightKg,
      stableDisplayWeightKg: stableLiveWeightKg,
      latestDisplayText: scaleWeight?.displayText || scaleStatus?.latestDisplayText || null,
      rawText: scaleWeight?.rawText || scaleStatus?.lastRawText || null,
      commandUsed: scaleWeight?.commandUsed || scaleStatus?.lastCommandUsed || null,
    },
    device: {
      name: scaleStatus?.deviceName || null,
      vendorId: scaleStatus?.vendorId ?? null,
      productId: scaleStatus?.productId ?? null,
      flowControl: scaleStatus?.flowControl || scaleStatus?.handshake || null,
      dtr: scaleStatus?.dtr ?? null,
      rts: scaleStatus?.rts ?? null,
      previewCommands: scaleStatus?.previewCommands || null,
      stableCommands: scaleStatus?.stableCommands || null,
    },
    stableRead: stableResult ? {
      ok: Boolean(stableResult?.ok),
      weightKg: resolveScaleResultWeightKg(stableResult),
      displayWeight: parseScaleDisplayNumber(stableResult?.displayWeight),
      displayText: stableResult?.displayText || null,
      rawText: stableResult?.rawText || null,
      commandUsed: stableResult?.commandUsed || null,
      message: stableResult?.message || null,
      state: stableResult?.state || null,
    } : null,
  };
}

function buildQueuedSubmitState(pendingCount) {
  return {
    open: true,
    duplicated: false,
    queued: true,
    title: "บันทึกแล้ว",
    tone: "success",
    message: pendingCount > 0
      ? `บันทึกไว้ในเครื่องแล้ว รอซิงก์เข้าระบบ (${pendingCount} รายการค้าง) ไม่ต้องสแกนซ้ำ`
      : "บันทึกไว้ในเครื่องแล้ว รอซิงก์เข้าระบบ ไม่ต้องสแกนซ้ำ",
    savedData: null,
  };
}

function buildDuplicateQueuedState() {
  return {
    open: true,
    duplicated: true,
    queued: true,
    title: "พบรายการซ้ำ",
    tone: "warning",
    message: "พบรายการเดียวกันค้างอยู่ในเครื่องแล้ว ระบบไม่สร้างรายการซ้ำ",
    savedData: null,
  };
}

function buildSlipPayload(savedData = {}, fallback = {}) {
  const { timeText, dateText } = formatPrintTimestamp(savedData.loggedAt);
  const productCode = savedData.productGoodsCode || savedData.productCode || fallback.productGoodsCode || fallback.productCode || "-";
  const productSkuCode = savedData.productSkuCode || fallback.productSkuCode || null;
  return {
    docNo: savedData.docNo || "-",
    machineCode: savedData.machineCode || fallback.machineCode || "-",
    productCode,
    productSkuCode,
    productName: savedData.productName || fallback.productName || "-",
    brandName: savedData.productBrandName || fallback.productBrandName || "-",
    employeeCode: savedData.employeeCode || fallback.employeeCode || "-",
    employeeName: savedData.employeeName || fallback.employeeName || "-",
    departmentName: savedData.employeeDepartment || fallback.employeeDepartment || "-",
    branchName: savedData.employeeBranch || fallback.employeeBranch || "-",
    amountText: formatAmount(
      savedData.inputValue ?? fallback.inputValue,
      savedData.inputMode || fallback.inputMode
    ),
    valueLabel: savedData.inputLabel || fallback.inputLabel || "จำนวน",
    unitLabel: savedData.inputUnitLabel || fallback.inputUnitLabel || "หน่วย",
    timeText,
    dateText,
    operatorUsername: savedData.operatorUsername || fallback.operatorUsername || "-",
    inputValue: savedData.inputValue ?? fallback.inputValue ?? null,
    countValue: savedData.countValue ?? fallback.countValue ?? 1,
    wageAmount: savedData.wageAmount ?? fallback.wageAmount ?? 0,
    loggedAt: savedData.loggedAt || fallback.loggedAt || new Date().toISOString(),
  };
}

export default function PieceRateWorkForm({
  scanMode,
  lockedProduct,
  productLookup,
  employee,
  productScanValue,
  employeeScanValue,
  machineCode: machineCodeProp,
  onChangeProduct,
  onNextAssignment,
  onResetAll,
  onRescanEmployee,
  desktopMode = false,
  desktopScale = null,
  desktopRefreshKey = 0,
  onDesktopRecordSaved,
  workflowMode = "weigh-in",
  onWorkflowModeChange,
  onOpenProductPicker,
  onOpenEmployeePicker,
}) {
  const initialScaleWeightSnapshot = getLatestScaleWeightSnapshot();
  const requestIdRef = useRef(buildRequestId());
  const [inputValue, setInputValue] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitPhase, setSubmitPhase] = useState("idle");
  const [popup, setPopup] = useState(EMPTY_POPUP_STATE);
  const [connectivity, setConnectivity] = useState(() => getConnectivitySnapshot());
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [failedSyncCount, setFailedSyncCount] = useState(0);
  const [needsReviewCount, setNeedsReviewCount] = useState(0);
  const [readyToPrintCount, setReadyToPrintCount] = useState(0);
  const [readyEntries, setReadyEntries] = useState([]);
  const [reviewEntries, setReviewEntries] = useState([]);
  const [showReadyList, setShowReadyList] = useState(false);
  const [showReviewList, setShowReviewList] = useState(false);
  const [printSlip, setPrintSlip] = useState(null);
  const [isPrinting, setIsPrinting] = useState(false);
  const [isRetryingFailed, setIsRetryingFailed] = useState(false);
  const [isRetryingReview, setIsRetryingReview] = useState(false);
  const [pendingReadyPrintEntryId, setPendingReadyPrintEntryId] = useState(null);
  const [showScaleDiagnostics, setShowScaleDiagnostics] = useState(false);
  const [scaleStatus, setScaleStatus] = useState(() => getLatestScaleStatusSnapshot() || DEFAULT_SCALE_STATUS);
  const [scaleWeight, setScaleWeight] = useState(() => initialScaleWeightSnapshot);
  const [stableLiveWeightKg, setStableLiveWeightKg] = useState(() => (
    initialScaleWeightSnapshot ? parseScaleDisplayNumber(initialScaleWeightSnapshot.weightKg) : null
  ));
  const [isScaleBusy, setIsScaleBusy] = useState(false);
  const [machineCode, setMachineCode] = useState(machineCodeProp || null);
  const scaleSampleBufferRef = useRef([]);
  const confirmedStableWeightRef = useRef(
    parsePositiveScaleNumber(resolveScaleResultWeightKg(initialScaleWeightSnapshot))
  );
  const inputRef = useRef(null);
  const submitLockRef = useRef(createSubmitLock());

  const shouldResetAfterPrintRef = useRef(false);

  useEffect(() => {
    if (machineCodeProp) return;
    void resolveMachineCode().then((code) => {
      setMachineCode(code);
    });
  }, [machineCodeProp]);

  const effectiveMachineCode = machineCodeProp || machineCode;

  const inputMode = productLookup?.pieceRate?.inputMode || "kg";
  const supportsScaleReading = inputMode === "kg";
  const hasScaleBridge = supportsScaleReading && hasAndroidScaleBridge();
  const isScaleConnected = supportsScaleReading && (desktopMode
    ? Boolean(desktopScale?.agentConnected && desktopScale?.portOpen !== false && desktopScale?.isReadingFresh)
    : hasScaleBridge && scaleStatus?.connected);
  const rawLiveWeightKg = desktopMode
    ? parseScaleDisplayNumber(desktopScale?.weightKg)
    : parseScaleDisplayNumber(scaleWeight?.weightKg ?? scaleStatus?.latestWeightKg);
  const exactDeviceDisplayText = scaleWeight?.displayText || scaleStatus?.latestDisplayText || "";
  const exactDeviceDisplayKg = desktopMode
    ? rawLiveWeightKg
    : resolveScaleResultWeightKg(scaleWeight)
      ?? extractDisplayWeight(scaleStatus?.latestDisplayText)
      ?? rawLiveWeightKg;
  const exactDeviceStable = desktopMode
    ? Boolean(desktopScale?.isStable && desktopScale?.isReadingFresh)
    : Boolean(scaleWeight?.stable || scaleStatus?.state === "stable");
  const liveWeightKg = isScaleConnected ? exactDeviceDisplayKg : rawLiveWeightKg;
  
  // Single weight logic: uses scale if connected, otherwise uses manual inputValue
  const liveWeightText = isScaleConnected
    ? formatSegmentWeightReadout(exactDeviceDisplayText || exactDeviceDisplayKg)
    : formatSegmentWeightReadout(inputValue || "0.000");
  const beginNextAssignment = useCallback(() => {
    setPopup(EMPTY_POPUP_STATE);
    setSubmitError("");
    setIsSubmitting(false);
    setSubmitPhase("idle");
    onNextAssignment();
  }, [onNextAssignment]);

  const wageBasis = productLookup?.pieceRate?.wageBasis === "count" ? "count" : "kg";
  const standardWeightLabel = productLookup?.pieceRate?.weightOptionLabel || null;
  const standardWeightKg = parsePositiveScaleNumber(productLookup?.pieceRate?.weightKg);
  const inputLabel = productLookup?.pieceRate?.inputLabel || "น้ำหนัก";
  const inputUnitLabel = productLookup?.pieceRate?.inputUnitLabel || "กก.";
  
  const scalePreviewStatus = !hasScaleBridge
    ? {
      tone: "bg-slate-500/10 text-slate-500 border-slate-500/20",
      label: "MANUAL",
    }
    : isScaleBusy
      ? {
        tone: "bg-amber-500 text-white border-amber-400 animate-pulse",
        label: "HOLDING",
      }
      : isScaleConnected && exactDeviceStable && liveWeightKg !== null
        ? {
          tone: "bg-emerald-500 text-white border-emerald-400 shadow-lg shadow-emerald-500/20",
          label: "STABLE",
        }
        : isScaleConnected
          ? {
            tone: "bg-amber-500 text-white border-amber-400",
            label: "LIVE",
          }
          : {
            tone: "bg-slate-400 text-white border-slate-300",
            label: "OFFLINE",
          };

  const scaleDebugEntries = [
    ["Bridge", hasScaleBridge ? "available" : "unavailable"],
    ["State", scaleStatus?.state || "-"],
    ["Connected", scaleStatus?.connected ? "true" : "false"],
    ["Message", scaleStatus?.message || "-"],
    ["Scale stable", exactDeviceStable ? "true" : "false"],
    ["Device display", exactDeviceDisplayText || "-"],
    ["Device display kg", formatScaleDebugValue(exactDeviceDisplayKg)],
    ["Raw live kg", formatScaleDebugValue(rawLiveWeightKg)],
    ["Stable display kg", formatScaleDebugValue(stableLiveWeightKg)],
    ["Stable hold", `${STABLE_DISPLAY_CONFIG.holdDurationMs} ms / tol ${STABLE_DISPLAY_CONFIG.toleranceKg} kg`],
    ["Latest display", exactDeviceDisplayText || "-"],
    ["Last raw", scaleWeight?.rawText || scaleStatus?.lastRawText || "-"],
    ["Last command", scaleWeight?.commandUsed || scaleStatus?.lastCommandUsed || "-"],
    ["Flow control", scaleStatus?.flowControl || scaleStatus?.handshake || "-"],
    ["DTR/RTS", `${formatScaleDebugValue(scaleStatus?.dtr)} / ${formatScaleDebugValue(scaleStatus?.rts)}`],
    ["Device", scaleStatus?.deviceName || "-"],
    ["Vendor/Product", `${formatScaleDebugValue(scaleStatus?.vendorId)} / ${formatScaleDebugValue(scaleStatus?.productId)}`],
    ["Preview commands", formatScaleDebugValue(scaleStatus?.previewCommands)],
    ["Stable commands", formatScaleDebugValue(scaleStatus?.stableCommands)],
    ["Attached USB", formatScaleDebugValue(scaleStatus?.attachedUsbDevices)],
  ];

  const refreshOfflineState = useCallback(async () => {
    const [summary, entries, reviewQueue] = await Promise.all([
      getPieceRateOutboxSummary().catch(() => ({ pendingCount: 0, failedCount: 0, needsReviewCount: 0, readyToPrintCount: 0 })),
      getPieceRateReadyToPrintEntries().catch(() => []),
      getPieceRateNeedsReviewEntries().catch(() => []),
    ]);

    setConnectivity(getConnectivitySnapshot());
    setPendingSyncCount(summary.pendingCount || 0);
    setFailedSyncCount(summary.failedCount || 0);
    setNeedsReviewCount(summary.needsReviewCount || 0);
    setReadyToPrintCount(summary.readyToPrintCount || 0);
    setReadyEntries(entries);
    setReviewEntries(reviewQueue);

    if (!entries.length) {
      setShowReadyList(false);
    }
    if (!reviewQueue.length) {
      setShowReviewList(false);
    }
  }, []);

  const finalizePrintedOutbox = useCallback(async (entryId) => {
    if (!entryId) return;
    await markPieceRateOutboxPrinted(entryId).catch(() => null);
    await refreshOfflineState();
  }, [refreshOfflineState]);

  const handleRetryFailedSync = useCallback(async () => {
    setIsRetryingFailed(true);
    await requeueFailedPieceRateOutboxEntries().catch(() => 0);
    await syncPendingPieceRateOutbox({ includeFailed: true }).catch(() => null);
    await refreshOfflineState();
    setIsRetryingFailed(false);
  }, [refreshOfflineState]);

  const handleRetryNeedsReview = useCallback(async () => {
    setIsRetryingReview(true);
    await requeuePieceRateNeedsReviewEntries().catch(() => 0);
    await syncPendingPieceRateOutbox({ includeFailed: true }).catch(() => null);
    await refreshOfflineState();
    setIsRetryingReview(false);
  }, [refreshOfflineState]);

  useEffect(() => {
    if (!hasScaleBridge) {
      return undefined;
    }

    let cancelled = false;

    const handleScaleStatus = (event) => {
      setScaleStatus(event?.detail || DEFAULT_SCALE_STATUS);
    };

    const handleScaleWeight = (event) => {
      const detail = event?.detail || null;
      setScaleWeight(detail);
      const exactWeight = resolveScaleResultWeightKg(detail);


      const lastConfirmedStableWeight = parsePositiveScaleNumber(confirmedStableWeightRef.current);
      if (detail?.stable && exactWeight !== null) {
        confirmedStableWeightRef.current = exactWeight;
        setStableLiveWeightKg(exactWeight);
        setInputValue(String(exactWeight));
      }

      const nextWeight = parseScaleDisplayNumber(detail?.weightKg);
      if (nextWeight === null) {
        scaleSampleBufferRef.current = [];
        confirmedStableWeightRef.current = null;
        setStableLiveWeightKg(null);
        return;
      }

      if (
        !detail?.stable
        && lastConfirmedStableWeight !== null
        && Math.abs(nextWeight - lastConfirmedStableWeight) > STABLE_DISPLAY_CONFIG.toleranceKg
      ) {
        confirmedStableWeightRef.current = null;
        setStableLiveWeightKg(null);
      }

      const now = Date.now();
      const nextSamples = [
        ...scaleSampleBufferRef.current,
        { weightKg: nextWeight, measuredAt: now },
      ]
        .filter((sample) => (now - sample.measuredAt) <= STABLE_DISPLAY_CONFIG.sampleWindowMs)
        .slice(-STABLE_DISPLAY_CONFIG.maxSamples);

      scaleSampleBufferRef.current = nextSamples;

      const nextStableWeight = resolveStableDisplayWeight(nextSamples);
      if (nextStableWeight !== null && !detail?.stable) {
        setStableLiveWeightKg(null);
      }
    };

    const bootstrapScale = async () => {
      const stateResult = await getScaleState();
      if (!cancelled && stateResult?.bridgeAvailable) {
        setScaleStatus((currentValue) => ({
          ...currentValue,
          ...stateResult,
        }));
      }

      const previewResult = await startScalePreview(SCALE_CONFIG);
      if (!cancelled && previewResult?.bridgeAvailable) {
        setScaleStatus((currentValue) => ({
          ...currentValue,
          ...previewResult,
        }));
      }
    };

    window.addEventListener(SCALE_STATUS_CHANGE_EVENT, handleScaleStatus);
    window.addEventListener(SCALE_WEIGHT_CHANGE_EVENT, handleScaleWeight);
    void bootstrapScale();

    return () => {
      cancelled = true;
      window.removeEventListener(SCALE_STATUS_CHANGE_EVENT, handleScaleStatus);
      window.removeEventListener(SCALE_WEIGHT_CHANGE_EVENT, handleScaleWeight);
      void stopScalePreview();
      void disconnectScale();
    };
  }, [hasScaleBridge]);



  useEffect(() => {
    if (!isPrinting || !printSlip || typeof window === "undefined") {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      document.body.classList.add("piece-rate-printing");
      window.print();
    }, 120);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isPrinting, printSlip]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return undefined;
    }

    const handleAfterPrint = () => {
      document.body.classList.remove("piece-rate-printing");
      setIsPrinting(false);
      setPrintSlip(null);

      if (!pendingReadyPrintEntryId) {
        if (shouldResetAfterPrintRef.current) {
          shouldResetAfterPrintRef.current = false;
          beginNextAssignment();
        }
        return;
      }

      const nextEntryId = pendingReadyPrintEntryId;
      setPendingReadyPrintEntryId(null);
      void finalizePrintedOutbox(nextEntryId);
      if (shouldResetAfterPrintRef.current) {
        shouldResetAfterPrintRef.current = false;
        beginNextAssignment();
      }
    };

    window.addEventListener("afterprint", handleAfterPrint);

    return () => {
      window.removeEventListener("afterprint", handleAfterPrint);
      document.body.classList.remove("piece-rate-printing");
    };
  }, [beginNextAssignment, finalizePrintedOutbox, pendingReadyPrintEntryId]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;

    let cancelled = false;

    const refreshSafely = async () => {
      await refreshOfflineState();
      if (cancelled) return;
    };

    const handleConnectivityChange = async () => {
      const snapshot = getConnectivitySnapshot();
      if (!cancelled) {
        setConnectivity(snapshot);
      }

      if (snapshot.online) {
        await syncPendingPieceRateOutbox({ includeFailed: true });
        try {
          const channel = new BroadcastChannel("kpf_piece_rate_sync");
          channel.postMessage("REFRESH_REPORT");
          channel.close();
        } catch (e) {
          // ignore
        }
      }

      await refreshSafely();
    };

    const handleVisibilityChange = async () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      await handleConnectivityChange();
    };

    refreshSafely().then(() => (
      isAppOnline()
        ? syncPendingPieceRateOutbox({ includeFailed: true }).then(() => {
            try {
              const channel = new BroadcastChannel("kpf_piece_rate_sync");
              channel.postMessage("REFRESH_REPORT");
              channel.close();
            } catch (e) {}
          }).then(refreshSafely)
        : null
    ));

    window.addEventListener("online", handleConnectivityChange);
    window.addEventListener("offline", handleConnectivityChange);
    window.addEventListener(WRAPPER_NETWORK_CHANGE_EVENT, handleConnectivityChange);
    window.addEventListener(PIECE_RATE_OUTBOX_CHANGE_EVENT, refreshSafely);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      cancelled = true;
      window.removeEventListener("online", handleConnectivityChange);
      window.removeEventListener("offline", handleConnectivityChange);
      window.removeEventListener(WRAPPER_NETWORK_CHANGE_EVENT, handleConnectivityChange);
      window.removeEventListener(PIECE_RATE_OUTBOX_CHANGE_EVENT, refreshSafely);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshOfflineState]);

  const handlePrintSlip = useCallback(async (slipPayload, options = {}) => {
    if (desktopMode) {
      try {
        const label = buildPieceRateDesktopLabel({
          docNo: slipPayload.docNo,
          productCode: slipPayload.productCode,
          productName: slipPayload.productName,
          employeeCode: slipPayload.employeeCode,
          employeeName: slipPayload.employeeName,
          weightKg: slipPayload.inputValue,
          countValue: slipPayload.countValue,
          wageAmount: slipPayload.wageAmount,
          recordedAt: slipPayload.loggedAt,
        });
        await printPieceRateLabelViaAgent(label);
        if (options.outboxEntryId) await finalizePrintedOutbox(options.outboxEntryId);
        return { ok: true, mode: "desktop-agent" };
      } catch (error) {
        setSubmitError(error?.message || "พิมพ์ใบคิดค่าแรงไม่สำเร็จ");
        return { ok: false, mode: "desktop-agent" };
      }
    }
    const directPrintResult = await printPieceRateSlipDirect(slipPayload);
    if (!directPrintResult.ok) {
      if (directPrintResult.reason === "sunmi-direct-unavailable") {
        const confirmBrowserFallback = window.confirm(
          "ยังไม่พบระบบพิมพ์ตรงของ Sunmi บนเครื่องนี้\nต้องการพิมพ์ผ่าน Browser แทนหรือไม่? (อาจมีหน้าต่างเลือกเครื่องพิมพ์)"
        );
        if (!confirmBrowserFallback) {
          return false;
        }
      }

      if (options.outboxEntryId) {
        setPendingReadyPrintEntryId(options.outboxEntryId);
      }

      setPrintSlip(slipPayload);
      setIsPrinting(true);
      return { ok: true, mode: "browser" };
    }

    if (options.outboxEntryId) {
      await finalizePrintedOutbox(options.outboxEntryId);
    }

    return { ok: true, mode: "direct" };
  }, [desktopMode, finalizePrintedOutbox]);

  const handlePrintReadyEntry = useCallback(async (entry) => {
    if (!entry) {
      return;
    }

    const savedData = entry?.syncedData || {};
    const queuedPayload = entry?.payload || {};
    const slipPayload = buildSlipPayload(savedData, {
      machineCode: queuedPayload.machineCode,
      productCode: queuedPayload.productCode || productLookup?.product?.goodsCode || productLookup?.product?.code,
      productGoodsCode: queuedPayload.productGoodsCode || productLookup?.product?.goodsCode || productLookup?.product?.code,
      productSkuCode: queuedPayload.productSkuCode || productLookup?.product?.skuCode,
      productName: queuedPayload.productName || productLookup?.product?.name,
      productBrandName: queuedPayload.productBrandName || productLookup?.product?.brandName,
      employeeCode: queuedPayload.employeeCode,
      employeeName: queuedPayload.employeeSnapshot?.name,
      employeeDepartment: queuedPayload.employeeSnapshot?.departmentName,
      employeeBranch: queuedPayload.employeeSnapshot?.branch,
      inputValue: queuedPayload.inputValue,
      inputMode,
      inputLabel,
      inputUnitLabel,
    });

    await handlePrintSlip(slipPayload, {
      outboxEntryId: entry.id,
    });
  }, [handlePrintSlip, inputLabel, inputMode, inputUnitLabel, productLookup]);

  const saveLastProductForEmployee = (employeeCode, productBarcode) => {
    if (typeof window === "undefined" || !employeeCode || !productBarcode) return;
    try {
      const d = new Date();
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      const today = `${year}-${month}-${day}`;
      
      const key = `piece_rate_last_prod_${employeeCode}`;
      localStorage.setItem(key, JSON.stringify({ barcode: productBarcode, date: today }));
    } catch (err) {
      console.error("Failed to save last product for employee", err);
    }
  };

  const handleSubmit = async (event) => {
    if (event) event.preventDefault();
    if (submitPhase === "completed") {
      return;
    }
    if (!submitLockRef.current.tryStart()) {
      return;
    }

    const releaseSubmitLock = ({ nextPhase = "idle" } = {}) => {
      submitLockRef.current.release();
      setIsSubmitting(false);
      setSubmitPhase(nextPhase);
    };

    let resolvedInputValue = parsePositiveScaleNumber(inputValue);
    if (resolvedInputValue === null && !isScaleConnected) {
      releaseSubmitLock();
      setSubmitError(`กรุณากรอก${inputLabel}ให้มากกว่า 0`);
      return;
    }

    setIsSubmitting(true);
    setSubmitPhase("submitting");
    setSubmitError("");
    let scaleAudit = buildScaleAuditMetadata({
      scaleStatus,
      scaleWeight,
      rawLiveWeightKg,
      stableLiveWeightKg,
    });

    if (isScaleConnected) {
      const liveStableWeight = exactDeviceStable
        ? parsePositiveScaleNumber(exactDeviceDisplayKg)
        : null;

      if (liveStableWeight !== null) {
        resolvedInputValue = liveStableWeight;
        setInputValue(String(liveStableWeight));
      } else {
        if (desktopMode) {
          releaseSubmitLock();
          setSubmitError("กรุณารอให้น้ำหนักจากเครื่องชั่งนิ่งก่อนบันทึก");
          return;
        }
        setIsScaleBusy(true);
        const stableResult = await readStableScaleWeight(SCALE_CONFIG);
        setIsScaleBusy(false);
        const stableWeight = parsePositiveScaleNumber(resolveScaleResultWeightKg(stableResult));
        if (!stableResult?.ok || stableWeight === null) {
          releaseSubmitLock();
        setSubmitError("อ่านค่าน้ำหนักคงที่จากเครื่องชั่งไม่สำเร็จ");
          return;
      }

        resolvedInputValue = stableWeight;
        confirmedStableWeightRef.current = stableWeight;
        setInputValue(String(stableWeight));
        scaleAudit = buildScaleAuditMetadata({
        scaleStatus,
        scaleWeight,
        rawLiveWeightKg,
        stableLiveWeightKg,
        stableResult,
      });
      }
    }

    if (resolvedInputValue === null) {
      releaseSubmitLock();
      setSubmitError(`กรุณากรอก${inputLabel}ให้มากกว่า 0`);
      return;
    }

    // duplicate weight check to prevent back-to-back double weight submissions


    const machineCodeResult = await resolveMachineCode();
    if (!machineCodeResult) {
      releaseSubmitLock();
      setSubmitError("ยังไม่ได้ตั้งค่ารหัสเครื่อง ไม่สามารถบันทึก/พิมพ์ได้ กรุณาตั้งค่ารหัสเครื่องก่อน");
      return;
    }

    const scannedEmployeeCode = normalizeEmployeeCode(employeeScanValue || employee?.employeeCode);
    const payload = {
      requestId: requestIdRef.current,
      productBarcode: productLookup?.productBarcode || productScanValue,
      productCode: productLookup?.product?.goodsCode || productLookup?.product?.code || null,
      productGoodsCode: productLookup?.product?.goodsCode || productLookup?.product?.code || null,
      productSkuCode: productLookup?.product?.skuCode || null,
      productName: productLookup?.product?.name || null,
      productBrandName: productLookup?.product?.brandName || null,
      employeeCode: scannedEmployeeCode,
      employeeSnapshot: {
        name: employee?.name || null,
        departmentName: employee?.departmentName || null,
        branch: employee?.branch || null,
        checkIn: employee?.checkIn || null,
        checkOut: employee?.checkOut || null,
      },
      inputValue: resolvedInputValue,
      countValue: 1,
      source: "piece_rate_scan",
      machineCode: machineCodeResult,
      rawProductBarcodePayload: productScanValue || productLookup?.productBarcode || null,
      rawEmployeeQrPayload: scannedEmployeeCode || null,
      metadata: {
        screen: "piece-rate-scan-form",
        machineCode: machineCodeResult,
        inputMode,
        wageBasis,
        countValue: 1,
        scaleConnected: isScaleConnected,
        scaleAudit,
      },
    };

    // Raise-Before-Reserve: let the server lift its per-machine counter past
    // our local high-water mark before reserving a new online doc number.
    payload.docCounterHint = { lastSeq: readLocalPieceRateCounter(getBangkokDateKey()).lastSeq };

    const localDuplicate = await findPieceRateOutboxDuplicate(payload);
    if (localDuplicate) {
      releaseSubmitLock({ nextPhase: "completed" });
      setPopup(buildDuplicateQueuedState());
      return;
    }

    let result = null;
    let didRetrySubmit = false;
    if (isAppOnline()) {
      // Flush-First: drain the pending outbox before reserving a new online
      // doc number so queued offline numbers stay below the next online one.
      const outboxBefore = await getPieceRateOutboxSummary().catch(() => null);
      if ((outboxBefore?.pendingCount || 0) > 0) {
        setSubmitPhase("syncing");
        await syncPendingPieceRateOutbox({ includeFailed: true }).catch(() => null);
        await refreshOfflineState();
      }
      if (isAppOnline()) {
        setSubmitPhase("submitting");
        result = await submitPieceRateLog(payload);
        // Retry once with the same requestId on ambiguous failures before
        // deciding this is an offline save (the first attempt may have
        // already reached the server).
        if (isAmbiguousSubmitFailure(result) && isAppOnline()) {
          didRetrySubmit = true;
          result = await submitPieceRateLog(payload);
        }
      }
    }

    const shouldQueueOffline = isAmbiguousSubmitFailure(result);

    if (shouldQueueOffline) {
      try {
        const offlineLogId = payload.requestId;
        const now = new Date();
        const docDateKey = getBangkokDateKey(now);
        const localCounter = readLocalPieceRateCounter(docDateKey);
        const nextSeq = localCounter.lastSeq + 1;
        if (nextSeq > PIECE_RATE_DOC_SEQ_MAX) {
          window.alert("เลขเอกสารครบ 999 รายการของวันนี้แล้ว กรุณาติดต่อผู้ดูแลระบบ");
          releaseSubmitLock();
          setSubmitError("เลขเอกสารครบ 999 รายการของวันนี้แล้ว กรุณาติดต่อผู้ดูแลระบบ");
          return;
        }
        writeLocalPieceRateCounter(docDateKey, nextSeq);

        const generatedDocNo = `${docDateKey}${String(nextSeq).padStart(3, "0")}`;

        const offlinePayload = {
          ...payload,
          id: offlineLogId,
          docNo: generatedDocNo,
          loggedAt: now.toISOString(),
        };

        const queueResult = await queuePieceRateSubmission(offlinePayload, {
          queuedReason: result?.error?.message || "Network unavailable during submission",
          lastError: result?.error?.message || "Network unavailable during submission",
        });

        if (queueResult?.duplicate) {
          releaseSubmitLock({ nextPhase: "completed" });
          setPopup(buildDuplicateQueuedState());
          return;
        }

        await refreshOfflineState();
        saveLastProductForEmployee(scannedEmployeeCode, payload.productBarcode);

        const timeText = new Intl.DateTimeFormat("th-TH", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(now);
        const dateText = new Intl.DateTimeFormat("th-TH", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
        }).format(now);

        const slipPayload = {
          docNo: generatedDocNo,
          machineCode: machineCodeResult,
          productCode: productLookup?.product?.goodsCode || productLookup?.product?.code || "-",
          productSkuCode: productLookup?.product?.skuCode || null,
          productName: productLookup?.product?.name || "-",
          brandName: productLookup?.product?.brandName || "-",
          employeeCode: scannedEmployeeCode || employee?.employeeCode || "-",
          employeeName: employee?.name || "-",
          departmentName: employee?.departmentName || "-",
          branchName: employee?.branch || "-",
          amountText: formatAmount(resolvedInputValue, inputMode),
          inputValue: resolvedInputValue,
          countValue: 1,
          wageAmount: wageBasis === "count"
            ? Number(productLookup?.pieceRate?.payRatePerUnit || 0)
            : Number((resolvedInputValue * Number(productLookup?.pieceRate?.payRatePerKg || 0)).toFixed(2)),
          loggedAt: now.toISOString(),
          valueLabel: inputLabel || "จำนวน",
          unitLabel: inputUnitLabel || "หน่วย",
          timeText,
          dateText,
          operatorUsername: "-",
        };

        const printResult = await handlePrintSlip(slipPayload, {
          outboxEntryId: queueResult?.id,
        });

        if (!printResult?.ok) {
          releaseSubmitLock();
          return;
        }

        if (printResult && printResult.mode === "browser") {
          releaseSubmitLock({ nextPhase: "completed" });
          shouldResetAfterPrintRef.current = true;
          return;
        }

        releaseSubmitLock();
        beginNextAssignment();
        return;
      } catch (err) {
        console.error("Failed to queue or print offline", err);
        setSubmitError("ไม่สามารถบันทึกและสั่งพิมพ์แบบออฟไลน์บนเครื่องนี้ได้");
        releaseSubmitLock();
        return;
      }
    }

    if (!result.ok) {
      releaseSubmitLock();
      setSubmitError(result.error?.message || "บันทึกข้อมูลไม่สำเร็จ");
      return;
    }

    const duplicated = Boolean(result.data?.duplicated);
    const savedData = result.data?.data || null;

    if (savedData || duplicated) {
      saveLastProductForEmployee(scannedEmployeeCode, payload.productBarcode);
    }

    // Raise-Local: keep the device's local counter at least as high as the
    // sequence the server just issued so future offline numbers never collide.
    if (savedData?.docSeq) {
      raiseLocalPieceRateCounter(savedData.docNo, savedData.docSeq);
    }

    if (duplicated) {
      // If the first attempt was ambiguous and the retry reports a duplicate,
      // the slip was never printed — print the real document number now.
      if (didRetrySubmit && savedData?.docNo) {
        const retrySlipPayload = buildSlipPayload(savedData, {
          machineCode: machineCodeResult,
          productCode: productLookup?.product?.goodsCode || productLookup?.product?.code,
          productGoodsCode: productLookup?.product?.goodsCode || productLookup?.product?.code,
          productSkuCode: productLookup?.product?.skuCode,
          productName: productLookup?.product?.name,
          productBrandName: productLookup?.product?.brandName,
          employeeCode: scannedEmployeeCode || employee?.employeeCode,
          employeeName: employee?.name,
          employeeDepartment: employee?.departmentName,
          employeeBranch: employee?.branch,
          inputValue: resolvedInputValue,
          inputMode,
          inputLabel,
          inputUnitLabel,
        });
        const retryPrintResult = await handlePrintSlip(retrySlipPayload);
        if (!retryPrintResult?.ok) {
          releaseSubmitLock();
          return;
        }
        if (retryPrintResult.mode === "browser") {
          releaseSubmitLock({ nextPhase: "completed" });
          shouldResetAfterPrintRef.current = true;
          return;
        }
      }
      releaseSubmitLock({ nextPhase: "completed" });
      beginNextAssignment();
      return;
    }

    if (savedData) {
      onDesktopRecordSaved?.(savedData);
      try {
        const channel = new BroadcastChannel("kpf_piece_rate_sync");
        channel.postMessage("REFRESH_REPORT");
        channel.close();
      } catch (e) {
        console.error("Broadcast failed", e);
      }


      const slipPayload = buildSlipPayload(savedData, {
        machineCode: machineCodeResult,
        productCode: productLookup?.product?.goodsCode || productLookup?.product?.code,
        productGoodsCode: productLookup?.product?.goodsCode || productLookup?.product?.code,
        productSkuCode: productLookup?.product?.skuCode,
        productName: productLookup?.product?.name,
        productBrandName: productLookup?.product?.brandName,
        employeeCode: scannedEmployeeCode || employee?.employeeCode,
        employeeName: employee?.name,
        employeeDepartment: employee?.departmentName,
        employeeBranch: employee?.branch,
        inputValue: resolvedInputValue,
        inputMode,
        inputLabel,
        inputUnitLabel,
      });
      const printResult = await handlePrintSlip(slipPayload);
      if (!printResult?.ok) {
        releaseSubmitLock();
        return;
      }
      if (printResult.mode === "browser") {
        releaseSubmitLock({ nextPhase: "completed" });
        shouldResetAfterPrintRef.current = true;
        return;
      }

      releaseSubmitLock({ nextPhase: "completed" });
      beginNextAssignment();
      return;
    }



    setPopup({
      open: true,
      duplicated,
      queued: false,
      message: duplicated ? "รายการนี้ถูกบันทึกไว้แล้ว" : "บันทึกข้อมูลเรียบร้อย",
      savedData,
    });

    if (!duplicated && savedData) {
      try {
        const channel = new BroadcastChannel("kpf_piece_rate_sync");
        channel.postMessage("REFRESH_REPORT");
        channel.close();
      } catch (e) {
        console.error("Broadcast failed", e);
      }

      const slipPayload = buildSlipPayload(savedData, {
        machineCode: machineCodeResult,
        productCode: productLookup?.product?.goodsCode || productLookup?.product?.code,
        productGoodsCode: productLookup?.product?.goodsCode || productLookup?.product?.code,
        productSkuCode: productLookup?.product?.skuCode,
        productName: productLookup?.product?.name,
        productBrandName: productLookup?.product?.brandName,
        employeeCode: scannedEmployeeCode || employee?.employeeCode,
        employeeName: employee?.name,
        employeeDepartment: employee?.departmentName,
        employeeBranch: employee?.branch,
        inputValue: resolvedInputValue,
        inputMode,
        inputLabel,
        inputUnitLabel,
      });
      await handlePrintSlip(slipPayload);
    }
    releaseSubmitLock({ nextPhase: "completed" });
  };

  const handleConsoleClick = () => {
    if (!isScaleConnected && inputRef.current) {
      inputRef.current.focus();
    }
  };

  if (desktopMode) {
    return (
      <PieceRateDesktopWorkstation
        productLookup={productLookup}
        employee={employee}
        scale={desktopScale}
        onSave={() => void handleSubmit()}
        onChangeProduct={onChangeProduct}
        onOpenProductPicker={onOpenProductPicker}
        onOpenEmployeePicker={onOpenEmployeePicker}
        isSubmitting={isSubmitting}
        submitError={submitError}
        refreshKey={desktopRefreshKey}
        workflowMode={workflowMode}
        onWorkflowModeChange={onWorkflowModeChange}
        inputValue={inputValue}
        setInputValue={setInputValue}
      />
    );
  }

  return (
    <div className="min-h-[100dvh] w-full bg-[#f8fafc] text-slate-900 font-sans selection:bg-[#fff1bf] flex flex-col">
      {printSlip ? (
        <section
          id="piece-rate-print-slip"
          aria-hidden="true"
          className="fixed -left-[9999px] top-0 bg-white text-black"
        >
          <div
            style={{
              width: "54mm",
              minHeight: "37mm",
              padding: "1.8mm 1.6mm",
              border: "1px solid #000",
              fontSize: "9px",
              lineHeight: 1.25,
              fontFamily: "Tahoma, Noto Sans Thai, sans-serif",
            }}
          >
            <div style={{ textAlign: "center", fontSize: "10px", fontWeight: 700, marginBottom: "0.9mm" }}>
              ใบบันทึกงาน
            </div>
            <div style={{ textAlign: "center", marginBottom: "0.7mm" }}>
              <strong>เวลา:</strong> {printSlip.timeText}
            </div>
            <div style={{ textAlign: "center", marginBottom: "0.8mm" }}>
              <strong>วันที่:</strong> {printSlip.dateText}
            </div>
            <div style={{ textAlign: "center", marginBottom: "0.8mm" }}>
              <strong>เลขเอกสาร:</strong> {printSlip.docNo}
            </div>
            <div style={{ textAlign: "center", marginBottom: "0.8mm" }}>
              <strong>เครื่อง:</strong> {printSlip.machineCode}
            </div>
            <div style={{ borderTop: "1px dashed #000", margin: "0.6mm 0 0.9mm" }} />
            <div style={{ marginBottom: "0.8mm" }}>
              <strong>สินค้า :</strong> {printSlip.productCode} - {printSlip.productName}
              {printSlip.productSkuCode ? ` (SKU ${printSlip.productSkuCode})` : ""}
            </div>
            <div style={{ marginBottom: "0.8mm" }}>
              <strong>แบรนด์ :</strong> {printSlip.brandName}
            </div>
            <div style={{ marginBottom: "0.8mm" }}>
              <strong>รหัส-ชื่อ :</strong> {printSlip.employeeCode} - {printSlip.employeeName}
            </div>
            <div style={{ marginBottom: "0.8mm" }}>
              <strong>แผนก :</strong> {printSlip.departmentName}
            </div>
            <div style={{ marginBottom: "0.8mm" }}>
              <strong>สาขา :</strong> {printSlip.branchName}
            </div>
            <div style={{ marginBottom: "0.8mm" }}>
              <strong>ผู้บันทึก :</strong> {printSlip.operatorUsername}
            </div>
            <div style={{ borderTop: "1px dashed #000", margin: "0.6mm 0 0.9mm" }} />
            <div style={{ marginBottom: "0.8mm" }}>
              <strong>{printSlip.valueLabel} :</strong> {printSlip.amountText} {printSlip.unitLabel}
            </div>
            <div style={{ borderTop: "1px dashed #000", margin: "0.6mm 0 0.2mm" }} />
          </div>
        </section>
      ) : null}

      {/* Header Bar */}
      <header className="sticky top-0 z-40 w-full border-b border-[#d4af37]/20 bg-white/95 backdrop-blur-md px-4 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <button onClick={onRescanEmployee} className="p-2 -ml-2 text-slate-400 active:bg-slate-100 rounded-full">
            <ArrowLeft size={20} />
          </button>
          <div className="flex flex-col -gap-0.5">
            <h1 className="text-sm font-black text-[#0f2747] leading-none">สแกนคิดค่าแรง</h1>
            <span className="text-[10px] font-bold text-[#b68a12] uppercase tracking-[0.2em]">
              {scanMode === "single" ? "โหมดผลิตภัณฑ์เดียว" : "โหมดหลายผลิตภัณฑ์"} • {effectiveMachineCode || "ยังไม่ได้ตั้งค่าเครื่อง"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/production-line/attendance/report/piece-rate" className="p-2 text-slate-400 active:bg-slate-100 rounded-full">
            <Printer size={20} />
          </Link>
          <div className={`h-2.5 w-2.5 rounded-full ${connectivity.online ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-rose-500 animate-pulse"}`} />
        </div>
      </header>

      <main className="flex-1 overflow-y-auto no-scrollbar pb-12">
        <div className="mx-auto w-full max-w-2xl px-4 py-6 flex flex-col gap-5">
          {!effectiveMachineCode && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 flex items-center gap-3">
              <div className="h-8 w-8 rounded-xl bg-rose-500 text-white flex items-center justify-center shrink-0">
                <AlertTriangle size={16} />
              </div>
              <p className="text-rose-700 text-[11px] font-black tracking-wide">
                ยังไม่ได้ตั้งค่ารหัสเครื่อง ไม่สามารถบันทึก/พิมพ์ได้ กรุณาตั้งค่ารหัสเครื่องก่อน
              </p>
            </div>
          )}
          <section className="rounded-[2rem] border border-[#d4af37]/25 bg-white p-5 shadow-sm flex flex-col gap-4">
            {/* Product Info Row */}
            <div className="min-w-0 flex flex-col gap-4">
              <div className="min-w-0 flex flex-col items-center text-center w-full">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#b68a12] self-start mb-2">
                  {scanMode === "single" ? "สินค้าเดิมทั้งวัน" : "สินค้ารอบนี้"}
                </p>
                {/* Product Image Thumbnail if present */}
                {productLookup?.product?.imageUrl || productLookup?.product?.image_url ? (
                  <div className="relative h-44 w-44 shrink-0 flex items-center justify-center mb-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={productLookup?.product?.imageUrl || productLookup?.product?.image_url}
                      alt="Product"
                      className="h-full w-full object-contain"
                    />
                  </div>
                ) : null}
                <div className="min-w-0 flex flex-col items-center">
                  {/* Highlighted Product Code */}
                  <span className="text-lg font-black text-[#0f2747] tracking-tight">
                    {productLookup?.product?.goodsCode || productLookup?.product?.code || "-"}
                  </span>
                  {/* Product Name */}
                  <span className="text-sm font-semibold text-slate-600 leading-snug line-clamp-2 mt-0.5">
                    {productLookup?.product?.name || "-"}
                  </span>
                </div>
              </div>
              {scanMode === "single" && onChangeProduct && (
                <button
                  type="button"
                  onClick={onChangeProduct}
                  className="w-full rounded-xl border border-[#d4af37]/35 bg-[#0f2747] px-3 py-2 text-[10px] font-black tracking-wide text-[#f8df8a] active:scale-[0.98]"
                >
                  เปลี่ยนสินค้า
                </button>
              )}
            </div>

            {/* Separator Line */}
            <div className="border-t border-slate-100" />

            {/* Employee Info Row */}
            <div className="min-w-0">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[#b68a12]">พนักงาน</p>
              <div className="mt-1 flex flex-col">
                {/* Employee Code & Name */}
                <span className="text-lg font-black text-[#0f2747] tracking-tight">
                  {(employeeScanValue || employee?.employeeCode || "-")} - {employee?.name || "-"}
                </span>
                {/* Employee Department */}
                {employee?.departmentName && (
                  <span className="text-xs font-semibold text-slate-500 mt-0.5">
                    {employee.departmentName}
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* --- PRIMARY WEIGHT CONSOLE (SINGLE SOURCE) --- */}
          <div className="relative group flex flex-col gap-4">
            <div className="absolute inset-0 bg-[#d4af37]/10 blur-[80px] -z-10 rounded-full" />
            
            <section 
              onClick={handleConsoleClick}
              className={`bg-[#020617] rounded-[3rem] py-16 px-8 shadow-2xl border-2 transition-all relative overflow-hidden flex flex-col items-center ${
                isScaleConnected ? "border-emerald-500/50" : "border-slate-800 active:scale-[0.98]"
              }`}
            >
              {/* Background Effects */}
              <div className="absolute top-0 right-0 w-40 h-40 bg-[#d4af37]/5 blur-[40px] -mr-20 -mt-20 rounded-full" />
              
              {/* Status Header */}
              <div className="w-full flex items-center justify-between mb-8">
                <div className={`px-4 py-1.5 rounded-full text-[10px] font-black border transition-all flex items-center gap-2 ${scalePreviewStatus.tone}`}>
                  <Radar size={12} className={isScaleBusy ? "animate-spin" : ""} />
                  {scalePreviewStatus.label}
                </div>
                {!isScaleConnected && (
                  <div className="flex items-center gap-1.5 text-[#f3d36b] animate-pulse">
                    <Keyboard size={14} />
                    <span className="text-[9px] font-black tracking-widest">แตะเพื่อพิมพ์น้ำหนัก</span>
                  </div>
                )}
                {isScaleConnected && (
                  <div className="flex items-center gap-1.5 text-emerald-500">
                    <Lock size={14} />
                    <span className="text-[9px] font-black uppercase tracking-widest">Locked</span>
                  </div>
                )}
              </div>

              {/* THE HUGE WEIGHT NUMBERS */}
              <div className="flex flex-col items-center justify-center min-h-[320px] relative w-full">
                <ModernDigitalDisplay value={liveWeightText} isStable={exactDeviceStable} unit={inputUnitLabel} />

                {/* Hidden Input for Manual Entry */}
                {!isScaleConnected && (
                  <input
                    ref={inputRef}
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                )}
              </div>

              {/* Diagnosis / Error Area */}
              {submitError && (
                <div className="w-full mt-6 px-4 py-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-500 text-[11px] font-black text-center uppercase tracking-wider animate-in shake">
                  {submitError}
                </div>
              )}

              {/* Technical Toggle */}
              <button 
                onClick={(e) => { e.stopPropagation(); setShowScaleDiagnostics(!showScaleDiagnostics); }}
                className="mt-6 flex items-center gap-2 text-[9px] font-black text-slate-600 uppercase tracking-[0.2em] hover:text-slate-400"
              >
                <span>Diagnostic Logs</span>
                {showScaleDiagnostics ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              
              {showScaleDiagnostics && (
                <div className="w-full mt-4 max-h-40 overflow-y-auto no-scrollbar py-3 px-4 rounded-2xl bg-black/40 border border-slate-800/50 divide-y divide-slate-800/30">
                  {scaleDebugEntries.map(([label, value]) => (
                    <div key={label} className="flex justify-between py-1.5 gap-4">
                      <span className="text-[8px] font-black text-slate-500 uppercase shrink-0">{label}</span>
                      <span className="text-[8px] font-mono text-slate-300 break-all text-right">{value}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* MAIN ACTION BUTTON */}
            <button
              onClick={() => void handleSubmit()}
              disabled={submitPhase !== "idle" || isScaleBusy}
              className="w-full h-24 bg-[#0f2747] active:scale-[0.97] transition-all rounded-[2.5rem] text-white flex flex-col items-center justify-center gap-1 shadow-2xl shadow-[#0f2747]/20 disabled:opacity-40 disabled:active:scale-100"
            >
              {isSubmitting || isScaleBusy ? (
                <Loader2 size={32} className="animate-spin" />
              ) : (
                <>
                  <span className="text-xl font-black tracking-[0.18em] text-[#f8df8a]">บันทึกงาน</span>
                  <span className="text-[10px] font-bold text-slate-200 tracking-widest">บันทึกข้อมูลและออกบัตร</span>
                </>
              )}
            </button>
            {submitPhase === "syncing" && (
              <p className="text-center text-[10px] font-black text-amber-600 uppercase tracking-[0.2em] animate-pulse">
                กำลังซิงก์ข้อมูลค้าง…
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {scanMode === "single" ? (
              <button
                type="button"
                onClick={onChangeProduct}
                className="w-full rounded-[1.5rem] border border-[#d4af37]/35 bg-white py-4 text-[11px] font-black tracking-[0.16em] text-[#0f2747] shadow-sm"
              >
                เปลี่ยนสินค้า
              </button>
            ) : null}
            <button
              type="button"
              onClick={onResetAll}
              className="w-full rounded-[1.5rem] border border-slate-200 bg-white py-4 text-[11px] font-black tracking-[0.16em] text-slate-600 shadow-sm"
            >
              {scanMode === "single" ? "จบรอบงาน" : "สแกนรอบใหม่"}
            </button>
          </div>
        </div>
      </main>

      {/* Success Popups */}
      {popup.open && popup.queued && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-sm bg-white rounded-[3.5rem] overflow-hidden shadow-2xl animate-in zoom-in-95 duration-300 border border-white/20">
            <div className={`pt-12 pb-10 px-8 flex flex-col items-center text-center ${popup.tone === "warning" ? "bg-amber-50" : "bg-emerald-50"}`}>
              <div className={`h-24 w-24 rounded-[2.5rem] flex items-center justify-center mb-8 shadow-2xl ${popup.tone === "warning" ? "bg-amber-500 text-white" : "bg-emerald-500 text-white"}`}>
                {popup.tone === "warning" ? (
                  <AlertTriangle size={48} strokeWidth={3} />
                ) : (
                  <CheckCircle2 size={48} strokeWidth={3} />
                )}
              </div>
              <h3 className="text-3xl font-black text-slate-900 tracking-tight">
                {popup.title || (popup.duplicated ? "พบรายการซ้ำ" : "บันทึกแล้ว")}
              </h3>
              <p className="mt-3 text-sm font-bold text-slate-500 leading-snug">{popup.message}</p>
            </div>
            
            <div className="p-10 space-y-4">
              {popup.savedData && (
                <div className="bg-slate-50 rounded-3xl p-5 border border-slate-100 space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">เลขเอกสาร</span>
                    <span className="text-xs font-black text-slate-900">{popup.savedData.docNo || "-"}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">น้ำหนัก</span>
                    <span className="text-xs font-black text-[#0f2747]">{formatAmount(popup.savedData.inputValue, inputMode)} {inputUnitLabel}</span>
                  </div>
                </div>
              )}
              
              <div className="flex flex-col gap-3 pt-4">
                <button
                  onClick={() => {
                    beginNextAssignment();
                  }}
                  className="h-16 bg-slate-900 active:scale-95 transition-all text-white rounded-[1.5rem] text-[11px] font-black uppercase tracking-widest shadow-xl shadow-slate-200"
                >
                  {popup.duplicated ? "สแกนรายการใหม่" : "สแกนงานถัดไป"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}



      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          75% { transform: translateX(4px); }
        }
        .shake { animation: shake 0.2s ease-in-out 0s 2; }

        @media print {
          body.piece-rate-printing * {
            visibility: hidden !important;
          }

          body.piece-rate-printing #piece-rate-print-slip,
          body.piece-rate-printing #piece-rate-print-slip * {
            visibility: visible !important;
          }

          body.piece-rate-printing #piece-rate-print-slip {
            position: fixed !important;
            inset: 0 auto auto 0 !important;
            display: block !important;
            left: 0 !important;
            top: 0 !important;
            background: #fff !important;
          }
        }
      `}} />
    </div>
  );
}
