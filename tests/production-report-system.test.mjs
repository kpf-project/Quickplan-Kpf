import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transform, loadBindings } from "next/dist/build/swc/index.js";
import puppeteer from "puppeteer";
import { REPORT_GROUPS, PIECE_RATE_REPORT_VIEWS } from "../src/features/production-line/reportCenter.js";
import { CENTER_REPORT_IDS, CENTER_REPORTS, buildCenterReportModel } from "../src/features/production-line/report-center/reportDefinitions.js";

test("shared table renders mixed input rowspans and exports every input without duplicate FG", async () => {
  await loadBindings();
  const file = new URL("../src/components/reporting/ReportSystem.js", import.meta.url);
  const { code } = await transform(readFileSync(file, "utf8"), { filename: file.pathname, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });
  const componentModule = { exports: {} };
  const require = createRequire(import.meta.url);
  new Function("require", "module", "exports", code)((name) => name.endsWith(".css") ? { __esModule: true, default: new Proxy({}, { get: (_, key) => key }) } : name.startsWith("@/lib/print/reportDate") ? { formatReportDateText: (value) => value, formatReportGroupLabel: (value) => value } : require(name), componentModule, componentModule.exports);
  const columns = CENTER_REPORTS["input-output"].columns;
  for (const active of PIECE_RATE_REPORT_VIEWS) {
    let next;
    const toolbar = componentModule.exports.ReportViewToolbar({ views: PIECE_RATE_REPORT_VIEWS, activeView: active.value, onViewChange: value => { next = value; }, page: 1, totalPages: 1, zoom: 100 });
    const buttons = toolbar.props.children[0].props.children;
    assert.equal(buttons.filter(button => button.props["aria-pressed"]).length, 1);
    assert.equal(buttons.find(button => button.props["aria-pressed"]).props.children, active.label);
    for (const [index, button] of buttons.entries()) {
      button.props.onClick();
      assert.equal(next, PIECE_RATE_REPORT_VIEWS[index].value);
    }
  }
  const row = { sequence: 1, fgProduct: "FG-TEST", fgQuantity: 2500, fgWeightKg: 2750, _rowSpanKeys: ["sequence", "fgProduct", "fgQuantity", "fgWeightKg"], _parts: [
    { shellProduct: "SHELL-TEST", shellQuantity: 40, shellWeightKg: 500, jamName: "แยม", jamWeightKg: 300 },
    { shellProduct: "WIP-TEST", shellLots: "0210260054-1 · 1 · 10.1  |  0810260054-1 · 6 · 101.41  |  1210260054-1 · 141 · 2,386.55", shellQuantity: 100.573, inputUnit: "กระบะ", shellWeightKg: 1996.28 },
  ] };
  const html = renderToStaticMarkup(createElement(componentModule.exports.ReportTable, { columns, rows: [row] }));
  assert.equal((html.match(/FG-TEST/g) || []).length, 1);
  assert.equal((html.slice(html.indexOf("<tbody")).match(/rowSpan="2"/gi) || []).length, 4);
  assert.match(html, /WIP-TEST/);
  assert.match(html, /100\.573/);
  assert.match(html, /1,996\.280/);
  assert.doesNotMatch(html, /กระบะ|\bKG\b/);
  assert.match(html, /data-report-part-count="2"/);
  const originalDocument = globalThis.document;
  const originalWindow = globalThis.window;
  const originalCreateUrl = URL.createObjectURL;
  let blob;
  try {
    globalThis.document = { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } };
    globalThis.window = { setTimeout() {} };
    URL.createObjectURL = (value) => { blob = value; return "blob:test"; };
    await componentModule.exports.exportReportExcel({ title: "ทดสอบ", columns, rows: [row], fileName: "test.xlsx" });
    const ExcelJS = require("exceljs/dist/exceljs.min.js");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await blob.arrayBuffer());
    const sheet = workbook.worksheets[0];
    assert.equal(sheet.rowCount, 3);
    assert.equal(sheet.getRow(2).getCell(11).value, 2500);
    assert.equal(sheet.getRow(3).getCell(11).value, "");
    assert.equal(sheet.getRow(3).getCell(4).value, 100.573);
  } finally {
    globalThis.document = originalDocument;
    globalThis.window = originalWindow;
    URL.createObjectURL = originalCreateUrl;
  }
  const css = readFileSync("src/components/reporting/ReportSystem.module.css", "utf8");
  const sidebarCss = readFileSync("src/features/production-line/components/ReportCenter.module.css", "utf8").replaceAll(".center", ".fixtureRoot");
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(`<style>${css}${sidebarCss}body{margin:0}.fixture{display:flex;margin-left:96px}.fixture main{flex:1;min-width:0;padding:24px}.fixture .documentPage{min-height:0}</style><div class="fixture fixtureRoot"><aside class="sidebar">ศูนย์รายงาน</aside><main><article class="documentPage landscape">${html}</article></main></div>`);
    for (const width of [1280, 1440, 1920]) {
      await page.setViewport({ width, height: 1000 });
      const overflowing = await page.$$eval(".reportTable td", (cells) => cells.filter((cell) => cell.scrollWidth > cell.clientWidth + 1).map((cell) => cell.textContent));
      assert.deepEqual(overflowing, [], `report cells overflow at ${width}px`);
      const positions = await page.$$eval('[data-column-group="เปลือก / เนื้อขนม"] .unbrokenEntry', (entries) => entries.filter((entry) => entry.children.length === 3).map((entry) => [...entry.children].map((part) => part.getBoundingClientRect().right)));
      assert.equal(positions.length, 3);
      for (const position of positions.slice(1)) {
        assert.ok(Math.abs(position[1] - positions[0][1]) < 1, "quantity units align across LOT lines");
        assert.ok(Math.abs(position[2] - positions[0][2]) < 1, "weights align across LOT lines");
      }
      const sidebarWidth = await page.$eval(".sidebar", (aside) => aside.getBoundingClientRect().width);
      assert.ok(sidebarWidth <= 240, `sidebar consumes ${sidebarWidth}px`);
    }
  } finally {
    await browser.close();
  }
});

test("mixed inputs remain one paginated FG group with separate WIP unit totals", () => {
  const payload = { filters: { productCodes: ["WIP"] }, days: [{ date: "2026-10-15", rows: [
    { shellCode: "SHELL", shellName: "เปลือก", shellQuantity: 40, shellWeightKg: 500, fgCode: "FG", fgName: "สินค้า", fgQuantity: 2500, fgWeightKg: 2750, jam: { name: "แยม", quantity: 30, weightKg: 300 } },
    { inputKind: "wip", inputUnit: "กระบะ", shellCode: "WIP", shellName: "เนื้อขนม", shellQuantity: 100.573, shellWeightKg: 1996.28, fgCode: "FG", fgName: "สินค้า" },
    { shellCode: "OTHER", fgCode: "FG2", fgQuantity: 10 },
  ] }] };
  const model = buildCenterReportModel("input-output", payload);
  const data = model.rows.filter((row) => !row._kind);
  assert.equal(data.length, 1);
  assert.equal(data[0]._parts.length, 2);
  assert.equal(data[0].fgQuantity, 2500);
  assert.equal(data[0].fgWeightKg, 2750);
  assert.ok(data[0]._rowSpanKeys.includes("fgProduct"));
  assert.ok(data[0]._rowSpanKeys.includes("fgQuantity"));
  assert.equal(data[0]._parts[1].jamWeightKg, undefined);
  assert.equal(data[0]._parts[1].shellProduct, "WIP - เนื้อขนม");
  const totals = model.rows.filter((row) => row._kind === "subtotal");
  assert.equal(totals[0].shellQuantity, 40);
  assert.equal(totals[1].shellQuantity, 100.573);
  assert.equal(totals[1].inputUnit, "กระบะ");
  assert.equal(totals[1].fgQuantity, undefined);
  assert.ok(!JSON.stringify(model.rows).includes("ยอดรวมจากทั้งสองกระบวนการ"));
  const source = readFileSync("src/components/reporting/ReportSystem.js", "utf8");
  assert.match(source, /rowSpan=\{merged \? row\._parts\.length : undefined\}/);
  assert.match(source, /data-report-part-count/);
});

test("WIP issues stay hidden until their own day's target FG has both quantity and weight", () => {
  for (const [quantity, weight] of [[0, 0], [12, 0], [0, 100], [null, undefined]]) {
    const model = buildCenterReportModel("input-output", { days: [{ date: "2026-10-13", rows: [
      { fgCode: "FG", fgQuantity: quantity, fgWeightKg: weight },
      { inputKind: "wip", shellCode: "WIP", shellName: "เนื้อขนม", inputUnit: "KG", shellQuantity: 58, shellWeightKg: 839.975, fgCode: "FG" },
    ] }, { date: "2026-10-14", rows: [{ fgCode: "FG", fgQuantity: 100, fgWeightKg: 1000 }] }] });
    assert.ok(!model.rows.some((row) => row.shellProduct?.includes("WIP") || row._parts?.some((part) => part.shellProduct?.includes("WIP"))));
    assert.ok(!model.rows.some((row) => row._key?.startsWith("wip-")));
    assert.equal(model.rows.find((row) => row._key === "subtotal-2026-10-13").shellWeightKg, 0);
  }
});

test("quick report search finds WIP LOT inside a merged FG group and retains its subtotals", () => {
  const source = readFileSync("src/features/production-line/report-center/ProductionReportWorkspace.js", "utf8");
  const body = source.slice(source.indexOf("function filterRows("), source.indexOf("export default function ProductionReportWorkspace"));
  const filter = new Function(`${body}; return filterRows;`)();
  const group = { _key: "fg", shellProduct: "เปลือก", fgProduct: "FG", _parts: [{ shellLots: "061026" }] };
  const rows = [{ _kind: "group", _label: "วันที่ 1" }, group, { _kind: "subtotal", _label: "รวมเปลือก" }, { _kind: "subtotal", _label: "รวมเนื้อขนม WIP" }, { _kind: "group", _label: "วันที่ 2" }, { shellProduct: "อื่น" }, { _kind: "subtotal" }];
  const result = filter(rows, "061026");
  assert.equal(result.length, 4);
  assert.equal(result[1], group);
  assert.equal(result[3]._label, "รวมเนื้อขนม WIP");
});

test("issue types use shared red PB, bright blue KPF and black prison text on screen and print", () => {
  const css = readFileSync("src/components/reporting/ReportSystem.module.css", "utf8");
  const component = readFileSync("src/components/reporting/ReportSystem.js", "utf8");
  assert.match(component, /\["issueType", "issue_type"\]\.includes\(column.key\)/);
  assert.match(component, /data-issue-type=\{type\}/);
  assert.match(css, /\.reportTable \.issueType\[data-issue-type="PB"\]\{color:#dc2626!important\}/);
  assert.match(css, /\.reportTable \.issueType\[data-issue-type="KPF"\]\{color:#2563eb!important\}/);
  assert.match(css, /data-issue-type="PRISON"[\s\S]*?color:#000!important/);
});

test("shared issue, return and actual groups use bright pastel colors without layout changes", () => {
  const css = readFileSync("src/components/reporting/ReportSystem.module.css", "utf8");
  assert.match(css, /--group-head:#dbeafe;--group-body:#f5f9ff;--group-total:#eaf2ff/);
  assert.match(css, /--group-head:#fef3c7;--group-body:#fffcf2;--group-total:#fff7db/);
  assert.match(css, /--group-head:#d1fae5;--group-body:#f0fdf7;--group-total:#e3fbee/);
});

test("stock and prison report center exposes direct reports without replacing legacy routes", () => {
  const stock = REPORT_GROUPS.find((group) => group.id === "stock");
  const standalone = REPORT_GROUPS.find((group) => group.id === "input-output");
  assert.equal(stock.reports.length, 13);
  assert.equal(standalone.standalone, true);
  assert.deepEqual([...stock.reports, ...standalone.reports].map((report) => report.id).sort(), [...CENTER_REPORT_IDS].sort());
  assert.ok(stock.reports.every((report) => report.centerMode));
  assert.ok(stock.reports.every((report) => report.href.startsWith("/production-line/")));
});

test("shared report model keeps report-specific columns and totals", () => {
  assert.deepEqual(Object.fromEntries([...CENTER_REPORT_IDS].map((id) => [id, CENTER_REPORTS[id].columns.length])), {
    "stock-movement": 17,
    "input-output": 15,
    "scale-inbound": 5,
    "scale-inbound-detail": 7,
    "stock-issue": 11,
    "stock-issue-detail": 8,
    "stock-balance": 5,
    "stock-balance-detail": 6,
    "prison-inbound": 10,
    "prison-inbound-detail": 8,
    "prison-issue": 10,
    "prison-issue-detail": 8,
    "prison-balance": 10,
    "prison-movement": 9,
  });
  const model = buildCenterReportModel("stock-issue", {
    scope: { departmentName: "แผนกบิสกิต" },
    filters: { dateFrom: "2026-10-01", dateTo: "2026-10-08" },
    rows: [{ issueDate: "2026-10-01", lotNo: "LOT-1", productCode: "WKB-0002", productName: "สินค้า", issueType: "KPF", quantity: 3, totalWeightKg: 30, returnQuantity: 1, returnWeightKg: 10, actualQuantity: 2, actualWeightKg: 20 }],
  });
  assert.equal(model.definition.orientation, "portrait");
  assert.equal(model.rows[0].weightKg, 30);
  assert.equal(model.totalRow.actualWeightKg, 20);
  assert.equal(model.departmentName, "แผนกบิสกิต");

  const prisonBalance = buildCenterReportModel("prison-balance", {
    rows: [{
      productCode: "WKB-0068",
      productName: "แผ่นแครกเกอร์โบตั๋นเรือนจำ",
      lotNo: "1809260068-1",
      openingQuantity: 43,
      openingWeightKg: 518.67,
      issueQuantity: 39,
      issueWeightKg: 470.37,
      balanceQuantity: 4,
      balanceWeightKg: 48.3,
    }],
  });
  assert.equal(prisonBalance.definition.columns[2].key, "openingQuantity");
  assert.equal(prisonBalance.totalRow.openingQuantity, 43);
  assert.equal(prisonBalance.totalRow.balanceQuantity, 4);
});

test("labor reports preserve grouped subtotals, product columns and money permissions", () => {
  const payload = { capabilities: { canViewMoney: false }, summary: { totalKg: 12, totalCount: 2, totalWage: 24 }, rows: [{ id: "one", groupDayKey: "2026-10-08", productCode: "WIP-1", productName: "สินค้า", employeeName: "พนักงาน", normalizedKgAmount: 12, countValue: 2, wageAmount: 24, isGroupedProductTail: true, groupSubtotalNormalizedKgAmount: 12, groupSubtotalCountValue: 2, groupSubtotalWageAmount: 24 }] };
  const grouped = buildCenterReportModel("wages", payload);
  const columns = buildCenterReportModel("wages", { ...payload, capabilities: { canViewMoney: true } }).definition.columns;
  assert.equal(columns.reduce((sum, column) => sum + parseFloat(column.width), 0), 100);
  assert.deepEqual(columns.filter((column) => column.align === "center").map((column) => column.key), ["date", "document", "employeeCode", "productCode", "normalizedKgAmount", "countValue", "wageAmount"]);
  assert.equal(columns.find((column) => column.key === "employee").width, "24%");
  const detail = buildCenterReportModel("wages-detail", { rows: [{ dayKey: "2026-10-08", loggedAt: "2026-10-08T09:43:00Z", operatorUsername: "operator" }] });
  assert.match(detail.rows[0].date, /16:43.*operator/);
  assert.doesNotMatch(readFileSync(new URL("../src/features/production-line/report-center/LaborReportWorkspace.js", import.meta.url), "utf8"), /setReport\(null\)/);
  assert.deepEqual(grouped.rows.map((row) => row._kind || "data"), ["group", "data", "subtotal"]);
  assert.equal(grouped.rows[2].normalizedKgAmount, 12);
  assert.ok(!grouped.definition.columns.some((column) => column.key === "wageAmount"));
  assert.ok(buildCenterReportModel("wages", { ...payload, capabilities: { canViewMoney: true } }).definition.columns.some((column) => column.key === "wageAmount"));
  assert.equal(buildCenterReportModel("wages-product", payload).definition.columns.length, 7);
  const scans = buildCenterReportModel("scan-events", { rows: [{ date: "2026-10-08", fingerInMorning: "08:00:00", checkIn: "08:45:00" }] });
  assert.equal(scans.rows[1].timeGap, "45 นาที");
  assert.equal(scans.definition.columns.length, 11);
  const prison = buildCenterReportModel("prison-issue", { rows: [{ productCode: "WIP-1", quantity: 2, totalWeightKg: 12 }] });
  assert.equal(prison.totalRow.actualQuantity, 2);
  assert.equal(prison.totalRow.actualWeightKg, 12);
});

test("output reports keep legacy columns, units, totals and packing calculations", () => {
  const daily = buildCenterReportModel("fg-wip", { rows: [{ id: "fg-1", fg_case_qty: 5, fg_unit_snapshot: "ถุง", fg_tin_qty: 3, wip_tin_qty: 2, fg_product_name_snapshot: "ชื่อสินค้าครบไม่ตัดคำ" }] });
  assert.equal(daily.definition.columns.length, 12);
  assert.equal(daily.rows[0].fgQuantity, "5 ถุง");
  assert.equal(daily.rows[0].overallTins, 5);
  assert.equal(daily.totalRow.overallTins, 5);
  assert.equal(daily.rows[0].fg_product_name_snapshot, "ชื่อสินค้าครบไม่ตัดคำ");
  assert.equal(daily.definition.dateMode, "single");
  const balance = buildCenterReportModel("wip-balance", { rows: [{ remainingQty: 3 }, { remainingQty: 2 }] });
  assert.equal(balance.definition.columns.length, 5);
  assert.equal(balance.definition.orientation, "portrait");
  assert.equal(balance.totalRow.remainingQty, 5);
  assert.equal(balance.definition.showDates, false);
  const packing = buildCenterReportModel("fg-packing", { rows: [{ fgCode: "FG-1", actualWeightKg: 20, producedTins: 2, lotWeights: [{ lotNo: "LOT-1", weightKg: 12 }, { lotNo: "LOT-2", weightKg: 8 }], fgQuantities: [{ quantity: 4, unitName: "กล่อง" }, { quantity: 2, unitName: "ถุง" }], scrapWeightKg: 1, rejectedCanQty: 1 }] });
  assert.equal(packing.definition.columns.length, 13);
  assert.equal(packing.rows[0].lots, "LOT-1\nLOT-2");
  assert.equal(packing.rows[0].lotWeightsText, "12.000\n8.000");
  assert.equal(packing.rows[0].fgQuantity, "4 กล่อง + 2 ถุง");
  assert.equal(packing.rows[0].averageGrams, "10,000.00");
  assert.equal(packing.totalRow, null, "legacy packing report has no grand-total row");
  const center = readFileSync("src/features/production-line/components/ReportCenterClient.js", "utf8");
  assert.match(center, /OUTPUT_REPORTS\[selected\?\.id\].*<OutputReportWorkspace/);
});

test("group document drilldown uses legacy lookup keys and is screen-only", () => {
  const labor = readFileSync("src/features/production-line/report-center/LaborReportWorkspace.js", "utf8");
  const workspace = readFileSync("src/features/production-line/report-center/ProductionReportWorkspace.js", "utf8");
  const css = readFileSync("src/components/reporting/ReportSystem.module.css", "utf8");
  assert.match(labor, /fetchPieceRateGroupDocuments\(\{ day: row\.groupDayKey, employeeCode: row\.employeeCode, productKey: row\.groupProductKey/);
  assert.match(labor, /dialog\.current\.showModal\(\)/);
  assert.match(labor, /document\.docStatus === "active"/);
  assert.match(labor, /capabilities\?\.canViewMoney/);
  assert.match(workspace, /renderCell=\{interactive \? renderCell : undefined\}/);
  assert.match(workspace, /table\(pageRows, page >= totalPages, true\)/);
  assert.match(css, /\.checkboxOptions input\[type="checkbox"\]\{width:16px;height:16px/);
  assert.match(css, /@media print\{\.detailDialog\{display:none!important\}\}/);
});

test("input-output report keeps the legacy combined product columns without truncating data", () => {
  const model = buildCenterReportModel("input-output", {
    filters: { dateFrom: "2026-10-01", dateTo: "2026-10-01" },
    days: [{
      date: "2026-10-01",
      rows: [{
        shellCode: "WKB-0002",
        shellName: "แผ่นแครกเกอร์โปรตีน",
        shellLots: [{ lotNo: "0110260002-1", quantity: 3, weightKg: 30.94 }],
        jam: { code: "M04-0088", name: "สับปะรดกวน", lots: [{ lotNo: "260924", weightKg: 550 }] },
        fgCode: "WKB-0002-1",
        fgName: "เนื้อขนมแครกเกอร์โปรตีนป้ายแยม",
      }],
    }],
  });

  const row = model.rows.find((item) => !item._kind);
  assert.equal(row.shellProduct, "WKB-0002 - แผ่นแครกเกอร์โปรตีน");
  assert.equal(row.fgProduct, "WKB-0002-1 - เนื้อขนมแครกเกอร์โปรตีนป้ายแยม");
  assert.equal(row.shellLots, "0110260002-1 · 3 · 30.94");
  assert.deepEqual(model.definition.columns.map((column) => column.key), [
    "sequence", "shellProduct", "shellLots", "shellQuantity", "shellWeightKg",
    "jamName", "jamLots", "jamQuantity", "jamWeightKg",
    "fgProduct", "fgQuantity", "fgWeightKg",
    "labelScrapWeightKg", "brokenScrapWeightKg", "burntScrapWeightKg",
  ]);
});

test("movement report preserves the legacy product, date and lot sequence", () => {
  const model = buildCenterReportModel("stock-movement", {
    scope: { products: [{ code: "WKB-0002", name: "สินค้า 2" }] },
    filters: { dateFrom: "2026-10-01", dateTo: "2026-10-02", productCodes: ["WKB-0002"] },
    rows: [
      { issueDate: "2026-10-02", productCode: "WKB-0002", productName: "สินค้า 2", lotNo: "LOT-2", openingQuantity: 3, balanceQuantity: 2 },
      { issueDate: "2026-10-01", productCode: "WKB-0002", productName: "สินค้า 2", lotNo: "LOT-1", openingQuantity: 5, balanceQuantity: 4 },
    ],
    summary: { openingQuantity: 8, balanceQuantity: 6 },
  });

  assert.deepEqual(model.rows.map((row) => row._kind || row.lotNo), ["group", "LOT-1", "group", "LOT-2", "subtotal"]);
  assert.equal(model.rows[0]._label, "วันที่รายงาน: 01/10/69");
  assert.equal(model.rows[2]._label, "วันที่รายงาน: 02/10/69");
  assert.deepEqual(model.selectedProductCodes, ["WKB-0002"]);
  assert.equal(model.productOptions[0].code, "WKB-0002");
  assert.deepEqual(model.definition.columns.map((column) => column.width), [
    "2.5%", "23%", "9%",
    ...Array.from({ length: 14 }, () => "4.675%"),
  ]);
});

test("summary reports preserve legacy grouping and subtotal rows", () => {
  const scale = buildCenterReportModel("scale-inbound", {
    rows: [
      { groupDate: "2026-10-01", parentGroupKey: "A", lotNo: "LOT-1", productCode: "WKB-0002", productName: "สินค้า 2", quantity: 20, totalNetWeightKg: 200 },
      { groupDate: "2026-10-01", parentGroupKey: "A", lotNo: "LOT-1", productCode: "WKB-0002", productName: "สินค้า 2", quantity: 5, totalNetWeightKg: 50 },
    ],
    summary: { totalQuantity: 25, totalNetWeightKg: 250 },
  });
  assert.deepEqual(scale.rows.map((row) => row._kind || row.quantity), ["group", 20, 5, "subtotal"]);
  assert.equal(scale.rows.at(-1).quantity, 25);
  assert.equal(scale.rows.at(-1).totalNetWeightKg, 250);

  const issues = buildCenterReportModel("stock-issue", {
    rows: [
      { issueDate: "2026-10-01", lotNo: "LOT-1", productCode: "WKB-0002", productName: "สินค้า 2", destinationRoomCode: "400", destinationRoomName: "ห้องบรรจุบิสกิต", issueStatus: "confirmed", quantity: 2, totalWeightKg: 20 },
      { issueDate: "2026-10-02", lotNo: "LOT-2", productCode: "WKB-0002", productName: "สินค้า 2", destinationRoomCode: "400", destinationRoomName: "ห้องบรรจุบิสกิต", issueStatus: "confirmed", quantity: 3, totalWeightKg: 30 },
    ],
  });
  assert.deepEqual(issues.rows.map((row) => row._kind || row.lotNo), ["LOT-1", "LOT-2", "subtotal"]);
  assert.equal(issues.rows.at(-1).quantity, 5);
  assert.equal(issues.rows.at(-1).weightKg, 50);
  assert.equal(issues.rows[0].product, "WKB-0002 - สินค้า 2 → ห้องบรรจุบิสกิต");
});

test("detail and balance reports preserve legacy group totals", () => {
  const scaleDetails = buildCenterReportModel("scale-inbound-detail", {
    receipts: [
      { id: "1", weighedAt: "2026-10-01T08:00:00+07:00", lotNo: "LOT-1", productCode: "WKB-0002", productName: "สินค้า 2", barcode: "S1", netWeightKg: 10 },
      { id: "2", weighedAt: "2026-10-01T08:01:00+07:00", lotNo: "LOT-1", productCode: "WKB-0002", productName: "สินค้า 2", barcode: "S2", netWeightKg: 11 },
    ],
  });
  assert.deepEqual(scaleDetails.rows.map((row) => row._kind || row.barcode), ["group", "S1", "S2", "subtotal"]);
  assert.equal(scaleDetails.rows.at(-1).quantity, 2);
  assert.equal(scaleDetails.rows.at(-1).netWeightKg, 21);

  const details = buildCenterReportModel("stock-issue-detail", {
    rows: [
      { issueDate: "2026-10-01", issuedAt: "2026-10-01T08:00:00+07:00", lotNo: "LOT-1", productCode: "WKB-0002", productName: "สินค้า 2", destinationRoomCode: "400", destinationRoomName: "ห้องบรรจุบิสกิต", issueType: "KPF", barcode: "A", quantity: 1, weightKg: 10 },
      { issueDate: "2026-10-01", issuedAt: "2026-10-01T08:01:00+07:00", lotNo: "LOT-1", productCode: "WKB-0002", productName: "สินค้า 2", destinationRoomCode: "400", destinationRoomName: "ห้องบรรจุบิสกิต", issueType: "KPF", barcode: "B", quantity: 1, weightKg: 11 },
    ],
  });
  assert.deepEqual(details.rows.map((row) => row._kind || row.barcode), ["group", "A", "B", "subtotal"]);
  assert.equal(details.rows.at(-1).weightKg, 21);
  assert.equal(details.rows[1].product, "WKB-0002 - สินค้า 2 → ห้องบรรจุบิสกิต");

  for (const reportId of ["stock-balance", "stock-balance-detail"]) {
    const balance = buildCenterReportModel(reportId, {
      rows: [
        { productCode: "WKB-0002", productName: "สินค้า 2", lotNo: "LOT-1", balanceQuantity: 2, balanceWeightKg: 20 },
        { productCode: "WKB-0002", productName: "สินค้า 2", lotNo: "LOT-2", balanceQuantity: 3, balanceWeightKg: 30 },
      ],
    });
    assert.deepEqual(balance.rows.map((row) => row._kind || row.lotNo), ["LOT-1", "LOT-2", "subtotal"]);
    assert.equal(balance.rows.at(-1).balanceQuantity, 5);
  }
});

test("shared report columns retain the legacy space allocation", () => {
  assert.deepEqual(CENTER_REPORTS["scale-inbound"].columns.map((column) => column.width), ["9%", "20%", "46%", "10%", "15%"]);
  assert.deepEqual(CENTER_REPORTS["scale-inbound-detail"].columns.map((column) => column.width), ["5%", "15%", "34%", "17%", "6%", "8%", "15%"]);
  assert.deepEqual(CENTER_REPORTS["stock-issue"].columns.map((column) => column.width), ["3%", "8%", "13%", "24%", "7%", "5.5%", "9%", "5.5%", "9%", "5.5%", "10.5%"]);
  assert.deepEqual(CENTER_REPORTS["stock-issue-detail"].columns.map((column) => column.width), ["4%", "13%", "13%", "36%", "10%", "8%", "6%", "10%"]);
  assert.deepEqual(CENTER_REPORTS["stock-balance"].columns.map((column) => column.width), ["8%", "20%", "38%", "20%", "14%"]);
  assert.deepEqual(CENTER_REPORTS["stock-balance-detail"].columns.map((column) => column.width), ["6%", "16%", "34%", "16%", "12%", "16%"]);
});

test("report center renders central reports directly and keeps iframe only as legacy fallback", () => {
  const center = readFileSync("src/features/production-line/components/ReportCenterClient.js", "utf8");
  assert.match(center, /selected\?\.centerMode[\s\S]*StockReportWorkspace/);
  assert.match(center, /selected && !selected\.centerMode/);
  const page = readFileSync("src/app/production-line/reports/page.js", "utf8");
  assert.match(page, /loadCenterReportData/);
  const shared = readFileSync("src/components/reporting/ReportSystem.js", "utf8");
  for (const name of ["ReportPageHeader", "ReportFilterBar", "ReportDocument", "ReportTable", "ReportScreenFooter", "exportReportExcel"]) {
    assert.match(shared, new RegExp(`export (?:(?:async )?function ${name}|const ${name} = memo)`));
  }
  assert.match(shared, /selectedProductCodes/);
  assert.match(shared, /onProductCodesChange/);
  const workspace = readFileSync("src/features/production-line/report-center/ProductionReportWorkspace.js", "utf8");
  assert.match(workspace, /printing && <div className=\{styles.printDocument\}/);
  assert.match(workspace, /addEventListener\("beforeprint", beforePrint\)/);
  assert.match(workspace, /setPrinting\(true\)/);
});

test("shared report shell keeps web controls out of print and uses one page scroll", () => {
  const shared = readFileSync("src/components/reporting/ReportSystem.js", "utf8");
  const sharedStyles = readFileSync("src/components/reporting/ReportSystem.module.css", "utf8");
  const workspaceStyles = readFileSync("src/features/production-line/report-center/ProductionReportWorkspace.module.css", "utf8");
  const center = readFileSync("src/features/production-line/components/ReportCenterClient.js", "utf8");

  assert.match(sharedStyles, /\.pageHeader,.filterBar,.screenFooter,.previewToolbar,.measurementPage\{display:none!important\}/);
  assert.match(sharedStyles, /\.searchInput input\{[^}]*height:auto;[^}]*background:transparent/);
  assert.match(sharedStyles, /@media print\{[\s\S]*color:#000!important/);
  assert.match(sharedStyles, /@media screen and \(max-width:720px\)/);
  assert.doesNotMatch(sharedStyles, /@media\(max-width:720px\)/);
  assert.match(shared, /LOGO-KPF1\.png[\s\S]*unoptimized/);
  assert.doesNotMatch(workspaceStyles, /\.canvas\{[^}]*overflow:auto/);
  assert.match(workspaceStyles, /\.canvas\{[^}]*overflow:visible/);
  assert.match(center, /styles\.sectionItems/);
  assert.doesNotMatch(center, /styles\.subItemIcon/);
});

test("hidden pagination measurement does not extend the visible page scroll", () => {
  const workspaceStyles = readFileSync("src/features/production-line/report-center/ProductionReportWorkspace.module.css", "utf8");

  assert.match(workspaceStyles, /\.measureDocument\{position:fixed;/);
  assert.doesNotMatch(workspaceStyles, /\.measureDocument\{position:absolute;/);
});

test("print pages come from measured row heights instead of a fixed row count", () => {
  const workspace = readFileSync("src/features/production-line/report-center/ProductionReportWorkspace.js", "utf8");
  const shared = readFileSync("src/components/reporting/ReportSystem.js", "utf8");
  const styles = readFileSync("src/components/reporting/ReportSystem.module.css", "utf8");

  assert.match(workspace, /paginateReportItems\(filteredRows, heights, measurement.availableHeight, measurement.totalHeight\)/);
  assert.match(workspace, /measurement\?\.rows !== model.rows &&/);
  assert.match(workspace, /document\.fonts\.ready/);
  assert.match(workspace, /variant="measure"/);
  assert.doesNotMatch(workspace, /const printLimit =/);
  assert.match(shared, /data-report-table-head/);
  assert.match(shared, /data-report-row/);
  assert.match(shared, /data-keep-with-next/);
  assert.match(styles, /\.measurementPage/);
  assert.match(styles, /\.measurementPage \.reportTable\{font-size:8\.5pt;line-height:1\.2\}/);
  assert.match(styles, /\.measurementPage\.landscape \.reportTable\{font-size:8pt\}/);
  assert.match(styles, /@media print\{[\s\S]*\.reportTable\{font-size:8\.5pt;line-height:1\.2/);
  assert.match(styles, /@media print\{[\s\S]*\.landscape \.reportTable\{font-size:8pt/);
  assert.match(styles, /@media print\{[\s\S]*padding:1\.5pt 2pt/);
  assert.match(styles, /\.measurementPage \.reportTable tbody \.groupRow td\{padding:1pt 2pt\}/);
  assert.match(styles, /@media print\{[\s\S]*\.reportTable tbody \.groupRow td\{padding:1pt 2pt\}/);
  assert.match(styles, /@media print\{[\s\S]*\.reportTable tbody \.groupRow\{border-left:0!important\}/);
});
