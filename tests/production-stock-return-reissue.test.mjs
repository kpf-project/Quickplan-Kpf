import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");
const issueServicePath = path.join(
  repoRoot,
  "src/lib/production-stock-issues.js"
);
const migrationPath = path.join(
  repoRoot,
  "supabase/migrations/20260714115352_allow_return_receipt_reissue.sql"
);

function readIssueService() {
  return fs.readFileSync(issueServicePath, "utf8");
}

function readMigration() {
  return fs.readFileSync(migrationPath, "utf8");
}

test("stock issue accepts a persisted return-receipt barcode", () => {
  const source = readIssueService();

  assert.doesNotMatch(source, /assertIssueBarcodeIsOriginalReceipt/);
  assert.doesNotMatch(source, /filter\(isOriginalReceiptForIssue\)/);
});

test("available issue picker keeps each return receipt at its own unissued net weight", () => {
  const source = readIssueService();

  assert.match(source, /const originalReceiptRows\s*=/);
  assert.match(source, /const returnReceiptRows\s*=/);
  assert.match(source, /loadActiveIssuedReceiptIdSet\(/);
  assert.match(
    source,
    /isReturnReceiptMetadata\(row\?\.metadata\)[\s\S]*normalizeDecimal\(row\?\.net_weight_kg\)/
  );
});

test("original receipt availability does not also absorb return-receipt weight", () => {
  const source = readIssueService();
  const functionStart = source.indexOf("async function loadReceiptAvailableWeightMap");
  const functionEnd = source.indexOf("function matchesAvailableReceiptSearch", functionStart);
  const functionSource = source.slice(functionStart, functionEnd);

  assert.ok(functionStart > -1 && functionEnd > functionStart);
  assert.doesNotMatch(functionSource, /return_in/);
  assert.match(functionSource, /\["issue_out", "adjustment_in"\]/);
});

test("cancelled issue restores the original receipt without doubling its weight", () => {
  const source = readIssueService();
  const functionStart = source.indexOf("async function loadReceiptAvailableWeightMap");
  const functionEnd = source.indexOf("function matchesAvailableReceiptSearch", functionStart);
  const functionSource = source.slice(functionStart, functionEnd);

  assert.ok(functionStart > -1 && functionEnd > functionStart);
  assert.match(functionSource, /if \(movementType === "issue_out"\)/);
  assert.doesNotMatch(
    functionSource,
    /movementType === "issue_out" && activeIssuedReceiptIds\.has/
  );
  assert.match(
    functionSource,
    /movementType === "adjustment_in"[\s\S]*reversedMovementType[\s\S]*=== "issue_out"/
  );
});

test("stock issue RPC atomically issues a return receipt at exactly its own net weight", () => {
  const source = readMigration();

  assert.match(source, /create or replace function public\.create_production_stock_issue/);
  assert.match(source, /receipts\.metadata as receipt_metadata/);
  assert.match(source, /for update of receipts/);
  assert.match(source, /v_is_return_receipt boolean/);
  assert.match(source, /if v_is_return_receipt then/);
  assert.match(source, /v_issue_weight_kg := round\(coalesce\(v_receipt\.net_weight_kg, 0\), 3\)/);
  assert.doesNotMatch(source, /movement_type\s*=\s*'return_in'/);
});

test("return receipt issue is single-use and retains root traceability", () => {
  const source = readMigration();

  assert.match(source, /drop trigger if exists production_stock_issue_items_prevent_return_receipt/);
  assert.match(source, /v_has_active_issue boolean/);
  assert.match(source, /items\.source_receipt_id = v_receipt\.receipt_id/);
  assert.match(source, /items\.status = 'confirmed'/);
  assert.match(source, /documents\.status = 'confirmed'/);
  assert.match(source, /บาร์โค้ดใบชั่งคืนนี้ถูกเบิกไปแล้ว/);
  assert.match(source, /'sourceReceiptId', v_receipt\.receipt_id/);
  assert.match(source, /'rootSourceReceiptId', v_root_receipt_id/);
  assert.match(source, /'isReturnReceipt', v_is_return_receipt/);
  assert.match(source, /departments\.code = 'KP13'/);
});
