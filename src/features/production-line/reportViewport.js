export function sizeReportViewport(frame, scrollbar, tables = []) {
  const doc = frame?.contentDocument;
  if (!doc?.body || !doc.documentElement || !scrollbar?.firstElementChild) return;
  const { body, documentElement } = doc;
  frame.style.height = `${Math.max(400, Math.ceil(Math.max(documentElement.getBoundingClientRect().height, body.getBoundingClientRect().height, body.offsetHeight, body.scrollHeight)))}px`;
  const overflow = Math.max(0, ...tables.map((table) => table.scrollWidth - table.clientWidth));
  const width = (scrollbar.clientWidth || documentElement.clientWidth) + overflow;
  scrollbar.firstElementChild.style.width = `${width}px`;
  scrollbar.hidden = overflow <= 1;
}

// All report routes are same-origin; adapt their screen layout without changing print styles.
export function attachReportViewport(frame, scrollbar) {
  const doc = frame?.contentDocument;
  const win = frame?.contentWindow;
  if (!doc?.body || !doc.head || !doc.documentElement || !win || !scrollbar?.firstElementChild) return () => {};
  const style = doc.createElement("style");
  style.textContent = `@media screen {
    html, body { height:auto !important; min-height:0 !important; }
    html { overflow:hidden !important; }
    body { overflow:visible !important; background:transparent !important; }
    * {
      scrollbar-width: none !important;
    }
    *::-webkit-scrollbar {
      display: none !important;
      width: 0 !important;
      height: 0 !important;
    }
    .piece-rate-topbar,
    .screen-header,
    .report-tabs,
    nav[aria-label="เมนูผลผลิตและ WIP"],
    nav[aria-label="เมนูหลัก"],
    nav[aria-label="เมนูวางแผนการผลิต"],
    .packing-screen-header,
    a.oldReports,
    section[class*="from-[#102C57]"][class*="shadow-xl"],
    header[class*="bg-[var(--surface-navy,#061f43)]"],
    header[class*="bg-[var(--surface-navy,#102C57)]"],
    header[class*="border-b-2"][class*="border-black"],
    .weight-scale-primary-header {
      display: none !important;
    }
    main, .min-h-screen {
      min-height: 0 !important;
      height: auto !important;
    }
    .production-report-embedded, .production-report-embedded > main,
    .production-report-embedded > main > .min-h-screen { min-height:0 !important; height:auto !important; }
    .report-center-expanded { height:auto !important; max-height:none !important; overflow-x:clip !important; overflow-y:visible !important; }
    .report-center-table-scroll { height:auto !important; max-height:none !important; overflow:hidden !important; }

    /* A4 Portrait Report Sheets: Elegant paper silhouette centered on screen */
    .lot-balance-portrait-print-shell,
    .summary-issue-report-print-shell,
    .daily-summary-preview-pages section.weight-scale-report-print-shell,
    .issue-summary-preview-pages section.weight-scale-report-print-shell {
      max-width: min(100%, 820px) !important;
      width: 100% !important;
      min-height: auto !important;
      margin-left: auto !important;
      margin-right: auto !important;
      background: #ffffff !important;
      border: 1px solid #cbd5e1 !important;
      border-radius: 4px !important;
      box-shadow: 0 4px 20px rgba(16, 44, 87, 0.08) !important;
      padding: 24px !important;
      box-sizing: border-box !important;
    }

    /* Landscape sheets flow responsively in screen mode */
    .detailed-issue-report-print-shell,
    .movement-summary-print-shell {
      max-width: 100% !important;
      width: 100% !important;
      min-height: auto !important;
      box-shadow: none !important;
      border: none !important;
      padding: 0 !important;
    }

    /* Enterprise Standard Table Styles (ISO 32000-2 & W3C CSS Paged Media Compliant) */
    .report-center-summary-table,
    table.report-table,
    table.standard-enterprise-table,
    table.summary-report-print-table,
    table.detailed-report-print-table,
    table.summary-issue-report-table,
    table.detailed-issue-report-table,
    table.lot-balance-portrait-report-table,
    table.movement-summary-report-table,
    table.movement-summary-screen-table,
    table.balance-a4-table,
    table.movement-a4-table,
    table.inbound-data-table,
    table.issue-summary-table,
    table.print-report-table {
      border-collapse: collapse !important;
      border: 1px solid #cbd5e1 !important;
      font-size: 13px !important;
    }
    .report-center-summary-table thead th,
    table.report-table thead th,
    table.standard-enterprise-table thead th,
    table.summary-report-print-table thead th,
    table.detailed-report-print-table thead th,
    table.summary-issue-report-table thead th,
    table.detailed-issue-report-table thead th,
    table.lot-balance-portrait-report-table thead th,
    table.movement-summary-report-table thead th,
    table.movement-summary-screen-table thead th,
    table.balance-a4-table thead th,
    table.movement-a4-table thead th,
    table.inbound-data-table thead th,
    table.issue-summary-table thead th,
    table.print-report-table thead th {
      background-color: #edf5fc !important;
      color: #102C57 !important;
      font-weight: 700 !important;
      letter-spacing: 0.01em !important;
      border: 0.5pt solid #cbd5e1 !important;
      padding: 9px 12px !important;
    }
    .report-center-summary-table tbody tr:nth-child(even),
    table.report-table tbody tr:nth-child(even),
    table.standard-enterprise-table tbody tr:nth-child(even),
    table.summary-report-print-table tbody tr:nth-child(even),
    table.detailed-report-print-table tbody tr:nth-child(even),
    table.summary-issue-report-table tbody tr:nth-child(even),
    table.detailed-issue-report-table tbody tr:nth-child(even),
    table.lot-balance-portrait-report-table tbody tr:nth-child(even),
    table.movement-summary-report-table tbody tr:nth-child(even),
    table.movement-summary-screen-table tbody tr:nth-child(even),
    table.balance-a4-table tbody tr:nth-child(even),
    table.movement-a4-table tbody tr:nth-child(even),
    table.inbound-data-table tbody tr:nth-child(even),
    table.issue-summary-table tbody tr:nth-child(even),
    table.print-report-table tbody tr:nth-child(even) {
      background-color: #f8fafc !important;
    }
    .report-center-summary-table tbody tr:hover,
    table.report-table tbody tr:hover,
    table.standard-enterprise-table tbody tr:hover,
    table.summary-report-print-table tbody tr:hover,
    table.detailed-report-print-table tbody tr:hover,
    table.summary-issue-report-table tbody tr:hover,
    table.detailed-issue-report-table tbody tr:hover,
    table.lot-balance-portrait-report-table tbody tr:hover,
    table.movement-summary-report-table tbody tr:hover,
    table.movement-summary-screen-table tbody tr:hover,
    table.balance-a4-table tbody tr:hover,
    table.movement-a4-table tbody tr:hover,
    table.inbound-data-table tbody tr:hover,
    table.issue-summary-table tbody tr:hover,
    table.print-report-table tbody tr:hover {
      background-color: #f1f5f9 !important;
    }
    .report-center-summary-table td,
    table.report-table td,
    table.standard-enterprise-table td,
    table.summary-report-print-table td,
    table.detailed-report-print-table td,
    table.summary-issue-report-table td,
    table.detailed-issue-report-table td,
    table.lot-balance-portrait-report-table td,
    table.movement-summary-report-table td,
    table.movement-summary-screen-table td,
    table.balance-a4-table td,
    table.movement-a4-table td,
    table.inbound-data-table td,
    table.issue-summary-table td,
    table.print-report-table td {
      border: 0.5pt solid #cbd5e1 !important;
      padding: 9px 12px !important;
    }
    .report-center-summary-table td:nth-child(n+4),
    .report-center-summary-table tfoot th:not(:first-child),
    table td.text-right,
    table td[class*="text-right"],
    table td[class*="tabular-nums"],
    .standard-enterprise-table td.numeric-cell {
      font-variant-numeric: tabular-nums !important;
      text-align: right !important;
    }
    .report-center-summary-table tfoot,
    table.report-table tfoot,
    table.standard-enterprise-table tfoot,
    table.summary-report-print-table tfoot,
    table.detailed-report-print-table tfoot,
    table.summary-issue-report-table tfoot,
    table.detailed-issue-report-table tfoot,
    table.lot-balance-portrait-report-table tfoot,
    table.movement-summary-report-table tfoot,
    table.movement-summary-screen-table tfoot,
    table.balance-a4-table tfoot,
    table.movement-a4-table tfoot,
    table.inbound-data-table tfoot,
    table.issue-summary-table tfoot,
    table.print-report-table tfoot {
      background: #edf5fc !important;
      border-top: 2px solid #102C57 !important;
      font-weight: 700 !important;
    }
  }
  @media print {
    * {
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .report-center-summary-table thead th,
    table.report-table thead th,
    table.standard-enterprise-table thead th,
    table.summary-report-print-table thead th,
    table.detailed-report-print-table thead th,
    table.summary-issue-report-table thead th,
    table.detailed-issue-report-table thead th,
    table.lot-balance-portrait-report-table thead th,
    table.movement-summary-report-table thead th,
    table.movement-summary-screen-table thead th,
    table.balance-a4-table thead th,
    table.movement-a4-table thead th,
    table.inbound-data-table thead th,
    table.issue-summary-table thead th,
    table.print-report-table thead th {
      background-color: #edf5fc !important;
      color: #102C57 !important;
      border: 0.5pt solid #cbd5e1 !important;
    }
  }`;
  doc.head.appendChild(style);
  let pending = 0;
  let disposed = false;
  let tables = [];
  const active = () => !disposed && frame.contentDocument === doc;
  const scroll = () => {
    if (!active()) return;
    for (const table of tables) table.scrollLeft = scrollbar.scrollLeft;
  };
  const update = () => {
    pending = 0;
    if (!active()) return;
    const viewports = new Set();
    for (const table of doc.querySelectorAll("table")) {
      if (!table.getClientRects().length || table.closest("dialog, [role=dialog], [aria-modal=true]")) continue;
      let found = false;
      for (let element = table.parentElement; element && element !== doc.body; element = element.parentElement) {
        const layout = win.getComputedStyle(element);
        if (layout.position === "fixed") break;
        if (!found && (element.classList.contains("report-center-table-scroll")
          || layout.overflowX === "auto" || layout.overflowX === "scroll"
          || (element === table.parentElement && element.children.length === 1))) {
          viewports.add(element);
          found = true;
        }
      }
    }
    tables = [...viewports];
    sizeReportViewport(frame, scrollbar, tables);
    win.scrollTo(0, 0);
    scroll();
  };
  const schedule = () => {
    if (active() && !pending) pending = window.requestAnimationFrame(update);
  };
  const wheel = (event) => {
    if (!active() || Math.abs(event.deltaX) <= Math.abs(event.deltaY) || event.target.closest?.("dialog, [role=dialog], [aria-modal=true]")) return;
    scrollbar.scrollLeft += event.deltaX;
    scroll();
    event.preventDefault();
  };
  const mutations = new win.MutationObserver(schedule);
  mutations.observe(doc.body, { childList: true, subtree: true, attributes: true, characterData: true });
  win.addEventListener("resize", schedule);
  scrollbar.addEventListener("scroll", scroll);
  doc.addEventListener("load", schedule, true);
  doc.addEventListener("transitionend", schedule, true);
  doc.addEventListener("wheel", wheel, { passive: false });
  doc.fonts?.ready.then(schedule);
  update();
  return () => {
    disposed = true;
    window.cancelAnimationFrame(pending);
    mutations.disconnect();
    win.removeEventListener("resize", schedule);
    scrollbar.removeEventListener("scroll", scroll);
    doc.removeEventListener("load", schedule, true);
    doc.removeEventListener("transitionend", schedule, true);
    doc.removeEventListener("wheel", wheel);
    style.remove();
  };
}
