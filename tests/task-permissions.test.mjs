import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { TASK_PERMISSIONS, taskPermissionKeys } from "../src/lib/taskPermissions.js";

test("compatibility mode preserves exact old costing capabilities without broadening them", () => {
  for (const key of ["production-cost-view", "production-cost-write"]) {
    assert.deepEqual(taskPermissionKeys(key, false), ["production-line-attendance-view"]);
  }
});
test("strict mode never permits legacy grants to bypass a withdrawn action", () => {
  assert.deepEqual(taskPermissionKeys("production-cost-view", true), ["production-cost-view"]);
  assert.deepEqual(taskPermissionKeys("production-cost-write", true), ["production-cost-write"]);
  assert.throws(() => taskPermissionKeys("unknown", true), /Unknown/);
});
test("all costing routes use the staged task guard; save endpoints require write", () => {
  const root = new URL("../src/app/api/production-costing/", import.meta.url);
  for (const file of readdirSync(root, { recursive: true }).filter((name) => name.endsWith("route.js"))) {
    const source = readFileSync(new URL(file.replaceAll("\\", "/"), root), "utf8");
    assert.ok(source.includes("requireTaskPermission"), file);
    assert.ok(!source.includes("production-line-attendance-view"), file);
    if (file.startsWith("sheets")) assert.ok(source.includes("production-cost-write"), file);
  }
});
test("user-run migration retains legacy grants and refuses accidental regrant on rerun", () => {
  const sql = readFileSync(new URL("../scripts/install-role-task-permissions-costing.sql", import.meta.url), "utf8");
  assert.ok(sql.includes("lock table"));
  assert.ok(sql.includes("Installation aborted"));
  assert.ok(sql.includes("Preservation check failed"));
  assert.ok(!/delete\s+from|update\s+public\.role_permissions/i.test(sql));
});
