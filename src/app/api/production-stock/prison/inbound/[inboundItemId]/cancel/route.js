import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import {
  cancelProductionPrisonInboundItem,
  loadProductionPrisonInboundCancelPageData,
} from "@/lib/production-prison";
import { ok, toJsonResponse } from "@/lib/result";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function POST(request, context) {
  try {
    const permission = await requireTaskPermission(request, "production-prison-inbound-cancel");
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
