import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { getUserPermissions } from "@/lib/permissionsData";

function normalizeSku(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizePlanNo(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return "";
  return normalized.replace(/[^A-Z0-9_-]/g, "");
}

function normalizePlanStatus(value, confirmedAt = null) {
  const status = String(value || "").trim().toLowerCase();
  if (["ready", "partial", "backorder", "blocked", "draft", "not_ready", "cancelled"].includes(status)) {
    return status;
  }
  return confirmedAt ? "ready" : "draft";
}

function isConfirmedPlanStatus(status) {
  return ["ready", "partial", "backorder", "blocked"].includes(normalizePlanStatus(status));
}

async function hasPlanningManageAccess(request, userId, isAdmin = false) {
  if (isAdmin) return true;
  const permissionResult = await getUserPermissions(userId, { fresh: true });
  return Boolean(
    permissionResult?.isAdmin
    || permissionResult?.permissions?.includes("production-line-planning-manage")
  );
}

async function loadEditableSkuSet(supabaseAdmin, userId) {
  const membershipResult = await supabaseAdmin
    .from("production_department_users")
    .select("department_id,role")
    .eq("user_id", userId);
  if (membershipResult.error) {
    throw membershipResult.error;
  }

  const departmentIds = Array.from(
    new Set((membershipResult.data ?? []).map((row) => String(row?.department_id || "")).filter(Boolean))
  );
  if (!departmentIds.length) {
    return new Set();
  }

  const activeResult = await supabaseAdmin
    .from("production_departments")
    .select("id")
    .in("id", departmentIds)
    .eq("is_active", true)
    .is("deleted_at", null);
  if (activeResult.error) {
    throw activeResult.error;
  }

  const activeSet = new Set((activeResult.data ?? []).map((row) => String(row.id)));
  const editorDepartments = (membershipResult.data ?? [])
    .filter((row) => row?.role === "editor" && activeSet.has(String(row?.department_id || "")))
    .map((row) => String(row.department_id));
  if (!editorDepartments.length) {
    return new Set();
  }

  const mappedResult = await supabaseAdmin
    .from("production_department_products")
    .select("sku_code")
    .in("department_id", editorDepartments)
    .eq("is_owner", true);
  if (mappedResult.error) {
    throw mappedResult.error;
  }

  return new Set(
    (mappedResult.data ?? [])
      .map((row) => normalizeSku(row?.sku_code))
      .filter(Boolean)
  );
}

export async function GET(request) {
  const permission = await requirePermissionKeys(request, [
    "production-line-planning-view",
    "production-line-planning-manage",
    "plan.view_all",
    "plan.calculate_own_dept",
    "plan.edit_own_dept",
    "plan.publish_master",
  ]);

  const { searchParams } = new URL(request.url);
  const scope = String(searchParams.get("scope") || "own").toLowerCase() === "all" ? "all" : "own";
  const planNo = normalizePlanNo(searchParams.get("planNo"));
  const queryText = String(searchParams.get("q") || "").trim().toLowerCase();
  const includeReady = String(searchParams.get("includeReady") || "0") === "1";

  const supabaseAdmin = getSupabaseAdmin();
  const canManageGlobal = await hasPlanningManageAccess(request, permission.userId, permission.isAdmin);
  const editableSkuSet = permission.isAdmin || canManageGlobal
    ? null
    : await loadEditableSkuSet(supabaseAdmin, permission.userId);

  let query = supabaseAdmin
    .from("production_plan_status")
    .select("plan_id,sku_code,sku_name,status,plan_kind,period_start,period_end,master_plan_no,sub_plan_no,owner_department_id,master_published_at,master_published_by,confirmed_at")
    .not("master_published_at", "is", null)
    .order("period_start", { ascending: false })
    .limit(5000);

  if (!includeReady) {
    query = query.in("status", ["not_ready", "draft"]);
  }
  if (planNo) {
    query = query.eq("master_plan_no", planNo);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []).map((row) => {
    const sku = normalizeSku(row?.sku_code);
    const canEdit = permission.isAdmin || canManageGlobal
      ? true
      : editableSkuSet?.has(sku) ?? false;
    return {
      ...row,
      can_edit: canEdit,
    };
  }).filter((row) => {
    if (scope === "own" && row.can_edit !== true) return false;
    if (!queryText) return true;
    const haystack = [
      row.master_plan_no,
      row.sub_plan_no,
      row.sku_code,
      row.sku_name,
    ].map((value) => String(value || "").toLowerCase()).join(" ");
    return haystack.includes(queryText);
  });

  const summaryMap = new Map();
  rows.forEach((row) => {
    const key = normalizePlanNo(row.master_plan_no || "");
    if (!key) return;
    const current = summaryMap.get(key) || {
      master_plan_no: key,
      period_start: row.period_start || null,
      period_end: row.period_end || row.period_start || null,
      total_items: 0,
      editable_items: 0,
      readonly_items: 0,
      not_ready_items: 0,
      ready_items: 0,
      sku_set: new Set(),
      sub_plan_set: new Set(),
      published_at: row.master_published_at || null,
      published_by: row.master_published_by || null,
    };
    current.total_items += 1;
    if (row.can_edit) {
      current.editable_items += 1;
    } else {
      current.readonly_items += 1;
    }
    if (isConfirmedPlanStatus(row.status)) {
      current.ready_items += 1;
    } else {
      current.not_ready_items += 1;
    }
    current.sku_set.add(normalizeSku(row.sku_code));
    if (row.sub_plan_no) {
      current.sub_plan_set.add(String(row.sub_plan_no));
    }
    if (row.period_start && (!current.period_start || row.period_start < current.period_start)) {
      current.period_start = row.period_start;
    }
    if (row.period_end && (!current.period_end || row.period_end > current.period_end)) {
      current.period_end = row.period_end;
    }
    summaryMap.set(key, current);
  });

  const summary = Array.from(summaryMap.values())
    .map((row) => ({
      master_plan_no: row.master_plan_no,
      period_start: row.period_start,
      period_end: row.period_end,
      total_items: row.total_items,
      editable_items: row.editable_items,
      readonly_items: row.readonly_items,
      not_ready_items: row.not_ready_items,
      ready_items: row.ready_items,
      sku_count: row.sku_set.size,
      sub_plan_count: row.sub_plan_set.size,
      published_at: row.published_at,
      published_by: row.published_by,
    }))
    .sort((a, b) => String(b.period_start || "").localeCompare(String(a.period_start || "")));

  return NextResponse.json({
    data: summary,
    meta: {
      scope,
      canManageGlobal: Boolean(canManageGlobal || permission.isAdmin),
      totalPlans: summary.length,
      totalRows: rows.length,
    },
  }, { status: 200 });
}
