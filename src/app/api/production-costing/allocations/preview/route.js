import { jsonError, readJson } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { buildBomAllocationPreview } from "@/lib/productionCostingService";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    await requireTaskPermission(request, "production-cost-view");
    const body = await readJson(request);
    return Response.json({ data: await buildBomAllocationPreview(body) });
  } catch (error) {
    return jsonError(error);
  }
}
