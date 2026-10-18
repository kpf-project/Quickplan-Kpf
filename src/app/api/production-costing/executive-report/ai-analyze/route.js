import { jsonError } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { getExecutiveCostReport, getExecutiveCostReportForOutput } from "@/lib/productionCostingService";
import { analyzeCostingWithGemini } from "@/lib/productionCostAiService";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    await requireTaskPermission(request, "production-cost-view");
    const body = await request.json().catch(() => ({}));
    let reportData = null;

    if (body.sheet && body.tree) {
      reportData = body;
    } else if (body.sheetId) {
      reportData = await getExecutiveCostReport(body.sheetId);
    } else if (body.skuCode && body.lotNo && body.productionDate) {
      reportData = await getExecutiveCostReportForOutput({
        skuCode: body.skuCode,
        lotNo: body.lotNo,
        productionDate: body.productionDate,
      });
    }

    if (!reportData) {
      return Response.json({ error: "Missing costing report data for AI analysis" }, { status: 400 });
    }

    const aiAnalysis = await analyzeCostingWithGemini({
      sheet: reportData.sheet,
      tree: reportData.tree || [],
      control: reportData.control || {},
    });

    return Response.json({ data: aiAnalysis });
  } catch (error) {
    return jsonError(error);
  }
}
