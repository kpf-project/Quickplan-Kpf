import { getSupabaseAdmin } from "@/lib/adminApi";
import { getEmployeeCodeMatchKey, normalizeEmployeeCode } from "@/lib/employeeCode";
import { fetchGatewayJson } from "@/lib/gatewayClient";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { createAppError, fail, ok } from "@/lib/result";
import { normalizeParam, parsePaginationParams } from "@/lib/validation";

const VIEW_PERMISSIONS = [
  "production-line-attendance-report-view",
  "production-line-attendance-report-manage",
  "production-line-attendance-view",
  "production-line-attendance-manage",
  "admin-attendance",
];

function toBangkokDateKey(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
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
  if (!year || !month || !day) return null;
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

function toUtcRange(dateFrom, dateTo) {
  const from = dateFrom || new Date().toISOString().slice(0, 10);
  const to = dateTo || from;
  return {
    from: new Date(`${from}T00:00:00+07:00`).toISOString(),
    to: new Date(`${to}T23:59:59.999+07:00`).toISOString(),
  };
}

function normalizeFingerOut(checkIn, checkOut) {
  if (!checkOut || checkOut === checkIn) return "-";
  return checkOut;
}

function normalizeFingerValue(value) {
  const text = String(value || "").trim();
  return text || "-";
}

function pickFingerValue(primary, fallback) {
  return primary && primary !== "-" ? primary : fallback || "-";
}

function pickOptionalFingerValue(primary) {
  return primary && primary !== "-" ? primary : "-";
}

function padEmployeeCode(code) {
  const clean = String(code || "").trim().toUpperCase();
  const alnum = clean.replace(/KPF/g, "").replace(/[^A-Z0-9]/g, "");
  if (/^\d+$/.test(alnum)) {
    return `KPF-${alnum.padStart(5, "0")}`;
  }
  return code;
}

async function loadConsolidatedFingerMap(rows) {
  if (!rows.length) return new Map();

  const fingerMap = new Map();
  const uniqueRows = Array.from(
    new Map(rows.map((row) => [`${row.employeeCode}|${row.date}`, row])).values()
  );

  const batchSize = 50;
  for (let index = 0; index < uniqueRows.length; index += batchSize) {
    const chunk = uniqueRows.slice(index, index + batchSize);
    const params = new URLSearchParams({
      items: JSON.stringify(
        chunk.map((row) => ({
          employeeCode: padEmployeeCode(row.employeeCode),
          date: row.date,
        }))
      ),
    });
    const result = await fetchGatewayJson(
      "/api/consolidated-lookup-batch",
      params,
      "realtime"
    );
    if (!result.ok) continue;

    const payloadRows = Array.isArray(result.data?.data) ? result.data.data : [];
    payloadRows.forEach((payload) => {
      const employeeCode = normalizeEmployeeCode(payload.EmployeeCode)
        || normalizeEmployeeCode(payload.employeeCode)
        || normalizeEmployeeCode(payload.PRS_NO)
        || "";
      const employeeMatchKey = getEmployeeCodeMatchKey(
        payload.EmployeeCode || payload.employeeCode || payload.PRS_NO
      );
      const date = String(payload.DateStr || payload.date || "").trim();
      if (!employeeCode || !employeeMatchKey || !date) return;
      const fingerIn = normalizeFingerValue(payload.CheckIn);
      const fingerOut = normalizeFingerOut(payload.CheckIn, payload.CheckOut);
      const paddedMatchKey = /^\d+$/.test(employeeMatchKey) ? employeeMatchKey.padStart(5, "0") : employeeMatchKey;
      fingerMap.set(`${paddedMatchKey}|${date}`, {
        hasLiveLookup: true,
        fingerIn,
        fingerOut,
        fingerInMorning: normalizeFingerValue(payload.FingerInMorning || payload.CheckIn),
        fingerOutLunch: pickOptionalFingerValue(payload.FingerOutLunch),
        fingerInAfternoon: pickOptionalFingerValue(payload.FingerInAfternoon),
        fingerOutEvening: pickOptionalFingerValue(payload.FingerOutEvening || payload.CheckOut),
        fingerScanTimes: Array.isArray(payload.FingerScanTimes)
          ? payload.FingerScanTimes.map((value) => String(value || "").trim()).filter(Boolean)
          : [],
      });
    });
  }

  return fingerMap;
}

export async function listAttendanceScanEvents(request) {
  await requirePermissionKeys(request, VIEW_PERMISSIONS);

  const { searchParams } = new URL(request.url);
  const { page, pageSize: rawPageSize } = parsePaginationParams(searchParams, {
    page: 1,
    pageSize: 20,
  });
  const isExport = searchParams.get("export") === "true";
  const pageSize = isExport ? 10000 : Math.min(rawPageSize, 100);
  if (!page || !pageSize) {
    return fail(createAppError("validation", "Invalid pagination values"), {
      status: 400,
    });
  }

  const search = normalizeParam(searchParams.get("search"));
  const dateFrom = normalizeParam(searchParams.get("dateFrom"));
  const dateTo = normalizeParam(searchParams.get("dateTo"));
  const { from, to } = toUtcRange(dateFrom, dateTo);

  const supabaseAdmin = getSupabaseAdmin();
  let query = supabaseAdmin
    .from("attendance_scan_events")
    .select(
      "employee_code,event_type,scanned_at,status,employee_name_snapshot,department_snapshot,branch_snapshot,operator_user_id,operator_username_snapshot,check_in_snapshot,check_out_snapshot"
      + ",raw_qr_payload"
    )
    .eq("status", "accepted")
    .gte("scanned_at", from)
    .lte("scanned_at", to)
    .order("scanned_at", { ascending: true });

  if (search) {
    query = query.or(
      `employee_code.ilike.%${search}%,raw_qr_payload.ilike.%${search}%,employee_name_snapshot.ilike.%${search}%,department_snapshot.ilike.%${search}%,branch_snapshot.ilike.%${search}%`
    );
  }

  const { data, error } = await query;
  if (error) {
    return fail(
      createAppError("database", "Failed to load attendance scan events", error.message),
      { status: 500 }
    );
  }

  const grouped = new Map();
  (data || []).forEach((event) => {
    const employeeCode =
      normalizeEmployeeCode(event.raw_qr_payload)
      || normalizeEmployeeCode(event.employee_code)
      || String(event.employee_code || "").trim();
    const employeeMatchKey = getEmployeeCodeMatchKey(event.employee_code || event.raw_qr_payload);
    const dateKey = toBangkokDateKey(event.scanned_at);
    if (!employeeCode || !employeeMatchKey || !dateKey) return;
    const dept = event.department_snapshot || "-";
    const key = `${employeeMatchKey}|${dateKey}|${dept}`;
    const current = grouped.get(key) || {
      id: key,
      date: dateKey,
      employeeCode,
      employeeMatchKey,
      employeeName: event.employee_name_snapshot || "-",
      department: dept,
      branch: event.branch_snapshot || "-",
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

  const sorted = Array.from(grouped.values()).sort((a, b) => {
    if (a.date === b.date) {
      if (a.employeeCode === b.employeeCode) {
        return a.checkIn.localeCompare(b.checkIn);
      }
      return a.employeeCode.localeCompare(b.employeeCode);
    }
    return a.date > b.date ? -1 : 1;
  });

  const totalRecords = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalRecords / pageSize));
  const start = (page - 1) * pageSize;
  const pagedBase = sorted.slice(start, start + pageSize);

  const fingerMap = await loadConsolidatedFingerMap(pagedBase);

  const paged = pagedBase.map((row) => {
    const paddedMatchKey = /^\d+$/.test(row.employeeMatchKey) ? row.employeeMatchKey.padStart(5, "0") : row.employeeMatchKey;
    const key = `${paddedMatchKey}|${row.date}`;
    const finger = fingerMap.get(key);
    const hasLiveLookup = Boolean(finger?.hasLiveLookup);
    return {
      ...row,
      fingerIn: pickOptionalFingerValue(finger?.fingerIn),
      fingerOut: pickOptionalFingerValue(finger?.fingerOut),
      fingerInMorning: pickOptionalFingerValue(finger?.fingerInMorning),
      fingerOutLunch: pickOptionalFingerValue(finger?.fingerOutLunch),
      fingerInAfternoon: pickOptionalFingerValue(finger?.fingerInAfternoon),
      fingerOutEvening: pickOptionalFingerValue(finger?.fingerOutEvening),
      fingerScanTimes: Array.isArray(finger?.fingerScanTimes) ? finger.fingerScanTimes : [],
    };
  });

  return ok(
    {
      data: paged,
      pagination: {
        page,
        pageSize,
        totalRecords,
        totalPages,
      },
    },
    { status: 200 }
  );
}
