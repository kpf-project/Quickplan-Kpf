"use client";

async function parseJsonResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || "ไม่สามารถทำรายการของเสียได้ในขณะนี้");
  }
  return payload?.data ?? payload;
}

export async function validateWasteSourceBarcodeRequest(barcode) {
  const response = await fetch(`/api/production-stock/waste?barcode=${encodeURIComponent(barcode)}`, {
    method: "GET",
    cache: "no-store",
  });

  return parseJsonResponse(response);
}

export async function createStockWasteRequest(payload) {
  const response = await fetch("/api/production-stock/waste", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  return parseJsonResponse(response);
}
