import { jsonError, readJson } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import {
  createPieceRatePrisonReceipt,
  listPieceRatePrisonReceipts,
} from "@/features/attendance/services/pieceRatePrisonReceiptService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


export async function GET(request) {
  try {
    await requireTaskPermission(request, "production-piece-rate-prison-receipt-view");
    return Response.json(await listPieceRatePrisonReceipts());
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const [permission, body] = await Promise.all([
      requireTaskPermission(request, "production-piece-rate-prison-receipt-write"),
      readJson(request),
    ]);
    const result = await createPieceRatePrisonReceipt(permission, body);
    return Response.json(result, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
