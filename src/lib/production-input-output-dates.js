export function shiftIsoDate(dateValue, dayOffset) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || ""))) {
    return dateValue;
  }

  const date = new Date(`${dateValue}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + dayOffset);
  return date.toISOString().slice(0, 10);
}

function getIsoDayOfWeek(dateValue) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateValue || ""))) return null;
  return new Date(`${dateValue}T00:00:00.000Z`).getUTCDay();
}

export function isSundayIsoDate(dateValue) {
  return getIsoDayOfWeek(dateValue) === 0;
}

export function getJamReportDateForRequisitionDate(requisitionDate) {
  const nextDate = shiftIsoDate(requisitionDate, 1);
  return isSundayIsoDate(nextDate) ? shiftIsoDate(nextDate, 1) : nextDate;
}

export function getJamRequisitionDateForReportDate(reportDate) {
  const dayOfWeek = getIsoDayOfWeek(reportDate);
  if (dayOfWeek === null || dayOfWeek === 0) return null;
  return shiftIsoDate(reportDate, dayOfWeek === 1 ? -2 : -1);
}
