"use strict";

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const WIP_QTY_INPUT_MODES = {
  UNIT: "unit",
  BATCH: "batch",
};

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

function normalizeSku(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeFormulaCode(value) {
  return normalizeSku(value) || "DEFAULT";
}

function normalizeMasterPlanNo(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (/^MP\d{4}\d{2}\d{3}$/.test(normalized)) return normalized;
  const dashedMatch = normalized.match(/^MP-(\d{4})-(\d{2})-(\d{3})$/);
  if (dashedMatch) {
    return `MP${dashedMatch[1]}${dashedMatch[2]}${dashedMatch[3]}`;
  }
  return "";
}

function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function roundQty(value, digits = 3) {
  return Number(toFiniteNumber(value, 0).toFixed(digits));
}

function normalizeWipQtyInputMode(value, fallback = WIP_QTY_INPUT_MODES.BATCH) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === WIP_QTY_INPUT_MODES.UNIT || normalized === WIP_QTY_INPUT_MODES.BATCH) {
    return normalized;
  }
  return fallback;
}

function resolveScaleBase(versionRow) {
  const baseOutputBoxes = Number(versionRow?.base_output_boxes);
  const baseBatch = Number(versionRow?.base_batch);
  const wipQtyInputMode = normalizeWipQtyInputMode(versionRow?.wip_qty_input_mode);
  if (wipQtyInputMode === WIP_QTY_INPUT_MODES.UNIT) {
    if (Number.isFinite(baseOutputBoxes) && baseOutputBoxes > 0) return baseOutputBoxes;
    if (Number.isFinite(baseBatch) && baseBatch > 0) return baseBatch;
    return 1;
  }
  if (Number.isFinite(baseBatch) && baseBatch > 0) return baseBatch;
  if (Number.isFinite(baseOutputBoxes) && baseOutputBoxes > 0) return baseOutputBoxes;
  return 1;
}

function resolveItemTypeByCategory(iccatCode) {
  const normalized = String(iccatCode || "").trim().toUpperCase();
  if (normalized === "03") return "WIP";
  if (normalized) return "RAW";
  return "UNKNOWN";
}

function chooseVersionForPlan(planRow, versions, latestApproved = false) {
  const preferredVersionId = String(planRow?.bom_version_id || "").trim();
  const preferredFormulaCode = normalizeFormulaCode(planRow?.formula_code);
  if (latestApproved) return versions[0] || null;
  return (
    versions.find((version) => String(version?.id || "") === preferredVersionId) ||
    versions.find((version) => normalizeFormulaCode(version?.formula_code) === preferredFormulaCode) ||
    versions[0] ||
    null
  );
}

async function loadApprovedBomVersionsBySku(supabase, skuCodes) {
  const normalizedSkus = Array.from(new Set((skuCodes || []).map(normalizeSku).filter(Boolean)));
  if (!normalizedSkus.length) return new Map();
  const result = await supabase
    .from("production_boms")
    .select(`
      sku_code,
      production_bom_versions!inner (
        id,
        version_no,
        status,
        formula_code,
        formula_name,
        base_batch,
        base_output_boxes,
        wip_qty_input_mode,
        production_bom_items (
          material_sku_code,
          material_goods_code,
          qty,
          uom_name,
          products_cache (
            sku_name,
            iccat_code
          )
        )
      )
    `)
    .in("sku_code", normalizedSkus)
    .eq("production_bom_versions.status", "approved")
    .order("version_no", { foreignTable: "production_bom_versions", ascending: false });
  if (result.error) {
    throw result.error;
  }
  const versionsBySku = new Map();
  (result.data || []).forEach((row) => {
    const skuCode = normalizeSku(row?.sku_code);
    const versions = Array.isArray(row?.production_bom_versions)
      ? row.production_bom_versions
      : [];
    if (!skuCode || !versions.length) return;
    versionsBySku.set(skuCode, versions);
  });
  return versionsBySku;
}

function buildDirectSnapshot(planRow, selectedVersion, nowIso, source) {
  const skuCode = normalizeSku(planRow?.sku_code);
  const plannedQty = toFiniteNumber(planRow?.planned_qty, 0);
  const scaleBase = resolveScaleBase(selectedVersion);
  const scale = scaleBase > 0 ? plannedQty / scaleBase : 0;
  const materials = (Array.isArray(selectedVersion?.production_bom_items)
    ? selectedVersion.production_bom_items
    : [])
    .map((item) => {
      const cachedProduct = Array.isArray(item?.products_cache)
        ? item.products_cache[0]
        : item?.products_cache;
      const qty = toFiniteNumber(item?.qty, 0);
      const requiredQty = roundQty(scale * qty);
      return {
        skuCode: normalizeSku(item?.material_sku_code),
        goodsCode: normalizeSku(item?.material_goods_code || item?.material_sku_code),
        name: String(cachedProduct?.sku_name || "").trim() || normalizeSku(item?.material_sku_code),
        requiredQty,
        issueQty: Math.ceil(requiredQty),
        unit: String(item?.uom_name || "").trim() || "unit",
        itemType: resolveItemTypeByCategory(cachedProduct?.iccat_code),
        hasCycle: false,
        explosionDepth: 1,
      };
    })
    .filter((row) => row.skuCode && row.requiredQty > 0);

  return [{
    skuCode,
    skuName: String(planRow?.sku_name || "").trim() || skuCode,
    plannedQty: roundQty(plannedQty),
    baseBatch: Number(selectedVersion?.base_batch) > 0 ? Number(selectedVersion.base_batch) : 1,
    unit: String(planRow?.unit || "unit").trim() || "unit",
    bomVersionId: selectedVersion?.id || planRow?.bom_version_id || null,
    formulaCode: normalizeFormulaCode(selectedVersion?.formula_code || planRow?.formula_code),
    formulaName: String(selectedVersion?.formula_name || planRow?.formula_name || "").trim() || "DEFAULT",
    generatedAt: nowIso,
    source,
    materials,
  }];
}

function normalizeSnapshotForCompare(snapshotList) {
  return (Array.isArray(snapshotList) ? snapshotList : []).map((snapshot) => ({
    skuCode: normalizeSku(snapshot?.skuCode),
    plannedQty: roundQty(snapshot?.plannedQty, 3),
    baseBatch: toFiniteNumber(snapshot?.baseBatch, 0),
    unit: String(snapshot?.unit || "").trim(),
    bomVersionId: snapshot?.bomVersionId || null,
    formulaCode: normalizeFormulaCode(snapshot?.formulaCode),
    formulaName: String(snapshot?.formulaName || "").trim(),
    materials: (Array.isArray(snapshot?.materials) ? snapshot.materials : [])
      .map((material) => ({
        skuCode: normalizeSku(material?.skuCode),
        goodsCode: normalizeSku(material?.goodsCode || material?.skuCode),
        name: String(material?.name || "").trim(),
        requiredQty: roundQty(material?.requiredQty, 3),
        issueQty: toFiniteNumber(material?.issueQty, 0),
        unit: String(material?.unit || "").trim(),
        itemType: String(material?.itemType || "").trim().toUpperCase(),
        hasCycle: Boolean(material?.hasCycle),
        explosionDepth: toFiniteNumber(material?.explosionDepth, 0),
      }))
      .sort((left, right) =>
        `${left.skuCode}::${left.goodsCode}`.localeCompare(`${right.skuCode}::${right.goodsCode}`)
      ),
  }));
}

function parseArgs(argv) {
  const options = {
    apply: false,
    latestApproved: false,
    masterPlanNo: "",
    limit: 0,
  };
  argv.forEach((arg) => {
    if (arg === "--apply") {
      options.apply = true;
      return;
    }
    if (arg === "--latest-approved") {
      options.latestApproved = true;
      return;
    }
    if (arg.startsWith("--master-plan=")) {
      options.masterPlanNo = normalizeMasterPlanNo(arg.slice("--master-plan=".length));
      return;
    }
    if (arg.startsWith("--limit=")) {
      options.limit = Number(arg.slice("--limit=".length)) || 0;
    }
  });
  return options;
}

async function loadSubplanRows(supabase, options) {
  let query = supabase
    .from("production_plan_status")
    .select("plan_id,sku_code,sku_name,planned_qty,unit,period_start,formula_code,formula_name,bom_version_id,status,confirmed_at,owner_department_id,master_plan_no,bom_snapshot")
    .eq("plan_kind", "sub")
    .not("confirmed_at", "is", null)
    .order("confirmed_at", { ascending: false });

  if (options.masterPlanNo) {
    query = query.eq("master_plan_no", options.masterPlanNo);
  }
  if (options.limit > 0) {
    query = query.limit(options.limit);
  }

  const result = await query;
  if (result.error) {
    throw result.error;
  }
  return Array.isArray(result.data) ? result.data : [];
}

async function main() {
  loadEnvFile(path.join(process.cwd(), ".env.local"));
  const options = parseArgs(process.argv.slice(2));
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const rows = await loadSubplanRows(supabase, options);
  if (options.apply && options.latestApproved) {
    const closedResult = await supabase
      .from("production_cost_sheets")
      .select("id", { count: "exact", head: true })
      .eq("status", "closed");
    if (closedResult.error) throw closedResult.error;
    if (closedResult.count > 0) throw new Error(`พบ Cost Sheet ที่ปิดแล้ว ${closedResult.count} รายการ จึงไม่สามารถ restate BOM Snapshot ได้`);
  }
  const versionsBySku = await loadApprovedBomVersionsBySku(
    supabase,
    rows.map((row) => row?.sku_code)
  );
  const nowIso = new Date().toISOString();
  const changedRows = [];
  const skipped = [];

  for (const row of rows) {
    const versions = versionsBySku.get(normalizeSku(row?.sku_code)) || [];
    const selectedVersion = chooseVersionForPlan(row, versions, options.latestApproved);
    if (!selectedVersion) {
      skipped.push({
        planId: row.plan_id,
        masterPlanNo: row.master_plan_no,
        skuCode: row.sku_code,
        reason: "approved_bom_not_found",
      });
      continue;
    }

    const source = options.latestApproved ? "current_approved_bom_restatement" : "subplan_repair";
    const snapshot = buildDirectSnapshot(row, selectedVersion, nowIso, options.apply ? source : `${source}_preview`);
    const currentSnapshot = Array.isArray(row?.bom_snapshot) ? row.bom_snapshot : [];
    const changed = JSON.stringify(normalizeSnapshotForCompare(currentSnapshot))
      !== JSON.stringify(normalizeSnapshotForCompare(snapshot));
    if (!changed) continue;

    changedRows.push({
      planId: String(row?.plan_id || "").trim(),
      masterPlanNo: String(row?.master_plan_no || "").trim().toUpperCase(),
      skuCode: normalizeSku(row?.sku_code),
      currentMaterialCount: Array.isArray(currentSnapshot?.[0]?.materials) ? currentSnapshot[0].materials.length : 0,
      repairedMaterialCount: Array.isArray(snapshot?.[0]?.materials) ? snapshot[0].materials.length : 0,
      previousBomVersionId: row.bom_version_id || null,
      newBomVersionId: selectedVersion.id,
      previousSnapshot: currentSnapshot,
      snapshot,
    });
  }

  if (options.apply && changedRows.length) {
    const backupDir = path.join(process.cwd(), "backups");
    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, `backup-subplan-snapshots-${nowIso.replace(/[:.]/g, "-")}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(changedRows.map((row) => ({
      planId: row.planId,
      masterPlanNo: row.masterPlanNo,
      skuCode: row.skuCode,
      bomVersionId: row.previousBomVersionId,
      bomSnapshot: row.previousSnapshot,
    })), null, 2));
    process.stderr.write(`Backup: ${backupPath}\n`);
    for (const row of changedRows) {
      const updateResult = await supabase
        .from("production_plan_status")
        .update({
          bom_version_id: row.newBomVersionId,
          bom_snapshot: row.snapshot,
          updated_at: nowIso,
        })
        .eq("plan_id", row.planId)
        .select("plan_id")
        .maybeSingle();
      if (updateResult.error) {
        throw updateResult.error;
      }
    }
  }

  const byMasterPlan = new Map();
  changedRows.forEach((row) => {
    if (!byMasterPlan.has(row.masterPlanNo)) {
      byMasterPlan.set(row.masterPlanNo, {
        masterPlanNo: row.masterPlanNo,
        changedPlanIds: [],
        skuCodes: new Set(),
      });
    }
    const target = byMasterPlan.get(row.masterPlanNo);
    target.changedPlanIds.push(row.planId);
    target.skuCodes.add(row.skuCode);
  });

  const summary = {
    apply: options.apply,
    latestApproved: options.latestApproved,
    masterPlanNo: options.masterPlanNo || null,
    inspectedCount: rows.length,
    changedCount: changedRows.length,
    skippedCount: skipped.length,
    masterPlans: Array.from(byMasterPlan.values()).map((row) => ({
      masterPlanNo: row.masterPlanNo,
      changedPlanIds: row.changedPlanIds,
      skuCodes: Array.from(row.skuCodes),
    })),
    changedRows: changedRows.map((row) => ({
      planId: row.planId,
      masterPlanNo: row.masterPlanNo,
      skuCode: row.skuCode,
      previousBomVersionId: row.previousBomVersionId,
      newBomVersionId: row.newBomVersionId,
      currentMaterialCount: row.currentMaterialCount,
      repairedMaterialCount: row.repairedMaterialCount,
    })),
    skipped,
  };

  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error?.message || String(error)}\n`);
  process.exitCode = 1;
});
