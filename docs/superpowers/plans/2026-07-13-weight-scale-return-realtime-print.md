# Weight Scale Return Realtime and Auto-Print Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the return station the inbound station's realtime stable-weight and automatic printing behavior without changing inbound weighing code.

**Architecture:** Keep the existing return API/RPC and shared scale/printer services unchanged. Implement the station lifecycle locally in `WeightScaleReturnPageClient.js`, using refs for connection and one-shot state, and test source-level integration contracts in the repository's existing Node test style.

**Tech Stack:** Next.js App Router, React client components, EventSource/SSE, Modbus TCP API, Local Print Agent, WebUSB, Node test runner.

## Global Constraints

- Do not modify any inbound product weighing file or behavior.
- Stable tolerance is exactly `0.01 kg`; stable window is exactly `2500 ms`; reset threshold is exactly `0.1 kg`.
- Print only the persisted return barcode returned by the API.
- A print failure must never create a duplicate return.

---

### Task 1: Return flow regression contract

**Files:**
- Create: `tests/weight-scale-return-realtime-print.test.mjs`
- Modify: none

**Interfaces:**
- Consumes: source text of `WeightScaleReturnPageClient.js`
- Produces: regression assertions for required imports, constants, state phases, auto-connect, print calls, and reset guard

- [ ] Write focused tests that expect a `2500` ms window, `armed/saving/awaiting-reset` phases, auto-connect after a valid scan, Agent and WebUSB printing with `result.barcode`, latest-label reprint, and clearing the scanned item only after weight is `<= 0.1 kg`.
- [ ] Run `npm run test -- tests/weight-scale-return-realtime-print.test.mjs` and confirm it fails because the behavior is absent.

### Task 2: Return-only realtime station lifecycle

**Files:**
- Modify: `src/features/production-line/components/WeightScaleReturnPageClient.js`
- Test: `tests/weight-scale-return-realtime-print.test.mjs`

**Interfaces:**
- Consumes: `createScaleStream(scaleConfig, handlers)`
- Produces: automatic stream connection after scan, watchdog cleanup, and `autoSaveStateRef` phases

- [ ] Add inbound-equivalent stream refs, close/start/stop behavior, connection watchdog, and auto-connect keyed by host, port, and scanned barcode.
- [ ] Replace `stableCandidate` with a ref-based cycle using `0.01 kg`, `2500 ms`, and `<= 0.1 kg` reset.
- [ ] Keep the completed source item until reset and block saving when live weight exceeds `remainingWeightKg`.
- [ ] Run the focused test and confirm the realtime/state assertions pass.

### Task 3: Return-only automatic label printing

**Files:**
- Modify: `src/features/production-line/components/WeightScaleReturnPageClient.js`
- Test: `tests/weight-scale-return-realtime-print.test.mjs`

**Interfaces:**
- Consumes: `printWeightScaleLabelViaAgent(payload)`, `printWeightScaleLabelViaUsb(device, payload)`, and the return API result
- Produces: an 80 x 50 mm CODE128 return label and reprint behavior

- [ ] Build a return label from `result.barcode`, product details, tare zero, net return weight, and `result.returnedAt`.
- [ ] Add persisted print mode, printer discovery/selection/test, WebUSB pairing, automatic print after API success, and latest-label reprint.
- [ ] On print failure, retain the saved result, show a warning, remain `awaiting-reset`, and never call the return API from reprint.
- [ ] Run the focused test and confirm all print assertions pass.

### Task 4: Verification and scope audit

**Files:**
- Verify: `src/features/production-line/components/WeightScaleReturnPageClient.js`
- Verify: `tests/weight-scale-return-realtime-print.test.mjs`

**Interfaces:**
- Consumes: completed implementation
- Produces: fresh test/lint/build evidence and an inbound-file scope audit

- [ ] Run `npm run test -- tests/weight-scale-return-realtime-print.test.mjs`.
- [ ] Run `npx eslint "src/features/production-line/components/WeightScaleReturnPageClient.js" "tests/weight-scale-return-realtime-print.test.mjs"`.
- [ ] Run `npm run test`.
- [ ] Run `npm run build`.
- [ ] List modified files and verify that no inbound weighing component/API/service was changed.
