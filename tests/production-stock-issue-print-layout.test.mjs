import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import * as bangkokDate from "../src/lib/bangkokDate.js";

const detailSource = fs.readFileSync(
  "src/features/production-line/components/ProductionStockIssueReportPageClient.js",
  "utf8"
);
const summarySource = fs.readFileSync(
  "src/features/production-line/components/ProductionStockIssueSummaryReportPageClient.js",
  "utf8"
);

test("issue detail and summary print as continuous A4 tables in their own orientation", () => {
  assert.match(detailSource, /@page\s*{\s*size:\s*A4 landscape;/);
  assert.match(summarySource, /@page\s*{\s*size:\s*A4 portrait;/);
  for (const source of [detailSource, summarySource]) {
    assert.match(source, /display:\s*table-header-group\s*!important/);
    assert.match(source, /break-inside:\s*avoid\s*!important/);
    assert.match(source, /border:\s*0\.5pt solid/);
  }

  const detailPrint = detailSource.slice(detailSource.indexOf("Continuous print table"));
  const summaryPrint = summarySource.slice(summarySource.indexOf("issue-summary-print-only"));
  assert.match(detailPrint, /flatVirtualRows\.map/);
  assert.doesNotMatch(detailPrint, /reportPages\.map/);
  assert.match(summaryPrint, /issuePrintRows\.map/);
  assert.doesNotMatch(summaryPrint, /reportPages\.map/);
});

test("summary omits a duplicate subtotal when a product has only one row", () => {
  assert.match(summarySource, /if \(groupRows\.length > 1\)\s*{[\s\S]*type: 'product-footer'/);
});

test("detail preview remains landscape while summary fits portrait width", () => {
  assert.match(detailSource, /detailed-issue-report-print-shell[^"`]*min-h-\[210mm\][^"`]*w-\[297mm\]/);
  assert.match(summarySource, /width: 210mm;/);
  assert.doesNotMatch(summarySource, /1400px/);
  assert.equal((detailSource.match(/const (?:FIRST|OTHER)_PAGE_LIMIT = 24/g) || []).length, 2);
  assert.equal((summarySource.match(/const (?:FIRST|OTHER)_PAGE_LIMIT = 24/g) || []).length, 2);
});

test("summary allows full product names to wrap in both portrait layouts", () => {
  assert.match(
    summarySource,
    /\.issue-summary-print-table \.issue-summary-product-cell \{[\s\S]*?white-space: normal !important;/,
  );
  assert.match(
    summarySource,
    /resolvedReportConfig\.hideIssueTypeColumn \? "31%" : "24%"/,
  );
  assert.match(
    summarySource,
    /\.summary-issue-report-table \.summary-issue-product-cell \{[\s\S]*?white-space: normal !important;/,
  );
});

test("issue report displays the selected business date with the actual Bangkok time", () => {
  assert.equal(typeof bangkokDate.formatBusinessDateTime, "function");
  assert.equal(
    bangkokDate.formatBusinessDateTime(
      "2026-10-01",
      "2026-10-02T03:42:15.665435+00:00"
    ),
    "01/10/69 10:42:15"
  );
});
