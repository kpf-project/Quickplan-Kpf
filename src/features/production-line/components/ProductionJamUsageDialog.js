"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { History, Loader2, Search, X, XCircle, Trash2 } from "lucide-react";
import { createProductionJamUsageRequest, fetchProductionJamUsage } from "@/features/production-line/services/productionStockIssueClient";

import styles from "./ProductionJamUsageDialog.module.css";

const PENDING_KEY = "kpf-jam-usage-pending-v1";
const weight = (value) => Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const quantity = (value) => Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 3 });
const dateLabel = (value) => new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(`${value}T12:00:00+07:00`));

export default function ProductionJamUsageDialog({ initialDate, onClose, onSaved }) {
  const dialogRef = useRef(null);
  const savingRef = useRef(false);
  const [usageDate, setUsageDate] = useState(initialDate);
  const [goodsCode, setGoodsCode] = useState("");
  const [lotNo, setLotNo] = useState("");
  const [products, setProducts] = useState([]);
  const [outputs, setOutputs] = useState([]);
  const [history, setHistory] = useState([]);
  const [selected, setSelected] = useState({});
  const [search, setSearch] = useState("");
  const [allocationReady, setAllocationReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState("");
  const [cancelTarget, setCancelTarget] = useState(null);
  const [notice, setNotice] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(PENDING_KEY) || "null");
      if (saved?.requestId && Array.isArray(saved.allocations)) {
        setPending(saved);
        setUsageDate(saved.usageDate);
        setGoodsCode(saved.goodsCode);
        setLotNo(saved.lotNo);
        setSelected(Object.fromEntries(saved.allocations.map((row) => [row.targetProductCode, row.weightKg])));
        setError("มีรายการรอตรวจสอบจากครั้งก่อน กดบันทึกอีกครั้งเพื่อตรวจสอบผล โดยระบบจะไม่บันทึกซ้ำ");
      }
    } catch { /* Storage is optional; the current request still retains its retry ID. */ }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setOutputs([]);
    setHistory([]);
    setCancelTarget(null);
    fetchProductionJamUsage(usageDate, controller.signal).then((payload) => {
      if (controller.signal.aborted) return;
      setAllocationReady(payload.allocationReady === true);
      if (payload.outputWarning) setError(payload.outputWarning);
      if (!payload.allocationReady) setError("ต้องติดตั้ง SQL สำหรับเบิกแยมตามผลผลิตก่อนใช้งาน");
      setProducts(payload.products || []);
      setOutputs(payload.outputProducts || []);
      setHistory(payload.rows || []);
    }).catch((failure) => {
      if (!controller.signal.aborted) setError(failure.message);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [usageDate, reload]);

  useEffect(() => {
    const previous = document.activeElement;
    const root = dialogRef.current;
    root?.querySelector("input")?.focus();
    const onKeyDown = (event) => {
      if (event.key !== "Tab") return;
      const controls = [...root.querySelectorAll("button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex='0']")];
      if (!controls.length) return;
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
    };
    root?.addEventListener("keydown", onKeyDown);
    return () => { root?.removeEventListener("keydown", onKeyDown); previous?.focus(); };
  }, []);

  const chosen = useMemo(() => Object.entries(selected).map(([code, amount]) => ({
    code, amount, name: outputs.find((row) => row.code === code)?.name || code,
  })), [selected, outputs]);
  const total = chosen.reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const locked = saving || Boolean(pending);
  const filtered = outputs.filter((row) => `${row.code} ${row.name}`.toLowerCase().includes(search.toLowerCase()));
  const canSave = allocationReady && (pending || (!loading && goodsCode && lotNo.trim() && chosen.length && chosen.every((row) => Number(row.amount) >= 0.001 && Number(row.amount) <= 999999.999)));
  const selectable = filtered.filter((row) => row.jamCodes.includes(goodsCode));
  const allSelected = selectable.length > 0 && selectable.every((row) => Object.hasOwn(selected, row.code));
  const toggle = (code) => setSelected((current) => {
    const next = { ...current };
    if (Object.hasOwn(next, code)) delete next[code]; else next[code] = "";
    return next;
  });

  async function submit(event) {
    event.preventDefault();
    if (showHistory || savingRef.current || !canSave) return;
    const request = pending || {
      requestId: crypto.randomUUID(), usageDate, goodsCode, lotNo: lotNo.trim(),
      allocations: chosen.map((row) => ({ targetProductCode: row.code, weightKg: row.amount })),
    };
    savingRef.current = true;
    setSaving(true);
    setPending(request);
    setError("");
    try {
      try { sessionStorage.setItem(PENDING_KEY, JSON.stringify(request)); } catch { /* Retry ID remains in memory. */ }
      const result = await createProductionJamUsageRequest(request);
      setHistory((current) => [...result.entries, ...current.filter((row) => !result.entries.some((entry) => entry.id === row.id))]);
      setPending(null);
      setSelected({});
      try { sessionStorage.removeItem(PENDING_KEY); } catch { /* Best effort after confirmed save. */ }
      onSaved();
      onClose();
    } catch (failure) {
      if (failure.status >= 400 && failure.status < 500 && failure.status !== 408) {
        setPending(null);
        try { sessionStorage.removeItem(PENDING_KEY); } catch { /* Best effort. */ }
      }
      setError(failure.message + (failure.status ? "" : " — กดบันทึกอีกครั้งเพื่อตรวจสอบผล ระบบจะไม่บันทึกซ้ำ"));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function cancelEntry() {
    if (!cancelTarget || savingRef.current || pending || loading) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await createProductionJamUsageRequest({ action: "cancel", entryId: cancelTarget.id });
      setHistory((current) => current.map((row) => row.id === result.entry.id ? result.entry : row));
      setCancelTarget(null);
      setNotice("ยกเลิกรายการแล้ว ยอดนี้จะไม่รวมในรายงาน กรุณาค้นหารายงานใหม่เพื่อดูยอดล่าสุด");
    } catch (failure) {
      setError(failure.message);
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  const fieldClass = "mt-2 h-12 w-full rounded border border-[#cbd5e1] bg-white px-4 text-base font-semibold text-[#102C57] outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/25 disabled:bg-slate-100";
  return (
    <div className="fixed inset-0 z-[220] flex items-center justify-center bg-[#07172d]/70 p-0 backdrop-blur-sm sm:p-5">
      <form ref={dialogRef} onSubmit={submit} role="dialog" aria-modal="true" aria-labelledby="jam-usage-title" className="flex max-h-[100dvh] w-full max-w-[1275px] flex-col overflow-hidden bg-white text-[#102C57] shadow-2xl sm:h-[900px] sm:max-h-[92dvh] sm:rounded-lg">
        <header className="flex shrink-0 items-center justify-between bg-[#102C57] px-6 py-4 text-white sm:px-8">
          <div><h2 id="jam-usage-title" className="text-[28px] font-bold !text-white">เบิกแยมตามผลผลิต</h2><p className="mt-1 text-xs font-bold tracking-[0.15em] !text-[#e4c052]">JAM ACTUAL USAGE</p></div>
          <button type="button" disabled={saving} onClick={onClose} aria-label="ปิดหน้าต่างเบิกแยม" className="rounded p-2 !text-white hover:bg-white/10 focus-visible:ring-2 focus-visible:ring-[#e4c052]"><X size={27} /></button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="grid gap-5 border-b border-[#e2e8f0] px-6 py-5 sm:grid-cols-[1fr_1.25fr_1fr] sm:px-8">
            <label className="text-sm font-bold">วันที่เบิกแยม <span className="text-red-500">*</span><input type="date" required disabled={locked} value={usageDate} onChange={(event) => { setUsageDate(event.target.value); setSelected({}); setCancelTarget(null); setNotice(""); setError(""); }} className={fieldClass} /></label>
            <label className="text-sm font-bold">รายการแยม <span className="text-red-500">*</span><select required disabled={locked || loading} value={goodsCode} onChange={(event) => { setGoodsCode(event.target.value); setSelected({}); }} className={fieldClass}><option value="">— เลือกแยม —</option>{products.map((row) => <option key={row.code} value={row.code}>{row.code} · {row.name}</option>)}</select></label>
            <label className="text-sm font-bold">LOT แยม <span className="text-red-500">*</span><input required maxLength={100} disabled={locked} value={lotNo} onChange={(event) => setLotNo(event.target.value)} list="jam-lot-options" placeholder="กรอก LOT" className={fieldClass} /><datalist id="jam-lot-options">{[...new Set(history.filter((row) => row.goodsCode === goodsCode).map((row) => row.lotNo))].map((lot) => <option key={lot} value={lot} />)}</datalist></label>
          </div>
          {error ? <div role="alert" className="mx-6 mt-4 flex items-center justify-between gap-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800"><span>{error}</span><button type="button" onClick={() => setReload((n) => n + 1)} className="shrink-0 underline">โหลดใหม่</button></div> : null}
          <div className="flex border-b border-[#e2e8f0] px-6 sm:px-8" role="tablist" aria-label="การใช้งานแยม">
            <button type="button" role="tab" aria-selected={!showHistory} onClick={() => setShowHistory(false)} className={`border-b-2 px-4 py-3 text-sm font-bold ${!showHistory ? "border-[#d4af37] text-[#102C57]" : "border-transparent text-slate-500"}`}>บันทึกแยม</button>
            <button type="button" role="tab" aria-selected={showHistory} onClick={() => setShowHistory(true)} className={`inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-bold ${showHistory ? "border-[#d4af37] text-[#102C57]" : "border-transparent text-slate-500"}`}><History size={16} />ประวัติ / ยกเลิกรายการ</button>
          </div>
          {!showHistory ? <div className="grid min-h-[490px] lg:grid-cols-[1.2fr_1fr]">
            <section className="min-w-0 border-b border-[#e2e8f0] px-6 py-6 sm:px-8 lg:border-b-0 lg:border-r">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2"><h3 className="text-2xl font-bold">ผลผลิตวันที่ {usageDate ? dateLabel(usageDate) : "—"}</h3><span className="text-xs text-slate-500">เลือกผลผลิตที่ต้องการเบิกแยม</span></div>
              <label className="mb-4 flex h-11 items-center gap-3 rounded border border-[#cbd5e1] px-3 focus-within:ring-2 focus-within:ring-[#d4af37]/30"><Search size={20} className="shrink-0 text-slate-500" /><input aria-label="ค้นหาผลผลิต" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="ค้นหาชื่อหรือรหัสสินค้า" className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label>
              <div className="max-h-[400px] overflow-auto rounded border border-[#dce3ec]">
                <table className={`${styles.table} ${styles.output}`}><colgroup><col style={{width:44}} /><col style={{width:105}} /><col /><col style={{width:85}} /><col style={{width:105}} /></colgroup><thead className="sticky top-0 bg-[#edf1f6]"><tr><th className="w-10 p-3"><input type="checkbox" aria-label="เลือกผลผลิตที่ใช้แยมนี้ทั้งหมด" disabled={locked || !selectable.length} checked={allSelected} onChange={() => setSelected((current) => { const next = { ...current }; for (const row of selectable) { if (allSelected) delete next[row.code]; else if (!Object.hasOwn(next, row.code)) next[row.code] = ""; } return next; })} className="h-5 w-5 accent-[#102C57]" /></th><th className="p-2 text-left">รหัสสินค้า</th><th className="p-2 text-left">ชื่อสินค้า</th><th className="p-2 text-right">จำนวนผลิต</th><th className="p-3 text-right">น้ำหนักรวม<br />(กก.)</th></tr></thead><tbody>
                  {filtered.map((row) => {
                    const checked = Object.hasOwn(selected, row.code);
                    const eligible = row.jamCodes.includes(goodsCode);
                    return <tr key={row.code} className={`border-t border-[#e2e8f0] ${checked ? "bg-[#edf4ff]" : "bg-white"}`}><td className="p-2"><input type="checkbox" aria-label={`เลือก ${row.code}`} checked={checked} disabled={locked || !eligible} onChange={() => toggle(row.code)} className="h-5 w-5 accent-[#102C57]" /></td><td className="px-2 py-2"><label className={eligible ? "cursor-pointer" : "text-slate-500"}><button type="button" disabled={locked || !eligible} onClick={() => toggle(row.code)} className="text-left"><span className="block font-bold">{row.code}</span></button></label></td><td className="px-2 py-2 text-[15px] leading-relaxed">{row.name}</td><td className="p-2 text-right tabular-nums">{quantity(row.quantity)}</td><td className="p-2 text-right tabular-nums">{Number(row.weightKg).toLocaleString("en-US", { maximumFractionDigits: 3 })}</td></tr>;
                  })}
                  {!filtered.length ? <tr><td colSpan={5} className="p-10 text-center text-slate-500">{loading ? <span className="inline-flex items-center gap-2"><Loader2 size={18} className="animate-spin" />กำลังโหลดผลผลิต...</span> : "ไม่พบผลผลิตในวันที่เลือก"}</td></tr> : null}
                </tbody></table>
              </div>
              <p className="sr-only">เลือกได้เฉพาะผลผลิตที่ใช้แยมชนิดที่เลือกตาม BOM</p>
            </section>
            <section className="min-w-0 bg-[#fffaf0] px-6 py-6 sm:px-7">
              <h3 className="text-2xl font-bold">กรอกยอดแยมที่ใช้จริง</h3><p className="mb-6 mt-2 text-sm text-slate-500">ยอดแยมจะแสดงตรงกับผลผลิตที่เลือกในรายงาน</p>
              <div className="overflow-x-auto rounded border border-[#e4e0d6]"><table className={`${styles.table} ${styles.allocation}`}><colgroup><col style={{width:104}} /><col /><col style={{width:193}} /><col style={{width:36}} /></colgroup><thead className="bg-[#f0eee7]"><tr><th className="p-3 text-left">รหัสสินค้า</th><th className="p-3 text-left">ชื่อสินค้า</th><th className="p-3 text-right">ยอดแยมที่ใช้จริง (กก.)</th><th className="w-10"><span className="sr-only">นำออก</span></th></tr></thead><tbody>
                {chosen.map((row) => <tr key={row.code} className="border-t border-[#e4e0d6]"><td className="whitespace-nowrap p-3"><span className="block font-bold">{row.code}</span></td><td className="py-3 leading-relaxed">{row.name}</td><td className="p-3"><div className="flex items-center justify-end gap-2"><input required type="number" inputMode="decimal" min="0.001" max="999999.999" step="0.001" disabled={locked} aria-label={`น้ำหนักแยม ${row.code}`} value={row.amount} onChange={(event) => setSelected((current) => ({ ...current, [row.code]: event.target.value }))} onBlur={() => !locked && setSelected((current) => ({ ...current, [row.code]: current[row.code] === "" ? "" : Number(current[row.code]).toFixed(3) }))} placeholder="0.000" className="h-12 w-28 rounded border border-[#cbd5e1] bg-white px-3 text-right text-base font-bold tabular-nums outline-none focus:border-[#d4af37] focus:ring-2 focus:ring-[#d4af37]/25" /><span>กก.</span></div></td><td className="pr-3"><button type="button" disabled={locked} aria-label={`นำ ${row.code} ออก`} onClick={() => toggle(row.code)} className="rounded p-1 text-slate-500 hover:text-red-600 focus-visible:ring-2 focus-visible:ring-[#102C57]"><XCircle size={22} /></button></td></tr>)}
                {!chosen.length ? <tr><td colSpan={4} className="p-10 text-center text-slate-500">เลือกผลผลิตจากรายการทางซ้าย</td></tr> : null}
              </tbody></table></div>
            </section>
          </div> : null}
          {showHistory ? <section className="p-6 sm:px-8">
            <h3 className="text-xl font-bold">ประวัติการใช้แยม · {usageDate ? dateLabel(usageDate) : "—"}</h3>
            <p className="mb-4 mt-2 text-sm text-slate-500">รายการเก่าที่ไม่ระบุผลผลิตยังคงยอดเดิมและเฉลี่ยตาม BOM ส่วนรายการใหม่แสดงผลผลิตที่เลือก ยกเลิกได้ทีละรายการ</p>
            {notice ? <p role="status" className="mb-4 rounded border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p> : null}
            {cancelTarget ? <div role="alert" className="mb-4 rounded border border-red-200 bg-red-50 p-4 text-red-900">
              <p className="font-bold">ยืนยันยกเลิก {cancelTarget.goodsCode} · LOT {cancelTarget.lotNo} · {weight(cancelTarget.weightKg)} กก.?</p>
              <p className="mt-1 text-sm">{cancelTarget.targetProductCode || "รายการเดิมเฉลี่ยตาม BOM"} — ยอดนี้จะถูกตัดออกจากรายงาน โดยเก็บประวัติไว้</p>
              <div className="mt-3 flex gap-3"><button type="button" disabled={saving || Boolean(pending)} onClick={cancelEntry} className="rounded bg-red-700 px-4 py-2 font-bold !text-white">{saving ? "กำลังยกเลิก..." : "ยืนยันยกเลิกรายการ"}</button><button type="button" disabled={saving} onClick={() => setCancelTarget(null)} className="rounded border border-red-300 bg-white px-4 py-2">กลับ</button></div>
            </div> : null}
            <div className="overflow-auto rounded border border-[#dce3ec]"><table className={`${styles.table} ${styles.history}`}><colgroup><col style={{width:110}} /><col /><col style={{width:100}} /><col style={{width:130}} /><col style={{width:110}} /><col style={{width:100}} /><col style={{width:115}} /></colgroup><thead className="bg-[#edf1f6]"><tr><th className="text-left">วันที่ใช้แยม</th><th className="text-left">แยม</th><th className="text-left">LOT</th><th className="text-left">ผลผลิตปลายทาง</th><th className="text-right">น้ำหนัก (กก.)</th><th>สถานะ</th><th>จัดการ</th></tr></thead><tbody>
              {history.map((row) => <tr key={row.id} className={row.status === "voided" ? "bg-slate-50 text-slate-500" : "bg-white"}><td>{row.usageDate}</td><td><span className="font-bold">{row.goodsCode}</span><span className="mt-1 block">{row.goodsName}</span></td><td>{row.lotNo}</td><td>{row.targetProductCode || "เฉลี่ยตาม BOM (เดิม)"}</td><td className="text-right font-bold tabular-nums">{weight(row.weightKg)}</td><td className="text-center">{row.status === "voided" ? "ยกเลิกแล้ว" : "ใช้งาน"}</td><td className="text-center">{row.status !== "voided" ? <button type="button" disabled={locked || loading} onClick={() => { setCancelTarget(row); setNotice(""); }} className="inline-flex items-center gap-1 rounded border border-red-200 px-2 py-1 text-sm font-bold text-red-700 hover:bg-red-50 disabled:opacity-40"><Trash2 size={15} />ยกเลิก</button> : "—"}</td></tr>)}
              {!history.length ? <tr><td colSpan={7} className="!p-8 text-center text-slate-500">{loading ? "กำลังโหลดรายการ..." : "ไม่มีรายการแยมในวันที่เลือก"}</td></tr> : null}
            </tbody></table></div>
          </section> : null}
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-t border-[#e2e8f0] bg-white px-6 py-4 sm:px-8">
          <div><p aria-live="polite" className="text-lg font-bold tabular-nums">{showHistory ? `${history.filter((row) => row.status !== "voided").length} รายการใช้งาน · รวม ${weight(history.filter((row) => row.status !== "voided").reduce((sum, row) => sum + row.weightKg, 0))} กก.` : `${chosen.length} ผลผลิต · รวม ${weight(total)} กก.`}</p></div>
          <div className="flex gap-4"><button type="button" disabled={saving} onClick={onClose} className="h-12 rounded border border-[#bac6d6] bg-white px-8 font-bold">ปิดหน้าต่าง</button>{!showHistory ? <button type="submit" disabled={saving || !canSave} className="h-12 min-w-40 rounded bg-[#d4af37] px-7 font-bold !text-[#102C57] hover:bg-[#e2bc42] disabled:cursor-not-allowed disabled:opacity-50">{saving ? "กำลังบันทึก..." : pending ? "ตรวจสอบและบันทึกอีกครั้ง" : "บันทึกทั้งหมด"}</button> : null}</div>
        </footer>
      </form>
    </div>
  );
}
