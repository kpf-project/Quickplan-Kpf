const RECEIPT_ITEM_STATUSES = new Set(["available", "issued", "voided"]);

export function normalizeScaleReceiptReportStatus(value) {
  const normalizedValue = String(value || "").trim().toLowerCase();

  if (normalizedValue === "voided") {
    return "voided";
  }

  if (normalizedValue === "confirmed") {
    return "confirmed";
  }

  if (RECEIPT_ITEM_STATUSES.has(normalizedValue)) {
    return normalizedValue;
  }

  return "confirmed";
}

export function matchesScaleReceiptReportStatus(itemStatus, reportStatus) {
  const normalizedItemStatus = String(itemStatus || "").trim().toLowerCase();
  const normalizedReportStatus = normalizeScaleReceiptReportStatus(reportStatus);

  if (normalizedReportStatus === "confirmed") {
    return normalizedItemStatus === "available" || normalizedItemStatus === "issued";
  }

  return normalizedItemStatus === normalizedReportStatus;
}
