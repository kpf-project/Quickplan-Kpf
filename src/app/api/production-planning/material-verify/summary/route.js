import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeMasterPlanNo } from "@/lib/planNo";
import { explodeBomBatch } from "@/lib/bomExplosionRpc";
import { fetchGatewayJson } from "@/lib/gatewayClient";
import {
  buildTradeCodeUnitMap,
  convertRequirementToStockUnit,
  resolveStockBaseQty,
} from "@/lib/materialStockUnit";
import {
  formatReadableLotQuantity,
  getLotQuantityBreakdown,
} from "@/lib/inventoryUnitDisplay";
import { loadMainPlanRowsForMasterPlan } from "@/lib/wipPlanning";

export const dynamic = "force-dynamic";

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
  if (normalized === CALCULATION_BASIS.HEADCOUNT) return CALCULATION_BASIS.HEADCOUNT;
  if (normalized === CALCULATION_BASIS.MACHINE_COUNT) return CALCULATION_BASIS.MACHINE_COUNT;
  if (normalized === CALCULATION_BASIS.DOUGH_SET_COUNT) return CALCULATION_BASIS.DOUGH_SET_COUNT;
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

const normalizeSku = (value) => String(value || "").trim().toUpperCase();

const normalizeGoodsCode = (value, fallback = "") => {
  const normalized = normalizeSku(value);
  return normalized || normalizeSku(fallback);
};

const resolveTraceGoodsCode = (row = {}) =>
  normalizeGoodsCode(
    row.child_material_goods_code || row.material_goods_code || row.child_goods_code,
    row.child_sku_code
  );

async function fetchTradeCodeUnitRows(materialCodes = []) {
  const codes = Array.from(
    new Set((Array.isArray(materialCodes) ? materialCodes : []).map(normalizeSku).filter(Boolean))
  );
  if (codes.length === 0) return [];

  const params = new URLSearchParams();
  params.set("goodsCodes", codes.join(","));
  params.set("pageSize", String(Math.max(codes.length, 100)));

  const result = await fetchGatewayJson("/api/trade-codes", params, "production");
  if (!result?.ok || !Array.isArray(result?.data?.data)) {
    return [];
  }
  return result.data.data;
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

export async function GET(request) {
  try {
    const { userId } = await requirePermissionKeys(request, ["plan.verify_materials"]);
    const { searchParams } = new URL(request.url);
    const masterPlanNo = normalizeMasterPlanNo(searchParams.get("masterPlanNo"));

    if (!masterPlanNo) {
      return NextResponse.json({ error: "masterPlanNo is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    // 1. Fetch the master plan metadata
    const { data: masterPlan, error: masterPlanError } = await supabaseAdmin
      .from("production_master_plans")
      .select("id, status, reject_reason, verified_at, verified_by, created_by, updated_by")
      .eq("master_plan_no", masterPlanNo)
      .maybeSingle();

    if (masterPlanError) {
      return NextResponse.json({ error: masterPlanError.message }, { status: 500 });
    }

    // 2. Fetch all plan items associated with this master plan (supports legacy production_plan_status and new schedule tables)
    const planRows = await loadMainPlanRowsForMasterPlan(supabaseAdmin, masterPlanNo);

    if (!planRows || planRows.length === 0) {
      return NextResponse.json({
        masterPlanNo,
        status: masterPlan?.status || "draft",
        rejectReason: masterPlan?.reject_reason || null,
        consolidated: [],
        breakdown: [],
        message: "No scheduled items found in this plan group."
      });
    }

    // 3. Fetch all production departments to resolve names
    const { data: depts, error: deptsError } = await supabaseAdmin
      .from("production_departments")
      .select("id, name, code");

    if (deptsError) {
      return NextResponse.json({ error: deptsError.message }, { status: 500 });
    }
    const deptMap = new Map(depts?.map((d) => [d.id, d]) || []);

    // 4. Run BOM Trace Explosion on the plan items
    const bomItems = planRows.map((row) => ({
      plan_id: row.plan_id,
      sku_code: row.sku_code,
      planned_qty: Number(row.planned_qty || 0),
      formula_code: row.formula_code,
      bom_version_id: row.bom_version_id,
    })).filter((item) => item.sku_code && item.planned_qty > 0);

    let traceRows = [];
    if (bomItems.length > 0) {
      const { data, error: traceError } = await supabaseAdmin.rpc("explode_bom_trace_batch", {
        p_plan_items: bomItems,
        p_max_depth: 12,
      });
      if (traceError) {
        return NextResponse.json({ error: traceError.message }, { status: 500 });
      }
      traceRows = data || [];
    }

    // --- Perform Headcount / Machine / Dough Set Count Adjustments ---
    const fgVersionIds = Array.from(new Set([
      ...bomItems.map((item) => item.bom_version_id).filter(Boolean),
      ...traceRows.filter((row) => row.depth === 1).map((row) => row.bom_version_id).filter(Boolean),
    ]));
    let basisItems = [];
    let fgVersions = [];
    if (fgVersionIds.length > 0) {
      const [versionsResult, itemsResult] = await Promise.all([
        supabaseAdmin
          .from("production_bom_versions")
          .select("id,base_batch,base_output_boxes,wip_qty_input_mode")
          .in("id", fgVersionIds),
        supabaseAdmin
          .from("production_bom_items")
          .select("version_id,material_sku_code,material_goods_code,qty,calculation_basis,headcount_base,headcount_round_mode,machine_base,machine_round_mode,dough_set_base,dough_set_round_mode")
          .in("version_id", fgVersionIds),
      ]);
      if (!versionsResult.error && versionsResult.data) {
        fgVersions = versionsResult.data;
      }
      if (!itemsResult.error && itemsResult.data) {
        basisItems = itemsResult.data;
      }
    }

    const fgVersionMap = new Map(fgVersions.map((v) => [v.id, v]));
    const basisItemMap = new Map();
    basisItems.forEach((item) => {
      const materialSku = normalizeSku(item.material_sku_code);
      const goodsCode = normalizeGoodsCode(item.material_goods_code, materialSku);
      const skuKey = `${item.version_id}::${materialSku}`;
      const goodsKey = `${skuKey}::${goodsCode}`;
      basisItemMap.set(goodsKey, item);
      if (!basisItemMap.has(skuKey)) {
        basisItemMap.set(skuKey, item);
      }
    });

    const planRowsMap = new Map(planRows.map((r) => [r.plan_id, r]));
    const ratioMap = new Map();

    // 1. Calculate ratios for depth = 1 items
    traceRows.forEach((row) => {
      if (row.depth !== 1) return;
      const planRow = planRowsMap.get(row.plan_id);
      if (!planRow) return;

      const plannedQty = Number(planRow.planned_qty || 0);
      const lineStaffCount = Number(planRow.line_staff_count || 0);
      const lineMachineNo = Number(planRow.line_machine_no || 0);
      const lineDoughSetCount = Number(planRow.line_dough_set_count || 0);

      const versionRow = fgVersionMap.get(row.bom_version_id);
      const baseOutputBoxes = versionRow
        ? (Number(versionRow.base_output_boxes) > 0 ? Number(versionRow.base_output_boxes) : (Number(versionRow.base_batch) > 0 ? Number(versionRow.base_batch) : 1))
        : 1;

      const childSku = normalizeSku(row.child_sku_code);
      const childGoodsCode = resolveTraceGoodsCode(row);
      const basisItem = basisItemMap.get(`${row.bom_version_id}::${childSku}::${childGoodsCode}`)
        || basisItemMap.get(`${row.bom_version_id}::${childSku}`);
      if (!basisItem) return;

      const basisQty = computeRequiredQtyFromBasis({
        plannedQty,
        lineStaffCount,
        lineMachineNo,
        lineDoughSetCount,
        itemQty: basisItem.qty,
        baseOutputBoxes,
        calculationBasis: basisItem.calculation_basis,
        headcountBase: basisItem.headcount_base,
        headcountRoundMode: basisItem.headcount_round_mode,
        machineBase: basisItem.machine_base,
        machineRoundMode: basisItem.machine_round_mode,
        doughSetBase: basisItem.dough_set_base,
        doughSetRoundMode: basisItem.dough_set_round_mode,
      });

      const jobQty = computeRequiredQtyFromBasis({
        plannedQty,
        lineStaffCount: null,
        itemQty: basisItem.qty,
        baseOutputBoxes,
        calculationBasis: "JOB_QTY",
      });

      const ratio = jobQty > 0 ? basisQty / jobQty : 1;
      const ratioKey = `${row.plan_id}::${childSku}`;
      ratioMap.set(`${ratioKey}::${childGoodsCode}`, ratio);
      if (!ratioMap.has(ratioKey)) {
        ratioMap.set(ratioKey, ratio);
      }
    });

    // 2. Adjust trace rows based on the depth = 1 ratios
    const adjustedTraceRows = traceRows.map((row) => {
      if (!Array.isArray(row.path) || row.path.length < 2) return row;
      const child1 = normalizeSku(row.path[1]);
      const rowChildSku = normalizeSku(row.child_sku_code);
      const rowGoodsCode = resolveTraceGoodsCode(row);
      const directKey = `${row.plan_id}::${rowChildSku}::${rowGoodsCode}`;
      const pathKey = `${row.plan_id}::${child1}`;
      const ratio = ratioMap.get(directKey) ?? ratioMap.get(pathKey) ?? 1;

      return {
        ...row,
        child_required_qty: Number(row.child_required_qty) * ratio,
        parent_required_qty: Number(row.parent_required_qty) * ratio,
      };
    });

    // Filter RAW and WIP materials
    const rawExplodedTrace = adjustedTraceRows.filter(
      (row) => row.child_item_type === "RAW" || row.child_item_type === "WIP"
    );

    const materialCodes = Array.from(new Set(
      rawExplodedTrace
        .flatMap((row) => [row.child_sku_code, resolveTraceGoodsCode(row)])
        .map(normalizeSku)
        .filter(Boolean)
    ));
    const tradeCodeRows = await fetchTradeCodeUnitRows(materialCodes);
    const tradeCodeUnitMap = buildTradeCodeUnitMap(tradeCodeRows);
    const unitDisplayMetaBySku = new Map();
    tradeCodeUnitMap.forEach((meta) => {
      const sku = normalizeSku(meta.stockSkuCode);
      if (!sku) return;
      const current = unitDisplayMetaBySku.get(sku) || {
        baseGoodsCode: sku,
        baseUnitName: meta.baseUnit || "unit",
        stockGoodsCode: "",
        stockUnitName: "",
        stockUnitFactor: 1,
      };
      if (meta.factorToBase <= 1) {
        current.baseGoodsCode = meta.goodsCode || current.baseGoodsCode;
        current.baseUnitName = meta.baseUnit || meta.tradeUnit || current.baseUnitName;
      } else if (meta.factorToBase > current.stockUnitFactor) {
        current.stockGoodsCode = meta.goodsCode;
        current.stockUnitName = meta.tradeUnit || meta.baseUnit;
        current.stockUnitFactor = meta.factorToBase;
      }
      unitDisplayMetaBySku.set(sku, current);
    });

    const buildReadableQuantity = (stockSkuCode, baseQty, fallbackUnit = "unit") => {
      const meta = unitDisplayMetaBySku.get(normalizeSku(stockSkuCode)) || {};
      return formatReadableLotQuantity(getLotQuantityBreakdown({
        SKU_CODE: stockSkuCode,
        BASE_GOODS_CODE: meta.baseGoodsCode || stockSkuCode,
        STOCK_GOODS_CODE: meta.stockGoodsCode || "",
        BASE_UNIT_NAME: meta.baseUnitName || fallbackUnit,
        STOCK_UNIT_NAME: meta.stockUnitName || meta.baseUnitName || fallbackUnit,
        STOCK_UNIT_FACTOR: meta.stockUnitFactor || 1,
        QTY_BASE: baseQty,
      }));
    };

    const resolveTraceStockMeta = (row, requiredQty = Number(row?.child_required_qty || 0)) =>
      convertRequirementToStockUnit({
        skuCode: normalizeSku(row?.child_sku_code),
        goodsCode: resolveTraceGoodsCode(row),
        requiredQty,
        uom: row?.uom_name,
      }, tradeCodeUnitMap);

    // Group unique stock SKUs for stock and WIP policy queries.
    const materialSkus = Array.from(new Set(
      rawExplodedTrace
        .map((row) => resolveTraceStockMeta(row, 0).stockSkuCode)
        .filter(Boolean)
    ));

    // 5. Fetch On-Hand Stock from Gateway
    let stockMap = new Map();
    if (materialSkus.length > 0) {
      const summaryBySkuParams = new URLSearchParams();
      summaryBySkuParams.set("skus", materialSkus.join(","));
      summaryBySkuParams.set("warehouseCodes", "02,04");
      try {
        const stockResult = await fetchGatewayJson("/api/raw-materials-summary-by-skus", summaryBySkuParams, "production");
        if (stockResult?.ok && Array.isArray(stockResult?.data?.data)) {
          stockResult.data.data.forEach((item) => {
            const sku = String(item?.SKU_CODE || "").trim().toUpperCase();
            if (sku) {
              stockMap.set(sku, {
                qty: resolveStockBaseQty(item),
                unit: item?.UTQ_K_NAME || item?.UTQ_NAME || item?.UTQ_NAME_1 || "",
                warehouses: Array.isArray(item?.WAREHOUSE_BREAKDOWN)
                  ? item.WAREHOUSE_BREAKDOWN
                  : [],
              });
            }
          });
        }
      } catch (err) {
        console.error("Failed to fetch stocks from gateway:", err);
      }
    }

    // Load WIP supply policies for netting
    let wipPolicies = new Map();
    if (materialSkus.length > 0) {
      const { data: policiesData, error: policiesError } = await supabaseAdmin
        .from("production_wip_policies")
        .select("sku_code,supply_mode,is_active")
        .in("sku_code", materialSkus);

      if (!policiesError && Array.isArray(policiesData)) {
        policiesData.forEach((row) => {
          if (row.is_active !== false) {
            wipPolicies.set(normalizeSku(row.sku_code), row.supply_mode);
          }
        });
      }
    }

    // Fetch approved version metadata for batch scaling
    let wipVersionMeta = new Map();
    if (materialSkus.length > 0) {
      const { data: bomsData } = await supabaseAdmin
        .from("production_boms")
        .select("id,sku_code")
        .in("sku_code", materialSkus);

      const bomIds = bomsData?.map((r) => r.id).filter(Boolean) || [];
      if (bomIds.length > 0) {
        const { data: versionsData } = await supabaseAdmin
          .from("production_bom_versions")
          .select("id,bom_id,version_no,base_batch,base_output_boxes,wip_qty_input_mode")
          .in("bom_id", bomIds)
          .eq("status", "approved")
          .order("version_no", { ascending: false });

        const skuByBomId = new Map(bomsData.map((r) => [r.id, normalizeSku(r.sku_code)]));
        (versionsData || []).forEach((version) => {
          const sku = skuByBomId.get(version.bom_id);
          if (!sku || wipVersionMeta.has(sku)) return;

          const baseBatch = Number(version.base_batch) || 0;
          const baseOutput = Number(version.base_output_boxes) || 0;
          wipVersionMeta.set(sku, {
            baseBatch,
            baseOutput,
            wipQtyInputMode: String(version.wip_qty_input_mode || "").trim().toLowerCase(),
            unitsPerBatch: baseBatch > 0 && baseOutput > 0 ? baseOutput / baseBatch : 0,
          });
        });
      }
    }

    // Fetch actual standard units from products cache
    let productUnits = new Map();
    if (materialSkus.length > 0) {
      const { data: productsData } = await supabaseAdmin
        .from("products_cache")
        .select("sku_code,uom_name")
        .in("sku_code", materialSkus);
      if (productsData) {
        productsData.forEach((p) => {
          productUnits.set(normalizeSku(p.sku_code), p.uom_name);
        });
      }
    }

    // Convert child_required_qty of batch-mode WIPs from batches to standard units (kg, pcs, etc.)
    const convertedExplodedTrace = rawExplodedTrace.map((row) => {
      const childSku = normalizeSku(row.child_sku_code);
      const isWip = row.child_item_type === "WIP";
      const uom = String(row.uom_name || "").trim().toLowerCase();
      let childRequiredQty = Number(row.child_required_qty || 0);

      if (isWip && (uom === "ชุด" || uom === "batch")) {
        const meta = wipVersionMeta.get(childSku);
        const unitsPerBatch = meta ? Number(meta.unitsPerBatch) : 0;
        if (unitsPerBatch > 0) {
          childRequiredQty = childRequiredQty * unitsPerBatch;
        }
      }

      const goodsCode = resolveTraceGoodsCode(row);
      const stockMeta = resolveTraceStockMeta({ ...row, child_required_qty: childRequiredQty }, childRequiredQty);

      return {
        ...row,
        child_material_goods_code: goodsCode,
        stock_sku_code: stockMeta.stockSkuCode,
        base_unit: stockMeta.baseUnit || productUnits.get(stockMeta.stockSkuCode) || row.uom_name || "unit",
        conversion_factor: stockMeta.factorToBase,
        requirement_unit: stockMeta.tradeUnit || row.uom_name || stockMeta.baseUnit || "unit",
        child_required_base_qty: stockMeta.requiredBaseQty,
        child_required_qty: childRequiredQty,
        uom_name: productUnits.get(childSku) || row.uom_name || "unit",
      };
    });

    // 6. Run Propagation / Stock Netting Level-by-Level
    const computeWipGapByMode = ({ requiredQty, availableQty, supplyMode }) => {
      const required = Math.max(0, requiredQty);
      const available = Math.max(0, availableQty);
      const mode = String(supplyMode || "").trim().toLowerCase();

      if (mode === "make_to_order") {
        return { stockUsedQty: 0, suggestedProduceQty: required };
      }

      const stockUsedQty = Math.min(required, available);
      const shortageQty = Math.max(0, required - stockUsedQty);
      return { stockUsedQty, suggestedProduceQty: shortageQty };
    };

    const initialRequiredQtyBySku = new Map();
    // Root FGs (cannot be child in convertedExplodedTrace, but are parents)
    bomItems.forEach((item) => {
      const sku = normalizeSku(item.sku_code);
      initialRequiredQtyBySku.set(sku, (initialRequiredQtyBySku.get(sku) || 0) + item.planned_qty);
    });
    // Component materials
    convertedExplodedTrace.forEach((row) => {
      const sku = normalizeSku(row.stock_sku_code || row.child_sku_code);
      initialRequiredQtyBySku.set(sku, (initialRequiredQtyBySku.get(sku) || 0) + Number(row.child_required_base_qty || row.child_required_qty));
    });

    const remainingStockBySku = new Map();
    materialSkus.forEach((sku) => {
      const gatewayStock = stockMap.get(sku);
      remainingStockBySku.set(sku, gatewayStock ? gatewayStock.qty : 0);
    });

    const adjustedRequiredQtyBySku = new Map(initialRequiredQtyBySku);
    const suggestedQtyBySku = new Map();

    const recomputeSuggested = (sku) => {
      const required = adjustedRequiredQtyBySku.get(sku) || 0;
      const stock = remainingStockBySku.get(sku) || 0;
      const policy = wipPolicies.get(sku) || "stock";
      const computed = computeWipGapByMode({
        requiredQty: required,
        availableQty: stock,
        supplyMode: policy,
      });
      suggestedQtyBySku.set(sku, computed.suggestedProduceQty);
    };

    // Initialize suggestions
    initialRequiredQtyBySku.forEach((_, sku) => recomputeSuggested(sku));

    // Build parent-child mapping
    const parentWipSetByChild = new Map();
    convertedExplodedTrace.forEach((row) => {
        const childSku = normalizeSku(row.stock_sku_code || row.child_sku_code);
        const parentSku = normalizeSku(row.parent_sku_code);
      if (!childSku || !parentSku) return;
      if (!parentWipSetByChild.has(childSku)) {
        parentWipSetByChild.set(childSku, new Set());
      }
      parentWipSetByChild.get(childSku).add(parentSku);
    });

    // Run propagation up to 6 passes for convergence
    for (let pass = 0; pass < 6; pass++) {
      let changed = false;
      parentWipSetByChild.forEach((parentSet, childSku) => {
        const parents = Array.from(parentSet);
        if (!parents.length) return;

        let nextRequired = 0;
        const childTraceRows = convertedExplodedTrace.filter((row) => normalizeSku(row.stock_sku_code || row.child_sku_code) === childSku);

        childTraceRows.forEach((row) => {
          const parentSku = normalizeSku(row.parent_sku_code);
          const parentRequired = initialRequiredQtyBySku.get(parentSku) || 0;
          const parentSuggested = suggestedQtyBySku.get(parentSku) || 0;
          const ratio = parentRequired > 0 ? (parentSuggested / parentRequired) : 0;
          nextRequired += Number(row.child_required_base_qty || row.child_required_qty) * ratio;
        });

        if (Math.abs(nextRequired - (adjustedRequiredQtyBySku.get(childSku) || 0)) > 0.0001) {
          adjustedRequiredQtyBySku.set(childSku, nextRequired);
          recomputeSuggested(childSku);
          changed = true;
        }
      });
      if (!changed) break;
    }

    // Apply netting ratios to each trace row
    const nettedExplodedTrace = convertedExplodedTrace.map((row) => {
      const parentSku = normalizeSku(row.parent_sku_code);
      const parentRequired = initialRequiredQtyBySku.get(parentSku) || 0;
      const parentSuggested = suggestedQtyBySku.get(parentSku) || 0;
      const ratio = parentRequired > 0 ? (parentSuggested / parentRequired) : 0;
      const adjustedRequiredQty = Number(row.child_required_qty) * ratio;
      const adjustedRequiredBaseQty = Number(row.child_required_base_qty || row.child_required_qty) * ratio;

      return {
        ...row,
        originalRequiredQty: Number(row.child_required_qty),
        originalRequiredBaseQty: Number(row.child_required_base_qty || row.child_required_qty),
        adjustedRequiredQty: adjustedRequiredQty,
        adjustedRequiredBaseQty,
      };
    });

    // 7. Calculate consolidated warehouse demand as a flat stock-SKU aggregate.
    // This tab intentionally ignores department, section, product, and parent WIP paths.
    const consolidatedByStockSku = new Map();
    nettedExplodedTrace.forEach((row) => {
      const stockSkuCode = normalizeSku(row.stock_sku_code || row.child_sku_code);
      if (!stockSkuCode) return;

      const requiredBaseQty = Number(row.adjustedRequiredBaseQty || row.adjustedRequiredQty || 0);
      const originalBaseQty = Number(row.originalRequiredBaseQty || row.originalRequiredQty || 0);
      if (!Number.isFinite(requiredBaseQty) || requiredBaseQty <= 0) return;

      if (!consolidatedByStockSku.has(stockSkuCode)) {
        consolidatedByStockSku.set(stockSkuCode, {
          materialCode: stockSkuCode,
          materialGoodsCode: normalizeGoodsCode(row.child_material_goods_code, row.child_sku_code),
          stockSkuCode,
          materialName: row.child_material_name,
          itemType: row.child_item_type,
          requiredQty: 0,
          originalRequiredQty: 0,
          unit: row.base_unit || stockMap.get(stockSkuCode)?.unit || row.uom_name || "unit",
          depth: 0,
          requirementComponents: new Map(),
        });
      }

      const item = consolidatedByStockSku.get(stockSkuCode);
      item.requiredQty += requiredBaseQty;
      item.originalRequiredQty += Number.isFinite(originalBaseQty) ? originalBaseQty : requiredBaseQty;
      const goodsCode = normalizeGoodsCode(row.child_material_goods_code, row.child_sku_code);
      const componentKey = goodsCode || stockSkuCode;
      const component = item.requirementComponents.get(componentKey) || {
        goodsCode: componentKey,
        qty: 0,
        baseQty: 0,
        unit: row.requirement_unit || row.uom_name || row.base_unit || item.unit,
      };
      component.qty += Number(row.adjustedRequiredQty || 0);
      component.baseQty += requiredBaseQty;
      item.requirementComponents.set(componentKey, component);

      if (!item.materialGoodsCode && row.child_material_goods_code) {
        item.materialGoodsCode = normalizeGoodsCode(row.child_material_goods_code, row.child_sku_code);
      }
      if (!item.materialName && row.child_material_name) {
        item.materialName = row.child_material_name;
      }
      if (item.itemType !== "RAW" && row.child_item_type === "RAW") {
        item.itemType = "RAW";
      }
    });

    const consolidated = Array.from(consolidatedByStockSku.values())
      .map((item) => {
        const stockQty = Number(stockMap.get(item.stockSkuCode)?.qty || 0);
        const shortageQty = Math.max(0, item.requiredQty - stockQty);
        const remainingQty = stockQty - item.requiredQty;
        const requirementComponents = Array.from(item.requirementComponents.values())
          .filter((component) => component.qty > 0)
          .map((component) => ({
            ...component,
            qty: Number(component.qty.toFixed(4)),
            baseQty: Number(component.baseQty.toFixed(4)),
          }));
        const unitDisplayMeta = unitDisplayMetaBySku.get(item.stockSkuCode) || {};
        const warehouseBreakdown = (stockMap.get(item.stockSkuCode)?.warehouses || [])
          .filter((warehouse) => ["02", "04"].includes(String(warehouse?.warehouseCode || "").trim()))
          .map((warehouse) => ({
            warehouseCode: String(warehouse.warehouseCode).trim(),
            qtyBase: Number(Number(warehouse.qtyBase || 0).toFixed(4)),
            readableQty: buildReadableQuantity(item.stockSkuCode, Number(warehouse.qtyBase || 0), item.unit),
          }));
        return {
          ...item,
          requirementComponents,
          baseGoodsCode: unitDisplayMeta.baseGoodsCode || item.stockSkuCode,
          stockGoodsCode: unitDisplayMeta.stockGoodsCode || "",
          baseUnit: unitDisplayMeta.baseUnitName || item.unit,
          stockUnit: unitDisplayMeta.stockUnitName || "",
          stockUnitFactor: unitDisplayMeta.stockUnitFactor || 1,
          requiredReadable: buildReadableQuantity(item.stockSkuCode, item.requiredQty, item.unit),
          materialGoodsCode: item.materialGoodsCode || item.materialCode,
          materialName: item.materialName || item.materialCode,
          requiredQty: Number(item.requiredQty.toFixed(4)),
          originalRequiredQty: Number(item.originalRequiredQty.toFixed(4)),
          stockQty: Number(stockQty.toFixed(4)),
          stockReadable: buildReadableQuantity(item.stockSkuCode, stockQty, item.unit),
          remainingQty: Number(remainingQty.toFixed(4)),
          remainingReadable: remainingQty >= 0
            ? buildReadableQuantity(item.stockSkuCode, remainingQty, item.unit)
            : `-${buildReadableQuantity(item.stockSkuCode, Math.abs(remainingQty), item.unit)}`,
          warehouseBreakdown,
          shortageQty: Number(shortageQty.toFixed(4)),
          status: shortageQty > 0 ? "shortage" : "sufficient",
        };
      })
      .sort((a, b) =>
        String(a.materialCode || "").localeCompare(String(b.materialCode || ""))
        || String(a.materialGoodsCode || "").localeCompare(String(b.materialGoodsCode || ""))
      );

    // 8. Calculate Hierarchical Breakdown (Detailed Operations View)
    const breakdown = {};
    const planMetaMap = new Map(planRows.map((row) => [row.plan_id, row]));

    nettedExplodedTrace.forEach((row) => {
      const plan = planMetaMap.get(row.plan_id);
      if (!plan) return;

      const deptId = plan.owner_department_id || "unassigned";
      const deptObj = deptMap.get(deptId);
      const deptName = deptObj ? deptObj.name : "แผนกอื่น ๆ";
      const deptCode = deptObj ? deptObj.code : "OTHER";

      const sectionId = plan.schedule_section_def_id || "unassigned";
      const sectionName = plan.schedule_section_name || "เซกชันอื่น ๆ";

      const dateStr = plan.entry_date || plan.period_start || "ไม่ระบุวันที่";

      const fgSku = plan.sku_code;
      const fgName = plan.sku_name;

      if (!breakdown[deptId]) {
        breakdown[deptId] = {
          id: deptId,
          code: deptCode,
          name: deptName,
          sections: {},
        };
      }

      const deptNode = breakdown[deptId];
      if (!deptNode.sections[sectionId]) {
        deptNode.sections[sectionId] = {
          id: sectionId,
          name: sectionName,
          dates: {},
        };
      }

      const secNode = deptNode.sections[sectionId];
      if (!secNode.dates[dateStr]) {
        secNode.dates[dateStr] = {
          date: dateStr,
          products: {},
        };
      }

      const dateNode = secNode.dates[dateStr];
      const prodKey = `${fgSku}::${plan.plan_id}`;
      if (!dateNode.products[prodKey]) {
        dateNode.products[prodKey] = {
          skuCode: fgSku,
          skuName: fgName,
          plannedQty: Number(plan.planned_qty || 0),
          unit: plan.unit || "unit",
          materials: [],
        };
      }

      const prodNode = dateNode.products[prodKey];
      const materialGoodsCode = normalizeGoodsCode(row.child_material_goods_code, row.child_sku_code);
      prodNode.materials.push({
        materialCode: row.child_sku_code,
        materialGoodsCode,
        stockSkuCode: row.stock_sku_code || row.child_sku_code,
        materialName: row.child_material_name,
        itemType: row.child_item_type,
        requiredQty: Number(row.adjustedRequiredQty.toFixed(4)),
        originalRequiredQty: Number(row.originalRequiredQty.toFixed(4)),
        requiredBaseQty: Number((row.adjustedRequiredBaseQty || 0).toFixed(4)),
        originalRequiredBaseQty: Number((row.originalRequiredBaseQty || 0).toFixed(4)),
        baseUnit: row.base_unit || row.uom_name || "unit",
        conversionFactor: row.conversion_factor || 1,
        unit: row.requirement_unit || row.uom_name || "unit",
        parentMaterialCode: row.parent_sku_code,
      });
    });

    const formattedBreakdown = Object.values(breakdown).map((dept) => ({
      ...dept,
      sections: Object.values(dept.sections).map((sec) => ({
        ...sec,
        dates: Object.values(sec.dates).map((dt) => ({
          ...dt,
          products: Object.values(dt.products),
        })).sort((a, b) => a.date.localeCompare(b.date)),
      })).sort((a, b) => a.name.localeCompare(b.name, "th")),
    })).sort((a, b) => a.name.localeCompare(b.name, "th"));

    return NextResponse.json({
      masterPlanNo,
      status: masterPlan?.status || "draft",
      rejectReason: masterPlan?.reject_reason || null,
      consolidated,
      breakdown: formattedBreakdown,
    });
  } catch (error) {
    return jsonError(error);
  }
}
