import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { logAuditEvent } from "@/lib/auditLog";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import {
  createProductionStockIssue,
  loadProductionStockIssuePageData,
} from "@/lib/production-stock-issues";
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
const PRODUCTION_STOCK_MANAGE_PERMISSION_KEYS = [
  "production-line-attendance-manage",
];

export async function GET(request) {
  try {
    await requirePermissionKeys(request, PRODUCTION_STOCK_PERMISSION_KEYS);
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
    const permission = await requirePermissionKeys(
      request,
      PRODUCTION_STOCK_MANAGE_PERMISSION_KEYS
    );
    actorId = permission.userId;
    body = await readJson(request);

    const issue = await createProductionStockIssue(
      {
        barcode: body?.barcode,
        issueType: body?.issueType,
        remark: body?.remark,
        issueDate: body?.issueDate,
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
          error: error?.message || String(error),
          negativeLotBlocked: String(error?.message || "").includes("คงเหลือไม่พอ"),
        },
      });
    }
    return jsonError(error);
  }
}
