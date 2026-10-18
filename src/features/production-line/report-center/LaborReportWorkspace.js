"use client";

import { useCallback, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { fetchAttendanceScanEvents } from "@/features/attendance/services/attendanceScanEventsClient";
import { fetchPieceRateReport, fetchPieceRateGroupDocuments } from "@/features/attendance/services/pieceRateWorkClient";
import { ReportTable, reportSystemStyles } from "@/components/reporting/ReportSystem";
import ProductionReportWorkspace from "./ProductionReportWorkspace";
import { LABOR_REPORTS } from "./laborReportDefinitions";
import { useReportRequestCache } from "./ReportRequestCacheProvider";
import { useReportRequest } from "./useReportRequest";
import ReportSearchStatus from "@/components/reporting/ReportSearchStatus";

export default function LaborReportWorkspace({ reportId }) {
  const params = useSearchParams();
  const query = params.toString();
  const cache = useReportRequestCache();
  const cacheKey = `labor:${reportId}:${query}`;
  const dialog = useRef(null);
  const requestSequence = useRef(0);
  const [detail, setDetail] = useState({ row: null, rows: [], loading: false, error: "" });
  async function openDocuments(row) {
    const request = ++requestSequence.current;
    setDetail({ row, rows: [], loading: true, error: "" });
    dialog.current.showModal();
    const result = await fetchPieceRateGroupDocuments({ day: row.groupDayKey, employeeCode: row.employeeCode, productKey: row.groupProductKey, hideCancelled: params.get("hideCancelled") !== "false", hideReplaced: params.get("hideReplaced") !== "false" });
    if (request !== requestSequence.current) return;
    const rows = (result.data?.data?.data || []).filter((document) => document.docStatus === "active").map((document) => ({ ...document, time: document.loggedAt ? new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(document.loggedAt)) : "-", status: "ใช้งาน" }));
    setDetail({ row, rows, loading: false, error: result.ok ? "" : result.error?.message || "ไม่สามารถโหลดรายละเอียดเอกสารได้" });
  }
  const load = useCallback(async () => {
      const filters = new URLSearchParams(query);
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      const dateFrom = filters.get("dateFrom") || today;
      const dateTo = filters.get("dateTo") || dateFrom;
        const scans = reportId === "scan-events";
        const result = scans
          ? await fetchAttendanceScanEvents(new URLSearchParams({ dateFrom, dateTo, page: "1", pageSize: "10000", export: "true" }))
          : await cache.load(`labor:${reportId}:${query}`, async () => {
            const response = await fetchPieceRateReport({ dateFrom, dateTo, productKeys: filters.getAll("productCodes"), printAll: true, hideCancelled: filters.get("hideCancelled") !== "false", hideReplaced: filters.get("hideReplaced") !== "false", viewMode: LABOR_REPORTS[reportId].viewMode });
            if (!response.ok) throw new Error(response.error?.message || "ไม่สามารถโหลดรายงานได้");
            return response;
          });
        if (!result.ok) throw new Error(result.error?.message || "ไม่สามารถโหลดรายงานได้");
        const data = scans ? result.data : result.data?.data;
        let rows = [...(data?.data || [])];
        if (scans) {
          for (let page = 2; page <= (data.pagination?.totalPages || 1); page += 1) {
            const next = await fetchAttendanceScanEvents(new URLSearchParams({ dateFrom, dateTo, page: String(page), pageSize: "10000", export: "true" }));
            if (!next.ok) throw new Error(next.error?.message || "ไม่สามารถโหลดรายงานครบทุกหน้าได้");
            rows.push(...(next.data?.data || []));
          }
        }
        const products = [...new Map(rows.filter((row) => row.productCode || row.productSkuCode).map((row) => [row.productCode || row.productSkuCode, { code: row.productCode || row.productSkuCode, name: row.productName }])).values()];
        const selected = filters.getAll("productCodes");
        if (selected.length) rows = rows.filter((row) => selected.includes(row.productCode || row.productSkuCode));
        const summary = selected.length ? { ...data.summary, totalKg: rows.reduce((sum, row) => sum + Number(row.normalizedKgAmount || 0), 0), totalCount: rows.reduce((sum, row) => sum + Number(row.countValue || 0), 0), totalWage: rows.reduce((sum, row) => sum + Number(row.wageAmount || 0), 0) } : data.summary;
        const nextReport = { reportId, payload: { rows, summary, capabilities: data.capabilities, products, filters: { dateFrom, dateTo, productCodes: selected } }, error: "" };
        return nextReport;
  }, [reportId, query, cache]);
  const { report, loading, error, retry } = useReportRequest(cacheKey, load);
  const columns = [
    { key: "docNo", label: "เลขเอกสาร", width: "16%" }, { key: "time", label: "เวลาชั่งจริง", width: "17%" }, { key: "employeeCode", label: "รหัสพนักงาน", width: "12%" }, { key: "employeeName", label: "ชื่อพนักงาน", width: "23%" },
    { key: "normalizedKgAmount", label: "น้ำหนัก (กก.)", width: "10%", format: "number", align: "right" }, { key: "countValue", label: "จำนวน", width: "7%", format: "number", align: "right" },
    ...(report?.payload.capabilities?.canViewMoney ? [{ key: "wageAmount", label: "ค่าแรง", width: "8%", format: "number", align: "right" }] : []), { key: "status", label: "สถานะ", width: "7%" },
  ];
  return <>
    {report?.reportId === reportId ? <ProductionReportWorkspace initialReport={report} loading={loading} searchError={error} renderCell={reportId === "wages" ? (column, row) => column.key === "document" ? <button type="button" className={reportSystemStyles.documentLink} onClick={() => openDocuments(row)} aria-label={`ดูเอกสาร ${row.document} ของ ${row.employeeName}`}>{row.document}</button> : undefined : undefined} /> : <ReportSearchStatus loading={loading} error={error} onRetry={retry} />}
    <dialog ref={dialog} className={reportSystemStyles.detailDialog} aria-labelledby="group-documents-title" onClose={() => { requestSequence.current += 1; }}>
      <header><div><h2 id="group-documents-title">รายละเอียดเอกสารในกลุ่ม</h2><p>{detail.row?.groupDayKey} · {detail.row?.employeeCode} · {detail.row?.productName}</p></div><button type="button" onClick={() => dialog.current.close()} autoFocus>ปิด</button></header>
      <div>{detail.error ? <p role="alert">{detail.error}</p> : <ReportTable columns={columns} rows={detail.rows} loading={detail.loading} totalSpan={4} totalRow={!detail.loading && detail.rows.length ? Object.fromEntries(["normalizedKgAmount", "countValue", "wageAmount"].map((key) => [key, detail.rows.reduce((sum, row) => sum + Number(row[key] || 0), 0)])) : null} />}</div>
    </dialog>
  </>;
}
