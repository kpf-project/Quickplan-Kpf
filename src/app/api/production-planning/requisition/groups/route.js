import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeMasterPlanNo } from "@/lib/planNo";
import { normalizeParam } from "@/lib/validation";
import { buildClaimPoolRows } from "@/lib/materialClaimPool";
import { canConsolidateCrossQa, loadClaimScope } from "@/lib/claimPermissions";
import {
  listRequisitionGroupItems,
  listRequisitionGroups,
  loadActiveGroupItemsBySourceKeys,
  normalizeGroupItemInput,
  REQUISITION_GROUP_STATUS,
  summarizeGroupItems,
} from "@/lib/requisitionGroups";
import { normalizeClaimGrain } from "@/lib/materialClaims";

export const dynamic = "force-dynamic";

function normalizeDateOnly(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : null;
}

function getGroupVisibility(group, items, scope, userId) {
  if (scope.canManageGlobal) return true;
  if (String(group?.created_by || "").trim() === String(userId || "").trim()) return true;
  const deptSet = new Set(scope.departmentIds || []);
  return items.every((item) => deptSet.has(String(item?.owner_department_id || "").trim()));
}

export async function GET(request) {
  try {
    const permission = await requirePermissionKeys(request, [
      "production-line-planning-view",
      "production-line-planning-manage",
      "plan.view_all",
      "plan.claim_material",
      "plan.view_claim_all",
      "plan.consolidate_cross_qa",
      "admin-requisition",
    ]);

    const { searchParams } = new URL(request.url);
    const masterPlanNo = normalizeMasterPlanNo(
      normalizeParam(searchParams.get("masterPlanNo") || searchParams.get("planNo"))
    );
    const statuses = String(searchParams.get("statuses") || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    const supabaseAdmin = getSupabaseAdmin();
    const viewScope = await loadClaimScope({
      supabaseAdmin,
      request,
      permission,
      action: "view",
    });

    const groups = await listRequisitionGroups(supabaseAdmin, {
      masterPlanNo,
      statuses,
    });
    const items = await listRequisitionGroupItems(
      supabaseAdmin,
      groups.map((group) => group.id)
    );
    const itemMap = new Map();
    items.forEach((item) => {
      const key = String(item.group_id || "").trim();
      if (!itemMap.has(key)) itemMap.set(key, []);
      itemMap.get(key).push(item);
    });

    const payload = groups
      .filter((group) =>
        getGroupVisibility(group, itemMap.get(String(group.id || "").trim()) || [], viewScope, permission.userId)
      )
      .map((group) =>
        summarizeGroupItems(group, itemMap.get(String(group.id || "").trim()) || [])
      );

    return NextResponse.json({
      data: payload,
      meta: {
        masterPlanNo: masterPlanNo || null,
        canConsolidateCrossQa: canConsolidateCrossQa(permission),
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const permission = await requirePermissionKeys(request, [
      "production-line-planning-manage",
      "plan.claim_material",
      "plan.view_claim_all",
      "plan.consolidate_cross_qa",
    ]);

    const body = await readJson(request);
    const inputMasterPlanNo = normalizeParam(body?.masterPlanNo || body?.planNo);
    const masterPlanNo = normalizeMasterPlanNo(inputMasterPlanNo);
    const grain = normalizeClaimGrain(body?.grain, "weekly");
    const dateFrom = normalizeDateOnly(body?.dateFrom);
    const dateTo = normalizeDateOnly(body?.dateTo);
    const sourceRowKeys = Array.from(
      new Set((Array.isArray(body?.sourceRowKeys) ? body.sourceRowKeys : []).map((item) => String(item || "").trim()).filter(Boolean))
    );
    const groupName = normalizeParam(body?.groupName) || null;
    const destinationNote = normalizeParam(body?.destinationNote) || null;
    const lookup27DepartmentCode = normalizeParam(body?.lookup27DepartmentCode)?.toUpperCase() || null;

    if (!masterPlanNo) {
      return NextResponse.json({ error: "Valid masterPlanNo is required" }, { status: 400 });
    }
    if (!sourceRowKeys.length) {
      return NextResponse.json({ error: "sourceRowKeys is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const claimScope = await loadClaimScope({
      supabaseAdmin,
      request,
      permission,
      action: "claim",
    });
    const consolidateCrossQa = canConsolidateCrossQa(permission);
    const poolResult = await buildClaimPoolRows(supabaseAdmin, {
      masterPlanNo,
      grain,
      dateFrom,
      dateTo,
    });
    const baseRows = Array.isArray(poolResult?.rawRows) && poolResult.rawRows.length > 0
      ? poolResult.rawRows
      : (Array.isArray(poolResult?.rows) ? poolResult.rows : []);
    const poolMap = new Map(
      baseRows.map((row) => [String(row.sourceRowKey || "").trim(), row])
    );
    const selectedRows = sourceRowKeys.map((key) => poolMap.get(key)).filter(Boolean);
    if (selectedRows.length !== sourceRowKeys.length) {
      return NextResponse.json({ error: "Some selected rows were not found in the current claim pool" }, { status: 400 });
    }

    const ownerDepartmentIds = Array.from(
      new Set(selectedRows.map((row) => String(row?.ownerDepartmentId || "").trim()).filter(Boolean))
    );
    if (
      ownerDepartmentIds.some((id) => !claimScope.canManageGlobal && !(claimScope.departmentIds || []).includes(id))
    ) {
      return NextResponse.json({ error: "Owner department scope violation" }, { status: 403 });
    }
    if (!selectedRows.every((row) => row.claimStatus === "claimed")) {
      return NextResponse.json({ error: "Only claimed rows can be grouped" }, { status: 400 });
    }
    if (!consolidateCrossQa && ownerDepartmentIds.length > 1) {
      return NextResponse.json({
        error: "Cross-QA grouping is not allowed for this user",
        details: { ownerDepartmentIds },
      }, { status: 403 });
    }

    const activeItems = await loadActiveGroupItemsBySourceKeys(supabaseAdmin, sourceRowKeys);
    if (activeItems.length > 0) {
      return NextResponse.json({
        error: "Some rows already belong to another requisition group",
        details: {
          sourceRowKeys: activeItems.map((item) => item.source_row_key),
        },
      }, { status: 409 });
    }

    const groupInsert = await supabaseAdmin
      .from("production_requisition_group_batches")
      .insert({
        master_plan_no: masterPlanNo,
        claim_grain: grain,
        status: REQUISITION_GROUP_STATUS.draft,
        can_consolidate_cross_qa: consolidateCrossQa,
        group_name: groupName,
        destination_note: destinationNote,
        created_by: permission.userId,
        metadata: {
          ownerDepartmentIds,
          sourceRowCount: sourceRowKeys.length,
          lookup27DepartmentCode,
        },
      })
      .select("*")
      .single();

    if (groupInsert.error) {
      return NextResponse.json({ error: groupInsert.error.message }, { status: 500 });
    }

    const groupId = groupInsert.data.id;
    const itemRows = selectedRows.map((row) => ({
      group_id: groupId,
      ...normalizeGroupItemInput({
        masterPlanNo,
        grain,
        bucketDate: row.bucketDate,
        materialSkuCode: row.materialSkuCode,
        materialGoodsCode: row.materialGoodsCode,
        ownerDepartmentId: row.ownerDepartmentId,
        claimDepartmentId: row.claimDepartmentId,
        demandSource: row.demandSource,
        issueQty: row.issueQty,
        requiredQty: row.requiredQty,
        sourcePlanIds: row.sourcePlanIds,
        sourceOwnerDepartmentIds: [row.ownerDepartmentId].filter(Boolean),
        ownerDepartmentCode: row.ownerDepartmentCode,
        ownerDepartmentName: row.ownerDepartmentName,
        claimDepartmentCode: row.claimDepartmentCode,
        claimDepartmentName: row.claimDepartmentName,
        materialName: row.materialName,
        unit: row.unit,
        itemType: row.itemType,
      }),
      created_by: permission.userId,
    }));

    const itemsInsert = await supabaseAdmin
      .from("production_requisition_group_items")
      .insert(itemRows);

    if (itemsInsert.error) {
      await supabaseAdmin
        .from("production_requisition_group_batches")
        .delete()
        .eq("id", groupId);
      return NextResponse.json({ error: itemsInsert.error.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      data: summarizeGroupItems(groupInsert.data, itemRows),
    });
  } catch (error) {
    return jsonError(error);
  }
}
