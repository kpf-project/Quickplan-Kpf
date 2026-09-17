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
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

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

async function runAutoExport() {
  console.log("Starting automated daily scan events export...");
  
  // Calculate target date: Yesterday
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() - 1);
  const dateKey = toBangkokDateKey(targetDate);
  console.log(`Target Date: ${dateKey}`);

  // Create UTC range in Asia/Bangkok
  const fromUtc = new Date(`${dateKey}T00:00:00+07:00`).toISOString();
  const toUtc = new Date(`${dateKey}T23:59:59.999+07:00`).toISOString();

  console.log(`Fetching scan events between ${fromUtc} and ${toUtc}...`);
  const { data, error } = await supabase
    .from("attendance_scan_events")
    .select("employee_code,event_type,scanned_at,status,employee_name_snapshot,department_snapshot,operator_username_snapshot,operator_user_id,check_in_snapshot,check_out_snapshot")
    .eq("status", "accepted")
    .gte("scanned_at", fromUtc)
    .lte("scanned_at", toUtc);

  if (error) {
    console.error("Database query failed:", error.message);
    process.exit(1);
  }

  console.log(`Fetched ${data.length} raw scan events.`);
  if (data.length === 0) {
    console.log("No scan events recorded for yesterday. Export process skipped.");
    process.exit(0);
  }

  // Consolidate rows (Group by employee_code + date + department)
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

  console.log(`Consolidated into ${sortedRows.length} employee attendance rows.`);

  // Load fingerprint check-in/out times from API Gateway
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

  // Create Excel Workbook
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

  // Output folder configuration (defaults to network share)
  const exportDir = process.env.AUTO_EXPORT_DIR || '\\\\192.168.1.76\\KPF-Quickplan';
  if (!fs.existsSync(exportDir)) {
    console.log(`Creating export directory: ${exportDir}`);
    fs.mkdirSync(exportDir, { recursive: true });
  }

  const filePath = path.join(exportDir, `รายงานการลงเวลา_${dateKey}.xlsx`);
  await workbook.xlsx.writeFile(filePath);
  
  console.log(`Excel file exported successfully: ${filePath}`);
}

runAutoExport().catch((err) => {
  console.error("Export script failed with error:", err);
  process.exit(1);
});
