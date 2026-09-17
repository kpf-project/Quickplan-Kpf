import "server-only";

import {
  normalizeClaimGrain,
  normalizeDateOnly,
  normalizeGoodsCode,
  normalizeSku,
} from "@/lib/materialClaims";
import { normalizeMasterPlanNo } from "@/lib/planNo";
import { UNASSIGNED_DEPARTMENT_ID } from "@/lib/materialVerify";

export function normalizeVerifyDepartmentId(value) {
  const departmentId = String(value || "").trim();
  if (!departmentId || departmentId === UNASSIGNED_DEPARTMENT_ID) return "";
  return departmentId;
}

export function isMissingMaterialVerificationTableError(error) {
  const message = String(error?.message || "");
  return Boolean(
    error?.code === "42P01"
    || error?.code === "PGRST205"
    || message.includes("production_material_verify_confirmations")
    || message.includes("schema cache")
  );
}

export function buildMaterialVerifyKey({
  masterPlanNo,
  grain,
  bucketDate,
  materialSkuCode,
  materialGoodsCode,
  assignedDepartmentId,
}) {
  const normalizedSku = normalizeSku(materialSkuCode);
  const normalizedGoods = normalizeGoodsCode(materialGoodsCode || normalizedSku, normalizedSku);
  const normalizedDepartmentId = normalizeVerifyDepartmentId(assignedDepartmentId);
  const normalizedMasterPlanNo = normalizeMasterPlanNo(masterPlanNo);
  const normalizedBucketDate = normalizeDateOnly(bucketDate);
  if (!normalizedMasterPlanNo || !normalizedGoods || !normalizedBucketDate || !normalizedDepartmentId) {
    return "";
  }
  return [
    normalizedMasterPlanNo,
    normalizeClaimGrain(grain, "daily"),
    normalizedBucketDate,
    normalizedGoods,
    normalizedDepartmentId,
  ].join("|");
}

export async function loadMaterialVerificationSet(supabaseAdmin, options = {}) {
  const masterPlanNo = normalizeMasterPlanNo(options?.masterPlanNo);
  const grain = normalizeClaimGrain(options?.grain, "daily");
  const bucketDates = Array.from(
    new Set((options?.bucketDates || []).map((item) => normalizeDateOnly(item)).filter(Boolean))
  );
  const materialGoodsCodes = Array.from(
    new Set((options?.materialGoodsCodes || []).map((item) => normalizeGoodsCode(item, item)).filter(Boolean))
  );
  const assignedDepartmentIds = Array.from(
    new Set((options?.assignedDepartmentIds || []).map((item) => normalizeVerifyDepartmentId(item)).filter(Boolean))
  );

  if (!masterPlanNo || !bucketDates.length || !materialGoodsCodes.length || !assignedDepartmentIds.length) {
    return new Set();
  }

  const { data, error } = await supabaseAdmin
    .from("production_material_verify_confirmations")
    .select("master_plan_no,grain,bucket_date,material_sku_code,material_goods_code,assigned_department_id")
    .eq("master_plan_no", masterPlanNo)
    .eq("grain", grain)
    .in("bucket_date", bucketDates)
    .in("material_goods_code", materialGoodsCodes)
    .in("assigned_department_id", assignedDepartmentIds);
  if (error) {
    if (isMissingMaterialVerificationTableError(error)) {
      return new Set();
    }
    throw error;
  }

  return new Set(
    (data || [])
      .map((row) => buildMaterialVerifyKey({
        masterPlanNo: row?.master_plan_no,
        grain: row?.grain,
        bucketDate: row?.bucket_date,
        materialSkuCode: row?.material_sku_code,
        materialGoodsCode: row?.material_goods_code,
        assignedDepartmentId: row?.assigned_department_id,
      }))
      .filter(Boolean)
  );
}

export async function annotateRowsWithMaterialVerification(supabaseAdmin, rows = [], options = {}) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const masterPlanNo = normalizeMasterPlanNo(options?.masterPlanNo || normalizedRows[0]?.masterPlanNo);
  const grain = normalizeClaimGrain(options?.grain || normalizedRows[0]?.grain, "daily");
  const verifiedSet = await loadMaterialVerificationSet(supabaseAdmin, {
    masterPlanNo,
    grain,
    bucketDates: normalizedRows.map((row) => row?.bucketDate),
    materialGoodsCodes: normalizedRows.map((row) => row?.materialGoodsCode || row?.materialSkuCode),
    assignedDepartmentIds: normalizedRows.map((row) => row?.assignedDepartmentId),
  });

  return normalizedRows.map((row) => {
    const materialVerified = verifiedSet.has(buildMaterialVerifyKey({
      masterPlanNo,
      grain,
      bucketDate: row?.bucketDate,
      materialSkuCode: row?.materialSkuCode,
      materialGoodsCode: row?.materialGoodsCode || row?.materialSkuCode,
      assignedDepartmentId: row?.assignedDepartmentId,
    }));
    return {
      ...row,
      materialVerified,
      materialVerificationStatus: materialVerified ? "verified" : "pending",
    };
  });
}
