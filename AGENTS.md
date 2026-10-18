# Repository Guidelines for Agentic Work

- Compact BOM editor reuses ReportTable, PlanningSkuPicker, PlanningCatalogDialog/Table and shared pagination; keeps Trade Code/unit identity, nested-child read-only guards and existing version/approval handlers. Inline quantity Enter/blur commits and Escape cancellation: `node --test tests/bom-compact-editor.test.mjs tests/bom-table-layout.test.mjs tests/planning-catalog-dialog.test.mjs tests/planning-sku-picker.test.mjs tests/requisition-material-picker.test.mjs tests/a4-document-print-standard.test.mjs tests/data-refresh-wiring.test.mjs`. Isolated browser: `node tests/helpers/bom-editor-fixture.mjs` (mock APIs only; no company writes/exports).

- Planning/department/requisition catalog selection shares `PlanningCatalogDialog`/`PlanningCatalogTable`; department WIP uses `DepartmentWipPicker` with the existing department-scoped endpoint, not the full Trade Code catalog. Preserve FG formula confirmation, single WIP choice, Trade Code+unit multi-selection and failed-save retention: `node --test tests/planning-catalog-dialog.test.mjs tests/planning-sku-picker.test.mjs tests/requisition-material-picker.test.mjs` (fixtures only; no company writes).

- Department option-one context/daily entry above full-width preview reuses `RequisitionPaper` and `RequisitionPaperTable` with requisition Preview (no LOT/export actions in department). Regression: `node --test tests/department-day-entry.test.mjs tests/requisition-preview-presentation.test.mjs tests/requisition-inline-quantity.test.mjs tests/requisition-export-safety.test.mjs` (fixtures only; no company writes). Check daily-form horizontal overflow at 1440/1280/1024/834/390px using the isolated `tests/helpers/department-day-entry-fixture.mjs`.

- Department day-first WIP entry uses the compact split weekly BOM preview/date-list popover, per-record day/shift edits, read-only kg, and abortable/debounced preview requests without draft writes: `node --test tests/department-day-entry.test.mjs tests/qa-subplan-workbench-auto-bom.test.mjs tests/wip-weekly-grid.test.mjs tests/planning-release.test.mjs`. Isolated real-component browser fixture: `node tests/helpers/department-day-entry-fixture.mjs` (local mock data only; no company APIs or saves).

- Shared compact report/requisition WIP weekly table, batch/kg totals, independent duplicate/date/shift/formula rows and read-only cells: `node --test tests/wip-weekly-table.test.mjs tests/wip-plan-display-weight.test.mjs tests/requisition-preview-presentation.test.mjs tests/requisition-preview-display-grouping.test.mjs tests/planning-adjustment-shared-table.test.mjs` (fixtures only; never save company plans during QA).

- Report WIP kg display: retain bound BOM versions; legacy lines without a version resolve only their own SKU/formula's latest approved BOM for display, without rebinding saved plans. Regression: `node --test tests/wip-plan-display-weight.test.mjs tests/wip-plan-draft-fast.test.mjs tests/requisition-preview-display-grouping.test.mjs` (fixtures only; no company writes).

- Report FG reuses the master/template schedule renderer, Section tabs, shared SKU/formula and plan archive pickers, row/date permission locks and identical configured widths; room WIP remains unchanged: `node --test tests/planning-adjustment-shared-table.test.mjs tests/schedule-column-layout.test.mjs tests/planning-control-center-master-plans.test.mjs tests/planning-sku-picker.test.mjs tests/planning-release.test.mjs` (fixtures only; never save company plan changes during browser QA).

- Requisition plan archive year/month navigation, actual period display, cross-year search and 120-plan fixture: `node --test tests/requisition-dialogs.test.mjs tests/requisition-preview-presentation.test.mjs` (read-only selector; no company writes).

- Shared requisition compact confirmations, reset confirmation/error retention, orange hide action, hidden-document table and Excel daily/weekly selection: `node --test tests/requisition-dialogs.test.mjs tests/requisition-preview-presentation.test.mjs tests/requisition-inline-quantity.test.mjs tests/requisition-export-safety.test.mjs` (isolated fixtures; no company writes or exports).

- AI import Preview reuses the real master schedule table with per-Section date/formula/column layouts, grouped dates, scoped product/formula edits and preserved printed shift times: `node --test tests/schedule-import-table.test.mjs tests/schedule-import-picker.test.mjs tests/schedule-column-layout.test.mjs tests/schedule-date-layout.test.mjs tests/schedule-formula-layout.test.mjs` (isolated render/state fixtures; no company plan writes).

- AI-only product cells show underlined original document text (#526B8A, 12px) below every source-backed product and an underlined missing-product/formula message (#B45309) that opens the existing picker; no source metadata is persisted by the table adapter: `node --test tests/schedule-import-table.test.mjs`.

- Requisition RAW/WIP complete Trade Code catalog, independent trade-unit identity, multi-select page/search retention, failed-save retention and exported-row delete locks: `node --test tests/requisition-material-picker.test.mjs tests/requisition-preview-presentation.test.mjs tests/requisition-inline-quantity.test.mjs tests/requisition-export-safety.test.mjs` (fixtures only; never add/delete company rows during UI testing).

- Independent header/body colors for all schedule columns using shared color controls and section-scoped settings: `node --test tests/schedule-column-colors.test.mjs tests/schedule-column-layout.test.mjs tests/schedule-formula-layout.test.mjs tests/schedule-date-layout.test.mjs` (fixtures only; preserves legacy colors, no company writes).

- Shared configurable formula columns, retained row BOM bindings, compact date groups and read-only/print formula display: `node --test tests/schedule-formula-layout.test.mjs tests/schedule-column-layout.test.mjs tests/schedule-date-layout.test.mjs tests/planning-sku-picker.test.mjs` (fixtures only; no company writes).

- Per-Section date column width/header/body colors and shared preview/master table rendering: `node --test tests/schedule-date-layout.test.mjs tests/schedule-column-layout.test.mjs` (fixtures only; stored under existing `system_settings`, no schema migration).

- Custom schedule HEX highlight colors/legacy presets and shared table rendering: `node --test tests/schedule-highlight-colors.test.mjs tests/schedule-column-layout.test.mjs`. Bound WIP BOM kg-per-batch and incomplete-weight guards: `node --test tests/wip-plan-display-weight.test.mjs tests/requisition-preview-display-grouping.test.mjs` (fixtures only).

- Independent inline master/WIP reference papers, shared fullscreen content, selected-paper landscape print and print cleanup: `node --test tests/planning-reference-paper.test.mjs tests/requisition-preview-presentation.test.mjs` (isolated handlers, no company data writes).

- Inline requisition quantity editing, blank-to-zero deletion semantics, Enter/blur single-flight, Tab, Escape, validation and retained failed drafts: `node --test tests/requisition-inline-quantity.test.mjs tests/requisition-preview-presentation.test.mjs tests/requisition-preview-display-grouping.test.mjs tests/requisition-export-safety.test.mjs` (isolated handlers/fixtures; no company data writes).

- Compact requisition paper layout, shared room navigation/actions, production-room WIP input quantities (no BOM reconversion), unit/department/date isolation and retained export/LOT display: `node --test tests/requisition-preview-presentation.test.mjs tests/requisition-export-safety.test.mjs tests/requisition-preview-display-grouping.test.mjs` (isolated fixtures; no company data writes).

- Master plan paper layout, external Section navigation and text-only cell affordances: `node --test tests/master-plan-presentation.test.mjs tests/schedule-column-layout.test.mjs`.

- Shared schedule column widths and live designer preview: `node --test tests/schedule-column-layout.test.mjs` (no company data writes).

- Compact master-planning product picker pagination, search reset, draft selection, formula confirmation and missing-BOM guard: `node --test tests/planning-sku-picker.test.mjs`.

- Inline weekly WIP projection, duplicate/date/shift/unit/section isolation, existing cell edits, missing-cell creation, batch row removal and confirmed-plan locks: `node --test tests/wip-weekly-grid.test.mjs tests/qa-subplan-workbench-auto-bom.test.mjs tests/planning-release.test.mjs`. Uses local fixtures only; never save or confirm company plans for UI testing.

- Vision import full Section-scoped manual picker, stale choice clearing on Section moves and explicit correction save guards: `node --test tests/schedule-import-picker.test.mjs` (isolated fixtures; no company data writes).

- Biscuit cream-section import: printed ก้นหอย requires a spiral-cookie master; printed คุกกี้นม means แซนวิช/แซนวิส, never a generic cookie or the other family. Regression including incompatible aliases and missing-family abstention: `node --test tests/schedule-vision-import.test.mjs`.

- Tin-section ABC/AEC import aliases share the ABC family only: XL is 4 kg, L is 1.1 kg, printed ลัง matches master unit กล่อง; retain brand/BOM/category guards and other products' existing sizing. Test: `node --test tests/schedule-vision-import.test.mjs` (fixtures only; no SKU hard-coding or master-data changes).

- Department add-product server pagination, cursor navigation, search/reopen reset, stale responses and retry: `node --test tests/department-product-pager.test.mjs`.

- Shared compact settings sidebar selection/search/collapse and create authorization: `node --test tests/settings-list-sidebar.test.mjs`.

- Compact packing carryover picker product identity, LOT table and centered mobile/desktop layout: `node --test tests/packing-source-dialog.test.mjs` (isolated browser; no company data).
- Packing supplemental unit ratios and admin-only immutable settings: `node --test tests/packing-unit-supplement.test.mjs tests/packing-unit-settings-api.test.mjs`. Uses existing `system_settings`; never rewrite prior document unit snapshots.

- Report-center ERP overlay, net-kg quantity/zero unit weight, preview snapshot, monthly numbering, replay/duplicate/rollback and history: `node --test tests/erp-receipt-export.test.mjs tests/erp-receipt-export-postgres.test.mjs tests/erp-receipt-export-browser.test.mjs`. PostgreSQL uses a disposable localhost database only. User-run SQL Editor installer: `scripts/install-receipt-erp-export.sql`; source extension: `scripts/receipt-erp-export-atomic.sql`; instructions: `docs/receipt-erp-export.md`. Isolated UI preview (mock APIs, no company data): `node tests/helpers/erp-drawer-fixture.mjs --serve`.

- Archify 3.1.0 is installed for this project at `.agents/skills/archify` from `tt-a1i/archify` tag `v3.1.0`. Read its `SKILL.md` when asked to use Archify. Verify installation: `node .agents/skills/archify/bin/archify.mjs doctor`; generate a local smoke-test diagram: `node .agents/skills/archify/bin/archify.mjs demo .codex-tmp/archify-install-check`. No app dependency installation is needed.

- Settings permission matrix coverage and add/remove review: `node --test tests/permission-matrix.test.mjs`.
- Fresh server permission enforcement and read-only permission inventory: `node --test tests/permission-fresh-guard.test.mjs`.
- Staged costing role-task compatibility and strict-mode checks: `node --test tests/task-permissions.test.mjs`. User-run only SQL: `scripts/install-role-task-permissions-costing.sql`; do not enable `ROLE_TASK_PERMISSIONS_ENABLED` before installation and verification.
- Compact settings user/LINE/audit catalogs and retained account guards: `node --test tests/settings-catalog-layout.test.mjs`.
- Granular production/data role-task guards and role/navigation layout: `node --test tests/production-task-permissions.test.mjs tests/data-task-permissions.test.mjs tests/role-work-groups.test.mjs tests/task-navigation-visibility.test.mjs`.
- Generate the complete staged role-task installer: `node scripts/build-role-task-install.mjs`. User-run only SQL: `scripts/install-role-task-permissions.sql`; replaces the costing-only installer. Do not enable `ROLE_TASK_PERMISSIONS_ENABLED` before database installation and verification.
- Isolated PostgreSQL role migration, exact legacy capability preservation, atomic save and stale-write protection: `node --test tests/role-task-postgres.test.mjs` (temporary local database only).
- Packing unit profiles (no name guessing), counts/weight precision, and isolated atomic closing-stock consumption: `node --test tests/packing-units.test.mjs tests/packing-workspace-postgres.test.mjs tests/non-wage-packing-output.test.mjs`. User-run staged SQL: `scripts/install-packing-workspace.sql`; does not migrate legacy FG/WIP or central opening balances.
- Packing workspace action/department isolation and committed retry recovery: `node --test tests/packing-workspace-service.test.mjs`.
- Read-only role/WIP installation, legacy grant preservation and database access verification: `node scripts/stock-fix-sql.mjs scripts/verify-role-wip-installation.sql` (post-install checks require central WIP tables).

- Central receipt browser pending/recovery safety: `npm run test -- tests/central-scale-pending-receipt.test.mjs`.
- Central per-PC printer isolation and committed-receipt guards: `npm run test -- tests/central-scale-print.test.mjs`.
- Central inbound history/readiness/pending settlement and local serial isolation: `npm run test -- tests/central-inbound-api.test.mjs`; SQL race/ledger checks: `node --test tests/central-scale-numbering-postgres.test.mjs`.

- Central scale optional signed-capture agent (no hardware): `npm run test -- tests/central-scale-capture-agent.test.mjs`; parser regression: `node local-scale-agent/parse.test.js`.

- Generate SQL Editor-compatible central scale install bundle (no company DB execution): `node scripts/build-central-scale-install.mjs`; instructions: `docs/central-scale-install.md`.
- Central scale signed capture and receipt API adapter tests: `npm run test -- tests/scale-capture-evidence.test.mjs tests/central-scale-receipt-api.test.mjs`.

- Staged central receipt permission registration and transactional master-data authorization: `scripts/apply-central-scale-authorization.sql` (depends on numbering + receipts; no role grants; not installed in company DB). Test: `node --test tests/central-scale-numbering-postgres.test.mjs`.

- Central scale existing department/product/subcategory access guard: `npm run test -- tests/central-scale-product-access.test.mjs tests/department-product-hotkeys.test.mjs`.

- Central receipt atomicity, replay, weight validation and movement rollback test (disposable local PostgreSQL): `node --test tests/central-scale-numbering-postgres.test.mjs`.
- Staged central receipt SQL: `scripts/apply-central-scale-receipts.sql` (depends on staged numbering; not deployed or connected to live APIs).

- Report-center bounded request cache and concurrent read regression: `npm run test -- tests/report-request-cache.test.mjs tests/supabase-range-fetch.test.mjs`.
- Shared report header and date-group DD-MM-YYYY display (Buddhist Era, no query/LOT changes): `npm run test -- tests/report-date-format.test.mjs`.
- Shared report search feedback, stale-response isolation, refresh/retry and permission-scope checks: `npm run test -- tests/report-search-state.test.mjs`.

This repo contains a Next.js App Router app plus a separate Express API gateway.
Keep edits scoped to the correct package.

## Quick Map
- `src/app/`: Next.js routes/layouts; API handlers at `src/app/api/**/route.js`.
- `src/components/`: shared UI components (PascalCase filenames).
- `src/features/`: feature modules (components/services/hooks).
- `src/lib/`: shared utilities and server/client helpers.
- `src/types/supabase.ts`: generated types; do not hand-edit.
- `kpf-api-gateway/`: standalone Express service with its own `package.json`.

## Build, Lint, Test Commands
App (repo root):
- `npm run dev` - start Next.js dev server (uses webpack).
- `npm run build` - production build.
- `npm run start` - run production server.
- `npm run lint` - ESLint (Next.js core-web-vitals config).
- `npm run analyze` - bundle analyzer build.
- `npm run gen:types` - regenerate Supabase types.
- `python scripts/generate_barcode.py <value>` - generate a Code 128 barcode SVG from a typed value.
- `npm run repair:subplan-snapshots -- --master-plan=MP-YYYY-MM-NNN --apply` - rebuild confirmed subplan `bom_snapshot` rows from direct BOM children only.
- `npm run repair:subplan-nos -- --master-plan=MP-YYYY-MM-NNN --apply` - normalize old subplan numbers so each `master_plan_no + department` uses one canonical `sub_plan_no`, and clean duplicate `production_sub_plans` rows when present.
- `npm run repair:bom-item-units -- --apply` - repair `production_bom_items.uom_name` for RAW rows by re-syncing each `material_goods_code` to the trade-code unit used by the BOM picker.
- `npm run repair:subplan-shifts -- --apply` - repair missing `shift_code` and `shift_name` fields for historical WIP sub-plans in `production_plan_status` where `shift_id` is set.
- `npm run repair:piece-rate-employee-codes -- --apply` - rewrite historical `production_piece_rate_logs.employee_code` values to match each row's `raw_employee_qr_payload`; use `--doc-no=...` to scope to specific documents first.
- Correct the employee on piece-rate document `20260909029`: `node scripts/stock-fix-sql.mjs scripts/repair-piece-rate-doc-20260909029-employee.sql` previews and rolls back; add `--apply` to update only the verified row with a JSON backup.
- Correct four Sep 17 piece-rate documents from WKB-0066 to WKB-0065: `node scripts/stock-fix-sql.mjs scripts/repair-piece-rate-wkb0066-to-wkb0065-20260917.sql` previews and rolls back; add `--apply` to update their verified receipt movements with a JSON backup.
- Move piece-rate document `20260929036` to the Sep 28 report date without changing its printed document/LOT or stock movement: `node scripts/stock-fix-sql.mjs scripts/repair-piece-rate-20260929036-report-date.sql` previews and rolls back; add `--apply` to back up and apply the scoped correction.
- Correct three Oct 6 piece-rate documents (`20261006068`, `20261006069`, `20261006070`) to `BL0-1109`: `node scripts/stock-fix-sql.mjs scripts/repair-piece-rate-bl01009-to-bl01109-20261006.sql` previews and rolls back; add `--apply` to update the verified rows and linked movements with a JSON backup.
- Combine 43 Oct 12 piece-rate documents from `BL0-5030` and `WKB-0067` into `BL0-5032`: `node scripts/stock-fix-sql.mjs scripts/repair-piece-rate-bl05030-wkb0067-to-bl05032-20261012.sql` previews and rolls back; add `--apply` to update the verified rows and linked movements with a JSON backup.
- Correct Sep 29 Biscuit mixing room subplan WIP from WKB-0050 to WKB-0045 on MP202609004: `node scripts/stock-fix-sql.mjs scripts/repair-biscuit-subplan-wkb0050-to-wkb0045-20260929.sql` previews and rolls back; add `--apply` to update with a JSON backup.
- `npm run repair:attendance-scan-employee-codes -- --apply` - rewrite historical `attendance_scan_events.employee_code` values to match each row's `raw_qr_payload`; use `--request-id=...` to scope to specific events first.
- `npm run import:employee-photos -- --apply` - match files in `public/EMP-Photo` to raw and `KPF-` employee codes, compress them, and upsert employee photos; omit `--apply` for a dry run.
- `npm run repair:stock-product-miscoding -- --from=WKB-0002-2 --to=WKB-0002 --date=YYYY-MM-DD --apply` - repair a misclassified weight-scale product across receipts, stock issues, prison issues, and stock movements; omit `--apply` for a dry run.
- `npm run repair:voided-weight-receipts -- --verify` - verify the scoped WKB-0002 receipt recovery; the script defaults to dry-run and requires `--apply` to restore its exact hard-coded barcode set.
- `npm run repair:replace-wk22080-to-wk22020 -- --apply` - replace WK-22080 (WK-2208) with WK-22020 (WK-2202) across BOM items and routing components; omit `--apply` for a dry run with JSON backup.
- `node scripts/run-production-planning-uat-evidence.mjs` - generate UAT/role/movement acceptance evidence reports (requires env tokens/URLs).
- `node scripts/stock-fix-sql.mjs scripts/apply-excel-inbound-report-reader.sql --apply` - create the restricted Excel inbound report view and reader role.
- `node scripts/stock-fix-sql.mjs scripts/apply-excel-issue-report-reader.sql --apply` - grant the same reader role access to the restricted issue report view.

Gateway (from `kpf-api-gateway/`):
- `npm run dev` - run gateway (same as `npm run start`).
- `npm run start` - run gateway server.

Tests:
- WKB-0053 LOT 2408260053-1 reconciliation: `node scripts/stock-fix-sql.mjs scripts/repair-wkb0053-lot-240826.sql` dry-runs and rolls back; add `--apply` only after review to write with a JSON backup.
- WKB-0054 LOT 2908260054-1 detail-report versus balance audit: `node scripts/stock-fix-sql.mjs scripts/audit-wkb0054-290826-report-vs-balance.sql` (read-only).
- WKB-0053 LOT 2408260053-1 full business-date ledger audit (read-only): `node scripts/stock-fix-sql.mjs scripts/audit-wkb0053-240826-full-ledger.sql`.
- Cumulative stock LOT balance RPC verification (read-only): `node scripts/stock-fix-sql.mjs scripts/verify-stock-lot-balance-cumulative.sql`.
- WKB-0053 Aug 28 return-source issue audit (read-only): `node scripts/stock-fix-sql.mjs scripts/audit-wkb0053-aug28-return-sources.sql`.
- Trace WKB-0053 Aug 28 actual-use discrepancy of 15.370 kg (read-only): `node scripts/stock-fix-sql.mjs scripts/trace-wkb0053-aug28-105871.sql`.
- Correct operator-confirmed false WKB-0053 returns 0147X01/0148X01 and their issue chains: `node scripts/stock-fix-sql.mjs scripts/correct-wkb0053-false-returns-147-148.sql` previews; add `--apply` after review.
- WKB-0053 LOT 2408260053-1 cancelled/restored issue trace: `node scripts/stock-fix-sql.mjs scripts/trace-wkb0053-voided-75164.sql` (read-only).
- WKB-0053 LOT 2408260053-1 full duplicate/cancellation/return audit: `node scripts/stock-fix-sql.mjs scripts/audit-wkb0053-full-history.sql` (read-only).
- WKB-0053 LOT 2408260053-1 Sep 1 opening component reconciliation: `node scripts/stock-fix-sql.mjs scripts/reconcile-wkb0053-sep1-components.sql` (read-only).
- WKB-0053 LOT 2408260053-1 canonical history restatement: `node scripts/stock-fix-sql.mjs scripts/repair-wkb0053-canonical-history.sql` previews; add `--apply` after review.
- Revert only the Sep 9 WKB-0053 restatement: `node scripts/stock-fix-sql.mjs scripts/revert-wkb0053-canonical-history-restatement.sql` previews; add `--apply` after review.
- WKB-0053 LOT 2408260053-1 full 751.64 trace (read-only): `node scripts/stock-fix-sql.mjs scripts/trace-wkb0053-75164.sql`.
- Isolated SQL cancellation guard test (temporary tables, rolls back): `node scripts/test-stock-guard-sql.mjs`.
- Inspect scoped stock fix: `node scripts/stock-fix-sql.mjs scripts/inspect-stock-fix.sql`.
- Apply scoped cancellation guard: `node scripts/stock-fix-sql.mjs scripts/apply-stock-cancellation-guard.sql` (production DDL; inspect first).
- Correct exactly four Sep 4 stock issue dates: `node scripts/stock-fix-sql.mjs scripts/repair-stock-issue-dates-20260904.sql` (production write, transactional backup and preconditions; not rerunnable after success).
- Reallocate WKB-0002-2 LOT 010969 between Sep 4–5 prison issues: `node scripts/stock-fix-sql.mjs scripts/repair-wkb0002-2-lot010969-20260904-05.sql` previews and rolls back; add `--apply` once after review.
- Scoped WKB-0048 Sep 3 return correction: `node scripts/stock-fix-sql.mjs scripts/adjust-wkb0048-return-20260903.sql` dry-runs and rolls back; add `--apply` to record the approved 14.690 kg correction with a JSON backup.
- Replace the scoped WKB-0048 14.690 kg floating correction with a traceable return receipt: `node scripts/stock-fix-sql.mjs scripts/replace-wkb0048-return-correction-with-receipt.sql` previews; add `--apply` once after review.
- WKB-0002 LOT 1908260002-1 return-chain repair: `node scripts/stock-fix-sql.mjs scripts/repair-wkb0002-return-chains.sql` dry-runs and rolls back; add `--apply` once after review. Verify with `node scripts/stock-fix-sql.mjs scripts/verify-wkb0002-return-chain-repair.sql`.
- WKB-0002 LOT 1908260002-1 barcodes 0017/0020 chain inspection: `node scripts/stock-fix-sql.mjs scripts/inspect-wkb0002-17-20-chain.sql` (read-only).
- Verify selected/clicked/cancelled dates for WKB-0002 barcodes 0017/0020: `node scripts/stock-fix-sql.mjs scripts/verify-wkb0002-17-20-selected-dates.sql` (read-only).
- Restore WKB-0002 LOT 1908260002-1 Sep 1 business-date issues: `node scripts/stock-fix-sql.mjs scripts/restore-wkb0002-sep1-business-date-issues.sql` previews; add `--apply` after review.
- WKB-0002 LOT 0207260002-1 return-chain repair: `node scripts/stock-fix-sql.mjs scripts/repair-wkb0002-020726-return-chain.sql` previews; add `--apply` once after review. Verify with `node scripts/stock-fix-sql.mjs scripts/verify-wkb0002-020726-return-chain.sql`.
- Stock issue cancellation child-history guard: `npm run test -- tests/stock-issue-cancellation-guard.test.mjs`.
- Stock issue atomic-date/LOT-guard/audit regression test: `npm run test -- tests/production-stock-consistency-hardening.test.mjs`.
- Historical stock issue live rollback test: `node scripts/stock-fix-sql.mjs scripts/test-historical-stock-issue-date.sql` (creates test rows inside a transaction and always rolls back).
- Receipt idempotency and atomic batch issue rollback test: `node scripts/stock-fix-sql.mjs scripts/test-receipt-idempotency-and-atomic-batch.sql`.
- Historical invalid return-chain audit: `node scripts/stock-fix-sql.mjs scripts/audit-invalid-stock-return-chains.sql` (read-only).
- Scoped WKB-0048 return-chain repair: `node scripts/stock-fix-sql.mjs scripts/repair-wkb0048-return-chains.sql` previews; add `--apply` only after review.
- Trace WKB-0048 barcode 04092600480193 issue/void history (read-only): `node scripts/stock-fix-sql.mjs scripts/trace-wkb0048-barcode-04092600480193.sql`.
- Trace WKB-0048 LOT 0409260048-1 Sep 4 issue/void totals (read-only): `node scripts/stock-fix-sql.mjs scripts/trace-wkb0048-lot-0409260048-1-sep4.sql`.
- Stock issue consistency DDL: `node scripts/stock-fix-sql.mjs scripts/apply-production-stock-issue-consistency.sql` previews; add `--apply` to install and use `scripts/verify-production-stock-issue-consistency.sql` to verify.
- Historical stock status timeline: `node scripts/stock-fix-sql.mjs scripts/apply-stock-status-timeline.sql` previews; add `--apply` to install creation/restoration timestamps used by as-of reports.
- Stable stock history DDL: `node scripts/stock-fix-sql.mjs scripts/apply-production-stock-history-stability.sql` previews; add `--apply` to block ordinary backdating, date reversals on cancellation day, and expose as-of report timestamps.
- Business-date report alignment: `node scripts/stock-fix-sql.mjs supabase/migrations/20260909040744_align_stock_reports_to_business_date.sql` previews; add `--apply` so issue reports and movement reports use selected business dates plus current active status.
- Verify stock business-date alignment: `node scripts/stock-fix-sql.mjs scripts/verify-stock-business-date-alignment.sql` (read-only).
- Cancelled receipt visibility and reprint checks: `npm run test -- tests/scale-receipt-visibility.test.mjs`.
- FG/WIP waste cancellation regression test: `npm run test -- tests/fg-wip-end-of-day.test.mjs`.
- Piece-rate waste category UI test: `npm run test -- tests/piece-rate-waste-category-ui.test.mjs`.
- Requisition export first-version collision regression: `npm run test -- tests/requisition-export-safety.test.mjs`.
- Requisition export non-destructive preflight: `npm run test -- tests/requisition-export-safety.test.mjs`.
- Keep cream-weighing requisitions at the established maximum of two documents (merged normal routes plus RAW split route): `node scripts/stock-fix-sql.mjs scripts/enable-cream-weighing-room-requisition-consolidation.sql` previews and rolls back; add `--apply` to enable only KP13/PRP01 after guarded verification.
- Enable room-level requisition consolidation for Biscuit work center BIS01: `node scripts/stock-fix-sql.mjs scripts/enable-biscuit-room-requisition-consolidation.sql` previews and rolls back; add `--apply` to enable the verified setting.
- Scoped BL0-5009 unit correction: `node scripts/repair-bl05009-pails.mjs` previews; `--apply` corrects only documents 20260828058–20260828060 with a backup and verification.
- Historical wage repricing test: `npm run test -- tests/reprice-piece-rate-history.test.mjs`.
- Historical wage repair: `node scripts/reprice-piece-rate-history.mjs` creates a dry-run backup plan; `node scripts/reprice-piece-rate-history.mjs --apply-plan=<absolute-plan-path>` applies its frozen rates with conflict checks.
- Piece-rate report pail quantity/weight regression test: `npm run test -- tests/piece-rate-report-metrics.test.mjs`.
- App unit tests use Node's built-in test runner via `npm run test`.
- Report center real-route, date-filter, and permission regression test: `npm run test -- tests/production-report-center.test.mjs`.
- Vision schedule import schema, number parsing, alias, SKU/BOM, and shift resolver test: `npm run test -- tests/schedule-vision-import.test.mjs`.
- Single app test: `npm run test -- tests/work-centers.test.mjs`.
- Excel inbound read-only token verifier: `node --test tests/piece-rate-inbound-excel-token.test.mjs`.
- Generate an Excel inbound read-only token and server hash (admin only): `node scripts/create-piece-rate-inbound-excel-token.mjs`.
- Employee photo import test: `npm run test -- tests/import-employee-photos.test.mjs`.
- Piece-rate stock print layout test: `npm run test -- tests/piece-rate-stock-print-layout.test.mjs`.
- Dynamic report pagination test: `npm run test -- tests/paginate-report-items.test.mjs`.
- Piece-rate stock issue A4 test: `npm run test -- tests/piece-rate-stock-issue-a4.test.mjs`.
- BOM table layout regression test: `npm run test -- tests/bom-table-layout.test.mjs`.
- A4 document print standards test: `npm run test -- tests/a4-document-print-standard.test.mjs`.
- Universal report header standard and layout test: `npm run test -- tests/report-header.test.mjs`.
- Universal report filter bar component test: `npm run test -- tests/report-filter-bar.test.mjs`.
- Piece-rate report filter bar print & Excel regression test: `npm run test -- tests/piece-rate-report-filter-bar.test.mjs`.
- Universal report table component test: `npm run test -- tests/report-table.test.mjs`.
- Data refresh and Routing toast regression test: `npm run test -- tests/data-refresh-wiring.test.mjs`.
- Routing completeness pagination regression test: `npm run test -- tests/production-routing-completeness.test.mjs`.
- Planning report master-plan dropdown regression test: `npm run test -- tests/planning-control-center-master-plans.test.mjs`.
- Schedule Inbox PostgREST batching regression test: `npm run test -- tests/schedule-inbox-query-batching.test.mjs`.
- Input/output report regression test: `npm run test -- tests/production-input-output-report.test.mjs`.
- Input/output target-FG visibility, numeric-only quantities, Excel and 1280/1440/1920px report/sidebar overflow regression: `npm run test -- tests/production-report-system.test.mjs`. Legacy issue-summary long-name wrapping: `npm run test -- --test-name-pattern="web issue summary" tests/piece-rate-stock-issue-a4.test.mjs` (isolated browser fixtures; no company database writes).
- KPF issue destination schema verification (read-only): `node scripts/stock-fix-sql.mjs scripts/verify-kpf-issue-target-product.sql`.
- Voided weight-receipt recovery test: `npm run test -- tests/restore-voided-weight-receipts.test.mjs`.
- Stock issue return/actual summary regression test: `npm run test -- tests/production-stock-issue-summary.test.mjs`.
- Stock issue summary A4 portrait browser layout test: `npm run test -- tests/production-stock-issue-portrait.test.mjs`.
- Weight-scale report print audit regression test: `npm run test -- tests/weight-scale-report-print-log.test.mjs`.
- Weight-scale report print audit database check (always rolls back): `node scripts/stock-fix-sql.mjs scripts/verify-weight-scale-report-print-log.sql`.
- Weight-scale lifecycle hardening: `node scripts/stock-fix-sql.mjs scripts/apply-weight-scale-stock-hardening.sql` dry-runs and rolls back; add `--apply` to repair the known duplicate return barcode, restore barcode uniqueness, lock down RPCs, and install atomic receipt cancellation.
- Weight-scale lifecycle hardening verification (read-only): `node scripts/stock-fix-sql.mjs scripts/verify-weight-scale-stock-hardening.sql`.
- Universal live scale station modes and stock integrity guard test: `npm run test -- tests/weight-scale-live-station-modes.test.mjs`.
- Live return/void workflow isolation regression: `npm run test -- tests/weight-scale-live-isolation.test.mjs`.
- Shared compact weighing history table render regression: `npm run test -- tests/weight-scale-history-table.test.mjs`.
- Atomic weight receipt cancellation test (uses a safe live candidate and always rolls back): `node scripts/stock-fix-sql.mjs scripts/test-weight-scale-receipt-cancellation.sql`.
- WKB-0048 LOT 2708260048-1 Sep 2 reconciliation (read-only): `node scripts/stock-fix-sql.mjs scripts/reconcile-wkb0048-20260902.sql`.
- Canonical repaired-chain history (three scoped LOTs, transactional backup): `node scripts/stock-fix-sql.mjs scripts/repair-canonical-stock-history.sql` previews; add `--apply` after review.
- Negative opening audit for Sep 1–4 (read-only): `node scripts/stock-fix-sql.mjs scripts/verify-negative-stock-openings-20260901-04.sql`.
- Production costing math, lot parsing, and yield loss test: `npm run test -- tests/production-costing.test.mjs`.
- FG/WIP LOT single-page layout regression test: `npm run test -- tests/production-costing-layout.test.mjs`.
- Central BOM allocation and LOT reconciliation test: `npm run test -- tests/production-cost-allocation.test.mjs`.
- WKB-0002 LOT 1908260002-1 canonical return history: `node scripts/stock-fix-sql.mjs scripts/repair-wkb0002-190826-canonical-history.sql` previews; add `--apply` after review.
- WKB-0002 LOT 1908260002-1 Sep 4 balance check (read-only): `node scripts/stock-fix-sql.mjs scripts/verify-wkb0002-190826-sep4.sql`.
- WKB-0002 LOT 1908260002-1 remaining-barcode trace at Sep 3 close (read-only): `node scripts/stock-fix-sql.mjs scripts/trace-wkb0002-190826-remaining-20260903.sql`.
- WKB-0002 LOT 1908260002-1 Sep 1–4 item trace (read-only): `node scripts/stock-fix-sql.mjs scripts/trace-wkb0002-190826-sep4-items.sql`.
- Stock balance multi-LOT filter regression test: `npm run test -- tests/production-stock-balance-lot-filter.test.mjs`.
- Raw-material LOT warehouse filter regression test: `npm run test -- tests/raw-materials-lot-warehouses.test.mjs`.
- Raw-material readable unit conversion regression test: `npm run test -- tests/inventory-unit-display.test.mjs`.
- Piece-rate daily movement grouping regression test: `npm run test -- tests/piece-rate-movement-daily.test.mjs`.
- Piece-rate wage visibility permission regression test: `npm run test -- tests/piece-rate-money-permission.test.mjs`.
- Piece-rate selected work-date regression test: `npm run test -- tests/piece-rate-work-date.test.mjs`.
- Departmental WIP auto-BOM regression test: `npm run test -- tests/qa-subplan-workbench-auto-bom.test.mjs`.
- Piece-rate employee summary modal test: `npm run test -- tests/piece-rate-employee-summary-modal.test.mjs`.
- Production receipts tab and gateway query regression test: `npm run test -- tests/production-receipts-tab.test.mjs`.
- Multi-tab architecture (1 tab per page, scroll persistence, unsaved guard) test: `npm run test -- tests/app-tabs-shell.test.mjs`.
- AI Assistant RBAC security and knowledge tool test: `npm run test -- tests/ai-assistant-security.test.mjs`.
- Departmental WIP plan draft fast loading & no SSR loopback test: `npm run test -- tests/wip-plan-draft-fast.test.mjs`.
- Gateway date parsing regression test: `node --test tests/gateway-date-param.test.mjs`.
- Gateway tests are not configured.

## Formatting & Linting Style
- JavaScript is the default (ESM in Next.js, CommonJS in gateway).
- 2-space indentation, semicolons, and double quotes.
- ESLint config lives in `eslint.config.mjs` and extends Next.js core-web-vitals.
- No Prettier config in repo; follow existing formatting in files you touch.

## Imports & Module Boundaries
- Prefer absolute imports via `@/` (configured in `jsconfig.json`).
- Group imports: external packages first, then internal `@/` paths.
- Keep server-only code in `src/lib` and use `import "server-only"` when needed.
- Client components must include `"use client"` at the top.

## Naming Conventions
- React components: PascalCase (`SettingsPageClient`).
- Hooks: `useX` prefix (`useSuppliersPage`).
- Services/clients: camelCase or noun-based (`skuMinMaxService.js`).
- Route filenames must be `page.js`, `layout.js`, `route.js`.

## Types & Data Shapes
- The app is primarily JavaScript; only `src/types/supabase.ts` is TypeScript.
- Never edit `src/types/supabase.ts` directly; regenerate via `npm run gen:types`.
- Use explicit parsing helpers for URL/search params (see `src/lib/validation.js`).

## Error Handling & API Responses
- Server API routes typically wrap logic in try/catch and use `jsonError`.
- Use `ApiError` for structured status/details (`src/lib/adminApi.js`).
- Prefer `ok`, `fail`, and `toJsonResponse` helpers from `src/lib/result.js`.
- Return `Response.json(...)` in Next.js routes; include `status` when needed.
- For gateway, return `res.status(code).json({ error, details })` on failures.

## Data Fetching & Caching
- App routes may use `unstable_cache` for gateway-backed data.
- Use `cache: "no-store"` when responses must not be cached.
- Ensure gateway URLs and API keys are read from env (`KPF_GATEWAY_URL`, `KPF_API_KEY`).

## Environment & Secrets
- Root app expects `.env.local` (see `.env.local.example` if present).
- Gateway expects its own env (`kpf-api-gateway/.env` or `.env.local`).
- Never commit secrets; do not log credentials in app code.

## UI & Styling
- Tailwind CSS is configured (`tailwind.config.mjs`).
- Global styles live in `src/app/globals.css` and are imported in `src/app/layout.js`.
- Use existing typography and color tokens; keep Thai locale defaults intact.

## Gateway Conventions (kpf-api-gateway)
- CommonJS `require(...)` style, not ESM.
- Express middleware for auth (`requireAuth`) and CORS handling is custom.
- SQL queries are in template literals; prefer parameterized inputs via `request.input`.
- Cursor-based pagination uses base64url JSON encoding helpers in `server.js`.

## Files to Treat as Generated or Sensitive
- `src/types/supabase.ts`: generated; do not edit.
- `supabase/migrations/`: database migrations; avoid rewriting history.
- `profiling-data.*.json`: profiling output; avoid committing.

## Project Structure Notes
- App uses Next.js App Router and middleware at `middleware.js`.
- Auth is enforced in middleware except for `/login` and `/unauthorized`.
- Admin APIs use Supabase service role via `getSupabaseAdmin`.

## Cursor / Copilot Rules
- No `.cursorrules` or `.cursor/rules/` found.
- No `.github/copilot-instructions.md` found.

## When Adding New Scripts or Tests
- Update this file with new commands and single-test instructions.
- Keep scripts consistent between root app and gateway when feasible.

## Housekeeping for Agents
- Vision matching preselects the highest-ranked eligible SKU/formula (single candidate always selected; empty only with no eligible candidates), preserving strict scope/BOM guards, explicit manual alias confirmations and legacy-alias isolation: `node --test tests/schedule-vision-import.test.mjs tests/schedule-import-scope.test.mjs tests/schedule-import-alias-confirmation.test.mjs`. Automatic suggestions never teach aliases; no hard-coded ABC/AEC SKU mapping.
- Section Import scope settings, per-department category validation, fail-closed matching and alias guards: `node --test tests/schedule-import-scope.test.mjs tests/schedule-vision-import.test.mjs`. Uses existing `system_settings`; configure each Section in `/admin/schedule-config` before importing products. No BOM/Routing or existing plan migration.
- Vision PDF/image import biscuit section shift-one/header-time resolution, department-product scope, per-row jam brand/WIP and blueberry-BOM guards, wafer family/flavor/explicit gram-size matching, stale-alias guards, empty mappings, mapping failures, pagination and preserved global catalog: `npm run test -- tests/schedule-vision-import.test.mjs`.
- Expanded-permission login cookie size and session round-trip: `npm run test -- tests/session-cookie-size.test.mjs tests/session-refresh-policy.test.mjs tests/permission-fresh-guard.test.mjs`.
- Old/new packing service integration against disposable localhost PostgreSQL only: `npm run test -- tests/packing-real-service.test.mjs`. Never point the test adapter at the company database.
- Packing legacy cutover audit (read-only): `node scripts/stock-fix-sql.mjs scripts/audit-packing-legacy-readiness.sql`. Do not enable `PACKING_WORKSPACE_ENABLED` before reconciling old balances and verifying the cutover.
- Shared old/new packing pail ledger, rollback, replay and concurrent issue tests (disposable local PostgreSQL): `npm run test -- tests/packing-workspace-postgres.test.mjs tests/packing-workspace-service.test.mjs tests/packing-history.test.mjs`. `scripts/install-packing-workspace.sql` is user-run only; KP13 pails stay in the original ledger, with new closing receipts linked to their packing document. Never copy the 94 legacy pails into new stock or enable writes before verification.
- White report body backgrounds across central and embedded reports: `npm run test -- tests/report-content-white.test.mjs tests/labor-comparison-colors.test.mjs`.
- Report-center, embedded report and print-document unified Noto Sans Thai Looped font: `npm run test -- tests/report-center-font.test.mjs`.
- Employee wage comparison signed percentages and scoped red/green report cells: `npm run test -- tests/labor-comparison-colors.test.mjs`.
- Planning adjustment configured-shift and released-preview regression: `npm run test -- tests/planning-adjustment-report.test.mjs tests/planning-release.test.mjs`.
- Central multi-unit WIP opening input, pending recovery, authorization, compact panel and disposable PostgreSQL race tests: `npm run test -- tests/wip-opening-input.test.mjs tests/wip-opening-service.test.mjs tests/wip-opening-panel.test.mjs tests/wip-opening-postgres.test.mjs`. SQL Editor install (user-run only): `scripts/install-wip-opening-central.sql`; registers permissions without granting roles and does not migrate legacy tin openings.
- Planning release revision regression: `npm run test -- tests/planning-release.test.mjs`.
- Planning release isolation: `node scripts/stock-fix-sql.mjs scripts/apply-planning-release-isolation.sql` previews and tests publication/confirmation lifecycle inside a rolled-back transaction; add `--apply` to install release snapshots without changing plan quantities or BOM.
- WKB-0064 Oct 8 test waste: `node scripts/stock-fix-sql.mjs scripts/inspect-wkb0064-test-waste-20261008.sql` inspects; `node scripts/stock-fix-sql.mjs scripts/cancel-wkb0064-test-waste-20261008.sql` previews cancellation; add `--apply` to back up and cancel the verified 16.820 kg test row.
- Jam report center receipt, issue, movement, balance and prison parity test: `npm run test -- tests/jam-report-center.test.mjs`.
- Keep changes minimal and scoped; avoid refactors unless requested.
- Correct the 14 WKB-0050 LOT 0610260050-1 issue labels totaling 160.680 kg from Oct 15 to Oct 14: `node scripts/stock-fix-sql.mjs scripts/repair-wkb0050-061026-date-20261015-to-14.sql` previews and rolls back; add `--apply` to back up and apply.
- Correct the M04-0088 LOT 261007 jam usage of 430 kg from Oct 15 to Oct 14: `node scripts/stock-fix-sql.mjs scripts/repair-jam-m040088-261007-date-20261015-to-14.sql` previews and rolls back; add `--apply` to back up and apply.
- Match existing code style in each file; do not reformat unrelated code.
- Prefer small, composable helpers in `src/lib/` when adding shared behavior.
`node scripts/stock-fix-sql.mjs scripts/restore-requisition-room-consolidation.sql` previews restoring product/size columns outside BIS01/PRP01; add `--apply` to apply. `node scripts/stock-fix-sql.mjs scripts/audit-requisition-room-bom-20261013.sql` audits the Oct 13 WIP snapshot demand read-only.
`node scripts/stock-fix-sql.mjs scripts/audit-costing-wkb0048-090926.sql` - read-only LOT receipt/schema/issue audit (requires database network access).
`node scripts/stock-fix-sql.mjs scripts/repair-piece-rate-20260922080-product.sql` - preview product-only correction for document 20260922080; add `--apply` to back up and apply. Verify with `node scripts/stock-fix-sql.mjs scripts/inspect-piece-rate-20260922080.sql` (read-only).
`node scripts/stock-fix-sql.mjs scripts/repair-piece-rate-20260929027-product.sql` - preview correcting document 20260929027 from BL0-5001 to B03-0003 while preserving employee, time, quantity, weight, and wage; add `--apply` to back up and apply.
`node scripts/stock-fix-sql.mjs scripts/add-missing-piece-rate-scans-20260929.sql` - preview adding one audited 5.000 kg B03-0003 scan each for KPF-01710. and 02051 on Sep 29 through the normal document counter, safe insert, and receipt trigger; add `--apply` to back up and apply.
`node scripts/stock-fix-sql.mjs scripts/repair-b030003-report-date-20260928-to-29.sql` - preview moving the 67 B03-0003 LOT 2909260003-1 receipts selected as Sep 28 to their physical Sep 29 business date; add `--apply` to back up and update the linked receipt movements.
`node scripts/stock-fix-sql.mjs scripts/repair-b030003-lot-280926-report-date-to-20260929.sql` - preview moving all 81 B03-0003 LOT 2809260003-1 receipts and linked stock movements from Sep 28 to Sep 29 while preserving the original physical capture timestamp; add `--apply` to back up and apply.
`node scripts/stock-fix-sql.mjs scripts/repair-piece-rate-20260929036-stock-date-to-20260928.sql` - preview syncing the linked BL0-1104 receipt movement for document 20260929036 from Sep 29 to its corrected Sep 28 report date; add `--apply` to back up and apply.
`node scripts/stock-fix-sql.mjs scripts/map-biscuit-requisitions-20260928.sql` - preview mapping the seven confirmed historical ERP requisition numbers to biscuit shift 1 rooms on Sep 28 without treating them as reusable app exports; add `--apply` to apply.
`node scripts/stock-fix-sql.mjs scripts/repair-biscuit-requisition-0588-parent.sql` - preview correcting the Sep 28 cracker-room mapping for X6909/0588 from the mistakenly added B01-1008 to the original B06-0006; add `--apply` to back up and apply.
`node scripts/stock-fix-sql.mjs scripts/repair-biscuit-requisition-0590-parent.sql` - preview correcting the Sep 28 cookie-room mapping for X6909/0590 from the mistakenly added B01-1013 to the original BL0-1106; add `--apply` to back up and apply.
`node scripts/stock-fix-sql.mjs scripts/repair-piece-rate-size-l-september-2026.sql` - preview repricing the 71 active September 2026 `บรรจุปี๊บSize L` scans from 2.50 to 2.00 baht/kg using whole kilograms; add `--apply` to back up and apply.
`node scripts/stock-fix-sql.mjs scripts/verify-piece-rate-size-l-september-2026.sql` - read-only verification that the scoped September repricing has 71 corrected rows, no remaining 2.50 rate, unchanged physical kilograms, and the expected wage total.
`node scripts/stock-fix-sql.mjs scripts/repair-wkb0002-2-selected-as-shell-20260925.sql` - preview correcting the five 63.850 kg Sep 25 receipts selected as WKB-0002-2 and their Sep 28 issue chain to WKB-0002; add `--apply` to back up and apply.
`node scripts/stock-fix-sql.mjs scripts/verify-wkb0002-shell-correction-20260925.sql` - read-only verification of the corrected receipt, issue, movement, and LOT totals.
`node scripts/stock-fix-sql.mjs scripts/cancel-piece-rate-prison-issues-prw-260929-36-37.sql` - preview cancelling the two confirmed PRW issue lines as one audited correction; add `--apply` to back up and apply.
`node scripts/stock-fix-sql.mjs scripts/reclassify-sep28-wkb0045-wkb0048-to-packing400.sql` - preview moving the confirmed Sep 28 WKB-0045/1509260045-1 and WKB-0048/2409260048-1 issues to room 400; add `--apply` to back up and apply.
`node scripts/stock-fix-sql.mjs scripts/cancel-jam-usage-800kg-20260928.sql` - preview voiding only the duplicate 800 kg M04-0088 LOT 260924 jam usage for Sep 28 while retaining the confirmed 770 kg entry; add `--apply` to back up and apply.
`node scripts/stock-fix-sql.mjs scripts/cancel-jam-usage-140kg-20261008.sql` - preview voiding only the rejected 140 kg PJST3 usage for Oct 8 while retaining the confirmed 610 kg entry; add `--apply` to back up and apply.
`node scripts/stock-fix-sql.mjs scripts/correct-jam-usage-pjst3-140kg-20261008.sql` - preview restoring the corrected 140 kg PJST3 usage for Oct 8 and voiding the mistaken 610 kg entry; add `--apply` to back up and apply.
`node scripts/stock-fix-sql.mjs scripts/cancel-jam-usage-760kg-20261010.sql` - preview voiding only the rejected 760 kg M04-0088 usage for Oct 10 while retaining the confirmed 680 kg entry; add `--apply` to back up and apply.
`node scripts/stock-fix-sql.mjs scripts/add-bl01104-label-scrap-7240-20260928.sql` - preview adding the operator-confirmed 7.240 kg label scrap for BL0-1104 on Sep 28 from the matching production snapshot; add `--apply` to back up and apply.
`node scripts/stock-fix-sql.mjs scripts/map-biscuit-requisitions-20261005.sql` - preview mapping the five confirmed historical ERP requisition numbers to biscuit shift 1 rooms on Oct 5 under MP202610001; add `--apply` to apply.
`node scripts/stock-fix-sql.mjs scripts/repair-piece-rate-b060006-to-bl01009-20261006.sql` - preview correcting the three Oct 6 piece-rate documents (20261006068, 20261006069, 20261006070) from B06-0006 to BL0-1009 and barcode 8859771700815; add `--apply` to back up and apply.
`node scripts/stock-fix-sql.mjs scripts/repair-piece-rate-bl01009-to-bl01109-20261006.sql` - preview correcting the three Oct 6 piece-rate documents (20261006068, 20261006069, 20261006070) to BL0-1109 and barcode 8859771701362; add `--apply` to back up and apply.
`node scripts/stock-fix-sql.mjs scripts/repair-oct5-wkb0002-miscoded-receipts.sql` - preview correcting the eight confirmed Oct 5 issue-source receipts selected as WKB-0002-2/WKB-0069 to WKB-0002 while preserving physical barcodes, weights, dates, and statuses; add `--apply` to back up and apply.
`node scripts/stock-fix-sql.mjs scripts/repair-wkb0050-return-chain-010926.sql` - preview repairing the audited WKB-0050 LOT 0109260050-1 return chain that suppressed 4.200 kg of valid stock; add `--apply` to back up and apply.
`node scripts/stock-fix-sql.mjs scripts/cancel-wkb0050-oct5-created-oct8-three-labels.sql` - preview cancelling the three confirmed WKB-0050 LOT 2509260050-1 issues selected for Oct 5 and submitted on Oct 8; add `--apply` to back up and apply.
- Compact AI assistant launcher regression test: `npm run test -- tests/ai-assistant-launcher.test.mjs`.
- BOM estimate measured pagination and unit-column layout regression test: `npm run test -- tests/material-cost-estimate-pagination.test.mjs`.
- Shared navy surface color and unchanged text/print fallback test: `npm run test -- tests/navy-surface-theme.test.mjs`.
- Shared two-level task navigation test: `npm run test -- tests/grouped-page-navigation.test.mjs`.
- Central department product hotkey regression: `npm run test -- tests/department-product-hotkeys.test.mjs tests/product-hotkeys.test.mjs`.
- Isolated live stock issue/cancellation guards: `npm run test -- tests/weight-scale-live-issues.test.mjs`.
- Live workflow detachment / fail-closed regression: `npm run test -- tests/weight-scale-live-detachment.test.mjs`. Legacy live issue/isolation tests describe the superseded shared-stock implementation.
- Staged central LOT/barcode contract: `npm run test -- tests/scale-numbering.test.mjs`; rollout gates: `docs/scale-numbering-rollout.md`.
- Central scale numbering read-only audit: `node scripts/stock-fix-sql.mjs scripts/audit-central-scale-numbering.sql`; safety regression: `npm run test -- tests/central-scale-numbering-audit.test.mjs`.
- Central explicit product identifier validation: `npm run test -- tests/scale-product-identifiers.test.mjs`.
- Full Data API product/receipt barcode audit: `node scripts/audit-scale-product-identifiers.mjs` (read-only database, saves local JSON evidence); regression: `npm run test -- tests/scale-product-identifiers-audit.test.mjs`.
- Central numbering PostgreSQL integration (creates an isolated temporary local cluster, never uses company DB): `node --test tests/central-scale-numbering-postgres.test.mjs` (requires initdb/pg_ctl/psql).
- Staged central numbering SQL: `node scripts/stock-fix-sql.mjs scripts/apply-central-scale-numbering.sql` previews and rolls back; do not use `--apply` until mapping/coexistence and atomic stock receipt gates pass.
- Install central department hotkeys: `node scripts/stock-fix-sql.mjs scripts/apply-department-product-hotkeys.sql` previews and rolls back; add `--apply` after reviewing.
- Shared product picker hotkey validation, station/department scope and typing guards: `npm run test -- tests/product-hotkeys.test.mjs`.

- Jam output allocation service and explicit report weights: `npm run test -- tests/jam-output-allocation.test.mjs tests/production-input-output-report.test.mjs`. SQL Editor install (table owner required): `scripts/install-jam-output-allocation.sql`; command-line preview: `node scripts/stock-fix-sql.mjs scripts/apply-jam-output-allocation.sql` (requires owner privileges; not installed in company DB).

- Jam output allocation service/report regression: `npm run test -- tests/jam-output-allocation.test.mjs tests/production-input-output-report.test.mjs`. SQL Editor installer (table owner required, not installed): `scripts/install-jam-output-allocation.sql`. Isolated SQL validation with temporary objects and rollback: `node scripts/stock-fix-sql.mjs scripts/test-jam-output-allocation.sql`.

- Jam usage cancellation and legacy/explicit allocation with cancelled-ERP suppression: `npm run test -- tests/jam-output-allocation.test.mjs tests/production-input-output-report.test.mjs`. Cancellation retains rows, records voided_by/voided_at and uses existing production-jam-usage-write authorization.
