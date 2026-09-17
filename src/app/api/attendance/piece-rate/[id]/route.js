import { jsonError, readJson } from "@/lib/adminApi";
import {
  cancelPieceRateLog,
  updatePieceRateLog,
} from "@/features/attendance/services/pieceRateWorkService";
import { normalizeParam } from "@/lib/validation";

export const dynamic = "force-dynamic";

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const logId = normalizeParam(id);
    if (!logId) {
      return Response.json({ error: "log id is required" }, { status: 400 });
    }

    const body = await readJson(request);
    const result = await updatePieceRateLog(request, logId, body);
    return Response.json(result, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request, { params }) {
  try {
    const { id } = await params;
    const logId = normalizeParam(id);
    if (!logId) {
      return Response.json({ error: "log id is required" }, { status: 400 });
    }

    const body = await readJson(request);
    const result = await cancelPieceRateLog(request, logId, body);
    return Response.json(result, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}
