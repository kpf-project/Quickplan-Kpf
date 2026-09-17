import { jsonError, readJson } from "@/lib/adminApi";
import { cancelPieceRateWeigh } from "@/features/attendance/services/pieceRateStockService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await readJson(request);
    const cancelBody = {
      ...body,
      cancelReason: body.cancelReason
        || body.cancel_reason
        || "ยกเลิกจากหน้าสแกนป้ายแยม",
    };
    const result = await cancelPieceRateWeigh(request, cancelBody);
    return Response.json(result, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}
