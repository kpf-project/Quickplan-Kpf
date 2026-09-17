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
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  });
}

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeCode(value) {
  return normalizeText(value).toUpperCase();
}

function normalizeMasterPlanNo(value) {
  const normalized = normalizeCode(value);
  if (/^MP\d{9}$/.test(normalized)) return normalized;
  const dashedMatch = normalized.match(/^MP-(\d{4})-(\d{2})-(\d{3})$/);
  if (dashedMatch) {
    return `MP${dashedMatch[1]}${dashedMatch[2]}${dashedMatch[3]}`;
  }
  return "";
}

function normalizeDepartmentCodeForPlanNo(value) {
  return normalizeCode(value)
    .replace(/[^A-Z0-9_]/g, "")
    .slice(0, 32);
}

function buildSubPlanNo(masterPlanNo, departmentCode) {
  const normalizedMasterPlanNo = normalizeMasterPlanNo(masterPlanNo);
  const normalizedDepartmentCode = normalizeDepartmentCodeForPlanNo(departmentCode) || "UNASSIGNED";
  const matched = normalizedMasterPlanNo.match(/^MP(\d{4})(\d{2})(\d{3})$/);
  if (!matched) return "";
  return `SP-${matched[1]}-${matched[2]}-${matched[3]}-${normalizedDepartmentCode}`;
}

function parseArgs(argv) {
  return {
    apply: argv.includes("--apply"),
    masterPlanNo: normalizeMasterPlanNo(
      argv.find((arg) => arg.startsWith("--master-plan="))?.slice("--master-plan=".length)
    ),
    limit: Number(argv.find((arg) => arg.startsWith("--limit="))?.slice("--limit=".length)) || 0,
  };
}

async function loadSubPlanStatusRows(supabase, options) {
  let query = supabase
    .from("production_plan_status")
    .select("plan_id,master_plan_no,owner_department_id,sub_plan_no,status,confirmed_at,period_start,updated_at")
    .eq("plan_kind", "sub")
    .order("master_plan_no", { ascending: true })
    .order("owner_department_id", { ascending: true })
    .order("period_start", { ascending: true });

  if (options.masterPlanNo) {
    query = query.eq("master_plan_no", options.masterPlanNo);
  }
  if (options.limit > 0) {
    query = query.limit(options.limit);
  }

  const result = await query;
  if (result.error) throw result.error;
  return Array.isArray(result.data) ? result.data : [];
}

async function loadSubPlanRows(supabase, options) {
  let query = supabase
    .from("production_sub_plans")
    .select("id,sub_plan_no,master_plan_no,department_id,status,confirmed_at,confirmed_by,confirmed_by_name,note,created_at,updated_at,created_by,updated_by")
    .order("master_plan_no", { ascending: true })
    .order("department_id", { ascending: true })
    .order("confirmed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false });

  if (options.masterPlanNo) {
    query = query.eq("master_plan_no", options.masterPlanNo);
  }
  if (options.limit > 0) {
    query = query.limit(Math.max(options.limit * 2, options.limit));
  }

  const result = await query;
  if (result.error) throw result.error;
  return Array.isArray(result.data) ? result.data : [];
}

async function loadDepartments(supabase, departmentIds) {
  const ids = Array.from(new Set((departmentIds || []).map(normalizeText).filter(Boolean)));
  if (!ids.length) return new Map();
  const result = await supabase
    .from("production_departments")
    .select("id,code,name")
    .in("id", ids);
  if (result.error) throw result.error;
  return new Map(
    (result.data || []).map((row) => [
      normalizeText(row?.id),
      {
        id: normalizeText(row?.id),
        code: normalizeCode(row?.code),
        name: normalizeText(row?.name),
      },
    ])
  );
}

function chooseKeeperRow(rows, canonicalSubPlanNo) {
  const normalizedCanonical = normalizeCode(canonicalSubPlanNo);
  const sortedRows = (Array.isArray(rows) ? rows : []).slice().sort((left, right) => {
    const leftCanonical = normalizeCode(left?.sub_plan_no) === normalizedCanonical ? 1 : 0;
    const rightCanonical = normalizeCode(right?.sub_plan_no) === normalizedCanonical ? 1 : 0;
    if (leftCanonical !== rightCanonical) return rightCanonical - leftCanonical;
    const leftConfirmed = normalizeText(left?.confirmed_at);
    const rightConfirmed = normalizeText(right?.confirmed_at);
    if (leftConfirmed !== rightConfirmed) return rightConfirmed.localeCompare(leftConfirmed);
    const leftUpdated = normalizeText(left?.updated_at || left?.created_at);
    const rightUpdated = normalizeText(right?.updated_at || right?.created_at);
    return rightUpdated.localeCompare(leftUpdated);
  });
  return sortedRows[0] || null;
}

function buildMergePlan({ statusRows, subPlanRows, departmentMap }) {
  const grouped = new Map();

  statusRows.forEach((row) => {
    const masterPlanNo = normalizeMasterPlanNo(row?.master_plan_no);
    const departmentId = normalizeText(row?.owner_department_id);
    if (!masterPlanNo || !departmentId) return;
    const key = `${masterPlanNo}::${departmentId}`;
    const current = grouped.get(key) || {
      masterPlanNo,
      departmentId,
      statusRows: [],
      subPlanRows: [],
    };
    current.statusRows.push(row);
    grouped.set(key, current);
  });

  subPlanRows.forEach((row) => {
    const masterPlanNo = normalizeMasterPlanNo(row?.master_plan_no);
    const departmentId = normalizeText(row?.department_id);
    if (!masterPlanNo || !departmentId) return;
    const key = `${masterPlanNo}::${departmentId}`;
    const current = grouped.get(key) || {
      masterPlanNo,
      departmentId,
      statusRows: [],
      subPlanRows: [],
    };
    current.subPlanRows.push(row);
    grouped.set(key, current);
  });

  return Array.from(grouped.values())
    .map((group) => {
      const department = departmentMap.get(group.departmentId) || null;
      const canonicalSubPlanNo = buildSubPlanNo(group.masterPlanNo, department?.code || "UNASSIGNED");
      const distinctStatusSubPlanNos = Array.from(
        new Set(group.statusRows.map((row) => normalizeCode(row?.sub_plan_no)).filter(Boolean))
      );
      const distinctSubPlanTableNos = Array.from(
        new Set(group.subPlanRows.map((row) => normalizeCode(row?.sub_plan_no)).filter(Boolean))
      );
      const allObservedSubPlanNos = Array.from(
        new Set([...distinctStatusSubPlanNos, ...distinctSubPlanTableNos].filter(Boolean))
      );
      const keeperRow = chooseKeeperRow(group.subPlanRows, canonicalSubPlanNo);
      const duplicateRows = group.subPlanRows.filter((row) => row !== keeperRow);
      const needsStatusUpdate =
        group.statusRows.length > 0
        && group.statusRows.some((row) => normalizeCode(row?.sub_plan_no) !== canonicalSubPlanNo);
      const needsSubPlanRowUpdate =
        keeperRow
        && normalizeCode(keeperRow?.sub_plan_no) !== canonicalSubPlanNo;
      const needsDuplicateCleanup = duplicateRows.length > 0;
      const requiresRepair =
        Boolean(canonicalSubPlanNo)
        && (needsStatusUpdate || needsSubPlanRowUpdate || needsDuplicateCleanup);

      return {
        ...group,
        department,
        canonicalSubPlanNo,
        distinctStatusSubPlanNos,
        distinctSubPlanTableNos,
        allObservedSubPlanNos,
        keeperRow,
        duplicateRows,
        needsStatusUpdate,
        needsSubPlanRowUpdate,
        needsDuplicateCleanup,
        requiresRepair,
      };
    })
    .filter((group) => group.statusRows.length > 0 || group.subPlanRows.length > 0)
    .sort((left, right) => {
      const masterCompare = left.masterPlanNo.localeCompare(right.masterPlanNo);
      if (masterCompare !== 0) return masterCompare;
      return left.departmentId.localeCompare(right.departmentId);
    });
}

async function applyRepair(supabase, group, nowIso) {
  if (group.needsStatusUpdate) {
    const planIds = group.statusRows
      .map((row) => normalizeText(row?.plan_id))
      .filter(Boolean);
    if (planIds.length) {
      const updateResult = await supabase
        .from("production_plan_status")
        .update({
          sub_plan_no: group.canonicalSubPlanNo,
          updated_at: nowIso,
        })
        .in("plan_id", planIds);
      if (updateResult.error) throw updateResult.error;
    }
  }

  if (group.keeperRow) {
    const status =
      group.subPlanRows.some((row) => normalizeText(row?.confirmed_at))
        ? "confirmed"
        : normalizeText(group.keeperRow?.status) || "draft";
    const confirmedRows = group.subPlanRows
      .filter((row) => normalizeText(row?.confirmed_at))
      .sort((left, right) => normalizeText(right?.confirmed_at).localeCompare(normalizeText(left?.confirmed_at)));
    const latestConfirmedRow = confirmedRows[0] || null;
    const updatePayload = {
      sub_plan_no: group.canonicalSubPlanNo,
      status,
      confirmed_at: latestConfirmedRow?.confirmed_at || null,
      confirmed_by: latestConfirmedRow?.confirmed_by || group.keeperRow?.confirmed_by || null,
      confirmed_by_name: latestConfirmedRow?.confirmed_by_name || group.keeperRow?.confirmed_by_name || null,
      note: normalizeText(group.keeperRow?.note) || null,
      updated_at: nowIso,
    };
    const updateKeeperResult = await supabase
      .from("production_sub_plans")
      .update(updatePayload)
      .eq("id", group.keeperRow.id);
    if (updateKeeperResult.error) throw updateKeeperResult.error;
  }

  if (group.duplicateRows.length) {
    const duplicateIds = group.duplicateRows
      .map((row) => row?.id)
      .filter(Boolean);
    if (duplicateIds.length) {
      const deleteResult = await supabase
        .from("production_sub_plans")
        .delete()
        .in("id", duplicateIds);
      if (deleteResult.error) throw deleteResult.error;
    }
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

  const [statusRows, subPlanRows] = await Promise.all([
    loadSubPlanStatusRows(supabase, options),
    loadSubPlanRows(supabase, options),
  ]);
  const departmentMap = await loadDepartments(
    supabase,
    [
      ...statusRows.map((row) => row?.owner_department_id),
      ...subPlanRows.map((row) => row?.department_id),
    ]
  );

  const groups = buildMergePlan({ statusRows, subPlanRows, departmentMap });
  const repairGroups = groups.filter((group) => group.requiresRepair);

  if (options.apply) {
    const nowIso = new Date().toISOString();
    for (const group of repairGroups) {
      await applyRepair(supabase, group, nowIso);
    }
  }

  const summary = {
    apply: options.apply,
    masterPlanNo: options.masterPlanNo || null,
    inspectedStatusRows: statusRows.length,
    inspectedSubPlanRows: subPlanRows.length,
    inspectedGroups: groups.length,
    repairGroupCount: repairGroups.length,
    repairGroups: repairGroups.map((group) => ({
      masterPlanNo: group.masterPlanNo,
      departmentId: group.departmentId,
      departmentCode: group.department?.code || null,
      departmentName: group.department?.name || null,
      canonicalSubPlanNo: group.canonicalSubPlanNo,
      observedSubPlanNos: group.allObservedSubPlanNos,
      statusPlanIds: group.statusRows.map((row) => normalizeText(row?.plan_id)).filter(Boolean),
      subPlanRowIds: group.subPlanRows.map((row) => row?.id).filter(Boolean),
      keeperSubPlanRowId: group.keeperRow?.id || null,
      duplicateSubPlanRowIds: group.duplicateRows.map((row) => row?.id).filter(Boolean),
      needsStatusUpdate: group.needsStatusUpdate,
      needsSubPlanRowUpdate: group.needsSubPlanRowUpdate,
      needsDuplicateCleanup: group.needsDuplicateCleanup,
    })),
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
