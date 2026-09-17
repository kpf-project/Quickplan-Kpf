import { jsonError, readJson } from "@/lib/adminApi";
import { createPieceRateStockIssueBatch } from "@/features/attendance/services/pieceRateStockService";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await readJson(request);
    const result = await createPieceRateStockIssueBatch(request, body);
    return Response.json(result, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
