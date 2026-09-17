import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";

export const dynamic = "force-dynamic";

function normalizeParam(value) {
  return String(value || "").trim() || null;
}

// GET /api/production-planning/schedule/plan-detail?masterPlanNo=...&deptId=...
// Returns sub-plan + claimed materials for one dept under a master plan.
export async function GET(request) {
  try {
    await requirePermissionKeys(request, [
      "production-line-planning-view",
      "production-line-planning-manage",
    ]);

    const sp = new URL(request.url).searchParams;
    const masterPlanNo = normalizeParam(sp.get("masterPlanNo") || sp.get("planNo"));
    const deptId = normalizeParam(sp.get("deptId"));

    if (!masterPlanNo) {
      return NextResponse.json({ error: "masterPlanNo is required" }, { status: 400 });
    }
    if (!deptId) {
      return NextResponse.json({ error: "deptId is required" }, { status: 400 });
    }

    const db = getSupabaseAdmin();

    const [subPlanResult, claimsResult] = await Promise.all([
      db
        .from("production_sub_plans")
        .select("id,sub_plan_no,master_plan_no,department_id,status,confirmed_at,confirmed_by_name,note,created_at")
        .eq("master_plan_no", masterPlanNo)
        .eq("department_id", deptId)
        .maybeSingle(),

      db
        .from("production_material_claims_daily")
        .select("id,material_sku_code,work_date,status,source,note,claimed_at")
        .eq("master_plan_no", masterPlanNo)
        .eq("department_id", deptId)
        .eq("status", "claimed")
        .order("material_sku_code", { ascending: true })
        .order("work_date", { ascending: true }),
    ]);

    if (subPlanResult.error) throw subPlanResult.error;
    if (claimsResult.error) throw claimsResult.error;

    // Group claims by material_sku_code → array of work_dates
    const rawClaims = claimsResult.data ?? [];
    const claimsByMaterial = [];
    const seen = new Map();
    for (const row of rawClaims) {
      const key = row.material_sku_code;
      if (!seen.has(key)) {
        seen.set(key, { materialSkuCode: key, workDates: [], claimedAt: row.claimed_at });
        claimsByMaterial.push(seen.get(key));
      }
      seen.get(key).workDates.push(row.work_date);
    }

    return NextResponse.json({
      ok: true,
      data: {
        subPlan: subPlanResult.data ?? null,
        claims: claimsByMaterial,
        totalClaimedMaterials: claimsByMaterial.length,
        totalClaimedDays: rawClaims.length,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
