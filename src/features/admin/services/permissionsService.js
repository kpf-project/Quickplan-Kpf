import {
  ApiError,
  getSupabaseAdmin,
  readJson,
  requireAdmin,
} from "@/lib/adminApi";
import { DEFAULT_PERMISSIONS } from "@/lib/permissionGroups";
import { logAuditEvent } from "@/lib/auditLog";

function normalizeString(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

export async function listPermissions(request) {
  await requireAdmin(request);
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("permissions")
    .select("id, perm_key, label, path, group_key, created_at, updated_at")
    .order("label", { ascending: true });
  if (error) {
    throw new ApiError(500, "Failed to load permissions", error.message);
  }
  let permissions = data ?? [];
  const existingKeys = new Set(permissions.map((permission) => permission.perm_key));
  const existingPaths = new Set(permissions.map((permission) => permission.path));
  const missingDefaults = DEFAULT_PERMISSIONS.filter(
    (permission) =>
      !existingKeys.has(permission.perm_key) &&
      !existingPaths.has(permission.path)
  );
  const uniqueMissing = new Map();
  missingDefaults.forEach((permission) => {
    if (!uniqueMissing.has(permission.path)) {
      uniqueMissing.set(permission.path, permission);
    }
  });
  const safeMissingDefaults = Array.from(uniqueMissing.values());

  if (safeMissingDefaults.length > 0) {
    const { error: syncError } = await supabaseAdmin
      .from("permissions")
      .upsert(
        safeMissingDefaults.map((permission) => ({
          perm_key: permission.perm_key,
          label: permission.label,
          path: permission.path,
          group_key: permission.group_key || null,
        })),
        { onConflict: "perm_key" }
      );

    if (syncError) {
      throw new ApiError(500, "Failed to sync permissions", syncError.message);
    }

    const { data: refreshed, error: refreshError } = await supabaseAdmin
      .from("permissions")
      .select("id, perm_key, label, path, group_key, created_at, updated_at")
      .order("label", { ascending: true });

    if (refreshError) {
      throw new ApiError(500, "Failed to reload permissions", refreshError.message);
    }

    permissions = refreshed ?? [];
  }

  return Response.json({ permissions });
}

export async function createPermission(request) {
  const actor = await requireAdmin(request);
  const body = await readJson(request);

  const permKey = normalizeString(body.perm_key);
  const label = normalizeString(body.label);
  const path = normalizeString(body.path);
  const groupKey = normalizeString(body.group_key);

  if (!permKey) {
    throw new ApiError(400, "perm_key is required");
  }
  if (!label) {
    throw new ApiError(400, "label is required");
  }
  if (!path) {
    throw new ApiError(400, "path is required");
  }

  const supabaseAdmin = getSupabaseAdmin();
  const { data: permission, error: permissionError } = await supabaseAdmin
    .from("permissions")
    .insert({
      perm_key: permKey,
      label,
      path,
      group_key: groupKey || null,
    })
    .select("id, perm_key, label, path, group_key")
    .single();

  if (permissionError) {
    throw new ApiError(
      400,
      "Failed to create permission",
      permissionError.message
    );
  }

  await logAuditEvent({
    actorId: actor.userId,
    action: "permission.create",
    targetTable: "permissions",
    targetId: permission.id,
    metadata: {
      perm_key: permission.perm_key,
      label: permission.label,
      path: permission.path,
      group_key: permission.group_key,
    },
  });

  return Response.json({ permission }, { status: 201 });
}
