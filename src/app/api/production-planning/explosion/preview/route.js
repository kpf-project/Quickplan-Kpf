import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeMasterPlanNo } from "@/lib/planNo";
import {
  buildPlanRange,
  explodeRawRequirementsFromWipLines,
  explodeWipDemandFromMainRows,
  loadMainPlanRowsForMasterPlan,
  loadProductsMetaBySkus,
  loadStockBySkus,
  loadWipPoliciesBySkus,
  normalizeDateOnly,
  normalizeFormulaCode,
  normalizeSku,
  normalizeWipSupplyMode,
  roundQty,
  toFiniteNumber,
} from "@/lib/wipPlanning";
import {
  loadDepartmentMapByIds,
  loadPlanningScopeByUser,
  normalizePlanningDepartmentId,
} from "@/lib/planningScope";
import {
  loadMaterialUnitMapFromSummary,
  loadMaterialUnitMapFromTradeCodes,
} from "@/lib/materialClaimPool";
import { fetchSupabaseRowsByChunks } from "@/lib/supabaseRangeFetch";
import { enrichWipPlanDisplayWeights } from "@/lib/wipPlanDisplayWeights";

export const dynamic = "force-dynamic";

async function loadApprovedWipVersionMetaBySkus(supabaseAdmin, skuCodes = []) {
  const skus = Array.from(new Set((skuCodes || []).map(normalizeSku).filter(Boolean)));
  if (!skus.length) return new Map();

  const boms = await fetchSupabaseRowsByChunks(
    skus,
    (chunk) => supabaseAdmin
      .from("production_boms")
      .select("id,sku_code")
      .in("sku_code", chunk)
  );
  if (!boms.length) return new Map();

  const bomIds = boms.map((row) => row.id).filter(Boolean);
  const versions = await fetchSupabaseRowsByChunks(
    bomIds,
    (chunk) => supabaseAdmin
      .from("production_bom_versions")
      .select("id,bom_id,version_no,base_batch,base_output_boxes,wip_qty_input_mode")
      .in("bom_id", chunk)
      .eq("status", "approved")
      .order("version_no", { ascending: false })
  );

  const skuByBomId = new Map(boms.map((row) => [row.id, normalizeSku(row.sku_code)]));
  const metaBySku = new Map();
  versions.forEach((version) => {
    const sku = skuByBomId.get(version?.bom_id);
    if (!sku || metaBySku.has(sku)) return;

    const baseBatch = toFiniteNumber(version?.base_batch, 0);
    const baseOutput = toFiniteNumber(version?.base_output_boxes, 0);
    const wipQtyInputMode = normalizeWipSupplyMode(
      String(version?.wip_qty_input_mode || "").trim().toLowerCase() === "batch"
        ? "batch"
        : "unit"
    );

    metaBySku.set(sku, {
      baseBatch,
      baseOutput,
      wipQtyInputMode: String(version?.wip_qty_input_mode || "").trim().toLowerCase(),
      unitsPerBatch:
        baseBatch > 0 && baseOutput > 0
          ? baseOutput / baseBatch
          : 0,
    });
  });

  return metaBySku;
}

function parseInputLine(row, index, fallbackDepartmentId = null) {
  const workDate = normalizeDateOnly(row?.workDate || row?.period_start || row?.date);
  const skuCode = normalizeSku(row?.skuCode || row?.sku_code);
  const plannedQty = toFiniteNumber(row?.plannedQty ?? row?.planned_qty ?? row?.qty, 0);
  const departmentId = normalizePlanningDepartmentId(
    row?.departmentId || row?.owner_department_id || fallbackDepartmentId
  );
  const sourceSectionDefId = String(
    row?.sourceSectionDefId
    || row?.scheduleSectionDefId
    || row?.schedule_section_def_id
    || ""
  ).trim() || null;
  const sourceSectionName = String(
    row?.sourceSectionName
    || row?.scheduleSectionName
    || row?.schedule_section_name
    || ""
  ).trim() || null;
  const workstreamCode = String(
    row?.workstreamCode
    || row?.workstream_code
    || sourceSectionDefId
    || ""
  ).trim() || null;
  const mergePolicy = String(
    row?.mergePolicy || row?.merge_policy || "strict_separate"
  ).trim().toLowerCase() || "strict_separate";
  if (!workDate || !skuCode || plannedQty <= 0) return null;
  return {
    id: String(row?.id || row?.planId || row?.plan_id || `INPUT-${index + 1}`).trim(),
    planId: String(row?.planId || row?.plan_id || `INPUT-${index + 1}`).trim(),
    workDate,
    skuCode,
    skuName: String(row?.skuName || row?.sku_name || "").trim(),
    plannedQty: roundQty(plannedQty),
    planningUnit: String(row?.planningUnit || row?.unit || "").trim(),
    departmentId: departmentId || null,
    shiftId: String(row?.shiftId || row?.shift_id || "").trim() || null,
    shiftCode: String(row?.shiftCode || row?.shift_code || "").trim().toUpperCase() || null,
    shiftName: String(row?.shiftName || row?.shift_name || "").trim() || null,
    formulaCode: normalizeFormulaCode(row?.formulaCode || row?.formula_code),
    bomVersionId: row?.bomVersionId || row?.bom_version_id || null,
    sourceSectionDefId,
    sourceSectionName,
    workstreamCode,
    mergePolicy,
  };
}

function computeWipGapByMode({ requiredQty, availableQty, supplyMode }) {
  const normalizedMode = normalizeWipSupplyMode(supplyMode);
  const required = Math.max(0, roundQty(requiredQty));
  const available = Math.max(0, roundQty(availableQty));

  if (normalizedMode === "make_to_order") {
    return {
      supplyMode: normalizedMode,
      stockUsedQty: 0,
      shortageQty: required,
      suggestedProduceQty: required,
    };
  }

  const stockUsedQty = Math.min(required, available);
  const shortage = Math.max(0, roundQty(required - stockUsedQty));
  return {
    supplyMode: normalizedMode,
    stockUsedQty: roundQty(stockUsedQty),
    shortageQty: shortage,
    suggestedProduceQty: shortage,
  };
}

function buildTracePlanItemsFromMainRows(mainRows = []) {
  return (Array.isArray(mainRows) ? mainRows : [])
    .map((row, index) => ({
      plan_id: String(row?.plan_id || `MAIN-${index + 1}`).trim(),
      sku_code: normalizeSku(row?.sku_code),
      planned_qty: toFiniteNumber(row?.planned_qty, 0),
      formula_code: normalizeFormulaCode(row?.formula_code),
      bom_version_id: row?.bom_version_id || null,
    }))
    .filter((row) => row.plan_id && row.sku_code && row.planned_qty > 0);
}

function isMissingTraceRpcError(error) {
  const code = String(error?.code || "").trim();
  const message = String(error?.message || "").toLowerCase();
  return (
    code === "42883"
    || message.includes("explode_bom_trace_batch")
    || message.includes("function")
  );
}

async function explodeBomTraceBatchRows(supabaseAdmin, planItems = [], maxDepth = 12) {
  const payload = Array.isArray(planItems) ? planItems : [];
  if (!payload.length) return [];

  const { data, error } = await supabaseAdmin.rpc("explode_bom_trace_batch", {
    p_plan_items: payload,
    p_max_depth: Math.max(1, Math.min(30, Math.trunc(toFiniteNumber(maxDepth, 12)))),
  });
  if (error) {
    throw error;
  }

  return (Array.isArray(data) ? data : [])
    .map((row) => ({
      planId: String(row?.plan_id || "").trim(),
      depth: Math.max(0, Math.trunc(toFiniteNumber(row?.depth, 0))),
      parentSku: normalizeSku(row?.parent_sku_code),
      childSku: normalizeSku(row?.child_sku_code),
      childName: String(row?.child_material_name || "").trim() || normalizeSku(row?.child_sku_code),
      childItemType: String(row?.child_item_type || "").trim().toUpperCase() || "UNKNOWN",
      childRequiredQty: toFiniteNumber(row?.child_required_qty, 0),
      uomName: String(row?.uom_name || "").trim() || "unit",
      isCycle: Boolean(row?.is_cycle),
    }))
    .filter((row) => row.planId && row.childSku && row.childRequiredQty > 0);
}

function buildDailyWipDemandGroupsFromDemandRows(wipDemandRows = [], selectedDepartmentId = null) {
  const groupMap = new Map();
  (Array.isArray(wipDemandRows) ? wipDemandRows : []).forEach((row) => {
    const workDate = normalizeDateOnly(row?.workDate);
    const skuCode = normalizeSku(row?.skuCode);
    const requiredQty = toFiniteNumber(row?.requiredQty, 0);
    if (!workDate || !skuCode || requiredQty <= 0) return;

    const departmentId =
      normalizePlanningDepartmentId(row?.departmentId)
      || selectedDepartmentId
      || null;
    const sourceSectionDefId = String(row?.sourceSectionDefId || "").trim() || null;
    const sourceSectionName = String(row?.sourceSectionName || "").trim() || null;
    const workstreamCode = String(row?.workstreamCode || row?.sourceSectionDefId || "").trim() || null;
    const mergePolicy = String(row?.mergePolicy || "strict_separate").trim().toLowerCase() || "strict_separate";
    const shiftId = String(row?.shiftId || "").trim() || null;
    const shiftCode = String(row?.shiftCode || "").trim().toUpperCase() || null;
    const shiftName = String(row?.shiftName || "").trim() || null;
    const groupKey = `${workDate}|${departmentId || ""}|${shiftCode || shiftId || ""}|${workstreamCode || sourceSectionDefId || "default"}`;
    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        workDate,
        departmentId,
        shiftId,
        shiftCode,
        shiftName,
        sourceSectionDefId,
        sourceSectionName,
        workstreamCode,
        mergePolicy,
        wipBySku: new Map(),
      });
    }

    const group = groupMap.get(groupKey);
    if (!group.wipBySku.has(skuCode)) {
      group.wipBySku.set(skuCode, {
        skuCode,
        skuName: String(row?.skuName || "").trim() || skuCode,
        uom: String(row?.uom || "").trim() || "unit",
        requiredQty: 0,
      });
    }
    group.wipBySku.get(skuCode).requiredQty += requiredQty;
  });

  return Array.from(groupMap.values())
    .map((group) => ({
      workDate: group.workDate,
      departmentId: group.departmentId,
      shiftId: group.shiftId,
      shiftCode: group.shiftCode,
      shiftName: group.shiftName,
      sourceSectionDefId: group.sourceSectionDefId,
      sourceSectionName: group.sourceSectionName,
      workstreamCode: group.workstreamCode,
      mergePolicy: group.mergePolicy,
      wipDemandRows: Array.from(group.wipBySku.values())
        .map((row) => ({
          ...row,
          requiredQty: roundQty(row.requiredQty),
        }))
        .filter((row) => row.requiredQty > 0)
        .sort((a, b) => String(a?.skuCode || "").localeCompare(String(b?.skuCode || ""))),
    }))
    .filter((group) => group.wipDemandRows.length > 0)
    .sort((a, b) => {
      const dateCompare = String(a.workDate || "").localeCompare(String(b.workDate || ""));
      if (dateCompare !== 0) return dateCompare;
      return String(a.departmentId || "").localeCompare(String(b.departmentId || ""));
    });
}

function buildSelectableWipOptionsFromExplodedRows({
  mainRows = [],
  explodedRows = [],
  selectedDepartmentId = null,
  wipVersionMetaBySku = new Map(),
}) {
  const planMetaById = new Map();
  (Array.isArray(mainRows) ? mainRows : []).forEach((row) => {
    const planId = String(row?.plan_id || "").trim();
    const rawDepartmentId = normalizePlanningDepartmentId(row?.owner_department_id);
    if (!planId) return;
    planMetaById.set(planId, {
      rawDepartmentId,
    });
  });

  const bySku = new Map();
  (Array.isArray(explodedRows) ? explodedRows : []).forEach((row) => {
    if (String(row?.itemType || "").trim().toUpperCase() !== "WIP") return;
    const planId = String(row?.planId || "").trim();
    const planMeta = planMetaById.get(planId);
    if (
      selectedDepartmentId
      && planMeta?.rawDepartmentId
      && planMeta.rawDepartmentId !== selectedDepartmentId
    ) {
      return;
    }

    const skuCode = normalizeSku(row?.materialSkuCode);
    if (!skuCode) return;
    const versionMeta = wipVersionMetaBySku.get(skuCode);
    const batchMode = String(versionMeta?.wipQtyInputMode || "").trim().toLowerCase() === "batch";
    const uom = String(row?.uomName || "").trim() || "unit";
    if (!bySku.has(skuCode)) {
      bySku.set(skuCode, {
        skuCode,
        skuName: String(row?.materialName || "").trim() || skuCode,
        uom,
        planningUnit: batchMode ? "batch" : uom,
      });
    }
  });

  return Array.from(bySku.values()).sort((a, b) => a.skuCode.localeCompare(b.skuCode));
}

async function loadPersistedDraftLines(
  supabaseAdmin,
  masterPlanNo,
  scope,
  selectedDepartmentId = null
) {
  let query = supabaseAdmin
    .from("production_plan_status")
    .select("plan_id,period_start,sku_code,sku_name,planned_qty,owner_department_id,shift_id,shift_code,shift_name,formula_code,bom_version_id,schedule_section_def_id,schedule_section_name")
    .eq("master_plan_no", masterPlanNo)
    .eq("plan_kind", "sub")
    .in("status", ["draft", "not_ready"])
    .order("period_start", { ascending: true })
    .order("sku_code", { ascending: true });

  if (selectedDepartmentId) {
    query = query.eq("owner_department_id", selectedDepartmentId);
  } else if (!scope.canManageGlobal) {
    const ids = Array.from(scope.editableDepartmentIdSet || []);
    if (!ids.length) return [];
    query = query.in("owner_department_id", ids);
  }

  let result = await query;
  if (
    result.error
    && (
      String(result.error?.message || "").toLowerCase().includes("shift_id")
      || String(result.error?.message || "").toLowerCase().includes("shift_code")
      || String(result.error?.message || "").toLowerCase().includes("shift_name")
      || String(result.error?.code || "") === "PGRST204"
    )
  ) {
    let fallbackQuery = supabaseAdmin
      .from("production_plan_status")
      .select("plan_id,period_start,sku_code,sku_name,planned_qty,owner_department_id,formula_code,bom_version_id,schedule_section_def_id,schedule_section_name")
      .eq("master_plan_no", masterPlanNo)
      .eq("plan_kind", "sub")
      .in("status", ["draft", "not_ready"])
      .order("period_start", { ascending: true })
      .order("sku_code", { ascending: true });

    if (selectedDepartmentId) {
      fallbackQuery = fallbackQuery.eq("owner_department_id", selectedDepartmentId);
    } else if (!scope.canManageGlobal) {
      const ids = Array.from(scope.editableDepartmentIdSet || []);
      if (!ids.length) return [];
      fallbackQuery = fallbackQuery.in("owner_department_id", ids);
    }

    result = await fallbackQuery;
  }
  if (result.error) {
    throw result.error;
  }

  return (result.data ?? [])
    .map((row, index) =>
      parseInputLine(
        {
          id: row?.plan_id,
          planId: row?.plan_id,
          workDate: row?.period_start,
          skuCode: row?.sku_code,
          skuName: row?.sku_name,
            plannedQty: row?.planned_qty,
            departmentId: row?.owner_department_id,
            shiftId: row?.shift_id,
            shiftCode: row?.shift_code,
            shiftName: row?.shift_name,
            formulaCode: row?.formula_code,
          bomVersionId: row?.bom_version_id,
          sourceSectionDefId: row?.schedule_section_def_id,
          sourceSectionName: row?.schedule_section_name,
        },
        index
      )
    )
    .filter(Boolean);
}

export async function POST(request) {
  try {
    const permission = await requirePermissionKeys(request, [
      "production-line-planning-view",
      "production-line-planning-manage",
      "plan.view_all",
      "plan.calculate_own_dept",
      "plan.edit_own_dept",
    ]);

    const body = await readJson(request);
    const inputMasterPlanNo = String(body?.masterPlanNo || body?.planNo || "")
      .trim()
      .toUpperCase();
    const masterPlanNo = normalizeMasterPlanNo(inputMasterPlanNo);
    const inputDepartmentId = normalizePlanningDepartmentId(body?.departmentId);
    const inputLines = Array.isArray(body?.wipDraftLines) ? body.wipDraftLines : [];
    const ignorePersistedDraft = body?.ignorePersistedDraft === true;

    if (!inputMasterPlanNo) {
      return NextResponse.json({ error: "masterPlanNo is required" }, { status: 400 });
    }
    if (!masterPlanNo) {
      return NextResponse.json({ error: "Invalid masterPlanNo format" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const scope = await loadPlanningScopeByUser(supabaseAdmin, request, permission);
    const editableDepartmentIds = Array.from(scope.editableDepartmentIdSet || []);

    const selectedDepartmentId = inputDepartmentId
      || (scope.canManageGlobal ? null : (editableDepartmentIds.length === 1 ? editableDepartmentIds[0] : null));

    if (
      selectedDepartmentId
      && !scope.canManageGlobal
      && !scope.editableDepartmentIdSet.has(selectedDepartmentId)
    ) {
      return NextResponse.json(
        {
          error: "Department scope violation",
          details: { departmentId: selectedDepartmentId },
        },
        { status: 403 }
      );
    }

    const mainRows = await loadMainPlanRowsForMasterPlan(supabaseAdmin, masterPlanNo);
    if (!mainRows.length) {
      return NextResponse.json({ error: "Master plan not found" }, { status: 404 });
    }

    const fgRows = mainRows.map((row) => {
      const skuCode = normalizeSku(row?.sku_code);
      const canEdit = scope.canManageGlobal
        ? true
        : scope.editableSkuSet.has(skuCode);
      return {
        planId: String(row?.plan_id || "").trim() || null,
        skuCode,
        skuName: String(row?.sku_name || "").trim() || skuCode,
        plannedQty: roundQty(row?.planned_qty),
        periodStart: normalizeDateOnly(row?.period_start),
        periodEnd: normalizeDateOnly(row?.period_end || row?.period_start),
        ownerDepartmentId: normalizePlanningDepartmentId(row?.owner_department_id) || null,
        ownerDepartmentCode: String(row?.production_departments?.code || "").trim().toUpperCase() || null,
        ownerDepartmentName: String(row?.production_departments?.name || "").trim() || null,
        canEdit,
      };
    });

    const planRange = buildPlanRange(mainRows);
    const demandSourceRows = scope.canManageGlobal
      ? mainRows
      : mainRows.filter((row) => scope.editableSkuSet.has(normalizeSku(row?.sku_code)));
    let wipDemandRows = [];
    let dailyDemandGroups = [];
    let traceRows = [];
    let legacyExplodedRows = [];
    let stockBySku = new Map();
    let productMetaBySku = new Map();
    let wipPoliciesBySku = new Map();
    let wipVersionMetaBySku = new Map();
    let wipSelectableOptions = [];
    let usedTraceRowsForDebug = false;

    const offsetDemandResult = await explodeWipDemandFromMainRows(
      supabaseAdmin,
      demandSourceRows
    );
    legacyExplodedRows = offsetDemandResult.explodedRows;
    wipDemandRows = offsetDemandResult.wipDemandRows;
    dailyDemandGroups = buildDailyWipDemandGroupsFromDemandRows(
      wipDemandRows,
      selectedDepartmentId
    );

    const wipSkus = wipDemandRows.map((row) => row.skuCode);
    [stockBySku, productMetaBySku, wipPoliciesBySku, wipVersionMetaBySku] = await Promise.all([
      loadStockBySkus(request, wipSkus),
      loadProductsMetaBySkus(supabaseAdmin, wipSkus),
      loadWipPoliciesBySkus(supabaseAdmin, wipSkus),
      loadApprovedWipVersionMetaBySkus(supabaseAdmin, wipSkus),
    ]);
    wipSelectableOptions = buildSelectableWipOptionsFromExplodedRows({
      mainRows: demandSourceRows,
      explodedRows: legacyExplodedRows,
      selectedDepartmentId,
      wipVersionMetaBySku,
    });

    try {
      const tracePlanItems = buildTracePlanItemsFromMainRows(demandSourceRows);
      traceRows = await explodeBomTraceBatchRows(supabaseAdmin, tracePlanItems, 12);
      usedTraceRowsForDebug = true;
    } catch (traceError) {
      if (!isMissingTraceRpcError(traceError)) {
        throw traceError;
      }
    }

    const draftLines = inputLines.length
      ? inputLines
        .map((row, index) => parseInputLine(row, index, selectedDepartmentId))
        .filter(Boolean)
      : (
        ignorePersistedDraft
          ? []
          : await loadPersistedDraftLines(supabaseAdmin, masterPlanNo, scope, selectedDepartmentId)
      );

    const filteredDraftLines = draftLines;

    const plannedByWipSku = new Map();
    filteredDraftLines.forEach((line) => {
      const sku = normalizeSku(line.skuCode);
      plannedByWipSku.set(sku, toFiniteNumber(plannedByWipSku.get(sku), 0) + toFiniteNumber(line.plannedQty, 0));
    });

    const planningStockBySku = new Map();
    const displayMetaBySku = new Map();

    const wipSummaryBaseRows = wipDemandRows.map((row) => {
      const sku = normalizeSku(row.skuCode);
      const stockQty = toFiniteNumber(stockBySku.get(sku), 0);
      const plannedQty = roundQty(plannedByWipSku.get(sku));
      const meta = productMetaBySku.get(sku);
      const versionMeta = wipVersionMetaBySku.get(sku);
      const shouldDisplayInRealUnit =
        String(versionMeta?.wipQtyInputMode || "").trim().toLowerCase() === "batch"
        && toFiniteNumber(versionMeta?.unitsPerBatch, 0) > 0;
      const displayFactor = shouldDisplayInRealUnit ? toFiniteNumber(versionMeta?.unitsPerBatch, 0) : 1;
      const planningStockQty = shouldDisplayInRealUnit
        ? roundQty(stockQty / displayFactor, 6)
        : stockQty;
      const wipPolicy = wipPoliciesBySku.get(sku);
      const computed = computeWipGapByMode({
        requiredQty: row.requiredQty,
        availableQty: planningStockQty,
        supplyMode: wipPolicy?.supplyMode,
      });
      const remainingShortageQty = Math.max(
        0,
        roundQty(computed.suggestedProduceQty - plannedQty)
      );

      planningStockBySku.set(sku, planningStockQty);
      displayMetaBySku.set(sku, { displayFactor, shouldDisplayInRealUnit });

      return {
        skuCode: sku,
        skuName: row.skuName || meta?.sku_name || sku,
        uom: meta?.uom_name || row.uom || "unit",
        supplyMode: computed.supplyMode,
        requiredQty: roundQty(row.requiredQty * displayFactor),
        availableQty: roundQty(planningStockQty * displayFactor),
        stockUsedQty: roundQty(computed.stockUsedQty * displayFactor),
        shortageQty: roundQty(computed.shortageQty * displayFactor),
        suggestedProduceQty: roundQty(computed.suggestedProduceQty * displayFactor),
        plannedQty: roundQty(plannedQty),
        remainingShortageQty: roundQty(remainingShortageQty),
        planningUnit: row.uom || "batch",
        workDate: row.workDate || null,
        departmentId: row.departmentId || null,
        shiftId: row.shiftId || null,
        shiftCode: row.shiftCode || null,
        shiftName: row.shiftName || null,
        sourceSectionDefId: row.sourceSectionDefId || null,
        sourceSectionName: row.sourceSectionName || null,
        workstreamCode: row.workstreamCode || row.sourceSectionDefId || null,
        mergePolicy: row.mergePolicy || "strict_separate",
      };
    });

    // Multi-level parent-driven netting:
    // if parent WIP has enough stock (or low shortage), child WIP demand must scale down accordingly.
    const initialRequiredPlanningQtyBySku = new Map();
    const requiredPlanningQtyBySku = new Map();
    const availablePlanningQtyBySku = new Map();
    const supplyModeBySku = new Map();
    const plannedQtyBySku = new Map();
    wipSummaryBaseRows.forEach((row) => {
      const sku = normalizeSku(row?.skuCode);
      if (!sku) return;
      const displayFactor = toFiniteNumber(displayMetaBySku.get(sku)?.displayFactor, 1);
      const baseRequiredPlanningQty = roundQty(toFiniteNumber(row?.requiredQty, 0) / displayFactor);
      initialRequiredPlanningQtyBySku.set(sku, baseRequiredPlanningQty);
      requiredPlanningQtyBySku.set(sku, baseRequiredPlanningQty);
      availablePlanningQtyBySku.set(sku, roundQty(toFiniteNumber(row?.availableQty, 0) / displayFactor));
      supplyModeBySku.set(sku, normalizeWipSupplyMode(row?.supplyMode));
      plannedQtyBySku.set(sku, roundQty(toFiniteNumber(row?.plannedQty, 0)));
    });

    const wipSkuSet = new Set(Array.from(requiredPlanningQtyBySku.keys()));
    const parentWipSetByChild = new Map();
    (Array.isArray(traceRows) ? traceRows : []).forEach((row) => {
      const childSku = normalizeSku(row?.childSku);
      const parentSku = normalizeSku(row?.parentSku);
      if (!childSku || !parentSku) return;
      if (!wipSkuSet.has(childSku) || !wipSkuSet.has(parentSku)) return;
      if (!parentWipSetByChild.has(childSku)) parentWipSetByChild.set(childSku, new Set());
      parentWipSetByChild.get(childSku).add(parentSku);
    });

    const suggestedPlanningQtyBySku = new Map();
    const recomputeSuggested = (sku) => {
      const requiredQty = toFiniteNumber(requiredPlanningQtyBySku.get(sku), 0);
      const availableQty = toFiniteNumber(availablePlanningQtyBySku.get(sku), 0);
      const computed = computeWipGapByMode({
        requiredQty,
        availableQty,
        supplyMode: supplyModeBySku.get(sku),
      });
      suggestedPlanningQtyBySku.set(sku, roundQty(computed.suggestedProduceQty));
    };

    wipSkuSet.forEach((sku) => recomputeSuggested(sku));

    // Iterate a few passes to let parent->child impact cascade down multiple WIP levels.
    for (let pass = 0; pass < 4; pass += 1) {
      let changed = false;
      parentWipSetByChild.forEach((parentSet, childSku) => {
        const parents = Array.from(parentSet || []);
        if (!parents.length) return;

        let nextRequired = toFiniteNumber(requiredPlanningQtyBySku.get(childSku), 0);
        if (parents.length === 1) {
          const parentSku = parents[0];
          const parentRequired = Math.max(0.000001, toFiniteNumber(requiredPlanningQtyBySku.get(parentSku), 0));
          const parentSuggested = Math.max(0, toFiniteNumber(suggestedPlanningQtyBySku.get(parentSku), 0));
          const ratio = Math.max(0, Math.min(1, parentSuggested / parentRequired));
          nextRequired = roundQty(toFiniteNumber(requiredPlanningQtyBySku.get(childSku), 0) * ratio);
        } else {
          const hasAnyParentSuggested = parents.some(
            (parentSku) => toFiniteNumber(suggestedPlanningQtyBySku.get(parentSku), 0) > 0
          );
          if (!hasAnyParentSuggested) {
            nextRequired = 0;
          }
        }

        if (Math.abs(nextRequired - toFiniteNumber(requiredPlanningQtyBySku.get(childSku), 0)) > 0.0001) {
          requiredPlanningQtyBySku.set(childSku, nextRequired);
          recomputeSuggested(childSku);
          changed = true;
        }
      });
      if (!changed) break;
    }

    const nettingRatioBySku = new Map();
    wipSkuSet.forEach((sku) => {
      const initialRequiredQty = Math.max(0, toFiniteNumber(initialRequiredPlanningQtyBySku.get(sku), 0));
      const adjustedRequiredQty = Math.max(0, toFiniteNumber(requiredPlanningQtyBySku.get(sku), 0));
      const ratio = initialRequiredQty > 0
        ? Math.max(0, Math.min(1, adjustedRequiredQty / initialRequiredQty))
        : 0;
      nettingRatioBySku.set(sku, ratio);
    });

    const wipSummary = wipSummaryBaseRows.map((row) => {
      const sku = normalizeSku(row.skuCode);
      const displayFactor = toFiniteNumber(displayMetaBySku.get(sku)?.displayFactor, 1);
      const requiredPlanningQty = roundQty(requiredPlanningQtyBySku.get(sku));
      const availablePlanningQty = roundQty(availablePlanningQtyBySku.get(sku));
      const recomputed = computeWipGapByMode({
        requiredQty: requiredPlanningQty,
        availableQty: availablePlanningQty,
        supplyMode: supplyModeBySku.get(sku),
      });
      const plannedQty = roundQty(plannedQtyBySku.get(sku));
      const remainingShortageQty = Math.max(
        0,
        roundQty(recomputed.suggestedProduceQty - plannedQty)
      );
      return {
        ...row,
        requiredQty: roundQty(requiredPlanningQty * displayFactor),
        availableQty: roundQty(availablePlanningQty * displayFactor),
        stockUsedQty: roundQty(recomputed.stockUsedQty * displayFactor),
        shortageQty: roundQty(recomputed.shortageQty * displayFactor),
        suggestedProduceQty: roundQty(recomputed.suggestedProduceQty * displayFactor),
        plannedQty,
        remainingShortageQty: roundQty(remainingShortageQty),
      };
    });
    const remainingStockBySku = new Map(planningStockBySku);
    const autoDraftLines = [];

    for (const group of dailyDemandGroups) {
      group.wipDemandRows.forEach((row) => {
        const sku = normalizeSku(row?.skuCode);
        if (!sku) return;
        const nettingRatio = toFiniteNumber(nettingRatioBySku.get(sku), 1);
        const effectiveRequiredQty = roundQty(toFiniteNumber(row?.requiredQty, 0) * nettingRatio, 6);
        if (effectiveRequiredQty <= 0) return;
        const availableQty = toFiniteNumber(remainingStockBySku.get(sku), 0);
        const displayMeta = displayMetaBySku.get(sku) || null;
        const computed = computeWipGapByMode({
          requiredQty: effectiveRequiredQty,
          availableQty,
          supplyMode: wipPoliciesBySku.get(sku)?.supplyMode,
        });

        remainingStockBySku.set(
          sku,
          Math.max(0, roundQty(availableQty - computed.stockUsedQty))
        );

        if (computed.suggestedProduceQty <= 0) return;

        autoDraftLines.push({
          id: `${group.workDate}-${group.shiftCode || group.shiftId || "default"}-${sku}-${group.workstreamCode || group.sourceSectionDefId || "default"}`,
          workDate: group.workDate,
          departmentId: group.departmentId,
          shiftId: group.shiftId || null,
          shiftCode: group.shiftCode || null,
          shiftName: group.shiftName || null,
          sourceSectionDefId: group.sourceSectionDefId || null,
          sourceSectionName: group.sourceSectionName || null,
          workstreamCode: group.workstreamCode || group.sourceSectionDefId || null,
          mergePolicy: group.mergePolicy || "strict_separate",
          skuCode: sku,
          skuName: row?.skuName || productMetaBySku.get(sku)?.sku_name || sku,
          plannedQty: roundQty(computed.suggestedProduceQty),
          uom: row?.uom || "batch",
          displayQty: roundQty(
            computed.suggestedProduceQty * toFiniteNumber(displayMeta?.displayFactor, 1)
          ),
          displayUom: productMetaBySku.get(sku)?.uom_name || row?.uom || "unit",
          supplyMode: computed.supplyMode,
        });
      });
    }

    const { rawRows, byPlanId } = await explodeRawRequirementsFromWipLines(
      supabaseAdmin,
      filteredDraftLines.map((line) => ({
        planId: line.planId,
        skuCode: line.skuCode,
        plannedQty: line.plannedQty,
        formulaCode: line.formulaCode,
        bomVersionId: line.bomVersionId,
      }))
    );
    const rawGoodsCodes = rawRows.map((row) => normalizeSku(row?.goodsCode || row?.skuCode));
    const [tradeUnitMap, summaryUnitMap] = await Promise.all([
      loadMaterialUnitMapFromTradeCodes(rawGoodsCodes),
      loadMaterialUnitMapFromSummary(rawGoodsCodes),
    ]);
    const normalizedRawPreview = rawRows.map((row) => {
      const materialSkuCode = normalizeSku(row?.skuCode);
      const materialGoodsCode = normalizeSku(row?.goodsCode || row?.skuCode);
      return {
        materialSkuCode,
        materialGoodsCode,
        materialName: String(row?.skuName || "").trim() || materialSkuCode,
        issueQty: Math.max(0, Math.ceil(toFiniteNumber(row?.requiredQty, 0))),
        requiredQty: roundQty(row?.requiredQty),
        unit:
          tradeUnitMap.get(materialGoodsCode)
          || summaryUnitMap.get(materialGoodsCode)
          || String(row?.uom || "").trim()
          || "unit",
      };
    });

    // Keep the aggregate preview above for existing consumers, and also expose
    // the per-WIP trace required by the department planning matrix.
    const rawPreviewByLine = filteredDraftLines.map((line) => {
      const rows = byPlanId.get(String(line.planId || "").trim()) || [];
      const materialMap = new Map();
      rows.forEach((row) => {
        if (row.itemType === "WIP") return;
        const materialSkuCode = normalizeSku(row?.materialSkuCode);
        const materialGoodsCode = normalizeSku(row?.materialGoodsCode || row?.materialSkuCode);
        const requiredQty = toFiniteNumber(row?.requiredQty, 0);
        if (!materialSkuCode || requiredQty <= 0) return;
        const key = `${materialSkuCode}|${materialGoodsCode}`;
        const current = materialMap.get(key) || {
          materialSkuCode,
          materialGoodsCode,
          materialName: String(row?.materialName || "").trim() || materialSkuCode,
          requiredQty: 0,
          issueQty: 0,
          unit: String(row?.uomName || "").trim() || "unit",
        };
        current.requiredQty += requiredQty;
        current.issueQty = Math.ceil(current.requiredQty);
        materialMap.set(key, current);
      });
      return {
        planId: line.planId,
        workDate: line.workDate,
        skuCode: line.skuCode,
        skuName: line.skuName,
        plannedQty: line.plannedQty,
        shiftId: line.shiftId || null,
        shiftCode: line.shiftCode || null,
        shiftName: line.shiftName || null,
        sourceSectionDefId: line.sourceSectionDefId || null,
        sourceSectionName: line.sourceSectionName || null,
        materials: Array.from(materialMap.values()).map((row) => ({
          ...row,
          requiredQty: roundQty(row.requiredQty),
          issueQty: Math.ceil(roundQty(row.requiredQty)),
        })),
      };
    });

    const lineTrace = filteredDraftLines.map((line) => {
      const rows = byPlanId.get(String(line.planId || "").trim()) || [];
      const maxDepth = rows.reduce((max, row) => Math.max(max, Number(row?.maxDepth || 0) || 0), 0);
      return {
        planId: line.planId,
        workDate: line.workDate,
        skuCode: line.skuCode,
        plannedQty: line.plannedQty,
        nodeCount: rows.length,
        maxDepth,
        cycleDetected: rows.some((row) => Boolean(row?.hasCycle)),
      };
    });

    const draftDepartmentIds = Array.from(
      new Set(filteredDraftLines.map((line) => normalizePlanningDepartmentId(line.departmentId)).filter(Boolean))
    );
    const departmentMap = await loadDepartmentMapByIds(supabaseAdmin, [
      ...editableDepartmentIds,
      ...draftDepartmentIds,
      ...(selectedDepartmentId ? [selectedDepartmentId] : []),
    ]);
    const demandExplosionRowsCount = usedTraceRowsForDebug
      ? traceRows.length
      : legacyExplodedRows.length;
    const demandCycleRowsCount = usedTraceRowsForDebug
      ? traceRows.filter((row) => Boolean(row?.isCycle)).length
      : legacyExplodedRows.filter((row) => Boolean(row?.hasCycle)).length;

    const weightedLines = await enrichWipPlanDisplayWeights(supabaseAdmin, [...autoDraftLines, ...filteredDraftLines]);
    return NextResponse.json(
      {
        data: {
          masterPlanNo,
          fgRows,
          wipSummary,
          wipSelectableOptions,
          autoDraftLines: weightedLines.slice(0, autoDraftLines.length),
          draftLines: weightedLines.slice(autoDraftLines.length).map((line) => {
            const dept = line.departmentId ? departmentMap.get(line.departmentId) : null;
            return {
              ...line,
              departmentCode: String(dept?.code || "").trim().toUpperCase() || null,
              departmentName: String(dept?.name || "").trim() || null,
            };
          }),
          rawPreview: normalizedRawPreview,
          rawPreviewByLine,
          trace: {
            lineTrace,
            explosionRows: demandExplosionRowsCount,
            cycleRows: demandCycleRowsCount,
          },
        },
        meta: {
          planRange,
          selectedDepartmentId: selectedDepartmentId || null,
          editableDepartmentIds,
          canManageGlobal: Boolean(scope.canManageGlobal),
          demandFgScope: scope.canManageGlobal ? "all" : "editable_only",
          source: "offset_aware_recursive_rpc",
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return jsonError(error);
  }
}
