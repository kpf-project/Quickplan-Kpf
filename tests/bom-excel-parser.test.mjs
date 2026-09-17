import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";

import {
  createMultiProductTemplate,
  exportSingleProductWorkbook,
  parseMultiProductWorkbookBuffer,
} from "../src/features/production-line/utils/bomExcel.js";

test("parses current columns including trade code and calculation settings", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("BOM-Input");
  sheet.addRow([
    "รหัสสินค้าตัวแม่",
    "ชื่อสินค้าตัวแม่ (AUTO)",
    "ประเภทตัวแม่ (AUTO)",
    "โหมดปริมาณ WIP",
    "base_batch",
    "base_output_boxes",
    "รหัสวัตถุดิบที่ใช้จริง",
    "SKU ภายใน (AUTO)",
    "ชื่อวัตถุดิบ/WIP (AUTO)",
    "ประเภทลูก (AUTO)",
    "จำนวน",
    "หน่วย (AUTO)",
    "ฐานคำนวณ",
    "ค่าฐาน",
    "วิธีปัดเศษ",
    "วันเหลื่อมแผน",
    "หมายเหตุ",
  ]);
  sheet.addRow([
    "WKB-0041",
    "",
    "",
    "UNIT",
    1,
    2,
    "M04-00790",
    "M04-0079",
    "",
    "",
    5,
    "",
    "MACHINE_COUNT",
    2,
    "UP",
    -1,
    "ทดสอบ",
  ]);

  const rows = await parseMultiProductWorkbookBuffer(
    await workbook.xlsx.writeBuffer()
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].parentSkuCode, "WKB-0041");
  assert.equal(rows[0].materialGoodsCode, "M04-00790");
  assert.equal(rows[0].materialSkuCode, "M04-0079");
  assert.equal(rows[0].calculationBasis, "MACHINE_COUNT");
  assert.equal(rows[0].machineBase, 2);
  assert.equal(rows[0].machineRoundMode, "UP");
  assert.equal(rows[0].planningOffsetDays, -1);
});

test("parses legacy columns with current defaults", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("BOM-Input");
  sheet.addRow([
    "รหัสสินค้า",
    "ชื่อสินค้า (AUTO)",
    "base_batch",
    "base_output_boxes",
    "รหัสวัตถุดิบ",
    "ชื่อวัตถุดิบ/WIP (AUTO)",
    "จำนวน",
    "หมายเหตุ",
  ]);
  sheet.addRow([
    "B03-0003",
    "",
    1,
    60,
    "WKB-0041",
    "",
    2,
    "สูตรเดิม",
  ]);

  const rows = await parseMultiProductWorkbookBuffer(
    await workbook.xlsx.writeBuffer()
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].formulaCode, "DEFAULT");
  assert.equal(rows[0].calculationBasis, "JOB_QTY");
  assert.equal(rows[0].planningOffsetDays, 0);
  assert.equal(rows[0].materialGoodsCode, "WKB-0041");
  assert.equal(rows[0].materialSkuCode, "");
});

test("reads formula result values and skips empty template rows", async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("BOM-Input");
  sheet.addRow([
    "รหัสสินค้าตัวแม่",
    "โหมดปริมาณ WIP",
    "base_batch",
    "base_output_boxes",
    "รหัสวัตถุดิบที่ใช้จริง",
    "SKU ภายใน",
    "จำนวน",
  ]);
  sheet.addRow([
    "B03-0003",
    "UNIT",
    1,
    60,
    "M04-00790",
    { formula: "1+1", result: "M04-0079" },
    1,
  ]);
  sheet.addRow(["", "", "", "", "", "", ""]);

  const rows = await parseMultiProductWorkbookBuffer(
    await workbook.xlsx.writeBuffer()
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].materialSkuCode, "M04-0079");
});

test("creates the current multi-product template with trade-code catalog", async () => {
  const buffer = await createMultiProductTemplate({
    products: [
      {
        code: "B03-0003",
        name: "สินค้าสำเร็จรูป",
        category: "04",
        unit: "ลัง",
      },
      {
        code: "WKB-0041",
        name: "แป้งหมัก",
        category: "03",
        unit: "ชุด",
      },
    ],
    materials: [
      {
        code: "M04-0079",
        goodsCode: "M04-0079",
        name: "มาการีน KG",
        category: "01",
        unit: "KG",
      },
      {
        code: "M04-0079",
        goodsCode: "M04-00790",
        name: "มาการีน กล่อง",
        category: "01",
        unit: "กล่องx15",
      },
    ],
    exampleRows: [
      {
        parentSkuCode: "BL0-5001",
        wipQtyInputMode: "unit",
        baseBatch: 1,
        baseOutputBoxes: 60,
        materialGoodsCode: "WKB-0041",
        qty: 2,
        calculationBasis: "JOB_QTY",
        calculationBase: 1,
        roundMode: "NONE",
        planningOffsetDays: -1,
        notes: "ตัวอย่าง BL0-5001 Level 1",
      },
      {
        parentSkuCode: "WKB-0041",
        wipQtyInputMode: "unit",
        baseBatch: 1,
        baseOutputBoxes: 2,
        materialGoodsCode: "M04-00790",
        qty: 1,
        calculationBasis: "JOB_QTY",
        calculationBase: 1,
        roundMode: "NONE",
        planningOffsetDays: 0,
        notes: "ตัวอย่าง BL0-5001 Level 2",
      },
    ],
  });
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const input = workbook.getWorksheet("BOM-Input");
  const catalog = workbook.getWorksheet("รายการวัตถุดิบ");

  assert.ok(input);
  assert.ok(workbook.getWorksheet("วิธีกรอก"));
  assert.ok(workbook.getWorksheet("รายการสินค้า"));
  assert.ok(catalog);
  assert.equal(input.getRow(1).cellCount, 17);
  assert.equal(input.getCell("A1").value, "รหัสสินค้าตัวแม่");
  assert.equal(input.getCell("G1").value, "รหัสวัตถุดิบที่ใช้จริง");
  assert.equal(input.getCell("M1").value, "ฐานคำนวณ");
  assert.match(input.getCell("D2").dataValidation.formulae[0], /หน่วย/);
  assert.equal(catalog.getCell("A2").value, "M04-0079");
  assert.equal(catalog.getCell("A3").value, "M04-00790");
  assert.equal(catalog.getCell("B2").value, "M04-0079");
  assert.equal(catalog.getCell("B3").value, "M04-0079");
  assert.equal(input.getCell("A2").value, "BL0-5001");
  assert.equal(input.getCell("G2").value, "WKB-0041");
  assert.equal(input.getCell("Q2").value, "ตัวอย่าง BL0-5001 Level 1");
  assert.equal(input.getCell("A3").value, "WKB-0041");
  assert.equal(input.getCell("Q3").value, "ตัวอย่าง BL0-5001 Level 2");
});

test("exports a current BOM that can be imported without losing fields", async () => {
  const buffer = await exportSingleProductWorkbook({
    productCode: "WKB-0041",
    productName: "แป้งหมัก",
    wipQtyInputMode: "unit",
    baseBatch: 1,
    baseOutputBoxes: 2,
    items: [{
      materialCode: "M04-0079",
      materialGoodsCode: "M04-00790",
      materialName: "มาการีน กล่อง",
      itemType: "RAW",
      qty: 1,
      unit: "กล่องx15",
      calculationBasis: "MACHINE_COUNT",
      machineBase: 2,
      machineRoundMode: "UP",
      planningOffsetDays: 0,
      note: "ทดสอบ",
    }],
  });

  const rows = await parseMultiProductWorkbookBuffer(buffer);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].materialGoodsCode, "M04-00790");
  assert.equal(rows[0].materialSkuCode, "M04-0079");
  assert.equal(rows[0].calculationBasis, "MACHINE_COUNT");
  assert.equal(rows[0].machineBase, 2);
  assert.equal(rows[0].machineRoundMode, "UP");
});
