import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import { buildPackingUnits, quantityInBase, supplementPackingUnits } from "../src/lib/packingUnits.js";

class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
const actor = "00000000-0000-4000-8000-000000000001", departmentId = "00000000-0000-4000-8000-000000000002";
function service({ permissionError, departments = [{ id: departmentId, role: "editor" }], previous = null, enabled = false, stocks = [], supplement = null } = {}) {
  const calls = [];
  const db = { from(table) {
    calls.push(table);
    if (enabled && table === "production_department_products") return { select() { return this; }, eq() { return this; }, maybeSingle() { return { data: { sku_code: "FG1" } }; } };
    if (enabled && table === "products_cache") return { select() { return this; }, eq() { return this; }, in() { return this; }, maybeSingle() { return { data: { sku_code: "FG1", sku_name: "Pails", image_url: null } }; } };
    if (table !== "production_packing_documents") throw Error("Unexpected data access " + table);
    return { select() { return this; }, eq() { return this; }, maybeSingle() { return { data: previous }; } };
  }, rpc(name, params) { calls.push({ name, params }); return { data: name === "packing_workspace_sources" ? stocks : { id: "saved" } }; } };
  const context = vm.createContext({ ApiError, createHash, buildPackingUnits, quantityInBase, supplementPackingUnits, readPackingUnitSetting: async () => supplement, process: { env: { PACKING_WORKSPACE_ENABLED: enabled ? "true" : "false" } },
    requireTaskPermission: async (_request, key) => { calls.push(key); if (permissionError) throw permissionError; return { userId: actor, isAdmin: false }; },
    getSupabaseAdmin: () => db, loadWeightScaleLiveDepartmentScope: async () => ({ departments }),
    validatePieceRateWorkDate: value => value, lotFromWorkDate: () => "151026", Response, URLSearchParams,
    fetchGatewayJson: () => { if (!enabled) throw Error("Must not reload ERP for committed retry"); return { ok: true, data: { data: [{ SKU_CODE: "FG1", UTQ_NAME: "ปี๊บ", UTQ_QTY: 1, UTQ_NAME_2: "ลัง", UTQ_QTY_2: 12 }] } }; },
  });
  const source = readFileSync("src/lib/packing-workspace-service.js", "utf8").replace(/^import .*;\r?\n/gm, "").replace(/export async /g, "async ");
  vm.runInContext(source + "\nthis.read = readPackingWorkspace; this.save = savePackingWorkspace;", context);
  return { context, calls };
}

test("new packing read/write cannot reach data after action permission is denied", async () => {
  const f = service({ permissionError: new ApiError(403, "Denied") });
  await assert.rejects(f.context.read({}, new URLSearchParams({ view: "sources", departmentId })), error => error.status === 403);
  await assert.rejects(f.context.save({}, { requestId: actor, departmentId }), error => error.status === 403);
  assert.deepEqual(f.calls, ["production-packing-output-view", "production-packing-output-write"]);
});

test("workspace profile and writer share the persisted supplement and reject old unit versions", async () => {
  const f = service({ enabled: true, supplement: { parentCode: "pail", childCode: "sachet", quantity: 18 } });
  const profile = (await (await f.context.read({}, new URLSearchParams({ view: "profile", departmentId, skuCode: "FG1" }))).json()).data;
  assert.equal(profile.units.find(unit => unit.code === "carton").factor, 216);
  const body = { requestId: actor, departmentId, workDate: "2026-10-15", productCode: "FG1", unitVersion: profile.unitVersion, produced: { carton: 1 }, closing: { sachet: 3 }, sources: [] };
  assert.equal((await f.context.save({}, body)).status, 201);
  const payload = f.calls.find(call => call.name === "record_packing_workspace").params.p_payload;
  assert.equal(payload.producedBase, 216);
  assert.equal(payload.closingBase, 3);
  await assert.rejects(f.context.save({}, { ...body, unitVersion: "old-version" }), error => error.status === 422);
});

test("unassigned departments cannot read sources or write even with the page action", async () => {
  const f = service({ departments: [] });
  await assert.rejects(f.context.read({}, new URLSearchParams({ view: "sources", departmentId })), error => error.status === 403);
  await assert.rejects(f.context.save({}, { requestId: actor, departmentId }), error => error.status === 403);
  assert.ok(!f.calls.includes("production_packing_documents"));
});

test("uncertain committed retry returns original receipt without reloading changed ERP rates", async () => {
  const body = { requestId: actor, departmentId, workDate: "2026-10-15", productCode: "FG1", unitVersion: "old", produced: { carton: 5 }, closing: { pail: 2 }, sources: [] };
  const requestFingerprint = createHash("sha256").update(JSON.stringify({ departmentId, workDate: body.workDate, code: "FG1", unitVersion: "old", produced: body.produced, closing: body.closing, sources: [] })).digest("hex");
  const f = service({ previous: { id: "receipt", actor_id: actor, payload: { requestFingerprint } } });
  const result = await (await f.context.save({}, body)).json();
  assert.equal(result.data.id, "receipt"); assert.equal(result.data.replayed, true);
  await assert.rejects(f.context.save({}, { ...body, closing: { pail: 3 } }), error => error.status === 409);
});

test("installing storage does not enable new writes before legacy reconciliation", async () => {
  const f = service();
  await assert.rejects(f.context.save({}, { requestId: actor, departmentId, workDate: "2026-10-15", productCode: "FG1", sources: [] }), error => error.status === 503);
  assert.deepEqual(f.calls, ["production-packing-output-write", "production_packing_documents"]);
});

test("legacy source kind, LOT and unit come from the shared ledger, not browser fields", async () => {
  const units = buildPackingUnits("FG1", [{ SKU_CODE: "FG1", UTQ_NAME: "ปี๊บ", UTQ_QTY: 1, UTQ_NAME_2: "ลัง", UTQ_QTY_2: 12 }]);
  const unitVersion = createHash("sha256").update(JSON.stringify(units)).digest("hex");
  const f = service({ enabled: true, stocks: [{ id: actor, source_kind: "legacy_opening", lot_no: "141026", unit_code: "pail", unit_label: "ปี๊บ", remaining: 5 }] });
  const body = { requestId: actor, departmentId, workDate: "2026-10-15", productCode: "FG1", unitVersion, produced: { carton: 1 }, sources: [{ id: actor, quantity: 3, sourceKind: "packing", lotNo: "FAKE", unitCode: "kg" }] };
  assert.equal((await f.context.save({}, body)).status, 201);
  const saved = f.calls.find(call => call.name === "record_packing_workspace").params.p_payload.sources[0];
  assert.equal(saved.sourceKind, "legacy_opening");
  assert.equal(saved.lotNo, "141026");
  assert.equal(saved.unitCode, "pail");
  await assert.rejects(f.context.save({}, { ...body, unitVersion: "changed-before-save" }), error => error.status === 422);
  await assert.rejects(f.context.save({}, { ...body, sources: [{ id: actor, quantity: 6 }] }), error => error.status === 400);
  await assert.rejects(f.context.save({}, { ...body, sources: [{ id: actor, quantity: 1.5 }] }), error => error.status === 400);
});
