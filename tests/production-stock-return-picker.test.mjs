import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const pickerHelperPath = path.join(
  repoRoot,
  "src/features/production-line/services/stockReturnPicker.js"
);
const returnServerPath = path.join(repoRoot, "src/lib/production-stock-returns.js");
const returnRoutePath = path.join(
  repoRoot,
  "src/app/api/production-stock/returns/route.js"
);
const returnClientPath = path.join(
  repoRoot,
  "src/features/production-line/services/productionStockReturnClient.js"
);
const returnPagePath = path.join(
  repoRoot,
  "src/features/production-line/components/WeightScaleReturnPageClient.js"
);

const issueRows = [
  {
    issue_item_id: "issue-1",
    issue_document_id: "doc-1",
    barcode: "ABC001",
    product_code: "WKB-0001",
    product_name_snapshot: "Product A",
    lot_no: "LOT-A",
    weight_kg: 10,
    item_status: "confirmed",
    document_status: "confirmed",
    issued_at: "2026-07-14T08:00:00.000Z",
  },
  {
    issue_item_id: "issue-2",
    issue_document_id: "doc-2",
    barcode: "ABC002",
    product_code: "WKB-0002",
    product_name_snapshot: "Product B",
    lot_no: "LOT-B",
    weight_kg: 5,
    item_status: "confirmed",
    document_status: "confirmed",
    issued_at: "2026-07-15T08:00:00.000Z",
  },
  {
    issue_item_id: "issue-cancelled",
    issue_document_id: "doc-3",
    barcode: "ABC003",
    product_code: "WKB-0003",
    product_name_snapshot: "Product C",
    lot_no: "LOT-C",
    weight_kg: 8,
    item_status: "cancelled",
    document_status: "confirmed",
    issued_at: "2026-07-15T09:00:00.000Z",
  },
];

const progressRows = [
  {
    source_issue_item_id: "issue-1",
    return_count: 1,
    returned_weight_kg: 2,
    waste_count: 1,
    wasted_weight_kg: 1,
    remaining_weight_kg: 7,
  },
  {
    source_issue_item_id: "issue-2",
    return_count: 1,
    returned_weight_kg: 5,
    waste_count: 0,
    wasted_weight_kg: 0,
    remaining_weight_kg: 0,
  },
];

test("return picker excludes fully consumed issue items and calculates remaining weight", async () => {
  const { buildReturnableIssuePickerData } = await import(pathToFileURL(pickerHelperPath));

  const result = buildReturnableIssuePickerData({
    issueRows,
    progressRows,
    page: 1,
    limit: 20,
  });

  assert.deepEqual(result.rows.map((row) => row.barcode), ["ABC001"]);
  assert.equal(result.rows[0].originalWeightKg, 10);
  assert.equal(result.rows[0].returnedWeightKg, 2);
  assert.equal(result.rows[0].wastedWeightKg, 1);
  assert.equal(result.rows[0].remainingWeightKg, 7);
  assert.deepEqual(result.summary, {
    totalCount: 1,
    totalRemainingWeightKg: 7,
  });
});

test("return picker searches barcode product and lot then paginates", async () => {
  const { buildReturnableIssuePickerData } = await import(pathToFileURL(pickerHelperPath));
  const searchableRows = issueRows.map((row) => ({
    ...row,
    item_status: "confirmed",
  }));

  const lotResult = buildReturnableIssuePickerData({
    issueRows: searchableRows,
    progressRows: [],
    search: "lot-b",
    page: 1,
    limit: 1,
  });

  assert.equal(lotResult.rows[0].barcode, "ABC002");
  assert.equal(lotResult.pagination.totalCount, 1);
  assert.equal(lotResult.pagination.totalPages, 1);

  const pageResult = buildReturnableIssuePickerData({
    issueRows: searchableRows,
    progressRows: [],
    page: 2,
    limit: 1,
  });

  assert.equal(pageResult.rows[0].barcode, "ABC002");
  assert.equal(pageResult.pagination.page, 2);
  assert.equal(pageResult.pagination.totalCount, 3);
  assert.deepEqual(pageResult.productOptions, [
    { code: "WKB-0001", name: "Product A" },
    { code: "WKB-0002", name: "Product B" },
    { code: "WKB-0003", name: "Product C" },
  ]);
});

test("return server loads confirmed issue candidates and usage progress for the picker", () => {
  const source = fs.readFileSync(returnServerPath, "utf8");

  assert.match(source, /export async function loadReturnableIssuedItems/);
  assert.match(source, /fetchAllSupabaseRows/);
  assert.match(source, /fetchSupabaseRowsByChunks/);
  assert.match(source, /buildReturnableIssuePickerData/);
  assert.match(source, /production_stock_issue_report_lines_v/);
  assert.match(source, /production_stock_issue_usage_progress_v/);
});

test("return picker fails closed when usage progress cannot be verified", () => {
  const source = fs.readFileSync(returnServerPath, "utf8");
  const loaderStart = source.indexOf("async function loadUsageProgressRows");
  const loaderEnd = source.indexOf("export async function loadReturnableIssuedItems", loaderStart);
  const loaderSource = source.slice(loaderStart, loaderEnd);

  assert.match(loaderSource, /if \(isMissingUsageProgressError\(error\)\) \{\s*throw new Error/);
  assert.doesNotMatch(loaderSource, /if \(isMissingUsageProgressError\(error\)\) \{\s*return \[\]/);
});

test("return GET route keeps barcode lookup and adds picker list mode", () => {
  const source = fs.readFileSync(returnRoutePath, "utf8");

  assert.match(source, /if \(barcode\)/);
  assert.match(source, /findIssuedItemByBarcode\(barcode/);
  assert.match(source, /loadReturnableIssuedItems/);
  assert.doesNotMatch(source, /if \(!barcode\) \{\s*return Response\.json\(\{ error: "Barcode is required"/);
});

test("return client sends picker filters with no-store caching", () => {
  const source = fs.readFileSync(returnClientPath, "utf8");

  assert.match(source, /export async function loadReturnableIssuedItemsRequest/);
  assert.match(source, /dateFrom/);
  assert.match(source, /dateTo/);
  assert.match(source, /productCodes/);
  assert.match(source, /cache:\s*"no-store"/);
});

test("return picker selection reuses barcode validation and never saves directly", () => {
  const source = fs.readFileSync(returnPagePath, "utf8");
  const handlerStart = source.indexOf("const handlePickedReturnItem");
  const handlerEnd = source.indexOf("const handleReturnPickerPageChange", handlerStart);
  const handlerSource = source.slice(handlerStart, handlerEnd);

  assert.ok(handlerStart > -1, "single-item picker handler should exist");
  assert.match(handlerSource, /handleBarcodeSubmit\(row\.barcode\)/);
  assert.doesNotMatch(handlerSource, /createStockReturnRequest/);
});

test("return page exposes a single-select eligible-item modal", () => {
  const source = fs.readFileSync(returnPagePath, "utf8");

  assert.match(source, /loadReturnableIssuedItemsRequest/);
  assert.match(source, /isReturnPickerOpen/);
  assert.match(source, /เลือกรายการที่ชั่งคืนได้/);
  assert.match(source, /returnPickerRows\.map/);
  assert.doesNotMatch(source, /selectedReturnPickerItems/);
});
