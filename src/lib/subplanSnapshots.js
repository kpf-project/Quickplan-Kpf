import "server-only";

import { normalizeMasterPlanNo } from "@/lib/planNo";
import { fetchSupabaseRowsByChunks } from "@/lib/supabaseRangeFetch";
import {
  normalizeFormulaCode,
  normalizeSku,
  roundQty,
  toFiniteNumber,
} from "@/lib/wipPlanning";

const WIP_QTY_INPUT_MODES = {
  UNIT: "unit",
  BATCH: "batch",
};
const CALCULATION_BASIS = {
  JOB_QTY: "JOB_QTY",
  HEADCOUNT: "HEADCOUNT",
  MACHINE_COUNT: "MACHINE_COUNT",
  DOUGH_SET_COUNT: "DOUGH_SET_COUNT",
};
const HEADCOUNT_ROUND_MODE = {
  NONE: "NONE",
  UP: "UP",
  DOWN: "DOWN",
  NEAREST: "NEAREST",
};

export function normalizeWipQtyInputMode(value, fallback = WIP_QTY_INPUT_MODES.BATCH) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === WIP_QTY_INPUT_MODES.UNIT || normalized === WIP_QTY_INPUT_MODES.BATCH) {
    return normalized;
  }
  return fallback;
}

export function resolveSubplanBomScaleBase(versionRow) {
  const baseOutputBoxes = Number(versionRow?.base_output_boxes);
  const baseBatch = Number(versionRow?.base_batch);
  const wipQtyInputMode = normalizeWipQtyInputMode(versionRow?.wip_qty_input_mode);
  if (wipQtyInputMode === WIP_QTY_INPUT_MODES.UNIT) {
    if (Number.isFinite(baseOutputBoxes) && baseOutputBoxes > 0) return baseOutputBoxes;
    if (Number.isFinite(baseBatch) && baseBatch > 0) return baseBatch;
    return 1;
  }
  if (Number.isFinite(baseBatch) && baseBatch > 0) return baseBatch;
  if (Number.isFinite(baseOutputBoxes) && baseOutputBoxes > 0) return baseOutputBoxes;
  return 1;
}

function normalizeCalculationBasis(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === CALCULATION_BASIS.HEADCOUNT) {
    return CALCULATION_BASIS.HEADCOUNT;
  }
  if (normalized === CALCULATION_BASIS.MACHINE_COUNT) {
    return CALCULATION_BASIS.MACHINE_COUNT;
  }
  if (normalized === CALCULATION_BASIS.DOUGH_SET_COUNT) {
    return CALCULATION_BASIS.DOUGH_SET_COUNT;
  }
  return CALCULATION_BASIS.JOB_QTY;
}

function normalizeHeadcountRoundMode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === HEADCOUNT_ROUND_MODE.UP) return HEADCOUNT_ROUND_MODE.UP;
  if (normalized === HEADCOUNT_ROUND_MODE.DOWN) return HEADCOUNT_ROUND_MODE.DOWN;
  if (normalized === HEADCOUNT_ROUND_MODE.NEAREST) return HEADCOUNT_ROUND_MODE.NEAREST;
  return HEADCOUNT_ROUND_MODE.NONE;
}

function applyHeadcountRoundMode(value, mode) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  const resolvedMode = normalizeHeadcountRoundMode(mode);
  if (resolvedMode === HEADCOUNT_ROUND_MODE.UP) return Math.ceil(numeric);
  if (resolvedMode === HEADCOUNT_ROUND_MODE.DOWN) return Math.floor(numeric);
  if (resolvedMode === HEADCOUNT_ROUND_MODE.NEAREST) return Math.round(numeric);
  return numeric;
}

function computeRequiredQtyFromBasis({
  plannedQty = 0,
  lineStaffCount = null,
  lineMachineNo = null,
  lineDoughSetCount = null,
  itemQty = 0,
  scaleBase = 1,
  calculationBasis = "JOB_QTY",
  headcountBase = 1,
  headcountRoundMode = "NONE",
  machineBase = 1,
  machineRoundMode = "NONE",
  doughSetBase = 1,
  doughSetRoundMode = "NONE",
}) {
  const qty = toFiniteNumber(itemQty, 0);
  if (qty <= 0) return 0;
  const basis = normalizeCalculationBasis(calculationBasis);
  if (basis === CALCULATION_BASIS.HEADCOUNT) {
    const people = Number(lineStaffCount);
    if (Number.isFinite(people) && people > 0) {
      const base = Math.max(0.0001, toFiniteNumber(headcountBase, 1));
      return applyHeadcountRoundMode((people / base) * qty, headcountRoundMode);
    }
  }
  if (basis === CALCULATION_BASIS.MACHINE_COUNT) {
    const machines = Number(lineMachineNo);
    if (Number.isFinite(machines) && machines > 0) {
      const base = Math.max(0.0001, toFiniteNumber(machineBase, 1));
      return applyHeadcountRoundMode((machines / base) * qty, machineRoundMode);
    }
  }
  if (basis === CALCULATION_BASIS.DOUGH_SET_COUNT) {
    const doughSets = Number(lineDoughSetCount);
    if (Number.isFinite(doughSets) && doughSets > 0) {
      const base = Math.max(0.0001, toFiniteNumber(doughSetBase, 1));
      return applyHeadcountRoundMode((doughSets / base) * qty, doughSetRoundMode);
    }
  }
  const resolvedScaleBase = scaleBase > 0 ? scaleBase : 1;
  return (toFiniteNumber(plannedQty, 0) / resolvedScaleBase) * qty;
}

function resolveItemTypeByCategory(iccatCode) {
  const normalized = String(iccatCode || "").trim().toUpperCase();
  if (normalized === "03") return "WIP";
  if (normalized) return "RAW";
  return "UNKNOWN";
}

export function chooseApprovedVersionForPlan(planRow, versions = []) {
  const preferredVersionId = String(planRow?.bom_version_id || "").trim();
  const preferredFormulaCode = normalizeFormulaCode(planRow?.formula_code);
  return (
    versions.find((version) => String(version?.id || "") === preferredVersionId) ||
    versions.find((version) => normalizeFormulaCode(version?.formula_code) === preferredFormulaCode) ||
    versions[0] ||
    null
  );
}

export async function loadApprovedBomVersionsBySku(supabaseAdmin, skuCodes = []) {
  const normalizedSkus = Array.from(new Set((skuCodes || []).map(normalizeSku).filter(Boolean)));
  if (!normalizedSkus.length) return new Map();
  const selectWithPlanningBases = `
      sku_code,
      production_bom_versions!inner (
        id,
        version_no,
        status,
        formula_code,
        formula_name,
        base_batch,
        base_output_boxes,
        wip_qty_input_mode,
        production_bom_items (
          material_sku_code,
          material_goods_code,
          qty,
          calculation_basis,
          headcount_base,
          headcount_round_mode,
          machine_base,
          machine_round_mode,
          dough_set_base,
          dough_set_round_mode,
          uom_name,
          products_cache (
            sku_name,
            iccat_code
          )
        )
      )
    `;
  const selectLegacy = `
        sku_code,
        production_bom_versions!inner (
          id,
          version_no,
          status,
          formula_code,
          formula_name,
          base_batch,
          base_output_boxes,
          wip_qty_input_mode,
          production_bom_items (
            material_sku_code,
            material_goods_code,
            qty,
            calculation_basis,
            headcount_base,
            headcount_round_mode,
            uom_name,
            products_cache (
              sku_name,
              iccat_code
            )
          )
        )
      `;
  let rows;
  try {
    rows = await fetchSupabaseRowsByChunks(
      normalizedSkus,
      (chunk) => supabaseAdmin
        .from("production_boms")
        .select(selectWithPlanningBases)
        .in("sku_code", chunk)
        .eq("production_bom_versions.status", "approved")
        .order("version_no", { foreignTable: "production_bom_versions", ascending: false }),
      { chunkSize: 20, maxEncodedValuesLength: 1200 }
    );
  } catch (error) {
    const message = String(error?.message || "").toLowerCase();
    const isMissingPlanningBaseColumn =
      message.includes("machine_base")
      || message.includes("machine_round_mode")
      || message.includes("dough_set_base")
      || message.includes("dough_set_round_mode");
    if (!isMissingPlanningBaseColumn) throw error;

    const legacyRows = await fetchSupabaseRowsByChunks(
      normalizedSkus,
      (chunk) => supabaseAdmin
        .from("production_boms")
        .select(selectLegacy)
        .in("sku_code", chunk)
        .eq("production_bom_versions.status", "approved")
        .order("version_no", { foreignTable: "production_bom_versions", ascending: false }),
      { chunkSize: 20, maxEncodedValuesLength: 1200 }
    );
    rows = legacyRows.map((row) => ({
        ...row,
        production_bom_versions: (Array.isArray(row?.production_bom_versions) ? row.production_bom_versions : []).map((version) => ({
          ...version,
          production_bom_items: (Array.isArray(version?.production_bom_items) ? version.production_bom_items : []).map((item) => ({
            ...item,
            machine_base: 1,
            machine_round_mode: HEADCOUNT_ROUND_MODE.NONE,
            dough_set_base: 1,
            dough_set_round_mode: HEADCOUNT_ROUND_MODE.NONE,
          })),
        })),
      }));
  }
  const versionsBySku = new Map();
  rows.forEach((row) => {
    const skuCode = normalizeSku(row?.sku_code);
    const versions = Array.isArray(row?.production_bom_versions)
      ? row.production_bom_versions
      : [];
    if (!skuCode || !versions.length) return;
    versionsBySku.set(skuCode, versions);
  });
  return versionsBySku;
}

export function buildDirectSubplanSnapshot(planRow, selectedVersion, nowIso, options = {}) {
  if (!selectedVersion) {
    return null;
  }
  const skuCode = normalizeSku(planRow?.sku_code);
  const plannedQty = toFiniteNumber(planRow?.planned_qty, 0);
  const lineStaffCount = toFiniteNumber(planRow?.line_staff_count ?? planRow?.lineStaffCount, 0);
  const lineMachineNo = toFiniteNumber(planRow?.line_machine_no ?? planRow?.lineMachineNo, 0);
  const lineDoughSetCount = toFiniteNumber(
    planRow?.line_dough_set_count ?? planRow?.lineDoughSetCount,
    0
  );
  const scaleBase = resolveSubplanBomScaleBase(selectedVersion);
  const materials = (Array.isArray(selectedVersion?.production_bom_items)
    ? selectedVersion.production_bom_items
    : [])
    .map((item) => {
      const cachedProduct = Array.isArray(item?.products_cache)
        ? item.products_cache[0]
        : item?.products_cache;
      const requiredQty = roundQty(
        computeRequiredQtyFromBasis({
          plannedQty,
          lineStaffCount,
          itemQty: item?.qty,
          scaleBase,
          calculationBasis: item?.calculation_basis,
          headcountBase: item?.headcount_base,
          headcountRoundMode: item?.headcount_round_mode,
          machineBase: item?.machine_base,
          machineRoundMode: item?.machine_round_mode,
          doughSetBase: item?.dough_set_base,
          doughSetRoundMode: item?.dough_set_round_mode,
          lineMachineNo,
          lineDoughSetCount,
        })
      );
      return {
        skuCode: normalizeSku(item?.material_sku_code),
        goodsCode: normalizeSku(item?.material_goods_code || item?.material_sku_code),
        name: String(cachedProduct?.sku_name || "").trim() || normalizeSku(item?.material_sku_code),
        requiredQty,
        issueQty: Math.ceil(requiredQty),
        unit: String(item?.uom_name || "").trim() || "unit",
        itemType: resolveItemTypeByCategory(cachedProduct?.iccat_code),
        hasCycle: false,
        explosionDepth: 1,
      };
    })
    .filter((row) => row.skuCode && row.requiredQty > 0);

  return {
    skuCode,
    skuName: String(planRow?.sku_name || "").trim() || skuCode,
    plannedQty: roundQty(plannedQty),
    baseBatch: Number(selectedVersion?.base_batch) > 0 ? Number(selectedVersion.base_batch) : 1,
    unit: String(planRow?.unit || "unit").trim() || "unit",
    bomVersionId: selectedVersion?.id || planRow?.bom_version_id || null,
    formulaCode: normalizeFormulaCode(selectedVersion?.formula_code || planRow?.formula_code),
    formulaName: String(selectedVersion?.formula_name || planRow?.formula_name || "").trim() || "DEFAULT",
    generatedAt: nowIso,
    source: String(options?.source || "subplan_confirm"),
    materials,
  };
}

export function buildRecursiveSubplanSnapshot(planRow, explodedRows = [], nowIso, options = {}) {
  const skuCode = normalizeSku(planRow?.sku_code || planRow?.skuCode);
  const plannedQty = toFiniteNumber(planRow?.planned_qty ?? planRow?.plannedQty, 0);
  const materials = (Array.isArray(explodedRows) ? explodedRows : [])
    .filter((item) => String(item?.itemType || "").trim().toUpperCase() !== "WIP")
    .map((item) => {
      const requiredQty = roundQty(item?.requiredQty, 3);
      const issueQty = toFiniteNumber(item?.issueQty, Math.ceil(requiredQty));
      return {
        skuCode: normalizeSku(item?.materialSkuCode),
        goodsCode: normalizeSku(item?.materialGoodsCode || item?.materialSkuCode),
        name: String(item?.materialName || item?.materialSkuCode || "").trim()
          || normalizeSku(item?.materialSkuCode),
        requiredQty,
        issueQty,
        unit: String(item?.uomName || item?.unit || "").trim() || "unit",
        itemType: String(item?.itemType || "").trim().toUpperCase() || "RAW",
        hasCycle: Boolean(item?.hasCycle),
        explosionDepth: toFiniteNumber(item?.maxDepth ?? item?.explosionDepth, 0),
      };
    })
    .filter((item) => item.skuCode && item.requiredQty > 0);

  return {
    skuCode,
    skuName: String(planRow?.sku_name || planRow?.skuName || "").trim() || skuCode,
    plannedQty: roundQty(plannedQty),
    baseBatch: 1,
    unit: String(planRow?.unit || "unit").trim() || "unit",
    bomVersionId: planRow?.bom_version_id || planRow?.bomVersionId || null,
    formulaCode: normalizeFormulaCode(planRow?.formula_code || planRow?.formulaCode),
    formulaName: String(planRow?.formula_name || planRow?.formulaName || "").trim() || "DEFAULT",
    generatedAt: nowIso,
    source: String(options?.source || "subplan_confirm_recursive"),
    materials,
  };
}

function normalizeSnapshotForCompare(snapshotList = []) {
  return (Array.isArray(snapshotList) ? snapshotList : []).map((snapshot) => ({
    skuCode: normalizeSku(snapshot?.skuCode),
    plannedQty: roundQty(snapshot?.plannedQty, 3),
    baseBatch: toFiniteNumber(snapshot?.baseBatch, 0),
    unit: String(snapshot?.unit || "").trim(),
    bomVersionId: snapshot?.bomVersionId || null,
    formulaCode: normalizeFormulaCode(snapshot?.formulaCode),
    formulaName: String(snapshot?.formulaName || "").trim(),
    materials: (Array.isArray(snapshot?.materials) ? snapshot.materials : [])
      .map((material) => ({
        skuCode: normalizeSku(material?.skuCode),
        goodsCode: normalizeSku(material?.goodsCode || material?.skuCode),
        name: String(material?.name || "").trim(),
        requiredQty: roundQty(material?.requiredQty, 3),
        issueQty: toFiniteNumber(material?.issueQty, 0),
        unit: String(material?.unit || "").trim(),
        itemType: String(material?.itemType || "").trim().toUpperCase(),
        hasCycle: Boolean(material?.hasCycle),
        explosionDepth: toFiniteNumber(material?.explosionDepth, 0),
      }))
      .sort((left, right) =>
        `${left.skuCode}::${left.goodsCode}`.localeCompare(`${right.skuCode}::${right.goodsCode}`)
      ),
  }));
}

function snapshotsEqual(left, right) {
  return JSON.stringify(normalizeSnapshotForCompare(left)) === JSON.stringify(normalizeSnapshotForCompare(right));
}

export async function repairConfirmedSubplanSnapshots(supabaseAdmin, options = {}) {
  const requestedMasterPlanNo = normalizeMasterPlanNo(options?.masterPlanNo);
  const departmentId = String(options?.departmentId || "").trim() || null;
  const planIds = Array.from(
    new Set((options?.planIds || []).map((value) => String(value || "").trim()).filter(Boolean))
  );
  const dryRun = options?.dryRun !== false;
  const nowIso = String(options?.nowIso || new Date().toISOString());

  let query = supabaseAdmin
    .from("production_plan_status")
    .select(
      "plan_id,sku_code,sku_name,planned_qty,unit,period_start,formula_code,formula_name,bom_version_id,status,confirmed_at,owner_department_id,master_plan_no,bom_snapshot"
    )
    .eq("plan_kind", "sub")
    .not("confirmed_at", "is", null)
    .order("confirmed_at", { ascending: false });

  if (requestedMasterPlanNo) {
    query = query.eq("master_plan_no", requestedMasterPlanNo);
  }
  if (departmentId) {
    query = query.eq("owner_department_id", departmentId);
  }
  if (planIds.length) {
    query = query.in("plan_id", planIds);
  }

  const result = await query;
  if (result.error) {
    throw result.error;
  }

  const rows = Array.isArray(result.data) ? result.data : [];
  const versionsBySku = await loadApprovedBomVersionsBySku(
    supabaseAdmin,
    rows.map((row) => row?.sku_code)
  );

  const inspected = [];
  const changedRows = [];
  const skipped = [];

  rows.forEach((row) => {
    const skuCode = normalizeSku(row?.sku_code);
    const versions = versionsBySku.get(skuCode) || [];
    const selectedVersion = chooseApprovedVersionForPlan(row, versions);
    if (!selectedVersion) {
      skipped.push({
        planId: String(row?.plan_id || "").trim(),
        masterPlanNo: String(row?.master_plan_no || "").trim().toUpperCase(),
        skuCode,
        reason: "approved_bom_not_found",
      });
      return;
    }
    const snapshot = buildDirectSubplanSnapshot(row, selectedVersion, nowIso, {
      source: "subplan_repair",
    });
    const nextSnapshot = snapshot ? [snapshot] : [];
    const currentSnapshot = Array.isArray(row?.bom_snapshot) ? row.bom_snapshot : [];
    const changed = !snapshotsEqual(currentSnapshot, nextSnapshot);
    const detail = {
      planId: String(row?.plan_id || "").trim(),
      masterPlanNo: String(row?.master_plan_no || "").trim().toUpperCase(),
      departmentId: String(row?.owner_department_id || "").trim() || null,
      skuCode,
      formulaCode: normalizeFormulaCode(selectedVersion?.formula_code || row?.formula_code),
      bomVersionId: selectedVersion?.id || row?.bom_version_id || null,
      currentMaterialCount: Array.isArray(currentSnapshot?.[0]?.materials)
        ? currentSnapshot[0].materials.length
        : 0,
      repairedMaterialCount: Array.isArray(snapshot?.materials) ? snapshot.materials.length : 0,
      changed,
      snapshot: nextSnapshot,
    };
    inspected.push(detail);
    if (changed) {
      changedRows.push(detail);
    }
  });

  if (!dryRun && changedRows.length) {
    const updates = await Promise.all(
      changedRows.map((row) =>
        supabaseAdmin
          .from("production_plan_status")
          .update({
            bom_snapshot: row.snapshot,
            updated_at: nowIso,
          })
          .eq("plan_id", row.planId)
          .select("plan_id")
      )
    );
    const failedUpdate = updates.find((update) => update.error);
    if (failedUpdate?.error) {
      throw failedUpdate.error;
    }
  }

  const changedMasterPlans = Array.from(
    changedRows.reduce((map, row) => {
      const masterPlanNo = row.masterPlanNo || "UNKNOWN";
      if (!map.has(masterPlanNo)) {
        map.set(masterPlanNo, {
          masterPlanNo,
          changedPlanIds: [],
          skuCodes: new Set(),
        });
      }
      const target = map.get(masterPlanNo);
      target.changedPlanIds.push(row.planId);
      if (row.skuCode) target.skuCodes.add(row.skuCode);
      return map;
    }, new Map()).values()
  ).map((row) => ({
    masterPlanNo: row.masterPlanNo,
    changedPlanIds: row.changedPlanIds,
    skuCodes: Array.from(row.skuCodes),
  }));

  return {
    dryRun,
    inspectedCount: inspected.length,
    changedCount: changedRows.length,
    skippedCount: skipped.length,
    changedRows,
    changedMasterPlans,
    skipped,
  };
}
