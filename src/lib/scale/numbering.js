function requireProductDigits(value) {
  if (typeof value !== "string" || !/^\d{4}$/.test(value) || value === "0000") {
    throw new Error("A registered four-digit product identifier is required");
  }
  return value;
}

export function getScaleNumberingContext(timestamp) {
  const text = timestamp instanceof Date ? timestamp.toISOString() : timestamp;
  const parts = typeof text === "string"
    ? text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/)
    : null;
  if (!parts) throw new Error("An explicit timestamp with timezone is required");
  const [, year, month, day, hour, minute, second] = parts;
  const calendar = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (calendar.getUTCFullYear() !== Number(year)
    || calendar.getUTCMonth() + 1 !== Number(month)
    || calendar.getUTCDate() !== Number(day)
    || Number(hour) > 23 || Number(minute) > 59 || Number(second) > 59) {
    throw new Error("Invalid scale timestamp");
  }
  const instant = new Date(text);
  if (!Number.isFinite(instant.getTime())) throw new Error("Invalid scale timestamp");
  const bangkok = new Date(instant.getTime() + 7 * 60 * 60 * 1000);
  const minutes = bangkok.getUTCHours() * 60 + bangkok.getUTCMinutes();
  const shift = minutes >= 420 && minutes <= 1140 ? 1 : 2;
  if (minutes < 420) bangkok.setUTCDate(bangkok.getUTCDate() - 1);
  const productionYear = bangkok.getUTCFullYear();
  if (productionYear < 2000 || productionYear > 2099) {
    throw new Error("Two-digit barcode year supports production dates 2000–2099");
  }
  const productionDate = bangkok.toISOString().slice(0, 10);
  const dateCode = productionDate.slice(8, 10) + productionDate.slice(5, 7) + productionDate.slice(2, 4);
  return { productionDate, dateCode, shift };
}

export function formatScaleBarcode({ timestamp, productDigits, runNumber }) {
  const digits = requireProductDigits(productDigits);
  if (!Number.isInteger(runNumber) || runNumber < 1 || runNumber > 9999) {
    throw new Error("Daily barcode running number must be between 0001 and 9999");
  }
  return getScaleNumberingContext(timestamp).dateCode + digits + String(runNumber).padStart(4, "0");
}

export function formatScaleLot({ timestamp, productDigits }) {
  const digits = requireProductDigits(productDigits);
  const context = getScaleNumberingContext(timestamp);
  return context.dateCode + digits + "-" + context.shift;
}
