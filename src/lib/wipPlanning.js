import "server-only";

import { explodeBomBatch, explodeBomBatchWithPlanningOffsets } from "@/lib/bomExplosionRpc";
import { BOM_ITEM_TYPES, resolveItemTypeByCategory } from "@/lib/bomMatrix";
import { applyStockDeduction } from "@/lib/stockDeduction";
import { fetchGatewayJson } from "@/lib/gatewayClient";
import { normalizeMasterPlanNo } from "@/lib/planNo";
import { fetchSupabaseRowsByChunks } from "@/lib/supabaseRangeFetch";

const DEFAULT_FORMULA_CODE = "DEFAULT";
const DEFAULT_WIP_SUPPLY_MODE = "stock";

export function normalizeSku(value) {
  return String(value || "").trim().toUpperCase();
}

export function normalizeDateOnly(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  return raw;
}

export function toFiniteNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function roundQty(value, digits = 3) {
  const parsed = toFiniteNumber(value, 0);
  return Number(parsed.toFixed(digits));
}

export function normalizeFormulaCode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  return normalized || DEFAULT_FORMULA_CODE;
}

export function normalizeWipSupplyMode(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "make_to_order") return "make_to_order";
  if (normalized === "hybrid") return "hybrid";
  return DEFAULT_WIP_SUPPLY_MODE;
}

function normalizeTextToken(value) {
  return String(value || "").trim().toLowerCase();
}

function toNumericOrNull(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = String(value ?? "").trim();
  if (!text) return null;
  const parsed = Number(text.replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function addDays(dateValue, days) {
  const base = normalizeDateOnly(dateValue);
  if (!base) return null;
  const date = new Date(`${base}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  date.setUTCDate(date.getUTCDate() + Number(days || 0));
  return date.toISOString().slice(0, 10);
}

function resolveScheduleRowDate(weekStartDate, dayKey) {
  const normalizedDayKey = normalizeDateOnly(dayKey);
  if (normalizedDayKey) return normalizedDayKey;
  const start = normalizeDateOnly(weekStartDate);
  if (!start) return null;
  const normalizedDay = String(dayKey || "").trim().toLowerCase();
  const offsetByDay = {
    mon: 0,
    tue: 1,
    wed: 2,
    thu: 3,
    fri: 4,
    sat: 5,
    sun: 6,
  };
  if (!normalizedDay || offsetByDay[normalizedDay] === undefined) {
    return start;
  }
  return addDays(start, offsetByDay[normalizedDay]);
}

function buildScheduleSectionColumnMetaMap(sectionDefs = []) {
  const map = new Map();
  (sectionDefs ?? []).forEach((section) => {
    const sectionId = String(section?.id || "").trim();
    if (!sectionId) return;
    const columns = (section?.production_schedule_column_defs ?? [])
      .map((col) => ({
        key: String(col?.key || "").trim(),
        label: String(col?.label || "").trim(),
        colType: String(col?.col_type || "").trim().toLowerCase(),
      }))
      .filter((col) => col.key);

    const skuKeys = columns
      .filter((col) => col.colType === "sku_picker")
      .map((col) => col.key);
    const numberKeys = columns
      .filter((col) => col.colType === "number")
      .map((col) => col.key);

    const shiftKeys = columns
      .filter((col) => col.colType === "shift")
      .map((col) => col.key);

    const findByColumnKeywords = (keywords) => {
      const target = columns.find((col) => {
        const keyText = normalizeTextToken(col.key);
        const labelText = normalizeTextToken(col.label);
        return keywords.some((word) => keyText.includes(word) || labelText.includes(word));
      });
      return target?.key || null;
    };

    map.set(sectionId, {
      skuKeys,
      numberKeys,
      qtyKey: findByColumnKeywords(["qty", "quantity"]) || numberKeys[0] || null,
      peopleKey: findByColumnKeywords(["people", "staff", "headcount"]) || null,
      doughSetKey: findByColumnKeywords(["doughset", "dough_set", "batchset", "batch_set", "dough", "ชุดแป้ง"]) || null,
      machineKey: findByColumnKeywords(["machine", "เครื่อง"]) || null,
      unitKey: findByColumnKeywords(["unit", "uom"]) || null,
      shiftKey: findByColumnKeywords(["shift", "กะ"]) || shiftKeys[0] || null,
    });
  });
  return map;
}

function extractScheduleRowPeopleCount(rowData, peopleKey = null) {
  const data = rowData && typeof rowData === "object" ? rowData : {};
  if (peopleKey) {
    const parsed = toNumericOrNull(data?.[peopleKey]);
    if (parsed !== null) return parsed;
  }
  for (const [key, value] of Object.entries(data)) {
    const normalizedKey = String(key || "").trim().toLowerCase();
    if (
      normalizedKey.includes("people")
      || normalizedKey.includes("staff")
      || normalizedKey.includes("headcount")
    ) {
      const parsed = toNumericOrNull(value);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

function extractScheduleRowDoughSetCount(rowData, doughSetKey = null) {
  const data = rowData && typeof rowData === "object" ? rowData : {};
  if (doughSetKey) {
    const parsed = toNumericOrNull(data?.[doughSetKey]);
    if (parsed !== null) return parsed;
  }
  for (const [key, value] of Object.entries(data)) {
    const normalizedKey = String(key || "").trim().toLowerCase();
    if (
      normalizedKey.includes("doughset")
      || normalizedKey.includes("dough_set")
      || normalizedKey.includes("batchset")
      || normalizedKey.includes("batch_set")
    ) {
      const parsed = toNumericOrNull(value);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}

function extractScheduleRowMachineCount(rowData, machineKey = null) {
  const data = rowData && typeof rowData === "object" ? rowData : {};
  if (machineKey) {
    const parsed = toNumericOrNull(data?.[machineKey]);
    if (parsed !== null) return parsed;
  }
  for (const [key, value] of Object.entries(data)) {
    const normalizedKey = String(key || "").trim().toLowerCase();
    if (normalizedKey.includes("machine")) {
      const parsed = toNumericOrNull(value);
      if (parsed !== null) return parsed;
    }
  }
  return null;
}
function extractScheduleSkuTokensFromRow(rowData, skuKeys = []) {
  const data = rowData && typeof rowData === "object" ? rowData : {};
  const explicit = skuKeys
    .map((key) => String(data?.[key] || "").trim())
    .filter(Boolean);
  if (explicit.length > 0) return explicit;

  return Object.entries(data)
    .filter(([key]) => String(key || "").toLowerCase().includes("sku"))
    .map(([, value]) => String(value || "").trim())
    .filter(Boolean);
}

function findFirstNumericEntryInScheduleRow(rowData, preferredKeys = []) {
  const data = rowData && typeof rowData === "object" ? rowData : {};
  for (const key of preferredKeys) {
    const parsed = toNumericOrNull(data?.[key]);
    if (parsed !== null) return { key, value: parsed };
  }
  for (const [key, value] of Object.entries(data)) {
    const parsed = toNumericOrNull(value);
    if (parsed !== null) return { key, value: parsed };
  }
  return { key: null, value: null };
}

function isMissingTableError(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("does not exist")
    || message.includes("relation")
    || String(error?.code || "") === "42P01"
  );
}

export function buildDraftPlanId({
  masterPlanNo,
  departmentCode,
  skuCode,
  workDate,
  workstreamCode = "",
  sourceSectionDefId = "",
  shiftCode = "",
}) {
  const safeDept = String(departmentCode || "UNASSIGNED")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_]/g, "")
    .slice(0, 16) || "UNASSIGNED";
  const safeSku = normalizeSku(skuCode).replace(/[^A-Z0-9_\\-]/g, "").slice(0, 64) || "SKU";
  const safeDate = normalizeDateOnly(workDate) || "DATE";
  const safeMaster = normalizeMasterPlanNo(masterPlanNo) || String(masterPlanNo || "").trim().toUpperCase() || "MP";
  const rawWorkstream = String(workstreamCode || sourceSectionDefId || "").trim().toUpperCase();
  const safeWorkstream = rawWorkstream
    ? rawWorkstream.replace(/[^A-Z0-9_\\-]/g, "").slice(0, 32)
    : "";
  const safeShift = String(shiftCode || "").trim().toUpperCase().replace(/[^A-Z0-9_\\-]/g, "").slice(0, 32);
  return `WIP-${safeMaster}-${safeDept}-${safeSku}-${safeDate}${safeShift ? `-${safeShift}` : ""}${safeWorkstream ? `-${safeWorkstream}` : ""}`;
}

const gatewayProductMetaCache = new Map();

export async function loadGatewayProductMetaBySkus(skuCodes = []) {
  const skus = Array.from(new Set((skuCodes || []).map(normalizeSku).filter(Boolean)));
  if (!skus.length) return new Map();

  const missingSkus = skus.filter((sku) => !gatewayProductMetaCache.has(sku));
  if (missingSkus.length) {
    const requests = missingSkus.map(async (sku) => {
      const params = new URLSearchParams();
      params.set("search", sku);
      params.set("page", "1");
      params.set("pageSize", "20");
      params.set("iccatCodes", "03,04,04-1,04-2");
      const result = await fetchGatewayJson("/api/products", params, "static");
      if (!result.ok) {
        return;
      }
      const rows = Array.isArray(result.data?.data) ? result.data.data : [];
      const exactMatch = rows.find((row) => normalizeSku(row?.SKU_CODE) === sku) || null;
      if (!exactMatch) {
        return;
      }
      const qtyPerBatchRaw = Number(exactMatch?.UTQ_QTY_1);
      const qtyPerBatch = Number.isFinite(qtyPerBatchRaw) && qtyPerBatchRaw > 0 ? qtyPerBatchRaw : 1;
      gatewayProductMetaCache.set(sku, {
        isFgProduct: resolveItemTypeByCategory(exactMatch?.ICCAT_CODE) === BOM_ITEM_TYPES.FG,
        qtyPerBatch,
        displayUnit: String(exactMatch?.UTQ_NAME || "").trim()
          || String(exactMatch?.UTQ_NAME_1 || "").trim()
          || "unit",
      });
    });

    await Promise.all(requests);
  }

  const map = new Map();
  skus.forEach((sku) => {
    const cached = gatewayProductMetaCache.get(sku);
    if (cached) map.set(sku, cached);
  });
  return map;
}

async function loadMainPlanRowsFromSchedule(supabaseAdmin, normalizedPlanNo, options = {}) {
  let plansQuery = supabaseAdmin
    .from("production_schedule_plans")
    .select(`
      id,
      dept_id,
      week_start_date,
      period_end,
      status,
      ${options.releasedOnly ? "published_snapshot,published_revision," : ""}
      production_departments:dept_id (
        code,
        name
      )
    `)
    .eq("master_plan_no", normalizedPlanNo);
  plansQuery = options.releasedOnly
    ? plansQuery.not("published_snapshot", "is", null)
    : plansQuery.in("status", ["draft", "published"]);
  const plansResult = await plansQuery;
  if (plansResult.error) {
    throw plansResult.error;
  }

  const rawPlans = (Array.isArray(plansResult.data) ? plansResult.data : []).map((plan) => (
    options.releasedOnly
      ? { ...plan, ...plan.published_snapshot.plan, published_snapshot: plan.published_snapshot }
      : plan
  ));
  if (!rawPlans.length) return [];

  // Group plans by dept_id to prevent double-counting when multiple plan records exist for the same department
  const canonicalPlansByDept = new Map();
  rawPlans.forEach((plan) => {
    const deptId = String(plan?.dept_id || "").trim();
    if (!deptId) return;
    const existing = canonicalPlansByDept.get(deptId);
    if (!existing) {
      canonicalPlansByDept.set(deptId, plan);
      return;
    }
    // Published plan always takes precedence over draft
    if (existing.status !== "published" && plan.status === "published") {
      canonicalPlansByDept.set(deptId, plan);
      return;
    }
    if (existing.status === "published" && plan.status !== "published") {
      return;
    }
    // If same status, take the newest
    const existingTime = new Date(existing.updated_at || existing.created_at || 0).getTime();
    const newTime = new Date(plan.updated_at || plan.created_at || 0).getTime();
    if (newTime > existingTime) {
      canonicalPlansByDept.set(deptId, plan);
    }
  });

  const plans = Array.from(canonicalPlansByDept.values());
  const planIds = Array.from(new Set(plans.map((plan) => String(plan?.id || "").trim()).filter(Boolean)));
  if (!planIds.length) return [];

  const scheduleRows = options.releasedOnly
    ? plans.flatMap((plan) => plan.published_snapshot?.rows || [])
    : await fetchSupabaseRowsByChunks(
    planIds,
    (chunk) => supabaseAdmin
      .from("production_schedule_rows")
      .select("id,plan_id,section_def_id,day_key,row_data,display_order")
      .in("plan_id", chunk)
      .order("plan_id", { ascending: true })
      .order("day_key", { ascending: true })
      .order("display_order", { ascending: true })
  );
  if (!scheduleRows.length) return [];

  // Load section-shift assignments to map junction shift ID to actual shift columns
  const { data: sectionShiftsData, error: secShiftsError } = await supabaseAdmin
    .from("production_section_shifts")
    .select(`
      id,
      shift_id,
      production_shifts (
        id,
        code,
        name
      )
    `)
    .is("deleted_at", null);

  const sectionShiftMapById = new Map();
  if (!secShiftsError && Array.isArray(sectionShiftsData)) {
    sectionShiftsData.forEach((ss) => {
      if (ss.production_shifts) {
        sectionShiftMapById.set(ss.id, {
          id: ss.production_shifts.id,
          code: ss.production_shifts.code,
          name: ss.production_shifts.name
        });
      }
    });
  }

  const sectionDefIds = Array.from(
    new Set(
      scheduleRows
        .map((row) => String(row?.section_def_id || "").trim())
        .filter(Boolean)
    )
  );

  let sectionDefs = [];
  if (sectionDefIds.length > 0) {
    sectionDefs = await fetchSupabaseRowsByChunks(
      sectionDefIds,
      (chunk) => supabaseAdmin
        .from("production_schedule_section_defs")
        .select("id,name,production_schedule_column_defs(key,label,col_type)")
        .in("id", chunk)
    );
  }

  const sectionMetaById = buildScheduleSectionColumnMetaMap(sectionDefs);
  const sectionNameById = new Map(
    sectionDefs
      .map((section) => [String(section?.id || "").trim(), String(section?.name || "").trim()])
      .filter(([id]) => Boolean(id))
  );
  const allSkuTokens = [];
  scheduleRows.forEach((row) => {
    const sectionId = String(row?.section_def_id || "").trim();
    const meta = sectionMetaById.get(sectionId) || { skuKeys: [] };
    const tokens = extractScheduleSkuTokensFromRow(row?.row_data, meta.skuKeys);
    allSkuTokens.push(...tokens);
  });

  const skuTokens = Array.from(new Set(allSkuTokens.map((value) => String(value || "").trim()).filter(Boolean)));
  const upperSkuTokens = skuTokens.map((value) => normalizeSku(value)).filter(Boolean);

  const [skuByNameRows, skuByCodeRows] = await Promise.all([
    skuTokens.length > 0
      ? fetchSupabaseRowsByChunks(
        skuTokens,
        (chunk) => supabaseAdmin
          .from("products_cache")
          .select("sku_code,sku_name")
          .in("sku_name", chunk),
        { chunkSize: 20 }
      )
      : Promise.resolve([]),
    upperSkuTokens.length > 0
      ? fetchSupabaseRowsByChunks(
        upperSkuTokens,
        (chunk) => supabaseAdmin
          .from("products_cache")
          .select("sku_code,sku_name")
          .in("sku_code", chunk)
      )
      : Promise.resolve([]),
  ]);

  const skuCodeByName = new Map();
  const skuCodeByCode = new Map();
  const skuNameByCode = new Map();
  [...skuByNameRows, ...skuByCodeRows].forEach((row) => {
    const skuCode = normalizeSku(row?.sku_code);
    const skuName = String(row?.sku_name || "").trim();
    if (skuName && !skuCodeByName.has(skuName)) {
      skuCodeByName.set(skuName, skuCode);
    }
    if (skuCode) {
      skuCodeByCode.set(skuCode, skuCode);
      if (skuName && !skuNameByCode.has(skuCode)) {
        skuNameByCode.set(skuCode, skuName);
      }
    }
  });

  const planById = new Map(
    plans.map((plan) => [String(plan?.id || "").trim(), plan]).filter(([id]) => Boolean(id))
  );

  const allUniqueSkuCodes = Array.from(skuCodeByCode.keys());
  const latestVersionBySkuAndFormula = new Map();
  if (allUniqueSkuCodes.length > 0) {
    const boms = await fetchSupabaseRowsByChunks(
      allUniqueSkuCodes,
      (chunk) => supabaseAdmin
        .from("production_boms")
        .select("id,sku_code")
        .in("sku_code", chunk)
    );

    if (boms.length > 0) {
      const bomIds = boms.map((bom) => bom.id).filter(Boolean);
      const skuByBomId = new Map(boms.map((bom) => [bom.id, normalizeSku(bom.sku_code)]));
      
      const versions = await fetchSupabaseRowsByChunks(
        bomIds,
        (chunk) => supabaseAdmin
          .from("production_bom_versions")
          .select("id,bom_id,formula_code,version_no")
          .in("bom_id", chunk)
          .eq("status", "approved")
          .is("deleted_at", null)
          .order("version_no", { ascending: false })
      );

      if (Array.isArray(versions)) {
        versions.forEach((version) => {
          const sku = skuByBomId.get(version.bom_id);
          if (!sku) return;
          const formula = String(version.formula_code || "DEFAULT").trim().toUpperCase();
          const key = `${sku}::${formula}`;
          if (!latestVersionBySkuAndFormula.has(key)) {
            latestVersionBySkuAndFormula.set(key, version.id);
          }
        });
      }
    }
  }

  const fallbackRows = [];

  scheduleRows.forEach((row, index) => {
    const planId = String(row?.plan_id || "").trim();
    const plan = planById.get(planId);
    if (!plan) return;

    const sectionId = String(row?.section_def_id || "").trim();
    const sectionMeta = sectionMetaById.get(sectionId) || {
      skuKeys: [],
      numberKeys: [],
      qtyKey: null,
      unitKey: null,
    };
    const rowData = row?.row_data && typeof row.row_data === "object" ? row.row_data : {};
    const tokens = extractScheduleSkuTokensFromRow(rowData, sectionMeta.skuKeys);
    const resolvedSkuCodes = Array.from(
      new Set(
        tokens
          .map((token) => {
            const normalizedCode = normalizeSku(token);
            if (skuCodeByCode.has(normalizedCode)) return normalizedCode;
            return skuCodeByName.get(String(token || "").trim()) || null;
          })
          .filter(Boolean)
      )
    );

    const skuCode = resolvedSkuCodes[0] || normalizeSku(tokens[0] || "");
    if (!skuCode) return;
    const skuName = String(
      skuNameByCode.get(skuCode)
      || tokens[0]
      || skuCode
    ).trim() || skuCode;

    const numericEntry = findFirstNumericEntryInScheduleRow(rowData, [
      ...(sectionMeta.qtyKey ? [sectionMeta.qtyKey] : []),
      ...(sectionMeta.numberKeys || []),
    ]);
    const plannedQty = toFiniteNumber(numericEntry?.value, 0);
    if (plannedQty <= 0) return;

    const workDate = resolveScheduleRowDate(plan?.week_start_date, row?.day_key);
    if (!workDate) return;
    const unit = sectionMeta.unitKey ? String(rowData?.[sectionMeta.unitKey] || "").trim() : "";
    const lineStaffCount = extractScheduleRowPeopleCount(rowData, sectionMeta.peopleKey);
    const lineDoughSetCount = extractScheduleRowDoughSetCount(rowData, sectionMeta.doughSetKey);
    const lineMachineNo = extractScheduleRowMachineCount(rowData, sectionMeta.machineKey);
    const shiftDisplay = sectionMeta.shiftKey ? String(rowData?.[sectionMeta.shiftKey] || "").trim() : "";
    const rawShiftId = String(rowData?.shiftId || rowData?.shift_id || "").trim() || null;
    let shiftId = rawShiftId;
    let shiftCode = String(rowData?.shiftCode || rowData?.shift_code || "").trim().toUpperCase() || null;
    let shiftName = String(rowData?.shiftName || rowData?.shift_name || shiftDisplay || "").trim() || null;

    if (rawShiftId && sectionShiftMapById.has(rawShiftId)) {
      const actualShift = sectionShiftMapById.get(rawShiftId);
      shiftId = actualShift.id;
      shiftCode = actualShift.code;
      shiftName = actualShift.name;
    }
    const ownerDepartmentId = String(plan?.dept_id || "").trim() || null;
    const sectionName = sectionNameById.get(sectionId) || null;
    const workstreamCode = sectionId || null;
    const mergePolicy = "strict_separate";

    const formulaCode = String(rowData?.formulaCode || rowData?.formula_code || "DEFAULT").trim().toUpperCase();
    const lookupKey = `${skuCode}::${formulaCode}`;
    const resolvedBomVersionId = latestVersionBySkuAndFormula.get(lookupKey) || rowData?.bomVersionId || rowData?.bom_version_id || null;

    fallbackRows.push({
      plan_id: String(row?.id || `${planId}-${index + 1}`).trim(),
      sku_code: skuCode,
      sku_name: skuName,
      planned_qty: roundQty(plannedQty, 6),
      unit: unit || "batch",
      period_start: workDate,
      period_end: workDate,
      formula_code: formulaCode,
      bom_version_id: resolvedBomVersionId,
      line_staff_count: lineStaffCount,
      line_dough_set_count: lineDoughSetCount,
      line_machine_no: lineMachineNo,
      shift_id: shiftId,
      shift_code: shiftCode,
      shift_name: shiftName,
      owner_department_id: ownerDepartmentId,
      schedule_section_def_id: sectionId || null,
      schedule_section_name: sectionName,
      workstream_code: workstreamCode,
      merge_policy: mergePolicy,
      production_departments: {
        code: String(plan?.production_departments?.code || "").trim().toUpperCase() || null,
        name: String(plan?.production_departments?.name || "").trim() || null,
      },
    });
  });

  return fallbackRows;
}

export async function loadMainPlanRowsForMasterPlan(supabaseAdmin, masterPlanNo, options = {}) {
  const normalizedPlanNo = normalizeMasterPlanNo(masterPlanNo);
  if (!normalizedPlanNo) return [];
  let rows = [];

  try {
    rows = await loadMainPlanRowsFromSchedule(supabaseAdmin, normalizedPlanNo, options);
  } catch (error) {
    if (!isMissingTableError(error)) {
      throw error;
    }
  }

  if (!rows.length && options.releasedOnly) {
    const released = await supabaseAdmin.from("production_master_plans")
      .select("published_plan_rows").eq("master_plan_no", normalizedPlanNo).maybeSingle();
    if (released.error) throw released.error;
    rows = released.data?.published_plan_rows || [];
  }
  if (!rows.length && !options.releasedOnly) {
    const result = await supabaseAdmin
      .from("production_plan_status")
      .select(`
        plan_id,
        sku_code,
        sku_name,
        planned_qty,
        unit,
        period_start,
        period_end,
        formula_code,
        bom_version_id,
        line_staff_count,
        line_machine_no,
        line_dough_set_count,
        shift_id,
        shift_code,
        shift_name,
        schedule_section_def_id,
        schedule_section_name,
        owner_department_id,
        production_departments:owner_department_id (
          code,
          name
        )
      `)
      .eq("master_plan_no", normalizedPlanNo)
      .eq("plan_kind", "main")
      .order("period_start", { ascending: true });
    if (result.error) {
      if (!isMissingTableError(result.error)) {
        throw result.error;
      }
    } else {
      rows = Array.isArray(result.data) ? result.data : [];
    }
  }
  if (!rows.length) return rows;

  const productMetaBySku = await loadProductsMetaBySkus(supabaseAdmin, rows.map((row) => row?.sku_code));

  return rows.map((row) => {
    const sku = normalizeSku(row?.sku_code);
    const productMeta = productMetaBySku.get(sku) || null;
    const rawUnit = String(row?.unit || "").trim();
    const plannedQty = toFiniteNumber(row?.planned_qty, 0);
    const isFgProduct = resolveItemTypeByCategory(productMeta?.iccat_code) === BOM_ITEM_TYPES.FG;

    return {
      ...row,
      planned_qty: plannedQty,
      unit: isFgProduct ? (productMeta?.uom_name || rawUnit || "unit") : (rawUnit || "batch"),
    };
  });
}

export function buildPlanRange(rows = []) {
  const starts = rows
    .map((row) => normalizeDateOnly(row?.period_start))
    .filter(Boolean)
    .sort();
  const ends = rows
    .map((row) => normalizeDateOnly(row?.period_end || row?.period_start))
    .filter(Boolean)
    .sort();
  const start = starts[0] || null;
  const end = ends.length ? ends[ends.length - 1] : start;
  return { start, end };
}

export function isDateWithinRange(dateValue, rangeStart, rangeEnd) {
  const date = normalizeDateOnly(dateValue);
  const start = normalizeDateOnly(rangeStart);
  const end = normalizeDateOnly(rangeEnd);
  if (!date || !start || !end) return false;
  return date >= start && date <= end;
}

export async function explodeWipDemandFromMainRows(supabaseAdmin, mainRows = []) {
  const planItems = (mainRows || [])
    .map((row) => ({
      planId: String(row?.plan_id || "").trim(),
      skuCode: normalizeSku(row?.sku_code),
      plannedQty: toFiniteNumber(row?.planned_qty, 0),
      formulaCode: normalizeFormulaCode(row?.formula_code),
      bomVersionId: row?.bom_version_id || null,
    }))
    .filter((row) => row.planId && row.skuCode && row.plannedQty > 0);

  if (!planItems.length) {
    return { explodedRows: [], wipDemandRows: [] };
  }

  let explodedRows = [];
  let usePlanningOffsets = true;
  try {
    explodedRows = await explodeBomBatchWithPlanningOffsets(supabaseAdmin, planItems, 12);
  } catch (error) {
    const message = String(error?.message || "").toLowerCase();
    const missingPlanningRpc =
      message.includes("explode_bom_batch_with_planning_offsets") ||
      message.includes("function") ||
      message.includes("does not exist");
    if (!missingPlanningRpc) {
      throw error;
    }
    usePlanningOffsets = false;
    explodedRows = await explodeBomBatch(supabaseAdmin, planItems, 12);
  }

  const workDateByPlanId = new Map(
    (mainRows || [])
      .map((row) => [
        String(row?.plan_id || "").trim(),
        normalizeDateOnly(row?.period_start),
      ])
      .filter(([planId, workDate]) => planId && workDate)
  );
  const departmentIdByPlanId = new Map(
    (mainRows || [])
      .map((row) => [
        String(row?.plan_id || "").trim(),
        String(row?.owner_department_id || "").trim(),
      ])
      .filter(([planId, departmentId]) => planId && departmentId)
  );
  const sectionIdByPlanId = new Map(
    (mainRows || [])
      .map((row) => [
        String(row?.plan_id || "").trim(),
        String(row?.schedule_section_def_id || "").trim(),
      ])
      .filter(([planId]) => planId)
  );
  const sectionNameByPlanId = new Map(
    (mainRows || [])
      .map((row) => [
        String(row?.plan_id || "").trim(),
        String(row?.schedule_section_name || "").trim(),
      ])
      .filter(([planId]) => planId)
  );
  const workstreamByPlanId = new Map(
    (mainRows || [])
      .map((row) => [
        String(row?.plan_id || "").trim(),
        String(row?.schedule_section_def_id || "").trim(),
      ])
      .filter(([planId]) => planId)
  );
  const shiftIdByPlanId = new Map(
    (mainRows || [])
      .map((row) => [
        String(row?.plan_id || "").trim(),
        String(row?.shift_id || "").trim(),
      ])
      .filter(([planId]) => planId)
  );
  const shiftCodeByPlanId = new Map(
    (mainRows || [])
      .map((row) => [
        String(row?.plan_id || "").trim(),
        String(row?.shift_code || "").trim().toUpperCase(),
      ])
      .filter(([planId]) => planId)
  );
  const shiftNameByPlanId = new Map(
    (mainRows || [])
      .map((row) => [
        String(row?.plan_id || "").trim(),
        String(row?.shift_name || "").trim(),
      ])
      .filter(([planId]) => planId)
  );
  const wipBySku = new Map();
  explodedRows.forEach((row) => {
    if (row.itemType !== "WIP") return;
    const sku = normalizeSku(row.materialSkuCode);
    const qty = toFiniteNumber(row.requiredQty, 0);
    if (!sku || qty <= 0) return;
    const planId = String(row.planId || "").trim();
    const rootWorkDate = workDateByPlanId.get(planId) || null;
    const departmentId = departmentIdByPlanId.get(planId) || null;
    const plannedWorkDate = usePlanningOffsets
      ? addDays(rootWorkDate, row.planningOffsetDays)
      : rootWorkDate;
    const sourceSectionDefId = sectionIdByPlanId.get(planId) || null;
    const sourceSectionName = sectionNameByPlanId.get(planId) || null;
    const workstreamCode = workstreamByPlanId.get(planId) || sourceSectionDefId || "default";
    const shiftId = shiftIdByPlanId.get(planId) || null;
    const shiftCode = shiftCodeByPlanId.get(planId) || null;
    const shiftName = shiftNameByPlanId.get(planId) || null;
    const mergePolicy = "strict_separate";
    const demandKey = `${plannedWorkDate || ""}|${departmentId || ""}|${shiftCode || shiftId || ""}|${sku}|${workstreamCode}`;
    if (!wipBySku.has(demandKey)) {
      wipBySku.set(demandKey, {
        skuCode: sku,
        goodsCode: normalizeSku(row.materialGoodsCode || row.materialSkuCode),
        skuName: String(row.materialName || "").trim() || sku,
        uom: String(row.uomName || "").trim() || "unit",
        requiredQty: 0,
        workDate: plannedWorkDate,
        departmentId,
        shiftId,
        shiftCode,
        shiftName,
        sourceSectionDefId,
        sourceSectionName,
        workstreamCode,
        mergePolicy,
        planningOffsetDays: usePlanningOffsets ? toFiniteNumber(row.planningOffsetDays, 0) : 0,
      });
    }
    wipBySku.get(demandKey).requiredQty += qty;
  });

  const wipDemandRows = Array.from(wipBySku.values())
    .map((row) => ({
      ...row,
      requiredQty: roundQty(row.requiredQty),
    }))
    .sort((a, b) => {
      const dateCompare = String(a.workDate || "").localeCompare(String(b.workDate || ""));
      if (dateCompare !== 0) return dateCompare;
      return a.skuCode.localeCompare(b.skuCode);
    });

  return { explodedRows, wipDemandRows };
}

export async function loadStockBySkus(request, skuCodes = []) {
  const skus = Array.from(new Set((skuCodes || []).map(normalizeSku).filter(Boolean)));
  if (!skus.length) return new Map();
  const stockRows = [];
  for (let index = 0; index < skus.length; index += 80) {
    const params = new URLSearchParams();
    params.set("skus", skus.slice(index, index + 80).join(","));
    const stockResult = await fetchGatewayJson(
      "/api/raw-materials-summary-by-skus",
      params,
      "production"
    );
    if (!stockResult.ok) continue;
    stockRows.push(...(Array.isArray(stockResult.data?.data) ? stockResult.data.data : []));
  }
  const deducted = await applyStockDeduction({ data: stockRows }, "summary", request);
  const rows = Array.isArray(deducted?.data) ? deducted.data : [];
  const map = new Map();
  rows.forEach((row) => {
    const sku = normalizeSku(row?.SKU_CODE);
    if (!sku) return;
    map.set(sku, toFiniteNumber(row?.QTY, 0));
  });
  return map;
}

export async function loadProductsMetaBySkus(supabaseAdmin, skuCodes = []) {
  const skus = Array.from(new Set((skuCodes || []).map(normalizeSku).filter(Boolean)));
  if (!skus.length) return new Map();
  const rows = await fetchSupabaseRowsByChunks(
    skus,
    (chunk) => supabaseAdmin
      .from("products_cache")
      .select("sku_code,sku_name,iccat_code,uom_name")
      .in("sku_code", chunk)
  );
  const map = new Map();
  rows.forEach((row) => {
    const sku = normalizeSku(row?.sku_code);
    if (!sku) return;
    map.set(sku, row);
  });
  return map;
}

export async function loadApprovedWipVersionMetaBySkus(supabaseAdmin, skuCodes = []) {
  const skus = Array.from(new Set((skuCodes || []).map(normalizeSku).filter(Boolean)));
  if (!skus.length) return new Map();

  const bomResult = await supabaseAdmin
    .from("production_boms")
    .select("id,sku_code")
    .in("sku_code", skus);
  if (bomResult.error) {
    throw bomResult.error;
  }

  const boms = Array.isArray(bomResult.data) ? bomResult.data : [];
  if (!boms.length) return new Map();

  const bomIds = boms.map((row) => row.id).filter(Boolean);
  const versionsResult = await supabaseAdmin
    .from("production_bom_versions")
    .select("id,bom_id,version_no,base_batch,base_output_boxes,wip_qty_input_mode")
    .in("bom_id", bomIds)
    .eq("status", "approved")
    .order("version_no", { ascending: false });
  if (versionsResult.error) {
    throw versionsResult.error;
  }

  const skuByBomId = new Map(boms.map((row) => [row.id, normalizeSku(row.sku_code)]));
  const metaBySku = new Map();
  (versionsResult.data ?? []).forEach((version) => {
    const sku = skuByBomId.get(version?.bom_id);
    if (!sku || metaBySku.has(sku)) return;

    const baseBatch = toFiniteNumber(version?.base_batch, 0);
    const baseOutput = toFiniteNumber(version?.base_output_boxes, 0);
    metaBySku.set(sku, {
      baseBatch,
      baseOutput,
      wipQtyInputMode: String(version?.wip_qty_input_mode || "").trim().toLowerCase(),
      unitsPerBatch:
        baseBatch > 0 && baseOutput > 0
          ? baseOutput / baseBatch
          : 0,
    });
  });

  return metaBySku;
}

export async function loadWipPoliciesBySkus(supabaseAdmin, skuCodes = []) {
  const skus = Array.from(new Set((skuCodes || []).map(normalizeSku).filter(Boolean)));
  if (!skus.length) return new Map();
  const rows = await fetchSupabaseRowsByChunks(
    skus,
    (chunk) => supabaseAdmin
      .from("production_wip_policies")
      .select("sku_code,supply_mode,is_active")
      .in("sku_code", chunk),
    { onError: (error) => {
      if (isMissingTableError(error)) return [];
      throw error;
    } }
  );

  const map = new Map();
  rows.forEach((row) => {
    const sku = normalizeSku(row?.sku_code);
    if (!sku) return;
    if (row?.is_active === false) return;
    map.set(sku, {
      skuCode: sku,
      supplyMode: normalizeWipSupplyMode(row?.supply_mode),
    });
  });
  return map;
}

export async function explodeRawRequirementsFromWipLines(supabaseAdmin, lineRows = []) {
  const planItems = (lineRows || [])
    .map((line, index) => ({
      planId: String(line?.planId || line?.plan_id || `LINE-${index + 1}`).trim(),
      skuCode: normalizeSku(line?.skuCode || line?.sku_code),
      plannedQty: toFiniteNumber(line?.plannedQty ?? line?.planned_qty ?? line?.qty, 0),
      formulaCode: normalizeFormulaCode(line?.formulaCode || line?.formula_code),
      bomVersionId: line?.bomVersionId || line?.bom_version_id || null,
    }))
    .filter((row) => row.planId && row.skuCode && row.plannedQty > 0);

  if (!planItems.length) {
    return { explodedRows: [], rawRows: [], byPlanId: new Map() };
  }

  const explodedRows = await explodeBomBatch(supabaseAdmin, planItems, 12);
  const rawBySku = new Map();
  const byPlanId = new Map();

  explodedRows.forEach((row) => {
    const planId = String(row.planId || "").trim();
    if (!planId) return;
    if (!byPlanId.has(planId)) {
      byPlanId.set(planId, []);
    }
    byPlanId.get(planId).push(row);

    if (row.itemType === "WIP") return;
    const sku = normalizeSku(row.materialSkuCode);
    const goodsCode = normalizeSku(row.materialGoodsCode || row.materialSkuCode);
    const qty = toFiniteNumber(row.requiredQty, 0);
    if (!sku || qty <= 0) return;
    const rawKey = `${sku}|${goodsCode}`;
    if (!rawBySku.has(rawKey)) {
      rawBySku.set(`${sku}|${goodsCode}`, {
        skuCode: sku,
        goodsCode,
        skuName: String(row.materialName || "").trim() || sku,
        uom: String(row.uomName || "").trim() || "unit",
        requiredQty: 0,
        issueQty: 0,
      });
    }
    const target = rawBySku.get(rawKey);
    target.requiredQty += qty;
    target.issueQty = Math.ceil(target.requiredQty);
  });

  const rawRows = Array.from(rawBySku.values())
    .map((row) => ({
      ...row,
      requiredQty: roundQty(row.requiredQty),
      issueQty: Math.ceil(roundQty(row.requiredQty)),
    }))
    .sort((a, b) => a.skuCode.localeCompare(b.skuCode));

  return { explodedRows, rawRows, byPlanId };
}
