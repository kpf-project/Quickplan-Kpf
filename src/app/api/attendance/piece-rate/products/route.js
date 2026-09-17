import { jsonError } from "@/lib/adminApi";
import {
  listEditablePieceRateProducts,
  listPieceRateReportProducts,
} from "@/features/attendance/services/pieceRateWorkService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const scope = String(searchParams.get("scope") || "").trim().toLowerCase();
    const result = scope === "editable"
      ? await listEditablePieceRateProducts(request)
      : await listPieceRateReportProducts(request);
    return Response.json(result, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}
