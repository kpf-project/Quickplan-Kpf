import { jsonError } from "@/lib/adminApi";
import { toJsonResponse } from "@/lib/result";
import { listSkuMinMaxBySku } from "@/features/sku-min-max/services/skuMinMaxService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const result = await listSkuMinMaxBySku(request);
    return toJsonResponse(result);
  } catch (error) {
    return jsonError(error);
  }
}
