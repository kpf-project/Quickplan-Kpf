# Piece Rate Scale Clear Gate Implementation Plan

**Goal:** Prevent a completed piece-rate weighing session from starting another assignment until the existing item has been removed from the connected scale.

**Architecture:** Add an isolated stateful gate that observes the existing preview weight stream without changing how scale values are read. The piece-rate form arms the gate after a successful save or offline queue operation, displays a blocking overlay, and resets to the product scanner only after the observed preview weight remains at or below `0.02` kg for `1,000` ms.

**Tech Stack:** Next.js App Router, React, Node.js built-in test runner.

---

### Task 1: Add Scale Clear Gate

**Files:**
- Create: `src/lib/pieceRateRemovalGate.js`
- Create: `tests/piece-rate-removal-gate.test.mjs`

- [ ] Write a failing unit test for the required zero-weight hold period.
- [ ] Implement the minimal isolated gate helper.
- [ ] Run `npm run test -- tests/piece-rate-removal-gate.test.mjs`.

### Task 2: Guard Next Assignment Reset

**Files:**
- Modify: `src/app/production-line/attendance/piece-rate-scan/PieceRateWorkForm.js`

- [ ] Arm the gate after an online save, offline queue operation, and browser-print completion.
- [ ] Reuse the existing preview event to observe scale clearing.
- [ ] Display a blocking Thai UTF-8 overlay while waiting.
- [ ] Preserve the existing immediate reset behavior when no Android scale bridge is connected.

### Task 3: Verify

- [ ] Run focused tests.
- [ ] Run ESLint for touched JavaScript files.
- [ ] Scan touched files for mojibake markers.
- [ ] Run `npm run build`.
