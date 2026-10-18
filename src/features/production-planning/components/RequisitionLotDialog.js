"use client";

import { CheckCircle2 } from "lucide-react";
import RequisitionDialog from "./RequisitionDialog";
import styles from "./RequisitionLotDialog.module.css";

export default function RequisitionLotDialog({ document: doc, masterPlanNo, state, options, draft, requiredQty, allocatedQty, details, onDetails, onChangeDraft, onClose, onConfirm, formatDate, formatQty, formatQtyOrZero, roundQty, toNumber }) {
  const unit = state.line?.unit || "-";
  const complete = Math.abs(allocatedQty - requiredQty) <= 0.001;
  return <RequisitionDialog title="เลือก LOT" className={styles.dialog} onClose={onClose} footer={<>
    <div className={styles.result} data-complete={complete} role="status">{complete && <CheckCircle2 size={19} />}{complete ? "จัดสรรครบ" : "จัดสรรแล้ว"} {formatQtyOrZero(allocatedQty)} / {formatQty(requiredQty)} {unit}</div>
    <button type="button" onClick={onClose}>ยกเลิก</button>
    <button type="button" className={styles.confirm} disabled={!complete} onClick={onConfirm}>ยืนยัน LOT</button>
  </>}>
    <p className={styles.context}><strong>{String(doc.roomLabel || doc.roomId || "-").replace(/^\[[^\]]+\]\s*/, "")}</strong><span>{masterPlanNo || "-"}</span><span>{formatDate(state.column?.dateValue)}</span></p>
    <div className={styles.summary}>
      <div><strong className={styles.code}>{state.line?.materialGoodsCode || state.line?.materialSkuCode}</strong><strong>{state.line?.materialName}</strong><span>หน่วย {unit}</span></div>
      <div><span>ต้องการ <b>{formatQty(requiredQty)} {unit}</b></span><span>เลือกแล้ว <b>{formatQtyOrZero(allocatedQty)} {unit}</b></span><span data-complete={complete}>{allocatedQty > requiredQty ? "เกิน" : "ยังขาด"} <b>{formatQtyOrZero(Math.abs(requiredQty - allocatedQty))} {unit}</b></span></div>
    </div>
    <div className={styles.workspace}>
      <section className={styles.catalog} aria-label="ตารางเลือก LOT">
        <div className={styles.tableScroll}><table className={styles.table}>
          <thead><tr>{["เลือก", "LOT", "รับเข้า / FIFO", "คลัง", `สต็อกจริง (${unit})`, "ใบอื่นจองแล้ว", "คงเหลือพร้อมใช้", "จำนวนที่ใบนี้เลือก"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{options.map((option, index) => {
            const currentQty = toNumber(draft[option.key]);
            return <tr key={option.key} data-selected={currentQty > 0}>
              <td><input type="checkbox" checked={currentQty > 0} aria-label={`เลือก LOT ${option.lotNo || "ไม่ระบุ"}`} onChange={event => onChangeDraft(current => ({ ...current, [option.key]: event.target.checked ? Math.min(toNumber(option.availableQty), Math.max(0, requiredQty - allocatedQty)) : 0 }))} /></td>
              <td className={styles.code}>{option.lotNo || "ไม่ระบุ LOT"}</td>
              <td>{formatDate(option.fifoDate)}{index === 0 && <span className={styles.fifo}>FIFO</span>}</td>
              <td>{option.warehouseCode || "-"}</td>
              <td>{formatQtyOrZero(option.stockQty)}</td>
              <td>{toNumber(option.reservedByOtherQty) > 0 ? <button type="button" className={styles.link} onClick={() => onDetails({ ...option, unit })}>{formatQtyOrZero(option.reservedByOtherQty)}</button> : formatQtyOrZero(option.reservedByOtherQty)}</td>
              <td>{formatQtyOrZero(option.availableQty)}</td>
              <td><input type="number" min="0" max={option.availableQty} step="0.001" value={currentQty || ""} aria-label={`จำนวนจาก LOT ${option.lotNo || "ไม่ระบุ"}`} onChange={event => onChangeDraft(current => ({ ...current, [option.key]: roundQty(event.target.value) }))} /></td>
            </tr>;
          })}{!options.length && <tr><td colSpan={8}>ไม่พบสต็อก LOT ที่พร้อมใช้ในคลัง</td></tr>}</tbody>
        </table></div>
        <p className={styles.note}>พร้อมใช้ = สต็อกจริง − ใบอื่นจองในแผนนี้ · หน่วยอ้างอิงตาม Trade Code</p>
      </section>
      <aside className={styles.details} aria-label="รายละเอียดการจอง">
        <h4>รายละเอียดการจอง</h4>
        {details ? <><p>LOT {details.lotNo || "ไม่ระบุ"} · คลัง {details.warehouseCode || "-"} · รวม {formatQtyOrZero(details.reservedByOtherQty)} {unit}</p>
          <div className={styles.tableScroll}><table className={styles.table}><thead><tr>{["#", "ห้อง / แผนก", "วันที่", `จำนวน (${unit})`].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
            <tbody>{(details.reservedByOtherDetails || []).map((detail, index) => <tr key={index}><td>{index + 1}</td><td><strong>{detail.roomLabel}</strong><div>{detail.departmentName}</div><div>{detail.productName}{detail.productCode ? ` (${detail.productCode})` : ""}</div></td><td>{formatDate(detail.workDate)}</td><td>{formatQtyOrZero(detail.qty)}</td></tr>)}</tbody>
          </table></div>
        </> : <p className={styles.note}>คลิกยอด “ใบอื่นจองแล้ว” เพื่อดูรายละเอียด</p>}
        <p className={styles.note}>แสดงยอดจองใบอื่นในแผนหลักเดียวกัน</p>
      </aside>
    </div>
    <p className={styles.lockNote}>วันที่ Export แล้วแก้ไข LOT ไม่ได้</p>
  </RequisitionDialog>;
}
