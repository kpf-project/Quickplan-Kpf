"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  Circle,
  ListFilter,
  Loader2,
  Minus,
  Plus,
  Search,
  Wifi,
  X,
} from "lucide-react";
import FgWipSuccessToast from "./FgWipSuccessToast";

function formatDate(value) {
  if (!value) return "-";
  const [year, month, day] = String(value).split("-");
  return `${day}/${month}/${year}`;
}

export default function WipIssueTab({ issueDate, operatorName }) {
  const [barcode, setBarcode] = useState("");
  const [rows, setRows] = useState([]);
  const [selected, setSelected] = useState(null);
  const [quantity, setQuantity] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerRows, setPickerRows] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  const afterQty = Math.max(0, Number(selected?.remainingQty || 0) - quantity);
  const productLots = useMemo(() => {
    if (!selected) return [];
    return rows.filter((row) => row.productCode === selected.productCode && row.barcode === selected.barcode);
  }, [rows, selected]);

  const loadRows = async (query = "", openPicker = false) => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/production-line/fg-wip/issues?search=${encodeURIComponent(query)}`, { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "โหลด WIP คงเหลือไม่สำเร็จ");
      const nextRows = payload?.data || [];
      setRows(nextRows);
      if (openPicker) {
        setPickerRows(nextRows);
        setPickerOpen(true);
      }
      return nextRows;
    } catch (error) {
      setMessage({ type: "error", text: error.message });
      return [];
    } finally {
      setLoading(false);
    }
  };

  const chooseRow = (row, sourceRows = rows) => {
    setRows(sourceRows);
    setSelected(row);
    setBarcode(row.barcode);
    setQuantity(Math.min(1, row.remainingQty));
    setPickerOpen(false);
  };

  const scan = async (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const normalized = barcode.trim().toUpperCase();
    if (!normalized) return;
    const found = await loadRows(normalized);
    const exactRows = found.filter((row) => String(row.barcode).toUpperCase() === normalized);
    if (!exactRows.length) {
      setSelected(null);
      setMessage({ type: "error", text: "ไม่พบ WIP คงเหลือจากบาร์โค้ดนี้" });
      return;
    }
    chooseRow(exactRows[0], exactRows);
  };

  const updateQuantity = (next) => {
    const max = Number(selected?.remainingQty || 0);
    setQuantity(Math.min(max, Math.max(0, Number.parseInt(String(next), 10) || 0)));
  };

  const clear = () => {
    setBarcode("");
    setRows([]);
    setSelected(null);
    setQuantity(0);
    setMessage(null);
  };

  const submit = async () => {
    if (!selected || quantity <= 0 || quantity > selected.remainingQty) {
      setMessage({ type: "error", text: "กรุณาเลือก LOT และระบุจำนวนเบิกไม่เกินยอดคงเหลือ" });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/production-line/fg-wip/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: globalThis.crypto?.randomUUID?.() || `wip-issue-${Date.now()}`,
          issueDate,
          sourceDocumentId: selected.sourceDocumentId,
          sourceMovementId: selected.sourceMovementId,
          barcode: selected.barcode,
          lotNo: selected.lotNo,
          quantity,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "เบิก WIP ไม่สำเร็จ");
      const refreshed = await loadRows(selected.barcode);
      const refreshedRow = refreshed.find((row) => row.productCode === selected.productCode && row.barcode === selected.barcode && row.lotNo === selected.lotNo);
      setSelected(refreshedRow || null);
      setQuantity(0);
      setMessage({ type: "success", text: `เบิก WIP สำเร็จ เลขที่ ${payload.movementNo}` });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-[1500px] p-4 text-[#061f43] lg:p-6">
      <h2 className="mb-3 text-2xl font-bold">เลือก WIP ที่ต้องการเบิก</h2>
      <FgWipSuccessToast message={message?.type === "success" ? message.text : ""} onClose={() => setMessage(null)} />
      {message?.type === "error" ? <div className="mb-3 flex items-center gap-2 border border-red-500 bg-red-50 px-4 py-3 text-sm text-red-700"><X size={18} />{message.text}</div> : null}

      <section className="border border-[#0b2d59] bg-white p-4">
        <div className="grid gap-3 lg:grid-cols-[220px_1fr_320px] lg:items-center">
          <label className="text-lg font-semibold">สแกนบาร์โค้ดที่ปี๊บ</label>
          <input value={barcode} onChange={(event) => setBarcode(event.target.value.toUpperCase())} onKeyDown={scan} placeholder="สแกนแล้วกด Enter" className="h-[52px] border border-[#8393a7] px-4 text-2xl font-bold tracking-wide outline-none focus:border-[#d9a514]" autoFocus />
          <button type="button" onClick={() => loadRows("", true)} className="flex h-[52px] items-center justify-center gap-3 border-2 border-[#061f43] bg-white px-5 text-lg font-bold hover:bg-[#edf2f7]"><ListFilter size={25} />เลือกจากรายการ</button>
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-[#526477]"><span>สแกนบาร์โค้ด หรือเลือกจากรายการ WIP ที่ยังมียอดคงเหลือ</span>{selected ? <span className="flex items-center gap-2 font-bold text-emerald-700"><CheckCircle2 size={19} />พบ WIP ค้างไลน์ {productLots.length} รายการ</span> : null}</div>
      </section>

      {selected ? <>
        <section className="mt-3 border border-[#0b2d59] bg-white p-4">
          <div className="grid gap-3 border-b border-[#9ba9b8] pb-3 md:grid-cols-3">
            <div className="flex gap-5"><span className="text-[#526477]">สินค้า</span><strong>{selected.barcode} {selected.productName}</strong></div>
            <div className="flex gap-5"><span className="text-[#526477]">รหัสซื้อขาย</span><strong className="font-mono">{selected.barcode}</strong></div>
            <div className="flex gap-5"><span className="text-[#526477]">ประเภท</span><strong>WIP ค้างไลน์</strong></div>
          </div>
          <h3 className="my-3 text-lg font-bold">เลือก LOT ที่จะเบิก</h3>
          <div className="overflow-x-auto border border-[#9ba9b8]">
            <table className="w-full min-w-[850px] border-collapse text-center">
              <thead className="bg-[#f1f3f5]"><tr>{["เลือก", "LOT", "วันที่รับเข้า", "รับเข้า (ปี๊บ)", "เบิกไปแล้ว (ปี๊บ)", "คงเหลือ (ปี๊บ)", "สถานะ"].map((label) => <th key={label} className="border-r border-[#aebbc9] px-3 py-2 font-semibold last:border-r-0">{label}</th>)}</tr></thead>
              <tbody>{productLots.map((row, index) => { const active = (row.sourceDocumentId || row.sourceMovementId) === (selected.sourceDocumentId || selected.sourceMovementId) && row.lotNo === selected.lotNo; return <tr key={`${row.sourceDocumentId || row.sourceMovementId}-${row.lotNo}`} onClick={() => chooseRow(row, rows)} className={`cursor-pointer border-t border-[#aebbc9] ${active ? "border-l-4 border-l-[#d9a514] bg-[#fffdf4]" : "hover:bg-[#f8fafc]"}`}><td className="py-2">{active ? <CheckCircle2 className="mx-auto text-[#d29b00]" /> : <Circle className="mx-auto" />}</td><td className="font-mono font-bold">{row.lotNo}</td><td>{formatDate(row.receivedDate)}</td><td>{row.receivedQty}</td><td>{row.issuedQty}</td><td className="font-bold">{row.remainingQty}</td><td className={index === 0 ? "font-bold text-[#b77e00]" : ""}>{index === 0 ? "เก่าสุด · แนะนำ" : "-"}</td></tr>; })}</tbody>
            </table>
          </div>
          <p className="mt-2 text-sm text-[#526477]">เรียง LOT เก่าสุดก่อน (FIFO) แต่ผู้ใช้สามารถเลือกรายการอื่นได้</p>
        </section>

        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <section className="border border-[#0b2d59] bg-white p-5"><h3 className="mb-4 text-xl font-bold">จำนวนที่ต้องการเบิก</h3><div className="flex items-stretch gap-5"><button type="button" onClick={() => updateQuantity(quantity - 1)} className="grid h-16 w-16 place-items-center border-2 border-[#061f43]"><Minus /></button><input value={quantity} onChange={(event) => updateQuantity(event.target.value)} inputMode="numeric" className="h-16 min-w-0 flex-1 border border-[#8393a7] text-center text-4xl font-bold outline-none" /><button type="button" onClick={() => updateQuantity(quantity + 1)} className="grid h-16 w-16 place-items-center border-2 border-[#061f43]"><Plus /></button><span className="grid place-items-center text-xl font-bold">ปี๊บ</span></div><p className="mt-5 text-sm text-[#526477]">ระบุจำนวนปี๊บที่นำไปใช้ผลิต</p></section>
          <section className="border border-[#0b2d59] bg-white p-5"><h3 className="mb-2 text-xl font-bold">สรุปหลังเบิก</h3><div className="border border-[#9ba9b8]"><div className="flex justify-between px-4 py-2"><span>ยอดคงเหลือก่อนเบิก</span><strong>{selected.remainingQty} ปี๊บ</strong></div><div className="flex justify-between bg-[#fff2bd] px-4 py-2 text-[#9b6800]"><span>เบิกครั้งนี้</span><strong>{quantity} ปี๊บ</strong></div><div className="flex justify-between border-t border-[#aebbc9] px-4 py-2"><span>คงเหลือหลังเบิก</span><strong>{afterQty} ปี๊บ</strong></div></div><p className="mt-3 text-sm text-[#526477]">เบิกตามจำนวนปี๊บ ไม่ต้องชั่งน้ำหนัก</p></section>
        </div>

        <section className="mt-3 grid gap-3 border border-[#0b2d59] bg-white px-5 py-3 md:grid-cols-4"><div><span className="text-xs text-[#526477]">วันที่เบิก</span><p className="font-bold">{formatDate(issueDate)}</p></div><div><span className="text-xs text-[#526477]">ผู้เบิก</span><p className="font-bold">{operatorName || "ผู้ใช้งาน"}</p></div><div><span className="text-xs text-[#526477]">อ้างอิง LOT</span><p className="font-mono font-bold">{selected.lotNo}</p></div><div className="self-center text-sm text-[#526477]">ระบบจะบันทึก movement เบิกออกจาก WIP</div></section>
      </> : <div className="mt-3 grid min-h-80 place-items-center border border-dashed border-[#8393a7] bg-white text-center text-[#526477]"><div><Search className="mx-auto mb-3" size={42} /><p className="font-semibold">สแกนบาร์โค้ดหรือเลือก WIP จากรายการเพื่อเริ่มเบิก</p></div></div>}

      <div className="mt-4 flex flex-col justify-end gap-3 sm:flex-row"><button type="button" onClick={clear} className="h-[52px] min-w-64 border-2 border-[#061f43] bg-white px-8 text-lg font-bold">ล้างข้อมูล</button><button type="button" onClick={submit} disabled={!selected || quantity <= 0 || submitting} className="flex h-[52px] min-w-96 items-center justify-center gap-2 bg-[#d9a514] px-8 text-xl font-bold text-[#061f43] disabled:opacity-50">{submitting ? <Loader2 className="animate-spin" /> : null}ยืนยันเบิก WIP</button></div>
      <div className="mt-4 flex gap-8 bg-[#061f43] px-6 py-3 text-sm text-white"><span className="flex items-center gap-2"><CheckCircle2 className="text-emerald-400" size={18} />เครื่องสแกน พร้อมใช้งาน</span><span className="flex items-center gap-2"><Wifi className="text-emerald-400" size={18} />เครือข่าย เชื่อมต่อแล้ว</span></div>

      {pickerOpen ? <div className="fixed inset-0 z-[120] grid place-items-center bg-black/55 p-4" role="dialog" aria-modal="true"><div className="flex max-h-[84vh] w-full max-w-5xl flex-col bg-white"><div className="flex items-center justify-between bg-[#061f43] px-5 py-4 text-white"><div><h3 className="text-xl font-bold">เลือก WIP ค้างไลน์</h3><p className="text-xs text-white/70">แสดงเฉพาะรายการที่ยังมียอดคงเหลือ</p></div><button type="button" onClick={() => setPickerOpen(false)} className="grid h-10 w-10 place-items-center border border-white/40"><X /></button></div><div className="flex gap-2 border-b border-[#aebbc9] p-4"><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && loadRows(search, true)} placeholder="ค้นหาสินค้า บาร์โค้ด หรือ LOT" className="h-11 flex-1 border border-[#8393a7] px-3 outline-none focus:border-[#d9a514]" /><button type="button" onClick={() => loadRows(search, true)} className="flex h-11 items-center gap-2 bg-[#d9a514] px-5 font-bold"><Search size={18} />ค้นหา</button></div><div className="overflow-auto p-4">{loading ? <div className="grid h-52 place-items-center"><Loader2 className="animate-spin" /></div> : pickerRows.length ? <div className="border border-[#aebbc9]">{pickerRows.map((row) => <button type="button" key={`${row.sourceDocumentId || row.sourceMovementId}-${row.lotNo}`} onClick={() => chooseRow(row, pickerRows)} className="grid w-full grid-cols-[1fr_150px_150px] border-b border-[#ccd4dd] p-4 text-left last:border-b-0 hover:bg-[#fff8df]"><div><strong>{row.barcode} · {row.productName}</strong></div><div><span className="text-xs text-[#526477]">LOT</span><p className="font-mono font-bold">{row.lotNo}</p></div><div className="text-right"><span className="text-xs text-[#526477]">คงเหลือ</span><p className="text-lg font-bold">{row.remainingQty} ปี๊บ</p></div></button>)}</div> : <div className="grid h-52 place-items-center text-[#526477]">ไม่พบ WIP คงเหลือ</div>}</div></div></div> : null}
    </main>
  );
}
