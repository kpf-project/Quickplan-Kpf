import { jsonError } from "@/lib/adminApi";
import { getPieceRateOfflineMaster } from "@/features/attendance/services/pieceRateWorkService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const result = await getPieceRateOfflineMaster(request);
    return Response.json(result, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}
