import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { logAuditEvent } from "@/lib/auditLog";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import {
  cancelProductionStockIssueItem,
  loadProductionStockIssuePageData,
} from "@/lib/production-stock-issues";
import { ok, toJsonResponse } from "@/lib/result";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRODUCTION_STOCK_MANAGE_PERMISSION_KEYS = [
  "production-line-attendance-manage",
];

export async function POST(request, { params }) {
  let actorId = null;
  let issueItemId = null;
  let body = null;
  let operationCompleted = false;
  try {
    const permission = await requirePermissionKeys(
      request,
      PRODUCTION_STOCK_MANAGE_PERMISSION_KEYS
    );
    actorId = permission.userId;
    body = await readJson(request);
    const resolvedParams = await params;
    issueItemId = resolvedParams?.issueItemId || null;

    const cancelledIssue = await cancelProductionStockIssueItem(
      {
        issueItemId,
        voidReason: body?.voidReason,
        actorUserId: permission.userId,
      },
      getSupabaseAdmin()
    );
    operationCompleted = true;
    await logAuditEvent({
      actorId,
      action: "production-stock.issue-cancel.success",
      targetTable: "production_stock_issue_items",
      targetId: issueItemId,
      metadata: { voidReason: body?.voidReason || null },
    });

    const pageData = await loadProductionStockIssuePageData(getSupabaseAdmin());

    return toJsonResponse(
      ok({
        cancelledIssue,
        recentIssues: pageData.recentIssues,
        summary: pageData.summary,
        todayIssueDate: pageData.todayIssueDate,
      })
    );
  } catch (error) {
    if (!operationCompleted) {
      await logAuditEvent({
        actorId,
        action: "production-stock.issue-cancel.failure",
        targetTable: "production_stock_issue_items",
        targetId: issueItemId,
        metadata: {
          voidReason: body?.voidReason || null,
          error: error?.message || String(error),
        },
      });
    }
    return jsonError(error);
  }
}
