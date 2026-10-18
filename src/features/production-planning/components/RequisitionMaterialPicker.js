"use client";

import { useDeferredValue, useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { Search } from "lucide-react";
import { fetcher } from "@/lib/clientFetch";
import { filterMaterialCatalog, materialTradeKey } from "@/lib/requisitionMaterialPicker";
import styles from "./RequisitionMaterialPicker.module.css";
import PlanningCatalogDialog, { PlanningCatalogTable, PlanningCatalogRowNumber } from "./PlanningCatalogDialog";
import WeightScalePaginationBar from "@/features/production-line/components/WeightScalePaginationBar";

export default function RequisitionMaterialPicker({ open, document: doc, masterPlanNo, periodLabel, existingLineKeys, onClose, onConfirm }) {
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [unit, setUnit] = useState("");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [selected, setSelected] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const deferredSearch = useDeferredValue(search);
  const busy = useRef(false);
  const { data, error, isLoading, mutate } = useSWR(open ? "/api/production-planning/material-verify/material-options?catalog=all" : null, fetcher, { revalidateOnFocus: false });
  const options = useMemo(() => Array.isArray(data?.data) ? data.data : [], [data]);
  const units = useMemo(() => [...new Set(options.map(item => item.unit))].sort((a, b) => a.localeCompare(b, "th")), [options]);
  const filtered = useMemo(() => filterMaterialCatalog(options, deferredSearch, type, unit), [options, deferredSearch, type, unit]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / limit));
  const currentPage = Math.min(page, pageCount);
  const visible = filtered.slice((currentPage - 1) * limit, currentPage * limit);
  const available = visible.filter(item => !existingLineKeys.has(materialTradeKey(item)));
  const chosen = Object.values(selected).filter(item => !existingLineKeys.has(materialTradeKey(item)));
  const allChecked = available.length > 0 && available.every(item => selected[materialTradeKey(item)]);
  if (!open || !doc) return null;
  const toggle = item => {
    if (busy.current || existingLineKeys.has(materialTradeKey(item))) return;
    setSelected(current => {
    const next = { ...current }, key = materialTradeKey(item);
    if (next[key]) delete next[key]; else next[key] = item;
    return next;
    });
  };
  const submit = async () => {
    if (busy.current || !chosen.length) return;
    busy.current = true; setSubmitting(true); setSubmitError("");
    try { if (await onConfirm(chosen) === false) throw new Error("บันทึกไม่สำเร็จ กรุณาลองใหม่ รายการที่เลือกยังอยู่"); }
    catch (failure) { setSubmitError(failure.message || "เพิ่มวัตถุดิบไม่สำเร็จ"); }
    finally { busy.current = false; setSubmitting(false); }
  };
  return <PlanningCatalogDialog title="เพิ่มวัตถุดิบ" onClose={onClose} busy={submitting} description={<><strong>{String(doc.roomLabel || doc.roomId || "ใบเบิก").replace(/^\[[^\]]+\]\s*/, "")}</strong><span>{doc.ownerDepartmentName || ""}</span><span>{masterPlanNo}</span><span>{periodLabel}</span><span>{doc.shiftName || doc.shiftCode || ""}</span></>}>
      <div className={styles.body}>
        <div className={styles.catalog}>
          <div className={styles.filters}><label className={styles.search}><Search size={17} /><input type="search" aria-label="ค้นหาวัตถุดิบหรือ WIP" placeholder="ค้นหารหัส Trade Code ชื่อวัตถุดิบ หรือ WIP" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label><select aria-label="ประเภทวัตถุดิบ" value={type} onChange={event => { setType(event.target.value); setPage(1); }}><option value="">ทั้งหมด</option><option value="RAW">วัตถุดิบ (RAW)</option><option value="WIP">WIP</option></select><select aria-label="หน่วยวัตถุดิบ" value={unit} onChange={event => { setUnit(event.target.value); setPage(1); }}><option value="">หน่วยทั้งหมด</option>{units.map(value => <option key={value}>{value}</option>)}</select></div>
          <PlanningCatalogTable busy={isLoading || search !== deferredSearch}><thead><tr><th><input aria-label="เลือกเฉพาะรายการที่แสดงในหน้านี้" type="checkbox" disabled={!available.length || submitting} checked={allChecked} onChange={() => setSelected(current => { const next = { ...current }; for (const item of available) { const key = materialTradeKey(item); if (allChecked) delete next[key]; else next[key] = item; } return next; })} /></th><th>#</th><th>รหัส</th><th>ชื่อ</th><th>หน่วย</th><th>ประเภท</th><th>สถานะ</th></tr></thead><tbody>
              {!error && visible.map((item, index) => { const key = materialTradeKey(item), exists = existingLineKeys.has(key); return <tr key={key} data-selected={Boolean(selected[key])} data-existing={exists} onClick={() => toggle(item)}><td><input type="checkbox" aria-label={`เลือก ${item.goodsCode} ${item.unit}`} onClick={event => event.stopPropagation()} disabled={exists || submitting} checked={!exists && Boolean(selected[key])} onChange={() => toggle(item)} /></td><PlanningCatalogRowNumber page={currentPage} limit={limit} index={index} /><td className={styles.code}>{item.goodsCode}</td><td>{item.name}</td><td>{item.unit}</td><td>{item.itemType === "WIP" ? "WIP" : "RAW"}</td><td>{exists ? "มีในใบแล้ว" : selected[key] ? "เลือกแล้ว" : "—"}</td></tr>; })}
              {isLoading ? <tr><td colSpan={7}>กำลังโหลดแค็ตตาล็อกวัตถุดิบและ WIP…</td></tr> : error ? <tr><td colSpan={7} role="alert">โหลดรายการไม่สำเร็จ <button type="button" onClick={() => mutate()}>ลองใหม่</button></td></tr> : !filtered.length ? <tr><td colSpan={7}>ไม่พบรายการ ลองเปลี่ยนคำค้นหาหรือตัวกรอง</td></tr> : null}
            </tbody>
          </PlanningCatalogTable>
          <div className={styles.pagination}><WeightScalePaginationBar page={currentPage} totalPages={pageCount} totalCount={filtered.length} limit={limit} limitOptions={[15, 25, 50]} onPageChange={setPage} onLimitChange={value => { setLimit(value); setPage(1); }} isLoading={isLoading || Boolean(error) || submitting || search !== deferredSearch} />{!filtered.length && <span>0 รายการ</span>}</div>
          <p className={styles.hint}>เลือกเฉพาะรายการที่แสดงในหน้านี้ <span>รายการที่เลือกจะคงอยู่ แม้เปลี่ยนหน้า/ค้นหา</span></p>
        </div>
        <aside className={styles.selection}><div className={styles.selectionHeading}><strong aria-live="polite">เลือกแล้ว ({chosen.length})</strong><button type="button" disabled={!chosen.length || submitting} onClick={() => setSelected({})}>ล้างรายการทั้งหมด</button></div><div className={styles.selectedList}>{chosen.length ? chosen.map(item => <div key={materialTradeKey(item)}><div><strong className={styles.code}>{item.goodsCode}</strong><p>{item.name}</p><span>{item.unit} · {item.itemType}</span></div><button type="button" disabled={submitting} onClick={() => toggle(item)} aria-label={`ลบ ${item.goodsCode} ${item.unit}`}>ลบ</button></div>) : <p>เลือกวัตถุดิบหรือ WIP จากตารางด้านซ้าย</p>}</div></aside>
      </div>
      <footer className={styles.footer}><p role={submitError ? "alert" : undefined}>{submitError || "รหัสและหน่วยแสดงตาม Trade Code · วัตถุดิบเดียวกันต่างรหัส/หน่วยเลือกแยกกันได้"}</p><button type="button" disabled={submitting} onClick={onClose}>ยกเลิก</button><button type="button" className={styles.primary} disabled={isLoading || Boolean(error) || !chosen.length || submitting} onClick={submit}>{submitting ? "กำลังเพิ่ม…" : `เพิ่ม ${chosen.length} รายการในใบนี้`}</button></footer>
  </PlanningCatalogDialog>;
}
