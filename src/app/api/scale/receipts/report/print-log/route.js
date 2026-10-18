import { ApiError, jsonError } from "@/lib/adminApi";
import { logAuditEvent } from "@/lib/auditLog";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { validateWeightScaleReportPrintLog } from "@/lib/weight-scale-report-print-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function POST(request) {
  try {
    const actor = await requireTaskPermission(request, "production-scale-receipt-report");
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
