"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  Loader2,
  Radar,
  RefreshCw,
  Save,
  ScanSearch,
  Settings,
  Trash2,
  X,
} from "lucide-react";
import {
  DEFAULT_SCALE_CONFIG,
  normalizeScaleConfig,
} from "@/lib/scale/config";
import WeightScalePrimaryHeader from "@/features/production-line/components/WeightScalePrimaryHeader";
import { createScaleStream } from "@/features/production-line/services/scaleClient";
import {
  createStockWasteRequest,
  validateWasteSourceBarcodeRequest,
} from "@/features/production-line/services/productionStockWasteClient";

const SCALE_STORAGE_KEY = "kpf-weight-scale-profile-v1";
const RECENT_WASTE_LIMIT = 20;
const AUTO_SAVE_RESET_THRESHOLD_KG = 0.1;
const AUTO_SAVE_STABLE_TOLERANCE_KG = 0.01;
const AUTO_SAVE_STABLE_WINDOW_MS = 3500;
const TEST_WEIGHT_STEP = "0.001";

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
  if (!value) return "-";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "-";

  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(parsed);
}

function formatWeightDisplay(value) {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  if (!Number.isFinite(parsed)) return "-";
  return parsed.toFixed(2);
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

export default function WeightScaleWastePageClient({
  initialScaleConfig = null,
}) {
  const barcodeInputRef = useRef(null);
  const streamRef = useRef(null);
  const isSubmittingRef = useRef(false);

  const [scaleConfig, setScaleConfig] = useState(() => {
    const stored = typeof window !== "undefined"
      ? window.localStorage.getItem(SCALE_STORAGE_KEY)
      : null;
    return normalizeScaleConfig(
      stored ? JSON.parse(stored) : initialScaleConfig || DEFAULT_SCALE_CONFIG
    );
  });
  const [barcode, setBarcode] = useState("");
  const [sourceItem, setSourceItem] = useState(null);
  const [status, setStatus] = useState({
    state: "ready",
    message: "พร้อมรับสแกนบาร์โค้ดที่ต้องการบันทึกของเสีย",
    readAt: null,
  });
  const [liveReading, setLiveReading] = useState(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [recentWaste, setRecentWaste] = useState([]);
  const [isTestMode, setIsTestMode] = useState(false);
  const [testWeightInput, setTestWeightInput] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [stableCandidate, setStableCandidate] = useState(null);

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

  const handleBarcodeSubmit = async () => {
    const normalizedBarcode = barcode.trim().toUpperCase();
    if (!normalizedBarcode) return;

    setStatus({
      state: "processing",
      message: `กำลังตรวจสอบบาร์โค้ด ${normalizedBarcode}...`,
      readAt: new Date().toISOString(),
    });

    try {
      const item = await validateWasteSourceBarcodeRequest(normalizedBarcode);
      setSourceItem(item);
      setBarcode("");
      setStatus({
        state: "ready",
        message: "สแกนสำเร็จ วางของเสียบนเครื่องชั่ง",
        readAt: new Date().toISOString(),
      });
    } catch (error) {
      setSourceItem(null);
      setStatus({
        state: "error",
        message: error.message || "ไม่สามารถตรวจสอบบาร์โค้ดได้",
        readAt: new Date().toISOString(),
      });
    }
  };

  const stopPreview = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }
    setIsStreaming(false);
    setLiveReading(null);
    setStatus({
      state: "ready",
      message: "เครื่องชั่งถูกตัดการเชื่อมต่อ",
      readAt: new Date().toISOString(),
    });
  }, []);

  const startPreview = useCallback(() => {
    stopPreview();
    setIsStreaming(true);
    setStatus({
      state: "connecting",
      message: "กำลังเชื่อมต่อเครื่องชั่ง...",
      readAt: new Date().toISOString(),
    });

    const stream = createScaleStream(scaleConfig, {
      onStatus: (payload) => {
        setStatus({
          state: payload.state || "connected",
          message: payload.message || "เชื่อมต่อเครื่องชั่งแล้ว",
          readAt: new Date().toISOString(),
        });
      },
      onWeight: (payload) => {
        setLiveReading(payload);
      },
      onDeviceError: (payload) => {
        setStatus({
          state: "error",
          message: payload.error || "เครื่องชั่งขัดข้อง",
          readAt: new Date().toISOString(),
        });
      },
      onTransportError: () => {
        setStatus({
          state: "error",
          message: "ไม่สามารถสื่อสารกับเครื่องชั่งได้",
          readAt: new Date().toISOString(),
        });
        stopPreview();
      },
    });

    streamRef.current = stream;
  }, [scaleConfig, stopPreview]);

  const saveWaste = useCallback(async (weightKg) => {
    if (!sourceItem || isSubmittingRef.current || weightKg <= 0) return;

    isSubmittingRef.current = true;
    setIsSaving(true);
    setStatus({
      state: "processing",
      message: `กำลังบันทึกของเสีย ${weightKg.toFixed(2)} Kg...`,
      readAt: new Date().toISOString(),
    });

    try {
      const result = await createStockWasteRequest({
        sourceBarcode: sourceItem.barcode,
        wasteWeightKg: weightKg,
      });

      setRecentWaste((prev) => [
        {
          ...result,
          productCode: sourceItem.productCode,
          productName: sourceItem.productName,
          lotNo: sourceItem.lotNo,
          wastedAt: result.wastedAt || new Date().toISOString(),
        },
        ...prev.slice(0, RECENT_WASTE_LIMIT - 1),
      ]);

      setStatus({
        state: "success",
        message: `บันทึกของเสียสำเร็จ: ${weightKg.toFixed(2)} Kg (${sourceItem.productCode})`,
        readAt: new Date().toISOString(),
      });
      setSourceItem(null);
      setBarcode("");
      setStableCandidate(null);
      barcodeInputRef.current?.focus();
    } catch (error) {
      setStatus({
        state: "error",
        message: error.message || "ไม่สามารถบันทึกของเสียได้",
        readAt: new Date().toISOString(),
      });
    } finally {
      setIsSaving(false);
      isSubmittingRef.current = false;
    }
  }, [sourceItem]);

  useEffect(() => {
    if (!isStreaming || isTestMode || !sourceItem || isSubmittingRef.current) {
      setStableCandidate(null);
      return;
    }

    const currentWeight = Number.parseFloat(liveReading?.weightKg || "0");
    if (currentWeight < AUTO_SAVE_RESET_THRESHOLD_KG) {
      setStableCandidate(null);
      return;
    }

    if (
      !stableCandidate
      || Math.abs(stableCandidate.weight - currentWeight) > AUTO_SAVE_STABLE_TOLERANCE_KG
    ) {
      setStableCandidate({
        weight: currentWeight,
        timestamp: Date.now(),
      });
      return;
    }

    const duration = Date.now() - stableCandidate.timestamp;
    if (duration >= AUTO_SAVE_STABLE_WINDOW_MS) {
      void saveWaste(currentWeight);
      setStableCandidate(null);
    }
  }, [isStreaming, isTestMode, sourceItem, liveReading, stableCandidate, saveWaste]);

  const handleManualSave = () => {
    const weight = Number.parseFloat(testWeightInput);
    if (Number.isNaN(weight) || weight <= 0) {
      setStatus({
        state: "error",
        message: "กรุณาระบุน้ำหนักที่ถูกต้อง",
        readAt: new Date().toISOString(),
      });
      return;
    }
    void saveWaste(weight);
  };

  const updateScaleField = (key, value) => {
    const next = { ...scaleConfig, [key]: value };
    setScaleConfig(next);
    window.localStorage.setItem(SCALE_STORAGE_KEY, JSON.stringify(next));
  };

  const displayedWeight = isTestMode
    ? testWeightInput || "0.00"
    : Number.isFinite(Number(liveReading?.weightKg))
      ? Number(liveReading.weightKg).toFixed(2)
      : "0.00";

  return (
    <div className="min-h-screen bg-[#f4f6f8] text-[#262626]">
      <WeightScalePrimaryHeader
        eyebrow="ระบบชั่งของเสียผลิตภัณฑ์"
        badge="Waste Scale"
        title="ชั่งของเสียผลิตภัณฑ์"
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

      <section className="border-b border-[#1f3047] bg-[var(--surface-navy,#102C57)] text-white">
        <div className="mx-auto max-w-[84rem] px-4 pb-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between border-t border-white/10 pt-4">
            <div className={`inline-flex items-center gap-2 border px-4 py-2 text-xs font-black uppercase tracking-[0.18em] ${getStatusTone(status.state)}`}>
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
            <div className="grid border-b-2 border-[#d4af37]/30 bg-[#fbfcfd] lg:grid-cols-12">
              <div className="border-b border-[#e2e8f0] p-6 sm:p-8 lg:col-span-8 lg:border-b-0 lg:border-r lg:p-10">
                {!sourceItem ? (
                  <div className="flex h-full flex-col items-center justify-center py-4 text-center">
                    <div className="flex items-center gap-4 text-[#102C57]/20">
                      <Trash2 size={48} strokeWidth={1} />
                      <div className="text-left">
                        <p className="text-[10px] font-black uppercase tracking-[0.3em]">Ready to Waste</p>
                        <h2 className="text-3xl font-black uppercase tracking-widest">SCAN ISSUED BARCODE</h2>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-6">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[#a0aec0]">บาร์โค้ดที่อ้างอิง</span>
                        <span className="mt-1 self-start bg-[var(--surface-navy,#102C57)] px-3 py-1 text-sm font-black tracking-wider text-[#d4af37]">
                          {sourceItem.barcode}
                        </span>
                      </div>
                      <div className="hidden h-10 w-px bg-[#e2e8f0] sm:block" />
                      <div className="min-w-0 flex-1">
                        <span className="text-[10px] font-black uppercase tracking-widest text-[#a0aec0]">ชื่อผลิตภัณฑ์</span>
                        <h2 className="mt-1 truncate font-serif text-2xl font-medium text-[#102C57] sm:text-3xl">
                          {sourceItem.productName}
                        </h2>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 border-t border-[#e2e8f0] pt-6 md:flex md:items-center md:gap-8">
                      <div className="min-w-0 flex-1 text-center">
                        <p className="text-[10px] font-black uppercase tracking-widest text-black sm:text-xs">รหัสสินค้า</p>
                        <p className="mt-1 truncate text-lg font-bold text-black sm:text-xl">{sourceItem.productCode}</p>
                      </div>
                      <div className="hidden h-12 w-px bg-[#e2e8f0] md:block" />
                      <div className="min-w-0 flex-1 text-center">
                        <p className="text-[10px] font-black uppercase tracking-widest text-black sm:text-xs">LOT</p>
                        <p className="mt-1 text-lg font-bold text-black sm:text-xl">{sourceItem.lotNo}</p>
                      </div>
                      <div className="hidden h-12 w-px bg-[#e2e8f0] md:block" />
                      <div className="min-w-0 flex-1 text-center">
                        <p className="text-[10px] font-black uppercase tracking-widest text-black sm:text-xs">น้ำหนักที่เบิกไป</p>
                        <p className="mt-1 text-lg font-bold text-black sm:text-xl">{formatWeightDisplay(sourceItem.originalWeightKg)} Kg</p>
                      </div>
                      <div className="hidden h-12 w-px bg-[#e2e8f0] md:block" />
                      <div className="min-w-0 flex-1 text-center">
                        <p className="text-[10px] font-black uppercase tracking-widest text-black sm:text-xs">คืนแล้ว</p>
                        <p className="mt-1 text-lg font-bold text-black sm:text-xl">{formatWeightDisplay(sourceItem.returnedWeightKg)} Kg</p>
                      </div>
                      <div className="hidden h-12 w-px bg-[#e2e8f0] md:block" />
                      <div className="min-w-0 flex-1 text-center">
                        <p className="text-[10px] font-black uppercase tracking-widest text-black sm:text-xs">ของเสียแล้ว</p>
                        <p className="mt-1 text-lg font-bold text-rose-700 sm:text-xl">{formatWeightDisplay(sourceItem.wastedWeightKg)} Kg</p>
                      </div>
                      <div className="hidden h-12 w-px bg-[#e2e8f0] md:block" />
                      <div className="min-w-0 flex-1 text-center">
                        <p className="text-[10px] font-black uppercase tracking-widest text-black sm:text-xs">เหลือบันทึกได้</p>
                        <p className="mt-1 text-lg font-bold text-emerald-700 sm:text-xl">{formatWeightDisplay(sourceItem.remainingWeightKg)} Kg</p>
                      </div>
                    </div>
                    <div className="border-t border-[#e2e8f0] pt-4 text-center">
                      <p className="text-[10px] font-black uppercase tracking-widest text-black">สินค้าปลายทางเดิม</p>
                      <p className="mt-1 font-bold text-[#102C57]">
                        {sourceItem.targetProductCode
                          ? `${sourceItem.targetProductCode} - ${sourceItem.targetProductName}`
                          : "ไม่ระบุ (รายการเดิม)"}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col justify-center gap-4 bg-white p-6 sm:p-8 lg:col-span-4 lg:p-10">
                <button
                  type="button"
                  onClick={() => {
                    setSourceItem(null);
                    setBarcode("");
                    barcodeInputRef.current?.focus();
                  }}
                  className="flex h-14 items-center justify-center gap-2 border-2 border-[#102C57] text-[10px] font-black uppercase tracking-wider text-[#102C57] transition hover:bg-[var(--surface-navy,#102C57)] hover:text-white"
                >
                  <RefreshCw size={16} />
                  ล้างข้อมูลเพื่อสแกนใหม่
                </button>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={isStreaming ? stopPreview : startPreview}
                    className={`flex h-14 items-center justify-center gap-2 border-2 text-[10px] font-black uppercase tracking-wider transition ${
                      isStreaming
                        ? "border-rose-200 text-rose-600 hover:bg-rose-50"
                        : "border-[#102C57] text-[#102C57] hover:bg-[var(--surface-navy,#102C57)] hover:text-white"
                    }`}
                  >
                    {isStreaming ? <X size={16} /> : <Radar size={16} />}
                    {isStreaming ? "หยุดเชื่อมต่อ" : "เชื่อมเครื่องชั่ง"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsTestMode(!isTestMode)}
                    className={`flex h-14 items-center justify-center gap-2 border-2 text-[10px] font-black uppercase tracking-wider transition ${
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

            <div className="relative bg-[var(--surface-navy,#102C57)] px-4 py-8 text-center sm:px-10 lg:py-12">
              <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#d4af37_1px,transparent_1px)] [background-size:20px_20px]" />
              <div className="relative flex flex-col items-center justify-center">
                <div className="mb-4 flex items-center gap-3">
                  <div className={`flex items-center gap-2 border-2 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.25em] shadow-sm sm:px-4 sm:text-[10px] ${getStatusTone(status.state)}`}>
                    {status.state === "error" ? <AlertCircle size={14} /> : <Activity size={14} />}
                    <span>{status.message}</span>
                  </div>
                </div>

                {!sourceItem ? (
                  <div className="w-full max-w-2xl">
                    <div className="relative flex h-20 items-center border-b-4 border-[#d4af37] bg-white/5 px-6 transition focus-within:bg-white/10 sm:h-24 md:h-28">
                      <ScanSearch size={32} className="text-[#d4af37]" />
                      <input
                        ref={barcodeInputRef}
                        type="text"
                        value={barcode}
                        onChange={(event) => setBarcode(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleBarcodeSubmit();
                          }
                        }}
                        placeholder="สแกนบาร์โค้ดที่เบิกไปเพื่อบันทึกของเสีย..."
                        className="w-full bg-transparent px-6 font-mono text-2xl font-bold text-white outline-none placeholder:text-white/10 sm:text-3xl md:text-4xl"
                      />
                      {status.state === "processing" && (
                        <Loader2 size={32} className="animate-spin text-[#d4af37]" />
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="relative inline-flex items-baseline gap-2 sm:gap-4">
                    <span className="font-bold leading-none tracking-tighter text-[#d4af37] drop-shadow-[0_0_15px_rgba(212,175,55,0.3)] text-[5.5rem] sm:text-[10rem] md:text-[12rem] lg:text-[14rem]">
                      {displayedWeight}
                    </span>
                    <span className="text-xl font-black uppercase tracking-[0.2em] text-white/40 sm:text-2xl md:text-3xl">
                      Kg
                    </span>
                  </div>
                )}

                {sourceItem ? (
                  <div className="mt-8 min-h-[4rem] w-full max-w-lg">
                    {isTestMode ? (
                      <div className="space-y-4">
                        <input
                          type="number"
                          step={TEST_WEIGHT_STEP}
                          value={testWeightInput}
                          onChange={(event) => setTestWeightInput(event.target.value)}
                          placeholder="กรอกน้ำหนักของเสีย..."
                          className="h-10 w-full border-b border-[#d4af37] bg-transparent text-center text-lg font-bold text-white outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleManualSave}
                          disabled={isSaving}
                          className="flex h-16 w-full items-center justify-center gap-3 bg-[#d4af37] text-lg font-black uppercase tracking-[0.25em] text-[#102C57] shadow-[0_10px_20px_rgba(212,175,55,0.15)] transition-all hover:bg-[#e6c15c] active:scale-[0.98] disabled:opacity-50"
                        >
                          {isSaving ? <Loader2 size={24} className="animate-spin" /> : <Save size={24} />}
                          ยืนยันของเสีย
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-4">
                        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-white/20">
                          วางของเสียบนเครื่องชั่ง ระบบจะบันทึกอัตโนมัติเมื่อค่านิ่ง
                        </span>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section className="border border-[#e2e8f0] bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-[#e2e8f0] bg-[#fbfcfd] px-8 py-6">
              <h3 className="text-xs font-black uppercase tracking-[0.25em] text-[#102C57]">
                รายการที่เพิ่งบันทึกของเสีย
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border border-[#d7dde5]">
                <thead>
                  <tr className="bg-[#f8fafc] text-sm font-black uppercase tracking-wider text-black">
                    <th className="w-16 border border-[#d7dde5] px-4 py-4 text-center">#</th>
                    <th className="border border-[#d7dde5] px-6 py-4 text-center">รหัสอ้างอิง</th>
                    <th className="border border-[#d7dde5] px-6 py-4 text-center">สินค้า</th>
                    <th className="border border-[#d7dde5] px-6 py-4 text-center">LOT</th>
                    <th className="w-24 border border-[#d7dde5] px-4 py-4 text-center">จำนวน</th>
                    <th className="border border-[#d7dde5] px-6 py-4 text-center">น้ำหนักของเสีย</th>
                    <th className="border border-[#d7dde5] px-6 py-4 text-center">เวลา</th>
                  </tr>
                </thead>
                <tbody className="text-sm font-bold text-black">
                  {recentWaste.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="border border-[#d7dde5] px-8 py-16 text-center uppercase tracking-widest text-[#a0aec0]">
                        ยังไม่มีรายการของเสียในรอบนี้
                      </td>
                    </tr>
                  ) : (
                    recentWaste.map((item, index) => (
                      <tr key={`${item.movementNo}-${index}`} className="transition-colors hover:bg-[#fbfcfd]">
                        <td className="border border-[#d7dde5] px-4 py-4 text-center text-[#7d8795]">{index + 1}</td>
                        <td className="border border-[#d7dde5] px-6 py-4 text-center font-mono">{item.movementNo}</td>
                        <td className="whitespace-nowrap border border-[#d7dde5] px-6 py-4 text-center">
                          {item.productCode} - {item.productName}
                        </td>
                        <td className="border border-[#d7dde5] px-6 py-4 text-center">{item.lotNo}</td>
                        <td className="border border-[#d7dde5] px-4 py-4 text-center">1</td>
                        <td className="whitespace-nowrap border border-[#d7dde5] px-6 py-4 text-center text-rose-700">
                          {formatWeightDisplay(item.weightOutKg || item.netWeightKg)} Kg
                        </td>
                        <td className="border border-[#d7dde5] px-6 py-4 text-center">{formatDateTime(item.wastedAt)}</td>
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
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-xl border-2 border-[#d4af37] bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-[#d7dde5] bg-[var(--surface-navy,#102C57)] px-6 py-4 text-white">
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
            <div className="space-y-4 p-6">
              {CONFIG_FIELDS.map((field) => (
                <label key={field.key} className="block space-y-2">
                  <span className="text-sm font-black uppercase tracking-[0.08em] text-[#4f6076]">{field.label}</span>
                  <input
                    value={scaleConfig[field.key]}
                    onChange={(event) => updateScaleField(field.key, event.target.value)}
                    inputMode={field.inputMode}
                    placeholder={field.placeholder}
                    className="h-12 w-full border border-[#d7dde5] bg-[#fbfcfd] px-4 text-[#102C57] outline-none transition focus:border-[#d4af37] focus:bg-white"
                  />
                </label>
              ))}
              <div className="border-t border-[#d7dde5] pt-4">
                <button
                  type="button"
                  onClick={() => setIsSettingsOpen(false)}
                  className="h-12 w-full bg-[var(--surface-navy,#102C57)] font-black uppercase tracking-widest text-[#f3d67a] transition-colors hover:bg-[#1a3a6e]"
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
