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
import {
  canEditAssignedDepartment,
  loadMaterialOwnerMap,
  loadVerifyEditorScope,
  resolveAssignedDepartment,
} from "@/lib/materialVerify";

export const dynamic = "force-dynamic";

function toRounded(value, digits = 3) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(digits));
}

function buildClaimKeyPayload({
  grain,
  masterPlanNo,
  materialSkuCode,
  materialGoodsCode,
  bucketDate,
  ownerDepartmentId,
  demandSource,
}) {
  if (grain === "weekly") {
    return {
      master_plan_no: masterPlanNo,
      material_sku_code: materialSkuCode,
      material_goods_code: materialGoodsCode,
      week_start_date: bucketDate,
      owner_department_id: ownerDepartmentId,
      demand_source: demandSource,
    };
  }

  return {
    master_plan_no: masterPlanNo,
    material_sku_code: materialSkuCode,
    material_goods_code: materialGoodsCode,
    work_date: bucketDate,
    owner_department_id: ownerDepartmentId,
    demand_source: demandSource,
  };
}

export async function POST(request) {
  try {
    const permission = await requirePermissionKeys(request, [
      "production-line-planning-manage",
      "plan.verify_materials",
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
    const assignedDepartmentId = normalizeParam(body?.materialOwnerDepartmentId || body?.assignedDepartmentId);
    const grain = normalizeClaimGrain(body?.grain || body?.bucket || body?.mode, "daily");
    const inputDate = normalizeDateOnly(body?.workDate || body?.bucketDate || body?.weekStartDate);
    const bucketDate = bucketDateForWorkDate(inputDate, grain);
    const note = normalizeParam(body?.note) || null;

    if (!masterPlanNo) {
      return NextResponse.json({ error: "Valid masterPlanNo is required" }, { status: 400 });
    }
    if (!currentMaterialSkuCode || !targetMaterialSkuCode) {
      return NextResponse.json({ error: "Current and target material codes are required" }, { status: 400 });
    }
    if (currentMaterialSkuCode === targetMaterialSkuCode && currentMaterialGoodsCode === targetMaterialGoodsCode) {
      return NextResponse.json({ error: "Please choose a different material" }, { status: 400 });
    }
    if (!assignedDepartmentId) {
      return NextResponse.json({ error: "materialOwnerDepartmentId is required" }, { status: 400 });
    }
    if (!bucketDate) {
      return NextResponse.json({ error: "Valid workDate/weekStartDate is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const [scope, ownerByMaterialKey] = await Promise.all([
      loadVerifyEditorScope(supabaseAdmin, permission.userId, permission.isAdmin),
      loadMaterialOwnerMap(supabaseAdmin),
    ]);

    if (!canEditAssignedDepartment(scope, assignedDepartmentId)) {
      return NextResponse.json(
        { error: "Only the configured material owner department or admin can edit this row" },
        { status: 403 }
      );
    }

    const queue = await buildClaimPoolRows(supabaseAdmin, {
      masterPlanNo,
      grain,
      dateFrom: bucketDate,
      dateTo: bucketDate,
    });

    const matchingRows = (queue.rawRows || []).filter((row) => {
      const assignedDepartment = resolveAssignedDepartment(row, ownerByMaterialKey);
      const rowSkuCode = normalizeSku(row?.materialSkuCode);
      const rowGoodsCode = normalizeGoodsCode(row?.materialGoodsCode || row?.materialSkuCode, rowSkuCode);
      return (
        row.bucketDate === bucketDate
        && rowSkuCode === currentMaterialSkuCode
        && rowGoodsCode === currentMaterialGoodsCode
        && String(assignedDepartment.departmentId || "").trim() === assignedDepartmentId
      );
    });

    if (!matchingRows.length) {
      return NextResponse.json({ error: "Current material row not found" }, { status: 404 });
    }

    if (matchingRows.some((row) => String(row?.claimStatus || "").trim().toLowerCase() === "claimed")) {
      return NextResponse.json({ error: "Claimed rows cannot be replaced" }, { status: 409 });
    }

    const currentSourceKeys = matchingRows.map((row) => String(row?.sourceRowKey || "").trim()).filter(Boolean);
    const currentGroupItems = await loadActiveGroupItemsBySourceKeys(supabaseAdmin, currentSourceKeys);
    if (currentGroupItems.length > 0) {
      return NextResponse.json(
        { error: "Cannot change material for a row that already belongs to a requisition group" },
        { status: 409 }
      );
    }

    const table = claimTableName(grain);
    const currentRowsResult = await supabaseAdmin
      .from(table)
      .select("*")
      .eq("master_plan_no", masterPlanNo)
      .eq(grain === "weekly" ? "week_start_date" : "work_date", bucketDate);
    if (currentRowsResult.error) {
      return NextResponse.json({ error: currentRowsResult.error.message }, { status: 500 });
    }
    const currentClaims = Array.isArray(currentRowsResult.data) ? currentRowsResult.data : [];

    const targetRawRows = (queue.rawRows || []).filter((row) => {
      const rowSkuCode = normalizeSku(row?.materialSkuCode);
      const rowGoodsCode = normalizeGoodsCode(row?.materialGoodsCode || row?.materialSkuCode, rowSkuCode);
      return (
        row.bucketDate === bucketDate
        && rowSkuCode === targetMaterialSkuCode
        && rowGoodsCode === targetMaterialGoodsCode
      );
    });

    const groupedRows = matchingRows.reduce((map, row) => {
      const ownerDepartmentId = String(row?.ownerDepartmentId || "").trim();
      const demandSource = normalizeDemandSource(row?.demandSource);
      if (!ownerDepartmentId || !demandSource) return map;
      const key = `${ownerDepartmentId}|${demandSource}`;
      if (!map.has(key)) {
        map.set(key, {
          ownerDepartmentId,
          demandSource,
          currentQty: 0,
        });
      }
      map.get(key).currentQty += Number(row?.issueQty || 0);
      return map;
    }, new Map());

    const persistedClaims = [];
    for (const group of groupedRows.values()) {
      const currentKeyPayload = buildClaimKeyPayload({
        grain,
        masterPlanNo,
        materialSkuCode: currentMaterialSkuCode,
        materialGoodsCode: currentMaterialGoodsCode,
        bucketDate,
        ownerDepartmentId: group.ownerDepartmentId,
        demandSource: group.demandSource,
      });

      const currentClaimRow = currentClaims.find((entry) => (
        String(entry?.owner_department_id || "").trim() === group.ownerDepartmentId
        && normalizeDemandSource(entry?.demand_source) === group.demandSource
        && normalizeSku(entry?.material_sku_code) === currentMaterialSkuCode
        && normalizeGoodsCode(entry?.material_goods_code || entry?.material_sku_code, entry?.material_sku_code) === currentMaterialGoodsCode
      )) || null;

      const targetBaseRow = targetRawRows.find((row) => {
        const ownerDepartmentId = String(row?.ownerDepartmentId || "").trim();
        const demandSource = normalizeDemandSource(row?.demandSource);
        return ownerDepartmentId === group.ownerDepartmentId && demandSource === group.demandSource;
      }) || null;

      const targetClaimRow = currentClaims.find((entry) => (
        String(entry?.owner_department_id || "").trim() === group.ownerDepartmentId
        && normalizeDemandSource(entry?.demand_source) === group.demandSource
        && normalizeSku(entry?.material_sku_code) === targetMaterialSkuCode
        && normalizeGoodsCode(entry?.material_goods_code || entry?.material_sku_code, entry?.material_sku_code) === targetMaterialGoodsCode
      )) || null;

      if (String(targetClaimRow?.status || "").trim().toLowerCase() === "claimed") {
        return NextResponse.json(
          { error: "Target material row has already been claimed" },
          { status: 409 }
        );
      }

      const targetSourceKey = buildMaterialSourceRowKey({
        masterPlanNo,
        grain,
        bucketDate,
        materialSkuCode: targetMaterialSkuCode,
        materialGoodsCode: targetMaterialGoodsCode,
        ownerDepartmentId: group.ownerDepartmentId,
        demandSource: group.demandSource,
      });
      const targetGroupItems = await loadActiveGroupItemsBySourceKeys(supabaseAdmin, [targetSourceKey]);
      if (targetGroupItems.length > 0) {
        return NextResponse.json(
          { error: "Target material row already belongs to a requisition group" },
          { status: 409 }
        );
      }

      const currentUpsertPayload = {
        ...currentKeyPayload,
        owner_department_id: group.ownerDepartmentId,
        department_id: currentClaimRow?.department_id || null,
        status: currentClaimRow?.status || "released",
        source: "material_verify_replace",
        override_issue_qty: 0,
        note: note ?? currentClaimRow?.note ?? null,
        claimed_by: currentClaimRow?.claimed_by || null,
        claimed_at: currentClaimRow?.claimed_at || null,
        released_by: currentClaimRow?.released_by || null,
        released_at: currentClaimRow?.released_at || null,
        updated_by: permission.userId,
      };
      if (!currentClaimRow?.id) {
        currentUpsertPayload.created_by = permission.userId;
      }

      const currentUpsertResult = await supabaseAdmin
        .from(table)
        .upsert(currentUpsertPayload, {
          onConflict: grain === "weekly"
            ? "master_plan_no,material_sku_code,material_goods_code,week_start_date,owner_department_id,demand_source"
            : "master_plan_no,material_sku_code,material_goods_code,work_date,owner_department_id,demand_source",
        })
        .select("*")
        .maybeSingle();
      if (currentUpsertResult.error) {
        return NextResponse.json({ error: currentUpsertResult.error.message }, { status: 500 });
      }

      const targetCurrentQty = Number(
        targetClaimRow?.override_issue_qty ?? targetBaseRow?.issueQty ?? targetClaimRow?.issue_qty ?? 0
      ) || 0;
      const targetOverrideIssueQty = toRounded(targetCurrentQty + group.currentQty);
      const targetKeyPayload = buildClaimKeyPayload({
        grain,
        masterPlanNo,
        materialSkuCode: targetMaterialSkuCode,
        materialGoodsCode: targetMaterialGoodsCode,
        bucketDate,
        ownerDepartmentId: group.ownerDepartmentId,
        demandSource: group.demandSource,
      });

      const targetUpsertPayload = {
        ...targetKeyPayload,
        owner_department_id: group.ownerDepartmentId,
        department_id: targetClaimRow?.department_id || null,
        status: targetClaimRow?.status || "released",
        source: "material_verify_replace",
        override_issue_qty: targetOverrideIssueQty,
        note: note ?? targetClaimRow?.note ?? null,
        claimed_by: targetClaimRow?.claimed_by || null,
        claimed_at: targetClaimRow?.claimed_at || null,
        released_by: targetClaimRow?.released_by || null,
        released_at: targetClaimRow?.released_at || null,
        updated_by: permission.userId,
      };
      if (!targetClaimRow?.id) {
        targetUpsertPayload.created_by = permission.userId;
      }

      const targetUpsertResult = await supabaseAdmin
        .from(table)
        .upsert(targetUpsertPayload, {
          onConflict: grain === "weekly"
            ? "master_plan_no,material_sku_code,material_goods_code,week_start_date,owner_department_id,demand_source"
            : "master_plan_no,material_sku_code,material_goods_code,work_date,owner_department_id,demand_source",
        })
        .select("*")
        .maybeSingle();
      if (targetUpsertResult.error) {
        return NextResponse.json({ error: targetUpsertResult.error.message }, { status: 500 });
      }

      persistedClaims.push(targetUpsertResult.data);
    }

    return NextResponse.json({
      ok: true,
      data: {
        grain,
        claims: persistedClaims,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
