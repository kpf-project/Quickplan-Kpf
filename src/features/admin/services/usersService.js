import {
  ApiError,
  buildEmailFromUsername,
  getSupabaseAdmin,
  readJson,
  requireAdmin,
} from "@/lib/adminApi";
import { logAuditEvent } from "@/lib/auditLog";

const ADMIN_ROLE_KEY = "admin";
const SUPER_ADMIN_ROLE_KEYS = new Set(["super_admin", "superadmin"]);

function parseCsvSet(value) {
  return new Set(
    String(value || "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

const SUPER_ADMIN_USER_IDS = parseCsvSet(process.env.SUPER_ADMIN_USER_IDS);
const SUPER_ADMIN_USERNAMES = parseCsvSet(process.env.SUPER_ADMIN_USERNAMES);

function getString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizeLower(value) {
  return String(value || "").trim().toLowerCase();
}

function requireReason(value, message = "Reason is required") {
  const reason = getString(value);
  if (reason.length < 3) {
    throw new ApiError(400, message);
  }
  return reason;
}

function isProfileActive(profile) {
  if (!profile) return false;
  return profile.is_active !== false && profile.is_archived !== true && !profile.deleted_at;
}

async function resolveDepartmentId(supabaseAdmin, departmentId) {
  const column = isUuid(departmentId) ? "id" : "external_code";
  const { data: department, error: departmentError } = await supabaseAdmin
    .from("departments")
    .select("id, is_active")
    .eq(column, departmentId)
    .maybeSingle();
  if (departmentError) {
    throw new ApiError(
      500,
      "Failed to validate department",
      departmentError.message
    );
  }
  if (!department || department.is_active === false) {
    throw new ApiError(400, "Department not found or inactive");
  }
  return department.id;
}

async function resolveAdminRoleId(supabaseAdmin) {
  const { data: adminRole, error: adminRoleError } = await supabaseAdmin
    .from("roles")
    .select("id")
    .eq("role_key", ADMIN_ROLE_KEY)
    .maybeSingle();
  if (adminRoleError) {
    throw new ApiError(500, "Failed to load admin role", adminRoleError.message);
  }
  if (!adminRole) {
    throw new ApiError(500, "Admin role not configured");
  }
  return adminRole.id;
}

async function resolveRoleKeysForUser(supabaseAdmin, userId) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("roles(role_key)")
    .eq("user_id", userId);
  if (error) {
    throw new ApiError(500, "Failed to load user roles", error.message);
  }
  return (data ?? [])
    .map((row) => normalizeLower(row?.roles?.role_key))
    .filter(Boolean);
}

async function getProfileById(supabaseAdmin, userId) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, username, department_id, is_active, is_archived, archived_at, deleted_at")
    .eq("id", userId)
    .maybeSingle();
  if (error) {
    throw new ApiError(500, "Failed to load user profile", error.message);
  }
  if (!data) {
    throw new ApiError(404, "User not found");
  }
  return data;
}

async function resolveIsSuperAdminActor(supabaseAdmin, actorUserId) {
  if (SUPER_ADMIN_USER_IDS.has(normalizeLower(actorUserId))) {
    return true;
  }

  const { data: actorProfile, error: actorProfileError } = await supabaseAdmin
    .from("profiles")
    .select("username")
    .eq("id", actorUserId)
    .maybeSingle();
  if (actorProfileError) {
    throw new ApiError(500, "Failed to resolve actor profile", actorProfileError.message);
  }
  if (SUPER_ADMIN_USERNAMES.has(normalizeLower(actorProfile?.username))) {
    return true;
  }

  const actorRoleKeys = await resolveRoleKeysForUser(supabaseAdmin, actorUserId);
  return actorRoleKeys.some((roleKey) => SUPER_ADMIN_ROLE_KEYS.has(roleKey));
}

async function ensureNotLastActiveAdmin(supabaseAdmin, targetUserId) {
  const adminRoleId = await resolveAdminRoleId(supabaseAdmin);

  const { data: targetRole, error: targetRoleError } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", targetUserId)
    .eq("role_id", adminRoleId)
    .maybeSingle();
  if (targetRoleError) {
    throw new ApiError(500, "Failed to validate admin role", targetRoleError.message);
  }
  if (!targetRole) {
    return;
  }

  const { data: adminUsers, error: adminUsersError } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role_id", adminRoleId);
  if (adminUsersError) {
    throw new ApiError(500, "Failed to load admin users", adminUsersError.message);
  }

  const adminUserIds = Array.from(new Set((adminUsers ?? []).map((row) => row.user_id).filter(Boolean)));
  if (!adminUserIds.length) {
    return;
  }

  const { data: adminProfiles, error: adminProfilesError } = await supabaseAdmin
    .from("profiles")
    .select("id, is_active, is_archived, deleted_at")
    .in("id", adminUserIds);
  if (adminProfilesError) {
    throw new ApiError(500, "Failed to load admin profiles", adminProfilesError.message);
  }

  const activeAdminIds = (adminProfiles ?? [])
    .filter((profile) => isProfileActive(profile))
    .map((profile) => profile.id);

  if (activeAdminIds.includes(targetUserId) && activeAdminIds.length <= 1) {
    throw new ApiError(409, "Cannot modify the last active admin");
  }
}

async function revokeAllSessionsForUser(supabaseAdmin, userId) {
  const nowIso = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("user_sessions")
    .update({ revoked_at: nowIso })
    .eq("user_id", userId)
    .is("revoked_at", null)
    .select("id");
  if (error) {
    throw new ApiError(500, "Failed to revoke user sessions", error.message);
  }
  return Array.isArray(data) ? data.length : 0;
}

async function setUserActiveState({ supabaseAdmin, actor, userId, isActive, reason }) {
  const profile = await getProfileById(supabaseAdmin, userId);
  if (profile.deleted_at) {
    throw new ApiError(409, "Deleted user cannot be updated");
  }
  if (profile.is_archived) {
    throw new ApiError(409, "Archived user cannot be toggled. Use archive flow instead.");
  }
  if (!isActive && actor.userId === userId) {
    throw new ApiError(400, "You cannot disable your own account");
  }

  if (!isActive) {
    await ensureNotLastActiveAdmin(supabaseAdmin, userId);
  }

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({
      is_active: isActive,
      updated_by: actor.userId,
    })
    .eq("id", userId);
  if (profileError) {
    throw new ApiError(400, "Failed to update user status", profileError.message);
  }

  const authMetadata = {
    username: profile.username,
    department_id: profile.department_id,
    is_active: isActive,
    is_archived: false,
  };
  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: authMetadata,
  });
  if (authError) {
    throw new ApiError(400, "Failed to update auth status", authError.message);
  }

  const revokedSessions = isActive ? 0 : await revokeAllSessionsForUser(supabaseAdmin, userId);

  await logAuditEvent({
    actorId: actor.userId,
    action: isActive ? "user.activate" : "user.deactivate",
    targetTable: "profiles",
    targetId: userId,
    metadata: {
      reason,
      revoked_sessions: revokedSessions,
    },
  });

  return Response.json({ success: true, revoked_sessions: revokedSessions });
}

async function forceLogoutAllDevices({ supabaseAdmin, actor, userId }) {
  await getProfileById(supabaseAdmin, userId);
  const revokedSessions = await revokeAllSessionsForUser(supabaseAdmin, userId);

  await logAuditEvent({
    actorId: actor.userId,
    action: "user.force_logout_all",
    targetTable: "profiles",
    targetId: userId,
    metadata: {
      revoked_sessions: revokedSessions,
    },
  });

  return Response.json({ success: true, revoked_sessions: revokedSessions });
}

async function archiveUser({ supabaseAdmin, actor, userId, reason }) {
  const profile = await getProfileById(supabaseAdmin, userId);
  if (profile.deleted_at) {
    throw new ApiError(409, "Deleted user cannot be archived");
  }
  if (actor.userId === userId) {
    throw new ApiError(400, "You cannot archive your own account");
  }
  if (profile.is_archived) {
    throw new ApiError(409, "User is already archived");
  }

  await ensureNotLastActiveAdmin(supabaseAdmin, userId);

  const archivedAt = new Date().toISOString();
  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({
      is_active: false,
      is_archived: true,
      archived_at: archivedAt,
      archived_by: actor.userId,
      archive_reason: reason,
      updated_by: actor.userId,
    })
    .eq("id", userId);
  if (profileError) {
    throw new ApiError(400, "Failed to archive user", profileError.message);
  }

  const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
    user_metadata: {
      username: profile.username,
      department_id: profile.department_id,
      is_active: false,
      is_archived: true,
    },
  });
  if (authError) {
    throw new ApiError(400, "Failed to update auth user", authError.message);
  }

  const revokedSessions = await revokeAllSessionsForUser(supabaseAdmin, userId);

  await logAuditEvent({
    actorId: actor.userId,
    action: "user.archive",
    targetTable: "profiles",
    targetId: userId,
    metadata: {
      reason,
      revoked_sessions: revokedSessions,
      archived_at: archivedAt,
    },
  });

  return Response.json({ success: true, revoked_sessions: revokedSessions });
}

async function hardDeleteUser({ supabaseAdmin, actor, userId, reason }) {
  const isSuperAdmin = await resolveIsSuperAdminActor(supabaseAdmin, actor.userId);
  if (!isSuperAdmin) {
    throw new ApiError(403, "Only Super Admin can hard delete users");
  }
  if (actor.userId === userId) {
    throw new ApiError(400, "You cannot hard delete your own account");
  }

  const profile = await getProfileById(supabaseAdmin, userId);
  if (profile.deleted_at) {
    throw new ApiError(409, "User is already hard deleted");
  }

  await ensureNotLastActiveAdmin(supabaseAdmin, userId);

  const revokedSessions = await revokeAllSessionsForUser(supabaseAdmin, userId);
  const deletedAt = new Date().toISOString();
  const anonymizedUsername = `deleted_${String(userId).slice(0, 8)}_${Date.now().toString().slice(-6)}`;

  const { error: clearRolesError } = await supabaseAdmin
    .from("user_roles")
    .delete()
    .eq("user_id", userId);
  if (clearRolesError) {
    throw new ApiError(400, "Failed to clear user roles", clearRolesError.message);
  }

  const { error: profileError } = await supabaseAdmin
    .from("profiles")
    .update({
      username: anonymizedUsername,
      department_id: null,
      is_active: false,
      is_archived: true,
      archived_at: deletedAt,
      archived_by: actor.userId,
      archive_reason: reason,
      deleted_at: deletedAt,
      deleted_by: actor.userId,
      delete_reason: reason,
      line_user_id: null,
      line_link_code: null,
      line_linked_at: null,
      approver_code: null,
      approver_code_active: false,
      updated_by: actor.userId,
    })
    .eq("id", userId);
  if (profileError) {
    throw new ApiError(400, "Failed to mark user as deleted", profileError.message);
  }

  const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (authDeleteError && !/user not found/i.test(authDeleteError.message || "")) {
    throw new ApiError(500, "Failed to hard delete auth user", authDeleteError.message);
  }

  await logAuditEvent({
    actorId: actor.userId,
    action: "user.hard_delete",
    targetTable: "profiles",
    targetId: userId,
    metadata: {
      reason,
      revoked_sessions: revokedSessions,
      deleted_at: deletedAt,
      anonymized_username: anonymizedUsername,
    },
  });

  return Response.json({ success: true, revoked_sessions: revokedSessions });
}

export async function listUsers(request) {
  const actor = await requireAdmin(request);
  const supabaseAdmin = getSupabaseAdmin();
  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from("profiles")
    .select("id, username, department_id, is_active, is_archived, archived_at, archive_reason, deleted_at, delete_reason, line_user_id, line_link_code, line_linked_at, departments(id, name, is_active)")
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
      is_archived: profile.is_archived,
      archived_at: profile.archived_at,
      archive_reason: profile.archive_reason,
      deleted_at: profile.deleted_at,
      delete_reason: profile.delete_reason,
      line_user_id: profile.line_user_id,
      line_link_code: profile.line_link_code,
      line_linked_at: profile.line_linked_at,
      department: profile.departments
        ? {
            id: profile.departments.id,
            name: profile.departments.name,
            is_active: profile.departments.is_active,
          }
        : null,
      role: role
        ? {
            id: role.id,
            name: role.name,
            role_key: role.role_key,
          }
        : null,
    };
  });

  const isSuperAdmin = await resolveIsSuperAdminActor(supabaseAdmin, actor.userId);

  return Response.json({
    users,
    meta: {
      current_user_id: actor.userId,
      is_super_admin: isSuperAdmin,
    },
  });
}

export async function createUser(request) {
  const actor = await requireAdmin(request);
  const body = await readJson(request);

  const username = getString(body.username);
  const password = typeof body.password === "string" ? body.password : "";
  const roleId = getString(body.role_id);
  const roleKey = getString(body.role_key);
  const email = getString(body.email);
  const departmentId = getString(body.department_id);

  if (!username || username.length < 8) {
    throw new ApiError(400, "Username must be at least 8 characters");
  }
  if (!password || password.length < 8) {
    throw new ApiError(400, "Password must be at least 8 characters");
  }
  if (!roleId && !roleKey) {
    throw new ApiError(400, "Role is required");
  }

  const resolvedEmail = email || buildEmailFromUsername(username);
  if (!resolvedEmail) {
    throw new ApiError(400, "Email is required or username is invalid");
  }

  const supabaseAdmin = getSupabaseAdmin();
  let resolvedDepartmentId = null;
  if (departmentId) {
    resolvedDepartmentId = await resolveDepartmentId(supabaseAdmin, departmentId);
  }

  let resolvedRoleId = roleId;
  if (!resolvedRoleId) {
    const { data: role, error: roleError } = await supabaseAdmin
      .from("roles")
      .select("id")
      .eq("role_key", roleKey)
      .maybeSingle();
    if (roleError) {
      throw new ApiError(500, "Failed to resolve role", roleError.message);
    }
    if (!role) {
      throw new ApiError(400, "Role not found");
    }
    resolvedRoleId = role.id;
  }

  let createdUserId;
  try {
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email: resolvedEmail,
        password,
        email_confirm: true,
        user_metadata: {
          username,
          department_id: resolvedDepartmentId,
          is_active: true,
          is_archived: false,
        },
      });

    if (authError || !authData?.user?.id) {
      throw new ApiError(
        400,
        "Failed to create auth user",
        authError?.message
      );
    }

    createdUserId = authData.user.id;

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: createdUserId,
        username,
        department_id: resolvedDepartmentId,
        created_by: actor.userId,
        updated_by: actor.userId,
      });
    if (profileError) {
      throw new ApiError(400, "Failed to create profile", profileError.message);
    }

    const { error: userRoleError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: createdUserId,
        role_id: resolvedRoleId,
        created_by: actor.userId,
      });
    if (userRoleError) {
      throw new ApiError(
        400,
        "Failed to assign role",
        userRoleError.message
      );
    }
  } catch (error) {
    if (createdUserId) {
      await supabaseAdmin.auth.admin.deleteUser(createdUserId);
    }
    throw error;
  }

  await logAuditEvent({
    actorId: actor.userId,
    action: "user.create",
    targetTable: "profiles",
    targetId: createdUserId,
    metadata: {
      username,
      role_id: resolvedRoleId,
      department_id: resolvedDepartmentId,
    },
  });

  return Response.json(
    {
      user_id: createdUserId,
      username,
      email: resolvedEmail,
      role_id: resolvedRoleId,
      department_id: resolvedDepartmentId,
    },
    { status: 201 }
  );
}

export async function updateUser(request) {
  const actor = await requireAdmin(request);
  const body = await readJson(request);
  const supabaseAdmin = getSupabaseAdmin();

  const action = normalizeLower(body.action);
  if (action) {
    const userId = getString(body.user_id);
    if (!userId) {
      throw new ApiError(400, "user_id is required");
    }

    if (action === "set_active") {
      if (!hasOwn(body, "is_active")) {
        throw new ApiError(400, "is_active is required");
      }
      const reason = requireReason(
        body.reason,
        "Reason is required for enable/disable action"
      );
      return setUserActiveState({
        supabaseAdmin,
        actor,
        userId,
        isActive: body.is_active === true,
        reason,
      });
    }

    if (action === "force_logout_all") {
      return forceLogoutAllDevices({
        supabaseAdmin,
        actor,
        userId,
      });
    }

    if (action === "archive") {
      const reason = requireReason(body.reason, "Reason is required for archive action");
      return archiveUser({
        supabaseAdmin,
        actor,
        userId,
        reason,
      });
    }

    if (action === "hard_delete") {
      const reason = requireReason(body.reason, "Reason is required for hard delete action");
      return hardDeleteUser({
        supabaseAdmin,
        actor,
        userId,
        reason,
      });
    }

    throw new ApiError(400, "Unsupported action");
  }

  const userId = getString(body.user_id);
  const username = getString(body.username);
  const password = typeof body.password === "string" ? body.password : "";
  const roleId = getString(body.role_id);
  const hasDepartmentId = hasOwn(body, "department_id");
  const departmentId = getString(body.department_id);

  if (!userId) {
    throw new ApiError(400, "user_id is required");
  }
  if (username && username.length < 8) {
    throw new ApiError(400, "Username must be at least 8 characters");
  }
  if (password && password.length < 8) {
    throw new ApiError(400, "Password must be at least 8 characters");
  }

  const existingProfile = await getProfileById(supabaseAdmin, userId);
  if (existingProfile.deleted_at) {
    throw new ApiError(409, "Deleted user cannot be modified");
  }

  let resolvedDepartmentId = null;

  if (username) {
    const { data: existingUsers, error: existingError } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("username", username)
      .neq("id", userId);
    if (existingError) {
      throw new ApiError(
        500,
        "Failed to validate username",
        existingError.message
      );
    }
    if ((existingUsers ?? []).length > 0) {
      throw new ApiError(400, "Username already exists");
    }
  }

  if (hasDepartmentId && departmentId) {
    resolvedDepartmentId = await resolveDepartmentId(
      supabaseAdmin,
      departmentId
    );
  }

  if (roleId) {
    const { data: role, error: roleError } = await supabaseAdmin
      .from("roles")
      .select("id")
      .eq("id", roleId)
      .maybeSingle();
    if (roleError) {
      throw new ApiError(500, "Failed to validate role", roleError.message);
    }
    if (!role) {
      throw new ApiError(400, "Role not found");
    }

    const adminRoleId = await resolveAdminRoleId(supabaseAdmin);
    if (roleId !== adminRoleId) {
      await ensureNotLastActiveAdmin(supabaseAdmin, userId);
    }
  }

  const profileUpdates = {};
  if (username) {
    profileUpdates.username = username;
  }
  if (hasDepartmentId) {
    profileUpdates.department_id = resolvedDepartmentId;
  }
  if (Object.keys(profileUpdates).length > 0) {
    profileUpdates.updated_by = actor.userId;
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update(profileUpdates)
      .eq("id", userId);
    if (profileError) {
      throw new ApiError(400, "Failed to update profile", profileError.message);
    }
  }

  const authUpdates = {};
  if (password) {
    authUpdates.password = password;
  }
  if (username || hasDepartmentId) {
    const metadata = {
      username: username || existingProfile.username,
      department_id: hasDepartmentId ? resolvedDepartmentId : existingProfile.department_id,
      is_active: existingProfile.is_active !== false,
      is_archived: existingProfile.is_archived === true,
    };
    authUpdates.user_metadata = metadata;
  }
  if (Object.keys(authUpdates).length > 0) {
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(
      userId,
      authUpdates
    );
    if (authError) {
      throw new ApiError(400, "Failed to update auth user", authError.message);
    }
  }

  if (roleId) {
    const { error: roleDeleteError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", userId);
    if (roleDeleteError) {
      throw new ApiError(
        400,
        "Failed to update user role",
        roleDeleteError.message
      );
    }
    const { error: roleAssignError } = await supabaseAdmin
      .from("user_roles")
      .insert({
        user_id: userId,
        role_id: roleId,
        created_by: actor.userId,
      });
    if (roleAssignError) {
      throw new ApiError(
        400,
        "Failed to assign role",
        roleAssignError.message
      );
    }
  }

  await logAuditEvent({
    actorId: actor.userId,
    action: "user.update",
    targetTable: "profiles",
    targetId: userId,
    metadata: {
      changed_username: Boolean(username),
      changed_password: Boolean(password),
      changed_role: Boolean(roleId),
      changed_department: hasDepartmentId,
    },
  });

  return Response.json({ success: true });
}
