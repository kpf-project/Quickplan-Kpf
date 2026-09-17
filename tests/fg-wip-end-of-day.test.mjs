import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { readdir } from "node:fs/promises";
import test from "node:test";
import { buildFgPackingReportRows, calculateAverageWeightPerTin } from "../src/features/production-line/utils/buildFgPackingReportRows.js";

const read = (path) => readFileSync(path, "utf8");

test("packing average uses actual consumption after returns and produced tins only", () => {
  const [row] = buildFgPackingReportRows({
    documents: [{ fgProductCode: "BLI-3004", fgQuantity: 124, fgTinQty: 1488, wipTinQty: 10 }],
    issues: [{ id: "issue", fgProductCode: "BLI-3004", weightKg: 450 }],
    returns: [{ issueId: "issue", weightKg: 17.7 }],
    wastes: [{ fgProductCode: "BLI-3004", wasteType: "filling_scrap", weightKg: 1.21 }],
    carryovers: [{ fgProductCode: "BLI-3004", quantity: 3 }],
  });
  assert.equal(row.actualWeightKg, 432.3);
  assert.equal(calculateAverageWeightPerTin(row.actualWeightKg, row.producedTins).toFixed(6), "0.290524");
  assert.equal(calculateAverageWeightPerTin(100, 0), null);
  assert.equal(calculateAverageWeightPerTin(0, 12), 0);
  assert.equal(calculateAverageWeightPerTin(100 + 300, 100 + 600).toFixed(6), "0.571429");
});

test("FG/WIP end-of-day page supports scan and Trade Code selection without line or plan fields", () => {
  const source = read("src/app/production-line/fg-wip/FgWipEndOfDayPageClient.js");
  assert.match(source, /สแกนบาร์โค้ดสินค้า FG/);
  assert.match(source, /เลือกจากรายการ/);
  assert.match(source, /Trade Code/);
  assert.doesNotMatch(source, />LOT อัตโนมัติ</);
  assert.doesNotMatch(source, /ไลน์ผลิต|แผนผลิต/);
});

test("FG/WIP save is atomic and records count-only WIP movement", () => {
  const migration = read("supabase/migrations/20260817125140_add_fg_wip_end_of_day_flow.sql");
  assert.match(migration, /create or replace function public\.record_fg_wip_end_of_day/i);
  assert.match(migration, /fg_tin_qty = fg_case_qty \* tins_per_case_snapshot/i);
  assert.match(migration, /production_wip_can_movements/i);
  assert.match(migration, /quantity_in integer/i);
  assert.doesNotMatch(migration, /weight_kg|kilogram/i);
  assert.match(migration, /revoke all on function public\.record_fg_wip_end_of_day/i);
  assert.match(migration, /grant execute .* to service_role/i);
});

test("FG production can be saved without end-of-day WIP carry-over", async () => {
  const client = read("src/app/production-line/fg-wip/FgWipEndOfDayPageClient.js");
  const service = read("src/features/production-line/services/fgWipService.js");
  const names = await readdir("supabase/migrations");
  const migrationName = names.find((name) => name.endsWith("_make_fg_wip_carryover_optional.sql"));

  assert.ok(migrationName, "optional WIP migration must exist");
  const migration = read(`supabase/migrations/${migrationName}`);
  assert.match(client, /if \(!product \|\| fgCaseQty <= 0\)/);
  assert.doesNotMatch(client, /!wipBarcode\.trim\(\) \|\| wipTinQty <= 0/);
  assert.match(client, /ไม่บังคับ/);
  assert.match(service, /parseNonNegativeInteger\(body\.wipTinQty, "wipTinQty"\)/);
  assert.match(service, /wipTinQty > 0/);
  assert.match(migration, /drop not null/i);
  assert.match(migration, /wip_tin_qty >= 0/i);
  assert.match(migration, /if p_wip_tin_qty > 0 then/i);
});

test("end-of-day WIP derives its base Trade Code from the selected FG", () => {
  const client = read("src/app/production-line/fg-wip/FgWipEndOfDayPageClient.js");
  const service = read("src/features/production-line/services/fgWipService.js");

  assert.doesNotMatch(client, /สแกนบาร์โค้ดที่ปี๊บ \/ รหัสซื้อขาย/);
  assert.doesNotMatch(client, /wipProductPickerOpen/);
  assert.match(client, /product\.productCode/);
  assert.match(client, /ระบบเลือก Trade Code หน่วย/);
  assert.match(service, /resolveBaseWipTradeCode/);
  assert.match(service, /row\.barcode === product\.productCode/);
  assert.match(service, /ไม่พบ Trade Code หน่วยย่อย/);
});

test("new feature has isolated navigation and authorization", () => {
  const navigation = read("src/components/appNavigation.js");
  const authorization = read("src/features/auth/services/authorizeService.js");
  assert.match(navigation, /\/production-line\/fg-wip/);
  assert.match(authorization, /"\/production-line\/fg-wip"/);
});

test("FG/WIP daily report can search a selected production date", () => {
  const report = read("src/app/production-line/fg-wip/FgWipReportTab.js");
  assert.match(report, /วันที่รายงาน/);
  assert.match(report, /type="date"/);
  assert.match(report, /onSubmit=\{handleSearch\}/);
  assert.match(report, /productionDate=\$\{encodeURIComponent\(reportDate\)\}/);
  assert.match(report, /ประจำวันที่ \{formatDate\(reportDate\)\}/);
  assert.match(report, /ไม่มีข้อมูลบันทึกผลผลิตและ WIP วันที่ \{formatDate\(reportDate\)\}/);
});

test("packing report combines issue, return, waste, production and carry-over by canonical FG", () => {
  const [row] = buildFgPackingReportRows({
    documents: [{ fgProductCode: "BLI-3004", fgProductName: "FG", fgUnitName: "กล่อง", fgQuantity: 12, fgTinQty: 24, wipTinQty: 6 }],
    issues: [{ id: "issue-1", fgProductCode: "BLI-3004", lotNo: "1508260001-1", weightKg: 1218.75 }],
    returns: [{ issueId: "issue-1", weightKg: 18.75 }],
    wastes: [
      { fgProductCode: "BLI-3004", wasteType: "filling_scrap", weightKg: 2.5 },
      { fgProductCode: "BLI-3004", wasteType: "rejected_can", rejectedCanQty: 1 },
    ],
    carryovers: [{ fgProductCode: "BLI-3004", quantity: 3 }],
  });

  assert.equal(row.carriedOverTins, 3);
  assert.deepEqual(row.lotWeights, [{ lotNo: "1508260001-1", weightKg: 1218.75 }]);
  assert.equal(row.actualWeightKg, 1200);
  assert.equal(row.scrapWeightKg, 2.5);
  assert.equal(row.rejectedCanQty, 1);
  assert.equal(row.producedTins, 24);
  assert.deepEqual(row.fgQuantities, [{ unitName: "กล่อง", quantity: 12 }]);
  assert.equal(row.producedWeightKg, 1200);
  assert.equal(row.remainingWipTins, 6);
});

test("packing report excludes FG groups without a recorded production document", () => {
  const rows = buildFgPackingReportRows({
    documents: [{ fgProductCode: "BLI-3004", fgProductName: "ผลิตแล้ว", fgQuantity: 1, fgTinQty: 12, wipTinQty: 0 }],
    issues: [
      { id: "produced", fgProductCode: "BLI-3004", lotNo: "LOT-1", weightKg: 100 },
      { id: "not-produced", fgProductCode: "B03-0012", lotNo: "LOT-2", weightKg: 200 },
    ],
    wastes: [{ fgProductCode: "BL0-1009", wasteType: "filling_scrap", weightKg: 5 }],
  });

  assert.deepEqual(rows.map((row) => row.fgCode), ["BLI-3004"]);
  assert.equal(rows[0].issuedWeightKg, 100);
});

test("packing report is a fixed A4 landscape table without horizontal scrolling", () => {
  const tab = read("src/app/production-line/fg-wip/FgWipReportTab.js");
  const report = read("src/app/production-line/fg-wip/FgPackingReportClient.js");
  const service = read("src/features/production-line/services/fgWipService.js");
  const migration = read("supabase/migrations/20260826061503_link_wip_carryover_to_fg_document.sql");

  assert.match(tab, /รายงานการบรรจุ/);
  assert.match(tab, /<FgPackingReportClient productionDate=\{productionDate\}/);
  assert.match(report, /@page \{ size: A4 landscape;/);
  assert.match(report, /table-layout: fixed/);
  assert.match(report, /font-size: 11\.5px; line-height: 15px/);
  assert.match(report, /font-size: 9\.5px; line-height: 12px/);
  assert.doesNotMatch(report, /overflow-x-auto/);
  assert.match(report, /เนื้อขนมเบิกมาใช้/);
  assert.match(report, /ยอดยกมา/);
  assert.match(report, /ยอดค้างไลน์/);
  assert.match(service, /buildFgPackingReportRows/);
  assert.match(service, /metadata\?\.fgProductCode/);
  assert.match(service, /PGRST205/);
  assert.match(service, /แสดงของเสียเป็น 0/);
  assert.match(service, /fetchRowsByValueChunks\(issueIds/);
  assert.match(service, /chunkSize = 50, concurrency = 4/);
  assert.match(report, /payload\?\.warnings/);
  assert.match(migration, /target_document_id uuid/);
});

test("packing report uses the formal navy and gold report language from the issue report", () => {
  const client = read("src/app/production-line/fg-wip/FgPackingReportClient.js");

  assert.match(client, /packing-screen-header/);
  assert.match(client, /PACKING CONTROL/);
  assert.match(client, /linear-gradient\(135deg, var\(--navy-dark\), var\(--navy\)\)/);
  assert.match(client, /packing-filter-panel/);
  assert.match(client, /packing-report-table tbody tr:hover/);
});

test("packing report table uses light formal headers and uniform dark centered content", () => {
  const client = read("src/app/production-line/fg-wip/FgPackingReportClient.js");

  assert.match(client, /thead tr:first-child th \{[^}]*background: #f1f3f5;[^}]*color: #071e3d;/s);
  assert.match(client, /thead tr:nth-child\(2\) th \{[^}]*background: #f1f3f5;/s);
  assert.match(client, /tbody td \{[^}]*color: #050f1d;[^}]*font-size: 11\.5px;/s);
  assert.match(client, /packing-center-cell/);
});

test("packing report table headers use the Thai kilogram abbreviation", () => {
  const client = read("src/app/production-line/fg-wip/FgPackingReportClient.js");
  const tableHeader = client.match(/<thead>([\s\S]*?)<\/thead>/)?.[1] || "";

  assert.match(tableHeader, /น้ำหนัก \(กก\.\)/);
  assert.match(tableHeader, /ใช้จริง \(กก\.\)/);
  assert.doesNotMatch(tableHeader, /\(kg\)/i);
});

test("FG picker is restricted to configured KP13 products in FG categories", () => {
  const service = read("src/features/production-line/services/fgWipService.js");
  assert.match(service, /FG_DEPARTMENT_CODE = "KP13"/);
  assert.match(service, /FG_CATEGORY_CODES = \["04", "04-1", "04-2"\]/);
  assert.match(service, /production_department_products/);
  assert.match(service, /products_cache!inner\(iccat_code,is_active\)/);
  assert.match(service, /iccatCodes: FG_CATEGORY_CODES\.join/);
  assert.match(service, /allowedSkuCodes\.has\(row\.productCode\)/);
});

test("LOT uses Gregorian DDMMYY only", () => {
  const service = read("src/features/production-line/services/fgWipService.js");
  const client = read("src/app/production-line/fg-wip/FgWipEndOfDayPageClient.js");
  assert.match(service, /return `\$\{day\}\$\{month\}\$\{String\(year\)\.slice\(-2\)\}`/);
  assert.match(client, /return `\$\{day\}\$\{month\}\$\{String\(year\)\.slice\(-2\)\}`/);
  assert.doesNotMatch(service, /yearBE|\+ 543/);
  assert.doesNotMatch(client, /yearBE|\+ 543/);
});

test("WIP issue tab supports scan, picker, FIFO LOT selection and atomic issue", () => {
  const client = read("src/app/production-line/fg-wip/WipIssueTab.js");
  const service = read("src/features/production-line/services/fgWipService.js");
  const migration = read("supabase/migrations/20260818073041_add_wip_can_issue_flow.sql");
  assert.match(client, /เลือกจากรายการ/);
  assert.match(client, /เรียง LOT เก่าสุดก่อน \(FIFO\)/);
  assert.match(client, /ยืนยันเบิก WIP/);
  assert.match(client, /ไม่ต้องชั่งน้ำหนัก/);
  assert.match(service, /listAvailableWipCans/);
  assert.match(service, /issueWipCans/);
  assert.match(migration, /issue_wip_cans_atomic/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /WIP คงเหลือไม่พอ/);
  assert.match(migration, /grant execute .*service_role/is);
});

test("integrated carry-over WIP picker is responsive on mobile", () => {
  const client = read("src/app/production-line/fg-wip/FgWipEndOfDayPageClient.js");
  assert.match(client, /h-\[100dvh\][\s\S]*?sm:max-h-\[88vh\]/);
  assert.match(client, /grid-cols-\[minmax\(0,1fr\)_92px\][\s\S]*?sm:grid-cols-\[minmax\(0,1fr\)_150px_120px\]/);
  assert.match(client, /ค้นหารหัสสินค้า ชื่อสินค้า บาร์โค้ด หรือ LOT/);
  assert.match(client, /แสดงเฉพาะ LOT ที่ยังมียอดคงเหลือมากกว่า 0/);
});

test("selected carry-over WIP uses cards without horizontal scrolling on mobile", () => {
  const client = read("src/app/production-line/fg-wip/FgWipEndOfDayPageClient.js");
  assert.match(client, /space-y-3 sm:hidden[\s\S]*?จำนวนที่เบิกใช้/);
  assert.match(client, /hidden overflow-x-auto border[\s\S]*?sm:block/);
  assert.match(client, /grid-cols-\[88px_minmax\(0,1fr\)\]/);
  assert.match(client, /overflow-x-hidden p-3 sm:p-4/);
  assert.match(client, /flex min-w-0 flex-col sm:grid sm:grid-cols-\[minmax\(0,1fr\)_auto\]/);
});

test("other-purpose WIP issue is mobile-first and reuses the atomic stock ledger", () => {
  const page = read("src/app/production-line/fg-wip/FgWipEndOfDayPageClient.js");
  const client = read("src/app/production-line/fg-wip/WipOtherIssueTab.js");
  const service = read("src/features/production-line/services/fgWipService.js");
  const migration = read("supabase/migrations/20260824061912_add_wip_other_issue_purpose.sql");
  const stockMigration = read("supabase/migrations/20260818073041_add_wip_can_issue_flow.sql");

  assert.match(page, /เบิก WIP กรณีอื่น/);
  assert.match(page, /<WipOtherIssueTab/);
  assert.match(client, /เลือก WIP ค้างไลน์/);
  assert.match(client, /แสดงเฉพาะรายการที่ยังมียอดคงเหลือ/);
  assert.match(client, /ค้นหารหัสสินค้า ชื่อสินค้า บาร์โค้ด หรือ LOT/);
  assert.match(client, /ตัวอย่างลูกค้า/);
  assert.match(client, /ทดลอง \/ ตรวจคุณภาพ/);
  assert.match(client, /ใช้ภายใน/);
  assert.match(client, /รายการนี้จะตัดยอด WIP คงเหลือ แต่ไม่นับเป็นการนำไปผลิต/);
  assert.match(client, /sm:grid sm:place-items-center/);
  assert.match(client, /issuePurpose: purpose/);
  assert.match(service, /WIP_ISSUE_PURPOSES/);
  assert.match(service, /p_issue_purpose: issuePurpose/);
  assert.match(service, /p_recipient_note: recipientNote/);
  assert.match(migration, /issue_purpose in \('customer_sample', 'quality_test', 'internal_use', 'other'\)/i);
  assert.match(migration, /issue_wip_cans_other_atomic/);
  assert.match(stockMigration, /pg_advisory_xact_lock/);
  assert.match(stockMigration, /WIP คงเหลือไม่พอ/);
  assert.match(migration, /grant execute .*service_role/is);
});

test("FG/WIP waste tab reuses realtime scale logic and switches rejected cans to quantity", () => {
  const client = read("src/app/production-line/fg-wip/FgWipEndOfDayPageClient.js");
  const waste = read("src/app/production-line/fg-wip/WasteWeighTab.js");
  const service = read("src/features/production-line/services/fgWipService.js");
  const migration = read("supabase/migrations/20260818081226_add_fg_wip_waste_flow.sql");
  assert.match(client, /ชั่งของเสีย/);
  assert.match(waste, /usePieceRateDesktopScale/);
  assert.match(waste, /filling_scrap/);
  assert.match(waste, /rejected_can/);
  assert.match(waste, /กรอกจำนวนปี๊บที่เสีย/);
  assert.match(waste, /enabled: isWeightMode/);
  assert.match(service, /production_fg_wip_waste_logs/);
  assert.match(migration, /waste_type in \('filling_scrap', 'rejected_can'\)/i);
  assert.match(migration, /rejected_can_qty integer/i);
  assert.match(migration, /net_weight_kg numeric\(12, 3\)/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /grant select, insert .*service_role/i);
});

test("waste records use an atomic daily WSTDDMMYYXXX barcode and print automatically", async () => {
  const waste = read("src/app/production-line/fg-wip/WasteWeighTab.js");
  const service = read("src/features/production-line/services/fgWipService.js");
  const printClient = read("src/features/production-line/services/localPrintAgentClient.js");
  const labelPath = "src/features/production-line/services/wasteLabel.js";
  const names = await readdir("supabase/migrations");
  const migrationName = names.find((name) => name.endsWith("_make_fg_waste_lot_optional.sql"));
  const sequenceMigrationName = names.find((name) => name.endsWith("_use_daily_waste_barcode_sequence.sql"));

  assert.ok(existsSync(labelPath), "dedicated waste label builder must exist");
  const label = read(labelPath);
  assert.ok(migrationName, "waste-only LOT migration must exist");
  assert.ok(sequenceMigrationName, "atomic daily waste barcode migration must exist");
  const migration = read(`supabase/migrations/${migrationName}`);
  const sequenceMigration = read(`supabase/migrations/${sequenceMigrationName}`);
  assert.match(migration, /production_fg_wip_waste_logs[\s\S]*lot_no drop not null/i);
  assert.doesNotMatch(waste, /buildLotNo|lotNo/);
  assert.match(waste, /printWasteLabelViaAgent/);
  assert.match(waste, /await printWasteLabelViaAgent\(buildWastePrintLabel/);
  assert.match(waste, /onClick=\{\(\) => void reprintWaste\(row\)\}/);
  assert.match(service, /next_fg_wip_waste_barcode/);
  assert.match(service, /lot_no: null/);
  assert.match(printClient, /createWasteLabelBitmapPayload/);
  assert.match(label, /LABEL_WIDTH_MM = 80/);
  assert.match(label, /LABEL_HEIGHT_MM = 50/);
  assert.doesNotMatch(label, /WST-/);
  assert.match(sequenceMigration, /counter_date date primary key/i);
  assert.match(sequenceMigration, /on conflict \(counter_date\)[\s\S]*do update/i);
  assert.match(sequenceMigration, /to_char\(p_production_date, 'DDMMYY'\)/i);
  assert.match(sequenceMigration, /lpad\(l_next_value::text, 3, '0'\)/i);
  assert.match(sequenceMigration, /l_next_value > 999/i);
});

test("waste labels share the piece-rate printer queue while retaining the waste bitmap", () => {
  const client = read("src/features/production-line/services/localPrintAgentClient.js");
  const wasteFunction = client.match(/export async function printWasteLabelViaAgent[\s\S]*?\n\}/)?.[0] || "";
  assert.match(wasteFunction, /createWasteLabelBitmapPayload/);
  assert.match(wasteFunction, /\/print\/piece-rate-label/);
  assert.doesNotMatch(wasteFunction, /\/print\/weight-scale-label/);
});

test("FG/WIP waste rows can be soft-cancelled with an audited reason", async () => {
  const route = read("src/app/api/production-line/fg-wip/waste/route.js");
  const service = read("src/features/production-line/services/fgWipService.js");
  const client = read("src/app/production-line/fg-wip/WasteWeighTab.js");
  const names = await readdir("supabase/migrations");
  const migrationName = names.find((name) => name.endsWith("_add_fg_wip_waste_cancellation_audit.sql"));

  assert.ok(migrationName, "waste cancellation audit migration must exist");
  const migration = read(`supabase/migrations/${migrationName}`);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /cancelFgWipWasteLog/);
  assert.match(service, /voided_at: new Date\(\)\.toISOString\(\)/);
  assert.match(service, /void_reason: voidReason/);
  assert.match(service, /\.is\("voided_at", null\)/);
  assert.match(client, /ยืนยันยกเลิกรายการ/);
  assert.match(client, /รายการยังคงอยู่ในประวัติ แต่จะไม่ถูกนับรวมยอด/);
  assert.match(migration, /add column if not exists voided_by uuid/i);
  assert.match(migration, /add column if not exists void_reason text/i);
  assert.match(migration, /grant update on public\.production_fg_wip_waste_logs to service_role/i);
});

test("FG/WIP save workflows use the shared navy-gold success toast", () => {
  const toast = read("src/app/production-line/fg-wip/FgWipSuccessToast.js");
  const toastStyles = read("src/app/production-line/fg-wip/FgWipSuccessToast.module.css");
  for (const path of [
    "src/app/production-line/fg-wip/FgWipEndOfDayPageClient.js",
    "src/app/production-line/fg-wip/WasteWeighTab.js",
    "src/app/production-line/fg-wip/WipOtherIssueTab.js",
    "src/app/production-line/fg-wip/WipOpeningBalanceTab.js",
  ]) {
    assert.match(read(path), /FgWipSuccessToast/);
  }
  assert.match(toast, /role="status"/);
  assert.match(toast, /window\.setTimeout/);
  assert.match(toastStyles, /#061f43/i);
  assert.match(toastStyles, /#d9a514/i);
  assert.match(toastStyles, /@media \(max-width: 639px\)/i);
});

test("waste save revalidates a selected FG by canonical product code before Trade Code", () => {
  const service = read("src/features/production-line/services/fgWipService.js");
  const resolver = service.match(/async function resolveSelectedProduct\(selection\) \{([\s\S]*?)\n\}/)?.[1] || "";

  assert.ok(resolver, "selected FG resolver must exist");
  assert.match(resolver, /const searchCandidates = \[productCode, barcode\]/);
  assert.match(resolver, /row\.productCode === productCode && \(!barcode \|\| row\.barcode === barcode\)/);
  assert.ok(
    resolver.indexOf("searchCandidates") < resolver.indexOf("loadTradeCodes"),
    "canonical product code must be the first lookup candidate",
  );
});

test("WIP opening balance supports compact multi-select and multiple DDMMYY LOT rows", () => {
  const page = read("src/app/production-line/fg-wip/FgWipEndOfDayPageClient.js");
  const opening = read("src/app/production-line/fg-wip/WipOpeningBalanceTab.js");

  assert.match(page, /ตั้งต้นสต็อก WIP/);
  assert.match(page, /<WipOpeningBalanceTab/);
  assert.match(opening, /เลือก WIP หลายรายการ/);
  assert.match(opening, /เพิ่ม LOT/);
  assert.match(opening, /maxLength=\{6\}/);
  assert.match(opening, /รูปแบบ DDMMYY/);
  assert.match(opening, /บันทึกยอดตั้งต้น/);
  assert.doesNotMatch(opening, /FG ปลายทาง/);
});

test("WIP opening balance product picker shows each product unit beside its name", () => {
  const opening = read("src/app/production-line/fg-wip/WipOpeningBalanceTab.js");

  assert.match(opening, /row\.productName/);
  assert.match(opening, /row\.unitName/);
  assert.match(opening, /ชื่อ WIP.*หน่วย/s);
});

test("WIP opening balance is atomic and remains issuable through the existing stock ledger", async () => {
  const route = read("src/app/api/production-line/fg-wip/opening-balances/route.js");
  const service = read("src/features/production-line/services/fgWipService.js");
  const names = await readdir("supabase/migrations");
  const migrationName = names.find((name) => name.endsWith("_add_wip_opening_balance_flow.sql"));

  assert.ok(migrationName, "WIP opening balance migration must exist");
  const migration = read(`supabase/migrations/${migrationName}`);
  assert.match(route, /createWipOpeningBalanceBatch/);
  assert.match(service, /record_wip_opening_balance_batch/);
  assert.match(service, /issue_wip_opening_cans_atomic/);
  assert.match(service, /sourceMovementId/);
  assert.match(migration, /production_wip_opening_balance_batches/i);
  assert.match(migration, /jsonb_array_elements/i);
  assert.match(migration, /lot_no !~ '\^\[0-9\]\{6\}\$'/i);
  assert.match(migration, /movement_type[^\n]*'adjustment_in'/i);
  assert.match(migration, /issue_wip_opening_cans_atomic/i);
});
