import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const departmentId = "00000000-0000-4000-8000-000000000001";
const source = readFileSync(new URL("../src/lib/scale/live-access.js", import.meta.url), "utf8");
function fixture(options = {}) {
  const calls = [];
  class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const department = { id: departmentId, code: "KP01", name: "Test", is_active: true, ...options.department };
  const values = {
    production_department_users: [{ department_id: departmentId, role: options.role || "editor", production_departments: options.missingDepartment ? null : department }],
    production_departments: [department, ...(options.shell ? [{ id: "shell-department", code: "KP13", is_active: true }] : [])],
    production_department_products: options.missingProduct ? [] : [{ department_id: departmentId, sku_code: "WK-0002", subcategory_id: "sub1" }],
    products_cache: [{ sku_code: "WK-0002", iccat_code: options.category || "03", uom_name: "KG" }],
    production_department_product_subcategories: options.invalidSubcategory ? [] : [{ id: "sub1", department_id: departmentId }, ...(options.shell ? [{ id: "shell-category", department_id: "shell-department", name: "เปลือก" }] : [])],
  };
  if (options.shell) values.production_department_products.push({ department_id: "shell-department", sku_code: "WK-0002", subcategory_id: "shell-category" });
  const db = { from(table) {
    calls.push(table);
    let rows = values[table];
    assert.ok(rows, "Must not read legacy tables: " + table);
    const query = {
      select() { return this; },
      eq(key, value) { if (key !== "user_id") rows = rows.filter(row => row[key] === value); return this; },
      in(key, values) { rows = rows.filter(row => values.includes(row[key])); return this; },
      is() { return this; }, order() { return this; },
      maybeSingle() { return Promise.resolve({ data: rows[0] || null, error: options.errorTable === table ? { message: "failure" } : null }); },
      then(resolve) { resolve({ data: rows, error: options.errorTable === table ? { message: "failure" } : null }); },
    };
    return query;
  } };
  const context = vm.createContext({ ApiError });
  vm.runInContext(source.replace(/^import .*;\r?\n/gm, "").replaceAll("export ", "") + "\nthis.check = assertWeightScaleLiveProductAccess;", context);
  return { check: input => context.check(db, { userId: "user1", departmentId, productCode: " wk-0002 ", manage: true, ...input }), calls };
}

test("editor uses existing department/product/subcategory masters only", async () => {
  const f = fixture();
  assert.equal((await f.check()).productCode, "WK-0002");
  assert.equal(f.calls.length, 5);
});
test("shell SKU cannot enter central workflow even when mapped to another department", async () => {
  await assert.rejects(fixture({ shell: true }).check(), { status: 403 });
  await assert.rejects(fixture({ errorTable: "production_departments" }).check(), { status: 500 });
});
test("viewer can inspect but cannot change products or hotkeys", async () => {
  await assert.rejects(fixture({ role: "viewer" }).check(), { status: 403 });
  assert.equal((await fixture({ role: "viewer" }).check({ manage: false })).access.canView, true);
});
test("other department, missing join and inactive/deleted department fail closed", async () => {
  for (const options of [{ missingDepartment: true }, { department: { is_active: false } }, { department: { deleted_at: "2026-10-11" } }]) {
    await assert.rejects(fixture(options).check(), { status: 403 });
  }
  await assert.rejects(fixture().check({ departmentId: "00000000-0000-4000-8000-000000000002" }), { status: 403 });
});
test("invalid product/category/subcategory and database errors reject", async () => {
  for (const options of [{ missingProduct: true }, { category: "01" }, { invalidSubcategory: true }]) {
    await assert.rejects(fixture(options).check(), { status: 403 });
  }
  await assert.rejects(fixture({ errorTable: "production_department_products" }).check(), { status: 500 });
  await assert.rejects(fixture().check({ departmentId: "bad" }), { status: 400 });
});

test("product picker removes excluded SKUs before querying product details", async () => {
  const productSource = readFileSync(new URL("../src/lib/scale/live-products.js", import.meta.url), "utf8");
  const tables = [];
  const db = { from(table) {
    tables.push(table);
    const data = table === "production_department_products"
      ? [{ department_id: departmentId, sku_code: "SHELL" }, { department_id: departmentId, sku_code: "WK-0002" }]
      : [{ sku_code: "WK-0002", sku_name: "Allowed", iccat_code: "03", uom_name: "KG" }];
    return { select() { return this; }, eq() { return this; }, in(key, values) {
      if (table === "products_cache") assert.deepEqual(Array.from(values), ["WK-0002"]);
      return this;
    }, then(resolve) { resolve({ data, error: null }); } };
  } };
  const context = vm.createContext({
    LIVE_SCALE_WIP_CATEGORY_CODE: "03",
    loadWeightScaleLiveDepartmentScope: async () => ({ departments: [{ id: departmentId, code: "KP01", name: "Test", role: "editor" }], isAdmin: false }),
    loadWeightScaleLiveExcludedProductCodes: async () => new Set(["SHELL"]),
  });
  vm.runInContext(productSource.replace(/^import[\s\S]*?;\r?\n/gm, "").replaceAll("export ", "") + "\nthis.load = loadWeightScaleLiveProductsData;", context);
  const result = await context.load(db, { userId: "user1" });
  assert.deepEqual(Array.from(result.products, row => row.code), ["WK-0002"]);
  assert.deepEqual(tables, ["production_department_products", "products_cache"]);
});

test("same SKU assigned to two departments remains selectable independently", async () => {
  const productSource = readFileSync("src/lib/scale/live-products.js", "utf8");
  const departments = [
    { id: departmentId, code: "KP01", name: "Biscuit", role: "editor" },
    { id: "00000000-0000-4000-8000-000000000002", code: "KP02", name: "Other", role: "editor" },
  ];
  const db = { from(table) {
    const data = table === "production_department_products"
      ? departments.map(row => ({ department_id: row.id, sku_code: "SAME" }))
      : [{ sku_code: "SAME", sku_name: "Shared product", uom_name: "KG", iccat_code: "03" }];
    return { select() { return this; }, in() { return this; }, eq() { return this; }, then(resolve) { resolve({ data }); } };
  } };
  const context = vm.createContext({ LIVE_SCALE_WIP_CATEGORY_CODE: "03",
    loadWeightScaleLiveDepartmentScope: async () => ({ departments, isAdmin: false }),
    loadWeightScaleLiveExcludedProductCodes: async () => new Set() });
  vm.runInContext(productSource.replace(/^import[\s\S]*?;\r?\n/gm, "").replaceAll("export ", "") + "\nthis.load = loadWeightScaleLiveProductsData;", context);
  const result = await context.load(db, { userId: "user" });
  assert.equal(result.products.length, 2);
  assert.deepEqual(Array.from(result.products, row => row.departmentId).sort(), departments.map(row => row.id).sort());
  const picker = readFileSync("src/components/ProductPicker.js", "utf8");
  assert.match(picker, /onSelectProduct\(product.code, product.departmentId\)/);
});
test("initial product loader imports its default server database factory", () => {
  const source = readFileSync(new URL("../src/lib/scale/live-products.js", import.meta.url), "utf8");
  assert.match(source, /import \{ getSupabaseAdmin \} from "@\/lib\/adminApi";/);
});
