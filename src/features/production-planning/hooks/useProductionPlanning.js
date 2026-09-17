import { useState, useCallback, useMemo, useEffect } from "react";
import useSWR from "swr";
import { fetchJson, fetcher } from "@/lib/clientFetch";
import { buildMasterPlanNo, extractMasterPlanSequence, makeMasterPlanPrefix } from "@/lib/planNo";
import { fetchCalculation } from "../services/calculationService";
import {
  isConfirmedPlanPolicyStatus,
  normalizePlanPolicyStatus,
  PLAN_POLICY_STATUSES,
} from "@/features/production-planning/services/policyStatus";
import { BOM_ITEM_TYPES, resolveItemTypeByCategory } from "@/lib/bomMatrix";

function normalizeDateInput(value) {
  if (!value) return null;
  const raw = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return raw;
}

function toUtcDate(value) {
  const normalized = normalizeDateInput(value);
  if (!normalized) return null;
  return new Date(`${normalized}T00:00:00.000Z`);
}

function formatUtcDate(date) {
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

function addDays(value, days) {
  const base = toUtcDate(value);
  if (!base) return null;
  const next = new Date(base);
  next.setUTCDate(next.getUTCDate() + Number(days || 0));
  return formatUtcDate(next);
}

function startOfMonth(value) {
  const normalized = normalizeDateInput(value);
  if (!normalized) return null;
  return `${normalized.slice(0, 7)}-01`;
}

function endOfMonth(value) {
  const normalized = normalizeDateInput(value);
  if (!normalized) return null;
  const date = new Date(`${normalized}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return formatUtcDate(end);
}

function buildStatusWindow(startValue, endValue, fallbackDate) {
  const safeFallback = normalizeDateInput(fallbackDate);
  const normalizedStart = normalizeDateInput(startValue) || safeFallback;
  const normalizedEnd = normalizeDateInput(endValue) || normalizedStart || safeFallback;
  const periodStart = startOfMonth(normalizedStart);
  const periodEnd = endOfMonth(normalizedEnd) || normalizedEnd || periodStart;
  return {
    periodStart,
    periodEnd,
  };
}

function buildStatusApiUrl(window) {
  const query = new URLSearchParams();
  if (window?.periodStart) query.set("periodStart", window.periodStart);
  if (window?.periodEnd) query.set("periodEnd", window.periodEnd);
  return query.size
    ? `/api/production-planning/status?${query.toString()}`
    : "/api/production-planning/status";
}

function maxDate(a, b) {
  const aDate = toUtcDate(a);
  const bDate = toUtcDate(b);
  if (!aDate && !bDate) return null;
  if (!aDate) return formatUtcDate(bDate);
  if (!bDate) return formatUtcDate(aDate);
  return aDate.getTime() >= bDate.getTime() ? formatUtcDate(aDate) : formatUtcDate(bDate);
}

function normalizeBoardTime(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  if (!normalized) return null;
  const matched = normalized.match(/^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/);
  if (!matched) return null;
  return `${matched[1]}:${matched[2]}`;
}

function toNullableInteger(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.trunc(parsed);
}

function makePlanGroupId(periodStart, periodEnd) {
  void periodEnd;
  const start = normalizeDateInput(periodStart);
  if (!start) return null;
  return buildMasterPlanNo(start, 1);
}

function normalizePlanGroupId(value) {
  // Planning UI accepts human-friendly Plan No (including legacy/temporary formats),
  // not only the strict MP-YYYY-MM-XXX format.
  const normalized = String(value || "").trim().toUpperCase();
  if (!normalized) return null;
  if (!/^[A-Z0-9][A-Z0-9-]{2,}$/.test(normalized)) return null;
  return normalized;
}

function isDateWithin(dateValue, startValue, endValue) {
  const date = toUtcDate(dateValue);
  const start = toUtcDate(startValue);
  const end = toUtcDate(endValue);
  if (!date || !start || !end) return false;
  return date.getTime() >= start.getTime() && date.getTime() <= end.getTime();
}

const DEFAULT_FORMULA_CODE = "DEFAULT";
const DEFAULT_FORMULA_NAME = "ไม่ระบุ";
const ENABLE_PLANNING_DEMO_DATA = process.env.NEXT_PUBLIC_ENABLE_PLANNING_DEMO_DATA === "true";
const SWR_STABLE_OPTIONS = Object.freeze({
  revalidateOnFocus: false,
  revalidateOnReconnect: false,
  revalidateIfStale: false,
  dedupingInterval: 10000,
});

function normalizeFormulaCode(value) {
  if (!value) return DEFAULT_FORMULA_CODE;
  return String(value).trim().toUpperCase() || DEFAULT_FORMULA_CODE;
}

function normalizeFormulaName(value) {
  if (!value) return DEFAULT_FORMULA_NAME;
  return String(value).trim() || DEFAULT_FORMULA_NAME;
}

function normalizeFormulaOptions(rawOptions) {
  if (!Array.isArray(rawOptions) || rawOptions.length === 0) {
    return [{
      formula_code: DEFAULT_FORMULA_CODE,
      formula_name: DEFAULT_FORMULA_NAME,
      bom_version_id: null,
    }];
  }
  return rawOptions.map((option) => ({
    formula_code: normalizeFormulaCode(option?.formula_code),
    formula_name: normalizeFormulaName(option?.formula_name),
    bom_version_id: option?.bom_version_id || null,
  }));
}

export function useProductionPlanning({ initialView = "master", initialStatusPayload = null } = {}) {
  // Step 1: Date Selection
  const todayStr = useMemo(() => new Date().toISOString().split("T")[0], []);
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split("T")[0]);

  // Step 2: Filters & Product Selection
  const [selectedType, setSelectedType] = useState("all");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [manualPlanGroupId, setManualPlanGroupId] = useState("");

  // Step 3: Drawer State
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Calculation Modal State
  const [isCalculationModalOpen, setIsCalculationModalOpen] = useState(false);
  const [calculationResult, setCalculationResult] = useState(null);
  const [calculationPlanSummaries, setCalculationPlanSummaries] = useState([]);
  const [calculationBreakdown, setCalculationBreakdown] = useState({
    fgDemand: [],
    wipDemand: [],
    rawRequisition: [],
    planMaterials: [],
    planSummaries: [],
    warnings: [],
  });
  const [isCalculating, setIsCalculating] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [isPublishingMasterPlan, setIsPublishingMasterPlan] = useState(false);
  const [lastStockPayload, setLastStockPayload] = useState(null);

  // Temporary Table State
  const [plannedItems, setPlannedItems] = useState([]);
  const [confirmedItems, setConfirmedItems] = useState([]);
  const [statusSaving, setStatusSaving] = useState(false);

  const isExpired = useCallback((item) => {
    if (!item?.endDate) return false;
    const end = new Date(item.endDate);
    end.setHours(23, 59, 59, 999);
    return end.getTime() < Date.now();
  }, []);

  const statusWindow = useMemo(
    () => buildStatusWindow(startDate, endDate, todayStr),
    [endDate, startDate, todayStr]
  );
  const statusApiUrl = useMemo(() => buildStatusApiUrl(statusWindow), [statusWindow]);
  const initialStatusApiUrl = useMemo(
    () => buildStatusApiUrl(buildStatusWindow(todayStr, todayStr, todayStr)),
    [todayStr]
  );
  const statusSwrOptions = useMemo(
    () => ({
      ...SWR_STABLE_OPTIONS,
      ...(initialStatusPayload && statusApiUrl === initialStatusApiUrl
        ? { fallbackData: initialStatusPayload }
        : {}),
    }),
    [initialStatusApiUrl, initialStatusPayload, statusApiUrl]
  );

  // 1. Fetch Custom Production Categories (Types)
  const { data: categoriesData, isLoading: loadingCategories } = useSWR(
    initialView === "plan" ? null : "/api/production-categories",
    fetcher,
    SWR_STABLE_OPTIONS
  );

  // 2. Fetch Base Products (03, 04, 04-1, 04-2) + BOM status in parallel
  const { data: baseProductsData, isLoading: loadingBaseProducts } = useSWR(
    initialView === "plan" ? null : "/api/products?iccatCodes=03,04,04-1,04-2&pageSize=2000",
    fetcher,
    SWR_STABLE_OPTIONS
  );

  const { data: bomStatusData, isLoading: loadingBomStatus } = useSWR(
    initialView === "plan" ? null : "/api/production-bom-products?bomFilter=all&iccatCodes=03,04,04-1,04-2&pageSize=2000",
    fetcher,
    SWR_STABLE_OPTIONS
  );

  const { data: masterPlanWipData, isLoading: loadingMasterPlanWip } = useSWR(
    initialView === "plan" ? null : "/api/production-planning/wip-products?masterPlanOnly=1&limit=2000",
    fetcher,
    SWR_STABLE_OPTIONS
  );

  const { data: statusData, isLoading: loadingStatus, mutate: mutateStatus } = useSWR(
    statusApiUrl,
    fetcher,
    statusSwrOptions
  );
  const { data: sectionShiftData } = useSWR(
    "/api/production-section-shifts",
    fetcher,
    SWR_STABLE_OPTIONS
  );
  const sectionShiftGroups = useMemo(
    () => (
      Array.isArray(sectionShiftData?.sections)
        ? sectionShiftData.sections.filter(
          (section) => Array.isArray(section?.shifts) && section.shifts.length > 0
        )
        : []
    ),
    [sectionShiftData?.sections]
  );
  const productionShifts = useMemo(
    () => sectionShiftGroups.flatMap((section) => (
      Array.isArray(section?.shifts)
        ? section.shifts.map((shift) => ({
          shiftId: shift.shiftId,
          shiftCode: shift.shiftCode,
          shiftName: shift.shiftName,
          shiftLabel: shift.label || shift.shiftLabel || shift.shiftName || shift.shiftCode || "-",
          shiftStartTime: shift.startTime,
          shiftEndTime: shift.endTime,
          shiftCrossesMidnight: shift.crossesMidnight === true,
          sectionDefId: section.id,
          sectionName: section.name,
          departmentId: section.departmentId,
          departmentCode: section.departmentCode,
          departmentName: section.departmentName,
        }))
        : []
    )),
    [sectionShiftGroups]
  );
  const statusRows = useMemo(
    () => (Array.isArray(statusData?.data) ? statusData.data : []),
    [statusData?.data]
  );
  const planningScopeMeta = statusData?.meta ?? null;
  const canManageGlobal = Boolean(planningScopeMeta?.canManageGlobal) || Boolean(planningScopeMeta?.isAdmin);
  const editableSkuSet = useMemo(() => {
    if (canManageGlobal) {
      return null;
    }
    // If scope metadata is not available yet, do not accidentally filter everything out.
    if (!planningScopeMeta || !Array.isArray(planningScopeMeta.editableSkus)) {
      return null;
    }
    // In dev/test environments (ex: TestSprite), allow UI to stay usable even when
    // a user has no department mappings yet; server-side guards still enforce edits.
    const allowDevFallback = process.env.NODE_ENV !== "production";
    if (allowDevFallback && planningScopeMeta.editableSkus.length === 0) {
      return null;
    }
    return new Set(
      planningScopeMeta.editableSkus
        .map((sku) => String(sku || "").trim().toUpperCase())
        .filter(Boolean)
    );
  }, [canManageGlobal, planningScopeMeta]);

  const inferredPlanKindById = useMemo(() => {
    const rows = statusRows;
    if (!rows.length) return new Map();

    const explicitKinds = new Map();
    const groups = new Map();
    const readyByGroup = new Map();

    const getRowId = (row) =>
      row.plan_id ||
      row.id ||
      `${row.sku_code || "SKU"}-${row.period_start || ""}-${row.period_end || ""}`;
    const getGroupId = (row) =>
      row.plan_group_id ||
      makePlanGroupId(row.period_start, row.period_end || row.period_start);
    const getSortTs = (row) => {
      const tsDate =
        toUtcDate(row.inserted_at) ||
        toUtcDate(row.confirmed_at) ||
        toUtcDate(row.updated_at) ||
        toUtcDate(row.period_start);
      return tsDate ? tsDate.getTime() : Number.POSITIVE_INFINITY;
    };

    const getStatus = (row) => row.status ?? (row.confirmed_at ? "ready" : "not_ready");

    rows.forEach((row) => {
      const id = getRowId(row);
      const groupId = getGroupId(row);
      if (!id || !groupId) return;
      const status = getStatus(row);
      if (row.plan_kind) {
        explicitKinds.set(id, row.plan_kind);
      }
      if (!groups.has(groupId)) {
        groups.set(groupId, []);
      }
      groups.get(groupId).push({ row, id, sortTs: getSortTs(row), status });
    });

    const inferred = new Map();

    groups.forEach((items, groupId) => {
      const readyItems = items.filter((item) =>
        isConfirmedPlanPolicyStatus(item.status)
      );
      const explicitReadyMain = readyItems.find(({ id }) => explicitKinds.get(id) === "main");
      const mainItem =
        explicitReadyMain ||
        readyItems
          .slice()
          .sort((a, b) => a.sortTs - b.sortTs)[0];
      if (mainItem?.id) {
        readyByGroup.set(groupId, mainItem.id);
      }
    });

    groups.forEach((items, groupId) => {
      const mainId = readyByGroup.get(groupId) || null;
      items.forEach(({ id, status }) => {
        const explicitKind = explicitKinds.get(id) || null;
        if (explicitKind === "sub" && !isConfirmedPlanPolicyStatus(status) && !mainId) {
          inferred.set(id, "main");
          return;
        }
        if (explicitKind) {
          inferred.set(id, explicitKind);
          return;
        }
        if (mainId) {
          inferred.set(id, id === mainId ? "main" : "sub");
          return;
        }
        inferred.set(id, "main");
      });
    });

    return inferred;
  }, [statusRows]);

  const mainPlanRanges = useMemo(() => {
    const rows = statusRows;
    const ranges = [];
    const getRowId = (row) =>
      row.plan_id ||
      row.id ||
      `${row.sku_code || "SKU"}-${row.period_start || ""}-${row.period_end || ""}`;
    rows.forEach((row) => {
      const status = row?.status ?? (row?.confirmed_at ? "ready" : "not_ready");
      if (!isConfirmedPlanPolicyStatus(status)) {
        return;
      }
      const id = getRowId(row);
      const kind =
        row.plan_kind ||
        inferredPlanKindById.get(id) ||
        (row.parent_plan_id ? "sub" : "main");
      if (kind !== "main") return;
      const start = normalizeDateInput(row.period_start);
      const end = normalizeDateInput(row.period_end) || start;
      if (!start || !end) return;
      const groupId = row.plan_group_id || makePlanGroupId(start, end);
      ranges.push({
        planId: row.plan_id || id,
        start,
        end,
        groupId,
        sortTs: toUtcDate(row.inserted_at || row.period_start)?.getTime() ?? Number.POSITIVE_INFINITY,
      });
    });
    return ranges.sort((a, b) => a.sortTs - b.sortTs);
  }, [inferredPlanKindById, statusRows]);

  const activeMainPlan = useMemo(() => {
    if (!startDate) return null;
    return (
      mainPlanRanges.find((range) => isDateWithin(startDate, range.start, range.end)) || null
    );
  }, [mainPlanRanges, startDate]);

  const suggestedPlanGroupId = useMemo(() => {
    if (activeMainPlan?.groupId) return activeMainPlan.groupId;
    const normalizedStart = normalizeDateInput(startDate);
    if (!normalizedStart) return makePlanGroupId(startDate, endDate);
    const prefix = makeMasterPlanPrefix(normalizedStart);
    if (!prefix) return makePlanGroupId(startDate, endDate);
    let maxSequence = 0;
    const seen = new Set();
    (statusRows || []).forEach((row) => {
      const candidates = [
        row?.master_plan_no,
        row?.plan_group_id,
        row?.plan_no,
        row?.masterPlanNo,
        row?.planGroupId,
      ];
      candidates.forEach((value) => {
        const candidate = String(value || "").trim().toUpperCase();
        if (!candidate || seen.has(candidate)) return;
        seen.add(candidate);
        if (!candidate.startsWith(prefix)) return;
        const sequence = extractMasterPlanSequence(candidate);
        if (Number.isFinite(sequence) && sequence > maxSequence) {
          maxSequence = sequence;
        }
      });
    });
    return buildMasterPlanNo(normalizedStart, Math.min(999, maxSequence + 1)) || makePlanGroupId(startDate, endDate);
  }, [activeMainPlan?.groupId, endDate, startDate, statusRows]);

  // Keep the input value exactly what the user typed (tests rely on being able to clear it),
  // and use suggestedPlanGroupId as fallback only for persistence logic.
  const currentPlanGroupId = String(manualPlanGroupId || "").trim().toUpperCase();
  const planKindHint = activeMainPlan ? "sub" : "main";

  const tPlusDaysDefault = 3;
  const minEndDate = useMemo(() => {
    if (planKindHint !== "sub") {
      return startDate;
    }
    return addDays(startDate, tPlusDaysDefault) || startDate;
  }, [planKindHint, startDate, tPlusDaysDefault]);

  // 3. Fetch Products mapped to Selected Category (if specific type selected)
  const isSpecificType = selectedType && selectedType !== "all";
  const { data: categoryProductsData, isLoading: loadingCategoryProducts } = useSWR(
    isSpecificType ? `/api/production-category-products?categoryId=${selectedType}` : null,
    fetcher,
    SWR_STABLE_OPTIONS
  );

  const { data: planningCatalogData, isLoading: loadingPlanningCatalog } = useSWR(
    initialView === "plan" ? null : "/api/production-planning/catalog",
    fetcher,
    SWR_STABLE_OPTIONS
  );

  // Filter Logic
  const planningProducts = useMemo(() => {
    const baseList = baseProductsData?.data ?? [];
    const bomRows = bomStatusData?.data ?? [];
    const bomMap = new Map(
      bomRows.map((row) => {
        const sku = String(row.sku_code || row.SKU_CODE || "").toUpperCase();
        return [sku, {
          status: row.bom_status || null,
          formulaOptions: normalizeFormulaOptions(row.formula_options),
          formulaCount: Number(row.formula_count || 0),
        }];
      })
    );

    const bySku = new Map();
    baseList.forEach((p) => {
      const sku = String(p.SKU_CODE || "").toUpperCase();
      if (!sku) return;
      bySku.set(sku, p);
    });

    // Merge in products_cache rows (ex: ICCAT 03) that might be missing from ERP products list
    bomRows.forEach((row) => {
      const sku = String(row.sku_code || row.SKU_CODE || "").toUpperCase();
      if (!sku || bySku.has(sku)) return;
      bySku.set(sku, {
        SKU_CODE: row.sku_code || row.SKU_CODE || "",
        SKU_NAME: row.sku_name || row.SKU_NAME || "",
        UTQ_NAME: row.uom_name || row.UTQ_NAME || "",
        UTQ_NAME_1: row.uom_name || row.UTQ_NAME_1 || "",
        ICCAT_CODE: row.iccat_code || row.ICCAT_CODE || "",
        ICCAT_NAME: row.iccat_name || row.ICCAT_NAME || "",
      });
    });

    const masterPlanWipRows = Array.isArray(masterPlanWipData?.data) ? masterPlanWipData.data : [];
    masterPlanWipRows.forEach((row) => {
      const sku = String(row?.skuCode || "").trim().toUpperCase();
      if (!sku) return;
      bySku.set(sku, {
        ...(bySku.get(sku) || {}),
        SKU_CODE: sku,
        SKU_NAME: row?.skuName || sku,
        UTQ_NAME: row?.uomName || "unit",
        UTQ_NAME_1: row?.uomName || "unit",
        ICCAT_CODE: "03",
        ICCAT_NAME: "WIP",
        hasBom: Array.isArray(row?.formulaOptions) && row.formulaOptions.length > 0,
        formula_options: row?.formulaOptions || [],
        formula_count: Array.isArray(row?.formulaOptions) ? row.formulaOptions.length : 0,
        canPlanAsMain: true,
        planningProductType: "WIP",
        wipQtyInputMode: String(row?.wipQtyInputMode || "").trim().toLowerCase(),
        unitsPerBatch: Number(row?.unitsPerBatch || 0) || 0,
      });
    });

    let mergedList = Array.from(bySku.values());

    // Optional local demo fallback (disabled by default).
    if (ENABLE_PLANNING_DEMO_DATA && mergedList.length === 0) {
      mergedList = [{
        SKU_CODE: "DEMO-FG-001",
        SKU_NAME: "Demo Finished Good",
        UTQ_NAME: "batch",
        UTQ_NAME_1: "batch",
        ICCAT_CODE: "03",
        ICCAT_NAME: "DEMO",
      }];
    }

    const scopedList = editableSkuSet
      ? mergedList.filter((p) => editableSkuSet.has(String(p.SKU_CODE || "").toUpperCase()))
      : mergedList;

    return scopedList.map((p) => {
      const sku = String(p.SKU_CODE || "").toUpperCase();
      const bomMeta = bomMap.get(sku);
      const hasApprovedFormula = Number(bomMeta?.formulaCount || 0) > 0;
      return {
        ...p,
        hasBom: p?.hasBom === true || hasApprovedFormula,
        formula_options: Array.isArray(p?.formula_options) && p.formula_options.length
          ? p.formula_options
          : (bomMeta?.formulaOptions || normalizeFormulaOptions([])),
        formula_count: Number(p?.formula_count || 0) || bomMeta?.formulaCount || 0,
      };
    });
  }, [baseProductsData, bomStatusData, editableSkuSet, masterPlanWipData]);

  const planningProductBySku = useMemo(() => {
    const map = new Map();
    (planningProducts ?? []).forEach((product) => {
      const sku = String(product?.SKU_CODE || "").trim().toUpperCase();
      if (!sku) return;
      map.set(sku, product);
    });
    return map;
  }, [planningProducts]);

  const planningCategoryProductOptions = useMemo(() => {
    const catalog = planningCatalogData?.data ?? {};
    const categories = Array.isArray(catalog?.categories) ? catalog.categories : [];
    const mappings = Array.isArray(catalog?.mappings) ? catalog.mappings : [];
    const byCategory = new Map();

    categories.forEach((category) => {
      byCategory.set(String(category.id), []);
    });
    const masterPlanWipProducts = (planningProducts ?? []).filter(
      (product) => product?.canPlanAsMain === true && String(product?.ICCAT_CODE || "").trim() === "03"
    );

    mappings.forEach((mapping) => {
      const categoryId = String(mapping?.category_id || "").trim();
      const skuCode = String(mapping?.sku_code || "").trim().toUpperCase();
      const product = planningProductBySku.get(skuCode);
      if (!categoryId || !product) return;
      if (!byCategory.has(categoryId)) {
        byCategory.set(categoryId, []);
      }
      byCategory.get(categoryId).push(product);
    });

    byCategory.forEach((items, key) => {
      const bySku = new Map();
      [...items, ...masterPlanWipProducts].forEach((product) => {
        const sku = String(product?.SKU_CODE || "").trim().toUpperCase();
        if (!sku) return;
        bySku.set(sku, product);
      });
      const mergedItems = Array.from(bySku.values()).sort((a, b) =>
        String(a?.SKU_NAME || "").localeCompare(String(b?.SKU_NAME || ""))
      );
      byCategory.set(key, mergedItems);
    });

    return byCategory;
  }, [planningCatalogData, planningProductBySku, planningProducts]);

  const products = useMemo(() => {
    if (!isSpecificType) {
      return planningProducts;
    }
    const mappedSkuSet = new Set(
      (categoryProductsData?.data ?? []).map((p) => String(p.sku_code || p.SKU_CODE || "").toUpperCase())
    );
    const bySku = new Map();
    planningProducts.forEach((product) => {
      const sku = String(product?.SKU_CODE || "").trim().toUpperCase();
      if (!sku) return;
      const isMappedToCategory = mappedSkuSet.has(sku);
      const isMasterPlanWip = product?.canPlanAsMain === true && String(product?.ICCAT_CODE || "").trim() === "03";
      if (isMappedToCategory || isMasterPlanWip) {
        bySku.set(sku, product);
      }
    });
    return Array.from(bySku.values());
  }, [categoryProductsData, isSpecificType, planningProducts]);

  const planningSkuMetaBySku = useMemo(() => {
    const map = new Map();
    (planningProducts ?? []).forEach((product) => {
      const sku = String(product?.SKU_CODE || "").trim().toUpperCase();
      if (!sku) return;
      const productType = resolveItemTypeByCategory(product?.ICCAT_CODE);
      const qtyPerBatchRaw = Number(product?.UTQ_QTY_1);
      const qtyPerBatch = Number.isFinite(qtyPerBatchRaw) && qtyPerBatchRaw > 0 ? qtyPerBatchRaw : 1;
      map.set(sku, {
        isFgProduct: productType === BOM_ITEM_TYPES.FG,
        qtyPerBatch,
        brandName: String(product?.BRN_NAME || product?.brand_name || "").trim() || null,
        displayUnit: String(product?.UTQ_NAME || "").trim()
          || String(product?.UTQ_NAME_1 || "").trim()
          || "unit",
        productType,
        planningProductType: product?.planningProductType || productType,
        canPlanAsMain: product?.canPlanAsMain === true,
      });
    });
    return map;
  }, [planningProducts]);

  const persistStatusRecords = useCallback(async (records) => {
    if (!records?.length) return;
    try {
      const response = await fetch("/api/production-planning/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "persist status failed");
      }
      mutateStatus();
    } catch (error) {
      console.error("persist status failed", error);
    }
  }, [mutateStatus]);

  const buildStatusRecordFromItem = useCallback((item, overrides = {}) => {
    const nextItem = { ...item, ...overrides };
    return {
      plan_id: nextItem.id,
      sku_code: nextItem.skuCode,
      sku_name: nextItem.skuName,
      category_id: nextItem.categoryId || null,
      category_name: nextItem.categoryName || "",
      status: nextItem.status || "not_ready",
      planned_qty: Number(nextItem.quantity ?? 0) || 0,
      unit: nextItem.unit,
      period_start: nextItem.date,
      period_end: nextItem.endDate,
      confirmed_at: nextItem.confirmedAt || null,
      bom_snapshot: Array.isArray(nextItem.bomSnapshot) ? nextItem.bomSnapshot : [],
      plan_group_id: nextItem.planGroupId || null,
      plan_kind: nextItem.planKind || planKindHint,
      parent_plan_id: nextItem.parentPlanId ?? null,
      entry_date: nextItem.entryDate || nextItem.date,
      t_plus_days: nextItem.tPlusDays || tPlusDaysDefault,
      due_date: nextItem.dueDate || nextItem.endDate,
      formula_code: normalizeFormulaCode(nextItem.formulaCode),
      formula_name: normalizeFormulaName(nextItem.formulaName),
      bom_version_id: nextItem.bomVersionId || null,
      plan_note: nextItem.planNote || null,
      owner_department_id: nextItem.ownerDepartmentId || null,
      schedule_section_def_id: nextItem.scheduleSectionDefId || null,
      schedule_section_name: String(nextItem.scheduleSectionName || "").trim() || null,
      line_staff_count: toNullableInteger(nextItem.lineStaffCount),
      line_machine_no: toNullableInteger(nextItem.lineMachineNo),
      line_dough_set_count: toNullableInteger(nextItem.lineDoughSetCount),
      shift_id: nextItem.shiftId || null,
      shift_code: String(nextItem.shiftCode || "").trim().toUpperCase() || null,
      shift_name: String(nextItem.shiftName || "").trim() || null,
      work_start_time: normalizeBoardTime(nextItem.workStartTime),
      work_end_time: normalizeBoardTime(nextItem.workEndTime),
      item_note: String(nextItem.itemNote || "").trim() || null,
    };
  }, [planKindHint, tPlusDaysDefault]);

  const persistSinglePlanningItem = useCallback(async (nextItem) => {
    if (!nextItem?.id || !nextItem?.skuCode || !nextItem?.date) {
      return { ok: false, error: "Incomplete planning item" };
    }
    const result = await fetchJson("/api/production-planning/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: [buildStatusRecordFromItem(nextItem)] }),
    });
    if (result.ok) {
      mutateStatus();
      return { ok: true };
    }
    return { ok: false, error: result.error?.message || "Unable to save planning item" };
  }, [buildStatusRecordFromItem, mutateStatus]);

  const deletePlanIds = useCallback(async (planIds, masterPlanNo = null) => {
    if (!planIds?.length) {
      return { ok: true };
    }
    try {
      const response = await fetch("/api/production-planning/status", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planIds, masterPlanNo }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          ok: false,
          error: payload?.error || "delete status failed",
          details: payload?.details || null,
        };
      }
      mutateStatus();
      return { ok: true, data: payload };
    } catch (error) {
      console.error("delete status failed", error);
      return { ok: false, error: error?.message || "delete status failed" };
    }
  }, [mutateStatus]);

  const handleCreatePlanningItem = useCallback(async (draft) => {
    const categoryId = String(draft?.categoryId || "").trim();
    const skuCode = String(draft?.skuCode || "").trim().toUpperCase();
    const product = planningProductBySku.get(skuCode);
    if (!categoryId || !product) {
      return { ok: false, error: "Category and product are required" };
    }

    const category = (planningCatalogData?.data?.categories ?? []).find((item) => String(item?.id) === categoryId);
    const plannedDate = normalizeDateInput(draft?.date || startDate) || startDate;
    const effectiveEndDate = normalizeDateInput(draft?.endDate || endDate) || plannedDate;
    const normalizedQty = Number(Number(draft?.quantity || 0).toFixed(6));
    if (!Number.isFinite(normalizedQty) || normalizedQty <= 0) {
      return { ok: false, error: "Quantity must be greater than zero" };
    }

    const productType = resolveItemTypeByCategory(product?.ICCAT_CODE);
    const productUnit = String(product?.UTQ_NAME || "").trim() || String(product?.UTQ_NAME_1 || "").trim() || "unit";
    const wipQtyInputMode = String(product?.wipQtyInputMode || "").trim().toLowerCase();
    const planningUnit = productType === BOM_ITEM_TYPES.FG || wipQtyInputMode === "unit"
      ? productUnit
      : "batch";
    const formulaOptions = normalizeFormulaOptions(product?.formula_options);
    const selectedFormula =
      formulaOptions.find((option) => normalizeFormulaCode(option?.formula_code) === normalizeFormulaCode(draft?.formulaCode))
      || formulaOptions[0];

    const newItem = {
      id: draft?.id || `${Date.now()}-${Math.random()}`,
      date: plannedDate,
      endDate: effectiveEndDate,
      categoryId,
      categoryName: category?.name || "",
      skuCode,
      skuName: product?.SKU_NAME || skuCode,
      brandName: String(product?.BRN_NAME || product?.brand_name || "").trim() || null,
      quantity: normalizedQty,
      unit: planningUnit,
      hasBom: Boolean(product?.hasBom),
      status: draft?.status || "not_ready",
      canEdit: true,
      confirmedAt: null,
      planGroupId: normalizePlanGroupId(draft?.planGroupId) || normalizePlanGroupId(currentPlanGroupId) || suggestedPlanGroupId,
      planKind: draft?.planKind || planKindHint,
      entryDate: plannedDate,
      tPlusDays: tPlusDaysDefault,
      dueDate: normalizeDateInput(draft?.dueDate) || (planKindHint === "sub" ? addDays(plannedDate, tPlusDaysDefault) : effectiveEndDate),
      planNote: String(draft?.planNote || "").trim() || null,
      formulaCode: normalizeFormulaCode(selectedFormula?.formula_code),
      formulaName: normalizeFormulaName(selectedFormula?.formula_name),
      bomVersionId: selectedFormula?.bom_version_id || null,
      ownerDepartmentId: draft?.ownerDepartmentId || null,
      ownerDepartmentCode: draft?.ownerDepartmentCode || null,
      ownerDepartmentName: draft?.ownerDepartmentName || null,
      scheduleSectionDefId: draft?.scheduleSectionDefId || null,
      scheduleSectionName: String(draft?.scheduleSectionName || "").trim() || null,
      lineStaffCount: toNullableInteger(draft?.lineStaffCount),
      lineMachineNo: toNullableInteger(draft?.lineMachineNo),
      lineDoughSetCount: toNullableInteger(draft?.lineDoughSetCount),
      shiftId: draft?.shiftId || null,
      shiftCode: String(draft?.shiftCode || "").trim().toUpperCase() || null,
      shiftName: String(draft?.shiftName || "").trim() || null,
      workStartTime: normalizeBoardTime(draft?.workStartTime),
      workEndTime: normalizeBoardTime(draft?.workEndTime),
      itemNote: String(draft?.itemNote || "").trim() || null,
    };

    setPlannedItems((prev) => [...prev, newItem].sort((a, b) => new Date(a.date) - new Date(b.date)));
    const persistResult = await persistSinglePlanningItem(newItem);
    if (!persistResult.ok) {
      setPlannedItems((prev) => prev.filter((item) => item.id !== newItem.id));
      return persistResult;
    }
    return { ok: true, item: newItem };
  }, [
    currentPlanGroupId,
    endDate,
    persistSinglePlanningItem,
    planKindHint,
    planningCatalogData,
    planningProductBySku,
    startDate,
    suggestedPlanGroupId,
    tPlusDaysDefault,
  ]);

  const handleUpdatePlanningItem = useCallback(async (itemId, patch = {}) => {
    let nextItem = null;
    setPlannedItems((prev) => prev.map((item) => {
      if (item.id !== itemId) return item;
      const merged = {
        ...item,
        ...patch,
        lineStaffCount: patch.lineStaffCount === undefined ? item.lineStaffCount : toNullableInteger(patch.lineStaffCount),
        lineMachineNo: patch.lineMachineNo === undefined ? item.lineMachineNo : toNullableInteger(patch.lineMachineNo),
        lineDoughSetCount: patch.lineDoughSetCount === undefined ? item.lineDoughSetCount : toNullableInteger(patch.lineDoughSetCount),
        shiftId: patch.shiftId === undefined ? item.shiftId : (patch.shiftId || null),
        shiftCode: patch.shiftCode === undefined ? item.shiftCode : (String(patch.shiftCode || "").trim().toUpperCase() || null),
        shiftName: patch.shiftName === undefined ? item.shiftName : (String(patch.shiftName || "").trim() || null),
        workStartTime: patch.workStartTime === undefined ? item.workStartTime : normalizeBoardTime(patch.workStartTime),
        workEndTime: patch.workEndTime === undefined ? item.workEndTime : normalizeBoardTime(patch.workEndTime),
        itemNote: patch.itemNote === undefined ? item.itemNote : (String(patch.itemNote || "").trim() || null),
        scheduleSectionDefId:
          patch.scheduleSectionDefId === undefined
            ? item.scheduleSectionDefId
            : (String(patch.scheduleSectionDefId || "").trim() || null),
        scheduleSectionName:
          patch.scheduleSectionName === undefined
            ? item.scheduleSectionName
            : (String(patch.scheduleSectionName || "").trim() || null),
      };
      if (patch.categoryId) {
        const category = (planningCatalogData?.data?.categories ?? []).find((row) => String(row?.id) === String(patch.categoryId));
        merged.categoryId = String(patch.categoryId);
        merged.categoryName = category?.name || item.categoryName;
      }
      if (patch.skuCode) {
        const skuCode = String(patch.skuCode).trim().toUpperCase();
        const product = planningProductBySku.get(skuCode);
        if (product) {
          const formulaOptions = normalizeFormulaOptions(product?.formula_options);
          const selectedFormula = formulaOptions[0];
          merged.skuCode = skuCode;
          merged.skuName = product?.SKU_NAME || skuCode;
          merged.brandName = String(product?.BRN_NAME || product?.brand_name || "").trim() || null;
          merged.unit = String(product?.UTQ_NAME || "").trim() || String(product?.UTQ_NAME_1 || "").trim() || item.unit;
          merged.hasBom = Boolean(product?.hasBom);
          merged.formulaCode = normalizeFormulaCode(selectedFormula?.formula_code);
          merged.formulaName = normalizeFormulaName(selectedFormula?.formula_name);
          merged.bomVersionId = selectedFormula?.bom_version_id || null;
        }
      }
      if (patch.formulaCode !== undefined) {
        const product = planningProductBySku.get(merged.skuCode);
        if (product) {
          const formulaOptions = normalizeFormulaOptions(product?.formula_options);
          const selectedFormula = formulaOptions.find(
            (option) => normalizeFormulaCode(option?.formula_code) === normalizeFormulaCode(patch.formulaCode)
          ) || formulaOptions[0];
          
          merged.formulaCode = normalizeFormulaCode(selectedFormula?.formula_code);
          merged.formulaName = normalizeFormulaName(selectedFormula?.formula_name);
          merged.bomVersionId = selectedFormula?.bom_version_id || null;
        }
      }
      if (patch.quantity !== undefined) {
        const quantity = Number(Number(patch.quantity || 0).toFixed(6));
        merged.quantity = Number.isFinite(quantity) ? quantity : item.quantity;
      }
      nextItem = merged;
      return merged;
    }));

    if (!nextItem) {
      return { ok: false, error: "Planning item not found" };
    }

    const persistResult = await persistSinglePlanningItem(nextItem);
    if (!persistResult.ok) {
      mutateStatus();
      return persistResult;
    }
    return { ok: true, item: nextItem };
  }, [mutateStatus, persistSinglePlanningItem, planningCatalogData, planningProductBySku]);

  // Handlers
  const handleBatchAdd = useCallback((items, options = {}) => {
    if (!items || items.length === 0) return;

    const currentCategory = (categoriesData?.data ?? []).find((c) => c.id.toString() === selectedType);
    const categoryName = currentCategory ? currentCategory.name : "All";
    const plannedStartDate = normalizeDateInput(options?.startDate) || startDate;
    const plannedEndDate = normalizeDateInput(options?.endDate) || endDate;
    const requestedPlanGroupId = normalizePlanGroupId(options?.planGroupId)
      || normalizePlanGroupId(currentPlanGroupId);
    const planningWindowStart = normalizeDateInput(startDate);
    const planningWindowEnd = normalizeDateInput(endDate) || planningWindowStart;
    const effectiveEndDate = planKindHint === "sub" ? maxDate(plannedEndDate, minEndDate) : plannedEndDate;
    const dueDate = planKindHint === "sub" ? addDays(plannedStartDate, tPlusDaysDefault) : effectiveEndDate;
    const planNote = String(options?.planNote || "").trim() || null;

    const recordsToPersist = [];

    setPlannedItems((prev) => {
      const newItems = [...prev];
      const existingDraftPlanGroupId = (() => {
        if (requestedPlanGroupId) return requestedPlanGroupId;
        const countByPlan = new Map();
        prev.forEach((item) => {
          const planNo = normalizePlanGroupId(item?.planGroupId);
          if (!planNo) return;
          if (String(item?.planKind || "main") !== planKindHint) return;
          if (item?.masterPublishedAt) return;
          if (planningWindowStart) {
            const itemStart = normalizeDateInput(item?.date);
            if (!itemStart) return;
            const itemEnd = normalizeDateInput(item?.endDate) || itemStart;
            const windowEnd = planningWindowEnd || planningWindowStart;
            if (windowEnd && (itemEnd < planningWindowStart || itemStart > windowEnd)) return;
          }
          countByPlan.set(planNo, Number(countByPlan.get(planNo) || 0) + 1);
        });
        if (countByPlan.size === 0) return null;
        return Array.from(countByPlan.entries())
          .sort((a, b) => Number(b[1]) - Number(a[1]) || String(a[0]).localeCompare(String(b[0])))[0]?.[0] || null;
      })();
      const effectivePlanGroupId = requestedPlanGroupId
        || existingDraftPlanGroupId
        || suggestedPlanGroupId
        || makePlanGroupId(plannedStartDate, plannedEndDate);

      items.forEach((inputItem) => {
        const {
          product,
          qty,
          formula_code,
          formula_name,
          bom_version_id,
          formulaCode: camelFormulaCode,
          formulaName: camelFormulaName,
          bomVersionId: camelBomVersionId,
          lineStaffCount,
          lineMachineNo,
          lineDoughSetCount,
          scheduleSectionDefId,
          scheduleSectionName,
          shiftId,
          shiftCode,
          shiftName,
          workStartTime,
          workEndTime,
          itemNote,
        } = inputItem || {};
        const targetSku = String(product?.SKU_CODE || "").toUpperCase();
        if (editableSkuSet && !editableSkuSet.has(targetSku)) {
          return;
        }
        const productType = resolveItemTypeByCategory(product?.ICCAT_CODE);
        const isFgProduct = productType === BOM_ITEM_TYPES.FG;
        const rawQty = Number(qty);
        const inputQty = Number.isFinite(rawQty) ? rawQty : 0;
        const normalizedQty = Number(inputQty.toFixed(6));
        const planningUnit = isFgProduct
          ? (String(product?.UTQ_NAME || "").trim() || String(product?.UTQ_NAME_1 || "").trim() || "unit")
          : "batch";
        if (!Number.isFinite(normalizedQty) || normalizedQty <= 0) {
          return;
        }
        const formulaCode = normalizeFormulaCode(formula_code ?? camelFormulaCode);
        const formulaName = normalizeFormulaName(formula_name ?? camelFormulaName);
        const bomVersionId = bom_version_id ?? camelBomVersionId ?? null;
        const normalizedStaffCount = toNullableInteger(lineStaffCount);
        const normalizedMachineNo = toNullableInteger(lineMachineNo);
        const normalizedDoughSetCount = toNullableInteger(lineDoughSetCount);
        const normalizedSectionDefId = String(scheduleSectionDefId || "").trim() || null;
        const normalizedSectionName = String(scheduleSectionName || "").trim() || null;
        const normalizedShiftId = shiftId || null;
        const normalizedShiftCode = String(shiftCode || "").trim().toUpperCase() || null;
        const normalizedShiftName = String(shiftName || "").trim() || null;
        const normalizedWorkStartTime = normalizeBoardTime(workStartTime);
        const normalizedWorkEndTime = normalizeBoardTime(workEndTime);
        const normalizedItemNote = String(itemNote || "").trim() || null;
        const existingIndex = newItems.findIndex((item) => {
          const itemGroupId = item.planGroupId || makePlanGroupId(item.date, item.endDate);
          const itemKind = item.planKind || "main";
          const itemDueDate = item.dueDate || item.endDate;
          return (
            item.skuCode === product.SKU_CODE &&
            item.date === plannedStartDate &&
            item.endDate === effectiveEndDate &&
            item.categoryId === selectedType &&
            itemGroupId === effectivePlanGroupId &&
            itemKind === planKindHint &&
            normalizeFormulaCode(item.formulaCode) === formulaCode &&
            String(item.bomVersionId || "") === String(bomVersionId || "") &&
            toNullableInteger(item.lineStaffCount) === normalizedStaffCount &&
            toNullableInteger(item.lineMachineNo) === normalizedMachineNo &&
            toNullableInteger(item.lineDoughSetCount) === normalizedDoughSetCount &&
            String(item.scheduleSectionDefId || "") === String(normalizedSectionDefId || "") &&
            String(item.shiftId || "") === String(normalizedShiftId || "") &&
            String(item.shiftCode || "").trim().toUpperCase() === String(normalizedShiftCode || "").trim().toUpperCase() &&
            normalizeBoardTime(item.workStartTime) === normalizedWorkStartTime &&
            normalizeBoardTime(item.workEndTime) === normalizedWorkEndTime &&
            itemDueDate === dueDate
          );
        });

        if (existingIndex >= 0) {
          const mergedPlanNote = planNote ?? (newItems[existingIndex].planNote || null);
          const merged = {
            ...newItems[existingIndex],
            quantity: newItems[existingIndex].quantity + normalizedQty,
            unit: planningUnit,
            planNote: mergedPlanNote,
            lineStaffCount: normalizedStaffCount ?? newItems[existingIndex].lineStaffCount,
            lineMachineNo: normalizedMachineNo ?? newItems[existingIndex].lineMachineNo,
            lineDoughSetCount: normalizedDoughSetCount ?? newItems[existingIndex].lineDoughSetCount,
            scheduleSectionDefId: normalizedSectionDefId ?? newItems[existingIndex].scheduleSectionDefId,
            scheduleSectionName: normalizedSectionName ?? newItems[existingIndex].scheduleSectionName,
            shiftId: normalizedShiftId ?? newItems[existingIndex].shiftId,
            shiftCode: normalizedShiftCode ?? newItems[existingIndex].shiftCode,
            shiftName: normalizedShiftName ?? newItems[existingIndex].shiftName,
            workStartTime: normalizedWorkStartTime ?? newItems[existingIndex].workStartTime,
            workEndTime: normalizedWorkEndTime ?? newItems[existingIndex].workEndTime,
            itemNote: normalizedItemNote ?? newItems[existingIndex].itemNote,
          };
          newItems[existingIndex] = merged;
          recordsToPersist.push({
            plan_id: merged.id,
            sku_code: merged.skuCode,
            sku_name: merged.skuName,
            category_id: merged.categoryId || null,
            category_name: merged.categoryName,
            status: "not_ready",
            planned_qty: merged.quantity,
            unit: merged.unit,
            period_start: merged.date,
            period_end: merged.endDate,
            confirmed_at: null,
            bom_snapshot: [],
            plan_group_id: merged.planGroupId || effectivePlanGroupId,
            plan_kind: merged.planKind || planKindHint,
            entry_date: merged.entryDate || startDate,
            t_plus_days: merged.tPlusDays || tPlusDaysDefault,
            due_date: merged.dueDate || dueDate,
            formula_code: normalizeFormulaCode(merged.formulaCode),
            formula_name: normalizeFormulaName(merged.formulaName),
            bom_version_id: merged.bomVersionId || null,
            plan_note: merged.planNote || null,
            schedule_section_def_id: merged.scheduleSectionDefId || null,
            schedule_section_name: String(merged.scheduleSectionName || "").trim() || null,
            line_staff_count: toNullableInteger(merged.lineStaffCount),
            line_machine_no: toNullableInteger(merged.lineMachineNo),
            line_dough_set_count: toNullableInteger(merged.lineDoughSetCount),
            shift_id: merged.shiftId || null,
            shift_code: String(merged.shiftCode || "").trim().toUpperCase() || null,
            shift_name: String(merged.shiftName || "").trim() || null,
            work_start_time: normalizeBoardTime(merged.workStartTime),
            work_end_time: normalizeBoardTime(merged.workEndTime),
            item_note: merged.itemNote || null,
          });
          return;
        }

        const newItem = {
          id: `${Date.now()}-${Math.random()}`,
          date: plannedStartDate,
          endDate: effectiveEndDate,
          categoryId: selectedType,
          categoryName: categoryName,
          skuCode: product.SKU_CODE,
          skuName: product.SKU_NAME,
          brandName: String(product?.BRN_NAME || product?.brand_name || "").trim() || null,
          quantity: normalizedQty,
          unit: planningUnit,
          hasBom: Boolean(product.hasBom),
          status: "not_ready",
          canEdit: true,
          confirmedAt: null,
          planGroupId: effectivePlanGroupId,
          planKind: planKindHint,
          entryDate: plannedStartDate,
          tPlusDays: tPlusDaysDefault,
          dueDate,
          planNote,
          scheduleSectionDefId: normalizedSectionDefId,
          scheduleSectionName: normalizedSectionName,
          lineStaffCount: normalizedStaffCount,
          lineMachineNo: normalizedMachineNo,
          lineDoughSetCount: normalizedDoughSetCount,
          shiftId: normalizedShiftId,
          shiftCode: normalizedShiftCode,
          shiftName: normalizedShiftName,
          workStartTime: normalizedWorkStartTime,
          workEndTime: normalizedWorkEndTime,
          itemNote: normalizedItemNote,
          formulaCode,
          formulaName,
          bomVersionId,
        };

        newItems.push(newItem);
        recordsToPersist.push({
          plan_id: newItem.id,
          sku_code: newItem.skuCode,
          sku_name: newItem.skuName,
          category_id: newItem.categoryId || null,
          category_name: newItem.categoryName,
          status: "not_ready",
          planned_qty: newItem.quantity,
          unit: newItem.unit,
          period_start: newItem.date,
          period_end: newItem.endDate,
          confirmed_at: null,
          bom_snapshot: [],
          plan_group_id: newItem.planGroupId,
          plan_kind: newItem.planKind,
          entry_date: newItem.entryDate,
          t_plus_days: newItem.tPlusDays,
          due_date: newItem.dueDate,
          formula_code: newItem.formulaCode,
          formula_name: newItem.formulaName,
          bom_version_id: newItem.bomVersionId,
          plan_note: newItem.planNote || null,
          schedule_section_def_id: newItem.scheduleSectionDefId || null,
          schedule_section_name: String(newItem.scheduleSectionName || "").trim() || null,
          line_staff_count: toNullableInteger(newItem.lineStaffCount),
          line_machine_no: toNullableInteger(newItem.lineMachineNo),
          line_dough_set_count: toNullableInteger(newItem.lineDoughSetCount),
          shift_id: newItem.shiftId || null,
          shift_code: String(newItem.shiftCode || "").trim().toUpperCase() || null,
          shift_name: String(newItem.shiftName || "").trim() || null,
          work_start_time: normalizeBoardTime(newItem.workStartTime),
          work_end_time: normalizeBoardTime(newItem.workEndTime),
          item_note: newItem.itemNote || null,
        });
      });

      return newItems.sort((a, b) => new Date(a.date) - new Date(b.date));
    });

    persistStatusRecords(recordsToPersist);
  }, [
    categoriesData,
    currentPlanGroupId,
    suggestedPlanGroupId,
    editableSkuSet,
    endDate,
    minEndDate,
    persistStatusRecords,
    planKindHint,
    selectedType,
    startDate,
    tPlusDaysDefault,
  ]);

  const handleRemoveItem = useCallback(async (id) => {
    const source = [...plannedItems, ...confirmedItems].find((item) => item.id === id);
    const masterPlanNo = source?.masterPlanNo || source?.planGroupId || currentPlanGroupId || null;
    if (!source) {
      return { ok: false, error: "Planning item not found" };
    }
    setPlannedItems((prev) => prev.filter((item) => item.id !== id));
    setConfirmedItems((prev) => prev.filter((item) => item.id !== id));
    const result = await deletePlanIds([id], masterPlanNo);
    if (!result?.ok) {
      if (isConfirmedPlanPolicyStatus(source.status)) {
        setConfirmedItems((prev) =>
          [...prev, source].sort(
            (a, b) => new Date(b.confirmedAt || b.date || 0) - new Date(a.confirmedAt || a.date || 0)
          )
        );
      } else {
        setPlannedItems((prev) =>
          [...prev, source].sort((a, b) => new Date(a.date) - new Date(b.date))
        );
      }
      if (typeof window !== "undefined") {
        window.alert(result?.error || "ไม่สามารถลบรายการแผนผลิตได้");
      }
      return result;
    }
    return result;
  }, [confirmedItems, currentPlanGroupId, deletePlanIds, plannedItems]);

  const formatCalculationErrorMessage = useCallback((result) => {
    const status = Number(result?.status || 0) || 0;
    const message = String(result?.error?.message || "Unknown error");
    const details = result?.data?.details || result?.error?.details || null;

    if (message === "Department scope violation") {
      const skuCodes = Array.isArray(details?.skuCodes) ? details.skuCodes.filter(Boolean) : [];
      if (skuCodes.length) {
        return `คำนวณไม่สำเร็จ: คุณไม่มีสิทธิ์ใน SKU ต่อไปนี้: ${skuCodes.join(", ")}`;
      }
      return "คำนวณไม่สำเร็จ: คุณไม่มีสิทธิ์แก้ไขรายการของแผนกนี้";
    }

    if (message === "Plan No mismatch in plannedItems") {
      const mismatchedIndexes = Array.isArray(details?.mismatchedIndexes)
        ? details.mismatchedIndexes.map((idx) => Number(idx) + 1).filter((idx) => Number.isFinite(idx))
        : [];
      const suffix = mismatchedIndexes.length
        ? ` (บรรทัด: ${mismatchedIndexes.join(", ")})`
        : "";
      return `คำนวณไม่สำเร็จ: พบรายการคนละ Plan No ในคำขอ${suffix}`;
    }

    if (message === "masterPlanNo is required") {
      return "คำนวณไม่สำเร็จ: ไม่พบ Plan No ของรายการที่เลือก";
    }

    if (message === "plannedItems is required") {
      return "คำนวณไม่สำเร็จ: ไม่พบรายการสำหรับคำนวณ";
    }

    const statusText = status > 0 ? `HTTP ${status}` : "Network";
    return `คำนวณไม่สำเร็จ (${statusText}): ${message}`;
  }, []);

  const handleCalculate = async (targetItems = null) => {
    const sourceItems = Array.isArray(targetItems) ? targetItems : plannedItems;
    const eligiblePlans = sourceItems.filter((item) => !isExpired(item) && item.canEdit !== false);
    const resolveItemPlanNo = (item) =>
      String(item?.masterPlanNo || item?.planGroupId || "").trim().toUpperCase();
    const distinctPlanNos = Array.from(
      new Set(eligiblePlans.map((item) => resolveItemPlanNo(item)).filter(Boolean))
    );
    const effectivePlanNo = String(currentPlanGroupId || distinctPlanNos[0] || "").trim().toUpperCase();
    const scopedPlans = effectivePlanNo
      ? eligiblePlans.filter((item) => resolveItemPlanNo(item) === effectivePlanNo)
      : eligiblePlans;
    if (scopedPlans.length === 0) return;
    const hasMissingBom = scopedPlans.some((item) => item.hasBom === false);
    if (hasMissingBom) {
      return; // Guard at action level; UI will disable button as well
    }

    setIsCalculating(true);
    try {
      // async-parallel: Use Promise.all() for independent operations
      setLastStockPayload(null);
      const result = await fetchCalculation(scopedPlans);

      if (result.ok) {
        setCalculationResult(result.data?.items ?? []);
        setCalculationPlanSummaries(Array.isArray(result.data?.planSummaries) ? result.data.planSummaries : []);
        setCalculationBreakdown({
          fgDemand: result.data?.fgDemand ?? [],
          wipDemand: result.data?.wipDemand ?? [],
          rawRequisition: result.data?.rawRequisition ?? [],
          planMaterials: result.data?.planMaterials ?? [],
          planSummaries: result.data?.planSummaries ?? [],
          warnings: result.data?.warnings ?? [],
        });
        setIsCalculationModalOpen(true);
      } else {
        alert(formatCalculationErrorMessage(result));
      }
    } catch (error) {
      console.error(error);
      alert(`คำนวณไม่สำเร็จ: ${error?.message || "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ"}`);
    } finally {
      setIsCalculating(false);
    }
  };

  const handleRecalculateWithSelection = async (selectedIds, quantityOverrides = new Map()) => {
    const resolveQuantity = (item) => {
      if (quantityOverrides.has(item.id)) {
        const raw = quantityOverrides.get(item.id);
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : 0;
      }
      return item.quantity;
    };
    const subset = plannedItems
      .filter((item) => !isExpired(item))
      .filter((item) => item.canEdit !== false)
      .filter((item) => selectedIds.has(item.id))
      .map((item) => {
        const resolvedQty = resolveQuantity(item);
        return { ...item, quantity: resolvedQty };
      });
    const resolveItemPlanNo = (item) =>
      String(item?.masterPlanNo || item?.planGroupId || "").trim().toUpperCase();
    const distinctPlanNos = Array.from(new Set(subset.map((item) => resolveItemPlanNo(item)).filter(Boolean)));
    const effectivePlanNo = String(currentPlanGroupId || distinctPlanNos[0] || "").trim().toUpperCase();
    const scopedSubset = effectivePlanNo
      ? subset.filter((item) => resolveItemPlanNo(item) === effectivePlanNo)
      : subset;
    if (scopedSubset.length === 0) return { ok: false, data: [], error: { message: "กรุณาเลือกรายการอย่างน้อย 1 รายการ" } };
    setIsRecalculating(true);
    try {
      const payload = lastStockPayload ?? {};
      const result = await fetchCalculation(scopedSubset, payload);
      if (result.ok) {
        setCalculationResult(result.data?.items ?? []);
        setCalculationPlanSummaries(Array.isArray(result.data?.planSummaries) ? result.data.planSummaries : []);
        setCalculationBreakdown({
          fgDemand: result.data?.fgDemand ?? [],
          wipDemand: result.data?.wipDemand ?? [],
          rawRequisition: result.data?.rawRequisition ?? [],
          planMaterials: result.data?.planMaterials ?? [],
          planSummaries: result.data?.planSummaries ?? [],
          warnings: result.data?.warnings ?? [],
        });
      }
      return result;
    } catch (error) {
      return { ok: false, data: [], error: { message: error?.message || "Recalculate failed" } };
    } finally {
      setIsRecalculating(false);
    }
  };

  const handleApplySelection = (selectedIds, qtyOverrides = new Map(), bomSnapshotInput = []) => {
    if (!selectedIds || selectedIds.size === 0) return;
    const resolveQuantity = (item) => {
      if (qtyOverrides.has(item.id)) {
        const raw = qtyOverrides.get(item.id);
        const parsed = Number(raw);
        return Number.isFinite(parsed) ? parsed : 0;
      }
      return item.quantity;
    };

    const snapshotRows = Array.isArray(bomSnapshotInput)
      ? bomSnapshotInput
      : Array.isArray(bomSnapshotInput?.materials)
        ? bomSnapshotInput.materials
        : [];
    const planMaterialRows = Array.isArray(bomSnapshotInput?.planMaterials)
      ? bomSnapshotInput.planMaterials
      : [];
    const policyRows = Array.isArray(bomSnapshotInput?.planSummaries)
      ? bomSnapshotInput.planSummaries
      : calculationPlanSummaries;
    const policyByPlanId = new Map(
      (policyRows ?? [])
        .filter((row) => row?.planId)
        .map((row) => [String(row.planId), row])
    );
    const snapshotByFormulaKey = new Map();
    const snapshotBySku = new Map();
    const toSnapshotKey = (item) => {
      const skuCode = String(item?.skuCode || "").trim().toUpperCase();
      const formulaCode = normalizeFormulaCode(item?.formulaCode);
      const bomVersionId = String(item?.bomVersionId || "").trim();
      return `${skuCode}::${formulaCode}::${bomVersionId}`;
    };
    (snapshotRows ?? []).forEach((row) => {
      const key = toSnapshotKey(row);
      if (key) {
        snapshotByFormulaKey.set(key, row);
      }
      const skuCode = String(row?.skuCode || "").trim().toUpperCase();
      if (skuCode && !snapshotBySku.has(skuCode)) {
        snapshotBySku.set(skuCode, row);
      }
    });
    const snapshotByPlanId = new Map(
      planMaterialRows
        .filter((row) => row?.planId)
        .map((row) => [String(row.planId), row])
    );

    setStatusSaving(true);
    const readyItems = plannedItems.filter((item) => selectedIds.has(item.id) && !isExpired(item) && item.canEdit !== false);
    const pendingItems = plannedItems.filter((item) => !selectedIds.has(item.id) && !isExpired(item) && item.canEdit !== false);
    const nowIso = new Date().toISOString();

    const normalizeMaterialSnapshotRow = (row) => {
      const requiredQty = Number(row?.requiredQty ?? row?.qty ?? row?.quantity ?? 0) || 0;
      return ({
        skuCode: row?.skuCode || row?.sku || row?.materialSkuCode || "",
        goodsCode:
          row?.goodsCode ||
          row?.materialGoodsCode ||
          row?.skuCode ||
          row?.sku ||
          row?.materialSkuCode ||
          "",
        materialGoodsCode:
          row?.materialGoodsCode ||
          row?.goodsCode ||
          row?.skuCode ||
          row?.sku ||
          row?.materialSkuCode ||
          "",
        name: row?.skuName || row?.name || row?.materialName || "",
        unit: row?.requiredUnit || row?.unit || row?.uom || "",
        requiredQty,
        issueQty: Number(row?.issueQty ?? row?.issuedQty ?? row?.issue_qty ?? Math.ceil(requiredQty)) || 0,
        stockQty: Number(row?.stockQty ?? 0) || 0,
        leadTime: row?.leadTime ?? "-",
        status: row?.status || "Sufficient",
        diff: Number(row?.diff ?? 0) || 0,
        override: row?.override || null,
      });
    };

    const sharedMaterialSnapshot = snapshotRows.map(normalizeMaterialSnapshotRow);

    const resolveItemSnapshot = (item) => {
      const planSnapshot = snapshotByPlanId.get(String(item.id));
      const planMaterials = Array.isArray(planSnapshot?.materials) ? planSnapshot.materials : [];
      if (planMaterials.length > 0) {
        return {
          materials: planMaterials.map(normalizeMaterialSnapshotRow),
          source: "plan",
          productLevelSnapshot: planSnapshot,
        };
      }

      const productLevelSnapshot = snapshotByFormulaKey.get(toSnapshotKey(item))
        ? snapshotByFormulaKey.get(toSnapshotKey(item))
        : (snapshotBySku.get(String(item.skuCode || "").trim().toUpperCase()) || null);
      const productMaterials = Array.isArray(productLevelSnapshot?.materials)
        ? productLevelSnapshot.materials
        : Array.isArray(productLevelSnapshot?.items)
          ? productLevelSnapshot.items
          : [];
      if (productMaterials.length > 0) {
        return {
          materials: productMaterials.map(normalizeMaterialSnapshotRow),
          source: "product",
          productLevelSnapshot,
        };
      }

      return {
        materials: sharedMaterialSnapshot,
        source: "shared",
        productLevelSnapshot,
      };
    };

    const readyPayload = readyItems.map((item) => {
      const policy = policyByPlanId.get(String(item.id)) || null;
      const itemSnapshot = resolveItemSnapshot(item);
      const normalizedStatus = normalizePlanPolicyStatus(
        policy?.policyStatus,
        PLAN_POLICY_STATUSES.READY
      );
      const plannedQty = resolveQuantity(item);
      const feasibleBatch = Number(policy?.feasibleBatch);
      const shortBatch = Number(policy?.shortBatch);
      const backorderBatch = Number(policy?.backorderBatch);
      return ({
      plan_id: item.id,
      sku_code: item.skuCode,
      sku_name: item.skuName,
      category_id: item.categoryId || null,
      category_name: item.categoryName,
      status: normalizedStatus,
      planned_qty: plannedQty,
      feasible_batch: Number.isFinite(feasibleBatch) ? feasibleBatch : plannedQty,
      short_batch: Number.isFinite(shortBatch) ? shortBatch : 0,
      backorder_batch: Number.isFinite(backorderBatch) ? backorderBatch : 0,
      earliest_material_eta: policy?.earliestMaterialEta || null,
      exception_reason: policy?.exceptionReason || null,
      unit: item.unit,
      period_start: item.date,
      period_end: item.endDate,
      confirmed_at: nowIso,
      bom_snapshot: [{
        skuCode: item.skuCode,
        skuName: item.skuName,
        formulaCode: normalizeFormulaCode(item.formulaCode),
        formulaName: normalizeFormulaName(item.formulaName),
        bomVersionId: item.bomVersionId || null,
        plannedQty,
        policyStatus: normalizedStatus,
        feasibleBatch: Number.isFinite(feasibleBatch) ? feasibleBatch : plannedQty,
        shortBatch: Number.isFinite(shortBatch) ? shortBatch : 0,
        backorderBatch: Number.isFinite(backorderBatch) ? backorderBatch : 0,
        earliestMaterialEta: policy?.earliestMaterialEta || null,
        exceptionReason: policy?.exceptionReason || null,
        generatedAt: nowIso,
        source: "planning_modal",
        selectedPlanCount: readyItems.length,
        materials: itemSnapshot.materials,
        materialSnapshotSource: itemSnapshot.source,
        productLevelSnapshot: itemSnapshot.productLevelSnapshot,
        planningMaterialSnapshot: sharedMaterialSnapshot,
      }],
      plan_group_id: item.planGroupId,
      plan_kind: item.planKind,
      parent_plan_id: item.parentPlanId ?? null,
      entry_date: item.entryDate,
      t_plus_days: item.tPlusDays,
      due_date: item.dueDate,
      formula_code: normalizeFormulaCode(item.formulaCode),
      formula_name: normalizeFormulaName(item.formulaName),
      bom_version_id: item.bomVersionId || null,
      line_staff_count: toNullableInteger(item.lineStaffCount),
      line_machine_no: toNullableInteger(item.lineMachineNo),
      line_dough_set_count: toNullableInteger(item.lineDoughSetCount),
      shift_id: item.shiftId || null,
      shift_code: String(item.shiftCode || "").trim().toUpperCase() || null,
      shift_name: String(item.shiftName || "").trim() || null,
      work_start_time: normalizeBoardTime(item.workStartTime),
      work_end_time: normalizeBoardTime(item.workEndTime),
      item_note: item.itemNote || null,
    });
    });

    const pendingPayload = pendingItems.map((item) => ({
      plan_id: item.id,
      sku_code: item.skuCode,
      sku_name: item.skuName,
      category_id: item.categoryId || null,
      category_name: item.categoryName,
      status: "not_ready",
      planned_qty: resolveQuantity(item),
      feasible_batch: null,
      short_batch: null,
      backorder_batch: null,
      earliest_material_eta: null,
      exception_reason: null,
      unit: item.unit,
      period_start: item.date,
      period_end: item.endDate,
      confirmed_at: null,
      bom_snapshot: [],
      plan_group_id: item.planGroupId,
      plan_kind: item.planKind,
      parent_plan_id: item.parentPlanId ?? null,
      entry_date: item.entryDate,
      t_plus_days: item.tPlusDays,
      due_date: item.dueDate,
      formula_code: normalizeFormulaCode(item.formulaCode),
      formula_name: normalizeFormulaName(item.formulaName),
      bom_version_id: item.bomVersionId || null,
      line_staff_count: toNullableInteger(item.lineStaffCount),
      line_machine_no: toNullableInteger(item.lineMachineNo),
      line_dough_set_count: toNullableInteger(item.lineDoughSetCount),
      shift_id: item.shiftId || null,
      shift_code: String(item.shiftCode || "").trim().toUpperCase() || null,
      shift_name: String(item.shiftName || "").trim() || null,
      work_start_time: normalizeBoardTime(item.workStartTime),
      work_end_time: normalizeBoardTime(item.workEndTime),
      item_note: item.itemNote || null,
    }));

    const payload = [...readyPayload, ...pendingPayload];

    fetch("/api/production-planning/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ records: payload }),
    })
      .then(() => mutateStatus())
      .catch((err) => console.error("persist status failed", err))
      .finally(() => setStatusSaving(false));

    setPlannedItems((prev) => {
      const remaining = [];
      const moved = [];
      prev.forEach((item) => {
        if (selectedIds.has(item.id)) {
          moved.push({
            ...item,
            quantity: resolveQuantity(item),
            status: item.status ?? "ready",
          });
        } else {
          remaining.push(item);
        }
      });
      if (moved.length) {
        setConfirmedItems((old) => {
          const map = new Map();
          old.forEach((item) => {
            if (!item?.id) return;
            map.set(item.id, item);
          });
          moved.forEach((item) => {
            const policy = policyByPlanId.get(String(item.id)) || null;
            const normalizedStatus = normalizePlanPolicyStatus(
              policy?.policyStatus,
              PLAN_POLICY_STATUSES.READY
            );
            const nextItem = {
              ...item,
              status: normalizedStatus,
              feasibleBatch: Number.isFinite(Number(policy?.feasibleBatch)) ? Number(policy.feasibleBatch) : item.quantity,
              shortBatch: Number.isFinite(Number(policy?.shortBatch)) ? Number(policy.shortBatch) : 0,
              backorderBatch: Number.isFinite(Number(policy?.backorderBatch)) ? Number(policy.backorderBatch) : 0,
              earliestMaterialEta: policy?.earliestMaterialEta || null,
              exceptionReason: policy?.exceptionReason || null,
              confirmedAt: nowIso,
            };
            map.set(nextItem.id, nextItem);
          });
          return Array.from(map.values()).sort(
            (a, b) => new Date(b.confirmedAt || b.date || 0) - new Date(a.confirmedAt || a.date || 0)
          );
        });
      }
      return remaining;
    });
  };

  const handleUpdateConfirmedQuantity = useCallback(async (planId, plannedQty, materialOverrides = [], masterPlanNo = null) => {
    if (!planId) {
      return { ok: false, error: "Missing plan id" };
    }
    try {
      const response = await fetch("/api/production-planning/status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          plannedQty,
          materialOverrides,
          masterPlanNo,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          ok: false,
          error: payload?.error || "Unable to update quantity",
          details: payload?.details || null,
        };
      }
      mutateStatus();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error?.message || "Unable to update quantity" };
    }
  }, [mutateStatus]);

  const publishMasterPlan = useCallback(async (planGroupId, options = {}) => {
    const normalizedPlanGroupId = String(planGroupId || "").trim();
    if (!normalizedPlanGroupId) {
      return { ok: false, error: "Missing Plan No" };
    }
    const hasNoteField = Object.prototype.hasOwnProperty.call(options || {}, "note");
    const noteValue = hasNoteField
      ? String(options?.note || "").slice(0, 500)
      : undefined;
    setIsPublishingMasterPlan(true);
    try {
      const payloadBody = {
        planGroupId: normalizedPlanGroupId,
      };
      if (hasNoteField) {
        payloadBody.note = noteValue;
      }
      const response = await fetch("/api/production-planning/master-publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadBody),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        return {
          ok: false,
          error: payload?.error || "Unable to publish master plan",
          details: payload?.details || null,
        };
      }
      mutateStatus();
      return { ok: true, data: payload?.data || null };
    } catch (error) {
      return { ok: false, error: error?.message || "Unable to publish master plan" };
    } finally {
      setIsPublishingMasterPlan(false);
    }
  }, [mutateStatus]);

  useEffect(() => {
    if (!statusData?.data) return;

    const mapped = (statusData.data ?? []).map((row) => {
      const id =
        row.plan_id ||
        row.id ||
        `${row.sku_code || "SKU"}-${row.period_start || ""}-${row.period_end || ""}`;
      const status = row.status ?? (row.confirmed_at ? "ready" : "not_ready");
      const planGroupId =
        normalizePlanGroupId(row.plan_group_id) ||
        makePlanGroupId(row.period_start, row.period_end || row.period_start);
      const planKind =
        row.plan_kind ??
        inferredPlanKindById.get(id) ??
        (row.parent_plan_id ? "sub" : "main");
      const snapshot = Array.isArray(row.bom_snapshot) ? row.bom_snapshot[0] : null;
      const skuCode = String(row.sku_code || "").trim().toUpperCase();
      const skuMeta = planningSkuMetaBySku.get(skuCode) || null;
      const rawUnit = String(row.unit || "").trim();
      const isLegacyFgBatch = Boolean(skuMeta?.isFgProduct) && rawUnit.toLowerCase() === "batch";
      const convertLegacyFgQty = (value) => {
        const qty = Number(value);
        if (!Number.isFinite(qty)) return value ?? null;
        if (!isLegacyFgBatch) return qty;
        return Number((qty * Number(skuMeta?.qtyPerBatch || 1)).toFixed(6));
      };
      const mappedUnit = skuMeta?.isFgProduct
        ? (skuMeta.displayUnit || rawUnit || "unit")
        : (rawUnit || "batch");
      return {
        id,
        skuCode: row.sku_code,
        skuName: row.sku_name,
        brandName: row.brand_name ?? snapshot?.brandName ?? skuMeta?.brandName ?? null,
        quantity: convertLegacyFgQty(row.planned_qty ?? row.quantity ?? 0),
        feasibleBatch: convertLegacyFgQty(row.feasible_batch ?? null),
        shortBatch: convertLegacyFgQty(row.short_batch ?? null),
        backorderBatch: convertLegacyFgQty(row.backorder_batch ?? null),
        earliestMaterialEta: row.earliest_material_eta ?? null,
        exceptionReason: row.exception_reason ?? null,
        unit: mappedUnit,
        date: row.period_start,
        endDate: row.period_end ?? row.period_start,
        categoryId: row.category_id ?? null,
        categoryName: row.category_name ?? "",
        status,
        confirmedAt: row.confirmed_at,
        confirmedBy: row.confirmed_by ?? null,
        bomSnapshot: row.bom_snapshot ?? [],
        planGroupId,
        planKind,
        parentPlanId: row.parent_plan_id ?? null,
        entryDate: row.entry_date ?? row.period_start ?? null,
        tPlusDays: row.t_plus_days ?? null,
        dueDate: row.due_date ?? row.period_end ?? row.period_start ?? null,
        formulaCode: normalizeFormulaCode(row.formula_code ?? snapshot?.formulaCode),
        formulaName: normalizeFormulaName(row.formula_name ?? snapshot?.formulaName),
        bomVersionId: row.bom_version_id ?? snapshot?.bomVersionId ?? null,
        materialAdjustment: row.material_adjustment ?? null,
        materialAdjustmentCount: Number(row.material_adjustment_count ?? 0) || 0,
        canEdit: row.can_edit !== false,
        masterPublishedAt: row.master_published_at ?? null,
        masterPublishedBy: row.master_published_by ?? null,
        masterPlanNo: row.master_plan_no ?? row.plan_group_id ?? null,
        subPlanNo: row.sub_plan_no ?? null,
        ownerDepartmentId: row.owner_department_id ?? null,
        ownerDepartmentCode: row.owner_department_code ?? null,
        ownerDepartmentName: row.owner_department_name ?? null,
        scheduleSectionDefId: row.schedule_section_def_id ?? null,
        scheduleSectionName: row.schedule_section_name ?? null,
        planNote: row.plan_note ?? null,
        masterPlanNote: row.master_plan_note ?? null,
        lineStaffCount: toNullableInteger(row.line_staff_count),
        lineMachineNo: toNullableInteger(row.line_machine_no),
        lineDoughSetCount: toNullableInteger(row.line_dough_set_count),
        shiftId: row.shift_id ?? null,
        shiftCode: String(row.shift_code || "").trim().toUpperCase() || null,
        shiftName: String(row.shift_name || "").trim() || null,
        workStartTime: normalizeBoardTime(row.work_start_time),
        workEndTime: normalizeBoardTime(row.work_end_time),
        itemNote: row.item_note ?? null,
      };
    });

    const confirmedFromServer = mapped.filter((item) =>
      isConfirmedPlanPolicyStatus(item.status)
    );
    const pendingFromServer = mapped.filter((item) =>
      !isConfirmedPlanPolicyStatus(item.status)
    );

    setConfirmedItems(
      [...confirmedFromServer].sort(
        (a, b) => new Date(b.confirmedAt || b.date || 0) - new Date(a.confirmedAt || a.date || 0)
      )
    );

    const confirmedIdSet = new Set(confirmedFromServer.map((item) => item.id));
    setPlannedItems(
      pendingFromServer
        .filter((item) => item?.id && !confirmedIdSet.has(item.id))
        .sort((a, b) => new Date(a.date) - new Date(b.date))
    );
  }, [inferredPlanKindById, planningSkuMetaBySku, statusData]);

  // Guard: endDate must not be in the past (relative to today) and should not precede startDate.
  useEffect(() => {
    if (endDate < todayStr) {
      setEndDate(todayStr);
      return;
    }
    const minimum = maxDate(startDate, minEndDate);
    if (minimum && endDate < minimum) {
      setEndDate(minimum);
    }
  }, [endDate, minEndDate, startDate, todayStr]);

  return {
    // State
    startDate, setStartDate,
    endDate, setEndDate,
    selectedType, setSelectedType,
    isDrawerOpen, setIsDrawerOpen,
    isCalculationModalOpen, setIsCalculationModalOpen,
    calculationResult,
    calculationPlanSummaries,
    calculationBreakdown,
    plannedItems,
    confirmedItems,
    statusLoading: statusSaving || loadingStatus,
    isRecalculating,
    isPublishingMasterPlan,
    planKindHint,
    minEndDate,
    tPlusDaysDefault,
    currentPlanGroupId,
    setCurrentPlanGroupId: setManualPlanGroupId,
    canManageGlobal,
    planningScopeMeta,
    statusRows,

    // Data
    productionCategories: categoriesData?.data ?? [],
    planningCategoryProductOptions,
    planningProducts,
    products,
    loading: loadingCategories || loadingBaseProducts || loadingCategoryProducts || loadingBomStatus || loadingPlanningCatalog || loadingMasterPlanWip,
    isCalculating,
    productionShifts,
    sectionShiftGroups,

    // Actions
    handleBatchAdd,
    handleCreatePlanningItem,
    handleUpdatePlanningItem,
    handleRemoveItem,
    handleCalculate,
    handleRecalculateWithSelection,
    handleApplySelection,
    handleUpdateConfirmedQuantity,
    publishMasterPlan,
    refreshStatus: mutateStatus,
    isExpired,
  };
}













