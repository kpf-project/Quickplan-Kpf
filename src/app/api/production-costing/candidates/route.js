import { jsonError } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { listProductionCostCandidates } from "@/lib/productionCostingService";

export const dynamic = "force-dynamic";

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

export async function GET(request) {
  try {
    await requireTaskPermission(request, "production-cost-view");
    const { searchParams } = new URL(request.url);
    const dateFrom = searchParams.get("dateFrom");
    const dateTo = searchParams.get("dateTo");
    if (!validDate(dateFrom) || !validDate(dateTo) || dateFrom > dateTo) {
      return Response.json({ error: "dateFrom and dateTo must be a valid date range" }, { status: 400 });
    }
    return Response.json(await listProductionCostCandidates({ dateFrom, dateTo }));
  } catch (error) {
    return jsonError(error);
  }
}
