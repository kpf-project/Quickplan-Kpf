# Instant Barcode Scan Design

## Goal

Make hardware-barcode scans feel immediate while preserving the existing stock-issue API, RPC, validation, inventory, and reporting logic.

## Scope

- Change only the scan-submission behavior in `ProductionStockIssuePageClient`.
- Keep the existing single-item endpoint and `create_production_stock_issue` RPC unchanged.
- Keep list-picker behavior unchanged.
- Prevent overlapping hardware-scanner requests without dropping rapid scans.

## Design

Use a synchronous ref-based FIFO controller. When Enter arrives with a barcode, capture it and append it to the queue before starting asynchronous work, clear the input immediately, and submit queued barcodes one at a time through the existing request function. Suppress the same normalized barcode while it is already queued or processing, preventing scanner key bounce without dropping a different rapid scan.

The visible status changes immediately to processing, so the operator receives feedback without waiting for the network. Success and error rendering continue to use the existing response and error handling.

## Error Handling

An API error leaves inventory logic untouched, displays the existing error message, releases the guard, and restores focus. A failed scan can then be scanned again.

## Verification

- A regression test proves two different immediate submissions are processed in order.
- A regression test proves the same barcode cannot be queued twice concurrently.
- A regression test proves the guard releases after success and failure.
- Existing production-stock issue and return tests remain green.
- ESLint passes for the modified component.
