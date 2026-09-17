import assert from "node:assert/strict";
import test from "node:test";

import {
  BOM_IMPORT_DEFAULTS,
  buildBomImportItemKey,
  normalizeBomImportRow,
  sanitizeExcelText,
} from "../src/features/production-line/utils/bomImportContract.js";

test("normalizes a complete current-format row", () => {
  assert.deepEqual(
    normalizeBomImportRow({
      rowNumber: 4,
      parentSkuCode: " wkb-0041 ",
      wipQtyInputMode: "unit",
      baseBatch: "1",
      baseOutputBoxes: "2",
      materialGoodsCode: " m04-00790 ",
      materialSkuCode: "m04-0079",
      qty: "5",
      calculationBasis: "machine_count",
      calculationBase: "2",
      roundMode: "up",
      planningOffsetDays: "-1",
      notes: " ทดสอบ ",
    }),
    {
      rowNumber: 4,
      parentSkuCode: "WKB-0041",
      formulaCode: "DEFAULT",
      formulaName: "สูตรหลัก",
      wipQtyInputMode: "unit",
      baseBatch: 1,
      baseOutputBoxes: 2,
      materialGoodsCode: "M04-00790",
      materialSkuCode: "M04-0079",
      qty: 5,
      uomName: "",
      calculationBasis: "MACHINE_COUNT",
      headcountBase: 1,
      headcountRoundMode: "NONE",
      machineBase: 2,
      machineRoundMode: "UP",
      doughSetBase: 1,
      doughSetRoundMode: "NONE",
      planningOffsetDays: -1,
      notes: "ทดสอบ",
    }
  );
});

test("legacy rows receive safe defaults", () => {
  const row = normalizeBomImportRow({
    productCode: "B03-0003",
    baseBatch: 1,
    baseOutputBoxes: 60,
    code: "WKB-0041",
    qty: 2,
  });

  assert.equal(row.formulaCode, "DEFAULT");
  assert.equal(row.formulaName, "สูตรหลัก");
  assert.equal(row.calculationBasis, BOM_IMPORT_DEFAULTS.calculationBasis);
  assert.equal(row.materialGoodsCode, "WKB-0041");
  assert.equal(row.materialSkuCode, "");
  assert.equal(row.planningOffsetDays, 0);
});

test("item key preserves multiple trade codes for one SKU", () => {
  assert.notEqual(
    buildBomImportItemKey({
      materialSkuCode: "M04-0079",
      materialGoodsCode: "M04-0079",
    }),
    buildBomImportItemKey({
      materialSkuCode: "M04-0079",
      materialGoodsCode: "M04-00790",
    })
  );
});

test("normalization clamps planning offsets and defaults invalid enums", () => {
  const row = normalizeBomImportRow({
    parentSkuCode: "WKB-0041",
    baseBatch: 1,
    baseOutputBoxes: 1,
    materialGoodsCode: "M01-00040",
    qty: 1,
    calculationBasis: "unknown",
    roundMode: "invalid",
    planningOffsetDays: 99,
  });

  assert.equal(row.calculationBasis, "JOB_QTY");
  assert.equal(row.headcountRoundMode, "NONE");
  assert.equal(row.planningOffsetDays, 30);
});

test("sanitizeExcelText prevents formula injection", () => {
  assert.equal(sanitizeExcelText("=HYPERLINK(\"https://example.com\")"), "'=HYPERLINK(\"https://example.com\")");
  assert.equal(sanitizeExcelText("+SUM(A1:A2)"), "'+SUM(A1:A2)");
  assert.equal(sanitizeExcelText("วัตถุดิบ"), "วัตถุดิบ");
});
