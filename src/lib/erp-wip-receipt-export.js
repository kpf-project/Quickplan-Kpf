import "server-only";

import ExcelJS from "exceljs";
import { ApiError, getSupabaseAdmin } from "@/lib/adminApi";
import { loadScaleReceiptReportData } from "@/lib/scale/receipts";

const DOCUMENT_TYPE = "IMM";
const SOURCE_MODULE = "weight_receipt";
const BRANCH_CODE = "00000";
const DEPARTMENT_CODE = "KP13";
const PROJECT_CODE = "0";
const DISPLAY_PRICE = -1;
const QUANTITY = 1;
const STORAGE_LOCATION = "02";

const ERP_COLUMNS = [
  { header: "วันที่เอกสาร", key: "documentDateText", width: 16 },
  { header: "เลขที่เอกสาร", key: "documentNo", width: 18 },
  { header: "รหัสสาขา", key: "branchCode", width: 12 },
  { header: "รหัสแผนก", key: "departmentCode", width: 12 },
  { header: "รหัสโครงการ", key: "projectCode", width: 12 },
  { header: "ราคาที่แสดง", key: "displayPrice", width: 12 },
  { header: "หมายเหตุ", key: "remark", width: 34 },
  { header: "รหัสซื้อขาย", key: "tradeCode", width: 18 },
  { header: "จำนวน", key: "quantity", width: 10 },
  { header: "ราคาต่อหน่วย", key: "unitPrice", width: 14 },
  { header: "น้ำหนักต่อหน่วย", key: "unitWeightKg", width: 16 },
  { header: "เลขล็อต", key: "lotNo", width: 20 },
  { header: "เลขกำกับ", key: "trackingNo", width: 14 },
  { header: "ตำแหน่งเก็บ", key: "storageLocation", width: 12 },
  { header: "วันที่ผลิต", key: "productionDateText", width: 16 },
  { header: "วันที่หมดอายุ", key: "expiryDateText", width: 16 },
];

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeUpperText(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeDateInput(value) {
  const text = normalizeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function getBangkokDateInputFromTimestamp(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function formatChristianDate(value) {
  const text = normalizeDateInput(value);
  if (!text) {
    return "";
  }
  const [year, month, day] = text.split("-");
  return `${day}/${month}/${year}`;
}

function formatThaiDate(value) {
  const text = normalizeDateInput(value);
  if (!text) {
    return "";
  }
  const [year, month, day] = text.split("-");
  return `${day}/${month}/${Number(year) + 543}`;
}

function addOneYearDateInput(value) {
  const text = normalizeDateInput(value);
  if (!text) {
    return "";
  }
  const [year, month, day] = text.split("-").map((part) => Number(part));
  const date = new Date(Date.UTC(year + 1, month - 1, day));
  const resultYear = date.getUTCFullYear();
  const resultMonth = String(date.getUTCMonth() + 1).padStart(2, "0");
  const resultDay = String(date.getUTCDate()).padStart(2, "0");
  return `${resultYear}-${resultMonth}-${resultDay}`;
}

function getPeriodYm(value) {
  const text = normalizeDateInput(value);
  if (!text) {
    return "";
  }
  const [year, month] = text.split("-");
  return `${String(Number(year) + 543).slice(-2)}${month}`;
}

function buildFilename(dateFrom, dateTo) {
  const safeFrom = normalizeDateInput(dateFrom).replaceAll("-", "") || "all";
  const safeTo = normalizeDateInput(dateTo).replaceAll("-", "") || safeFrom;
  return `erp_wip_receipt_${safeFrom}_${safeTo}.xlsx`;
}

function parseReceiptRows(receipts) {
  const detailRows = (Array.isArray(receipts) ? receipts : [])
    .map((receipt) => {
      const receiptId = normalizeText(receipt?.id);
      const productCode = normalizeUpperText(receipt?.productCode);
      const documentDate = getBangkokDateInputFromTimestamp(receipt?.weighedAt);
      const unitWeightKg = Number(receipt?.netWeightKg || 0);

      if (!receiptId || !productCode || !documentDate) {
        return null;
      }

      return {
        sourceReceiptId: receiptId,
        documentDate,
        tradeCode: productCode,
        productName: normalizeText(receipt?.productName) || productCode,
        unitWeightKg: Number.isFinite(unitWeightKg) ? Number(unitWeightKg.toFixed(3)) : 0,
        lotNo: normalizeText(receipt?.lotNo) || "-",
        barcode: normalizeText(receipt?.barcode),
        weighedAt: receipt?.weighedAt || null,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      if (left.documentDate !== right.documentDate) {
        return left.documentDate.localeCompare(right.documentDate);
      }
      if (left.tradeCode !== right.tradeCode) {
        return left.tradeCode.localeCompare(right.tradeCode);
      }
      return left.lotNo.localeCompare(right.lotNo);
    });

  const aggregated = new Map();
  detailRows.forEach((row) => {
    const key = [row.documentDate, row.tradeCode, row.lotNo].join("|");
    if (!aggregated.has(key)) {
      aggregated.set(key, {
        sourceReceiptId: null,
        sourceReceiptIds: [],
        barcodes: [],
        documentDate: row.documentDate,
        tradeCode: row.tradeCode,
        productName: row.productName,
        quantity: 0,
        unitWeightKg: 0,
        lotNo: row.lotNo,
        weighedAt: row.weighedAt,
      });
    }

    const target = aggregated.get(key);
    target.quantity += 1;
    target.unitWeightKg = Number((target.unitWeightKg + row.unitWeightKg).toFixed(3));
    target.sourceReceiptIds.push(row.sourceReceiptId);
    if (row.barcode) {
      target.barcodes.push(row.barcode);
    }
    if (!target.weighedAt || String(row.weighedAt || "").localeCompare(String(target.weighedAt || "")) < 0) {
      target.weighedAt = row.weighedAt;
    }
  });

  return Array.from(aggregated.values()).sort((left, right) => {
    if (left.documentDate !== right.documentDate) {
      return left.documentDate.localeCompare(right.documentDate);
    }
    if (left.tradeCode !== right.tradeCode) {
      return left.tradeCode.localeCompare(right.tradeCode);
    }
    return left.lotNo.localeCompare(right.lotNo);
  });
}

function buildDocumentNote(documentDate) {
  return `รับ WIP ของวันที่ ${formatThaiDate(documentDate)}`;
}

function buildExcelLine(row, documentNo) {
  const expiryDate = addOneYearDateInput(row.documentDate);
  return {
    documentDateText: formatChristianDate(row.documentDate),
    documentNo,
    branchCode: BRANCH_CODE,
    departmentCode: DEPARTMENT_CODE,
    projectCode: PROJECT_CODE,
    displayPrice: DISPLAY_PRICE,
    remark: buildDocumentNote(row.documentDate),
    tradeCode: row.tradeCode,
    quantity: row.quantity || QUANTITY,
    unitPrice: "",
    unitWeightKg: row.unitWeightKg,
    lotNo: row.lotNo,
    trackingNo: "",
    storageLocation: STORAGE_LOCATION,
    productionDateText: formatChristianDate(row.documentDate),
    expiryDateText: formatChristianDate(expiryDate),
  };
}

async function loadRowsForExport(supabaseAdmin, filters = {}) {
  const payload = await loadScaleReceiptReportData(supabaseAdmin, {
    departmentId: normalizeText(filters.departmentId) || null,
    dateFrom: normalizeDateInput(filters.dateFrom) || null,
    dateTo: normalizeDateInput(filters.dateTo) || null,
    search: normalizeText(filters.search),
    isTest: false,
    itemStatus: normalizeText(filters.itemStatus) === "voided" ? "all" : normalizeText(filters.itemStatus) || "all",
    productCodes: Array.isArray(filters.productCodes)
      ? filters.productCodes.map((code) => normalizeUpperText(code)).filter(Boolean)
      : [],
    includeAll: true,
    page: 1,
    limit: 2000,
  });

  const receipts = (Array.isArray(payload?.receipts) ? payload.receipts : []).filter(
    (receipt) => normalizeText(receipt?.itemStatus) !== "voided"
  );
  const rows = parseReceiptRows(receipts);

  return {
    rows,
    filters: payload?.filters || {},
  };
}

function groupRowsByDocumentDate(rows) {
  const groups = new Map();
  rows.forEach((row) => {
    if (!groups.has(row.documentDate)) {
      groups.set(row.documentDate, []);
    }
    groups.get(row.documentDate).push(row);
  });
  return Array.from(groups.entries())
    .sort(([leftDate], [rightDate]) => leftDate.localeCompare(rightDate))
    .map(([documentDate, groupRows]) => ({
      documentDate,
      periodYm: getPeriodYm(documentDate),
      rows: groupRows,
    }));
}

async function previewDocumentNumbers(supabaseAdmin, groups) {
  const countsByPeriod = new Map();
  groups.forEach((group) => {
    countsByPeriod.set(group.periodYm, (countsByPeriod.get(group.periodYm) || 0) + 1);
  });

  const periodYms = Array.from(countsByPeriod.keys()).filter(Boolean);
  const latestByPeriod = new Map(periodYms.map((periodYm) => [periodYm, 0]));

  if (periodYms.length) {
    const result = await supabaseAdmin
      .from("production_erp_export_sequences")
      .select("period_ym,last_value")
      .eq("document_type", DOCUMENT_TYPE)
      .in("period_ym", periodYms);

    if (result.error) {
      throw new ApiError(500, "Failed to load ERP export sequence", result.error.message);
    }

    (result.data || []).forEach((row) => {
      latestByPeriod.set(row.period_ym, Number(row.last_value || 0));
    });
  }

  const nextByPeriod = new Map(latestByPeriod);
  return groups.map((group) => {
    const nextRunning = (nextByPeriod.get(group.periodYm) || 0) + 1;
    nextByPeriod.set(group.periodYm, nextRunning);
    return {
      documentDate: group.documentDate,
      periodYm: group.periodYm,
      runningNo: nextRunning,
      documentNo: `${DOCUMENT_TYPE}${group.periodYm}/${String(nextRunning).padStart(4, "0")}`,
      rowCount: group.rows.length,
    };
  });
}

function mapAllocatedRows(allocatedRows) {
  return new Map(
    (Array.isArray(allocatedRows) ? allocatedRows : []).map((row) => [
      normalizeDateInput(row.document_date || row.documentDate),
      {
        documentDate: normalizeDateInput(row.document_date || row.documentDate),
        periodYm: normalizeText(row.period_ym || row.periodYm),
        runningNo: Number(row.running_no || row.runningNo || 0),
        documentNo: normalizeText(row.document_no || row.documentNo),
      },
    ])
  );
}

async function allocateDocumentNumbers(supabaseAdmin, groups) {
  const documentDates = groups.map((group) => group.documentDate);
  const result = await supabaseAdmin.rpc("allocate_erp_export_document_numbers", {
    p_document_type: DOCUMENT_TYPE,
    p_document_dates: documentDates,
  });

  if (result.error) {
    throw new ApiError(500, "Failed to allocate ERP document numbers", result.error.message);
  }

  const byDate = mapAllocatedRows(result.data);
  return groups.map((group) => {
    const allocated = byDate.get(group.documentDate);
    if (!allocated?.documentNo) {
      throw new ApiError(500, "ERP document allocation is incomplete");
    }
    return {
      ...allocated,
      rowCount: group.rows.length,
    };
  });
}

function buildPreviewPayload(rows, documents, filters = {}) {
  return {
    documentType: DOCUMENT_TYPE,
    sourceModule: SOURCE_MODULE,
    dateFrom: normalizeDateInput(filters.dateFrom) || rows[0]?.documentDate || "",
    dateTo: normalizeDateInput(filters.dateTo) || rows.at(-1)?.documentDate || "",
    documentCount: documents.length,
    rowCount: rows.length,
    documents,
  };
}

async function createWorkbookBuffer(rows, documentMap) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "KPF Production Line";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("ERP_WIP_RECEIPT");
  worksheet.columns = ERP_COLUMNS;

  rows.forEach((row) => {
    const documentNo = documentMap.get(row.documentDate);
    worksheet.addRow(buildExcelLine(row, documentNo));
  });

  worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF102C57" },
  };
  worksheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };
  worksheet.getRow(1).height = 24;

  worksheet.eachRow((row, rowNumber) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFD7DDE5" } },
        left: { style: "thin", color: { argb: "FFD7DDE5" } },
        bottom: { style: "thin", color: { argb: "FFD7DDE5" } },
        right: { style: "thin", color: { argb: "FFD7DDE5" } },
      };
      cell.alignment = { vertical: "middle" };
      if (rowNumber > 1) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: rowNumber % 2 === 0 ? "FFF8FAFC" : "FFFFFFFF" },
        };
      }
    });
  });

  [
    "documentDateText",
    "documentNo",
    "branchCode",
    "departmentCode",
    "projectCode",
    "tradeCode",
    "lotNo",
    "storageLocation",
    "productionDateText",
    "expiryDateText",
  ].forEach((key) => {
    worksheet.getColumn(key).numFmt = "@";
  });
  worksheet.getColumn("unitWeightKg").numFmt = "#,##0.000";
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = `A1:${String.fromCharCode(64 + ERP_COLUMNS.length)}1`;

  return workbook.xlsx.writeBuffer();
}

export async function previewWipReceiptErpExport({
  supabaseAdmin = getSupabaseAdmin(),
  filters = {},
} = {}) {
  const { rows } = await loadRowsForExport(supabaseAdmin, filters);
  if (!rows.length) {
    throw new ApiError(400, "ไม่พบข้อมูลรับเข้า WIP สำหรับ Export ERP");
  }

  const groups = groupRowsByDocumentDate(rows);
  const documents = await previewDocumentNumbers(supabaseAdmin, groups);
  return buildPreviewPayload(rows, documents, filters);
}

export async function exportWipReceiptErpExcel({
  supabaseAdmin = getSupabaseAdmin(),
  filters = {},
  actorUserId = null,
} = {}) {
  const { rows } = await loadRowsForExport(supabaseAdmin, filters);
  if (!rows.length) {
    throw new ApiError(400, "ไม่พบข้อมูลรับเข้า WIP สำหรับ Export ERP");
  }

  const groups = groupRowsByDocumentDate(rows);
  const documents = await allocateDocumentNumbers(supabaseAdmin, groups);
  const fileName = buildFilename(
    normalizeDateInput(filters.dateFrom) || rows[0]?.documentDate,
    normalizeDateInput(filters.dateTo) || rows.at(-1)?.documentDate
  );
  const documentByDate = new Map(documents.map((document) => [document.documentDate, document.documentNo]));
  const rowsByDate = new Map(groups.map((group) => [group.documentDate, group.rows]));

  const batchInsert = {
    document_type: DOCUMENT_TYPE,
    source_module: SOURCE_MODULE,
    date_from: normalizeDateInput(filters.dateFrom) || rows[0].documentDate,
    date_to: normalizeDateInput(filters.dateTo) || rows.at(-1).documentDate,
    file_name: fileName,
    status: "exported",
    document_count: documents.length,
    row_count: rows.length,
    exported_by: actorUserId,
    metadata: {
      filters,
    },
  };

  const batchResult = await supabaseAdmin
    .from("production_erp_export_batches")
    .insert(batchInsert)
    .select("id")
    .single();

  if (batchResult.error) {
    throw new ApiError(500, "Failed to create ERP export batch", batchResult.error.message);
  }

  const batchId = batchResult.data.id;
  const documentInserts = documents.map((document) => ({
    batch_id: batchId,
    document_type: DOCUMENT_TYPE,
    source_module: SOURCE_MODULE,
    period_ym: document.periodYm,
    running_no: document.runningNo,
    document_no: document.documentNo,
    document_date: document.documentDate,
    document_note: buildDocumentNote(document.documentDate),
    row_count: document.rowCount,
    created_by: actorUserId,
  }));

  const documentResult = await supabaseAdmin
    .from("production_erp_export_documents")
    .insert(documentInserts)
    .select("id,document_date,document_no");

  if (documentResult.error) {
    throw new ApiError(500, "Failed to create ERP export documents", documentResult.error.message);
  }

  const documentIdByDate = new Map(
    (documentResult.data || []).map((document) => [document.document_date, document.id])
  );
  const lineInserts = [];
  let lineNo = 0;
  documents.forEach((document) => {
    const documentRows = rowsByDate.get(document.documentDate) || [];
    documentRows.forEach((row) => {
      const expiryDate = addOneYearDateInput(row.documentDate);
      lineNo += 1;
      lineInserts.push({
        batch_id: batchId,
        document_id: documentIdByDate.get(document.documentDate),
        line_no: lineNo,
        source_receipt_id: null,
        document_date: row.documentDate,
        document_no: document.documentNo,
        branch_code: BRANCH_CODE,
        department_code: DEPARTMENT_CODE,
        project_code: PROJECT_CODE,
        display_price: DISPLAY_PRICE,
        trade_code: row.tradeCode,
        quantity: row.quantity || QUANTITY,
        unit_price: null,
        unit_weight_kg: row.unitWeightKg,
        lot_no: row.lotNo,
        tracking_no: null,
        storage_location: STORAGE_LOCATION,
        production_date: row.documentDate,
        expiry_date: expiryDate,
        metadata: {
          barcodes: row.barcodes,
          productName: row.productName,
          sourceReceiptIds: row.sourceReceiptIds,
          weighedAt: row.weighedAt,
        },
      });
    });
  });

  if (lineInserts.length) {
    const lineResult = await supabaseAdmin
      .from("production_erp_export_lines")
      .insert(lineInserts);

    if (lineResult.error) {
      throw new ApiError(500, "Failed to create ERP export lines", lineResult.error.message);
    }
  }

  const buffer = await createWorkbookBuffer(rows, documentByDate);
  return {
    buffer,
    fileName,
    preview: buildPreviewPayload(rows, documents, filters),
    batchId,
  };
}
