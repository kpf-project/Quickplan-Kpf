import "server-only";

import { hasPlanningManageAccess } from "@/lib/claimPermissions";

function normalizeSku(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeDepartmentId(value) {
  return String(value || "").trim();
}

export async function loadPlanningScopeByUser(supabaseAdmin, request, permission) {
  const canManageGlobal = await hasPlanningManageAccess(
    request,
    permission.userId,
    permission.isAdmin
  );
  if (permission.isAdmin || canManageGlobal) {
    return {
      canManageGlobal: true,
      editableDepartmentIdSet: new Set(),
      editableSkuSet: new Set(),
    };
  }

  const membershipResult = await supabaseAdmin
    .from("production_department_users")
    .select("department_id,role,production_departments(id,is_active,deleted_at)")
    .eq("user_id", permission.userId);

  if (membershipResult.error) {
    throw membershipResult.error;
  }

  const editorDepartmentIds = Array.from(
    new Set(
      (membershipResult.data ?? [])
        .filter((row) => row?.role === "editor")
        .filter((row) => row?.production_departments?.is_active && !row?.production_departments?.deleted_at)
        .map((row) => normalizeDepartmentId(row?.department_id))
        .filter(Boolean)
    )
  );

  if (!editorDepartmentIds.length) {
    return {
      canManageGlobal: false,
      editableDepartmentIdSet: new Set(),
      editableSkuSet: new Set(),
    };
  }

  const mappedResult = await supabaseAdmin
    .from("production_department_products")
    .select("sku_code,is_owner")
    .in("department_id", editorDepartmentIds)
    .eq("is_owner", true);

  if (mappedResult.error) {
    throw mappedResult.error;
  }

  const editableSkuSet = new Set(
    (mappedResult.data ?? [])
      .map((row) => normalizeSku(row?.sku_code))
      .filter(Boolean)
  );

  return {
    canManageGlobal: false,
    editableDepartmentIdSet: new Set(editorDepartmentIds),
    editableSkuSet,
  };
}

export async function loadDepartmentMapByIds(supabaseAdmin, departmentIds = []) {
  const ids = Array.from(
    new Set((departmentIds || []).map((item) => normalizeDepartmentId(item)).filter(Boolean))
  );
  if (!ids.length) return new Map();

  const result = await supabaseAdmin
    .from("production_departments")
    .select("id,code,name,is_active,deleted_at")
    .in("id", ids);

  if (result.error) {
    throw result.error;
  }

  const map = new Map();
  (result.data ?? []).forEach((row) => {
    const id = normalizeDepartmentId(row?.id);
    if (!id) return;
    map.set(id, row);
  });
  return map;
}

export function normalizePlanningSku(value) {
  return normalizeSku(value);
}

export function normalizePlanningDepartmentId(value) {
  return normalizeDepartmentId(value);
}
