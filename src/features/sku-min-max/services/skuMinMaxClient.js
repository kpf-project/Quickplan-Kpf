import { fetchJson } from "@/lib/clientFetch";

export async function fetchSkuMinMax(params) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/sku-min-max?${query.toString()}`);
}
