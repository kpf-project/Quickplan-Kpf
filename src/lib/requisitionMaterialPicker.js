export function materialTradeKey(option) {
  return `${String(option?.goodsCode || option?.skuCode || "").trim().toUpperCase()}|${String(option?.unit || "-").trim().toUpperCase()}`;
}

export function filterMaterialCatalog(options, search = "", type = "", unit = "") {
  const terms = search.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return options.filter(option => (!type || option.itemType === type) && (!unit || option.unit === unit) && terms.every(term => `${option.goodsCode} ${option.skuCode} ${option.name} ${option.unit}`.toLocaleLowerCase().includes(term)));
}

export async function loadCompleteMaterialCatalog({ loadTrades, loadProducts }) {
  const trades = [], products = [];
  let cursor = "";
  const cursors = new Set();
  for (let page = 1; ; page++) {
    const result = await loadTrades({ page, pageSize: 500, cursor });
    trades.push(...result.rows);
    if (!result.hasMore) break;
    if (!result.rows.length || !result.nextCursor || cursors.has(result.nextCursor) || page >= 200) throw new Error("โหลด Trade Code ไม่ครบ กรุณาลองใหม่");
    cursor = result.nextCursor;
    cursors.add(cursor);
  }
  for (let page = 1; ; page++) {
    const result = await loadProducts({ page, pageSize: 500 });
    const rows = Array.isArray(result) ? result : result.rows;
    products.push(...rows);
    if (Array.isArray(result) ? rows.length < 500 : !result.hasMore) break;
    if (page >= 200) throw new Error("โหลดแค็ตตาล็อกไม่ครบ กรุณาลองใหม่");
  }
  const tradeSkus = new Set(trades.map(row => row.skuCode));
  const unique = new Map();
  for (const option of [...trades, ...products.filter(row => !tradeSkus.has(row.skuCode))]) {
    if (option?.goodsCode && option?.unit) unique.set(materialTradeKey(option), option);
  }
  return [...unique.values()].sort((a, b) => a.goodsCode.localeCompare(b.goodsCode, "th", { numeric: true }) || a.unit.localeCompare(b.unit, "th"));
}

export function isRequisitionLineExportLocked(doc, line) {
  if (Object.values(line?.exportedLotsByDate || {}).some(rows => rows?.length) || Object.values(line?.erpLotsByDate || {}).some(rows => rows?.length)) return true;
  return Object.entries(doc?.exportedByDate || {}).some(([date, exported]) => exported === true && (Number(line?.qtyByDate?.[date]) > 0 || (line?.breakdownByDate?.[date] || []).some(item => Number(item.qty) > 0)));
}
