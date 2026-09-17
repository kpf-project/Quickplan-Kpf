const MAX_SORT_ORDER = 9999;

function normalizeText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || null;
}

function normalizeUpperCode(value) {
  const normalized = normalizeText(value);
  return normalized ? normalized.toUpperCase() : null;
}

function normalizeSortOrder(value) {
  const parsed = Number.parseInt(String(value ?? "0"), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  if (parsed > MAX_SORT_ORDER) return MAX_SORT_ORDER;
  return parsed;
}

function normalizeBoolean(value, fallback = true) {
  if (value === true || value === false) return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export function normalizeWorkCenterInput(input = {}) {
  const departmentId = normalizeText(input.departmentId ?? input.department_id);
  const deliveryPointId = normalizeText(input.deliveryPointId ?? input.delivery_point_id);
  const code = normalizeUpperCode(input.code);
  const name = normalizeText(input.name);
  const description = normalizeText(input.description);
  const sortOrder = normalizeSortOrder(input.sortOrder ?? input.sort_order);
  const isActive = normalizeBoolean(input.isActive ?? input.is_active, true);
  const consolidateRequisitionPreviewByDate = normalizeBoolean(
    input.consolidateRequisitionPreviewByDate ?? input.consolidate_requisition_preview_by_date,
    false
  );
  const errors = [];

  if (!departmentId) errors.push("departmentId is required");
  if (!code) errors.push("code is required");
  if (!name) errors.push("name is required");

  return {
    departmentId,
    deliveryPointId,
    code,
    name,
    description,
    sortOrder,
    isActive,
    consolidateRequisitionPreviewByDate,
    errors,
  };
}

export function normalizeWorkCenterQuery(query = {}) {
  return {
    search: normalizeText(query.search) || "",
    departmentId: normalizeText(query.departmentId ?? query.department_id) || "",
    includeInactive: query.includeInactive === true || query.includeInactive === "true",
  };
}

export function mapWorkCenterRow(row = {}) {
  const department = row.production_departments || {};
  const deliveryPoint = row.production_delivery_points || {};
  return {
    id: row.id,
    department_id: row.department_id,
    delivery_point_id: row.delivery_point_id || "",
    delivery_point_code: deliveryPoint.code || "",
    delivery_point_name: deliveryPoint.name || "",
    department_code: department.code || "",
    department_name: department.name || "",
    department_is_central: Boolean(department.is_central_department),
    code: row.code,
    name: row.name,
    description: row.description || "",
    sort_order: Number(row.sort_order ?? 0),
    is_active: Boolean(row.is_active),
    consolidate_requisition_preview_by_date: Boolean(row.consolidate_requisition_preview_by_date),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
