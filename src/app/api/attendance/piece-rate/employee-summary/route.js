import { jsonError } from "@/lib/adminApi";
import { getPieceRateEmployeeSummaryDetails } from "@/features/attendance/services/pieceRateWorkService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const result = await getPieceRateEmployeeSummaryDetails(request);
    return Response.json(result, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}
