import "server-only";

import { ApiError, getSupabaseAdmin } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";

export const LIVE_SCALE_WEIGHT_SOURCE = "serial-live";
export const LIVE_SCALE_WIP_CATEGORY_CODE = "03";

export const LIVE_SCALE_PERMISSION_KEYS = Object.freeze([
  "production-line-attendance-view",
  "production-line-attendance-manage",
  "production-line-attendance-report-view",
  "production-line-attendance-report-manage",
  "production-line-settings-view",
  "production-line-settings-manage",
]);
export const LIVE_SCALE_MANAGE_PERMISSION_KEYS = Object.freeze([
  "production-line-attendance-manage",
]);

function normalizeId(value) {
  return String(value || "").trim();
}

function normalizeRole(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "editor" ? "editor" : "viewer";
}

function normalizeDepartment(row, role) {
  const department = row?.production_departments || row;
  const id = normalizeId(department?.id || row?.department_id);
  if (!id || department?.is_active === false || department?.deleted_at) {
    return null;
  }

  return {
    id,
    code: String(department?.code || "").trim().toUpperCase(),
    name: String(department?.name || "").trim(),
    role: normalizeRole(role),
  };
}

export async function requireWeightScaleLivePermission(request, { manage = false } = {}) {
  return requirePermissionKeys(
    request,
    manage ? LIVE_SCALE_MANAGE_PERMISSION_KEYS : LIVE_SCALE_PERMISSION_KEYS
  );
}

export async function loadWeightScaleLiveDepartmentScope(
  supabaseAdmin = getSupabaseAdmin(),
  { userId, isAdmin = false } = {}
) {
  const normalizedUserId = normalizeId(userId);
  if (!normalizedUserId) {
    return {
      departments: [],
      canView: false,
      canOperate: false,
      isAdmin: false,
    };
  }

  if (isAdmin) {
    const departmentResult = await supabaseAdmin
      .from("production_departments")
      .select("id,code,name,is_active,deleted_at")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("code", { ascending: true });

    if (departmentResult.error) {
      throw new ApiError(
        500,
        "Failed to load live scale departments",
        departmentResult.error.message
      );
    }

    const departments = (departmentResult.data ?? [])
      .map((row) => normalizeDepartment(row, "editor"))
      .filter(Boolean);

    return {
      departments,
      canView: departments.length > 0,
      canOperate: departments.length > 0,
      isAdmin: true,
    };
  }

  const membershipResult = await supabaseAdmin
    .from("production_department_users")
    .select(
      "department_id,role,production_departments(id,code,name,is_active,deleted_at)"
    )
    .eq("user_id", normalizedUserId);

  if (membershipResult.error) {
    throw new ApiError(
      500,
      "Failed to verify live scale department access",
      membershipResult.error.message
    );
  }

  const departments = (membershipResult.data ?? [])
    .map((row) => normalizeDepartment(row, row?.role))
    .filter(Boolean)
    .sort((left, right) =>
      left.code.localeCompare(right.code, "en", { numeric: true })
    );

  return {
    departments,
    canView: departments.length > 0,
    canOperate: departments.some((department) => department.role === "editor"),
    isAdmin: false,
  };
}

export async function loadWeightScaleLiveAccess(
  supabaseAdmin = getSupabaseAdmin(),
  { userId, isAdmin = false, departmentId } = {}
) {
  const normalizedDepartmentId = normalizeId(departmentId);
  const scope = await loadWeightScaleLiveDepartmentScope(supabaseAdmin, {
    userId,
    isAdmin,
  });
  const department =
    scope.departments.find((item) => item.id === normalizedDepartmentId) || null;

  return {
    canView: Boolean(department),
    canOperate: Boolean(department && (scope.isAdmin || department.role === "editor")),
    role: department?.role || null,
    department,
    departmentIds: scope.departments.map((item) => item.id),
  };
}

export async function assertWeightScaleLiveReceiptAccess(
  supabaseAdmin = getSupabaseAdmin(),
  {
    userId,
    isAdmin = false,
    departmentId,
    productConfigId,
  } = {}
) {
  const normalizedDepartmentId = normalizeId(departmentId);
  const normalizedProductConfigId = normalizeId(productConfigId);
  const access = await loadWeightScaleLiveAccess(supabaseAdmin, {
    userId,
    isAdmin,
    departmentId: normalizedDepartmentId,
  });

  if (!access.canOperate) {
    throw new ApiError(403, "User is not allowed to receive products for this department");
  }

  const configResult = await supabaseAdmin
    .from("production_weight_scale_products")
    .select("id,department_id,sku_code,is_active")
    .eq("id", normalizedProductConfigId)
    .eq("department_id", normalizedDepartmentId)
    .eq("is_active", true)
    .maybeSingle();

  if (configResult.error) {
    throw new ApiError(
      500,
      "Failed to verify live scale product",
      configResult.error.message
    );
  }

  if (!configResult.data) {
    throw new ApiError(403, "Product is not available for this live scale page");
  }

  const mappedProductResult = await supabaseAdmin
    .from("production_department_products")
    .select("sku_code")
    .eq("department_id", normalizedDepartmentId)
    .eq("sku_code", configResult.data.sku_code)
    .maybeSingle();

  if (mappedProductResult.error) {
    throw new ApiError(
      500,
      "Failed to verify live scale product assignment",
      mappedProductResult.error.message
    );
  }

  if (!mappedProductResult.data) {
    throw new ApiError(403, "Product is not assigned to this department");
  }

  const productResult = await supabaseAdmin
    .from("products_cache")
    .select("sku_code,sku_name,uom_name,iccat_code")
    .eq("sku_code", configResult.data.sku_code)
    .eq("iccat_code", LIVE_SCALE_WIP_CATEGORY_CODE)
    .maybeSingle();

  if (productResult.error) {
    throw new ApiError(
      500,
      "Failed to verify WIP product category",
      productResult.error.message
    );
  }

  if (!productResult.data) {
    throw new ApiError(403, "Only WIP products are allowed on this live scale page");
  }

  return {
    departmentId: normalizedDepartmentId,
    departmentIds: access.departmentIds,
    productConfigId: configResult.data.id,
    skuCode: String(productResult.data.sku_code || "").trim().toUpperCase(),
    productName: String(productResult.data.sku_name || "").trim(),
    unit: String(productResult.data.uom_name || "").trim(),
  };
}
