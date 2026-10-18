import "server-only";

import { ApiError, getSupabaseAdmin } from "@/lib/adminApi";
import { fetchGatewayJson } from "@/lib/gatewayClient";
import { resolvePieceRateReportMetrics } from "@/lib/pieceRateReportMetrics";
import { loadProductionStockMovementSummaryReportData } from "@/lib/production-stock-balance";
import { loadProductionJamUsageRows } from "@/lib/production-jam-usage";
import {
  JAM_GOODS_CODES,
  buildProductionInputOutputReport,
  getReferencedJamIssueRef,
  isActiveErpDocument,
  isProductionJamPlanForReportDate,
  isProductionJamRequisitionRef,
  mergeManualJamUsageRows,
  selectPrimaryBomFormulaVersions,
  toBangkokDateKey,
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

async function loadWipIssueRows(supabaseAdmin, dateFrom, dateTo) {
  const rows = await fetchAllSupabaseRows(() => supabaseAdmin
    .from("production_stock_movements")
    .select("id,movement_date,department_code,product_code,product_name_snapshot,lot_no,uom_name,quantity_out,weight_out_kg,source_document_type,source_document_no,metadata,products_cache!inner(iccat_code)")
    .in("source_document_type", ["piece_rate_issue", "piece_rate_prison_issue"])
    .eq("department_code", "KP13")
    .eq("products_cache.iccat_code", "03")
    .gte("movement_date", dateFrom).lte("movement_date", dateTo)
    .order("id", { ascending: true }));
  // A cancellation can happen after the selected report period.
  const voids = await fetchSupabaseRowsByChunks(rows.map((row) => row.source_document_no), (codes) =>
    fetchAllSupabaseRows(() => supabaseAdmin.from("production_stock_movements")
      .select("source_document_type,source_document_no,reference_no")
      .eq("source_document_type", "piece_rate_issue_void")
      .in("source_document_no", codes).order("id", { ascending: true }))
      .then((data) => ({ data })));
  return [...rows, ...voids];
}

async function loadPieceRateRows(supabaseAdmin, from, to) {
  return fetchAllSupabaseRows(
    () => supabaseAdmin
      .from("production_piece_rate_logs")
      .select(
        "actual_weighed_at,logged_at,product_code_snapshot,product_goods_code_snapshot,product_sku_code_snapshot,product_name_snapshot,input_mode_snapshot,input_value,count_value_snapshot,weight_kg_snapshot,kg_per_pail_snapshot,normalized_kg_amount_snapshot,doc_status,replaced_by_log_id"
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
  ).then((rows) => rows.map((row) => {
    const metrics = resolvePieceRateReportMetrics(row);
    return {
      actualWeighedAt: row.actual_weighed_at || row.logged_at,
      loggedAt: row.logged_at,
      productCode: row.product_goods_code_snapshot || row.product_code_snapshot,
      productGoodsCode: row.product_goods_code_snapshot || row.product_code_snapshot,
      productSkuCode: row.product_sku_code_snapshot || row.product_code_snapshot,
      productName: row.product_name_snapshot,
      countValue: metrics.countValue,
      normalizedKgAmount: metrics.normalizedKgAmount,
    };
  }));
}

export async function loadProductionJamOutputProducts(supabaseAdmin, usageDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(usageDate) || !Number.isFinite(Date.parse(`${usageDate}T00:00:00+07:00`))) {
    throw new ApiError(400, "กรุณาเลือกวันที่ใช้แยม");
  }
  const { from, to } = buildUtcRange(usageDate, usageDate);
  const rows = await loadPieceRateRows(supabaseAdmin, from, to);
  const mappings = await loadBomMappings(supabaseAdmin, rows, []);
  const products = new Map();
  for (const row of rows) {
    const code = normalizeCode(row.productGoodsCode || row.productCode);
    const jamCodes = [...new Set(mappings.filter((mapping) => mapping.fgCode === code && mapping.jamQty > 0).map((mapping) => mapping.jamCode))];
    const current = products.get(code) || { code, name: row.productName, quantity: 0, weightKg: 0, jamCodes };
    current.quantity += Number(row.countValue || 0);
    current.weightKg += Number(row.normalizedKgAmount || 0);
    products.set(code, current);
  }
  return [...products.values()].sort((a, b) => a.code.localeCompare(b.code));
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

async function loadJamIssueRows(dateFrom, dateTo) {
  const rows = [];
  let cursor = null;

  for (let page = 0; page < 100; page += 1) {
    const params = new URLSearchParams({
      goodsCodes: JAM_GOODS_CODES.join(","),
      dateFrom,
      dateTo,
      page: "1",
      pageSize: "500",
      includeTotal: "false",
    });
    if (cursor) params.set("cursor", cursor);

    const result = await fetchGatewayJson(
      "/api/raw-material-requisitions",
      params,
      "production"
    );
    if (!result.ok) {
      throw new Error(result.error?.message || "Failed to load jam requisitions");
    }

    const payload = result.data || {};
    rows.push(...(Array.isArray(payload.data) ? payload.data : []));

    if (!payload.cursor?.hasMore || !payload.cursor?.next) break;
    cursor = payload.cursor.next;
  }

  return rows;
}

async function loadJamReturnRows(issueRefs) {
  if (!issueRefs.length) return [];

  const rows = [];
  let cursor = null;

  for (let page = 0; page < 100; page += 1) {
    const params = new URLSearchParams({
      issueRefs: issueRefs.join("|"),
      page: "1",
      pageSize: "500",
      includeTotal: "false",
    });
    if (cursor) params.set("cursor", cursor);

    const result = await fetchGatewayJson(
      "/api/raw-material-returns",
      params,
      "production"
    );
    if (!result.ok) {
      throw new Error(`Failed to load jam returns: ${result.error?.message || "Unknown error"}`);
    }

    const payload = result.data || {};
    rows.push(...(Array.isArray(payload.data) ? payload.data : []));

    if (!payload.cursor?.hasMore || !payload.cursor?.next) break;
    cursor = payload.cursor.next;
  }

  return rows;
}

async function loadJamRows(reportDateFrom, reportDateTo) {
  const reportDates = [];
  for (
    let reportDate = reportDateFrom;
    reportDate <= reportDateTo && reportDate < "2026-10-02" && reportDates.length < 366;
    reportDate = shiftIsoDate(reportDate, 1)
  ) {
    reportDates.push(reportDate);
  }

  const datedReports = reportDates
    .map((reportDate) => ({
      reportDate,
      requisitionDate: getJamRequisitionDateForReportDate(reportDate),
    }))
    .filter(({ requisitionDate }) => requisitionDate);
  if (!datedReports.length) return { issueRows: [], returnRows: [] };

  const dateFrom = datedReports.reduce(
    (earliest, row) => row.requisitionDate < earliest ? row.requisitionDate : earliest,
    datedReports[0].requisitionDate
  );
  const rawIssueRows = await loadJamIssueRows(dateFrom, datedReports.at(-1).reportDate);
  const issueRows = rawIssueRows.flatMap((row) => {
    const code = normalizeCode(row?.TRD_SH_CODE);
    const issueRef = normalizeCode(row?.DI_REF);
    const issueDate = toBangkokDateKey(row?.DI_DATE);
    if (
      !JAM_GOODS_CODES.includes(code)
      || !isActiveErpDocument(row)
      || !isProductionJamRequisitionRef(issueRef)
    ) return [];

    const matchingReport = datedReports.find(({ reportDate, requisitionDate }) =>
      isProductionJamPlanForReportDate(row, reportDate)
      && (issueRef.startsWith("T")
        ? issueDate === reportDate
        : issueDate === requisitionDate)
    );
    return matchingReport ? [{ ...row, reportDate: matchingReport.reportDate }] : [];
  });
  const issueRefs = Array.from(
    new Set(
      issueRows
        .map((row) => normalizeCode(row?.DI_REF))
        .filter(isProductionJamRequisitionRef)
    )
  );
  const issueRefSet = new Set(issueRefs);
  const returnRows = (await loadJamReturnRows(issueRefs)).filter((row) => {
    const code = normalizeCode(row?.TRD_SH_CODE);
    return JAM_GOODS_CODES.includes(code)
      && isActiveErpDocument(row)
      && issueRefSet.has(getReferencedJamIssueRef(row));
  });

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

const bomMappingsMemoryCache = new Map();
const BOM_CACHE_TTL_MS = 5 * 60 * 1000;

function getBomMappingsCacheKey(pieceRateRows, shellProducts) {
  const fgKey = (pieceRateRows || [])
    .map((r) => r.productGoodsCode || r.productCode)
    .filter(Boolean)
    .sort()
    .join(",");
  const shellKey = (Array.isArray(shellProducts) ? shellProducts : [])
    .map((s) => s?.code || s)
    .filter(Boolean)
    .sort()
    .join(",");
  return `${fgKey}::${shellKey}`;
}

async function loadBomMappings(supabaseAdmin, pieceRateRows, shellProducts) {
  const fgAliasMap = buildFgAliasMap(pieceRateRows);
  const fgAliases = Array.from(fgAliasMap.keys());
  if (!fgAliases.length) return [];

  const cacheKey = getBomMappingsCacheKey(pieceRateRows, shellProducts);
  const cached = bomMappingsMemoryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < BOM_CACHE_TTL_MS) {
    return cached.data;
  }

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
      .in("sku_code", chunk)
      .eq("status", "approved"),
    {
      onError: (error) => {
        throw new Error(`Failed to load BOM headers: ${error.message}`);
      },
    }
  );
  if (!bomRows.length) return [];

  const bomIds = bomRows.map((row) => row.id).filter(Boolean);
  const approvedVersionRows = await fetchSupabaseRowsByChunks(
    bomIds,
    (chunk) => supabaseAdmin
      .from("production_bom_versions")
      .select("id,bom_id,version_no,status,base_batch,formula_code")
      .in("bom_id", chunk)
      .eq("status", "approved")
      .is("deleted_at", null)
      .order("version_no", { ascending: false }),
    {
      onError: (error) => {
        throw new Error(`Failed to load BOM versions: ${error.message}`);
      },
    }
  );
  const versionRows = selectPrimaryBomFormulaVersions(approvedVersionRows);
  // Keep every approved version of the formula selected first by the BOM screen so
  // historical reports can still resolve a material that exists in an older
  // version; jam allocation uses only its newest approved version.
  const versionIds = versionRows.map((row) => row.id).filter(Boolean);
  if (!versionIds.length) return [];

  const itemRows = await fetchSupabaseRowsByChunks(
    versionIds,
    (chunk) => supabaseAdmin
      .from("production_bom_items")
      .select("version_id,material_sku_code,material_goods_code,substitute_material_sku_codes,qty")
      .in("version_id", chunk),
    {
      onError: (error) => {
        throw new Error(`Failed to load BOM items: ${error.message}`);
      },
    }
  );
  const materialSkuCodes = Array.from(
    new Set(itemRows.flatMap((row) => [
      normalizeCode(row.material_sku_code),
      ...(Array.isArray(row.substitute_material_sku_codes)
        ? row.substitute_material_sku_codes.map(normalizeCode)
        : []),
    ]).filter(Boolean))
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
  const latestVersionIdByBom = new Map();
  for (const version of versionRows) {
    const current = latestVersionIdByBom.get(version.bom_id);
    if (!current || Number(version.version_no) > Number(current.version_no)) {
      latestVersionIdByBom.set(version.bom_id, version);
    }
  }
  const itemsByVersion = new Map();
  for (const item of itemRows) {
    if (!itemsByVersion.has(item.version_id)) itemsByVersion.set(item.version_id, []);
    itemsByVersion.get(item.version_id).push(item);
  }
  const mappings = [];

  for (const version of versionRows) {
    const bomId = versionToBom.get(version.id);
    const bom = bomById.get(bomId);
    const fgCode = fgAliasMap.get(normalizeCode(bom?.sku_code));
    if (!fgCode) continue;
    const fgRow = pieceRateRows.find(
      (row) => normalizeCode(row.productGoodsCode || row.productCode) === fgCode
    );
    const items = (itemsByVersion.get(version.id) || []).flatMap((item) => {
      const materialSkuCode = normalizeCode(item.material_sku_code);
      const candidates = [
        normalizeCode(item.material_goods_code)
          || goodsCodeBySku.get(materialSkuCode)
          || materialSkuCode,
        ...(Array.isArray(item.substitute_material_sku_codes)
          ? item.substitute_material_sku_codes.map((code) => {
            const skuCode = normalizeCode(code);
            return goodsCodeBySku.get(skuCode) || skuCode;
          })
          : []),
      ];
      return Array.from(new Set(candidates.filter(Boolean))).map((materialCode) => ({
        ...item,
        materialCode,
      }));
    });
    const shells = items.filter((item) => shellByCode.has(item.materialCode));
    const jams = latestVersionIdByBom.get(bomId)?.id === version.id
      ? items.filter((item) => JAM_GOODS_CODES.includes(item.materialCode))
      : [];
    const shellCandidates = shells.length ? shells : [null];
    const jamCandidates = jams.length ? jams : [null];

    for (const shell of shellCandidates) {
      for (const jam of jamCandidates) {
        if (!shell && !jam) continue;
        mappings.push({
          fgCode,
          fgName: normalizeText(fgRow?.productName),
          shellCode: shell?.materialCode || "",
          shellName: shell ? shellByCode.get(shell.materialCode) || shell.materialCode : "",
          jamCode: jam?.materialCode || "",
          jamQty: Number(jam?.qty || 0),
          baseBatch: Number(version.base_batch || 0),
        });
      }
    }
  }

  bomMappingsMemoryCache.set(cacheKey, { timestamp: Date.now(), data: mappings });
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
  { dateFrom = null, dateTo = null, includeWaste = true, includeJam = true, includeWip = false } = {}
) {
  const today = getBangkokDateInput();
  const normalizedDateFrom = normalizeDate(dateFrom, today);
  const normalizedDateTo = normalizeDate(dateTo, normalizedDateFrom);
  const rangeStart = normalizedDateFrom <= normalizedDateTo ? normalizedDateFrom : normalizedDateTo;
  const rangeEnd = normalizedDateFrom <= normalizedDateTo ? normalizedDateTo : normalizedDateFrom;
  const { from, to } = buildUtcRange(rangeStart, rangeEnd);

  const [stockResult, fgResult, wasteResult, jamResult, manualJamResult, wipResult] = await Promise.allSettled([
    loadProductionStockMovementSummaryReportData(supabaseAdmin, {
      dateFrom: rangeStart,
      dateTo: rangeEnd,
      issueTypes: ["KPF"],
      includeAll: true,
      page: 1,
      limit: 200,
      activityOnly: true,
      groupByRoom: true,
      expandDailyBalances: false,
    }),
    loadPieceRateRows(supabaseAdmin, from, to),
    includeWaste ? loadWasteRows(supabaseAdmin, from, to) : Promise.resolve([]),
    includeJam ? loadJamRows(rangeStart, rangeEnd) : Promise.resolve({ issueRows: [], returnRows: [] }),
    includeJam
      ? loadProductionJamUsageRows(supabaseAdmin, { dateFrom: rangeStart, dateTo: rangeEnd, limit: 0, includeVoided: true })
      : Promise.resolve([]),
    includeWip ? loadWipIssueRows(supabaseAdmin, rangeStart, rangeEnd) : Promise.resolve([]),
  ]);

  const stockPayload = stockResult.status === "fulfilled" ? stockResult.value : null;
  const pieceRateRows = fgResult.status === "fulfilled" ? fgResult.value : [];
  const fgAliases = buildFgAliasMap(pieceRateRows);
  const wipIssueRows = (wipResult.status === "fulfilled" ? wipResult.value : []).map((row) => ({
    ...row,
    metadata: { ...row.metadata, fgProductCode: fgAliases.get(normalizeCode(row.metadata?.fgProductCode)) || row.metadata?.fgProductCode },
  }));
  const shellProducts = stockPayload?.scope?.products || [];
  let bomMappings = [];
  let bomWarning = null;
  try {
    bomMappings = await loadBomMappings(supabaseAdmin, pieceRateRows, shellProducts);
  } catch (error) {
    bomWarning = { source: "BOM", message: error.message };
  }

  const erpJamPayload = jamResult.status === "fulfilled"
    ? jamResult.value
    : { issueRows: [], returnRows: [] };
  const jamPayload = mergeManualJamUsageRows(
    erpJamPayload,
    manualJamResult.status === "fulfilled" ? manualJamResult.value : []
  );
  const report = buildProductionInputOutputReport({
    stockRows: stockPayload?.rows || [],
    pieceRateRows,
    wasteRows: wasteResult.status === "fulfilled" ? wasteResult.value : [],
    bomMappings,
    jamRows: jamPayload.issueRows,
    jamReturnRows: jamPayload.returnRows,
    wipIssueRows,
  });
  const warnings = [
    warningFromRejected(stockResult, "เปลือกใช้จริง"),
    warningFromRejected(fgResult, "FG"),
    warningFromRejected(wasteResult, "ของเสีย"),
    warningFromRejected(jamResult, "แยมใช้จริง"),
    warningFromRejected(manualJamResult, "แยมบันทึกในระบบ"),
    warningFromRejected(wipResult, "ใบเบิกเนื้อขนม WIP"),
    bomWarning,
    ...(report.warnings || []),
  ].filter(Boolean);

  return {
    ...report,
    scope: includeWip ? { ...(stockPayload?.scope || {}), products: [...new Map([
      ...(stockPayload?.scope?.products || []),
      ...report.days.flatMap((day) => day.rows.flatMap((row) => [
        { code: row.shellCode, name: row.shellName }, { code: row.fgCode, name: row.fgName },
      ])),
    ].filter((product) => product.code).map((product) => [product.code, product])).values()] } : stockPayload?.scope || null,
    filters: { dateFrom: rangeStart, dateTo: rangeEnd },
    warnings,
    generatedAt: new Date().toISOString(),
  };
}
