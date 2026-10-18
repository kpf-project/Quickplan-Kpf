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
  if (row?.department_id && !row.production_departments) return null;
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

export async function loadWeightScaleLiveExcludedProductCodes(supabaseAdmin) {
  const departments = await supabaseAdmin.from("production_departments")
    .select("id").eq("code", "KP13").eq("is_active", true).is("deleted_at", null);
  if (departments.error) throw new ApiError(500, "ตรวจสอบขอบเขตสินค้าเปลือกไม่สำเร็จ");
  const ids = (departments.data || []).map(row => row.id);
  if (!ids.length) return new Set();
  const categories = await supabaseAdmin.from("production_department_product_subcategories")
    .select("id").in("department_id", ids).eq("name", "เปลือก");
  if (categories.error) throw new ApiError(500, "ตรวจสอบหมวดหมู่เปลือกไม่สำเร็จ");
  const categoryIds = (categories.data || []).map(row => row.id);
  if (!categoryIds.length) return new Set();
  const mappings = await supabaseAdmin.from("production_department_products")
    .select("sku_code").in("department_id", ids).in("subcategory_id", categoryIds);
  if (mappings.error) throw new ApiError(500, "ตรวจสอบรายการสินค้าเปลือกไม่สำเร็จ");
  return new Set((mappings.data || []).map(row => String(row.sku_code || "").trim().toUpperCase()));
}

// Shared master-data authorization only; never reads another weighing workflow.
export async function assertWeightScaleLiveProductAccess(
  supabaseAdmin,
  { userId, isAdmin = false, departmentId, productCode, manage = false } = {}
) {
  const normalizedDepartmentId = normalizeId(departmentId);
  const code = String(productCode || "").trim().toUpperCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(normalizedDepartmentId)
    || !code || code.length > 100) {
    throw new ApiError(400, "กรุณาเลือกแผนกและสินค้าให้ถูกต้อง");
  }
  const access = await loadWeightScaleLiveAccess(supabaseAdmin, {
    userId, isAdmin, departmentId: normalizedDepartmentId,
  });
  if (!access.canView || (manage && !access.canOperate)) {
    throw new ApiError(403, "ไม่มีสิทธิ์ทำรายการในแผนกนี้");
  }
  const mapping = await supabaseAdmin.from("production_department_products")
    .select("sku_code,subcategory_id")
    .eq("department_id", normalizedDepartmentId).eq("sku_code", code).maybeSingle();
  if (mapping.error) throw new ApiError(500, "ตรวจสอบสินค้าในแผนกไม่สำเร็จ");
  if (!mapping.data) throw new ApiError(403, "สินค้าไม่ได้อยู่ในแผนกนี้");
  const product = await supabaseAdmin.from("products_cache")
    .select("sku_code,iccat_code,uom_name").eq("sku_code", code)
    .eq("iccat_code", LIVE_SCALE_WIP_CATEGORY_CODE).maybeSingle();
  if (product.error) throw new ApiError(500, "ตรวจสอบข้อมูลสินค้าไม่สำเร็จ");
  if (!product.data) throw new ApiError(403, "สินค้าไม่อยู่ในขอบเขต WIP ของหน้าชั่งกลาง");
  if (!["KG", "KGS", "กก.", "กก", "กิโลกรัม"].includes(String(product.data.uom_name || "").trim().toUpperCase())) {
    throw new ApiError(400, "หน้าชั่งกลางรับเข้าได้เฉพาะสินค้าที่หน่วยเป็นกิโลกรัม ยังไม่เปิดแปลงหน่วยอื่น");
  }
  const excludedCodes = await loadWeightScaleLiveExcludedProductCodes(supabaseAdmin);
  if (excludedCodes.has(code)) throw new ApiError(403, "สินค้าเปลือกไม่อยู่ในขอบเขตหน้าชั่งกลาง");
  if (mapping.data.subcategory_id) {
    const subcategory = await supabaseAdmin.from("production_department_product_subcategories")
      .select("id").eq("id", mapping.data.subcategory_id)
      .eq("department_id", normalizedDepartmentId).maybeSingle();
    if (subcategory.error) throw new ApiError(500, "ตรวจสอบหมวดหมู่ย่อยไม่สำเร็จ");
    if (!subcategory.data) throw new ApiError(403, "หมวดหมู่ย่อยไม่ได้อยู่ในแผนกนี้");
  }
  return { access, productCode: code, subcategoryId: mapping.data.subcategory_id || null };
}

export async function requireWeightScaleLivePermission(request, { manage = false } = {}) {
  return requirePermissionKeys(
    request,
    process.env.CENTRAL_SCALE_RECEIVING_ENABLED === "true"
      ? (manage ? ["central-scale-receive"] : ["central-scale-view", "central-scale-receive"])
      : (manage ? LIVE_SCALE_MANAGE_PERMISSION_KEYS : LIVE_SCALE_PERMISSION_KEYS)
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
