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
  const permissions = data ?? [];

  return Response.json({ permissions, task_permissions_enabled: process.env.ROLE_TASK_PERMISSIONS_ENABLED === "true" });
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
