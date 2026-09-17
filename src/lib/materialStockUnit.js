const normalizeCode = (value) => String(value || "").trim().toUpperCase();

const toFiniteNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const roundQty = (value) => Number(Number(value || 0).toFixed(6));

export function buildTradeCodeUnitMap(rows = []) {
  const map = new Map();

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    const stockSkuCode = normalizeCode(row?.SKU_CODE || row?.skuCode || row?.stockSkuCode);
    const goodsCode = normalizeCode(row?.GOODS_CODE || row?.goodsCode || row?.materialGoodsCode || stockSkuCode);
    if (!stockSkuCode || !goodsCode) return;

    const factorToBase = toFiniteNumber(
      row?.UTQ_QTY_2 ?? row?.utqQty2 ?? row?.factorToBase ?? row?.conversionFactor,
      goodsCode === stockSkuCode ? 1 : 0
    );

    map.set(goodsCode, {
      stockSkuCode,
      goodsCode,
      factorToBase: factorToBase > 0 ? factorToBase : 1,
      baseUnit: String(row?.UTQ_NAME || row?.baseUnit || row?.stockUnit || "").trim(),
      tradeUnit: String(row?.UTQ_NAME_2 || row?.tradeUnit || row?.unit || "").trim(),
    });
  });

  return map;
}

export function resolveTradeCodeUnitMeta(item = {}, tradeCodeUnitMap = new Map()) {
  const skuCode = normalizeCode(item?.skuCode || item?.materialSkuCode || item?.SKU_CODE);
  const goodsCode = normalizeCode(
    item?.goodsCode || item?.materialGoodsCode || item?.GOODS_CODE || skuCode
  );
  const meta = tradeCodeUnitMap.get(goodsCode);
  if (meta) {
    return meta;
  }
  return {
    stockSkuCode: skuCode || goodsCode,
    goodsCode: goodsCode || skuCode,
    factorToBase: 1,
    baseUnit: String(item?.baseUnit || item?.stockUnit || "").trim(),
    tradeUnit: String(item?.uom || item?.unit || item?.requiredUnit || "").trim(),
  };
}

export function convertRequirementToStockUnit(requirement = {}, tradeCodeUnitMap = new Map()) {
  const meta = resolveTradeCodeUnitMeta(requirement, tradeCodeUnitMap);
  const requiredQty = toFiniteNumber(requirement?.requiredQty ?? requirement?.qty, 0);
  return {
    ...meta,
    requiredBaseQty: roundQty(requiredQty * meta.factorToBase),
  };
}

export function convertStockToRequirementUnit(stockBaseQty, requirement = {}, tradeCodeUnitMap = new Map()) {
  const meta = resolveTradeCodeUnitMeta(requirement, tradeCodeUnitMap);
  return roundQty(toFiniteNumber(stockBaseQty, 0) / meta.factorToBase);
}

export function resolveStockBaseQty(stockRow = {}) {
  const qtyK = Number(stockRow?.QTY_K);
  if (Number.isFinite(qtyK)) {
    return roundQty(qtyK);
  }
  return roundQty(toFiniteNumber(stockRow?.QTY, 0));
}
