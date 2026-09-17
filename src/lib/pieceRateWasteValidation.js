const MACHINE_CODE_REGEX = /^[A-Z0-9]{2,8}$/;

export function normalizePositiveWasteWeight(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new RangeError("น้ำหนักของเสียต้องมากกว่า 0");
  }
  return Number(parsed.toFixed(3));
}

export function normalizeWasteMachineCode(value) {
  const normalized = String(value ?? "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  return MACHINE_CODE_REGEX.test(normalized) ? normalized : null;
}

