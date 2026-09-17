export function getEmployeeCodeMatchKey(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";

  const compact = raw.replace(/[^A-Z0-9]/g, "");
  if (!compact) return "";

  if (compact.startsWith("KPF") && compact.length > 3) {
    return compact.slice(3);
  }

  return compact;
}

export function normalizeEmployeeCode(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  return raw.replace(/\s+/g, "");
}

export function employeeCodesMatch(left, right) {
  const leftKey = getEmployeeCodeMatchKey(left);
  const rightKey = getEmployeeCodeMatchKey(right);
  return Boolean(leftKey && rightKey && leftKey === rightKey);
}

export function buildEmployeeCodeVariants(value) {
  const raw = String(value || "").trim().toUpperCase();
  const compactRaw = raw.replace(/\s+/g, "");
  const compactAlnum = raw.replace(/[^A-Z0-9]/g, "");
  const normalized = normalizeEmployeeCode(raw);
  const matchKey = getEmployeeCodeMatchKey(raw);
  const variants = new Set();

  if (compactRaw) variants.add(compactRaw);
  if (normalized) variants.add(normalized);
  if (matchKey) variants.add(matchKey);

  const shouldAddKpfVariants = /^\d+$/.test(matchKey) || compactAlnum.startsWith("KPF");
  if (shouldAddKpfVariants && matchKey) {
    variants.add(`KPF-${matchKey}`);
    variants.add(`KPF${matchKey}`);
  }

  return Array.from(variants).filter(Boolean);
}
