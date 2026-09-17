import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";

export const dynamic = "force-dynamic";

// GET  /api/production-planning/schedule/plans/[id]/rows?sectionDefId=...&dayKey=...
export async function GET(request, { params }) {
  try {
    await requirePermissionKeys(request, ["production-line-planning-manage", "production-line-planning-view"]);
    const { id } = await params;
    const sp           = new URL(request.url).searchParams;
    const sectionDefId = sp.get("sectionDefId");
    const dayKey       = sp.get("dayKey");

    const db = getSupabaseAdmin();
    let q = db
      .from("production_schedule_rows")
      .select("id,section_def_id,day_key,display_order,row_data,sub_plan_id,created_at")
      .eq("plan_id", id)
      .order("section_def_id")
      .order("day_key")
      .order("display_order");

    if (sectionDefId) q = q.eq("section_def_id", sectionDefId);
    if (dayKey)       q = q.eq("day_key", dayKey);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

// POST /api/production-planning/schedule/plans/[id]/rows
// Supports single row ({ sectionDefId, dayKey, rowData }) or
// bulk insert ({ rows: [...] })
export async function POST(request, { params }) {
  try {
    const permission = await requirePermissionKeys(request, ["production-line-planning-manage", "plan.edit_own_dept"]);
    const { id } = await params;
    const body = await readJson(request);

    const toInsert = Array.isArray(body?.rows) ? body.rows : [body];
    if (!toInsert.length) return NextResponse.json({ ok: true, data: [] });

    const db = getSupabaseAdmin();

    // Get current max orders per section+day to place new rows at end
    const keys = [...new Set(toInsert.map((r) => `${r.sectionDefId}::${r.dayKey}`))];
    const orderMap = new Map();
    await Promise.all(
      keys.map(async (k) => {
        const [sid, dk] = k.split("::");
        const { data } = await db
          .from("production_schedule_rows")
          .select("display_order")
          .eq("plan_id", id)
          .eq("section_def_id", sid)
          .eq("day_key", dk)
          .order("display_order", { ascending: false })
          .limit(1)
          .maybeSingle();
        orderMap.set(k, (data?.display_order ?? 0) + 1);
      })
    );

    const rows = toInsert.map((r) => {
      const k = `${r.sectionDefId}::${r.dayKey}`;
      const order = orderMap.get(k) ?? 1;
      orderMap.set(k, order + 1);
      return {
        plan_id:        id,
        section_def_id: r.sectionDefId,
        day_key:        r.dayKey,
        display_order:  r.displayOrder ?? order,
        row_data:       r.rowData ?? {},
        sub_plan_id:    r.subPlanId ?? null,
        created_by:     permission.userId,
      };
    });

    const { data, error } = await db
      .from("production_schedule_rows")
      .insert(rows)
      .select("*");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}

// DELETE /api/production-planning/schedule/plans/[id]/rows
// Body: { rowIds: [...] }  — bulk delete
export async function DELETE(request, { params }) {
  try {
    await requirePermissionKeys(request, ["production-line-planning-manage", "plan.edit_own_dept"]);
    const { id } = await params;
    const body = await readJson(request);
    const ids = Array.isArray(body?.rowIds) ? body.rowIds : [];
    if (!ids.length) return NextResponse.json({ ok: true });

    const db = getSupabaseAdmin();
    const { error } = await db
      .from("production_schedule_rows")
      .delete()
      .eq("plan_id", id)
      .in("id", ids);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
