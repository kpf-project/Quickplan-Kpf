import { jsonError, readJson } from "@/lib/adminApi";
import { issuePieceRateReportPrintDocument } from "@/features/attendance/services/pieceRateWorkService";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await readJson(request);
    const result = await issuePieceRateReportPrintDocument(request, body);
    return Response.json(result, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}
