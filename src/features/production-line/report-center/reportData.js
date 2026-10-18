import "server-only";

import { loadProductionInputOutputReportData } from "@/lib/production-input-output-data";
import {
  loadProductionStockLotBalanceSummaryReportData,
  loadProductionStockMovementSummaryReportData,
} from "@/lib/production-stock-balance";
import {
  loadProductionStockIssueReportData,
  loadProductionStockIssueSummaryReportData,
} from "@/lib/production-stock-issues";
import { loadScaleProductsData } from "@/lib/scale/products";
import {
  loadScaleReceiptReportData,
  loadScaleReceiptSummaryReportData,
} from "@/lib/scale/receipts";
import { CENTER_REPORT_IDS } from "./reportDefinitions";
import { loadProductionPrisonIssueReportData, loadProductionPrisonIssueSummaryReportData, loadProductionPrisonLotBalanceReportData, loadProductionPrisonMovementSummaryReportData } from "@/lib/production-prison";
import { PRODUCTION_STOCK_PRISON_ISSUE_TYPES } from "@/lib/production-stock-issues";

function value(params, key) {
  const raw = params?.[key];
  return Array.isArray(raw) ? raw[0] : raw || null;
}

function values(params, key) {
  const raw = params?.[key];
  return (Array.isArray(raw) ? raw : raw ? [raw] : []).map((item) => String(item).trim().toUpperCase()).filter(Boolean);
}

export async function loadCenterReportData(params = {}) {
  const requestedReport = value(params, "report");
  if (requestedReport && !CENTER_REPORT_IDS.has(requestedReport)) return { reportId: null, payload: {}, error: "" };
  const reportId = requestedReport || "stock-issue";
  const dateFrom = value(params, "dateFrom");
  const dateTo = value(params, "dateTo");
  const productCodes = values(params, "productCodes");
  const common = { dateFrom, dateTo, productCodes, includeAll: true, page: 1, limit: 200 };

  try {
    let payload;
    if (reportId.startsWith("prison-")) {
      const loaders = {
        "prison-inbound": loadProductionStockIssueSummaryReportData,
        "prison-inbound-detail": loadProductionStockIssueReportData,
        "prison-issue": loadProductionPrisonIssueSummaryReportData,
        "prison-issue-detail": loadProductionPrisonIssueReportData,
        "prison-balance": loadProductionPrisonLotBalanceReportData,
        "prison-movement": loadProductionPrisonMovementSummaryReportData,
      };
      payload = await loaders[reportId](undefined, { ...common, issueTypes: PRODUCTION_STOCK_PRISON_ISSUE_TYPES });
    } else if (reportId === "scale-inbound" || reportId === "scale-inbound-detail") {
      const products = await loadScaleProductsData();
      const options = { ...common, departmentId: products?.preset?.departmentId || null };
      payload = reportId === "scale-inbound"
        ? await loadScaleReceiptSummaryReportData(undefined, { ...options, summaryChunkSize: 20 })
        : await loadScaleReceiptReportData(undefined, { ...options, itemStatus: "confirmed" });
      payload.departmentName = products?.preset?.departmentName || "แผนกบิสกิต";
      payload.scope = { departmentName: payload.departmentName, products: products?.products || [] };
    } else if (reportId === "stock-issue") {
      payload = await loadProductionStockIssueSummaryReportData(undefined, common);
    } else if (reportId === "stock-issue-detail") {
      payload = await loadProductionStockIssueReportData(undefined, common);
    } else if (reportId === "stock-movement") {
      payload = await loadProductionStockMovementSummaryReportData(undefined, common);
    } else if (reportId === "input-output") {
      payload = await loadProductionInputOutputReportData(undefined, { dateFrom, dateTo, includeWip: true });
      payload.filters = { ...payload.filters, productCodes };
    } else {
      payload = await loadProductionStockLotBalanceSummaryReportData(undefined, { productCodes, includeAll: true, page: 1, limit: 200 });
    }
    return { reportId, payload, warnings: (payload.warnings || []).map((warning) => typeof warning === "string" ? warning : warning.message).filter(Boolean), error: "" };
  } catch (error) {
    console.error("[production-report-center] Failed to load report", reportId, error);
    return { reportId, payload: { rows: [], receipts: [], days: [], filters: { dateFrom: dateFrom || "", dateTo: dateTo || "" } }, error: "ไม่สามารถโหลดข้อมูลรายงานได้ กรุณาลองใหม่อีกครั้ง" };
  }
}

