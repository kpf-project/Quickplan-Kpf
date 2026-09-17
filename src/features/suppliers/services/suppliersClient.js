import { fetchJson } from "@/lib/clientFetch";

export async function fetchSuppliers(params) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/suppliers?${query.toString()}`);
}
