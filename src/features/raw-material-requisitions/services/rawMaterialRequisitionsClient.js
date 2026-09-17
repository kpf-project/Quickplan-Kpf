import { fetchJson } from "@/lib/clientFetch";

export async function fetchRawMaterialRequisitions(params, endpoint = "/api/raw-material-requisitions", options = {}) {
  const query = new URLSearchParams(params);
  return fetchJson(`${endpoint}?${query.toString()}`, options);
}
