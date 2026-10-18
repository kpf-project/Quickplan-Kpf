import { normalizeHighlightColor } from "../features/production-planning/services/scheduleHighlightColors.js";

export const formulaLayoutKey = id => `production_schedule.formula_layout.${id}`;
export const formulaColumnId = skuId => `formula:${skuId}`;

export function normalizeFormulaLayout(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("รูปแบบคอลัมน์สูตรไม่ถูกต้อง");
  const result = {};
  for (const [id, item] of Object.entries(value)) {
    if (!id.startsWith("formula:") || !item || typeof item !== "object") throw new Error("คอลัมน์สูตรไม่ถูกต้อง");
    const width = Number(item.width ?? 100);
    const order = Number(item.display_order ?? 0);
    const label = String(item.label ?? "สูตร").trim();
    if (!Number.isInteger(width) || width < 48 || width > 1200 || !Number.isFinite(order) || !label || label.length > 120) throw new Error("ชื่อหรือความกว้างคอลัมน์สูตรไม่ถูกต้อง");
    if (item.highlight_color && !normalizeHighlightColor(item.highlight_color)) throw new Error("สีคอลัมน์สูตรไม่ถูกต้อง");
    result[id] = { width, label, display_order: order, highlight_color: normalizeHighlightColor(item.highlight_color) };
  }
  return result;
}

export function scheduleColumnsWithFormula(columns = [], layout = {}) {
  if (columns.some(col => col.col_type === "formula")) return [...columns].sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0));
  const result = [];
  for (const col of columns) {
    result.push(col);
    if (col.col_type !== "sku_picker") continue;
    const id = formulaColumnId(col.id);
    result.push({ id, key: id, col_type: "formula", sku_key: col.key, label: "สูตร", width: 100, display_order: Number(col.display_order || 0) + 0.1, ...layout[id] });
  }
  return result.sort((a, b) => Number(a.display_order || 0) - Number(b.display_order || 0));
}

export function formulaCellCode(row = {}) {
  return String(row.formulaCode || row.formula_code || "").trim();
}

export function formulaCellPatch(formula) {
  return { formulaCode: formula.formula_code, formulaName: formula.formula_name || formula.formula_code, bomVersionId: formula.bom_version_id || null, formula_code: formula.formula_code, formula_name: formula.formula_name || formula.formula_code, bom_version_id: formula.bom_version_id || null };
}
