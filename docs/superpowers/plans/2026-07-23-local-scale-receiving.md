# Local Serial Scale Receiving Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ส่งมอบหน้าชั่งรับเข้าจาก OHAUS Defender 3000 ที่อ่าน realtime บันทึกด้วย receipt logic เดิม และพิมพ์ฉลากเดียวกับหน้าชั่งเข้า

**Architecture:** Scale Agent ใหม่รับผิดชอบเฉพาะ serial transport ที่พอร์ต 41952 ส่วน Next.js ใช้ API รับเข้าเดิมและ Print Agent เดิมที่พอร์ต 41951 ตัวสร้าง print payload ถูกย้ายเป็น helper กลางเพื่อป้องกันสองหน้าคลาดเคลื่อนกัน

**Tech Stack:** Next.js 16 App Router, React 19, WebSocket, Node.js CommonJS, serialport, ws, Node test runner

## Global Constraints

- ห้ามเปลี่ยนผลลัพธ์และ flow ของหน้าชั่งเข้าปัจจุบัน
- ฉลาก 80 × 50 มม. และ CODE128 ต้องเหมือนเดิม
- Barcode ต้องมาจาก receipt ที่ Server บันทึกสำเร็จแล้ว
- UI ต้องลื่นบนคอมสเปกต่ำและไม่มี Mojibake
- ไม่เพิ่มกราฟหรือ dependency ฝั่ง browser

---

### Task 1: Lock the shared print-label contract

**Files:**
- Create: `src/features/production-line/services/weightScaleReceiptLabel.js`
- Modify: `src/features/production-line/components/WeightScalePageClient.js`
- Modify: `src/features/production-line/components/WeightScaleLivePageClient.js`
- Test: `tests/weight-scale-live-receiving.test.mjs`

**Interfaces:**
- Produces: `buildWeightScaleReceiptPrintLabel({ receipt, selectedProduct, unitLabel })`
- Returns: label object with receipt barcode, product, lot, tare, net, timestamp, 80×50 printer and CODE128

- [ ] Write a failing source-contract test requiring both pages to import the shared helper.
- [ ] Run `npm run test -- tests/weight-scale-live-receiving.test.mjs` and confirm failure.
- [ ] Add the helper and replace both local copies.
- [ ] Run the focused test and confirm pass.

### Task 2: Verify and harden the local scale agent

**Files:**
- Modify: `local-scale-agent/server.js`
- Modify: `local-scale-agent/parse.test.js`
- Modify: `local-scale-agent/README.md`

**Interfaces:**
- Consumes: OHAUS ASCII frames over configured serial port
- Produces: WebSocket reading `{ type, weightKg, unit, stable, raw, at }`

- [ ] Add failing cases for invalid numeric tokens, standalone ST/US flags and config validation.
- [ ] Run `npm --prefix local-scale-agent test` and confirm expected failures.
- [ ] Implement parser/config fixes without changing endpoint contract.
- [ ] Run agent tests and confirm pass.

### Task 3: Complete the receiving page

**Files:**
- Modify: `src/features/production-line/components/WeightScaleLivePageClient.js`
- Modify: `src/features/production-line/services/localScaleAgentClient.js`
- Test: `tests/weight-scale-live-receiving.test.mjs`

**Interfaces:**
- Consumes: initial server payloads, Scale Agent WebSocket, receipt and print services
- Produces: stable-gated save, save-before-print status and reprint actions

- [ ] Add failing tests for limit 20, stable gating, save-before-print and reprint.
- [ ] Run focused test and confirm failure.
- [ ] Add reprint state/action, complete table columns, stale-reading protection and lightweight UI.
- [ ] Run focused test and confirm pass.

### Task 4: Navigation and App Router entry

**Files:**
- Modify: `src/components/Sidebar.js`
- Modify: `src/features/production-line/components/WeightScalePrimaryHeader.js`
- Test: `tests/weight-scale-live-receiving.test.mjs`

**Interfaces:**
- Produces: navigation to `/production-line/weight-scale-live`

- [ ] Add a failing navigation assertion.
- [ ] Run focused test and confirm failure.
- [ ] Add Sidebar and weight-menu entries with existing permission rules.
- [ ] Run focused test and confirm pass.

### Task 5: Full verification

**Files:**
- Verify only

- [ ] Run `npm --prefix local-scale-agent test`.
- [ ] Run `npm run test -- tests/weight-scale-live-receiving.test.mjs`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run build`.
- [ ] Scan touched files for common Mojibake sequences and replacement characters.

