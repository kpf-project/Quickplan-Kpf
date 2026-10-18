import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { normalizeProductHotkey } from "../src/lib/productHotkeys.js";

const departmentId = "00000000-0000-0000-0000-000000000001";
function route({ canView = true, canOperate = true, mapped = true, rows = new Map() } = {}) {
  class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
  let writes = 0;
  const db = { from(table) {
    let department;
    return {
      select() { return this; },
      eq(column, value) { if (column === "department_id") department = value; return this; },
      async maybeSingle() { return { data: mapped ? { sku_code: "P1", uom_name: "KG" } : null }; },
      then(resolve) { return Promise.resolve({ data: [...rows.values()].filter(row => row.department_id === department) }).then(resolve); },
      async upsert(row) {
        if ([...rows.values()].some(existing => existing.department_id === row.department_id && existing.product_code !== row.product_code && existing.hotkey === row.hotkey)) return { error: { code: "23505" } };
        assert.equal(table, "production_department_product_hotkeys");
        rows.set(row.department_id + row.product_code, row);
        writes++;
        return {};
      },
    };
  } };
  const context = vm.createContext({ URL, Response, ApiError, normalizeProductHotkey,
    getSupabaseAdmin: () => db,
    readJson: request => request.json(),
    jsonError: error => Response.json({ error: error.message }, { status: error.status || 500 }),
    requireWeightScaleLivePermission: async () => ({ userId: "u1" }),
    loadWeightScaleLiveAccess: async () => ({ canView, canOperate }),
    normalizeId: value => String(value || "").trim(),
    LIVE_SCALE_WIP_CATEGORY_CODE: "03",
    loadWeightScaleLiveExcludedProductCodes: async () => new Set(),
  });
  const accessSource = fs.readFileSync(new URL("../src/lib/scale/live-access.js", import.meta.url), "utf8");
  vm.runInContext(accessSource.slice(accessSource.indexOf("export async function assertWeightScaleLiveProductAccess"), accessSource.indexOf("export async function requireWeightScaleLivePermission")).replaceAll("export ", ""), context);
  const source = fs.readFileSync(new URL("../src/app/api/scale/live/hotkeys/route.js", import.meta.url), "utf8");
  vm.runInContext(source.replace(/^import .*;\r?\n/gm, "").replaceAll("export ", "") + "\nthis.handlers = { GET, POST };", context);
  return { ...context.handlers, writes: () => writes };
}
function post(handler, productCode, hotkey, department = departmentId) {
  return handler.POST(new Request("http://localhost/api", { method: "POST", body: JSON.stringify({ departmentId: department, productCode, hotkey }) }));
}

test("department bindings follow users across computers without a station or hardware connection", async () => {
  const rows = new Map();
  const first = route({ rows });
  assert.equal((await post(first, "P1", "j")).status, 200);
  const second = route({ rows });
  const response = await second.GET(new Request(`http://localhost/api?departmentId=${departmentId}`));
  assert.deepEqual((await response.json()).bindings, { P1: "J" });
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("department key collisions reject, different departments can reuse and updates preserve other products", async () => {
  const handler = route();
  assert.equal((await post(handler, "P1", "1")).status, 200);
  assert.equal((await post(handler, "P2", "1")).status, 409);
  assert.equal((await post(handler, "P2", "1", "00000000-0000-0000-0000-000000000002")).status, 200);
  assert.equal((await post(handler, "P1", "J")).status, 200);
});

test("unauthorized departments, viewers, unmapped products and invalid keys cannot write", async () => {
  for (const [config, expected] of [[{ canView: false }, 403], [{ canOperate: false }, 403], [{ mapped: false }, 403]]) {
    const handler = route(config);
    assert.equal((await post(handler, "P1", "1")).status, expected);
    assert.equal(handler.writes(), 0);
  }
  const handler = route();
  assert.equal((await post(handler, "P1", "Enter")).status, 400);
  assert.equal((await post(handler, "P1", "1", "")).status, 400);
  assert.equal(handler.writes(), 0);
});

test("central database enforces unique department keys and denies browser direct writes", () => {
  const sql = fs.readFileSync(new URL("../scripts/apply-department-product-hotkeys.sql", import.meta.url), "utf8");
  assert.match(sql, /unique \(department_id, hotkey\)/);
  assert.match(sql, /primary key \(department_id, product_code\)/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all.*anon, authenticated/);
  const picker = fs.readFileSync(new URL("../src/components/ProductPicker.js", import.meta.url), "utf8");
  assert.doesNotMatch(picker, /localStorage|productHotkeyStorageKey|ต้องเชื่อมต่อจุดชั่งก่อน/);
  assert.match(picker, /requestDepartmentProductHotkeys/);
});

test("weighing page handles shortcuts outside the picker without submitting stock", () => {
  const source = fs.readFileSync(new URL("../src/features/production-line/components/WeightScaleLivePageClient.js", import.meta.url), "utf8");
  const handler = source.slice(source.indexOf("    function handleProductHotkey(event)"), source.indexOf('    window.addEventListener("keydown", handleProductHotkey)'));
  assert.match(handler, /productHotkeyFromEvent\(event\)/);
  assert.match(handler, /isProductSetupOpen \|\| isSettingsOpen/);
  assert.match(handler, /pendingReceipt \|\| saveLockRef.current \|\| printLockRef.current/);
  assert.match(handler, /item.departmentId === selectedDepartmentId/);
  assert.match(handler, /selectProductForSetup\(product.code, product.departmentId\)/);
  assert.doesNotMatch(handler, /saveWeightScaleLiveReceipt|setIsProductSetupOpen/);
});
