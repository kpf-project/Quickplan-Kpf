import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { isPlanningDateEditable, resolveScheduleWorkDate } from "@/lib/planningAdjustment";

export const dynamic = "force-dynamic";

async function rejectPastScheduleRow(db, rowId, editableFromDate) {
  const boundary = String(editableFromDate || "").slice(0, 10);
  if (!boundary) return null;
  const rowResult = await db
    .from("production_schedule_rows")
    .select("plan_id,day_key")
    .eq("id", rowId)
    .maybeSingle();
  if (rowResult.error) return NextResponse.json({ error: rowResult.error.message }, { status: 500 });
  if (!rowResult.data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const planResult = await db
    .from("production_schedule_plans")
    .select("week_start_date")
    .eq("id", rowResult.data.plan_id)
    .maybeSingle();
  if (planResult.error) return NextResponse.json({ error: planResult.error.message }, { status: 500 });
  const workDate = resolveScheduleWorkDate(planResult.data?.week_start_date, rowResult.data.day_key);
  if (!isPlanningDateEditable(workDate, boundary)) {
    return NextResponse.json({ error: "ไม่สามารถแก้ไขแผนของวันที่ผ่านมาแล้ว" }, { status: 400 });
  }
  return null;
}

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
    const rejection = await rejectPastScheduleRow(db, id, body?.editableFromDate);
    if (rejection) return rejection;
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
    const body = await readJson(request);
    const db = getSupabaseAdmin();
    const rejection = await rejectPastScheduleRow(db, id, body?.editableFromDate);
    if (rejection) return rejection;
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
