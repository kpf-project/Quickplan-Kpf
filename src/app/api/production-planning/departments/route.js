import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/adminApi";
import { loadDepartmentMembership } from "@/lib/claimPermissions";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { getUserPermissions } from "@/lib/permissionsData";
import { getSessionFromRequest } from "@/lib/sessionToken";

async function hasPlanningManageAccess(request, userId, isAdmin = false) {
  if (isAdmin) return true;
  const session = getSessionFromRequest(request, userId);
  if (session?.isAdmin) return true;
  if (Array.isArray(session?.permissions)) {
    // "Manage" means global edit scope. Publishing/approving exceptions is not global edit.
    return session.permissions.includes("production-line-planning-manage");
  }
  const permissionResult = await getUserPermissions(userId);
  return Boolean(
    permissionResult?.isAdmin
      || permissionResult?.permissions?.includes("production-line-planning-manage")
  );
}

export async function GET(request) {
  const permission = await requirePermissionKeys(request, [
    "production-line-planning-view",
    "production-line-planning-manage",
    "plan.view_all",
    "plan.calculate_own_dept",
  ]);
  const supabaseAdmin = getSupabaseAdmin();
  const requestUrl = new URL(request.url);
  const scope = String(requestUrl.searchParams.get("scope") || "").trim().toLowerCase();
  const canManageGlobal = await hasPlanningManageAccess(
    request,
    permission.userId,
    permission.isAdmin
  );

  if (scope === "assigned") {
    // For admins, global managers, or users who can view all plans, "assigned" means everything.
    if (
      permission.isAdmin ||
      canManageGlobal ||
      permission.permissions?.includes("plan.view_all")
    ) {
      const { data, error } = await supabaseAdmin
        .from("production_departments")
        .select("id,code,name,is_central_department")
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name", { ascending: true });
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json({
        data: (data ?? []).map((row) => ({ ...row, scope: "all" })),
      }, { status: 200 });
    }

    const memberships = await loadDepartmentMembership(supabaseAdmin, permission.userId);
    const seen = new Set();
    const departmentIds = memberships
      .map((row) => String(row?.departmentId || "").trim())
      .filter((departmentId) => {
        if (!departmentId || seen.has(departmentId)) return false;
        seen.add(departmentId);
        return true;
      });

    if (departmentIds.length === 0) {
      return NextResponse.json({ data: [] }, { status: 200 });
    }

    const { data, error } = await supabaseAdmin
      .from("production_departments")
      .select("id,code,name,is_central_department")
      .in("id", departmentIds)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("name", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      data: (data ?? []).map((row) => ({ ...row, scope: "assigned" })),
    }, { status: 200 });
  }

  if (permission.isAdmin || canManageGlobal) {
    const { data, error } = await supabaseAdmin
      .from("production_departments")
      .select("id,code,name,is_central_department")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("name", { ascending: true });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({
      data: (data ?? []).map((row) => ({ ...row, scope: "all" })),
    }, { status: 200 });
  }

  const membershipResult = await supabaseAdmin
    .from("production_department_users")
    .select("department_id,role,production_departments(id,code,name,is_active,is_central_department,deleted_at)")
    .eq("user_id", permission.userId);
  if (membershipResult.error) {
    return NextResponse.json({ error: membershipResult.error.message }, { status: 500 });
  }

  const rows = (membershipResult.data ?? [])
    .filter((row) => row?.production_departments?.is_active && !row?.production_departments?.deleted_at)
    .map((row) => ({
      id: row?.production_departments?.id || row?.department_id,
      code: row?.production_departments?.code || null,
      name: row?.production_departments?.name || null,
      is_central_department: Boolean(row?.production_departments?.is_central_department),
      scope: row?.role || "viewer",
    }))
    .filter((row) => row.id)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

  return NextResponse.json({ data: rows }, { status: 200 });
}
