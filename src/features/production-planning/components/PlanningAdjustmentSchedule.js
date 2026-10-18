"use client";

import GenericScheduleTable from "./GenericScheduleTable";
import styles from "./ProductionSchedulePresentation.module.css";
import { isPlanningDateEditable } from "@/lib/planningAdjustment";

export function adjustmentScheduleRows(rows, today) {
  return rows.map(row => ({ id: row.plan_id, day_key: row.period_start, row_data: row.row_data, readOnly: row.can_edit === false || !isPlanningDateEditable(row.period_start, today) }));
}

export default function PlanningAdjustmentSchedule({ sections, selectedSectionId, onSectionChange, rows, dates, today, skuCatalog, sectionShifts, onUpdate, onDelete, onAddRow, canAdd, title }) {
  const section = sections.find(item => String(item.id) === selectedSectionId) || sections[0];
  const days = dates.map(date => ({ key: date, date: new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Bangkok" }).format(new Date(date + "T00:00:00+07:00")), label: new Intl.DateTimeFormat("th-TH", { weekday: "long", timeZone: "Asia/Bangkok" }).format(new Date(date + "T00:00:00+07:00")) }));
  return <div className={styles.canvas}>
    <nav className={styles.sectionNav} aria-label="Section แผนหลัก">{sections.map(item => <button type="button" className={styles.departmentTab} aria-pressed={item === section} key={item.id} onClick={() => onSectionChange(String(item.id))}>{item.name}</button>)}</nav>
    <section className={styles.paper}>
      <header className={styles.paperHeader}><h2>{title} · {section?.name}</h2><p>วันที่ก่อน {new Intl.DateTimeFormat("th-TH").format(new Date(today + "T00:00:00+07:00"))} แก้ไขไม่ได้ · บันทึกด้วยปุ่มบันทึกการแก้ไข</p></header>
      {section && <div className={styles.tableViewport}><GenericScheduleTable section={section} rows={adjustmentScheduleRows(rows.filter(row => String(row.schedule_section_def_id) === String(section.id)), today)} days={days} skuCatalog={skuCatalog} sectionShifts={sectionShifts} readOnly={false} onUpdate={onUpdate} onDelete={onDelete} onAddRow={canAdd ? onAddRow : undefined} /></div>}
    </section>
  </div>;
}
