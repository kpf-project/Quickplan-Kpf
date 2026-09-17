import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeParam, parsePaginationParams } from "@/lib/validation";

export async function GET(request) {
  try {
    await requirePermissionKeys(request, [
      "production-line-settings-view",
      "production-line-settings-manage",
    ]);

    const { searchParams } = new URL(request.url);
    const { page, pageSize } = parsePaginationParams(searchParams, { page: 1, pageSize: 20 });
    const search = normalizeParam(searchParams.get("search")) ?? "";
    const includeInactive = searchParams.get("includeInactive") === "true";

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    const supabaseAdmin = getSupabaseAdmin();
    let query = supabaseAdmin
      .from("profiles")
      .select(`
        id,
        username,
        is_active,
        department_id,
        departments (
          id,
          name
        )
      `, { count: "exact" })
      .order("username", { ascending: true })
      .range(from, to);

    if (!includeInactive) {
      query = query.eq("is_active", true);
    }
    if (search) {
      query = query.ilike("username", `%${search}%`);
    }

    const { data, error, count } = await query;
    if (error) {
      return Response.json({ error: "Failed to load users" }, { status: 500 });
    }

    const payload = (data ?? []).map((row) => ({
      id: row.id,
      username: row.username,
      is_active: row.is_active !== false,
      home_department: row.departments
        ? {
            id: row.departments.id,
            name: row.departments.name,
          }
        : null,
    }));

    return Response.json({
      data: payload,
      pagination: {
        page,
        pageSize,
        totalRecords: count ?? 0,
        totalPages: Math.max(1, Math.ceil((count ?? 0) / pageSize)),
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
