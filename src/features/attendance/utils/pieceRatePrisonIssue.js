function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function calculatePrisonIssueWeight({
  availableQuantity,
  availableWeightKg,
  issueQuantity,
}) {
  const quantity = finiteNumber(availableQuantity);
  const weight = finiteNumber(availableWeightKg);
  const requested = finiteNumber(issueQuantity);
  if (quantity <= 0 || weight <= 0 || requested <= 0 || requested > quantity) return 0;
  if (requested === quantity) return Number(weight.toFixed(3));
  return Number(((weight / quantity) * requested).toFixed(3));
}

export function calculatePrisonIssueQuantity({
  availableQuantity,
  availableWeightKg,
  issueWeightKg,
}) {
  const quantity = finiteNumber(availableQuantity);
  const weight = finiteNumber(availableWeightKg);
  const requested = finiteNumber(issueWeightKg);
  if (quantity <= 0 || weight <= 0 || requested <= 0 || requested > weight) return 0;
  if (requested === weight) return Number(quantity.toFixed(3));
  return Number(((quantity / weight) * requested).toFixed(3));
}

export function filterAndPaginatePrisonLots({
  lots = [],
  query = "",
  selectedLotNos = new Set(),
  selectedOnly = false,
  page = 1,
  pageSize = 15,
}) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  const filtered = lots.filter((lot) => {
    const lotNo = String(lot?.lotNo || "");
    if (selectedOnly && !selectedLotNos.has(lotNo)) return false;
    return !normalizedQuery || lotNo.toLowerCase().includes(normalizedQuery);
  });
  const safePageSize = Math.max(1, Math.floor(finiteNumber(pageSize)) || 15);
  const totalPages = Math.max(1, Math.ceil(filtered.length / safePageSize));
  const currentPage = Math.min(totalPages, Math.max(1, Math.floor(finiteNumber(page)) || 1));
  const start = (currentPage - 1) * safePageSize;
  return {
    rows: filtered.slice(start, start + safePageSize),
    totalCount: filtered.length,
    totalPages,
    currentPage,
  };
}
