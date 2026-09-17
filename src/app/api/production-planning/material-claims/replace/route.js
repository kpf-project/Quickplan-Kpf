import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeMasterPlanNo } from "@/lib/planNo";
import { normalizeParam } from "@/lib/validation";
import { buildClaimPoolRows } from "@/lib/materialClaimPool";
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

function isSameQty(left, right) {
  return Math.abs(Number(left || 0) - Number(right || 0)) < 0.0005;
}

export async function POST(request) {
  try {
    const permission = await requirePermissionKeys(request, [
      "production-line-planning-manage",
      "plan.claim_material",
      "plan.release_claim",
      "plan.edit_own_dept",
    ]);

    const body = await readJson(request);
    const inputMasterPlanNo = normalizeParam(body?.masterPlanNo || body?.planNo);
    const masterPlanNo = normalizeMasterPlanNo(inputMasterPlanNo);
    const currentMaterialSkuCode = normalizeSku(body?.currentMaterialSkuCode || body?.materialSkuCode);
    const currentMaterialGoodsCode = normalizeGoodsCode(
      body?.currentMaterialGoodsCode || body?.materialGoodsCode,
      currentMaterialSkuCode
    );
    const targetMaterialSkuCode = normalizeSku(body?.targetMaterialSkuCode || body?.nextMaterialSkuCode);
    const targetMaterialGoodsCode = normalizeGoodsCode(
      body?.targetMaterialGoodsCode || body?.nextMaterialGoodsCode,
      targetMaterialSkuCode
    );
    const grain = normalizeClaimGrain(
      body?.grain || body?.bucket || body?.claimMode || body?.mode,
      "daily"
    );
    const ownerDepartmentId = normalizeParam(body?.ownerDepartmentId);
    const demandSource = normalizeDemandSource(body?.demandSource);
    const inputDate = normalizeDateOnly(body?.workDate || body?.bucketDate || body?.weekStartDate);
    const bucketDate = bucketDateForWorkDate(inputDate, grain);
    const issueQty = Number(body?.issueQty);
    const note = normalizeParam(body?.note) || null;
    const reason = normalizeParam(body?.reason) || "manual_material_adjustment";

    if (!inputMasterPlanNo || !masterPlanNo) {
      return NextResponse.json({ error: "Valid masterPlanNo is required" }, { status: 400 });
    }
    if (!currentMaterialSkuCode || !targetMaterialSkuCode) {
      return NextResponse.json({ error: "Current and target material codes are required" }, { status: 400 });
    }
    if (!ownerDepartmentId) {
      return NextResponse.json({ error: "ownerDepartmentId is required" }, { status: 400 });
    }
    if (!bucketDate) {
      return NextResponse.json({ error: "Valid workDate/weekStartDate is required" }, { status: 400 });
    }
    if (!Number.isFinite(issueQty) || issueQty < 0) {
      return NextResponse.json({ error: "Valid issueQty is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const [claimScope, releaseScope] = await Promise.all([
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
    ]);

    const queue = await buildClaimPoolRows(supabaseAdmin, {
      masterPlanNo,
      grain,
      dateFrom: bucketDate,
      dateTo: bucketDate,
    });

    const currentRow = (queue.rows || []).find(
      (row) =>
        row.materialSkuCode === currentMaterialSkuCode
        && String(row.materialGoodsCode || row.materialSkuCode) === currentMaterialGoodsCode
        && row.bucketDate === bucketDate
        && String(row.ownerDepartmentId || "").trim() === ownerDepartmentId
        && normalizeDemandSource(row.demandSource) === demandSource
    );
    if (!currentRow || currentRow.claimStatus !== "claimed" || !currentRow.claimDepartmentId) {
      return NextResponse.json(
        {
          error: "Current claimed row not found",
          details: { masterPlanNo, currentMaterialSkuCode, bucketDate },
        },
        { status: 404 }
      );
    }

    const currentClaimDepartmentId = String(currentRow.claimDepartmentId || "").trim();
    if (
      !releaseScope.canManageGlobal
      && !(releaseScope.departmentIds || []).includes(currentClaimDepartmentId)
    ) {
      return NextResponse.json(
        { error: "Department scope violation", details: { departmentId: currentClaimDepartmentId } },
        { status: 403 }
      );
    }
    if (
      !claimScope.canManageGlobal
      && !(claimScope.departmentIds || []).includes(currentClaimDepartmentId)
    ) {
      return NextResponse.json(
        { error: "Department scope violation", details: { departmentId: currentClaimDepartmentId } },
        { status: 403 }
      );
    }

    const currentSourceRowKey = buildMaterialSourceRowKey({
      masterPlanNo,
      grain,
      bucketDate,
      materialSkuCode: currentMaterialSkuCode,
      materialGoodsCode: currentMaterialGoodsCode,
      ownerDepartmentId,
      demandSource,
    });
    const currentGroupItems = await loadActiveGroupItemsBySourceKeys(supabaseAdmin, [currentSourceRowKey]);
    if (currentGroupItems.length > 0) {
      return NextResponse.json(
        { error: "Cannot change a row that already belongs to a requisition group" },
        { status: 409 }
      );
    }

    const targetRow = (queue.rows || []).find(
      (row) =>
        row.materialSkuCode === targetMaterialSkuCode
        && String(row.materialGoodsCode || row.materialSkuCode) === targetMaterialGoodsCode
        && row.bucketDate === bucketDate
        && String(row.ownerDepartmentId || "").trim() === ownerDepartmentId
        && normalizeDemandSource(row.demandSource) === demandSource
    );
    if (!targetRow) {
      return NextResponse.json(
        {
          error: "Target material row not found for this plan/date bucket",
          details: { masterPlanNo, targetMaterialSkuCode, bucketDate },
        },
        { status: 404 }
      );
    }

    const targetSourceRowKey = buildMaterialSourceRowKey({
      masterPlanNo,
      grain,
      bucketDate,
      materialSkuCode: targetMaterialSkuCode,
      materialGoodsCode: targetMaterialGoodsCode,
      ownerDepartmentId,
      demandSource,
    });
    if (targetSourceRowKey !== currentSourceRowKey) {
      const targetGroupItems = await loadActiveGroupItemsBySourceKeys(supabaseAdmin, [targetSourceRowKey]);
      if (targetGroupItems.length > 0) {
        return NextResponse.json(
          { error: "Target material row already belongs to a requisition group" },
          { status: 409 }
        );
      }
      if (targetRow.claimStatus === "claimed") {
        return NextResponse.json(
          { error: "Target material row has already been claimed" },
          { status: 409 }
        );
      }
    }

    const table = claimTableName(grain);
    const currentKeyPayload =
      grain === "weekly"
        ? {
            master_plan_no: masterPlanNo,
            material_sku_code: currentMaterialSkuCode,
            material_goods_code: currentMaterialGoodsCode,
            week_start_date: bucketDate,
            owner_department_id: ownerDepartmentId,
            demand_source: demandSource,
          }
        : {
            master_plan_no: masterPlanNo,
            material_sku_code: currentMaterialSkuCode,
            material_goods_code: currentMaterialGoodsCode,
            work_date: bucketDate,
            owner_department_id: ownerDepartmentId,
            demand_source: demandSource,
          };

    const targetKeyPayload =
      grain === "weekly"
        ? {
            master_plan_no: masterPlanNo,
            material_sku_code: targetMaterialSkuCode,
            material_goods_code: targetMaterialGoodsCode,
            week_start_date: bucketDate,
            owner_department_id: ownerDepartmentId,
            demand_source: demandSource,
          }
        : {
            master_plan_no: masterPlanNo,
            material_sku_code: targetMaterialSkuCode,
            material_goods_code: targetMaterialGoodsCode,
            work_date: bucketDate,
            owner_department_id: ownerDepartmentId,
            demand_source: demandSource,
          };

    const targetOverrideIssueQty = isSameQty(issueQty, targetRow.demandIssueQty) ? null : issueQty;
    const nowIso = new Date().toISOString();

    if (targetSourceRowKey !== currentSourceRowKey) {
      const releaseResult = await supabaseAdmin
        .from(table)
        .update({
          status: "released",
          note: note ?? currentRow.claimNote ?? null,
          released_by: permission.userId,
          released_at: nowIso,
          updated_by: permission.userId,
        })
        .match(currentKeyPayload)
        .eq("status", "claimed")
        .select("*")
        .maybeSingle();
      if (releaseResult.error) {
        return NextResponse.json({ error: releaseResult.error.message }, { status: 500 });
      }
    }

    const targetUpsertResult = await supabaseAdmin
      .from(table)
      .upsert({
        ...targetKeyPayload,
        department_id: currentClaimDepartmentId,
        owner_department_id: ownerDepartmentId,
        status: "claimed",
        source: "manual_replace",
        note: note ?? currentRow.claimNote ?? null,
        claimed_by: permission.userId,
        claimed_at: nowIso,
        released_by: null,
        released_at: null,
        override_issue_qty: targetOverrideIssueQty,
        updated_by: permission.userId,
        created_by: permission.userId,
      }, {
        onConflict: grain === "weekly"
          ? "master_plan_no,material_sku_code,material_goods_code,week_start_date,owner_department_id,demand_source"
          : "master_plan_no,material_sku_code,material_goods_code,work_date,owner_department_id,demand_source",
      })
      .select("*")
      .maybeSingle();
    if (targetUpsertResult.error) {
      return NextResponse.json({ error: targetUpsertResult.error.message }, { status: 500 });
    }

    await supabaseAdmin
      .from("production_material_claim_events")
      .insert({
        claim_grain: grain,
        action: "replace_material",
        master_plan_no: masterPlanNo,
        material_sku_code: targetMaterialSkuCode,
        material_goods_code: targetMaterialGoodsCode,
        bucket_date: bucketDate,
        owner_department_id: ownerDepartmentId,
        demand_source: demandSource,
        from_department_id: currentClaimDepartmentId,
        to_department_id: currentClaimDepartmentId,
        actor_id: permission.userId,
        reason,
        metadata: {
          previousMaterialSkuCode: currentMaterialSkuCode,
          previousMaterialGoodsCode: currentMaterialGoodsCode,
          previousIssueQty: currentRow.issueQty,
          nextIssueQty: issueQty,
          overrideIssueQty: targetOverrideIssueQty,
          note: note ?? currentRow.claimNote ?? null,
        },
      });

    return NextResponse.json(
      {
        ok: true,
        data: {
          grain,
          claim: targetUpsertResult.data,
          issueQty,
          demandIssueQty: targetRow.demandIssueQty,
          isOverrideActive: targetOverrideIssueQty !== null,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return jsonError(error);
  }
}
