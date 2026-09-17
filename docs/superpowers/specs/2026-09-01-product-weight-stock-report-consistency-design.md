# Product Weight Stock Report Consistency Design

## Scope

This change applies only to the product weight stock workflow:

- product weight receipt;
- product stock issue at `/production-line/stock/issues`;
- issue cancellation;
- product return (ชั่งคืน);
- receipt, issue, movement, return, and balance reports under the product weight stock area.

It does not change piece-rate/jam-label stock, production result recording, FG/WIP carryover, or prison stock workflows.

## Goal

Every product weight stock report must use the same business definitions, default visibility rules, date scope, and signs. A user must not need to understand ledger implementation details to reconcile receipt, issue, return, movement, and balance totals.

## Canonical business definitions

- **รับเข้าสำเร็จ**: a weight receipt that has not been cancelled.
- **เบิกสำเร็จ**: a stock issue whose document and item remain `confirmed`.
- **ยกเลิกรับเข้า**: the reversal movement of a cancelled weight receipt. It is not a successful receipt.
- **ยกเลิกเบิก**: the reversal movement of a cancelled issue. It is not a successful issue and is not a return.
- **ชั่งคืน**: a confirmed product return against an issued item. It is shown separately from receipts and cancellations.
- **ใช้จริงสุทธิ**: successful issue minus confirmed product return, plus waste where the report includes waste.
- **คงเหลือ**: opening balance + successful receipt - successful issue + product return - waste.

All report calculations use the ledger direction as the source of truth. Document tables supply lifecycle status and display metadata.

## Visibility and filtering

### Default report state

- Receipt report shows successful receipts only.
- Issue report shows successful issues only.
- Movement report excludes all cancellation rows and excludes the cancelled original receipt/issue.
- Product returns remain visible in the movement report under the dedicated **ชั่งคืน** column.
- Summary cards and printed totals are calculated from exactly the rows visible under the active filter.

### Cancellation state

When the user selects **ยกเลิก** and searches:

- show cancellation rows only;
- do not repeat the original receipt or issue row;
- show cancellation date/time, cancellation type, original document number, product, LOT, quantity/weight, reason, and cancelling user where available;
- cancellation amounts are audit values, not successful receipt/issue totals.

The screen, exported/printed report, pagination count, and summary cards must apply the same filter.

## Shared report model

Create a product-stock-specific reporting utility that converts document and `production_stock_movements` rows into one canonical movement model. The model exposes:

- lifecycle kind: `receipt`, `issue`, `return`, `waste`, `receipt_cancel`, or `issue_cancel`;
- lifecycle status: `confirmed` or `cancelled`;
- signed quantity and weight;
- business date and movement timestamp;
- original document reference;
- cancellation reason and actor;
- product, LOT, department, and category scope.

The utility must not recognize or aggregate `piece_rate_*`, WIP, or prison source-document types.

## Data flow

1. Receipt, issue, return, and cancellation operations continue writing immutable rows to `production_stock_movements`.
2. Product weight report APIs load only product weight source types.
3. The shared utility classifies rows and pairs reversal rows with their original document.
4. APIs apply one explicit status filter: `confirmed` by default or `cancelled` when selected.
5. Detail rows and summaries are produced from the same filtered collection.
6. Balance calculations apply all ledger directions, including reversals, regardless of whether cancellation rows are hidden from the default presentation.

## Report behavior

### Receipt report

- Default totals exclude cancelled receipts.
- Cancellation mode shows only receipt cancellations.
- A cancelled original receipt never appears as successful.

### Issue and issue-summary reports

- Default totals include only documents/items that remain confirmed.
- Cancellation mode shows only issue cancellations.
- Re-issued stock appears once as the new confirmed issue; its cancelled predecessor remains available only in cancellation mode.
- Product returns do not change the successful issue amount. They reduce **ใช้จริงสุทธิ** and appear in **ชั่งคืน**.

### Movement report

- Default columns are opening, successful receipt, successful issue, ชั่งคืน, waste, actual usage, and closing balance.
- Default mode does not display cancellation rows or cancelled originals.
- Cancellation mode is an audit list rather than a mixed movement summary.

### Balance report

- Uses the complete ledger, including reversal movements.
- Hidden cancellation rows still affect the mathematical balance.
- The closing balance for a selected end date must reconcile with the movement report closing balance for the same scope and date.

## Date rules

- All reports filter by the stored business date (`movement_date` / document business date), not by UTC string slicing.
- Receipt, issue, return, cancellation, movement, and balance reports use the same inclusive `dateFrom` and `dateTo` interpretation in Asia/Bangkok.
- Cancellation audit rows are filtered by cancellation movement business date.

## User-facing wording

Use these labels consistently on screen and print:

- รับเข้าสำเร็จ
- เบิกสำเร็จ
- ชั่งคืน
- ของเสีย
- ใช้จริงสุทธิ
- ยกเลิกรับเข้า
- ยกเลิกเบิก
- คงเหลือ

Do not label a gross historical issue amount as “เบิกสำเร็จ”. Do not combine cancellation with product return.

## Error handling and safeguards

- If a reversal cannot be paired with an original document, retain it in cancellation audit mode and mark the reference as unavailable; never silently count it as successful activity.
- If report rows and summary rows cannot be derived from the same filtered dataset, fail the request rather than return conflicting totals.
- Existing immutable ledger rows are not rewritten by this change.
- No production data repair is included unless a separate read-only reconciliation proves a data defect and the user explicitly authorizes repair.

## Testing and acceptance criteria

Automated tests must cover:

1. receipt → default receipt/movement totals include it;
2. receipt → cancel → default reports include neither original nor cancellation, cancellation mode includes only cancellation;
3. issue → default issue/movement totals include it;
4. issue → cancel → default reports include neither original nor cancellation, cancellation mode includes only cancellation;
5. issue → cancel → reissue → default reports include only the new confirmed issue;
6. issue → product return → issue remains successful, return appears in ชั่งคืน, actual usage is issue minus return;
7. detail rows, screen cards, print totals, and API summary reconcile under every filter;
8. movement closing balance equals the balance report for the same date and scope;
9. piece-rate, WIP, and prison movements are excluded from this product weight report model;
10. lint and production build pass.

## Performance

- Keep existing indexed filters on department, product, LOT, movement date, and source-document type.
- Filter source types and date ranges in Postgres before application-level classification.
- Derive detail and summary results in one pass over the fetched rows.
- Add an index only if `EXPLAIN` or a measured production query demonstrates the existing indexes are insufficient.
