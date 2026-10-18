import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { supplementPackingUnits } from "../src/lib/packingUnits.js";

class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
function setup({ denied = false, existing = false, history = false, conflict = false } = {}) {
  const stored = [];
  const profile = { code: "B03-0012", units: [{ code: "pack", label: "แพ็ค", factor: 1, precision: 0 }, { code: "carton", label: "ลัง", factor: 24, precision: 0 }], unitVersion: "v1", unitSupplement: existing ? {} : null };
  const ctx = vm.createContext({ Response, ApiError, supplementPackingUnits,
    requireAdmin: async () => { if (denied) throw new ApiError(403, "Denied"); return { userId: "admin" }; },
    readJson: async req => req, productProfile: async () => profile, packingUnitSettingKey: code => `production_packing.units.${code}`, logAuditEvent: async () => {},
    jsonError: error => Response.json({ error: error.message }, { status: error.status || 500 }),
    getSupabaseAdmin: () => ({ from(table) {
      if (table === "production_packing_documents") return { select() { return this; }, eq() { return this; }, limit: async () => ({ data: history ? [{ id: "old" }] : [] }) };
      assert.equal(table, "system_settings");
      return { insert: async value => { if (conflict) return { error: { code: "23505" } }; stored.push(value); return {}; } };
    } }),
  });
  const source = readFileSync("src/app/api/admin/packing-units/route.js", "utf8").replace(/^import .*;\r?\n/gm, "").replace(/export /g, "");
  vm.runInContext(source + "\nthis.post = POST", ctx);
  const body = { productCode: "B03-0012", departmentId: "00000000-0000-4000-8000-000000000002", unitVersion: "v1", parentCode: "pack", childCode: "sachet", quantity: 18 };
  return { ctx, body, stored };
}
test("only admins can configure units and existing profiles/history cannot be overwritten", async () => {
  for (const [options, status] of [[{ denied: true }, 403], [{ existing: true }, 409], [{ history: true }, 409], [{ conflict: true }, 409]]) {
    const f = setup(options);
    assert.equal((await f.ctx.post(f.body)).status, status);
    assert.equal(f.stored.length, 0);
  }
});
test("unit setting persists only the approved product supplement and rejects stale/invalid values", async () => {
  const f = setup();
  assert.equal((await f.ctx.post({ ...f.body, quantity: 1.5 })).status, 400);
  assert.equal((await f.ctx.post({ ...f.body, unitVersion: "stale" })).status, 409);
  assert.equal(f.stored.length, 0);
  assert.equal((await f.ctx.post(f.body)).status, 200);
  assert.equal(f.stored[0].setting_key, "production_packing.units.B03-0012");
  assert.equal(f.stored[0].setting_value.quantity, 18);
});
