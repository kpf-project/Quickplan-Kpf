const MAX_SORT_ORDER = 9999;

function normalizeText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeUpperCode(value) {
  const normalized = normalizeText(value);
  return normalized ? normalized.toUpperCase() : null;
}

function normalizeSortOrder(value) {
  const parsed = Number.parseInt(String(value ?? "0"), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  if (parsed > MAX_SORT_ORDER) return MAX_SORT_ORDER;
  return parsed;
}

function normalizeBoolean(value, fallback = true) {
  if (value === true || value === false) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export function normalizeDeliveryPointInput(input = {}) {
  const code = normalizeUpperCode(input.code);
  const name = normalizeText(input.name);
  const description = normalizeText(input.description);
  const sortOrder = normalizeSortOrder(input.sortOrder ?? input.sort_order);
  const isActive = normalizeBoolean(input.isActive ?? input.is_active, true);
  const errors = [];

  if (!code) errors.push("code is required");
  if (!name) errors.push("name is required");

  return {
    code,
    name,
    description,
    sortOrder,
    isActive,
    errors,
  };
}

export function normalizeDeliveryPointQuery(query = {}) {
  return {
    search: normalizeText(query.search) || "",
    includeInactive: query.includeInactive === true || query.includeInactive === "true",
  };
}

export function mapDeliveryPointRow(row = {}) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    description: row.description || "",
    sort_order: Number(row.sort_order ?? 0),
    is_active: Boolean(row.is_active),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
