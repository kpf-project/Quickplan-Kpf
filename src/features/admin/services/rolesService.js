import {
  ApiError,
  getSupabaseAdmin,
  readJson,
  requireAdmin,
} from "@/lib/adminApi";
import { logAuditEvent } from "@/lib/auditLog";

function normalizeString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((item) => normalizeString(item)).filter(Boolean))];
}

async function saveAtomicRole(db, actor, body, roleId = null) {
  let permissionIds = normalizeStringArray(body.permission_ids);
  const keys = normalizeStringArray(body.permission_keys);
  if (!permissionIds.length && keys.length) {
    const { data, error } = await db.from("permissions").select("id,perm_key").in("perm_key", keys);
    if (error) throw new ApiError(500, "ตรวจสอบสิทธิ์ไม่สำเร็จ");
    if (keys.some((key) => !data?.some((item) => item.perm_key === key))) throw new ApiError(400, "พบสิทธิ์ที่ไม่ได้ลงทะเบียน");
    permissionIds = data.map((item) => item.id);
  }
  const { data, error } = await db.rpc("save_role_permissions_atomic", {
    p_actor_id: actor.userId, p_role_id: roleId,
    p_role_key: normalizeString(body.role_key), p_name: normalizeString(body.name),
    p_description: normalizeString(body.description), p_permission_ids: permissionIds,
    p_expected_permission_ids: roleId && Array.isArray(body.expected_permission_ids)
      ? normalizeStringArray(body.expected_permission_ids) : roleId ? null : [],
  });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404
      : ["23505", "P0001"].includes(error.code) ? 409 : error.code === "22023" ? 400 : 503;
    throw new ApiError(status, status === 503 ? "ยังไม่พร้อมบันทึกสิทธิ์ใหม่ กรุณาติดตั้ง SQL และตรวจสอบก่อนเปิดใช้งาน" : error.message);
  }
  return data;
}

export async function listRoles(request) {
  await requireAdmin(request);
  const supabaseAdmin = getSupabaseAdmin();
  const [rolesResponse, userRolesResponse] = await Promise.all([
    supabaseAdmin
      .from("roles")
      .select(
        "id, role_key, name, description, is_system, created_at, updated_at, role_permissions(permission_id)"
      )
      .order("name", { ascending: true }),
    supabaseAdmin.from("user_roles").select("role_id"),
  ]);

  if (rolesResponse.error) {
    throw new ApiError(500, "Failed to load roles", rolesResponse.error.message);
  }
  if (userRolesResponse.error) {
    throw new ApiError(
      500,
      "Failed to load role assignments",
      userRolesResponse.error.message
    );
  }

  const userRoleCounts = new Map();
  (userRolesResponse.data ?? []).forEach((row) => {
    userRoleCounts.set(row.role_id, (userRoleCounts.get(row.role_id) ?? 0) + 1);
  });

  const data = rolesResponse.data ?? [];
  const roles = (data ?? []).map((role) => ({
    id: role.id,
    role_key: role.role_key,
    name: role.name,
    description: role.description,
    is_system: role.is_system,
    created_at: role.created_at,
    updated_at: role.updated_at,
    permissions: (role.role_permissions ?? []).map((item) => item.permission_id),
    user_count: userRoleCounts.get(role.id) ?? 0,
  }));
  return Response.json({ roles });
}

export async function createRole(request) {
  const actor = await requireAdmin(request);
  const body = await readJson(request);

  const roleKey = normalizeString(body.role_key);
  const name = normalizeString(body.name);
  const description = normalizeString(body.description);
  const permissionKeys = normalizeStringArray(body.permission_keys);
  const permissionIds = normalizeStringArray(body.permission_ids);

  if (!roleKey) {
    throw new ApiError(400, "role_key is required");
  }
  if (!name) {
    throw new ApiError(400, "name is required");
  }

  const supabaseAdmin = getSupabaseAdmin();

  if (process.env.ROLE_TASK_PERMISSIONS_ENABLED === "true") {
    const role = await saveAtomicRole(supabaseAdmin, actor, body);
    return Response.json({ role }, { status: 201 });
  }

  const { data: role, error: roleError } = await supabaseAdmin
    .from("roles")
    .insert({
      role_key: roleKey,
      name,
      description: description || null,
      created_by: actor.userId,
      updated_by: actor.userId,
    })
    .select("id, role_key, name, description, is_system")
    .single();
  if (roleError) {
    throw new ApiError(400, "Failed to create role", roleError.message);
  }

  let resolvedPermissionIds = permissionIds;
  if (!resolvedPermissionIds.length && permissionKeys.length) {
    const { data: permissions, error: permissionsError } = await supabaseAdmin
      .from("permissions")
      .select("id, perm_key")
      .in("perm_key", permissionKeys);
    if (permissionsError) {
      throw new ApiError(
        500,
        "Failed to resolve permissions",
        permissionsError.message
      );
    }
    const permissionMap = new Map(
      (permissions ?? []).map((row) => [row.perm_key, row.id])
    );
    const missing = permissionKeys.filter((key) => !permissionMap.has(key));
    if (missing.length) {
      throw new ApiError(
        400,
        `Unknown permission keys: ${missing.join(", ")}`
      );
    }
    resolvedPermissionIds = [...permissionMap.values()];
  }

  if (resolvedPermissionIds.length) {
    const rows = resolvedPermissionIds.map((permissionId) => ({
      role_id: role.id,
      permission_id: permissionId,
      created_by: actor.userId,
    }));
    const { error: rolePermissionsError } = await supabaseAdmin
      .from("role_permissions")
      .insert(rows);
    if (rolePermissionsError) {
      throw new ApiError(
        400,
        "Failed to assign permissions",
        rolePermissionsError.message
      );
    }
  }

  await logAuditEvent({
    actorId: actor.userId,
    action: "role.create",
    targetTable: "roles",
    targetId: role.id,
    metadata: {
      role_key: role.role_key,
      name: role.name,
      permission_count: resolvedPermissionIds.length,
    },
  });

  return Response.json({ role }, { status: 201 });
}

export async function updateRole(request, { id }) {
  const actor = await requireAdmin(request);
  const roleId = normalizeString(id);
  const body = await readJson(request);
  if (!roleId) {
    throw new ApiError(400, "role id is required");
  }

  const name = normalizeString(body.name);
  const description = normalizeString(body.description);
  const permissionIds = normalizeStringArray(body.permission_ids);

  if (!name) {
    throw new ApiError(400, "name is required");
  }

  const supabaseAdmin = getSupabaseAdmin();
  if (process.env.ROLE_TASK_PERMISSIONS_ENABLED === "true") {
    await saveAtomicRole(supabaseAdmin, actor, body, roleId);
    return Response.json({ ok: true });
  }
  const { data: role, error: roleError } = await supabaseAdmin
    .from("roles")
    .select("id, is_system")
    .eq("id", roleId)
    .maybeSingle();
  if (roleError) {
    throw new ApiError(500, "Failed to load role", roleError.message);
  }
  if (!role) {
    throw new ApiError(404, "Role not found");
  }
  if (role.is_system) {
    throw new ApiError(403, "System role cannot be edited");
  }

  let resolvedPermissionIds = permissionIds;
  if (resolvedPermissionIds.length) {
    const { data: permissions, error: permissionsError } = await supabaseAdmin
      .from("permissions")
      .select("id")
      .in("id", resolvedPermissionIds);
    if (permissionsError) {
      throw new ApiError(
        500,
        "Failed to resolve permissions",
        permissionsError.message
      );
    }
    const validIds = new Set((permissions ?? []).map((row) => row.id));
    const missing = resolvedPermissionIds.filter((idValue) => !validIds.has(idValue));
    if (missing.length) {
      throw new ApiError(400, "Unknown permission ids");
    }
  }

  const { error: updateError } = await supabaseAdmin
    .from("roles")
    .update({
      name,
      description: description || null,
      updated_by: actor.userId,
    })
    .eq("id", roleId);
  if (updateError) {
    throw new ApiError(400, "Failed to update role", updateError.message);
  }

  const { error: clearError } = await supabaseAdmin
    .from("role_permissions")
    .delete()
    .eq("role_id", roleId);
  if (clearError) {
    throw new ApiError(400, "Failed to reset role permissions", clearError.message);
  }

  if (resolvedPermissionIds.length) {
    const rows = resolvedPermissionIds.map((permissionId) => ({
      role_id: roleId,
      permission_id: permissionId,
      created_by: actor.userId,
    }));
    const { error: rolePermissionsError } = await supabaseAdmin
      .from("role_permissions")
      .insert(rows);
    if (rolePermissionsError) {
      throw new ApiError(
        400,
        "Failed to assign permissions",
        rolePermissionsError.message
      );
    }
  }

  await logAuditEvent({
    actorId: actor.userId,
    action: "role.update",
    targetTable: "roles",
    targetId: roleId,
    metadata: {
      name,
      permission_count: resolvedPermissionIds.length,
    },
  });

  return Response.json({ ok: true });
}

export async function deleteRole(request, { id }) {
  const actor = await requireAdmin(request);
  const roleId = normalizeString(id);
  if (!roleId) {
    throw new ApiError(400, "role id is required");
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: role, error: roleError } = await supabaseAdmin
    .from("roles")
    .select("id, is_system")
    .eq("id", roleId)
    .maybeSingle();
  if (roleError) {
    throw new ApiError(500, "Failed to load role", roleError.message);
  }
  if (!role) {
    throw new ApiError(404, "Role not found");
  }
  if (role.is_system) {
    throw new ApiError(403, "System role cannot be deleted");
  }

  const { count, error: userRoleError } = await supabaseAdmin
    .from("user_roles")
    .select("user_id", { count: "exact", head: true })
    .eq("role_id", roleId);
  if (userRoleError) {
    throw new ApiError(500, "Failed to check role usage", userRoleError.message);
  }
  if ((count ?? 0) > 0) {
    throw new ApiError(409, "Role is assigned to users");
  }

  const { error: deleteError } = await supabaseAdmin
    .from("roles")
    .delete()
    .eq("id", roleId);
  if (deleteError) {
    throw new ApiError(400, "Failed to delete role", deleteError.message);
  }

  await logAuditEvent({
    actorId: actor.userId,
    action: "role.delete",
    targetTable: "roles",
    targetId: roleId,
  });

  return Response.json({ ok: true });
}
