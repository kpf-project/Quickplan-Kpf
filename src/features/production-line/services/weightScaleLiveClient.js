"use client";

async function parseJsonResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.error || "Live scale request failed.");
  }
  return payload?.data ?? payload;
}

export async function saveWeightScaleLiveReceipt(payload) {
  const response = await fetch("/api/scale/live/receipts", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    cache: "no-store",
    body: JSON.stringify(payload),
  });

  return parseJsonResponse(response);
}
