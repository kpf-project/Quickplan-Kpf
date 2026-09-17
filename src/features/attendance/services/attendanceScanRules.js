import {
  getEmployeeCodeMatchKey,
  normalizeEmployeeCode,
} from "../../../lib/employeeCode.js";

const BANGKOK_TIME_ZONE = "Asia/Bangkok";
const BANGKOK_OFFSET = "+07:00";
const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

function getDateKeyInBangkok(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: BANGKOK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const partMap = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${partMap.year}-${partMap.month}-${partMap.day}`;
}

export function getAttendanceEmployeeKey(value) {
  const key = getEmployeeCodeMatchKey(value);
  if (!key) return "";
  return /^\d+$/.test(key) ? key.padStart(5, "0") : key;
}

export function buildAttendanceEmployeeVariants(value) {
  const normalized = normalizeEmployeeCode(value);
  const key = getAttendanceEmployeeKey(value);
  const variants = new Set();

  if (normalized) variants.add(normalized);
  if (key) variants.add(key);
  if (/^\d+$/.test(key)) {
    variants.add(`KPF-${key}`);
    variants.add(`KPF${key}`);
  }

  return Array.from(variants).filter(Boolean);
}

export function getBangkokAttendanceDay(value = new Date()) {
  const dateKey = getDateKeyInBangkok(value);
  if (!dateKey) return null;

  const start = new Date(`${dateKey}T00:00:00${BANGKOK_OFFSET}`);
  return {
    dateKey,
    startIso: start.toISOString(),
    endIso: new Date(start.getTime() + DAY_IN_MILLISECONDS).toISOString(),
  };
}

export function getAttendanceDayState(rows = [], employeeCode) {
  const employeeKey = getAttendanceEmployeeKey(employeeCode);
  const acceptedRows = rows
    .filter((row) => {
      if (row?.status !== "accepted") return false;
      const rowEmployeeKey = getAttendanceEmployeeKey(
        row.employee_code_key || row.raw_qr_payload || row.employee_code
      );
      return Boolean(employeeKey && rowEmployeeKey === employeeKey);
    })
    .sort((left, right) => {
      const leftTime = new Date(left.scanned_at || 0).getTime();
      const rightTime = new Date(right.scanned_at || 0).getTime();
      return leftTime - rightTime;
    });

  return {
    inEvent: acceptedRows.find((row) => row.event_type === "IN") || null,
    outEvent: acceptedRows.find((row) => row.event_type === "OUT") || null,
  };
}

export function formatBangkokAttendanceTime(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  return new Intl.DateTimeFormat("en-GB", {
    timeZone: BANGKOK_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}
