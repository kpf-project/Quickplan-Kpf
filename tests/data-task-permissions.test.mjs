import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { DATA_TASK_PERMISSIONS, redactDataTaskCosts } from "../src/lib/dataTaskPermissions.js";

const oldPolicies = {
  "data-products-view": [
    "admin-products"
  ],
  "data-products-cost-view": [
    "admin-products"
  ],
  "data-trade-codes-view": [
    "admin-products"
  ],
  "data-brand-types-view": [
    "admin-products"
  ],
  "data-product-categories-view": [
    "admin-products",
    "raw-materials-summary",
    "raw-materials-lot",
    "raw-materials-movement"
  ],
  "data-suppliers-view": [
    "admin-suppliers",
    "raw-materials-summary"
  ],
  "data-sku-min-max-view": [
    "admin-sku-min-max",
    "raw-materials-summary"
  ],
  "hr-consolidated-view": [
    "admin-consolidated"
  ],
  "hr-departments-view": [
    "admin-consolidated",
    "admin-employees"
  ],
  "hr-employees-view": [
    "admin-employees"
  ],
  "raw-materials-lot-view": [
    "raw-materials-lot"
  ],
  "raw-materials-summary-view": [
    "raw-materials-summary"
  ],
  "raw-materials-movement-view": [
    "raw-materials-movement"
  ],
  "raw-materials-cost-view": [
    "raw-materials-lot"
  ],
  "raw-materials-receipts-view": [
    "raw-materials-lot"
  ],
  "raw-materials-production-receipts-view": [
    "raw-materials-lot"
  ],
  "raw-materials-returns-view": [
    "raw-material-returns"
  ],
  "raw-materials-requisitions-view": [
    "admin-requisition"
  ],
  "production-settings-material-owners-view": [
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-settings-material-owners-write": [
    "production-line-settings-manage"
  ],
  "production-settings-material-owners-delete": [
    "production-line-settings-manage"
  ],
  "production-settings-piece-rate-view": [
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-settings-piece-rate-rate-edit": [
    "production-line-settings-manage"
  ],
  "production-settings-snack-wage-view": [
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-settings-snack-wage-rate-edit": [
    "production-line-settings-manage"
  ],
  "production-settings-bom-view": [
    "production-line-bom-view",
    "production-line-bom-manage",
    "production-line-bom-approve"
  ],
  "production-settings-routings-view": [
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-settings-routings-create": [
    "production-line-settings-manage"
  ],
  "production-settings-routings-delete": [
    "production-line-settings-manage"
  ],
  "production-settings-department-products-view": [
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-settings-department-products-create": [
    "production-line-settings-manage"
  ],
  "production-settings-department-products-edit": [
    "production-line-settings-manage"
  ],
  "production-settings-department-products-delete": [
    "production-line-settings-manage"
  ],
  "production-settings-department-product-subcategories-view": [
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-settings-department-product-subcategories-create": [
    "production-line-settings-manage"
  ],
  "production-settings-department-product-subcategories-edit": [
    "production-line-settings-manage"
  ],
  "production-settings-department-product-subcategories-delete": [
    "production-line-settings-manage"
  ],
  "production-settings-routing-components-view": [
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-settings-routing-components-create": [
    "production-line-settings-manage"
  ],
  "production-settings-category-products-view": [
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-settings-category-products-create": [
    "production-line-settings-manage"
  ],
  "production-settings-category-products-delete": [
    "production-line-settings-manage"
  ],
  "production-settings-routing-components-explode-view": [
    "production-line-settings-view",
    "production-line-settings-manage",
    "production-line-bom-view",
    "production-line-bom-manage"
  ],
  "production-settings-delivery-points-edit": [
    "production-line-settings-manage"
  ],
  "production-settings-delivery-points-delete": [
    "production-line-settings-manage"
  ],
  "production-settings-delivery-points-view": [
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-settings-delivery-points-create": [
    "production-line-settings-manage"
  ],
  "production-settings-routing-components-completeness-view": [
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-settings-categories-edit": [
    "production-line-settings-manage"
  ],
  "production-settings-categories-delete": [
    "production-line-settings-manage"
  ],
  "production-settings-categories-view": [
    "production-line-settings-view",
    "production-line-settings-manage",
    "production-line-bom-view",
    "production-line-bom-manage"
  ],
  "production-settings-categories-create": [
    "production-line-settings-manage"
  ],
  "production-settings-work-centers-view": [
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-settings-work-centers-edit": [
    "production-line-settings-manage"
  ],
  "production-settings-work-centers-delete": [
    "production-line-settings-manage"
  ],
  "production-settings-work-centers-create": [
    "production-line-settings-manage"
  ],
  "production-settings-wip-policies-view": [
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-settings-wip-policies-create": [
    "production-line-settings-manage"
  ],
  "production-settings-users-view": [
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-settings-products-cache-view": [
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-settings-departments-edit": [
    "production-line-settings-manage"
  ],
  "production-settings-departments-delete": [
    "production-line-settings-manage"
  ],
  "production-settings-departments-view": [
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-settings-departments-create": [
    "production-line-settings-manage"
  ],
  "production-settings-department-users-view": [
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-settings-department-users-create": [
    "production-line-settings-manage"
  ],
  "production-settings-department-users-delete": [
    "production-line-settings-manage"
  ],
  "production-settings-shifts-edit": [
    "production-line-settings-manage"
  ],
  "production-settings-shifts-delete": [
    "production-line-settings-manage"
  ],
  "production-settings-shifts-view": [
    "production-line-settings-view",
    "production-line-settings-manage",
    "production-line-planning-view",
    "production-line-planning-manage",
    "plan.calculate_own_dept",
    "plan.edit_own_dept"
  ],
  "production-settings-shifts-create": [
    "production-line-settings-manage"
  ],
  "production-settings-section-shifts-edit": [
    "production-line-settings-manage"
  ],
  "production-settings-section-shifts-delete": [
    "production-line-settings-manage"
  ],
  "production-settings-section-shifts-view": [
    "production-line-settings-view",
    "production-line-settings-manage",
    "production-line-planning-view",
    "production-line-planning-manage",
    "plan.calculate_own_dept",
    "plan.edit_own_dept"
  ],
  "production-settings-section-shifts-create": [
    "production-line-settings-manage"
  ],
  "raw-materials-returns-cost-view": [
    "raw-material-returns"
  ],
  "raw-materials-requisitions-cost-view": [
    "admin-requisition"
  ],
  "hr-employee-photos-view": [
    "admin-employees",
    "production-line-attendance-view",
    "production-line-attendance-manage"
  ],
  "hr-employee-photos-upload": [
    "admin-employees"
  ],
  "hr-employee-photos-delete": [
    "admin-employees"
  ],
  "production-settings-pallet-barcodes-view": [
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-settings-pallet-barcodes-create": [
    "production-line-settings-manage"
  ],
  "production-settings-pallet-barcodes-edit": [
    "production-line-settings-manage"
  ],
  "production-settings-pallet-barcodes-delete": [
    "production-line-settings-manage"
  ],
  "production-settings-machine-view": [
    "production-line-settings-view",
    "production-line-settings-manage"
  ],
  "production-settings-machine-edit": [
    "production-line-settings-manage"
  ],
  "raw-materials-deduction-view": [
    "raw-materials-summary"
  ],
  "raw-materials-deduction-cost-view": [
    "raw-materials-summary"
  ]
};

test("data task bindings preserve exact legacy acceptance without unrelated grants", () => {
  assert.deepEqual(Object.keys(DATA_TASK_PERMISSIONS).sort(), Object.keys(oldPolicies).sort());
  for (const [key, oldKeys] of Object.entries(oldPolicies)) {
    assert.deepEqual(DATA_TASK_PERMISSIONS[key].legacyKeys, oldKeys, key);
  }
});

test("mixed listings redact cost amounts recursively only for strict readers without cost grants", () => {
  const payload = {
    data: [{ SKU_CODE: "A", QTY_BASE: 5, TRD_U_PRC: 5, TRD_B_SELL: 25, SKU_STD_COST: 20, SKU_LAST_UCCOST: 10,
      GOODS_PRICE: 30, ARPLU_U_PRC: 4, APPLU_U_PRC2: 6, UNIT_COST: 4, INVENTORY_VALUE: 20,
      NET_PURCHASE_AMOUNT: 20, SELL_AMOUNT: 30, NET_AMOUNT_EXCL_VAT: 20,
      NET_AMOUNT_INCL_VAT: 21.4, VAT_AMOUNT: 1.4, UNIT_PRICE_EXCL_VAT: 4 }],
    summary: { totalBaseQty: 5, totalInventoryValue: 20, totalAmountExclVat: 20, totalAmountInclVat: 21.4 },
    pagination: { page: 1 },
  };
  const reader = { isAdmin: false, permissions: ["raw-materials-lot-view"] };
  const redacted = redactDataTaskCosts(payload, reader, "raw-materials-cost-view", true);
  assert.deepEqual(redacted.data, [{ SKU_CODE: "A", QTY_BASE: 5 }]);
  assert.deepEqual(redacted.summary, { totalBaseQty: 5 });
  assert.deepEqual(redacted.pagination, { page: 1 });
  assert.equal(payload.data[0].UNIT_COST, 4);
  assert.equal(redactDataTaskCosts(payload, reader, "raw-materials-cost-view", false), payload);
  assert.equal(redactDataTaskCosts(payload, { isAdmin: true, permissions: [] }, "raw-materials-cost-view", true), payload);
  assert.equal(redactDataTaskCosts(payload, { isAdmin: false, permissions: ["raw-materials-cost-view"] }, "raw-materials-cost-view", true), payload);
});

function loadGuardedFunction(path, name, permissions, enabled) {
  const source = readFileSync(new URL("../" + path, import.meta.url), "utf8")
    .replace(/^import [\s\S]*?;\r?\n/gm, "")
    .replace(/export /g, "");
  return runInNewContext(source + "\n" + name, {
    URL, URLSearchParams, Set, Map, console,
    process: { env: { ROLE_TASK_PERMISSIONS_ENABLED: String(enabled) } },
    unstable_cache: (fn) => fn,
    jsonError: (error) => { throw error; },
    readJson: async (request) => request.body,
    redactDataTaskCosts,
    requireTaskPermission: async (_request, key) => {
      const keys = enabled ? [key] : DATA_TASK_PERMISSIONS[key].legacyKeys;
      if (!keys.some((entry) => permissions.includes(entry))) throw new Error("Forbidden: " + key);
      throw new Error("Guard passed: " + key);
    },
  });
}

test("direct service requests enforce independent view and cost grants and preserve old bindings", async () => {
  const cases = [
    ["src/features/products/services/productsService.js", "listProducts", "data-products-view"],
    ["src/features/products/services/tradeCodesService.js", "listTradeCodes", "data-trade-codes-view"],
    ["src/features/products/services/brandTypesService.js", "listBrandTypes", "data-brand-types-view"],
    ["src/features/products/services/iccatTypesService.js", "listIccatTypes", "data-product-categories-view"],
    ["src/features/suppliers/services/suppliersService.js", "listSuppliers", "data-suppliers-view"],
    ["src/features/sku-min-max/services/skuMinMaxService.js", "listSkuMinMax", "data-sku-min-max-view"],
    ["src/features/sku-min-max/services/skuMinMaxService.js", "listSkuMinMaxBySku", "data-sku-min-max-view"],
    ["src/features/hr/services/consolidatedService.js", "listConsolidated", "hr-consolidated-view"],
    ["src/features/hr/services/hrDepartmentsService.js", "listHrDepartments", "hr-departments-view"],
    ["src/features/employees/services/employeesService.js", "listEmployees", "hr-employees-view"],
    ["src/features/raw-materials/services/rawMaterialsService.js", "listRawMaterialLotCosts", "raw-materials-cost-view"],
    ["src/features/raw-materials/services/rawMaterialsService.js", "listRawMaterials", "raw-materials-lot-view"],
    ["src/features/raw-materials/services/rawMaterialsService.js", "listRawMaterialsSummary", "raw-materials-summary-view"],
    ["src/features/raw-materials/services/rawMaterialsService.js", "listRawMaterialsMovement", "raw-materials-movement-view"],
    ["src/features/raw-materials/services/rawMaterialsService.js", "listRawMaterialReceipts", "raw-materials-receipts-view"],
    ["src/features/raw-materials/services/rawMaterialsService.js", "listProductionReceipts", "raw-materials-production-receipts-view"],
    ["src/features/raw-materials/services/rawMaterialsService.js", "listRawMaterialReturns", "raw-materials-returns-view"],
    ["src/features/raw-materials/services/rawMaterialsService.js", "listRawMaterialRequisitions", "raw-materials-requisitions-view"],
    ["src/app/api/production-piece-rate-settings/route.js", "listPieceRateSettings", "production-settings-piece-rate-view"],
    ["src/app/api/production-snack-wage-settings/route.js", "listSnackWageSettings", "production-settings-snack-wage-view"],
    ["src/app/api/production-piece-rate-settings/route.js", "savePieceRateSettings", "production-settings-piece-rate-rate-edit"],
    ["src/app/api/production-snack-wage-settings/route.js", "saveSnackWageSettings", "production-settings-snack-wage-rate-edit"],
  ];
  for (const [path, name, key] of cases) {
    const oldKeys = oldPolicies[key];
    for (const legacy of oldKeys) {
      await assert.rejects(loadGuardedFunction(path, name, [legacy], false)({}), new RegExp("Guard passed: " + key));
      await assert.rejects(loadGuardedFunction(path, name, [legacy], true)({}), new RegExp("Forbidden: " + key));
    }
    await assert.rejects(loadGuardedFunction(path, name, [key], true)({}), new RegExp("Guard passed: " + key));
    await assert.rejects(loadGuardedFunction(path, name, ["unrelated"], false)({}), new RegExp("Forbidden: " + key));
  }
});

test("settings APIs and employee photo writes retain each route's old policy and enforce separate actions", async () => {
  const bindings = [
  [
    "src/app/api/production-routings/route.js",
    "GET",
    "production-settings-routings-view"
  ],
  [
    "src/app/api/production-routings/route.js",
    "POST",
    "production-settings-routings-create"
  ],
  [
    "src/app/api/production-routings/route.js",
    "DELETE",
    "production-settings-routings-delete"
  ],
  [
    "src/app/api/production-department-products/route.js",
    "GET",
    "production-settings-department-products-view"
  ],
  [
    "src/app/api/production-department-products/route.js",
    "POST",
    "production-settings-department-products-create"
  ],
  [
    "src/app/api/production-department-products/route.js",
    "PATCH",
    "production-settings-department-products-edit"
  ],
  [
    "src/app/api/production-department-products/route.js",
    "DELETE",
    "production-settings-department-products-delete"
  ],
  [
    "src/app/api/production-department-product-subcategories/route.js",
    "GET",
    "production-settings-department-product-subcategories-view"
  ],
  [
    "src/app/api/production-department-product-subcategories/route.js",
    "POST",
    "production-settings-department-product-subcategories-create"
  ],
  [
    "src/app/api/production-department-product-subcategories/route.js",
    "PATCH",
    "production-settings-department-product-subcategories-edit"
  ],
  [
    "src/app/api/production-department-product-subcategories/route.js",
    "DELETE",
    "production-settings-department-product-subcategories-delete"
  ],
  [
    "src/app/api/production-routing-components/route.js",
    "GET",
    "production-settings-routing-components-view"
  ],
  [
    "src/app/api/production-routing-components/route.js",
    "POST",
    "production-settings-routing-components-create"
  ],
  [
    "src/app/api/production-category-products/route.js",
    "GET",
    "production-settings-category-products-view"
  ],
  [
    "src/app/api/production-category-products/route.js",
    "POST",
    "production-settings-category-products-create"
  ],
  [
    "src/app/api/production-category-products/route.js",
    "DELETE",
    "production-settings-category-products-delete"
  ],
  [
    "src/app/api/production-routing-components/explode/route.js",
    "GET",
    "production-settings-routing-components-explode-view"
  ],
  [
    "src/app/api/production-delivery-points/[id]/route.js",
    "PUT",
    "production-settings-delivery-points-edit"
  ],
  [
    "src/app/api/production-delivery-points/[id]/route.js",
    "DELETE",
    "production-settings-delivery-points-delete"
  ],
  [
    "src/app/api/production-delivery-points/route.js",
    "GET",
    "production-settings-delivery-points-view"
  ],
  [
    "src/app/api/production-delivery-points/route.js",
    "POST",
    "production-settings-delivery-points-create"
  ],
  [
    "src/app/api/production-routing-components/completeness/route.js",
    "GET",
    "production-settings-routing-components-completeness-view"
  ],
  [
    "src/app/api/production-categories/[id]/route.js",
    "PUT",
    "production-settings-categories-edit"
  ],
  [
    "src/app/api/production-categories/[id]/route.js",
    "DELETE",
    "production-settings-categories-delete"
  ],
  [
    "src/app/api/production-categories/route.js",
    "GET",
    "production-settings-categories-view"
  ],
  [
    "src/app/api/production-categories/route.js",
    "POST",
    "production-settings-categories-create"
  ],
  [
    "src/app/api/production-work-centers/[id]/route.js",
    "GET",
    "production-settings-work-centers-view"
  ],
  [
    "src/app/api/production-work-centers/[id]/route.js",
    "PUT",
    "production-settings-work-centers-edit"
  ],
  [
    "src/app/api/production-work-centers/[id]/route.js",
    "DELETE",
    "production-settings-work-centers-delete"
  ],
  [
    "src/app/api/production-work-centers/route.js",
    "GET",
    "production-settings-work-centers-view"
  ],
  [
    "src/app/api/production-work-centers/route.js",
    "POST",
    "production-settings-work-centers-create"
  ],
  [
    "src/app/api/production-wip-policies/route.js",
    "GET",
    "production-settings-wip-policies-view"
  ],
  [
    "src/app/api/production-wip-policies/route.js",
    "POST",
    "production-settings-wip-policies-create"
  ],
  [
    "src/app/api/production-users/route.js",
    "GET",
    "production-settings-users-view"
  ],
  [
    "src/app/api/products-cache/route.js",
    "GET",
    "production-settings-products-cache-view"
  ],
  [
    "src/app/api/production-departments/[id]/route.js",
    "PUT",
    "production-settings-departments-edit"
  ],
  [
    "src/app/api/production-departments/[id]/route.js",
    "DELETE",
    "production-settings-departments-delete"
  ],
  [
    "src/app/api/production-departments/route.js",
    "GET",
    "production-settings-departments-view"
  ],
  [
    "src/app/api/production-departments/route.js",
    "POST",
    "production-settings-departments-create"
  ],
  [
    "src/app/api/production-department-users/route.js",
    "GET",
    "production-settings-department-users-view"
  ],
  [
    "src/app/api/production-department-users/route.js",
    "POST",
    "production-settings-department-users-create"
  ],
  [
    "src/app/api/production-department-users/route.js",
    "DELETE",
    "production-settings-department-users-delete"
  ],
  [
    "src/app/api/production-shifts/[id]/route.js",
    "PUT",
    "production-settings-shifts-edit"
  ],
  [
    "src/app/api/production-shifts/[id]/route.js",
    "DELETE",
    "production-settings-shifts-delete"
  ],
  [
    "src/app/api/production-shifts/route.js",
    "GET",
    "production-settings-shifts-view"
  ],
  [
    "src/app/api/production-shifts/route.js",
    "POST",
    "production-settings-shifts-create"
  ],
  [
    "src/app/api/production-section-shifts/[id]/route.js",
    "PUT",
    "production-settings-section-shifts-edit"
  ],
  [
    "src/app/api/production-section-shifts/[id]/route.js",
    "DELETE",
    "production-settings-section-shifts-delete"
  ],
  [
    "src/app/api/production-section-shifts/route.js",
    "GET",
    "production-settings-section-shifts-view"
  ],
  [
    "src/app/api/production-section-shifts/route.js",
    "POST",
    "production-settings-section-shifts-create"
  ]
];
  bindings.push(
    ["src/app/api/employees/photos/[employeeCode]/route.js", "GET", "hr-employee-photos-view"],
    ["src/app/api/employees/photos/[employeeCode]/route.js", "PUT", "hr-employee-photos-upload"],
    ["src/app/api/employees/photos/[employeeCode]/route.js", "DELETE", "hr-employee-photos-delete"],
    ["src/app/api/pallet-barcodes/route.js", "listPalletBarcodeSettings", "production-settings-pallet-barcodes-view"],
  );
  for (const [path, method, key] of bindings) {
    const oldKeys = oldPolicies[key];
    for (const legacy of oldKeys) {
      await assert.rejects(loadGuardedFunction(path, method, [legacy], false)({}, {}), new RegExp("Guard passed: " + key));
      await assert.rejects(loadGuardedFunction(path, method, [legacy], true)({}, {}), new RegExp("Forbidden: " + key));
    }
    await assert.rejects(loadGuardedFunction(path, method, [key], true)({}, {}), new RegExp("Guard passed: " + key));
    const otherKeys = Object.keys(DATA_TASK_PERMISSIONS).filter((entry) => entry !== key);
    await assert.rejects(loadGuardedFunction(path, method, otherKeys, true)({}, {}), new RegExp("Forbidden: " + key));
  }
  for (const [action, operation] of [
    ["create_qty_barcode", "create"], ["generate_wip03_rcn13_barcodes", "create"],
    ["set_sku_mapping", "edit"], ["set_product_image", "edit"],
    ["clear_category_mapping", "delete"], ["clear_product_barcode", "delete"],
  ]) {
    const key = "production-settings-pallet-barcodes-" + operation;
    const path = "src/app/api/pallet-barcodes/route.js";
    await assert.rejects(loadGuardedFunction(path, "mutatePalletBarcodeSettings", [key], true)({ body: { action } }), new RegExp("Guard passed: " + key));
    await assert.rejects(loadGuardedFunction(path, "mutatePalletBarcodeSettings", ["production-settings-pallet-barcodes-view"], true)({ body: { action } }), new RegExp("Forbidden: " + key));
  }
});
