# Attendance Pallet Scan - Progress and Next Actions

## 1) What we are building
- Add a real **Pallet Scan** workflow to `production-line/attendance`.
- Keep existing daily work report intact, and add a **separate pallet scan report**.
- Validate scan data against barcode mappings:
  - Product barcode must be mapped to a SKU.
  - SKU must match configured quantity barcode mapping (SKU override first, then category fallback).
- Save pallet scan logs (with doc number, machine code, user, qty) for traceability.

## 2) What has been implemented

### API
- `src/app/api/attendance/pallet-scan/route.js`
  - `POST action=resolve`: validate product barcode + qty barcode against mapping.
  - `POST action=confirm`: save pallet scan log.
  - `GET`: list pallet scan logs for reporting with pagination/filter.
  - Added server-side doc number generation fallback when `doc_no` is not sent.
  - Added permission checks for view/manage.

### New client services
- `src/features/attendance/services/palletScanClient.js`
  - `resolvePalletScan(...)`
  - `confirmPalletScan(...)`
  - `fetchPalletScanReport(...)`

### New pages/components
- `src/app/production-line/attendance/pallet-scan/page.js`
- `src/features/attendance/components/PalletScanPageClient.js`
  - Real scan flow (product -> qty -> resolve -> confirm yes/no -> save)
  - Camera switch, image upload, manual qty override popup
- `src/app/production-line/attendance/report/pallet-scan/page.js`
- `src/features/attendance/components/PalletScanReportPageClient.js`
  - Search + date filter + pagination + report table

### Existing page updates
- `src/app/production-line/attendance/page.js`
  - Added new menu card for **Pallet Scan**.
- `src/features/attendance/components/DailyWorkReportPageClient.js`
  - Kept as the original daily work report page (not replaced).
  - Added navigation link to pallet report page.

### Permissions / route alias
- `src/features/auth/services/authorizeService.js`
  - Added aliases for:
    - `/production-line/attendance/pallet-scan`
    - `/production-line/attendance/report/pallet-scan`

### Mapping consistency fix
- `src/app/api/pallet-barcodes/route.js`
- `src/features/production-line-settings/components/PalletBarcodeSettingsTab.js`
  - Normalized ICDEPT/ICCAT code matching to reduce mismatch cases.
  - Improve immediate category-mapping fallback behavior for SKU rows.

## 3) What still needs to be done (next)

### A. Final UI language cleanup
- Some UI text still needs final pass to ensure clean user-facing language consistency.
- Decide and apply final language policy (Thai-only vs bilingual) across:
  - attendance landing
  - daily work report
  - pallet scan report
  - pallet scan live page

### B. Verify SKU Override behavior after category mapping
- Confirm with real data that after saving a category mapping:
  - rows in that category show fallback qty barcode immediately in `SKU Override` display behavior.
- If product team needs hard-write behavior (store explicit SKU mapping for every SKU in category), add a dedicated bulk action API.

### C. Optional hardening
- Add server-side validation for custom qty override audit reason (optional).
- Add stricter dedupe logic for repeated accidental scans (optional).

## 4) How to test (step-by-step)

## 4.1 Build checks
1. Run lint:
```bash
npm run lint
```
2. Run build:
```bash
npm run build
```
3. Expected result:
- both commands finish without errors.

## 4.2 Mapping setup test
1. Open settings tab: `/production-line/settings/pallet-barcodes`.
2. Create quantity barcode (example `30` -> `QTY:030`).
3. Set product barcode for target SKU.
4. Set category mapping (ICDEPT -> qty barcode).
5. Confirm in table:
- target SKU row shows expected effective qty barcode behavior.

## 4.3 Live pallet scan test
1. Open `/production-line/attendance/pallet-scan`.
2. Scan product barcode.
3. Scan quantity barcode.
4. Expected:
- If mapping mismatched -> warning and no save.
- If mapping matched -> show confirm options:
  - Yes = save default qty
  - No = open modal, input qty, then save
5. After save, verify:
- success panel shows `doc_no`, `sku`, `actual_qty`, timestamp.

## 4.4 Report test
1. Open `/production-line/attendance/report/pallet-scan`.
2. Filter by today date.
3. Search by `doc_no`, `SKU`, barcode, or user.
4. Expected:
- rows returned with correct data columns.
- pagination works.

## 4.5 Permission test
1. User with view-only permissions:
- can access report and resolve flow.
- cannot confirm/save (manage actions should fail).
2. User with manage permissions:
- can save records.

## 5) Suggested smoke test matrix
- Case 1: Product barcode not configured -> resolve fails with clear message.
- Case 2: Product configured, category mapped, qty matched -> save success.
- Case 3: Product configured, qty mismatch -> blocked.
- Case 4: Matched, custom qty override -> save success with custom value.
- Case 5: Machine code unavailable -> fallback behavior still saves with default machine code.

## 6) Release checklist
- [ ] `npm run lint` pass
- [ ] `npm run build` pass
- [ ] Manual mapping + scan + report scenario pass
- [ ] Permission scenario pass
- [ ] Final language/content review pass

## 7) Notes for next handoff
- If operators require Thai-only labels everywhere, do one final localization pass before production rollout.
- Keep old daily work report untouched as requested; pallet report remains separate.
