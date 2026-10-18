import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { logAuditEvent } from "@/lib/auditLog";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import {
  createProductionStockIssue,
  loadProductionStockIssuePageData,
} from "@/lib/production-stock-issues";
import { ok, toJsonResponse } from "@/lib/result";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function GET(request) {
  try {
    await requireTaskPermission(request, "production-stock-issue-view");
    const payload = await loadProductionStockIssuePageData(getSupabaseAdmin());
    return toJsonResponse(ok(payload));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  let actorId = null;
  let body = null;
  let operationCompleted = false;
  try {
    const permission = await requireTaskPermission(request, "production-stock-issue-write");
    actorId = permission.userId;
    body = await readJson(request);

    const issue = await createProductionStockIssue(
      {
        barcode: body?.barcode,
        issueType: body?.issueType,
        remark: body?.remark,
        issueDate: body?.issueDate,
        destinationRoomCode: body?.destinationRoomCode,
        actorUserId: permission.userId,
      },
      getSupabaseAdmin()
    );
    operationCompleted = true;
    await logAuditEvent({
      actorId,
      action: "production-stock.issue.success",
      targetTable: "production_stock_issue_items",
      targetId: issue?.issueItemId || null,
      metadata: {
        barcode: body?.barcode || null,
        issueType: body?.issueType || null,
        issueDate: issue?.issueDate || body?.issueDate || null,
        destinationRoomCode: issue?.destinationRoomCode || null,
      },
    });

    const pageData = await loadProductionStockIssuePageData(getSupabaseAdmin());

    return toJsonResponse(
      ok({
        issue,
        recentIssues: pageData.recentIssues,
        summary: pageData.summary,
        todayIssueDate: pageData.todayIssueDate,
      })
    );
  } catch (error) {
    if (!operationCompleted) {
      await logAuditEvent({
        actorId,
        action: "production-stock.issue.failure",
        metadata: {
          barcode: body?.barcode || null,
          issueType: body?.issueType || null,
          issueDate: body?.issueDate || null,
          destinationRoomCode: body?.destinationRoomCode || null,
          error: error?.message || String(error),
          negativeLotBlocked: String(error?.message || "").includes("คงเหลือไม่พอ"),
        },
      });
    }
    return jsonError(error);
  }
}
