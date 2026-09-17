const QUANTITY_EPSILON = 1e-9;

function normalizeText(value, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanFloatingPoint(value) {
  if (!Number.isFinite(value) || Math.abs(value) < QUANTITY_EPSILON) return 0;
  return Number(value.toFixed(9));
}

export function getLotQuantityBreakdown(record = {}) {
  const baseQuantity = normalizeNumber(record.QTY_BASE ?? record.QTY_K);
  const legacyStockQuantity = normalizeNumber(record.QTY);
  const explicitStockUnitFactor = normalizeNumber(record.STOCK_UNIT_FACTOR);
  const derivedStockUnitFactor = baseQuantity !== null
    && legacyStockQuantity !== null
    && Math.abs(legacyStockQuantity) > QUANTITY_EPSILON
    ? cleanFloatingPoint(baseQuantity / legacyStockQuantity)
    : null;
  const stockUnitFactor = explicitStockUnitFactor ?? derivedStockUnitFactor;
  const baseUnitName = normalizeText(record.BASE_UNIT_NAME ?? record.UTQ_K_NAME, "หน่วยฐาน");
  const stockUnitName = normalizeText(record.STOCK_UNIT_NAME ?? record.UTQ_NAME, baseUnitName);
  const baseGoodsCode = normalizeText(record.BASE_GOODS_CODE ?? record.GOODS_CODE ?? record.SKU_CODE);
  const stockGoodsCode = normalizeText(record.STOCK_GOODS_CODE);
  const hasPackUnit = Boolean(
    baseQuantity !== null
    && stockUnitFactor !== null
    && stockUnitFactor > 1
    && stockUnitName !== baseUnitName
  );

  if (baseQuantity === null) {
    return {
      valid: false,
      baseQuantity: null,
      baseUnitName,
      baseGoodsCode,
      stockUnitName,
      stockUnitFactor,
      stockGoodsCode,
      wholeStockUnits: 0,
      remainderBaseQuantity: null,
      hasPackUnit,
    };
  }

  const wholeStockUnits = hasPackUnit
    ? Math.floor((baseQuantity + QUANTITY_EPSILON) / stockUnitFactor)
    : 0;
  const remainderBaseQuantity = hasPackUnit
    ? cleanFloatingPoint(baseQuantity - (wholeStockUnits * stockUnitFactor))
    : cleanFloatingPoint(baseQuantity);

  return {
    valid: true,
    baseQuantity: cleanFloatingPoint(baseQuantity),
    baseUnitName,
    baseGoodsCode,
    stockUnitName,
    stockUnitFactor,
    stockGoodsCode,
    wholeStockUnits,
    remainderBaseQuantity,
    hasPackUnit,
  };
}

export function combineLotQuantityBreakdowns(breakdowns = []) {
  const validRows = breakdowns.filter((item) => item?.valid);
  const first = validRows[0] || null;
  if (!first) return null;

  return {
    ...first,
    baseQuantity: cleanFloatingPoint(
      validRows.reduce((sum, item) => sum + item.baseQuantity, 0)
    ),
    wholeStockUnits: validRows.reduce((sum, item) => sum + item.wholeStockUnits, 0),
    remainderBaseQuantity: cleanFloatingPoint(
      validRows.reduce((sum, item) => sum + item.remainderBaseQuantity, 0)
    ),
  };
}

export function formatQuantityNumber(value) {
  const parsed = normalizeNumber(value);
  if (parsed === null) return "-";
  return parsed.toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

export function formatReadableLotQuantity(breakdown) {
  if (!breakdown?.valid) return "-";
  const parts = [];
  if (breakdown.wholeStockUnits > 0) {
    parts.push(`${formatQuantityNumber(breakdown.wholeStockUnits)} ${breakdown.stockUnitName}`);
  }
  if (breakdown.remainderBaseQuantity > 0 || parts.length === 0) {
    parts.push(`${formatQuantityNumber(breakdown.remainderBaseQuantity)} ${breakdown.baseUnitName}`);
  }
  return parts.join(" + ");
}

export function formatReadableLotQuantityAmount(breakdown) {
  if (!breakdown?.valid) return "-";
  const amounts = [];
  if (breakdown.wholeStockUnits > 0) {
    amounts.push(formatQuantityNumber(breakdown.wholeStockUnits));
  }
  if (breakdown.remainderBaseQuantity > 0 || amounts.length === 0) {
    amounts.push(formatQuantityNumber(breakdown.remainderBaseQuantity));
  }
  return amounts.join(" + ");
}

export function formatReadableLotQuantityUnit(breakdown) {
  if (!breakdown?.valid) return "-";
  const units = [];
  if (breakdown.wholeStockUnits > 0) {
    units.push(breakdown.stockUnitName);
  }
  if (breakdown.remainderBaseQuantity > 0 || units.length === 0) {
    units.push(breakdown.baseUnitName);
  }
  return units.join(" + ");
}

export function formatLotUnitReference(breakdown) {
  if (!breakdown?.valid) return "-";
  const references = [];
  if (breakdown.wholeStockUnits > 0) {
    references.push(
      breakdown.stockGoodsCode
        ? `${breakdown.stockGoodsCode} · ${breakdown.stockUnitName}`
        : breakdown.stockUnitName
    );
  }
  if (breakdown.remainderBaseQuantity > 0 || references.length === 0) {
    references.push(`${breakdown.baseGoodsCode} · ${breakdown.baseUnitName}`);
  }
  return references.join(" + ");
}
