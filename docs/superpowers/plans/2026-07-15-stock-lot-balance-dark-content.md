# Stock Lot Balance Dark Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every text element inside the A4 lot-balance report use dark black on screen and in print without changing the surrounding page controls.

**Architecture:** Scope the color rules to `.lot-balance-portrait-print-shell` so both the preview and printable copies receive the same typography treatment. Use light table summary/header backgrounds so dark text remains readable, and preserve all routing, data, and toolbar behavior.

**Tech Stack:** Next.js, React, Tailwind CSS, static scoped CSS, Node.js test runner

## Global Constraints

- Modify only the A4 report content styling and its regression test.
- Do not change menus, buttons, data calculations, report pagination, or print behavior.
- The content color must be `#111111` on screen and in print.

---

### Task 1: Dark A4 report content

**Files:**
- Modify: `src/features/production-line/components/ProductionStockLotBalanceReportPageClient.js`
- Test: `tests/stock-lot-balance-report-navigation.test.mjs`

**Interfaces:**
- Consumes: Existing `.lot-balance-portrait-print-shell` report wrapper and static screen/print style blocks.
- Produces: Dark report typography with readable light table backgrounds in both render modes.

- [x] **Step 1: Write the failing regression test**

Add a source-level assertion requiring a scoped `#111111` text rule for the report shell and preventing white text in report table styles.

- [x] **Step 2: Run test to verify it fails**

Run: `npm run test -- tests/stock-lot-balance-report-navigation.test.mjs`

Expected: FAIL because the screen report still contains white/dark-blue table text and lacks the scoped dark-content rule.

- [x] **Step 3: Write minimal implementation**

Add scoped screen and print selectors for shell text, table headings, product subtotals, and grand totals using `color: #111111 !important`, with light backgrounds for rows that previously used dark fills.

- [x] **Step 4: Run focused verification**

Run: `npm run test -- tests/stock-lot-balance-report-navigation.test.mjs`

Expected: all focused tests pass.

Run: `npx eslint src/features/production-line/components/ProductionStockLotBalanceReportPageClient.js tests/stock-lot-balance-report-navigation.test.mjs`

Expected: exit code 0 with no ESLint errors.
