import { NextResponse } from "next/server";
import { ApiError, getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeMasterPlanNo } from "@/lib/planNo";
import { normalizeDateOnly } from "@/lib/materialClaims";
import { reserveDocumentNumbers } from "@/lib/requisitionGroups";
import { allocateLotNumbersForExportRows } from "@/lib/requisitionLotExport";
import { resolveRequisitionStorageLocation } from "@/lib/requisitionStorageLocation";
import {
  assertRequisitionDepartmentAccess,
  loadRequisitionAccessScope,
} from "@/lib/requisitionPreviewAccess";

export const dynamic = "force-dynamic";

const MAX_SUPPLEMENTAL_BYTES = 512 * 1024;
const MAX_SUPPLEMENTAL_LINES = 150;

const EXPORT_COLUMNS = [
  { header: "วันที่เอกสาร", key: "วันที่เอกสาร", width: 14 },
  { header: "เลขที่เอกสาร", key: "เลขที่เอกสาร", width: 18 },
  { header: "รหัสสาขา", key: "รหัสสาขา", width: 12 },
  { header: "รหัสแผนก", key: "รหัสแผนก", width: 14 },
  { header: "รหัสโครงการ", key: "รหัสโครงการ", width: 12 },
  { header: "เบิกไปสำหรับ", key: "เบิกไปสำหรับ", width: 20 },
  { header: "ราคาที่แสดง", key: "ราคาที่แสดง", width: 12 },
  { header: "หมายเหตุ", key: "หมายเหตุ", width: 32 },
  { header: "รหัสซื้อขาย", key: "รหัสซื้อขาย", width: 18 },
  { header: "จำนวน", key: "จำนวน", width: 14 },
  { header: "ราคาต่อหน่วย", key: "ราคาต่อหน่วย", width: 14 },
  { header: "น้ำหนักต่อหน่วย", key: "น้ำหนักต่อหน่วย", width: 16 },
  { header: "เลขล็อต", key: "เลขล็อต", width: 12 },
  { header: "เลขกำกับ", key: "เลขกำกับ", width: 12 },
  { header: "ตำแหน่งเก็บ", key: "ตำแหน่งเก็บ", width: 12 },
];

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeCode(value) {
  return normalizeText(value).toUpperCase();
}

function toNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundQty(value) {
  return Number(toNumber(value, 0).toFixed(3));
}

function formatDocumentDate(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yyyy = String(date.getFullYear()).padStart(4, "0");
  return `${dd}/${mm}/${yyyy}`;
}

function formatRemarkDate(value) {
  const raw = normalizeText(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const [year, month, day] = raw.split("-");
  return `${day}/${month}/${String(Number(year) + 543).slice(-2)}`;
}

function buildExcelFilename(masterPlanNo, exportedAt = new Date()) {
  const stamp = exportedAt.toISOString().slice(0, 10).replace(/-/g, "");
  return `${masterPlanNo}_SUPPLEMENTAL_REQUISITION_${stamp}.xlsx`;
}

function normalizeLines(lines) {
  if (Array.isArray(lines) && lines.length > MAX_SUPPLEMENTAL_LINES) {
    throw new ApiError(413, "too many supplemental lines");
  }
  return (Array.isArray(lines) ? lines : [])
    .map((line) => {
      const materialSkuCode = normalizeCode(line?.materialSkuCode || line?.skuCode);
      const materialGoodsCode = normalizeCode(line?.materialGoodsCode || line?.goodsCode || materialSkuCode);
      const qty = roundQty(line?.qty ?? line?.issueQty);
      const itemType = normalizeCode(line?.itemType || line?.materialType);
      return {
        materialSkuCode,
        materialGoodsCode,
        materialName: normalizeText(line?.materialName || line?.name) || materialGoodsCode,
        unit: normalizeText(line?.unit || line?.uom) || "-",
        itemType,
        qty,
        note: normalizeText(line?.note || line?.reason),
      };
    })
    .filter((line) => line.materialSkuCode && line.materialGoodsCode && line.qty > 0);
}

function requireDocumentScope(doc) {
  const ownerDepartmentId = normalizeText(doc.ownerDepartmentId);
  const roomId = normalizeText(doc.roomId);
  const shiftCode = normalizeCode(doc.shiftCode || doc.shiftId);
  if (!ownerDepartmentId || !roomId || !shiftCode) {
    throw new ApiError(400, "document ownerDepartmentId, roomId, and shiftCode are required");
  }
  return { ownerDepartmentId, roomId, shiftCode };
}

async function validateSupplementalMaterials(supabaseAdmin, lines) {
  const skuCodes = Array.from(new Set(lines.map((line) => line.materialSkuCode).filter(Boolean)));
  if (!skuCodes.length) return lines;
  const { data, error } = await supabaseAdmin
    .from("products_cache")
    .select("sku_code,sku_name,iccat_code,uom_name")
    .in("sku_code", skuCodes);
  if (error) throw error;
  const productBySku = new Map((data || []).map((row) => [normalizeCode(row?.sku_code), row]));
  const missing = skuCodes.filter((skuCode) => !productBySku.has(skuCode));
  if (missing.length) {
    throw new ApiError(400, "พบรหัสวัตถุดิบที่ไม่มีใน catalog", { missingSkuCodes: missing });
  }
  return lines.map((line) => {
    const product = productBySku.get(line.materialSkuCode);
    return {
      ...line,
      materialName: normalizeText(product?.sku_name) || line.materialName,
      unit: normalizeText(product?.uom_name) || line.unit,
    };
  });
}

function buildSupplementalRemark({ doc, workDate, reason }) {
  const shift = normalizeText(doc.shiftName || doc.shiftCode || doc.shiftId);
  const shiftPart = shift ? (shift.startsWith("กะ") ? shift : `กะ${shift}`) : "";
  const department = normalizeText(doc.ownerDepartmentName || doc.ownerDepartmentCode);
  const deptPart = department ? (department.startsWith("แผนก") ? department : `แผนก${department}`) : "";
  const roomRaw = normalizeText(doc.roomLabel || doc.roomId).replace(/^\[[^\]]+\]\s*/, "");
  const roomPart = roomRaw ? (roomRaw.startsWith("ห้อง") ? roomRaw : `ห้อง${roomRaw}`) : "";
  const materialGroup = normalizeCode(doc.dispatchMaterialGroup) === "PACK" ? "บรรจุภัณฑ์" : "";
  const scope = [shiftPart, deptPart, roomPart, materialGroup].filter(Boolean).join(" - ");
  const baseRemark = `ใบเบิกเพิ่มเติม แผนผลิต ${formatRemarkDate(workDate)}`;
  return [scope, baseRemark, reason].filter(Boolean).join(" - ");
}

function metadataMatchesDate(metadata, workDate) {
  const selectedDate = normalizeDateOnly(metadata?.selectedDate || metadata?.bucketDate || metadata?.workDate);
  if (selectedDate && selectedDate === workDate) return true;
  const dateFrom = normalizeDateOnly(metadata?.dateFrom);
  const dateTo = normalizeDateOnly(metadata?.dateTo);
  return Boolean(dateFrom && dateTo && workDate >= dateFrom && workDate <= dateTo);
}

async function assertMainRequisitionExported(supabaseAdmin, { masterPlanNo, workDate, doc }) {
  const { data, error } = await supabaseAdmin
    .from("production_requisition_group_batches")
    .select("id,document_no,metadata,claim_grain,status")
    .eq("master_plan_no", masterPlanNo)
    .eq("status", "exported")
    .not("document_no", "is", null)
    .in("claim_grain", ["daily", "weekly"]);

  if (error) throw error;

  const { ownerDepartmentId, roomId, shiftCode } = requireDocumentScope(doc);
  const materialGroup = normalizeCode(doc.dispatchMaterialGroup);
  const parentSku = normalizeCode(doc.parentSku);
  const workstreamCode = normalizeText(doc.workstreamCode);

  const matched = (Array.isArray(data) ? data : []).find((row) => {
    const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
    if (normalizeText(metadata.ownerDepartmentId) !== ownerDepartmentId) return false;
    if (normalizeText(metadata.roomId) !== roomId) return false;
    if (normalizeCode(metadata.shiftCode || metadata.shiftId) !== shiftCode) return false;
    if (materialGroup && normalizeCode(metadata.dispatchMaterialGroup) !== materialGroup) return false;
    if (parentSku && normalizeCode(metadata.parentSku) !== parentSku) return false;
    if (workstreamCode && normalizeText(metadata.workstreamCode) !== workstreamCode) return false;
    return metadataMatchesDate(metadata, workDate);
  });

  if (!matched) {
    const error = new Error("ยังไม่พบใบเบิกหลักที่ Export แล้วสำหรับวันที่นี้");
    error.status = 400;
    throw error;
  }

  return matched;
}

export async function POST(request) {
  try {
    const permission = await requirePermissionKeys(request, [
      "production-line-planning-manage",
      "plan.edit_own_dept",
    ]);

    const contentLength = Number(request.headers.get("content-length") || 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_SUPPLEMENTAL_BYTES) {
      throw new ApiError(413, "supplemental payload is too large");
    }

    const body = await readJson(request);
    const inputMasterPlanNo = normalizeCode(body?.masterPlanNo || body?.planNo);
    const masterPlanNo = normalizeMasterPlanNo(inputMasterPlanNo);
    const workDate = normalizeDateOnly(body?.workDate || body?.selectedDate);
    const reason = normalizeText(body?.reason) || "เบิกเพิ่มเติมหลัง Export";
    const doc = body?.document && typeof body.document === "object" ? body.document : {};
    let lines = normalizeLines(body?.lines);

    if (!inputMasterPlanNo || !masterPlanNo) {
      return NextResponse.json({ error: "masterPlanNo is required and must be valid" }, { status: 400 });
    }
    if (!workDate) {
      return NextResponse.json({ error: "workDate is required" }, { status: 400 });
    }
    if (!lines.length) {
      return NextResponse.json({ error: "กรุณาเพิ่มรายการวัตถุดิบอย่างน้อย 1 รายการ" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { ownerDepartmentId } = requireDocumentScope(doc);
    const accessScope = await loadRequisitionAccessScope({
      supabaseAdmin,
      request,
      permission,
      action: "edit",
    });
    assertRequisitionDepartmentAccess(
      accessScope,
      ownerDepartmentId,
      "ไม่มีสิทธิ์สร้างใบเบิกเพิ่มเติมของแผนกนี้"
    );
    lines = await validateSupplementalMaterials(supabaseAdmin, lines);
    const mainGroup = await assertMainRequisitionExported(supabaseAdmin, { masterPlanNo, workDate, doc });

    const now = new Date();
    const exportedAt = now.toISOString();
    const [documentNo] = await reserveDocumentNumbers(supabaseAdmin, 1, now);
    if (!documentNo) {
      return NextResponse.json({ error: "ไม่สามารถจองเลขเอกสารใบเบิกได้" }, { status: 500 });
    }

    const excelFileName = buildExcelFilename(masterPlanNo, now);
    const exportDate = formatDocumentDate(now);
    const ownerDepartmentCode = normalizeText(doc.ownerDepartmentCode) || "KP00";
    const groupName = [
      "ใบเบิกเพิ่มเติม",
      doc.ownerDepartmentName || doc.ownerDepartmentCode || "แผนก",
      doc.roomLabel || "ห้อง",
      doc.shiftName || doc.shiftCode || "กะ",
      formatRemarkDate(workDate),
    ].filter(Boolean).join(" - ");

    const batchInsert = await supabaseAdmin
      .from("production_requisition_export_batches")
      .insert({
        master_plan_no: masterPlanNo,
        file_name: excelFileName,
        exported_by: permission.userId,
        exported_at: exportedAt,
        group_count: 1,
        row_count: lines.length,
        metadata: {
          exportMode: "supplemental",
          source: "supplemental_requisition",
          workDate,
          reason,
          mainDocumentNo: mainGroup.document_no,
          mainGroupId: mainGroup.id,
        },
      })
      .select("*")
      .single();

    if (batchInsert.error) throw batchInsert.error;

    const groupInsert = await supabaseAdmin
      .from("production_requisition_group_batches")
      .insert({
        master_plan_no: masterPlanNo,
        claim_grain: "supplemental",
        status: "exported",
        created_by: permission.userId,
        confirmed_by: permission.userId,
        exported_by: permission.userId,
        confirmed_at: exportedAt,
        exported_at: exportedAt,
        document_no: documentNo,
        export_batch_id: batchInsert.data.id,
        group_name: groupName,
        destination_note: reason,
        metadata: {
          exportMode: "supplemental",
          documentType: "ใบเบิกเพิ่มเติม",
          workDate,
          reason,
          mainDocumentNo: mainGroup.document_no,
          mainGroupId: mainGroup.id,
          roomId: normalizeText(doc.roomId) || null,
          roomLabel: normalizeText(doc.roomLabel) || null,
          shiftCode: normalizeText(doc.shiftCode || doc.shiftId) || null,
          shiftName: normalizeText(doc.shiftName) || null,
          ownerDepartmentId,
          ownerDepartmentCode,
          ownerDepartmentName: normalizeText(doc.ownerDepartmentName) || null,
          dispatchMaterialGroup: normalizeText(doc.dispatchMaterialGroup) || null,
        },
      })
      .select("id")
      .single();

    if (groupInsert.error) throw groupInsert.error;

    const remark = buildSupplementalRemark({ doc, workDate, reason });
    const groupId = groupInsert.data.id;

    const groupItemsRows = lines.map((line, index) => ({
      group_id: groupId,
      master_plan_no: masterPlanNo,
      claim_grain: "supplemental",
      bucket_date: workDate,
      material_sku_code: line.materialSkuCode,
      material_goods_code: line.materialGoodsCode,
      owner_department_id: ownerDepartmentId,
      claim_department_id: ownerDepartmentId,
      issue_qty: line.qty,
      required_qty: line.qty,
      source_row_key: [
        masterPlanNo,
        "supplemental",
        workDate,
        documentNo,
        line.materialGoodsCode,
        index + 1,
      ].join("|"),
      created_by: permission.userId,
      metadata: {
        materialName: line.materialName,
        unit: line.unit,
        itemType: line.itemType || null,
        note: line.note,
        reason,
        source: "supplemental_requisition",
        mainDocumentNo: mainGroup.document_no,
      },
    }));

    const exportLineRows = lines.map((line, index) => ({
      doc_ref: documentNo,
      line_seq: index + 1,
      sku_code: line.materialGoodsCode,
      sku_name: line.materialName || line.materialGoodsCode,
      qty: line.qty,
      uom: line.unit || null,
      warehouse_code: resolveRequisitionStorageLocation(line),
      remark: line.note || reason,
      meta: {
        exportBatchId: batchInsert.data.id,
        groupId,
        ownerDepartmentId,
        materialSkuCode: line.materialSkuCode,
        materialGoodsCode: line.materialGoodsCode,
        itemType: line.itemType || null,
        source: "supplemental_requisition",
      },
    }));

    let exportRows = lines.map((line) => ({
      "วันที่เอกสาร": exportDate,
      "เลขที่เอกสาร": documentNo,
      "รหัสสาขา": "00000",
      "รหัสแผนก": ownerDepartmentCode,
      "รหัสโครงการ": "0",
      "เบิกไปสำหรับ": "1",
      "ราคาที่แสดง": "-1",
      "หมายเหตุ": [remark, line.note].filter(Boolean).join(" - "),
      "รหัสซื้อขาย": line.materialGoodsCode,
      "จำนวน": line.qty,
      "ราคาต่อหน่วย": "",
      "น้ำหนักต่อหน่วย": "",
      "เลขล็อต": "",
      "เลขกำกับ": "",
      "ตำแหน่งเก็บ": resolveRequisitionStorageLocation(line),
    }));

    const allocatedExport = await allocateLotNumbersForExportRows({
      exportRows,
      lineRows: exportLineRows,
      codeKey: "รหัสซื้อขาย",
      qtyKey: "จำนวน",
      lotKey: "เลขล็อต",
      locationKey: "ตำแหน่งเก็บ",
    });
    exportRows = allocatedExport.exportRows;

    const exportUpsert = {
      doc_ref: documentNo,
      master_plan_no: masterPlanNo,
      sub_plan_no: null,
      department_id: ownerDepartmentId,
      export_mode: "supplemental",
      date_from: workDate,
      date_to: workDate,
      status: "exported",
      exported_at: exportedAt,
      exported_by: permission.userId,
      created_by: permission.userId,
      updated_by: permission.userId,
      reconcile_result: {
        source: "supplemental_requisition",
        groupId,
        exportBatchId: batchInsert.data.id,
        mainDocumentNo: mainGroup.document_no,
        reason,
      },
    };

    await supabaseAdmin.from("production_requisition_group_items").insert(groupItemsRows).throwOnError();
    await supabaseAdmin.from("production_requisition_exports").upsert(exportUpsert, { onConflict: "doc_ref" }).throwOnError();
    await supabaseAdmin.from("production_requisition_export_lines").insert(allocatedExport.lineRows).throwOnError();

    const excelModule = await import("exceljs");
    const ExcelJS = excelModule.default ?? excelModule;
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("requisition");
    sheet.columns = EXPORT_COLUMNS;
    exportRows.forEach((row) => sheet.addRow(row));
    sheet.getRow(1).font = { bold: true };

    const buffer = await workbook.xlsx.writeBuffer();
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${excelFileName}"`,
        "Cache-Control": "no-store",
        "X-Document-Count": "1",
        "X-Document-No": documentNo,
        "X-Export-Batch-Id": String(batchInsert.data.id),
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
