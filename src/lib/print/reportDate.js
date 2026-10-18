function displayDate(day, month, year, original) {
  const fullYear = Number(year) < 100 ? 2500 + Number(year) : Number(year);
  const gregorianYear = fullYear >= 2400 ? fullYear - 543 : fullYear;
  const date = new Date(Date.UTC(gregorianYear, Number(month) - 1, Number(day)));
  if (date.getUTCFullYear() !== gregorianYear || date.getUTCMonth() !== Number(month) - 1 || date.getUTCDate() !== Number(day)) return original;
  return `${String(day).padStart(2, "0")}-${String(month).padStart(2, "0")}-${gregorianYear + 543}`;
}

// Presentation only: never use this value as a query date or a LOT identifier.
export function formatReportDateText(value) {
  if (typeof value !== "string") return value;
  return value.replace(/(?<![\dA-Za-z])(\d{4})-(\d{2})-(\d{2})(?!\d)|(?<![\dA-Za-z])(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})(?!\d)/g,
    (match, year, month, day, slashDay, slashMonth, slashYear) => displayDate(day || slashDay, month || slashMonth, year || slashYear, match));
}

export function formatReportGroupLabel(value) {
  if (typeof value !== "string" || !/^(?:รวม)?วันที่/.test(value)) return value;
  const [heading, ...details] = value.split(" · ");
  return [formatReportDateText(heading), ...details].join(" · ");
}
