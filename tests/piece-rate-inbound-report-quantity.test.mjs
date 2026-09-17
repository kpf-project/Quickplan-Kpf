import assert from "node:assert/strict";
import test from "node:test";

import { resolvePieceRateInboundQuantity } from "../src/lib/pieceRateInboundQuantity.js";

test("pail-mode inbound report uses the actual entered pail count", () => {
  assert.equal(
    resolvePieceRateInboundQuantity({ input_mode_snapshot: "pail", input_value: "275.0000" }, 1),
    275
  );
});

test("weight-mode inbound report keeps the ledger quantity", () => {
  assert.equal(
    resolvePieceRateInboundQuantity({ input_mode_snapshot: "weight", input_value: "1375.0000" }, 1),
    1
  );
});

test("invalid pail input safely falls back to the ledger quantity", () => {
  assert.equal(
    resolvePieceRateInboundQuantity({ input_mode_snapshot: "pail", input_value: null }, 1),
    1
  );
});
