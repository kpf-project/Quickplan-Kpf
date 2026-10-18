import { normalizeHighlightColor } from "../features/production-planning/services/scheduleHighlightColors.js";

export const columnColorsKey = id => `production_schedule.column_colors.${id}`;

export function normalizeColorPair(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("รูปแบบสีคอลัมน์ไม่ถูกต้อง");
  const result = {};
  for (const key of ["headerColor", "bodyColor"]) {
    if (!Object.hasOwn(value, key)) continue;
    if (value[key] != null && value[key] !== "" && !normalizeHighlightColor(value[key])) throw new Error("รหัสสีคอลัมน์ไม่ถูกต้อง");
    result[key] = normalizeHighlightColor(value[key]);
  }
  return result;
}

export function normalizeColumnColors(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("รูปแบบสีคอลัมน์ไม่ถูกต้อง");
  return Object.fromEntries(Object.entries(value).map(([id, pair]) => [id, normalizeColorPair(pair)]));
}

export function applyColumnColors(columns = [], settings = {}) {
  return columns.map(col => {
    const pair = settings[col.id] || {};
    return { ...col, header_color_explicit: Boolean(col.header_color_explicit || Object.hasOwn(pair, "headerColor")), header_highlight_color: Object.hasOwn(pair, "headerColor") ? pair.headerColor : Object.hasOwn(col, "header_highlight_color") ? col.header_highlight_color : col.highlight_color, highlight_color: Object.hasOwn(pair, "bodyColor") ? pair.bodyColor : col.highlight_color };
  });
}
