import { fetchJson } from "@/lib/clientFetch";

export async function fetchIccatTypes(params) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/iccat-types?${query.toString()}`);
}

export async function fetchProductsByIccat(iccatCode) {
  const params = new URLSearchParams();
  if (iccatCode) params.set("iccatCode", iccatCode);
  return fetchJson(`/api/products?${params.toString()}`);
}
