# Return Item Picker Design

## Goal

Add a fallback item picker to `/production-line/weight-scale/return` for cases where an issued-item barcode cannot be scanned. Barcode scanning remains the primary workflow. Selecting an item must enter the exact same validation, weighing, saving, and automatic-printing flow as scanning its barcode.

## Scope

- Add a `เลือกรายการที่ชั่งคืนได้` button to the return weighing page.
- Add a single-select modal listing confirmed issued items that still have returnable weight.
- Support date, product, lot, and barcode/text filtering with server-side pagination.
- Revalidate the selected barcode through the existing issued-barcode lookup before enabling weighing.
- Preserve the existing real-time scale, source-receipt tare, return save, generated return barcode, and automatic-print behavior.
- Do not modify `/production-line/weight-scale` or any inbound-weighing component, API, or database function.

## Considered Approaches

### A. Reuse the existing barcode validation pipeline (selected)

The picker returns one source barcode and passes it to the same handler used by a scanner. This provides one source of truth for eligibility, tare, remaining weight, weighing, save, and print behavior.

### B. Load full return data directly from the picker

This reduces one request after selection, but duplicates eligibility and data-mapping rules between scanning and selection. It also risks stale remaining-weight data.

### C. Save returns directly from the picker

This supports bulk returns but violates the physical process because every package must be weighed separately. This approach is rejected.

## User Flow

1. The operator either scans/types a barcode or presses `เลือกรายการที่ชั่งคืนได้`.
2. The picker shows only confirmed issue rows with `remainingWeightKg > 0`.
3. Each row shows barcode, product, LOT, issue date, issued weight, already returned/wasted weight, and remaining returnable weight.
4. The operator selects exactly one row.
5. The modal closes and the selected barcode is submitted to the existing barcode-validation handler.
6. The existing flow loads source-receipt tare, connects to the scale, validates net weight against the latest remaining weight, saves the return, and automatically prints the generated return label.

## Data and API Design

- Extend `GET /api/production-stock/returns` with a list mode when no `barcode` is supplied.
- List parameters: `page`, `limit`, `dateFrom`, `dateTo`, `search`, and `productCodes` when needed by the UI.
- Continue using the existing permission guard and server-only Supabase admin client.
- Query confirmed rows from `production_stock_issue_report_lines_v` and enrich eligibility from `production_stock_issue_usage_progress_v`.
- Exclude rows whose calculated remaining weight is zero or less.
- A selected row is not trusted as final state; `findIssuedItemByBarcode` runs again after selection, and the return database function remains the final concurrency guard when saving.

## UI Design

- Keep the current scan input prominent.
- Place the fallback button beside or directly below the scan action.
- Use a modal patterned after the issue-item picker, but single-select only.
- Include loading, empty, error, filter, and pagination states.
- Selecting a row is equivalent to scanning its barcode; it does not save a return by itself.

## Error Handling

- If an item becomes fully returned, wasted, cancelled, or otherwise ineligible after the modal loads, the existing barcode validation shows the authoritative error and weighing does not start.
- Failed list requests remain inside the modal and do not disturb an active weighing session.
- Closing the modal returns focus to the barcode input when no source item is active.

## Testing

- Unit-test list normalization, filtering, remaining-weight calculation, pagination, and exclusion of ineligible rows.
- Route-test list mode and preserve existing barcode lookup behavior.
- Component/helper tests verify that selecting a row submits only its barcode to the shared validation pipeline.
- Run focused tests, ESLint on touched files, and a production build.

## Acceptance Criteria

- Scanning continues to behave unchanged.
- Picking an eligible barcode produces the same selected source item as scanning it.
- Only one item can be selected for each physical weighing.
- Fully consumed/cancelled/unconfirmed issue rows cannot be selected.
- Tare, real-time weight, save, generated barcode, and automatic printing remain shared with the current return flow.
- No inbound-weighing file is modified.
