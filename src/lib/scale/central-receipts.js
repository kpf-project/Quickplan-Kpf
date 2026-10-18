import "server-only";
import { ApiError, getSupabaseAdmin } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { assertWeightScaleLiveProductAccess } from "@/lib/scale/live-access";
import { verifyScaleCaptureEvidence } from "@/lib/scale/capture-evidence";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function requireId(value) {
  if (typeof value !== "string" || !UUID.test(value)) throw new ApiError(400, "รหัสคำขอ แผนก หรือเครื่องชั่งไม่ถูกต้อง");
  return value.toLowerCase();
}
function databaseError(error) {
  const status = { "42501": 403, "23505": 409, "22023": 400, "22003": 409 }[error.code] || 503;
  throw new ApiError(status, status === 409 ? "รอบชั่งหรือคำขอนี้ถูกใช้แล้ว กรุณาตรวจรายการเดิมก่อน"
    : status === 403 ? "ไม่มีสิทธิ์รับเข้าสินค้าในแผนกนี้"
      : status === 400 ? "ข้อมูลรับเข้าไม่ผ่านการตรวจสอบ" : "ระบบรับเข้ากลางยังไม่พร้อม กรุณาตรวจรายการเดิมก่อนลองใหม่");
}

export async function receiveCentralScaleReceipt(request) {
  const permission = await requirePermissionKeys(request, ["central-scale-receive"]);
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get("content-type") || "")) {
    throw new ApiError(415, "ส่งข้อมูลรับเข้าเป็น JSON เท่านั้น");
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) throw new ApiError(403, "คำขอต้องมาจากระบบนี้เท่านั้น");
  const input = await request.json().catch(() => { throw new ApiError(400, "ข้อมูลคำขอไม่ถูกต้อง"); });
  const allowed = new Set(["requestId", "departmentId", "pointId", "productCode", "tareWeightKg", "captureToken"]);
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !allowed.has(key))) {
    throw new ApiError(400, "ส่งได้เฉพาะข้อมูลรับเข้ากลาง ห้ามส่งผู้บันทึกหรือน้ำหนักรวมเอง");
  }
  const requestId = requireId(input.requestId);
  const departmentId = requireId(input.departmentId);
  const pointId = requireId(input.pointId);
  if (typeof input.productCode !== "string" || !input.productCode.trim() || input.productCode.length > 100) {
    throw new ApiError(400, "รหัสสินค้าต้องเป็นข้อความที่ถูกต้อง");
  }
  if (typeof input.tareWeightKg !== "string" || !/^\d{1,7}(\.\d{1,3})?$/.test(input.tareWeightKg)) {
    throw new ApiError(400, "น้ำหนักภาชนะต้องเป็นกิโลกรัม ทศนิยมไม่เกิน 3 ตำแหน่ง");
  }
  const db = getSupabaseAdmin();
  const product = await assertWeightScaleLiveProductAccess(db, { ...permission,
    departmentId, productCode: input.productCode, manage: true });
  const profile = await db.rpc("central_scale_device_profile", { p_point_id: pointId });
  if (profile.error) databaseError(profile.error);
  if (!profile.data) throw new ApiError(503, "เครื่องชั่งยังไม่ได้รับการลงทะเบียนสำหรับระบบกลาง");
  const capture = verifyScaleCaptureEvidence(input.captureToken, profile.data);
  if (Number(input.tareWeightKg) >= Number(capture.grossKg)) throw new ApiError(400, "น้ำหนักสุทธิต้องมากกว่าศูนย์");
  const result = await db.rpc("central_scale_receive", {
    p_request_id: requestId, p_product_code: product.productCode,
    p_actor_id: permission.userId, p_department_id: departmentId,
    p_point_id: capture.pointId, p_cycle_id: capture.cycleId,
    p_gross_kg: capture.grossKg, p_tare_kg: input.tareWeightKg,
  });
  if (result.error) databaseError(result.error);
  if (!result.data?.barcode) throw new ApiError(503, "ยืนยันใบรับเข้าไม่ได้ กรุณาตรวจคำขอเดิมก่อน");
  return result.data;
}

export async function recoverCentralScaleReceipt(request) {
  const permission = await requirePermissionKeys(request, ["central-scale-receive"]);
  const requestId = requireId(new URL(request.url).searchParams.get("requestId"));
  const db = getSupabaseAdmin();
  const result = await db.rpc("central_scale_receipt_get", { p_request_id: requestId, p_actor_id: permission.userId });
  if (result.error) databaseError(result.error);
  if (!result.data) throw new ApiError(404, "ไม่พบใบรับเข้าของคำขอนี้ในบัญชีผู้ใช้ปัจจุบัน");
  await assertWeightScaleLiveProductAccess(db, { ...permission, departmentId: result.data.department_id,
    productCode: result.data.product_code, manage: false });
  return result.data;
}
