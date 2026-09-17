import "server-only";

import { ApiError, getSupabaseAdmin } from "@/lib/adminApi";

const ADMIN_ROLE_KEY = "admin";
const ADMIN_ROLE_CACHE_MS = 5 * 60 * 1000;
const USER_PERMISSION_CACHE_MS = 2 * 60 * 1000;
const ALL_PERMISSION_CACHE_MS = 5 * 60 * 1000;
const PATH_PERMISSION_CACHE_MS = 5 * 60 * 1000;

let cachedAdminRoleId = null;
let cachedAdminRoleCheckedAt = 0;
let cachedAllPermissions = null;
let cachedAllPermissionsCheckedAt = 0;
const userPermissionCache = new Map();
const pathPermissionCache = new Map();

async function getAdminRoleId(supabaseAdmin) {
  const now = Date.now();
  if (cachedAdminRoleId && now - cachedAdminRoleCheckedAt < ADMIN_ROLE_CACHE_MS) {
    return cachedAdminRoleId;
  }

  const { data: adminRole, error: adminRoleError } = await supabaseAdmin
    .from("roles")
    .select("id")
    .eq("role_key", ADMIN_ROLE_KEY)
    .maybeSingle();

  if (adminRoleError || !adminRole) {
    throw new ApiError(500, "Admin role not configured");
  }

  cachedAdminRoleId = adminRole.id;
  cachedAdminRoleCheckedAt = now;
  return adminRole.id;
}

async function getAllPermissionKeys(supabaseAdmin) {
  const now = Date.now();
  if (
    cachedAllPermissions &&
    now - cachedAllPermissionsCheckedAt < ALL_PERMISSION_CACHE_MS
  ) {
    return cachedAllPermissions;
  }

  const { data: permissions, error: permissionsError } = await supabaseAdmin
    .from("permissions")
    .select("perm_key");
  if (permissionsError) {
    throw new ApiError(500, "Failed to load permissions", permissionsError.message);
  }

  cachedAllPermissions = (permissions ?? []).map((item) => item.perm_key);
  cachedAllPermissionsCheckedAt = now;
  return cachedAllPermissions;
}

export async function getUserPermissions(userId) {
  const now = Date.now();
  const cached = userPermissionCache.get(userId);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  const supabaseAdmin = getSupabaseAdmin();
  const adminRoleId = await getAdminRoleId(supabaseAdmin);

  const { data: userRoles, error: userRolesError } = await supabaseAdmin
    .from("user_roles")
    .select("role_id")
    .eq("user_id", userId);
  if (userRolesError) {
    throw new ApiError(500, "Failed to load user roles", userRolesError.message);
  }

  const roleIds = (userRoles ?? []).map((role) => role.role_id);
  const isAdmin = roleIds.includes(adminRoleId);

  let permissions = [];
  if (isAdmin) {
    permissions = await getAllPermissionKeys(supabaseAdmin);
  } else if (roleIds.length) {
    const { data: rolePermissions, error: rolePermissionsError } =
      await supabaseAdmin
        .from("role_permissions")
        .select("permission_id")
        .in("role_id", roleIds);
    if (rolePermissionsError) {
      throw new ApiError(
        500,
        "Failed to load role permissions",
        rolePermissionsError.message
      );
    }

    const permissionIds = Array.from(
      new Set((rolePermissions ?? []).map((row) => row.permission_id))
    );

    if (permissionIds.length) {
      const { data: permissionRows, error: permissionError } = await supabaseAdmin
        .from("permissions")
        .select("perm_key")
        .in("id", permissionIds);
      if (permissionError) {
        throw new ApiError(
          500,
          "Failed to load permissions",
          permissionError.message
        );
      }
      permissions = (permissionRows ?? []).map((row) => row.perm_key);
    }
  }

  const data = { permissions, isAdmin };
  userPermissionCache.set(userId, {
    data,
    expiresAt: now + USER_PERMISSION_CACHE_MS,
  });
  return data;
}

export async function resolvePermissionKeyByPath(path) {
  const now = Date.now();
  const cached = pathPermissionCache.get(path);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: permission, error: permissionError } = await supabaseAdmin
    .from("permissions")
    .select("perm_key")
    .eq("path", path)
    .maybeSingle();
  if (permissionError) {
    throw new ApiError(500, "Failed to resolve permission", permissionError.message);
  }

  const value = permission?.perm_key ?? null;
  pathPermissionCache.set(path, {
    value,
    expiresAt: now + PATH_PERMISSION_CACHE_MS,
  });
  return value;
}
