import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  JAM_GOODS_CODES,
  buildProductionInputOutputReport,
  getReferencedJamIssueRef,
  isActiveErpDocument,
  isProductionJamPlanForReportDate,
  isProductionJamRequisitionRef,
  mergeManualJamUsageRows,
  selectPrimaryBomFormulaVersions,
} from "../src/lib/production-input-output-report.js";
import {
  getJamReportDateForRequisitionDate,
  getJamRequisitionDateForReportDate,
} from "../src/lib/production-input-output-dates.js";
import { fetchAllSupabaseRows, fetchSupabaseRowsByChunks } from "../src/lib/supabaseRangeFetch.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("WIP loader reads both issue sources and checks cancellations beyond the report dates", async () => {
  const source = fs.readFileSync(path.join(repoRoot, "src/lib/production-input-output-data.js"), "utf8");
  const body = source.slice(source.indexOf("async function loadWipIssueRows("), source.indexOf("async function loadPieceRateRows("));
  const load = new Function("fetchAllSupabaseRows", "fetchSupabaseRowsByChunks", `${body}; return loadWipIssueRows;`)(fetchAllSupabaseRows, fetchSupabaseRowsByChunks);
  const calls = [];
  const db = { from(table) {
    const call = { table, filters: [] };
    calls.push(call);
    const query = { range: async () => ({ data: call.filters.some(([key, value]) => key === "source_document_type" && value === "piece_rate_issue_void") ? [{ source_document_type: "piece_rate_issue_void", source_document_no: "I1" }] : [{ source_document_type: "piece_rate_issue", source_document_no: "I1" }] }) };
    for (const method of ["select", "eq", "in", "gte", "lte", "order"]) query[method] = (...args) => { call.filters.push(args); return query; };
    return query;
  } };
  const rows = await load(db, "2026-10-13", "2026-10-13");
  assert.equal(rows.length, 2);
  assert.ok(calls[0].filters.some(([key, value]) => key === "source_document_type" && Array.isArray(value) && value.includes("piece_rate_prison_issue")));
  assert.ok(calls[0].filters.some(([key, value]) => key === "movement_date" && value === "2026-10-13"));
  assert.ok(!calls[1].filters.some(([key]) => key === "movement_date"));
  assert.match(source, /includeWip = false/);
  assert.match(source, /includeWip \? loadWipIssueRows/);
  const center = fs.readFileSync(path.join(repoRoot, "src/features/production-line/report-center/reportData.js"), "utf8");
  assert.match(center, /includeWip: true/);
});

test("mixed shell and explicitly linked WIP keep separate inputs and one FG output", () => {
  const issue = (lot, quantity, weight) => ({ source_document_type: "piece_rate_issue", source_document_no: lot, movement_date: "2026-10-15", product_code: "WKB-0002-2", product_name_snapshot: "เนื้อขนม", lot_no: lot, uom_name: "กระบะ", quantity_out: quantity, weight_out_kg: weight, metadata: { fgProductCode: "BL0-1104", issueType: "KPF" } });
  const report = buildProductionInputOutputReport({
    stockRows: [{ issueDate: "2026-10-15", productCode: "WKB-0002", productName: "เปลือก", actualQuantity: 40, actualWeightKg: 500 }],
    pieceRateRows: [{ dayKey: "2026-10-15", productCode: "BL0-1104", countValue: 2500, normalizedKgAmount: 2750 }],
    bomMappings: [{ fgCode: "BL0-1104", shellCode: "WKB-0002" }],
    wipIssueRows: [issue("061026", 47.085, 934.71), { ...issue("071026", 53.488, 1061.57), source_document_type: "piece_rate_prison_issue" }, { ...issue("voided", 1, 10) }, { source_document_type: "piece_rate_issue_void", source_document_no: "voided" }, { ...issue("unlinked", 1, 10), metadata: {} }],
  });
  const day = report.days[0];
  const wip = day.rows.find((row) => row.inputKind === "wip");
  assert.ok(wip);
  assert.equal(wip.shellQuantity, 100.573);
  assert.equal(wip.shellWeightKg, 1996.28);
  assert.equal(wip.shellLots.length, 2);
  assert.equal(wip.inputUnit, "กระบะ");
  assert.equal(day.rows.filter((row) => row.fgCode === "BL0-1104").length, 2);
  assert.equal(day.rows.reduce((sum, row) => sum + Number(row.fgQuantity || 0), 0), 2500);
  assert.equal(day.totals.shellQuantity, 40);
  assert.equal(day.totals.wipWeightKg, 1996.28);
  assert.match(report.warnings[0].message, /1 รายการยังไม่ระบุสินค้า FG/);
});

test("WIP-only FG uses actual issue without inferring fresh jam or waste", () => {
  const report = buildProductionInputOutputReport({
    pieceRateRows: [{ dayKey: "2026-10-13", productCode: "FG", countValue: 12, normalizedKgAmount: 100 }],
    wipIssueRows: [{ source_document_type: "piece_rate_issue", source_document_no: "I1", movement_date: "2026-10-13", product_code: "WIP", quantity_out: 7, weight_out_kg: 123, metadata: { fgProductCode: "FG" } }],
  });
  assert.equal(report.days[0].rows.length, 1);
  assert.equal(report.days[0].rows[0].inputKind, "wip");
  assert.equal(report.days[0].rows[0].fgQuantity, 12);
  assert.equal(report.days[0].rows[0].jam, null);
  assert.equal(report.days[0].totals.wasteWeightKg, 0);
});

test("jam LOT display rounds only its quantity and weight to two decimals", () => {
  const source = fs.readFileSync(path.join(repoRoot, "src/features/production-line/report-center/reportDefinitions.js"), "utf8");
  const body = source.slice(source.indexOf("function lotText("), source.indexOf("function issueProductText("));
  const format = new Function("number", `${body}\nreturn lotText;`)((value) => Number(value || 0));
  const lots = [{ lotNo: "260819", quantity: 35.9874, weightKg: 359.874 }];
  assert.equal(format(lots, 2), "260819 · 35.99 · 359.87");
  assert.equal(format(lots), "260819 · 35.987 · 359.874");
  assert.equal(lots[0].weightKg, 359.874);
  assert.match(source, /jamLots: lotText\(row\.jam\?\.lots, 2\)/);
  const css = fs.readFileSync(path.join(repoRoot, "src/components/reporting/ReportSystem.module.css"), "utf8");
  assert.ok(css.includes('td[data-column-group="แยมใช้จริง"] .unbrokenEntry{grid-template-columns:minmax(0,1fr) max-content max-content'));
});

test("FG goods and SKU aliases reach the BOM lookup", () => {
  const source = fs.readFileSync(path.join(repoRoot, "src/lib/production-input-output-data.js"), "utf8");
  const functionSource = source.slice(source.indexOf("function buildFgAliasMap("), source.indexOf("const bomMappingsMemoryCache"));
  const buildAliases = new Function("normalizeCode", `${functionSource}\nreturn buildFgAliasMap;`)(
    (value) => String(value ?? "").trim().toUpperCase()
  );
  const aliases = buildAliases([
    { productGoodsCode: " wkb-0002-1 ", productCode: "WKB-0002-1", productSkuCode: "wkb-00021" },
    { productCode: "B06-0006", productSkuCode: "B06-00060" },
    { productSkuCode: "NO-GOODS-CODE" },
  ]);
  assert.deepEqual([...aliases], [
    ["WKB-0002-1", "WKB-0002-1"], ["WKB-00021", "WKB-0002-1"],
    ["B06-0006", "B06-0006"], ["B06-00060", "B06-0006"],
  ]);
});

test("input-output date search preserves report-only mode without adding it to standalone reports", () => {
  const source = fs.readFileSync(path.join(repoRoot, "src/features/production-line/components/ProductionInputOutputReportPageClient.js"), "utf8");
  const filterSource = source.slice(source.indexOf("  const applyFilters = () => {"), source.indexOf("\n  return (", source.indexOf("  const applyFilters = () => {")));
  for (const reportCenter of [true, false]) {
    let destination;
    new Function("reportCenter", "dateFrom", "dateTo", "startTransition", "router", `${filterSource}\napplyFilters();`)(
      reportCenter, "2026-10-01", "2026-10-03", (run) => run(), { push: (href) => { destination = href; } }
    );
    const url = new URL(destination, "https://kpf.test");
    assert.equal(url.searchParams.get("reportCenter"), reportCenter ? "1" : null);
    assert.equal(url.searchParams.get("dateFrom"), "2026-10-01");
    assert.equal(url.searchParams.get("dateTo"), "2026-10-03");
  }
  const pageSource = fs.readFileSync(path.join(repoRoot, "src/app/production-line/attendance/report/input-output/page.js"), "utf8");
  assert.match(pageSource, /reportCenter=\{params\?\.reportCenter === "1"\}/);
});

function createCompactDay(date, rowCount) {
  return {
    date,
    rows: Array.from({ length: rowCount }, () => ({})),
    jams: [],
  };
}

test("uses a CSS Module so server and client class names hydrate consistently", () => {
  const componentPath = path.join(repoRoot, "src/features/production-line/components/ProductionInputOutputReportPageClient.js");
  const cssModulePath = path.join(repoRoot, "src/features/production-line/components/ProductionInputOutputReport.module.css");
  const componentSource = fs.readFileSync(componentPath, "utf8");

  assert.doesNotMatch(componentSource, /<style\s+jsx/);
  assert.match(componentSource, /ProductionInputOutputReport\.module\.css/);
  assert.match(componentSource, /styles\.reportRoot/);
  assert.equal(fs.existsSync(cssModulePath), true);

  const cssSource = fs.readFileSync(cssModulePath, "utf8");
  assert.match(cssSource, /@page\s*{\s*size:\s*A4 landscape/);
  assert.match(cssSource, /\.reportRoot\s+:global\(\.input-output-sheet\)/);
});

test("prints one continuous standard A4 table using the same row-based structure as the weigh-issue summary", () => {
  const componentSource = fs.readFileSync(
    path.join(repoRoot, "src/features/production-line/components/ProductionInputOutputReportPageClient.js"),
    "utf8"
  );
  const cssSource = fs.readFileSync(
    path.join(repoRoot, "src/features/production-line/components/ProductionInputOutputReport.module.css"),
    "utf8"
  );

  assert.match(componentSource, /const PRINT_MODE_COMPACT = "compact"/);
  assert.match(componentSource, /useState\(PRINT_MODE_COMPACT\)/);
  assert.match(componentSource, /value=\{PRINT_MODE_COMPACT\}>ประหยัดกระดาษ/);
  assert.match(componentSource, /value=\{PRINT_MODE_DAILY\}>แยกวันละแผ่น/);
  assert.match(componentSource, /function CompactPrintReport/);
  assert.match(componentSource, /input-output-compact-report/);
  assert.match(componentSource, /input-output-compact-print-table/);
  assert.doesNotMatch(componentSource, /getCompactPrintPages/);
  assert.match(componentSource, /input-output-compact-sheet-content/);
  assert.match(componentSource, /input-output-print-date-row/);
  assert.doesNotMatch(componentSource, /<tr className="input-output-print-total-row">/);
  assert.match(componentSource, /input-output-print-last-data-row/);
  assert.match(componentSource, /input-output-print-day-group/);
  assert.match(componentSource, /function ReportTable\(\{ page, showHeaders = true \}\)/);
  assert.match(componentSource, /showHeaders \? \(/);
  assert.match(componentSource, /api\/production-line\/attendance\/report\/input-output\/pdf/);
  assert.match(componentSource, /new AbortController\(\)/);
  assert.match(componentSource, /URL\.createObjectURL\(pdfBlob\)/);
  assert.match(componentSource, /printFrame\.contentWindow\?\.print\(\)/);
  assert.match(componentSource, /พิมพ์รายงาน/);
  assert.match(componentSource, /ดาวน์โหลด PDF/);
  assert.doesNotMatch(componentSource, /window\.open\(/);
  assert.match(componentSource, /data-print-report-root/);
  assert.match(componentSource, /serializeReportModuleCssRules/);
  assert.match(componentSource, /CSS\.escape\(className\)/);
  assert.match(componentSource, /input-output-screen-only, \.input-output-screen-report/);
  assert.match(componentSource, /stylesheetPaths:\s*Array\.from\(new Set\(stylesheetPaths\)\)/);
  assert.match(componentSource, /method:\s*"POST"/);
  assert.match(componentSource, /printMode === PRINT_MODE_DAILY \? \(/);
  assert.match(componentSource, /input-output-screen-report/);
  assert.match(componentSource, /input-output-print-only/);
  const pageSource = fs.readFileSync(
    path.join(repoRoot, "src/app/production-line/attendance/report/input-output/page.js"),
    "utf8"
  );
  assert.doesNotMatch(pageSource, /pdfMode/);
  const pdfRouteSource = fs.readFileSync(
    path.join(repoRoot, "src/app/api/production-line/attendance/report/input-output/pdf/route.js"),
    "utf8"
  );
  assert.match(pdfRouteSource, /export async function POST\(request\)/);
  assert.match(pdfRouteSource, /requirePermissionKeys\(request, REPORT_PERMISSION_KEYS\)/);
  assert.match(pdfRouteSource, /await page\.setJavaScriptEnabled\(false\)/);
  assert.match(pdfRouteSource, /await page\.setContent\(documentHtml/);
  assert.doesNotMatch(pdfRouteSource, /page\.goto\(/);
  assert.match(pdfRouteSource, /requestedUrl\.pathname\.startsWith\("\/_next\/static\/"\)/);
  assert.match(pdfRouteSource, /MAX_REQUEST_BYTES/);
  assert.match(pdfRouteSource, /MAX_HTML_BYTES = 8 \* 1024 \* 1024/);
  assert.match(pdfRouteSource, /MAX_CSS_BYTES = 1024 \* 1024/);
  assert.match(pdfRouteSource, /MAX_BODY_CLASS_LENGTH = 4096/);
  assert.doesNotMatch(pdfRouteSource, /!\/\^\[\\w -\]\*\$\/\.test\(bodyClass\)/);
  assert.match(pdfRouteSource, /safeBodyClass = escapeAttribute\(bodyClass\)/);
  assert.match(pdfRouteSource, /เนื้อหารายงานมีขนาดใหญ่เกินไป กรุณาลดช่วงวันที่/);
  assert.match(pdfRouteSource, /รูปแบบรายงานมีขนาดใหญ่เกินไป/);
  assert.match(pdfRouteSource, /preferCSSPageSize:\s*true/);
  assert.match(pdfRouteSource, /printBackground:\s*true/);
  assert.match(pdfRouteSource, /waitForFonts:\s*true/);
  assert.match(pdfRouteSource, /tagged:\s*true/);
  assert.match(pdfRouteSource, /Timed out while waiting for PDF fonts/);
  assert.match(pdfRouteSource, /Content-Type": "application\/pdf"/);
  assert.match(cssSource, /size:\s*A4 landscape/);
  assert.match(cssSource, /width:\s*281mm !important/);
  assert.match(cssSource, /min-height:\s*194mm !important/);
  assert.match(cssSource, /\.reportRoot\s+:global\(\.input-output-print-only\)\s*{\s*display:\s*none/);
  assert.match(cssSource, /\.reportRoot\s+:global\(\.input-output-compact-report\)\s*{\s*display:\s*block/);
  assert.match(cssSource, /\.reportRoot\s+:global\(\.input-output-compact-print-table\)\s*{[\s\S]*?border-collapse:\s*collapse/);
  assert.match(cssSource, /\.compactPrint\s+:global\(\.input-output-compact-print-table\)\s*{[\s\S]*?table-layout:\s*fixed/);
  assert.match(cssSource, /\.compactPrint\s+:global\(\.input-output-report-pages\)\s*{\s*display:\s*none\s*!important/);
  assert.match(cssSource, /\.compactPrint\s+:global\(\.input-output-compact-report\)\s*{\s*display:\s*block\s*!important/);
  assert.doesNotMatch(cssSource, /height:\s*196mm/);
  assert.doesNotMatch(cssSource, /zoom:\s*0\.7/);
  assert.match(cssSource, /\.compactPrint\s+:global\(\.input-output-compact-print-table thead\)\s*{\s*display:\s*table-header-group/);
  assert.match(cssSource, /tbody\.input-output-print-day-group\)\s*\{[\s\S]*?break-inside:\s*auto/);
  assert.match(cssSource, /\.input-output-print-date-row\)\s*\{[\s\S]*?break-after:\s*avoid/);
  assert.match(cssSource, /\.compactPrint\s+:global\(\.input-output-compact-print-table tbody tr\.input-output-print-data-row\)\s*\{[\s\S]*?break-inside:\s*avoid/);
  assert.match(cssSource, /@page\s*\{[\s\S]*?margin:\s*8mm/);
  assert.match(cssSource, /font-family:\s*var\(--font-noto-sans-looped\)/);
  assert.match(cssSource, /border:\s*0\.5pt solid/);
});

test("loads jam from the previous working day and skips Sunday", () => {
  assert.equal(getJamRequisitionDateForReportDate("2026-07-18"), "2026-07-17");
  assert.equal(getJamRequisitionDateForReportDate("2026-07-19"), null);
  assert.equal(getJamRequisitionDateForReportDate("2026-07-20"), "2026-07-18");
  assert.equal(getJamReportDateForRequisitionDate("2026-07-18"), "2026-07-20");

  const dataSource = fs.readFileSync(
    path.join(repoRoot, "src/lib/production-input-output-data.js"),
    "utf8"
  );
  assert.match(dataSource, /getJamRequisitionDateForReportDate\(reportDate\)/);
  assert.match(dataSource, /\.filter\(\(\{ requisitionDate \}\) => requisitionDate\)/);
  assert.match(dataSource, /\{ \.\.\.row, reportDate: matchingReport\.reportDate \}/);
  assert.match(dataSource, /loadJamRows\(rangeStart, rangeEnd\)/);
  assert.match(dataSource, /reportDate <= reportDateTo && reportDate < "2026-10-02"/);
  assert.match(dataSource, /loadJamIssueRows\(dateFrom, datedReports\.at\(-1\)\.reportDate\)/);
});

test("batches exact ERP jam issue and return lookups without count queries", () => {
  const dataSource = fs.readFileSync(
    path.join(repoRoot, "src/lib/production-input-output-data.js"),
    "utf8"
  );
  const gatewaySource = fs.readFileSync(
    path.join(repoRoot, "kpf-api-gateway/server.js"),
    "utf8"
  );

  assert.equal(dataSource.includes('goodsCodes: JAM_GOODS_CODES.join(",")'), true);
  assert.equal(dataSource.includes('issueRefs: issueRefs.join("|")'), true);
  assert.match(dataSource, /includeTotal:\s*"false"/);
  assert.doesNotMatch(dataSource, /JAM_GOODS_CODES\.flatMap/);
  assert.doesNotMatch(dataSource, /Promise\.all\(issueRefs\.map/);
  assert.match(gatewaySource, /STRING_SPLIT\(@goodsCodes, ','\)/);
  assert.equal(gatewaySource.includes("STRING_SPLIT(@issueRefs, '|')"), true);
  assert.match(gatewaySource, /req\.query\.includeTotal !== "false"/);
});

test("loads stock activity without rebuilding historical balances", () => {
  const dataSource = fs.readFileSync(
    path.join(repoRoot, "src/lib/production-input-output-data.js"),
    "utf8"
  );
  const balanceSource = fs.readFileSync(
    path.join(repoRoot, "src/lib/production-stock-balance.js"),
    "utf8"
  );

  assert.match(dataSource, /activityOnly:\s*true/);
  assert.match(dataSource, /expandDailyBalances:\s*false/);
  assert.match(balanceSource, /activityOnly\s*=\s*false/);
  assert.match(balanceSource, /get_production_stock_activity_summary/);
  assert.match(balanceSource, /if \(!activityOnly && previousReportDate/);
});

test("uses entered pail quantity and the first approved BOM formula", () => {
  const dataSource = fs.readFileSync(
    path.join(repoRoot, "src/lib/production-input-output-data.js"),
    "utf8"
  );

  assert.match(dataSource, /resolvePieceRateReportMetrics\(row\)/);
  assert.match(dataSource, /input_mode_snapshot,input_value,count_value_snapshot,weight_kg_snapshot,kg_per_pail_snapshot/);
  assert.match(dataSource, /\.eq\("status", "approved"\)/);
  assert.doesNotMatch(dataSource, /formula_code\.eq\.DEFAULT/);
  assert.match(dataSource, /selectPrimaryBomFormulaVersions\(approvedVersionRows\)/);

  const selected = selectPrimaryBomFormulaVersions([
    { id: "a5", bom_id: "a", formula_code: "F2", version_no: 5 },
    { id: "a4", bom_id: "a", formula_code: "F2", version_no: 4 },
    { id: "a3", bom_id: "a", formula_code: "F3", version_no: 3 },
    { id: "b2", bom_id: "b", formula_code: "F1", version_no: 2 },
    { id: "b1", bom_id: "b", formula_code: "DEFAULT", version_no: 1 },
  ]);
  assert.deepEqual(selected.map((row) => row.id), ["a5", "a4", "b1"]);
});

test("accepts only a jam production label for the requested report date", () => {
  assert.equal(
    isProductionJamPlanForReportDate(
      { DI_REMARK: "ป้ายแยม แผนการผลิต 16/07/2569" },
      "2026-07-16"
    ),
    true
  );
  assert.equal(
    isProductionJamPlanForReportDate(
      { DI_REMARK: "เตรียมของให้เรือนจำ แผนวันที่ 16/07/2569" },
      "2026-07-16"
    ),
    false
  );
  assert.equal(
    isProductionJamPlanForReportDate(
      { DI_REMARK: "ป้ายแยม แผนการผลิต 15/07/2569" },
      "2026-07-16"
    ),
    false
  );
  assert.equal(
    isProductionJamPlanForReportDate(
      {
        DI_REF: "T6909/00117",
        DI_REMARK: "N6909/0114 แผนกบิสกิต, 26/09/2569",
      },
      "2026-09-26"
    ),
    true
  );
  assert.equal(
    isProductionJamPlanForReportDate(
      {
        DI_REF: "T6909/00117",
        DI_REMARK: "N6909/0114 แผนกบิสกิต, 26/09/2569",
      },
      "2026-09-28"
    ),
    false
  );
});

test("uses the KG document quantity when an ERP weight differs from it", () => {
  const report = buildProductionInputOutputReport({
    jamRows: [
      {
        DI_ACTIVE: 0,
        DI_REF: "X6907/0363",
        reportDate: "2026-07-16",
        TRD_SH_CODE: "M04-0088",
        TRD_SH_NAME: "สับปะรดกวน",
        TRD_QTY: 1000,
        TRD_UTQQTY: 1,
        TRD_WEIGHT: 1020,
        TRD_UTQNAME: "KG",
      },
    ],
    jamReturnRows: [
      {
        DI_ACTIVE: 0,
        TRD_REFER_REF: "X6907/0363",
        TRD_SH_CODE: "M04-0088",
        TRD_QTY: 70,
        TRD_UTQQTY: 1,
        TRD_WEIGHT: 0,
        TRD_UTQNAME: "KG",
      },
    ],
  });

  assert.equal(report.days[0].jams[0].issuedWeightKg, 1000);
  assert.equal(report.days[0].jams[0].returnedWeightKg, 70);
  assert.equal(report.days[0].jams[0].weightKg, 930);
  assert.equal(report.days[0].jams[0].quantity, 93);
});

test("renders aligned LOT details for shell and jam before FG and waste", () => {
  const componentSource = fs.readFileSync(
    path.join(repoRoot, "src/features/production-line/components/ProductionInputOutputReportPageClient.js"),
    "utf8"
  );
  const cssSource = fs.readFileSync(
    path.join(repoRoot, "src/features/production-line/components/ProductionInputOutputReport.module.css"),
    "utf8"
  );

  assert.match(componentSource, /เปลือกที่ใช้จริง/);
  assert.match(componentSource, /แยมใช้จริง/);
  assert.match(componentSource, /WIP \/ FG ปลายทางและผลผลิต/);
  assert.match(componentSource, /<th colSpan=\{3\}[^>]*>ของเสีย \(กก\.\)<\/th>/);
  assert.match(componentSource, /function LotHeader/);
  assert.match(componentSource, /<span>LOT<\/span>/);
  assert.match(componentSource, /<span>จำนวน<\/span>/);
  assert.match(componentSource, /<span>น้ำหนัก \(กก\.\)<\/span>/);
  assert.match(componentSource, /LotBreakdown/);
  assert.match(componentSource, /lots=\{jam\?\.lots\}/);
  assert.match(componentSource, /formatQuantity\(lot\.quantity\)/);
  assert.match(componentSource, /colSpan=\{17\}/);
  assert.doesNotMatch(componentSource, /<th[^>]*>รหัสแยม<\/th>/);
  assert.match(componentSource, /w-\[14%\]/);
  assert.match(componentSource, /w-\[12%\]/);
  assert.match(cssSource, /grid-template-columns:\s*minmax\(0, 42%\) 4% minmax\(0, 20%\) 4% minmax\(0, 30%\)/);
  assert.match(cssSource, /\.reportRoot\s+:global\(\.input-output-lot-cell\)[\s\S]*?overflow:\s*hidden/);
  assert.match(cssSource, /col:nth-child\(2\)\)\s*\{\s*width:\s*11\.5%\s*!important/);
  assert.match(cssSource, /col:nth-child\(3\)\)\s*\{\s*width:\s*14%\s*!important/);
  assert.match(cssSource, /col:nth-child\(7\)\)\s*\{\s*width:\s*12%\s*!important/);
  assert.match(cssSource, /grid-template-columns:\s*max-content auto max-content auto max-content\s*!important/);
  assert.match(cssSource, /@page\s*\{[\s\S]*?margin:\s*8mm/);
  assert.match(cssSource, /text-overflow:\s*clip\s*!important/);
  assert.ok(
    componentSource.indexOf("WIP / FG ปลายทางและผลผลิต") < componentSource.indexOf("ของเสีย (กก.)")
  );
  assert.ok(
    componentSource.indexOf("showFg ? production.fgCode") < componentSource.indexOf("showWaste ? formatNumber")
  );
  assert.doesNotMatch(componentSource, /showWaste \? production\.fgCode/);
  assert.doesNotMatch(componentSource, /showWaste \? production\.fgName/);
  assert.match(componentSource, /รวมเปลือก:/);
  assert.match(componentSource, /รวมแยมใช้จริง:/);
  assert.doesNotMatch(componentSource, /รวมของเสีย:/);
  assert.match(componentSource, /รวมผลผลิต:/);
  assert.doesNotMatch(componentSource, /function JamSummary/);
});

test("uses a soft red background across the entire waste column group", () => {
  const componentSource = fs.readFileSync(
    path.join(repoRoot, "src/features/production-line/components/ProductionInputOutputReportPageClient.js"),
    "utf8"
  );
  const cssSource = fs.readFileSync(
    path.join(repoRoot, "src/features/production-line/components/ProductionInputOutputReport.module.css"),
    "utf8"
  );

  assert.ok((componentSource.match(/input-output-waste-cell/g) || []).length >= 7);
  assert.match(
    cssSource,
    /\.reportRoot\s+:global\(\.input-output-technical-grid \.input-output-waste-cell\)[\s\S]*?background:\s*#fee2e2\s*!important/
  );
});

test("renders a full-width Thai table with readable dark text and two-line product names", () => {
  const componentSource = fs.readFileSync(
    path.join(repoRoot, "src/features/production-line/components/ProductionInputOutputReportPageClient.js"),
    "utf8"
  );
  const cssSource = fs.readFileSync(
    path.join(repoRoot, "src/features/production-line/components/ProductionInputOutputReport.module.css"),
    "utf8"
  );

  assert.match(componentSource, />#<\/th>/);
  assert.match(componentSource, /รหัสเปลือก/);
  assert.match(componentSource, /ชื่อเปลือก/);
  assert.doesNotMatch(componentSource, /<th[^>]*>รหัสแยม<\/th>/);
  assert.match(componentSource, /รหัสสินค้า/);
  assert.match(componentSource, /น้ำหนัก \(กก\.\)/);
  assert.match(componentSource, /input-output-product-name/);
  assert.match(componentSource, /<span className="input-output-product-name">/);
  assert.doesNotMatch(componentSource, /className="truncate/);
  assert.doesNotMatch(componentSource, /input-output-spacer-row/);

  assert.match(cssSource, /width:\s*calc\(100% \+ 10mm\)/);
  assert.match(cssSource, /font-size:\s*10\.5px/);
  assert.match(cssSource, /-webkit-line-clamp:\s*2/);
  assert.match(cssSource, /color:\s*#0f172a\s*!important/);
});

test("includes only configured jam codes and derives jam quantity from KG divided by 10", () => {
  const report = buildProductionInputOutputReport({
    jamRows: [
      {
        DI_DATE: "2026-07-15T00:00:00.000Z",
        DI_REF: "X6907/0361",
        TRD_SH_CODE: "M04-0088",
        TRD_SH_NAME: "สับปะรดกวน",
        TRD_SH_QTY: 150,
        TRD_QTY: 150,
        TRD_UTQQTY: 1,
        TRD_WEIGHT: 0,
        TRD_UTQNAME: "KG",
      },
      {
        DI_DATE: "2026-07-15T00:00:00.000Z",
        DI_REF: "X6907/0362",
        TRD_SH_CODE: "M04-0088",
        TRD_SH_NAME: "สับปะรดกวน",
        TRD_SH_QTY: 50,
        TRD_QTY: 50,
        TRD_UTQQTY: 1,
        TRD_WEIGHT: 0,
        TRD_UTQNAME: "KG",
      },
      {
        DI_DATE: "2026-07-15T00:00:00.000Z",
        DI_REF: "X6907/0363",
        TRD_SH_CODE: "M04-0126-1",
        TRD_SH_NAME: "แยมสตรอเบอรี่ PJST3",
        TRD_SH_QTY: 30,
        TRD_QTY: 30,
        TRD_UTQQTY: 1,
        TRD_WEIGHT: 0,
        TRD_UTQNAME: "KG",
      },
      {
        DI_DATE: "2026-07-15T00:00:00.000Z",
        DI_REF: "X6907/0365",
        TRD_SH_CODE: "M04-0127-1",
        TRD_SH_NAME: "แยมรหัสใหม่",
        TRD_SH_QTY: 40,
        TRD_QTY: 40,
        TRD_UTQQTY: 1,
        TRD_WEIGHT: 0,
        TRD_UTQNAME: "KG",
      },
      {
        DI_DATE: "2026-07-15T00:00:00.000Z",
        DI_REF: "X6907/0364",
        TRD_SH_CODE: "M99-IGNORE",
        TRD_SH_NAME: "ไม่ใช่แยมในรายงาน",
        TRD_QTY: 999,
        TRD_UTQNAME: "KG",
      },
      {
        DI_DATE: "2026-07-15T00:00:00.000Z",
        DI_REF: "ADJO6907/0013",
        TRD_SH_CODE: "M04-0088",
        TRD_SH_NAME: "สับปะรดกวน",
        TRD_QTY: 9999,
        TRD_UTQQTY: 1,
        TRD_WEIGHT: 0,
        TRD_UTQNAME: "KG",
      },
    ],
  });

  assert.deepEqual(JAM_GOODS_CODES, ["M04-0088", "M04-0126-1", "M04-0127-1"]);
  assert.equal(isProductionJamRequisitionRef("X6907/0363"), true);
  assert.equal(isProductionJamRequisitionRef("ADJO6907/0013"), false);
  assert.equal(isProductionJamRequisitionRef("X6907/363"), false);
  assert.equal(report.days.length, 1);
  assert.deepEqual(
    report.days[0].jams.map((row) => ({
      code: row.code,
      quantity: row.quantity,
      unit: row.unit,
      weightKg: row.weightKg,
      requisitionCount: row.requisitionCount,
    })),
    [
      {
        code: "M04-0088",
        quantity: 20,
        unit: "KG",
        weightKg: 200,
        requisitionCount: 2,
      },
      {
        code: "M04-0126-1",
        quantity: 3,
        unit: "KG",
        weightKg: 30,
        requisitionCount: 1,
      },
      {
        code: "M04-0127-1",
        quantity: 4,
        unit: "KG",
        weightKg: 40,
        requisitionCount: 1,
      },
    ]
  );
});

test("maps the previous ERP requisition day to production even when SQL serializes midnight as 17:00Z", () => {
  const report = buildProductionInputOutputReport({
    jamRows: [
      {
        DI_DATE: "2026-07-15T17:00:00.000Z",
        DI_REF: "X6907/0363",
        TRD_SH_CODE: "M04-0088",
        TRD_SH_NAME: "สับปะรดกวน",
        TRD_QTY: 600,
        TRD_UTQQTY: 1,
        TRD_WEIGHT: 0,
        TRD_UTQNAME: "KG",
      },
    ],
    pieceRateRows: [
      {
        actualWeighedAt: "2026-07-17T01:00:00.000Z",
        productGoodsCode: "BL0-4004",
        productName: "ขนมปังกรอบ แยมสับปะรด",
        countValue: 1,
        normalizedKgAmount: 15,
      },
    ],
  });

  assert.equal(report.days.length, 1);
  assert.equal(report.days[0].date, "2026-07-17");
  assert.equal(report.days[0].jams[0].weightKg, 600);
  assert.equal(report.days[0].jams[0].quantity, 60);
  assert.equal(report.days[0].totals.fgQuantity, 1);
});

test("uses the explicit report day assigned while loading the previous day's jam", () => {
  const report = buildProductionInputOutputReport({
    jamRows: [
      {
        DI_DATE: "2026-07-15T17:00:00.000Z",
        DI_REF: "X6907/0363",
        reportDate: "2026-07-16",
        TRD_SH_CODE: "M04-0088",
        TRD_SH_NAME: "สับปะรดกวน",
        TRD_QTY: 950,
        TRD_UTQQTY: 1,
        TRD_WEIGHT: 0,
        TRD_UTQNAME: "KG",
      },
    ],
  });

  assert.equal(report.days.length, 1);
  assert.equal(report.days[0].date, "2026-07-16");
  assert.equal(report.days[0].jams[0].weightKg, 950);
  assert.equal(report.days[0].jams[0].quantity, 95);
});

test("parses an original jam issue reference from structured fields or the strict return remark", () => {
  assert.equal(
    getReferencedJamIssueRef({ TRD_REFER_REF: "X6907/0363" }),
    "X6907/0363"
  );
  assert.equal(
    getReferencedJamIssueRef({ TRD_REFER_REF: "T6909/00117" }),
    "T6909/00117"
  );
  assert.equal(
    getReferencedJamIssueRef({
      DI_REMARK: "อ้างถึงใบเบิก#X6907/0363:15/07/2569 ป้ายแยม แผนการผลิต 16/07/2569",
    }),
    "X6907/0363"
  );
  assert.equal(
    getReferencedJamIssueRef({ DI_REMARK: "คืนแยม X6907/0363 ตามใบเบิกเดิม" }),
    ""
  );
  assert.equal(
    getReferencedJamIssueRef({ DI_REMARK: "อ้างถึงใบเบิก#X6907/0363 ไม่มีเครื่องหมาย colon" }),
    ""
  );
  assert.equal(isActiveErpDocument({ DI_ACTIVE: 0 }), true);
  assert.equal(isActiveErpDocument({ DI_ACTIVE: 1 }), false);
  assert.equal(isProductionJamRequisitionRef("T6909/00117"), true);
});

test("adds same-day supplemental jam issues and subtracts returns from their own references", () => {
  const report = buildProductionInputOutputReport({
    jamRows: [
      {
        DI_ACTIVE: 0,
        DI_REF: "X6909/0100",
        reportDate: "2026-09-26",
        TRD_SH_CODE: "M04-0088",
        TRD_SH_NAME: "สับปะรดกวน",
        TRD_LOT_NO: "260924",
        TRD_QTY: 300,
        TRD_UTQQTY: 1,
        TRD_UTQNAME: "KG",
      },
      {
        DI_ACTIVE: 0,
        DI_REF: "T6909/00117",
        reportDate: "2026-09-26",
        TRD_SH_CODE: "M04-0088",
        TRD_SH_NAME: "สับปะรดกวน",
        TRD_LOT_NO: "260924",
        TRD_QTY: 200,
        TRD_UTQQTY: 1,
        TRD_UTQNAME: "KG",
      },
    ],
    jamReturnRows: [
      {
        DI_ACTIVE: 0,
        DI_REF: "IR6909/0200",
        TRD_REFER_REF: "X6909/0100",
        TRD_SH_CODE: "M04-0088",
        TRD_LOT_NO: "260924",
        TRD_QTY: 20,
        TRD_UTQQTY: 1,
        TRD_UTQNAME: "KG",
      },
      {
        DI_ACTIVE: 0,
        DI_REF: "IR6909/0201",
        TRD_REFER_REF: "T6909/00117",
        TRD_SH_CODE: "M04-0088",
        TRD_LOT_NO: "260924",
        TRD_QTY: 50,
        TRD_UTQQTY: 1,
        TRD_UTQNAME: "KG",
      },
    ],
  });

  const [jam] = report.days[0].jams;
  assert.equal(jam.issuedWeightKg, 500);
  assert.equal(jam.returnedWeightKg, 70);
  assert.equal(jam.weightKg, 430);
  assert.equal(jam.quantity, 43);
  assert.deepEqual(jam.issueRefs, ["T6909/00117", "X6909/0100"]);
  assert.deepEqual(jam.returnDocRefs, ["IR6909/0200", "IR6909/0201"]);
  assert.deepEqual(jam.lots, [{
    lotNo: "260924",
    quantity: 43,
    issuedWeightKg: 500,
    returnedWeightKg: 70,
    weightKg: 430,
    issueRefs: ["T6909/00117", "X6909/0100"],
    returnDocRefs: ["IR6909/0200", "IR6909/0201"],
  }]);
});

test("subtracts multiple active returns by original issue reference and exact jam code", () => {
  const report = buildProductionInputOutputReport({
    jamRows: [
      {
        DI_ACTIVE: 0,
        DI_REF: "X6907/0363",
        reportDate: "2026-07-16",
        TRD_SH_CODE: "M04-0088",
        TRD_SH_NAME: "สับปะรดกวน",
        TRD_LOT_NO: "JAM-LOT-A",
        TRD_WEIGHT: 500,
        TRD_UTQNAME: "KG",
      },
      {
        DI_ACTIVE: 0,
        DI_REF: "X6907/0363",
        reportDate: "2026-07-16",
        TRD_SH_CODE: "M04-0088",
        TRD_SH_NAME: "สับปะรดกวน",
        TRD_LOT_NO: "JAM-LOT-B",
        TRD_WEIGHT: 400,
        TRD_UTQNAME: "KG",
      },
    ],
    jamReturnRows: [
      {
        DI_ACTIVE: 0,
        DI_REF: "IR6907/0101",
        DI_REMARK: "อ้างถึงใบเบิก#X6907/0363:15/07/2569 คืนครั้งแรก",
        TRD_SH_CODE: "M04-0088",
        TRD_LOT_NO: "JAM-LOT-A",
        TRD_WEIGHT: 30,
        TRD_UTQNAME: "KG",
      },
      {
        DI_ACTIVE: 0,
        DI_REF: "IR6907/0102",
        DI_REMARK: "อ้างถึงใบเบิก#X6907/0363:15/07/2569 คืนครั้งที่สอง",
        TRD_SH_CODE: "M04-0088",
        TRD_LOT_NO: "JAM-LOT-B",
        TRD_WEIGHT: 70,
        TRD_UTQNAME: "KG",
      },
      {
        DI_ACTIVE: 0,
        DI_REMARK: "อ้างถึงใบเบิก#X6907/0363:15/07/2569 คนละรหัสแยม",
        TRD_SH_CODE: "M04-0126-1",
        TRD_WEIGHT: 400,
        TRD_UTQNAME: "KG",
      },
      {
        DI_ACTIVE: 1,
        DI_REMARK: "อ้างถึงใบเบิก#X6907/0363:15/07/2569 เอกสารถูกยกเลิก",
        TRD_SH_CODE: "M04-0088",
        TRD_WEIGHT: 500,
        TRD_UTQNAME: "KG",
      },
      {
        DI_ACTIVE: 0,
        DI_REMARK: "คืนแยม X6907/0363 แต่รูปแบบหมายเหตุไม่ถูกต้อง",
        TRD_SH_CODE: "M04-0088",
        TRD_WEIGHT: 200,
        TRD_UTQNAME: "KG",
      },
    ],
  });

  assert.equal(report.days.length, 1);
  assert.deepEqual(
    {
      date: report.days[0].date,
      code: report.days[0].jams[0].code,
      issuedWeightKg: report.days[0].jams[0].issuedWeightKg,
      returnedWeightKg: report.days[0].jams[0].returnedWeightKg,
      weightKg: report.days[0].jams[0].weightKg,
      quantity: report.days[0].jams[0].quantity,
      returnCount: report.days[0].jams[0].returnCount,
    },
    {
      date: "2026-07-16",
      code: "M04-0088",
      issuedWeightKg: 900,
      returnedWeightKg: 100,
      weightKg: 800,
      quantity: 80,
      returnCount: 2,
    }
  );
  assert.deepEqual(report.days[0].jams[0].lots, [
    {
      lotNo: "JAM-LOT-A",
      quantity: 47,
      issuedWeightKg: 500,
      returnedWeightKg: 30,
      weightKg: 470,
      issueRefs: ["X6907/0363"],
      returnDocRefs: ["IR6907/0101"],
    },
    {
      lotNo: "JAM-LOT-B",
      quantity: 33,
      issuedWeightKg: 400,
      returnedWeightKg: 70,
      weightKg: 330,
      issueRefs: ["X6907/0363"],
      returnDocRefs: ["IR6907/0102"],
    },
  ]);
  assert.deepEqual(report.warnings, []);
});

test("keeps an over-return negative and emits a visible data warning", () => {
  const report = buildProductionInputOutputReport({
    jamRows: [
      {
        DI_ACTIVE: 0,
        DI_REF: "X6907/0400",
        reportDate: "2026-07-20",
        TRD_SH_CODE: "M04-0088",
        TRD_WEIGHT: 50,
        TRD_UTQNAME: "KG",
      },
    ],
    jamReturnRows: [
      {
        DI_ACTIVE: 0,
        TRD_REFER_REF: "X6907/0400",
        TRD_SH_CODE: "M04-0088",
        TRD_WEIGHT: 60,
        TRD_UTQNAME: "KG",
      },
    ],
  });

  assert.equal(report.days[0].jams[0].weightKg, -10);
  assert.equal(report.days[0].jams[0].quantity, -1);
  assert.equal(report.warnings.length, 1);
  assert.equal(report.warnings[0].source, "แยมใช้จริง");
  assert.match(report.warnings[0].message, /คืน 60 กก\. เกินยอดเบิก 50 กก\./);
});

test("shows shared shell metrics once while keeping every related FG row", () => {
  const report = buildProductionInputOutputReport({
    stockRows: [
      {
        issueDate: "2026-07-15",
        lotNo: "1108260064-1",
        productCode: "WKB-0002",
        productName: "แผ่นแครกเกอร์โบตั๋น",
        actualQuantity: 45,
        actualWeightKg: 950.305,
      },
      {
        issueDate: "2026-07-15",
        lotNo: "1308260064-1",
        productCode: "WKB-0002",
        productName: "แผ่นแครกเกอร์โบตั๋น",
        actualQuantity: 75,
        actualWeightKg: 579.945,
      },
    ],
    pieceRateRows: [
      {
        actualWeighedAt: "2026-07-15T01:00:00.000Z",
        productCode: "FG-A",
        productName: "แครกเกอร์โบตั๋นป้ายแยม",
        countValue: 500,
        normalizedKgAmount: 1250,
      },
      {
        actualWeighedAt: "2026-07-15T02:00:00.000Z",
        productCode: "FG-B",
        productName: "แครกเกอร์โบตั๋นกลิ่นส้ม",
        countValue: 350,
        normalizedKgAmount: 875,
      },
    ],
    wasteRows: [
      {
        actualWeighedAt: "2026-07-15T03:00:00.000Z",
        productCode: "FG-A",
        productName: "แครกเกอร์โบตั๋นป้ายแยม",
        wasteWeightKg: 12.5,
        status: "confirmed",
      },
      {
        actualWeighedAt: "2026-07-15T04:00:00.000Z",
        productCode: "FG-A",
        productName: "แครกเกอร์โบตั๋นป้ายแยม",
        wasteWeightKg: 1.5,
        status: "cancelled",
      },
      {
        actualWeighedAt: "2026-07-15T05:00:00.000Z",
        productCode: "FG-B",
        productName: "แครกเกอร์โบตั๋นกลิ่นส้ม",
        wasteWeightKg: 5,
        status: "confirmed",
      },
    ],
    bomMappings: [
      { fgCode: "FG-A", shellCode: "WKB-0002", shellName: "แผ่นแครกเกอร์โบตั๋น" },
      { fgCode: "FG-B", shellCode: "WKB-0002", shellName: "แผ่นแครกเกอร์โบตั๋น" },
    ],
  });

  assert.equal(report.days.length, 1);
  const [first, second] = report.days[0].rows;
  assert.equal(first.shellCode, "WKB-0002");
  assert.equal(first.shellQuantity, 120);
  assert.equal(first.shellWeightKg, 1530.25);
  assert.deepEqual(first.shellLots, [
    { lotNo: "1108260064-1", quantity: 45, weightKg: 950.305 },
    { lotNo: "1308260064-1", quantity: 75, weightKg: 579.945 },
  ]);
  assert.equal(first.fgCode, "FG-A");
  assert.equal(first.wasteQuantity, 1);
  assert.equal(first.wasteWeightKg, 12.5);

  assert.equal(second.shellCode, "WKB-0002");
  assert.equal(second.shellQuantity, null);
  assert.equal(second.shellWeightKg, null);
  assert.equal(second.fgCode, "FG-B");
  assert.equal(second.wasteQuantity, 1);
  assert.equal(second.wasteWeightKg, 5);

  assert.deepEqual(report.days[0].totals, {
    shellQuantity: 120,
    shellWeightKg: 1530.25,
    wasteQuantity: 2,
    wasteWeightKg: 17.5,
    labelScrapWeightKg: 17.5,
    brokenScrapWeightKg: 0,
    burntScrapWeightKg: 0,
    fgQuantity: 850,
    fgWeightKg: 2125,
  });
});

test("separates shell usage by room and leaves room 400 output empty", () => {
  const report = buildProductionInputOutputReport({
    stockRows: [
      {
        issueDate: "2026-10-01",
        lotNo: "0110260002-1",
        productCode: "WKB-0002",
        productName: "แผ่นแครกเกอร์โบตั๋น",
        destinationRoomCode: "BISCUIT_PACKING",
        destinationRoomName: "ห้องบรรจุบิสกิต",
        actualQuantity: 2,
        actualWeightKg: 20,
      },
      {
        issueDate: "2026-10-01",
        lotNo: "0110260002-1",
        productCode: "WKB-0002",
        productName: "แผ่นแครกเกอร์โบตั๋น",
        destinationRoomCode: "PACKING_400",
        destinationRoomName: "ห้องบรรจุ 400",
        actualQuantity: 3,
        actualWeightKg: 30,
      },
    ],
    bomMappings: [
      { fgCode: "FG-LEGACY", shellCode: "WKB-0002", shellName: "แผ่นแครกเกอร์โบตั๋น" },
    ],
    pieceRateRows: [{
      actualWeighedAt: "2026-10-01T08:00:00+07:00",
      productCode: "FG-LEGACY",
      productName: "ผลผลิตห้องบรรจุบิสกิต",
      countValue: 1,
      normalizedKgAmount: 18,
    }],
  });

  assert.deepEqual(
    report.days[0].rows.map((row) => [row.destinationRoomCode, row.fgCode, row.shellQuantity, row.shellWeightKg]),
    [["BISCUIT_PACKING", "FG-LEGACY", 2, 20], ["PACKING_400", "", 3, 30]]
  );
  assert.equal(report.days[0].rows[1].fgWeightKg, null);
});

test("accepts manual jam usage rows as actual report input", () => {
  const report = buildProductionInputOutputReport({
    jamRows: [{
      source: "APP",
      reportDate: "2026-10-01",
      DI_REF: "APP:jam-1",
      TRD_SH_CODE: "M04-0088",
      TRD_SH_NAME: "สับปะรดกวน",
      TRD_LOT_NO: "LOT-JAM-01",
      TRD_QTY: 125.5,
      TRD_UTQQTY: 1,
      TRD_UTQNAME: "KG",
    }],
  });

  assert.equal(report.days[0].jams[0].weightKg, 125.5);
  assert.equal(report.days[0].jams[0].lots[0].lotNo, "LOT-JAM-01");
});

test("manual jam usage replaces ERP only for the same report date and jam code", () => {
  const merged = mergeManualJamUsageRows({
    issueRows: [
      { reportDate: "2026-10-01", DI_REF: "X6910/0001", TRD_SH_CODE: "M04-0088" },
      { reportDate: "2026-10-01", DI_REF: "X6910/0002", TRD_SH_CODE: "M04-0126-1" },
    ],
    returnRows: [
      { TRD_REFER_REF: "X6910/0001", TRD_SH_CODE: "M04-0088" },
      { TRD_REFER_REF: "X6910/0002", TRD_SH_CODE: "M04-0126-1" },
    ],
  }, [{
    id: "jam-1",
    usageDate: "2026-10-01",
    goodsCode: "M04-0088",
    goodsName: "สับปะรดกวน",
    lotNo: "LOT-1",
    weightKg: 125,
  }]);

  assert.deepEqual(merged.issueRows.map((row) => row.DI_REF), ["X6910/0002", "APP:jam-1"]);
  assert.deepEqual(merged.returnRows.map((row) => row.TRD_REFER_REF), ["X6910/0002"]);
});

test("allocates one jam issue across related FG rows by actual output and BOM ratio", () => {
  const report = buildProductionInputOutputReport({
    jamRows: [{
      reportDate: "2026-09-25",
      DI_REF: "X6909/0539",
      TRD_SH_CODE: "M04-0126-1",
      TRD_SH_NAME: "แยมสตรอเบอรี่ PJST3",
      TRD_LOT_NO: "260918",
      TRD_QTY: 270,
      TRD_UTQQTY: 1,
      TRD_UTQNAME: "KG",
    }],
    pieceRateRows: [
      {
        actualWeighedAt: "2026-09-25T08:00:00+07:00",
        productCode: "FG-A",
        productName: "สินค้า A",
        countValue: 20,
        normalizedKgAmount: 400,
      },
      {
        actualWeighedAt: "2026-09-25T09:00:00+07:00",
        productCode: "FG-B",
        productName: "สินค้า B",
        countValue: 10,
        normalizedKgAmount: 200,
      },
    ],
    bomMappings: [
      { fgCode: "FG-A", jamCode: "M04-0126-1", jamQty: 300, baseBatch: 600 },
      { fgCode: "FG-B", jamCode: "M04-0126-1", jamQty: 300, baseBatch: 600 },
    ],
  });

  const [first, second] = report.days[0].rows;
  assert.equal(first.fgCode, "FG-A");
  assert.equal(first.jam.code, "M04-0126-1");
  assert.equal(first.jam.weightKg, 180);
  assert.equal(first.jam.quantity, 18);
  assert.deepEqual(first.jam.lots, [{ lotNo: "260918", quantity: 18, weightKg: 180 }]);
  assert.equal(second.fgCode, "FG-B");
  assert.equal(second.jam.weightKg, 90);
  assert.equal(second.jam.quantity, 9);
  assert.deepEqual(second.jam.lots, [{ lotNo: "260918", quantity: 9, weightKg: 90 }]);
  assert.equal(first.jam.weightKg + second.jam.weightKg, 270);
});

test("uses the operator-confirmed Oct 8 pineapple jam allocation without changing its total", () => {
  const report = buildProductionInputOutputReport({
    jamRows: [
      { source: "APP", reportDate: "2026-10-08", DI_REF: "APP:lot-1", TRD_SH_CODE: "M04-0088", TRD_SH_NAME: "สับปะรดกวน", TRD_LOT_NO: "260924", TRD_QTY: 260, TRD_UTQQTY: 1, TRD_UTQNAME: "KG" },
      { source: "APP", reportDate: "2026-10-08", DI_REF: "APP:lot-2", TRD_SH_CODE: "M04-0088", TRD_SH_NAME: "สับปะรดกวน", TRD_LOT_NO: "260928", TRD_QTY: 290, TRD_UTQQTY: 1, TRD_UTQNAME: "KG" },
    ],
    pieceRateRows: [
      { actualWeighedAt: "2026-10-08T08:00:00+07:00", productCode: "WKB-0002-1", productName: "สินค้า A", countValue: 41, normalizedKgAmount: 620.65 },
      { actualWeighedAt: "2026-10-08T09:00:00+07:00", productCode: "WKB-0065", productName: "สินค้า B", countValue: 37, normalizedKgAmount: 578.32 },
    ],
    stockRows: [
      { issueDate: "2026-10-08", productCode: "WKB-0002", productName: "เปลือก A", actualQuantity: 26, actualWeightKg: 326.94 },
      { issueDate: "2026-10-08", productCode: "WKB-0050", productName: "เปลือก B", actualQuantity: 26.07, actualWeightKg: 326.16 },
    ],
    bomMappings: [
      { fgCode: "WKB-0002-1", shellCode: "WKB-0002", shellName: "เปลือก A", jamCode: "M04-0088", jamQty: 300, baseBatch: 600 },
      { fgCode: "WKB-0065", shellCode: "WKB-0050", shellName: "เปลือก B", jamCode: "M04-0088", jamQty: 300, baseBatch: 600 },
    ],
  });

  const rows = report.days[0].rows.filter((row) => row.jam?.code === "M04-0088");
  assert.deepEqual(rows.map((row) => [row.fgCode, row.jam.weightKg]), [
    ["WKB-0002-1", 296.91],
    ["WKB-0065", 253.09],
  ]);
  assert.equal(rows.reduce((sum, row) => sum + row.jam.weightKg, 0), 550);
});

test("uses the operator-confirmed Oct 9 pineapple jam allocation without changing its total", () => {
  const report = buildProductionInputOutputReport({
    jamRows: [
      { source: "APP", reportDate: "2026-10-09", DI_REF: "APP:lot-1", TRD_SH_CODE: "M04-0088", TRD_SH_NAME: "สับปะรดกวน", TRD_LOT_NO: "260924", TRD_QTY: 760, TRD_UTQQTY: 1, TRD_UTQNAME: "KG" },
    ],
    pieceRateRows: [
      { actualWeighedAt: "2026-10-09T08:00:00+07:00", productCode: "WKB-0002-1", productName: "สินค้า A", countValue: 35, normalizedKgAmount: 553 },
      { actualWeighedAt: "2026-10-09T09:00:00+07:00", productCode: "WKB-0065", productName: "สินค้า B", countValue: 73, normalizedKgAmount: 1159.81 },
    ],
    stockRows: [
      { issueDate: "2026-10-09", productCode: "WKB-0002", productName: "เปลือก A", actualQuantity: 24, actualWeightKg: 298.61 },
      { issueDate: "2026-10-09", productCode: "WKB-0050", productName: "เปลือก B", actualQuantity: 56, actualWeightKg: 668.36 },
    ],
    bomMappings: [
      { fgCode: "WKB-0002-1", shellCode: "WKB-0002", shellName: "เปลือก A", jamCode: "M04-0088", jamQty: 300, baseBatch: 600 },
      { fgCode: "WKB-0065", shellCode: "WKB-0050", shellName: "เปลือก B", jamCode: "M04-0088", jamQty: 300, baseBatch: 600 },
    ],
  });

  const rows = report.days[0].rows.filter((row) => row.jam?.code === "M04-0088");
  assert.deepEqual(rows.map((row) => [row.fgCode, row.jam.weightKg]), [
    ["WKB-0002-1", 260],
    ["WKB-0065", 500],
  ]);
  assert.deepEqual(rows.map((row) => row.jam.lots[0]), [
    { lotNo: "260924", quantity: 26, weightKg: 260 },
    { lotNo: "260924", quantity: 50, weightKg: 500 },
  ]);
  assert.equal(rows.reduce((sum, row) => sum + row.jam.weightKg, 0), 760);
});

test("uses the operator-confirmed Oct 14 pineapple jam allocation without changing its total", () => {
  const report = buildProductionInputOutputReport({
    jamRows: [
      { source: "APP", reportDate: "2026-10-14", DI_REF: "APP:lot-1", TRD_SH_CODE: "M04-0088", TRD_SH_NAME: "สับปะรดกวน", TRD_LOT_NO: "261007", TRD_QTY: 430, TRD_UTQQTY: 1, TRD_UTQNAME: "KG" },
    ],
    pieceRateRows: [
      { actualWeighedAt: "2026-10-14T08:00:00+07:00", productCode: "WKB-0064", productName: "สินค้า A", countValue: 37, normalizedKgAmount: 522.01 },
      { actualWeighedAt: "2026-10-14T09:00:00+07:00", productCode: "WKB-0065", productName: "สินค้า B", countValue: 35, normalizedKgAmount: 534.48 },
    ],
    stockRows: [
      { issueDate: "2026-10-14", productCode: "WKB-0047", productName: "เปลือก A", actualQuantity: 28, actualWeightKg: 324.64 },
      { issueDate: "2026-10-14", productCode: "WKB-0050", productName: "เปลือก B", actualQuantity: 26.237, actualWeightKg: 307.651 },
    ],
    bomMappings: [
      { fgCode: "WKB-0064", shellCode: "WKB-0047", shellName: "เปลือก A", jamCode: "M04-0088", jamQty: 300, baseBatch: 600 },
      { fgCode: "WKB-0065", shellCode: "WKB-0050", shellName: "เปลือก B", jamCode: "M04-0088", jamQty: 300, baseBatch: 600 },
    ],
  });

  const rows = report.days[0].rows.filter((row) => row.jam?.code === "M04-0088");
  assert.deepEqual(rows.map((row) => [row.fgCode, row.jam.weightKg]), [
    ["WKB-0064", 200],
    ["WKB-0065", 230],
  ]);
  assert.deepEqual(rows.map((row) => row.jam.lots[0]), [
    { lotNo: "261007", quantity: 20, weightKg: 200 },
    { lotNo: "261007", quantity: 23, weightKg: 230 },
  ]);
  assert.equal(rows.reduce((sum, row) => sum + row.jam.weightKg, 0), 430);
});

test("pairs B06-0006 with WKB-0052 only on the Sep 28 report override", () => {
  const report = buildProductionInputOutputReport({
    stockRows: [
      { issueDate: "2026-09-28", productCode: "WKB-0045", productName: "แผ่นแครกเกอร์สมุย", actualQuantity: 8, actualWeightKg: 100.65 },
      { issueDate: "2026-09-28", productCode: "WKB-0052", productName: "แผ่นแครกเกอร์โคบิส", actualQuantity: 22, actualWeightKg: 270.97 },
      { issueDate: "2026-09-29", productCode: "WKB-0045", productName: "แผ่นแครกเกอร์สมุย", actualQuantity: 9, actualWeightKg: 110 },
      { issueDate: "2026-09-29", productCode: "WKB-0052", productName: "แผ่นแครกเกอร์โคบิส", actualQuantity: 23, actualWeightKg: 280 },
    ],
    pieceRateRows: [
      { actualWeighedAt: "2026-09-28T08:00:00+07:00", productCode: "B06-0006", productName: "แม่มะลิ สมุย", countValue: 239, normalizedKgAmount: 262.9 },
      { actualWeighedAt: "2026-09-29T08:00:00+07:00", productCode: "B06-0006", productName: "แม่มะลิ สมุย", countValue: 240, normalizedKgAmount: 264 },
    ],
    bomMappings: [
      { fgCode: "B06-0006", shellCode: "WKB-0045", shellName: "แผ่นแครกเกอร์สมุย" },
    ],
  });

  const sep28 = report.days.find((day) => day.date === "2026-09-28");
  const sep29 = report.days.find((day) => day.date === "2026-09-29");
  assert.equal(sep28.rows.find((row) => row.fgCode === "B06-0006")?.shellCode, "WKB-0052");
  assert.equal(sep28.rows.find((row) => row.shellCode === "WKB-0045")?.fgCode, "");
  assert.equal(sep29.rows.find((row) => row.fgCode === "B06-0006")?.shellCode, "WKB-0045");
});

test("pairs an actually issued substitute shell with its FG", () => {
  const report = buildProductionInputOutputReport({
    stockRows: [{
      issueDate: "2026-09-29",
      productCode: "WKB-0068",
      productName: "แผ่นแครกเกอร์โบตั๋นเรือนจำ",
      actualQuantity: 60,
      actualWeightKg: 723.23,
    }],
    pieceRateRows: [{
      actualWeighedAt: "2026-09-29T08:00:00+07:00",
      productCode: "B03-0003",
      productName: "แม่มะลิ แยมสับปะรด 5 กก.",
      countValue: 286,
      normalizedKgAmount: 1430.74,
    }],
    bomMappings: [
      { fgCode: "B03-0003", shellCode: "WKB-0002", shellName: "แผ่นแครกเกอร์โบตั๋น" },
      { fgCode: "B03-0003", shellCode: "WKB-0068", shellName: "แผ่นแครกเกอร์โบตั๋นเรือนจำ" },
    ],
  });

  assert.equal(report.days[0].rows.length, 1);
  assert.equal(report.days[0].rows[0].shellCode, "WKB-0068");
  assert.equal(report.days[0].rows[0].fgCode, "B03-0003");

  const dataSource = fs.readFileSync(
    path.join(repoRoot, "src/lib/production-input-output-data.js"),
    "utf8"
  );
  assert.match(dataSource, /substitute_material_sku_codes/);
});

test("keeps FG metrics and jam on the uniquely matching substitute shell", () => {
  const report = buildProductionInputOutputReport({
    stockRows: [
      {
        issueDate: "2026-10-01",
        productCode: "WKB-0002",
        productName: "แผ่นแครกเกอร์โบตั๋น",
        actualQuantity: 41,
        actualWeightKg: 504.73,
      },
      {
        issueDate: "2026-10-01",
        productCode: "WKB-0068",
        productName: "แผ่นแครกเกอร์โบตั๋นเรือนจำ",
        actualQuantity: 15,
        actualWeightKg: 181.1,
      },
    ],
    pieceRateRows: [
      {
        actualWeighedAt: "2026-10-01T08:00:00+07:00",
        productCode: "WKB-0002-1",
        productName: "เนื้อขนมแครกเกอร์โบตั๋นป้ายแยมสับปะรดเคพี",
        countValue: 74,
        normalizedKgAmount: 1113.15,
      },
      {
        actualWeighedAt: "2026-10-01T09:00:00+07:00",
        productCode: "WKB-0067",
        productName: "เนื้อขนมแครกเกอร์โบตั๋นป้ายแยมสตรอ",
        countValue: 15,
        normalizedKgAmount: 218.19,
      },
    ],
    jamRows: [{
      reportDate: "2026-10-01",
      DI_REF: "X6910/0001",
      TRD_SH_CODE: "M04-0126-1",
      TRD_SH_NAME: "แยมสตรอเบอร์รี่ PJST3",
      TRD_LOT_NO: "260929",
      TRD_QTY: 110,
      TRD_UTQQTY: 1,
      TRD_UTQNAME: "KG",
    }],
    bomMappings: [
      { fgCode: "WKB-0002-1", shellCode: "WKB-0002" },
      {
        fgCode: "WKB-0067",
        shellCode: "WKB-0002",
        jamCode: "M04-0126-1",
        jamQty: 300,
        baseBatch: 600,
      },
      {
        fgCode: "WKB-0067",
        shellCode: "WKB-0068",
        jamCode: "M04-0126-1",
        jamQty: 300,
        baseBatch: 600,
      },
    ],
  });

  assert.equal(report.days[0].rows.length, 2);
  assert.equal(
    report.days[0].rows.find((row) => row.shellCode === "WKB-0002")?.fgCode,
    "WKB-0002-1"
  );
  const substituteRow = report.days[0].rows.find((row) => row.shellCode === "WKB-0068");
  assert.equal(substituteRow?.fgCode, "WKB-0067");
  assert.equal(substituteRow?.fgQuantity, 15);
  assert.equal(substituteRow?.fgWeightKg, 218.19);
  assert.equal(substituteRow?.jam?.code, "M04-0126-1");
  assert.equal(substituteRow?.jam?.weightKg, 110);
});

test("keeps unmatched shell and FG rows so daily costing inputs are not hidden", () => {
  const report = buildProductionInputOutputReport({
    stockRows: [
      {
        issueDate: "2026-07-15",
        productCode: "WKB-0099",
        productName: "เปลือกที่ยังไม่ผูก BOM",
        actualQuantity: 4,
        actualWeightKg: 40,
      },
    ],
    pieceRateRows: [
      {
        actualWeighedAt: "2026-07-15T08:00:00+07:00",
        productCode: "FG-X",
        productName: "FG ที่ยังไม่ผูก BOM",
        countValue: 10,
        normalizedKgAmount: 20,
      },
    ],
  });

  assert.equal(report.days[0].rows.length, 2);
  assert.ok(report.days[0].rows.some((row) => row.shellCode === "WKB-0099" && !row.fgCode));
  assert.ok(report.days[0].rows.some((row) => row.fgCode === "FG-X" && !row.shellCode));
});

test("does not show a shell when its actual issued quantity and weight are both zero", () => {
  const report = buildProductionInputOutputReport({
    stockRows: [
      {
        issueDate: "2026-07-17",
        productCode: "WKB-ZERO",
        productName: "เปลือกที่ไม่ได้เบิก",
        actualQuantity: 0,
        actualWeightKg: 0,
      },
    ],
    pieceRateRows: [
      {
        actualWeighedAt: "2026-07-17T08:00:00+07:00",
        productCode: "FG-A",
        productName: "สินค้าสำเร็จรูป",
        countValue: 10,
        normalizedKgAmount: 100,
      },
    ],
    bomMappings: [
      {
        fgCode: "FG-A",
        shellCode: "WKB-ZERO",
        shellName: "เปลือกที่ไม่ได้เบิก",
      },
    ],
  });

  assert.equal(report.days.length, 1);
  assert.equal(report.days[0].rows.length, 1);
  assert.equal(report.days[0].rows[0].fgCode, "FG-A");
  assert.equal(report.days[0].rows[0].shellCode, "");
  assert.equal(report.days[0].totals.shellQuantity, 0);
  assert.equal(report.days[0].totals.shellWeightKg, 0);
});

test("does not show pineapple jam when its requisition weight is zero", () => {
  const report = buildProductionInputOutputReport({
    jamRows: [
      {
        DI_DATE: "2026-07-16T00:00:00.000Z",
        DI_REF: "X6907/0363",
        TRD_SH_CODE: "M04-0088",
        TRD_SH_NAME: "สับปะรดกวน",
        TRD_QTY: 0,
        TRD_UTQQTY: 1,
        TRD_WEIGHT: 0,
        TRD_UTQNAME: "KG",
      },
    ],
    pieceRateRows: [
      {
        actualWeighedAt: "2026-07-17T08:00:00+07:00",
        productCode: "FG-A",
        productName: "สินค้าสำเร็จรูป",
        countValue: 1,
        normalizedKgAmount: 10,
      },
    ],
  });

  assert.equal(report.days.length, 1);
  assert.deepEqual(report.days[0].jams, []);

  const componentSource = fs.readFileSync(
    path.join(repoRoot, "src/features/production-line/components/ProductionInputOutputReportPageClient.js"),
    "utf8"
  );
  assert.doesNotMatch(componentSource, /ไม่พบรายการเบิกในวันนี้/);
  assert.match(componentSource, /jam: page\.rows\[index\]\?\.jam \|\| null/);
});

test("keeps legacy waste rows without a category in the label column", () => {
  const report = buildProductionInputOutputReport({
    wasteRows: [{
      actualWeighedAt: "2026-09-01T11:30:11.841Z",
      productCode: "WKB-0002-1",
      productName: "เนื้อขนมแครกเกอร์",
      wasteWeightKg: 2.41,
      wasteCategory: null,
      status: "confirmed",
    }],
  });
  const [row] = report.days[0].rows;
  assert.equal(row.wasteWeightKg, 2.41);
  assert.equal(row.labelScrapWeightKg, 2.41);
  assert.equal(row.brokenScrapWeightKg, 0);
  assert.equal(row.burntScrapWeightKg, 0);
});

test("allocates shell proportionally across multiple FGs line-by-line for dates on or after 2026-10-06", () => {
  const report = buildProductionInputOutputReport({
    stockRows: [
      {
        issueDate: "2026-10-06",
        productCode: "WKB-0002",
        productName: "แผ่นแครกเกอร์โบตั๋น",
        destinationRoomCode: "BISCUIT_PACKING",
        actualQuantity: 50,
        actualWeightKg: 500,
        lotNo: "LOT-01",
      },
    ],
    pieceRateRows: [
      {
        actualWeighedAt: "2026-10-06T08:00:00+07:00",
        productCode: "WKB-0002-1",
        productName: "เนื้อขนมแครกเกอร์โบตั๋นป้ายแยมสับปะรด",
        countValue: 60,
        normalizedKgAmount: 600,
      },
      {
        actualWeighedAt: "2026-10-06T09:00:00+07:00",
        productCode: "WKB-0067",
        productName: "เนื้อขนมแครกเกอร์โบตั๋นป้ายแยมสตรอ",
        countValue: 40,
        normalizedKgAmount: 400,
      },
    ],
    bomMappings: [
      { fgCode: "WKB-0002-1", shellCode: "WKB-0002" },
      { fgCode: "WKB-0067", shellCode: "WKB-0002" },
    ],
  });

  const day = report.days.find((d) => d.date === "2026-10-06");
  assert.ok(day);
  assert.equal(day.rows.length, 2);

  const row1 = day.rows[0];
  const row2 = day.rows[1];

  assert.equal(row1.fgCode, "WKB-0002-1");
  assert.equal(row1.shellQuantity, 30);
  assert.equal(row1.shellWeightKg, 300);
  assert.deepEqual(row1.shellLots, [{ lotNo: "LOT-01", quantity: 30, weightKg: 300 }]);

  assert.equal(row2.fgCode, "WKB-0067");
  assert.equal(row2.shellQuantity, 20);
  assert.equal(row2.shellWeightKg, 200);
  assert.deepEqual(row2.shellLots, [{ lotNo: "LOT-01", quantity: 20, weightKg: 200 }]);

  assert.equal(row1.shellWeightKg + row2.shellWeightKg, 500);
});

test("applies 60:40 special ratio for WKB-0064 and B03-0012 when allocating shell", () => {
  const report = buildProductionInputOutputReport({
    stockRows: [
      {
        issueDate: "2026-10-07",
        productCode: "WKB-0047",
        productName: "แผ่นแครกเกอร์งา",
        destinationRoomCode: "BISCUIT_PACKING",
        actualQuantity: 100,
        actualWeightKg: 1000,
        lotNo: "LOT-02",
      },
    ],
    pieceRateRows: [
      {
        actualWeighedAt: "2026-10-07T08:00:00+07:00",
        productCode: "WKB-0064",
        productName: "เนื้อขนมออพายป้ายแยมสับปะรด",
        countValue: 50,
        normalizedKgAmount: 500,
      },
      {
        actualWeighedAt: "2026-10-07T09:00:00+07:00",
        productCode: "OTHER-FG",
        productName: "สินค้าทั่วไป",
        countValue: 50,
        normalizedKgAmount: 500,
      },
    ],
    bomMappings: [
      { fgCode: "WKB-0064", shellCode: "WKB-0047" },
      { fgCode: "OTHER-FG", shellCode: "WKB-0047" },
    ],
  });

  const day = report.days.find((d) => d.date === "2026-10-07");
  assert.ok(day);
  assert.equal(day.rows.length, 2);

  const row1 = day.rows[0];
  const row2 = day.rows[1];

  // WKB-0064 weight = 500 * 0.60 = 300
  // OTHER-FG weight = 500 * 0.52 = 260
  // Total weight = 560
  // WKB-0064 shell weight = round(1000 * 300 / 560) = 535.714
  // OTHER-FG shell weight = round(1000 - 535.714) = 464.286
  assert.equal(row1.fgCode, "OTHER-FG");
  assert.equal(row2.fgCode, "WKB-0064");
  assert.equal(row2.shellWeightKg, 535.714);
  assert.equal(row1.shellWeightKg, 464.286);
  assert.equal(row1.shellWeightKg + row2.shellWeightKg, 1000);
});

test("allocates jam only to FG rows with issued shell when shell-backed candidates exist", () => {
  const report = buildProductionInputOutputReport({
    stockRows: [
      {
        issueDate: "2026-10-06",
        productCode: "WKB-0050",
        productName: "แผนแครกเกอร์สั้นบีเวอร์",
        destinationRoomCode: "BISCUIT_PACKING",
        actualQuantity: 42,
        actualWeightKg: 515.72,
        lotNo: "0310260050-1",
      },
    ],
    jamRows: [
      {
        reportDate: "2026-10-06",
        DI_REF: "X6910/0083",
        TRD_SH_CODE: "M04-0088",
        TRD_SH_NAME: "สับปะรดกวน",
        TRD_LOT_NO: "260928",
        TRD_QTY: 500,
        TRD_UTQQTY: 1,
        TRD_UTQNAME: "KG",
      },
    ],
    pieceRateRows: [
      {
        actualWeighedAt: "2026-10-06T08:00:00+07:00",
        productCode: "WKB-0065",
        productName: "เนื้อขนมบีเวอร์ป้ายแยมสัปบะรด",
        countValue: 63,
        normalizedKgAmount: 990.96,
      },
      {
        actualWeighedAt: "2026-10-06T09:00:00+07:00",
        productCode: "BL0-1104",
        productName: "ขนมปังกรอบ แยมสับปะรด 1.1 กก. (6ปี๊บ)",
        countValue: 1200,
        normalizedKgAmount: 1320,
      },
    ],
    bomMappings: [
      { fgCode: "WKB-0065", shellCode: "WKB-0050", jamCode: "M04-0088", jamQty: 1, baseBatch: 1 },
      { fgCode: "BL0-1104", shellCode: "WKB-0002", jamCode: "M04-0088", jamQty: 990, baseBatch: 1 },
    ],
  });

  const day = report.days.find((d) => d.date === "2026-10-06");
  assert.ok(day);

  const wkb0065Row = day.rows.find((r) => r.fgCode === "WKB-0065");
  const bl01104Row = day.rows.find((r) => r.fgCode === "BL0-1104");

  assert.ok(wkb0065Row);
  assert.ok(bl01104Row);

  // WKB-0065 has shell issued -> receives all 500 kg of jam
  assert.equal(wkb0065Row.jam?.code, "M04-0088");
  assert.equal(wkb0065Row.jam?.weightKg, 500);
  assert.equal(wkb0065Row.jam?.quantity, 50);

  // BL0-1104 has no shell issued -> does not receive jam
  assert.equal(bl01104Row.jam, null);
});

test("pools Botan shells WKB-0002 and WKB-0068 together for dates on or after SHELL_POOL_EFFECTIVE_DATE", () => {
  const report = buildProductionInputOutputReport({
    stockRows: [
      {
        issueDate: "2026-10-06",
        productCode: "WKB-0002",
        productName: "แผ่นแครกเกอร์โบตั๋น",
        destinationRoomCode: "BISCUIT_PACKING",
        actualQuantity: 41,
        actualWeightKg: 504.73,
        lotNo: "LOT-0002",
      },
      {
        issueDate: "2026-10-06",
        productCode: "WKB-0068",
        productName: "แผ่นแครกเกอร์โบตั๋นเรือนจำ",
        destinationRoomCode: "BISCUIT_PACKING",
        actualQuantity: 15,
        actualWeightKg: 181.1,
        lotNo: "LOT-0068",
      },
    ],
    pieceRateRows: [
      {
        actualWeighedAt: "2026-10-06T08:00:00+07:00",
        productCode: "WKB-0002-1",
        productName: "เนื้อขนมแครกเกอร์โบตั๋นป้ายแยมสับปะรดเคพี",
        countValue: 74,
        normalizedKgAmount: 1113.15,
      },
      {
        actualWeighedAt: "2026-10-06T09:00:00+07:00",
        productCode: "WKB-0067",
        productName: "เนื้อขนมแครกเกอร์โบตั๋นป้ายแยมสตรอ",
        countValue: 15,
        normalizedKgAmount: 218.19,
      },
    ],
    bomMappings: [
      { fgCode: "WKB-0002-1", shellCode: "WKB-0002" },
      { fgCode: "WKB-0067", shellCode: "WKB-0068" },
    ],
  });

  const day = report.days.find((d) => d.date === "2026-10-06");
  assert.ok(day);
  assert.equal(day.rows.length, 2);

  const row1 = day.rows.find((r) => r.fgCode === "WKB-0002-1");
  const row2 = day.rows.find((r) => r.fgCode === "WKB-0067");

  assert.ok(row1);
  assert.ok(row2);

  // Total pooled Botan shell = 504.73 + 181.10 = 685.83
  // Output: 1113.15 vs 218.19 -> proportional split
  assert.equal(row1.shellWeightKg + row2.shellWeightKg, 685.83);
  assert.equal(row1.shellQuantity + row2.shellQuantity, 56);
  assert.ok(row1.shellWeightKg > 550);
  assert.ok(row2.shellWeightKg > 100);
});

test("leaves BL0-1104 without shell or jam on Oct 13 and allocates all Botan shell to WKB-0002-1", () => {
  const report = buildProductionInputOutputReport({
    jamRows: [
      {
        source: "APP",
        reportDate: "2026-10-13",
        DI_REF: "APP:jam-1",
        TRD_SH_CODE: "M04-0088",
        TRD_SH_NAME: "สับปะรดกวน",
        TRD_LOT_NO: "261003",
        TRD_QTY: 368.79,
        TRD_UTQQTY: 1,
        TRD_UTQNAME: "KG",
      },
    ],
    pieceRateRows: [
      {
        actualWeighedAt: "2026-10-13T10:00:00+07:00",
        productCode: "WKB-0002-1",
        productName: "เนื้อขนมแครกเกอร์โบตั๋นป้ายแยมสับปะรดเคพี",
        countValue: 12,
        normalizedKgAmount: 106.88,
      },
      {
        actualWeighedAt: "2026-10-13T10:30:00+07:00",
        productCode: "WKB-0064",
        productName: "เนื้อขนมออพายป้ายแยมสับปะรด",
        countValue: 81,
        normalizedKgAmount: 1293.75,
      },
      {
        actualWeighedAt: "2026-10-13T11:00:00+07:00",
        productCode: "BL0-1104",
        productName: "ขนมปังกรอบ แยมสับปะรด 1.1 กก. (6ปี๊บ)",
        countValue: 1796,
        normalizedKgAmount: 1975.6,
      },
    ],
    stockRows: [
      {
        issueDate: "2026-10-13",
        productCode: "WKB-0002",
        productName: "แผ่นแครกเกอร์โบตั๋น",
        destinationRoomCode: "BISCUIT_PACKING",
        actualQuantity: 5,
        actualWeightKg: 60.91,
        lotNo: "LOT-0002",
      },
      {
        issueDate: "2026-10-13",
        productCode: "WKB-0047",
        productName: "แผ่นแครกเกอร์ออพายงานของ",
        destinationRoomCode: "BISCUIT_PACKING",
        actualQuantity: 66,
        actualWeightKg: 762.17,
        lotNo: "LOT-0047",
      },
    ],
    bomMappings: [
      { fgCode: "WKB-0002-1", shellCode: "WKB-0002", shellName: "แผ่นแครกเกอร์โบตั๋น", jamCode: "M04-0088", jamQty: 300, baseBatch: 600 },
      { fgCode: "WKB-0064", shellCode: "WKB-0047", shellName: "แผ่นแครกเกอร์ออพายงานของ", jamCode: "M04-0088", jamQty: 300, baseBatch: 600 },
      { fgCode: "BL0-1104", shellCode: "WKB-0002", shellName: "แผ่นแครกเกอร์โบตั๋น", jamCode: "M04-0088", jamQty: 300, baseBatch: 600 },
    ],
  });

  const day = report.days.find((d) => d.date === "2026-10-13");
  assert.ok(day);

  const botanRow = day.rows.find((r) => r.fgCode === "WKB-0002-1");
  const orpieRow = day.rows.find((r) => r.fgCode === "WKB-0064");
  const bl0Row = day.rows.find((r) => r.fgCode === "BL0-1104");

  assert.ok(botanRow);
  assert.ok(orpieRow);
  assert.ok(bl0Row);

  // WKB-0002-1 takes all 60.91 kg of shell WKB-0002
  assert.equal(botanRow.shellCode, "WKB-0002");
  assert.equal(botanRow.shellWeightKg, 60.91);
  assert.equal(botanRow.shellQuantity, 5);
  assert.equal(botanRow.jam.code, "M04-0088");
  assert.equal(botanRow.jam.weightKg, 30.05);

  // WKB-0064 takes all 762.17 kg of shell WKB-0047 and 338.74 kg jam
  assert.equal(orpieRow.shellCode, "WKB-0047");
  assert.equal(orpieRow.shellWeightKg, 762.17);
  assert.equal(orpieRow.shellQuantity, 66);
  assert.equal(orpieRow.jam.code, "M04-0088");
  assert.equal(orpieRow.jam.weightKg, 338.74);

  // BL0-1104 has no shell and no jam
  assert.equal(bl0Row.shellCode, "");
  assert.equal(bl0Row.shellWeightKg, null);
  assert.equal(bl0Row.jam, null);
  assert.equal(bl0Row.fgQuantity, 1796);
  assert.equal(bl0Row.fgWeightKg, 1975.6);
});
