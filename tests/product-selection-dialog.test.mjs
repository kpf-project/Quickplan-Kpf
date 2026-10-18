import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transform, loadBindings } from "next/dist/build/swc/index.js";

test("shared dialog renders continuous numbering, full names and draft-only confirmation", async () => {
  const file = new URL("../src/components/ProductSelectionDialog.js", import.meta.url);
  assert.ok(fs.existsSync(file), "dialog must exist");
  await loadBindings();
  const { code } = await transform(fs.readFileSync(file, "utf8"), { filename: file.pathname, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" } });
  const componentModule = { exports: {} }, require = createRequire(import.meta.url);
  new Function("require", "module", "exports", code)(name => name.endsWith(".css") ? {} : name.includes("WeightScalePaginationBar") ? () => null : name === "next/image" ? props => React.createElement("img", { src: props.src, alt: props.alt }) : require(name), componentModule, componentModule.exports);
  const product = { code: "P101", name: "ชื่อสินค้ายาวมากแต่ต้องแสดงเต็มไม่ตัด", unitName: "KG" };
  const html = renderToStaticMarkup(React.createElement(componentModule.exports.default, { products: [product], page: 5, totalCount: 101, selectedProduct: product, searchTerm: "", onClose() {}, onConfirm() {} }));
  assert.match(html, /ลำดับ/);
  assert.match(html, />101</);
  assert.match(html, /ชื่อสินค้ายาวมากแต่ต้องแสดงเต็มไม่ตัด/);
  assert.match(html, /รูปไม่พร้อม/);
  assert.match(html, /aria-modal="true"/);
  for (const props of [{ selectedProduct: null }, { selectedProduct: null, loading: true, products: [] }, { selectedProduct: null, error: "โหลดไม่สำเร็จ" }]) {
    const empty = renderToStaticMarkup(React.createElement(componentModule.exports.default, { products: [product], page: 1, totalCount: 1, searchTerm: "", onClose() {}, onConfirm() {}, ...props }));
    assert.match(empty, /เลือกรายการจากตาราง/);
    assert.match(empty, /disabled=""/);
  }
  const css = fs.readFileSync(new URL("../src/components/ProductSelectionDialog.module.css", import.meta.url), "utf8");
  assert.match(css, /object-fit:\s*contain/);
  assert.doesNotMatch(css, /text-overflow:\s*ellipsis|line-clamp/);
  const eventModule = { exports: {} };
  new Function("require", "module", "exports", code)(name => name === "react" ? { useEffect() {}, useId: () => "picker", useRef: () => ({ current: null }), useState: () => [null, () => {}] } : name.endsWith(".css") ? {} : name.includes("WeightScalePaginationBar") ? () => null : require(name), eventModule, eventModule.exports);
  let confirmations = 0;
  const tree = eventModule.exports.default({ products: [product], onConfirm() { confirmations++; } });
  function visit(node) {
    if (!node || typeof node !== "object") return;
    if (node.type === "button" && node.props.disabled && node.props.onClick) node.props.onClick();
    React.Children.forEach(node.props?.children, visit);
  }
  assert.doesNotThrow(() => visit(tree));
  assert.equal(confirmations, 0);
});
