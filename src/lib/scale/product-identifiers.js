export function validateScaleProductIdentifiers(rows) {
  if (!Array.isArray(rows)) throw new Error("Product identifier mappings are required");
  const products = new Map();
  const identifiers = new Map();
  for (const row of rows) {
    const code = typeof row?.productCode === "string" ? row.productCode.trim().toUpperCase() : "";
    const digits = row?.productDigits;
    if (!code || typeof digits !== "string" || !/^\d{4}$/.test(digits) || digits === "0000") {
      throw new Error("Each product requires an explicit nonzero four-digit identifier");
    }
    if (products.has(code)) throw new Error("Duplicate product mapping: " + code);
    if (identifiers.has(digits)) throw new Error("Product identifier already assigned: " + digits);
    products.set(code, digits);
    identifiers.set(digits, code);
  }
  return products;
}
