# Product Weight Stock Report Consistency Implementation Plan

**Goal:** Make every product-weight stock report use the same confirmed/cancelled/return semantics so users cannot mistake gross activity for actual stock movement.

**Scope:** Product weight receipts, stock issues, issue cancellation, returns, movement summary, and balance only. Piece-rate, jam-label, WIP production recording, and prison workflows are excluded.

## Tasks

1. Add regression coverage for status normalization and confirmed-only defaults.
2. Make weight receipt detail and summary default to successful receipts and support cancellation-only filtering.
3. Align stock issue detail and summary filters so successful and cancelled results are mutually exclusive.
4. Keep returns in the normal return column and clarify movement/balance labels as net, successful values.
5. Reconcile the affected report totals against the source ledger, then run focused tests, full lint, and production build.

## Acceptance criteria

- Opening any normal report excludes cancelled receipts and issues.
- Choosing cancelled displays only cancelled records and never duplicates the successful original.
- Returns remain visible as returns and reduce actual usage consistently.
- Screen and print labels clearly distinguish successful, cancelled, returned, gross, and net values.
- Existing stock totals do not change unless the previous report included cancelled activity incorrectly.
- Focused tests, `npm run lint`, and `npm run build` pass.
