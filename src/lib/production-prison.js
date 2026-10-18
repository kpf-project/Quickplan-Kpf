import "server-only";

import { ApiError, getSupabaseAdmin } from "@/lib/adminApi";
import {
  loadScaleProductsData,
  SCALE_CATEGORY_CODE,
  SCALE_DEPARTMENT_CODE,
} from "@/lib/scale/products";
import { buildPrisonLotBalanceRows } from "@/lib/production-prison-balance-rows";
import { fetchAllSupabaseRows } from "@/lib/supabaseRangeFetch";

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeUpperText(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeDecimal(value) {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(parsed) ? Number(parsed.toFixed(3)) : 0;
}

function getBangkokTodayInput() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function ensureIsoDate(value, fallback = getBangkokTodayInput()) {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue) {
    return fallback;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    throw new ApiError(400, "วันที่รายงานไม่ถูกต้อง");
  }

  return normalizedValue;
}

function ensureOptionalIsoDate(value) {
  const normalizedValue = normalizeText(value);
  if (!normalizedValue) {
    return null;
  }

  return ensureIsoDate(normalizedValue);
}

function normalizeLimit(value, fallback = 20) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, 200);
}

function normalizePage(value, fallback = 1) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function normalizeProductCodes(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(values.map((value) => normalizeUpperText(value)).filter(Boolean))
  );
}

function normalizeBarcodeQuery(value) {
  return normalizeText(value);
}

function isMissingProductionPrisonError(error) {
  const code = normalizeUpperText(error?.code);
  const message = String(error?.message || "").toLowerCase();

  return (
    code === "42P01"
    || code === "42703"
    || code === "42883"
    || code === "PGRST200"
    || code === "PGRST204"
    || message.includes("production_prison_")
  );
}

function buildScopePayload(scopeData) {
  const products = Array.isArray(scopeData?.products) ? scopeData.products : [];
  const departmentId = scopeData?.preset?.departmentId ?? null;

  return {
    departmentId,
    departmentCode: scopeData?.preset?.departmentCode || SCALE_DEPARTMENT_CODE,
    departmentName: scopeData?.preset?.departmentName || "",
    categoryCode: scopeData?.preset?.categoryCode || SCALE_CATEGORY_CODE,
    source: scopeData?.source || "fallback",
    products: products.map((product) => ({
      code: normalizeUpperText(product.code),
      name: normalizeText(product.name),
      unit: normalizeText(product.unit),
    })),
  };
}

function buildSummary(rows) {
  return rows.reduce(
    (summary, row) => ({
      totalCount: summary.totalCount + 1,
      totalQuantity: Number((summary.totalQuantity + (row.quantity || 0)).toFixed(3)),
      totalWeightKg: Number((summary.totalWeightKg + (row.weightKg || 0)).toFixed(3)),
    }),
    {
      totalCount: 0,
      totalQuantity: 0,
      totalWeightKg: 0,
    }
  );
}

function buildGroupedSummary(rows) {
  return rows.reduce(
    (summary, row) => ({
      totalCount: summary.totalCount + 1,
      totalQuantity: Number((summary.totalQuantity + (row.quantity || 0)).toFixed(3)),
      totalWeightKg: Number((summary.totalWeightKg + (row.totalWeightKg || 0)).toFixed(3)),
    }),
    {
      totalCount: 0,
      totalQuantity: 0,
      totalWeightKg: 0,
    }
  );
}

function paginateRows(rows, page, limit, includeAll = false) {
  const totalCount = rows.length;
  const totalPages = totalCount ? Math.ceil(totalCount / limit) : 0;
  const resolvedPage = totalPages ? Math.min(page, totalPages) : 1;
  const pagedRows = includeAll
    ? rows
    : rows.slice((resolvedPage - 1) * limit, resolvedPage * limit);

  return {
    rows: pagedRows,
    pagination: {
      page: resolvedPage,
      limit,
      totalCount,
      totalPages,
    },
  };
}

function normalizePrisonIssueRow(row) {
  return {
    issueItemId: normalizeText(row?.prison_issue_item_id),
    issueDocumentId: normalizeText(row?.prison_issue_document_id),
    issueNo: normalizeText(row?.prison_issue_no),
    issueType: "PRISON",
    issueDate: normalizeText(row?.issue_date),
    issuedAt: row?.issued_at || row?.document_issued_at || null,
    barcode: normalizeText(row?.barcode) || "-",
    productCode: normalizeUpperText(row?.product_code) || "-",
    productName: normalizeText(row?.product_name_snapshot) || "-",
    lotNo: normalizeText(row?.lot_no) || "-",
    quantity: normalizeDecimal(row?.quantity),
    weightKg: normalizeDecimal(row?.weight_kg),
    documentStatus: normalizeText(row?.document_status) || "confirmed",
    itemStatus: normalizeText(row?.item_status) || "confirmed",
  };
}

function normalizePrisonInboundRow(row) {
  const prisonIssued =
    normalizeText(row?.prison_issue_item_id) !== ""
    && normalizeText(row?.prison_document_status || row?.prison_item_status) === "confirmed";

  return {
    inboundItemId: normalizeText(row?.inbound_item_id),
    inboundDocumentId: normalizeText(row?.inbound_document_id),
    inboundNo: normalizeText(row?.inbound_no),
    issueType: "PRISON",
    issueDate: normalizeText(row?.inbound_date),
    issuedAt: row?.inbound_document_issued_at || null,
    barcode: normalizeText(row?.barcode) || "-",
    productCode: normalizeUpperText(row?.product_code) || "-",
    productName: normalizeText(row?.product_name_snapshot) || "-",
    lotNo: normalizeText(row?.lot_no) || "-",
    quantity: normalizeDecimal(row?.quantity),
    weightKg: normalizeDecimal(row?.weight_kg),
    documentStatus: normalizeText(row?.inbound_document_status) || "confirmed",
    itemStatus: normalizeText(row?.inbound_item_status) || "confirmed",
    prisonIssueItemId: normalizeText(row?.prison_issue_item_id),
    prisonIssueNo: normalizeText(row?.prison_issue_no),
    prisonIssuedAt: row?.prison_issued_at || null,
    prisonIssued,
    itemStatusLabel: prisonIssued ? "เบิกแล้ว" : "พร้อมเบิก",
  };
}

async function loadPrisonIssueRows(
  supabaseAdmin,
  {
    departmentId,
    categoryCode,
    dateFrom = null,
    dateTo = null,
    productCodes = [],
    barcodeQuery = "",
    includeVoided = false,
  } = {}
) {
  const rows = await fetchAllSupabaseRows(
    () => {
      let query = supabaseAdmin
        .from("production_prison_issue_report_lines_v")
        .select(
          "prison_issue_document_id,prison_issue_item_id,prison_issue_no,department_id,department_code,issue_date,document_issued_at,document_status,barcode,product_code,product_name_snapshot,category_code,lot_no,uom_name,quantity,weight_kg,issued_at,item_status"
        )
        .eq("department_id", departmentId)
        .eq("category_code", categoryCode)
        .order("issued_at", { ascending: false })
        .order("prison_issue_item_id", { ascending: false });

      if (!includeVoided) {
        query = query.eq("document_status", "confirmed").eq("item_status", "confirmed");
      }

      if (dateFrom) {
        query = query.gte("issue_date", dateFrom);
      }
      if (dateTo) {
        query = query.lte("issue_date", dateTo);
      }
      if (productCodes.length) {
        query = query.in("product_code", productCodes);
      }
      if (barcodeQuery) {
        query = query.ilike("barcode", `%${barcodeQuery}%`);
      }

      return query;
    },
    {
      onError: (error) => {
        if (isMissingProductionPrisonError(error)) {
          return [];
        }

        throw new Error("Failed to load prison issue rows");
      },
    }
  );

  return rows.map(normalizePrisonIssueRow);
}

async function loadPrisonInboundRows(
  supabaseAdmin,
  {
    departmentId,
    categoryCode,
    dateFrom = null,
    dateTo = null,
    productCodes = [],
    barcodeQuery = "",
    onlyCancelable = false,
  } = {}
) {
  const rows = await fetchAllSupabaseRows(
    () => {
      let query = supabaseAdmin
        .from("production_prison_inbound_report_lines_v")
        .select(
          "inbound_document_id,inbound_item_id,inbound_no,department_id,department_code,inbound_date,inbound_document_issued_at,inbound_document_status,inbound_item_status,barcode,product_code,product_name_snapshot,category_code,lot_no,uom_name,quantity,weight_kg,prison_issue_item_id,prison_issue_no,prison_issue_date,prison_document_status,prison_item_status,prison_issued_at"
        )
        .eq("department_id", departmentId)
        .eq("category_code", categoryCode)
        .eq("inbound_document_status", "confirmed")
        .eq("inbound_item_status", "confirmed")
        .order("inbound_date", { ascending: true })
        .order("lot_no", { ascending: true })
        .order("product_code", { ascending: true })
        .order("inbound_document_issued_at", { ascending: true })
        .order("inbound_item_id", { ascending: true });

      if (dateFrom) {
        query = query.gte("inbound_date", dateFrom);
      }
      if (dateTo) {
        query = query.lte("inbound_date", dateTo);
      }
      if (productCodes.length) {
        query = query.in("product_code", productCodes);
      }
      if (barcodeQuery) {
        query = query.ilike("barcode", `%${barcodeQuery}%`);
      }
      if (onlyCancelable) {
        query = query.is("prison_issue_item_id", null);
      }

      return query;
    },
    {
      onError: (error) => {
        if (isMissingProductionPrisonError(error)) {
          return [];
        }

        throw new Error("Failed to load prison inbound rows");
      },
    }
  );

  return rows.map(normalizePrisonInboundRow);
}

function buildPrisonIssueSummaryRows(rows) {
  const groups = new Map();

  rows.forEach((row) => {
    const key = [row.issueDate, row.lotNo, row.productCode].join("|");
    if (!groups.has(key)) {
      groups.set(key, {
        issueDate: row.issueDate,
        lotNo: row.lotNo,
        issueType: "PRISON",
        productCode: row.productCode,
        productName: row.productName,
        quantity: 0,
        totalWeightKg: 0,
      });
    }

    const group = groups.get(key);
    group.quantity += row.quantity || 0;
    group.totalWeightKg += row.weightKg || 0;
  });

  return Array.from(groups.values()).map((row) => ({
    ...row,
    quantity: Number(row.quantity.toFixed(3)),
    totalWeightKg: Number(row.totalWeightKg.toFixed(3)),
  }));
}

function buildPrisonMovementSummaryRows(inboundRows, issueRows) {
  const groups = new Map();

  inboundRows.forEach((row) => {
    const key = [row.issueDate, row.lotNo, row.productCode].join("|");
    if (!groups.has(key)) {
      groups.set(key, {
        issueDate: row.issueDate,
        lotNo: row.lotNo,
        productCode: row.productCode,
        productName: row.productName,
        inboundQuantity: 0,
        inboundWeightKg: 0,
        issueQuantity: 0,
        issueWeightKg: 0,
      });
    }

    const group = groups.get(key);
    group.inboundQuantity += row.quantity || 0;
    group.inboundWeightKg += row.weightKg || 0;
  });

  issueRows.forEach((row) => {
    const key = [row.issueDate, row.lotNo, row.productCode].join("|");
    if (!groups.has(key)) {
      groups.set(key, {
        issueDate: row.issueDate,
        lotNo: row.lotNo,
        productCode: row.productCode,
        productName: row.productName,
        inboundQuantity: 0,
        inboundWeightKg: 0,
        issueQuantity: 0,
        issueWeightKg: 0,
      });
    }

    const group = groups.get(key);
    group.issueQuantity += row.quantity || 0;
    group.issueWeightKg += row.weightKg || 0;
  });

  return Array.from(groups.values())
    .map((row) => ({
      ...row,
      inboundQuantity: Number(row.inboundQuantity.toFixed(3)),
      inboundWeightKg: Number(row.inboundWeightKg.toFixed(3)),
      issueQuantity: Number(row.issueQuantity.toFixed(3)),
      issueWeightKg: Number(row.issueWeightKg.toFixed(3)),
      balanceQuantity: Number((row.inboundQuantity - row.issueQuantity).toFixed(3)),
      balanceWeightKg: Number((row.inboundWeightKg - row.issueWeightKg).toFixed(3)),
    }))
    .sort((left, right) => {
      if (left.issueDate !== right.issueDate) {
        return right.issueDate.localeCompare(left.issueDate);
      }
      if (left.lotNo !== right.lotNo) {
        return left.lotNo.localeCompare(right.lotNo);
      }
      return left.productCode.localeCompare(right.productCode);
    });
}

function buildBalanceSummary(rows) {
  return rows.reduce(
    (summary, row) => ({
      totalCount: summary.totalCount + 1,
      openingQuantity: Number((summary.openingQuantity + (row.openingQuantity || 0)).toFixed(3)),
      openingWeightKg: Number((summary.openingWeightKg + (row.openingWeightKg || 0)).toFixed(3)),
      inboundQuantity: Number((summary.inboundQuantity + (row.inboundQuantity || 0)).toFixed(3)),
      inboundWeightKg: Number((summary.inboundWeightKg + (row.inboundWeightKg || 0)).toFixed(3)),
      issueQuantity: Number((summary.issueQuantity + (row.issueQuantity || 0)).toFixed(3)),
      issueWeightKg: Number((summary.issueWeightKg + (row.issueWeightKg || 0)).toFixed(3)),
      balanceQuantity: Number((summary.balanceQuantity + (row.balanceQuantity || 0)).toFixed(3)),
      balanceWeightKg: Number((summary.balanceWeightKg + (row.balanceWeightKg || 0)).toFixed(3)),
    }),
    {
      totalCount: 0,
      openingQuantity: 0,
      openingWeightKg: 0,
      inboundQuantity: 0,
      inboundWeightKg: 0,
      issueQuantity: 0,
      issueWeightKg: 0,
      balanceQuantity: 0,
      balanceWeightKg: 0,
    }
  );
}

function buildBaseFilters({
  dateFrom,
  dateTo,
  issueStatuses = [],
  productCodes,
  barcode = "",
}) {
  return {
    dateFrom,
    dateTo,
    issueStatuses,
    productCodes,
    barcode,
  };
}

function matchesPrisonInboundSearch(row, search) {
  const normalizedSearch = normalizeText(search).toLowerCase();
  if (!normalizedSearch) {
    return true;
  }

  return [
    row.barcode,
    row.productCode,
    row.productName,
    row.lotNo,
    row.inboundNo,
  ].some((value) => normalizeText(value).toLowerCase().includes(normalizedSearch));
}

export async function loadProductionPrisonIssuePageData(
  supabaseAdmin = getSupabaseAdmin(),
  targetDate = null
) {
  const scopeData = await loadScaleProductsData(supabaseAdmin);
  const scope = buildScopePayload(scopeData);
  const todayIssueDate = targetDate ? ensureIsoDate(targetDate) : getBangkokTodayInput();

  if (!scope.departmentId) {
    return {
      scope,
      todayIssueDate,
      recentIssues: [],
      summary: {
        totalCount: 0,
        totalQuantity: 0,
        totalWeightKg: 0,
      },
    };
  }

  const rows = await loadPrisonIssueRows(supabaseAdmin, {
    departmentId: scope.departmentId,
    categoryCode: scope.categoryCode,
    dateFrom: todayIssueDate,
    dateTo: todayIssueDate,
  });

  return {
    scope,
    todayIssueDate,
    recentIssues: rows,
    summary: buildSummary(rows),
  };
}

export async function loadProductionPrisonIssueAvailableData(
  supabaseAdmin = getSupabaseAdmin(),
  {
    dateFrom = null,
    dateTo = null,
    search = "",
    productCodes = [],
    page = 1,
    limit = 50,
  } = {}
) {
  const scopeData = await loadScaleProductsData(supabaseAdmin);
  const scope = buildScopePayload(scopeData);
  const normalizedDateFrom = ensureOptionalIsoDate(dateFrom);
  const normalizedDateTo = ensureOptionalIsoDate(dateTo);
  const normalizedSearch = normalizeText(search);
  const normalizedProductCodes = normalizeProductCodes(productCodes);
  const normalizedPage = normalizePage(page, 1);
  const normalizedLimit = normalizeLimit(limit, 50);

  if (!scope.departmentId) {
    return {
      scope,
      rows: [],
      summary: buildSummary([]),
      filters: {
        dateFrom: normalizedDateFrom || "",
        dateTo: normalizedDateTo || "",
        search: normalizedSearch,
        productCodes: normalizedProductCodes,
      },
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        totalCount: 0,
        totalPages: 0,
      },
    };
  }

  const rows = (await loadPrisonInboundRows(supabaseAdmin, {
    departmentId: scope.departmentId,
    categoryCode: scope.categoryCode,
    dateFrom: normalizedDateFrom,
    dateTo: normalizedDateTo,
    productCodes: normalizedProductCodes,
    onlyCancelable: true,
  })).filter((row) => matchesPrisonInboundSearch(row, normalizedSearch));

  const paged = paginateRows(rows, normalizedPage, normalizedLimit);

  return {
    scope,
    rows: paged.rows,
    summary: buildSummary(rows),
    filters: {
      dateFrom: normalizedDateFrom || "",
      dateTo: normalizedDateTo || "",
      search: normalizedSearch,
      productCodes: normalizedProductCodes,
    },
    pagination: paged.pagination,
  };
}

export async function createProductionPrisonIssue(
  input,
  supabaseAdmin = getSupabaseAdmin()
) {
  const barcode = normalizeText(input?.barcode);
  const actorUserId = normalizeText(input?.actorUserId) || null;
  const remark = normalizeText(input?.remark) || null;
  const issuedAt = normalizeText(input?.issuedAt) || null;

  if (!barcode) {
    throw new ApiError(400, "กรุณากรอกหรือสแกนรหัสบาร์โค้ดก่อนทำรายการเบิกเรือนจำ");
  }

  const rpcResult = await supabaseAdmin.rpc("create_production_prison_issue", {
    p_barcode: barcode,
    p_actor_user_id: actorUserId,
    p_remark: remark,
    p_issued_at: issuedAt,
  });

  if (rpcResult.error) {
    throw new ApiError(400, rpcResult.error.message || "ไม่สามารถบันทึกรายการเบิกเรือนจำได้");
  }

  return rpcResult.data || null;
}

export async function createProductionPrisonIssuesBatch(
  input,
  supabaseAdmin = getSupabaseAdmin()
) {
  const barcodes = Array.isArray(input?.barcodes)
    ? Array.from(
        new Set(input.barcodes.map((barcode) => normalizeText(barcode)).filter(Boolean))
      )
    : [];

  if (!barcodes.length) {
    throw new ApiError(400, "กรุณาเลือกรายการที่ต้องการเบิกออกเรือนจำ");
  }

  if (barcodes.length > 100) {
    throw new ApiError(400, "เลือกได้ไม่เกิน 100 รายการต่อครั้ง");
  }

  const succeeded = [];
  const failed = [];

  for (const barcode of barcodes) {
    try {
      const issue = await createProductionPrisonIssue(
        {
          barcode,
          actorUserId: input?.actorUserId,
          remark: input?.remark || "เบิกออกเรือนจำจากหน้ารายการเลือกหลายบาร์โค้ด",
          issuedAt: input?.issuedAt,
        },
        supabaseAdmin
      );

      succeeded.push(issue || { barcode });
    } catch (error) {
      failed.push({
        barcode,
        error: error?.message || "ไม่สามารถเบิกออกเรือนจำรายการนี้ได้",
      });
    }
  }

  if (!succeeded.length) {
    throw new ApiError(
      400,
      failed[0]?.error || "ไม่สามารถเบิกออกเรือนจำรายการที่เลือกได้"
    );
  }

  return {
    succeeded,
    failed,
    totalRequested: barcodes.length,
    successCount: succeeded.length,
    failedCount: failed.length,
  };
}

export async function cancelProductionPrisonIssueItem(
  input,
  supabaseAdmin = getSupabaseAdmin()
) {
  const issueItemId = normalizeText(input?.issueItemId);
  const actorUserId = normalizeText(input?.actorUserId) || null;
  const voidReason = normalizeText(input?.voidReason) || null;

  if (!issueItemId) {
    throw new ApiError(400, "ไม่พบรายการเบิกเรือนจำที่ต้องการยกเลิก");
  }

  const rpcResult = await supabaseAdmin.rpc("cancel_production_prison_issue_item", {
    p_prison_issue_item_id: issueItemId,
    p_actor_user_id: actorUserId,
    p_void_reason: voidReason,
  });

  if (rpcResult.error) {
    throw new ApiError(400, rpcResult.error.message || "ไม่สามารถยกเลิกรายการเบิกเรือนจำได้");
  }

  return rpcResult.data || null;
}

export async function cancelProductionPrisonInboundItem(
  input,
  supabaseAdmin = getSupabaseAdmin()
) {
  const inboundItemId = normalizeText(input?.inboundItemId);
  const actorUserId = normalizeText(input?.actorUserId) || null;
  const voidReason = normalizeText(input?.voidReason) || null;

  if (!inboundItemId) {
    throw new ApiError(400, "ไม่พบรายการรับเข้าเรือนจำที่ต้องการยกเลิก");
  }

  const rpcResult = await supabaseAdmin.rpc("cancel_production_prison_inbound_item", {
    p_source_issue_item_id: inboundItemId,
    p_actor_user_id: actorUserId,
    p_void_reason: voidReason,
  });

  if (rpcResult.error) {
    throw new ApiError(400, rpcResult.error.message || "ไม่สามารถยกเลิกชั่งเรือนจำได้");
  }

  return rpcResult.data || null;
}

export async function loadProductionPrisonIssueCancelPageData(
  supabaseAdmin = getSupabaseAdmin()
) {
  const todayIssueDate = getBangkokTodayInput();
  const cancelableData = await loadProductionPrisonIssueCancelableData(supabaseAdmin, {
    dateFrom: todayIssueDate,
    dateTo: todayIssueDate,
    page: 1,
    limit: 50,
  });

  return {
    ...cancelableData,
    todayIssueDate,
  };
}

export async function loadProductionPrisonIssueCancelableData(
  supabaseAdmin = getSupabaseAdmin(),
  {
    dateFrom = null,
    dateTo = null,
    productCodes = [],
    barcode = "",
    page = 1,
    limit = 50,
  } = {}
) {
  const scopeData = await loadScaleProductsData(supabaseAdmin);
  const scope = buildScopePayload(scopeData);
  const normalizedDateFrom = ensureOptionalIsoDate(dateFrom);
  const normalizedDateTo = ensureOptionalIsoDate(dateTo);
  const normalizedProductCodes = normalizeProductCodes(productCodes);
  const normalizedBarcode = normalizeBarcodeQuery(barcode);
  const normalizedPage = normalizePage(page, 1);
  const normalizedLimit = normalizeLimit(limit, 50);

  if (!scope.departmentId) {
    return {
      scope,
      rows: [],
      summary: {
        totalCount: 0,
        totalQuantity: 0,
        totalWeightKg: 0,
      },
      filters: buildBaseFilters({
        dateFrom: normalizedDateFrom || "",
        dateTo: normalizedDateTo || "",
        productCodes: normalizedProductCodes,
        barcode: normalizedBarcode,
      }),
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        totalCount: 0,
        totalPages: 0,
      },
    };
  }

  const allRows = await loadPrisonIssueRows(supabaseAdmin, {
    departmentId: scope.departmentId,
    categoryCode: scope.categoryCode,
    dateFrom: normalizedDateFrom,
    dateTo: normalizedDateTo,
    productCodes: normalizedProductCodes,
    barcodeQuery: normalizedBarcode,
  });

  const paged = paginateRows(allRows, normalizedPage, normalizedLimit);

  return {
    scope,
    rows: paged.rows,
    summary: buildSummary(allRows),
    filters: buildBaseFilters({
      dateFrom: normalizedDateFrom || "",
      dateTo: normalizedDateTo || "",
      productCodes: normalizedProductCodes,
      barcode: normalizedBarcode,
    }),
    pagination: paged.pagination,
  };
}

export async function loadProductionPrisonInboundCancelPageData(
  supabaseAdmin = getSupabaseAdmin()
) {
  const todayIssueDate = getBangkokTodayInput();
  const cancelableData = await loadProductionPrisonInboundCancelableData(supabaseAdmin, {
    dateFrom: todayIssueDate,
    dateTo: todayIssueDate,
    page: 1,
    limit: 50,
  });

  return {
    ...cancelableData,
    todayIssueDate,
  };
}

export async function loadProductionPrisonInboundCancelableData(
  supabaseAdmin = getSupabaseAdmin(),
  {
    dateFrom = null,
    dateTo = null,
    productCodes = [],
    barcode = "",
    page = 1,
    limit = 50,
  } = {}
) {
  const scopeData = await loadScaleProductsData(supabaseAdmin);
  const scope = buildScopePayload(scopeData);
  const normalizedDateFrom = ensureOptionalIsoDate(dateFrom);
  const normalizedDateTo = ensureOptionalIsoDate(dateTo);
  const normalizedProductCodes = normalizeProductCodes(productCodes);
  const normalizedBarcode = normalizeBarcodeQuery(barcode);
  const normalizedPage = normalizePage(page, 1);
  const normalizedLimit = normalizeLimit(limit, 50);

  if (!scope.departmentId) {
    return {
      scope,
      rows: [],
      summary: {
        totalCount: 0,
        totalQuantity: 0,
        totalWeightKg: 0,
      },
      filters: buildBaseFilters({
        dateFrom: normalizedDateFrom || "",
        dateTo: normalizedDateTo || "",
        productCodes: normalizedProductCodes,
        barcode: normalizedBarcode,
      }),
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        totalCount: 0,
        totalPages: 0,
      },
    };
  }

  const allRows = await loadPrisonInboundRows(supabaseAdmin, {
    departmentId: scope.departmentId,
    categoryCode: scope.categoryCode,
    dateFrom: normalizedDateFrom,
    dateTo: normalizedDateTo,
    productCodes: normalizedProductCodes,
    barcodeQuery: normalizedBarcode,
    onlyCancelable: true,
  });

  const paged = paginateRows(allRows, normalizedPage, normalizedLimit);

  return {
    scope,
    rows: paged.rows,
    summary: buildSummary(allRows),
    filters: buildBaseFilters({
      dateFrom: normalizedDateFrom || "",
      dateTo: normalizedDateTo || "",
      productCodes: normalizedProductCodes,
      barcode: normalizedBarcode,
    }),
    pagination: paged.pagination,
  };
}

export async function loadProductionPrisonIssueReportData(
  supabaseAdmin = getSupabaseAdmin(),
  {
    dateFrom = null,
    dateTo = null,
    issueStatuses = ["confirmed"],
    productCodes = [],
    page = 1,
    limit = 20,
    includeAll = false,
  } = {}
) {
  const scopeData = await loadScaleProductsData(supabaseAdmin);
  const scope = buildScopePayload(scopeData);
  const normalizedDateFrom = ensureIsoDate(dateFrom);
  const normalizedDateTo = ensureIsoDate(dateTo, normalizedDateFrom);
  const normalizedProductCodes = normalizeProductCodes(productCodes);
  const normalizedPage = normalizePage(page, 1);
  const normalizedLimit = normalizeLimit(limit, 20);

  if (!scope.departmentId) {
    return {
      scope,
      rows: [],
      summary: { totalCount: 0, totalQuantity: 0, totalWeightKg: 0 },
      filters: buildBaseFilters({
        dateFrom: normalizedDateFrom,
        dateTo: normalizedDateTo,
        issueStatuses,
        productCodes: normalizedProductCodes,
      }),
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        totalCount: 0,
        totalPages: 0,
      },
    };
  }

  const allRows = await loadPrisonIssueRows(supabaseAdmin, {
    departmentId: scope.departmentId,
    categoryCode: scope.categoryCode,
    dateFrom: normalizedDateFrom,
    dateTo: normalizedDateTo,
    productCodes: normalizedProductCodes,
    includeVoided: true,
  });

  // Filter out voided records for barcodes that have since been successfully re-issued (confirmed)
  const confirmedBarcodes = new Set(
    allRows
      .filter((row) => row.documentStatus === "confirmed" && row.itemStatus === "confirmed")
      .map((row) => row.barcode)
  );

  const activeRows = allRows.filter((row) => {
    const isConfirmed = row.documentStatus === "confirmed" && row.itemStatus === "confirmed";
    if (isConfirmed) return true;
    return !confirmedBarcodes.has(row.barcode);
  });

  const normalizedIssueStatuses = Array.isArray(issueStatuses) ? issueStatuses : [issueStatuses];
  const filteredRows = normalizedIssueStatuses.length
    ? activeRows.filter((row) => {
        const rowStatus = row.documentStatus === "confirmed" && row.itemStatus === "confirmed"
          ? "confirmed"
          : "voided";
        return normalizedIssueStatuses.includes(rowStatus);
      })
    : activeRows;

  const paged = paginateRows(filteredRows, normalizedPage, normalizedLimit, includeAll);

  return {
    scope,
    rows: paged.rows,
    summary: buildSummary(filteredRows),
    filters: buildBaseFilters({
      dateFrom: normalizedDateFrom,
      dateTo: normalizedDateTo,
      issueStatuses,
      productCodes: normalizedProductCodes,
    }),
    pagination: paged.pagination,
  };
}

export async function loadProductionPrisonIssueSummaryReportData(
  supabaseAdmin = getSupabaseAdmin(),
  {
    dateFrom = null,
    dateTo = null,
    issueStatuses = ["confirmed"],
    productCodes = [],
    page = 1,
    limit = 20,
    includeAll = false,
  } = {}
) {
  const reportData = await loadProductionPrisonIssueReportData(supabaseAdmin, {
    dateFrom,
    dateTo,
    issueStatuses,
    productCodes,
    page,
    limit,
    includeAll: true,
  });

  const allRows = buildPrisonIssueSummaryRows(reportData.rows);
  const paged = paginateRows(
    allRows,
    normalizePage(page, 1),
    normalizeLimit(limit, 20),
    includeAll
  );

  return {
    scope: reportData.scope,
    rows: paged.rows,
    summary: buildGroupedSummary(allRows),
    filters: reportData.filters,
    pagination: paged.pagination,
  };
}

export async function loadProductionPrisonLotBalanceReportData(
  supabaseAdmin = getSupabaseAdmin(),
  {
    dateFrom = null,
    dateTo = null,
    productCodes = [],
    page = 1,
    limit = 20,
    includeAll = false,
  } = {}
) {
  const scopeData = await loadScaleProductsData(supabaseAdmin);
  const scope = buildScopePayload(scopeData);
  const normalizedDateFrom = ensureIsoDate(dateFrom);
  const normalizedDateTo = ensureIsoDate(dateTo, normalizedDateFrom);
  const normalizedProductCodes = normalizeProductCodes(productCodes);
  const normalizedPage = normalizePage(page, 1);
  const normalizedLimit = normalizeLimit(limit, 20);

  if (!scope.departmentId) {
    return {
      scope,
      rows: [],
      summary: buildBalanceSummary([]),
      filters: buildBaseFilters({
        dateFrom: normalizedDateFrom,
        dateTo: normalizedDateTo,
        productCodes: normalizedProductCodes,
      }),
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        totalCount: 0,
        totalPages: 0,
      },
    };
  }

  const inboundRows = await loadPrisonInboundRows(supabaseAdmin, {
    departmentId: scope.departmentId,
    categoryCode: scope.categoryCode,
    dateTo: normalizedDateTo,
    productCodes: normalizedProductCodes,
  });
  const issueRows = await loadPrisonIssueRows(supabaseAdmin, {
    departmentId: scope.departmentId,
    categoryCode: scope.categoryCode,
    dateTo: normalizedDateTo,
    productCodes: normalizedProductCodes,
  });

  const allRows = buildPrisonLotBalanceRows(inboundRows, issueRows, normalizedDateFrom);
  const paged = paginateRows(allRows, normalizedPage, normalizedLimit, includeAll);

  return {
    scope,
    rows: paged.rows,
    summary: buildBalanceSummary(allRows),
    filters: buildBaseFilters({
      dateFrom: normalizedDateFrom,
      dateTo: normalizedDateTo,
      productCodes: normalizedProductCodes,
    }),
    pagination: paged.pagination,
  };
}

export async function loadProductionPrisonMovementSummaryReportData(
  supabaseAdmin = getSupabaseAdmin(),
  {
    dateFrom = null,
    dateTo = null,
    productCodes = [],
    page = 1,
    limit = 20,
    includeAll = false,
  } = {}
) {
  const scopeData = await loadScaleProductsData(supabaseAdmin);
  const scope = buildScopePayload(scopeData);
  const normalizedDateFrom = ensureIsoDate(dateFrom);
  const normalizedDateTo = ensureIsoDate(dateTo, normalizedDateFrom);
  const normalizedProductCodes = normalizeProductCodes(productCodes);
  const normalizedPage = normalizePage(page, 1);
  const normalizedLimit = normalizeLimit(limit, 20);

  if (!scope.departmentId) {
    return {
      scope,
      rows: [],
      summary: buildBalanceSummary([]),
      filters: buildBaseFilters({
        dateFrom: normalizedDateFrom,
        dateTo: normalizedDateTo,
        productCodes: normalizedProductCodes,
      }),
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        totalCount: 0,
        totalPages: 0,
      },
    };
  }

  const inboundRows = await loadPrisonInboundRows(supabaseAdmin, {
    departmentId: scope.departmentId,
    categoryCode: scope.categoryCode,
    dateFrom: normalizedDateFrom,
    dateTo: normalizedDateTo,
    productCodes: normalizedProductCodes,
  });
  const issueRows = await loadPrisonIssueRows(supabaseAdmin, {
    departmentId: scope.departmentId,
    categoryCode: scope.categoryCode,
    dateFrom: normalizedDateFrom,
    dateTo: normalizedDateTo,
    productCodes: normalizedProductCodes,
  });

  const allRows = buildPrisonMovementSummaryRows(inboundRows, issueRows);
  const paged = paginateRows(allRows, normalizedPage, normalizedLimit, includeAll);

  return {
    scope,
    rows: paged.rows,
    summary: buildBalanceSummary(allRows),
    filters: buildBaseFilters({
      dateFrom: normalizedDateFrom,
      dateTo: normalizedDateTo,
      productCodes: normalizedProductCodes,
    }),
    pagination: paged.pagination,
  };
}
