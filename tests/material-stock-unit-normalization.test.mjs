import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTradeCodeUnitMap,
  convertRequirementToStockUnit,
  convertStockToRequirementUnit,
} from "../src/lib/materialStockUnit.js";

const tradeCodeRows = [
  {
    SKU_CODE: "M01-0004",
    GOODS_CODE: "M01-0004",
    UTQ_NAME: "KG",
    UTQ_NAME_2: "KG",
    UTQ_QTY_2: 1,
  },
  {
    SKU_CODE: "M01-0004",
    GOODS_CODE: "M01-00040",
    UTQ_NAME: "KG",
    UTQ_NAME_2: "bagx50kg",
    UTQ_QTY_2: 50,
  },
];

test("trade code unit map links alternate goods code to parent stock SKU", () => {
  const map = buildTradeCodeUnitMap(tradeCodeRows);
  const meta = map.get("M01-00040");

  assert.equal(meta.stockSkuCode, "M01-0004");
  assert.equal(meta.goodsCode, "M01-00040");
  assert.equal(meta.factorToBase, 50);
  assert.equal(meta.baseUnit, "KG");
  assert.equal(meta.tradeUnit, "bagx50kg");
});

test("convertRequirementToStockUnit converts bag BOM demand to base stock quantity", () => {
  const map = buildTradeCodeUnitMap(tradeCodeRows);
  const converted = convertRequirementToStockUnit({
    skuCode: "M01-0004",
    goodsCode: "M01-00040",
    requiredQty: 3,
    uom: "bagx50kg",
  }, map);

  assert.equal(converted.stockSkuCode, "M01-0004");
  assert.equal(converted.requiredBaseQty, 150);
  assert.equal(converted.factorToBase, 50);
});

test("convertStockToRequirementUnit keeps requisition unit while using base stock", () => {
  const map = buildTradeCodeUnitMap(tradeCodeRows);
  const displayQty = convertStockToRequirementUnit(11591.6, {
    skuCode: "M01-0004",
    goodsCode: "M01-00040",
  }, map);

  assert.equal(displayQty, 231.832);
});

test("stock SKU requirement remains in KG with factor one", () => {
  const map = buildTradeCodeUnitMap(tradeCodeRows);
  const converted = convertRequirementToStockUnit({
    skuCode: "M01-0004",
    goodsCode: "M01-0004",
    requiredQty: 120,
    uom: "KG",
  }, map);

  assert.equal(converted.stockSkuCode, "M01-0004");
  assert.equal(converted.requiredBaseQty, 120);
  assert.equal(converted.factorToBase, 1);
  assert.equal(converted.tradeUnit, "KG");
});
