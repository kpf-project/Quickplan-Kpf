import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { observeReportRequest, afterReportPaint } from "../src/components/reporting/reportSearch.js";
import { createReportRequestCache } from "../src/features/production-line/report-center/reportRequestCache.js";

const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

// React's renderer is covered in Chrome; this harness exercises the real hook's request lifecycle.
function requestHarness() {
  let index = 0;
  const states = [];
  let dependencies, cleanup, effect;
  let cache = { ...createReportRequestCache(), scope: "user-a", revision: 0 };
  const source = readFileSync(new URL("../src/features/production-line/report-center/useReportRequest.js", import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/gm, "").replace("export function", "function");
  const hook = vm.runInNewContext(`${source}\nuseReportRequest;`, {
    useState(initial) {
      const slot = index++;
      if (!(slot in states)) states[slot] = initial;
      return [states[slot], (value) => { states[slot] = typeof value === "function" ? value(states[slot]) : value; }];
    },
    useTransition: () => [false, (callback) => callback()],
    useEffect(callback, next) {
      if (!dependencies || next.some((value, i) => value !== dependencies[i])) {
        effect = callback;
        dependencies = next;
      }
    },
    observeReportRequest,
    useReportRequestCache: () => cache,
  });
  return {
    render(key, load, initial) {
      index = 0;
      const result = hook(key, load, initial);
      if (effect) { cleanup?.(); cleanup = effect(); effect = null; }
      return result;
    },
    refresh() { cache = { ...cache, revision: cache.revision + 1 }; },
    changeUser() { cache = { ...createReportRequestCache(), scope: "user-b", revision: 0 }; },
  };
}

const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };

test("shared request hook keeps the previous report pending, settles errors and retries", async () => {
  const harness = requestHarness();
  const first = () => Promise.resolve({ rows: [1] });
  assert.equal(harness.render("first", first).loading, true);
  await settle();
  assert.deepEqual(harness.render("first", first).report.rows, [1]);
  const next = deferred();
  const load = () => next.promise;
  const pending = harness.render("next", load);
  assert.equal(pending.loading, true);
  assert.deepEqual(pending.report.rows, [1]);
  next.reject(new Error("network unavailable"));
  await settle();
  const failed = harness.render("next", load);
  assert.equal(failed.loading, false);
  assert.equal(failed.error, "network unavailable");
  assert.deepEqual(failed.report.rows, [1]);
  failed.retry();
  const retry = () => Promise.resolve({ rows: [2] });
  assert.equal(harness.render("next", retry).loading, true);
  await settle();
  assert.deepEqual(harness.render("next", retry).report.rows, [2]);
});

test("same-filter refresh fetches new data rather than reusing server initial data", async () => {
  const harness = requestHarness();
  let calls = 0;
  const load = () => { calls += 1; return Promise.resolve({ rows: [2] }); };
  const initial = { rows: [1] };
  harness.render("same", load, initial);
  await settle();
  assert.equal(calls, 0);
  harness.refresh();
  assert.equal(harness.render("same", load, initial).loading, true);
  await settle();
  assert.equal(calls, 1);
  assert.deepEqual(harness.render("same", load, initial).report.rows, [2]);
});

test("changed permission scope never displays a previous user's report", async () => {
  const harness = requestHarness();
  const load = () => Promise.resolve({ rows: ["private"] });
  harness.render("report", load);
  await settle();
  assert.deepEqual(harness.render("report", load).report.rows, ["private"]);
  harness.changeUser();
  assert.equal(harness.render("report", load).report, null);
});

test("superseded report responses cannot replace the latest result", async () => {
  const old = deferred();
  const latest = deferred();
  const values = [];
  const stop = observeReportRequest(old.promise, (value) => values.push(value), assert.fail);
  observeReportRequest(latest.promise, (value) => values.push(value), assert.fail);
  stop();
  latest.resolve("new");
  old.resolve("old");
  await Promise.all([old.promise, latest.promise]);
  assert.deepEqual(values, ["new"]);
});

test("old failures are ignored; current failures remain visible and retryable", async () => {
  const old = deferred();
  const errors = [];
  const stop = observeReportRequest(old.promise, assert.fail, (error) => errors.push(error.message));
  stop();
  old.reject(new Error("old"));
  observeReportRequest(Promise.reject(new Error("current")), assert.fail, (error) => errors.push(error.message));
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(errors, ["current"]);
});

test("search work waits until a frame and following task so pending feedback can paint", async () => {
  const events = [];
  const waiting = afterReportPaint({ requestAnimationFrame: (callback) => { events.push("frame"); callback(); }, setTimeout: (callback) => { events.push("task"); callback(); } });
  events.push("feedback");
  await waiting;
  events.push("search");
  assert.deepEqual(events, ["frame", "task", "feedback", "search"]);
});

test("background tabs do not wait indefinitely for a paused animation frame", async () => {
  let tasks = 0;
  await afterReportPaint({ document: { hidden: true }, requestAnimationFrame: assert.fail, setTimeout: (callback) => { tasks += 1; callback(); } });
  assert.equal(tasks, 1);
});

test("all native report families share request lifecycle and preserve their loaders", () => {
  for (const family of ["Stock", "Labor", "Jam", "Output"]) {
    const source = readFileSync(new URL(`../src/features/production-line/report-center/${family}ReportWorkspace.js`, import.meta.url), "utf8");
    assert.match(source, /useReportRequest\(/, family);
    assert.match(source, /loading=\{loading\}/, family);
  }
});

test("legacy and direct report filters share immediate feedback and duplicate-submit protection", () => {
  const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const legacy = source("src/components/print/ReportFilterBar.js");
  const direct = source("src/features/production-line/report-center/ProductionReportWorkspace.js");
  for (const file of [legacy, direct]) {
    assert.match(file, /useReportSearch\(/);
    assert.match(file, /<ReportSearchStatus/);
  }
  assert.match(legacy, /disabled=\{isPrinting \|\| searching\}/);
  assert.match(legacy, /disabled=\{isExporting \|\| searching\}/);
  assert.match(direct, /busy=\{actionsBusy\}/);
  assert.match(source("src/components/reporting/useReportSearch.js"), /isLoading \|\| locked.current/);
  const center = source("src/features/production-line/components/ReportCenterClient.js");
  assert.match(center, /event.origin !== window.location.origin/);
  assert.match(center, /frameEl\?\.contentWindow === event.source/);
  assert.match(center, /disabled=\{isBusy \|\| pendingBySrc\[src\]\}/);
});
