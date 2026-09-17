import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { importProductionStockOpeningBalances } from "@/lib/production-stock-opening-balances";
import { ok, toJsonResponse } from "@/lib/result";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRODUCTION_STOCK_PERMISSION_KEYS = [
  "production-line-attendance-view",
  "production-line-attendance-manage",
  "production-line-attendance-report-view",
  "production-line-attendance-report-manage",
  "production-line-settings-view",
  "production-line-settings-manage",
];

export async function POST(request) {
  try {
    const permissionContext = await requirePermissionKeys(
      request,
      PRODUCTION_STOCK_PERMISSION_KEYS
    );
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
