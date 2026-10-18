import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRequisitionPreviewDocuments,
  mergeRequisitionDraftLines,
  resolveRequisitionPreviewCellQty,
  upsertRequisitionSourceLineQty,
  resolveRequisitionEditableDocumentKey,
} from "../src/lib/requisitionPreviewDisplay.js";

test("deleting a line keeps only exported dates even before ERP synchronization", () => {
  const lots = [{ lotNo: "260913", qty: 2 }];
  const source = [{ materialGoodsCode: "M03-00090", unit: "ถุงx30",
    qtyByDate: { "2026-10-13": 2, "2026-10-14": 54 },
    exportedLotsByDate: { "2026-10-13": lots } }];
  const [line] = mergeRequisitionDraftLines(source, [], { exportedByDate: { "2026-10-13": true } });
  assert.deepEqual(line.qtyByDate, { "2026-10-13": 2 });
  assert.deepEqual(line.exportedLotsByDate, { "2026-10-13": lots });
  assert.equal(line.totalQty, 2);
});

test("zero and deletion remove unexported-only materials in a document with an exported day", () => {
  const source = [{ materialGoodsCode: "M03-00220", unit: "ถุงx22.50",
    qtyByDate: { "2026-10-14": 646, "2026-10-15": 120 } }];
  const info = { exportedByDate: { "2026-10-13": true }, erpSyncByDate: { "2026-10-13": { status: "exact" } } };
  assert.deepEqual(mergeRequisitionDraftLines(source, [], info), []);
  const afterZero = upsertRequisitionSourceLineQty(source, source[0], "2026-10-14", 0);
  const [line] = mergeRequisitionDraftLines(source, afterZero, info);
  assert.deepEqual(line.qtyByDate, { "2026-10-15": 120 });
  assert.equal(line.totalQty, 120);
  assert.deepEqual(mergeRequisitionDraftLines(source,
    upsertRequisitionSourceLineQty(afterZero, afterZero[0], "2026-10-15", 0), info), []);
});

test("room totals never display the internal consolidation key as a product", () => {
  const source = doc({ key: "ROOM-DOC", sku: "FG-1", date: "2026-10-13", consolidateByDate: true });
  source.parentSku = null;
  source.parentSkuName = null;
  source.workstreamCode = "CONSOLIDATED";
  source.workNamesByDate = {};
  const [result] = buildRequisitionPreviewDocuments([source]);
  assert.equal(result.previewColumns[0].productCode, "");
  assert.equal(result.previewColumns[0].productName, "-");
});

test("a newly added zero-quantity material remains editable in a single-source room total", () => {
  assert.equal(resolveRequisitionEditableDocumentKey({
    isDailyRoomConsolidated: true,
    sourceDocumentKey: "ROOM-DOC",
    sourceDocumentKeys: ["ROOM-DOC"],
  }), "ROOM-DOC");
  assert.equal(resolveRequisitionEditableDocumentKey({
    isDailyRoomConsolidated: true,
    sourceDocumentKeys: ["A", "B"],
  }), "");
  assert.equal(resolveRequisitionEditableDocumentKey({ exported: true, sourceDocumentKey: "A" }), "");
});
import { matchErpActualDocuments } from "../src/lib/requisitionErpActual.js";

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

test("เอกสารที่รวมเพื่อแสดงผลต้องรักษา LOT ที่ Export และ LOT ที่ผู้ใช้แก้", () => {
  const source = doc({ key: "A", sku: "FG-1", date: "2026-09-29", material: "M01-00040", qty: 4 });
  source.lines[0].exportedLotsByDate = {
    "2026-09-29": [{ lotNo: "260912", warehouseCode: "04", qty: 1 }],
  };
  source.lines[0].lotAllocationsByDate = {
    "2026-09-29": [{ lotNo: "260916", qty: 4 }],
  };

  const [result] = buildRequisitionPreviewDocuments([source]);

  assert.deepEqual(result.lines[0].exportedLotsByDate, source.lines[0].exportedLotsByDate);
  assert.deepEqual(result.lines[0].lotAllocationsByDate, source.lines[0].lotAllocationsByDate);
});

test("แบบร่างต้องรักษาจำนวนที่แก้ แต่ใช้ประวัติ LOT ล่าสุดจากใบ Export", () => {
  const sourceLines = [{
    materialGoodsCode: "M04-00270",
    unit: "ก.ล.x24กก.",
    qtyByDate: { "2026-10-03": 77 },
    exportedLotsByDate: {
      "2026-09-29": [{ lotNo: "260910", warehouseCode: "04", qty: 5 }],
    },
  }];
  const draftLines = [{
    materialGoodsCode: "M04-00270",
    unit: "ก.ล.x24กก.",
    qtyByDate: { "2026-10-03": 76 },
  }];

  const [result] = mergeRequisitionDraftLines(sourceLines, draftLines);

  assert.equal(result.qtyByDate["2026-10-03"], 76);
  assert.deepEqual(result.exportedLotsByDate, sourceLines[0].exportedLotsByDate);
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

test("แก้จำนวนเป็นศูนย์ต้องลบเฉพาะยอดของวันนั้น", () => {
  const line = {
    materialSkuCode: "M01-0029",
    materialGoodsCode: "M01-0029",
    materialName: "Cocoa Powder",
    unit: "KG",
    qtyByDate: { "2026-09-24": 2, "2026-09-25": 3 },
    totalQty: 5,
  };

  const result = upsertRequisitionSourceLineQty([line], line, "2026-09-25", 0);

  assert.deepEqual(result[0].qtyByDate, { "2026-09-24": 2 });
  assert.equal(result[0].totalQty, 2);
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

test("เมื่อซิงค์ ERP จริง จำนวนในช่องหลักต้องเปลี่ยนตาม ERP, เพิ่มวัตถุดิบใหม่, และลบวัตถุดิบที่ถูกลบใน ERP", () => {
  const docInfo = {
    erpSyncByDate: {
      "2026-10-01": { status: "exact", actualDocumentNo: "XA6910/0001" },
    },
  };
  const sourceLines = [
    // วัตถุดิบเดิม แต่ใน ERP แก้จำนวนจาก 50 เป็น 55
    {
      materialGoodsCode: "M01-0001",
      unit: "KG",
      qtyByDate: { "2026-10-01": 55 },
      erpLotsByDate: {
        "2026-10-01": [{ lotNo: "LOT-A", warehouseCode: "WH1", qty: 55 }],
      },
    },
    // วัตถุดิบใหม่ที่ถูกเพิ่มใน ERP
    {
      materialGoodsCode: "M02-NEW",
      unit: "KG",
      qtyByDate: { "2026-10-01": 10 },
      erpLotsByDate: {
        "2026-10-01": [{ lotNo: "LOT-NEW", warehouseCode: "WH1", qty: 10 }],
      },
    },
    // สังเกตว่า M03-DELETED ไม่มีใน sourceLines เพราะถูกลบใน ERP
  ];

  const draftLines = [
    // วัตถุดิบเดิม ตอน draft ตั้งไว้ 50
    {
      materialGoodsCode: "M01-0001",
      unit: "KG",
      qtyByDate: { "2026-10-01": 50, "2026-10-02": 30 },
    },
    // วัตถุดิบที่ถูกลบใน ERP (ใน draft เดิมมี 20 บนวันที่ 2026-10-01)
    {
      materialGoodsCode: "M03-DELETED",
      unit: "KG",
      qtyByDate: { "2026-10-01": 20 },
    },
  ];

  const result = mergeRequisitionDraftLines(sourceLines, draftLines, docInfo);

  // 1. M01-0001: วันที่ 2026-10-01 ต้องเปลี่ยนเป็นยอด ERP จริงคือ 55, วันที่ 2026-10-02 คงยอด draft เดิมคือ 30
  const m1 = result.find((l) => l.materialGoodsCode === "M01-0001");
  assert.ok(m1);
  assert.equal(m1.qtyByDate["2026-10-01"], 55);
  assert.equal(m1.qtyByDate["2026-10-02"], 30);
  assert.equal(m1.totalQty, 85);

  // 2. M02-NEW: วัตถุดิบใหม่ต้องปรากฏในรายการด้วยยอด 10
  const m2 = result.find((l) => l.materialGoodsCode === "M02-NEW");
  assert.ok(m2);
  assert.equal(m2.qtyByDate["2026-10-01"], 10);
  assert.equal(m2.totalQty, 10);

  // 3. M03-DELETED: วัตถุดิบที่ถูกลบใน ERP ต้องไม่ปรากฏในรายการ
  const m3 = result.find((l) => l.materialGoodsCode === "M03-DELETED");
  assert.equal(m3, undefined);
});

test("แก้จำนวนเป็น 0 บนวันที่ยังไม่ได้ export ต้องไม่เด้งกลับไปเป็นยอดเดิมของ BOM", () => {
  const sourceLines = [
    {
      materialGoodsCode: "M01-0001",
      unit: "KG",
      qtyByDate: { "2026-10-05": 36, "2026-10-06": 40 },
    },
    {
      materialGoodsCode: "M02-0002",
      unit: "KG",
      qtyByDate: { "2026-10-05": 36 },
    },
  ];

  // จำลองกรณีที่ผู้ใช้แก้ M01-0001 วันที่ 2026-10-05 เป็น 0 (ทำให้เหลือแต่วันที่ 06)
  // และแก้ M02-0002 วันที่ 2026-10-05 เป็น 0 (ทำให้ไม่มีวันไหนเหลือเลย qtyByDate = {})
  const draftLines = [
    {
      materialGoodsCode: "M01-0001",
      unit: "KG",
      qtyByDate: { "2026-10-06": 40 },
    },
    {
      materialGoodsCode: "M02-0002",
      unit: "KG",
      qtyByDate: {},
    },
  ];

  const result = mergeRequisitionDraftLines(sourceLines, draftLines);

  const m1 = result.find((l) => l.materialGoodsCode === "M01-0001");
  assert.ok(m1);
  assert.equal(m1.qtyByDate["2026-10-05"], undefined);
  assert.equal(m1.qtyByDate["2026-10-06"], 40);
  assert.equal(m1.totalQty, 40);

  // M02-0002 ยอดเป็น 0 ทุกวัน ต้องถูกตัดออกจากตาราง ไม่เด้งกลับมา 36
  const m2 = result.find((l) => l.materialGoodsCode === "M02-0002");
  assert.equal(m2, undefined);
});

test("ลบรายการใน 'จัดการรายการ' บนวันที่ยังไม่ได้ export ต้องไม่ฟื้นกลับมาจาก BOM", () => {
  const sourceLines = [
    {
      materialGoodsCode: "M01-KEEP",
      unit: "KG",
      qtyByDate: { "2026-10-05": 50 },
    },
    {
      materialGoodsCode: "M02-DELETED",
      unit: "KG",
      qtyByDate: { "2026-10-05": 36 },
    },
  ];

  // ผู้ใช้กดลบ M02-DELETED ในหน้าจัดการรายการ ทำให้ draftLines เหลือแค่ M01-KEEP
  const draftLines = [
    {
      materialGoodsCode: "M01-KEEP",
      unit: "KG",
      qtyByDate: { "2026-10-05": 50 },
    },
  ];

  const result = mergeRequisitionDraftLines(sourceLines, draftLines);

  assert.equal(result.length, 1);
  assert.equal(result[0].materialGoodsCode, "M01-KEEP");
  assert.equal(result.find((l) => l.materialGoodsCode === "M02-DELETED"), undefined);
});

test("การจับคู่เลขเอกสาร ERP (matchErpActualDocuments) รองรับตัวพิมพ์เล็ก-ใหญ่และช่องว่าง", () => {
  const slots = [
    {
      plannedDocumentNo: " xa6910/0001 ",
      workDate: "2026-10-01",
    },
  ];
  const erpRows = [
    {
      DI_REF: "XA6910/0001",
      TRD_SH_CODE: "RAW-01",
      TRD_UTQNAME: "kg",
      TRD_QTY: 50,
      TRD_LOT_NO: "LOT-1",
      WL_CODE: "WH1",
    },
  ];

  const matched = matchErpActualDocuments(slots, erpRows);
  assert.equal(matched[0].status, "exact");
  assert.equal(matched[0].actualDocumentNo, "XA6910/0001");
  assert.equal(matched[0].rows.length, 1);
});
test("planned WIP preview uses production-room input quantities, not FG BOM demand", async () => {
  const { buildPlannedWipPreviewRows } = await import("../src/lib/requisitionPreviewDisplay.js");
  assert.equal(typeof buildPlannedWipPreviewRows, "function");
  const lines = [
    { departmentId: "bis", sourceSectionDefId: "mix", skuCode: "WKB-0041", workDate: "2026-10-12", plannedQty: 14, unit: "ชุด" },
    { departmentId: "bis", sourceSectionDefId: "mix", skuCode: "WKB-0041", workDate: "2026-10-13", plannedQty: 14, unit: "batch" },
    { departmentId: "bis", sourceSectionDefId: "fg-jam", skuCode: "WK-2202", workDate: "2026-10-12", plannedQty: 931.491 },
    { departmentId: "bis", sourceSectionDefId: "mix", skuCode: "WKB-0041", workDate: "2026-10-12", plannedQty: 2, unit: "กก." },
    { departmentId: "other", sourceSectionDefId: "mix", skuCode: "WKB-0041", workDate: "2026-10-12", plannedQty: 99 },
    { departmentId: "bis", sourceSectionDefId: "mix", skuCode: "WKB-0041", workDate: "2026-10-19", plannedQty: 99 },
  ];
  const rooms = [{ id: "mix", name: "ห้องตีแป้ง", requires_planning: true, is_active: true }];
  const rows = buildPlannedWipPreviewRows(lines, rooms, "bis", ["2026-10-12", "2026-10-13"]);
  assert.equal(rows.length, 2);
  assert.equal(rows.some((row) => row.skuCode === "WK-2202"), false);
  const batch = rows.find((row) => row.displayUnit === "ชุด");
  assert.deepEqual(batch.qtyByDate, { "2026-10-12": 14, "2026-10-13": 14 });
  assert.equal(batch.totalQty, 28);
  assert.equal(batch.sectionName, "ห้องตีแป้ง");
  assert.equal(rows.find((row) => row.displayUnit === "กก.").totalQty, 2);
  assert.deepEqual(buildPlannedWipPreviewRows(lines, [], "bis", ["2026-10-12"]), []);
  assert.deepEqual(buildPlannedWipPreviewRows(lines, [{ ...rooms[0], is_active: false }], "bis", ["2026-10-12"]), []);
  const manuallyPlanned = buildPlannedWipPreviewRows([
    { departmentId: "bis", sourceSectionDefId: "mix", skuCode: "WK-2202", workDate: "2026-10-12", plannedQty: 3, unit: "KG" },
  ], rooms, "bis", ["2026-10-12"]);
  assert.equal(manuallyPlanned[0].skuCode, "WK-2202");
  assert.equal(manuallyPlanned[0].totalQty, 3);
});

test("WIP secondary kg sums each bound formula rate and never displays partial weight as a complete total", async () => {
  const { buildPlannedWipPreviewRows } = await import("../src/lib/requisitionPreviewDisplay.js");
  const base = { departmentId: "bis", sourceSectionDefId: "mix", skuCode: "WKB-0041", workDate: "2026-10-12", unit: "batch" };
  const rooms = [{ id: "mix", name: "Mix", requires_planning: true, is_active: true }];
  const project = lines => buildPlannedWipPreviewRows(lines, rooms, "bis", ["2026-10-12", "2026-10-13"])[0];
  const row = project([{ ...base, plannedQty: 14, kgPerBatch: 195.65 }, { ...base, plannedQty: 2, kgPerBatch: 200 }]);
  assert.equal(row.totalQty, 16);
  assert.equal(row.totalKg, 3139.1);
  assert.equal(row.kgByDate[base.workDate], 3139.1);
  const missing = project([{ ...base, plannedQty: 1 }, { ...base, plannedQty: 2, kgPerBatch: 200 }]);
  assert.equal(missing.weightIncomplete, true);
  assert.equal(missing.kgByDate[base.workDate], null);
});
