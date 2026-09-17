import { fetchJson } from "@/lib/clientFetch";

export async function fetchRawMaterials(params) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/raw-materials?${query.toString()}`);
}

export async function fetchRawMaterialsSummary(params) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/raw-materials-summary?${query.toString()}`);
}

export async function fetchRawMaterialsMovement(params) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/raw-materials-movement?${query.toString()}`);
}

export async function fetchRawMaterialLotCosts(params) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/raw-material-lot-costs?${query.toString()}`, { cache: "no-store" });
}

export async function fetchRawMaterialReceipts(params) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/raw-material-receipts?${query.toString()}`, { cache: "no-store" });
}

export async function fetchProductionReceipts(params) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/production-receipts?${query.toString()}`, { cache: "no-store" });
}

export async function fetchRawMaterialReturns(params) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/raw-material-returns?${query.toString()}`);
}

// New function for FIFO deduction
export async function fetchRawMaterialsWithDeduction(params) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/raw-materials-with-deduction?${query.toString()}`);
}
