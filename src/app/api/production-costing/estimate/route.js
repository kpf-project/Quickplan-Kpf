import { jsonError } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import {
  buildMaterialCostEstimate,
  listMaterialEstimateProducts,
} from "@/lib/productionCostingService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    await requireTaskPermission(request, "production-cost-view");
    return Response.json({ data: await listMaterialEstimateProducts() });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    await requireTaskPermission(request, "production-cost-view");
    return Response.json({ data: await buildMaterialCostEstimate(await request.json()) });
  } catch (error) {
    return jsonError(error);
  }
}
