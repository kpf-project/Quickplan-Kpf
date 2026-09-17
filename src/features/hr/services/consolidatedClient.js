import { fetchJson } from "@/lib/clientFetch";

export async function fetchConsolidated(params) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/consolidated?${query.toString()}`);
}
