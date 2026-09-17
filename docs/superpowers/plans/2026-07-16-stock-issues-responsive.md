# Stock Issues Responsive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ทำให้ `/production-line/stock/issues` ใช้งานได้ตั้งแต่มือถือ 360px ถึงเดสก์ท็อป โดยคงตารางแบบเลื่อนแนวนอนและไม่เปลี่ยน logic การเบิก

**Architecture:** คง component และ state flow เดิมทั้งหมด ปรับเฉพาะ responsive Tailwind classes ใน main layout, recent-issues section, picker modal และ camera modal ตารางทั้งสองชุดจะมี explicit minimum width และถูกกัก horizontal scrolling ไว้ใน container ที่มี `min-w-0`/`overflow-x-auto`

**Tech Stack:** Next.js 16 App Router, React, Tailwind CSS, Node test runner, ESLint

## Global Constraints

- ไม่เปลี่ยน business logic, API, Supabase, request payload หรือ stock calculation
- ตารางรายการเบิกล่าสุดและ picker table ต้องคงเป็นตารางและเลื่อนแนวนอนได้
- touch controls ที่แก้ต้องสูงอย่างน้อย 44px
- modal บนมือถือใช้ dynamic viewport และต้องไม่ดัน document ให้ล้นแนวนอน
- รักษาโทนสีและ visual language เดิมของหน้า

---

### Task 1: Responsive regression contract

**Files:**
- Create: `tests/production-stock-issue-responsive.test.mjs`
- Inspect: `src/features/production-line/components/ProductionStockIssuePageClient.js`

**Interfaces:**
- Consumes: JSX/Tailwind source of `ProductionStockIssuePageClient`
- Produces: source-level contract guarding mobile containment and table-scroll behavior

- [ ] **Step 1: Write the failing test**

Create a Node test that reads the component source and asserts the presence of these contracts:

```js
assert.match(source, /min-w-0 overflow-hidden/);
assert.match(source, /min-w-\[72rem\]/);
assert.match(source, /max-h-\[100dvh\]/);
assert.match(source, /w-full min-w-0/);
assert.match(source, /flex-col gap-2 sm:flex-row/);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/production-stock-issue-responsive.test.mjs`
Expected: FAIL because the responsive containment classes are not present yet

- [ ] **Step 3: Keep the failing test as the implementation contract**

The test must describe layout containment only and must not assert business behavior or exact Thai copy.

---

### Task 2: Main scanner and recent issues responsiveness

**Files:**
- Modify: `src/features/production-line/components/ProductionStockIssuePageClient.js:707-1116`
- Test: `tests/production-stock-issue-responsive.test.mjs`

**Interfaces:**
- Consumes: existing `status`, `barcode`, `lastScannedItem`, `rows`, `summary`, pagination handlers
- Produces: identical actions/data flow with responsive layout classes

- [ ] **Step 1: Contain the page and status row**

Add `min-w-0 overflow-hidden` to the page shell, make the status row wrap/stack on the smallest screens, and reduce mobile outer padding to `py-4 sm:py-6 lg:py-8`.

- [ ] **Step 2: Make scanner controls fluid**

Change the empty scanner card to `w-full px-3 py-5 sm:px-8 sm:py-8`, reduce scanner input padding/font on mobile, add `min-w-0` to the input, and keep the existing large sizes from `sm`/`md` upward.

- [ ] **Step 3: Stack controls and preserve touch targets**

Keep the existing `lg:grid-cols-12` layout, ensure every right-side control is full width and at least `h-14`, and add `focus-visible` ring/border states without changing event handlers.

- [ ] **Step 4: Make recent summary responsive**

Change the section header from a fixed row to `flex-col ... sm:flex-row`, render summary metrics in a two-column grid on mobile, and reduce mobile padding.

- [ ] **Step 5: Constrain recent table scrolling**

Wrap the table in `min-w-0 overflow-x-auto overscroll-x-contain`, set the table to `min-w-[72rem]`, preserve vertical scrolling/sticky header, and do not hide or reorder columns.

- [ ] **Step 6: Make pagination wrap**

Use `flex-col` on mobile, a full-width three-column control row, shorter mobile labels via existing text, and `sm:flex-row` on larger screens.

- [ ] **Step 7: Run focused test**

Run: `npm run test -- tests/production-stock-issue-responsive.test.mjs`
Expected: remaining modal-related assertions may still fail; main-layout assertions pass

---

### Task 3: Picker and camera modal responsiveness

**Files:**
- Modify: `src/features/production-line/components/ProductionStockIssuePageClient.js:1119-1460`
- Test: `tests/production-stock-issue-responsive.test.mjs`

**Interfaces:**
- Consumes: existing modal state, filters, selection, pagination and camera handlers
- Produces: identical modal behavior contained inside mobile viewport

- [ ] **Step 1: Fit picker to dynamic viewport**

Use `items-stretch p-0 sm:items-center sm:p-4`, `max-h-[100dvh] sm:max-h-[92vh]`, `min-w-0`, and mobile-safe border sizing on the picker shell.

- [ ] **Step 2: Make picker header and filters fluid**

Reduce mobile heading size, keep close button at least 44x44, change filter grid to `sm:grid-cols-2 lg:grid-cols-[...]`, and make search button width full below `lg`.

- [ ] **Step 3: Remove fixed-width mobile control**

Change product filter from `min-w-[17rem]` to `w-full min-w-0 sm:min-w-[17rem]`, keep dropdown width capped by viewport, and make summary metrics fit two mobile columns.

- [ ] **Step 4: Preserve picker table scrolling**

Use separate `overflow-x-auto overflow-y-auto overscroll-contain` container with `min-w-[56rem]` table; keep all columns and checkbox actions.

- [ ] **Step 5: Make picker footer responsive**

Make pagination a full-width grid on mobile and actions `w-full` with `sm:w-auto`; do not change handlers or disabled conditions.

- [ ] **Step 6: Fit camera modal to dynamic viewport**

Use mobile `p-0`, `max-h-[100dvh]`, scrollable inner shell, smaller header typography, wrapping camera controls, and preview sizing constrained by available viewport.

- [ ] **Step 7: Run focused test**

Run: `npm run test -- tests/production-stock-issue-responsive.test.mjs`
Expected: PASS

---

### Task 4: Quality verification

**Files:**
- Verify: `src/features/production-line/components/ProductionStockIssuePageClient.js`
- Verify: `tests/production-stock-issue-responsive.test.mjs`

**Interfaces:**
- Consumes: completed responsive component
- Produces: verified responsive page without build regressions

- [ ] **Step 1: Run focused ESLint**

Run: `npx eslint "src/features/production-line/components/ProductionStockIssuePageClient.js" "tests/production-stock-issue-responsive.test.mjs"`
Expected: exit code 0

- [ ] **Step 2: Run project lint**

Run: `npm run lint`
Expected: exit code 0

- [ ] **Step 3: Run production build**

Run: `npm run build`
Expected: `Compiled successfully` and exit code 0

- [ ] **Step 4: Inspect responsive contracts**

Verify source/layout at 360px, 390px, 768px, 1024px and desktop. Confirm document width does not exceed viewport, both tables scroll inside their own containers, and all primary controls remain reachable.
