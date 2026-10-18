import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ApiError } from "@/lib/adminApi";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The key and equipment limits must come from a server-owned registry, never the request.
export function verifyScaleCaptureEvidence(token, device, now = Date.now()) {
  if (typeof token !== "string" || token.length > 4096 || device?.is_active !== true
    || !/^[0-9a-f]{64}$/i.test(device?.signing_key_hex || "")) {
    throw new ApiError(400, "ไม่พบหลักฐานน้ำหนักจากเครื่องชั่งที่ลงทะเบียน");
  }
  const parts = token.split(".");
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]) || !/^[0-9a-f]{64}$/.test(parts[1])) {
    throw new ApiError(400, "หลักฐานน้ำหนักไม่ถูกต้อง");
  }
  const signature = createHmac("sha256", Buffer.from(device.signing_key_hex, "hex")).update(parts[0]).digest();
  if (!timingSafeEqual(signature, Buffer.from(parts[1], "hex"))) throw new ApiError(403, "ยืนยันแหล่งที่มาของน้ำหนักไม่ได้");
  let capture;
  try { capture = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")); }
  catch { throw new ApiError(400, "หลักฐานน้ำหนักอ่านไม่ได้"); }
  const capturedAt = typeof capture?.capturedAt === "string" ? Date.parse(capture.capturedAt) : NaN;
  const gross = typeof capture?.grossKg === "string" && /^\d{1,7}(\.\d{1,3})?$/.test(capture.grossKg)
    ? Number(capture.grossKg) : NaN;
  const maximum = Number(device.max_kg);
  const resolution = Number(device.resolution_kg);
  if (capture?.version !== 1 || capture?.stable !== true || !UUID.test(capture?.pointId || "")
    || capture.pointId.toLowerCase() !== String(device.point_id).toLowerCase() || !UUID.test(capture?.cycleId || "")
    || !Number.isFinite(capturedAt) || !/(Z|[+-]\d{2}:\d{2})$/.test(capture.capturedAt)
    || capturedAt > now + 2000 || now - capturedAt > 5000
    || !Number.isFinite(gross) || gross <= 0 || !Number.isFinite(maximum) || maximum <= 0 || maximum > 1000000 || gross > maximum
    || !Number.isFinite(resolution) || resolution < 0.001 || resolution * 1000 !== Math.round(resolution * 1000)
    || Math.round(gross * 1000) % Math.round(resolution * 1000) !== 0) {
    throw new ApiError(400, "น้ำหนักไม่นิ่ง หมดอายุ หรือไม่ตรงกับขีดจำกัดเครื่องชั่ง");
  }
  return { pointId: capture.pointId.toLowerCase(), cycleId: capture.cycleId.toLowerCase(), grossKg: capture.grossKg };
}
