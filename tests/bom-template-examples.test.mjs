import assert from "node:assert/strict";
import test from "node:test";

import {
  loadBomTemplateExampleRows,
} from "../src/features/production-line/utils/bomTemplateExamples.js";

const payloads = {
  "BL0-5001": {
    activeVersionId: "v-root",
    versions: [{
      id: "v-root",
      base_batch: 1,
      base_output_boxes: 60,
      wip_qty_input_mode: "unit",
    }],
    items: [
      {
        material_sku_code: "WKB-0041",
        material_goods_code: "WKB-0041",
        iccat_code: "03",
        qty: 2,
        planning_offset_days: -1,
        calculation_basis: "JOB_QTY",
      },
      {
        material_sku_code: "M01-0001",
        material_goods_code: "M01-00010",
        iccat_code: "01",
        qty: 4,
        calculation_basis: "HEADCOUNT",
        headcount_base: 10,
        headcount_round_mode: "UP",
      },
    ],
  },
  "WKB-0041": {
    activeVersionId: "v-wip",
    versions: [{
      id: "v-wip",
      base_batch: 1,
      base_output_boxes: 2,
      wip_qty_input_mode: "unit",
    }],
    items: [{
      material_sku_code: "WKB-0099",
      material_goods_code: "WKB-0099",
      iccat_code: "03",
      qty: 1,
      calculation_basis: "JOB_QTY",
    }],
  },
  "WKB-0099": {
    activeVersionId: "v-wip-2",
    versions: [{
      id: "v-wip-2",
      base_batch: 2,
      base_output_boxes: 5,
      wip_qty_input_mode: "batch",
    }],
    items: [{
      material_sku_code: "M02-0001",
      material_goods_code: "M02-00010",
      iccat_code: "02",
      qty: 3,
      calculation_basis: "MACHINE_COUNT",
      machine_base: 2,
      machine_round_mode: "NEAREST",
    }],
  },
};

test("loads BL0-5001 example rows through every WIP level", async () => {
  const requested = [];
  const rows = await loadBomTemplateExampleRows({
    rootSkuCode: "BL0-5001",
    fetchBom: async (skuCode) => {
      requested.push(skuCode);
      return payloads[skuCode] || { versions: [], items: [] };
    },
  });

  assert.deepEqual(requested, ["BL0-5001", "WKB-0041", "WKB-0099"]);
  assert.equal(rows.length, 4);
  assert.equal(rows[0].parentSkuCode, "BL0-5001");
  assert.match(rows[0].notes, /Level 1/);
  assert.equal(rows[2].parentSkuCode, "WKB-0041");
  assert.match(rows[2].notes, /Level 2/);
  assert.equal(rows[3].parentSkuCode, "WKB-0099");
  assert.match(rows[3].notes, /Level 3/);
  assert.equal(rows[3].calculationBasis, "MACHINE_COUNT");
  assert.equal(rows[3].calculationBase, 2);
  assert.equal(rows[3].roundMode, "NEAREST");
});

test("stops recursive loading when a WIP cycle is encountered", async () => {
  const cyclePayloads = {
    A: {
      versions: [{ id: "a", base_batch: 1, base_output_boxes: 1 }],
      items: [{
        material_sku_code: "B",
        material_goods_code: "B",
        iccat_code: "03",
        qty: 1,
      }],
    },
    B: {
      versions: [{ id: "b", base_batch: 1, base_output_boxes: 1 }],
      items: [{
        material_sku_code: "A",
        material_goods_code: "A",
        iccat_code: "03",
        qty: 1,
      }],
    },
  };
  const requested = [];
  const rows = await loadBomTemplateExampleRows({
    rootSkuCode: "A",
    fetchBom: async (skuCode) => {
      requested.push(skuCode);
      return cyclePayloads[skuCode];
    },
  });

  assert.deepEqual(requested, ["A", "B"]);
  assert.equal(rows.length, 2);
});
