import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeMasterPlanNo } from "@/lib/planNo";
import { normalizeParam } from "@/lib/validation";
import { buildClaimPoolRows } from "@/lib/materialClaimPool";
import { canConsolidateCrossQa, loadClaimScope } from "@/lib/claimPermissions";
import { normalizeClaimGrain } from "@/lib/materialClaims";
import {
  loadMaterialOwnerMap,
  resolveAssignedDepartment,
} from "@/lib/materialVerify";
import { annotateRowsWithMaterialVerification } from "@/lib/materialVerifyConfirmations";

export const dynamic = "force-dynamic";

function normalizeDateOnly(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

export async function GET(request) {
  try {
    const permission = await requirePermissionKeys(request, [
      "production-line-planning-view",
      "production-line-planning-manage",
      "plan.view_all",
      "plan.calculate_own_dept",
      "plan.edit_own_dept",
      "plan.view_claim_all",
      "plan.consolidate_cross_qa",
      "plan.claim_material",
    ]);

    const { searchParams } = new URL(request.url);
    const inputMasterPlanNo = normalizeParam(
      searchParams.get("masterPlanNo") || searchParams.get("planNo")
    );
    const masterPlanNo = normalizeMasterPlanNo(inputMasterPlanNo);
    const grain = normalizeClaimGrain(
      searchParams.get("grain") || searchParams.get("bucket") || searchParams.get("exportMode"),
      "daily"
    );
    const dateFrom = normalizeDateOnly(searchParams.get("dateFrom"));
    const dateTo = normalizeDateOnly(searchParams.get("dateTo"));
    const filterDepartmentId = normalizeParam(searchParams.get("departmentId"));

    if (!inputMasterPlanNo) {
      return NextResponse.json({ error: "masterPlanNo is required" }, { status: 400 });
    }
    if (!masterPlanNo) {
      return NextResponse.json({ error: "Invalid masterPlanNo format" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const [viewScope, claimScope, releaseScope, reassignScope] = await Promise.all([
      loadClaimScope({
        supabaseAdmin,
        request,
        permission,
        action: "view",
      }),
      loadClaimScope({
        supabaseAdmin,
        request,
        permission,
        action: "claim",
      }),
      loadClaimScope({
        supabaseAdmin,
        request,
        permission,
        action: "release",
      }),
      loadClaimScope({
        supabaseAdmin,
        request,
        permission,
        action: "reassign",
      }),
    ]);

    const [poolResult, ownerByMaterialKey] = await Promise.all([
      buildClaimPoolRows(supabaseAdmin, {
        masterPlanNo,
        grain,
        dateFrom,
        dateTo,
      }),
      loadMaterialOwnerMap(supabaseAdmin),
    ]);

    const assignedRows = (poolResult.rows || []).map((row) => {
      const assignedDepartment = resolveAssignedDepartment(row, ownerByMaterialKey);
      return {
        ...row,
        assignedDepartmentId: assignedDepartment.departmentId,
        assignedDepartmentCode: assignedDepartment.departmentCode,
        assignedDepartmentName: assignedDepartment.departmentName,
      };
    });
    const verifiedRows = await annotateRowsWithMaterialVerification(supabaseAdmin, assignedRows, {
      masterPlanNo,
      grain,
    });

    const viewDeptSet = new Set(viewScope.departmentIds || []);
    const claimDeptSet = new Set(claimScope.departmentIds || []);
    const releaseDeptSet = new Set(releaseScope.departmentIds || []);
    const reassignDeptSet = new Set(reassignScope.departmentIds || []);
    const scopedRows = verifiedRows.filter((row) => {
      if (
        filterDepartmentId
        && row.claimStatus === "claimed"
        && row.claimDepartmentId !== filterDepartmentId
      ) {
        return false;
      }
      if (viewScope.canManageGlobal) return true;
      if (row.claimStatus !== "claimed") return true;
      return viewDeptSet.has(String(row.claimDepartmentId || "").trim());
    });

    const payload = scopedRows.map((row) => {
      const departmentId = String(row.claimDepartmentId || "").trim();
      const assignedDepartmentId = String(row.assignedDepartmentId || "").trim();
      const claimStatus = row.claimStatus === "claimed" ? "claimed" : "unassigned";
      const materialVerified = Boolean(row.materialVerified);
      const canRelease =
        claimStatus === "claimed"
        && (releaseScope.canManageGlobal || releaseDeptSet.has(departmentId));
      const canReassign =
        claimStatus === "claimed"
        && (reassignScope.canManageGlobal || reassignDeptSet.has(departmentId));
      return {
        ...row,
        materialVerified,
        materialVerificationStatus: materialVerified ? "verified" : "pending",
        canClaim: claimStatus !== "claimed" && materialVerified && (
          claimScope.canManageGlobal
          || (assignedDepartmentId && claimDeptSet.has(assignedDepartmentId))
        ),
        canRelease,
        canReassign,
      };
    });

    return NextResponse.json(
      {
        data: payload,
        meta: {
          masterPlanNo,
          grain,
          dateFrom,
          dateTo,
          summary: {
            totalRows: payload.length,
            claimedRows: payload.filter((row) => row.claimStatus === "claimed").length,
            unassignedRows: payload.filter((row) => row.claimStatus !== "claimed").length,
            sourcePlanRows: poolResult.planRows?.length || 0,
          },
          analytics: poolResult.analytics || {
            daily: { totals: [], byDepartment: [] },
            weekly: { totals: [], byDepartment: [] },
            range: { totalsByDepartment: [] },
          },
          scope: {
            canManageGlobal: Boolean(viewScope.canManageGlobal),
            viewDepartmentIds: viewScope.departmentIds || [],
            claimDepartmentIds: claimScope.departmentIds || [],
            canConsolidateCrossQa: canConsolidateCrossQa(permission),
          },
          filters: {
            departmentId: filterDepartmentId || null,
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return jsonError(error);
  }
}
