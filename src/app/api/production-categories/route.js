import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeParam } from "@/lib/validation";

export async function GET(request) {
  try {
    await requirePermissionKeys(request, [
      "production-line-settings-view",
      "production-line-settings-manage",
      "production-line-bom-view",
      "production-line-bom-manage",
    ]);
    const { searchParams } = new URL(request.url);
    const search = normalizeParam(searchParams.get("search")) ?? "";
    const includeInactive = searchParams.get("includeInactive") === "true";

    const supabaseAdmin = getSupabaseAdmin();
    let query = supabaseAdmin
      .from("production_categories")
      .select("id,code,name,description,is_active,created_at,updated_at")
      .order("name", { ascending: true });

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }

    if (search) {
      query = query.or(`code.ilike.%${search}%,name.ilike.%${search}%`);
    }

    const { data: categories, error } = await query;
    if (error) {
      return Response.json({ error: "Failed to load categories" }, { status: 500 });
    }

    const ids = (categories ?? []).map((row) => row.id);
    const countMap = new Map();
    if (ids.length) {
      const { data: counts, error: countError } = await supabaseAdmin
        .from("production_category_products")
        .select("category_id")
        .in("category_id", ids);
      if (countError) {
        return Response.json({ error: "Failed to load category counts" }, { status: 500 });
      }
      (counts ?? []).forEach((row) => {
        countMap.set(row.category_id, (countMap.get(row.category_id) ?? 0) + 1);
      });
    }

    const payload = (categories ?? []).map((row) => ({
      ...row,
      product_count: countMap.get(row.id) ?? 0,
    }));

    return Response.json({ data: payload });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const { userId } = await requirePermissionKeys(request, [
      "production-line-settings-manage",
    ]);
    const body = await readJson(request);
    const code = normalizeParam(body.code);
    const name = normalizeParam(body.name);
    const description = normalizeParam(body.description) ?? null;
    const isActive = body.is_active !== false;

    if (!code || !name) {
      return Response.json({ error: "Code and name are required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: existing, error: existingError } = await supabaseAdmin
      .from("production_categories")
      .select("id,code,name")
      .or(`code.eq.${code},name.eq.${name}`)
      .maybeSingle();
    if (existingError) {
      return Response.json({ error: "Failed to validate category" }, { status: 500 });
    }
    if (existing) {
      const conflictField = existing.code === code ? "code" : "name";
      return Response.json({ error: `Duplicate ${conflictField}` }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin
      .from("production_categories")
      .insert({
        code,
        name,
        description,
        is_active: isActive,
        created_by: userId,
        updated_by: userId,
      })
      .select("id,code,name,description,is_active,created_at,updated_at")
      .maybeSingle();

    if (error) {
      return Response.json({ error: "Failed to create category" }, { status: 500 });
    }

    return Response.json({ data });
  } catch (error) {
    return jsonError(error);
  }
}
