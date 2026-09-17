# Stock Lot Balance Report Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Center the lot-balance report title, show the requested bilingual company identity beside the logo, and display the logged-in username as the printer in both preview and print output.

**Architecture:** Retain the existing duplicated preview and print report markup, but change only each header to a three-column `1fr auto 1fr` grid. Correct the existing profile field reference from the nonexistent `name` field to `username`.

**Tech Stack:** Next.js, React, Tailwind CSS, Node.js test runner

## Global Constraints

- Modify only the A4 header in `ProductionStockLotBalanceReportPageClient.js` and its regression test.
- Apply identical header content and layout to preview and print markup.
- Do not change stock data, calculations, pagination, filters, menus, buttons, table content, or other reports.
- Company text must be exactly `บริษัท เคพีฟู้ดส์ จำกัด` and `K.P. foods Co.,Ltd.`.
- Printer name must come from `profile.username`, falling back to `-` only when unavailable.

---

### Task 1: A4 report header and printer identity

**Files:**
- Modify: `src/features/production-line/components/ProductionStockLotBalanceReportPageClient.js`
- Test: `tests/stock-lot-balance-report-navigation.test.mjs`

**Interfaces:**
- Consumes: `profile.username`, `scope.departmentName`, `printedAtLabel`, and existing KPF logo asset.
- Produces: Matching centered three-column headers in preview and print output.

- [x] **Step 1: Write the failing regression test**

Add a test that reads the report source and requires two `grid-cols-[1fr_auto_1fr]` headers, two occurrences of each requested company line, two centered title elements, two `profile.username` printer bindings, and no `profile.name` binding.

- [x] **Step 2: Run the focused test and confirm RED**

Run: `npm run test -- tests/stock-lot-balance-report-navigation.test.mjs`

Expected: FAIL because the current headers use flex, keep the title beside the logo, show the old company line, and reference `profile.name`.

- [x] **Step 3: Implement the approved header**

Replace each header's flex layout with a three-column grid. Keep logo and bilingual company text on the left, place the report title in the centered column, preserve audit details on the right, and bind printer text to `profile.username || "-"`.

- [x] **Step 4: Verify GREEN and lint**

Run: `npm run test -- tests/stock-lot-balance-report-navigation.test.mjs`

Expected: all focused tests pass.

Run: `npx eslint src/features/production-line/components/ProductionStockLotBalanceReportPageClient.js tests/stock-lot-balance-report-navigation.test.mjs`

Expected: exit code 0 without errors.
