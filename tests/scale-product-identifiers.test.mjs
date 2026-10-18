import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const context = vm.createContext({});
vm.runInContext(readFileSync("src/lib/scale/product-identifiers.js", "utf8").replace("export function ", "function "), context);

test("explicit company mappings support SKU variants without silently trimming digits", () => {
  const registry = context.validateScaleProductIdentifiers([
    { productCode: "WKB-0002", productDigits: "0002" },
    { productCode: "WKB-0002-2", productDigits: "9002" },
  ]);
  assert.equal(registry.get("WKB-0002-2"), "9002");
  assert.equal(registry.get("WKB-0002"), "0002");
});

test("company identifiers cannot repeat across products or departments", () => {
  assert.throws(() => context.validateScaleProductIdentifiers([
    { productCode: "WKB-0002", productDigits: "0002", departmentId: "A" },
    { productCode: "WK-0002", productDigits: "0002", departmentId: "B" },
  ]), /already assigned/);
});

test("duplicate or conflicting product assignments and incomplete mappings are rejected", () => {
  for (const second of [
    { productCode: "wkb-0002", productDigits: "0002" },
    { productCode: "WKB-0002", productDigits: "9002" },
  ]) {
    assert.throws(() => context.validateScaleProductIdentifiers([
      { productCode: "WKB-0002", productDigits: "0002" }, second,
    ]), /Duplicate product/);
  }
  for (const row of [null, {}, { productCode: "", productDigits: "0002" },
    { productCode: "WKB-0002", productDigits: "0000" },
    { productCode: "WKB-0002", productDigits: 2 },
    { productCode: "WKB-0002", productDigits: "00002" }]) {
    assert.throws(() => context.validateScaleProductIdentifiers([row]));
  }
});
