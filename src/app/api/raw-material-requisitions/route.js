import { jsonError } from "@/lib/adminApi";
import { toJsonResponse } from "@/lib/result";
import { listRawMaterialRequisitions } from "@/features/raw-materials/services/rawMaterialsService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const result = await listRawMaterialRequisitions(request);
    return toJsonResponse(result);
  } catch (error) {
    return jsonError(error);
  }
}
