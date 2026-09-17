import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import {
  cancelProductionPrisonInboundItem,
  loadProductionPrisonInboundCancelPageData,
} from "@/lib/production-prison";
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

export async function POST(request, context) {
  try {
    const permission = await requirePermissionKeys(request, PRODUCTION_STOCK_PERMISSION_KEYS);
    const params = await context.params;

    const issue = await cancelProductionPrisonInboundItem(
      {
        inboundItemId: params?.inboundItemId,
        actorUserId: permission.userId,
      },
      getSupabaseAdmin()
    );

    const pageData = await loadProductionPrisonInboundCancelPageData(getSupabaseAdmin());

    return toJsonResponse(
      ok({
        issue,
        recentIssues: pageData.rows,
        summary: pageData.summary,
        todayIssueDate: pageData.todayIssueDate,
      })
    );
  } catch (error) {
    return jsonError(error);
  }
}
