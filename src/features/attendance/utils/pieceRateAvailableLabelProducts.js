export function buildAvailableLabelProductOptions(labels = []) {
  const productsByCode = new Map();
  for (const row of labels) {
    const code = String(row?.productCode || "").trim();
    if (!code || productsByCode.has(code)) continue;
    productsByCode.set(code, {
      code,
      name: String(row?.productName || code).trim() || code,
    });
  }
  return Array.from(productsByCode.values()).sort((left, right) => (
    left.code.localeCompare(right.code, "th-TH")
  ));
}
