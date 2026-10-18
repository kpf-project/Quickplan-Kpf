import "server-only";

import { getSupabaseAdmin } from "@/lib/adminApi";
import {
  isMissingScaleCatalogError,
  normalizeScaleSkuCode,
} from "@/lib/scale/catalog";
import { calculateProductionShift } from "@/lib/production-shift";
import { isRecordActiveAt, toBangkokReportCutoffIso } from "@/lib/record-status-as-of";
import { buildAutoScaleLotNo } from "@/features/production-line/services/scaleLotNumber";
import {
  matchesScaleReceiptReportStatus,
  normalizeScaleReceiptReportStatus,
} from "@/lib/scale/receipt-report-status";
import {
  fetchAllSupabaseRows,
  fetchSupabaseRowsByChunks,
} from "@/lib/supabaseRangeFetch";
import {
  toScaleReceiptIsoDateBounds,
  toScaleReceiptIsoDateRange,
} from "@/lib/scale/date-range";

function normalizeWeight(value) {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  if (!Number.isFinite(parsed)) {
    return null;
  }
  return Number(parsed.toFixed(3));
}

function normalizeInteger(value) {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeOptionalText(value) {
  const nextValue = String(value || "").trim();
  return nextValue || null;
}

function normalizeBarcodeProductCode(value) {
  const normalizedValue = String(value || "").trim().toUpperCase();
  if (/^\d{4}$/.test(normalizedValue)) {
    return normalizedValue;
  }

  const skuDigits = normalizeScaleSkuCode(value).replace(/\D/g, "");
  if (!skuDigits) {
    return "0000";
  }

  return skuDigits.slice(-4).padStart(4, "0");
}

function resolveReceiptBusinessDate(value = new Date()) {
  const baseDate = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(baseDate.getTime())) {
    return new Date();
  }

  const businessDate = new Date(baseDate);
  if (businessDate.getHours() < 7) {
    businessDate.setDate(businessDate.getDate() - 1);
  }

  return businessDate;
}

function formatLegacyBarcodeDate(value = new Date()) {
  const businessDate = resolveReceiptBusinessDate(value);
  const day = String(businessDate.getDate()).padStart(2, "0");
  const month = String(businessDate.getMonth() + 1).padStart(2, "0");
  const year = String(businessDate.getFullYear()).slice(-2);
  return `${day}${month}${year}`;
}

function buildReceiptBarcodePrefix({ skuCode, weighedAt, metadata = {} }) {
  return `${formatLegacyBarcodeDate(weighedAt)}${normalizeBarcodeProductCode(
    metadata?.barcodeProductCode || skuCode
  )}`;
}

function buildReceiptBarcode({ skuCode, weighedAt, metadata = {}, runNumber = 1 }) {
  const prefix = buildReceiptBarcodePrefix({
    skuCode,
    weighedAt,
    metadata,
  });
  const safeRunNumber = Number.isFinite(Number(runNumber)) && Number(runNumber) > 0
    ? Number(runNumber)
    : 1;
  return `${prefix}${String(safeRunNumber).padStart(4, "0")}`;
}

function parseReceiptBarcodeRunNumber(barcode, prefix) {
  const normalizedBarcode = String(barcode || "").trim();
  const normalizedPrefix = String(prefix || "").trim();
  if (!normalizedBarcode.startsWith(normalizedPrefix)) {
    return 0;
  }

  const suffix = normalizedBarcode.slice(normalizedPrefix.length);
  if (!/^\d+$/.test(suffix)) {
    return 0;
  }

  return Number.parseInt(suffix, 10);
}

function isUniqueBarcodeViolation(error) {
  const code = String(error?.code || "").trim();
  const message = String(error?.message || "").toLowerCase();
  return (
    code === "23505"
    || message.includes("duplicate key")
    || message.includes("production_weight_receipts_barcode_uidx")
  );
}

function normalizeSearchTerm(value) {
  return String(value || "").trim().toLowerCase();
}

function isRecordedReceiptStatus(status) {
  return String(status || "").trim().toLowerCase() === "recorded";
}

function isReturnReceipt(receipt) {
  return Boolean(receipt?.isReturn);
}

function normalizeReceiptItemStatusFilter(value) {
  return normalizeScaleReceiptReportStatus(value);
}

function formatBangkokGroupingDateKey(value) {
  if (!value) {
    return "";
  }

  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function normalizeSkuCodeList(values) {
  if (!Array.isArray(values)) {
    return [];
  }

  return Array.from(
    new Set(
      values
        .map((value) => normalizeScaleSkuCode(value))
        .filter(Boolean)
    )
  );
}

function matchesReceiptSearch(receipt, searchTerm) {
  if (!searchTerm) {
    return true;
  }

  const searchableValues = [
    receipt?.barcode,
    receipt?.productCode,
    receipt?.productName,
    receipt?.lotNo,
    receipt?.status,
  ];

  return searchableValues.some((value) =>
    String(value || "").trim().toLowerCase().includes(searchTerm)
  );
}

function buildReceiptSummary(receipts) {
  const summary = receipts.reduce(
    (accumulator, receipt) => {
      if (!isRecordedReceiptStatus(receipt?.status)) {
        return accumulator;
      }

      const nextNetWeight = normalizeWeight(receipt?.netWeightKg) ?? 0;
      return {
        totalCount: accumulator.totalCount + 1,
        actualCount: accumulator.actualCount + (receipt?.isTest ? 0 : 1),
        testCount: accumulator.testCount + (receipt?.isTest ? 1 : 0),
        totalNetWeightKg: Number((accumulator.totalNetWeightKg + nextNetWeight).toFixed(3)),
      };
    },
    {
      totalCount: 0,
      actualCount: 0,
      testCount: 0,
      totalNetWeightKg: 0,
    }
  );

  return summary;
}

function buildScaleReceiptSummaryRows(receipts, { chunkSize = null } = {}) {
  const normalizedChunkSize =
    Number.isFinite(Number(chunkSize)) && Number(chunkSize) > 0
      ? Math.floor(Number(chunkSize))
      : null;
  const groupedRows = [];
  const groupedMap = new Map();

  receipts.forEach((receipt) => {
    if (!isRecordedReceiptStatus(receipt?.status) || isReturnReceipt(receipt)) {
      return;
    }

    const groupDate = formatBangkokGroupingDateKey(receipt?.weighedAt) || "-";
    const lotNo = String(receipt?.lotNo || "").trim() || "-";
    const productCode = normalizeScaleSkuCode(receipt?.productCode) || "-";
    const productName = String(receipt?.productName || "").trim() || "-";
    const groupKey = `${groupDate}|${lotNo}|${productCode}|${productName}`;

    if (!groupedMap.has(groupKey)) {
      const groupedRow = {
        groupKey,
        groupDate,
        lotNo,
        productCode,
        productName,
        receipts: [],
        quantity: 0,
        totalNetWeightKg: 0,
      };
      groupedMap.set(groupKey, groupedRow);
      groupedRows.push(groupedRow);
    }

    const groupedRow = groupedMap.get(groupKey);
    groupedRow.receipts.push(receipt);
    groupedRow.quantity += 1;
    groupedRow.totalNetWeightKg = Number(
      (groupedRow.totalNetWeightKg + (normalizeWeight(receipt?.netWeightKg) ?? 0)).toFixed(3)
    );
  });

  return groupedRows.flatMap((row) => {
    const productDisplay =
      row.productCode && row.productCode !== "-"
        ? `${row.productCode} - ${row.productName}`
        : row.productName;

    if (!normalizedChunkSize) {
      const summaryRow = { ...row };
      delete summaryRow.receipts;
      return [
        {
          ...summaryRow,
          productDisplay,
        },
      ];
    }

    const summaryChunks = [];
    for (let index = 0; index < row.receipts.length; index += normalizedChunkSize) {
      const receiptChunk = row.receipts.slice(index, index + normalizedChunkSize);
      const totalNetWeightKg = receiptChunk.reduce(
        (accumulator, receipt) =>
          Number((accumulator + (normalizeWeight(receipt?.netWeightKg) ?? 0)).toFixed(3)),
        0
      );

      summaryChunks.push({
        groupKey: `${row.groupKey}|chunk-${summaryChunks.length + 1}`,
        parentGroupKey: row.groupKey,
        groupDate: row.groupDate,
        lotNo: row.lotNo,
        productCode: row.productCode,
        productName: row.productName,
        productDisplay,
        batchNo: summaryChunks.length + 1,
        quantity: receiptChunk.length,
        totalNetWeightKg,
      });
    }

    return summaryChunks;
  });
}

function buildCancelableReceiptSummary(receipts) {
  return receipts.reduce(
    (accumulator, receipt) => ({
      totalCount: accumulator.totalCount + 1,
      totalNetWeightKg: Number(
        (accumulator.totalNetWeightKg + (normalizeWeight(receipt?.netWeightKg) ?? 0)).toFixed(3)
      ),
    }),
    {
      totalCount: 0,
      totalNetWeightKg: 0,
    }
  );
}

function isMissingStockIssueError(error) {
  const code = String(error?.code || "").trim().toUpperCase();
  const message = String(error?.message || "").toLowerCase();

  return (
    code === "42P01"
    || code === "42703"
    || code === "PGRST200"
    || code === "PGRST204"
    || message.includes("production_stock_issue_report_lines_v")
    || message.includes("production_stock_issue_items")
    || message.includes("production_stock_issue_documents")
  );
}

async function loadActiveIssuedReceiptIdsFromReportView(supabaseAdmin, receiptIds) {
  const issueRows = await fetchSupabaseRowsByChunks(
    receiptIds,
    (receiptIdChunk) => supabaseAdmin
      .from("production_stock_issue_report_lines_v")
      .select("source_receipt_id,document_status,item_status")
      .in("source_receipt_id", receiptIdChunk),
    {
      onError: (error) => {
        if (isMissingStockIssueError(error)) {
          return null;
        }

        console.warn("[scale-receipts] Failed to validate issued receipts from report view", {
          code: error.code,
          message: error.message,
          details: error.details,
        });

        return null;
      },
    }
  );

  if (!issueRows) {
    return null;
  }

  return new Set(
    issueRows
      .filter(
        (row) =>
          String(row?.document_status || "").trim().toLowerCase() === "confirmed"
          && String(row?.item_status || "").trim().toLowerCase() === "confirmed"
      )
      .map((row) => String(row?.source_receipt_id || "").trim())
      .filter(Boolean)
  );
}

async function generateReceiptBarcode(
  supabaseAdmin,
  { skuCode, weighedAt, metadata = {} }
) {
  const prefix = buildReceiptBarcodePrefix({
    skuCode,
    weighedAt,
    metadata,
  });

  const latestBarcodeResult = await supabaseAdmin
    .from("production_weight_receipts")
    .select("barcode")
    .like("barcode", `${prefix}%`)
    .order("barcode", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestBarcodeResult.error) {
    throw new Error("Failed to generate weight scale receipt barcode");
  }

  const nextRunNumber =
    parseReceiptBarcodeRunNumber(latestBarcodeResult.data?.barcode, prefix) + 1;

  return buildReceiptBarcode({
    skuCode,
    weighedAt,
    metadata,
    runNumber: nextRunNumber,
  });
}

function normalizeReceiptRecord(record, productByConfigId, lotById, productNameBySku) {
  const product = productByConfigId.get(record.product_config_id) || null;
  const skuCode = normalizeScaleSkuCode(product?.skuCode);
  const lot = lotById.get(record.lot_id) || null;
  const metadata =
    record?.metadata && typeof record.metadata === "object" && !Array.isArray(record.metadata)
      ? record.metadata
      : {};

  return {
    id: record.id,
    barcode:
      normalizeOptionalText(record.barcode)
      || buildReceiptBarcode({
        skuCode,
        weighedAt: record.weighed_at,
        metadata,
      }),
    productConfigId: record.product_config_id,
    lotId: record.lot_id,
    productCode: skuCode,
    productName:
      productNameBySku.get(skuCode)
      || normalizeOptionalText(metadata.productName)
      || skuCode,
    lotNo: lot?.lotNo || normalizeOptionalText(metadata.lotNo) || "-",
    grossWeightKg: normalizeWeight(record.gross_weight_kg) ?? 0,
    tareWeightKg: normalizeWeight(record.tare_weight_kg) ?? 0,
    netWeightKg: normalizeWeight(record.net_weight_kg) ?? 0,
    passWeightKg: normalizeWeight(record.pass_weight_kg),
    amountPerPallet: normalizeInteger(record.amount_per_pallet),
    weighedAt: record.weighed_at || null,
    createdAt: record.created_at || record.weighed_at || null,
    restoredAt: record.restored_at || null,
    status: normalizeOptionalText(record.status) || "recorded",
    isTest: Boolean(metadata?.isTest),
    workstationId: normalizeOptionalText(metadata.workstationId),
    isReturn: Boolean(metadata?.isReturn),
    voidedAt: metadata?.voidedAt || null,
  };
}

const deptConfigMemoryCache = new Map();
const DEPT_CONFIG_TTL_MS = 5 * 60 * 1000;

async function loadDepartmentConfigMap(supabaseAdmin, departmentId) {
  if (!departmentId) {
    return {
      available: true,
      configIds: [],
      productByConfigId: new Map(),
    };
  }

  const cached = deptConfigMemoryCache.get(departmentId);
  if (cached && Date.now() - cached.timestamp < DEPT_CONFIG_TTL_MS) {
    return cached.data;
  }

  const configResult = await supabaseAdmin
    .from("production_weight_scale_products")
    .select("id,sku_code")
    .eq("department_id", departmentId);

  if (configResult.error) {
    if (isMissingScaleCatalogError(configResult.error)) {
      return {
        available: false,
        configIds: [],
        productByConfigId: new Map(),
      };
    }

    throw new Error("Failed to load weight scale receipt configs");
  }

  const configRows = (configResult.data ?? []).map((row) => ({
    id: row.id,
    skuCode: normalizeScaleSkuCode(row.sku_code),
  }));

  const result = {
    available: true,
    configIds: configRows.map((row) => row.id),
    productByConfigId: new Map(configRows.map((row) => [row.id, row])),
  };
  deptConfigMemoryCache.set(departmentId, { timestamp: Date.now(), data: result });
  return result;
}

const productNameMemoryCache = new Map();

async function loadProductNamesBySku(supabaseAdmin, skuCodes) {
  const normalizedSkuCodes = Array.from(
    new Set(
      (skuCodes || [])
        .map((skuCode) => normalizeScaleSkuCode(skuCode))
        .filter(Boolean)
    )
  );

  if (!normalizedSkuCodes.length) {
    return new Map();
  }

  const missingSkus = normalizedSkuCodes.filter((sku) => !productNameMemoryCache.has(sku));
  if (missingSkus.length) {
    const productRows = await fetchSupabaseRowsByChunks(
      missingSkus,
      (skuCodeChunk) => supabaseAdmin
        .from("products_cache")
        .select("sku_code,sku_name")
        .in("sku_code", skuCodeChunk),
      {
        onError: () => {
          throw new Error("Failed to load weight scale receipt product names");
        },
      }
    );

    for (const row of productRows) {
      productNameMemoryCache.set(
        normalizeScaleSkuCode(row?.sku_code),
        String(row?.sku_name || "").trim()
      );
    }
  }

  return new Map(
    normalizedSkuCodes.map((sku) => [sku, productNameMemoryCache.get(sku) || sku])
  );
}

async function loadProductSnapshotsBySku(supabaseAdmin, skuCodes) {
  const normalizedSkuCodes = Array.from(
    new Set(
      (Array.isArray(skuCodes) ? skuCodes : [])
        .map((value) => normalizeScaleSkuCode(value))
        .filter(Boolean)
    )
  );

  if (!normalizedSkuCodes.length) {
    return new Map();
  }

  const productRows = await fetchSupabaseRowsByChunks(
    normalizedSkuCodes,
    (skuCodeChunk) => supabaseAdmin
      .from("products_cache")
      .select("sku_code,sku_name,uom_name,iccat_code")
      .in("sku_code", skuCodeChunk),
    {
      onError: () => {
        throw new Error("Failed to load weight scale product snapshots");
      },
    }
  );

  return new Map(
    productRows.map((row) => {
      const skuCode = normalizeScaleSkuCode(row?.sku_code);
      return [
        skuCode,
        {
          skuCode,
          productName: String(row?.sku_name || "").trim() || skuCode,
          uomName: normalizeOptionalText(row?.uom_name),
          categoryCode: String(row?.iccat_code || "").trim() || "03",
        },
      ];
    })
  );
}

async function loadActiveIssuedReceiptIds(supabaseAdmin, receiptIds) {
  const normalizedReceiptIds = Array.from(
    new Set(
      (Array.isArray(receiptIds) ? receiptIds : [])
        .map((value) => String(value || "").trim())
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
        if (isMissingStockIssueError(error)) {
          return [];
        }

        console.warn("[scale-receipts] Failed to validate issued receipts from issue items", {
          code: error.code,
          message: error.message,
          details: error.details,
        });

        return null;
      },
    }
  );

  if (!rawIssueRows) {
    return (await loadActiveIssuedReceiptIdsFromReportView(supabaseAdmin, normalizedReceiptIds)) ?? new Set();
  }

  const issueRows = rawIssueRows.filter((row) =>
    String(row?.source_receipt_id || "").trim()
    && String(row?.issue_document_id || "").trim()
    && String(row?.status || "").trim().toLowerCase() === "confirmed"
  );
  const documentIds = Array.from(
    new Set(
      issueRows
        .map((row) => String(row?.issue_document_id || "").trim())
        .filter(Boolean)
    )
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
        if (isMissingStockIssueError(error)) {
          return [];
        }

        console.warn("[scale-receipts] Failed to validate issued receipt documents", {
          code: error.code,
          message: error.message,
          details: error.details,
        });

        return null;
      },
    }
  );

  if (!documentRows) {
    return (await loadActiveIssuedReceiptIdsFromReportView(supabaseAdmin, normalizedReceiptIds)) ?? new Set();
  }

  const confirmedDocumentIds = new Set(
    documentRows
      .filter((row) => String(row?.status || "").trim().toLowerCase() === "confirmed")
      .map((row) => String(row?.id || "").trim())
      .filter(Boolean)
  );

  return new Set(
    issueRows
      .filter((row) => confirmedDocumentIds.has(String(row?.issue_document_id || "").trim()))
      .map((row) => String(row?.source_receipt_id || "").trim())
      .filter(Boolean)
  );
}

async function loadLotsByIds(supabaseAdmin, lotIds) {
  const normalizedLotIds = lotIds
    .map((lotId) => String(lotId || "").trim())
    .filter(Boolean);

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
        throw new Error("Failed to load weight scale receipt lots");
      },
    }
  );

  return new Map(
    lotRows.map((row) => [
      row.id,
      {
        id: row.id,
        lotNo: String(row?.lot_code || "").trim(),
      },
    ])
  );
}

export async function loadScaleRecentReceiptsData(
  supabaseAdmin = getSupabaseAdmin(),
  {
    departmentId = null,
    limit = 20,
    forDate = new Date(),
    weightSource = null,
  } = {}
) {
  const normalizedWeightSource = normalizeOptionalText(weightSource);
  const configContext = await loadDepartmentConfigMap(supabaseAdmin, departmentId);
  if (!configContext.available) {
    return {
      available: false,
      receipts: [],
      summary: buildReceiptSummary([]),
    };
  }

  if (departmentId && !configContext.configIds.length) {
    return {
      available: true,
      receipts: [],
      summary: buildReceiptSummary([]),
    };
  }

  const { startIso, endIso } = toScaleReceiptIsoDateBounds(forDate);
  let receiptQuery = supabaseAdmin
    .from("production_weight_receipts")
    .select(
      "id,product_config_id,lot_id,gross_weight_kg,tare_weight_kg,net_weight_kg,pass_weight_kg,amount_per_pallet,barcode,weighed_at,status,metadata"
    )
    .eq("status", "recorded")
    .gte("weighed_at", startIso)
    .lt("weighed_at", endIso)
    .order("weighed_at", { ascending: false })
    .limit(2000); // Keep the recent list light while still summarizing the full day.

  if (departmentId) {
    receiptQuery = receiptQuery.in("product_config_id", configContext.configIds);
  }
  if (normalizedWeightSource) {
    receiptQuery = receiptQuery.filter(
      "metadata->>weightSource",
      "eq",
      normalizedWeightSource
    );
  }

  const receiptResult = await receiptQuery;
  if (receiptResult.error) {
    if (isMissingScaleCatalogError(receiptResult.error)) {
      return {
        available: false,
        receipts: [],
        summary: buildReceiptSummary([]),
      };
    }

    throw new Error("Failed to load weight scale receipts");
  }

  const receiptRows = receiptResult.data ?? [];
  const lotById = await loadLotsByIds(
    supabaseAdmin,
    receiptRows.map((row) => row.lot_id)
  );
  const productNameBySku = await loadProductNamesBySku(
    supabaseAdmin,
    Array.from(configContext.productByConfigId.values()).map((row) => row.skuCode)
  );

  const receipts = receiptRows
    .map((row) =>
      normalizeReceiptRecord(
        row,
        configContext.productByConfigId,
        lotById,
        productNameBySku
      )
    )
    .filter((receipt) => !receipt.isReturn);

  return {
    available: true,
    receipts: receipts.slice(0, limit),
    summary: buildReceiptSummary(receipts),
  };
}

export async function loadScaleReceiptReportData(
  supabaseAdmin = getSupabaseAdmin(),
  {
    departmentId = null,
    limit = 50,
    page = 1,
    dateFrom = null,
    dateTo = null,
    search = "",
    lotNo = "",
    isTest = null,
    itemStatus = "confirmed",
    productCodes = [],
    includeAll = false,
    recordType = "production",
    asOfDate = null,
    liveWorkstationId = null,
    includeVoided = false,
  } = {}
) {
  const normalizedRecordType = String(recordType || "production").trim().toLowerCase();
  const configContext = await loadDepartmentConfigMap(supabaseAdmin, departmentId);
  const normalizedSearch = normalizeSearchTerm(search);
  const normalizedLotNo = String(lotNo || "").trim().toUpperCase();
  const normalizedProductCodes = normalizeSkuCodeList(productCodes);
  const normalizedItemStatus = normalizeReceiptItemStatusFilter(itemStatus);
  const normalizedLimit = Math.min(
    Math.max(Number.parseInt(String(limit ?? "").trim(), 10) || 50, 1),
    200
  );
  const normalizedPage = Math.max(
    Number.parseInt(String(page ?? "").trim(), 10) || 1,
    1
  );
  const shouldIncludeAll = Boolean(includeAll);
  const asOfCutoff = toBangkokReportCutoffIso(asOfDate);

  const { startIso, endIso, normalizedDateFrom, normalizedDateTo } = toScaleReceiptIsoDateRange({
    dateFrom,
    dateTo,
  });

  if (!configContext.available) {
    return {
      available: false,
      receipts: [],
      summary: buildReceiptSummary([]),
      filters: {
        dateFrom: normalizedDateFrom,
        dateTo: normalizedDateTo,
        search: normalizedSearch,
        lotNo: normalizedLotNo,
        isTest,
        itemStatus: normalizedItemStatus,
        productCodes: normalizedProductCodes,
        recordType: normalizedRecordType,
      },
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        totalCount: 0,
        totalPages: 0,
      },
    };
  }

  if (departmentId && !configContext.configIds.length) {
    return {
      available: true,
      receipts: [],
      summary: buildReceiptSummary([]),
      filters: {
        dateFrom: normalizedDateFrom,
        dateTo: normalizedDateTo,
        search: normalizedSearch,
        lotNo: normalizedLotNo,
        isTest,
        itemStatus: normalizedItemStatus,
        productCodes: normalizedProductCodes,
        recordType: normalizedRecordType,
      },
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        totalCount: 0,
        totalPages: 0,
      },
    };
  }

  const filteredConfigIds = normalizedProductCodes.length
    ? Array.from(configContext.productByConfigId.entries())
        .filter(([, row]) => normalizedProductCodes.includes(row.skuCode))
        .map(([configId]) => configId)
    : configContext.configIds;

  if (departmentId && !filteredConfigIds.length) {
    return {
      available: true,
      receipts: [],
      summary: buildReceiptSummary([]),
      filters: {
        dateFrom: normalizedDateFrom,
        dateTo: normalizedDateTo,
        search: normalizedSearch,
        lotNo: normalizedLotNo,
        isTest,
        itemStatus: normalizedItemStatus,
        productCodes: normalizedProductCodes,
        recordType: normalizedRecordType,
      },
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        totalCount: 0,
        totalPages: 0,
      },
    };
  }

  let reportAvailable = true;
  const receiptRows = await fetchAllSupabaseRows(
    () => {
      let receiptQuery = supabaseAdmin
        .from("production_weight_receipts")
        .select(
          "id,product_config_id,lot_id,gross_weight_kg,tare_weight_kg,net_weight_kg,pass_weight_kg,amount_per_pallet,barcode,weighed_at,created_at,restored_at,status,metadata"
        )
        .gte("weighed_at", startIso)
        .lt("weighed_at", endIso)
        .order("weighed_at", { ascending: true })
        .order("id", { ascending: true });

      if (departmentId) {
        receiptQuery = receiptQuery.in("product_config_id", filteredConfigIds);
      }

      if (liveWorkstationId && normalizedRecordType !== "return") {
        receiptQuery = receiptQuery.eq("metadata->>weightSource", "serial-live")
          .eq("metadata->>workstationId", liveWorkstationId);
      }

      return receiptQuery;
    },
    {
      onError: (error) => {
        if (isMissingScaleCatalogError(error)) {
          reportAvailable = false;
          return [];
        }

        throw new Error("Failed to load weight scale receipt report");
      },
    }
  );
  const lotById = await loadLotsByIds(
    supabaseAdmin,
    receiptRows.map((row) => row.lot_id)
  );
  const productNameBySku = await loadProductNamesBySku(
    supabaseAdmin,
    Array.from(configContext.productByConfigId.values()).map((row) => row.skuCode)
  );

  let receipts = receiptRows.map((row) =>
    normalizeReceiptRecord(
      row,
      configContext.productByConfigId,
      lotById,
      productNameBySku
    )
  );

  const activeIssuedReceiptIds = await loadActiveIssuedReceiptIds(
    supabaseAdmin,
    receipts.map((receipt) => receipt.id)
  );

  receipts = receipts.map((receipt) => {
    const isActive = isRecordActiveAt(
      receipt.status,
      receipt.voidedAt,
      asOfCutoff,
      receipt.createdAt,
      receipt.restoredAt
    );
    return {
      ...receipt,
      status: asOfCutoff && isActive ? "recorded" : receipt.status,
      itemStatus: !isActive
        ? "voided"
        : activeIssuedReceiptIds.has(receipt.id)
          ? "issued"
          : "available",
    };
  });

  if (normalizedRecordType === "production") {
    receipts = receipts.filter((receipt) => !isReturnReceipt(receipt));
  } else if (normalizedRecordType === "return") {
    receipts = receipts.filter((receipt) => isReturnReceipt(receipt));
  }

  if (liveWorkstationId && normalizedRecordType === "return") {
    const sourceIds = [...new Set(receiptRows.map(receipt => receipt.metadata?.sourceReceiptId).filter(Boolean))];
    const sources = sourceIds.length ? await fetchSupabaseRowsByChunks(sourceIds, (chunk) =>
      supabaseAdmin.from("production_weight_receipts").select("id")
        .in("id", chunk).in("product_config_id", filteredConfigIds)
        .eq("metadata->>weightSource", "serial-live")
        .eq("metadata->>workstationId", liveWorkstationId)
    ) : [];
    const allowed = new Set(sources.map(row => row.id));
    const allowedReturnIds = new Set(receiptRows.filter(row => allowed.has(row.metadata?.sourceReceiptId)).map(row => row.id));
    receipts = receipts.filter(receipt => allowedReturnIds.has(receipt.id));
  }

  if (typeof isTest === "boolean") {
    receipts = receipts.filter((receipt) => receipt.isTest === isTest);
  }

  if (!includeVoided) {
    receipts = receipts.filter((receipt) =>
      matchesScaleReceiptReportStatus(receipt.itemStatus, normalizedItemStatus)
    );
  }

  if (normalizedSearch) {
    receipts = receipts.filter((receipt) => matchesReceiptSearch(receipt, normalizedSearch));
  }

  if (normalizedLotNo) {
    receipts = receipts.filter(
      (receipt) => String(receipt?.lotNo || "").trim().toUpperCase() === normalizedLotNo
    );
  }

  const totalCount = receipts.length;
  const totalPages = totalCount ? Math.ceil(totalCount / normalizedLimit) : 0;
  const paginatedReceipts = shouldIncludeAll
    ? receipts
    : receipts.slice(
        (normalizedPage - 1) * normalizedLimit,
        normalizedPage * normalizedLimit
      );

  return {
    available: reportAvailable,
    receipts: paginatedReceipts,
    summary: buildReceiptSummary(receipts),
    filters: {
      dateFrom: normalizedDateFrom,
      dateTo: normalizedDateTo,
      search: normalizedSearch,
      lotNo: normalizedLotNo,
      isTest,
      itemStatus: normalizedItemStatus,
      productCodes: normalizedProductCodes,
      recordType: normalizedRecordType,
    },
    pagination: {
      page: normalizedPage,
      limit: normalizedLimit,
      totalCount,
      totalPages,
    },
  };
}

export async function loadScaleReceiptSummaryReportData(
  supabaseAdmin = getSupabaseAdmin(),
  {
    departmentId = null,
    limit = 50,
    page = 1,
    dateFrom = null,
    dateTo = null,
    productCodes = [],
    itemStatus = "confirmed",
    includeAll = false,
    summaryChunkSize = null,
    asOfDate = null,
  } = {}
) {
  const normalizedLimit = Math.min(
    Math.max(Number.parseInt(String(limit ?? "").trim(), 10) || 50, 1),
    200
  );
  const normalizedPage = Math.max(
    Number.parseInt(String(page ?? "").trim(), 10) || 1,
    1
  );
  const normalizedProductCodes = normalizeSkuCodeList(productCodes);
  const shouldIncludeAll = Boolean(includeAll);

  const detailPayload = await loadScaleReceiptReportData(supabaseAdmin, {
    departmentId,
    limit: 200,
    page: 1,
    dateFrom,
    dateTo,
    search: "",
    isTest: null,
    itemStatus,
    productCodes: normalizedProductCodes,
    includeAll: true,
    asOfDate,
  });

  const summaryRows = buildScaleReceiptSummaryRows(detailPayload?.receipts || [], {
    chunkSize: summaryChunkSize,
  });
  const totalCount = summaryRows.length;
  const totalPages = totalCount ? Math.ceil(totalCount / normalizedLimit) : 0;
  const paginatedRows = shouldIncludeAll
    ? summaryRows
    : summaryRows.slice(
        (normalizedPage - 1) * normalizedLimit,
        normalizedPage * normalizedLimit
      );

  const totalQuantity = summaryRows.reduce(
    (accumulator, row) => accumulator + (Number(row.quantity) || 0),
    0
  );
  const totalNetWeightKg = summaryRows.reduce(
    (accumulator, row) =>
      Number((accumulator + (normalizeWeight(row.totalNetWeightKg) ?? 0)).toFixed(3)),
    0
  );

  return {
    available: Boolean(detailPayload?.available),
    rows: paginatedRows,
    summary: {
      totalCount,
      totalQuantity,
      totalNetWeightKg,
    },
    filters: {
      dateFrom: detailPayload?.filters?.dateFrom || "",
      dateTo: detailPayload?.filters?.dateTo || "",
      productCodes: normalizedProductCodes,
      itemStatus: detailPayload?.filters?.itemStatus || "confirmed",
    },
    pagination: {
      page: normalizedPage,
      limit: normalizedLimit,
      totalCount,
      totalPages,
    },
  };
}

export async function loadScaleCancelableReceiptsData(
  supabaseAdmin = getSupabaseAdmin(),
  {
    departmentId = null,
    limit = 50,
    page = 1,
    dateFrom = null,
    dateTo = null,
    barcode = "",
    productCodes = [],
    status = "recorded",
  } = {}
) {
  const configContext = await loadDepartmentConfigMap(supabaseAdmin, departmentId);
  const resolvedStatus = status || "recorded";
  const normalizedBarcode = String(barcode || "").trim().toUpperCase();
  const normalizedProductCodes = normalizeSkuCodeList(productCodes);
  const normalizedLimit = Math.min(
    Math.max(Number.parseInt(String(limit ?? "").trim(), 10) || 50, 1),
    200
  );
  const normalizedPage = Math.max(
    Number.parseInt(String(page ?? "").trim(), 10) || 1,
    1
  );

  let resolvedDateFrom = dateFrom;
  let resolvedDateTo = dateTo;

  if (normalizedBarcode && normalizedBarcode.length >= 6) {
    const dayStr = normalizedBarcode.slice(0, 2);
    const monthStr = normalizedBarcode.slice(2, 4);
    const yearStr = normalizedBarcode.slice(4, 6);

    if (/^\d{2}$/.test(dayStr) && /^\d{2}$/.test(monthStr) && /^\d{2}$/.test(yearStr)) {
      const day = Number.parseInt(dayStr, 10);
      const month = Number.parseInt(monthStr, 10);
      const year = Number.parseInt(yearStr, 10) + 2000;

      if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
        const barcodeDate = new Date(year, month - 1, day);
        if (
          barcodeDate.getFullYear() === year &&
          barcodeDate.getMonth() === month - 1 &&
          barcodeDate.getDate() === day
        ) {
          const dateStr = `${year}-${monthStr}-${dayStr}`;
          resolvedDateFrom = dateStr;
          resolvedDateTo = dateStr;
        }
      }
    }
  }

  const { startIso, endIso, normalizedDateFrom, normalizedDateTo } = toScaleReceiptIsoDateRange({
    dateFrom: resolvedDateFrom,
    dateTo: resolvedDateTo,
  });

  if (!configContext.available) {
    return {
      available: false,
      receipts: [],
      summary: buildCancelableReceiptSummary([]),
      filters: {
        dateFrom: normalizedDateFrom,
        dateTo: normalizedDateTo,
        barcode: normalizedBarcode,
        productCodes: normalizedProductCodes,
        status: resolvedStatus,
      },
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        totalCount: 0,
        totalPages: 0,
      },
    };
  }

  if (departmentId && !configContext.configIds.length) {
    return {
      available: true,
      receipts: [],
      summary: buildCancelableReceiptSummary([]),
      filters: {
        dateFrom: normalizedDateFrom,
        dateTo: normalizedDateTo,
        barcode: normalizedBarcode,
        productCodes: normalizedProductCodes,
        status: resolvedStatus,
      },
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        totalCount: 0,
        totalPages: 0,
      },
    };
  }

  const filteredConfigIds = normalizedProductCodes.length
    ? Array.from(configContext.productByConfigId.entries())
        .filter(([, row]) => normalizedProductCodes.includes(row.skuCode))
        .map(([configId]) => configId)
    : configContext.configIds;

  if (departmentId && !filteredConfigIds.length) {
    return {
      available: true,
      receipts: [],
      summary: buildCancelableReceiptSummary([]),
      filters: {
        dateFrom: normalizedDateFrom,
        dateTo: normalizedDateTo,
        barcode: normalizedBarcode,
        productCodes: normalizedProductCodes,
        status: resolvedStatus,
      },
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        totalCount: 0,
        totalPages: 0,
      },
    };
  }

  let reportAvailable = true;
  const receiptRows = await fetchAllSupabaseRows(
    () => {
      let receiptQuery = supabaseAdmin
        .from("production_weight_receipts")
        .select(
          "id,product_config_id,lot_id,gross_weight_kg,tare_weight_kg,net_weight_kg,pass_weight_kg,amount_per_pallet,barcode,weighed_at,status,metadata"
        )
        .eq("status", resolvedStatus);

      if (!normalizedBarcode && resolvedStatus !== "voided") {
        receiptQuery = receiptQuery
          .gte("weighed_at", startIso)
          .lt("weighed_at", endIso);
      }

      if (resolvedStatus === "voided") {
        receiptQuery = receiptQuery
          .order("metadata->>voidedAt", { ascending: true, nullsFirst: false })
          .order("id", { ascending: true });
      } else {
        receiptQuery = receiptQuery
          .order("weighed_at", { ascending: true })
          .order("id", { ascending: true });
      }

      if (departmentId) {
        receiptQuery = receiptQuery.in("product_config_id", filteredConfigIds);
      }

      if (normalizedBarcode) {
        receiptQuery = receiptQuery.ilike("barcode", `%${normalizedBarcode}%`);
      }

      return receiptQuery;
    },
    {
      onError: (error) => {
        if (isMissingScaleCatalogError(error)) {
          reportAvailable = false;
          return [];
        }

        throw new Error("Failed to load cancelable weight scale receipts");
      },
    }
  );
  const activeIssuedReceiptIds = await loadActiveIssuedReceiptIds(
    supabaseAdmin,
    receiptRows.map((row) => row.id)
  );
  const lotById = await loadLotsByIds(
    supabaseAdmin,
    receiptRows.map((row) => row.lot_id)
  );
  const productNameBySku = await loadProductNamesBySku(
    supabaseAdmin,
    Array.from(configContext.productByConfigId.values()).map((row) => row.skuCode)
  );

  let receipts = receiptRows
    .map((row) =>
      normalizeReceiptRecord(
        row,
        configContext.productByConfigId,
        lotById,
        productNameBySku
      )
    )
    .filter((receipt) => !isReturnReceipt(receipt));

  if (resolvedStatus !== "voided") {
    receipts = receipts.filter((receipt) => !activeIssuedReceiptIds.has(receipt.id));
  }

  const totalCount = receipts.length;
  const totalPages = totalCount ? Math.ceil(totalCount / normalizedLimit) : 0;
  receipts = receipts.slice(
    (normalizedPage - 1) * normalizedLimit,
    normalizedPage * normalizedLimit
  );

  return {
    available: reportAvailable,
    receipts,
    summary: buildCancelableReceiptSummary(
      receiptRows
        .map((row) =>
          normalizeReceiptRecord(
            row,
            configContext.productByConfigId,
            lotById,
            productNameBySku
          )
        )
        .filter((receipt) => !isReturnReceipt(receipt))
        .filter((receipt) => resolvedStatus === "voided" || !activeIssuedReceiptIds.has(receipt.id))
    ),
    filters: {
      dateFrom: normalizedDateFrom,
      dateTo: normalizedDateTo,
      barcode: normalizedBarcode,
      productCodes: normalizedProductCodes,
      status: resolvedStatus,
    },
    pagination: {
      page: normalizedPage,
      limit: normalizedLimit,
      totalCount,
      totalPages,
    },
  };
}

export async function cancelScaleReceipt(
  supabaseAdmin = getSupabaseAdmin(),
  {
    receiptId,
    actorUserId = null,
    voidReason = null,
  } = {}
) {
  const normalizedReceiptId = String(receiptId || "").trim();
  const normalizedActorUserId = normalizeOptionalText(actorUserId);
  const normalizedVoidReason = normalizeOptionalText(voidReason);

  if (!normalizedReceiptId) {
    throw new Error("ไม่พบรายการชั่งที่ต้องการยกเลิก");
  }

  const receiptResult = await supabaseAdmin.rpc(
    "cancel_production_weight_receipt",
    {
      p_receipt_id: normalizedReceiptId,
      p_actor_user_id: normalizedActorUserId,
      p_void_reason: normalizedVoidReason,
    }
  );

  if (receiptResult.error || !receiptResult.data) {
    throw new Error(
      receiptResult.error?.message || "Failed to cancel weight scale receipt"
    );
  }

  const currentReceipt = receiptResult.data;

  const configResult = await supabaseAdmin
    .from("production_weight_scale_products")
    .select("id,sku_code")
    .eq("id", currentReceipt.product_config_id)
    .maybeSingle();

  if (configResult.error || !configResult.data) {
    throw new Error("Failed to validate weight scale product config");
  }

  const lotResult = await supabaseAdmin
    .from("production_weight_scale_lots")
    .select("id,lot_code")
    .eq("id", currentReceipt.lot_id)
    .maybeSingle();

  if (lotResult.error || !lotResult.data) {
    throw new Error("Failed to validate weight scale lot");
  }

  const productSnapshotBySku = await loadProductSnapshotsBySku(supabaseAdmin, [
    configResult.data.sku_code,
  ]);
  const productNameBySku = new Map(
    Array.from(productSnapshotBySku.entries()).map(([skuCode, snapshot]) => [
      skuCode,
      snapshot.productName,
    ])
  );

  return {
    ...normalizeReceiptRecord(
      currentReceipt,
      new Map([
        [
          currentReceipt.product_config_id,
          {
            id: currentReceipt.product_config_id,
            skuCode: configResult.data.sku_code,
          },
        ],
      ]),
      new Map([
        [
          currentReceipt.lot_id,
          {
            id: currentReceipt.lot_id,
            lotNo: String(lotResult.data.lot_code || "").trim(),
          },
        ],
      ]),
      productNameBySku
    ),
    alreadyCancelled: currentReceipt.alreadyCancelled === true,
  };
}

export async function cancelScaleReceiptByBarcode(
  supabaseAdmin = getSupabaseAdmin(),
  {
    barcode,
    actorUserId = null,
    voidReason = null,
  } = {}
) {
  const normalizedBarcode = String(barcode || "")
    .replace(/[\s\u200B-\u200D\uFEFF]/g, "")
    .toUpperCase();

  if (!normalizedBarcode) {
    throw new Error("กรุณากรอกหรือสแกนรหัสบาร์โค้ดก่อน");
  }

  const receiptResult = await supabaseAdmin
    .from("production_weight_receipts")
    .select("id")
    .eq("barcode", normalizedBarcode)
    .maybeSingle();

  if (receiptResult.error) {
    throw new Error("ไม่สามารถตรวจสอบบาร์โค้ดสำหรับยกเลิกชั่งได้");
  }

  if (!receiptResult.data?.id) {
    throw new Error(`ไม่พบบาร์โค้ด ${normalizedBarcode} ในระบบชั่ง`);
  }

  return cancelScaleReceipt(supabaseAdmin, {
    receiptId: receiptResult.data.id,
    actorUserId,
    voidReason,
  });
}

export async function createScaleReceipt(
  supabaseAdmin = getSupabaseAdmin(),
  {
    departmentId,
    productConfigId,
    lotId,
    grossWeightKg,
    tareWeightKg,
    netWeightKg,
    passWeightKg = null,
    amountPerPallet = null,
    requestId = null,
    weighedBy = null,
    metadata = {},
  } = {}
) {
  const normalizedDepartmentId = String(departmentId || "").trim();
  const normalizedProductConfigId = String(productConfigId || "").trim();
  const normalizedLotId = String(lotId || "").trim();
  const normalizedGrossWeightKg = normalizeWeight(grossWeightKg);
  const normalizedTareWeightKg = normalizeWeight(tareWeightKg) ?? 0;
  const normalizedNetWeightKg = normalizeWeight(netWeightKg);
  const normalizedRequestId = String(requestId || "").trim();
  const normalizedMetadata =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? metadata
      : {};

  if (!normalizedDepartmentId || !normalizedProductConfigId || !normalizedLotId) {
    throw new Error("departmentId, productConfigId and lotId are required");
  }

  if (!Number.isFinite(normalizedGrossWeightKg) || !Number.isFinite(normalizedNetWeightKg)) {
    throw new Error("A valid scale reading is required before saving");
  }

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizedRequestId)) {
    throw new Error("A valid receipt requestId is required");
  }

  const configResult = await supabaseAdmin
    .from("production_weight_scale_products")
    .select("id,department_id,sku_code,current_lot_id,amount_per_pallet")
    .eq("id", normalizedProductConfigId)
    .eq("department_id", normalizedDepartmentId)
    .maybeSingle();

  if (configResult.error) {
    throw new Error("Failed to validate weight scale product config");
  }

  if (!configResult.data) {
    throw new Error("Weight scale product config was not found");
  }

  const requestedLotResult = await supabaseAdmin
    .from("production_weight_scale_lots")
    .select("id,product_config_id,lot_code,status")
    .eq("id", normalizedLotId)
    .eq("product_config_id", normalizedProductConfigId)
    .maybeSingle();

  if (requestedLotResult.error) {
    throw new Error("Failed to validate weight scale lot");
  }

  if (!requestedLotResult.data) {
    throw new Error("Current LOT was not found for this product");
  }

  let receiptRow = null;
  const weighedAt = new Date().toISOString();
  const expectedLotNo = buildAutoScaleLotNo(configResult.data.sku_code, weighedAt);
  const requestedLotNo = String(requestedLotResult.data.lot_code || "").trim();
  const isGeneratedLot = /^\d{10}-[12]$/.test(requestedLotNo);
  let resolvedLotId = normalizedLotId;
  let resolvedLot = requestedLotResult.data;

  if (expectedLotNo && isGeneratedLot && requestedLotNo !== expectedLotNo) {
    let expectedLotResult = await supabaseAdmin
      .from("production_weight_scale_lots")
      .select("id,product_config_id,lot_code,status")
      .eq("product_config_id", normalizedProductConfigId)
      .eq("lot_code", expectedLotNo)
      .maybeSingle();

    if (expectedLotResult.error) {
      throw new Error("Failed to resolve the production-date LOT");
    }

    if (!expectedLotResult.data) {
      const createLotResult = await supabaseAdmin
        .from("production_weight_scale_lots")
        .insert({
          product_config_id: normalizedProductConfigId,
          lot_code: expectedLotNo,
          status: "active",
        })
        .select("id,product_config_id,lot_code,status")
        .single();

      if (createLotResult.error) {
        if (!isUniqueBarcodeViolation(createLotResult.error)) {
          throw new Error("Failed to create the production-date LOT");
        }

        expectedLotResult = await supabaseAdmin
          .from("production_weight_scale_lots")
          .select("id,product_config_id,lot_code,status")
          .eq("product_config_id", normalizedProductConfigId)
          .eq("lot_code", expectedLotNo)
          .maybeSingle();
        if (expectedLotResult.error || !expectedLotResult.data) {
          throw new Error("Failed to reload the production-date LOT");
        }
      } else {
        expectedLotResult = createLotResult;
      }
    }

    resolvedLot = expectedLotResult.data;
    resolvedLotId = resolvedLot.id;

    const setCurrentResult = await supabaseAdmin
      .from("production_weight_scale_products")
      .update({ current_lot_id: resolvedLotId })
      .eq("id", normalizedProductConfigId);
    if (setCurrentResult.error) {
      throw new Error("Failed to activate the production-date LOT");
    }

    if (requestedLotResult.data.status === "active") {
      const closeOldLotResult = await supabaseAdmin
        .from("production_weight_scale_lots")
        .update({ status: "closed", closed_at: weighedAt })
        .eq("id", normalizedLotId)
        .eq("status", "active");
      if (closeOldLotResult.error) {
        throw new Error("Failed to close the previous production LOT");
      }
    }
  } else if (configResult.data.current_lot_id !== resolvedLotId) {
    const setCurrentResult = await supabaseAdmin
      .from("production_weight_scale_products")
      .update({ current_lot_id: resolvedLotId })
      .eq("id", normalizedProductConfigId);
    if (setCurrentResult.error) {
      throw new Error("Failed to activate the selected LOT");
    }
  }

  const { productionDate, shift } = calculateProductionShift(weighedAt);
  const finalMetadata = {
    ...normalizedMetadata,
    productionDate,
    shift,
  };

  let requestReplay = false;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const barcode = await generateReceiptBarcode(supabaseAdmin, {
      skuCode: configResult.data.sku_code,
      weighedAt,
      metadata: finalMetadata,
    });

    const insertResult = await supabaseAdmin
      .from("production_weight_receipts")
      .insert({
        product_config_id: normalizedProductConfigId,
        lot_id: resolvedLotId,
        gross_weight_kg: normalizedGrossWeightKg,
        tare_weight_kg: normalizedTareWeightKg,
        net_weight_kg: normalizedNetWeightKg,
        pass_weight_kg: normalizeWeight(passWeightKg),
        amount_per_pallet:
          normalizeInteger(amountPerPallet) ?? normalizeInteger(configResult.data.amount_per_pallet),
        request_id: normalizedRequestId,
        weighed_by: normalizeOptionalText(weighedBy),
        weighed_at: weighedAt,
        barcode,
        metadata: finalMetadata,
      })
      .select(
        "id,product_config_id,lot_id,gross_weight_kg,tare_weight_kg,net_weight_kg,pass_weight_kg,amount_per_pallet,barcode,weighed_at,status,metadata,request_id"
      )
      .single();

    if (!insertResult.error) {
      receiptRow = insertResult.data;
      break;
    }

    if (!isUniqueBarcodeViolation(insertResult.error)) {
      throw new Error("Failed to save weight scale receipt");
    }

    const existingResult = await supabaseAdmin
      .from("production_weight_receipts")
      .select("id,product_config_id,lot_id,gross_weight_kg,tare_weight_kg,net_weight_kg,pass_weight_kg,amount_per_pallet,barcode,weighed_at,status,metadata,request_id")
      .eq("request_id", normalizedRequestId)
      .maybeSingle();
    if (existingResult.error) {
      throw new Error("Failed to verify weight scale receipt request");
    }
    if (existingResult.data) {
      const existing = existingResult.data;
      if (
        existing.product_config_id !== normalizedProductConfigId
        || existing.lot_id !== resolvedLotId
        || normalizeWeight(existing.gross_weight_kg) !== normalizedGrossWeightKg
        || normalizeWeight(existing.tare_weight_kg) !== normalizedTareWeightKg
        || normalizeWeight(existing.net_weight_kg) !== normalizedNetWeightKg
      ) {
        throw new Error("receipt requestId was already used for different data");
      }
      receiptRow = existing;
      requestReplay = true;
      break;
    }
  }

  if (!receiptRow) {
    throw new Error("Failed to allocate a unique weight scale receipt barcode");
  }

  return {
    ...normalizeReceiptRecord(
      receiptRow,
      new Map([
        [
          normalizedProductConfigId,
          {
            id: normalizedProductConfigId,
            skuCode: configResult.data.sku_code,
          },
        ],
      ]),
      new Map([
        [
          resolvedLotId,
          {
            id: resolvedLotId,
            lotNo: String(resolvedLot.lot_code || "").trim(),
          },
        ],
      ]),
      await loadProductNamesBySku(supabaseAdmin, [configResult.data.sku_code])
    ),
    requestReplay,
  };
}
