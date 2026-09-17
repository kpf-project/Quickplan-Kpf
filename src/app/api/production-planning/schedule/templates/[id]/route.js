import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { loadTemplate } from "@/lib/scheduleConfig";

export const dynamic = "force-dynamic";

// GET  /api/production-planning/schedule/templates/[id]
export async function GET(request, { params }) {
  try {
    await requirePermissionKeys(request, ["production-line-planning-manage", "production-line-planning-view"]);
    const { id } = await params;
    const template = await loadTemplate(id);
    if (!template) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, data: template });
  } catch (error) {
    return jsonError(error);
  }
}

// PUT  /api/production-planning/schedule/templates/[id]
export async function PUT(request, { params }) {
  try {
    await requirePermissionKeys(request, ["production-line-planning-manage"]);
    const { id } = await params;
    const body = await readJson(request);
    const patch = {};
    if (body?.name !== undefined)     patch.name      = String(body.name).trim();
    if (body?.deptId !== undefined)   patch.dept_id   = body.deptId || null;
    if (body?.isActive !== undefined) patch.is_active = Boolean(body.isActive);

    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("production_schedule_templates")
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

// DELETE /api/production-planning/schedule/templates/[id]
export async function DELETE(request, { params }) {
  try {
    await requirePermissionKeys(request, ["production-line-planning-manage"]);
    const { id } = await params;
    const db = getSupabaseAdmin();
    const { error } = await db
      .from("production_schedule_templates")
      .delete()
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
