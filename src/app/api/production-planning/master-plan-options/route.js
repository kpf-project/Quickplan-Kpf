import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { fetchAllSupabaseRows } from "@/lib/supabaseRangeFetch";

function normalizePlanNo(value) {
  return String(value || "").trim().toUpperCase();
}

let cachedMasterPlanOptions = null;
let cachedMasterPlanOptionsExpiry = 0;
const MASTER_PLAN_OPTIONS_TTL_MS = 60 * 1000; // 60 seconds

export function invalidateMasterPlanOptionsCache() {
  cachedMasterPlanOptions = null;
  cachedMasterPlanOptionsExpiry = 0;
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

  if (cachedMasterPlanOptions && Date.now() < cachedMasterPlanOptionsExpiry) {
    return NextResponse.json(cachedMasterPlanOptions);
  }

  const supabaseAdmin = getSupabaseAdmin();
  const scheduleRows = await fetchAllSupabaseRows(() => supabaseAdmin
    .from("production_schedule_plans")
    .select("master_plan_no,week_start_date,period_end,status")
    .not("master_plan_no", "is", null)
    .order("week_start_date", { ascending: false }));

  const map = new Map();
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

  const result = {
    data: rows,
    meta: { totalPlans: rows.length },
  };

  cachedMasterPlanOptions = result;
  cachedMasterPlanOptionsExpiry = Date.now() + MASTER_PLAN_OPTIONS_TTL_MS;

  return NextResponse.json(result);
}
