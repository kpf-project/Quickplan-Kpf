import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { canConsolidateCrossQa, loadClaimScope } from "@/lib/claimPermissions";
import { allocateLotNumbersForExportRows } from "@/lib/requisitionLotExport";
import { resolveRequisitionStorageLocation } from "@/lib/requisitionStorageLocation";
import {
  formatDocumentDate,
  listRequisitionGroupItems,
  reserveDocumentNumbers,
  REQUISITION_GROUP_STATUS,
} from "@/lib/requisitionGroups";
import { fetchSupabaseRowsByChunks } from "@/lib/supabaseRangeFetch";

export const dynamic = "force-dynamic";

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildExcelFilename(masterPlanNo, exportedAt = new Date()) {
  const y = exportedAt.getFullYear();
  const m = String(exportedAt.getMonth() + 1).padStart(2, "0");
  const d = String(exportedAt.getDate()).padStart(2, "0");
  return `${String(masterPlanNo || "requisition").trim().toUpperCase()}_${y}${m}${d}.xlsx`;
}

function formatDepartmentCodeForExcel(value) {
  const code = String(value || "").trim();
  if (!code) return "";
  return code;
}

function buildLineMergeKey(group, item) {
  const materialCode = String(item.material_goods_code || item.material_sku_code || "").trim().toUpperCase();
  const ownerDepartmentId = String(item.owner_department_id || "").trim() || "UNASSIGNED";
  if (group?.can_consolidate_cross_qa) {
    return materialCode;
  }
  return `${materialCode}|${ownerDepartmentId}`;
}

function aggregateGroupLines(group, items = []) {
  const byKey = new Map();

  items.forEach((item) => {
    const mergeKey = buildLineMergeKey(group, item);
    if (!byKey.has(mergeKey)) {
      byKey.set(mergeKey, {
        materialCode: String(item.material_goods_code || item.material_sku_code || "").trim(),
        materialSkuCode: String(item.material_sku_code || "").trim(),
        materialName: item?.metadata?.materialName || String(item.material_goods_code || item.material_sku_code || "").trim(),
        unit: item?.metadata?.unit || "",
        itemType: String(item?.metadata?.itemType || "").trim().toUpperCase(),
        ownerDepartmentIds: new Set(),
        claimDepartmentIds: new Set(),
        qty: 0,
        sourceRowKeys: new Set(),
        sourceItemIds: new Set(),
      });
    }

    const target = byKey.get(mergeKey);
    target.qty += toNumber(item.issue_qty, 0);
    if (item.owner_department_id) target.ownerDepartmentIds.add(String(item.owner_department_id).trim());
    if (item.claim_department_id) target.claimDepartmentIds.add(String(item.claim_department_id).trim());
    if (item.source_row_key) target.sourceRowKeys.add(String(item.source_row_key).trim());
    if (item.id) target.sourceItemIds.add(String(item.id).trim());
  });

  return Array.from(byKey.values())
    .map((line) => ({
      ...line,
      qty: Number(line.qty.toFixed(3)),
      ownerDepartmentIds: Array.from(line.ownerDepartmentIds),
      claimDepartmentIds: Array.from(line.claimDepartmentIds),
      sourceRowKeys: Array.from(line.sourceRowKeys),
      sourceItemIds: Array.from(line.sourceItemIds),
    }))
    .sort((left, right) => String(left.materialCode).localeCompare(String(right.materialCode)));
}

export async function POST(request) {
  try {
    const permission = await requirePermissionKeys(request, [
      "admin-requisition",
      "production-line-planning-manage",
      "plan.view_claim_all",
      "plan.consolidate_cross_qa",
    ]);
    const body = await readJson(request);
    const groupIds = Array.from(
      new Set((Array.isArray(body?.groupIds) ? body.groupIds : []).map((item) => String(item || "").trim()).filter(Boolean))
    );

    if (!groupIds.length) {
      return NextResponse.json({ error: "groupIds is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const viewScope = await loadClaimScope({
      supabaseAdmin,
      request,
      permission,
      action: "view",
    });

    const groups = await fetchSupabaseRowsByChunks(
      groupIds,
      (chunk) => supabaseAdmin
        .from("production_requisition_group_batches")
        .select("*")
        .in("id", chunk)
        .order("created_at", { ascending: true })
    );

    if (groups.length !== groupIds.length) {
      return NextResponse.json({ error: "Some requisition groups were not found" }, { status: 404 });
    }
    if (!groups.every((group) => group.status === REQUISITION_GROUP_STATUS.ready)) {
      return NextResponse.json({ error: "Only ready_to_export groups may be exported" }, { status: 400 });
    }

    const items = await listRequisitionGroupItems(supabaseAdmin, groupIds);
    const itemsByGroupId = new Map();
    items.forEach((item) => {
      const key = String(item.group_id || "").trim();
      if (!itemsByGroupId.has(key)) itemsByGroupId.set(key, []);
      itemsByGroupId.get(key).push(item);
    });

    const allowedDeptSet = new Set(viewScope.departmentIds || []);
    const violatingGroup = groups.find((group) => {
      if (viewScope.canManageGlobal || permission.isAdmin || canConsolidateCrossQa(permission)) return false;
      const groupItems = itemsByGroupId.get(String(group.id || "").trim()) || [];
      return groupItems.some((item) => !allowedDeptSet.has(String(item.owner_department_id || "").trim()));
    });
    if (violatingGroup) {
      return NextResponse.json({ error: "Group scope violation during export" }, { status: 403 });
    }

    const now = new Date();
    const documentNos = await reserveDocumentNumbers(supabaseAdmin, groups.length, now);
    const exportedAt = now.toISOString();
    const masterPlanNo = String(groups[0]?.master_plan_no || "").trim().toUpperCase();
    const fileName = buildExcelFilename(masterPlanNo, now);

    const batchInsert = await supabaseAdmin
      .from("production_requisition_export_batches")
      .insert({
        master_plan_no: masterPlanNo,
        file_name: fileName,
        exported_by: permission.userId,
        exported_at: exportedAt,
        group_count: groups.length,
        row_count: items.length,
        metadata: {
          groupIds,
        },
      })
      .select("*")
      .single();

    if (batchInsert.error) {
      return NextResponse.json({ error: batchInsert.error.message }, { status: 500 });
    }

    let exportRows = [];
    const exportHeaders = [];
    const exportDate = formatDocumentDate(now);

    const allExportUpserts = [];
    const allDeleteDocRefs = [];
    let allLineRows = [];
    const allGroupBatchUpdates = [];

    for (let index = 0; index < groups.length; index += 1) {
      const group = groups[index];
      const documentNo = documentNos[index];
      const groupItems = itemsByGroupId.get(String(group.id || "").trim()) || [];
      const aggregatedLines = aggregateGroupLines(group, groupItems);

      allExportUpserts.push({
        doc_ref: documentNo,
        master_plan_no: group.master_plan_no,
        sub_plan_no: null,
        department_id: groupItems[0]?.claim_department_id || groupItems[0]?.owner_department_id || null,
        export_mode: group.claim_grain || "weekly",
        date_from: groupItems.map((item) => item.bucket_date).filter(Boolean).sort()[0] || null,
        date_to: groupItems.map((item) => item.bucket_date).filter(Boolean).sort().slice(-1)[0] || null,
        status: "exported",
        exported_at: exportedAt,
        exported_by: permission.userId,
        exported_by_name: null,
        created_by: permission.userId,
        updated_by: permission.userId,
        reconcile_result: {
          source: "requisition_group_export",
          groupId: group.id,
          exportBatchId: batchInsert.data.id,
          mergedLineCount: aggregatedLines.length,
          sourceItemCount: groupItems.length,
        },
      });

      allDeleteDocRefs.push(documentNo);

      aggregatedLines.forEach((line, lineIndex) => {
        const storageLocation = resolveRequisitionStorageLocation({
          itemType: line.itemType,
          materialSkuCode: line.materialSkuCode,
          materialGoodsCode: line.materialCode,
        });
        allLineRows.push({
          doc_ref: documentNo,
          line_seq: lineIndex + 1,
          sku_code: line.materialCode,
          sku_name: line.materialName || line.materialCode,
          qty: line.qty,
          uom: line.unit || null,
          lot_no: null,
          warehouse_code: storageLocation,
          remark: null,
          meta: {
            exportBatchId: batchInsert.data.id,
            groupId: group.id,
            ownerDepartmentIds: line.ownerDepartmentIds,
            claimDepartmentIds: line.claimDepartmentIds,
            sourceRowKeys: line.sourceRowKeys,
            sourceItemIds: line.sourceItemIds,
            materialSkuCode: line.materialSkuCode,
            materialGoodsCode: line.materialCode,
            itemType: line.itemType || null,
          },
        });
      });

      allGroupBatchUpdates.push({
        id: group.id,
        status: REQUISITION_GROUP_STATUS.exported,
        document_no: documentNo,
        export_batch_id: batchInsert.data.id,
        exported_by: permission.userId,
        exported_at: exportedAt,
      });

      exportHeaders.push({
        groupId: group.id,
        documentNo,
        groupName: group.group_name || null,
        lineCount: aggregatedLines.length,
      });

      aggregatedLines.forEach((line) => {
        const storageLocation = resolveRequisitionStorageLocation({
          itemType: line.itemType,
          materialSkuCode: line.materialSkuCode,
          materialGoodsCode: line.materialCode,
        });
        const exportDepartmentCode = formatDepartmentCodeForExcel(
          group?.metadata?.lookup27DepartmentCode || ""
        );
        exportRows.push({
          "วันที่เอกสาร": exportDate,
          "เลขที่เอกสาร": documentNo,
          "รหัสสาขา": "00000",
          "รหัสแผนก": exportDepartmentCode,
          "รหัสโครงการ": "0",
          "เบิกไปสำหรับ": "1",
          "ราคาที่แสดง": "-1",
          "หมายเหตุ": "",
          "รหัสซื้อขาย": line.materialCode,
          "จำนวน": line.qty,
          "ราคาต่อหน่วย": "",
          "น้ำหนักต่อหน่วย": "",
          "เลขล็อต": "",
          "เลขกำกับ": "",
          "ตำแหน่งเก็บ": storageLocation,
        });
      });
    }

    const allocatedExport = await allocateLotNumbersForExportRows({
      exportRows,
      lineRows: allLineRows,
      codeKey: "รหัสซื้อขาย",
      qtyKey: "จำนวน",
      lotKey: "เลขล็อต",
      locationKey: "ตำแหน่งเก็บ",
    });
    exportRows = allocatedExport.exportRows;
    allLineRows = allocatedExport.lineRows;

    // 1. Delete old lines in bulk to avoid duplicates
    if (allDeleteDocRefs.length > 0) {
      const uniqueDeleteDocRefs = Array.from(new Set(allDeleteDocRefs.filter(Boolean)));
      for (let i = 0; i < uniqueDeleteDocRefs.length; i += 40) {
        const chunk = uniqueDeleteDocRefs.slice(i, i + 40);
        const { error: deleteError } = await supabaseAdmin
          .from("production_requisition_export_lines")
          .delete()
          .in("doc_ref", chunk);
        if (deleteError) {
          return NextResponse.json({ error: deleteError.message }, { status: 500 });
        }
      }
    }

    // 2. Perform DB operations respecting foreign key constraints
    const firstPhase = [];

    if (allExportUpserts.length > 0) {
      firstPhase.push(
        supabaseAdmin
          .from("production_requisition_exports")
          .upsert(allExportUpserts, { onConflict: "doc_ref" })
          .then(({ error }) => {
            if (error) throw error;
          })
      );
    }

    if (allGroupBatchUpdates.length > 0) {
      firstPhase.push(
        supabaseAdmin
          .from("production_requisition_group_batches")
          .upsert(allGroupBatchUpdates, { onConflict: "id" })
          .then(({ error }) => {
            if (error) throw error;
          })
      );
    }

    if (firstPhase.length > 0) {
      try {
        await Promise.all(firstPhase);
      } catch (err) {
        return NextResponse.json({ error: err.message }, { status: 500 });
      }
    }

    if (allLineRows.length > 0) {
      const { error: linesInsertError } = await supabaseAdmin
        .from("production_requisition_export_lines")
        .insert(allLineRows);
      if (linesInsertError) {
        return NextResponse.json({ error: linesInsertError.message }, { status: 500 });
      }
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
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
        "X-Export-Batch-Id": String(batchInsert.data.id),
        "X-Document-Count": String(documentNos.length),
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
