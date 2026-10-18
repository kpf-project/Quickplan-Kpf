import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import path from "node:path";

test("Data API audit honors shell scope, reports collisions and never mutates database", async () => {
  const fixtures = {
    products_cache: [
      { sku_code: "WKB-0002", sku_name: "shell", iccat_code: "03" },
      { sku_code: "WK-0002", sku_name: "other", iccat_code: "03" },
      { sku_code: "WKB-0002-1", sku_name: "non-shell", iccat_code: "03" },
    ],
    production_departments: [{ id: "a", code: "KP13" }, { id: "b", code: "KP07" }],
    production_department_product_subcategories: [{ id: "s", department_id: "a", name: "เปลือก" }],
    production_department_products: [
      { department_id: "a", sku_code: "WKB-0002", subcategory_id: "s" },
      { department_id: "a", sku_code: "WKB-0002-1", subcategory_id: "other" },
      { department_id: "b", sku_code: "WK-0002" },
    ],
    production_weight_scale_products: [{ id: "p", sku_code: "WKB-0002" }],
    production_weight_receipts: [
      { id: "1", product_config_id: "p", barcode: "10102600020001", request_id: "request", status: "voided" },
      { id: "2", product_config_id: "p", barcode: "10102600020001", request_id: "request" },
    ],
  };
  let report;
  const context = vm.createContext({
    nextEnv: { loadEnvConfig() {} }, process: { env: {}, cwd: () => "." }, path,
    createClient: () => ({ from(table) {
      let head = false, start = 0, end = Infinity;
      return {
        select(_columns, options) { head = Boolean(options?.head); return this; },
        order() { return this; },
        range(a, b) { start = a; end = b; return this; },
        then(resolve) { resolve({ count: fixtures[table].length, data: head ? null : fixtures[table].slice(start, end + 1) }); },
      };
    } }),
    mkdirSync() {},
    writeFileSync(_filename, text) { report = JSON.parse(text); },
    console: { log() {}, error(message) { throw new Error(message); } },
    AbortSignal, fetch,
  });
  const source = readFileSync("scripts/audit-scale-product-identifiers.mjs", "utf8")
    .replace(/^import .*;\r?$/gm, "");
  await vm.runInContext("(async () => {\n" + source + "\n})()", context);
  assert.equal(report.counts.legacySelectable, 1);
  assert.equal(report.crossPageCollisions.length, 1);
  assert.equal(report.crossPageCollisions[0].newCandidate, "WK-0002");
  assert.equal(report.duplicateBarcodes.length, 1);
  assert.equal(report.duplicateRequestIds.length, 1);
  assert.ok(report.historicalIdentifiers.some(row => row.digits === "0002"));
  assert.ok(!report.availableIdentifiers.includes("0002"));
  assert.equal(report.pagination.production_weight_receipts.fetched, 2);
});
