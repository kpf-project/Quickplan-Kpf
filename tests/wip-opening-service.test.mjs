import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { transform, loadBindings } from "next/dist/build/swc/index.js";
import { normalizeWipOpening } from "../src/lib/wip-opening-input.js";

async function loadService({ permission, scope, db }) {
  await loadBindings();
  const file = new URL("../src/lib/wip-opening-service.js", import.meta.url);
  const { code } = await transform(fs.readFileSync(file, "utf8"), { filename: file.pathname, jsc: { parser: { syntax: "ecmascript" } }, module: { type: "commonjs" } });
  const mod = { exports: {} };
  class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
  new Function("require", "module", "exports", code)(name => {
    if (name === "server-only") return {};
    if (name.includes("adminApi")) return { ApiError, getSupabaseAdmin: () => db };
    if (name.includes("permissionGuard")) return { requirePermissionKeys: async (request, keys) => {
      if (!permission || !keys.some(key => permission.permissions.includes(key))) throw new ApiError(403, "Forbidden");
      return permission;
    } };
    if (name.includes("live-access")) return { loadWeightScaleLiveDepartmentScope: async () => scope };
    if (name.includes("wip-opening-input")) return { normalizeWipOpening };
    if (name.includes("supabaseRangeFetch")) return {};
    throw new Error(`Unexpected dependency ${name}`);
  }, mod, mod.exports);
  return mod.exports;
}

const departmentId = "22222222-2222-4222-8222-222222222222";
const payload = () => ({ requestId: "11111111-1111-4111-8111-111111111111", departmentId, openingDate: "2026-10-13", actorId: "forged", items: [{ productCode: "WKB-0064", lotNo: "131026", quantities: { pack: 10, sachet: 7 } }] });
const permission = { userId: "verified-actor", isAdmin: false, permissions: ["wip-opening-manage"] };
test("opening checks its own permission plus department editor, never trusts submitted actor", async () => {
  let calls = 0, args;
  const db = { rpc: async (name, values) => { calls++; args = values; assert.equal(name, "record_central_wip_opening"); return { data: { documentId: "committed" } }; } };
  const scope = { departments: [{ id: departmentId, role: "viewer" }] };
  const service = await loadService({ permission, scope, db });
  await assert.rejects(service.recordOpening({}, payload()), error => error.status === 403);
  assert.equal(calls, 0);
  scope.departments[0].role = "editor";
  assert.deepEqual(await service.recordOpening({}, payload()), { documentId: "committed" });
  assert.equal(args.p_actor_id, "verified-actor");
  assert.deepEqual(args.p_entries.map(row => row.unit).sort(), ["pack", "sachet"]);
  await assert.rejects(service.recordOpening({}, { ...payload(), departmentId: "33333333-3333-4333-8333-333333333333" }), error => error.status === 403);
  const unauthorized = await loadService({ permission: { ...permission, permissions: ["central-scale-receive"] }, scope, db });
  await assert.rejects(unauthorized.recordOpening({}, payload()), error => error.status === 403);
});
test("database errors map to safe explicit rollback errors or uncertain-result retry", async () => {
  for (const [code, status] of [["23505",409],["42501",403],["22023",400],["23514",400],["PGRST202",503]]) {
    const service = await loadService({ permission, scope: { departments: [{ id: departmentId, role: "editor" }] }, db: { rpc: async () => ({ error: { code, message: "private database detail" } }) } });
    await assert.rejects(service.recordOpening({}, payload()), error => error.status === status && !error.message.includes("private database detail"));
  }
});
