export function paginateReportItems(items, rowHeights, availableHeight, footerHeight = 0) {
  const safeItems = Array.isArray(items) ? items : [];
  if (!safeItems.length) return [[]];

  const pageHeight = Math.max(1, Number(availableHeight) || 1);
  const entries = safeItems.map((item, index) => ({
    item,
    height: Math.max(1, Number(rowHeights?.[index]) || 1),
  }));
  const pages = [];
  let currentPage = [];
  let currentHeight = 0;

  entries.forEach((entry) => {
    if (currentPage.length && currentHeight + entry.height > pageHeight) {
      pages.push(currentPage);
      currentPage = [];
      currentHeight = 0;
    }
    currentPage.push(entry);
    currentHeight += entry.height;
  });
  if (currentPage.length) pages.push(currentPage);

  const reservedFooterHeight = Math.max(0, Number(footerHeight) || 0);
  const lastPage = pages[pages.length - 1];
  const lastPageHeight = lastPage.reduce((sum, entry) => sum + entry.height, 0);
  if (reservedFooterHeight && lastPageHeight + reservedFooterHeight > pageHeight) {
    const footerPage = [];
    let footerPageHeight = 0;
    while (lastPage.length) {
      const entry = lastPage.pop();
      footerPage.unshift(entry);
      footerPageHeight += entry.height;
      if (footerPageHeight + reservedFooterHeight <= pageHeight) break;
    }
    if (!lastPage.length) pages.pop();
    pages.push(footerPage);
  }

  return pages.map((page) => page.map((entry) => entry.item));
}
