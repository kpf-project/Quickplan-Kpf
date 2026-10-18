import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { logAuditEvent } from "@/lib/auditLog";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import {
  createProductionStockIssuesBatch,
  loadProductionStockIssuePageData,
} from "@/lib/production-stock-issues";
import { ok, toJsonResponse } from "@/lib/result";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function POST(request) {
  let actorId = null;
  let body = null;
  let operationCompleted = false;
  try {
    const permission = await requireTaskPermission(request, "production-stock-issue-write");
    actorId = permission.userId;
    body = await readJson(request);
    const supabaseAdmin = getSupabaseAdmin();

    const batch = await createProductionStockIssuesBatch(
      {
        barcodes: body?.barcodes,
        issueType: body?.issueType,
        remark: body?.remark,
        issueDate: body?.issueDate,
        destinationRoomCode: body?.destinationRoomCode,
        actorUserId: permission.userId,
      },
      supabaseAdmin
    );
    operationCompleted = true;
    await logAuditEvent({
      actorId,
      action: "production-stock.issue-batch.completed",
      metadata: {
        requestedCount: Array.isArray(body?.barcodes) ? body.barcodes.length : 0,
        succeededCount: batch.succeeded.length,
        failedCount: batch.failed.length,
        failed: batch.failed.map(({ barcode, error }) => ({ barcode, error })),
        issueType: body?.issueType || null,
        issueDate: body?.issueDate || null,
        destinationRoomCode: body?.destinationRoomCode || null,
      },
    });

    const pageData = await loadProductionStockIssuePageData(supabaseAdmin);

    return toJsonResponse(
      ok({
        batch,
        issue: batch.succeeded[0] || null,
        recentIssues: pageData.recentIssues,
        summary: pageData.summary,
        todayIssueDate: pageData.todayIssueDate,
      })
    );
  } catch (error) {
    if (!operationCompleted) {
      await logAuditEvent({
        actorId,
        action: "production-stock.issue-batch.failure",
        metadata: {
          requestedCount: Array.isArray(body?.barcodes) ? body.barcodes.length : 0,
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
