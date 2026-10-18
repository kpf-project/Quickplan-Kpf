"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Database, History, Plus, RefreshCw, Trash2 } from "lucide-react";
import ProductSelectionDialog from "@/components/ProductSelectionDialog";
import WeightScaleHistoryTable from "@/features/production-line/components/WeightScaleHistoryTable";
import WeightScalePaginationBar from "@/features/production-line/components/WeightScalePaginationBar";
import { normalizeWipOpening, pendingWipOpeningKey, readPendingWipOpening, WIP_OPENING_UNITS } from "@/lib/wip-opening-input";
import { useUnsavedChanges } from "@/lib/tabState";
import styles from "./WipOpeningStockPanel.module.css";

const API = "/api/production-line/wip-opening";
async function read(url, options = {}) {
  const response = await fetch(url, { cache: "no-store", ...options, signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000) });
  const payload = await response.json();
  if (!response.ok) { const error = new Error(payload.error || "ทำรายการไม่สำเร็จ"); error.status = response.status; throw error; }
  return payload;
}

function Photo({ product }) {
  const [failed, setFailed] = useState(false);
  return product.imageUrl && !failed ? <Image src={product.imageUrl} alt={product.name} width={48} height={44} unoptimized onError={() => setFailed(true)} /> : <span className={styles.noPhoto}>ไม่มีรูป</span>;
}

function totals(entries) {
  return Object.fromEntries(WIP_OPENING_UNITS.map(unit => [unit.code, entries.filter(entry => entry.unit === unit.code).reduce((sum, entry) => sum + Math.round(Number(entry.quantity) * 1000), 0) / 1000]));
}

export default function WipOpeningStockPanel({ openingDate, onDirtyChange }) {
  const [context, setContext] = useState(null);
  const [departmentId, setDepartmentId] = useState("");
  const [date, setDate] = useState(openingDate);
  const [rows, setRows] = useState([]);
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);
  const [recoveryBlocked, setRecoveryBlocked] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState(null);
  const [picker, setPicker] = useState(false);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [catalog, setCatalog] = useState({ data: [], totalCount: 0, loading: false, error: "" });
  const cache = useRef(new Map());
  const [historyPage, setHistoryPage] = useState(1);
  const [history, setHistory] = useState({ data: [], totalCount: 0, loading: false, error: "" });
  const [refresh, setRefresh] = useState(0);
  const [detail, setDetail] = useState(null);
  const historyRef = useRef(null);
  const department = context?.departments.find(row => row.id === departmentId);
  const canManage = context?.canManage && department?.role === "editor";
  const frozen = busy || !!pending || recoveryBlocked;
  useUnsavedChanges(!!rows.length || !!pending, "มียอดตั้งต้นที่ยังไม่บันทึก หรือคำขอที่ยังไม่ยืนยันผล");
  useEffect(() => {
    onDirtyChange?.(!!rows.length || !!pending || busy);
    return () => onDirtyChange?.(false);
  }, [rows.length, pending, busy, onDirtyChange]);

  useEffect(() => {
    const controller = new AbortController();
    read(`${API}?view=context`, { signal: controller.signal }).then(payload => {
      if (controller.signal.aborted) return;
      setContext(payload);
      let recovered;
      try { recovered = readPendingWipOpening(localStorage, payload.userId); }
      catch { setRecoveryBlocked(true); throw new Error("อ่านคำขอค้างไม่ได้ กรุณาติดต่อผู้ดูแลระบบก่อนบันทึกใหม่"); }
      if (recovered) {
        setPending(recovered); setDepartmentId(recovered.departmentId); setDate(recovered.openingDate);
        setMessage({ error: true, text: "มีคำขอที่ยังไม่ยืนยันผล กรุณาตรวจสอบและส่งคำขอเดิมอีกครั้ง" });
      } else if (payload.departments.length === 1) setDepartmentId(payload.departments[0].id);
    }).catch(error => { if (!controller.signal.aborted) setMessage({ error: true, text: error.message }); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!picker || !departmentId) return;
    const controller = new AbortController();
    const key = JSON.stringify([departmentId, page, search]);
    const cached = cache.current.get(key);
    if (cached && Date.now() - cached.at < 60000) { setCatalog({ ...cached.value, loading: false, error: "" }); return; }
    setCatalog({ data: [], totalCount: 0, loading: true, error: "" });
    const timer = setTimeout(() => {
      read(`${API}?view=products&departmentId=${departmentId}&page=${page}&search=${encodeURIComponent(search)}`, { signal: controller.signal })
        .then(value => {
          if (controller.signal.aborted) return;
          if (cache.current.size >= 20) cache.current.delete(cache.current.keys().next().value);
          cache.current.set(key, { at: Date.now(), value }); setCatalog({ ...value, loading: false, error: "" });
        }).catch(error => { if (!controller.signal.aborted) setCatalog({ data: [], totalCount: 0, loading: false, error: error.message }); });
    }, search ? 200 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [picker, departmentId, page, search, refresh]);

  useEffect(() => {
    setDetail(null);
    if (!departmentId) { setHistory({ data: [], totalCount: 0, loading: false, error: "" }); return; }
    const controller = new AbortController();
    setHistory({ data: [], totalCount: 0, loading: true, error: "" });
    read(`${API}?view=history&departmentId=${departmentId}&page=${historyPage}`, { signal: controller.signal })
      .then(value => { if (!controller.signal.aborted) setHistory({ ...value, loading: false, error: "" }); })
      .catch(error => { if (!controller.signal.aborted) setHistory({ data: [], totalCount: 0, loading: false, error: error.message }); });
    return () => controller.abort();
  }, [departmentId, historyPage, refresh]);

  function update(id, field, value, unit) {
    setRows(previous => previous.map(row => row.id !== id ? row : unit ? { ...row, quantities: { ...row.quantities, [unit]: value } } : { ...row, [field]: value }));
  }

  async function save() {
    if (lock.current || !canManage || recoveryBlocked) return;
    let body;
    try {
      body = pending || { requestId: crypto.randomUUID(), departmentId, openingDate: history.openingDate || date, items: rows.map(row => ({ productCode: row.product.code, lotNo: row.lotNo, quantities: row.quantities, notes: row.notes })) };
      const checked = normalizeWipOpening(body);
      if (!pending && !window.confirm(`ยืนยันยอดตั้งต้น ${department.name} วันที่ ${body.openingDate} จำนวน ${checked.entries.length} รายการหน่วย? ยอดนี้บันทึกซ้ำไม่ได้`)) return;
      // Persist before POST: a timeout must never be retried with a new request ID.
      localStorage.setItem(pendingWipOpeningKey(context.userId, body.requestId), JSON.stringify(body));
      setPending(body);
    } catch (error) { setMessage({ error: true, text: error.message }); return; }
    lock.current = true; setBusy(true); setMessage(null);
    try {
      const result = await read(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      localStorage.removeItem(pendingWipOpeningKey(context.userId, body.requestId)); setPending(null); setRows([]); setHistoryPage(1); setRefresh(value => value + 1);
      let remaining;
      try { remaining = readPendingWipOpening(localStorage, context.userId); }
      catch {
        setRecoveryBlocked(true);
        setMessage({ error: true, text: `บันทึกสำเร็จแล้ว · ${result.documentId} แต่มีคำขอค้างอื่นที่อ่านไม่ได้ กรุณาติดต่อผู้ดูแลระบบ` });
        return;
      }
      if (remaining) { setPending(remaining); setDepartmentId(remaining.departmentId); setDate(remaining.openingDate); }
      setMessage({ error: false, text: `${result.replayed ? "ยืนยันคำขอเดิมสำเร็จ" : "บันทึกยอดตั้งต้นสำเร็จ"} · ${result.documentId}` });
    } catch (error) {
      // Explicit validation/conflict responses rolled back; unknown results retain the request.
      if ([400, 409].includes(error.status)) {
        localStorage.removeItem(pendingWipOpeningKey(context.userId, body.requestId)); setPending(null);
        setRows(body.items.map(row => ({ ...row, id: crypto.randomUUID(), product: { code: row.productCode, name: row.productCode } })));
      }
      setMessage({ error: true, text: error.message });
    } finally { lock.current = false; setBusy(false); }
  }

  const displayRows = pending ? pending.items.map((row, index) => ({ ...row, id: `pending-${index}`, product: rows[index]?.product || { code: row.productCode, name: row.productCode } })) : rows;
  const summary = totals(displayRows.flatMap(row => WIP_OPENING_UNITS.map(unit => ({ unit: unit.code, quantity: Number(row.quantities[unit.code]) || 0 }))));
  const number = value => Number(value).toLocaleString("th-TH", { maximumFractionDigits: 3 });

  return <main className={styles.panel}>
    <header className={styles.heading}><div><Database size={25} /><h2>ตั้งต้นสต็อก WIP</h2></div><span>ยอดตรวจนับครั้งแรก · แยกหน่วย · ไม่แปลงอัตโนมัติ</span></header>
    {message && <div className={message.error ? styles.error : styles.success} role={message.error ? "alert" : "status"}>{message.text}</div>}
    <section className={styles.scope}>
      <label>แผนก<select value={departmentId} disabled={frozen || !context} onChange={event => {
        if (rows.length && !window.confirm("เปลี่ยนแผนกและล้างรายการที่ยังไม่บันทึก?")) return;
        setDepartmentId(event.target.value); setRows([]); setHistoryPage(1); setMessage(null);
      }}><option value="">เลือกแผนก</option>{context?.departments.map(row => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></label>
      <label>วันที่ตั้งต้น<input type="date" value={pending ? date : history.openingDate || date} disabled={frozen || !!history.openingDate} onChange={event => setDate(event.target.value)} /></label>
      <small>{history.openingDate ? `วันที่ตั้งต้นที่บันทึกแล้ว: ${history.openingDate}` : "แต่ละแผนกใช้วันที่ตั้งต้นเดียวกัน"}<br />ซองแยกไม่รวมซองที่อยู่ในแพ็ค</small>
    </section>
    <fieldset disabled={frozen || !canManage} className={styles.entry}>
      <WeightScaleHistoryTable title="รายการสินค้า WIP" count={displayRows.length} empty={!displayRows.length} columnCount={9} emptyMessage="เลือกสินค้าเพื่อกรอกยอดตรวจนับจริง" controls={<button type="button" className={styles.primary} disabled={!departmentId || !canManage || frozen || displayRows.length >= 50} onClick={() => { setPicker(true); setSearch(""); setPage(1); }}><Plus size={18} />เลือกสินค้าจากรายการกลาง</button>}>
        <thead><tr><th>ลำดับ</th><th className={styles.productColumn}>สินค้า</th><th>LOT</th>{WIP_OPENING_UNITS.map(unit => <th key={unit.code}>{unit.label}</th>)}<th>หมายเหตุ</th><th>จัดการ</th></tr></thead>
        <tbody>{displayRows.map((row, index) => <tr key={row.id}>
          <td>{index + 1}</td><td><div className={styles.product}><Photo product={row.product} /><div><strong>{row.product.code}</strong><span>{row.product.name}</span></div></div></td>
          <td><input aria-label={`LOT แถว ${index + 1}`} value={row.lotNo} maxLength={100} onChange={event => update(row.id, "lotNo", event.target.value)} /></td>
          {WIP_OPENING_UNITS.map(unit => <td key={unit.code}><input className={styles.quantity} aria-label={`${unit.label} แถว ${index + 1}`} inputMode={unit.precision ? "decimal" : "numeric"} value={row.quantities[unit.code] || ""} onChange={event => update(row.id, "", event.target.value, unit.code)} placeholder="—" /></td>)}
          <td><input aria-label={`หมายเหตุแถว ${index + 1}`} value={row.notes} maxLength={500} onChange={event => update(row.id, "notes", event.target.value)} /></td>
          <td><button type="button" className={styles.trash} aria-label={`ลบแถว ${index + 1}`} onClick={() => setRows(previous => previous.filter(item => item.id !== row.id))}><Trash2 size={18} /></button></td>
        </tr>)}</tbody>
      </WeightScaleHistoryTable>
    </fieldset>
    <footer className={styles.actions}><div className={styles.totals}><strong>รวมแยกหน่วย</strong>{WIP_OPENING_UNITS.map(unit => <div key={unit.code}><small>{unit.label}</small><b>{number(summary[unit.code])}</b></div>)}</div><div className={styles.buttons}>
      <button type="button" onClick={() => historyRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}><History size={18} />ประวัติ</button>
      <button type="button" disabled={frozen || !rows.length} onClick={() => { if (window.confirm("ล้างรายการที่ยังไม่บันทึก?")) setRows([]); }}><Trash2 size={17} />ล้างรายการ</button>
      <button type="button" className={styles.primary} disabled={busy || recoveryBlocked || !canManage || !displayRows.length || (!pending && (history.loading || !!history.error))} onClick={save}><CheckCircle2 size={19} />{busy ? "กำลังยืนยัน…" : pending ? "ส่งคำขอเดิมอีกครั้ง" : "ตรวจสอบและบันทึก"}</button>
    </div></footer>
    <div className={styles.notice}>ยอดนี้เป็นยอดตั้งต้นกลางใหม่ ไม่รวมยอดปี๊บเดิม และยังไม่ถูกนำไปเบิกหรือรายงานในระบบเดิม</div>
    <div ref={historyRef}>
      {history.error && <div className={styles.error} role="alert">{history.error}</div>}
      <WeightScaleHistoryTable title="ประวัติยอดตั้งต้นกลาง" count={history.totalCount} empty={!history.data.length} isLoading={history.loading} columnCount={8} emptyMessage={departmentId ? "ยังไม่มีเอกสารยอดตั้งต้นกลาง" : "เลือกแผนกเพื่อดูประวัติ"} controls={<button type="button" disabled={!departmentId || history.loading} onClick={() => setRefresh(value => value + 1)}><RefreshCw size={16} />รีเฟรช</button>} footer={<WeightScalePaginationBar page={historyPage} totalPages={Math.max(1, Math.ceil(history.totalCount / 25))} totalCount={history.totalCount} limit={25} limitOptions={[25]} onPageChange={setHistoryPage} isLoading={history.loading} />}>
        <thead><tr><th>ลำดับ</th><th>วันที่ตั้งต้น</th><th>เวลาบันทึกจริง</th>{WIP_OPENING_UNITS.map(unit => <th key={unit.code}>{unit.label}</th>)}<th>รายละเอียด</th></tr></thead>
        <tbody>{history.data.map((document, index) => { const sum = totals(document.production_wip_opening_entries); return <tr key={document.id}><td>{(historyPage - 1) * 25 + index + 1}</td><td>{document.opening_date}</td><td>{new Date(document.created_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</td>{WIP_OPENING_UNITS.map(unit => <td key={unit.code}>{number(sum[unit.code])}</td>)}<td><button type="button" onClick={() => setDetail(detail?.id === document.id ? null : document)}>ดูรายการ</button></td></tr>; })}</tbody>
      </WeightScaleHistoryTable>
      {detail && <WeightScaleHistoryTable title={`รายละเอียด ${detail.id}`} columnCount={6}><thead><tr><th>สินค้า</th><th>ชื่อสินค้า</th><th>LOT</th><th>หน่วย</th><th>จำนวน</th><th>หมายเหตุ</th></tr></thead><tbody>{detail.production_wip_opening_entries.map((entry, index) => <tr key={index}><td>{entry.product_code}</td><td>{entry.product_name}</td><td>{entry.lot_no}</td><td>{WIP_OPENING_UNITS.find(unit => unit.code === entry.unit)?.label}</td><td>{number(entry.quantity)}</td><td>{entry.notes || "—"}</td></tr>)}</tbody></WeightScaleHistoryTable>}
    </div>
    {picker && <ProductSelectionDialog description="WIP ตามสิทธิ์แผนกที่เลือก" products={catalog.data} totalCount={catalog.totalCount} loading={catalog.loading} error={catalog.error} page={page} searchTerm={search} onSearchChange={value => { setSearch(value); setPage(1); }} onPageChange={setPage} onRetry={() => { cache.current.clear(); setRefresh(value => value + 1); }} onClose={() => setPicker(false)} onConfirm={product => {
      if (!canManage || frozen) return;
      setRows(previous => [...previous, { id: crypto.randomUUID(), product, lotNo: "", quantities: {}, notes: "" }]); setPicker(false);
    }} />}
  </main>;
}
