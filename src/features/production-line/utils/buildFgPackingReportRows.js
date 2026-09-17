function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round3(value) {
  return Number(number(value).toFixed(3));
}

export function calculateAverageWeightPerTin(actualWeightKg, producedTins) {
  const tins = number(producedTins);
  return tins > 0 ? number(actualWeightKg) / tins : null;
}

function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeName(value) {
  return String(value || "").trim();
}

function ensureBucket(groups, code, name = "") {
  const fgCode = normalizeCode(code);
  if (!fgCode) return null;
  if (!groups.has(fgCode)) {
    groups.set(fgCode, {
      fgCode,
      fgName: normalizeName(name) || fgCode,
      carriedOverTins: 0,
      lotWeights: new Map(),
      issuedWeightKg: 0,
      returnedWeightKg: 0,
      scrapWeightKg: 0,
      rejectedCanQty: 0,
      producedTins: 0,
      fgQuantities: new Map(),
      remainingWipTins: 0,
    });
  }
  const bucket = groups.get(fgCode);
  if ((!bucket.fgName || bucket.fgName === bucket.fgCode) && normalizeName(name)) {
    bucket.fgName = normalizeName(name);
  }
  return bucket;
}

export function buildFgPackingReportRows({
  documents = [],
  issues = [],
  returns = [],
  wastes = [],
  carryovers = [],
} = {}) {
  const groups = new Map();
  const producedFgCodes = new Set();

  documents.forEach((row) => {
    const bucket = ensureBucket(groups, row.fgProductCode, row.fgProductName);
    if (!bucket) return;
    producedFgCodes.add(bucket.fgCode);
    bucket.producedTins += number(row.fgTinQty);
    bucket.remainingWipTins += number(row.wipTinQty);
    const unitName = normalizeName(row.fgUnitName) || "หน่วย";
    bucket.fgQuantities.set(unitName, number(bucket.fgQuantities.get(unitName)) + number(row.fgQuantity));
  });

  const issueCodeById = new Map();
  issues.forEach((row) => {
    const fgCode = normalizeCode(row.fgProductCode);
    if (!producedFgCodes.has(fgCode)) return;
    const bucket = ensureBucket(groups, fgCode, row.fgProductName);
    if (!bucket) return;
    issueCodeById.set(String(row.id || ""), bucket.fgCode);
    const weightKg = number(row.weightKg);
    bucket.issuedWeightKg += weightKg;
    const lotNo = normalizeName(row.lotNo) || "ไม่ระบุ LOT";
    bucket.lotWeights.set(lotNo, number(bucket.lotWeights.get(lotNo)) + weightKg);
  });

  returns.forEach((row) => {
    const fgCode = normalizeCode(row.fgProductCode) || issueCodeById.get(String(row.issueId || ""));
    if (!producedFgCodes.has(fgCode)) return;
    const bucket = ensureBucket(groups, fgCode, row.fgProductName);
    if (bucket) bucket.returnedWeightKg += number(row.weightKg);
  });

  wastes.forEach((row) => {
    const fgCode = normalizeCode(row.fgProductCode);
    if (!producedFgCodes.has(fgCode)) return;
    const bucket = ensureBucket(groups, fgCode, row.fgProductName);
    if (!bucket) return;
    if (row.wasteType === "filling_scrap") bucket.scrapWeightKg += number(row.weightKg);
    if (row.wasteType === "rejected_can") bucket.rejectedCanQty += number(row.rejectedCanQty);
  });

  carryovers.forEach((row) => {
    const fgCode = normalizeCode(row.fgProductCode);
    if (!producedFgCodes.has(fgCode)) return;
    const bucket = ensureBucket(groups, fgCode, row.fgProductName);
    if (bucket) bucket.carriedOverTins += number(row.quantity);
  });

  return Array.from(groups.values())
    .map((bucket) => {
      const actualWeightKg = Math.max(0, round3(bucket.issuedWeightKg - bucket.returnedWeightKg));
      return {
        fgCode: bucket.fgCode,
        fgName: bucket.fgName,
        carriedOverTins: round3(bucket.carriedOverTins),
        lotWeights: Array.from(bucket.lotWeights, ([lotNo, weightKg]) => ({
          lotNo,
          weightKg: round3(weightKg),
        })).sort((left, right) => left.lotNo.localeCompare(right.lotNo, "th", { numeric: true })),
        issuedWeightKg: round3(bucket.issuedWeightKg),
        returnedWeightKg: round3(bucket.returnedWeightKg),
        actualWeightKg,
        scrapWeightKg: round3(bucket.scrapWeightKg),
        rejectedCanQty: round3(bucket.rejectedCanQty),
        producedTins: round3(bucket.producedTins),
        fgQuantities: Array.from(bucket.fgQuantities, ([unitName, quantity]) => ({
          unitName,
          quantity: round3(quantity),
        })),
        producedWeightKg: actualWeightKg,
        remainingWipTins: round3(bucket.remainingWipTins),
      };
    })
    .sort((left, right) => left.fgCode.localeCompare(right.fgCode, "th", { numeric: true }));
}
