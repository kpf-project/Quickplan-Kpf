import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";

function normalizePlanNo(value) {
  return String(value || "").trim().toUpperCase();
}

export async function GET(request) {
  await requirePermissionKeys(request, [
    "production-line-planning-view",
    "production-line-planning-manage",
    "plan.view_all",
    "plan.calculate_own_dept",
    "plan.edit_own_dept",
    "plan.publish_master",
  ]);

  const supabaseAdmin = getSupabaseAdmin();
  const { data: statusRows, error: statusError } = await supabaseAdmin
    .from("production_plan_status")
    .select("master_plan_no,period_start,period_end,plan_kind")
    .not("master_plan_no", "is", null)
    .order("period_start", { ascending: false })
    .limit(10000);

  if (statusError) {
    return NextResponse.json({ error: statusError.message }, { status: 500 });
  }

  const { data: scheduleRows, error: scheduleError } = await supabaseAdmin
    .from("production_schedule_plans")
    .select("master_plan_no,week_start_date,period_end,status")
    .not("master_plan_no", "is", null)
    .order("week_start_date", { ascending: false })
    .limit(10000);

  if (scheduleError) {
    return NextResponse.json({ error: scheduleError.message }, { status: 500 });
  }

  const map = new Map();
  (statusRows || []).forEach((row) => {
    const planNo = normalizePlanNo(row?.master_plan_no);
    if (!planNo) return;
    const current = map.get(planNo) || {
      master_plan_no: planNo,
      period_start: row?.period_start || null,
      period_end: row?.period_end || row?.period_start || null,
    };
    const start = String(row?.period_start || "");
    const end = String(row?.period_end || row?.period_start || "");
    if (start && (!current.period_start || start < current.period_start)) current.period_start = start;
    if (end && (!current.period_end || end > current.period_end)) current.period_end = end;
    map.set(planNo, current);
  });

  (scheduleRows || []).forEach((row) => {
    const planNo = normalizePlanNo(row?.master_plan_no);
    if (!planNo) return;
    const startValue = String(row?.week_start_date || "");
    const endValue = String(row?.period_end || row?.week_start_date || "");
    const current = map.get(planNo) || {
      master_plan_no: planNo,
      period_start: startValue || null,
      period_end: endValue || null,
    };
    if (startValue && (!current.period_start || startValue < current.period_start)) current.period_start = startValue;
    if (endValue && (!current.period_end || endValue > current.period_end)) current.period_end = endValue;
    map.set(planNo, current);
  });

  const rows = Array.from(map.values()).sort((a, b) =>
    String(b.period_start || "").localeCompare(String(a.period_start || ""))
  );

  return NextResponse.json({
    data: rows,
    meta: { totalPlans: rows.length },
  });
}
