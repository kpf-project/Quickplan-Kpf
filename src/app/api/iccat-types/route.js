import { jsonError } from "@/lib/adminApi";
import { toJsonResponse } from "@/lib/result";
import { listIccatTypes } from "@/features/products/services/iccatTypesService";

export async function GET(request) {
  try {
    const result = await listIccatTypes(request);
    return toJsonResponse(result);
  } catch (error) {
    return jsonError(error);
  }
}
