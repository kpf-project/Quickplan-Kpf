import { fetchJson } from "@/lib/clientFetch";

export async function fetchAttendance(params) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/attendance?${query.toString()}`);
}
