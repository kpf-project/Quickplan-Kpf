import { jsonError } from "@/lib/adminApi";
import { listPieceRateGroupDocuments } from "@/features/attendance/services/pieceRateWorkService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const result = await listPieceRateGroupDocuments(request);
    return Response.json(result, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}
