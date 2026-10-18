import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { REPORT_GROUPS, reportHref, visibleReportGroups, buildReportMenuGroups, PIECE_RATE_REPORT_VIEWS } from "../src/features/production-line/reportCenter.js";
import { LABOR_REPORTS } from "../src/features/production-line/report-center/laborReportDefinitions.js";

test("piece-rate reports share one menu with four named views and retain authorized deep links", () => {
  const groups = visibleReportGroups(["production-piece-rate-report-view"], false);
  for (const query of ["", "ค่าแรงรายชิ้น"]) {
    const menu = buildReportMenuGroups(groups, query).flatMap(group => group.sections.flatMap(section => section.reports));
    assert.deepEqual(menu.filter(report => report.id.startsWith("wages")).map(report => [report.id, report.label]), [["wages", "ค่าแรงรายชิ้น"]]);
  }
  assert.deepEqual(PIECE_RATE_REPORT_VIEWS.map(view => view.label), ["รวมเอกสาร", "แยกเอกสาร", "ตามพนักงาน", "ตามสินค้า"]);
  const reports = groups.flatMap(group => group.reports);
  for (const view of PIECE_RATE_REPORT_VIEWS) {
    assert.ok(reports.some(report => report.id === view.value), "existing view URLs remain accessible");
    assert.equal(LABOR_REPORTS[view.value].title, "รายงานค่าแรงรายชิ้น");
    assert.ok(LABOR_REPORTS[view.value].printTitle.endsWith(view.label));
  }
  assert.equal(buildReportMenuGroups(visibleReportGroups([], false)).length, 0);
});

test("report sidebar shows report categories without favorites or recent shortcuts", () => {
  const source = readFileSync("src/features/production-line/components/ReportCenterClient.js", "utf8");
  assert.doesNotMatch(source, /รายการโปรด|ใช้งานล่าสุด|shortcuts\(|saveNavigation\(/);
  assert.match(source, /menuGroups\.map\(\(entry\)/);
  assert.doesNotMatch(source, /เมนูรายงานเดิม/);
  assert.match(source, /ค้นหารายงาน/);
});

test("compact report menu groups prison reports and searches only authorized entries", () => {
  const stock = buildReportMenuGroups(REPORT_GROUPS, "").find((group) => group.id === "stock");
  assert.deepEqual(stock.sections.map((section) => [section.label, section.reports.length]), [["ทั่วไป", 4], ["เรือนจำ", 4]]);
  assert.equal(buildReportMenuGroups(REPORT_GROUPS, "เรือนจำ").find((group) => group.id === "stock").sections.flatMap((section) => section.reports).length, 6);
  const filtered = buildReportMenuGroups(REPORT_GROUPS, "รายงานชั่งละเอียด");
  assert.deepEqual(filtered.flatMap((group) => group.sections.flatMap((section) => section.reports.map((report) => report.id))), ["scale-inbound-detail"]);
  assert.equal(buildReportMenuGroups(visibleReportGroups([], false), "เรือนจำ").length, 0);
});

test("report center keeps real routes, honors capabilities and permission boundaries", () => {
  const reports = REPORT_GROUPS.flatMap((group) => group.reports);
  assert.equal(REPORT_GROUPS.length, 7);
  assert.equal(new Set(reports.map((report) => report.id)).size, reports.length);
  for (const report of reports) {
    const path = report.href.split("?")[0];
    assert.ok(existsSync(`src/app${path}/page.js`), path);
  }
  const issue = reports.find((report) => report.id === "stock-issue");
  const url = new URL(reportHref(issue, { dateFrom: "2026-09-28", dateTo: "2026-10-03" }), "https://kpf.test");
  assert.equal(url.searchParams.get("dateFrom"), "2026-09-28");
  assert.equal(url.searchParams.get("reportCenter"), "1");
  assert.throws(() => reportHref(issue, { dateFrom: "2026-10-03", dateTo: "2026-09-28" }));
  assert.throws(() => reportHref(issue, { dateFrom: "2026-02-30", dateTo: "2026-03-01" }));
  const balance = reports.find((report) => report.id === "stock-balance");
  assert.ok(!reportHref(balance, { dateFrom: "2026-09-28", dateTo: "2026-10-03" }).includes("dateFrom"));
  assert.ok(!reports.find((r) => r.id === "jam-balance").dates);
  assert.ok(!reports.find((r) => r.id === "jam-prison-balance").dates);
  assert.equal(visibleReportGroups([], false).length, 0);
  assert.equal(visibleReportGroups([], true).length, 7);
  assert.ok(REPORT_GROUPS.find((group) => group.id === "stock").reports.some((report) => report.id === "prison-inbound"));
  assert.ok(!REPORT_GROUPS.some((group) => group.id === "prison"));
  assert.deepEqual(visibleReportGroups(["production-line-planning-view"], false).map((group) => group.id), ["planning"]);
  assert.equal(new URL(reportHref(reports.find((r) => r.id === "jam-issue"), {}), "https://kpf.test").searchParams.get("reportType"), "issue");
});

test("compact report center has no top tabs or shared filters and retains report-local dates", () => {
  const center = readFileSync("src/features/production-line/components/ReportCenterClient.js", "utf8");
  assert.doesNotMatch(center, /styles\.(topbar|filters)|setDates|เลือกช่วงวันที่จากศูนย์รายงาน|ช่วงวันที่ด้านบน/);
  assert.match(center, /ReportRequestCacheProvider scope=/);
  assert.ok(center.indexOf("<aside ref={menu}") < center.indexOf("<div className={styles.content}>"), "report sidebar sits outside padded report content");
  const layout = readFileSync("src/features/production-line/components/ReportCenter.module.css", "utf8");
  assert.match(layout, /\.sidebar\{[^}]*height:100dvh;[^}]*overflow-y:auto;[^}]*position:sticky;top:0/);
  assert.match(layout, /\.flyout\{position:fixed;left:var\(--flyout-left/);
  const summary = readFileSync("src/features/production-line/components/ProductionStockIssueSummaryReportPageClient.js", "utf8");
  const compact = summary.slice(summary.indexOf("{reportCenter &&"), summary.indexOf("<style>", summary.indexOf("{reportCenter &&")));
  assert.match(compact, /aria-label="วันที่เริ่มต้นรายงาน"/);
  assert.match(compact, /aria-label="วันที่สิ้นสุดรายงาน"/);
  assert.match(compact, /loadReport\(filters\)/);
  assert.doesNotMatch(compact, /centerFiltersOpen/);
});

test("report viewport grows with content and exposes only overflowing horizontal content", async () => {
  const modulePath = "../src/features/production-line/reportViewport.js";
  const adapter = await import(modulePath).catch((error) => {
    if (error.code !== "ERR_MODULE_NOT_FOUND") throw error;
    return null;
  });
  assert.ok(adapter, "shared report viewport adapter must resize embedded reports");
  const frame = {
    style: {},
    contentDocument: {
      body: { offsetHeight: 2400, scrollHeight: 2400, scrollWidth: 1800, getBoundingClientRect() { return { height: this.offsetHeight }; } },
      documentElement: { clientWidth: 1000, scrollWidth: 1800, getBoundingClientRect: () => ({ height: 0 }) },
    },
  };
  const scrollbar = { hidden: true, firstElementChild: { style: {} } };
  const tables = [{ scrollWidth: 1800, clientWidth: 1000 }];
  adapter.sizeReportViewport(frame, scrollbar, tables);
  assert.equal(frame.style.height, "2400px");
  assert.equal(scrollbar.firstElementChild.style.width, "1800px");
  assert.equal(scrollbar.hidden, false);
  frame.contentDocument.body.offsetHeight = 600;
  frame.contentDocument.body.scrollHeight = 600;
  frame.contentDocument.body.scrollWidth = 1000;
  frame.contentDocument.documentElement.scrollWidth = 1000;
  tables[0].scrollWidth = 1000;
  adapter.sizeReportViewport(frame, scrollbar, tables);
  assert.equal(frame.style.height, "600px", "a shorter report must shrink without reloading");
  assert.equal(scrollbar.hidden, true);
});

test("report viewport ignores unavailable documents during navigation", async () => {
  const { sizeReportViewport, attachReportViewport } = await import("../src/features/production-line/reportViewport.js");
  for (const contentDocument of [null, { body: null, documentElement: null }]) {
    const frame = { contentDocument, style: { height: "600px" } };
    assert.doesNotThrow(() => sizeReportViewport(frame, null));
    assert.doesNotThrow(() => attachReportViewport(frame, null));
    assert.equal(frame.style.height, "600px");
  }
});

test("horizontal report range comes from table overflow rather than the whole page", async () => {
  const { sizeReportViewport } = await import("../src/features/production-line/reportViewport.js");
  const frame = { style: {}, contentDocument: {
    body: { offsetHeight: 600, scrollHeight: 600, scrollWidth: 2400, getBoundingClientRect: () => ({ height: 600 }) },
    documentElement: { clientWidth: 1000, scrollWidth: 2400, getBoundingClientRect: () => ({ height: 600 }) },
  } };
  const scrollbar = { hidden: true, firstElementChild: { style: {} } };
  sizeReportViewport(frame, scrollbar, [{ scrollWidth: 1500, clientWidth: 800 }]);
  assert.equal(scrollbar.firstElementChild.style.width, "1700px");
  sizeReportViewport(frame, scrollbar, []);
  assert.equal(scrollbar.hidden, true, "wide headers must not trigger page scrolling");
});
