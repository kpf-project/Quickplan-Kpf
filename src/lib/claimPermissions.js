import "server-only";

import { getSessionFromRequest } from "@/lib/sessionToken";
import { getUserPermissions } from "@/lib/permissionsData";

const CLAIM_PERMISSIONS = Object.freeze({
  claim: "plan.claim_material",
  release: "plan.release_claim",
  reassign: "plan.reassign_claim",
  viewAll: "plan.view_claim_all",
  consolidateCrossQa: "plan.consolidate_cross_qa",
});

function normalizeId(value) {
  return String(value || "").trim();
}

function isMissingTableError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("does not exist")
    || message.includes("relation")
    || String(error?.code || "") === "42P01"
  );
}

export async function hasPlanningManageAccess(request, userId, isAdmin = false) {
  if (isAdmin) return true;
  const session = getSessionFromRequest(request, userId);
  if (session?.isAdmin) return true;
  if (Array.isArray(session?.permissions)) {
    return session.permissions.includes("production-line-planning-manage");
  }
  const permissionResult = await getUserPermissions(userId);
  return Boolean(
    permissionResult?.isAdmin
    || permissionResult?.permissions?.includes("production-line-planning-manage")
  );
}

export async function loadDepartmentMembership(supabaseAdmin, userId) {
  const { data, error } = await supabaseAdmin
    .from("production_department_users")
    .select("department_id,role,production_departments(id,is_active,deleted_at)")
    .eq("user_id", userId);
  if (error) {
    return [];
  }
  return (data || [])
    .filter((row) => row?.production_departments?.is_active && !row?.production_departments?.deleted_at)
    .map((row) => ({
      departmentId: normalizeId(row?.department_id),
      role: String(row?.role || "viewer").trim().toLowerCase(),
    }))
    .filter((row) => row.departmentId);
}

export async function loadDelegatedDepartmentIds(
  supabaseAdmin,
  userId,
  requiredPermissions = []
) {
  const permissions = Array.isArray(requiredPermissions)
    ? requiredPermissions.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  let query = supabaseAdmin
    .from("production_department_delegations")
    .select("department_id")
    .eq("delegate_user_id", userId)
    .eq("is_active", true)
    .lte("valid_from", new Date().toISOString())
    .gte("valid_to", new Date().toISOString());

  if (permissions.length) {
    query = query.overlaps("permissions", permissions);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingTableError(error)) {
      return [];
    }
    return [];
  }
  return Array.from(
    new Set(
      (data || [])
        .map((row) => normalizeId(row?.department_id))
        .filter(Boolean)
    )
  );
}

export async function loadClaimScope({
  supabaseAdmin,
  request,
  permission,
  action = "view",
}) {
  const canManageGlobal = await hasPlanningManageAccess(
    request,
    permission.userId,
    permission.isAdmin
  );
  if (permission.isAdmin || canManageGlobal) {
    return { canManageGlobal: true, departmentIds: [] };
  }

  const memberships = await loadDepartmentMembership(supabaseAdmin, permission.userId);
  const allMembershipDeptIds = memberships.map((row) => row.departmentId);
  const editorDeptIds = memberships
    .filter((row) => row.role === "editor")
    .map((row) => row.departmentId);

  let delegatedPermissions = [];
  if (action === "claim") {
    delegatedPermissions = [CLAIM_PERMISSIONS.claim];
  } else if (action === "release") {
    delegatedPermissions = [CLAIM_PERMISSIONS.release];
  } else if (action === "reassign") {
    delegatedPermissions = [CLAIM_PERMISSIONS.reassign];
  } else {
    delegatedPermissions = [
      CLAIM_PERMISSIONS.claim,
      CLAIM_PERMISSIONS.release,
      CLAIM_PERMISSIONS.reassign,
      CLAIM_PERMISSIONS.viewAll,
    ];
  }
  const delegatedDeptIds = await loadDelegatedDepartmentIds(
    supabaseAdmin,
    permission.userId,
    delegatedPermissions
  );

  const sourceIds = action === "view"
    ? [...allMembershipDeptIds, ...delegatedDeptIds]
    : [...editorDeptIds, ...delegatedDeptIds];

  return {
    canManageGlobal: false,
    departmentIds: Array.from(new Set(sourceIds.filter(Boolean))),
  };
}

export function canConsolidateCrossQa(permission) {
  if (permission?.isAdmin) return true;
  const keys = Array.isArray(permission?.permissions) ? permission.permissions : [];
  return (
    keys.includes("production-line-planning-manage")
    || keys.includes(CLAIM_PERMISSIONS.consolidateCrossQa)
  );
}

export { CLAIM_PERMISSIONS };
