import { jsonError } from "@/lib/adminApi";
import { toJsonResponse } from "@/lib/result";
import { listBrandTypes } from "@/features/products/services/brandTypesService";

export async function GET(request) {
  try {
    const result = await listBrandTypes(request);
    return toJsonResponse(result);
  } catch (error) {
    return jsonError(error);
  }
}
