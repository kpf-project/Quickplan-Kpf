function positive(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function round(value) {
  return Number(Number(value || 0).toFixed(6));
}

function code(value) {
  return String(value || "").trim().toUpperCase();
}

export function isRequisitionDocumentNo(value) {
  return /^XA?\d/i.test(String(value || "").trim());
}

export function requisitionRemarkMatchesProductionDate(remark, productionDate) {
  const [year, month, day] = String(productionDate || "").split("-");
  if (!year || !month || !day) return false;
  const thaiYear = String(Number(year) + 543);
  const terms = [
    `${day}/${month}/${thaiYear}`,
    `${day}/${month}/${thaiYear.slice(-2)}`,
    `${year}/${month}/${day}`,
    `${year}-${month}-${day}`,
  ];
  return terms.some((term) => String(remark || "").includes(term));
}

export function productionRequisitionIssueDates(productionDate, lookbackDays = 3) {
  const date = new Date(`${productionDate}T00:00:00Z`);
  return Array.from({ length: lookbackDays }, (_, index) => {
    const issueDate = new Date(date);
    issueDate.setUTCDate(issueDate.getUTCDate() - index - 1);
    return issueDate.toISOString().slice(0, 10);
  });
}

export function productionRequisitionLoadScopes(productionDate, preferredDocumentNos = []) {
  const documentRefs = [...new Set(preferredDocumentNos.map((value) => String(value || "").trim()).filter(isRequisitionDocumentNo))];
  if (documentRefs.length) return [{ documentRefs: documentRefs.join("|") }];
  return productionRequisitionIssueDates(productionDate).map((issueDate) => ({
    dateFrom: issueDate,
    dateTo: issueDate,
  }));
}

export function productionRequisitionFallbackDate(productionDate) {
  const date = new Date(`${productionDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "";
  date.setUTCDate(date.getUTCDate() - (date.getUTCDay() === 1 ? 2 : 1));
  return date.toISOString().slice(0, 10);
}

export function filterActualRequisitionRows({ rows = [], productionDate, preferredDocumentNos = [] }) {
  const preferred = new Set(preferredDocumentNos.map(code));
  return rows.filter((row) => Number(row.DI_ACTIVE) === 0
    && isRequisitionDocumentNo(row.DI_REF)
    && (preferred.has(code(row.DI_REF)) || requisitionRemarkMatchesProductionDate(row.DI_REMARK, productionDate)));
}

export function resolveAllocatedIssueUnitCost({ itemType, nestedUnitCost, rawMaterialUnitCost, sourceUnitCost }) {
  if (String(itemType || "").toUpperCase() === "WIP") return positive(nestedUnitCost) || null;
  return positive(rawMaterialUnitCost) || positive(sourceUnitCost) || null;
}

export function selectBiscuitShellRequisitionDocuments({ rows = [], productionDate, wantedCodes = [] }) {
  const issueDate = productionRequisitionFallbackDate(productionDate);
  return selectRequisitionDocuments({
    rows: rows.filter((row) => String(row.DI_DATE || "").slice(0, 10) === issueDate
      && requisitionRemarkMatchesProductionDate(row.DI_REMARK, productionDate)),
    wantedCodes,
    roomTerms: ["ตีแป้งบิสกิต"],
  });
}

export function applyMaterialSkuLookup(rows = [], skuByGoods = new Map()) {
  return rows.map((row) => ({
    ...row,
    materialSkuCode: skuByGoods.get(code(row.materialCode || row.itemCode || row.goodsCode || row.TRD_SH_CODE))
      || row.materialSkuCode,
  }));
}

export function actualBomDemand(bomQty, actualOutputQty, bomOutputBasis) {
  return round(positive(bomQty) * positive(actualOutputQty) / (positive(bomOutputBasis) || 1));
}

function resolveMaterialKey(row, aliases) {
  const exact = code(row.materialCode || row.itemCode || row.goodsCode);
  const sku = code(row.materialSkuCode || row.skuCode);
  return code(aliases[exact] || exact || aliases[sku] || sku);
}

function packSize(row) {
  const explicit = positive(row.packSize || row.tradeUnitQty || row.TRD_UTQQTY);
  if (explicit) return explicit;
  const unit = String(row.uomName || row.unit || row.TRD_UTQNAME || "");
  const match = unit.match(/[x×*]\s*([\d,.]+)/i);
  return match ? positive(match[1].replaceAll(",", "")) || 1 : 1;
}

function groupBy(rows, keyOf) {
  return rows.reduce((groups, row) => {
    const key = keyOf(row);
    groups.set(key, [...(groups.get(key) || []), row]);
    return groups;
  }, new Map());
}

function movementKey(row) {
  return [
    code(row.sourceDocRef || row.originalDocRef || row.TRD_REFER_REF || row.DI_REF),
    code(row.materialCode || row.itemCode || row.goodsCode || row.TRD_SH_CODE),
    code(row.lotNo || row.TRD_LOT_NO),
  ].join("|");
}

export async function collectGatewayCursorRows(loadPage, maxPages = 20) {
  const rows = [];
  let cursor = null;
  const seen = new Set();
  for (let page = 0; page < maxPages; page += 1) {
    const result = await loadPage(cursor);
    rows.push(...(result.rows || []));
    if (!result.hasMore) return rows;
    if (!result.nextCursor || seen.has(result.nextCursor)) throw new Error("Gateway pagination cursor is incomplete");
    seen.add(result.nextCursor);
    cursor = result.nextCursor;
  }
  throw new Error("Gateway pagination exceeded the page limit");
}

export function selectRequisitionDocuments({ rows = [], wantedCodes = [], roomTerms = [], preferredDocumentNos = [] }) {
  const byDocument = groupBy(rows.filter((row) => isRequisitionDocumentNo(row.DI_REF)), (row) => row.DI_REF);
  const preferred = preferredDocumentNos.flatMap((documentNo) =>
    byDocument.has(documentNo) ? [[documentNo, byDocument.get(documentNo)]] : []
  );
  if (preferred.length) return preferred;
  const codeSet = new Set(wantedCodes);
  const roomMatches = [...byDocument.entries()].filter(([, documentRows]) => roomTerms.some((term) =>
    String(documentRows[0]?.DI_REMARK || "").includes(term)
  ));
  if (roomMatches.length) return roomMatches;

  const scored = [...byDocument.entries()].map(([documentNo, documentRows]) => {
    const documentCodes = new Set(documentRows.map((row) => String(row.TRD_SH_CODE || "").trim()).filter(Boolean));
    const overlap = [...documentCodes].filter((materialCode) => codeSet.has(materialCode)).length;
    return { documentNo, documentRows, score: overlap / Math.max(documentCodes.size, 1), overlap };
  }).filter((row) => row.overlap > 0).sort((a, b) => b.overlap - a.overlap || b.score - a.score);
  return scored[0] ? [[scored[0].documentNo, scored[0].documentRows]] : [];
}

export function selectRoutedRequisitionDocuments({ rows = [], routingRows = [] }) {
  const byDocument = groupBy(rows.filter((row) => isRequisitionDocumentNo(row.DI_REF)), (row) => row.DI_REF);
  const byRoom = groupBy(routingRows.filter((row) => row.workCenterId && row.componentSkuCode), (row) => row.workCenterId);
  const selected = new Map();

  byRoom.forEach((roomRows) => {
    const wanted = new Set(roomRows.map((row) => code(row.componentSkuCode)));
    const departmentCodes = new Set(roomRows.map((row) => code(row.issueOwnerDepartmentCode)).filter(Boolean));
    const roomTerms = [...new Set(roomRows.flatMap((row) => [row.workCenterCode, row.workCenterName])
      .map((term) => String(term || "").replace(/^ห้อง/, "").trim())
      .filter(Boolean))];
    const scored = [...byDocument.entries()].map(([documentNo, documentRows]) => {
      const matched = new Set(documentRows.flatMap((row) => [
        code(row.TRD_SH_CODE),
        code(row.materialSkuCode),
      ]).filter((materialCode) => wanted.has(materialCode)));
      const roomMatch = roomTerms.some((term) => String(documentRows[0]?.DI_REMARK || "").includes(term));
      return {
        documentNo,
        documentRows,
        overlap: matched.size,
        departmentMatch: !departmentCodes.size || departmentCodes.has(code(documentRows[0]?.DEPT_CODE)),
        roomMatch,
        score: matched.size / Math.max(new Set(documentRows.map((row) => code(row.TRD_SH_CODE))).size, 1),
      };
    }).filter((row) => row.overlap > 0 && row.departmentMatch)
      .sort((left, right) => right.overlap - left.overlap
        || Number(right.roomMatch) - Number(left.roomMatch)
        || right.score - left.score
        || left.documentNo.localeCompare(right.documentNo));
    const [best, runnerUp] = scored;
    const tied = best && runnerUp
      && best.overlap === runnerUp.overlap
      && best.roomMatch === runnerUp.roomMatch
      && best.score === runnerUp.score;
    if (best && !tied) selected.set(best.documentNo, best.documentRows);
  });

  return [...selected.entries()];
}

export function selectRequisitionPreviewGroups({ groups = [], skuCode, productionDate, fallbackDate }) {
  const matchingDate = [productionDate, fallbackDate].find((dateValue) => groups.some((group) => (
    code(group.metadata?.parentSku) === code(skuCode)
    && group.metadata?.selectedDate === dateValue
  )));
  return matchingDate ? groups.filter((group) => (
    code(group.metadata?.parentSku) === code(skuCode)
    && group.metadata?.selectedDate === matchingDate
  )) : [];
}

export function selectRequisitionPreviewGroup(options) {
  return selectRequisitionPreviewGroups(options)[0] || null;
}

export function selectPreviewDocumentNosForOutput({ groups = [], skuCode, roomIds = [] }) {
  const targetSku = code(skuCode);
  const allowedRooms = new Set(roomIds.map((value) => String(value || "").trim()).filter(Boolean));
  const roomGroups = groups.filter((group) => {
    const metadata = group?.metadata || {};
    return allowedRooms.has(String(metadata.roomId || "").trim())
      || code(metadata.roomCode) === "BIS01"
      || String(metadata.roomLabel || "").includes("[BIS01]");
  });
  const exactGroups = roomGroups.filter((group) => code(group?.metadata?.parentSku) === targetSku);
  const selectedGroups = exactGroups.length
    ? exactGroups
    : roomGroups.filter((group) => !code(group?.metadata?.parentSku));
  return [...new Set(selectedGroups
    .map((group) => String(group?.document_no || "").trim())
    .filter(isRequisitionDocumentNo))];
}

export function excludePreviewDocumentsOwnedByOtherOutputs({ rows = [], groups = [], skuCode }) {
  const targetSku = code(skuCode);
  const ownersByDocument = new Map();
  groups.forEach((group) => {
    const documentNo = code(group?.document_no);
    const ownerSku = code(group?.metadata?.parentSku);
    if (!documentNo || !ownerSku) return;
    const owners = ownersByDocument.get(documentNo) || new Set();
    owners.add(ownerSku);
    ownersByDocument.set(documentNo, owners);
  });
  return rows.filter((row) => {
    const owners = ownersByDocument.get(code(row.DI_REF));
    return !owners?.size || owners.has(targetSku);
  });
}

export function netIssueLinesByReturns({ issueLines = [], returnLines = [] }) {
  const returnsByKey = new Map();
  returnLines.forEach((row) => {
    const key = movementKey(row);
    const qty = positive(row.returnQty ?? row.qty ?? row.TRD_SH_QTY);
    if (!qty) return;
    const current = returnsByKey.get(key) || { qty: 0, documents: new Set() };
    current.qty = round(current.qty + qty);
    const documentNo = String(row.returnDocRef || row.DI_REF || "").trim();
    if (documentNo) current.documents.add(documentNo);
    returnsByKey.set(key, current);
  });

  const issuesByKey = groupBy(issueLines, movementKey);
  const reconciliation = [];
  const netIssueLines = [];
  const zeroUseLines = [];
  issuesByKey.forEach((rows, key) => {
    const grossIssueQty = round(rows.reduce((sum, row) => sum + positive(row.issueQty ?? row.qty ?? row.TRD_SH_QTY), 0));
    const returnEntry = returnsByKey.get(key);
    const returnQty = round(returnEntry?.qty || 0);
    const returnDocRefs = [...(returnEntry?.documents || [])];
    const netIssueQty = round(Math.max(0, grossIssueQty - returnQty));
    const first = rows[0];
    reconciliation.push({
      key,
      sourceDocRef: first.sourceDocRef || first.DI_REF || null,
      materialCode: code(first.materialCode || first.itemCode || first.goodsCode || first.TRD_SH_CODE),
      lotNo: String(first.lotNo || first.TRD_LOT_NO || "").trim() || null,
      grossIssueQty,
      returnQty,
      returnDocRefs,
      netIssueQty,
      status: returnQty > grossIssueQty ? "over_return" : "balanced",
    });
    if (netIssueQty > 0) netIssueLines.push({ ...first, issueQty: netIssueQty, grossIssueQty, returnQty, returnDocRefs });
    else zeroUseLines.push({ ...first, issueQty: 0, grossIssueQty, returnQty, returnDocRefs });
    returnsByKey.delete(key);
  });

  const unmatchedReturns = returnLines.filter((row) => returnsByKey.has(movementKey(row)));
  return { issueLines: netIssueLines, zeroUseLines, reconciliation, unmatchedReturns };
}

export function allocateSharedIssuesByBom({ products = [], issueLines = [], materialAliases = {} }) {
  const demands = [];
  for (const product of products) {
    for (const material of Array.isArray(product.materials) ? product.materials : []) {
      const requiredQty = positive(material.requiredQty);
      if (!requiredQty) continue;
      const key = resolveMaterialKey(material, materialAliases);
      demands.push({
        productCode: code(product.productCode || product.skuCode),
        productName: product.productName || product.skuName || "",
        materialKey: key,
        materialSkuCode: code(material.materialSkuCode || material.skuCode),
        materialCode: code(material.materialCode || material.goodsCode || material.materialSkuCode),
        materialName: material.materialName || material.name || "",
        requiredQty,
        requiredBaseQty: round(requiredQty * packSize(material)),
        uomName: material.uomName || material.unit || "",
        itemType: material.itemType || "RM",
      });
    }
  }

  const consolidatedDemands = [...demands.reduce((rows, demand) => {
    const key = `${demand.productCode}|${demand.materialKey}`;
    const current = rows.get(key);
    const requiredBaseQty = round((current?.requiredBaseQty || 0) + demand.requiredBaseQty);
    const sameUnit = !current || current.uomName === demand.uomName;
    rows.set(key, current ? {
      ...current,
      requiredQty: sameUnit ? round(current.requiredQty + demand.requiredQty) : requiredBaseQty,
      requiredBaseQty,
      uomName: sameUnit ? current.uomName : "หน่วยหลัก",
    } : { ...demand });
    return rows;
  }, new Map()).values()];
  const demandByKey = groupBy(consolidatedDemands, (row) => row.materialKey);
  const demandBySku = groupBy(consolidatedDemands, (row) => code(row.materialSkuCode));
  const issuedByKey = new Map();
  const allocations = [];
  const unmatchedIssues = [];
  const allocatedDemandKeys = new Set();
  const allocatedDemandSkus = new Set();

  for (const issue of issueLines) {
    const issueQty = positive(issue.issueQty ?? issue.qty ?? issue.TRD_SH_QTY);
    if (!issueQty) continue;
    let materialKey = resolveMaterialKey(issue, materialAliases);
    let matching = demandByKey.get(materialKey) || [];
    const issueSku = code(materialAliases[code(issue.materialSkuCode || issue.skuCode)] || issue.materialSkuCode || issue.skuCode);
    if (matching.length && issueSku && issueSku !== materialKey) {
      const exactProducts = new Set(matching.map((row) => row.productCode));
      matching = matching.concat((demandBySku.get(issueSku) || []).filter((row) =>
        row.materialKey === issueSku && !exactProducts.has(row.productCode)
      ));
    }
    if (!matching.length) {
      const skuDemands = issueSku ? demandBySku.get(issueSku) || [] : [];
      const skuMaterialKeys = [...new Set(skuDemands.map((row) => row.materialKey))];
      if (skuMaterialKeys.length === 1) {
        [materialKey] = skuMaterialKeys;
        matching = demandByKey.get(materialKey) || [];
      }
    }
    const issuePackSize = packSize(issue);
    const issueBaseQty = round(issueQty * issuePackSize);
    issuedByKey.set(materialKey, round((issuedByKey.get(materialKey) || 0) + issueBaseQty));

    const totalDemandBaseQty = matching.reduce((sum, row) => sum + row.requiredBaseQty, 0);
    if (!matching.length || totalDemandBaseQty <= 0) {
      unmatchedIssues.push({ ...issue, materialKey, issueQty, issueBaseQty });
      continue;
    }

    let allocatedQty = 0;
    let allocatedBaseQty = 0;
    matching.forEach((demand, index) => {
      const isLast = index === matching.length - 1;
      const share = demand.requiredBaseQty / totalDemandBaseQty;
      const rowQty = isLast ? round(issueQty - allocatedQty) : round(issueQty * share);
      const rowBaseQty = isLast ? round(issueBaseQty - allocatedBaseQty) : round(issueBaseQty * share);
      allocatedQty = round(allocatedQty + rowQty);
      allocatedBaseQty = round(allocatedBaseQty + rowBaseQty);
      allocatedDemandKeys.add(`${demand.productCode}|${demand.materialKey}`);
      if (demand.materialSkuCode) allocatedDemandSkus.add(`${demand.productCode}|${demand.materialSkuCode}`);
      allocations.push({
        productCode: demand.productCode,
        productName: demand.productName,
        materialKey,
        demandMaterialKey: demand.materialKey,
        materialCode: code(issue.itemCode || issue.materialCode || issue.goodsCode || issue.TRD_SH_CODE),
        materialSkuCode: demand.materialSkuCode,
        sourceMaterialSkuCode: code(issue.materialSkuCode || issue.skuCode),
        materialName: issue.itemName || issue.materialName || issue.TRD_SH_NAME || demand.materialName,
        lotNo: String(issue.lotNo || issue.TRD_LOT_NO || "").trim() || null,
        sourceDocRef: issue.sourceDocRef || issue.DI_REF || null,
        uomName: issue.uomName || issue.TRD_UTQNAME || demand.uomName,
        issuedQty: issueQty,
        grossIssuedQty: round(positive(issue.grossIssueQty ?? issueQty) * share),
        returnQty: round(positive(issue.returnQty) * share),
        returnDocRefs: issue.returnDocRefs || [],
        issuedBaseQty: issueBaseQty,
        bomRequiredQty: round(demand.requiredBaseQty / issuePackSize),
        bomRequiredBaseQty: demand.requiredBaseQty,
        allocationShare: share,
        allocatedQty: rowQty,
        allocatedBaseQty: rowBaseQty,
        itemType: issue.itemType || demand.itemType,
        allocationStatus: "proposed",
      });
    });
  }

  const missingIssues = consolidatedDemands.filter((row) =>
    !allocatedDemandKeys.has(`${row.productCode}|${row.materialKey}`)
    && !allocatedDemandSkus.has(`${row.productCode}|${row.materialSkuCode}`)
  );
  const reconciliation = [...demandByKey.entries()].map(([materialKey, rows]) => {
    const requiredBaseQty = round(rows.reduce((sum, row) => sum + row.requiredBaseQty, 0));
    const issuedBaseQty = round(issuedByKey.get(materialKey) || 0);
    const allocatedBaseQty = round(allocations
      .filter((row) => row.materialKey === materialKey)
      .reduce((sum, row) => sum + row.allocatedBaseQty, 0));
    return {
      materialKey,
      requiredBaseQty,
      issuedBaseQty,
      allocatedBaseQty,
      allocationVarianceBaseQty: round(issuedBaseQty - allocatedBaseQty),
      varianceBaseQty: round(issuedBaseQty - requiredBaseQty),
      status: issuedBaseQty === 0 ? "missing_issue" : Math.abs(issuedBaseQty - requiredBaseQty) < 0.000001 ? "matched" : "variance",
    };
  });

  return { allocations, missingIssues, unmatchedIssues, reconciliation };
}
