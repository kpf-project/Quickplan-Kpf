import crypto from "crypto";
import { ApiError, getSupabaseAdmin, requireUser } from "@/lib/adminApi";
import { normalizeEmployeeCode } from "@/lib/employeeCode";
import { fetchGatewayJson } from "@/lib/gatewayClient";
import {
  buildAttendanceEmployeeVariants,
  formatBangkokAttendanceTime,
  getAttendanceDayState,
  getAttendanceEmployeeKey,
  getBangkokAttendanceDay,
} from "./attendanceScanRules";

const SCAN_EVENT_TABLE = "attendance_scan_events";
const EVENT_TYPES = new Set(["IN", "OUT"]);
const SOURCES = new Set(["camera", "upload"]);
const EVENT_SELECT =
  "id,request_id,employee_code,employee_code_key,scan_business_date,raw_qr_payload,event_type,source,status,scanned_at,operator_user_id,operator_username_snapshot,employee_name_snapshot,department_snapshot,branch_snapshot,check_in_snapshot,check_out_snapshot";

function normalizeEventType(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeSource(value) {
  return String(value || "").trim().toLowerCase();
}

function parseClientDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() || null;
  }
  return request.headers.get("x-real-ip") || null;
}

function mapEmployeeSnapshot(row = {}) {
  const name = [row.EMP_NAME, row.EMP_SURNME]
    .map((value) => String(value || "").trim())
    .filter(Boolean)
    .join(" ");
  return {
    employee_code: normalizeEmployeeCode(row.PRS_NO || row.EMP_INTL) || null,
    employee_name_snapshot: name || String(row.Name || "").trim() || null,
    department_snapshot: String(row.DEPT_THAIDESC || "").trim() || null,
    branch_snapshot: String(row.BR_THAIDESC || "").trim() || null,
  };
}

async function fetchEmployeeSnapshot(employeeCode) {
  const params = new URLSearchParams({
    search: employeeCode,
    status: "active",
    pageSize: "50",
    exact: "true",
  });
  const lookup = await fetchGatewayJson("/api/employees", params, "realtime");
  if (!lookup.ok || (lookup.status && lookup.status >= 400)) {
    throw new ApiError(
      lookup.status || 502,
      lookup.data?.error
        || lookup.error?.message
        || "Failed to lookup employee master"
    );
  }

  const employeeKey = getAttendanceEmployeeKey(employeeCode);
  const rows = Array.isArray(lookup.data?.data) ? lookup.data.data : [];
  const employee = rows.find((row) =>
    [row.PRS_NO, row.EMP_INTL].some(
      (candidate) => getAttendanceEmployeeKey(candidate) === employeeKey
    )
  );
  if (!employee) {
    throw new ApiError(404, "ไม่พบพนักงานจากรหัสที่สแกน");
  }

  return mapEmployeeSnapshot(employee);
}

function mergeRows(results) {
  const rowsById = new Map();
  results.forEach(({ data }) => {
    (data || []).forEach((row) => rowsById.set(row.id, row));
  });
  return Array.from(rowsById.values());
}

async function loadAttendanceDayEvents(
  supabaseAdmin,
  employeeCode,
  attendanceDay
) {
  const employeeKey = getAttendanceEmployeeKey(employeeCode);
  const variants = buildAttendanceEmployeeVariants(employeeCode);
  const buildQuery = () =>
    supabaseAdmin
      .from(SCAN_EVENT_TABLE)
      .select(EVENT_SELECT)
      .eq("status", "accepted")
      .gte("scanned_at", attendanceDay.startIso)
      .lt("scanned_at", attendanceDay.endIso);

  const results = await Promise.all([
    buildQuery().eq("employee_code_key", employeeKey),
    buildQuery().in("employee_code", variants),
    buildQuery().in("raw_qr_payload", variants),
  ]);
  const failedResult = results.find((result) => result.error);
  if (failedResult?.error) {
    throw new ApiError(
      500,
      "Failed to load QR attendance events",
      failedResult.error.message
    );
  }

  return mergeRows(results);
}

function throwAlreadyScanned(eventType) {
  if (eventType === "IN") {
    throw new ApiError(
      400,
      "พนักงานคนนี้บันทึกเวลาเข้างานไปแล้ว ระบบป้องกันการสแกนซ้ำซ้อน",
      { errorType: "already_checked_in" }
    );
  }
  throw new ApiError(
    400,
    "พนักงานคนนี้บันทึกเวลาออกงานไปแล้ว ระบบป้องกันการสแกนซ้ำซ้อน",
    { errorType: "already_checked_out" }
  );
}

function validateAttendanceDayState(state, eventType, force) {
  if (eventType === "IN" && state.inEvent) {
    throwAlreadyScanned("IN");
  }
  if (eventType === "OUT" && state.outEvent) {
    throwAlreadyScanned("OUT");
  }
  if (eventType === "OUT" && !state.inEvent && !force) {
    throw new ApiError(
      400,
      "ยังไม่ได้สแกนเข้างานนะ ต้องการบันทึกใช่ไหม",
      { errorType: "missing_check_in" }
    );
  }
}

function buildResponse(row, duplicated = false) {
  const displayedEmployeeCode =
    normalizeEmployeeCode(row.raw_qr_payload)
    || normalizeEmployeeCode(row.employee_code)
    || row.employee_code;
  return {
    ok: true,
    duplicated,
    data: {
      id: row.id,
      requestId: row.request_id,
      employeeCode: displayedEmployeeCode,
      rawEmployeeCode: row.employee_code,
      rawQrPayload: row.raw_qr_payload || null,
      eventType: row.event_type,
      source: row.source,
      status: row.status,
      scannedAt: row.scanned_at,
      scannedBy: {
        userId: row.operator_user_id || null,
        username: row.operator_username_snapshot || null,
      },
      snapshot: {
        name: row.employee_name_snapshot,
        department: row.department_snapshot,
        branch: row.branch_snapshot,
        checkIn: row.check_in_snapshot,
        checkOut: row.check_out_snapshot,
      },
    },
  };
}

export async function createAttendanceScanEvent(request, body = {}) {
  const { userId, user } = await requireUser(request);

  const employeeCode = normalizeEmployeeCode(body.employeeCode);
  const eventType = normalizeEventType(body.eventType);
  const source = normalizeSource(body.source || "camera");

  if (!employeeCode) {
    throw new ApiError(400, "employeeCode is required");
  }
  if (!EVENT_TYPES.has(eventType)) {
    throw new ApiError(400, "eventType must be IN or OUT");
  }
  if (!SOURCES.has(source)) {
    throw new ApiError(400, "source must be camera or upload");
  }

  const employeeKey = getAttendanceEmployeeKey(employeeCode);
  if (!employeeKey) {
    throw new ApiError(400, "employeeCode is invalid");
  }

  const requestId = String(body.requestId || crypto.randomUUID()).trim();
  if (!requestId) {
    throw new ApiError(400, "requestId is required");
  }

  const rawQrPayload =
    normalizeEmployeeCode(body.rawQrPayload || employeeCode) || employeeCode;
  const scannedAt = new Date().toISOString();
  const attendanceDay = getBangkokAttendanceDay(scannedAt);
  if (!attendanceDay) {
    throw new ApiError(500, "Failed to resolve Bangkok attendance date");
  }

  const supabaseAdmin = getSupabaseAdmin();
  const [snapshot, dayRows, profileResult] = await Promise.all([
    fetchEmployeeSnapshot(employeeCode),
    loadAttendanceDayEvents(supabaseAdmin, employeeCode, attendanceDay),
    supabaseAdmin
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .maybeSingle(),
  ]);
  const dayState = getAttendanceDayState(dayRows, employeeCode);
  validateAttendanceDayState(dayState, eventType, body.force);

  const operatorUsername =
    profileResult?.data?.username
    || user?.email
    || userId;
  const currentTime = formatBangkokAttendanceTime(scannedAt);
  const checkInSnapshot = eventType === "IN"
    ? currentTime
    : formatBangkokAttendanceTime(dayState.inEvent?.scanned_at);
  const checkOutSnapshot = eventType === "OUT" ? currentTime : null;
  const rowPayload = {
    request_id: requestId,
    employee_code: rawQrPayload,
    employee_code_key: employeeKey,
    scan_business_date: attendanceDay.dateKey,
    event_type: eventType,
    source,
    status: "accepted",
    scanned_at: scannedAt,
    client_scanned_at: parseClientDate(body.clientScannedAt),
    gateway_fetched_at: scannedAt,
    employee_name_snapshot: snapshot.employee_name_snapshot,
    department_snapshot: snapshot.department_snapshot,
    branch_snapshot: snapshot.branch_snapshot,
    check_in_snapshot: checkInSnapshot,
    check_out_snapshot: checkOutSnapshot,
    raw_qr_payload: rawQrPayload,
    operator_user_id: userId,
    operator_username_snapshot: operatorUsername,
    device_id: body.deviceId ? String(body.deviceId).trim() : null,
    ip_address: getClientIp(request),
    user_agent: request.headers.get("user-agent") || null,
    metadata:
      body.metadata && typeof body.metadata === "object" ? body.metadata : {},
  };

  const { data, error } = await supabaseAdmin
    .from(SCAN_EVENT_TABLE)
    .insert(rowPayload)
    .select(EVENT_SELECT)
    .single();

  if (!error) {
    return buildResponse(data, false);
  }

  if (error.code === "23505") {
    const { data: existing, error: existingError } = await supabaseAdmin
      .from(SCAN_EVENT_TABLE)
      .select(EVENT_SELECT)
      .eq("request_id", requestId)
      .maybeSingle();
    if (!existingError && existing) {
      return buildResponse(existing, true);
    }

    const concurrentRows = await loadAttendanceDayEvents(
      supabaseAdmin,
      employeeCode,
      attendanceDay
    );
    const concurrentState = getAttendanceDayState(concurrentRows, employeeCode);
    if (
      (eventType === "IN" && concurrentState.inEvent)
      || (eventType === "OUT" && concurrentState.outEvent)
    ) {
      throwAlreadyScanned(eventType);
    }
    throw new ApiError(409, "Duplicate attendance request");
  }

  throw new ApiError(500, "Failed to persist attendance event", error.message);
}
