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
    docNos: argv
      .filter((arg) => arg.startsWith("--doc-no="))
      .map((arg) => normalizeText(arg.slice("--doc-no=".length)))
      .filter(Boolean),
  };
}

async function loadCandidateRows(supabase, options) {
  let query = supabase
    .from("production_piece_rate_logs")
    .select("id,doc_no,request_id,employee_code,raw_employee_qr_payload,logged_at,doc_status")
    .not("raw_employee_qr_payload", "is", null)
    .order("logged_at", { ascending: false });

  if (options.docNos.length === 1) {
    query = query.eq("doc_no", options.docNos[0]);
  } else if (options.docNos.length > 1) {
    query = query.in("doc_no", options.docNos);
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
      const qrCode = normalizeEmployeeCode(row.raw_employee_qr_payload);
      if (!qrCode) return null;
      if (currentCode === qrCode) return null;
      return {
        id: row.id,
        docNo: normalizeText(row.doc_no) || null,
        requestId: normalizeText(row.request_id) || null,
        loggedAt: row.logged_at || null,
        docStatus: normalizeText(row.doc_status) || null,
        beforeEmployeeCode: row.employee_code || null,
        afterEmployeeCode: qrCode,
        rawEmployeeQrPayload: row.raw_employee_qr_payload || null,
      };
    })
    .filter(Boolean);
}

async function applyRepair(supabase, repairRows) {
  for (const row of repairRows) {
    const updateResult = await supabase
      .from("production_piece_rate_logs")
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
    filteredDocNos: options.docNos,
    repairRows,
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
