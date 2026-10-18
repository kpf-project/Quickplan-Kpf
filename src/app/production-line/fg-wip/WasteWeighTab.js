"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Ban,
  Barcode,
  Blocks,
  Check,
  CheckCircle2,
  Circle,
  Database,
  Loader2,
  Minus,
  Package,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Scale,
  Search,
  Settings,
  X,
} from "lucide-react";
import usePieceRateDesktopScale from "@/app/production-line/attendance/piece-rate-scan/usePieceRateDesktopScale";
import PieceRateDeviceSettingsDialog from "@/app/production-line/attendance/piece-rate-scan/PieceRateDeviceSettingsDialog";
import FgWipSuccessToast from "./FgWipSuccessToast";
import { printWasteLabelViaAgent } from "@/features/production-line/services/localPrintAgentClient";
import { buildWastePrintLabel } from "@/features/production-line/services/wasteLabel";

const WASTE_REASONS = {
  filling_scrap: ["ตกหล่นระหว่างบรรจุ", "เศษแตก", "ปนเปื้อน", "อื่นๆ"],
  rejected_can: ["ซีลไม่สมบูรณ์", "บรรจุไม่ครบ", "ภาชนะชำรุด", "ไม่ผ่านคุณภาพ", "อื่นๆ"],
};

const formatWeight = (value) => (Number.isFinite(Number(value)) ? Number(value).toFixed(3) : "0.000");

function WasteTypeCard({ active, icon, title, description, onClick }) {
  const Icon = icon;
  return (
    <button type="button" onClick={onClick} className={`flex min-h-24 items-center gap-4 border p-4 text-left transition-colors ${active ? "border-[#d39b00] bg-[#fffaf0]" : "border-[#8fa0b4] bg-white hover:bg-[#f5f7fa]"}`}>
      {active ? <CheckCircle2 className="shrink-0 text-[#d39b00]" size={25} /> : <Circle className="shrink-0 text-[#72839a]" size={25} />}
      <Icon className={active ? "text-[#d39b00]" : "text-[#061f43]"} size={43} strokeWidth={1.7} />
      <span><strong className="block text-lg text-[#061f43]">{title}</strong><small className="mt-1 block text-[#526477]">{description}</small></span>
    </button>
  );
}

export default function WasteWeighTab({ productionDate, operatorName }) {
  const [product, setProduct] = useState(null);
  const [barcode, setBarcode] = useState("");
  const [wasteType, setWasteType] = useState("filling_scrap");
  const [reason, setReason] = useState(WASTE_REASONS.filling_scrap[0]);
  const [notes, setNotes] = useState("");
  const [rejectedCanQty, setRejectedCanQty] = useState(1);
  const [products, setProducts] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [history, setHistory] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [message, setMessage] = useState(null);
  const [cancelRow, setCancelRow] = useState(null);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const isWeightMode = wasteType === "filling_scrap";
  const scale = usePieceRateDesktopScale({
    hasProduct: Boolean(product),
    hasEmployee: true,
    enabled: isWeightMode,
  });
  const canSave = product && (isWeightMode ? scale.canSave : rejectedCanQty > 0) && reason && !submitting;
  const grossWeightKg = Number(scale.weightKg || 0);
  const netWeightKg = grossWeightKg;

  const loadHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const response = await fetch(`/api/production-line/fg-wip/waste?date=${encodeURIComponent(productionDate)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "โหลดรายการของเสียไม่สำเร็จ");
      setHistory(payload?.data || []);
    } catch {
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, [productionDate]);

  useEffect(() => { void loadHistory(); }, [loadHistory]);

  const loadProducts = async (query = "") => {
    setLoadingProducts(true);
    try {
      const response = await fetch(`/api/production-line/fg-wip/products?search=${encodeURIComponent(query)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "โหลดสินค้าไม่สำเร็จ");
      setProducts(payload?.data || []);
      return payload?.data || [];
    } catch (error) {
      setMessage({ type: "error", text: error.message });
      return [];
    } finally {
      setLoadingProducts(false);
    }
  };

  const chooseProduct = (row) => {
    setProduct(row);
    setBarcode(row.barcode || row.productCode);
    setPickerOpen(false);
    setMessage(null);
  };

  const scanProduct = async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const value = barcode.trim().toUpperCase();
    const rows = await loadProducts(value);
    const exact = rows.find((row) => row.barcode === value || row.productCode === value);
    if (exact) chooseProduct(exact);
    else setMessage({ type: "error", text: "ไม่พบสินค้า FG จากบาร์โค้ดนี้" });
  };

  const selectWasteType = (type) => {
    setWasteType(type);
    setReason(WASTE_REASONS[type][0]);
    setMessage(null);
  };

  const submit = async () => {
    if (!canSave) {
      setMessage({ type: "error", text: !product ? "กรุณาเลือกสินค้า FG" : isWeightMode ? (scale.reason || "กรุณารอให้น้ำหนักนิ่ง") : "กรุณากรอกจำนวนปี๊บที่เสีย" });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const requestId = globalThis.crypto?.randomUUID?.();
      const response = await fetch("/api/production-line/fg-wip/waste", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId,
          productionDate,
          product,
          wasteType,
          reason,
          notes,
          netWeightKg: isWeightMode ? netWeightKg : null,
          rejectedCanQty: isWeightMode ? null : rejectedCanQty,
          scaleAudit: isWeightMode ? { connected: scale.agentConnected && scale.portOpen, stable: scale.isStable, readingAt: scale.reading?.at || null } : null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "บันทึกของเสียไม่สำเร็จ");
      let printErrorMessage = "";
      try {
        await printWasteLabelViaAgent(buildWastePrintLabel(payload.data));
      } catch (printError) {
        printErrorMessage = printError?.message || "ไม่พบเครื่องพิมพ์";
      }
      const savedText = isWeightMode
        ? `บันทึกของเสีย ${formatWeight(netWeightKg)} กก. สำเร็จ`
        : `บันทึกเสียทั้ง${product?.subUnitName || "ปี๊บ"} ${rejectedCanQty} ${product?.subUnitName || "ปี๊บ"}สำเร็จ`;
      setMessage({
        type: printErrorMessage ? "error" : "success",
        text: printErrorMessage ? `${savedText} แต่พิมพ์ไม่สำเร็จ: ${printErrorMessage}` : `${savedText} และพิมพ์บาร์โค้ดแล้ว`,
      });
      setNotes("");
      if (!isWeightMode) setRejectedCanQty(1);
      await loadHistory();
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  const reprintWaste = async (row) => {
    setMessage(null);
    try {
      await printWasteLabelViaAgent(buildWastePrintLabel(row));
      setMessage({ type: "success", text: `พิมพ์บาร์โค้ด ${row.waste_barcode} สำเร็จ` });
    } catch (error) {
      setMessage({ type: "error", text: `พิมพ์ไม่สำเร็จ: ${error?.message || "ไม่พบเครื่องพิมพ์"}` });
    }
  };

  const cancelWaste = async () => {
    if (!cancelRow || !cancelReason.trim() || cancelling) return;
    setCancelling(true);
    setMessage(null);
    try {
      const response = await fetch("/api/production-line/fg-wip/waste", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cancelRow.id, voidReason: cancelReason.trim() }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "ยกเลิกรายการของเสียไม่สำเร็จ");
      setCancelRow(null);
      setCancelReason("");
      setMessage({ type: "success", text: `ยกเลิกรายการ ${cancelRow.waste_barcode} แล้ว` });
      await loadHistory();
    } catch (error) {
      setMessage({ type: "error", text: error?.message || "ยกเลิกรายการของเสียไม่สำเร็จ" });
    } finally {
      setCancelling(false);
    }
  };

  const totalWeight = history.reduce((sum, row) => sum + Number(row.net_weight_kg || 0), 0);
  const totalCans = history.reduce((sum, row) => sum + Number(row.rejected_can_qty || 0), 0);

  return (
    <main className="w-full p-2 text-[#061f43] sm:p-4">
      <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3 sm:gap-4"><Scale className="h-11 w-11 shrink-0 sm:h-[55px] sm:w-[55px]" strokeWidth={1.8} /><div><h2 className="text-xl font-bold sm:text-2xl">ชั่งของเสียจากการผลิต</h2><p className="text-xs text-[#526477] sm:text-sm">เลือกสินค้า FG และอ่านน้ำหนักจากตาชั่งแบบเรียลไทม์</p></div></div>
        <div className="flex min-h-12 items-center gap-3 border border-[#8fa0b4] bg-white px-4 sm:h-14 sm:px-5"><span className={`h-4 w-4 shrink-0 rounded-full sm:h-5 sm:w-5 ${scale.agentConnected && scale.portOpen ? "bg-emerald-700" : "bg-red-600"}`} /><strong className="text-sm sm:text-base">{isWeightMode ? (scale.agentConnected && scale.portOpen ? "เครื่องชั่งเชื่อมต่อแล้ว" : "เครื่องชั่งยังไม่เชื่อมต่อ") : "โหมดกรอกจำนวนปี๊บ"}</strong></div>
      </div>

      <div className="mb-3 grid min-h-14 grid-cols-3 items-center border border-[#8fa0b4] bg-white px-1 py-2 sm:px-3 lg:flex lg:px-20 lg:py-0">
        {[["1", "เลือกสินค้า FG", Boolean(product)], ["2", "เลือกประเภทของเสีย", Boolean(product)], ["3", isWeightMode ? "ชั่งและบันทึก" : "กรอกจำนวนและบันทึก", false]].map(([no, label, done], index) => <div key={no} className="contents"><div className={`flex min-w-0 flex-col items-center justify-center gap-1 text-center sm:flex-row sm:gap-2 lg:min-w-[220px] lg:gap-4 ${index === 0 && !product ? "text-[#b98000]" : ""}`}><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold text-white sm:h-9 sm:w-9 sm:text-lg ${index === 0 && !product ? "bg-[#c68e00]" : "bg-[var(--surface-navy,#061f43)]"}`}>{done && index === 0 ? <Check size={18} /> : no}</span><strong className="text-[11px] leading-tight sm:text-sm lg:text-base">{label}</strong></div>{index < 2 ? <div className="mx-3 hidden h-px flex-1 bg-[#6f829a] lg:block" /> : null}</div>)}
      </div>

      <FgWipSuccessToast message={message?.type === "success" ? message.text : ""} onClose={() => setMessage(null)} />
      {message?.type === "error" ? <div className="mb-3 border border-red-500 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{message.text}</div> : null}

      <div className="grid gap-3 lg:grid-cols-[1.08fr_.92fr]">
        <div className="space-y-3">
          <section className="border border-[#8fa0b4] bg-white p-3">
            <h3 className="mb-3 flex items-center gap-3 text-xl font-bold"><span className="grid h-8 w-8 place-items-center bg-[var(--surface-navy,#061f43)] text-white">1</span>สินค้า FG</h3>
            <label className="mb-1 block text-sm font-semibold">สแกนบาร์โค้ดสินค้า FG</label>
            <div className="flex flex-col sm:grid sm:grid-cols-[1fr_auto]"><div className="relative"><Barcode className="absolute left-3 top-3 text-[#526477]" size={22} /><input value={barcode} onChange={(event) => setBarcode(event.target.value.toUpperCase())} onKeyDown={scanProduct} placeholder="สแกนแล้วกด Enter" className="h-12 w-full border border-[#8393a7] pl-11 pr-3 text-base outline-none focus:border-[#d39b00] sm:text-xl" /></div><button type="button" onClick={() => { setPickerOpen(true); void loadProducts(""); }} className="flex h-12 items-center justify-center gap-2 border border-t-0 border-[#061f43] px-5 font-bold hover:bg-[#edf2f7] sm:border-l-0 sm:border-t"><Search size={21} />เลือกจากรายการ</button></div>
            {product ? <div className="mt-3 grid min-h-20 grid-cols-[56px_1fr] items-center gap-3 border border-emerald-600 p-3 sm:grid-cols-[70px_1fr_auto] sm:gap-4"><div className="grid h-12 w-12 place-items-center bg-[#fff8df] sm:h-14 sm:w-14"><Package size={34} className="text-[#b98000]" /></div><div><strong className="text-lg sm:text-xl">{product.barcode}</strong><p className="text-sm sm:text-base">{product.productName}</p></div><div className="border-t border-[#aebbc9] pt-2 text-center sm:border-l sm:border-t-0 sm:px-5 sm:pt-0"><span className="text-xs text-[#526477]">บรรจุ</span><p className="font-bold">1 {product.unitName || "กล่อง"} = {product.tinsPerCase} {product.subUnitName || "ปี๊บ"}</p></div></div> : null}
          </section>

          <section className="border border-[#8fa0b4] bg-white p-3">
            <h3 className="mb-3 flex items-center gap-3 text-xl font-bold"><span className="grid h-8 w-8 place-items-center bg-[var(--surface-navy,#061f43)] text-white">2</span>ประเภทของเสีย</h3>
            <div className="grid gap-3 md:grid-cols-2"><WasteTypeCard active={wasteType === "filling_scrap"} icon={Blocks} title="เศษเนื้อขนมระหว่างบรรจุ" description="เศษแตก ตกหล่น หรือปนเปื้อน" onClick={() => selectWasteType("filling_scrap")} /><WasteTypeCard active={wasteType === "rejected_can"} icon={Database} title="เสียทั้งปี๊บ" description="สินค้าบรรจุแล้วแต่ไม่ผ่านคุณภาพ" onClick={() => selectWasteType("rejected_can")} /></div>
            <div className="mt-3 grid gap-3 md:grid-cols-2"><label className="text-sm font-semibold">สาเหตุของเสีย<select value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 h-11 w-full border border-[#8393a7] bg-white px-3 outline-none focus:border-[#d39b00]">{WASTE_REASONS[wasteType].map((item) => <option key={item}>{item}</option>)}</select></label><label className="text-sm font-semibold">หมายเหตุ (ถ้ามี)<input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="ระบุรายละเอียดเพิ่มเติม" className="mt-1 h-11 w-full border border-[#8393a7] px-3 outline-none focus:border-[#d39b00]" /></label></div>
          </section>
        </div>

        <section className="border border-[#8fa0b4] bg-white p-3">
          <h3 className="mb-3 flex items-center gap-3 text-xl font-bold"><span className="grid h-8 w-8 place-items-center bg-[var(--surface-navy,#061f43)] text-white">3</span>{isWeightMode ? "น้ำหนักจากตาชั่ง" : `จำนวน${product?.subUnitName || "ปี๊บ"}เสีย`}</h3>
          {isWeightMode ? <>
            <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-wrap items-center gap-2 sm:gap-3"><span className={`h-4 w-4 rounded-full ${scale.agentConnected && scale.portOpen ? "bg-emerald-700" : "bg-red-600"}`} /><strong className={scale.agentConnected && scale.portOpen ? "text-emerald-700" : "text-red-700"}>{scale.agentConnected && scale.portOpen ? "ONLINE" : "OFFLINE"}</strong><span className="text-sm sm:text-base">{scale.portPath || "COM--"} • {scale.baudRate || 9600} baud</span></div><div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => setSettingsOpen(true)} className="flex h-10 items-center justify-center gap-2 border border-[#061f43] px-3 font-semibold"><Settings size={18} />ตั้งค่า</button><button type="button" onClick={scale.reconnect} className="flex h-10 items-center justify-center gap-2 border border-[#061f43] px-3 font-semibold"><RefreshCw size={18} />เชื่อมต่อใหม่</button></div></div>
            <div className="relative flex min-h-32 items-center justify-end overflow-hidden bg-[var(--surface-navy,#061f43)] px-4 text-white sm:min-h-36 sm:px-8"><span className="font-mono text-[clamp(3.2rem,10vw,7rem)] font-bold leading-none tracking-tight tabular-nums">{formatWeight(netWeightKg)}</span><span className="ml-3 text-2xl font-bold sm:ml-6 sm:text-4xl">kg</span>{scale.isStable && scale.isReadingFresh ? <span className="absolute bottom-2 right-3 bg-emerald-700 px-3 py-1 text-xs font-bold">น้ำหนักนิ่ง</span> : null}</div>
            <div className="mt-3 border border-[#9fc2e7] bg-[#eaf4ff] px-4 py-3 text-center text-sm">ระบบจะใช้ค่าน้ำหนักสุทธิเมื่อสถานะน้ำหนักนิ่ง</div>
          </> : <div className="flex min-h-[285px] flex-col items-center justify-center border border-[#ccd4dd] bg-[#f8fafc] p-8"><Package size={58} strokeWidth={1.6} /><p className="mt-3 text-lg font-bold">กรอกจำนวน{product?.subUnitName || "ปี๊บ"}ที่เสีย</p><p className="mb-6 text-sm text-[#526477]">ประเภทนี้ไม่ต้องอ่านน้ำหนักจากตาชั่ง</p><div className="grid w-full max-w-md grid-cols-[64px_1fr_64px_auto] border border-[#8393a7] bg-white"><button type="button" onClick={() => setRejectedCanQty((value) => Math.max(1, value - 1))} className="grid h-20 place-items-center border-r border-[#8393a7]"><Minus /></button><input value={rejectedCanQty} onChange={(event) => setRejectedCanQty(Math.max(1, Number.parseInt(event.target.value, 10) || 1))} inputMode="numeric" className="min-w-0 text-center text-5xl font-bold outline-none" /><button type="button" onClick={() => setRejectedCanQty((value) => value + 1)} className="grid h-20 place-items-center border-l border-[#8393a7]"><Plus /></button><span className="grid place-items-center border-l border-[#8393a7] px-5 font-bold">{product?.subUnitName || "ปี๊บ"}</span></div></div>}
          <button type="button" onClick={() => void submit()} disabled={!canSave || (isWeightMode && netWeightKg <= 0)} className="mt-2 flex h-14 w-full items-center justify-center gap-2 bg-[#d39b00] px-3 text-base font-bold text-white hover:bg-[#b98000] disabled:cursor-not-allowed disabled:opacity-45 sm:gap-3 sm:text-xl">{submitting ? <Loader2 className="animate-spin" /> : <Save />} {isWeightMode ? "บันทึกน้ำหนักของเสีย" : `บันทึกจำนวน${product?.subUnitName || "ปี๊บ"}เสีย`}</button>
          <p className="mt-2 text-center text-xs text-[#526477]">ระบบจะบันทึกสินค้า, ประเภทของเสีย, {isWeightMode ? "น้ำหนัก" : `จำนวน${product?.subUnitName || "ปี๊บ"}`}, วันที่ และผู้บันทึก</p>
        </section>
      </div>

      <section className="mt-3 border border-[#8fa0b4] bg-white p-3">
        <div className="mb-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"><h3 className="text-lg font-bold sm:text-xl">รายการที่บันทึกวันนี้</h3><strong className="text-sm sm:text-base">รวม {history.length} รายการ • {formatWeight(totalWeight)} กก. • {totalCans} {product?.subUnitName || "ปี๊บ"}</strong></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1080px] border-collapse text-sm"><thead><tr className="bg-[#f5f7fa]">{["เวลา", "สินค้า FG", "ประเภทของเสีย", "สาเหตุ", "ผลบันทึก", "ผู้บันทึก", "การทำงาน"].map((head) => <th key={head} className="border border-[#aebbc9] px-3 py-2 text-center">{head}</th>)}</tr></thead><tbody>{loadingHistory ? <tr><td colSpan={7} className="border border-[#aebbc9] py-8 text-center"><Loader2 className="mx-auto animate-spin" /></td></tr> : history.length ? history.map((row) => <tr key={row.id}><td className="border border-[#aebbc9] px-3 py-2 text-center">{new Date(row.created_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Bangkok" })}</td><td className="border border-[#aebbc9] px-3 py-2 font-semibold">{row.product_code} {row.product_name_snapshot}</td><td className="border border-[#aebbc9] px-3 py-2 text-center">{row.waste_type === "filling_scrap" ? "เศษเนื้อขนม" : `เสียทั้ง${product?.subUnitName || "ปี๊บ"}`}</td><td className="border border-[#aebbc9] px-3 py-2 text-center">{row.reason}</td><td className="border border-[#aebbc9] px-3 py-2 text-right font-bold">{row.waste_type === "filling_scrap" ? `${formatWeight(row.net_weight_kg)} กก.` : `${row.rejected_can_qty} ${product?.subUnitName || "ปี๊บ"}`}</td><td className="border border-[#aebbc9] px-3 py-2 text-center">{row.operator_username || operatorName || "-"}</td><td className="border border-[#aebbc9] px-3 py-2 text-center"><div className="flex items-center justify-center gap-2"><button type="button" onClick={() => void reprintWaste(row)} className="inline-flex h-9 items-center gap-2 border border-[#061f43] bg-white px-3 font-semibold hover:bg-[#edf2f7]"><Printer size={16} />พิมพ์บาร์โค้ด</button><button type="button" onClick={() => { setCancelRow(row); setCancelReason(""); setMessage(null); }} className="inline-flex h-9 items-center gap-2 border border-red-700 bg-white px-3 font-semibold text-red-700 hover:bg-red-50"><Ban size={16} />ยกเลิกรายการ</button></div></td></tr>) : <tr><td colSpan={7} className="border border-[#aebbc9] py-8 text-center text-[#526477]">ยังไม่มีรายการของเสียวันนี้</td></tr>}</tbody></table></div>
      </section>

      {pickerOpen ? <div className="fixed inset-0 z-[120] grid place-items-center bg-black/55 p-4" role="dialog" aria-modal="true"><div className="flex max-h-[84vh] w-full max-w-5xl flex-col bg-white"><div className="flex items-center justify-between bg-[var(--surface-navy,#061f43)] px-5 py-4 text-white"><div><h3 className="text-xl font-bold">เลือกสินค้า FG</h3><p className="text-xs text-white/70">KP13 · หมวด 04, 04-1, 04-2</p></div><button type="button" onClick={() => setPickerOpen(false)} className="grid h-10 w-10 place-items-center border border-white/40"><X /></button></div><div className="flex gap-2 border-b border-[#aebbc9] p-4"><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void loadProducts(search)} placeholder="ค้นหารหัสสินค้า ชื่อสินค้า หรือบาร์โค้ด" className="h-11 flex-1 border border-[#8393a7] px-3 outline-none focus:border-[#d39b00]" /><button type="button" onClick={() => void loadProducts(search)} className="flex h-11 items-center gap-2 bg-[#d39b00] px-5 font-bold"><Search size={18} />ค้นหา</button></div><div className="overflow-auto p-4">{loadingProducts ? <div className="grid h-52 place-items-center"><Loader2 className="animate-spin" /></div> : products.length ? <div className="border border-[#aebbc9]">{products.map((row) => <button type="button" key={`${row.productCode}-${row.barcode}-${row.tinsPerCase}`} onClick={() => chooseProduct(row)} className="grid w-full grid-cols-[1fr_160px] border-b border-[#ccd4dd] p-4 text-left last:border-b-0 hover:bg-[#fff8df]"><div><strong>{row.barcode} · {row.productName}</strong></div><div className="text-right"><span className="text-xs text-[#526477]">บรรจุ</span><p className="font-bold">{row.tinsPerCase} {row.subUnitName || "ปี๊บ"}/{row.unitName || "กล่อง"}</p></div></button>)}</div> : <div className="grid h-52 place-items-center text-[#526477]">ไม่พบสินค้า</div>}</div></div></div> : null}
      {cancelRow ? <div className="fixed inset-0 z-[130] grid place-items-center bg-[var(--surface-navy,#061f43)]/70 p-4" role="dialog" aria-modal="true" aria-labelledby="cancel-waste-title"><div className="w-full max-w-lg border border-[#8fa0b4] bg-white shadow-2xl"><div className="flex items-center justify-between border-b border-[#aebbc9] bg-[#f5f7fa] px-5 py-4"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center bg-red-50 text-red-700"><AlertTriangle size={24} /></span><div><h3 id="cancel-waste-title" className="text-xl font-bold">ยืนยันยกเลิกรายการ</h3><p className="text-xs text-[#526477]">รายการยังคงอยู่ในประวัติ แต่จะไม่ถูกนับรวมยอด</p></div></div><button type="button" onClick={() => !cancelling && setCancelRow(null)} className="grid h-10 w-10 place-items-center border border-[#8fa0b4]" aria-label="ปิด"><X /></button></div><div className="space-y-4 p-5"><div className="border-l-4 border-[#d39b00] bg-[#fff8df] p-4"><strong className="block">{cancelRow.waste_barcode}</strong><span className="text-sm text-[#526477]">{cancelRow.product_code} · {cancelRow.product_name_snapshot}</span><p className="mt-1 font-bold">{cancelRow.waste_type === "filling_scrap" ? `${formatWeight(cancelRow.net_weight_kg)} กก.` : `${cancelRow.rejected_can_qty} ปี๊บ`}</p></div><label className="block text-sm font-semibold">เหตุผลที่ยกเลิก <span className="text-red-700">*</span><textarea value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} rows={3} maxLength={300} placeholder="เช่น บันทึกสินค้าผิด หรือน้ำหนักผิด" className="mt-1 w-full resize-none border border-[#8393a7] p-3 outline-none focus:border-red-700" autoFocus /></label></div><div className="grid grid-cols-2 gap-3 border-t border-[#aebbc9] p-4"><button type="button" onClick={() => setCancelRow(null)} disabled={cancelling} className="h-12 border border-[#061f43] bg-white font-bold">ไม่ยกเลิก</button><button type="button" onClick={() => void cancelWaste()} disabled={cancelling || !cancelReason.trim()} className="flex h-12 items-center justify-center gap-2 bg-red-700 font-bold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-45">{cancelling ? <Loader2 className="animate-spin" size={19} /> : <Ban size={19} />}ยืนยันยกเลิกรายการ</button></div></div></div> : null}
      <PieceRateDeviceSettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} scale={scale} />
    </main>
  );
}
