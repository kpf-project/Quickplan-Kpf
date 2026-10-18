import { NextResponse } from "next/server";
import { ApiError, getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeMasterPlanNo } from "@/lib/planNo";
import { normalizeDateOnly } from "@/lib/materialClaims";
import { loadMainPlanRowsForClaimDemand, loadSubplanRowsForClaimDemand } from "@/lib/materialClaimPool";
import { isRequisitionDraftStale, loadPlanningSourceRevision } from "@/lib/planningRelease";
import { loadMaterialOwnerMap, resolveAssignedDepartment } from "@/lib/materialVerify";
import { reserveDocumentNumbers } from "@/lib/requisitionGroups";
import { allocateLotNumbersForExportRows } from "@/lib/requisitionLotExport";
import { resolveRequisitionStorageLocation } from "@/lib/requisitionStorageLocation";
import {
  buildRequisitionPlanRemark,
  formatRequisitionRemarkDate,
} from "@/lib/requisitionExportFormat";
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
} from "@/lib/requisitionDocumentGrouping";
import { buildRequisitionRoutingMap, loadRequisitionRoutingRows } from "@/lib/requisitionRouting";
import {
  assertRequisitionDepartmentAccess,
  loadRequisitionAccessScope,
  loadScopedRequisitionDraftRow,
} from "@/lib/requisitionPreviewAccess";
import { fetchSupabaseRowsByChunks } from "@/lib/supabaseRangeFetch";
import {
  buildExistingDocumentNumberMap,
  loadExistingRequisitionExportGroups,
} from "@/lib/requisitionExportSafety";

export const dynamic = "force-dynamic";

function normalizeSku(value) {
  return String(value || "").trim().toUpperCase();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundQty(value) {
  return Number(toNumber(value).toFixed(3));
}

function reservationLotKey(parentSkuCode, lotNo, warehouseCode) {
  return [normalizeSku(parentSkuCode), String(lotNo || "").trim(), normalizeSku(warehouseCode)].join("|");
}

function extractSnapshotRoot(planRow) {
  return Array.isArray(planRow?.bom_snapshot) ? planRow.bom_snapshot[0] : null;
}

function resolveSectionMeta(row) {
  const snapshotRoot = extractSnapshotRoot(row);
  const sectionId = String(
    row?.schedule_section_def_id ||
    row?.workstream_code ||
    row?.source_section_def_id ||
    snapshotRoot?.sourceSectionDefId ||
    ""
  ).trim();
  const sectionName = String(
    row?.schedule_section_name ||
    row?.source_section_name ||
    snapshotRoot?.sourceSectionName ||
    ""
  ).trim();
  return { sectionId, sectionName };
}

function buildConfirmedDocumentKey({
  grain,
  ownerDepartmentId,
  roomId,
  shiftCode,
  dispatchSplitMode,
  dispatchMaterialGroup,
  selectedDate,
  dateFrom,
  dateTo,
  parentSku,
  workstreamCode,
  consolidateRequisitionPreviewByDate,
}) {
  const materialGroup = dispatchSplitMode === "split_by_material_type"
    ? `|${dispatchMaterialGroup || "RAW"}`
    : "";
  const discriminator = resolveRequisitionDocumentDiscriminator({
    parentSku,
    workstreamCode,
    consolidateRequisitionPreviewByDate,
  });
  const prefix = [
    grain,
    String(ownerDepartmentId || "").trim(),
    String(roomId || "UNASSIGNED_ROOM").trim(),
    `${String(shiftCode || "UNASSIGNED_SHIFT").trim()}${materialGroup}`,
  ];
  if (grain === "daily") {
    return [...prefix, selectedDate, discriminator].join("|");
  }
  return [...prefix, dateFrom, dateTo, discriminator].join("|");
}

function isFgDirectRow(row) {
  return String(row?.demand_source || "").trim().toLowerCase() === "fg_direct";
}

function hasAssignedRoom(doc) {
  const roomId = String(doc?.roomId || "").trim().toUpperCase();
  const roomLabel = String(doc?.roomLabel || "").trim();
  return Boolean(roomId && roomId !== "UNASSIGNED_ROOM" && !roomLabel.includes("ยังไม่กำหนดห้อง"));
}

export async function POST(request) {
  try {
    const permission = await requirePermissionKeys(request, [
      "production-line-planning-manage",
      "plan.edit_own_dept",
    ]);

    const body = await readJson(request);
    const inputMasterPlanNo = String(body?.masterPlanNo || body?.planNo || "").trim().toUpperCase();
    const masterPlanNo = normalizeMasterPlanNo(inputMasterPlanNo);
    const exportMode = String(body?.exportMode || "daily").trim().toLowerCase();
    const selectedDate = normalizeDateOnly(body?.selectedDate);
    const dateFromInput = normalizeDateOnly(body?.dateFrom);
    const dateToInput = normalizeDateOnly(body?.dateTo);
    const selectedDepartmentIds = Array.isArray(body?.selectedDepartmentIds)
      ? body.selectedDepartmentIds.map((id) => String(id).trim()).filter(Boolean)
      : [];

    const selectedDepartmentIdsDaily = Array.isArray(body?.selectedDepartmentIdsDaily)
      ? body.selectedDepartmentIdsDaily.map((id) => String(id).trim()).filter(Boolean)
      : (exportMode === "daily" ? selectedDepartmentIds : []);

    const selectedDepartmentIdsConsolidated = Array.isArray(body?.selectedDepartmentIdsConsolidated)
      ? body.selectedDepartmentIdsConsolidated.map((id) => String(id).trim()).filter(Boolean)
      : (exportMode === "consolidated" ? selectedDepartmentIds : []);

    const excludedDocumentKeys = Array.isArray(body?.excludedDocumentKeys)
      ? body.excludedDocumentKeys.map((key) => String(key).trim()).filter(Boolean)
      : [];
    const lotAllocationOverrides = Object.fromEntries(
      Object.entries(body?.lotAllocationOverrides && typeof body.lotAllocationOverrides === "object"
        ? body.lotAllocationOverrides
        : {})
        .slice(0, 5000)
        .map(([key, allocations]) => [
          String(key || "").trim(),
          (Array.isArray(allocations) ? allocations : []).slice(0, 100).map((item) => ({
            lotNo: String(item?.lotNo || "").trim(),
            qty: roundQty(item?.qty),
          })).filter((item) => item.qty > 0),
        ])
        .filter(([key, allocations]) => key && allocations.length)
    );
    const lotReservationKeys = Array.from(new Set(
      (Array.isArray(body?.lotReservationKeys) ? body.lotReservationKeys : [])
        .map((key) => String(key || "").trim())
        .filter(Boolean)
    ));

    if (!inputMasterPlanNo || !masterPlanNo) {
      return NextResponse.json({ error: "masterPlanNo is required and must be valid" }, { status: 400 });
    }
    if (!selectedDepartmentIdsDaily.length && !selectedDepartmentIdsConsolidated.length) {
      return NextResponse.json({ error: "กรุณาเลือกแผนกอย่างน้อย 1 แผนกในการออกใบเบิก" }, { status: 400 });
    }

    // Determine broad query date range to cover both options
    if (!selectedDate && !dateFromInput && !dateToInput) {
      return NextResponse.json({ error: "date parameters are missing" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const accessScope = await loadRequisitionAccessScope({
      supabaseAdmin,
      request,
      permission,
      action: "edit",
    });
    assertRequisitionDepartmentAccess(
      accessScope,
      [...selectedDepartmentIdsDaily, ...selectedDepartmentIdsConsolidated],
      "ไม่มีสิทธิ์ Export ใบเบิกของแผนกที่เลือก"
    );

    // 1. Fetch departments to build code lookup map
    const { data: deptRows, error: deptError } = await supabaseAdmin
      .from("production_departments")
      .select("id,code,name,is_central_department")
      .is("deleted_at", null);
    if (deptError) throw deptError;

    const deptMapById = new Map(deptRows.map((r) => [String(r.id).trim(), r]));
    const deptMapByCode = new Map(deptRows.map((r) => [String(r.code).trim().toUpperCase(), r]));

    // 2. Fetch main & subplan rows for the date range
    const sourceRevision = await loadPlanningSourceRevision(supabaseAdmin, masterPlanNo);
    const [mainRows, subRows] = await Promise.all([
      loadMainPlanRowsForClaimDemand(supabaseAdmin, {
        releasedOnly: true,
        masterPlanNo,
        dateFrom: dateFromInput,
        dateTo: dateToInput,
        includeWipMaterials: true,
      }),
      loadSubplanRowsForClaimDemand(supabaseAdmin, { masterPlanNo, dateFrom: dateFromInput, dateTo: dateToInput, releasedOnly: true }),
    ]);

    const rows = [...(Array.isArray(mainRows) ? mainRows : []), ...(Array.isArray(subRows) ? subRows : [])];
    if (!rows.length) {
      return NextResponse.json({ error: "ไม่มีข้อมูลความต้องการผลิตในวันที่เลือก" }, { status: 400 });
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
        .filter((row) => String(row?.plan_kind || "").trim().toLowerCase() === "sub")
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
      workCenterById = new Map((workCenters || []).map((wc) => [String(wc.id), wc]));
    }

    const requiredWipSkuSet = await loadRequiredRequisitionWipSkuSet(
      supabaseAdmin, collectSnapshotWipSkuCodes(rows)
    );
    const routingByKey = buildRequisitionRoutingMap(routingRows);

    const { data: shiftRows } = await supabaseAdmin
      .from("production_shifts")
      .select("id, code, name")
      .is("deleted_at", null);
    const shiftMapById = new Map((shiftRows || []).map((s) => [String(s.id).trim(), s]));

    // 3. Load active drafts
    const draftRow = await loadScopedRequisitionDraftRow(supabaseAdmin, {
      masterPlanNo,
      dateFrom: dateFromInput,
      dateTo: dateToInput,
      scope: accessScope,
      allowLegacyFallback: accessScope.canManageGlobal,
    });
    if (isRequisitionDraftStale(draftRow, sourceRevision)) {
      throw new ApiError(409, "แผนที่ยืนยัน/เผยแพร่เปลี่ยนแล้ว กรุณาตรวจสอบแบบร่างใบเบิกก่อน Export");
    }
    const draftPayload = draftRow?.draft_payload || {};

    const items = [];
    rows.forEach((planRow) => {
      const workDate = normalizeDateOnly(planRow?.period_start);
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

      if (rawShiftId && shiftMapById.has(rawShiftId)) {
        const matchedShift = shiftMapById.get(rawShiftId);
        shiftId = matchedShift.id;
        shiftCode = matchedShift.code;
        shiftName = matchedShift.name;
      }

      const parentSku = normalizeSku(planRow?.sku_code);
      const documentParent = resolveRequisitionDocumentParent({
        skuCode: parentSku,
        skuName: planRow?.sku_name,
        categoryCode: parentCategoryBySku.get(parentSku),
      });
      const { sectionId, sectionName } = resolveSectionMeta(planRow);
      const sectionFallback =
        sectionByDeptDate.get(`${qaDepartmentId || ""}|${workDate || ""}`) ||
        sectionByDept.get(qaDepartmentId || "") ||
        null;
      const resolvedSectionId = sectionId || String(sectionFallback?.sectionId || "").trim();
      const resolvedSectionName =
        (sectionName || "").trim() ||
        String(sectionFallback?.sectionName || "").trim() ||
        "Section";

      mapRequisitionSnapshotMaterials(planRow, requiredWipSkuSet).forEach((material) => {
        const routing =
          routingByKey.get(`${qaDepartmentId || ""}|${parentSku}|${material.materialGoodsCode}`) ||
          routingByKey.get(`${qaDepartmentId || ""}|${parentSku}|${material.materialSkuCode}`) ||
          routingByKey.get(`${qaDepartmentId || ""}|*|${material.materialGoodsCode}`) ||
          routingByKey.get(`${qaDepartmentId || ""}|*|${material.materialSkuCode}`) ||
          null;

        const workCenterId = String(routing?.work_center_id || "").trim() || null;
        const workCenter = workCenterId ? workCenterById.get(workCenterId) || null : null;
        const roomLabel = workCenter
          ? `${String(workCenter.code || "").trim() ? `[${String(workCenter.code || "").trim()}] ` : ""}${String(workCenter.name || "").trim() || workCenterId}`
          : "ยังไม่กำหนดห้อง";

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
          deptMapById.get(String(resolvedOwnerDepartmentId || "").trim()) ||
          deptMapByCode.get(String(resolvedOwnerDepartmentId || "").trim().toUpperCase()) ||
          deptMapByCode.get(assignedDepartmentCode) ||
          null;

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
          consolidateRequisitionPreviewByDate:
            workCenter?.consolidate_requisition_preview_by_date === true,
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

    const documentsToConfirm = [];

    // Phase A: Process Daily Requisitions
    if (selectedDepartmentIdsDaily.length > 0 && selectedDate) {
      // Build the same candidate documents as Preview so draft quantities added
      // to a date without source demand can still be exported.
      const dailyItems = items;
      const dailyDocMap = new Map();
      dailyItems.forEach((item) => {
        const baseKey = buildRequisitionDocumentBaseKey(item);
        const splitByType = item.dispatchSplitMode === "split_by_material_type";
        const finalKey = splitByType ? `${baseKey}|${item.dispatchMaterialGroup || "RAW"}` : baseKey;

        if (!dailyDocMap.has(finalKey)) {
          dailyDocMap.set(finalKey, {
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
            roomId: item.roomId,
            roomLabel: item.roomLabel,
            roomCode: item.roomCode,
            consolidateRequisitionPreviewByDate:
              item.consolidateRequisitionPreviewByDate === true,
            workstreamCode: item.consolidateRequisitionPreviewByDate
              ? "CONSOLIDATED"
              : item.workstreamCode,
            workstreamName: item.consolidateRequisitionPreviewByDate
              ? "รวมตามห้องผลิต"
              : item.workstreamName,
            workDate: item.workDate,
            dispatchSplitMode: item.dispatchSplitMode,
            dispatchMaterialGroup: splitByType ? (item.dispatchMaterialGroup || "RAW") : null,
            lines: [],
          });
        }
        dailyDocMap.get(finalKey).lines.push(item);
      });

      const dailyDocuments = Array.from(dailyDocMap.values()).map((doc) => {
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

        const normalizedLines = Array.from(lineMap.values()).map((line) => ({
          ...line,
          totalQty: roundQty(line.totalQty),
          qtyByDate: Object.fromEntries(
            Object.entries(line.qtyByDate).map(([date, qty]) => [date, roundQty(qty)])
          ),
        }));

        return { ...doc, lines: normalizedLines };
      });

      const dailyWorkingDocs = dailyDocuments.map((doc) => {
        const draftLines = Array.isArray(draftPayload[doc.documentKey]) ? draftPayload[doc.documentKey] : null;
        let finalLines = doc.lines;

        if (draftLines) {
          const draftMap = new Map(draftLines.map((l) => [`${l.materialGoodsCode}|${l.unit}`, l]));
          const updatedLines = doc.lines.map((l) => {
            const key = `${l.materialGoodsCode}|${l.unit}`;
            if (draftMap.has(key)) {
              const dl = draftMap.get(key);
              draftMap.delete(key);

              const qtyByDate = { ...l.qtyByDate };
              const draftQty = toNumber(dl?.qtyByDate?.[selectedDate], 0);
              qtyByDate[selectedDate] = roundQty(draftQty);

              const totalQty = roundQty(Object.values(qtyByDate).reduce((sum, q) => sum + toNumber(q), 0));
              return { ...l, qtyByDate, totalQty };
            }
            return null;
          }).filter(Boolean);

          const addedLines = Array.from(draftMap.values()).map((dl) => {
            const draftQty = toNumber(dl?.qtyByDate?.[selectedDate], 0);
            const qtyByDate = { [selectedDate]: roundQty(draftQty) };
            const totalQty = roundQty(Object.values(qtyByDate).reduce((sum, q) => sum + toNumber(q), 0));
            return {
              materialSkuCode: dl.materialSkuCode || "",
              materialGoodsCode: dl.materialGoodsCode,
              materialName: dl.materialName,
              unit: dl.unit,
              itemType: dl.itemType,
              qtyByDate,
              totalQty,
              isManual: true,
            };
          });

          finalLines = [...updatedLines, ...addedLines].filter((l) => l.totalQty > 0);
        }

        const selectedLines = finalLines
          .map((line) => {
            const selectedQty = roundQty(line?.qtyByDate?.[selectedDate]);
            return {
              ...line,
              qtyByDate: { [selectedDate]: selectedQty },
              totalQty: selectedQty,
            };
          })
          .filter((line) => line.totalQty > 0);

        return {
          ...doc,
          workDate: selectedDate,
          lines: selectedLines.sort((a, b) => String(a.materialGoodsCode).localeCompare(String(b.materialGoodsCode))),
        };
      });

      dailyWorkingDocs.forEach((doc) => {
        if (
          selectedDepartmentIdsDaily.includes(String(doc.ownerDepartmentId).trim()) && 
          doc.lines.length > 0 &&
          hasAssignedRoom(doc) &&
          !excludedDocumentKeys.includes(doc.documentKey)
        ) {
          documentsToConfirm.push({ ...doc, grain: "daily" });
        }
      });
    }

    // Phase B: Process Consolidated Requisitions
    if (selectedDepartmentIdsConsolidated.length > 0 && dateFromInput && dateToInput) {
      const consolidatedItems = items.filter((item) => item.workDate >= dateFromInput && item.workDate <= dateToInput);
      const consolidatedDocMap = new Map();
      consolidatedItems.forEach((item) => {
        const baseKey = buildRequisitionDocumentBaseKey(item);
        const splitByType = item.dispatchSplitMode === "split_by_material_type";
        const finalKey = splitByType ? `${baseKey}|${item.dispatchMaterialGroup || "RAW"}` : baseKey;

        if (!consolidatedDocMap.has(finalKey)) {
          consolidatedDocMap.set(finalKey, {
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
            roomId: item.roomId,
            roomLabel: item.roomLabel,
            roomCode: item.roomCode,
            consolidateRequisitionPreviewByDate:
              item.consolidateRequisitionPreviewByDate === true,
            workstreamCode: item.consolidateRequisitionPreviewByDate
              ? "CONSOLIDATED"
              : item.workstreamCode,
            workstreamName: item.consolidateRequisitionPreviewByDate
              ? "รวมตามห้องผลิต"
              : item.workstreamName,
            workDate: item.workDate,
            dispatchSplitMode: item.dispatchSplitMode,
            dispatchMaterialGroup: splitByType ? (item.dispatchMaterialGroup || "RAW") : null,
            lines: [],
          });
        }
        consolidatedDocMap.get(finalKey).lines.push(item);
      });

      const consolidatedDocuments = Array.from(consolidatedDocMap.values()).map((doc) => {
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

        const normalizedLines = Array.from(lineMap.values()).map((line) => ({
          ...line,
          totalQty: roundQty(line.totalQty),
          qtyByDate: Object.fromEntries(
            Object.entries(line.qtyByDate).map(([date, qty]) => [date, roundQty(qty)])
          ),
        }));

        return { ...doc, lines: normalizedLines };
      });

      const consolidatedWorkingDocs = consolidatedDocuments.map((doc) => {
        const draftLines = Array.isArray(draftPayload[doc.documentKey]) ? draftPayload[doc.documentKey] : null;
        let finalLines = doc.lines;

        if (draftLines) {
          const draftMap = new Map(draftLines.map((l) => [`${l.materialGoodsCode}|${l.unit}`, l]));
          const updatedLines = doc.lines.map((l) => {
            const key = `${l.materialGoodsCode}|${l.unit}`;
            if (draftMap.has(key)) {
              const dl = draftMap.get(key);
              draftMap.delete(key);

              const qtyByDate = {};
              Object.entries(dl?.qtyByDate || {}).forEach(([dVal, qty]) => {
                const dateKey = normalizeDateOnly(dVal);
                if (dateKey && dateKey >= dateFromInput && dateKey <= dateToInput) {
                  qtyByDate[dateKey] = roundQty(qty);
                }
              });

              const totalQty = roundQty(Object.values(qtyByDate).reduce((sum, q) => sum + toNumber(q), 0));
              return { ...l, qtyByDate, totalQty };
            }
            return null;
          }).filter(Boolean);

          const addedLines = Array.from(draftMap.values()).map((dl) => {
            const qtyByDate = {};
            Object.entries(dl?.qtyByDate || {}).forEach(([dVal, qty]) => {
              const dateKey = normalizeDateOnly(dVal);
              if (dateKey && dateKey >= dateFromInput && dateKey <= dateToInput) {
                qtyByDate[dateKey] = roundQty(qty);
              }
            });

            const totalQty = roundQty(Object.values(qtyByDate).reduce((sum, q) => sum + toNumber(q), 0));
            return {
              materialSkuCode: dl.materialSkuCode || "",
              materialGoodsCode: dl.materialGoodsCode,
              materialName: dl.materialName,
              unit: dl.unit,
              itemType: dl.itemType,
              qtyByDate,
              totalQty,
              isManual: true,
            };
          });

          finalLines = [...updatedLines, ...addedLines].filter((l) => l.totalQty > 0);
        }

        return {
          ...doc,
          lines: finalLines.sort((a, b) => String(a.materialGoodsCode).localeCompare(String(b.materialGoodsCode))),
        };
      });

      consolidatedWorkingDocs.forEach((doc) => {
        if (
          selectedDepartmentIdsConsolidated.includes(String(doc.ownerDepartmentId).trim()) && 
          doc.lines.length > 0 &&
          hasAssignedRoom(doc) &&
          !excludedDocumentKeys.includes(doc.documentKey)
        ) {
          documentsToConfirm.push({ ...doc, grain: "weekly" });
        }
      });
    }

    if (!documentsToConfirm.length) {
      return NextResponse.json({ error: "ไม่พบรายการเบิกวัตถุดิบสำหรับแผนกที่เลือก" }, { status: 400 });
    }
    const now = new Date();
    const existingExportGroups = await loadExistingRequisitionExportGroups(supabaseAdmin, {
      masterPlanNo,
      selectedDate,
      dateFrom: dateFromInput,
      dateTo: dateToInput,
      dailyDepartmentIds: selectedDepartmentIdsDaily,
      weeklyDepartmentIds: selectedDepartmentIdsConsolidated,
    });
    const matchedDocumentNoMap = buildExistingDocumentNumberMap(
      existingExportGroups,
      buildConfirmedDocumentKey
    );

    // Determine how many brand-new document numbers are actually needed (by unique keys)
    const uniqueKeysToReserve = new Set();
    documentsToConfirm.forEach((doc) => {
      const resolvedShiftCode = doc.shiftCode || doc.shiftId || "UNASSIGNED_SHIFT";
      const resolvedRoomId = doc.roomId || "UNASSIGNED_ROOM";
      const key = buildConfirmedDocumentKey({
        grain: doc.grain,
        ownerDepartmentId: doc.ownerDepartmentId,
        roomId: resolvedRoomId,
        shiftCode: resolvedShiftCode,
        dispatchSplitMode: doc.dispatchSplitMode,
        dispatchMaterialGroup: doc.dispatchMaterialGroup,
        selectedDate,
        dateFrom: dateFromInput,
        dateTo: dateToInput,
        parentSku: doc.parentSku,
        workstreamCode: doc.workstreamCode,
        consolidateRequisitionPreviewByDate: doc.consolidateRequisitionPreviewByDate,
      });
      if (!matchedDocumentNoMap.has(key)) {
        uniqueKeysToReserve.add(key);
      }
    });

    if (sourceRevision !== await loadPlanningSourceRevision(supabaseAdmin, masterPlanNo)) {
      throw new ApiError(409, "แผนถูกยืนยัน/เผยแพร่ใหม่ระหว่าง Export กรุณาโหลดข้อมูลล่าสุดแล้วลองอีกครั้ง");
    }
    const newReservedNos = uniqueKeysToReserve.size > 0
      ? await reserveDocumentNumbers(supabaseAdmin, uniqueKeysToReserve.size, now)
      : [];

    let newNosIndex = 0;
    const assignedDocNosMap = new Map();

    const documentNos = documentsToConfirm.map((doc) => {
      const resolvedShiftCode = doc.shiftCode || doc.shiftId || "UNASSIGNED_SHIFT";
      const resolvedRoomId = doc.roomId || "UNASSIGNED_ROOM";
      const key = buildConfirmedDocumentKey({
        grain: doc.grain,
        ownerDepartmentId: doc.ownerDepartmentId,
        roomId: resolvedRoomId,
        shiftCode: resolvedShiftCode,
        dispatchSplitMode: doc.dispatchSplitMode,
        dispatchMaterialGroup: doc.dispatchMaterialGroup,
        selectedDate,
        dateFrom: dateFromInput,
        dateTo: dateToInput,
        parentSku: doc.parentSku,
        workstreamCode: doc.workstreamCode,
        consolidateRequisitionPreviewByDate: doc.consolidateRequisitionPreviewByDate,
      });
      
      if (assignedDocNosMap.has(key)) {
        return assignedDocNosMap.get(key);
      }

      let docNo;
      if (matchedDocumentNoMap.has(key)) {
        docNo = matchedDocumentNoMap.get(key);
      } else {
        docNo = newReservedNos[newNosIndex++];
      }

      assignedDocNosMap.set(key, docNo);
      return docNo;
    });

    const exportedAt = now.toISOString();

    const dateFormatted = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;
    const excelFileName = `${masterPlanNo}_REQUISITIONS_${now.toISOString().slice(0, 10).replace(/-/g, "")}.xlsx`;

    // Create the batch insert for export history
    const batchInsert = await supabaseAdmin
      .from("production_requisition_export_batches")
      .insert({
        master_plan_no: masterPlanNo,
        file_name: excelFileName,
        exported_by: permission.userId,
        exported_at: exportedAt,
        group_count: documentsToConfirm.length,
        row_count: documentsToConfirm.reduce((sum, d) => sum + d.lines.length, 0),
        metadata: {
          exportMode: "unified",
          selectedDate,
          dateFrom: dateFromInput,
          dateTo: dateToInput,
          selectedDepartmentIdsDaily,
          selectedDepartmentIdsConsolidated,
          confirmMode: "unified_console",
        },
      })
      .select("*")
      .single();

    if (batchInsert.error) throw batchInsert.error;

    let exportRows = [];
    const allGroupItemsRows = [];
    let allExportLinesRows = [];
    const allExportUpsertsMap = new Map();

    // 1. Bulk insert all group batches
    const groupBatchesToInsert = documentsToConfirm.map((doc, index) => {
      const documentNo = documentNos[index];
      const ownerDeptCode = String(doc.ownerDepartmentCode || "").trim() || "KP00";

      const matGroupLabel = doc.dispatchSplitMode === "split_by_material_type"
        ? (doc.dispatchMaterialGroup === "PACK" ? "บรรจุภัณฑ์" : "วัตถุดิบ")
        : "";

      const groupName = [
        doc.ownerDepartmentName || doc.ownerDepartmentCode || "แผนก",
        doc.roomLabel || "ห้อง",
        doc.shiftCode || doc.shiftName || "กะ",
        !doc.parentSku ? doc.workstreamName : "",
        doc.parentSkuName || doc.parentSku || "",
        matGroupLabel,
        doc.grain === "daily" ? "(รายวัน)" : "(ควบรวม)",
      ].filter(Boolean).join(" - ");

      const groupMetadata = {
        exportMode: doc.grain === "daily" ? "daily" : "consolidated",
        roomId: doc.roomId,
        roomLabel: doc.roomLabel,
        shiftCode: doc.shiftCode,
        shiftName: doc.shiftName,
        parentSku: doc.parentSku || null,
        parentSkuName: doc.parentSkuName || null,
        workstreamCode: doc.workstreamCode || null,
        workstreamName: doc.workstreamName || null,
        consolidateRequisitionPreviewByDate:
          doc.consolidateRequisitionPreviewByDate === true,
        ownerDepartmentId: doc.ownerDepartmentId,
        ownerDepartmentCode: doc.ownerDepartmentCode,
        ownerDepartmentName: doc.ownerDepartmentName,
        lookup27DepartmentCode: ownerDeptCode,
        dispatchSplitMode: doc.dispatchSplitMode || "merge_all",
        dispatchMaterialGroup: doc.dispatchMaterialGroup || null,
      };

      if (doc.grain === "daily") {
        groupMetadata.selectedDate = selectedDate;
      } else {
        groupMetadata.dateFrom = dateFromInput;
        groupMetadata.dateTo = dateToInput;
      }

      return {
        master_plan_no: masterPlanNo,
        claim_grain: doc.grain,
        status: "exported",
        created_by: permission.userId,
        confirmed_by: permission.userId,
        exported_by: permission.userId,
        confirmed_at: exportedAt,
        exported_at: exportedAt,
        document_no: documentNo,
        export_batch_id: batchInsert.data.id,
        group_name: groupName,
        metadata: groupMetadata,
      };
    });

    const { data: insertedGroups, error: groupBatchesError } = await supabaseAdmin
      .from("production_requisition_group_batches")
      .insert(groupBatchesToInsert)
      .select("id, document_no");

    if (groupBatchesError) throw groupBatchesError;

    const groupMapByDocNo = new Map(insertedGroups.map((g) => [g.document_no, g.id]));
    const lineSeqMapByDocRef = new Map();

    // 2. Loop and assemble child lines in memory
    for (let index = 0; index < documentsToConfirm.length; index += 1) {
      const doc = documentsToConfirm[index];
      const documentNo = documentNos[index];
      const ownerDeptCode = String(doc.ownerDepartmentCode || "").trim() || "KP00";
      const groupId = groupMapByDocNo.get(documentNo);

      if (!lineSeqMapByDocRef.has(documentNo)) {
        lineSeqMapByDocRef.set(documentNo, 1);
      }
      let lineSeq = lineSeqMapByDocRef.get(documentNo);

      doc.lines.forEach((line) => {
        Object.entries(line.qtyByDate || {}).forEach(([itemDate, qty]) => {
          const itemDateNorm = normalizeDateOnly(itemDate);
          if (!itemDateNorm) return;
          if (doc.grain === "daily" && itemDateNorm !== selectedDate) return;
          if (doc.grain === "weekly" && (itemDateNorm < dateFromInput || itemDateNorm > dateToInput)) return;

          const lineQty = roundQty(qty);
          if (lineQty <= 0) return;

          const sourceRowKey = [
            masterPlanNo,
            doc.grain,
            itemDateNorm,
            line.materialGoodsCode,
            doc.ownerDepartmentId || "UNASSIGNED",
            doc.parentSku || "UNASSIGNED_SKU",
            `daily_preview|${doc.roomId || "ALL"}|${doc.shiftCode || "ALL"}`,
            groupId,
            batchInsert.data.id,
          ].join("|");

          allGroupItemsRows.push({
            group_id: groupId,
            master_plan_no: masterPlanNo,
            claim_grain: doc.grain,
            bucket_date: itemDateNorm,
            material_sku_code: line.materialSkuCode || line.materialGoodsCode,
            material_goods_code: line.materialGoodsCode,
            owner_department_id: doc.ownerDepartmentId,
            claim_department_id: doc.ownerDepartmentId,
            issue_qty: lineQty,
            required_qty: lineQty,
            source_row_key: sourceRowKey,
            created_by: permission.userId,
            metadata: {
              materialName: line.materialName,
              unit: line.unit,
              itemType: line.itemType,
              demandSource: "daily_preview",
              roomId: doc.roomId,
              roomLabel: doc.roomLabel,
              shiftCode: doc.shiftCode,
              shiftName: doc.shiftName,
              ownerDepartmentCode: doc.ownerDepartmentCode,
              ownerDepartmentName: doc.ownerDepartmentName,
            },
          });
        });

        let totalExportQty = 0;
        if (doc.grain === "daily") {
          totalExportQty = roundQty(line.qtyByDate[selectedDate]);
        } else {
          totalExportQty = roundQty(Object.entries(line.qtyByDate || {}).reduce((sum, [dateKey, q]) => {
            const dateKeyNorm = normalizeDateOnly(dateKey);
            if (dateKeyNorm && dateKeyNorm >= dateFromInput && dateKeyNorm <= dateToInput) {
              return sum + toNumber(q);
            }
            return sum;
          }, 0));
        }

        if (totalExportQty > 0) {
          const storageLocation = resolveRequisitionStorageLocation({
            itemType: line.itemType,
            materialSkuCode: line.materialSkuCode,
            materialGoodsCode: line.materialGoodsCode,
          });
          allExportLinesRows.push({
            doc_ref: documentNo,
            line_seq: lineSeq++,
            sku_code: line.materialGoodsCode,
            sku_name: line.materialName || line.materialGoodsCode,
            qty: totalExportQty,
            uom: line.unit || null,
            warehouse_code: storageLocation,
            meta: {
              exportBatchId: batchInsert.data.id,
              groupId: groupId,
              ownerDepartmentId: doc.ownerDepartmentId,
              materialSkuCode: line.materialSkuCode,
              materialGoodsCode: line.materialGoodsCode,
              itemType: line.itemType || null,
              lotAllocationKey: `${doc.documentKey}::${normalizeSku(line.materialGoodsCode)}|${normalizeSku(line.unit)}`,
            },
          });

          // Build premium structured note (หมายเหตุ)
          const rawShift = String(doc.shiftName || doc.shiftCode || doc.shiftId || "").trim();
          const shiftPart = rawShift ? (rawShift.startsWith("กะ") ? rawShift : `กะ${rawShift}`) : "";

          const rawDept = String(doc.ownerDepartmentName || doc.ownerDepartmentCode || "").trim();
          const deptPart = rawDept ? (rawDept.startsWith("แผนก") ? rawDept : `แผนก${rawDept}`) : "";

          const rawRoom = String(doc.roomLabel || doc.roomId || "").trim();
          const cleanRoom = rawRoom.replace(/^\[[^\]]+\]\s*/, "").trim();
          const roomPart = cleanRoom ? (cleanRoom.startsWith("ห้อง") ? cleanRoom : `ห้อง${cleanRoom}`) : "";

          const matGroupPart = doc.dispatchSplitMode === "split_by_material_type"
            ? (doc.dispatchMaterialGroup === "PACK" ? "บรรจุภัณฑ์" : "วัตถุดิบ")
            : "";

          const remarkDate = doc.grain === "daily"
            ? formatRequisitionRemarkDate(selectedDate)
            : `${formatRequisitionRemarkDate(dateFromInput)} ถึง ${formatRequisitionRemarkDate(dateToInput)}`;

          const deptRoom = [deptPart, roomPart, matGroupPart].filter(Boolean).join(" ");
          const locationStr = [shiftPart, deptRoom].filter(Boolean).join(" - ");

          const remarkStr = [locationStr, buildRequisitionPlanRemark(remarkDate)].filter(Boolean).join(" - ");

          exportRows.push({
            "วันที่เอกสาร": dateFormatted,
            "เลขที่เอกสาร": documentNo,
            "รหัสสาขา": "00000",
            "รหัสแผนก": ownerDeptCode,
            "รหัสโครงการ": "0",
            "เบิกไปสำหรับ": "1",
            "ราคาที่แสดง": "-1",
            "หมายเหตุ": remarkStr,
            "รหัสซื้อขาย": line.materialGoodsCode,
            "จำนวน": totalExportQty,
            "ราคาต่อหน่วย": "",
            "น้ำหนักต่อหน่วย": "",
            "เลขล็อต": "",
            "เลขกำกับ": "",
            "ตำแหน่งเก็บ": storageLocation,
          });
        }
      });

      allExportUpsertsMap.set(documentNo, {
        doc_ref: documentNo,
        master_plan_no: masterPlanNo,
        sub_plan_no: null,
        department_id: doc.ownerDepartmentId,
        export_mode: doc.grain,
        date_from: doc.grain === "daily" ? selectedDate : dateFromInput,
        date_to: doc.grain === "daily" ? selectedDate : dateToInput,
        status: "exported",
        exported_at: exportedAt,
        exported_by: permission.userId,
        created_by: permission.userId,
        updated_by: permission.userId,
        reconcile_result: {
          source: "requisition_daily_confirm",
          groupId: groupId,
          exportBatchId: batchInsert.data.id,
          mergedLineCount: doc.lines.length,
        },
      });

      lineSeqMapByDocRef.set(documentNo, lineSeq);
    }

    const { data: otherReservations, error: otherReservationsError } = await supabaseAdmin
      .from("production_requisition_lot_reservations")
      .select("reservation_key, parent_sku_code, lot_no, warehouse_code, reserved_base_qty")
      .eq("master_plan_no", masterPlanNo);
    if (otherReservationsError) throw otherReservationsError;
    const otherReservedBaseQty = {};
    (otherReservations || [])
      .filter((row) => !lotReservationKeys.includes(String(row?.reservation_key || "").trim()))
      .forEach((row) => {
        const key = reservationLotKey(row?.parent_sku_code, row?.lot_no, row?.warehouse_code);
        otherReservedBaseQty[key] = roundQty(toNumber(otherReservedBaseQty[key]) + toNumber(row?.reserved_base_qty));
      });
    const reservedBaseQtyByRequestKey = Object.fromEntries(allExportLinesRows.map((line, index) => [
      String(line?.meta?.lotAllocationKey || index),
      otherReservedBaseQty,
    ]));

    const allocatedExport = await allocateLotNumbersForExportRows({
      exportRows,
      lineRows: allExportLinesRows,
      codeKey: "รหัสซื้อขาย",
      qtyKey: "จำนวน",
      lotKey: "เลขล็อต",
      locationKey: "ตำแหน่งเก็บ",
      allowPartialStock: true,
      allocationOverridesByKey: lotAllocationOverrides,
      reservedBaseQtyByRequestKey,
    });
    exportRows = allocatedExport.exportRows;
    allExportLinesRows = allocatedExport.lineRows;

    const shortageByDocRef = new Map();
    allocatedExport.shortages.forEach((shortage) => {
      const docRef = String(shortage?.docRef || "").trim();
      if (!docRef) return;
      const list = shortageByDocRef.get(docRef) || [];
      list.push(shortage);
      shortageByDocRef.set(docRef, list);
    });

    allExportUpsertsMap.forEach((record, docRef) => {
      const shortages = shortageByDocRef.get(String(docRef || "").trim()) || [];
      record.reconcile_result = {
        ...(record.reconcile_result || {}),
        stockAllocationStatus: shortages.length ? "partial" : "complete",
        stockShortages: shortages,
      };
    });

    if (allocatedExport.isPartialStock) {
      const existingBatchMetadata = batchInsert.data?.metadata || {};
      const { error: batchMetadataError } = await supabaseAdmin
        .from("production_requisition_export_batches")
        .update({
          row_count: exportRows.length,
          metadata: {
            ...existingBatchMetadata,
            partialStock: true,
            shortageCount: allocatedExport.shortages.length,
            stockShortages: allocatedExport.shortages,
          },
        })
        .eq("id", batchInsert.data.id);
      if (batchMetadataError) throw batchMetadataError;
    }

    const allExportUpserts = Array.from(allExportUpsertsMap.values());

    // 3. Batch DB insertions respecting foreign key constraints
    if (allGroupItemsRows.length > 0) {
      const { error: groupItemsError } = await supabaseAdmin
        .from("production_requisition_group_items")
        .insert(allGroupItemsRows);
      if (groupItemsError) {
        const insertedGroupIds = (insertedGroups || []).map((group) => group.id).filter(Boolean);
        if (insertedGroupIds.length > 0) {
          await supabaseAdmin
            .from("production_requisition_group_batches")
            .delete()
            .in("id", insertedGroupIds)
            .eq("export_batch_id", batchInsert.data.id);
        }
        await supabaseAdmin
          .from("production_requisition_export_batches")
          .delete()
          .eq("id", batchInsert.data.id);
        throw groupItemsError;
      }
    }

    const { error: versionedExportError } = await supabaseAdmin.rpc("save_requisition_export_version", {
      p_export_batch_id: batchInsert.data.id,
      p_exports: allExportUpserts,
      p_lines: allExportLinesRows,
      p_exported_by: permission.userId,
      p_metadata: {
        excludedDocumentKeys,
        reExport: existingExportGroups.length > 0,
      },
    });
    if (versionedExportError) {
      const migrationMissing = String(versionedExportError.code || "") === "PGRST202"
        || String(versionedExportError.message || "").includes("save_requisition_export_version");
      if (!migrationMissing || existingExportGroups.length > 0) {
        // PostgreSQL errors mean the RPC transaction was rolled back. Remove only
        // the rows created by this failed request so a retry cannot leave a fake
        // exported group/batch behind. Do not clean up ambiguous network errors.
        if (/^[0-9A-Z]{5}$/.test(String(versionedExportError.code || ""))) {
          const insertedGroupIds = (insertedGroups || []).map((group) => group.id).filter(Boolean);
          if (insertedGroupIds.length > 0) {
            const { error: cleanupGroupsError } = await supabaseAdmin
              .from("production_requisition_group_batches")
              .delete()
              .in("id", insertedGroupIds)
              .eq("export_batch_id", batchInsert.data.id);
            if (cleanupGroupsError) {
              console.error("Failed to clean up requisition groups after export error", cleanupGroupsError);
            }
          }

          const { error: cleanupBatchError } = await supabaseAdmin
            .from("production_requisition_export_batches")
            .delete()
            .eq("id", batchInsert.data.id);
          if (cleanupBatchError) {
            console.error("Failed to clean up requisition batch after export error", cleanupBatchError);
          }
        }

        if (migrationMissing) {
          const migrationError = new Error("ยังไม่ได้ติดตั้งระบบประวัติ Export จึงไม่สามารถ Export ซ้ำอย่างปลอดภัยได้");
          migrationError.status = 503;
          throw migrationError;
        }
        throw versionedExportError;
      }

      const { error: exportUpsertError } = await supabaseAdmin
        .from("production_requisition_exports")
        .upsert(allExportUpserts, { onConflict: "doc_ref" });
      if (exportUpsertError) throw exportUpsertError;
      if (allExportLinesRows.length > 0) {
        const { error: linesInsertError } = await supabaseAdmin
          .from("production_requisition_export_lines")
          .insert(allExportLinesRows);
        if (linesInsertError) throw linesInsertError;
      }
    }

    if (lotReservationKeys.length > 0) {
      await fetchSupabaseRowsByChunks(
        lotReservationKeys,
        (chunk) => supabaseAdmin
          .from("production_requisition_lot_reservations")
          .delete()
          .eq("master_plan_no", masterPlanNo)
          .in("reservation_key", chunk)
      );
    }

    const excelModule = await import("exceljs");
    const ExcelJS = excelModule.default ?? excelModule;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("requisition");

    sheet.columns = [
      { header: "วันที่เอกสาร", key: "วันที่เอกสาร", width: 14 },
      { header: "เลขที่เอกสาร", key: "เลขที่เอกสาร", width: 18 },
      { header: "รหัสสาขา", key: "รหัสสาขา", width: 12 },
      { header: "รหัสแผนก", key: "รหัสแผนก", width: 14 },
      { header: "รหัสโครงการ", key: "รหัสโครงการ", width: 12 },
      { header: "เบิกไปสำหรับ", key: "เบิกไปสำหรับ", width: 20 },
      { header: "ราคาที่แสดง", key: "ราคาที่แสดง", width: 12 },
      { header: "หมายเหตุ", key: "หมายเหตุ", width: 20 },
      { header: "รหัสซื้อขาย", key: "รหัสซื้อขาย", width: 18 },
      { header: "จำนวน", key: "จำนวน", width: 14 },
      { header: "ราคาต่อหน่วย", key: "ราคาต่อหน่วย", width: 14 },
      { header: "น้ำหนักต่อหน่วย", key: "น้ำหนักต่อหน่วย", width: 16 },
      { header: "เลขล็อต", key: "เลขล็อต", width: 12 },
      { header: "เลขกำกับ", key: "เลขกำกับ", width: 12 },
      { header: "ตำแหน่งเก็บ", key: "ตำแหน่งเก็บ", width: 12 },
    ];

    exportRows.forEach((row) => sheet.addRow(row));
    sheet.getRow(1).font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${excelFileName}"`,
        "Cache-Control": "no-store",
        "X-Export-Batch-Id": String(batchInsert.data.id),
        "X-Document-Count": String(documentNos.length),
        "X-Partial-Stock": allocatedExport.isPartialStock ? "true" : "false",
        "X-Stock-Shortage-Count": String(allocatedExport.shortages.length),
      },
    });

  } catch (error) {
    return jsonError(error);
  }
}
