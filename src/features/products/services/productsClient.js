import { fetchJson } from "@/lib/clientFetch";

export async function fetchProducts(params) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/products?${query.toString()}`);
}

export async function fetchIccatTypes(params) {
  const query = new URLSearchParams(params);
  const suffix = query.toString();
  const url = suffix ? `/api/iccat-types?${suffix}` : "/api/iccat-types";
  return fetchJson(url);
}

export async function fetchTradeCodes(params) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/trade-codes?${query.toString()}`);
}

export async function fetchBrandTypes() {
  return fetchJson("/api/brand-types");
}
