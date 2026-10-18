import { jsonError } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import {
  getCostingMasterPlanOverview,
  listCostingMasterPlans,
} from "@/lib/productionCostingService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    await requireTaskPermission(request, "production-cost-view");
    const masterPlanNo = new URL(request.url).searchParams.get("masterPlanNo");
    const data = masterPlanNo
      ? await getCostingMasterPlanOverview(masterPlanNo)
      : await listCostingMasterPlans();
    return Response.json({ data });
  } catch (error) {
    return jsonError(error);
  }
}
