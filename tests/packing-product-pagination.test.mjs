import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("paged packing products reach rows beyond 100 without changing old search", async () => {
  const path = new URL("../src/lib/packing-product-page.js", import.meta.url);
  assert.ok(fs.existsSync(path), "paged loader must exist");
  const { loadPackingProductPage } = await import(path);
  const calls = [];
  const query = { select(...args) { calls.push(args); return this; }, in() { return this; }, order() { return this; }, or(value) { calls.push(value); return this; }, range(start, end) { calls.push([start, end]); return Promise.resolve({ data: [{ sku_code: "P101", sku_name: "ชื่อเต็ม", uom_name: "KG" }], count: 150 }); } };
  const result = await loadPackingProductPage({ from: () => query }, { page: "5", search: 'ชา, "เขียว"' });
  assert.equal(result.totalCount, 150);
  assert.deepEqual(calls.at(-1), [100, 124]);
  assert.equal(result.data[0].name, "ชื่อเต็ม");
  assert.equal(result.data[0].unitName, "KG");
  assert.ok(calls.find(value => typeof value === "string").includes('\\"เขียว\\"'));
  await assert.rejects(loadPackingProductPage({ from: () => { throw Error("must not query"); } }, { page: "-1" }), /page/);
});

test("paged products reject invalid bounds and database errors", async () => {
  const { loadPackingProductPage } = await import("../src/lib/packing-product-page.js");
  const never = { from() { throw Error("must not query"); } };
  for (const page of ["0", "1.5", "-2", "100000", "1x"]) await assert.rejects(loadPackingProductPage(never, { page }), /page/);
  await assert.rejects(loadPackingProductPage(never, { search: "x".repeat(201) }), /คำค้น/);
  const query = { select() { return this; }, in() { return this; }, order() { return this; }, range() { return { error: { message: "private database detail" } }; } };
  await assert.rejects(loadPackingProductPage({ from: () => query }), error => error.status === 500 && !error.message.includes("private"));
});

test("department-scoped picker excludes unassigned products and empty scopes never query", async () => {
  const { loadPackingProductPage } = await import("../src/lib/packing-product-page.js");
  const empty = await loadPackingProductPage({ from() { throw Error("must not query"); } }, { allowedCodes: [] });
  assert.equal(empty.totalCount, 0);
  const rows = [{ sku_code: "ASSIGNED", sku_name: "Allowed" }, { sku_code: "OTHER", sku_name: "Outside" }];
  let codes;
  const query = { select() { return this; }, in(field, values) { if (field === "sku_code") codes = values; return this; }, order() { return this; },
    range() { const data = rows.filter(row => codes?.includes(row.sku_code)); return { data, count: data.length }; } };
  const result = await loadPackingProductPage({ from() { return query; } }, { allowedCodes: ["ASSIGNED"] });
  assert.deepEqual(result.data.map(row => row.code), ["ASSIGNED"]);
});
