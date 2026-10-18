import { jsonError } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { buildFlourCostDraft } from "@/lib/productionCostingService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    await requireTaskPermission(request, "production-cost-view");
    const { searchParams } = new URL(request.url);

    const lotNo = searchParams.get("lotNo");
    if (!lotNo) {
      return Response.json({ ok: false, error: "lotNo parameter is required" }, { status: 400 });
    }

    const draft = await buildFlourCostDraft(lotNo);
    return Response.json({ ok: true, data: draft });
  } catch (error) {
    return jsonError(error);
  }
}
