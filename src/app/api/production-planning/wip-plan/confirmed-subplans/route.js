import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import {
  loadPlanningScopeByUser,
  normalizePlanningDepartmentId,
} from "@/lib/planningScope";

function normalizePlanNo(value) {
  return String(value || "").trim().toUpperCase();
}

function isConfirmedSubplan(row) {
  const status = String(row?.status || "").trim().toLowerCase();
  return status === "confirmed" || Boolean(row?.confirmed_at);
}

export async function GET(request) {
  try {
    const permission = await requirePermissionKeys(request, [
      "production-line-planning-view",
      "production-line-planning-manage",
      "plan.calculate_own_dept",
      "plan.edit_own_dept",
    ]);

    const { searchParams } = new URL(request.url);
    const inputDepartmentId = normalizePlanningDepartmentId(searchParams.get("departmentId"));

    const supabaseAdmin = getSupabaseAdmin();
    const scope = await loadPlanningScopeByUser(supabaseAdmin, request, permission);
    const editableDepartmentIds = Array.from(scope.editableDepartmentIdSet || []);
    const allowedDepartmentIds = scope.canManageGlobal
      ? (inputDepartmentId ? [inputDepartmentId] : [])
      : editableDepartmentIds;

    if (
      inputDepartmentId
      && !scope.canManageGlobal
      && !scope.editableDepartmentIdSet.has(inputDepartmentId)
    ) {
      return NextResponse.json(
        { error: "Department scope violation", details: { departmentId: inputDepartmentId } },
        { status: 403 }
      );
    }

    let query = supabaseAdmin
      .from("production_sub_plans")
      .select("master_plan_no,department_id,sub_plan_no,status,confirmed_at")
      .not("master_plan_no", "is", null)
      .order("confirmed_at", { ascending: false });

    if (inputDepartmentId) {
      query = query.eq("department_id", inputDepartmentId);
    } else if (allowedDepartmentIds.length) {
      query = query.in("department_id", allowedDepartmentIds);
    } else if (!scope.canManageGlobal) {
      return NextResponse.json({ data: [], meta: { total: 0 } });
    }

    const result = await query;
    if (result.error) {
      throw result.error;
    }

    const rows = (Array.isArray(result.data) ? result.data : [])
      .filter(isConfirmedSubplan)
      .map((row) => ({
        masterPlanNo: normalizePlanNo(row?.master_plan_no),
        departmentId: normalizePlanningDepartmentId(row?.department_id),
        subPlanNo: normalizePlanNo(row?.sub_plan_no),
        status: String(row?.status || "").trim().toLowerCase() || null,
        confirmedAt: row?.confirmed_at || null,
      }))
      .filter((row) => row.masterPlanNo && row.departmentId);

    return NextResponse.json({
      data: rows,
      meta: { total: rows.length },
    });
  } catch (error) {
    return jsonError(error);
  }
}
