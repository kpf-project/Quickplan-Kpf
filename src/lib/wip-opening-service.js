import "server-only";
import { ApiError, getSupabaseAdmin } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { loadWeightScaleLiveDepartmentScope } from "@/lib/scale/live-access";
import { fetchAllSupabaseRows, fetchSupabaseRowsByChunks } from "@/lib/supabaseRangeFetch";
import { normalizeWipOpening } from "@/lib/wip-opening-input";

export async function openingContext(request, manage = false, departmentId = null) {
  const permission = await requirePermissionKeys(request, manage ? ["wip-opening-manage"] : ["wip-opening-view", "wip-opening-manage"]);
  const db = getSupabaseAdmin();
  // Reuse department master-data membership only, not scale products or transactions.
  const scope = await loadWeightScaleLiveDepartmentScope(db, permission);
  const department = departmentId ? scope.departments.find(row => row.id === departmentId) : null;
  if (departmentId && (!department || (manage && department.role !== "editor" && !permission.isAdmin))) throw new ApiError(403, "ไม่มีสิทธิ์ในแผนกนี้");
  return { db, permission, department, departments: scope.departments, canManage: permission.isAdmin || permission.permissions.includes("wip-opening-manage") };
}

export async function openingProductPage(db, departmentId, { page = "1", search = "" } = {}) {
  if (!/^[1-9]\d{0,3}$/.test(String(page)) || typeof search !== "string" || search.length > 200) throw new ApiError(400, "คำค้นหรือหน้าไม่ถูกต้อง");
  const mappings = await fetchAllSupabaseRows(() => db.from("production_department_products").select("sku_code").eq("department_id", departmentId).order("sku_code"));
  const products = await fetchSupabaseRowsByChunks(mappings.map(row => row.sku_code), codes => db.from("products_cache")
    .select("sku_code,sku_name,uom_name,image_url").in("sku_code", codes).eq("iccat_code", "03").order("sku_code").range(0, 999));
  const query = search.trim().toLocaleLowerCase("th");
  const matched = products.filter(row => `${row.sku_code} ${row.sku_name}`.toLocaleLowerCase("th").includes(query)).sort((a, b) => a.sku_code.localeCompare(b.sku_code, "en"));
  return { data: matched.slice((Number(page) - 1) * 25, Number(page) * 25).map(row => ({ code: row.sku_code, name: row.sku_name, unitName: row.uom_name, imageUrl: row.image_url })), totalCount: matched.length };
}

export async function recordOpening(request, input) {
  const body = normalizeWipOpening(input);
  const { db, permission } = await openingContext(request, true, body.departmentId);
  const { data, error } = await db.rpc("record_central_wip_opening", {
    p_request_id: body.requestId, p_actor_id: permission.userId, p_department_id: body.departmentId,
    p_opening_date: body.openingDate, p_entries: body.entries,
  });
  if (error?.code === "23505") throw new ApiError(409, "สินค้า LOT หน่วย หรือวันที่ตั้งต้นถูกบันทึกแล้ว กรุณาตรวจประวัติ ไม่บันทึกซ้ำ");
  if (error?.code === "42501") throw new ApiError(403, "ไม่มีสิทธิ์บันทึกยอดตั้งต้นของแผนกหรือสินค้านี้");
  if (error?.code === "22023" || error?.code === "23514") throw new ApiError(400, "ตรวจสอบวันที่ สินค้า LOT หน่วย และจำนวนให้ถูกต้อง");
  if (error) throw new ApiError(503, "ยังยืนยันผลบันทึกไม่ได้ กรุณาลองคำขอเดิมอีกครั้ง หากยังไม่ติดตั้ง SQL ให้ติดต่อผู้ดูแลระบบ");
  return data;
}
