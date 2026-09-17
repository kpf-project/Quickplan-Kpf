import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeMasterPlanNo } from "@/lib/planNo";
import { normalizeParam } from "@/lib/validation";
import { buildClaimPoolRows } from "@/lib/materialClaimPool";
import {
  canEditAssignedDepartment,
  loadMaterialOwnerMap,
  loadVerifyEditorScope,
  resolveAssignedDepartment,
} from "@/lib/materialVerify";
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
import {
  isMissingMaterialVerificationTableError,
  normalizeVerifyDepartmentId,
} from "@/lib/materialVerifyConfirmations";
import { loadActiveGroupItemsBySourceKeys } from "@/lib/requisitionGroups";

export const dynamic = "force-dynamic";

function isSameQty(left, right) {
  return Math.abs(Number(left || 0) - Number(right || 0)) < 0.0005;
}

function toRounded(value, digits = 3) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(digits));
}

function distributeQty(totalQty, rows) {
  const targets = Array.isArray(rows) ? rows : [];
  if (!targets.length) return [];

  const basisTotal = targets.reduce((sum, row) => {
    const basis = Number(row?.demandIssueQty ?? row?.issueQty ?? 0);
    return sum + (Number.isFinite(basis) && basis > 0 ? basis : 0);
  }, 0);

  if (targets.length === 1) {
    return [{ row: targets[0], issueQty: toRounded(totalQty) }];
  }

  if (basisTotal <= 0) {
    const evenQty = toRounded(totalQty / targets.length);
    let running = 0;
    return targets.map((row, index) => {
      const issueQty = index === targets.length - 1
        ? toRounded(totalQty - running)
        : evenQty;
      running += issueQty;
      return { row, issueQty };
    });
  }

  let running = 0;
  return targets.map((row, index) => {
    if (index === targets.length - 1) {
      return { row, issueQty: toRounded(totalQty - running) };
    }
    const basis = Number(row?.demandIssueQty ?? row?.issueQty ?? 0);
    const ratio = Number.isFinite(basis) && basis > 0 ? basis / basisTotal : 0;
    const issueQty = toRounded(totalQty * ratio);
    running += issueQty;
    return { row, issueQty };
  });
}

export async function POST(request) {
  try {
    const permission = await requirePermissionKeys(request, [
      "production-line-planning-manage",
      "plan.claim_material",
      "plan.release_claim",
      "plan.edit_own_dept",
      "plan.verify_materials",
    ]);

    const body = await readJson(request);
    const inputMasterPlanNo = normalizeParam(body?.masterPlanNo || body?.planNo);
    const masterPlanNo = normalizeMasterPlanNo(inputMasterPlanNo);
    const materialSkuCode = normalizeSku(body?.materialSkuCode || body?.skuCode);
    const materialGoodsCode = normalizeGoodsCode(body?.materialGoodsCode || body?.goodsCode, materialSkuCode);
    const grain = normalizeClaimGrain(body?.grain || body?.bucket || body?.mode, "daily");
    const materialOwnerDepartmentId = normalizeParam(body?.materialOwnerDepartmentId);
    const inputDate = normalizeDateOnly(body?.workDate || body?.bucketDate || body?.weekStartDate);
    const bucketDate = bucketDateForWorkDate(inputDate, grain);
    const issueQty = Number(body?.issueQty);
    const note = normalizeParam(body?.note) || null;
    const reason = normalizeParam(body?.reason) || "verify_adjustment";

    if (!masterPlanNo) {
      return NextResponse.json({ error: "Valid masterPlanNo is required" }, { status: 400 });
    }
    if (!materialSkuCode) {
      return NextResponse.json({ error: "materialSkuCode is required" }, { status: 400 });
    }
    if (!materialOwnerDepartmentId) {
      return NextResponse.json({ error: "materialOwnerDepartmentId is required" }, { status: 400 });
    }
    if (!bucketDate) {
      return NextResponse.json({ error: "Valid workDate/weekStartDate is required" }, { status: 400 });
    }
    if (!Number.isFinite(issueQty) || issueQty < 0) {
      return NextResponse.json({ error: "Valid issueQty is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const [scope, ownerByMaterialKey] = await Promise.all([
      loadVerifyEditorScope(supabaseAdmin, permission.userId, permission.isAdmin),
      loadMaterialOwnerMap(supabaseAdmin),
    ]);

    if (!canEditAssignedDepartment(scope, materialOwnerDepartmentId)) {
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
      const rowSku = normalizeSku(row?.materialSkuCode);
      const rowGoods = normalizeGoodsCode(row?.materialGoodsCode || row?.materialSkuCode, rowSku);
      const assignedDepartment = resolveAssignedDepartment(row, ownerByMaterialKey);
      return (
        row.bucketDate === bucketDate
        && rowSku === materialSkuCode
        && rowGoods === materialGoodsCode
        && String(assignedDepartment.departmentId || "").trim() === materialOwnerDepartmentId
      );
    });

    if (!matchingRows.length) {
      return NextResponse.json(
        { error: "Material row not found", details: { masterPlanNo, materialSkuCode, bucketDate } },
        { status: 404 }
      );
    }

    const claimedRows = matchingRows.filter(
      (row) => String(row?.claimStatus || "").trim().toLowerCase() === "claimed"
    );
    const editableRows = matchingRows.filter(
      (row) => String(row?.claimStatus || "").trim().toLowerCase() !== "claimed"
    );
    const claimedTotal = claimedRows.reduce((sum, row) => sum + Number(row?.issueQty || 0), 0);
    const requestedEditableTotal = toRounded(issueQty - claimedTotal);

    if (requestedEditableTotal < 0) {
      return NextResponse.json(
        {
          error: "New total quantity cannot be lower than the quantity already claimed",
          details: { claimedQty: toRounded(claimedTotal) },
        },
        { status: 409 }
      );
    }
    if (!editableRows.length) {
      return NextResponse.json({ error: "Claimed rows cannot be edited" }, { status: 409 });
    }

    const sourceRowKeys = editableRows.map((row) => buildMaterialSourceRowKey({
      masterPlanNo,
      grain,
      bucketDate,
      materialSkuCode,
      materialGoodsCode,
      ownerDepartmentId: row?.ownerDepartmentId,
      demandSource: row?.demandSource,
    }));
    const activeGroupItems = await loadActiveGroupItemsBySourceKeys(supabaseAdmin, sourceRowKeys);
    if (activeGroupItems.length > 0) {
      return NextResponse.json(
        { error: "Cannot change quantity for a row that already belongs to a requisition group" },
        { status: 409 }
      );
    }

    const table = claimTableName(grain);
    const distribution = distributeQty(requestedEditableTotal, editableRows);
    const currentRowsResult = await supabaseAdmin
      .from(table)
      .select("*")
      .eq("master_plan_no", masterPlanNo)
      .eq("material_sku_code", materialSkuCode)
      .eq("material_goods_code", materialGoodsCode)
      .eq(grain === "weekly" ? "week_start_date" : "work_date", bucketDate);
    if (currentRowsResult.error) {
      return NextResponse.json({ error: currentRowsResult.error.message }, { status: 500 });
    }
    const currentRows = Array.isArray(currentRowsResult.data) ? currentRowsResult.data : [];

    const persistedClaims = [];
    for (const item of distribution) {
      const row = item.row;
      const ownerDepartmentId = normalizeParam(row?.ownerDepartmentId);
      const demandSource = normalizeDemandSource(row?.demandSource);
      if (!ownerDepartmentId || !demandSource) continue;

      const currentRow = currentRows.find((entry) => (
        String(entry?.owner_department_id || "").trim() === ownerDepartmentId
        && normalizeDemandSource(entry?.demand_source) === demandSource
      )) || null;

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

      const overrideIssueQty = isSameQty(item.issueQty, row?.demandIssueQty) ? null : item.issueQty;
      const upsertPayload = {
        ...keyPayload,
        owner_department_id: ownerDepartmentId,
        department_id: currentRow?.department_id || null,
        status: currentRow?.status || "released",
        source: currentRow?.source || "material_verify_owner_override",
        override_issue_qty: overrideIssueQty,
        note: note ?? currentRow?.note ?? null,
        claimed_by: currentRow?.claimed_by || null,
        claimed_at: currentRow?.claimed_at || null,
        released_by: currentRow?.released_by || null,
        released_at: currentRow?.released_at || null,
        updated_by: permission.userId,
      };
      if (!currentRow?.id) {
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
      persistedClaims.push(updateResult.data);

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
            previousIssueQty: row?.issueQty,
            demandIssueQty: row?.demandIssueQty,
            overrideIssueQty,
            materialOwnerDepartmentId,
            note: note ?? currentRow?.note ?? null,
          },
        });
    }

    const verifiedDepartmentId = normalizeVerifyDepartmentId(materialOwnerDepartmentId);
    if (verifiedDepartmentId) {
      const clearVerificationResult = await supabaseAdmin
        .from("production_material_verify_confirmations")
        .delete()
        .match({
          master_plan_no: masterPlanNo,
          grain,
          bucket_date: bucketDate,
          material_goods_code: materialGoodsCode,
          assigned_department_id: verifiedDepartmentId,
        });
      if (
        clearVerificationResult.error
        && !isMissingMaterialVerificationTableError(clearVerificationResult.error)
      ) {
        return NextResponse.json({ error: clearVerificationResult.error.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      ok: true,
      data: {
        grain,
        claims: persistedClaims,
        issueQty,
        claimedQty: toRounded(claimedTotal),
        editableQty: requestedEditableTotal,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
