function csvCell(value) {
  if (value == null) return "";
  const text = typeof value === "string" && /^[=+\-@]/.test(value)
    ? `'${value}`
    : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function rowsToCsv(columns, rows) {
  const lines = [columns.map(({ header }) => csvCell(header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map(({ key }) => csvCell(row[key])).join(","));
  }
  return `\uFEFF${lines.join("\r\n")}`;
}
