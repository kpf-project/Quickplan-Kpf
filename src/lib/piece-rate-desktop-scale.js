export function normalizeDesktopScaleReading(payload = {}, fallbackAtMs = Date.now()) {
  if (payload?.weightKg === null || payload?.weightKg === undefined) {
    return null;
  }
  const weightKg = Number(payload?.weightKg);
  if (!Number.isFinite(weightKg)) {
    return null;
  }

  const parsedAtMs = Date.parse(payload?.at);
  const atMs = Number.isFinite(parsedAtMs) ? parsedAtMs : fallbackAtMs;

  return {
    weightKg,
    unit: String(payload?.unit || "kg"),
    raw: String(payload?.raw || ""),
    at: payload?.at || new Date(atMs).toISOString(),
    atMs,
    stable: typeof payload?.stable === "boolean" ? payload.stable : null,
  };
}

export function isDesktopScaleWindowStable(readings = []) {
  if (readings.length < 5) return false;
  const last = readings[readings.length - 1];
  const windowReadings = readings.filter((reading) => last.atMs - reading.atMs <= 3000);
  if (windowReadings.length < 5) return false;
  if (last.atMs - windowReadings[0].atMs < 1500) return false;
  const weights = windowReadings.map((reading) => Number(reading.weightKg));
  return Math.max(...weights) - Math.min(...weights) <= 0.002;
}

export function resolveDesktopScaleStableWeight({
  readings = [],
  deviceStable = null,
  previousStableWeightKg = null,
  currentWeightKg = null,
} = {}) {
  const current = Number(currentWeightKg);
  if (!Number.isFinite(current)) return null;
  if (deviceStable === true || isDesktopScaleWindowStable(readings)) return current;

  const previous = Number(previousStableWeightKg);
  if (Number.isFinite(previous) && Math.abs(current - previous) <= 0.002) return previous;
  return null;
}

export function evaluateDesktopPieceRateReadiness({
  hasProduct,
  hasEmployee,
  agentConnected,
  portOpen,
  isReadingFresh,
  isStable,
  weightKg,
} = {}) {
  if (!hasProduct) return { canSave: false, reason: "กรุณาสแกนสินค้า" };
  if (!hasEmployee) return { canSave: false, reason: "กรุณาสแกนพนักงาน" };
  if (!agentConnected || portOpen === false) {
    return { canSave: false, reason: "เครื่องชั่งยังไม่เชื่อมต่อ" };
  }
  if (!isReadingFresh) return { canSave: false, reason: "ยังไม่ได้รับน้ำหนักล่าสุด" };
  if (!isStable) return { canSave: false, reason: "กรุณารอให้น้ำหนักนิ่ง" };
  if (!Number.isFinite(Number(weightKg)) || Number(weightKg) <= 0) {
    return { canSave: false, reason: "น้ำหนักต้องมากกว่า 0" };
  }
  return { canSave: true, reason: "" };
}
