import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { logAuditEvent } from "@/lib/auditLog";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { cancelScaleReceiptByBarcode } from "@/lib/scale/receipts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function POST(request) {
  let actorId = null;
  let barcode = null;

  try {
    const permission = await requireTaskPermission(request, "production-scale-receipt-cancel");
    actorId = permission.userId;
    const body = await readJson(request);
    barcode = String(body?.barcode || "").trim() || null;

    const receipt = await cancelScaleReceiptByBarcode(getSupabaseAdmin(), {
      barcode,
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

    return Response.json({ data: receipt });
  } catch (error) {
    await logAuditEvent({
      actorId,
      action: "production.weight_scale.cancel.failure",
      metadata: {
        barcode,
        error: error?.message || String(error),
      },
    });
    return jsonError(error);
  }
}
