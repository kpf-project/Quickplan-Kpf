import assert from "node:assert/strict";
import test from "node:test";

import {
  buildBarcodeRange,
  buildRestoreMovement,
  buildRestoredMetadata,
  validateRestoreCandidates,
} from "../scripts/lib/restore-voided-weight-receipts.mjs";

test("buildBarcodeRange includes both endpoints", () => {
  assert.deepEqual(
    buildBarcodeRange("18072600020204", "18072600020222"),
    Array.from({ length: 19 }, (_, index) => String(18072600020204n + BigInt(index)))
  );
});

test("validateRestoreCandidates rejects an incomplete or mismatched recovery set", () => {
  const barcodes = buildBarcodeRange("18072600020204", "18072600020222");
  const rows = barcodes.slice(0, 18).map((barcode) => ({
    barcode,
    status: "voided",
    product_code: "WKB-0002",
    lot_no: "1807260002-1",
  }));

  assert.throws(
    () => validateRestoreCandidates(rows, {
      barcodes,
      productCode: "WKB-0002",
      lotNo: "1807260002-1",
    }),
    /Expected 19 receipts, found 18/
  );
});

test("buildRestoredMetadata preserves a void audit while clearing active void flags", () => {
  const restored = buildRestoredMetadata({
    receiptStatus: "voided",
    voidedAt: "2026-07-30T03:00:00.000Z",
    voidedBy: "user-id",
    voidReason: "wrong click",
    productionDate: "2026-07-18",
  }, {
    restoredAt: "2026-07-30T04:00:00.000Z",
    batchId: "restore-1",
  });

  assert.equal(restored.receiptStatus, undefined);
  assert.equal(restored.voidedAt, undefined);
  assert.equal(restored.voidedBy, undefined);
  assert.equal(restored.voidReason, undefined);
  assert.equal(restored.productionDate, "2026-07-18");
  assert.deepEqual(restored.restoredFromVoid, {
    voidedAt: "2026-07-30T03:00:00.000Z",
    voidedBy: "user-id",
    voidReason: "wrong click",
  });
  assert.equal(restored.restoredBatchId, "restore-1");
});

test("buildRestoreMovement exactly reverses one void movement", () => {
  const movement = buildRestoreMovement({
    id: "void-id",
    movement_no: "MVVOID-1",
    movement_date: "2026-07-30",
    department_id: "department-id",
    department_code: "DEP-BIS",
    product_code: "WKB-0002",
    product_name_snapshot: "Product",
    category_code: "03",
    lot_no: "1807260002-1",
    uom_name: "ถุง",
    quantity_out: 1,
    weight_out_kg: 12.34,
  }, {
    receiptId: "receipt-id",
    barcode: "18072600020204",
    batchId: "restore-1",
    restoredAt: "2026-07-30T04:00:00.000Z",
  });

  assert.equal(movement.movement_type, "adjustment_in");
  assert.equal(movement.quantity_in, 1);
  assert.equal(movement.weight_in_kg, 12.34);
  assert.equal(movement.source_document_type, "weight_receipt_restore");
  assert.equal(movement.source_document_no, "18072600020204");
  assert.equal(movement.reference_no, "MVVOID-1");
});
