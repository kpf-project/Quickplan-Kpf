import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transform, loadBindings } from "next/dist/build/swc/index.js";
import puppeteer from "puppeteer";

import { buildPieceRateIssueSummaryRows } from "../src/features/attendance/utils/buildPieceRateIssueSummaryRows.js";

const source = fs.readFileSync(
  "src/features/attendance/components/PieceRateStockMovementReportPageClient.js",
  "utf8"
);
const routeSource = fs.readFileSync(
  "src/app/api/attendance/piece-rate/stock/movements/route.js",
  "utf8"
);
const issueSummarySource = fs.readFileSync(
  "src/features/attendance/utils/buildPieceRateIssueSummaryRows.js",
  "utf8"
);

test("issue summary quantity preserves fractional issues instead of rounding 100.573 to 101", () => {
  const body = source.slice(source.indexOf("function formatQty("), source.indexOf("function formatWeight("));
  const format = new Function(`${body}; return formatQty;`)();
  assert.equal(format(100.573, 3), "100.573");
  assert.equal(format(58, 3), "58");
  assert.equal(format(0, 3), "-");
  assert.equal(format(100.573), "101", "unrelated legacy reports retain their existing presentation");
  const summary = source.slice(source.indexOf("function IssueSummaryReportA4("), source.indexOf("export default function PieceRateStockMovementReportPageClient"));
  assert.match(summary, /formatQty\(row.quantity, 3\)/);
  assert.match(summary, /formatQty\(totalQty, 3\)/);
});

test("web issue summary wraps long WIP and FG names inside their own cells", async () => {
  await loadBindings();
  const body = source.slice(source.indexOf("function IssueSummaryReportA4("), source.indexOf("export default function PieceRateStockMovementReportPageClient"));
  const { code } = await transform(`const formatQty = String; const formatWeight = String; const formatSingleDate = String; const formatPeriod = () => "13-10-2569"; ${body}\nexport default IssueSummaryReportA4;`, { filename: "IssueSummaryReportA4.js", jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });
  const componentModule = { exports: {} };
  new Function("require", "module", "exports", code)(createRequire(import.meta.url), componentModule, componentModule.exports);
  const html = renderToStaticMarkup(createElement(componentModule.exports.default, { variant: "screen", rows: [{ groupKey: "test", issueDate: "2026-10-13", wipProductCode: "WKB-0002-2", wipProductName: "เนื้อขนมแครกเกอร์โบตั๋นป้ายแยมสับปะรดสำหรับผลิตสินค้าสำเร็จรูป", lotWeights: [{ lotNo: "061026", weightKg: 934.71 }], quantity: 100.573, totalWeightKg: 1996.28, fgProductCode: "BL0-1104", fgProductName: "ขนมปังกรอบ แยมสับปะรด 1.1 กก. บรรจุ 6 ปี๊บต่อกล่อง สำหรับสินค้าสำเร็จรูป" }] }));
  const start = source.indexOf(".issue-summary-report .issue-summary-table th,");
  const css = source.slice(start, source.indexOf("@media print", start));
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.setContent(`<style>.issue-summary-table{width:1123px;table-layout:fixed;border-collapse:collapse}.issue-summary-table td,.issue-summary-table th{border:1px solid #aaa;padding:4px;font:11px sans-serif}${css}</style>${html}`);
    const cells = await page.$$eval(".issue-summary-name-cell", (nodes) => nodes.map((cell) => ({ whiteSpace: getComputedStyle(cell).whiteSpace, overflow: cell.scrollWidth > cell.clientWidth + 1 })));
    assert.deepEqual(cells, [{ whiteSpace: "normal", overflow: false }, { whiteSpace: "normal", overflow: false }]);
  } finally {
    await browser.close();
  }
});

test("issue report uses the shared A4 document layout in landscape", () => {
  assert.match(source, /reportKind="issue"/);
  assert.match(source, /รายงานเบิกสินค้า/);
  assert.match(source, /stock-report-issue \.inbound-print-page \{[\s\S]*?width: 297mm !important;/);
  assert.match(source, /const pageHeight = 794;/);
});

test("issue A4 table includes the standard issue columns", () => {
  for (const label of [
    "วันที่–เวลาเบิก",
    "บาร์โค้ดป้าย",
    "สินค้า WIP",
    "สินค้า FG ที่นำไปผลิต",
    "น้ำหนักเบิก",
  ]) {
    assert.match(source, new RegExp(label));
  }
});

test("issue quantity and weight headers align with right-aligned values", () => {
  assert.match(source, /\(label, columnIndex\)[\s\S]*?\[5, 6\]\.includes\(columnIndex\)[\s\S]*?text-right/);
});

test("issue WIP and FG product names use two lines without ellipsis", () => {
  assert.match(source, /issue-product-text/);
  assert.match(source, /max-height: 2\.5em/);
  assert.match(source, /white-space: normal !important/);
  assert.match(source, /text-overflow: clip !important/);
});

test("issue screen pages are calculated from measured row heights", () => {
  assert.match(source, /screenIssuePages/);
  assert.match(source, /onMeasuredPages=\{setScreenIssuePages\}/);
  assert.match(source, /const issuePages = useMemo/);
});

test("issue report defaults to confirmed issues and supports multi-status checkboxes", () => {
  assert.match(source, /useState\(\["issue"\]\)/);
  assert.match(source, /เบิกสำเร็จ/);
  assert.match(source, /ยกเลิกเบิก/);
  assert.match(source, /type="checkbox"/);
  assert.match(source, /filteredIssueRows/);
});

test("issue report offers a printable successful-issues-only summary", () => {
  assert.match(source, /function IssueSummaryReportA4/);
  assert.match(source, /tab\.key === "issue"/);
  assert.match(issueSummarySource, /row\.kind !== "issue"/);
  assert.match(source, /สถานะ:<\/span> เบิกสำเร็จเท่านั้น/);
  assert.match(source, /variant="print"[\s\S]*?rows=\{issueSummaryRows\}/);
});

test("issue summary uses the requested WIP and FG columns", () => {
  for (const label of [
    "ลำดับ",
    "วันที่เบิก",
    "รหัส WIP",
    "สินค้า WIP",
    "LOT / น้ำหนัก (กก.)",
    "จำนวน",
    "น้ำหนักรวม (กก.)",
    "รหัส FG",
    "ชื่อสินค้า FG ที่ผลิต",
  ]) {
    assert.match(source, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(source, /row\.fgProductCode/);
  assert.match(source, /row\.fgProductName/);
  assert.match(source, /row\.lotWeights/);
});

test("issue summary aggregates LOT weights and reconciles them to the row total", () => {
  const [summary] = buildPieceRateIssueSummaryRows([
    { kind: "issue", movementAt: "2026-08-25T08:00:00Z", productCode: "WKB-0002-1", productName: "WIP", fgProductCode: "BL-3004", fgProductName: "FG", lotNo: "260825", quantityOut: 120, weightOutKg: 1642.5 },
    { kind: "issue", movementAt: "2026-08-25T09:00:00Z", productCode: "WKB-0002-1", productName: "WIP", fgProductCode: "BL-3004", fgProductName: "FG", lotNo: "260826", quantityOut: 62, weightOutKg: 848.43 },
  ]);

  assert.equal(summary.quantity, 182);
  assert.equal(summary.totalWeightKg, 2490.93);
  assert.deepEqual(summary.lotWeights, [
    { lotNo: "260825", weightKg: 1642.5 },
    { lotNo: "260826", weightKg: 848.43 },
  ]);
  assert.equal(
    Number(summary.lotWeights.reduce((sum, lot) => sum + lot.weightKg, 0).toFixed(3)),
    summary.totalWeightKg
  );
});

test("issue summary uses the business movement date before the recorded timestamp", () => {
  const [summary] = buildPieceRateIssueSummaryRows([{
    kind: "issue",
    issueDate: "2026-09-03",
    movementDate: "2026-09-04",
    movementAt: "2026-09-04T07:49:46.746Z",
    productCode: "WKB-0002-2",
    productName: "เนื้อขนมเรือนจำ",
    fgProductCode: "BL0-3003",
    fgProductName: "ขนมปังกรอบ แยมสับปะรด 3กก. (2ถุง)",
    lotNo: "310869",
    quantityOut: 32,
    weightOutKg: 645.24,
  }]);

  assert.equal(summary.issueDate, "2026-09-03");
  assert.match(routeSource, /issueDate: kind === "issue" \|\| kind === "issue_void" \? row\.movement_date : null/);
});

test("issue summary retains compact identifiers and the existing A4 landscape print layout", () => {
  assert.match(source, /issue-summary-report[\s\S]*?stock-report-issue[\s\S]*?overflow-x-auto/);
  assert.match(source, /min-w-\[1123px\]/);
  assert.match(source, /issue-summary-table[\s\S]*?white-space: nowrap !important;/);
  assert.match(source, /isSummaryView && reportType === "issue"[\s\S]*?"A4 landscape"/);
  assert.match(source, /stock-report-issue\.issue-summary-report \.inbound-print-page[\s\S]*?width: 297mm !important;/);
  assert.match(source, /issue-summary-name-cell[\s\S]*?font-size: 10\.5px !important;/);
  assert.match(source, /stock-report-issue \.issue-summary-table th,[\s\S]*?font-size: 10\.5px !important;/);
  assert.match(source, /issue-summary-table td:nth-child\(9\)[\s\S]*?overflow: visible !important;[\s\S]*?text-overflow: clip !important;/);
  assert.match(source, /issue-summary-report,[\s\S]*?issue-summary-pages[\s\S]*?overflow: visible !important;/);
  assert.match(source, /stock-report-issue\.issue-summary-report \.inbound-print-page[\s\S]*?min-height: 0 !important;[\s\S]*?page-break-after: auto !important;/);
});

test("issue summary prints once and lets the browser paginate continuous rows", () => {
  assert.match(source, /const pageSize = isScreen \? 24 : Math\.max\(summaryRows\.length, 1\);/);
  assert.doesNotMatch(source, /\.stock-report-issue\.issue-summary-report \{[^}]*display: block !important;/);
  assert.match(source, /\.inbound-report-screen \{[\s\S]*?display: none !important;/);
  assert.match(source, /\.inbound-report-print \{[\s\S]*?display: block !important;/);
});

test("issue API excludes return movements from the issue report", () => {
  assert.match(routeSource, /if \(reportType === "issue"\) return kind === "issue" \|\| kind === "issue_void";/);
});

test("movement report uses the inbound document design on A4 landscape", () => {
  const movementReportSource = source.slice(
    source.indexOf("function MovementReportA4"),
    source.indexOf("function InboundReportA4")
  );
  assert.match(source, /function MovementReportA4/);
  assert.match(source, /reportKind="movement"/);
  assert.match(source, /stock-report-movement \.inbound-print-page[\s\S]*?width: 297mm !important/);
  assert.match(source, /Array\.from\(\{ length: 14 \}/);
  assert.match(source, /MOVEMENT_GROUPS\.flatMap/);
  assert.doesNotMatch(movementReportSource, /ยอดรวมทั้งรายงาน/);
});

test("movement API uses only jam-label movement rows for the daily balance report", () => {
  assert.match(routeSource, /buildPieceRateDailyMovementReport\(wipRows, effectiveDateFrom, dateTo, search\)/);
  assert.doesNotMatch(routeSource, /loadProductionStockMovementSummaryReportData/);
});

test("movement report excludes finished-goods categories before calculating rows and totals", () => {
  assert.match(routeSource, /const wipRows = allRows\.filter\(\(row\) => !isFgCategory\(/);
  assert.match(routeSource, /row\.products_cache\?\.iccat_code \|\| row\.category_code/);
  assert.match(routeSource, /buildPieceRateDailyMovementReport\(wipRows, effectiveDateFrom, dateTo, search\)/);
});

test("movement print does not render the legacy report header above the A4 document", () => {
  assert.match(source, /!\["inbound", "issue", "movement", "balance"\]\.includes\(reportType\)/);
});

test("movement report typography matches the stock movement summary", () => {
  assert.match(source, /\.movement-a4-table \{[\s\S]*?font-size: 10\.8px;[\s\S]*?line-height: 1\.22;/);
  assert.match(source, /\.movement-a4-table th,[\s\S]*?padding: 2\.5px 4px;/);
  assert.match(source, /stock-report-movement \.movement-a4-table th,[\s\S]*?font-size: 10\.8px !important;/);
  assert.match(source, /movement-date-header/);
  assert.match(source, /movement-product-subtotal/);
});

test("movement screen report paginates without limiting the print report", () => {
  assert.match(source, /MOVEMENT_SCREEN_PAGE_SIZE/);
  assert.match(source, /movementCurrentPage/);
  assert.match(source, /movement-pagination/);
  assert.match(source, /variant === "screen"/);
});

test("movement numeric cells fit large seven-digit values on screen and print", () => {
  assert.match(source, /movement-number-cell/);
  assert.match(source, /letter-spacing: -0\.35px/);
  assert.match(source, /stock-report-movement \.movement-number-cell/);
});

test("movement rows group by product before date like the stock balance summary", () => {
  assert.match(source, /function sortMovementRowsByProduct/);
  assert.match(source, /function buildMovementDisplayItems[\s\S]*?const byProduct = new Map\(\);[\s\S]*?const byDate = new Map\(\);/);
  assert.match(source, /safeRows = sortMovementRowsByProduct/);
});

test("balance report uses latest cumulative LOT balances without date filters", () => {
  assert.match(source, /const isBalanceReport = reportType === "balance"/);
  assert.match(source, /if \(!isBalanceReport\) \{[\s\S]*?params\.set\("dateFrom", dateFrom\)[\s\S]*?params\.set\("dateTo", dateTo\)/);
  assert.match(source, /reportType !== "balance" && \([\s\S]*?จากวันที่[\s\S]*?ถึงวันที่/);
  assert.match(routeSource, /buildBalanceRows\(allRows, PIECE_RATE_REPORT_START_DATE, bangkokDate\(\), search\)/);
});

test("WIP balance excludes finished-goods categories before calculating its summary", () => {
  assert.match(routeSource, /FG_CATEGORY_CODES = new Set\(\["04", "04-1", "04-2"\]\)/);
  assert.match(routeSource, /const wipRows = allRows\.filter\(\(row\) => !isFgCategory\(movementCategory\(row\)\)\)/);
  assert.match(routeSource, /buildBalanceRows\(wipRows, PIECE_RATE_REPORT_START_DATE, bangkokDate\(\), search\)/);
  assert.doesNotMatch(source, /สินค้า FG \(04 \/ 04-1 \/ 04-2\)/);
});

test("balance report matches the inbound A4 design and groups LOT rows by product", () => {
  assert.match(source, /function BalanceReportA4/);
  assert.match(source, /function buildBalanceDisplayItems/);
  assert.match(source, /type: "productSubtotal"/);
  assert.match(source, /reportKind="balance"/);
  assert.match(source, /stock-report-balance \.inbound-print-page[\s\S]*?width: 210mm !important/);
});

test("balance report omits product header rows and shows full product names on one line", () => {
  assert.doesNotMatch(source, /type: "productHeader"/);
  assert.doesNotMatch(source, /balance-product-header/);
  assert.match(source, /className="balance-product-name"/);
  assert.match(source, /\.balance-product-name \{[\s\S]*?white-space: nowrap;[\s\S]*?text-overflow: clip;/);
});

test("balance product names use a standard readable font size and wider column", () => {
  assert.match(source, /<th className="w-\[49%\] text-left">สินค้า<\/th>/);
  assert.match(source, /\.balance-product-name \{[\s\S]*?font-size: 11px;/);
});

test("all jam-label stock reports ignore rows before the 2026-08-11 restart date", () => {
  assert.match(routeSource, /PIECE_RATE_REPORT_START_DATE = "2026-08-11"/);
  assert.match(routeSource, /const effectiveDateFrom = dateFrom < PIECE_RATE_REPORT_START_DATE/);
  assert.match(routeSource, /\.gte\("movement_date", PIECE_RATE_REPORT_START_DATE\)/);
  assert.match(routeSource, /buildBalanceRows\(allRows, PIECE_RATE_REPORT_START_DATE, bangkokDate\(\), search\)/);
});
