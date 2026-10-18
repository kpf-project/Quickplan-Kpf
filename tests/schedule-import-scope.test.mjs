import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isProductInImportScope, loadScheduleImportScopes, scheduleScopeKey } from "../src/lib/scheduleImportScope.js";

test("import scope excludes other categories and uncategorized products without global fallback", () => {
  assert.equal(isProductInImportScope({ subcategoryId: "cookie" }, ["cookie"]), true);
  assert.equal(isProductInImportScope({ subcategoryId: "jam" }, ["cookie"]), false);
  assert.equal(isProductInImportScope({}, ["cookie"]), false);
  assert.equal(isProductInImportScope({ subcategoryId: "cookie" }, []), false);
});

test("section scopes load independently and missing configuration stays empty", async () => {
  const db = { from(table) {
    assert.equal(table, "system_settings");
    return { select() { return this; }, in(key, values) {
      assert.equal(key, "setting_key");
      assert.deepEqual(values, [scheduleScopeKey("a"), scheduleScopeKey("b")]);
      return { data: [{ setting_key: scheduleScopeKey("a"), setting_value: { subcategoryIds: ["cookie"] } }], error: null };
    } };
  } };
  const scopes = await loadScheduleImportScopes(db, ["a", "b"]);
  assert.deepEqual(scopes.get("a"), ["cookie"]);
  assert.deepEqual(scopes.get("b"), []);
});

test("scope API rejects foreign categories, preserves per-section saves and enforces permission", async () => {
  const source = readFileSync(new URL("../src/app/api/production-planning/schedule/section-defs/[id]/import-scope/route.js", import.meta.url), "utf8")
    .replace(/^import .*;\r?\n/gm, "");
  let denied = false;
  const writes = [];
  const tables = {
    production_schedule_section_defs: [{ id: "section-a", template_id: "template" }],
    production_schedule_templates: [{ id: "template", dept_id: "dept-a" }],
    production_department_product_subcategories: [{ id: "cookie", department_id: "dept-a", name: "คุกกี้" }],
  };
  const db = { from(table) {
    let rows = [...(tables[table] ?? [])];
    const query = {
      select() { return query; }, order() { return query; },
      eq(key, value) { rows = rows.filter(row => row[key] === value); return query; },
      maybeSingle() { return Promise.resolve({ data: rows[0], error: null }); },
      upsert(value) { writes.push(value); return Promise.resolve({ error: null }); },
      then(resolve) { return Promise.resolve({ data: rows, error: null }).then(resolve); },
    };
    return query;
  } };
  const factory = new Function("getSupabaseAdmin", "jsonError", "readJson", "requirePermissionKeys", "loadScheduleSkuCatalog", "loadScheduleImportScopes", "scheduleScopeKey", source.replace(/export /g, "") + ";return {GET,PUT};");
  const api = factory(() => db, error => Response.json({ error: error.message }, { status: error.status ?? 500 }), request => request.json(), async () => {
    if (denied) throw Object.assign(new Error("Forbidden"), { status: 403 });
    return { userId: "actor" };
  }, async () => [], loadScheduleImportScopes, scheduleScopeKey);
  const request = ids => new Request("http://localhost/scope", { method: "PUT", body: JSON.stringify({ subcategoryIds: ids }) });
  const params = { params: Promise.resolve({ id: "section-a" }) };
  assert.equal((await api.PUT(request(["foreign"]), params)).status, 400);
  assert.equal(writes.length, 0);
  assert.equal((await api.PUT(request(["cookie", "cookie"]), params)).status, 200);
  assert.equal(writes[0].setting_key, "production_schedule.import_scope.section-a");
  assert.deepEqual(writes[0].setting_value, { subcategoryIds: ["cookie"] });
  assert.equal(writes[0].updated_by, "actor");
  denied = true;
  assert.equal((await api.PUT(request([]), params)).status, 403);
  assert.equal(writes.length, 1);
});
