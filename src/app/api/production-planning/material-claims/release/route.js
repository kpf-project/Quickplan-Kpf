import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeMasterPlanNo } from "@/lib/planNo";
import { normalizeParam } from "@/lib/validation";
import { loadClaimScope } from "@/lib/claimPermissions";
import {
  bucketDateForWorkDate,
  buildMaterialSourceRowKey,
  claimTableName,
  normalizeClaimGrain,
  normalizeDateOnly,
  normalizeDemandSource,
  normalizeGoodsCode,
  normalizeSku,
} from "@/lib/materialClaims";
import { loadActiveGroupItemsBySourceKeys } from "@/lib/requisitionGroups";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const permission = await requirePermissionKeys(request, [
      "production-line-planning-manage",
      "plan.release_claim",
      "plan.edit_own_dept",
    ]);

    const body = await readJson(request);
    const inputMasterPlanNo = normalizeParam(body?.masterPlanNo || body?.planNo);
    const masterPlanNo = normalizeMasterPlanNo(inputMasterPlanNo);
    const materialSkuCode = normalizeSku(body?.materialSkuCode || body?.skuCode);
    const materialGoodsCode = normalizeGoodsCode(body?.materialGoodsCode || body?.goodsCode, materialSkuCode);
    const grain = normalizeClaimGrain(
      body?.grain || body?.bucket || body?.claimMode || body?.mode,
      "daily"
    );
    const ownerDepartmentId = normalizeParam(body?.ownerDepartmentId);
    const demandSource = normalizeDemandSource(body?.demandSource);
    const inputDate = normalizeDateOnly(body?.workDate || body?.bucketDate || body?.weekStartDate);
    const bucketDate = bucketDateForWorkDate(inputDate, grain);
    const reason = normalizeParam(body?.reason) || null;
    const note = normalizeParam(body?.note) || null;

    if (!inputMasterPlanNo || !masterPlanNo) {
      return NextResponse.json({ error: "Valid masterPlanNo is required" }, { status: 400 });
    }
    if (!materialSkuCode) {
      return NextResponse.json({ error: "materialSkuCode is required" }, { status: 400 });
    }
    if (!ownerDepartmentId) {
      return NextResponse.json({ error: "ownerDepartmentId is required" }, { status: 400 });
    }
    if (!bucketDate) {
      return NextResponse.json({ error: "Valid workDate/weekStartDate is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const releaseScope = await loadClaimScope({
      supabaseAdmin,
      request,
      permission,
      action: "release",
    });

    const sourceRowKey = buildMaterialSourceRowKey({
      masterPlanNo,
      grain,
      bucketDate,
      materialSkuCode,
      materialGoodsCode,
      ownerDepartmentId,
      demandSource,
    });
    const activeGroupItems = await loadActiveGroupItemsBySourceKeys(supabaseAdmin, [sourceRowKey]);
    if (activeGroupItems.length > 0) {
      return NextResponse.json(
        { error: "Cannot release a row that already belongs to a requisition group" },
        { status: 409 }
      );
    }

    const table = claimTableName(grain);
    const keyPayload =
      grain === "weekly"
        ? {
          master_plan_no: masterPlanNo,
          material_sku_code: materialSkuCode,
          material_goods_code: materialGoodsCode,
          week_start_date: bucketDate,
          owner_department_id: ownerDepartmentId,
          demand_source: demandSource,
        }
      : {
          master_plan_no: masterPlanNo,
          material_sku_code: materialSkuCode,
          material_goods_code: materialGoodsCode,
          work_date: bucketDate,
          owner_department_id: ownerDepartmentId,
          demand_source: demandSource,
        };

    const currentResult = await supabaseAdmin
      .from(table)
      .select("*")
      .match(keyPayload)
      .maybeSingle();
    if (currentResult.error) {
      return NextResponse.json({ error: currentResult.error.message }, { status: 500 });
    }
    if (!currentResult.data || currentResult.data.status !== "claimed") {
      return NextResponse.json(
        {
          error: "Active claim not found",
          details: { masterPlanNo, materialSkuCode, grain, bucketDate },
        },
        { status: 404 }
      );
    }

    const currentDeptId = String(currentResult.data?.department_id || "").trim();
    if (
      !releaseScope.canManageGlobal
      && !(releaseScope.departmentIds || []).includes(currentDeptId)
    ) {
      return NextResponse.json(
        { error: "Department scope violation", details: { departmentId: currentDeptId } },
        { status: 403 }
      );
    }

    const nowIso = new Date().toISOString();
    const updateResult = await supabaseAdmin
      .from(table)
      .update({
        status: "released",
        note: note || currentResult.data?.note || null,
        released_by: permission.userId,
        released_at: nowIso,
        updated_by: permission.userId,
      })
      .match(keyPayload)
      .select("*")
      .maybeSingle();
    if (updateResult.error) {
      return NextResponse.json({ error: updateResult.error.message }, { status: 500 });
    }

    await supabaseAdmin
      .from("production_material_claim_events")
      .insert({
        claim_grain: grain,
        action: "release",
        master_plan_no: masterPlanNo,
        material_sku_code: materialSkuCode,
        material_goods_code: materialGoodsCode,
        bucket_date: bucketDate,
        owner_department_id: ownerDepartmentId,
        demand_source: demandSource,
        from_department_id: currentDeptId || null,
        to_department_id: null,
        actor_id: permission.userId,
        reason,
        metadata: {
          previousStatus: currentResult.data?.status || null,
          note: note || null,
        },
      });

    return NextResponse.json(
      {
        ok: true,
        data: {
          grain,
          claim: updateResult.data,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return jsonError(error);
  }
}
