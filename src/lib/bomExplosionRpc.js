import "server-only";

const DEFAULT_FORMULA_CODE = "DEFAULT";

function normalizeSku(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeFormulaCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized || DEFAULT_FORMULA_CODE;
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function explodeBomBatch(supabaseAdmin, planItems = [], maxDepth = 12) {
  const payload = (Array.isArray(planItems) ? planItems : [])
    .map((row, index) => ({
      plan_id: String(row?.planId || row?.plan_id || `PLAN-${index + 1}`).trim(),
      sku_code: normalizeSku(row?.skuCode || row?.sku_code),
      planned_qty: toFiniteNumber(row?.plannedQty ?? row?.planned_qty ?? row?.quantity, 0),
      formula_code: normalizeFormulaCode(row?.formulaCode || row?.formula_code),
      bom_version_id: row?.bomVersionId || row?.bom_version_id || null,
    }))
    .filter((row) => row.sku_code && row.planned_qty > 0);

  if (!payload.length) {
    return [];
  }

  const { data, error } = await supabaseAdmin.rpc("explode_bom_batch", {
    p_plan_items: payload,
    p_max_depth: Math.max(1, Math.min(30, Math.trunc(toFiniteNumber(maxDepth, 12)))),
  });
  if (error) {
    throw new Error(error.message || "Failed to execute explode_bom_batch");
  }

  return (Array.isArray(data) ? data : [])
    .map((row) => ({
      planId: String(row?.plan_id || "").trim(),
      rootSkuCode: normalizeSku(row?.root_sku_code),
      materialSkuCode: normalizeSku(row?.material_sku_code),
      materialGoodsCode: normalizeSku(row?.material_goods_code || row?.material_sku_code),
      materialName: String(row?.material_name || "").trim() || "Unknown Material",
      itemType: String(row?.item_type || "UNKNOWN").trim().toUpperCase() || "UNKNOWN",
      requiredQty: toFiniteNumber(row?.required_qty, 0),
      issueQty: toFiniteNumber(row?.issue_qty, 0),
      uomName: String(row?.uom_name || "").trim() || "unit",
      maxDepth: Math.max(0, Math.trunc(toFiniteNumber(row?.max_depth, 0))),
      hasCycle: Boolean(row?.has_cycle),
      explosionRows: Math.max(0, Math.trunc(toFiniteNumber(row?.explosion_rows, 0))),
    }))
    .filter((row) => row.materialSkuCode && (row.requiredQty > 0 || row.hasCycle));
}

export async function explodeBomBatchWithPlanningOffsets(supabaseAdmin, planItems = [], maxDepth = 12) {
  const payload = (Array.isArray(planItems) ? planItems : [])
    .map((row, index) => ({
      plan_id: String(row?.planId || row?.plan_id || `PLAN-${index + 1}`).trim(),
      sku_code: normalizeSku(row?.skuCode || row?.sku_code),
      planned_qty: toFiniteNumber(row?.plannedQty ?? row?.planned_qty ?? row?.quantity, 0),
      formula_code: normalizeFormulaCode(row?.formulaCode || row?.formula_code),
      bom_version_id: row?.bomVersionId || row?.bom_version_id || null,
    }))
    .filter((row) => row.sku_code && row.planned_qty > 0);

  if (!payload.length) {
    return [];
  }

  const { data, error } = await supabaseAdmin.rpc("explode_bom_batch_with_planning_offsets", {
    p_plan_items: payload,
    p_max_depth: Math.max(1, Math.min(30, Math.trunc(toFiniteNumber(maxDepth, 12)))),
  });
  if (error) {
    throw new Error(error.message || "Failed to execute explode_bom_batch_with_planning_offsets");
  }

  return (Array.isArray(data) ? data : [])
    .map((row) => ({
      planId: String(row?.plan_id || "").trim(),
      rootSkuCode: normalizeSku(row?.root_sku_code),
      materialSkuCode: normalizeSku(row?.material_sku_code),
      materialGoodsCode: normalizeSku(row?.material_goods_code || row?.material_sku_code),
      materialName: String(row?.material_name || "").trim() || "Unknown Material",
      itemType: String(row?.item_type || "UNKNOWN").trim().toUpperCase() || "UNKNOWN",
      requiredQty: toFiniteNumber(row?.required_qty, 0),
      issueQty: toFiniteNumber(row?.issue_qty, 0),
      uomName: String(row?.uom_name || "").trim() || "unit",
      maxDepth: Math.max(0, Math.trunc(toFiniteNumber(row?.max_depth, 0))),
      hasCycle: Boolean(row?.has_cycle),
      explosionRows: Math.max(0, Math.trunc(toFiniteNumber(row?.explosion_rows, 0))),
      planningOffsetDays: Math.trunc(toFiniteNumber(row?.planning_offset_days, 0)),
    }))
    .filter((row) => row.materialSkuCode && (row.requiredQty > 0 || row.hasCycle));
}
