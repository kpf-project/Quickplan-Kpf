import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { sendPlanningPushNotification } from "@/lib/pushNotifications";
import {
  loadMaterialOwnerMap,
  resolveAssignedDepartment,
  UNASSIGNED_DEPARTMENT_ID,
} from "@/lib/materialVerify";
import {
  buildSubPlanNo,
  normalizeMasterPlanNo,
} from "@/lib/planNo";
import {
  explodeRawRequirementsFromWipLines,
  loadMainPlanRowsForMasterPlan,
  normalizeDateOnly,
  normalizeSku,
  roundQty,
} from "@/lib/wipPlanning";
import {
  loadDepartmentMapByIds,
  loadPlanningScopeByUser,
  normalizePlanningDepartmentId,
} from "@/lib/planningScope";
import {
  buildRecursiveSubplanSnapshot,
  chooseApprovedVersionForPlan,
  loadApprovedBomVersionsBySku,
} from "@/lib/subplanSnapshots";

export const dynamic = "force-dynamic";

function normalizeRoutingSku(value) {
  return String(value || "").trim().toUpperCase();
}

export async function POST(request) {
  try {
    const permission = await requirePermissionKeys(request, [
      "production-line-planning-manage",
      "plan.edit_own_dept",
    ]);

    const body = await request.json().catch(() => ({}));
    const inputMasterPlanNo = String(body?.masterPlanNo || body?.planNo || "")
      .trim()
      .toUpperCase();
    const masterPlanNo = normalizeMasterPlanNo(inputMasterPlanNo);
    const inputDepartmentId = normalizePlanningDepartmentId(body?.departmentId);
    const allowEmptyConfirm = body?.allowEmptyConfirm === true;

    if (!inputMasterPlanNo) {
      return NextResponse.json({ error: "masterPlanNo is required" }, { status: 400 });
    }
    if (!masterPlanNo) {
      return NextResponse.json({ error: "Invalid masterPlanNo format" }, { status: 400 });
    }
    if (!inputDepartmentId) {
      return NextResponse.json({ error: "departmentId is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const scope = await loadPlanningScopeByUser(supabaseAdmin, request, permission);
    if (!scope.canManageGlobal && !scope.editableDepartmentIdSet.has(inputDepartmentId)) {
      return NextResponse.json(
        {
          error: "Department scope violation",
          details: { departmentId: inputDepartmentId },
        },
        { status: 403 }
      );
    }

    const departmentMap = await loadDepartmentMapByIds(supabaseAdmin, [inputDepartmentId]);
    const department = departmentMap.get(inputDepartmentId);
    if (!department || department.deleted_at || !department.is_active) {
      return NextResponse.json({ error: "Invalid department" }, { status: 400 });
    }

    const existingSubplanResult = await supabaseAdmin
      .from("production_sub_plans")
      .select("sub_plan_no,status,confirmed_at")
      .eq("master_plan_no", masterPlanNo)
      .eq("department_id", inputDepartmentId)
      .maybeSingle();
    if (existingSubplanResult.error) {
      return NextResponse.json({ error: existingSubplanResult.error.message }, { status: 500 });
    }
    const existingSubplan = existingSubplanResult.data || null;
    const existingSubplanStatus = String(existingSubplan?.status || "").trim().toLowerCase();
    const isExistingSubplanConfirmed =
      existingSubplanStatus === "confirmed"
      || existingSubplanStatus === "ready"
      || Boolean(existingSubplan?.confirmed_at);

    const draftRowsResult = await supabaseAdmin
      .from("production_plan_status")
      .select("plan_id,sku_code,sku_name,planned_qty,unit,period_start,formula_code,formula_name,bom_version_id")
      .eq("master_plan_no", masterPlanNo)
      .eq("plan_kind", "sub")
      .eq("owner_department_id", inputDepartmentId)
      .in("status", ["draft", "not_ready"])
      .order("period_start", { ascending: true })
      .order("sku_code", { ascending: true });
    if (draftRowsResult.error) {
      return NextResponse.json({ error: draftRowsResult.error.message }, { status: 500 });
    }

    const draftRows = Array.isArray(draftRowsResult.data) ? draftRowsResult.data : [];
    let rowsForDateRange = draftRows;
    if (!draftRows.length) {
      if (allowEmptyConfirm && isExistingSubplanConfirmed) {
        const mainRows = await loadMainPlanRowsForMasterPlan(supabaseAdmin, masterPlanNo);
        if (!mainRows.length) {
          return NextResponse.json({ error: "Master plan not found" }, { status: 404 });
        }
        const sortedWorkDates = mainRows
          .map((row) => normalizeDateOnly(row?.period_start))
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b));
        const periodStart = sortedWorkDates[0] || null;
        const periodEnd = sortedWorkDates[sortedWorkDates.length - 1] || periodStart;
        return NextResponse.json(
          {
            ok: true,
            data: {
              masterPlanNo,
              subPlanNo: String(existingSubplan?.sub_plan_no || "").trim().toUpperCase() || null,
              subPlanNos: existingSubplan?.sub_plan_no ? [String(existingSubplan.sub_plan_no).trim().toUpperCase()] : [],
              departmentId: inputDepartmentId,
              departmentCode: department.code,
              departmentName: department.name,
              confirmedLines: 0,
              periodStart,
              periodEnd,
              rawRequisition: [],
            },
            meta: {
              confirmedAt: existingSubplan?.confirmed_at || null,
              source: "existing_subplan",
              alreadyConfirmed: true,
              note: "Subplan already confirmed for this department.",
            },
          },
          { status: 200 }
        );
      }
      if (!allowEmptyConfirm) {
        return NextResponse.json(
          { error: "No draft subplan lines found for this department" },
          { status: 400 }
        );
      }
      const mainRows = await loadMainPlanRowsForMasterPlan(supabaseAdmin, masterPlanNo);
      if (!mainRows.length) {
        return NextResponse.json({ error: "Master plan not found" }, { status: 404 });
      }
      rowsForDateRange = mainRows;
    }

    const sortedWorkDates = rowsForDateRange
      .map((row) => normalizeDateOnly(row?.period_start))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    const periodStart = sortedWorkDates[0] || null;
    const periodEnd = sortedWorkDates[sortedWorkDates.length - 1] || periodStart;
    if (!periodStart || !periodEnd) {
      return NextResponse.json(
        { error: "Cannot resolve plan date range for master plan" },
        { status: 400 }
      );
    }

    const actorResult = await supabaseAdmin
      .from("profiles")
      .select("username")
      .eq("id", permission.userId)
      .maybeSingle();
    const actorName = actorResult?.data?.username || null;
    const nowIso = new Date().toISOString();

    const masterPlanEnsureResult = await supabaseAdmin
      .from("production_master_plans")
      .select("master_plan_no")
      .eq("master_plan_no", masterPlanNo)
      .maybeSingle();
    if (masterPlanEnsureResult.error) {
      return NextResponse.json({ error: masterPlanEnsureResult.error.message }, { status: 500 });
    }
    if (!masterPlanEnsureResult.data) {
      const insertMasterResult = await supabaseAdmin
        .from("production_master_plans")
        .upsert({
          master_plan_no: masterPlanNo,
          period_start: periodStart,
          period_end: periodEnd,
          status: "draft",
          created_by: permission.userId,
          updated_by: permission.userId,
        }, { onConflict: "master_plan_no" });
      if (insertMasterResult.error) {
        return NextResponse.json({ error: insertMasterResult.error.message }, { status: 500 });
      }
    }

    let rawRows = [];
    let updateRows = [];
    if (draftRows.length > 0) {
      const explosionResult = await explodeRawRequirementsFromWipLines(
        supabaseAdmin,
        draftRows.map((row) => ({
          planId: row?.plan_id,
          skuCode: row?.sku_code,
          plannedQty: row?.planned_qty,
          formulaCode: row?.formula_code,
          bomVersionId: row?.bom_version_id,
        }))
      );
      rawRows = explosionResult.rawRows;

      // Hard gate: routing must be complete before confirming subplan.
      // Every RAW/PACK material line must resolve a room and an owner department.
      const ownerByMaterialKey = await loadMaterialOwnerMap(supabaseAdmin);
      const routingComponentSkus = new Set();
      const parentSkus = new Set();
      draftRows.forEach((row) => {
        parentSkus.add(normalizeRoutingSku(row?.sku_code));
      });
      draftRows.forEach((row) => {
        const planId = String(row?.plan_id || "").trim();
        const rows = explosionResult?.byPlanId?.get?.(planId) || [];
        rows.forEach((item) => {
          if (String(item?.itemType || "").trim().toUpperCase() === "WIP") return;
          routingComponentSkus.add(normalizeRoutingSku(item?.materialGoodsCode || item?.materialSkuCode));
          routingComponentSkus.add(normalizeRoutingSku(item?.materialSkuCode));
        });
      });

      const routingSkus = Array.from(routingComponentSkus).filter(Boolean);
      const routingParents = Array.from(parentSkus).filter(Boolean);
      let routingRows = [];
      if (routingSkus.length) {
        const routingResult = await supabaseAdmin
          .from("production_routing_components")
          .select("department_id,parent_sku_code,component_sku_code,issue_owner_department_id,work_center_id")
          .eq("department_id", inputDepartmentId)
          .is("deleted_at", null)
          .in("component_sku_code", routingSkus);
        if (routingResult.error) {
          return NextResponse.json({ error: routingResult.error.message }, { status: 500 });
        }
        routingRows = Array.isArray(routingResult.data) ? routingResult.data : [];
      }

      const routingByKey = new Map();
      const upsertRouting = (key, row) => {
        if (!key) return;
        const existing = routingByKey.get(key);
        if (!existing) {
          routingByKey.set(key, row);
          return;
        }
        const existingHasRoom = String(existing?.work_center_id || "").trim().length > 0;
        const nextHasRoom = String(row?.work_center_id || "").trim().length > 0;
        if (!existingHasRoom && nextHasRoom) routingByKey.set(key, row);
      };
      routingRows.forEach((row) => {
        const dept = String(row?.department_id || "").trim();
        const parentSku = normalizeRoutingSku(row?.parent_sku_code);
        const compSku = normalizeRoutingSku(row?.component_sku_code);
        if (!dept || !compSku) return;
        upsertRouting(`${dept}|${parentSku}|${compSku}`, row);
        upsertRouting(`${dept}|*|${compSku}`, row);
      });

      const missingRouting = [];
      draftRows.forEach((planRow) => {
        const planId = String(planRow?.plan_id || "").trim();
        const parentSku = normalizeRoutingSku(planRow?.sku_code);
        const rows = explosionResult?.byPlanId?.get?.(planId) || [];

        rows.forEach((item) => {
          if (String(item?.itemType || "").trim().toUpperCase() === "WIP") return;
          const materialSkuCode = normalizeRoutingSku(item?.materialSkuCode);
          const materialGoodsCode = normalizeRoutingSku(item?.materialGoodsCode || item?.materialSkuCode);
          const routing =
            routingByKey.get(`${inputDepartmentId}|${parentSku}|${materialGoodsCode}`)
            || routingByKey.get(`${inputDepartmentId}|${parentSku}|${materialSkuCode}`)
            || routingByKey.get(`${inputDepartmentId}|*|${materialGoodsCode}`)
            || routingByKey.get(`${inputDepartmentId}|*|${materialSkuCode}`)
            || null;

          const roomId = String(routing?.work_center_id || "").trim();
          const assigned = resolveAssignedDepartment(
            {
              materialSkuCode,
              materialGoodsCode,
              ownerDepartmentId: inputDepartmentId,
              ownerDepartmentCode: department.code || null,
              ownerDepartmentName: department.name || null,
            },
            ownerByMaterialKey
          );
          const ownerDepartmentId = String(routing?.issue_owner_department_id || "").trim() || String(assigned?.departmentId || "").trim();

          if (!roomId || !ownerDepartmentId || ownerDepartmentId === UNASSIGNED_DEPARTMENT_ID) {
            missingRouting.push({
              planId,
              parentSku,
              materialGoodsCode,
              materialSkuCode,
              materialName: String(item?.materialName || "").trim() || materialGoodsCode || materialSkuCode,
              missingRoom: !roomId,
              missingOwner: !ownerDepartmentId || ownerDepartmentId === UNASSIGNED_DEPARTMENT_ID,
            });
          }
        });
      });

      if (missingRouting.length) {
        return NextResponse.json(
          {
            error: "ยืนยันแผนย่อยไม่ได้: Routing/เจ้าของวัตถุดิบยังไม่ครบ",
            details: {
              missingCount: missingRouting.length,
              missingRows: missingRouting.slice(0, 50),
            },
          },
          { status: 400 }
        );
      }

      const versionsBySku = await loadApprovedBomVersionsBySku(
        supabaseAdmin,
        draftRows.map((row) => row?.sku_code)
      );

      updateRows = draftRows.map((row) => {
        const versions = versionsBySku.get(normalizeSku(row?.sku_code)) || [];
        const selectedVersion = chooseApprovedVersionForPlan(row, versions);
        const planId = String(row?.plan_id || "").trim();
        const snapshot = buildRecursiveSubplanSnapshot(
          {
            ...row,
            bom_version_id: selectedVersion?.id || row?.bom_version_id || null,
            formula_code: selectedVersion?.formula_code || row?.formula_code,
            formula_name: selectedVersion?.formula_name || row?.formula_name,
          },
          explosionResult?.byPlanId?.get?.(planId) || [],
          nowIso,
          { source: "subplan_confirm_recursive" }
        );
        const plannedQty = roundQty(row?.planned_qty);
        return {
          plan_id: row?.plan_id,
          status: "ready",
          confirmed_at: nowIso,
          confirmed_by: actorName,
          bom_snapshot: [snapshot],
          feasible_batch: plannedQty,
          short_batch: 0,
          backorder_batch: 0,
          earliest_material_eta: null,
          exception_reason: null,
          updated_at: nowIso,
        };
      });
    }

    const updateResults = await Promise.all(
      updateRows.map((row) =>
        supabaseAdmin
          .from("production_plan_status")
          .update({
            status: row.status,
            confirmed_at: row.confirmed_at,
            confirmed_by: row.confirmed_by,
            bom_snapshot: row.bom_snapshot,
            feasible_batch: row.feasible_batch,
            short_batch: row.short_batch,
            backorder_batch: row.backorder_batch,
            earliest_material_eta: row.earliest_material_eta,
            exception_reason: row.exception_reason,
            updated_at: row.updated_at,
          })
          .eq("plan_id", row.plan_id)
          .select("plan_id")
      )
    );
    const failedUpdate = updateResults.find((result) => result.error);
    if (failedUpdate?.error) {
      return NextResponse.json({ error: failedUpdate.error.message }, { status: 500 });
    }

    // production_sub_plans has a unique constraint on (master_plan_no, department_id),
    // so we upsert a single row per dept per master plan (not one per work date).
    const subPlanNo =
      buildSubPlanNo(masterPlanNo, department.code)
      || buildSubPlanNo(masterPlanNo, "UNASSIGNED");
    const subPlanResult = await supabaseAdmin
      .from("production_sub_plans")
      .upsert(
        {
          sub_plan_no: subPlanNo,
          master_plan_no: masterPlanNo,
          department_id: inputDepartmentId,
          status: "confirmed",
          note: periodStart || null,
          confirmed_at: nowIso,
          confirmed_by: permission.userId,
          confirmed_by_name: actorName,
          updated_by: permission.userId,
          created_by: permission.userId,
        },
        { onConflict: "master_plan_no,department_id" }
      );
    if (subPlanResult.error) {
      return NextResponse.json({ error: subPlanResult.error.message }, { status: 500 });
    }

    try {
      await sendPlanningPushNotification(supabaseAdmin, "planning.subplan_confirmed", {
        title: "ยืนยันแผนย่อยแล้ว",
        body: `${department.code || department.name || "แผนก"} ยืนยัน ${subPlanNo} สำหรับแผน ${masterPlanNo}`,
        url: `/production-line/planning/report?masterPlanNo=${encodeURIComponent(masterPlanNo)}&reportPlanNo=${encodeURIComponent(masterPlanNo)}&reportDepartment=${encodeURIComponent(department.code || "")}`,
        data: {
          masterPlanNo,
          subPlanNo,
          departmentId: inputDepartmentId,
          departmentCode: department.code || null,
          periodStart,
          periodEnd,
        },
      });
    } catch (pushError) {
      console.error("Failed to send subplan confirm push notification", pushError);
    }

    return NextResponse.json(
      {
        ok: true,
        data: {
          masterPlanNo,
          subPlanNo,
          subPlanNos: [subPlanNo],
          departmentId: inputDepartmentId,
          departmentCode: department.code,
          departmentName: department.name,
          confirmedLines: updateRows.length,
          periodStart,
          periodEnd,
          rawRequisition: rawRows,
        },
        meta: {
          confirmedAt: nowIso,
          source: "recursive_cte_rpc",
          note: draftRows.length
            ? "WIP demand lines confirmed. Claim pool is generated from confirmed RAW demand."
            : "No WIP draft lines were required. Claim pool continues from FG direct demand.",
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return jsonError(error);
  }
}
