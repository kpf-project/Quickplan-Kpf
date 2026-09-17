import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import {
  createProductionPrisonIssuesBatch,
  loadProductionPrisonIssuePageData,
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

export async function POST(request) {
  try {
    const permission = await requirePermissionKeys(request, PRODUCTION_STOCK_PERMISSION_KEYS);
    const body = await readJson(request);
    const supabaseAdmin = getSupabaseAdmin();

    const batch = await createProductionPrisonIssuesBatch(
      {
        barcodes: body?.barcodes,
        remark: body?.remark,
        actorUserId: permission.userId,
        issuedAt: body?.issuedAt,
      },
      supabaseAdmin
    );

    const clientIssuedAt = body?.issuedAt ? new Date(body.issuedAt) : new Date();
    const clientIssueDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(clientIssuedAt);

    const pageData = await loadProductionPrisonIssuePageData(supabaseAdmin, clientIssueDate);

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
    return jsonError(error);
  }
}
