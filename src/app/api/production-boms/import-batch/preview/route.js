import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { loadBomImportCatalog } from "@/lib/bomImportCatalogServer";
import {
  normalizeMode,
  normalizeStrategy,
} from "@/lib/bomImportHelpers";
import { prepareBomImportProducts } from "@/lib/bomImportServer";
import { requirePermissionKeys } from "@/lib/permissionGuard";

export async function POST(request) {
  try {
    await requirePermissionKeys(request, ["production-line-bom-manage"]);
    const body = await readJson(request);
    const products = Array.isArray(body.products) ? body.products : [];
    if (!products.length) {
      return Response.json(
        { error: "ต้องมีข้อมูลสินค้าอย่างน้อย 1 รายการ" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    const catalog = await loadBomImportCatalog({ supabaseAdmin, products });
    const result = await prepareBomImportProducts({
      products,
      catalog,
      mode: normalizeMode(body.mode),
      strategy: normalizeStrategy(body.strategy),
    });

    return Response.json(result, {
      status: result.hasErrors ? 207 : 200,
    });
  } catch (error) {
    return jsonError(error);
  }
}
