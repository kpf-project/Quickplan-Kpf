/**
 * Parse LOT e.g. "260918" -> 2026-09-18 and "18/09/2569"
 */
export function parseLotToDates(lotNo) {
  if (!lotNo) return null;
  const clean = String(lotNo).trim().replace(/[^0-9]/g, "");
  if (clean.length < 6) return null;
  const yy = parseInt(clean.slice(0, 2), 10);
  const mm = clean.slice(2, 4);
  const dd = clean.slice(4, 6);

  // If 26 -> AD 2026 -> BE 2569
  const adYear = 2000 + yy;
  const beYear = adYear + 543;
  const parsedDate = new Date(Date.UTC(adYear, Number(mm) - 1, Number(dd)));
  if (
    parsedDate.getUTCFullYear() !== adYear ||
    parsedDate.getUTCMonth() !== Number(mm) - 1 ||
    parsedDate.getUTCDate() !== Number(dd)
  ) {
    return null;
  }
  const isoDate = `${adYear}-${mm}-${dd}`;
  const thaiDateStr = `${dd}/${mm}/${beYear}`;

  return {
    lotPrefix: clean.slice(0, 6),
    isoDate,
    thaiDateStr,
    adYear,
    beYear,
    month: mm,
    day: dd,
  };
}

export function parseProductionLotDate(lotNo) {
  const digits = String(lotNo || "").replace(/\D/g, "");
  if (digits.length < 6) return null;
  const day = Number(digits.slice(0, 2));
  const month = Number(digits.slice(2, 4));
  const year = 2000 + Number(digits.slice(4, 6));
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseCostingLotDate(lotNo) {
  const digits = String(lotNo || "").replace(/\D/g, "");
  return digits.length === 6 ? parseLotToDates(lotNo)?.isoDate || null : parseProductionLotDate(lotNo);
}

export function buildInputOutputJamCostRows(rows = [], aliases = []) {
  const codes = new Set(aliases);
  return rows.filter((row) => codes.has(row.fgCode) && row.jam).flatMap(({ jam }) =>
    (jam.lots || []).map((lot) => ({
      type: "RM",
      code: jam.code,
      name: jam.name,
      lotNo: lot.lotNo,
      qty: Number(lot.weightKg || 0),
      uomName: "kg",
      status: "missing_cost",
      source: (lot.issueRefs?.length ? lot.issueRefs : jam.issueRefs || []).join(", ") || null,
      returnDocRefs: lot.returnDocRefs?.length ? lot.returnDocRefs : jam.returnDocRefs,
      note: "ยอดใช้สุทธิจากรายงาน Input/Output ของสินค้านี้ · รอราคาต้นทุน",
    })).filter((lot) => lot.qty > 0)
  );
}

export function summarizePieceRateLabor(rows = [], { aliases = [], lotNo } = {}) {
  const productCodes = new Set(aliases.map((value) => String(value || "").trim()).filter(Boolean));
  const matchedRows = rows.filter((row) => {
    if (lotNo && String(row.lot_no || "").trim() !== String(lotNo).trim()) return false;
    if (row.replaced_by_log_id || (row.doc_status && row.doc_status !== "active")) return false;
    return [row.product_sku_code_snapshot, row.product_code_snapshot, row.product_goods_code_snapshot]
      .some((value) => productCodes.has(String(value || "").trim()));
  });
  return {
    amount: Number(matchedRows.reduce((sum, row) => sum + Number(row.wage_amount_snapshot || 0), 0).toFixed(4)),
    documentCount: new Set(matchedRows.map((row) => row.doc_no).filter(Boolean)).size,
    employeeCount: new Set(matchedRows.map((row) => row.employee_code).filter(Boolean)).size,
  };
}

export function compactIssueUnit(value) {
  const unit = String(value || "").trim();
  if (/^ชุด\s*x/i.test(unit) || /^ถุง\s*x/i.test(unit)) return "ถุง";
  if (/^กล่อง\s*x/i.test(unit)) return "กล่อง";
  if (/^ก\.ล\.\s*x/i.test(unit)) return "แกลลอน";
  return unit;
}

export function resolveCostTreeUsage(node) {
  const netIssueQty = Math.max(0, Number(node.grossQty || 0) - Number(node.returnQty || 0));
  if (!(Number(node.grossQty) > 0) || !node.sourceUomName) {
    return { displayQty: node.qty, displayUom: node.uomName, baseQty: null };
  }
  return {
    displayQty: netIssueQty,
    displayUom: compactIssueUnit(node.sourceUomName),
    baseQty: Math.abs(netIssueQty - Number(node.qty || 0)) > 0.0001 ? Number(node.qty || 0) : null,
  };
}

export function extractBomSnapshotMaterials(snapshot) {
  if (!Array.isArray(snapshot)) return [];
  return snapshot.flatMap((entry) => Array.isArray(entry?.materials) ? entry.materials : []).map((item, index) => ({
    key: `${item.goodsCode || item.skuCode || "item"}-${index}`,
    itemType: item.itemType || "RAW",
    skuCode: item.skuCode || null,
    goodsCode: item.goodsCode || null,
    name: item.name || item.skuCode || item.goodsCode || "ไม่ระบุชื่อ",
    requiredQty: Number(item.requiredQty || 0),
    issueQty: Number(item.issueQty || 0),
    uomName: item.unit || null,
  }));
}

export function productionReceiptDateRange(productionDate, postingLagDays = 7) {
  const end = new Date(`${productionDate}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() + postingLagDays);
  return { dateFrom: productionDate, dateTo: end.toISOString().slice(0, 10) };
}

export function buildScopedSnapshotMaterials(snapshot, groupItems = []) {
  const materials = extractBomSnapshotMaterials(snapshot);
  const uniqueGroupItems = [...new Map(groupItems.map((item) => {
    const skuCode = String(item.material_sku_code || "").trim().toUpperCase();
    const goodsCode = String(item.material_goods_code || skuCode).trim().toUpperCase();
    return [`${skuCode}|${goodsCode}`, { ...item, skuCode, goodsCode }];
  })).values()];

  return uniqueGroupItems.flatMap((groupItem) => {
    const candidates = materials.filter((item) => (
      String(item.skuCode || "").trim().toUpperCase() === groupItem.skuCode
    ));
    const exact = candidates.find((item) => (
      String(item.goodsCode || "").trim().toUpperCase() === groupItem.goodsCode
    ));
    const material = exact || (candidates.length === 1 ? candidates[0] : null);
    if (!material) return [];
    return [{
      materialSkuCode: groupItem.skuCode,
      materialCode: groupItem.goodsCode,
      materialName: groupItem.metadata?.materialName || material.name,
      requiredQty: material.requiredQty,
      uomName: material.uomName,
      itemType: groupItem.metadata?.itemType === "WIP" || material.itemType === "WIP" ? "WIP" : "RM",
    }];
  });
}

export function planMatchesRequisitionWorkstream(plan, metadata) {
  const planId = String(plan?.plan_id || plan?.planId || "").trim().toUpperCase();
  const workstreamCode = String(metadata?.workstreamCode || "").trim().toUpperCase();
  const workstreamPrefix = workstreamCode.split("-")[0];
  const planSection = String(plan?.schedule_section_name || plan?.sectionName || "").trim().toUpperCase();
  const workstreamName = String(metadata?.workstreamName || "").trim().toUpperCase();
  const planDepartment = String(plan?.owner_department_id || plan?.departmentId || "").trim();
  const groupDepartment = String(metadata?.ownerDepartmentId || "").trim();
  const sameDepartment = !planDepartment || !groupDepartment || planDepartment === groupDepartment;
  const sameWorkstream = Boolean(
    (workstreamCode && planId.includes(workstreamCode))
    || (workstreamPrefix.length >= 8 && planId.includes(workstreamPrefix))
    || (planSection && workstreamName && planSection === workstreamName)
  );
  return sameDepartment && sameWorkstream;
}

export function attachOutputsToPlanRows(planRows = [], candidates = []) {
  return planRows.map((plan) => ({
    ...plan,
    outputs: candidates.filter((candidate) => (
      candidate.skuCode === plan.skuCode
      && (parseProductionLotDate(candidate.lotNo) === plan.productionDate
        || candidate.receiptDates?.includes(plan.productionDate))
    )),
  }));
}

/**
 * Joint Product Weight Allocation
 */
export function allocateJointProductWeights(batchCost, products = []) {
  const totalWeight = products.reduce((sum, p) => sum + (Number(p.weight_kg) || Number(p.qty * p.unit_weight_kg) || 0), 0);
  const unitCostPerKg = totalWeight > 0 ? batchCost / totalWeight : 0;

  const allocatedProducts = products.map((p) => {
    const weight = Number(p.weight_kg) || Number(p.qty * p.unit_weight_kg) || 0;
    const unitWeight = p.unit_weight_kg || (p.qty > 0 ? weight / p.qty : 0);
    const unitCostPerItem = unitCostPerKg * unitWeight;
    const totalCost = unitCostPerKg * weight;

    return {
      ...p,
      weight_kg: weight,
      unit_cost: unitCostPerItem,
      total_cost: totalCost,
    };
  });

  return {
    totalWeight,
    unitCostPerKg,
    products: allocatedProducts,
  };
}

/**
 * Baking Yield and Cost Calculation
 */
export function calculateBakingYield({ doughWeightKg, bakedWeightKg, totalAccumulatedCost }) {
  const yieldPct = doughWeightKg > 0 ? (bakedWeightKg / doughWeightKg) * 100 : 0;
  const bakedUnitCostPerKg = bakedWeightKg > 0 ? totalAccumulatedCost / bakedWeightKg : 0;

  return {
    doughWeightKg,
    bakedWeightKg,
    yieldPct,
    bakedUnitCostPerKg,
    evaporatedWaterKg: Math.max(0, doughWeightKg - bakedWeightKg),
  };
}

/**
 * Calculate Cost Sheet Totals
 */
export function calculateCostSheetTotals({ actualQty, materials = [], expenses = [] }) {
  const materialCost = materials.reduce((sum, m) => sum + Number(m.total_amount || 0), 0);

  let dlCost = 0;
  let ohCost = 0;
  expenses.forEach((e) => {
    const amt = Number(e.amount || 0);
    if (e.expense_type === "DL") dlCost += amt;
    else if (e.expense_type === "OH") ohCost += amt;
  });

  const totalCost = materialCost + dlCost + ohCost;
  const unitCost = Number(actualQty) > 0 ? totalCost / Number(actualQty) : 0;

  const matPct = totalCost > 0 ? (materialCost / totalCost) * 100 : 0;
  const dlPct = totalCost > 0 ? (dlCost / totalCost) * 100 : 0;
  const ohPct = totalCost > 0 ? (ohCost / totalCost) * 100 : 0;

  return {
    materialCost,
    dlCost,
    ohCost,
    totalCost,
    unitCost,
    matPct,
    dlPct,
    ohPct,
  };
}

export function validateCostSheetClose({ actualQty, materials = [], expenses = [], linkedSheetStatusById = {} }) {
  const errors = [];
  if (!(Number(actualQty) > 0)) errors.push("Cannot close costing without measured output quantity");
  if (!materials.length) errors.push("Cannot close costing without material or transferred-in cost lines");

  materials.forEach((item) => {
    const label = `${item.item_code || "material"}${item.lot_no ? ` LOT ${item.lot_no}` : ""}`;
    const resolvedWithoutDirectCost = ["exception_not_used", "exception_not_related", "exception_indirect_oh"]
      .includes(item.source_kind) && item.allocation_status === "confirmed";
    const allowsNoLot = item.source_kind === "exception_direct_no_lot" && item.allocation_status === "confirmed";
    if (!resolvedWithoutDirectCost && !(Number(item.qty) > 0)) errors.push(`${label}: allocated quantity must be greater than zero`);
    if (!resolvedWithoutDirectCost && (!(Number(item.unit_price) > 0) || !(Number(item.total_amount) > 0))) {
      errors.push(`${label}: unit cost and amount are required`);
    }
    if (!resolvedWithoutDirectCost && !allowsNoLot && ["RM", "WIP", "MANUAL_WIP"].includes(item.item_type) && !String(item.lot_no || "").trim()) {
      errors.push(`${label}: lot number is required`);
    }
    if (item.allocation_status && !["matched", "confirmed"].includes(item.allocation_status)) {
      errors.push(`${label}: material allocation is still ${item.allocation_status}`);
    }
    if (item.item_type === "WIP") {
      const linkedId = String(item.linked_cost_sheet_id || "").trim();
      if (!linkedId) errors.push(`${label}: linked WIP cost sheet is required`);
      else if (linkedSheetStatusById[linkedId] !== "closed") errors.push(`${label}: linked WIP cost sheet is not closed`);
    } else if (!resolvedWithoutDirectCost && !String(item.source_doc_ref || "").trim()) {
      errors.push(`${label}: source document is required`);
    }
  });

  expenses.forEach((item) => {
    if (!Number.isFinite(Number(item.amount)) || Number(item.amount) < 0) {
      errors.push(`${item.expense_type || "expense"}: amount must be a valid non-negative number`);
    }
  });
  return errors;
}

export function validateCentralAllocation({ skuCode, materials = [], preview }) {
  if (!preview?.canConfirm) return ["Central allocation control is not balanced"];
  const totalByKey = (rows, keyOf, qtyOf) => rows.reduce((map, row) => {
    const key = keyOf(row);
    map.set(key, (map.get(key) || 0) + Number(qtyOf(row) || 0));
    return map;
  }, new Map());
  const keyOf = (row) => `${row.item_code || row.materialCode}|${row.lot_no || row.lotNo || ""}`;
  const expected = totalByKey(
    (preview.allocations || []).filter((row) => row.productCode === skuCode),
    keyOf,
    (row) => row.costQty ?? row.allocatedBaseQty ?? row.allocatedQty
  );
  const actual = totalByKey(
    materials.filter((row) => row.source_kind === "bom_central_allocation"),
    keyOf,
    (row) => row.qty
  );
  const errors = [];
  for (const key of new Set([...expected.keys(), ...actual.keys()])) {
    if (Math.abs((expected.get(key) || 0) - (actual.get(key) || 0)) > 0.0001) {
      errors.push(`${key}: saved allocation no longer matches the controlled preview`);
    }
  }
  return errors;
}

export function buildProductionOutputCandidates(receipts = [], existingSheets = []) {
  const existing = new Map(existingSheets.map(s => [`${s.sku_code}|${s.lot_no}`, s]));
  const grouped = new Map();
  const seen = new Set();
  for (const row of receipts) {
    if (!row.skuCode || seen.has(row.id)) continue;
    seen.add(row.id);
    const lotNo = String(row.lotNo || "").trim();
    const key = `${row.skuCode}|${lotNo || row.id}`;
    const current = grouped.get(key) || {
      ...row, key, lotNo: lotNo || null, actualQty: 0, actualWeightKg: 0, receiptDates: [],
      canStart: Boolean(lotNo && lotNo !== "-"),
      automaticFields: ["ยอดรับผลผลิต (kg)", "วันรับเข้า", "สินค้า", "LOT"],
      confirmationFields: ["แผน/BOM", "จัดสรรใบเบิก", "DL", "OH", "ยอดผลิตครบ LOT"],
      existingSheet: existing.get(key) || null,
      blockedReason: "ต้องมี LOT และปริมาณรับเข้าที่ตรวจสอบได้",
    };
    current.actualQty += Number(row.actualQty || 0);
    current.actualWeightKg += Number(row.actualWeightKg || 0);
    current.receiptDates.push(row.productionDate);
    if (row.productionDate < current.productionDate) current.productionDate = row.productionDate;
    if (!Number.isFinite(Number(row.actualQty)) || Number(row.actualQty) <= 0) current.canStart = false;
    grouped.set(key, current);
  }
  return [...grouped.values()].sort((a, b) => b.productionDate.localeCompare(a.productionDate) || a.skuCode.localeCompare(b.skuCode));
}

export function applyMaterialIssueCostToReceipts(rows = [], draftsByLot = new Map()) {
  return rows.map((row) => {
    const draft = draftsByLot.get(String(row.LOT_NO || "").trim());
    const outputQty = Number(row.NET_BASE_QTY || 0);
    if (!draft || !Number.isFinite(draft.unit_cost) || draft.unit_cost <= 0 || outputQty <= 0) return row;
    return {
      ...row,
      UNIT_PRICE_EXCL_VAT: draft.unit_cost,
      NET_AMOUNT_EXCL_VAT: draft.unit_cost * outputQty,
      COST_STATUS: "ready",
      REVIEW_REASON: null,
      COST_SOURCE: "actual_material_issue",
      MATERIAL_ISSUE_VALUE: draft.material_cost,
      MATERIAL_OUTPUT_QTY: draft.output_weight_kg,
      ISSUE_DOCUMENTS: draft.issue_documents,
      RETURN_DOCUMENTS: draft.return_documents,
    };
  });
}

export function rawMaterialUnitCostExclVat(row = {}) {
  const receivedQty = Number(row.RECEIVED_BASE_QTY || 0);
  const netAmount = Number(row.NET_PURCHASE_AMOUNT);
  if (receivedQty > 0 && row.NET_PURCHASE_AMOUNT != null && Number.isFinite(netAmount)) {
    return netAmount / receivedQty;
  }
  return Number(row.UNIT_COST || 0);
}

export function buildMaterialEstimateRows({ explosionRows = [], receiptRows = [], tradeCodeRows = [], estimateDate }) {
  const code = (value) => String(value || "").trim().toUpperCase();
  const isoDate = (value) => String(value || "").slice(0, 10);
  const estimateTime = Date.parse(`${estimateDate}T00:00:00Z`);
  const latestReceiptBySku = new Map();

  [...receiptRows]
    .sort((left, right) => {
      const dateOrder = isoDate(right.DI_DATE).localeCompare(isoDate(left.DI_DATE));
      return dateOrder || Number(right.DI_KEY || 0) - Number(left.DI_KEY || 0);
    })
    .forEach((row) => {
      const skuCode = code(row.SKU_CODE);
      if (skuCode && !latestReceiptBySku.has(skuCode)) latestReceiptBySku.set(skuCode, row);
    });

  const tradeCodeByGoods = new Map(tradeCodeRows.map((row) => [code(row.GOODS_CODE), row]));

  return explosionRows
    .filter((row) => code(row.itemType) === "RAW" && Number(row.requiredQty) > 0)
    .map((row) => {
      const materialSkuCode = code(row.materialSkuCode);
      const materialGoodsCode = code(row.materialGoodsCode || row.materialSkuCode);
      const tradeCode = tradeCodeByGoods.get(materialGoodsCode);
      const packSize = Math.max(0, Number(tradeCode?.UTQ_QTY_2 ?? tradeCode?.UTQ_QTY ?? 1)) || 1;
      const receipt = latestReceiptBySku.get(materialSkuCode);
      const directUnitPrice = Number(receipt?.UNIT_PRICE_EXCL_VAT);
      const receiptQty = Number(receipt?.NET_BASE_QTY);
      const netAmount = Number(receipt?.SELL_AMOUNT ?? receipt?.NET_AMOUNT_EXCL_VAT);
      const baseUnitPrice = Number.isFinite(directUnitPrice) && directUnitPrice > 0
        ? directUnitPrice
        : receiptQty > 0 && Number.isFinite(netAmount)
          ? netAmount / receiptQty
          : NaN;
      const unitPrice = Number.isFinite(baseUnitPrice) && baseUnitPrice > 0 ? baseUnitPrice * packSize : null;
      const receiptDate = isoDate(receipt?.DI_DATE);
      const ageDays = receiptDate && Number.isFinite(estimateTime)
        ? Math.floor((estimateTime - Date.parse(`${receiptDate}T00:00:00Z`)) / 86400000)
        : null;
      const status = unitPrice == null
        ? "missing"
        : receipt?.COST_STATUS !== "ready"
          ? "review"
          : ageDays > 90
            ? "stale"
            : "ready";
      const requiredQty = Number(row.requiredQty);

      return {
        materialSkuCode,
        materialGoodsCode,
        materialName: row.materialName,
        requiredQty,
        uomName: row.uomName,
        packSize,
        unitPrice,
        totalAmount: unitPrice == null ? null : requiredQty * unitPrice,
        receiptDate: receiptDate || null,
        invoiceNo: receipt?.DI_REF || null,
        lotNo: receipt?.LOT_NO || null,
        baseUomName: receipt?.BASE_UNIT_NAME || null,
        priceSource: receipt ? "รับเข้าวัตถุดิบล่าสุด (ไม่รวม VAT)" : "ไม่พบราคาก่อนวันที่ประมาณการ",
        status,
        reviewReason: receipt?.REVIEW_REASON || null,
      };
    })
    .sort((left, right) => left.materialGoodsCode.localeCompare(right.materialGoodsCode));
}

export function prefersActualWipIssueAllocation(skuCode) {
  return /^WKB-/i.test(String(skuCode || "").trim());
}

export function resolveFlourSiftingProfile(skuCode) {
  const code = String(skuCode || "").replaceAll("-", "").toUpperCase();
  if (code.startsWith("WK2208")) return { receiptSearch: "WK-2208", remarkHint: "PLD" };
  if (code.startsWith("WK2202")) return { receiptSearch: "WK-2202", remarkHint: "D1" };
  if (code.startsWith("WK22061")) return { receiptSearch: "WK-2206-1", remarkHint: "อินทัช" };
  return null;
}

export function resolveUpstreamCostSku({ materialCode, materialSkuCode, sourceMaterialSkuCode }) {
  return resolveFlourSiftingProfile(materialCode)
    ? materialCode
    : materialSkuCode || sourceMaterialSkuCode || materialCode;
}


/**
 * Resolves standard shell/jam ratio for sandwich biscuits:
 * - Allpine / ออลพาย: 60% shell : 40% jam
 * - General sandwich biscuits: 55% shell : 45% jam (or 50% : 50% if specified)
 */
export function resolveBiscuitSandwichRatio({ skuCode = "", skuName = "", defaultShellRatio = 0.55 } = {}) {
  const text = `${skuCode} ${skuName}`.toLowerCase();
  const isAllpine = /ออลพาย|allpine|allpline|all-pine|all\s*pine/.test(text);
  if (isAllpine) {
    return {
      shellRatio: 0.60,
      jamRatio: 0.40,
      category: "allpine",
      label: "ออลพาย (เปลือก 60% : แยม 40%)",
    };
  }
  const shellRatio = Number(defaultShellRatio) > 0 ? Number(defaultShellRatio) : 0.55;
  const jamRatio = Number(Math.max(0, 1 - shellRatio).toFixed(4));
  return {
    shellRatio,
    jamRatio,
    category: shellRatio === 0.5 ? "equal" : "standard",
    label: `มาตรฐาน (เปลือก ${Math.round(shellRatio * 100)}% : แยม ${Math.round(jamRatio * 100)}%)`,
  };
}

/**
 * Allocates shared shell and jam inputs across multiple FG or WIP sandwich products
 * based on output weight and formula ratio (Allpine 60:40, standard 55:45 or 50:50).
 */
export function allocateBiscuitSandwichShellAndJam({
  products = [],
  availableShellLots = [],
  availableJamLots = [],
  defaultShellRatio = 0.55,
} = {}) {
  if (!products.length) return [];

  const analyzedProducts = products.map((product) => {
    const weight = Math.max(0, Number(product.actualWeightKg || product.fgWeightKg || product.weightKg || product.qty || product.actualQty || 0));
    const ratio = resolveBiscuitSandwichRatio({
      skuCode: product.skuCode || product.fgCode || product.code,
      skuName: product.skuName || product.fgName || product.name,
      defaultShellRatio,
    });
    const demandShellKg = weight * ratio.shellRatio;
    const demandJamKg = weight * ratio.jamRatio;
    return {
      ...product,
      weight,
      ratio,
      demandShellKg,
      demandJamKg,
    };
  });

  const totalDemandShell = analyzedProducts.reduce((sum, p) => sum + p.demandShellKg, 0);
  const totalDemandJam = analyzedProducts.reduce((sum, p) => sum + p.demandJamKg, 0);

  return analyzedProducts.map((p) => {
    const shellShare = totalDemandShell > 0 ? p.demandShellKg / totalDemandShell : (1 / analyzedProducts.length);
    const jamShare = totalDemandJam > 0 ? p.demandJamKg / totalDemandJam : (1 / analyzedProducts.length);

    const allocatedShellLots = availableShellLots.map((lot) => {
      const lotWeight = Math.max(0, Number(lot.weightKg || lot.qty || 0));
      return {
        ...lot,
        weightKg: Number((lotWeight * shellShare).toFixed(4)),
        originalWeightKg: lotWeight,
        shareRatio: shellShare,
      };
    });

    const allocatedJamLots = availableJamLots.map((lot) => {
      const lotWeight = Math.max(0, Number(lot.weightKg || lot.qty || 0));
      const gross = Math.max(0, Number(lot.grossQty || lot.issuedWeightKg || 0));
      const returned = Math.max(0, Number(lot.returnQty || lot.returnedWeightKg || 0));
      return {
        ...lot,
        weightKg: Number((lotWeight * jamShare).toFixed(4)),
        grossQty: gross > 0 ? Number((gross * jamShare).toFixed(4)) : undefined,
        returnQty: returned > 0 ? Number((returned * jamShare).toFixed(4)) : undefined,
        originalWeightKg: lotWeight,
        shareRatio: jamShare,
      };
    });

    const allocatedShellWeightKg = Number(allocatedShellLots.reduce((sum, lot) => sum + lot.weightKg, 0).toFixed(4));
    const allocatedJamWeightKg = Number(allocatedJamLots.reduce((sum, lot) => sum + lot.weightKg, 0).toFixed(4));
    const totalInputWeightKg = Number((allocatedShellWeightKg + allocatedJamWeightKg).toFixed(4));
    const lossWeightKg = Math.max(0, Number((totalInputWeightKg - p.weight).toFixed(4)));

    return {
      skuCode: p.skuCode || p.fgCode || p.code,
      skuName: p.skuName || p.fgName || p.name,
      outputWeightKg: p.weight,
      ratio: p.ratio,
      allocatedShellLots,
      allocatedJamLots,
      allocatedShellWeightKg,
      allocatedJamWeightKg,
      totalInputWeightKg,
      lossWeightKg,
      lossPercent: totalInputWeightKg > 0 ? (lossWeightKg / totalInputWeightKg) * 100 : 0,
    };
  });
}
