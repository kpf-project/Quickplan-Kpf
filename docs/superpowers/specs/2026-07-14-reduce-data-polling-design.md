# Reduce Data Polling Design

## Goal

Reduce unnecessary Supabase egress without allowing users to unknowingly work from stale data.

## Approved scope

- `/production-line/bom`: remove the five-second full BOM reload and add an explicit refresh action. Existing reloads after save, import, approval, and other mutations remain unchanged.
- `/production-line/planning/claims`: disable the 15-second groups poll, keep refreshes after successful mutations, add a manual refresh action, and revalidate on focus with a 60-second throttle.
- `/admin/performance`: remove the 15-second timer, retain the initial load, keep the existing refresh button, and show the last successful refresh time.
- Raw Materials is excluded after inspection because the active `RawMaterialsPageClient` does not use the polling hook; the hook is currently commented out at the integration point.

## User experience

- Every page still loads current data when opened.
- Refresh buttons fetch the latest server data and show a busy state while running.
- Successful mutations continue to refresh the affected data automatically.
- A visible “last updated” time makes freshness explicit.
- BOM refresh is disabled while there are unsaved edits so server data cannot overwrite user input.

## Data flow

- BOM calls the existing full BOM endpoint only on selection, mutation completion, or manual refresh.
- Material Claims uses the existing SWR `mutate()` functions for workspace and groups. Focus revalidation is throttled; fixed-interval polling is disabled.
- Performance calls its existing endpoint on mount and manual refresh only.

## Verification

- A wiring regression test asserts that the old 5-second and 15-second timers are absent.
- The test asserts that manual refresh controls and freshness indicators are present.
- Run the focused test, lint the touched files, then run the full test suite and production build.
