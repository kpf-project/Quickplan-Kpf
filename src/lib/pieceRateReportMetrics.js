// Report quantities are not the entry multiplier used when calculating wages.
export function resolvePieceRateReportMetrics(row) {
  const entryCountValue = Number(row.count_value_snapshot || 1);
  const normalizedKgAmount = Number(row.normalized_kg_amount_snapshot || 0);
  if (String(row.input_mode_snapshot || "").trim().toLowerCase() !== "pail") {
    return { entryCountValue, countValue: entryCountValue, normalizedKgAmount };
  }

  const countValue = Number(row.input_value || 0);
  const weightKg = Number(row.weight_kg_snapshot || row.kg_per_pail_snapshot || 0);
  return {
    entryCountValue,
    countValue,
    normalizedKgAmount: Number.isFinite(weightKg) && weightKg > 0
      ? Number((countValue * weightKg).toFixed(4))
      : normalizedKgAmount,
  };
}
