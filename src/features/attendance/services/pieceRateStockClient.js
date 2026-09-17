import { fetchJson } from "@/lib/clientFetch";

export async function fetchBiscuitFgProducts() {
  return fetchJson("/api/attendance/piece-rate/stock?action=biscuit-products", {
    cacheStrategy: "realtime",
  });
}

export async function fetchPieceRateStockDocument(barcode) {
  const query = new URLSearchParams({ barcode: String(barcode || "").trim() });
  return fetchJson(`/api/attendance/piece-rate/stock?${query.toString()}`, {
    cacheStrategy: "realtime",
  });
}

export async function fetchAvailablePieceRateStockLabels(productCode) {
  const query = new URLSearchParams({ action: "available-labels" });
  const normalizedProductCode = String(productCode || "").trim();
  if (normalizedProductCode) query.set("productCode", normalizedProductCode);
  return fetchJson(`/api/attendance/piece-rate/stock?${query.toString()}`, {
    cacheStrategy: "realtime",
  });
}

async function postPieceRateStockAction(path, payload) {
  return fetchJson(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cacheStrategy: "realtime",
  });
}

export function submitPieceRateStockIssue(payload) {
  return postPieceRateStockAction("/api/attendance/piece-rate/stock", payload);
}

export function submitPieceRateStockIssueBatch(payload) {
  return postPieceRateStockAction("/api/attendance/piece-rate/stock/batch", payload);
}

export function submitPieceRateStockReturn(payload) {
  return postPieceRateStockAction("/api/attendance/piece-rate/stock/return", payload);
}

export function submitPieceRateStockIssueCancellation(payload) {
  return postPieceRateStockAction("/api/attendance/piece-rate/stock/cancel", payload);
}

export function submitPieceRateWeighCancellation(payload) {
  return postPieceRateStockAction("/api/attendance/piece-rate/stock/cancel-weigh", payload);
}
