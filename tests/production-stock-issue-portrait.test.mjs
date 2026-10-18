import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module, { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import puppeteer from "puppeteer";

const require = createRequire(import.meta.url);
const swc = require("next/dist/build/swc");
await swc.loadBindings();
const root = path.resolve("src");
const originalResolve = Module._resolveFilename;
const originalJs = Module._extensions[".js"];
let Report;
let Assistant;
try {
  Module._resolveFilename = function (request, ...args) {
    return originalResolve.call(this, request.startsWith("@/") ? path.join(root, request.slice(2)) : request, ...args);
  };
  Module._extensions[".js"] = (module, filename) => {
    if (!filename.startsWith(root + path.sep)) return originalJs(module, filename);
    let source = readFileSync(filename, "utf8");
    // The surrounding navigation needs a Next router; it is outside this report-layout check.
    source = source.replace(/import WeightScalePrimaryHeader from [^;]+;/, "const WeightScalePrimaryHeader = () => null;");
    const { code } = swc.transformSync(source, {
      filename,
      jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
      module: { type: "commonjs" },
    });
    module._compile(code, filename);
  };
  Report = require("../src/features/production-line/components/ProductionStockIssueSummaryReportPageClient.js").default;
  Assistant = require("../src/components/chat/AiAssistantDrawer.js").default;
} finally {
  Module._resolveFilename = originalResolve;
  Module._extensions[".js"] = originalJs;
}

test("summary fits portrait paper on screen and in print without clipping product text", async () => {
  const html = renderToStaticMarkup(createElement(Report, {
    scope: { departmentName: "แผนกบิสกิต", products: [] },
    issueTypes: [{ value: "KPF", label: "เบิก KPF" }],
    initialRows: [{ productCode: "WKB-0002", productName: "แผ่นแครกเกอร์ใบบัว รสสับปะรด (ห้องบรรจุบิสกิต)", destinationRoomName: "ห้องบรรจุบิสกิต", lotNo: "0110260002-1", issueDate: "2026-10-01", issueType: "KPF", quantity: 129, totalWeightKg: 1612.65 }],
    initialFilters: { dateFrom: "2026-10-01", dateTo: "2026-10-06" },
  })) + renderToStaticMarkup(createElement(Assistant));
  const { compile } = require("@tailwindcss/node");
  const stylesheet = await compile(readFileSync("src/app/globals.css", "utf8"), { base: path.resolve("src/app"), onDependency() {} });
  const classes = [...html.matchAll(/class="([^"]+)"/g)].flatMap((match) => match[1].split(/\s+/));
  const css = stylesheet.build(classes);
  const browser = await puppeteer.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1000, height: 900 });
    // Keep the real report styles and markup; unrelated controls are outside the measured canvas.
    await page.setContent(`<style>${css}</style>${html}`);
    const assistantSelector = '[aria-label="ผู้ช่วย AI KPF Quickplan"]';
    assert.ok(await page.$eval(assistantSelector, (button) => button.getBoundingClientRect().width > 0), "assistant remains available on screen");
    const preview = await page.$eval(".summary-issue-report-print-shell", (sheet) => ({ width: sheet.getBoundingClientRect().width, height: sheet.getBoundingClientRect().height, overflow: sheet.scrollWidth > sheet.clientWidth + 1 }));
    assert.ok(preview.width <= 794, `portrait preview is ${preview.width}px wide`);
    assert.equal(preview.overflow, false);
    assert.ok(Math.abs(preview.height / preview.width - 297 / 210) < 0.002, `web sheet is ${preview.width} × ${preview.height}px, not A4-shaped`);
    await page.setViewport({ width: 760, height: 900 });
    const narrow = await page.$eval(".summary-issue-report-print-shell", (sheet) => ({ width: sheet.getBoundingClientRect().width, height: sheet.getBoundingClientRect().height }));
    assert.ok(Math.abs(narrow.height / narrow.width - 297 / 210) < 0.002, "narrower web sheet retains its A4 proportions");
    await page.setViewport({ width: 1000, height: 900 });
    const webProduct = await page.$eval(".summary-issue-report-table tbody .summary-issue-product-cell", (cell) => ({ whiteSpace: getComputedStyle(cell).whiteSpace, clipped: cell.scrollWidth > cell.clientWidth + 1 }));
    assert.equal(webProduct.whiteSpace, "normal");
    assert.equal(webProduct.clipped, false);
    await page.emulateMediaType("print");
    assert.equal(await page.$eval(assistantSelector, (button) => button.getBoundingClientRect().width), 0, "assistant is absent from print layout");
    assert.doesNotMatch(await page.evaluate(() => document.body.textContent), /ยอดรวมด้านล่างนับเฉพาะเบิกสำเร็จ/);
    await page.addStyleTag({ content: ".issue-summary-print-only { width: 198mm !important; }" });
    const printed = await page.$eval(".issue-summary-print-table tbody .issue-summary-product-cell", (cell) => ({ whiteSpace: getComputedStyle(cell).whiteSpace, overflow: getComputedStyle(cell).overflow, text: cell.textContent }));
    assert.equal(printed.whiteSpace, "normal");
    assert.notEqual(printed.overflow, "hidden");
    assert.match(printed.text, /แผ่นแครกเกอร์ใบบัว รสสับปะรด \(ห้องบรรจุบิสกิต\)/);
    const printOverflow = await page.$eval(".issue-summary-print-table", (table) => table.scrollWidth > table.clientWidth + 1);
    assert.equal(printOverflow, false);
    const pageSize = await page.evaluate(() => [...document.styleSheets].flatMap((sheet) => [...sheet.cssRules]).filter((rule) => rule.type === CSSRule.PAGE_RULE).at(-1)?.style.size);
    assert.ok(pageSize === "a4" || pageSize === "a4 portrait", `print page size is ${pageSize}`);
    const pdf = Buffer.from(await page.pdf({ preferCSSPageSize: true })).toString("latin1");
    const mediaBox = pdf.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)/);
    assert.ok(mediaBox, "PDF has a measurable paper size");
    assert.ok(Math.abs(Number(mediaBox[1]) - 595.28) < 1, "PDF width is A4 portrait");
    assert.ok(Math.abs(Number(mediaBox[2]) - 841.89) < 1, "PDF height is A4 portrait");
  } finally {
    await browser.close();
  }
});
