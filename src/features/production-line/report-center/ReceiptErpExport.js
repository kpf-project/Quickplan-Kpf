"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, Circle, Download, Info, Loader2, Pencil, RefreshCw, Upload, X } from "lucide-react";
import { usePermissions } from "@/lib/usePermissions";
import { taskPermissionKeys } from "@/lib/taskPermissions";
import { downloadScaleReceiptErpBatch, exportScaleReceiptErpExcel, fetchScaleReceiptErpHistory, previewScaleReceiptErpExport } from "@/features/production-line/services/scaleClient";
import styles from "./ReceiptErpExport.module.css";

const weight = value => Number(value || 0).toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
const dateText = value => value ? value.split("-").reverse().join("/") : "–";
function download(payload) {
  const url = URL.createObjectURL(payload.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = payload.fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function ReceiptErpExport({ filters, disabled = false }) {
  const access = usePermissions();
  const [open, setOpen] = useState(null);
  const canExport = access.loaded && (access.isAdmin || taskPermissionKeys("production-scale-receipt-export", access.taskPermissionsEnabled).some(key => access.permissions.includes(key)));
  if (!canExport) return null;
  return <div className={styles.actions}>
    <button type="button" disabled={disabled} onClick={() => setOpen("preview")}><Upload size={16} />Export ERP</button>
    {open && <ErpDrawer key={JSON.stringify(filters)} filters={filters} onClose={() => setOpen(null)} />}
  </div>;
}

function ErpDrawer({ filters, onClose }) {
  const dialogRef = useRef(null);
  const requestRef = useRef(null);
  const [tab, setTab] = useState("preview");
  const [preview, setPreview] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyError, setHistoryError] = useState("");
  const [busy, setBusy] = useState("");
  const [previewLoading, setPreviewLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [previewError, setPreviewError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [numbers, setNumbers] = useState({});
  const [reason, setReason] = useState("");
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => { dialog.close(); document.body.style.overflow = previousOverflow; previousFocus?.focus?.(); };
  }, []);

  useEffect(() => {
    let active = true;
    fetchScaleReceiptErpHistory().then(data => { if (active) setHistory(data); })
      .catch(err => { if (active) setHistoryError(err.message); })
      .finally(() => { if (active) setHistoryLoading(false); });
    previewScaleReceiptErpExport(filters).then(data => {
      if (!active) return;
      setPreview(data);
      setSelectedDate(data.documents[0]?.documentDate || "");
      requestRef.current = crypto.randomUUID();
    }).catch(err => { if (active) setPreviewError(err.message); })
      .finally(() => { if (active) setPreviewLoading(false); });
    return () => { active = false; };
  }, [filters]);

  async function refreshPreview() {
    setPreviewLoading(true); setPreview(null); setPreviewError(""); setError(""); setSuccess("");
    try {
      const data = await previewScaleReceiptErpExport(filters);
      setPreview(data); setSelectedDate(data.documents[0]?.documentDate || ""); setNumbers({}); setReason(""); setEditing(false);
      requestRef.current = crypto.randomUUID();
    } catch (err) { setPreviewError(err.message); }
    finally { setPreviewLoading(false); }
  }

  function showTab(next) {
    setTab(next);
  }

  async function refreshHistory() {
    setHistoryLoading(true); setHistoryError("");
    try { setHistory(await fetchScaleReceiptErpHistory()); }
    catch (err) { setHistoryError(err.message); }
    finally { setHistoryLoading(false); }
  }

  async function exportExcel() {
    if (busy || !preview || preview.duplicateCount) return;
    setBusy("export"); setError("");
    try {
      const payload = await exportScaleReceiptErpExcel(filters, { requestId: requestRef.current, previewToken: preview.previewToken, documentNumbers: numbers, overrideReason: reason });
      download(payload);
      setSuccess(`ส่งออกเรียบร้อย ${payload.documentCount} เอกสาร / ${payload.rowCount} รายการ`);
      setPreview(null); setNumbers({}); setReason(""); setEditing(false); setTab("history");
      void refreshHistory();
    } catch (err) { setError(`${err.message} หากส่งออกสำเร็จแล้ว สามารถดาวน์โหลดไฟล์เดิมจากประวัติได้`); }
    finally { setBusy(""); }
  }

  async function redownload(id) {
    if (busy) return;
    setBusy(id); setError("");
    try { download(await downloadScaleReceiptErpBatch(id)); }
    catch (err) { setError(err.message); }
    finally { setBusy(""); }
  }

  const selectedDocument = preview?.documents.find(item => item.documentDate === selectedDate);
  const rows = preview?.rows.filter(item => item.documentDate === selectedDate) || [];
  const manual = Object.keys(numbers).length > 0;
  const historyTable = (items, compact = false) => <div className={styles.tableScroll}><table className={styles.historyTable}>
    <thead><tr><th>เลขที่เอกสาร</th><th>วันที่ส่งออก</th>{!compact && <th>ผู้ส่งออก</th>}<th>สถานะ</th><th>ดาวน์โหลด</th></tr></thead>
    <tbody>{items.map(batch => <tr key={batch.id}>
      <td>{(batch.production_erp_export_documents || []).map((doc, index) => <span key={doc.document_no}>{index > 0 && " · "}{doc.document_no}{!compact && <small>{dateText(doc.document_date)}</small>}</span>)}{!compact && <small>{batch.row_count} รายการ{batch.metadata?.totalWeightKg != null && ` · ${weight(batch.metadata.totalWeightKg)} กก.`}</small>}</td>
      <td>{new Date(batch.exported_at).toLocaleString(compact ? "en-GB" : "th-TH", { timeZone: "Asia/Bangkok", dateStyle: "short", ...(compact ? {} : { timeStyle: "short" }) })}</td>
      {!compact && <td>{batch.exportedByName || (batch.exported_by ? `ผู้ใช้ ${batch.exported_by}` : "ไม่ระบุผู้ส่งออก")}{batch.metadata?.overrideReason && <small>เหตุผลแก้เลข: {batch.metadata.overrideReason}</small>}</td>}
      <td><span className={styles.status}><Circle size={9} className={batch.status === "exported" ? styles.statusDot : styles.cancelledDot} fill="currentColor" strokeWidth={0} />{batch.status === "exported" ? "ส่งออกแล้ว" : "ยกเลิก"}</span></td>
      <td><button type="button" className={styles.downloadLink} aria-label={`ดาวน์โหลดไฟล์เดิม ${(batch.production_erp_export_documents || []).map(doc => doc.document_no).join(", ")}`} title="ดาวน์โหลดไฟล์เดิม" disabled={Boolean(busy) || batch.status !== "exported"} onClick={() => redownload(batch.id)}><Download size={17} />{compact && "ดาวน์โหลดไฟล์เดิม"}</button></td>
    </tr>)}</tbody>
  </table></div>;

  return createPortal(<dialog ref={dialogRef} className={styles.overlay} aria-labelledby="receipt-erp-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className={styles.drawer} aria-busy={Boolean(busy)}>
      <header className={styles.header}><h2 id="receipt-erp-title">ตรวจสอบ Export ERP</h2><button type="button" aria-label="ปิดหน้าต่าง ERP" disabled={Boolean(busy)} onClick={onClose}><X size={22} /></button></header>
      <nav className={styles.tabs} aria-label="ข้อมูลส่งออก ERP"><button type="button" aria-pressed={tab === "preview"} disabled={Boolean(busy)} onClick={() => showTab("preview")}>ตรวจสอบ</button><button type="button" aria-pressed={tab === "history"} disabled={Boolean(busy)} onClick={() => showTab("history")}>ประวัติส่งออก</button></nav>
      <div className={styles.body}>
        {success && <p role="status" className={styles.valid}><CheckCircle2 size={20} />{success}</p>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {tab === "preview" && previewError && <p role="alert" className={styles.error}>{previewError}</p>}
        {tab === "preview" && previewLoading && <p role="status" className={styles.loading}><Loader2 size={20} className={styles.spin} />กำลังตรวจสอบข้อมูลรับเข้า…</p>}
        {tab === "preview" && <>
          {preview ? <>
            {preview.documents.length > 1 && <label className={styles.dateSelect}>เอกสารตามวันรับเข้า<select disabled={Boolean(busy)} value={selectedDate} onChange={event => { setSelectedDate(event.target.value); setEditing(false); }}>{preview.documents.map(doc => <option key={doc.documentDate} value={doc.documentDate}>{dateText(doc.documentDate)} · {doc.rowCount} รายการ</option>)}</select></label>}
            <div className={styles.fields}><label>วันที่เอกสาร<input readOnly value={dateText(selectedDate)} /></label><div><label htmlFor="erp-number">เลขที่เอกสาร</label><div className={styles.numberField}><input id="erp-number" readOnly={!editing} disabled={Boolean(busy)} value={numbers[selectedDate] ?? selectedDocument?.documentNo ?? ""} maxLength={12} onChange={event => { setNumbers(current => ({ ...current, [selectedDate]: event.target.value.toUpperCase() })); }} />{preview.canOverride && <button type="button" disabled={Boolean(busy)} onClick={() => setEditing(!editing)}><Pencil size={17} />แก้เลข</button>}</div><small>เฉพาะผู้มีสิทธิ์ · ต้องระบุเหตุผล</small></div></div>
            {manual && <label className={styles.reason}>เหตุผลแก้เลขเอกสาร<textarea value={reason} disabled={Boolean(busy)} minLength={5} maxLength={500} onChange={event => setReason(event.target.value)} /><button type="button" disabled={Boolean(busy)} onClick={() => { setNumbers({}); setReason(""); setEditing(false); }}>ใช้เลขอัตโนมัติ</button></label>}
            <div className={styles.sectionHeading}><h3>สรุปรายการที่จะส่งออก</h3><span>{preview.documentCount} เอกสาร · {preview.rowCount} รายการ</span></div>
            <div className={styles.tableScroll}><table><thead><tr><th>รหัสซื้อขาย</th><th>LOT</th><th>จำนวน</th><th>นน./หน่วย (กก.)</th></tr></thead><tbody>{rows.map(row => <tr key={`${row.tradeCode}-${row.lotNo}`}><td title={row.productName}>{row.tradeCode}</td><td>{row.lotNo}</td><td>{weight(row.quantity)}</td><td>0.00</td></tr>)}</tbody><tfoot><tr><th colSpan={2}>รวมทั้งหมด</th><td colSpan={2}>{weight(rows.reduce((sum, row) => sum + row.quantity, 0))} กก.</td></tr></tfoot></table></div>
            <p className={styles.note}>หมายเหตุ: น้ำหนักสุทธิลงช่องจำนวน · น้ำหนักต่อหน่วย <strong>0.00</strong></p>
            <p data-erp-validation className={preview.duplicateCount ? styles.error : styles.valid}>{preview.duplicateCount ? <Info size={28} /> : <CheckCircle2 size={38} className={styles.validIcon} />}<span><strong>{preview.duplicateCount ? `ใบชั่ง ${preview.duplicateCount} ใบในชุดนี้เคยส่งออก ERP แล้ว` : "ไม่พบรายการซ้ำ"}</strong><small>{preview.duplicateCount ? "จึงส่งออกชุดนี้ซ้ำไม่ได้ เพื่อป้องกันข้อมูลซ้ำใน ERP หากต้องการไฟล์เดิม ให้เปิดแท็บ “ประวัติส่งออก” แล้วกด “ดาวน์โหลดไฟล์เดิม”" : "ตรวจสอบแล้วไม่พบใบชั่งที่เคยส่งออก"}</small></span></p>
            {preview.documentCount > 1 && <p className={styles.total}>น้ำหนักสุทธิรวมทุกเอกสาร <strong>{weight(preview.totalWeightKg)} กก.</strong></p>}
          </> : !previewLoading && <button type="button" onClick={refreshPreview}><RefreshCw size={16} />ตรวจสอบข้อมูลอีกครั้ง</button>}
          <section className={styles.recent} data-erp-recent><div className={styles.sectionHeading}><h3>ประวัติการส่งออกล่าสุด</h3><button type="button" disabled={Boolean(busy)} onClick={() => showTab("history")}>ดูทั้งหมด</button></div>
          {historyError && <p role="alert" className={styles.error}>{historyError}</p>}
          {history.length > 0 ? historyTable(history.slice(0, 3), true) : !historyError && <p className={styles.note}>{historyLoading ? "กำลังโหลดประวัติ…" : "ยังไม่มีประวัติส่งออก"}</p>}</section>
        </>}
        {tab === "history" && <>
          <div className={styles.sectionHeading}><h3>ประวัติส่งออก ERP</h3><button type="button" disabled={Boolean(busy) || historyLoading} onClick={refreshHistory}><RefreshCw size={14} />{historyLoading ? "กำลังอัปเดต…" : "อัปเดตประวัติ"}</button></div>
          <p className={styles.note}>ประวัติล่าสุด 30 ครั้งของแผนกนี้</p>
          <p className={styles.note}>ดาวน์โหลดซ้ำใช้เลขเดิมและข้อมูลที่บันทึกไว้ ไม่สร้างเอกสารใหม่</p>
          {historyError && <p role="alert" className={styles.error}>{historyError}</p>}
          {history.length > 0 ? historyTable(history) : !historyError && <p className={styles.note}>{historyLoading ? "กำลังโหลดประวัติ…" : "ยังไม่มีประวัติส่งออก"}</p>}
        </>}
      </div>
      <footer className={styles.footer}><span>{tab === "preview" ? "เลขที่เอกสารจะถูกจองเมื่อกดยืนยัน" : "ดาวน์โหลดเดิมใช้เลขเดิม"}</span>{tab === "preview" && <button type="button" className={styles.confirm} disabled={Boolean(busy) || !preview || preview.duplicateCount > 0 || (manual && reason.trim().length < 5)} onClick={exportExcel}>{busy === "export" ? <Loader2 size={19} className={styles.spin} /> : <Upload size={19} />}ยืนยัน Export ERP</button>}</footer>
    </section>
  </dialog>, window.document.body);
}
