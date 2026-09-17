import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeParam } from "@/lib/validation";
import { resolveItemTypeByCategory, validateBomMatrix } from "@/lib/bomMatrix";
import { getPlanningOffsetLabel, normalizePlanningOffsetDays } from "@/lib/bomPlanning";
import { getBomApprovalSettings } from "@/lib/bomApprovalSettings";

const STATUS_SET = new Set(["draft", "pending_review", "approved", "rejected"]);
const DEFAULT_FORMULA_CODE = "DEFAULT";
const DEFAULT_FORMULA_NAME = "สูตรหลัก";
const WIP_QTY_INPUT_MODES = {
  UNIT: "unit",
  BATCH: "batch",
};
const CALCULATION_BASIS = {
  JOB_QTY: "JOB_QTY",
  HEADCOUNT: "HEADCOUNT",
  MACHINE_COUNT: "MACHINE_COUNT",
  DOUGH_SET_COUNT: "DOUGH_SET_COUNT",
};
const HEADCOUNT_ROUND_MODE = {
  NONE: "NONE",
  UP: "UP",
  DOWN: "DOWN",
  NEAREST: "NEAREST",
};

function pickActiveVersion(versions) {
  if (!versions || versions.length === 0) {
    return null;
  }
  const latest = versions[0];
  if (latest.status === "rejected") {
    const fallback = versions.find((version) => version.status !== "rejected");
    return fallback || latest;
  }
  return latest;
}

function formatValue(item) {
  const qty = item.qty ?? 0;
  const uom = item.uom_name || "-";
  const goodsCode = item.material_goods_code ? ` · trade ${item.material_goods_code}` : "";
  const offsetDays = normalizePlanningOffsetDays(item.planning_offset_days, 0);
  const offsetText = offsetDays !== 0 ? ` · ${getPlanningOffsetLabel(offsetDays)}` : "";
  const notes = item.notes ? ` · ${item.notes}` : "";
  return `${qty} ${uom}${goodsCode}${offsetText}${notes}`;
}

function buildLabel(code, nameMap) {
  const name = nameMap.get(code);
  return name ? `${code} - ${name}` : code;
}

function buildDiff(previousItems, nextItems, nameMap) {
  const added = [];
  const updated = [];
  const removed = [];
  const changes = [];

  const prevMap = new Map(previousItems.map((item) => [item.material_sku_code, item]));
  const nextMap = new Map(nextItems.map((item) => [item.material_sku_code, item]));

  nextMap.forEach((item, code) => {
    const prev = prevMap.get(code);
    if (!prev) {
      const label = buildLabel(code, nameMap);
      const after = formatValue(item);
      added.push({ label, before: "-", after });
      changes.push(`เพิ่ม ${label}`);
      return;
    }
    const changed =
      Number(prev.qty) !== Number(item.qty) ||
      (prev.material_goods_code || "") !== (item.material_goods_code || "") ||
      (prev.uom_name || "") !== (item.uom_name || "") ||
      normalizePlanningOffsetDays(prev.planning_offset_days, 0) !==
        normalizePlanningOffsetDays(item.planning_offset_days, 0) ||
      normalizeCalculationBasis(prev.calculation_basis) !==
        normalizeCalculationBasis(item.calculation_basis) ||
      normalizeHeadcountBase(prev.headcount_base, 1) !==
        normalizeHeadcountBase(item.headcount_base, 1) ||
      normalizeHeadcountRoundMode(prev.headcount_round_mode) !==
        normalizeHeadcountRoundMode(item.headcount_round_mode) ||
      normalizeHeadcountBase(prev.machine_base, 1) !==
        normalizeHeadcountBase(item.machine_base, 1) ||
      normalizeHeadcountRoundMode(prev.machine_round_mode) !==
        normalizeHeadcountRoundMode(item.machine_round_mode) ||
      normalizeHeadcountBase(prev.dough_set_base, 1) !==
        normalizeHeadcountBase(item.dough_set_base, 1) ||
      normalizeHeadcountRoundMode(prev.dough_set_round_mode) !==
        normalizeHeadcountRoundMode(item.dough_set_round_mode) ||
      (prev.notes || "") !== (item.notes || "");
    if (changed) {
      const label = buildLabel(code, nameMap);
      const before = formatValue(prev);
      const after = formatValue(item);
      updated.push({ label, before, after });
      changes.push(`ปรับ ${label}`);
    }
  });

  prevMap.forEach((item, code) => {
    if (nextMap.has(code)) return;
    const label = buildLabel(code, nameMap);
    const before = formatValue(item);
    removed.push({ label, before, after: "-" });
    changes.push(`ลบ ${label}`);
  });

  return {
    diff: {
      added,
      updated,
      removed,
    },
    changes,
  };
}

async function fetchNamesMap(supabaseAdmin, codes) {
  if (!codes.length) return new Map();
  const { data, error } = await supabaseAdmin
    .from("products_cache")
    .select("sku_code,sku_name,uom_name")
    .in("sku_code", codes);
  if (error) {
    throw new Error("Failed to load product names");
  }
  const map = new Map();
  (data ?? []).forEach((row) => {
    map.set(row.sku_code, row.sku_name || "");
  });
  return map;
}

function normalizeStatus(value) {
  const lowered = String(value || "").toLowerCase();
  return STATUS_SET.has(lowered) ? lowered : "draft";
}

function normalizeFormulaCode(value) {
  const normalized = normalizeParam(value);
  if (!normalized) return DEFAULT_FORMULA_CODE;
  return normalized.toUpperCase();
}

function normalizeFormulaName(value) {
  return normalizeParam(value) ?? DEFAULT_FORMULA_NAME;
}

function normalizePositiveNumber(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function normalizeWipQtyInputMode(value, fallback = WIP_QTY_INPUT_MODES.BATCH) {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === WIP_QTY_INPUT_MODES.UNIT || normalized === WIP_QTY_INPUT_MODES.BATCH) {
    return normalized;
  }
  return fallback;
}

function normalizeCalculationBasis(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === CALCULATION_BASIS.HEADCOUNT) {
    return CALCULATION_BASIS.HEADCOUNT;
  }
  if (normalized === CALCULATION_BASIS.MACHINE_COUNT) {
    return CALCULATION_BASIS.MACHINE_COUNT;
  }
  if (normalized === CALCULATION_BASIS.DOUGH_SET_COUNT) {
    return CALCULATION_BASIS.DOUGH_SET_COUNT;
  }
  return CALCULATION_BASIS.JOB_QTY;
}

function normalizeHeadcountBase(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function normalizeHeadcountRoundMode(value) {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === HEADCOUNT_ROUND_MODE.UP) return HEADCOUNT_ROUND_MODE.UP;
  if (normalized === HEADCOUNT_ROUND_MODE.DOWN) return HEADCOUNT_ROUND_MODE.DOWN;
  if (normalized === HEADCOUNT_ROUND_MODE.NEAREST) return HEADCOUNT_ROUND_MODE.NEAREST;
  return HEADCOUNT_ROUND_MODE.NONE;
}

function isMissingDeletedAtColumn(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("deleted_at") && message.includes("does not exist");
}

function isMissingFormulaColumns(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("formula_code") || message.includes("formula_name");
}

function isMissingBaseMetricsColumns(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("base_batch") || message.includes("base_output_boxes");
}

function isMissingWipQtyModeColumn(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("wip_qty_input_mode");
}

function isMissingPlanningOffsetColumn(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("planning_offset_days");
}

function isMissingHeadcountColumns(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("calculation_basis")
    || message.includes("headcount_base")
    || message.includes("headcount_round_mode")
    || message.includes("machine_base")
    || message.includes("machine_round_mode")
    || message.includes("dough_set_base")
    || message.includes("dough_set_round_mode");
}

function isRelationshipError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("relationship") || message.includes("foreign key");
}

async function fetchVersions(supabaseAdmin, bomId) {
  const selectFields =
    "id,version_no,status,base_batch,base_output_boxes,wip_qty_input_mode,formula_code,formula_name,note,diff,changes,created_by,created_at";

  // Preferred query: exclude soft-deleted versions.
  let query = supabaseAdmin
    .from("production_bom_versions")
    .select(selectFields)
    .eq("bom_id", bomId)
    .is("deleted_at", null)
    .order("version_no", { ascending: false });

  let { data, error } = await query;
  if (error && (isMissingDeletedAtColumn(error) || isMissingWipQtyModeColumn(error))) {
    // Transitional fallback: keep formula/base fields and drop only missing columns.
    let fallbackQuery = supabaseAdmin
      .from("production_bom_versions")
      .select("id,version_no,status,base_batch,base_output_boxes,formula_code,formula_name,note,diff,changes,created_by,created_at")
      .eq("bom_id", bomId)
      .order("version_no", { ascending: false });
    if (!isMissingDeletedAtColumn(error)) {
      fallbackQuery = fallbackQuery.is("deleted_at", null);
    }
    const fallbackResult = await fallbackQuery;
    data = fallbackResult.data;
    error = fallbackResult.error;
  }

  if (
    error &&
    (
      isMissingDeletedAtColumn(error)
      || isMissingFormulaColumns(error)
      || isMissingBaseMetricsColumns(error)
      || isMissingWipQtyModeColumn(error)
    )
  ) {
    // Legacy fallback: schema without formula/base/deleted_at related columns.
    const legacyQuery = supabaseAdmin
      .from("production_bom_versions")
      .select("id,version_no,status,base_batch,base_output_boxes,note,diff,changes,created_by,created_at")
      .eq("bom_id", bomId)
      .order("version_no", { ascending: false });
    const legacyResult = await legacyQuery;
    data = legacyResult.data;
    error = legacyResult.error;
  }

  return { data, error };
}

async function fetchItemsForVersion(supabaseAdmin, versionId) {
  if (!versionId) {
    return { data: [], error: null };
  }

  const selectWithProduct =
    "material_sku_code,material_goods_code,qty,uom_name,notes,planning_offset_days,calculation_basis,headcount_base,headcount_round_mode,machine_base,machine_round_mode,dough_set_base,dough_set_round_mode,products_cache(sku_name,iccat_code,iccat_name)";

  let { data, error } = await supabaseAdmin
    .from("production_bom_items")
    .select(selectWithProduct)
    .eq("version_id", versionId);

  if (error && (isMissingPlanningOffsetColumn(error) || isMissingHeadcountColumns(error))) {
    const fallbackResult = await supabaseAdmin
      .from("production_bom_items")
      .select("material_sku_code,material_goods_code,qty,uom_name,notes,products_cache(sku_name,iccat_code,iccat_name)")
      .eq("version_id", versionId);
    data = (fallbackResult.data ?? []).map((row) => ({
      ...row,
      planning_offset_days: 0,
      calculation_basis: CALCULATION_BASIS.JOB_QTY,
      headcount_base: 1,
      headcount_round_mode: HEADCOUNT_ROUND_MODE.NONE,
      machine_base: 1,
      machine_round_mode: HEADCOUNT_ROUND_MODE.NONE,
      dough_set_base: 1,
      dough_set_round_mode: HEADCOUNT_ROUND_MODE.NONE,
    }));
    error = fallbackResult.error;
  }

  if (error && isRelationshipError(error)) {
    // Fallback: fetch items without relationship and resolve names separately.
    const basicResult = await supabaseAdmin
      .from("production_bom_items")
      .select("material_sku_code,material_goods_code,qty,uom_name,notes,planning_offset_days,calculation_basis,headcount_base,headcount_round_mode,machine_base,machine_round_mode,dough_set_base,dough_set_round_mode")
      .eq("version_id", versionId);

    if (basicResult.error) {
      if (!isMissingPlanningOffsetColumn(basicResult.error) && !isMissingHeadcountColumns(basicResult.error)) {
        return basicResult;
      }
      const legacyBasicResult = await supabaseAdmin
        .from("production_bom_items")
        .select("material_sku_code,material_goods_code,qty,uom_name,notes,calculation_basis,headcount_base,headcount_round_mode,machine_base,machine_round_mode,dough_set_base,dough_set_round_mode")
        .eq("version_id", versionId);
      if (legacyBasicResult.error) {
        return legacyBasicResult;
      }
      basicResult.data = (legacyBasicResult.data ?? []).map((row) => ({
        ...row,
        planning_offset_days: 0,
        dough_set_base: row.dough_set_base ?? 1,
        dough_set_round_mode: row.dough_set_round_mode ?? HEADCOUNT_ROUND_MODE.NONE,
      }));
      basicResult.error = null;
    }

    const codes = Array.from(
      new Set((basicResult.data ?? []).map((row) => row.material_sku_code).filter(Boolean))
    );

    let nameMap = new Map();
    if (codes.length) {
      const namesResult = await supabaseAdmin
        .from("products_cache")
        .select("sku_code,sku_name,iccat_code,iccat_name")
        .in("sku_code", codes);
      if (!namesResult.error) {
        nameMap = new Map(
          (namesResult.data ?? []).map((row) => [row.sku_code, row])
        );
      }
    }

    const hydrated = (basicResult.data ?? []).map((row) => {
      const product = nameMap.get(row.material_sku_code);
      return {
        ...row,
        products_cache: product
          ? {
            sku_name: product.sku_name,
            iccat_code: product.iccat_code,
            iccat_name: product.iccat_name,
          }
          : null,
      };
    });

    return { data: hydrated, error: null };
  }

  return { data, error };
}

export async function GET(request, { params }) {
  try {
    await requirePermissionKeys(request, [
      "production-line-bom-view",
      "production-line-bom-manage",
    ]);
    const { skuCode } = await params;
    const normalizedSku = normalizeParam(skuCode);
    if (!normalizedSku) {
      return Response.json({ error: "skuCode is required" }, { status: 400 });
    }

    const { searchParams } = new URL(request.url);
    const requestedFormulaCode = normalizeFormulaCode(searchParams.get("formulaCode"));
    const supabaseAdmin = getSupabaseAdmin();
    const { data: productRow, error: productError } = await supabaseAdmin
      .from("products_cache")
      .select("sku_code,iccat_code")
      .eq("sku_code", normalizedSku)
      .maybeSingle();
    if (productError) {
      return Response.json({ error: "Failed to load product category" }, { status: 500 });
    }
    const parentType = resolveItemTypeByCategory(productRow?.iccat_code);
    const defaultWipQtyInputMode = parentType === "WIP"
      ? WIP_QTY_INPUT_MODES.BATCH
      : WIP_QTY_INPUT_MODES.UNIT;
    const { data: bom, error: bomError } = await supabaseAdmin
      .from("production_boms")
      .select("id,sku_code,status,updated_at")
      .eq("sku_code", normalizedSku)
      .maybeSingle();
    if (bomError) {
      return Response.json({ error: "Failed to load bom" }, { status: 500 });
    }
    if (!bom) {
      return Response.json({ bom: null, versions: [], items: [] });
    }

    const { data: versions, error: versionsError } = await fetchVersions(
      supabaseAdmin,
      bom.id
    );
    if (versionsError) {
      return Response.json({ error: "Failed to load versions" }, { status: 500 });
    }

    const versionList = (versions ?? []).map((version) => ({
      ...version,
      base_batch: normalizePositiveNumber(version.base_batch, 1),
      base_output_boxes: normalizePositiveNumber(version.base_output_boxes, 1),
      wip_qty_input_mode: normalizeWipQtyInputMode(
        version.wip_qty_input_mode,
        defaultWipQtyInputMode
      ),
      formula_code: normalizeFormulaCode(version.formula_code),
      formula_name: normalizeFormulaName(version.formula_name),
    }));
    const latestVersion = versionList[0];
    const formulasMap = new Map();
    versionList.forEach((version) => {
      const code = normalizeFormulaCode(version.formula_code);
      const existing = formulasMap.get(code);
      if (!existing || Number(version.version_no || 0) > Number(existing.version_no || 0)) {
        formulasMap.set(code, {
          formula_code: code,
          formula_name: normalizeFormulaName(version.formula_name),
          latest_version_no: version.version_no,
          latest_version_id: version.id,
          latest_status: version.status,
        });
      }
    });
    if (formulasMap.size === 0) {
      formulasMap.set(DEFAULT_FORMULA_CODE, {
        formula_code: DEFAULT_FORMULA_CODE,
        formula_name: DEFAULT_FORMULA_NAME,
        latest_version_no: null,
        latest_version_id: null,
        latest_status: null,
      });
    }
    const formulas = Array.from(formulasMap.values()).sort((a, b) => {
      if (a.formula_code === DEFAULT_FORMULA_CODE) return -1;
      if (b.formula_code === DEFAULT_FORMULA_CODE) return 1;
      return a.formula_code.localeCompare(b.formula_code);
    });
    const selectedFormulaCode = formulasMap.has(requestedFormulaCode)
      ? requestedFormulaCode
      : formulas[0].formula_code;
    const formulaVersions = versionList.filter(
      (version) => normalizeFormulaCode(version.formula_code) === selectedFormulaCode
    );
    const activeVersion = pickActiveVersion(formulaVersions) || pickActiveVersion(versionList);
    const versionForItems = activeVersion || latestVersion;
    const userIds = Array.from(
      new Set((versions ?? []).map((row) => row.created_by).filter(Boolean))
    );

    const profilesPromise = userIds.length
      ? supabaseAdmin
        .from("profiles")
        .select("id,username")
        .in("id", userIds)
      : Promise.resolve({ data: [], error: null });

    const itemsPromise = versionForItems?.id
      ? fetchItemsForVersion(supabaseAdmin, versionForItems.id)
      : Promise.resolve({ data: [], error: null });

    const [profilesResult, itemsResult] = await Promise.all([
      profilesPromise,
      itemsPromise,
    ]);

    if (profilesResult.error) {
      return Response.json({ error: "Failed to load users" }, { status: 500 });
    }
    const userMap = new Map();
    (profilesResult.data ?? []).forEach((profile) => {
      userMap.set(profile.id, profile.username || "");
    });

    if (itemsResult.error) {
      return Response.json({ error: "Failed to load items" }, { status: 500 });
    }

    const items = (itemsResult.data ?? [])
      .map((row) => ({
        material_sku_code: row.material_sku_code,
        material_goods_code: row.material_goods_code ?? null,
        material_name: row.products_cache?.sku_name ?? "",
        iccat_code: row.products_cache?.iccat_code ?? "",
        iccat_name: row.products_cache?.iccat_name ?? "",
        qty: Number(row.qty),
        uom_name: row.uom_name ?? "",
        notes: row.notes ?? "",
        planning_offset_days: normalizePlanningOffsetDays(row.planning_offset_days, 0),
        calculation_basis: normalizeCalculationBasis(row.calculation_basis),
        headcount_base: normalizeHeadcountBase(row.headcount_base, 1),
        headcount_round_mode: normalizeHeadcountRoundMode(row.headcount_round_mode),
        machine_base: normalizeHeadcountBase(row.machine_base, 1),
        machine_round_mode: normalizeHeadcountRoundMode(row.machine_round_mode),
        dough_set_base: normalizeHeadcountBase(row.dough_set_base, 1),
        dough_set_round_mode: normalizeHeadcountRoundMode(row.dough_set_round_mode),
      }))
      .sort((a, b) => (a.material_sku_code || "").localeCompare(b.material_sku_code || ""));

    const versionPayload = formulaVersions.map((version) => ({
      ...version,
      boxes_per_batch: Number(version.base_output_boxes || 0) / Number(version.base_batch || 1),
      created_by_name: userMap.get(version.created_by) || null,
    }));

    return Response.json({
      bom,
      versions: versionPayload,
      items,
      formulas,
      selectedFormulaCode,
      activeVersionId: activeVersion?.id ?? null,
      activeVersionStatus: activeVersion?.status ?? null,
      activeVersionNo: activeVersion?.version_no ?? null,
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request, { params }) {
  try {
    const { userId } = await requirePermissionKeys(request, [
      "production-line-bom-manage",
    ]);
    const { skuCode } = await params;
    const normalizedSku = normalizeParam(skuCode);
    if (!normalizedSku) {
      return Response.json({ error: "skuCode is required" }, { status: 400 });
    }

    const body = await readJson(request);
    const note = normalizeParam(body.note) ?? null;
    const formulaCode = normalizeFormulaCode(body.formula_code ?? body.formulaCode);
    const formulaName = normalizeFormulaName(body.formula_name ?? body.formulaName);
    const requestedWipQtyInputMode = normalizeWipQtyInputMode(
      body.wip_qty_input_mode ?? body.wipQtyInputMode,
      WIP_QTY_INPUT_MODES.BATCH
    );
    const baseBatch = normalizePositiveNumber(body.base_batch ?? body.baseBatch, 1);
    const baseOutputBoxes = normalizePositiveNumber(
      body.base_output_boxes ?? body.baseOutputBoxes ?? body.base_output ?? body.baseOutput,
      1
    );
    const boxesPerBatch = baseOutputBoxes / baseBatch;
    const rawItems = Array.isArray(body.items) ? body.items : [];

    const uniqueItems = [];
    const seen = new Set();
    rawItems.forEach((item) => {
      const code = normalizeParam(item.material_sku_code || item.materialCode);
      const goodsCode =
        normalizeParam(
          item.material_goods_code || item.materialGoodsCode || item.goods_code || item.goodsCode
        ) ?? code;
      const itemKey = `${code}::${goodsCode}`;
      if (!code || seen.has(itemKey)) return;
      const qty = Number(item.qty);
      if (Number.isNaN(qty) || qty <= 0) return;
      seen.add(itemKey);
      uniqueItems.push({
        material_sku_code: code,
        material_goods_code: goodsCode,
        qty,
        uom_name: normalizeParam(item.uom_name) ?? "",
        notes: normalizeParam(item.notes) ?? "",
        planning_offset_days: normalizePlanningOffsetDays(
          item.planning_offset_days ?? item.planningOffsetDays,
          0
        ),
        calculation_basis: normalizeCalculationBasis(
          item.calculation_basis ?? item.calculationBasis
        ),
        headcount_base: normalizeHeadcountBase(
          item.headcount_base ?? item.headcountBase,
          1
        ),
        headcount_round_mode: normalizeHeadcountRoundMode(
          item.headcount_round_mode ?? item.headcountRoundMode
        ),
        machine_base: normalizeHeadcountBase(
          item.machine_base ?? item.machineBase,
          1
        ),
        machine_round_mode: normalizeHeadcountRoundMode(
          item.machine_round_mode ?? item.machineRoundMode
        ),
        dough_set_base: normalizeHeadcountBase(
          item.dough_set_base ?? item.doughSetBase,
          1
        ),
        dough_set_round_mode: normalizeHeadcountRoundMode(
          item.dough_set_round_mode ?? item.doughSetRoundMode
        ),
      });
    });

    const supabaseAdmin = getSupabaseAdmin();
    const { data: productRow, error: productError } = await supabaseAdmin
      .from("products_cache")
      .select("sku_code,iccat_code")
      .eq("sku_code", normalizedSku)
      .maybeSingle();
    if (productError) {
      return Response.json({ error: "Failed to load product category" }, { status: 500 });
    }
    if (!productRow) {
      return Response.json({ error: "Product not found in products cache" }, { status: 400 });
    }
    const parentType = resolveItemTypeByCategory(productRow.iccat_code);
    const resolvedWipQtyInputMode = parentType === "WIP"
      ? requestedWipQtyInputMode
      : WIP_QTY_INPUT_MODES.UNIT;

    const componentCodes = Array.from(
      new Set(uniqueItems.map((item) => item.material_sku_code).filter(Boolean))
    );
    let childTypes = [];
    let childEntries = [];
    if (componentCodes.length > 0) {
      const { data: componentRows, error: componentError } = await supabaseAdmin
        .from("products_cache")
        .select("sku_code,iccat_code")
        .in("sku_code", componentCodes);
      if (componentError) {
        return Response.json({ error: "Failed to validate bom components" }, { status: 500 });
      }

      const categoryBySku = new Map(
        (componentRows ?? []).map((row) => [row.sku_code, row.iccat_code])
      );
      const unknownComponents = componentCodes.filter((sku) => !categoryBySku.has(sku));
      if (unknownComponents.length > 0) {
        return Response.json(
          { error: `Unknown component SKU: ${unknownComponents.join(", ")}` },
          { status: 400 }
        );
      }

      childEntries = componentCodes.map((sku) => ({
        materialCode: sku,
        itemType: resolveItemTypeByCategory(categoryBySku.get(sku)),
      }));
      childTypes = childEntries.map((entry) => entry.itemType);
    }

    const matrixCheck = validateBomMatrix({ parentType, childTypes, childEntries });
    if (!matrixCheck.ok) {
      return Response.json(
        {
          error: `BOM matrix validation failed: ${matrixCheck.message}`,
          matrixDetails: matrixCheck.details || [],
        },
        { status: 400 }
      );
    }

    let bomId = null;
    const { data: existingBom, error: existingError } = await supabaseAdmin
      .from("production_boms")
      .select("id")
      .eq("sku_code", normalizedSku)
      .maybeSingle();
    if (existingError) {
      return Response.json({ error: "Failed to load bom" }, { status: 500 });
    }

    const isNewBom = !existingBom;

    if (existingBom) {
      bomId = existingBom.id;
    } else {
      // Create new BOM (will update status after determining changes)
      const { data: newBom, error: createError } = await supabaseAdmin
        .from("production_boms")
        .insert({
          sku_code: normalizedSku,
          status: "approved", // Will be updated if needed
          created_by: userId,
          updated_by: userId,
        })
        .select("id")
        .maybeSingle();
      if (createError) {
        return Response.json({ error: "Failed to create bom" }, { status: 500 });
      }
      bomId = newBom?.id ?? null;
    }

    if (!bomId) {
      return Response.json({ error: "Failed to resolve bom id" }, { status: 500 });
    }

    const { data: lastVersionOverall, error: lastOverallError } = await supabaseAdmin
      .from("production_bom_versions")
      .select("id,version_no")
      .eq("bom_id", bomId)
      .is("deleted_at", null)
      .order("version_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (lastOverallError && !isMissingDeletedAtColumn(lastOverallError)) {
      return Response.json({ error: "Failed to load latest version" }, { status: 500 });
    }
    const { data: lastVersion, error: lastVersionError } = await supabaseAdmin
      .from("production_bom_versions")
      .select("id,version_no,base_batch,base_output_boxes,formula_code,wip_qty_input_mode")
      .eq("bom_id", bomId)
      .eq("formula_code", formulaCode)
      .is("deleted_at", null)
      .order("version_no", { ascending: false })
      .limit(1)
      .maybeSingle();
    let resolvedLastVersion = lastVersion;
    if (lastVersionError) {
      if (
        isMissingFormulaColumns(lastVersionError) ||
        isMissingDeletedAtColumn(lastVersionError) ||
        isMissingBaseMetricsColumns(lastVersionError) ||
        isMissingWipQtyModeColumn(lastVersionError)
      ) {
        const fallbackLastVersion = await supabaseAdmin
          .from("production_bom_versions")
          .select("id,version_no,base_batch,base_output_boxes")
          .eq("bom_id", bomId)
          .order("version_no", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (fallbackLastVersion.error) {
          return Response.json({ error: "Failed to load latest version" }, { status: 500 });
        }
        resolvedLastVersion = fallbackLastVersion.data;
      } else {
        return Response.json({ error: "Failed to load latest version" }, { status: 500 });
      }
    }

    let previousItems = [];
    if (resolvedLastVersion?.id) {
      const { data: prevItems, error: prevError } = await supabaseAdmin
        .from("production_bom_items")
        .select("material_sku_code,material_goods_code,qty,uom_name,notes,planning_offset_days,calculation_basis,headcount_base,headcount_round_mode,machine_base,machine_round_mode,dough_set_base,dough_set_round_mode")
        .eq("version_id", resolvedLastVersion.id);
      if (prevError && !isMissingPlanningOffsetColumn(prevError) && !isMissingHeadcountColumns(prevError)) {
        return Response.json({ error: "Failed to load previous items" }, { status: 500 });
      }
      if (prevError && (isMissingPlanningOffsetColumn(prevError) || isMissingHeadcountColumns(prevError))) {
        const legacyPrevItems = await supabaseAdmin
          .from("production_bom_items")
          .select("material_sku_code,material_goods_code,qty,uom_name,notes,calculation_basis,headcount_base,headcount_round_mode,machine_base,machine_round_mode")
          .eq("version_id", resolvedLastVersion.id);
        if (legacyPrevItems.error) {
          return Response.json({ error: "Failed to load previous items" }, { status: 500 });
        }
        previousItems = (legacyPrevItems.data ?? []).map((item) => ({
          ...item,
          planning_offset_days: 0,
          dough_set_base: 1,
          dough_set_round_mode: HEADCOUNT_ROUND_MODE.NONE,
        }));
      } else {
        previousItems = prevItems ?? [];
      }
    }

    const nameMap = await fetchNamesMap(
      supabaseAdmin,
      Array.from(new Set([...previousItems, ...uniqueItems].map((item) => item.material_sku_code)))
    );
    const { diff, changes } = buildDiff(previousItems, uniqueItems, nameMap);

    // Determine status based on:
    // 1. First version (no lastVersion) or empty previous items → auto-approve
    // 2. No material changes (only note changed) → auto-approve
    // 3. Has material changes → pending_review
    const isFirstVersion = !resolvedLastVersion;
    const materialChangeCount = changes.length;
    const previousBaseBatch = Number(resolvedLastVersion?.base_batch ?? 1) || 1;
    const baseBatchChanged = !isFirstVersion && Number(baseBatch) !== previousBaseBatch;
    const previousBaseOutputBoxes = normalizePositiveNumber(
      resolvedLastVersion?.base_output_boxes,
      1
    );
    const baseOutputChanged = !isFirstVersion && Number(baseOutputBoxes) !== previousBaseOutputBoxes;
    const previousWipQtyInputMode = normalizeWipQtyInputMode(
      resolvedLastVersion?.wip_qty_input_mode,
      WIP_QTY_INPUT_MODES.BATCH
    );
    const wipQtyInputModeChanged =
      !isFirstVersion &&
      parentType === "WIP" &&
      previousWipQtyInputMode !== resolvedWipQtyInputMode;
    if (baseBatchChanged) {
      changes.push(`ปรับฐาน batch ${previousBaseBatch} -> ${baseBatch}`);
    }
    if (baseOutputChanged) {
      changes.push(`ปรับจำนวนลังอ้างอิง ${previousBaseOutputBoxes} -> ${baseOutputBoxes}`);
    }
    if (wipQtyInputModeChanged) {
      changes.push(`ปรับโหมดกรอก WIP ${previousWipQtyInputMode} -> ${resolvedWipQtyInputMode}`);
    }
    const hasMaterialChanges = materialChangeCount > 0;
    const hasConfigurationChange = baseBatchChanged || baseOutputChanged || wipQtyInputModeChanged;
    const approvalSettings = await getBomApprovalSettings(supabaseAdmin);

    let resolvedStatus;
    if (!approvalSettings.requireApproval) {
      resolvedStatus = "approved";
    } else if (isFirstVersion || previousItems.length === 0) {
      // First version or product had no materials before → auto-approve
      resolvedStatus = "approved";
    } else if (!hasMaterialChanges && !hasConfigurationChange) {
      // Only note changed, no material changes → keep approved
      resolvedStatus = "approved";
    } else {
      // Has material/base boxes changes → need approval
      resolvedStatus = "pending_review";
    }

    // Update BOM status
    const { error: updateError } = await supabaseAdmin
      .from("production_boms")
      .update({ status: resolvedStatus, updated_by: userId })
      .eq("id", bomId);
    if (updateError) {
      return Response.json({ error: "Failed to update bom status" }, { status: 500 });
    }

    const nextVersionNo = (lastVersionOverall?.version_no ?? resolvedLastVersion?.version_no ?? 0) + 1;
    let versionInsert = {
      bom_id: bomId,
      version_no: nextVersionNo,
      status: resolvedStatus,
      base_batch: baseBatch,
      base_output_boxes: baseOutputBoxes,
      wip_qty_input_mode: resolvedWipQtyInputMode,
      note,
      diff,
      changes,
      created_by: userId,
      formula_code: formulaCode,
      formula_name: formulaName,
    };
    let { data: version, error: versionError } = await supabaseAdmin
      .from("production_bom_versions")
      .insert(versionInsert)
      .select("id,version_no,status,base_batch,base_output_boxes,wip_qty_input_mode,formula_code,formula_name,note,created_by,created_at")
      .maybeSingle();
    if (versionError && (
      isMissingFormulaColumns(versionError) ||
      isMissingBaseMetricsColumns(versionError) ||
      isMissingWipQtyModeColumn(versionError)
    )) {
      versionInsert = {
        bom_id: bomId,
        version_no: nextVersionNo,
        status: resolvedStatus,
        base_batch: baseBatch,
        base_output_boxes: baseOutputBoxes,
        note,
        diff,
        changes,
        created_by: userId,
      };
      const fallbackInsert = await supabaseAdmin
        .from("production_bom_versions")
        .insert(versionInsert)
        .select("id,version_no,status,base_batch,base_output_boxes,note,created_by,created_at")
        .maybeSingle();
      version = fallbackInsert.data;
      versionError = fallbackInsert.error;
    }
    if (versionError) {
      return Response.json({ error: "Failed to create version" }, { status: 500 });
    }

    if (uniqueItems.length) {
      const rows = uniqueItems.map((item) => ({
        version_id: version.id,
        material_sku_code: item.material_sku_code,
        material_goods_code: item.material_goods_code,
        qty: item.qty,
        uom_name: item.uom_name,
        notes: item.notes,
        planning_offset_days: item.planning_offset_days,
        calculation_basis: item.calculation_basis,
        headcount_base: item.headcount_base,
        headcount_round_mode: item.headcount_round_mode,
        machine_base: item.machine_base,
        machine_round_mode: item.machine_round_mode,
        dough_set_base: item.dough_set_base,
        dough_set_round_mode: item.dough_set_round_mode,
      }));
      let { error: itemsError } = await supabaseAdmin
        .from("production_bom_items")
        .insert(rows);
      if (itemsError && (isMissingPlanningOffsetColumn(itemsError) || isMissingHeadcountColumns(itemsError))) {
        const legacyRows = rows.map(
          ({
            planning_offset_days,
            calculation_basis,
            headcount_base,
            headcount_round_mode,
            machine_base,
            machine_round_mode,
            dough_set_base,
            dough_set_round_mode,
            ...row
          }) => row
        );
        const legacyInsert = await supabaseAdmin
          .from("production_bom_items")
          .insert(legacyRows);
        itemsError = legacyInsert.error;
      }
      if (itemsError) {
        return Response.json({ error: "Failed to create bom items" }, { status: 500 });
      }
    }

    return Response.json({
      bom: { id: bomId, sku_code: normalizedSku, status: resolvedStatus },
      version: {
        ...version,
        base_batch: normalizePositiveNumber(version?.base_batch ?? baseBatch, 1),
        base_output_boxes: normalizePositiveNumber(version?.base_output_boxes ?? baseOutputBoxes, 1),
        wip_qty_input_mode: normalizeWipQtyInputMode(
          version?.wip_qty_input_mode,
          resolvedWipQtyInputMode
        ),
        boxes_per_batch: boxesPerBatch,
        formula_code: normalizeFormulaCode(version?.formula_code),
        formula_name: normalizeFormulaName(version?.formula_name),
      },
      items: uniqueItems,
    });
  } catch (error) {
    return jsonError(error);
  }
}



