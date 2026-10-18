import { formulaLayoutKey, normalizeFormulaLayout } from "./scheduleFormulaLayout.js";
import { columnColorsKey, normalizeColumnColors, normalizeColorPair } from "./scheduleColumnColors.js";

export const DATE_COLUMN_ID = "__schedule_date__";
export const dateLayoutKey = id => `production_schedule.date_layout.${id}`;
export function normalizeDateLayout(value = {}) {
  const width = Number(value?.width ?? 160);
  if (!Number.isInteger(width) || width < 48 || width > 1200) throw new Error("ความกว้างวันที่ต้องเป็น 48–1200 px");
  return { width, headerColor: null, bodyColor: null, ...normalizeColorPair(value) };
}
export async function attachDateLayouts(db, sections = []) {
  if (!sections.length) return sections;
  const { data, error } = await db.from("system_settings").select("setting_key,setting_value").in("setting_key", sections.flatMap(section => [dateLayoutKey(section.id), formulaLayoutKey(section.id), columnColorsKey(section.id)]));
  if (error) throw error;
  return sections.map(section => ({ ...section, date_layout: normalizeDateLayout(data?.find(row => row.setting_key === dateLayoutKey(section.id))?.setting_value), formula_layout: normalizeFormulaLayout(data?.find(row => row.setting_key === formulaLayoutKey(section.id))?.setting_value), column_colors: normalizeColumnColors(data?.find(row => row.setting_key === columnColorsKey(section.id))?.setting_value) }));
}
