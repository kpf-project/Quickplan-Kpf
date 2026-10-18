import "server-only";
import { ApiError, getSupabaseAdmin } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { assertWeightScaleLiveProductAccess, loadWeightScaleLiveAccess } from "@/lib/scale/live-access";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function id(value) {
  if (typeof value !== "string" || !UUID.test(value)) throw new ApiError(400, "รหัสแผนก จุดชั่ง หรือคำขอไม่ถูกต้อง");
  return value.toLowerCase();
}
function enabled() {
  if (process.env.CENTRAL_SCALE_RECEIVING_ENABLED !== "true") throw new ApiError(503, "ระบบรับเข้ากลางยังไม่เปิดใช้งาน");
}
function checked(result) {
  if (result.error) throw new ApiError(result.error.code === "42501" ? 403 : result.error.code === "22023" ? 400 : 503,
    "ตรวจข้อมูลรับเข้ากลางไม่สำเร็จ ห้ามรับซ้ำจนกว่าจะตรวจผลรายการเดิมได้");
  if (!result.data) throw new ApiError(503, "ระบบรับเข้ากลางไม่ตอบข้อมูลที่ยืนยันได้");
  return result.data;
}

export async function loadCentralInboundHistory(request) {
  const permission = await requirePermissionKeys(request, ["central-scale-view", "central-scale-receive"]);
  enabled();
  const params = new URL(request.url).searchParams;
  const departmentId = id(params.get("departmentId"));
  const pointId = id(params.get("pointId"));
  const date = params.get("date");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !Number.isFinite(Date.parse(date))
    || new Date(date).toISOString().slice(0, 10) !== date) throw new ApiError(400, "วันที่ประวัติไม่ถูกต้อง");
  const pageText = params.get("page") || "0";
  const sizeText = params.get("pageSize") || "25";
  if (!/^\d{1,5}$/.test(pageText) || Number(pageText) > 10000 || !["15", "25", "50", "100"].includes(sizeText)) {
    throw new ApiError(400, "จำนวนหน้าหรือจำนวนรายการไม่ถูกต้อง");
  }
  const db = getSupabaseAdmin();
  const access = await loadWeightScaleLiveAccess(db, { ...permission, departmentId });
  if (!access.canView) throw new ApiError(403, "ไม่มีสิทธิ์ดูประวัติแผนกนี้");
  return checked(await db.rpc("central_scale_receipt_history", { p_actor_id: permission.userId,
    p_department_id: departmentId, p_point_id: pointId, p_production_date: date,
    p_page: Number(pageText), p_page_size: Number(sizeText) }));
}

export async function loadCentralInboundReadiness(request) {
  const permission = await requirePermissionKeys(request, ["central-scale-receive"]);
  enabled();
  const params = new URL(request.url).searchParams;
  const departmentId = id(params.get("departmentId"));
  const pointId = id(params.get("pointId"));
  const db = getSupabaseAdmin();
  const product = await assertWeightScaleLiveProductAccess(db, { ...permission, departmentId,
    productCode: params.get("productCode"), manage: true });
  return checked(await db.rpc("central_scale_readiness", { p_actor_id: permission.userId,
    p_department_id: departmentId, p_point_id: pointId, p_product_code: product.productCode }));
}

export async function loadCentralInboundPrintReceipt(request) {
  const permission = await requirePermissionKeys(request, ["central-scale-view", "central-scale-receive"]);
  enabled();
  const params = new URL(request.url).searchParams;
  const db = getSupabaseAdmin();
  const result = await db.rpc("central_scale_receipt_for_print", { p_request_id: id(params.get("requestId")),
    p_actor_id: permission.userId, p_department_id: id(params.get("departmentId")), p_point_id: id(params.get("pointId")) });
  return checked(result);
}

export async function resolveCentralInboundPending(request) {
  const permission = await requirePermissionKeys(request, ["central-scale-receive"]);
  enabled();
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new ApiError(403, "คำขอต้องมาจากระบบนี้");
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) throw new ApiError(415, "ส่งข้อมูลเป็น JSON เท่านั้น");
  const input = await request.json().catch(() => { throw new ApiError(400, "ข้อมูลคำขอไม่ถูกต้อง"); });
  if (!input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).some(key => !["requestId", "departmentId", "pointId", "productCode"].includes(key))) throw new ApiError(400, "ข้อมูลปิดคำขอไม่ถูกต้อง");
  const requestId = id(input.requestId);
  const departmentId = id(input.departmentId);
  const pointId = id(input.pointId);
  const db = getSupabaseAdmin();
  const product = await assertWeightScaleLiveProductAccess(db, { ...permission, departmentId, productCode: input.productCode, manage: true });
  return checked(await db.rpc("central_scale_resolve_receipt", { p_request_id: requestId,
    p_actor_id: permission.userId, p_department_id: departmentId, p_point_id: pointId, p_product_code: product.productCode }));
}
