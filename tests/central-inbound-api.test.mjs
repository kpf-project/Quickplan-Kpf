import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const actor = "00000000-0000-4000-8000-000000000001";
const dept = "00000000-0000-4000-8000-000000000002";
const point = "00000000-0000-4000-8000-000000000003";
const requestId = "00000000-0000-4000-8000-000000000004";
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
function fixture({ enabled = true, allowed = true, dbError = null } = {}) {
  const calls = [];
  const context = vm.createContext({ URL, ApiError,
    process: { env: { CENTRAL_SCALE_RECEIVING_ENABLED: enabled ? "true" : "false" } },
    requirePermissionKeys: async () => ({ userId: actor, isAdmin: false }),
    getSupabaseAdmin: () => ({ rpc: async (name, args) => { calls.push({ name, args }); return { data: { status: "not_received", requestId }, error: dbError }; } }),
    loadWeightScaleLiveAccess: async () => ({ canView: allowed }),
    assertWeightScaleLiveProductAccess: async () => { if (!allowed) throw new ApiError(403, "Denied"); return { productCode: "PRODUCT" }; },
  });
  vm.runInContext(readFileSync("src/lib/scale/central-inbound.js", "utf8").replace(/^import .*;\r?\n/gm, "").replaceAll("export ", "")
    + "\nthis.api={loadCentralInboundHistory,loadCentralInboundReadiness,resolveCentralInboundPending,loadCentralInboundPrintReceipt};", context);
  const query = { departmentId: dept, pointId: point, date: "2026-10-12", productCode: "PRODUCT", requestId };
  const request = changes => ({ url: "http://localhost/api?" + new URLSearchParams({ ...query, ...changes }),
    headers: new Headers({ "Content-Type": "application/json" }), json: async () => ({ requestId, departmentId: dept, pointId: point, productCode: "PRODUCT", ...changes }) });
  return { calls, ...context.api, request };
}

test("history uses verified actor, explicit department/point/date and bounded pagination", async () => {
  const f = fixture();
  await f.loadCentralInboundHistory(f.request({ page: "2", pageSize: "15" }));
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0])), { name: "central_scale_receipt_history", args: {
    p_actor_id: actor, p_department_id: dept, p_point_id: point, p_production_date: "2026-10-12", p_page: 2, p_page_size: 15,
  } });
});

test("bad filters, disabled deployment and unauthorized department never query history", async () => {
  for (const changes of [{ departmentId: "bad" }, { pointId: "bad" }, { date: "2026-02-30" }, { page: "-1" }, { page: "10001" }, { pageSize: "99999" }]) {
    const f = fixture();
    await assert.rejects(f.loadCentralInboundHistory(f.request(changes)), { status: 400 });
    assert.equal(f.calls.length, 0);
  }
  for (const options of [{ enabled: false }, { allowed: false }]) {
    const f = fixture(options);
    await assert.rejects(f.loadCentralInboundHistory(f.request()));
    assert.equal(f.calls.length, 0);
  }
});

test("pending resolution uses original context and never trusts browser actor or creates a receipt", async () => {
  const f = fixture();
  await f.resolveCentralInboundPending(f.request());
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].name, "central_scale_resolve_receipt");
  assert.equal(f.calls[0].args.p_actor_id, actor);
  assert.equal(f.calls[0].args.p_request_id, requestId);
  await assert.rejects(f.resolveCentralInboundPending(f.request({ actorId: point })), { status: 400 });
  assert.equal(f.calls.length, 1);
  const denied = fixture({ allowed: false });
  await assert.rejects(denied.resolveCentralInboundPending(denied.request()), { status: 403 });
  assert.equal(denied.calls.length, 0);
});

test("readiness and reprint use separate read RPCs, fail closed and never allocate stock", async () => {
  const f = fixture();
  await f.loadCentralInboundReadiness(f.request());
  await f.loadCentralInboundPrintReceipt(f.request());
  assert.deepEqual(f.calls.map(call => call.name), ["central_scale_readiness", "central_scale_receipt_for_print"]);
  const failure = fixture({ dbError: { code: "42501", message: "secret SQL details" } });
  await assert.rejects(failure.loadCentralInboundPrintReceipt(failure.request()), error => error.status === 403 && !error.message.includes("secret"));
});

test("central serial reading ignores other pages' remote agent override without changing their default", async () => {
  const urls = [];
  const context = vm.createContext({ window: { localStorage: { getItem: () => "http://other-pc:41952" } },
    fetch: async url => { urls.push(url); return { ok: true, json: async () => ({ data: {} }) }; } });
  vm.runInContext(readFileSync("src/features/production-line/services/localScaleAgentClient.js", "utf8").replaceAll("export ", "")
    + "\nthis.health=fetchScaleAgentHealth;", context);
  await context.health({ localOnly: true });
  await context.health();
  assert.deepEqual(urls, ["http://127.0.0.1:41952/health", "http://other-pc:41952/health"]);
});
