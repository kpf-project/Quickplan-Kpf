const express = require("express");
const compression = require("compression");
const helmet = require("helmet");
const sql = require("mssql");
const dotenv = require("dotenv");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const envPath = fs.existsSync(".env.local") ? ".env.local" : ".env";
dotenv.config({ path: envPath });

const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(compression());

const RAW_MATERIALS_DEFAULT_FROM = "2006-01-01";

const corsOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(",").map((value) => value.trim()).filter(Boolean)
  : null;

app.use((req, res, next) => {
  const origin = req.get("origin");
  if (!corsOrigins) {
    res.set("Access-Control-Allow-Origin", "*");
  } else if (origin && corsOrigins.includes(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");
  }
  res.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type,x-api-key,cf-access-jwt-assertion");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  return next();
});

function requireAuth(req, res, next) {
  const accessJwt = req.get("cf-access-jwt-assertion");
  const apiKey = req.get("x-api-key");
  const expectedApiKey = process.env.KPF_API_KEY;

  if (accessJwt) {
    return next();
  }
  if (expectedApiKey && apiKey === expectedApiKey) {
    return next();
  }

  return res.status(401).json({ error: "Unauthorized" });
}

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.post("/api/products-cache/sync", requireAuth, async (req, res) => {
  try {
    const result = await syncProductsCache();
    res.json({ ok: true, ...result });
  } catch (error) {
    res.status(500).json({ error: "Sync failed", details: error.message });
  }
});

let erpPool;
let hrPool;
let supabaseAdmin;
let productsCacheSyncInProgress = false;
const inFlightSqlRequests = new Map();
const responseCache = new Map();
const DEFAULT_CACHE_TTL_MS = process.env.GATEWAY_CACHE_TTL_MS
  ? Number(process.env.GATEWAY_CACHE_TTL_MS)
  : 30000;
const LOT_CACHE_TTL_MS = process.env.GATEWAY_LOT_CACHE_TTL_MS
  ? Number(process.env.GATEWAY_LOT_CACHE_TTL_MS)
  : 60000;
const gatewayPerfSamples = [];
const gatewayPerfByEndpoint = new Map();
const MAX_GATEWAY_PERF_SAMPLES = 500;
const MAX_GATEWAY_ENDPOINT_SAMPLES = 100;

function percentile(sortedValues, p) {
  if (!sortedValues.length) {
    return 0;
  }
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(sortedValues.length * p) - 1)
  );
  return Number(sortedValues[index].toFixed(2));
}

function recordGatewayPerformance(sample) {
  gatewayPerfSamples.push(sample);
  if (gatewayPerfSamples.length > MAX_GATEWAY_PERF_SAMPLES) {
    gatewayPerfSamples.shift();
  }

  const endpoint = `${sample.method} ${sample.path}`;
  const aggregate = gatewayPerfByEndpoint.get(endpoint) || {
    endpoint,
    count: 0,
    totalDurationMs: 0,
    minDurationMs: null,
    maxDurationMs: 0,
    errorCount: 0,
    statusCounts: {},
    lastSeen: null,
    recentDurations: [],
  };

  aggregate.count += 1;
  aggregate.totalDurationMs += sample.durationMs;
  aggregate.minDurationMs =
    aggregate.minDurationMs === null
      ? sample.durationMs
      : Math.min(aggregate.minDurationMs, sample.durationMs);
  aggregate.maxDurationMs = Math.max(aggregate.maxDurationMs, sample.durationMs);
  aggregate.lastSeen = sample.timestamp;

  const statusGroup = `${Math.floor(sample.status / 100)}xx`;
  aggregate.statusCounts[statusGroup] = (aggregate.statusCounts[statusGroup] || 0) + 1;
  if (sample.status >= 400) {
    aggregate.errorCount += 1;
  }

  aggregate.recentDurations.push(sample.durationMs);
  if (aggregate.recentDurations.length > MAX_GATEWAY_ENDPOINT_SAMPLES) {
    aggregate.recentDurations.shift();
  }

  gatewayPerfByEndpoint.set(endpoint, aggregate);
}

function getGatewayPerformanceStats() {
  const recent = gatewayPerfSamples.slice(-100);
  const avgDurationMs = recent.length
    ? Number((recent.reduce((sum, item) => sum + item.durationMs, 0) / recent.length).toFixed(2))
    : 0;

  const endpoints = [...gatewayPerfByEndpoint.values()].map((entry) => {
    const sorted = [...entry.recentDurations].sort((a, b) => a - b);
    const p95 = percentile(sorted, 0.95);
    return {
      endpoint: entry.endpoint,
      count: entry.count,
      avgDurationMs: Number((entry.totalDurationMs / entry.count).toFixed(2)),
      p95DurationMs: p95,
      minDurationMs: Number((entry.minDurationMs || 0).toFixed(2)),
      maxDurationMs: Number(entry.maxDurationMs.toFixed(2)),
      errorCount: entry.errorCount,
      statusCounts: entry.statusCounts,
      lastSeen: entry.lastSeen,
    };
  }).sort((a, b) => b.count - a.count);

  return {
    totalApiCalls: gatewayPerfSamples.length,
    averageResponseTimeMs: avgDurationMs,
    endpoints,
    recentCalls: recent,
  };
}

function resetGatewayPerformance() {
  gatewayPerfSamples.length = 0;
  gatewayPerfByEndpoint.clear();
}

function getCacheKey(scope, req) {
  return `${scope}:${req.method}:${req.originalUrl}`;
}

function shouldBypassCache(req) {
  const bypassQuery = String(req.query.noCache || "").toLowerCase();
  if (bypassQuery === "1" || bypassQuery === "true") {
    return true;
  }
  const bypassHeader = String(req.get("x-cache-bust") || "").toLowerCase();
  return bypassHeader === "1" || bypassHeader === "true";
}

function getCachedResponse(cacheKey) {
  const entry = responseCache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    responseCache.delete(cacheKey);
    return null;
  }
  return entry.value;
}

function setCachedResponse(cacheKey, value, ttlMs = DEFAULT_CACHE_TTL_MS) {
  if (!ttlMs || ttlMs <= 0) return;
  responseCache.set(cacheKey, {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

function buildSqlDedupeKey(scope, req) {
  return `${scope}:${req.method}:${req.originalUrl}`;
}

async function dedupeSqlRequest(key, handler) {
  if (inFlightSqlRequests.has(key)) {
    return inFlightSqlRequests.get(key);
  }
  const requestPromise = (async () => {
    try {
      return await handler();
    } finally {
      inFlightSqlRequests.delete(key);
    }
  })();
  inFlightSqlRequests.set(key, requestPromise);
  return requestPromise;
}

async function getErpPool() {
  if (erpPool) {
    return erpPool;
  }

  console.log("getErpPool: connecting with user=", process.env.DB_USER_KPF_ERP, "password=", process.env.DB_PASSWORD_KPF_ERP ? "[REDACTED]" : "");

  erpPool = await new sql.ConnectionPool({
    server: process.env.DB_SERVER_KPF_ERP,
    database: process.env.DB_NAME_KPF_ERP,
    user: process.env.DB_USER_KPF_ERP,
    password: process.env.DB_PASSWORD_KPF_ERP,
    port: process.env.DB_PORT_KPF_ERP ? Number(process.env.DB_PORT_KPF_ERP) : 1433,
    requestTimeout: process.env.DB_REQUEST_TIMEOUT_KPF_ERP
      ? Number(process.env.DB_REQUEST_TIMEOUT_KPF_ERP)
      : 60000,
    options: {
      encrypt: process.env.SQL_ENCRYPT === "true",
      trustServerCertificate: process.env.SQL_TRUST_CERT !== "false",
    },
  }).connect();

  return erpPool;
}

async function getHrPool() {
  if (hrPool) {
    return hrPool;
  }

  hrPool = await new sql.ConnectionPool({
    server: process.env.SQL_SERVER,
    database: process.env.SQL_DATABASE,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    port: process.env.SQL_PORT ? Number(process.env.SQL_PORT) : 1433,
    options: {
      encrypt: process.env.SQL_ENCRYPT === "true",
      trustServerCertificate: process.env.SQL_TRUST_CERT !== "false",
    },
  }).connect();

  return hrPool;
}

function getSupabaseAdmin() {
  if (supabaseAdmin) {
    return supabaseAdmin;
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin env is missing");
  }
  supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  return supabaseAdmin;
}

async function fetchProductsCacheBatch(connection, lastSkuCode, limit) {
  const requestSql = connection.request();
  requestSql.input("limitParam", sql.Int, limit);
  requestSql.input("lastSkuCode", sql.NVarChar, lastSkuCode || null);

  const cursorFilter = lastSkuCode
    ? "AND SKUMASTER.SKU_CODE > @lastSkuCode"
    : "";

  const query = `
    SELECT TOP (@limitParam)
      SKUMASTER.SKU_CODE,
      SKUMASTER.SKU_NAME,
      SKUMASTER.SKU_ENABLE,
      SKUMASTER.SKU_P_ENABLE,
      ICCAT.ICCAT_CODE,
      ICCAT.ICCAT_NAME,
      ICDEPT.ICDEPT_CODE,
      ICDEPT.ICDEPT_THAIDESC,
      BRAND.BRN_CODE,
      BRAND.BRN_NAME,
      UOFQTY.UTQ_NAME AS UOM_NAME
    FROM SKUMASTER
    JOIN ICCAT ON SKUMASTER.SKU_ICCAT = ICCAT.ICCAT_KEY
    JOIN BRAND ON SKUMASTER.SKU_BRN = BRAND.BRN_KEY
    JOIN ICDEPT ON SKUMASTER.SKU_ICDEPT = ICDEPT.ICDEPT_KEY
    LEFT JOIN UOFQTY ON SKUMASTER.SKU_S_UTQ = UOFQTY.UTQ_KEY
    WHERE SKUMASTER.SKU_CODE IS NOT NULL
      AND ICCAT.ICCAT_CODE IN ('01', '02', '03', '04', '04-1', '04-2', '05', '08', '10')
      ${cursorFilter}
    ORDER BY SKUMASTER.SKU_CODE ASC;
  `;

  const result = await requestSql.query(query);
  return result.recordset ?? [];
}

function normalizeProductsCacheRow(row) {
  return {
    sku_code: row.SKU_CODE,
    sku_name: row.SKU_NAME ?? "",
    iccat_code: row.ICCAT_CODE ?? "",
    iccat_name: row.ICCAT_NAME ?? "",
    icdept_code: row.ICDEPT_CODE ?? "",
    icdept_name: row.ICDEPT_THAIDESC ?? "",
    brand_code: row.BRN_CODE ?? "",
    brand_name: row.BRN_NAME ?? "",
    uom_name: row.UOM_NAME ?? "",
    is_active: row.SKU_ENABLE === "Y" || row.SKU_P_ENABLE === "Y",
    source_updated_at: null,
  };
}

async function fetchExistingProductsCacheRows(supabase, skuCodes) {
  if (!Array.isArray(skuCodes) || !skuCodes.length) {
    return new Map();
  }

  const { data, error } = await supabase
    .from("products_cache")
    .select(
      "sku_code,sku_name,iccat_code,iccat_name,icdept_code,icdept_name,brand_code,brand_name,uom_name,is_active,source_updated_at"
    )
    .in("sku_code", skuCodes);

  if (error) {
    throw new Error(error.message);
  }

  return new Map((data || []).map((row) => [row.sku_code, row]));
}

function productsCacheRowChanged(nextRow, currentRow) {
  if (!currentRow) {
    return true;
  }

  return (
    String(currentRow.sku_name ?? "") !== String(nextRow.sku_name ?? "") ||
    String(currentRow.iccat_code ?? "") !== String(nextRow.iccat_code ?? "") ||
    String(currentRow.iccat_name ?? "") !== String(nextRow.iccat_name ?? "") ||
    String(currentRow.icdept_code ?? "") !== String(nextRow.icdept_code ?? "") ||
    String(currentRow.icdept_name ?? "") !== String(nextRow.icdept_name ?? "") ||
    String(currentRow.brand_code ?? "") !== String(nextRow.brand_code ?? "") ||
    String(currentRow.brand_name ?? "") !== String(nextRow.brand_name ?? "") ||
    String(currentRow.uom_name ?? "") !== String(nextRow.uom_name ?? "") ||
    Boolean(currentRow.is_active) !== Boolean(nextRow.is_active) ||
    currentRow.source_updated_at !== nextRow.source_updated_at
  );
}

async function syncProductsCache() {
  if (productsCacheSyncInProgress) {
    return { synced: 0, skipped: true };
  }
  productsCacheSyncInProgress = true;
  const pageSize = 500;
  let totalSynced = 0;
  let totalProcessed = 0;
  let lastSkuCode = null;

  try {
    const connection = await getErpPool();
    const supabase = getSupabaseAdmin();

    while (true) {
      const rows = await fetchProductsCacheBatch(connection, lastSkuCode, pageSize);
      if (!rows.length) {
        break;
      }

      const payload = rows.map(normalizeProductsCacheRow);
      const existingRowsBySku = await fetchExistingProductsCacheRows(
        supabase,
        payload.map((row) => row.sku_code)
      );
      const changedPayload = payload.filter((row) =>
        productsCacheRowChanged(row, existingRowsBySku.get(row.sku_code))
      );

      if (changedPayload.length) {
        const { error } = await supabase
          .from("products_cache")
          .upsert(changedPayload, { onConflict: "sku_code" });
        if (error) {
          throw new Error(error.message);
        }
      }

      totalProcessed += rows.length;
      totalSynced += changedPayload.length;
      lastSkuCode = rows[rows.length - 1].SKU_CODE;
      if (rows.length < pageSize) {
        break;
      }
    }
  } finally {
    productsCacheSyncInProgress = false;
  }

  return { synced: totalSynced, processed: totalProcessed, skipped: false };
}

function normalizeListParam(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "all") {
    return null;
  }
  return trimmed;
}

function parsePositiveInt(value, fallback, maxValue) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  if (maxValue) {
    return Math.min(parsed, maxValue);
  }
  return parsed;
}

function parseDateParam(value) {
  if (!value) {
    return null;
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }
  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

function formatDateOnly(value) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toISOString().split("T")[0];
}

function decodeCursor(value) {
  if (!value) {
    return null;
  }
  try {
    const decoded = Buffer.from(String(value), "base64url").toString("utf8");
    const parsed = JSON.parse(decoded);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch (error) {
    return null;
  }
}

function encodeCursor(payload) {
  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

function parseSkuCursor(value) {
  const parsed = decodeCursor(value);
  if (!parsed) {
    return null;
  }
  const skuCode = String(parsed.skuCode || "").trim();
  if (!skuCode) {
    return null;
  }
  return { skuCode };
}

function parseSkuLotCursor(value) {
  const parsed = decodeCursor(value);
  if (!parsed) {
    return null;
  }
  const skuCode = String(parsed.skuCode || "").trim();
  if (!skuCode) {
    return null;
  }
  const lotNo = parsed.lotNo === null || parsed.lotNo === undefined ? "" : String(parsed.lotNo);
  const warehouseCode = parsed.warehouseCode === null || parsed.warehouseCode === undefined
    ? ""
    : String(parsed.warehouseCode);
  return { skuCode, lotNo, warehouseCode };
}

function parseProductsCursor(value) {
  const parsed = decodeCursor(value);
  if (!parsed) {
    return null;
  }
  const order = Number.parseInt(parsed.order, 10);
  if (Number.isNaN(order)) {
    return null;
  }
  const skuCode = String(parsed.skuCode || "").trim();
  const apCode = String(parsed.apCode || "").trim();
  if (!skuCode || !apCode) {
    return null;
  }
  return { order, skuCode, apCode };
}

function parseTradeCodesCursor(value) {
  const parsed = decodeCursor(value);
  if (!parsed) {
    return null;
  }
  const skuCode = String(parsed.skuCode || "").trim();
  const apCode = String(parsed.apCode || "").trim();
  if (!skuCode || !apCode) {
    return null;
  }
  return { skuCode, apCode };
}

function parseDocumentCursor(value) {
  const parsed = decodeCursor(value);
  if (!parsed) {
    return null;
  }
  const date = parseDateParam(parsed.date);
  const ref = String(parsed.ref || "").trim();
  const seq = Number.parseInt(parsed.seq, 10);
  if (!date || !ref || Number.isNaN(seq)) {
    return null;
  }
  return { date: date.toISOString().split("T")[0], ref, seq };
}

function parseReceiptCursor(value) {
  const parsed = decodeCursor(value);
  const skuCode = String(parsed?.skuCode || "").trim();
  const lotNo = String(parsed?.lotNo ?? "").trim();
  const date = parseDateParam(parsed?.date);
  const ref = String(parsed?.ref || "").trim();
  const diKey = Number(parsed?.diKey);
  const seq = Number(parsed?.seq);
  const trdKey = Number(parsed?.trdKey);
  if (!skuCode || !date || !ref || !Number.isInteger(diKey) || !Number.isInteger(seq) || !Number.isInteger(trdKey)) {
    return null;
  }
  return { skuCode, lotNo, date: formatDateOnly(date), ref, diKey, seq, trdKey };
}

function parseEmployeesCursor(value) {
  const parsed = decodeCursor(value);
  if (!parsed) {
    return null;
  }
  const empIntl = String(parsed.empIntl || "").trim();
  const empKey = String(parsed.empKey || "").trim();
  if (!empIntl || !empKey) {
    return null;
  }
  return { empIntl, empKey };
}

function parseAttendanceCursor(value) {
  const parsed = decodeCursor(value);
  if (!parsed) {
    return null;
  }
  const date = parseDateParam(parsed.date);
  const badgenumber = String(parsed.badgenumber || "").trim();
  if (!date || !badgenumber) {
    return null;
  }
  return { date: date.toISOString().split("T")[0], badgenumber };
}

function parseConsolidatedCursor(value) {
  const parsed = decodeCursor(value);
  if (!parsed) {
    return null;
  }
  const date = parseDateParam(parsed.date);
  const prsNoRaw = parsed.prsNo;
  if (!date || prsNoRaw === undefined || prsNoRaw === null) {
    return null;
  }
  const prsNo = String(prsNoRaw).trim();
  if (!prsNo) {
    return null;
  }
  return { date: date.toISOString().split("T")[0], prsNo };
}

function normalizeAttendanceScanTimes(rows) {
  const uniqueTimes = new Set();
  (rows || []).forEach((row) => {
    const time = String(row?.CheckTime || "").trim();
    if (time) {
      uniqueTimes.add(time);
    }
  });
  return Array.from(uniqueTimes.values());
}

function normalizeEmployeeCodeForLookup(value) {
  return String(value || "").trim().toUpperCase().replace(/KPF/g, "").replace(/[^A-Z0-9]/g, "");
}

function parseAttendanceTimeMinutes(value) {
  const [hourText, minuteText] = String(value || "").split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return null;
  }
  return (hour * 60) + minute;
}

function buildAttendanceFingerSummary(rows) {
  const scanTimes = normalizeAttendanceScanTimes(rows);
  const firstScan = scanTimes[0] || null;
  const middleScans = scanTimes.length > 2 ? scanTimes.slice(1, -1) : [];
  const secondScan = scanTimes[1] || null;
  const thirdScan = scanTimes[2] || null;
  const lastScan = scanTimes.length > 1 ? scanTimes[scanTimes.length - 1] : null;

  let fingerOutLunch = null;
  let fingerInAfternoon = null;
  let fingerOutEvening = null;

  if (scanTimes.length === 2) {
    const secondScanMinutes = parseAttendanceTimeMinutes(secondScan);
    if (secondScanMinutes !== null && secondScanMinutes < (15 * 60)) {
      fingerOutLunch = secondScan;
    } else {
      fingerOutEvening = secondScan;
    }
  } else if (scanTimes.length === 3) {
    const thirdScanMinutes = parseAttendanceTimeMinutes(thirdScan);
    fingerOutLunch = secondScan;
    if (thirdScanMinutes !== null && thirdScanMinutes < (15 * 60)) {
      fingerInAfternoon = thirdScan;
    } else {
      fingerOutEvening = thirdScan;
    }
  } else if (scanTimes.length >= 4) {
    fingerOutLunch = middleScans[0] || null;
    fingerInAfternoon = middleScans[1] || null;
    fingerOutEvening = lastScan && lastScan !== firstScan ? lastScan : null;
  }

  return {
    CheckIn: firstScan,
    CheckOut: lastScan && lastScan !== firstScan ? lastScan : null,
    FingerInMorning: firstScan,
    FingerOutLunch: fingerOutLunch,
    FingerInAfternoon: fingerInAfternoon,
    FingerOutEvening: fingerOutEvening,
    FingerScanTimes: scanTimes,
    FingerScanCount: scanTimes.length,
  };
}

function buildRequestedLookupItems(rawItems) {
  if (!Array.isArray(rawItems)) {
    return [];
  }

  const uniqueItems = new Map();
  rawItems.forEach((item) => {
    const employeeCode = String(item?.employeeCode || "").trim();
    const targetDate = String(item?.date || "").trim();
    const employeeCodeNormalized = normalizeEmployeeCodeForLookup(employeeCode);
    if (!employeeCode || !targetDate || !employeeCodeNormalized) {
      return;
    }
    const key = `${employeeCodeNormalized}|${targetDate}`;
    if (!uniqueItems.has(key)) {
      uniqueItems.set(key, {
        employeeCode,
        employeeCodeNormalized,
        targetDate,
      });
    }
  });

  return Array.from(uniqueItems.values());
}

function buildRequestedLookupsCte(requestSql, items) {
  return items.map((item, index) => {
    const employeeCodeParam = `employeeCode${index}`;
    const employeeCodeNormalizedParam = `employeeCodeNormalized${index}`;
    const targetDateParam = `targetDate${index}`;
    requestSql.input(employeeCodeParam, sql.NVarChar, item.employeeCode);
    requestSql.input(employeeCodeNormalizedParam, sql.NVarChar, item.employeeCodeNormalized);
    requestSql.input(targetDateParam, sql.Date, item.targetDate);
    return `SELECT @${employeeCodeParam} AS EmployeeCode, @${employeeCodeNormalizedParam} AS EmployeeCodeNormalized, @${targetDateParam} AS TargetDate`;
  }).join("\nUNION ALL\n");
}

function getProductOrder(iccatCode) {
  switch (iccatCode) {
    case "04":
      return 1;
    case "04-1":
      return 2;
    case "04-2":
      return 3;
    default:
      return 9;
  }
}

function resolveCursor(res, page, rawCursor, parser) {
  if (rawCursor === undefined || rawCursor === null || rawCursor === "") {
    if (page > 1) {
      res.status(400).json({ error: "Cursor is required for page > 1." });
      return { error: true };
    }
    return { cursor: null };
  }
  const cursor = parser(rawCursor);
  if (!cursor) {
    res.status(400).json({ error: "Invalid cursor." });
    return { error: true };
  }
  return { cursor };
}

app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    if (!req.path.startsWith("/api")) {
      return;
    }
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1000000;
    recordGatewayPerformance({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Number(durationMs.toFixed(2)),
      timestamp: Date.now(),
    });
  });
  next();
});

app.use("/api", requireAuth);

app.get("/api/performance", (req, res) => {
  const stats = getGatewayPerformanceStats();
  res.json(stats);
});

app.post("/api/performance/reset", (req, res) => {
  resetGatewayPerformance();
  res.json({ ok: true });
});

app.get("/api/raw-materials", async (req, res) => {
  try {
    const brandCodes = normalizeListParam(req.query.brandCodes);
    const iccatCodesRaw = req.query.iccatCodes;
    const iccatCodes = normalizeListParam(
      iccatCodesRaw === undefined ? "01,02,03,05,08,10" : String(iccatCodesRaw)
    );
    const skuName = normalizeListParam(req.query.skuName);
    const warehouseCode = normalizeListParam(req.query.warehouseCode);
    const costStatus = ["ready", "review", "missing"].includes(String(req.query.costStatus || ""))
      ? String(req.query.costStatus)
      : null;
    let dateFrom = normalizeListParam(req.query.dateFrom);
    let dateTo = normalizeListParam(req.query.dateTo);
    const page = parsePositiveInt(req.query.page, 1);
    const pageSize = parsePositiveInt(req.query.pageSize, 100, 500);
    const { cursor, error } = resolveCursor(res, page, req.query.cursor, parseSkuLotCursor);
    if (error) {
      return;
    }
    const limit = pageSize + 1;

    const connection = await getErpPool();

    if (!dateFrom && !dateTo) {
      const now = new Date();
      const pad2 = (value) => String(value).padStart(2, "0");
      const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
      dateFrom = RAW_MATERIALS_DEFAULT_FROM;
      dateTo = today;
    }

    const cacheKey = getCacheKey("raw-materials", req);
    if (!shouldBypassCache(req)) {
      const cached = getCachedResponse(cacheKey);
      if (cached) {
        res.set("X-Cache", "HIT");
        return res.json(cached);
      }
    }

    const dataRequest = connection.request();
    dataRequest.input("brandCodesParam", sql.NVarChar, brandCodes);
    dataRequest.input("iccatCodesParam", sql.NVarChar, iccatCodes);
    dataRequest.input("skuNameParam", sql.NVarChar, skuName);
    dataRequest.input("warehouseCodeParam", sql.NVarChar, warehouseCode);
    dataRequest.input("costStatusParam", sql.NVarChar, costStatus);
    dataRequest.input("dateFromParam", sql.Date, dateFrom);
    dataRequest.input("dateToParam", sql.Date, dateTo);
    dataRequest.input("limitParam", sql.Int, limit);
    if (cursor) {
      dataRequest.input("cursorSkuCode", sql.NVarChar, cursor.skuCode);
      dataRequest.input("cursorLotNo", sql.NVarChar, cursor.lotNo);
      dataRequest.input("cursorWarehouseCode", sql.NVarChar, cursor.warehouseCode);
    }

    const cursorFilter = cursor
      ? `AND (
          SKU_CODE > @cursorSkuCode
          OR (SKU_CODE = @cursorSkuCode AND ISNULL(SKM_LOT_NO, '') > @cursorLotNo)
          OR (
            SKU_CODE = @cursorSkuCode
            AND ISNULL(SKM_LOT_NO, '') = @cursorLotNo
            AND WL_CODE > @cursorWarehouseCode
          )
        )`
      : "";
    const positiveOnly = String(req.query.positiveOnly || "").toLowerCase();
    const positiveFilter = (
      positiveOnly === "true" || positiveOnly === "1"
    ) ? "AND QTY > 0" : "";

    const dataQuery = `
      DECLARE @brandCodes NVARCHAR(MAX) = @brandCodesParam;
      DECLARE @iccatCodes NVARCHAR(MAX) = @iccatCodesParam;
      DECLARE @skuName NVARCHAR(255) = @skuNameParam;
      DECLARE @skuNameLike NVARCHAR(255) = CASE WHEN @skuName IS NULL THEN NULL ELSE '%' + @skuName + '%' END;
      DECLARE @warehouseCode NVARCHAR(20) = @warehouseCodeParam;
      DECLARE @costStatus NVARCHAR(20) = @costStatusParam;
      DECLARE @dateFrom DATE = @dateFromParam;
      DECLARE @dateTo DATE = @dateToParam;
      DECLARE @limit INT = @limitParam;

      WITH RawBase AS (
        SELECT
          COALESCE(BaseGoods.GOODS_CODE, SKUMASTER.SKU_CODE) AS GOODS_CODE,
          COALESCE(BaseGoods.GOODS_CODE, SKUMASTER.SKU_CODE) AS BASE_GOODS_CODE,
          StockGoods.GOODS_CODE AS STOCK_GOODS_CODE,
          SKUMASTER.SKU_CODE,
          SKUMASTER.SKU_NAME,
          WARELOCATION.WL_CODE,
          WARELOCATION.WL_NAME,
          ICDEPT.ICDEPT_CODE,
          ICCAT.ICCAT_CODE,
          ICCAT.ICCAT_NAME,
          UTQ2.UTQ_NAME_1 AS UTQ_NAME,
          UOFQTY.UTQ_NAME AS UTQ_K_NAME,
          UTQ2.UTQ_NAME_1 AS STOCK_UNIT_NAME,
          UTQ2.UTQ_QTY_1 AS STOCK_UNIT_FACTOR,
          UOFQTY.UTQ_NAME AS BASE_UNIT_NAME,
          SKUMOVE.SKM_LOT_NO,
          SUM(SKUMOVE.SKM_QTY) / NULLIF(UTQ2.UTQ_QTY_1, 0) AS QTY,
          SUM(SKUMOVE.SKM_QTY) AS QTY_K,
          SUM(SKUMOVE.SKM_QTY) AS QTY_BASE
        FROM SKUMASTER
        OUTER APPLY (
          SELECT TOP 1 GOODSMASTER.GOODS_CODE
          FROM GOODSMASTER
          JOIN UOFQTY GoodsUnit ON GOODSMASTER.GOODS_UTQ = GoodsUnit.UTQ_KEY
          JOIN UOFQTY BaseUnit ON SKUMASTER.SKU_K_UTQ = BaseUnit.UTQ_KEY
          WHERE GOODSMASTER.GOODS_SKU = SKUMASTER.SKU_KEY
            AND (
              GOODSMASTER.GOODS_UTQ = SKUMASTER.SKU_K_UTQ
              OR ISNULL(GoodsUnit.UTQ_QTY, 0) = ISNULL(BaseUnit.UTQ_QTY, 0)
            )
          ORDER BY
            CASE WHEN GOODSMASTER.GOODS_UTQ = SKUMASTER.SKU_K_UTQ THEN 0 ELSE 1 END,
            CASE WHEN ISNULL(GoodsUnit.UTQ_NAME, '') = ISNULL(BaseUnit.UTQ_NAME, '') THEN 0 ELSE 1 END,
            CASE WHEN GOODSMASTER.GOODS_CODE = SKUMASTER.SKU_CODE THEN 0 ELSE 1 END,
            GOODSMASTER.GOODS_CODE ASC
        ) BaseGoods
        OUTER APPLY (
          SELECT TOP 1 GOODSMASTER.GOODS_CODE
          FROM GOODSMASTER
          JOIN UOFQTY GoodsUnit ON GOODSMASTER.GOODS_UTQ = GoodsUnit.UTQ_KEY
          JOIN UOFQTY StockUnit ON SKUMASTER.SKU_S_UTQ = StockUnit.UTQ_KEY
          WHERE GOODSMASTER.GOODS_SKU = SKUMASTER.SKU_KEY
            AND (
              GOODSMASTER.GOODS_UTQ = SKUMASTER.SKU_S_UTQ
              OR ISNULL(GoodsUnit.UTQ_QTY, 0) = ISNULL(StockUnit.UTQ_QTY, 0)
            )
          ORDER BY
            CASE WHEN GOODSMASTER.GOODS_UTQ = SKUMASTER.SKU_S_UTQ THEN 0 ELSE 1 END,
            CASE WHEN ISNULL(GoodsUnit.UTQ_NAME, '') = ISNULL(StockUnit.UTQ_NAME, '') THEN 0 ELSE 1 END,
            CASE WHEN GOODSMASTER.GOODS_CODE = SKUMASTER.SKU_CODE THEN 0 ELSE 1 END,
            GOODSMASTER.GOODS_CODE ASC
        ) StockGoods
        JOIN BRAND ON SKUMASTER.SKU_BRN = BRAND.BRN_KEY
        JOIN ICDEPT ON SKUMASTER.SKU_ICDEPT = ICDEPT.ICDEPT_KEY
        JOIN ICCAT ON SKUMASTER.SKU_ICCAT = ICCAT.ICCAT_KEY
        JOIN SKUMOVE ON SKUMASTER.SKU_KEY = SKUMOVE.SKM_SKU
        JOIN DOCINFO ON SKUMOVE.SKM_DI = DOCINFO.DI_KEY
        JOIN WARELOCATION ON SKUMOVE.SKM_WL = WARELOCATION.WL_KEY
        JOIN UOFQTY ON SKUMASTER.SKU_K_UTQ = UOFQTY.UTQ_KEY
        JOIN (
          SELECT
            UOFQTY1.UTQ_KEY AS UTQ_KEY1,
            UOFQTY1.UTQ_NAME AS UTQ_NAME_1,
            UOFQTY1.UTQ_QTY AS UTQ_QTY_1
          FROM UOFQTY UOFQTY1
        ) UTQ2 ON SKUMASTER.SKU_S_UTQ = UTQ2.UTQ_KEY1
        WHERE
          SKUMASTER.SKU_ENABLE = 'Y'
          AND WARELOCATION.WL_CODE IN ('02', '04', '05', '17')
          AND (@warehouseCode IS NULL OR WARELOCATION.WL_CODE = @warehouseCode)
          AND SKUMASTER.SKU_CODE <> 'DC-001'
          AND ISNULL(ICDEPT.ICDEPT_CODE, '') <> 'NM'
          AND (@brandCodes IS NULL OR BRAND.BRN_CODE IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@brandCodes, ',')))
          AND (@iccatCodes IS NULL OR ICCAT.ICCAT_CODE IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@iccatCodes, ',')))
          AND (@dateFrom IS NULL OR DOCINFO.DI_DATE >= @dateFrom)
          AND (@dateTo IS NULL OR DOCINFO.DI_DATE <= @dateTo)
          AND (
            @skuName IS NULL
            OR SKUMASTER.SKU_NAME LIKE @skuNameLike
            OR SKUMASTER.SKU_CODE LIKE @skuNameLike
          )
        GROUP BY
          BaseGoods.GOODS_CODE,
          StockGoods.GOODS_CODE,
          SKUMASTER.SKU_CODE,
          SKUMASTER.SKU_NAME,
          WARELOCATION.WL_CODE,
          WARELOCATION.WL_NAME,
          BRAND.BRN_CODE,
          ICDEPT.ICDEPT_CODE,
          ICCAT.ICCAT_CODE,
          ICCAT.ICCAT_NAME,
          UTQ2.UTQ_NAME_1,
          UTQ2.UTQ_QTY_1,
          UOFQTY.UTQ_NAME,
          SKUMOVE.SKM_LOT_NO
      ),
      PurchaseLines AS (
        SELECT
          SKUMASTER.SKU_CODE,
          LTRIM(RTRIM(ISNULL(TRANSTKD.TRD_LOT_NO, ''))) AS LOT_NO,
          CAST(
            CASE WHEN DOCTYPE.DT_PROPERTIES IN (304, 336) THEN -1 ELSE 1 END
            * (COALESCE(TRANSTKD.TRD_QTY, 0) + COALESCE(TRANSTKD.TRD_Q_FREE, 0))
            * COALESCE(NULLIF(TRANSTKD.TRD_UTQQTY, 0), 1)
            AS DECIMAL(28, 8)
          ) AS BASE_QTY,
          CAST(
            CASE WHEN DOCTYPE.DT_PROPERTIES IN (304, 336) THEN -1 ELSE 1 END
            * TRANSTKD.TRD_B_SELL
            AS DECIMAL(28, 8)
          ) AS NET_PURCHASE_AMOUNT
        FROM DOCINFO
        JOIN DOCTYPE ON DOCINFO.DI_DT = DOCTYPE.DT_KEY
        JOIN TRANSTKH ON DOCINFO.DI_KEY = TRANSTKH.TRH_DI
        JOIN TRANSTKD ON TRANSTKH.TRH_KEY = TRANSTKD.TRD_TRH
        JOIN SKUMASTER ON TRANSTKD.TRD_SKU = SKUMASTER.SKU_KEY
        JOIN ICCAT ON SKUMASTER.SKU_ICCAT = ICCAT.ICCAT_KEY
        JOIN (
          SELECT DISTINCT SKU_CODE, ISNULL(SKM_LOT_NO, '') AS LOT_NO
          FROM RawBase
        ) StockKeys
          ON StockKeys.SKU_CODE = SKUMASTER.SKU_CODE
          AND StockKeys.LOT_NO = LTRIM(RTRIM(ISNULL(TRANSTKD.TRD_LOT_NO, '')))
        WHERE DOCINFO.DI_ACTIVE = 0
          AND DOCTYPE.DT_PROPERTIES IN (301, 303, 304, 336)
          AND ICCAT.ICCAT_CODE IN ('01', '02', '05', '08', '10')
      ),
      PurchaseCosts AS (
        SELECT
          SKU_CODE,
          LOT_NO,
          SUM(BASE_QTY) AS RECEIVED_BASE_QTY,
          SUM(NET_PURCHASE_AMOUNT) AS NET_PURCHASE_AMOUNT,
          SUM(CASE WHEN NET_PURCHASE_AMOUNT IS NULL THEN 1 ELSE 0 END) AS MISSING_COST_LINES
        FROM PurchaseLines
        GROUP BY SKU_CODE, LOT_NO
      ),
      CostedRows AS (
        SELECT
          RawBase.*,
          PurchaseCosts.RECEIVED_BASE_QTY,
          PurchaseCosts.NET_PURCHASE_AMOUNT,
          CASE
            WHEN PurchaseCosts.SKU_CODE IS NULL THEN 'missing'
            WHEN ISNULL(RawBase.SKM_LOT_NO, '') = '' THEN 'review'
            WHEN NULLIF(LTRIM(RTRIM(RawBase.BASE_UNIT_NAME)), '') IS NULL THEN 'review'
            WHEN PurchaseCosts.RECEIVED_BASE_QTY <= 0 THEN 'review'
            WHEN PurchaseCosts.MISSING_COST_LINES > 0 THEN 'review'
            WHEN PurchaseCosts.NET_PURCHASE_AMOUNT < 0 THEN 'review'
            ELSE 'ready'
          END AS COST_STATUS,
          CASE
            WHEN PurchaseCosts.SKU_CODE IS NULL THEN N'ไม่พบเอกสารซื้อของ SKU และ LOT นี้'
            WHEN ISNULL(RawBase.SKM_LOT_NO, '') = '' THEN N'ไม่มีเลข LOT'
            WHEN NULLIF(LTRIM(RTRIM(RawBase.BASE_UNIT_NAME)), '') IS NULL THEN N'ไม่มีหน่วยหลักของสินค้า'
            WHEN PurchaseCosts.RECEIVED_BASE_QTY <= 0 THEN N'จำนวนรับเข้าสุทธิไม่มากกว่าศูนย์'
            WHEN PurchaseCosts.MISSING_COST_LINES > 0 THEN N'รายการซื้อบางรายการไม่มีมูลค่าสุทธิ'
            WHEN PurchaseCosts.NET_PURCHASE_AMOUNT < 0 THEN N'มูลค่าซื้อสุทธิติดลบ'
            ELSE NULL
          END AS COST_REVIEW_REASON,
          CASE
            WHEN PurchaseCosts.SKU_CODE IS NOT NULL
              AND ISNULL(RawBase.SKM_LOT_NO, '') <> ''
              AND NULLIF(LTRIM(RTRIM(RawBase.BASE_UNIT_NAME)), '') IS NOT NULL
              AND PurchaseCosts.RECEIVED_BASE_QTY > 0
              AND PurchaseCosts.MISSING_COST_LINES = 0
              AND PurchaseCosts.NET_PURCHASE_AMOUNT >= 0
            THEN PurchaseCosts.NET_PURCHASE_AMOUNT / NULLIF(PurchaseCosts.RECEIVED_BASE_QTY, 0)
            ELSE NULL
          END AS UNIT_COST
        FROM RawBase
        LEFT JOIN PurchaseCosts
          ON PurchaseCosts.SKU_CODE = RawBase.SKU_CODE
          AND PurchaseCosts.LOT_NO = ISNULL(RawBase.SKM_LOT_NO, '')
      ),
      FilteredRows AS (
        SELECT
          *,
          CASE WHEN COST_STATUS = 'ready' THEN
            QTY_BASE * UNIT_COST
          ELSE NULL END AS INVENTORY_VALUE
        FROM CostedRows
        WHERE (@costStatus IS NULL OR COST_STATUS = @costStatus)
          ${positiveFilter}
      ),
      Totals AS (
        SELECT
          COUNT(1) AS totalRows,
          COUNT(DISTINCT SKU_CODE) AS TOTAL_PRODUCTS,
          COALESCE(SUM(QTY_BASE), 0) AS TOTAL_BASE_QTY,
          COALESCE(SUM(CASE WHEN COST_STATUS = 'ready' THEN INVENTORY_VALUE ELSE 0 END), 0) AS TOTAL_INVENTORY_VALUE,
          SUM(CASE WHEN COST_STATUS <> 'ready' THEN 1 ELSE 0 END) AS INCOMPLETE_COST_ROWS
        FROM FilteredRows
      ),
      PagedRows AS (
        SELECT TOP (@limit) *
        FROM FilteredRows
        WHERE 1 = 1
          ${cursorFilter}
        ORDER BY SKU_CODE ASC, ISNULL(SKM_LOT_NO, '') ASC, WL_CODE ASC
      )
      SELECT PagedRows.*, Totals.totalRows, Totals.TOTAL_PRODUCTS,
        Totals.TOTAL_BASE_QTY, Totals.TOTAL_INVENTORY_VALUE, Totals.INCOMPLETE_COST_ROWS
      FROM PagedRows
      CROSS JOIN Totals
      ORDER BY SKU_CODE ASC, ISNULL(SKM_LOT_NO, '') ASC, WL_CODE ASC;
    `;

    const dedupeKey = buildSqlDedupeKey("raw-materials", req);
    const { rows, totalRecords, summary, hasMore, nextCursor } = await dedupeSqlRequest(
      dedupeKey,
      async () => {
        const dataResult = await dataRequest.query(dataQuery);
        let dataRows = dataResult.recordset ?? [];
        let more = false;
        if (dataRows.length > pageSize) {
          more = true;
          dataRows = dataRows.slice(0, pageSize);
        }
        const total = dataRows[0]?.totalRows || 0;
        const summary = {
          totalProducts: Number(dataRows[0]?.TOTAL_PRODUCTS || 0),
          totalBaseQty: Number(dataRows[0]?.TOTAL_BASE_QTY || 0),
          totalInventoryValue: Number(dataRows[0]?.TOTAL_INVENTORY_VALUE || 0),
          incompleteCostRows: Number(dataRows[0]?.INCOMPLETE_COST_ROWS || 0),
        };
        const lastRow = dataRows[dataRows.length - 1];
        const cursorValue = lastRow
          ? encodeCursor({
              skuCode: lastRow.SKU_CODE,
              lotNo: lastRow.SKM_LOT_NO ?? "",
              warehouseCode: lastRow.WL_CODE ?? "",
            })
          : null;

        dataRows = dataRows.map(({
          totalRows,
          TOTAL_PRODUCTS,
          TOTAL_BASE_QTY,
          TOTAL_INVENTORY_VALUE,
          INCOMPLETE_COST_ROWS,
          ...rest
        }) => rest);
        return {
          rows: dataRows,
          totalRecords: total,
          summary,
          hasMore: more,
          nextCursor: cursorValue,
        };
      }
    );

    const payload = {
      data: rows,
      summary,
      pagination: {
        page,
        pageSize,
        totalRecords,
        totalPages: Math.max(1, Math.ceil(totalRecords / pageSize)),
      },
      cursor: {
        next: nextCursor,
        hasMore,
      },
    };

    if (!shouldBypassCache(req)) {
      setCachedResponse(cacheKey, payload, LOT_CACHE_TTL_MS);
      res.set("X-Cache", "MISS");
    }

    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: "SQL query failed", details: error.message });
  }
});

app.get("/api/raw-materials-summary", async (req, res) => {
  try {
    const brandCodes = normalizeListParam(req.query.brandCodes);
    const iccatCodesRaw = req.query.iccatCodes;
    const iccatCodes = normalizeListParam(
      iccatCodesRaw === undefined ? "01,02,03,05,08,10" : String(iccatCodesRaw)
    );
    const skuName = normalizeListParam(req.query.skuName);
    const page = parsePositiveInt(req.query.page, 1);
    const pageSize = parsePositiveInt(req.query.pageSize, 100, 500);
    const { cursor, error } = resolveCursor(res, page, req.query.cursor, parseSkuCursor);
    if (error) {
      return;
    }
    const limit = pageSize + 1;
    let dateFrom = normalizeListParam(req.query.dateFrom);
    let dateTo = normalizeListParam(req.query.dateTo);

    if (!dateFrom && !dateTo) {
      const now = new Date();
      const pad2 = (value) => String(value).padStart(2, "0");
      const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
      dateFrom = RAW_MATERIALS_DEFAULT_FROM;
      dateTo = today;
    }

    const connection = await getErpPool();
    const dataRequest = connection.request();
    dataRequest.input("brandCodesParam", sql.NVarChar, brandCodes);
    dataRequest.input("iccatCodesParam", sql.NVarChar, iccatCodes);
    dataRequest.input("skuNameParam", sql.NVarChar, skuName);
    dataRequest.input("dateFromParam", sql.Date, dateFrom);
    dataRequest.input("dateToParam", sql.Date, dateTo);
    dataRequest.input("limitParam", sql.Int, limit);
    if (cursor) {
      dataRequest.input("cursorSkuCode", sql.NVarChar, cursor.skuCode);
    }

    const cursorFilter = cursor ? "AND SKU_CODE > @cursorSkuCode" : "";

    const dataQuery = `
      DECLARE @brandCodes NVARCHAR(MAX) = @brandCodesParam;
      DECLARE @iccatCodes NVARCHAR(MAX) = @iccatCodesParam;
      DECLARE @skuName NVARCHAR(255) = @skuNameParam;
      DECLARE @skuNameLike NVARCHAR(255) = CASE WHEN @skuName IS NULL THEN NULL ELSE '%' + @skuName + '%' END;
      DECLARE @dateFrom DATE = @dateFromParam;
      DECLARE @dateTo DATE = @dateToParam;
      DECLARE @limit INT = @limitParam;

      WITH SummaryBase AS (
        SELECT
          SKUMASTER.SKU_CODE,
          SKUMASTER.SKU_NAME,
          ICDEPT.ICDEPT_CODE,
          ICCAT.ICCAT_CODE,
          ICCAT.ICCAT_NAME,
          UTQ2.UTQ_NAME_1 AS UTQ_NAME,
          UTQ2.UTQ_NAME_1 AS STOCK_UNIT_NAME,
          UTQ2.UTQ_QTY_1 AS STOCK_UNIT_FACTOR,
          UOFQTY.UTQ_NAME AS BASE_UNIT_NAME,
          SUM(SKUMOVE.SKM_QTY) / NULLIF(UTQ2.UTQ_QTY_1, 0) AS QTY,
          SUM(SKUMOVE.SKM_QTY) AS QTY_BASE
        FROM SKUMASTER
        JOIN BRAND ON SKUMASTER.SKU_BRN = BRAND.BRN_KEY
        JOIN ICDEPT ON SKUMASTER.SKU_ICDEPT = ICDEPT.ICDEPT_KEY
        JOIN ICCAT ON SKUMASTER.SKU_ICCAT = ICCAT.ICCAT_KEY
        JOIN SKUMOVE ON SKUMASTER.SKU_KEY = SKUMOVE.SKM_SKU
        JOIN DOCINFO ON SKUMOVE.SKM_DI = DOCINFO.DI_KEY
        JOIN WARELOCATION ON SKUMOVE.SKM_WL = WARELOCATION.WL_KEY
        JOIN UOFQTY ON SKUMASTER.SKU_K_UTQ = UOFQTY.UTQ_KEY
        JOIN (
          SELECT
            UOFQTY1.UTQ_KEY AS UTQ_KEY1,
            UOFQTY1.UTQ_NAME AS UTQ_NAME_1,
            UOFQTY1.UTQ_QTY AS UTQ_QTY_1
          FROM UOFQTY UOFQTY1
        ) UTQ2 ON SKUMASTER.SKU_S_UTQ = UTQ2.UTQ_KEY1
        WHERE
          SKUMASTER.SKU_ENABLE = 'Y'
          AND WARELOCATION.WL_CODE IN ('02', '04', '05', '17')
          AND SKUMASTER.SKU_CODE <> 'DC-001'
          AND ISNULL(ICDEPT.ICDEPT_CODE, '') <> 'NM'
          AND (@brandCodes IS NULL OR BRAND.BRN_CODE IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@brandCodes, ',')))
          AND (@iccatCodes IS NULL OR ICCAT.ICCAT_CODE IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@iccatCodes, ',')))
          AND (@dateFrom IS NULL OR DOCINFO.DI_DATE >= @dateFrom)
          AND (@dateTo IS NULL OR DOCINFO.DI_DATE <= @dateTo)
          AND (
            @skuName IS NULL
            OR SKUMASTER.SKU_NAME LIKE @skuNameLike
            OR SKUMASTER.SKU_CODE LIKE @skuNameLike
          )
        GROUP BY
          SKUMASTER.SKU_CODE,
          SKUMASTER.SKU_NAME,
          ICDEPT.ICDEPT_CODE,
          ICCAT.ICCAT_CODE,
          ICCAT.ICCAT_NAME,
          UTQ2.UTQ_NAME_1,
          UTQ2.UTQ_QTY_1,
          UOFQTY.UTQ_NAME
        -- include zero balances
      )
      SELECT TOP (@limit)
        SKU_CODE,
        SKU_NAME,
        ICDEPT_CODE,
        ICCAT_CODE,
        ICCAT_NAME,
        UTQ_NAME,
        STOCK_UNIT_NAME,
        STOCK_UNIT_FACTOR,
        BASE_UNIT_NAME,
        QTY,
        QTY_BASE,
        totalRows
      FROM (
        SELECT
          SKU_CODE,
          SKU_NAME,
          ICDEPT_CODE,
          ICCAT_CODE,
          ICCAT_NAME,
          UTQ_NAME,
          STOCK_UNIT_NAME,
          STOCK_UNIT_FACTOR,
          BASE_UNIT_NAME,
          QTY,
          QTY_BASE,
          COUNT(1) OVER() AS totalRows
        FROM SummaryBase
      ) SummaryWithCount
      WHERE 1=1
        ${cursorFilter}
      ORDER BY SKU_CODE ASC;
    `;

    const dedupeKey = buildSqlDedupeKey("raw-materials-summary", req);
    const { rows, totalRecords, hasMore, nextCursor } = await dedupeSqlRequest(
      dedupeKey,
      async () => {
        const dataResult = await dataRequest.query(dataQuery);
        let dataRows = dataResult.recordset ?? [];
        let more = false;
        if (dataRows.length > pageSize) {
          more = true;
          dataRows = dataRows.slice(0, pageSize);
        }
        const total = dataRows[0]?.totalRows || 0;
        const lastRow = dataRows[dataRows.length - 1];
        const cursorValue = lastRow ? encodeCursor({ skuCode: lastRow.SKU_CODE }) : null;

        dataRows = dataRows.map(({ totalRows, ...rest }) => rest);
        return {
          rows: dataRows,
          totalRecords: total,
          hasMore: more,
          nextCursor: cursorValue,
        };
      }
    );

    res.json({
      data: rows,
      pagination: {
        page,
        pageSize,
        totalRecords,
        totalPages: Math.max(1, Math.ceil(totalRecords / pageSize)),
      },
      cursor: {
        next: nextCursor,
        hasMore,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "SQL query failed", details: error.message });
  }
});

app.get("/api/raw-materials-movement", async (req, res) => {
  try {
    const brandCodes = normalizeListParam(req.query.brandCodes);
    const iccatCodesRaw = req.query.iccatCodes;
    const iccatCodes = normalizeListParam(
      iccatCodesRaw === undefined ? "01,02,03,05,08,10" : String(iccatCodesRaw)
    );
    const skuName = normalizeListParam(req.query.skuName);
    let dateFrom = normalizeListParam(req.query.dateFrom);
    let dateTo = normalizeListParam(req.query.dateTo);
    const page = parsePositiveInt(req.query.page, 1);
    const pageSize = parsePositiveInt(req.query.pageSize, 100, 500);
    const { cursor, error } = resolveCursor(res, page, req.query.cursor, parseSkuCursor);
    if (error) {
      return;
    }
    const limit = pageSize + 1;

    if (!dateFrom && !dateTo) {
      const now = new Date();
      const pad2 = (value) => String(value).padStart(2, "0");
      const startOfMonth = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
      const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
      dateFrom = startOfMonth;
      dateTo = today;
    }

    const cacheKey = getCacheKey("raw-materials-movement", req);
    if (!shouldBypassCache(req)) {
      const cached = getCachedResponse(cacheKey);
      if (cached) {
        res.set("X-Cache", "HIT");
        return res.json(cached);
      }
    }

    const connection = await getErpPool();
    const dataRequest = connection.request();
    dataRequest.input("brandCodesParam", sql.NVarChar, brandCodes);
    dataRequest.input("iccatCodesParam", sql.NVarChar, iccatCodes);
    dataRequest.input("skuNameParam", sql.NVarChar, skuName);
    dataRequest.input("dateFromParam", sql.Date, dateFrom);
    dataRequest.input("dateToParam", sql.Date, dateTo);
    dataRequest.input("limitParam", sql.Int, limit);
    dataRequest.timeout = 60000;
    if (cursor) {
      dataRequest.input("cursorSkuCode", sql.NVarChar, cursor.skuCode);
    }

    const cursorFilter = cursor
      ? "AND SKU_CODE > @cursorSkuCode"
      : "";

    const dataQuery = `
      SET NOCOUNT ON;
      DECLARE @brandCodes NVARCHAR(MAX) = @brandCodesParam;
      DECLARE @iccatCodes NVARCHAR(MAX) = @iccatCodesParam;
      DECLARE @skuName NVARCHAR(255) = @skuNameParam;
      DECLARE @skuNameLike NVARCHAR(255) = CASE WHEN @skuName IS NULL THEN NULL ELSE '%' + @skuName + '%' END;
      DECLARE @dateFrom DATE = @dateFromParam;
      DECLARE @dateTo DATE = @dateToParam;
      DECLARE @effectiveFrom DATE = ISNULL(@dateFrom, CONVERT(date, '1900-01-01'));
      DECLARE @effectiveTo DATE = ISNULL(@dateTo, CONVERT(date, '9999-12-31'));
      DECLARE @limit INT = @limitParam;
      DECLARE @returnDocProperty INT = 310;

      WITH MoveBase AS (
        SELECT
          SKUMASTER.SKU_CODE,
          SKUMASTER.SKU_NAME,
          ICDEPT.ICDEPT_CODE,
          ICCAT.ICCAT_CODE,
          ICCAT.ICCAT_NAME,
          UTQ2.UTQ_NAME_1 AS UTQ_NAME,
          DOCTYPE.DT_PROPERTIES AS DT_PROPERTIES,
          DOCINFO.DI_DATE,
          SKUMOVE.SKM_QTY / NULLIF(UTQ2.UTQ_QTY_1, 0) AS MOVE_QTY
        FROM SKUMASTER
        JOIN BRAND ON SKUMASTER.SKU_BRN = BRAND.BRN_KEY
        JOIN ICDEPT ON SKUMASTER.SKU_ICDEPT = ICDEPT.ICDEPT_KEY
        JOIN ICCAT ON SKUMASTER.SKU_ICCAT = ICCAT.ICCAT_KEY
        JOIN SKUMOVE ON SKUMASTER.SKU_KEY = SKUMOVE.SKM_SKU
        JOIN DOCINFO ON SKUMOVE.SKM_DI = DOCINFO.DI_KEY
        JOIN DOCTYPE ON DOCINFO.DI_DT = DOCTYPE.DT_KEY
        JOIN WARELOCATION ON SKUMOVE.SKM_WL = WARELOCATION.WL_KEY
        JOIN UOFQTY ON SKUMASTER.SKU_K_UTQ = UOFQTY.UTQ_KEY
        JOIN (
          SELECT
            UOFQTY1.UTQ_KEY AS UTQ_KEY1,
            UOFQTY1.UTQ_NAME AS UTQ_NAME_1,
            UOFQTY1.UTQ_QTY AS UTQ_QTY_1
          FROM UOFQTY UOFQTY1
        ) UTQ2 ON SKUMASTER.SKU_S_UTQ = UTQ2.UTQ_KEY1
        WHERE
          SKUMASTER.SKU_ENABLE = 'Y'
          AND WARELOCATION.WL_CODE IN ('02', '04')
          AND (@brandCodes IS NULL OR BRAND.BRN_CODE IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@brandCodes, ',')))
          AND (@iccatCodes IS NULL OR ICCAT.ICCAT_CODE IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@iccatCodes, ',')))
          AND (
            @skuName IS NULL
            OR SKUMASTER.SKU_NAME LIKE @skuNameLike
            OR SKUMASTER.SKU_CODE LIKE @skuNameLike
          )
          AND DOCINFO.DI_DATE <= @effectiveTo
      ),
      Movement AS (
        SELECT
          SKU_CODE,
          SKU_NAME,
          ICDEPT_CODE,
          ICCAT_CODE,
          ICCAT_NAME,
          UTQ_NAME,
          SUM(CASE WHEN DI_DATE < @effectiveFrom THEN MOVE_QTY ELSE 0 END) AS OPENING_QTY,
          SUM(CASE WHEN DI_DATE >= @effectiveFrom AND DI_DATE <= @effectiveTo AND MOVE_QTY > 0 AND DT_PROPERTIES <> @returnDocProperty THEN MOVE_QTY ELSE 0 END) AS IN_PURCHASE_QTY,
          SUM(CASE WHEN DI_DATE >= @effectiveFrom AND DI_DATE <= @effectiveTo AND MOVE_QTY > 0 AND DT_PROPERTIES = @returnDocProperty THEN MOVE_QTY ELSE 0 END) AS IN_RETURN_QTY,
          SUM(CASE WHEN DI_DATE >= @effectiveFrom AND DI_DATE <= @effectiveTo AND MOVE_QTY < 0 THEN -MOVE_QTY ELSE 0 END) AS OUT_QTY,
          SUM(CASE WHEN DI_DATE < @effectiveFrom THEN MOVE_QTY ELSE 0 END)
            + SUM(CASE WHEN DI_DATE >= @effectiveFrom AND DI_DATE <= @effectiveTo THEN MOVE_QTY ELSE 0 END) AS ENDING_QTY
        FROM MoveBase
        GROUP BY
          SKU_CODE,
          SKU_NAME,
          ICDEPT_CODE,
          ICCAT_CODE,
          ICCAT_NAME,
          UTQ_NAME
        HAVING
          SUM(CASE WHEN DI_DATE < @effectiveFrom THEN MOVE_QTY ELSE 0 END) <> 0
          OR SUM(CASE WHEN DI_DATE >= @effectiveFrom AND DI_DATE <= @effectiveTo AND MOVE_QTY > 0 AND DT_PROPERTIES <> @returnDocProperty THEN MOVE_QTY ELSE 0 END) <> 0
          OR SUM(CASE WHEN DI_DATE >= @effectiveFrom AND DI_DATE <= @effectiveTo AND MOVE_QTY > 0 AND DT_PROPERTIES = @returnDocProperty THEN MOVE_QTY ELSE 0 END) <> 0
          OR SUM(CASE WHEN DI_DATE >= @effectiveFrom AND DI_DATE <= @effectiveTo AND MOVE_QTY < 0 THEN -MOVE_QTY ELSE 0 END) <> 0
      )
      SELECT TOP (@limit)
        SKU_CODE,
        SKU_NAME,
        ICDEPT_CODE,
        ICCAT_CODE,
        ICCAT_NAME,
        UTQ_NAME,
        OPENING_QTY,
        IN_PURCHASE_QTY,
        IN_RETURN_QTY,
        OUT_QTY,
        ENDING_QTY,
        totalRows
      FROM (
        SELECT
          SKU_CODE,
          SKU_NAME,
          ICDEPT_CODE,
          ICCAT_CODE,
          ICCAT_NAME,
          UTQ_NAME,
          OPENING_QTY,
          IN_PURCHASE_QTY,
          IN_RETURN_QTY,
          OUT_QTY,
          ENDING_QTY,
          COUNT(1) OVER() AS totalRows
        FROM Movement
      ) MovementWithCount
      WHERE 1=1
        ${cursorFilter}
      ORDER BY SKU_CODE ASC;
    `;

    const dedupeKey = buildSqlDedupeKey("raw-materials-movement", req);
    const { rows, totalRecords, hasMore, nextCursor } = await dedupeSqlRequest(
      dedupeKey,
      async () => {
        const dataResult = await dataRequest.query(dataQuery);
        let dataRows = dataResult.recordset ?? [];
        let more = false;
        if (dataRows.length > pageSize) {
          more = true;
          dataRows = dataRows.slice(0, pageSize);
        }
        const total = dataRows[0]?.totalRows || 0;
        const lastRow = dataRows[dataRows.length - 1];
        const cursorValue = lastRow ? encodeCursor({ skuCode: lastRow.SKU_CODE }) : null;

        dataRows = dataRows.map(({ totalRows, ...rest }) => rest);
        return {
          rows: dataRows,
          totalRecords: total,
          hasMore: more,
          nextCursor: cursorValue,
        };
      }
    );

    res.json({
      data: rows,
      pagination: {
        page,
        pageSize,
        totalRecords,
        totalPages: Math.max(1, Math.ceil(totalRecords / pageSize)),
      },
      cursor: {
        next: nextCursor,
        hasMore,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "SQL query failed", details: error.message });
  }
});

app.get("/api/material-movement-log", requireAuth, async (req, res) => {
  try {
    const skusParam = req.query.skus ? String(req.query.skus) : "";
    if (!skusParam.trim()) {
      return res.json({ data: [] });
    }

    const dateFrom = parseDateParam(req.query.dateFrom);
    const dateTo = parseDateParam(req.query.dateTo);
    const limit = parsePositiveInt(req.query.limit, 300, 2000);
    const cacheKey = getCacheKey("material-movement-log", req);
    if (!shouldBypassCache(req)) {
      const cached = getCachedResponse(cacheKey);
      if (cached) {
        res.set("X-Cache", "HIT");
        return res.json(cached);
      }
    }

    const connection = await getErpPool();
    const requestSql = connection.request();
    requestSql.input("skuList", sql.NVarChar, skusParam);
    requestSql.input("dateFromParam", sql.Date, dateFrom);
    requestSql.input("dateToParam", sql.Date, dateTo);
    requestSql.input("limitParam", sql.Int, limit);

    const query = `
      DECLARE @dateFrom DATE = @dateFromParam;
      DECLARE @dateTo DATE = @dateToParam;

      WITH MovementLog AS (
        SELECT
          LTRIM(RTRIM(SKUMASTER.SKU_CODE)) AS SKU_CODE,
          SKUMASTER.SKU_NAME,
          UTQ2.UTQ_NAME_1 AS UTQ_NAME,
          CAST(DOCINFO.DI_DATE AS DATE) AS MOVEMENT_DATE,
          DOCINFO.DI_REF,
          CAST(LEFT(COALESCE(DOCINFO.DI_REMARK, ''), 255) AS VARCHAR(255)) AS DI_REMARK,
          DOCTYPE.DT_PROPERTIES,
          WARELOCATION.WL_CODE,
          SKUMOVE.SKM_QTY / NULLIF(UTQ2.UTQ_QTY_1, 0) AS MOVE_QTY
        FROM SKUMASTER
        JOIN SKUMOVE ON SKUMASTER.SKU_KEY = SKUMOVE.SKM_SKU
        JOIN DOCINFO ON SKUMOVE.SKM_DI = DOCINFO.DI_KEY
        JOIN DOCTYPE ON DOCINFO.DI_DT = DOCTYPE.DT_KEY
        JOIN WARELOCATION ON SKUMOVE.SKM_WL = WARELOCATION.WL_KEY
        JOIN (
          SELECT
            UOFQTY1.UTQ_KEY AS UTQ_KEY1,
            UOFQTY1.UTQ_NAME AS UTQ_NAME_1,
            UOFQTY1.UTQ_QTY AS UTQ_QTY_1
          FROM UOFQTY UOFQTY1
        ) UTQ2 ON SKUMASTER.SKU_S_UTQ = UTQ2.UTQ_KEY1
        WHERE
          SKUMASTER.SKU_ENABLE = 'Y'
          AND LTRIM(RTRIM(SKUMASTER.SKU_CODE)) IN (
            SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@skuList, ',')
          )
          AND (@dateFrom IS NULL OR DOCINFO.DI_DATE >= @dateFrom)
          AND (@dateTo IS NULL OR DOCINFO.DI_DATE <= @dateTo)
      )
      SELECT TOP (@limitParam)
        SKU_CODE,
        SKU_NAME,
        UTQ_NAME,
        MOVEMENT_DATE,
        DI_REF,
        DI_REMARK,
        DT_PROPERTIES,
        WL_CODE,
        MOVE_QTY,
        CASE
          WHEN MOVE_QTY < 0 THEN ABS(MOVE_QTY)
          ELSE 0
        END AS ISSUE_QTY,
        CASE
          WHEN MOVE_QTY > 0 THEN MOVE_QTY
          ELSE 0
        END AS RECEIPT_QTY
      FROM MovementLog
      ORDER BY MOVEMENT_DATE DESC, DI_REF DESC, SKU_CODE ASC;
    `;

    const dedupeKey = buildSqlDedupeKey("material-movement-log", req);
    const rows = await dedupeSqlRequest(dedupeKey, async () => {
      const result = await requestSql.query(query);
      return result.recordset ?? [];
    });

    const payload = { data: rows };
    if (!shouldBypassCache(req)) {
      setCachedResponse(cacheKey, payload);
      res.set("X-Cache", "MISS");
    }
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: "SQL query failed", details: error.message });
  }
});

app.get("/api/iccat-types", async (req, res) => {
  try {
    const connection = await getErpPool();
    const group = req.query.group ? String(req.query.group) : null;
    const includeExtended
      = group === "products" || group === "trade-codes";
    const codes = includeExtended
      ? ['01','02','03','04','04-1','04-2','05','08','10']
      : ['01','02','03','05','08','10'];
    const query = `
      SELECT ICCAT_CODE, ICCAT_NAME
      FROM ICCAT
      WHERE ICCAT_CODE IN (${codes.map((code) => `'${code}'`).join(",")})
      ORDER BY ICCAT_CODE ASC
    `;

    const result = await connection.request().query(query);
    res.json({ data: result.recordset ?? [] });
  } catch (error) {
    res.status(500).json({ error: "SQL query failed", details: error.message });
  }
});

app.get("/api/brand-types", async (req, res) => {
  try {
    const connection = await getErpPool();
    const query = `
      SELECT DISTINCT BRAND.BRN_CODE, BRAND.BRN_NAME
      FROM BRAND
      JOIN SKUMASTER ON SKUMASTER.SKU_BRN = BRAND.BRN_KEY
      JOIN ICCAT ON SKUMASTER.SKU_ICCAT = ICCAT.ICCAT_KEY
      WHERE ICCAT.ICCAT_CODE IN ('01','02','03','04','04-1','04-2','05','08','10')
      ORDER BY BRAND.BRN_NAME ASC, BRAND.BRN_CODE ASC
    `;

    const result = await connection.request().query(query);
    res.json({ data: result.recordset ?? [] });
  } catch (error) {
    res.status(500).json({ error: "SQL query failed", details: error.message });
  }
});

app.get("/api/products", async (req, res) => {
  try {
    const search = req.query.search ? String(req.query.search).trim() : "";
    const brandCodes = normalizeListParam(req.query.brandCodes);
    const iccatCodes = normalizeListParam(req.query.iccatCodes);
    const page = parsePositiveInt(req.query.page, 1);
    const pageSize = parsePositiveInt(req.query.pageSize, 100, 500);
    const { cursor, error } = resolveCursor(res, page, req.query.cursor, parseProductsCursor);
    if (error) {
      return;
    }
    const limit = pageSize + 1;

    const connection = await getErpPool();
    const requestSql = connection.request();
    requestSql.input("brandCodesParam", sql.NVarChar, brandCodes);
    requestSql.input("iccatCodesParam", sql.NVarChar, iccatCodes);
    requestSql.input("limitParam", sql.Int, limit);
    if (search) {
      requestSql.input("searchParam", sql.NVarChar, `%${search}%`);
    }
    if (cursor) {
      requestSql.input("cursorOrder", sql.Int, cursor.order);
      requestSql.input("cursorSkuCode", sql.NVarChar, cursor.skuCode);
      requestSql.input("cursorApCode", sql.NVarChar, cursor.apCode);
    }

    const searchFilter = search
      ? `AND (
          APFILE.AP_CODE LIKE @searchParam
          OR APFILE.AP_NAME LIKE @searchParam
          OR SKUMASTER.SKU_CODE LIKE @searchParam
          OR SKUMASTER.SKU_NAME LIKE @searchParam
          OR SKUMASTER.SKU_E_NAME LIKE @searchParam
          OR ICCAT.ICCAT_CODE LIKE @searchParam
          OR ICCAT.ICCAT_NAME LIKE @searchParam
          OR BRAND.BRN_CODE LIKE @searchParam
          OR BRAND.BRN_NAME LIKE @searchParam
          OR SKUALT.SKUALT_CODE LIKE @searchParam
          OR SKUALT.SKUALT_NAME LIKE @searchParam
          OR ICCOLOR.ICCOLOR_CODE LIKE @searchParam
          OR ICCOLOR.ICCOLOR_NAME LIKE @searchParam
          OR ICSIZE.ICSIZE_CODE LIKE @searchParam
          OR ICSIZE.ICSIZE_NAME LIKE @searchParam
          OR ICDEPT.ICDEPT_CODE LIKE @searchParam
          OR ICDEPT.ICDEPT_THAIDESC LIKE @searchParam
          OR ICPRT.ICPRT_CODE LIKE @searchParam
          OR ICPRT.ICPRT_NAME LIKE @searchParam
          OR ICGL.ICGL_CODE LIKE @searchParam
          OR ICGL.ICGL_NAME LIKE @searchParam
          OR WARELOCATION.WL_CODE LIKE @searchParam
          OR WARELOCATION.WL_NAME LIKE @searchParam
          OR WAREZONE.WZ_CODE LIKE @searchParam
          OR UOFQTY.UTQ_NAME LIKE @searchParam
          OR UTQ2.UTQ_NAME_1 LIKE @searchParam
          OR SKUMASTER.SKU_MSG_1 LIKE @searchParam
          OR SKUMASTER.SKU_MSG_2 LIKE @searchParam
          OR SKUMASTER.SKU_MSG_3 LIKE @searchParam
        )`
      : "";

    const cursorFilter = cursor
      ? `AND (
          ICCAT_ORDER > @cursorOrder
          OR (ICCAT_ORDER = @cursorOrder AND SKU_CODE > @cursorSkuCode)
          OR (ICCAT_ORDER = @cursorOrder AND SKU_CODE = @cursorSkuCode AND AP_CODE > @cursorApCode)
        )`
      : "";

    const dataQuery = `
      DECLARE @brandCodes NVARCHAR(MAX) = @brandCodesParam;
      DECLARE @iccatCodes NVARCHAR(MAX) = @iccatCodesParam;
      DECLARE @limit INT = @limitParam;

      WITH Base AS (
        SELECT
          APFILE.AP_CODE,
          APFILE.AP_NAME,
          SKUMASTER.SKU_ENABLE,
          SKUMASTER.SKU_P_ENABLE,
          SKUMASTER.SKU_CODE,
          SKUMASTER.SKU_NAME,
          SKUMASTER.SKU_E_NAME,
          ICCAT.ICCAT_CODE,
          ICCAT.ICCAT_NAME,
          BRAND.BRN_CODE,
          BRAND.BRN_NAME,
          SKUALT.SKUALT_CODE,
          SKUALT.SKUALT_NAME,
          ICCOLOR.ICCOLOR_CODE,
          ICCOLOR.ICCOLOR_NAME,
          ICSIZE.ICSIZE_CODE,
          ICSIZE.ICSIZE_NAME,
          ICDEPT.ICDEPT_CODE,
          ICDEPT.ICDEPT_THAIDESC,
          ICPRT.ICPRT_CODE,
          ICPRT.ICPRT_NAME,
          ICGL.ICGL_CODE,
          ICGL.ICGL_NAME,
          WARELOCATION.WL_CODE,
          WARELOCATION.WL_NAME,
          WAREZONE.WZ_CODE,
          UOFQTY.UTQ_NAME,
          UOFQTY.UTQ_QTY,
          UTQ2.UTQ_NAME_1,
          UTQ2.UTQ_QTY_1,
          SKUMASTER.SKU_STOCK,
          SKUMASTER.SKU_COST_TY,
          SKUMASTER.SKU_STD_COST,
          SKUMASTER.SKU_LAST_UCCOST,
          SKUMASTER.SKU_VAT_TY,
          SKUMASTER.SKU_VAT,
          SKUMASTER.SKU_WH_TY,
          SKUMASTER.SKU_WH_RATE,
          SKUMASTER.SKU_MSG_1,
          SKUMASTER.SKU_MSG_2,
          SKUMASTER.SKU_MSG_3,
          CASE
            WHEN ICCAT.ICCAT_CODE = '04' THEN 1
            WHEN ICCAT.ICCAT_CODE = '04-1' THEN 2
            WHEN ICCAT.ICCAT_CODE = '04-2' THEN 3
            ELSE 9
          END AS ICCAT_ORDER
        FROM SKUMASTER
        JOIN ICCAT ON SKUMASTER.SKU_ICCAT = ICCAT.ICCAT_KEY
        JOIN BRAND ON SKUMASTER.SKU_BRN = BRAND.BRN_KEY
        JOIN SKUALT ON SKUMASTER.SKU_SKUALT = SKUALT.SKUALT_KEY
        JOIN ICCOLOR ON SKUMASTER.SKU_ICCOLOR = ICCOLOR.ICCOLOR_KEY
        JOIN ICSIZE ON SKUMASTER.SKU_ICSIZE = ICSIZE.ICSIZE_KEY
        JOIN ICDEPT ON SKUMASTER.SKU_ICDEPT = ICDEPT.ICDEPT_KEY
        JOIN ICPRT ON SKUMASTER.SKU_ICPRT = ICPRT.ICPRT_KEY
        JOIN ICGL ON SKUMASTER.SKU_ICGL = ICGL.ICGL_KEY
        JOIN WARELOCATION ON SKUMASTER.SKU_WL = WARELOCATION.WL_KEY
        JOIN WAREHOUSE ON WARELOCATION.WL_WH = WAREHOUSE.WH_KEY
        JOIN UOFQTY ON SKUMASTER.SKU_K_UTQ = UOFQTY.UTQ_KEY
        JOIN SKUAP ON SKUMASTER.SKU_KEY = SKUAP.SKP_SKU
        JOIN APFILE ON SKUAP.SKP_AP = APFILE.AP_KEY
        JOIN WAREZONE ON SKUMASTER.SKU_WZ = WAREZONE.WZ_KEY
        JOIN (
          SELECT
            UOFQTY1.UTQ_KEY AS UTQ_KEY1,
            UOFQTY1.UTQ_NAME AS UTQ_NAME_1,
            UOFQTY1.UTQ_QTY AS UTQ_QTY_1
          FROM UOFQTY UOFQTY1
        ) UTQ2 ON SKUMASTER.SKU_S_UTQ = UTQ2.UTQ_KEY1
        WHERE
          SKUMASTER.SKU_CODE IS NOT NULL
          AND SKUAP.SKP_DEFAULT = 'Y'
          AND (@brandCodes IS NULL OR BRAND.BRN_CODE IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@brandCodes, ',')))
          AND (@iccatCodes IS NULL OR ICCAT.ICCAT_CODE IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@iccatCodes, ',')))
          AND ICCAT.ICCAT_CODE IN ('01','02','03','04','04-1','04-2','05','08','10')
          ${searchFilter}
      )
      SELECT TOP (@limit)
        AP_CODE,
        AP_NAME,
        SKU_ENABLE,
        SKU_P_ENABLE,
        SKU_CODE,
        SKU_NAME,
        SKU_E_NAME,
        ICCAT_CODE,
        ICCAT_NAME,
        BRN_CODE,
        BRN_NAME,
        SKUALT_CODE,
        SKUALT_NAME,
        ICCOLOR_CODE,
        ICCOLOR_NAME,
        ICSIZE_CODE,
        ICSIZE_NAME,
        ICDEPT_CODE,
        ICDEPT_THAIDESC,
        ICPRT_CODE,
        ICPRT_NAME,
        ICGL_CODE,
        ICGL_NAME,
        WL_CODE,
        WL_NAME,
        WZ_CODE,
        UTQ_NAME,
        UTQ_QTY,
        UTQ_NAME_1,
        UTQ_QTY_1,
        SKU_STOCK,
        SKU_COST_TY,
        SKU_STD_COST,
        SKU_LAST_UCCOST,
        SKU_VAT_TY,
        SKU_VAT,
        SKU_WH_TY,
        SKU_WH_RATE,
        SKU_MSG_1,
        SKU_MSG_2,
        SKU_MSG_3
      FROM Base
      WHERE 1=1
        ${cursorFilter}
      ORDER BY ICCAT_ORDER ASC, SKU_CODE ASC, AP_CODE ASC;
    `;

    const countRequest = connection.request();
    countRequest.input("brandCodesParam", sql.NVarChar, brandCodes);
    countRequest.input("iccatCodesParam", sql.NVarChar, iccatCodes);
    if (search) {
      countRequest.input("searchParam", sql.NVarChar, `%${search}%`);
    }

    const countQuery = `
      DECLARE @brandCodes NVARCHAR(MAX) = @brandCodesParam;
      DECLARE @iccatCodes NVARCHAR(MAX) = @iccatCodesParam;
      SELECT COUNT(1) AS totalRows
      FROM SKUMASTER
      JOIN ICCAT ON SKUMASTER.SKU_ICCAT = ICCAT.ICCAT_KEY
      JOIN BRAND ON SKUMASTER.SKU_BRN = BRAND.BRN_KEY
      JOIN SKUALT ON SKUMASTER.SKU_SKUALT = SKUALT.SKUALT_KEY
      JOIN ICCOLOR ON SKUMASTER.SKU_ICCOLOR = ICCOLOR.ICCOLOR_KEY
      JOIN ICSIZE ON SKUMASTER.SKU_ICSIZE = ICSIZE.ICSIZE_KEY
      JOIN ICDEPT ON SKUMASTER.SKU_ICDEPT = ICDEPT.ICDEPT_KEY
      JOIN ICPRT ON SKUMASTER.SKU_ICPRT = ICPRT.ICPRT_KEY
      JOIN ICGL ON SKUMASTER.SKU_ICGL = ICGL.ICGL_KEY
      JOIN WARELOCATION ON SKUMASTER.SKU_WL = WARELOCATION.WL_KEY
      JOIN WAREHOUSE ON WARELOCATION.WL_WH = WAREHOUSE.WH_KEY
      JOIN UOFQTY ON SKUMASTER.SKU_K_UTQ = UOFQTY.UTQ_KEY
      JOIN SKUAP ON SKUMASTER.SKU_KEY = SKUAP.SKP_SKU
      JOIN APFILE ON SKUAP.SKP_AP = APFILE.AP_KEY
      JOIN WAREZONE ON SKUMASTER.SKU_WZ = WAREZONE.WZ_KEY
      JOIN (
        SELECT
          UOFQTY1.UTQ_KEY AS UTQ_KEY1,
          UOFQTY1.UTQ_NAME AS UTQ_NAME_1,
          UOFQTY1.UTQ_QTY AS UTQ_QTY_1
        FROM UOFQTY UOFQTY1
      ) UTQ2 ON SKUMASTER.SKU_S_UTQ = UTQ2.UTQ_KEY1
      WHERE
        SKUMASTER.SKU_CODE IS NOT NULL
        AND SKUAP.SKP_DEFAULT = 'Y'
        AND (@brandCodes IS NULL OR BRAND.BRN_CODE IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@brandCodes, ',')))
        AND (@iccatCodes IS NULL OR ICCAT.ICCAT_CODE IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@iccatCodes, ',')))
        AND ICCAT.ICCAT_CODE IN ('01','02','03','04','04-1','04-2','05','08','10')
        ${searchFilter}
    `;

    const dedupeKey = buildSqlDedupeKey("products", req);
    const { rows, totalRecords, hasMore, nextCursor } = await dedupeSqlRequest(
      dedupeKey,
      async () => {
        const [dataResult, countResult] = await Promise.all([
          requestSql.query(dataQuery),
          countRequest.query(countQuery),
        ]);

        const total = countResult.recordset[0]?.totalRows || 0;
        let dataRows = dataResult.recordset ?? [];
        let more = false;
        if (dataRows.length > pageSize) {
          more = true;
          dataRows = dataRows.slice(0, pageSize);
        }
        const lastRow = dataRows[dataRows.length - 1];
        const cursorValue = lastRow
          ? encodeCursor({
              order: getProductOrder(lastRow.ICCAT_CODE),
              skuCode: lastRow.SKU_CODE,
              apCode: lastRow.AP_CODE,
            })
          : null;

        return {
          rows: dataRows,
          totalRecords: total,
          hasMore: more,
          nextCursor: cursorValue,
        };
      }
    );

    res.json({
      data: rows,
      pagination: {
        page,
        pageSize,
        totalRecords,
        totalPages: Math.max(1, Math.ceil(totalRecords / pageSize)),
      },
      cursor: {
        next: nextCursor,
        hasMore,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "SQL query failed", details: error.message });
  }
});

app.get("/api/raw-materials-summary-by-skus", async (req, res) => {
  try {
    const skusParam = req.query.skus ? String(req.query.skus) : "";
    if (!skusParam.trim()) {
      return res.json({ data: [] });
    }

    let dateFrom = normalizeListParam(req.query.dateFrom);
    let dateTo = normalizeListParam(req.query.dateTo);
    const warehouseCodes = normalizeListParam(req.query.warehouseCodes) || "OL,1,02,04,05";
    if (!dateFrom && !dateTo) {
      const now = new Date();
      const pad2 = (value) => String(value).padStart(2, "0");
      const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
      dateFrom = RAW_MATERIALS_DEFAULT_FROM;
      dateTo = today;
    }

    const cacheKey = getCacheKey("raw-materials-summary-by-skus", req);
    if (!shouldBypassCache(req)) {
      const cached = getCachedResponse(cacheKey);
      if (cached) {
        res.set("X-Cache", "HIT");
        return res.json(cached);
      }
    }

    const connection = await getErpPool();
    const requestSql = connection.request();
    requestSql.input("skuList", sql.NVarChar, skusParam);
    requestSql.input("warehouseCodesParam", sql.NVarChar, warehouseCodes);
    requestSql.input("dateFromParam", sql.Date, dateFrom);
    requestSql.input("dateToParam", sql.Date, dateTo);

    const query = `
      DECLARE @dateFrom DATE = @dateFromParam;
      DECLARE @dateTo DATE = @dateToParam;

      WITH LotBase AS (
        SELECT
          SKUMASTER.SKU_CODE,
          SKUMASTER.SKU_NAME,
          ICDEPT.ICDEPT_CODE,
          ICCAT.ICCAT_CODE,
          ICCAT.ICCAT_NAME,
          UTQ2.UTQ_NAME_1 AS UTQ_NAME,
          UOFQTY.UTQ_NAME AS UTQ_K_NAME,
          WARELOCATION.WL_CODE,
          SKUMOVE.SKM_LOT_NO,
          SUM(SKUMOVE.SKM_QTY) / NULLIF(UTQ2.UTQ_QTY_1, 0) AS QTY,
          SUM(SKUMOVE.SKM_QTY) AS QTY_K
        FROM SKUMASTER
        JOIN ICDEPT ON SKUMASTER.SKU_ICDEPT = ICDEPT.ICDEPT_KEY
        JOIN ICCAT ON SKUMASTER.SKU_ICCAT = ICCAT.ICCAT_KEY
        JOIN SKUMOVE ON SKUMASTER.SKU_KEY = SKUMOVE.SKM_SKU
        JOIN DOCINFO ON SKUMOVE.SKM_DI = DOCINFO.DI_KEY
        JOIN WARELOCATION ON SKUMOVE.SKM_WL = WARELOCATION.WL_KEY
        JOIN UOFQTY ON SKUMASTER.SKU_K_UTQ = UOFQTY.UTQ_KEY
        JOIN (
          SELECT
            UOFQTY1.UTQ_KEY AS UTQ_KEY1,
            UOFQTY1.UTQ_NAME AS UTQ_NAME_1,
            UOFQTY1.UTQ_QTY AS UTQ_QTY_1
          FROM UOFQTY UOFQTY1
        ) UTQ2 ON SKUMASTER.SKU_S_UTQ = UTQ2.UTQ_KEY1
        WHERE
          SKUMASTER.SKU_ENABLE = 'Y'
          AND WARELOCATION.WL_CODE IN (
            SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@warehouseCodesParam, ',')
          )
          AND SKUMASTER.SKU_CODE <> 'DC-001'
          AND ISNULL(ICDEPT.ICDEPT_CODE, '') <> 'NM'
          AND LTRIM(RTRIM(SKUMASTER.SKU_CODE)) IN (
            SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@skuList, ',')
          )
          AND (@dateFrom IS NULL OR DOCINFO.DI_DATE >= @dateFrom)
          AND (@dateTo IS NULL OR DOCINFO.DI_DATE <= @dateTo)
        GROUP BY
          SKUMASTER.SKU_CODE,
          SKUMASTER.SKU_NAME,
          ICDEPT.ICDEPT_CODE,
          ICCAT.ICCAT_CODE,
          ICCAT.ICCAT_NAME,
          UTQ2.UTQ_NAME_1,
          UTQ2.UTQ_QTY_1,
          UOFQTY.UTQ_NAME,
          WARELOCATION.WL_CODE,
          SKUMOVE.SKM_LOT_NO

      ),
      SummaryBase AS (
        SELECT
          SKU_CODE,
          SKU_NAME,
          ICDEPT_CODE,
          ICCAT_CODE,
          ICCAT_NAME,
          UTQ_NAME,
          UTQ_K_NAME,
          WL_CODE,
          SUM(QTY) AS QTY,
          SUM(QTY_K) AS QTY_K
        FROM LotBase
        -- include zero balances
        GROUP BY
          SKU_CODE,
          SKU_NAME,
          ICDEPT_CODE,
          ICCAT_CODE,
          ICCAT_NAME,
          UTQ_NAME,
          UTQ_K_NAME
          ,WL_CODE
        -- include zero balances
      )
      SELECT
        SKU_CODE,
        SKU_NAME,
        ICDEPT_CODE,
        ICCAT_CODE,
        ICCAT_NAME,
        UTQ_NAME,
        UTQ_K_NAME,
        WL_CODE,
        QTY_K,
        QTY
      FROM SummaryBase
      ORDER BY SKU_CODE ASC;
    `;

    const dedupeKey = buildSqlDedupeKey("raw-materials-summary-by-skus", req);
    const warehouseRows = await dedupeSqlRequest(dedupeKey, async () => {
      const result = await requestSql.query(query);
      return result.recordset ?? [];
    });
    const rowsBySku = new Map();
    warehouseRows.forEach((row) => {
      const skuCode = String(row?.SKU_CODE || "").trim().toUpperCase();
      if (!skuCode) return;
      if (!rowsBySku.has(skuCode)) {
        rowsBySku.set(skuCode, {
          ...row,
          QTY_K: 0,
          QTY: 0,
          WAREHOUSE_BREAKDOWN: [],
        });
        delete rowsBySku.get(skuCode).WL_CODE;
      }
      const summary = rowsBySku.get(skuCode);
      const qtyBase = Number(row?.QTY_K || 0);
      const qtyStockUnit = Number(row?.QTY || 0);
      summary.QTY_K += Number.isFinite(qtyBase) ? qtyBase : 0;
      summary.QTY += Number.isFinite(qtyStockUnit) ? qtyStockUnit : 0;
      summary.WAREHOUSE_BREAKDOWN.push({
        warehouseCode: String(row?.WL_CODE || "").trim(),
        qtyBase: Number.isFinite(qtyBase) ? qtyBase : 0,
        qtyStockUnit: Number.isFinite(qtyStockUnit) ? qtyStockUnit : 0,
      });
    });
    const rows = Array.from(rowsBySku.values()).sort((a, b) =>
      String(a.SKU_CODE || "").localeCompare(String(b.SKU_CODE || ""))
    );
    const payload = { data: rows };
    if (!shouldBypassCache(req)) {
      setCachedResponse(cacheKey, payload);
      res.set("X-Cache", "MISS");
    }
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: "SQL query failed", details: error.message });
  }
});

app.get("/api/raw-material-lots-by-parent", async (req, res) => {
  try {
    const parentCodes = normalizeListParam(req.query.parentCodes);
    if (!parentCodes) {
      return res.status(400).json({ error: "parentCodes is required" });
    }

    const cacheKey = getCacheKey("raw-material-lots-by-parent", req);
    if (!shouldBypassCache(req)) {
      const cached = getCachedResponse(cacheKey);
      if (cached) {
        res.set("X-Cache", "HIT");
        return res.json(cached);
      }
    }

    const connection = await getErpPool();
    const requestSql = connection.request();
    requestSql.input("parentCodesParam", sql.NVarChar, parentCodes);

    const query = `
      DECLARE @parentCodes NVARCHAR(MAX) = @parentCodesParam;

      WITH LotBase AS (
        SELECT
          SKUMASTER.SKU_CODE AS PARENT_SKU_CODE,
          SKUMASTER.SKU_NAME,
          ICDEPT.ICDEPT_CODE,
          ICCAT.ICCAT_CODE,
          ICCAT.ICCAT_NAME,
          WARELOCATION.WL_CODE,
          UTQ2.UTQ_NAME_1 AS STOCK_UNIT_NAME,
          UTQ2.UTQ_QTY_1 AS STOCK_PACK_SIZE,
          SKUMOVE.SKM_LOT_NO,
          MIN(DOCINFO.DI_DATE) AS FIFO_DATE,
          SUM(SKUMOVE.SKM_QTY) / NULLIF(UTQ2.UTQ_QTY_1, 0) AS QTY
        FROM SKUMASTER
        JOIN ICDEPT ON SKUMASTER.SKU_ICDEPT = ICDEPT.ICDEPT_KEY
        JOIN ICCAT ON SKUMASTER.SKU_ICCAT = ICCAT.ICCAT_KEY
        JOIN SKUMOVE ON SKUMASTER.SKU_KEY = SKUMOVE.SKM_SKU
        JOIN DOCINFO ON SKUMOVE.SKM_DI = DOCINFO.DI_KEY
        JOIN WARELOCATION ON SKUMOVE.SKM_WL = WARELOCATION.WL_KEY
        JOIN UOFQTY ON SKUMASTER.SKU_K_UTQ = UOFQTY.UTQ_KEY
        JOIN (
          SELECT
            UOFQTY1.UTQ_KEY AS UTQ_KEY1,
            UOFQTY1.UTQ_NAME AS UTQ_NAME_1,
            UOFQTY1.UTQ_QTY AS UTQ_QTY_1
          FROM UOFQTY UOFQTY1
        ) UTQ2 ON SKUMASTER.SKU_S_UTQ = UTQ2.UTQ_KEY1
        WHERE
          SKUMASTER.SKU_ENABLE = 'Y'
          AND WARELOCATION.WL_CODE IN ('02', '04')
          AND SKUMASTER.SKU_CODE <> 'DC-001'
          AND ISNULL(ICDEPT.ICDEPT_CODE, '') <> 'NM'
          AND LTRIM(RTRIM(SKUMASTER.SKU_CODE)) IN (
            SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@parentCodes, ',')
          )
        GROUP BY
          SKUMASTER.SKU_CODE,
          SKUMASTER.SKU_NAME,
          ICDEPT.ICDEPT_CODE,
          ICCAT.ICCAT_CODE,
          ICCAT.ICCAT_NAME,
          WARELOCATION.WL_CODE,
          UTQ2.UTQ_NAME_1,
          UTQ2.UTQ_QTY_1,
          SKUMOVE.SKM_LOT_NO
      )
      SELECT
        PARENT_SKU_CODE,
        SKU_NAME,
        ICDEPT_CODE,
        ICCAT_CODE,
        ICCAT_NAME,
        WL_CODE,
        STOCK_UNIT_NAME,
        STOCK_PACK_SIZE,
        SKM_LOT_NO,
        FIFO_DATE,
        QTY
      FROM LotBase
      WHERE QTY > 0
      ORDER BY PARENT_SKU_CODE ASC, WL_CODE ASC, FIFO_DATE ASC, ISNULL(SKM_LOT_NO, '') ASC;
    `;

    const dedupeKey = buildSqlDedupeKey("raw-material-lots-by-parent", req);
    const rows = await dedupeSqlRequest(dedupeKey, async () => {
      const result = await requestSql.query(query);
      return result.recordset ?? [];
    });

    const payload = { data: rows };
    if (!shouldBypassCache(req)) {
      setCachedResponse(cacheKey, payload, LOT_CACHE_TTL_MS);
      res.set("X-Cache", "MISS");
    }
    return res.json(payload);
  } catch (error) {
    return res.status(500).json({ error: "SQL query failed", details: error.message });
  }
});

app.get("/api/trade-codes", async (req, res) => {
  try {
    const cacheKey = getCacheKey("trade-codes", req);
    if (!shouldBypassCache(req)) {
      const cached = getCachedResponse(cacheKey);
      if (cached) {
        res.set("X-Cache", "HIT");
        return res.json(cached);
      }
    }

    const search = req.query.search ? String(req.query.search).trim() : "";
    const brandCodes = normalizeListParam(req.query.brandCodes);
    const iccatCodes = normalizeListParam(req.query.iccatCodes);
    const goodsCodes = normalizeListParam(req.query.goodsCodes);
    const skuCodes = normalizeListParam(req.query.skuCodes);
    const page = parsePositiveInt(req.query.page, 1);
    const pageSize = parsePositiveInt(req.query.pageSize, 100, 500);
    const { cursor, error } = resolveCursor(res, page, req.query.cursor, parseTradeCodesCursor);
    if (error) {
      return;
    }
    const limit = pageSize + 1;

    const connection = await getErpPool();
    const requestSql = connection.request();
    requestSql.input("brandCodesParam", sql.NVarChar, brandCodes);
    requestSql.input("iccatCodesParam", sql.NVarChar, iccatCodes);
    requestSql.input("goodsCodesParam", sql.NVarChar, goodsCodes);
    requestSql.input("skuCodesParam", sql.NVarChar, skuCodes);
    requestSql.input("limitParam", sql.Int, limit);
    if (search) {
      requestSql.input("searchParam", sql.NVarChar, `%${search}%`);
    }
    if (cursor) {
      requestSql.input("cursorSkuCode", sql.NVarChar, cursor.skuCode);
      requestSql.input("cursorApCode", sql.NVarChar, cursor.apCode);
    }

    const searchFilter = search
      ? `AND (
          APFILE.AP_CODE LIKE @searchParam
          OR APFILE.AP_NAME LIKE @searchParam
          OR SKUMASTER.SKU_CODE LIKE @searchParam
          OR SKUMASTER.SKU_NAME LIKE @searchParam
          OR SKUMASTER.SKU_E_NAME LIKE @searchParam
          OR ICCAT.ICCAT_CODE LIKE @searchParam
          OR ICCAT.ICCAT_NAME LIKE @searchParam
          OR BRAND.BRN_CODE LIKE @searchParam
          OR BRAND.BRN_NAME LIKE @searchParam
          OR SKUALT.SKUALT_CODE LIKE @searchParam
          OR SKUALT.SKUALT_NAME LIKE @searchParam
          OR ICCOLOR.ICCOLOR_CODE LIKE @searchParam
          OR ICCOLOR.ICCOLOR_NAME LIKE @searchParam
          OR ICSIZE.ICSIZE_CODE LIKE @searchParam
          OR ICSIZE.ICSIZE_NAME LIKE @searchParam
          OR ICDEPT.ICDEPT_CODE LIKE @searchParam
          OR ICDEPT.ICDEPT_THAIDESC LIKE @searchParam
          OR ICPRT.ICPRT_CODE LIKE @searchParam
          OR ICPRT.ICPRT_NAME LIKE @searchParam
          OR ICGL.ICGL_CODE LIKE @searchParam
          OR ICGL.ICGL_NAME LIKE @searchParam
          OR WARELOCATION.WL_CODE LIKE @searchParam
          OR WARELOCATION.WL_NAME LIKE @searchParam
          OR UOFQTY.UTQ_NAME LIKE @searchParam
          OR UTQ1.UTQ_NAME_1 LIKE @searchParam
          OR UTQ2.UTQ_NAME_2 LIKE @searchParam
          OR GOODSMASTER.GOODS_CODE LIKE @searchParam
          OR GOODSMASTER.GOODS_ALIAS LIKE @searchParam
          OR GOODSMASTER.GOODS_E_ALIAS LIKE @searchParam
          OR PRICETAG.TAG_CODE LIKE @searchParam
          OR PRICETAG.TAG_NAME LIKE @searchParam
        )`
      : "";

    const goodsCodesFilter = goodsCodes
      ? "AND GOODSMASTER.GOODS_CODE IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@goodsCodes, ','))"
      : "";

    const skuCodesFilter = skuCodes
      ? "AND SKUMASTER.SKU_CODE IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@skuCodes, ','))"
      : "";

    const cursorFilter = cursor
      ? `AND (
          SKU_CODE > @cursorSkuCode
          OR (SKU_CODE = @cursorSkuCode AND AP_CODE > @cursorApCode)
        )`
      : "";

    const dataQuery = `
      DECLARE @brandCodes NVARCHAR(MAX) = @brandCodesParam;
      DECLARE @iccatCodes NVARCHAR(MAX) = @iccatCodesParam;
      DECLARE @goodsCodes NVARCHAR(MAX) = @goodsCodesParam;
      DECLARE @skuCodes NVARCHAR(MAX) = @skuCodesParam;
      DECLARE @limit INT = @limitParam;

      WITH Base AS (
        SELECT
          SKUMASTER.SKU_CODE,
          SKUMASTER.SKU_NAME,
          SKUMASTER.SKU_E_NAME,
          ICCAT.ICCAT_CODE,
          ICCAT.ICCAT_NAME,
          BRAND.BRN_CODE,
          BRAND.BRN_NAME,
          SKUALT.SKUALT_CODE,
          SKUALT.SKUALT_NAME,
          ICCOLOR.ICCOLOR_CODE,
          ICCOLOR.ICCOLOR_NAME,
          ICSIZE.ICSIZE_CODE,
          ICSIZE.ICSIZE_NAME,
          ICDEPT.ICDEPT_CODE,
          ICDEPT.ICDEPT_THAIDESC,
          ICPRT.ICPRT_CODE,
          ICPRT.ICPRT_NAME,
          ICGL.ICGL_CODE,
          ICGL.ICGL_NAME,
          WARELOCATION.WL_CODE,
          WARELOCATION.WL_NAME,
          UOFQTY.UTQ_NAME,
          UOFQTY.UTQ_QTY,
          UTQ1.UTQ_NAME_1,
          UTQ1.UTQ_QTY_1,
          SKUMASTER.SKU_STOCK,
          SKUMASTER.SKU_COST_TY,
          SKUMASTER.SKU_STD_COST,
          SKUMASTER.SKU_LAST_UCCOST,
          SKUMASTER.SKU_ENABLE,
          SKUMASTER.SKU_VAT_TY,
          SKUMASTER.SKU_P_ENABLE,
          SKUMASTER.SKU_VAT,
          SKUMASTER.SKU_WH_TY,
          SKUMASTER.SKU_WH_RATE,
          SKUMASTER.SKU_MSG_1,
          SKUMASTER.SKU_MSG_2,
          SKUMASTER.SKU_MSG_3,
          GOODSMASTER.GOODS_CODE,
          GOODSMASTER.GOODS_BARTYPE,
          GOODSMASTER.GOODS_ALIAS,
          GOODSMASTER.GOODS_E_ALIAS,
          UTQ2.UTQ_NAME_2,
          UTQ2.UTQ_QTY_2,
          GOODSMASTER.GOODS_WEIGHT,
          GOODSMASTER.GOODS_VOLUME,
          GOODSMASTER.GOODS_PRICE,
          ARPLU.ARPLU_U_PRC,
          PR.APPLU_U_PRC2,
          ARPRICETAB.ARPRB_CODE,
          ARPRICETAB.ARPRB_NAME,
          PRICETAG.TAG_CODE,
          PRICETAG.TAG_NAME,
          APFILE.AP_CODE,
          APFILE.AP_NAME
        FROM SKUMASTER
        JOIN GOODSMASTER ON GOODSMASTER.GOODS_SKU = SKUMASTER.SKU_KEY
        JOIN ICCAT ON SKUMASTER.SKU_ICCAT = ICCAT.ICCAT_KEY
        JOIN BRAND ON SKUMASTER.SKU_BRN = BRAND.BRN_KEY
        JOIN SKUALT ON SKUMASTER.SKU_SKUALT = SKUALT.SKUALT_KEY
        JOIN ICCOLOR ON SKUMASTER.SKU_ICCOLOR = ICCOLOR.ICCOLOR_KEY
        JOIN ICSIZE ON SKUMASTER.SKU_ICSIZE = ICSIZE.ICSIZE_KEY
        JOIN ICDEPT ON SKUMASTER.SKU_ICDEPT = ICDEPT.ICDEPT_KEY
        JOIN ICPRT ON SKUMASTER.SKU_ICPRT = ICPRT.ICPRT_KEY
        JOIN ICGL ON SKUMASTER.SKU_ICGL = ICGL.ICGL_KEY
        JOIN WARELOCATION ON SKUMASTER.SKU_WL = WARELOCATION.WL_KEY
        JOIN WAREHOUSE ON WARELOCATION.WL_WH = WAREHOUSE.WH_KEY
        JOIN UOFQTY ON SKUMASTER.SKU_K_UTQ = UOFQTY.UTQ_KEY
        LEFT JOIN ARPLU ON ARPLU.ARPLU_GOODS = GOODSMASTER.GOODS_KEY
        LEFT JOIN PRICETAG ON ARPLU.ARPLU_TAG = PRICETAG.TAG_KEY
        LEFT JOIN ARPRICETAB ON ARPLU.ARPLU_ARPRB = ARPRICETAB.ARPRB_KEY
        JOIN SKUAP ON SKUAP.SKP_SKU = SKUMASTER.SKU_KEY
        JOIN APFILE ON SKUAP.SKP_AP = APFILE.AP_KEY
        JOIN APCAT ON APFILE.AP_APCAT = APCAT.APCAT_KEY
        JOIN (
          SELECT
            UOFQTY1.UTQ_KEY AS UTQ_KEY1,
            UOFQTY1.UTQ_NAME AS UTQ_NAME_1,
            UOFQTY1.UTQ_QTY AS UTQ_QTY_1
          FROM UOFQTY UOFQTY1
        ) UTQ1 ON SKUMASTER.SKU_S_UTQ = UTQ1.UTQ_KEY1
        JOIN (
          SELECT
            UOFQTY2.UTQ_KEY AS UTQ_KEY2,
            UOFQTY2.UTQ_NAME AS UTQ_NAME_2,
            UOFQTY2.UTQ_QTY AS UTQ_QTY_2
          FROM UOFQTY UOFQTY2
        ) UTQ2 ON GOODSMASTER.GOODS_UTQ = UTQ2.UTQ_KEY2
        LEFT JOIN (
          SELECT
            SKUMASTER.SKU_CODE AS SKU_CODE2,
            ARPLU.ARPLU_U_PRC AS APPLU_U_PRC2
          FROM SKUMASTER
          JOIN GOODSMASTER ON GOODSMASTER.GOODS_SKU = SKUMASTER.SKU_KEY
          JOIN ARPLU ON ARPLU.ARPLU_GOODS = GOODSMASTER.GOODS_KEY
          WHERE GOODS_CODE = SKU_CODE
        ) PR ON SKUMASTER.SKU_CODE = PR.SKU_CODE2
        WHERE
          SKUMASTER.SKU_CODE IS NOT NULL
          AND SKUAP.SKP_DEFAULT = 'Y'
          AND (@brandCodes IS NULL OR BRAND.BRN_CODE IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@brandCodes, ',')))
          AND (@iccatCodes IS NULL OR ICCAT.ICCAT_CODE IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@iccatCodes, ',')))
          ${goodsCodesFilter}
          ${skuCodesFilter}
          AND ICCAT.ICCAT_CODE IN ('01','02','03','04','04-1','04-2','05','08','10')
          ${searchFilter}
      )
      SELECT TOP (@limit)
        GOODS_CODE,
        SKU_CODE,
        SKU_NAME,
        SKU_E_NAME,
        ICCAT_CODE,
        ICCAT_NAME,
        BRN_CODE,
        BRN_NAME,
        SKUALT_CODE,
        SKUALT_NAME,
        ICCOLOR_CODE,
        ICCOLOR_NAME,
        ICSIZE_CODE,
        ICSIZE_NAME,
        ICDEPT_CODE,
        ICDEPT_THAIDESC,
        ICPRT_CODE,
        ICPRT_NAME,
        ICGL_CODE,
        ICGL_NAME,
        WL_CODE,
        WL_NAME,
        UTQ_NAME,
        UTQ_QTY,
        UTQ_NAME_1,
        UTQ_QTY_1,
        SKU_STOCK,
        SKU_COST_TY,
        SKU_STD_COST,
        SKU_LAST_UCCOST,
        SKU_ENABLE,
        SKU_VAT_TY,
        SKU_P_ENABLE,
        SKU_VAT,
        SKU_WH_TY,
        SKU_WH_RATE,
        SKU_MSG_1,
        SKU_MSG_2,
        SKU_MSG_3,
        GOODS_BARTYPE,
        GOODS_ALIAS,
        GOODS_E_ALIAS,
        UTQ_NAME_2,
        UTQ_QTY_2,
        GOODS_WEIGHT,
        GOODS_VOLUME,
        GOODS_PRICE,
        ARPLU_U_PRC,
        APPLU_U_PRC2,
        ARPRB_CODE,
        ARPRB_NAME,
        TAG_CODE,
        TAG_NAME,
        AP_CODE,
        AP_NAME
      FROM Base
      WHERE 1=1
        ${cursorFilter}
      ORDER BY SKU_CODE ASC, AP_CODE ASC;
    `;

    const countRequest = connection.request();
    countRequest.input("brandCodesParam", sql.NVarChar, brandCodes);
    countRequest.input("iccatCodesParam", sql.NVarChar, iccatCodes);
    countRequest.input("goodsCodesParam", sql.NVarChar, goodsCodes);
    countRequest.input("skuCodesParam", sql.NVarChar, skuCodes);
    if (search) {
      countRequest.input("searchParam", sql.NVarChar, `%${search}%`);
    }

    const countQuery = `
      DECLARE @brandCodes NVARCHAR(MAX) = @brandCodesParam;
      DECLARE @iccatCodes NVARCHAR(MAX) = @iccatCodesParam;
      DECLARE @goodsCodes NVARCHAR(MAX) = @goodsCodesParam;
      DECLARE @skuCodes NVARCHAR(MAX) = @skuCodesParam;
      WITH Base AS (
        SELECT
          SKUMASTER.SKU_CODE,
          APFILE.AP_CODE
        FROM SKUMASTER
        JOIN GOODSMASTER ON GOODSMASTER.GOODS_SKU = SKUMASTER.SKU_KEY
        JOIN ICCAT ON SKUMASTER.SKU_ICCAT = ICCAT.ICCAT_KEY
        JOIN BRAND ON SKUMASTER.SKU_BRN = BRAND.BRN_KEY
        JOIN SKUALT ON SKUMASTER.SKU_SKUALT = SKUALT.SKUALT_KEY
        JOIN ICCOLOR ON SKUMASTER.SKU_ICCOLOR = ICCOLOR.ICCOLOR_KEY
        JOIN ICSIZE ON SKUMASTER.SKU_ICSIZE = ICSIZE.ICSIZE_KEY
        JOIN ICDEPT ON SKUMASTER.SKU_ICDEPT = ICDEPT.ICDEPT_KEY
        JOIN ICPRT ON SKUMASTER.SKU_ICPRT = ICPRT.ICPRT_KEY
        JOIN ICGL ON SKUMASTER.SKU_ICGL = ICGL.ICGL_KEY
        JOIN WARELOCATION ON SKUMASTER.SKU_WL = WARELOCATION.WL_KEY
        JOIN WAREHOUSE ON WARELOCATION.WL_WH = WAREHOUSE.WH_KEY
        JOIN UOFQTY ON SKUMASTER.SKU_K_UTQ = UOFQTY.UTQ_KEY
        LEFT JOIN ARPLU ON ARPLU.ARPLU_GOODS = GOODSMASTER.GOODS_KEY
        LEFT JOIN PRICETAG ON ARPLU.ARPLU_TAG = PRICETAG.TAG_KEY
        LEFT JOIN ARPRICETAB ON ARPLU.ARPLU_ARPRB = ARPRICETAB.ARPRB_KEY
        JOIN SKUAP ON SKUAP.SKP_SKU = SKUMASTER.SKU_KEY
        JOIN APFILE ON SKUAP.SKP_AP = APFILE.AP_KEY
        JOIN APCAT ON APFILE.AP_APCAT = APCAT.APCAT_KEY
        JOIN (
          SELECT
            UOFQTY1.UTQ_KEY AS UTQ_KEY1,
            UOFQTY1.UTQ_NAME AS UTQ_NAME_1,
            UOFQTY1.UTQ_QTY AS UTQ_QTY_1
          FROM UOFQTY UOFQTY1
        ) UTQ1 ON SKUMASTER.SKU_S_UTQ = UTQ1.UTQ_KEY1
        JOIN (
          SELECT
            UOFQTY2.UTQ_KEY AS UTQ_KEY2,
            UOFQTY2.UTQ_NAME AS UTQ_NAME_2,
            UOFQTY2.UTQ_QTY AS UTQ_QTY_2
          FROM UOFQTY UOFQTY2
        ) UTQ2 ON GOODSMASTER.GOODS_UTQ = UTQ2.UTQ_KEY2
        LEFT JOIN (
          SELECT
            SKUMASTER.SKU_CODE AS SKU_CODE2,
            ARPLU.ARPLU_U_PRC AS APPLU_U_PRC2
          FROM SKUMASTER
          JOIN GOODSMASTER ON GOODSMASTER.GOODS_SKU = SKUMASTER.SKU_KEY
          JOIN ARPLU ON ARPLU.ARPLU_GOODS = GOODSMASTER.GOODS_KEY
          WHERE GOODS_CODE = SKU_CODE
        ) PR ON SKUMASTER.SKU_CODE = PR.SKU_CODE2
        WHERE
          SKUMASTER.SKU_CODE IS NOT NULL
          AND SKUAP.SKP_DEFAULT = 'Y'
          AND (@brandCodes IS NULL OR BRAND.BRN_CODE IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@brandCodes, ',')))
          AND (@iccatCodes IS NULL OR ICCAT.ICCAT_CODE IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@iccatCodes, ',')))
          ${goodsCodesFilter}
          ${skuCodesFilter}
          AND ICCAT.ICCAT_CODE IN ('01','02','03','04','04-1','04-2','05','08','10')
          ${searchFilter}
      )
      SELECT COUNT(1) AS totalRows
      FROM Base;
    `;

    const dedupeKey = buildSqlDedupeKey("trade-codes", req);
    const { rows, totalRecords, hasMore, nextCursor } = await dedupeSqlRequest(
      dedupeKey,
      async () => {
        const [dataResult, countResult] = await Promise.all([
          requestSql.query(dataQuery),
          countRequest.query(countQuery),
        ]);

        const total = countResult.recordset[0]?.totalRows || 0;
        let dataRows = dataResult.recordset ?? [];
        let more = false;
        if (dataRows.length > pageSize) {
          more = true;
          dataRows = dataRows.slice(0, pageSize);
        }
        const lastRow = dataRows[dataRows.length - 1];
        const cursorValue = lastRow
          ? encodeCursor({
              skuCode: lastRow.SKU_CODE,
              apCode: lastRow.AP_CODE,
            })
          : null;

        return {
          rows: dataRows,
          totalRecords: total,
          hasMore: more,
          nextCursor: cursorValue,
        };
      }
    );

    const payload = {
      data: rows,
      pagination: {
        page,
        pageSize,
        totalRecords,
        totalPages: Math.max(1, Math.ceil(totalRecords / pageSize)),
      },
      cursor: {
        next: nextCursor,
        hasMore,
      },
    };

    if (!shouldBypassCache(req)) {
      setCachedResponse(cacheKey, payload);
      res.set("X-Cache", "MISS");
    }

    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: "SQL query failed", details: error.message });
  }
});

app.get("/api/sku-min-max", async (req, res) => {
  try {
    const page = parseInt(req.query.page || "1", 10);
    const pageSize = parseInt(req.query.pageSize || "100", 10);
    const { cursor, error } = resolveCursor(res, page, req.query.cursor, parseSkuCursor);
    if (error) {
      return;
    }
    const limit = pageSize + 1;
    const iccatSearch = req.query.iccat ? String(req.query.iccat) : "";

    const connection = await getErpPool();
    const requestSql = connection.request();
    requestSql.input("limitParam", sql.Int, limit);
    if (iccatSearch) {
      requestSql.input("iccatSearch", sql.NVarChar, `%${iccatSearch}%`);
    }
    if (cursor) {
      requestSql.input("cursorSkuCode", sql.NVarChar, cursor.skuCode);
    }

    const iccatFilter = `
      AND ICCAT.ICCAT_CODE IN ('01','02','03','05','08','10')
      ${iccatSearch ? "AND (ICCAT.ICCAT_CODE LIKE @iccatSearch OR ICCAT.ICCAT_NAME LIKE @iccatSearch)" : ""}
    `;

    const cursorFilter = cursor ? "AND SKU_CODE > @cursorSkuCode" : "";

    const dataQuery = `
      WITH Base AS (
        SELECT
          SKUMASTER.SKU_CODE,
          SKUMASTER.SKU_NAME,
          SKUMASTER.SKU_LEAD_TIME,
          SKUMASTER.SKU_MIN_QTY,
          SKUMASTER.SKU_MAX_QTY,
          SKUMASTER.SKU_MIN_ORDER,
          ICCAT.ICCAT_CODE,
          ICCAT.ICCAT_NAME,
          UOFQTY.UTQ_NAME,
          UOFQTY.UTQ_QTY,
          UTQ2.UTQ_NAME_1,
          UTQ2.UTQ_QTY_1
        FROM SKUMASTER
        JOIN ICCAT ON SKUMASTER.SKU_ICCAT = ICCAT.ICCAT_KEY
        JOIN BRAND ON SKUMASTER.SKU_BRN = BRAND.BRN_KEY
        JOIN SKUALT ON SKUMASTER.SKU_SKUALT = SKUALT.SKUALT_KEY
        JOIN ICCOLOR ON SKUMASTER.SKU_ICCOLOR = ICCOLOR.ICCOLOR_KEY
        JOIN ICSIZE ON SKUMASTER.SKU_ICSIZE = ICSIZE.ICSIZE_KEY
        JOIN ICDEPT ON SKUMASTER.SKU_ICDEPT = ICDEPT.ICDEPT_KEY
        JOIN ICPRT ON SKUMASTER.SKU_ICPRT = ICPRT.ICPRT_KEY
        JOIN ICGL ON SKUMASTER.SKU_ICGL = ICGL.ICGL_KEY
        JOIN WARELOCATION ON SKUMASTER.SKU_WL = WARELOCATION.WL_KEY
        JOIN WAREHOUSE ON WARELOCATION.WL_WH = WAREHOUSE.WH_KEY
        JOIN SKUAP ON SKUMASTER.SKU_KEY = SKUAP.SKP_SKU
        JOIN APFILE ON APFILE.AP_KEY = SKUAP.SKP_AP
        LEFT JOIN PURCQUOTATION ON PURCQUOTATION.PURCQ_SKP = SKUAP.SKP_KEY
        JOIN UOFQTY ON SKUMASTER.SKU_K_UTQ = UOFQTY.UTQ_KEY
        JOIN (
          SELECT
            UOFQTY1.UTQ_KEY AS UTQ_KEY1,
            UOFQTY1.UTQ_NAME AS UTQ_NAME_1,
            UOFQTY1.UTQ_QTY AS UTQ_QTY_1
          FROM UOFQTY UOFQTY1
        ) UTQ2 ON SKUMASTER.SKU_S_UTQ = UTQ2.UTQ_KEY1
        WHERE
          SKUMASTER.SKU_ENABLE = 'Y'
          AND SKUMASTER.SKU_PRICE = 1
          AND SKUAP.SKP_DEFAULT = 'Y'
          ${iccatFilter}
      )
      SELECT TOP (@limitParam)
        SKU_CODE,
        SKU_NAME,
        SKU_LEAD_TIME,
        SKU_MIN_QTY,
        SKU_MAX_QTY,
        SKU_MIN_ORDER,
        ICCAT_CODE,
        ICCAT_NAME,
        UTQ_NAME,
        UTQ_QTY,
        UTQ_NAME_1,
        UTQ_QTY_1
      FROM Base
      WHERE 1=1
        ${cursorFilter}
      ORDER BY SKU_CODE ASC;
    `;

    const countRequest = connection.request();
    if (iccatSearch) {
      countRequest.input("iccatSearch", sql.NVarChar, `%${iccatSearch}%`);
    }

    const countQuery = `
      SELECT COUNT(1) AS totalRows
      FROM (
        SELECT
          SKUMASTER.SKU_CODE
        FROM SKUMASTER
        JOIN ICCAT ON SKUMASTER.SKU_ICCAT = ICCAT.ICCAT_KEY
        JOIN BRAND ON SKUMASTER.SKU_BRN = BRAND.BRN_KEY
        JOIN SKUALT ON SKUMASTER.SKU_SKUALT = SKUALT.SKUALT_KEY
        JOIN ICCOLOR ON SKUMASTER.SKU_ICCOLOR = ICCOLOR.ICCOLOR_KEY
        JOIN ICSIZE ON SKUMASTER.SKU_ICSIZE = ICSIZE.ICSIZE_KEY
        JOIN ICDEPT ON SKUMASTER.SKU_ICDEPT = ICDEPT.ICDEPT_KEY
        JOIN ICPRT ON SKUMASTER.SKU_ICPRT = ICPRT.ICPRT_KEY
        JOIN ICGL ON SKUMASTER.SKU_ICGL = ICGL.ICGL_KEY
        JOIN WARELOCATION ON SKUMASTER.SKU_WL = WARELOCATION.WL_KEY
        JOIN WAREHOUSE ON WARELOCATION.WL_WH = WAREHOUSE.WH_KEY
        JOIN SKUAP ON SKUMASTER.SKU_KEY = SKUAP.SKP_SKU
        JOIN APFILE ON APFILE.AP_KEY = SKUAP.SKP_AP
        LEFT JOIN PURCQUOTATION ON PURCQUOTATION.PURCQ_SKP = SKUAP.SKP_KEY
        JOIN UOFQTY ON SKUMASTER.SKU_K_UTQ = UOFQTY.UTQ_KEY
        JOIN (
          SELECT
            UOFQTY1.UTQ_KEY AS UTQ_KEY1,
            UOFQTY1.UTQ_NAME AS UTQ_NAME_1,
            UOFQTY1.UTQ_QTY AS UTQ_QTY_1
          FROM UOFQTY UOFQTY1
        ) UTQ2 ON SKUMASTER.SKU_S_UTQ = UTQ2.UTQ_KEY1
        WHERE
          SKUMASTER.SKU_ENABLE = 'Y'
          AND SKUMASTER.SKU_PRICE = 1
          AND SKUAP.SKP_DEFAULT = 'Y'
          ${iccatFilter}
      ) AS counted;
    `;

    const dedupeKey = buildSqlDedupeKey("sku-min-max", req);
    const { rows, totalRecords, hasMore, nextCursor } = await dedupeSqlRequest(
      dedupeKey,
      async () => {
        const [dataResult, countResult] = await Promise.all([
          requestSql.query(dataQuery),
          countRequest.query(countQuery),
        ]);

        const total = countResult.recordset[0]?.totalRows || 0;
        let dataRows = dataResult.recordset ?? [];
        let more = false;
        if (dataRows.length > pageSize) {
          more = true;
          dataRows = dataRows.slice(0, pageSize);
        }
        const lastRow = dataRows[dataRows.length - 1];
        const cursorValue = lastRow ? encodeCursor({ skuCode: lastRow.SKU_CODE }) : null;

        return {
          rows: dataRows,
          totalRecords: total,
          hasMore: more,
          nextCursor: cursorValue,
        };
      }
    );

    res.json({
      data: rows,
      pagination: {
        page,
        pageSize,
        totalRecords,
        totalPages: Math.max(1, Math.ceil(totalRecords / pageSize)),
      },
      cursor: {
        next: nextCursor,
        hasMore,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "SQL query failed", details: error.message });
  }
});

app.get("/api/sku-min-max-by-sku", async (req, res) => {
  try {
    const skusParam = req.query.skus ? String(req.query.skus) : "";
    if (!skusParam.trim()) {
      return res.json({ data: [] });
    }

    const connection = await getErpPool();
    const requestSql = connection.request();
    requestSql.input("skuList", sql.NVarChar, skusParam);

    const query = `
      SELECT
        LTRIM(RTRIM(SKUMASTER.SKU_CODE)) AS SKU_CODE,
        SKUMASTER.SKU_LEAD_TIME,
        SKUMASTER.SKU_MIN_QTY,
        SKUMASTER.SKU_MAX_QTY,
        SKUMASTER.SKU_MIN_ORDER
      FROM SKUMASTER
      WHERE
        SKUMASTER.SKU_ENABLE = 'Y'
        AND LTRIM(RTRIM(SKUMASTER.SKU_CODE)) IN (
          SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@skuList, ',')
        )
      ORDER BY SKUMASTER.SKU_CODE ASC;
    `;

    const dedupeKey = buildSqlDedupeKey("sku-min-max-by-sku", req);
    const rows = await dedupeSqlRequest(dedupeKey, async () => {
      const result = await requestSql.query(query);
      return result.recordset ?? [];
    });
    res.json({ data: rows });
  } catch (error) {
    res.status(500).json({ error: "SQL query failed", details: error.message });
  }
});

app.get("/api/open-po-eta-by-sku", requireAuth, async (req, res) => {
  try {
    const skusParam = req.query.skus ? String(req.query.skus) : "";
    if (!skusParam.trim()) {
      return res.json({ data: [] });
    }

    const dateFrom = normalizeListParam(req.query.dateFrom);
    const dateTo = normalizeListParam(req.query.dateTo);
    const cacheKey = getCacheKey("open-po-eta-by-sku", req);
    if (!shouldBypassCache(req)) {
      const cached = getCachedResponse(cacheKey);
      if (cached) {
        res.set("X-Cache", "HIT");
        return res.json(cached);
      }
    }

    const connection = await getErpPool();
    const requestSql = connection.request();
    requestSql.input("skuList", sql.NVarChar, skusParam);
    requestSql.input("dateFromParam", sql.Date, dateFrom);
    requestSql.input("dateToParam", sql.Date, dateTo);

    const query = `
      DECLARE @dateFrom DATE = @dateFromParam;
      DECLARE @dateTo DATE = @dateToParam;

      WITH OpenPo AS (
        SELECT
          LTRIM(RTRIM(SKUMASTER.SKU_CODE)) AS SKU_CODE,
          CAST(COALESCE(APPO.APPO_DUE_DA, TRANSTKH.TRH_SHIP_DATE, DOCINFO.DI_DATE) AS DATE) AS ETA_DATE,
          SUM(
            (
              ISNULL(TRANSTKD.TRD_QTY, 0) + ISNULL(TRANSTKD.TRD_Q_FREE, 0)
            ) * ISNULL(NULLIF(TRANSTKD.TRD_UTQQTY, 0), 1)
          ) AS OPEN_QTY
        FROM TRANSTKH
        JOIN DOCINFO ON TRANSTKH.TRH_DI = DOCINFO.DI_KEY
        JOIN DOCTYPE ON DOCINFO.DI_DT = DOCTYPE.DT_KEY
        JOIN APPO ON APPO.APPO_DI = TRANSTKH.TRH_DI
        JOIN TRANSTKD ON TRANSTKD.TRD_TRH = TRANSTKH.TRH_KEY
        JOIN SKUMASTER ON TRANSTKD.TRD_SKU = SKUMASTER.SKU_KEY
        WHERE
          DOCTYPE.DT_PROPERTIES = 203
          AND DOCINFO.DI_ACTIVE = 0
          AND (TRANSTKH.TRH_CANCEL_DATE IS NULL)
          AND LTRIM(RTRIM(SKUMASTER.SKU_CODE)) IN (
            SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@skuList, ',')
          )
          AND (
            @dateFrom IS NULL
            OR COALESCE(APPO.APPO_DUE_DA, TRANSTKH.TRH_SHIP_DATE, DOCINFO.DI_DATE) >= @dateFrom
          )
          AND (
            @dateTo IS NULL
            OR COALESCE(APPO.APPO_DUE_DA, TRANSTKH.TRH_SHIP_DATE, DOCINFO.DI_DATE) <= @dateTo
          )
        GROUP BY
          LTRIM(RTRIM(SKUMASTER.SKU_CODE)),
          CAST(COALESCE(APPO.APPO_DUE_DA, TRANSTKH.TRH_SHIP_DATE, DOCINFO.DI_DATE) AS DATE)
      )
        SELECT
          GOODS_CODE,
          SKU_CODE,
        ETA_DATE,
        OPEN_QTY
      FROM OpenPo
      WHERE OPEN_QTY > 0
      ORDER BY SKU_CODE ASC, ETA_DATE ASC;
    `;

    const dedupeKey = buildSqlDedupeKey("open-po-eta-by-sku", req);
    const rows = await dedupeSqlRequest(dedupeKey, async () => {
      const result = await requestSql.query(query);
      return result.recordset ?? [];
    });

    const payload = { data: rows };
    if (!shouldBypassCache(req)) {
      setCachedResponse(cacheKey, payload);
      res.set("X-Cache", "MISS");
    }
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: "SQL query failed", details: error.message });
  }
});

app.get("/api/suppliers", async (req, res) => {
  try {
    const page = parseInt(req.query.page || "1", 10);
    const pageSize = parseInt(req.query.pageSize || "100", 10);
    const { cursor, error } = resolveCursor(res, page, req.query.cursor, parseDocumentCursor);
    if (error) {
      return;
    }
    const limit = pageSize + 1;
    const search = req.query.search ? String(req.query.search).trim() : "";

    const connection = await getErpPool();
    const requestSql = connection.request();
    requestSql.input("limitParam", sql.Int, limit);
    if (search) {
      requestSql.input("searchParam", sql.NVarChar, `%${search}%`);
    }
    if (cursor) {
      requestSql.input("cursorDate", sql.Date, cursor.date);
      requestSql.input("cursorRef", sql.NVarChar, cursor.ref);
      requestSql.input("cursorSeq", sql.Int, cursor.seq);
    }

    const cursorFilter = cursor
      ? `AND (
          DI_DATE < @cursorDate
          OR (DI_DATE = @cursorDate AND DI_REF > @cursorRef)
          OR (DI_DATE = @cursorDate AND DI_REF = @cursorRef AND TRD_SEQ > @cursorSeq)
        )`
      : "";

const dataQuery = `
      WITH Base AS (
        SELECT
          DOCINFO.DI_DATE,
          DOCINFO.DI_ACTIVE,
          DOCINFO.DI_REF,
          APFILE.AP_CODE,
          APFILE.AP_NAME,
          BRANCH.BR_CODE,
          DEPTTAB.DEPT_CODE,
          PRJTAB.PRJ_CODE,
          PRJTAB.PRJ_NAME,
          MKTPLAN.MKTP_CODE,
          PRMTPLAN.PRMT_CODE,
          APPO.APPO_DUE_DA,
          TRANSTKH.TRH_SHIP_DATE,
          TRANSTKH.TRH_CANCEL_DATE,
          TRANSTKH.TRH_N_QTY,
          TRANSTKH.TRH_N_ITEMS,
          APPO.APPO_B_VAT,
          APPO.APPO_B_AMT,
          TRANSTKH.TRH_PSTATUS,
          DOCINFO.DI_ACTIVE AS DI_ACTIVE_2,
          TRANSTKD.TRD_UTQNAME,
          TRANSTKD.TRD_QTY,
          TRANSTKD.TRD_Q_FREE,
          TRANSTKD.TRD_U_PRC,
          TRANSTKD.TRD_G_KEYIN,
          GOODSMASTER.GOODS_CODE,
          TRANSTKD.TRD_SH_NAME,
          SKUMASTER.SKU_CODE,
          SKUMASTER.SKU_NAME,
          TRANSTKD.TRD_UTQQTY,
          TRANSTKD.TRD_SEQ,
          UOFQTY.UTQ_NAME,
          UOFQTY.UTQ_QTY,
          TRANSTKD.TRD_B_SELL,
          TRANSTKD.TRD_B_VAT,
          TRANSTKD.TRD_B_AMT,
          ICCAT.ICCAT_CODE,
          ICCAT.ICCAT_NAME
        FROM TRANSTKH
        JOIN PRJTAB ON TRANSTKH.TRH_PRJ = PRJTAB.PRJ_KEY
        JOIN DEPTTAB ON TRANSTKH.TRH_DEPT = DEPTTAB.DEPT_KEY
        JOIN BRANCH ON TRANSTKH.TRH_BR = BRANCH.BR_KEY
        JOIN DOCINFO ON TRANSTKH.TRH_DI = DOCINFO.DI_KEY
        JOIN MKTPLAN ON TRANSTKH.TRH_MKTP = MKTPLAN.MKTP_KEY
        JOIN PRMTPLAN ON TRANSTKH.TRH_PRMT = PRMTPLAN.PRMT_KEY
        JOIN SHIPBY ON TRANSTKH.TRH_SB = SHIPBY.SB_KEY
        JOIN DOCTYPE ON DOCINFO.DI_DT = DOCTYPE.DT_KEY
        JOIN APPO ON APPO.APPO_DI = TRANSTKH.TRH_DI
        JOIN APFILE ON APPO.APPO_AP = APFILE.AP_KEY
        JOIN APCAT ON APFILE.AP_APCAT = APCAT.APCAT_KEY
        JOIN TRANSTKD ON TRANSTKD.TRD_TRH = TRANSTKH.TRH_KEY
        JOIN SKUMASTER ON TRANSTKD.TRD_SKU = SKUMASTER.SKU_KEY
        JOIN GOODSMASTER ON TRANSTKD.TRD_GOODS = GOODSMASTER.GOODS_KEY
        JOIN WARELOCATION ON TRANSTKD.TRD_WL = WARELOCATION.WL_KEY
        JOIN WAREHOUSE ON WARELOCATION.WL_WH = WAREHOUSE.WH_KEY
        JOIN SKUALT ON SKUMASTER.SKU_SKUALT = SKUALT.SKUALT_KEY
        JOIN ICDEPT ON SKUMASTER.SKU_ICDEPT = ICDEPT.ICDEPT_KEY
        JOIN ICCAT ON SKUMASTER.SKU_ICCAT = ICCAT.ICCAT_KEY
        JOIN BRAND ON SKUMASTER.SKU_BRN = BRAND.BRN_KEY
        JOIN ICCOLOR ON SKUMASTER.SKU_ICCOLOR = ICCOLOR.ICCOLOR_KEY
        JOIN ICSIZE ON SKUMASTER.SKU_ICSIZE = ICSIZE.ICSIZE_KEY
        JOIN UOFQTY ON SKUMASTER.SKU_S_UTQ = UOFQTY.UTQ_KEY
        WHERE
          DOCTYPE.DT_PROPERTIES = 203
          AND DOCINFO.DI_ACTIVE = 0
          AND ICCAT.ICCAT_CODE IN ('01','02','03','05','08','10')
      )
      SELECT TOP (@limitParam)
        DI_DATE,
        DI_ACTIVE,
        DI_REF,
        AP_CODE,
        AP_NAME,
        BR_CODE,
        DEPT_CODE,
        PRJ_CODE,
        PRJ_NAME,
        MKTP_CODE,
        PRMT_CODE,
        APPO_DUE_DA,
        TRH_SHIP_DATE,
        TRH_CANCEL_DATE,
        TRH_N_QTY,
        TRH_N_ITEMS,
        APPO_B_VAT,
        APPO_B_AMT,
        TRH_PSTATUS,
        DI_ACTIVE_2,
        TRD_UTQNAME,
        TRD_QTY,
        TRD_Q_FREE,
        TRD_U_PRC,
        TRD_G_KEYIN,
        GOODS_CODE,
        TRD_SH_NAME,
        SKU_CODE,
        SKU_NAME,
        TRD_UTQQTY,
        TRD_SEQ,
        UTQ_NAME,
        UTQ_QTY,
        TRD_B_SELL,
        TRD_B_VAT,
        TRD_B_AMT,
        ICCAT_CODE,
        ICCAT_NAME
      FROM Base
      WHERE 1=1
        ${search ? `        AND (SKU_CODE LIKE @searchParam OR SKU_NAME LIKE @searchParam)` : ""}
        ${cursorFilter}
      ORDER BY DI_DATE DESC, DI_REF ASC, TRD_SEQ ASC;
    `;

    const countQuery = `
      SELECT COUNT(1) AS totalRows
      FROM TRANSTKH
      JOIN PRJTAB ON TRANSTKH.TRH_PRJ = PRJTAB.PRJ_KEY
      JOIN DEPTTAB ON TRANSTKH.TRH_DEPT = DEPTTAB.DEPT_KEY
      JOIN BRANCH ON TRANSTKH.TRH_BR = BRANCH.BR_KEY
      JOIN DOCINFO ON TRANSTKH.TRH_DI = DOCINFO.DI_KEY
      JOIN MKTPLAN ON TRANSTKH.TRH_MKTP = MKTPLAN.MKTP_KEY
      JOIN PRMTPLAN ON TRANSTKH.TRH_PRMT = PRMTPLAN.PRMT_KEY
      JOIN SHIPBY ON TRANSTKH.TRH_SB = SHIPBY.SB_KEY
      JOIN DOCTYPE ON DOCINFO.DI_DT = DOCTYPE.DT_KEY
      JOIN APPO ON APPO.APPO_DI = TRANSTKH.TRH_DI
      JOIN APFILE ON APPO.APPO_AP = APFILE.AP_KEY
      JOIN APCAT ON APFILE.AP_APCAT = APCAT.APCAT_KEY
      JOIN TRANSTKD ON TRANSTKD.TRD_TRH = TRANSTKH.TRH_KEY
      JOIN SKUMASTER ON TRANSTKD.TRD_SKU = SKUMASTER.SKU_KEY
      JOIN GOODSMASTER ON TRANSTKD.TRD_GOODS = GOODSMASTER.GOODS_KEY
      JOIN WARELOCATION ON TRANSTKD.TRD_WL = WARELOCATION.WL_KEY
      JOIN WAREHOUSE ON WARELOCATION.WL_WH = WAREHOUSE.WH_KEY
      JOIN SKUALT ON SKUMASTER.SKU_SKUALT = SKUALT.SKUALT_KEY
      JOIN ICDEPT ON SKUMASTER.SKU_ICDEPT = ICDEPT.ICDEPT_KEY
      JOIN ICCAT ON SKUMASTER.SKU_ICCAT = ICCAT.ICCAT_KEY
      JOIN BRAND ON SKUMASTER.SKU_BRN = BRAND.BRN_KEY
      JOIN ICCOLOR ON SKUMASTER.SKU_ICCOLOR = ICCOLOR.ICCOLOR_KEY
      JOIN ICSIZE ON SKUMASTER.SKU_ICSIZE = ICSIZE.ICSIZE_KEY
      JOIN UOFQTY ON SKUMASTER.SKU_S_UTQ = UOFQTY.UTQ_KEY
      WHERE
        DOCTYPE.DT_PROPERTIES = 203
        AND DOCINFO.DI_ACTIVE = 0
        ${search ? "        AND (SKU_CODE LIKE @searchParam OR SKU_NAME LIKE @searchParam)" : ""}
      ;
    `;

    const dedupeKey = buildSqlDedupeKey("suppliers", req);
    const { rows, totalRecords, hasMore, nextCursor } = await dedupeSqlRequest(
      dedupeKey,
      async () => {
        const [dataResult, countResult] = await Promise.all([
          requestSql.query(dataQuery),
          requestSql.query(countQuery),
        ]);

        const total = countResult.recordset[0]?.totalRows || 0;
        let dataRows = dataResult.recordset ?? [];
        let more = false;
        if (dataRows.length > pageSize) {
          more = true;
          dataRows = dataRows.slice(0, pageSize);
        }
        const lastRow = dataRows[dataRows.length - 1];
        const cursorValue = lastRow
          ? encodeCursor({
              date: formatDateOnly(lastRow.DI_DATE),
              ref: lastRow.DI_REF,
              seq: lastRow.TRD_SEQ,
            })
          : null;

        return {
          rows: dataRows,
          totalRecords: total,
          hasMore: more,
          nextCursor: cursorValue,
        };
      }
    );

    res.json({
      data: rows,
      pagination: {
        page,
        pageSize,
        totalRecords,
        totalPages: Math.max(1, Math.ceil(totalRecords / pageSize)),
      },
      cursor: {
        next: nextCursor,
        hasMore,
      },
    });
  } catch (error) {
    console.error("api/suppliers error", error);
    res.status(500).json({ error: "SQL query failed", details: error.message });
  }
});

app.get("/api/raw-material-lot-costs", requireAuth, async (req, res) => {
  try {
    const search = req.query.search ? String(req.query.search).trim() : "";
    const skuCode = req.query.skuCode ? String(req.query.skuCode).trim() : null;
    const lotNo = req.query.lotNo ? String(req.query.lotNo).trim() : null;
    const iccatCodes = normalizeListParam(req.query.iccatCodes);
    const costStatus = ["ready", "review"].includes(String(req.query.costStatus || ""))
      ? String(req.query.costStatus)
      : null;
    const page = parsePositiveInt(req.query.page, 1);
    const pageSize = parsePositiveInt(req.query.pageSize, 100, 200);
    const { cursor, error } = resolveCursor(res, page, req.query.cursor, parseSkuLotCursor);
    if (error) {
      return;
    }
    const limit = pageSize + 1;
    const connection = await getErpPool();
    const requestSql = connection.request();
    requestSql.input("limitParam", sql.Int, limit);
    requestSql.input("searchParam", sql.NVarChar, search ? `%${search}%` : null);
    requestSql.input("skuCodeParam", sql.NVarChar, skuCode);
    requestSql.input("lotNoParam", sql.NVarChar, lotNo);
    requestSql.input("iccatCodesParam", sql.NVarChar, iccatCodes);
    requestSql.input("costStatusParam", sql.NVarChar, costStatus);
    if (cursor) {
      requestSql.input("cursorSkuCode", sql.NVarChar, cursor.skuCode);
      requestSql.input("cursorLotNo", sql.NVarChar, cursor.lotNo);
    }

    const cursorFilter = cursor
      ? `AND (
          SKU_CODE > @cursorSkuCode
          OR (SKU_CODE = @cursorSkuCode AND LOT_NO > @cursorLotNo)
        )`
      : "";
    const query = `
      DECLARE @limit INT = @limitParam;
      DECLARE @search NVARCHAR(255) = @searchParam;
      DECLARE @skuCode NVARCHAR(255) = @skuCodeParam;
      DECLARE @lotNo NVARCHAR(255) = @lotNoParam;
      DECLARE @iccatCodes NVARCHAR(MAX) = @iccatCodesParam;
      DECLARE @costStatus NVARCHAR(20) = @costStatusParam;

      WITH PurchaseLines AS (
        SELECT
          DOCINFO.DI_KEY,
          DOCINFO.DI_DATE,
          DOCINFO.DI_REF,
          TRANSTKD.TRD_SEQ,
          APFILE.AP_CODE,
          APFILE.AP_NAME,
          SKUMASTER.SKU_CODE,
          SKUMASTER.SKU_NAME,
          ICCAT.ICCAT_CODE,
          ICCAT.ICCAT_NAME,
          LTRIM(RTRIM(ISNULL(TRANSTKD.TRD_LOT_NO, ''))) AS LOT_NO,
          UOFQTY.UTQ_NAME AS BASE_UNIT_NAME,
          CAST(
            CASE WHEN DOCTYPE.DT_PROPERTIES IN (304, 336) THEN -1 ELSE 1 END
            * (COALESCE(TRANSTKD.TRD_QTY, 0) + COALESCE(TRANSTKD.TRD_Q_FREE, 0))
            * COALESCE(NULLIF(TRANSTKD.TRD_UTQQTY, 0), 1)
            AS DECIMAL(28, 8)
          ) AS BASE_QTY,
          CAST(
            CASE WHEN DOCTYPE.DT_PROPERTIES IN (304, 336) THEN -1 ELSE 1 END
            * TRANSTKD.TRD_B_SELL AS DECIMAL(28, 8)
          ) AS NET_PURCHASE_AMOUNT,
          CAST(
            CASE WHEN DOCTYPE.DT_PROPERTIES IN (304, 336) THEN -1 ELSE 1 END
            * TRANSTKD.TRD_B_VAT AS DECIMAL(28, 8)
          ) AS VAT_AMOUNT,
          CAST(
            CASE WHEN DOCTYPE.DT_PROPERTIES IN (304, 336) THEN -1 ELSE 1 END
            * TRANSTKD.TRD_B_AMT AS DECIMAL(28, 8)
          ) AS GROSS_AMOUNT
        FROM DOCINFO
        JOIN DOCTYPE ON DOCINFO.DI_DT = DOCTYPE.DT_KEY
        JOIN TRANSTKH ON DOCINFO.DI_KEY = TRANSTKH.TRH_DI
        JOIN TRANSTKD ON TRANSTKH.TRH_KEY = TRANSTKD.TRD_TRH
        JOIN APDETAIL ON DOCINFO.DI_KEY = APDETAIL.APD_DI
        JOIN APFILE ON APDETAIL.APD_AP = APFILE.AP_KEY
        JOIN SKUMASTER ON TRANSTKD.TRD_SKU = SKUMASTER.SKU_KEY
        JOIN ICCAT ON SKUMASTER.SKU_ICCAT = ICCAT.ICCAT_KEY
        LEFT JOIN UOFQTY ON SKUMASTER.SKU_K_UTQ = UOFQTY.UTQ_KEY
        WHERE DOCINFO.DI_ACTIVE = 0
          AND DOCTYPE.DT_PROPERTIES IN (301, 303, 304, 336)
          AND ICCAT.ICCAT_CODE IN ('01', '02', '05', '08', '10')
          AND (@skuCode IS NULL OR SKUMASTER.SKU_CODE = @skuCode)
          AND (@lotNo IS NULL OR LTRIM(RTRIM(ISNULL(TRANSTKD.TRD_LOT_NO, ''))) = @lotNo)
          AND (@iccatCodes IS NULL OR ICCAT.ICCAT_CODE IN (
            SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@iccatCodes, ',')
          ))
          AND (
            @search IS NULL
            OR SKUMASTER.SKU_CODE LIKE @search
            OR SKUMASTER.SKU_NAME LIKE @search
            OR TRANSTKD.TRD_LOT_NO LIKE @search
            OR DOCINFO.DI_REF LIKE @search
          )
      ),
      Aggregated AS (
        SELECT
          SKU_CODE,
          SKU_NAME,
          ICCAT_CODE,
          ICCAT_NAME,
          LOT_NO,
          BASE_UNIT_NAME,
          SUM(BASE_QTY) AS RECEIVED_BASE_QTY,
          SUM(NET_PURCHASE_AMOUNT) AS NET_PURCHASE_AMOUNT,
          SUM(VAT_AMOUNT) AS VAT_AMOUNT,
          SUM(GROSS_AMOUNT) AS GROSS_AMOUNT,
          COUNT(DISTINCT DI_KEY) AS SOURCE_DOCUMENT_COUNT,
          SUM(CASE WHEN NET_PURCHASE_AMOUNT IS NULL THEN 1 ELSE 0 END) AS MISSING_COST_LINES,
          MIN(DI_DATE) AS FIRST_RECEIPT_DATE,
          MAX(DI_DATE) AS LAST_RECEIPT_DATE
        FROM PurchaseLines
        GROUP BY SKU_CODE, SKU_NAME, ICCAT_CODE, ICCAT_NAME, LOT_NO, BASE_UNIT_NAME
      ),
      LatestSources AS (
        SELECT *, ROW_NUMBER() OVER (
          PARTITION BY SKU_CODE, LOT_NO
          ORDER BY DI_DATE DESC, DI_REF DESC, TRD_SEQ DESC
        ) AS SOURCE_RANK
        FROM PurchaseLines
      ),
      CostRows AS (
        SELECT
          A.*,
          CASE
            WHEN A.LOT_NO = '' THEN 'review'
            WHEN NULLIF(LTRIM(RTRIM(A.BASE_UNIT_NAME)), '') IS NULL THEN 'review'
            WHEN A.RECEIVED_BASE_QTY <= 0 THEN 'review'
            WHEN A.MISSING_COST_LINES > 0 THEN 'review'
            WHEN A.NET_PURCHASE_AMOUNT < 0 THEN 'review'
            ELSE 'ready'
          END AS COST_STATUS,
          CASE
            WHEN A.LOT_NO = '' THEN N'ไม่มีเลข LOT'
            WHEN NULLIF(LTRIM(RTRIM(A.BASE_UNIT_NAME)), '') IS NULL THEN N'ไม่มีหน่วยหลักของสินค้า'
            WHEN A.RECEIVED_BASE_QTY <= 0 THEN N'จำนวนรับเข้าสุทธิไม่มากกว่าศูนย์'
            WHEN A.MISSING_COST_LINES > 0 THEN N'รายการซื้อบางรายการไม่มีมูลค่าสุทธิ'
            WHEN A.NET_PURCHASE_AMOUNT < 0 THEN N'มูลค่าซื้อสุทธิติดลบ'
            ELSE NULL
          END AS REVIEW_REASON,
          CASE
            WHEN A.LOT_NO <> ''
              AND NULLIF(LTRIM(RTRIM(A.BASE_UNIT_NAME)), '') IS NOT NULL
              AND A.RECEIVED_BASE_QTY > 0
              AND A.MISSING_COST_LINES = 0
              AND A.NET_PURCHASE_AMOUNT >= 0
            THEN A.NET_PURCHASE_AMOUNT / NULLIF(A.RECEIVED_BASE_QTY, 0)
            ELSE NULL
          END AS UNIT_COST,
          S.DI_REF AS LATEST_SOURCE_REF,
          S.DI_DATE AS LATEST_SOURCE_DATE,
          S.AP_CODE AS LATEST_SUPPLIER_CODE,
          S.AP_NAME AS LATEST_SUPPLIER_NAME
        FROM Aggregated A
        LEFT JOIN LatestSources S
          ON S.SKU_CODE = A.SKU_CODE
          AND S.LOT_NO = A.LOT_NO
          AND S.SOURCE_RANK = 1
      ),
      Filtered AS (
        SELECT
          *,
          COUNT(1) OVER() AS TOTAL_ROWS,
          SUM(CASE WHEN COST_STATUS = 'ready' THEN 1 ELSE 0 END) OVER() AS READY_ROWS,
          SUM(CASE WHEN COST_STATUS = 'review' THEN 1 ELSE 0 END) OVER() AS REVIEW_ROWS
        FROM CostRows
        WHERE (@costStatus IS NULL OR COST_STATUS = @costStatus)
      )
      SELECT TOP (@limit) *
      FROM Filtered
      WHERE 1 = 1
        ${cursorFilter}
      ORDER BY SKU_CODE ASC, LOT_NO ASC;
    `;

    const cacheKey = getCacheKey("raw-material-lot-costs", req);
    let payload = !shouldBypassCache(req) ? getCachedResponse(cacheKey) : null;
    if (!payload) {
      const result = await requestSql.query(query);
      let rows = result.recordset ?? [];
      const hasMore = rows.length > pageSize;
      if (hasMore) rows = rows.slice(0, pageSize);
      const totalRecords = Number(rows[0]?.TOTAL_ROWS || 0);
      const summary = {
        total: totalRecords,
        ready: Number(rows[0]?.READY_ROWS || 0),
        review: Number(rows[0]?.REVIEW_ROWS || 0),
      };
      const lastRow = rows[rows.length - 1];
      const nextCursor = lastRow
        ? encodeCursor({ skuCode: lastRow.SKU_CODE, lotNo: lastRow.LOT_NO, warehouseCode: "" })
        : null;
      rows = rows.map(({ TOTAL_ROWS, READY_ROWS, REVIEW_ROWS, ...row }) => row);
      payload = {
        data: rows,
        summary,
        pagination: {
          page,
          pageSize,
          totalRecords,
          totalPages: Math.max(1, Math.ceil(totalRecords / pageSize)),
        },
        cursor: { next: nextCursor, hasMore },
      };
      if (!shouldBypassCache(req)) setCachedResponse(cacheKey, payload, LOT_CACHE_TTL_MS);
    }
    res.json(payload);
  } catch (error) {
    console.error("api/raw-material-lot-costs error", error);
    res.status(500).json({ error: "SQL query failed", details: error.message });
  }
});

app.get("/api/raw-material-receipts", requireAuth, async (req, res) => {
  try {
    const search = req.query.search ? String(req.query.search).trim() : "";
    const iccatCodes = normalizeListParam(req.query.iccatCodes) || "01,02,03,05,08,10";
    const warehouseCode = req.query.warehouseCode ? String(req.query.warehouseCode).trim() : null;
    const skuCodes = normalizeListParam(req.query.skuCodes);
    const latestOnly = String(req.query.latestOnly || "") === "1";
    const costStatus = ["ready", "review"].includes(String(req.query.costStatus || ""))
      ? String(req.query.costStatus)
      : null;
    const dateFrom = parseDateParam(req.query.dateFrom);
    const dateTo = parseDateParam(req.query.dateTo);
    const page = parsePositiveInt(req.query.page, 1);
    const isExport = String(req.query.export || "") === "1";
    const pageSize = parsePositiveInt(req.query.pageSize, 100, isExport ? 5000 : 200);
    const { cursor, error } = resolveCursor(res, page, req.query.cursor, parseReceiptCursor);
    if (error) return;

    const connection = await getErpPool();
    const requestSql = connection.request();
    requestSql.input("limitParam", sql.Int, pageSize + 1);
    requestSql.input("searchParam", sql.NVarChar, search ? `%${search}%` : null);
    requestSql.input("iccatCodesParam", sql.NVarChar, iccatCodes);
    requestSql.input("warehouseCodeParam", sql.NVarChar, warehouseCode);
    requestSql.input("skuCodesParam", sql.NVarChar, skuCodes);
    requestSql.input("latestOnly", sql.Bit, latestOnly ? 1 : 0);
    requestSql.input("costStatusParam", sql.NVarChar, costStatus);
    requestSql.input("dateFromParam", sql.Date, dateFrom);
    requestSql.input("dateToParam", sql.Date, dateTo);
    if (cursor) {
      requestSql.input("cursorSkuCode", sql.NVarChar, cursor.skuCode);
      requestSql.input("cursorLotNo", sql.NVarChar, cursor.lotNo);
      requestSql.input("cursorDate", sql.Date, cursor.date);
      requestSql.input("cursorRef", sql.NVarChar, cursor.ref);
      requestSql.input("cursorDiKey", sql.Int, cursor.diKey);
      requestSql.input("cursorSeq", sql.Int, cursor.seq);
      requestSql.input("cursorTrdKey", sql.Int, cursor.trdKey);
    }

    const cursorFilter = cursor
      ? `AND (
          SKU_CODE > @cursorSkuCode
          OR (SKU_CODE = @cursorSkuCode AND LOT_NO > @cursorLotNo)
          OR (SKU_CODE = @cursorSkuCode AND LOT_NO = @cursorLotNo AND DI_DATE > @cursorDate)
          OR (SKU_CODE = @cursorSkuCode AND LOT_NO = @cursorLotNo AND DI_DATE = @cursorDate AND DI_REF > @cursorRef)
          OR (SKU_CODE = @cursorSkuCode AND LOT_NO = @cursorLotNo AND DI_DATE = @cursorDate AND DI_REF = @cursorRef AND DI_KEY > @cursorDiKey)
          OR (SKU_CODE = @cursorSkuCode AND LOT_NO = @cursorLotNo AND DI_DATE = @cursorDate AND DI_REF = @cursorRef AND DI_KEY = @cursorDiKey AND TRD_SEQ > @cursorSeq)
          OR (SKU_CODE = @cursorSkuCode AND LOT_NO = @cursorLotNo AND DI_DATE = @cursorDate AND DI_REF = @cursorRef AND DI_KEY = @cursorDiKey AND TRD_SEQ = @cursorSeq AND TRD_KEY > @cursorTrdKey)
        )`
      : "";
    const query = `
      WITH ReceiptLines AS (
        SELECT
          CAST(DOCINFO.DI_DATE AS DATE) AS DI_DATE,
          DOCINFO.DI_REF,
          DOCINFO.DI_KEY,
          TRANSTKD.TRD_SEQ,
          TRANSTKD.TRD_KEY,
          DOCTYPE.DT_PROPERTIES,
          SKUMASTER.SKU_CODE,
          SKUMASTER.SKU_NAME,
          ICCAT.ICCAT_CODE,
          LTRIM(RTRIM(ISNULL(TRANSTKD.TRD_LOT_NO, ''))) AS LOT_NO,
          WARELOCATION.WL_CODE,
          UOFQTY.UTQ_NAME AS BASE_UNIT_NAME,
          APFILE.AP_CODE,
          APFILE.AP_NAME,
          CAST(
            (COALESCE(TRANSTKD.TRD_QTY, 0) + COALESCE(TRANSTKD.TRD_Q_FREE, 0))
            * COALESCE(NULLIF(TRANSTKD.TRD_UTQQTY, 0), 1)
            AS DECIMAL(28, 8)
          ) AS NET_BASE_QTY,
          CAST(TRANSTKD.TRD_B_SELL AS DECIMAL(28, 8)) AS SELL_AMOUNT,
          CAST(TRANSTKD.TRD_B_SELL AS DECIMAL(28, 8)) AS NET_AMOUNT_EXCL_VAT,
          CAST(TRANSTKD.TRD_B_AMT AS DECIMAL(28, 8)) AS NET_AMOUNT_INCL_VAT,
          CAST(
            TRANSTKD.TRD_B_VAT
            AS DECIMAL(28, 8)
          ) AS VAT_AMOUNT
        FROM DOCINFO
        JOIN DOCTYPE ON DOCINFO.DI_DT = DOCTYPE.DT_KEY
        JOIN TRANSTKH ON DOCINFO.DI_KEY = TRANSTKH.TRH_DI
        JOIN TRANSTKD ON TRANSTKH.TRH_KEY = TRANSTKD.TRD_TRH
        JOIN APDETAIL ON DOCINFO.DI_KEY = APDETAIL.APD_DI
        JOIN APFILE ON APDETAIL.APD_AP = APFILE.AP_KEY
        JOIN SKUMASTER ON TRANSTKD.TRD_SKU = SKUMASTER.SKU_KEY
        JOIN ICCAT ON SKUMASTER.SKU_ICCAT = ICCAT.ICCAT_KEY
        JOIN WARELOCATION ON TRANSTKD.TRD_WL = WARELOCATION.WL_KEY
        LEFT JOIN UOFQTY ON SKUMASTER.SKU_K_UTQ = UOFQTY.UTQ_KEY
        WHERE DOCINFO.DI_ACTIVE = 0
          AND DOCTYPE.DT_PROPERTIES IN (301, 303)
          AND DOCINFO.DI_REF LIKE 'INV%'
          AND ICCAT.ICCAT_CODE IN ('01', '02', '03', '05', '08', '10')
          AND ICCAT.ICCAT_CODE IN (
            SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@iccatCodesParam, ',')
          )
          AND (@warehouseCodeParam IS NULL OR WARELOCATION.WL_CODE = @warehouseCodeParam)
          AND (@skuCodesParam IS NULL OR SKUMASTER.SKU_CODE IN (
            SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@skuCodesParam, ',')
          ))
          AND (@dateFromParam IS NULL OR DOCINFO.DI_DATE >= @dateFromParam)
          AND (@dateToParam IS NULL OR DOCINFO.DI_DATE < DATEADD(DAY, 1, @dateToParam))
          AND (
            @searchParam IS NULL
            OR DOCINFO.DI_REF LIKE @searchParam
            OR SKUMASTER.SKU_CODE LIKE @searchParam
            OR SKUMASTER.SKU_NAME LIKE @searchParam
            OR TRANSTKD.TRD_LOT_NO LIKE @searchParam
            OR APFILE.AP_CODE LIKE @searchParam
            OR APFILE.AP_NAME LIKE @searchParam
          )
      ),
      Costed AS (
        SELECT
          *,
          CASE
            WHEN LOT_NO = ''
              OR NULLIF(LTRIM(RTRIM(BASE_UNIT_NAME)), '') IS NULL
              OR NET_BASE_QTY <= 0
              OR SELL_AMOUNT IS NULL
              OR NET_AMOUNT_EXCL_VAT <= 0 THEN 'review'
            ELSE 'ready'
          END AS COST_STATUS,
          CASE
            WHEN LOT_NO = '' THEN N'ไม่มีเลข LOT'
            WHEN NULLIF(LTRIM(RTRIM(BASE_UNIT_NAME)), '') IS NULL THEN N'ไม่มีหน่วยหลักของสินค้า'
            WHEN NET_BASE_QTY = 0 THEN N'ปริมาณรับเข้าสุทธิเป็นศูนย์'
            WHEN NET_AMOUNT_EXCL_VAT IS NULL THEN N'ยอดซื้อก่อน VAT ไม่ครบจาก ERP'
            WHEN NET_AMOUNT_EXCL_VAT = 0 THEN N'ยอดซื้อก่อน VAT เป็นศูนย์ ต้องตรวจการปันส่วนต้นทุน'
            WHEN NET_BASE_QTY < 0 OR NET_AMOUNT_EXCL_VAT < 0
              THEN N'ยอดรับเข้าติดลบ'
            ELSE NULL
          END AS REVIEW_REASON,
          CASE
            WHEN NULLIF(LTRIM(RTRIM(BASE_UNIT_NAME)), '') IS NOT NULL
              AND NET_BASE_QTY > 0
              AND NET_AMOUNT_EXCL_VAT >= 0
              THEN NET_AMOUNT_EXCL_VAT / NET_BASE_QTY
            ELSE NULL
          END AS UNIT_PRICE_EXCL_VAT
        FROM ReceiptLines
      ),
      Ranked AS (
        SELECT
          *,
          ROW_NUMBER() OVER (
            PARTITION BY SKU_CODE
            ORDER BY DI_DATE DESC, DI_KEY DESC, TRD_SEQ DESC, TRD_KEY DESC
          ) AS SKU_PRICE_RANK
        FROM Costed
      ),
      Filtered AS (
        SELECT
          *
        FROM Ranked
        WHERE (@costStatusParam IS NULL OR COST_STATUS = @costStatusParam)
          AND (@latestOnly = 0 OR SKU_PRICE_RANK = 1)
      ),
      Summary AS (
        SELECT
          COUNT(1) AS TOTAL_ROWS,
          COUNT(DISTINCT DI_KEY) AS TOTAL_INVOICES,
          COUNT(DISTINCT CASE WHEN LOT_NO <> '' THEN CONCAT(SKU_CODE, N'|', LOT_NO, N'|', WL_CODE) END) AS TOTAL_LOTS,
          SUM(COALESCE(NET_AMOUNT_EXCL_VAT, 0)) AS TOTAL_AMOUNT_EXCL_VAT,
          SUM(COALESCE(NET_AMOUNT_INCL_VAT, 0)) AS TOTAL_AMOUNT_INCL_VAT,
          SUM(CASE WHEN COST_STATUS = 'review' THEN 1 ELSE 0 END) AS REVIEW_ROWS
        FROM Filtered
      )
      SELECT TOP (@limitParam) Filtered.*, Summary.*
      FROM Filtered
      CROSS JOIN Summary
      WHERE 1 = 1
        ${cursorFilter}
      ORDER BY SKU_CODE ASC, LOT_NO ASC, DI_DATE ASC, DI_REF ASC, DI_KEY ASC, TRD_SEQ ASC, TRD_KEY ASC
      OPTION (RECOMPILE);
    `;

    const cacheKey = getCacheKey("raw-material-receipts", req);
    let payload = !shouldBypassCache(req) ? getCachedResponse(cacheKey) : null;
    if (!payload) {
      const result = await requestSql.query(query);
      let rows = result.recordset ?? [];
      const hasMore = rows.length > pageSize;
      if (hasMore) rows = rows.slice(0, pageSize);
      const summary = {
        total: Number(rows[0]?.TOTAL_ROWS || 0),
        invoices: Number(rows[0]?.TOTAL_INVOICES || 0),
        lots: Number(rows[0]?.TOTAL_LOTS || 0),
        totalAmountExclVat: Number(rows[0]?.TOTAL_AMOUNT_EXCL_VAT || 0),
        totalAmountInclVat: Number(rows[0]?.TOTAL_AMOUNT_INCL_VAT || 0),
        review: Number(rows[0]?.REVIEW_ROWS || 0),
      };
      const lastRow = rows[rows.length - 1];
      const nextCursor = lastRow
        ? encodeCursor({
            skuCode: lastRow.SKU_CODE,
            lotNo: lastRow.LOT_NO,
            date: formatDateOnly(lastRow.DI_DATE),
            ref: lastRow.DI_REF,
            diKey: lastRow.DI_KEY,
            seq: lastRow.TRD_SEQ,
            trdKey: lastRow.TRD_KEY,
          })
        : null;
      rows = rows.map(({ TOTAL_ROWS, TOTAL_INVOICES, TOTAL_LOTS, TOTAL_AMOUNT_EXCL_VAT, TOTAL_AMOUNT_INCL_VAT, REVIEW_ROWS, SKU_PRICE_RANK, ...row }) => row);
      payload = {
        data: rows,
        summary,
        asOf: new Date().toISOString(),
        pagination: {
          page,
          pageSize,
          totalRecords: summary.total,
          totalPages: Math.max(1, Math.ceil(summary.total / pageSize)),
        },
        cursor: { next: nextCursor, hasMore },
      };
      if (!shouldBypassCache(req)) setCachedResponse(cacheKey, payload, LOT_CACHE_TTL_MS);
    }
    res.json(payload);
  } catch (error) {
    console.error("api/raw-material-receipts error", error);
    res.status(500).json({ error: "SQL query failed", details: error.message });
  }
});

app.get("/api/production-receipts", requireAuth, async (req, res) => {
  try {
    const search = req.query.search ? String(req.query.search).trim() : "";
    const warehouseCode = req.query.warehouseCode ? String(req.query.warehouseCode).trim() : null;
    const costStatus = ["ready", "review"].includes(String(req.query.costStatus || ""))
      ? String(req.query.costStatus)
      : null;
    const dateFrom = parseDateParam(req.query.dateFrom);
    const dateTo = parseDateParam(req.query.dateTo);
    const page = parsePositiveInt(req.query.page, 1);
    const isExport = String(req.query.export || "") === "1";
    const pageSize = parsePositiveInt(req.query.pageSize, 100, isExport ? 5000 : 200);
    const { cursor, error } = resolveCursor(res, page, req.query.cursor, parseReceiptCursor);
    if (error) return;

    const connection = await getErpPool();
    const requestSql = connection.request();
    requestSql.input("limitParam", sql.Int, pageSize + 1);
    requestSql.input("searchParam", sql.NVarChar, search ? `%${search}%` : null);
    requestSql.input("warehouseCodeParam", sql.NVarChar, warehouseCode);
    requestSql.input("costStatusParam", sql.NVarChar, costStatus);
    requestSql.input("dateFromParam", sql.Date, dateFrom);
    requestSql.input("dateToParam", sql.Date, dateTo);
    if (cursor) {
      requestSql.input("cursorSkuCode", sql.NVarChar, cursor.skuCode);
      requestSql.input("cursorLotNo", sql.NVarChar, cursor.lotNo);
      requestSql.input("cursorDate", sql.Date, cursor.date);
      requestSql.input("cursorRef", sql.NVarChar, cursor.ref);
      requestSql.input("cursorDiKey", sql.Int, cursor.diKey);
      requestSql.input("cursorSeq", sql.Int, cursor.seq);
      requestSql.input("cursorTrdKey", sql.Int, cursor.trdKey);
    }

    const cursorFilter = cursor
      ? `AND (
          SKU_CODE > @cursorSkuCode
          OR (SKU_CODE = @cursorSkuCode AND LOT_NO > @cursorLotNo)
          OR (SKU_CODE = @cursorSkuCode AND LOT_NO = @cursorLotNo AND DI_DATE > @cursorDate)
          OR (SKU_CODE = @cursorSkuCode AND LOT_NO = @cursorLotNo AND DI_DATE = @cursorDate AND DI_REF > @cursorRef)
          OR (SKU_CODE = @cursorSkuCode AND LOT_NO = @cursorLotNo AND DI_DATE = @cursorDate AND DI_REF = @cursorRef AND DI_KEY > @cursorDiKey)
          OR (SKU_CODE = @cursorSkuCode AND LOT_NO = @cursorLotNo AND DI_DATE = @cursorDate AND DI_REF = @cursorRef AND DI_KEY = @cursorDiKey AND TRD_SEQ > @cursorSeq)
          OR (SKU_CODE = @cursorSkuCode AND LOT_NO = @cursorLotNo AND DI_DATE = @cursorDate AND DI_REF = @cursorRef AND DI_KEY = @cursorDiKey AND TRD_SEQ = @cursorSeq AND TRD_KEY > @cursorTrdKey)
        )`
      : "";
    const query = `
      WITH ReceiptLines AS (
        SELECT
          CAST(DOCINFO.DI_DATE AS DATE) AS DI_DATE,
          DOCINFO.DI_REF,
          DOCINFO.DI_KEY,
          TRANSTKD.TRD_SEQ,
          TRANSTKD.TRD_KEY,
          DOCTYPE.DT_PROPERTIES,
          SKUMASTER.SKU_CODE,
          SKUMASTER.SKU_NAME,
          ICCAT.ICCAT_CODE,
          ICCAT.ICCAT_NAME,
          LTRIM(RTRIM(ISNULL(TRANSTKD.TRD_LOT_NO, ''))) AS LOT_NO,
          WARELOCATION.WL_CODE,
          WARELOCATION.WL_NAME,
          COALESCE(NULLIF(LTRIM(RTRIM(UOFQTY.UTQ_NAME)), ''), TRANSTKD.TRD_UTQNAME) AS BASE_UNIT_NAME,
          TRANSTKD.TRD_UTQNAME AS DOC_UNIT_NAME,
          CAST(TRANSTKD.TRD_QTY AS DECIMAL(28, 8)) AS DOC_QTY,
          DEPTTAB.DEPT_CODE,
          DEPTTAB.DEPT_THAIDESC,
          PRJTAB.PRJ_CODE,
          PRJTAB.PRJ_NAME,
          DOCINFO.DI_CRE_BY,
          CAST(DOCINFO.DI_REMARK AS VARCHAR(255)) AS DI_REMARK,
          CAST(
            (COALESCE(TRANSTKD.TRD_QTY, 0) + COALESCE(TRANSTKD.TRD_Q_FREE, 0))
            * COALESCE(NULLIF(TRANSTKD.TRD_UTQQTY, 0), 1)
            AS DECIMAL(28, 8)
          ) AS NET_BASE_QTY,
          CAST(TRANSTKD.TRD_B_SELL AS DECIMAL(28, 8)) AS SELL_AMOUNT,
          CAST(TRANSTKD.TRD_B_SELL AS DECIMAL(28, 8)) AS NET_AMOUNT_EXCL_VAT,
          CAST(TRANSTKD.TRD_B_AMT AS DECIMAL(28, 8)) AS NET_AMOUNT_INCL_VAT,
          CAST(TRANSTKD.TRD_B_VAT AS DECIMAL(28, 8)) AS VAT_AMOUNT
        FROM DOCINFO
        JOIN DOCTYPE ON DOCINFO.DI_DT = DOCTYPE.DT_KEY
        JOIN TRANSTKH ON DOCINFO.DI_KEY = TRANSTKH.TRH_DI
        JOIN TRANSTKD ON TRANSTKH.TRH_KEY = TRANSTKD.TRD_TRH
        JOIN DEPTTAB ON TRANSTKH.TRH_DEPT = DEPTTAB.DEPT_KEY
        JOIN PRJTAB ON TRANSTKH.TRH_PRJ = PRJTAB.PRJ_KEY
        JOIN BRANCH ON TRANSTKH.TRH_BR = BRANCH.BR_KEY
        JOIN GOODSMASTER ON TRANSTKD.TRD_GOODS = GOODSMASTER.GOODS_KEY
        JOIN SKUMASTER ON TRANSTKD.TRD_SKU = SKUMASTER.SKU_KEY
        JOIN ICCAT ON SKUMASTER.SKU_ICCAT = ICCAT.ICCAT_KEY
        JOIN BRAND ON SKUMASTER.SKU_BRN = BRAND.BRN_KEY
        JOIN ICDEPT ON SKUMASTER.SKU_ICDEPT = ICDEPT.ICDEPT_KEY
        JOIN WARELOCATION ON TRANSTKD.TRD_WL = WARELOCATION.WL_KEY
        JOIN WAREHOUSE ON WARELOCATION.WL_WH = WAREHOUSE.WH_KEY
        LEFT JOIN WARELOCATION WL ON TRANSTKD.TRD_TO_WL = WL.WL_KEY
        LEFT OUTER JOIN APPRICETAB ON TRANSTKH.TRH_ARPRB = APPRICETAB.APPRB_CODE
        LEFT JOIN UOFQTY ON SKUMASTER.SKU_K_UTQ = UOFQTY.UTQ_KEY
        WHERE DOCINFO.DI_ACTIVE = 0
          AND DOCTYPE.DT_PROPERTIES = 305
          AND ICCAT.ICCAT_CODE = '03'
          AND (@warehouseCodeParam IS NULL OR WARELOCATION.WL_CODE = @warehouseCodeParam)
          AND (@dateFromParam IS NULL OR DOCINFO.DI_DATE >= @dateFromParam)
          AND (@dateToParam IS NULL OR DOCINFO.DI_DATE < DATEADD(DAY, 1, @dateToParam))
          AND (
            @searchParam IS NULL
            OR DOCINFO.DI_REF LIKE @searchParam
            OR SKUMASTER.SKU_CODE LIKE @searchParam
            OR SKUMASTER.SKU_NAME LIKE @searchParam
            OR TRANSTKD.TRD_LOT_NO LIKE @searchParam
            OR DEPTTAB.DEPT_CODE LIKE @searchParam
            OR DEPTTAB.DEPT_THAIDESC LIKE @searchParam
            OR PRJTAB.PRJ_NAME LIKE @searchParam
          )
      ),
      Costed AS (
        SELECT
          *,
          CASE
            WHEN LOT_NO = ''
              OR NULLIF(LTRIM(RTRIM(BASE_UNIT_NAME)), '') IS NULL
              OR NET_BASE_QTY <= 0
              OR SELL_AMOUNT IS NULL
              OR NET_AMOUNT_EXCL_VAT < 0 THEN 'review'
            ELSE 'ready'
          END AS COST_STATUS,
          CASE
            WHEN LOT_NO = '' THEN N'ไม่มีเลข LOT'
            WHEN NULLIF(LTRIM(RTRIM(BASE_UNIT_NAME)), '') IS NULL THEN N'ไม่มีหน่วยหลักของสินค้า'
            WHEN NET_BASE_QTY = 0 THEN N'ปริมาณรับเข้าสุทธิเป็นศูนย์'
            WHEN NET_AMOUNT_EXCL_VAT IS NULL THEN N'ยอดรับเข้าก่อน VAT ไม่ครบจาก ERP'
            WHEN NET_BASE_QTY < 0 OR NET_AMOUNT_EXCL_VAT < 0
              THEN N'ยอดรับเข้าติดลบ'
            ELSE NULL
          END AS REVIEW_REASON,
          CASE
            WHEN NULLIF(LTRIM(RTRIM(BASE_UNIT_NAME)), '') IS NOT NULL
              AND NET_BASE_QTY > 0
              AND NET_AMOUNT_EXCL_VAT >= 0
              THEN NET_AMOUNT_EXCL_VAT / NET_BASE_QTY
            ELSE NULL
          END AS UNIT_PRICE_EXCL_VAT
        FROM ReceiptLines
      ),
      Filtered AS (
        SELECT
          *
        FROM Costed
        WHERE @costStatusParam IS NULL OR COST_STATUS = @costStatusParam
      ),
      Summary AS (
        SELECT
          COUNT(1) AS TOTAL_ROWS,
          COUNT(DISTINCT DI_KEY) AS TOTAL_INVOICES,
          COUNT(DISTINCT CASE WHEN LOT_NO <> '' THEN CONCAT(SKU_CODE, N'|', LOT_NO, N'|', WL_CODE) END) AS TOTAL_LOTS,
          SUM(COALESCE(NET_AMOUNT_EXCL_VAT, 0)) AS TOTAL_AMOUNT_EXCL_VAT,
          SUM(COALESCE(NET_AMOUNT_INCL_VAT, 0)) AS TOTAL_AMOUNT_INCL_VAT,
          SUM(CASE WHEN COST_STATUS = 'review' THEN 1 ELSE 0 END) AS REVIEW_ROWS
        FROM Filtered
      )
      SELECT TOP (@limitParam) Filtered.*, Summary.*
      FROM Filtered
      CROSS JOIN Summary
      WHERE 1 = 1
        ${cursorFilter}
      ORDER BY SKU_CODE ASC, LOT_NO ASC, DI_DATE ASC, DI_REF ASC, DI_KEY ASC, TRD_SEQ ASC, TRD_KEY ASC
      OPTION (RECOMPILE);
    `;

    const cacheKey = getCacheKey("production-receipts", req);
    let payload = !shouldBypassCache(req) ? getCachedResponse(cacheKey) : null;
    if (!payload) {
      const result = await requestSql.query(query);
      let rows = result.recordset ?? [];
      const hasMore = rows.length > pageSize;
      if (hasMore) rows = rows.slice(0, pageSize);
      const summary = {
        total: Number(rows[0]?.TOTAL_ROWS || 0),
        invoices: Number(rows[0]?.TOTAL_INVOICES || 0),
        lots: Number(rows[0]?.TOTAL_LOTS || 0),
        totalAmountExclVat: Number(rows[0]?.TOTAL_AMOUNT_EXCL_VAT || 0),
        totalAmountInclVat: Number(rows[0]?.TOTAL_AMOUNT_INCL_VAT || 0),
        review: Number(rows[0]?.REVIEW_ROWS || 0),
      };
      const lastRow = rows[rows.length - 1];
      const nextCursor = lastRow
        ? encodeCursor({
            skuCode: lastRow.SKU_CODE,
            lotNo: lastRow.LOT_NO,
            date: formatDateOnly(lastRow.DI_DATE),
            ref: lastRow.DI_REF,
            diKey: lastRow.DI_KEY,
            seq: lastRow.TRD_SEQ,
            trdKey: lastRow.TRD_KEY,
          })
        : null;
      rows = rows.map(({ TOTAL_ROWS, TOTAL_INVOICES, TOTAL_LOTS, TOTAL_AMOUNT_EXCL_VAT, TOTAL_AMOUNT_INCL_VAT, REVIEW_ROWS, ...row }) => row);
      payload = {
        data: rows,
        summary,
        asOf: new Date().toISOString(),
        pagination: {
          page,
          pageSize,
          totalRecords: summary.total,
          totalPages: Math.max(1, Math.ceil(summary.total / pageSize)),
        },
        cursor: { next: nextCursor, hasMore },
      };
      if (!shouldBypassCache(req)) setCachedResponse(cacheKey, payload, LOT_CACHE_TTL_MS);
    }
    res.json(payload);
  } catch (error) {
    console.error("api/production-receipts error", error);
    res.status(500).json({ error: "SQL query failed", details: error.message });
  }
});

app.get("/api/raw-material-requisitions", async (req, res) => {
  try {
    const search = req.query.search ? String(req.query.search).trim() : "";
    const goodsCodes = normalizeListParam(req.query.goodsCodes);
    const documentRefs = req.query.documentRefs ? String(req.query.documentRefs).trim().slice(0, 8000) : "";
    const departmentCodes = req.query.departmentCodes ? String(req.query.departmentCodes).trim().slice(0, 2000) : "";
    const remarkDates = req.query.remarkDates ? String(req.query.remarkDates).trim().slice(0, 2000) : "";
    const dateFrom = parseDateParam(req.query.dateFrom);
    const dateTo = parseDateParam(req.query.dateTo);
    const page = parsePositiveInt(req.query.page, 1);
    const pageSize = parsePositiveInt(req.query.pageSize, 100, 500);
    const includeTotal = req.query.includeTotal !== "false";
    const { cursor, error } = resolveCursor(res, page, req.query.cursor, parseDocumentCursor);
    if (error) {
      return;
    }
    const limit = pageSize + 1;

    const connection = await getErpPool();
    const requestSql = connection.request();
    requestSql.input("limitParam", sql.Int, limit);
    requestSql.input("dateFrom", sql.Date, dateFrom);
    requestSql.input("dateTo", sql.Date, dateTo);
    requestSql.input("goodsCodes", sql.NVarChar, goodsCodes);
    requestSql.input("documentRefs", sql.NVarChar, documentRefs || null);
    requestSql.input("departmentCodes", sql.NVarChar, departmentCodes || null);
    requestSql.input("remarkDates", sql.NVarChar, remarkDates || null);
    if (search) {
      requestSql.input("searchParam", sql.NVarChar, `%${search}%`);
    }
    if (cursor) {
      requestSql.input("cursorDate", sql.Date, cursor.date);
      requestSql.input("cursorRef", sql.NVarChar, cursor.ref);
      requestSql.input("cursorSeq", sql.Int, cursor.seq);
    }

    const searchFilter = search
      ? `AND (
          DOCINFO.DI_REF LIKE @searchParam
          OR TRANSTKD.TRD_SH_CODE LIKE @searchParam
          OR TRANSTKD.TRD_SH_NAME LIKE @searchParam
          OR DOCINFO.DI_REMARK LIKE @searchParam
          OR TRANSTKH.TRH_REFER_IREF LIKE @searchParam
          OR TRANSTKH.TRH_REFER_XREF LIKE @searchParam
          OR TRANSTKD.TRD_REFER_REF LIKE @searchParam
          OR DEPTTAB.DEPT_CODE LIKE @searchParam
          OR PRJTAB.PRJ_CODE LIKE @searchParam
          OR BRANCH.BR_CODE LIKE @searchParam
        )`
      : "";
    const dateFilter = `
          AND (@dateFrom IS NULL OR DOCINFO.DI_DATE >= @dateFrom)
          AND (@dateTo IS NULL OR DOCINFO.DI_DATE <= @dateTo)
        `;
    const goodsCodeFilter = `
          AND (
            @goodsCodes IS NULL
            OR TRANSTKD.TRD_SH_CODE IN (
              SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@goodsCodes, ',')
            )
          )
        `;
    const scopedFilter = `
          AND (
            (@documentRefs IS NULL AND @remarkDates IS NULL AND (
              @departmentCodes IS NULL
              OR DEPTTAB.DEPT_CODE IN (
                SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@departmentCodes, '|')
              )
            ))
            OR DOCINFO.DI_REF IN (
              SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@documentRefs, '|')
            )
            OR (
              (@departmentCodes IS NULL OR DEPTTAB.DEPT_CODE IN (
                SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@departmentCodes, '|')
              ))
              AND EXISTS (
                SELECT 1
                FROM STRING_SPLIT(@remarkDates, '|') dates
                WHERE DOCINFO.DI_REMARK LIKE N'%แผนผลิต,%' + LTRIM(RTRIM(dates.value)) + N'%'
                   OR DOCINFO.DI_REMARK LIKE N'%แผนการผลิต,%' + LTRIM(RTRIM(dates.value)) + N'%'
              )
            )
          )
        `;
    const cursorFilter = cursor
      ? `AND (
          DI_DATE < @cursorDate
          OR (DI_DATE = @cursorDate AND DI_REF > @cursorRef)
          OR (DI_DATE = @cursorDate AND DI_REF = @cursorRef AND TRD_SEQ > @cursorSeq)
        )`
      : "";

    const dataQuery = `
      WITH Base AS (
        SELECT
          DOCINFO.DI_REF,
          DOCINFO.DI_DATE,
          DOCINFO.DI_CRE_BY,
          DOCINFO.DI_PRN_TIME,
          DOCTYPE.DT_REPRT_MSG,
          DEPTTAB.DEPT_CODE,
          DEPTTAB.DEPT_THAIDESC,
          DEPTTAB.DEPT_ENGDESC,
          PRJTAB.PRJ_CODE,
          PRJTAB.PRJ_NAME,
          TRANSTKH.TRH_N_QTY,
          TRANSTKH.TRH_N_ITEMS,
          TRANSTKH.TRH_ARPRB,
          TRANSTKH.TRH_OPTION,
          CAST(LEFT(DOCINFO.DI_REMARK, 255) AS VARCHAR(255)) AS DI_REMARK,
          TRANSTKH.TRH_REFER_IREF,
          TRANSTKH.TRH_REFER_XREF,
          TRANSTKH.TRH_REFER_PERSON,
          TRANSTKH.TRH_REFER_XTRA1,
          TRANSTKH.TRH_REFER_XTRA2,
          TRANSTKD.TRD_SEQ,
          TRANSTKD.TRD_SH_CODE,
          TRANSTKD.TRD_SH_NAME,
          SKUMASTER.SKU_CODE AS PARENT_SKU_CODE,
          TRANSTKD.TRD_SH_REMARK,
          TRANSTKD.TRD_SH_QTY,
          TRANSTKD.TRD_SH_UPRC,
          TRANSTKD.TRD_SH_GSELL,
          TRANSTKD.TRD_SH_GVAT,
          TRANSTKD.TRD_SH_GAMT,
          TRANSTKD.TRD_OPTION,
          TRANSTKD.TRD_B_PCNT,
          TRANSTKD.TRD_LOT_NO,
          TRANSTKD.TRD_SERIAL,
          TRANSTKD.TRD_EXP_D,
          TRANSTKD.TRD_MAN_D,
          ICCAT.ICCAT_CODE,
          ICCAT.ICCAT_NAME,
          ICDEPT.ICDEPT_CODE,
          ICDEPT.ICDEPT_THAIDESC AS ICDEPT_NAME,
          WARELOCATION.WL_CODE,
          WARELOCATION.WL_NAME,
          TRANSTKD.TRD_UTQNAME,
          TRANSTKD.TRD_UTQQTY,
          TRANSTKD.TRD_WEIGHT,
          TRANSTKD.TRD_NM_PRC,
          TRANSTKD.TRD_NM_VATIO,
          TRANSTKD.TRD_NM_U_DSC,
          TRANSTKD.TRD_U_PRC,
          TRANSTKD.TRD_U_VATIO,
          TRANSTKD.TRD_QTY,
          TRANSTKD.TRD_K_U_PRC,
          TRANSTKD.TRD_DSC_KEYIN,
          TRANSTKD.TRD_DSC_KEYINV,
          TRANSTKD.TRD_G_KEYIN,
          TRANSTKD.TRD_G_SELL,
          TRANSTKD.TRD_G_VAT,
          TRANSTKD.TRD_G_AMT,
          TRANSTKD.TRD_TDSC_KEYINV,
          TRANSTKD.TRD_N_SELL,
          TRANSTKD.TRD_N_VAT,
          TRANSTKD.TRD_N_AMT,
          TRANSTKD.TRD_B_SELL,
          TRANSTKD.TRD_B_VAT,
          TRANSTKD.TRD_B_AMT,
          TRANSTKD.TRD_B_UPRC,
          TRANSTKD.TRD_REFER_REF,
          TRANSTKD.TRD_REFER_DATE,
          DOCINFO.DI_KEY,
          DOCINFO.DI_ACTIVE,
          DOCTYPE.DT_PRINT_CANCEL,
          DOCTYPE.DT_REPRT_POS,
          TRANSTKD.TRD_G_KEYIN AS DI_TOTAL,
          ARPRICETAB.ARPRB_CODE,
          ARPRICETAB.ARPRB_NAME,
          BRANCH.BR_CODE,
          WL.WLKEY AS TRD_TO_WL
        FROM DOCINFO
        JOIN DOCTYPE ON DOCINFO.DI_DT = DOCTYPE.DT_KEY
        JOIN TRANSTKH ON DOCINFO.DI_KEY = TRANSTKH.TRH_DI
        JOIN TRANSTKD ON TRANSTKH.TRH_KEY = TRANSTKD.TRD_TRH
        JOIN DEPTTAB ON TRANSTKH.TRH_DEPT = DEPTTAB.DEPT_KEY
        JOIN PRJTAB ON TRANSTKH.TRH_PRJ = PRJTAB.PRJ_KEY
        JOIN BRANCH ON TRANSTKH.TRH_BR = BRANCH.BR_KEY
        JOIN SKUMASTER ON TRANSTKD.TRD_SKU = SKUMASTER.SKU_KEY
        JOIN GOODSMASTER ON TRANSTKD.TRD_GOODS = GOODSMASTER.GOODS_KEY
        JOIN WARELOCATION ON TRANSTKD.TRD_WL = WARELOCATION.WL_KEY
        JOIN WAREHOUSE ON WARELOCATION.WL_WH = WAREHOUSE.WH_KEY
        JOIN ICCAT ON SKUMASTER.SKU_ICCAT = ICCAT.ICCAT_KEY
        JOIN BRAND ON SKUMASTER.SKU_BRN = BRAND.BRN_KEY
        JOIN ICDEPT ON SKUMASTER.SKU_ICDEPT = ICDEPT.ICDEPT_KEY
        JOIN ICCOLOR ON SKUMASTER.SKU_ICCOLOR = ICCOLOR.ICCOLOR_KEY
        JOIN ICSIZE ON SKUMASTER.SKU_ICSIZE = ICSIZE.ICSIZE_KEY
        JOIN SKUALT ON SKUMASTER.SKU_SKUALT = SKUALT.SKUALT_KEY
        JOIN (SELECT WL_KEY AS WLKEY, WL_CODE AS WLCODE FROM WARELOCATION) WL
          ON TRANSTKD.TRD_TO_WL = WL.WLKEY
        LEFT JOIN ARPRICETAB ON TRANSTKH.TRH_ARPRB = ARPRICETAB.ARPRB_CODE
        WHERE
          DOCTYPE.DT_PROPERTIES = 309
          AND DOCINFO.DI_ACTIVE = 0
          AND ICCAT.ICCAT_CODE IN ('01','02','03','05','08','10')
          ${dateFilter}
          ${goodsCodeFilter}
          ${searchFilter}
          ${scopedFilter}
      )
      SELECT TOP (@limitParam) *
      FROM Base
      WHERE 1=1
        ${cursorFilter}
      ORDER BY DI_DATE DESC, DI_REF ASC, TRD_SEQ ASC;
    `;

    const countRequest = connection.request();
    countRequest.input("dateFrom", sql.Date, dateFrom);
    countRequest.input("dateTo", sql.Date, dateTo);
    countRequest.input("goodsCodes", sql.NVarChar, goodsCodes);
    countRequest.input("documentRefs", sql.NVarChar, documentRefs || null);
    countRequest.input("departmentCodes", sql.NVarChar, departmentCodes || null);
    countRequest.input("remarkDates", sql.NVarChar, remarkDates || null);
    if (search) {
      countRequest.input("searchParam", sql.NVarChar, `%${search}%`);
    }

    const countQuery = `
      SELECT COUNT(1) AS totalRows
      FROM DOCINFO
      JOIN DOCTYPE ON DOCINFO.DI_DT = DOCTYPE.DT_KEY
      JOIN TRANSTKH ON DOCINFO.DI_KEY = TRANSTKH.TRH_DI
      JOIN TRANSTKD ON TRANSTKH.TRH_KEY = TRANSTKD.TRD_TRH
      JOIN DEPTTAB ON TRANSTKH.TRH_DEPT = DEPTTAB.DEPT_KEY
      JOIN PRJTAB ON TRANSTKH.TRH_PRJ = PRJTAB.PRJ_KEY
      JOIN BRANCH ON TRANSTKH.TRH_BR = BRANCH.BR_KEY
      JOIN SKUMASTER ON TRANSTKD.TRD_SKU = SKUMASTER.SKU_KEY
      JOIN GOODSMASTER ON TRANSTKD.TRD_GOODS = GOODSMASTER.GOODS_KEY
      JOIN WARELOCATION ON TRANSTKD.TRD_WL = WARELOCATION.WL_KEY
      JOIN WAREHOUSE ON WARELOCATION.WL_WH = WAREHOUSE.WH_KEY
      JOIN ICCAT ON SKUMASTER.SKU_ICCAT = ICCAT.ICCAT_KEY
      JOIN BRAND ON SKUMASTER.SKU_BRN = BRAND.BRN_KEY
      JOIN ICDEPT ON SKUMASTER.SKU_ICDEPT = ICDEPT.ICDEPT_KEY
      JOIN ICCOLOR ON SKUMASTER.SKU_ICCOLOR = ICCOLOR.ICCOLOR_KEY
      JOIN ICSIZE ON SKUMASTER.SKU_ICSIZE = ICSIZE.ICSIZE_KEY
      JOIN SKUALT ON SKUMASTER.SKU_SKUALT = SKUALT.SKUALT_KEY
      JOIN (SELECT WL_KEY AS WLKEY, WL_CODE AS WLCODE FROM WARELOCATION) WL
        ON TRANSTKD.TRD_TO_WL = WL.WLKEY
      LEFT JOIN ARPRICETAB ON TRANSTKH.TRH_ARPRB = ARPRICETAB.ARPRB_CODE
      WHERE
        DOCTYPE.DT_PROPERTIES = 309
        AND DOCINFO.DI_ACTIVE = 0
        AND ICCAT.ICCAT_CODE IN ('01','02','03','05','08','10')
        ${dateFilter}
        ${goodsCodeFilter}
        ${searchFilter}
        ${scopedFilter}
    `;

    const [dataResult, countResult] = await Promise.all([
      requestSql.query(dataQuery),
      includeTotal ? countRequest.query(countQuery) : Promise.resolve(null),
    ]);

    const totalRecords = countResult?.recordset?.[0]?.totalRows ?? null;
    let rows = dataResult.recordset ?? [];
    let hasMore = false;
    if (rows.length > pageSize) {
      hasMore = true;
      rows = rows.slice(0, pageSize);
    }
    const lastRow = rows[rows.length - 1];
    const nextCursor = lastRow
      ? encodeCursor({
          date: formatDateOnly(lastRow.DI_DATE),
          ref: lastRow.DI_REF,
          seq: lastRow.TRD_SEQ,
        })
      : null;

    res.json({
      data: rows,
      pagination: {
        page,
        pageSize,
        totalRecords,
        totalPages: totalRecords === null ? null : Math.max(1, Math.ceil(totalRecords / pageSize)),
      },
      cursor: {
        next: nextCursor,
        hasMore,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "SQL query failed", details: error.message });
  }
});

// Fetch a single requisition document by DI_REF with all lines.
// Used for "reconcile" flows where DI_REF is generated by this app and imported into ERP.
app.get("/api/raw-material-requisitions-by-ref", async (req, res) => {
  try {
    const ref = req.query.ref ? String(req.query.ref).trim() : "";
    if (!ref) {
      return res.status(400).json({ error: "ref is required" });
    }

    const connection = await getErpPool();
    const requestSql = connection.request();
    requestSql.input("docRef", sql.NVarChar, ref);

    const dataQuery = `
      WITH Base AS (
        SELECT
          DOCINFO.DI_REF,
          DOCINFO.DI_DATE,
          DOCINFO.DI_CRE_BY,
          DOCINFO.DI_PRN_TIME,
          DOCTYPE.DT_REPRT_MSG,
          DEPTTAB.DEPT_CODE,
          DEPTTAB.DEPT_THAIDESC,
          DEPTTAB.DEPT_ENGDESC,
          PRJTAB.PRJ_CODE,
          PRJTAB.PRJ_NAME,
          TRANSTKH.TRH_N_QTY,
          TRANSTKH.TRH_N_ITEMS,
          TRANSTKH.TRH_ARPRB,
          TRANSTKH.TRH_OPTION,
          CAST(LEFT(DOCINFO.DI_REMARK, 255) AS VARCHAR(255)) AS DI_REMARK,
          TRANSTKH.TRH_REFER_IREF,
          TRANSTKH.TRH_REFER_XREF,
          TRANSTKH.TRH_REFER_PERSON,
          TRANSTKH.TRH_REFER_XTRA1,
          TRANSTKH.TRH_REFER_XTRA2,
          TRANSTKD.TRD_SEQ,
          TRANSTKD.TRD_SH_CODE,
          TRANSTKD.TRD_SH_NAME,
          SKUMASTER.SKU_CODE AS PARENT_SKU_CODE,
          TRANSTKD.TRD_SH_REMARK,
          TRANSTKD.TRD_SH_QTY,
          TRANSTKD.TRD_SH_UPRC,
          TRANSTKD.TRD_SH_GSELL,
          TRANSTKD.TRD_SH_GVAT,
          TRANSTKD.TRD_SH_GAMT,
          TRANSTKD.TRD_OPTION,
          TRANSTKD.TRD_B_PCNT,
          TRANSTKD.TRD_LOT_NO,
          TRANSTKD.TRD_SERIAL,
          TRANSTKD.TRD_EXP_D,
          TRANSTKD.TRD_MAN_D,
          ICCAT.ICCAT_CODE,
          ICCAT.ICCAT_NAME,
          ICDEPT.ICDEPT_CODE,
          ICDEPT.ICDEPT_THAIDESC AS ICDEPT_NAME,
          WARELOCATION.WL_CODE,
          WARELOCATION.WL_NAME,
          TRANSTKD.TRD_UTQNAME,
          TRANSTKD.TRD_UTQQTY,
          TRANSTKD.TRD_WEIGHT,
          TRANSTKD.TRD_NM_PRC,
          TRANSTKD.TRD_NM_VATIO,
          TRANSTKD.TRD_NM_U_DSC,
          TRANSTKD.TRD_U_PRC,
          TRANSTKD.TRD_U_VATIO,
          TRANSTKD.TRD_QTY,
          TRANSTKD.TRD_K_U_PRC,
          TRANSTKD.TRD_DSC_KEYIN,
          TRANSTKD.TRD_DSC_KEYINV,
          TRANSTKD.TRD_G_KEYIN,
          TRANSTKD.TRD_G_SELL,
          TRANSTKD.TRD_G_VAT,
          TRANSTKD.TRD_G_AMT,
          TRANSTKD.TRD_TDSC_KEYINV,
          TRANSTKD.TRD_N_SELL,
          TRANSTKD.TRD_N_VAT,
          TRANSTKD.TRD_N_AMT,
          TRANSTKD.TRD_B_SELL,
          TRANSTKD.TRD_B_VAT,
          TRANSTKD.TRD_B_AMT,
          TRANSTKD.TRD_B_UPRC,
          TRANSTKD.TRD_REFER_REF,
          TRANSTKD.TRD_REFER_DATE,
          DOCINFO.DI_KEY,
          DOCINFO.DI_ACTIVE,
          DOCTYPE.DT_PRINT_CANCEL,
          DOCTYPE.DT_REPRT_POS,
          TRANSTKD.TRD_G_KEYIN AS DI_TOTAL,
          ARPRICETAB.ARPRB_CODE,
          ARPRICETAB.ARPRB_NAME,
          BRANCH.BR_CODE,
          WL.WLKEY AS TRD_TO_WL
        FROM DOCINFO
        JOIN DOCTYPE ON DOCINFO.DI_DT = DOCTYPE.DT_KEY
        JOIN TRANSTKH ON DOCINFO.DI_KEY = TRANSTKH.TRH_DI
        JOIN TRANSTKD ON TRANSTKH.TRH_KEY = TRANSTKD.TRD_TRH
        JOIN DEPTTAB ON TRANSTKH.TRH_DEPT = DEPTTAB.DEPT_KEY
        JOIN PRJTAB ON TRANSTKH.TRH_PRJ = PRJTAB.PRJ_KEY
        JOIN BRANCH ON TRANSTKH.TRH_BR = BRANCH.BR_KEY
        JOIN SKUMASTER ON TRANSTKD.TRD_SKU = SKUMASTER.SKU_KEY
        JOIN GOODSMASTER ON TRANSTKD.TRD_GOODS = GOODSMASTER.GOODS_KEY
        JOIN WARELOCATION ON TRANSTKD.TRD_WL = WARELOCATION.WL_KEY
        JOIN WAREHOUSE ON WARELOCATION.WL_WH = WAREHOUSE.WH_KEY
        JOIN ICCAT ON SKUMASTER.SKU_ICCAT = ICCAT.ICCAT_KEY
        JOIN BRAND ON SKUMASTER.SKU_BRN = BRAND.BRN_KEY
        JOIN ICDEPT ON SKUMASTER.SKU_ICDEPT = ICDEPT.ICDEPT_KEY
        JOIN ICCOLOR ON SKUMASTER.SKU_ICCOLOR = ICCOLOR.ICCOLOR_KEY
        JOIN ICSIZE ON SKUMASTER.SKU_ICSIZE = ICSIZE.ICSIZE_KEY
        JOIN SKUALT ON SKUMASTER.SKU_SKUALT = SKUALT.SKUALT_KEY
        JOIN (SELECT WL_KEY AS WLKEY, WL_CODE AS WLCODE FROM WARELOCATION) WL
          ON TRANSTKD.TRD_TO_WL = WL.WLKEY
        LEFT JOIN ARPRICETAB ON TRANSTKH.TRH_ARPRB = ARPRICETAB.ARPRB_CODE
        WHERE
          DOCTYPE.DT_PROPERTIES = 309
          AND ICCAT.ICCAT_CODE IN ('01','02','03','05','08','10')
          AND DOCINFO.DI_REF = @docRef
      )
      SELECT *
      FROM Base
      ORDER BY DI_DATE DESC, DI_REF ASC, TRD_SEQ ASC;
    `;

    const dataResult = await requestSql.query(dataQuery);
    const rows = dataResult.recordset ?? [];

    res.json({
      data: rows,
      meta: {
        ref,
        totalLines: rows.length,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "SQL query failed", details: error.message });
  }
});

app.get("/api/raw-material-returns", async (req, res) => {
  try {
    const search = req.query.search ? String(req.query.search).trim() : "";
    const issueRefs = req.query.issueRefs ? String(req.query.issueRefs).trim().slice(0, 8000) : "";
    const dateFrom = parseDateParam(req.query.dateFrom);
    const dateTo = parseDateParam(req.query.dateTo);
    const page = parsePositiveInt(req.query.page, 1);
    const pageSize = parsePositiveInt(req.query.pageSize, 100, 500);
    const includeTotal = req.query.includeTotal !== "false";
    const { cursor, error } = resolveCursor(res, page, req.query.cursor, parseDocumentCursor);
    if (error) {
      return;
    }
    const limit = pageSize + 1;

    const connection = await getErpPool();
    const requestSql = connection.request();
    requestSql.input("limitParam", sql.Int, limit);
    requestSql.input("dateFrom", sql.Date, dateFrom);
    requestSql.input("dateTo", sql.Date, dateTo);
    requestSql.input("issueRefs", sql.NVarChar, issueRefs || null);
    if (search) {
      requestSql.input("searchParam", sql.NVarChar, `%${search}%`);
    }
    if (cursor) {
      requestSql.input("cursorDate", sql.Date, cursor.date);
      requestSql.input("cursorRef", sql.NVarChar, cursor.ref);
      requestSql.input("cursorSeq", sql.Int, cursor.seq);
    }

    const searchFilter = search
      ? `AND (
          DOCINFO.DI_REF LIKE @searchParam
          OR TRANSTKD.TRD_SH_CODE LIKE @searchParam
          OR TRANSTKD.TRD_SH_NAME LIKE @searchParam
          OR DOCINFO.DI_REMARK LIKE @searchParam
          OR TRANSTKH.TRH_REFER_IREF LIKE @searchParam
          OR TRANSTKH.TRH_REFER_XREF LIKE @searchParam
          OR TRANSTKD.TRD_REFER_REF LIKE @searchParam
          OR DEPTTAB.DEPT_CODE LIKE @searchParam
          OR PRJTAB.PRJ_CODE LIKE @searchParam
          OR BRANCH.BR_CODE LIKE @searchParam
        )`
      : "";
    const dateFilter = `
          AND (@dateFrom IS NULL OR DOCINFO.DI_DATE >= @dateFrom)
          AND (@dateTo IS NULL OR DOCINFO.DI_DATE <= @dateTo)
        `;
    const issueRefFilter = `
          AND (
            @issueRefs IS NULL
            OR EXISTS (
              SELECT 1
              FROM STRING_SPLIT(@issueRefs, '|') refs
              WHERE TRANSTKD.TRD_REFER_REF = LTRIM(RTRIM(refs.value))
                 OR TRANSTKH.TRH_REFER_IREF = LTRIM(RTRIM(refs.value))
                 OR TRANSTKH.TRH_REFER_XREF = LTRIM(RTRIM(refs.value))
                 OR DOCINFO.DI_REMARK LIKE N'%อ้างถึงใบเบิก#' + LTRIM(RTRIM(refs.value)) + N':%'
            )
          )
        `;
    const cursorFilter = cursor
      ? `AND (
          DI_DATE < @cursorDate
          OR (DI_DATE = @cursorDate AND DI_REF > @cursorRef)
          OR (DI_DATE = @cursorDate AND DI_REF = @cursorRef AND TRD_SEQ > @cursorSeq)
        )`
      : "";

    const dataQuery = `
      WITH Base AS (
        SELECT
          DOCINFO.DI_REF,
          DOCINFO.DI_DATE,
          DOCINFO.DI_CRE_BY,
          DOCINFO.DI_PRN_TIME,
          DOCTYPE.DT_REPRT_MSG,
          DEPTTAB.DEPT_CODE,
          DEPTTAB.DEPT_THAIDESC,
          DEPTTAB.DEPT_ENGDESC,
          PRJTAB.PRJ_CODE,
          PRJTAB.PRJ_NAME,
          TRANSTKH.TRH_N_QTY,
          TRANSTKH.TRH_N_ITEMS,
          TRANSTKH.TRH_ARPRB,
          TRANSTKH.TRH_OPTION,
          CAST(LEFT(DOCINFO.DI_REMARK, 255) AS VARCHAR(255)) AS DI_REMARK,
          TRANSTKH.TRH_REFER_IREF,
          TRANSTKH.TRH_REFER_XREF,
          TRANSTKH.TRH_REFER_PERSON,
          TRANSTKH.TRH_REFER_XTRA1,
          TRANSTKH.TRH_REFER_XTRA2,
          TRANSTKD.TRD_SEQ,
          TRANSTKD.TRD_SH_CODE,
          TRANSTKD.TRD_SH_NAME,
          TRANSTKD.TRD_SH_REMARK,
          TRANSTKD.TRD_SH_QTY,
          TRANSTKD.TRD_SH_UPRC,
          TRANSTKD.TRD_SH_GSELL,
          TRANSTKD.TRD_SH_GVAT,
          TRANSTKD.TRD_SH_GAMT,
          TRANSTKD.TRD_OPTION,
          TRANSTKD.TRD_B_PCNT,
          TRANSTKD.TRD_LOT_NO,
          TRANSTKD.TRD_SERIAL,
          TRANSTKD.TRD_EXP_D,
          TRANSTKD.TRD_MAN_D,
          ICCAT.ICCAT_CODE,
          ICCAT.ICCAT_NAME,
          ICDEPT.ICDEPT_CODE,
          ICDEPT.ICDEPT_THAIDESC AS ICDEPT_NAME,
          WARELOCATION.WL_CODE,
          WARELOCATION.WL_NAME,
          TRANSTKD.TRD_UTQNAME,
          TRANSTKD.TRD_UTQQTY,
          TRANSTKD.TRD_WEIGHT,
          TRANSTKD.TRD_NM_PRC,
          TRANSTKD.TRD_NM_VATIO,
          TRANSTKD.TRD_NM_U_DSC,
          TRANSTKD.TRD_U_PRC,
          TRANSTKD.TRD_U_VATIO,
          TRANSTKD.TRD_QTY,
          TRANSTKD.TRD_K_U_PRC,
          TRANSTKD.TRD_DSC_KEYIN,
          TRANSTKD.TRD_DSC_KEYINV,
          TRANSTKD.TRD_G_KEYIN,
          TRANSTKD.TRD_G_SELL,
          TRANSTKD.TRD_G_VAT,
          TRANSTKD.TRD_G_AMT,
          TRANSTKD.TRD_TDSC_KEYINV,
          TRANSTKD.TRD_N_SELL,
          TRANSTKD.TRD_N_VAT,
          TRANSTKD.TRD_N_AMT,
          TRANSTKD.TRD_B_SELL,
          TRANSTKD.TRD_B_VAT,
          TRANSTKD.TRD_B_AMT,
          TRANSTKD.TRD_B_UPRC,
          TRANSTKD.TRD_REFER_REF,
          TRANSTKD.TRD_REFER_DATE,
          DOCINFO.DI_KEY,
          DOCINFO.DI_ACTIVE,
          DOCTYPE.DT_PRINT_CANCEL,
          DOCTYPE.DT_REPRT_POS,
          TRANSTKD.TRD_G_KEYIN AS DI_TOTAL,
          APPRICETAB.APPRB_CODE,
          APPRICETAB.APPRB_NAME,
          BRANCH.BR_CODE,
          BRANCH.BR_THAIDESC,
          WL.WLCODE AS TRD_TO_WL
        FROM DOCINFO
        JOIN DOCTYPE ON DOCINFO.DI_DT = DOCTYPE.DT_KEY
        JOIN TRANSTKH ON DOCINFO.DI_KEY = TRANSTKH.TRH_DI
        JOIN TRANSTKD ON TRANSTKH.TRH_KEY = TRANSTKD.TRD_TRH
        JOIN DEPTTAB ON TRANSTKH.TRH_DEPT = DEPTTAB.DEPT_KEY
        JOIN PRJTAB ON TRANSTKH.TRH_PRJ = PRJTAB.PRJ_KEY
        JOIN BRANCH ON TRANSTKH.TRH_BR = BRANCH.BR_KEY
        JOIN SKUMASTER ON TRANSTKD.TRD_SKU = SKUMASTER.SKU_KEY
        JOIN GOODSMASTER ON TRANSTKD.TRD_GOODS = GOODSMASTER.GOODS_KEY
        JOIN WARELOCATION ON TRANSTKD.TRD_WL = WARELOCATION.WL_KEY
        JOIN WAREHOUSE ON WARELOCATION.WL_WH = WAREHOUSE.WH_KEY
        JOIN ICCAT ON SKUMASTER.SKU_ICCAT = ICCAT.ICCAT_KEY
        JOIN BRAND ON SKUMASTER.SKU_BRN = BRAND.BRN_KEY
        JOIN ICDEPT ON SKUMASTER.SKU_ICDEPT = ICDEPT.ICDEPT_KEY
        JOIN ICCOLOR ON SKUMASTER.SKU_ICCOLOR = ICCOLOR.ICCOLOR_KEY
        JOIN ICSIZE ON SKUMASTER.SKU_ICSIZE = ICSIZE.ICSIZE_KEY
        JOIN SKUALT ON SKUMASTER.SKU_SKUALT = SKUALT.SKUALT_KEY
        JOIN (SELECT WL_KEY AS WLKEY, WL_CODE AS WLCODE FROM WARELOCATION) WL
          ON TRANSTKD.TRD_TO_WL = WL.WLKEY
        LEFT JOIN APPRICETAB ON TRANSTKH.TRH_ARPRB = APPRICETAB.APPRB_CODE
        WHERE
          DOCTYPE.DT_PROPERTIES = 310
          AND DOCINFO.DI_ACTIVE = 0
          AND ICCAT.ICCAT_CODE IN ('01','02','03','05','08','10')
          ${dateFilter}
          ${issueRefFilter}
          ${searchFilter}
      )
      SELECT TOP (@limitParam) *
      FROM Base
      WHERE 1=1
        ${cursorFilter}
      ORDER BY DI_DATE DESC, DI_REF ASC, TRD_SEQ ASC;
    `;

    const countRequest = connection.request();
    countRequest.input("dateFrom", sql.Date, dateFrom);
    countRequest.input("dateTo", sql.Date, dateTo);
    countRequest.input("issueRefs", sql.NVarChar, issueRefs || null);
    if (search) {
      countRequest.input("searchParam", sql.NVarChar, `%${search}%`);
    }

    const countQuery = `
      SELECT COUNT(1) AS totalRows
      FROM DOCINFO
      JOIN DOCTYPE ON DOCINFO.DI_DT = DOCTYPE.DT_KEY
      JOIN TRANSTKH ON DOCINFO.DI_KEY = TRANSTKH.TRH_DI
      JOIN TRANSTKD ON TRANSTKH.TRH_KEY = TRANSTKD.TRD_TRH
      JOIN DEPTTAB ON TRANSTKH.TRH_DEPT = DEPTTAB.DEPT_KEY
      JOIN PRJTAB ON TRANSTKH.TRH_PRJ = PRJTAB.PRJ_KEY
      JOIN BRANCH ON TRANSTKH.TRH_BR = BRANCH.BR_KEY
      JOIN SKUMASTER ON TRANSTKD.TRD_SKU = SKUMASTER.SKU_KEY
      JOIN GOODSMASTER ON TRANSTKD.TRD_GOODS = GOODSMASTER.GOODS_KEY
      JOIN WARELOCATION ON TRANSTKD.TRD_WL = WARELOCATION.WL_KEY
      JOIN WAREHOUSE ON WARELOCATION.WL_WH = WAREHOUSE.WH_KEY
      JOIN ICCAT ON SKUMASTER.SKU_ICCAT = ICCAT.ICCAT_KEY
      JOIN BRAND ON SKUMASTER.SKU_BRN = BRAND.BRN_KEY
      JOIN ICDEPT ON SKUMASTER.SKU_ICDEPT = ICDEPT.ICDEPT_KEY
      JOIN ICCOLOR ON SKUMASTER.SKU_ICCOLOR = ICCOLOR.ICCOLOR_KEY
      JOIN ICSIZE ON SKUMASTER.SKU_ICSIZE = ICSIZE.ICSIZE_KEY
      JOIN SKUALT ON SKUMASTER.SKU_SKUALT = SKUALT.SKUALT_KEY
      JOIN (SELECT WL_KEY AS WLKEY, WL_CODE AS WLCODE FROM WARELOCATION) WL
        ON TRANSTKD.TRD_TO_WL = WL.WLKEY
      LEFT JOIN APPRICETAB ON TRANSTKH.TRH_ARPRB = APPRICETAB.APPRB_CODE
      WHERE
        DOCTYPE.DT_PROPERTIES = 310
        AND DOCINFO.DI_ACTIVE = 0
        AND ICCAT.ICCAT_CODE IN ('01','02','03','05','08','10')
        ${dateFilter}
        ${issueRefFilter}
        ${searchFilter}
    `;

    const [dataResult, countResult] = await Promise.all([
      requestSql.query(dataQuery),
      includeTotal ? countRequest.query(countQuery) : Promise.resolve(null),
    ]);

    const totalRecords = countResult?.recordset?.[0]?.totalRows ?? null;
    let rows = dataResult.recordset ?? [];
    let hasMore = false;
    if (rows.length > pageSize) {
      hasMore = true;
      rows = rows.slice(0, pageSize);
    }
    const lastRow = rows[rows.length - 1];
    const nextCursor = lastRow
      ? encodeCursor({
          date: formatDateOnly(lastRow.DI_DATE),
          ref: lastRow.DI_REF,
          seq: lastRow.TRD_SEQ,
        })
      : null;

    res.json({
      data: rows,
      pagination: {
        page,
        pageSize,
        totalRecords,
        totalPages: totalRecords === null ? null : Math.max(1, Math.ceil(totalRecords / pageSize)),
      },
      cursor: {
        next: nextCursor,
        hasMore,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "SQL query failed", details: error.message });
  }
});

app.get("/api/employees", async (req, res) => {
  try {
    const search = req.query.search ? String(req.query.search).trim() : "";
    const department = req.query.department ? String(req.query.department).trim() : "";
    const status = req.query.status ? String(req.query.status).trim().toLowerCase() : "";
    const page = parsePositiveInt(req.query.page, 1);
    const pageSize = parsePositiveInt(req.query.pageSize, 20, 200);
    const { cursor, error } = resolveCursor(res, page, req.query.cursor, parseEmployeesCursor);
    if (error) {
      return;
    }
    const limit = pageSize + 1;
    const exact = req.query.exact === "true";

    const connection = await getHrPool();
    const dataRequest = connection.request();
    const countRequest = connection.request();

    dataRequest.input("limitParam", sql.Int, limit);

    if (search) {
      if (exact) {
        dataRequest.input("searchExact", sql.NVarChar, search);
        countRequest.input("searchExact", sql.NVarChar, search);
      } else {
        const searchParam = `%${search}%`;
        dataRequest.input("search", sql.NVarChar, searchParam);
        countRequest.input("search", sql.NVarChar, searchParam);
      }
    }
    if (department) {
      dataRequest.input("department", sql.NVarChar, department);
      countRequest.input("department", sql.NVarChar, department);
    }

    let statusFilter = "";
    if (status === "active") {
      statusFilter = "AND COALESCE(PAY.PRI_STATUS, 0) <> 2";
    } else if (status === "resigned") {
      statusFilter = "AND PAY.PRI_STATUS = 2";
    }
    if (cursor) {
      dataRequest.input("cursorEmpIntl", sql.NVarChar, cursor.empIntl);
      dataRequest.input("cursorEmpKey", sql.NVarChar, cursor.empKey);
    }

    const searchFilter = search
      ? (exact
        ? `AND (
            E.EMP_INTL = @searchExact COLLATE Thai_CI_AS
            OR P.PRS_NO = @searchExact COLLATE Thai_CI_AS
          )`
        : `AND (
            CAST(E.EMP_INTL AS NVARCHAR(50)) COLLATE Thai_CI_AS LIKE @search COLLATE Thai_CI_AS
            OR CAST(P.PRS_NO AS NVARCHAR(50)) COLLATE Thai_CI_AS LIKE @search COLLATE Thai_CI_AS
            OR (COALESCE(E.EMP_NAME, '') + ' ' + COALESCE(E.EMP_SURNME, '')) COLLATE Thai_CI_AS LIKE @search COLLATE Thai_CI_AS
            OR COALESCE(D.DEPT_CODE, '') COLLATE Thai_CI_AS LIKE @search COLLATE Thai_CI_AS
            OR COALESCE(D.DEPT_THAIDESC, '') COLLATE Thai_CI_AS LIKE @search COLLATE Thai_CI_AS
            OR COALESCE(ATT_DEPT.DEPTNAME, '') COLLATE Thai_CI_AS LIKE @search COLLATE Thai_CI_AS
            OR COALESCE(B.BR_THAIDESC, '') COLLATE Thai_CI_AS LIKE @search COLLATE Thai_CI_AS
          )`)
      : "";
    const departmentFilter = department
      ? `AND (
          COALESCE(D.DEPT_CODE, '') COLLATE Thai_CI_AS = @department COLLATE Thai_CI_AS
          OR CAST(D.DEPT_KEY AS NVARCHAR(50)) COLLATE Thai_CI_AS = @department COLLATE Thai_CI_AS
          OR COALESCE(D.DEPT_THAIDESC, '') COLLATE Thai_CI_AS = @department COLLATE Thai_CI_AS
          OR CAST(ATT_DEPT.DEPTID AS NVARCHAR(50)) COLLATE Thai_CI_AS = @department COLLATE Thai_CI_AS
          OR COALESCE(ATT_DEPT.DEPTNAME, '') COLLATE Thai_CI_AS = @department COLLATE Thai_CI_AS
        )`
      : "";
    const cursorFilter = cursor
      ? `AND (
          E.EMP_INTL > @cursorEmpIntl COLLATE Thai_CI_AS 
          OR (E.EMP_INTL = @cursorEmpIntl COLLATE Thai_CI_AS AND CAST(E.EMP_KEY AS NVARCHAR(100)) > @cursorEmpKey)
        )` 
      : "";

    const selectColumns = `
      E.EMP_INTL,
      E.EMP_KEY,
      E.EMP_NAME,
      E.EMP_SURNME,
      CAST(NULL AS DATE) AS EMP_BIRTH,
      CAST(NULL AS NVARCHAR(50)) AS EMP_I_CARD,
      CAST(NULL AS NVARCHAR(50)) AS EMP_TAX_ID,
      CAST(NULL AS NVARCHAR(50)) AS EMP_MARITAL,
      CAST(NULL AS NVARCHAR(50)) AS EMP_GENDER,
      CAST(NULL AS NVARCHAR(100)) AS FML_ORIGIN,
      CAST(NULL AS NVARCHAR(100)) AS FML_NATNALTY,
      CAST(NULL AS NVARCHAR(100)) AS FML_RELIGION,
      P.PRS_NO,
      CAST(NULL AS NVARCHAR(100)) AS PRS_BANK_AC,
      CAST(NULL AS NVARCHAR(100)) AS PRS_SC_NO,
      PAY.PRI_START_D,
      PAY.PRI_STATUS,
      D.DEPT_CODE,
      COALESCE(
        NULLIF(LTRIM(RTRIM(D.DEPT_THAIDESC COLLATE Thai_CI_AS)), ''),
        NULLIF(LTRIM(RTRIM(ATT_DEPT.DEPTNAME COLLATE Thai_CI_AS)), '')
      ) AS DEPT_THAIDESC,
      CAST(NULL AS INT) AS TAX_CHDNE_WSP,
      CAST(NULL AS INT) AS TAX_CHDNE_NSP,
      CAST(NULL AS INT) AS TAX_CHDWE_WSP,
      CAST(NULL AS INT) AS TAX_CHDWE_NSP,
      CAST(NULL AS NVARCHAR(100)) AS BANK_INITIAL,
      B.BR_CODE,
      B.BR_THAIDESC,
      CAST(NULL AS NVARCHAR(200)) AS JBT_THAIDESC
    `;

    const baseFromClause = `
      FROM [BPLUSHRM_KPF].[dbo].[EMPFILE] E
      JOIN [BPLUSHRM_KPF].[dbo].[PERSONALINFO] P
        ON CAST(E.EMP_KEY AS NVARCHAR(100)) COLLATE Thai_CI_AS
          = CAST(P.PRS_EMP AS NVARCHAR(100)) COLLATE Thai_CI_AS
      LEFT JOIN [BPLUSHRM_KPF].[dbo].[PAYROLLINFO] PAY
        ON CAST(E.EMP_KEY AS NVARCHAR(100)) COLLATE Thai_CI_AS
          = CAST(PAY.PRI_EMP AS NVARCHAR(100)) COLLATE Thai_CI_AS
      LEFT JOIN [BPLUSHRM_KPF].[dbo].[DEPTTAB] D
        ON CAST(P.PRS_DEPT AS NVARCHAR(100)) COLLATE Thai_CI_AS
          = CAST(D.DEPT_KEY AS NVARCHAR(100)) COLLATE Thai_CI_AS
      LEFT JOIN [BPLUSHRM_KPF].[dbo].[BRANCH] B
        ON CAST(P.PRS_BR AS NVARCHAR(100)) COLLATE Thai_CI_AS
          = CAST(B.BR_KEY AS NVARCHAR(100)) COLLATE Thai_CI_AS
      OUTER APPLY (
        SELECT TOP (1)
          AD.DEPTID,
          AD.DEPTNAME
        FROM [Pm2014_SU].[dbo].[USERINFO] U
        LEFT JOIN [Pm2014_SU].[dbo].[DEPARTMENTS] AD
          ON AD.DEPTID = U.DEFAULTDEPTID
        WHERE REPLACE(REPLACE(REPLACE(REPLACE(UPPER(COALESCE(U.SSN, '')), 'KPF', ''), '-', ''), ' ', ''), '.', '') COLLATE Thai_CI_AS
          = REPLACE(REPLACE(REPLACE(REPLACE(UPPER(COALESCE(P.PRS_NO, '')), 'KPF', ''), '-', ''), ' ', ''), '.', '') COLLATE Thai_CI_AS
        ORDER BY U.USERID
      ) ATT_DEPT
      WHERE E.EMP_INTL IS NOT NULL
        ${statusFilter}
        ${searchFilter}
        ${departmentFilter}
    `;

    const dataQuery = `
      SELECT DISTINCT TOP (@limitParam) ${selectColumns}
      ${baseFromClause}
        ${cursorFilter}
      ORDER BY E.EMP_INTL ASC, E.EMP_KEY ASC;
    `;

    const countQuery = `
      SELECT COUNT(1) AS totalRows
      ${baseFromClause};
    `;

    const [dataResult, countResult] = await Promise.all([
      dataRequest.query(dataQuery),
      countRequest.query(countQuery),
    ]);

    const totalRecords = countResult.recordset[0]?.totalRows || 0;
    let rows = dataResult.recordset ?? [];
    let hasMore = false;
    if (rows.length > pageSize) {
      hasMore = true;
      rows = rows.slice(0, pageSize);
    }
    const lastRow = rows[rows.length - 1];
    const nextCursor = lastRow
      ? encodeCursor({
          empIntl: String(lastRow.EMP_INTL).trim(),
          empKey: String(lastRow.EMP_KEY).trim(),
        })
      : null;

    res.json({
      data: rows,
      pagination: {
        page,
        pageSize,
        totalRecords,
        totalPages: Math.max(1, Math.ceil(totalRecords / pageSize)),
      },
      cursor: {
        next: nextCursor,
        hasMore,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "SQL query failed", details: error.message });
  }
});

app.get("/api/attendance", async (req, res) => {
  try {
    const badgenumber = req.query.badgenumber ? String(req.query.badgenumber) : "";
    const page = parsePositiveInt(req.query.page, 1);
    const pageSize = parsePositiveInt(req.query.pageSize, 20, 200);
    const { cursor, error } = resolveCursor(res, page, req.query.cursor, parseAttendanceCursor);
    if (error) {
      return;
    }
    const limit = pageSize + 1;

    const connection = await getHrPool();
    const requestSql = connection.request();
    requestSql.input("limitParam", sql.Int, limit);

    let whereClause = "";
    if (badgenumber) {
      whereClause = "WHERE U.Badgenumber LIKE @badgenumber";
      requestSql.input("badgenumber", sql.VarChar, `%${badgenumber}%`);
    }
    if (cursor) {
      requestSql.input("cursorDate", sql.Date, cursor.date);
      requestSql.input("cursorBadgenumber", sql.VarChar, cursor.badgenumber);
    }

    const cursorFilter = cursor
      ? "AND (CheckDate < @cursorDate OR (CheckDate = @cursorDate AND Badgenumber > @cursorBadgenumber))"
      : "";

    const fromAndJoin = `
      FROM [Pm2014_SU].[dbo].[USERINFO] U
      JOIN [Pm2014_SU].[dbo].[DEPARTMENTS] D ON D.DEPTID = U.DEFAULTDEPTID
      JOIN [Pm2014_SU].[dbo].[CHECKINOUT] C ON C.Badgenumber = U.Badgenumber
    `;

    const countQuery = `
      SELECT COUNT(*) as Total FROM (
        SELECT U.Badgenumber, CAST(C.CHECKTIME AS DATE) as CheckDate
        ${fromAndJoin}
        ${whereClause}
        GROUP BY U.Badgenumber, CAST(C.CHECKTIME AS DATE)
      ) AS GroupedRecords
    `;

    const countResult = await requestSql.query(countQuery);
    const totalRecords = countResult.recordset[0]?.Total || 0;

    const dataQuery = `
      WITH Grouped AS (
        SELECT
          U.Badgenumber,
          U.Name,
          U.SSN,
          D.DEPTNAME,
          CAST(C.CHECKTIME AS DATE) AS CheckDate,
          MIN(C.CHECKTIME) AS CheckIn,
          MAX(C.CHECKTIME) AS CheckOut
        ${fromAndJoin}
        ${whereClause}
        GROUP BY U.Badgenumber, U.Name, U.SSN, D.DEPTNAME, CAST(C.CHECKTIME AS DATE)
      )
      SELECT TOP (@limitParam)
        Badgenumber,
        Name,
        SSN,
        DEPTNAME,
        FORMAT(CheckDate, 'yyyy-MM-dd') as DateStr,
        FORMAT(CheckIn, 'HH:mm:ss') as CheckIn,
        FORMAT(CheckOut, 'HH:mm:ss') as CheckOut
      FROM Grouped
      WHERE 1=1
        ${cursorFilter}
      ORDER BY CheckDate DESC, Badgenumber ASC
    `;

    const result = await requestSql.query(dataQuery);

    let rows = result.recordset ?? [];
    let hasMore = false;
    if (rows.length > pageSize) {
      hasMore = true;
      rows = rows.slice(0, pageSize);
    }
    const lastRow = rows[rows.length - 1];
    const nextCursor = lastRow
      ? encodeCursor({ date: lastRow.DateStr, badgenumber: lastRow.Badgenumber })
      : null;

    res.json({
      data: rows,
      pagination: {
        page,
        pageSize,
        totalRecords,
        totalPages: Math.ceil(totalRecords / pageSize),
      },
      cursor: {
        next: nextCursor,
        hasMore,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "SQL query failed", details: error.message });
  }
});

app.get("/api/hr-departments", async (req, res) => {
  try {
    const buildDepartmentsQuery = ({ qualified }) => {
      const deptTab = qualified ? "[BPLUSHRM_KPF].[dbo].[DEPTTAB]" : "[dbo].[DEPTTAB]";

      return `
      SELECT DISTINCT
        D.DEPT_CODE,
        D.DEPT_KEY,
        D.DEPT_THAIDESC
      FROM ${deptTab} D
      WHERE D.DEPT_THAIDESC IS NOT NULL
        AND DATALENGTH(LTRIM(RTRIM(D.DEPT_THAIDESC))) > 0
      ORDER BY D.DEPT_THAIDESC COLLATE Thai_CI_AS;
    `;
    };

    const queryCandidates = [
      { name: "hr-qualified", getPool: getHrPool, qualified: true },
      { name: "hr-current-db", getPool: getHrPool, qualified: false },
      { name: "erp-qualified", getPool: getErpPool, qualified: true },
    ];
    const failures = [];
    let result = null;

    for (const candidate of queryCandidates) {
      try {
        const connection = await candidate.getPool();
        result = await connection.request().query(buildDepartmentsQuery(candidate));
        break;
      } catch (error) {
        failures.push(`${candidate.name}: ${error.message}`);
      }
    }

    if (!result) {
      throw new Error(failures.join(" | "));
    }

    const departments = (result.recordset ?? []).map((row) => ({
      id: row.DEPT_CODE ? String(row.DEPT_CODE).trim() : String(row.DEPT_KEY),
      name: row.DEPT_THAIDESC,
      source: "hr",
      external_code: row.DEPT_CODE ? String(row.DEPT_CODE).trim() : null,
    }));

    res.json({ departments });
  } catch (error) {
    res.status(500).json({ error: "SQL query failed", details: error.message });
  }
});

app.get("/api/department-lookup-27", async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page || "1", 10), 1);
    const pageSize = Math.min(
      Math.max(parseInt(req.query.pageSize || "100", 10), 1),
      500
    );
    const offset = (page - 1) * pageSize;
    const search = String(req.query.search || "").trim();

    const connection = await getErpPool();
    const normalizedFilter = search ? `%${search}%` : "";

    const baseQuery = `
      WITH distinct_departments AS (
        SELECT
          NULLIF(LTRIM(RTRIM(COALESCE(DEPTTAB.DEPT_CODE, ''))), '') AS DEPT_CODE,
          MIN(NULLIF(LTRIM(RTRIM(COALESCE(DEPTTAB.DEPT_THAIDESC, ''))), '')) AS DEPT_THAIDESC
        FROM MISCLOOKUP, DEPTTAB
        WHERE LOOKUP_TYPE = 27
          AND (
            @search = ''
            OR LTRIM(RTRIM(COALESCE(DEPTTAB.DEPT_CODE, ''))) LIKE @search
            OR LTRIM(RTRIM(COALESCE(DEPTTAB.DEPT_THAIDESC, ''))) LIKE @search
          )
        GROUP BY
          NULLIF(LTRIM(RTRIM(COALESCE(DEPTTAB.DEPT_CODE, ''))), '')
      )
    `;

    const countQuery = `
      ${baseQuery}
      SELECT COUNT(1) AS totalRecords
      FROM distinct_departments;
    `;

    const dataQuery = `
      ${baseQuery}
      SELECT
        DEPT_CODE,
        DEPT_THAIDESC
      FROM distinct_departments
      ORDER BY
        COALESCE(DEPT_CODE, ''),
        COALESCE(DEPT_THAIDESC, '')
      OFFSET @offset ROWS
      FETCH NEXT @pageSize ROWS ONLY;
    `;

    const [countResult, dataResult] = await Promise.all([
      connection.request()
        .input("search", sql.NVarChar, normalizedFilter)
        .query(countQuery),
      connection.request()
        .input("offset", sql.Int, offset)
        .input("pageSize", sql.Int, pageSize)
        .input("search", sql.NVarChar, normalizedFilter)
        .query(dataQuery),
    ]);

    const totalRecords = Number(countResult.recordset?.[0]?.totalRecords || 0);

    res.json({
      data: dataResult.recordset ?? [],
      pagination: {
        page,
        pageSize,
        totalRecords,
        totalPages: Math.max(1, Math.ceil(totalRecords / pageSize)),
      },
    });
  } catch (error) {
    res.status(500).json({ error: "SQL query failed", details: error.message });
  }
});

app.get("/api/consolidated-lookup", async (req, res) => {
  try {
    const employeeCode = req.query.employeeCode
      ? String(req.query.employeeCode).trim()
      : "";
    if (!employeeCode) {
      res.status(400).json({ error: "employeeCode is required" });
      return;
    }

    const targetDate = req.query.date || new Date().toISOString().split("T")[0];
    const connection = await getHrPool();
    const requestSql = connection.request();
    requestSql.input("employeeCode", sql.NVarChar, employeeCode);
    requestSql.input(
      "employeeCodeNormalized",
      sql.NVarChar,
      employeeCode.toUpperCase().replace(/KPF/g, "").replace(/[^A-Z0-9]/g, "")
    );
    requestSql.input("targetDate", sql.Date, targetDate);
    const fingerRequestSql = connection.request();
    fingerRequestSql.input(
      "employeeCodeNormalized",
      sql.NVarChar,
      employeeCode.toUpperCase().replace(/KPF/g, "").replace(/[^A-Z0-9]/g, "")
    );
    fingerRequestSql.input("targetDate", sql.Date, targetDate);

    const query = `
      WITH EmployeeBase AS (
        SELECT TOP (1)
          P.PRS_NO,
          REPLACE(REPLACE(REPLACE(REPLACE(UPPER(COALESCE(P.PRS_NO, '')), 'KPF', ''), '-', ''), ' ', ''), '.', '') AS PRS_NO_NORMALIZED,
          RTRIM(LTRIM(E.EMP_NAME)) + ' ' + RTRIM(LTRIM(E.EMP_SURNME)) AS FullName,
          D.DEPT_THAIDESC,
          B.BR_THAIDESC
        FROM [BPLUSHRM_KPF].[dbo].[PERSONALINFO] P
        JOIN [BPLUSHRM_KPF].[dbo].[EMPFILE] E
          ON CAST(E.EMP_KEY AS NVARCHAR(100)) COLLATE Thai_CI_AS
            = CAST(P.PRS_EMP AS NVARCHAR(100)) COLLATE Thai_CI_AS
        LEFT JOIN [BPLUSHRM_KPF].[dbo].[DEPTTAB] D
          ON CAST(P.PRS_DEPT AS NVARCHAR(100)) COLLATE Thai_CI_AS
            = CAST(D.DEPT_KEY AS NVARCHAR(100)) COLLATE Thai_CI_AS
        LEFT JOIN [BPLUSHRM_KPF].[dbo].[BRANCH] B
          ON CAST(P.PRS_BR AS NVARCHAR(100)) COLLATE Thai_CI_AS
            = CAST(B.BR_KEY AS NVARCHAR(100)) COLLATE Thai_CI_AS
        LEFT JOIN [BPLUSHRM_KPF].[dbo].[PAYROLLINFO] PAY
          ON CAST(E.EMP_KEY AS NVARCHAR(100)) COLLATE Thai_CI_AS
            = CAST(PAY.PRI_EMP AS NVARCHAR(100)) COLLATE Thai_CI_AS
        WHERE REPLACE(REPLACE(REPLACE(REPLACE(UPPER(COALESCE(P.PRS_NO, '')), 'KPF', ''), '-', ''), ' ', ''), '.', '')
          = @employeeCodeNormalized
        ORDER BY
          CASE WHEN PAY.PRI_STATUS != 2 THEN 0 ELSE 1 END,
          E.EMP_KEY DESC
      ),
      Attendance AS (
        SELECT
          U.SSN,
          REPLACE(REPLACE(REPLACE(REPLACE(UPPER(COALESCE(U.SSN, '')), 'KPF', ''), '-', ''), ' ', ''), '.', '') AS SSN_NORMALIZED,
          CAST(C.CHECKTIME AS DATE) AS CheckDate,
          MIN(C.CHECKTIME) AS CheckIn,
          MAX(C.CHECKTIME) AS CheckOut
        FROM [Pm2014_SU].[dbo].[CHECKINOUT] C
        JOIN [Pm2014_SU].[dbo].[USERINFO] U ON C.Badgenumber = U.Badgenumber
        WHERE REPLACE(REPLACE(REPLACE(REPLACE(UPPER(COALESCE(U.SSN, '')), 'KPF', ''), '-', ''), ' ', ''), '.', '')
          = @employeeCodeNormalized
          AND C.CHECKTIME >= @targetDate
          AND C.CHECKTIME < DATEADD(day, 1, @targetDate)
        GROUP BY U.SSN, REPLACE(REPLACE(REPLACE(REPLACE(UPPER(COALESCE(U.SSN, '')), 'KPF', ''), '-', ''), ' ', ''), '.', ''), CAST(C.CHECKTIME AS DATE)
      )
      SELECT TOP (1)
        COALESCE(EB.PRS_NO, @employeeCode) AS PRS_NO,
        EB.FullName AS Name,
        EB.DEPT_THAIDESC,
        EB.BR_THAIDESC,
        FORMAT(A.CheckIn, 'HH:mm:ss') AS CheckIn,
        FORMAT(A.CheckOut, 'HH:mm:ss') AS CheckOut,
        FORMAT(@targetDate, 'yyyy-MM-dd') AS DateStr
      FROM (SELECT 1 AS anchor) Base
      LEFT JOIN EmployeeBase EB
        ON 1 = 1
      LEFT JOIN Attendance A
        ON (EB.PRS_NO_NORMALIZED COLLATE Thai_CI_AS = A.SSN_NORMALIZED COLLATE Thai_CI_AS)
        OR EB.PRS_NO IS NULL
      WHERE EB.PRS_NO IS NOT NULL
        OR A.CheckIn IS NOT NULL
        OR A.CheckOut IS NOT NULL;
    `;

    const fingerQuery = `
      SELECT
        FORMAT(C.CHECKTIME, 'HH:mm:ss') AS CheckTime
      FROM [Pm2014_SU].[dbo].[CHECKINOUT] C
      JOIN [Pm2014_SU].[dbo].[USERINFO] U ON C.Badgenumber = U.Badgenumber
      WHERE REPLACE(REPLACE(REPLACE(REPLACE(UPPER(COALESCE(U.SSN, '')), 'KPF', ''), '-', ''), ' ', ''), '.', '')
        = @employeeCodeNormalized
        AND C.CHECKTIME >= @targetDate
        AND C.CHECKTIME < DATEADD(day, 1, @targetDate)
      ORDER BY C.CHECKTIME ASC;
    `;

    const [result, fingerResult] = await Promise.all([
      requestSql.query(query),
      fingerRequestSql.query(fingerQuery),
    ]);
    const row = result.recordset?.[0] ?? null;
    if (!row) {
      res.status(404).json({ error: "Employee not found" });
      return;
    }

    const fingerSummary = buildAttendanceFingerSummary(fingerResult.recordset ?? []);

    res.json({
      data: {
        ...row,
        ...fingerSummary,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "SQL query failed", details: error.message });
  }
});

app.get("/api/consolidated-lookup-batch", async (req, res) => {
  try {
    const items = buildRequestedLookupItems(JSON.parse(String(req.query.items || "[]")));
    if (!items.length) {
      res.json({ data: [] });
      return;
    }

    if (items.length > 100) {
      res.status(400).json({ error: "Batch size must not exceed 100 items" });
      return;
    }

    const connection = await getHrPool();
    const summaryRequestSql = connection.request();
    const fingerRequestSql = connection.request();
    const requestedCteSql = buildRequestedLookupsCte(summaryRequestSql, items);
    const requestedFingerCteSql = buildRequestedLookupsCte(fingerRequestSql, items);

    const summaryQuery = `
      WITH Requested AS (
        ${requestedCteSql}
      ),
      EmployeeBase AS (
        SELECT
          R.EmployeeCode,
          R.EmployeeCodeNormalized,
          R.TargetDate,
          P.PRS_NO,
          RTRIM(LTRIM(E.EMP_NAME)) + ' ' + RTRIM(LTRIM(E.EMP_SURNME)) AS FullName,
          D.DEPT_THAIDESC,
          B.BR_THAIDESC,
          ROW_NUMBER() OVER (
            PARTITION BY R.EmployeeCodeNormalized, R.TargetDate
            ORDER BY CASE WHEN PAY.PRI_STATUS != 2 THEN 0 ELSE 1 END, E.EMP_KEY DESC
          ) AS RowRank
        FROM Requested R
        JOIN [BPLUSHRM_KPF].[dbo].[PERSONALINFO] P
          ON REPLACE(REPLACE(REPLACE(REPLACE(UPPER(COALESCE(P.PRS_NO, '')), 'KPF', ''), '-', ''), ' ', ''), '.', '')
            = R.EmployeeCodeNormalized
        JOIN [BPLUSHRM_KPF].[dbo].[EMPFILE] E
          ON CAST(E.EMP_KEY AS NVARCHAR(100)) COLLATE Thai_CI_AS
            = CAST(P.PRS_EMP AS NVARCHAR(100)) COLLATE Thai_CI_AS
        LEFT JOIN [BPLUSHRM_KPF].[dbo].[DEPTTAB] D
          ON CAST(P.PRS_DEPT AS NVARCHAR(100)) COLLATE Thai_CI_AS
            = CAST(D.DEPT_KEY AS NVARCHAR(100)) COLLATE Thai_CI_AS
        LEFT JOIN [BPLUSHRM_KPF].[dbo].[BRANCH] B
          ON CAST(P.PRS_BR AS NVARCHAR(100)) COLLATE Thai_CI_AS
            = CAST(B.BR_KEY AS NVARCHAR(100)) COLLATE Thai_CI_AS
        LEFT JOIN [BPLUSHRM_KPF].[dbo].[PAYROLLINFO] PAY
          ON CAST(E.EMP_KEY AS NVARCHAR(100)) COLLATE Thai_CI_AS
            = CAST(PAY.PRI_EMP AS NVARCHAR(100)) COLLATE Thai_CI_AS
      ),
      EmployeeSelected AS (
        SELECT *
        FROM EmployeeBase
        WHERE RowRank = 1
      ),
      AttendanceSummary AS (
        SELECT
          R.EmployeeCodeNormalized,
          R.TargetDate,
          MIN(C.CHECKTIME) AS CheckIn,
          MAX(C.CHECKTIME) AS CheckOut
        FROM Requested R
        JOIN [Pm2014_SU].[dbo].[USERINFO] U
          ON REPLACE(REPLACE(REPLACE(REPLACE(UPPER(COALESCE(U.SSN, '')), 'KPF', ''), '-', ''), ' ', ''), '.', '')
            = R.EmployeeCodeNormalized
        JOIN [Pm2014_SU].[dbo].[CHECKINOUT] C
          ON C.Badgenumber = U.Badgenumber
        WHERE C.CHECKTIME >= R.TargetDate
          AND C.CHECKTIME < DATEADD(day, 1, R.TargetDate)
        GROUP BY R.EmployeeCodeNormalized, R.TargetDate
      )
      SELECT
        R.EmployeeCode,
        R.EmployeeCodeNormalized,
        CONVERT(VARCHAR(10), R.TargetDate, 23) AS DateStr,
        COALESCE(E.PRS_NO, R.EmployeeCode) AS PRS_NO,
        E.FullName AS Name,
        E.DEPT_THAIDESC,
        E.BR_THAIDESC,
        FORMAT(A.CheckIn, 'HH:mm:ss') AS CheckIn,
        FORMAT(A.CheckOut, 'HH:mm:ss') AS CheckOut
      FROM Requested R
      LEFT JOIN EmployeeSelected E
        ON E.EmployeeCodeNormalized = R.EmployeeCodeNormalized
        AND E.TargetDate = R.TargetDate
      LEFT JOIN AttendanceSummary A
        ON A.EmployeeCodeNormalized = R.EmployeeCodeNormalized
        AND A.TargetDate = R.TargetDate
      WHERE E.PRS_NO IS NOT NULL
        OR A.CheckIn IS NOT NULL
        OR A.CheckOut IS NOT NULL;
    `;

    const fingerQuery = `
      WITH Requested AS (
        ${requestedFingerCteSql}
      )
      SELECT
        R.EmployeeCodeNormalized,
        CONVERT(VARCHAR(10), R.TargetDate, 23) AS DateStr,
        FORMAT(C.CHECKTIME, 'HH:mm:ss') AS CheckTime
      FROM Requested R
      JOIN [Pm2014_SU].[dbo].[USERINFO] U
        ON REPLACE(REPLACE(REPLACE(REPLACE(UPPER(COALESCE(U.SSN, '')), 'KPF', ''), '-', ''), ' ', ''), '.', '')
          = R.EmployeeCodeNormalized
      JOIN [Pm2014_SU].[dbo].[CHECKINOUT] C
        ON C.Badgenumber = U.Badgenumber
      WHERE C.CHECKTIME >= R.TargetDate
        AND C.CHECKTIME < DATEADD(day, 1, R.TargetDate)
      ORDER BY R.EmployeeCodeNormalized, R.TargetDate, C.CHECKTIME ASC;
    `;

    const [summaryResult, fingerResult] = await Promise.all([
      summaryRequestSql.query(summaryQuery),
      fingerRequestSql.query(fingerQuery),
    ]);

    const summaryRows = Array.isArray(summaryResult.recordset) ? summaryResult.recordset : [];
    const fingerRows = Array.isArray(fingerResult.recordset) ? fingerResult.recordset : [];
    const fingerMap = new Map();

    fingerRows.forEach((row) => {
      const key = `${row.EmployeeCodeNormalized}|${row.DateStr}`;
      const entry = fingerMap.get(key) || [];
      entry.push({ CheckTime: row.CheckTime });
      fingerMap.set(key, entry);
    });

    const data = summaryRows.map((row) => {
      const key = `${row.EmployeeCodeNormalized}|${row.DateStr}`;
      return {
        ...row,
        ...buildAttendanceFingerSummary(fingerMap.get(key) || []),
      };
    });

    res.json({ data });
  } catch (error) {
    res.status(500).json({ error: "SQL query failed", details: error.message });
  }
});

app.get("/api/consolidated", async (req, res) => {
  try {
    const startDate = req.query.startDate || new Date().toISOString().split("T")[0];
    const endDate = req.query.endDate || new Date().toISOString().split("T")[0];
    const searchTerm = req.query.search ? String(req.query.search) : "";
    const normalizedSearchTerm = searchTerm
      ? searchTerm.toUpperCase().replace(/KPF/g, "").replace(/[^A-Z0-9]/g, "")
      : "";
    const department = req.query.department ? String(req.query.department) : "";
    const branch = req.query.branch ? String(req.query.branch) : "";
    const page = parsePositiveInt(req.query.page, 1);
    const pageSize = parsePositiveInt(req.query.pageSize, 20, 200);
    const { cursor, error } = resolveCursor(res, page, req.query.cursor, parseConsolidatedCursor);
    if (error) {
      return;
    }
    const limit = pageSize + 1;

    const connection = await getHrPool();
    const createConsolidatedRequest = () => {
      const requestSql = connection.request();
      requestSql.input("startDate", sql.Date, startDate);
      requestSql.input("endDate", sql.Date, endDate);
      requestSql.input("limitParam", sql.Int, limit);
      if (searchTerm) requestSql.input("search", sql.NVarChar, `%${searchTerm}%`);
      if (searchTerm) requestSql.input("searchNormalized", sql.NVarChar, `%${normalizedSearchTerm || searchTerm.toUpperCase()}%`);
      if (department) requestSql.input("department", sql.NVarChar, department);
      if (branch) requestSql.input("branch", sql.NVarChar, branch);
      if (cursor) {
        requestSql.input("cursorDate", sql.Date, cursor.date);
        requestSql.input("cursorPrsNo", sql.NVarChar, cursor.prsNo);
      }
      return requestSql;
    };

    const whereClause = `
      WHERE 1=1
      ${searchTerm ? "AND (HR.FullName LIKE @search OR HR.PRS_NO LIKE @search OR HR.DEPT_THAIDESC LIKE @search OR HR.BR_THAIDESC LIKE @search OR HR.PRS_NO_NORMALIZED LIKE @searchNormalized OR T.SSN_NORMALIZED LIKE @searchNormalized)" : ""}
      ${department ? "AND HR.DEPT_THAIDESC COLLATE Thai_CI_AS = @department COLLATE Thai_CI_AS" : ""}
      ${branch ? "AND HR.BR_THAIDESC COLLATE Thai_CI_AS = @branch COLLATE Thai_CI_AS" : ""}
    `;
    const cursorFilter = cursor
      ? "AND (T.CheckDate < @cursorDate OR (T.CheckDate = @cursorDate AND HR.PRS_NO > @cursorPrsNo))"
      : "";

    const ctes = `
      WITH ActiveEmployees AS (
        SELECT
          P.PRS_NO,
          REPLACE(REPLACE(REPLACE(REPLACE(UPPER(COALESCE(P.PRS_NO, '')), 'KPF', ''), '-', ''), ' ', ''), '.', '') AS PRS_NO_NORMALIZED,
          RTRIM(LTRIM(E.EMP_NAME)) + ' ' + RTRIM(LTRIM(E.EMP_SURNME)) AS FullName,
          D.DEPT_THAIDESC,
          B.BR_THAIDESC
        FROM [BPLUSHRM_KPF].[dbo].[EMPFILE] E
        JOIN [BPLUSHRM_KPF].[dbo].[PERSONALINFO] P
          ON CAST(E.EMP_KEY AS NVARCHAR(100)) COLLATE Thai_CI_AS
            = CAST(P.PRS_EMP AS NVARCHAR(100)) COLLATE Thai_CI_AS
        LEFT JOIN [BPLUSHRM_KPF].[dbo].[DEPTTAB] D
          ON CAST(P.PRS_DEPT AS NVARCHAR(100)) COLLATE Thai_CI_AS
            = CAST(D.DEPT_KEY AS NVARCHAR(100)) COLLATE Thai_CI_AS
        LEFT JOIN [BPLUSHRM_KPF].[dbo].[BRANCH] B
          ON CAST(P.PRS_BR AS NVARCHAR(100)) COLLATE Thai_CI_AS
            = CAST(B.BR_KEY AS NVARCHAR(100)) COLLATE Thai_CI_AS
        LEFT JOIN [BPLUSHRM_KPF].[dbo].[PAYROLLINFO] PAY
          ON CAST(E.EMP_KEY AS NVARCHAR(100)) COLLATE Thai_CI_AS
            = CAST(PAY.PRI_EMP AS NVARCHAR(100)) COLLATE Thai_CI_AS
        WHERE PAY.PRI_STATUS != 2
      ),
      AttendanceData AS (
        SELECT
          U.Name,
          U.SSN,
          REPLACE(REPLACE(REPLACE(REPLACE(UPPER(COALESCE(U.SSN, '')), 'KPF', ''), '-', ''), ' ', ''), '.', '') AS SSN_NORMALIZED,
          CAST(C.CHECKTIME AS DATE) AS CheckDate,
          MIN(C.CHECKTIME) AS CheckIn,
          MAX(C.CHECKTIME) AS CheckOut
        FROM [Pm2014_SU].[dbo].[CHECKINOUT] C
        JOIN [Pm2014_SU].[dbo].[USERINFO] U ON C.Badgenumber = U.Badgenumber
        WHERE C.CHECKTIME >= @startDate AND C.CHECKTIME < DATEADD(day, 1, @endDate)
        GROUP BY U.Name, U.SSN, REPLACE(REPLACE(REPLACE(REPLACE(UPPER(COALESCE(U.SSN, '')), 'KPF', ''), '-', ''), ' ', ''), '.', ''), CAST(C.CHECKTIME AS DATE)
      )
    `;

    const countQuery = `
      ${ctes}
      SELECT COUNT(*) AS TotalFiltered
      FROM ActiveEmployees HR
      JOIN AttendanceData T
        ON HR.PRS_NO_NORMALIZED COLLATE Thai_CI_AS = T.SSN_NORMALIZED COLLATE Thai_CI_AS
      ${whereClause}
    `;

    const dataQuery = `
      ${ctes}
      SELECT TOP (@limitParam)
        FORMAT(T.CheckDate, 'yyyy-MM-dd') AS DateStr,
        HR.PRS_NO,
        HR.FullName AS Name,
        HR.DEPT_THAIDESC,
        HR.BR_THAIDESC,
        FORMAT(T.CheckIn, 'HH:mm:ss') AS CheckIn,
        FORMAT(T.CheckOut, 'HH:mm:ss') AS CheckOut
      FROM ActiveEmployees HR
      JOIN AttendanceData T
        ON HR.PRS_NO_NORMALIZED COLLATE Thai_CI_AS = T.SSN_NORMALIZED COLLATE Thai_CI_AS
      ${whereClause}
      ${cursorFilter}
      ORDER BY T.CheckDate DESC, HR.PRS_NO ASC
    `;

    const metaCountQuery = `SELECT COUNT(*) AS TotalActive FROM [BPLUSHRM_KPF].[dbo].[EMPFILE] E JOIN [BPLUSHRM_KPF].[dbo].[PAYROLLINFO] PAY ON CAST(E.EMP_KEY AS NVARCHAR(100)) COLLATE Thai_CI_AS = CAST(PAY.PRI_EMP AS NVARCHAR(100)) COLLATE Thai_CI_AS WHERE PAY.PRI_STATUS != 2`;
    const metaDeptQuery = `SELECT DISTINCT D.DEPT_THAIDESC FROM [BPLUSHRM_KPF].[dbo].[DEPTTAB] D WHERE D.DEPT_THAIDESC IS NOT NULL AND DATALENGTH(LTRIM(RTRIM(D.DEPT_THAIDESC))) > 0 ORDER BY D.DEPT_THAIDESC COLLATE Thai_CI_AS`;
    const metaBranchQuery = `SELECT DISTINCT B.BR_THAIDESC FROM [BPLUSHRM_KPF].[dbo].[BRANCH] B WHERE B.BR_THAIDESC IS NOT NULL AND DATALENGTH(LTRIM(RTRIM(B.BR_THAIDESC))) > 0 ORDER BY B.BR_THAIDESC COLLATE Thai_CI_AS`;

    const dataResult = await createConsolidatedRequest().query(dataQuery);
    const countResult = await createConsolidatedRequest().query(countQuery);
    const metaCountResult = await connection.request().query(metaCountQuery);
    const deptResult = await connection.request().query(metaDeptQuery);
    const branchResult = await connection.request().query(metaBranchQuery);

    const totalFiltered = countResult.recordset[0]?.TotalFiltered || 0;
    let rows = dataResult.recordset ?? [];
    let hasMore = false;
    if (rows.length > pageSize) {
      hasMore = true;
      rows = rows.slice(0, pageSize);
    }

    const lastRow = rows[rows.length - 1];
    const nextCursor =
      lastRow && lastRow.DateStr && lastRow.PRS_NO
        ? encodeCursor({ date: lastRow.DateStr, prsNo: String(lastRow.PRS_NO) })
        : null;

    res.json({
      data: rows,
      pagination: {
        page,
        pageSize,
        totalRecords: totalFiltered,
        totalPages: Math.ceil(totalFiltered / pageSize),
      },
      cursor: {
        next: nextCursor,
        hasMore,
      },
      meta: {
        totalActive: metaCountResult.recordset[0]?.TotalActive || 0,
        departments: deptResult.recordset.map((row) => row.DEPT_THAIDESC),
        branches: branchResult.recordset.map((row) => row.BR_THAIDESC),
      },
    });
  } catch (error) {
    res.status(500).json({ error: "SQL query failed", details: error.message });
  }
});

function scheduleProductsCacheSync() {
  const intervalMinutes = Number(process.env.PRODUCT_SYNC_INTERVAL_MINUTES || "0");
  if (!intervalMinutes || intervalMinutes <= 0) {
    return;
  }
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.log("products-cache sync disabled: missing supabase env");
    return;
  }

  const intervalMs = intervalMinutes * 60 * 1000;
  const runSync = async () => {
    try {
      const { synced, skipped } = await syncProductsCache();
      if (!skipped) {
        console.log(`products-cache sync: ${synced} rows`);
      }
    } catch (error) {
      console.error("products-cache sync failed", error.message);
    }
  };

  setTimeout(runSync, 5000);
  setInterval(runSync, intervalMs);
}

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(port, () => {
  console.log(`KPF API Gateway listening on port ${port}`);
  scheduleProductsCacheSync();
});
