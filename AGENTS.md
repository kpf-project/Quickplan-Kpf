# Repository Guidelines for Agentic Work

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
- `npm run repair:attendance-scan-employee-codes -- --apply` - rewrite historical `attendance_scan_events.employee_code` values to match each row's `raw_qr_payload`; use `--request-id=...` to scope to specific events first.
- `npm run import:employee-photos -- --apply` - match files in `public/EMP-Photo` to raw and `KPF-` employee codes, compress them, and upsert employee photos; omit `--apply` for a dry run.
- `npm run repair:stock-product-miscoding -- --from=WKB-0002-2 --to=WKB-0002 --date=YYYY-MM-DD --apply` - repair a misclassified weight-scale product across receipts, stock issues, prison issues, and stock movements; omit `--apply` for a dry run.
- `npm run repair:voided-weight-receipts -- --verify` - verify the scoped WKB-0002 receipt recovery; the script defaults to dry-run and requires `--apply` to restore its exact hard-coded barcode set.
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
- Scoped BL0-5009 unit correction: `node scripts/repair-bl05009-pails.mjs` previews; `--apply` corrects only documents 20260828058–20260828060 with a backup and verification.
- Historical wage repricing test: `npm run test -- tests/reprice-piece-rate-history.test.mjs`.
- Historical wage repair: `node scripts/reprice-piece-rate-history.mjs` creates a dry-run backup plan; `node scripts/reprice-piece-rate-history.mjs --apply-plan=<absolute-plan-path>` applies its frozen rates with conflict checks.
- Piece-rate report pail quantity/weight regression test: `npm run test -- tests/piece-rate-report-metrics.test.mjs`.
- App unit tests use Node's built-in test runner via `npm run test`.
- Single app test: `npm run test -- tests/work-centers.test.mjs`.
- Excel inbound read-only token verifier: `node --test tests/piece-rate-inbound-excel-token.test.mjs`.
- Generate an Excel inbound read-only token and server hash (admin only): `node scripts/create-piece-rate-inbound-excel-token.mjs`.
- Employee photo import test: `npm run test -- tests/import-employee-photos.test.mjs`.
- Piece-rate stock print layout test: `npm run test -- tests/piece-rate-stock-print-layout.test.mjs`.
- Dynamic report pagination test: `npm run test -- tests/paginate-report-items.test.mjs`.
- Piece-rate stock issue A4 test: `npm run test -- tests/piece-rate-stock-issue-a4.test.mjs`.
- BOM table layout regression test: `npm run test -- tests/bom-table-layout.test.mjs`.
- Data refresh and Routing toast regression test: `npm run test -- tests/data-refresh-wiring.test.mjs`.
- Routing completeness pagination regression test: `npm run test -- tests/production-routing-completeness.test.mjs`.
- Planning report master-plan dropdown regression test: `npm run test -- tests/planning-control-center-master-plans.test.mjs`.
- Schedule Inbox PostgREST batching regression test: `npm run test -- tests/schedule-inbox-query-batching.test.mjs`.
- Input/output report regression test: `npm run test -- tests/production-input-output-report.test.mjs`.
- Voided weight-receipt recovery test: `npm run test -- tests/restore-voided-weight-receipts.test.mjs`.
- Stock issue return/actual summary regression test: `npm run test -- tests/production-stock-issue-summary.test.mjs`.
- Weight-scale report print audit regression test: `npm run test -- tests/weight-scale-report-print-log.test.mjs`.
- Weight-scale report print audit database check (always rolls back): `node scripts/stock-fix-sql.mjs scripts/verify-weight-scale-report-print-log.sql`.
- Weight-scale lifecycle hardening: `node scripts/stock-fix-sql.mjs scripts/apply-weight-scale-stock-hardening.sql` dry-runs and rolls back; add `--apply` to repair the known duplicate return barcode, restore barcode uniqueness, lock down RPCs, and install atomic receipt cancellation.
- Weight-scale lifecycle hardening verification (read-only): `node scripts/stock-fix-sql.mjs scripts/verify-weight-scale-stock-hardening.sql`.
- Atomic weight receipt cancellation test (uses a safe live candidate and always rolls back): `node scripts/stock-fix-sql.mjs scripts/test-weight-scale-receipt-cancellation.sql`.
- WKB-0048 LOT 2708260048-1 Sep 2 reconciliation (read-only): `node scripts/stock-fix-sql.mjs scripts/reconcile-wkb0048-20260902.sql`.
- Canonical repaired-chain history (three scoped LOTs, transactional backup): `node scripts/stock-fix-sql.mjs scripts/repair-canonical-stock-history.sql` previews; add `--apply` after review.
- Negative opening audit for Sep 1–4 (read-only): `node scripts/stock-fix-sql.mjs scripts/verify-negative-stock-openings-20260901-04.sql`.
- WKB-0002 LOT 1908260002-1 canonical return history: `node scripts/stock-fix-sql.mjs scripts/repair-wkb0002-190826-canonical-history.sql` previews; add `--apply` after review.
- WKB-0002 LOT 1908260002-1 Sep 4 balance check (read-only): `node scripts/stock-fix-sql.mjs scripts/verify-wkb0002-190826-sep4.sql`.
- WKB-0002 LOT 1908260002-1 remaining-barcode trace at Sep 3 close (read-only): `node scripts/stock-fix-sql.mjs scripts/trace-wkb0002-190826-remaining-20260903.sql`.
- WKB-0002 LOT 1908260002-1 Sep 1–4 item trace (read-only): `node scripts/stock-fix-sql.mjs scripts/trace-wkb0002-190826-sep4-items.sql`.
- Stock balance multi-LOT filter regression test: `npm run test -- tests/production-stock-balance-lot-filter.test.mjs`.
- Raw-material LOT warehouse filter regression test: `npm run test -- tests/raw-materials-lot-warehouses.test.mjs`.
- Raw-material readable unit conversion regression test: `npm run test -- tests/inventory-unit-display.test.mjs`.
- Piece-rate daily movement grouping regression test: `npm run test -- tests/piece-rate-movement-daily.test.mjs`.
- Departmental WIP auto-BOM regression test: `npm run test -- tests/qa-subplan-workbench-auto-bom.test.mjs`.
- Piece-rate employee summary modal test: `npm run test -- tests/piece-rate-employee-summary-modal.test.mjs`.
- Production receipts tab and gateway query regression test: `npm run test -- tests/production-receipts-tab.test.mjs`.
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
- Keep changes minimal and scoped; avoid refactors unless requested.
- Match existing code style in each file; do not reformat unrelated code.
- Prefer small, composable helpers in `src/lib/` when adding shared behavior.
