import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { sendPlanningPushNotification } from "@/lib/pushNotifications";
import { loadPlanWithRows } from "@/lib/scheduleConfig";

export const dynamic = "force-dynamic";

function normalizeDateOnly(value) {
  const raw = String(value || "").trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return raw;
}

function normalizeSchedulePlanStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "draft" || normalized === "published") {
    return normalized;
  }
  return null;
}

// GET  /api/production-planning/schedule/plans/[id]
export async function GET(request, { params }) {
  try {
    await requirePermissionKeys(request, ["production-line-planning-manage", "production-line-planning-view"]);
    const { id } = await params;
    const result = await loadPlanWithRows(id);
    if (!result.plan) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, data: result });
  } catch (error) {
    return jsonError(error);
  }
}

// PUT  /api/production-planning/schedule/plans/[id]
export async function PUT(request, { params }) {
  try {
    await requirePermissionKeys(request, [
      "production-line-planning-manage",
      "plan.edit_own_dept",
      "plan.publish_master",
    ]);
    const { id } = await params;
    const body = await readJson(request);
    const patch = {};
    const nextWeekStartDate = normalizeDateOnly(body?.weekStartDate);
    const nextPeriodEndRaw = normalizeDateOnly(body?.periodEnd ?? body?.dateTo);
    const nextPeriodEnd = nextPeriodEndRaw && nextWeekStartDate && nextPeriodEndRaw < nextWeekStartDate
      ? nextWeekStartDate
      : nextPeriodEndRaw;
    if (body?.status !== undefined) {
      const normalizedStatus = normalizeSchedulePlanStatus(body.status);
      if (!normalizedStatus) {
        return NextResponse.json({ error: "status must be draft or published" }, { status: 400 });
      }
      patch.status = normalizedStatus;
    }
    if (body?.notes         !== undefined) patch.notes          = body.notes ?? null;
    if (body?.masterPlanNo  !== undefined) patch.master_plan_no = body.masterPlanNo ?? null;
    if (body?.templateId    !== undefined) patch.template_id    = body.templateId ?? null;
    if (body?.weekStartDate !== undefined) patch.week_start_date = nextWeekStartDate;
    if (body?.periodEnd !== undefined || body?.dateTo !== undefined) patch.period_end = nextPeriodEnd;

    if (
      (body?.weekStartDate !== undefined || body?.periodEnd !== undefined || body?.dateTo !== undefined)
      && (!patch.week_start_date || !patch.period_end)
    ) {
      return NextResponse.json(
        { error: "weekStartDate and periodEnd must be valid YYYY-MM-DD values" },
        { status: 400 }
      );
    }

    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("production_schedule_plans")
      .update(patch)
      .eq("id", id)
      .select("*")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data)  return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (patch.status === "published") {
      try {
        await sendPlanningPushNotification(db, "planning.master_published", {
          title: "เผยแพร่แผนหลักแล้ว",
          body: `แผน ${data.master_plan_no || data.id} พร้อมให้แผนกดำเนินการต่อ`,
          url: `/production-line/planning/plan?masterPlanNo=${encodeURIComponent(data.master_plan_no || "")}`,
          data: {
            planId: data.id,
            masterPlanNo: data.master_plan_no || null,
            weekStartDate: data.week_start_date || null,
            periodEnd: data.period_end || null,
          },
        });
      } catch (pushError) {
        console.error("Failed to send master publish push notification", pushError);
      }
    }

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return jsonError(error);
  }
}
