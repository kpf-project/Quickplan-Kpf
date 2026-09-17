import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeMasterPlanNo } from "@/lib/planNo";
import { normalizeParam } from "@/lib/validation";
import { buildClaimPoolRows } from "@/lib/materialClaimPool";
import {
  canEditAssignedDepartment,
  loadMaterialOwnerMap,
  loadVerifyEditorScope,
  resolveAssignedDepartment,
} from "@/lib/materialVerify";
import {
  bucketDateForWorkDate,
  normalizeClaimGrain,
  normalizeDateOnly,
  normalizeGoodsCode,
  normalizeSku,
} from "@/lib/materialClaims";
import {
  isMissingMaterialVerificationTableError,
  normalizeVerifyDepartmentId,
} from "@/lib/materialVerifyConfirmations";

export const dynamic = "force-dynamic";

function todayInBangkok() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export async function POST(request) {
  try {
    const permission = await requirePermissionKeys(request, [
      "production-line-planning-manage",
      "plan.verify_materials",
    ]);

    const body = await readJson(request);
    const inputMasterPlanNo = normalizeParam(body?.masterPlanNo || body?.planNo);
    const masterPlanNo = normalizeMasterPlanNo(inputMasterPlanNo);
    const materialSkuCode = normalizeSku(body?.materialSkuCode || body?.skuCode);
    const materialGoodsCode = normalizeGoodsCode(body?.materialGoodsCode || body?.goodsCode, materialSkuCode);
    const grain = normalizeClaimGrain(body?.grain || body?.bucket || body?.mode, "daily");
    const assignedDepartmentId = normalizeVerifyDepartmentId(
      body?.materialOwnerDepartmentId || body?.assignedDepartmentId || body?.departmentId
    );
    const inputDate = normalizeDateOnly(body?.workDate || body?.bucketDate || body?.weekStartDate);
    const bucketDate = bucketDateForWorkDate(inputDate, grain);
    const note = normalizeParam(body?.note) || null;

    if (!masterPlanNo) {
      return NextResponse.json({ error: "Valid masterPlanNo is required" }, { status: 400 });
    }
    if (!materialSkuCode) {
      return NextResponse.json({ error: "materialSkuCode is required" }, { status: 400 });
    }
    if (!assignedDepartmentId) {
      return NextResponse.json({ error: "assignedDepartmentId is required" }, { status: 400 });
    }
    if (!bucketDate) {
      return NextResponse.json({ error: "Valid workDate/weekStartDate is required" }, { status: 400 });
    }
    if (bucketDate < todayInBangkok()) {
      return NextResponse.json({ error: "ไม่สามารถยืนยันวันที่ผ่านมาแล้วได้" }, { status: 409 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const [scope, ownerByMaterialKey, queue] = await Promise.all([
      loadVerifyEditorScope(supabaseAdmin, permission.userId, permission.isAdmin),
      loadMaterialOwnerMap(supabaseAdmin),
      buildClaimPoolRows(supabaseAdmin, {
        masterPlanNo,
        grain,
        dateFrom: bucketDate,
        dateTo: bucketDate,
      }),
    ]);

    if (!canEditAssignedDepartment(scope, assignedDepartmentId)) {
      return NextResponse.json(
        { error: "Only the configured material owner department or admin can verify this row" },
        { status: 403 }
      );
    }

    const matchingRows = (queue.rawRows || []).filter((row) => {
      const rowSku = normalizeSku(row?.materialSkuCode);
      const rowGoods = normalizeGoodsCode(row?.materialGoodsCode || row?.materialSkuCode, rowSku);
      const assignedDepartment = resolveAssignedDepartment(row, ownerByMaterialKey);
      return (
        row.bucketDate === bucketDate
        && rowSku === materialSkuCode
        && rowGoods === materialGoodsCode
        && String(assignedDepartment.departmentId || "").trim() === assignedDepartmentId
      );
    });

    if (!matchingRows.length) {
      return NextResponse.json(
        { error: "Material row not found", details: { masterPlanNo, materialSkuCode, bucketDate } },
        { status: 404 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("production_material_verify_confirmations")
      .upsert(
        {
          master_plan_no: masterPlanNo,
          grain,
          bucket_date: bucketDate,
          material_sku_code: materialSkuCode,
          material_goods_code: materialGoodsCode || materialSkuCode,
          assigned_department_id: assignedDepartmentId,
          verified_at: new Date().toISOString(),
          verified_by: permission.userId,
          note,
        },
        {
          onConflict: "master_plan_no,grain,bucket_date,material_goods_code,assigned_department_id",
        }
      )
      .select("*")
      .maybeSingle();

    if (error) {
      if (isMissingMaterialVerificationTableError(error)) {
        return NextResponse.json(
          {
            error: "ยังไม่ได้ติดตั้งตารางยืนยันตรวจสอบวัตถุดิบ กรุณารัน migration 20260616_add_material_verify_confirmations.sql ก่อน",
          },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (error) {
    return jsonError(error);
  }
}
