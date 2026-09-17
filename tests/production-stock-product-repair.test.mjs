import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCandidateReceipts,
  buildRepairScope,
  replaceInvariantLotCodes,
  summarizeLedgerInvariants,
  summarizeReceiptInvariants,
} from "../scripts/lib/production-stock-product-repair.mjs";

test("selects only original recorded receipts for the wrong product on target production dates", () => {
  const receipts = [
    {
      id: "receipt-1",
      product_config_id: "wrong-config",
      status: "recorded",
      weighed_at: "2026-07-01T03:00:00.000Z",
      metadata: { productionDate: "2026-07-01" },
    },
    {
      id: "return-1",
      product_config_id: "wrong-config",
      status: "recorded",
      weighed_at: "2026-07-01T04:00:00.000Z",
      metadata: { isReturn: true, sourceReceiptId: "receipt-1", productionDate: "2026-07-01" },
    },
    {
      id: "receipt-other-date",
      product_config_id: "wrong-config",
      status: "recorded",
      weighed_at: "2026-07-03T03:00:00.000Z",
      metadata: { productionDate: "2026-07-03" },
    },
  ];

  const selected = buildCandidateReceipts(receipts, {
    wrongConfigIds: ["wrong-config"],
    targetDates: ["2026-07-01"],
  });

  assert.deepEqual(selected.map((row) => row.id), ["receipt-1"]);
});

test("allows a declared target lot while preserving every numeric invariant", () => {
  const before = {
    receiptCount: 1,
    lotCodes: ["0707260002-1"],
    grossWeightKg: 14.88,
    tareWeightKg: 2.8,
    netWeightKg: 12.08,
  };

  assert.deepEqual(replaceInvariantLotCodes(before, "1407260002-1"), {
    ...before,
    lotCodes: ["1407260002-1"],
  });
});

test("includes issued items, derived return receipts, and movements linked to selected receipts", () => {
  const scope = buildRepairScope({
    candidateReceipts: [{ id: "receipt-1", barcode: "BAR-1" }],
    receipts: [
      { id: "receipt-1", barcode: "BAR-1", metadata: {} },
      { id: "return-1", barcode: "BAR-1X01", metadata: { isReturn: true, sourceReceiptId: "receipt-1" } },
      { id: "unrelated-return", barcode: "BAR-2X01", metadata: { isReturn: true, sourceReceiptId: "receipt-2" } },
    ],
    issueItems: [
      { id: "issue-1", source_receipt_id: "receipt-1" },
      { id: "issue-2", source_receipt_id: "receipt-2" },
    ],
    movements: [
      { id: "movement-1", metadata: { sourceReceiptId: "receipt-1" } },
      { id: "movement-2", source_document_no: "BAR-1" },
      { id: "movement-3", metadata: { sourceReceiptId: "receipt-2" } },
    ],
  });

  assert.deepEqual(scope.receiptIds, ["receipt-1"]);
  assert.deepEqual(scope.derivedReturnReceipts.map((row) => row.id), ["return-1"]);
  assert.deepEqual(scope.issueItems.map((row) => row.id), ["issue-1"]);
  assert.deepEqual(scope.movements.map((row) => row.id), ["movement-1", "movement-2"]);
});

test("receipt invariants preserve lot, quantity, and all weight totals", () => {
  const summary = summarizeReceiptInvariants([
    { lot_code: "LOT-A", gross_weight_kg: 11, tare_weight_kg: 1, net_weight_kg: 10 },
    { lot_code: "LOT-A", gross_weight_kg: 21.5, tare_weight_kg: 1.5, net_weight_kg: 20 },
  ]);

  assert.deepEqual(summary, {
    receiptCount: 2,
    lotCodes: ["LOT-A"],
    grossWeightKg: 32.5,
    tareWeightKg: 2.5,
    netWeightKg: 30,
  });
});

test("ledger invariants include dates, lots, quantities, and directional weights", () => {
  const summary = summarizeLedgerInvariants([
    {
      movement_date: "2026-07-04",
      lot_no: "LOT-A",
      quantity_in: 1,
      quantity_out: 0,
      weight_in_kg: 10,
      weight_out_kg: 0,
    },
    {
      movement_date: "2026-07-05",
      lot_no: "LOT-A",
      quantity_in: 0,
      quantity_out: 1,
      weight_in_kg: 0,
      weight_out_kg: 10,
    },
  ]);

  assert.deepEqual(summary, {
    rowCount: 2,
    dates: ["2026-07-04", "2026-07-05"],
    lotCodes: ["LOT-A"],
    quantityIn: 1,
    quantityOut: 1,
    weightInKg: 10,
    weightOutKg: 10,
  });
});
