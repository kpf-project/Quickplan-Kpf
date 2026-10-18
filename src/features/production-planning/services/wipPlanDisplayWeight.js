export function wipPlanWeightVersion(line, versions, boms) {
  const normalize = value => String(value || "").trim().toUpperCase();
  const bomIds = new Set(boms.filter(bom => normalize(bom.sku_code) === normalize(line.skuCode)).map(bom => bom.id));
  if (line.bomVersionId) return versions.find(version => version.id === line.bomVersionId && bomIds.has(version.bom_id)) || null;
  const formula = normalize(line.formulaCode) || "DEFAULT";
  return versions.reduce((selected, version) => {
    if (!bomIds.has(version.bom_id) || version.status !== "approved" || (normalize(version.formula_code) || "DEFAULT") !== formula) return selected;
    return !selected || Number(version.version_no) > Number(selected.version_no) ? version : selected;
  }, null);
}

export function wipPlanKgPerBatch(version, skuCode, bomSkuCode, unit) {
  const normalize = value => String(value || "").trim().toUpperCase();
  if (!normalize(skuCode) || normalize(skuCode) !== normalize(bomSkuCode)) return null;
  if (!["KG", "KGS", "KILOGRAM", "KILOGRAMS", "กก", "กก.", "กิโลกรัม"].includes(normalize(unit))) return null;
  const base = Number(version?.base_batch), output = Number(version?.base_output_boxes);
  return Number.isFinite(base) && base > 0 && Number.isFinite(output) && output > 0 ? output / base : null;
}

export function wipPlanDisplayKg(line) {
  const qty = Number(line?.plannedQty);
  if (!Number.isFinite(qty) || qty < 0) return null;
  const unit = String(line?.planningUnit || line?.unit || "").trim().toUpperCase();
  if (["KG", "KGS", "KILOGRAM", "KILOGRAMS", "กก", "กก.", "กิโลกรัม"].includes(unit)) return qty;
  if (!["BATCH", "BATCHES", "ชุด"].includes(unit)) return null;
  const ratio = Number(line?.kgPerBatch);
  return Number.isFinite(ratio) && ratio > 0 ? Number((qty * ratio).toFixed(3)) : null;
}
