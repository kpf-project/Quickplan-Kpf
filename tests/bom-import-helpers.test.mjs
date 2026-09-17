import assert from "node:assert/strict";
import test from "node:test";

import {
  buildDiff,
  mergeItems,
  normalizeItems,
  validatePreparedBomImportProduct,
} from "../src/lib/bomImportHelpers.js";

test("merge keeps two trade codes belonging to the same SKU", () => {
  const next = mergeItems({
    mode: "replace",
    strategy: "overwrite",
    previousItems: [],
    incomingItems: [
      {
        material_sku_code: "M04-0079",
        material_goods_code: "M04-0079",
        qty: 5,
      },
      {
        material_sku_code: "M04-0079",
        material_goods_code: "M04-00790",
        qty: 1,
      },
    ],
  });

  assert.equal(next.length, 2);
});

test("normalizeItems preserves current BOM fields", () => {
  const [item] = normalizeItems([
    {
      material_sku_code: "WKB-0041",
      material_goods_code: "WKB-0041",
      qty: 2,
      uom_name: "ชุด",
      notes: "ทดสอบ",
      planning_offset_days: -1,
      calculation_basis: "HEADCOUNT",
      headcount_base: 10,
      headcount_round_mode: "UP",
    },
  ], { strategy: "overwrite" });

  assert.deepEqual(item, {
    material_sku_code: "WKB-0041",
    material_goods_code: "WKB-0041",
    qty: 2,
    uom_name: "ชุด",
    notes: "ทดสอบ",
    planning_offset_days: -1,
    calculation_basis: "HEADCOUNT",
    headcount_base: 10,
    headcount_round_mode: "UP",
    machine_base: 1,
    machine_round_mode: "NONE",
    dough_set_base: 1,
    dough_set_round_mode: "NONE",
  });
});

test("diff detects calculation basis and planning offset changes", () => {
  const result = buildDiff(
    [{
      material_sku_code: "WKB-0041",
      material_goods_code: "WKB-0041",
      qty: 2,
      calculation_basis: "JOB_QTY",
      planning_offset_days: 0,
    }],
    [{
      material_sku_code: "WKB-0041",
      material_goods_code: "WKB-0041",
      qty: 2,
      calculation_basis: "HEADCOUNT",
      headcount_base: 10,
      headcount_round_mode: "UP",
      planning_offset_days: -1,
    }],
    new Map([["WKB-0041", "แป้งหมัก"]])
  );

  assert.equal(result.diff.updated.length, 1);
});

test("sum strategy combines only identical SKU and trade code", () => {
  const next = mergeItems({
    mode: "append",
    strategy: "sum",
    previousItems: [{
      material_sku_code: "M04-0079",
      material_goods_code: "M04-00790",
      qty: 1,
    }],
    incomingItems: [
      {
        material_sku_code: "M04-0079",
        material_goods_code: "M04-00790",
        qty: 2,
      },
      {
        material_sku_code: "M04-0079",
        material_goods_code: "M04-0079",
        qty: 4,
      },
    ],
  });

  assert.equal(next.length, 2);
  assert.equal(
    next.find((item) => item.material_goods_code === "M04-00790").qty,
    3
  );
});

test("prepared product validation rejects non-default formulas and invalid settings", () => {
  const errors = validatePreparedBomImportProduct({
    formula_code: "FORMULA-B",
    parent_type: "WIP",
    wip_qty_input_mode: "invalid",
    base_batch: 0,
    base_output_boxes: 0,
    items: [],
  });

  assert.ok(errors.some((error) => error.includes("DEFAULT")));
  assert.ok(errors.some((error) => error.includes("โหมดปริมาณ WIP")));
  assert.ok(errors.some((error) => error.includes("base_batch")));
  assert.ok(errors.some((error) => error.includes("รายการวัตถุดิบ")));
});
