import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");

test("department product subcategories stay scoped to their department mapping", () => {
  const migration = read("supabase/migrations/20260925121000_add_department_product_subcategories.sql");
  const route = read("src/app/api/production-department-products/route.js");
  const subcategoryRoute = read("src/app/api/production-department-product-subcategories/route.js");
  const screen = read("src/features/production-line-settings/components/DepartmentProductScopeTab.js");

  assert.match(migration, /create table if not exists public\.production_department_product_subcategories/i);
  assert.match(migration, /foreign key \(subcategory_id, department_id\)/);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /\.eq\("id", subcategoryId\)[\s\S]*\.eq\("department_id", departmentId\)/);
  assert.match(route, /\.eq\("department_id", departmentId\)[\s\S]*\.in\("sku_code", skuCodes\)/);
  assert.match(subcategoryRoute, /export async function POST/);
  assert.match(subcategoryRoute, /export async function PATCH/);
  assert.match(subcategoryRoute, /export async function DELETE/);
  assert.match(subcategoryRoute, /count: "exact", head: true/);
  assert.match(subcategoryRoute, /ยังมีสินค้าอยู่ในหมวดนี้/);
  assert.match(screen, /สร้างหมวดหมู่ย่อยใหม่ในแผนกนี้/);
  assert.match(screen, /จัดสินค้าเข้าหมวด/);
  assert.match(screen, /แก้ไขชื่อหมวด/);
  assert.match(screen, /ลบหมวด/);
});

test("department product picker returns one row per displayed SKU", () => {
  const route = read("src/app/api/products-cache/route.js");

  assert.match(
    route,
    /\.map\(\(row\) => \[String\(row\.sku_code \|\| row\.goods_code \|\| ""\)/
  );
});

test("department product subcategories have their own workspace tab", () => {
  const screen = read("src/features/production-line-settings/components/DepartmentProductScopeTab.js");
  const productsStart = screen.indexOf('{activeSubTab === "products"');
  const subcategoriesStart = screen.indexOf('{activeSubTab === "subcategories"');
  const usersStart = screen.indexOf('{activeSubTab === "users"');

  assert.match(screen, /setActiveSubTab\("subcategories"\)/);
  assert.ok(productsStart >= 0);
  assert.ok(subcategoriesStart > productsStart);
  assert.ok(usersStart > subcategoriesStart);
  assert.doesNotMatch(
    screen.slice(productsStart, subcategoriesStart),
    /สร้างหมวดหมู่ย่อยใหม่ในแผนกนี้/
  );
  assert.match(
    screen.slice(subcategoriesStart, usersStart),
    /สร้างหมวดหมู่ย่อยใหม่ในแผนกนี้/
  );
});

test("department products support multiple subcategories per product with primary category", () => {
  const migration = read("supabase/migrations/20261018000000_add_department_product_multiple_subcategories.sql");
  const script = read("scripts/apply-department-product-multiple-subcategories.sql");
  const route = read("src/app/api/production-department-products/route.js");
  const screen = read("src/features/production-line-settings/components/DepartmentProductScopeTab.js");

  assert.match(migration, /production_department_product_subcategory_links/);
  assert.match(migration, /primary key \(department_id, sku_code, subcategory_id\)/);
  assert.match(script, /production_department_product_subcategory_links/);
  assert.match(route, /production_department_product_subcategory_links/);
  assert.match(route, /subcategories: subcategories\.filter/);
  assert.match(route, /action === "remove"/);
  assert.match(route, /action === "set_primary"/);
  assert.match(screen, /viewingProductSubcategories/);
  assert.match(screen, /เพิ่มเข้าหมวดที่เลือก/);
  assert.match(screen, /นำออกจากหมวด/);
  assert.match(screen, /★ หมวดหลัก/);
});

