import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
function fixture(current, session = { userId: "actor", isAdmin: true, permissions: ["write"] }) {
  const calls = [];
  const context = vm.createContext({
    ApiError,
    requireUser: async () => ({ userId: "actor", user: null }),
    getSessionFromRequest: () => session,
    assertSessionActive: async () => { calls.push("active"); },
    getUserPermissions: async (id, options) => {
      calls.push({ id, fresh: options.fresh });
      if (current instanceof Error) throw current;
      return current;
    },
  });
  vm.runInContext(readFileSync("src/lib/permissionGuard.js", "utf8").replace(/^import .*;\r?\n/gm, "").replace("export async", "async") + "\nthis.guard = requirePermissionKeys;", context);
  return { guard: context.guard, calls };
}

test("stale admin session cannot retain a revoked action", async () => {
  const f = fixture({ isAdmin: false, permissions: [] });
  await assert.rejects(f.guard({}, ["write"]), (error) => error.status === 403);
  assert.equal(f.calls[1].fresh, true);
});

test("current grants apply without trusting old session permission list", async () => {
  const f = fixture({ isAdmin: false, permissions: ["write"] }, { userId: "actor", isAdmin: false, permissions: [] });
  const result = await f.guard({}, ["write"]);
  assert.equal(result.isAdmin, false);
  assert.deepEqual([...result.permissions], ["write"]);
});

test("permission lookup failures fail closed", async () => {
  const f = fixture(new Error("lookup failed"));
  await assert.rejects(f.guard({}, ["write"]), /lookup failed/);
});

test("opening permission list cannot write or auto-register permissions", () => {
  const source = readFileSync("src/features/admin/services/permissionsService.js", "utf8");
  const readHandler = source.slice(source.indexOf("export async function listPermissions"), source.indexOf("export async function createPermission"));
  assert.ok(readHandler.includes("requireAdmin"));
  assert.ok(!/\.upsert\(|\.insert\(|\.delete\(|\.update\(/.test(readHandler));
});

test("planning scope ignores stale session grants and reads fresh permissions", async () => {
  const calls = [];
  const context = vm.createContext({ getUserPermissions: async (id, options) => {
    calls.push({ id, fresh: options.fresh });
    return { isAdmin: false, permissions: [] };
  } });
  const source = readFileSync("src/lib/claimPermissions.js", "utf8")
    .replace(/^import .*;\r?\n/gm, "")
    .replace(/export async /g, "async ").replace(/export function /g, "function ")
    .replace(/export \{ CLAIM_PERMISSIONS \};/, "");
  vm.runInContext(source + "\nthis.guard = hasPlanningManageAccess;", context);
  assert.equal(await context.guard({ session: { isAdmin: true } }, "actor"), false);
  assert.deepEqual(calls, [{ id: "actor", fresh: true }]);
});
