import { jsonError } from "@/lib/adminApi";
import { toJsonResponse } from "@/lib/result";
import { listTradeCodes } from "@/features/products/services/tradeCodesService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const result = await listTradeCodes(request);
    return toJsonResponse(result);
  } catch (error) {
    return jsonError(error);
  }
}
