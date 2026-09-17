const BANGKOK_TIME_ZONE = "Asia/Bangkok";

function formatBangkokDateInput(value = new Date()) {
  const baseDate = value instanceof Date ? value : new Date(value);
  const validDate = Number.isNaN(baseDate.getTime()) ? new Date() : baseDate;

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BANGKOK_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(validDate);
}

function normalizeDateInput(value) {
  const normalizedValue = String(value || "").trim();
  if (!normalizedValue) {
    return null;
  }

  const dateParts = normalizedValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!dateParts) {
    return null;
  }

  const [, year, month, day] = dateParts;
  const date = new Date(`${year}-${month}-${day}T00:00:00+07:00`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  if (formatBangkokDateInput(date) !== `${year}-${month}-${day}`) {
    return null;
  }

  return date;
}

export function formatScaleReceiptDateInput(value) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : normalizeDateInput(value);
  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }

  return formatBangkokDateInput(date);
}

export function toScaleReceiptIsoDateBounds(value = new Date()) {
  const bangkokDateKey = formatBangkokDateInput(value);
  const start = new Date(`${bangkokDateKey}T00:00:00+07:00`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
  };
}

export function toScaleReceiptIsoDateRange({ dateFrom = null, dateTo = null } = {}) {
  const normalizedFrom = normalizeDateInput(dateFrom);
  const normalizedTo = normalizeDateInput(dateTo);
  const fallbackDate = normalizeDateInput(formatBangkokDateInput(new Date()));

  const start = normalizedFrom || normalizedTo || fallbackDate;
  const endBase = normalizedTo || normalizedFrom || start;
  const end = new Date(endBase);
  end.setUTCDate(end.getUTCDate() + 1);

  return {
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    normalizedDateFrom: formatScaleReceiptDateInput(start),
    normalizedDateTo: formatScaleReceiptDateInput(endBase),
  };
}
