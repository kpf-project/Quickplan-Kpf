import { jsonError } from "@/lib/adminApi";
import { toJsonResponse } from "@/lib/result";
import { listSkuMinMax } from "@/features/sku-min-max/services/skuMinMaxService";

export async function GET(request) {
  try {
    const result = await listSkuMinMax(request);
    return toJsonResponse(result);
  } catch (error) {
    return jsonError(error);
  }
}
