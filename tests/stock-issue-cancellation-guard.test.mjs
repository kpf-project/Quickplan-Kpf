import assert from "node:assert/strict";
import test from "node:test";
import { assertStockIssueHasNoChildren } from "../src/lib/stock-issue-cancellation-guard.js";

function mockDb(results = {}) {
  return {
    from(table) {
      return {
        select(value) { assert.equal(value, "id"); return this; },
        eq(key, value) {
          assert.equal(key, "metadata->>sourceIssueItemId");
          assert.equal(value, "source-1");
          return this;
        },
        in(key, values) {
          assert.equal(key, "movement_type");
          assert.deepEqual(values, ["return_in", "waste_out"]);
          return this;
        },
        limit(value) {
          assert.equal(value, 1);
          return Promise.resolve(results[table] || { data: [], error: null });
        },
      };
    },
  };
}

test("allows cancellation when neither receipt nor movement child exists", async () => {
  await assert.doesNotReject(assertStockIssueHasNoChildren(mockDb(), "source-1"));
});

for (const table of ["production_weight_receipts", "production_stock_movements"]) {
  test(`blocks cancellation with child history in ${table}`, async () => {
    await assert.rejects(assertStockIssueHasNoChildren(mockDb({
      [table]: { data: [{ id: "child" }], error: null },
    }), "source-1"), /มีประวัติชั่งคืนหรือของเสีย/);
  });

  test(`fails closed when ${table} lookup fails`, async () => {
    await assert.rejects(assertStockIssueHasNoChildren(mockDb({
      [table]: { data: null, error: { message: "unavailable" } },
    }), "source-1"), /ยังไม่อนุญาตให้ยกเลิกเบิก/);
  });
}
