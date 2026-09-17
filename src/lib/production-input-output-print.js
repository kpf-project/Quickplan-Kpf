export const COMPACT_DAYS_PER_PAGE = 4;

export function getCompactPrintPages(days) {
  const reportDays = Array.isArray(days) ? days : [];
  const pages = [];

  for (let index = 0; index < reportDays.length; index += COMPACT_DAYS_PER_PAGE) {
    pages.push(reportDays.slice(index, index + COMPACT_DAYS_PER_PAGE));
  }

  return pages;
}
