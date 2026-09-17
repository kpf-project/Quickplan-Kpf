const CALCULATION_BASES = new Set([
  "JOB_QTY",
  "HEADCOUNT",
  "MACHINE_COUNT",
  "DOUGH_SET_COUNT",
]);

const BASE_FIELD_BY_CALCULATION_BASIS = {
  HEADCOUNT: "headcountBase",
  MACHINE_COUNT: "machineBase",
  DOUGH_SET_COUNT: "doughSetBase",
};

export function applyBomBulkEdit(rows = [], selectedRowIds = new Set(), values = {}) {
  const calculationBasis = String(values?.calculationBasis || "").trim().toUpperCase();
  const baseField = BASE_FIELD_BY_CALCULATION_BASIS[calculationBasis];
  const baseValue = Number(values?.baseValue);
  if (
    !CALCULATION_BASES.has(calculationBasis)
    || (baseField && (!Number.isFinite(baseValue) || baseValue <= 0))
  ) {
    return rows;
  }

  return rows.map((row) => selectedRowIds.has(row?.id)
    ? { ...row, calculationBasis, ...(baseField ? { [baseField]: baseValue } : {}) }
    : row);
}

export function removeSelectedBomRows(rows = [], selectedRowIds = new Set()) {
  return rows.filter((row) => !selectedRowIds.has(row?.id));
}
