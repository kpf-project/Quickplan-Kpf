import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { isLiveOperationReceipt } from "../src/lib/scale/live-operation-scope.js";

function load({ source = "serial-live", point = "p1", allowed = true, hasReturn = false, lines = [], origins = [] } = {}) {
  let writes = 0;
  class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const db = { from(table) { return {
    select() { return this; }, eq() { return this; },
    async maybeSingle() {
      if (table === "production_weight_receipts") return { data: { id: "r1", barcode: "BAR1", product_config_id: "c1", net_weight_kg: 10, status: "recorded", metadata: { weightSource: source, workstationId: point } } };
      if (table === "production_weight_scale_products") return { data: { department_id: "d1", sku_code: "P1" } };
      if (table === "production_stock_issue_items") return { data: { source_receipt_id: "r1" } };
      return { data: { sku_name: "product" } };
    },
  }; } };
  const context = vm.createContext({ URL, Response, Intl, ApiError, isLiveOperationReceipt,
    getSupabaseAdmin: () => db, readJson: request => request.json(),
    jsonError: error => Response.json({ error: error.message }, { status: error.status || 500 }),
    requireWeightScaleLivePermission: async () => ({ userId: "u1" }),
    loadWeightScaleLiveAccess: async () => ({ canView: allowed, canOperate: allowed }),
    createProductionStockIssue: async () => { writes++; return { issueItemId: "i1" }; },
    cancelProductionStockIssueItem: async () => { if (hasReturn) throw new ApiError(400, "มีใบคืน"); writes++; return {}; },
    logAuditEvent: async () => {},
    fetchAllSupabaseRows: async () => lines,
    fetchSupabaseRowsByChunks: async (ids, build) => {
      const query = { select() { return this; }, in() { return this; }, eq() { return this; } };
      let table;
      const original = db.from;
      db.from = name => { table = name; return query; };
      build(ids);
      db.from = original;
      if (table === "production_stock_issue_items") return lines.map(row => ({ id: row.issue_item_id, source_receipt_id: row.issue_item_id }));
      if (table === "production_weight_receipts") return origins;
      return [];
    },
  });
  const sourceCode = fs.readFileSync(new URL("../src/app/api/scale/live/issues/route.js", import.meta.url), "utf8");
  vm.runInContext(sourceCode.replace(/^import .*;\r?\n/gm, "").replaceAll("export ", "") + "\nthis.handlers = { GET, POST };", context);
  return { ...context.handlers, writes: () => writes };
}
const request = payload => new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ departmentId: "d1", workstationId: "p1", barcode: "BAR1", date: "2026-10-01", destinationRoomCode: "BISCUIT_PACKING", issueItemId: "i1", reason: "ผิดพลาด", ...payload }) });

test("legacy receipts and other weighing points cannot be issued or cancelled", async () => {
  for (const config of [{ source: "legacy" }, { point: "p2" }, { allowed: false }]) {
    for (const action of ["issue", "cancel"]) {
      const route = load(config);
      assert.equal((await route.POST(request({ action }))).status, 403);
      assert.equal(route.writes(), 0);
    }
  }
});
test("live issue allows exact scoped origin and requires context", async () => {
  const route = load();
  assert.equal((await route.POST(request({ action: "issue" }))).status, 200);
  assert.equal(route.writes(), 1);
  assert.equal((await route.POST(request({ action: "issue", workstationId: "" }))).status, 400);
  assert.equal(route.writes(), 1);
});
test("cancellation keeps child return guard and requires a reason", async () => {
  const route = load({ hasReturn: true });
  assert.equal((await route.POST(request({ action: "cancel" }))).status, 400);
  assert.equal((await route.POST(request({ action: "cancel", reason: "" }))).status, 400);
  assert.equal(route.writes(), 0);
});
test("live UI never uses legacy endpoints, shares table and scopes before pagination", () => {
  const ui = fs.readFileSync(new URL("../src/features/production-line/components/WeightScaleLiveIssueSection.js", import.meta.url), "utf8");
  assert.doesNotMatch(ui, /productionStockIssueClient|items\[0\]|rows\[0\]/);
  assert.match(ui, /WeightScaleHistoryTable/);
  assert.match(ui, /WeightScaleConfirmation/);
  const route = fs.readFileSync(new URL("../src/app/api/scale/live/issues/route.js", import.meta.url), "utf8");
  assert.ok(route.indexOf("validIds.has") < route.indexOf("rows.slice"));
});

test("history discards other origins before totals and pagination", async () => {
  const lines = Array.from({ length: 20 }, (_, i) => ({ issue_item_id: "i" + i, weight_kg: 2, item_status: "confirmed", document_status: "confirmed" }));
  const route = load({ lines, origins: [{ id: "i19", metadata: { weightSource: "serial-live", workstationId: "p1" } }] });
  const result = await route.GET(new Request("http://localhost/api?action=history&departmentId=d1&workstationId=p1&date=2026-10-01&page=1"));
  const payload = (await result.json()).data;
  assert.equal(payload.totalCount, 1);
  assert.equal(payload.totalWeightKg, 2);
  assert.equal(payload.totalPages, 1);
  assert.equal(payload.rows[0].id, "i19");
});
