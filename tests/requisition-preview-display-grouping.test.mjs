import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRequisitionPreviewDocuments,
  resolveRequisitionPreviewCellQty,
  upsertRequisitionSourceLineQty,
} from "../src/lib/requisitionPreviewDisplay.js";

function doc({
  key,
  sku,
  date,
  room = "ROOM-A",
  group = "RAW",
  material = `MAT-${sku}`,
  qty = 5,
  consolidateByDate = false,
}) {
  return {
    documentKey: key,
    parentSku: sku,
    parentSkuName: `สินค้า ${sku}`,
    ownerDepartmentId: "DEPT-1",
    roomId: room,
    roomLabel: room,
    shiftCode: "DAY",
    dispatchMaterialGroup: group,
    consolidateRequisitionPreviewByDate: consolidateByDate,
    workDate: date,
    workNamesByDate: { [date]: [`${sku} ชื่อสินค้า`] },
    lines: [{
      materialGoodsCode: material,
      materialName: material,
      unit: "KG",
      qtyByDate: { [date]: qty },
      totalQty: qty,
    }],
  };
}

test("ห้องที่เปิดรวมยอด Preview ต้องแสดงหนึ่งคอลัมน์ต่อวันและเก็บที่มาของแต่ละ FG", () => {
  const result = buildRequisitionPreviewDocuments([
    doc({
      key: "FG-1-DOC",
      sku: "FG-1",
      date: "2026-09-01",
      material: "M01",
      qty: 40,
      consolidateByDate: true,
    }),
    doc({
      key: "FG-2-DOC",
      sku: "FG-2",
      date: "2026-09-01",
      material: "M01",
      qty: 60,
      consolidateByDate: true,
    }),
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].previewColumns.length, 1);
  assert.equal(result[0].previewColumns[0].dateValue, "2026-09-01");
  assert.equal(result[0].previewColumns[0].isDailyRoomConsolidated, true);

  const columnKey = result[0].previewColumns[0].key;
  assert.equal(result[0].lines[0].qtyByPreviewColumn[columnKey], 100);
  assert.deepEqual(result[0].lines[0].breakdownByPreviewColumn[columnKey], [
    {
      sourceDocumentKey: "FG-1-DOC",
      productCode: "FG-1",
      productName: "สินค้า FG-1",
      qty: 40,
    },
    {
      sourceDocumentKey: "FG-2-DOC",
      productCode: "FG-2",
      productName: "สินค้า FG-2",
      qty: 60,
    },
  ]);
});

test("ห้องที่เปิดรวมยอด Preview ยังคงแยกคนละวัน", () => {
  const result = buildRequisitionPreviewDocuments([
    doc({ key: "A", sku: "FG-1", date: "2026-09-01", material: "M01", qty: 40, consolidateByDate: true }),
    doc({ key: "B", sku: "FG-2", date: "2026-09-02", material: "M01", qty: 60, consolidateByDate: true }),
  ]);

  assert.equal(result[0].previewColumns.length, 2);
  assert.deepEqual(result[0].previewColumns.map((column) => column.dateValue), ["2026-09-01", "2026-09-02"]);
});

test("คอลัมน์สรุปรวมทุกแผนกต้องอ่านยอดรายวันแทนการแสดงศูนย์", () => {
  const qty = resolveRequisitionPreviewCellQty({
    line: {
      qtyByDate: { "2026-09-01": 58 },
    },
    column: {
      key: "ALL_DEPARTMENTS::2026-09-01",
      dateValue: "2026-09-01",
      isPlaceholder: true,
    },
  });

  assert.equal(qty, 58);
});

test("คอลัมน์สินค้าใช้จำนวนจาก source column และไม่ fallback ข้ามสินค้า", () => {
  const qty = resolveRequisitionPreviewCellQty({
    line: {
      qtyByDate: { "2026-09-01": 100 },
      qtyByPreviewColumn: { "FG-1::2026-09-01": 40 },
    },
    column: {
      key: "FG-2::2026-09-01",
      dateValue: "2026-09-01",
    },
  });

  assert.equal(qty, 0);
});

test("รวมสินค้าคนละวันที่อยู่ห้องและกลุ่ม routing เดียวกันเพื่อแสดง Preview", () => {
  const result = buildRequisitionPreviewDocuments([
    doc({ key: "A", sku: "FG-1", date: "2026-08-31" }),
    doc({ key: "B", sku: "FG-2", date: "2026-09-01" }),
  ]);

  assert.equal(result.length, 1);
  assert.deepEqual(result[0].sourceDocumentKeys, ["A", "B"]);
  assert.equal(result[0].previewProductCount, 2);
  assert.equal(result[0].sourceDocumentKeyByDate["2026-09-01"], "B");
});

test("รวมการแสดงผลสินค้าคนละตัวในวันเดียวกัน แต่คงคอลัมน์และจำนวนแยกตามเอกสารต้นทาง", () => {
  const result = buildRequisitionPreviewDocuments([
    doc({ key: "A", sku: "FG-1", date: "2026-08-31", material: "MAT-SHARED", qty: 5 }),
    doc({ key: "B", sku: "FG-2", date: "2026-08-31", material: "MAT-SHARED", qty: 9 }),
  ]);

  assert.equal(result.length, 1);
  assert.equal(result[0].previewColumns.length, 2);
  assert.deepEqual(result[0].previewColumns.map((column) => column.sourceDocumentKey), ["A", "B"]);
  assert.deepEqual(
    result[0].previewColumns.map((column) => result[0].lines[0].qtyByPreviewColumn[column.key]),
    [5, 9]
  );
  assert.equal(result[0].lines[0].qtyByDate["2026-08-31"], 14);
});

test("วัตถุดิบเฉพาะสินค้าต้องไม่ถูกแสดงซ้ำในคอลัมน์สินค้าอื่นของวันเดียวกัน", () => {
  const result = buildRequisitionPreviewDocuments([
    doc({ key: "BL0-5005", sku: "BL0-5005", date: "2026-09-01", material: "S01-0432", qty: 180 }),
    doc({ key: "BL0-5026", sku: "BL0-5026", date: "2026-09-01", material: "S01-0433", qty: 180 }),
  ]);

  const columnsBySource = new Map(
    result[0].previewColumns.map((column) => [column.sourceDocumentKey, column])
  );
  const materialByCode = new Map(
    result[0].lines.map((line) => [line.materialGoodsCode, line])
  );
  const material5005 = materialByCode.get("S01-0432");
  const material5026 = materialByCode.get("S01-0433");

  assert.equal(material5005.qtyByPreviewColumn[columnsBySource.get("BL0-5005").key], 180);
  assert.equal(material5005.qtyByPreviewColumn[columnsBySource.get("BL0-5026").key], undefined);
  assert.equal(material5026.qtyByPreviewColumn[columnsBySource.get("BL0-5005").key], undefined);
  assert.equal(material5026.qtyByPreviewColumn[columnsBySource.get("BL0-5026").key], 180);
});

test("ไม่รวมใบ RAW กับ PACK และไม่รวมคนละห้อง", () => {
  const result = buildRequisitionPreviewDocuments([
    doc({ key: "RAW", sku: "FG-1", date: "2026-08-31", group: "RAW" }),
    doc({ key: "PACK", sku: "FG-2", date: "2026-09-01", group: "PACK" }),
    doc({ key: "OTHER-ROOM", sku: "FG-3", date: "2026-09-02", room: "ROOM-B", group: "RAW" }),
  ]);

  assert.equal(result.length, 3);
});

test("ไม่แสดง UUID ภายในเป็นรหัสสินค้าในหัวตาราง Preview", () => {
  const source = doc({ key: "A", sku: "832C05C8-3E78-48F1-9C53-06BF01DC2955", date: "2026-08-31" });
  source.parentSkuName = "ครีมรสบิสกิต 17";

  const result = buildRequisitionPreviewDocuments([source]);

  assert.equal(result[0].previewColumns[0].productName, "ครีมรสบิสกิต 17");
  assert.equal(result[0].previewColumns[0].productCode, "");
});

test("กรอกจำนวนในคอลัมน์สินค้าอื่นต้องสร้างวัตถุดิบในใบต้นทางนั้นได้", () => {
  const referenceLine = {
    materialSkuCode: "SKU-N15",
    materialGoodsCode: "N15-0002",
    materialName: "ฟิล์มยืดเอ็มเสตรช",
    unit: "ม้วน",
    qtyByDate: { "2026-08-31": 9 },
    totalQty: 9,
    isManual: true,
  };

  const result = upsertRequisitionSourceLineQty([], referenceLine, "2026-09-01", 2);

  assert.equal(result.length, 1);
  assert.equal(result[0].materialGoodsCode, "N15-0002");
  assert.equal(result[0].qtyByDate["2026-08-31"], undefined);
  assert.equal(result[0].qtyByDate["2026-09-01"], 2);
  assert.equal(result[0].totalQty, 2);
  assert.equal(result[0].isManual, true);
});

test("แก้จำนวนวัตถุดิบเดิมต้องรักษาวันอื่นและคำนวณยอดรวมใหม่", () => {
  const existingLine = {
    materialSkuCode: "SKU-N15",
    materialGoodsCode: "N15-0002",
    materialName: "ฟิล์มยืดเอ็มเสตรช",
    unit: "ม้วน",
    qtyByDate: { "2026-08-31": 1, "2026-09-01": 2 },
    totalQty: 3,
    isManual: true,
  };

  const result = upsertRequisitionSourceLineQty(
    [existingLine],
    existingLine,
    "2026-09-01",
    5
  );

  assert.deepEqual(result[0].qtyByDate, { "2026-08-31": 1, "2026-09-01": 5 });
  assert.equal(result[0].totalQty, 6);
});

test("วันที่วางแผนและชื่อสินค้าต้องไม่หายเมื่อ Draft ของวันนั้นยังไม่มียอด", () => {
  const source = doc({
    key: "SHIFT2-VL0-5010",
    sku: "VL0-5010",
    date: "2026-09-01",
    material: "R00-0032",
    qty: 1,
  });
  source.workNamesByDate = {
    "2026-09-01": ["เวเฟอร์สติ๊กวันที่ 1"],
    "2026-09-02": ["เวเฟอร์สติ๊กลายจุด ครีมช็อก"],
    "2026-09-05": ["เวเฟอร์สติ๊กลายจุด ครีมช็อก"],
  };

  const result = buildRequisitionPreviewDocuments([source]);

  assert.deepEqual(
    result[0].previewColumns.map((column) => column.dateValue),
    ["2026-09-01", "2026-09-02", "2026-09-05"]
  );
  assert.equal(result[0].previewColumns[1].sourceDocumentKey, "SHIFT2-VL0-5010");
  assert.equal(result[0].previewColumns[1].productCode, "VL0-5010");
});
