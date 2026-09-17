# Piece-Rate Report Realtime Design

Date: 2026-07-27  
Status: Approved design

## Goal

Make `/production-line/attendance/report/piece-rate?viewMode=detail` refresh its report data automatically across all workstations when piece-rate rows are inserted, updated, cancelled, replaced, or deleted. Users must not need to press Search or reload the browser.

## Scope

The change covers database changes to `public.production_piece_rate_logs`, because this is the source table used by the report API for detail rows, grouped summaries, product views, and employee views.

The first required behavior is detail mode. The same subscription can safely remain active while switching view modes because every mode reads from the same source table and uses the same report loader.

Out of scope:

- Directly applying Realtime payloads to table rows.
- Replacing the existing report API.
- Realtime updates for unrelated attendance tables.
- Realtime Broadcast triggers or private Broadcast channels.
- Polling on a timer.

## Selected Approach

Use Supabase Realtime Postgres Changes only as an invalidation signal. When any `INSERT`, `UPDATE`, or `DELETE` event is received for `public.production_piece_rate_logs`, schedule a reload through the existing `fetchPieceRateReport` API.

This preserves the server-side source of truth for:

- date and text filters;
- hidden cancelled/replaced rows;
- pagination;
- detail/grouped/employee/product transformations;
- totals and wage calculations;
- document lifecycle and replacement relationships.

## Database Configuration

Add `public.production_piece_rate_logs` to the `supabase_realtime` publication with an idempotent migration.

The migration must:

1. check `pg_publication_tables`;
2. add the table only when it is not already published;
3. avoid dropping or recreating the existing publication;
4. leave existing Realtime tables untouched.

RLS remains enabled. Existing authenticated report users already use the `production_piece_rate_logs_read` policy, so Realtime authorization follows the same report permissions.

## Client Architecture

The existing singleton in `src/lib/supabaseClient.js` remains the Realtime client. No service-role credential is exposed to the browser.

`PieceRateReportPageClient` will add:

- a stable Realtime channel created in one `useEffect`;
- one `postgres_changes` listener with:
  - `event: "*"`
  - `schema: "public"`
  - `table: "production_piece_rate_logs"`
- cleanup with `supabase.removeChannel(channel)` or `channel.unsubscribe()`;
- refs holding the latest page, filters, and view mode;
- a shared debounced refresh scheduler.

The existing browser `BroadcastChannel` and Supabase Realtime callback will both call the same scheduler. This prevents a local save from causing one refresh through BroadcastChannel and a second refresh through Realtime.

## Refresh Behavior

The scheduler waits 400 milliseconds after the most recent invalidation event. Multiple inserts from one scan/save operation collapse into one API request.

When the timer runs, it reloads:

- the current pagination page;
- the currently applied filters, not unsubmitted form input;
- the active view mode.

The existing request sequence guard remains responsible for ignoring stale API responses.

Changes outside the selected report date can still trigger a refetch. This is intentional for correctness because Supabase Realtime DELETE events cannot be filtered reliably by report date. Debouncing limits the cost.

## Connection and Error Handling

The report continues to work if the WebSocket cannot subscribe. Search, reset, edit, cancel, export, and print remain available through the existing APIs.

Realtime subscription errors must not clear current report rows. They may be logged once for diagnosis. The implementation will not add a blocking modal or repeated toast.

When the component unmounts, it must:

- clear any pending debounce timer;
- remove the Realtime channel;
- close the existing BroadcastChannel.

This prevents channel leaks and state updates after navigation.

## Self-Hosted Deployment

The production self-host already runs the Supabase Realtime container and exposes the Supabase API through Kong/Cloudflare. Deployment requires:

1. applying the publication migration to `production-line-supabase-db`;
2. deploying the rebuilt Next.js application;
3. restarting `production-kpf`.

No `kpf-api-gateway` change is required.

The deployed environment must retain:

- `NEXT_PUBLIC_SUPABASE_URL=https://supabase-production.kpfoods.co.th`
- the matching public/anon key;
- a working WebSocket route through the existing Supabase public hostname.

## Testing Strategy

Follow test-driven development.

Automated regression tests will first fail until the implementation exists, then verify:

1. the migration publishes only `production_piece_rate_logs` and is idempotent;
2. the component subscribes to all Postgres change events for the correct schema and table;
3. BroadcastChannel and Realtime use the same debounced scheduler;
4. current page, applied filters, and view mode are read from current refs;
5. cleanup removes the channel and clears the timer;
6. existing report behavior remains intact.

Verification after implementation:

- targeted Node tests;
- ESLint for modified files;
- production Next.js build;
- on self-host, inspect publication membership;
- open the report on two machines and create/edit/cancel one piece-rate row;
- confirm both reports update without manual refresh and without duplicate API bursts.

## Acceptance Criteria

- A new piece-rate record appears automatically on every open report.
- Editing, cancelling, replacing, or deleting a record updates every open report.
- Applied filters and current view mode are preserved.
- Bursts of changes cause one debounced report request.
- Leaving and returning to the page does not accumulate channels.
- Failure to connect to Realtime does not break normal report use.
- No service-role or database secret is exposed to the client.
