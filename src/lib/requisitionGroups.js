import "server-only";

import {
  buildMaterialSourceRowKey,
  normalizeClaimGrain,
  normalizeDateOnly,
  normalizeDepartmentId,
  resolveMaterialClaimCode,
} from "@/lib/materialClaims";

export const REQUISITION_GROUP_STATUS = Object.freeze({
  draft: "draft",
  ready: "ready_to_export",
  exported: "exported",
  cancelled: "cancelled",
});

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function formatDocumentDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear()).padStart(4, "0");
  return `${dd}/${mm}/${yyyy}`;
}

export function buildDocumentSequenceKey(date = new Date()) {
  const current = date instanceof Date ? date : new Date(date);
  const beYear = current.getFullYear() + 543;
  const yy = String(beYear).slice(-2);
  const mm = String(current.getMonth() + 1).padStart(2, "0");
  return `XA${yy}${mm}`;
}

export function formatDocumentNo(sequenceKey, nextValue) {
  return `${sequenceKey}/${String(nextValue).padStart(4, "0")}`;
}

export async function reserveDocumentNumbers(supabaseAdmin, count, now = new Date()) {
  const total = Number(count || 0);
  if (!Number.isInteger(total) || total <= 0) {
    return [];
  }

  const result = await supabaseAdmin.rpc("allocate_requisition_document_numbers", {
    requested_at: (now instanceof Date ? now : new Date(now)).toISOString(),
    requested_count: total,
  });
  if (result.error) {
    throw new Error(result.error.message);
  }
  return (Array.isArray(result.data) ? result.data : [])
    .map((row) => String(row?.document_no || "").trim())
    .filter(Boolean);
}

export function buildRequisitionSourceRowKey(row = {}) {
  return buildMaterialSourceRowKey({
    masterPlanNo: row.masterPlanNo,
    grain: row.grain,
    bucketDate: row.bucketDate,
    materialSkuCode: row.materialSkuCode,
    materialGoodsCode: row.materialGoodsCode,
    ownerDepartmentId: row.ownerDepartmentId,
    demandSource: row.demandSource,
  });
}

export async function listRequisitionGroups(supabaseAdmin, options = {}) {
  let query = supabaseAdmin
    .from("production_requisition_group_batches")
    .select("*")
    .order("created_at", { ascending: false });

  if (options.masterPlanNo) {
    query = query.eq("master_plan_no", String(options.masterPlanNo).trim().toUpperCase());
  }
  if (Array.isArray(options.statuses) && options.statuses.length) {
    query = query.in("status", options.statuses);
  }

  const result = await query;
  if (result.error) {
    throw new Error(result.error.message);
  }
  return Array.isArray(result.data) ? result.data : [];
}

export async function listRequisitionGroupItems(supabaseAdmin, groupIds = []) {
  const ids = Array.from(new Set((groupIds || []).map((item) => String(item || "").trim()).filter(Boolean)));
  if (!ids.length) return [];

  const result = await supabaseAdmin
    .from("production_requisition_group_items")
    .select("*")
    .in("group_id", ids)
    .order("created_at", { ascending: true });

  if (result.error) {
    throw new Error(result.error.message);
  }
  return Array.isArray(result.data) ? result.data : [];
}

export async function loadActiveGroupItemsBySourceKeys(supabaseAdmin, sourceRowKeys = []) {
  const keys = Array.from(new Set((sourceRowKeys || []).map((item) => String(item || "").trim()).filter(Boolean)));
  if (!keys.length) return [];

  const result = await supabaseAdmin
    .from("production_requisition_group_items")
    .select("id,group_id,source_row_key,production_requisition_group_batches!inner(id,status)")
    .in("source_row_key", keys)
    .in("production_requisition_group_batches.status", [
      REQUISITION_GROUP_STATUS.draft,
      REQUISITION_GROUP_STATUS.ready,
      REQUISITION_GROUP_STATUS.exported,
    ]);

  if (result.error) {
    throw new Error(result.error.message);
  }
  return Array.isArray(result.data) ? result.data : [];
}

export function canMergeClaimRows(leftRow, rightRow, options = {}) {
  if (!leftRow || !rightRow) return false;

  const sameMaterial =
    resolveMaterialClaimCode(leftRow.materialSkuCode, leftRow.materialGoodsCode)
    === resolveMaterialClaimCode(rightRow.materialSkuCode, rightRow.materialGoodsCode);
  if (!sameMaterial) return false;

  const leftOwner = normalizeDepartmentId(leftRow.ownerDepartmentId) || "UNASSIGNED";
  const rightOwner = normalizeDepartmentId(rightRow.ownerDepartmentId) || "UNASSIGNED";
  if (leftOwner === rightOwner) return true;

  return Boolean(options.canConsolidateCrossQa);
}

export function summarizeGroupItems(group, items = []) {
  const rows = Array.isArray(items) ? items : [];
  const materialCount = new Set(rows.map((row) => String(row.material_goods_code || row.material_sku_code || "").trim()).filter(Boolean)).size;
  const ownerCount = new Set(rows.map((row) => normalizeDepartmentId(row.owner_department_id)).filter(Boolean)).size;
  const qty = rows.reduce((sum, row) => sum + toNumber(row.issue_qty, 0), 0);

  return {
    ...group,
    itemCount: rows.length,
    materialCount,
    ownerCount,
    totalIssueQty: Number(qty.toFixed(3)),
    items: rows,
  };
}

export function normalizeGroupItemInput(row = {}) {
  return {
    master_plan_no: String(row.masterPlanNo || "").trim().toUpperCase(),
    claim_grain: normalizeClaimGrain(row.grain),
    bucket_date: normalizeDateOnly(row.bucketDate),
    material_sku_code: String(row.materialSkuCode || "").trim().toUpperCase(),
    material_goods_code: resolveMaterialClaimCode(row.materialSkuCode, row.materialGoodsCode),
    owner_department_id: normalizeDepartmentId(row.ownerDepartmentId) || null,
    claim_department_id: normalizeDepartmentId(row.claimDepartmentId) || null,
    issue_qty: Number(toNumber(row.issueQty, 0).toFixed(3)),
    required_qty: Number(toNumber(row.requiredQty, 0).toFixed(3)),
    source_plan_ids: Array.isArray(row.sourcePlanIds) ? row.sourcePlanIds : [],
    source_owner_department_ids: Array.isArray(row.sourceOwnerDepartmentIds) ? row.sourceOwnerDepartmentIds : [],
    source_row_key: buildRequisitionSourceRowKey(row),
    metadata: {
      demandSource: row.demandSource || null,
      demandSourceLabel: row.demandSourceLabel || null,
      ownerDepartmentCode: row.ownerDepartmentCode || null,
      ownerDepartmentName: row.ownerDepartmentName || null,
      claimDepartmentCode: row.claimDepartmentCode || null,
      claimDepartmentName: row.claimDepartmentName || null,
      materialName: row.materialName || null,
      unit: row.unit || null,
      itemType: row.itemType || null,
    },
  };
}
