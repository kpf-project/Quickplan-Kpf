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
const gatewayUrl = process.env.KPF_GATEWAY_URL;
const gatewayApiKey = process.env.KPF_API_KEY;

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

function toBangkokTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(date);
}

function formatDisplayDate(value) {
  if (!value) return "-";
  const [year, month, day] = String(value).split("-");
  if (!year || !month || !day) return "-";
  return `${Number(day)}-${Number(month)}-${year}`;
}

function formatExcelDateTime(value) {
  if (!value) return "-";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "short",
    timeStyle: "medium",
  });
}

function formatExcelNumber(value, digits = 2) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Number(parsed.toFixed(digits));
}

function normalizeFingerValue(value) {
  const text = String(value || "").trim();
  return text || "-";
}

function pickFingerValue(primary, fallback) {
  return primary && primary !== "-" ? primary : fallback || "-";
}

function getTimeGapDisplay(fingerIn, checkIn) {
  if (!fingerIn || fingerIn === "-" || !checkIn || checkIn === "-") {
    return "-";
  }
  try {
    const [fH, fM, fS] = fingerIn.split(":").map(Number);
    const [cH, cM, cS] = checkIn.split(":").map(Number);
    const fDate = new Date(2000, 0, 1, fH, fM, fS || 0);
    const cDate = new Date(2000, 0, 1, cH, cM, cS || 0);
    const diffMs = cDate.getTime() - fDate.getTime();
    
    const totalSeconds = Math.round(diffMs / 1000);
    const absSeconds = Math.abs(totalSeconds);
    const minutes = Math.floor(absSeconds / 60);

    const timeText = `${minutes} นาที`;
    return diffMs < 0 ? `ก่อนสแกน ${timeText}` : timeText;
  } catch (e) {
    return "-";
  }
}

async function loadConsolidatedFingerMap(rows) {
  const fingerMap = new Map();
  if (!gatewayUrl) return fingerMap;

  const uniqueRows = Array.from(
    new Map(rows.map((row) => [`${row.employeeCode}|${row.date}`, row])).values()
  );

  for (const row of uniqueRows) {
    try {
      const url = `${gatewayUrl}/api/consolidated-lookup?employeeCode=${encodeURIComponent(row.employeeCode)}&date=${row.date}`;
      const headers = gatewayApiKey ? { "x-api-key": gatewayApiKey } : undefined;
      
      const response = await fetch(url, { headers });
      if (response.ok) {
        const result = await response.json();
        if (result.ok) {
          const payload = result.data?.data || {};
          const fingerIn = normalizeFingerValue(payload.CheckIn);
          let fingerOut = "-";
          if (payload.CheckOut && payload.CheckOut !== payload.CheckIn) {
            fingerOut = payload.CheckOut.trim();
          }
          fingerMap.set(`${row.employeeCode}|${row.date}`, { fingerIn, fingerOut });
        }
      }
    } catch (e) {
      console.error(`Gateway lookup failed for ${row.employeeCode} on ${row.date}:`, e.message);
    }
  }
  return fingerMap;
}

function buildPieceRateReportGroupKey(row) {
  const dayKey = String(row.loggedAt || "").slice(0, 10) || "-";
  return [
    dayKey,
    row.employeeCode || "-",
    row.productBarcode || row.productGoodsCode || row.productCode || "-",
  ].join("::");
}

// ----------------------------------------------------
// Core Export Executions
// ----------------------------------------------------

async function exportAttendanceScanEvents(dateKey, exportDir) {
  console.log(`[1/2] Processing Attendance Scan Events for date: ${dateKey}...`);
  const fromUtc = new Date(`${dateKey}T00:00:00+07:00`).toISOString();
  const toUtc = new Date(`${dateKey}T23:59:59.999+07:00`).toISOString();

  const { data, error } = await supabase
    .from("attendance_scan_events")
    .select("employee_code,event_type,scanned_at,status,employee_name_snapshot,department_snapshot,operator_username_snapshot,operator_user_id,check_in_snapshot,check_out_snapshot")
    .eq("status", "accepted")
    .gte("scanned_at", fromUtc)
    .lte("scanned_at", toUtc);

  if (error) {
    throw new Error(`Database query failed for Scan Events: ${error.message}`);
  }

  console.log(`Fetched ${data.length} raw scan events.`);
  if (data.length === 0) {
    console.log("No scan events recorded for this date. Attendance export skipped.");
    return false;
  }

  // Consolidate rows
  const grouped = new Map();
  data.forEach((event) => {
    const employeeCode = String(event.employee_code || "").trim();
    if (!employeeCode) return;
    const dept = event.department_snapshot || "-";
    const key = `${employeeCode}|${dateKey}|${dept}`;
    const current = grouped.get(key) || {
      id: key,
      date: dateKey,
      employeeCode,
      employeeName: event.employee_name_snapshot || "-",
      department: dept,
      checkIn: "-",
      checkOut: "-",
      checkInSnapshot: normalizeFingerValue(event.check_in_snapshot),
      checkOutSnapshot: normalizeFingerValue(event.check_out_snapshot),
      scannedBy: event.operator_username_snapshot || event.operator_user_id || "-",
    };

    if (event.event_type === "IN" && current.checkIn === "-") {
      current.checkIn = toBangkokTime(event.scanned_at);
    }
    if (event.event_type === "OUT") {
      current.checkOut = toBangkokTime(event.scanned_at);
    }
    grouped.set(key, current);
  });

  const sortedRows = Array.from(grouped.values()).sort((a, b) => {
    if (a.employeeCode === b.employeeCode) {
      return a.checkIn.localeCompare(b.checkIn);
    }
    return a.employeeCode.localeCompare(b.employeeCode);
  });

  const fingerMap = await loadConsolidatedFingerMap(sortedRows);
  const finalRows = sortedRows.map((row) => {
    const fKey = `${row.employeeCode}|${row.date}`;
    const finger = fingerMap.get(fKey);
    const fingerIn = pickFingerValue(finger?.fingerIn, row.checkInSnapshot);
    const fingerOut = pickFingerValue(finger?.fingerOut, row.checkOutSnapshot);
    return {
      ...row,
      fingerIn,
      fingerOut,
      timeGap: getTimeGapDisplay(fingerIn, row.checkIn)
    };
  });

  // Create Excel
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("บันทึกสแกนเข้า-ออก");

  worksheet.columns = [
    { header: "วันที่", key: "date", width: 15 },
    { header: "รหัสพนักงาน", key: "employeeCode", width: 15 },
    { header: "ชื่อพนักงาน", key: "employeeName", width: 25 },
    { header: "แผนกปฏิบัติงาน", key: "department", width: 20 },
    { header: "สแกนนิ้วเข้า", key: "fingerIn", width: 15 },
    { header: "สแกนนิ้วออก", key: "fingerOut", width: 15 },
    { header: "เข้าห้อง", key: "checkIn", width: 12 },
    { header: "ออกห้อง", key: "checkOut", width: 12 },
    { header: "ส่วนต่างสแกน", key: "timeGap", width: 18 },
    { header: "ผู้บันทึกสแกน", key: "scannedBy", width: 20 },
  ];

  const headerRow = worksheet.getRow(1);
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

  finalRows.forEach((row) => {
    const addedRow = worksheet.addRow({
      date: formatDisplayDate(row.date),
      employeeCode: row.employeeCode || "-",
      employeeName: row.employeeName || "-",
      department: row.department || "-",
      fingerIn: row.fingerIn || "-",
      fingerOut: row.fingerOut || "-",
      checkIn: row.checkIn || "-",
      checkOut: row.checkOut || "-",
      timeGap: row.timeGap,
      scannedBy: row.scannedBy || "-",
    });

    addedRow.height = 24;
    addedRow.alignment = { vertical: "middle" };
    addedRow.font = { name: "Arial", size: 10 };

    addedRow.getCell("date").alignment = { vertical: "middle", horizontal: "center" };
    addedRow.getCell("employeeCode").alignment = { vertical: "middle", horizontal: "center" };
    addedRow.getCell("fingerIn").alignment = { vertical: "middle", horizontal: "center" };
    addedRow.getCell("fingerOut").alignment = { vertical: "middle", horizontal: "center" };
    addedRow.getCell("checkIn").alignment = { vertical: "middle", horizontal: "center" };
    addedRow.getCell("checkOut").alignment = { vertical: "middle", horizontal: "center" };
    addedRow.getCell("timeGap").alignment = { vertical: "middle", horizontal: "center" };

    addedRow.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFE2E8F0" } },
        left: { style: "thin", color: { argb: "FFE2E8F0" } },
        bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
        right: { style: "thin", color: { argb: "FFE2E8F0" } },
      };
    });
  });

  const filePath = path.join(exportDir, `รายงานการลงเวลา_${dateKey}.xlsx`);
  await workbook.xlsx.writeFile(filePath);
  console.log(`Scan events Excel file saved: ${filePath}`);
  return true;
}

async function exportSnackWageSummary(dateKey, exportDir) {
  console.log(`[2/2] Processing Snack Wage Daily Summary for date: ${dateKey}...`);
  const fromUtc = new Date(`${dateKey}T00:00:00+07:00`).toISOString();
  const toUtc = new Date(`${dateKey}T23:59:59.999+07:00`).toISOString();

  const { data, error } = await supabase
    .from("production_piece_rate_logs")
    .select("id,logged_at,actual_weighed_at,doc_no,machine_code,employee_code,employee_name_snapshot,product_barcode_snapshot,product_code_snapshot,product_goods_code_snapshot,product_sku_code_snapshot,product_name_snapshot,input_mode_snapshot,input_value,count_value_snapshot,normalized_kg_amount_snapshot,wage_amount_snapshot,doc_status")
    .neq("doc_status", "cancelled")
    .neq("doc_status", "replaced")
    .gte("actual_weighed_at", fromUtc)
    .lte("actual_weighed_at", toUtc);

  if (error) {
    throw new Error(`Database query failed for Snack Wage: ${error.message}`);
  }

  console.log(`Fetched ${data.length} raw piece-rate logs.`);
  if (data.length === 0) {
    console.log("No piece-rate logs recorded for this date. Snack summary export skipped.");
    return false;
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

  // Aggregate rows
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

  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = `A1:L1`;

  const filePath = path.join(exportDir, `รายงานยอดรวมค่าแรงสแนกรายวัน_${dateKey}.xlsx`);
  await workbook.xlsx.writeFile(filePath);
  console.log(`Snack wage summary Excel file saved: ${filePath}`);
  return true;
}

// ----------------------------------------------------
// Main Controller
// ----------------------------------------------------

async function main() {
  console.log("Starting unified daily export process...");

  // 1. Determine target date (Default: Yesterday)
  let dateKey = '';
  const dateArg = process.argv.find(arg => arg.startsWith('--date='));
  
  if (dateArg) {
    dateKey = dateArg.split('=')[1];
    console.log(`Using manually overridden target date: ${dateKey}`);
  } else {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() - 1);
    dateKey = toBangkokDateKey(targetDate);
    console.log(`Using default target date (yesterday): ${dateKey}`);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    console.error("Error: Date argument must be in YYYY-MM-DD format.");
    safeExit(1);
    return;
  }

  // 2. Resolve Year & Month folders (based on CURRENT date by default, or target date if overridden)
  let folderYear = '';
  let folderMonth = '';

  if (dateArg) {
    // If overridden manually, group folders by target date's year & month to avoid misplacement
    const [y, m] = dateKey.split('-');
    folderYear = y;
    folderMonth = m;
  } else {
    // Standard daily run at 01:00 AM: Group folders based on the CURRENT date (today) in Bangkok
    const now = new Date();
    folderYear = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", year: "numeric" }).format(now);
    folderMonth = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Bangkok", month: "2-digit" }).format(now);
  }

  console.log(`Folder Directory Year/Month: ${folderYear}/${folderMonth}`);

  // 3. Resolve and create base folders
  const baseExportDir = process.env.AUTO_EXPORT_DIR || '\\\\192.168.1.76\\KPF-Quickplan';
  const exportDir = path.join(baseExportDir, folderYear, folderMonth);

  try {
    if (!fs.existsSync(exportDir)) {
      console.log(`Creating directories: ${exportDir}`);
      fs.mkdirSync(exportDir, { recursive: true });
    }
  } catch (err) {
    console.error(`Warning: Could not create directory ${exportDir} (Will attempt to write anyway): ${err.message}`);
  }

  // 4. Run both export functions
  let successCount = 0;
  
  try {
    const status1 = await exportAttendanceScanEvents(dateKey, exportDir);
    if (status1) successCount++;
  } catch (err) {
    console.error("Error exporting Attendance Scan Events:", err.message || err);
  }

  try {
    const status2 = await exportSnackWageSummary(dateKey, exportDir);
    if (status2) successCount++;
  } catch (err) {
    console.error("Error exporting Snack Wage Summary:", err.message || err);
  }

  console.log(`Daily export completed. Successfully exported ${successCount} reports to: ${exportDir}`);
  safeExit(0);
}

main().catch((err) => {
  console.error("Fatal export process failure:", err);
  safeExit(1);
});
