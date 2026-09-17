import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";

export const dynamic = "force-dynamic";

// GET  /api/production-planning/schedule/templates/[id]/sections
export async function GET(request, { params }) {
  try {
    await requirePermissionKeys(request, ["production-line-planning-manage", "production-line-planning-view"]);
    const { id } = await params;
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("production_schedule_section_defs")
      .select(`
        id, name, display_order, color_theme,
        production_schedule_column_defs (
          id, key, label, col_type, display_order, width,
          highlight_color, group_label, group_order, auto_fill_field, is_required
        )
      `)
      .eq("template_id", id)
      .order("display_order")
      .order("display_order", { referencedTable: "production_schedule_column_defs" });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

// POST /api/production-planning/schedule/templates/[id]/sections
export async function POST(request, { params }) {
  try {
    await requirePermissionKeys(request, ["production-line-planning-manage"]);
    const { id } = await params;
    const body = await readJson(request);
    const name = String(body?.name || "").trim();
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const db = getSupabaseAdmin();

    const { data: maxRow } = await db
      .from("production_schedule_section_defs")
      .select("display_order")
      .eq("template_id", id)
      .order("display_order", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextOrder = (maxRow?.display_order ?? 0) + 1;

    const { data, error } = await db
      .from("production_schedule_section_defs")
      .insert({
        template_id:   id,
        name,
        display_order: body?.displayOrder ?? nextOrder,
        color_theme:   body?.colorTheme ?? "slate",
      })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

// PATCH /api/production-planning/schedule/templates/[id]/sections
// Body: { order: [{ id, displayOrder }] }  — bulk reorder
export async function PATCH(request, { params }) {
  try {
    await requirePermissionKeys(request, ["production-line-planning-manage"]);
    const { id } = await params;
    const body = await readJson(request);
    const order = Array.isArray(body?.order) ? body.order : [];
    if (!order.length) return NextResponse.json({ ok: true });

    const db = getSupabaseAdmin();
    await Promise.all(
      order.map(({ id: sectionId, displayOrder }) =>
        db.from("production_schedule_section_defs")
          .update({ display_order: displayOrder })
          .eq("id", sectionId)
          .eq("template_id", id)
      )
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
