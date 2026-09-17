# Stock Return Source Tare Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pre-fill stock-return tare from the original inbound receipt, allow editing, and persist gross/tare/net accurately.

**Architecture:** Extend the existing issued-barcode lookup with source receipt tare. Keep gross-to-net calculation in a small pure helper used by the return client, validate again in the server service, and extend the existing transactional Postgres RPC so the receipt and net stock movement remain atomic.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase PostgreSQL RPC, Node test runner.

## Global Constraints

- Modify only the product stock-return flow.
- Do not change inbound weighing, waste weighing, issuing, reports, or printer transport behavior.
- Stock movement weight remains net weight.

---

### Task 1: Define return weight calculation and source tare contract

**Files:**
- Create: `src/features/production-line/services/stockReturnWeight.js`
- Modify: `src/lib/production-stock-returns.js`
- Test: `tests/stock-return-tare.test.mjs`

**Interfaces:**
- Produces: `calculateStockReturnWeights({ grossWeightKg, tareWeightKg })` returning normalized gross, tare, net, and validity.
- Produces: `findIssuedItemByBarcode()` payload field `sourceTareWeightKg`.

- [ ] Write failing tests for gross 14.88 minus tare 2.8 equals net 12.08, invalid tare, and source lookup contract.
- [ ] Run `npm run test -- tests/stock-return-tare.test.mjs` and confirm failure because the helper/contract is missing.
- [ ] Implement the helper and load `tare_weight_kg` from the source receipt already identified by `source_receipt_id`.
- [ ] Re-run the focused test and confirm it passes.

### Task 2: Apply editable source tare to return UI and API

**Files:**
- Modify: `src/features/production-line/components/WeightScaleReturnPageClient.js`
- Modify: `src/app/api/production-stock/returns/route.js`
- Modify: `src/lib/production-stock-returns.js`
- Test: `tests/stock-return-tare.test.mjs`
- Test: `tests/weight-scale-return-realtime-print.test.mjs`

**Interfaces:**
- Consumes: `calculateStockReturnWeights({ grossWeightKg, tareWeightKg })`.
- Produces: POST body `{ sourceBarcode, grossWeightKg, tareWeightKg, tareSource }`.

- [ ] Add failing source-contract tests for editable tare pre-fill, net display, and gross/tare submission.
- [ ] Run focused tests and confirm the new assertions fail.
- [ ] Add return-only tare state, reset it from validated source data, calculate net, and keep existing stable gross detection.
- [ ] Validate/recompute weights in `createStockReturn` and pass gross, tare, and tare source to the RPC.
- [ ] Re-run both return test files and confirm they pass.

### Task 3: Persist return gross, tare, and net atomically

**Files:**
- Create: `supabase/migrations/<generated>_add_stock_return_tare.sql`
- Test: `tests/stock-return-tare.test.mjs`

**Interfaces:**
- Produces RPC parameters `p_gross_weight_kg`, `p_tare_weight_kg`, and `p_tare_source` while retaining existing source barcode, actor, and remark inputs.
- Returns persisted `grossWeightKg`, `tareWeightKg`, and `netWeightKg`.

- [ ] Generate the migration with `supabase migration new add_stock_return_tare`.
- [ ] Add failing migration contract assertions for gross/tare persistence and net-only movement weight.
- [ ] Replace only `create_production_stock_return` with the extended transactional implementation and validate `gross - tare` server-side.
- [ ] Run focused tests and confirm all return assertions pass.

### Task 4: Verify the scoped change

**Files:**
- Verify only the files listed above.

- [ ] Run ESLint on all modified JavaScript and test files with zero warnings.
- [ ] Run `npm run test -- tests/stock-return-tare.test.mjs tests/weight-scale-return-realtime-print.test.mjs`.
- [ ] Run `npm run build` and confirm exit code 0.
- [ ] Review changed paths and confirm no inbound, waste, report, or issue file was modified.
