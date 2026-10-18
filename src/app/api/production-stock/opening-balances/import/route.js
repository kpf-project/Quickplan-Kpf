import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { importProductionStockOpeningBalances } from "@/lib/production-stock-opening-balances";
import { ok, toJsonResponse } from "@/lib/result";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function POST(request) {
  try {
    const permissionContext = await requireTaskPermission(request, "production-stock-opening-write");
    const payload = await readJson(request);
    const result = await importProductionStockOpeningBalances(
      {
        ...payload,
        actorUserId: permissionContext.userId,
      },
      getSupabaseAdmin()
    );

    return toJsonResponse(ok(result));
  } catch (error) {
    return jsonError(error);
  }
}
