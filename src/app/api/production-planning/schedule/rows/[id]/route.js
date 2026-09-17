import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";

export const dynamic = "force-dynamic";

// PUT  /api/production-planning/schedule/rows/[id]
export async function PUT(request, { params }) {
  try {
    await requirePermissionKeys(request, ["production-line-planning-manage", "plan.edit_own_dept"]);
    const { id } = await params;
    const body = await readJson(request);
    const patch = {};
    if (body?.rowData      !== undefined) patch.row_data      = body.rowData;
    if (body?.subPlanId    !== undefined) patch.sub_plan_id   = body.subPlanId ?? null;
    if (body?.displayOrder !== undefined) patch.display_order = Number(body.displayOrder);

    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("production_schedule_rows")
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

// DELETE /api/production-planning/schedule/rows/[id]
export async function DELETE(request, { params }) {
  try {
    await requirePermissionKeys(request, ["production-line-planning-manage", "plan.edit_own_dept"]);
    const { id } = await params;
    const db = getSupabaseAdmin();
    const { error } = await db
      .from("production_schedule_rows")
      .delete()
      .eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
