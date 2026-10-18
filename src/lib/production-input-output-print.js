/**
 * Production Input-Output Print Pagination
 *
 * Implements dynamic pagination based on row density / content height,
 * while preserving fallback compatibility with COMPACT_DAYS_PER_PAGE.
 */

export const COMPACT_DAYS_PER_PAGE = 4;
export const MAX_ROWS_PER_COMPACT_PAGE = 28;

export function getCompactPrintPages(days) {
  const reportDays = Array.isArray(days) ? days : [];
  const pages = [];

  for (let index = 0; index < reportDays.length; index += COMPACT_DAYS_PER_PAGE) {
    pages.push(reportDays.slice(index, index + COMPACT_DAYS_PER_PAGE));
  }

  return pages;
}

/**
 * Measured dynamic pagination that respects day content height/rows
 * prevents tables from overflowing when a single day has many lines.
 */
export function getDynamicCompactPrintPages(days, maxRowsPerPage = MAX_ROWS_PER_COMPACT_PAGE) {
  const reportDays = Array.isArray(days) ? days : [];
  if (!reportDays.length) return [];

  const pages = [];
  let currentPage = [];
  let currentRows = 0;

  for (const day of reportDays) {
    const dayRowCount = Array.isArray(day?.rows) ? Math.max(day.rows.length, 1) : 1;
    // Overhead for date header and subtotal
    const dayWeight = dayRowCount + 2;

    if (currentPage.length > 0 && currentRows + dayWeight > maxRowsPerPage) {
      pages.push(currentPage);
      currentPage = [day];
      currentRows = dayWeight;
    } else {
      currentPage.push(day);
      currentRows += dayWeight;
    }
  }

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return pages;
}
