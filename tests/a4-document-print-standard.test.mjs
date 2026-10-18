import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import {
  A4_PORTRAIT_SPEC,
  A4_LANDSCAPE_SPEC,
  formatThaiPrintDate,
  formatThaiPrintDateTime,
  generateA4PrintCSS,
} from "../src/lib/print/printStandards.js";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("central print standards specify ISO 216 / W3C A4 dimensions and margins in physical units", () => {
  assert.equal(A4_PORTRAIT_SPEC.widthMm, 210);
  assert.equal(A4_PORTRAIT_SPEC.heightMm, 297);
  assert.equal(A4_PORTRAIT_SPEC.size, "A4 portrait");
  assert.match(A4_PORTRAIT_SPEC.marginCss, /10mm/);

  assert.equal(A4_LANDSCAPE_SPEC.widthMm, 297);
  assert.equal(A4_LANDSCAPE_SPEC.heightMm, 210);
  assert.equal(A4_LANDSCAPE_SPEC.size, "A4 landscape");
});

test("generateA4PrintCSS produces compliant W3C CSS Paged Media and fragmentation rules", () => {
  const portraitCss = generateA4PrintCSS({ orientation: "portrait" });
  assert.match(portraitCss, /@page\s*\{\s*size:\s*A4 portrait;/);
  assert.match(portraitCss, /print-color-adjust:\s*exact/);
  assert.match(portraitCss, /display:\s*table-header-group/);
  assert.match(portraitCss, /display:\s*table-footer-group/);
  assert.match(portraitCss, /break-inside:\s*avoid/);
  assert.match(portraitCss, /0\.5pt solid/);

  const landscapeCss = generateA4PrintCSS({ orientation: "landscape" });
  assert.match(landscapeCss, /@page\s*\{\s*size:\s*A4 landscape;/);
});

test("formatThaiPrintDateTime formats Buddhist era year and Thai timestamps properly", () => {
  const sampleTime = new Date("2026-09-20T11:30:00Z").getTime();
  const formatted = formatThaiPrintDateTime(sampleTime);
  assert.match(formatted, /\/69\s+\d{2}:\d{2}:\d{2}/);

  const formattedDate = formatThaiPrintDate(sampleTime, true);
  assert.match(formattedDate, /\/2569/);
});

test("BomEditorPageClient replaces html-to-image/html2canvas with clean vector A4 print layout", () => {
  const bomSource = fs.readFileSync(
    path.join(repoRoot, "src/features/production-line/components/BomEditorPageClient.js"),
    "utf8"
  );

  // Anti-patterns are removed
  assert.doesNotMatch(bomSource, /import\("html-to-image"\)/);
  assert.doesNotMatch(bomSource, /html2canvas\(/);
  assert.doesNotMatch(bomSource, /handleCaptureImage/);

  // Standard A4 Layout is integrated
  assert.match(bomSource, /import\s*\{\s*A4DocumentLayout\s*\}\s*from\s*["']@\/components\/print["']/);
  assert.match(bomSource, /<A4DocumentLayout/);
  assert.match(bomSource, /orientation="landscape"/);
  assert.match(bomSource, /title="โครงสร้างสูตรการผลิต \(BOM\)"/);
  assert.match(bomSource, /พิมพ์ตาราง BOM \(A4 แนวนอน\)/);
});

test("thermal barcode label printers remain completely untouched as requested", () => {
  const webUsbSource = fs.readFileSync(
    path.join(repoRoot, "src/features/production-line/services/webUsbPrinter.js"),
    "utf8"
  );
  assert.match(webUsbSource, /buildTsplLabel/);
  assert.match(webUsbSource, /findPrinterEndpoint/);

  const scaleLabelSource = fs.readFileSync(
    path.join(repoRoot, "src/features/production-line/services/weightScaleLabelBitmap.js"),
    "utf8"
  );
  assert.match(scaleLabelSource, /createWeightScaleLabelBitmapPayload/);
  assert.match(scaleLabelSource, /DOTS_PER_MM = 8/);
});

test("all weight scale reports conform to A4 physical margins, 0.5pt hairlines, and W3C table headers", () => {
  const files = [
    "src/features/production-line/components/WeightScaleReportPageClient.js",
    "src/features/production-line/components/ProductionStockIssueReportPageClient.js",
    "src/features/production-line/components/ProductionStockIssueSummaryReportPageClient.js",
    "src/features/production-line/components/ProductionStockMovementSummaryReportPageClient.js",
    "src/features/production-line/components/ProductionStockLotBalanceReportPageClient.js",
    "src/features/production-line/components/ProductionStockLotBalanceSummaryReportPageClient.js",
    "src/features/production-line/components/WeightScaleSummaryReportPageClient.js",
  ];

  for (const relativePath of files) {
    const content = fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
    assert.match(content, /margin:\s*8mm\s+6mm/i, `${relativePath} must use standard safe A4 8mm 6mm margins`);
    assert.match(content, /border:\s*0\.5pt\s+solid|border-bottom:\s*0\.5pt\s+solid/i, `${relativePath} must use 0.5pt hairline vector borders`);
    assert.match(content, /display:\s*table-header-group/i, `${relativePath} must repeat thead across fragmented pages`);
    assert.match(content, /print-color-adjust:\s*exact/i, `${relativePath} must enforce exact color reproduction`);
  }
});

test("piece-rate jam-label reports conform to 0.5pt hairlines, table headers, and prison tab print width", () => {
  const content = fs.readFileSync(
    path.join(repoRoot, "src/features/attendance/components/PieceRateStockMovementReportPageClient.js"),
    "utf8"
  );

  assert.match(content, /stock-report-prison \.inbound-print-page/i, "prison report must have designated print width rules");
  assert.match(content, /0\.5pt solid/i, "piece rate reports must use 0.5pt hairline vector borders");
  assert.match(content, /display:\s*table-header-group/i, "inbound/issue/movement tables must repeat thead across print pages");
  assert.match(content, /print-color-adjust:\s*exact/i, "piece rate report must enforce exact color reproduction");
});
