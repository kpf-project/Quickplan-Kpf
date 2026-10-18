"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ChevronRight, Info, Search, X } from "lucide-react";
import styles from "./RequisitionPlanPicker.module.css";

const months = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
function yearOf(plan) { return /^\d{4}-\d{2}-\d{2}$/.test(plan.periodStart) ? plan.periodStart.slice(0, 4) : "unknown"; }
function monthOf(plan) { return yearOf(plan) === "unknown" ? "unknown" : plan.periodStart.slice(5, 7); }
export function filterRequisitionPlans(plans, search, year, month, formatDate) {
  const term = search.trim().toLowerCase();
  return plans.filter(plan => term
    ? `${plan.planNo} ${plan.periodStart} ${plan.periodEnd} ${formatDate(plan.periodStart)} ${formatDate(plan.periodEnd)}`.toLowerCase().includes(term)
    : yearOf(plan) === year && (!month || monthOf(plan) === month));
}

export default function RequisitionPlanPicker({ plans, selectedPlanNo, onSelect, onClose, formatDate, loading, error, onRetry }) {
  const selected = plans.find(plan => plan.planNo === selectedPlanNo) || plans[0];
  const [search, setSearch] = useState("");
  const [year, setYear] = useState(selected ? yearOf(selected) : "");
  const [month, setMonth] = useState(selected ? monthOf(selected) : "");
  const panel = useRef(null);
  const years = [...new Set(plans.map(yearOf))].sort().reverse();
  const activeYear = years.includes(year) ? year : years[0] || "";
  const yearPlans = plans.filter(plan => yearOf(plan) === activeYear);
  const monthKeys = [...new Set(yearPlans.map(monthOf))].sort().reverse();
  const activeMonth = monthKeys.includes(month) ? month : "";
  const results = filterRequisitionPlans(plans, search, activeYear, activeMonth, formatDate);
  useEffect(() => {
    const previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector("input")?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus?.(); };
  }, []);
  const labelMonth = value => value === "unknown" ? "ไม่ระบุเดือน" : months[Number(value) - 1];
  return <div className={styles.backdrop} onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <section ref={panel} className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="plan-picker-title" onKeyDown={event => {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
      if (event.key !== "Tab") return;
      const items = [...panel.current.querySelectorAll("button:not(:disabled),input,select")];
      if (event.shiftKey && document.activeElement === items[0]) { event.preventDefault(); items.at(-1)?.focus(); }
      else if (!event.shiftKey && document.activeElement === items.at(-1)) { event.preventDefault(); items[0]?.focus(); }
    }}>
      <header><h2 id="plan-picker-title">เลือกแผนการผลิต</h2><button type="button" onClick={onClose} aria-label="ปิดเลือกแผน"><X size={21} /></button></header>
      <label className={styles.search}><Search size={18} /><input aria-label="ค้นหาเลขแผนหรือช่วงวันที่" placeholder="ค้นหาเลขแผน หรือช่วงวันที่" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <div className={styles.workspace}>
        <nav aria-label="ปีและเดือนของแผน" className={styles.months}>
          <label>ปี<select aria-label="ปีของแผน" value={activeYear} onChange={event => { setYear(event.target.value); setMonth(""); setSearch(""); }}>{years.map(value => <option key={value} value={value}>{value === "unknown" ? "ไม่ระบุปี" : Number(value) + 543}</option>)}</select></label>
          <button type="button" aria-pressed={!activeMonth && !search} onClick={() => { setMonth(""); setSearch(""); }}>ทั้งหมด ({yearPlans.length})</button>
          {monthKeys.map(value => <button type="button" key={value} aria-pressed={!search && activeMonth === value} onClick={() => { setMonth(value); setSearch(""); }}>{labelMonth(value)} ({yearPlans.filter(plan => monthOf(plan) === value).length})</button>)}
        </nav>
        <div className={styles.results}>
          <div className={styles.resultHeading}><h3>{search ? "ผลการค้นหาทุกแผน" : activeMonth ? `${labelMonth(activeMonth)} ${activeYear === "unknown" ? "" : Number(activeYear) + 543}` : "ทุกเดือน"}</h3><span aria-live="polite">พบ {results.length} แผน</span></div>
          {loading ? <p className={styles.message}>กำลังโหลดแผน…</p> : error ? <p role="alert" className={styles.message}>โหลดแผนไม่สำเร็จ <button type="button" onClick={onRetry}>ลองใหม่</button></p> : !results.length ? <p className={styles.message}>ไม่พบแผนที่ตรงกับการค้นหา</p> : results.map(plan => <button type="button" className={styles.plan} key={plan.planNo} aria-current={plan.planNo === selectedPlanNo ? "true" : undefined} onClick={() => { onSelect(plan.planNo); onClose(); }}>
            <span><strong>{plan.planNo}</strong><span>{plan.periodStart && plan.periodEnd ? `${formatDate(plan.periodStart)} – ${formatDate(plan.periodEnd)}` : "ไม่ระบุช่วงวันที่"}</span></span>
            <span className={styles.rowEnd}>{plan.planNo === selectedPlanNo && <><CheckCircle2 size={18} />ใช้อยู่</>}<ChevronRight size={17} /></span>
          </button>)}
        </div>
      </div>
      <footer><span><Info size={17} />เลือกแผนเพื่อแสดงใบเบิก</span><span>{plans.length} แผนทั้งหมด</span></footer>
    </section>
  </div>;
}
