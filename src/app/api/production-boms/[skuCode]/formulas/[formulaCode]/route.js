import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { prepareBomFormulaMutation } from "@/lib/bomFormulaManagement";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeParam } from "@/lib/validation";

export async function PATCH(request, { params }) {
  try {
    const { userId } = await requirePermissionKeys(request, [
      "production-line-bom-manage",
    ]);
    const { skuCode, formulaCode } = await params;
    const normalizedSku = normalizeParam(skuCode)?.toUpperCase();
    const body = await readJson(request);
    const mutation = prepareBomFormulaMutation({
      action: body?.action,
      formulaCode,
      formulaName: body?.formulaName ?? body?.formula_name,
    });

    if (!normalizedSku) {
      return Response.json({ error: "skuCode is required" }, { status: 400 });
    }
    if (!mutation.ok) {
      return Response.json({ error: mutation.error }, { status: mutation.status });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data: bom, error: bomError } = await supabaseAdmin
      .from("production_boms")
      .select("id")
      .eq("sku_code", normalizedSku)
      .maybeSingle();
    if (bomError) {
      return Response.json({ error: "Failed to load bom" }, { status: 500 });
    }
    if (!bom?.id) {
      return Response.json({ error: "BOM not found" }, { status: 404 });
    }

    const { data: latestVersion, error: versionLookupError } = await supabaseAdmin
      .from("production_bom_versions")
      .select("id,formula_name")
      .eq("bom_id", bom.id)
      .eq("formula_code", mutation.formulaCode)
      .order("version_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (versionLookupError) {
      return Response.json({ error: "Failed to load formula" }, { status: 500 });
    }
    if (!latestVersion?.id) {
      return Response.json({ error: "Formula not found" }, { status: 404 });
    }

    if (mutation.action === "rename") {
      const { error: formulaError } = await supabaseAdmin
        .from("production_bom_formulas")
        .upsert({
          bom_id: bom.id,
          formula_code: mutation.formulaCode,
          formula_name: mutation.formulaName,
          is_active: true,
          is_default: mutation.formulaCode === "DEFAULT",
          updated_by: userId,
        }, { onConflict: "bom_id,formula_code" });
      if (formulaError) {
        return Response.json({ error: "Failed to rename formula" }, { status: 500 });
      }

      const { error: versionsError } = await supabaseAdmin
        .from("production_bom_versions")
        .update({ formula_name: mutation.formulaName })
        .eq("bom_id", bom.id)
        .eq("formula_code", mutation.formulaCode);
      if (versionsError) {
        return Response.json({ error: "Failed to update formula versions" }, { status: 500 });
      }

      return Response.json({
        ok: true,
        formulaCode: mutation.formulaCode,
        formulaName: mutation.formulaName,
      });
    }

    const now = new Date().toISOString();
    const { error: formulaError } = await supabaseAdmin
      .from("production_bom_formulas")
      .upsert({
        bom_id: bom.id,
        formula_code: mutation.formulaCode,
        formula_name: String(latestVersion.formula_name || mutation.formulaCode).trim(),
        is_active: false,
        is_default: false,
        updated_by: userId,
      }, { onConflict: "bom_id,formula_code" });
    if (formulaError) {
      return Response.json({ error: "Failed to deactivate formula" }, { status: 500 });
    }

    const { error: versionsError } = await supabaseAdmin
      .from("production_bom_versions")
      .update({ deleted_at: now, deleted_by: userId })
      .eq("bom_id", bom.id)
      .eq("formula_code", mutation.formulaCode)
      .is("deleted_at", null);
    if (versionsError) {
      return Response.json({ error: "Failed to deactivate formula versions" }, { status: 500 });
    }

    return Response.json({ ok: true, formulaCode: mutation.formulaCode });
  } catch (error) {
    return jsonError(error);
  }
}
