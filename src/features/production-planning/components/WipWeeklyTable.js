"use client";

import { Fragment } from "react";
import { wipPlanDisplayKg } from "../services/wipPlanDisplayWeight";
import styles from "./RequisitionPreviewPresentation.module.css";

const format = value => Number(value).toLocaleString("th-TH", { maximumFractionDigits: 3 });

export function buildWipWeeklyRows(lines) {
  const rows = [];
  for (const line of lines) {
    const key = JSON.stringify([line.skuCode, line.unit || line.planningUnit, line.sourceSectionDefId, line.shiftId, line.shiftCode, line.shiftName, line.formulaCode, line.bomVersionId]);
    let row = rows.find(item => item.groupKey === key && !item.linesByDate[line.workDate]);
    if (!row) {
      row = { key: `${key}-${rows.length}`, groupKey: key, skuCode: line.skuCode, skuName: line.skuName, sectionName: line.sourceSectionName, displayUnit: /^(batch|batches|ชุด)$/i.test(line.unit || line.planningUnit || "") ? "batch" : line.unit || line.planningUnit || "—", shiftName: line.shiftName || line.shiftCode, formulaCode: line.formulaCode, qtyByDate: {}, kgByDate: {}, linesByDate: {}, totalQty: 0, totalKg: 0, weightIncomplete: false };
      rows.push(row);
    }
    const kg = wipPlanDisplayKg(line);
    row.linesByDate[line.workDate] = line;
    row.qtyByDate[line.workDate] = Number(line.plannedQty || 0);
    row.kgByDate[line.workDate] = kg;
    row.totalQty += Number(line.plannedQty || 0);
    row.totalKg += kg || 0;
    row.weightIncomplete ||= kg === null;
  }
  return rows;
}

export default function WipWeeklyTable({ rows, dates, formatDate, canEdit, onChange, onDelete, showRooms = false }) {
  const editable = Boolean(onChange);
  return <div className="w-full overflow-x-auto"><table className={styles.referenceWipTable} style={{ minWidth: 470 + dates.length * 112 + (onDelete ? 48 : 0) }} aria-label="แผนย่อย WIP รายสัปดาห์">
    <colgroup><col style={{ width: 110 }} /><col style={{ width: 240 }} />{dates.map(date => <col key={date} style={{ width: 112 }} />)}<col style={{ width: 120 }} />{onDelete && <col style={{ width: 48 }} />}</colgroup>
    <thead><tr className="bg-[#e8eef8] text-[#102C57]">
      <th className="border border-slate-300 px-3 py-2 text-left whitespace-nowrap">รหัส WIP</th>
      <th className="border border-slate-300 px-3 py-2 text-left">ชื่อ WIP</th>
      {dates.map(date => <th key={date} className="border border-slate-300 px-2 py-2 whitespace-nowrap">{formatDate(date)}</th>)}
      <th className="border border-slate-300 px-3 py-2 whitespace-nowrap">ยอดรวม</th>
      {onDelete && <th className="border border-slate-300 px-2 py-2 print:hidden">ลบ</th>}
    </tr></thead>
    <tbody>{rows.map((row, index) => <Fragment key={row.key}>
      {showRooms && (index === 0 || rows[index - 1].sectionName !== row.sectionName) && <tr className={styles.referenceRoom}><th colSpan={dates.length + 3 + Number(Boolean(onDelete))}>{row.sectionName}</th></tr>}
      <tr className="bg-white hover:bg-slate-50">
        <td className="border border-slate-300 px-3 py-2 whitespace-nowrap"><span className="text-blue-600">{row.skuCode}</span></td>
        <td className="border border-slate-300 px-3 py-2 text-sm text-[#102C57]">{row.skuName}{row.shiftName && <small className="block text-slate-500">{row.shiftName}</small>}{row.formulaCode && <small className="block text-slate-500">สูตร {row.formulaCode === "DEFAULT" ? "หลัก" : row.formulaCode}</small>}</td>
        {dates.map(date => {
          const qty = row.qtyByDate[date];
          const line = row.linesByDate?.[date];
          const allowed = editable && line && canEdit?.(line);
          const batch = /^(batch|ชุด)$/i.test(row.displayUnit);
          return <td key={date} className="border border-slate-300 px-2 py-2 text-center whitespace-nowrap text-sm">
            {allowed ? <><input aria-label={`${row.skuCode} ${date}`} type="number" min="0" step="any" value={qty ?? ""} onChange={event => onChange(line, event.target.value)} className="w-20 rounded border border-slate-300 bg-white px-1 py-1 text-right print:hidden" /><span className="hidden print:inline">{format(qty)}</span><small> {row.displayUnit}</small></> : qty != null && qty > 0 ? <span>{format(qty)} {row.displayUnit}</span> : "—"}
            {batch && qty > 0 && <small className="block text-xs text-slate-500" title={line?.weightUsesCurrentBom ? "ใช้ BOM สูตรเดียวกันที่อนุมัติล่าสุด เพราะแผนเดิมไม่ระบุเวอร์ชัน" : "น้ำหนักตาม BOM ไม่ใช่ยอดชั่งจริง"}>{row.kgByDate[date] == null ? "ไม่พบอัตรา kg/batch" : `${format(row.kgByDate[date])} kg`}</small>}
          </td>;
        })}
        <td className="border border-slate-300 bg-slate-50 px-3 py-2 text-center text-sm font-semibold whitespace-nowrap">{format(row.totalQty)} {row.displayUnit}{/^(batch|ชุด)$/i.test(row.displayUnit) && <small className="block font-normal text-slate-500">{row.weightIncomplete ? "น้ำหนักไม่ครบ" : `${format(row.totalKg)} kg`}</small>}</td>
        {onDelete && <td className="border border-slate-300 px-2 py-2 text-center print:hidden"><button type="button" disabled={!Object.values(row.linesByDate || {}).some(line => canEdit?.(line))} onClick={() => onDelete(row)} className="text-xs text-red-600 underline disabled:text-slate-400 disabled:no-underline">ลบ</button></td>}
      </tr>
    </Fragment>)}{!rows.length && <tr><td colSpan={dates.length + 3 + Number(Boolean(onDelete))} className="p-5 text-center text-sm text-slate-500">ยังไม่มีแผนย่อย WIP</td></tr>}</tbody>
  </table></div>;
}
