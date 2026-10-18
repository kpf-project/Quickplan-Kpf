"use client";

import { Eye } from "lucide-react";
import WeightScaleHistoryTable from "./WeightScaleHistoryTable";
import { packingQuantityText } from "@/lib/packingUnits";

export default function PackingHistoryTable({ records, title, loading = false, controls, onDetails }) {
  return <WeightScaleHistoryTable title={title} count={records.length} controls={controls} isLoading={loading} empty={!records.length} columnCount={7}>
    <thead><tr><th>สินค้า</th><th>LOT ผลิต</th><th>ผลิตสำเร็จ</th><th>ยอดค้างนำมาใช้</th><th>ค้างปลายวัน</th><th>บันทึกจาก</th><th>รายละเอียด</th></tr></thead>
    <tbody>{records.map(record => <tr key={record.id}>
      <td><strong>{record.product_code}</strong><div>{record.product_name}</div></td>
      <td>{record.lot_no}</td>
      <td>{packingQuantityText(record.payload.units, record.payload.produced)}</td>
      <td>{record.sourceSummary || record.payload.sources.map(source => `${source.quantity.toLocaleString("th-TH")} ${source.unitLabel} (LOT ${source.lotNo})`).join(" + ") || "—"}</td>
      <td>{packingQuantityText(record.payload.units, record.payload.closing)}</td>
      <td>{record.origin === "legacy" ? "หน้า FG/WIP เดิม" : "หน้าบรรจุหลายหน่วย"}</td>
      <td>{onDetails ? <button type="button" aria-label={`รายละเอียด ${record.product_code}`} onClick={() => onDetails(record)}><Eye size={17} /></button> : "—"}</td>
    </tr>)}</tbody>
  </WeightScaleHistoryTable>;
}
