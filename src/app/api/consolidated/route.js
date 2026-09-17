import { jsonError } from "@/lib/adminApi";
import { toJsonResponse } from "@/lib/result";
import { listConsolidated } from "@/features/hr/services/consolidatedService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const result = await listConsolidated(request);
    return toJsonResponse(result);
  } catch (error) {
    console.error("Consolidated API Error:", error);
    return jsonError(error);
  }
}
