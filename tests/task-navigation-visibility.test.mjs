import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildNavItems, GROUP_PERMISSION_KEYS } from "../src/components/appNavigation.js";
import { PRODUCTION_TASK_PERMISSIONS } from "../src/lib/productionTaskPermissions.js";
import { DATA_TASK_PERMISSIONS } from "../src/lib/dataTaskPermissions.js";

const registry = { ...PRODUCTION_TASK_PERMISSIONS, ...DATA_TASK_PERMISSIONS };
const items = buildNavItems("/raw-material-requisitions/requisition").flatMap((item) => item.children || [item]);

test("new-only roles can reach their exact domain menu without receiving other page access", () => {
  for (const [key, href, group] of [
    ["data-products-view", "/admin/products", "data_admin"],
    ["data-trade-codes-view", "/admin/products/trade-codes", "data_admin"],
    ["data-suppliers-view", "/admin/suppliers", "data_admin"],
    ["hr-employees-view", "/admin/employees", "hr"],
    ["raw-materials-lot-view", "/raw-materials", "raw_materials"],
    ["production-fg-wip-view", "/production-line/fg-wip", "production_line"],
    ["production-packing-output-write", "/production-line/attendance/packing-output", "production_line"],
    ["production-scale-receipt-write", "/production-line/weight-scale", "production_line"],
    ["production-settings-material-owners-write", "/production-line/settings", "production_line"],
  ]) {
    assert.ok(registry[key], key + " is registered");
    assert.ok(items.find((item) => item.href === href).permissionsAny.includes(key), href);
    assert.ok(GROUP_PERMISSION_KEYS[group].includes(key), group);
  }
  assert.ok(!items.find((item) => item.href === "/admin/products").permissionsAny.includes("data-suppliers-view"));
  assert.ok(!items.find((item) => item.href === "/production-line/stock").permissionsAny.includes("production-stock-issue-write"));
});

test("stock detail pages stay available without duplicate sidebar entries", () => {
  for (const route of ["/production-line/stock/balance", "/production-line/stock/issues", "/production-line/stock/issues/cancel", "/production-line/stock/issues/report"]) {
    assert.ok(!items.some((item) => item.href === route), route);
    assert.ok(fs.existsSync(new URL("../src/app" + route + "/page.js", import.meta.url)), route + " remains available");
  }
});

test("converted frontend gates accept their own tasks and role table does not force horizontal scrolling", () => {
  for (const [file, keys] of [
    ["products/components/ProductsPageClient.js", ["data-products-view"]],
    ["products/components/TradeCodesView.js", ["data-trade-codes-view"]],
    ["suppliers/components/SuppliersPageClient.js", ["data-suppliers-view"]],
    ["employees/components/EmployeesPageClient.js", ["hr-employees-view"]],
    ["raw-materials/components/RawMaterialsPageClient.js", ["raw-materials-summary-view", "raw-materials-lot-view", "raw-materials-movement-view"]],
    ["production-line-settings/components/ProductionLineSettingsPageClient.js", ["TAB_TASK_KEYS[activeTab]", "visibleTabs.map", "TAB_RESOURCES", "taskPermissionsEnabled"]],
  ]) {
    const source = fs.readFileSync(new URL("../src/features/" + file, import.meta.url), "utf8");
    for (const key of keys) assert.ok(source.includes(key), file + ": " + key);
  }
  const css = fs.readFileSync(new URL("../src/components/settings/RolePermissionsForm.module.css", import.meta.url), "utf8");
  assert.ok(!css.includes("min-width: 650px"));
  assert.ok(css.includes("grid-template-columns: 1fr"));
});

test("each settings tab recognizes only its registered resources", () => {
  const source = fs.readFileSync(new URL("../src/features/production-line-settings/components/ProductionLineSettingsPageClient.js", import.meta.url), "utf8");
  const declarations = source.slice(source.indexOf("const TAB_RESOURCES"), source.indexOf("const DEFAULT_FORM"));
  const tabKeys = new Function("DATA_TASK_PERMISSIONS", declarations + "return TAB_TASK_KEYS;")(DATA_TASK_PERMISSIONS);
  assert.equal(Object.keys(tabKeys).length, 10);
  for (const [tab, key] of [
    ["type", "production-settings-categories-create"],
    ["department-products", "production-settings-department-products-edit"],
    ["work-centers", "production-settings-work-centers-view"],
    ["routing", "production-settings-routings-create"],
    ["machine", "production-settings-machine-edit"],
    ["shifts", "production-settings-shifts-edit"],
    ["pallet-barcodes", "production-settings-pallet-barcodes-create"],
    ["piece-rates", "production-settings-piece-rate-rate-edit"],
    ["wip-policies", "production-settings-wip-policies-create"],
    ["material-owners", "production-settings-material-owners-delete"],
  ]) assert.ok(tabKeys[tab].includes(key), tab + ": " + key);
  assert.deepEqual(tabKeys.machine, ["production-settings-machine-view", "production-settings-machine-edit"]);
  assert.ok(!tabKeys.routing.includes("production-settings-machine-edit"));
  for (const key of Object.values(tabKeys).flat()) assert.ok(DATA_TASK_PERMISSIONS[key], key);
});
