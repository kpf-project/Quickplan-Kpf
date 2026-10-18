import { ApiError, getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { assertWeightScaleLiveProductAccess, loadWeightScaleLiveAccess, requireWeightScaleLivePermission } from "@/lib/scale/live-access";
import { normalizeProductHotkey } from "@/lib/productHotkeys";

export const dynamic = "force-dynamic";

async function authorize(request, departmentId, manage) {
  const permission = await requireWeightScaleLivePermission(request, { manage });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(departmentId || "")) throw new ApiError(400, "กรุณาเลือกแผนก");
  const db = getSupabaseAdmin();
  const access = await loadWeightScaleLiveAccess(db, { ...permission, departmentId });
  if (!access.canView || (manage && !access.canOperate)) throw new ApiError(403, "ไม่มีสิทธิ์ตั้งค่าปุ่มลัดในแผนกนี้");
  return { db, permission, access };
}

async function loadBindings(db, departmentId) {
  const { data, error } = await db.from("production_department_product_hotkeys").select("product_code,hotkey").eq("department_id", departmentId);
  if (error) throw new ApiError(503, "โหลดปุ่มลัดกลางไม่สำเร็จ กรุณาติดต่อผู้ดูแลระบบ");
  return Object.fromEntries((data || []).map(row => [row.product_code, row.hotkey]));
}

export async function GET(request) {
  try {
    const departmentId = new URL(request.url).searchParams.get("departmentId");
    const { db, access } = await authorize(request, departmentId, false);
    return Response.json({ bindings: await loadBindings(db, departmentId), canManage: access.canOperate }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return jsonError(error); }
}

export async function POST(request) {
  try {
    const input = await readJson(request);
    const { departmentId } = input;
    const { db, permission } = await authorize(request, departmentId, true);
    const productCode = String(input.productCode || "").trim().toUpperCase();
    const hotkey = normalizeProductHotkey(input.hotkey);
    if (!productCode || productCode.length > 100 || !hotkey) throw new ApiError(400, "เลือกสินค้าและใช้คีย์ 1–9 หรือ A–Z");
    await assertWeightScaleLiveProductAccess(db, {
      userId: permission.userId, isAdmin: permission.isAdmin,
      departmentId, productCode, manage: true,
    });
    const { error } = await db.from("production_department_product_hotkeys").upsert({
      department_id: departmentId, product_code: productCode, hotkey,
      updated_by: permission.userId, updated_at: new Date().toISOString(),
    }, { onConflict: "department_id,product_code" });
    if (error?.code === "23505") throw new ApiError(409, "คีย์นี้ถูกใช้กับสินค้าอื่นในแผนกแล้ว กรุณาเลือกคีย์ใหม่");
    if (error) throw new ApiError(503, "บันทึกปุ่มลัดกลางไม่สำเร็จ");
    return Response.json({ bindings: await loadBindings(db, departmentId) });
  } catch (error) { return jsonError(error); }
}
