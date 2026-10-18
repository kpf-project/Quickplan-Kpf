"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Check, Plus, Minus, RefreshCw, Search, Save, Maximize2 } from "lucide-react";
import { planningDates, weeklyMaterialProjection, draftLineKg } from "../services/wipWeeklyGrid";
import styles from "./WeeklyPlanningWorkbench.module.css";
import RequisitionPlanPicker from "./RequisitionPlanPicker";
import RequisitionPaper, { RequisitionPaperTable, RequisitionWorkLabel } from "./RequisitionPaper";

const dateLabel = date => new Date(`${date}T12:00:00Z`).toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Bangkok" });
const weekday = date => new Date(`${date}T12:00:00Z`).toLocaleDateString("th-TH", { weekday: "long", timeZone: "Asia/Bangkok" });
const weekdayShort = date => ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."][new Date(`${date}T12:00:00Z`).getUTCDay()];
const qtyLabel = value => Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 3 });

export default function WeeklyPlanningWorkbench({
  activeMasterPlanNo, selectablePlanOptions = [], setMasterPlanNo, departmentTabs = [],
  activeDepartmentId, activeDepartment, setSelectedDepartmentId, sectionTabs = [],
  selectedSectionId, setSelectedSectionId, activeSectionModel, activeSectionShifts = [],
  previewMeta, matrixColumns = [], materialRows = [], activeSectionDraftLines: lines = [],
  wipSkuNameBySku = new Map(), updateLine, addLine, removeLine,
  saveDraft, confirmSubplan, regenerateSectionFromBom, saving, confirming,
  previewing, draftLoading, isConfirmedSubplanLocked, confirmedSubplanMeta,
  errorText, message, wipPickerLineId, setWipPickerLineId, handleSelectWipFromPicker,
  WipPicker, previewPending, previewError, retryPreview,
}) {
  const [chosen, setChosen] = useState("");
  const [dateOpen, setDateOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [previewActionError, setPreviewActionError] = useState("");
  const dates = useMemo(() => planningDates(lines, previewMeta?.planRange), [lines, previewMeta?.planRange]);
  const selectedDate = dates.includes(chosen) ? chosen : dates[0] || "";
  const dayIndex = dates.indexOf(selectedDate);
  const dailyLines = lines.filter(line => String(line.workDate || "").slice(0, 10) === selectedDate);
  const materials = useMemo(() => weeklyMaterialProjection(matrixColumns, materialRows, dates), [matrixColumns, materialRows, dates]);
  const shownMaterials = materials.filter(row => row.total > 0);
  const locked = isConfirmedSubplanLocked || saving || confirming || draftLoading;
  const busy = previewPending || previewing;
  const sectionName = activeSectionModel?.section?.name || activeSectionModel?.name || "เลือกส่วนงาน / ห้อง";
  const scopeKey = `${activeMasterPlanNo}|${activeDepartmentId}|${selectedSectionId}`;
  const incomplete = lines.some(line => line.skuCode && (!(Number(line.plannedQty) > 0) || (!line.shiftId && !line.shiftCode)));
  const calculate = () => retryPreview ? retryPreview() : regenerateSectionFromBom({ preserveDraftLines: true });
  function chooseDate(date) { setChosen(date); setDateOpen(false); }
  function changeShift(line, value) {
    const shift = activeSectionShifts.find(item => String(item.shiftId || item.shiftCode) === value);
    updateLine(line.id, "shiftId", shift?.shiftId || null);
    updateLine(line.id, "shiftCode", shift?.shiftCode || null);
    updateLine(line.id, "shiftName", shift?.shiftName || null);
  }
  async function expandPreview(event) {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await event.currentTarget.closest("section").requestFullscreen();
    } catch { setPreviewActionError("เปิดเต็มจอไม่สำเร็จ กรุณาลองอีกครั้ง"); }
  }
  return <><section id="qa-subplan-workbench" className={styles.workspace}>
    {isConfirmedSubplanLocked && <p role="status" className={styles.notice}>แผนย่อยยืนยันแล้ว {confirmedSubplanMeta?.subPlanNo} · อ่านอย่างเดียว</p>}
    {errorText && <p role="alert" className={styles.error}>{errorText}</p>}
    {message && <p role="status" className={styles.notice}>{message}</p>}
    <div className={styles.topRow} key={scopeKey}>
    <div className={styles.filters}>
      <label>เลขที่แผนการผลิต<button type="button" aria-label="เลขที่แผนการผลิต" disabled={saving || confirming} onClick={() => { setDateOpen(false); setPlanOpen(true); }}>{activeMasterPlanNo || "เลือกแผนหลัก"}<ChevronDown size={15} /></button></label>
      <div className={styles.range}><span>ช่วงวันที่ตามแผนหลัก</span><strong>{dates.length ? `${dateLabel(dates[0])} – ${dateLabel(dates.at(-1))}` : "เลือกแผนหลักก่อน"}</strong></div>
      <label>แผนก<select aria-label="แผนก" value={activeDepartmentId || ""} disabled={saving || confirming} onChange={event => { setDateOpen(false); setSelectedDepartmentId(event.target.value); }}><option value="">เลือกแผนก</option>{departmentTabs.map(dept => <option key={dept.id} value={dept.id}>{dept.name || dept.code}</option>)}</select></label>
    </div>
      <section className={styles.entryPanel} aria-label="คีย์แผนย่อยรายวัน">
        <header className={styles.panelHeader}><h2>รายการผลิตวันนี้</h2><div className={styles.dateNavigation}>
          <button type="button" aria-label="วันก่อนหน้า" disabled={dayIndex <= 0} onClick={() => chooseDate(dates[dayIndex - 1])}><ChevronLeft size={16} /></button>
          <div className={styles.dateControl} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setDateOpen(false); }} onKeyDown={event => { if (event.key === "Escape") { setDateOpen(false); event.currentTarget.querySelector("button")?.focus(); } }}>
            <button type="button" aria-label="เลือกวันที่คีย์แผน" aria-haspopup="listbox" aria-expanded={dateOpen} disabled={!dates.length} onClick={() => setDateOpen(value => !value)}>{selectedDate ? `${weekdayShort(selectedDate)} ${dateLabel(selectedDate)}` : "เลือกวันที่"}<ChevronDown size={14} /></button>
            {dateOpen && <div role="listbox" aria-label="วันที่ในแผน" className={styles.datePopover}>{dates.map(date => <button type="button" role="option" aria-selected={date === selectedDate} data-date={date} key={date} onClick={() => chooseDate(date)}><span>{date === selectedDate && <Check size={14} />}{weekdayShort(date)} {dateLabel(date)}</span><small>{lines.filter(line => line.workDate === date && line.skuCode).length || "—"}</small></button>)}</div>}
          </div>
          <button type="button" aria-label="วันถัดไป" disabled={dayIndex < 0 || dayIndex >= dates.length - 1} onClick={() => chooseDate(dates[dayIndex + 1])}><ChevronRight size={16} /></button>
        </div></header>
        <div className={styles.entryForm}><table className={styles.entryTable}><colgroup><col style={{ width: "20%" }} /><col style={{ width: "25%" }} /><col style={{ width: "18%" }} /><col style={{ width: "14%" }} /><col style={{ width: "15%" }} /><col style={{ width: "8%" }} /></colgroup><thead><tr><th>รหัส WIP</th><th>ชื่อ WIP</th><th>กะ</th><th>จำนวนชุด</th><th>kg</th><th>ลบ</th></tr></thead>
          <tbody>{dailyLines.map((line, index) => {
            const kg = draftLineKg(line);
            const batch = /^(batch|batches|ชุด)$/i.test(line.planningUnit || "");
            return <tr key={line.id}><td data-label="รหัส WIP"><button id={`weekly-line-${line.id}`} type="button" aria-label={`เลือก WIP แถว ${index + 1}`} className={styles.product} disabled={locked} onClick={() => setWipPickerLineId(line.id)}>{line.skuCode || <><Search size={13} />เลือก WIP</>}</button></td><td data-label="ชื่อ WIP">{line.skuName || wipSkuNameBySku.get(line.skuCode) || "ยังไม่เลือกสินค้า"}{line.formulaCode && <small className={styles.formula}>สูตร: {line.formulaCode === "DEFAULT" ? "หลัก" : line.formulaCode}</small>}</td>
              <td data-label="กะ"><select aria-label={`กะรายการ ${index + 1}`} value={line.shiftId || line.shiftCode || ""} disabled={locked} onChange={event => changeShift(line, event.target.value)}><option value="">เลือกกะ</option>{line.shiftId && !activeSectionShifts.some(shift => shift.shiftId === line.shiftId) && <option value={line.shiftId}>{line.shiftName || line.shiftCode}</option>}{activeSectionShifts.map(shift => <option key={shift.shiftId || shift.shiftCode} value={shift.shiftId || shift.shiftCode}>{shift.shiftName || shift.shiftCode}</option>)}</select></td>
              <td data-label="จำนวนชุด"><input aria-label={`จำนวน ${line.skuCode || "WIP"} ${selectedDate} แถว ${index + 1}`} type="number" min="0" step="0.001" value={line.plannedQty ?? ""} disabled={locked} onChange={event => { const value = event.target.value; if (value === "" || (Number.isFinite(Number(value)) && Number(value) >= 0)) updateLine(line.id, "plannedQty", value); }} />{!batch && <small className={styles.formula}>{line.planningUnit || "ยังไม่ระบุหน่วย"}</small>}</td>
              <td data-label="kg" title={kg === null ? "ไม่มีอัตรา kg ของสูตรนี้ ไม่เดาน้ำหนัก" : "น้ำหนักคำนวณตาม BOM ไม่ใช่ยอดชั่งจริง"} className={styles.weight}><input aria-label={`kg รายการ ${index + 1}`} readOnly value={kg === null ? "—" : qtyLabel(kg)} /></td>
              <td data-label="ลบ"><button type="button" className={styles.delete} aria-label={`ลบรายการ ${index + 1}`} disabled={locked} onClick={() => { if (window.confirm("ลบรายการ WIP นี้ออกจากแบบร่างหรือไม่?")) removeLine(line.id); }}>ลบ</button></td></tr>;
          })}{!dailyLines.length && <tr><td colSpan={6} className={styles.empty}>{draftLoading ? "กำลังโหลดแผน…" : "ยังไม่มีรายการในวันนี้ เพิ่มสินค้าได้ด้านล่าง"}</td></tr>}</tbody>
        </table></div>
        {(!activeSectionShifts.length || incomplete) && <p className={styles.hint}>{!activeSectionShifts.length ? "ยังไม่มีกะที่ตั้งค่าไว้ กรุณาตั้งค่ากะก่อนบันทึกแผน" : "กรุณาเลือกกะและกรอกจำนวนมากกว่า 0 ให้ครบก่อนบันทึก"}</p>}
        <div className={styles.entryBottom}><button type="button" aria-label="เพิ่มสินค้าในวันที่เลือก" className={styles.add} disabled={locked || !activeSectionModel || !selectedDate} onClick={() => addLine(selectedDate)}><Plus size={16} />เพิ่มสินค้า WIP ในวันนี้</button><div><span>{dailyLines.filter(line => line.skuCode && Number(line.plannedQty) > 0).length} รายการในวันนี้</span><button type="button" disabled={dayIndex < 0 || dayIndex >= dates.length - 1} onClick={() => chooseDate(dates[dayIndex + 1])}>ไปวันถัดไป {dates[dayIndex + 1] ? dateLabel(dates[dayIndex + 1]).slice(0, 5) : ""}<ChevronRight size={16} /></button></div></div>
      </section>
    </div>
    <section className={styles.previewPanel} aria-label="Preview วัตถุดิบทั้งสัปดาห์">
      <header className={styles.panelHeader}><h2>ใบต้นฉบับ</h2><div className={styles.zoomControls} role="group" aria-label="ขนาดใบ Preview"><button type="button" aria-label="ย่อ Preview" disabled={zoom <= 50} onClick={() => setZoom(value => Math.max(50, value - 10))}><Minus size={15} /></button><output aria-label="ระดับการขยาย">{zoom}%</output><button type="button" aria-label="ขยาย Preview" disabled={zoom >= 150} onClick={() => setZoom(value => Math.min(150, value + 10))}><Plus size={15} /></button></div><button type="button" aria-label="Preview เต็มจอ" onClick={expandPreview}><Maximize2 size={17} /></button></header>
      <nav className={styles.roomTabs} aria-label="ส่วนงาน / ห้องผลิต">{sectionTabs.map(section => <button type="button" key={section.id} aria-pressed={section.id === selectedSectionId} disabled={saving || confirming} onClick={() => { setDateOpen(false); setSelectedSectionId(section.id); }}>{section.section?.name || section.name}</button>)}</nav>
      {previewActionError && <p role="alert" className={styles.error}>{previewActionError}</p>}
      {previewError && <p role="alert" className={styles.error}>{previewError}<button type="button" disabled={busy || locked} onClick={calculate}>ลองคำนวณใหม่</button></p>}
      <div className={styles.previewScroll} aria-busy={Boolean(busy)}>
        <div className={styles.paperSheet} style={{ zoom: zoom / 100 }}>
          <RequisitionPaper department={activeDepartment?.name} masterPlanNo={activeMasterPlanNo} room={sectionName} period={dates.length ? `${dateLabel(dates[0])} – ${dateLabel(dates.at(-1))}` : "—"}>
            <RequisitionPaperTable minWidth={Math.max(1120, 660 + dates.length * 88)}>
              <colgroup><col style={{ width: 32 }} /><col style={{ width: 110 }} /><col style={{ width: 290 }} /><col style={{ width: 70 }} />{dates.map(date => <col key={date} style={{ width: 88 }} />)}<col style={{ width: 75 }} /></colgroup>
              <thead><tr><th rowSpan={3}>#</th><th rowSpan={3}>รหัสวัตถุดิบ</th><th rowSpan={3}>รายการวัตถุดิบ</th><th rowSpan={3}>หน่วย</th>{dates.map((date, index) => <th key={date} title={weekday(date)} data-day-tone={index % 7} data-selected={date === selectedDate}>{weekdayShort(date)}<br />{dateLabel(date).slice(0, 5)}</th>)}<th rowSpan={3} data-total-column>ยอดรวม</th></tr>
              <tr>{dates.map(date => <th key={date}><RequisitionWorkLabel name={lines.filter(line => line.workDate === date && line.skuCode && Number(line.plannedQty) > 0).map(line => `${line.skuName || wipSkuNameBySku.get(line.skuCode) || line.skuCode} ${qtyLabel(line.plannedQty)}${/^(batch|batches|ชุด)$/i.test(line.planningUnit || "") ? "" : line.planningUnit ? ` ${line.planningUnit}` : ""}`).join(" / ")} /></th>)}</tr>
              <tr>{dates.map(date => <th key={date}>จำนวน</th>)}</tr></thead>
              <tbody>{!busy && !previewError && shownMaterials.map((row, index) => <tr key={`${row.code}|${row.unit}`}><td>{index + 1}</td><td className={styles.code}>{row.code}</td><td>{row.name}</td><td>{row.unit}</td>{dates.map(date => <td key={date} data-quantity-cell data-selected={date === selectedDate} className={styles.previewQuantity}>{row.byDate[date] ? qtyLabel(row.byDate[date]) : "—"}</td>)}<td data-total-column>{qtyLabel(row.total)}</td></tr>)}
              {(busy || previewError || !shownMaterials.length) && <tr><td colSpan={dates.length + 5} className={styles.empty}>{busy ? "กำลังคำนวณวัตถุดิบจากรายการล่าสุด…" : previewError ? "ยังไม่แสดงยอด เพื่อป้องกันใช้ผลคำนวณเก่า" : "ยังไม่มีวัตถุดิบตามรายการที่คีย์"}</td></tr>}</tbody>
            </RequisitionPaperTable>
          </RequisitionPaper>
        </div>
      </div>
      <p className={styles.paperNote}>ยอดคำนวณตาม BOM · ไม่ใช่ยอดเบิกหรือยอดใช้จริง · แยกรหัส Trade Code และหน่วย</p>
    </section>
    <footer className={styles.footer}><span role="status">{busy ? "กำลังคำนวณ BOM…" : previewError ? "คำนวณไม่สำเร็จ" : `${activeDepartment?.name || "—"} · ${sectionName}`}</span><div><button type="button" disabled={locked || busy || !activeMasterPlanNo || !activeSectionModel} onClick={() => regenerateSectionFromBom({ preserveDraftLines: true })}><RefreshCw size={14} />คำนวณ BOM ใหม่</button><button type="button" className={styles.primary} disabled={locked || busy || incomplete || !activeMasterPlanNo || !activeDepartmentId} onClick={() => saveDraft({})}><Save size={16} />{saving ? "กำลังบันทึก…" : "บันทึกแบบร่าง"}</button><button type="button" className={styles.primary} disabled={locked || busy || incomplete || Boolean(previewError) || !activeMasterPlanNo || !activeDepartmentId} onClick={confirmSubplan}>{confirming ? "กำลังยืนยัน…" : "ยืนยันแผนย่อย"}</button></div></footer>
    {wipPickerLineId && WipPicker && <WipPicker activeDeptId={activeDepartmentId || activeDepartment?.id || ""} activeDeptName={activeDepartment?.name} onClose={() => setWipPickerLineId(null)} onSelect={handleSelectWipFromPicker} />}
  </section>{planOpen && <RequisitionPlanPicker plans={selectablePlanOptions} selectedPlanNo={activeMasterPlanNo} onSelect={setMasterPlanNo} onClose={() => setPlanOpen(false)} formatDate={dateLabel} />}</>;
}
