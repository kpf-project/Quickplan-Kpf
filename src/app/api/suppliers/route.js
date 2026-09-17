import { jsonError } from "@/lib/adminApi";
import { toJsonResponse } from "@/lib/result";
import { listSuppliers } from "@/features/suppliers/services/suppliersService";

export async function GET(request) {
  try {
    const result = await listSuppliers(request);
    return toJsonResponse(result);
  } catch (error) {
    return jsonError(error);
  }
}
