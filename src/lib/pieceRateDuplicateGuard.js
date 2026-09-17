import { getEmployeeCodeMatchKey } from "./employeeCode.js";

export const PIECE_RATE_DUPLICATE_WINDOW_MS = 15 * 1000;
export const PIECE_RATE_DUPLICATE_WEIGHT_TOLERANCE_KG = 0.02;

function normalizeText(value) {
  const normalized = String(value || "").trim();
  return normalized ? normalized.toUpperCase() : "";
}

function parseWeight(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Number(parsed.toFixed(4));
}

function parseTimestamp(value) {
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}

function readCapturedAt(record) {
  return (
    record?.metadata?.scaleAudit?.capturedAt
    || record?.metadata_snapshot?.scaleAudit?.capturedAt
    || record?.scaleAudit?.capturedAt
    || record?.capturedAt
    || record?.logged_at
    || record?.loggedAt
    || record?.createdAt
    || null
  );
}

function normalizeRecord(record) {
  if (!record || typeof record !== "object") {
    return null;
  }

  const employeeCode = getEmployeeCodeMatchKey(record.employeeCode || record.employee_code);
  const productBarcode = normalizeText(
    record.productBarcode
      || record.product_barcode
      || record.product_barcode_snapshot
      || record.productBarcodeSnapshot
  );
  const machineCode = normalizeText(record.machineCode || record.machine_code);
  const source = normalizeText(record.source);
  const inputValue = parseWeight(record.inputValue ?? record.input_value);
  const capturedAtMs = parseTimestamp(readCapturedAt(record));

  if (!employeeCode || !productBarcode || inputValue === null || capturedAtMs === null) {
    return null;
  }

  return {
    employeeCode,
    productBarcode,
    machineCode,
    source,
    inputValue,
    capturedAtMs,
  };
}

export function isPieceRateBusinessDuplicate(candidate, existing, options = {}) {
  const duplicateWindowMs = Number(options.duplicateWindowMs || PIECE_RATE_DUPLICATE_WINDOW_MS);
  const weightToleranceKg = Number(
    options.weightToleranceKg ?? PIECE_RATE_DUPLICATE_WEIGHT_TOLERANCE_KG
  );

  const left = normalizeRecord(candidate);
  const right = normalizeRecord(existing);
  if (!left || !right) {
    return false;
  }

  if (left.employeeCode !== right.employeeCode) {
    return false;
  }
  if (left.productBarcode !== right.productBarcode) {
    return false;
  }
  if (left.machineCode && right.machineCode && left.machineCode !== right.machineCode) {
    return false;
  }
  if (left.source && right.source && left.source !== right.source) {
    return false;
  }
  if (Math.abs(left.inputValue - right.inputValue) > weightToleranceKg) {
    return false;
  }

  return Math.abs(left.capturedAtMs - right.capturedAtMs) <= duplicateWindowMs;
}

export function findPieceRateBusinessDuplicate(candidate, records = [], options = {}) {
  for (const record of records || []) {
    if (isPieceRateBusinessDuplicate(candidate, record, options)) {
      return record;
    }
  }
  return null;
}
