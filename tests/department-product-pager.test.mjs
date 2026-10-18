import test from "node:test";
import assert from "node:assert/strict";
import { createDepartmentProductPager } from "../src/features/production-line-settings/services/departmentProductPager.js";

test("picker loads real next/previous pages and reopening resets search and cursor", async () => {
  const calls = [];
  const pager = createDepartmentProductPager(async params => {
    calls.push(params);
    return { ok: true, data: { data: [{ sku_code: params.cursor ? "LAST-SKU" : "FIRST-SKU" }], cursor: { hasMore: !params.cursor, next: params.cursor ? null : "real-cursor" } } };
  });
  assert.equal((await pager.open()).page, 1);
  assert.equal((await pager.next()).data[0].sku_code, "LAST-SKU");
  assert.equal(calls[1].cursor, "real-cursor");
  assert.equal((await pager.previous()).page, 1);
  await pager.search("สินค้า");
  assert.equal(calls.at(-1).search, "สินค้า");
  assert.equal((await pager.open()).page, 1);
  assert.equal(calls.at(-1).search, "");
  assert.equal(calls.at(-1).cursor, undefined);
  assert.equal(calls[0].pageSize, "8");
});

test("stale searches cannot replace a newer result and failed next page is retryable", async () => {
  let release;
  const pager = createDepartmentProductPager(params => params.search === "old" ? new Promise(resolve => { release = resolve; }) : Promise.resolve({ ok: true, data: { data: [{ sku_code: "new" }], cursor: { hasMore: false, next: null } } }));
  const old = pager.search("old");
  assert.equal((await pager.search("new")).data[0].sku_code, "new");
  release({ ok: true, data: { data: [{ sku_code: "old" }] } });
  assert.equal(await old, null);
  let failed = true;
  const retry = createDepartmentProductPager(async params => {
    if (params.page === "2" && failed) { failed = false; return { ok: false, error: { message: "offline" } }; }
    return { ok: true, data: { data: [], pagination: { totalPages: 3 } } };
  });
  await retry.open();
  await assert.rejects(retry.next(), /offline/);
  assert.equal((await retry.next()).page, 2);
});

test("all server pages remain reachable beyond 150 rows, including short deduplicated pages", async () => {
  const pager = createDepartmentProductPager(async params => {
    const page = Number(params.page);
    return { ok: true, data: { data: [{ sku_code: `SKU-${page}` }], pagination: { totalPages: 25 }, cursor: { hasMore: false, next: null } } };
  });
  let result = await pager.open();
  const seen = [];
  while (result) {
    seen.push(result.data[0].sku_code);
    result = await pager.next();
  }
  assert.equal(seen.length, 25);
  assert.equal(seen.at(-1), "SKU-25");
});
