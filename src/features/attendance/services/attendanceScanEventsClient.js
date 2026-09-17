import { fetchJson } from "@/lib/clientFetch";

export async function fetchAttendanceScanEvents(params) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/attendance/scan-events?${query.toString()}`, {
    cacheStrategy: "realtime",
  });
}
