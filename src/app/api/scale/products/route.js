import { jsonError } from "@/lib/adminApi";
import { loadScaleProductsData } from "@/lib/scale/products";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json({
      data: await loadScaleProductsData(),
    });
  } catch (error) {
    return jsonError(error);
  }
}
