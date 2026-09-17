"use client";

async function parseJsonResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || "ไม่สามารถทำรายการคืนได้ในขณะนี้");
  }
  return payload?.data ?? payload;
}

export async function validateIssuedBarcodeRequest(barcode) {
  const response = await fetch(`/api/production-stock/returns?barcode=${encodeURIComponent(barcode)}`, {
    method: "GET",
    cache: "no-store",
  });

  return parseJsonResponse(response);
}

export async function loadReturnableIssuedItemsRequest({
  dateFrom = "",
  dateTo = "",
  search = "",
  productCodes = [],
  page = 1,
  limit = 50,
} = {}) {
  const searchParams = new URLSearchParams();
  searchParams.set("page", String(page));
  searchParams.set("limit", String(limit));
  if (dateFrom) searchParams.set("dateFrom", dateFrom);
  if (dateTo) searchParams.set("dateTo", dateTo);
  if (search) searchParams.set("search", search);
  if (Array.isArray(productCodes) && productCodes.length) {
    searchParams.set("productCodes", productCodes.join(","));
  }

  const response = await fetch(`/api/production-stock/returns?${searchParams.toString()}`, {
    method: "GET",
    cache: "no-store",
  });

  return parseJsonResponse(response);
}

export async function createStockReturnRequest(payload) {
  const response = await fetch("/api/production-stock/returns", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  return parseJsonResponse(response);
}
