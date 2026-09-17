import { buildBomImportItemKey } from "../features/production-line/utils/bomImportContract.js";
import { normalizeParam } from "./validation.js";

export const VALID_STRATEGIES = new Set(["overwrite", "skip", "sum"]);
export const VALID_MODES = new Set(["replace", "append"]);

const CALCULATION_BASES = new Set([
  "JOB_QTY",
  "HEADCOUNT",
  "MACHINE_COUNT",
  "DOUGH_SET_COUNT",
]);
const ROUND_MODES = new Set(["NONE", "UP", "DOWN", "NEAREST"]);

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizePositiveNumber(value, fallback = 1) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizePlanningOffset(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(-30, Math.min(30, Math.trunc(parsed)));
}

function normalizeCalculationBasis(value) {
  const normalized = normalizeCode(value);
  return CALCULATION_BASES.has(normalized) ? normalized : "JOB_QTY";
}

function normalizeRoundMode(value) {
  const normalized = normalizeCode(value);
  return ROUND_MODES.has(normalized) ? normalized : "NONE";
}

function normalizeItem(raw = {}) {
  const materialSkuCode = normalizeCode(
    raw.material_sku_code || raw.materialSkuCode || raw.materialCode || raw.code
  );
  const materialGoodsCode = normalizeCode(
    raw.material_goods_code ||
      raw.materialGoodsCode ||
      raw.goods_code ||
      raw.goodsCode ||
      raw.code ||
      materialSkuCode
  );
  const calculationBasis = normalizeCalculationBasis(
    raw.calculation_basis || raw.calculationBasis
  );

  return {
    material_sku_code: materialSkuCode,
    material_goods_code: materialGoodsCode,
    qty: Number(raw.qty),
    uom_name: normalizeParam(raw.uom_name ?? raw.uomName) ?? "",
    notes: normalizeParam(raw.notes ?? raw.note) ?? "",
    planning_offset_days: normalizePlanningOffset(
      raw.planning_offset_days ?? raw.planningOffsetDays
    ),
    calculation_basis: calculationBasis,
    headcount_base: normalizePositiveNumber(
      raw.headcount_base ?? raw.headcountBase,
      1
    ),
    headcount_round_mode: normalizeRoundMode(
      raw.headcount_round_mode ?? raw.headcountRoundMode
    ),
    machine_base: normalizePositiveNumber(
      raw.machine_base ?? raw.machineBase,
      1
    ),
    machine_round_mode: normalizeRoundMode(
      raw.machine_round_mode ?? raw.machineRoundMode
    ),
    dough_set_base: normalizePositiveNumber(
      raw.dough_set_base ?? raw.doughSetBase,
      1
    ),
    dough_set_round_mode: normalizeRoundMode(
      raw.dough_set_round_mode ?? raw.doughSetRoundMode
    ),
  };
}

export function normalizeStrategy(value) {
  const normalized = String(value || "").toLowerCase();
  return VALID_STRATEGIES.has(normalized) ? normalized : "overwrite";
}

export function normalizeMode(value) {
  const normalized = String(value || "").toLowerCase();
  return VALID_MODES.has(normalized) ? normalized : "replace";
}

export function normalizeItems(rawItems = [], { strategy = "overwrite" } = {}) {
  const normalizedStrategy = normalizeStrategy(strategy);
  const map = new Map();

  rawItems.forEach((raw) => {
    const item = normalizeItem(raw);
    if (
      !item.material_sku_code ||
      !item.material_goods_code ||
      !Number.isFinite(item.qty) ||
      item.qty <= 0
    ) {
      return;
    }

    const key = buildBomImportItemKey(item);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, item);
      return;
    }
    if (normalizedStrategy === "skip") return;
    if (normalizedStrategy === "sum") {
      map.set(key, {
        ...existing,
        ...item,
        qty: Number(existing.qty) + Number(item.qty),
        notes: item.notes || existing.notes,
      });
      return;
    }
    map.set(key, { ...existing, ...item });
  });

  return Array.from(map.values());
}

function formatValue(item) {
  const parts = [
    `${item.qty ?? 0} ${item.uom_name || "-"}`,
    item.material_goods_code ? `รหัส ${item.material_goods_code}` : "",
    item.calculation_basis && item.calculation_basis !== "JOB_QTY"
      ? item.calculation_basis
      : "",
    Number(item.planning_offset_days) !== 0
      ? `วันเหลื่อม ${item.planning_offset_days}`
      : "",
    item.notes || "",
  ].filter(Boolean);
  return parts.join(" · ");
}

function buildLabel(item, nameMap) {
  const skuCode = item.material_sku_code;
  const goodsCode = item.material_goods_code || skuCode;
  const name = nameMap.get(skuCode);
  const codeLabel = goodsCode === skuCode ? skuCode : `${goodsCode} (${skuCode})`;
  return name ? `${codeLabel} - ${name}` : codeLabel;
}

function comparableItem(item = {}) {
  const normalized = normalizeItem(item);
  return JSON.stringify(normalized);
}

export function buildDiff(previousItems, nextItems, nameMap = new Map()) {
  const added = [];
  const updated = [];
  const removed = [];
  const changes = [];
  const prevMap = new Map(
    previousItems.map((item) => [buildBomImportItemKey(item), normalizeItem(item)])
  );
  const nextMap = new Map(
    nextItems.map((item) => [buildBomImportItemKey(item), normalizeItem(item)])
  );

  nextMap.forEach((item, key) => {
    const previous = prevMap.get(key);
    const label = buildLabel(item, nameMap);
    if (!previous) {
      added.push({ label, before: "-", after: formatValue(item) });
      changes.push(`เพิ่ม ${label}`);
      return;
    }
    if (comparableItem(previous) !== comparableItem(item)) {
      updated.push({
        label,
        before: formatValue(previous),
        after: formatValue(item),
      });
      changes.push(`ปรับ ${label}`);
    }
  });

  prevMap.forEach((item, key) => {
    if (nextMap.has(key)) return;
    const label = buildLabel(item, nameMap);
    removed.push({ label, before: formatValue(item), after: "-" });
    changes.push(`ลบ ${label}`);
  });

  return { diff: { added, updated, removed }, changes };
}

export async function fetchNamesMap(supabaseAdmin, codes) {
  if (!codes.length) return new Map();
  const { data, error } = await supabaseAdmin
    .from("products_cache")
    .select("sku_code,sku_name,uom_name")
    .in("sku_code", codes);
  if (error) {
    throw new Error("Failed to load product names");
  }
  return new Map(
    (data ?? []).map((row) => [row.sku_code, row.sku_name || ""])
  );
}

export function mergeItems({
  mode,
  strategy,
  previousItems = [],
  incomingItems = [],
}) {
  const normalizedMode = normalizeMode(mode);
  const normalizedStrategy = normalizeStrategy(strategy);
  const nextItems = normalizeItems(incomingItems, {
    strategy: normalizedStrategy,
  });
  if (normalizedMode === "replace") return nextItems;

  const map = new Map(
    normalizeItems(previousItems, { strategy: "overwrite" })
      .map((item) => [buildBomImportItemKey(item), item])
  );
  nextItems.forEach((item) => {
    const key = buildBomImportItemKey(item);
    const existing = map.get(key);
    if (!existing) {
      map.set(key, item);
      return;
    }
    if (normalizedStrategy === "skip") return;
    if (normalizedStrategy === "sum") {
      map.set(key, {
        ...existing,
        ...item,
        qty: Number(existing.qty) + Number(item.qty),
        notes: item.notes || existing.notes,
      });
      return;
    }
    map.set(key, { ...existing, ...item });
  });
  return Array.from(map.values());
}

export function validatePreparedBomImportProduct(product = {}) {
  const errors = [];
  const formulaCode = normalizeCode(
    product.formula_code || product.formulaCode || "DEFAULT"
  );
  const parentType = normalizeCode(product.parent_type || product.parentType);
  const wipMode = String(
    product.wip_qty_input_mode || product.wipQtyInputMode || ""
  ).trim().toLowerCase();
  const baseBatch = Number(product.base_batch ?? product.baseBatch);
  const baseOutputBoxes = Number(
    product.base_output_boxes ?? product.baseOutputBoxes
  );
  const items = Array.isArray(product.items) ? product.items : [];

  if (formulaCode !== "DEFAULT") {
    errors.push("รองรับเฉพาะสูตร DEFAULT เท่านั้น");
  }
  if (!Number.isFinite(baseBatch) || baseBatch <= 0) {
    errors.push("base_batch ต้องมากกว่า 0");
  }
  if (!Number.isFinite(baseOutputBoxes) || baseOutputBoxes <= 0) {
    errors.push("base_output_boxes ต้องมากกว่า 0");
  }
  if (parentType === "WIP" && !["unit", "batch"].includes(wipMode)) {
    errors.push("โหมดปริมาณ WIP ต้องเป็น UNIT หรือ BATCH");
  }
  if (!items.length) {
    errors.push("ต้องมีรายการวัตถุดิบอย่างน้อย 1 รายการ");
  }
  return errors;
}
