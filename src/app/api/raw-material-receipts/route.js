import { jsonError } from "@/lib/adminApi";
import { toJsonResponse } from "@/lib/result";
import { listRawMaterialReceipts } from "@/features/raw-materials/services/rawMaterialsService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    return toJsonResponse(await listRawMaterialReceipts(request));
  } catch (error) {
    return jsonError(error);
  }
}
