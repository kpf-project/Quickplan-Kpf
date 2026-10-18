import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { normalizeParam } from "@/lib/validation";

export async function PUT(request, { params }) {
  try {
    const { userId } = await requireTaskPermission(request, "production-settings-categories-edit");
    const { id } = await params;
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
      .neq("id", id)
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
      .update({
        code,
        name,
        description,
        is_active: isActive,
        updated_by: userId,
      })
      .eq("id", id)
      .select("id,code,name,description,is_active,created_at,updated_at")
      .maybeSingle();

    if (error) {
      return Response.json({ error: "Failed to update category" }, { status: 500 });
    }

    return Response.json({ data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request, { params }) {
  try {
    const { userId } = await requireTaskPermission(request, "production-settings-categories-delete");
    const { id } = await params;
    const supabaseAdmin = getSupabaseAdmin();

    const { data: existingLinks, error: linkError } = await supabaseAdmin
      .from("production_category_products")
      .select("id")
      .eq("category_id", id)
      .limit(1);
    if (linkError) {
      return Response.json({ error: "Failed to verify category usage" }, { status: 500 });
    }
    if (existingLinks && existingLinks.length > 0) {
      return Response.json({ error: "Category has linked products" }, { status: 409 });
    }

    const { data, error } = await supabaseAdmin
      .from("production_categories")
      .update({
        is_active: false,
        deleted_at: new Date().toISOString(),
        deleted_by: userId,
        updated_by: userId,
      })
      .eq("id", id)
      .select("id,code,name,description,is_active,created_at,updated_at")
      .maybeSingle();
    if (error) {
      return Response.json({ error: "Failed to delete category" }, { status: 500 });
    }

    return Response.json({ data });
  } catch (error) {
    return jsonError(error);
  }
}
