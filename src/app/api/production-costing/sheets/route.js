import { jsonError } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { listCostSheets, saveCostSheet } from "@/lib/productionCostingService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    await requireTaskPermission(request, "production-cost-view");
    const { searchParams } = new URL(request.url);

    const search = searchParams.get("search") || "";
    const dateFrom = searchParams.get("dateFrom") || null;
    const dateTo = searchParams.get("dateTo") || null;
    const costType = searchParams.get("costType") || null;
    const stageKey = searchParams.get("stageKey") || null;
    const status = searchParams.get("status") || null;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const pageSize = parseInt(searchParams.get("pageSize") || "20", 10);

    const result = await listCostSheets({
      search,
      dateFrom,
      dateTo,
      costType,
      stageKey,
      status,
      page,
      pageSize,
    });

    return Response.json(result);
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const auth = await requireTaskPermission(request, "production-cost-write");
    const body = await request.json();

    const saved = await saveCostSheet(body, auth.user || { name: "User" });
    return Response.json({ ok: true, data: saved });
  } catch (error) {
    return jsonError(error);
  }
}
