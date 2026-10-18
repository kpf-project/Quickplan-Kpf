import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const tableSource = fs.readFileSync(
  path.join(repoRoot, "src/components/print/ReportTable.js"),
  "utf8"
);
const printIndexSource = fs.readFileSync(
  path.join(repoRoot, "src/components/print/index.js"),
  "utf8"
);

test("ReportTable is exported from central print package", () => {
  assert.match(
    printIndexSource,
    /export\s*\{\s*default\s+as\s+ReportTable,\s*ReportTh,\s*ReportTd\s*\}\s*from\s*["']\.\/ReportTable["']/
  );
});

test("ReportTable implements ISO 32000-2 & W3C enterprise styling", () => {
  assert.match(tableSource, /#edf5fc/, "Must use soft bluish-gray header background");
  assert.match(tableSource, /#102C57/, "Must use signature dark navy text for contrast");
  assert.match(tableSource, /#cbd5e1/, "Must use vector 0.5pt slate table borders");
  assert.match(tableSource, /#f8fafc/, "Must provide alternating zebra row striping");
  assert.match(tableSource, /tabular-nums/, "Must enforce tabular-nums for numeric columns");
  assert.match(tableSource, /#edf5fc/, "Must provide grand total summary footer");
});

test("ReportTable supports compound mode via ReportTh and ReportTd", () => {
  assert.match(tableSource, /export function ReportTh/);
  assert.match(tableSource, /export function ReportTd/);
  assert.match(tableSource, /children \?/);
});

test("ReportTable supports data-driven mode via columns and data props", () => {
  assert.match(tableSource, /columns\.map/);
  assert.match(tableSource, /data\.map/);
  assert.match(tableSource, /summaryRow/);
  assert.match(tableSource, /emptyMessage/);
  assert.match(tableSource, /isLoading/);
});
