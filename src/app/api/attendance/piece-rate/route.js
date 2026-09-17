import { jsonError, readJson } from "@/lib/adminApi";
import {
  createPieceRateLog,
  listPieceRateReport,
} from "@/features/attendance/services/pieceRateWorkService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const result = await listPieceRateReport(request);
    return Response.json(result, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const body = await readJson(request);
    const result = await createPieceRateLog(request, body);
    return Response.json(result, { status: result.duplicated ? 200 : 201 });
  } catch (error) {
    return jsonError(error);
  }
}
