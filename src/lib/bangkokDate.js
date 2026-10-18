const bangkokDateFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Bangkok",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const bangkokTimeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Bangkok",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
});

export function toBangkokDateKey(value = new Date()) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return bangkokDateFormatter.format(date);
}

export function formatBusinessDateTime(businessDate, timestamp) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(
    String(businessDate || "").trim()
  );
  const actualDate = new Date(timestamp);
  if (!dateMatch || Number.isNaN(actualDate.getTime())) return "-";

  const [, year, month, day] = dateMatch;
  const buddhistYear = String(Number(year) + 543).slice(-2);
  return `${day}/${month}/${buddhistYear} ${bangkokTimeFormatter.format(actualDate)}`;
}
