"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Loader2,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import FgWipSuccessToast from "./FgWipSuccessToast";

function rowId() {
  return globalThis.crypto?.randomUUID?.() || `lot-${Date.now()}-${Math.random()}`;
}

function productKey(product) {
  return `${product?.productCode || ""}|${product?.barcode || ""}|${product?.tinsPerCase || 1}`;
}

function isValidDdMmYy(value) {
  if (!/^\d{6}$/.test(value)) return false;
  const day = Number(value.slice(0, 2));
  const month = Number(value.slice(2, 4));
  const year = 2000 + Number(value.slice(4, 6));
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function newLot() {
  return { id: rowId(), lotNo: "", quantity: "", notes: "ยอดตั้งต้น" };
}

export default function WipOpeningBalanceTab({ openingDate, operatorName }) {
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      try {
        const response = await fetch("/api/production-line/fg-wip/products", { cache: "no-store" });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "โหลดรายการ WIP ไม่สำเร็จ");
        const unique = new Map();
        (payload?.data || []).forEach((row) => {
          const key = productKey(row);
          if (!unique.has(key)) unique.set(key, row);
        });
        if (!cancelled) setProducts(Array.from(unique.values()));
      } catch (error) {
        if (!cancelled) setMessage({ type: "error", text: error.message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const filteredProducts = useMemo(() => {
    const keyword = search.trim().toUpperCase();
    if (!keyword) return products;
    return products.filter((row) => [row.productCode, row.barcode, row.productName]
      .some((value) => String(value || "").toUpperCase().includes(keyword)));
  }, [products, search]);

  const selectedKeys = useMemo(() => new Set(selected.map((group) => group.key)), [selected]);
  const lotCount = selected.reduce((sum, group) => sum + group.lots.length, 0);
  const totalQuantity = selected.reduce((sum, group) => sum + group.lots.reduce(
    (lotSum, lot) => lotSum + (Number.parseInt(String(lot.quantity), 10) || 0), 0
  ), 0);

  const toggleProduct = (product) => {
    const key = productKey(product);
    setSelected((current) => current.some((group) => group.key === key)
      ? current.filter((group) => group.key !== key)
      : [...current, { key, product, lots: [newLot()] }]);
    setMessage(null);
  };

  const addLot = (key) => {
    setSelected((current) => current.map((group) => group.key === key
      ? { ...group, lots: [...group.lots, newLot()] }
      : group));
  };

  const updateLot = (key, lotId, field, value) => {
    const nextValue = field === "lotNo" ? value.replace(/\D/g, "").slice(0, 6)
      : field === "quantity" ? value.replace(/\D/g, "") : value;
    setSelected((current) => current.map((group) => group.key === key
      ? { ...group, lots: group.lots.map((lot) => lot.id === lotId ? { ...lot, [field]: nextValue } : lot) }
      : group));
    setMessage(null);
  };

  const removeLot = (key, lotId) => {
    setSelected((current) => current.flatMap((group) => {
      if (group.key !== key) return [group];
      if (group.lots.length === 1) return [];
      return [{ ...group, lots: group.lots.filter((lot) => lot.id !== lotId) }];
    }));
  };

  const validate = () => {
    if (!selected.length) return "กรุณาเลือก WIP อย่างน้อย 1 รายการ";
    const duplicateRows = new Set();
    for (const group of selected) {
      for (const lot of group.lots) {
        if (!isValidDdMmYy(lot.lotNo)) return `LOT ของ ${group.product.barcode} ต้องเป็นวันที่จริง 6 หลัก รูปแบบ DDMMYY`;
        if ((Number.parseInt(String(lot.quantity), 10) || 0) <= 0) return `กรุณาระบุจำนวนของ ${group.product.barcode} LOT ${lot.lotNo}`;
        const key = `${group.key}|${lot.lotNo}`;
        if (duplicateRows.has(key)) return `${group.product.barcode} มี LOT ${lot.lotNo} ซ้ำกัน`;
        duplicateRows.add(key);
      }
    }
    return null;
  };

  const checkData = () => {
    const error = validate();
    setMessage(error
      ? { type: "error", text: error }
      : { type: "success", text: `ข้อมูลพร้อมบันทึก ${lotCount} รายการ รวม ${totalQuantity.toLocaleString()} ปี๊บ` });
  };

  const submit = async () => {
    const validationError = validate();
    if (validationError) {
      setMessage({ type: "error", text: validationError });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const items = selected.flatMap((group) => group.lots.map((lot) => ({
        product: group.product,
        lotNo: lot.lotNo,
        quantity: Number(lot.quantity),
        notes: lot.notes,
      })));
      const response = await fetch("/api/production-line/fg-wip/opening-balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: globalThis.crypto?.randomUUID?.() || `wip-opening-${Date.now()}`,
          openingDate,
          items,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "บันทึกยอดตั้งต้น WIP ไม่สำเร็จ");
      setMessage({ type: "success", text: `บันทึกยอดตั้งต้นสำเร็จ ${payload?.data?.itemCount || lotCount} รายการ รวม ${payload?.data?.totalQuantity || totalQuantity} ปี๊บ` });
      setSelected([]);
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-[1600px] p-3 text-[#061f43] sm:p-4">
      <section className="mb-3 grid gap-3 border-b-2 border-[#d9a514] bg-white p-4 lg:grid-cols-[1fr_repeat(3,210px)] lg:items-center">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b27c00]">WIP OPENING BALANCE</p>
          <h2 className="mt-1 text-2xl font-black sm:text-3xl">ตั้งต้นสต็อก WIP ค้างไลน์</h2>
          <p className="mt-1 text-sm text-[#526477]">บันทึกยอดคงเหลือเริ่มต้นแยกตาม WIP และ LOT เพื่อใช้เบิกแบบ FIFO</p>
        </div>
        {[
          ["เลือกแล้ว", selected.length, "สินค้า"],
          ["ทั้งหมด", lotCount, "LOT"],
          ["รวม", totalQuantity.toLocaleString(), "ปี๊บ"],
        ].map(([label, value, unit]) => (
          <div key={label} className="grid min-h-20 grid-cols-[44px_1fr] items-center border border-[#aebbc9] px-4">
            <Database size={30} strokeWidth={1.7} />
            <div><span className="block text-xs font-bold text-[#526477]">{label}</span><strong className="text-3xl tabular-nums">{value}</strong><span className="ml-2 font-semibold">{unit}</span></div>
          </div>
        ))}
      </section>

      <FgWipSuccessToast message={message?.type === "success" ? message.text : ""} onClose={() => setMessage(null)} />
      {message?.type === "error" ? (
        <div className={`mb-3 flex items-center gap-2 border px-4 py-2.5 text-sm font-semibold ${message.type === "success" ? "border-emerald-600 bg-emerald-50 text-emerald-800" : "border-red-500 bg-red-50 text-red-700"}`}>
          {message.type === "success" ? <CheckCircle2 size={18} /> : <X size={18} />}{message.text}
        </div>
      ) : null}

      <div className="grid gap-3 xl:grid-cols-[34%_minmax(0,66%)]">
        <section className="border border-[#91a1b4] bg-white">
          <h3 className="flex h-12 items-center gap-2 bg-[#061f43] px-4 text-base font-bold text-white"><span className="grid h-7 w-7 place-items-center bg-[#1b5796]">1</span>เลือก WIP หลายรายการ</h3>
          <div className="p-3">
            <label className="relative block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#526477]" size={19} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหารหัสหรือชื่อ WIP..." className="h-11 w-full border border-[#aebbc9] pl-10 pr-3 outline-none focus:border-[#d9a514]" />
            </label>
          </div>
          <div className="max-h-[610px] overflow-y-auto border-t border-[#d4dbe3]">
            {loading ? <div className="grid h-52 place-items-center"><Loader2 className="animate-spin" /></div> : filteredProducts.length ? filteredProducts.map((row) => {
              const key = productKey(row);
              const checked = selectedKeys.has(key);
              return (
                <button type="button" key={key} onClick={() => toggleProduct(row)} className={`grid w-full grid-cols-[28px_1fr] gap-3 border-b border-[#d9dfe6] p-3 text-left ${checked ? "bg-[#fff8df]" : "hover:bg-[#f6f8fa]"}`}>
                  <span className={`mt-0.5 grid h-5 w-5 place-items-center border ${checked ? "border-[#1555b6] bg-[#1555b6] text-white" : "border-[#66798e] bg-white"}`}>{checked ? <Check size={15} /> : null}</span>
                  <span className="min-w-0">
                    <strong className="block font-mono text-sm">{row.barcode}</strong>
                    <span className="mt-0.5 flex min-w-0 items-start justify-between gap-3 text-sm leading-snug text-[#34475b]">
                      <span className="min-w-0">{row.productName}</span>
                      <span className="shrink-0 border-l border-[#c8d1dc] pl-3 font-semibold text-[#526477]">{row.unitName || "ปี๊บ"}</span>
                    </span>
                  </span>
                </button>
              );
            }) : <div className="grid h-52 place-items-center text-[#526477]">ไม่พบรายการ WIP</div>}
          </div>
        </section>

        <section className="min-w-0 border border-[#91a1b4] bg-white">
          <div className="flex h-12 items-center justify-between bg-[#061f43] px-4 text-white">
            <h3 className="flex items-center gap-2 text-base font-bold"><span className="grid h-7 w-7 place-items-center bg-[#1b5796]">2</span>ระบุ LOT และจำนวนตั้งต้น</h3>
            <span className="text-xs text-white/75">LOT บังคับ 6 หลัก รูปแบบ DDMMYY</span>
          </div>

          <div className="hidden grid-cols-[110px_minmax(140px,1.4fr)_120px_80px_55px_minmax(100px,1fr)_40px] bg-[#eef2f6] text-center text-xs font-bold lg:grid">
            {["รหัส WIP", "ชื่อ WIP", "หมายเลข LOT", "จำนวน", "หน่วย", "หมายเหตุ", ""].map((head) => <div key={head || "action"} className="border-b border-r border-[#b9c4cf] px-2 py-2.5 last:border-r-0">{head}</div>)}
          </div>

          <div className="min-h-[360px]">
            {selected.length ? selected.map((group) => (
              <div key={group.key} className="border-b-2 border-[#c8d1dc]">
                {group.lots.map((lot, lotIndex) => {
                  const lotTouched = lot.lotNo.length > 0;
                  const lotValid = isValidDdMmYy(lot.lotNo);
                  return (
                    <div key={lot.id} className="grid gap-2 border-b border-[#d8dee6] p-3 lg:grid-cols-[110px_minmax(140px,1.4fr)_120px_80px_55px_minmax(100px,1fr)_40px] lg:gap-0 lg:p-0">
                      <div className="font-mono text-sm font-bold lg:border-r lg:border-[#d8dee6] lg:px-2 lg:py-3">{lotIndex === 0 ? group.product.barcode : ""}</div>
                      <div className="text-sm lg:border-r lg:border-[#d8dee6] lg:px-2 lg:py-3">{lotIndex === 0 ? group.product.productName : ""}</div>
                      <label className="block lg:border-r lg:border-[#d8dee6] lg:p-1.5">
                        <span className="mb-1 block text-xs font-bold lg:hidden">LOT · DDMMYY</span>
                        <input value={lot.lotNo} onChange={(event) => updateLot(group.key, lot.id, "lotNo", event.target.value)} inputMode="numeric" maxLength={6} placeholder="DDMMYY" className={`h-9 w-full border px-2 text-center font-mono font-bold outline-none ${lotTouched && !lotValid ? "border-red-500 bg-red-50" : lotValid ? "border-emerald-500 bg-emerald-50" : "border-[#93a3b5]"}`} />
                      </label>
                      <label className="block lg:border-r lg:border-[#d8dee6] lg:p-1.5">
                        <span className="mb-1 block text-xs font-bold lg:hidden">จำนวน</span>
                        <input value={lot.quantity} onChange={(event) => updateLot(group.key, lot.id, "quantity", event.target.value)} inputMode="numeric" placeholder="0" className="h-9 w-full border border-[#93a3b5] px-2 text-right font-bold tabular-nums outline-none focus:border-[#d9a514]" />
                      </label>
                      <div className="grid place-items-center text-sm font-semibold lg:border-r lg:border-[#d8dee6]">ปี๊บ</div>
                      <label className="block lg:border-r lg:border-[#d8dee6] lg:p-1.5">
                        <span className="mb-1 block text-xs font-bold lg:hidden">หมายเหตุ</span>
                        <input value={lot.notes} onChange={(event) => updateLot(group.key, lot.id, "notes", event.target.value)} maxLength={500} className="h-9 w-full border border-[#93a3b5] px-2 text-sm outline-none focus:border-[#d9a514]" />
                      </label>
                      <button type="button" onClick={() => removeLot(group.key, lot.id)} className="grid h-10 place-items-center text-red-700 hover:bg-red-50 lg:h-auto" aria-label="ลบ LOT"><Trash2 size={17} /></button>
                    </div>
                  );
                })}
                <button type="button" onClick={() => addLot(group.key)} className="m-2 inline-flex h-9 items-center gap-2 border border-[#c38b00] px-4 text-sm font-bold text-[#805b00] hover:bg-[#fff8df]"><Plus size={16} />เพิ่ม LOT</button>
              </div>
            )) : <div className="grid min-h-[360px] place-items-center p-6 text-center text-[#647589]"><div><ClipboardCheck className="mx-auto mb-3" size={38} /><strong>เลือก WIP จากรายการด้านซ้าย</strong><p className="mt-1 text-sm">สินค้าเดียวสามารถเพิ่มได้หลาย LOT</p></div></div>}
          </div>

          <div className="m-2 flex items-center gap-3 border border-[#e1b638] bg-[#fff8df] px-4 py-3 text-sm font-semibold"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#d9a514] text-white"><Check size={18} /></span>ข้อมูลพร้อมบันทึก {lotCount} รายการ · ระบบจะสร้างยอด OPENING BALANCE แยกตาม LOT</div>
        </section>
      </div>

      <footer className="mt-3 flex flex-col gap-3 border border-[#aebbc9] bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-[#526477]">ผู้บันทึกและวันเวลาบันทึก ระบบจัดเก็บอัตโนมัติ · {operatorName || "ผู้ใช้งาน"}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => { setSelected([]); setMessage(null); }} className="h-11 border border-[#6e8094] px-6 font-bold hover:bg-[#f1f4f7]">ยกเลิก</button>
          <button type="button" onClick={checkData} className="h-11 border-2 border-[#061f43] px-6 font-bold hover:bg-[#edf2f7]">ตรวจสอบข้อมูล</button>
          <button type="button" onClick={submit} disabled={submitting || !selected.length} className="flex h-11 min-w-52 items-center justify-center gap-2 bg-[#d9a514] px-6 font-bold hover:bg-[#c3920f] disabled:cursor-not-allowed disabled:opacity-50">{submitting ? <Loader2 className="animate-spin" size={19} /> : <CheckCircle2 size={19} />}บันทึกยอดตั้งต้น {lotCount} รายการ</button>
        </div>
      </footer>
    </main>
  );
}
