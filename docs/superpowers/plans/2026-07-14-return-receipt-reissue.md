# Return Receipt Reissue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each printed stock-return barcode independently issuable exactly once using its persisted net weight.

**Architecture:** Remove the server-side return-barcode rejection and add a later Supabase migration that branches inside `create_production_stock_issue`: original receipts use their own receipt/issue/cancellation balance without absorbing `return_in`, while return receipts use their own weight plus an active-issue guard under a receipt row lock.

**Tech Stack:** Next.js App Router, JavaScript server services, Supabase/Postgres PL/pgSQL, Node test runner.

## Global Constraints

- Do not modify inbound weighing files or inbound receipt creation.
- Never pool weights from separate return barcodes.
- Never expose returned weight under both the original barcode and the return barcode.
- A return barcode can have at most one active confirmed issue at a time.
- Preserve product, lot, return receipt, root receipt, and source issue traceability.

---

### Task 1: Return-barcode issue regression contract

**Files:**
- Create: `tests/production-stock-return-reissue.test.mjs`
- Test: `src/lib/production-stock-issues.js`
- Test: the new migration created in Task 2

**Interfaces:**
- Consumes: issue service source and PL/pgSQL migration source
- Produces: regression assertions for accepted return barcodes, exact return weight, row locking, duplicate prevention, picker inclusion, and traceability metadata

- [ ] Write a test that rejects the current `assertIssueBarcodeIsOriginalReceipt` guard and current `isOriginalReceiptForIssue` picker filter.
- [ ] Write migration assertions for `FOR UPDATE`, `metadata.isReturn`, `net_weight_kg`, an active confirmed issue check, scanned `source_receipt_id`, and root receipt metadata.
- [ ] Run `npm run test -- tests/production-stock-return-reissue.test.mjs` and confirm failure is caused by the missing behavior.

### Task 2: Atomic return-receipt issue migration

**Files:**
- Create with CLI: `supabase/migrations/<timestamp>_allow_return_receipt_reissue.sql`
- Test: `tests/production-stock-return-reissue.test.mjs`

**Interfaces:**
- Consumes: `create_production_stock_issue(p_barcode, p_issue_type, p_actor_user_id, p_remark)`
- Produces: the same JSON response shape, with return receipts issued at their own `net_weight_kg`

- [ ] Run `supabase migration new allow_return_receipt_reissue` to create the migration.
- [ ] Replace `create_production_stock_issue` in that migration while retaining original-receipt behavior.
- [ ] Lock the scanned receipt, branch on `metadata.isReturn`, and reject a return receipt with an active confirmed issue.
- [ ] Store `sourceReceiptId` as the scanned receipt and `rootSourceReceiptId` from return metadata for traceability.
- [ ] Run the focused test and confirm the migration contract passes.

### Task 3: Issue service and picker

**Files:**
- Modify: `src/lib/production-stock-issues.js`
- Test: `tests/production-stock-return-reissue.test.mjs`

**Interfaces:**
- Consumes: recorded original and return receipt rows
- Produces: API acceptance and available-picker rows for both receipt types

- [ ] Remove the pre-RPC return-receipt rejection.
- [ ] Partition picker rows into original and return receipts.
- [ ] Keep original receipt availability movement-derived; assign unissued return receipts their own net weight.
- [ ] Exclude `return_in` from original-receipt availability so returned kilograms exist only on the printed return barcode.
- [ ] Exclude already-issued return receipts using confirmed issue document/item state.
- [ ] Run the focused test and confirm all service assertions pass.

### Task 4: Verification and database handoff

**Files:**
- Verify: `src/lib/production-stock-issues.js`
- Verify: `supabase/migrations/<timestamp>_allow_return_receipt_reissue.sql`
- Verify: `tests/production-stock-return-reissue.test.mjs`

**Interfaces:**
- Consumes: completed implementation
- Produces: test, lint, build, migration, and scope evidence

- [ ] Run focused return/issue tests.
- [ ] Run ESLint on changed JavaScript and tests.
- [ ] Run the full test suite and `npm run build`.
- [ ] Run `supabase migration list` and apply the migration only if the configured remote project is available and the operation is authorized.
- [ ] Inspect modified paths and confirm no inbound weighing file changed.
