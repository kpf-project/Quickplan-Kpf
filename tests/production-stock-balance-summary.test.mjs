import assert from "node:assert/strict";
import test from "node:test";

import {
  buildProductionStockMovementRows,
  buildProductionStockMovementSummary,
  recalculateProductionStockMovementBalances,
} from "../src/lib/production-stock-balance-rows.js";
import * as productionStockBalanceRows from "../src/lib/production-stock-balance-rows.js";

test("negative LOT balances remain visible and carry forward until replenished", () => {
  const base = { productCode: "WKB-0053", lotNo: "2408260053-1" };
  const rows = recalculateProductionStockMovementBalances([
    { ...base, issueDate: "2026-09-03", issueQuantity: 38, issueWeightKg: 682.75 },
    { ...base, issueDate: "2026-09-04", inboundQuantity: 1, inboundWeightKg: 10 },
    { ...base, issueDate: "2026-09-05", inboundQuantity: 2, inboundWeightKg: 20 },
  ], new Map([["WKB-0053|2408260053-1", { quantity: 36, weightKg: 661.2 }]]));
  const day = (date) => rows.find((row) => row.issueDate === date);
  assert.equal(day("2026-09-03").balanceQuantity, -2);
  assert.equal(day("2026-09-03").balanceWeightKg, -21.55);
  assert.equal(day("2026-09-04").openingWeightKg, -21.55);
  assert.equal(day("2026-09-04").balanceQuantity, -1);
  assert.equal(day("2026-09-04").balanceWeightKg, -11.55);
  assert.equal(day("2026-09-05").balanceQuantity, 1);
  assert.equal(day("2026-09-05").balanceWeightKg, 8.45);
});

test("negative balances are retained on days with no movements", () => {
  const rows = productionStockBalanceRows.expandProductionStockMovementRowsWithDailyBalances([], {
    dateFrom: "2026-09-04", dateTo: "2026-09-05",
    openingBalancesByLot: new Map([["WKB-0053|2408260053-1", { quantity: -2, weightKg: -21.55 }]]),
    lotMetaMap: new Map([["WKB-0053|2408260053-1", { productCode: "WKB-0053", lotNo: "2408260053-1", productName: "test" }]]),
  });
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.equal(row.balanceQuantity, -2);
    assert.equal(row.balanceWeightKg, -21.55);
    assert.equal(row.isCarryForward, true);
  }
});

const receiptRows = [
  {
    groupDate: "2026-06-30",
    lotNo: "3006260002-1",
    productCode: "WKB-0002",
    productName: "แผ่นแครกเกอร์โปรตีน",
    quantity: 306,
    totalNetWeightKg: 3687.98,
  },
  {
    groupDate: "2026-07-01",
    lotNo: "0107260002-1",
    productCode: "WKB-0002",
    productName: "แผ่นแครกเกอร์โปรตีน",
    quantity: 237,
    totalNetWeightKg: 3104.5,
  },
  {
    groupDate: "2026-07-02",
    lotNo: "0207260002-1",
    productCode: "WKB-0002",
    productName: "แผ่นแครกเกอร์โปรตีน",
    quantity: 384,
    totalNetWeightKg: 4905.11,
  },
  {
    groupDate: "2026-06-30",
    lotNo: "3006260049-1",
    productCode: "WKB-0049",
    productName: "แผ่นแครกเกอร์งาทอมซอง",
    quantity: 111,
    totalNetWeightKg: 1388.53,
  },
  {
    groupDate: "2026-07-01",
    lotNo: "0107260050-1",
    productCode: "WKB-0050",
    productName: "แผ่นแครกเกอร์รสธันบิวรี่",
    quantity: 141,
    totalNetWeightKg: 1970.95,
  },
];

const issueRows = [
  {
    issueDate: "2026-07-01",
    lotNo: "0107260002-1",
    productCode: "WKB-0002",
    productName: "แผ่นแครกเกอร์โปรตีน",
    quantity: 40,
    totalWeightKg: 481.76,
  },
  {
    issueDate: "2026-07-01",
    lotNo: "3006260002-1",
    productCode: "WKB-0002",
    productName: "แผ่นแครกเกอร์โปรตีน",
    quantity: 200,
    totalWeightKg: 2411.51,
  },
  {
    issueDate: "2026-07-02",
    lotNo: "3006260049-1",
    productCode: "WKB-0049",
    productName: "แผ่นแครกเกอร์งาทอมซอง",
    quantity: 45,
    totalWeightKg: 557.1,
  },
];

test("movement summary carries lot balances across dates", () => {
  const rows = buildProductionStockMovementRows(
    receiptRows.filter((row) => row.productCode === "WKB-0002"),
    issueRows.filter((row) => row.productCode === "WKB-0002")
  );
  const oldLotIssueRow = rows.find(
    (row) => row.issueDate === "2026-07-01" && row.lotNo === "3006260002-1"
  );
  const summary = buildProductionStockMovementSummary(rows);

  assert.equal(oldLotIssueRow.balanceQuantity, 106);
  assert.equal(oldLotIssueRow.balanceWeightKg, 1276.47);
  assert.equal(summary.inboundQuantity, 927);
  assert.equal(summary.inboundWeightKg, 11697.59);
  assert.equal(summary.issueQuantity, 240);
  assert.equal(summary.issueWeightKg, 2893.27);
  assert.equal(summary.balanceQuantity, 687);
  assert.equal(summary.balanceWeightKg, 8804.32);
});

test("movement summary grand total sums final lot balances across multiple products", () => {
  const rows = buildProductionStockMovementRows(receiptRows, issueRows);
  const summary = buildProductionStockMovementSummary(rows);

  assert.equal(summary.inboundQuantity, 1179);
  assert.equal(summary.inboundWeightKg, 15057.07);
  assert.equal(summary.issueQuantity, 285);
  assert.equal(summary.issueWeightKg, 3450.37);
  assert.equal(summary.balanceQuantity, 894);
  assert.equal(summary.balanceWeightKg, 11606.7);
});

test("movement rows expose brought-forward balances before each movement row", () => {
  const rows = recalculateProductionStockMovementBalances(
    [
      {
        issueDate: "2026-07-01",
        lotNo: "LOT-1",
        productCode: "WKB-0002",
        productName: "Test Product",
        inboundQuantity: 30,
        inboundWeightKg: 300,
        issueQuantity: 10,
        issueWeightKg: 100,
        returnQuantity: 0,
        returnWeightKg: 0,
        wasteQuantity: 2,
        wasteWeightKg: 20,
      },
      {
        issueDate: "2026-07-02",
        lotNo: "LOT-1",
        productCode: "WKB-0002",
        productName: "Test Product",
        inboundQuantity: 0,
        inboundWeightKg: 0,
        issueQuantity: 20,
        issueWeightKg: 200,
        returnQuantity: 5,
        returnWeightKg: 50,
        wasteQuantity: 0,
        wasteWeightKg: 0,
      },
    ],
    new Map([
      [
        "WKB-0002|LOT-1",
        {
          quantity: 100,
          weightKg: 1000,
        },
      ],
    ])
  );

  const firstRow = rows.find((row) => row.issueDate === "2026-07-01");
  const secondRow = rows.find((row) => row.issueDate === "2026-07-02");
  const summary = buildProductionStockMovementSummary(rows);

  assert.equal(firstRow.openingQuantity, 100);
  assert.equal(firstRow.openingWeightKg, 1000);
  assert.equal(firstRow.balanceQuantity, 118);
  assert.equal(firstRow.balanceWeightKg, 1180);
  assert.equal(secondRow.openingQuantity, 118);
  assert.equal(secondRow.openingWeightKg, 1180);
  assert.equal(secondRow.balanceQuantity, 103);
  assert.equal(secondRow.balanceWeightKg, 1030);
  assert.equal(summary.openingQuantity, 100);
  assert.equal(summary.openingWeightKg, 1000);
  assert.equal(summary.balanceQuantity, 103);
  assert.equal(summary.balanceWeightKg, 1030);
});

test("movement reports exclude returns whose source issue was voided", () => {
  const filterRows = productionStockBalanceRows.filterProductionStockMovementsByActiveIssueItems;
  assert.equal(typeof filterRows, "function");

  const rows = filterRows(
    [
      {
        movement_type: "return_in",
        quantity_in: 1,
        weight_in_kg: 7.78,
        metadata: { sourceIssueItemId: "active-1" },
      },
      {
        movement_type: "return_in",
        quantity_in: 1,
        weight_in_kg: 10.49,
        metadata: { sourceIssueItemId: "voided-1" },
      },
      {
        movement_type: "return_in",
        quantity_in: 1,
        weight_in_kg: 11.06,
        metadata: { sourceIssueItemId: "voided-2" },
      },
      {
        movement_type: "return_in",
        quantity_in: 1,
        weight_in_kg: 7.29,
        metadata: { sourceIssueItemId: "active-2" },
      },
    ],
    new Set(["active-1", "active-2"])
  );

  assert.equal(rows.length, 2);
  assert.equal(rows.reduce((sum, row) => sum + row.quantity_in, 0), 2);
  assert.equal(rows.reduce((sum, row) => sum + row.weight_in_kg, 0), 15.07);
});

test("movement reports retain legacy rows that have no source issue link", () => {
  const filterRows = productionStockBalanceRows.filterProductionStockMovementsByActiveIssueItems;
  assert.equal(typeof filterRows, "function");

  const legacyRow = {
    movement_type: "return_in",
    quantity_in: 1,
    weight_in_kg: 5,
    metadata: {},
  };

  assert.deepEqual(filterRows([legacyRow], new Set()), [legacyRow]);
});
