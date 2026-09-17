import { normalizeParam } from "@/lib/validation";

const ALLOWED_ITEM_TYPES = new Set(["FG", "WIP"]);

function normalizeText(value) {
  const normalized = normalizeParam(value);
  return normalized ?? null;
}

function normalizeUpper(value) {
  const normalized = normalizeText(value);
  return normalized ? normalized.toUpperCase() : null;
}

function normalizeItemType(value) {
  const normalized = normalizeUpper(value);
  if (!normalized) return null;
  return ALLOWED_ITEM_TYPES.has(normalized) ? normalized : null;
}

export function normalizeRoutingInput(input = {}) {
  const departmentId = normalizeText(input.departmentId ?? input.department_id);
  const skuCode = normalizeUpper(input.skuCode ?? input.sku_code);
  const skuName = normalizeText(input.skuName ?? input.sku_name);
  const itemType = normalizeItemType(input.itemType ?? input.item_type);
  const remark = normalizeText(input.remark);
  const isActive = input.is_active === false || input.isActive === false ? false : true;
  const workCenterIdsRaw = Array.isArray(input.workCenterIds ?? input.work_center_ids)
    ? (input.workCenterIds ?? input.work_center_ids)
    : [];
  const workCenterIds = workCenterIdsRaw
    .map((value) => normalizeText(value))
    .filter(Boolean);
  const dedupWorkCenterIds = Array.from(new Set(workCenterIds));
  const errors = [];

  if (!departmentId) errors.push("departmentId is required");
  if (!skuCode) errors.push("skuCode is required");
  if (!skuName) errors.push("skuName is required");
  if (!itemType) errors.push("itemType must be FG or WIP");
  if (!dedupWorkCenterIds.length) errors.push("workCenterIds is required");

  return {
    departmentId,
    skuCode,
    skuName,
    itemType,
    remark,
    isActive,
    workCenterIds: dedupWorkCenterIds,
    errors,
  };
}

export function normalizeRoutingQuery(query = {}) {
  return {
    search: normalizeText(query.search) || "",
    departmentId: normalizeText(query.departmentId ?? query.department_id) || "",
    itemType: normalizeItemType(query.itemType ?? query.item_type) || "",
    includeInactive: query.includeInactive === true || query.includeInactive === "true",
  };
}
