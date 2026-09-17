const sql = require("mssql");
const dotenv = require("dotenv");
const fs = require("fs");

const envPath = fs.existsSync(".env.local") ? ".env.local" : ".env";
dotenv.config({ path: envPath });

async function run() {
  const pool = await new sql.ConnectionPool({
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

  console.log("Connected.");
  console.log("Querying scan counts grouped by hour for today (2026-06-12)...");
  
  const query = `
    SELECT DATEPART(hour, DATEADD(hour, 7, C.CHECKTIME)) as HourBangkok, COUNT(*) as ScanCount
    FROM [Pm2014_SU].[dbo].[CHECKINOUT] C
    WHERE C.CHECKTIME >= '2026-06-12 00:00:00'
      AND C.CHECKTIME < '2026-06-13 00:00:00'
    GROUP BY DATEPART(hour, DATEADD(hour, 7, C.CHECKTIME))
    ORDER BY HourBangkok ASC
  `;
  const result = await pool.request().query(query);
  console.table(result.recordset);

  console.log("\nQuerying the latest 10 scans in CHECKINOUT for today:");
  const latestQuery = `
    SELECT TOP 10 U.Name, DATEADD(hour, 7, C.CHECKTIME) as CheckTimeBangkok
    FROM [Pm2014_SU].[dbo].[CHECKINOUT] C
    LEFT JOIN [Pm2014_SU].[dbo].[USERINFO] U ON U.Badgenumber = C.Badgenumber
    WHERE C.CHECKTIME >= '2026-06-12 00:00:00'
      AND C.CHECKTIME < '2026-06-13 00:00:00'
    ORDER BY C.CHECKTIME DESC
  `;
  const latestResult = await pool.request().query(latestQuery);
  console.table(latestResult.recordset);

  await pool.close();
}

run().catch(console.error);
