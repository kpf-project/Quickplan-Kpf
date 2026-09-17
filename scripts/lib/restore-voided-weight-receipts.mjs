function normalizeText(value) {
  return String(value ?? "").trim();
}

export function buildBarcodeRange(firstBarcode, lastBarcode) {
  const first = BigInt(normalizeText(firstBarcode));
  const last = BigInt(normalizeText(lastBarcode));
  if (last < first) throw new Error("Last barcode must not be before first barcode");
  return Array.from(
    { length: Number(last - first + 1n) },
    (_, index) => String(first + BigInt(index))
  );
}

export function validateRestoreCandidates(rows, {
  barcodes,
  productCode,
  lotNo,
}) {
  const sourceRows = Array.isArray(rows) ? rows : [];
  if (sourceRows.length !== barcodes.length) {
    throw new Error(`Expected ${barcodes.length} receipts, found ${sourceRows.length}`);
  }

  const rowByBarcode = new Map(sourceRows.map((row) => [normalizeText(row.barcode), row]));
  for (const barcode of barcodes) {
    const row = rowByBarcode.get(barcode);
    if (!row) throw new Error(`Missing receipt ${barcode}`);
    if (normalizeText(row.status).toLowerCase() !== "voided") {
      throw new Error(`Receipt ${barcode} has status ${row.status}, expected voided`);
    }
    if (normalizeText(row.product_code).toUpperCase() !== productCode.toUpperCase()) {
      throw new Error(`Receipt ${barcode} has product ${row.product_code}, expected ${productCode}`);
    }
    if (normalizeText(row.lot_no) !== lotNo) {
      throw new Error(`Receipt ${barcode} has lot ${row.lot_no}, expected ${lotNo}`);
    }
  }

  return sourceRows;
}

export function buildRestoredMetadata(metadata, { restoredAt, batchId }) {
  const source = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata
    : {};
  const {
    receiptStatus: _receiptStatus,
    voidedAt,
    voidedBy,
    voidReason,
    ...preserved
  } = source;

  return {
    ...preserved,
    restoredAt,
    restoredBatchId: batchId,
    restoredFromVoid: {
      ...(voidedAt ? { voidedAt } : {}),
      ...(voidedBy ? { voidedBy } : {}),
      ...(voidReason ? { voidReason } : {}),
    },
  };
}

export function buildRestoreMovement(voidMovement, {
  receiptId,
  barcode,
  batchId,
  restoredAt,
}) {
  return {
    movement_no: `MVRESTORE-${batchId}-${barcode}`,
    movement_type: "adjustment_in",
    movement_date: restoredAt.slice(0, 10),
    movement_at: restoredAt,
    department_id: voidMovement.department_id,
    department_code: voidMovement.department_code,
    product_code: voidMovement.product_code,
    product_name_snapshot: voidMovement.product_name_snapshot,
    category_code: voidMovement.category_code,
    lot_no: voidMovement.lot_no,
    uom_name: voidMovement.uom_name,
    quantity_in: Number(voidMovement.quantity_out),
    weight_in_kg: Number(voidMovement.weight_out_kg),
    source_document_type: "weight_receipt_restore",
    source_document_no: barcode,
    reference_type: "weight_receipt_void",
    reference_no: voidMovement.movement_no,
    remark: "restore accidentally voided weight receipt",
    metadata: {
      sourceReceiptId: receiptId,
      barcode,
      restoredBatchId: batchId,
      reversedMovementId: voidMovement.id,
      reversedMovementNo: voidMovement.movement_no,
    },
  };
}
