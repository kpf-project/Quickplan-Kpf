"use client";

import { useCallback } from "react";
import { useSearchParams } from "next/navigation";
import ProductionReportWorkspace from "./ProductionReportWorkspace";
import { useReportRequestCache } from "./ReportRequestCacheProvider";
import { useReportRequest } from "./useReportRequest";
import ReportSearchStatus from "@/components/reporting/ReportSearchStatus";

export default function OutputReportWorkspace({ reportId }) {
  const params = useSearchParams();
  const query = params.toString();
  const cache = useReportRequestCache();
  const cacheKey = `output:${reportId}:${query}`;
  const load = useCallback(async () => {
    const filters = new URLSearchParams(query);
    const date = filters.get("dateFrom") || new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    const balance = reportId === "wip-balance";
    const endpoint = balance ? "issues" : reportId === "fg-packing" ? "packing-report" : "";
    const data = await cache.load(cacheKey, async () => {
      const response = await fetch(`/api/production-line/fg-wip${endpoint ? `/${endpoint}` : ""}${balance ? "" : `?productionDate=${encodeURIComponent(date)}`}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "ไม่สามารถโหลดรายงานได้");
      return body;
    });
    const source = Array.isArray(data.data) ? data.data : [];
    const productCode = (row) => balance ? row.productCode : reportId === "fg-packing" ? row.fgCode : row.fg_barcode_snapshot;
    const productName = (row) => balance ? row.productName : reportId === "fg-packing" ? row.fgName : row.fg_product_name_snapshot;
    const products = [...new Map(source.map((row) => [productCode(row), { code: productCode(row), name: productName(row) }])).values()].filter((product) => product.code);
    const selected = filters.getAll("productCodes");
    const rows = selected.length ? source.filter((row) => selected.includes(productCode(row))) : source;
    return { reportId, payload: { rows, products, filters: { dateFrom: balance ? "" : date, productCodes: selected } }, error: "", warnings: data.warnings || [] };
  }, [reportId, query, cache, cacheKey]);
  const { report, loading, error, retry } = useReportRequest(cacheKey, load);
  return report?.reportId === reportId ? <ProductionReportWorkspace initialReport={report} loading={loading} searchError={error} /> : <ReportSearchStatus loading={loading} error={error} onRetry={retry} />;
}
