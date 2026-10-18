"use server";

import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { getUserPermissions } from "@/lib/permissionsData";
import { getSessionFromRequest } from "@/lib/sessionToken";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { applyStockDeduction, clearIssuedCache } from "@/lib/stockDeduction";
import { fetchGatewayJson } from "@/lib/gatewayClient";
import { explodeBomBatch } from "@/lib/bomExplosionRpc";
import { isPlanningDateEditable } from "@/lib/planningAdjustment";
import {
  buildMasterPlanNo,
  buildSubPlanNo,
  extractMasterPlanSequence,
  isValidMasterPlanNo,
  normalizeMasterPlanNo,
  normalizeSubPlanNo,
} from "@/lib/planNo";

const TABLE_NAME = "production_plan_status";
const OVERRIDE_TABLE = "production_plan_material_overrides";
const EVENTS_TABLE = "production_plan_events";
const CONFIRMED_PLAN_STATUSES = new Set(["ready", "partial", "backorder", "blocked"]);
const PENDING_PLAN_STATUSES = new Set(["draft", "not_ready"]);
const ALLOWED_PLAN_STATUSES = new Set([
  ...Array.from(CONFIRMED_PLAN_STATUSES),
  ...Array.from(PENDING_PLAN_STATUSES),
  "cancelled",
]);
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
  baseOutputBoxes = 1,
  calculationBasis = "JOB_QTY",
  headcountBase = 1,
  headcountRoundMode = "NONE",
  machineBase = 1,
  machineRoundMode = "NONE",
  doughSetBase = 1,
  doughSetRoundMode = "NONE",
}) {
  const qty = Number(itemQty) || 0;
  if (qty <= 0) return 0;
  const basis = normalizeCalculationBasis(calculationBasis);
  if (basis === CALCULATION_BASIS.HEADCOUNT) {
    const people = Number(lineStaffCount);
    if (Number.isFinite(people) && people > 0) {
      const base = Math.max(0.0001, Number(headcountBase) || 1);
      return applyHeadcountRoundMode((people / base) * qty, headcountRoundMode);
    }
  }
  if (basis === CALCULATION_BASIS.MACHINE_COUNT) {
    const machines = Number(lineMachineNo);
    if (Number.isFinite(machines) && machines > 0) {
      const base = Math.max(0.0001, Number(machineBase) || 1);
      return applyHeadcountRoundMode((machines / base) * qty, machineRoundMode);
    }
  }
  if (basis === CALCULATION_BASIS.DOUGH_SET_COUNT) {
    const doughSets = Number(lineDoughSetCount);
    if (Number.isFinite(doughSets) && doughSets > 0) {
      const base = Math.max(0.0001, Number(doughSetBase) || 1);
      return applyHeadcountRoundMode((doughSets / base) * qty, doughSetRoundMode);
    }
  }
  const scaleBase = Number(baseOutputBoxes) > 0 ? Number(baseOutputBoxes) : 1;
  const scale = (Number(plannedQty) || 0) / scaleBase;
  return scale * qty;
}

function normalizeWipQtyInputMode(value, fallback = WIP_QTY_INPUT_MODES.BATCH) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === WIP_QTY_INPUT_MODES.UNIT || normalized === WIP_QTY_INPUT_MODES.BATCH) {
    return normalized;
  }
  return fallback;
}

function isMissingWipQtyModeColumn(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("wip_qty_input_mode");
}

function isMissingMachineBasisColumns(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("machine_base")
    || message.includes("machine_round_mode")
    || message.includes("dough_set_base")
    || message.includes("dough_set_round_mode")
  );
}

function normalizeDateInput(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return raw;
}

function normalizeSku(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizePlanStatus(value, confirmedAt = null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (ALLOWED_PLAN_STATUSES.has(normalized)) {
    return normalized;
  }
  return confirmedAt ? "ready" : "draft";
}

function isConfirmedPlanStatus(status) {
  return CONFIRMED_PLAN_STATUSES.has(normalizePlanStatus(status));
}

function toUtcDate(value) {
  const normalized = normalizeDateInput(value);
  if (!normalized) return null;
  return new Date(`${normalized}T00:00:00.000Z`);
}

function formatUtcDate(date) {
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function addDays(value, days) {
  const base = toUtcDate(value);
  if (!base) return null;
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + Number(days || 0));
  return formatUtcDate(next);
}

function maxDate(a, b) {
  const aDate = toUtcDate(a);
  const bDate = toUtcDate(b);
  if (!aDate && !bDate) return null;
  if (!aDate) return formatUtcDate(bDate);
  if (!bDate) return formatUtcDate(aDate);
  return aDate.getTime() >= bDate.getTime() ? formatUtcDate(aDate) : formatUtcDate(bDate);
}

function makePlanGroupId(periodStart, periodEnd) {
  void periodEnd;
  const start = normalizeDateInput(periodStart);
  if (!start) return null;
  const date = new Date(`${start}T00:00:00.000Z`);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const dayOfYear = Math.max(1, Math.floor((date.getTime() - yearStart.getTime()) / 86400000) + 1);
  return buildMasterPlanNo(start, Math.min(999, dayOfYear));
}

function isDateWithin(dateValue, startValue, endValue) {
  const date = toUtcDate(dateValue);
  const start = toUtcDate(startValue);
  const end = toUtcDate(endValue);
  if (!date || !start || !end) return false;
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

function normalizePlanId(value) {
  return String(value || "").trim();
}

function toPositiveNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function toNullableInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function normalizeTimeInput(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  const matched = normalized.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!matched) return null;
  const hour = matched[1];
  const minute = matched[2];
  const second = matched[3] || "00";
  return `${hour}:${minute}:${second}`;
}

function resolveBomScaleBase(versionRow, planKind = null) {
  const normalizedPlanKind = String(planKind || "").trim().toLowerCase();
  const baseOutputBoxes = Number(versionRow?.base_output_boxes);
  const baseBatch = Number(versionRow?.base_batch);
  const wipQtyInputMode = normalizeWipQtyInputMode(versionRow?.wip_qty_input_mode);
  // Sub-plan rows are WIP planning rows; scale base depends on WIP input mode.
  if (normalizedPlanKind === "sub") {
    if (wipQtyInputMode === WIP_QTY_INPUT_MODES.UNIT) {
      if (Number.isFinite(baseOutputBoxes) && baseOutputBoxes > 0) return baseOutputBoxes;
      if (Number.isFinite(baseBatch) && baseBatch > 0) return baseBatch;
      return 1;
    }
    if (Number.isFinite(baseBatch) && baseBatch > 0) return baseBatch;
    if (Number.isFinite(baseOutputBoxes) && baseOutputBoxes > 0) return baseOutputBoxes;
    return 1;
  }
  if (Number.isFinite(baseOutputBoxes) && baseOutputBoxes > 0) {
    return baseOutputBoxes;
  }
  if (Number.isFinite(baseBatch) && baseBatch > 0) {
    return baseBatch;
  }
  return 1;
}

function toMasterPlanNoDate(value) {
  const normalized = normalizeDateInput(value);
  return normalized || new Date().toISOString().slice(0, 10);
}

function buildMasterPlanNoFromSequence(dateValue, sequence) {
  const fallbackDate = toMasterPlanNoDate(dateValue);
  return buildMasterPlanNo(fallbackDate, sequence) || buildMasterPlanNo(new Date().toISOString().slice(0, 10), 1);
}

async function allocateMasterPlanNos(supabaseAdmin, enrichedRecords) {
  const dateByGroup = new Map();
  const reservedByDate = new Map();
  (enrichedRecords || []).forEach((record) => {
    const groupKey = String(record?.plan_group_id || "").trim().toUpperCase();
    const periodStart = toMasterPlanNoDate(record?.period_start);
    if (groupKey && !dateByGroup.has(groupKey)) {
      dateByGroup.set(groupKey, periodStart);
    }
    const explicitMaster = normalizeMasterPlanNo(record?.master_plan_no, periodStart, 1);
    if (!explicitMaster) return;
    const seq = extractMasterPlanSequence(explicitMaster);
    if (!Number.isFinite(seq)) return;
    if (!reservedByDate.has(periodStart)) {
      reservedByDate.set(periodStart, new Set());
    }
    reservedByDate.get(periodStart).add(seq);
  });

  const dateList = Array.from(new Set(Array.from(dateByGroup.values()).filter(Boolean)));
  const existingMaxByDate = new Map();

  await Promise.all(dateList.map(async (dateValue) => {
    const prefix = buildMasterPlanNo(dateValue, 0)?.replace(/000$/, "");
    if (!prefix) {
      existingMaxByDate.set(dateValue, 0);
      return;
    }

    const [masterRowsResult, statusRowsResult] = await Promise.all([
      supabaseAdmin
        .from("production_master_plans")
        .select("master_plan_no")
        .like("master_plan_no", `${prefix}%`),
      supabaseAdmin
        .from("production_plan_status")
        .select("master_plan_no")
        .like("master_plan_no", `${prefix}%`)
        .limit(1000),
    ]);

    const rows = [
      ...(masterRowsResult.data || []),
      ...(statusRowsResult.data || []),
    ];
    let maxSeq = 0;
    rows.forEach((row) => {
      const seq = extractMasterPlanSequence(row?.master_plan_no);
      if (Number.isFinite(seq) && seq > maxSeq) {
        maxSeq = seq;
      }
    });
    existingMaxByDate.set(dateValue, maxSeq);
  }));

  const masterNoByGroup = new Map();
  dateByGroup.forEach((dateValue, groupKey) => {
    const representative = (enrichedRecords || []).find((record) => String(record?.plan_group_id || "").trim().toUpperCase() === groupKey);
    const explicitMaster = normalizeMasterPlanNo(representative?.master_plan_no, dateValue, 1);
    if (explicitMaster) {
      masterNoByGroup.set(groupKey, explicitMaster);
      return;
    }

    const reserved = reservedByDate.get(dateValue) || new Set();
    let nextSequence = Math.max(1, Number(existingMaxByDate.get(dateValue) || 0) + 1);
    while (reserved.has(nextSequence)) {
      nextSequence += 1;
    }
    reserved.add(nextSequence);
    reservedByDate.set(dateValue, reserved);
    existingMaxByDate.set(dateValue, nextSequence);
    masterNoByGroup.set(groupKey, buildMasterPlanNoFromSequence(dateValue, nextSequence));
  });

  return masterNoByGroup;
}

function buildAutoBackorderPlanId(sourcePlanId) {
  const normalized = normalizePlanId(sourcePlanId);
  if (!normalized) return null;
  if (normalized.endsWith("__BO")) return normalized;
  return `${normalized}__BO`;
}

function buildAutoBackorderSubPlanNo(subPlanNo) {
  const normalized = String(subPlanNo || "").trim().toUpperCase();
  if (!normalized) return null;
  if (normalized.endsWith("-BO")) return normalized;
  if (isValidMasterPlanNo(normalized)) {
    return normalizeSubPlanNo(null, {
      masterPlanNo: normalized,
      departmentCode: "UNASSIGNED",
      backorder: true,
    });
  }
  if (normalizeSubPlanNo(normalized)) {
    return `${normalized}-BO`;
  }
  return null;
}

function isMissingPlanMetadataColumns(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("plan_kind") ||
    message.includes("plan_group_id") ||
    message.includes("parent_plan_id") ||
    message.includes("entry_date") ||
    message.includes("t_plus_days") ||
    message.includes("due_date") ||
    message.includes("formula_code") ||
    message.includes("formula_name") ||
    message.includes("bom_version_id") ||
    message.includes("master_plan_no") ||
    message.includes("sub_plan_no") ||
    message.includes("owner_department_id") ||
    message.includes("feasible_batch") ||
    message.includes("short_batch") ||
    message.includes("backorder_batch") ||
    message.includes("earliest_material_eta") ||
    message.includes("exception_reason") ||
    message.includes("plan_note") ||
    message.includes("schedule_section_def_id") ||
    message.includes("schedule_section_name") ||
    message.includes("shift_id") ||
    message.includes("shift_code") ||
    message.includes("shift_name")
  );
}

async function buildBomSnapshotForSku(
  supabaseAdmin,
  skuCode,
  plannedQty,
  lineStaffCount,
  lineMachineNo,
  lineDoughSetCount,
  nowIso,
  skuName = "",
  unit = "",
  preferredFormulaCode = null,
  preferredBomVersionId = null,
  planKind = null
) {
  const withFormulaSelect = `
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
            sku_name
          )
        )
      )
    `;
  const fallbackSelect = `
      sku_code,
      production_bom_versions!inner (
          id,
          version_no,
          status,
          base_batch,
          base_output_boxes,
          production_bom_items (
          material_sku_code,
          material_goods_code,
          qty,
          calculation_basis,
          headcount_base,
          headcount_round_mode,
          uom_name,
          products_cache (
            sku_name
          )
        )
      )
    `;

  let { data: boms, error: bomError } = await supabaseAdmin
    .from("production_boms")
    .select(withFormulaSelect)
    .eq("sku_code", skuCode)
    .eq("production_bom_versions.status", "approved")
    .order("version_no", { foreignTable: "production_bom_versions", ascending: false });
  if (
    bomError &&
    (
      String(bomError.message || "").toLowerCase().includes("formula_") ||
      isMissingWipQtyModeColumn(bomError) ||
      isMissingMachineBasisColumns(bomError)
    )
  ) {
    const fallbackResult = await supabaseAdmin
      .from("production_boms")
      .select(fallbackSelect)
      .eq("sku_code", skuCode)
      .eq("production_bom_versions.status", "approved")
      .order("version_no", { foreignTable: "production_bom_versions", ascending: false });
    boms = fallbackResult.data;
    bomError = fallbackResult.error;
  }

  if (bomError) {
    return { ok: false, error: bomError.message };
  }
  const bom = Array.isArray(boms) ? boms[0] : null;
  const versions = Array.isArray(bom?.production_bom_versions)
    ? bom.production_bom_versions
    : [];
  if (!bom || !versions.length) {
    return { ok: false, error: "BOM not found" };
  }
  const normalizeCode = (value) => String(value || "").trim().toUpperCase() || "DEFAULT";
  const selectedVersion =
    versions.find((version) => String(version?.id || "") === String(preferredBomVersionId || "")) ||
    versions.find((version) => normalizeCode(version?.formula_code) === normalizeCode(preferredFormulaCode)) ||
    versions[0];
  const latestVersion = selectedVersion;
  const baseBatch = Number(latestVersion?.base_batch ?? 1) || 1;
  const baseOutputBoxes = resolveBomScaleBase(latestVersion, planKind);
  const snapshotPlanId = `SNAP-${String(skuCode || "").trim().toUpperCase()}`;
  let explodedRows = [];
  try {
    explodedRows = await explodeBomBatch(
      supabaseAdmin,
      [{
        planId: snapshotPlanId,
        skuCode,
        plannedQty: Number(plannedQty) || 0,
        formulaCode: normalizeCode(latestVersion?.formula_code),
        bomVersionId: latestVersion?.id ?? null,
      }],
      12
    );
  } catch (error) {
    return {
      ok: false,
      error: `Failed to explode BOM: ${error?.message || "unknown error"}`,
    };
  }
  const basisDeltaByMaterial = new Map();
  const versionMaterials = Array.isArray(latestVersion?.production_bom_items)
    ? latestVersion.production_bom_items
    : [];
  versionMaterials.forEach((mat) => {
    const basis = normalizeCalculationBasis(mat?.calculation_basis);
    if (
      basis !== CALCULATION_BASIS.HEADCOUNT
      && basis !== CALCULATION_BASIS.MACHINE_COUNT
      && basis !== CALCULATION_BASIS.DOUGH_SET_COUNT
    ) return;
    const materialSkuCode = String(mat?.material_sku_code || "").trim().toUpperCase();
    const materialGoodsCode = String(mat?.material_goods_code || mat?.material_sku_code || "").trim().toUpperCase();
    if (!materialSkuCode || !materialGoodsCode) return;
    const jobQty = computeRequiredQtyFromBasis({
      plannedQty,
      lineStaffCount: null,
      itemQty: mat?.qty,
      baseOutputBoxes,
      calculationBasis: CALCULATION_BASIS.JOB_QTY,
    });
    const basisQty = computeRequiredQtyFromBasis({
      plannedQty,
      lineStaffCount,
      lineMachineNo,
      lineDoughSetCount,
      itemQty: mat?.qty,
      baseOutputBoxes,
      calculationBasis: basis,
      headcountBase: mat?.headcount_base,
      headcountRoundMode: mat?.headcount_round_mode,
      machineBase: mat?.machine_base,
      machineRoundMode: mat?.machine_round_mode,
      doughSetBase: mat?.dough_set_base,
      doughSetRoundMode: mat?.dough_set_round_mode,
    });
    const delta = basisQty - jobQty;
    if (!Number.isFinite(delta) || Math.abs(delta) < 0.0000001) return;
    const key = `${materialSkuCode}::${materialGoodsCode}`;
    basisDeltaByMaterial.set(key, (basisDeltaByMaterial.get(key) || 0) + delta);
  });

  const materials = explodedRows
    .filter((row) => row.planId === snapshotPlanId && Number(row.requiredQty) > 0)
    .map((row) => {
      const materialSkuCode = String(row.materialSkuCode || "").trim().toUpperCase();
      const materialGoodsCode = String(row.materialGoodsCode || row.materialSkuCode || "").trim().toUpperCase();
      const deltaKey = `${materialSkuCode}::${materialGoodsCode}`;
      const delta = Number(basisDeltaByMaterial.get(deltaKey) || 0);
      if (basisDeltaByMaterial.has(deltaKey)) {
        basisDeltaByMaterial.delete(deltaKey);
      }
      const requiredQty = (Number(row.requiredQty) || 0) + delta;
      return {
        skuCode: materialSkuCode,
        goodsCode: materialGoodsCode,
        name: row.materialName || "",
        requiredQty,
        issueQty: Math.ceil(Math.max(0, requiredQty)),
        unit: row.uomName || "",
        itemType: row.itemType || "UNKNOWN",
        hasCycle: Boolean(row.hasCycle),
        explosionDepth: Number(row.maxDepth) || 0,
      };
    })
    .filter((row) => Number(row.requiredQty) > 0);

  return {
    ok: true,
    data: {
      bomVersionId: latestVersion?.id ?? null,
      formulaCode: normalizeCode(latestVersion?.formula_code),
      formulaName: latestVersion?.formula_name || "สูตรหลัก",
      baseBatch,
      baseOutputBoxes,
      materials,
      snapshot: [
        {
          skuCode,
          skuName,
          plannedQty: Number(plannedQty) || 0,
          baseBatch,
          baseOutputBoxes,
          unit,
          bomVersionId: latestVersion?.id ?? null,
          formulaCode: normalizeCode(latestVersion?.formula_code),
          formulaName: latestVersion?.formula_name || "สูตรหลัก",
          generatedAt: nowIso,
          materials,
        },
      ],
    },
  };
}

function stripPlanMetadata(record) {
  if (!record) return record;
  const {
    plan_kind,
    plan_group_id,
    parent_plan_id,
    entry_date,
    t_plus_days,
    due_date,
    formula_code,
    formula_name,
    bom_version_id,
    master_plan_no,
    sub_plan_no,
    owner_department_id,
    feasible_batch,
    short_batch,
    backorder_batch,
    earliest_material_eta,
    exception_reason,
    plan_note,
    ...rest
  } = record;
  return rest;
}

async function loadOwnerDepartmentBySku(supabaseAdmin, skuCodes = []) {
  const normalizedSkus = Array.from(
    new Set((skuCodes ?? []).map((sku) => normalizeSku(sku)).filter(Boolean))
  );
  if (!normalizedSkus.length) {
    return new Map();
  }

  const { data, error } = await supabaseAdmin
    .from("production_department_products")
    .select("sku_code,is_owner,department_id,production_departments(code,name)")
    .in("sku_code", normalizedSkus)
    .order("sku_code", { ascending: true })
    .order("is_owner", { ascending: false })
    .order("id", { ascending: true });
  if (error) {
    throw error;
  }

  const ownerBySku = new Map();
  (data ?? []).forEach((row) => {
    const sku = normalizeSku(row?.sku_code);
    if (!sku || ownerBySku.has(sku)) return;
    ownerBySku.set(sku, {
      departmentId: row?.department_id || null,
      departmentCode: String(row?.production_departments?.code || "").trim().toUpperCase() || null,
      departmentName: row?.production_departments?.name || null,
      isOwner: Boolean(row?.is_owner),
    });
  });

  return ownerBySku;
}

function normalizeOverrideMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "skip") return "skip";
  if (normalized === "custom") return "custom";
  return "formula";
}

function getAdjustmentSummaryFromModes(modes = []) {
  const normalizedModes = modes.map((mode) => normalizeOverrideMode(mode));
  if (normalizedModes.includes("skip")) return "has_skip";
  if (normalizedModes.includes("custom")) return "custom";
  return "formula";
}

async function loadPlanningScopeByUser(supabaseAdmin, userId) {
  const membershipResult = await supabaseAdmin
    .from("production_department_users")
    .select("department_id,role")
    .eq("user_id", userId);
  if (membershipResult.error) {
    throw membershipResult.error;
  }

  const memberships = membershipResult.data ?? [];
  const departmentIds = Array.from(
    new Set(memberships.map((row) => String(row?.department_id || "")).filter(Boolean))
  );
  if (!departmentIds.length) {
    return {
      editableSkuSet: new Set(),
      editableDepartmentIdSet: new Set(),
    };
  }

  const activeDeptResult = await supabaseAdmin
    .from("production_departments")
    .select("id")
    .in("id", departmentIds)
    .eq("is_active", true)
    .is("deleted_at", null);
  if (activeDeptResult.error) {
    throw activeDeptResult.error;
  }

  const activeDeptSet = new Set((activeDeptResult.data ?? []).map((row) => String(row.id)));
  const editorDepartmentIds = memberships
    .filter((row) => row?.role === "editor" && activeDeptSet.has(String(row.department_id || "")))
    .map((row) => String(row.department_id));
  if (!editorDepartmentIds.length) {
    return {
      editableSkuSet: new Set(),
      editableDepartmentIdSet: new Set(),
    };
  }

  const mappedResult = await supabaseAdmin
    .from("production_department_products")
    .select("sku_code,is_owner")
    .in("department_id", editorDepartmentIds)
    .eq("is_owner", true);
  if (mappedResult.error) {
    throw mappedResult.error;
  }

  return {
    editableDepartmentIdSet: new Set(editorDepartmentIds),
    editableSkuSet: new Set(
      (mappedResult.data ?? [])
        .map((row) => normalizeSku(row?.sku_code))
        .filter(Boolean)
    ),
  };
}

function findUnauthorizedSkuCodes(records, editableSkuSet) {
  const unauthorized = new Set();
  (records ?? []).forEach((row) => {
    const sku = normalizeSku(row?.sku_code);
    if (!sku) return;
    if (!editableSkuSet.has(sku)) {
      unauthorized.add(sku);
    }
  });
  return Array.from(unauthorized);
}

function findUnauthorizedOwnerDepartments(records, editableDepartmentIdSet) {
  const unauthorized = new Set();
  (records ?? []).forEach((row) => {
    const deptId = String(row?.owner_department_id || "").trim();
    if (!deptId) return;
    if (!editableDepartmentIdSet.has(deptId)) {
      unauthorized.add(deptId);
    }
  });
  return Array.from(unauthorized);
}

async function hasPlanningManageAccess(request, userId, isAdmin = false) {
  if (isAdmin) return true;
  const permissionResult = await getUserPermissions(userId, { fresh: true });
  return Boolean(
    permissionResult?.isAdmin
      || permissionResult?.permissions?.includes("production-line-planning-manage")
  );
}

function buildOverrideRowsFromSnapshot({
  planId,
  snapshot,
  actorId = null,
  actorName = null,
  source = "planning_modal",
  eventAt = new Date().toISOString(),
}) {
  const materials = Array.isArray(snapshot?.materials) ? snapshot.materials : [];
  const rows = [];
  materials.forEach((material) => {
    const sku = String(material?.skuCode || "").trim().toUpperCase();
    const goodsCode = String(material?.goodsCode || material?.materialGoodsCode || material?.skuCode || "").trim().toUpperCase();
    if (!sku) return;
    const mode = normalizeOverrideMode(material?.override?.mode);
    if (mode === "formula") return;
    const reason = String(material?.override?.reason || "").trim();
    if (!reason) return;
    const requiredQty = Number(material?.requiredQty ?? 0);
    const issueQty = Number(material?.issueQty ?? 0);
    const baseRequiredQty = Number(material?.override?.baseRequiredQty ?? material?.requiredQty ?? 0);
    const baseIssueQty = Number(material?.override?.baseIssueQty ?? material?.issueQty ?? 0);
    rows.push({
      plan_id: planId,
      material_sku_code: sku,
      material_goods_code: goodsCode || sku,
      material_name: String(material?.name || material?.skuName || "").trim() || null,
      mode,
      required_qty: Number.isFinite(requiredQty) ? requiredQty : 0,
      issue_qty: Number.isFinite(issueQty) ? issueQty : 0,
      base_required_qty: Number.isFinite(baseRequiredQty) ? baseRequiredQty : 0,
      base_issue_qty: Number.isFinite(baseIssueQty) ? baseIssueQty : 0,
      reason,
      edited_at: eventAt,
      edited_by: actorName,
      edited_by_user_id: actorId,
      source,
      snapshot_generated_at: snapshot?.generatedAt || eventAt,
    });
  });
  return rows;
}

async function syncOverridesAndEvents(
  supabaseAdmin,
  records,
  {
    actorId = null,
    actorName = null,
    source = "planning_modal",
    eventAt = new Date().toISOString(),
  } = {}
) {
  if (!Array.isArray(records) || !records.length) return;
  const readyRecords = records.filter((record) => {
    const status = normalizePlanStatus(record?.status, record?.confirmed_at);
    return isConfirmedPlanStatus(status) && record?.plan_id;
  });
  if (!readyRecords.length) return;

  const planIds = Array.from(new Set(readyRecords.map((record) => String(record.plan_id)).filter(Boolean)));
  if (!planIds.length) return;

  const existingResult = await supabaseAdmin
    .from(OVERRIDE_TABLE)
    .select("plan_id")
    .in("plan_id", planIds);
  if (existingResult.error) throw existingResult.error;

  const existingCountByPlan = new Map();
  (existingResult.data || []).forEach((row) => {
    const planId = String(row?.plan_id || "");
    if (!planId) return;
    existingCountByPlan.set(planId, (existingCountByPlan.get(planId) || 0) + 1);
  });

  const nextRows = [];
  readyRecords.forEach((record) => {
    const snapshot = Array.isArray(record?.bom_snapshot) ? record.bom_snapshot[0] : null;
    if (!snapshot) return;
    nextRows.push(
      ...buildOverrideRowsFromSnapshot({
        planId: String(record.plan_id),
        snapshot,
        actorId,
        actorName,
        source,
        eventAt,
      })
    );
  });

  const deleteResult = await supabaseAdmin
    .from(OVERRIDE_TABLE)
    .delete()
    .in("plan_id", planIds);
  if (deleteResult.error) throw deleteResult.error;

  if (nextRows.length) {
    const insertResult = await supabaseAdmin
      .from(OVERRIDE_TABLE)
      .insert(nextRows);
    if (insertResult.error) throw insertResult.error;
  }

  const nextCountByPlan = new Map();
  nextRows.forEach((row) => {
    const planId = String(row.plan_id || "");
    if (!planId) return;
    nextCountByPlan.set(planId, (nextCountByPlan.get(planId) || 0) + 1);
  });

  const events = planIds.map((planId) => {
    const beforeCount = existingCountByPlan.get(planId) || 0;
    const afterCount = nextCountByPlan.get(planId) || 0;
    const eventType = afterCount > 0
      ? "plan_overrides_applied"
      : beforeCount > 0
        ? "plan_overrides_cleared"
        : "plan_no_overrides";
    return {
      plan_id: planId,
      event_type: eventType,
      actor_id: actorId,
      actor_name: actorName,
      source,
      payload: { beforeCount, afterCount },
      created_at: eventAt,
    };
  });

  if (events.length) {
    const eventResult = await supabaseAdmin
      .from(EVENTS_TABLE)
      .insert(events);
    if (eventResult.error) throw eventResult.error;
  }
}

export async function GET(request) {
  const permission = await requirePermissionKeys(request, [
    "production-line-planning-view",
    "production-line-planning-manage",
    "plan.view_all",
    "plan.publish_master",
    "plan.calculate_own_dept",
    "plan.edit_own_dept",
  ]);
  const supabase = createSupabaseServerClient(request, NextResponse.next());
  const supabaseAdmin = getSupabaseAdmin();
  const hasManageAccess = await hasPlanningManageAccess(
    request,
    permission.userId,
    permission.isAdmin
  );
  const scope = permission.isAdmin || hasManageAccess
    ? { editableSkuSet: null, editableDepartmentIdSet: null }
    : await loadPlanningScopeByUser(supabaseAdmin, permission.userId);
  const requestUrl = new URL(request.url);
  const periodStart = normalizeDateInput(requestUrl.searchParams.get("periodStart"));
  const periodEnd = normalizeDateInput(requestUrl.searchParams.get("periodEnd")) || periodStart;
  const effectivePeriodStart =
    periodStart && periodEnd && periodStart > periodEnd ? periodEnd : periodStart;
  const effectivePeriodEnd =
    periodStart && periodEnd && periodStart > periodEnd ? periodStart : periodEnd;
  let statusQuery = supabase
    .from(TABLE_NAME)
    .select("*")
    .order("confirmed_at", { ascending: false });

  if (effectivePeriodStart && effectivePeriodEnd) {
    statusQuery = statusQuery
      .lte("period_start", effectivePeriodEnd)
      .gte("period_end", effectivePeriodStart);
  } else if (effectivePeriodStart) {
    statusQuery = statusQuery
      .lte("period_start", effectivePeriodStart)
      .gte("period_end", effectivePeriodStart);
  }

  const { data, error } = await statusQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = Array.isArray(data) ? data : [];
  const skuCodes = Array.from(
    new Set(
      rows
        .map((row) => normalizeSku(row?.sku_code))
        .filter(Boolean)
    )
  );
  const masterPlanNos = Array.from(
    new Set(
      rows
        .map((row) => String(row?.master_plan_no || row?.plan_group_id || "").trim().toUpperCase())
        .filter(Boolean)
    )
  );
  const ownerDepartmentIds = Array.from(
    new Set(
      rows
        .map((row) => String(row?.owner_department_id || "").trim())
        .filter(Boolean)
    )
  );
  const planIds = rows.map((row) => String(row?.plan_id || "")).filter(Boolean);

  // async-parallel: run independent lookups concurrently to avoid response waterfalls.
  const productPromise = skuCodes.length
    ? supabaseAdmin
      .from("products_cache")
      .select("sku_code,brand_name")
      .in("sku_code", skuCodes)
    : Promise.resolve({ data: [], error: null });
  const masterNotePromise = masterPlanNos.length
    ? supabaseAdmin
      .from("production_master_plans")
      .select("master_plan_no,note")
      .in("master_plan_no", masterPlanNos)
    : Promise.resolve({ data: [], error: null });
  const ownerDeptPromise = ownerDepartmentIds.length
    ? supabaseAdmin
      .from("production_departments")
      .select("id,code,name")
      .in("id", ownerDepartmentIds)
    : Promise.resolve({ data: [], error: null });
  const overridePromise = planIds.length
    ? supabaseAdmin
      .from(OVERRIDE_TABLE)
      .select("plan_id,mode")
      .in("plan_id", planIds)
    : Promise.resolve({ data: [], error: null });

  const [productResult, masterNoteResult, ownerDeptResult, overrideResult] = await Promise.all([
    productPromise,
    masterNotePromise,
    ownerDeptPromise,
    overridePromise,
  ]);

  const productBySku = new Map();
  if (!productResult?.error) {
    (productResult?.data || []).forEach((row) => {
      const sku = normalizeSku(row?.sku_code);
      if (!sku) return;
      productBySku.set(sku, {
        brand_name: String(row?.brand_name || "").trim() || null,
      });
    });
  }
  const masterNoteByPlanNo = new Map();
  if (!masterNoteResult?.error) {
    (masterNoteResult?.data || []).forEach((row) => {
      const planNo = String(row?.master_plan_no || "").trim().toUpperCase();
      if (!planNo) return;
      masterNoteByPlanNo.set(planNo, String(row?.note || "").trim() || null);
    });
  }
  const ownerDeptById = new Map();
  if (!ownerDeptResult?.error) {
    (ownerDeptResult?.data ?? []).forEach((row) => {
      ownerDeptById.set(String(row.id), row);
    });
  }

  if (!planIds.length) {
    const rowsWithNotes = rows.map((row) => {
      const planNo = String(row?.master_plan_no || row?.plan_group_id || "").trim().toUpperCase();
      const product = productBySku.get(normalizeSku(row?.sku_code)) || null;
      return {
        ...row,
        brand_name: row?.brand_name ?? product?.brand_name ?? null,
        master_plan_note: masterNoteByPlanNo.get(planNo) || null,
      };
    });
    return NextResponse.json({
      data: rowsWithNotes,
      meta: {
        isAdmin: Boolean(permission.isAdmin),
        canManageGlobal: Boolean(hasManageAccess),
        editableDepartmentIds: permission.isAdmin ? [] : Array.from(scope.editableDepartmentIdSet || []),
        editableSkus: permission.isAdmin ? [] : Array.from(scope.editableSkuSet || []),
      },
    }, { status: 200 });
  }

  if (overrideResult.error) {
    const fallbackRows = rows.map((row) => {
      const sku = normalizeSku(row?.sku_code);
      const product = productBySku.get(sku) || null;
      const canEdit = permission.isAdmin || hasManageAccess
        ? true
        : scope.editableSkuSet?.has(sku) ?? false;
      return {
        ...row,
        brand_name: row?.brand_name ?? product?.brand_name ?? null,
        material_adjustment: null,
        material_adjustment_count: 0,
        master_plan_note: masterNoteByPlanNo.get(String(row?.master_plan_no || row?.plan_group_id || "").trim().toUpperCase()) || null,
        owner_department_code: ownerDeptById.get(String(row?.owner_department_id || "").trim())?.code || null,
        owner_department_name: ownerDeptById.get(String(row?.owner_department_id || "").trim())?.name || null,
        can_edit: canEdit,
      };
    });
    return NextResponse.json({
      data: fallbackRows,
      meta: {
        isAdmin: Boolean(permission.isAdmin),
        canManageGlobal: Boolean(hasManageAccess),
        editableDepartmentIds: permission.isAdmin ? [] : Array.from(scope.editableDepartmentIdSet || []),
        editableSkus: permission.isAdmin ? [] : Array.from(scope.editableSkuSet || []),
      },
    }, { status: 200 });
  }

  const modeByPlan = new Map();
  (overrideResult.data || []).forEach((row) => {
    const planId = String(row?.plan_id || "");
    if (!planId) return;
    const existingModes = modeByPlan.get(planId) || [];
    existingModes.push(row?.mode);
    modeByPlan.set(planId, existingModes);
  });

  const enriched = rows.map((row) => {
    const planId = String(row?.plan_id || "");
    const modes = modeByPlan.get(planId) || [];
    const sku = normalizeSku(row?.sku_code);
    const product = productBySku.get(sku) || null;
    const canEdit = permission.isAdmin || hasManageAccess
      ? true
      : scope.editableSkuSet?.has(sku) ?? false;
    return {
      ...row,
      brand_name: row?.brand_name ?? product?.brand_name ?? null,
      material_adjustment: getAdjustmentSummaryFromModes(modes),
      material_adjustment_count: modes.length,
      master_plan_note: masterNoteByPlanNo.get(String(row?.master_plan_no || row?.plan_group_id || "").trim().toUpperCase()) || null,
      owner_department_code: ownerDeptById.get(String(row?.owner_department_id || "").trim())?.code || null,
      owner_department_name: ownerDeptById.get(String(row?.owner_department_id || "").trim())?.name || null,
      can_edit: canEdit,
    };
  });

  return NextResponse.json({
    data: enriched,
    meta: {
      isAdmin: Boolean(permission.isAdmin),
      canManageGlobal: Boolean(hasManageAccess),
      editableDepartmentIds: permission.isAdmin ? [] : Array.from(scope.editableDepartmentIdSet || []),
      editableSkus: permission.isAdmin ? [] : Array.from(scope.editableSkuSet || []),
    },
  }, { status: 200 });
}

export async function POST(request) {
  const permission = await requirePermissionKeys(request, [
    "production-line-planning-manage",
    "plan.edit_own_dept",
  ]);
  const supabase = createSupabaseServerClient(request, NextResponse.next());
  const body = await request.json().catch(() => ({}));
  const editableFromDate = normalizeDateInput(body?.editableFromDate);
  const records = Array.isArray(body.records) ? body.records : [];
  if (!records.length) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }
  const supabaseAdmin = getSupabaseAdmin();
  const session = getSessionFromRequest(request, permission.userId);
  const hasManageAccess = await hasPlanningManageAccess(
    request,
    permission.userId,
    permission.isAdmin
  );
  const scope = permission.isAdmin || hasManageAccess
    ? { editableSkuSet: null, editableDepartmentIdSet: null }
    : await loadPlanningScopeByUser(supabaseAdmin, permission.userId);
  const now = new Date().toISOString();

  // async-parallel: start independent lookups early and resolve together later.
  const actorPromise = session?.userId
    ? supabaseAdmin
      .from("profiles")
      .select("username")
      .eq("id", session.userId)
      .maybeSingle()
    : Promise.resolve({ data: null, error: null });

  const invalidPlanNoIndexes = [];
  const derivedRecords = records.map((record, index) => {
    const periodStart = normalizeDateInput(record.period_start);
    const periodEnd = normalizeDateInput(record.period_end) || periodStart;
    const sourceMasterPlanNo = String(
      record.master_plan_no || record.masterPlanNo || record.plan_group_id || record.plan_no || ""
    ).trim().toUpperCase();
    const formulaCode = record.formula_code
      ? String(record.formula_code).trim().toUpperCase()
      : null;
    const formulaName = record.formula_name
      ? String(record.formula_name).trim()
      : null;
    const categoryId = String(record.category_id || record.categoryId || "").trim() || null;
    const ownerDepartmentId = String(record.owner_department_id || "").trim() || null;
    const planNote = String(
      record.plan_note
      ?? record.planNote
      ?? record.master_plan_note
      ?? record.masterPlanNote
      ?? ""
    ).trim() || null;
    const inputMasterPlanNo = normalizeMasterPlanNo(sourceMasterPlanNo, periodStart, 1);
    if (!inputMasterPlanNo) {
      invalidPlanNoIndexes.push(index);
    }
    const inputSubPlanNo = normalizeSubPlanNo(record.sub_plan_no || record.subPlanNo);
    return {
      ...record,
      period_start: periodStart,
      period_end: periodEnd,
      category_id: categoryId,
      plan_group_id: inputMasterPlanNo || null,
      formula_code: formulaCode,
      formula_name: formulaName,
      bom_version_id: record.bom_version_id || null,
      owner_department_id: ownerDepartmentId,
      plan_note: planNote,
      schedule_section_def_id: String(
        record.schedule_section_def_id ?? record.scheduleSectionDefId ?? ""
      ).trim() || null,
      schedule_section_name: String(
        record.schedule_section_name ?? record.scheduleSectionName ?? ""
      ).trim() || null,
      line_staff_count: toNullableInteger(record.line_staff_count ?? record.lineStaffCount),
      line_machine_no: toNullableInteger(record.line_machine_no ?? record.lineMachineNo),
      line_dough_set_count: toNullableInteger(record.line_dough_set_count ?? record.lineDoughSetCount),
      shift_id: String(record.shift_id ?? record.shiftId ?? "").trim() || null,
      shift_code: String(record.shift_code ?? record.shiftCode ?? "").trim().toUpperCase() || null,
      shift_name: String(record.shift_name ?? record.shiftName ?? "").trim() || null,
      work_start_time: normalizeTimeInput(record.work_start_time ?? record.workStartTime),
      work_end_time: normalizeTimeInput(record.work_end_time ?? record.workEndTime),
      item_note: String(record.item_note ?? record.itemNote ?? "").trim() || null,
      master_plan_no: inputMasterPlanNo || null,
      sub_plan_no: inputSubPlanNo,
    };
  });
  if (invalidPlanNoIndexes.length) {
    return NextResponse.json({
      error: "masterPlanNo is required for every record",
      details: { recordIndexes: invalidPlanNoIndexes },
    }, { status: 400 });
  }
  if (
    editableFromDate
    && derivedRecords.some((record) => !isPlanningDateEditable(record.period_start, editableFromDate))
  ) {
    return NextResponse.json(
      { error: "ไม่สามารถแก้ไขแผนของวันที่ผ่านมาแล้ว" },
      { status: 400 }
    );
  }
  if (!permission.isAdmin && !hasManageAccess) {
    const unauthorizedSkus = findUnauthorizedSkuCodes(
      derivedRecords,
      scope.editableSkuSet
    );
    if (unauthorizedSkus.length) {
      return NextResponse.json({
        error: "Department scope violation",
        details: {
          skuCodes: unauthorizedSkus,
        },
      }, { status: 403 });
    }
    const unauthorizedDepartments = findUnauthorizedOwnerDepartments(
      derivedRecords,
      scope.editableDepartmentIdSet
    );
    if (unauthorizedDepartments.length) {
      return NextResponse.json({
        error: "Department scope violation",
        details: {
          departmentIds: unauthorizedDepartments,
        },
      }, { status: 403 });
    }
  }

  const planIds = Array.from(
    new Set(derivedRecords.map((record) => record.plan_id).filter(Boolean))
  );
  const groupIds = Array.from(
    new Set(derivedRecords.map((record) => record.plan_group_id).filter(Boolean))
  );
  const startDates = derivedRecords
    .map((record) => normalizeDateInput(record.period_start))
    .filter(Boolean);
  const minStart = startDates.length ? startDates.slice().sort()[0] : null;
  const maxStart = startDates.length ? startDates.slice().sort()[startDates.length - 1] : null;
  const targetSkuCodes = Array.from(
    new Set(derivedRecords.map((record) => normalizeSku(record.sku_code)).filter(Boolean))
  );

  const existingByIdPromise = planIds.length
    ? supabaseAdmin
      .from(TABLE_NAME)
      .select(
        "plan_id,plan_kind,plan_group_id,parent_plan_id,entry_date,t_plus_days,due_date,formula_code,formula_name,bom_version_id,master_plan_no,sub_plan_no,owner_department_id,feasible_batch,short_batch,backorder_batch,earliest_material_eta,exception_reason,plan_note,category_id,schedule_section_def_id,schedule_section_name,line_staff_count,line_machine_no,line_dough_set_count,shift_id,shift_code,shift_name,work_start_time,work_end_time,item_note"
      )
      .in("plan_id", planIds)
    : Promise.resolve({ data: [], error: null });

  const existingMainsPromise = groupIds.length
    ? supabaseAdmin
      .from(TABLE_NAME)
      .select("plan_id,plan_group_id,plan_kind,inserted_at,status,confirmed_at")
      .in("plan_group_id", groupIds)
      .eq("plan_kind", "main")
      .eq("status", "ready")
      .order("inserted_at", { ascending: true })
    : Promise.resolve({ data: [], error: null });

  const mainCandidatesPromise =
    minStart && maxStart
      ? supabaseAdmin
        .from(TABLE_NAME)
        .select("plan_id,plan_kind,plan_group_id,period_start,period_end,inserted_at,status,confirmed_at")
        .eq("plan_kind", "main")
        .eq("status", "ready")
        .lte("period_start", maxStart)
        .gte("period_end", minStart)
        .order("inserted_at", { ascending: true })
      : Promise.resolve({ data: [], error: null });

  const ownerBySkuPromise = loadOwnerDepartmentBySku(supabaseAdmin, targetSkuCodes);

  const [actorResult, existingByIdResult, existingMainsResult, mainCandidatesResult, ownerBySku] =
    await Promise.all([
      actorPromise,
      existingByIdPromise,
      existingMainsPromise,
      mainCandidatesPromise,
      ownerBySkuPromise,
    ]);

  const actorName = actorResult?.data?.username ?? null;
  if (existingByIdResult?.error && !isMissingPlanMetadataColumns(existingByIdResult.error)) {
    return NextResponse.json({ error: existingByIdResult.error.message }, { status: 500 });
  }
  if (existingMainsResult?.error && !isMissingPlanMetadataColumns(existingMainsResult.error)) {
    return NextResponse.json({ error: existingMainsResult.error.message }, { status: 500 });
  }
  if (mainCandidatesResult?.error && !isMissingPlanMetadataColumns(mainCandidatesResult.error)) {
    return NextResponse.json({ error: mainCandidatesResult.error.message }, { status: 500 });
  }
  const missingByIdColumns = isMissingPlanMetadataColumns(existingByIdResult?.error);
  const missingMainColumns = isMissingPlanMetadataColumns(existingMainsResult?.error);
  const missingCandidateColumns = isMissingPlanMetadataColumns(mainCandidatesResult?.error);
  const planMetadataAvailable = !missingByIdColumns && !missingMainColumns && !missingCandidateColumns;
  const existingByIdRows = missingByIdColumns ? [] : (existingByIdResult?.data ?? []);
  const existingMainsRows = missingMainColumns ? [] : (existingMainsResult?.data ?? []);
  const mainCandidateRows = missingCandidateColumns ? [] : (mainCandidatesResult?.data ?? []);
  const existingById = new Map(
    existingByIdRows.map((row) => [row.plan_id, row])
  );
  const mainByGroup = new Map();
  existingMainsRows.forEach((row) => {
    if (!row?.plan_group_id || mainByGroup.has(row.plan_group_id)) return;
    mainByGroup.set(row.plan_group_id, row);
  });
  const mainCandidates = mainCandidateRows.map((row) => {
    const groupId =
      row.plan_group_id || makePlanGroupId(row.period_start, row.period_end || row.period_start);
    return {
      ...row,
      plan_group_id: groupId,
    };
  });
  const allocatedMasterNoByGroup = await allocateMasterPlanNos(supabaseAdmin, derivedRecords);

  const resolveStatus = (record) =>
    normalizePlanStatus(record.status, record.confirmed_at);

  const enrichedRecords = derivedRecords.map((record) => {
    const existing = record.plan_id ? existingById.get(record.plan_id) : null;
    const recordStatus = resolveStatus(record);
    const coveringMain =
      mainCandidates.find((main) =>
        isDateWithin(record.period_start, main.period_start, main.period_end)
      ) || null;
    const planGroupId =
      existing?.plan_group_id ||
      coveringMain?.plan_group_id ||
      record.plan_group_id ||
      null;
    const canonicalMasterPlanNo =
      existing?.master_plan_no ||
      normalizeMasterPlanNo(record.master_plan_no, record.period_start, 1) ||
      allocatedMasterNoByGroup.get(String(planGroupId || "").trim().toUpperCase()) ||
      normalizeMasterPlanNo(planGroupId, record.period_start, 1) ||
      null;
    const groupKey = canonicalMasterPlanNo || planGroupId || null;
    const existingKind = existing?.plan_kind || null;
    const hasReadyMain =
      Boolean(coveringMain?.plan_id) || (groupKey ? mainByGroup.has(groupKey) : false);

    // Resolve plan kind based on confirmed main presence.
    let resolvedKind = existingKind || (record.plan_kind === "main" ? "main" : null);
    if (resolvedKind === "sub" && !isConfirmedPlanStatus(recordStatus) && !hasReadyMain) {
      resolvedKind = "main";
    }
    if (!resolvedKind) {
      resolvedKind = hasReadyMain ? "sub" : "main";
    }
    if (resolvedKind === "main" && isConfirmedPlanStatus(recordStatus) && groupKey && !mainByGroup.has(groupKey)) {
      mainByGroup.set(groupKey, {
        plan_id: record.plan_id,
        plan_group_id: groupKey,
        plan_kind: "main",
      });
    }

    const mainRecord =
      coveringMain?.plan_id
        ? coveringMain
        : groupKey
          ? mainByGroup.get(groupKey)
          : null;
    const parentPlanId =
      existing?.parent_plan_id ||
      (resolvedKind === "sub" ? mainRecord?.plan_id ?? null : null);

    const entryDate =
      normalizeDateInput(existing?.entry_date) ||
      normalizeDateInput(record.entry_date) ||
      normalizeDateInput(record.period_start) ||
      now.slice(0, 10);

    const tPlusDaysRaw = Number(existing?.t_plus_days ?? record.t_plus_days ?? 3);
    const tPlusDays = Number.isFinite(tPlusDaysRaw) && tPlusDaysRaw > 0 ? tPlusDaysRaw : 3;

    const minDueDate = addDays(entryDate, tPlusDays);
    const defaultDueDate =
      resolvedKind === "sub"
        ? minDueDate
        : normalizeDateInput(record.period_end) || normalizeDateInput(record.period_start);

    const dueDate =
      normalizeDateInput(existing?.due_date) ||
      normalizeDateInput(record.due_date) ||
      defaultDueDate;
    const formulaCode =
      record.formula_code ||
      existing?.formula_code ||
      null;
    const formulaName =
      record.formula_name ||
      existing?.formula_name ||
      null;
    const bomVersionId =
      record.bom_version_id ||
      existing?.bom_version_id ||
      null;
    const skuCode = normalizeSku(record.sku_code);
    const skuOwner = ownerBySku.get(skuCode) || null;
    const ownerDepartmentId =
      existing?.owner_department_id ||
      record.owner_department_id ||
      skuOwner?.departmentId ||
      null;
    const scheduleSectionDefId =
      String(record.schedule_section_def_id ?? existing?.schedule_section_def_id ?? "").trim() || null;
    const scheduleSectionName =
      String(record.schedule_section_name ?? existing?.schedule_section_name ?? "").trim() || null;
    const masterPlanNo = canonicalMasterPlanNo;
    const subPlanNo =
      resolvedKind === "sub"
        ? (
          (masterPlanNo
            ? buildSubPlanNo(
              masterPlanNo,
              skuOwner?.departmentCode || ownerDepartmentId || "UNASSIGNED"
            )
            : null)
          || normalizeSubPlanNo(existing?.sub_plan_no)
          || normalizeSubPlanNo(record.sub_plan_no)
        )
        : null;
    const feasibleBatch =
      Number.isFinite(Number(record.feasible_batch)) ? Number(record.feasible_batch)
        : Number.isFinite(Number(existing?.feasible_batch)) ? Number(existing.feasible_batch)
          : null;
    const shortBatch =
      Number.isFinite(Number(record.short_batch)) ? Number(record.short_batch)
        : Number.isFinite(Number(existing?.short_batch)) ? Number(existing.short_batch)
          : null;
    const backorderBatch =
      Number.isFinite(Number(record.backorder_batch)) ? Number(record.backorder_batch)
        : Number.isFinite(Number(existing?.backorder_batch)) ? Number(existing.backorder_batch)
          : null;
    const earliestMaterialEta =
      normalizeDateInput(record.earliest_material_eta) ||
      normalizeDateInput(existing?.earliest_material_eta) ||
      null;
    const exceptionReason = String(record.exception_reason || existing?.exception_reason || "").trim() || null;
    const planNote = String(record.plan_note || existing?.plan_note || "").trim() || null;
    const categoryId = String(record.category_id || existing?.category_id || "").trim() || null;
    const lineStaffCount = toNullableInteger(record.line_staff_count ?? existing?.line_staff_count);
    const lineMachineNo = toNullableInteger(record.line_machine_no ?? existing?.line_machine_no);
    const lineDoughSetCount = toNullableInteger(
      record.line_dough_set_count ?? existing?.line_dough_set_count
    );
    const shiftId = String(record.shift_id ?? existing?.shift_id ?? "").trim() || null;
    const shiftCode = String(record.shift_code ?? existing?.shift_code ?? "").trim().toUpperCase() || null;
    const shiftName = String(record.shift_name ?? existing?.shift_name ?? "").trim() || null;
    const workStartTime = normalizeTimeInput(record.work_start_time ?? existing?.work_start_time);
    const workEndTime = normalizeTimeInput(record.work_end_time ?? existing?.work_end_time);
    const itemNote = String(record.item_note || existing?.item_note || "").trim() || null;

    const periodEnd =
      resolvedKind === "sub" ? maxDate(record.period_end, minDueDate) : record.period_end;

    return {
      ...record,
      period_end: periodEnd,
      plan_group_id: masterPlanNo || planGroupId,
      plan_kind: resolvedKind,
      parent_plan_id: parentPlanId,
      entry_date: entryDate,
      t_plus_days: tPlusDays,
      due_date: dueDate,
      formula_code: formulaCode,
      formula_name: formulaName,
      bom_version_id: bomVersionId,
      owner_department_id: ownerDepartmentId,
      schedule_section_def_id: scheduleSectionDefId,
      schedule_section_name: scheduleSectionName,
      category_id: categoryId,
      line_staff_count: lineStaffCount,
      line_machine_no: lineMachineNo,
      line_dough_set_count: lineDoughSetCount,
      shift_id: shiftId,
      shift_code: shiftCode,
      shift_name: shiftName,
      work_start_time: workStartTime,
      work_end_time: workEndTime,
      item_note: itemNote,
      master_plan_no: masterPlanNo || null,
      sub_plan_no: subPlanNo || null,
      feasible_batch: feasibleBatch,
      short_batch: shortBatch,
      backorder_batch: backorderBatch,
      earliest_material_eta: earliestMaterialEta,
      exception_reason: exceptionReason,
      plan_note: planNote,
    };
  });
  const missingResolvedPlanNoIndexes = enrichedRecords
    .map((record, index) => ({ index, planNo: String(record?.master_plan_no || "").trim() }))
    .filter((row) => !row.planNo)
    .map((row) => row.index);
  if (missingResolvedPlanNoIndexes.length) {
    return NextResponse.json({
      error: "masterPlanNo is required for every record",
      details: { recordIndexes: missingResolvedPlanNoIndexes },
    }, { status: 400 });
  }
  const missingOwnerForSubIndexes = enrichedRecords
    .map((record, index) => ({
      index,
      planKind: String(record?.plan_kind || "").trim().toLowerCase(),
      ownerDepartmentId: String(record?.owner_department_id || "").trim(),
    }))
    .filter((row) => row.planKind === "sub" && !row.ownerDepartmentId)
    .map((row) => row.index);
  if (missingOwnerForSubIndexes.length) {
    return NextResponse.json({
      error: "owner_department_id is required for sub plans",
      details: { recordIndexes: missingOwnerForSubIndexes },
    }, { status: 400 });
  }
  if (!permission.isAdmin && !hasManageAccess) {
    const unauthorizedResolvedDepartments = findUnauthorizedOwnerDepartments(
      enrichedRecords,
      scope.editableDepartmentIdSet
    );
    if (unauthorizedResolvedDepartments.length) {
      return NextResponse.json({
        error: "Department scope violation",
        details: {
          departmentIds: unauthorizedResolvedDepartments,
        },
      }, { status: 403 });
    }
  }

  const recordsForUpsert = planMetadataAvailable
    ? enrichedRecords
    : enrichedRecords.map(stripPlanMetadata);

  const readyRecordsNeedingSnapshot = records.filter((record) => {
    const status = normalizePlanStatus(record.status, record.confirmed_at);
    const hasSnapshot = Array.isArray(record.bom_snapshot) && record.bom_snapshot.length > 0;
    return isConfirmedPlanStatus(status) && record.sku_code && !hasSnapshot;
  });
  const bomSnapshotBySku = new Map();
  if (readyRecordsNeedingSnapshot.length) {
    try {
      const skuCodes = Array.from(
        new Set(
          readyRecordsNeedingSnapshot
            .map((record) => String(record.sku_code || "").trim().toUpperCase())
            .filter(Boolean)
        )
      );

      if (skuCodes.length) {
        let { data: boms, error: bomError } = await supabaseAdmin
          .from("production_boms")
          .select(`
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
                  sku_name
                )
              )
            )
          `)
          .in("sku_code", skuCodes)
          .eq("production_bom_versions.status", "approved")
          .order("version_no", { foreignTable: "production_bom_versions", ascending: false });
        if (
          bomError &&
          (
            String(bomError.message || "").toLowerCase().includes("formula_") ||
            isMissingWipQtyModeColumn(bomError) ||
            isMissingMachineBasisColumns(bomError)
          )
        ) {
          const fallbackResult = await supabaseAdmin
            .from("production_boms")
            .select(`
              sku_code,
              production_bom_versions!inner (
                  id,
                  version_no,
                  status,
                  base_batch,
                  base_output_boxes,
                  production_bom_items (
                  material_sku_code,
                  material_goods_code,
                  qty,
                  calculation_basis,
                  headcount_base,
                  headcount_round_mode,
                  uom_name,
                  products_cache (
                    sku_name
                  )
                )
              )
            `)
            .in("sku_code", skuCodes)
            .eq("production_bom_versions.status", "approved")
            .order("version_no", { foreignTable: "production_bom_versions", ascending: false });
          boms = fallbackResult.data;
          bomError = fallbackResult.error;
        }

        if (!bomError && Array.isArray(boms)) {
          const normalizeCode = (value) => String(value || "").trim().toUpperCase() || "DEFAULT";
          const versionsBySku = new Map();
          boms.forEach((bom) => {
            const skuCode = String(bom?.sku_code || "").trim().toUpperCase();
            const versions = Array.isArray(bom?.production_bom_versions)
              ? bom.production_bom_versions
              : [];
            if (!skuCode || !versions.length || versionsBySku.has(skuCode)) {
              return;
            }
            versionsBySku.set(skuCode, versions.map((version) => ({
              ...version,
              formula_code: normalizeCode(version.formula_code),
              formula_name: version.formula_name || "สูตรหลัก",
            })));
          });

          readyRecordsNeedingSnapshot.forEach((record) => {
            const skuCode = String(record.sku_code || "").trim().toUpperCase();
            const versions = versionsBySku.get(skuCode) || [];
            const preferredVersionId = String(record.bom_version_id || "").trim();
            const preferredFormulaCode = normalizeCode(record.formula_code);
            const selectedVersion =
              versions.find((version) => String(version?.id || "") === preferredVersionId) ||
              versions.find((version) => normalizeCode(version?.formula_code) === preferredFormulaCode) ||
              versions[0];
            if (!selectedVersion) {
              return;
            }
            const plannedQty = Number(record.planned_qty ?? 0) || 0;
            const lineStaffCount = toNullableInteger(record.line_staff_count ?? record.lineStaffCount);
            const lineMachineNo = toNullableInteger(record.line_machine_no ?? record.lineMachineNo);
            const lineDoughSetCount = toNullableInteger(
              record.line_dough_set_count ?? record.lineDoughSetCount
            );
            const baseBatch = Number(selectedVersion.base_batch) > 0 ? Number(selectedVersion.base_batch) : 1;
            const baseOutputBoxes = resolveBomScaleBase(selectedVersion, record.plan_kind);
            const materials = (Array.isArray(selectedVersion.production_bom_items)
              ? selectedVersion.production_bom_items
              : []).map((mat) => {
              const cachedProduct = Array.isArray(mat.products_cache)
                ? mat.products_cache[0]
                : mat.products_cache;
              const matName = cachedProduct?.sku_name || "";
              const requiredQty = computeRequiredQtyFromBasis({
                plannedQty,
                lineStaffCount,
                lineMachineNo,
                lineDoughSetCount,
                itemQty: mat.qty,
                baseOutputBoxes,
                calculationBasis: mat.calculation_basis,
                headcountBase: mat.headcount_base,
                headcountRoundMode: mat.headcount_round_mode,
                machineBase: mat.machine_base,
                machineRoundMode: mat.machine_round_mode,
                doughSetBase: mat.dough_set_base,
                doughSetRoundMode: mat.dough_set_round_mode,
              });
              return {
                skuCode: String(mat.material_sku_code || "").trim().toUpperCase(),
                goodsCode: String(mat.material_goods_code || mat.material_sku_code || "").trim().toUpperCase(),
                name: matName,
                requiredQty,
                issueQty: Math.ceil(requiredQty),
                unit: mat.uom_name || "",
              };
            });

            bomSnapshotBySku.set(skuCode, [
              {
                skuCode,
                skuName: record.sku_name || "",
                plannedQty,
                baseBatch,
                baseOutputBoxes,
                unit: record.unit || "",
                bomVersionId: selectedVersion.id ?? null,
                formulaCode: normalizeCode(selectedVersion.formula_code),
                formulaName: selectedVersion.formula_name || "สูตรหลัก",
                generatedAt: now,
                materials,
              },
            ]);
          });
        }
      }
    } catch (error) {
      // Snapshot generation is best-effort; persistence should still proceed.
    }
  }
  const payload = recordsForUpsert.map((r) => {
    const normalizedStatus = normalizePlanStatus(r.status, r.confirmed_at);
    const confirmed = isConfirmedPlanStatus(normalizedStatus);
    return {
      ...r,
      status: normalizedStatus,
      confirmed_at: confirmed ? (r.confirmed_at ?? now) : null,
      confirmed_by: confirmed ? (r.confirmed_by ?? actorName) : null,
      bom_snapshot: confirmed
        ? (Array.isArray(r.bom_snapshot) && r.bom_snapshot.length > 0
          ? r.bom_snapshot
          : (bomSnapshotBySku.get(String(r.sku_code || "").trim().toUpperCase()) ?? []))
        : [],
    };
  });

  const nowDate = now.slice(0, 10);
  const autoBackorderPayload = [];
  payload.forEach((row) => {
    const sourcePlanId = normalizePlanId(row?.plan_id);
    if (!sourcePlanId || sourcePlanId.endsWith("__BO")) return;
    const shortBatch = toPositiveNumber(row?.short_batch, 0);
    const backorderBatch = toPositiveNumber(row?.backorder_batch, shortBatch);
    const pendingBatch = backorderBatch > 0 ? backorderBatch : shortBatch;
    if (pendingBatch <= 0) return;

    const autoPlanId = buildAutoBackorderPlanId(sourcePlanId);
    if (!autoPlanId) return;
    const etaDate = normalizeDateInput(row?.earliest_material_eta);
    const sourceEnd = normalizeDateInput(row?.period_end) || normalizeDateInput(row?.period_start);
    const backorderStart = etaDate || addDays(sourceEnd || nowDate, 1) || nowDate;
    const backorderEnd = maxDate(backorderStart, addDays(backorderStart, Math.max(0, Number(row?.t_plus_days || 0))));
    const sourceSubPlanNo = String(row?.sub_plan_no || "").trim();

    autoBackorderPayload.push({
      ...row,
      plan_id: autoPlanId,
      parent_plan_id: sourcePlanId,
      status: "backorder",
      planned_qty: pendingBatch,
      feasible_batch: 0,
      short_batch: pendingBatch,
      backorder_batch: pendingBatch,
      period_start: backorderStart,
      period_end: backorderEnd || backorderStart,
      entry_date: nowDate,
      due_date: backorderEnd || backorderStart,
      confirmed_at: now,
      confirmed_by: row?.confirmed_by || actorName,
      earliest_material_eta: etaDate || null,
      exception_reason: row?.exception_reason || `Auto backorder from ${sourcePlanId}`,
      sub_plan_no: sourceSubPlanNo ? buildAutoBackorderSubPlanNo(sourceSubPlanNo) : null,
      bom_snapshot: [],
    });
  });

  const mergedPayloadByPlanId = new Map();
  [...payload, ...autoBackorderPayload].forEach((row) => {
    const planId = normalizePlanId(row?.plan_id);
    if (!planId) return;
    mergedPayloadByPlanId.set(planId, row);
  });
  const mergedPayload = Array.from(mergedPayloadByPlanId.values());

  const { error } = await supabase.from(TABLE_NAME).upsert(mergedPayload, {
    onConflict: "plan_id",
    ignoreDuplicates: false,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const masterAggregate = new Map();
  mergedPayload.forEach((row) => {
    const masterPlanNo = String(row?.master_plan_no || "").trim().toUpperCase();
    const start = normalizeDateInput(row?.period_start);
    const end = normalizeDateInput(row?.period_end) || start;
    if (!masterPlanNo || !start || !end) return;
    const existing = masterAggregate.get(masterPlanNo);
    if (!existing) {
      const rowNote = String(row?.plan_note || "").trim();
      const nextValue = {
        master_plan_no: masterPlanNo,
        period_start: start,
        period_end: end,
        status: row?.master_published_at ? "published" : "draft",
        published_at: row?.master_published_at || null,
        published_by: row?.master_published_by_user_id || null,
        published_by_name: row?.master_published_by || null,
        created_by: session?.userId || null,
        updated_by: session?.userId || null,
      };
      if (rowNote) {
        nextValue.note = rowNote;
      }
      masterAggregate.set(masterPlanNo, nextValue);
      return;
    }
    if (start < existing.period_start) existing.period_start = start;
    if (end > existing.period_end) existing.period_end = end;
    if (row?.master_published_at) {
      existing.status = "published";
      existing.published_at = row.master_published_at;
      existing.published_by = row.master_published_by_user_id || existing.published_by;
      existing.published_by_name = row.master_published_by || existing.published_by_name;
    }
    const rowNote = String(row?.plan_note || "").trim();
    if (rowNote) {
      existing.note = rowNote;
    }
    existing.updated_by = session?.userId || existing.updated_by || null;
  });

  if (masterAggregate.size > 0) {
    const masterUpsertResult = await supabaseAdmin
      .from("production_master_plans")
      .upsert(Array.from(masterAggregate.values()), { onConflict: "master_plan_no" });
    if (masterUpsertResult.error && !isMissingPlanMetadataColumns(masterUpsertResult.error)) {
      return NextResponse.json({ error: masterUpsertResult.error.message }, { status: 500 });
    }
  }

  const subAggregate = new Map();
  mergedPayload.forEach((row) => {
    if (String(row?.plan_kind || "").toLowerCase() !== "sub") return;
    const masterPlanNo = String(row?.master_plan_no || "").trim().toUpperCase();
    const departmentId = String(row?.owner_department_id || "").trim();
    const subPlanNo =
      buildSubPlanNo(
        masterPlanNo,
        departmentId.replace(/[^A-Za-z0-9]/g, "").slice(0, 12) || "UNASSIGNED"
      )
      || normalizeSubPlanNo(row?.sub_plan_no)
      || buildSubPlanNo(masterPlanNo, departmentId.replace(/[^A-Za-z0-9]/g, "").slice(0, 12) || "UNASSIGNED");
    if (!masterPlanNo || !departmentId || !subPlanNo) return;
    const key = subPlanNo;
    const currentStatus = isConfirmedPlanStatus(row?.status) ? "confirmed" : "draft";
    const current = subAggregate.get(key);
    if (!current) {
      subAggregate.set(key, {
        sub_plan_no: subPlanNo,
        master_plan_no: masterPlanNo,
        department_id: departmentId,
        status: currentStatus,
        note: normalizeDateInput(row?.period_start) || null,
        confirmed_at: isConfirmedPlanStatus(row?.status) ? (row?.confirmed_at || now) : null,
        confirmed_by: isConfirmedPlanStatus(row?.status) ? (session?.userId || null) : null,
        confirmed_by_name: isConfirmedPlanStatus(row?.status) ? (row?.confirmed_by || actorName || null) : null,
        created_by: session?.userId || null,
        updated_by: session?.userId || null,
      });
      return;
    }
    if (current.status !== "confirmed" && currentStatus === "confirmed") {
      current.status = "confirmed";
      current.confirmed_at = row?.confirmed_at || now;
      current.confirmed_by = session?.userId || current.confirmed_by || null;
      current.confirmed_by_name = row?.confirmed_by || actorName || current.confirmed_by_name || null;
    }
    current.updated_by = session?.userId || current.updated_by || null;
  });

  if (subAggregate.size > 0) {
    const subUpsertResult = await supabaseAdmin
      .from("production_sub_plans")
      .upsert(Array.from(subAggregate.values()), { onConflict: "sub_plan_no" });
    if (subUpsertResult.error && !isMissingPlanMetadataColumns(subUpsertResult.error)) {
      return NextResponse.json({ error: subUpsertResult.error.message }, { status: 500 });
    }
  }

  try {
    await syncOverridesAndEvents(supabaseAdmin, mergedPayload, {
      actorId: session?.userId || null,
      actorName,
      source: "planning_apply",
      eventAt: now,
    });
  } catch {
    // Best effort: keep primary plan status write successful.
  }

  return NextResponse.json({ ok: true }, { status: 200 });
}

export async function DELETE(request) {
  const permission = await requirePermissionKeys(request, [
    "production-line-planning-manage",
    "plan.edit_own_dept",
  ]);
  const supabase = createSupabaseServerClient(request, NextResponse.next());
  const supabaseAdmin = getSupabaseAdmin();
  const body = await request.json().catch(() => ({}));
  const editableFromDate = normalizeDateInput(body?.editableFromDate);
  const planIds = Array.isArray(body.planIds) ? body.planIds : [];
  const requestedMasterPlanNo = normalizeMasterPlanNo(
    body?.masterPlanNo || body?.planNo
  );

  if (!planIds.length) {
    return NextResponse.json({ ok: true }, { status: 200 });
  }
  if (!requestedMasterPlanNo) {
    return NextResponse.json({ error: "masterPlanNo is required" }, { status: 400 });
  }
  const planResult = await supabaseAdmin
    .from(TABLE_NAME)
    .select("plan_id,sku_code,owner_department_id,master_plan_no,plan_group_id,period_start")
    .in("plan_id", planIds);
  if (planResult.error) {
    return NextResponse.json({ error: planResult.error.message }, { status: 500 });
  }
  const planRows = Array.isArray(planResult.data) ? planResult.data : [];
  const planIdSet = new Set(planIds.map((id) => String(id || "").trim()).filter(Boolean));
  const foundPlanIdSet = new Set(planRows.map((row) => String(row?.plan_id || "").trim()).filter(Boolean));
  const missingPlanIds = Array.from(planIdSet).filter((id) => !foundPlanIdSet.has(id));
  if (!planRows.length) {
    return NextResponse.json({
      ok: true,
      deletedPlanIds: [],
      missingPlanIds,
    }, { status: 200 });
  }
  const planNoMismatch = planRows
    .map((row) => ({
      planId: row?.plan_id,
      masterPlanNo: normalizeMasterPlanNo(
        row?.master_plan_no || row?.plan_group_id
      ),
    }))
    .filter((row) => row.masterPlanNo !== requestedMasterPlanNo);
  if (planNoMismatch.length) {
    return NextResponse.json({
      error: "Plan No mismatch",
      details: {
        requestedMasterPlanNo,
        planIds: planNoMismatch.map((row) => row.planId),
      },
    }, { status: 400 });
  }
  if (
    editableFromDate
    && planRows.some((row) => !isPlanningDateEditable(row?.period_start, editableFromDate))
  ) {
    return NextResponse.json(
      { error: "ไม่สามารถแก้ไขแผนของวันที่ผ่านมาแล้ว" },
      { status: 400 }
    );
  }
  const hasManageAccess = await hasPlanningManageAccess(
    request,
    permission.userId,
    permission.isAdmin
  );
  if (!permission.isAdmin && !hasManageAccess) {
    const scope = await loadPlanningScopeByUser(supabaseAdmin, permission.userId);
    const unauthorizedSkus = findUnauthorizedSkuCodes(
      planRows,
      scope.editableSkuSet
    );
    if (unauthorizedSkus.length) {
      return NextResponse.json({
        error: "Department scope violation",
        details: {
          skuCodes: unauthorizedSkus,
        },
      }, { status: 403 });
    }
    const unauthorizedDepartments = findUnauthorizedOwnerDepartments(
      planRows,
      scope.editableDepartmentIdSet
    );
    if (unauthorizedDepartments.length) {
      return NextResponse.json({
        error: "Department scope violation",
        details: {
          departmentIds: unauthorizedDepartments,
        },
      }, { status: 403 });
    }
  }

  const { error } = await supabase
    .from(TABLE_NAME)
    .delete()
    .in("plan_id", planRows.map((row) => row.plan_id).filter(Boolean));
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    deletedPlanIds: planRows.map((row) => row.plan_id).filter(Boolean),
    missingPlanIds,
  }, { status: 200 });
}

export async function PATCH(request) {
  const permission = await requirePermissionKeys(request, [
    "production-line-planning-manage",
    "plan.edit_own_dept",
    "plan.approve_exception",
  ]);
  const supabase = createSupabaseServerClient(request, NextResponse.next());
  const body = await request.json().catch(() => ({}));
  const editableFromDate = normalizeDateInput(body?.editableFromDate);
  const planId = body.planId;
  const plannedQty = Number(body.plannedQty);
  const materialOverrides = Array.isArray(body.materialOverrides) ? body.materialOverrides : [];
  const requestedMasterPlanNo = normalizeMasterPlanNo(body?.masterPlanNo || body?.planNo);
  const lineStaffCount = toNullableInteger(body.lineStaffCount ?? body.line_staff_count);
  const lineMachineNo = toNullableInteger(body.lineMachineNo ?? body.line_machine_no);
  const lineDoughSetCount = toNullableInteger(body.lineDoughSetCount ?? body.line_dough_set_count);
  const shiftId = String(body.shiftId ?? body.shift_id ?? "").trim() || null;
  const shiftCode = String(body.shiftCode ?? body.shift_code ?? "").trim().toUpperCase() || null;
  const shiftName = String(body.shiftName ?? body.shift_name ?? "").trim() || null;
  const workStartTime = normalizeTimeInput(body.workStartTime ?? body.work_start_time);
  const workEndTime = normalizeTimeInput(body.workEndTime ?? body.work_end_time);
  const itemNote = body.itemNote === undefined && body.item_note === undefined
    ? undefined
    : (String(body.itemNote ?? body.item_note ?? "").trim() || null);

  if (!planId || !Number.isFinite(plannedQty) || plannedQty < 0 || !requestedMasterPlanNo) {
    return NextResponse.json({ error: "planId, plannedQty and masterPlanNo are required" }, { status: 400 });
  }

  const supabaseAdmin = getSupabaseAdmin();
  const hasManageAccess = await hasPlanningManageAccess(
    request,
    permission.userId,
    permission.isAdmin
  );
  const scope = permission.isAdmin || hasManageAccess
    ? { editableSkuSet: null }
    : await loadPlanningScopeByUser(supabaseAdmin, permission.userId);
  let { data: planRow, error: planError } = await supabaseAdmin
    .from(TABLE_NAME)
    .select("plan_id,sku_code,sku_name,unit,status,confirmed_at,bom_snapshot,formula_code,formula_name,bom_version_id,owner_department_id,master_plan_no,plan_kind,schedule_section_def_id,schedule_section_name,line_dough_set_count,period_start")
    .eq("plan_id", planId)
    .maybeSingle();

  if (planError && isMissingPlanMetadataColumns(planError)) {
    const fallbackPlan = await supabaseAdmin
      .from(TABLE_NAME)
      .select("plan_id,sku_code,sku_name,unit,status,confirmed_at,bom_snapshot,owner_department_id,master_plan_no,line_dough_set_count,period_start")
      .eq("plan_id", planId)
      .maybeSingle();
    planRow = fallbackPlan.data;
    planError = fallbackPlan.error;
  }

  if (planError) {
    return NextResponse.json({ error: planError.message }, { status: 500 });
  }
  if (!planRow) {
    return NextResponse.json({ error: "Plan not found" }, { status: 404 });
  }
  const planMasterPlanNo = normalizeMasterPlanNo(planRow?.master_plan_no);
  if (!planMasterPlanNo || planMasterPlanNo !== requestedMasterPlanNo) {
    return NextResponse.json({
      error: "Plan No mismatch",
      details: {
        requestedMasterPlanNo,
        planMasterPlanNo: planMasterPlanNo || null,
      },
    }, { status: 400 });
  }
  if (editableFromDate && !isPlanningDateEditable(planRow?.period_start, editableFromDate)) {
    return NextResponse.json(
      { error: "ไม่สามารถแก้ไขแผนของวันที่ผ่านมาแล้ว" },
      { status: 400 }
    );
  }
  if (!isConfirmedPlanStatus(planRow.status) || !planRow.confirmed_at) {
    return NextResponse.json({ error: "Only confirmed plans can be edited" }, { status: 400 });
  }

  const nowIso = new Date().toISOString();
  const session = getSessionFromRequest(request, permission.userId);
  let editedBy = null;
  if (session?.userId) {
    const actorResult = await supabaseAdmin
      .from("profiles")
      .select("username")
      .eq("id", session.userId)
      .maybeSingle();
    editedBy = actorResult?.data?.username || session.userId;
  }
  const skuCode = String(planRow.sku_code || "").trim().toUpperCase();
  if (!skuCode) {
    return NextResponse.json({ error: "Missing SKU for plan" }, { status: 400 });
  }
  if (!permission.isAdmin && !hasManageAccess && !scope.editableSkuSet.has(skuCode)) {
    return NextResponse.json({
      error: "Department scope violation",
      details: { skuCodes: [skuCode] },
    }, { status: 403 });
  }
  const ownerDepartmentId = String(planRow?.owner_department_id || "").trim();
  if (!permission.isAdmin && !hasManageAccess && ownerDepartmentId && !scope.editableDepartmentIdSet.has(ownerDepartmentId)) {
    return NextResponse.json({
      error: "Department scope violation",
      details: { departmentIds: [ownerDepartmentId] },
    }, { status: 403 });
  }

  const currentSnapshot = Array.isArray(planRow.bom_snapshot) ? planRow.bom_snapshot[0] : null;
  const preferredFormulaCode =
    planRow.formula_code ||
    currentSnapshot?.formulaCode ||
    null;
  const preferredBomVersionId =
    planRow.bom_version_id ||
    currentSnapshot?.bomVersionId ||
    null;

  const snapshotResult = await buildBomSnapshotForSku(
    supabaseAdmin,
    skuCode,
    plannedQty,
    lineStaffCount,
    lineMachineNo,
    lineDoughSetCount,
    nowIso,
    planRow.sku_name || "",
    planRow.unit || "",
    preferredFormulaCode,
    preferredBomVersionId,
    planRow.plan_kind || null
  );

  if (!snapshotResult.ok) {
    return NextResponse.json({ error: snapshotResult.error || "Unable to build BOM snapshot" }, { status: 500 });
  }

  const newSnapshot = snapshotResult.data.snapshot?.[0];
  const newMaterials = Array.isArray(newSnapshot?.materials) ? newSnapshot.materials : [];
  const currentMaterials = Array.isArray(currentSnapshot?.materials) ? currentSnapshot.materials : [];
  const currentIssueMap = new Map();
  currentMaterials.forEach((mat) => {
    const sku = String(mat?.skuCode || "").trim().toUpperCase();
    const goodsCode = String(mat?.goodsCode || mat?.materialGoodsCode || mat?.skuCode || "").trim().toUpperCase();
    if (!sku || !goodsCode) return;
    currentIssueMap.set(`${sku}::${goodsCode}`, Number(mat?.issueQty ?? 0) || 0);
  });

  const overrideByMaterial = new Map();
  materialOverrides.forEach((row) => {
    const sku = String(row?.skuCode || "").trim().toUpperCase();
    const goodsCode = String(row?.goodsCode || row?.materialGoodsCode || row?.skuCode || "").trim().toUpperCase();
    if (!sku || !goodsCode) return;
    const mode = normalizeOverrideMode(row?.mode);
    const requiredQtyRaw = Number(row?.requiredQty);
    const issueQtyRaw = Number(row?.issueQty);
    const reason = String(row?.reason || "").trim();
    if (mode !== "formula" && !reason) return;
    if (mode === "custom" && (!Number.isFinite(requiredQtyRaw) || requiredQtyRaw < 0 || !Number.isFinite(issueQtyRaw) || issueQtyRaw < 0)) {
      return;
    }
    overrideByMaterial.set(`${sku}::${goodsCode}`, {
      mode,
      reason,
      requiredQty: mode === "skip" ? 0 : (Number.isFinite(requiredQtyRaw) ? requiredQtyRaw : null),
      issueQty: mode === "skip" ? 0 : (Number.isFinite(issueQtyRaw) ? issueQtyRaw : null),
    });
  });

  const overriddenMaterials = newMaterials.map((material) => {
    const sku = String(material?.skuCode || "").trim().toUpperCase();
    const goodsCode = String(material?.goodsCode || material?.materialGoodsCode || material?.skuCode || "").trim().toUpperCase();
    const override = overrideByMaterial.get(`${sku}::${goodsCode}`);
    if (!override || override.mode === "formula") {
      return {
        ...material,
        override: null,
      };
    }
    const baseRequiredQty = Number(material?.requiredQty ?? 0) || 0;
    const baseIssueQty = Number(material?.issueQty ?? Math.ceil(baseRequiredQty)) || 0;
    const requiredQty = override.mode === "custom" ? override.requiredQty : 0;
    const issueQty = override.mode === "custom" ? override.issueQty : 0;
    return {
      ...material,
      requiredQty,
      issueQty,
      override: {
        mode: override.mode,
        reason: override.reason,
        baseRequiredQty,
        baseIssueQty,
        editedAt: nowIso,
        editedBy,
      },
    };
  });

  const materialSkus = overriddenMaterials
    .map((mat) => String(mat?.goodsCode || mat?.materialGoodsCode || mat?.skuCode || "").trim().toUpperCase())
    .filter(Boolean);
  if (materialSkus.length) {
    const params = new URLSearchParams();
    params.set("skus", materialSkus.join(","));
    const stockResult = await fetchGatewayJson("/api/raw-materials-summary-by-skus", params, "production");
    if (!stockResult.ok) {
      return NextResponse.json({ error: "Unable to verify stock" }, { status: 500 });
    }
    clearIssuedCache();
    const deductedStock = await applyStockDeduction(stockResult.data, "summary", request);
    const stockRows = deductedStock?.data ?? [];
    const stockMap = new Map();
    stockRows.forEach((row) => {
      if (!row?.SKU_CODE) return;
      stockMap.set(String(row.SKU_CODE || "").trim().toUpperCase(), Number(row.QTY) || 0);
    });

    const plannedQtyValue = Number(plannedQty) || 0;
    let maxAllowed = Number.POSITIVE_INFINITY;
    const insufficient = [];

    overriddenMaterials.forEach((mat) => {
      const sku = String(mat?.skuCode || "").trim().toUpperCase();
      const goodsCode = String(mat?.goodsCode || mat?.materialGoodsCode || mat?.skuCode || "").trim().toUpperCase();
      if (!sku || !goodsCode) return;
      const available = Number(stockMap.get(goodsCode) ?? 0) || 0;
      const currentIssue = Number(currentIssueMap.get(`${sku}::${goodsCode}`) ?? 0) || 0;
      const availableAdjusted = available + currentIssue;
      const issueNow = Number(mat?.issueQty ?? 0) || 0;

      if (plannedQtyValue > 0) {
        const perUnitRequired = (Number(mat?.requiredQty ?? 0) || 0) / plannedQtyValue;
        if (perUnitRequired > 0 && Number.isFinite(availableAdjusted)) {
          let maxByMaterial = Math.floor(availableAdjusted / perUnitRequired);
          while (maxByMaterial > 0 && Math.ceil(perUnitRequired * maxByMaterial) > availableAdjusted) {
            maxByMaterial -= 1;
          }
          maxAllowed = Math.min(maxAllowed, maxByMaterial);
        }
      }

      if (issueNow > availableAdjusted) {
        insufficient.push({
          sku,
          available: availableAdjusted,
          required: issueNow,
        });
      }
    });

    if (insufficient.length) {
      return NextResponse.json({
        error: "Insufficient stock",
        details: {
          maxQty: Number.isFinite(maxAllowed) ? maxAllowed : null,
          items: insufficient,
        },
      }, { status: 400 });
    }
  }

  if (newSnapshot) {
    newSnapshot.materials = overriddenMaterials;
    newSnapshot.overrideSummary = overriddenMaterials
      .filter((mat) => mat?.override && mat.override.mode !== "formula")
      .map((mat) => ({
        skuCode: String(mat?.skuCode || "").trim().toUpperCase(),
        mode: mat.override.mode,
        reason: mat.override.reason,
        editedAt: mat.override.editedAt,
        editedBy: mat.override.editedBy,
      }));
  }

  const updatePayload = {
    status: "ready",
    planned_qty: plannedQty,
    feasible_batch: plannedQty,
    short_batch: 0,
    backorder_batch: 0,
    earliest_material_eta: null,
    exception_reason: null,
    bom_snapshot: snapshotResult.data.snapshot,
    line_staff_count: lineStaffCount,
    line_machine_no: lineMachineNo,
    line_dough_set_count: lineDoughSetCount,
    shift_id: shiftId,
    shift_code: shiftCode,
    shift_name: shiftName,
    work_start_time: workStartTime,
    work_end_time: workEndTime,
  };
  if (itemNote !== undefined) {
    updatePayload.item_note = itemNote;
  }

  const { error: updateError } = await supabase
    .from(TABLE_NAME)
    .update(updatePayload)
    .eq("plan_id", planId)
    .eq("master_plan_no", requestedMasterPlanNo);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  try {
    await syncOverridesAndEvents(supabaseAdmin, [{
      plan_id: planId,
      status: planRow.status,
      confirmed_at: planRow.confirmed_at,
      bom_snapshot: snapshotResult.data.snapshot,
    }], {
      actorId: session?.userId || null,
      actorName: editedBy,
      source: "report_edit",
      eventAt: nowIso,
    });
  } catch {
    // Best effort: keep primary plan update successful.
  }

  clearIssuedCache();

  return NextResponse.json({ ok: true }, { status: 200 });
}


