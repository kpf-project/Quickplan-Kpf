const express = require("express");
const compression = require("compression");
const helmet = require("helmet");
const sql = require("mssql");
const dotenv = require("dotenv");
const fs = require("fs");

const envPath = fs.existsSync(".env.local") ? ".env.local" : ".env";
dotenv.config({ path: envPath });

const app = express();
app.set("trust proxy", 1);
app.use(helmet());
app.use(compression());

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
  res.set("Access-Control-Allow-Methods", "GET,OPTIONS");
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

let erpPool;
let hrPool;

async function getErpPool() {
  if (erpPool) {
    return erpPool;
  }

  erpPool = await new sql.ConnectionPool({
    server: process.env.DB_SERVER_KPF_ERP,
    database: process.env.DB_NAME_KPF_ERP,
    user: process.env.DB_USER_KPF_ERP,
    password: process.env.DB_PASSWORD_KPF_ERP,
    port: process.env.DB_PORT_KPF_ERP ? Number(process.env.DB_PORT_KPF_ERP) : 1433,
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

app.use("/api", requireAuth);

app.get("/api/raw-materials", async (req, res) => {
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

    const connection = await getErpPool();

    if (!dateFrom && !dateTo) {
      const now = new Date();
      const pad2 = (value) => String(value).padStart(2, "0");
      const startOfMonth = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
      const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
      dateFrom = startOfMonth;
      dateTo = today;
    }

    const dataRequest = connection.request();
    dataRequest.input("brandCodesParam", sql.NVarChar, brandCodes);
    dataRequest.input("iccatCodesParam", sql.NVarChar, iccatCodes);
    dataRequest.input("skuNameParam", sql.NVarChar, skuName);
    dataRequest.input("dateFromParam", sql.Date, dateFrom);
    dataRequest.input("dateToParam", sql.Date, dateTo);
    dataRequest.input("pageParam", sql.Int, page);
    dataRequest.input("pageSizeParam", sql.Int, pageSize);

    const dataQuery = `
      DECLARE @brandCodes NVARCHAR(MAX) = @brandCodesParam;
      DECLARE @iccatCodes NVARCHAR(MAX) = @iccatCodesParam;
      DECLARE @skuName NVARCHAR(255) = @skuNameParam;
      DECLARE @dateFrom DATE = @dateFromParam;
      DECLARE @dateTo DATE = @dateToParam;
      DECLARE @page INT = @pageParam;
      DECLARE @pageSize INT = @pageSizeParam;

      DECLARE @startRow INT = ((@page - 1) * @pageSize) + 1;
      DECLARE @endRow INT = @page * @pageSize;

      WITH RawBase AS (
        SELECT
          SKUMASTER.SKU_CODE,
          SKUMASTER.SKU_NAME,
          ICDEPT.ICDEPT_CODE,
          ICCAT.ICCAT_CODE,
          ICCAT.ICCAT_NAME,
          UTQ2.UTQ_NAME_1 AS UTQ_NAME,
          SKUMOVE.SKM_LOT_NO,
          SUM(SKUMOVE.SKM_QTY) / NULLIF(UTQ2.UTQ_QTY_1, 0) AS QTY
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
          AND WARELOCATION.WL_CODE IN ('OL', '1')
          AND (@brandCodes IS NULL OR BRAND.BRN_CODE IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@brandCodes, ',')))
          AND (@iccatCodes IS NULL OR ICCAT.ICCAT_CODE IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@iccatCodes, ',')))
          AND (@dateFrom IS NULL OR DOCINFO.DI_DATE >= @dateFrom)
          AND (@dateTo IS NULL OR DOCINFO.DI_DATE <= @dateTo)
          AND (@skuName IS NULL OR SKUMASTER.SKU_NAME LIKE '%' + @skuName + '%')
        GROUP BY
          SKUMASTER.SKU_CODE,
          SKUMASTER.SKU_NAME,
          BRAND.BRN_CODE,
          ICDEPT.ICDEPT_CODE,
          ICCAT.ICCAT_CODE,
          ICCAT.ICCAT_NAME,
          UTQ2.UTQ_NAME_1,
          UTQ2.UTQ_QTY_1,
          SKUMOVE.SKM_LOT_NO
        HAVING
          SUM(SKUMOVE.SKM_QTY) <> 0
      ),
      WithRowNum AS (
        SELECT
          SKU_CODE,
          SKU_NAME,
          ICDEPT_CODE,
          ICCAT_CODE,
          ICCAT_NAME,
          UTQ_NAME,
          SKM_LOT_NO,
          QTY,
          ROW_NUMBER() OVER (ORDER BY SKU_CODE ASC) AS rn
        FROM RawBase
      )
      SELECT
        SKU_CODE,
        SKU_NAME,
        ICDEPT_CODE,
        ICCAT_CODE,
        ICCAT_NAME,
        UTQ_NAME,
        SKM_LOT_NO,
        QTY
      FROM WithRowNum
      WHERE rn BETWEEN @startRow AND @endRow
      ORDER BY SKU_CODE ASC, SKM_LOT_NO ASC;
    `;

    const countRequest = connection.request();
    countRequest.input("brandCodesParam", sql.NVarChar, brandCodes);
    countRequest.input("iccatCodesParam", sql.NVarChar, iccatCodes);
    countRequest.input("skuNameParam", sql.NVarChar, skuName);
    countRequest.input("dateFromParam", sql.Date, dateFrom);
    countRequest.input("dateToParam", sql.Date, dateTo);
    const countQuery = `
      DECLARE @brandCodes NVARCHAR(MAX) = @brandCodesParam;
      DECLARE @iccatCodes NVARCHAR(MAX) = @iccatCodesParam;
      DECLARE @skuName NVARCHAR(255) = @skuNameParam;
      DECLARE @dateFrom DATE = @dateFromParam;
      DECLARE @dateTo DATE = @dateToParam;

      SELECT COUNT(1) AS totalRows
      FROM (
        SELECT SKUMASTER.SKU_CODE
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
          AND WARELOCATION.WL_CODE IN ('OL', '1')
          AND (@brandCodes IS NULL OR BRAND.BRN_CODE IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@brandCodes, ',')))
          AND (@iccatCodes IS NULL OR ICCAT.ICCAT_CODE IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@iccatCodes, ',')))
          AND (@dateFrom IS NULL OR DOCINFO.DI_DATE >= @dateFrom)
          AND (@dateTo IS NULL OR DOCINFO.DI_DATE <= @dateTo)
          AND (@skuName IS NULL OR SKUMASTER.SKU_NAME LIKE '%' + @skuName + '%')
        GROUP BY
          SKUMASTER.SKU_CODE,
          SKUMASTER.SKU_NAME,
          BRAND.BRN_CODE,
          ICDEPT.ICDEPT_CODE,
          ICCAT.ICCAT_CODE,
          ICCAT.ICCAT_NAME,
          UTQ2.UTQ_NAME_1,
          UTQ2.UTQ_QTY_1,
          SKUMOVE.SKM_LOT_NO
        HAVING
          SUM(SKUMOVE.SKM_QTY) <> 0
      ) AS grouped;
    `;

    const [dataResult, countResult] = await Promise.all([
      dataRequest.query(dataQuery),
      countRequest.query(countQuery),
    ]);

    const totalRecords = countResult.recordset[0]?.totalRows || 0;

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

app.get("/api/raw-materials-summary", async (req, res) => {
  try {
    const brandCodes = normalizeListParam(req.query.brandCodes);
    const iccatCodesRaw = req.query.iccatCodes;
    const iccatCodes = normalizeListParam(
      iccatCodesRaw === undefined ? "01,02,03,05,08,10" : String(iccatCodesRaw)
    );
    const skuName = normalizeListParam(req.query.skuName);
    let dateFrom = normalizeListParam(req.query.dateFrom);
    let dateTo = normalizeListParam(req.query.dateTo);

    if (!dateFrom && !dateTo) {
      const now = new Date();
      const pad2 = (value) => String(value).padStart(2, "0");
      const startOfMonth = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
      const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
      dateFrom = startOfMonth;
      dateTo = today;
    }

    const connection = await getErpPool();
    const dataRequest = connection.request();
    dataRequest.input("brandCodesParam", sql.NVarChar, brandCodes);
    dataRequest.input("iccatCodesParam", sql.NVarChar, iccatCodes);
    dataRequest.input("skuNameParam", sql.NVarChar, skuName);
    dataRequest.input("dateFromParam", sql.Date, dateFrom);
    dataRequest.input("dateToParam", sql.Date, dateTo);

    const dataQuery = `
      DECLARE @brandCodes NVARCHAR(MAX) = @brandCodesParam;
      DECLARE @iccatCodes NVARCHAR(MAX) = @iccatCodesParam;
      DECLARE @skuName NVARCHAR(255) = @skuNameParam;
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
          SKUMOVE.SKM_LOT_NO,
          SUM(SKUMOVE.SKM_QTY) / NULLIF(UTQ2.UTQ_QTY_1, 0) AS QTY
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
          AND WARELOCATION.WL_CODE IN ('OL', '1')
          AND (@brandCodes IS NULL OR BRAND.BRN_CODE IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@brandCodes, ',')))
          AND (@iccatCodes IS NULL OR ICCAT.ICCAT_CODE IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@iccatCodes, ',')))
          AND (@dateFrom IS NULL OR DOCINFO.DI_DATE >= @dateFrom)
          AND (@dateTo IS NULL OR DOCINFO.DI_DATE <= @dateTo)
          AND (@skuName IS NULL OR SKUMASTER.SKU_NAME LIKE '%' + @skuName + '%')
        GROUP BY
          SKUMASTER.SKU_CODE,
          SKUMASTER.SKU_NAME,
          BRAND.BRN_CODE,
          ICDEPT.ICDEPT_CODE,
          ICCAT.ICCAT_CODE,
          ICCAT.ICCAT_NAME,
          UTQ2.UTQ_NAME_1,
          UTQ2.UTQ_QTY_1,
          SKUMOVE.SKM_LOT_NO
        HAVING
          SUM(SKUMOVE.SKM_QTY) <> 0
      )
      SELECT
        SKU_CODE,
        SKU_NAME,
        ICDEPT_CODE,
        ICCAT_CODE,
        ICCAT_NAME,
        UTQ_NAME,
        SUM(QTY) AS QTY
      FROM LotBase
      WHERE QTY > 0
      GROUP BY
        SKU_CODE,
        SKU_NAME,
        ICDEPT_CODE,
        ICCAT_CODE,
        ICCAT_NAME,
        UTQ_NAME
      HAVING
        SUM(QTY) <> 0
      ORDER BY SKU_CODE ASC;
    `;

    const countRequest = connection.request();
    countRequest.input("brandCodesParam", sql.NVarChar, brandCodes);
    countRequest.input("iccatCodesParam", sql.NVarChar, iccatCodes);
    countRequest.input("skuNameParam", sql.NVarChar, skuName);
    countRequest.input("dateFromParam", sql.Date, dateFrom);
    countRequest.input("dateToParam", sql.Date, dateTo);

    const countQuery = `
      DECLARE @brandCodes NVARCHAR(MAX) = @brandCodesParam;
      DECLARE @iccatCodes NVARCHAR(MAX) = @iccatCodesParam;
      DECLARE @skuName NVARCHAR(255) = @skuNameParam;
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
          SKUMOVE.SKM_LOT_NO,
          SUM(SKUMOVE.SKM_QTY) / NULLIF(UTQ2.UTQ_QTY_1, 0) AS QTY
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
          AND WARELOCATION.WL_CODE IN ('OL', '1')
          AND (@brandCodes IS NULL OR BRAND.BRN_CODE IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@brandCodes, ',')))
          AND (@iccatCodes IS NULL OR ICCAT.ICCAT_CODE IN (SELECT LTRIM(RTRIM(value)) FROM STRING_SPLIT(@iccatCodes, ',')))
          AND (@dateFrom IS NULL OR DOCINFO.DI_DATE >= @dateFrom)
          AND (@dateTo IS NULL OR DOCINFO.DI_DATE <= @dateTo)
          AND (@skuName IS NULL OR SKUMASTER.SKU_NAME LIKE '%' + @skuName + '%')
        GROUP BY
          SKUMASTER.SKU_CODE,
          SKUMASTER.SKU_NAME,
          BRAND.BRN_CODE,
          ICDEPT.ICDEPT_CODE,
          ICCAT.ICCAT_CODE,
          ICCAT.ICCAT_NAME,
          UTQ2.UTQ_NAME_1,
          UTQ2.UTQ_QTY_1,
          SKUMOVE.SKM_LOT_NO
        HAVING
          SUM(SKUMOVE.SKM_QTY) <> 0
      )
      SELECT COUNT(1) AS totalRows
      FROM (
        SELECT SKU_CODE
        FROM LotBase
        WHERE QTY > 0
        GROUP BY
          SKU_CODE,
          SKU_NAME,
          ICDEPT_CODE,
          ICCAT_CODE,
          ICCAT_NAME,
          UTQ_NAME
        HAVING
          SUM(QTY) <> 0
      ) AS grouped;
    `;

    const [dataResult, countResult] = await Promise.all([
      dataRequest.query(dataQuery),
      countRequest.query(countQuery),
    ]);

    const totalRecords = countResult.recordset[0]?.totalRows || 0;

    res.json({
      data: dataResult.recordset ?? [],
      pagination: {
        page: 1,
        pageSize: totalRecords,
        totalRecords,
        totalPages: 1,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "SQL query failed", details: error.message });
  }
});

app.get("/api/iccat-types", async (req, res) => {
  try {
    const connection = await getErpPool();
    const query = `
      SELECT ICCAT_CODE, ICCAT_NAME
      FROM ICCAT
      WHERE ICCAT_CODE IN ('01','02','03','05','08','10')
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
      WHERE ICCAT.ICCAT_CODE IN ('04', '04-1', '04-2')
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
    const page = parsePositiveInt(req.query.page, 1);
    const pageSize = parsePositiveInt(req.query.pageSize, 100, 500);

    const connection = await getErpPool();
    const requestSql = connection.request();
    requestSql.input("brandCodesParam", sql.NVarChar, brandCodes);
    requestSql.input("pageParam", sql.Int, page);
    requestSql.input("pageSizeParam", sql.Int, pageSize);
    if (search) {
      requestSql.input("searchParam", sql.NVarChar, `%${search}%`);
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

    const dataQuery = `
      DECLARE @brandCodes NVARCHAR(MAX) = @brandCodesParam;
      DECLARE @page INT = @pageParam;
      DECLARE @pageSize INT = @pageSizeParam;
      DECLARE @startRow INT = ((@page - 1) * @pageSize) + 1;
      DECLARE @endRow INT = @page * @pageSize;

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
          SKUMASTER.SKU_MSG_3
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
          AND ICCAT.ICCAT_CODE IN ('04', '04-1', '04-2')
          ${searchFilter}
      ),
      WithRowNum AS (
        SELECT
          *,
          ROW_NUMBER() OVER (
            ORDER BY
              CASE
                WHEN ICCAT_CODE = '04' THEN 1
                WHEN ICCAT_CODE = '04-1' THEN 2
                WHEN ICCAT_CODE = '04-2' THEN 3
                ELSE 9
              END,
              SKU_CODE ASC,
              AP_CODE ASC
          ) AS rn
        FROM Base
      )
      SELECT
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
      FROM WithRowNum
      WHERE rn BETWEEN @startRow AND @endRow
      ORDER BY
        CASE
          WHEN ICCAT_CODE = '04' THEN 1
          WHEN ICCAT_CODE = '04-1' THEN 2
          WHEN ICCAT_CODE = '04-2' THEN 3
          ELSE 9
        END,
        SKU_CODE ASC,
        AP_CODE ASC;
    `;

    const countRequest = connection.request();
    countRequest.input("brandCodesParam", sql.NVarChar, brandCodes);
    if (search) {
      countRequest.input("searchParam", sql.NVarChar, `%${search}%`);
    }

    const countQuery = `
      DECLARE @brandCodes NVARCHAR(MAX) = @brandCodesParam;
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
        AND ICCAT.ICCAT_CODE IN ('04', '04-1', '04-2')
        ${searchFilter}
    `;

    const [dataResult, countResult] = await Promise.all([
      requestSql.query(dataQuery),
      countRequest.query(countQuery),
    ]);

    const totalRecords = countResult.recordset[0]?.totalRows || 0;

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

app.get("/api/sku-min-max", async (req, res) => {
  try {
    const page = parseInt(req.query.page || "1", 10);
    const pageSize = parseInt(req.query.pageSize || "100", 10);
    const startRow = (page - 1) * pageSize + 1;
    const endRow = page * pageSize;
    const iccatSearch = req.query.iccat ? String(req.query.iccat) : "";

    const connection = await getErpPool();
    const requestSql = connection.request();
    requestSql.input("startRow", sql.Int, startRow);
    requestSql.input("endRow", sql.Int, endRow);
    if (iccatSearch) {
      requestSql.input("iccatSearch", sql.NVarChar, `%${iccatSearch}%`);
    }

    const iccatFilter = `
      AND ICCAT.ICCAT_CODE IN ('01','02','03','05','08','10')
      ${iccatSearch ? "AND (ICCAT.ICCAT_CODE LIKE @iccatSearch OR ICCAT.ICCAT_NAME LIKE @iccatSearch)" : ""}
    `;

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
      ),
      WithRowNum AS (
        SELECT
          *,
          ROW_NUMBER() OVER (ORDER BY SKU_CODE ASC) AS rn
        FROM Base
      )
      SELECT
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
      FROM WithRowNum
      WHERE rn BETWEEN @startRow AND @endRow
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

    const [dataResult, countResult] = await Promise.all([
      requestSql.query(dataQuery),
      countRequest.query(countQuery),
    ]);

    const totalRecords = countResult.recordset[0]?.totalRows || 0;

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

    const result = await requestSql.query(query);
    res.json({ data: result.recordset ?? [] });
  } catch (error) {
    res.status(500).json({ error: "SQL query failed", details: error.message });
  }
});

app.get("/api/suppliers", async (req, res) => {
  try {
    const page = parseInt(req.query.page || "1", 10);
    const pageSize = parseInt(req.query.pageSize || "100", 10);
    const startRow = (page - 1) * pageSize + 1;
    const endRow = page * pageSize;

    const connection = await getErpPool();
    const requestSql = connection.request();
    requestSql.input("startRow", sql.Int, startRow);
    requestSql.input("endRow", sql.Int, endRow);

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
      ),
      WithRowNum AS (
        SELECT
          *,
          ROW_NUMBER() OVER (ORDER BY DI_DATE DESC, DI_REF ASC, TRD_SEQ ASC) AS rn
        FROM Base
      )
      SELECT
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
      FROM WithRowNum
      WHERE rn BETWEEN @startRow AND @endRow
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
        AND DOCINFO.DI_ACTIVE = 0;
    `;

    const [dataResult, countResult] = await Promise.all([
      requestSql.query(dataQuery),
      requestSql.query(countQuery),
    ]);

    const totalRecords = countResult.recordset[0]?.totalRows || 0;

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

app.get("/api/raw-material-requisitions", async (req, res) => {
  try {
    const search = req.query.search ? String(req.query.search).trim() : "";
    const page = parsePositiveInt(req.query.page, 1);
    const pageSize = parsePositiveInt(req.query.pageSize, 100, 500);
    const startRow = (page - 1) * pageSize + 1;
    const endRow = page * pageSize;

    const connection = await getErpPool();
    const requestSql = connection.request();
    requestSql.input("startRow", sql.Int, startRow);
    requestSql.input("endRow", sql.Int, endRow);
    if (search) {
      requestSql.input("searchParam", sql.NVarChar, `%${search}%`);
    }

    const searchFilter = search
      ? `AND (
          DOCINFO.DI_REF LIKE @searchParam
          OR TRANSTKD.TRD_SH_CODE LIKE @searchParam
          OR TRANSTKD.TRD_SH_NAME LIKE @searchParam
          OR DEPTTAB.DEPT_CODE LIKE @searchParam
          OR PRJTAB.PRJ_CODE LIKE @searchParam
          OR BRANCH.BR_CODE LIKE @searchParam
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
          ${searchFilter}
      ),
      WithRowNum AS (
        SELECT
          *,
          ROW_NUMBER() OVER (ORDER BY DI_DATE DESC, DI_REF ASC, TRD_SEQ ASC) AS rn
        FROM Base
      )
      SELECT *
      FROM WithRowNum
      WHERE rn BETWEEN @startRow AND @endRow
      ORDER BY DI_DATE DESC, DI_REF ASC, TRD_SEQ ASC;
    `;

    const countRequest = connection.request();
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
        AND ICCAT.ICCAT_CODE IN ('01','02','03','05','08','10')
        ${searchFilter}
    `;

    const [dataResult, countResult] = await Promise.all([
      requestSql.query(dataQuery),
      countRequest.query(countQuery),
    ]);

    const totalRecords = countResult.recordset[0]?.totalRows || 0;

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

app.get("/api/raw-material-returns", async (req, res) => {
  try {
    const search = req.query.search ? String(req.query.search).trim() : "";
    const page = parsePositiveInt(req.query.page, 1);
    const pageSize = parsePositiveInt(req.query.pageSize, 100, 500);
    const startRow = (page - 1) * pageSize + 1;
    const endRow = page * pageSize;

    const connection = await getErpPool();
    const requestSql = connection.request();
    requestSql.input("startRow", sql.Int, startRow);
    requestSql.input("endRow", sql.Int, endRow);
    if (search) {
      requestSql.input("searchParam", sql.NVarChar, `%${search}%`);
    }

    const searchFilter = search
      ? `AND (
          DOCINFO.DI_REF LIKE @searchParam
          OR TRANSTKD.TRD_SH_CODE LIKE @searchParam
          OR TRANSTKD.TRD_SH_NAME LIKE @searchParam
          OR DEPTTAB.DEPT_CODE LIKE @searchParam
          OR PRJTAB.PRJ_CODE LIKE @searchParam
          OR BRANCH.BR_CODE LIKE @searchParam
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
          AND ICCAT.ICCAT_CODE IN ('01','02','03','05','08','10')
          ${searchFilter}
      ),
      WithRowNum AS (
        SELECT
          *,
          ROW_NUMBER() OVER (ORDER BY DI_DATE DESC, DI_REF ASC, TRD_SEQ ASC) AS rn
        FROM Base
      )
      SELECT *
      FROM WithRowNum
      WHERE rn BETWEEN @startRow AND @endRow
      ORDER BY DI_DATE DESC, DI_REF ASC, TRD_SEQ ASC;
    `;

    const countRequest = connection.request();
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
        AND ICCAT.ICCAT_CODE IN ('01','02','03','05','08','10')
        ${searchFilter}
    `;

    const [dataResult, countResult] = await Promise.all([
      requestSql.query(dataQuery),
      countRequest.query(countQuery),
    ]);

    const totalRecords = countResult.recordset[0]?.totalRows || 0;

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

app.get("/api/employees", async (req, res) => {
  try {
    const connection = await getHrPool();
    const query = `
      SELECT
        EMP_INTL, EMP_NAME, EMP_SURNME, EMP_BIRTH, EMP_I_CARD, EMP_TAX_ID, EMP_MARITAL, EMP_GENDER,
        FML_ORIGIN, FML_NATNALTY, FML_RELIGION,
        PRS_NO, PRS_BANK_AC, PRS_SC_NO,
        PRI_START_D, PRI_STATUS,
        DEPT_CODE, DEPT_THAIDESC,
        TAX_CHDNE_WSP, TAX_CHDNE_NSP, TAX_CHDWE_WSP, TAX_CHDWE_NSP,
        BANK_INITIAL,
        BR_CODE, BR_THAIDESC,
        JBT_THAIDESC
      FROM EMPFILE, FAMILY, PERSONALINFO, PAYROLLINFO, DEPTTAB, TAXINFO, BANKFILE, BRANCH, JOBTITLE
      WHERE (EMPFILE.EMP_KEY = PERSONALINFO.PRS_EMP)
        AND (EMPFILE.EMP_KEY = FAMILY.FML_EMP)
        AND (EMPFILE.EMP_KEY = PAYROLLINFO.PRI_EMP)
        AND (PERSONALINFO.PRS_DEPT = DEPTTAB.DEPT_KEY)
        AND (EMPFILE.EMP_KEY = TAXINFO.TAX_EMP)
        AND (PERSONALINFO.PRS_BANK_C = BANKFILE.BANK_KEY)
        AND (PERSONALINFO.PRS_BR = BRANCH.BR_KEY)
        AND (PERSONALINFO.PRS_JBT = JOBTITLE.JBT_KEY)
    `;

    const result = await connection.request().query(query);
    res.json({ data: result.recordset ?? [] });
  } catch (error) {
    res.status(500).json({ error: "SQL query failed", details: error.message });
  }
});

app.get("/api/attendance", async (req, res) => {
  try {
    const badgenumber = req.query.badgenumber ? String(req.query.badgenumber) : "";
    const page = parsePositiveInt(req.query.page, 1);
    const pageSize = parsePositiveInt(req.query.pageSize, 20, 200);
    const offset = (page - 1) * pageSize;

    const connection = await getHrPool();
    const requestSql = connection.request();

    let whereClause = "";
    if (badgenumber) {
      whereClause = "WHERE U.Badgenumber LIKE @badgenumber";
      requestSql.input("badgenumber", sql.VarChar, `%${badgenumber}%`);
    }

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
      SELECT
        U.Badgenumber,
        U.Name,
        U.SSN,
        D.DEPTNAME,
        FORMAT(CAST(C.CHECKTIME AS DATE), 'yyyy-MM-dd') as DateStr,
        FORMAT(MIN(C.CHECKTIME), 'HH:mm:ss') as CheckIn,
        FORMAT(MAX(C.CHECKTIME), 'HH:mm:ss') as CheckOut
      ${fromAndJoin}
      ${whereClause}
      GROUP BY U.Badgenumber, U.Name, U.SSN, D.DEPTNAME, CAST(C.CHECKTIME AS DATE)
      ORDER BY CAST(C.CHECKTIME AS DATE) DESC, U.Badgenumber ASC
      OFFSET ${offset} ROWS
      FETCH NEXT ${pageSize} ROWS ONLY
    `;

    const result = await requestSql.query(dataQuery);

    res.json({
      data: result.recordset ?? [],
      pagination: {
        page,
        pageSize,
        totalRecords,
        totalPages: Math.ceil(totalRecords / pageSize),
      },
    });
  } catch (error) {
    res.status(500).json({ error: "SQL query failed", details: error.message });
  }
});

app.get("/api/consolidated", async (req, res) => {
  try {
    const startDate = req.query.startDate || new Date().toISOString().split("T")[0];
    const endDate = req.query.endDate || new Date().toISOString().split("T")[0];
    const searchTerm = req.query.search ? String(req.query.search) : "";
    const department = req.query.department ? String(req.query.department) : "";
    const branch = req.query.branch ? String(req.query.branch) : "";
    const page = parsePositiveInt(req.query.page, 1);
    const pageSize = parsePositiveInt(req.query.pageSize, 20, 200);
    const offset = (page - 1) * pageSize;

    const connection = await getHrPool();
    const requestSql = connection.request();

    requestSql.input("startDate", sql.Date, startDate);
    requestSql.input("endDate", sql.Date, endDate);
    if (searchTerm) requestSql.input("search", sql.NVarChar, `%${searchTerm}%`);
    if (department) requestSql.input("department", sql.NVarChar, department);
    if (branch) requestSql.input("branch", sql.NVarChar, branch);

    const whereClause = `
      WHERE 1=1
      ${searchTerm ? "AND (HR.FullName LIKE @search OR HR.PRS_NO LIKE @search OR HR.DEPT_THAIDESC LIKE @search OR HR.BR_THAIDESC LIKE @search)" : ""}
      ${department ? "AND HR.DEPT_THAIDESC = @department" : ""}
      ${branch ? "AND HR.BR_THAIDESC = @branch" : ""}
    `;

    const ctes = `
      WITH ActiveEmployees AS (
        SELECT
          P.PRS_NO,
          RTRIM(LTRIM(E.EMP_NAME)) + ' ' + RTRIM(LTRIM(E.EMP_SURNME)) AS FullName,
          D.DEPT_THAIDESC,
          B.BR_THAIDESC
        FROM [BPLUSHRM_KPF].[dbo].[EMPFILE] E
        JOIN [BPLUSHRM_KPF].[dbo].[PERSONALINFO] P ON E.EMP_KEY = P.PRS_EMP
        LEFT JOIN [BPLUSHRM_KPF].[dbo].[DEPTTAB] D ON P.PRS_DEPT = D.DEPT_KEY
        LEFT JOIN [BPLUSHRM_KPF].[dbo].[BRANCH] B ON P.PRS_BR = B.BR_KEY
        LEFT JOIN [BPLUSHRM_KPF].[dbo].[PAYROLLINFO] PAY ON E.EMP_KEY = PAY.PRI_EMP
        WHERE PAY.PRI_STATUS != 2
      ),
      AttendanceData AS (
        SELECT
          U.Name,
          U.SSN,
          CAST(C.CHECKTIME AS DATE) AS CheckDate,
          MIN(C.CHECKTIME) AS CheckIn,
          MAX(C.CHECKTIME) AS CheckOut
        FROM [Pm2014_SU].[dbo].[CHECKINOUT] C
        JOIN [Pm2014_SU].[dbo].[USERINFO] U ON C.Badgenumber = U.Badgenumber
        WHERE C.CHECKTIME >= @startDate AND C.CHECKTIME < DATEADD(day, 1, @endDate)
        GROUP BY U.Name, U.SSN, CAST(C.CHECKTIME AS DATE)
      )
    `;

    const countQuery = `
      ${ctes}
      SELECT COUNT(*) AS TotalFiltered
      FROM ActiveEmployees HR
      JOIN AttendanceData T
        ON HR.PRS_NO COLLATE Thai_CI_AS = T.SSN COLLATE Thai_CI_AS
      ${whereClause}
    `;

    const dataQuery = `
      ${ctes}
      SELECT
        FORMAT(T.CheckDate, 'yyyy-MM-dd') AS DateStr,
        HR.PRS_NO,
        HR.FullName AS Name,
        HR.DEPT_THAIDESC,
        HR.BR_THAIDESC,
        FORMAT(T.CheckIn, 'HH:mm:ss') AS CheckIn,
        FORMAT(T.CheckOut, 'HH:mm:ss') AS CheckOut
      FROM ActiveEmployees HR
      JOIN AttendanceData T
        ON HR.PRS_NO COLLATE Thai_CI_AS = T.SSN COLLATE Thai_CI_AS
      ${whereClause}
      ORDER BY T.CheckDate DESC, HR.PRS_NO ASC
      OFFSET ${offset} ROWS
      FETCH NEXT ${pageSize} ROWS ONLY
    `;

    const metaCountQuery = `SELECT COUNT(*) AS TotalActive FROM [BPLUSHRM_KPF].[dbo].[EMPFILE] E JOIN [BPLUSHRM_KPF].[dbo].[PAYROLLINFO] PAY ON E.EMP_KEY = PAY.PRI_EMP WHERE PAY.PRI_STATUS != 2`;
    const metaDeptQuery = `SELECT DISTINCT D.DEPT_THAIDESC FROM [BPLUSHRM_KPF].[dbo].[PERSONALINFO] P JOIN [BPLUSHRM_KPF].[dbo].[DEPTTAB] D ON P.PRS_DEPT = D.DEPT_KEY JOIN [BPLUSHRM_KPF].[dbo].[PAYROLLINFO] PAY ON P.PRS_EMP = PAY.PRI_EMP WHERE PAY.PRI_STATUS != 2 AND D.DEPT_THAIDESC IS NOT NULL ORDER BY D.DEPT_THAIDESC`;
    const metaBranchQuery = `SELECT DISTINCT B.BR_THAIDESC FROM [BPLUSHRM_KPF].[dbo].[PERSONALINFO] P JOIN [BPLUSHRM_KPF].[dbo].[BRANCH] B ON P.PRS_BR = B.BR_KEY JOIN [BPLUSHRM_KPF].[dbo].[PAYROLLINFO] PAY ON P.PRS_EMP = PAY.PRI_EMP WHERE PAY.PRI_STATUS != 2 AND B.BR_THAIDESC IS NOT NULL ORDER BY B.BR_THAIDESC`;

    const [dataResult, countResult, metaCountResult, deptResult, branchResult] = await Promise.all([
      requestSql.query(dataQuery),
      requestSql.query(countQuery),
      requestSql.query(metaCountQuery),
      requestSql.query(metaDeptQuery),
      requestSql.query(metaBranchQuery),
    ]);

    const totalFiltered = countResult.recordset[0]?.TotalFiltered || 0;

    res.json({
      data: dataResult.recordset ?? [],
      pagination: {
        page,
        pageSize,
        totalRecords: totalFiltered,
        totalPages: Math.ceil(totalFiltered / pageSize),
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

const port = process.env.PORT ? Number(process.env.PORT) : 4000;
app.listen(port, () => {
  console.log(`KPF API Gateway listening on port ${port}`);
});
