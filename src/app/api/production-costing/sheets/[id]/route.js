import { jsonError } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { getCostSheetById, saveCostSheet } from "@/lib/productionCostingService";

export const dynamic = "force-dynamic";

export async function GET(request, context) {
  try {
    await requireTaskPermission(request, "production-cost-view");
    const { id } = await context.params;

    const sheet = await getCostSheetById(id);
    return Response.json({ ok: true, data: sheet });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(request, context) {
  try {
    const auth = await requireTaskPermission(request, "production-cost-write");
    const { id } = await context.params;
    const body = await request.json();

    const saved = await saveCostSheet({ ...body, id }, auth.user || { name: "User" });
    return Response.json({ ok: true, data: saved });
  } catch (error) {
    return jsonError(error);
  }
}
