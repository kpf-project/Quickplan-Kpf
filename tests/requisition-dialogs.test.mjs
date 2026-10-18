import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { transform, loadBindings } from "next/dist/build/swc/index.js";

const require = createRequire(import.meta.url);
await loadBindings();
const root = "src/features/production-planning/components/";
async function load(file, extra = "", overrides = {}) {
  const { code } = await transform(readFileSync(root + file, "utf8") + extra, {
    filename: file, jsc: { parser: { syntax: "ecmascript", jsx: true }, transform: { react: { runtime: "automatic" } } }, module: { type: "commonjs" },
  });
  const mod = { exports: {} };
  new Function("require", "module", "exports", code)(name => {
    if (overrides[name]) return overrides[name];
    if (name.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_, key) => String(key) }) };
    if (name.startsWith("@/") || name.startsWith("./")) return { __esModule: true, default: () => null };
    return require(name);
  }, mod, mod.exports);
  return mod.exports;
}
const dialog = await load("RequisitionDialog.js");
const lotDialog = await load("RequisitionLotDialog.js", "", { "./RequisitionDialog": dialog });
const planPicker = await load("RequisitionPlanPicker.js");
const mod = await load("RequisitionPreviewGeneratorClient.js", "\nexport { DeleteConfirmModal, ExportExcelModal, HideDocumentConfirmModal, HiddenDocumentsModal };", { "./RequisitionDialog": dialog });
const html = (Component, props) => renderToStaticMarkup(React.createElement(Component, props));

test("shared compact dialog keeps named modal, close and disabled busy actions", () => {
  const markup = html(dialog.default, { title: "ทดสอบ", busy: true, onClose() {}, children: "เนื้อหา" });
  assert.match(markup, /role="dialog"/);
  assert.match(markup, /aria-modal="true"/);
  assert.match(markup, /aria-busy="true"/);
  assert.match(markup, /aria-label="ปิดหน้าต่าง" disabled/);
});

test("delete and hide use shared white confirmations and distinct destructive/orange action", () => {
  const deletion = html(mod.DeleteConfirmModal, { state: { materialGoodsCode: "M01-01", materialName: "แป้ง", unit: "ถุง" }, saving: true, error: "ลองใหม่", onCancel() {}, onConfirm() {} });
  assert.match(deletion, /ลบรายการนี้/);
  assert.match(deletion, /M01-01/);
  assert.match(deletion, /ถุง/);
  assert.match(deletion, /role="alert"/);
  assert.match(deletion, /class="danger"[^>]*disabled/);
  const hide = html(mod.HideDocumentConfirmModal, { open: true, document: { roomLabel: "ห้องทดสอบ" }, masterPlanNo: "MP0001", onCancel() {}, onConfirm() {} });
  assert.match(hide, /MP0001/);
  assert.match(hide, /class="orange"/);
  assert.match(hide, /ไม่ซ่อน/);
  assert.match(hide, /ไม่รวมในไฟล์ Excel/);
});

test("Excel retains independent daily and weekly choices with busy submit", () => {
  const markup = html(mod.ExportExcelModal, { open: true, selectedDate: "2026-10-12", dateColumns: ["2026-10-12"], departments: [{ id: "one", label: "แผนกทดสอบ" }], selectedDepartmentIdsDaily: ["one"], selectedDepartmentIdsWeekly: [], submitting: true, onClose() {}, onToggleDepartment() {} });
  assert.equal((markup.match(/type="checkbox"/g) || []).length, 2);
  assert.equal((markup.match(/checked=""/g) || []).length, 1);
  assert.match(markup, /กำลัง Export/);
  assert.match(markup, /class="primary"[^>]*disabled/);
});

test("hidden documents list contains only hidden keys and restorable table rows", () => {
  const markup = html(mod.HiddenDocumentsModal, { open: true, hiddenKeys: ["hidden"], allDocuments: [{ documentKey: "hidden", roomLabel: "ห้องซ่อน", ownerDepartmentName: "แผนกทดสอบ", lines: [{}, {}] }, { documentKey: "visible", roomLabel: "ห้องไม่ซ่อน" }], onClose() {}, onRestore() {}, onRestoreAll() {} });
  assert.match(markup, /<table/);
  assert.match(markup, /ห้องซ่อน/);
  assert.doesNotMatch(markup, /ห้องไม่ซ่อน/);
  assert.match(markup, /แสดงใบนี้/);
  assert.match(markup, /แสดงทั้งหมด/);
});

test("reset requires explicit confirmation and failed persistence leaves dialog open", () => {
  const source = readFileSync(root + "RequisitionPreviewGeneratorClient.js", "utf8");
  assert.match(source, /const resetDocument = \(docKey\) => setResetConfirmState/);
  assert.match(source, /const resetAllDrafts = \(\) => setResetConfirmState/);
  assert.match(source, /if \(ok\) setResetConfirmState\(null\)/);
  assert.match(source, /catch \(resetError\)/);
  assert.match(source, /role="status" className=\{dialogStyles.toast\}/);
});

test("wide LOT workbench keeps complete headers, real units, reservation details and old selection rules", () => {
  let selected, confirmed = 0, details;
  const props = {
    document: { roomLabel: "ห้องทดสอบ" }, masterPlanNo: "MP0001", state: { line: { materialGoodsCode: "M01", materialName: "แป้ง", unit: "ถุงx25กก." }, column: { dateValue: "2026-10-12" } },
    options: [{ key: "lot|04", lotNo: "261005", warehouseCode: "04", stockQty: 8, availableQty: 6, reservedByOtherQty: 2 }], draft: {}, requiredQty: 5, allocatedQty: 0,
    details: { lotNo: "261005", warehouseCode: "04", reservedByOtherQty: 2, reservedByOtherDetails: [{ roomLabel: "ห้องที่จอง", departmentName: "แผนก", workDate: "2026-10-12", qty: 2 }] },
    onDetails(value) { details = value; }, onChangeDraft(fn) { selected = fn({}); }, onClose() {}, onConfirm() { confirmed++; },
    formatDate: value => value || "-", formatQty: String, formatQtyOrZero: String, roundQty: Number, toNumber: value => Number(value || 0),
  };
  const markup = html(lotDialog.default, props);
  assert.match(markup, /สต็อกจริง \(ถุงx25กก\.\)/);
  assert.match(markup, /จำนวนที่ใบนี้เลือก/);
  assert.match(markup, /ห้องที่จอง/);
  assert.equal((markup.match(/role="dialog"/g) || []).length, 1);
  assert.match(markup, /disabled="">ยืนยัน LOT/);
  const nodes = n => !n || typeof n !== "object" ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children)];
  const tree = lotDialog.default(props), all = nodes(tree);
  all.find(n => n.type === "input" && n.props.type === "checkbox").props.onChange({ target: { checked: true } });
  assert.deepEqual(selected, { "lot|04": 5 });
  all.find(n => n.type === "input" && n.props.type === "checkbox").props.onChange({ target: { checked: false } });
  assert.deepEqual(selected, { "lot|04": 0 });
  all.find(n => n.type === "input" && n.props.type === "number").props.onChange({ target: { value: "1.25" } });
  assert.deepEqual(selected, { "lot|04": 1.25 });
  all.find(n => n.type === "button" && n.props.className === "link").props.onClick();
  assert.equal(details.warehouseCode, "04");
  const completed = lotDialog.default({ ...props, allocatedQty: 5 });
  const footerNodes = nodes(completed.props.footer);
  const confirm = footerNodes.find(n => n.type === "button" && n.props.children === "ยืนยัน LOT");
  assert.equal(confirm.props.disabled, false);
  confirm.props.onClick();
  assert.equal(confirmed, 1);
  const css = readFileSync(root + "RequisitionLotDialog.module.css", "utf8");
  assert.match(css, /\.table th \{[^}]*white-space: nowrap;[^}]*text-overflow: clip;/);
  assert.match(css, /\.tableScroll \{[^}]*overflow: auto;/);
});

test("plan archive filters dates across all months, renders actual periods and selects once", async () => {
  const plans = Array.from({ length: 120 }, (_, index) => ({ planNo: `MP${index}`, periodStart: index < 60 ? "2026-10-12" : "2025-09-01", periodEnd: index < 60 ? "2026-10-18" : "2025-09-07" }));
  const formatDate = value => value ? value.split("-").reverse().map((part, index) => index === 2 ? Number(part) + 543 : part).join("/") : "-";
  assert.equal(planPicker.filterRequisitionPlans(plans, "", "2026", "10", formatDate).length, 60);
  assert.equal(planPicker.filterRequisitionPlans(plans, "01/09/2568", "2026", "10", formatDate).length, 60);
  assert.equal(planPicker.filterRequisitionPlans(plans, "MP119", "2026", "10", formatDate)[0].planNo, "MP119");
  let selected = "", closed = 0;
  const props = { plans, selectedPlanNo: "MP1", formatDate, onSelect: value => { selected = value; }, onClose: () => { closed++; } };
  const markup = html(planPicker.default, props);
  assert.match(markup, /12\/10\/2569 – 18\/10\/2569/);
  assert.match(markup, /ใช้อยู่/);
  assert.match(markup, /120 แผนทั้งหมด/);
  const nodes = n => !n || typeof n !== "object" ? [] : Array.isArray(n) ? n.flatMap(nodes) : [n, ...nodes(n.props?.children)];
  const hooks = { ...React, useState: initial => [initial, () => {}], useRef: () => ({ current: null }), useEffect() {}, useMemo: fn => fn() };
  const plain = await load("RequisitionPlanPicker.js", "", { react: hooks });
  const tree = plain.default(props);
  const row = nodes(tree).find(n => n.type === "button" && n.props["aria-current"] === "true");
  row.props.onClick();
  assert.equal(selected, "MP1");
  assert.equal(closed, 1);
  tree.props.onMouseDown({ target: 1, currentTarget: 1 });
  assert.equal(closed, 2);
  assert.match(readFileSync(root + "RequisitionPlanPicker.module.css", "utf8"), /background: #0008/);
});
