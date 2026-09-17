import { jsonError, readJson } from "@/lib/adminApi";
import { cancelPieceRateStockIssue } from "@/features/attendance/services/pieceRateStockService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await readJson(request);
    const result = await cancelPieceRateStockIssue(request, body);
    return Response.json(result, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}
