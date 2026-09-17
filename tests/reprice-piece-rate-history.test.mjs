import test from "node:test";
import assert from "node:assert/strict";
import { priceHistoricalRow } from "../scripts/reprice-piece-rate-history.mjs";
const mappings = [{ product_code: "BL0-1104", profile_id: "new" }];
const profiles = [{ id: "new", name: "Current", is_active: true, input_mode: "pail", wage_basis: "kg", pay_rate_per_kg: 4.5, kg_per_pail: 1.1 }];
test("one-time repricing freezes current rate without changing quantity or stock", () => {
  const row = { product_code_snapshot: "BL0-1104", input_mode_snapshot: "pail", input_value: 61.6, normalized_kg_amount_snapshot: 67.76 };
  const result = priceHistoricalRow(row, mappings, profiles, []);
  assert.equal(result.wage_amount_snapshot, 304.92);
  assert.equal(result.pay_rate_per_kg_snapshot, 4.5);
  assert.equal(result.input_value, undefined);
  assert.equal(result.normalized_kg_amount_snapshot, undefined);
});
test("old kilogram entries are not multiplied as pails", () => {
  const result = priceHistoricalRow({ product_code_snapshot: "BL0-1104", input_mode_snapshot: "kg", input_value: 17.01, normalized_kg_amount_snapshot: 17.01 }, mappings, profiles, []);
  assert.equal(result.wage_amount_snapshot, 76.545);
});
test("missing mapping and conversion mismatches fail closed", () => {
  assert.throws(() => priceHistoricalRow({ product_code_snapshot: "unknown" }, mappings, profiles, []), /Missing mapping/);
  assert.throws(() => priceHistoricalRow({ product_code_snapshot: "BL0-1104", input_mode_snapshot: "pail", input_value: 10, normalized_kg_amount_snapshot: 99 }, mappings, profiles, []), /Weight differs/);
});
