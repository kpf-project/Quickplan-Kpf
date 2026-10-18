"use client";

import { useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useReportRequest } from "./useReportRequest";
import ReportSearchStatus from "@/components/reporting/ReportSearchStatus";
import ProductionReportWorkspace from "./ProductionReportWorkspace";

export default function StockReportWorkspace({ initialReport, reportId }) {
  const params = useSearchParams();
  const query = params.toString();
  const key = `stock:${reportId}:${query}`;
  const filters = initialReport?.payload?.filters || {};
  const matchesInitial = initialReport?.reportId === reportId
    && ["dateFrom", "dateTo"].every((field) => !params.get(field) || params.get(field) === filters[field])
    && JSON.stringify(params.getAll("productCodes")) === JSON.stringify(filters.productCodes || []);
  const load = useCallback(async () => {
    const response = await fetch(`/api/production-line/reports?${query}`, { cache: "no-store" });
    const report = await response.json();
    if (!response.ok) throw new Error(report.error || "ไม่สามารถโหลดรายงานได้");
    return report;
  }, [query]);
  const { report, loading, error, retry } = useReportRequest(key, load, matchesInitial ? initialReport : null);
  return report?.reportId === reportId ? <ProductionReportWorkspace initialReport={report} loading={loading} searchError={error} /> : <ReportSearchStatus loading={loading} error={error} onRetry={retry} />;
}
