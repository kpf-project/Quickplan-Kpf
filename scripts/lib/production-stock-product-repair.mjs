function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeDate(value) {
  const normalized = normalizeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : "";
}

function getReceiptProductionDate(receipt) {
  const metadataDate = normalizeDate(receipt?.metadata?.productionDate);
  if (metadataDate) return metadataDate;

  const weighedAt = new Date(receipt?.weighed_at);
  if (Number.isNaN(weighedAt.getTime())) return "";

  const bangkokParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(weighedAt);
  const parts = Object.fromEntries(bangkokParts.map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function buildCandidateReceipts(
  receipts,
  { wrongConfigIds = [], targetDates = [] } = {}
) {
  const configIds = new Set(wrongConfigIds.map(normalizeText).filter(Boolean));
  const dates = new Set(targetDates.map(normalizeDate).filter(Boolean));

  return (Array.isArray(receipts) ? receipts : []).filter((receipt) => {
    const metadata = receipt?.metadata && typeof receipt.metadata === "object"
      ? receipt.metadata
      : {};
    if (!configIds.has(normalizeText(receipt?.product_config_id))) return false;
    if (normalizeText(receipt?.status).toLowerCase() !== "recorded") return false;
    if (metadata.isReturn === true || String(metadata.isReturn).toLowerCase() === "true") return false;
    return dates.size === 0 || dates.has(getReceiptProductionDate(receipt));
  });
}

export function buildRepairScope({
  candidateReceipts = [],
  receipts = [],
  issueItems = [],
  movements = [],
} = {}) {
  const receiptIds = candidateReceipts.map((row) => normalizeText(row?.id)).filter(Boolean);
  const receiptIdSet = new Set(receiptIds);
  const sourceBarcodes = new Set(
    candidateReceipts.map((row) => normalizeText(row?.barcode)).filter(Boolean)
  );

  const derivedReturnReceipts = receipts.filter((row) => {
    const sourceReceiptId = normalizeText(row?.metadata?.sourceReceiptId);
    const isReturn = row?.metadata?.isReturn === true
      || String(row?.metadata?.isReturn).toLowerCase() === "true";
    return isReturn && receiptIdSet.has(sourceReceiptId);
  });

  derivedReturnReceipts.forEach((row) => {
    const barcode = normalizeText(row?.barcode);
    if (barcode) sourceBarcodes.add(barcode);
  });

  return {
    receiptIds,
    derivedReturnReceipts,
    issueItems: issueItems.filter((row) => receiptIdSet.has(normalizeText(row?.source_receipt_id))),
    movements: movements.filter((row) => (
      receiptIdSet.has(normalizeText(row?.metadata?.sourceReceiptId))
      || sourceBarcodes.has(normalizeText(row?.source_document_no))
    )),
  };
}

function sumWeight(rows, field) {
  return Number(
    rows.reduce((total, row) => total + (Number(row?.[field]) || 0), 0).toFixed(3)
  );
}

export function summarizeReceiptInvariants(receipts) {
  const rows = Array.isArray(receipts) ? receipts : [];
  return {
    receiptCount: rows.length,
    lotCodes: Array.from(new Set(rows.map((row) => normalizeText(row?.lot_code)).filter(Boolean))).sort(),
    grossWeightKg: sumWeight(rows, "gross_weight_kg"),
    tareWeightKg: sumWeight(rows, "tare_weight_kg"),
    netWeightKg: sumWeight(rows, "net_weight_kg"),
  };
}

export function summarizeLedgerInvariants(rows) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  return {
    rowCount: sourceRows.length,
    dates: Array.from(new Set(
      sourceRows.map((row) => normalizeText(row?.movement_date ?? row?.issue_date)).filter(Boolean)
    )).sort(),
    lotCodes: Array.from(new Set(
      sourceRows.map((row) => normalizeText(row?.lot_no ?? row?.lot_code)).filter(Boolean)
    )).sort(),
    quantityIn: sumWeight(sourceRows, "quantity_in"),
    quantityOut: sumWeight(sourceRows, "quantity_out"),
    weightInKg: sumWeight(sourceRows, "weight_in_kg"),
    weightOutKg: sumWeight(sourceRows, "weight_out_kg"),
  };
}

export function replaceInvariantLotCodes(summary, targetLotCode) {
  const normalizedTargetLotCode = normalizeText(targetLotCode);
  if (
    !normalizedTargetLotCode
    || !Array.isArray(summary?.lotCodes)
    || summary.lotCodes.length === 0
  ) return summary;
  return {
    ...summary,
    lotCodes: [normalizedTargetLotCode],
  };
}

export { getReceiptProductionDate };
