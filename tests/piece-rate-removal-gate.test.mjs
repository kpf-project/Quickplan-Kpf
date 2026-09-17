import assert from "node:assert/strict";
import test from "node:test";

import {
  createPieceRateRemovalGate,
  resolvePieceRateRemovalWeightKg,
} from "../src/lib/pieceRateRemovalGate.js";

test("piece-rate removal gate waits for zero weight to be held continuously", () => {
  const gate = createPieceRateRemovalGate({
    zeroThresholdKg: 0.02,
    holdDurationMs: 1000,
  });

  gate.arm();

  assert.equal(gate.observe(18.16, 0).ready, false);
  assert.equal(gate.observe(0.01, 100).ready, false);
  assert.equal(gate.observe(0.03, 900).ready, false);
  assert.equal(gate.observe(0.01, 1000).ready, false);
  assert.equal(gate.observe(0.01, 1999).ready, false);
  assert.equal(gate.observe(0.01, 2000).ready, true);
});

test("piece-rate removal gate ignores invalid preview values", () => {
  const gate = createPieceRateRemovalGate({
    zeroThresholdKg: 0.02,
    holdDurationMs: 1000,
  });

  gate.arm();

  assert.equal(gate.observe(null, 0).ready, false);
  assert.equal(gate.observe("invalid", 500).ready, false);
  assert.equal(gate.observe(0, 1000).ready, false);
  assert.equal(gate.observe(0, 2000).ready, true);
});

test("piece-rate removal gate accepts a negative preview after container tare", () => {
  const gate = createPieceRateRemovalGate({
    zeroThresholdKg: 0.02,
    holdDurationMs: 1000,
  });

  gate.arm();

  assert.equal(resolvePieceRateRemovalWeightKg({ weightKg: -2.5 }), -2.5);
  assert.equal(gate.observe(resolvePieceRateRemovalWeightKg({ weightKg: -2.5 }), 0).ready, false);
  assert.equal(gate.observe(resolvePieceRateRemovalWeightKg({ weightKg: -2.5 }), 1000).ready, true);
});

test("piece-rate removal resolver reads display fields used by scale previews", () => {
  assert.equal(resolvePieceRateRemovalWeightKg({ displayWeight: -3.8 }), -3.8);
  assert.equal(resolvePieceRateRemovalWeightKg({ displayText: "-3.8 kg" }), -3.8);
  assert.equal(resolvePieceRateRemovalWeightKg({ latestWeightKg: -3.8 }), -3.8);
  assert.equal(resolvePieceRateRemovalWeightKg({ latestDisplayText: "NET -3.8 kg" }), -3.8);
  assert.equal(resolvePieceRateRemovalWeightKg({ displayText: "waiting" }), null);
});
