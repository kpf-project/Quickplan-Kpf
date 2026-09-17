export function normalizeParam(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = String(value).trim();
  if (!trimmed || trimmed.toLowerCase() === "all") {
    return null;
  }
  return trimmed;
}

export function normalizeCsvParam(value) {
  const normalized = normalizeParam(value);
  if (!normalized) {
    return null;
  }
  return normalized
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .join(",");
}

export function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

export function parsePaginationParams(searchParams, defaults = {}) {
  const page = parsePositiveInt(
    searchParams.get("page") ?? defaults.page ?? "1",
    defaults.page ?? 1
  );
  const pageSize = parsePositiveInt(
    searchParams.get("pageSize") ?? defaults.pageSize ?? "100",
    defaults.pageSize ?? 100
  );
  return { page, pageSize };
}
