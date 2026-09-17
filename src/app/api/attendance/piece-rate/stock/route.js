import { jsonError, readJson } from "@/lib/adminApi";
import {
  createPieceRateStockIssue,
  lookupPieceRateStockDocument,
  getBiscuitFgProducts,
  listAvailablePieceRateStockLabels,
} from "@/features/attendance/services/pieceRateStockService";
import { normalizeParam } from "@/lib/validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = normalizeParam(searchParams.get("action"));
    if (action === "biscuit-products") {
      const result = await getBiscuitFgProducts(request);
      return Response.json(result, { status: 200 });
    }
    if (action === "available-labels") {
      const productCode = normalizeParam(searchParams.get("productCode"));
      const result = await listAvailablePieceRateStockLabels(request, productCode);
      return Response.json(result, { status: 200 });
    }
    const barcode = normalizeParam(searchParams.get("barcode"));
    const result = await lookupPieceRateStockDocument(request, barcode);
    return Response.json(result, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const body = await readJson(request);
    const result = await createPieceRateStockIssue(request, body);
    return Response.json(result, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
