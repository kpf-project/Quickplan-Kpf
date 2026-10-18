import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transform, loadBindings } from "next/dist/build/swc/index.js";

const require = createRequire(import.meta.url);
async function loadComponent(name) {
  const file = new URL("../src/components/settings/" + name + ".js", import.meta.url);
  const source = fs.readFileSync(file, "utf8");
  await loadBindings();
  const { code } = await transform(source, { filename: file.pathname, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)((name) => {
    if (name.includes("adminClient")) return { adminFetch() { throw new Error("No company API calls allowed in render tests"); } };
    if (name.includes("SettingsTable")) return { __esModule: true, default: ({ children, label }) => React.createElement("table", { "aria-label": label }, children) };
    if (name.includes("SettingsDialog") || name.includes("WeightScalePaginationBar")) return { __esModule: true, default: () => null };
    return require(name);
  }, mod, mod.exports);
  return { Component: mod.exports.default, source };
}

test("all three settings catalogs render shared labeled tables and real filter controls without company requests", async () => {
  for (const [name, props, columns] of [
    ["UserManagementPanel", { roles: [], departments: [] }, ["ชื่อผู้ใช้งาน", "สถานะใช้งาน", "ลำดับ"]],
    ["LineApproverLinksPanel", {}, ["การเชื่อมต่อ LINE", "สถานะโค้ด", "ลำดับ"]],
    ["AuditLogPanel", {}, ["ผู้ดำเนินการ", "รายการที่เปลี่ยนแปลง", "ลำดับ"]],
  ]) {
    const { Component, source } = await loadComponent(name);
    const html = renderToStaticMarkup(React.createElement(Component, props));
    assert.match(html, /<table aria-label=/);
    assert.match(html, /<select aria-label=/);
    for (const column of columns) assert.ok(html.includes(column), column);
    assert.ok(source.includes("SettingsTable"), "use shared table");
    assert.ok(!source.includes("space-y-8"), "remove oversized legacy card layout");
  }
});

test("account safety actions and server audit pagination remain wired", () => {
  const user = fs.readFileSync(new URL("../src/components/settings/UserManagementPanel.js", import.meta.url), "utf8");
  for (const action of ["force_logout_all", "archive", "hard_delete", "set_active", "requiresReason", "canHardDelete"]) assert.ok(user.includes(action));
  const audit = fs.readFileSync(new URL("../src/components/settings/AuditLogPanel.js", import.meta.url), "utf8");
  assert.ok(audit.includes("cursorMap"));
  assert.ok(audit.includes("log.metadata?.before"));
  assert.ok(audit.includes("รายการนี้ไม่มีข้อมูลก่อนเปลี่ยน"));
  assert.ok(audit.includes('timeZone: "Asia/Bangkok"'));
});
