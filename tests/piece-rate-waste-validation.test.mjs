import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizePositiveWasteWeight,
  normalizeWasteMachineCode,
} from "../src/lib/pieceRateWasteValidation.js";

test("normalizePositiveWasteWeight accepts and rounds positive weights", () => {
  assert.equal(normalizePositiveWasteWeight("1.2346"), 1.235);
});

test("normalizePositiveWasteWeight rejects zero, negative and invalid values", () => {
  assert.throws(() => normalizePositiveWasteWeight(0), /มากกว่า 0/);
  assert.throws(() => normalizePositiveWasteWeight(-1), /มากกว่า 0/);
  assert.throws(() => normalizePositiveWasteWeight("not-a-number"), /มากกว่า 0/);
});

test("normalizeWasteMachineCode normalizes supported machine identifiers", () => {
  assert.equal(normalizeWasteMachineCode(" p-01 "), "P01");
  assert.equal(normalizeWasteMachineCode("x"), null);
  assert.equal(normalizeWasteMachineCode("machine-123"), null);
});

