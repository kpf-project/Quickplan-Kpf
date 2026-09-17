import "server-only";
import { assertStockIssueHasNoChildren } from "@/lib/stock-issue-cancellation-guard";

import { ApiError, getSupabaseAdmin } from "@/lib/adminApi";
import {
  buildProductionStockIssueSummary,
  buildProductionStockIssueSummaryRows,
} from "@/lib/production-stock-issue-summary-rows";
import {
  loadScaleProductsData,
  SCALE_CATEGORY_CODE,
  SCALE_DEPARTMENT_CODE,
} from "@/lib/scale/products";
import { calculateProductionShift } from "@/lib/production-shift";
import { isRecordActiveAt, toBangkokReportCutoffIso } from "@/lib/record-status-as-of";
import {
  fetchAllSupabaseRows,
  fetchSupabaseRowsByChunks,
} from "@/lib/supabaseRangeFetch";

export const PRODUCTION_STOCK_ISSUE_TYPE_OPTIONS = Object.freeze([
  { value: "KPF", label: "เบิก KPF" },
  { value: "PB", label: "เบิก PB" },
  { value: "PRISON", label: "เบิกเรือนจำ" },
]);

export const PRODUCTION_STOCK_PRISON_ISSUE_TYPES = Object.freeze(["PRISON"]);

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

function isMissingProductionStockIssueError(error) {
  const code = normalizeUpperText(error?.code);
  const message = String(error?.message || "").toLowerCase();

  return (
    code === "42P01"
    || code === "42703"
    || code === "42883"
    || code === "PGRST200"
    || code === "PGRST204"
    || message.includes("production_stock_issue")
  );
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

function normalizeIssueType(value) {
  const normalizedValue = normalizeUpperText(value);
  if (!normalizedValue || normalizedValue === "ALL") {
    return null;
  }

  return PRODUCTION_STOCK_ISSUE_TYPE_OPTIONS.some((option) => option.value === normalizedValue)
    ? normalizedValue
    : null;
}

function normalizeIssueTypes(values) {
  if (!Array.isArray(values)) {
    const singleValue = normalizeIssueType(values);
    return singleValue ? [singleValue] : [];
  }

  return Array.from(
    new Set(values.map((value) => normalizeIssueType(value)).filter(Boolean))
  );
}

function normalizeIssueStatuses(values) {
  const normalizedValues = Array.isArray(values) ? values : [values];
  return Array.from(
    new Set(
      normalizedValues
        .map((value) => normalizeText(value).toLowerCase())
        .filter((value) => ["confirmed", "voided"].includes(value))
    )
  );
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

function getIssueTypeOptions(issueTypes = []) {
  if (!issueTypes.length) {
    return PRODUCTION_STOCK_ISSUE_TYPE_OPTIONS;
  }

  return PRODUCTION_STOCK_ISSUE_TYPE_OPTIONS.filter((option) =>
    issueTypes.includes(option.value)
  );
}

function normalizeIssueRow(row) {
  return {
    issueDocumentId: normalizeText(row?.issue_document_id),
    issueItemId: normalizeText(row?.issue_item_id),
    issueNo: normalizeText(row?.issue_no),
    departmentId: normalizeText(row?.department_id),
    departmentCode: normalizeText(row?.department_code),
    issueType: normalizeUpperText(row?.issue_type),
    issueDate: normalizeText(row?.issue_date),
    issuedAt: row?.issued_at || row?.document_issued_at || null,
    barcode: normalizeText(row?.barcode) || "-",
    productCode: normalizeUpperText(row?.product_code) || "-",
    productName: normalizeText(row?.product_name_snapshot) || "-",
    categoryCode: normalizeText(row?.category_code) || SCALE_CATEGORY_CODE,
    lotNo: normalizeText(row?.lot_no) || "-",
    quantity: normalizeDecimal(row?.quantity) || 0,
    weightKg: normalizeDecimal(row?.weight_kg) || 0,
    documentStatus: normalizeText(row?.document_status) || "confirmed",
    itemStatus: normalizeText(row?.item_status) || "confirmed",
    documentVoidedAt: row?.document_voided_at || null,
    itemVoidedAt: row?.voided_at || null,
    documentRestoredAt: row?.document_restored_at || null,
    itemRestoredAt: row?.item_restored_at || null,
    itemCreatedAt: row?.created_at || row?.issued_at || null,
  };
}

function buildIssueSummary(rows) {
  return rows.reduce(
    (summary, row) => {
      if (row.itemStatus !== "confirmed" || row.documentStatus !== "confirmed") {
        return summary;
      }

      return {
        totalCount: summary.totalCount + 1,
        totalQuantity: Number((summary.totalQuantity + (row.quantity || 0)).toFixed(3)),
        totalWeightKg: Number((summary.totalWeightKg + (row.weightKg || 0)).toFixed(3)),
      };
    },
    {
      totalCount: 0,
      totalQuantity: 0,
      totalWeightKg: 0,
    }
  );
}

function normalizeAvailableReceiptRow(row) {
  return {
    receiptId: normalizeText(row?.receiptId ?? row?.id),
    barcode: normalizeText(row?.barcode) || "-",
    productCode: normalizeUpperText(row?.productCode) || "-",
    productName: normalizeText(row?.productName) || "-",
    lotNo: normalizeText(row?.lotNo) || "-",
    quantity: 1,
    weightKg: normalizeDecimal(row?.weightKg ?? row?.netWeightKg) || 0,
    weighedAt: row?.weighedAt || null,
    itemStatus: normalizeText(row?.itemStatus) || "available",
  };
}

function buildAvailableReceiptSummary(rows) {
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

function normalizeDateStartIso(value) {
  const normalizedValue = ensureOptionalIsoDate(value);
  if (!normalizedValue) {
    return null;
  }

  return new Date(`${normalizedValue}T00:00:00+07:00`).toISOString();
}

function normalizeDateEndIso(value) {
  const normalizedValue = ensureOptionalIsoDate(value);
  if (!normalizedValue) {
    return null;
  }

  const date = new Date(`${normalizedValue}T00:00:00+07:00`);
  date.setDate(date.getDate() + 1);
  return date.toISOString();
}

async function loadProductConfigsForScope(supabaseAdmin, scope, productCodes = []) {
  if (!scope?.departmentId) {
    return {
      configIds: [],
      productByConfigId: new Map(),
    };
  }

  const scopeProductByCode = new Map(
    (Array.isArray(scope.products) ? scope.products : [])
      .map((product) => [
        normalizeUpperText(product.code),
        {
          code: normalizeUpperText(product.code),
          name: normalizeText(product.name),
          unit: normalizeText(product.unit),
        },
      ])
      .filter(([code]) => Boolean(code))
  );

  const allowedProductCodes = productCodes.length
    ? productCodes.filter((code) => scopeProductByCode.has(code))
    : Array.from(scopeProductByCode.keys());

  if (!allowedProductCodes.length) {
    return {
      configIds: [],
      productByConfigId: new Map(),
    };
  }

  const configRows = await fetchSupabaseRowsByChunks(
    allowedProductCodes,
    (productCodeChunk) => supabaseAdmin
      .from("production_weight_scale_products")
      .select("id,sku_code")
      .eq("department_id", scope.departmentId)
      .in("sku_code", productCodeChunk),
    {
      onError: () => {
        throw new Error("Failed to load product configs for issue picker");
      },
    }
  );

  const productByConfigId = new Map();
  const configIds = [];

  configRows.forEach((row) => {
    const skuCode = normalizeUpperText(row?.sku_code);
    const product = scopeProductByCode.get(skuCode);
    if (!row?.id || !product) {
      return;
    }

    configIds.push(row.id);
    productByConfigId.set(row.id, {
      productCode: skuCode,
      productName: product.name || skuCode,
      unit: product.unit,
    });
  });

  return {
    configIds,
    productByConfigId,
  };
}

async function loadLotNamesById(supabaseAdmin, lotIds) {
  const normalizedLotIds = Array.from(
    new Set(
      (Array.isArray(lotIds) ? lotIds : [])
        .map((lotId) => normalizeText(lotId))
        .filter(Boolean)
    )
  );

  if (!normalizedLotIds.length) {
    return new Map();
  }

  const lotRows = await fetchSupabaseRowsByChunks(
    normalizedLotIds,
    (lotIdChunk) => supabaseAdmin
      .from("production_weight_scale_lots")
      .select("id,lot_code")
      .in("id", lotIdChunk),
    {
      onError: () => {
        throw new Error("Failed to load lot names for issue picker");
      },
    }
  );

  return new Map(
    lotRows.map((row) => [
      normalizeText(row?.id),
      normalizeText(row?.lot_code) || "-",
    ])
  );
}

async function loadActiveIssuedReceiptIdSet(supabaseAdmin, receiptIds) {
  const normalizedReceiptIds = Array.from(
    new Set(
      (Array.isArray(receiptIds) ? receiptIds : [])
        .map((receiptId) => normalizeText(receiptId))
        .filter(Boolean)
    )
  );

  if (!normalizedReceiptIds.length) {
    return new Set();
  }

  const rawIssueRows = await fetchSupabaseRowsByChunks(
    normalizedReceiptIds,
    (receiptIdChunk) => supabaseAdmin
      .from("production_stock_issue_items")
      .select("source_receipt_id,issue_document_id,status")
      .in("source_receipt_id", receiptIdChunk)
      .eq("status", "confirmed"),
    {
      onError: (error) => {
        if (isMissingProductionStockIssueError(error)) {
          return [];
        }

        throw new Error("Failed to validate issued receipts for issue picker");
      },
    }
  );

  const issueRows = rawIssueRows.filter((row) =>
    normalizeText(row?.source_receipt_id)
    && normalizeText(row?.issue_document_id)
    && normalizeText(row?.status).toLowerCase() === "confirmed"
  );
  const documentIds = Array.from(
    new Set(issueRows.map((row) => normalizeText(row?.issue_document_id)).filter(Boolean))
  );

  if (!documentIds.length) {
    return new Set();
  }

  const documentRows = await fetchSupabaseRowsByChunks(
    documentIds,
    (documentIdChunk) => supabaseAdmin
      .from("production_stock_issue_documents")
      .select("id,status")
      .in("id", documentIdChunk)
      .eq("status", "confirmed"),
    {
      onError: (error) => {
        if (isMissingProductionStockIssueError(error)) {
          return [];
        }

        throw new Error("Failed to validate issued documents for issue picker");
      },
    }
  );

  const confirmedDocumentIds = new Set(
    documentRows
      .filter((row) => normalizeText(row?.status).toLowerCase() === "confirmed")
      .map((row) => normalizeText(row?.id))
      .filter(Boolean)
  );

  return new Set(
    issueRows
      .filter((row) => confirmedDocumentIds.has(normalizeText(row?.issue_document_id)))
      .map((row) => normalizeText(row?.source_receipt_id))
      .filter(Boolean)
  );
}

async function loadReceiptAvailableWeightMap(supabaseAdmin, receiptRows) {
  const receiptById = new Map(
    (Array.isArray(receiptRows) ? receiptRows : [])
      .map((row) => [normalizeText(row?.id), row])
      .filter(([receiptId]) => Boolean(receiptId))
  );
  const receiptIds = Array.from(receiptById.keys());

  if (!receiptIds.length) {
    return new Map();
  }

  const [movementRows, activeIssuedReceiptIds] = await Promise.all([
    fetchSupabaseRowsByChunks(
      receiptIds,
      (receiptIdChunk) => supabaseAdmin
        .from("production_stock_movements")
        .select("movement_type,weight_in_kg,weight_out_kg,metadata")
        .in("metadata->>sourceReceiptId", receiptIdChunk)
        .in("movement_type", ["issue_out", "adjustment_in"]),
      {
        onError: (error) => {
          if (isMissingProductionStockIssueError(error)) {
            return [];
          }

          throw new Error("Failed to calculate available issue balance");
        },
      }
    ),
    loadActiveIssuedReceiptIdSet(supabaseAdmin, receiptIds),
  ]);

  const movementByReceiptId = new Map();

  movementRows.forEach((movement) => {
    const receiptId = normalizeText(movement?.metadata?.sourceReceiptId);
    if (!receiptId) {
      return;
    }

    const current = movementByReceiptId.get(receiptId) || {
      issuedWeightKg: 0,
      restoredWeightKg: 0,
    };
    const movementType = normalizeText(movement?.movement_type);

    if (movementType === "issue_out") {
      current.issuedWeightKg = Number(
        (current.issuedWeightKg + normalizeDecimal(movement?.weight_out_kg)).toFixed(3)
      );
    }

    if (
      movementType === "adjustment_in"
      && normalizeText(movement?.metadata?.reversedMovementType) === "issue_out"
    ) {
      current.restoredWeightKg = Number(
        (current.restoredWeightKg + normalizeDecimal(movement?.weight_in_kg)).toFixed(3)
      );
    }

    movementByReceiptId.set(receiptId, current);
  });

  return new Map(
    receiptIds.map((receiptId) => {
      const receipt = receiptById.get(receiptId);
      const isActivelyIssued = activeIssuedReceiptIds.has(receiptId);
      const movement = movementByReceiptId.get(receiptId) || {
        issuedWeightKg: 0,
        restoredWeightKg: 0,
      };

      const effectiveIssuedWeight = isActivelyIssued
        ? Math.max(movement.issuedWeightKg, normalizeDecimal(receipt?.net_weight_kg))
        : movement.issuedWeightKg;

      const availableWeightKg = Math.max(
        normalizeDecimal(receipt?.net_weight_kg)
          - effectiveIssuedWeight
          + movement.restoredWeightKg,
        0
      );

      return [receiptId, Number(availableWeightKg.toFixed(3))];
    })
  );
}

function matchesAvailableReceiptSearch(row, search) {
  const normalizedSearch = normalizeText(search).toLowerCase();
  if (!normalizedSearch) {
    return true;
  }

  return [
    row.barcode,
    row.productCode,
    row.productName,
    row.lotNo,
  ].some((value) => normalizeText(value).toLowerCase().includes(normalizedSearch));
}

function isReturnReceiptMetadata(metadata) {
  return metadata && typeof metadata === "object" && metadata.isReturn === true;
}

async function loadIssueReturnProgressRows(supabaseAdmin, issueItemIds) {
  const normalizedIssueItemIds = Array.from(
    new Set(issueItemIds.map(normalizeText).filter(Boolean))
  );
  if (!normalizedIssueItemIds.length) {
    return [];
  }

  return fetchSupabaseRowsByChunks(
    normalizedIssueItemIds,
    (chunk) => supabaseAdmin
      .from("production_stock_return_progress_v")
      .select("source_issue_item_id,returned_quantity,returned_weight_kg,last_returned_at")
      .in("source_issue_item_id", chunk),
    {
      chunkSize: 500,
      onError: () => {
        throw new Error("Failed to load production stock return totals");
      },
    }
  );
}

async function loadIssueRowsForScope(
  supabaseAdmin,
  {
    departmentId,
    categoryCode,
    issueDate = null,
    dateFrom = null,
    dateTo = null,
    issueType = null,
    issueTypes = [],
    productCodes = [],
    barcodeQuery = "",
    includeVoided = false,
    includeIssueItemIds = [],
  } = {}
) {
  const normalizedIssueTypes = normalizeIssueTypes(
    issueTypes.length ? issueTypes : issueType ? [issueType] : []
  );

  const rows = await fetchAllSupabaseRows(
    () => {
      let query = supabaseAdmin
        .from("production_stock_issue_report_lines_v")
        .select(
          "issue_document_id,issue_item_id,issue_no,department_id,department_code,issue_type,issue_date,issued_at,document_issued_at,document_status,item_status,document_voided_at,voided_at,document_restored_at,item_restored_at,created_at,barcode,product_code,product_name_snapshot,category_code,lot_no,quantity,weight_kg"
        )
        .eq("department_id", departmentId)
        .eq("category_code", categoryCode)
        .order("issue_date", { ascending: true })
        .order("lot_no", { ascending: true })
        .order("product_code", { ascending: true })
        .order("issue_type", { ascending: true })
        .order("issued_at", { ascending: true })
        .order("issue_item_id", { ascending: true });

      if (!includeVoided) {
        query = query.eq("document_status", "confirmed").eq("item_status", "confirmed");
      }

      if (issueDate) {
        query = query.eq("issue_date", issueDate);
      } else {
        if (dateFrom && dateTo) {
          if (includeIssueItemIds.length > 0) {
            const formattedItemIds = includeIssueItemIds.map(id => `issue_item_id.eq.${id}`).join(",");
            query = query.or(`and(issue_date.gte.${dateFrom},issue_date.lte.${dateTo}),${formattedItemIds}`);
          } else {
            query = query.gte("issue_date", dateFrom).lte("issue_date", dateTo);
          }
        } else if (dateFrom) {
          if (includeIssueItemIds.length > 0) {
            const formattedItemIds = includeIssueItemIds.map(id => `issue_item_id.eq.${id}`).join(",");
            query = query.or(`issue_date.gte.${dateFrom},${formattedItemIds}`);
          } else {
            query = query.gte("issue_date", dateFrom);
          }
        } else if (dateTo) {
          if (includeIssueItemIds.length > 0) {
            const formattedItemIds = includeIssueItemIds.map(id => `issue_item_id.eq.${id}`).join(",");
            query = query.or(`issue_date.lte.${dateTo},${formattedItemIds}`);
          } else {
            query = query.lte("issue_date", dateTo);
          }
        }
      }

      if (normalizedIssueTypes.length === 1) {
        query = query.eq("issue_type", normalizedIssueTypes[0]);
      } else if (normalizedIssueTypes.length > 1) {
        query = query.in("issue_type", normalizedIssueTypes);
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
        if (isMissingProductionStockIssueError(error)) {
          return [];
        }

        throw new Error("Failed to load production stock issues");
      },
    }
  );

  return rows.map(normalizeIssueRow);
}

function buildIssueFilters({
  dateFrom,
  dateTo,
  issueTypes,
  issueStatuses = [],
  productCodes,
  barcode = "",
}) {
  return {
    dateFrom,
    dateTo,
    issueType: issueTypes.length === 1 ? issueTypes[0] : null,
    issueTypes,
    issueStatuses,
    productCodes,
    barcode,
  };
}

export async function loadProductionStockIssuePageData(
  supabaseAdmin = getSupabaseAdmin()
) {
  const scopeData = await loadScaleProductsData(supabaseAdmin);
  const scope = buildScopePayload(scopeData);

  if (!scope.departmentId) {
    return {
      scope,
      issueTypes: PRODUCTION_STOCK_ISSUE_TYPE_OPTIONS,
      todayIssueDate: getBangkokTodayInput(),
      recentIssues: [],
      summary: {
        totalCount: 0,
        totalQuantity: 0,
        totalWeightKg: 0,
        totalReturnQuantity: 0,
        totalReturnWeightKg: 0,
        totalActualQuantity: 0,
        totalActualWeightKg: 0,
      },
    };
  }

  const todayIssueDate = getBangkokTodayInput();
  const recentIssues = await loadIssueRowsForScope(supabaseAdmin, {
    departmentId: scope.departmentId,
    categoryCode: scope.categoryCode,
    issueDate: todayIssueDate,
  });

  return {
    scope,
    issueTypes: PRODUCTION_STOCK_ISSUE_TYPE_OPTIONS,
    todayIssueDate,
    recentIssues: recentIssues,
    summary: buildIssueSummary(recentIssues),
  };
}

export async function createProductionStockIssue(
  input,
  supabaseAdmin = getSupabaseAdmin()
) {
  const barcode = normalizeText(input?.barcode);
  const issueType = normalizeIssueType(input?.issueType);
  const actorUserId = normalizeText(input?.actorUserId) || null;
  const remark = normalizeText(input?.remark) || null;

  if (!barcode) {
    throw new ApiError(400, "กรุณากรอกหรือสแกนรหัสบาร์โค้ด");
  }

  if (!issueType) {
    throw new ApiError(400, "กรุณาเลือกประเภทการเบิก");
  }

  const customDateStr = input?.issueDate ? `${input.issueDate}T12:00:00Z` : null;
  const weighedAt = customDateStr || new Date().toISOString();
  const { productionDate, shift } = calculateProductionShift(weighedAt);
  const shiftLabel = `Shift ${shift} (${productionDate})`;
  const finalRemark = remark ? `${remark} | ${shiftLabel}` : shiftLabel;

  const rpcResult = await supabaseAdmin.rpc("create_production_stock_issue", {
    p_barcode: barcode,
    p_issue_type: issueType,
    p_actor_user_id: actorUserId,
    p_remark: finalRemark,
    p_issue_date: input?.issueDate || null,
  });

  if (rpcResult.error) {
    throw new ApiError(400, rpcResult.error.message || "ไม่สามารถบันทึกรายการเบิกได้");
  }

  return rpcResult.data || null;
}

export async function createProductionStockIssuesBatch(
  input,
  supabaseAdmin = getSupabaseAdmin()
) {
  const barcodes = Array.isArray(input?.barcodes)
    ? Array.from(
        new Set(input.barcodes.map((barcode) => normalizeText(barcode)).filter(Boolean))
      )
    : [];

  if (!barcodes.length) {
    throw new ApiError(400, "กรุณาเลือกรายการที่ต้องการเบิก");
  }

  if (barcodes.length > 100) {
    throw new ApiError(400, "เลือกได้ไม่เกิน 100 รายการต่อครั้ง");
  }

  const rpcResult = await supabaseAdmin.rpc("create_production_stock_issue_batch_atomic", {
    p_barcodes: barcodes,
    p_issue_type: input?.issueType,
    p_actor_user_id: input?.actorUserId || null,
    p_remark: input?.remark || "เบิกจากหน้ารายการเลือกหลายบาร์โค้ด",
    p_issue_date: input?.issueDate || null,
  });
  if (rpcResult.error) {
    throw new ApiError(400, rpcResult.error.message || "ไม่สามารถเบิกรายการที่เลือกได้");
  }
  const succeeded = Array.isArray(rpcResult.data) ? rpcResult.data : [];

  return {
    succeeded,
    failed: [],
    totalRequested: barcodes.length,
    successCount: succeeded.length,
    failedCount: 0,
  };
}

export async function cancelProductionStockIssueItem(
  input,
  supabaseAdmin = getSupabaseAdmin()
) {
  const issueItemId = normalizeText(input?.issueItemId);
  const actorUserId = normalizeText(input?.actorUserId) || null;
  const voidReason = normalizeText(input?.voidReason) || null;

  if (!issueItemId) {
    throw new ApiError(400, "ไม่พบรายการเบิกที่ต้องการยกเลิก");
  }

  try {
    await assertStockIssueHasNoChildren(supabaseAdmin, issueItemId);
  } catch (error) {
    throw new ApiError(400, error.message);
  }

  const rpcResult = await supabaseAdmin.rpc("cancel_production_stock_issue_item", {
    p_issue_item_id: issueItemId,
    p_actor_user_id: actorUserId,
    p_void_reason: voidReason,
  });

  if (rpcResult.error) {
    throw new ApiError(400, rpcResult.error.message || "ไม่สามารถยกเลิกรายการเบิกได้");
  }

  return rpcResult.data || null;
}

export async function loadProductionStockIssueReportData(
  supabaseAdmin = getSupabaseAdmin(),
  {
    dateFrom = null,
    dateTo = null,
    issueType = null,
    issueTypes = [],
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
  const normalizedIssueTypes = normalizeIssueTypes(
    issueTypes.length ? issueTypes : issueType ? [issueType] : []
  );
  const normalizedIssueStatuses = normalizeIssueStatuses(issueStatuses);
  const normalizedProductCodes = normalizeProductCodes(productCodes);
  const normalizedPage = normalizePage(page, 1);
  const normalizedLimit = normalizeLimit(limit, 20);

  if (!scope.departmentId) {
    return {
      scope,
      issueTypes: getIssueTypeOptions(normalizedIssueTypes),
      rows: [],
      summary: {
        totalCount: 0,
        totalQuantity: 0,
        totalWeightKg: 0,
      },
      filters: buildIssueFilters({
        dateFrom: normalizedDateFrom,
        dateTo: normalizedDateTo,
        issueTypes: normalizedIssueTypes,
        issueStatuses: normalizedIssueStatuses,
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

  const allRows = await loadIssueRowsForScope(supabaseAdmin, {
    departmentId: scope.departmentId,
    categoryCode: scope.categoryCode,
    dateFrom: normalizedDateFrom,
    dateTo: normalizedDateTo,
    issueTypes: normalizedIssueTypes,
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

  const filteredRows = normalizedIssueStatuses.length
    ? activeRows.filter((row) => {
        const rowStatus = row.documentStatus === "confirmed" && row.itemStatus === "confirmed"
          ? "confirmed"
          : "voided";
        return normalizedIssueStatuses.includes(rowStatus);
      })
    : activeRows;

  const totalCount = filteredRows.length;
  const totalPages = totalCount ? Math.ceil(totalCount / normalizedLimit) : 0;
  const resolvedPage = totalPages ? Math.min(normalizedPage, totalPages) : 1;
  const rows = includeAll
    ? filteredRows
    : filteredRows.slice(
        (resolvedPage - 1) * normalizedLimit,
        resolvedPage * normalizedLimit
      );

  return {
    scope,
    issueTypes: getIssueTypeOptions(normalizedIssueTypes),
    rows,
    summary: buildIssueSummary(filteredRows),
    filters: buildIssueFilters({
      dateFrom: normalizedDateFrom,
      dateTo: normalizedDateTo,
      issueTypes: normalizedIssueTypes,
      issueStatuses: normalizedIssueStatuses,
      productCodes: normalizedProductCodes,
    }),
    pagination: {
      page: resolvedPage,
      limit: normalizedLimit,
      totalCount,
      totalPages,
    },
  };
}

export async function loadProductionStockIssueSummaryReportData(
  supabaseAdmin = getSupabaseAdmin(),
  {
    dateFrom = null,
    dateTo = null,
    issueType = null,
    issueTypes = [],
    issueStatuses = ["confirmed"],
    productCodes = [],
    page = 1,
    limit = 20,
    includeAll = false,
    asOfDate = null,
  } = {}
) {
  const scopeData = await loadScaleProductsData(supabaseAdmin);
  const scope = buildScopePayload(scopeData);
  const normalizedDateFrom = ensureIsoDate(dateFrom);
  const normalizedDateTo = ensureIsoDate(dateTo, normalizedDateFrom);
  const normalizedIssueTypes = normalizeIssueTypes(
    issueTypes.length ? issueTypes : issueType ? [issueType] : []
  );
  const normalizedIssueStatuses = normalizeIssueStatuses(issueStatuses);
  const normalizedProductCodes = normalizeProductCodes(productCodes);
  const asOfCutoff = toBangkokReportCutoffIso(asOfDate);
  const normalizedPage = normalizePage(page, 1);
  const normalizedLimit = normalizeLimit(limit, 20);

  if (!scope.departmentId) {
    return {
      scope,
      issueTypes: getIssueTypeOptions(normalizedIssueTypes),
      rows: [],
      summary: {
        totalCount: 0,
        totalQuantity: 0,
        totalWeightKg: 0,
      },
      filters: buildIssueFilters({
        dateFrom: normalizedDateFrom,
        dateTo: normalizedDateTo,
        issueTypes: normalizedIssueTypes,
        issueStatuses: normalizedIssueStatuses,
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

  // Fetch issue item ids that had return movements in the date range
  let returnIssueItemIds = [];
  if (normalizedDateFrom || normalizedDateTo) {
    let returnMovementsQuery = supabaseAdmin
      .from("production_stock_movements")
      .select("metadata")
      .eq("movement_type", "return_in")
      .eq("department_id", scope.departmentId)
      .eq("category_code", scope.categoryCode);

    if (normalizedProductCodes.length) {
      returnMovementsQuery = returnMovementsQuery.in("product_code", normalizedProductCodes);
    }
    if (normalizedDateFrom) {
      returnMovementsQuery = returnMovementsQuery.gte("movement_date", normalizedDateFrom);
    }
    if (normalizedDateTo) {
      returnMovementsQuery = returnMovementsQuery.lte("movement_date", normalizedDateTo);
    }

    const { data: returnMovementsData, error: returnMovementsError } = await returnMovementsQuery;
    if (!returnMovementsError && returnMovementsData && returnMovementsData.length > 0) {
      returnIssueItemIds = Array.from(
        new Set(
          returnMovementsData
            .map((m) => m.metadata?.sourceIssueItemId)
            .filter(Boolean)
        )
      );
    }
  }

  const issueRows = await loadIssueRowsForScope(supabaseAdmin, {
    departmentId: scope.departmentId,
    categoryCode: scope.categoryCode,
    dateFrom: normalizedDateFrom,
    dateTo: normalizedDateTo,
    issueTypes: normalizedIssueTypes,
    productCodes: normalizedProductCodes,
    includeVoided: normalizedIssueStatuses.includes("voided") || Boolean(asOfCutoff),
    includeIssueItemIds: returnIssueItemIds,
  });

  const statusAdjustedIssueRows = asOfCutoff
    ? issueRows.map((row) => {
        const activeAtCutoff = isRecordActiveAt(
          row.itemStatus,
          row.itemVoidedAt,
          asOfCutoff,
          row.itemCreatedAt,
          row.itemRestoredAt
        ) && isRecordActiveAt(
          row.documentStatus,
          row.documentVoidedAt,
          asOfCutoff,
          row.issuedAt,
          row.documentRestoredAt
        );
        return {
          ...row,
          itemStatus: activeAtCutoff ? "confirmed" : "voided",
          documentStatus: activeAtCutoff ? "confirmed" : "voided",
        };
      })
    : issueRows;
  const filteredIssueRows = normalizedIssueStatuses.length
    ? statusAdjustedIssueRows.filter((row) => {
        const rowStatus = row.documentStatus === "confirmed" && row.itemStatus === "confirmed"
          ? "confirmed"
          : "voided";
        return normalizedIssueStatuses.includes(rowStatus);
      })
    : statusAdjustedIssueRows;

  const returnProgressRows = await loadIssueReturnProgressRows(
    supabaseAdmin,
    filteredIssueRows.map((row) => row.issueItemId)
  );
  const returnProgressByIssueItemId = new Map(
    returnProgressRows.map((row) => {
      let returnDate = null;
      if (row?.last_returned_at) {
        returnDate = calculateProductionShift(row.last_returned_at).productionDate;
      }
      return [
        normalizeText(row?.source_issue_item_id),
        {
          returnQuantity: normalizeDecimal(row?.returned_quantity) || 0,
          returnWeightKg: normalizeDecimal(row?.returned_weight_kg) || 0,
          returnDate,
        },
      ];
    })
  );
  const rowsWithReturns = filteredIssueRows.map((row) => ({
    ...row,
    ...(returnProgressByIssueItemId.get(row.issueItemId) || {
      returnQuantity: 0,
      returnWeightKg: 0,
      returnDate: null,
    }),
  }));
  const unfilteredRows = buildProductionStockIssueSummaryRows(rowsWithReturns);
  const allRows = unfilteredRows.filter((row) => {
    if (normalizedDateFrom && row.issueDate < normalizedDateFrom) return false;
    if (normalizedDateTo && row.issueDate > normalizedDateTo) return false;
    return true;
  });
  const totalCount = allRows.length;
  const totalPages = totalCount ? Math.ceil(totalCount / normalizedLimit) : 0;
  const resolvedPage = totalPages ? Math.min(normalizedPage, totalPages) : 1;
  const rows = includeAll
    ? allRows
    : allRows.slice(
        (resolvedPage - 1) * normalizedLimit,
        resolvedPage * normalizedLimit
      );

  return {
    scope,
    issueTypes: getIssueTypeOptions(normalizedIssueTypes),
    rows,
    summary: buildProductionStockIssueSummary(allRows),
    filters: buildIssueFilters({
      dateFrom: normalizedDateFrom,
      dateTo: normalizedDateTo,
      issueTypes: normalizedIssueTypes,
      issueStatuses: normalizedIssueStatuses,
      productCodes: normalizedProductCodes,
    }),
    pagination: {
      page: resolvedPage,
      limit: normalizedLimit,
      totalCount,
      totalPages,
    },
  };
}

export async function loadProductionStockIssueCancelPageData(
  supabaseAdmin = getSupabaseAdmin()
) {
  const todayIssueDate = getBangkokTodayInput();
  const cancelableData = await loadProductionStockIssueCancelableData(supabaseAdmin, {
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

export async function loadProductionStockIssueAvailableReceiptData(
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
  const normalizedProductCodes = normalizeProductCodes(productCodes);
  const normalizedSearch = normalizeText(search);
  const normalizedPage = normalizePage(page, 1);
  const normalizedLimit = normalizeLimit(limit, 50);
  const candidateLimit = Math.min(Math.max(normalizedPage * normalizedLimit * 4, 300), 1200);

  if (!scope.departmentId) {
    return {
      scope,
      rows: [],
      summary: buildAvailableReceiptSummary([]),
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

  const configContext = await loadProductConfigsForScope(
    supabaseAdmin,
    scope,
    normalizedProductCodes
  );

  if (!configContext.configIds.length) {
    return {
      scope,
      rows: [],
      summary: buildAvailableReceiptSummary([]),
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

  const receiptRows = await fetchAllSupabaseRows(
    () => {
      let query = supabaseAdmin
        .from("production_weight_receipts")
        .select("id,product_config_id,lot_id,barcode,net_weight_kg,weighed_at,status,metadata")
        .eq("status", "recorded")
        .in("product_config_id", configContext.configIds)
        .order("barcode", { ascending: true });

      const startIso = normalizeDateStartIso(normalizedDateFrom);
      const endIso = normalizeDateEndIso(normalizedDateTo || normalizedDateFrom);

      if (startIso) {
        query = query.gte("weighed_at", startIso);
      }

      if (endIso) {
        query = query.lt("weighed_at", endIso);
      }

      return query;
    },
    {
      onError: (error) => {
        console.error("loadProductionStockIssueAvailableReceiptData query error:", error);
        throw new Error("Failed to load available receipts for issue picker");
      },
    }
  );
  const allReceiptRows = receiptRows || [];
  const originalReceiptRows = allReceiptRows.filter(
    (row) => !isReturnReceiptMetadata(row?.metadata)
  );
  const returnReceiptRows = allReceiptRows.filter((row) =>
    isReturnReceiptMetadata(row?.metadata)
  );
  const [lotById, originalAvailableWeightByReceiptId, activeReturnReceiptIds] = await Promise.all([
    loadLotNamesById(supabaseAdmin, allReceiptRows.map((row) => row.lot_id)),
    loadReceiptAvailableWeightMap(supabaseAdmin, originalReceiptRows),
    loadActiveIssuedReceiptIdSet(
      supabaseAdmin,
      returnReceiptRows.map((row) => row.id)
    ),
  ]);
  const availableWeightByReceiptId = new Map(originalAvailableWeightByReceiptId);

  returnReceiptRows.forEach((row) => {
    const receiptId = normalizeText(row?.id);
    const availableWeightKg = activeReturnReceiptIds.has(receiptId)
      ? 0
      : normalizeDecimal(row?.net_weight_kg);
    availableWeightByReceiptId.set(receiptId, availableWeightKg);
  });

  const allRows = allReceiptRows
    .filter((row) => (availableWeightByReceiptId.get(normalizeText(row?.id)) || 0) > 0)
    .map((row) => {
      const product = configContext.productByConfigId.get(row.product_config_id) || {};
      const availableWeightKg = availableWeightByReceiptId.get(normalizeText(row?.id)) || 0;
      return normalizeAvailableReceiptRow({
        id: row.id,
        barcode: row.barcode,
        productCode: product.productCode,
        productName: product.productName,
        lotNo: lotById.get(normalizeText(row.lot_id)) || "-",
        netWeightKg: availableWeightKg,
        weighedAt: row.weighed_at,
        itemStatus: "available",
      });
    })
    .filter((row) => matchesAvailableReceiptSearch(row, normalizedSearch));

  const totalCount = allRows.length;
  const totalPages = totalCount ? Math.ceil(totalCount / normalizedLimit) : 0;
  const resolvedPage = totalPages ? Math.min(normalizedPage, totalPages) : 1;
  const rows = allRows.slice(
    (resolvedPage - 1) * normalizedLimit,
    resolvedPage * normalizedLimit
  );
  const summary = buildAvailableReceiptSummary(allRows);

  return {
    scope,
    rows,
    summary,
    filters: {
      dateFrom: normalizedDateFrom || "",
      dateTo: normalizedDateTo || "",
      search: normalizedSearch,
      productCodes: normalizedProductCodes,
    },
    pagination: {
      page: resolvedPage,
      limit: normalizedLimit,
      totalCount,
      totalPages,
    },
  };
}

export async function loadProductionStockIssueCancelableData(
  supabaseAdmin = getSupabaseAdmin(),
  {
    dateFrom = null,
    dateTo = null,
    issueType = null,
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
  const normalizedIssueType = normalizeIssueType(issueType);
  const normalizedProductCodes = normalizeProductCodes(productCodes);
  const normalizedBarcode = normalizeBarcodeQuery(barcode);
  const normalizedPage = normalizePage(page, 1);
  const normalizedLimit = normalizeLimit(limit, 50);

  if (!scope.departmentId) {
    return {
      scope,
      issueTypes: PRODUCTION_STOCK_ISSUE_TYPE_OPTIONS,
      rows: [],
      summary: {
        totalCount: 0,
        totalQuantity: 0,
        totalWeightKg: 0,
      },
      filters: {
        dateFrom: normalizedDateFrom || "",
        dateTo: normalizedDateTo || "",
        issueType: normalizedIssueType,
        productCodes: normalizedProductCodes,
        barcode: normalizedBarcode,
      },
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        totalCount: 0,
        totalPages: 0,
      },
    };
  }

  const allRows = await loadIssueRowsForScope(supabaseAdmin, {
    departmentId: scope.departmentId,
    categoryCode: scope.categoryCode,
    dateFrom: normalizedDateFrom,
    dateTo: normalizedDateTo,
    issueType: normalizedIssueType,
    productCodes: normalizedProductCodes,
    barcodeQuery: normalizedBarcode,
  });

  const totalCount = allRows.length;
  const totalPages = totalCount ? Math.ceil(totalCount / normalizedLimit) : 0;
  const resolvedPage = totalPages ? Math.min(normalizedPage, totalPages) : 1;
  const rows = allRows.slice(
    (resolvedPage - 1) * normalizedLimit,
    resolvedPage * normalizedLimit
  );

  return {
    scope,
    issueTypes: PRODUCTION_STOCK_ISSUE_TYPE_OPTIONS,
    rows,
    summary: buildIssueSummary(allRows),
    filters: {
      dateFrom: normalizedDateFrom || "",
      dateTo: normalizedDateTo || "",
      issueType: normalizedIssueType,
      productCodes: normalizedProductCodes,
      barcode: normalizedBarcode,
    },
    pagination: {
      page: resolvedPage,
      limit: normalizedLimit,
      totalCount,
      totalPages,
    },
  };
}
