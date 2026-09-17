import assert from "node:assert/strict";
import test from "node:test";

import {
  prepareBomImportProducts,
  serializeBomImportRpcPayload,
} from "../src/lib/bomImportServer.js";

const catalog = {
  parents: [
    {
      sku_code: "B03-0003",
      sku_name: "ขนมตัวอย่าง",
      iccat_code: "04",
      uom_name: "ลัง",
    },
    {
      sku_code: "WKB-0041",
      sku_name: "แป้งหมัก",
      iccat_code: "03",
      uom_name: "ชุด",
    },
  ],
  materials: [
    {
      goods_code: "WKB-0041",
      sku_code: "WKB-0041",
      sku_name: "แป้งหมัก",
      iccat_code: "03",
      uom_name: "ชุด",
    },
    {
      goods_code: "M04-0079",
      sku_code: "M04-0079",
      sku_name: "มาการีน KG",
      iccat_code: "01",
      uom_name: "KG",
    },
    {
      goods_code: "M04-00790",
      sku_code: "M04-0079",
      sku_name: "มาการีน กล่อง",
      iccat_code: "01",
      uom_name: "กล่องx15",
    },
  ],
  currentBoms: [],
};

test("resolves goods codes and prepares FG plus WIP BOMs in one request", async () => {
  const result = await prepareBomImportProducts({
    products: [
      {
        sku: "B03-0003",
        base_batch: 1,
        base_output_boxes: 60,
        items: [{ rowNumber: 2, material_goods_code: "WKB-0041", qty: 2 }],
      },
      {
        sku: "WKB-0041",
        wip_qty_input_mode: "unit",
        base_batch: 1,
        base_output_boxes: 2,
        items: [{ rowNumber: 3, material_goods_code: "M04-00790", qty: 1 }],
      },
    ],
    catalog,
    mode: "replace",
    strategy: "overwrite",
  });

  assert.equal(result.hasErrors, false);
  assert.equal(result.products.length, 2);
  assert.equal(result.products[0].parentType, "FG");
  assert.equal(result.products[1].parentType, "WIP");
  assert.equal(result.products[1].items[0].material_sku_code, "M04-0079");
  assert.equal(result.products[1].items[0].material_goods_code, "M04-00790");
  assert.equal(result.products[1].items[0].uom_name, "กล่องx15");
});

test("rejects an ambiguous legacy SKU when multiple trade codes exist", async () => {
  const result = await prepareBomImportProducts({
    products: [{
      sku: "WKB-0041",
      base_batch: 1,
      base_output_boxes: 2,
      items: [{ rowNumber: 8, code: "M04-0079", qty: 1 }],
    }],
    catalog,
  });

  assert.equal(result.hasErrors, true);
  assert.match(result.invalidRows[0].message, /แถว 8/);
  assert.match(result.invalidRows[0].message, /M04-00790/);
});

test("keeps two goods codes for one SKU", async () => {
  const result = await prepareBomImportProducts({
    products: [{
      sku: "WKB-0041",
      base_batch: 1,
      base_output_boxes: 2,
      items: [
        {
          rowNumber: 2,
          material_goods_code: "M04-0079",
          material_sku_code: "M04-0079",
          qty: 5,
        },
        {
          rowNumber: 3,
          material_goods_code: "M04-00790",
          material_sku_code: "M04-0079",
          qty: 1,
        },
      ],
    }],
    catalog,
  });

  assert.equal(result.hasErrors, false);
  assert.equal(result.products[0].items.length, 2);
});

test("rejects inconsistent parent settings across Excel rows", async () => {
  const result = await prepareBomImportProducts({
    products: [{
      sku: "WKB-0041",
      base_batch: 1,
      base_output_boxes: 2,
      items: [
        {
          rowNumber: 2,
          parent_base_batch: 1,
          parent_base_output_boxes: 2,
          parent_wip_qty_input_mode: "unit",
          material_goods_code: "M04-00790",
          material_sku_code: "M04-0079",
          qty: 1,
        },
        {
          rowNumber: 3,
          parent_base_batch: 1,
          parent_base_output_boxes: 3,
          parent_wip_qty_input_mode: "unit",
          material_goods_code: "M04-0079",
          material_sku_code: "M04-0079",
          qty: 1,
        },
      ],
    }],
    catalog,
  });

  assert.equal(result.hasErrors, true);
  assert.ok(
    result.products[0].errors.some((error) => error.includes("base_output_boxes"))
  );
});

test("detects a cycle created by imported and current BOMs", async () => {
  const cycleCatalog = {
    parents: [
      { sku_code: "WIP-A", sku_name: "A", iccat_code: "03", uom_name: "ชุด" },
      { sku_code: "WIP-B", sku_name: "B", iccat_code: "03", uom_name: "ชุด" },
    ],
    materials: [
      { goods_code: "WIP-A", sku_code: "WIP-A", sku_name: "A", iccat_code: "03", uom_name: "ชุด" },
      { goods_code: "WIP-B", sku_code: "WIP-B", sku_name: "B", iccat_code: "03", uom_name: "ชุด" },
    ],
    currentBoms: [{
      parent_sku_code: "WIP-B",
      items: [{ material_sku_code: "WIP-A" }],
    }],
  };
  const result = await prepareBomImportProducts({
    products: [{
      sku: "WIP-A",
      base_batch: 1,
      base_output_boxes: 1,
      items: [{ material_goods_code: "WIP-B", qty: 1 }],
    }],
    catalog: cycleCatalog,
  });

  assert.equal(result.hasErrors, true);
  assert.match(result.products[0].errors[0], /วงจร BOM/);
});

test("serializes all current fields for the database write", () => {
  const payload = serializeBomImportRpcPayload({
    sku: "WKB-0041",
    parentType: "WIP",
    baseBatch: 1,
    baseOutputBoxes: 2,
    wipQtyInputMode: "unit",
    items: [{
      material_sku_code: "M04-0079",
      material_goods_code: "M04-00790",
      qty: 1,
      uom_name: "กล่องx15",
      planning_offset_days: -1,
      calculation_basis: "MACHINE_COUNT",
      machine_base: 2,
      machine_round_mode: "UP",
    }],
  });

  assert.equal(payload.p_parent_sku_code, "WKB-0041");
  assert.equal(payload.p_formula_code, "DEFAULT");
  assert.equal(payload.p_items[0].material_goods_code, "M04-00790");
  assert.equal(payload.p_items[0].calculation_basis, "MACHINE_COUNT");
  assert.equal(payload.p_items[0].machine_base, 2);
});
