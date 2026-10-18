import { jsonError } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { getExecutiveCostReport, getExecutiveCostReportForOutput } from "@/lib/productionCostingService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    await requireTaskPermission(request, "production-cost-view");
    const { searchParams } = new URL(request.url);
    const sheetId = searchParams.get("sheetId");
    if (sheetId) return Response.json({ data: await getExecutiveCostReport(sheetId) });
    const skuCode = searchParams.get("skuCode");
    const lotNo = searchParams.get("lotNo");
    const productionDate = searchParams.get("productionDate");
    if (!skuCode || !lotNo || !/^\d{4}-\d{2}-\d{2}$/.test(productionDate || "")) {
      return Response.json({ error: "sheetId or skuCode, lotNo, and productionDate are required" }, { status: 400 });
    }
    return Response.json({ data: await getExecutiveCostReportForOutput({ skuCode, lotNo, productionDate }) });
  } catch (error) {
    return jsonError(error);
  }
}
