import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";

export const dynamic = "force-dynamic";

const COMPACT_MASTER_PLAN_NO_REGEX = /^MP\d{9}$/i;

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function normalizeDateOnly(value) {
  const raw = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return raw;
}

function normalizeMasterPlanNoInput(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return null;
  return normalized;
}

function normalizeSchedulePlanStatus(value, fallback = "draft") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "draft" || normalized === "published") {
    return normalized;
  }
  return fallback;
}

function buildMonthlyMasterPlanPrefix(dateInput) {
  const normalized = normalizeDateOnly(dateInput);
  if (!normalized) return null;
  const [year, month] = normalized.split("-");
  return `MP${year}${month}`;
}

function extractMonthlyMasterPlanSequence(masterPlanNo, expectedPrefix) {
  const normalized = String(masterPlanNo || "").trim().toUpperCase();
  if (!normalized || !normalized.startsWith(expectedPrefix)) return null;
  if (!COMPACT_MASTER_PLAN_NO_REGEX.test(normalized)) return null;
  const sequence = Number(normalized.slice(expectedPrefix.length));
  return Number.isFinite(sequence) ? sequence : null;
}

async function generateMonthlyMasterPlanNo(db, weekStartDate) {
  const prefix = buildMonthlyMasterPlanPrefix(weekStartDate);
  if (!prefix) {
    throw new Error("Invalid weekStartDate for master_plan_no generation");
  }

  const { data, error } = await db
    .from("production_schedule_plans")
    .select("master_plan_no")
    .like("master_plan_no", `${prefix}%`)
    .order("master_plan_no", { ascending: false })
    .limit(1);

  if (error) throw error;

  const latestMasterPlanNo = Array.isArray(data) ? data[0]?.master_plan_no : null;
  const latestSequence = extractMonthlyMasterPlanSequence(latestMasterPlanNo, prefix) ?? 0;
  const nextSequence = latestSequence + 1;
  if (nextSequence > 999) {
    throw new Error(`master_plan_no sequence overflow for ${prefix} (max 999 per month)`);
  }
  return `${prefix}${String(nextSequence).padStart(3, "0")}`;
}

// Find an existing master_plan_no for the same period (any department).
// This ensures all departments planning the same date range share one master plan.
async function findExistingMasterPlanNoForPeriod(db, weekStartDate, periodEnd) {
  const { data, error } = await db
    .from("production_schedule_plans")
    .select("master_plan_no")
    .eq("week_start_date", weekStartDate)
    .eq("period_end", periodEnd)
    .not("master_plan_no", "is", null)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw error;
  return Array.isArray(data) && data[0]?.master_plan_no ? data[0].master_plan_no : null;
}

async function resolveNewMasterPlanNo(db, weekStartDate, periodEnd) {
  const existing = await findExistingMasterPlanNoForPeriod(db, weekStartDate, periodEnd);
  return existing ?? await generateMonthlyMasterPlanNo(db, weekStartDate);
}

function resolvePeriodEnd(bodyOrParams, weekStartDate) {
  const normalizedPeriodEnd = normalizeDateOnly(
    bodyOrParams?.periodEnd ?? bodyOrParams?.dateTo ?? null
  );
  if (!normalizedPeriodEnd) return weekStartDate;
  return normalizedPeriodEnd < weekStartDate ? weekStartDate : normalizedPeriodEnd;
}

// GET  /api/production-planning/schedule/plans?deptId=...&weekStartDate=...&periodEnd=...
export async function GET(request) {
  try {
    await requirePermissionKeys(request, ["production-line-planning-manage", "production-line-planning-view"]);
    const sp = new URL(request.url).searchParams;
    const deptId        = sp.get("deptId");
    const weekStartDate = sp.get("weekStartDate");
    const periodEnd     = normalizeDateOnly(sp.get("periodEnd") || sp.get("dateTo"));

    const db = getSupabaseAdmin();
    let q = db
      .from("production_schedule_plans")
      .select("id,dept_id,template_id,master_plan_no,week_start_date,period_end,status,notes,created_at")
      .order("week_start_date", { ascending: false });

    if (deptId)        q = q.eq("dept_id", deptId);
    if (weekStartDate) q = q.eq("week_start_date", weekStartDate);
    if (periodEnd)     q = q.eq("period_end", periodEnd);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (error) {
    return jsonError(error);
  }
}

// POST /api/production-planning/schedule/plans
export async function POST(request) {
  try {
    const permission = await requirePermissionKeys(request, ["production-line-planning-manage", "plan.edit_own_dept"]);
    const body = await readJson(request);
    const weekStartDate = normalizeDateOnly(body?.weekStartDate);
    const periodEnd = weekStartDate ? resolvePeriodEnd(body, weekStartDate) : null;
    const deptId = body?.deptId;
    if (!weekStartDate || !periodEnd || !deptId) {
      return NextResponse.json({ error: "deptId, weekStartDate, and periodEnd are required" }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const hasTemplateId = hasOwn(body, "templateId");
    const hasStatus = hasOwn(body, "status");
    const hasNotes = hasOwn(body, "notes");
    const hasMasterPlanNo = hasOwn(body, "masterPlanNo");
    const requestedMasterPlanNo = normalizeMasterPlanNoInput(body?.masterPlanNo);

    const existingResult = await db
      .from("production_schedule_plans")
      .select("id,template_id,status,notes,master_plan_no,period_end")
      .eq("dept_id", deptId)
      .eq("week_start_date", weekStartDate)
      .eq("period_end", periodEnd)
      .maybeSingle();

    if (existingResult.error) {
      return NextResponse.json({ error: existingResult.error.message }, { status: 500 });
    }

    const existing = existingResult.data ?? null;

    if (existing) {
      const patch = {};
      if (hasTemplateId) patch.template_id = body?.templateId ?? null;
      if (hasStatus) patch.status = normalizeSchedulePlanStatus(body?.status, "draft");
      if (hasNotes) patch.notes = body?.notes ?? null;
      if (hasMasterPlanNo && requestedMasterPlanNo) {
        // Only overwrite if client sent an actual non-empty master plan number
        patch.master_plan_no = requestedMasterPlanNo;
      } else if (!existing.master_plan_no) {
        // Reuse master_plan_no from another dept in the same period, or generate new
        patch.master_plan_no = await resolveNewMasterPlanNo(db, weekStartDate, periodEnd);
      }
      // If hasMasterPlanNo but requestedMasterPlanNo is null, keep existing value (no-op)

      if (!Object.keys(patch).length) {
        const currentResult = await db
          .from("production_schedule_plans")
          .select("*")
          .eq("id", existing.id)
          .single();
        if (currentResult.error) {
          return NextResponse.json({ error: currentResult.error.message }, { status: 500 });
        }
        return NextResponse.json({ ok: true, data: currentResult.data }, { status: 200 });
      }

      const { data, error } = await db
        .from("production_schedule_plans")
        .update(patch)
        .eq("id", existing.id)
        .select("*")
        .single();

      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, data }, { status: 200 });
    }

    const resolvedMasterPlanNo = requestedMasterPlanNo || await resolveNewMasterPlanNo(db, weekStartDate, periodEnd);
    const { data, error } = await db
      .from("production_schedule_plans")
      .insert({
        dept_id: deptId,
        template_id: hasTemplateId ? (body?.templateId ?? null) : null,
        master_plan_no: resolvedMasterPlanNo,
        week_start_date: weekStartDate,
        period_end: periodEnd,
        status: hasStatus ? normalizeSchedulePlanStatus(body?.status, "draft") : "draft",
        notes: hasNotes ? (body?.notes ?? null) : null,
        created_by: permission.userId,
      })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
