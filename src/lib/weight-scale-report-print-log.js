const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ITEM_STATUSES = new Set(["confirmed", "available", "issued", "voided"]);
const RECORD_TYPES = new Set(["all", "production", "return"]);

function normalizePositiveInteger(value) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeOptionalText(value, maxLength = 200) {
  return String(value ?? "").trim().slice(0, maxLength);
}

export function buildWeightScaleReportPrintLog({ requestId, filters = {}, receipts = [] } = {}) {
  const visibleReceipts = Array.isArray(receipts) ? receipts : [];
  const firstReceipt = visibleReceipts[0] || null;
  const lastReceipt = visibleReceipts.at(-1) || null;

  return {
    requestId,
    dateFrom: normalizeOptionalText(filters.dateFrom, 10),
    dateTo: normalizeOptionalText(filters.dateTo, 10),
    itemStatus: normalizeOptionalText(filters.itemStatus, 20).toLowerCase(),
    requestedStart: normalizePositiveInteger(filters.itemStart),
    requestedEnd: normalizePositiveInteger(filters.itemEnd),
    displayedStart: normalizePositiveInteger(firstReceipt?.originalSequence),
    displayedEnd: normalizePositiveInteger(lastReceipt?.originalSequence),
    displayedCount: visibleReceipts.length,
    firstReceiptId: normalizeOptionalText(firstReceipt?.id, 36) || null,
    lastReceiptId: normalizeOptionalText(lastReceipt?.id, 36) || null,
    firstBarcode: normalizeOptionalText(firstReceipt?.barcode, 100) || null,
    lastBarcode: normalizeOptionalText(lastReceipt?.barcode, 100) || null,
    productCodes: Array.isArray(filters.productCodes)
      ? filters.productCodes
          .map((code) => normalizeOptionalText(code, 50).toUpperCase())
          .filter(Boolean)
          .slice(0, 100)
      : [],
    recordType: normalizeOptionalText(filters.recordType, 20).toLowerCase() || "all",
    search: normalizeOptionalText(filters.search, 200),
    lotNo: normalizeOptionalText(filters.lotNo, 100).toUpperCase(),
    isTest: filters.isTest === null || filters.isTest === undefined
      ? ""
      : normalizeOptionalText(filters.isTest, 10).toLowerCase(),
  };
}

export function validateWeightScaleReportPrintLog(payload = {}) {
  const normalized = buildWeightScaleReportPrintLog({
    requestId: normalizeOptionalText(payload.requestId, 36),
    filters: {
      dateFrom: payload.dateFrom,
      dateTo: payload.dateTo,
      itemStatus: payload.itemStatus,
      itemStart: payload.requestedStart,
      itemEnd: payload.requestedEnd,
      productCodes: payload.productCodes,
      recordType: payload.recordType,
      search: payload.search,
      lotNo: payload.lotNo,
      isTest: payload.isTest,
    },
    receipts:
      Number(payload.displayedCount) > 0
        ? [
            {
              id: payload.firstReceiptId,
              barcode: payload.firstBarcode,
              originalSequence: payload.displayedStart,
            },
            ...(Number(payload.displayedCount) > 1
              ? [{
                  id: payload.lastReceiptId,
                  barcode: payload.lastBarcode,
                  originalSequence: payload.displayedEnd,
                }]
              : []),
          ]
        : [],
  });

  normalized.displayedCount = Number.parseInt(String(payload.displayedCount ?? "0"), 10);

  if (!UUID_PATTERN.test(normalized.requestId || "")) {
    throw new Error("requestId is invalid");
  }
  if (!DATE_PATTERN.test(normalized.dateFrom) || !DATE_PATTERN.test(normalized.dateTo)) {
    throw new Error("report date range is invalid");
  }
  if (!ITEM_STATUSES.has(normalized.itemStatus)) {
    throw new Error("itemStatus is invalid");
  }
  if (!RECORD_TYPES.has(normalized.recordType)) {
    throw new Error("recordType is invalid");
  }
  if (!Number.isInteger(normalized.displayedCount) || normalized.displayedCount < 0) {
    throw new Error("displayedCount is invalid");
  }
  if (
    normalized.requestedStart !== null
    && normalized.requestedEnd !== null
    && normalized.requestedEnd < normalized.requestedStart
  ) {
    throw new Error("requestedEnd must be greater than or equal to requestedStart");
  }

  return normalized;
}

export function printReportWithBestEffortAudit({ auditPayload, logAudit, print } = {}) {
  try {
    Promise.resolve(logAudit(auditPayload)).catch(() => {});
  } catch (error) {
    // Audit logging must never block the user's existing print flow.
  }
  print();
}
