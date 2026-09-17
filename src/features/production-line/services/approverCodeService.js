import "server-only";

import { ApiError, getSupabaseAdmin } from "@/lib/adminApi";
import { getUserPermissions } from "@/lib/permissionsData";

const CODE_PATTERN = /^[A-Z0-9]{6,16}$/;

function normalizeCode(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().toUpperCase();
}

export async function resolveApproverByCode(code) {
  const normalized = normalizeCode(code);
  if (!normalized) {
    return null;
  }
  if (!CODE_PATTERN.test(normalized)) {
    throw new ApiError(400, "Invalid approver code format");
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, username, is_active, approver_code_active")
    .eq("approver_code", normalized)
    .maybeSingle();
  if (error) {
    throw new ApiError(500, "Failed to resolve approver code", error.message);
  }
  if (!data || !data.is_active || !data.approver_code_active) {
    return null;
  }

  const permissionData = await getUserPermissions(data.id);
  if (
    !permissionData.isAdmin &&
    permissionData.permissions.indexOf("production-line-bom-approve") === -1
  ) {
    return null;
  }

  return {
    profileId: data.id,
    username: data.username,
    isAdmin: permissionData.isAdmin,
    permissions: permissionData.permissions,
    normalizedCode: normalized,
  };
}

export async function logApprovalAction(details) {
  const supabaseAdmin = getSupabaseAdmin();
  const payload = {
    approval_id: details.approvalId,
    action: details.action,
    approver_profile_id: details.approverProfileId,
    approver_code: details.approverCode,
  };
  if (details.detail) {
    payload.detail = details.detail;
  }
  const { error } = await supabaseAdmin.from("production_bom_approval_logs").insert(payload);
  if (error) {
    throw new ApiError(500, "Failed to log approval action", error.message);
  }
}
