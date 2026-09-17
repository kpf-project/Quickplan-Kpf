import "server-only";

import { getSupabaseAdmin } from "@/lib/adminApi";
import { fetchGatewayJson } from "@/lib/gatewayClient";
import { loadProductionStockMovementSummaryReportData } from "@/lib/production-stock-balance";
import {
  JAM_GOODS_CODES,
  buildProductionInputOutputReport,
  getReferencedJamIssueRef,
  isActiveErpDocument,
  isProductionJamPlanForReportDate,
  isProductionJamRequisitionRef,
} from "@/lib/production-input-output-report";
import {
  getJamRequisitionDateForReportDate,
  shiftIsoDate,
} from "@/lib/production-input-output-dates";
import {
  fetchAllSupabaseRows,
  fetchSupabaseRowsByChunks,
} from "@/lib/supabaseRangeFetch";

function normalizeText(value) {
  return String(value ?? "").trim();
}

function normalizeCode(value) {
  return normalizeText(value).toUpperCase();
}

function getBangkokDateInput() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(new Date())
      .map((part) => [part.type, part.value])
  );
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function normalizeDate(value, fallback) {
  const normalized = normalizeText(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : fallback;
}

function buildUtcRange(dateFrom, dateTo) {
  return {
    from: new Date(`${dateFrom}T00:00:00+07:00`).toISOString(),
    to: new Date(`${dateTo}T23:59:59.999+07:00`).toISOString(),
  };
}

async function loadPieceRateRows(supabaseAdmin, from, to) {
  return fetchAllSupabaseRows(
    () => supabaseAdmin
      .from("production_piece_rate_logs")
      .select(
        "actual_weighed_at,logged_at,product_code_snapshot,product_goods_code_snapshot,product_sku_code_snapshot,product_name_snapshot,count_value_snapshot,normalized_kg_amount_snapshot,doc_status,replaced_by_log_id"
      )
      .gte("actual_weighed_at", from)
      .lte("actual_weighed_at", to)
      .or("doc_status.eq.active,doc_status.is.null")
      .is("replaced_by_log_id", null)
      .order("actual_weighed_at", { ascending: true }),
    {
      onError: (error) => {
        throw new Error(`Failed to load FG piece-rate rows: ${error.message}`);
      },
    }
  ).then((rows) => rows.map((row) => ({
    actualWeighedAt: row.actual_weighed_at || row.logged_at,
    loggedAt: row.logged_at,
    productCode: row.product_goods_code_snapshot || row.product_code_snapshot,
    productGoodsCode: row.product_goods_code_snapshot || row.product_code_snapshot,
    productSkuCode: row.product_sku_code_snapshot || row.product_code_snapshot,
    productName: row.product_name_snapshot,
    countValue: Number(row.count_value_snapshot || 0),
    normalizedKgAmount: Number(row.normalized_kg_amount_snapshot || 0),
  })));
}

async function loadWasteRows(supabaseAdmin, from, to) {
  return fetchAllSupabaseRows(
    () => supabaseAdmin
      .from("production_piece_rate_waste_logs")
      .select(
        "actual_weighed_at,logged_at,product_code_snapshot,product_goods_code_snapshot,product_sku_code_snapshot,product_name_snapshot,waste_category,waste_weight_kg,status"
      )
      .gte("actual_weighed_at", from)
      .lte("actual_weighed_at", to)
      .eq("status", "confirmed")
      .order("actual_weighed_at", { ascending: true }),
    {
      onError: (error) => {
        throw new Error(`Failed to load waste rows: ${error.message}`);
      },
    }
  ).then((rows) => rows.map((row) => ({
    actualWeighedAt: row.actual_weighed_at || row.logged_at,
    loggedAt: row.logged_at,
    productCode: row.product_goods_code_snapshot || row.product_code_snapshot,
    productGoodsCode: row.product_goods_code_snapshot || row.product_code_snapshot,
    productSkuCode: row.product_sku_code_snapshot || row.product_code_snapshot,
    productName: row.product_name_snapshot,
    wasteCategory: row.waste_category,
    wasteWeightKg: Number(row.waste_weight_kg || 0),
    status: row.status || "confirmed",
  })));
}

async function loadJamRowsForCode(code, dateFrom, dateTo, reportDate) {
  const rows = [];
  let cursor = null;

  for (let page = 0; page < 100; page += 1) {
    const params = new URLSearchParams({
      search: code,
      dateFrom,
      dateTo,
      page: "1",
      pageSize: "500",
    });
    if (cursor) params.set("cursor", cursor);

    const result = await fetchGatewayJson(
      "/api/raw-material-requisitions",
      params,
      "production"
    );
    if (!result.ok) {
      throw new Error(result.error?.message || `Failed to load requisitions for ${code}`);
    }

    const payload = result.data || {};
    rows.push(
      ...(Array.isArray(payload.data) ? payload.data : []).filter(
        (row) =>
          normalizeCode(row?.TRD_SH_CODE) === code
          && isActiveErpDocument(row)
          && isProductionJamRequisitionRef(row?.DI_REF)
          && isProductionJamPlanForReportDate(row, reportDate)
      )
    );

    if (!payload.cursor?.hasMore || !payload.cursor?.next) break;
    cursor = payload.cursor.next;
  }

  return rows;
}

async function loadJamReturnRowsForIssueRef(issueRef) {
  const rows = [];
  let cursor = null;

  for (let page = 0; page < 100; page += 1) {
    const params = new URLSearchParams({
      search: issueRef,
      page: "1",
      pageSize: "500",
    });
    if (cursor) params.set("cursor", cursor);

    const result = await fetchGatewayJson(
      "/api/raw-material-returns",
      params,
      "production"
    );
    if (!result.ok) {
      throw new Error(`Failed to load returns for ${issueRef}: ${result.error?.message || "Unknown error"}`);
    }

    const payload = result.data || {};
    rows.push(
      ...(Array.isArray(payload.data) ? payload.data : []).filter((row) => {
        const code = normalizeCode(row?.TRD_SH_CODE);
        return JAM_GOODS_CODES.includes(code)
          && isActiveErpDocument(row)
          && getReferencedJamIssueRef(row) === issueRef;
      })
    );

    if (!payload.cursor?.hasMore || !payload.cursor?.next) break;
    cursor = payload.cursor.next;
  }

  return rows;
}

async function loadJamRows(reportDateFrom, reportDateTo) {
  const reportDates = [];
  for (
    let reportDate = reportDateFrom;
    reportDate <= reportDateTo && reportDates.length < 366;
    reportDate = shiftIsoDate(reportDate, 1)
  ) {
    reportDates.push(reportDate);
  }

  const dailyResults = await Promise.all(
    reportDates.map(async (reportDate) => {
      const requisitionDate = getJamRequisitionDateForReportDate(reportDate);
      if (!requisitionDate) return [];
      const results = await Promise.all(
        JAM_GOODS_CODES.map((code) =>
          loadJamRowsForCode(
            code,
            requisitionDate,
            requisitionDate,
            reportDate
          )
        )
      );
      return results.flat().map((row) => ({ ...row, reportDate }));
    })
  );

  const issueRows = dailyResults.flat();
  const issueRefs = Array.from(
    new Set(
      issueRows
        .map((row) => normalizeCode(row?.DI_REF))
        .filter(isProductionJamRequisitionRef)
    )
  );
  const returnRows = (
    await Promise.all(issueRefs.map((issueRef) => loadJamReturnRowsForIssueRef(issueRef)))
  ).flat();

  return { issueRows, returnRows };
}

function buildFgAliasMap(pieceRateRows) {
  const aliasToGoodsCode = new Map();
  for (const row of pieceRateRows) {
    const goodsCode = normalizeCode(row?.productGoodsCode || row?.productCode);
    if (!goodsCode) continue;
    [row?.productGoodsCode, row?.productCode, row?.productSkuCode]
      .map(normalizeCode)
      .filter(Boolean)
      .forEach((alias) => aliasToGoodsCode.set(alias, goodsCode));
  }
  return aliasToGoodsCode;
}

async function loadBomMappings(supabaseAdmin, pieceRateRows, shellProducts) {
  const fgAliasMap = buildFgAliasMap(pieceRateRows);
  const fgAliases = Array.from(fgAliasMap.keys());
  if (!fgAliases.length) return [];

  const tradeRows = await fetchSupabaseRowsByChunks(
    fgAliases,
    (chunk) => supabaseAdmin
      .from("pallet_trade_code_barcodes")
      .select("goods_code,sku_code")
      .in("goods_code", chunk),
    { onError: () => [] }
  );
  for (const row of tradeRows) {
    const goodsCode = normalizeCode(row.goods_code);
    const skuCode = normalizeCode(row.sku_code);
    if (goodsCode && skuCode && fgAliasMap.has(goodsCode)) {
      fgAliasMap.set(skuCode, fgAliasMap.get(goodsCode));
    }
  }

  const bomSkuCandidates = Array.from(fgAliasMap.keys());
  const bomRows = await fetchSupabaseRowsByChunks(
    bomSkuCandidates,
    (chunk) => supabaseAdmin
      .from("production_boms")
      .select("id,sku_code,status")
      .in("sku_code", chunk),
    {
      onError: (error) => {
        throw new Error(`Failed to load BOM headers: ${error.message}`);
      },
    }
  );
  if (!bomRows.length) return [];

  const bomIds = bomRows.map((row) => row.id).filter(Boolean);
  const versionRows = await fetchSupabaseRowsByChunks(
    bomIds,
    (chunk) => supabaseAdmin
      .from("production_bom_versions")
      .select("id,bom_id,version_no,status")
      .in("bom_id", chunk)
      .order("version_no", { ascending: false }),
    {
      onError: (error) => {
        throw new Error(`Failed to load BOM versions: ${error.message}`);
      },
    }
  );
  // A product may have multiple BOM versions. Load every available version so
  // historical reports can still resolve a material that exists in an older
  // version (for example BL0-5001 -> WKB-0002). Duplicate mappings are removed
  // below when they are normalized into the report rows.
  const versionIds = versionRows.map((row) => row.id).filter(Boolean);
  if (!versionIds.length) return [];

  const itemRows = await fetchSupabaseRowsByChunks(
    versionIds,
    (chunk) => supabaseAdmin
      .from("production_bom_items")
      .select("version_id,material_sku_code,material_goods_code")
      .in("version_id", chunk),
    {
      onError: (error) => {
        throw new Error(`Failed to load BOM items: ${error.message}`);
      },
    }
  );
  const materialSkuCodes = Array.from(
    new Set(itemRows.map((row) => normalizeCode(row.material_sku_code)).filter(Boolean))
  );
  const materialTradeRows = await fetchSupabaseRowsByChunks(
    materialSkuCodes,
    (chunk) => supabaseAdmin
      .from("pallet_trade_code_barcodes")
      .select("goods_code,sku_code")
      .in("sku_code", chunk),
    { onError: () => [] }
  );
  const goodsCodeBySku = new Map(
    materialTradeRows.map((row) => [normalizeCode(row.sku_code), normalizeCode(row.goods_code)])
  );
  const shellByCode = new Map(
    (Array.isArray(shellProducts) ? shellProducts : []).map((row) => [
      normalizeCode(row.code),
      normalizeText(row.name),
    ])
  );
  const versionToBom = new Map(versionRows.map((version) => [version.id, version.bom_id]));
  const bomById = new Map(bomRows.map((row) => [row.id, row]));
  const mappings = [];

  for (const item of itemRows) {
    const shellCode = normalizeCode(item.material_goods_code)
      || goodsCodeBySku.get(normalizeCode(item.material_sku_code))
      || normalizeCode(item.material_sku_code);
    if (!shellByCode.has(shellCode)) continue;

    const bom = bomById.get(versionToBom.get(item.version_id));
    const fgCode = fgAliasMap.get(normalizeCode(bom?.sku_code));
    if (!fgCode) continue;

    const fgRow = pieceRateRows.find(
      (row) => normalizeCode(row.productGoodsCode || row.productCode) === fgCode
    );
    mappings.push({
      fgCode,
      fgName: normalizeText(fgRow?.productName),
      shellCode,
      shellName: shellByCode.get(shellCode) || shellCode,
    });
  }

  return mappings;
}

function warningFromRejected(result, source) {
  if (result.status !== "rejected") return null;
  return {
    source,
    message: result.reason?.message || `ไม่สามารถโหลดข้อมูล ${source} ได้`,
  };
}

export async function loadProductionInputOutputReportData(
  supabaseAdmin = getSupabaseAdmin(),
  { dateFrom = null, dateTo = null } = {}
) {
  const today = getBangkokDateInput();
  const normalizedDateFrom = normalizeDate(dateFrom, today);
  const normalizedDateTo = normalizeDate(dateTo, normalizedDateFrom);
  const rangeStart = normalizedDateFrom <= normalizedDateTo ? normalizedDateFrom : normalizedDateTo;
  const rangeEnd = normalizedDateFrom <= normalizedDateTo ? normalizedDateTo : normalizedDateFrom;
  const { from, to } = buildUtcRange(rangeStart, rangeEnd);

  const [stockResult, fgResult, wasteResult, jamResult] = await Promise.allSettled([
    loadProductionStockMovementSummaryReportData(supabaseAdmin, {
      dateFrom: rangeStart,
      dateTo: rangeEnd,
      issueTypes: ["KPF"],
      includeAll: true,
      page: 1,
      limit: 200,
      activityOnly: true,
      expandDailyBalances: false,
    }),
    loadPieceRateRows(supabaseAdmin, from, to),
    loadWasteRows(supabaseAdmin, from, to),
    loadJamRows(rangeStart, rangeEnd),
  ]);

  const stockPayload = stockResult.status === "fulfilled" ? stockResult.value : null;
  const pieceRateRows = fgResult.status === "fulfilled" ? fgResult.value : [];
  const shellProducts = stockPayload?.scope?.products || [];
  let bomMappings = [];
  let bomWarning = null;
  try {
    bomMappings = await loadBomMappings(supabaseAdmin, pieceRateRows, shellProducts);
  } catch (error) {
    bomWarning = { source: "BOM", message: error.message };
  }

  const jamPayload = jamResult.status === "fulfilled"
    ? jamResult.value
    : { issueRows: [], returnRows: [] };
  const report = buildProductionInputOutputReport({
    stockRows: stockPayload?.rows || [],
    pieceRateRows,
    wasteRows: wasteResult.status === "fulfilled" ? wasteResult.value : [],
    bomMappings,
    jamRows: jamPayload.issueRows,
    jamReturnRows: jamPayload.returnRows,
  });
  const warnings = [
    warningFromRejected(stockResult, "เปลือกใช้จริง"),
    warningFromRejected(fgResult, "FG"),
    warningFromRejected(wasteResult, "ของเสีย"),
    warningFromRejected(jamResult, "แยมใช้จริง"),
    bomWarning,
    ...(report.warnings || []),
  ].filter(Boolean);

  return {
    ...report,
    scope: stockPayload?.scope || null,
    filters: { dateFrom: rangeStart, dateTo: rangeEnd },
    warnings,
    generatedAt: new Date().toISOString(),
  };
}
