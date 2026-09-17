import { cancelScaleReceipt } from "@/lib/scale/receipts";
import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SCALE_RECEIPT_MANAGE_PERMISSION_KEYS = [
  "production-line-attendance-manage",
];

export async function POST(request, { params }) {
  try {
    const permission = await requirePermissionKeys(
      request,
      SCALE_RECEIPT_MANAGE_PERMISSION_KEYS
    );
    const body = await readJson(request);
    const routeParams = await params;

    const receipt = await cancelScaleReceipt(getSupabaseAdmin(), {
      receiptId: routeParams?.receiptId,
      actorUserId: permission.userId,
      voidReason: body?.voidReason,
    });

    return Response.json({
      data: receipt,
    });
  } catch (error) {
    return jsonError(error);
  }
}
