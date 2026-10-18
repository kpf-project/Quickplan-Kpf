import "server-only";

import ExcelJS from "exceljs";
import * as crypto from "node:crypto";
import { loadScaleProductsData } from "@/lib/scale/products";
import { ApiError, getSupabaseAdmin } from "@/lib/adminApi";
import { loadScaleReceiptReportData } from "@/lib/scale/receipts";
import { fetchSupabaseRowsByChunks } from "@/lib/supabaseRangeFetch";

const DOCUMENT_TYPE = "IMM";
const SOURCE_MODULE = "weight_receipt";
const BRANCH_CODE = "00000";
const DEPARTMENT_CODE = "KP13";
const PROJECT_CODE = "0";
const DISPLAY_PRICE = -1;
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
  const groups = new Map();
  for (const receipt of receipts || []) {
    const documentDate = receipt.weighedAt ? getBangkokDateInputFromTimestamp(receipt.weighedAt) : "";
    const quantity = Number(receipt.netWeightKg);
    if (!receipt.id || !receipt.productCode || !documentDate || !receipt.lotNo || receipt.lotNo === "-" || !Number.isFinite(quantity) || quantity <= 0) {
      throw new ApiError(400, "ข้อมูลใบชั่งไม่ครบหรือน้ำหนักไม่ถูกต้อง กรุณาตรวจสอบก่อนส่งออก");
    }
    const tradeCode = normalizeUpperText(receipt.productCode);
    const key = JSON.stringify([documentDate, tradeCode, receipt.lotNo]);
    if (!groups.has(key)) groups.set(key, {
      documentDate, tradeCode, productName: receipt.productName || tradeCode,
      lotNo: receipt.lotNo, quantity: 0, unitWeightKg: 0, sourceReceiptIds: [], barcodes: [], sources: [],
    });
    const row = groups.get(key);
    row.quantity = Number((row.quantity + quantity).toFixed(3));
    row.sourceReceiptIds.push(receipt.id);
    row.barcodes.push(receipt.barcode);
    row.sources.push({ id: receipt.id, netWeightKg: quantity, weighedAt: receipt.weighedAt,
      productConfigId: receipt.productConfigId, lotId: receipt.lotId, barcode: receipt.barcode });
  }
  return [...groups.values()].sort((a, b) => a.documentDate.localeCompare(b.documentDate)
    || a.tradeCode.localeCompare(b.tradeCode) || a.lotNo.localeCompare(b.lotNo));
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
    quantity: row.quantity,
    unitPrice: "",
    unitWeightKg: row.unitWeightKg,
    lotNo: row.lotNo,
    trackingNo: "",
    storageLocation: STORAGE_LOCATION,
    productionDateText: formatChristianDate(row.documentDate),
    expiryDateText: formatChristianDate(expiryDate),
  };
}

async function normalizeExportFilters(supabaseAdmin, filters = {}) {
  const products = await loadScaleProductsData(supabaseAdmin);
  const departmentId = products?.preset?.departmentId;
  if (!departmentId) throw new ApiError(400, "ไม่พบแผนกสำหรับส่งออก ERP");
  const dateFrom = normalizeDateInput(filters.dateFrom);
  const dateTo = normalizeDateInput(filters.dateTo);
  if (!dateFrom || !dateTo || dateFrom > dateTo || [dateFrom, dateTo].some(date => !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) {
    throw new ApiError(400, "กรุณาระบุช่วงวันที่รับเข้าให้ถูกต้อง");
  }
  return { departmentId, dateFrom, dateTo, search: normalizeText(filters.search).slice(0, 200),
    lotNo: normalizeUpperText(filters.lotNo), itemStatus: "confirmed",
    productCodes: [...new Set((Array.isArray(filters.productCodes) ? filters.productCodes : []).map(normalizeUpperText).filter(Boolean))].sort() };
}

async function loadRowsForExport(supabaseAdmin, filters) {
  const payload = await loadScaleReceiptReportData(supabaseAdmin, {
    ...filters, search: "", isTest: false, recordType: "production", includeAll: true, page: 1, limit: 200,
  });
  const keyword = filters.search.toLocaleLowerCase("th-TH");
  return parseReceiptRows((payload.receipts || []).filter(row => row.itemStatus !== "voided" && !row.isReturn && !row.isTest)
    .filter(row => !keyword || [`${row.productCode} - ${row.productName}`, row.lotNo].some(value => String(value || "").toLocaleLowerCase("th-TH").includes(keyword))));
}

function dbError(error) {
  if (!error) return;
  if (["42P01", "42883", "PGRST202", "PGRST205"].includes(error.code)) {
    throw new ApiError(503, "ยังไม่ได้ติดตั้ง ERP Export รุ่นใหม่ กรุณาติดตั้ง scripts/install-receipt-erp-export.sql");
  }
  if (error.code === "23505" || error.code === "P0001") throw new ApiError(409, error.message);
  throw new ApiError(500, "ไม่สามารถอ่านหรือบันทึกเอกสาร ERP ได้", error.message);
}

function digest(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function sign(value) {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new ApiError(500, "ไม่พบคีย์สำหรับตรวจสอบพรีวิว ERP");
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}
function previewToken(fingerprint, actorUserId) {
  const body = Buffer.from(JSON.stringify({ fingerprint, actorUserId, expiresAt: Date.now() + 15 * 60 * 1000 })).toString("base64url");
  return `${body}.${sign(body)}`;
}
function readPreviewToken(token, actorUserId) {
  const [body, signature] = String(token || "").split(".");
  if (!body || body.length > 2048 || !signature || !/^[0-9a-f]{64}$/.test(signature) || !crypto.timingSafeEqual(Buffer.from(sign(body)), Buffer.from(signature))) throw new ApiError(409, "พรีวิวไม่ถูกต้อง กรุณา Preview ใหม่");
  let payload;
  try { payload = JSON.parse(Buffer.from(body, "base64url").toString()); } catch { throw new ApiError(409, "พรีวิวไม่ถูกต้อง"); }
  if (payload.actorUserId !== actorUserId) throw new ApiError(403, "พรีวิวนี้เป็นของผู้ใช้อื่น");
  return payload;
}

async function duplicateReceiptIds(supabaseAdmin, rows) {
  const ids = rows.flatMap(row => row.sourceReceiptIds);
  const duplicates = await fetchSupabaseRowsByChunks(ids, chunk =>
    supabaseAdmin.from("production_erp_export_receipts").select("receipt_id").in("receipt_id", chunk),
  { onError: dbError });
  return duplicates.map(row => row.receipt_id);
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
    worksheet.addRow(row.excelLine || buildExcelLine(row, documentNo));
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
  worksheet.getColumn("quantity").numFmt = "#,##0.000";
  worksheet.getColumn("unitWeightKg").numFmt = "0.00";
  worksheet.views = [{ state: "frozen", ySplit: 1 }];
  worksheet.autoFilter = `A1:${String.fromCharCode(64 + ERP_COLUMNS.length)}1`;

  return workbook.xlsx.writeBuffer();
}

export async function previewWipReceiptErpExport({ supabaseAdmin = getSupabaseAdmin(), filters = {}, actorUserId = null, canOverride = false } = {}) {
  const scopedFilters = await normalizeExportFilters(supabaseAdmin, filters);
  const rows = await loadRowsForExport(supabaseAdmin, scopedFilters);
  if (!rows.length) throw new ApiError(400, "ไม่พบข้อมูลรับเข้า WIP สำหรับ Export ERP");
  const duplicates = await duplicateReceiptIds(supabaseAdmin, rows);
  const documents = await previewDocumentNumbers(supabaseAdmin, groupRowsByDocumentDate(rows));
  return { ...buildPreviewPayload(rows, documents, scopedFilters), rows,
    totalWeightKg: Number(rows.reduce((sum, row) => sum + row.quantity, 0).toFixed(3)),
    duplicateCount: duplicates.length, canOverride,
    previewToken: previewToken(digest({ filters: scopedFilters, rows }), actorUserId) };
}

export async function listWipReceiptErpHistory({ supabaseAdmin = getSupabaseAdmin(), limit = 30 } = {}) {
  const products = await loadScaleProductsData(supabaseAdmin);
  const departmentId = products?.preset?.departmentId;
  if (!departmentId) throw new ApiError(400, "ไม่พบแผนกสำหรับส่งออก ERP");
  const result = await supabaseAdmin.from("production_erp_export_batches")
    .select("id,file_name,date_from,date_to,exported_at,exported_by,document_count,row_count,status,metadata,production_erp_export_documents(document_no,document_date)")
    .eq("source_module", SOURCE_MODULE).eq("metadata->filters->>departmentId", departmentId)
    .order("exported_at", { ascending: false }).limit(limit);
  dbError(result.error);
  const batches = result.data || [];
  const userIds = [...new Set(batches.map(batch => batch.exported_by).filter(Boolean))];
  if (!userIds.length) return batches;
  const users = await supabaseAdmin.from("profiles").select("id,username").in("id", userIds);
  dbError(users.error);
  const names = new Map((users.data || []).map(user => [user.id, user.username]));
  return batches.map(batch => ({ ...batch, exportedByName: names.get(batch.exported_by) || null }));
}

export async function downloadWipReceiptErpBatch({ supabaseAdmin = getSupabaseAdmin(), batchId } = {}) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(batchId || "")) throw new ApiError(400, "รหัสเอกสารไม่ถูกต้อง");
  const products = await loadScaleProductsData(supabaseAdmin);
  const batch = await supabaseAdmin.from("production_erp_export_batches").select("*").eq("id", batchId).single();
  dbError(batch.error);
  if (!batch.data || !products?.preset?.departmentId || batch.data.metadata?.filters?.departmentId !== products.preset.departmentId) throw new ApiError(403, "ไม่มีสิทธิ์ดาวน์โหลดเอกสารนี้");
  if (batch.data.status !== "exported") throw new ApiError(409, "เอกสารนี้ถูกยกเลิกแล้ว");
  const lines = [];
  for (let offset = 0; ; offset += 500) {
    const result = await supabaseAdmin.from("production_erp_export_lines").select("*").eq("batch_id", batchId).order("line_no").range(offset, offset + 499);
    dbError(result.error);
    lines.push(...(result.data || []));
    if ((result.data || []).length < 500) break;
  }
  if (lines.length !== batch.data.row_count) throw new ApiError(409, "ประวัติเอกสารไม่ครบ ไม่สามารถดาวน์โหลดได้");
  const rows = lines.map(row => ({ documentDate: row.document_date, quantity: Number(row.quantity), unitWeightKg: Number(row.unit_weight_kg), tradeCode: row.trade_code, lotNo: row.lot_no,
    excelLine: { documentDateText: formatChristianDate(row.document_date), documentNo: row.document_no,
      branchCode: row.branch_code, departmentCode: row.department_code, projectCode: row.project_code,
      displayPrice: row.display_price, remark: buildDocumentNote(row.document_date), tradeCode: row.trade_code,
      quantity: Number(row.quantity), unitPrice: row.unit_price == null ? "" : Number(row.unit_price), unitWeightKg: Number(row.unit_weight_kg),
      lotNo: row.lot_no, trackingNo: row.tracking_no || "", storageLocation: row.storage_location,
      productionDateText: formatChristianDate(row.production_date), expiryDateText: formatChristianDate(row.expiry_date) } }));
  const documentMap = new Map(lines.map(row => [row.document_date, row.document_no]));
  return { buffer: await createWorkbookBuffer(rows, documentMap), fileName: batch.data.file_name,
    batchId, preview: { documentCount: batch.data.document_count, rowCount: batch.data.row_count } };
}

export async function exportWipReceiptErpExcel({ supabaseAdmin = getSupabaseAdmin(), filters = {}, actorUserId = null,
  previewToken: token, requestId, documentNumbers = {}, overrideReason = "", canOverride = false } = {}) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId || "")) throw new ApiError(400, "ไม่พบรหัสคำขอส่งออก");
  const preview = readPreviewToken(token, actorUserId);
  const hasOverride = Object.keys(documentNumbers).length > 0;
  if (hasOverride && !canOverride) throw new ApiError(403, "เฉพาะผู้ดูแลระบบที่แก้เลขเอกสารได้");
  const reason = normalizeText(overrideReason);
  if (hasOverride && (reason.length < 5 || reason.length > 500)) throw new ApiError(400, "กรุณาระบุเหตุผลแก้เลขเอกสาร 5–500 ตัวอักษร");
  const requestHash = digest({ token, filters, actorUserId, documentNumbers, reason });
  const replay = await supabaseAdmin.from("production_erp_export_batches").select("id,metadata").eq("metadata->>requestId", requestId).maybeSingle();
  dbError(replay.error);
  if (replay.data) {
    if (replay.data.metadata.requestHash !== requestHash) throw new ApiError(409, "รหัสคำขอนี้ถูกใช้กับข้อมูลอื่นแล้ว");
    return downloadWipReceiptErpBatch({ supabaseAdmin, batchId: replay.data.id });
  }
  if (preview.expiresAt < Date.now()) throw new ApiError(409, "พรีวิวหมดอายุ กรุณา Preview ใหม่");
  const scopedFilters = await normalizeExportFilters(supabaseAdmin, filters);
  const rows = await loadRowsForExport(supabaseAdmin, scopedFilters);
  if (!rows.length || digest({ filters: scopedFilters, rows }) !== preview.fingerprint) throw new ApiError(409, "ข้อมูลเปลี่ยนจากพรีวิว กรุณา Preview ใหม่ก่อนส่งออก");
  for (const [date, number] of Object.entries(documentNumbers)) {
    if (!rows.some(row => row.documentDate === date) || !new RegExp(`^IMM${getPeriodYm(date)}/[0-9]{4}$`).test(number) || Number(number.slice(-4)) < 1) throw new ApiError(400, "เลขเอกสารต้องตรงเดือนรับเข้า และเลขรัน 0001–9999");
  }
  const result = await supabaseAdmin.rpc("commit_wip_receipt_erp_export", {
    p_request_id: requestId, p_actor: actorUserId, p_filters: scopedFilters, p_rows: rows,
    p_numbers: documentNumbers, p_reason: reason, p_request_hash: requestHash,
  });
  dbError(result.error);
  return downloadWipReceiptErpBatch({ supabaseAdmin, batchId: result.data });
}
