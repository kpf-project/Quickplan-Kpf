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
    const grain = normalizeClaimGrain(body?.grain || body?.bucket || body?.mode, "daily");
    const inputDate = normalizeDateOnly(body?.workDate || body?.bucketDate || body?.weekStartDate);
    const bucketDate = bucketDateForWorkDate(inputDate, grain);
    const note = normalizeParam(body?.note) || null;

    if (!masterPlanNo) {
      return NextResponse.json({ error: "Valid masterPlanNo is required" }, { status: 400 });
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

    const rowsByKey = new Map();
    (queue.rawRows || []).forEach((row) => {
      if (row?.bucketDate !== bucketDate) return;
      if (String(row?.claimStatus || "").trim().toLowerCase() === "claimed") return;

      const assignedDepartment = resolveAssignedDepartment(row, ownerByMaterialKey);
      const assignedDepartmentId = normalizeVerifyDepartmentId(assignedDepartment.departmentId);
      if (!assignedDepartmentId || !canEditAssignedDepartment(scope, assignedDepartmentId)) return;

      const materialSkuCode = normalizeSku(row?.materialSkuCode);
      const materialGoodsCode = normalizeGoodsCode(row?.materialGoodsCode || row?.materialSkuCode, materialSkuCode);
      if (!materialSkuCode || !materialGoodsCode) return;

      const key = `${materialGoodsCode}|${assignedDepartmentId}`;
      if (rowsByKey.has(key)) return;
      rowsByKey.set(key, {
        master_plan_no: masterPlanNo,
        grain,
        bucket_date: bucketDate,
        material_sku_code: materialSkuCode,
        material_goods_code: materialGoodsCode,
        assigned_department_id: assignedDepartmentId,
        verified_at: new Date().toISOString(),
        verified_by: permission.userId,
        note,
      });
    });

    const rows = Array.from(rowsByKey.values());
    if (!rows.length) {
      return NextResponse.json(
        { error: "ไม่พบวัตถุดิบที่สามารถยืนยันได้ในวันที่นี้" },
        { status: 404 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from("production_material_verify_confirmations")
      .upsert(rows, {
        onConflict: "master_plan_no,grain,bucket_date,material_goods_code,assigned_department_id",
      })
      .select("*");

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

    return NextResponse.json(
      { ok: true, data: { verifiedCount: Array.isArray(data) ? data.length : rows.length } },
      { status: 200 }
    );
  } catch (error) {
    return jsonError(error);
  }
}
