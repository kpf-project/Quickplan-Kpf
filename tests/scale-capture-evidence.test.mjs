import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHmac, timingSafeEqual } from "node:crypto";
import vm from "node:vm";

class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
const context = vm.createContext({ Buffer, createHmac, timingSafeEqual, ApiError });
const source = readFileSync(new URL("../src/lib/scale/capture-evidence.js", import.meta.url), "utf8");
vm.runInContext(source.replace(/^import .*;\r?\n/gm, "").replaceAll("export ", "") + "\nthis.verify = verifyScaleCaptureEvidence;", context);
const point = "00000000-0000-4000-8000-000000000001";
const cycle = "00000000-0000-4000-8000-000000000002";
const key = "ab".repeat(32);
const device = { point_id: point, is_active: true, signing_key_hex: key, max_kg: 60, resolution_kg: 0.001 };
const now = Date.parse("2026-10-11T12:00:00+07:00");
function signed(overrides = {}, secret = key) {
  const body = Buffer.from(JSON.stringify({ version: 1, pointId: point, cycleId: cycle, grossKg: "19.020", stable: true, capturedAt: new Date(now).toISOString(), ...overrides })).toString("base64url");
  return body + "." + createHmac("sha256", Buffer.from(secret, "hex")).update(body).digest("hex");
}
test("verified capture preserves the device/cycle and exact decimal weight", () => {
  const result = context.verify(signed(), device, now);
  assert.equal(result.pointId, point);
  assert.equal(result.cycleId, cycle);
  assert.equal(result.grossKg, "19.020");
});
test("tampering and unregistered/disabled devices reject", () => {
  assert.throws(() => context.verify(signed({}, "cd".repeat(32)), device, now), { status: 403 });
  for (const profile of [{ ...device, is_active: false }, { ...device, signing_key_hex: "bad" }, { ...device, point_id: cycle }]) {
    assert.throws(() => context.verify(signed(), profile, now));
  }
  for (const token of [null, "bad", signed() + "x", "x".repeat(5000)]) assert.throws(() => context.verify(token, device, now));
});
test("stale/unstable/overload/ambiguous captures cannot be received", () => {
  for (const changes of [{ stable: false }, { capturedAt: new Date(now - 5001).toISOString() },
    { capturedAt: new Date(now + 2001).toISOString() }, { capturedAt: "2026-10-11T12:00:00" },
    { grossKg: "60.001" }, { grossKg: "0" }, { grossKg: "-1" }, { grossKg: "NaN" },
    { grossKg: "1.0001" }, { grossKg: 1 }, { cycleId: null }]) {
    assert.throws(() => context.verify(signed(changes), device, now));
  }
  assert.throws(() => context.verify(signed({ grossKg: "1.001" }), { ...device, resolution_kg: 0.01 }, now));
});
