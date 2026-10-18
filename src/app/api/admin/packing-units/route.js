import { ApiError, getSupabaseAdmin, jsonError, readJson, requireAdmin } from "@/lib/adminApi";
import { productProfile } from "@/lib/packing-workspace-service";
import { packingUnitSettingKey } from "@/lib/packingUnitSettings";
import { supplementPackingUnits } from "@/lib/packingUnits";
import { logAuditEvent } from "@/lib/auditLog";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const actor = await requireAdmin(request);
    const body = await readJson(request);
    const code = String(body.productCode || "").trim().toUpperCase();
    if (!/^[A-Z0-9-]{1,60}$/.test(code) || !/^[0-9a-f-]{36}$/i.test(body.departmentId || "")) throw new ApiError(400, "สินค้าและแผนกไม่ถูกต้อง");
    const db = getSupabaseAdmin();
    const profile = await productProfile(db, body.departmentId, code);
    if (profile.unitSupplement) throw new ApiError(409, "สินค้านี้ตั้งค่าหน่วยแล้ว กรุณาโหลดสินค้าใหม่");
    if (profile.unitVersion !== body.unitVersion) throw new ApiError(409, "ข้อมูลหน่วยเปลี่ยนแล้ว กรุณาโหลดสินค้าใหม่");
    const setting = { parentCode: body.parentCode, childCode: body.childCode, quantity: body.quantity };
    if (profile.units.some(unit => unit.code === setting.childCode)) throw new ApiError(400, "เติมได้เฉพาะหน่วยที่ยังไม่มีในข้อมูลสินค้า");
    try { supplementPackingUnits(profile.units, setting); } catch (error) { throw new ApiError(400, error.message); }
    const { data: documents, error: checkError } = await db.from("production_packing_documents").select("id").eq("product_code", code).limit(1);
    if (checkError) throw checkError;
    if (documents.length) throw new ApiError(409, "สินค้ามีประวัติบันทึกหลายหน่วยแล้ว ต้องตรวจยอดเดิมก่อนเปลี่ยนหน่วย");
    const { error } = await db.from("system_settings").insert({ setting_key: packingUnitSettingKey(code), setting_value: setting, updated_by: actor.userId, updated_at: new Date().toISOString() });
    if (error?.code === "23505") throw new ApiError(409, "มีผู้ตั้งค่าหน่วยแล้ว กรุณาโหลดสินค้าใหม่");
    if (error) throw error;
    await logAuditEvent({ actorId: actor.userId, action: "packing.units.configure", targetTable: "system_settings", metadata: { productCode: code, ...setting } });
    return Response.json({ ok: true });
  } catch (error) { return jsonError(error); }
}
