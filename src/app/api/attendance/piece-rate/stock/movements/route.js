import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { fetchAllSupabaseRows } from "@/lib/supabaseRangeFetch";
import { normalizeParam } from "@/lib/validation";
import { resolvePieceRateInboundQuantity } from "@/lib/pieceRateInboundQuantity";
import { buildPieceRateDailyMovementReport } from "@/features/attendance/utils/buildPieceRateDailyMovementReport";
import { excludeReversedIssueMovements } from "@/features/attendance/utils/pieceRateIssueMovements";
import { fillMissingFgProductNames } from "@/features/attendance/utils/fillMissingFgProductNames";
import { rowsToCsv } from "@/lib/csvResponse";
import { verifyInboundExcelToken } from "@/lib/inboundExcelToken";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";


const REPORT_TYPES = new Set(["inbound", "inbound-fg", "issue", "movement", "balance", "prison"]);
const PIECE_RATE_REPORT_START_DATE = "2026-08-11";
const FG_CATEGORY_CODES = new Set(["04", "04-1", "04-2"]);

const INBOUND_CSV_COLUMNS = [
  { key: "movementDate", header: "วันที่รับเข้า" },
  { key: "movementAt", header: "วันเวลารับเข้า" },
  { key: "barcode", header: "บาร์โค้ด" },
  { key: "productCode", header: "รหัสสินค้า" },
  { key: "productName", header: "ชื่อสินค้า" },
  { key: "lotNo", header: "LOT" },
  { key: "quantityIn", header: "จำนวน" },
  { key: "weightInKg", header: "น้ำหนัก (กก.)" },
  { key: "employeeCode", header: "รหัสพนักงาน" },
  { key: "employeeName", header: "ชื่อพนักงาน" },
  { key: "statusLabel", header: "สถานะ" },
];

function inboundRowsToCsv(rows) {
  return rowsToCsv(INBOUND_CSV_COLUMNS, rows
    .filter((row) => row.status !== "cancelled")
    .map((row) => ({
      ...row,
      statusLabel: row.status === "issued" ? "เบิกแล้ว" : "พร้อมเบิก",
    })));
}

function isFgCategory(value) {
  return FG_CATEGORY_CODES.has(String(value || "").trim().toUpperCase());
}

function movementCategory(row) {
  const product = Array.isArray(row?.products_cache) ? row.products_cache[0] : row?.products_cache;
  return product?.iccat_code || row?.category_code || "";
}

const STOCK_SOURCE_TYPES = [
  "piece_rate_weigh",
  "piece_rate_weigh_void",
  "piece_rate_issue",
  "piece_rate_issue_void",
  "piece_rate_return",
  "piece_rate_waste",
  "piece_rate_prison_receipt",
  "piece_rate_prison_issue",
];

const PRISON_SOURCE_TYPES = ["piece_rate_prison_receipt", "piece_rate_prison_issue"];

const MOVEMENT_SELECT = [
  "id",
  "movement_no",
  "movement_type",
  "movement_date",
  "movement_at",
  "department_code",
  "product_code",
  "product_name_snapshot",
  "lot_no",
  "uom_name",
  "quantity_in",
  "quantity_out",
  "weight_in_kg",
  "weight_out_kg",
  "source_document_type",
  "source_document_no",
  "reference_type",
  "reference_no",
  "remark",
  "metadata",
  "products_cache (iccat_code)",
].join(",");

function bangkokDate(daysOffset = 0) {
  const date = new Date(Date.now() + daysOffset * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function toDateKey(value) {
  if (!value) return "";
  return String(value).slice(0, 10);
}

function toNumber(value) {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function round3(value) {
  return Number(toNumber(value).toFixed(3));
}

function normalizeReportType(value) {
  const reportType = normalizeParam(value) || "inbound";
  return REPORT_TYPES.has(reportType) ? reportType : "inbound";
}

function normalizeSearch(value) {
  return String(value || "").trim().toLowerCase();
}

function createBucket() {
  return {
    openingQty: 0,
    openingWeightKg: 0,
    inboundQty: 0,
    inboundWeightKg: 0,
    issueQty: 0,
    issueWeightKg: 0,
    returnQty: 0,
    returnWeightKg: 0,
    wasteQty: 0,
    wasteWeightKg: 0,
    actualQty: 0,
    actualWeightKg: 0,
    balanceQty: 0,
    balanceWeightKg: 0,
  };
}

function createSummary() {
  return {
    count: 0,
    ...createBucket(),
  };
}

const METADATA_KEYS = new Set(["productCode", "productName", "lotNo"]);

function normalizeBucket(bucket) {
  return Object.fromEntries(
    Object.entries(bucket).map(([key, value]) => {
      if (METADATA_KEYS.has(key)) {
        return [key, value];
      }
      return [key, round3(value)];
    })
  );
}

function addBucket(target, source) {
  Object.keys(createBucket()).forEach((key) => {
    target[key] += toNumber(source[key]);
  });
}

function searchableText(row) {
  return [
    row.movementNo,
    row.documentNo,
    row.referenceNo,
    row.productCode,
    row.productName,
    row.lotNo,
    row.barcode,
    row.employeeCode,
    row.employeeName,
  ].filter(Boolean).join(" ").toLowerCase();
}

function matchSearch(row, search) {
  if (!search) return true;
  return searchableText(row).includes(search);
}

function getMovementKind(row) {
  if (["piece_rate_weigh", "piece_rate_prison_receipt"].includes(row.source_document_type)) return "inbound";
  if (row.source_document_type === "piece_rate_weigh_void") return "inbound_void";
  if (["piece_rate_issue", "piece_rate_prison_issue"].includes(row.source_document_type)) return "issue";
  if (row.source_document_type === "piece_rate_issue_void") return "issue_void";
  if (row.source_document_type === "piece_rate_return") return "return";
  if (row.source_document_type === "piece_rate_waste") return "waste";
  return "other";
}

function movementLabel(kind) {
  if (kind === "inbound") return "รับเข้า";
  if (kind === "inbound_void") return "ยกเลิกชั่ง";
  if (kind === "issue") return "เบิก";
  if (kind === "issue_void") return "ยกเลิกเบิก";
  if (kind === "return") return "ชั่งคืน";
  if (kind === "waste") return "ของเสีย";
  return "เคลื่อนไหว";
}

function getSignedQuantity(row) {
  const kind = getMovementKind(row);
  if (kind === "inbound" || kind === "return" || kind === "issue_void") {
    return toNumber(row.quantity_in);
  }
  if (kind === "inbound_void" || kind === "issue" || kind === "waste") {
    return -toNumber(row.quantity_out);
  }
  return toNumber(row.quantity_in) - toNumber(row.quantity_out);
}

function getSignedWeight(row) {
  const kind = getMovementKind(row);
  if (kind === "inbound" || kind === "return" || kind === "issue_void") {
    return toNumber(row.weight_in_kg);
  }
  if (kind === "inbound_void" || kind === "issue" || kind === "waste") {
    return -toNumber(row.weight_out_kg);
  }
  return toNumber(row.weight_in_kg) - toNumber(row.weight_out_kg);
}

function applyMovementToBucket(bucket, row, fieldPrefix) {
  const kind = getMovementKind(row);
  const qty = Math.abs(getSignedQuantity(row));
  const weightKg = Math.abs(getSignedWeight(row));

  if (fieldPrefix === "opening") {
    bucket.openingQty += getSignedQuantity(row);
    bucket.openingWeightKg += getSignedWeight(row);
    return;
  }

  if (kind === "inbound") {
    bucket.inboundQty += qty;
    bucket.inboundWeightKg += weightKg;
  } else if (kind === "inbound_void") {
    bucket.inboundQty -= qty;
    bucket.inboundWeightKg -= weightKg;
  } else if (kind === "issue") {
    bucket.issueQty += qty;
    bucket.issueWeightKg += weightKg;
  } else if (kind === "issue_void") {
    bucket.issueQty -= qty;
    bucket.issueWeightKg -= weightKg;
  } else if (kind === "return") {
    bucket.returnQty += qty;
    bucket.returnWeightKg += weightKg;
  } else if (kind === "waste") {
    bucket.wasteQty += qty;
    bucket.wasteWeightKg += weightKg;
  }
}

function finalizeBucket(bucket) {
  bucket.actualQty = bucket.issueQty - bucket.returnQty + bucket.wasteQty;
  bucket.actualWeightKg = bucket.issueWeightKg - bucket.returnWeightKg + bucket.wasteWeightKg;
  bucket.balanceQty = (
    bucket.openingQty +
    bucket.inboundQty -
    bucket.issueQty +
    bucket.returnQty -
    bucket.wasteQty
  );
  bucket.balanceWeightKg = (
    bucket.openingWeightKg +
    bucket.inboundWeightKg -
    bucket.issueWeightKg +
    bucket.returnWeightKg -
    bucket.wasteWeightKg
  );
  return bucket;
}

function mapMovementRow(row, employeeNameMap = null) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const productCode = row.product_code || metadata.productCode || "-";
  const productName = row.product_name_snapshot || metadata.productName || productCode;
  const kind = getMovementKind(row);
  const barcode = metadata.labelBarcode || metadata.barcode || row.source_document_no || "";

  let employeeName = metadata.employeeName || metadata.employee_name || "";
  if (!employeeName && employeeNameMap && barcode) {
    employeeName = employeeNameMap.get(barcode) || "";
  }

  return {
    id: row.id,
    movementAt: row.movement_at,
    movementDate: row.movement_date,
    issueDate: kind === "issue" || kind === "issue_void" ? row.movement_date : null,
    movementNo: row.movement_no,
    movementType: row.movement_type,
    kind,
    kindLabel: movementLabel(kind),
    documentNo: row.source_document_no || "",
    referenceNo: row.reference_no || "",
    barcode,
    productCode,
    productName,
    categoryCode: row.products_cache?.iccat_code || row.category_code || "03",
    lotNo: row.lot_no || "-",
    quantityIn: round3(row.quantity_in),
    quantityOut: round3(row.quantity_out),
    weightInKg: round3(row.weight_in_kg),
    weightOutKg: round3(row.weight_out_kg),
    signedQuantity: round3(getSignedQuantity(row)),
    signedWeightKg: round3(getSignedWeight(row)),
    employeeCode: metadata.employeeCode || metadata.employee_code || "",
    employeeName: employeeName,
    remark: row.remark || "",
    fgProductCode: metadata.fgProductCode || null,
    fgProductName: metadata.fgProductName || null,
    issueEmployeeCode: metadata.issueEmployeeCode || null,
    issueEmployeeName: metadata.issueEmployeeName || null,
    sourceDocumentType: row.source_document_type || "",
  };
}

async function loadStockMovements(supabase, dateTo) {
  return fetchAllSupabaseRows(() => supabase
    .from("production_stock_movements")
    .select(MOVEMENT_SELECT)
    .in("source_document_type", STOCK_SOURCE_TYPES)
    .gte("movement_date", PIECE_RATE_REPORT_START_DATE)
    .lte("movement_date", dateTo)
    .order("movement_date", { ascending: true })
    .order("movement_at", { ascending: true }));
}

function buildAggregateMovementReportRows(allRows, dateFrom, dateTo, search) {
  const periodRows = allRows.filter((row) => {
    const dateKey = toDateKey(row.movement_date || row.movement_at);
    return dateKey >= dateFrom && dateKey <= dateTo;
  });
  const openingRows = allRows.filter((row) => {
    const dateKey = toDateKey(row.movement_date || row.movement_at);
    return dateKey && dateKey < dateFrom;
  });

  const buckets = new Map();
  const ensureBucket = (row) => {
    const productCode = row.product_code || "-";
    const productName = row.product_name_snapshot || productCode;
    const lotNo = row.lot_no || "-";
    const key = `${productCode}|||${lotNo}`;
    if (!buckets.has(key)) {
      buckets.set(key, {
        productCode,
      productName,
      categoryCode: row.products_cache?.iccat_code || row.category_code || "03",
      lotNo,
        ...createBucket(),
      });
    }
    return buckets.get(key);
  };

  openingRows.forEach((row) => applyMovementToBucket(ensureBucket(row), row, "opening"));
  periodRows.forEach((row) => applyMovementToBucket(ensureBucket(row), row, "period"));

  const rows = Array.from(buckets.values())
    .map((row) => ({ ...row, ...normalizeBucket(finalizeBucket(row)) }))
    .filter((row) => (
      matchSearch({
        productCode: row.productCode,
        productName: row.productName,
        lotNo: row.lotNo,
      }, search) &&
      Object.values(createBucket()).some((_, index) => {
        const key = Object.keys(createBucket())[index];
        return Math.abs(toNumber(row[key])) > 0;
      })
    ))
    .sort((a, b) => (
      String(a.productCode).localeCompare(String(b.productCode), "th") ||
      String(a.lotNo).localeCompare(String(b.lotNo), "th")
    ));

  const summary = createSummary();
  summary.count = rows.length;
  rows.forEach((row) => addBucket(summary, row));

  return { rows, summary: normalizeBucket(summary) };
}

function buildBalanceRows(allRows, dateFrom, dateTo, search) {
  const { rows } = buildAggregateMovementReportRows(allRows, dateFrom, dateTo, search);
  const balanceRows = rows
    .filter((row) => Math.abs(toNumber(row.balanceQty)) > 0 || Math.abs(toNumber(row.balanceWeightKg)) > 0)
    .map((row) => ({
      productCode: row.productCode,
      productName: row.productName,
      categoryCode: row.categoryCode,
      lotNo: row.lotNo,
      balanceQty: row.balanceQty,
      balanceWeightKg: row.balanceWeightKg,
      inboundQty: row.inboundQty,
      inboundWeightKg: row.inboundWeightKg,
      issueQty: row.issueQty,
      issueWeightKg: row.issueWeightKg,
      returnQty: row.returnQty,
      returnWeightKg: row.returnWeightKg,
      wasteQty: row.wasteQty,
      wasteWeightKg: row.wasteWeightKg,
    }));

  const summary = createSummary();
  summary.count = balanceRows.length;
  balanceRows.forEach((row) => {
    summary.balanceQty += toNumber(row.balanceQty);
    summary.balanceWeightKg += toNumber(row.balanceWeightKg);
    summary.inboundQty += toNumber(row.inboundQty);
    summary.inboundWeightKg += toNumber(row.inboundWeightKg);
    summary.issueQty += toNumber(row.issueQty);
    summary.issueWeightKg += toNumber(row.issueWeightKg);
    summary.returnQty += toNumber(row.returnQty);
    summary.returnWeightKg += toNumber(row.returnWeightKg);
    summary.wasteQty += toNumber(row.wasteQty);
    summary.wasteWeightKg += toNumber(row.wasteWeightKg);
  });

  return { rows: balanceRows, summary: normalizeBucket(summary) };
}

function buildPrisonRows(allRows, dateFrom, dateTo, search, view) {
  if (view === "balance") {
    return buildBalanceRows(allRows, PIECE_RATE_REPORT_START_DATE, bangkokDate(), search);
  }

  const targetSource = view === "issue" ? "piece_rate_prison_issue" : "piece_rate_prison_receipt";
  const rows = allRows
    .filter((row) => row.source_document_type === targetSource)
    .filter((row) => {
      const dateKey = toDateKey(row.movement_date || row.movement_at);
      return dateKey >= dateFrom && dateKey <= dateTo;
    })
    .map((row) => mapMovementRow(row))
    .filter((row) => matchSearch(row, search))
    .sort((a, b) => String(b.movementAt || "").localeCompare(String(a.movementAt || "")));

  const summary = createSummary();
  summary.count = rows.length;
  rows.forEach((row) => {
    if (view === "issue") {
      summary.issueQty += toNumber(row.quantityOut);
      summary.issueWeightKg += toNumber(row.weightOutKg);
    } else {
      summary.inboundQty += toNumber(row.quantityIn);
      summary.inboundWeightKg += toNumber(row.weightInKg);
    }
  });
  return { rows, summary: normalizeBucket(summary) };
}

async function enrichMissingFgProductNames(supabase, rows) {
  const codes = Array.from(new Set(rows
    .filter((row) => !String(row?.metadata?.fgProductName || "").trim())
    .map((row) => String(row?.metadata?.fgProductCode || "").trim().toUpperCase())
    .filter(Boolean)));
  if (!codes.length) return rows;

  const productNameByCode = new Map();
  for (let index = 0; index < codes.length; index += 150) {
    const { data, error } = await supabase
      .from("products_cache")
      .select("sku_code,sku_name")
      .in("sku_code", codes.slice(index, index + 150));
    if (error) throw error;
    (data || []).forEach((product) => {
      productNameByCode.set(String(product.sku_code || "").trim().toUpperCase(), product.sku_name);
    });
  }
  return fillMissingFgProductNames(rows, productNameByCode);
}

async function buildDetailRows(supabase, allRows, dateFrom, dateTo, search, reportType) {
  let issuedBarcodes = new Set();
  let voidedBarcodes = new Set();
  const employeeNameMap = new Map();
  const inboundLogMap = new Map();

  if (reportType === "inbound" || reportType === "inbound-fg") {
    const inboundBarcodes = allRows
      .filter(r => r.source_document_type === "piece_rate_weigh")
      .map(r => r.source_document_no);

    if (inboundBarcodes.length > 0) {
      const chunkSize = 150;
      const chunks = [];
      for (let i = 0; i < inboundBarcodes.length; i += chunkSize) {
        chunks.push(inboundBarcodes.slice(i, i + chunkSize));
      }

      // 1. Query issues
      const issueQueries = chunks.map(chunk =>
        supabase
          .from("production_piece_rate_stock_issues")
          .select("piece_rate_barcode")
          .in("piece_rate_barcode", chunk)
          .eq("issue_status", "confirmed")
      );

      const queryResults = await Promise.all(issueQueries);
      const allIssues = [];
      queryResults.forEach(res => {
        if (res.data) {
          allIssues.push(...res.data);
        }
      });
      issuedBarcodes = new Set(allIssues.map(i => i.piece_rate_barcode));

      // 2. Query employee names
      const logQueries = chunks.map(chunk =>
        supabase
          .from("production_piece_rate_logs")
          .select("doc_no, employee_name_snapshot, input_mode_snapshot, input_value")
          .in("doc_no", chunk)
      );

      const logResults = await Promise.all(logQueries);
      logResults.forEach(res => {
        if (res.data) {
          res.data.forEach(log => {
            employeeNameMap.set(log.doc_no, log.employee_name_snapshot);
            inboundLogMap.set(log.doc_no, log);
          });
        }
      });
    }

    allRows.forEach(r => {
      if (r.source_document_type === "piece_rate_weigh_void") {
        voidedBarcodes.add(r.source_document_no);
      }
    });
  }

  const detailSourceRows = reportType === "issue"
    ? excludeReversedIssueMovements(allRows)
    : allRows;

  let rows = detailSourceRows
    .filter((row) => {
      const dateKey = toDateKey(row.movement_date || row.movement_at);
      if (dateKey < dateFrom || dateKey > dateTo) return false;
      const kind = getMovementKind(row);
      if (reportType === "inbound" || reportType === "inbound-fg") return kind === "inbound";
      if (reportType === "issue") return kind === "issue" || kind === "issue_void";
      return true;
    })
    .map(r => mapMovementRow(r, employeeNameMap));

  rows = rows.map(row => {
    if (reportType === "inbound" || reportType === "inbound-fg") {
      const isVoided = voidedBarcodes.has(row.barcode);
      const isIssued = issuedBarcodes.has(row.barcode);
      const actualQuantity = resolvePieceRateInboundQuantity(
        inboundLogMap.get(row.barcode),
        row.quantityIn
      );
      row.quantityIn = round3(actualQuantity);
      row.signedQuantity = round3(actualQuantity);
      row.status = isVoided ? "cancelled" : (isIssued ? "issued" : "ready");
    }
    return row;
  });

  if (reportType === "inbound") {
    rows = rows.filter((row) => !["04", "04-1", "04-2"].includes(row.categoryCode));
  } else if (reportType === "inbound-fg") {
    rows = rows.filter((row) => ["04", "04-1", "04-2"].includes(row.categoryCode));
  }

  rows = rows.filter((row) => matchSearch(row, search));
  rows.sort((a, b) => String(b.movementAt || "").localeCompare(String(a.movementAt || "")));

  const summary = {
    count: rows.length,
    inboundQty: 0,
    inboundWeightKg: 0,
    issueQty: 0,
    issueWeightKg: 0,
    returnQty: 0,
    returnWeightKg: 0,
  };

  rows.forEach((row) => {
    if (reportType === "inbound" || reportType === "inbound-fg") {
      if (row.status !== "cancelled") {
        summary.inboundQty += row.signedQuantity;
        summary.inboundWeightKg += row.signedWeightKg;
      }
    } else {
      if (row.kind === "inbound" || row.kind === "inbound_void") {
        summary.inboundQty += row.signedQuantity;
        summary.inboundWeightKg += row.signedWeightKg;
      } else if (row.kind === "issue" || row.kind === "issue_void") {
        summary.issueQty += Math.abs(row.signedQuantity);
        summary.issueWeightKg += Math.abs(row.signedWeightKg);
      } else if (row.kind === "return") {
        summary.returnQty += row.signedQuantity;
        summary.returnWeightKg += row.signedWeightKg;
      }
    }
  });

  return {
    rows: rows.slice(0, 2000),
    summary: Object.fromEntries(Object.entries(summary).map(([key, value]) => [
      key,
      key === "count" ? value : round3(value),
    ])),
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const excelToken = request.headers.get("x-kpf-inbound-excel-token");
    if (excelToken) {
      if (!verifyInboundExcelToken(
        excelToken,
        process.env.KPF_INBOUND_EXCEL_TOKEN_SHA256,
        searchParams.get("report"),
        searchParams.get("format")
      )) {
        return Response.json({ error: "Invalid Excel report token" }, { status: 401 });
      }
    } else {
      await requireTaskPermission(request, "production-piece-rate-stock-report");
    }
    const dateFrom = normalizeParam(searchParams.get("dateFrom")) || PIECE_RATE_REPORT_START_DATE;
    const dateTo = normalizeParam(searchParams.get("dateTo")) || bangkokDate();
    const effectiveDateFrom = dateFrom < PIECE_RATE_REPORT_START_DATE
      ? PIECE_RATE_REPORT_START_DATE
      : dateFrom;
    const reportType = normalizeReportType(searchParams.get("report") || searchParams.get("view"));
    const prisonView = ["receipt", "issue", "balance"].includes(normalizeParam(searchParams.get("prisonView")))
      ? normalizeParam(searchParams.get("prisonView"))
      : "receipt";
    const search = normalizeSearch(searchParams.get("search"));
    const format = normalizeParam(searchParams.get("format"));
    const supabase = getSupabaseAdmin();

    let allRows = [];
    if (reportType === "prison") {
      const queryFrom = prisonView === "balance" ? PIECE_RATE_REPORT_START_DATE : effectiveDateFrom;
      allRows = await fetchAllSupabaseRows(() => supabase
        .from("production_stock_movements")
        .select(MOVEMENT_SELECT)
        .in("source_document_type", PRISON_SOURCE_TYPES)
        .gte("movement_date", queryFrom)
        .lte("movement_date", dateTo)
        .order("movement_date", { ascending: true })
        .order("movement_at", { ascending: true }));
    } else if (reportType === "inbound" || reportType === "inbound-fg" || reportType === "issue") {
      allRows = await fetchAllSupabaseRows(() => supabase
        .from("production_stock_movements")
        .select(MOVEMENT_SELECT)
        .in("source_document_type", STOCK_SOURCE_TYPES)
        .gte("movement_date", effectiveDateFrom)
        .lte("movement_date", dateTo)
        .order("movement_date", { ascending: true })
        .order("movement_at", { ascending: true }));
    } else if (reportType === "balance" || reportType === "movement") {
      allRows = await loadStockMovements(supabase, dateTo);
    }

    if (reportType === "issue" || (reportType === "prison" && prisonView === "issue")) {
      allRows = await enrichMissingFgProductNames(supabase, allRows);
    }

    let report;
    if (reportType === "prison") {
      report = buildPrisonRows(allRows, effectiveDateFrom, dateTo, search, prisonView);
    } else if (reportType === "movement") {
      const wipRows = allRows.filter((row) => !isFgCategory(
        row.products_cache?.iccat_code || row.category_code
      ));
      report = buildPieceRateDailyMovementReport(wipRows, effectiveDateFrom, dateTo, search);
    } else if (reportType === "balance") {
      const wipRows = allRows.filter((row) => !isFgCategory(movementCategory(row)));
      report = buildBalanceRows(wipRows, PIECE_RATE_REPORT_START_DATE, bangkokDate(), search);
    } else {
      report = await buildDetailRows(supabase, allRows, effectiveDateFrom, dateTo, search, reportType);
    }

    if (format === "csv" && reportType === "inbound") {
      return new Response(inboundRowsToCsv(report.rows), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": `attachment; filename="piece-rate-stock-inbound-${effectiveDateFrom}-${dateTo}.csv"`,
          "cache-control": "no-store",
        },
      });
    }

    return Response.json({
      data: {
        ...report,
        reportType,
        filters: { dateFrom: effectiveDateFrom, dateTo, search, prisonView },
      },
    });
  } catch (error) {
    return jsonError(error);
  }
}
