import assert from "node:assert/strict";
import test from "node:test";

test("old pail records keep their frozen units rather than today's ERP conversion", async () => {
  const { legacyPackingHistory } = await import("../src/lib/packingHistory.js");
  const [row] = legacyPackingHistory([{ id: "old", production_date: "2026-08-20", lot_no: "200826", fg_product_code: "FG1", fg_product_name_snapshot: "Old FG", fg_unit_snapshot: "กล่อง", tins_per_case_snapshot: 12, fg_case_qty: 5, fg_tin_qty: 60, wip_tin_qty: 2, created_at: "2026-08-20T00:00:00Z" }]);
  assert.equal(row.id, "old");
  assert.equal(row.origin, "legacy");
  assert.deepEqual(row.payload.produced, { outer: 5 });
  assert.equal(row.payload.units.find(unit => unit.code === "outer").factor, 12);
  assert.deepEqual(row.payload.closing, { pail: 2 });
  assert.equal(row.payload.producedBase, 60);
  assert.equal(row.sourceSummary, "ดูการเบิกในประวัติหน้าเดิม");
});
