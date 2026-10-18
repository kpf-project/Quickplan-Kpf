import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const migration = read("supabase/migrations/20260907123000_harden_weight_scale_stock_lifecycle.sql");
const concurrencyMigration = read("supabase/migrations/20260911045858_harden_receipt_idempotency_and_atomic_batch_issue.sql");
const idempotentCancellationMigrationName = fs
  .readdirSync(path.join(root, "supabase/migrations"))
  .find((name) => name.endsWith("_make_weight_receipt_cancellation_idempotent.sql"));

test("stock mutation routes require attendance manage permission", () => {
  for (const route of [
    "src/app/api/scale/receipts/route.js",
    "src/app/api/scale/receipts/[receiptId]/cancel/route.js",
    "src/app/api/scale/receipts/cancel-by-barcode/route.js",
    "src/app/api/production-stock/issues/route.js",
    "src/app/api/production-stock/issues/batch/route.js",
    "src/app/api/production-stock/issues/[issueItemId]/cancel/route.js",
    "src/app/api/production-stock/returns/route.js",
    "src/app/api/production-stock/waste/route.js",
  ]) {
    const source = read(route);
    assert.match(source, /MANAGE_PERMISSION_KEYS/);
    assert.match(source, /"production-line-attendance-manage"/);
  }
});

test("database hardening keeps mutation RPCs server-only", () => {
  assert.match(migration, /cancel_production_stock_issue_item[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /create_production_stock_return\(text, numeric, uuid, text\)[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /cancel_production_weight_receipt[\s\S]*to service_role/);
});

test("receipt cancellation locks and validates before one atomic update", () => {
  assert.match(migration, /cancel_production_weight_receipt/);
  assert.match(migration, /for update/);
  assert.match(migration, /i\.status = 'confirmed'[\s\S]*d\.status = 'confirmed'/);
  assert.match(migration, /update public\.production_weight_receipts[\s\S]*status = 'voided'/);
  assert.match(
    read("src/lib/scale/receipts.js"),
    /rpc\(\s*"cancel_production_weight_receipt"/
  );
});

test("repeated receipt cancellation returns success without writing another reversal", () => {
  assert.ok(idempotentCancellationMigrationName, "idempotent cancellation migration is missing");
  const idempotentMigration = read(`supabase/migrations/${idempotentCancellationMigrationName}`);

  assert.match(idempotentMigration, /v_receipt\.status = 'voided'/);
  assert.match(idempotentMigration, /'alreadyCancelled', true/);
  assert.match(idempotentMigration, /update public\.production_weight_receipts[\s\S]*status = 'voided'/);
});

test("return barcodes are serialized by root receipt and database-unique", () => {
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /next_production_stock_return_barcode/);
  assert.match(migration, /create unique index production_weight_receipts_barcode_uidx/);
});

test("receipt retries reuse one database row by request id", () => {
  assert.match(concurrencyMigration, /add column if not exists request_id uuid/);
  assert.match(concurrencyMigration, /production_weight_receipts_request_id_uidx/);
  const receiptService = read("src/lib/scale/receipts.js");
  assert.match(receiptService, /request_id: normalizedRequestId/);
  assert.match(receiptService, /\.eq\("request_id", normalizedRequestId\)/);
  for (const page of ["WeightScalePageClient.js", "WeightScaleLivePageClient.js"]) {
    const source = read(`src/features/production-line/components/${page}`);
    assert.match(source, /receiptRequestIdRef\.current \|\| \(receiptRequestIdRef\.current = crypto\.randomUUID\(\)\)/);
    assert.match(source, /receiptRequestIdRef\.current = null/);
  }
  for (const route of [
    "src/app/api/scale/receipts/route.js",
    "src/app/api/scale/live/receipts/route.js",
  ]) {
    assert.match(read(route), /body\?\.requestId \|\| crypto\.randomUUID\(\)/);
  }
});
