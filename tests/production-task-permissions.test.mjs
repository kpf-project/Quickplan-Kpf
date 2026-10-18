import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { PRODUCTION_TASK_PERMISSIONS } from "../src/lib/productionTaskPermissions.js";
import { taskPermissionKeys } from "../src/lib/taskPermissions.js";

const EXPECTED_LEGACY_KEYS = {
  "production-piece-rate-rate-view": ["production-line-attendance-view", "production-line-attendance-manage"],
  "production-piece-rate-report-view": ["production-line-attendance-report-view","production-line-attendance-report-manage","production-line-attendance-view","production-line-attendance-manage"],
  "production-piece-rate-report-export": ["production-line-attendance-report-view","production-line-attendance-report-manage","production-line-attendance-view","production-line-attendance-manage"],
  "production-piece-rate-report-print": ["production-line-attendance-report-view","production-line-attendance-report-manage","production-line-attendance-view","production-line-attendance-manage"],
  "production-piece-rate-adjust": ["production-line-attendance-report-manage","production-line-attendance-manage"],
  "production-piece-rate-cancel": ["production-line-attendance-report-manage","production-line-attendance-manage"],
  "production-piece-rate-master-view": ["production-line-attendance-view","production-line-attendance-manage"],
  "production-piece-rate-record": ["production-line-attendance-view","production-line-attendance-manage"],
  "production-attendance-scan-report": ["production-line-attendance-report-view","production-line-attendance-report-manage","production-line-attendance-view","production-line-attendance-manage","admin-attendance"],
  "production-piece-rate-prison-receipt-view": ["production-line-attendance-view","production-line-attendance-manage"],
  "production-piece-rate-prison-receipt-write": ["production-line-attendance-view","production-line-attendance-manage"],
  "production-piece-rate-prison-issue-view": ["production-line-attendance-view","production-line-attendance-manage"],
  "production-piece-rate-prison-issue-write": ["production-line-attendance-view","production-line-attendance-manage"],
  "production-piece-rate-waste-write": ["production-line-attendance-view","production-line-attendance-manage","production-line-attendance-report-view","production-line-attendance-report-manage"],
  "production-piece-rate-stock-report": [
    "production-line-attendance-view",
    "production-line-attendance-manage",
    "production-line-attendance-report-view",
    "production-line-attendance-report-manage",
  ],
  "production-stock-balance-view": [
    "production-line-attendance-view",
    "production-line-attendance-manage",
    "production-line-attendance-report-view",
    "production-line-attendance-report-manage",
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-stock-issue-view": [
    "production-line-attendance-view",
    "production-line-attendance-manage",
    "production-line-attendance-report-view",
    "production-line-attendance-report-manage",
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-stock-issue-write": [
    "production-line-attendance-manage"
  ],
  "production-stock-issue-report": [
    "production-line-attendance-view",
    "production-line-attendance-manage",
    "production-line-attendance-report-view",
    "production-line-attendance-report-manage",
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-stock-issue-cancel": [
    "production-line-attendance-manage"
  ],
  "production-jam-usage-view": [
    "production-line-attendance-view",
    "production-line-attendance-manage"
  ],
  "production-jam-usage-write": [
    "production-line-attendance-manage"
  ],
  "production-stock-opening-write": [
    "production-line-attendance-view",
    "production-line-attendance-manage",
    "production-line-attendance-report-view",
    "production-line-attendance-report-manage",
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-prison-balance-view": [
    "production-line-attendance-view",
    "production-line-attendance-manage",
    "production-line-attendance-report-view",
    "production-line-attendance-report-manage",
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-prison-inbound-view": [
    "production-line-attendance-view",
    "production-line-attendance-manage",
    "production-line-attendance-report-view",
    "production-line-attendance-report-manage",
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-prison-inbound-cancel": [
    "production-line-attendance-view",
    "production-line-attendance-manage",
    "production-line-attendance-report-view",
    "production-line-attendance-report-manage",
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-prison-issue-view": [
    "production-line-attendance-view",
    "production-line-attendance-manage",
    "production-line-attendance-report-view",
    "production-line-attendance-report-manage",
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-prison-issue-write": [
    "production-line-attendance-view",
    "production-line-attendance-manage",
    "production-line-attendance-report-view",
    "production-line-attendance-report-manage",
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-prison-issue-report": [
    "production-line-attendance-view",
    "production-line-attendance-manage",
    "production-line-attendance-report-view",
    "production-line-attendance-report-manage",
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-prison-issue-cancel": [
    "production-line-attendance-view",
    "production-line-attendance-manage",
    "production-line-attendance-report-view",
    "production-line-attendance-report-manage",
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-stock-return-view": [
    "production-line-attendance-view",
    "production-line-attendance-manage",
    "production-line-attendance-report-view",
    "production-line-attendance-report-manage",
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-stock-return-write": [
    "production-line-attendance-manage"
  ],
  "production-stock-waste-view": [
    "production-line-attendance-view",
    "production-line-attendance-manage",
    "production-line-attendance-report-view",
    "production-line-attendance-report-manage",
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-stock-waste-write": [
    "production-line-attendance-manage"
  ],
  "production-scale-receipt-cancel": [
    "production-line-attendance-manage"
  ],
  "production-scale-receipt-view": [
    "production-line-attendance-view",
    "production-line-attendance-manage",
    "production-line-attendance-report-view",
    "production-line-attendance-report-manage",
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-scale-receipt-export": [
    "production-line-attendance-view",
    "production-line-attendance-manage",
    "production-line-attendance-report-view",
    "production-line-attendance-report-manage",
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-scale-receipt-report": [
    "production-line-attendance-view",
    "production-line-attendance-manage",
    "production-line-attendance-report-view",
    "production-line-attendance-report-manage",
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-scale-receipt-write": [
    "production-line-attendance-manage"
  ],
  "production-fg-wip-view": [
    "production-line-attendance-view",
    "production-line-attendance-manage"
  ],
  "production-fg-wip-write": [
    "production-line-attendance-view",
    "production-line-attendance-manage"
  ],
  "production-fg-wip-opening-write": [
    "production-line-attendance-view",
    "production-line-attendance-manage"
  ],
  "production-fg-wip-waste-write": [
    "production-line-attendance-view",
    "production-line-attendance-manage"
  ],
  "production-fg-wip-waste-cancel": [
    "production-line-attendance-manage"
  ],
  "production-piece-rate-stock-view": [
    "production-line-attendance-view",
    "production-line-attendance-manage",
    "production-line-attendance-report-view",
    "production-line-attendance-report-manage"
  ],
  "production-piece-rate-stock-issue-write": [
    "production-line-attendance-view",
    "production-line-attendance-manage",
    "production-line-attendance-report-view",
    "production-line-attendance-report-manage"
  ],
  "production-piece-rate-stock-return-write": [
    "production-line-attendance-view",
    "production-line-attendance-manage",
    "production-line-attendance-report-view",
    "production-line-attendance-report-manage"
  ],
  "production-piece-rate-stock-issue-cancel": [
    "production-line-attendance-view",
    "production-line-attendance-manage",
    "production-line-attendance-report-view",
    "production-line-attendance-report-manage"
  ],
  "production-piece-rate-weigh-cancel": [
    "production-line-attendance-view",
    "production-line-attendance-manage",
    "production-line-attendance-report-view",
    "production-line-attendance-report-manage"
  ],
  "production-packing-output-view": [
    "production-line-attendance-view",
    "production-line-attendance-manage",
    "production-line-attendance-report-view",
    "production-line-attendance-report-manage"
  ],
  "production-packing-output-write": [
    "production-line-attendance-manage",
    "production-line-attendance-report-manage"
  ]
};
const GUARDS = {
  "src/features/attendance/services/pieceRateWorkService.js": {"listPieceRateReport":"production-piece-rate-report-view","listPieceRateGroupDocuments":"production-piece-rate-report-view","listPieceRateRevisions":"production-piece-rate-report-view","exportPieceRateReportExcel":"production-piece-rate-report-export","issuePieceRateReportPrintDocument":"production-piece-rate-report-print","getPieceRateEmployeeSummaryDetails":"production-piece-rate-report-view","listPieceRateReportProducts":"production-piece-rate-report-view","listEditablePieceRateProducts":"production-piece-rate-adjust","lookupPieceRateProduct":"production-piece-rate-master-view","lookupPieceRateEmployee":"production-piece-rate-master-view","getPieceRateOfflineMaster":"production-piece-rate-master-view","updatePieceRateLog":"production-piece-rate-adjust","cancelPieceRateLog":"production-piece-rate-cancel","createPieceRateLog":"production-piece-rate-record","importPieceRateLogs":"production-piece-rate-record"},
  "src/features/attendance/services/attendanceScanEventsService.js": {"listAttendanceScanEvents":"production-attendance-scan-report"},
  "src/app/api/attendance/piece-rate/prison-receipts/route.js": {"GET":"production-piece-rate-prison-receipt-view","POST":"production-piece-rate-prison-receipt-write"},
  "src/app/api/attendance/piece-rate/prison-issues/route.js": {"GET":"production-piece-rate-prison-issue-view","POST":"production-piece-rate-prison-issue-write"},
  "src/app/api/attendance/piece-rate/waste/route.js": {"POST":"production-piece-rate-waste-write"},
  "src/app/api/attendance/piece-rate/stock/movements/route.js": {
    GET: "production-piece-rate-stock-report",
  },
  "src/features/production-line/services/fgWipService.js": {
    "listFgProducts": "production-fg-wip-view",
    "createFgWipDocument": "production-fg-wip-write",
    "listAvailableWipCans": "production-fg-wip-view",
    "issueWipCans": "production-fg-wip-write",
    "createWipOpeningBalanceBatch": "production-fg-wip-opening-write",
    "listFgWipWasteLogs": "production-fg-wip-view",
    "createFgWipWasteLog": "production-fg-wip-waste-write",
    "cancelFgWipWasteLog": "production-fg-wip-waste-cancel",
    "listFgWipDocuments": "production-fg-wip-view",
    "listFgPackingReport": "production-fg-wip-view"
  },
  "src/features/attendance/services/pieceRateStockService.js": {
    "lookupPieceRateStockDocument": "production-piece-rate-stock-view",
    "listAvailablePieceRateStockLabels": "production-piece-rate-stock-view",
    "createPieceRateStockIssue": "production-piece-rate-stock-issue-write",
    "createPieceRateStockIssueBatch": "production-piece-rate-stock-issue-write",
    "createPieceRateStockReturn": "production-piece-rate-stock-return-write",
    "cancelPieceRateStockIssue": "production-piece-rate-stock-issue-cancel",
    "cancelPieceRateWeigh": "production-piece-rate-weigh-cancel",
    "getBiscuitFgProducts": "production-piece-rate-stock-view"
  },
  "src/app/api/attendance/non-wage-packing-output/route.js": {
    "GET": "production-packing-output-view",
    "POST": "production-packing-output-write"
  },
  "src/app/api/production-stock/balance/route.js": {
    "GET": "production-stock-balance-view"
  },
  "src/app/api/production-stock/balance/summary/route.js": {
    "GET": "production-stock-balance-view"
  },
  "src/app/api/production-stock/issues/available/route.js": {
    "GET": "production-stock-issue-view"
  },
  "src/app/api/production-stock/issues/batch/route.js": {
    "POST": "production-stock-issue-write"
  },
  "src/app/api/production-stock/issues/cancelable/route.js": {
    "GET": "production-stock-issue-view"
  },
  "src/app/api/production-stock/issues/report/route.js": {
    "GET": "production-stock-issue-report"
  },
  "src/app/api/production-stock/issues/report-summary/route.js": {
    "GET": "production-stock-issue-report"
  },
  "src/app/api/production-stock/issues/route.js": {
    "GET": "production-stock-issue-view",
    "POST": "production-stock-issue-write"
  },
  "src/app/api/production-stock/issues/[issueItemId]/cancel/route.js": {
    "POST": "production-stock-issue-cancel"
  },
  "src/app/api/production-stock/jam-usage/route.js": {
    "GET": "production-jam-usage-view",
    "POST": "production-jam-usage-write"
  },
  "src/app/api/production-stock/opening-balances/import/route.js": {
    "POST": "production-stock-opening-write"
  },
  "src/app/api/production-stock/prison/balance/lot/route.js": {
    "GET": "production-prison-balance-view"
  },
  "src/app/api/production-stock/prison/balance/summary/route.js": {
    "GET": "production-prison-balance-view"
  },
  "src/app/api/production-stock/prison/inbound/cancelable/route.js": {
    "GET": "production-prison-inbound-view"
  },
  "src/app/api/production-stock/prison/inbound/[inboundItemId]/cancel/route.js": {
    "POST": "production-prison-inbound-cancel"
  },
  "src/app/api/production-stock/prison/issues/available/route.js": {
    "GET": "production-prison-issue-view"
  },
  "src/app/api/production-stock/prison/issues/batch/route.js": {
    "POST": "production-prison-issue-write"
  },
  "src/app/api/production-stock/prison/issues/cancelable/route.js": {
    "GET": "production-prison-issue-view"
  },
  "src/app/api/production-stock/prison/issues/report/route.js": {
    "GET": "production-prison-issue-report"
  },
  "src/app/api/production-stock/prison/issues/report-summary/route.js": {
    "GET": "production-prison-issue-report"
  },
  "src/app/api/production-stock/prison/issues/route.js": {
    "GET": "production-prison-issue-view",
    "POST": "production-prison-issue-write"
  },
  "src/app/api/production-stock/prison/issues/[issueItemId]/cancel/route.js": {
    "POST": "production-prison-issue-cancel"
  },
  "src/app/api/production-stock/returns/route.js": {
    "GET": "production-stock-return-view",
    "POST": "production-stock-return-write"
  },
  "src/app/api/production-stock/waste/route.js": {
    "GET": "production-stock-waste-view",
    "POST": "production-stock-waste-write"
  },
  "src/app/api/scale/receipts/cancel-by-barcode/route.js": {
    "POST": "production-scale-receipt-cancel"
  },
  "src/app/api/scale/receipts/cancelable/route.js": {
    "GET": "production-scale-receipt-view"
  },
  "src/app/api/scale/receipts/erp-export/preview/route.js": {
    "POST": "production-scale-receipt-export"
  },
  "src/app/api/scale/receipts/erp-export/route.js": {
    "POST": "production-scale-receipt-export"
  },
  "src/app/api/scale/receipts/report/print-log/route.js": {
    "POST": "production-scale-receipt-report"
  },
  "src/app/api/scale/receipts/report/route.js": {
    "GET": "production-scale-receipt-report"
  },
  "src/app/api/scale/receipts/report-summary/route.js": {
    "GET": "production-scale-receipt-report"
  },
  "src/app/api/scale/receipts/route.js": {
    "GET": "production-scale-receipt-view",
    "POST": "production-scale-receipt-write"
  },
  "src/app/api/scale/receipts/[receiptId]/cancel/route.js": {
    "POST": "production-scale-receipt-cancel"
  }
};

test("piece-rate action grants never imply wage visibility or another action", () => {
  const source = readFileSync(new URL("../src/features/attendance/services/pieceRateWorkService.js", import.meta.url), "utf8")
    .replace(/^import[\s\S]*?;\r?\n/gm, "")
    .replace(/\bexport\s+/g, "");
  const context = vm.createContext({
    process: { env: { ROLE_TASK_PERMISSIONS_ENABLED: "true" } },
    normalizeParam: (value) => value ?? null,
    normalizeEmployeeCode: (value) => value ?? null,
  });
  vm.runInContext(source, context);
  const capabilities = (keys) => context.buildReportCapabilities({ permissionSet: new Set(keys) });
  assert.equal(capabilities(["production-piece-rate-adjust"]).canEdit, true);
  assert.equal(capabilities(["production-piece-rate-adjust"]).canCancel, false);
  assert.equal(capabilities(["production-piece-rate-cancel"]).canEdit, false);
  assert.equal(capabilities(["production-piece-rate-cancel"]).canCancel, true);
  assert.equal(capabilities(["production-piece-rate-report-view"]).canViewReport, true);
  assert.equal(capabilities(["production-piece-rate-report-view"]).canViewMoney, false);
  assert.equal(capabilities(["production-line-attendance-manage"]).canEdit, false);
  assert.equal(capabilities(["production-line-attendance-piece-rate-money-view"]).canViewMoney, true);
  const row = { pay_rate_per_unit_snapshot: 2, pay_rate_per_kg_snapshot: 3 };
  const record = { permissions: ["production-piece-rate-record"] };
  assert.equal(context.buildCreateResponse(row, false, record).data.payRatePerKg, null);
  record.permissions.push("production-piece-rate-rate-view");
  assert.equal(context.buildCreateResponse(row, false, record).data.payRatePerKg, 3);
  assert.equal(capabilities(record.permissions).canViewMoney, false);
  record.permissions = ["production-piece-rate-record"];
  record.permissions.push("production-line-attendance-piece-rate-money-view");
  assert.equal(context.buildCreateResponse(row, false, record).data.payRatePerKg, 3);
  context.process.env.ROLE_TASK_PERMISSIONS_ENABLED = "false";
  assert.equal(capabilities(["production-line-attendance-manage"]).canEdit, true);
  assert.equal(context.buildCreateResponse(row, false, { permissions: [] }).data.payRatePerKg, 3);
});

test("online rate lookup and offline master enforce the separate rate permission", async () => {
  const source = readFileSync(new URL("../src/features/attendance/services/pieceRateWorkService.js", import.meta.url), "utf8")
    .replace(/^import[\s\S]*?;\r?\n/gm, "")
    .replace(/\bexport\s+/g, "");
  let permissions = ["production-piece-rate-master-view"];
  let databaseReads = 0;
  const context = vm.createContext({
    URL,
    process: { env: { ROLE_TASK_PERMISSIONS_ENABLED: "true" } },
    normalizeParam: (value) => value ?? null,
    ApiError: class extends Error {
      constructor(status, message) { super(message); this.status = status; }
    },
    requireTaskPermission: async () => ({ permissions, isAdmin: false }),
    getSupabaseAdmin: () => { databaseReads += 1; return {}; },
  });
  vm.runInContext(source, context);
  const rates = { payRatePerKg: 2, payRatePerUnit: 3 };
  context.resolvePieceRateProductByBarcode = async () => ({ product: {}, profile: rates });
  context.loadPieceRateOfflineStaticMaster = async () => ({ productLookups: [{ pieceRate: rates }], stats: {} });
  context.loadPieceRateOfflineEmployeesPage = async () => ({ rows: [], pagination: {}, cursor: {} });
  const request = { url: "http://localhost/test?barcode=ABC" };
  assert.equal((await context.lookupPieceRateProduct(request)).data.pieceRate.payRatePerKg, null);
  const readsBeforeOffline = databaseReads;
  await assert.rejects(context.getPieceRateOfflineMaster(request), (error) => error.status === 403);
  assert.equal(databaseReads, readsBeforeOffline, "denied offline request must not load the rate master");
  permissions.push("production-piece-rate-rate-view");
  assert.equal((await context.lookupPieceRateProduct(request)).data.pieceRate.payRatePerKg, 2);
  assert.equal((await context.getPieceRateOfflineMaster(request)).data.staticMaster.productLookups[0].pieceRate.payRatePerKg, 2);
  permissions = ["production-piece-rate-master-view", "production-line-attendance-piece-rate-money-view"];
  assert.equal((await context.lookupPieceRateProduct(request)).data.pieceRate.payRatePerKg, 2);
  permissions = ["production-piece-rate-master-view"];
  assert.equal((await context.getPieceRateOfflineMaster({ url: "http://localhost/test?includeStaticMaster=false" })).data.staticMaster, null);
  context.process.env.ROLE_TASK_PERMISSIONS_ENABLED = "false";
  assert.equal((await context.lookupPieceRateProduct(request)).data.pieceRate.payRatePerKg, 2);
  assert.equal((await context.getPieceRateOfflineMaster(request)).data.staticMaster.productLookups[0].pieceRate.payRatePerKg, 2);
});

test("production task compatibility preserves every legacy grant and strict mode isolates actions", () => {
  for (const [key, legacyKeys] of Object.entries(EXPECTED_LEGACY_KEYS)) {
    assert.deepEqual(PRODUCTION_TASK_PERMISSIONS[key].legacyKeys, legacyKeys, key);
    assert.deepEqual(taskPermissionKeys(key, false), legacyKeys, key);
    assert.deepEqual(taskPermissionKeys(key, true), [key], key);
    assert.ok(!/cost|wage|money/.test(key), key);
  }
});

for (const [file, bindings] of Object.entries(GUARDS)) {
  for (const [entry, key] of Object.entries(bindings)) {
    test(file + " " + entry + " checks " + key + " before data access", async () => {
      const source = readFileSync(new URL("../" + file, import.meta.url), "utf8")
        .replace(/^import[\s\S]*?;\r?\n/gm, "")
        .replace(/\bexport\s+/g, "");
      const denied = new Error("permission denied");
      let called = null;
      const context = vm.createContext({
        URL,
        process: { env: {} },
        readJson: async () => ({}),
        requireTaskPermission: async (_request, requested) => {
          called = requested;
          throw denied;
        },
        jsonError: (error) => { throw error; },
        logAuditEvent: async () => {},
      });
      vm.runInContext(source, context, { filename: file });
      await assert.rejects(context[entry]({
        url: "http://localhost/test",
        headers: { get: () => null },
      }, {}), (error) => error === denied);
      assert.equal(called, key);
    });
  }
}
