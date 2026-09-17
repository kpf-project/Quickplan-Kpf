import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";

export async function GET(request) {
  try {
    await requirePermissionKeys(request, [
      "production-line-planning-view",
      "production-line-planning-manage",
      "plan.view_all",
      "plan.publish_master",
      "plan.edit_own_dept",
    ]);

    const supabaseAdmin = getSupabaseAdmin();
    const [categoriesResult, mappingsResult] = await Promise.all([
      supabaseAdmin
        .from("production_categories")
        .select("id,code,name,description")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name", { ascending: true }),
      supabaseAdmin
        .from("production_category_products")
        .select("category_id,sku_code")
        .order("category_id", { ascending: true })
        .order("sku_code", { ascending: true }),
    ]);

    if (categoriesResult.error) {
      return Response.json({ error: "Failed to load planning categories" }, { status: 500 });
    }
    if (mappingsResult.error) {
      return Response.json({ error: "Failed to load planning category mappings" }, { status: 500 });
    }

    return Response.json({
      data: {
        categories: categoriesResult.data ?? [],
        mappings: mappingsResult.data ?? [],
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
