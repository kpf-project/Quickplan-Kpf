# Reduce Data Polling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove wasteful full-data polling from BOM, Material Claims, and Admin Performance while preserving explicit and mutation-driven freshness.

**Architecture:** Reuse existing fetch functions and SWR mutation APIs. No database, Supabase schema, route-handler, or unrelated feature changes are required.

**Tech Stack:** Next.js 16 App Router, React 19, SWR 2, Node test runner, ESLint.

## Global Constraints

- Do not modify Raw Materials because its active component is not wired to the polling hook.
- Do not change authentication/session refresh behavior.
- Do not introduce new dependencies or schema changes.
- Preserve every existing post-mutation refresh.

---

### Task 1: Add polling regression coverage

**Files:**
- Create: `tests/data-refresh-wiring.test.mjs`

**Interfaces:**
- Consumes: source files for the three active pages.
- Produces: regression assertions for removed timers, manual refresh controls, and freshness timestamps.

- [ ] **Step 1: Write the failing test**

  Read each component as UTF-8 and assert that old timer literals are absent and the new refresh wiring is present.

- [ ] **Step 2: Run test to verify it fails**

  Run: `npm run test -- tests/data-refresh-wiring.test.mjs`

  Expected: FAIL because the old timers still exist.

- [ ] **Step 3: Continue with Tasks 2-4 until the test passes**

### Task 2: Replace BOM polling with safe manual refresh

**Files:**
- Modify: `src/features/production-line/components/BomEditorPageClient.js`

**Interfaces:**
- Consumes: existing `loadBomDetails`, selected product/formula state, dirty/editing state.
- Produces: `handleRefreshBom` and a refresh button that cannot overwrite unsaved edits.

- [ ] Remove the five-second `setInterval` effect.
- [ ] Add a callback that invokes `loadBomDetails` for the selected product and formula.
- [ ] Add a button with loading/disabled feedback near the existing BOM actions.
- [ ] Keep existing mutation-triggered reloads unchanged.

### Task 3: Replace Material Claims polling with SWR revalidation controls

**Files:**
- Modify: `src/features/production-planning/components/MaterialClaimsWorkspaceModernClient.js`

**Interfaces:**
- Consumes: `mutateWorkspace`, `mutateGroups`, and SWR validation flags.
- Produces: manual refresh, last-successful-refresh time, no fixed interval, focus throttle of 60 seconds.

- [ ] Set groups `refreshInterval` to `0` and retain focus revalidation with `focusThrottleInterval: 60000`.
- [ ] Track successful refresh time after initial data and manual/mutation refreshes.
- [ ] Add a refresh button and “last updated” label in the page header.

### Task 4: Make Admin Performance manual-refresh only

**Files:**
- Modify: `src/features/performance/components/PerformanceDashboardPageClient.js`

**Interfaces:**
- Consumes: existing `loadData` and refresh button.
- Produces: initial load, manual refresh, and last-successful-refresh time without a timer.

- [ ] Remove the 15-second interval while retaining the initial effect load.
- [ ] Record the time only after a successful response.
- [ ] Show the time beside the refresh control.

### Task 5: Verify the scoped change

**Files:**
- Test: `tests/data-refresh-wiring.test.mjs`
- Verify touched source files only.

- [ ] Run `npm run test -- tests/data-refresh-wiring.test.mjs` and expect PASS.
- [ ] Run ESLint against the three modified components and expect no errors.
- [ ] Run `npm run test` and expect the full suite to pass.
- [ ] Run `npm run build` and expect a successful production build.
