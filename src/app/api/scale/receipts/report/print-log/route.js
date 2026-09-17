import { ApiError, jsonError } from "@/lib/adminApi";
import { logAuditEvent } from "@/lib/auditLog";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { validateWeightScaleReportPrintLog } from "@/lib/weight-scale-report-print-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCALE_RECEIPT_PERMISSION_KEYS = [
  "production-line-attendance-view",
  "production-line-attendance-manage",
  "production-line-attendance-report-view",
  "production-line-attendance-report-manage",
  "production-line-settings-view",
  "production-line-settings-manage",
];

export async function POST(request) {
  try {
    const actor = await requirePermissionKeys(request, SCALE_RECEIPT_PERMISSION_KEYS);
    let body;
    try {
      body = await request.json();
    } catch (error) {
      throw new ApiError(400, "Invalid JSON body");
    }

    let printLog;
    try {
      printLog = validateWeightScaleReportPrintLog(body);
    } catch (error) {
      throw new ApiError(400, error?.message || "Invalid print log");
    }

    await logAuditEvent({
      actorId: actor.userId,
      action: "production.weight_scale.report.print",
      targetTable: "production_weight_receipts",
      metadata: printLog,
    });

    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
