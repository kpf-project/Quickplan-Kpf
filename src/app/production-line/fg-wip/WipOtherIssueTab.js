"use client";

import { useMemo, useState } from "react";
import {
  Barcode,
  Check,
  CheckCircle2,
  Info,
  Loader2,
  Minus,
  PackageOpen,
  Plus,
  Search,
  X,
} from "lucide-react";
import FgWipSuccessToast from "./FgWipSuccessToast";

const PURPOSES = [
  { value: "customer_sample", label: "ตัวอย่างลูกค้า" },
  { value: "quality_test", label: "ทดลอง / ตรวจคุณภาพ" },
  { value: "internal_use", label: "ใช้ภายใน" },
  { value: "other", label: "อื่น ๆ" },
];

function formatThaiDate(value) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(date);
}

function WipStockCard({ row, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(row)}
      className={`grid min-h-[132px] w-full grid-cols-[44px_minmax(0,1fr)_92px] items-center gap-2 border bg-white p-3 text-left transition-colors sm:grid-cols-[48px_minmax(0,1fr)_130px_104px] sm:gap-4 sm:p-4 ${
        selected
          ? "border-2 border-[#d9a514] bg-[#fffdf5]"
          : "border-[#cbd4df] hover:border-[#d9a514] hover:bg-[#fffdf5]"
      }`}
      aria-pressed={selected}
    >
      <span className={`grid h-8 w-8 place-items-center rounded-full border-2 ${selected ? "border-[#d9a514] bg-[#d9a514] text-white" : "border-[#8796a8] text-transparent"}`}>
        <Check size={19} strokeWidth={3} />
      </span>
      <span className="min-w-0">
        <strong className="block text-lg font-black leading-tight text-[#061f43] sm:text-xl">{row.productCode}</strong>
        <span className="mt-1 block text-sm font-semibold leading-snug text-[#24364a] sm:text-base">{row.productName}</span>
        <span className="mt-2 block font-mono text-sm font-bold text-[#34475c] sm:hidden">LOT {row.lotNo}</span>
        <span className="mt-1 block text-xs text-[#637286] sm:hidden">รับเข้า {formatThaiDate(row.receivedDate)}</span>
      </span>
      <span className="hidden sm:block">
        <span className="block text-xs font-semibold text-[#637286]">LOT</span>
        <strong className="mt-1 block font-mono text-sm text-[#061f43]">{row.lotNo}</strong>
        <span className="mt-2 block text-xs text-[#637286]">รับเข้า {formatThaiDate(row.receivedDate)}</span>
      </span>
      <span className="grid min-h-[82px] place-items-center border border-[#f0d28a] bg-[#fff4cf] px-2 text-center text-[#061f43]">
        <span>
          <span className="block text-xs font-bold">คงเหลือ</span>
          <strong className="block text-2xl font-black tabular-nums sm:text-3xl">{row.remainingQty}</strong>
          <span className="block text-sm font-bold">ปี๊บ</span>
        </span>
      </span>
    </button>
  );
}

function WipPickerModal({ open, rows, loading, selected, onSelect, onClose, onConfirm }) {
  const [query, setQuery] = useState("");
  const [sortMode, setSortMode] = useState("oldest");
  const visibleRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const filtered = normalized
      ? rows.filter((row) => [row.productCode, row.productName, row.barcode, row.lotNo]
        .some((value) => String(value || "").toLowerCase().includes(normalized)))
      : [...rows];
    return filtered.sort((left, right) => {
      if (sortMode === "remaining") return Number(right.remainingQty) - Number(left.remainingQty);
      return String(left.receivedDate).localeCompare(String(right.receivedDate))
        || String(left.lotNo).localeCompare(String(right.lotNo));
    });
  }, [query, rows, sortMode]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[150] bg-black/60 sm:grid sm:place-items-center sm:p-5" role="dialog" aria-modal="true" aria-labelledby="wip-picker-title">
      <div className="flex h-full w-full flex-col bg-white sm:max-h-[88vh] sm:max-w-5xl sm:shadow-2xl">
        <header className="flex min-h-[92px] items-center justify-between bg-[#061f43] px-4 py-4 text-white sm:min-h-0 sm:px-6">
          <div>
            <h2 id="wip-picker-title" className="text-xl font-black sm:text-2xl">เลือก WIP ค้างไลน์</h2>
            <p className="mt-1 text-sm text-white/75">แสดงเฉพาะรายการที่ยังมียอดคงเหลือ</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-12 w-12 place-items-center border border-white/50" aria-label="ปิดหน้าต่าง">
            <X size={28} />
          </button>
        </header>

        <div className="sticky top-0 z-10 border-b border-[#cbd4df] bg-white p-4 sm:px-6">
          <label className="relative block">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[#536579]" size={23} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="ค้นหารหัสสินค้า ชื่อสินค้า บาร์โค้ด หรือ LOT"
              className="h-14 w-full border border-[#9cabbc] pl-12 pr-4 text-base outline-none focus:border-2 focus:border-[#d9a514]"
              autoFocus
            />
          </label>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
            <button type="button" onClick={() => setSortMode("all")} className={`h-11 shrink-0 border px-5 font-bold ${sortMode === "all" ? "border-[#d9a514] bg-[#d9a514]" : "border-[#aebbc9] bg-white"}`}>ทั้งหมด</button>
            <button type="button" onClick={() => setSortMode("oldest")} className={`h-11 shrink-0 border px-5 font-bold ${sortMode === "oldest" ? "border-[#d9a514] bg-[#fff4cf]" : "border-[#aebbc9] bg-white"}`}>เก่าสุดก่อน</button>
            <button type="button" onClick={() => setSortMode("remaining")} className={`h-11 shrink-0 border px-5 font-bold ${sortMode === "remaining" ? "border-[#d9a514] bg-[#fff4cf]" : "border-[#aebbc9] bg-white"}`}>คงเหลือมากสุด</button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:px-6">
          {loading ? (
            <div className="grid min-h-72 place-items-center text-[#526477]"><Loader2 className="animate-spin" size={38} /></div>
          ) : visibleRows.length ? (
            <div className="space-y-3">
              {visibleRows.map((row) => (
                <WipStockCard key={`${row.sourceDocumentId || row.sourceMovementId}-${row.lotNo}-${row.barcode}`} row={row} selected={(selected?.sourceDocumentId || selected?.sourceMovementId) === (row.sourceDocumentId || row.sourceMovementId) && selected?.lotNo === row.lotNo} onSelect={onSelect} />
              ))}
            </div>
          ) : (
            <div className="grid min-h-72 place-items-center text-center text-[#637286]">
              <div><PackageOpen className="mx-auto mb-3" size={44} /><p className="text-lg font-bold">ไม่พบ WIP คงเหลือ</p></div>
            </div>
          )}
          <p className="mt-4 flex items-center gap-2 text-sm text-[#637286]"><Info size={17} />ไม่แสดง LOT ที่ยอดคงเหลือเป็น 0</p>
        </div>

        <footer className="sticky bottom-0 border-t border-[#cbd4df] bg-white p-4 sm:flex sm:items-center sm:justify-between sm:px-6">
          <p className="mb-3 font-bold sm:mb-0">เลือกแล้ว {selected ? 1 : 0} รายการ</p>
          <div className="grid grid-cols-[1fr_1.5fr] gap-3 sm:flex sm:w-auto">
            <button type="button" onClick={onClose} className="h-13 border-2 border-[#061f43] bg-white px-7 text-lg font-bold">ยกเลิก</button>
            <button type="button" onClick={onConfirm} disabled={!selected} className="h-13 bg-[#d9a514] px-8 text-lg font-black text-[#061f43] disabled:opacity-45">ใช้รายการนี้</button>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default function WipOtherIssueTab({ issueDate, operatorName }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSelection, setPickerSelection] = useState(null);
  const [selected, setSelected] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [purpose, setPurpose] = useState("customer_sample");
  const [recipientNote, setRecipientNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  const afterQty = Math.max(0, Number(selected?.remainingQty || 0) - quantity);

  const loadRows = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/production-line/fg-wip/issues", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "โหลด WIP คงเหลือไม่สำเร็จ");
      setRows(payload?.data || []);
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const openPicker = () => {
    setPickerSelection(selected);
    setPickerOpen(true);
    loadRows();
  };

  const chooseFromPicker = () => {
    if (!pickerSelection) return;
    setSelected(pickerSelection);
    setQuantity(Math.min(Math.max(quantity, 1), Number(pickerSelection.remainingQty || 1)));
    setPickerOpen(false);
    setMessage(null);
  };

  const updateQuantity = (nextValue) => {
    const parsed = Number.parseInt(String(nextValue), 10) || 0;
    setQuantity(Math.min(Number(selected?.remainingQty || 0), Math.max(0, parsed)));
  };

  const clearForm = () => {
    setSelected(null);
    setPickerSelection(null);
    setQuantity(1);
    setPurpose("customer_sample");
    setRecipientNote("");
    setMessage(null);
  };

  const submit = async () => {
    if (!selected || quantity <= 0 || quantity > Number(selected.remainingQty || 0)) {
      setMessage({ type: "error", text: "กรุณาเลือก WIP และระบุจำนวนไม่เกินยอดคงเหลือ" });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const purposeLabel = PURPOSES.find((item) => item.value === purpose)?.label || "อื่น ๆ";
      const response = await fetch("/api/production-line/fg-wip/issues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: globalThis.crypto?.randomUUID?.() || `wip-other-${Date.now()}`,
          issueDate,
          sourceDocumentId: selected.sourceDocumentId,
          sourceMovementId: selected.sourceMovementId,
          barcode: selected.barcode,
          lotNo: selected.lotNo,
          quantity,
          issuePurpose: purpose,
          recipientNote,
          notes: `เบิก WIP กรณีอื่น: ${purposeLabel}`,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "เบิก WIP ไม่สำเร็จ");
      setMessage({ type: "success", text: `เบิก WIP สำเร็จ เลขที่ ${payload.movementNo} · คงเหลือ ${payload.data?.remainingQty ?? afterQty} ปี๊บ` });
      setSelected(null);
      setPickerSelection(null);
      setQuantity(1);
      setRecipientNote("");
      await loadRows();
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-[1500px] p-3 sm:p-5 lg:p-6">
      <div className="mb-4 text-center sm:mb-6">
        <h1 className="text-2xl font-black text-[#061f43] sm:text-4xl">เบิก WIP ค้างไลน์</h1>
        <p className="mt-1 text-base font-semibold text-[#526477] sm:text-xl">เบิกไปใช้กรณีอื่น</p>
      </div>

      <FgWipSuccessToast message={message?.type === "success" ? message.text : ""} onClose={() => setMessage(null)} />
      {message?.type === "error" ? (
        <div className={`mb-4 flex items-start gap-3 border px-4 py-3 font-semibold ${message.type === "success" ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-red-500 bg-red-50 text-red-700"}`}>
          {message.type === "success" ? <CheckCircle2 className="mt-0.5 shrink-0" size={21} /> : <X className="mt-0.5 shrink-0" size={21} />}
          <span>{message.text}</span>
        </div>
      ) : null}

      <div className="border border-[#b8c3cf] bg-white xl:grid xl:grid-cols-2 xl:divide-x xl:divide-[#cbd4df]">
        <section className="p-4 sm:p-6">
          <h2 className="mb-4 flex items-center gap-3 text-lg font-black sm:text-xl"><span className="grid h-9 w-9 shrink-0 place-items-center bg-[#061f43] text-white">1</span>เลือก WIP และ LOT</h2>
          <button type="button" onClick={openPicker} className="flex min-h-14 w-full items-center gap-3 border-2 border-[#061f43] bg-white px-4 text-left text-base font-bold hover:bg-[#f4f7fa]">
            <Barcode size={24} /><span className="flex-1">กดเพื่อเลือก WIP ค้างไลน์</span><Search size={22} />
          </button>
          {selected ? (
            <div className="mt-4">
              <WipStockCard row={selected} selected onSelect={openPicker} />
            </div>
          ) : (
            <div className="mt-4 grid min-h-44 place-items-center border border-dashed border-[#9cabbc] bg-[#f8fafc] p-5 text-center text-[#637286]">
              <div><PackageOpen className="mx-auto mb-3" size={42} /><p className="font-bold">ยังไม่ได้เลือก WIP และ LOT</p><p className="mt-1 text-sm">ระบบจะแสดงเฉพาะรายการที่มีของคงเหลือ</p></div>
            </div>
          )}
        </section>

        <section className="border-t border-[#cbd4df] p-4 sm:p-6 xl:border-t-0">
          <h2 className="mb-4 flex items-center gap-3 text-lg font-black sm:text-xl"><span className="grid h-9 w-9 shrink-0 place-items-center bg-[#061f43] text-white">2</span>ระบุจำนวนและวัตถุประสงค์</h2>
          <div className="grid grid-cols-[58px_1fr_58px_78px] border border-[#8796a8]">
            <button type="button" onClick={() => updateQuantity(quantity - 1)} disabled={!selected} className="grid min-h-16 place-items-center border-r border-[#aebbc9] disabled:opacity-40" aria-label="ลดจำนวน"><Minus size={25} /></button>
            <input value={quantity} onChange={(event) => updateQuantity(event.target.value)} disabled={!selected} inputMode="numeric" className="min-w-0 text-center text-4xl font-black tabular-nums outline-none disabled:bg-[#f4f6f8]" aria-label="จำนวนที่เบิก" />
            <button type="button" onClick={() => updateQuantity(quantity + 1)} disabled={!selected} className="grid min-h-16 place-items-center border-l border-[#aebbc9] disabled:opacity-40" aria-label="เพิ่มจำนวน"><Plus size={25} /></button>
            <span className="grid place-items-center border-l border-[#aebbc9] text-lg font-bold">ปี๊บ</span>
          </div>
          <div className="mt-4 space-y-2">
            {PURPOSES.map((item) => (
              <label key={item.value} className={`flex min-h-13 cursor-pointer items-center gap-3 border px-4 text-base font-bold ${purpose === item.value ? "border-2 border-[#d9a514] bg-[#fff8df]" : "border-[#aebbc9] bg-white"}`}>
                <input type="radio" name="wip-purpose" value={item.value} checked={purpose === item.value} onChange={() => setPurpose(item.value)} className="h-5 w-5 accent-[#d9a514]" />
                {item.label}
              </label>
            ))}
          </div>
          <label className="mt-4 block text-sm font-bold">ผู้รับ / หมายเหตุ (ไม่บังคับ)</label>
          <textarea value={recipientNote} onChange={(event) => setRecipientNote(event.target.value)} rows={3} maxLength={500} className="mt-2 w-full resize-none border border-[#8796a8] p-3 text-base outline-none focus:border-2 focus:border-[#d9a514]" placeholder="เช่น ส่งให้ลูกค้า ABC หรือเลขที่เอกสารอ้างอิง" />
        </section>
      </div>

      <section className="mt-4 border border-[#b8c3cf] bg-white p-4 sm:p-6">
        <h2 className="mb-4 flex items-center gap-3 text-lg font-black sm:text-xl"><span className="grid h-9 w-9 shrink-0 place-items-center bg-[#061f43] text-white">3</span>ตรวจสอบและยืนยัน</h2>
        <div className="grid grid-cols-2 divide-x divide-[#cbd4df] border border-[#aebbc9] text-center">
          <div className="p-3 sm:p-4"><span className="block text-sm font-semibold">เบิกครั้งนี้</span><strong className="mt-1 block text-2xl font-black tabular-nums sm:text-3xl">{selected ? quantity : 0} <small className="text-base">ปี๊บ</small></strong></div>
          <div className="p-3 sm:p-4"><span className="block text-sm font-semibold">คงเหลือหลังเบิก</span><strong className="mt-1 block text-2xl font-black tabular-nums sm:text-3xl">{selected ? afterQty : 0} <small className="text-base">ปี๊บ</small></strong></div>
        </div>
        <p className="mt-4 flex items-start justify-center gap-2 text-sm font-semibold text-[#345071] sm:text-base"><Info className="mt-0.5 shrink-0" size={19} />รายการนี้จะตัดยอด WIP คงเหลือ แต่ไม่นับเป็นการนำไปผลิต</p>
        <div className="sticky bottom-0 z-20 -mx-4 mt-4 grid gap-3 border-t border-[#cbd4df] bg-white p-4 sm:static sm:mx-0 sm:grid-cols-[1fr_2fr] sm:border-t-0 sm:p-0 sm:pt-2">
          <button type="button" onClick={clearForm} className="order-2 h-14 border-2 border-[#061f43] bg-white text-lg font-black sm:order-1">ล้างข้อมูล</button>
          <button type="button" onClick={submit} disabled={!selected || quantity <= 0 || submitting} className="order-1 flex h-14 items-center justify-center gap-2 bg-[#d9a514] text-xl font-black text-[#061f43] disabled:opacity-45 sm:order-2">
            {submitting ? <Loader2 className="animate-spin" size={23} /> : null}ยืนยันเบิก WIP
          </button>
        </div>
        <p className="mt-3 text-center text-xs text-[#637286]">วันที่เบิก {formatThaiDate(issueDate)} · ผู้เบิก {operatorName || "ผู้ใช้งาน"}</p>
      </section>

      <WipPickerModal
        open={pickerOpen}
        rows={rows}
        loading={loading}
        selected={pickerSelection}
        onSelect={setPickerSelection}
        onClose={() => setPickerOpen(false)}
        onConfirm={chooseFromPicker}
      />
    </main>
  );
}
