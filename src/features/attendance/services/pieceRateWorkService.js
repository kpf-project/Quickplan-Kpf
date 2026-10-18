import "server-only";
import { resolvePieceRateReportMetrics } from "@/lib/pieceRateReportMetrics";
import {
  applyPieceRatePayPeriodWage,
  calculatePieceRateWageAmount,
} from "@/lib/pieceRateWage";

import crypto from "crypto";
import ExcelJS from "exceljs";
import { ApiError, getSupabaseAdmin } from "@/lib/adminApi";
import {
  buildEmployeeCodeVariants,
  getEmployeeCodeMatchKey,
  normalizeEmployeeCode,
} from "@/lib/employeeCode";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
import { fetchGatewayJson } from "@/lib/gatewayClient";
import { findPieceRateBusinessDuplicate } from "@/lib/pieceRateDuplicateGuard";
import { buildPieceRateLotNo } from "@/lib/piece-rate-desktop-label";
import {
  alignPieceRateMetadataToWorkDate,
  getBangkokWorkDate,
  resolvePieceRateWorkTimestamp,
  validatePieceRateWorkDate,
} from "@/lib/piece-rate-work-date";
import { normalizeParam, parsePaginationParams } from "@/lib/validation";
import { assertPieceRateLogHasNoActiveStockIssue } from "@/features/attendance/services/pieceRateStockService";

const REPORT_MONEY_PERMISSION_KEY = "production-line-attendance-piece-rate-money-view";

const LOG_TABLE = "production_piece_rate_logs";
const REVISION_TABLE = "production_piece_rate_log_revisions";
const PROFILE_TABLE = "production_piece_rate_profiles";
const MAPPING_TABLE = "production_piece_rate_product_mappings";
const WEIGHT_TABLE = "production_piece_rate_profile_weights";
const EMPLOYEE_PHOTO_TABLE = "employee_photos";
const PIECE_RATE_DOC_COUNTER_FUNCTION = "next_piece_rate_doc_number_for_date";
const PIECE_RATE_RAISE_DOC_COUNTER_FUNCTION = "raise_piece_rate_doc_counter_for_date";
const REPORT_DOC_COUNTER_FUNCTION = "issue_production_report_doc_number";
const PIECE_RATE_DOC_SEQ_MAX = 999;
const PIECE_RATE_OFFLINE_DOC_NO_REGEX = /^([0-9]{4})([0-9]{2})([0-9]{2})([0-9]{3})$/;
const PIECE_RATE_LEGACY_OFFLINE_DOC_NO_REGEX = /^([A-Z0-9]{2,8})([0-9]{2})([0-9]{2})([0-9]{7})$/;
const MACHINE_CODE_REGEX = /^[A-Z0-9]{2,8}$/;
const INPUT_MODES = new Set(["kg", "pail"]);
const WAGE_BASES = new Set(["kg", "count"]);
const LOG_SOURCES = new Set(["piece_rate_scan", "manual", "import"]);
const REPORT_VIEW_MODES = new Set(["detail", "grouped", "employee", "product"]);
const REPORT_DOC_TYPE_BY_VIEW_MODE = {
  detail: "PRD",
  grouped: "PRG",
  employee: "PRE",
  product: "PRS",
};
const DOC_STATUS_ACTIVE = "active";
const DOC_STATUS_REPLACED = "replaced";
const DOC_STATUS_CANCELLED = "cancelled";
const DOC_STATUS_SET = new Set([
  DOC_STATUS_ACTIVE,
  DOC_STATUS_REPLACED,
  DOC_STATUS_CANCELLED,
]);

function buildReportCapabilities({ isAdmin = false, permissionSet = new Set() }) {
  const strict = process.env.ROLE_TASK_PERMISSIONS_ENABLED === "true";
  const canEdit =
    isAdmin
    || (strict
      ? permissionSet.has("production-piece-rate-adjust")
      : permissionSet.has("production-line-attendance-report-manage")
        || permissionSet.has("production-line-attendance-manage"));
  const canCancel = isAdmin || (strict
    ? permissionSet.has("production-piece-rate-cancel")
    : canEdit);
  const canViewMoney =
    isAdmin
    || permissionSet.has(REPORT_MONEY_PERMISSION_KEY);
  const canViewReport =
    isAdmin
    || (strict
      ? [
        "production-piece-rate-report-view",
        "production-piece-rate-report-export",
        "production-piece-rate-report-print",
      ].some((key) => permissionSet.has(key))
      : canEdit
        || permissionSet.has("production-line-attendance-report-view")
        || permissionSet.has("production-line-attendance-view"));

  return { canViewReport, canViewMoney, canEdit, canCancel };
}

function normalizeText(value) {
  const normalized = normalizeParam(value);
  return normalized ?? null;
}

function normalizeBarcode(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "");
  return normalized || null;
}

function normalizeGoodsCode(value, fallback = null) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized) {
    return normalized;
  }
  if (fallback === null) {
    return null;
  }
  return String(fallback || "").trim().toUpperCase() || null;
}

function pickPieceRateMappingRow(rows, goodsCode, skuCode) {
  const normalizedRows = Array.isArray(rows)
    ? rows
    : (rows ? [rows] : []);

  return normalizedRows.find((row) => normalizeGoodsCode(row?.product_code) === goodsCode)
    || normalizedRows.find((row) => normalizeGoodsCode(row?.product_code) === skuCode)
    || normalizedRows.find((row) => normalizeGoodsCode(row?.sku_code) === skuCode)
    || null;
}

async function resolveTradeGoodsCodeBySkuCode(supabaseAdmin, skuCode) {
  if (!skuCode) {
    return null;
  }

  const barcodeResult = await supabaseAdmin
    .from("pallet_trade_code_barcodes")
    .select("goods_code")
    .eq("sku_code", skuCode)
    .limit(1);

  if (barcodeResult.error) {
    throw new ApiError(500, "Failed to resolve goods code from SKU", barcodeResult.error.message);
  }

  return normalizeGoodsCode(barcodeResult.data?.[0]?.goods_code);
}

function normalizeMachineCode(value, fallback = null) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  if (MACHINE_CODE_REGEX.test(normalized)) {
    return normalized;
  }

  if (fallback === null) {
    return null;
  }

  const fallbackValue = String(fallback || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return MACHINE_CODE_REGEX.test(fallbackValue) ? fallbackValue : null;
}

function normalizeAttendanceTime(value) {
  const normalized = normalizeParam(value);
  return normalized || null;
}

function normalizeInputMode(value, fallback = null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (INPUT_MODES.has(normalized)) {
    return normalized;
  }
  return fallback;
}

function normalizeReportViewMode(value, fallback = "grouped") {
  const normalized = String(value || "").trim().toLowerCase();
  if (REPORT_VIEW_MODES.has(normalized)) {
    return normalized;
  }
  return fallback;
}

function normalizeWageBasis(value, fallback = null) {
  const normalized = String(value || "").trim().toLowerCase();
  if (WAGE_BASES.has(normalized)) {
    return normalized;
  }
  return fallback;
}

function normalizeSource(value) {
  const normalized = String(value || "piece_rate_scan").trim().toLowerCase();
  if (LOG_SOURCES.has(normalized)) {
    return normalized;
  }
  return "piece_rate_scan";
}

function toDocCounterSource(source) {
  if (source === "import") return "import";
  if (source === "manual") return "manual";
  return "daily_scan";
}

function roundToScale(value, scale = 4) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Number(parsed.toFixed(scale));
}

function parsePositiveNumber(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new ApiError(400, `${fieldName} must be a valid number`);
  }
  if (parsed <= 0) {
    throw new ApiError(400, `${fieldName} must be greater than 0`);
  }
  return roundToScale(parsed, 4);
}

function parsePositiveOrDefault(value, fieldName, fallback = 1) {
  if (value === null || value === undefined || value === "") {
    return roundToScale(fallback, 4);
  }
  return parsePositiveNumber(value, fieldName);
}

function buildInputDescriptors(inputMode) {
  if (inputMode === "pail") {
    return {
      inputLabel: "จำนวนปี๊บ",
      inputUnitLabel: "ปี๊บ",
    };
  }

  return {
    inputLabel: "น้ำหนัก",
    inputUnitLabel: "กก.",
  };
}

function normalizeCursorValue(value) {
  const normalized = normalizeParam(value);
  return normalized || null;
}

function normalizeBooleanFlag(value) {
  if (typeof value === "boolean") {
    return value;
  }
  return String(value || "").trim().toLowerCase() === "true";
}

async function resolveProfileDisplayMap(supabaseAdmin, userIds = []) {
  const normalizedIds = Array.from(
    new Set(userIds.map((value) => normalizeParam(value)).filter(Boolean))
  );
  if (normalizedIds.length === 0) {
    return new Map();
  }

  const profileResult = await supabaseAdmin
    .from("profiles")
    .select("id,username")
    .in("id", normalizedIds);
  if (profileResult.error) {
    throw new ApiError(500, "Failed to resolve profile labels", profileResult.error.message);
  }

  const profileMap = new Map();
  for (const profile of profileResult.data || []) {
    if (!profile?.id) continue;
    profileMap.set(profile.id, normalizeText(profile.username) || profile.id);
  }
  return profileMap;
}

function resolveProfileDisplay(userId, profileDisplayMap) {
  const normalized = normalizeParam(userId);
  if (!normalized) {
    return null;
  }
  return profileDisplayMap.get(normalized) || normalized;
}

function resolveLatestIsoTimestamp(currentValue, nextValue) {
  if (!nextValue) return currentValue;
  if (!currentValue) return nextValue;
  const currentTime = Date.parse(currentValue);
  const nextTime = Date.parse(nextValue);
  if (Number.isNaN(nextTime)) return currentValue;
  if (Number.isNaN(currentTime) || nextTime > currentTime) {
    return nextValue;
  }
  return currentValue;
}

function normalizeOfflineEmployee(row = {}) {
  const employeeCode = normalizeEmployeeCode(normalizeParam(row.PRS_NO));
  if (!employeeCode) {
    return null;
  }

  const fullName = [normalizeParam(row.EMP_NAME), normalizeParam(row.EMP_SURNME)]
    .filter(Boolean)
    .join(" ")
    || normalizeParam(row.Name)
    || null;

  return {
    employeeCode,
    name: fullName,
    departmentName: normalizeParam(row.DEPT_THAIDESC) || null,
    branch: normalizeParam(row.BR_THAIDESC) || null,
    checkIn: null,
    checkOut: null,
    status: String(row.PRI_STATUS ?? "").trim() || null,
  };
}

async function addEmployeePhotoUrl(supabaseAdmin, employee) {
  if (!employee?.employeeCode) return employee;
  const { data, error } = await supabaseAdmin
    .from(EMPLOYEE_PHOTO_TABLE)
    .select("employee_code")
    .eq("employee_code", employee.employeeCode)
    .maybeSingle();
  if (error || !data) return employee;
  return {
    ...employee,
    imageUrl: `/api/employees/photos/${encodeURIComponent(employee.employeeCode)}`,
  };
}

function buildOfflineProductLookupPayload({
  barcodeRow,
  productRow,
  mappingRow,
  profileRow,
  weightRow,
}) {
  const inputMode = normalizeInputMode(profileRow?.input_mode);
  if (!inputMode) {
    return null;
  }

  const resolvedWeightKg = Number.isFinite(Number(weightRow?.weight_kg)) && Number(weightRow.weight_kg) > 0
    ? roundToScale(weightRow.weight_kg, 4)
    : profileRow?.kg_per_pail === null
      ? null
      : roundToScale(profileRow.kg_per_pail, 4);

  if (inputMode === "pail" && (!Number.isFinite(resolvedWeightKg) || resolvedWeightKg <= 0)) {
    return null;
  }

  const { inputLabel, inputUnitLabel } = buildInputDescriptors(inputMode);
  let updatedAt = null;
  updatedAt = resolveLatestIsoTimestamp(updatedAt, barcodeRow?.updated_at || null);
  updatedAt = resolveLatestIsoTimestamp(updatedAt, productRow?.updated_at || null);
  updatedAt = resolveLatestIsoTimestamp(updatedAt, mappingRow?.updated_at || null);
  updatedAt = resolveLatestIsoTimestamp(updatedAt, profileRow?.updated_at || null);
  updatedAt = resolveLatestIsoTimestamp(updatedAt, weightRow?.updated_at || null);

  return {
    productBarcode: normalizeBarcode(barcodeRow?.product_barcode),
    updatedAt,
    product: {
      code: normalizeGoodsCode(barcodeRow?.goods_code, productRow?.sku_code) || null,
      goodsCode: normalizeGoodsCode(barcodeRow?.goods_code, productRow?.sku_code) || null,
      skuCode: productRow?.sku_code || null,
      name: productRow?.sku_name || "",
      brandCode: productRow?.brand_code || null,
      brandName: productRow?.brand_name || null,
      unitName: productRow?.uom_name || null,
      imageUrl: productRow?.image_url || null,
    },
    pieceRate: {
      profileId: profileRow?.id || null,
      profileName: profileRow?.name || "หัวข้อค่าแรง",
      inputMode,
      wageBasis: normalizeWageBasis(profileRow?.wage_basis, "kg"),
      inputLabel,
      inputUnitLabel,
      kgPerPail: profileRow?.kg_per_pail === null ? null : roundToScale(profileRow.kg_per_pail, 4),
      weightOptionId: weightRow?.id || null,
      weightOptionLabel: weightRow?.label || (resolvedWeightKg ? `${resolvedWeightKg} กก.` : null),
      weightKg: resolvedWeightKg,
      payRatePerKg: roundToScale(profileRow?.pay_rate_per_kg || 0, 4),
      payRatePerUnit: roundToScale(profileRow?.pay_rate_per_unit || 0, 4),
    },
  };
}

async function loadPieceRateOfflineStaticMaster(supabaseAdmin) {
  const [profilesResult, weightsResult, mappingsResult] = await Promise.all([
    supabaseAdmin
      .from(PROFILE_TABLE)
      .select("id,name,input_mode,wage_basis,pay_rate_per_kg,pay_rate_per_unit,kg_per_pail,is_active,updated_at")
      .eq("is_active", true)
      .order("id", { ascending: true }),
    supabaseAdmin
      .from(WEIGHT_TABLE)
      .select("id,profile_id,label,weight_kg,is_active,updated_at")
      .eq("is_active", true)
      .order("id", { ascending: true }),
    supabaseAdmin
      .from(MAPPING_TABLE)
      .select("product_code,sku_code,profile_id,weight_option_id,updated_at")
      .order("product_code", { ascending: true }),
  ]);

  if (profilesResult.error) {
    throw new ApiError(500, "Failed to load piece-rate profiles", profilesResult.error.message);
  }
  if (weightsResult.error) {
    throw new ApiError(500, "Failed to load piece-rate weight options", weightsResult.error.message);
  }
  if (mappingsResult.error) {
    throw new ApiError(500, "Failed to load piece-rate mappings", mappingsResult.error.message);
  }

  const profileRows = profilesResult.data || [];
  const weightRows = weightsResult.data || [];
  const mappingRows = (mappingsResult.data || []).filter((row) => (
    normalizeParam(row?.product_code) && normalizeParam(row?.profile_id)
  ));

  const skuCodes = [...new Set(mappingRows
    .map((row) => normalizeGoodsCode(row.sku_code, row.product_code))
    .filter(Boolean))];
  const goodsCodes = [...new Set(mappingRows
    .map((row) => normalizeGoodsCode(row.product_code))
    .filter(Boolean))];
  const [productsResult, barcodesResult, legacyBarcodesResult] = skuCodes.length
    ? await Promise.all([
      supabaseAdmin
        .from("products_cache")
        .select("sku_code,sku_name,brand_code,brand_name,uom_name,image_url,is_active,updated_at")
        .in("sku_code", skuCodes),
      supabaseAdmin
        .from("pallet_trade_code_barcodes")
        .select("goods_code,sku_code,product_barcode,updated_at")
        .in("goods_code", goodsCodes),
      supabaseAdmin
        .from("product_barcodes")
        .select("sku_code,product_barcode,updated_at")
        .in("sku_code", skuCodes),
    ])
    : [{ data: [], error: null }, { data: [], error: null }, { data: [], error: null }];

  if (productsResult.error) {
    throw new ApiError(500, "Failed to load products cache", productsResult.error.message);
  }
  if (barcodesResult.error) {
    throw new ApiError(500, "Failed to load trade code barcodes", barcodesResult.error.message);
  }
  if (legacyBarcodesResult.error) {
    throw new ApiError(500, "Failed to load legacy product barcodes", legacyBarcodesResult.error.message);
  }

  const profileMap = new Map(
    profileRows
      .filter((row) => row?.id)
      .map((row) => [row.id, row])
  );
  const weightMap = new Map(
    weightRows
      .filter((row) => row?.id)
      .map((row) => [row.id, row])
  );
  const mappingMap = new Map(
    mappingRows.map((row) => [String(row.product_code || "").trim().toUpperCase(), row])
  );
  const productMap = new Map(
    (productsResult.data || [])
      .filter((row) => row?.sku_code && row.is_active !== false)
      .map((row) => [String(row.sku_code || "").trim().toUpperCase(), row])
  );

  const productLookups = [];
  let latestUpdatedAt = null;

  const effectiveBarcodeRows = (barcodesResult.data && barcodesResult.data.length)
    ? barcodesResult.data
    : (legacyBarcodesResult.data || []).map((row) => ({
      goods_code: row.sku_code,
      sku_code: row.sku_code,
      product_barcode: row.product_barcode,
      updated_at: row.updated_at,
    }));

  for (const barcodeRow of effectiveBarcodeRows) {
    const goodsCode = String(barcodeRow?.goods_code || "").trim().toUpperCase();
    const productCode = String(barcodeRow?.sku_code || "").trim().toUpperCase();
    const mappingRow = mappingMap.get(goodsCode) || mappingMap.get(productCode);
    const profileRow = profileMap.get(mappingRow?.profile_id);
    const weightRow = mappingRow?.weight_option_id ? weightMap.get(mappingRow.weight_option_id) : null;
    const productRow = productMap.get(productCode);

    if (!mappingRow || !profileRow || !productRow) {
      continue;
    }

    const payload = buildOfflineProductLookupPayload({
      barcodeRow,
      productRow,
      mappingRow,
      profileRow,
      weightRow,
    });
    if (!payload?.productBarcode || !payload?.product?.code) {
      continue;
    }

    latestUpdatedAt = resolveLatestIsoTimestamp(latestUpdatedAt, payload.updatedAt);
    productLookups.push(payload);
  }

  return {
    updatedAt: latestUpdatedAt,
    productLookups,
    stats: {
      profileCount: profileRows.length,
      weightCount: weightRows.length,
      mappingCount: mappingRows.length,
      productCount: productMap.size,
      barcodeCount: productLookups.length,
    },
  };
}

async function loadPieceRateOfflineEmployeesPage({
  cursor = null,
  pageSize = 200,
  supabaseAdmin,
}) {
  const params = new URLSearchParams({
    status: "active",
    pageSize: String(Math.min(Math.max(50, pageSize), 200)),
  });
  if (cursor) {
    params.set("cursor", cursor);
  }

  const lookup = await fetchGatewayJson("/api/employees", params, "realtime");
  if (!lookup.ok) {
    throw new ApiError(
      lookup.status || 502,
      lookup.error?.message || "Failed to load employee master",
      lookup.error?.details
    );
  }

  if (lookup.status && lookup.status >= 400) {
    throw new ApiError(
      lookup.status,
      lookup.data?.error || "Failed to load employee master",
      lookup.data?.details
    );
  }

  const rows = Array.isArray(lookup.data?.data) ? lookup.data.data : [];
  let employees = rows
    .map((row) => normalizeOfflineEmployee(row))
    .filter(Boolean);
  if (supabaseAdmin && employees.length) {
    const employeeCodes = employees.map((employee) => employee.employeeCode);
    const { data: photoRows } = await supabaseAdmin
      .from(EMPLOYEE_PHOTO_TABLE)
      .select("employee_code")
      .in("employee_code", employeeCodes);
    const photoCodes = new Set((photoRows || []).map((row) => row.employee_code));
    employees = employees.map((employee) => photoCodes.has(employee.employeeCode)
      ? { ...employee, imageUrl: `/api/employees/photos/${encodeURIComponent(employee.employeeCode)}` }
      : employee);
  }

  return {
    rows: employees,
    pagination: lookup.data?.pagination || null,
    cursor: {
      next: normalizeCursorValue(lookup.data?.cursor?.next),
      hasMore: Boolean(lookup.data?.cursor?.hasMore),
    },
  };
}

function getBangkokYearBE(dateInput) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput || Date.now());
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(500, "Invalid server time while generating document number");
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    calendar: "buddhist",
    year: "numeric",
  });
  const yearPart = formatter
    .formatToParts(date)
    .find((part) => part.type === "year")?.value;
  const parsedYear = Number.parseInt(yearPart || "", 10);
  if (!Number.isFinite(parsedYear)) {
    throw new ApiError(500, "Unable to resolve Buddhist year while generating document number");
  }
  return parsedYear < 2400 ? parsedYear + 543 : parsedYear;
}

function getBangkokMonth(dateInput) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput || Date.now());
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(500, "Invalid server time while generating document number");
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Bangkok",
    month: "numeric",
  });
  const monthPart = formatter
    .formatToParts(date)
    .find((part) => part.type === "month")?.value;
  const parsedMonth = Number.parseInt(monthPart || "", 10);
  if (!Number.isFinite(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
    throw new ApiError(500, "Unable to resolve month while generating document number");
  }
  return parsedMonth;
}

function getBangkokDateKey(dateInput) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput || Date.now());
  if (Number.isNaN(date.getTime())) {
    throw new ApiError(500, "Invalid server time while generating document number");
  }

  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return `${parts.year}${parts.month}${parts.day}`;
}

async function reservePieceRateDocumentNo(
  supabaseAdmin,
  machineCode,
  docYearBE,
  docMonth,
  { workDate, source = "daily_scan", actorUserId = null, requestId = null, metadata = {} } = {}
) {
  const { data, error } = await supabaseAdmin.rpc(PIECE_RATE_DOC_COUNTER_FUNCTION, {
    p_machine_code: machineCode,
    p_year_be: docYearBE,
    p_month: docMonth ?? null,
    p_doc_date: workDate,
    p_source: source,
    p_actor_user_id: actorUserId,
    p_request_id: requestId,
    p_metadata: metadata && typeof metadata === "object" ? metadata : {},
  });

  if (error) {
    throw new ApiError(500, "Failed to generate document number", error.message);
  }

  const rawPayload = Array.isArray(data) ? data[0] : data;
  let payload = rawPayload;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = null;
    }
  }

  const docSeq = Number.parseInt(String(payload?.doc_seq ?? payload?.docSeq ?? ""), 10);
  const docNo = normalizeText(payload?.doc_no ?? payload?.docNo);
  if (!Number.isFinite(docSeq) || docSeq <= 0) {
    throw new ApiError(500, "Invalid document sequence returned by database");
  }
  if (docSeq > PIECE_RATE_DOC_SEQ_MAX) {
    throw new ApiError(500, `Invalid document sequence returned by database (max ${PIECE_RATE_DOC_SEQ_MAX})`);
  }
  if (!docNo || !PIECE_RATE_OFFLINE_DOC_NO_REGEX.test(docNo)) {
    throw new ApiError(500, "Invalid document number returned by database");
  }

  return {
    docRound: 1,
    docSeq,
    docNo,
  };
}

async function raisePieceRateDocumentCounter(
  supabaseAdmin,
  machineCode,
  docYearBE,
  docSeq,
  { workDate, docNo = null, source = "system", actorUserId = null, requestId = null, metadata = {} } = {}
) {
  const normalizedSeq = Number.parseInt(String(docSeq ?? ""), 10);
  if (!Number.isFinite(normalizedSeq) || normalizedSeq <= 0) {
    return;
  }

  const { error } = await supabaseAdmin.rpc(PIECE_RATE_RAISE_DOC_COUNTER_FUNCTION, {
    p_machine_code: machineCode,
    p_year_be: docYearBE,
    p_seq: Math.min(normalizedSeq, PIECE_RATE_DOC_SEQ_MAX),
    p_doc_date: workDate,
    p_doc_no: docNo || null,
    p_source: source,
    p_actor_user_id: actorUserId,
    p_request_id: requestId,
    p_metadata: metadata && typeof metadata === "object" ? metadata : {},
  });

  if (error) {
    throw new ApiError(500, "Failed to raise piece-rate document counter", error.message);
  }
}

async function getOperatorUsername(supabaseAdmin, userId, fallback) {
  const profileResult = await supabaseAdmin
    .from("profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();

  if (profileResult.error) {
    throw new ApiError(500, "Failed to resolve operator profile", profileResult.error.message);
  }

  return normalizeText(profileResult.data?.username)
    || normalizeText(fallback)
    || userId;
}

async function lookupEmployeeByCode(employeeCode, date) {
  const params = new URLSearchParams({
    employeeCode: normalizeEmployeeCode(employeeCode) || employeeCode,
    date,
  });
  const lookup = await fetchGatewayJson("/api/consolidated-lookup", params, "realtime");
  if (!lookup.ok && lookup.status === 404) {
    return null;
  }
  if (!lookup.ok) {
    throw new ApiError(
      lookup.status || 502,
      lookup.error?.message || "Failed to lookup employee",
      lookup.error?.details
    );
  }

  const row = lookup.data?.data;
  if (!row) {
    return null;
  }

  const checkIn = normalizeAttendanceTime(row.CheckIn);
  const checkOutRaw = normalizeAttendanceTime(row.CheckOut);

  return {
    employeeCode: normalizeEmployeeCode(normalizeParam(row.PRS_NO) || employeeCode) || employeeCode,
    name: normalizeParam(row.Name) || null,
    departmentName: normalizeParam(row.DEPT_THAIDESC) || null,
    branch: normalizeParam(row.BR_THAIDESC) || null,
    checkIn,
    checkOut: checkOutRaw && checkIn && checkOutRaw !== checkIn ? checkOutRaw : null,
  };
}

async function lookupEmployeeSnapshotFromPieceRateLogs(supabaseAdmin, employeeCode) {
  const employeeCodeVariants = buildEmployeeCodeVariants(employeeCode);
  if (employeeCodeVariants.length === 0) {
    return null;
  }

  const selectColumns = [
    "employee_code",
    "raw_employee_qr_payload",
    "employee_name_snapshot",
    "employee_department_snapshot",
    "employee_branch_snapshot",
    "employee_check_in_snapshot",
    "employee_check_out_snapshot",
    "logged_at",
  ].join(",");

  const [employeeCodeResult, rawPayloadResult] = await Promise.all([
    supabaseAdmin
      .from(LOG_TABLE)
      .select(selectColumns)
      .in("employee_code", employeeCodeVariants)
      .order("logged_at", { ascending: false })
      .limit(1),
    supabaseAdmin
      .from(LOG_TABLE)
      .select(selectColumns)
      .in("raw_employee_qr_payload", employeeCodeVariants)
      .order("logged_at", { ascending: false })
      .limit(1),
  ]);

  if (employeeCodeResult.error) {
    throw new ApiError(500, "Failed to lookup employee snapshot", employeeCodeResult.error.message);
  }
  if (rawPayloadResult.error) {
    throw new ApiError(500, "Failed to lookup employee snapshot", rawPayloadResult.error.message);
  }

  const latestSnapshot = [
    ...(employeeCodeResult.data || []),
    ...(rawPayloadResult.data || []),
  ]
    .filter((row) => normalizeText(row.employee_name_snapshot))
    .sort((left, right) => {
      const leftTime = new Date(left.logged_at || 0).getTime() || 0;
      const rightTime = new Date(right.logged_at || 0).getTime() || 0;
      return rightTime - leftTime;
    })[0];

  if (!latestSnapshot) {
    return null;
  }

  return {
    employeeCode: normalizeEmployeeCode(employeeCode)
      || normalizeEmployeeCode(latestSnapshot.employee_code)
      || employeeCode,
    name: normalizeText(latestSnapshot.employee_name_snapshot) || null,
    departmentName: normalizeText(latestSnapshot.employee_department_snapshot) || null,
    branch: normalizeText(latestSnapshot.employee_branch_snapshot) || null,
    checkIn: normalizeText(latestSnapshot.employee_check_in_snapshot) || null,
    checkOut: normalizeText(latestSnapshot.employee_check_out_snapshot) || null,
  };
}


export async function resolvePieceRateProductByBarcode(supabaseAdmin, rawBarcode) {
  const normalizedBarcode = normalizeBarcode(rawBarcode);
  if (!normalizedBarcode) {
    throw new ApiError(400, "productBarcode is required");
  }

  const [tradeBarcodeResult, legacyBarcodeResult] = await Promise.all([
    supabaseAdmin
      .from("pallet_trade_code_barcodes")
      .select("goods_code,sku_code,product_barcode")
      .eq("product_barcode", normalizedBarcode)
      .maybeSingle(),
    supabaseAdmin
      .from("product_barcodes")
      .select("sku_code,product_barcode")
      .eq("product_barcode", normalizedBarcode)
      .maybeSingle(),
  ]);

  if (tradeBarcodeResult.error) {
    throw new ApiError(500, "Failed to load trade code barcode mapping", tradeBarcodeResult.error.message);
  }
  if (legacyBarcodeResult.error) {
    throw new ApiError(500, "Failed to load product barcode mapping", legacyBarcodeResult.error.message);
  }

  let goodsCode = normalizeGoodsCode(
    tradeBarcodeResult.data?.goods_code,
    legacyBarcodeResult.data?.sku_code || tradeBarcodeResult.data?.sku_code
  );
  const skuCode = normalizeGoodsCode(
    tradeBarcodeResult.data?.sku_code,
    legacyBarcodeResult.data?.sku_code
  );

  if (!goodsCode || !skuCode) {
    throw new ApiError(400, "ไม่พบบาร์โค้ดสินค้าในระบบ");
  }
  const [productResult, mappingResult] = await Promise.all([
    supabaseAdmin
      .from("products_cache")
      .select("sku_code,sku_name,brand_code,brand_name,uom_name,image_url")
      .eq("sku_code", skuCode)
      .maybeSingle(),
    supabaseAdmin
      .from(MAPPING_TABLE)
      .select("product_code,sku_code,profile_id,weight_option_id")
      .or(`product_code.eq.${goodsCode},product_code.eq.${skuCode},sku_code.eq.${skuCode}`),
  ]);

  if (productResult.error) {
    throw new ApiError(500, "Failed to load product", productResult.error.message);
  }
  if (mappingResult.error) {
    throw new ApiError(500, "Failed to load piece-rate mapping", mappingResult.error.message);
  }

  if (!productResult.data?.sku_code) {
    throw new ApiError(400, "Product details were not found for this barcode");
  }

  let resolvedMappingRow = pickPieceRateMappingRow(mappingResult.data, goodsCode, skuCode);
  if (!resolvedMappingRow?.profile_id) {
    const resolvedGoodsCode = await resolveTradeGoodsCodeBySkuCode(supabaseAdmin, skuCode);
    if (resolvedGoodsCode && resolvedGoodsCode !== goodsCode) {
      goodsCode = resolvedGoodsCode;
      const fallbackMappingResult = await supabaseAdmin
        .from(MAPPING_TABLE)
        .select("product_code,sku_code,profile_id,weight_option_id")
        .or(`product_code.eq.${goodsCode},product_code.eq.${skuCode},sku_code.eq.${skuCode}`);

      if (fallbackMappingResult.error) {
        throw new ApiError(500, "Failed to load fallback piece-rate mapping", fallbackMappingResult.error.message);
      }

      resolvedMappingRow = pickPieceRateMappingRow(fallbackMappingResult.data, goodsCode, skuCode);
    }
  }

  if (!resolvedMappingRow?.profile_id) {
    throw new ApiError(400, "This product is not mapped to a piece-rate profile yet");
  }

  const profileResult = await supabaseAdmin
    .from(PROFILE_TABLE)
    .select("id,name,input_mode,wage_basis,pay_rate_per_kg,pay_rate_per_unit,kg_per_pail,is_active")
    .eq("id", resolvedMappingRow.profile_id)
    .maybeSingle();

  if (profileResult.error) {
    throw new ApiError(500, "Failed to load piece-rate profile", profileResult.error.message);
  }

  const profileRow = profileResult.data;
  if (!profileRow) {
    throw new ApiError(400, "ไม่พบหัวข้อการคิดค่าแรงที่ผูกกับสินค้า");
  }
  if (profileRow.is_active === false) {
    throw new ApiError(400, "หัวข้อการคิดค่าแรงของสินค้านี้ถูกปิดใช้งาน");
  }

  const inputMode = normalizeInputMode(profileRow.input_mode);
  if (!inputMode) {
    throw new ApiError(500, "Invalid piece-rate profile input mode");
  }

  const payRatePerKg = roundToScale(profileRow.pay_rate_per_kg || 0, 4);
  const wageBasis = normalizeWageBasis(profileRow.wage_basis, "kg");
  const payRatePerUnit = roundToScale(profileRow.pay_rate_per_unit || 0, 4);
  const kgPerPail = profileRow.kg_per_pail === null ? null : roundToScale(profileRow.kg_per_pail, 4);
  let weightOption = null;
  if (resolvedMappingRow?.weight_option_id) {
    const weightResult = await supabaseAdmin
      .from(WEIGHT_TABLE)
      .select("id,label,weight_kg,is_active")
      .eq("id", resolvedMappingRow.weight_option_id)
      .maybeSingle();
    if (weightResult.error) {
      throw new ApiError(500, "Failed to load piece-rate weight option", weightResult.error.message);
    }
    if (weightResult.data?.id && weightResult.data.is_active !== false) {
      weightOption = {
        id: weightResult.data.id,
        label: weightResult.data.label || "",
        weightKg: roundToScale(weightResult.data.weight_kg || 0, 4),
      };
    }
  }
  const resolvedWeightKg = Number.isFinite(weightOption?.weightKg) && weightOption.weightKg > 0
    ? weightOption.weightKg
    : kgPerPail;
  if (inputMode === "pail" && (!Number.isFinite(resolvedWeightKg) || resolvedWeightKg <= 0)) {
    throw new ApiError(500, "Piece-rate profile is missing weight option for pail input mode");
  }

  const { inputLabel, inputUnitLabel } = buildInputDescriptors(inputMode);
  const resolvedProductCode = normalizeGoodsCode(resolvedMappingRow?.product_code, goodsCode || skuCode) || skuCode;

  return {
    barcode: normalizedBarcode,
    product: {
      code: resolvedProductCode,
      goodsCode: resolvedProductCode,
      skuCode: productResult.data.sku_code,
      name: productResult.data.sku_name || "",
      brandCode: productResult.data.brand_code || null,
      brandName: productResult.data.brand_name || null,
      unitName: productResult.data.uom_name || null,
      imageUrl: productResult.data.image_url || null,
    },
    profile: {
      id: profileRow.id,
      name: profileRow.name || "หัวข้อค่าแรง",
      inputMode,
      inputLabel,
      inputUnitLabel,
      wageBasis,
      payRatePerKg,
      payRatePerUnit,
      kgPerPail,
      weightOptionId: weightOption?.id || null,
      weightOptionLabel: weightOption?.label || (resolvedWeightKg ? `${resolvedWeightKg} กก.` : null),
      weightKg: resolvedWeightKg,
    },
  };
}


function mapPieceRateReportRow(row, capabilities) {
  const canViewMoney = capabilities?.canViewMoney ?? false;
  const inputMode = normalizeInputMode(row.input_mode_snapshot, "kg");
  const descriptors = buildInputDescriptors(inputMode);
  const docStatus = normalizeDocStatus(row.doc_status, DOC_STATUS_ACTIVE);
  const workTypeName = row.piece_rate_profile_name_snapshot || "-";
  const actualWeighedAt = row.actual_weighed_at || extractPieceRateCapturedAt(row) || row.logged_at || null;
  const serverLoggedAt = row.logged_at || null;
  const displayEmployeeCode = normalizeEmployeeCode(row.raw_employee_qr_payload)
    || normalizeEmployeeCode(row.employee_code)
    || row.employee_code
    || "-";
  const storedEmployeeCode = normalizeEmployeeCode(row.employee_code) || row.employee_code || "-";

  return {
    id: row.id,
    requestId: row.request_id || null,
    loggedAt: actualWeighedAt,
    actualWeighedAt,
    serverLoggedAt,
    groupDayKey: actualWeighedAt ? getBangkokWorkDate(actualWeighedAt) : "-",
    docNo: row.doc_no || null,
    lotNo: row.lot_no || null,
    machineCode: row.machine_code || "-",
    employeeCode: displayEmployeeCode,
    rawEmployeeCode: storedEmployeeCode,
    rawEmployeeQrPayload: row.raw_employee_qr_payload || null,
    employeeName: row.employee_name_snapshot || "-",
    employeeDepartment: row.employee_department_snapshot || "-",
    employeeBranch: row.employee_branch_snapshot || "-",
    productBarcode: row.product_barcode_snapshot || "-",
    productCode: row.product_code_snapshot || "-",
    productGoodsCode: row.product_goods_code_snapshot || row.product_code_snapshot || "-",
    productSkuCode: row.product_sku_code_snapshot || "-",
    groupProductKey: row.product_barcode_snapshot || row.product_goods_code_snapshot || row.product_code_snapshot || "-",
    productName: row.product_name_snapshot || "-",
    productBrandName: row.product_brand_name_snapshot || "-",
    pieceRateProfileName: workTypeName,
    workTypeName,
    weightOptionLabel: row.weight_option_label_snapshot || null,
    weightKg: row.weight_kg_snapshot === null ? null : Number(row.weight_kg_snapshot || 0),
    inputMode,
    wageBasis: canViewMoney ? normalizeWageBasis(row.wage_basis_snapshot, "kg") : null,
    inputLabel: row.input_label_snapshot || descriptors.inputLabel,
    inputUnitLabel: row.input_unit_label_snapshot || descriptors.inputUnitLabel,
    inputValue: Number(row.input_value || 0),
    ...resolvePieceRateReportMetrics(row),
    payRatePerUnit: canViewMoney ? Number(row.pay_rate_per_unit_snapshot || 0) : null,
    payRatePerKg: canViewMoney ? Number(row.pay_rate_per_kg_snapshot || 0) : null,
    operatorUsername: row.operator_username_snapshot || row.operator_user_id || "-",
    wageAmount: canViewMoney ? Number(row.wage_amount_snapshot || 0) : null,
    docStatus,
    isEdited: Boolean(row.is_edited),
    editedAt: row.edited_at || null,
    editedBy: row.edited_by || null,
    editReason: row.edit_reason || null,
    revisedFromLogId: row.revised_from_log_id || null,
    revisedFromDocNo: row.revised_from_doc_no || null,
    replacedByLogId: row.replaced_by_log_id || null,
    replacedByDocNo: row.replaced_by_doc_no || null,
    cancelledAt: row.cancelled_at || null,
    cancelledBy: row.cancelled_by || null,
    cancelReason: row.cancel_reason || null,
    canViewMoney,
    source: row.source || "piece_rate_scan",
  };
}

function applyPieceRateReportWageRules(rows, capabilities) {
  return capabilities?.canViewMoney ? applyPieceRatePayPeriodWage(rows) : rows;
}

function canViewPieceRateRates(permission = {}) {
  return process.env.ROLE_TASK_PERMISSIONS_ENABLED !== "true"
    || permission.isAdmin
    || permission.permissions?.includes("production-piece-rate-rate-view")
    || permission.permissions?.includes(REPORT_MONEY_PERMISSION_KEY);
}

function buildCreateResponse(row, duplicated = false, permission = {}) {
  const canViewRates = canViewPieceRateRates(permission);
  const inputMode = normalizeInputMode(row.input_mode_snapshot, "kg");
  const fallbackDescriptors = buildInputDescriptors(inputMode);

  return {
    ok: true,
    duplicated,
    data: {
      id: row.id,
      requestId: row.request_id,
      loggedAt: row.logged_at,
      docNo: row.doc_no || null,
      lotNo: row.lot_no || null,
      machineCode: row.machine_code || null,
      docYearBe: row.doc_year_be ?? null,
      docRound: row.doc_round ?? null,
      docSeq: row.doc_seq ?? null,
      employeeCode: normalizeEmployeeCode(row.raw_employee_qr_payload)
        || normalizeEmployeeCode(row.employee_code)
        || row.employee_code,
      employeeName: row.employee_name_snapshot || "-",
      employeeDepartment: row.employee_department_snapshot || "-",
      employeeBranch: row.employee_branch_snapshot || "-",
      productBarcode: row.product_barcode_snapshot,
      productCode: row.product_code_snapshot,
      productGoodsCode: row.product_goods_code_snapshot || row.product_code_snapshot,
      productSkuCode: row.product_sku_code_snapshot || null,
      productName: row.product_name_snapshot,
      productBrandCode: row.product_brand_code_snapshot || null,
      productBrandName: row.product_brand_name_snapshot || "-",
      pieceRateProfileName: row.piece_rate_profile_name_snapshot,
      weightOptionLabel: row.weight_option_label_snapshot || null,
      weightKg: row.weight_kg_snapshot === null ? null : Number(row.weight_kg_snapshot || 0),
      inputMode,
      wageBasis: normalizeWageBasis(row.wage_basis_snapshot, "kg"),
      inputValue: Number(row.input_value || 0),
      countValue: Number(row.count_value_snapshot || 1),
      inputLabel: row.input_label_snapshot || fallbackDescriptors.inputLabel,
      inputUnitLabel: row.input_unit_label_snapshot || fallbackDescriptors.inputUnitLabel,
      normalizedKgAmount: Number(row.normalized_kg_amount_snapshot || 0),
      payRatePerUnit: canViewRates ? Number(row.pay_rate_per_unit_snapshot || 0) : null,
      payRatePerKg: canViewRates ? Number(row.pay_rate_per_kg_snapshot || 0) : null,
      operatorUsername: row.operator_username_snapshot || row.operator_user_id || "-",
      docStatus: normalizeDocStatus(row.doc_status, DOC_STATUS_ACTIVE),
    },
  };
}

function extractPieceRateCapturedAt(value) {
  const capturedAt = value?.metadata?.scaleAudit?.capturedAt;
  if (!capturedAt) {
    return null;
  }

  const parsed = new Date(capturedAt);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString();
}

function formatMoney(value, digits = 2) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(digits));
}

function toUtcRange(dateFrom, dateTo) {
  const from = normalizeParam(dateFrom) || new Date().toISOString().slice(0, 10);
  const to = normalizeParam(dateTo) || from;
  return {
    from: new Date(`${from}T00:00:00+07:00`).toISOString(),
    to: new Date(`${to}T23:59:59.999+07:00`).toISOString(),
  };
}

function normalizeDocStatus(value, fallback = DOC_STATUS_ACTIVE) {
  const normalized = String(value || "").trim().toLowerCase();
  if (DOC_STATUS_SET.has(normalized)) {
    return normalized;
  }
  return fallback;
}

function applyExistingDocStatusFilter(query, docStatusValue) {
  const normalized = String(docStatusValue ?? "").trim().toLowerCase();
  if (!normalized) {
    return query.is("doc_status", null);
  }
  return query.eq("doc_status", normalized);
}

function escapeForIlike(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/%/g, "\\%")
    .replace(/_/g, "\\_")
    .replace(/,/g, " ");
}

function buildPieceRateReportSelectColumns({ includeActualWeighedAt = true } = {}) {
  const columns = [
    "id",
    "request_id",
    "logged_at",
    "metadata",
    "doc_no",
    "lot_no",
    "machine_code",
    "employee_code",
    "raw_employee_qr_payload",
    "employee_name_snapshot",
    "employee_department_snapshot",
    "employee_branch_snapshot",
    "product_barcode_snapshot",
    "product_code_snapshot",
    "product_goods_code_snapshot",
    "product_sku_code_snapshot",
    "product_name_snapshot",
    "product_brand_name_snapshot",
    "piece_rate_profile_name_snapshot",
    "weight_option_label_snapshot",
    "weight_kg_snapshot",
    "input_mode_snapshot",
    "wage_basis_snapshot",
    "input_value",
    "count_value_snapshot",
    "input_label_snapshot",
    "input_unit_label_snapshot",
    "normalized_kg_amount_snapshot",
    "pay_rate_per_kg_snapshot",
    "pay_rate_per_unit_snapshot",
    "operator_user_id",
    "operator_username_snapshot",
    "wage_amount_snapshot",
    "is_edited",
    "edited_at",
    "edited_by",
    "edit_reason",
    "doc_status",
    "revised_from_log_id",
    "revised_from_doc_no",
    "replaced_by_log_id",
    "replaced_by_doc_no",
    "cancelled_at",
    "cancelled_by",
    "cancel_reason",
    "source",
  ];

  if (includeActualWeighedAt) {
    columns.splice(2, 0, "actual_weighed_at");
  }

  return columns.join(",");
}

function isActualWeighedAtMissingColumnError(error) {
  const message = String(error?.message || error?.details || error?.hint || "").toLowerCase();
  return message.includes("actual_weighed_at")
    && (
      message.includes("column")
      || message.includes("schema cache")
      || message.includes("does not exist")
    );
}

function applyPieceRateReportTimeRange(query, timestampColumn, from, to) {
  return query
    .gte(timestampColumn, from)
    .lte(timestampColumn, to);
}

function applyPieceRateReportFilters(query, { from, to, hideCancelled, hideReplaced, search, productKeys = [] }, timestampColumn = "actual_weighed_at") {
  let nextQuery = query;
  nextQuery = applyPieceRateReportTimeRange(nextQuery, timestampColumn, from, to);

  if (hideCancelled) {
    nextQuery = nextQuery.neq("doc_status", DOC_STATUS_CANCELLED);
  }
  if (hideReplaced) {
    nextQuery = nextQuery.neq("doc_status", DOC_STATUS_REPLACED);
  }

  if (search) {
    const escaped = escapeForIlike(search);
    const clause = [
      `doc_no.ilike.%${escaped}%`,
      `lot_no.ilike.%${escaped}%`,
      `employee_code.ilike.%${escaped}%`,
      `raw_employee_qr_payload.ilike.%${escaped}%`,
      `employee_name_snapshot.ilike.%${escaped}%`,
      `product_code_snapshot.ilike.%${escaped}%`,
      `product_goods_code_snapshot.ilike.%${escaped}%`,
      `product_sku_code_snapshot.ilike.%${escaped}%`,
      `product_name_snapshot.ilike.%${escaped}%`,
      `product_brand_name_snapshot.ilike.%${escaped}%`,
      `piece_rate_profile_name_snapshot.ilike.%${escaped}%`,
      `revised_from_doc_no.ilike.%${escaped}%`,
      `replaced_by_doc_no.ilike.%${escaped}%`,
      `operator_username_snapshot.ilike.%${escaped}%`,
    ].join(",");
    nextQuery = nextQuery.or(clause);
  }

  if (Array.isArray(productKeys) && productKeys.length > 0) {
    nextQuery = nextQuery.in("product_goods_code_snapshot", productKeys);
  }

  return nextQuery;
}

async function fetchAllPieceRateReportRawRows(
  supabaseAdmin,
  selectColumns,
  filters,
  timestampColumn = "actual_weighed_at",
  includeActualWeighedAt = true
) {
  if (Array.isArray(filters?.productKeys) && filters.productKeys.length > 20) {
    const batches = [];
    for (let i = 0; i < filters.productKeys.length; i += 20) {
      batches.push(filters.productKeys.slice(i, i + 20));
    }
    const results = await Promise.all(
      batches.map((batch) =>
        fetchAllPieceRateReportRawRows(
          supabaseAdmin,
          selectColumns,
          { ...filters, productKeys: batch },
          timestampColumn,
          includeActualWeighedAt
        )
      )
    );
    const seenIds = new Set();
    const combined = [];
    results.flat().forEach((row) => {
      if (row?.id && !seenIds.has(row.id)) {
        seenIds.add(row.id);
        combined.push(row);
      }
    });
    return combined;
  }

  const chunkSize = 1000;
  let fromIndex = 0;
  const rows = [];

  while (true) {
    let query = supabaseAdmin
      .from(LOG_TABLE)
      .select(selectColumns);

    query = applyPieceRateReportFilters(query, filters, timestampColumn)
      .order(timestampColumn, { ascending: false })
      .range(fromIndex, fromIndex + chunkSize - 1);

    const result = await query;
    if (result.error) {
      if (timestampColumn === "actual_weighed_at" && isActualWeighedAtMissingColumnError(result.error)) {
        return fetchAllPieceRateReportRawRows(
          supabaseAdmin,
          buildPieceRateReportSelectColumns({ includeActualWeighedAt: false }),
          filters,
          "logged_at",
          false
        );
      }
      throw new ApiError(500, "Failed to load piece-rate report rows", result.error.message);
    }

    const batch = result.data || [];
    rows.push(...batch);

    if (batch.length < chunkSize) {
      break;
    }

    fromIndex += chunkSize;
  }

  return rows;
}

function buildPieceRateReportGroupKey(row) {
  const dayKey = row.loggedAt ? getBangkokWorkDate(row.loggedAt) : "-";
  return [
    dayKey,
    getEmployeeCodeMatchKey(row.rawEmployeeCode || row.employeeCode) || row.employeeCode || "-",
    row.productBarcode || row.productGoodsCode || row.productCode || "-",
  ].join("::");
}

function compareGroupedPieceRateRows(left, right) {
  const leftDay = left.groupDayKey || (left.loggedAt ? getBangkokWorkDate(left.loggedAt) : "");
  const rightDay = right.groupDayKey || (right.loggedAt ? getBangkokWorkDate(right.loggedAt) : "");
  const dayCompare = leftDay.localeCompare(rightDay);
  if (dayCompare !== 0) return dayCompare;

  const productCompare = String(left.productName || "").localeCompare(String(right.productName || ""), "th-TH");
  if (productCompare !== 0) return productCompare;

  const productCodeCompare = String(
    left.productCode || left.productSkuCode || left.productGoodsCode || left.productBarcode || ""
  ).localeCompare(
    String(right.productCode || right.productSkuCode || right.productGoodsCode || right.productBarcode || ""),
    "th-TH"
  );
  if (productCodeCompare !== 0) return productCodeCompare;

  const employeeCompare = String(left.employeeName || "").localeCompare(String(right.employeeName || ""), "th-TH");
  if (employeeCompare !== 0) return employeeCompare;

  const leftTime = Date.parse(left.loggedAt || "") || 0;
  const rightTime = Date.parse(right.loggedAt || "") || 0;
  return rightTime - leftTime;
}

function sortGroupedPieceRateRows(rows) {
  return [...rows].sort(compareGroupedPieceRateRows);
}

function buildGroupedPieceRateSubtotalKey(row) {
  const dayKey = row.groupDayKey || (row.loggedAt ? getBangkokWorkDate(row.loggedAt) : "-");
  const productCode = row.productCode || row.productSkuCode || row.productGoodsCode || row.productBarcode || "-";
  const productName = row.productName || "-";
  return `${dayKey}::${productCode}::${productName}`;
}

function annotateGroupedPieceRateRows(rows) {
  const sortedRows = sortGroupedPieceRateRows(rows);
  const annotatedRows = [];

  let currentGroupRows = [];
  let currentGroupKey = null;
  let subtotal = {
    countValue: 0,
    normalizedKgAmount: 0,
    wageAmount: 0,
  };

  const flushGroup = () => {
    if (currentGroupRows.length === 0) {
      return;
    }

    currentGroupRows.forEach((row, index) => {
      const isTail = index === currentGroupRows.length - 1;
      annotatedRows.push({
        ...row,
        isGroupedProductTail: isTail,
        groupSubtotalCountValue: isTail ? Number(subtotal.countValue || 0) : 0,
        groupSubtotalNormalizedKgAmount: isTail ? Number(subtotal.normalizedKgAmount || 0) : 0,
        groupSubtotalWageAmount: isTail ? Number(subtotal.wageAmount || 0) : 0,
      });
    });

    currentGroupRows = [];
    currentGroupKey = null;
    subtotal = {
      countValue: 0,
      normalizedKgAmount: 0,
      wageAmount: 0,
    };
  };

  sortedRows.forEach((row) => {
    const groupKey = buildGroupedPieceRateSubtotalKey(row);
    if (currentGroupRows.length > 0 && groupKey !== currentGroupKey) {
      flushGroup();
    }

    currentGroupRows.push(row);
    currentGroupKey = groupKey;
    subtotal.countValue += Number(row.countValue || 0);
    subtotal.normalizedKgAmount += Number(row.normalizedKgAmount || 0);
    subtotal.wageAmount += Number(row.wageAmount || 0);
  });

  flushGroup();
  return annotatedRows;
}

function aggregatePieceRateReportRows(rows, capabilities) {
  const grouped = new Map();

  rows.forEach((row) => {
    const key = buildPieceRateReportGroupKey(row);
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, {
        ...row,
        id: `group:${key}`,
        docCount: 1,
        mergedRowCount: 1,
        latestDocNo: row.docNo || "-",
        latestLoggedAt: row.loggedAt,
        operatorUsername: row.operatorUsername || "-",
      });
      return;
    }

    const nextLoggedAt = Date.parse(row.loggedAt || "") || 0;
    const currentLoggedAt = Date.parse(current.latestLoggedAt || current.loggedAt || "") || 0;
    if (nextLoggedAt >= currentLoggedAt) {
      current.loggedAt = row.loggedAt;
      current.latestLoggedAt = row.loggedAt;
      current.docNo = row.docNo || current.docNo;
      current.latestDocNo = row.docNo || current.latestDocNo;
      current.operatorUsername = row.operatorUsername || current.operatorUsername;
      current.machineCode = row.machineCode || current.machineCode;
    }

    current.docCount += row.docNo && row.docNo !== "-" ? 1 : 0;
    current.mergedRowCount += 1;
    current.inputValue += Number(row.inputValue || 0);
    current.countValue += Number(row.countValue || 0);
    current.normalizedKgAmount += Number(row.normalizedKgAmount || 0);
    if (capabilities.canViewMoney) {
      current.wageAmount = Number(current.wageAmount || 0) + Number(row.wageAmount || 0);
    }
  });

  return annotateGroupedPieceRateRows(Array.from(grouped.values()));
}

function aggregatePieceRateEmployeeRows(rows, capabilities) {
  const grouped = new Map();

  rows.forEach((row) => {
    const employeeCode = normalizeEmployeeCode(row.employeeCode || row.rawEmployeeCode) || row.employeeCode || "-";
    const workTypeName = row.workTypeName || row.pieceRateProfileName || "-";
    const employeeGroupKey = `${getEmployeeCodeMatchKey(row.rawEmployeeCode || employeeCode) || employeeCode}::${workTypeName}`;
    const current = grouped.get(employeeGroupKey);
    const dayKey = row.loggedAt ? getBangkokWorkDate(row.loggedAt) : "-";
    const productKey = row.productGoodsCode || row.productCode || row.productSkuCode || row.productBarcode || "-";

    if (!current) {
      grouped.set(employeeGroupKey, {
        id: `employee:${employeeCode}:${workTypeName}`,
        employeeCode,
        employeeName: row.employeeName || "-",
        employeeDepartment: row.employeeDepartment || "-",
        employeeBranch: row.employeeBranch || "-",
        workTypeName,
        loggedAt: row.loggedAt,
        lastLoggedAt: row.loggedAt,
        docCount: row.docNo && row.docNo !== "-" ? 1 : 0,
        workDayCount: dayKey && dayKey !== "-" ? 1 : 0,
        productCount: productKey && productKey !== "-" ? 1 : 0,
        inputValue: Number(row.inputValue || 0),
        countValue: Number(row.countValue || 0),
        normalizedKgAmount: Number(row.normalizedKgAmount || 0),
        wageAmount: capabilities.canViewMoney ? Number(row.wageAmount || 0) : null,
        activeDocumentCount: row.docStatus === DOC_STATUS_ACTIVE ? 1 : 0,
        replacedDocumentCount: row.docStatus === DOC_STATUS_REPLACED ? 1 : 0,
        cancelledDocumentCount: row.docStatus === DOC_STATUS_CANCELLED ? 1 : 0,
        daySet: new Set(dayKey && dayKey !== "-" ? [dayKey] : []),
        productSet: new Set(productKey && productKey !== "-" ? [productKey] : []),
      });
      return;
    }

    const nextLoggedAt = Date.parse(row.loggedAt || "") || 0;
    const currentLoggedAt = Date.parse(current.lastLoggedAt || current.loggedAt || "") || 0;
    if (nextLoggedAt >= currentLoggedAt) {
      current.loggedAt = row.loggedAt;
      current.lastLoggedAt = row.loggedAt;
    }

    current.docCount += row.docNo && row.docNo !== "-" ? 1 : 0;
    current.inputValue += Number(row.inputValue || 0);
    current.countValue += Number(row.countValue || 0);
    current.normalizedKgAmount += Number(row.normalizedKgAmount || 0);
    if (capabilities.canViewMoney) {
      current.wageAmount = Number(current.wageAmount || 0) + Number(row.wageAmount || 0);
    }
    if (dayKey && dayKey !== "-") {
      current.daySet.add(dayKey);
    }
    if (productKey && productKey !== "-") {
      current.productSet.add(productKey);
    }
    if (row.docStatus === DOC_STATUS_ACTIVE) current.activeDocumentCount += 1;
    if (row.docStatus === DOC_STATUS_REPLACED) current.replacedDocumentCount += 1;
    if (row.docStatus === DOC_STATUS_CANCELLED) current.cancelledDocumentCount += 1;
  });

  const aggregatedRows = Array.from(grouped.values())
    .map((row) => {
      const workDayCount = row.daySet.size;
      const kgPerDay = workDayCount > 0
        ? Number((Number(row.normalizedKgAmount || 0) / workDayCount).toFixed(4))
        : 0;

      return {
        ...row,
        workDayCount,
        productCount: row.productSet.size,
        kgPerDay,
      };
    });

  const typeBenchmarks = aggregatedRows.reduce((accumulator, row) => {
    const workTypeName = row.workTypeName || "-";
    const current = accumulator.get(workTypeName) || {
      totalKg: 0,
      totalWorkDays: 0,
    };
    current.totalKg += Number(row.normalizedKgAmount || 0);
    current.totalWorkDays += Number(row.workDayCount || 0);
    accumulator.set(workTypeName, current);
    return accumulator;
  }, new Map());

  return aggregatedRows
    .map((row) => {
      const benchmark = typeBenchmarks.get(row.workTypeName || "-") || null;
      const typeAverageKgPerDay = benchmark && Number(benchmark.totalWorkDays || 0) > 0
        ? Number((Number(benchmark.totalKg || 0) / Number(benchmark.totalWorkDays || 0)).toFixed(4))
        : 0;
      const vsTypeAveragePct = typeAverageKgPerDay > 0
        ? Number((((Number(row.kgPerDay || 0) - typeAverageKgPerDay) / typeAverageKgPerDay) * 100).toFixed(2))
        : null;

      return {
        ...row,
        typeAverageKgPerDay,
        vsTypeAveragePct,
      };
    })
    .sort((left, right) => {
      const rightWage = Number(right.wageAmount || 0);
      const leftWage = Number(left.wageAmount || 0);
      if (rightWage !== leftWage) {
        return rightWage - leftWage;
      }
      const rightTime = Date.parse(right.loggedAt || "") || 0;
      const leftTime = Date.parse(left.loggedAt || "") || 0;
      return rightTime - leftTime;
    });
}

function buildPieceRateSummary(rows, capabilities, viewMode) {
  const uniqueEmployeeCodes = new Set();
  const uniqueEmployeeDayKeys = new Set();
  const totals = rows.reduce((acc, row) => {
    acc.totalInput += Number(row.inputValue || 0);
    acc.totalCount += Number(row.countValue || 0);
    acc.totalKg += Number(row.normalizedKgAmount || 0);
    if (capabilities.canViewMoney) {
      acc.totalWage += Number(row.wageAmount || 0);
    }
    if (viewMode === "employee") {
      uniqueEmployeeCodes.add(row.employeeCode || "-");
      if (row.daySet instanceof Set) {
        row.daySet.forEach((dayKey) => {
          if (dayKey && dayKey !== "-") {
            uniqueEmployeeDayKeys.add(`${row.employeeCode || "-"}::${dayKey}`);
          }
        });
      } else {
        acc.totalWorkDays += Number(row.workDayCount || 0);
      }
      acc.totalDocuments += Number(row.docCount || 0);
    }
    if (viewMode === "product") {
      acc.totalProducts += 1;
    }
    return acc;
  }, {
    totalInput: 0,
    totalCount: 0,
    totalKg: 0,
    totalWage: 0,
    totalEmployees: 0,
    totalWorkDays: 0,
    totalDocuments: 0,
    totalProducts: 0,
  });

  return {
    totalInput: formatMoney(totals.totalInput, 2),
    totalCount: formatMoney(totals.totalCount, 2),
    totalKg: formatMoney(totals.totalKg, 2),
    totalWage: capabilities.canViewMoney ? formatMoney(totals.totalWage, 2) : null,
    totalEmployees: viewMode === "employee" ? String(uniqueEmployeeCodes.size) : null,
    totalWorkDays: viewMode === "employee"
      ? String(uniqueEmployeeDayKeys.size || totals.totalWorkDays)
      : null,
    totalDocuments: viewMode === "employee" ? String(totals.totalDocuments) : null,
    totalProducts: viewMode === "product" ? String(totals.totalProducts) : null,
  };
}

function filterActivePieceRateRows(rows = []) {
  return (Array.isArray(rows) ? rows : []).filter((row) => (
    normalizeDocStatus(row?.docStatus, DOC_STATUS_ACTIVE) === DOC_STATUS_ACTIVE
  ));
}

function aggregatePieceRateProductRows(rows) {
  const grouped = new Map();

  rows.forEach((row) => {
    const dayKey = row.loggedAt ? getBangkokWorkDate(row.loggedAt) : "-";
    const productCode = row.productGoodsCode || row.productCode || row.productSkuCode || "-";
    const groupKey = `${dayKey}::${productCode}`;
    const current = grouped.get(groupKey);

    if (!current) {
      grouped.set(groupKey, {
        id: `product:${groupKey}`,
        dayKey,
        productCode,
        productSkuCode: row.productSkuCode || "-",
        productName: row.productName || "-",
        productBrandName: row.productBrandName || "-",
        inputValue: Number(row.inputValue || 0),
        countValue: Number(row.countValue || 0),
        normalizedKgAmount: Number(row.normalizedKgAmount || 0),
      });
      return;
    }

    current.inputValue += Number(row.inputValue || 0);
    current.countValue += Number(row.countValue || 0);
    current.normalizedKgAmount += Number(row.normalizedKgAmount || 0);
  });

  return Array.from(grouped.values()).sort((left, right) => {
    const dayCompare = String(left.dayKey || "").localeCompare(String(right.dayKey || ""));
    if (dayCompare !== 0) return dayCompare;
    return String(left.productName || "").localeCompare(String(right.productName || ""), "th-TH");
  });
}

function normalizeSelectedProductKeyValues(values = []) {
  const normalized = values
    .map((value) => normalizeGoodsCode(value))
    .filter(Boolean);
  return Array.from(new Set(normalized)).slice(0, 2);
}

function parsePieceRateReportParams({
  search,
  dateFrom,
  dateTo,
  viewMode,
  productKeys,
  hideCancelled,
  hideReplaced,
}) {
  const normalizedViewMode = normalizeReportViewMode(viewMode, "grouped");
  const fallbackDate = new Date().toISOString().slice(0, 10);
  const normalizedDateFrom = normalizeParam(dateFrom) || fallbackDate;
  const normalizedDateTo = normalizeParam(dateTo) || normalizedDateFrom;
  const { from, to } = toUtcRange(normalizedDateFrom, normalizedDateTo);

  return {
    search: normalizeParam(search),
    dateFrom: normalizedDateFrom,
    dateTo: normalizedDateTo,
    viewMode: normalizedViewMode,
    productKeys: normalizeSelectedProductKeyValues(productKeys),
    hideCancelled: normalizeBooleanFlag(hideCancelled),
    hideReplaced: normalizeBooleanFlag(hideReplaced),
    from,
    to,
  };
}

function parsePieceRateReportSearchParams(searchParams) {
  return parsePieceRateReportParams({
    search: searchParams.get("search"),
    dateFrom: searchParams.get("dateFrom"),
    dateTo: searchParams.get("dateTo"),
    viewMode: searchParams.get("viewMode"),
    productKeys: searchParams.getAll("productKeys"),
    hideCancelled: searchParams.get("hideCancelled"),
    hideReplaced: searchParams.get("hideReplaced"),
  });
}

function buildPieceRateReportDocumentType(viewMode) {
  return REPORT_DOC_TYPE_BY_VIEW_MODE[viewMode] || REPORT_DOC_TYPE_BY_VIEW_MODE.grouped;
}

function formatReportDocDatePart(value) {
  const normalized = normalizeParam(value);
  if (normalized && /^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return `${normalized.slice(2, 4)}${normalized.slice(5, 7)}${normalized.slice(8, 10)}`;
  }

  const parsed = new Date(normalized || Date.now());
  if (Number.isNaN(parsed.getTime())) {
    throw new ApiError(400, "Invalid report date for document number");
  }

  const year = String(parsed.getFullYear()).slice(-2).padStart(2, "0");
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function buildPieceRateReportDocNo(reportType, dateFrom, dateTo, docSeq, revisionNo) {
  const seq = Math.max(1, Number.parseInt(String(docSeq ?? ""), 10) || 1);
  const revision = Math.max(0, Number.parseInt(String(revisionNo ?? ""), 10) || 0);
  return `RPT-${reportType}-${formatReportDocDatePart(dateFrom)}-${formatReportDocDatePart(dateTo)}-${seq}-R${revision}`;
}

function buildHashPayload(value) {
  return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

async function reservePieceRateReportDocumentNo(
  supabaseAdmin,
  {
    reportType,
    viewMode,
    dateFrom,
    dateTo,
    scopeHash,
    snapshotHash,
    actorUserId = null,
    requestId = null,
    metadata = {},
  }
) {
  const { data, error } = await supabaseAdmin.rpc(REPORT_DOC_COUNTER_FUNCTION, {
    p_report_type: reportType,
    p_view_mode: viewMode,
    p_date_from: dateFrom,
    p_date_to: dateTo,
    p_scope_hash: scopeHash,
    p_snapshot_hash: snapshotHash,
    p_actor_user_id: actorUserId,
    p_request_id: requestId,
    p_metadata: metadata && typeof metadata === "object" ? metadata : {},
  });

  if (error) {
    throw new ApiError(500, "Failed to issue report document number", error.message);
  }

  const rawPayload = Array.isArray(data) ? data[0] : data;
  let payload = rawPayload;
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      payload = null;
    }
  }

  const docSeq = Number.parseInt(String(payload?.doc_seq ?? payload?.docSeq ?? ""), 10);
  const revisionNo = Number.parseInt(String(payload?.revision_no ?? payload?.revisionNo ?? ""), 10);
  const docNo = normalizeParam(payload?.doc_no ?? payload?.docNo)
    || buildPieceRateReportDocNo(reportType, dateFrom, dateTo, docSeq, revisionNo);

  if (!Number.isFinite(docSeq) || docSeq <= 0) {
    throw new ApiError(500, "Invalid report document sequence returned by database");
  }
  if (!Number.isFinite(revisionNo) || revisionNo < 0) {
    throw new ApiError(500, "Invalid report document revision returned by database");
  }

  return {
    docSeq,
    revisionNo,
    docNo,
    printCount: Math.max(1, Number.parseInt(String(payload?.print_count ?? payload?.printCount ?? ""), 10) || 1),
    action: normalizeParam(payload?.action) || "issue",
    isReprint: Boolean(payload?.is_reprint ?? payload?.isReprint),
    issuedAt: payload?.issued_at || payload?.issuedAt || new Date().toISOString(),
  };
}

export async function listPieceRateReport(request) {
  const permission = await requireTaskPermission(request, "production-piece-rate-report-view");
  const permissionSet = new Set(permission.permissions || []);
  const capabilities = buildReportCapabilities({
    isAdmin: permission.isAdmin,
    permissionSet,
  });

  if (!capabilities.canViewReport) {
    throw new ApiError(403, "Forbidden");
  }

  const { searchParams } = new URL(request.url);
  const printAll = searchParams.get("printAll") === "true";
  const { page, pageSize: rawPageSize } = parsePaginationParams(searchParams, {
    page: 1,
    pageSize: 20,
  });
  const pageSize = Math.min(rawPageSize, 50);
  const {
    search,
    dateFrom,
    dateTo,
    viewMode,
    productKeys,
    hideCancelled,
    hideReplaced,
    from,
    to,
  } = parsePieceRateReportSearchParams(searchParams);

  const supabaseAdmin = getSupabaseAdmin();
  const shouldAggregate = viewMode !== "detail";
  const baseFilters = {
    from,
    to,
    hideCancelled,
    hideReplaced,
    search,
    productKeys,
  };

  async function executeReportQueries(timestampColumn, includeActualWeighedAt = true) {
    const selectColumns = buildPieceRateReportSelectColumns({ includeActualWeighedAt });
    let countQuery = applyPieceRateReportTimeRange(
      supabaseAdmin
        .from(LOG_TABLE)
        .select("id", { count: "exact", head: true }),
      timestampColumn,
      from,
      to
    );

    let dataQuery = applyPieceRateReportTimeRange(
      supabaseAdmin
        .from(LOG_TABLE)
        .select(selectColumns),
      timestampColumn,
      from,
      to
    );

    if (hideCancelled) {
      countQuery = countQuery.neq("doc_status", DOC_STATUS_CANCELLED);
      dataQuery = dataQuery.neq("doc_status", DOC_STATUS_CANCELLED);
    }
    if (hideReplaced) {
      countQuery = countQuery.neq("doc_status", DOC_STATUS_REPLACED);
      dataQuery = dataQuery.neq("doc_status", DOC_STATUS_REPLACED);
    }

    if (search) {
      const escaped = escapeForIlike(search);
      const clause = [
        `doc_no.ilike.%${escaped}%`,
        `employee_code.ilike.%${escaped}%`,
        `raw_employee_qr_payload.ilike.%${escaped}%`,
        `employee_name_snapshot.ilike.%${escaped}%`,
        `product_code_snapshot.ilike.%${escaped}%`,
        `product_goods_code_snapshot.ilike.%${escaped}%`,
        `product_sku_code_snapshot.ilike.%${escaped}%`,
        `product_name_snapshot.ilike.%${escaped}%`,
        `product_brand_name_snapshot.ilike.%${escaped}%`,
        `piece_rate_profile_name_snapshot.ilike.%${escaped}%`,
        `revised_from_doc_no.ilike.%${escaped}%`,
        `replaced_by_doc_no.ilike.%${escaped}%`,
        `operator_username_snapshot.ilike.%${escaped}%`,
      ].join(",");
      countQuery = countQuery.or(clause);
      dataQuery = dataQuery.or(clause);
    }
    if (productKeys.length > 0) {
      countQuery = countQuery.in("product_goods_code_snapshot", productKeys);
      dataQuery = dataQuery.in("product_goods_code_snapshot", productKeys);
    }

    return Promise.all([
      countQuery,
      shouldAggregate || printAll
        ? dataQuery.order(timestampColumn, { ascending: false })
        : dataQuery.order(timestampColumn, { ascending: false }).range((page - 1) * pageSize, (page * pageSize) - 1),
    ]);
  }

  let mappedRows = [];
  let activeMappedRows = [];
  let summarySourceRows = [];
  let totalRecords = 0;

  if (shouldAggregate || printAll) {
    const rawRows = await fetchAllPieceRateReportRawRows(
      supabaseAdmin,
      buildPieceRateReportSelectColumns({ includeActualWeighedAt: true }),
      baseFilters
    );
    mappedRows = applyPieceRateReportWageRules(
      rawRows.map((row) => mapPieceRateReportRow(row, capabilities)),
      capabilities
    );
    activeMappedRows = filterActivePieceRateRows(mappedRows);
    summarySourceRows = activeMappedRows;
    totalRecords = mappedRows.length;
  } else {
    let [countResult, dataResult] = await executeReportQueries("actual_weighed_at", true);
    if ((countResult.error && isActualWeighedAtMissingColumnError(countResult.error))
      || (dataResult.error && isActualWeighedAtMissingColumnError(dataResult.error))) {
      [countResult, dataResult] = await executeReportQueries("logged_at", false);
    }

    if (countResult.error) {
      throw new ApiError(500, "Failed to count piece-rate report rows", countResult.error.message);
    }
    if (dataResult.error) {
      throw new ApiError(500, "Failed to load piece-rate report rows", dataResult.error.message);
    }

    mappedRows = (dataResult.data || []).map((row) => mapPieceRateReportRow(row, capabilities));
    totalRecords = Number(countResult.count || 0);

    const summaryRawRows = await fetchAllPieceRateReportRawRows(
      supabaseAdmin,
      buildPieceRateReportSelectColumns({ includeActualWeighedAt: true }),
      baseFilters
    );
    summarySourceRows = filterActivePieceRateRows(applyPieceRateReportWageRules(
      summaryRawRows.map((row) => mapPieceRateReportRow(row, capabilities)),
      capabilities
    ));
    const roundedWageById = new Map(summarySourceRows.map((row) => [row.id, row.wageAmount]));
    mappedRows = mappedRows.map((row) => roundedWageById.has(row.id)
      ? { ...row, wageAmount: roundedWageById.get(row.id) }
      : row);
    activeMappedRows = filterActivePieceRateRows(mappedRows);
  }

  const normalizedRows = viewMode === "grouped"
    ? aggregatePieceRateReportRows(activeMappedRows, capabilities)
    : viewMode === "employee"
      ? aggregatePieceRateEmployeeRows(activeMappedRows, capabilities)
      : viewMode === "product"
        ? aggregatePieceRateProductRows(activeMappedRows)
        : mappedRows;
  const normalizedTotalRecords = shouldAggregate ? normalizedRows.length : totalRecords;
  const totalPages = printAll
    ? 1
    : Math.max(1, Math.ceil(normalizedTotalRecords / pageSize));
  const rows = (shouldAggregate && !printAll)
    ? normalizedRows.slice((page - 1) * pageSize, page * pageSize)
    : normalizedRows;
  const summary = buildPieceRateSummary(
    shouldAggregate ? normalizedRows : summarySourceRows,
    capabilities,
    viewMode
  );

  return {
    data: {
      data: rows,
      summary,
      capabilities,
      viewMode,
      filters: {
        hideCancelled,
        hideReplaced,
        productKeys,
      },
      pagination: {
        page: printAll ? 1 : page,
        pageSize: printAll ? normalizedTotalRecords : pageSize,
        totalRecords: normalizedTotalRecords,
        totalPages,
      },
    },
  };
}

export async function listPieceRateGroupDocuments(request) {
  const permission = await requireTaskPermission(request, "production-piece-rate-report-view");
  const permissionSet = new Set(permission.permissions || []);
  const capabilities = buildReportCapabilities({
    isAdmin: permission.isAdmin,
    permissionSet,
  });

  if (!capabilities.canViewReport) {
    throw new ApiError(403, "Forbidden");
  }

  const { searchParams } = new URL(request.url);
  const day = normalizeParam(searchParams.get("day"));
  const employeeCode = normalizeParam(searchParams.get("employeeCode"));
  const employeeCodeVariants = buildEmployeeCodeVariants(employeeCode);
  const productKey = normalizeParam(searchParams.get("productKey"));
  const hideCancelled = String(searchParams.get("hideCancelled") || "").trim().toLowerCase() === "true";
  const hideReplaced = String(searchParams.get("hideReplaced") || "").trim().toLowerCase() === "true";

  if (!day || !employeeCode || !productKey || employeeCodeVariants.length === 0) {
    throw new ApiError(400, "day, employeeCode and productKey are required");
  }

  const { from, to } = toUtcRange(day, day);
  const supabaseAdmin = getSupabaseAdmin();
  async function executeGroupDocumentsQuery(timestampColumn, includeActualWeighedAt = true) {
    const selectColumns = buildPieceRateReportSelectColumns({ includeActualWeighedAt });
    let query = applyPieceRateReportTimeRange(
      supabaseAdmin
        .from(LOG_TABLE)
        .select(selectColumns)
        .in("employee_code", employeeCodeVariants)
        .or([
          `product_barcode_snapshot.eq.${productKey}`,
          `product_goods_code_snapshot.eq.${productKey}`,
          `product_code_snapshot.eq.${productKey}`,
        ].join(",")),
      timestampColumn,
      from,
      to
    )
      .order(timestampColumn, { ascending: false })
      .limit(200);

    if (hideCancelled) {
      query = query.neq("doc_status", DOC_STATUS_CANCELLED);
    }
    if (hideReplaced) {
      query = query.neq("doc_status", DOC_STATUS_REPLACED);
    }

    return query;
  }

  let result = await executeGroupDocumentsQuery("actual_weighed_at", true);
  if (result.error && isActualWeighedAtMissingColumnError(result.error)) {
    result = await executeGroupDocumentsQuery("logged_at", false);
  }
  if (result.error) {
    throw new ApiError(500, "Failed to load piece-rate group documents", result.error.message);
  }

  const rows = applyPieceRateReportWageRules(
    (result.data || []).map((row) => mapPieceRateReportRow(row, capabilities)),
    capabilities
  );
  const summary = rows.reduce((acc, row) => {
    acc.totalInput += Number(row.inputValue || 0);
    acc.totalCount += Number(row.countValue || 0);
    acc.totalKg += Number(row.normalizedKgAmount || 0);
    if (capabilities.canViewMoney) {
      acc.totalWage += Number(row.wageAmount || 0);
    }
    return acc;
  }, {
    totalInput: 0,
    totalCount: 0,
    totalKg: 0,
    totalWage: 0,
  });

  return {
    data: {
      data: rows,
      summary: {
        totalInput: formatMoney(summary.totalInput, 2),
        totalCount: formatMoney(summary.totalCount, 2),
        totalKg: formatMoney(summary.totalKg, 2),
        totalWage: capabilities.canViewMoney ? formatMoney(summary.totalWage, 2) : null,
      },
      capabilities,
    },
  };
}

function formatExcelNumber(value, digits = 2) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Number(parsed.toFixed(digits));
}

function formatExcelDateTime(value) {
  if (!value) {
    return "-";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "short",
    timeStyle: "medium",
  });
}

function getRevisionActionLabel(action) {
  if (action === "replace") return "แก้ไขเอกสาร";
  if (action === "cancel") return "ยกเลิกเอกสาร";
  return "อัปเดตเอกสาร";
}

function getRevisionAfterData(revisionRow) {
  if (revisionRow?.action === "replace") {
    return revisionRow?.after_data?.replacementLog || revisionRow?.after_data?.replacedLog || null;
  }
  return revisionRow?.after_data || null;
}

function getRevisionDocumentSummary(revisionRow, currentLog = {}) {
  const beforeDocNo = normalizeParam(revisionRow?.before_data?.doc_no) || normalizeParam(currentLog?.doc_no) || null;
  const afterData = getRevisionAfterData(revisionRow);
  const afterDocNo = normalizeParam(afterData?.doc_no)
    || normalizeParam(revisionRow?.after_data?.replacementLog?.doc_no)
    || normalizeParam(currentLog?.replaced_by_doc_no)
    || beforeDocNo;

  return {
    beforeDocNo,
    afterDocNo,
    beforeInputValue: formatExcelNumber(revisionRow?.before_data?.input_value, 3),
    afterInputValue: formatExcelNumber(afterData?.input_value, 3),
    beforeCountValue: formatExcelNumber(revisionRow?.before_data?.count_value_snapshot, 0),
    afterCountValue: formatExcelNumber(afterData?.count_value_snapshot, 0),
  };
}

export async function listPieceRateRevisions(request, logId) {
  const permission = await requireTaskPermission(request, "production-piece-rate-report-view");
  const permissionSet = new Set(permission.permissions || []);
  const capabilities = buildReportCapabilities({
    isAdmin: permission.isAdmin,
    permissionSet,
  });

  if (!capabilities.canViewReport) {
    throw new ApiError(403, "Forbidden");
  }

  const normalizedLogId = normalizeParam(logId);
  if (!normalizedLogId) {
    throw new ApiError(400, "logId is required");
  }

  const supabaseAdmin = getSupabaseAdmin();
  const logResult = await supabaseAdmin
    .from(LOG_TABLE)
    .select("id,doc_no,revised_from_log_id,revised_from_doc_no,replaced_by_log_id,replaced_by_doc_no,doc_status")
    .eq("id", normalizedLogId)
    .maybeSingle();

  if (logResult.error) {
    throw new ApiError(500, "Failed to load piece-rate document", logResult.error.message);
  }
  if (!logResult.data) {
    throw new ApiError(404, "Document not found");
  }

  const relatedLogIds = Array.from(new Set([
    normalizedLogId,
    normalizeParam(logResult.data.revised_from_log_id),
  ].filter(Boolean)));

  const revisionResult = await supabaseAdmin
    .from(REVISION_TABLE)
    .select("id,log_id,action,before_data,after_data,edited_by,edit_reason,created_at")
    .in("log_id", relatedLogIds)
    .order("created_at", { ascending: false });

  if (revisionResult.error) {
    throw new ApiError(500, "Failed to load piece-rate revision history", revisionResult.error.message);
  }

  const actorIds = Array.from(new Set((revisionResult.data || [])
    .map((row) => normalizeParam(row.edited_by))
    .filter(Boolean)));
  const actorMap = await resolveProfileDisplayMap(supabaseAdmin, actorIds);

  const rows = (revisionResult.data || []).map((row) => {
    const summary = getRevisionDocumentSummary(row, logResult.data);
    return {
      id: row.id,
      logId: row.log_id,
      action: row.action,
      actionLabel: getRevisionActionLabel(row.action),
      editedAt: row.created_at || null,
      editedBy: normalizeParam(row.edited_by),
      editedByLabel: resolveProfileDisplay(row.edited_by, actorMap) || normalizeParam(row.edited_by) || "-",
      reason: row.edit_reason || "-",
      beforeDocNo: summary.beforeDocNo,
      afterDocNo: summary.afterDocNo,
      beforeInputValue: summary.beforeInputValue,
      afterInputValue: summary.afterInputValue,
      beforeCountValue: summary.beforeCountValue,
      afterCountValue: summary.afterCountValue,
      isLinkedRevision: normalizeParam(row.log_id) !== normalizedLogId,
    };
  });

  return {
    data: {
      document: {
        id: logResult.data.id,
        docNo: logResult.data.doc_no || "-",
        revisedFromLogId: logResult.data.revised_from_log_id || null,
        revisedFromDocNo: logResult.data.revised_from_doc_no || null,
        replacedByLogId: logResult.data.replaced_by_log_id || null,
        replacedByDocNo: logResult.data.replaced_by_doc_no || null,
        docStatus: normalizeDocStatus(logResult.data.doc_status, DOC_STATUS_ACTIVE),
      },
      data: rows,
    },
  };
}

export async function exportPieceRateReportExcel(request, body = null) {
  const permission = await requireTaskPermission(request, "production-piece-rate-report-export");
  const permissionSet = new Set(permission.permissions || []);
  const capabilities = buildReportCapabilities({
    isAdmin: permission.isAdmin,
    permissionSet,
  });

  if (!capabilities.canViewReport) {
    throw new ApiError(403, "Forbidden");
  }

  const { searchParams } = new URL(request.url);
  const parsedFromQuery = parsePieceRateReportSearchParams(searchParams);
  const {
    search,
    dateFrom,
    dateTo,
    viewMode,
    productKeys,
    hideCancelled,
    hideReplaced,
    from,
    to,
  } = body && typeof body === "object"
    ? {
        ...parsedFromQuery,
        ...body,
        productKeys: Array.isArray(body.productKeys) ? body.productKeys : parsedFromQuery.productKeys,
        from: body.from || body.dateFrom || parsedFromQuery.from,
        to: body.to || body.dateTo || parsedFromQuery.to,
      }
    : parsedFromQuery;

  const supabaseAdmin = getSupabaseAdmin();
  const selectColumns = buildPieceRateReportSelectColumns();
  const rawRows = await fetchAllPieceRateReportRawRows(supabaseAdmin, selectColumns, {
    from,
    to,
    hideCancelled,
    hideReplaced,
    search,
    productKeys,
  });

  const mappedRows = applyPieceRateReportWageRules(
    rawRows.map((row) => mapPieceRateReportRow(row, capabilities)),
    capabilities
  );
  const exportRows = viewMode === "grouped"
    ? aggregatePieceRateReportRows(mappedRows, capabilities)
    : viewMode === "employee"
      ? aggregatePieceRateEmployeeRows(mappedRows, capabilities)
      : viewMode === "product"
        ? aggregatePieceRateProductRows(mappedRows)
        : mappedRows;

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "KPF Production Line";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.title = `Piece Rate Report ${viewMode}`;

  const criteriaSheet = workbook.addWorksheet("เงื่อนไขรายงาน");
  criteriaSheet.columns = [
    { header: "หัวข้อ", key: "label", width: 24 },
    { header: "ค่า", key: "value", width: 60 },
  ];
  criteriaSheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  criteriaSheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "102C57" },
  };
  criteriaSheet.addRows([
    {
      label: "มุมมอง",
      value: viewMode === "grouped"
        ? "รวมยอดรายวัน"
        : viewMode === "employee"
          ? "สรุปค่าแรง"
          : viewMode === "product"
            ? "สรุปผลิตภัณฑ์"
            : "ทุกรายการ",
    },
    { label: "ค้นหา", value: search || "-" },
    { label: "วันที่เริ่ม", value: dateFrom || "-" },
    { label: "วันที่สิ้นสุด", value: dateTo || "-" },
    { label: "ซ่อนเอกสารยกเลิก", value: hideCancelled ? "ใช่" : "ไม่ใช่" },
    { label: "ซ่อนเอกสารแก้ไข", value: hideReplaced ? "ใช่" : "ไม่ใช่" },
    { label: "จำนวนแถวที่ส่งออก", value: String(exportRows.length) },
  ]);

  const sheet = workbook.addWorksheet(
    viewMode === "grouped"
      ? "รวมยอดรายวัน"
      : viewMode === "employee"
        ? "สรุปค่าแรง"
        : viewMode === "product"
          ? "สรุปผลิตภัณฑ์"
          : "ทุกรายการ"
  );
  const columns = viewMode === "grouped"
    ? [
      { header: "วันที่", key: "groupDayKey", width: 14 },
      { header: "พนักงาน", key: "employee", width: 28 },
      { header: "สินค้า", key: "productName", width: 30 },
      { header: "รหัสสินค้า", key: "productCode", width: 18 },
      { header: "จำนวนเอกสาร", key: "mergedRowCount", width: 14 },
      { header: "รหัสเครื่อง", key: "machineCode", width: 14 },
      { header: "น้ำหนักรวม", key: "inputValue", width: 14 },
      { header: "จำนวนรวม", key: "countValue", width: 14 },
      { header: "กก.รวม", key: "normalizedKgAmount", width: 14 },
      ...(capabilities.canViewMoney ? [{ header: "ค่าแรงรวม", key: "wageAmount", width: 14 }] : []),
    ]
    : viewMode === "employee"
      ? [
        { header: "พนักงาน", key: "employee", width: 28 },
        { header: "ประเภทงาน", key: "workTypeName", width: 20 },
        { header: "แผนก", key: "employeeDepartment", width: 18 },
        { header: "จำนวนวันทำงาน", key: "workDayCount", width: 16 },
        { header: "กก./วัน", key: "kgPerDay", width: 14 },
        { header: "เฉลี่ยงาน", key: "typeAverageKgPerDay", width: 20 },
        { header: "เทียบเฉลี่ย %", key: "vsTypeAveragePct", width: 20 },
        ...(capabilities.canViewMoney ? [{ header: "ค่าแรงรวม", key: "wageAmount", width: 14 }] : []),
      ]
      : viewMode === "product"
        ? [
          { header: "ลำดับ", key: "sequence", width: 10 },
          { header: "วันที่", key: "dayKey", width: 14 },
          { header: "รหัสสินค้า", key: "productCode", width: 18 },
          { header: "แบรนด์", key: "productBrandName", width: 18 },
          { header: "สินค้า", key: "productName", width: 30 },
          { header: "จำนวนรวม", key: "countValue", width: 14 },
          { header: "น้ำหนักรวม", key: "normalizedKgAmount", width: 14 },
        ]
        : [
          { header: "เวลาชั่งจริง", key: "loggedAt", width: 22 },
          { header: "เวลาบันทึกเข้าระบบ", key: "serverLoggedAt", width: 22 },
          { header: "ผู้บันทึก", key: "operatorUsername", width: 18 },
          { header: "เลขเอกสาร", key: "docNo", width: 16 },
          { header: "LOT", key: "lotNo", width: 16 },
          { header: "รหัสเครื่อง", key: "machineCode", width: 12 },
          { header: "สถานะ", key: "docStatus", width: 12 },
          { header: "พนักงาน", key: "employee", width: 28 },
          { header: "สินค้า", key: "productName", width: 28 },
          { header: "รหัสสินค้า", key: "productCode", width: 18 },
          { header: "น้ำหนัก", key: "inputValue", width: 14 },
          { header: "จำนวน", key: "countValue", width: 12 },
          ...(capabilities.canViewMoney ? [{ header: "ฐานคิด", key: "wageBasis", width: 12 }] : []),
          { header: "กก.รวม", key: "normalizedKgAmount", width: 14 },
          ...(capabilities.canViewMoney ? [{ header: "ค่าแรง", key: "wageAmount", width: 14 }] : []),
          { header: "เหตุผล", key: "reason", width: 30 },
        ];

  sheet.columns = columns;
  if (viewMode === "grouped") {
    sheet.columns = [
      { header: "\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48", key: "groupDayKey", width: 14 },
      { header: "\u0e40\u0e27\u0e25\u0e32", key: "loggedAt", width: 20 },
      { header: "\u0e23\u0e2b\u0e31\u0e2a\u0e1e\u0e19\u0e31\u0e01\u0e07\u0e32\u0e19", key: "employeeCode", width: 16 },
      { header: "\u0e0a\u0e37\u0e48\u0e2d\u0e1e\u0e19\u0e31\u0e01\u0e07\u0e32\u0e19", key: "employeeName", width: 24 },
      { header: "\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32", key: "productName", width: 30 },
      { header: "\u0e23\u0e2b\u0e31\u0e2a\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32", key: "productCode", width: 18 },
      { header: "\u0e08\u0e33\u0e19\u0e27\u0e19\u0e40\u0e2d\u0e01\u0e2a\u0e32\u0e23", key: "mergedRowCount", width: 14 },
      { header: "\u0e23\u0e2b\u0e31\u0e2a\u0e40\u0e04\u0e23\u0e37\u0e48\u0e2d\u0e07", key: "machineCode", width: 14 },
      { header: "\u0e19\u0e49\u0e33\u0e2b\u0e19\u0e31\u0e01\u0e23\u0e27\u0e21", key: "inputValue", width: 14 },
      { header: "\u0e08\u0e33\u0e19\u0e27\u0e19\u0e23\u0e27\u0e21", key: "countValue", width: 14 },
      { header: "\u0e01\u0e01.\u0e23\u0e27\u0e21", key: "normalizedKgAmount", width: 14 },
      ...(capabilities.canViewMoney ? [{ header: "\u0e04\u0e48\u0e32\u0e41\u0e23\u0e07\u0e23\u0e27\u0e21", key: "wageAmount", width: 14 }] : []),
    ];
  }
  if (viewMode === "detail") {
    sheet.getColumn("loggedAt").numFmt = "yyyy-mm-dd hh:mm:ss";
    sheet.getColumn("serverLoggedAt").numFmt = "yyyy-mm-dd hh:mm:ss";
  }
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "102C57" },
  };
  headerRow.height = 22;

  exportRows.forEach((row) => {
    const worksheetRow = sheet.addRow(viewMode === "grouped"
      ? {
        groupDayKey: row.groupDayKey || "-",
        loggedAt: formatExcelDateTime(row.loggedAt),
        employeeCode: row.employeeCode || "-",
        employeeName: row.employeeName || "-",
        productName: row.productName || "-",
        productCode: row.productGoodsCode || row.productCode || row.productSkuCode || "-",
        mergedRowCount: Number(row.mergedRowCount || 1),
        machineCode: row.machineCode || "-",
        inputValue: formatExcelNumber(row.normalizedKgAmount, 3),
        countValue: formatExcelNumber(row.countValue, 0),
        normalizedKgAmount: formatExcelNumber(row.normalizedKgAmount, 3),
        wageAmount: capabilities.canViewMoney ? formatExcelNumber(row.wageAmount, 2) : undefined,
      }
      : viewMode === "employee"
        ? {
          employee: `${row.employeeCode || "-"} ${row.employeeName || "-"}`.trim(),
          workTypeName: row.workTypeName || "-",
          employeeDepartment: row.employeeDepartment || "-",
          workDayCount: Number(row.workDayCount || 0),
          kgPerDay: formatExcelNumber(row.kgPerDay, 3),
          typeAverageKgPerDay: formatExcelNumber(row.typeAverageKgPerDay, 3),
          vsTypeAveragePct: row.vsTypeAveragePct === null || row.vsTypeAveragePct === undefined
            ? "-"
            : formatExcelNumber(row.vsTypeAveragePct, 2),
          wageAmount: capabilities.canViewMoney ? formatExcelNumber(row.wageAmount, 2) : undefined,
        }
        : viewMode === "product"
          ? {
            sequence: exportRows.indexOf(row) + 1,
            dayKey: row.dayKey || "-",
            productCode: row.productCode || row.productSkuCode || "-",
            productBrandName: row.productBrandName || "-",
            productName: row.productName || "-",
            countValue: formatExcelNumber(row.countValue, 0),
            normalizedKgAmount: formatExcelNumber(row.normalizedKgAmount, 3),
          }
          : {
            loggedAt: formatExcelDateTime(row.loggedAt),
            serverLoggedAt: formatExcelDateTime(row.serverLoggedAt),
            operatorUsername: row.operatorUsername || "-",
            lotNo: row.lotNo || "-",
            docNo: row.docNo || "-",
            machineCode: row.machineCode || "-",
            docStatus: row.docStatus || DOC_STATUS_ACTIVE,
            employee: `${row.employeeCode || "-"} ${row.employeeName || "-"}`.trim(),
            productName: row.productName || "-",
            productCode: row.productGoodsCode || row.productCode || row.productSkuCode || "-",
            inputValue: formatExcelNumber(row.normalizedKgAmount, 3),
            countValue: formatExcelNumber(row.countValue, 0),
            wageBasis: row.wageBasis || "-",
            normalizedKgAmount: formatExcelNumber(row.normalizedKgAmount, 3),
            wageAmount: capabilities.canViewMoney ? formatExcelNumber(row.wageAmount, 2) : undefined,
            reason: row.cancelReason || row.editReason || "-",
          });

    worksheetRow.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "E2E8F0" } },
        left: { style: "thin", color: { argb: "E2E8F0" } },
        bottom: { style: "thin", color: { argb: "E2E8F0" } },
        right: { style: "thin", color: { argb: "E2E8F0" } },
      };
    });

    if (viewMode === "detail") {
      if (row.docStatus === DOC_STATUS_REPLACED) {
        worksheetRow.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFFBEB" },
          };
        });
      } else if (row.docStatus === DOC_STATUS_CANCELLED) {
        worksheetRow.eachCell((cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF1F2" },
          };
        });
      }
    }
  });

  if (viewMode === "product" && exportRows.length > 0) {
    sheet.addRow({
      sequence: "",
      dayKey: "",
      productCode: "",
      productName: "รวมทั้งหมด",
      countValue: formatExcelNumber(exportRows.reduce((sum, row) => sum + Number(row.countValue || 0), 0), 0),
      normalizedKgAmount: formatExcelNumber(exportRows.reduce((sum, row) => sum + Number(row.normalizedKgAmount || 0), 0), 3),
    });
    const totalRow = sheet.getRow(sheet.rowCount);
    totalRow.font = { bold: true };
    totalRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "F8FAFC" },
    };
  }

  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = `A1:${String.fromCharCode(64 + columns.length)}1`;

  const filenameDate = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filename = `piece-rate-report_${viewMode}_${filenameDate}.xlsx`;
  const buffer = await workbook.xlsx.writeBuffer();

  return { buffer, filename };
}

export async function issuePieceRateReportPrintDocument(request, body = {}) {
  const permission = await requireTaskPermission(request, "production-piece-rate-report-print");
  const permissionSet = new Set(permission.permissions || []);
  const capabilities = buildReportCapabilities({
    isAdmin: permission.isAdmin,
    permissionSet,
  });

  if (!capabilities.canViewReport) {
    throw new ApiError(403, "Forbidden");
  }

  const requestId = String(body.requestId || crypto.randomUUID()).trim();
  if (!requestId) {
    throw new ApiError(400, "requestId is required");
  }

  const page = Math.max(1, Number.parseInt(String(body.page ?? "1"), 10) || 1);
  const rawPageSize = Number.parseInt(String(body.pageSize ?? "20"), 10) || 20;
  const pageSize = Math.min(Math.max(rawPageSize, 1), 50);
  const params = parsePieceRateReportParams({
    search: body.search,
    dateFrom: body.dateFrom,
    dateTo: body.dateTo,
    viewMode: body.viewMode,
    productKeys: Array.isArray(body.productKeys) ? body.productKeys : [],
    hideCancelled: body.hideCancelled,
    hideReplaced: body.hideReplaced,
  });

  const supabaseAdmin = getSupabaseAdmin();
  const selectColumns = buildPieceRateReportSelectColumns();
  const rawRows = await fetchAllPieceRateReportRawRows(supabaseAdmin, selectColumns, {
    from: params.from,
    to: params.to,
    hideCancelled: params.hideCancelled,
    hideReplaced: params.hideReplaced,
    search: params.search,
    productKeys: params.productKeys,
  });

  const mappedRows = applyPieceRateReportWageRules(
    rawRows.map((row) => mapPieceRateReportRow(row, capabilities)),
    capabilities
  );
  const normalizedRows = params.viewMode === "grouped"
    ? aggregatePieceRateReportRows(mappedRows, capabilities)
    : params.viewMode === "employee"
      ? aggregatePieceRateEmployeeRows(mappedRows, capabilities)
      : params.viewMode === "product"
        ? aggregatePieceRateProductRows(mappedRows)
        : mappedRows;
  const totalRecords = normalizedRows.length;
  const printedRows = normalizedRows.slice((page - 1) * pageSize, page * pageSize);
  const reportType = buildPieceRateReportDocumentType(params.viewMode);
  const scopeHash = buildHashPayload({
    reportType,
    viewMode: params.viewMode,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    search: params.search || null,
    hideCancelled: params.hideCancelled,
    hideReplaced: params.hideReplaced,
    productKeys: params.productKeys,
    page,
    pageSize,
  });
  const snapshotHash = buildHashPayload({
    reportType,
    totalRecords,
    page,
    pageSize,
    rows: printedRows,
  });
  const document = await reservePieceRateReportDocumentNo(supabaseAdmin, {
    reportType,
    viewMode: params.viewMode,
    dateFrom: params.dateFrom,
    dateTo: params.dateTo,
    scopeHash,
    snapshotHash,
    actorUserId: permission.userId,
    requestId,
    metadata: {
      reportType,
      viewMode: params.viewMode,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
      search: params.search || null,
      hideCancelled: params.hideCancelled,
      hideReplaced: params.hideReplaced,
      productKeys: params.productKeys,
      page,
      pageSize,
      totalRecords,
      printedRowCount: printedRows.length,
    },
  });

  return {
    data: {
      document,
    },
  };
}

export async function getPieceRateEmployeeSummaryDetails(request) {
  const permission = await requireTaskPermission(request, "production-piece-rate-report-view");
  const permissionSet = new Set(permission.permissions || []);
  const capabilities = buildReportCapabilities({
    isAdmin: permission.isAdmin,
    permissionSet,
  });

  if (!capabilities.canViewReport) {
    throw new ApiError(403, "Forbidden");
  }

  const { searchParams } = new URL(request.url);
  const employeeCode = normalizeParam(searchParams.get("employeeCode"));
  const employeeCodeVariants = buildEmployeeCodeVariants(employeeCode);
  if (!employeeCode || employeeCodeVariants.length === 0) {
    throw new ApiError(400, "employeeCode is required");
  }

  const dateFrom = normalizeParam(searchParams.get("dateFrom"));
  const dateTo = normalizeParam(searchParams.get("dateTo"));
  const hideCancelled = String(searchParams.get("hideCancelled") || "").trim().toLowerCase() === "true";
  const hideReplaced = String(searchParams.get("hideReplaced") || "").trim().toLowerCase() === "true";
  const { from, to } = toUtcRange(dateFrom, dateTo);

  const supabaseAdmin = getSupabaseAdmin();
  async function executeEmployeeSummaryDetailsQuery(timestampColumn, includeActualWeighedAt = true) {
    let query = applyPieceRateReportTimeRange(
      supabaseAdmin
        .from(LOG_TABLE)
        .select(buildPieceRateReportSelectColumns({ includeActualWeighedAt }))
        .in("employee_code", employeeCodeVariants),
      timestampColumn,
      from,
      to
    ).order(timestampColumn, { ascending: false });

    if (hideCancelled) {
      query = query.neq("doc_status", DOC_STATUS_CANCELLED);
    }
    if (hideReplaced) {
      query = query.neq("doc_status", DOC_STATUS_REPLACED);
    }

    return query;
  }

  let result = await executeEmployeeSummaryDetailsQuery("actual_weighed_at", true);
  if (result.error && isActualWeighedAtMissingColumnError(result.error)) {
    result = await executeEmployeeSummaryDetailsQuery("logged_at", false);
  }
  if (result.error) {
    throw new ApiError(500, "Failed to load employee summary details", result.error.message);
  }

  const documents = applyPieceRateReportWageRules(
    (result.data || []).map((row) => mapPieceRateReportRow(row, capabilities)),
    capabilities
  );
  const employeeRows = aggregatePieceRateEmployeeRows(documents, capabilities);
  const dailyGrouped = new Map();
  const productGrouped = new Map();

  documents.forEach((row) => {
    const dayKey = row.loggedAt ? getBangkokWorkDate(row.loggedAt) : "-";
    const productKey = row.productGoodsCode || row.productCode || row.productSkuCode || row.productBarcode || "-";

    const currentDay = dailyGrouped.get(dayKey) || {
      dayKey,
      docCount: 0,
      productCount: 0,
      inputValue: 0,
      countValue: 0,
      normalizedKgAmount: 0,
      wageAmount: capabilities.canViewMoney ? 0 : null,
      productSet: new Set(),
    };
    currentDay.docCount += row.docNo && row.docNo !== "-" ? 1 : 0;
    currentDay.inputValue += Number(row.inputValue || 0);
    currentDay.countValue += Number(row.countValue || 0);
    currentDay.normalizedKgAmount += Number(row.normalizedKgAmount || 0);
    if (capabilities.canViewMoney) {
      currentDay.wageAmount = Number(currentDay.wageAmount || 0) + Number(row.wageAmount || 0);
    }
    if (productKey && productKey !== "-") {
      currentDay.productSet.add(productKey);
    }
    dailyGrouped.set(dayKey, currentDay);

    const currentProduct = productGrouped.get(productKey) || {
      productKey,
      productName: row.productName || "-",
      productCode: productKey,
      docCount: 0,
      workDayCount: 0,
      inputValue: 0,
      countValue: 0,
      normalizedKgAmount: 0,
      wageAmount: capabilities.canViewMoney ? 0 : null,
      daySet: new Set(),
    };
    currentProduct.docCount += row.docNo && row.docNo !== "-" ? 1 : 0;
    currentProduct.inputValue += Number(row.inputValue || 0);
    currentProduct.countValue += Number(row.countValue || 0);
    currentProduct.normalizedKgAmount += Number(row.normalizedKgAmount || 0);
    if (capabilities.canViewMoney) {
      currentProduct.wageAmount = Number(currentProduct.wageAmount || 0) + Number(row.wageAmount || 0);
    }
    if (dayKey && dayKey !== "-") {
      currentProduct.daySet.add(dayKey);
    }
    productGrouped.set(productKey, currentProduct);
  });

  return {
    data: {
      employee: employeeRows[0] || null,
      summary: buildPieceRateSummary(employeeRows, capabilities, "employee"),
      dailyBreakdown: Array.from(dailyGrouped.values())
        .map((row) => ({
          ...row,
          productCount: row.productSet.size,
        }))
        .sort((left, right) => String(right.dayKey || "").localeCompare(String(left.dayKey || ""))),
      productBreakdown: Array.from(productGrouped.values())
        .map((row) => ({
          ...row,
          workDayCount: row.daySet.size,
        }))
        .sort((left, right) => {
          const rightWage = Number(right.wageAmount || 0);
          const leftWage = Number(left.wageAmount || 0);
          if (rightWage !== leftWage) {
            return rightWage - leftWage;
          }
          return String(left.productName || "").localeCompare(String(right.productName || ""), "th-TH");
        }),
      documents,
      capabilities,
    },
  };
}

export async function listPieceRateReportProducts(request) {
  const permission = await requireTaskPermission(request, "production-piece-rate-report-view");
  const permissionSet = new Set(permission.permissions || []);
  const capabilities = buildReportCapabilities({
    isAdmin: permission.isAdmin,
    permissionSet,
  });

  if (!capabilities.canViewReport) {
    throw new ApiError(403, "Forbidden");
  }

  const { searchParams } = new URL(request.url);
  const search = normalizeParam(searchParams.get("search"));
  const dateFrom = normalizeParam(searchParams.get("dateFrom"));
  const dateTo = normalizeParam(searchParams.get("dateTo"));
  const hideCancelled = String(searchParams.get("hideCancelled") || "").trim().toLowerCase() === "true";
  const hideReplaced = String(searchParams.get("hideReplaced") || "").trim().toLowerCase() === "true";
  const { from, to } = toUtcRange(dateFrom, dateTo);

  const supabaseAdmin = getSupabaseAdmin();
  const rows = await fetchAllPieceRateReportRawRows(
    supabaseAdmin,
    "product_goods_code_snapshot,product_sku_code_snapshot,product_name_snapshot",
    {
      from,
      to,
      hideCancelled,
      hideReplaced,
      search,
    }
  );

  const options = Array.from(rows.reduce((map, row) => {
    const goodsCode = normalizeGoodsCode(row?.product_goods_code_snapshot, row?.product_sku_code_snapshot);
    if (!goodsCode) return map;
    if (!map.has(goodsCode)) {
      map.set(goodsCode, {
        value: goodsCode,
        goodsCode,
        skuCode: normalizeGoodsCode(row?.product_sku_code_snapshot) || null,
        label: normalizeText(row?.product_name_snapshot) || goodsCode,
      });
    }
    return map;
  }, new Map()).values()).sort((left, right) => (
    String(left.label || "").localeCompare(String(right.label || ""), "th-TH")
  ));

  return {
    data: {
      data: options,
    },
  };
}

export async function listEditablePieceRateProducts(request) {
  const permission = await requireTaskPermission(request, "production-piece-rate-adjust");
  const permissionSet = new Set(permission.permissions || []);
  const capabilities = buildReportCapabilities({
    isAdmin: permission.isAdmin,
    permissionSet,
  });

  if (!capabilities.canEdit) {
    throw new ApiError(403, "Forbidden");
  }

  const { searchParams } = new URL(request.url);
  const search = normalizeParam(searchParams.get("search"))?.toLowerCase() || "";
  const supabaseAdmin = getSupabaseAdmin();
  const master = await loadPieceRateOfflineStaticMaster(supabaseAdmin);

  const options = Array.from((master.productLookups || []).reduce((map, item) => {
    const productBarcode = normalizeBarcode(item?.productBarcode);
    const goodsCode = normalizeGoodsCode(item?.product?.goodsCode, item?.product?.code);
    const skuCode = normalizeGoodsCode(item?.product?.skuCode);
    const profileId = normalizeParam(item?.pieceRate?.profileId);
    if (!productBarcode || !goodsCode || !profileId) {
      return map;
    }

    const optionKey = goodsCode;
    if (map.has(optionKey)) {
      return map;
    }

    const option = {
      value: productBarcode,
      productBarcode,
      productCode: goodsCode,
      productGoodsCode: goodsCode,
      productSkuCode: skuCode || "",
      productName: item?.product?.name || goodsCode,
      label: item?.product?.name || goodsCode,
      unitName: item?.product?.unitName || "",
      imageUrl: item?.product?.imageUrl || null,
      profileId,
      profileName: item?.pieceRate?.profileName || "-",
      inputMode: item?.pieceRate?.inputMode || "kg",
      inputLabel: item?.pieceRate?.inputLabel || buildInputDescriptors(item?.pieceRate?.inputMode || "kg").inputLabel,
      inputUnitLabel: item?.pieceRate?.inputUnitLabel || buildInputDescriptors(item?.pieceRate?.inputMode || "kg").inputUnitLabel,
      weightOptionLabel: item?.pieceRate?.weightOptionLabel || null,
    };

    const searchableValue = [
      option.productName,
      option.productCode,
      option.productSkuCode,
      option.productBarcode,
      option.profileName,
    ].join(" ").toLowerCase();

    if (search && !searchableValue.includes(search)) {
      return map;
    }

    map.set(optionKey, option);
    return map;
  }, new Map()).values()).sort((left, right) => {
    const labelCompare = String(left.productName || "").localeCompare(String(right.productName || ""), "th-TH");
    if (labelCompare !== 0) {
      return labelCompare;
    }
    return String(left.productCode || "").localeCompare(String(right.productCode || ""), "th-TH");
  });

  return {
    data: {
      data: options,
    },
  };
}

export async function lookupPieceRateProduct(request) {
  const permission = await requireTaskPermission(request, "production-piece-rate-master-view");
  const canViewRates = canViewPieceRateRates(permission);
  const { searchParams } = new URL(request.url);
  const productBarcode = normalizeBarcode(searchParams.get("barcode") || searchParams.get("productBarcode"));
  if (!productBarcode) {
    throw new ApiError(400, "productBarcode is required");
  }

  const supabaseAdmin = getSupabaseAdmin();
  const resolved = await resolvePieceRateProductByBarcode(supabaseAdmin, productBarcode);

  return {
    data: {
      productBarcode: resolved.barcode,
      product: {
        code: resolved.product.code,
        goodsCode: resolved.product.goodsCode,
        skuCode: resolved.product.skuCode,
        name: resolved.product.name,
        brandCode: resolved.product.brandCode,
        brandName: resolved.product.brandName,
        unitName: resolved.product.unitName,
        imageUrl: resolved.product.imageUrl,
      },
      pieceRate: {
        profileId: resolved.profile.id,
        profileName: resolved.profile.name,
        inputMode: resolved.profile.inputMode,
        wageBasis: resolved.profile.wageBasis,
        inputLabel: resolved.profile.inputLabel,
        inputUnitLabel: resolved.profile.inputUnitLabel,
        kgPerPail: resolved.profile.kgPerPail,
        weightOptionId: resolved.profile.weightOptionId,
        weightOptionLabel: resolved.profile.weightOptionLabel,
        weightKg: resolved.profile.weightKg,
        payRatePerKg: canViewRates ? resolved.profile.payRatePerKg : null,
        payRatePerUnit: canViewRates ? resolved.profile.payRatePerUnit : null,
      },
    },
  };
}

export async function lookupPieceRateEmployee(request) {
  await requireTaskPermission(request, "production-piece-rate-master-view");
  const { searchParams } = new URL(request.url);
  const employeeCode = normalizeParam(searchParams.get("employeeCode"));
  const date = normalizeParam(searchParams.get("date")) || new Date().toISOString().slice(0, 10);

  if (!employeeCode) {
    throw new ApiError(400, "employeeCode is required");
  }

  const supabaseAdmin = getSupabaseAdmin();
  const employee = await lookupEmployeeByCode(employeeCode, date)
    || await lookupEmployeeSnapshotFromPieceRateLogs(supabaseAdmin, employeeCode);
  const employeeWithPhoto = await addEmployeePhotoUrl(supabaseAdmin, employee);

  return {
    data: {
      employee: employeeWithPhoto,
    },
  };
}

export async function getPieceRateOfflineMaster(request) {
  const permission = await requireTaskPermission(request, "production-piece-rate-master-view");
  const { searchParams } = new URL(request.url);
  const includeStaticMaster = searchParams.get("includeStaticMaster") !== "false";
  if (includeStaticMaster && !canViewPieceRateRates(permission)) {
    throw new ApiError(403, "Offline master requires piece-rate rate-view permission");
  }
  const employeeCursor = normalizeCursorValue(searchParams.get("employeeCursor"));
  const employeePageSize = Math.min(
    Math.max(Number.parseInt(String(searchParams.get("employeePageSize") || "200"), 10) || 200, 50),
    200
  );

  const generatedAt = new Date().toISOString();
  const supabaseAdmin = getSupabaseAdmin();

  const machineCode = searchParams.get("machineCode");
  let docCounter = null;
  if (machineCode) {
    const dateKey = getBangkokDateKey(new Date());
    const docDate = `${dateKey.slice(0, 4)}-${dateKey.slice(4, 6)}-${dateKey.slice(6, 8)}`;
    const { data: counterData } = await supabaseAdmin
      .from("production_piece_rate_daily_doc_counters")
      .select("last_seq")
      .eq("doc_date", docDate)
      .maybeSingle();

    if (counterData) {
      docCounter = {
        dateKey,
        lastRound: 1,
        lastSeq: counterData.last_seq,
      };
    } else {
      docCounter = {
        dateKey,
        lastRound: 1,
        lastSeq: 0,
      };
    }
  }

  const [staticMaster, employeesPage] = await Promise.all([
    includeStaticMaster
      ? loadPieceRateOfflineStaticMaster(supabaseAdmin)
      : Promise.resolve(null),
    loadPieceRateOfflineEmployeesPage({
      cursor: employeeCursor,
      pageSize: employeePageSize,
      supabaseAdmin,
    }),
  ]);

  return {
    data: {
      generatedAt,
      docCounter,
      staticMasterIncluded: includeStaticMaster,
      staticMaster: staticMaster
        ? {
          updatedAt: staticMaster.updatedAt || generatedAt,
          stats: staticMaster.stats,
          productLookups: staticMaster.productLookups,
        }
        : null,
      employees: {
        updatedAt: generatedAt,
        rows: employeesPage.rows,
        pagination: employeesPage.pagination,
        cursor: employeesPage.cursor,
      },
    },
  };
}

async function findExistingPieceRateBusinessDuplicate(supabaseAdmin, candidate) {
  const employeeCodeVariants = buildEmployeeCodeVariants(candidate.employeeCode);
  const candidateRows = await supabaseAdmin
    .from(LOG_TABLE)
    .select("*")
    .in("employee_code", employeeCodeVariants)
    .eq("product_barcode_snapshot", candidate.productBarcode)
    .eq("machine_code", candidate.machineCode)
    .eq("source", candidate.source)
    .eq("doc_status", DOC_STATUS_ACTIVE)
    .order("logged_at", { ascending: false })
    .limit(50);

  if (candidateRows.error) {
    throw new ApiError(500, "Failed to verify duplicate piece-rate work", candidateRows.error.message);
  }

  return findPieceRateBusinessDuplicate(
    candidate,
    (candidateRows.data || []).filter((row) => row.request_id !== candidate.requestId)
  );
}

export async function createPieceRateLogInternal(supabaseAdmin, permission, body = {}) {
  const requestId = String(
    body.requestId
    || body.clientSubmissionId
    || body.idempotencyKey
    || crypto.randomUUID()
  ).trim();
  if (!requestId) {
    throw new ApiError(400, "requestId is required");
  }

  // Pre-check for duplicate requestId to prevent duplicates on network retries
  const existingLog = await supabaseAdmin
    .from(LOG_TABLE)
    .select("*")
    .eq("request_id", requestId)
    .maybeSingle();

  if (existingLog.error) {
    throw new ApiError(500, "Failed to verify transaction integrity", existingLog.error.message);
  }

  if (existingLog.data) {
    return buildCreateResponse(existingLog.data, true, permission);
  }

  const capturedAt = body.loggedAt ? new Date(body.loggedAt) : new Date();
  if (Number.isNaN(capturedAt.getTime())) {
    throw new ApiError(400, "วันที่หรือรูปแบบเวลาไม่ถูกต้อง");
  }
  let workDate;
  let loggedAtIso;
  try {
    workDate = validatePieceRateWorkDate(
      body.workDate || body.work_date || getBangkokWorkDate(capturedAt)
    );
    loggedAtIso = resolvePieceRateWorkTimestamp({ workDate, capturedAt });
  } catch (error) {
    throw new ApiError(400, error?.message || "วันที่ทำงานไม่ถูกต้อง");
  }
  const loggedAt = new Date(loggedAtIso);

  const employeeCode = normalizeEmployeeCode(body.employeeCode || body.scanResult);
  if (!employeeCode) {
    throw new ApiError(400, "employeeCode is required");
  }

  const employeeSnapshotSource = typeof body.employeeSnapshot === "object" && body.employeeSnapshot
    ? body.employeeSnapshot
    : {};

  let employeeName = employeeSnapshotSource.name ?? body.employeeName ?? body.employee_name;
  let employeeDept = employeeSnapshotSource.departmentName ?? body.employeeDepartment ?? body.employee_department;
  let employeeBranch = employeeSnapshotSource.branch ?? body.employeeBranch ?? body.employee_branch;
  let employeeCheckIn = employeeSnapshotSource.checkIn ?? body.employeeCheckIn ?? body.employee_check_in;
  let employeeCheckOut = employeeSnapshotSource.checkOut ?? body.employeeCheckOut ?? body.employee_check_out;

  if (!employeeName) {
    const dateStr = workDate;
    try {
      const resolvedEmp = await lookupEmployeeByCode(employeeCode, dateStr)
        || await lookupEmployeeSnapshotFromPieceRateLogs(supabaseAdmin, employeeCode);
      if (resolvedEmp) {
        employeeName = resolvedEmp.name;
        employeeDept = resolvedEmp.departmentName;
        employeeBranch = resolvedEmp.branch;
        employeeCheckIn = resolvedEmp.checkIn;
        employeeCheckOut = resolvedEmp.checkOut;
      }
    } catch (err) {
      console.warn("Failed to resolve employee details for import:", err);
    }
  }

  const productBarcode = normalizeBarcode(body.productBarcode || body.product_barcode);
  if (!productBarcode) {
    throw new ApiError(400, "productBarcode is required");
  }

  const inputValue = parsePositiveNumber(
    body.inputValue ?? body.amount ?? body.weight ?? body.pailCount,
    "inputValue"
  );
  const countValue = parsePositiveOrDefault(
    body.countValue ?? body.count ?? body.qty ?? 1,
    "countValue",
    1
  );

  const source = normalizeSource(body.source);
  const metadata = typeof body.metadata === "object" && body.metadata
    ? body.metadata
    : {};

  const machineCode = normalizeMachineCode(
    body.machineCode
    || body.machine_code
    || metadata.machineCode
    || metadata.machine_code
  );

  if (!machineCode) {
    throw new ApiError(400, "ยังไม่ได้ตั้งค่ารหัสเครื่อง ไม่สามารถออกเลขเอกสารได้ กรุณาตั้งค่ารหัสเครื่องก่อน");
  }

  const duplicateLog = await findExistingPieceRateBusinessDuplicate(supabaseAdmin, {
    requestId,
    employeeCode,
    productBarcode,
    inputValue,
    machineCode,
    source,
    metadata: { ...metadata, workDate },
  });
  if (duplicateLog) {
    return buildCreateResponse(duplicateLog, true, permission);
  }



  let docYearBE = getBangkokYearBE(loggedAt);
  let documentNo;

  const clientDocNo = body.docNo || body.doc_no;
  if (clientDocNo) {
    const normalizedClientDocNo = String(clientDocNo).trim().toUpperCase();
    const match = PIECE_RATE_OFFLINE_DOC_NO_REGEX.exec(normalizedClientDocNo);
    const legacyMatch = PIECE_RATE_LEGACY_OFFLINE_DOC_NO_REGEX.exec(normalizedClientDocNo);
    if (match) {
      const parsedYear = Number.parseInt(match[1], 10);
      const parsedSeq = Number.parseInt(match[4], 10);
      const parsedDateKey = `${match[1]}${match[2]}${match[3]}`;
      const parsedDate = new Date(`${match[1]}-${match[2]}-${match[3]}T00:00:00+07:00`);
      if (Number.isNaN(parsedDate.getTime()) || getBangkokDateKey(parsedDate) !== parsedDateKey) {
        throw new ApiError(400, "วันที่ในเลขที่เอกสารออฟไลน์ไม่ถูกต้อง");
      }
      if (parsedDateKey !== workDate.replaceAll("-", "")) {
        throw new ApiError(400, "วันที่ในเลขที่เอกสารไม่ตรงกับวันที่ทำงาน");
      }
      docYearBE = parsedYear + 543;

      documentNo = {
        docRound: 1,
        docSeq: parsedSeq,
        docNo: normalizedClientDocNo,
      };

      await raisePieceRateDocumentCounter(
        supabaseAdmin,
        machineCode,
        docYearBE,
        parsedSeq,
        {
          workDate,
          docNo: documentNo.docNo,
          source: toDocCounterSource(source),
          actorUserId: permission.userId,
          requestId,
          metadata,
        }
      );
    } else if (legacyMatch) {
      // Allow labels queued by the previous client version to finish syncing.
      // They must not raise the new daily three-digit counter.
      documentNo = {
        docRound: 1,
        docSeq: Number.parseInt(legacyMatch[4], 10),
        docNo: normalizedClientDocNo,
      };
    } else {
      throw new ApiError(400, "รูปแบบเลขที่เอกสารออฟไลน์ไม่ถูกต้อง");
    }
  } else {
    const docCounterHintSeq = Number.parseInt(
      String(body.docCounterHint?.lastSeq ?? body.doc_counter_hint?.last_seq ?? ""),
      10
    );
    if (
      Number.isFinite(docCounterHintSeq)
      && docCounterHintSeq > 0
      && docCounterHintSeq <= PIECE_RATE_DOC_SEQ_MAX
    ) {
      await raisePieceRateDocumentCounter(
        supabaseAdmin,
        machineCode,
        docYearBE,
        docCounterHintSeq,
        {
          workDate,
          source: "system",
          actorUserId: permission.userId,
          requestId,
          metadata: { ...metadata, raiseBeforeReserve: true },
        }
      );
    }

    documentNo = await reservePieceRateDocumentNo(
      supabaseAdmin,
      machineCode,
      docYearBE,
      getBangkokMonth(loggedAt),
      {
        workDate,
        source: toDocCounterSource(source),
        actorUserId: permission.userId,
        requestId,
        metadata,
      }
    );
  }

  const [resolved, operatorUsername] = await Promise.all([
    resolvePieceRateProductByBarcode(supabaseAdmin, productBarcode),
    getOperatorUsername(supabaseAdmin, permission.userId, permission.user?.email),
  ]);

  const inputMode = resolved.profile.inputMode;
  const wageBasis = normalizeWageBasis(resolved.profile.wageBasis, "kg");
  const productSnapshotCode = resolved.product.skuCode || resolved.product.code;
  const productGoodsCode = resolved.product.goodsCode || resolved.product.code;
  const lotNo = normalizeText(body.lotNo ?? body.lot_no)
    || buildPieceRateLotNo({
      productCode: productGoodsCode,
      recordedAt: loggedAtIso,
    });
  const actualPailWeightKg = inputMode === "pail" && body.actualWeightKg !== undefined
    ? parsePositiveNumber(body.actualWeightKg, "actualWeightKg")
    : null;
  const normalizedKgAmount = inputMode === "pail"
    ? roundToScale(
      actualPailWeightKg
        ?? inputValue * Number(resolved.profile.weightKg || resolved.profile.kgPerPail || 0),
      4
    )
    : roundToScale(inputValue, 4);
  const wageAmount = calculatePieceRateWageAmount({
    wageBasis,
    normalizedKgAmount,
    countValue,
    payRatePerKg: resolved.profile.payRatePerKg,
    payRatePerUnit: resolved.profile.payRatePerUnit,
  });

  const logId = body.id || body.requestId || crypto.randomUUID();

  const payload = {
    id: logId,
    request_id: requestId,
    employee_code: employeeCode,
    employee_name_snapshot: normalizeText(employeeName),
    employee_department_snapshot: normalizeText(employeeDept),
    employee_branch_snapshot: normalizeText(employeeBranch),
    employee_check_in_snapshot: normalizeText(employeeCheckIn),
    employee_check_out_snapshot: normalizeText(employeeCheckOut),
    product_code_snapshot: productSnapshotCode,
    product_goods_code_snapshot: productGoodsCode,
    product_sku_code_snapshot: resolved.product.skuCode || null,
    product_name_snapshot: resolved.product.name,
    product_brand_code_snapshot: resolved.product.brandCode,
    product_brand_name_snapshot: resolved.product.brandName,
    product_unit_snapshot: resolved.product.unitName,
    product_barcode_snapshot: resolved.barcode,
    piece_rate_profile_id: resolved.profile.id,
    piece_rate_profile_name_snapshot: resolved.profile.name,
    weight_option_id_snapshot: resolved.profile.weightOptionId,
    weight_option_label_snapshot: resolved.profile.weightOptionLabel,
    weight_kg_snapshot: resolved.profile.weightKg,
    input_mode_snapshot: inputMode,
    wage_basis_snapshot: wageBasis,
    input_value: inputValue,
    count_value_snapshot: countValue,
    input_label_snapshot: resolved.profile.inputLabel,
    input_unit_label_snapshot: resolved.profile.inputUnitLabel,
    normalized_kg_amount_snapshot: normalizedKgAmount,
    kg_per_pail_snapshot: resolved.profile.kgPerPail,
    pay_rate_per_kg_snapshot: resolved.profile.payRatePerKg,
    pay_rate_per_unit_snapshot: resolved.profile.payRatePerUnit,
    wage_amount_snapshot: wageAmount,
    source,
    raw_product_barcode_payload: normalizeText(
      body.rawProductBarcodePayload ?? body.raw_product_barcode_payload ?? body.productBarcode ?? body.product_barcode
    ),
    raw_employee_qr_payload: normalizeText(
      body.rawEmployeeQrPayload ?? body.raw_employee_qr_payload ?? body.scanResult
    ),
    operator_user_id: permission.userId,
    operator_username_snapshot: operatorUsername,
    metadata: {
      ...alignPieceRateMetadataToWorkDate(metadata, loggedAtIso),
      workDate,
      machineCode,
      resolvedInputMode: inputMode,
      resolvedWageBasis: wageBasis,
      countValue,
      normalizedKgAmount,
      actualWeightKg: actualPailWeightKg,
    },
    machine_code: machineCode,
    doc_year_be: docYearBE,
    doc_round: documentNo.docRound,
    doc_seq: documentNo.docSeq,
    doc_no: documentNo.docNo,
    lot_no: lotNo,
    logged_at: loggedAtIso,
    doc_status: DOC_STATUS_ACTIVE,
  };

  let insertResult;
  try {
    const rpcResult = await supabaseAdmin.rpc("insert_piece_rate_log_safely", {
      p_payload: payload,
      p_employee_code: employeeCode,
      p_product_barcode: productBarcode,
      p_machine_code: machineCode,
      p_source: source,
      p_input_value: inputValue,
      p_captured_at: loggedAtIso,
      p_duplicate_window_seconds: 300,
      p_weight_tolerance: 0.02,
    });

    if (rpcResult.error) {
      const code = String(rpcResult.error.code || "");
      const msg = String(rpcResult.error.message || "");
      if (code === "PGRST501" || code === "3F000" || msg.includes("does not exist")) {
        insertResult = await supabaseAdmin
          .from(LOG_TABLE)
          .insert(payload)
          .select("*")
          .single();
      } else {
        throw new ApiError(500, "Failed to run safe piece-rate insert", rpcResult.error.message);
      }
    } else {
      const { duplicated, data } = rpcResult.data;
      return buildCreateResponse(data, duplicated, permission);
    }
  } catch (rpcErr) {
    if (rpcErr instanceof ApiError) {
      throw rpcErr;
    }
    insertResult = await supabaseAdmin
      .from(LOG_TABLE)
      .insert(payload)
      .select("*")
      .single();
  }

  if (!insertResult.error) {
    return buildCreateResponse(insertResult.data, false, permission);
  }

  if (insertResult.error.code === "23505") {
    const existingResult = await supabaseAdmin
      .from(LOG_TABLE)
      .select("*")
      .eq("request_id", requestId)
      .maybeSingle();

    if (existingResult.error) {
      throw new ApiError(409, "Duplicate requestId");
    }

    if (existingResult.data) {
      return buildCreateResponse(existingResult.data, true, permission);
    }
  }

  throw new ApiError(500, "Failed to save piece-rate log", insertResult.error.message);
}

function recalculatePieceRateTotals(row, inputValue, countValue) {
  const inputMode = normalizeInputMode(row.input_mode_snapshot, "kg");
  const wageBasis = normalizeWageBasis(row.wage_basis_snapshot, "kg");
  const resolvedWeightKg = Number(row.weight_kg_snapshot || row.kg_per_pail_snapshot || 0);
  const normalizedKgAmount = inputMode === "pail"
    ? roundToScale(inputValue * resolvedWeightKg, 4)
    : roundToScale(inputValue, 4);
  const wageAmount = calculatePieceRateWageAmount({
    wageBasis,
    normalizedKgAmount,
    countValue,
    payRatePerKg: row.pay_rate_per_kg_snapshot,
    payRatePerUnit: row.pay_rate_per_unit_snapshot,
  });

  return {
    inputMode,
    wageBasis,
    normalizedKgAmount,
    wageAmount,
  };
}

export async function updatePieceRateLog(request, logId, body = {}) {
  const permission = await requireTaskPermission(request, "production-piece-rate-adjust");
  const permissionSet = new Set(permission.permissions || []);
  const capabilities = buildReportCapabilities({
    isAdmin: permission.isAdmin,
    permissionSet,
  });
  if (!capabilities.canEdit) {
    throw new ApiError(403, "Forbidden");
  }

  const normalizedLogId = normalizeParam(logId);
  if (!normalizedLogId) {
    throw new ApiError(400, "logId is required");
  }

  const editReason = normalizeText(body.editReason || body.edit_reason);
  if (!editReason) {
    throw new ApiError(400, "editReason is required");
  }

  const supabaseAdmin = getSupabaseAdmin();
  const existingResult = await supabaseAdmin
    .from(LOG_TABLE)
    .select("*")
    .eq("id", normalizedLogId)
    .maybeSingle();
  if (existingResult.error) {
    throw new ApiError(500, "Failed to load piece-rate log", existingResult.error.message);
  }
  if (!existingResult.data) {
    throw new ApiError(404, "Piece-rate log not found");
  }

  const existing = existingResult.data;
  const existingDocStatus = normalizeDocStatus(existing.doc_status, DOC_STATUS_ACTIVE);
  if (existingDocStatus !== DOC_STATUS_ACTIVE || existing.replaced_by_log_id) {
    throw new ApiError(409, "Document already replaced or cancelled");
  }

  const inputValue = body.inputValue === undefined
    ? Number(existing.input_value || 0)
    : parsePositiveNumber(body.inputValue ?? body.amount ?? body.weight ?? body.pailCount, "inputValue");
  const countValue = body.countValue === undefined
    ? parsePositiveOrDefault(existing.count_value_snapshot, "countValue", 1)
    : parsePositiveOrDefault(body.countValue ?? body.count ?? body.qty, "countValue", 1);

  const requestedProductBarcode = normalizeBarcode(body.productBarcode || body.product_barcode);
  const existingProductBarcode = normalizeBarcode(existing.product_barcode_snapshot);
  const shouldReplaceProduct = Boolean(
    requestedProductBarcode
    && requestedProductBarcode !== existingProductBarcode
  );

  let resolvedProduct = null;
  let recalculationSource = existing;
  if (shouldReplaceProduct) {
    resolvedProduct = await resolvePieceRateProductByBarcode(supabaseAdmin, requestedProductBarcode);
    const replacementProductCode = resolvedProduct.product.skuCode || resolvedProduct.product.code;
    recalculationSource = {
      ...existing,
      product_code_snapshot: replacementProductCode,
      product_goods_code_snapshot: resolvedProduct.product.goodsCode || resolvedProduct.product.code,
      product_sku_code_snapshot: resolvedProduct.product.skuCode || null,
      product_name_snapshot: resolvedProduct.product.name,
      product_brand_code_snapshot: resolvedProduct.product.brandCode,
      product_brand_name_snapshot: resolvedProduct.product.brandName,
      product_unit_snapshot: resolvedProduct.product.unitName,
      product_barcode_snapshot: resolvedProduct.barcode,
      piece_rate_profile_id: resolvedProduct.profile.id,
      piece_rate_profile_name_snapshot: resolvedProduct.profile.name,
      weight_option_id_snapshot: resolvedProduct.profile.weightOptionId,
      weight_option_label_snapshot: resolvedProduct.profile.weightOptionLabel,
      weight_kg_snapshot: resolvedProduct.profile.weightKg,
      input_mode_snapshot: resolvedProduct.profile.inputMode,
      wage_basis_snapshot: normalizeWageBasis(resolvedProduct.profile.wageBasis, "kg"),
      input_label_snapshot: resolvedProduct.profile.inputLabel,
      input_unit_label_snapshot: resolvedProduct.profile.inputUnitLabel,
      kg_per_pail_snapshot: resolvedProduct.profile.kgPerPail,
      pay_rate_per_kg_snapshot: resolvedProduct.profile.payRatePerKg,
      pay_rate_per_unit_snapshot: resolvedProduct.profile.payRatePerUnit,
    };
  }

  const { inputMode, wageBasis, normalizedKgAmount, wageAmount } = recalculatePieceRateTotals(
    recalculationSource,
    inputValue,
    countValue
  );

  const replaceAt = new Date();
  const replaceAtIso = replaceAt.toISOString();
  const docYearBE = getBangkokYearBE(replaceAt);
  const replacementRequestId = `replace:${normalizedLogId}:${crypto.randomUUID()}`;
  const replacementMachineCode = normalizeMachineCode(
    existing.machine_code
    || existing.metadata?.machineCode
    || existing.metadata?.machine_code
  );
  if (!replacementMachineCode) {
    throw new ApiError(400, "เอกสารเดิมไม่มีรหัสเครื่อง ไม่สามารถออกเลขเอกสารใหม่ได้");
  }
  const documentNo = await reservePieceRateDocumentNo(
    supabaseAdmin,
    replacementMachineCode,
    docYearBE,
    getBangkokMonth(replaceAt),
    {
      source: "manual",
      actorUserId: permission.userId,
      requestId: replacementRequestId,
      metadata: {
        action: "replace",
        revisedFromLogId: normalizedLogId,
        revisedFromDocNo: existing.doc_no || null,
      },
    }
  );
  const operatorUsername = await getOperatorUsername(supabaseAdmin, permission.userId, permission.user?.email);
  const replacementProductCode = shouldReplaceProduct
    ? (resolvedProduct.product.skuCode || resolvedProduct.product.code)
    : (existing.product_sku_code_snapshot || existing.product_code_snapshot);

  const replacementMetadata = {
    ...(typeof existing.metadata === "object" && existing.metadata ? existing.metadata : {}),
    machineCode: replacementMachineCode,
    resolvedInputMode: inputMode,
    resolvedWageBasis: wageBasis,
    countValue,
    normalizedKgAmount,
    revision: {
      action: "replace",
      revisedFromLogId: normalizedLogId,
      revisedFromDocNo: existing.doc_no || null,
      reason: editReason,
      productChanged: shouldReplaceProduct,
      previousProductBarcode: existing.product_barcode_snapshot || null,
      nextProductBarcode: shouldReplaceProduct
        ? resolvedProduct.barcode
        : (existing.product_barcode_snapshot || null),
      replacedAt: replaceAtIso,
      replacedBy: permission.userId,
    },
  };

  const replacementPayload = {
    request_id: replacementRequestId,
    employee_code: normalizeEmployeeCode(existing.employee_code) || existing.employee_code,
    employee_name_snapshot: existing.employee_name_snapshot,
    employee_department_snapshot: existing.employee_department_snapshot,
    employee_branch_snapshot: existing.employee_branch_snapshot,
    employee_check_in_snapshot: existing.employee_check_in_snapshot,
    employee_check_out_snapshot: existing.employee_check_out_snapshot,
    product_code_snapshot: replacementProductCode,
    product_goods_code_snapshot: shouldReplaceProduct
      ? (resolvedProduct.product.goodsCode || resolvedProduct.product.code)
      : existing.product_goods_code_snapshot,
    product_sku_code_snapshot: shouldReplaceProduct
      ? (resolvedProduct.product.skuCode || null)
      : existing.product_sku_code_snapshot,
    product_name_snapshot: shouldReplaceProduct
      ? resolvedProduct.product.name
      : existing.product_name_snapshot,
    product_brand_code_snapshot: shouldReplaceProduct
      ? resolvedProduct.product.brandCode
      : existing.product_brand_code_snapshot,
    product_brand_name_snapshot: shouldReplaceProduct
      ? resolvedProduct.product.brandName
      : existing.product_brand_name_snapshot,
    product_unit_snapshot: shouldReplaceProduct
      ? resolvedProduct.product.unitName
      : existing.product_unit_snapshot,
    product_barcode_snapshot: shouldReplaceProduct
      ? resolvedProduct.barcode
      : existing.product_barcode_snapshot,
    piece_rate_profile_id: shouldReplaceProduct
      ? resolvedProduct.profile.id
      : existing.piece_rate_profile_id,
    piece_rate_profile_name_snapshot: shouldReplaceProduct
      ? resolvedProduct.profile.name
      : existing.piece_rate_profile_name_snapshot,
    weight_option_id_snapshot: shouldReplaceProduct
      ? resolvedProduct.profile.weightOptionId
      : existing.weight_option_id_snapshot,
    weight_option_label_snapshot: shouldReplaceProduct
      ? resolvedProduct.profile.weightOptionLabel
      : existing.weight_option_label_snapshot,
    weight_kg_snapshot: shouldReplaceProduct
      ? resolvedProduct.profile.weightKg
      : existing.weight_kg_snapshot,
    input_value: inputValue,
    count_value_snapshot: countValue,
    input_mode_snapshot: inputMode,
    wage_basis_snapshot: wageBasis,
    input_label_snapshot: shouldReplaceProduct
      ? resolvedProduct.profile.inputLabel
      : existing.input_label_snapshot,
    input_unit_label_snapshot: shouldReplaceProduct
      ? resolvedProduct.profile.inputUnitLabel
      : existing.input_unit_label_snapshot,
    normalized_kg_amount_snapshot: normalizedKgAmount,
    kg_per_pail_snapshot: shouldReplaceProduct
      ? resolvedProduct.profile.kgPerPail
      : existing.kg_per_pail_snapshot,
    pay_rate_per_kg_snapshot: shouldReplaceProduct
      ? resolvedProduct.profile.payRatePerKg
      : existing.pay_rate_per_kg_snapshot,
    pay_rate_per_unit_snapshot: shouldReplaceProduct
      ? resolvedProduct.profile.payRatePerUnit
      : existing.pay_rate_per_unit_snapshot,
    wage_amount_snapshot: wageAmount,
    operator_user_id: permission.userId,
    operator_username_snapshot: operatorUsername,
    source: "manual",
    raw_product_barcode_payload: normalizeText(
      body.rawProductBarcodePayload
      ?? body.raw_product_barcode_payload
      ?? (shouldReplaceProduct ? resolvedProduct.barcode : existing.raw_product_barcode_payload)
      ?? existing.product_barcode_snapshot
    ),
    raw_employee_qr_payload: existing.raw_employee_qr_payload || null,
    machine_code: replacementMachineCode,
    metadata: {
      ...replacementMetadata,
      scaleAudit: shouldReplaceProduct ? {
        ...(replacementMetadata.scaleAudit && typeof replacementMetadata.scaleAudit === "object"
          ? replacementMetadata.scaleAudit
          : {}),
        productBarcode: resolvedProduct?.barcode || existing.product_barcode_snapshot || null,
      } : replacementMetadata.scaleAudit,
      productSnapshot: shouldReplaceProduct ? {
        code: resolvedProduct.product.code,
        goodsCode: resolvedProduct.product.goodsCode || resolvedProduct.product.code,
        skuCode: resolvedProduct.product.skuCode || null,
        name: resolvedProduct.product.name,
        brandCode: resolvedProduct.product.brandCode || null,
        brandName: resolvedProduct.product.brandName || null,
        unitName: resolvedProduct.product.unitName || null,
      } : replacementMetadata.productSnapshot,
      pieceRateSnapshot: {
        ...(replacementMetadata.pieceRateSnapshot && typeof replacementMetadata.pieceRateSnapshot === "object"
          ? replacementMetadata.pieceRateSnapshot
          : {}),
        profileId: shouldReplaceProduct ? resolvedProduct.profile.id : existing.piece_rate_profile_id,
        profileName: shouldReplaceProduct
          ? resolvedProduct.profile.name
          : existing.piece_rate_profile_name_snapshot,
        inputMode,
        inputLabel: shouldReplaceProduct
          ? resolvedProduct.profile.inputLabel
          : existing.input_label_snapshot,
        inputUnitLabel: shouldReplaceProduct
          ? resolvedProduct.profile.inputUnitLabel
          : existing.input_unit_label_snapshot,
        wageBasis,
        payRatePerKg: shouldReplaceProduct
          ? resolvedProduct.profile.payRatePerKg
          : existing.pay_rate_per_kg_snapshot,
        payRatePerUnit: shouldReplaceProduct
          ? resolvedProduct.profile.payRatePerUnit
          : existing.pay_rate_per_unit_snapshot,
        weightOptionId: shouldReplaceProduct
          ? resolvedProduct.profile.weightOptionId
          : existing.weight_option_id_snapshot,
        weightOptionLabel: shouldReplaceProduct
          ? resolvedProduct.profile.weightOptionLabel
          : existing.weight_option_label_snapshot,
        weightKg: shouldReplaceProduct
          ? resolvedProduct.profile.weightKg
          : existing.weight_kg_snapshot,
        kgPerPail: shouldReplaceProduct
          ? resolvedProduct.profile.kgPerPail
          : existing.kg_per_pail_snapshot,
      },
    },
    doc_year_be: docYearBE,
    doc_round: documentNo.docRound,
    doc_seq: documentNo.docSeq,
    doc_no: documentNo.docNo,
    logged_at: replaceAtIso,
    doc_status: DOC_STATUS_ACTIVE,
    is_edited: false,
    edited_at: null,
    edited_by: null,
    edit_reason: null,
    revised_from_log_id: normalizedLogId,
    revised_from_doc_no: existing.doc_no || null,
    replaced_by_log_id: null,
    replaced_by_doc_no: null,
    cancelled_at: null,
    cancelled_by: null,
    cancel_reason: null,
  };




  const replacementInsertResult = await supabaseAdmin
    .from(LOG_TABLE)
    .insert(replacementPayload)
    .select("*")
    .maybeSingle();
  if (replacementInsertResult.error) {
    throw new ApiError(500, "Failed to create replacement document", replacementInsertResult.error.message);
  }
  if (!replacementInsertResult.data) {
    throw new ApiError(500, "Replacement document was not returned");
  }
  const replacementLog = replacementInsertResult.data;

  let updateOldQuery = supabaseAdmin
    .from(LOG_TABLE)
    .update({
      is_edited: true,
      edited_at: replaceAtIso,
      edited_by: permission.userId,
      edit_reason: editReason,
      doc_status: DOC_STATUS_REPLACED,
      replaced_by_log_id: replacementLog.id,
      replaced_by_doc_no: replacementLog.doc_no || null,
      cancelled_at: replaceAtIso,
      cancelled_by: permission.userId,
      cancel_reason: editReason,
    })
    .eq("id", normalizedLogId)
    .is("replaced_by_log_id", null);

  updateOldQuery = applyExistingDocStatusFilter(updateOldQuery, existing.doc_status);

  const updateOldResult = await updateOldQuery
    .select("*")
    .maybeSingle();
  if (updateOldResult.error) {
    throw new ApiError(500, "Failed to replace original document", updateOldResult.error.message);
  }
  if (!updateOldResult.data) {
    await supabaseAdmin
      .from(LOG_TABLE)
      .update({
        doc_status: DOC_STATUS_CANCELLED,
        cancelled_at: replaceAtIso,
        cancelled_by: permission.userId,
        cancel_reason: "rollback: original document state changed before replace completed",
      })
      .eq("id", replacementLog.id);
    throw new ApiError(409, "Document was changed by another request, please reload and try again");
  }

  const revisionResult = await supabaseAdmin
    .from(REVISION_TABLE)
    .insert({
      log_id: normalizedLogId,
      action: "replace",
      before_data: existing,
      after_data: {
        replacedLog: updateOldResult.data,
        replacementLog,
      },
      edited_by: permission.userId,
      edit_reason: editReason,
    });
  if (revisionResult.error) {
    throw new ApiError(500, "Failed to save piece-rate revision", revisionResult.error.message);
  }

  return {
    ok: true,
    data: mapPieceRateReportRow(replacementLog, capabilities),
    replaced: {
      id: updateOldResult.data.id,
      docNo: updateOldResult.data.doc_no || null,
      status: normalizeDocStatus(updateOldResult.data.doc_status, DOC_STATUS_REPLACED),
    },
  };
}

export async function cancelPieceRateLog(request, logId, body = {}) {
  const permission = await requireTaskPermission(request, "production-piece-rate-cancel");
  const permissionSet = new Set(permission.permissions || []);
  const capabilities = buildReportCapabilities({
    isAdmin: permission.isAdmin,
    permissionSet,
  });
  if (!capabilities.canCancel) {
    throw new ApiError(403, "Forbidden");
  }

  const normalizedLogId = normalizeParam(logId);
  if (!normalizedLogId) {
    throw new ApiError(400, "logId is required");
  }

  const cancelReason = normalizeText(body.cancelReason || body.cancel_reason || body.editReason || body.edit_reason);
  if (!cancelReason) {
    throw new ApiError(400, "cancelReason is required");
  }

  const supabaseAdmin = getSupabaseAdmin();
  const existingResult = await supabaseAdmin
    .from(LOG_TABLE)
    .select("*")
    .eq("id", normalizedLogId)
    .maybeSingle();
  if (existingResult.error) {
    throw new ApiError(500, "Failed to load piece-rate log", existingResult.error.message);
  }
  if (!existingResult.data) {
    throw new ApiError(404, "Piece-rate log not found");
  }

  const existing = existingResult.data;
  const existingDocStatus = normalizeDocStatus(existing.doc_status, DOC_STATUS_ACTIVE);
  if (existingDocStatus !== DOC_STATUS_ACTIVE || existing.replaced_by_log_id) {
    throw new ApiError(409, "Document already replaced or cancelled");
  }
  await assertPieceRateLogHasNoActiveStockIssue(supabaseAdmin, normalizedLogId);

  const cancelAtIso = new Date().toISOString();
  let updateQuery = supabaseAdmin
    .from(LOG_TABLE)
    .update({
      is_edited: true,
      edited_at: cancelAtIso,
      edited_by: permission.userId,
      edit_reason: cancelReason,
      doc_status: DOC_STATUS_CANCELLED,
      cancelled_at: cancelAtIso,
      cancelled_by: permission.userId,
      cancel_reason: cancelReason,
    })
    .eq("id", normalizedLogId)
    .is("replaced_by_log_id", null);

  updateQuery = applyExistingDocStatusFilter(updateQuery, existing.doc_status);

  const updateResult = await updateQuery
    .select("*")
    .maybeSingle();
  if (updateResult.error) {
    throw new ApiError(500, "Failed to cancel document", updateResult.error.message);
  }
  if (!updateResult.data) {
    throw new ApiError(409, "Document was changed by another request, please reload and try again");
  }

  const revisionResult = await supabaseAdmin
    .from(REVISION_TABLE)
    .insert({
      log_id: normalizedLogId,
      action: "cancel",
      before_data: existing,
      after_data: updateResult.data,
      edited_by: permission.userId,
      edit_reason: cancelReason,
    });
  if (revisionResult.error) {
    throw new ApiError(500, "Failed to save cancel revision", revisionResult.error.message);
  }

  return {
    ok: true,
    data: mapPieceRateReportRow(updateResult.data, capabilities),
  };
}

export async function createPieceRateLog(request, body = {}) {
  const permission = await requireTaskPermission(request, "production-piece-rate-record");
  const supabaseAdmin = getSupabaseAdmin();
  return createPieceRateLogInternal(supabaseAdmin, permission, body);
}

export async function importPieceRateLogs(request, body = {}) {
  const permission = await requireTaskPermission(request, "production-piece-rate-record");
  const supabaseAdmin = getSupabaseAdmin();

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return { ok: true, count: 0, results: [] };
  }

  if (items.length > 200) {
    throw new ApiError(400, "การนำเข้าจำกัดไม่เกิน 200 รายการต่อครั้ง");
  }

  const results = [];
  let successCount = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    try {
      if (!item.requestId && !item.request_id) {
        item.requestId = crypto.randomUUID();
      }

      const logResult = await createPieceRateLogInternal(supabaseAdmin, permission, item);
      results.push({
        index: i,
        ok: true,
        docNo: logResult.data?.docNo || logResult.data?.doc_no || null,
        id: logResult.data?.id || null,
        duplicated: Boolean(logResult.duplicated),
      });
      successCount++;
    } catch (error) {
      results.push({
        index: i,
        ok: false,
        error: error instanceof ApiError ? error.message : (error?.message || "Unknown error"),
      });
    }
  }

  return {
    ok: true,
    total: items.length,
    successCount,
    failureCount: items.length - successCount,
    results,
  };
}
