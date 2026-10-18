import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import {
  createProductionPrisonIssue,
  loadProductionPrisonIssuePageData,
} from "@/lib/production-prison";
import { ok, toJsonResponse } from "@/lib/result";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function GET(request) {
  try {
    await requireTaskPermission(request, "production-prison-issue-view");
    const { searchParams } = new URL(request.url);
    const date = searchParams.get("date") || null;
    const payload = await loadProductionPrisonIssuePageData(getSupabaseAdmin(), date);
    return toJsonResponse(ok(payload));
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const permission = await requireTaskPermission(request, "production-prison-issue-write");
    const body = await readJson(request);

    const issue = await createProductionPrisonIssue(
      {
        barcode: body?.barcode,
        actorUserId: permission.userId,
        issuedAt: body?.issuedAt,
      },
      getSupabaseAdmin()
    );

    const clientIssuedAt = body?.issuedAt ? new Date(body.issuedAt) : new Date();
    const clientIssueDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(clientIssuedAt);

    const pageData = await loadProductionPrisonIssuePageData(getSupabaseAdmin(), clientIssueDate);

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
