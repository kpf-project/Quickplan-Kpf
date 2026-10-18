import test from "node:test";
import assert from "node:assert/strict";
import { createReportRequestCache } from "../src/features/production-line/report-center/reportRequestCache.js";
import { fetchSupabaseRowsByChunks } from "../src/lib/supabaseRangeFetch.js";

test("report cache deduplicates requests and retains the previous result during refresh", async () => {
  const cache = createReportRequestCache();
  let calls = 0;
  let finish;
  const loader = () => { calls += 1; return new Promise((resolve) => { finish = resolve; }); };
  const first = cache.load("wages:date:permissions", loader);
  const second = cache.load("wages:date:permissions", loader);
  await Promise.resolve();
  finish({ rows: [1] });
  assert.deepEqual(await first, await second);
  assert.equal(calls, 1);
  const refresh = cache.load("wages:date:permissions", loader);
  assert.deepEqual(cache.get("wages:date:permissions"), { rows: [1] });
  await Promise.resolve();
  finish({ rows: [2] });
  await refresh;
  assert.deepEqual(cache.get("wages:date:permissions"), { rows: [2] });
});

test("cleared or different-user caches cannot be populated by an old request", async () => {
  const cache = createReportRequestCache();
  let finish;
  const request = cache.load("report", () => new Promise((resolve) => { finish = resolve; }));
  await Promise.resolve();
  cache.clear();
  finish("old-user-data");
  await assert.rejects(request, /session changed/);
  assert.equal(cache.get("report"), undefined);
  assert.equal(createReportRequestCache().get("report"), undefined);
});

test("report cache is bounded and does not retain failed requests", async () => {
  const cache = createReportRequestCache(2);
  await cache.load("a", () => 1);
  await cache.load("b", () => 2);
  await cache.load("c", () => 3);
  assert.equal(cache.get("a"), undefined);
  await assert.rejects(cache.load("failed", () => { throw new Error("403"); }));
  assert.equal(cache.get("failed"), undefined);
  assert.equal(await cache.load("failed", () => "retry"), "retry");
});

test("chunk reads overlap within the configured bound and retain input order", async () => {
  let active = 0;
  let peak = 0;
  const rows = await fetchSupabaseRowsByChunks([1, 2, 3, 4, 5], async ([value]) => {
    active += 1;
    peak = Math.max(peak, active);
    await new Promise((resolve) => setTimeout(resolve, (6 - value) * 2));
    active -= 1;
    return { data: [value] };
  }, { chunkSize: 1, concurrency: 2 });
  assert.equal(peak, 2);
  assert.deepEqual(rows, [1, 2, 3, 4, 5]);
});

test("chunk failures retain the original whole-operation fallback semantics", async () => {
  const rows = await fetchSupabaseRowsByChunks([1, 2, 3], async ([value]) => value === 2
    ? { error: new Error("missing") }
    : { data: [value] }, { chunkSize: 1, onError: () => ["fallback"] });
  assert.deepEqual(rows, ["fallback"]);
});
