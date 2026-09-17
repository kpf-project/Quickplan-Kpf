import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeMasterPlanNo } from "@/lib/planNo";
import { normalizeParam } from "@/lib/validation";
import { buildClaimPoolRows } from "@/lib/materialClaimPool";
import { canConsolidateCrossQa, loadClaimScope } from "@/lib/claimPermissions";
import { normalizeClaimGrain } from "@/lib/materialClaims";

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
      "plan.release_claim",
      "plan.reassign_claim",
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

    if (!inputMasterPlanNo) {
      return NextResponse.json({ error: "masterPlanNo is required" }, { status: 400 });
    }
    if (!masterPlanNo) {
      return NextResponse.json({ error: "Invalid masterPlanNo format" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const [claimScope, releaseScope, reassignScope] = await Promise.all([
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

    const poolResult = await buildClaimPoolRows(supabaseAdmin, {
      masterPlanNo,
      grain,
      dateFrom,
      dateTo,
    });

    const claimDeptSet = new Set(claimScope.departmentIds || []);
    const releaseDeptSet = new Set(releaseScope.departmentIds || []);
    const reassignDeptSet = new Set(reassignScope.departmentIds || []);

    const claimedRows = (poolResult.rows || [])
      .filter((row) => row.claimStatus === "claimed")
      .filter((row) => {
        if (claimScope.canManageGlobal) return true;
        const departmentId = String(row.claimDepartmentId || "").trim();
        return (
          claimDeptSet.has(departmentId)
          || releaseDeptSet.has(departmentId)
          || reassignDeptSet.has(departmentId)
        );
      })
      .map((row) => {
        const departmentId = String(row.claimDepartmentId || "").trim();
        return {
          ...row,
          canClaim: true,
          canRelease:
            releaseScope.canManageGlobal || releaseDeptSet.has(departmentId),
          canReassign:
            reassignScope.canManageGlobal || reassignDeptSet.has(departmentId),
        };
      });

    return NextResponse.json(
      {
        data: claimedRows,
        meta: {
          masterPlanNo,
          grain,
          dateFrom,
          dateTo,
          totalRows: claimedRows.length,
          scope: {
            canManageGlobal: Boolean(claimScope.canManageGlobal),
            departmentIds: claimScope.departmentIds || [],
            canConsolidateCrossQa: canConsolidateCrossQa(permission),
          },
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return jsonError(error);
  }
}
