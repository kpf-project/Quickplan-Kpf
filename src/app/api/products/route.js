import { jsonError } from "@/lib/adminApi";
import { toJsonResponse } from "@/lib/result";
import { listProducts } from "@/features/products/services/productsService";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const result = await listProducts(request);
    return toJsonResponse(result);
  } catch (error) {
    return jsonError(error);
  }
}
