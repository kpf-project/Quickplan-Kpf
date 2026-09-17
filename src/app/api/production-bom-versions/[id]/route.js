import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeParam } from "@/lib/validation";

export async function DELETE(request, { params }) {
  try {
    const { userId } = await requirePermissionKeys(request, [
      "production-line-bom-manage",
    ]);
    const { id } = await params;
    const normalizedId = normalizeParam(id);
    if (!normalizedId) {
      return Response.json({ error: "id is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: row, error } = await supabaseAdmin
      .from("production_bom_versions")
      .update({
        deleted_at: new Date().toISOString(),
        deleted_by: userId,
      })
      .eq("id", normalizedId)
      .is("deleted_at", null)
      .select("id")
      .maybeSingle();
    if (error) {
      return Response.json({ error: "Failed to delete version" }, { status: 500 });
    }
    if (!row) {
      return Response.json({ error: "Version not found" }, { status: 404 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
