import { jsonError } from "@/lib/adminApi";
import { listPieceRateRevisions } from "@/features/attendance/services/pieceRateWorkService";
import { normalizeParam } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const logId = normalizeParam(id);
    if (!logId) {
      return Response.json({ error: "log id is required" }, { status: 400 });
    }

    const result = await listPieceRateRevisions(request, logId);
    return Response.json(result, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}
