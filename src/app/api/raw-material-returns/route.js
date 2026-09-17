import { jsonError } from "@/lib/adminApi";
import { toJsonResponse } from "@/lib/result";
import { listRawMaterialReturns } from "@/features/raw-materials/services/rawMaterialsService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const result = await listRawMaterialReturns(request);
    return toJsonResponse(result);
  } catch (error) {
    return jsonError(error);
  }
}
