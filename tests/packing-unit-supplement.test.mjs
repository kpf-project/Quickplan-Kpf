import test from "node:test";
import assert from "node:assert/strict";
import { supplementPackingUnits } from "../src/lib/packingUnits.js";

const units = [{ code: "pack", label: "แพ็ค", factor: 1, precision: 0 }, { code: "carton", label: "ลัง", factor: 24, precision: 0 }];
test("supplement adds 18 sachets per pack without changing existing carton ratio", () => {
  const result = supplementPackingUnits(units, { parentCode: "pack", childCode: "sachet", quantity: 18 });
  assert.deepEqual(result.map(u => [u.code, u.factor]), [["sachet", 1], ["pack", 18], ["carton", 432]]);
  assert.deepEqual(units.map(u => u.factor), [1, 24]);
});
test("supplement rejects unknown, fractional, duplicate or contradictory conversions", () => {
  for (const setting of [{ parentCode: "bad", childCode: "sachet", quantity: 18 }, { parentCode: "pack", childCode: "sachet", quantity: 1.5 }, { parentCode: "pack", childCode: "pack", quantity: 18 }, { parentCode: "pack", childCode: "carton", quantity: 18 }]) {
    assert.throws(() => supplementPackingUnits(units, setting));
  }
  assert.deepEqual(supplementPackingUnits(units, null), units);
});
