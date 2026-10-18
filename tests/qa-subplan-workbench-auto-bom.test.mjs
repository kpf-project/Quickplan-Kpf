import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync("src/features/production-planning/components/QaSubplanWorkbenchClient.js", "utf8").replaceAll("\r", "");
const fnStart = source.indexOf("function toValidDraftRequestLines(");
const fnEnd = source.indexOf("\nfunction mapAutoDraftRows", fnStart);
const serialize = new Function("toNumber", `${source.slice(fnStart, fnEnd)}; return toValidDraftRequestLines;`)((value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback);
const effectStart = source.indexOf("  useEffect(() => {\n    if (!activeMasterPlanNo || !activeDepartmentId || !activeSectionId || draftLoading)");
assert.ok(effectStart > 0);
const effect = source.slice(effectStart + "  useEffect(() => {".length, source.indexOf("\n  }, [", effectStart));
const runEffect = new Function("activeMasterPlanNo", "activeDepartmentId", "activeSectionId", "draftLoading", "draftLines", "setPreviewPending", "setPreviewError", "setPreviewData", "setPreviewMeta", "fetchJson", "toValidDraftRequestLines", "setTimeout", "clearTimeout", effect);

test("live BOM preview cancels stale scopes and never replaces the edited WIP lines", async () => {
  const lines = [{ id: "line", skuCode: "WIP1", workDate: "2026-10-19", plannedQty: 14, planningUnit: "batch", shiftId: "s1", formulaCode: "F2", bomVersionId: "v2" }];
  const before = JSON.stringify(lines), calls = [], responses = [], timers = [], pending = [], errors = [], data = [];
  const request = (url, options) => { calls.push({ url, options }); return new Promise(resolve => responses.push(resolve)); };
  const start = plan => runEffect(plan, "dept", "room", false, lines, value => pending.push(value), value => errors.push(value), value => data.push(value), () => {}, request, serialize, fn => { timers.push(fn); return timers.length; }, () => {});
  const cleanup = start("OLD");
  const old = timers[0]();
  cleanup();
  start("NEW");
  const latest = timers[1]();
  responses[1]({ ok: true, data: { data: { marker: "latest" }, meta: {} } });
  await latest;
  responses[0]({ ok: true, data: { data: { marker: "stale" }, meta: {} } });
  await old;
  assert.deepEqual(data, [{ marker: "latest" }]);
  assert.equal(calls[0].options.signal.aborted, true);
  const payload = JSON.parse(calls[1].options.body);
  assert.equal(payload.ignorePersistedDraft, true);
  assert.equal(payload.masterPlanNo, "NEW");
  assert.equal(payload.wipDraftLines[0].plannedQty, 14);
  assert.equal(payload.wipDraftLines[0].formulaCode, "F2");
  assert.equal(payload.wipDraftLines[0].bomVersionId, "v2");
  assert.equal(payload.wipDraftLines[0].unit, "batch");
  assert.equal(JSON.stringify(lines), before);
  assert.equal(pending.at(-1), false);
});

test("failed live preview retains drafts and reports failure rather than accepting stale quantities", async () => {
  let run; const errors = [], data = [];
  const lines = [{ id: "a", workDate: "2026-10-19", skuCode: "WIP1", plannedQty: 4 }];
  runEffect("MP1", "dept", "room", false, lines, () => {}, value => errors.push(value), value => data.push(value), () => {}, async () => ({ ok: false, error: { message: "offline" } }), serialize, fn => { run = fn; }, () => {});
  await run();
  assert.equal(errors.at(-1), "offline");
  assert.deepEqual(data, []);
  assert.equal(lines[0].plannedQty, 4);
});
