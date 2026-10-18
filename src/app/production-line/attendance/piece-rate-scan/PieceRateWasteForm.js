"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, CheckCircle2, Flame, Loader2, Package, Radar, RotateCcw, Scale } from "lucide-react";

import { submitPieceRateWasteLog } from "@/features/attendance/services/pieceRateWasteClient";
import { createSubmitLock } from "@/lib/submitLock";
import PieceRateWorkflowTabs from "@/features/attendance/components/PieceRateWorkflowTabs";
import styles from "./PieceRateWasteWorkflow.module.css";
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
const DEFAULT_SCALE_STATUS = Object.freeze({
  connected: false,
  state: "idle",
  message: "พร้อมเชื่อมต่อเครื่องชั่ง",
  latestWeightKg: null,
  latestDisplayText: null,
});
const WASTE_CATEGORIES = Object.freeze([
  { value: "label_scrap", label: "เศษป้าย", icon: "label" },
  { value: "broken_scrap", label: "เศษหัก", icon: "broken" },
  { value: "burnt_scrap", label: "ไหม้", icon: "burnt" },
]);

function LabelScrapIcon({ size = 52 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="M10 14h44v13l-8 5 8 5v13H10V37l8-5-8-5V14Z" fill="currentColor" />
      <path d="m35 13-9 15 9 5-10 18" stroke="#0b3564" strokeWidth="5" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}

function BrokenScrapIcon({ size = 54 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true">
      <path d="m25 8 18 9-8 17-18-8 8-18Zm17 27 15 8-8 15-16-8 9-15ZM8 33l18-4 5 18-18 5-5-19Z" stroke="currentColor" strokeWidth="5" strokeLinejoin="miter" />
    </svg>
  );
}

function WasteCategoryIcon({ type, size }) {
  if (type === "label") return <LabelScrapIcon size={size} />;
  if (type === "broken") return <BrokenScrapIcon size={size} />;
  return <Flame size={size} fill="currentColor" strokeWidth={2.5} />;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function parseScaleNumber(value, { allowZero = false } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  if (parsed < 0) return null;
  if (!allowZero && parsed === 0) return null;
  return parsed;
}

function extractDisplayWeight(displayText) {
  const normalized = normalizeText(displayText);
  if (!normalized) return null;
  const match = normalized.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  return parseScaleNumber(match[0], { allowZero: true });
}

function resolveScaleResultWeightKg(result) {
  if (!result || typeof result !== "object") return null;
  const direct = parseScaleNumber(result.weightKg, { allowZero: true });
  if (direct !== null) return direct;
  return extractDisplayWeight(result.displayText);
}

function resolveSavedProduct(productLookup) {
  const product = productLookup?.product || {};
  return {
    code: normalizeText(product.goodsCode || product.code),
    goodsCode: normalizeText(product.goodsCode || product.code),
    skuCode: normalizeText(product.skuCode || product.code),
    name: normalizeText(product.name || product.skuName),
  };
}

function resolveProductImage(productLookup) {
  const product = productLookup?.product || productLookup || {};
  if (product.imageUrl) return product.imageUrl;
  if (product.image_url) return product.image_url;
  if (productLookup?.imageUrl) return productLookup.imageUrl;
  if (productLookup?.image_url) return productLookup.image_url;
  const images = Array.isArray(product.images) ? product.images : [];
  const primary = images.find((item) => item?.isPrimary && (item?.imageUrl || item?.image_url)) || images.find((item) => item?.imageUrl || item?.image_url);
  return primary?.imageUrl || primary?.image_url || null;
}

function buildRequestId() {
  return `piece-rate-waste-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function buildWasteSubmitTelemetry({
  exactWeightKg,
  displayedWeight,
  scaleStatus,
  scaleWeight,
  stableResult,
  manualWeight,
  isManual,
  isDeviceStable,
}) {
  return {
    isManual,
    displayedWeightKg: displayedWeight,
    exactWeightKg,
    manualWeightKg: isManual ? parseScaleNumber(manualWeight, { allowZero: true }) : null,
    scaleDeviceStable: Boolean(isDeviceStable),
    scaleState: scaleStatus?.state || null,
    scaleMessage: scaleStatus?.message || null,
    scaleDisplayText: scaleStatus?.latestDisplayText || null,
    previewRead: scaleWeight ? {
      weightKg: resolveScaleResultWeightKg(scaleWeight),
      displayText: scaleWeight.displayText || null,
      rawText: scaleWeight.rawText || null,
      stable: Boolean(scaleWeight.stable),
    } : null,
    stableRead: stableResult ? {
      ok: Boolean(stableResult.ok),
      weightKg: resolveScaleResultWeightKg(stableResult),
      displayText: stableResult.displayText || null,
      rawText: stableResult.rawText || null,
      commandUsed: stableResult.commandUsed || null,
      state: stableResult.state || null,
    } : null,
  };
}

function formatWeight(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(3) : "0.000";
}

export default function PieceRateWasteForm({
  productLookup,
  productScanValue,
  onChangeProduct,
  onNextAssignment,
  onResetAll,
  desktopMode = false,
  desktopScale = null,
  machineCode: resolvedMachineCode = null,
  workflowMode = "waste",
  onWorkflowModeChange,
}) {
  const initialWeight = getLatestScaleWeightSnapshot();
  const requestIdRef = useRef(buildRequestId());
  const submitLockRef = useRef(createSubmitLock());
  const [scaleStatus, setScaleStatus] = useState(
    () => getLatestScaleStatusSnapshot() || DEFAULT_SCALE_STATUS
  );
  const [scaleWeight, setScaleWeight] = useState(initialWeight);
  const [manualWeight, setManualWeight] = useState("");
  const [isScaleBusy, setIsScaleBusy] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [savedData, setSavedData] = useState(null);
  const [wasteCategory, setWasteCategory] = useState("");

  const hasScaleBridge = !desktopMode && hasAndroidScaleBridge();
  const isScaleConnected = desktopMode
    ? Boolean(desktopScale?.agentConnected && desktopScale?.portOpen !== false && desktopScale?.isReadingFresh)
    : hasScaleBridge && Boolean(scaleStatus?.connected);
  const exactWeightKg = desktopMode ? parseScaleNumber(desktopScale?.weightKg, { allowZero: true }) : resolveScaleResultWeightKg(scaleWeight)
    ?? extractDisplayWeight(scaleStatus?.latestDisplayText)
    ?? parseScaleNumber(scaleStatus?.latestWeightKg, { allowZero: true });
  const isDeviceStable = desktopMode
    ? Boolean(desktopScale?.isStable && desktopScale?.isReadingFresh)
    : Boolean(scaleWeight?.stable || scaleStatus?.state === "stable");
  const displayedWeight = isScaleConnected ? exactWeightKg : parseScaleNumber(manualWeight, { allowZero: true });
  const hasValidWeight = isScaleConnected
    ? (isDeviceStable && Number(displayedWeight || 0) > 0)
    : Number(displayedWeight || 0) > 0;

  useEffect(() => {
    if (desktopMode || !hasScaleBridge) return undefined;

    let cancelled = false;
    const handleScaleStatus = (event) => {
      setScaleStatus(event?.detail || DEFAULT_SCALE_STATUS);
    };
    const handleScaleWeight = (event) => {
      setScaleWeight(event?.detail || null);
    };
    const bootstrapScale = async () => {
      const stateResult = await getScaleState();
      if (!cancelled && stateResult?.bridgeAvailable) {
        setScaleStatus((current) => ({ ...current, ...stateResult }));
      }
      const previewResult = await startScalePreview(SCALE_CONFIG);
      if (!cancelled && previewResult?.bridgeAvailable) {
        setScaleStatus((current) => ({ ...current, ...previewResult }));
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
  }, [desktopMode, hasScaleBridge]);

  const handleSubmit = async () => {
    setErrorMessage("");

    if (!wasteCategory) {
      setErrorMessage("กรุณาเลือกประเภทของเสียก่อนบันทึก");
      return;
    }

    if (!submitLockRef.current.tryStart()) {
      return;
    }

    setIsSubmitting(true);
    let stableResult = null;
    let resolvedWeight = displayedWeight;

    try {
      if (!desktopMode && hasScaleBridge && isScaleConnected) {
        setIsScaleBusy(true);
        stableResult = await readStableScaleWeight(SCALE_CONFIG);
        setIsScaleBusy(false);

        if (!stableResult?.ok) {
          throw new Error("เครื่องชั่งยังไม่นิ่ง กรุณารอน้ำหนักนิ่งก่อนบันทึก");
        }

        const stableWeightKg = resolveScaleResultWeightKg(stableResult);
        if (stableWeightKg === null || stableWeightKg <= 0) {
          throw new Error("ไม่สามารถอ่านค่าน้ำหนักที่ถูกต้องจากเครื่องชั่งได้");
        }
        resolvedWeight = stableWeightKg;
      } else if (desktopMode) {
        if (isScaleConnected) {
          if (!isDeviceStable || Number(exactWeightKg || 0) <= 0) {
            throw new Error("เครื่องชั่งเดสก์ท็อปยังไม่พร้อมหรือน้ำหนักไม่นิ่ง");
          }
          resolvedWeight = exactWeightKg;
        } else {
          const parsedManual = parseScaleNumber(manualWeight);
          if (parsedManual === null || parsedManual <= 0) {
            throw new Error("กรุณากรอกน้ำหนักของเสียที่ถูกต้อง");
          }
          resolvedWeight = parsedManual;
        }
      } else {
        const parsedManual = parseScaleNumber(manualWeight);
        if (parsedManual === null || parsedManual <= 0) {
          throw new Error("กรุณากรอกน้ำหนักของเสียที่ถูกต้อง");
        }
        resolvedWeight = parsedManual;
      }

      const product = resolveSavedProduct(productLookup);
      const machineCode = normalizeText(resolvedMachineCode)
        || (typeof window !== "undefined" ? normalizeText(window.localStorage.getItem(MACHINE_STORAGE_KEY)) : "")
        || "MC01";
      const validMachineCode = MACHINE_CODE_REGEX.test(machineCode) ? machineCode : "MC01";
      const productBarcode = normalizeText(
        productLookup?.productBarcode ||
        productLookup?.barcode ||
        productScanValue ||
        product.goodsCode ||
        product.code
      );
      if (!productBarcode) {
        throw new Error("ไม่พบบาร์โค้ดสินค้า กรุณาสแกนหรือเลือกสินค้าใหม่อีกครั้ง");
      }

      const telemetry = buildWasteSubmitTelemetry({
        exactWeightKg,
        displayedWeight: resolvedWeight,
        scaleStatus,
        scaleWeight,
        stableResult,
        manualWeight,
        isManual: !isScaleConnected,
        isDeviceStable,
      });

      const result = await submitPieceRateWasteLog({
        requestId: requestIdRef.current,
        productBarcode,
        product_barcode: productBarcode,
        productCode: product.code,
        goodsCode: product.goodsCode,
        skuCode: product.skuCode,
        productName: product.name,
        wasteCategory,
        wasteWeightKg: resolvedWeight,
        machineCode: validMachineCode,
        rawProductQrPayload: productScanValue || productBarcode,
        rawProductBarcodePayload: productScanValue || productBarcode,
        telemetry,
      });

      if (!result.ok) {
        throw new Error(result.error?.message || "บันทึกของเสียไม่สำเร็จ");
      }

      requestIdRef.current = buildRequestId();
      setManualWeight("");
      setSavedData({
        productCode: product.code,
        productName: product.name,
        wasteCategory,
        wasteWeightKg: resolvedWeight,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "บันทึกของเสียไม่สำเร็จ");
    } finally {
      setIsScaleBusy(false);
      setIsSubmitting(false);
      submitLockRef.current.release();
    }
  };

  const product = resolveSavedProduct(productLookup);
  const imageUrl = resolveProductImage(productLookup);

  if (desktopMode) {
    return (
      <main className={styles.page}>
        <PieceRateWorkflowTabs activeMode={workflowMode} onChange={onWorkflowModeChange} />
        <header className={styles.hero}>
          <div className={styles.heroTitle}>
            <div className={styles.heroIcon}><Scale /></div>
            <div><span className={styles.eyebrow}>WASTE WEIGH</span><h1>ชั่งของเสียจากการผลิต</h1><p>ตรวจสอบสินค้าและอ่านน้ำหนักคงที่จาก Scale Agent ก่อนบันทึก</p></div>
          </div>
          <div className={styles.modeCard}><span>โหมดการทำงานปัจจุบัน</span><strong>อ่านน้ำหนักของเสียจาก Scale Agent</strong></div>
        </header>
        <section className={styles.workspace}>
          <div className={styles.panel}>
            <div className={styles.stepTitle}><span className={styles.stepNo}>01</span><div><h2>สินค้าที่เลือก</h2><p>ตรวจสอบรายละเอียดก่อนบันทึกน้ำหนักของเสีย</p></div></div>
            <div className={styles.productCard}>
              <div className={styles.productImage}>
                {imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrl} alt={product?.name || "สินค้า"} />
                ) : <Package />}
              </div>
              <div>
                <div className={styles.detailLabel}>รหัสสินค้า</div><div className={styles.detailValue}>{product?.goodsCode || product?.code || "-"}</div>
                <div className={styles.detailLabel}>ชื่อสินค้า</div><div className={styles.detailValue}>{product?.name || "-"}</div>
                <div className={styles.detailLabel}>บาร์โค้ดสินค้า</div><div className={styles.detailValue}>{productLookup?.productBarcode || productScanValue || "-"}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={onChangeProduct || onNextAssignment}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-amber-400/50 bg-amber-400/10 py-3 text-sm font-black text-amber-300 transition-all hover:bg-amber-400/20 active:scale-[0.98]"
            >
              <RotateCcw size={16} />
              เปลี่ยนสินค้า / สแกนสินค้าใหม่
            </button>
          </div>
          <div className={`${styles.panel} ${styles.scalePanel}`}>
            <div className={styles.categoryHeader}>
              <span className={styles.stepNo}>02</span>
              <div><h2>ประเภทของเสีย</h2><p>กรุณาเลือก 1 ประเภทก่อนบันทึก</p></div>
            </div>
            <div className={styles.categoryGrid} role="radiogroup" aria-label="ประเภทของเสีย">
              {WASTE_CATEGORIES.map((category) => {
                const selected = wasteCategory === category.value;
                return (
                  <button key={category.value} type="button" role="radio" aria-checked={selected} className={styles.categoryOption} data-selected={selected} onClick={() => { setWasteCategory(category.value); setErrorMessage(""); }}>
                    {selected ? <span className={styles.categoryCheck}><Check size={17} strokeWidth={3} /></span> : null}
                    <WasteCategoryIcon type={category.icon} size={52} />
                    <strong>{category.label}</strong>
                  </button>
                );
              })}
            </div>
            <div className={styles.scaleStatus} data-ready={Boolean(desktopScale?.agentConnected && desktopScale?.portOpen !== false)}><Scale size={18} /> Scale Agent {desktopScale?.agentConnected ? (desktopScale?.portOpen === false ? "รอพอร์ต" : "เชื่อมต่อ") : "ออฟไลน์"}<i /></div>
            <div className={styles.weight}>{formatWeight(displayedWeight)}<small>kg</small></div>
            <div className={styles.badge}>{savedData ? "บันทึกสำเร็จ" : isDeviceStable ? "น้ำหนักนิ่ง" : "รอน้ำหนักนิ่ง"}</div>
            {errorMessage ? <div className={styles.error}><AlertTriangle className="inline" size={16} /> {errorMessage}</div> : null}
            {wasteCategory && Number(displayedWeight || 0) > 0 ? <div className={styles.selectionSummary}>ประเภท: <strong>{WASTE_CATEGORIES.find((item) => item.value === wasteCategory)?.label}</strong><span>·</span>น้ำหนัก: <strong>{formatWeight(displayedWeight)} กก.</strong></div> : null}
            {savedData ? (
              <button type="button" className={styles.action} onClick={onNextAssignment}>ชั่งรายการถัดไป</button>
            ) : (
              <button
                type="button"
                className={styles.action}
                onClick={() => void handleSubmit()}
                disabled={isSubmitting || isScaleBusy || !wasteCategory || !hasValidWeight}
              >
                {isSubmitting || isScaleBusy ? "กำลังบันทึก..." : "บันทึกของเสีย"}
              </button>
            )}
            {!savedData && (!wasteCategory || !hasValidWeight) ? (
              <p className={styles.actionHint}>
                {!wasteCategory
                  ? "เลือกประเภทของเสียเพื่อเปิดปุ่มบันทึก"
                  : !isScaleConnected
                    ? "กรุณาเชื่อมต่อ Scale Agent หรือกรอกน้ำหนัก"
                    : !isDeviceStable || Number(displayedWeight || 0) <= 0
                      ? "วางของบนเครื่องชั่งและรอให้น้ำหนักนิ่ง"
                      : ""}
              </p>
            ) : null}
          </div>
        </section>
        <section className={styles.history}><div className={styles.historyHeader}>รายการล่าสุดในรอบนี้ <span>{savedData ? 1 : 0} รายการ</span></div><div className={styles.historyEmpty}>{savedData ? `${savedData.productCode} · ${savedData.productName} · ${formatWeight(savedData.wasteWeightKg)} kg` : "ยังไม่มีรายการที่บันทึกในรอบนี้"}</div></section>
      </main>
    );
  }

  if (savedData) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#f8fafc] p-5 text-slate-900">
        <section className="w-full max-w-md border border-emerald-200 bg-white p-8 text-center shadow-xl">
          <CheckCircle2 className="mx-auto text-emerald-600" size={64} />
          <h1 className="mt-5 text-2xl font-black text-[#0f2747]">บันทึกของเสียแล้ว</h1>
          <p className="mt-2 font-semibold text-slate-600">
            {savedData.productCode} - {savedData.productName}
          </p>
          <p className="mt-6 text-5xl font-black tabular-nums text-rose-600">
            {formatWeight(savedData.wasteWeightKg)} <span className="text-lg">Kg</span>
          </p>
          <button
            type="button"
            onClick={onNextAssignment}
            className="mt-8 h-16 w-full bg-[#0f2747] font-black tracking-wider text-[#f8df8a] active:scale-[0.98]"
          >
            สแกนสินค้าถัดไป
          </button>
        </section>
      </main>
    );
  }

  const scaleLabel = !hasScaleBridge
    ? "MANUAL"
    : isScaleBusy
      ? "HOLDING"
      : isScaleConnected && isDeviceStable
        ? "STABLE"
        : isScaleConnected
          ? "LIVE"
          : "OFFLINE";

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[#f8fafc] text-slate-900">
      {desktopMode ? (
        <PieceRateWorkflowTabs activeMode={workflowMode} onChange={onWorkflowModeChange} />
      ) : null}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-[#d4af37]/25 bg-white px-4 py-3 shadow-sm">
        <button type="button" onClick={onResetAll} className="p-2 text-slate-500" aria-label="กลับไปเลือกโหมด">
          <ArrowLeft size={22} />
        </button>
        <div className="text-center">
          <h1 className="font-black text-[#0f2747]">ชั่งของเสีย</h1>
          <p className="text-[10px] font-bold tracking-[0.18em] text-[#b68a12]">LINE WASTE WEIGHT</p>
        </div>
        <Scale size={22} className="text-[#b68a12]" />
      </header>

      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 p-4 sm:p-6">
        <section className="border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-4">
              {imageUrl ? (
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={imageUrl}
                    alt={product?.name || "สินค้า"}
                    className="h-full w-full object-contain"
                  />
                </div>
              ) : null}
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#b68a12]">สินค้าที่สแกน</p>
                <h2 className="mt-1 text-xl font-black text-[#0f2747]">
                  {product?.goodsCode || product?.code || "-"}
                </h2>
                <p className="mt-0.5 font-semibold text-slate-600">{product?.name || "-"}</p>
                <p className="mt-1 break-all text-xs text-slate-400">{productLookup?.productBarcode || productScanValue || "-"}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onChangeProduct || onNextAssignment}
              className="inline-flex shrink-0 items-center gap-1.5 border border-[#d4af37] bg-white px-3 py-1.5 text-xs font-bold text-[#102C57] transition hover:bg-amber-50 active:scale-95"
            >
              <RotateCcw size={14} className="text-[#b68a12]" />
              เปลี่ยนสินค้า
            </button>
          </div>
        </section>

        <section className="flex flex-1 flex-col items-center justify-center bg-[#020617] px-6 py-10 text-white shadow-2xl sm:py-14">
          <div className="mb-6 w-full">
            <p className="text-center text-sm font-black text-white">เลือกประเภทของเสีย</p>
            <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="ประเภทของเสีย">
              {WASTE_CATEGORIES.map((category) => {
                const selected = wasteCategory === category.value;
                return <button key={category.value} type="button" role="radio" aria-checked={selected} onClick={() => { setWasteCategory(category.value); setErrorMessage(""); }} className={`relative flex min-h-24 flex-col items-center justify-center gap-2 border p-2 font-black ${selected ? "border-[#f0bd2f] bg-[#f0bd2f] text-[#0f2747]" : "border-slate-600 bg-[#0b2342] text-white"}`}>{selected ? <Check className="absolute right-2 top-2" size={15} /> : null}<WasteCategoryIcon type={category.icon} size={30} /><span>{category.label}</span></button>;
              })}
            </div>
          </div>
          <div className="flex w-full items-center justify-between">
            <span className={`inline-flex items-center gap-2 border px-3 py-1 text-[10px] font-black ${isDeviceStable ? "border-emerald-400 text-emerald-300" : "border-amber-400 text-amber-300"}`}>
              <Radar size={13} className={isScaleBusy ? "animate-spin" : ""} />
              {scaleLabel}
            </span>
            <span className="text-[10px] font-bold text-slate-500">{scaleStatus?.message || "-"}</span>
          </div>

          <div className="my-10 flex min-h-48 w-full items-center justify-center sm:min-h-64">
            <div className="text-center">
              <span className="block text-6xl font-black tabular-nums tracking-tight text-[#f8df8a] sm:text-8xl">
                {formatWeight(displayedWeight)}
              </span>
              <span className="mt-3 block text-sm font-black uppercase tracking-[0.35em] text-slate-400">Kilogram</span>
            </div>
          </div>

          {!isScaleConnected ? (
            <label className="w-full max-w-xs">
              <span className="mb-2 block text-center text-xs font-bold text-slate-400">กรอกน้ำหนักเมื่อไม่มีเครื่องชั่ง</span>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                step="0.001"
                value={manualWeight}
                onChange={(event) => setManualWeight(event.target.value)}
                className="h-14 w-full border border-slate-700 bg-slate-900 px-4 text-center text-2xl font-black text-white outline-none focus:border-[#d4af37]"
              />
            </label>
          ) : null}

          {errorMessage ? (
            <div className="mt-5 flex w-full items-center justify-center gap-2 border border-rose-500/40 bg-rose-500/10 p-3 text-center text-sm font-bold text-rose-300">
              <AlertTriangle size={18} />
              {errorMessage}
            </div>
          ) : null}
        </section>

        <button
          type="button"
          onClick={() => void handleSubmit()}
          disabled={isSubmitting || isScaleBusy || !wasteCategory || !hasValidWeight}
          className="flex h-20 w-full items-center justify-center gap-3 bg-[#0f2747] text-lg font-black tracking-[0.15em] text-[#f8df8a] shadow-xl active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting || isScaleBusy ? <Loader2 className="animate-spin" size={28} /> : <Scale size={28} />}
          บันทึกของเสีย
        </button>
        {!wasteCategory ? (
          <p className="-mt-2 text-center text-sm font-bold text-amber-700">เลือกประเภทของเสียเพื่อเปิดปุ่มบันทึก</p>
        ) : !hasValidWeight ? (
          <p className="-mt-2 text-center text-sm font-bold text-amber-700">
            {isScaleConnected ? "วางของบนเครื่องชั่งและรอให้น้ำหนักนิ่ง" : "กรุณากรอกน้ำหนักของเสีย"}
          </p>
        ) : null}
      </main>
    </div>
  );
}
