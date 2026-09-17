function normalizedCode(value) {
  return String(value || "").trim().toUpperCase();
}

export function fillMissingFgProductNames(rows = [], productNameByCode = new Map()) {
  return rows.map((row) => {
    const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
    if (String(metadata.fgProductName || "").trim()) return row;

    const fgProductName = productNameByCode.get(normalizedCode(metadata.fgProductCode));
    if (!fgProductName) return row;
    return { ...row, metadata: { ...metadata, fgProductName } };
  });
}
