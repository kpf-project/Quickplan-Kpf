import "server-only";
import { unstable_cache } from "next/cache";

import { getSupabaseAdmin } from "@/lib/adminApi";
import {
  loadScaleProductsData,
  SCALE_CATEGORY_CODE,
  SCALE_DEPARTMENT_CODE,
} from "@/lib/scale/products";
import { loadScaleReceiptSummaryReportData } from "@/lib/scale/receipts";
import { loadProductionStockIssueSummaryReportData } from "@/lib/production-stock-issues";
import {
  buildProductionStockMovementRows,
  buildProductionStockMovementSummary,
  buildCumulativeLotBalanceRows,
  expandProductionStockMovementRowsWithDailyBalances,
  filterProductionStockMovementsByActiveIssueItems,
  recalculateProductionStockMovementBalances,
  sortMovementRows,
} from "@/lib/production-stock-balance-rows";
import {
  fetchAllSupabaseRows,
  fetchSupabaseRowsByChunks,
} from "@/lib/supabaseRangeFetch";
import { isRecordActiveAt, toBangkokReportCutoffIso } from "@/lib/record-status-as-of";

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

function isReturnReceiptMetadata(metadata) {
  return Boolean(metadata && typeof metadata === "object" && !Array.isArray(metadata) && metadata.isReturn);
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

function isMissingProductionStockMovementError(error) {
  const code = normalizeUpperText(error?.code);
  const message = String(error?.message || "").toLowerCase();

  return (
    code === "42P01"
    || code === "42703"
    || code === "PGRST200"
    || code === "PGRST204"
    || message.includes("production_stock_movements")
    || message.includes("production_stock_opening_balances")
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

function buildFilters({ dateFrom, dateTo, productCodes, lotNos = [] }) {
  return {
    dateFrom: normalizeText(dateFrom),
    dateTo: normalizeText(dateTo),
    productCodes: normalizeProductCodes(productCodes),
    lotNos: Array.from(new Set((Array.isArray(lotNos) ? lotNos : []).map((value) => normalizeText(value)).filter(Boolean))),
  };
}

function getBangkokDateInput() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date()).map((part) => [part.type, part.value])
  );

  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getPreviousIsoDate(value) {
  const normalizedValue = normalizeText(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedValue)) {
    return null;
  }

  const date = new Date(`${normalizedValue}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function applyReturnReceiptRows(groupedRows, returnReceiptRows) {
  const grouped = new Map(
    (Array.isArray(groupedRows) ? groupedRows : []).map((row) => [
      [row.issueDate, row.lotNo, row.productCode].join("|"),
      { ...row },
    ])
  );

  (Array.isArray(returnReceiptRows) ? returnReceiptRows : []).forEach((row) => {
    const metadata = row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? row.metadata
      : {};

    if (!isReturnReceiptMetadata(metadata)) {
      return;
    }

    const issueDate = normalizeText(metadata?.productionDate)
      || normalizeText(row?.weighed_at).slice(0, 10);
    const lotNo = normalizeText(row?.lotNo) || normalizeText(metadata?.lotNo) || "-";
    const productCode = normalizeUpperText(row?.productCode) || "-";
    const productName = normalizeText(row?.productName) || normalizeText(metadata?.productName) || productCode;
    const key = [issueDate, lotNo, productCode].join("|");

    if (!grouped.has(key)) {
      grouped.set(key, {
        issueDate,
        lotNo,
        productCode,
        productName,
        inboundQuantity: 0,
        inboundWeightKg: 0,
        issueQuantity: 0,
        issueWeightKg: 0,
        returnQuantity: 0,
        returnWeightKg: 0,
        wasteQuantity: 0,
        wasteWeightKg: 0,
        actualQuantity: 0,
        actualWeightKg: 0,
        balanceQuantity: 0,
        balanceWeightKg: 0,
      });
    }

    const groupedRow = grouped.get(key);
    groupedRow.returnQuantity = Number((groupedRow.returnQuantity + 1).toFixed(3));
    groupedRow.returnWeightKg = Number(
      (groupedRow.returnWeightKg + normalizeDecimal(row?.net_weight_kg)).toFixed(3)
    );
  });

  return Array.from(grouped.values()).sort(sortMovementRows);
}

function applyMovementRows(groupedRows, movementRows) {
  const grouped = new Map(
    (Array.isArray(groupedRows) ? groupedRows : []).map((row) => [
      [row.issueDate, row.lotNo, row.productCode].join("|"),
      { ...row },
    ])
  );

  const touchRow = (row) => {
    const issueDate = normalizeText(row?.movement_date);
    const lotNo = normalizeText(row?.lot_no) || "-";
    const productCode = normalizeUpperText(row?.product_code) || "-";
    const productName = normalizeText(row?.product_name_snapshot) || "-";
    const key = [issueDate, lotNo, productCode].join("|");

    if (!grouped.has(key)) {
      grouped.set(key, {
        issueDate,
        lotNo,
        productCode,
        productName,
        inboundQuantity: 0,
        inboundWeightKg: 0,
        issueQuantity: 0,
        issueWeightKg: 0,
        returnQuantity: 0,
        returnWeightKg: 0,
        wasteQuantity: 0,
        wasteWeightKg: 0,
        actualQuantity: 0,
        actualWeightKg: 0,
        balanceQuantity: 0,
        balanceWeightKg: 0,
      });
    }

    return grouped.get(key);
  };

  (Array.isArray(movementRows) ? movementRows : []).forEach((row) => {
    const groupedRow = touchRow(row);
    const movementType = normalizeText(row?.movement_type);

    if (movementType === "return_in") {
      groupedRow.returnQuantity = Number(
        (groupedRow.returnQuantity + normalizeDecimal(row?.quantity_in)).toFixed(3)
      );
      groupedRow.returnWeightKg = Number(
        (groupedRow.returnWeightKg + normalizeDecimal(row?.weight_in_kg)).toFixed(3)
      );
    }

    if (movementType === "waste_out") {
      groupedRow.wasteQuantity = Number(
        (groupedRow.wasteQuantity + normalizeDecimal(row?.quantity_out)).toFixed(3)
      );
      groupedRow.wasteWeightKg = Number(
        (groupedRow.wasteWeightKg + normalizeDecimal(row?.weight_out_kg)).toFixed(3)
      );
    }
  });

  return recalculateProductionStockMovementBalances(Array.from(grouped.values()));
}

async function filterRowsByActiveSourceIssues(supabaseAdmin, rows, asOfDate = null) {
  const asOfCutoff = toBangkokReportCutoffIso(asOfDate);
  const sourceIssueItemIds = Array.from(new Set(
    (Array.isArray(rows) ? rows : [])
      .map((row) => normalizeText(row?.metadata?.sourceIssueItemId))
      .filter(Boolean)
  ));

  if (!sourceIssueItemIds.length) {
    return Array.isArray(rows) ? rows : [];
  }

  const issueItems = await fetchSupabaseRowsByChunks(
    sourceIssueItemIds,
    (chunk) => supabaseAdmin
      .from("production_stock_issue_items")
      .select("id,issue_document_id,status,voided_at,created_at,restored_at")
      .in("id", chunk),
    {
      chunkSize: 80,
      onError: () => {
        throw new Error("Failed to validate production stock movement source issues");
      },
    }
  );
  const activeItems = issueItems.filter(
    (row) => isRecordActiveAt(
      row?.status,
      row?.voided_at,
      asOfCutoff,
      row?.created_at,
      row?.restored_at
    )
  );
  const issueDocumentIds = Array.from(new Set(
    activeItems.map((row) => normalizeText(row?.issue_document_id)).filter(Boolean)
  ));
  const confirmedDocuments = await fetchSupabaseRowsByChunks(
    issueDocumentIds,
    (chunk) => supabaseAdmin
      .from("production_stock_issue_documents")
      .select("id,status,voided_at,issued_at,restored_at")
      .in("id", chunk),
    {
      chunkSize: 80,
      onError: () => {
        throw new Error("Failed to validate production stock movement source documents");
      },
    }
  );
  const activeDocumentIds = new Set(
    confirmedDocuments
      .filter((row) => isRecordActiveAt(
        row?.status,
        row?.voided_at,
        asOfCutoff,
        row?.issued_at,
        row?.restored_at
      ))
      .map((row) => normalizeText(row?.id))
  );
  const activeIssueItemIds = new Set(
    activeItems
      .filter((row) => activeDocumentIds.has(normalizeText(row?.issue_document_id)))
      .map((row) => normalizeText(row?.id))
  );

  return filterProductionStockMovementsByActiveIssueItems(rows, activeIssueItemIds);
}

async function loadReturnAndWasteMovementRows(
  supabaseAdmin,
  { departmentId, dateFrom, dateTo, productCodes }
) {
  return fetchAllSupabaseRows(
    () => {
      let query = supabaseAdmin
        .from("production_stock_movements")
        .select(
          "movement_type,movement_date,product_code,product_name_snapshot,lot_no,quantity_in,quantity_out,weight_in_kg,weight_out_kg,metadata"
        )
        .eq("department_id", departmentId)
        .in("movement_type", ["return_in", "waste_out"])
        .gte("movement_date", dateFrom)
        .lte("movement_date", dateTo);

      if (Array.isArray(productCodes) && productCodes.length) {
        query = query.in("product_code", productCodes);
      }

      return query;
    },
    {
      onError: (error) => {
        if (isMissingProductionStockMovementError(error)) {
          return [];
        }

        throw new Error("Failed to load production stock return and waste movements");
      },
    }
  );
}

async function loadStockReturnReceiptRows(
  supabaseAdmin,
  { departmentId, dateFrom, dateTo, productCodes }
) {
  const receiptRows = await fetchAllSupabaseRows(
    () => supabaseAdmin
      .from("production_weight_receipts")
      .select(
        "id,product_config_id,lot_id,net_weight_kg,weighed_at,metadata"
      )
      .eq("status", "recorded")
      .eq("metadata->>isReturn", "true")
      .gte("weighed_at", `${dateFrom}T00:00:00+07:00`)
      .lt("weighed_at", `${dateTo}T23:59:59+07:00`)
      .order("weighed_at", { ascending: true })
      .order("id", { ascending: true }),
    {
      onError: () => [],
    }
  );
  const configIds = Array.from(
    new Set(receiptRows.map((row) => normalizeText(row?.product_config_id)).filter(Boolean))
  );
  const lotIds = Array.from(
    new Set(receiptRows.map((row) => normalizeText(row?.lot_id)).filter(Boolean))
  );

  const [configRows, lotRows] = await Promise.all([
    fetchSupabaseRowsByChunks(
      configIds,
      (configIdChunk) => supabaseAdmin
        .from("production_weight_scale_products")
        .select("id,sku_code")
        .eq("department_id", departmentId)
        .in("id", configIdChunk),
      {
        onError: () => [],
      }
    ),
    fetchSupabaseRowsByChunks(
      lotIds,
      (lotIdChunk) => supabaseAdmin
        .from("production_weight_scale_lots")
        .select("id,lot_code")
        .in("id", lotIdChunk),
      {
        onError: () => [],
      }
    ),
  ]);

  const productCodeByConfigId = new Map(
    configRows.map((row) => [row.id, normalizeUpperText(row?.sku_code)])
  );
  const lotNoByLotId = new Map(
    lotRows.map((row) => [row.id, normalizeText(row?.lot_code)])
  );

  return receiptRows
    .map((row) => ({
      ...row,
      productCode: productCodeByConfigId.get(row.product_config_id) || "",
      lotNo: lotNoByLotId.get(row.lot_id) || "",
    }))
    .filter((row) => row.productCode)
    .filter((row) => !Array.isArray(productCodes) || !productCodes.length || productCodes.includes(row.productCode));
}

async function loadOpeningBalanceRows(
  supabaseAdmin,
  { departmentId, categoryCode, productCodes, scopeProducts }
) {
  return fetchAllSupabaseRows(
    () => {
      let query = supabaseAdmin
        .from("production_stock_opening_balances")
        .select("product_code,product_name_snapshot,lot_no,quantity,weight_kg")
        .eq("department_id", departmentId)
        .eq("category_code", categoryCode);

      const scopedProductCodes = Array.isArray(productCodes) && productCodes.length
        ? productCodes
        : (Array.isArray(scopeProducts) ? scopeProducts.map((product) => product.code).filter(Boolean) : []);

      if (scopedProductCodes.length) {
        query = query.in("product_code", scopedProductCodes);
      }

      return query;
    },
    {
      onError: (error) => {
        if (isMissingProductionStockMovementError(error)) {
          return [];
        }

        throw new Error("Failed to load production stock opening balances");
      },
    }
  );
}

function buildOpeningBalancesByLot(openingRows) {
  const openingBalancesByLot = new Map();

  (Array.isArray(openingRows) ? openingRows : []).forEach((row) => {
    const productCode = normalizeUpperText(row?.product_code);
    const lotNo = normalizeText(row?.lot_no) || "-";
    if (!productCode) {
      return;
    }

    const balanceKey = [productCode, lotNo].join("|");
    const current = openingBalancesByLot.get(balanceKey) || { quantity: 0, weightKg: 0 };
    openingBalancesByLot.set(balanceKey, {
      quantity: Number((current.quantity + normalizeDecimal(row?.quantity)).toFixed(3)),
      weightKg: Number((current.weightKg + normalizeDecimal(row?.weight_kg)).toFixed(3)),
    });
  });

  return openingBalancesByLot;
}

function mergeFinalBalancesByLot(openingBalancesByLot, movementRows) {
  const finalBalancesByLot = new Map(openingBalancesByLot);

  recalculateProductionStockMovementBalances(movementRows, openingBalancesByLot)
    .sort((left, right) => {
      if (left.issueDate !== right.issueDate) {
        return String(left.issueDate || "").localeCompare(String(right.issueDate || ""));
      }
      if (left.productCode !== right.productCode) {
        return String(left.productCode || "").localeCompare(String(right.productCode || ""));
      }
      return String(left.lotNo || "").localeCompare(String(right.lotNo || ""));
    })
    .forEach((row) => {
      const balanceKey = [row.productCode, row.lotNo].join("|");
      finalBalancesByLot.set(balanceKey, {
        quantity: normalizeDecimal(row?.balanceQuantity),
        weightKg: normalizeDecimal(row?.balanceWeightKg),
      });
    });

  return finalBalancesByLot;
}

export async function loadProductionStockMovementSummaryReportData(
  supabaseAdmin = getSupabaseAdmin(),
  {
    dateFrom = null,
    dateTo = null,
    productCodes = [],
    lotNos = [],
    issueTypes = [],
    page = 1,
    limit = 20,
    includeAll = false,
    expandDailyBalances = true,
    activityOnly = false,
  } = {}
) {
  const scopeData = await loadScaleProductsData(supabaseAdmin);
  const scope = buildScopePayload(scopeData);
  const normalizedPage = normalizePage(page, 1);
  const normalizedLimit = normalizeLimit(limit, 20);
  const normalizedProductCodes = normalizeProductCodes(productCodes);
  const normalizedLotNos = Array.from(new Set((Array.isArray(lotNos) ? lotNos : []).map((value) => normalizeText(value)).filter(Boolean)));

  if (!scope.departmentId) {
    return {
      scope,
      rows: [],
      summary: buildProductionStockMovementSummary([]),
      filters: buildFilters({ dateFrom, dateTo, productCodes: normalizedProductCodes, lotNos: normalizedLotNos }),
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        totalCount: 0,
        totalPages: 0,
      },
    };
  }

  if (activityOnly) {
    try {
      const reportDateFrom = normalizeText(dateFrom) || getBangkokDateInput();
      const reportDateTo = normalizeText(dateTo) || reportDateFrom;
      const { data: activityRows, error: activityError } = await supabaseAdmin.rpc(
        "get_production_stock_activity_summary",
        {
          p_department_id: scope.departmentId,
          p_date_from: reportDateFrom,
          p_date_to: reportDateTo,
          p_issue_types: issueTypes.length ? issueTypes : null,
          p_product_codes: normalizedProductCodes.length ? normalizedProductCodes : null,
        }
      );

      if (activityError) throw activityError;

      const rows = (Array.isArray(activityRows) ? activityRows : []).map((row) => ({
        issueDate: normalizeText(row.issue_date),
        lotNo: normalizeText(row.lot_no) || "-",
        productCode: normalizeUpperText(row.product_code) || "-",
        productName: normalizeText(row.product_name) || normalizeUpperText(row.product_code),
        inboundQuantity: 0,
        inboundWeightKg: 0,
        issueQuantity: normalizeDecimal(row.issue_quantity),
        issueWeightKg: normalizeDecimal(row.issue_weight_kg),
        returnQuantity: normalizeDecimal(row.return_quantity),
        returnWeightKg: normalizeDecimal(row.return_weight_kg),
        wasteQuantity: normalizeDecimal(row.waste_quantity),
        wasteWeightKg: normalizeDecimal(row.waste_weight_kg),
        actualQuantity: normalizeDecimal(row.actual_quantity),
        actualWeightKg: normalizeDecimal(row.actual_weight_kg),
        balanceQuantity: 0,
        balanceWeightKg: 0,
      }));
      const paged = paginateRows(rows, normalizedPage, normalizedLimit, includeAll);

      return {
        scope,
        rows: paged.rows,
        summary: buildProductionStockMovementSummary(rows),
        filters: buildFilters({
          dateFrom: reportDateFrom,
          dateTo: reportDateTo,
          productCodes: normalizedProductCodes,
          lotNos: normalizedLotNos,
        }),
        pagination: paged.pagination,
      };
    } catch {
      // RPC may not be installed during a rolling deployment; use the exact JS path below.
    }
  }

  const [receiptPayload, issuePayload] = await Promise.all([
    activityOnly
      ? Promise.resolve({ rows: [], filters: { dateFrom, dateTo } })
      : loadScaleReceiptSummaryReportData(supabaseAdmin, {
        departmentId: scope.departmentId,
        dateFrom,
        dateTo,
        productCodes: normalizedProductCodes,
        includeAll: true,
        page: 1,
        limit: 200,
      }),
    loadProductionStockIssueSummaryReportData(supabaseAdmin, {
      dateFrom,
      dateTo,
      productCodes: normalizedProductCodes,
      issueTypes,
      includeAll: true,
      page: 1,
      limit: 200,
    }),
  ]);

  const reportDateFrom = receiptPayload?.filters?.dateFrom || dateFrom || getBangkokDateInput();
  const reportDateTo = receiptPayload?.filters?.dateTo || dateTo || reportDateFrom;
  const previousReportDate = getPreviousIsoDate(reportDateFrom);

  let prePeriodDateFrom = "2020-01-01";
  if (!activityOnly) {
    try {
      const [minReceiptResult, minMovementResult] = await Promise.all([
        supabaseAdmin
          .from("production_weight_receipts")
          .select("weighed_at")
          .order("weighed_at", { ascending: true })
          .limit(1)
          .maybeSingle(),
        supabaseAdmin
          .from("production_stock_movements")
          .select("movement_date")
          .order("movement_date", { ascending: true })
          .limit(1)
          .maybeSingle(),
      ]);

      let minDate = null;
      if (minReceiptResult?.data?.weighed_at) {
        minDate = minReceiptResult.data.weighed_at.slice(0, 10);
      }
      if (minMovementResult?.data?.movement_date) {
        const movDate = minMovementResult.data.movement_date;
        if (!minDate || movDate < minDate) {
          minDate = movDate;
        }
      }

      if (minDate && minDate > "2020-01-01") {
        prePeriodDateFrom = minDate;
      }
    } catch {
      // Fallback to "2020-01-01"
    }
  }

  const [rawMovementRows, rawReturnReceiptRows, openingBalanceRows] = await Promise.all([
    loadReturnAndWasteMovementRows(supabaseAdmin, {
      departmentId: scope.departmentId,
      dateFrom: reportDateFrom,
      dateTo: reportDateTo,
      productCodes: normalizedProductCodes,
    }),
    loadStockReturnReceiptRows(supabaseAdmin, {
      departmentId: scope.departmentId,
      dateFrom: reportDateFrom,
      dateTo: reportDateTo,
      productCodes: normalizedProductCodes,
    }),
    activityOnly
      ? Promise.resolve([])
      : loadOpeningBalanceRows(supabaseAdmin, {
        departmentId: scope.departmentId,
        categoryCode: scope.categoryCode,
        productCodes: normalizedProductCodes,
        scopeProducts: scope.products,
      }),
  ]);
  const [movementRows, returnReceiptRows] = await Promise.all([
    filterRowsByActiveSourceIssues(supabaseAdmin, rawMovementRows),
    filterRowsByActiveSourceIssues(supabaseAdmin, rawReturnReceiptRows),
  ]);

  let openingBalancesByLot = buildOpeningBalancesByLot(openingBalanceRows);
  let usedAggregatedOpening = false;

  const lotMetaMap = new Map();
  const addMeta = (pCode, lot, pName) => {
    const key = [normalizeUpperText(pCode), normalizeText(lot) || "-"].join("|");
    if (!lotMetaMap.has(key)) {
      lotMetaMap.set(key, {
        productCode: normalizeUpperText(pCode),
        productName: normalizeText(pName) || pCode,
        lotNo: normalizeText(lot) || "-",
      });
    }
  };

  (openingBalanceRows || []).forEach((r) => addMeta(r.product_code, r.lot_no, r.product_name_snapshot));
  (receiptPayload?.rows || []).forEach((r) => addMeta(r.productCode, r.lotNo, r.productName));
  (issuePayload?.rows || []).forEach((r) => addMeta(r.productCode, r.lotNo, r.productName));
  (movementRows || []).forEach((r) => addMeta(r.product_code, r.lot_no, r.product_name_snapshot));
  (returnReceiptRows || []).forEach((r) => addMeta(r.productCode, r.lotNo, r.productName));

  if (!activityOnly && previousReportDate && previousReportDate >= prePeriodDateFrom) {
    const { data: openingRpcRows, error: openingRpcError } = await supabaseAdmin.rpc(
      "get_production_stock_opening_as_of",
      {
        p_department_id: scope.departmentId,
        p_category_code: scope.categoryCode,
        p_date_from: reportDateFrom,
        p_as_of_cutoff: toBangkokReportCutoffIso(reportDateTo),
        p_issue_types: issueTypes.length ? issueTypes : null,
        p_product_codes: normalizedProductCodes.length ? normalizedProductCodes : null,
      }
    );

    if (!openingRpcError && Array.isArray(openingRpcRows)) {
      openingBalancesByLot = new Map(openingRpcRows.map((row) => [
        [normalizeUpperText(row.product_code), normalizeText(row.lot_no) || "-"].join("|"),
        {
          quantity: normalizeDecimal(row.balance_quantity),
          weightKg: normalizeDecimal(row.balance_weight_kg),
        },
      ]));
      openingRpcRows.forEach((row) => addMeta(row.product_code, row.lot_no, row.product_name));
      usedAggregatedOpening = true;
    }
  }

  if (!activityOnly && !usedAggregatedOpening && previousReportDate && previousReportDate >= prePeriodDateFrom) {
    const [preReceiptPayload, preIssuePayload] = await Promise.all([
      loadScaleReceiptSummaryReportData(supabaseAdmin, {
        departmentId: scope.departmentId,
        dateFrom: prePeriodDateFrom,
        dateTo: previousReportDate,
        productCodes: normalizedProductCodes,
        includeAll: true,
        page: 1,
        limit: 200,
      }),
      loadProductionStockIssueSummaryReportData(supabaseAdmin, {
        dateFrom: prePeriodDateFrom,
        dateTo: previousReportDate,
        productCodes: normalizedProductCodes,
        issueTypes,
        includeAll: true,
        page: 1,
        limit: 200,
      }),
    ]);

    const [rawPreMovementRows, rawPreReturnReceiptRows] = await Promise.all([
      loadReturnAndWasteMovementRows(supabaseAdmin, {
        departmentId: scope.departmentId,
        dateFrom: prePeriodDateFrom,
        dateTo: previousReportDate,
        productCodes: normalizedProductCodes,
      }),
      loadStockReturnReceiptRows(supabaseAdmin, {
        departmentId: scope.departmentId,
        dateFrom: prePeriodDateFrom,
        dateTo: previousReportDate,
        productCodes: normalizedProductCodes,
      }),
    ]);
    const [preMovementRows, preReturnReceiptRows] = await Promise.all([
      filterRowsByActiveSourceIssues(supabaseAdmin, rawPreMovementRows),
      filterRowsByActiveSourceIssues(supabaseAdmin, rawPreReturnReceiptRows),
    ]);

    const preBaseRows = buildProductionStockMovementRows(preReceiptPayload?.rows, preIssuePayload?.rows);
    const preHasReturnMovements = preMovementRows.some(
      (row) => normalizeText(row?.movement_type) === "return_in"
    );
    const preRowsWithReturns = preHasReturnMovements
      ? preBaseRows
      : applyReturnReceiptRows(preBaseRows, preReturnReceiptRows);
    const preAllRows = applyMovementRows(preRowsWithReturns, preMovementRows);
    openingBalancesByLot = mergeFinalBalancesByLot(openingBalancesByLot, preAllRows);
    (preAllRows || []).forEach((r) => addMeta(r.productCode, r.lotNo, r.productName));
  }

  const baseRows = buildProductionStockMovementRows(receiptPayload?.rows, issuePayload?.rows);
  const hasReturnMovements = movementRows.some(
    (row) => normalizeText(row?.movement_type) === "return_in"
  );
  const rowsWithReturns = hasReturnMovements
    ? baseRows
    : applyReturnReceiptRows(baseRows, returnReceiptRows);
  const allRows = recalculateProductionStockMovementBalances(
    applyMovementRows(rowsWithReturns, movementRows),
    openingBalancesByLot
  );
  const displayRows = expandDailyBalances
    ? expandProductionStockMovementRowsWithDailyBalances(allRows, {
        dateFrom: reportDateFrom,
        dateTo: reportDateTo,
        openingBalancesByLot,
        lotMetaMap,
      })
    : allRows;
  const matchesSelectedLot = (row) => {
    const productCode = normalizeUpperText(row.productCode);
    const lotNo = normalizeText(row.lotNo) || "-";
    return normalizedLotNos.some((selection) => {
      const separatorIndex = selection.indexOf("::");
      if (separatorIndex < 0) {
        return selection === lotNo;
      }
      return normalizeUpperText(selection.slice(0, separatorIndex)) === productCode
        && normalizeText(selection.slice(separatorIndex + 2)) === lotNo;
    });
  };
  const filteredDisplayRows = normalizedLotNos.length
    ? displayRows.filter(matchesSelectedLot)
    : displayRows;
  const filteredAllRows = normalizedLotNos.length
    ? allRows.filter(matchesSelectedLot)
    : allRows;
  const paged = paginateRows(filteredDisplayRows, normalizedPage, normalizedLimit, includeAll);

  return {
    scope,
    rows: paged.rows,
    summary: buildProductionStockMovementSummary(filteredAllRows),
    filters: buildFilters({
      dateFrom: reportDateFrom,
      dateTo: reportDateTo,
      productCodes: normalizedProductCodes,
      lotNos: normalizedLotNos,
    }),
    pagination: paged.pagination,
  };
}

export async function loadProductionStockLotBalanceSummaryReportDataUncached(
  supabaseAdmin = getSupabaseAdmin(),
  {
    productCodes = [],
    page = 1,
    limit = 20,
    includeAll = false,
  } = {}
) {
  const scopeData = await loadScaleProductsData(supabaseAdmin);
  const scope = buildScopePayload(scopeData);
  const normalizedPage = normalizePage(page, 1);
  const normalizedLimit = normalizeLimit(limit, 20);
  const normalizedProductCodes = normalizeProductCodes(productCodes);

  if (!scope.departmentId) {
    return {
      scope,
      rows: [],
      summary: buildProductionStockMovementSummary([]),
      filters: { productCodes: normalizedProductCodes },
      pagination: {
        page: normalizedPage,
        limit: normalizedLimit,
        totalCount: 0,
        totalPages: 0,
      },
    };
  }

  // 1. Try fast PostgreSQL RPC aggregation
  try {
    const { data: rpcRows, error: rpcError } = await supabaseAdmin.rpc(
      "get_production_stock_lot_balances",
      {
        p_department_id: scope.departmentId,
        p_product_codes: normalizedProductCodes.length ? normalizedProductCodes : null,
      }
    );

    if (!rpcError && Array.isArray(rpcRows)) {
      const mappedRows = rpcRows.map((r) => ({
        productCode: normalizeUpperText(r.product_code),
        productName: normalizeText(r.product_name) || r.product_code,
        lotNo: normalizeText(r.lot_no) || "-",
        balanceQuantity: normalizeDecimal(r.balance_quantity),
        balanceWeightKg: normalizeDecimal(r.balance_weight_kg),
        inboundQuantity: normalizeDecimal(r.inbound_quantity),
        inboundWeightKg: normalizeDecimal(r.inbound_weight_kg),
        issueQuantity: normalizeDecimal(r.issue_quantity),
        issueWeightKg: normalizeDecimal(r.issue_weight_kg),
        returnQuantity: normalizeDecimal(r.return_quantity),
        returnWeightKg: normalizeDecimal(r.return_weight_kg),
        wasteQuantity: normalizeDecimal(r.waste_quantity),
        wasteWeightKg: normalizeDecimal(r.waste_weight_kg),
        actualQuantity: normalizeDecimal(r.actual_quantity),
        actualWeightKg: normalizeDecimal(r.actual_weight_kg),
        openingQuantity: 0,
        openingWeightKg: 0,
      }));

      mappedRows.sort((a, b) => {
        const p = a.productCode.localeCompare(b.productCode);
        if (p !== 0) return p;
        return a.lotNo.localeCompare(b.lotNo);
      });

      const paged = paginateRows(mappedRows, normalizedPage, normalizedLimit, includeAll);

      return {
        scope,
        rows: paged.rows,
        summary: buildProductionStockMovementSummary(mappedRows),
        filters: { productCodes: normalizedProductCodes },
        pagination: paged.pagination,
      };
    }
  } catch {
    // Fallback to JS-based cumulative calculation below
  }

  // 2. Fallback to JS-based cumulative calculation
  const reportDate = getBangkokDateInput();
  const movementPayload = await loadProductionStockMovementSummaryReportData(supabaseAdmin, {
    dateFrom: "2020-01-01",
    dateTo: reportDate,
    productCodes: normalizedProductCodes,
    includeAll: true,
    expandDailyBalances: false,
    page: 1,
    limit: 200,
  });
  const finalRows = buildCumulativeLotBalanceRows(movementPayload.rows).filter((row) => (
    normalizeDecimal(row?.balanceQuantity) > 0
    || normalizeDecimal(row?.balanceWeightKg) > 0
  ));

  // Sort rows by productCode, then lotNo
  finalRows.sort((a, b) => {
    const p = a.productCode.localeCompare(b.productCode);
    if (p !== 0) return p;
    return a.lotNo.localeCompare(b.lotNo);
  });

  const paged = paginateRows(finalRows, normalizedPage, normalizedLimit, includeAll);

  return {
    scope,
    rows: paged.rows,
    summary: buildProductionStockMovementSummary(finalRows),
    filters: { productCodes: normalizedProductCodes },
    pagination: paged.pagination,
  };
}

export async function loadProductionStockLotBalanceSummaryReportData(
  supabaseAdmin = null,
  options = {}
) {
  const admin = supabaseAdmin || getSupabaseAdmin();
  return loadProductionStockLotBalanceSummaryReportDataUncached(admin, options);
}
