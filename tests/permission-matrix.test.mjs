import test from "node:test";
import assert from "node:assert/strict";
import { buildPermissionMatrix, permissionDiff } from "../src/lib/permissionMatrix.js";

test("matrix preserves every permission and never invents an action", () => {
  const items = [
    { id: "v", perm_key: "production-line-bom-view", label: "BOM (View)" },
    { id: "m", perm_key: "production-line-bom-manage", label: "BOM (Manage)" },
    { id: "x", perm_key: "unknown-view", label: "Unknown" },
    { id: "p", perm_key: "plan.claim_material", label: "Claim" },
  ];
  const groups = buildPermissionMatrix([{ id: "production", sections: [{ items }] }]);
  assert.equal(groups.flatMap((group) => group.rows).length, 3);
  assert.deepEqual(Object.keys(groups[0].rows[0].cells), ["view", "manage"]);
  assert.deepEqual(groups.flatMap((group) => group.rows).flatMap((row) => Object.values(row.cells).map((item) => item.id)).sort(), ["m", "p", "v", "x"]);
  assert.equal(groups[0].rows[1].cells.special.id, "x");
});

test("real scale and planning keys get explicit categories without adding registrations", () => {
  const items = ["central-scale-view", "central-scale-receive", "plan.approve_exception", "plan.edit_own_dept", "raw-materials-summary"].map((perm_key, index) => ({ id: String(index), perm_key, label: perm_key }));
  const result = buildPermissionMatrix([{ id: "other", title: "อื่นๆ", items }]);
  assert.equal(result.find((group) => group.id === "scale").rows[0].cells.view.id, "0");
  assert.equal(result.find((group) => group.id === "planning").rows[0].cells.approve.id, "2");
  assert.equal(result.flatMap((group) => group.rows).flatMap((row) => Object.values(row.cells)).length, items.length);
  assert.ok(!result.some((group) => group.id === "opening"), "do not fabricate uninstalled WIP permissions");
});

test("diff includes unknown existing IDs and ignores duplicate IDs", () => {
  assert.deepEqual(permissionDiff(["a", "legacy"], ["a", "b", "b", "legacy"]), { added: ["b"], removed: [] });
  assert.deepEqual(permissionDiff(["a", "legacy"], ["b"]), { added: ["b"], removed: ["a", "legacy"] });
  assert.deepEqual(permissionDiff(["a"], ["a"]), { added: [], removed: [] });
});
