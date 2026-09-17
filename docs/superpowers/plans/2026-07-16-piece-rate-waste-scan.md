# Piece-Rate Waste Scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new “ชั่งของเสีย” mode inside the piece-rate scanner that reuses the existing product scan and Sunmi realtime scale behavior, skips employee scanning, and stores independent waste logs that never affect wages or stock.

**Architecture:** Extend the existing mode state machine with a `waste` branch. Reuse the current piece-rate product lookup/cache path, then render a lazily loaded waste form that talks to the same Android scale bridge and stable-read commands as the current piece-rate form. Persist through a permission-protected Next.js Route Handler into a new RLS-enabled Supabase table using server-side product re-resolution and a unique request id.

**Tech Stack:** Next.js 16 App Router, React 19 client components, Supabase/Postgres, Node test runner, Tailwind CSS, Android/Sunmi scale bridge.

## Global Constraints

- Do not call or modify the existing `/production-line/weight-scale/waste` stock-waste flow.
- Do not write waste rows to `production_piece_rate_logs` or calculate wages.
- Product scanning and lookup must match the piece-rate scanner, including keyboard scanner, camera scanner, and cached master data.
- Realtime scale preview and stable capture must use `sunmiScaleClient` with the same serial configuration and stable-read behavior as `PieceRateWorkForm`.
- The operator explicitly presses save; do not auto-save stable readings.
- Keep the initial mode picker fast by lazy-loading the new waste form only after the mode is selected.
- The new table is server-only through the existing protected API; enable RLS and revoke direct `anon`/`authenticated` access.

---

### Task 1: Database contract and idempotent persistence

**Files:**
- Create: `supabase/migrations/<generated>_add_piece_rate_waste_logs.sql`
- Create: `tests/piece-rate-waste-migration.test.mjs`

**Interfaces:**
- Produces table `public.production_piece_rate_waste_logs` with unique `request_id`, positive `waste_weight_kg`, product snapshots, machine/scale audit metadata, operator identity, actual weighed time, status, and reporting indexes.

- [ ] Write a migration source regression test that requires the table, constraints, RLS, explicit privileges, unique request id, and active date/product indexes.
- [ ] Run the focused test and confirm it fails because the migration does not exist.
- [ ] Generate the migration with `supabase migration new add_piece_rate_waste_logs`.
- [ ] Implement the schema with `uuid`, `numeric(12,3)`, `timestamptz`, `jsonb`, check constraints, RLS, explicit revokes/grants, and partial composite indexes.
- [ ] Run the focused test and confirm it passes.

### Task 2: Protected waste-log API

**Files:**
- Create: `src/features/attendance/services/pieceRateWasteService.js`
- Create: `src/features/attendance/services/pieceRateWasteClient.js`
- Create: `src/app/api/attendance/piece-rate/waste/route.js`
- Modify: `src/features/attendance/services/pieceRateWorkService.js`
- Create: `tests/piece-rate-waste-api.test.mjs`

**Interfaces:**
- Consumes `resolvePieceRateProductByBarcode(supabaseAdmin, barcode)` exported from the existing service.
- Produces `createPieceRateWasteLog(request, body)` and client `submitPieceRateWasteLog(payload)`.

- [ ] Write source and unit contract tests for permission enforcement, positive finite weight, machine code normalization, server-side product re-resolution, unique-request duplicate handling, and no reference to wage or stock-waste tables.
- [ ] Run the focused tests and confirm they fail because the service and route are absent.
- [ ] Export the existing product resolver without changing its behavior.
- [ ] Implement server validation, product snapshots, `scaleAudit` metadata, actual weighed timestamp, insert, and unique-request duplicate recovery.
- [ ] Add a no-store client POST wrapper and permission-protected Node.js Route Handler.
- [ ] Run focused tests and confirm they pass.

### Task 3: Waste mode state-machine branch

**Files:**
- Modify: `src/app/production-line/attendance/piece-rate-scan/PieceRateScanPageClient.js`
- Create: `tests/piece-rate-waste-flow.test.mjs`

**Interfaces:**
- Adds scan mode `waste` and renders `PieceRateWasteForm` with `{ productLookup, productScanValue, onNextAssignment, onResetAll }`.

- [ ] Write a regression test requiring the third mode card, `waste` branch, direct product-to-form transition, no employee requirement, and dynamic import.
- [ ] Run the focused test and confirm it fails because the mode is absent.
- [ ] Add the third card and mode label.
- [ ] Reuse both cached and online product lookup branches, transitioning directly to `form` in waste mode.
- [ ] Reset to product scan after each successful waste entry.
- [ ] Lazy-load `PieceRateWasteForm` so the initial picker bundle does not eagerly execute scale-form code.
- [ ] Run the focused test and confirm it passes.

### Task 4: Realtime Sunmi waste scale form

**Files:**
- Create: `src/app/production-line/attendance/piece-rate-scan/PieceRateWasteForm.js`
- Modify: `tests/piece-rate-waste-flow.test.mjs`

**Interfaces:**
- Consumes the resolved product and `submitPieceRateWasteLog`.
- Uses `startScalePreview`, scale status/weight events, `readStableScaleWeight`, `stopScalePreview`, and `disconnectScale`.

- [ ] Extend the failing test to require the exact scale bridge commands/config, realtime event listeners, stable capture, submit lock, explicit save button, and absence of employee/wage fields.
- [ ] Run the focused test and confirm it fails because the form is absent.
- [ ] Implement the realtime display using the same 9600/8/N/1, `SI` preview, `S` stable command, 450 ms preview, and 2500 ms stable timeout configuration.
- [ ] On save, use the already stable device value or request a stable value; reject zero/invalid results and prevent concurrent submissions.
- [ ] Submit product barcode, weight, machine code, raw barcode, and scale audit; show success and return to product scan.
- [ ] Keep the UI responsive and avoid timers/polling beyond the native scale event stream.
- [ ] Run focused tests and confirm they pass.

### Task 5: Verification

**Files:**
- Verify all files above.

- [ ] Run `npm run test -- tests/piece-rate-waste-migration.test.mjs tests/piece-rate-waste-api.test.mjs tests/piece-rate-waste-flow.test.mjs`.
- [ ] Run relevant existing piece-rate duplicate/submit-lock tests.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Review the final requirements: new flow only, same scan and scale behavior, no employee, no wage impact, no stock-waste dependency, explicit save, fast lazy loading.

