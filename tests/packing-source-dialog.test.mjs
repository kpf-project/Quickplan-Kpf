import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { loadBindings, transform } from "next/dist/build/swc/index.js";
import puppeteer from "puppeteer";

test("carryover picker identifies the selected product and renders LOT balances as a table", async () => {
  await loadBindings();
  const filename = "src/app/production-line/attendance/packing-output/PackingSourceDialog.js";
  const { code } = await transform(readFileSync(filename, "utf8"), { filename, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });
  const require = createRequire(import.meta.url), mod = { exports: {} };
  new Function("require", "module", "exports", code)(name => name.endsWith(".css") ? { default: new Proxy({}, { get: (_, key) => key }), __esModule: true } : name.includes("SettingsDialog") ? { default: ({ children }) => createElement("dialog", null, children), __esModule: true } : require(name), mod, mod.exports);
  const html = renderToStaticMarkup(createElement(mod.exports.default, {
    product: { code: "BL0-4002", name: "คุกกี้ทดสอบ", imageUrl: "/product.png" }, loading: false,
    options: [{ id: "source-1", lot_no: "270869", remaining: 1, unit_label: "ปี๊บ", work_date: "2026-08-27" }],
    selected: [], onChange() {}, onClose() {},
  }));
  assert.match(html, /<table/);
  assert.match(html, /BL0-4002/);
  assert.match(html, /คุกกี้ทดสอบ/);
  assert.match(html, /src="\/product.png"/);
  assert.match(html, /270869/);
  assert.match(html, /1 ปี๊บ/);
  assert.match(html, /aria-label="เลือก LOT 270869"/);
  const css = readFileSync("src/components/settings/settings.css", "utf8") + readFileSync("src/app/production-line/attendance/packing-output/PackingWorkspace.module.css", "utf8");
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    for (const width of [390, 1280]) {
      await page.setViewport({ width, height: 800 });
      await page.setContent(`<style>${css}</style>${html.replace("<dialog>", '<dialog class="settings-dialog">')}`);
      await page.evaluate(() => document.querySelector("dialog").showModal());
      const box = await page.evaluate(() => {
        const dialog = document.querySelector("dialog"), rect = dialog.getBoundingClientRect();
        return { left: rect.left, width: rect.width, top: rect.top, height: rect.height, scrollWidth: dialog.scrollWidth, clientWidth: dialog.clientWidth };
      });
      assert.ok(Math.abs(box.left - (width - box.width) / 2) < 2, "dialog must be horizontally centered");
      assert.ok(Math.abs(box.top - (800 - box.height) / 2) < 2, "dialog must be vertically centered");
      assert.ok(box.scrollWidth <= box.clientWidth, "dialog must not overflow on mobile");
    }
  } finally { await browser.close(); }
});
