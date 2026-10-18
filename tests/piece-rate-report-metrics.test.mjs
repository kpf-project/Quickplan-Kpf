import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolvePieceRateReportMetrics } from "../src/lib/pieceRateReportMetrics.js";

test("pail reports show entered quantity and converted kilograms without changing entry multiplier", () => {
  const row = { input_mode_snapshot: "pail", input_value: 56, count_value_snapshot: 1, weight_kg_snapshot: 1.1, normalized_kg_amount_snapshot: 61.6, wage_amount_snapshot: 154 };
  const before = { ...row };
  assert.deepEqual(resolvePieceRateReportMetrics(row), { entryCountValue: 1, countValue: 56, normalizedKgAmount: 61.6 });
  assert.deepEqual(row, before);
});

test("kilogram entries retain their existing count and weight", () => {
  assert.deepEqual(resolvePieceRateReportMetrics({ input_mode_snapshot: "kg", input_value: 12.3, count_value_snapshot: 2, normalized_kg_amount_snapshot: 12.3 }), { entryCountValue: 2, countValue: 2, normalizedKgAmount: 12.3 });
});

test("missing historical conversion uses saved kilograms, not today's product settings", () => {
  assert.equal(resolvePieceRateReportMetrics({ input_mode_snapshot: "pail", input_value: 56, normalized_kg_amount_snapshot: 61.6 }).normalizedKgAmount, 61.6);
});

test("pail reports preserve manually entered actual kilograms", () => {
  assert.deepEqual(resolvePieceRateReportMetrics({
    input_mode_snapshot: "pail",
    input_value: 10,
    weight_kg_snapshot: 5,
    normalized_kg_amount_snapshot: 47.25,
    metadata: { actualWeightKg: 47.25 },
  }), { entryCountValue: 1, countValue: 10, normalizedKgAmount: 47.25 });
});

test("mixed report totals add quantities and kilograms separately", () => {
  const rows = [
    { input_mode_snapshot: "pail", input_value: 56, weight_kg_snapshot: 1.1 },
    { input_mode_snapshot: "pail", input_value: 10, weight_kg_snapshot: 2 },
    { input_mode_snapshot: "kg", count_value_snapshot: 1, normalized_kg_amount_snapshot: 5 },
  ].map(resolvePieceRateReportMetrics);
  assert.equal(rows.reduce((sum, row) => sum + row.countValue, 0), 67);
  assert.equal(rows.reduce((sum, row) => sum + row.normalizedKgAmount, 0), 86.6);
});

test("all report weight cells use kilograms and editing preserves the entry multiplier", () => {
  const ui = readFileSync(new URL("../src/features/attendance/components/PieceRateReportPageClient.js", import.meta.url), "utf8");
  const service = readFileSync(new URL("../src/features/attendance/services/pieceRateWorkService.js", import.meta.url), "utf8");
  assert.doesNotMatch(ui, /formatNumber\((?:row|item)\.inputValue/);
  assert.match(ui, /row\.entryCountValue \?\? row\.countValue/);
  assert.match(service, /\.\.\.resolvePieceRateReportMetrics\(row\)/);
  assert.doesNotMatch(service, /formatExcelNumber\(row\.inputValue/);
});
