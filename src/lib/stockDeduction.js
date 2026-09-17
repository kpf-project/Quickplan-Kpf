/**
 * Stock deduction is intentionally disabled.
 * ERP becomes the single source of truth after requisitions are imported there.
 */

export function applyDeductionToSummary(materials) {
  return materials;
}

export function applyDeductionToLots(materials) {
  return materials;
}

export async function applyStockDeduction(rawMaterials) {
  return rawMaterials;
}

export function clearIssuedCache() {}
