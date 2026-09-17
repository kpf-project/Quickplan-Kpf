# Piece-Rate Report Realtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every open piece-rate report refresh automatically when `public.production_piece_rate_logs` changes, without losing the current page, applied filters, or view mode.

**Architecture:** Publish the source table through Supabase Realtime Postgres Changes. Treat database and existing browser BroadcastChannel events as invalidation signals that feed one 400 ms debounced scheduler, then reload through the existing report API so all totals, lifecycle rules, filters, and pagination remain server-authoritative.

**Tech Stack:** Next.js 16 App Router, React 19, `@supabase/supabase-js` 2.x, Supabase Realtime Postgres Changes, PostgreSQL 17, Node test runner.

## Global Constraints

- Subscribe only to `public.production_piece_rate_logs`.
- Listen to `INSERT`, `UPDATE`, and `DELETE` through `event: "*"`.
- Use the existing browser Supabase singleton; never expose a service-role key.
- Debounce invalidations for exactly 400 milliseconds.
- Preserve the current pagination page, applied filters, and active view mode.
- Keep the existing report API as the source of rendered rows and summaries.
- Realtime failure must not clear report data or block manual search/reset.
- Cleanup must cancel the pending timer, close BroadcastChannel, and remove the Supabase channel.
- Do not drop or recreate the `supabase_realtime` publication.
- No new npm dependency.
- The workspace currently has no Git repository; checkpoint commands must report this instead of failing.

---

### Task 1: Publish the piece-rate source table

**Files:**
- Create through CLI: `supabase/migrations/*_enable_piece_rate_report_realtime.sql`
- Create: `tests/piece-rate-report-realtime.test.mjs`

**Interfaces:**
- Consumes: existing PostgreSQL publication `supabase_realtime`.
- Produces: publication membership for `public.production_piece_rate_logs`.

- [ ] **Step 1: Write the failing migration test**

Create `tests/piece-rate-report-realtime.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readRealtimeMigration() {
  const migrationsDir = path.join(repoRoot, "supabase", "migrations");
  const filename = fs.readdirSync(migrationsDir)
    .find((name) => name.endsWith("_enable_piece_rate_report_realtime.sql"));
  assert.ok(filename, "Realtime migration must exist");
  return fs.readFileSync(path.join(migrationsDir, filename), "utf8");
}

test("publishes production_piece_rate_logs idempotently without replacing the publication", () => {
  const sql = readRealtimeMigration();

  assert.match(sql, /pg_publication_tables/i);
  assert.match(sql, /pubname\s*=\s*'supabase_realtime'/i);
  assert.match(sql, /schemaname\s*=\s*'public'/i);
  assert.match(sql, /tablename\s*=\s*'production_piece_rate_logs'/i);
  assert.match(
    sql,
    /alter\s+publication\s+supabase_realtime\s+add\s+table\s+public\.production_piece_rate_logs/i
  );
  assert.doesNotMatch(sql, /drop\s+publication/i);
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node --test tests/piece-rate-report-realtime.test.mjs
```

Expected: FAIL with `Realtime migration must exist`.

- [ ] **Step 3: Create the migration using the Supabase CLI**

Discover the command before using it:

```powershell
supabase migration new --help
supabase migration new enable_piece_rate_report_realtime
```

Put this SQL in the generated file:

```sql
do $$
begin
  if not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'production_piece_rate_logs'
  ) then
    alter publication supabase_realtime
      add table public.production_piece_rate_logs;
  end if;
end
$$;
```

- [ ] **Step 4: Run the migration test and verify GREEN**

Run:

```powershell
node --test tests/piece-rate-report-realtime.test.mjs
```

Expected: PASS.

- [ ] **Step 5: Record the checkpoint**

Run:

```powershell
if (Test-Path .git) {
  git add tests/piece-rate-report-realtime.test.mjs supabase/migrations
  git commit -m "feat: publish piece-rate logs to realtime"
} else {
  Write-Output "CHECKPOINT: realtime publication migration complete; Git unavailable"
}
```

---

### Task 2: Build and test one debounced refresh scheduler

**Files:**
- Create: `src/features/attendance/services/pieceRateReportRealtime.js`
- Modify: `tests/piece-rate-report-realtime.test.mjs`

**Interfaces:**
- Consumes: an `onRefresh(): void` callback and timer functions.
- Produces:
  - `PIECE_RATE_REPORT_REALTIME_CHANNEL`
  - `PIECE_RATE_REPORT_REALTIME_TABLE`
  - `createPieceRateReportRefreshScheduler(options)` returning `{ schedule(): void, cancel(): void }`.

- [ ] **Step 1: Append the failing scheduler tests**

Append:

```js
import {
  createPieceRateReportRefreshScheduler,
} from "../src/features/attendance/services/pieceRateReportRealtime.js";

test("coalesces a burst of report invalidations into one refresh", () => {
  const callbacks = new Map();
  const cleared = [];
  let nextTimerId = 0;
  let refreshCount = 0;
  const scheduler = createPieceRateReportRefreshScheduler({
    onRefresh: () => {
      refreshCount += 1;
    },
    setTimer: (callback, delay) => {
      nextTimerId += 1;
      assert.equal(delay, 400);
      callbacks.set(nextTimerId, callback);
      return nextTimerId;
    },
    clearTimer: (timerId) => {
      cleared.push(timerId);
      callbacks.delete(timerId);
    },
  });

  scheduler.schedule();
  scheduler.schedule();
  scheduler.schedule();

  assert.deepEqual(cleared, [1, 2]);
  callbacks.get(3)();
  assert.equal(refreshCount, 1);
});

test("cancel prevents a pending report refresh", () => {
  const callbacks = new Map();
  let nextTimerId = 0;
  let refreshCount = 0;
  const scheduler = createPieceRateReportRefreshScheduler({
    onRefresh: () => {
      refreshCount += 1;
    },
    setTimer: (callback) => {
      nextTimerId += 1;
      callbacks.set(nextTimerId, callback);
      return nextTimerId;
    },
    clearTimer: (timerId) => {
      callbacks.delete(timerId);
    },
  });

  scheduler.schedule();
  scheduler.cancel();
  assert.equal(callbacks.size, 0);
  assert.equal(refreshCount, 0);
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
node --test tests/piece-rate-report-realtime.test.mjs
```

Expected: FAIL because `pieceRateReportRealtime.js` does not exist.

- [ ] **Step 3: Implement the minimal scheduler**

Create `src/features/attendance/services/pieceRateReportRealtime.js`:

```js
export const PIECE_RATE_REPORT_REALTIME_CHANNEL = "piece-rate-report-db-changes";
export const PIECE_RATE_REPORT_REALTIME_TABLE = "production_piece_rate_logs";

export function createPieceRateReportRefreshScheduler({
  onRefresh,
  delayMs = 400,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  let timerId = null;

  return {
    schedule() {
      if (timerId !== null) {
        clearTimer(timerId);
      }
      timerId = setTimer(() => {
        timerId = null;
        onRefresh();
      }, delayMs);
    },
    cancel() {
      if (timerId !== null) {
        clearTimer(timerId);
        timerId = null;
      }
    },
  };
}
```

- [ ] **Step 4: Run the tests and verify GREEN**

Run:

```powershell
node --test tests/piece-rate-report-realtime.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 5: Record the checkpoint**

Run:

```powershell
if (Test-Path .git) {
  git add src/features/attendance/services/pieceRateReportRealtime.js tests/piece-rate-report-realtime.test.mjs
  git commit -m "feat: add debounced piece-rate report refresh"
} else {
  Write-Output "CHECKPOINT: realtime refresh scheduler complete; Git unavailable"
}
```

---

### Task 3: Wire Supabase Realtime and BroadcastChannel to the scheduler

**Files:**
- Modify: `src/features/attendance/components/PieceRateReportPageClient.js:1-40`
- Modify: `src/features/attendance/components/PieceRateReportPageClient.js:396-620`
- Modify: `tests/piece-rate-report-realtime.test.mjs`

**Interfaces:**
- Consumes:
  - `supabase` from `@/lib/supabaseClient`;
  - constants and scheduler from Task 2;
  - existing `loadData(page, filters, viewMode)`.
- Produces: a single subscription lifecycle shared by Realtime and BroadcastChannel.

- [ ] **Step 1: Append the failing component wiring test**

Append:

```js
test("wires database and browser invalidations to one realtime refresh scheduler", () => {
  const component = fs.readFileSync(
    path.join(
      repoRoot,
      "src",
      "features",
      "attendance",
      "components",
      "PieceRateReportPageClient.js"
    ),
    "utf8"
  );

  assert.match(component, /from\s+"@\/lib\/supabaseClient"/);
  assert.match(component, /createPieceRateReportRefreshScheduler/);
  assert.match(component, /\.channel\(PIECE_RATE_REPORT_REALTIME_CHANNEL\)/);
  assert.match(component, /event:\s*"\*"/);
  assert.match(component, /schema:\s*"public"/);
  assert.match(component, /table:\s*PIECE_RATE_REPORT_REALTIME_TABLE/);
  assert.match(component, /refreshScheduler\.schedule\(\)/);
  assert.match(component, /latestReportStateRef\.current/);
  assert.match(component, /supabase\.removeChannel\(realtimeChannel\)/);
  assert.match(component, /refreshScheduler\.cancel\(\)/);
  assert.match(component, /broadcastChannel\.close\(\)/);
  assert.equal(
    (component.match(/new BroadcastChannel\("kpf_piece_rate_sync"\)/g) || []).length,
    1
  );
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```powershell
node --test tests/piece-rate-report-realtime.test.mjs
```

Expected: FAIL because the component does not import or create a Supabase Realtime channel.

- [ ] **Step 3: Add the imports**

In `PieceRateReportPageClient.js`, add:

```js
import { supabase } from "@/lib/supabaseClient";
import {
  PIECE_RATE_REPORT_REALTIME_CHANNEL,
  PIECE_RATE_REPORT_REALTIME_TABLE,
  createPieceRateReportRefreshScheduler,
} from "@/features/attendance/services/pieceRateReportRealtime";
```

- [ ] **Step 4: Track the latest report state without resubscribing**

Near the existing refs, add:

```js
const latestReportStateRef = useRef({
  page: 1,
  filters: initialFiltersRef.current,
  viewMode: normalizeViewMode(initialViewMode),
});

latestReportStateRef.current = {
  page: pagination.page,
  filters,
  viewMode,
};
```

The assignment runs on every render, so the stable subscription callback always reloads the current applied state.

- [ ] **Step 5: Replace the existing BroadcastChannel effect with one combined lifecycle**

Replace the current BroadcastChannel-only `useEffect` with:

```js
useEffect(() => {
  if (typeof window === "undefined") return undefined;

  const refreshScheduler = createPieceRateReportRefreshScheduler({
    onRefresh: () => {
      const latest = latestReportStateRef.current;
      void loadData(latest.page, latest.filters, latest.viewMode);
    },
  });
  const realtimeChannel = supabase
    .channel(PIECE_RATE_REPORT_REALTIME_CHANNEL)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: PIECE_RATE_REPORT_REALTIME_TABLE,
      },
      () => {
        refreshScheduler.schedule();
      }
    )
    .subscribe((status) => {
      if (
        !hasLoggedRealtimeError
        && (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
      ) {
        hasLoggedRealtimeError = true;
        console.warn(`Piece-rate report Realtime status: ${status}`);
      }
    });

  let broadcastChannel = null;
  try {
    broadcastChannel = new BroadcastChannel("kpf_piece_rate_sync");
    broadcastChannel.onmessage = (event) => {
      if (event.data === "REFRESH_REPORT") {
        refreshScheduler.schedule();
      }
    };
  } catch (error) {
    console.warn("Failed to initialize piece-rate BroadcastChannel", error);
  }

  return () => {
    refreshScheduler.cancel();
    broadcastChannel?.close();
    void supabase.removeChannel(realtimeChannel);
  };
}, [loadData]);
```

Declare `let hasLoggedRealtimeError = false;` immediately before creating
`realtimeChannel`, so repeated reconnect attempts do not flood the browser log.

- [ ] **Step 6: Run the targeted tests and verify GREEN**

Run:

```powershell
node --test tests/piece-rate-report-realtime.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 7: Run adjacent refresh tests**

Run:

```powershell
node --test tests/data-refresh-wiring.test.mjs tests/piece-rate-report-realtime.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 8: Record the checkpoint**

Run:

```powershell
if (Test-Path .git) {
  git add src/features/attendance/components/PieceRateReportPageClient.js tests/piece-rate-report-realtime.test.mjs
  git commit -m "feat: refresh piece-rate reports through realtime"
} else {
  Write-Output "CHECKPOINT: piece-rate report Realtime wiring complete; Git unavailable"
}
```

---

### Task 4: Verify application and self-host deployment

**Files:**
- Verify: `src/features/attendance/components/PieceRateReportPageClient.js`
- Verify: `src/features/attendance/services/pieceRateReportRealtime.js`
- Verify: generated Realtime migration

**Interfaces:**
- Consumes: implementation from Tasks 1–3.
- Produces: deployable Next.js build and a verified self-host publication.

- [ ] **Step 1: Run ESLint**

Run:

```powershell
npx eslint `
  "src/features/attendance/components/PieceRateReportPageClient.js" `
  "src/features/attendance/services/pieceRateReportRealtime.js" `
  "tests/piece-rate-report-realtime.test.mjs"
```

Expected: exit code 0 with no errors.

- [ ] **Step 2: Run the complete automated test suite**

Run:

```powershell
npm run test
```

Expected: all tests PASS.

- [ ] **Step 3: Build production**

Run:

```powershell
npm run build
```

Expected: Next.js compilation and page-data collection complete successfully.

- [ ] **Step 4: Apply the migration on self-host**

From Windows PowerShell, find and copy the generated migration to the Ubuntu host:

```powershell
$migration = Get-ChildItem `
  "supabase\migrations\*_enable_piece_rate_report_realtime.sql" |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1

scp $migration.FullName `
  administrator@192.168.210.185:/home/administrator/migrations/
```

On the Ubuntu host, copy that migration into the database container and run it:

```bash
migration="$(find /home/administrator/migrations \
  -maxdepth 1 \
  -name '*_enable_piece_rate_report_realtime.sql' \
  -printf '%T@ %p\n' \
  | sort -nr \
  | head -n 1 \
  | cut -d' ' -f2-)"

sudo docker cp "$migration" \
  production-line-supabase-db:/tmp/enable-piece-rate-report-realtime.sql

sudo docker exec production-line-supabase-db \
  psql -U postgres -d postgres \
  --set=ON_ERROR_STOP=on \
  --file=/tmp/enable-piece-rate-report-realtime.sql
```

- [ ] **Step 5: Verify publication membership**

Run:

```bash
sudo docker exec production-line-supabase-db \
  psql -U postgres -d postgres -P pager=off -c "
SELECT pubname, schemaname, tablename
FROM pg_catalog.pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND schemaname = 'public'
  AND tablename = 'production_piece_rate_logs';
"
```

Expected: exactly one row for `supabase_realtime | public | production_piece_rate_logs`.

- [ ] **Step 6: Deploy and restart only the Next.js app**

After copying the rebuilt application to the production Windows host:

```powershell
pm2 restart production-kpf
pm2 save
```

No `kpf-api-gateway` restart is required.

- [ ] **Step 7: Perform two-workstation acceptance verification**

1. Open the detail report on workstation A and workstation B.
2. Keep the same date range visible on both.
3. Add one piece-rate row from the scanning page.
4. Confirm both reports update without Search or browser reload.
5. Edit that row and confirm both reports update once.
6. Cancel that row and confirm both reports update once.
7. Navigate away and back twice, then add another row.
8. Confirm one API reload occurs after the 400 ms debounce, proving channels did not accumulate.

- [ ] **Step 8: Record final checkpoint**

Run:

```powershell
if (Test-Path .git) {
  git add src tests supabase/migrations docs/superpowers
  git commit -m "feat: enable realtime piece-rate reports"
} else {
  Write-Output "FINAL CHECKPOINT: Realtime report implementation verified; Git unavailable"
}
```
