export const BOM_IMPORT_DEFAULTS = Object.freeze({
  formulaCode: "DEFAULT",
  formulaName: "สูตรหลัก",
  calculationBasis: "JOB_QTY",
  roundMode: "NONE",
  planningOffsetDays: 0,
});

export const BOM_IMPORT_CALCULATION_BASES_MAP = Object.freeze({
  "JOB_QTY": "JOB_QTY",
  "HEADCOUNT": "HEADCOUNT",
  "MACHINE_COUNT": "MACHINE_COUNT",
  "DOUGH_SET_COUNT": "DOUGH_SET_COUNT",
  "อิงจำนวนงาน": "JOB_QTY",
  "อิงจำนวนคน": "HEADCOUNT",
  "อิงจำนวนเครื่อง": "MACHINE_COUNT",
  "อิงจำนวนชุดแป้ง": "DOUGH_SET_COUNT",
});

export const BOM_IMPORT_CALCULATION_BASES = new Set([
  "JOB_QTY",
  "HEADCOUNT",
  "MACHINE_COUNT",
  "DOUGH_SET_COUNT",
]);

export const BOM_IMPORT_ROUND_MODES_MAP = Object.freeze({
  "NONE": "NONE",
  "UP": "UP",
  "DOWN": "DOWN",
  "NEAREST": "NEAREST",
  "ไม่ปัด": "NONE",
  "ปัดขึ้น": "UP",
  "ปัดลง": "DOWN",
  "ปัดปกติ": "NEAREST",
});

export const BOM_IMPORT_ROUND_MODES = new Set([
  "NONE",
  "UP",
  "DOWN",
  "NEAREST",
]);

export const BOM_IMPORT_WIP_MODES_MAP = Object.freeze({
  "unit": "unit",
  "batch": "batch",
  "UNIT": "unit",
  "BATCH": "batch",
  "หน่วย": "unit",
  "แบทช์": "batch",
});

export const BOM_IMPORT_WIP_MODES = new Set(["unit", "batch"]);

export const BOM_IMPORT_HEADER_ALIASES = Object.freeze({
  parentSkuCode: ["รหัสสินค้าตัวแม่", "รหัสสินค้า", "parent_sku_code", "productcode"],
  wipQtyInputMode: ["โหมดปริมาณ WIP", "wip_qty_input_mode"],
  baseBatch: ["base_batch"],
  baseOutputBoxes: ["base_output_boxes"],
  materialGoodsCode: [
    "รหัสวัตถุดิบที่ใช้จริง",
    "รหัสวัตถุดิบ",
    "material_goods_code",
    "code",
  ],
  materialSkuCode: ["SKU ภายใน", "SKU ภายใน (AUTO)", "material_sku_code"],
  qty: ["จำนวน", "qty"],
  calculationBasis: ["ฐานคำนวณ", "calculation_basis"],
  calculationBase: ["ค่าฐาน", "calculation_base"],
  roundMode: ["วิธีปัดเศษ", "round_mode"],
  planningOffsetDays: ["วันเหลื่อมแผน", "planning_offset_days"],
  notes: ["หมายเหตุ", "notes", "note"],
});

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizePositiveNumber(value, fallback = 1) {
  const number = normalizeNumber(value);
  return number !== null && number > 0 ? number : fallback;
}

function normalizeCalculationBasis(value) {
  if (!value) return BOM_IMPORT_DEFAULTS.calculationBasis;
  const trimmed = String(value).trim().toUpperCase();
  const mapped = BOM_IMPORT_CALCULATION_BASES_MAP[trimmed] || BOM_IMPORT_CALCULATION_BASES_MAP[String(value).trim()];
  return mapped || BOM_IMPORT_DEFAULTS.calculationBasis;
}

function normalizeRoundMode(value) {
  if (!value) return BOM_IMPORT_DEFAULTS.roundMode;
  const trimmed = String(value).trim().toUpperCase();
  const mapped = BOM_IMPORT_ROUND_MODES_MAP[trimmed] || BOM_IMPORT_ROUND_MODES_MAP[String(value).trim()];
  return mapped || BOM_IMPORT_DEFAULTS.roundMode;
}

function normalizeWipMode(value) {
  if (!value) return "";
  const trimmed = String(value).trim();
  const lowercase = trimmed.toLowerCase();
  const mapped = BOM_IMPORT_WIP_MODES_MAP[lowercase] || BOM_IMPORT_WIP_MODES_MAP[trimmed];
  return mapped || "";
}

function normalizePlanningOffset(value) {
  const number = normalizeNumber(value);
  if (number === null) return BOM_IMPORT_DEFAULTS.planningOffsetDays;
  return Math.max(-30, Math.min(30, Math.trunc(number)));
}

export function buildBomImportItemKey(item) {
  const skuCode = normalizeCode(
    item?.materialSkuCode || item?.material_sku_code
  );
  const goodsCode = normalizeCode(
    item?.materialGoodsCode ||
      item?.material_goods_code ||
      item?.code ||
      skuCode
  );
  return `${skuCode}::${goodsCode}`;
}

export function sanitizeExcelText(value) {
  const text = String(value ?? "");
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

export function normalizeBomImportRow(raw = {}) {
  const calculationBasis = normalizeCalculationBasis(
    raw.calculationBasis ?? raw.calculation_basis
  );
  const calculationBase = normalizePositiveNumber(
    raw.calculationBase ?? raw.calculation_base,
    1
  );
  const roundMode = normalizeRoundMode(
    raw.roundMode ?? raw.round_mode
  );
  const materialSkuCode = normalizeCode(
    raw.materialSkuCode ?? raw.material_sku_code
  );
  const materialGoodsCode = normalizeCode(
    raw.materialGoodsCode ??
      raw.material_goods_code ??
      raw.code ??
      materialSkuCode
  );

  return {
    rowNumber: Number(raw.rowNumber) || null,
    parentSkuCode: normalizeCode(
      raw.parentSkuCode ?? raw.parent_sku_code ?? raw.productCode
    ),
    formulaCode: BOM_IMPORT_DEFAULTS.formulaCode,
    formulaName: BOM_IMPORT_DEFAULTS.formulaName,
    wipQtyInputMode: normalizeWipMode(
      raw.wipQtyInputMode ?? raw.wip_qty_input_mode
    ),
    baseBatch: normalizeNumber(raw.baseBatch ?? raw.base_batch),
    baseOutputBoxes: normalizeNumber(
      raw.baseOutputBoxes ?? raw.base_output_boxes
    ),
    materialGoodsCode,
    materialSkuCode,
    qty: normalizeNumber(raw.qty),
    uomName: String(raw.uomName ?? raw.uom_name ?? "").trim(),
    calculationBasis,
    headcountBase: calculationBasis === "HEADCOUNT" ? calculationBase : 1,
    headcountRoundMode:
      calculationBasis === "HEADCOUNT" ? roundMode : "NONE",
    machineBase:
      calculationBasis === "MACHINE_COUNT" ? calculationBase : 1,
    machineRoundMode:
      calculationBasis === "MACHINE_COUNT" ? roundMode : "NONE",
    doughSetBase:
      calculationBasis === "DOUGH_SET_COUNT" ? calculationBase : 1,
    doughSetRoundMode:
      calculationBasis === "DOUGH_SET_COUNT" ? roundMode : "NONE",
    planningOffsetDays: normalizePlanningOffset(
      raw.planningOffsetDays ?? raw.planning_offset_days
    ),
    notes: String(raw.notes ?? raw.note ?? "").trim(),
  };
}
