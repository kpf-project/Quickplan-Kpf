import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transform, loadBindings } from "next/dist/build/swc/index.js";

test("shared scale table keeps column headers visible when empty and renders supplied rows", async () => {
  const file = new URL("../src/features/production-line/components/WeightScaleHistoryTable.js", import.meta.url);
  assert.equal(fs.existsSync(file), true, "shared presentation table must exist");
  await loadBindings();
  const { code } = await transform(fs.readFileSync(file, "utf8"), { filename: file.pathname, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });
  const componentModule = { exports: {} };
  const require = createRequire(import.meta.url);
  new Function("require", "module", "exports", code)(name => name.endsWith(".css") ? {} : require(name), componentModule, componentModule.exports);
  const Component = componentModule.exports.default;
  const head = React.createElement("thead", null, React.createElement("tr", null, React.createElement("th", null, "บาร์โค้ด")));
  const empty = renderToStaticMarkup(React.createElement(Component, { title: "รายการคืน", empty: true, columnCount: 1, emptyMessage: "ยังไม่มีรายการ" }, head));
  assert.match(empty, /<table/);
  assert.match(empty, /<th>บาร์โค้ด<\/th>/);
  assert.match(empty, /ยังไม่มีรายการ/);
  const body = React.createElement("tbody", null, React.createElement("tr", null, React.createElement("td", null, "LIVE001")));
  const populated = renderToStaticMarkup(React.createElement(Component, { title: "รายการคืน", count: 1 }, head, body));
  assert.match(populated, /LIVE001/);
  assert.match(populated, /1 รายการ/);
});
