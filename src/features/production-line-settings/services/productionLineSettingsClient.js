import { fetchJson } from "@/lib/clientFetch";

export async function fetchProductionCategories(params = {}) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/production-categories?${query.toString()}`);
}

export async function createProductionCategory(payload) {
  return fetchJson("/api/production-categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateProductionCategory(id, payload) {
  return fetchJson(`/api/production-categories/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteProductionCategory(id) {
  return fetchJson(`/api/production-categories/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

export async function fetchCategoryProducts(categoryId) {
  const query = new URLSearchParams({ categoryId });
  return fetchJson(`/api/production-category-products?${query.toString()}`);
}

export async function assignCategoryProducts(categoryId, skuCodes) {
  return fetchJson("/api/production-category-products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoryId, skuCodes }),
  });
}

export async function unassignCategoryProducts(categoryId, skuCodes) {
  return fetchJson("/api/production-category-products", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ categoryId, skuCodes }),
  });
}

export async function fetchProductsCache(params = {}) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/products-cache?${query.toString()}`);
}

export async function fetchPalletBarcodeSettings(params = {}) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/pallet-barcodes?${query.toString()}`);
}

export async function mutatePalletBarcodeSettings(payload) {
  return fetchJson("/api/pallet-barcodes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function bulkUpsertPalletTradeCodeBarcodes(rows) {
  return mutatePalletBarcodeSettings({
    action: "bulk_upsert_trade_code_barcodes",
    rows,
  });
}

export async function fetchProductionDepartments(params = {}) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/production-departments?${query.toString()}`);
}

export async function createProductionDepartment(payload) {
  return fetchJson("/api/production-departments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateProductionDepartment(id, payload) {
  return fetchJson(`/api/production-departments/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteProductionDepartment(id) {
  return fetchJson(`/api/production-departments/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

export async function fetchDepartmentProducts(departmentId) {
  const query = new URLSearchParams({ departmentId });
  return fetchJson(`/api/production-department-products?${query.toString()}`);
}

export async function assignDepartmentProducts(departmentId, skuCodes, ownerSkuCodes = []) {
  return fetchJson("/api/production-department-products", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ departmentId, skuCodes, ownerSkuCodes }),
  });
}

export async function unassignDepartmentProducts(departmentId, skuCodes) {
  return fetchJson("/api/production-department-products", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ departmentId, skuCodes }),
  });
}

export async function updateDepartmentProductSubcategory(
  departmentId,
  skuCodes,
  subcategoryId,
  action = "add"
) {
  return fetchJson("/api/production-department-products", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ departmentId, skuCodes, subcategoryId, action }),
  });
}

export async function fetchDepartmentProductSubcategories(departmentId) {
  const query = new URLSearchParams({ departmentId });
  return fetchJson(`/api/production-department-product-subcategories?${query.toString()}`);
}

export async function createDepartmentProductSubcategory(departmentId, name) {
  return fetchJson("/api/production-department-product-subcategories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ departmentId, name }),
  });
}

export async function renameDepartmentProductSubcategory(departmentId, subcategoryId, name) {
  return fetchJson("/api/production-department-product-subcategories", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ departmentId, subcategoryId, name }),
  });
}

export async function deleteDepartmentProductSubcategory(departmentId, subcategoryId) {
  return fetchJson("/api/production-department-product-subcategories", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ departmentId, subcategoryId }),
  });
}

export async function fetchProductionUsers(params = {}) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/production-users?${query.toString()}`);
}

export async function fetchDepartmentUsers(departmentId) {
  const query = new URLSearchParams({ departmentId });
  return fetchJson(`/api/production-department-users?${query.toString()}`);
}

export async function assignDepartmentUsers(departmentId, userEntries) {
  return fetchJson("/api/production-department-users", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ departmentId, userEntries }),
  });
}

export async function unassignDepartmentUsers(departmentId, userIds) {
  return fetchJson("/api/production-department-users", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ departmentId, userIds }),
  });
}

export async function fetchProductionWorkCenters(params = {}) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/production-work-centers?${query.toString()}`);
}

export async function createProductionWorkCenter(payload) {
  return fetchJson("/api/production-work-centers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateProductionWorkCenter(id, payload) {
  return fetchJson(`/api/production-work-centers/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function fetchProductionWorkCenterImpact(id) {
  return fetchJson(`/api/production-work-centers/${id}`);
}

export async function deleteProductionWorkCenter(id) {
  return fetchJson(`/api/production-work-centers/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

export async function fetchProductionDeliveryPoints(params = {}) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/production-delivery-points?${query.toString()}`);
}

export async function createProductionDeliveryPoint(payload) {
  return fetchJson("/api/production-delivery-points", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateProductionDeliveryPoint(id, payload) {
  return fetchJson(`/api/production-delivery-points/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteProductionDeliveryPoint(id) {
  return fetchJson(`/api/production-delivery-points/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

export async function fetchProductionRoutingItems(params = {}) {
  const query = new URLSearchParams({
    bomFilter: "all",
    iccatCodes: "03,04,04-1,04-2",
    pageSize: "2000",
    ...params,
  });
  return fetchJson(`/api/production-bom-products?${query.toString()}`);
}

export async function fetchProductionBomItems(skuCode) {
  return fetchJson(`/api/production-boms/${encodeURIComponent(skuCode)}`);
}

export async function fetchProductionRoutingExplosion(fgSkuCode) {
  const query = new URLSearchParams({ fgSkuCode });
  return fetchJson(`/api/production-routing-components/explode?${query.toString()}`);
}

export async function fetchProductionRoutings(params = {}) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/production-routings?${query.toString()}`);
}

export async function saveProductionRouting(payload) {
  return fetchJson("/api/production-routings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteProductionRouting(payload) {
  return fetchJson("/api/production-routings", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function fetchProductionRoutingComponents(params = {}) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/production-routing-components?${query.toString()}`);
}

export async function saveProductionRoutingComponents(payload) {
  return fetchJson("/api/production-routing-components", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function fetchProductionSnackWageSettings(params = {}) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/production-snack-wage-settings?${query.toString()}`);
}

export async function updateProductionSnackWageSettings(payload) {
  return fetchJson("/api/production-snack-wage-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function fetchProductionPieceRateSettings(params = {}) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/production-piece-rate-settings?${query.toString()}`);
}

export async function updateProductionPieceRateSettings(payload) {
  return fetchJson("/api/production-piece-rate-settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function fetchProductionWipPolicies(params = {}) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/production-wip-policies?${query.toString()}`);
}

export async function updateProductionWipPolicies(payload) {
  return fetchJson("/api/production-wip-policies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function fetchMaterialOwners(params = {}) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/production-line-settings/material-owners?${query.toString()}`);
}

export async function assignMaterialOwner(materialSkuCode, departmentId) {
  return fetchJson("/api/production-line-settings/material-owners", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ materialSkuCode, departmentId }),
  });
}

export async function removeMaterialOwner(materialSkuCode) {
  return fetchJson(
    `/api/production-line-settings/material-owners?materialSkuCode=${encodeURIComponent(materialSkuCode)}`,
    { method: "DELETE" }
  );
}

export async function fetchProductionShifts(params = {}) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/production-shifts?${query.toString()}`);
}

export async function createProductionShift(payload) {
  return fetchJson("/api/production-shifts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateProductionShift(id, payload) {
  return fetchJson(`/api/production-shifts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteProductionShift(id) {
  return fetchJson(`/api/production-shifts/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

export async function fetchProductionSectionShifts(params = {}) {
  const query = new URLSearchParams(params);
  return fetchJson(`/api/production-section-shifts?${query.toString()}`);
}

export async function createProductionSectionShift(payload) {
  return fetchJson("/api/production-section-shifts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function updateProductionSectionShift(id, payload) {
  return fetchJson(`/api/production-section-shifts/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function deleteProductionSectionShift(id) {
  return fetchJson(`/api/production-section-shifts/${id}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
}

export async function fetchRoutingCompleteness(departmentId) {
  const query = new URLSearchParams({ departmentId });
  return fetchJson(`/api/production-routing-components/completeness?${query.toString()}`);
}
