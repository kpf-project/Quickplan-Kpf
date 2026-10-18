import { jsonError } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { REPORT_GROUPS } from "@/features/production-line/reportCenter";
import { loadCenterReportData } from "@/features/production-line/report-center/reportData";
import { CENTER_REPORT_IDS } from "@/features/production-line/report-center/reportDefinitions";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    const reportId = params.get("report") || "stock-issue";
    if (!CENTER_REPORT_IDS.has(reportId)) return Response.json({ error: "Unknown report" }, { status: 400 });
    const group = REPORT_GROUPS.find((entry) => entry.reports.some((report) => report.id === reportId));
    await requirePermissionKeys(request, group.permissions);
    const filters = Object.fromEntries(params);
    filters.productCodes = params.getAll("productCodes");
    const report = await loadCenterReportData(filters);
    return Response.json(report, { status: report.error ? 500 : 200, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return jsonError(error);
  }
}
