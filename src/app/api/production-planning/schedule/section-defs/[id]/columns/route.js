import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeHighlightColor } from "@/features/production-planning/services/scheduleHighlightColors";

export const dynamic = "force-dynamic";

// POST /api/production-planning/schedule/section-defs/[id]/columns
export async function POST(request, { params }) {
  try {
    await requirePermissionKeys(request, ["production-line-planning-manage"]);
    const { id } = await params;
    const body = await readJson(request);
    if (body?.highlightColor != null && body.highlightColor !== "" && !normalizeHighlightColor(body.highlightColor)) return NextResponse.json({ error: "Invalid highlight color; use a HEX color" }, { status: 400 });
    const key   = String(body?.key   || "").trim().replace(/\s+/g, "_");
    const label = String(body?.label || "").trim();
    if (!key || !label) {
      return NextResponse.json({ error: "key and label are required" }, { status: 400 });
    }

    const db = getSupabaseAdmin();

    const { data: maxRow } = await db
      .from("production_schedule_column_defs")
      .select("display_order")
      .eq("section_def_id", id)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await db
      .from("production_schedule_column_defs")
      .insert({
        section_def_id:  id,
        key,
        label,
        col_type:        body?.colType        ?? "text",
        display_order:   body?.displayOrder   ?? (maxRow?.display_order ?? 0) + 1,
        width:           body?.width          ?? null,
        highlight_color: normalizeHighlightColor(body?.highlightColor),
        group_label:     body?.groupLabel     ?? null,
        group_order:     body?.groupOrder     ?? null,
        auto_fill_field: body?.autoFillField  ?? null,
        is_required:     body?.isRequired     ?? false,
      })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

// PATCH /api/production-planning/schedule/section-defs/[id]/columns
// Bulk reorder: { order: [{ id, displayOrder }] }
export async function PATCH(request, { params }) {
  try {
    await requirePermissionKeys(request, ["production-line-planning-manage"]);
    const { id } = await params;
    const body = await readJson(request);
    const order = Array.isArray(body?.order) ? body.order : [];
    if (!order.length) return NextResponse.json({ ok: true });

    const db = getSupabaseAdmin();
    await Promise.all(
      order.map(({ id: colId, displayOrder }) =>
        db.from("production_schedule_column_defs")
          .update({ display_order: displayOrder })
          .eq("id", colId)
          .eq("section_def_id", id)
      )
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
