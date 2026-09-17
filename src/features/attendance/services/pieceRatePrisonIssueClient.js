async function parseResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "ไม่สามารถดำเนินการเบิกเนื้อขนมเรือนจำได้");
  return payload;
}

export function fetchPieceRatePrisonIssueLots() {
  return fetch("/api/attendance/piece-rate/prison-issues", { cache: "no-store" }).then(parseResponse);
}

export function submitPieceRatePrisonIssue(payload) {
  return fetch("/api/attendance/piece-rate/prison-issues", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...payload, requestId: crypto.randomUUID() }),
  }).then(parseResponse);
}
