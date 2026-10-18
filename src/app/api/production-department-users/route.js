import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { normalizeParam } from "@/lib/validation";

const ALLOWED_SCOPE_ROLES = new Set(["viewer", "editor"]);

function normalizeUserEntries(body) {
  const rawEntries = Array.isArray(body.userEntries)
    ? body.userEntries
    : Array.isArray(body.userIds)
      ? body.userIds.map((userId) => ({ userId, role: "editor" }))
      : [];

  return rawEntries
    .map((entry) => {
      const userId = normalizeParam(entry?.userId ?? entry?.user_id);
      const roleValue = String(entry?.role || "editor").trim().toLowerCase();
      const role = ALLOWED_SCOPE_ROLES.has(roleValue) ? roleValue : "editor";
      if (!userId) return null;
      return { userId, role };
    })
    .filter(Boolean);
}

function normalizeUserIds(values) {
  if (!Array.isArray(values)) return [];
  return values.map((value) => normalizeParam(value)).filter(Boolean);
}

export async function GET(request) {
  try {
    await requireTaskPermission(request, "production-settings-department-users-view");

    const { searchParams } = new URL(request.url);
    const departmentId = normalizeParam(searchParams.get("departmentId"));
    if (!departmentId) {
      return Response.json({ error: "departmentId is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("production_department_users")
      .select(`
        user_id,
        role,
        created_at,
        profiles (
          id,
          username,
          department_id,
          is_active,
          departments (
            id,
            name
          )
        )
      `)
      .eq("department_id", departmentId)
      .order("created_at", { ascending: false });

    if (error) {
      return Response.json({ error: "Failed to load department users" }, { status: 500 });
    }

    const payload = (data ?? []).map((row) => ({
      user_id: row.user_id,
      role: row.role || "editor",
      created_at: row.created_at,
      username: row.profiles?.username || "",
      is_active: row.profiles?.is_active !== false,
      home_department: row.profiles?.departments
        ? {
            id: row.profiles.departments.id,
            name: row.profiles.departments.name,
          }
        : null,
    }));

    return Response.json({ data: payload });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const { userId: actorUserId } = await requireTaskPermission(request, "production-settings-department-users-create");

    const body = await readJson(request);
    const departmentId = normalizeParam(body.departmentId);
    const entries = normalizeUserEntries(body);

    if (!departmentId || !entries.length) {
      return Response.json({ error: "departmentId and userEntries are required" }, { status: 400 });
    }

    const rows = entries.map((entry) => ({
      department_id: departmentId,
      user_id: entry.userId,
      role: entry.role,
      created_by: actorUserId,
    }));

    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin
      .from("production_department_users")
      .upsert(rows, { onConflict: "department_id,user_id" });

    if (error) {
      return Response.json({ error: "Failed to assign users to department" }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request) {
  try {
    await requireTaskPermission(request, "production-settings-department-users-delete");

    const body = await readJson(request);
    const departmentId = normalizeParam(body.departmentId);
    const userIds = normalizeUserIds(body.userIds);

    if (!departmentId || !userIds.length) {
      return Response.json({ error: "departmentId and userIds are required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin
      .from("production_department_users")
      .delete()
      .eq("department_id", departmentId)
      .in("user_id", userIds);

    if (error) {
      return Response.json({ error: "Failed to remove users from department" }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
