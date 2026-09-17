async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "ไม่สามารถดำเนินการรับเข้าเรือนจำได้");
  return payload;
}

export async function fetchPieceRatePrisonReceipts() {
  return parseResponse(await fetch("/api/attendance/piece-rate/prison-receipts", { cache: "no-store" }));
}

export async function submitPieceRatePrisonReceipt(items) {
  return parseResponse(await fetch("/api/attendance/piece-rate/prison-receipts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId: crypto.randomUUID(), items }),
  }));
}
