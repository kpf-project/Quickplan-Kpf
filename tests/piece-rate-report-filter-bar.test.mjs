import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const clientSource = fs.readFileSync(
  "src/features/attendance/components/PieceRateReportPageClient.js",
  "utf8"
);

test("PieceRateReportPageClient connects onPrint and onExportExcel to ReportFilterBar", () => {
  assert.match(clientSource, /<ReportFilterBar/);
  assert.match(clientSource, /onPrint=\{handlePrintTable\}/);
  assert.match(clientSource, /onExportExcel=\{handleExportExcel\}/);
  assert.match(clientSource, /isPrinting=\{printingReport\}/);
  assert.match(clientSource, /isExporting=\{exportingExcel\}/);
});

test("PieceRateReportPageClient provides navigation and admin buttons in actions slot", () => {
  assert.match(clientSource, /actions=\{/);
  assert.match(clientSource, /\/production-line\/attendance\/piece-rate-scan/);
  assert.match(clientSource, /หน้าสแกน/);
  assert.match(clientSource, /openManualModal/);
  assert.match(clientSource, /setImportModalOpen\(true\)/);
});
