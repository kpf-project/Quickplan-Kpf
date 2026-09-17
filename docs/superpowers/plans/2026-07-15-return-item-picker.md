# Return Item Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a single-item fallback picker to the stock-return weighing page while preserving the existing scan, realtime scale, tare, save, barcode generation, and automatic-print pipeline.

**Architecture:** A server-only loader reads confirmed issue rows and usage progress from existing Supabase views, then applies a pure eligibility/search/pagination helper. The existing return GET route supports either a barcode lookup or picker-list mode. The client modal selects one barcode and calls the same `handleBarcodeSubmit(barcode)` function used by scanner input.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase JavaScript client, Node test runner, Tailwind CSS, lucide-react.

## Global Constraints

- Do not modify `/production-line/weight-scale`, its inbound component, its API, or its database functions.
- Barcode scanning remains the primary workflow.
- Picker selection never saves a return directly and never bypasses physical weighing.
- Every picker selection must be revalidated through `findIssuedItemByBarcode` before the scale flow starts.
- Select exactly one issued barcode per weighing.
- Reuse the existing source-receipt tare, realtime reading, save, generated return barcode, and automatic print behavior.
- The workspace has an empty `.git` directory without `HEAD` or `config`; record verification checkpoints without running commits.

---

### Task 1: Pure return-picker eligibility and pagination

**Files:**
- Create: `src/features/production-line/services/stockReturnPicker.js`
- Create: `tests/production-stock-return-picker.test.mjs`

**Interfaces:**
- Consumes: issue report rows containing `issue_item_id`, `barcode`, product/LOT snapshots, `weight_kg`, statuses, and `issued_at`; usage rows containing `source_issue_item_id`, returned/wasted/remaining weights.
- Produces: `buildReturnableIssuePickerData({ issueRows, progressRows, search, page, limit })` returning `{ rows, summary, pagination, productOptions }`.

- [ ] **Step 1: Write the failing pure-helper tests**

```js
test("return picker excludes fully consumed issue items and calculates remaining weight", async () => {
  const result = buildReturnableIssuePickerData({ issueRows, progressRows, page: 1, limit: 20 });
  assert.deepEqual(result.rows.map((row) => row.barcode), ["ABC001"]);
  assert.equal(result.rows[0].remainingWeightKg, 7);
});

test("return picker searches barcode product and lot then paginates", async () => {
  const result = buildReturnableIssuePickerData({ issueRows, progressRows: [], search: "lot-b", page: 1, limit: 1 });
  assert.equal(result.rows[0].barcode, "ABC002");
  assert.equal(result.pagination.totalCount, 1);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm run test -- tests/production-stock-return-picker.test.mjs`

Expected: FAIL because `stockReturnPicker.js` does not exist.

- [ ] **Step 3: Implement the minimal pure helper**

```js
export function buildReturnableIssuePickerData({ issueRows = [], progressRows = [], search = "", page = 1, limit = 50 } = {}) {
  const progressByIssueItemId = new Map(progressRows.map((row) => [normalizeText(row.source_issue_item_id), row]));
  const normalizedSearch = normalizeUpperText(search);
  const eligibleRows = issueRows
    .filter((row) => normalizeText(row.item_status) === "confirmed" && normalizeText(row.document_status) === "confirmed")
    .map((row) => normalizePickerRow(row, progressByIssueItemId.get(normalizeText(row.issue_item_id))))
    .filter((row) => row.barcode && row.remainingWeightKg > 0)
    .filter((row) => !normalizedSearch || buildSearchText(row).includes(normalizedSearch));
  return buildPagePayload(eligibleRows, page, limit);
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `npm run test -- tests/production-stock-return-picker.test.mjs`

Expected: 2 tests PASS.

### Task 2: Server loader, route list mode, and client request

**Files:**
- Modify: `src/lib/production-stock-returns.js`
- Modify: `src/app/api/production-stock/returns/route.js`
- Modify: `src/features/production-line/services/productionStockReturnClient.js`
- Test: `tests/production-stock-return-picker.test.mjs`

**Interfaces:**
- Consumes: `buildReturnableIssuePickerData`, `fetchAllSupabaseRows`, `fetchSupabaseRowsByChunks`, existing permission guard and Supabase admin client.
- Produces: `loadReturnableIssuedItems(supabaseAdmin, filters)` and `loadReturnableIssuedItemsRequest(filters)`.

- [ ] **Step 1: Add failing integration-contract tests**

```js
test("return GET route keeps barcode lookup and adds picker list mode", () => {
  assert.match(routeSource, /if \(barcode\)/);
  assert.match(routeSource, /loadReturnableIssuedItems/);
});

test("return client sends no-store picker filters", () => {
  assert.match(clientSource, /export async function loadReturnableIssuedItemsRequest/);
  assert.match(clientSource, /cache:\s*"no-store"/);
});
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `npm run test -- tests/production-stock-return-picker.test.mjs`

Expected: FAIL because list-mode functions do not exist.

- [ ] **Step 3: Implement the server loader**

The loader must fetch all confirmed issue rows in 1,000-row ranges, apply optional `issued_at` date and `product_code` filters, fetch usage progress in bounded chunks, tolerate the existing missing-progress-view compatibility case, and pass rows through the pure helper.

```js
export async function loadReturnableIssuedItems(supabaseAdmin = getSupabaseAdmin(), filters = {}) {
  const issueRows = await fetchAllSupabaseRows(() => buildReturnIssueQuery(supabaseAdmin, filters));
  const progressRows = await loadUsageProgressRows(supabaseAdmin, issueRows.map((row) => row.issue_item_id));
  return buildReturnableIssuePickerData({ issueRows, progressRows, search: filters.search, page: filters.page, limit: filters.limit });
}
```

- [ ] **Step 4: Add route list mode without changing barcode lookup behavior**

```js
const barcode = normalizeParam(searchParams.get("barcode"));
if (barcode) {
  return Response.json({ data: await findIssuedItemByBarcode(barcode, getSupabaseAdmin()) });
}
return Response.json({ data: await loadReturnableIssuedItems(getSupabaseAdmin(), parsedFilters) });
```

- [ ] **Step 5: Add the no-store client request**

```js
export async function loadReturnableIssuedItemsRequest(filters = {}) {
  const params = new URLSearchParams();
  appendReturnPickerFilters(params, filters);
  const response = await fetch(`/api/production-stock/returns?${params.toString()}`, { method: "GET", cache: "no-store" });
  return parseJsonResponse(response);
}
```

- [ ] **Step 6: Run focused tests and verify GREEN**

Run: `npm run test -- tests/production-stock-return-picker.test.mjs`

Expected: all picker helper and integration-contract tests PASS.

### Task 3: Single-select modal wired to the scanner pipeline

**Files:**
- Modify: `src/features/production-line/components/WeightScaleReturnPageClient.js`
- Test: `tests/production-stock-return-picker.test.mjs`
- Regression test: `tests/weight-scale-return-realtime-print.test.mjs`
- Regression test: `tests/stock-return-tare.test.mjs`

**Interfaces:**
- Consumes: `loadReturnableIssuedItemsRequest(filters)` and existing `handleBarcodeSubmit` validation pipeline.
- Produces: `เลือกรายการที่ชั่งคืนได้` button and single-select modal.

- [ ] **Step 1: Add failing UI wiring tests**

```js
test("return picker selection reuses barcode validation and never saves directly", () => {
  assert.match(pageSource, /const handlePickedReturnItem/);
  assert.match(pageSource, /handleBarcodeSubmit\(row\.barcode\)/);
  const handler = sliceFunction(pageSource, "const handlePickedReturnItem", "const handlePickerPageChange");
  assert.doesNotMatch(handler, /createStockReturnRequest/);
});

test("return page exposes a single-select eligible-item modal", () => {
  assert.match(pageSource, /เลือกรายการที่ชั่งคืนได้/);
  assert.match(pageSource, /isReturnPickerOpen/);
  assert.doesNotMatch(pageSource, /selectedReturnPickerItems/);
});
```

- [ ] **Step 2: Run focused test and verify RED**

Run: `npm run test -- tests/production-stock-return-picker.test.mjs`

Expected: FAIL because the picker UI is absent.

- [ ] **Step 3: Refactor barcode submit to accept an optional explicit barcode**

```js
const handleBarcodeSubmit = async (barcodeOverride = "") => {
  const normalizedBarcode = String(barcodeOverride || barcode).trim().toUpperCase();
  // Existing validation, source tare, auto-connect, scale, save and print flow remains unchanged.
};
```

- [ ] **Step 4: Add picker state, loading, filters, pagination, and single-selection handler**

```js
const handlePickedReturnItem = async (row) => {
  setIsReturnPickerOpen(false);
  await handleBarcodeSubmit(row.barcode);
};
```

The modal includes date-from/date-to, search, product select, loading/error/empty states, a table with barcode/product/LOT/issued/returned/wasted/remaining weights, and previous/next pagination. Every row has one `เลือก` button; there are no checkboxes or bulk-save actions.

- [ ] **Step 5: Run return regression tests**

Run: `npm run test -- tests/production-stock-return-picker.test.mjs tests/weight-scale-return-realtime-print.test.mjs tests/stock-return-tare.test.mjs tests/production-stock-return-reissue.test.mjs`

Expected: all tests PASS.

- [ ] **Step 6: Run lint and production build**

Run: `npx eslint "src/features/production-line/services/stockReturnPicker.js" "src/lib/production-stock-returns.js" "src/app/api/production-stock/returns/route.js" "src/features/production-line/services/productionStockReturnClient.js" "src/features/production-line/components/WeightScaleReturnPageClient.js" "tests/production-stock-return-picker.test.mjs"`

Expected: exit code 0.

Run: `npm run build`

Expected: exit code 0.

- [ ] **Step 7: Verify inbound files remain byte-identical**

Run SHA-256 checks for:

- `src/app/production-line/weight-scale/page.js` expected `45CD72961EA1220D83C80FB703E3401937C98DF716458FE568BCDDD46F46B6F6`
- `src/features/production-line/components/WeightScalePageClient.js` expected `172EC598C512485E5B9A94E17B3E037C54B74466E835804FE286EA8F904E381C`

Expected: both hashes remain unchanged.
