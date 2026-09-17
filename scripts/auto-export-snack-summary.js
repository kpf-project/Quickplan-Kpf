const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const ExcelJS = require('exceljs');

// Helper to manually load environment variables from .env.local
function loadEnv() {
  const envPath = path.join(__dirname, '../.env.local');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8');
    content.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const idx = trimmed.indexOf('=');
      if (idx === -1) return;
      const key = trimmed.slice(0, idx).trim();
      const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      process.env[key] = val;
    });
  }
}

// Load env
loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Using service role key to bypass RLS in script

if (!supabaseUrl || !supabaseKey) {
  console.error("Error: Supabase configuration (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY) is missing in .env.local");
  safeExit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Helper for clean exits to avoid Windows Node.js UV handle assertions
function safeExit(code) {
  setTimeout(() => {
    process.exit(code);
  }, 100);
}

// Date Helpers
function toBangkokDateKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || "";
  const year = get("year");
  const month = get("month");
  const day = get("day");
  return `${year}-${month}-${day}`;
}

function formatExcelDateTime(value) {
  if (!value) {
    return "-";
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "short",
    timeStyle: "medium",
  });
}

function formatExcelNumber(value, digits = 2) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Number(parsed.toFixed(digits));
}

function buildPieceRateReportGroupKey(row) {
  const dayKey = String(row.loggedAt || "").slice(0, 10) || "-";
  return [
    dayKey,
    row.employeeCode || "-",
    row.productBarcode || row.productGoodsCode || row.productCode || "-",
  ].join("::");
}

async function runAutoExport() {
  console.log("Starting automated daily snack wage summary export...");
  
  // Parse command line arguments for manual override
  let dateKey = '';
  const dateArg = process.argv.find(arg => arg.startsWith('--date='));
  if (dateArg) {
    dateKey = dateArg.split('=')[1];
    console.log(`Using overridden date from argument: ${dateKey}`);
  } else {
    // Calculate target date: Yesterday
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - 1);
    dateKey = toBangkokDateKey(targetDate);
    console.log(`Using default target date (yesterday): ${dateKey}`);
  }

  // Validate date format YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    console.error("Error: Invalid date format. Must be YYYY-MM-DD");
    safeExit(1);
    return;
  }

  // Create UTC range in Asia/Bangkok
  const fromUtc = new Date(`${dateKey}T00:00:00+07:00`).toISOString();
  const toUtc = new Date(`${dateKey}T23:59:59.999+07:00`).toISOString();

  console.log(`Fetching piece rate logs between ${fromUtc} and ${toUtc}...`);
  const { data, error } = await supabase
    .from("production_piece_rate_logs")
    .select("id,logged_at,actual_weighed_at,doc_no,machine_code,employee_code,employee_name_snapshot,product_barcode_snapshot,product_code_snapshot,product_goods_code_snapshot,product_sku_code_snapshot,product_name_snapshot,input_mode_snapshot,input_value,count_value_snapshot,normalized_kg_amount_snapshot,wage_amount_snapshot,doc_status")
    .neq("doc_status", "cancelled")
    .neq("doc_status", "replaced")
    .gte("actual_weighed_at", fromUtc)
    .lte("actual_weighed_at", toUtc);

  if (error) {
    console.error("Database query failed:", error.message);
    safeExit(1);
    return;
  }

  console.log(`Fetched ${data.length} raw piece-rate logs.`);
  if (data.length === 0) {
    console.log(`No piece-rate logs recorded for ${dateKey}. Export process skipped.`);
    safeExit(0);
    return;
  }

  // Map raw rows
  const mappedRows = data.map((row) => {
    const actualWeighedAt = row.actual_weighed_at || row.logged_at || null;
    const inputMode = row.input_mode_snapshot || "kg";
    return {
      id: row.id,
      loggedAt: actualWeighedAt,
      groupDayKey: String(actualWeighedAt || "").slice(0, 10) || "-",
      docNo: row.doc_no || null,
      machineCode: row.machine_code || "-",
      employeeCode: row.employee_code,
      employeeName: row.employee_name_snapshot || "-",
      productBarcode: row.product_barcode_snapshot || "-",
      productCode: row.product_goods_code_snapshot || row.product_code_snapshot || "-",
      productGoodsCode: row.product_goods_code_snapshot || row.product_code_snapshot || "-",
      productName: row.product_name_snapshot || "-",
      inputMode,
      inputValue: Number(row.input_value || 0),
      countValue: Number(row.count_value_snapshot || 1),
      normalizedKgAmount: Number(row.normalized_kg_amount_snapshot || 0),
      wageAmount: Number(row.wage_amount_snapshot || 0),
      docStatus: row.doc_status,
    };
  });

  // Aggregate rows (Group by day + employee + product)
  const grouped = new Map();
  mappedRows.forEach((row) => {
    const key = buildPieceRateReportGroupKey(row);
    const current = grouped.get(key);
    if (!current) {
      grouped.set(key, {
        ...row,
        docCount: 1,
        mergedRowCount: 1,
        latestDocNo: row.docNo || "-",
        latestLoggedAt: row.loggedAt,
      });
      return;
    }

    const nextLoggedAt = Date.parse(row.loggedAt || "") || 0;
    const currentLoggedAt = Date.parse(current.latestLoggedAt || current.loggedAt || "") || 0;
    if (nextLoggedAt >= currentLoggedAt) {
      current.loggedAt = row.loggedAt;
      current.latestLoggedAt = row.loggedAt;
      current.docNo = row.docNo || current.docNo;
      current.latestDocNo = row.docNo || current.latestDocNo;
      current.machineCode = row.machineCode || current.machineCode;
    }

    current.docCount += row.docNo && row.docNo !== "-" ? 1 : 0;
    current.mergedRowCount += 1;
    current.inputValue += Number(row.inputValue || 0);
    current.countValue += Number(row.countValue || 0);
    current.normalizedKgAmount += Number(row.normalizedKgAmount || 0);
    current.wageAmount = Number(current.wageAmount || 0) + Number(row.wageAmount || 0);
  });

  const exportRows = Array.from(grouped.values()).sort((left, right) => {
    const leftTime = Date.parse(left.loggedAt || "") || 0;
    const rightTime = Date.parse(right.loggedAt || "") || 0;
    return rightTime - leftTime;
  });

  console.log(`Aggregated into ${exportRows.length} daily summary rows.`);

  // Create Excel Workbook
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "KPF Production Line";
  workbook.created = new Date();
  workbook.modified = new Date();
  workbook.title = `Piece Rate Report Daily Summary`;

  // 1. Criteria Sheet
  const criteriaSheet = workbook.addWorksheet("เงื่อนไขรายงาน");
  criteriaSheet.columns = [
    { header: "หัวข้อ", key: "label", width: 24 },
    { header: "ค่า", key: "value", width: 60 },
  ];
  criteriaSheet.getRow(1).font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  criteriaSheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF102C57" },
  };
  criteriaSheet.addRows([
    { label: "มุมมอง", value: "รวมยอดรายวัน" },
    { label: "ค้นหา", value: "-" },
    { label: "วันที่เริ่ม", value: dateKey },
    { label: "วันที่สิ้นสุด", value: dateKey },
    { label: "ซ่อนเอกสารยกเลิก", value: "ใช่" },
    { label: "ซ่อนเอกสารแก้ไข", value: "ใช่" },
    { label: "จำนวนแถวที่ส่งออก", value: String(exportRows.length) },
  ]);

  // 2. Data Sheet
  const sheet = workbook.addWorksheet("รวมยอดรายวัน");
  sheet.columns = [
    { header: "วันที่", key: "groupDayKey", width: 14 },
    { header: "เวลา", key: "loggedAt", width: 20 },
    { header: "รหัสพนักงาน", key: "employeeCode", width: 16 },
    { header: "ชื่อพนักงาน", key: "employeeName", width: 24 },
    { header: "สินค้า", key: "productName", width: 30 },
    { header: "รหัสสินค้า", key: "productCode", width: 18 },
    { header: "จำนวนเอกสาร", key: "mergedRowCount", width: 14 },
    { header: "รหัสเครื่อง", key: "machineCode", width: 14 },
    { header: "น้ำหนักรวม", key: "inputValue", width: 14 },
    { header: "จำนวนรวม", key: "countValue", width: 14 },
    { header: "กก.รวม", key: "normalizedKgAmount", width: 14 },
    { header: "ค่าแรงรวม", key: "wageAmount", width: 14 },
  ];

  const headerRow = sheet.getRow(1);
  headerRow.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF102C57" },
  };
  headerRow.alignment = { vertical: "middle", horizontal: "center" };
  headerRow.height = 30;

  headerRow.eachCell((cell) => {
    cell.border = {
      top: { style: "thin", color: { argb: "FFCCCCCC" } },
      left: { style: "thin", color: { argb: "FFCCCCCC" } },
      bottom: { style: "medium", color: { argb: "FFD4AF37" } },
      right: { style: "thin", color: { argb: "FFCCCCCC" } },
    };
  });

  exportRows.forEach((row) => {
    const addedRow = sheet.addRow({
      groupDayKey: row.groupDayKey || "-",
      loggedAt: formatExcelDateTime(row.loggedAt),
      employeeCode: row.employeeCode || "-",
      employeeName: row.employeeName || "-",
      productName: row.productName || "-",
      productCode: row.productGoodsCode || row.productCode || "-",
      mergedRowCount: Number(row.mergedRowCount || 1),
      machineCode: row.machineCode || "-",
      inputValue: formatExcelNumber(row.inputValue, row.inputMode === "kg" ? 3 : 0),
      countValue: formatExcelNumber(row.countValue, 0),
      normalizedKgAmount: formatExcelNumber(row.normalizedKgAmount, 3),
      wageAmount: formatExcelNumber(row.wageAmount, 2),
    });

    addedRow.height = 24;
    addedRow.alignment = { vertical: "middle" };
    addedRow.font = { name: "Arial", size: 10 };

    addedRow.getCell("groupDayKey").alignment = { vertical: "middle", horizontal: "center" };
    addedRow.getCell("loggedAt").alignment = { vertical: "middle", horizontal: "center" };
    addedRow.getCell("employeeCode").alignment = { vertical: "middle", horizontal: "center" };
    addedRow.getCell("productCode").alignment = { vertical: "middle", horizontal: "center" };
    addedRow.getCell("mergedRowCount").alignment = { vertical: "middle", horizontal: "center" };
    addedRow.getCell("machineCode").alignment = { vertical: "middle", horizontal: "center" };
    
    addedRow.getCell("inputValue").alignment = { vertical: "middle", horizontal: "right" };
    addedRow.getCell("countValue").alignment = { vertical: "middle", horizontal: "right" };
    addedRow.getCell("normalizedKgAmount").alignment = { vertical: "middle", horizontal: "right" };
    addedRow.getCell("wageAmount").alignment = { vertical: "middle", horizontal: "right" };

    addedRow.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });
  });

  // Freeze the top row and add autofilters
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = `A1:L1`;

  // Output folder configuration (defaults to network share)
  const exportDir = process.env.AUTO_EXPORT_DIR || '\\\\192.168.1.76\\KPF-Quickplan';
  try {
    if (!fs.existsSync(exportDir)) {
      console.log(`Creating export directory: ${exportDir}`);
      fs.mkdirSync(exportDir, { recursive: true });
    }
  } catch (err) {
    console.error(`Warning: Failed to verify/create directory ${exportDir}: ${err.message}`);
  }

  const filePath = path.join(exportDir, `รายงานยอดรวมค่าแรงสแนกรายวัน_${dateKey}.xlsx`);
  await workbook.xlsx.writeFile(filePath);
  
  console.log(`Excel file exported successfully: ${filePath}`);
  safeExit(0);
}

runAutoExport().catch((err) => {
  console.error("Export script failed with error:", err);
  safeExit(1);
});
