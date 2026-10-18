import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("all report-center body cells stay white while signed text and headers retain their styles", () => {
  const css = fs.readFileSync(new URL("../src/app/globals.css",import.meta.url),"utf8");
  assert.match(css,/body \[data-report-center\] table tbody tr td/);
  assert.match(css,/\.production-report-embedded table tbody tr td/);
  assert.match(css,/\[data-report-document\] table tbody tr td\s*\{\s*background: #fff !important;/);
  const shared = fs.readFileSync(new URL("../src/components/reporting/ReportSystem.module.css",import.meta.url),"utf8");
  assert.match(shared,/\.documentPage \.reportTable tbody tr td\{background:#fff!important\}/);
  assert.match(shared,/data-comparison="positive"\]\{color:#008a70!important/);
  assert.match(shared,/data-comparison="negative"\]\{color:#e00035!important/);
});
