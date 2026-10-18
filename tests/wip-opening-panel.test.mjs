import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transform, loadBindings } from "next/dist/build/swc/index.js";
import * as input from "../src/lib/wip-opening-input.js";

test("central opening panel is compact, uses shared UI and displays real independent units without conversion", async () => {
  await loadBindings();
  const file = new URL("../src/features/inventory/components/WipOpeningStockPanel.js", import.meta.url);
  const source = fs.readFileSync(file, "utf8");
  const { code } = await transform(source, { filename: file.pathname, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });
  const require = createRequire(import.meta.url), mod = { exports: {} };
  let hooks = 0;
  const rows = [{ id: "row", product: { code: "WKB-0064", name: "ชื่อสินค้ายาวที่ต้องแสดงครบโดยไม่ตัด" }, lotNo: "131026", quantities: { pack: "10", sachet: "7", kg: "5.2" }, notes: "" }];
  const states = [{ userId: "actor", canManage: true, departments: [{ id: "dept", name: "บิสกิต", role: "editor" }] }, "dept", "2026-10-13", rows];
  function MockHistoryTable({ title, children, controls, footer }) {
    return React.createElement("section", null, title, controls, React.createElement("table", null, children), footer);
  }
  function MockImage(props) {
    return React.createElement("img", props);
  }
  new Function("require", "module", "exports", code)(name => {
    if (name === "react") return { ...React, useState: initial => [hooks < states.length ? states[hooks++] : (hooks++, typeof initial === "function" ? initial() : initial), () => {}], useRef: value => ({ current: value }), useEffect() {} };
    if (name.endsWith(".css")) return {};
    if (name.includes("tabState")) return { useUnsavedChanges() {} };
    if (name.includes("wip-opening-input")) return input;
    if (name.includes("WeightScaleHistoryTable")) return MockHistoryTable;
    if (name.startsWith("@/")) return () => null;
    if (name === "next/image") return MockImage;
    return require(name);
  }, mod, mod.exports);
  const html = renderToStaticMarkup(React.createElement(mod.exports.default, { openingDate: "2026-10-13" }));
  for (const text of ["ชื่อสินค้ายาวที่ต้องแสดงครบโดยไม่ตัด", "ซองแยก", "แพ็คเต็ม", "ปี๊บ", "กก.", "LOT", "หมายเหตุ", "ตรวจสอบและบันทึก"]) assert.ok(html.includes(text));
  assert.match(html, /aria-label="แพ็คเต็ม แถว 1"[^>]*value="10"/);
  assert.match(html, /aria-label="ซองแยก แถว 1"[^>]*value="7"/);
  assert.doesNotMatch(html, /เลือกคลัง|>ลัง</);
  assert.match(source, /useUnsavedChanges/);
  assert.match(source, /setItem\([\s\S]*await read\(API/);
  assert.match(source, /\[400, 409\]/);
  const css = fs.readFileSync(new URL("../src/features/inventory/components/WipOpeningStockPanel.module.css", import.meta.url), "utf8");
  assert.match(css, /object-fit:\s*contain/);
  assert.doesNotMatch(css, /text-overflow:\s*ellipsis|line-clamp/);
});
