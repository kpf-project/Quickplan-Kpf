"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Boxes, ChevronRight, Database, ListPlus, RefreshCw, Save, Search, Trash2, X } from "lucide-react";
import ProductSelectionDialog from "@/components/ProductSelectionDialog";
import PackingQuantityFields from "@/components/PackingQuantityFields";
import SettingsDialog from "@/components/settings/SettingsDialog";
import WipOpeningStockPanel from "@/features/inventory/components/WipOpeningStockPanel";
import PackingHistoryTable from "@/features/production-line/components/PackingHistoryTable";
import { lotFromWorkDate } from "@/lib/nonWagePackingOutput";
import { packingQuantityText, quantityInBase } from "@/lib/packingUnits";
import { usePermissions } from "@/lib/usePermissions";
import { useUnsavedChanges } from "@/lib/tabState";
import styles from "./PackingWorkspace.module.css";
import PackingSourceDialog from "./PackingSourceDialog";
import PackingUnitDialog from "./PackingUnitDialog";

const API = "/api/attendance/non-wage-packing-output";
const number = value => Number(value || 0).toLocaleString("th-TH");
const dateText = value => new Intl.DateTimeFormat("th-TH", { dateStyle: "short" }).format(new Date(`${value}T00:00:00+07:00`));
async function read(params, options = {}) {
  const response = await fetch(`${API}?${new URLSearchParams(params)}`, { cache: "no-store", ...options, signal: options.signal || AbortSignal.timeout(20000) });
  const payload = await response.json();
  if (!response.ok) throw Object.assign(new Error(payload.error || "ทำรายการไม่สำเร็จ"), { status: response.status });
  return payload;
}

export default function NonWagePackingOutputPageClient() {
  const today = useMemo(() => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date()), []);
  const [workDate, setWorkDate] = useState(today), [context, setContext] = useState(null), [departmentId, setDepartmentId] = useState("");
  const [product, setProduct] = useState(null), [produced, setProduced] = useState(""), [unitCode, setUnitCode] = useState("");
  const [closing, setClosing] = useState({}), [sources, setSources] = useState([]), [sourceOptions, setSourceOptions] = useState([]);
  const [sourceOpen, setSourceOpen] = useState(false), [loadingSources, setLoadingSources] = useState(false);
  const [unitSettingsOpen, setUnitSettingsOpen] = useState(false);
  const [opening, setOpening] = useState(false), [openingDirty, setOpeningDirty] = useState(false);
  const [records, setRecords] = useState([]), [legacy, setLegacy] = useState([]), [loadingReport, setLoadingReport] = useState(false);
  const [details, setDetails] = useState(null), [message, setMessage] = useState(null), [pending, setPending] = useState(null), [saving, setSaving] = useState(false);
  const [recoveryBlocked, setRecoveryBlocked] = useState(false);
  const [picker, setPicker] = useState(false), [search, setSearch] = useState(""), [page, setPage] = useState(1), [products, setProducts] = useState([]);
  const [total, setTotal] = useState(0), [pickerError, setPickerError] = useState(""), [loadingProducts, setLoadingProducts] = useState(false), [selecting, setSelecting] = useState(false), [retry, setRetry] = useState(0);
  const cache = useRef(new Map()), lock = useRef(false), selection = useRef(0);
  const access = usePermissions();
  const canWrite = access.isAdmin || access.permissions.includes("production-packing-output-write") || (!access.taskPermissionsEnabled && access.permissions.some(key => ["production-line-attendance-manage", "production-line-attendance-report-manage"].includes(key)));
  const department = context?.departments.find(item => item.id === departmentId);
  const editable = canWrite && (access.isAdmin || department?.role === "editor");
  const disabled = saving || selecting || Boolean(pending) || recoveryBlocked;
  const dirty = Boolean(product && (Number(produced) || Object.values(closing).some(Number) || sources.length));
  useUnsavedChanges(dirty || Boolean(pending) || openingDirty);
  const producedQuantities = unitCode ? { [unitCode]: produced || 0 } : {};
  let baseQuantity = null;
  try { if (product) baseQuantity = quantityInBase(product.units, producedQuantities); } catch { /* Submit shows invalid quantity. */ }
  const pendingKey = context?.userId ? `packing-workspace-pending:${context.userId}` : null;

  useEffect(() => {
    let active = true;
    read({ version: "2", view: "context" }).then(payload => {
      if (!active) return;
      setContext(payload); setDepartmentId(payload.departments.length === 1 ? payload.departments[0].id : "");
      const stored = sessionStorage.getItem(`packing-workspace-pending:${payload.userId}`);
      if (stored) {
        setRecoveryBlocked(true);
        const body = JSON.parse(stored);
        if (body.version !== 2 || !body.requestId || !payload.departments.some(d => d.id === body.departmentId)) throw new Error("พบคำขอค้างที่ตรวจสอบไม่ได้ กรุณาติดต่อผู้ดูแล");
        setPending(body); setDepartmentId(body.departmentId); setWorkDate(body.workDate);
        setRecoveryBlocked(false);
      }
    }).catch(error => { if (active) setMessage({ type: "error", text: error.message }); });
    return () => { active = false; };
  }, []);
  const loadReport = useCallback(async signal => {
    if (!departmentId || !context?.ready) return;
    setLoadingReport(true);
    try {
      const payload = await read({ version: "2", departmentId, dateFrom: workDate }, { signal });
      if (!signal?.aborted) setRecords(payload.data || []);
    } catch (error) { if (!signal?.aborted) { setRecords([]); setMessage({ type: "error", text: error.message }); } }
    finally { if (!signal?.aborted) setLoadingReport(false); }
  }, [departmentId, workDate, context?.ready]);
  useEffect(() => { const controller = new AbortController(); setRecords([]); loadReport(controller.signal); return () => controller.abort(); }, [loadReport]);
  useEffect(() => {
    const controller = new AbortController(); setLegacy([]);
    read({ dateFrom: workDate, dateTo: workDate }, { signal: controller.signal }).then(payload => { if (!controller.signal.aborted) setLegacy(payload.data || []); })
      .catch(error => { if (!controller.signal.aborted) setMessage({ type: "error", text: `โหลดประวัติเดิมไม่สำเร็จ: ${error.message}` }); });
    return () => controller.abort();
  }, [workDate]);
  useEffect(() => {
    if (!picker) return;
    const controller = new AbortController(), key = JSON.stringify([departmentId, search.trim(), page]);
    const hit = cache.current.get(key); setPickerError("");
    if (hit && Date.now() - hit.time < 60000) { setProducts(hit.data); setTotal(hit.totalCount); setLoadingProducts(false); return; }
    setLoadingProducts(true); setProducts([]);
    const timer = setTimeout(async () => {
      try {
        const result = await read({ version: "2", view: "product-page", departmentId, search: search.trim(), page: String(page) }, { signal: controller.signal });
        if (!controller.signal.aborted) {
          cache.current.set(key, { ...result, time: Date.now() });
          if (cache.current.size > 20) cache.current.delete(cache.current.keys().next().value);
          setProducts(result.data); setTotal(result.totalCount);
        }
      } catch (error) { if (!controller.signal.aborted) setPickerError(error.message); }
      finally { if (!controller.signal.aborted) setLoadingProducts(false); }
    }, search ? 200 : 0);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [picker, search, page, retry, departmentId]);

  function clear() { selection.current++; setProduct(null); setProduced(""); setUnitCode(""); setClosing({}); setSources([]); setSourceOptions([]); }
  async function chooseProduct(item) {
    const current = ++selection.current; setSelecting(true); setPickerError("");
    try {
      const payload = await read({ version: "2", view: "profile", departmentId, skuCode: item.code });
      if (current !== selection.current) return;
      setProduct(payload.data); setProduced(""); setUnitCode(payload.data.units.at(-1).code); setClosing({}); setSources([]); setPicker(false);
    } catch (error) { if (current === selection.current) setPickerError(error.message); }
    finally { if (current === selection.current) setSelecting(false); }
  }
  async function openSources() {
    setSourceOpen(true); setLoadingSources(true); setMessage(null);
    try {
      const payload = await read({ version: "2", view: "sources", departmentId, skuCode: product.code, dateFrom: workDate });
      setSourceOptions(payload.data.filter(item => item.unit_version === product.unitVersion));
      if (payload.data.some(item => item.unit_version !== product.unitVersion)) setMessage({ type: "error", text: "มียอดที่อัตราหน่วยต่างจากปัจจุบัน กรุณาตรวจสอบก่อนนำมาใช้" });
    } catch (error) { setSourceOptions([]); setMessage({ type: "error", text: error.message }); }
    finally { setLoadingSources(false); }
  }
  async function submit(event) {
    event.preventDefault(); if (lock.current || recoveryBlocked || !editable || !context?.ready) return;
    setMessage(null); let body = pending;
    if (!body) {
      if (!product) { setMessage({ type: "error", text: "กรุณาเลือกสินค้า" }); return; }
      try {
        if (!quantityInBase(product.units, producedQuantities) && !quantityInBase(product.units, closing) && !sources.length) throw new Error("ระบุจำนวนอย่างน้อยหนึ่งรายการ");
        for (const source of sources) {
          const quantity = quantityInBase([{ code: source.unit_code, factor: 1, precision: source.unit_code === "kg" ? 3 : 0 }], { [source.unit_code]: source.use });
          if (!quantity || quantity > source.remaining) throw new Error(`LOT ${source.lot_no}: จำนวนต้องมากกว่า 0 และไม่เกินคงเหลือ`);
        }
      } catch (error) { setMessage({ type: "error", text: error.message }); return; }
      body = { version: 2, requestId: crypto.randomUUID(), departmentId, workDate, productCode: product.code, unitVersion: product.unitVersion,
        produced: producedQuantities, closing, sources: sources.map(item => ({ id: item.id, quantity: item.use })) };
    }
    lock.current = true; setSaving(true);
    try {
      sessionStorage.setItem(pendingKey, JSON.stringify(body)); setPending(body);
      const result = await read({}, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      sessionStorage.removeItem(pendingKey); setPending(null); clear();
      setMessage({ type: "success", text: `บันทึกผลผลิต LOT ${result.data.lotNo} เรียบร้อยแล้ว` }); await loadReport();
    } catch (error) {
      if ([400, 422].includes(error.status)) { sessionStorage.removeItem(pendingKey); setPending(null); }
      setMessage({ type: "error", text: error.message || "ยังยืนยันผลบันทึกไม่ได้ กรุณาส่งคำขอเดิมอีกครั้ง" });
    } finally { lock.current = false; setSaving(false); }
  }

  return <main className={styles.page}>
    <header className={styles.hero}><div><h1>บันทึกผลผลิตและ WIP</h1><p>Packing &amp; Output <ChevronRight size={14} /> บันทึกผลผลิตและ WIP</p></div><div className={styles.heroDate}><label htmlFor="packing-date">วันที่ผลิต</label><input id="packing-date" type="date" value={workDate} max={today} disabled={disabled} onChange={event => { if (event.target.value && (!dirty || window.confirm("เปลี่ยนวันที่และล้างข้อมูลที่ยังไม่บันทึก?"))) { clear(); setWorkDate(event.target.value); } }} /><strong>LOT {lotFromWorkDate(workDate)}</strong></div></header>
    {message && <p role="status" className={`${styles.notice} ${styles[message.type]}`}>{message.text}</p>}
    {context && !context.ready && <p className={`${styles.notice} ${styles.error}`}>{context.readinessMessage} · ยังไม่เปิดบันทึกข้อมูล</p>}
    {pending && <p className={styles.notice}>รอยืนยันคำขอเดิม: {pending.productCode} · {pending.workDate} กรุณาส่งคำขอเดิมอีกครั้ง ไม่สร้างรายการใหม่</p>}
    <form className={styles.workspace} onSubmit={submit}>
      <section className={`${styles.step} ${styles.productStrip}`}><div className={styles.productSelection}><h2><span>1</span>เลือกสินค้า</h2>
        <label className={styles.department}>แผนก<select aria-label="แผนก" disabled={disabled} value={departmentId} onChange={event => { if (!dirty || window.confirm("เปลี่ยนแผนกและล้างข้อมูลที่ยังไม่บันทึก?")) { clear(); setDepartmentId(event.target.value); } }}><option value="">เลือกแผนก</option>{context?.departments.map(item => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
        {product ? <div className={styles.productCard}><div className={styles.productImage}>{product.imageUrl ? <Image src={product.imageUrl} alt="" width={76} height={70} unoptimized /> : <Boxes size={32} />}</div><div><strong>{product.code}</strong><p>{product.name}</p></div></div> : <p className={styles.hint}>เลือกสินค้าที่มอบหมายให้แผนก เพื่อโหลดหน่วยบรรจุจริง</p>}
        <button type="button" className={styles.browseButton} disabled={!departmentId || disabled} onClick={() => { if (!dirty || window.confirm("เปลี่ยนสินค้าและล้างจำนวนที่ยังไม่บันทึก?")) { setPicker(true); setSearch(""); setPage(1); } }}><Search size={17} />{product ? "เปลี่ยนสินค้า" : "เลือกจากรายการสินค้า"}</button></div>
        <div className={styles.unitProfile}><div className={styles.unitHeading}><strong>หน่วยบรรจุ</strong>{product && access.isAdmin && <button type="button" disabled={disabled || dirty} onClick={() => setUnitSettingsOpen(true)}>ตั้งค่าหน่วย</button>}</div><p>{product ? (product.units.length === 1 ? product.units[0].label : product.units.slice(1).map((unit, index) => `1 ${unit.label} = ${number(unit.factor / product.units[index].factor)} ${product.units[index].label}`).reverse().join(" · ")) : "ยังไม่ได้เลือกสินค้า · ไม่เดาหน่วยหรืออัตราแปลง"}</p><small>{dirty ? "ล้างรายการที่ยังไม่บันทึกก่อนตั้งค่าหน่วย" : "ข้อมูลหน่วยไม่ครบ ให้ผู้ดูแลตั้งค่าหน่วยเพิ่มเติม"}</small></div></section>
      <section className={styles.step}><h2><span>2</span>ผลผลิตวันนี้</h2><div className={styles.productionFields}><label>จำนวนที่ผลิตได้<input aria-label="จำนวนที่ผลิตได้" type="number" min="0" step={unitCode === "kg" ? "0.001" : "1"} disabled={!product || disabled || !editable} value={produced} onChange={event => setProduced(event.target.value)} /></label><label>หน่วย<select aria-label="หน่วยผลิต" disabled={!product || disabled || !editable} value={unitCode} onChange={event => { setProduced(""); setUnitCode(event.target.value); }}>{product?.units.slice().reverse().map(unit => <option key={unit.code} value={unit.code}>{unit.label}</option>)}</select></label></div><div className={styles.results}><strong>ผลผลิตสำเร็จ เทียบหน่วยเล็ก</strong><b>{product && baseQuantity !== null ? `${number(baseQuantity)} ${product.units[0].label}` : "—"}</b><small>ไม่รวม WIP ค้างไลน์ · ไม่ใช่ผลกระทบยอดวัตถุดิบ</small></div></section>
      <section className={styles.step}><h2><span>3</span>ยอดยกมาและค้างไลน์</h2><div className={styles.carryoverHeader}><strong>ยอดค้างที่นำมาใช้</strong><button type="button" disabled={!product || disabled || !editable || !context?.ready} onClick={openSources}><ListPlus size={16} />เลือกยอดค้างมาใช้</button></div>
        <table className={styles.sourceTable}><thead><tr><th>LOT</th><th>คงเหลือ</th><th>นำมาใช้</th><th aria-label="จัดการ" /></tr></thead><tbody>{sources.map(item => <tr key={item.id}><td>{item.lot_no}</td><td>{number(item.remaining)} {item.unit_label}</td><td><input aria-label={`นำมาใช้ LOT ${item.lot_no} ${item.unit_label}`} type="number" min="0" max={item.remaining} step={item.unit_code === "kg" ? "0.001" : "1"} value={item.use} disabled={disabled || !editable} onChange={event => setSources(rows => rows.map(row => row.id === item.id ? { ...row, use: event.target.value } : row))} /> {item.unit_label}</td><td><button type="button" aria-label={`ลบยอดยกมา ${item.lot_no}`} disabled={disabled || !editable} onClick={() => setSources(rows => rows.filter(row => row.id !== item.id))}><Trash2 size={16} /></button></td></tr>)}{!sources.length && <tr><td colSpan={4} className={styles.hint}>ไม่มีการนำยอดค้างมาใช้</td></tr>}</tbody></table>
        <div className={styles.closing}><strong>ค้างไลน์ปลายวัน <small>(ระบุเฉพาะที่ค้าง)</small></strong><div><PackingQuantityFields units={(product?.units || []).filter(unit => product.units.length === 1 || unit.code !== "carton")} value={closing} onChange={setClosing} disabled={disabled || !editable} prefix="ค้างปลายวัน" /></div><small>กรอกแยกกัน ไม่รวมจำนวนที่อยู่ในบรรจุภัณฑ์ใหญ่แล้ว</small></div></section>
      <div className={styles.formActions}>{(access.isAdmin || access.permissions.some(key => ["wip-opening-view", "wip-opening-manage"].includes(key))) && <button type="button" className={styles.openingLink} disabled={disabled} onClick={() => setOpening(true)}><Database size={17} />ตั้งต้น WIP</button>}<button type="button" disabled={disabled} onClick={clear}>ล้างข้อมูล</button><button type="submit" className={styles.saveButton} disabled={saving || !editable || !context?.ready || (!pending && !product)}><Save size={18} />{saving ? "กำลังยืนยันผล..." : pending ? "ส่งคำขอเดิมอีกครั้ง" : "บันทึกผลผลิต"}</button></div>
    </form>
    <div className={styles.reportSection}><PackingHistoryTable title={`รายการบันทึกของวันที่ ${dateText(workDate)}`} records={records} loading={loadingReport} onDetails={setDetails} controls={<button type="button" onClick={() => loadReport()} disabled={loadingReport}><RefreshCw size={15} /> รีเฟรช</button>} /></div>
    <details className={styles.legacy}><summary>ประวัติหน้าบรรจุเดิม ({legacy.length} รายการ) · ยังไม่แปลงหน่วยหรือรวมยอด</summary><p>ยอดเดิมยังคงอยู่ ไม่ถูกหักซ้ำในระบบใหม่</p>{legacy.map(row => <p key={row.id}>{row.product_code} · LOT {row.lot_no} · ผลิต {number(row.cartons)} ลัง / {number(row.packs)} แพ็ค / {number(row.sachets)} ซอง · ค้าง {number(row.closing_packs)} แพ็ค + {number(row.closing_sachets)} ซอง</p>)}<a href="/production-line/fg-wip">เปิดข้อมูล FG/WIP เดิม</a></details>
    {picker && <ProductSelectionDialog products={products} selectedProduct={product} description="เลือกสินค้าตามแผนก ระบบตรวจสิทธิ์และหน่วยอีกครั้งเมื่อเลือก" page={page} totalCount={total} searchTerm={search} loading={loadingProducts} error={pickerError} confirming={selecting} onSearchChange={value => { setSearch(value); setPage(1); }} onPageChange={setPage} onRetry={() => { cache.current.clear(); setRetry(value => value + 1); }} onClose={() => { if (!selecting) setPicker(false); }} onConfirm={chooseProduct} />}
    {sourceOpen && <PackingSourceDialog product={product} loading={loadingSources} options={sourceOptions} selected={sources} onChange={setSources} onClose={() => setSourceOpen(false)} />}
    {unitSettingsOpen && product && <PackingUnitDialog product={product} departmentId={departmentId} onClose={() => setUnitSettingsOpen(false)} onSaved={() => chooseProduct(product)} />}
    {details && <SettingsDialog label="รายละเอียดผลผลิต" onClose={() => setDetails(null)}><div className={styles.sourceDialog}><header><h2>{details.product_code} · LOT {details.lot_no}</h2><button type="button" onClick={() => setDetails(null)} aria-label="ปิด"><X size={20} /></button></header><p>ผลิต: {packingQuantityText(details.payload.units, details.payload.produced)}</p><p>ค้าง: {packingQuantityText(details.payload.units, details.payload.closing)}</p><p>หน่วย ณ วันบันทึก: {details.payload.units.map(unit => `${unit.label} × ${unit.factor}`).join(" · ")}</p>{details.payload.sources.map(item => <p key={item.id}>ต้นทาง {item.id} · จำนวน {item.quantity} (หน่วยต้นทาง)</p>)}</div></SettingsDialog>}
    {opening && <SettingsDialog label="ตั้งต้นสต็อก WIP" busy={openingDirty} onClose={() => setOpening(false)}><div className={styles.sourceDialog}><header><h2>ตั้งต้นสต็อก WIP กลาง</h2><button type="button" onClick={() => { if (!openingDirty || window.confirm("ละทิ้งรายการตั้งต้นที่ยังไม่บันทึก?")) { setOpening(false); setOpeningDirty(false); } }} aria-label="ปิด"><X size={20} /></button></header><p>ยอดตั้งต้น WIP หมวด 03 ยังแยกจากยอดค้าง FG หน้านี้ ไม่จับคู่รหัสสินค้าอัตโนมัติ</p><WipOpeningStockPanel openingDate={workDate} onDirtyChange={setOpeningDirty} /></div></SettingsDialog>}
  </main>;
}
