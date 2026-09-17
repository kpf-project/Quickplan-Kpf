import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  "src/features/attendance/components/PieceRateStockMovementReportPageClient.js",
  "utf8"
);

test("inbound print gives barcode slightly more width than employee name", () => {
  assert.match(
    source,
    /: \[4, 12, 10, 21, 10, 5, 8, 5, 9, 16\]/
  );
});

test("screen uses measured pagination while print uses the complete table", () => {
  assert.doesNotMatch(source, /const size = 35;/);
  assert.match(source, /return \[allItems\];/);
  assert.doesNotMatch(source, /continuousInboundPages/);
  assert.doesNotMatch(source, /while \(paddedItems\.length < 35\)/);
  assert.doesNotMatch(source, /\{pageIndex \+ 1\} \/ \{inboundPages\.length\}/);
  assert.match(source, /pageRows\.filter\(\(item\) => item\.type === "row"\)\.length/);
  assert.match(source, /variant="screen"/);
  assert.match(source, /variant="print"/);
  assert.match(source, /variant="measure"/);
  assert.match(source, /paginateReportItems\(items, rowHeights, availableHeight, finalFooterReserve\)/);
  assert.match(source, /\.inbound-print-page \{[\s\S]*?display: block !important;[\s\S]*?height: auto !important;/);
  assert.match(source, /\.inbound-print-page table thead \{\s*display: table-header-group !important;/);
  assert.match(source, /\.inbound-print-page table tfoot \{\s*display: table-row-group !important;/);
  assert.match(source, /className="print-report-header-row"/);
});

test("inbound print uses narrow page padding and contains product text", () => {
  assert.doesNotMatch(source, /inbound-print-page[^\n]*\bp-6\b/);
  assert.match(source, /style=\{\{ pageBreakAfter: "always", breakAfter: "always", padding: "2mm" \}\}/);
  assert.match(source, /\.inbound-print-page \{[\s\S]*?padding: 2mm !important;/);
  assert.match(
    source,
    /\.inbound-print-page table td:nth-child\(3\) \{[\s\S]*?overflow: hidden !important;/
  );
});
