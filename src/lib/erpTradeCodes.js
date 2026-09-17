import "server-only";
import sql from "mssql";
import { fetchGatewayJson } from "@/lib/gatewayClient";

let erpPool = null;

// In-memory LRU-like cache for ultra-fast repeated queries (60s TTL)
const queryCache = new Map();
const CACHE_TTL_MS = 60 * 1000;
const MAX_CACHE_ENTRIES = 200;

function getCacheKey(params) {
  return JSON.stringify(params);
}

function getFromCache(key) {
  const entry = queryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    queryCache.delete(key);
    return null;
  }
  return entry.value;
}

function setToCache(key, value) {
  if (queryCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = queryCache.keys().next().value;
    if (oldestKey) queryCache.delete(oldestKey);
  }
  queryCache.set(key, { value, timestamp: Date.now() });
}

/**
 * Get or create SQL Server connection pool to ERP database (KPF_ERP_V3)
 * @returns {Promise<sql.ConnectionPool>}
 */
export async function getErpSqlPool() {
  if (erpPool && erpPool.connected) {
    return erpPool;
  }

  const server = process.env.DB_SERVER_KPF_ERP || process.env.SQL_SERVER || "192.168.210.5";
  const database = process.env.DB_NAME_KPF_ERP || "KPF_ERP_V3";
  const user = process.env.DB_USER_KPF_ERP || process.env.SQL_USER || "business";
  const password = process.env.DB_PASSWORD_KPF_ERP || process.env.SQL_PASSWORD || "Sy$temB+";
  const port = process.env.DB_PORT_KPF_ERP ? parseInt(process.env.DB_PORT_KPF_ERP, 10) : 1433;

  const config = {
    server,
    database,
    user,
    password,
    port,
    options: {
      encrypt: process.env.SQL_ENCRYPT === "true",
      trustServerCertificate: process.env.SQL_TRUST_CERT !== "false",
      enableArithAbort: true,
      requestTimeout: process.env.DB_REQUEST_TIMEOUT_KPF_ERP
        ? parseInt(process.env.DB_REQUEST_TIMEOUT_KPF_ERP, 10)
        : 15000,
      connectionTimeout: 10000,
    },
    pool: {
      max: 30,
      min: 2,
      idleTimeoutMillis: 300000,
      acquireTimeoutMillis: 15000,
      validateConnection: true,
    },
  };

  try {
    erpPool = await new sql.ConnectionPool(config).connect();
    return erpPool;
  } catch (error) {
    console.error("ERP SQL Server connection failed:", error);
    throw error;
  }
}

/**
 * Query trade codes directly from ERP MSSQL database
 */
export async function queryErpTradeCodes({
  page = 1,
  pageSize = 50,
  search = "",
  iccatCodes = undefined,
  skuCodes = [],
  cursor = null,
} = {}) {
  const effectiveIccatCodes = iccatCodes !== undefined
    ? iccatCodes
    : (Array.isArray(skuCodes) && skuCodes.length > 0 ? null : ["03", "04", "04-1", "04-2"]);

  const cacheKey = getCacheKey({ page, pageSize, search, iccatCodes: effectiveIccatCodes, skuCodes, cursor });
  const cached = getFromCache(cacheKey);
  if (cached) {
    return cached;
  }

  const pool = await getErpSqlPool();
  const request = pool.request();

  const safePage = Math.max(1, parseInt(String(page), 10) || 1);
  const safePageSize = Math.max(1, Math.min(parseInt(String(pageSize), 10) || 50, 1000));
  const offset = (safePage - 1) * safePageSize;

  request.input("limit", sql.Int, safePageSize + 1);
  request.input("offset", sql.Int, offset);

  const filterClauses = ["SKUMASTER.SKU_CODE IS NOT NULL"];

  const normalizedIccatCodes = Array.isArray(effectiveIccatCodes)
    ? effectiveIccatCodes.map((c) => String(c).trim()).filter(Boolean)
    : String(effectiveIccatCodes || "")
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);

  if (normalizedIccatCodes.length > 0) {
    request.input("iccatCodes", sql.NVarChar, normalizedIccatCodes.join(","));
    filterClauses.push(
      "ICCAT.ICCAT_CODE IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@iccatCodes, ','))"
    );
  }

  const trimmedSearch = String(search || "").trim();
  if (trimmedSearch) {
    request.input("search", sql.NVarChar, `%${trimmedSearch}%`);
    filterClauses.push(
      "(GOODSMASTER.GOODS_CODE LIKE @search OR SKUMASTER.SKU_CODE LIKE @search OR SKUMASTER.SKU_NAME LIKE @search)"
    );
  }

  const normalizedSkuCodes = Array.isArray(skuCodes)
    ? skuCodes.map((c) => String(c).trim()).filter(Boolean)
    : String(skuCodes || "")
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);

  if (normalizedSkuCodes.length > 0) {
    request.input("skuCodes", sql.NVarChar, normalizedSkuCodes.join(","));
    filterClauses.push(
      "SKUMASTER.SKU_CODE IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@skuCodes, ','))"
    );
  }

  if (cursor) {
    request.input("cursorCode", sql.NVarChar, String(cursor).trim());
    filterClauses.push("GOODSMASTER.GOODS_CODE > @cursorCode");
  }

  const whereSql = filterClauses.length > 0 ? `WHERE ${filterClauses.join(" AND ")}` : "";

  const dataQuery = `
    SELECT
      LTRIM(RTRIM(GOODSMASTER.GOODS_CODE)) AS goods_code,
      LTRIM(RTRIM(SKUMASTER.SKU_CODE)) AS sku_code,
      SKUMASTER.SKU_NAME AS sku_name,
      ICCAT.ICCAT_CODE AS iccat_code,
      ICCAT.ICCAT_NAME AS iccat_name,
      ICDEPT.ICDEPT_CODE AS icdept_code,
      ICDEPT.ICDEPT_THAIDESC AS icdept_name,
      UOFQTY.UTQ_NAME AS uom_name
    FROM SKUMASTER
    JOIN GOODSMASTER ON GOODSMASTER.GOODS_SKU = SKUMASTER.SKU_KEY
    JOIN ICCAT ON SKUMASTER.SKU_ICCAT = ICCAT.ICCAT_KEY
    LEFT JOIN ICDEPT ON SKUMASTER.SKU_ICDEPT = ICDEPT.ICDEPT_KEY
    LEFT JOIN UOFQTY ON SKUMASTER.SKU_K_UTQ = UOFQTY.UTQ_KEY
    ${whereSql}
    ORDER BY GOODSMASTER.GOODS_CODE ASC
    OFFSET @offset ROWS
    FETCH NEXT @limit ROWS ONLY;
  `;

  const countQuery = `
    SELECT COUNT(1) AS total
    FROM SKUMASTER
    JOIN GOODSMASTER ON GOODSMASTER.GOODS_SKU = SKUMASTER.SKU_KEY
    JOIN ICCAT ON SKUMASTER.SKU_ICCAT = ICCAT.ICCAT_KEY
    ${whereSql};
  `;

  const countRequest = pool.request();
  if (normalizedIccatCodes.length > 0) {
    countRequest.input("iccatCodes", sql.NVarChar, normalizedIccatCodes.join(","));
  }
  if (trimmedSearch) {
    countRequest.input("search", sql.NVarChar, `%${trimmedSearch}%`);
  }
  if (normalizedSkuCodes.length > 0) {
    countRequest.input("skuCodes", sql.NVarChar, normalizedSkuCodes.join(","));
  }
  if (cursor) {
    countRequest.input("cursorCode", sql.NVarChar, String(cursor).trim());
  }

  const [dataResult, countResult] = await Promise.all([
    request.query(dataQuery),
    countRequest.query(countQuery),
  ]);

  const rawRows = dataResult.recordset || [];
  const hasMore = rawRows.length > safePageSize;
  const slicedRows = hasMore ? rawRows.slice(0, safePageSize) : rawRows;
  const rows = slicedRows.map((row) => {
    const goodsCode = String(row.goods_code || row.sku_code || "").trim();
    const skuCode = String(row.sku_code || "").trim();
    const skuName = row.sku_name || "";
    const iccatCode = row.iccat_code || "";
    const iccatName = row.iccat_name || "";
    const icdeptCode = row.icdept_code || "";
    const icdeptName = row.icdept_name || "";
    const uomName = row.uom_name || "";

    return {
      goods_code: goodsCode,
      GOODS_CODE: goodsCode,
      sku_code: skuCode,
      SKU_CODE: skuCode,
      sku_name: skuName,
      SKU_NAME: skuName,
      iccat_code: iccatCode,
      ICCAT_CODE: iccatCode,
      iccat_name: iccatName,
      ICCAT_NAME: iccatName,
      icdept_code: icdeptCode,
      ICDEPT_CODE: icdeptCode,
      icdept_name: icdeptName,
      ICDEPT_THAIDESC: icdeptName,
      uom_name: uomName,
      UTQ_NAME: uomName,
      UTQ_NAME_2: uomName,
    };
  });
  const totalRecords = countResult.recordset?.[0]?.total || 0;
  const nextCursor = hasMore && rows.length > 0 ? rows[rows.length - 1].goods_code : null;

  const result = {
    data: rows,
    pagination: {
      page: safePage,
      pageSize: safePageSize,
      totalRecords,
      totalPages: Math.max(1, Math.ceil(totalRecords / safePageSize)),
    },
    cursor: {
      next: nextCursor,
      hasMore,
    },
  };

  setToCache(cacheKey, result);
  return result;
}

/**
 * Fetch trade codes trying Gateway first, then falling back to direct ERP MSSQL.
 */
export async function fetchTradeCodesWithGatewayFallback(params = {}) {
  // 1. Try Gateway first if configured
  try {
    const urlParams = new URLSearchParams();
    if (params.page) urlParams.set("page", String(params.page));
    if (params.pageSize) urlParams.set("pageSize", String(params.pageSize));
    if (params.search) urlParams.set("search", String(params.search));
    if (params.cursor) urlParams.set("cursor", String(params.cursor));

    const normalizedIccat = Array.isArray(params.iccatCodes)
      ? params.iccatCodes.join(",")
      : params.iccatCodes
        ? String(params.iccatCodes)
        : "";
    if (normalizedIccat) {
      urlParams.set("iccatCodes", normalizedIccat);
    }

    const normalizedSku = Array.isArray(params.skuCodes)
      ? params.skuCodes.join(",")
      : params.skuCodes
        ? String(params.skuCodes)
        : "";
    if (normalizedSku) {
      urlParams.set("skuCodes", normalizedSku);
    }

    const gatewayPromise = fetchGatewayJson("/api/trade-codes", urlParams, "production");
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error("Gateway timeout")), 2500)
    );
    const result = await Promise.race([gatewayPromise, timeoutPromise]);

    if (result?.ok && Array.isArray(result.data?.data) && result.data.data.length > 0) {
      const rawRows = result.data.data;
      const rows = rawRows.map((row) => {
        const goodsCode = String(row.GOODS_CODE || row.goods_code || row.SKU_CODE || "").trim();
        const skuCode = String(row.SKU_CODE || row.sku_code || "").trim();
        const skuName = row.SKU_NAME || row.sku_name || "";
        const iccatCode = row.ICCAT_CODE || row.iccat_code || "";
        const iccatName = row.ICCAT_NAME || row.iccat_name || "";
        const icdeptCode = row.ICDEPT_CODE || row.icdept_code || "";
        const icdeptName = row.ICDEPT_THAIDESC || row.icdept_name || "";
        const uomName = row.UTQ_NAME_2 || row.UTQ_NAME || row.uom_name || "";

        return {
          goods_code: goodsCode,
          GOODS_CODE: goodsCode,
          sku_code: skuCode,
          SKU_CODE: skuCode,
          sku_name: skuName,
          SKU_NAME: skuName,
          iccat_code: iccatCode,
          ICCAT_CODE: iccatCode,
          iccat_name: iccatName,
          ICCAT_NAME: iccatName,
          icdept_code: icdeptCode,
          ICDEPT_CODE: icdeptCode,
          icdept_name: icdeptName,
          ICDEPT_THAIDESC: icdeptName,
          uom_name: uomName,
          UTQ_NAME: uomName,
          UTQ_NAME_2: uomName,
        };
      });

      return {
        data: rows,
        pagination: result.data.pagination || {
          page: Number(params.page || 1),
          pageSize: Number(params.pageSize || 50),
          totalRecords: rows.length,
          totalPages: 1,
        },
        cursor: result.data.cursor || { next: null, hasMore: false },
      };
    }
  } catch {
    // Gateway down / 502 / timeout -> fall back to direct ERP MSSQL
  }

  // 2. Direct ERP MSSQL fallback
  return queryErpTradeCodes(params);
}
