import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeMasterPlanNo } from "@/lib/planNo";
import { normalizeParam } from "@/lib/validation";
import { buildClaimPoolRows } from "@/lib/materialClaimPool";
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
    const issueQty = Number(body?.issueQty);
    const note = normalizeParam(body?.note) || null;
    const reason = normalizeParam(body?.reason) || "manual_qty_adjustment";

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
    if (!Number.isFinite(issueQty) || issueQty < 0) {
      return NextResponse.json({ error: "Valid issueQty is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const queue = await buildClaimPoolRows(supabaseAdmin, {
      masterPlanNo,
      grain,
      dateFrom: bucketDate,
      dateTo: bucketDate,
    });
    const targetRow = (queue.rows || []).find(
      (row) =>
        row.materialSkuCode === materialSkuCode
        && String(row.materialGoodsCode || row.materialSkuCode) === materialGoodsCode
        && row.bucketDate === bucketDate
        && String(row.ownerDepartmentId || "").trim() === ownerDepartmentId
        && normalizeDemandSource(row.demandSource) === demandSource
    );
    if (!targetRow) {
      return NextResponse.json(
        {
          error: "Material row not found",
          details: { masterPlanNo, materialSkuCode, grain, bucketDate },
        },
        { status: 404 }
      );
    }
    if (targetRow.claimStatus === "claimed") {
      return NextResponse.json(
        {
          error: "Claimed rows cannot be edited",
          details: { masterPlanNo, materialSkuCode, grain, bucketDate },
        },
        { status: 409 }
      );
    }

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
        { error: "Cannot change quantity for a row that already belongs to a requisition group" },
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

    const overrideIssueQty = isSameQty(issueQty, targetRow.demandIssueQty) ? null : issueQty;
    const upsertPayload = {
      ...keyPayload,
      owner_department_id: ownerDepartmentId,
      department_id: currentResult.data?.department_id || null,
      status: currentResult.data?.status || "released",
      source: currentResult.data?.source || "manual_override",
      override_issue_qty: overrideIssueQty,
      note: note ?? targetRow.claimNote ?? null,
      claimed_by: currentResult.data?.claimed_by || null,
      claimed_at: currentResult.data?.claimed_at || null,
      released_by: currentResult.data?.released_by || null,
      released_at: currentResult.data?.released_at || null,
      updated_by: permission.userId,
    };
    if (!currentResult.data?.id) {
      upsertPayload.created_by = permission.userId;
    }

    const updateResult = await supabaseAdmin
      .from(table)
      .upsert(upsertPayload, {
        onConflict: grain === "weekly"
          ? "master_plan_no,material_sku_code,material_goods_code,week_start_date,owner_department_id,demand_source"
          : "master_plan_no,material_sku_code,material_goods_code,work_date,owner_department_id,demand_source",
      })
      .select("*")
      .maybeSingle();
    if (updateResult.error) {
      return NextResponse.json({ error: updateResult.error.message }, { status: 500 });
    }

    await supabaseAdmin
      .from("production_material_claim_events")
      .insert({
        claim_grain: grain,
        action: "update_qty",
        master_plan_no: masterPlanNo,
        material_sku_code: materialSkuCode,
        material_goods_code: materialGoodsCode,
        bucket_date: bucketDate,
        owner_department_id: ownerDepartmentId,
        demand_source: demandSource,
        from_department_id: null,
        to_department_id: null,
        actor_id: permission.userId,
        reason,
        metadata: {
          previousIssueQty: targetRow.issueQty,
          demandIssueQty: targetRow.demandIssueQty,
          overrideIssueQty,
          note: note ?? targetRow.claimNote ?? null,
        },
      });

    return NextResponse.json(
      {
        ok: true,
        data: {
          grain,
          claim: updateResult.data,
          issueQty,
          demandIssueQty: targetRow.demandIssueQty,
          isOverrideActive: overrideIssueQty !== null,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return jsonError(error);
  }
}
