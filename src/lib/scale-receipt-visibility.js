export function isActiveScaleReceipt(receipt) {
  return String(receipt?.status || "").trim().toLowerCase() === "recorded";
}

export function resolveActiveReceiptCount(summaryCount, receipts = []) {
  if (summaryCount !== null && summaryCount !== undefined && Number.isFinite(Number(summaryCount))) {
    return Number(summaryCount);
  }
  return receipts.filter((receipt) => isActiveScaleReceipt(receipt) && !receipt.isTest).length;
}

// Re-read persisted status before reprinting; do not trust an already-open tab.
export async function assertReceiptCanReprint(receipt, loadReport) {
  if (!isActiveScaleReceipt(receipt)) {
    throw new Error("รายการรับเข้านี้ถูกยกเลิกหรือไม่พร้อมพิมพ์ซ้ำ");
  }
  const timestamp = Date.parse(receipt?.weighedAt);
  if (!receipt?.id || !receipt?.barcode || !Number.isFinite(timestamp)) {
    throw new Error("ข้อมูลรายการไม่ครบ กรุณาโหลดรายการใหม่ก่อนพิมพ์ซ้ำ");
  }
  const day = 24 * 60 * 60 * 1000;
  const payload = await loadReport({
    dateFrom: new Date(timestamp - day).toISOString().slice(0, 10),
    dateTo: new Date(timestamp + day).toISOString().slice(0, 10),
    search: receipt.barcode,
    itemStatus: "confirmed",
    includeAll: true,
  });
  if (!payload?.receipts?.some((row) => row.id === receipt.id && isActiveScaleReceipt(row))) {
    throw new Error("รายการรับเข้านี้ถูกยกเลิกหรือไม่พร้อมพิมพ์ซ้ำ กรุณาโหลดรายการใหม่");
  }
}
