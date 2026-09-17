export const DEFAULT_SHIFT_CODE_1 = "SHIFT1";
export const DEFAULT_SHIFT_CODE_2 = "SHIFT2";

export function normalizeShiftCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return null;
  return normalized.replace(/[^A-Z0-9_-]/g, "").slice(0, 32) || null;
}

export function normalizeShiftName(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

export function normalizeShiftTime(value) {
  const normalized = String(value || "").trim();
  const matched = normalized.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!matched) return null;
  return `${matched[1]}:${matched[2]}`;
}

export function normalizeShiftSortOrder(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(9999, Math.max(0, parsed));
}

export function inferCrossesMidnight(startTime, endTime) {
  const start = normalizeShiftTime(startTime);
  const end = normalizeShiftTime(endTime);
  if (!start || !end) return false;
  return end < start;
}

export function buildShiftLabel(shift) {
  const code = String(shift?.code || shift?.shift_code || "").trim().toUpperCase();
  const name = String(shift?.name || shift?.shift_name || "").trim();
  if (code && name) return `[${code}] ${name}`;
  return name || code || "-";
}

export function mapShiftSummary(row) {
  const mapped = mapShiftRow(row);
  return {
    shiftId: mapped.id,
    shiftCode: mapped.code,
    shiftName: mapped.name,
    shiftLabel: mapped.label,
    shiftStartTime: mapped.startTime,
    shiftEndTime: mapped.endTime,
    shiftCrossesMidnight: mapped.crossesMidnight,
  };
}

export function mapShiftRow(row) {
  const startTime = normalizeShiftTime(row?.start_time || row?.startTime);
  const endTime = normalizeShiftTime(row?.end_time || row?.endTime);
  const code = normalizeShiftCode(row?.code || row?.shift_code || row?.shiftCode);
  const name = normalizeShiftName(row?.name || row?.shift_name || row?.shiftName);
  return {
    id: row?.id || null,
    code,
    name,
    startTime,
    endTime,
    crossesMidnight: row?.crosses_midnight === true || row?.crossesMidnight === true || inferCrossesMidnight(startTime, endTime),
    sortOrder: normalizeShiftSortOrder(row?.sort_order ?? row?.sortOrder, 0),
    isActive: row?.is_active !== false && row?.isActive !== false,
    label: buildShiftLabel({ code, name }),
  };
}

export function findMatchingShift(shifts = [], { shiftId = null, shiftCode = null, workStartTime = null, workEndTime = null } = {}) {
  const normalizedId = String(shiftId || "").trim();
  const normalizedCode = normalizeShiftCode(shiftCode);
  const normalizedStart = normalizeShiftTime(workStartTime);
  const normalizedEnd = normalizeShiftTime(workEndTime);
  const rows = Array.isArray(shifts) ? shifts.map(mapShiftRow) : [];

  if (normalizedId) {
    const found = rows.find((row) => String(row.id || "").trim() === normalizedId);
    if (found) return found;
  }
  if (normalizedCode) {
    const found = rows.find((row) => row.code === normalizedCode);
    if (found) return found;
  }
  if (normalizedStart || normalizedEnd) {
    const found = rows.find((row) => row.startTime === normalizedStart && row.endTime === normalizedEnd);
    if (found) return found;
  }
  return null;
}
