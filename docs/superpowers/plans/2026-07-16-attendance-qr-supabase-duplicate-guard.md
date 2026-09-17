# Attendance QR Supabase Duplicate Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make QR attendance IN/OUT validation depend only on accepted Supabase QR events for the Bangkok business day, with database-level concurrency protection.

**Architecture:** Put time-zone, employee-key, and daily-state rules in a pure module covered by unit tests. Update the attendance scan service to use the employee master endpoint and Supabase event history, then add nullable atomic-key columns plus a partial unique index for new accepted events without changing historical rows.

**Tech Stack:** Next.js server services, JavaScript, Supabase JS, PostgreSQL migration, Node.js test runner

## Global Constraints

- Do not call or depend on `Pm2014_SU.dbo.CHECKINOUT` or `/api/consolidated-lookup` in QR scan persistence.
- Do not modify historical attendance rows.
- Use server-derived `Asia/Bangkok` business dates.
- Preserve the existing missing-IN confirmation and request-id idempotency behavior.
- Do not modify fingerprint reports or unrelated attendance features.

---

### Task 1: Pure Bangkok-day and QR state rules

**Files:**
- Create: `src/features/attendance/services/attendanceScanRules.js`
- Create: `tests/attendance-scan-rules.test.mjs`

**Interfaces:**
- Produces: `getAttendanceEmployeeKey(value)`, `buildAttendanceEmployeeVariants(value)`, `getBangkokAttendanceDay(value)`, `getAttendanceDayState(rows, employeeCode)`, and `formatBangkokAttendanceTime(value)`.

- [ ] **Step 1: Write failing unit tests**

Cover numeric KPF aliases, the UTC/Bangkok date split before 07:00, exclusive next-day boundary, accepted-only IN/OUT state, and Bangkok time formatting.

- [ ] **Step 2: Run RED verification**

Run: `npm run test -- tests/attendance-scan-rules.test.mjs`

Expected: FAIL because `attendanceScanRules.js` does not exist.

- [ ] **Step 3: Implement the pure rules**

Use `Intl.DateTimeFormat` with `Asia/Bangkok`; construct UTC bounds from `T00:00:00+07:00`; canonicalize numeric keys to five digits; ignore non-accepted rows when building daily state.

- [ ] **Step 4: Run GREEN verification**

Run: `npm run test -- tests/attendance-scan-rules.test.mjs`

Expected: all rule tests pass.

### Task 2: Supabase-only scan service

**Files:**
- Modify: `src/features/attendance/services/attendanceScanService.js`
- Create: `tests/attendance-scan-supabase-guard.test.mjs`

**Interfaces:**
- Consumes: Task 1 rule helpers, `/api/employees`, and `attendance_scan_events`.
- Produces: Supabase-only duplicate decisions and QR-derived check-in/check-out snapshots.

- [ ] **Step 1: Write failing service regression tests**

Assert the service does not contain `/api/consolidated-lookup` or snapshot-based duplicate conditions, does use `/api/employees`, queries accepted events within Bangkok bounds, writes `employee_code_key` and `scan_business_date`, and handles business-key conflicts separately from request-id idempotency.

- [ ] **Step 2: Run RED verification**

Run: `npm run test -- tests/attendance-scan-supabase-guard.test.mjs`

Expected: FAIL against the current fingerprint-coupled service.

- [ ] **Step 3: Implement the service change**

Resolve employee identity by exact canonical match from `/api/employees`; load accepted daily QR rows from Supabase using canonical variants and Bangkok bounds; apply IN/OUT rules; insert atomic key columns; derive snapshot times from QR event timestamps; translate unique conflicts into the existing Thai business messages.

- [ ] **Step 4: Run combined GREEN verification**

Run: `npm run test -- tests/attendance-scan-rules.test.mjs tests/attendance-scan-supabase-guard.test.mjs tests/attendance-scan-callback-order.test.mjs`

Expected: all focused tests pass.

### Task 3: Atomic database guard

**Files:**
- Create with Supabase CLI: `supabase/migrations/<timestamp>_add_attendance_qr_daily_unique_guard.sql`
- Test: `tests/attendance-scan-supabase-guard.test.mjs`

**Interfaces:**
- Produces: nullable `employee_code_key`, nullable `scan_business_date`, and partial unique index `attendance_scan_events_daily_type_unique_idx`.

- [ ] **Step 1: Extend the failing migration test**

Require both nullable columns and a unique partial index on employee key, event type, and business date for accepted non-null rows; reject any update/backfill statement.

- [ ] **Step 2: Generate the migration through the CLI**

Run: `supabase migration new add_attendance_qr_daily_unique_guard`

Expected: a timestamped migration file is created by the CLI.

- [ ] **Step 3: Add minimal DDL**

Use `alter table ... add column if not exists` for both columns and `create unique index if not exists` with the approved partial predicate. Do not issue `update` statements.

- [ ] **Step 4: Verify migration and application code**

Run focused tests, ESLint on changed JS/MJS files, then `npm run build`.

Expected: focused tests, lint, and build all exit 0.

### Task 4: Apply and verify Supabase schema

**Files:**
- No additional source files.

**Interfaces:**
- Consumes: the reviewed migration SQL and configured Supabase project.
- Produces: live atomic constraint matching application inserts.

- [ ] **Step 1: Inspect live schema and duplicate risk read-only**

Check that the table exists, the columns/index are not already present, and no historical rows will be updated.

- [ ] **Step 2: Apply the reviewed migration**

Apply only the generated DDL to the configured project.

- [ ] **Step 3: Verify live schema**

Query `information_schema.columns` and `pg_indexes` to confirm both columns and the unique index definition, then run Supabase security and performance advisors because DDL changed.

