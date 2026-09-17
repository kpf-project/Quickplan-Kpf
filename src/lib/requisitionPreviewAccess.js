import "server-only";

import { ApiError } from "@/lib/adminApi";
import { hasPlanningManageAccess, loadClaimScope } from "@/lib/claimPermissions";

function normalizeId(value) {
  return String(value || "").trim();
}

function normalizeDatePart(value) {
  const raw = String(value || "").trim().slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : "-";
}

function normalizePermissionKeys(permission) {
  return Array.isArray(permission?.permissions)
    ? permission.permissions.map((key) => String(key || "").trim()).filter(Boolean)
    : [];
}

export function buildLegacyRequisitionDraftScopeKey(masterPlanNo, dateFrom, dateTo) {
  return [
    String(masterPlanNo || "").trim().toUpperCase(),
    normalizeDatePart(dateFrom),
    normalizeDatePart(dateTo),
  ].join("|");
}

export function buildRequisitionDraftScopeKey(masterPlanNo, dateFrom, dateTo, scope) {
  const base = buildLegacyRequisitionDraftScopeKey(masterPlanNo, dateFrom, dateTo);
  if (scope?.canManageGlobal) return `${base}|GLOBAL`;
  const departmentIds = Array.from(
    new Set((Array.isArray(scope?.departmentIds) ? scope.departmentIds : []).map(normalizeId).filter(Boolean))
  ).sort((left, right) => left.localeCompare(right));
  return `${base}|DEPTS:${departmentIds.join(",") || "NONE"}`;
}

export async function loadRequisitionAccessScope({
  supabaseAdmin,
  request,
  permission,
  action = "view",
}) {
  const permissionKeys = normalizePermissionKeys(permission);
  const canManageGlobal = await hasPlanningManageAccess(
    request,
    permission.userId,
    permission.isAdmin
  );
  if (
    permission?.isAdmin
    || canManageGlobal
    || (action === "view" && permissionKeys.includes("plan.view_all"))
  ) {
    return { canManageGlobal: true, departmentIds: [] };
  }

  return loadClaimScope({
    supabaseAdmin,
    request,
    permission,
    action: action === "edit" ? "claim" : "view",
  });
}

export function canAccessRequisitionDepartment(scope, departmentId) {
  if (scope?.canManageGlobal) return true;
  const normalizedDepartmentId = normalizeId(departmentId);
  if (!normalizedDepartmentId) return false;
  return new Set((scope?.departmentIds || []).map(normalizeId)).has(normalizedDepartmentId);
}

export function assertRequisitionDepartmentAccess(scope, departmentIds, message = "ไม่มีสิทธิ์เข้าถึงแผนกนี้") {
  const ids = Array.from(
    new Set((Array.isArray(departmentIds) ? departmentIds : [departmentIds]).map(normalizeId).filter(Boolean))
  );
  const denied = ids.filter((departmentId) => !canAccessRequisitionDepartment(scope, departmentId));
  if (denied.length) {
    throw new ApiError(403, message, { deniedDepartmentIds: denied });
  }
}

export async function loadScopedRequisitionDraftRow(supabaseAdmin, {
  masterPlanNo,
  dateFrom,
  dateTo,
  scope,
  allowLegacyFallback = false,
}) {
  const scopeKey = buildRequisitionDraftScopeKey(masterPlanNo, dateFrom, dateTo, scope);
  const selectColumns = "scope_key, master_plan_no, date_from, date_to, draft_payload, updated_at, updated_by";
  const scopedResult = await supabaseAdmin
    .from("production_requisition_preview_drafts")
    .select(selectColumns)
    .eq("scope_key", scopeKey)
    .maybeSingle();
  if (scopedResult.error) throw scopedResult.error;
  if (scopedResult.data || !allowLegacyFallback) return scopedResult.data || null;

  const legacyScopeKey = buildLegacyRequisitionDraftScopeKey(masterPlanNo, dateFrom, dateTo);
  const legacyResult = await supabaseAdmin
    .from("production_requisition_preview_drafts")
    .select(selectColumns)
    .eq("scope_key", legacyScopeKey)
    .maybeSingle();
  if (legacyResult.error) throw legacyResult.error;
  return legacyResult.data || null;
}
