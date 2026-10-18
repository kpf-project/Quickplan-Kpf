"use client";

import { useEffect, useState } from "react";
import { Printer, RefreshCw } from "lucide-react";
import WeightScaleHistoryTable from "./WeightScaleHistoryTable";
import WeightScalePaginationBar from "./WeightScalePaginationBar";
import { fetchCentralInboundHistory } from "../services/weightScaleLiveClient";
import { getScaleNumberingContext } from "@/lib/scale/numbering";

const kg = value => Number(value || 0).toLocaleString("th-TH", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export default function CentralInboundHistory({ departmentId, pointId, products, refreshVersion, onPrint, printingId, printStatuses }) {
  const [date, setDate] = useState(() => getScaleNumberingContext(new Date()).productionDate);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);
  const [refresh, setRefresh] = useState(0);
  const [result, setResult] = useState(null);
  const scope = `${departmentId}:${pointId}:${date}:${page}:${limit}:${refreshVersion}:${refresh}`;
  useEffect(() => {
    let active = true;
    if (!departmentId || !pointId || !date) return;
    fetchCentralInboundHistory({ departmentId, pointId, date, page: page - 1, pageSize: limit })
      .then(data => { if (active) setResult({ scope, data }); })
      .catch(reason => { if (active) setResult({ scope, error: reason.message }); });
    return () => { active = false; };
  }, [departmentId, pointId, date, page, limit, refreshVersion, refresh, scope]);
  const data = result?.scope === scope ? result.data : null;
  const error = result?.scope === scope ? result.error : "";
  const loading = Boolean(departmentId && pointId && date && result?.scope !== scope);
  const receipts = (data?.receipts || []).filter(row => row.department_id === departmentId && row.point_id === pointId);
  const count = Number(data?.totalCount || 0);
  return <div>
    <WeightScaleHistoryTable title="ประวัติรับเข้ากลาง" count={count} isLoading={loading}
      empty={!receipts.length} columnCount={9}
      emptyMessage={error || (!pointId || !departmentId ? "เลือกสินค้าและเชื่อมต่อจุดชั่งเพื่อดูประวัติ" : "ไม่พบรายการในวันผลิตที่เลือก")}
      controls={<>
        <label>วันผลิต <input aria-label="วันผลิตของประวัติรับเข้า" type="date" value={date}
          onChange={event => { setDate(event.target.value); setPage(1); }} /></label>
        <span>รับเข้าวันที่เลือก {data ? kg(data.totalNetKg) : "—"} kg</span>
        <button type="button" onClick={() => setRefresh(value => value + 1)} disabled={loading}><RefreshCw size={15} />รีเฟรช</button>
      </>}
      footer={<WeightScalePaginationBar page={page} totalPages={Math.max(1, Math.ceil(count / limit))} totalCount={count}
        limit={limit} limitOptions={[15, 25, 50, 100]} isLoading={loading} onPageChange={setPage}
        onLimitChange={value => { setLimit(value); setPage(1); }} />}>
      <thead><tr>{["#", "บาร์โค้ด", "สินค้า", "LOT", "รวม (kg)", "ภาชนะ (kg)", "สุทธิ (kg)", "เวลาบันทึก", "พิมพ์ฉลาก"].map(title => <th key={title}>{title}</th>)}</tr></thead>
      <tbody>{receipts.map((row, index) => <tr key={row.request_id}>
        <td>{(page - 1) * limit + index + 1}</td>
        <td className="whitespace-nowrap">{row.barcode}</td>
        <td><strong>{row.product_code}</strong><br />{products.find(product => product.code === row.product_code)?.name || ""}</td>
        <td className="whitespace-nowrap">{row.lot_no}</td>
        <td className="text-right">{kg(row.gross_kg)}</td><td className="text-right">{kg(row.tare_kg)}</td>
        <td className="text-right font-bold">{kg(row.net_kg)}</td>
        <td className="whitespace-nowrap">{new Date(row.created_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}</td>
        <td><button type="button" disabled={Boolean(printingId)} onClick={() => onPrint({ id: row.request_id, departmentId: row.department_id, productCode: row.product_code })}>
          <Printer size={15} />{printingId === row.request_id ? "กำลังส่ง…" : printStatuses[row.request_id] === "failed" ? "ตรวจฉลาก / พิมพ์ซ้ำ" : "พิมพ์ซ้ำ"}
        </button></td>
      </tr>)}</tbody>
    </WeightScaleHistoryTable>
    {data ? <p className="mt-2 text-xs text-slate-500">ยอดรับเข้าสะสมทุกจุดชั่งของแผนก {kg(data.departmentInboundKg)} kg — เป็นยอดรับเข้าเท่านั้น ไม่ใช่ยอดคงเหลือหลังเบิก/คืน</p> : null}
    <p className="mt-1 text-xs text-slate-500">วันที่นี้ใช้กรองประวัติเท่านั้น ไม่เปลี่ยนวันผลิตของรายการรับเข้าใหม่ ซึ่งออกจากเวลาระบบกลาง</p>
  </div>;
}
