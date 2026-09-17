import crypto from "crypto";

import { ApiError, getSupabaseAdmin, requireAdmin, readJson } from "@/lib/adminApi";
import { logAuditEvent } from "@/lib/auditLog";
import { getUserPermissions } from "@/lib/permissionsData";

function normalizeString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function createLinkCode() {
  const token = crypto.randomBytes(6).toString("base64url");
  return `LINE-${token.toUpperCase()}`;
}

const APPROVER_CODE_PATTERN = /^[A-Z0-9]{6,16}$/;

function normalizeApproverCode(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim().toUpperCase();
}

export async function listLineApprovers(request) {
  await requireAdmin(request);
  const supabaseAdmin = getSupabaseAdmin();

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("id, username, is_active, line_user_id, line_link_code, line_linked_at, approver_code, approver_code_active, departments(id, name)")
    .order("username", { ascending: true });
  if (profilesError) {
    throw new ApiError(500, "Failed to load users", profilesError.message);
  }

  const { data: roleRows, error: rolesError } = await supabaseAdmin
    .from("user_roles")
    .select("user_id, role_id, roles(id, name, role_key)")
    .eq("is_primary", true);
  if (rolesError) {
    throw new ApiError(500, "Failed to load user roles", rolesError.message);
  }

  const roleMap = new Map();
  (roleRows ?? []).forEach((row) => {
    if (row?.user_id) {
      roleMap.set(row.user_id, row.roles ?? null);
    }
  });

  const users = (profiles ?? []).map((profile) => {
    const role = roleMap.get(profile.id) || null;
    return {
      id: profile.id,
      username: profile.username,
      is_active: profile.is_active,
      department: profile.departments
        ? {
            id: profile.departments.id,
            name: profile.departments.name,
          }
        : null,
      role: role
        ? {
            id: role.id,
            name: role.name,
            role_key: role.role_key,
          }
        : null,
      line_user_id: profile.line_user_id,
      line_link_code: profile.line_link_code,
      line_linked_at: profile.line_linked_at,
      approver_code: profile.approver_code,
      approver_code_active: profile.approver_code_active,
    };
  });

  const permissionResults = await Promise.all(
    users.map(async (user) => {
      const permissionData = await getUserPermissions(user.id);
      const canApprove = permissionData.isAdmin
        || permissionData.permissions.includes("production-line-bom-approve");
      return { id: user.id, canApprove };
    })
  );

  const canApproveMap = new Map(permissionResults.map((item) => [item.id, item.canApprove]));
  const eligibleUsers = users
    .map((user) => ({
      ...user,
      canApprove: canApproveMap.get(user.id) || false,
    }))
    .filter((user) => user.canApprove);

  return Response.json({ users: eligibleUsers });
}

export async function updateLineApprover(request) {
  const actor = await requireAdmin(request);
  const body = await readJson(request);

  const userId = normalizeString(body.user_id);
  const action = normalizeString(body.action);

  if (!userId) {
    throw new ApiError(400, "user_id is required");
  }
  if (!action) {
    throw new ApiError(400, "action is required");
  }

  const supabaseAdmin = getSupabaseAdmin();
  let updates = null;

  if (action === "generate") {
    updates = {
      line_link_code: createLinkCode(),
      line_user_id: null,
      line_linked_at: null,
    };
  } else if (action === "set-approver-code") {
    const approverCode = normalizeApproverCode(body.approver_code);
    if (!approverCode) {
      throw new ApiError(400, "approver_code is required");
    }
    if (!APPROVER_CODE_PATTERN.test(approverCode)) {
      throw new ApiError(400, "Invalid approver code format");
    }
    updates = {
      approver_code: approverCode,
      approver_code_active: true,
    };
  } else if (action === "toggle-approver-code") {
    const active = Boolean(body.approver_code_active);
    updates = {
      approver_code_active: active,
    };
  } else if (action === "clear-approver-code") {
    updates = {
      approver_code: null,
      approver_code_active: false,
    };
  } else if (action === "clear") {
    updates = {
      line_link_code: null,
      line_user_id: null,
      line_linked_at: null,
    };
  } else {
    throw new ApiError(400, "Invalid action");
  }

  const { data: updated, error: updateError } = await supabaseAdmin
    .from("profiles")
    .update(updates)
    .eq("id", userId)
    .select("id, username, line_user_id, line_link_code, line_linked_at, approver_code, approver_code_active")
    .maybeSingle();

  if (updateError) {
    throw new ApiError(500, "Failed to update LINE link", updateError.message);
  }

  await logAuditEvent({
    actorId: actor.userId,
    action: "approver.update",
    targetTable: "profiles",
    targetId: userId,
    metadata: {
      action,
      line_linked: Boolean(updated?.line_user_id),
      approver_code_active: updated?.approver_code_active ?? null,
      has_approver_code: Boolean(updated?.approver_code),
    },
  });

  return Response.json({ user: updated });
}
