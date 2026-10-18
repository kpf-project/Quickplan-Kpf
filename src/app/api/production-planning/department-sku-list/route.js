import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeParam } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * GET /api/production-planning/department-sku-list?departmentId=xxx
 *
 * คืน SKU ที่ถูกกำหนดไว้ในแผนกนั้น (เฉพาะ sku_code + iccat_code)
 * ใช้สำหรับ filter รายการสินค้าใน dialog "เพิ่มรายการผลิต"
 * ใช้สิทธิ์ planning เท่านั้น ไม่ต้องการ settings permission
 */
export async function GET(request) {
  try {
    await requirePermissionKeys(request, [
      "production-line-planning-manage",
      "production-line-planning-view",
      "plan.edit_own_dept",
    ]);

    const { searchParams } = new URL(request.url);
    const departmentId = normalizeParam(searchParams.get("departmentId"));
    if (!departmentId) {
      return NextResponse.json({ error: "departmentId is required" }, { status: 400 });
    }

    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("production_department_products")
      .select("sku_code, products_cache(iccat_code)")
      .eq("department_id", departmentId);

    if (error) {
      return NextResponse.json({ error: "Failed to load department SKUs" }, { status: 500 });
    }

    const skus = (data ?? []).map((row) => ({
      sku_code: String(row.sku_code || "").trim().toUpperCase(),
      iccat_code: String(row.products_cache?.iccat_code || "").trim(),
    })).filter((row) => row.sku_code);

    return NextResponse.json({ ok: true, data: skus });
  } catch (error) {
    return jsonError(error);
  }
}
