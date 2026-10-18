import test from "node:test";
import assert from "node:assert/strict";

// Mock browser environment for tab storage and navigation tests
class MockStorage {
  constructor() {
    this.store = new Map();
  }
  getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  setItem(key, value) {
    this.store.set(key, String(value));
  }
  removeItem(key) {
    this.store.delete(key);
  }
  clear() {
    this.store.clear();
  }
}

globalThis.window = {
  localStorage: new MockStorage(),
  sessionStorage: new MockStorage(),
  dispatchEvent: () => true,
  addEventListener: () => {},
  removeEventListener: () => {},
  scrollTo: () => {},
};
globalThis.sessionStorage = globalThis.window.sessionStorage;
globalThis.localStorage = globalThis.window.localStorage;
globalThis.CustomEvent = class CustomEvent {
  constructor(name, detail) {
    this.name = name;
    this.detail = detail;
  }
};

const {
  resolveTabIdentity,
  upsertTab,
  removeTab,
  closeOtherTabs,
  saveTabScroll,
  getTabScroll,
  setTabUnsaved,
  isTabUnsaved,
  getTabUnsavedMessage,
} = await import("../src/lib/tabState.js");
const { resolveNavigationTitle, KNOWN_ROUTE_TITLES } = await import("../src/components/appNavigation.js");

test("Tab Architecture - 1 Tab per 1 Page (No over-grouping or collapsing)", () => {
  const routes = [
    "/production-line/weight-scale",
    "/production-line/weight-scale/report",
    "/production-line/weight-scale/report-summary",
    "/production-line/stock",
    "/production-line/stock/balance/lot",
    "/production-line/stock/issues/report",
    "/production-line/attendance",
    "/production-line/attendance/piece-rate-scan",
    "/production-line/planning/schedule",
    "/production-line/planning/material-verification",
    "/raw-materials",
    "/raw-material-receipts",
  ];

  const identities = routes.map((route) => resolveTabIdentity(route));

  // Each route must produce a unique key identical to its route
  const keys = new Set(identities.map((id) => id.key));
  assert.equal(keys.size, routes.length, "All distinct page routes must produce distinct tab keys (1 tab per 1 page)");

  identities.forEach((id, idx) => {
    assert.equal(id.key, routes[idx], `Tab key must match exact route for ${routes[idx]}`);
    assert.equal(id.href, routes[idx], `Tab href must match exact route for ${routes[idx]}`);
    assert.ok(id.title && id.title.length > 0, `Tab title must not be empty for ${routes[idx]}`);
  });
});

test("Accurate Thai Page Titles for all production, warehouse, and report routes", () => {
  const expectations = {
    "/production-line/weight-scale": "ชั่งน้ำหนักผลิตภัณฑ์",
    "/production-line/weight-scale/report": "รายงานชั่งน้ำหนัก",
    "/production-line/weight-scale/report-summary": "รายงานสรุปภาพรวมชั่งน้ำหนัก",
    "/production-line/stock": "นำเข้าสต็อกตั้งต้น",
    "/production-line/stock/issues/report": "รายงานเบิกสินค้า",
    "/production-line/stock/issues/report-summary": "รายงานสรุปเบิกสินค้า",
    "/production-line/stock/balance/lot": "รายงานสต็อกคงเหลือ LOT",
    "/production-line/attendance": "บันทึกงานไลน์ผลิต",
    "/production-line/attendance/piece-rate-scan": "บันทึกเนื้อขนมป้ายแยม",
    "/production-line/planning/schedule": "วางแผนการผลิต",
    "/production-line/planning/material-verification": "ตรวจสอบวัตถุดิบ",
    "/raw-materials": "สต็อกคลังวัตถุดิบ",
    "/raw-material-receipts": "รับเข้าวัตถุดิบ",
    "/raw-material-requisitions": "ใบเบิกวัตถุดิบ",
    "/hr/consolidated": "รายงานสแกนนิ้ว",
  };

  for (const [route, expectedTitle] of Object.entries(expectations)) {
    const title = resolveNavigationTitle(route);
    assert.equal(title, expectedTitle, `Route ${route} should have title '${expectedTitle}', got '${title}'`);
  }
});

test("Scroll position isolation and preservation per tab", () => {
  globalThis.sessionStorage.clear();

  saveTabScroll("/production-line/stock/balance/lot", 1250);
  saveTabScroll("/production-line/weight-scale/report", 480);

  assert.equal(getTabScroll("/production-line/stock/balance/lot"), 1250);
  assert.equal(getTabScroll("/production-line/weight-scale/report"), 480);
  assert.equal(getTabScroll("/production-line/bom"), 0, "Unvisited tab should have 0 scroll");
});

test("Unsaved changes guard tracks dirty state per tab", () => {
  const dirtyPath = "/production-line/bom";
  const cleanPath = "/production-line/weight-scale";

  assert.equal(isTabUnsaved(dirtyPath), false);

  setTabUnsaved(dirtyPath, true, "คุณมีการแก้ไขสูตร BOM ที่ยังไม่ได้บันทึก");
  assert.equal(isTabUnsaved(dirtyPath), true);
  assert.equal(isTabUnsaved(cleanPath), false);
  assert.equal(getTabUnsavedMessage(dirtyPath), "คุณมีการแก้ไขสูตร BOM ที่ยังไม่ได้บันทึก");

  setTabUnsaved(dirtyPath, false);
  assert.equal(isTabUnsaved(dirtyPath), false);
});

test("Tab storage operations: upsert, remove, close others", () => {
  globalThis.localStorage.clear();

  upsertTab("/page-1");
  upsertTab("/page-2");
  upsertTab("/page-3");

  const raw = JSON.parse(globalThis.localStorage.getItem("kpf-open-tabs-v1") || "[]");
  assert.equal(raw.length, 3);
  assert.equal(raw[0].href, "/page-1");
  assert.equal(raw[1].href, "/page-2");
  assert.equal(raw[2].href, "/page-3");

  // Remove page-2
  removeTab("/page-2");
  const afterRemove = JSON.parse(globalThis.localStorage.getItem("kpf-open-tabs-v1") || "[]");
  assert.equal(afterRemove.length, 2);
  assert.equal(afterRemove.some((t) => t.href === "/page-2"), false);

  // Close others except page-1
  closeOtherTabs("/page-1");
  const afterCloseOthers = JSON.parse(globalThis.localStorage.getItem("kpf-open-tabs-v1") || "[]");
  assert.equal(afterCloseOthers.length, 1);
  assert.equal(afterCloseOthers[0].href, "/page-1");
});

test("Tab normalization, deduplication and security filtering", () => {
  globalThis.localStorage.clear();

  // Re-visiting the same route with or without trailing slash doesn't duplicate
  upsertTab("/production-line/weight-scale");
  upsertTab("/production-line/weight-scale/");
  upsertTab("/production-line/weight-scale");

  let stored = JSON.parse(globalThis.localStorage.getItem("kpf-open-tabs-v1") || "[]");
  assert.equal(stored.length, 1, "Duplicate visits must not duplicate tabs");
  assert.equal(stored[0].href, "/production-line/weight-scale");

  // Malicious or invalid hrefs should be rejected
  upsertTab("https://malicious.com");
  upsertTab("//malicious.com");
  upsertTab("javascript:alert(1)");
  stored = JSON.parse(globalThis.localStorage.getItem("kpf-open-tabs-v1") || "[]");
  assert.equal(stored.length, 1, "External or unsafe URLs must be rejected");

  // Max tabs enforcement (20 tabs max)
  for (let i = 1; i <= 25; i++) {
    upsertTab(`/production-line/view-${i}`);
  }
  stored = JSON.parse(globalThis.localStorage.getItem("kpf-open-tabs-v1") || "[]");
  assert.equal(stored.length, 20, "Tabs count should cap at MAX_TABS (20)");
  assert.equal(stored[stored.length - 1].href, "/production-line/view-25");
});

test("Date filter persistence and deep-link query preservation on tab switch", () => {
  globalThis.localStorage.clear();
  globalThis.sessionStorage.clear();

  const reqRoute = "/raw-material-requisitions/requisition";
  const attendanceRoute = "/production-line/attendance";

  // 1. User opens requisition tab
  upsertTab(reqRoute);
  let tabs = JSON.parse(globalThis.localStorage.getItem("kpf-open-tabs-v1") || "[]");
  assert.equal(tabs.length, 1);
  assert.equal(tabs[0].href, reqRoute);

  // 2. User searches for date range 2026-08-01 to 2026-08-21
  globalThis.sessionStorage.setItem("kpf-tab-state:requisition-filter:requisition:dateFrom", JSON.stringify("2026-08-01"));
  globalThis.sessionStorage.setItem("kpf-tab-state:requisition-filter:requisition:dateTo", JSON.stringify("2026-08-21"));
  upsertTab(`${reqRoute}?dateFrom=2026-08-01&dateTo=2026-08-21`);

  tabs = JSON.parse(globalThis.localStorage.getItem("kpf-open-tabs-v1") || "[]");
  assert.equal(tabs.length, 1, "Must still be 1 tab (no duplicate tabs created)");
  assert.equal(tabs[0].key, reqRoute);
  assert.equal(tabs[0].href, `${reqRoute}?dateFrom=2026-08-01&dateTo=2026-08-21`, "Tab href must retain date parameters");

  // 3. User switches to attendance tab
  upsertTab(attendanceRoute);
  tabs = JSON.parse(globalThis.localStorage.getItem("kpf-open-tabs-v1") || "[]");
  assert.equal(tabs.length, 2);

  // 4. User returns to requisition tab
  const reqTab = tabs.find((t) => t.key === reqRoute);
  assert.ok(reqTab, "Requisition tab must exist");
  assert.equal(reqTab.href, `${reqRoute}?dateFrom=2026-08-01&dateTo=2026-08-21`);

  // Verify sessionStorage restores the user's selected date range rather than resetting to current month
  const restoredFrom = JSON.parse(globalThis.sessionStorage.getItem("kpf-tab-state:requisition-filter:requisition:dateFrom"));
  const restoredTo = JSON.parse(globalThis.sessionStorage.getItem("kpf-tab-state:requisition-filter:requisition:dateTo"));

  assert.equal(restoredFrom, "2026-08-01", "Restored dateFrom must be 2026-08-01");
  assert.equal(restoredTo, "2026-08-21", "Restored dateTo must be 2026-08-21");
});

