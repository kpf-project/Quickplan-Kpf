"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, Search, Tags, X } from "lucide-react";
import { isProductInImportScope } from "@/lib/scheduleImportScope";

export default function ScheduleImportScopeDialog({ section, onClose }) {
  const dialog = useRef(null);
  const [data, setData] = useState(null);
  const [selected, setSelected] = useState([]);
  const [search, setSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const url = `/api/production-planning/schedule/section-defs/${section.id}/import-scope`;

  useEffect(() => {
    dialog.current?.showModal();
    const controller = new AbortController();
    fetch(url, { cache: "no-store", signal: controller.signal }).then(async response => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "โหลดขอบเขตไม่สำเร็จ");
      setData(payload.data);
      setSelected(payload.data.subcategoryIds);
    }).catch(error => { if (error.name !== "AbortError") setError(error.message); });
    return () => controller.abort();
  }, [url]);

  async function save() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subcategoryIds: selected }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "บันทึกไม่สำเร็จ");
      onClose();
    } catch (error) { setError(error.message); } finally { setSaving(false); }
  }

  const products = (data?.products ?? []).filter(product => `${product.skuCode} ${product.name}`.toLowerCase().includes(productSearch.toLowerCase()));
  return (
    <dialog ref={dialog} onCancel={event => { event.preventDefault(); if (!saving) onClose(); }} aria-labelledby="import-scope-title"
      className="fixed inset-0 m-auto w-[900px] max-w-[calc(100%-24px)] max-h-[90vh] overflow-auto rounded-lg border border-slate-200 bg-white p-0 text-slate-800 shadow-xl backdrop:bg-black/40">
      <header className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
        <div className="flex gap-3"><Tags className="mt-1 text-blue-600" size={24} /><div>
          <h2 id="import-scope-title" className="text-lg font-bold">ขอบเขตสินค้าสำหรับ Import</h2>
          <p className="mt-1 text-sm text-slate-500">{section.name}</p>
        </div></div>
        <button type="button" aria-label="ปิดขอบเขตสินค้า" disabled={saving} onClick={onClose} className="rounded p-1 hover:bg-slate-100"><X size={20} /></button>
      </header>
      {error && <p role="alert" className="mx-6 mt-4 rounded bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!data ? <div className="flex min-h-60 items-center justify-center gap-2 text-sm"><Loader2 className="animate-spin" size={18} />{error ? "ไม่สามารถโหลดข้อมูลได้ กรุณาปิดแล้วลองใหม่" : "กำลังโหลดหมวดและสินค้า…"}</div> : (
        <div className="grid md:grid-cols-[40%_60%]">
          <section className="flex flex-col border-b border-slate-200 p-6 md:border-b-0 md:border-r">
            <h3 className="mb-3 font-semibold">เลือกหมวดหมู่ที่อนุญาต</h3>
            <label className="mb-4 flex items-center gap-2 rounded border border-slate-300 px-3 py-2"><Search size={16} className="text-slate-400" /><input aria-label="ค้นหาหมวดหมู่" placeholder="ค้นหาหมวดหมู่" value={search} onChange={event => setSearch(event.target.value)} className="min-w-0 w-full text-sm outline-none" /></label>
            <div className="max-h-64 space-y-1 overflow-auto">
              {data.categories.filter(category => category.name.toLowerCase().includes(search.toLowerCase())).map(category => (
                <label key={category.id} className="flex cursor-pointer items-center gap-3 rounded px-1 py-2 text-sm hover:bg-slate-50"><input type="checkbox" disabled={saving} checked={selected.includes(category.id)} onChange={event => setSelected(current => event.target.checked ? [...current, category.id] : current.filter(id => id !== category.id))} className="h-4 w-4 accent-blue-600" />{category.name}</label>
              ))}
              {!data.categories.length && <p className="text-sm text-slate-500">ยังไม่มีหมวดหมู่ในแผนกนี้ กรุณาจัดหมวดสินค้าก่อน</p>}
            </div>
            <a href="/production-line/settings/department-products" target="_blank" rel="noreferrer" className="mt-auto flex items-center gap-2 pt-8 text-sm text-blue-600 underline"><ExternalLink size={15} />จัดหมวดที่หน้าสินค้าแผนก</a>
          </section>
          <section className="p-6">
            <h3 className="mb-3 font-semibold">ตัวอย่างผลการกรอง</h3>
            <input aria-label="ค้นหาสินค้าตัวอย่าง" placeholder="ค้นหารหัส / ชื่อสินค้า" value={productSearch} onChange={event => setProductSearch(event.target.value)} className="mb-3 w-full rounded border border-slate-300 px-3 py-2 text-sm" />
            <div className="max-h-64 overflow-auto rounded border border-slate-200">
              {products.slice(0, 60).map(product => {
                const allowed = isProductInImportScope(product, selected);
                return <div key={product.skuCode} className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-3 last:border-0">
                  <div className="min-w-0 text-sm"><p className="font-medium">{product.name}</p><p className="mt-1 text-xs text-slate-500">{product.skuCode}</p></div>
                  <span className={`shrink-0 rounded px-2 py-1 text-xs ${allowed ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>{allowed ? product.hasBom ? "ผ่านหมวด" : "ผ่านหมวด · ไม่มี BOM" : "นอกหมวด"}</span>
                </div>;
              })}
              {!products.length && <p className="p-4 text-sm text-slate-500">ไม่พบสินค้า</p>}
            </div>
            <p className="mt-3 text-xs text-slate-500">สินค้าจริงในแผนก · แสดงสูงสุด 60 รายการ ค้นหาเพื่อดูรายการอื่น<br />ผ่านหมวดยังต้องตรวจชนิด แบรนด์ รส ขนาด และ BOM</p>
            <p className="mt-3 flex gap-2 rounded border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800"><AlertCircle size={17} className="shrink-0" />{selected.length ? "ไม่พบสินค้าตรง จะให้ตรวจเลือก ไม่เดาข้ามหมวด" : "ยังไม่เลือกหมวด: Section นี้จะนำเข้าสินค้าไม่ได้"}</p>
          </section>
        </div>
      )}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
        <p className="text-xs text-slate-500">ไม่เปลี่ยน BOM / Routing หรือแผนเดิม</p>
        <div className="flex gap-3"><button type="button" disabled={saving} onClick={onClose} className="rounded border border-slate-300 px-4 py-2 text-sm">ยกเลิก</button><button type="button" disabled={!data || saving} onClick={save} className="flex items-center gap-2 rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{saving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}บันทึกขอบเขต</button></div>
      </footer>
    </dialog>
  );
}
