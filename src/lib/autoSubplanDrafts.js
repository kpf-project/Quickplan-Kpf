import "server-only";

import { buildSubPlanNo, normalizeMasterPlanNo } from "@/lib/planNo";
import {
  buildDraftPlanId,
  buildPlanRange,
  explodeWipDemandFromMainRows,
  loadMainPlanRowsForMasterPlan,
  loadApprovedWipVersionMetaBySkus,
  loadProductsMetaBySkus,
  loadStockBySkus,
  loadWipPoliciesBySkus,
  normalizeDateOnly,
  normalizeWipSupplyMode,
  normalizeSku,
  roundQty,
  toFiniteNumber,
} from "@/lib/wipPlanning";
import {
  loadDepartmentMapByIds,
  normalizePlanningDepartmentId,
} from "@/lib/planningScope";

function isMissingColumnError(error, columnName) {
  const message = String(error?.message || "").toLowerCase();
  return String(error?.code || "") === "PGRST204" || message.includes(String(columnName || "").toLowerCase());
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
  const shortageQty = Math.max(0, roundQty(required - stockUsedQty));
  return {
    supplyMode: normalizedMode,
    stockUsedQty: roundQty(stockUsedQty),
    shortageQty,
    suggestedProduceQty: shortageQty,
  };
}

function buildTracePlanItemsFromMainRows(mainRows = []) {
  return (Array.isArray(mainRows) ? mainRows : [])
    .map((row, index) => ({
      plan_id: String(row?.plan_id || `MAIN-${index + 1}`).trim(),
      sku_code: normalizeSku(row?.sku_code),
      planned_qty: toFiniteNumber(row?.planned_qty, 0),
      formula_code: String(row?.formula_code || "").trim() || "DEFAULT",
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
      childRequiredQty: toFiniteNumber(row?.child_required_qty, 0),
      isCycle: Boolean(row?.is_cycle),
    }))
    .filter((row) => row.planId && row.childSku && row.childRequiredQty > 0);
}

function buildDepartmentGroups(mainRows = []) {
  const byDepartmentAndDate = new Map();

  (Array.isArray(mainRows) ? mainRows : []).forEach((row) => {
    const departmentId = normalizePlanningDepartmentId(row?.owner_department_id);
    const workDate = normalizeDateOnly(row?.period_start);
    if (!departmentId || !workDate) return;
    const groupKey = `${departmentId}|${workDate}`;
    if (!byDepartmentAndDate.has(groupKey)) {
      byDepartmentAndDate.set(groupKey, []);
    }
    byDepartmentAndDate.get(groupKey).push(row);
  });

  return Array.from(byDepartmentAndDate.entries())
    .map(([groupKey, rows]) => {
      const [departmentId, workDate] = String(groupKey || "").split("|");
      const firstRow = rows[0] || null;
      return {
        departmentId,
        rows,
        workDate: workDate || null,
        sortCode: String(firstRow?.production_departments?.code || "").trim().toUpperCase(),
      };
    })
    .sort((a, b) => {
      const dateCompare = String(a.workDate || "").localeCompare(String(b.workDate || ""));
      if (dateCompare !== 0) return dateCompare;
      const codeCompare = a.sortCode.localeCompare(b.sortCode);
      if (codeCompare !== 0) return codeCompare;
      return a.departmentId.localeCompare(b.departmentId);
    });
}

function normalizeDraftLine(row, index, fallbackWorkDate, fallbackDepartmentId) {
  const workDate = normalizeDateOnly(row?.workDate || row?.period_start || fallbackWorkDate);
  const skuCode = normalizeSku(row?.skuCode || row?.sku_code);
  const plannedQty = roundQty(row?.plannedQty ?? row?.planned_qty ?? row?.qty);
  if (!workDate || !skuCode || plannedQty <= 0) return null;

  return {
    id: String(row?.id || row?.planId || row?.plan_id || `AUTO-${index + 1}`).trim(),
    workDate,
    skuCode,
    skuName: String(row?.skuName || row?.sku_name || "").trim(),
    plannedQty,
    departmentId: normalizePlanningDepartmentId(
      row?.departmentId || row?.owner_department_id || fallbackDepartmentId
    ) || null,
    shiftId: String(row?.shiftId || row?.shift_id || "").trim() || null,
    shiftCode: String(row?.shiftCode || row?.shift_code || "").trim().toUpperCase() || null,
    shiftName: String(row?.shiftName || row?.shift_name || "").trim() || null,
    formulaCode: row?.formulaCode || row?.formula_code || null,
    bomVersionId: row?.bomVersionId || row?.bom_version_id || null,
    sourceSectionDefId: String(row?.sourceSectionDefId || row?.schedule_section_def_id || "").trim() || null,
    sourceSectionName: String(row?.sourceSectionName || row?.schedule_section_name || "").trim() || null,
    workstreamCode: String(
      row?.workstreamCode
      || row?.workstream_code
      || row?.sourceSectionDefId
      || row?.schedule_section_def_id
      || ""
    ).trim() || null,
    mergePolicy: String(row?.mergePolicy || row?.merge_policy || "strict_separate").trim().toLowerCase() || "strict_separate",
  };
}

function resolveDraftPlanningUnit(versionMeta, productMeta) {
  const planningMode = String(versionMeta?.wipQtyInputMode || "").trim().toLowerCase();
  if (planningMode === "batch") return "batch";
  return String(productMeta?.uom_name || "unit").trim() || "unit";
}

export async function persistSubplanDraftLines({
  supabaseAdmin,
  masterPlanNo,
  department,
  lines = [],
  planRange = null,
  actorUserId = null,
  nowIso = new Date().toISOString(),
}) {
  const normalizedMasterPlanNo = normalizeMasterPlanNo(masterPlanNo);
  const departmentId = normalizePlanningDepartmentId(department?.id || department?.departmentId);
  const departmentCode =
    String(department?.code || "").trim().toUpperCase() || "UNASSIGNED";

  if (!normalizedMasterPlanNo) {
    throw new Error("Invalid masterPlanNo format");
  }
  if (!departmentId) {
    throw new Error("departmentId is required");
  }

  const fallbackWorkDate = normalizeDateOnly(planRange?.start) || new Date().toISOString().slice(0, 10);
  const normalizedLines = (Array.isArray(lines) ? lines : [])
    .map((row, index) => normalizeDraftLine(row, index, fallbackWorkDate, departmentId))
    .filter(Boolean);

  // 1. Fetch active shifts and build map
  const { data: shiftsData } = await supabaseAdmin
    .from("production_shifts")
    .select("id, code, name")
    .is("deleted_at", null);

  const shiftMap = new Map();
  if (Array.isArray(shiftsData)) {
    shiftsData.forEach((s) => {
      if (s.id) {
        shiftMap.set(String(s.id).trim(), {
          id: String(s.id).trim(),
          code: String(s.code || "").trim(),
          name: String(s.name || "").trim(),
        });
      }
    });
  }

  // 2. Fetch active section shift assignments and build maps
  const { data: sectionShiftsData } = await supabaseAdmin
    .from("production_section_shifts")
    .select("id, shift_id")
    .is("deleted_at", null);

  const sectionShiftMap = new Map();
  const sectionShiftObjMap = new Map();
  if (Array.isArray(sectionShiftsData)) {
    sectionShiftsData.forEach((ss) => {
      if (ss.id && ss.shift_id) {
        sectionShiftMap.set(String(ss.id).trim(), String(ss.shift_id).trim());
        const actualShift = shiftMap.get(String(ss.shift_id).trim());
        if (actualShift) {
          sectionShiftObjMap.set(String(ss.id).trim(), actualShift);
        }
      }
    });
  }

  // 3. Resolve shift details on normalizedLines BEFORE deduplication
  normalizedLines.forEach((line) => {
    const rawSid = String(line.shiftId || "").trim();
    let resolvedShift = null;

    if (rawSid) {
      if (sectionShiftObjMap.has(rawSid)) {
        resolvedShift = sectionShiftObjMap.get(rawSid);
      } else if (shiftMap.has(rawSid)) {
        resolvedShift = shiftMap.get(rawSid);
      }
    }

    if (resolvedShift) {
      line.shiftId = resolvedShift.id;
      line.shiftCode = resolvedShift.code;
      line.shiftName = resolvedShift.name;
    } else {
      line.shiftId = line.shiftId || null;
      line.shiftCode = line.shiftCode || null;
      line.shiftName = line.shiftName || null;
    }
  });

  const dedupedMap = new Map();
  normalizedLines.forEach((line) => {
    const key = `${line.workDate}|${line.shiftCode || line.shiftId || ""}|${line.skuCode}|${line.workstreamCode || line.sourceSectionDefId || "default"}`;
    if (!dedupedMap.has(key)) {
      dedupedMap.set(key, { ...line });
      return;
    }
    const current = dedupedMap.get(key);
    current.plannedQty = roundQty(
      toFiniteNumber(current.plannedQty, 0) + toFiniteNumber(line.plannedQty, 0)
    );
    dedupedMap.set(key, current);
  });
  const mergedLines = Array.from(dedupedMap.values());

  const existingDraftResult = await supabaseAdmin
    .from("production_plan_status")
    .select("plan_id")
    .eq("master_plan_no", normalizedMasterPlanNo)
    .eq("plan_kind", "sub")
    .eq("owner_department_id", departmentId);
  if (existingDraftResult.error) {
    throw existingDraftResult.error;
  }

  const existingPlanIds = new Set(
    (existingDraftResult.data ?? [])
      .map((row) => String(row?.plan_id || "").trim())
      .filter(Boolean)
  );

  const productMetaBySku = await loadProductsMetaBySkus(
    supabaseAdmin,
    mergedLines.map((line) => line.skuCode)
  );
  const versionMetaBySku = await loadApprovedWipVersionMetaBySkus(
    supabaseAdmin,
    mergedLines.map((line) => line.skuCode)
  );
  const resolvedSubPlanNo = buildSubPlanNo(normalizedMasterPlanNo, departmentCode);
  const upsertRows = mergedLines.map((line) => {
    const meta = productMetaBySku.get(line.skuCode);
    const versionMeta = versionMetaBySku.get(line.skuCode);
    const planId = buildDraftPlanId({
      masterPlanNo: normalizedMasterPlanNo,
      departmentCode,
      skuCode: line.skuCode,
      workDate: line.workDate,
      shiftCode: line.shiftCode,
      workstreamCode: line.workstreamCode,
      sourceSectionDefId: line.sourceSectionDefId,
    });

    return {
      plan_id: planId,
      sku_code: line.skuCode,
      sku_name: line.skuName || meta?.sku_name || line.skuCode,
      category_name: "WIP",
      status: "draft",
      planned_qty: roundQty(line.plannedQty),
      unit: resolveDraftPlanningUnit(versionMeta, meta),
      period_start: line.workDate,
      period_end: line.workDate,
      confirmed_at: null,
      confirmed_by: null,
      bom_snapshot: [],
      plan_group_id: normalizedMasterPlanNo,
      plan_kind: "sub",
      parent_plan_id: null,
      entry_date: normalizeDateOnly(planRange?.start) || line.workDate,
      t_plus_days: 3,
      due_date: line.workDate,
      formula_code: line.formulaCode || null,
      formula_name: null,
      bom_version_id: line.bomVersionId || null,
      shift_id: (() => {
        const sid = String(line.shiftId || "").trim();
        if (sid && sectionShiftMap.has(sid)) {
          return sectionShiftMap.get(sid);
        }
        return sid || null;
      })(),
      shift_code: line.shiftCode || null,
      shift_name: line.shiftName || null,
      schedule_section_def_id: line.sourceSectionDefId || null,
      schedule_section_name: line.sourceSectionName || null,
      master_plan_no: normalizedMasterPlanNo,
      sub_plan_no: resolvedSubPlanNo,
      owner_department_id: departmentId,
      feasible_batch: null,
      short_batch: null,
      backorder_batch: null,
      earliest_material_eta: null,
      exception_reason: null,
      inserted_at: nowIso,
      updated_at: nowIso,
    };
  });

  const keepPlanIds = new Set(
    upsertRows.map((row) => String(row.plan_id || "").trim()).filter(Boolean)
  );
  const deletePlanIds = Array.from(existingPlanIds).filter((planId) => !keepPlanIds.has(planId));

  if (deletePlanIds.length) {
    const deleteResult = await supabaseAdmin
      .from("production_plan_status")
      .delete()
      .eq("master_plan_no", normalizedMasterPlanNo)
      .eq("plan_kind", "sub")
      .eq("owner_department_id", departmentId)
      .in("plan_id", deletePlanIds);
    if (deleteResult.error) {
      throw deleteResult.error;
    }
  }

  if (upsertRows.length) {
    const normalizedPlanStart = normalizeDateOnly(planRange?.start);
    const normalizedPlanEnd = normalizeDateOnly(planRange?.end);
    const lineDates = mergedLines
      .map((line) => normalizeDateOnly(line?.workDate))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    const masterPeriodStart = normalizedPlanStart || lineDates[0] || fallbackWorkDate;
    const masterPeriodEnd = normalizedPlanEnd || lineDates[lineDates.length - 1] || masterPeriodStart;

    const masterPlanEnsureResult = await supabaseAdmin
      .from("production_master_plans")
      .select("master_plan_no")
      .eq("master_plan_no", normalizedMasterPlanNo)
      .maybeSingle();
    if (masterPlanEnsureResult.error) {
      throw masterPlanEnsureResult.error;
    }
    if (!masterPlanEnsureResult.data) {
      const masterInsertResult = await supabaseAdmin
        .from("production_master_plans")
        .upsert({
          master_plan_no: normalizedMasterPlanNo,
          period_start: masterPeriodStart,
          period_end: masterPeriodEnd,
          status: "draft",
          created_by: actorUserId,
          updated_by: actorUserId,
        }, { onConflict: "master_plan_no" });
      if (masterInsertResult.error) {
        throw masterInsertResult.error;
      }
    }

    let upsertResult = await supabaseAdmin
      .from("production_plan_status")
      .upsert(upsertRows, { onConflict: "plan_id" })
      .select("plan_id");
    if (
      upsertResult.error
      && (isMissingColumnError(upsertResult.error, "schedule_section_def_id")
        || isMissingColumnError(upsertResult.error, "schedule_section_name"))
    ) {
      const fallbackRows = upsertRows.map((row) => {
        const { schedule_section_def_id, schedule_section_name, ...rest } = row;
        void schedule_section_def_id;
        void schedule_section_name;
        return rest;
      });
      upsertResult = await supabaseAdmin
        .from("production_plan_status")
        .upsert(fallbackRows, { onConflict: "plan_id" })
        .select("plan_id");
    }
    if (upsertResult.error) {
      throw upsertResult.error;
    }

    // production_sub_plans has a unique constraint on (master_plan_no, department_id),
    // so there can only be ONE sub-plan row per dept per master plan.
    // Use the first work date's sub_plan_no and upsert on the unique (master_plan_no, department_id) pair.
    const firstWorkDate = mergedLines[0]?.workDate || fallbackWorkDate;
    const subPlanUpsert = await supabaseAdmin
      .from("production_sub_plans")
      .upsert(
        {
          sub_plan_no: resolvedSubPlanNo,
          master_plan_no: normalizedMasterPlanNo,
          department_id: departmentId,
          status: "draft",
          note: firstWorkDate || null,
          confirmed_at: null,
          confirmed_by: null,
          confirmed_by_name: null,
          updated_by: actorUserId,
          created_by: actorUserId,
        },
        { onConflict: "master_plan_no,department_id" }
      );
    if (subPlanUpsert.error) {
      throw subPlanUpsert.error;
    }
  }

  return {
    departmentId,
    departmentCode,
    subPlanNo: resolvedSubPlanNo || null,
    lineCount: upsertRows.length,
    deletedLineCount: deletePlanIds.length,
  };
}

export async function autoGenerateSubplanDraftsForMasterPlan({
  supabaseAdmin,
  request,
  masterPlanNo,
  actorUserId = null,
  nowIso = new Date().toISOString(),
}) {
  const normalizedMasterPlanNo = normalizeMasterPlanNo(masterPlanNo);
  if (!normalizedMasterPlanNo) {
    throw new Error("Invalid masterPlanNo format");
  }

  const mainRows = await loadMainPlanRowsForMasterPlan(supabaseAdmin, normalizedMasterPlanNo);
  const planRange = buildPlanRange(mainRows);
  const departmentGroups = buildDepartmentGroups(mainRows);
  if (!departmentGroups.length) {
    return {
      ok: true,
      masterPlanNo: normalizedMasterPlanNo,
      planRange,
      totalLines: 0,
      departments: [],
      skippedDepartments: [],
    };
  }

  const departmentIds = departmentGroups.map((group) => group.departmentId);
  const departmentMap = await loadDepartmentMapByIds(supabaseAdmin, departmentIds);
  const activeGroups = [];
  const skippedDepartments = [];

  departmentGroups.forEach((group) => {
    const department = departmentMap.get(group.departmentId);
    if (!department || department.deleted_at || department.is_active === false) {
      skippedDepartments.push({
        departmentId: group.departmentId,
        reason: "inactive_or_missing_department",
      });
      return;
    }
    activeGroups.push({
      ...group,
      department,
    });
  });

  const demandGroups = await Promise.all(
    activeGroups.map(async (group) => {
      const { wipDemandRows } = await explodeWipDemandFromMainRows(supabaseAdmin, group.rows);
      let traceRows = [];
      try {
        traceRows = await explodeBomTraceBatchRows(
          supabaseAdmin,
          buildTracePlanItemsFromMainRows(group.rows),
          12
        );
      } catch (traceError) {
        if (!isMissingTraceRpcError(traceError)) {
          throw traceError;
        }
      }
      return {
        ...group,
        wipDemandRows,
        traceRows,
      };
    })
  );

  const allWipSkus = Array.from(
    new Set(
      demandGroups.flatMap((group) =>
        (group.wipDemandRows || []).map((row) => normalizeSku(row?.skuCode)).filter(Boolean)
      )
    )
  );

  const [stockBySku, wipPoliciesBySku, wipVersionMetaBySku] = await Promise.all([
    loadStockBySkus(request, allWipSkus),
    loadWipPoliciesBySkus(supabaseAdmin, allWipSkus),
    loadApprovedWipVersionMetaBySkus(supabaseAdmin, allWipSkus),
  ]);

  const productMetaBySku = await loadProductsMetaBySkus(supabaseAdmin, allWipSkus);
  const plannedMainWipSupplyBySku = new Map();
  activeGroups.forEach((group) => {
    (group.rows || []).forEach((row) => {
      const skuCode = normalizeSku(row?.sku_code);
      if (!skuCode || !allWipSkus.includes(skuCode)) return;
      const productMeta = productMetaBySku.get(skuCode);
      if (String(productMeta?.iccat_code || "").trim() !== "03") return;
      plannedMainWipSupplyBySku.set(
        skuCode,
        roundQty(
          toFiniteNumber(plannedMainWipSupplyBySku.get(skuCode), 0)
          + toFiniteNumber(row?.planned_qty, 0)
        )
      );
    });
  });
  const remainingStockBySku = new Map(
    allWipSkus.map((sku) => {
      const stockQty = stockBySku.get(sku);
      const versionMeta = wipVersionMetaBySku.get(sku);
      const unitsPerBatch = toFiniteNumber(versionMeta?.unitsPerBatch, 0);
      const isBatchMode = String(versionMeta?.wipQtyInputMode || "").trim().toLowerCase() === "batch";
      const planningStockQty =
        isBatchMode && unitsPerBatch > 0
          ? roundQty(toFiniteNumber(stockQty, 0) / unitsPerBatch, 6)
          : toFiniteNumber(stockQty, 0);
      return [sku, roundQty(planningStockQty + toFiniteNumber(plannedMainWipSupplyBySku.get(sku), 0), 6)];
    })
  );
  const departmentResults = [];

  for (const group of demandGroups) {
    const initialRequiredQtyBySku = new Map();
    (group.wipDemandRows || []).forEach((row) => {
      const skuCode = normalizeSku(row?.skuCode);
      if (!skuCode) return;
      initialRequiredQtyBySku.set(
        skuCode,
        roundQty(toFiniteNumber(initialRequiredQtyBySku.get(skuCode), 0) + toFiniteNumber(row?.requiredQty, 0))
      );
    });

    const adjustedRequiredQtyBySku = new Map(initialRequiredQtyBySku);
    const suggestedQtyBySku = new Map();
    const recomputeSuggested = (skuCode) => {
      const availableQty = toFiniteNumber(remainingStockBySku.get(skuCode), 0);
      const computed = computeWipGapByMode({
        requiredQty: toFiniteNumber(adjustedRequiredQtyBySku.get(skuCode), 0),
        availableQty,
        supplyMode: wipPoliciesBySku.get(skuCode)?.supplyMode,
      });
      suggestedQtyBySku.set(skuCode, roundQty(computed.suggestedProduceQty));
    };

    initialRequiredQtyBySku.forEach((_, skuCode) => recomputeSuggested(skuCode));

    const parentWipSetByChild = new Map();
    (Array.isArray(group.traceRows) ? group.traceRows : []).forEach((row) => {
      const childSku = normalizeSku(row?.childSku);
      const parentSku = normalizeSku(row?.parentSku);
      if (!childSku || !parentSku) return;
      if (!initialRequiredQtyBySku.has(childSku) || !initialRequiredQtyBySku.has(parentSku)) return;
      if (!parentWipSetByChild.has(childSku)) parentWipSetByChild.set(childSku, new Set());
      parentWipSetByChild.get(childSku).add(parentSku);
    });

    for (let pass = 0; pass < 4; pass += 1) {
      let changed = false;
      parentWipSetByChild.forEach((parentSet, childSku) => {
        const parents = Array.from(parentSet || []);
        if (!parents.length) return;

        let nextRequired = toFiniteNumber(adjustedRequiredQtyBySku.get(childSku), 0);
        if (parents.length === 1) {
          const parentSku = parents[0];
          const parentRequired = Math.max(0.000001, toFiniteNumber(adjustedRequiredQtyBySku.get(parentSku), 0));
          const parentSuggested = Math.max(0, toFiniteNumber(suggestedQtyBySku.get(parentSku), 0));
          const ratio = Math.max(0, Math.min(1, parentSuggested / parentRequired));
          nextRequired = roundQty(toFiniteNumber(initialRequiredQtyBySku.get(childSku), 0) * ratio);
        } else {
          const hasAnyParentSuggested = parents.some(
            (parentSku) => toFiniteNumber(suggestedQtyBySku.get(parentSku), 0) > 0
          );
          if (!hasAnyParentSuggested) {
            nextRequired = 0;
          }
        }

        if (Math.abs(nextRequired - toFiniteNumber(adjustedRequiredQtyBySku.get(childSku), 0)) > 0.0001) {
          adjustedRequiredQtyBySku.set(childSku, nextRequired);
          recomputeSuggested(childSku);
          changed = true;
        }
      });
      if (!changed) break;
    }

    const nettingRatioBySku = new Map();
    initialRequiredQtyBySku.forEach((initialRequiredQty, skuCode) => {
      const adjustedRequiredQty = Math.max(0, toFiniteNumber(adjustedRequiredQtyBySku.get(skuCode), 0));
      const ratio = initialRequiredQty > 0
        ? Math.max(0, Math.min(1, adjustedRequiredQty / initialRequiredQty))
        : 0;
      nettingRatioBySku.set(skuCode, ratio);
    });

    const lines = (group.wipDemandRows || [])
      .map((row) => {
        const skuCode = normalizeSku(row?.skuCode);
        if (!skuCode) return null;

        const meta = productMetaBySku.get(skuCode);
        void meta;
        const nettingRatio = toFiniteNumber(nettingRatioBySku.get(skuCode), 1);
        const effectiveRequiredQty = roundQty(toFiniteNumber(row?.requiredQty, 0) * nettingRatio, 6);
        if (effectiveRequiredQty <= 0) return null;
        const planningAvailableQty = toFiniteNumber(remainingStockBySku.get(skuCode), 0);
        const computed = computeWipGapByMode({
          requiredQty: effectiveRequiredQty,
          availableQty: planningAvailableQty,
          supplyMode: wipPoliciesBySku.get(skuCode)?.supplyMode,
        });

        remainingStockBySku.set(
          skuCode,
          Math.max(0, roundQty(planningAvailableQty - computed.stockUsedQty))
        );

        if (computed.suggestedProduceQty <= 0) return null;
        return {
          workDate: normalizeDateOnly(row?.workDate) || group.workDate || normalizeDateOnly(planRange?.start),
          skuCode,
          skuName: row?.skuName || skuCode,
          plannedQty: roundQty(computed.suggestedProduceQty),
          departmentId: group.departmentId,
          shiftId: row?.shiftId || null,
          shiftCode: row?.shiftCode || null,
          shiftName: row?.shiftName || null,
          sourceSectionDefId: String(row?.sourceSectionDefId || "").trim() || null,
          sourceSectionName: String(row?.sourceSectionName || "").trim() || null,
          workstreamCode: String(row?.workstreamCode || row?.sourceSectionDefId || "").trim() || null,
          mergePolicy: String(row?.mergePolicy || "strict_separate").trim().toLowerCase() || "strict_separate",
        };
      })
      .filter(Boolean);

    const persistResult = await persistSubplanDraftLines({
      supabaseAdmin,
      masterPlanNo: normalizedMasterPlanNo,
      department: group.department,
      lines,
      planRange,
      actorUserId,
      nowIso,
    });

    departmentResults.push({
      ...persistResult,
      departmentName: String(group.department?.name || "").trim() || null,
    });
  }

  return {
    ok: true,
    masterPlanNo: normalizedMasterPlanNo,
    planRange,
    totalLines: departmentResults.reduce(
      (sum, item) => sum + toFiniteNumber(item?.lineCount, 0),
      0
    ),
    departments: departmentResults,
    skippedDepartments,
  };
}
