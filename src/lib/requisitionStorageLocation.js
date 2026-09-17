function normalizeCode(value) {
  return String(value || "").trim().toUpperCase();
}

export function isWipRequisitionMaterial({
  itemType,
  categoryCode,
  materialSkuCode,
  materialGoodsCode,
} = {}) {
  if (normalizeCode(itemType) === "WIP") return true;
  if (normalizeCode(categoryCode) === "03") return true;

  return [materialSkuCode, materialGoodsCode]
    .map(normalizeCode)
    .some((code) => (
      code === "WK"
      || code.startsWith("WK-")
      || code === "WKB"
      || code.startsWith("WKB-")
    ));
}

export function resolveRequisitionStorageLocation(material = {}) {
  return isWipRequisitionMaterial(material) ? "02" : "04";
}
