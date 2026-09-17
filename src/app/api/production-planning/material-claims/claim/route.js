import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeMasterPlanNo } from "@/lib/planNo";
import { normalizeParam } from "@/lib/validation";
import { buildClaimPoolRows } from "@/lib/materialClaimPool";
import { loadClaimScope } from "@/lib/claimPermissions";
import {
  loadMaterialOwnerMap,
  resolveAssignedDepartment,
} from "@/lib/materialVerify";
import {
  annotateRowsWithMaterialVerification,
  normalizeVerifyDepartmentId,
} from "@/lib/materialVerifyConfirmations";
import {
  bucketDateForWorkDate,
  buildMaterialSourceRowKey,
  claimDateColumn,
  claimTableName,
  normalizeClaimGrain,
  normalizeDateOnly,
  normalizeDemandSource,
  normalizeGoodsCode,
  normalizeSku,
} from "@/lib/materialClaims";
import { loadActiveGroupItemsBySourceKeys } from "@/lib/requisitionGroups";

export const dynamic = "force-dynamic";

function addDays(dateValue, days) {
  const normalized = normalizeDateOnly(dateValue);
  if (!normalized) return null;
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

export async function POST(request) {
  try {
    const permission = await requirePermissionKeys(request, [
      "production-line-planning-manage",
      "plan.claim_material",
      "plan.edit_own_dept",
    ]);

    const body = await readJson(request);
    const inputMasterPlanNo = normalizeParam(body?.masterPlanNo || body?.planNo);
    const masterPlanNo = normalizeMasterPlanNo(inputMasterPlanNo);
    const sourceRowKey = normalizeParam(body?.sourceRowKey);
    const materialSkuCode = normalizeSku(body?.materialSkuCode || body?.skuCode);
    const materialGoodsCode = normalizeGoodsCode(body?.materialGoodsCode || body?.goodsCode, materialSkuCode);
    const grain = normalizeClaimGrain(
      body?.grain || body?.bucket || body?.claimMode || body?.mode,
      "daily"
    );
    const departmentId = normalizeParam(body?.departmentId);
    const ownerDepartmentId = normalizeParam(body?.ownerDepartmentId);
    const demandSource = normalizeDemandSource(body?.demandSource);
    const source = String(body?.source || "manual_claim").trim().toLowerCase();
    const note = normalizeParam(body?.note) || null;
    const reason = normalizeParam(body?.reason) || null;
    const inputDate = normalizeDateOnly(body?.workDate || body?.bucketDate || body?.weekStartDate);
    const bucketDate = bucketDateForWorkDate(inputDate, grain);

    if (!inputMasterPlanNo || !masterPlanNo) {
      return NextResponse.json({ error: "Valid masterPlanNo is required" }, { status: 400 });
    }
    if (!materialSkuCode) {
      return NextResponse.json({ error: "materialSkuCode is required" }, { status: 400 });
    }
    if (!departmentId) {
      return NextResponse.json({ error: "departmentId is required" }, { status: 400 });
    }
    if (!ownerDepartmentId) {
      return NextResponse.json({ error: "ownerDepartmentId is required" }, { status: 400 });
    }
    if (!bucketDate) {
      return NextResponse.json({ error: "Valid workDate/weekStartDate is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const claimScope = await loadClaimScope({
      supabaseAdmin,
      request,
      permission,
      action: "claim",
    });
    if (!claimScope.canManageGlobal && !(claimScope.departmentIds || []).includes(departmentId)) {
      return NextResponse.json(
        { error: "Department scope violation", details: { departmentId } },
        { status: 403 }
      );
    }

    const dateFrom = grain === "weekly" ? bucketDate : bucketDate;
    const dateTo = grain === "weekly" ? addDays(bucketDate, 6) : bucketDate;
    const [queue, ownerByMaterialKey] = await Promise.all([
      buildClaimPoolRows(supabaseAdmin, {
        masterPlanNo,
        grain,
        dateFrom,
        dateTo,
      }),
      loadMaterialOwnerMap(supabaseAdmin),
    ]);

    let targetRows;
    if (sourceRowKey) {
      const exactRow = (queue.rawRows || []).find(
        (row) => String(row?.sourceRowKey || "").trim() === sourceRowKey
      );
      if (!exactRow) {
        return NextResponse.json(
          {
            error: "Material demand row not found for this source row",
            details: { masterPlanNo, sourceRowKey, grain, bucketDate },
          },
          { status: 400 }
        );
      }
      targetRows = [exactRow];
    } else if (demandSource === "composite") {
      // For composite demand source, find all component rows (pre-merge)
      const componentRows = (queue.rawRows || []).filter(
        (row) =>
          row.materialSkuCode === materialSkuCode
          && String(row.materialGoodsCode || row.materialSkuCode) === materialGoodsCode
          && row.bucketDate === bucketDate
          && String(row.ownerDepartmentId || "").trim() === ownerDepartmentId
      );
      if (!componentRows.length) {
        return NextResponse.json(
          {
            error: "Material demand rows not found for composite claim",
            details: { masterPlanNo, materialSkuCode, grain, bucketDate },
          },
          { status: 400 }
        );
      }
      targetRows = componentRows;
    } else {
      // For regular demand sources, find the single matching row
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
            error: "Material demand row not found for this plan/date bucket",
            details: { masterPlanNo, materialSkuCode, grain, bucketDate },
          },
          { status: 400 }
        );
      }
      targetRows = [targetRow];
    }

    const assignedTargetRows = targetRows.map((row) => {
      const assignedDepartment = resolveAssignedDepartment(row, ownerByMaterialKey);
      return {
        ...row,
        assignedDepartmentId: assignedDepartment.departmentId,
        assignedDepartmentCode: assignedDepartment.departmentCode,
        assignedDepartmentName: assignedDepartment.departmentName,
      };
    });
    const verifiedTargetRows = await annotateRowsWithMaterialVerification(supabaseAdmin, assignedTargetRows, {
      masterPlanNo,
      grain,
    });
    const invalidAssignedRow = verifiedTargetRows.find((row) => (
      normalizeVerifyDepartmentId(row?.assignedDepartmentId) !== departmentId
    ));
    if (invalidAssignedRow) {
      return NextResponse.json(
        {
          error: "Department scope violation",
          details: {
            departmentId,
            assignedDepartmentId: normalizeVerifyDepartmentId(invalidAssignedRow?.assignedDepartmentId),
          },
        },
        { status: 403 }
      );
    }
    const pendingVerificationRow = verifiedTargetRows.find((row) => !row?.materialVerified);
    if (pendingVerificationRow) {
      return NextResponse.json(
        {
          error: "รอตรวจสอบวัตถุดิบ",
          details: {
            masterPlanNo,
            materialSkuCode: pendingVerificationRow?.materialSkuCode,
            materialGoodsCode: pendingVerificationRow?.materialGoodsCode,
            bucketDate: pendingVerificationRow?.bucketDate,
            assignedDepartmentId: pendingVerificationRow?.assignedDepartmentId,
          },
        },
        { status: 409 }
      );
    }
    targetRows = verifiedTargetRows;

    const table = claimTableName(grain);
    const dateColumn = claimDateColumn(grain);
    const nowIso = new Date().toISOString();
    const claimResults = [];

    for (const targetRow of targetRows) {
      const rowDemandSource = normalizeDemandSource(targetRow.demandSource);
      const targetMaterialSkuCode = normalizeSku(targetRow.materialSkuCode || materialSkuCode);
      const targetMaterialGoodsCode = normalizeGoodsCode(
        targetRow.materialGoodsCode || targetMaterialSkuCode,
        targetMaterialSkuCode
      );
      const targetOwnerDepartmentId = normalizeParam(targetRow.ownerDepartmentId || ownerDepartmentId);
      const targetBucketDate = bucketDateForWorkDate(targetRow.bucketDate || bucketDate, grain);
      const sourceRowKey = buildMaterialSourceRowKey({
        masterPlanNo,
        grain,
        bucketDate: targetBucketDate,
        materialSkuCode: targetMaterialSkuCode,
        materialGoodsCode: targetMaterialGoodsCode,
        ownerDepartmentId: targetOwnerDepartmentId,
        demandSource: rowDemandSource,
      });

      const activeGroupItems = await loadActiveGroupItemsBySourceKeys(supabaseAdmin, [sourceRowKey]);
      if (activeGroupItems.length > 0) {
        // For composite, skip rows already in a requisition group
        if (demandSource === "composite") continue;
        return NextResponse.json(
          { error: "This source row is already assigned to a requisition group" },
          { status: 409 }
        );
      }

      const keyPayload =
        grain === "weekly"
          ? {
            master_plan_no: masterPlanNo,
            material_sku_code: targetMaterialSkuCode,
            material_goods_code: targetMaterialGoodsCode,
            week_start_date: targetBucketDate,
            owner_department_id: targetOwnerDepartmentId,
            demand_source: rowDemandSource,
          }
          : {
            master_plan_no: masterPlanNo,
            material_sku_code: targetMaterialSkuCode,
            material_goods_code: targetMaterialGoodsCode,
            work_date: targetBucketDate,
            owner_department_id: targetOwnerDepartmentId,
            demand_source: rowDemandSource,
          };

      const existingResult = await supabaseAdmin
        .from(table)
        .select("id,department_id,status")
        .match(keyPayload)
        .maybeSingle();
      if (existingResult.error) {
        return NextResponse.json({ error: existingResult.error.message }, { status: 500 });
      }

      const existing = existingResult.data;
      const existingDeptId = String(existing?.department_id || "").trim();
      if (
        existing
        && existing?.status === "claimed"
        && existingDeptId
        && existingDeptId !== departmentId
      ) {
        // For composite, skip rows already claimed by another department
        if (demandSource === "composite") continue;
        return NextResponse.json(
          {
            error: "Already claimed by another department",
            details: {
              claimedDepartmentId: existingDeptId,
              masterPlanNo,
              materialSkuCode: targetMaterialSkuCode,
              bucketDate: targetBucketDate,
              ownerDepartmentId: targetOwnerDepartmentId,
            },
          },
          { status: 409 }
        );
      }

      const upsertPayload = {
        ...keyPayload,
        department_id: departmentId,
        owner_department_id: targetOwnerDepartmentId,
        status: "claimed",
        source: source === "auto_claim" || source === "fallback" ? source : "manual_claim",
        note,
        claimed_by: permission.userId,
        claimed_at: nowIso,
        released_by: null,
        released_at: null,
        updated_by: permission.userId,
      };
      if (!existing?.id) {
        upsertPayload.created_by = permission.userId;
      }

      const upsertResult = await supabaseAdmin
        .from(table)
        .upsert(upsertPayload, {
          onConflict: `master_plan_no,material_sku_code,material_goods_code,${dateColumn},owner_department_id,demand_source`,
        })
        .select("*")
        .maybeSingle();
      if (upsertResult.error) {
        return NextResponse.json({ error: upsertResult.error.message }, { status: 500 });
      }

      await supabaseAdmin
        .from("production_material_claim_events")
        .insert({
          claim_grain: grain,
          action: "claim",
          master_plan_no: masterPlanNo,
          material_sku_code: targetMaterialSkuCode,
          material_goods_code: targetMaterialGoodsCode,
          bucket_date: targetBucketDate,
          owner_department_id: targetOwnerDepartmentId,
          demand_source: rowDemandSource,
          from_department_id: existingDeptId || null,
          to_department_id: departmentId,
          actor_id: permission.userId,
          reason,
          metadata: {
            source: upsertPayload.source,
            note,
            demandIssueQty: targetRow.issueQty,
            demandRequiredQty: targetRow.requiredQty,
            isComposite: demandSource === "composite",
          },
        });

      claimResults.push({ demand: targetRow, claim: upsertResult.data });
    }

    if (demandSource === "composite") {
      return NextResponse.json(
        {
          ok: true,
          data: {
            grain,
            compositeResults: claimResults,
            claimedCount: claimResults.length,
          },
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          grain,
          claim: claimResults[0]?.claim,
          demand: claimResults[0]?.demand,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return jsonError(error);
  }
}
