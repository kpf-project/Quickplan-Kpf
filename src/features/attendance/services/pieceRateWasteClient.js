"use client";

import { fetchJson } from "@/lib/clientFetch";

export async function submitPieceRateWasteLog(payload) {
  return fetchJson("/api/attendance/piece-rate/waste", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cacheStrategy: "realtime",
  });
}

