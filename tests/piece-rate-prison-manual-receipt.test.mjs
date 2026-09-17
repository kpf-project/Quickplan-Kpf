import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const read = (path) => fs.readFileSync(path, "utf8");

test("piece-rate workflow exposes the manual prison WIP receipt mode", () => {
  const tabs = read("src/features/attendance/components/PieceRateWorkflowTabs.js");
  const page = read("src/app/production-line/attendance/piece-rate-scan/PieceRateScanPageClient.js");

  assert.match(tabs, /mode: "prison-receipt"/);
  assert.match(tabs, /label: "รับเข้าเรือนจำ"/);
  assert.match(page, /PieceRatePrisonReceiptForm/);
  assert.ok(
    page.indexOf('desktopWorkflowMode === "prison-receipt"') > page.indexOf("const isBusy ="),
    "prison receipt render branch must be in the component render flow, not inside an effect"
  );
});

test("manual prison receipt is fixed to WKB-0002-2 and records trays, lots and weight", () => {
  const form = read("src/app/production-line/attendance/piece-rate-scan/PieceRatePrisonReceiptForm.js");

  assert.match(form, /WKB-0002-2/);
  assert.match(form, /กระบะ/);
  assert.match(form, /หมายเลข LOT/);
  assert.match(form, /น้ำหนัก \(\{product\?\.weightUnit/);
  assert.match(form, /เพิ่ม LOT/);
  assert.doesNotMatch(form, /เลือก FG|พนักงาน/);
});

test("manual prison receipt API uses one atomic database RPC and lists recent receipts", () => {
  const route = read("src/app/api/attendance/piece-rate/prison-receipts/route.js");
  const service = read("src/features/attendance/services/pieceRatePrisonReceiptService.js");

  assert.match(route, /createPieceRatePrisonReceipt/);
  assert.match(route, /listPieceRatePrisonReceipts/);
  assert.match(service, /create_piece_rate_prison_receipt_atomic/);
  assert.match(service, /PRW-/);
});

test("manual prison receipt migration creates audited documents and stock movements", () => {
  const migrations = fs.readdirSync("supabase/migrations");
  const migrationName = migrations.find((name) => name.endsWith("_add_piece_rate_prison_manual_receipts.sql"));

  assert.ok(migrationName, "manual prison receipt migration must exist");
  const migration = read(`supabase/migrations/${migrationName}`);
  assert.match(migration, /production_piece_rate_prison_receipts/);
  assert.match(migration, /production_piece_rate_prison_receipt_items/);
  assert.match(migration, /PRW-/);
  assert.match(migration, /piece_rate_prison_receipt/);
  assert.match(migration, /quantity_in/);
  assert.match(migration, /weight_in_kg/);
  assert.match(migration, /enable row level security/);
});

test("fixed prison receipt product keeps a dedicated loading status column", () => {
  const form = read("src/app/production-line/attendance/piece-rate-scan/PieceRatePrisonReceiptForm.js");

  assert.match(form, /className=\{styles\.productStatus\}/);
  assert.match(form, /loading \? <Loader2 className=\{styles\.spin\} \/> : <PackagePlus/);
});
