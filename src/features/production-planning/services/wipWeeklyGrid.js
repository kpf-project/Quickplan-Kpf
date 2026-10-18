export function groupWeeklyDraftLines(lines) {
  const rows = [];
  for (const line of lines) {
    const key = line.skuCode ? JSON.stringify([line.skuCode, line.skuName, line.shiftId, line.shiftCode, line.shiftName, line.planningUnit, line.displayUnit, line.displayFactor, line.sourceSectionDefId, line.sourceSectionName, line.workstreamCode, line.mergePolicy, line.note, line.supplyMode]) : line.id;
    // Duplicate records on the same date remain independent; never sum editable cells.
    let row = rows.find(item => item.key === key && !item.lines.some(existing => existing.workDate === line.workDate));
    if (!row) { row = { key, id: line.id, lines: [] }; rows.push(row); }
    row.lines.push(line);
  }
  return rows;
}

export function planningDates(lines, range = {}) {
  const valid = value => /^\d{4}-\d{2}-\d{2}$/.test(value || "") && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  const dates = [...lines.map(line => String(line.workDate || "").slice(0, 10)), range.start, range.end].filter(valid).sort();
  if (!dates.length) return [];
  const result = [];
  const end = Date.parse(dates.at(-1));
  for (let day = Date.parse(dates[0]); day <= end; day += 86400000) result.push(new Date(day).toISOString().slice(0, 10));
  return result;
}

export function weeklyMaterialProjection(columns, materials, dates) {
  return materials.map(material => {
    const byDate = Object.fromEntries(dates.map(date => [date, 0]));
    for (const column of columns) {
      const date = String(column.workDate || "").slice(0, 10);
      if (date in byDate) byDate[date] += Number(material.values?.[column.key] || 0);
    }
    return { ...material, byDate, total: Object.values(byDate).reduce((sum, value) => sum + value, 0) };
  });
}

export function draftLineKg(line) {
  if (line.plannedQty === "" || line.plannedQty == null) return null;
  const qty = Number(line.plannedQty);
  if (!Number.isFinite(qty) || qty < 0) return null;
  const kg = unit => /^(kg|kgs|kilogram|kilograms|กก\.?|กิโลกรัม)$/i.test(String(unit || "").trim());
  if (kg(line.planningUnit)) return qty;
  if (/^(batch|batches|ชุด)$/i.test(line.planningUnit || "") && Number(line.kgPerBatch) > 0) return Number((qty * Number(line.kgPerBatch)).toFixed(3));
  const factor = Number(line.displayFactor);
  return kg(line.displayUnit) && factor > 0 && Number.isFinite(factor) ? Number((qty * factor).toFixed(3)) : null;
}
