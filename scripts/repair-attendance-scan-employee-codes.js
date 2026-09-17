"use strict";

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) return;
    const key = trimmed.slice(0, separatorIndex).trim();
    if (!key || process.env[key] != null) return;
    let value = trimmed.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\""))
      || (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  });
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeEmployeeCode(value) {
  return normalizeText(value).toUpperCase().replace(/\s+/g, "");
}

function parseArgs(argv) {
  return {
    apply: argv.includes("--apply"),
    limit: Number(argv.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length)) || 0,
    requestIds: argv
      .filter((arg) => arg.startsWith("--request-id="))
      .map((arg) => normalizeText(arg.slice("--request-id=".length)))
      .filter(Boolean),
  };
}

async function loadCandidateRows(supabase, options) {
  let query = supabase
    .from("attendance_scan_events")
    .select("id,request_id,employee_code,raw_qr_payload,scanned_at,status,event_type")
    .not("raw_qr_payload", "is", null)
    .order("scanned_at", { ascending: false });

  if (options.requestIds.length === 1) {
    query = query.eq("request_id", options.requestIds[0]);
  } else if (options.requestIds.length > 1) {
    query = query.in("request_id", options.requestIds);
  }

  if (options.limit > 0) {
    query = query.limit(options.limit);
  }

  const result = await query;
  if (result.error) throw result.error;
  return Array.isArray(result.data) ? result.data : [];
}

function buildRepairPlan(rows) {
  return (rows || [])
    .map((row) => {
      const currentCode = normalizeEmployeeCode(row.employee_code);
      const qrCode = normalizeEmployeeCode(row.raw_qr_payload);
      if (!qrCode) return null;
      if (currentCode === qrCode) return null;
      return {
        id: row.id,
        requestId: normalizeText(row.request_id) || null,
        scannedAt: row.scanned_at || null,
        status: normalizeText(row.status) || null,
        eventType: normalizeText(row.event_type) || null,
        beforeEmployeeCode: row.employee_code || null,
        afterEmployeeCode: qrCode,
        rawQrPayload: row.raw_qr_payload || null,
      };
    })
    .filter(Boolean);
}

async function applyRepair(supabase, repairRows) {
  for (const row of repairRows) {
    const updateResult = await supabase
      .from("attendance_scan_events")
      .update({
        employee_code: row.afterEmployeeCode,
      })
      .eq("id", row.id);
    if (updateResult.error) throw updateResult.error;
  }
}

async function main() {
  loadEnvFile(path.join(process.cwd(), ".env.local"));
  const options = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const rows = await loadCandidateRows(supabase, options);
  const repairRows = buildRepairPlan(rows);

  if (options.apply && repairRows.length > 0) {
    await applyRepair(supabase, repairRows);
  }

  const summary = {
    apply: options.apply,
    inspectedRowCount: rows.length,
    repairRowCount: repairRows.length,
    filteredRequestIds: options.requestIds,
    repairRows,
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
