function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeUpperText(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeLowerText(value) {
  return normalizeText(value).toLowerCase();
}

function normalizeDecimal(value) {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(parsed) ? Number(parsed.toFixed(3)) : 0;
}

function normalizeInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed < min) {
    return fallback;
  }
  return Math.min(parsed, max);
}

function normalizePickerRow(row, progress) {
  const originalWeightKg = normalizeDecimal(row?.weight_kg);
  const returnedWeightKg = normalizeDecimal(progress?.returned_weight_kg);
  const wastedWeightKg = normalizeDecimal(progress?.wasted_weight_kg);
  const calculatedRemainingWeightKg = Math.max(
    originalWeightKg - returnedWeightKg - wastedWeightKg,
    0
  );
  const hasProgressRemainingWeight = progress?.remaining_weight_kg !== null
    && progress?.remaining_weight_kg !== undefined
    && normalizeText(progress?.remaining_weight_kg) !== "";
  const remainingWeightKg = hasProgressRemainingWeight
    ? Math.max(normalizeDecimal(progress.remaining_weight_kg), 0)
    : Number(calculatedRemainingWeightKg.toFixed(3));

  return {
    issueItemId: normalizeText(row?.issue_item_id),
    issueDocumentId: normalizeText(row?.issue_document_id),
    sourceReceiptId: normalizeText(row?.source_receipt_id),
    barcode: normalizeUpperText(row?.barcode),
    productCode: normalizeUpperText(row?.product_code),
    productName: normalizeText(row?.product_name_snapshot),
    lotNo: normalizeText(row?.lot_no),
    originalWeightKg,
    returnedWeightKg,
    wastedWeightKg,
    remainingWeightKg,
    returnCount: normalizeInteger(progress?.return_count, 0, { min: 0 }),
    wasteCount: normalizeInteger(progress?.waste_count, 0, { min: 0 }),
    issuedAt: row?.issued_at || null,
  };
}

function buildSearchText(row) {
  return [
    row.barcode,
    row.productCode,
    row.productName,
    row.lotNo,
  ]
    .map(normalizeUpperText)
    .join(" ");
}

function buildProductOptions(rows) {
  const productByCode = new Map();

  rows.forEach((row) => {
    if (row.productCode && !productByCode.has(row.productCode)) {
      productByCode.set(row.productCode, {
        code: row.productCode,
        name: row.productName,
      });
    }
  });

  return Array.from(productByCode.values()).sort((left, right) =>
    left.code.localeCompare(right.code, "en")
  );
}

export function buildReturnableIssuePickerData({
  issueRows = [],
  progressRows = [],
  search = "",
  page = 1,
  limit = 50,
} = {}) {
  const progressByIssueItemId = new Map(
    (Array.isArray(progressRows) ? progressRows : []).map((row) => [
      normalizeText(row?.source_issue_item_id),
      row,
    ])
  );
  const normalizedSearch = normalizeUpperText(search);
  const normalizedPage = normalizeInteger(page, 1);
  const normalizedLimit = normalizeInteger(limit, 50, { max: 100 });

  const eligibleRows = (Array.isArray(issueRows) ? issueRows : [])
    .filter((row) => (
      normalizeLowerText(row?.item_status) === "confirmed"
      && normalizeLowerText(row?.document_status) === "confirmed"
    ))
    .map((row) => normalizePickerRow(
      row,
      progressByIssueItemId.get(normalizeText(row?.issue_item_id))
    ))
    .filter((row) => row.issueItemId && row.barcode && row.remainingWeightKg > 0)
    .sort((left, right) => {
      const issuedComparison = String(right.issuedAt || "").localeCompare(
        String(left.issuedAt || "")
      );
      return issuedComparison || left.barcode.localeCompare(right.barcode, "en");
    });

  const productOptions = buildProductOptions(eligibleRows);
  const filteredRows = normalizedSearch
    ? eligibleRows.filter((row) => buildSearchText(row).includes(normalizedSearch))
    : eligibleRows;
  const totalCount = filteredRows.length;
  const totalPages = totalCount ? Math.ceil(totalCount / normalizedLimit) : 0;
  const resolvedPage = totalPages ? Math.min(normalizedPage, totalPages) : 1;
  const startIndex = (resolvedPage - 1) * normalizedLimit;
  const rows = filteredRows.slice(startIndex, startIndex + normalizedLimit);

  return {
    rows,
    summary: {
      totalCount,
      totalRemainingWeightKg: normalizeDecimal(
        filteredRows.reduce((sum, row) => sum + row.remainingWeightKg, 0)
      ),
    },
    pagination: {
      page: resolvedPage,
      limit: normalizedLimit,
      totalCount,
      totalPages,
    },
    productOptions,
  };
}
