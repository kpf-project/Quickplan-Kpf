import "server-only";

import { normalizeSku } from "@/lib/materialClaims";

export const UNASSIGNED_DEPARTMENT_ID = "UNASSIGNED";
export const UNASSIGNED_DEPARTMENT_NAME = "ยังไม่ระบุแผนกรับผิดชอบ";

export async function loadVerifyEditorScope(supabaseAdmin, userId, isAdmin) {
  if (isAdmin) {
    return { isAdmin: true, deptIds: [] };
  }

  const { data, error } = await supabaseAdmin
    .from("production_department_users")
    .select("department_id, role, production_departments(id, is_active, deleted_at)")
    .eq("user_id", userId)
    .eq("role", "editor");

  if (error) throw error;

  return {
    isAdmin: false,
    deptIds: (data || [])
      .filter((row) => row.production_departments?.is_active && !row.production_departments?.deleted_at)
      .map((row) => String(row?.department_id || "").trim())
      .filter(Boolean),
  };
}

export async function loadMaterialOwnerMap(supabaseAdmin) {
  const { data, error } = await supabaseAdmin
    .from("production_material_owners")
    .select("material_sku_code, department_id, production_departments:department_id(id,code,name,is_active,deleted_at)");

  if (error) throw error;

  const byMaterialKey = new Map();

  (data || []).forEach((row) => {
    const materialKey = normalizeSku(row?.material_sku_code);
    const departmentId = String(row?.department_id || "").trim();
    const department = row?.production_departments || null;
    if (!materialKey || !departmentId) return;
    if (department?.deleted_at || department?.is_active === false) return;

    if (!byMaterialKey.has(materialKey)) {
      byMaterialKey.set(materialKey, {
        departmentId,
        departmentCode: String(department?.code || "").trim().toUpperCase() || null,
        departmentName: String(department?.name || "").trim() || null,
      });
    }
  });

  return byMaterialKey;
}

export function resolveAssignedDepartment(row, ownerByMaterialKey) {
  const materialSkuCode = normalizeSku(row?.materialSkuCode);
  const materialGoodsCode = normalizeSku(row?.materialGoodsCode || row?.materialSkuCode);
  const configuredOwner =
    ownerByMaterialKey.get(materialSkuCode)
    || ownerByMaterialKey.get(materialGoodsCode)
    || null;

  if (configuredOwner) {
    return {
      departmentId: configuredOwner.departmentId,
      departmentCode: configuredOwner.departmentCode,
      departmentName: configuredOwner.departmentName || configuredOwner.departmentCode || configuredOwner.departmentId,
    };
  }

  const sourceDepartmentId = String(row?.ownerDepartmentId || "").trim();
  const sourceDepartmentCode = String(row?.ownerDepartmentCode || "").trim().toUpperCase() || null;
  const sourceDepartmentName = String(row?.ownerDepartmentName || "").trim() || null;
  if (sourceDepartmentId) {
    return {
      departmentId: sourceDepartmentId,
      departmentCode: sourceDepartmentCode,
      departmentName: sourceDepartmentName || sourceDepartmentCode || sourceDepartmentId,
    };
  }

  return {
    departmentId: UNASSIGNED_DEPARTMENT_ID,
    departmentCode: null,
    departmentName: UNASSIGNED_DEPARTMENT_NAME,
  };
}

export function canEditAssignedDepartment(scope, departmentId) {
  const normalizedDepartmentId = String(departmentId || "").trim();
  return Boolean(
    scope?.isAdmin
    || (normalizedDepartmentId && normalizedDepartmentId !== UNASSIGNED_DEPARTMENT_ID && scope?.deptIds?.includes(normalizedDepartmentId))
  );
}
