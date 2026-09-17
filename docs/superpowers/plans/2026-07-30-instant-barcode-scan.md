# Instant Barcode Scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make hardware barcode scans submit immediately without overlapping requests or changing stock business logic.

**Architecture:** Add a small independently testable FIFO scan controller and use it from the existing issue page. The controller captures scans synchronously, suppresses an already-pending duplicate, and runs different barcodes sequentially; the page continues to call the same client request and server RPC.

**Tech Stack:** JavaScript, React, Node test runner, Next.js.

## Global Constraints

- Do not change the stock-issue API, Supabase RPC, database schema, inventory calculations, reports, or list picker.
- Do not add dependencies.
- Preserve existing Thai UI copy.

---

### Task 1: FIFO scan controller

**Files:**
- Create: `src/features/production-line/lib/barcodeScanQueue.js`
- Create: `tests/production-stock-barcode-scan-single-flight.test.mjs`

**Interfaces:**
- Produces: `createBarcodeScanQueue()` returning `{ enqueue(barcode, operation), isPending(barcode) }`.
- `enqueue` returns `{ accepted: false }` for an already-pending barcode and `{ accepted: true, completion }` for an accepted scan.

- [ ] **Step 1: Write the failing tests**

Test that two different immediate `enqueue` calls run sequentially, the same barcode is rejected while pending, and completion or rejection releases that barcode.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/production-stock-barcode-scan-single-flight.test.mjs`

Expected: FAIL because the controller module does not exist.

- [ ] **Step 3: Implement the minimal controller**

Use a promise tail and a pending-barcode set. Append accepted operations to the tail and remove the barcode from the set in `finally`; do not debounce or delay.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test -- tests/production-stock-barcode-scan-single-flight.test.mjs`

Expected: all controller tests PASS.

### Task 2: Connect hardware scanner to the guard

**Files:**
- Modify: `src/features/production-line/components/ProductionStockIssuePageClient.js`
- Modify: `tests/production-stock-barcode-scan-single-flight.test.mjs`

**Interfaces:**
- Consumes: `createBarcodeScanQueue()`.
- Preserves: `createProductionStockIssueRequest(payload)` and all existing response handling.

- [ ] **Step 1: Add a failing source-wiring regression test**

Assert that the component keeps a controller ref, clears the captured barcode before awaiting the request, and routes hardware Enter submissions through the guarded function.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test -- tests/production-stock-barcode-scan-single-flight.test.mjs`

Expected: FAIL because the component is not wired to the controller.

- [ ] **Step 3: Implement minimal page wiring**

Capture the barcode, synchronously acquire the guard, update processing status, clear the input immediately, call the unchanged single-issue request, and restore focus after completion.

- [ ] **Step 4: Run focused verification**

Run: `npm run test -- tests/production-stock-barcode-scan-single-flight.test.mjs tests/production-stock-return-reissue.test.mjs`

Expected: all tests PASS.

- [ ] **Step 5: Run lint**

Run: `npx eslint src/features/production-line/components/ProductionStockIssuePageClient.js src/features/production-line/lib/barcodeScanSingleFlight.js`

Expected: exit code 0.
