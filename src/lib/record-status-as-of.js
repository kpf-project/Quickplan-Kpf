export function toBangkokReportCutoffIso(date) {
  const value = String(date || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const nextDate = new Date(`${value}T00:00:00.000Z`);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  return `${nextDate.toISOString().slice(0, 10)}T23:59:59.999+07:00`;
}

export function isRecordActiveAt(status, voidedAt, cutoff, createdAt = null, restoredAt = null) {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  const cutoffTime = Date.parse(String(cutoff || ""));
  const createdTime = Date.parse(String(createdAt || ""));
  const restoredTime = Date.parse(String(restoredAt || ""));
  if (Number.isFinite(cutoffTime)) {
    if (Number.isFinite(createdTime) && createdTime > cutoffTime) return false;
    if (Number.isFinite(restoredTime) && restoredTime > cutoffTime) return false;
  }
  if (["confirmed", "recorded"].includes(normalizedStatus)) return true;
  if (normalizedStatus !== "voided") return false;

  const voidedTime = Date.parse(String(voidedAt || ""));
  return Number.isFinite(voidedTime) && Number.isFinite(cutoffTime) && voidedTime > cutoffTime;
}
