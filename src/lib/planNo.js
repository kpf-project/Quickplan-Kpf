const MASTER_PLAN_NO_DASHED_REGEX = /^MP-(\d{4})-(\d{2})-(\d{3})$/i;
const MASTER_PLAN_NO_COMPACT_REGEX = /^MP(\d{4})(\d{2})(\d{3})$/i;
const SUB_PLAN_NO_REGEX = /^SP-(\d{4})-(\d{2})-(\d{3})-([A-Z0-9_]{2,32})(-BO)?$/i;
const LEGACY_MASTER_REGEX = /^MP-(\d{8})-(\d{8})$/i;

function pad(value, size) {
  const normalized = String(Math.max(0, Number(value) || 0));
  return normalized.padStart(size, "0");
}

function normalizeDateOnly(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return raw;
}

function getYearMonthParts(dateInput) {
  const normalized = normalizeDateOnly(dateInput);
  if (!normalized) return null;
  const [yearRaw, monthRaw] = normalized.split("-");
  return {
    year: Number(yearRaw),
    month: Number(monthRaw),
  };
}

export function makeMasterPlanPrefix(dateInput) {
  const parts = getYearMonthParts(dateInput);
  if (!parts) return null;
  return `MP${parts.year}${pad(parts.month, 2)}`;
}

export function buildMasterPlanNo(dateInput, sequence = 1) {
  const prefix = makeMasterPlanPrefix(dateInput);
  if (!prefix) return null;
  return `${prefix}${pad(sequence, 3)}`;
}

function parseMasterPlanNoParts(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return null;

  const dashedMatch = normalized.match(MASTER_PLAN_NO_DASHED_REGEX);
  if (dashedMatch) {
    return {
      normalized,
      year: dashedMatch[1],
      month: dashedMatch[2],
      sequence: dashedMatch[3],
      subPlanSegment: `${dashedMatch[1]}-${dashedMatch[2]}-${dashedMatch[3]}`,
    };
  }

  const compactMatch = normalized.match(MASTER_PLAN_NO_COMPACT_REGEX);
  if (compactMatch) {
    return {
      normalized,
      year: compactMatch[1],
      month: compactMatch[2],
      sequence: compactMatch[3],
      subPlanSegment: `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`,
    };
  }

  return null;
}

export function isValidMasterPlanNo(value) {
  return Boolean(parseMasterPlanNoParts(value));
}

export function extractMasterPlanSequence(value) {
  const parts = parseMasterPlanNoParts(value);
  if (!parts) return null;
  const sequence = Number(parts.sequence);
  return Number.isFinite(sequence) ? sequence : null;
}

export function normalizeDepartmentCodeForPlanNo(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "")
    .slice(0, 32);
}

function normalizeLegacyMasterPlanNo(value) {
  const normalized = String(value || "").trim().toUpperCase();
  const matched = normalized.match(LEGACY_MASTER_REGEX);
  if (!matched) return null;
  const startRaw = matched[1];
  const startDate = `${startRaw.slice(0, 4)}-${startRaw.slice(4, 6)}-${startRaw.slice(6, 8)}`;
  return buildMasterPlanNo(startDate, 1);
}

export function normalizeMasterPlanNo(value, fallbackDate = null, fallbackSequence = 1) {
  const normalized = String(value || "").trim().toUpperCase();
  const parsed = parseMasterPlanNoParts(normalized);
  if (parsed) {
    return `MP${parsed.year}${parsed.month}${parsed.sequence}`;
  }

  const legacy = normalizeLegacyMasterPlanNo(normalized);
  if (legacy) return legacy;

  if (!normalized && fallbackDate) {
    return buildMasterPlanNo(fallbackDate, fallbackSequence);
  }
  return null;
}

export function buildSubPlanNo(masterPlanNo, departmentCode, { backorder = false } = {}) {
  const normalizedMaster = normalizeMasterPlanNo(masterPlanNo);
  const parsedMaster = parseMasterPlanNoParts(normalizedMaster);
  if (!parsedMaster) return null;
  const normalizedDept = normalizeDepartmentCodeForPlanNo(departmentCode) || "UNASSIGNED";
  const suffix = backorder ? "-BO" : "";
  return `SP-${parsedMaster.subPlanSegment}-${normalizedDept}${suffix}`;
}

export function buildDatedSubPlanNo(masterPlanNo, departmentCode, workDate, options = {}) {
  const normalizedDate = normalizeDateOnly(workDate);
  const normalizedDept = normalizeDepartmentCodeForPlanNo(departmentCode) || "UNASSIGNED";
  if (!normalizedDate) {
    return buildSubPlanNo(masterPlanNo, normalizedDept, options);
  }
  const compactDate = normalizedDate.replace(/-/g, "");
  return buildSubPlanNo(masterPlanNo, `${normalizedDept}_${compactDate}`, options);
}

export function isValidSubPlanNo(value) {
  return SUB_PLAN_NO_REGEX.test(String(value || "").trim().toUpperCase());
}

export function normalizeSubPlanNo(value, { masterPlanNo = null, departmentCode = null, backorder = false } = {}) {
  const normalized = String(value || "").trim().toUpperCase();
  if (isValidSubPlanNo(normalized)) return normalized;
  if (masterPlanNo) {
    return buildSubPlanNo(masterPlanNo, departmentCode, { backorder });
  }
  return null;
}

export function getMasterPlanNoRegexSource() {
  return "^MP[0-9]{9}$";
}

export function getSubPlanNoRegexSource() {
  return "^SP-[0-9]{4}-[0-9]{2}-[0-9]{3}-[A-Z0-9_]{2,32}(-BO)?$";
}
