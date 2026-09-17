const path = require('path');
const sql = require('mssql');
require('dotenv').config({ path: path.join(__dirname, '.env.local') });

async function run() {
  const config = {
    server: process.env.SQL_SERVER,
    database: process.env.SQL_DATABASE,
    user: process.env.SQL_USER,
    password: process.env.SQL_PASSWORD,
    port: process.env.SQL_PORT ? Number(process.env.SQL_PORT) : 1433,
    options: {
      encrypt: process.env.SQL_ENCRYPT === "true",
      trustServerCertificate: process.env.SQL_TRUST_CERT !== "false",
    },
  };

  const pool = await sql.connect(config);
  try {
    console.log("Analyzing formats of PRS_NO in BPLUSHRM_KPF...");
    const prsNoFormats = await pool.request().query(`
      SELECT TOP 10 PRS_NO
      FROM [BPLUSHRM_KPF].[dbo].[PERSONALINFO]
      WHERE PRS_NO IS NOT NULL
    `);
    console.log("Sample PRS_NOs:", prsNoFormats.recordset.map(r => r.PRS_NO));

    console.log("\nAnalyzing formats of SSN in Pm2014_SU...");
    const ssnFormats = await pool.request().query(`
      SELECT TOP 10 SSN, Badgenumber, Name
      FROM [Pm2014_SU].[dbo].[USERINFO]
      WHERE SSN IS NOT NULL AND SSN != ''
    `);
    console.log("Sample SSNs:", ssnFormats.recordset);

    console.log("\nChecking for employees with recent scans in Pm2014_SU whose SSN cannot be matched to any PRS_NO in Business Plus...");
    const mismatchQuery = `
      SELECT DISTINCT TOP 20 
        U.SSN, 
        U.Badgenumber, 
        U.Name,
        UPPER(REPLACE(REPLACE(REPLACE(COALESCE(U.SSN, ''), 'KPF', ''), '-', ''), ' ', '')) AS SSN_NORMALIZED
      FROM [Pm2014_SU].[dbo].[CHECKINOUT] C
      JOIN [Pm2014_SU].[dbo].[USERINFO] U ON C.Badgenumber = U.Badgenumber
      WHERE C.CHECKTIME >= DATEADD(day, -3, GETDATE())
        AND NOT EXISTS (
          SELECT 1 FROM [BPLUSHRM_KPF].[dbo].[PERSONALINFO] P
          WHERE UPPER(REPLACE(REPLACE(REPLACE(COALESCE(P.PRS_NO, ''), 'KPF', ''), '-', ''), ' ', '')) COLLATE Thai_CI_AS
              = UPPER(REPLACE(REPLACE(REPLACE(COALESCE(U.SSN, ''), 'KPF', ''), '-', ''), ' ', '')) COLLATE Thai_CI_AS
        )
    `;
    const mismatches = await pool.request().query(mismatchQuery);
    console.log("Mismatched active scanners (scanned in last 3 days but no matching BPlus employee):", mismatches.recordset);

    console.log("\nChecking for SSN vs PRS_NO that only differ by leading zeros or trailing characters...");
    // Let's see some samples where SSN is just numbers but BPlus is KPF-0xxxx or similar
    const sampleMismatches = await pool.request().query(`
      SELECT TOP 10 P.PRS_NO, U.SSN, U.Name, U.Badgenumber
      FROM [Pm2014_SU].[dbo].[USERINFO] U
      CROSS JOIN [BPLUSHRM_KPF].[dbo].[PERSONALINFO] P
      WHERE U.Name LIKE '%' + SUBSTRING(P.PRS_NO, 5, 10) + '%'
        AND UPPER(REPLACE(REPLACE(REPLACE(COALESCE(U.SSN, ''), 'KPF', ''), '-', ''), ' ', '')) != UPPER(REPLACE(REPLACE(REPLACE(COALESCE(P.PRS_NO, ''), 'KPF', ''), '-', ''), ' ', ''))
    `);
    console.log("Potential name/code matches that fail normalization:", sampleMismatches.recordset);

  } catch (err) {
    console.error("Error:", err);
  } finally {
    await pool.close();
  }
}

run();
