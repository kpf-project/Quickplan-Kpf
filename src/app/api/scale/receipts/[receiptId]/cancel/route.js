import { cancelScaleReceipt } from "@/lib/scale/receipts";
import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { logAuditEvent } from "@/lib/auditLog";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function POST(request, { params }) {
  let actorId = null;
  let receiptId = null;

  try {
    const permission = await requireTaskPermission(request, "production-scale-receipt-cancel");
    actorId = permission.userId;
    const body = await readJson(request);
    const routeParams = await params;
    receiptId = routeParams?.receiptId || null;

    const receipt = await cancelScaleReceipt(getSupabaseAdmin(), {
      receiptId,
      actorUserId: actorId,
      voidReason: body?.voidReason,
    });

    await logAuditEvent({
      actorId,
      action: "production.weight_scale.cancel.success",
      targetTable: "production_weight_receipts",
      targetId: receipt.id,
      metadata: {
        barcode: receipt.barcode,
        alreadyCancelled: receipt.alreadyCancelled,
      },
    });

    return Response.json({
      data: receipt,
    });
  } catch (error) {
    await logAuditEvent({
      actorId,
      action: "production.weight_scale.cancel.failure",
      targetTable: "production_weight_receipts",
      targetId: receiptId,
      metadata: {
        error: error?.message || String(error),
      },
    });
    return jsonError(error);
  }
}
