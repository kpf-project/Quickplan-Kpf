import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeMasterPlanNo } from "@/lib/planNo";
import { persistSubplanDraftLines } from "@/lib/autoSubplanDrafts";
import {
  buildPlanRange,
  buildDraftPlanId,
  loadMainPlanRowsForMasterPlan,
  loadProductsMetaBySkus,
  normalizeDateOnly,
  normalizeFormulaCode,
  normalizeSku,
  roundQty,
  toFiniteNumber,
} from "@/lib/wipPlanning";
import {
  loadDepartmentMapByIds,
  loadPlanningScopeByUser,
  normalizePlanningDepartmentId,
} from "@/lib/planningScope";

export const dynamic = "force-dynamic";

function isMissingColumnError(error, columnName) {
  const message = String(error?.message || "").toLowerCase();
  return String(error?.code || "") === "PGRST204" || message.includes(String(columnName || "").toLowerCase());
}

async function checkHasExportedRequisition(supabaseAdmin, masterPlanNo, departmentId) {
  if (!masterPlanNo || !departmentId) return false;
  const result = await supabaseAdmin
    .from("production_requisition_group_items")
    .select("id, production_requisition_group_batches!inner(id, master_plan_no, status)")
    .eq("owner_department_id", departmentId)
    .eq("production_requisition_group_batches.master_plan_no", masterPlanNo)
    .eq("production_requisition_group_batches.status", "exported")
    .limit(1);

  if (result.error) {
    console.warn("Failed to check exported requisitions", result.error);
    return false;
  }
  return Array.isArray(result.data) && result.data.length > 0;
}

function buildDaySkuKey(workDate, skuCode, shiftCode = "", shiftId = "") {
  const d = normalizeDateOnly(workDate);
  const s = normalizeSku(skuCode);
  const shift = String(shiftCode || shiftId || "").trim().toUpperCase();
  if (!d || !s) return "";
  return `${d}|${shift}|${s}`;
}

function parseInputLine(row, index, fallbackDepartmentId = null) {
  const workDate = normalizeDateOnly(row?.workDate || row?.period_start || row?.date);
  const skuCode = normalizeSku(row?.skuCode || row?.sku_code);
  const plannedQty = toFiniteNumber(row?.plannedQty ?? row?.planned_qty ?? row?.qty, 0);
  const departmentId = normalizePlanningDepartmentId(
    row?.departmentId || row?.owner_department_id || fallbackDepartmentId
  );
  if (!workDate || !skuCode || plannedQty <= 0) return null;
  const sourceSectionDefId = String(
    row?.sourceSectionDefId
    || row?.schedule_section_def_id
    || row?.scheduleSectionDefId
    || ""
  ).trim();
  const sourceSectionName = String(
    row?.sourceSectionName
    || row?.schedule_section_name
    || row?.scheduleSectionName
    || ""
  ).trim();
  const workstreamCode = String(
    row?.workstreamCode
    || row?.workstream_code
    || sourceSectionDefId
    || ""
  ).trim();
  const mergePolicy = String(row?.mergePolicy || row?.merge_policy || "strict_separate")
    .trim()
    .toLowerCase() || "strict_separate";
  return {
    id: String(row?.id || row?.planId || row?.plan_id || `LINE-${index + 1}`).trim(),
    planId: String(row?.planId || row?.plan_id || `LINE-${index + 1}`).trim(),
    workDate,
    skuCode,
    skuName: String(row?.skuName || row?.sku_name || "").trim(),
    plannedQty: roundQty(plannedQty),
    unit: String(row?.unit || row?.uom || "").trim() || null,
    departmentId: departmentId || null,
    shiftId: String(row?.shiftId || row?.shift_id || "").trim() || null,
    shiftCode: String(row?.shiftCode || row?.shift_code || "").trim().toUpperCase() || null,
    shiftName: String(row?.shiftName || row?.shift_name || "").trim() || null,
    formulaCode: normalizeFormulaCode(row?.formulaCode || row?.formula_code),
    bomVersionId: row?.bomVersionId || row?.bom_version_id || null,
    sourceSectionDefId: sourceSectionDefId || null,
    sourceSectionName: sourceSectionName || null,
    workstreamCode: workstreamCode || null,
    mergePolicy,
  };
}

async function loadDraftRows(supabaseAdmin, masterPlanNo, scope, selectedDepartmentId = null) {
  let query = supabaseAdmin
    .from("production_plan_status")
    .select("plan_id,period_start,sku_code,sku_name,planned_qty,unit,owner_department_id,shift_id,shift_code,shift_name,formula_code,bom_version_id,schedule_section_def_id,schedule_section_name")
    .eq("master_plan_no", masterPlanNo)
    .eq("plan_kind", "sub")
    .in("status", ["draft", "not_ready", "ready", "confirmed", "partial", "backorder", "blocked"])
    .order("period_start", { ascending: true })
    .order("sku_code", { ascending: true });

  if (selectedDepartmentId) {
    query = query.eq("owner_department_id", selectedDepartmentId);
  } else if (!scope.canManageGlobal) {
    const editableDepartmentIds = Array.from(scope.editableDepartmentIdSet || []);
    if (!editableDepartmentIds.length) return [];
    query = query.in("owner_department_id", editableDepartmentIds);
  }

  let result = await query;
  if (
    result.error
    && (isMissingColumnError(result.error, "schedule_section_def_id")
      || isMissingColumnError(result.error, "schedule_section_name")
      || isMissingColumnError(result.error, "shift_id")
      || isMissingColumnError(result.error, "shift_code")
      || isMissingColumnError(result.error, "shift_name"))
  ) {
    let fallbackQuery = supabaseAdmin
      .from("production_plan_status")
      .select("plan_id,period_start,sku_code,sku_name,planned_qty,unit,owner_department_id,formula_code,bom_version_id")
      .eq("master_plan_no", masterPlanNo)
      .eq("plan_kind", "sub")
      .in("status", ["draft", "not_ready", "ready", "confirmed", "partial", "backorder", "blocked"])
      .order("period_start", { ascending: true })
      .order("sku_code", { ascending: true });
    if (selectedDepartmentId) {
      fallbackQuery = fallbackQuery.eq("owner_department_id", selectedDepartmentId);
    } else if (!scope.canManageGlobal) {
      const editableDepartmentIds = Array.from(scope.editableDepartmentIdSet || []);
      if (!editableDepartmentIds.length) return [];
      fallbackQuery = fallbackQuery.in("owner_department_id", editableDepartmentIds);
    }
    result = await fallbackQuery;
  }
  if (result.error) {
    throw result.error;
  }
  return Array.isArray(result.data) ? result.data : [];
}

async function loadExistingSubplan(supabaseAdmin, masterPlanNo, departmentId) {
  if (!masterPlanNo || !departmentId) return null;
  const result = await supabaseAdmin
    .from("production_sub_plans")
    .select("sub_plan_no,status,confirmed_at,confirmed_by_name")
    .eq("master_plan_no", masterPlanNo)
    .eq("department_id", departmentId)
    .maybeSingle();
  if (result.error) {
    throw result.error;
  }
  const row = result.data || null;
  if (!row) return null;
  const status = String(row?.status || "").trim().toLowerCase();
  const confirmedAt = row?.confirmed_at || null;
  const isConfirmed = status === "confirmed" || Boolean(confirmedAt);
  return {
    subPlanNo: String(row?.sub_plan_no || "").trim().toUpperCase() || null,
    status: status || null,
    confirmedAt,
    confirmedByName: String(row?.confirmed_by_name || "").trim() || null,
    isConfirmed,
  };
}

async function resolveSelectedDepartmentId({
  inputDepartmentId,
  scope,
}) {
  const editableDepartmentIds = Array.from(scope.editableDepartmentIdSet || []);
  const selectedDepartmentId = inputDepartmentId
    || (scope.canManageGlobal ? null : (editableDepartmentIds.length === 1 ? editableDepartmentIds[0] : null));

  if (
    selectedDepartmentId
    && !scope.canManageGlobal
    && !scope.editableDepartmentIdSet.has(selectedDepartmentId)
  ) {
    const error = new Error("Department scope violation");
    error.status = 403;
    error.details = { departmentId: selectedDepartmentId };
    throw error;
  }

  return {
    selectedDepartmentId: selectedDepartmentId || null,
    editableDepartmentIds,
  };
}

export async function GET(request) {
  try {
    const permission = await requirePermissionKeys(request, [
      "production-line-planning-view",
      "production-line-planning-manage",
      "plan.calculate_own_dept",
      "plan.edit_own_dept",
    ]);

    const { searchParams } = new URL(request.url);
    const inputMasterPlanNo = String(
      searchParams.get("masterPlanNo") || searchParams.get("planNo") || ""
    )
      .trim()
      .toUpperCase();
    const masterPlanNo = normalizeMasterPlanNo(inputMasterPlanNo);
    const inputDepartmentId = normalizePlanningDepartmentId(searchParams.get("departmentId"));

    if (!inputMasterPlanNo) {
      return NextResponse.json({ error: "masterPlanNo is required" }, { status: 400 });
    }
    if (!masterPlanNo) {
      return NextResponse.json({ error: "Invalid masterPlanNo format" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const scope = await loadPlanningScopeByUser(supabaseAdmin, request, permission);
    const { selectedDepartmentId, editableDepartmentIds } = await resolveSelectedDepartmentId({
      inputDepartmentId,
      scope,
    });

    const [mainRows, draftRows, existingSubplan, hasExportedRequisition] = await Promise.all([
      loadMainPlanRowsForMasterPlan(supabaseAdmin, masterPlanNo),
      loadDraftRows(supabaseAdmin, masterPlanNo, scope, selectedDepartmentId),
      loadExistingSubplan(supabaseAdmin, masterPlanNo, selectedDepartmentId),
      checkHasExportedRequisition(supabaseAdmin, masterPlanNo, selectedDepartmentId),
    ]);

    const planRange = buildPlanRange(mainRows);
    const departmentIds = Array.from(
      new Set(
        draftRows
          .map((row) => normalizePlanningDepartmentId(row?.owner_department_id))
          .filter(Boolean)
          .concat(selectedDepartmentId ? [selectedDepartmentId] : [])
          .concat(editableDepartmentIds)
      )
    );
    const departmentMap = await loadDepartmentMapByIds(supabaseAdmin, departmentIds);

    const lines = draftRows
      .map((row, index) =>
        parseInputLine(
          {
            id: row?.plan_id,
            planId: row?.plan_id,
            workDate: row?.period_start,
            skuCode: row?.sku_code,
            skuName: row?.sku_name,
            plannedQty: row?.planned_qty,
            departmentId: row?.owner_department_id,
            shiftId: row?.shift_id,
            shiftCode: row?.shift_code,
            shiftName: row?.shift_name,
            formulaCode: row?.formula_code,
            bomVersionId: row?.bom_version_id,
            sourceSectionDefId: row?.schedule_section_def_id,
            sourceSectionName: row?.schedule_section_name,
          },
          index
        )
      )
      .filter(Boolean)
      .map((line) => {
        const dept = line.departmentId ? departmentMap.get(line.departmentId) : null;
        return {
          ...line,
          uom: line.unit || null,
          planningUnit: line.unit || null,
          departmentCode: String(dept?.code || "").trim().toUpperCase() || null,
          departmentName: String(dept?.name || "").trim() || null,
          shiftId: line.shiftId || null,
          shiftCode: line.shiftCode || null,
          shiftName: line.shiftName || null,
          sourceSectionDefId: line.sourceSectionDefId || null,
          sourceSectionName: line.sourceSectionName || null,
          workstreamCode: line.workstreamCode || line.sourceSectionDefId || null,
          mergePolicy: line.mergePolicy || "strict_separate",
        };
      });

    return NextResponse.json(
      {
        data: {
          masterPlanNo,
          lines,
        },
        meta: {
          selectedDepartmentId,
          editableDepartmentIds,
          canManageGlobal: Boolean(scope.canManageGlobal),
          planRange,
          existingSubplan: existingSubplan || null,
          subplanLocked: hasExportedRequisition,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (error?.status === 403) {
      return NextResponse.json(
        { error: "Department scope violation", details: error.details || null },
        { status: 403 }
      );
    }
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const permission = await requirePermissionKeys(request, [
      "production-line-planning-manage",
      "plan.edit_own_dept",
    ]);

    const body = await readJson(request);
    const inputMasterPlanNo = String(body?.masterPlanNo || body?.planNo || "")
      .trim()
      .toUpperCase();
    const masterPlanNo = normalizeMasterPlanNo(inputMasterPlanNo);
    const inputDepartmentId = normalizePlanningDepartmentId(body?.departmentId);
    const inputLines = Array.isArray(body?.lines) ? body.lines : [];

    if (!inputMasterPlanNo) {
      return NextResponse.json({ error: "masterPlanNo is required" }, { status: 400 });
    }
    if (!masterPlanNo) {
      return NextResponse.json({ error: "Invalid masterPlanNo format" }, { status: 400 });
    }
    if (!inputLines.length) {
      return NextResponse.json({ error: "lines are required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const scope = await loadPlanningScopeByUser(supabaseAdmin, request, permission);
    const { selectedDepartmentId, editableDepartmentIds } = await resolveSelectedDepartmentId({
      inputDepartmentId,
      scope,
    });
    if (!selectedDepartmentId) {
      return NextResponse.json(
        { error: "departmentId is required when multiple departments are available" },
        { status: 400 }
      );
    }

    const mainRows = await loadMainPlanRowsForMasterPlan(supabaseAdmin, masterPlanNo);
    if (!mainRows.length) {
      return NextResponse.json({ error: "Master plan not found" }, { status: 404 });
    }
    const planRange = buildPlanRange(mainRows);
    const departmentMap = await loadDepartmentMapByIds(supabaseAdmin, [selectedDepartmentId]);
    const selectedDepartment = departmentMap.get(selectedDepartmentId);
    if (!selectedDepartment || selectedDepartment.deleted_at || !selectedDepartment.is_active) {
      return NextResponse.json({ error: "Invalid department" }, { status: 400 });
    }

    const hasExportedRequisition = await checkHasExportedRequisition(supabaseAdmin, masterPlanNo, selectedDepartmentId);
    if (hasExportedRequisition) {
      return NextResponse.json(
        { error: "ไม่สามารถแก้ไขแผนได้เนื่องจากใบเบิกวัตถุดิบได้รับการยืนยันการเบิกจ่ายเรียบร้อยแล้ว" },
        { status: 400 }
      );
    }

    const parsedLines = inputLines
      .map((row, index) => parseInputLine(row, index, selectedDepartmentId))
      .filter(Boolean);
    if (!parsedLines.length) {
      return NextResponse.json({ error: "No valid draft lines" }, { status: 400 });
    }

    // WIP can be produced before or after the FG date when the BOM route is multi-step.
    // Keep planRange for persistence metadata, but do not reject valid WIP dates outside it.

    const productMetaBySku = await loadProductsMetaBySkus(
      supabaseAdmin,
      parsedLines.map((line) => line.skuCode)
    );
    const nonWipLines = parsedLines.filter((line) => {
      const meta = productMetaBySku.get(line.skuCode);
      return String(meta?.iccat_code || "").trim() !== "03";
    });
    if (nonWipLines.length) {
      return NextResponse.json(
        {
          error: "Only WIP SKU (iccat_code=03) is allowed in WIP draft",
          details: {
            skuCodes: Array.from(new Set(nonWipLines.map((line) => line.skuCode))),
          },
        },
        { status: 400 }
      );
    }

    const dedupMap = new Map();
    parsedLines.forEach((line) => {
      const key = `${line.workDate}|${line.shiftCode || line.shiftId || ""}|${line.skuCode}|${line.workstreamCode || line.sourceSectionDefId || "default"}`;
      if (!dedupMap.has(key)) {
        dedupMap.set(key, { ...line });
        return;
      }
      const current = dedupMap.get(key);
      current.plannedQty = roundQty(
        toFiniteNumber(current.plannedQty) + toFiniteNumber(line.plannedQty)
      );
      dedupMap.set(key, current);
    });
    const normalizedLines = Array.from(dedupMap.values());

    const nowIso = new Date().toISOString();
    const persistResult = await persistSubplanDraftLines({
      supabaseAdmin,
      masterPlanNo,
      department: selectedDepartment,
      lines: normalizedLines.map((line) => {
        const meta = productMetaBySku.get(line.skuCode);
        return {
          ...line,
          skuName: line.skuName || meta?.sku_name || line.skuCode,
        };
      }),
      planRange,
      actorUserId: permission.userId,
      nowIso,
    });

    return NextResponse.json(
      {
        ok: true,
        data: {
          masterPlanNo,
          departmentId: selectedDepartmentId,
          departmentCode: selectedDepartment.code,
          lineCount: persistResult.lineCount,
          deletedLineCount: persistResult.deletedLineCount,
        },
        meta: {
          selectedDepartmentId,
          editableDepartmentIds,
          planRange,
          canManageGlobal: Boolean(scope.canManageGlobal),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    if (error?.status === 403) {
      return NextResponse.json(
        { error: "Department scope violation", details: error.details || null },
        { status: 403 }
      );
    }
    return jsonError(error);
  }
}
