import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHmac, timingSafeEqual } from "node:crypto";
import vm from "node:vm";

class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
const actor = "00000000-0000-4000-8000-000000000001";
const point = "00000000-0000-4000-8000-000000000002";
const cycle = "00000000-0000-4000-8000-000000000003";
const requestId = "00000000-0000-4000-8000-000000000004";
const key = "ab".repeat(32);
function capture(secret = key) {
  const body = Buffer.from(JSON.stringify({ version: 1, pointId: point, cycleId: cycle, grossKg: "19.020", stable: true, capturedAt: new Date().toISOString() })).toString("base64url");
  return body + "." + createHmac("sha256", Buffer.from(secret, "hex")).update(body).digest("hex");
}
const evidence = vm.createContext({ Buffer, createHmac, timingSafeEqual, ApiError });
vm.runInContext(readFileSync("src/lib/scale/capture-evidence.js", "utf8").replace(/^import .*;\r?\n/gm, "").replaceAll("export ", "") + "\nthis.verify = verifyScaleCaptureEvidence;", evidence);
function fixture({ deny = false, error = null } = {}) {
  const calls = [];
  const db = { async rpc(name, args) {
    calls.push({ name, args });
    if (name === "central_scale_device_profile") return { data: { point_id: point, is_active: true, signing_key_hex: key, max_kg: 60, resolution_kg: 0.001 } };
    return { data: { barcode: "11102680010001", department_id: actor, product_code: "WK-0002" }, error };
  } };
  const context = vm.createContext({ URL, ApiError, getSupabaseAdmin: () => db,
    requirePermissionKeys: async (_request, keys) => { assert.equal(keys[0], "central-scale-receive"); return { userId: actor, isAdmin: false }; },
    assertWeightScaleLiveProductAccess: async () => { if (deny) throw new ApiError(403, "Denied"); return { productCode: "WK-0002" }; },
    verifyScaleCaptureEvidence: evidence.verify,
  });
  vm.runInContext(readFileSync("src/lib/scale/central-receipts.js", "utf8").replace(/^import .*;\r?\n/gm, "").replaceAll("export ", "") + "\nthis.receive = receiveCentralScaleReceipt; this.recover = recoverCentralScaleReceipt;", context);
  return { calls, receive: changes => context.receive({ url: "http://localhost/api", headers: new Headers({ "Content-Type": "application/json" }), json: async () => ({ requestId, departmentId: actor, pointId: point, productCode: "WK-0002", tareWeightKg: "0.500", captureToken: capture(), ...changes }) }),
    recover: () => context.recover({ url: "http://localhost/api?requestId=" + requestId }) };
}
test("receiver derives actor from permission guard and gross/cycle from signed device evidence", async () => {
  const f = fixture();
  assert.equal((await f.receive()).barcode, "11102680010001");
  const args = f.calls[1].args;
  assert.equal(args.p_actor_id, actor);
  assert.equal(args.p_gross_kg, "19.020");
  assert.equal(args.p_cycle_id, cycle);
  assert.equal(args.p_tare_kg, "0.500");
});
test("forged actor/gross, tampered capture, invalid tare and unauthorized SKU never reach receipt RPC", async () => {
  for (const changes of [{ actorId: cycle }, { grossWeightKg: 100 }, { productCode: {} }, { tareWeightKg: -1 },
    { tareWeightKg: "19.020" }, { captureToken: capture("cd".repeat(32)) }]) {
    const f = fixture();
    await assert.rejects(f.receive(changes));
    assert.ok(!f.calls.some(call => call.name === "central_scale_receive"));
  }
  const denied = fixture({ deny: true });
  await assert.rejects(denied.receive(), { status: 403 });
  assert.equal(denied.calls.length, 0);
});
test("database conflicts are not blind-retried and recovery uses original request and actor", async () => {
  const f = fixture({ error: { code: "23505" } });
  await assert.rejects(f.receive(), { status: 409 });
  assert.equal(f.calls.filter(call => call.name === "central_scale_receive").length, 1);
  const recovery = fixture();
  await recovery.recover();
  assert.equal(recovery.calls[0].name, "central_scale_receipt_get");
  assert.equal(recovery.calls[0].args.p_request_id, requestId);
  assert.equal(recovery.calls[0].args.p_actor_id, actor);
});
