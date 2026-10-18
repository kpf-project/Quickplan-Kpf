import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../src/features/production-costing/components/MaterialCostEstimateReport.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/features/production-costing/components/CostReport.module.css", import.meta.url), "utf8");

test("BOM report measures physical rows instead of a fixed character budget", () => {
  assert.match(source, /variant="measure"/);
  assert.match(source, /getBoundingClientRect/);
  assert.doesNotMatch(source, /\}\), 420, 100/);
  assert.match(source, /data-cost-totals/);
});

test("BOM units have space and can wrap without clipping", () => {
  assert.match(source, /key: "uomName"[^\n]*width: "9%"/);
  assert.doesNotMatch(css, /nth-child\(5\)[^{]*\{ white-space:nowrap/);
  assert.match(css, /overflow-wrap:anywhere/);
});

test("BOM estimate uses portrait paper for preview, measurement and print", () => {
  assert.match(source, /orientation: "portrait"/);
  assert.match(source, /A4_PORTRAIT_SPEC.size/);
  assert.doesNotMatch(css, /min-width:1077px/);
  assert.doesNotMatch(css, /line-clamp|text-overflow:ellipsis/);
});

test("BOM table omits repeated price source while retaining its document metadata", () => {
  assert.doesNotMatch(source, /key: "priceSource"/);
  assert.match(source, /<b>แหล่งราคา:<\/b>/);
});

test("BOM preview restores paper margins and omits synthetic production reference", () => {
  assert.doesNotMatch(source, /รุ่นการผลิต:/);
  assert.match(css, /padding:10mm 8mm 12mm/);
  assert.match(css, /\.document \{ width:210mm/);
});

test("printed BOM omits interactive review column and measures the same columns", () => {
  assert.match(source, /printColumns = columns\.filter\(\(column\) => column\.key !== "statusLabel"\)/);
  assert.match(source, /columns=\{interactive \? columns : normalizedPrintColumns\}/);
});

test("screen paper grows with its extra review column without a nested vertical scroller", () => {
  assert.match(css, /height:auto; min-height:297mm/);
  assert.match(css, /\[data-report-body\] \{ flex:1 0 auto/);
  assert.match(css, /overflow-x:clip; overflow-y:visible/);
  assert.match(css, /\.horizontalScroll \{ overflow-x:auto; overflow-y:hidden/);
});
