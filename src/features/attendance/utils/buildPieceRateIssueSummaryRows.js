function roundWeight(value) {
  return Number(Number(value || 0).toFixed(3));
}

function buildLotWeights(lotWeightMap, totalWeightKg) {
  const lotWeights = Array.from(lotWeightMap.entries())
    .map(([lotNo, weightKg]) => ({ lotNo, weightKg: roundWeight(weightKg) }))
    .sort((left, right) => left.lotNo.localeCompare(right.lotNo, "th", { numeric: true }));

  if (!lotWeights.length) return [];

  const roundedTotal = roundWeight(totalWeightKg);
  const displayedTotal = roundWeight(
    lotWeights.reduce((sum, item) => sum + item.weightKg, 0)
  );
  const roundingDifference = roundWeight(roundedTotal - displayedTotal);
  if (roundingDifference !== 0) {
    const lastItem = lotWeights[lotWeights.length - 1];
    lastItem.weightKg = roundWeight(lastItem.weightKg + roundingDifference);
  }

  return lotWeights;
}

export function buildPieceRateIssueSummaryRows(rows = []) {
  const groups = new Map();

  (Array.isArray(rows) ? rows : []).forEach((row) => {
    if (!row || row.kind !== "issue") return;

    const issueDate = String(row.issueDate || row.movementDate || row.movementAt || "").slice(0, 10) || "-";
    const wipProductCode = String(row.productCode || "-").trim() || "-";
    const wipProductName = String(row.productName || "-").trim() || "-";
    const fgProductCode = String(row.fgProductCode || "-").trim() || "-";
    const fgProductName = String(row.fgProductName || "-").trim() || "-";
    const lotNo = String(row.lotNo || "").trim() || "ไม่ระบุ LOT";
    const groupKey = [issueDate, wipProductCode, wipProductName, fgProductCode, fgProductName].join("|");
    const current = groups.get(groupKey) || {
      groupKey,
      issueDate,
      wipProductCode,
      wipProductName,
      fgProductCode,
      fgProductName,
      quantity: 0,
      totalWeightKg: 0,
      lotWeightMap: new Map(),
    };
    const weightOutKg = Number(row.weightOutKg || 0);

    current.quantity += Number(row.quantityOut || 0);
    current.totalWeightKg += weightOutKg;
    current.lotWeightMap.set(
      lotNo,
      Number(current.lotWeightMap.get(lotNo) || 0) + weightOutKg
    );
    groups.set(groupKey, current);
  });

  return Array.from(groups.values())
    .map(({ lotWeightMap, ...row }) => {
      const totalWeightKg = roundWeight(row.totalWeightKg);
      return {
        ...row,
        totalWeightKg,
        lotWeights: buildLotWeights(lotWeightMap, totalWeightKg),
      };
    })
    .sort((left, right) => (
      left.issueDate.localeCompare(right.issueDate)
      || left.wipProductCode.localeCompare(right.wipProductCode, "th")
      || left.fgProductCode.localeCompare(right.fgProductCode, "th")
    ));
}
