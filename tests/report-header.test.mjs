import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const headerSource = fs.readFileSync(
  path.join(repoRoot, "src/components/print/ReportHeader.js"),
  "utf8"
);
const printIndexSource = fs.readFileSync(
  path.join(repoRoot, "src/components/print/index.js"),
  "utf8"
);
const a4LayoutSource = fs.readFileSync(
  path.join(repoRoot, "src/components/print/A4DocumentLayout.js"),
  "utf8"
);

test("ReportHeader is officially exported from print package", () => {
  assert.match(printIndexSource, /export\s*\{\s*default\s+as\s+ReportHeader\s*\}\s*from\s*["']\.\/ReportHeader["']/);
});

test("ReportHeader implements clean, formal, and modern enterprise branding", () => {
  // Brand identity
  assert.match(headerSource, /บริษัท เคพีฟู้ดส์ จำกัด/);
  assert.match(headerSource, /K\.P\. foods Co\.,Ltd\./i);
  assert.match(headerSource, /\/brand\/LOGO-KPF1\.png/);
  assert.match(headerSource, /#102C57/, "Must use signature KPF deep navy");
  assert.match(headerSource, /#b89025/, "Must use refined gold for uppercase English subtitle");
  
  // Audit trail
  assert.match(headerSource, /วันที่พิมพ์:/);
  assert.match(headerSource, /ผู้ออกรายงาน:/);
  assert.match(headerSource, /formatThaiPrintDateTime/);
});

test("ReportHeader supports flexible variants for on-screen block, table rows, and thead", () => {
  assert.match(headerSource, /variant === "table-rows"/);
  assert.match(headerSource, /variant === "thead"/);
  assert.match(headerSource, /print-report-header/);
  assert.match(headerSource, /print-report-meta/);
  assert.match(headerSource, /report-header-block/);
});

test("ReportHeader supports structured metadata ribbon and document numbers", () => {
  assert.match(headerSource, /docNo/);
  assert.match(headerSource, /เลขที่เอกสาร:/);
  assert.match(headerSource, /metaItems/);
  assert.match(headerSource, /totalPages/);
});

test("A4DocumentLayout delegates document header rendering to ReportHeader", () => {
  assert.match(a4LayoutSource, /import\s+ReportHeader\s+from\s+["']\.\/ReportHeader["']/);
  assert.match(a4LayoutSource, /<ReportHeader/);
  assert.match(a4LayoutSource, /variant="table-rows"/);
});
