/**
 * Central Print Standards & Configuration for KPF Production Line
 * Based on ISO 32000-2:2020, W3C CSS Paged Media Module Level 3, and CSS Fragmentation Level 3.
 *
 * Rules:
 * 1. Physical Units: mm for page geometry, pt for typography and stroke widths.
 * 2. Vector-first: Keep text as text objects, tables as vector paths (no bitmap screenshots).
 * 3. Exact color reproduction: print-color-adjust: exact.
 * 4. Header & Footer repetition: thead display: table-header-group, tfoot display: table-footer-group.
 * 5. Fragmentation control: break-inside: avoid on rows, subtotals, grand totals, and signatures.
 * 6. No hairline 0: Use 0.5pt - 0.75pt for clean rendering on 300/600/1200 DPI RIPs.
 */

export const A4_PORTRAIT_SPEC = Object.freeze({
  size: "A4 portrait",
  widthMm: 210,
  heightMm: 297,
  orientation: "portrait",
  margins: {
    top: "10mm",
    right: "8mm",
    bottom: "12mm",
    left: "8mm",
  },
  marginCss: "10mm 8mm 12mm 8mm",
});

export const A4_LANDSCAPE_SPEC = Object.freeze({
  size: "A4 landscape",
  widthMm: 297,
  heightMm: 210,
  orientation: "landscape",
  margins: {
    top: "8mm",
    right: "6mm",
    bottom: "10mm",
    left: "6mm",
  },
  marginCss: "8mm 6mm 10mm 6mm",
});

export const THAI_FONT_STACK = `var(--font-noto-sans-looped), "Sarabun", "Noto Sans Thai", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`;

/**
 * Format Bangkok timestamp with Buddhist Era year
 * e.g. 20/09/69 18:30:00
 */
export function formatThaiPrintDateTime(value = Date.now()) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const yy = String(date.getFullYear() + 543).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const mi = String(date.getMinutes()).padStart(2, "0");
  const ss = String(date.getSeconds()).padStart(2, "0");

  return `${dd}/${mm}/${yy} ${hh}:${mi}:${ss}`;
}

/**
 * Format Bangkok date with Buddhist Era year
 * e.g. 20/09/2569
 */
export function formatThaiPrintDate(value = Date.now(), fullYear = true) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  const beYear = date.getFullYear() + 543;
  const yy = fullYear ? String(beYear) : String(beYear).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");

  return `${dd}/${mm}/${yy}`;
}

/**
 * Generate standard W3C CSS Paged Media stylesheet for A4 printing
 */
export function generateA4PrintCSS({
  orientation = "portrait",
  customMargin = null,
  tableSelector = ".standard-a4-table",
  fontSize = "10.5pt",
  headerBg = "#102C57",
  headerColor = "#ffffff",
  metaBg = "#f8fafc",
  subtotalBg = "#fbfcfd",
  grandTotalBg = "#f0eada",
  grandTotalColor = "#102C57",
  borderColor = "#cbd5e1",
} = {}) {
  const spec = orientation === "landscape" ? A4_LANDSCAPE_SPEC : A4_PORTRAIT_SPEC;
  const marginCss = customMargin || spec.marginCss;

  return `
    @media print {
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        color: #111827 !important;
        font-family: ${THAI_FONT_STACK} !important;
        font-synthesis: none !important;
      }

      @page {
        size: ${spec.size};
        margin: ${marginCss};
      }

      .no-print,
      .app-sidebar-desktop,
      .app-sidebar-mobile-overlay,
      .app-sidebar-mobile-trigger,
      .app-sidebar-mobile-panel,
      .app-sidebar-mobile-bottom-nav,
      .app-tabs-bar {
        display: none !important;
      }

      .a4-print-container {
        width: 100% !important;
        max-width: none !important;
        margin: 0 !important;
        padding: 0 !important;
        background: #ffffff !important;
        overflow: visible !important;
      }

      /* Vector table standards */
      ${tableSelector} {
        width: 100% !important;
        table-layout: fixed !important;
        border-collapse: collapse !important;
        font-size: ${fontSize} !important;
        line-height: 1.35 !important;
        color: #111827 !important;
        background: #ffffff !important;
      }

      ${tableSelector} th,
      ${tableSelector} td {
        border: 0.5pt solid ${borderColor} !important;
        padding: 3.5pt 4.5pt !important;
        vertical-align: middle !important;
        font-feature-settings: "tnum" 1 !important;
      }

      ${tableSelector} thead {
        display: table-header-group !important;
      }

      ${tableSelector} tfoot {
        display: table-footer-group !important;
      }

      ${tableSelector} tbody tr {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }

      ${tableSelector} tbody tr:nth-child(even) {
        background-color: #f8fafc !important;
      }

      /* Header styling */
      ${tableSelector} .print-report-header th {
        border: none !important;
        border-bottom: 2pt solid ${headerBg} !important;
        padding: 0 0 6pt !important;
        background: #ffffff !important;
      }

      ${tableSelector} .print-report-meta th {
        border: none !important;
        border-bottom: 1pt solid ${headerBg} !important;
        padding: 4pt 5pt !important;
        background: ${metaBg} !important;
        color: ${headerBg} !important;
      }

      ${tableSelector} .table-header th {
        background: #f8f5ee !important;
        color: #111111 !important;
        font-weight: 800 !important;
        text-align: center !important;
        border: 0.5pt solid ${borderColor} !important;
      }

      /* Keep-together and summary rows */
      .keep-together,
      ${tableSelector} .group-header-row,
      ${tableSelector} .subtotal-row,
      ${tableSelector} .grand-total-row,
      .signature-block,
      .closing-block {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
      }

      ${tableSelector} .group-header-row td {
        background: ${headerBg} !important;
        color: ${headerColor} !important;
        font-weight: 800 !important;
        padding: 4pt 6pt !important;
        border: 0.5pt solid ${headerBg} !important;
        break-after: avoid !important;
        page-break-after: avoid !important;
      }

      ${tableSelector} .subtotal-row td {
        background-color: ${subtotalBg} !important;
        color: #111111 !important;
        font-weight: 800 !important;
        border: 0.5pt solid ${borderColor} !important;
      }

      ${tableSelector} .grand-total-row td {
        background-color: ${grandTotalBg} !important;
        color: ${grandTotalColor} !important;
        font-weight: 900 !important;
        border: 0.75pt solid #d4af37 !important;
      }

      .page-break-before {
        break-before: page !important;
        page-break-before: always !important;
      }

      .page-break-after {
        break-after: page !important;
        page-break-after: always !important;
      }
    }
  `;
}
