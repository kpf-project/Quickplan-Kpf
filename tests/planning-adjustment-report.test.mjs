import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("adjustment shift selection replaces stale metadata with the configured shift and time", async () => {
  const { buildPlanningShiftOptions, updatePlanningRowField } = await import("../src/lib/planningAdjustment.js");
  const options = buildPlanningShiftOptions([
    { shiftId: "S1", shiftCode: "SHIFT1", shiftName: "กะ 1", startTime: "07:00", endTime: "16:00" },
  ], [{ id: "S2", code: "SHIFT2", name: "กะ 2", startTime: "19:00", endTime: "04:00" }]);
  assert.equal(options.length, 1);
  assert.equal(options[0].label, "กะ 1 (07:00-16:00)");
  const row = updatePlanningRowField({ row_data: { shiftId: "S2", shiftCode: "SHIFT2", shiftName: "กะ 2", qty: 100 } }, "shift", "S1", { shift: options[0] });
  assert.deepEqual(row.row_data, { shift: "กะ 1 (07:00-16:00)", shiftId: "S1", shiftCode: "SHIFT1", shiftName: "กะ 1", qty: 100 });
  assert.equal(row.shift_code, "SHIFT1");
});

test("adjustment publishing refreshes each changed plan once and reports a failed publication", async () => {
  const { publishAdjustedSchedulePlans } = await import("../src/lib/planningAdjustment.js");
  const calls = [];
  await publishAdjustedSchedulePlans(["P1", "P1", "P2"], async (id) => { calls.push(id); return { ok: true }; });
  assert.deepEqual(calls, ["P1", "P2"]);
  await assert.rejects(publishAdjustedSchedulePlans(["P1"], async () => ({ ok: false, error: { message: "publish failed" } })), /publish failed/);
});

function readSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

test("jam planning rows resolve jamSku without dropping the planned product", async () => {
  const { resolvePlanningScheduleSkuKey } = await import("../src/lib/planningAdjustment.js");
  assert.equal(resolvePlanningScheduleSkuKey({ jamSku: "เนื้อขนมออพายป้ายแยมสับปะรด", jamQty: 66 }), "jamSku");
  assert.equal(resolvePlanningScheduleSkuKey({ packSku: "ขนมปังกรอบ", qty: 180 }), "packSku");
  assert.equal(resolvePlanningScheduleSkuKey({ jamSku: "", creamSku: "คุกกี้" }, { skuKeys: ["jamSku", "creamSku"] }), "creamSku");
});

test("planning adjustment locks only dates before the Bangkok business date", async () => {
  const {
    getBangkokDateOnly,
    isPlanningDateEditable,
    resolveScheduleWorkDate,
  } = await import("../src/lib/planningAdjustment.js");

  assert.equal(getBangkokDateOnly(new Date("2026-09-17T18:00:00.000Z")), "2026-09-18");
  assert.equal(isPlanningDateEditable("2026-09-17", "2026-09-18"), false);
  assert.equal(isPlanningDateEditable("2026-09-18", "2026-09-18"), true);
  assert.equal(isPlanningDateEditable("2026-09-19", "2026-09-18"), true);
  assert.equal(isPlanningDateEditable("", "2026-09-18"), false);
  assert.equal(resolveScheduleWorkDate("2026-09-14", "thu"), "2026-09-17");
  assert.equal(resolveScheduleWorkDate("2026-09-14", "2026-09-19"), "2026-09-19");
});

test("new FG adjustment records keep the routing and BOM selection context", async () => {
  const { buildPlanningStatusRecord } = await import("../src/lib/planningAdjustment.js");
  const record = buildPlanningStatusRecord({
    planId: "REPORT-MP202609002-1",
    masterPlanNo: "mp202609002",
    workDate: "2026-09-19",
    skuCode: "B01-1013",
    skuName: "ขนมปังกรอบ รสงา",
    plannedQty: 180,
    unit: "5 กก.",
    departmentId: "KP13",
    sectionId: "BIS-PACK",
    sectionName: "ส่วนขนมปังกรอบบรรจุปี๊บ",
    shiftId: "SHIFT-1",
    shiftCode: "A",
    shiftName: "กะ 1",
    formulaCode: "MAIN",
    bomVersionId: "BOM-1",
    confirmedAt: "2026-09-18T08:00:00.000Z",
  });

  assert.equal(record.master_plan_no, "MP202609002");
  assert.equal(record.plan_kind, "main");
  assert.equal(record.status, "ready");
  assert.equal(record.confirmed_at, "2026-09-18T08:00:00.000Z");
  assert.equal(record.owner_department_id, "KP13");
  assert.equal(record.schedule_section_def_id, "BIS-PACK");
  assert.equal(record.shift_code, "A");
  assert.equal(record.planned_qty, 180);
  assert.equal(record.formula_code, "MAIN");
  assert.equal(record.bom_version_id, "BOM-1");
});

test("planning report keeps each section's own columns and rows", async () => {
  const { buildPlanningSectionViews } = await import("../src/lib/planningAdjustment.js");
  const sections = [
    {
      id: "JAM",
      name: "ส่วนงานป้ายแยม",
      display_order: 1,
      production_schedule_column_defs: [
        { key: "jamQty", label: "จำนวนงาน", display_order: 2 },
        { key: "jamSku", label: "ผลิตภัณฑ์", display_order: 1 },
      ],
    },
    {
      id: "CREAM",
      name: "ส่วนงานป้ายครีม",
      display_order: 2,
      production_schedule_column_defs: [
        { key: "machine", label: "เครื่อง", display_order: 2 },
        { key: "skuName", label: "ผลิตภัณฑ์", display_order: 1 },
      ],
    },
  ];
  const rows = [
    { plan_id: "C1", schedule_section_def_id: "CREAM", sku_name: "คุกกี้ครีม", row_data: {} },
    { plan_id: "J1", schedule_section_def_id: "JAM", sku_name: "ขนมป้ายแยม", row_data: {} },
  ];

  const views = buildPlanningSectionViews({ sections, rows, deletedIds: new Set(), search: "" });

  assert.deepEqual(views.map((section) => section.id), ["JAM", "CREAM"]);
  assert.deepEqual(views[0].columns.map((column) => column.key), ["jamSku", "jamQty"]);
  assert.deepEqual(views[1].columns.map((column) => column.key), ["skuName", "machine"]);
  assert.deepEqual(views[0].rows.map((row) => row.plan_id), ["J1"]);
  assert.deepEqual(views[1].rows.map((row) => row.plan_id), ["C1"]);
});

test("selected FG shows only WIP from the same section and production date", async () => {
  const { getLinkedPlanningWipLines } = await import("../src/lib/planningAdjustment.js");
  const selected = {
    period_start: "2026-10-02",
    schedule_section_def_id: "JAM",
  };
  const lines = [
    { skuCode: "WKB-0041", workDate: "2026-10-02", sourceSectionDefId: "JAM" },
    { skuCode: "WKB-0053", workDate: "2026-10-02", sourceSectionDefId: "JAM" },
    { skuCode: "WKB-0058", workDate: "2026-10-02", sourceSectionDefId: "CREAM" },
    { skuCode: "WKB-0002", workDate: "2026-10-03", sourceSectionDefId: "JAM" },
  ];

  assert.deepEqual(
    getLinkedPlanningWipLines(selected, lines).map((line) => line.skuCode),
    ["WKB-0041", "WKB-0053"]
  );
});

test("changing an FG selects the product first approved formula and updates schedule source data", async () => {
  const { applyPlanningProductSelection } = await import("../src/lib/planningAdjustment.js");
  const row = {
    sku_code: "OLD-001",
    sku_name: "สินค้าเดิม",
    unit: "ลัง",
    row_data: { product: "สินค้าเดิม", brand: "เดิม", people: 3 },
  };
  const product = {
    skuCode: "NEW-001",
    name: "สินค้าใหม่",
    brand: "แม่มะลิ",
    unit: "ปี๊บ",
    formulaOptions: [
      { formula_code: "F2", formula_name: "สูตรแรก", bom_version_id: "BOM-F2" },
      { formula_code: "DEFAULT", formula_name: "สูตรรอง", bom_version_id: "BOM-DEFAULT" },
    ],
  };

  const updated = applyPlanningProductSelection(row, product, {
    productKey: "product",
    brandKey: "brand",
  });

  assert.equal(updated.sku_code, "NEW-001");
  assert.equal(updated.sku_name, "สินค้าใหม่");
  assert.equal(updated.unit, "ปี๊บ");
  assert.equal(updated.row_data.product, "สินค้าใหม่");
  assert.equal(updated.row_data.brand, "แม่มะลิ");
  assert.equal(updated.row_data.formulaCode, "F2");
  assert.equal(updated.row_data.bomVersionId, "BOM-F2");
});

test("changing people keeps the value in schedule row data used by requisition preview", async () => {
  const { updatePlanningRowField } = await import("../src/lib/planningAdjustment.js");
  const row = { row_data: { people: 3, qty: 100 } };

  const updated = updatePlanningRowField(row, "people", "5", { numeric: true });

  assert.equal(updated.row_data.people, 5);
  assert.equal(updated.row_data.qty, 100);
});

test("add-item search keeps only approved BOM FG and matches code name or brand", async () => {
  const { filterPlanningProducts } = await import("../src/lib/planningAdjustment.js");
  const products = [
    { skuCode: "B03-0003", name: "แม่มะลิ แยมสับปะรด", brand: "แม่มะลิ", hasBom: true },
    { skuCode: "BL0-1104", name: "ขนมปังกรอบ แยมสับปะรด", brand: "ระฆังทอง", hasBom: false },
    { skuCode: "B06-0006", name: "แม่มะลิ สมุย", brand: "แม่มะลิ", hasBom: true },
  ];

  assert.deepEqual(
    filterPlanningProducts(products, "สับปะรด", { requireBom: true }).map((item) => item.skuCode),
    ["B03-0003"]
  );
  assert.deepEqual(
    filterPlanningProducts(products, "B06", { requireBom: true }).map((item) => item.skuCode),
    ["B06-0006"]
  );
});

test("requisition preview prefers the latest schedule rows over an older published snapshot", async () => {
  const { preferPlanningScheduleRows } = await import("../src/lib/planningAdjustment.js");
  const publishedRows = [{ plan_id: "PUBLISHED", sku_code: "OLD-001", planned_qty: 100 }];
  const scheduleRows = [{ plan_id: "SCHEDULE", sku_code: "NEW-001", planned_qty: 120 }];

  assert.deepEqual(preferPlanningScheduleRows(scheduleRows, publishedRows), scheduleRows);
  assert.deepEqual(preferPlanningScheduleRows([], publishedRows), publishedRows);
  assert.match(readSource("src/lib/materialClaimPool.js"), /preferPlanningScheduleRows\(scheduleRows, publishedRows\)/);
});

test("status report mutations opt into a server-side editable date guard", () => {
  const source = readSource("src/app/api/production-planning/status/route.js");
  assert.match(source, /isPlanningDateEditable/);
  assert.match(source, /editableFromDate/);
  assert.match(source, /ไม่สามารถแก้ไขแผนของวันที่ผ่านมาแล้ว/);
  assert.match(source, /record\.plan_kind === "main"/);
});

test("schedule FG mutations use the same server-side business-date guard", () => {
  const rowRoute = readSource("src/app/api/production-planning/schedule/rows/[id]/route.js");
  const addRoute = readSource("src/app/api/production-planning/schedule/plans/[id]/rows/route.js");
  assert.match(rowRoute, /rejectPastScheduleRow/);
  assert.match(rowRoute, /editableFromDate/);
  assert.match(addRoute, /resolveScheduleWorkDate/);
  assert.match(addRoute, /ไม่สามารถแก้ไขแผนของวันที่ผ่านมาแล้ว/);
});

test("planning report loads FG by the exact master plan number", () => {
  const report = readSource("src/features/production-planning/components/PlanningControlCenterClient.js");
  const plansRoute = readSource("src/app/api/production-planning/schedule/plans/route.js");
  assert.match(report, /schedule\/plans\?masterPlanNo=/);
  assert.match(plansRoute, /sp\.get\("masterPlanNo"\)/);
  assert.match(plansRoute, /q = q\.eq\("master_plan_no", masterPlanNo\)/);
});

test("WIP replacement preserves historical rows and permits clearing editable dates", () => {
  const route = readSource("src/app/api/production-planning/wip-plan/draft/route.js");
  const persistence = readSource("src/lib/autoSubplanDrafts.js");

  assert.match(route, /replaceFromDate/);
  assert.match(route, /inputLines\.length/);
  assert.match(route, /persistSubplanDraftLines\([\s\S]*replaceFromDate/);
  assert.match(persistence, /replaceFromDate/);
  assert.match(persistence, /period_start/);
  assert.match(persistence, /editableExistingPlanIds/);
});

test("compact report saves FG and WIP through the BOM-backed planning pipelines", () => {
  const source = readSource(
    "src/features/production-planning/components/PlanningControlCenterClient.js"
  );

  assert.match(source, /PlanningHeader activeTab="report"/);
  assert.match(source, /แยก Section ตามหัวคอลัมน์จริง/);
  assert.match(source, /WIP ที่เชื่อมโยงจากแผนนี้/);
  assert.match(source, /เพิ่มสินค้า FG/);
  assert.match(source, /เพิ่มรายการผลิต/);
  assert.match(source, /เฉพาะสินค้าที่มี BOM อนุมัติแล้ว/);
  assert.match(source, /filterPlanningProducts/);
  assert.match(source, /updateFgProduct\(selectedFgRow/);
  assert.match(source, /updateFgField\(selectedFgRow\.plan_id, selectedPeopleColumn\.key/);
  assert.match(source, /isPlanningDateEditable/);
  assert.match(source, /\/api\/production-planning\/status/);
  assert.match(source, /\/api\/production-planning\/schedule\/plans/);
  assert.match(source, /\/api\/production-planning\/schedule\/rows/);
  assert.match(source, /\/api\/production-planning\/wip-plan\/draft/);
  assert.match(source, /\/api\/production-planning\/subplan\/confirm/);
  assert.match(source, /\/production-line\/planning\/requisition-preview/);
  assert.match(source, /replaceFromDate/);
  assert.match(source, /editableFromDate/);
  assert.match(source, /บันทึกทั้งหมด/);
});
