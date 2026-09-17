import { requirePermissionKeys } from "@/lib/permissionGuard";
import { getSupabaseAdmin } from "@/lib/adminApi";
import { createAppError, fail, ok } from "@/lib/result";
import { fetchGatewayJson } from "@/lib/gatewayClient";
import { applyStockDeduction } from "@/lib/stockDeduction";
import { explodeBomBatch } from "@/lib/bomExplosionRpc";
import {
  buildTradeCodeUnitMap,
  convertRequirementToStockUnit,
  convertStockToRequirementUnit,
  resolveStockBaseQty,
} from "@/lib/materialStockUnit";
import { PLAN_POLICY_STATUSES } from "@/features/production-planning/services/policyStatus";

const DEFAULT_FORMULA_CODE = "DEFAULT";
const DEFAULT_REQUIRED_UNIT = "unit";
const LEAD_TIME_BUFFER_DAYS = 2;
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
const MATERIAL_AVAILABILITY = {
  AVAILABLE: "available",
  SHORTAGE: "shortage",
  LATE_AVAILABILITY: "late-availability",
};

const normalizeSku = (sku) => {
  if (!sku) return "";
  return String(sku).trim().toUpperCase();
};

const normalizeGoodsCode = (value, fallback = "") => {
  const normalized = normalizeSku(value);
  return normalized || normalizeSku(fallback);
};

const resolveMaterialCode = (item = {}) =>
  normalizeGoodsCode(item?.goodsCode || item?.materialGoodsCode, item?.skuCode || item?.materialSkuCode);

const resolveMaterialKey = (item = {}) => {
  const skuCode = normalizeSku(item?.skuCode || item?.materialSkuCode);
  const goodsCode = resolveMaterialCode(item);
  return `${skuCode}::${goodsCode}`;
};

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeCalculationBasis = (value) => {
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
};

const normalizeHeadcountRoundMode = (value) => {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === HEADCOUNT_ROUND_MODE.UP) return HEADCOUNT_ROUND_MODE.UP;
  if (normalized === HEADCOUNT_ROUND_MODE.DOWN) return HEADCOUNT_ROUND_MODE.DOWN;
  if (normalized === HEADCOUNT_ROUND_MODE.NEAREST) return HEADCOUNT_ROUND_MODE.NEAREST;
  return HEADCOUNT_ROUND_MODE.NONE;
};

const applyRoundMode = (value, mode) => {
  const numeric = toFiniteNumber(value, 0);
  if (numeric <= 0) return 0;
  const resolvedMode = normalizeHeadcountRoundMode(mode);
  if (resolvedMode === HEADCOUNT_ROUND_MODE.UP) return Math.ceil(numeric);
  if (resolvedMode === HEADCOUNT_ROUND_MODE.DOWN) return Math.floor(numeric);
  if (resolvedMode === HEADCOUNT_ROUND_MODE.NEAREST) return Math.round(numeric);
  return numeric;
};

const normalizePlanId = (item, index) => {
  const explicit = String(item?.id || item?.planId || item?.plan_id || "").trim();
  if (explicit) return explicit;
  const sku = normalizeSku(item?.skuCode || item?.sku_code || "SKU");
  const date = String(item?.date || item?.period_start || "DATE").trim();
  return `${sku}-${date}-${index}`;
};

const roundBatch = (value) => {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 1000) / 1000;
};

const parseLeadTimeDays = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value + LEAD_TIME_BUFFER_DAYS;
  }
  const raw = String(value || "").trim();
  if (!raw || raw === "-") return null;
  const match = raw.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  const numeric = Number(match[0]);
  if (!Number.isFinite(numeric)) return null;
  return numeric + LEAD_TIME_BUFFER_DAYS;
};

const toIsoDateFromNow = (days) => {
  if (!Number.isFinite(days) || days <= 0) return null;
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const normalizeIsoDate = (value) => {
  if (!value) return null;
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const parsed = new Date(String(value));
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

const cloneReceiptMap = (receiptMap) => {
  const cloned = new Map();
  receiptMap.forEach((rows, sku) => {
    cloned.set(
      sku,
      (Array.isArray(rows) ? rows : []).map((row) => ({
        etaDate: row.etaDate,
        qty: toFiniteNumber(row.qty, 0),
      }))
    );
  });
  return cloned;
};

const resolveShortageEta = ({ sku, shortageQty, receiptsBySku, minMaxMap }) => {
  const normalizedSku = normalizeSku(sku);
  const requiredQty = toFiniteNumber(shortageQty, 0);
  if (!normalizedSku || requiredQty <= 0) return null;

  const receipts = receiptsBySku.get(normalizedSku) || [];
  let remaining = requiredQty;
  let coverageEta = null;

  for (let i = 0; i < receipts.length; i += 1) {
    const row = receipts[i];
    const available = toFiniteNumber(row?.qty, 0);
    if (available <= 0) continue;
    const consumed = Math.min(available, remaining);
    receipts[i].qty = available - consumed;
    remaining -= consumed;
    if (remaining <= 0) {
      coverageEta = row?.etaDate || null;
      break;
    }
  }

  if (coverageEta) {
    return coverageEta;
  }

  const leadTime = minMaxMap.get(normalizedSku)?.leadTime || "-";
  const leadDays = parseLeadTimeDays(leadTime);
  return leadDays ? toIsoDateFromNow(leadDays) : null;
};

const isMissingFormulaColumns = (error) => {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("formula_code") || message.includes("formula_name");
};

function addMaterialRequirement(map, { skuCode, goodsCode, skuName, requiredQty, uom }) {
  if (!skuCode || !Number.isFinite(requiredQty) || requiredQty <= 0) return;
  const materialGoodsCode = normalizeGoodsCode(goodsCode, skuCode);
  const materialKey = resolveMaterialKey({ skuCode, goodsCode: materialGoodsCode });

  if (map.has(materialKey)) {
    const existing = map.get(materialKey);
    existing.requiredQty += requiredQty;
    if (existing.skuName === "Unknown Material" && skuName !== "Unknown Material") {
      existing.skuName = skuName;
    }
    return;
  }

  map.set(materialKey, {
    skuCode,
    goodsCode: materialGoodsCode,
    skuName: skuName || "Unknown Material",
    requiredQty,
    uom: uom || DEFAULT_REQUIRED_UNIT,
  });
}

const materialRequirementMapToRows = (map) =>
  Array.from((map || new Map()).values())
    .map((item) => ({
      skuCode: item.skuCode,
      goodsCode: item.goodsCode || item.skuCode,
      materialGoodsCode: item.goodsCode || item.skuCode,
      skuName: item.skuName || "",
      requiredQty: toFiniteNumber(item.requiredQty, 0),
      issueQty: Math.ceil(toFiniteNumber(item.requiredQty, 0)),
      requiredUnit: item.uom || DEFAULT_REQUIRED_UNIT,
      unit: item.uom || DEFAULT_REQUIRED_UNIT,
    }))
    .sort((a, b) => resolveMaterialKey(a).localeCompare(resolveMaterialKey(b)));

const buildPlanMaterialRows = (planMetaById, planMaterialRequirements) =>
  Array.from(planMetaById.values())
    .sort((a, b) => a.sequence - b.sequence)
    .map((planMeta) => ({
      planId: planMeta.planId,
      skuCode: planMeta.skuCode,
      skuName: planMeta.skuName,
      materials: materialRequirementMapToRows(planMaterialRequirements.get(planMeta.planId)),
    }));

async function fetchApprovedBomsBySkus(supabaseAdmin, skuList) {
  const normalizedSkus = Array.from(new Set((skuList || []).map(normalizeSku).filter(Boolean)));
  if (normalizedSkus.length === 0) {
    return { data: [], error: null };
  }

  const baseBomQuery = supabaseAdmin
    .from("production_boms")
    .select(`
      id,
      sku_code,
      status,
      production_bom_versions!inner (
        id,
        version_no,
        status,
        formula_code,
          formula_name,
          base_batch,
          base_output_boxes,
          production_bom_items (
          material_sku_code,
          qty,
          uom_name,
          products_cache (
            sku_name,
            iccat_code
          )
        )
      )
    `)
    .in("sku_code", normalizedSkus)
    .eq("production_bom_versions.status", "approved")
    .order("version_no", { foreignTable: "production_bom_versions", ascending: false });

  let { data, error } = await baseBomQuery;
  if (error && isMissingFormulaColumns(error)) {
    const fallbackQuery = supabaseAdmin
      .from("production_boms")
      .select(`
        id,
        sku_code,
        status,
        production_bom_versions!inner (
          id,
          version_no,
          status,
          base_batch,
          base_output_boxes,
          production_bom_items (
            material_sku_code,
            qty,
            uom_name,
            products_cache (
              sku_name,
              iccat_code
            )
          )
        )
      `)
      .in("sku_code", normalizedSkus)
      .eq("production_bom_versions.status", "approved")
      .order("version_no", { foreignTable: "production_bom_versions", ascending: false });
    const fallbackResult = await fallbackQuery;
    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  return { data: data ?? [], error };
}

async function fetchBomItemBasisByVersions(supabaseAdmin, versionIds = []) {
  const ids = Array.from(new Set((versionIds || []).map((id) => String(id || "").trim()).filter(Boolean)));
  if (!ids.length) {
    return { data: [], error: null };
  }
  let { data, error } = await supabaseAdmin
    .from("production_bom_items")
    .select("version_id,material_sku_code,material_goods_code,qty,calculation_basis,headcount_base,headcount_round_mode,machine_base,machine_round_mode,dough_set_base,dough_set_round_mode")
    .in("version_id", ids);
  if (error) {
    const fallback = await supabaseAdmin
      .from("production_bom_items")
      .select("version_id,material_sku_code,material_goods_code,qty")
      .in("version_id", ids);
    data = (fallback.data || []).map((row) => ({
      ...row,
      calculation_basis: CALCULATION_BASIS.JOB_QTY,
      headcount_base: 1,
      headcount_round_mode: HEADCOUNT_ROUND_MODE.NONE,
      machine_base: 1,
      machine_round_mode: HEADCOUNT_ROUND_MODE.NONE,
      dough_set_base: 1,
      dough_set_round_mode: HEADCOUNT_ROUND_MODE.NONE,
    }));
    error = fallback.error;
  }
  return { data: data || [], error };
}

async function fetchTradeCodeUnitRows(materialCodes = []) {
  const normalizedCodes = Array.from(new Set((materialCodes || []).map(normalizeSku).filter(Boolean)));
  if (!normalizedCodes.length) {
    return [];
  }

  const chunkSize = 200;
  const chunks = [];
  for (let i = 0; i < normalizedCodes.length; i += chunkSize) {
    chunks.push(normalizedCodes.slice(i, i + chunkSize));
  }

  const results = await Promise.all(
    chunks.map((chunk) => {
      const params = new URLSearchParams();
      params.set("goodsCodes", chunk.join(","));
      params.set("pageSize", String(Math.max(100, chunk.length)));
      return fetchGatewayJson("/api/trade-codes", params, "production");
    })
  );

  const rows = [];
  results.forEach((result) => {
    if (result.ok) {
      rows.push(...(result.data?.data ?? []));
    }
  });
  return rows;
}

async function calculateMaterialsCore({ plannedItems, stockData = [], minMaxData = [] }, request) {
  const supabaseAdmin = getSupabaseAdmin();
  try {

    if (!plannedItems || !Array.isArray(plannedItems) || plannedItems.length === 0) {
      return fail(createAppError("validation", "No planned items provided"), { status: 400 });
    }

    const materialRequirements = new Map();
    const planMaterialRequirements = new Map();
    const planMetaById = new Map();
    const fgDemandBySku = new Map();
    const wipDemandBySku = new Map();
    const wipDemandByPlanSku = new Map();
    const bumpDemand = (map, skuCode, qty, meta = {}) => {
      const sku = normalizeSku(skuCode);
      const amount = Number(qty) || 0;
      if (!sku || amount <= 0) return;
      const existing = map.get(sku);
      if (existing) {
        existing.qty += amount;
        if (!existing.skuName && meta.skuName) {
          existing.skuName = meta.skuName;
        }
        return;
      }
      map.set(sku, {
        skuCode: sku,
        skuName: meta.skuName || "",
        qty: amount,
        uom: meta.uom || DEFAULT_REQUIRED_UNIT,
      });
    };
    const explosionWarnings = [];

    plannedItems.forEach((item, index) => {
      const planId = normalizePlanId(item, index);
      const quantity = toFiniteNumber(item?.quantity, 0);
      const skuCode = normalizeSku(item?.skuCode);
      planMetaById.set(planId, {
        planId,
        sequence: index,
        skuCode,
        skuName: String(item?.skuName || ""),
        plannedBatch: quantity > 0 ? quantity : 0,
        lineStaffCount: toFiniteNumber(item?.lineStaffCount ?? item?.line_staff_count, 0),
        lineMachineNo: toFiniteNumber(item?.lineMachineNo ?? item?.line_machine_no, 0),
        lineDoughSetCount: toFiniteNumber(item?.lineDoughSetCount ?? item?.line_dough_set_count, 0),
        bomVersionId: item?.bomVersionId || item?.bom_version_id || null,
        periodStart: String(item?.date || item?.period_start || ""),
      });
      planMaterialRequirements.set(planId, new Map());
      if (skuCode && quantity > 0) {
        bumpDemand(fgDemandBySku, skuCode, quantity, {
          skuName: String(item?.skuName || ""),
          uom: "batch",
        });
      }
    });

    const explodedRows = await explodeBomBatch(
      supabaseAdmin,
      plannedItems.map((plan, index) => ({
        planId: normalizePlanId(plan, index),
        skuCode: plan?.skuCode,
        plannedQty: Number(plan?.quantity) || 0,
        formulaCode: plan?.formulaCode || plan?.formula_code || DEFAULT_FORMULA_CODE,
        bomVersionId: plan?.bomVersionId || plan?.bom_version_id || null,
      })),
      12
    );

    const bomVersionIds = Array.from(
      new Set(
        plannedItems
          .map((item) => String(item?.bomVersionId || item?.bom_version_id || "").trim())
          .filter(Boolean)
      )
    );
    const basisResult = await fetchBomItemBasisByVersions(supabaseAdmin, bomVersionIds);
    if (basisResult.error) {
      return fail(createAppError("database", "Failed to load BOM calculation basis"), { status: 500 });
    }
    const basisDeltaMap = new Map();
    (basisResult.data || []).forEach((row) => {
      const basis = normalizeCalculationBasis(row?.calculation_basis);
      if (
        basis !== CALCULATION_BASIS.HEADCOUNT
        && basis !== CALCULATION_BASIS.MACHINE_COUNT
        && basis !== CALCULATION_BASIS.DOUGH_SET_COUNT
      ) return;
      const versionId = String(row?.version_id || "").trim();
      const materialSku = normalizeSku(row?.material_sku_code);
      if (!versionId || !materialSku) return;
      planMetaById.forEach((meta) => {
        if (String(meta?.bomVersionId || "").trim() !== versionId) return;
        const plannedQty = toFiniteNumber(meta.plannedBatch, 0);
        if (plannedQty <= 0) return;
        const perBaseQty = toFiniteNumber(row?.qty, 0);
        const byJobQty = plannedQty * perBaseQty;
        let byBasis = byJobQty;
        if (basis === CALCULATION_BASIS.HEADCOUNT) {
          const people = toFiniteNumber(meta.lineStaffCount, 0);
          const headcountBase = Math.max(0.0001, toFiniteNumber(row?.headcount_base, 1));
          const byHeadcountRaw = (people / headcountBase) * perBaseQty;
          byBasis = applyRoundMode(byHeadcountRaw, row?.headcount_round_mode);
        } else if (basis === CALCULATION_BASIS.MACHINE_COUNT) {
          const machines = toFiniteNumber(meta.lineMachineNo, 0);
          const machineBase = Math.max(0.0001, toFiniteNumber(row?.machine_base, 1));
          const byMachineRaw = (machines / machineBase) * perBaseQty;
          byBasis = applyRoundMode(byMachineRaw, row?.machine_round_mode);
        } else if (basis === CALCULATION_BASIS.DOUGH_SET_COUNT) {
          const doughSets = toFiniteNumber(meta.lineDoughSetCount, 0);
          const doughSetBase = Math.max(0.0001, toFiniteNumber(row?.dough_set_base, 1));
          const byDoughSetRaw = (doughSets / doughSetBase) * perBaseQty;
          byBasis = applyRoundMode(byDoughSetRaw, row?.dough_set_round_mode);
        }
        const delta = byBasis - byJobQty;
        if (!Number.isFinite(delta) || Math.abs(delta) < 0.0000001) return;
        const goodsCode = normalizeGoodsCode(row?.material_goods_code, materialSku);
        const key = `${meta.planId}::${materialSku}::${goodsCode}`;
        basisDeltaMap.set(key, (basisDeltaMap.get(key) || 0) + delta);
      });
    });

    explodedRows.forEach((row) => {
      const materialSku = normalizeSku(row.materialSkuCode);
      const materialGoodsCode = normalizeGoodsCode(row.materialGoodsCode, materialSku);
      const planId = String(row.planId || "").trim();
      const deltaKey = `${planId}::${materialSku}::${materialGoodsCode}`;
      const delta = toFiniteNumber(basisDeltaMap.get(deltaKey), 0);
      if (basisDeltaMap.has(deltaKey)) {
        basisDeltaMap.delete(deltaKey);
      }
      const requiredQty = toFiniteNumber(row.requiredQty, 0) + delta;
      if (!materialSku) return;

      if (row.hasCycle) {
        explosionWarnings.push({
          type: "cycle",
          skuCode: materialSku,
          planId,
          message: `Cycle detected in BOM expansion for ${materialSku}`,
        });
      }
      if (requiredQty <= 0) return;

      if (row.itemType === "WIP") {
        bumpDemand(wipDemandBySku, materialSku, requiredQty, {
          skuName: row.materialName,
          uom: row.uomName || DEFAULT_REQUIRED_UNIT,
        });
        const wipPlanKey = `${planId}::${materialSku}`;
        const existingByPlan = wipDemandByPlanSku.get(wipPlanKey);
        if (existingByPlan) {
          existingByPlan.requiredQty += requiredQty;
        } else {
          wipDemandByPlanSku.set(wipPlanKey, {
            planId,
            skuCode: materialSku,
            skuName: row.materialName,
            requiredQty,
            uom: row.uomName || DEFAULT_REQUIRED_UNIT,
          });
        }
        return;
      }

      addMaterialRequirement(materialRequirements, {
        skuCode: materialSku,
        goodsCode: materialGoodsCode,
        skuName: row.materialName,
        requiredQty,
        uom: row.uomName || DEFAULT_REQUIRED_UNIT,
      });
      const targetPlanMap = planMaterialRequirements.get(planId);
      if (targetPlanMap) {
        addMaterialRequirement(targetPlanMap, {
          skuCode: materialSku,
          goodsCode: materialGoodsCode,
          skuName: row.materialName,
          requiredQty,
          uom: row.uomName || DEFAULT_REQUIRED_UNIT,
        });
      }
    });

    basisDeltaMap.forEach((delta, key) => {
      const amount = toFiniteNumber(delta, 0);
      if (amount <= 0) return;
      const [planId = "", materialSku = "", materialGoodsCode = ""] = String(key).split("::");
      const materialKey = resolveMaterialKey({
        skuCode: materialSku,
        goodsCode: materialGoodsCode || materialSku,
      });
      const existing = materialRequirements.get(materialKey);
      if (existing) {
        existing.requiredQty += amount;
      } else {
        materialRequirements.set(materialKey, {
          skuCode: materialSku,
          goodsCode: materialGoodsCode || materialSku,
          skuName: materialSku,
          requiredQty: amount,
          uom: DEFAULT_REQUIRED_UNIT,
        });
      }
      const targetPlanMap = planMaterialRequirements.get(planId);
      if (!targetPlanMap) return;
      const planExisting = targetPlanMap.get(materialKey);
      if (planExisting) {
        planExisting.requiredQty += amount;
      } else {
        targetPlanMap.set(materialKey, {
          skuCode: materialSku,
          goodsCode: materialGoodsCode || materialSku,
          skuName: materialSku,
          requiredQty: amount,
          uom: DEFAULT_REQUIRED_UNIT,
        });
      }
    });

    if (wipDemandBySku.size > 0) {
      const wipBomResult = await fetchApprovedBomsBySkus(
        supabaseAdmin,
        Array.from(wipDemandBySku.keys())
      );
      if (wipBomResult.error) {
        console.error("WIP BOM Fetch Error:", wipBomResult.error);
        return fail(createAppError("database", "Failed to verify WIP BOM coverage"), { status: 500 });
      }

      const wipWithBom = new Set();
      (wipBomResult.data || []).forEach((bom) => {
        const sku = normalizeSku(bom?.sku_code);
        const versions = Array.isArray(bom?.production_bom_versions)
          ? bom.production_bom_versions
          : [];
        if (sku && versions.length > 0) {
          wipWithBom.add(sku);
        }
      });

      const warnedUnresolvedWip = new Set();
      wipDemandByPlanSku.forEach((entry) => {
        if (wipWithBom.has(entry.skuCode)) return;
        addMaterialRequirement(materialRequirements, {
          skuCode: entry.skuCode,
          goodsCode: entry.skuCode,
          skuName: entry.skuName,
          requiredQty: entry.requiredQty,
          uom: entry.uom,
        });
        const targetPlanMap = planMaterialRequirements.get(entry.planId);
        if (targetPlanMap) {
          addMaterialRequirement(targetPlanMap, {
            skuCode: entry.skuCode,
            goodsCode: entry.skuCode,
            skuName: entry.skuName,
            requiredQty: entry.requiredQty,
            uom: entry.uom,
          });
        }
        if (!warnedUnresolvedWip.has(entry.skuCode)) {
          warnedUnresolvedWip.add(entry.skuCode);
          explosionWarnings.push({
            type: "missing_wip_bom",
            skuCode: entry.skuCode,
            message: `WIP ${entry.skuCode} has no approved BOM; treated as direct material requirement`,
          });
        }
      });
    }

    if (materialRequirements.size === 0) {
      const planSummaries = plannedItems.map((item, index) => {
        const planId = normalizePlanId(item, index);
        const plannedBatch = toFiniteNumber(item?.quantity, 0);
        return {
          planId,
          skuCode: normalizeSku(item?.skuCode),
          skuName: String(item?.skuName || ""),
          plannedBatch,
          feasibleBatch: plannedBatch,
          shortBatch: 0,
          backorderBatch: 0,
          earliestMaterialEta: null,
          policyStatus: plannedBatch > 0 ? PLAN_POLICY_STATUSES.READY : PLAN_POLICY_STATUSES.BLOCKED,
          exceptionReason: plannedBatch > 0 ? null : "Planned Batch must be greater than 0",
        };
      });
      return ok({
        items: [],
        fgDemand: [],
        wipDemand: [],
        rawRequisition: [],
        planMaterials: buildPlanMaterialRows(planMetaById, planMaterialRequirements),
        planSummaries,
        planSummaryByPlanId: Object.fromEntries(planSummaries.map((row) => [String(row.planId), row])),
        warnings: explosionWarnings,
      });
    }

    const materialCodes = Array.from(materialRequirements.values())
      .flatMap((item) => [item.skuCode, resolveMaterialCode(item)])
      .filter(Boolean);
    const tradeCodeUnitRows = await fetchTradeCodeUnitRows(materialCodes);
    const tradeCodeUnitMap = buildTradeCodeUnitMap(tradeCodeUnitRows);
    const materialStockMetaByKey = new Map();
    materialRequirements.forEach((req) => {
      materialStockMetaByKey.set(resolveMaterialKey(req), convertRequirementToStockUnit(req, tradeCodeUnitMap));
    });
    const materialSkus = Array.from(
      new Set(Array.from(materialStockMetaByKey.values()).map((meta) => meta.stockSkuCode).filter(Boolean))
    );
    const loadStockAndMinMax = async () => {
      if (!materialSkus.length) {
        return { stockRows: [], minMaxRows: [], poRows: [] };
      }
      const chunkSize = 200;
      const chunks = [];
      for (let i = 0; i < materialSkus.length; i += chunkSize) {
        chunks.push(materialSkus.slice(i, i + chunkSize));
      }

      const requests = chunks.map((chunk) => {
        const params = new URLSearchParams();
        params.set("skus", chunk.join(","));
        return Promise.all([
          fetchGatewayJson("/api/raw-materials-summary-by-skus", params, "production"),
          fetchGatewayJson("/api/sku-min-max-by-sku", params, "production"),
          fetchGatewayJson("/api/open-po-eta-by-sku", params, "production"),
        ]);
      });

      const results = await Promise.all(requests);
      const stockRows = [];
      const minMaxRows = [];
      const poRows = [];

      results.forEach(([stockResult, minMaxResult, poResult]) => {
        if (stockResult.ok) {
          stockRows.push(...(stockResult.data?.data ?? []));
        }
        if (minMaxResult.ok) {
          minMaxRows.push(...(minMaxResult.data?.data ?? []));
        }
        if (poResult.ok) {
          poRows.push(...(poResult.data?.data ?? []));
        }
      });

      return { stockRows, minMaxRows, poRows };
    };

    const effectiveStockData = Array.isArray(stockData) && stockData.length ? stockData : null;
    const effectiveMinMaxData = Array.isArray(minMaxData) && minMaxData.length ? minMaxData : null;
    const { stockRows, minMaxRows, poRows } = (!effectiveStockData || !effectiveMinMaxData)
      ? await loadStockAndMinMax()
      : { stockRows: effectiveStockData, minMaxRows: effectiveMinMaxData, poRows: [] };

    const deductionResult = await applyStockDeduction(
      { data: stockRows },
      "summary",
      request
    );
    const finalStockRows = deductionResult.data || [];

    const stockMap = new Map();
    finalStockRows.forEach((item) => {
      const normalized = normalizeSku(item.SKU_CODE);
      stockMap.set(normalized, {
        qty: resolveStockBaseQty(item),
        displayQty: Number(item.QTY) || 0,
        unit: item.UTQ_K_NAME || item.UTQ_NAME,
        displayUnit: item.UTQ_NAME,
        name: item.SKU_NAME,
      });
    });

    const minMaxMap = new Map();
    minMaxRows.forEach((item) => {
      if (item.SKU_CODE) {
        minMaxMap.set(normalizeSku(item.SKU_CODE), {
          leadTime: item.SKU_LEAD_TIME || "-",
        });
      }
    });

    const poReceiptMap = new Map();
    (Array.isArray(poRows) ? poRows : []).forEach((row) => {
      const sku = normalizeSku(row?.SKU_CODE);
      const etaDate = normalizeIsoDate(row?.ETA_DATE);
      const qty = toFiniteNumber(row?.OPEN_QTY, 0);
      if (!sku || !etaDate || qty <= 0) return;
      if (!poReceiptMap.has(sku)) {
        poReceiptMap.set(sku, []);
      }
      poReceiptMap.get(sku).push({ etaDate, qty });
    });
    poReceiptMap.forEach((rows, sku) => {
      const mergedByDate = new Map();
      (rows || []).forEach((row) => {
        const key = row.etaDate;
        mergedByDate.set(key, toFiniteNumber(mergedByDate.get(key), 0) + toFiniteNumber(row.qty, 0));
      });
      poReceiptMap.set(
        sku,
        Array.from(mergedByDate.entries())
          .map(([etaDate, qty]) => ({ etaDate, qty }))
          .sort((a, b) => a.etaDate.localeCompare(b.etaDate))
      );
    });

    const materialReceiptUsage = cloneReceiptMap(poReceiptMap);
    const stockDemandBaseMap = new Map();
    materialRequirements.forEach((req) => {
      const meta = materialStockMetaByKey.get(resolveMaterialKey(req)) || convertRequirementToStockUnit(req, tradeCodeUnitMap);
      if (!meta.stockSkuCode) return;
      stockDemandBaseMap.set(
        meta.stockSkuCode,
        toFiniteNumber(stockDemandBaseMap.get(meta.stockSkuCode), 0) + toFiniteNumber(meta.requiredBaseQty, 0)
      );
    });

    const resultItems = [];
    materialRequirements.forEach((req) => {
      const materialCode = resolveMaterialCode(req);
      const meta = materialStockMetaByKey.get(resolveMaterialKey(req)) || convertRequirementToStockUnit(req, tradeCodeUnitMap);
      const stockSkuCode = meta.stockSkuCode || materialCode;
      const stockInfo = stockMap.get(stockSkuCode);
      const combinedInfo = stockInfo || { qty: 0, unit: req.uom, name: req.skuName };
      const minMaxInfo = minMaxMap.get(stockSkuCode) || { leadTime: "-" };
      const requiredQty = toFiniteNumber(req.requiredQty, 0);
      const requiredBaseQty = toFiniteNumber(meta.requiredBaseQty, requiredQty);
      const stockBaseQty = toFiniteNumber(combinedInfo.qty, 0);
      const totalRequiredBaseQty = toFiniteNumber(stockDemandBaseMap.get(stockSkuCode), requiredBaseQty);
      const stockQty = convertStockToRequirementUnit(stockBaseQty, req, tradeCodeUnitMap);
      const isSufficient = stockBaseQty >= totalRequiredBaseQty;
      const shortageBaseQty = Math.max(0, totalRequiredBaseQty - stockBaseQty);
      const shortageQty = convertStockToRequirementUnit(shortageBaseQty, req, tradeCodeUnitMap);
      const etaDate = !isSufficient
        ? resolveShortageEta({
          sku: stockSkuCode,
          shortageQty: shortageBaseQty,
          receiptsBySku: materialReceiptUsage,
          minMaxMap,
        })
        : null;
      const materialStatus = isSufficient
        ? MATERIAL_AVAILABILITY.AVAILABLE
        : etaDate
          ? MATERIAL_AVAILABILITY.LATE_AVAILABILITY
          : MATERIAL_AVAILABILITY.SHORTAGE;

      resultItems.push({
        skuCode: req.skuCode,
        goodsCode: req.goodsCode || req.skuCode,
        stockSkuCode,
        skuName: combinedInfo.name !== "Unknown Material" ? combinedInfo.name : req.skuName,
        requiredQty,
        requiredBaseQty,
        requiredUnit: req.uom,
        stockQty,
        stockBaseQty,
        stockUnit: req.uom,
        baseUnit: combinedInfo.unit || meta.baseUnit || req.uom,
        conversionFactor: meta.factorToBase || 1,
        leadTime: minMaxInfo.leadTime,
        status: materialStatus,
        legacyStatus: isSufficient ? "Sufficient" : "Insufficient",
        materialStatus,
        etaDate,
        diff: convertStockToRequirementUnit(stockBaseQty - totalRequiredBaseQty, req, tradeCodeUnitMap),
      });
    });

    resultItems.sort((a, b) =>
      resolveMaterialCode(a).localeCompare(resolveMaterialCode(b)) || a.skuCode.localeCompare(b.skuCode)
    );

    const remainingStockBySku = new Map();
    stockMap.forEach((value, sku) => {
      remainingStockBySku.set(sku, toFiniteNumber(value?.qty, 0));
    });
    const remainingPoReceiptsBySku = cloneReceiptMap(poReceiptMap);

    const planSummaries = Array.from(planMetaById.values())
      .sort((a, b) => {
        const dateCompare = String(a.periodStart || "").localeCompare(String(b.periodStart || ""));
        if (dateCompare !== 0) return dateCompare;
        return a.sequence - b.sequence;
      })
      .map((planMeta) => {
        const perPlanReqMap = planMaterialRequirements.get(planMeta.planId) || new Map();
        const plannedBatch = toFiniteNumber(planMeta.plannedBatch, 0);

        if (plannedBatch <= 0) {
          return {
            planId: planMeta.planId,
            skuCode: planMeta.skuCode,
            skuName: planMeta.skuName,
            plannedBatch,
            feasibleBatch: 0,
            shortBatch: 0,
            backorderBatch: 0,
            earliestMaterialEta: null,
            policyStatus: PLAN_POLICY_STATUSES.BLOCKED,
            exceptionReason: "Planned Batch must be greater than 0",
          };
        }

        if (perPlanReqMap.size === 0) {
          return {
            planId: planMeta.planId,
            skuCode: planMeta.skuCode,
            skuName: planMeta.skuName,
            plannedBatch,
            feasibleBatch: plannedBatch,
            shortBatch: 0,
            backorderBatch: 0,
            earliestMaterialEta: null,
            policyStatus: PLAN_POLICY_STATUSES.READY,
            exceptionReason: null,
          };
        }

        let feasibleRatio = 1;
        const shortages = [];
        let earliestMaterialEta = null;
        const perPlanStockRequirementMap = new Map();

        perPlanReqMap.forEach((req) => {
          const meta = convertRequirementToStockUnit(req, tradeCodeUnitMap);
          const stockSkuCode = meta.stockSkuCode || resolveMaterialCode(req);
          const requiredBaseQty = toFiniteNumber(meta.requiredBaseQty, 0);
          if (requiredBaseQty <= 0) return;
          const current = perPlanStockRequirementMap.get(stockSkuCode) || {
            stockSkuCode,
            requiredBaseQty: 0,
            requirements: [],
          };
          current.requiredBaseQty += requiredBaseQty;
          current.requirements.push({ req, requiredBaseQty });
          perPlanStockRequirementMap.set(stockSkuCode, current);
        });

        perPlanStockRequirementMap.forEach((entry) => {
          const availableQty = toFiniteNumber(remainingStockBySku.get(entry.stockSkuCode), 0);
          const ratio = Math.max(0, Math.min(1, availableQty / entry.requiredBaseQty));
          feasibleRatio = Math.min(feasibleRatio, ratio);

          if (availableQty < entry.requiredBaseQty) {
            const firstReq = entry.requirements[0]?.req || {};
            const leadTime = minMaxMap.get(entry.stockSkuCode)?.leadTime || "-";
            const shortageBaseQty = entry.requiredBaseQty - availableQty;
            const shortageQty = convertStockToRequirementUnit(shortageBaseQty, firstReq, tradeCodeUnitMap);
            const eta = resolveShortageEta({
              sku: entry.stockSkuCode,
              shortageQty: shortageBaseQty,
              receiptsBySku: remainingPoReceiptsBySku,
              minMaxMap,
            });
            if (eta && (!earliestMaterialEta || eta < earliestMaterialEta)) {
              earliestMaterialEta = eta;
            }
            shortages.push({
              skuCode: firstReq.skuCode || entry.stockSkuCode,
              goodsCode: firstReq.goodsCode || firstReq.skuCode || entry.stockSkuCode,
              shortageQty,
              leadTime,
              eta,
            });
          }
        });

        const feasibleBatch = feasibleRatio >= 0.999999
          ? roundBatch(plannedBatch)
          : roundBatch(Math.max(0, plannedBatch * feasibleRatio));
        const shortBatch = roundBatch(Math.max(0, plannedBatch - feasibleBatch));
        const backorderBatch = shortBatch;

        let policyStatus = PLAN_POLICY_STATUSES.READY;
        if (shortBatch > 0 && feasibleBatch > 0) {
          policyStatus = PLAN_POLICY_STATUSES.PARTIAL;
        } else if (shortBatch > 0 && feasibleBatch <= 0) {
          policyStatus = earliestMaterialEta
            ? PLAN_POLICY_STATUSES.BACKORDER
            : PLAN_POLICY_STATUSES.BLOCKED;
        }

        const usageRatio = plannedBatch > 0 ? Math.min(1, feasibleBatch / plannedBatch) : 0;
        perPlanStockRequirementMap.forEach((entry) => {
          const consumedQty = entry.requiredBaseQty * usageRatio;
          const current = toFiniteNumber(remainingStockBySku.get(entry.stockSkuCode), 0);
          remainingStockBySku.set(entry.stockSkuCode, Math.max(0, current - consumedQty));
        });

        const exceptionReason = shortages.length
          ? `Shortage: ${shortages
            .slice(0, 2)
            .map((row) => `${row.goodsCode || row.skuCode} ${roundBatch(row.shortageQty)}`)
            .join(", ")}`
          : null;

        return {
          planId: planMeta.planId,
          skuCode: planMeta.skuCode,
          skuName: planMeta.skuName,
          plannedBatch,
          feasibleBatch,
          shortBatch,
          backorderBatch,
          earliestMaterialEta,
          policyStatus,
          exceptionReason,
        };
      });

    const planSummaryByPlanId = new Map(planSummaries.map((row) => [String(row.planId), row]));
    const toSortedDemandRows = (map) =>
      Array.from(map.values())
        .map((item) => ({
          skuCode: item.skuCode,
          skuName: item.skuName || "",
          qty: item.qty,
          uom: item.uom || DEFAULT_REQUIRED_UNIT,
        }))
        .sort((a, b) => a.skuCode.localeCompare(b.skuCode));

    return ok({
      items: resultItems,
      fgDemand: toSortedDemandRows(fgDemandBySku),
      wipDemand: toSortedDemandRows(wipDemandBySku),
      rawRequisition: resultItems.map((item) => ({
        skuCode: item.skuCode,
        goodsCode: item.goodsCode || item.skuCode,
        skuName: item.skuName,
        requiredQty: item.requiredQty,
        requiredUnit: item.requiredUnit,
        stockQty: item.stockQty,
        stockUnit: item.stockUnit,
        status: item.materialStatus,
        etaDate: item.etaDate,
        diff: item.diff,
      })),
      planMaterials: buildPlanMaterialRows(planMetaById, planMaterialRequirements),
      planSummaries,
      planSummaryByPlanId: Object.fromEntries(planSummaryByPlanId),
      warnings: explosionWarnings,
    });
  } catch (error) {
    console.error("Calculation Error:", error);
    return fail(createAppError("server", "Calculation failed", error.message), { status: 500 });
  }
}

export async function calculateMaterialsFromData(payload, request) {
  const body = payload && typeof payload === "object" ? payload : {};
  const { plannedItems, stockData = [], minMaxData = [] } = body;
  return calculateMaterialsCore({ plannedItems, stockData, minMaxData }, request);
}

export async function calculateMaterials(request) {
  await requirePermissionKeys(request, [
    "production-line-planning-view",
    "production-line-planning-manage",
    "plan.calculate_own_dept",
    "plan.view_all",
  ]);

  try {
    const body = await request.json();
    return calculateMaterialsFromData(body, request);
  } catch (error) {
    console.error("Calculation Error:", error);
    return fail(createAppError("server", "Calculation failed", error.message), { status: 500 });
  }
}


