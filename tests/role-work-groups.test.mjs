import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transform, loadBindings } from "next/dist/build/swc/index.js";
import { buildRoleWorkGroups } from "../src/lib/roleWorkGroups.js";
import * as permissionMatrix from "../src/lib/permissionMatrix.js";
import { TASK_PERMISSIONS } from "../src/lib/taskPermissions.js";

const fixture = [{ id: "production_line", items: [
  { id: "output", perm_key: "production-output-write", label: "บันทึกและแก้ไขผลผลิต" },
  { id: "wage", perm_key: "production-line-attendance-piece-rate-money-view", label: "ค่าแรง" },
  { id: "cost", perm_key: "production-cost-view", label: "เปิดดูต้นทุน" },
  { id: "old", perm_key: "custom-old", label: "สิทธิ์เดิม" },
] }];

test("work groups preserve every registration and isolate sensitive money rights", () => {
  const groups = buildRoleWorkGroups(fixture);
  assert.deepEqual(groups.flatMap((group) => group.rows.flatMap((row) => row.items.map((item) => item.id))).sort(), ["cost", "old", "output", "wage"]);
  assert.deepEqual(groups.find((group) => group.id === "sensitive").rows[0].items.map((item) => item.id), ["wage", "cost"]);
  assert.equal(groups.find((group) => group.id === "compatibility").rows[0].items[0].id, "old");
  assert.equal(groups.find((group) => group.id === "production").rows[0].title, "บันทึกผลผลิต");
  assert.deepEqual(buildRoleWorkGroups([]), []);
});

test("data costs and wage rate editing stay in the sensitive section", () => {
  const keys = ["data-products-cost-view", "raw-materials-cost-view", "production-settings-piece-rate-rate-edit", "production-settings-snack-wage-view", "production-scale-receipt-write", "production-packing-output-write", "production-prison-issue-write"];
  const groups = buildRoleWorkGroups([{ id: "other", items: keys.map((perm_key) => ({ id: perm_key, perm_key, label: perm_key })) }]);
  assert.deepEqual(groups.find((group) => group.id === "sensitive").rows[0].items.map((item) => item.id), keys.slice(0, 4));
  assert.equal(groups.find((group) => group.id === "production").rows.length, 3);
});

test("role form renders three columns and full checkbox actions without company calls", async () => {
  const source = fs.readFileSync(new URL("../src/components/settings/RolePermissionsForm.js", import.meta.url), "utf8");
  await loadBindings();
  const { code } = await transform(source, { filename: "RolePermissionsForm.js", jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });
  const require = createRequire(import.meta.url);
  const componentModule = { exports: {} };
  new Function("require", "module", "exports", code)((name) => {
    if (name.includes("permissionMatrix")) return permissionMatrix;
    if (name.includes("roleWorkGroups")) return { buildRoleWorkGroups };
    if (name.includes("taskPermissions")) return { TASK_PERMISSIONS };
    if (name.includes(".module.css")) return { __esModule: true, default: {} };
    if (name.includes("tabState")) return { useUnsavedChanges() {} };
    if (name.includes("SettingsTable")) return { __esModule: true, default: ({ children, label }) => React.createElement("table", { "aria-label": label }, children) };
    if (name.includes("SettingsDialog")) return { __esModule: true, default: () => null };
    return require(name);
  }, componentModule, componentModule.exports);
  const html = renderToStaticMarkup(React.createElement(componentModule.exports.default, { roles: [{ id: "role", name: "หัวหน้าแผนก", user_count: 8 }], permissionGroups: fixture }));
  assert.match(html, /<th>ส่วนงาน<\/th><th>สิทธิ์ที่อนุญาต<\/th><th>ข้อควรรู้<\/th>/);
  assert.match(html, /aria-label="บันทึกและแก้ไขผลผลิต"/);
  assert.match(html, /ผู้ใช้บทบาทนี้ 8 คน/);
  assert.match(html, /ข้อมูลสำคัญและการอนุมัติ/);
  assert.match(html, /แผนกที่ได้รับมอบหมายกำหนดที่ผู้ใช้งาน/);
  for (const guard of ["useUnsavedChanges", "permissionDiff", "role?.is_system", "setReview(true)", "[...(next?.permissions || [])]"]) assert.ok(source.includes(guard), guard);
  assert.ok(source.includes('role?.role_key === "admin"'));
  assert.ok(source.includes("checked={adminRole || selected.includes(item.id)}"));
  assert.ok(source.includes('aria-label="รายการบทบาท" tabIndex={0}'));
  const css = fs.readFileSync(new URL("../src/components/settings/RolePermissionsForm.module.css", import.meta.url), "utf8");
  assert.match(css, /\.roleScroll[^}]*overflow-y: auto[^}]*overscroll-behavior-y: contain/);
  assert.match(css, /\.roleList[^}]*max-height: calc\(100dvh - 200px\)/);
});
