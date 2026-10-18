import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeMasterPlanNo } from "@/lib/planNo";
import { normalizeParam } from "@/lib/validation";
import { normalizeDateOnly } from "@/lib/materialClaims";
import { loadMainPlanRowsForClaimDemand, loadSubplanRowsForClaimDemand } from "@/lib/materialClaimPool";
import { loadMaterialOwnerMap, resolveAssignedDepartment } from "@/lib/materialVerify";
import {
  collectSnapshotWipSkuCodes,
  loadRequiredRequisitionWipSkuSet,
  mapRequisitionSnapshotMaterials,
} from "@/lib/requisitionMaterialPolicy";
import {
  buildRequisitionDocumentBaseKey,
  loadRequisitionParentCategoryMap,
  resolveRequisitionDocumentDiscriminator,
  resolveRequisitionDocumentParent,
  selectRequisitionWorkNames,
  findRequisitionWorkNames,
} from "@/lib/requisitionDocumentGrouping";
import { buildRequisitionRoutingMap, loadRequisitionRoutingRows } from "@/lib/requisitionRouting";
import {
  assertRequisitionDepartmentAccess,
  canAccessRequisitionDepartment,
  loadRequisitionAccessScope,
} from "@/lib/requisitionPreviewAccess";
import { fetchSupabaseRowsByChunks } from "@/lib/supabaseRangeFetch";
import { fetchGatewayJson } from "@/lib/gatewayClient";
import { formatRequisitionRemarkDate } from "@/lib/requisitionExportFormat";
import { matchErpActualDocuments } from "@/lib/requisitionErpActual";

export const dynamic = "force-dynamic";

const ERP_SYNC_START_DATE = "2026-07-01";
const MANUAL_ERP_SYNC = {
  erpDate: "2026-09-24",
  workDate: "2026-09-25",
  departmentNames: ["ขาไก่", "เวเฟอร์สติ๊ก", "บิสกิต"],
};

function formatTimeOnly(value) {
  if (!value) return null;
  const parts = String(value).split(":");
  if (parts.length >= 2) {
    return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
  }
  return value;
}

function normalizeSku(value) {
  return String(value || "").trim().toUpperCase();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeTextKey(value) {
  return String(value || "").trim().toUpperCase();
}

function extractSnapshotRoot(planRow) {
  return Array.isArray(planRow?.bom_snapshot) ? planRow.bom_snapshot[0] : null;
}

function resolveSectionMeta(row) {
  const snapshotRoot = extractSnapshotRoot(row);
  const sectionId = String(
    row?.schedule_section_def_id
      || row?.workstream_code
      || row?.source_section_def_id
      || snapshotRoot?.sourceSectionDefId
      || ""
  ).trim();
  const sectionName = String(
    row?.schedule_section_name
      || row?.source_section_name
      || snapshotRoot?.sourceSectionName
      || ""
  ).trim();
  return { sectionId, sectionName };
}

function isFgDirectRow(row) {
  return String(row?.demand_source || "").trim().toLowerCase() === "fg_direct";
}

function isSubplanRow(row) {
  return String(row?.plan_kind || "").trim().toLowerCase() === "sub";
}

function buildDailyDocumentKey({
  ownerDepartmentId,
  roomId,
  shiftCode,
  parentSku,
  workstreamCode,
  consolidateRequisitionPreviewByDate,
  materialGroup,
  workDate,
}) {
  return [
    "daily",
    String(ownerDepartmentId || "").trim(),
    String(roomId || "").trim(),
    String(shiftCode || "").trim().toUpperCase(),
    resolveRequisitionDocumentDiscriminator({
      parentSku,
      workstreamCode,
      consolidateRequisitionPreviewByDate,
    }),
    String(materialGroup || "").trim().toUpperCase(),
    String(workDate || "").trim(),
  ].join("|");
}

async function loadErpRequisitionCandidates({
  documentRefs,
  departmentCodes,
  workDates,
  erpDateFrom = null,
  erpDateTo = null,
}) {
  const rows = [];
  let cursor = "";
  for (let page = 0; page < 10; page += 1) {
    const params = new URLSearchParams({
      pageSize: "500",
      documentRefs: documentRefs.join("|"),
      departmentCodes: departmentCodes.join("|"),
      remarkDates: workDates.map(formatRequisitionRemarkDate).join("|"),
    });
    if (erpDateFrom) params.set("dateFrom", erpDateFrom);
    if (erpDateTo) params.set("dateTo", erpDateTo);
    if (cursor) params.set("cursor", cursor);
    const result = await fetchGatewayJson("/api/raw-material-requisitions", params, "production");
    if (!result.ok) {
      return { rows: [], error: result.error?.message || "ไม่สามารถอ่านใบเบิกจาก ERP ได้", truncated: false };
    }
    rows.push(...(Array.isArray(result.data?.data) ? result.data.data : []));
    if (!result.data?.cursor?.hasMore || !result.data?.cursor?.next) {
      return { rows, error: null, truncated: false };
    }
    cursor = result.data.cursor.next;
  }
  return { rows, error: null, truncated: true };
}

function replaceDateWithErpActual(doc, match) {
  const dateValue = match.workDate;
  const lineMap = new Map();

  const existingLineByKey = new Map(
    (doc.lines || []).map((line) => [
      `${String(line.materialGoodsCode || line.materialSkuCode || "").trim().toUpperCase()}|${String(line.unit || "").trim().toUpperCase()}`,
      line,
    ])
  );

  (doc.lines || []).forEach((line) => {
    const qtyByDate = { ...(line.qtyByDate || {}) };
    delete qtyByDate[dateValue];
    const erpLotsByDate = { ...(line.erpLotsByDate || {}) };
    delete erpLotsByDate[dateValue];
    const totalQty = Number(Object.values(qtyByDate).reduce((sum, qty) => sum + toNumber(qty, 0), 0).toFixed(3));
    if (totalQty > 0) {
      lineMap.set(
        `${String(line.materialGoodsCode || line.materialSkuCode || "").trim().toUpperCase()}|${String(line.unit || "").trim().toUpperCase()}`,
        { ...line, qtyByDate, totalQty, erpLotsByDate }
      );
    }
  });

  (match.rows || []).forEach((row) => {
    const materialGoodsCode = String(row?.TRD_SH_CODE || "").trim().toUpperCase();
    const unit = String(row?.TRD_UTQNAME || "").trim();
    const qty = Number(toNumber(row?.TRD_QTY, 0).toFixed(3));
    if (!materialGoodsCode || qty <= 0) return;
    const key = `${materialGoodsCode}|${unit.toUpperCase()}`;
    if (!lineMap.has(key)) {
      const existing = existingLineByKey.get(key);
      lineMap.set(key, {
        materialSkuCode: existing?.materialSkuCode || String(row?.PARENT_SKU_CODE || materialGoodsCode).trim().toUpperCase(),
        materialGoodsCode,
        materialName: existing?.materialName || String(row?.TRD_SH_NAME || materialGoodsCode).trim(),
        unit: existing?.unit || unit,
        itemType: existing?.itemType || "RAW",
        qtyByDate: {},
        totalQty: 0,
        erpLotsByDate: existing?.erpLotsByDate ? { ...existing.erpLotsByDate } : {},
      });
    }
    const line = lineMap.get(key);
    line.qtyByDate[dateValue] = Number((toNumber(line.qtyByDate[dateValue], 0) + qty).toFixed(3));
    line.totalQty = Number((toNumber(line.totalQty, 0) + qty).toFixed(3));
    line.erpLotsByDate = { ...(line.erpLotsByDate || {}) };
    if (!Array.isArray(line.erpLotsByDate[dateValue])) line.erpLotsByDate[dateValue] = [];
    const lotNo = String(row?.TRD_LOT_NO || "").trim();
    const warehouseCode = String(row?.WL_CODE || "").trim();
    const existingLot = line.erpLotsByDate[dateValue].find(
      (item) => item.lotNo === lotNo && item.warehouseCode === warehouseCode
    );
    if (existingLot) existingLot.qty = Number((toNumber(existingLot.qty, 0) + qty).toFixed(3));
    else line.erpLotsByDate[dateValue].push({ lotNo, warehouseCode, qty, fifoDate: row?.DI_DATE || null });
  });

  doc.lines = Array.from(lineMap.values()).sort((a, b) =>
    String(a.materialGoodsCode || "").localeCompare(String(b.materialGoodsCode || ""))
  );
  doc.plannedDocumentNoByDate ||= {};
  doc.erpSyncByDate ||= {};
  if (match.actualDocumentNo !== match.plannedDocumentNo) {
    doc.plannedDocumentNoByDate[dateValue] = match.plannedDocumentNo;
  }
  doc.documentNoByDate[dateValue] = match.actualDocumentNo;
  doc.exportedByDate[dateValue] = true;
  doc.erpSyncByDate[dateValue] = {
    status: match.status,
    plannedDocumentNo: match.plannedDocumentNo,
    actualDocumentNo: match.actualDocumentNo,
  };
}

function applyErpMatches(matches) {
  matches.forEach((match) => {
    if (match.status !== "review") {
      replaceDateWithErpActual(match.doc, match);
      return;
    }
    match.doc.erpSyncByDate ||= {};
    match.doc.erpSyncByDate[match.workDate] = {
      status: "review",
      plannedDocumentNo: match.plannedDocumentNo,
      reason: match.reason,
      candidates: match.candidates,
    };
  });
}

export async function GET(request) {
  try {
    const permission = await requirePermissionKeys(request, [
      "production-line-planning-view",
      "production-line-planning-manage",
      "plan.view_all",
      "plan.calculate_own_dept",
      "plan.edit_own_dept",
    ]);

    const { searchParams } = new URL(request.url);
    const inputMasterPlanNo = normalizeParam(searchParams.get("masterPlanNo") || searchParams.get("planNo"));
    const masterPlanNo = normalizeMasterPlanNo(inputMasterPlanNo);
    const departmentIdFilter = normalizeParam(searchParams.get("departmentId"));
    const dateFrom = normalizeDateOnly(searchParams.get("dateFrom"));
    const dateTo = normalizeDateOnly(searchParams.get("dateTo"));

    if (!inputMasterPlanNo) {
      return NextResponse.json({ error: "masterPlanNo is required" }, { status: 400 });
    }
    if (!masterPlanNo) {
      return NextResponse.json({ error: "Invalid masterPlanNo format" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const accessScope = await loadRequisitionAccessScope({
      supabaseAdmin,
      request,
      permission,
      action: "view",
    });
    if (departmentIdFilter) {
      assertRequisitionDepartmentAccess(
        accessScope,
        departmentIdFilter,
        "ไม่มีสิทธิ์ดูใบเบิกของแผนกนี้"
      );
    }

    const [mainRows, subRows, deptResult] = await Promise.all([
      loadMainPlanRowsForClaimDemand(supabaseAdmin, {
        releasedOnly: true,
        masterPlanNo,
        dateFrom,
        dateTo,
        includeWipMaterials: true,
      }),
      loadSubplanRowsForClaimDemand(supabaseAdmin, { masterPlanNo, dateFrom, dateTo, releasedOnly: true }),
      supabaseAdmin
        .from("production_departments")
        .select("id,code,name,is_central_department")
        .is("deleted_at", null),
    ]);

    if (deptResult.error) {
      return NextResponse.json({ error: deptResult.error.message }, { status: 500 });
    }
    const departmentRows = deptResult.data || [];
    const departmentMapById = new Map(
      departmentRows
        .map((row) => [String(row?.id || "").trim(), row])
        .filter(([key]) => Boolean(key))
    );
    const departmentMapByCode = new Map(
      departmentRows
        .map((row) => [normalizeTextKey(row?.code), row])
        .filter(([key]) => Boolean(key))
    );

    let rows = [...(Array.isArray(mainRows) ? mainRows : []), ...(Array.isArray(subRows) ? subRows : [])];
    if (departmentIdFilter) {
      rows = rows.filter((row) => String(row?.owner_department_id || "").trim() === departmentIdFilter);
    }
    rows.sort((a, b) => {
      const dateA = String(a?.period_start || "");
      const dateB = String(b?.period_start || "");
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      return String(a?.sku_code || "").localeCompare(String(b?.sku_code || ""));
    });

    if (!rows.length) {
      return NextResponse.json({
        data: [],
        meta: { masterPlanNo, totalDocuments: 0, totalLines: 0, dateColumns: [] },
      });
    }

    const [ownerByMaterialKey, parentCategoryBySku] = await Promise.all([
      loadMaterialOwnerMap(supabaseAdmin),
      loadRequisitionParentCategoryMap(supabaseAdmin, rows),
    ]);

    const sectionByDeptDate = new Map();
    const sectionByDept = new Map();
    rows.forEach((row) => {
      if (!isFgDirectRow(row)) return;
      const deptId = String(row?.owner_department_id || "").trim();
      const workDate = normalizeDateOnly(row?.period_start);
      const { sectionId, sectionName } = resolveSectionMeta(row);
      if (!deptId || !sectionId) return;
      const keyByDate = `${deptId}|${workDate || ""}`;
      if (!sectionByDeptDate.has(keyByDate)) {
        sectionByDeptDate.set(keyByDate, { sectionId, sectionName: sectionName || sectionId });
      }
      if (!sectionByDept.has(deptId)) {
        sectionByDept.set(deptId, { sectionId, sectionName: sectionName || sectionId });
      }
    });

    const routingRows = await loadRequisitionRoutingRows(
      supabaseAdmin,
      rows.map((row) => row?.owner_department_id)
    );

    const workCenterIds = Array.from(new Set([
      ...(routingRows || []).map((row) => String(row?.work_center_id || "").trim()),
      ...rows
        .filter(isSubplanRow)
        .map((row) => resolveSectionMeta(row).sectionId),
    ].filter(Boolean)));
    let workCenterById = new Map();
    if (workCenterIds.length) {
      const workCenters = await fetchSupabaseRowsByChunks(
        workCenterIds,
        (chunk) => supabaseAdmin
          .from("production_work_centers")
          .select("id,code,name,consolidate_requisition_preview_by_date")
          .in("id", chunk)
      );
      workCenterById = new Map(workCenters.map((wc) => [String(wc.id), wc]));
    }

    const requiredWipSkuSet = await loadRequiredRequisitionWipSkuSet(
      supabaseAdmin, collectSnapshotWipSkuCodes(rows)
    );
    const routingByKey = buildRequisitionRoutingMap(routingRows);

    const { data: shiftRows } = await supabaseAdmin
      .from("production_shifts")
      .select("id, code, name, start_time, end_time")
      .is("deleted_at", null);

    const shiftMapById = new Map();
    const shiftMapByCode = new Map();
    if (Array.isArray(shiftRows)) {
      shiftRows.forEach((shift) => {
        shiftMapById.set(String(shift.id).trim(), shift);
        if (shift.code) {
          shiftMapByCode.set(String(shift.code).trim().toUpperCase(), shift);
        }
      });
    }

    const roomWipNamesByDeptDate = new Map();
    const directRoomWipNamesByDeptDate = new Map();
    const addWipName = (
      departmentId,
      roomId,
      shiftCode,
      shiftId,
      workstreamCode,
      workDate,
      wipSku,
      wipName,
      isDirectRoomPlan
    ) => {
      if (!departmentId || !roomId || !workDate || !wipName) return;
      const baseKey = [
        departmentId,
        roomId,
        String(shiftCode || shiftId || "").trim().toUpperCase(),
        String(workstreamCode || "DEFAULT").trim(),
        workDate,
      ].join("|");
      const consolidatedBaseKey = [
        departmentId,
        roomId,
        String(shiftCode || shiftId || "").trim().toUpperCase(),
        "CONSOLIDATED",
        workDate,
      ].join("|");
      const keys = [
        baseKey,
        `${baseKey}|${String(wipSku || "").trim().toUpperCase()}`,
        consolidatedBaseKey,
      ];
      const target = isDirectRoomPlan
        ? directRoomWipNamesByDeptDate
        : roomWipNamesByDeptDate;
      keys.forEach((key) => {
        if (!target.has(key)) {
          target.set(key, new Set());
        }
        target.get(key).add(wipName);
      });
    };

    const items = [];
    rows.forEach((planRow) => {
      const workDate = normalizeDateOnly(planRow?.period_start);
      if (!workDate) return;
      if (dateFrom && workDate < dateFrom) return;
      if (dateTo && workDate > dateTo) return;

      const qaDepartmentId = String(planRow?.owner_department_id || "").trim() || null;
      const qaDepartmentCode = String(
        planRow?.production_departments?.code || planRow?.owner_department_code || planRow?.department_code || ""
      ).trim().toUpperCase() || null;
      const qaDepartmentName = String(
        planRow?.production_departments?.name || planRow?.owner_department_name || planRow?.department_name || ""
      ).trim() || null;

      const rawShiftId = String(planRow?.shift_id || "").trim() || null;
      let shiftId = rawShiftId;
      let shiftCode = String(planRow?.shift_code || "").trim().toUpperCase() || null;
      let shiftName = String(planRow?.shift_name || "").trim() || null;
      let shiftStartTime = null;
      let shiftEndTime = null;

      let matchedShift = null;
      if (rawShiftId && shiftMapById.has(rawShiftId)) {
        matchedShift = shiftMapById.get(rawShiftId);
      } else if (shiftCode && shiftMapByCode.has(shiftCode)) {
        matchedShift = shiftMapByCode.get(shiftCode);
      }

      if (matchedShift) {
        shiftId = matchedShift.id;
        shiftCode = matchedShift.code;
        shiftName = matchedShift.name;
        shiftStartTime = formatTimeOnly(matchedShift.start_time);
        shiftEndTime = formatTimeOnly(matchedShift.end_time);
      }

      const parentSku = normalizeSku(planRow?.sku_code);
      const documentParent = resolveRequisitionDocumentParent({
        skuCode: parentSku,
        skuName: planRow?.sku_name,
        categoryCode: parentCategoryBySku.get(parentSku),
      });
      const { sectionId, sectionName } = resolveSectionMeta(planRow);
      const sectionFallback =
        sectionByDeptDate.get(`${qaDepartmentId || ""}|${workDate || ""}`)
        || sectionByDept.get(qaDepartmentId || "")
        || null;
      const resolvedSectionId = sectionId || String(sectionFallback?.sectionId || "").trim();
      const resolvedSectionName =
        (sectionName || "").trim()
        || String(sectionFallback?.sectionName || "").trim()
        || "Section";
      const rawWipName = String(planRow?.sku_name || "").trim() || parentSku;
      const plannedQty = Number(planRow?.planned_qty || 0);
      const unit = String(planRow?.unit || "").trim();
      const formattedQty = plannedQty % 1 === 0
        ? plannedQty.toLocaleString("th-TH")
        : Number(plannedQty.toFixed(3));
      const showUnit = unit && unit.toLowerCase() !== "batch" ? ` ${unit}` : "";
      const subplanWipName = `${rawWipName} ${formattedQty}${showUnit}`;

      mapRequisitionSnapshotMaterials(planRow, requiredWipSkuSet).forEach((material) => {
        const routing =
          routingByKey.get(`${qaDepartmentId || ""}|${parentSku}|${material.materialGoodsCode}`)
          || routingByKey.get(`${qaDepartmentId || ""}|${parentSku}|${material.materialSkuCode}`)
          || routingByKey.get(`${qaDepartmentId || ""}|*|${material.materialGoodsCode}`)
          || routingByKey.get(`${qaDepartmentId || ""}|*|${material.materialSkuCode}`)
          || null;

        const workCenterId = String(routing?.work_center_id || "").trim() || null;
        const workCenter = workCenterId ? workCenterById.get(workCenterId) || null : null;
        const roomLabel = workCenter
          ? `${String(workCenter.code || "").trim() ? `[${String(workCenter.code || "").trim()}] ` : ""}${String(workCenter.name || "").trim() || workCenterId}`
          : "ยังไม่กำหนดห้อง";

        if (subplanWipName) {
          addWipName(
            qaDepartmentId,
            workCenterId || "UNASSIGNED_ROOM",
            shiftCode,
            shiftId,
            resolvedSectionId || "DEFAULT",
            workDate,
            parentSku,
            subplanWipName,
            isSubplanRow(planRow) && workCenterId === resolvedSectionId
          );
        }

        const assigned = resolveAssignedDepartment(
          {
            materialSkuCode: material.materialSkuCode,
            materialGoodsCode: material.materialGoodsCode,
            ownerDepartmentId: qaDepartmentId,
            ownerDepartmentCode: qaDepartmentCode,
            ownerDepartmentName: qaDepartmentName,
          },
          ownerByMaterialKey
        );

        const issueOwnerDepartmentId = String(routing?.issue_owner_department_id || "").trim();
        const assignedDepartmentId = String(assigned.departmentId || "").trim();
        const assignedDepartmentCode = String(assigned.departmentCode || "").trim().toUpperCase();
        const resolvedOwnerDepartmentId = issueOwnerDepartmentId || assignedDepartmentId || null;
        const resolvedOwnerDepartment =
          departmentMapById.get(String(resolvedOwnerDepartmentId || "").trim())
          || departmentMapByCode.get(String(resolvedOwnerDepartmentId || "").trim().toUpperCase())
          || departmentMapByCode.get(assignedDepartmentCode)
          || null;

        const ownerDepartmentIsCentral = resolvedOwnerDepartment?.is_central_department === true;

        items.push({
          workDate,
          parentSku: documentParent.parentSku,
          parentSkuName: documentParent.parentSkuName,
          qaDepartmentId,
          qaDepartmentCode,
          qaDepartmentName,
          shiftId,
          shiftCode,
          shiftName,
          shiftStartTime,
          shiftEndTime,
          ownerDepartmentId: resolvedOwnerDepartmentId,
          ownerDepartmentCode: String(
            resolvedOwnerDepartment?.code || assigned.departmentCode || ""
          ).trim().toUpperCase() || null,
          ownerDepartmentName: String(
            resolvedOwnerDepartment?.name || assigned.departmentName || resolvedOwnerDepartmentId || ""
          ).trim() || resolvedOwnerDepartmentId,
          ownerDepartmentIsCentral,
          roomId: workCenterId || "UNASSIGNED_ROOM",
          roomLabel,
          roomCode: String(workCenter?.code || "").trim().toUpperCase() || null,
          consolidateRequisitionPreviewByDate: workCenter?.consolidate_requisition_preview_by_date === true,
          workstreamCode: resolvedSectionId || "DEFAULT",
          workstreamName: resolvedSectionName,
          dispatchSplitMode: String(routing?.dispatch_split_mode || "").trim().toLowerCase() === "split_by_material_type"
            ? "split_by_material_type"
            : "merge_all",
          dispatchMaterialGroup: String(routing?.component_type || material.itemType || "").trim().toUpperCase() === "PACK"
            ? "PACK"
            : "RAW",
          materialSkuCode: material.materialSkuCode,
          materialGoodsCode: material.materialGoodsCode,
          materialName: material.materialName,
          unit: material.unit,
          itemType: material.itemType,
          qty: toNumber(material.issueQty, 0),
        });
      });
    });

    const documentMap = new Map();
    const visibleItems = items.filter((item) =>
      canAccessRequisitionDepartment(accessScope, item.ownerDepartmentId)
    );
    visibleItems.forEach((item) => {
      const baseKey = buildRequisitionDocumentBaseKey(item);
      const splitByType = item.dispatchSplitMode === "split_by_material_type";
      const finalKey = splitByType ? `${baseKey}|${item.dispatchMaterialGroup || "RAW"}` : baseKey;

      if (!documentMap.has(finalKey)) {
        documentMap.set(finalKey, {
          documentKey: finalKey,
          parentSku: item.consolidateRequisitionPreviewByDate ? null : item.parentSku,
          parentSkuName: item.consolidateRequisitionPreviewByDate ? null : item.parentSkuName,
          ownerDepartmentId: item.ownerDepartmentId,
          ownerDepartmentCode: item.ownerDepartmentCode,
          ownerDepartmentName: item.ownerDepartmentName,
          ownerDepartmentIsCentral: Boolean(item.ownerDepartmentIsCentral),
          qaDepartmentId: item.qaDepartmentId,
          qaDepartmentCode: item.qaDepartmentCode,
          qaDepartmentName: item.qaDepartmentName,
          shiftId: item.shiftId,
          shiftCode: item.shiftCode,
          shiftName: item.shiftName,
          shiftStartTime: item.shiftStartTime,
          shiftEndTime: item.shiftEndTime,
          roomId: item.roomId,
          roomLabel: item.roomLabel,
          roomCode: item.roomCode,
          consolidateRequisitionPreviewByDate: item.consolidateRequisitionPreviewByDate === true,
          workstreamCode: item.consolidateRequisitionPreviewByDate
            ? "CONSOLIDATED"
            : item.workstreamCode,
          workstreamName: item.consolidateRequisitionPreviewByDate
            ? "รวมตามห้องผลิต"
            : item.workstreamName,
          dispatchSplitMode: item.dispatchSplitMode,
          dispatchMaterialGroup: splitByType ? (item.dispatchMaterialGroup || "RAW") : null,
          workDate: item.workDate,
          lines: [],
          sectionCodes: new Set(),
          sectionNames: new Set(),
        });
      }

      const doc = documentMap.get(finalKey);
      doc.lines.push(item);
      doc.sectionCodes.add(item.workstreamCode || "DEFAULT");
      doc.sectionNames.add(item.workstreamName || "Section");
      if (item.workDate && (!doc.workDate || item.workDate < doc.workDate)) {
        doc.workDate = item.workDate;
      }
    });

    const { data: requisitionGroups } = await supabaseAdmin
      .from("production_requisition_group_batches")
      .select("document_no, claim_grain, metadata")
      .eq("master_plan_no", masterPlanNo)
      .not("document_no", "is", null)
      .in("claim_grain", ["daily", "weekly"]);

    const dailyDocumentNoMap = new Map();
    const weeklyDocumentEntries = [];
    (Array.isArray(requisitionGroups) ? requisitionGroups : []).forEach((group) => {
      const metadata = group?.metadata && typeof group.metadata === "object" ? group.metadata : {};
      const claimGrain = String(group?.claim_grain || "").trim().toLowerCase();
      if (claimGrain === "daily") {
        const dailyKeys = [false, true].map((consolidateRequisitionPreviewByDate) => buildDailyDocumentKey({
          ownerDepartmentId: metadata.ownerDepartmentId,
          roomId: metadata.roomId,
          shiftCode: metadata.shiftCode,
          parentSku: metadata.parentSku,
          workstreamCode: metadata.workstreamCode,
          consolidateRequisitionPreviewByDate,
          materialGroup: metadata.dispatchMaterialGroup,
          workDate: metadata.selectedDate || metadata.bucketDate || metadata.workDate,
        }));
        if (group?.document_no) {
          dailyKeys.forEach((key) => {
            if (!key) return;
            const documentNos = dailyDocumentNoMap.get(key) || new Set();
            documentNos.add(group.document_no);
            dailyDocumentNoMap.set(key, documentNos);
          });
        }
        return;
      }

      if (claimGrain === "weekly" && group?.document_no) {
        weeklyDocumentEntries.push({
          documentNo: group.document_no,
          ownerDepartmentId: String(metadata.ownerDepartmentId || "").trim(),
          roomId: String(metadata.roomId || "").trim(),
          shiftCode: String(metadata.shiftCode || metadata.shiftId || "").trim().toUpperCase(),
          parentSku: String(metadata.parentSku || "").trim().toUpperCase(),
          workstreamCode: String(metadata.workstreamCode || "").trim(),
          materialGroup: String(metadata.dispatchMaterialGroup || "").trim().toUpperCase(),
          dateFrom: normalizeDateOnly(metadata.dateFrom),
          dateTo: normalizeDateOnly(metadata.dateTo),
        });
      }
    });

    const documents = Array.from(documentMap.values())
      .map((doc) => {
        const lineMap = new Map();
        doc.lines.forEach((line) => {
          const lineKey = `${line.materialGoodsCode}|${line.unit}`;
          if (!lineMap.has(lineKey)) {
            lineMap.set(lineKey, {
              materialSkuCode: line.materialSkuCode,
              materialGoodsCode: line.materialGoodsCode,
              materialName: line.materialName,
              unit: line.unit,
              itemType: line.itemType,
              qtyByDate: {},
              totalQty: 0,
            });
          }
          const target = lineMap.get(lineKey);
          target.qtyByDate[line.workDate] = toNumber(target.qtyByDate[line.workDate], 0) + toNumber(line.qty, 0);
          target.totalQty += toNumber(line.qty, 0);
        });

        const normalizedLines = Array.from(lineMap.values())
          .map((line) => ({
            ...line,
            totalQty: Number(line.totalQty.toFixed(3)),
            qtyByDate: Object.fromEntries(
              Object.entries(line.qtyByDate).map(([date, qty]) => [date, Number(toNumber(qty, 0).toFixed(3))])
            ),
          }))
          .sort((a, b) => String(a.materialGoodsCode).localeCompare(String(b.materialGoodsCode)));

        return {
          ...doc,
          workstreamCode: doc.consolidateRequisitionPreviewByDate
            ? "CONSOLIDATED"
            : (doc.sectionCodes.size === 1 ? Array.from(doc.sectionCodes)[0] : "MIXED"),
          workstreamName: doc.consolidateRequisitionPreviewByDate
            ? "รวมตามห้องผลิต"
            : (doc.sectionNames.size === 1 ? Array.from(doc.sectionNames)[0] : "หลายส่วนงาน"),
          sectionCodes: undefined,
          sectionNames: undefined,
          workNamesByDate: {},
          documentNoByDate: {},
          exportedByDate: {},
          lines: normalizedLines,
        };
      })
      .sort((a, b) => String(a.workDate || "").localeCompare(String(b.workDate || "")));

    const dateColumns = Array.from(
      new Set(
        documents.flatMap((doc) => (doc.lines || []).flatMap((line) => Object.keys(line.qtyByDate || {})))
      )
    ).sort((a, b) => a.localeCompare(b));

    documents.forEach((doc) => {
      const departmentId = String(doc.qaDepartmentId || "").trim();
      const roomId = String(doc.roomId || "").trim();
      const shiftKey = String(doc.shiftCode || doc.shiftId || "").trim().toUpperCase();
      const workNamesByDate = {};
      dateColumns.forEach((dateValue) => {
        const key = `${departmentId}|${roomId}|${shiftKey}|${doc.workstreamCode || "DEFAULT"}|${dateValue}`;
        const names = selectRequisitionWorkNames(
          findRequisitionWorkNames(directRoomWipNamesByDeptDate, key, doc.parentSku),
          findRequisitionWorkNames(roomWipNamesByDeptDate, key, doc.parentSku)
        );
        if (names.length) {
          workNamesByDate[dateValue] = names;
        }

        const documentNos = new Set();
        const dailyDocKey = buildDailyDocumentKey({
          ownerDepartmentId: doc.ownerDepartmentId,
          roomId: doc.roomId,
          shiftCode: doc.shiftCode || doc.shiftId,
          parentSku: doc.parentSku,
          workstreamCode: doc.workstreamCode,
          consolidateRequisitionPreviewByDate: doc.consolidateRequisitionPreviewByDate,
          materialGroup: doc.dispatchMaterialGroup || "",
          workDate: dateValue,
        });
        const dailyDocumentNos = dailyDocumentNoMap.get(dailyDocKey);
        if (dailyDocumentNos) {
          Array.from(dailyDocumentNos).forEach((documentNo) => documentNos.add(documentNo));
        }

        weeklyDocumentEntries.forEach((entry) => {
          if (!names.length && !(doc.lines || []).some((line) => toNumber(line.qtyByDate?.[dateValue], 0) > 0)) return;
          if (!entry.dateFrom || !entry.dateTo) return;
          if (dateValue < entry.dateFrom || dateValue > entry.dateTo) return;
          if (String(doc.ownerDepartmentId || "").trim() !== entry.ownerDepartmentId) return;
          if (String(doc.roomId || "").trim() !== entry.roomId) return;
          if (String(doc.shiftCode || doc.shiftId || "").trim().toUpperCase() !== entry.shiftCode) return;
          if (!doc.consolidateRequisitionPreviewByDate && (
            resolveRequisitionDocumentDiscriminator(doc)
            !== resolveRequisitionDocumentDiscriminator(entry)
          )) return;
          if (String(doc.dispatchMaterialGroup || "").trim().toUpperCase() !== entry.materialGroup) return;
          documentNos.add(entry.documentNo);
        });

        if (documentNos.size > 0) {
          doc.documentNoByDate[dateValue] = Array.from(documentNos).join(" / ");
          doc.exportedByDate[dateValue] = true;
        }
      });
      doc.workNamesByDate = workNamesByDate;
    });

    const exportSlotsByDocumentNo = new Map();
    documents.forEach((doc) => {
      Object.entries(doc.documentNoByDate || {}).forEach(([workDate, documentNo]) => {
        String(documentNo || "").split(/\s+\/\s+/).map((value) => value.trim()).filter(Boolean).forEach((value) => {
          if (!exportSlotsByDocumentNo.has(value)) exportSlotsByDocumentNo.set(value, []);
          exportSlotsByDocumentNo.get(value).push({ doc, workDate });
        });
      });
    });

    if (exportSlotsByDocumentNo.size > 0) {
      const { data: exportedLines, error: exportedLinesError } = await supabaseAdmin
        .from("production_requisition_export_lines")
        .select("doc_ref, sku_code, qty, uom, lot_no, warehouse_code, meta")
        .in("doc_ref", Array.from(exportSlotsByDocumentNo.keys()));
      if (exportedLinesError) throw exportedLinesError;

      (exportedLines || []).forEach((row) => {
        const lotNo = String(row?.lot_no || "").trim();
        const slots = exportSlotsByDocumentNo.get(String(row?.doc_ref || "").trim()) || [];
        const materialGoodsCode = normalizeSku(row?.meta?.materialGoodsCode || row?.sku_code);
        const slot = slots.find((item) => (
          (item.doc?.lines || []).some((line) => normalizeSku(line?.materialGoodsCode) === materialGoodsCode)
        ));
        if (!lotNo || !slot) return;
        const { doc, workDate } = slot;
        const line = (doc.lines || []).find((item) => normalizeSku(item?.materialGoodsCode) === materialGoodsCode);
        if (!line) return;
        line.exportedLotsByDate ||= {};
        line.exportedLotsByDate[workDate] ||= [];
        line.exportedLotsByDate[workDate].push({
          lotNo,
          warehouseCode: String(row?.warehouse_code || "").trim(),
          qty: Number(toNumber(row?.qty, 0).toFixed(3)),
          fifoDate: row?.meta?.fifoAllocation?.fifoDate || null,
        });
      });
    }

    const syncSlots = [];
    documents.forEach((doc) => {
      const documentDates = new Map();
      Object.entries(doc.documentNoByDate || {}).forEach(([workDate, documentNo]) => {
        String(documentNo || "").split(/\s+\/\s+/).map((value) => value.trim()).filter(Boolean).forEach((value) => {
          if (!documentDates.has(value)) documentDates.set(value, []);
          documentDates.get(value).push(workDate);
        });
      });

      Object.entries(doc.documentNoByDate || {}).forEach(([workDate, plannedDocumentNo]) => {
        if (workDate < ERP_SYNC_START_DATE) return;
        const refs = String(plannedDocumentNo || "").split(/\s+\/\s+/).map((value) => value.trim()).filter(Boolean);
        doc.erpSyncByDate ||= {};
        if (refs.length > 1) {
          syncSlots.push({
            key: `${doc.documentKey}|${workDate}`,
            doc,
            workDate,
            plannedDocumentNo,
            plannedDocumentNos: refs,
            departmentCode: doc.ownerDepartmentCode,
            departmentName: doc.ownerDepartmentName,
            roomLabel: doc.roomLabel,
            expectedParentSkus: [],
          });
          return;
        }
        if (refs.length !== 1 || (documentDates.get(refs[0]) || []).length > 1) {
          doc.erpSyncByDate[workDate] = {
            status: "review",
            plannedDocumentNo,
            reason: "ใบรวมสัปดาห์หรือหลายเลขเอกสารไม่สามารถแยกยอด ERP จริงเป็นรายวันได้อย่างแม่นยำ",
            candidates: refs,
          };
          return;
        }
        syncSlots.push({
          key: `${doc.documentKey}|${workDate}`,
          doc,
          workDate,
          plannedDocumentNo: refs[0],
          departmentCode: doc.ownerDepartmentCode,
          departmentName: doc.ownerDepartmentName,
          roomLabel: doc.roomLabel,
          expectedParentSkus: Array.from(new Set(
            (doc.lines || [])
              .filter((line) => toNumber(line?.qtyByDate?.[workDate], 0) > 0)
              .map((line) => normalizeSku(line?.materialSkuCode || line?.materialGoodsCode))
              .filter(Boolean)
          )),
        });
      });
    });

    let erpSyncError = null;
    let erpSyncTruncated = false;
    if (syncSlots.length) {
      const candidates = await loadErpRequisitionCandidates({
        documentRefs: Array.from(new Set(syncSlots.flatMap((slot) => (
          slot.plannedDocumentNos?.length ? slot.plannedDocumentNos : [slot.plannedDocumentNo]
        )))),
        departmentCodes: Array.from(new Set(syncSlots.map((slot) => slot.departmentCode).filter(Boolean))),
        workDates: Array.from(new Set(syncSlots.map((slot) => slot.workDate))),
      });
      erpSyncError = candidates.error;
      erpSyncTruncated = candidates.truncated;
      if (!candidates.error && !candidates.truncated) {
        applyErpMatches(matchErpActualDocuments(syncSlots, candidates.rows));
      } else {
        syncSlots.forEach((slot) => {
          slot.doc.erpSyncByDate[slot.workDate] = {
            status: "review",
            plannedDocumentNo: slot.plannedDocumentNo,
            reason: candidates.truncated
              ? "ข้อมูลใบเบิก ERP เกินขอบเขตที่โหลดได้ กรุณาตรวจสอบ"
              : candidates.error,
            candidates: [],
          };
        });
      }
    }

    const manualSlots = documents.filter((doc) => {
      if (doc.documentNoByDate?.[MANUAL_ERP_SYNC.workDate]) return false;
      const departmentName = `${doc.ownerDepartmentName || ""} ${doc.qaDepartmentName || ""}`;
      return MANUAL_ERP_SYNC.departmentNames.some((name) => departmentName.includes(name))
        && (doc.lines || []).some((line) => toNumber(line?.qtyByDate?.[MANUAL_ERP_SYNC.workDate], 0) > 0);
    }).map((doc) => ({
      key: `${doc.documentKey}|${MANUAL_ERP_SYNC.workDate}|manual`,
      doc,
      workDate: MANUAL_ERP_SYNC.workDate,
      plannedDocumentNo: "",
      departmentCode: doc.ownerDepartmentCode || doc.qaDepartmentCode,
      departmentName: doc.ownerDepartmentName || doc.qaDepartmentName,
      roomLabel: doc.roomLabel,
      expectedParentSkus: Array.from(new Set(
        (doc.lines || [])
          .filter((line) => toNumber(line?.qtyByDate?.[MANUAL_ERP_SYNC.workDate], 0) > 0)
          .map((line) => normalizeSku(line?.materialSkuCode || line?.materialGoodsCode))
          .filter(Boolean)
      )),
    }));

    if (manualSlots.length) {
      const manualCandidates = await loadErpRequisitionCandidates({
        documentRefs: [],
        departmentCodes: [],
        workDates: [MANUAL_ERP_SYNC.workDate],
        erpDateFrom: MANUAL_ERP_SYNC.erpDate,
        erpDateTo: MANUAL_ERP_SYNC.erpDate,
      });
      erpSyncError ||= manualCandidates.error;
      erpSyncTruncated ||= manualCandidates.truncated;
      if (!manualCandidates.error && !manualCandidates.truncated) {
        applyErpMatches(matchErpActualDocuments(manualSlots, manualCandidates.rows));
      } else {
        manualSlots.forEach((slot) => {
          slot.doc.erpSyncByDate ||= {};
          slot.doc.erpSyncByDate[slot.workDate] = {
            status: "review",
            plannedDocumentNo: "",
            reason: manualCandidates.truncated
              ? "ข้อมูลใบเบิก ERP เกินขอบเขตที่โหลดได้ กรุณาตรวจสอบ"
              : manualCandidates.error,
            candidates: [],
          };
        });
      }
    }

    const erpSyncSummary = documents.reduce((summary, doc) => {
      Object.values(doc.erpSyncByDate || {}).forEach((entry) => {
        if (entry?.status === "exact") summary.exact += 1;
        else if (entry?.status === "routing") summary.routing += 1;
        else if (entry?.status === "review") summary.review += 1;
      });
      return summary;
    }, { exact: 0, routing: 0, review: 0 });

    return NextResponse.json({
      data: documents,
      meta: {
        masterPlanNo,
        totalDocuments: documents.length,
        totalLines: documents.reduce((sum, doc) => sum + (doc.lines?.length || 0), 0),
        dateColumns,
        erpSync: erpSyncSummary,
        erpSyncError,
        erpSyncTruncated,
        erpSyncStartDate: ERP_SYNC_START_DATE,
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
