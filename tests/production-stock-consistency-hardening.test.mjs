import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const migrationDir = path.join(root, "supabase", "migrations");

test("stock issue RPC owns the issue date and serializes LOT balance checks", () => {
  const migration = fs
    .readdirSync(migrationDir)
    .find((name) => name.endsWith("_harden_production_stock_issue_consistency.sql"));

  assert.ok(migration, "consistency hardening migration is missing");
  const sql = fs.readFileSync(path.join(migrationDir, migration), "utf8");
  assert.match(sql, /p_issue_date date/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /v_lot_balance_weight_kg < 0/);
  assert.match(sql, /create or replace function public\.create_production_stock_issue\([\s\S]*null::date/);
  assert.match(sql, /revoke all on function public\.create_production_stock_issue_core/);
});

test("application passes issue date into RPC without follow-up writes", () => {
  const source = fs.readFileSync(
    path.join(root, "src", "lib", "production-stock-issues.js"),
    "utf8"
  );

  assert.match(source, /p_issue_date: input\?\.issueDate \|\| null/);
  assert.doesNotMatch(source, /update\(\{ issue_date: customDate \}\)/);
  assert.doesNotMatch(source, /update\(\{ movement_date: customDate \}\)/);
});

test("multi-barcode issue is one database transaction with no partial success", () => {
  const migration = fs.readFileSync(
    path.join(migrationDir, "20260911045858_harden_receipt_idempotency_and_atomic_batch_issue.sql"),
    "utf8"
  );
  const service = fs.readFileSync(path.join(root, "src/lib/production-stock-issues.js"), "utf8");

  assert.match(migration, /create_production_stock_issue_batch_atomic/);
  assert.match(migration, /foreach v_barcode in array p_barcodes loop/);
  assert.match(migration, /public\.create_production_stock_issue\(/);
  assert.match(migration, /from public, anon, authenticated/);
  assert.match(service, /rpc\("create_production_stock_issue_batch_atomic"/);
  assert.doesNotMatch(service, /for \(const barcode of barcodes\)/);
});

test("issue and cancellation API routes record success and failure", () => {
  const routes = [
    "src/app/api/production-stock/issues/route.js",
    "src/app/api/production-stock/issues/batch/route.js",
    "src/app/api/production-stock/issues/[issueItemId]/cancel/route.js",
  ].map((file) => fs.readFileSync(path.join(root, file), "utf8"));

  assert.match(routes[0], /production-stock\.issue\.success/);
  assert.match(routes[0], /production-stock\.issue\.failure/);
  assert.match(routes[1], /production-stock\.issue-batch\.completed/);
  assert.match(routes[1], /production-stock\.issue-batch\.failure/);
  assert.match(routes[2], /production-stock\.issue-cancel\.success/);
  assert.match(routes[2], /production-stock\.issue-cancel\.failure/);
});

test("historical report treats a later cancellation as active at the report cutoff", async () => {
  const { isRecordActiveAt } = await import("../src/lib/record-status-as-of.js");
  const cutoff = "2026-09-01T23:59:59.999+07:00";

  assert.equal(isRecordActiveAt("confirmed", null, cutoff), true);
  assert.equal(isRecordActiveAt("voided", "2026-09-07T16:00:00+07:00", cutoff), true);
  assert.equal(isRecordActiveAt("voided", "2026-09-01T16:00:00+07:00", cutoff), false);
  assert.equal(isRecordActiveAt("voided", null, cutoff), false);
  assert.equal(isRecordActiveAt("draft", null, cutoff), false);
  assert.equal(isRecordActiveAt(null, null, cutoff), false);
});

test("historical report excludes records created or restored after the report cutoff", async () => {
  const { isRecordActiveAt, toBangkokReportCutoffIso } = await import("../src/lib/record-status-as-of.js");
  const cutoff = "2026-09-01T23:59:59.999+07:00";

  assert.equal(toBangkokReportCutoffIso("2026-09-01"), "2026-09-02T23:59:59.999+07:00");

  assert.equal(isRecordActiveAt("confirmed", null, cutoff, "2026-09-03T10:00:00+07:00"), false);
  assert.equal(
    isRecordActiveAt(
      "confirmed",
      null,
      cutoff,
      "2026-08-21T10:00:00+07:00",
      "2026-09-07T10:00:00+07:00"
    ),
    false
  );
  assert.equal(
    isRecordActiveAt(
      "confirmed",
      null,
      cutoff,
      "2026-08-21T10:00:00+07:00",
      "2026-08-24T10:00:00+07:00"
    ),
    true
  );
});

test("stock history uses the selected issue date and dates reversals when cancelled", () => {
  const stabilityMigration = fs.readFileSync(
    path.join(migrationDir, "20260908091549_stabilize_production_stock_history.sql"),
    "utf8"
  );
  const historicalDateMigration = fs.readFileSync(
    path.join(
      migrationDir,
      "20260909111509_allow_user_selected_historical_stock_issue_dates.sql"
    ),
    "utf8"
  );

  assert.match(stabilityMigration, /production_stock_business_date/);
  assert.match(stabilityMigration, /cancellationProductionDate/);
  assert.match(stabilityMigration, /document_voided_at/);
  assert.match(
    historicalDateMigration,
    /drop trigger if exists production_stock_issue_documents_guard_date/
  );
  assert.match(
    historicalDateMigration,
    /drop function if exists public\.guard_production_stock_issue_date\(\)/
  );
});

test("movement report loads pre-period opening totals from one database aggregate", () => {
  const source = fs.readFileSync(path.join(root, "src", "lib", "production-stock-balance.js"), "utf8");
  const migration = fs.readFileSync(
    path.join(migrationDir, "20260908100130_add_stock_status_timeline.sql"),
    "utf8"
  );

  assert.match(source, /get_production_stock_opening_as_of/);
  assert.doesNotMatch(source, /asOfDate:\s*dateTo/);
  assert.doesNotMatch(source, /asOfDate:\s*previousReportDate/);
  assert.match(migration, /create or replace function public\.get_production_stock_opening_as_of/);
});

test("prison LOT balance carries pre-period stock into the closing balance", async () => {
  const { buildPrisonLotBalanceRows } = await import(
    "../src/lib/production-prison-balance-rows.js"
  );

  const rows = buildPrisonLotBalanceRows(
    [
      {
        issueDate: "2026-09-18",
        lotNo: "1809260068-1",
        productCode: "WKB-0068",
        productName: "แผ่นแครกเกอร์โบตั๋นเรือนจำ",
        quantity: 240,
        weightKg: 2895.34,
      },
      {
        issueDate: "2026-09-30",
        lotNo: "3009260068-1",
        productCode: "WKB-0068",
        productName: "แผ่นแครกเกอร์โบตั๋นเรือนจำ",
        quantity: 240,
        weightKg: 2891.25,
      },
      {
        issueDate: "2026-10-01",
        lotNo: "3009260068-1",
        productCode: "WKB-0068",
        productName: "แผ่นแครกเกอร์โบตั๋นเรือนจำ",
        quantity: 20,
        weightKg: 240.93,
      },
    ],
    [
      {
        issueDate: "2026-09-29",
        lotNo: "1809260068-1",
        productCode: "WKB-0068",
        productName: "แผ่นแครกเกอร์โบตั๋นเรือนจำ",
        quantity: 197,
        weightKg: 2376.67,
      },
      {
        issueDate: "2026-09-30",
        lotNo: "1809260068-1",
        productCode: "WKB-0068",
        productName: "แผ่นแครกเกอร์โบตั๋นเรือนจำ",
        quantity: 39,
        weightKg: 470.37,
      },
      {
        issueDate: "2026-10-02",
        lotNo: "3009260068-1",
        productCode: "WKB-0068",
        productName: "แผ่นแครกเกอร์โบตั๋นเรือนจำ",
        quantity: 186,
        weightKg: 2240.87,
      },
    ],
    "2026-09-30"
  );

  const carriedLot = rows.find((row) => row.lotNo === "1809260068-1");
  assert.deepEqual(carriedLot, {
    lotNo: "1809260068-1",
    productCode: "WKB-0068",
    productName: "แผ่นแครกเกอร์โบตั๋นเรือนจำ",
    openingQuantity: 43,
    openingWeightKg: 518.67,
    inboundQuantity: 0,
    inboundWeightKg: 0,
    issueQuantity: 39,
    issueWeightKg: 470.37,
    balanceQuantity: 4,
    balanceWeightKg: 48.3,
    lastInboundDate: "2026-09-18",
  });

  const currentLot = rows.find((row) => row.lotNo === "3009260068-1");
  assert.equal(currentLot.openingQuantity, 0);
  assert.equal(currentLot.inboundQuantity, 260);
  assert.equal(currentLot.issueQuantity, 186);
  assert.equal(currentLot.balanceQuantity, 74);
  assert.equal(currentLot.balanceWeightKg, 891.31);
});
