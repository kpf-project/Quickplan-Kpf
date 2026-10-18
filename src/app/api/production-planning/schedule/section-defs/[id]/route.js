import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { dateLayoutKey, normalizeDateLayout } from "@/lib/scheduleDateLayout";
import { formulaLayoutKey, normalizeFormulaLayout } from "@/lib/scheduleFormulaLayout";
import { columnColorsKey, normalizeColumnColors } from "@/lib/scheduleColumnColors";

export const dynamic = "force-dynamic";

// PUT  /api/production-planning/schedule/section-defs/[id]
export async function PUT(request, { params }) {
  try {
    await requirePermissionKeys(request, ["production-line-planning-manage"]);
    const { id } = await params;
    const body = await readJson(request);
    const patch = {};
    if (body?.name !== undefined)         patch.name          = String(body.name).trim();
    if (body?.colorTheme !== undefined)   patch.color_theme   = body.colorTheme;
    if (body?.displayOrder !== undefined) patch.display_order = Number(body.displayOrder);

    const db = getSupabaseAdmin();
    if (body?.formulaLayout !== undefined || body?.dateLayout !== undefined || body?.columnColors !== undefined) {
      const settings = [], configured = {};
      try {
        if (body.formulaLayout !== undefined) configured.formula_layout = normalizeFormulaLayout(body.formulaLayout);
        if (body.dateLayout !== undefined) configured.date_layout = normalizeDateLayout(body.dateLayout);
        if (body.columnColors !== undefined) configured.column_colors = normalizeColumnColors(body.columnColors);
      } catch (error) { return NextResponse.json({ error: error.message }, { status: 400 }); }
      const section = await db.from("production_schedule_section_defs").select("id").eq("id", id).maybeSingle();
      if (section.error) throw section.error;
      if (!section.data) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (configured.formula_layout || configured.column_colors) {
        const { data: columns, error: columnsError } = await db.from("production_schedule_column_defs").select("id,col_type").eq("section_def_id", id);
        if (columnsError) throw columnsError;
        const formulaIds = new Set((columns || []).filter(col => col.col_type === "sku_picker").map(col => `formula:${col.id}`));
        const columnIds = new Set([...(columns || []).map(col => col.id), ...formulaIds]);
        if (Object.keys(configured.formula_layout || {}).some(key => !formulaIds.has(key)) || Object.keys(configured.column_colors || {}).some(key => !columnIds.has(key))) return NextResponse.json({ error: "คอลัมน์ไม่อยู่ในส่วนงานนี้" }, { status: 400 });
      }
      for (const [field, key] of [["formula_layout", formulaLayoutKey(id)], ["date_layout", dateLayoutKey(id)], ["column_colors", columnColorsKey(id)]]) {
        if (configured[field]) settings.push({ setting_key: key, setting_value: configured[field], updated_at: new Date().toISOString() });
      }
      const result = await db.from("system_settings").upsert(settings, { onConflict: "setting_key" });
      if (result.error) throw result.error;
      if (!Object.keys(patch).length) return NextResponse.json({ ok: true, data: { ...section.data, ...configured } });
    }
    const { data, error } = await db
      .from("production_schedule_section_defs")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data)  return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// DELETE /api/production-planning/schedule/section-defs/[id]
export async function DELETE(request, { params }) {
  try {
    await requirePermissionKeys(request, ["production-line-planning-manage"]);
    const { id } = await params;
    const db = getSupabaseAdmin();
    const { error } = await db
      .from("production_schedule_section_defs")
      .delete()
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
