import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transform, loadBindings } from "next/dist/build/swc/index.js";
import * as display from "../src/lib/requisitionPreviewDisplay.js";
import * as materialPicker from "../src/lib/requisitionMaterialPicker.js";

const require = createRequire(import.meta.url);
await loadBindings();
async function load(file, overrides = {}) {
  const { code } = await transform(readFileSync(file, "utf8"), {
    filename: file,
    jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } },
    module: { type: "commonjs" },
  });
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)((name) => {
    if (overrides[name]) return overrides[name];
    if (name.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.includes("requisitionPreviewDisplay")) return display;
    if (name.includes("requisitionMaterialPicker")) return materialPicker;
    if (name.startsWith("@/") || name.startsWith("./")) return { __esModule: true, default: () => null };
    return require(name);
  }, mod, mod.exports);
  return mod.exports;
}
const toolbar = await load("src/features/production-planning/components/RequisitionDocumentToolbar.js");
const inlineQuantity = await load("src/features/production-planning/components/EditableRequisitionQtyCell.js");
const paper = await load("src/features/production-planning/components/RequisitionPaper.js");
const documentModule = await load("src/features/production-planning/components/RequisitionPreviewGeneratorClient.js", { "./RequisitionDocumentToolbar": toolbar, "./EditableRequisitionQtyCell": inlineQuantity, "./RequisitionPaper": paper });
const dates = ["2026-10-12", "2026-10-13"];
test("room tracking holds the clicked target until settled or interrupted, including the page bottom", () => {
  const papers = [{ key: "first", bottom: 300 }, { key: "middle", bottom: 600 }, { key: "last", bottom: 900 }];
  assert.equal(typeof toolbar.roomAtScrollPosition, "function");
  assert.equal(toolbar.roomAtScrollPosition(papers, 80, false, "last"), "last");
  assert.equal(toolbar.roomAtScrollPosition(papers, 80, false, "middle"), "middle");
  assert.equal(toolbar.roomAtScrollPosition(papers, 80, false, null), "first");
  assert.equal(toolbar.roomAtScrollPosition(papers, 80, true, null), "last");
  assert.equal(toolbar.roomAtScrollPosition(papers, 320, false, null), "middle");
  assert.equal(toolbar.roomAtScrollPosition([], 80, true, null), undefined);
});
test("toolbar scroll events keep the latest click, ignore horizontal scrolling and release on user input", async () => {
  const effects = [], refs = [], selections = [], listeners = new Map(), timers = new Map();
  let frame, timerId = 0;
  const scroller = { scrollTop: 0, scrollLeft: 0, scrollHeight: 1000, clientHeight: 400, parentElement: null, scrollTo() {} };
  const nav = { parentElement: scroller, getBoundingClientRect: () => ({ bottom: 80 }), contains: () => false };
  const elements = new Map(["a", "b", "c"].map((key, index) => [toolbar.requisitionDocumentId(key), {
    getBoundingClientRect: () => ({ bottom: 300 + index * 300 }), scrollIntoView() {},
  }]));
  const originals = Object.fromEntries(["window", "document", "getComputedStyle", "requestAnimationFrame", "cancelAnimationFrame", "setTimeout", "clearTimeout"].map((key) => [key, globalThis[key]]));
  try {
    globalThis.window = { addEventListener: (type, fn) => listeners.set(type, fn), removeEventListener: (type) => listeners.delete(type) };
    globalThis.document = { scrollingElement: scroller, getElementById: (id) => elements.get(id) };
    globalThis.getComputedStyle = () => ({ overflowY: "auto" });
    globalThis.requestAnimationFrame = (fn) => { frame = fn; return 1; };
    globalThis.cancelAnimationFrame = () => {};
    globalThis.setTimeout = (fn) => { timers.set(++timerId, fn); return timerId; };
    globalThis.clearTimeout = (id) => timers.delete(id);
    const hooks = { ...React, useState: () => ["", (key) => selections.push(key)], useRef: (value) => { const ref = { current: value }; refs.push(ref); return ref; }, useEffect: (fn) => effects.push(fn) };
    const module = await load("src/features/production-planning/components/RequisitionDocumentToolbar.js", { react: hooks });
    const tree = module.default({ documents: ["a", "b", "c"].map((documentKey) => ({ documentKey, roomLabel: documentKey })) });
    refs[0].current = nav;
    const cleanup = effects[1]();
    frame();
    const roomButtons = tree.props.children.props.children[1].props.children;
    roomButtons[2].props.onClick();
    listeners.get("scroll")({ target: scroller }); frame();
    assert.equal(selections.at(-1), "c");
    roomButtons[1].props.onClick();
    listeners.get("scroll")({ target: scroller }); frame();
    assert.equal(selections.at(-1), "b");
    const before = selections.length;
    listeners.get("scroll")({ target: { scrollLeft: 50 } });
    assert.equal(selections.length, before);
    for (const fn of timers.values()) fn();
    listeners.get("scroll")({ target: scroller }); frame();
    assert.equal(selections.at(-1), "a");
    roomButtons[2].props.onClick();
    listeners.get("wheel")({ type: "wheel" }); frame();
    assert.equal(selections.at(-1), "a");
    scroller.scrollTop = 600;
    listeners.get("scroll")({ target: scroller }); frame();
    assert.equal(selections.at(-1), "c");
    cleanup();
    assert.equal(listeners.size, 0);
    assert.equal(timers.size, 0);
  } finally {
    for (const [key, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[key]; else globalThis[key] = value;
    }
  }
});
const doc = {
  documentKey: "room::one", sourceDocumentKeys: ["source-a", "source-b"],
  roomLabel: "ห้องตีแป้งบิสกิต", ownerDepartmentName: "แผนกบิสกิต", qaDepartmentName: "ผู้จัดทำทดสอบ",
  exportedByDate: { "2026-10-13": true }, documentNoByDate: { "2026-10-13": "XA6910/0101" },
  lines: [{ materialGoodsCode: "M01-00040", materialName: "น้ำตาลทราย", unit: "ถุงx50กก.", totalQty: 6, qtyByDate: { "2026-10-12": 2, "2026-10-13": 4 } }],
};

test("real document renders compact metadata, preserved units, daily export identities and source detail", () => {
  const html = renderToStaticMarkup(React.createElement(documentModule.RequisitionDocument, { doc, masterPlanNo: "MP202610002", pageColumns: dates, editable: true, lotPreviewByKey: {}, onUpdateQty() {} }));
  assert.match(html, /class="paper"/);
  assert.match(html, /MP202610002/);
  assert.match(html, /ห้องตีแป้งบิสกิต/);
  assert.match(html, /<h3 class="roomTitle">ห้องตีแป้งบิสกิต<\/h3>/);
  assert.match(html, /ผู้จัดทำทดสอบ/);
  assert.match(html, /ถุงx50กก\./);
  assert.match(html, /XA6910\/0101/);
  assert.match(html, /data-exported="true"/);
  assert.match(html, /data-editable="true"/);
  assert.match(html, /aria-label="Export แล้ว แก้ไขไม่ได้"/);
  assert.match(html, /สถานะ LOT/);
  assert.match(html, /data-requisition-quantity/);
  assert.doesNotMatch(html, /fixed inset-0/);
  assert.match(html, /<header[\s\S]*เพิ่มวัตถุดิบ[\s\S]*<\/header>/);
  const readonly = renderToStaticMarkup(React.createElement(documentModule.RequisitionDocument, { doc, pageColumns: dates, editable: false, lotPreviewByKey: {} }));
  assert.doesNotMatch(readonly, /จัดการวัตถุดิบ/);
  assert.doesNotMatch(readonly, /data-editable="true"/);
  assert.match(html, /aria-controls="requisition-room%3A%3Aone-table"/);
  assert.doesNotMatch(html, /bg-gradient-to-r/);
});

test("daily product and work names are visible without a disclosure label", () => {
  const previewDoc = { ...doc, previewColumns: [
    { key: "product", dateValue: dates[0], productName: "แผ่นแครกเกอร์ปี๊บต้น", productCode: "WKB-0002", workNames: [] },
    { key: "work", dateValue: dates[1], workNames: ["แป้งหมัก 14", "คุกกี้ก้นหอย 14"] },
  ] };
  const html = renderToStaticMarkup(React.createElement(documentModule.RequisitionDocument, { doc: previewDoc, pageColumns: dates, lotPreviewByKey: {} }));
  const head = html.match(/<thead>[\s\S]*?<\/thead>/)?.[0] || "";
  assert.match(head, /แผ่นแครกเกอร์ปี๊บต้น/);
  assert.match(head, /WKB-0002/);
  assert.match(head, /แป้งหมัก 14 \/ คุกกี้ก้นหอย 14/);
  assert.doesNotMatch(head, /<details|<summary|สินค้า\s*\/\s*งาน/);
});

test("delete is a separate column, exported rows disabled and Bplus replaces ERP actual label", () => {
  const row = { materialGoodsCode: "T-1", materialName: "ทดสอบ", unit: "KG", qtyByDate: { [dates[0]]: 2 }, totalQty: 2 };
  const locked = { ...doc, lines: [{ ...row, erpLotsByDate: { [dates[0]]: [{ lotNo: "LOT1", qty: 2 }] } }] };
  const html = renderToStaticMarkup(React.createElement(documentModule.RequisitionDocument, { doc: locked, pageColumns: dates, editable: true, lotPreviewByKey: {} }));
  assert.match(html, /<th[^>]*>ลบ<\/th>/);
  assert.match(html, /class="deleteLineAction" disabled=""/);
  assert.match(html, />Bplus<\/span>/);
  assert.doesNotMatch(html, /ERP จริง/);
  const unlocked = renderToStaticMarkup(React.createElement(documentModule.RequisitionDocument, { doc: { ...doc, exportedByDate: {}, lines: [row] }, pageColumns: dates, editable: true, lotPreviewByKey: {} }));
  assert.match(unlocked, /class="deleteLineAction" title="ลบวัตถุดิบทั้งแถว"/);
});

test("shared toolbar anchors every document and keeps supplemental availability date-scoped", () => {
  const documents = [doc, { ...doc, documentKey: "room::two", roomLabel: "แครกเกอร์แผ่นเปล่า" }];
  const html = renderToStaticMarkup(React.createElement(toolbar.default, { documents, dateColumns: dates, editable: true }));
  assert.match(html, /ห้องตีแป้งบิสกิต/);
  assert.match(html, /แครกเกอร์แผ่นเปล่า/);
  assert.match(html, /aria-current="location"/);
  assert.doesNotMatch(html, /จัดการวัตถุดิบ/);
  const actions = renderToStaticMarkup(React.createElement(toolbar.RequisitionDocumentActions, { document: documents[1], dateColumns: dates }));
  assert.match(actions, /จัดการใบเบิก แครกเกอร์แผ่นเปล่า/);
  assert.match(actions, /เพิ่มวัตถุดิบ/);
  assert.doesNotMatch(actions, />จัดการวัตถุดิบ</);
  assert.match(actions, /class="hideDocumentAction"[\s\S]*?ซ่อนใบนี้/);
  assert.match(actions, /<details[\s\S]*ใบเบิกเพิ่มเติม[\s\S]*<\/details>/);
  assert.doesNotMatch(actions.match(/<details[\s\S]*<\/details>/)?.[0] || "", /ซ่อนใบนี้/);
  const unexported = renderToStaticMarkup(React.createElement(toolbar.RequisitionDocumentActions, { document: doc, dateColumns: [dates[0]] }));
  assert.match(unexported, /<button[^>]*disabled=""[^>]*>[\s\S]*?ใบเบิกเพิ่มเติม/);
  assert.equal(toolbar.requisitionDocumentId("a/b::c"), "requisition-a%2Fb%3A%3Ac");
});

test("room navigation hides display codes and current-room caption without merging duplicate rooms", () => {
  const html = renderToStaticMarkup(React.createElement(toolbar.default, { documents: [
    { ...doc, roomLabel: "[BIS01] ห้องตีแป้งบิสกิต" },
    { ...doc, documentKey: "room::raw", roomLabel: "[BIS01] ห้องตีแป้งบิสกิต" },
  ] }));
  assert.doesNotMatch(html, /BIS01|กำลังแสดง/);
  assert.equal((html.match(/ห้องตีแป้งบิสกิต/g) || []).length, 2);
  assert.equal((html.match(/aria-current="location"/g) || []).length, 1);
});

test("navigation reuses source-document keys, existing callbacks and does not write data", () => {
  const source = readFileSync("src/features/production-planning/components/RequisitionDocumentToolbar.js", "utf8");
  assert.match(source, /doc\.sourceDocumentKeys/);
  assert.match(source, /onManage\(keys\)/);
  assert.match(source, /onHide\(keys\)/);
  assert.match(source, /removeEventListener\("scroll", track, true\)/);
  assert.doesNotMatch(source, /fetch\(|\.rpc\(|localStorage|production_requisition/);
  const css = readFileSync("src/features/production-planning/components/RequisitionPreviewPresentation.module.css", "utf8");
  assert.match(css, /@media \(max-width: 600px\)/);
  assert.match(css, /data-exported="true"/);
});

test("preview period is read-only and derived from the selected master plan, never stale URL dates", () => {
  const source = readFileSync("src/features/production-planning/components/RequisitionPreviewGeneratorClient.js", "utf8");
  assert.match(source, /selectedPlan = planOptions\.find\(\(option\) => option\.planNo === masterPlanNo\)/);
  assert.match(source, /const dateFrom = selectedPlan\?\.periodStart \|\| ""/);
  assert.match(source, /const dateTo = selectedPlan\?\.periodEnd \|\| ""/);
  assert.doesNotMatch(source, /setDateFrom|setDateTo|initialDateFrom|initialDateTo|id="requisition-date-from"|id="requisition-date-to"/);
  assert.equal((source.match(/if \(!normalizedPlanNo \|\| !dateFrom \|\| !dateTo\) return null;/g) || []).length, 2);
  assert.match(source, /ช่วงวันที่ตามแผนหลัก/);
  assert.match(source, /โหลดช่วงวันที่แผนหลักไม่สำเร็จ/);
});
