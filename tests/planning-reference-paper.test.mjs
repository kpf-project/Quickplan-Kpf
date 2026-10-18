import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadBindings, transform } from "next/dist/build/swc/index.js";

const require = createRequire(import.meta.url);
await loadBindings();
async function load() {
  const file = "src/features/production-planning/components/PlanningReferencePaper.js";
  const { code } = await transform(readFileSync(file, "utf8"), { filename: file, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)((name) => name.endsWith(".css") ? { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) } : require(name), mod, mod.exports);
  return mod.exports;
}

test("reference paper preserves one table and exposes fullscreen, print and collapse actions", async () => {
  const { default: Paper } = await load();
  const html = renderToStaticMarkup(React.createElement(Paper, { title: "แผนย่อย WIP ทั้งหมด", metadata: "MP202610002", onCollapse() {} }, React.createElement("table", null, React.createElement("tbody", null, React.createElement("tr", null, React.createElement("td", null, "14 ชุด"))))));
  assert.equal((html.match(/<table/g) || []).length, 1);
  assert.match(html, /เต็มจอ/);
  assert.match(html, /พิมพ์/);
  assert.match(html, /ย่อ/);
  assert.match(html, /14 ชุด/);
});

test("printing isolates the selected paper, applies landscape only during print and cleans up", async () => {
  const { printPlanningReference } = await load();
  const previous = { window: globalThis.window, document: globalThis.document };
  const attributes = new Map();
  let afterPrint, removed = false, printed = false;
  const paper = { setAttribute: (key, value) => attributes.set(key, value), removeAttribute: (key) => attributes.delete(key) };
  const style = { textContent: "", remove: () => { removed = true; } };
  try {
    globalThis.document = { createElement: () => style, head: { appendChild() {} }, fullscreenElement: null };
    globalThis.window = { addEventListener: (_, fn) => { afterPrint = fn; }, removeEventListener() {}, print: () => { printed = attributes.has("data-print-plan"); } };
    const cleanup = await printPlanningReference(paper);
    assert.equal(printed, true);
    assert.match(style.textContent, /A4 landscape/);
    afterPrint();
    assert.equal(attributes.size, 0);
    assert.equal(removed, true);
    cleanup();
  } finally { Object.assign(globalThis, previous); }
});

test("printing exits fullscreen first and removes temporary print state on failure", async () => {
  const { printPlanningReference } = await load();
  const previous = { window: globalThis.window, document: globalThis.document };
  const events = [];
  try {
    globalThis.document = {
      fullscreenElement: {}, exitFullscreen: async () => events.push("exit"),
      createElement: () => ({ remove: () => events.push("remove-style") }),
      head: { appendChild() {} },
    };
    globalThis.window = { addEventListener() {}, removeEventListener() {}, print: () => { events.push("print"); throw new Error("blocked"); } };
    await assert.rejects(printPlanningReference({ setAttribute() {}, removeAttribute: () => events.push("remove-target") }), /blocked/);
    assert.deepEqual(events, ["exit", "print", "remove-target", "remove-style"]);
  } finally { Object.assign(globalThis, previous); }
});
