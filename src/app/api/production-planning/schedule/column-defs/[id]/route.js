import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeHighlightColor } from "@/features/production-planning/services/scheduleHighlightColors";

export const dynamic = "force-dynamic";

// PUT  /api/production-planning/schedule/column-defs/[id]
export async function PUT(request, { params }) {
  try {
    await requirePermissionKeys(request, ["production-line-planning-manage"]);
    const { id } = await params;
    const body = await readJson(request);
    if (body?.highlightColor != null && body.highlightColor !== "" && !normalizeHighlightColor(body.highlightColor)) return NextResponse.json({ error: "Invalid highlight color; use a HEX color" }, { status: 400 });
    const patch = {};
    if (body?.label          !== undefined) patch.label          = String(body.label).trim();
    if (body?.colType        !== undefined) patch.col_type        = body.colType;
    if (body?.width          !== undefined) patch.width          = body.width ?? null;
    if (body?.highlightColor !== undefined) patch.highlight_color = normalizeHighlightColor(body.highlightColor);
    if (body?.groupLabel     !== undefined) patch.group_label     = body.groupLabel ?? null;
    if (body?.groupOrder     !== undefined) patch.group_order     = body.groupOrder ?? null;
    if (body?.autoFillField  !== undefined) patch.auto_fill_field = body.autoFillField ?? null;
    if (body?.isRequired     !== undefined) patch.is_required     = Boolean(body.isRequired);
    if (body?.displayOrder   !== undefined) patch.display_order   = Number(body.displayOrder);

    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("production_schedule_column_defs")
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

// DELETE /api/production-planning/schedule/column-defs/[id]
export async function DELETE(request, { params }) {
  try {
    await requirePermissionKeys(request, ["production-line-planning-manage"]);
    const { id } = await params;
    const db = getSupabaseAdmin();
    const { error } = await db
      .from("production_schedule_column_defs")
      .delete()
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
