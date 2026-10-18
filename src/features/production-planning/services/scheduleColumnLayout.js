export function standardWidth(column) {
  if (column.col_type === "sku_picker" || /sku|product/i.test(column.key || "")) return 340;
  if (column.col_type === "brand_auto") return 90;
  if (column.col_type === "formula") return 100;
  if (["time", "shift"].includes(column.col_type)) return 160;
  if (/note|หมายเหตุ/i.test(`${column.key} ${column.label}`)) return 180;
  if (/people|จำนวนคน/i.test(`${column.key} ${column.label}`)) return 80;
  if (/people|machine|คน|เครื่อง|size|ไซส์|รุ่น|models|lot|เตา/i.test(`${column.key} ${column.label}`)) return 90;
  if (column.col_type === "number") return 100;
  return 120;
}

export function columnWidth(column) {
  const width = Number(column.width);
  return Number.isFinite(width) && width >= 48 ? Math.min(1200, Math.round(width)) : standardWidth(column);
}

export function tableWidth(columns, showDate, showActions, dateWidth = 160) {
  return columns.reduce((sum, column) => sum + columnWidth(column), 0) + (showDate ? dateWidth : 0) + (showActions ? 28 : 0);
}
