import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const file = new URL("../src/lib/scale/live-operation-scope.js", import.meta.url);
function load() {
  const source = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "";
  const context = vm.createContext({});
  vm.runInContext(source.replaceAll("export function", "function") + "\nthis.scope = typeof isLiveOperationReceipt === 'function' ? isLiveOperationReceipt : () => true;", context);
  return context.scope;
}
test("legacy, other point, and unknown context cannot enter live operations", () => {
  const check = load();
  const context = { departmentId: "d1", workstationId: "point1" };
  const receipt = { departmentId: "d1", metadata: { weightSource: "serial-live", workstationId: "point1" } };
  assert.equal(check(receipt, context), true);
  assert.equal(check({ ...receipt, metadata: {} }, context), false);
  assert.equal(check(receipt, { ...context, workstationId: "point2" }), false);
  assert.equal(check(receipt, { ...context, departmentId: "d2" }), false);
  assert.equal(check(receipt, {}), false);
});

function loadRoute({ receipt, departmentId = "d1", canView = true, canOperate = true, issuedItem } = {}) {
  const source = fs.readFileSync(new URL("../src/app/api/scale/live/operations/route.js", import.meta.url), "utf8");
  let writes = 0;
  let histories = 0;
  class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const db = { from(table) {
    const query = { select() { return this; }, eq() { return this; }, async maybeSingle() {
      return { data: table === "production_weight_receipts" ? receipt : { department_id: departmentId }, error: null };
    } };
    return query;
  } };
  const context = vm.createContext({ Response, URL, Intl, ApiError,
    getSupabaseAdmin: () => db,
    logAuditEvent: async () => {},
    readJson: request => request.json(),
    jsonError: error => Response.json({ error: error.message }, { status: error.status || 500 }),
    requireWeightScaleLivePermission: async () => ({ userId: "u1", isAdmin: false }),
    loadWeightScaleLiveAccess: async () => ({ canView, canOperate }),
    isLiveOperationReceipt: load(),
    loadScaleReceiptReportData: async () => { histories++; return { receipts: [] }; },
    cancelScaleReceipt: async () => { writes++; return {}; },
    createStockReturn: async () => { writes++; return {}; },
    findIssuedItemByBarcode: async () => { if (issuedItem) return issuedItem; throw new Error("Must not read old stock details"); },
  });
  vm.runInContext(source.replace(/^import .*;\r?\n/gm, "").replaceAll("export ", "") + "\nthis.handlers = { GET, POST };", context);
  return { ...context.handlers, writes: () => writes, histories: () => histories };
}

test("missing point and unauthorized department reject history before querying", async () => {
  for (const config of [{}, { canView: false }]) {
    const route = loadRoute(config);
    const query = config.canView === false ? "&workstationId=point1" : "";
    const response = await route.GET(new Request(`http://localhost/api?departmentId=d1&action=void-history${query}`));
    assert.equal(response.status, config.canView === false ? 403 : 400);
    assert.equal(route.histories(), 0);
  }
});

test("live return rejects excessive weight without a stock write", async () => {
  const route = loadRoute({ receipt: { id: "live", product_config_id: "c1", metadata: { weightSource: "serial-live", workstationId: "point1" } }, issuedItem: { sourceReceiptId: "live", sourceTareWeightKg: 1, remainingWeightKg: 2 } });
  const response = await route.POST(new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "return", departmentId: "d1", workstationId: "point1", sourceBarcode: "LIVE123", grossWeightKg: 4, tareWeightKg: 99, returnDate: "2026-10-01" }) }));
  assert.equal(response.status, 400);
  assert.equal(route.writes(), 0);
});

test("old product receipts cannot be returned or cancelled through live APIs", async () => {
  for (const action of ["return", "void"]) {
    const route = loadRoute({ receipt: { id: "old", product_config_id: "c1", metadata: {}, status: "recorded" } });
    const response = await route.POST(new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, departmentId: "d1", workstationId: "point1", receiptId: "old", sourceBarcode: "OLD123", voidReason: "wrong product" }) }));
    assert.equal(response.status, 403);
    assert.equal(route.writes(), 0);
  }
});

test("only the matching live point can cancel and viewer cannot mutate", async () => {
  for (const [point, editor, expected] of [["point1", true, 200], ["point2", true, 403], ["point1", false, 403]]) {
    const route = loadRoute({ canOperate: editor, receipt: { id: "live", product_config_id: "c1", metadata: { weightSource: "serial-live", workstationId: "point1" } } });
    const response = await route.POST(new Request("http://localhost/api", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "void", departmentId: "d1", workstationId: point, receiptId: "live", voidReason: "wrong product" }) }));
    assert.equal(response.status, expected);
    assert.equal(route.writes(), expected === 200 ? 1 : 0);
  }
});

test("return history excludes legacy and other-point origins before totals and pagination", async () => {
  const source = fs.readFileSync(new URL("../src/lib/scale/receipts.js", import.meta.url), "utf8");
  const start = source.indexOf("export async function loadScaleReceiptReportData(");
  const end = source.indexOf("export async function loadScaleReceiptSummaryReportData(", start);
  const rows = [
    { id: "r-old", product_config_id: "c1", metadata: { isReturn: true, sourceReceiptId: "old" }, net_weight_kg: 100 },
    { id: "r-other", product_config_id: "c1", metadata: { isReturn: true, sourceReceiptId: "other" }, net_weight_kg: 50 },
    { id: "r-live", product_config_id: "c1", metadata: { isReturn: true, sourceReceiptId: "live" }, net_weight_kg: 2 },
  ];
  const origins = [
    { id: "old", product_config_id: "c1", metadata: {} },
    { id: "other", product_config_id: "c1", metadata: { weightSource: "serial-live", workstationId: "point2" } },
    { id: "live", product_config_id: "c1", metadata: { weightSource: "serial-live", workstationId: "point1" } },
  ];
  const db = { from() {
    let data = origins;
    const value = (row, key) => key.startsWith("metadata->>") ? row.metadata[key.slice(11)] : row[key];
    return { select() { return this; }, in(key, ids) { data = data.filter(row => ids.includes(value(row, key))); return this; }, eq(key, expected) { data = data.filter(row => value(row, key) === expected); return this; }, then(resolve) { resolve({ data, error: null }); } };
  } };
  const helpers = await import("../src/lib/supabaseRangeFetch.js");
  const context = vm.createContext({
    loadDepartmentConfigMap: async () => ({ available: true, configIds: ["c1"], productByConfigId: new Map([["c1", { skuCode: "W1" }]]) }),
    normalizeSearchTerm: () => "", normalizeSkuCodeList: () => [], normalizeReceiptItemStatusFilter: () => "confirmed",
    toBangkokReportCutoffIso: () => null,
    toScaleReceiptIsoDateRange: () => ({ startIso: "2026-10-10", endIso: "2026-10-11" }),
    fetchAllSupabaseRows: async () => rows,
    fetchSupabaseRowsByChunks: helpers.fetchSupabaseRowsByChunks,
    loadLotsByIds: async () => new Map(), loadProductNamesBySku: async () => new Map(),
    normalizeReceiptRecord: row => ({ id: row.id, isReturn: row.metadata.isReturn, netWeightKg: row.net_weight_kg, status: "recorded" }),
    loadActiveIssuedReceiptIds: async () => new Set(), isRecordActiveAt: () => true,
    isReturnReceipt: row => row.isReturn,
    matchesScaleReceiptReportStatus: () => true,
    buildReceiptSummary: items => ({ totalNetWeightKg: items.reduce((total, row) => total + row.netWeightKg, 0) }),
  });
  vm.runInContext(source.slice(start, end).replace("export ", "") + "\nthis.loadReport = loadScaleReceiptReportData;", context);
  const result = await context.loadReport(db, { departmentId: "d1", liveWorkstationId: "point1", recordType: "return", limit: 1 });
  assert.deepEqual(Array.from(result.receipts, row => row.id), ["r-live"]);
  assert.equal(result.pagination.totalCount, 1);
  assert.equal(result.summary.totalNetWeightKg, 2);
});
