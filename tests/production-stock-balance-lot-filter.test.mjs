import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { buildCumulativeLotBalanceRows } from "../src/lib/production-stock-balance-rows.js";

test("movement summary supports searchable multi-LOT filtering end to end", () => {
  const component = readFileSync("src/features/production-line/components/ProductionStockMovementSummaryReportPageClient.js", "utf8");
  const client = readFileSync("src/features/production-line/services/productionStockIssueClient.js", "utf8");
  const route = readFileSync("src/app/api/production-stock/balance/summary/route.js", "utf8");
  const service = readFileSync("src/lib/production-stock-balance.js", "utf8");

  assert.match(component, /เลือก LOT ที่ต้องการแสดง/);
  assert.match(component, /พิมพ์ค้นหาเลข LOT/);
  assert.match(component, /type="checkbox"/);
  assert.match(component, /highlightMatch\(option\.lotNo, lotSearchQuery\)/);
  assert.match(component, /group\.productCode/);
  assert.match(client, /lotNos: Array\.isArray\(lotNos\)/);
  assert.match(route, /normalizeLotNos/);
  assert.match(service, /filteredDisplayRows/);
  assert.match(service, /filteredAllRows/);
  assert.match(service, /selection\.indexOf\("::"\)/);
});

test("LOT balance uses canonical active receipts and issues instead of orphan ledger rows", () => {
  const service = readFileSync("src/lib/production-stock-balance.js", "utf8");
  const lotLoader = service.slice(
    service.indexOf("export async function loadProductionStockLotBalanceSummaryReportDataUncached"),
    service.indexOf("export async function loadProductionStockLotBalanceSummaryReportData(")
  );

  assert.match(lotLoader, /loadProductionStockMovementSummaryReportData/);
  assert.doesNotMatch(lotLoader, /production_stock_balances_v/);
  assert.match(lotLoader, /inboundQuantity: normalizeDecimal\(r\.inbound_quantity\)/);
  assert.match(lotLoader, /issueQuantity: normalizeDecimal\(r\.issue_quantity\)/);
  assert.match(lotLoader, /returnQuantity: normalizeDecimal\(r\.return_quantity\)/);
  assert.match(lotLoader, /wasteQuantity: normalizeDecimal\(r\.waste_quantity\)/);
  assert.match(lotLoader, /actualQuantity: normalizeDecimal\(r\.actual_quantity\)/);
});

test("fast LOT balance RPC returns cumulative movement columns", () => {
  const migration = readFileSync(
    "supabase/migrations/20260909085127_add_cumulative_columns_to_stock_lot_balances.sql",
    "utf8"
  );

  for (const column of [
    "inbound_quantity",
    "issue_quantity",
    "return_quantity",
    "waste_quantity",
    "actual_quantity",
    "balance_quantity",
  ]) {
    assert.match(migration, new RegExp(`${column} numeric`));
  }
});

test("LOT balance preserves cumulative movement columns", () => {
  const rows = buildCumulativeLotBalanceRows([
    {
      issueDate: "2026-06-30",
      productCode: "WKB-0002",
      productName: "Product",
      lotNo: "LOT-1",
      inboundQuantity: 10,
      inboundWeightKg: 120,
      issueQuantity: 0,
      issueWeightKg: 0,
      returnQuantity: 0,
      returnWeightKg: 0,
      wasteQuantity: 0,
      wasteWeightKg: 0,
      balanceQuantity: 10,
      balanceWeightKg: 120,
    },
    {
      issueDate: "2026-07-01",
      productCode: "WKB-0002",
      productName: "Product",
      lotNo: "LOT-1",
      inboundQuantity: 0,
      inboundWeightKg: 0,
      issueQuantity: 8,
      issueWeightKg: 96,
      returnQuantity: 1,
      returnWeightKg: 12,
      wasteQuantity: 1,
      wasteWeightKg: 12,
      balanceQuantity: 2,
      balanceWeightKg: 24,
    },
  ]);

  assert.deepEqual(rows[0], {
    productCode: "WKB-0002",
    productName: "Product",
    lotNo: "LOT-1",
    openingQuantity: 0,
    openingWeightKg: 0,
    inboundQuantity: 10,
    inboundWeightKg: 120,
    issueQuantity: 8,
    issueWeightKg: 96,
    returnQuantity: 1,
    returnWeightKg: 12,
    wasteQuantity: 1,
    wasteWeightKg: 12,
    actualQuantity: 8,
    actualWeightKg: 96,
    balanceQuantity: 2,
    balanceWeightKg: 24,
  });
});
