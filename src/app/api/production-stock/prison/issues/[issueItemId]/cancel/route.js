import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import {
  cancelProductionPrisonIssueItem,
  loadProductionPrisonIssuePageData,
} from "@/lib/production-prison";
import { ok, toJsonResponse } from "@/lib/result";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function POST(request, context) {
  try {
    const permission = await requireTaskPermission(request, "production-prison-issue-cancel");
    const params = await context.params;

    const issue = await cancelProductionPrisonIssueItem(
      {
        issueItemId: params?.issueItemId,
        actorUserId: permission.userId,
      },
      getSupabaseAdmin()
    );

    const pageData = await loadProductionPrisonIssuePageData(getSupabaseAdmin());

    return toJsonResponse(
      ok({
        issue,
        recentIssues: pageData.recentIssues,
        summary: pageData.summary,
        todayIssueDate: pageData.todayIssueDate,
      })
    );
  } catch (error) {
    return jsonError(error);
  }
}
