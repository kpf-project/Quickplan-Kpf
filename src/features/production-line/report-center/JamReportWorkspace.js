"use client";

import { useCallback } from "react";
import { useSearchParams } from "next/navigation";
import ProductionReportWorkspace from "./ProductionReportWorkspace";
import { JAM_REPORTS } from "./jamReportDefinitions";
import { useReportRequestCache } from "./ReportRequestCacheProvider";
import { useReportRequest } from "./useReportRequest";
import ReportSearchStatus from "@/components/reporting/ReportSearchStatus";

export default function JamReportWorkspace({ reportId }) {
  const params = useSearchParams();
  const query = params.toString();
  const cache = useReportRequestCache();
  const cacheKey = `jam:${reportId}:${query}`;
  const load = useCallback(async () => {
    const definition = JAM_REPORTS[reportId];
    const filters = new URLSearchParams(query);
    filters.set("report", definition.reportType);
    if (definition.prisonView) filters.set("prisonView", definition.prisonView);
    const result = await cache.load(cacheKey, async () => {
      const response = await fetch(`/api/attendance/piece-rate/stock/movements?${filters}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "ไม่สามารถโหลดรายงานได้");
      return body;
    });
    // Cached responses must not be mutated by presentation filtering.
    const payload = { ...result.data };
    const selected = new URLSearchParams(query).getAll("productCodes");
    payload.scope = { departmentName: "แผนกป้ายแยม", products: [...new Map(payload.rows.map((row) => [row.productCode, { code: row.productCode, name: row.productName }])).values()] };
    payload.filters = { ...payload.filters, productCodes: selected, status: new URLSearchParams(query).get("status") || "inbound", issueStatuses: new URLSearchParams(query).getAll("issueStatuses").length ? new URLSearchParams(query).getAll("issueStatuses") : ["issue"] };
    if (selected.length) payload.rows = payload.rows.filter((row) => selected.includes(row.productCode));
    return { reportId, payload, error: "" };
  }, [reportId, query, cache, cacheKey]);
  const { report, loading, error, retry } = useReportRequest(cacheKey, load);
  return report?.reportId === reportId ? <ProductionReportWorkspace initialReport={report} loading={loading} searchError={error} /> : <ReportSearchStatus loading={loading} error={error} onRetry={retry} />;
}
