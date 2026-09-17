# Return Receipt Reissue Design

## Goal

Allow a persisted weight-scale return label to be scanned for a later stock issue using exactly that return receipt's net weight, while preserving product, lot, and source history and preventing duplicate issue.

## Scope

- Change only stock-issue handling for receipts marked `metadata.isReturn = true`.
- Keep inbound receipt creation and `/production-line/weight-scale` unchanged.
- Keep return weighing, realtime scale reading, tare calculation, and automatic printing unchanged.
- Preserve the existing behavior for original inbound barcodes.

## Considered approaches

1. **Issue the return receipt as its own inventory unit (selected).** The printed return barcode identifies one physical returned unit, whose `net_weight_kg` is issued once. This avoids mixing weights from multiple returns and matches the label physically attached to the stock.
2. **Treat the return barcode as an alias of the original inbound barcode.** This keeps the old ledger calculation but can pool multiple return weights and makes the scanned physical label differ from the inventory unit being issued.
3. **Continue requiring the original inbound barcode.** This preserves the current implementation but makes the newly printed return label unusable for its next physical movement.

## Data flow

1. Return weighing continues to create a new `production_weight_receipts` row with a unique barcode, its own gross/tare/net weights, and metadata linking `sourceReceiptId`, `sourceIssueItemId`, and `sourceIssueDocumentId`.
2. The stock-issue RPC looks up the scanned recorded receipt and locks it with `FOR UPDATE`.
3. For an original inbound receipt, available weight is its own net weight minus issues plus issue-cancellation adjustments. `return_in` is no longer added back to the original receipt because that weight belongs exclusively to the new return receipt.
4. For a return receipt, available weight is exactly its own `net_weight_kg` when it has no active confirmed issue item, and zero after it has been issued.
5. The issue item references the scanned return receipt ID and barcode. Product, lot, and unit remain those already persisted on that receipt.
6. The issue movement records both the scanned receipt ID and the original root receipt ID in metadata so reports and repairs can trace the full chain.
7. A concurrent or repeated scan of the same return barcode fails atomically because the receipt row is locked and the active issue check is repeated inside the transaction.

## Picker and API behavior

- The issue API no longer rejects return-receipt metadata before calling the RPC.
- The available-stock picker includes recorded return receipts that have not been issued.
- Return receipts are shown with their own barcode and own net weight, not the pooled balance of the root receipt.
- Original receipts continue to show their ledger-derived available weight but do not absorb `return_in` weight, preventing the same returned kilograms from appearing under two barcodes.

## Error handling

- Reject a return barcode whose receipt is cancelled or missing.
- Reject a return receipt with non-positive net weight.
- Reject a return barcode that already has an active confirmed issue.
- Preserve existing validation for issue type and production scope.
- Voiding an issue restores that exact receipt through the existing adjustment movement and issue-status rules.

## Verification

- A regression test must fail against the current rejection/filtering implementation before production code changes.
- Tests must assert that the migration selects return receipts, uses their own net weight, locks the receipt, checks active issue state, and records root traceability.
- Run focused stock-return/issue tests, the full test suite, ESLint for changed JavaScript, and a production build.
- Inspect changed paths to prove no inbound weighing component, service, or API was modified.
