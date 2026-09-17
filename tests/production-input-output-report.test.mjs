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
} from "../src/lib/production-input-output-report.js";
import {
  getJamReportDateForRequisitionDate,
  getJamRequisitionDateForReportDate,
} from "../src/lib/production-input-output-dates.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

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
  assert.match(componentSource, /window\.print\(\)/);
  assert.match(componentSource, /พิมพ์ A4 แนวนอน/);
  assert.match(componentSource, /printMode === PRINT_MODE_DAILY \? \(/);
  assert.match(componentSource, /input-output-screen-report/);
  assert.match(componentSource, /input-output-print-only/);
  assert.match(cssSource, /\.reportRoot\s+:global\(\.input-output-print-only\)\s*{\s*display:\s*none/);
  assert.match(cssSource, /\.reportRoot\s+:global\(\.input-output-compact-report\)\s*{\s*display:\s*block/);
  assert.match(cssSource, /\.reportRoot\s+:global\(\.input-output-compact-print-table\)\s*{[\s\S]*?border-collapse:\s*collapse/);
  assert.match(cssSource, /\.compactPrint\s+:global\(\.input-output-compact-print-table\)\s*{[\s\S]*?table-layout:\s*fixed/);
  assert.match(cssSource, /\.compactPrint\s+:global\(\.input-output-report-pages\)\s*{\s*display:\s*none\s*!important/);
  assert.match(cssSource, /\.compactPrint\s+:global\(\.input-output-compact-report\)\s*{\s*display:\s*block\s*!important/);
  assert.doesNotMatch(cssSource, /height:\s*196mm/);
  assert.doesNotMatch(cssSource, /zoom:\s*0\.7/);
  assert.match(cssSource, /\.compactPrint\s+:global\(\.input-output-compact-print-table thead\)\s*{\s*display:\s*table-header-group/);
  assert.match(cssSource, /tbody\.input-output-print-day-group\)\s*\{[\s\S]*?break-inside:\s*avoid/);
  assert.match(cssSource, /\.compactPrint\s+:global\(\.input-output-compact-print-table tbody tr\.input-output-print-data-row\)\s*\{[\s\S]*?break-inside:\s*avoid/);
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
  assert.match(dataSource, /if \(!requisitionDate\) return \[\]/);
  assert.match(dataSource, /results\.flat\(\)\.map\(\(row\) => \(\{ \.\.\.row, reportDate \}\)\)/);
  assert.match(dataSource, /loadJamRows\(rangeStart, rangeEnd\)/);
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
  assert.match(componentSource, /สินค้าสำเร็จรูปที่ผลิตได้/);
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
  assert.match(cssSource, /@page\s*\{[\s\S]*?margin:\s*3mm/);
  assert.match(cssSource, /text-overflow:\s*clip\s*!important/);
  assert.ok(
    componentSource.indexOf("สินค้าสำเร็จรูปที่ผลิตได้") < componentSource.indexOf("ของเสีย (กก.)")
  );
  assert.ok(
    componentSource.indexOf("showFg ? production.fgCode") < componentSource.indexOf("showWaste ? formatNumber")
  );
  assert.doesNotMatch(componentSource, /showWaste \? production\.fgCode/);
  assert.doesNotMatch(componentSource, /showWaste \? production\.fgName/);
  assert.match(componentSource, /รวมเปลือก:/);
  assert.match(componentSource, /รวมแยมใช้จริง:/);
  assert.doesNotMatch(componentSource, /รวมของเสีย:/);
  assert.match(componentSource, /รวมสินค้าสำเร็จรูป:/);
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

test("includes only the two configured jam codes and derives jam quantity from KG divided by 10", () => {
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

  assert.deepEqual(JAM_GOODS_CODES, ["M04-0088", "M04-0126-1"]);
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
        DI_REMARK: "อ้างถึงใบเบิก#X6907/0363:15/07/2569 คืนครั้งแรก",
        TRD_SH_CODE: "M04-0088",
        TRD_LOT_NO: "JAM-LOT-A",
        TRD_WEIGHT: 30,
        TRD_UTQNAME: "KG",
      },
      {
        DI_ACTIVE: 0,
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
    { lotNo: "JAM-LOT-A", quantity: 47, weightKg: 470 },
    { lotNo: "JAM-LOT-B", quantity: 33, weightKg: 330 },
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
  assert.match(componentSource, /const jams = page\.dayPage === 1 && Array\.isArray\(page\.jams\)/);
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
