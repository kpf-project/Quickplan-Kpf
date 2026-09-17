import { fetchJson } from "@/lib/clientFetch";

export async function submitAttendanceScanEvent(payload) {
  return fetchJson("/api/attendance/scan-event", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cacheStrategy: "realtime",
  });
}
