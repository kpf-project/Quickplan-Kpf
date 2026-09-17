"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import {
  Check,
  CheckCircle,
  ChevronRight,
  ChevronDown,
  Copy,
  FileSpreadsheet,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Trash2,
  User,
  X,
  AlertTriangle,
  ListFilter,
  Printer, // Added icon
} from "lucide-react";

import PermissionGate from "@/components/PermissionGate";
import { usePermissions } from "@/lib/usePermissions";
import { usePersistentRouteState } from "@/lib/usePersistentRouteState";
import MaterialSelectionDrawer from "./MaterialSelectionDrawer";
import MultiProductImportPreviewModal from "./MultiProductImportPreviewModal";
import {
  BOM_ITEM_TYPES,
  BOM_PARENT_CATEGORY_OPTIONS,
  RAW_CATEGORY_OPTIONS,
  WIP_CATEGORY_OPTIONS,
  getAllowedComponentTypesForParent,
  resolveItemTypeByCategory,
  validateBomMatrix,
} from "@/lib/bomMatrix";
import {
  getPlanningOffsetLabel,
  getPlanningOffsetOptions,
  getRawPlanningDateLabel,
  normalizePlanningOffsetDays,
} from "@/lib/bomPlanning";
import {
  createMultiProductTemplate,
  exportSingleProductWorkbook,
  parseMultiProductWorkbook,
} from "../utils/bomExcel";
import { loadBomTemplateExampleRows } from "../utils/bomTemplateExamples";
import { applyBomBulkEdit, removeSelectedBomRows } from "../utils/bomBulkActions";

const MATERIAL_CATEGORY_OPTIONS = [...WIP_CATEGORY_OPTIONS, ...RAW_CATEGORY_OPTIONS];

const NUMBER_FORMAT = new Intl.NumberFormat("th-TH", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
});

const DATE_FORMAT = new Intl.DateTimeFormat("th-TH", {
  dateStyle: "medium",
  timeStyle: "short",
});

const TAB_OPTIONS = [
  { id: "editor", label: "สูตรการผลิต" },
  { id: "history", label: "เวอร์ชัน & Diff" },
];

const STATUS_OPTIONS = [
  { id: "draft", label: "ร่าง" },
  { id: "pending_review", label: "รออนุมัติ" },
  { id: "approved", label: "อนุมัติแล้ว" },
  { id: "rejected", label: "ไม่อนุมัติ" },
];

const STATUS_BADGE_STYLES = {
  draft: "border-amber-200 bg-amber-50 text-amber-700",
  pending_review: "border-sky-200 bg-sky-50 text-sky-700",
  approved: "border-emerald-200 bg-emerald-50 text-emerald-700",
  rejected: "border-rose-200 bg-rose-50 text-rose-700",
};
const STATUS_SUMMARY_STYLES = {
  draft: "border-[#334155]/70 bg-[#1f2937] text-white",
  pending_review: "border-[#d4af37]/70 bg-[#6b4f13] text-white",
  approved: "border-[#22c55e]/60 bg-[#14532d] text-white",
  rejected: "border-[#f87171]/50 bg-[#5f1b1b] text-white",
};
const PRODUCT_STATUS_LABELS = {
  draft: "ร่าง",
  pending_review: "รอตรวจ",
  approved: "อนุมัติแล้ว",
  rejected: "ไม่อนุมัติ",
};

const DEFAULT_FORMULA_CODE = "DEFAULT";
const DEFAULT_FORMULA_NAME = "สูตรหลัก";
const WIP_QTY_INPUT_MODES = {
  UNIT: "unit",
  BATCH: "batch",
};
const WIP_BATCH_DISPLAY_UNIT = "ชุด";
const PLANNING_OFFSET_OPTIONS = getPlanningOffsetOptions();
const DEFAULT_BOM_UI_STATE = Object.freeze({
  selectedProductCode: "",
  isMaterialPickerOpen: false,
  activeTab: "editor",
  status: "draft",
  note: "",
  baseBatch: 1,
  baseOutputBoxes: 1,
  selectedFormulaCode: DEFAULT_FORMULA_CODE,
  wipQtyInputMode: WIP_QTY_INPUT_MODES.UNIT,
});
const DEFAULT_BOM_FILTER_STATE = Object.freeze({
  searchTerm: "",
  categoryFilter: "all",
  lineFilter: "all",
  statusFilter: "all",
});

function normalizeFormulaCode(value) {
  if (!value) return DEFAULT_FORMULA_CODE;
  return String(value).trim().toUpperCase() || DEFAULT_FORMULA_CODE;
}

function normalizeFormulaName(value) {
  if (!value) return DEFAULT_FORMULA_NAME;
  return String(value).trim() || DEFAULT_FORMULA_NAME;
}

function createFormulaDraftKey(productCode, formulaCode) {
  if (!productCode) return "";
  return `${String(productCode).trim().toUpperCase()}::${normalizeFormulaCode(formulaCode)}`;
}

function buildNextFormulaCode(formulas) {
  const usedCodes = new Set((formulas || []).map((formula) => normalizeFormulaCode(formula?.formula_code)));
  let counter = 2;
  while (usedCodes.has(`F${counter}`)) {
    counter += 1;
  }
  return `F${counter}`;
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return DATE_FORMAT.format(date);
}

function createRowId() {
  return `bom-${Math.random().toString(36).slice(2, 9)}`;
}

function truncateText(value, maxLength = 80) {
  if (!value) return "";
  const text = String(value);
  if (text.length <= maxLength) return text;
  if (maxLength <= 3) return text.slice(0, maxLength);
  return `${text.slice(0, maxLength - 3)}...`;
}

function normalizePositiveNumber(value, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function resolveWipConversionMeta(rawFormulaOptions = []) {
  const formulaOptions = Array.isArray(rawFormulaOptions) ? rawFormulaOptions : [];
  const withValidBase = formulaOptions
    .map((option) => {
      const baseBatch = normalizePositiveNumber(option?.base_batch, 0);
      const baseOutputBoxes = normalizePositiveNumber(option?.base_output_boxes, 0);
      if (!baseBatch || !baseOutputBoxes) return null;
      return {
        formulaCode: normalizeFormulaCode(option?.formula_code),
        formulaName: normalizeFormulaName(option?.formula_name),
        wipQtyInputMode:
          String(option?.wip_qty_input_mode || "").trim().toLowerCase() === WIP_QTY_INPUT_MODES.BATCH
            ? WIP_QTY_INPUT_MODES.BATCH
            : WIP_QTY_INPUT_MODES.UNIT,
        baseBatch,
        baseOutputBoxes,
        unitsPerBatch: baseOutputBoxes / baseBatch,
      };
    })
    .filter(Boolean);
  const preferred =
    withValidBase.find((option) => option.formulaCode === DEFAULT_FORMULA_CODE) ||
    withValidBase[0] ||
    null;
  if (!preferred) {
    return {
      formulaCode: null,
      formulaName: null,
      wipQtyInputMode: WIP_QTY_INPUT_MODES.UNIT,
      baseBatch: null,
      baseOutputBoxes: null,
      unitsPerBatch: 0,
    };
  }
  return preferred;
}

function resolveMaterialInputUnit(material) {
  if (!material) return "";
  if (
    material.itemType === BOM_ITEM_TYPES.WIP &&
    material.wipQtyInputMode === WIP_QTY_INPUT_MODES.BATCH
  ) {
    return WIP_BATCH_DISPLAY_UNIT;
  }
  return material.unit || material.uom || "";
}

function resolveBomRowInputUnit(row, material) {
  const rowUnit = String(row?.unit || row?.uom || "").trim();
  if (rowUnit) return rowUnit;
  const materialUnit = resolveMaterialInputUnit(material);
  if (materialUnit) return materialUnit;
  return "";
}

function resolveWipScaleBase(material) {
  if (!material || material.itemType !== BOM_ITEM_TYPES.WIP) return 1;
  const isBatchMode = material.wipQtyInputMode === WIP_QTY_INPUT_MODES.BATCH;
  const base = isBatchMode ? material.wipBaseBatch : material.wipBaseOutputBoxes;
  return normalizePositiveNumber(base, 1);
}

function getBomMaterialVariantKey(row) {
  const skuCode = String(row?.materialCode || "").trim().toUpperCase();
  const goodsCode = String(row?.materialGoodsCode || row?.materialCode || "").trim().toUpperCase();
  return `${skuCode}::${goodsCode}`;
}

export default function BomEditorPageClient() {
  const permissionState = usePermissions();
  const canManage = permissionState.loaded
    ? permissionState.isAdmin ||
    permissionState.permissions.includes("production-line-bom-manage")
    : false;
  const isReadOnly = !canManage;

  // Vercel Best Practice: rerender-defer-reads - Combine related states
  const [dataState, setDataState] = useState({
    products: [],
    materials: [],
    lineOptions: [],
    categoryOptions: [], // New state for dynamic categories
    versionsByProduct: {},
    formulasByProduct: {},
    rowsByProduct: {},
    bomStatusByProduct: {}
  });

  const [uiState, setUiState] = usePersistentRouteState("bom.ui", DEFAULT_BOM_UI_STATE);

  const [filterState, setFilterState] = usePersistentRouteState("bom.filters", DEFAULT_BOM_FILTER_STATE);

  const [selectionState, setSelectionState] = useState(() => ({
    selectedRows: new Set()
  }));

  // Vercel Best Practice: rerender-functional-setstate - Use functional setState
  const updateDataState = useCallback((updater) => {
    setDataState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      return { ...prev, ...next };
    });
  }, []);

  const updateUiState = useCallback((updater) => {
    setUiState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      return { ...prev, ...next };
    });
  }, [setUiState]);

  const updateFilterState = useCallback((updater) => {
    setFilterState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      return { ...prev, ...next };
    });
  }, [setFilterState]);

  const updateSelectionState = useCallback((updater) => {
    setSelectionState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      return { ...prev, ...next };
    });
  }, []);

  // Vercel Best Practice: rerender-defer-reads - Combine remaining states
  const [loadingState, setLoadingState] = useState({
    isLoadingProducts: false,
    isLoadingMaterials: false,
    isLoadingBom: false,
    isVersionActionLoading: false
  });

  const [editorState, setEditorState] = useState({
    bulkAddSummary: "",
    density: "compact",
    isDirty: false,
    editingRowId: "",
    baseBoxesEditing: false,
    mobileStep: 1,
    recentMaterials: []
  });

  // Vercel Best Practice: rerender-functional-setstate - Use functional setState
  const updateLoadingState = useCallback((updater) => {
    setLoadingState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      return { ...prev, ...next };
    });
  }, []);

  const updateEditorState = useCallback((updater) => {
    setEditorState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      return { ...prev, ...next };
    });
  }, []);

  // Vercel Best Practice: rerender-defer-reads - Combine notification and error states
  const [notificationState, setNotificationState] = useState({
    isNotifyLoading: false,
    notifyMessage: "",
    notifyDetail: "",
    notifyTone: "neutral",
    notifyAction: "",
    activeDiffTab: "updated",
    productsError: "",
    materialsError: ""
  });

  const updateNotificationState = useCallback((updater) => {
    setNotificationState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      return { ...prev, ...next };
    });
  }, []);

  const {
    selectedProductCode,
    status,
    note,
    baseBatch,
    baseOutputBoxes,
    selectedFormulaCode,
    wipQtyInputMode,
    bulkInput,
    newMaterialCode,
    newQty,
    materialSearch,
    materialCategoryFilter,
    isMaterialPickerOpen,
    activeTab,
    bulkAddOpen,
  } = uiState;
  const { searchTerm, categoryFilter, lineFilter, statusFilter } = filterState;
  const deferredSearchTerm = useDeferredValue(searchTerm);
  const { selectedRows } = selectionState;
  const { bulkAddSummary, density, editingRowId, baseBoxesEditing, mobileStep, recentMaterials } = editorState;
  const { isLoadingProducts, isLoadingMaterials, isLoadingBom, isVersionActionLoading } = loadingState;
  const { isNotifyLoading, notifyMessage, notifyDetail, notifyTone, notifyAction, activeDiffTab, productsError, materialsError } = notificationState;
  const { lineOptions, categoryOptions } = dataState;
  const [importState, setImportState] = useState({
    preview: { products: [], invalidRows: [], fileName: "" },
    mode: "replace",
    strategy: "overwrite",
    isModalOpen: false,
    isSubmitting: false,
    isParsing: false
  });
  const [formulaModalState, setFormulaModalState] = useState({
    isOpen: false,
    formulaCode: "",
    formulaName: "",
    seedMode: "blank",
    error: "",
  });
  const [formulaRenameState, setFormulaRenameState] = useState({
    isOpen: false,
    formulaName: "",
    isSaving: false,
    error: "",
  });
  const [bulkActionState, setBulkActionState] = useState({
    action: "edit",
    calculationBasis: "JOB_QTY",
    baseValue: "",
  });
  const [cloneDrawerState, setCloneDrawerState] = useState({
    isOpen: false,
    products: [],
    isLoading: false,
    searchTerm: "",
    selectedProductCode: "",
    selectedFormulaCode: "",
    formulaCode: "",
    formulaName: "",
    error: "",
  });
  const [localDraftFormulaKeys, setLocalDraftFormulaKeys] = useState(() => new Set());
  
  const filteredCloneProducts = useMemo(() => {
    const term = (cloneDrawerState.searchTerm || "").trim().toLowerCase();
    if (!term) return cloneDrawerState.products;
    return cloneDrawerState.products.filter(
      (p) =>
        (p.code || "").toLowerCase().includes(term) ||
        (p.name || "").toLowerCase().includes(term)
    );
  }, [cloneDrawerState.products, cloneDrawerState.searchTerm]);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState(false);
  const [isSelectOpen, setIsSelectOpen] = useState(false);
  const [isProductDrawerOpen, setIsProductDrawerOpen] = useState(false);
  const [drawerSelectedProductCode, setDrawerSelectedProductCode] = useState("");
  const [expandedWipCodes, setExpandedWipCodes] = useState(new Set());
  const [dirtyProductCodes, setDirtyProductCodes] = useState(new Set());
  const [addingToProductCode, setAddingToProductCode] = useState(null);
  const [requireBomApproval, setRequireBomApproval] = useState(true);

  const allowedSystemCategories = useMemo(
    () => new Set(BOM_PARENT_CATEGORY_OPTIONS.map((code) => String(code).trim().toUpperCase())),
    []
  );

  const allowedCategoryRecords = useMemo(() => {
    const filtered = categoryOptions.filter((category) =>
      allowedSystemCategories.has(String(category.code || "").trim().toUpperCase())
    );
    if (filtered.length > 0) {
      return filtered;
    }
    // Fallback to the required categories even if the API hasn't returned them yet.
    return BOM_PARENT_CATEGORY_OPTIONS.map((code) => ({
      code,
      name: "",
    }));
  }, [allowedSystemCategories, categoryOptions]);

  const allowedCategoryCodes = useMemo(
    () => allowedCategoryRecords.map((category) => String(category.code || "").trim().toUpperCase()),
    [allowedCategoryRecords]
  );

  const categoryLabelByCode = useMemo(() => {
    const map = new Map();
    allowedCategoryRecords.forEach((category) => {
      const code = String(category.code || "").trim().toUpperCase();
      if (!code) return;
      const name = String(category.name || "").trim();
      map.set(code, name ? `${code} - ${name}` : code);
    });
    return map;
  }, [allowedCategoryRecords]);

  // Compute category options for dropdowns
  const productCategoryOptions = useMemo(() => {
    return allowedCategoryCodes.map((code) => ({
      value: code,
      label: `${categoryLabelByCode.get(code) || code} • ${resolveItemTypeByCategory(code)}`,
    }));
  }, [allowedCategoryCodes, categoryLabelByCode]);

  const materialCategoryOptions = useMemo(() => {
    const labelMap = new Map();
    dataState.materials.forEach((material) => {
      const code = String(material.category || "").trim();
      if (!code) return;
      if (!labelMap.has(code) && material.categoryName) {
        labelMap.set(code, material.categoryName);
      }
    });

    return ["All", ...MATERIAL_CATEGORY_OPTIONS].map((code) => {
      const normalizedCode = String(code || "").trim();
      const label = normalizedCode === "All"
        ? "ทุกหมวดหมู่"
        : `${normalizedCode} • ${labelMap.get(normalizedCode) || "ชื่อไม่ระบุ"}`;
      return { code: normalizedCode, label };
    });
  }, [dataState.materials]);

  const productSearchRef = useRef(null);
  const materialListRef = useRef(null);
  const fileInputRef = useRef(null);
  const actionMenuRef = useRef(null);

  // Vercel Best Practice: rerender-memo - Memoize expensive computations
  const productMap = useMemo(() => {
    return new Map(dataState.products.map((product) => [product.code, product]));
  }, [dataState.products]);

  const materialMap = useMemo(() => {
    return new Map(dataState.materials.map((material) => [material.code, material]));
  }, [dataState.materials]);
  const materialVariantMap = useMemo(() => {
    return new Map(
      dataState.materials.map((material) => [
        `${String(material?.code || "").trim().toUpperCase()}::${String(material?.goodsCode || material?.code || "").trim().toUpperCase()}`,
        material,
      ])
    );
  }, [dataState.materials]);

  useEffect(() => {
    if (filterState.categoryFilter === "all") return;
    if (allowedCategoryCodes.includes(filterState.categoryFilter)) return;
    updateFilterState({ categoryFilter: "all" });
  }, [allowedCategoryCodes, filterState.categoryFilter, updateFilterState]);



  const productList = useMemo(() => {
    return dataState.products;
  }, [dataState.products]);

  const resolveRowMaterialVariant = useCallback((row) => {
    const variantKey = getBomMaterialVariantKey(row);
    return materialVariantMap.get(variantKey) || materialMap.get(row?.materialCode) || null;
  }, [materialMap, materialVariantMap]);

  const getFlattenedTreeRows = useCallback(() => {
    const flat = [];
    const visited = new Set();

    const traverse = (skuCode, depth = 0, parentRowId = null, scaleFactor = 1) => {
      if (visited.has(skuCode)) return;
      visited.add(skuCode);

      const rows = dataState.rowsByProduct[skuCode] || [];
      rows.forEach((row) => {
        const rowMaterial = resolveRowMaterialVariant(row);
        const rowItemType = row.itemType || resolveItemTypeByCategory(rowMaterial?.category);
        const rawQty = normalizePositiveNumber(row.qty, 0);
        const displayQty = depth > 0 ? rawQty * scaleFactor : row.qty;
        flat.push({
          ...row,
          depth,
          parentSkuCode: skuCode,
          parentRowId,
          displayQty,
          isCalculatedDisplay: depth > 0,
        });

        const isWip = rowItemType === "WIP";
        if (isWip && expandedWipCodes.has(row.materialCode)) {
          const requiredWipQty = rawQty * scaleFactor;
          const childScaleFactor = requiredWipQty / resolveWipScaleBase(rowMaterial);
          traverse(row.materialCode, depth + 1, row.id, childScaleFactor);
        }
      });

      visited.delete(skuCode);
    };

    traverse(uiState.selectedProductCode, 0, null);
    return flat;
  }, [dataState.rowsByProduct, uiState.selectedProductCode, expandedWipCodes, resolveRowMaterialVariant]);

  const toggleWipExpand = useCallback(async (wipCode) => {
    setExpandedWipCodes((prev) => {
      const next = new Set(prev);
      if (next.has(wipCode)) {
        next.delete(wipCode);
      } else {
        next.add(wipCode);

        // Fetch child BOM items if not already loaded in rowsByProduct
        if (!dataState.rowsByProduct[wipCode]) {
          (async () => {
            try {
              const response = await fetch(`/api/production-boms/${encodeURIComponent(wipCode)}?formulaCode=DEFAULT`);
              if (response.ok) {
                const payload = await response.json();
                const bomData = Array.isArray(payload.items) ? payload.items : [];
                const nextRows = bomData.map((row) => ({
                  id: createRowId(),
                  materialCode: row.material_sku_code,
                  materialGoodsCode: row.material_goods_code || "",
                  materialName: row.material_name,
                  itemType: resolveItemTypeByCategory(row.iccat_code),
                  qty: row.qty,
                  unit: row.uom_name,
                  note: row.notes || "",
                  planningOffsetDays: normalizePlanningOffsetDays(row.planning_offset_days, 0),
                  calculationBasis: ["HEADCOUNT", "MACHINE_COUNT", "DOUGH_SET_COUNT"].includes(
                    String(row.calculation_basis || "JOB_QTY").toUpperCase()
                  )
                    ? String(row.calculation_basis || "JOB_QTY").toUpperCase()
                    : "JOB_QTY",
                  headcountBase: Number(row.headcount_base) > 0 ? Number(row.headcount_base) : 1,
                  headcountRoundMode: ["UP", "DOWN", "NEAREST"].includes(String(row.headcount_round_mode || "").toUpperCase())
                    ? String(row.headcount_round_mode).toUpperCase()
                    : "NONE",
                  machineBase: Number(row.machine_base) > 0 ? Number(row.machine_base) : 1,
                  machineRoundMode: ["UP", "DOWN", "NEAREST"].includes(String(row.machine_round_mode || "").toUpperCase())
                    ? String(row.machine_round_mode).toUpperCase()
                    : "NONE",
                  doughSetBase: Number(row.dough_set_base) > 0 ? Number(row.dough_set_base) : 1,
                  doughSetRoundMode: ["UP", "DOWN", "NEAREST"].includes(String(row.dough_set_round_mode || "").toUpperCase())
                    ? String(row.dough_set_round_mode).toUpperCase()
                    : "NONE",
                }));
                updateDataState((prev) => ({
                  ...prev,
                  rowsByProduct: {
                    ...prev.rowsByProduct,
                    [wipCode]: nextRows
                  }
                }));
              }
            } catch (err) {
              console.error("Failed to load WIP BOM details dynamically:", err);
            }
          })();
        }
      }
      return next;
    });
  }, [dataState.rowsByProduct, updateDataState]);

  const handleExpandAll = useCallback(async () => {
    if (!uiState.selectedProductCode) return;
    updateLoadingState({ isLoadingBom: true });
    try {
      const visited = new Set();
      const toExpand = new Set(expandedWipCodes);
      const queue = [uiState.selectedProductCode];
      let currentRowsByProduct = { ...dataState.rowsByProduct };
      let hasNewRows = false;

      while (queue.length > 0) {
        const currentCode = queue.shift();
        if (visited.has(currentCode)) continue;
        visited.add(currentCode);

        const rows = currentRowsByProduct[currentCode] || [];
        for (const row of rows) {
          const rowMaterial = resolveRowMaterialVariant(row);
          const rowItemType = row.itemType || resolveItemTypeByCategory(rowMaterial?.category);
          const isWip = rowItemType === "WIP";

          if (isWip) {
            const wipCode = row.materialCode;
            toExpand.add(wipCode);

            if (!currentRowsByProduct[wipCode]) {
              try {
                const response = await fetch(`/api/production-boms/${encodeURIComponent(wipCode)}?formulaCode=DEFAULT`);
                if (response.ok) {
                  const payload = await response.json();
                  const bomData = Array.isArray(payload.items) ? payload.items : [];
                  const nextRows = bomData.map((childRow) => ({
                    id: createRowId(),
                    materialCode: childRow.material_sku_code,
                    materialGoodsCode: childRow.material_goods_code || "",
                    materialName: childRow.material_name,
                    itemType: resolveItemTypeByCategory(childRow.iccat_code),
                    qty: childRow.qty,
                    unit: childRow.uom_name,
                    note: childRow.notes || "",
                    planningOffsetDays: normalizePlanningOffsetDays(childRow.planning_offset_days, 0),
                    calculationBasis: ["HEADCOUNT", "MACHINE_COUNT", "DOUGH_SET_COUNT"].includes(
                      String(childRow.calculation_basis || "JOB_QTY").toUpperCase()
                    )
                      ? String(childRow.calculation_basis || "JOB_QTY").toUpperCase()
                      : "JOB_QTY",
                    headcountBase: Number(childRow.headcount_base) > 0 ? Number(childRow.headcount_base) : 1,
                    headcountRoundMode: ["UP", "DOWN", "NEAREST"].includes(String(childRow.headcount_round_mode || "").toUpperCase())
                      ? String(childRow.headcount_round_mode).toUpperCase()
                      : "NONE",
                    machineBase: Number(childRow.machine_base) > 0 ? Number(childRow.machine_base) : 1,
                    machineRoundMode: ["UP", "DOWN", "NEAREST"].includes(String(childRow.machine_round_mode || "").toUpperCase())
                      ? String(childRow.machine_round_mode).toUpperCase()
                      : "NONE",
                    doughSetBase: Number(childRow.dough_set_base) > 0 ? Number(childRow.dough_set_base) : 1,
                    doughSetRoundMode: ["UP", "DOWN", "NEAREST"].includes(String(childRow.dough_set_round_mode || "").toUpperCase())
                      ? String(childRow.dough_set_round_mode).toUpperCase()
                      : "NONE",
                  }));
                  currentRowsByProduct[wipCode] = nextRows;
                  hasNewRows = true;
                }
              } catch (err) {
                console.error(`Failed to load WIP BOM details for ${wipCode} during Expand All:`, err);
              }
            }
            queue.push(wipCode);
          }
        }
      }

      if (hasNewRows) {
        updateDataState((prev) => ({
          ...prev,
          rowsByProduct: {
            ...prev.rowsByProduct,
            ...currentRowsByProduct
          }
        }));
      }
      setExpandedWipCodes(toExpand);
    } catch (err) {
      console.error("Failed to expand all WIPs:", err);
    } finally {
      updateLoadingState({ isLoadingBom: false });
    }
  }, [uiState.selectedProductCode, expandedWipCodes, dataState.rowsByProduct, resolveRowMaterialVariant, updateDataState, updateLoadingState]);

  const handleCollapseAll = useCallback(() => {
    setExpandedWipCodes(new Set());
  }, []);

  const handlePrintBom = useCallback(() => {
    if (typeof window !== "undefined") {
      window.print();
    }
  }, []);

  const handleCaptureImage = useCallback(async () => {
    if (!uiState.selectedProductCode) return;
    updateLoadingState({ isLoadingBom: true });
    let exportRoot = null;
    updateNotificationState({
      notifyMessage: "กำลังบันทึกรูปภาพ...",
      notifyDetail: "ระบบกำลังเตรียมไฟล์รูปภาพตาราง BOM",
      notifyTone: "neutral",
      notifyAction: "",
    });
    try {
      const htmlToImage = await import("html-to-image");
      const element = document.getElementById("bom-print-table-container");
      if (!element) {
        throw new Error("ไม่พบตารางข้อมูลสำหรับบันทึกรูปภาพ");
      }

      if (document.fonts?.ready) {
        await document.fonts.ready;
      }

      exportRoot = document.createElement("div");
      exportRoot.setAttribute("data-bom-export-root", "true");
      exportRoot.style.position = "absolute";
      exportRoot.style.left = "0";
      exportRoot.style.top = "0";
      exportRoot.style.zIndex = "-1";
      exportRoot.style.pointerEvents = "none";
      exportRoot.style.background = "#ffffff";
      exportRoot.style.padding = "0";
      exportRoot.style.boxSizing = "border-box";
      exportRoot.style.width = `${Math.max(element.scrollWidth, element.clientWidth)}px`;

      const exportClone = element.cloneNode(true);
      exportClone.id = "bom-print-table-export";
      exportClone.style.overflow = "visible";
      exportClone.style.width = `${Math.max(element.scrollWidth, element.clientWidth)}px`;
      exportClone.style.minWidth = `${Math.max(element.scrollWidth, element.clientWidth)}px`;
      exportClone.style.maxWidth = "none";
      exportClone.style.height = "auto";
      exportClone.style.background = "#ffffff";
      exportRoot.appendChild(exportClone);
      document.body.appendChild(exportRoot);

      const liveControlsForExport = element.querySelectorAll("input, select, textarea");
      const cloneControlsForExport = exportClone.querySelectorAll("input, select, textarea");
      cloneControlsForExport.forEach((control, index) => {
        const liveControl = liveControlsForExport[index];
        if (!liveControl) return;

        const liveStyle = window.getComputedStyle(liveControl);
        const liveRect = liveControl.getBoundingClientRect();
        const replacement = document.createElement("div");
        replacement.textContent =
          liveControl.tagName === "SELECT"
            ? liveControl.selectedOptions?.[0]?.textContent?.trim() || liveControl.value || ""
            : liveControl.value || liveControl.placeholder || "";
        replacement.style.display = "flex";
        replacement.style.alignItems = "center";
        replacement.style.justifyContent =
          liveStyle.textAlign === "center" ? "center" : liveStyle.textAlign === "right" ? "flex-end" : "flex-start";
        replacement.style.width = liveRect.width ? `${liveRect.width}px` : liveStyle.width;
        replacement.style.minHeight = liveRect.height ? `${liveRect.height}px` : liveStyle.height;
        replacement.style.height = liveRect.height ? `${liveRect.height}px` : liveStyle.height;
        replacement.style.boxSizing = "border-box";
        replacement.style.padding = liveStyle.padding;
        replacement.style.border = liveStyle.border;
        replacement.style.borderRadius = liveStyle.borderRadius;
        replacement.style.backgroundColor = liveStyle.backgroundColor;
        replacement.style.color = liveStyle.color;
        replacement.style.fontFamily = liveStyle.fontFamily;
        replacement.style.fontSize = liveStyle.fontSize;
        replacement.style.fontWeight = liveStyle.fontWeight;
        replacement.style.lineHeight = liveStyle.lineHeight;
        replacement.style.letterSpacing = liveStyle.letterSpacing;
        replacement.style.textAlign = liveStyle.textAlign;
        replacement.style.whiteSpace = "pre-wrap";
        replacement.style.overflow = "hidden";
        replacement.style.textOverflow = "ellipsis";
        control.replaceWith(replacement);
      });

      const hiddenNodesForExport = exportClone.querySelectorAll(".no-print, .print-capture-hidden");
      hiddenNodesForExport.forEach((node) => {
        node.style.display = "none";
      });

      const exportTable = exportClone.querySelector("table");
      if (exportTable) {
        exportTable.style.width = "100%";
        exportTable.style.tableLayout = "fixed";
      }

      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const exportWidthWithClone = Math.ceil(Math.max(
        exportClone.scrollWidth,
        exportClone.offsetWidth,
        exportClone.getBoundingClientRect().width
      ));
      const exportHeightWithClone = Math.ceil(Math.max(
        exportClone.scrollHeight,
        exportClone.offsetHeight,
        exportClone.getBoundingClientRect().height
      ));
      if (exportWidthWithClone < 2 || exportHeightWithClone < 2) {
        throw new Error("ไม่พบขนาดตารางสำหรับบันทึกรูปภาพ");
      }
      const fontEmbedCSS = await htmlToImage.getFontEmbedCSS(exportClone);
      const exportDataUrl = await htmlToImage.toPng(exportClone, {
        backgroundColor: "#ffffff",
        cacheBust: true,
        width: exportWidthWithClone,
        height: exportHeightWithClone,
        canvasWidth: exportWidthWithClone,
        canvasHeight: exportHeightWithClone,
        pixelRatio: 1,
        skipAutoScale: false,
        preferredFontFormat: "woff2",
        fontEmbedCSS,
        style: {
          background: "#ffffff",
          margin: "0",
          maxWidth: "none",
          overflow: "visible",
          transform: "none",
        },
      });

      const exportLink = document.createElement("a");
      exportLink.download = `BOM-${uiState.selectedProductCode}-${uiState.selectedFormulaCode || "DEFAULT"}.png`;
      exportLink.href = exportDataUrl;
      document.body.appendChild(exportLink);
      exportLink.click();
      exportLink.remove();

      updateNotificationState({
        notifyMessage: "บันทึกรูปภาพสำเร็จ",
        notifyDetail: `ดาวน์โหลดรูปภาพสำหรับ ${uiState.selectedProductCode} เรียบร้อยแล้ว`,
        notifyTone: "success",
        notifyAction: "",
      });
      return;

      const exportWidth = Math.max(element.scrollWidth, element.clientWidth);
      const exportHeight = Math.max(element.scrollHeight, element.clientHeight);
      const exportScale = Math.max(window.devicePixelRatio || 1, 2);

      const buildCaptureOptions = (foreignObjectRendering) => ({
        scale: exportScale,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        foreignObjectRendering,
        removeContainer: true,
        width: exportWidth,
        height: exportHeight,
        windowWidth: window.innerWidth,
        windowHeight: window.innerHeight,
        scrollX: window.pageXOffset,
        scrollY: window.pageYOffset,
        onclone: (clonedDoc) => {
          const clonedElement = clonedDoc.getElementById("bom-print-table-container");
          if (clonedElement) {
            clonedElement.style.overflow = "visible";
            clonedElement.style.width = `${exportWidth}px`;
            clonedElement.style.minWidth = `${exportWidth}px`;
            clonedElement.style.maxWidth = "none";
            clonedElement.style.height = `${exportHeight}px`;

            const liveStyle = window.getComputedStyle(element);
            clonedElement.style.fontFamily = liveStyle.fontFamily;
            clonedElement.style.color = liveStyle.color;
            clonedElement.style.backgroundColor = liveStyle.backgroundColor;
          }

          const toHide = clonedDoc.querySelectorAll(".no-print, .print-capture-hidden");
          toHide.forEach((el) => {
            el.setAttribute("data-html2canvas-ignore", "true");
            el.style.display = "none";
          });

          const liveControls = element.querySelectorAll("input, select, textarea");
          const clonedControls = clonedDoc.querySelectorAll("#bom-print-table-container input, #bom-print-table-container select, #bom-print-table-container textarea");
          clonedControls.forEach((control, index) => {
            const liveControl = liveControls[index];
            if (!liveControl) return;

            const liveStyle = window.getComputedStyle(liveControl);
            const liveRect = liveControl.getBoundingClientRect();
            const replacement = clonedDoc.createElement("div");
            replacement.textContent =
              liveControl.tagName === "SELECT"
                ? liveControl.selectedOptions?.[0]?.textContent?.trim() || liveControl.value || ""
                : liveControl.value || liveControl.placeholder || "";
            replacement.setAttribute("data-capture-control", "true");
            replacement.style.display = "flex";
            replacement.style.alignItems = "center";
            replacement.style.justifyContent = liveStyle.textAlign === "center" ? "center" : liveStyle.textAlign === "right" ? "flex-end" : "flex-start";
            replacement.style.width = liveRect.width ? `${liveRect.width}px` : liveStyle.width;
            replacement.style.minHeight = liveRect.height ? `${liveRect.height}px` : liveStyle.height;
            replacement.style.height = liveRect.height ? `${liveRect.height}px` : liveStyle.height;
            replacement.style.boxSizing = "border-box";
            replacement.style.padding = liveStyle.padding;
            replacement.style.border = liveStyle.border;
            replacement.style.borderRadius = liveStyle.borderRadius;
            replacement.style.backgroundColor = liveStyle.backgroundColor;
            replacement.style.color = liveStyle.color;
            replacement.style.fontFamily = liveStyle.fontFamily;
            replacement.style.fontSize = liveStyle.fontSize;
            replacement.style.fontWeight = liveStyle.fontWeight;
            replacement.style.lineHeight = liveStyle.lineHeight;
            replacement.style.letterSpacing = liveStyle.letterSpacing;
            replacement.style.textAlign = liveStyle.textAlign;
            replacement.style.whiteSpace = "pre-wrap";
            replacement.style.overflow = "hidden";
            replacement.style.textOverflow = "ellipsis";

            control.replaceWith(replacement);
          });

          const styleTags = clonedDoc.querySelectorAll("style");
          styleTags.forEach((styleTag) => {
            try {
              let css = styleTag.innerHTML;
              if (css.includes("oklch")) {
                css = css.replace(/oklch\([^)]+\)/g, "#000000");
                styleTag.innerHTML = css;
              }
            } catch (e) {}
          });

          try {
            for (let i = clonedDoc.styleSheets.length - 1; i >= 0; i--) {
              const sheet = clonedDoc.styleSheets[i];
              try {
                const rules = sheet.cssRules || sheet.rules;
                if (!rules) continue;
                for (let j = rules.length - 1; j >= 0; j--) {
                  const rule = rules[j];
                  if (rule.cssText && rule.cssText.includes("oklch")) {
                    sheet.deleteRule(j);
                  }
                }
              } catch (e) {
                // Keep inaccessible stylesheets so the cloned document preserves the live layout.
              }
            }
          } catch (e) {}
        },
      });

      let canvas;
      try {
        canvas = await html2canvas(element, buildCaptureOptions(true));
      } catch (foreignObjectError) {
        console.warn("html2canvas foreignObjectRendering failed, falling back to default renderer.", foreignObjectError);
        canvas = await html2canvas(element, buildCaptureOptions(false));
      }

      const link = document.createElement("a");
      link.download = `BOM-${uiState.selectedProductCode}-${uiState.selectedFormulaCode || "DEFAULT"}.png`;
      const pngBlob = await new Promise((resolve, reject) => {
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
            return;
          }
          reject(new Error("Failed to create PNG blob"));
        }, "image/png");
      });
      const blobUrl = URL.createObjectURL(pngBlob);
      link.href = blobUrl;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);

      updateNotificationState({
        notifyMessage: "บันทึกรูปภาพสำเร็จ",
        notifyDetail: `ดาวน์โหลดรูปภาพสำหรับ ${uiState.selectedProductCode} เรียบร้อยแล้ว`,
        notifyTone: "success",
        notifyAction: "",
      });
    } catch (error) {
      console.error("Capture image error:", error);
      updateNotificationState({
        notifyMessage: "บันทึกรูปภาพไม่สำเร็จ",
        notifyDetail: error.message || "กรุณาลองใหม่อีกครั้ง",
        notifyTone: "error",
        notifyAction: "",
      });
    } finally {
      exportRoot?.remove();
      updateLoadingState({ isLoadingBom: false });
    }
  }, [uiState.selectedProductCode, uiState.selectedFormulaCode, updateLoadingState, updateNotificationState]);

  const selectedProduct = useMemo(() => {
    return productMap.get(uiState.selectedProductCode);
  }, [productMap, uiState.selectedProductCode]);
  const selectedProductType = useMemo(
    () => resolveItemTypeByCategory(selectedProduct?.category),
    [selectedProduct?.category]
  );
  const isSelectedProductFg = useMemo(
    () => selectedProductType === BOM_ITEM_TYPES.FG,
    [selectedProductType]
  );
  const isSelectedProductWip = useMemo(
    () => selectedProductType === BOM_ITEM_TYPES.WIP,
    [selectedProductType]
  );
  const isSelectedWipUnitMode = useMemo(
    () => isSelectedProductWip && wipQtyInputMode === WIP_QTY_INPUT_MODES.UNIT,
    [isSelectedProductWip, wipQtyInputMode]
  );
  const showBaseBatchInput = useMemo(
    () => !isSelectedProductFg && !isSelectedWipUnitMode,
    [isSelectedProductFg, isSelectedWipUnitMode]
  );
  useEffect(() => {
    if (isSelectedProductWip) return;
    if (wipQtyInputMode !== WIP_QTY_INPUT_MODES.UNIT) {
      updateUiState({ wipQtyInputMode: WIP_QTY_INPUT_MODES.UNIT });
    }
  }, [isSelectedProductWip, updateUiState, wipQtyInputMode]);
  const allowedDrawerComponentTypes = useMemo(
    () => getAllowedComponentTypesForParent(selectedProductType),
    [selectedProductType]
  );
  const canSelectMaterials = useMemo(
    () =>
      Boolean(selectedProductCode) &&
      (selectedProductType === BOM_ITEM_TYPES.FG || selectedProductType === BOM_ITEM_TYPES.WIP),
    [selectedProductCode, selectedProductType]
  );
  const boxesPerBatch = useMemo(() => {
    const batch = Number(baseBatch);
    const boxes = Number(baseOutputBoxes);
    if (!Number.isFinite(batch) || batch <= 0 || !Number.isFinite(boxes) || boxes <= 0) {
      return 0;
    }
    return boxes / batch;
  }, [baseBatch, baseOutputBoxes]);
  const selectedProductUnit = String(selectedProduct?.unit || "").trim() || "หน่วย";
  const baseOutputDisplay = useMemo(() => {
    const output = Number(baseOutputBoxes);
    if (!Number.isFinite(output) || output <= 0) {
      return "-";
    }
    return NUMBER_FORMAT.format(output);
  }, [baseOutputBoxes]);

  const bomRows = useMemo(
    () => dataState.rowsByProduct[uiState.selectedProductCode] || [],
    [dataState.rowsByProduct, uiState.selectedProductCode]
  );

  const activeProductRowsForAdding = useMemo(() => {
    const code = addingToProductCode || uiState.selectedProductCode;
    return dataState.rowsByProduct[code] || [];
  }, [addingToProductCode, uiState.selectedProductCode, dataState.rowsByProduct]);

  const flattenedTreeRows = useMemo(() => {
    return getFlattenedTreeRows();
  }, [getFlattenedTreeRows]);
  const planningSummary = useMemo(() => {
    let wipCount = 0;
    let rawCount = 0;
    let earliestOffset = 0;
    let latestOffset = 0;

    bomRows.forEach((row) => {
      const rowMaterial = resolveRowMaterialVariant(row);
      const rowItemType = row.itemType || resolveItemTypeByCategory(rowMaterial?.category);
      if (rowItemType === BOM_ITEM_TYPES.WIP) {
        wipCount += 1;
        const offsetDays = normalizePlanningOffsetDays(row.planningOffsetDays, 0);
        earliestOffset = Math.min(earliestOffset, offsetDays);
        latestOffset = Math.max(latestOffset, offsetDays);
        return;
      }
      if (rowItemType === BOM_ITEM_TYPES.RAW) {
        rawCount += 1;
      }
    });

    return {
      wipCount,
      rawCount,
      earliestOffset,
      latestOffset,
    };
  }, [bomRows, resolveRowMaterialVariant]);

  const availableMaterials = useMemo(() => {
    return dataState.materials;
  }, [dataState.materials]);

  const versions = useMemo(() => {
    return dataState.versionsByProduct[uiState.selectedProductCode] || [];
  }, [dataState.versionsByProduct, uiState.selectedProductCode]);
  const formulaOptions = useMemo(() => {
    const raw = dataState.formulasByProduct[uiState.selectedProductCode] || [];
    if (raw.length === 0) {
      return [{
        formula_code: DEFAULT_FORMULA_CODE,
        formula_name: DEFAULT_FORMULA_NAME,
      }];
    }
    return raw;
  }, [dataState.formulasByProduct, uiState.selectedProductCode]);
  const selectedFormula = useMemo(
    () => formulaOptions.find((formula) => formula.formula_code === selectedFormulaCode) || formulaOptions[0],
    [formulaOptions, selectedFormulaCode]
  );
  const selectedFormulaDraftKey = useMemo(
    () => createFormulaDraftKey(uiState.selectedProductCode, selectedFormulaCode),
    [uiState.selectedProductCode, selectedFormulaCode]
  );
  const isSelectedFormulaLocalDraft = useMemo(
    () => Boolean(selectedFormulaDraftKey) && localDraftFormulaKeys.has(selectedFormulaDraftKey),
    [localDraftFormulaKeys, selectedFormulaDraftKey]
  );
  const [selectedVersionId, setSelectedVersionId] = useState("");
  const [activeVersionId, setActiveVersionId] = useState("");

  const selectedDrawerProduct = useMemo(() => {
    if (!drawerSelectedProductCode) return selectedProduct || null;
    return productMap.get(drawerSelectedProductCode) || selectedProduct || null;
  }, [drawerSelectedProductCode, productMap, selectedProduct]);

  const openProductDrawer = useCallback(() => {
    setDrawerSelectedProductCode(uiState.selectedProductCode || "");
    updateFilterState({
      searchTerm: "",
      categoryFilter: "all",
      lineFilter: "all",
      statusFilter: "all",
    });
    setIsProductDrawerOpen(true);
  }, [uiState.selectedProductCode, updateFilterState]);

  const handleSelectProduct = useCallback((product) => {
    if (!product?.code) return;
    const nextFormulaCode = normalizeFormulaCode(
      dataState.formulasByProduct[product.code]?.[0]?.formula_code || DEFAULT_FORMULA_CODE
    );
    updateUiState({
      selectedProductCode: product.code,
      selectedFormulaCode: nextFormulaCode,
      activeTab: "editor",
      bulkInput: "",
      newMaterialCode: "",
      status: dataState.bomStatusByProduct[product.code] || "draft",
    });
    updateSelectionState({ selectedRows: new Set() });
    updateEditorState({ bulkAddSummary: "" });
    setSelectedVersionId(dataState.versionsByProduct[product.code]?.[0]?.id || "");
    setDrawerSelectedProductCode(product.code);
    setIsProductDrawerOpen(false);
  }, [
    dataState.bomStatusByProduct,
    dataState.formulasByProduct,
    dataState.versionsByProduct,
    updateEditorState,
    updateSelectionState,
    updateUiState,
  ]);

  const handleSearchFocus = useCallback(() => {
    setIsSelectOpen(true);
    updateFilterState({ searchTerm: "" });
  }, [updateFilterState]);

  const versionDetail = versions.find((item) => item.id === selectedVersionId);
  useEffect(() => {
    if (!versionDetail?.id) return;
    const nextBaseBatch = Number(versionDetail.baseBatch ?? 1) || 1;
    const nextBaseOutputBoxes = Number(versionDetail.baseOutputBoxes ?? 1) || 1;
    const nextWipQtyInputMode = versionDetail.wipQtyInputMode === WIP_QTY_INPUT_MODES.BATCH
      ? WIP_QTY_INPUT_MODES.BATCH
      : WIP_QTY_INPUT_MODES.UNIT;
    updateUiState({
      baseBatch: nextBaseBatch,
      baseOutputBoxes: nextBaseOutputBoxes,
      wipQtyInputMode: nextWipQtyInputMode,
    });
  }, [
    versionDetail?.id,
    versionDetail?.baseBatch,
    versionDetail?.baseOutputBoxes,
    versionDetail?.wipQtyInputMode,
    updateUiState,
  ]);

  useEffect(() => {
    if (!isSelectedProductFg) return;
    if (Number(baseBatch) === 1) return;
    updateUiState({ baseBatch: 1 });
  }, [baseBatch, isSelectedProductFg, updateUiState]);

  useEffect(() => {
    if (!isSelectedWipUnitMode) return;
    if (Number(baseBatch) === 1) return;
    updateUiState({ baseBatch: 1 });
  }, [baseBatch, isSelectedWipUnitMode, updateUiState]);

  const listRef = useRef(null);
  const rowVirtualizer = useVirtualizer({
    count: productList.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 68,
    overscan: 8,
  });
  const materialVirtualizer = useVirtualizer({
    count: availableMaterials.length,
    getScrollElement: () => materialListRef.current,
    estimateSize: () => 56,
    overscan: 10,
  });

  const recentMaterialItems = useMemo(() => {
    return editorState.recentMaterials
      .map((code) => materialMap.get(code))
      .filter(Boolean);
  }, [materialMap, editorState.recentMaterials]);

  const lineMap = useMemo(() => {
    return new Map(dataState.lineOptions.map((line) => [line.id, line]));
  }, [dataState.lineOptions]);

  useEffect(() => {
    const controller = new AbortController();
    const loadLines = async () => {
      try {
        const response = await fetch("/api/production-categories", {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = await response.json();
        const nextLineOptions = Array.isArray(payload.data) ? payload.data : [];
        updateDataState({ lineOptions: nextLineOptions });
      } catch (error) {
        if (error.name === "AbortError") return;
      }
    };

    const loadCategories = async () => {
      try {
        const response = await fetch("/api/production-unique-categories", {
          signal: controller.signal,
        });
        if (!response.ok) return;
        const payload = await response.json();
        const cats = Array.isArray(payload.data) ? payload.data : [];
        updateDataState({ categoryOptions: cats });
      } catch (error) {
        if (error.name === "AbortError") return;
      }
    };

    loadLines();
    loadCategories();
    return () => controller.abort();
  }, [updateDataState]);

  const fetchProducts = useCallback(
    async (signal) => {
      updateLoadingState({ isLoadingProducts: true });
      updateNotificationState({ productsError: "" });
      try {
        const params = new URLSearchParams();
        const categories =
          filterState.categoryFilter === "all"
            ? allowedCategoryCodes
            : [filterState.categoryFilter];
        params.set("iccatCodes", categories.join(","));

        if (deferredSearchTerm.trim()) {
          params.set("search", deferredSearchTerm.trim());
        }

        if (filterState.lineFilter !== "all") {
          params.set("categoryId", filterState.lineFilter);
        }

        if (filterState.statusFilter !== "all") {
          params.set("status", filterState.statusFilter);
        }

        const response = await fetch(
          `/api/production-bom-products?${params.toString()}`,
          signal ? { signal } : undefined
        );

        if (!response.ok) {
          updateNotificationState({ productsError: "โหลดรายการสินค้าไม่สำเร็จ" });
          return;
        }

        const payload = await response.json();
        const rows = Array.isArray(payload.data) ? payload.data : [];
        const nextProducts = rows.map((row) => ({
          code: row.sku_code,
          name: row.sku_name,
          category: row.iccat_code,
          categoryName: row.iccat_name,
          unit: row.uom_name,
          isActive: row.is_active,
          formulaOptions: row.formula_options || [],
        }));

        updateDataState({ products: nextProducts });

        const nextStatusMap = {};
        rows.forEach((row) => {
          nextStatusMap[row.sku_code] = row.bom_status || "draft";
        });

        updateDataState(prev => ({
          ...prev,
          bomStatusByProduct: nextStatusMap
        }));
      } catch (error) {
        if (error.name !== "AbortError") {
          updateNotificationState({ productsError: "โหลดรายการสินค้าไม่สำเร็จ" });
        }
      } finally {
        updateLoadingState({ isLoadingProducts: false });
      }
    },
    [allowedCategoryCodes, deferredSearchTerm, filterState.categoryFilter, filterState.lineFilter, filterState.statusFilter, updateDataState, updateLoadingState, updateNotificationState]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchProducts(controller.signal);
    return () => controller.abort();
  }, [fetchProducts]);

  useEffect(() => {
    const controller = new AbortController();
    const loadBomApprovalSettings = async () => {
      try {
        const response = await fetch("/api/production-bom-settings", {
          signal: controller.signal,
          cache: "no-store",
        });
        if (!response.ok) return;
        const payload = await response.json();
        setRequireBomApproval(payload?.settings?.requireApproval !== false);
      } catch (error) {
        if (error.name === "AbortError") return;
      }
    };

    loadBomApprovalSettings();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(event.target)) {
        setIsActionMenuOpen(false);
      }
    };
    const handleEsc = (event) => {
      if (event.key === "Escape") {
        setIsActionMenuOpen(false);
        setIsProductDrawerOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, []);

  const loadMaterials = useCallback(async (signal, { force = false } = {}) => {
    if (!force && dataState.materials.length > 0) {
      return dataState.materials;
    }

    updateLoadingState({ isLoadingMaterials: true });
    updateNotificationState({ materialsError: "" });
    try {
      const params = new URLSearchParams();
      params.set("iccatCodes", MATERIAL_CATEGORY_OPTIONS.join(","));
      params.set("expandTradeCodes", "1");

      const response = await fetch(
        `/api/production-bom-products?${params.toString()}`,
        signal ? { signal } : undefined
      );
      if (!response.ok) {
        updateNotificationState({ materialsError: "โหลดรายการวัตถุดิบไม่สำเร็จ" });
        return [];
      }
      const payload = await response.json();
      const rows = Array.isArray(payload.data) ? payload.data : [];
      const nextMaterials = rows
        .map((row) => {
          const itemType = resolveItemTypeByCategory(row.iccat_code);
          const conversionMeta =
            itemType === BOM_ITEM_TYPES.WIP
              ? resolveWipConversionMeta(row.formula_options)
              : null;
          const materialRow = {
            code: row.sku_code,
            goodsCode: row.goods_code || row.sku_code,
            name: row.goods_name || row.sku_name,
            category: row.iccat_code,
            categoryName: row.iccat_name,
            itemType,
            uom: row.goods_uom_name || row.uom_name,
            unit: row.goods_uom_name || row.uom_name,
            formulaOptions: Array.isArray(row.formula_options) ? row.formula_options : [],
            wipFormulaCode: conversionMeta?.formulaCode || null,
            wipFormulaName: conversionMeta?.formulaName || null,
            wipQtyInputMode: conversionMeta?.wipQtyInputMode || WIP_QTY_INPUT_MODES.UNIT,
            wipBaseBatch: conversionMeta?.baseBatch || null,
            wipBaseOutputBoxes: conversionMeta?.baseOutputBoxes || null,
            wipUnitsPerBatch: conversionMeta?.unitsPerBatch || 0,
          };
          return {
            ...materialRow,
            unit: resolveMaterialInputUnit(materialRow),
          };
        })
        .filter((row) => row.itemType === "WIP" || row.itemType === "RAW");
      updateDataState({ materials: nextMaterials });
      return nextMaterials;
    } catch (error) {
      if (error.name !== "AbortError") {
        updateNotificationState({ materialsError: "โหลดรายการวัตถุดิบไม่สำเร็จ" });
      }
      return [];
    } finally {
      updateLoadingState({ isLoadingMaterials: false });
    }
  }, [dataState.materials, updateDataState, updateLoadingState, updateNotificationState]);

  useEffect(() => {
    const controller = new AbortController();
    loadMaterials(controller.signal);
    return () => controller.abort();
  }, [loadMaterials]);

  const loadBomDetails = useCallback(
    async (skuCode, signal, { suppressLoading, formulaCode } = {}) => {
      if (!suppressLoading) {
        updateLoadingState({ isLoadingBom: true });
      }
      try {
        const options = signal ? { signal } : undefined;
        const requestedFormulaCode = normalizeFormulaCode(formulaCode || uiState.selectedFormulaCode);
        const query = new URLSearchParams();
        query.set("formulaCode", requestedFormulaCode);
        const response = await fetch(
          `/api/production-boms/${encodeURIComponent(skuCode)}?${query.toString()}`,
          options
        );
        if (!response.ok) return;
        const payload = await response.json();
        const bomData = Array.isArray(payload.items) ? payload.items : [];
        const nextRows = bomData.map((row) => ({
          id: createRowId(),
          materialCode: row.material_sku_code,
          materialGoodsCode: row.material_goods_code || "",
          materialName: row.material_name,
          itemType: resolveItemTypeByCategory(row.iccat_code),
          qty: row.qty,
          unit: row.uom_name,
          note: row.notes || "",
          planningOffsetDays: normalizePlanningOffsetDays(row.planning_offset_days, 0),
          calculationBasis: ["HEADCOUNT", "MACHINE_COUNT", "DOUGH_SET_COUNT"].includes(
            String(row.calculation_basis || "JOB_QTY").toUpperCase()
          )
            ? String(row.calculation_basis || "JOB_QTY").toUpperCase()
            : "JOB_QTY",
          headcountBase: Number(row.headcount_base) > 0 ? Number(row.headcount_base) : 1,
          headcountRoundMode: ["UP", "DOWN", "NEAREST"].includes(String(row.headcount_round_mode || "").toUpperCase())
            ? String(row.headcount_round_mode).toUpperCase()
            : "NONE",
          machineBase: Number(row.machine_base) > 0 ? Number(row.machine_base) : 1,
          machineRoundMode: ["UP", "DOWN", "NEAREST"].includes(String(row.machine_round_mode || "").toUpperCase())
            ? String(row.machine_round_mode).toUpperCase()
            : "NONE",
          doughSetBase: Number(row.dough_set_base) > 0 ? Number(row.dough_set_base) : 1,
          doughSetRoundMode: ["UP", "DOWN", "NEAREST"].includes(String(row.dough_set_round_mode || "").toUpperCase())
            ? String(row.dough_set_round_mode).toUpperCase()
            : "NONE",
        }));

        updateDataState(prev => ({
          ...prev,
          rowsByProduct: {
            ...prev.rowsByProduct,
            [skuCode]: nextRows
          }
        }));

        const versions = Array.isArray(payload.versions)
          ? payload.versions.map((v) => ({
            id: v.id,
            version: v.version_no,
            status: v.status,
            baseBatch: Number(v.base_batch ?? 1) || 1,
            baseOutputBoxes: Number(v.base_output_boxes ?? 1) || 1,
            wipQtyInputMode: v.wip_qty_input_mode === WIP_QTY_INPUT_MODES.BATCH
              ? WIP_QTY_INPUT_MODES.BATCH
              : WIP_QTY_INPUT_MODES.UNIT,
            boxesPerBatch: Number(v.boxes_per_batch ?? 0) || 0,
            note: v.note,
            diff: v.diff,
            changes: v.changes,
            updatedAt: v.created_at,
            updatedBy: v.created_by_name,
            versionNo: v.version_no,
          }))
          : [];
        updateDataState(prev => {
          const serverFormulas = Array.isArray(payload.formulas) && payload.formulas.length
            ? payload.formulas.map((formula) => ({
              formula_code: normalizeFormulaCode(formula.formula_code),
              formula_name: normalizeFormulaName(formula.formula_name),
            }))
            : [{
              formula_code: DEFAULT_FORMULA_CODE,
              formula_name: DEFAULT_FORMULA_NAME,
            }];

          const localDraftFormulas = (prev.formulasByProduct[skuCode] || []).filter((formula) =>
            localDraftFormulaKeys.has(createFormulaDraftKey(skuCode, formula.formula_code))
          );
          const seenFormulaCodes = new Set(serverFormulas.map((formula) => normalizeFormulaCode(formula.formula_code)));
          const mergedFormulas = [...serverFormulas];
          localDraftFormulas.forEach((formula) => {
            const formulaCode = normalizeFormulaCode(formula.formula_code);
            if (seenFormulaCodes.has(formulaCode)) {
              return;
            }
            seenFormulaCodes.add(formulaCode);
            mergedFormulas.push({
              formula_code: formulaCode,
              formula_name: normalizeFormulaName(formula.formula_name),
            });
          });

          return {
            ...prev,
            formulasByProduct: {
              ...prev.formulasByProduct,
              [skuCode]: mergedFormulas,
            },
            versionsByProduct: {
              ...prev.versionsByProduct,
              [skuCode]: versions
            }
          };
        });
        const resolvedFormulaCode = normalizeFormulaCode(payload.selectedFormulaCode || requestedFormulaCode);
        updateUiState({ selectedFormulaCode: resolvedFormulaCode });
        const latestBaseBatch = versions[0]?.baseBatch ?? 1;
        const latestBaseOutputBoxes = versions[0]?.baseOutputBoxes ?? 1;
        const latestWipQtyInputMode = versions[0]?.wipQtyInputMode === WIP_QTY_INPUT_MODES.BATCH
          ? WIP_QTY_INPUT_MODES.BATCH
          : WIP_QTY_INPUT_MODES.UNIT;
        updateUiState({
          baseBatch: latestBaseBatch,
          baseOutputBoxes: latestBaseOutputBoxes,
          wipQtyInputMode: latestWipQtyInputMode,
        });

        const bomStatus = payload.bom?.status || "draft";
        updateDataState(prev => ({
          ...prev,
          bomStatusByProduct: {
            ...prev.bomStatusByProduct,
            [skuCode]: bomStatus
          }
        }));

        updateUiState({ status: bomStatus });
      } catch (error) {
        if (error.name === "AbortError") return;
      } finally {
        if (!suppressLoading) {
          updateLoadingState({ isLoadingBom: false });
        }
      }
    },
    [localDraftFormulaKeys, uiState.selectedFormulaCode, updateDataState, updateUiState, updateLoadingState]
  );

  const handleDownloadTemplate = useCallback(async () => {
    try {
      const [productsResponse, templateMaterials] = await Promise.all([
        fetch(
          `/api/production-bom-products?iccatCodes=${encodeURIComponent(
            allowedCategoryCodes.join(",")
          )}`
        ),
        dataState.materials.length > 0
          ? Promise.resolve(dataState.materials)
          : loadMaterials(undefined, { force: true }),
      ]);
      if (!productsResponse.ok) {
        throw new Error("โหลดรายการสินค้าสำหรับเทมเพลตไม่สำเร็จ");
      }
      const productsPayload = await productsResponse.json();
      const templateProducts = (Array.isArray(productsPayload.data)
        ? productsPayload.data
        : []
      ).map((row) => ({
        code: row.sku_code,
        name: row.sku_name,
        category: row.iccat_code,
        unit: row.uom_name,
      }));
      const exampleRows = await loadBomTemplateExampleRows({
        rootSkuCode: "BL0-5001",
        fetchBom: async (skuCode) => {
          const response = await fetch(
            `/api/production-boms/${encodeURIComponent(skuCode)}?formulaCode=DEFAULT`
          );
          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(
              payload?.error || `โหลด BOM ตัวอย่างของ ${skuCode} ไม่สำเร็จ`
            );
          }
          return payload;
        },
      });
      if (exampleRows.length === 0) {
        throw new Error("ไม่พบสูตร DEFAULT ของ BL0-5001 สำหรับสร้างตัวอย่าง");
      }
      const buffer = await createMultiProductTemplate({
        products: templateProducts,
        materials: templateMaterials,
        exampleRows,
      });
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "bom-template-multi.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      updateNotificationState({
        notifyMessage: "ดาวน์โหลดเทมเพลตไม่สำเร็จ",
        notifyDetail: "กรุณาลองใหม่อีกครั้ง",
        notifyTone: "error",
        notifyAction: "",
      });
    }
  }, [
    allowedCategoryCodes,
    dataState.materials,
    loadMaterials,
    updateNotificationState,
  ]);

  const handleExportCurrent = useCallback(async () => {
    if (!selectedProductCode || !bomRows.length) return;
    try {
      const buffer = await exportSingleProductWorkbook({
        productCode: selectedProductCode,
        productName: selectedProduct?.name || "",
        wipQtyInputMode: uiState.wipQtyInputMode,
        baseBatch: uiState.baseBatch,
        baseOutputBoxes: uiState.baseOutputBoxes,
        items: bomRows,
      });
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `bom-${selectedProductCode}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      updateNotificationState({
        notifyMessage: "Export ไม่สำเร็จ",
        notifyDetail: "กรุณาลองใหม่อีกครั้ง",
        notifyTone: "error",
        notifyAction: "",
      });
    }
  }, [
    bomRows,
    selectedProduct,
    selectedProductCode,
    uiState.baseBatch,
    uiState.baseOutputBoxes,
    uiState.wipQtyInputMode,
    updateNotificationState,
  ]);

  const buildImportPreview = useCallback(
    async (rows, fileName) => {
      if (rows.some((row) => Object.hasOwn(row, "parentSkuCode"))) {
        const productGroups = new Map();
        rows.forEach((row) => {
          const sku = String(row.parentSkuCode || "").trim().toUpperCase();
          const group = productGroups.get(sku) || {
            sku,
            formula_code: "DEFAULT",
            wip_qty_input_mode: row.wipQtyInputMode || "",
            base_batch: row.baseBatch,
            base_output_boxes: row.baseOutputBoxes,
            items: [],
          };
          group.items.push({
            rowNumber: row.rowNumber,
            parent_base_batch: row.baseBatch,
            parent_base_output_boxes: row.baseOutputBoxes,
            parent_wip_qty_input_mode: row.wipQtyInputMode,
            material_goods_code: row.materialGoodsCode,
            material_sku_code: row.materialSkuCode,
            qty: row.qty,
            uom_name: row.uomName,
            notes: row.notes,
            planning_offset_days: row.planningOffsetDays,
            calculation_basis: row.calculationBasis,
            headcount_base: row.headcountBase,
            headcount_round_mode: row.headcountRoundMode,
            machine_base: row.machineBase,
            machine_round_mode: row.machineRoundMode,
            dough_set_base: row.doughSetBase,
            dough_set_round_mode: row.doughSetRoundMode,
          });
          productGroups.set(sku, group);
        });

        try {
          const response = await fetch("/api/production-boms/import-batch/preview", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: importState.mode,
              strategy: importState.strategy,
              products: Array.from(productGroups.values()),
            }),
          });
          const previewResult = await response.json().catch(() => ({}));
          if (!response.ok && response.status !== 207) {
            throw new Error(
              previewResult?.error || "ไม่สามารถตรวจสอบไฟล์นำเข้าได้"
            );
          }
          setImportState((prev) => ({
            ...prev,
            preview: { ...previewResult, fileName },
            isModalOpen: true,
          }));
        } catch (error) {
          updateNotificationState({
            notifyMessage: "ตรวจสอบไฟล์นำเข้าไม่สำเร็จ",
            notifyDetail: error?.message || "กรุณาลองใหม่อีกครั้ง",
            notifyTone: "error",
            notifyAction: "",
          });
        }
        return;
      }

      const invalidRows = [];
      const productGroups = new Map();

      rows.forEach((row) => {
        const productCode = String(row.productCode || "").trim().toUpperCase();
        const baseBatch = Number(row.baseBatch);
        const baseOutputBoxes = Number(row.baseOutputBoxes);
        const code = String(row.code || "").trim().toUpperCase();
        const qty = row.qty;
        const reasons = [];
        if (!productCode) reasons.push("ขาดรหัสสินค้า");
        if (productCode && !productMap.has(productCode)) reasons.push("ไม่พบสินค้า");
        if (!Number.isFinite(baseBatch) || baseBatch <= 0) reasons.push("ขาดค่า base_batch");
        if (!Number.isFinite(baseOutputBoxes) || baseOutputBoxes <= 0) {
          reasons.push("ขาดค่า base_output_boxes");
        }
        if (!code) reasons.push("ขาดรหัสวัตถุดิบ");
        if (code && !materialMap.has(code)) reasons.push("ไม่พบวัตถุดิบ");
        if (qty === null || qty === undefined || Number.isNaN(qty) || Number(qty) <= 0) reasons.push("จำนวนต้อง > 0");

        const group = productGroups.get(productCode) || {
          sku: productCode,
          name: productMap.get(productCode)?.name || "",
          baseBatch: null,
          baseOutputBoxes: null,
          validRows: [],
          seenCodes: new Set(),
        };

        if (Number.isFinite(baseBatch) && baseBatch > 0) {
          if (!group.baseBatch) {
            group.baseBatch = baseBatch;
          } else if (group.baseBatch !== baseBatch) {
            reasons.push("ค่า base_batch ไม่ตรงกันในสินค้าเดียวกัน");
          }
        }

        if (Number.isFinite(baseOutputBoxes) && baseOutputBoxes > 0) {
          if (!group.baseOutputBoxes) {
            group.baseOutputBoxes = baseOutputBoxes;
          } else if (group.baseOutputBoxes !== baseOutputBoxes) {
            reasons.push("ค่า base_output_boxes ไม่ตรงกันในสินค้าเดียวกัน");
          }
        }

        const duplicateInFile = group.seenCodes.has(code);
        if (duplicateInFile) {
          reasons.push("รหัสซ้ำในไฟล์");
        }

        if (reasons.length) {
          invalidRows.push({
            ...row,
            productCode,
            baseBatch: Number.isFinite(baseBatch) ? baseBatch : null,
            baseOutputBoxes: Number.isFinite(baseOutputBoxes) ? baseOutputBoxes : null,
            code,
            reason: reasons.join(" · "),
          });
        } else {
          group.seenCodes.add(code);
          const material = materialMap.get(code);
          group.validRows.push({
            code,
            qty: Number(qty),
            note: row.note || "",
            rowNumber: Number(row.rowNumber || row.line_no || 0) || null,
            materialName: material?.name || "",
          });
          productGroups.set(productCode, group);
        }
      });

      const products = Array.from(productGroups.values()).map((group) => ({
        sku: group.sku,
        name: group.name,
        baseBatch: group.baseBatch,
        baseOutputBoxes: group.baseOutputBoxes,
        validRows: group.validRows,
      }));

      // Request server-side preview diff to align with final write logic
      try {
        const payload = {
          mode: importState.mode,
          strategy: importState.strategy,
          products: products.map((p) => ({
            sku: p.sku,
            base_batch: p.baseBatch,
            base_output_boxes: p.baseOutputBoxes,
            items: p.validRows.map((row) => ({
              material_sku_code: row.code,
              qty: row.qty,
              notes: row.note || "",
              line_no: row.rowNumber || null,
            })),
          })),
        };
        const response = await fetch("/api/production-boms/import-batch/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const previewResult = await response.json().catch(() => ({}));
        const resultMap = new Map();
        (previewResult.results || []).forEach((r) => {
          resultMap.set(r.sku, r);
        });
        const enrichedProducts = products.map((p) => {
          const result = resultMap.get(p.sku);
          return {
            ...p,
            diff: result?.diff || { added: [], updated: [], removed: [] },
            previewStatus: result?.status || "ok",
            previewMessage: result?.message || "",
            matrixDetails: Array.isArray(result?.matrixDetails) ? result.matrixDetails : [],
          };
        });

        setImportState((prev) => ({
          ...prev,
          preview: { products: enrichedProducts, invalidRows, fileName },
          isModalOpen: true,
        }));
      } catch (error) {
        setImportState((prev) => ({
          ...prev,
          preview: { products, invalidRows, fileName },
          isModalOpen: true,
        }));
      }
    },
    [
      importState.mode,
      importState.strategy,
      materialMap,
      productMap,
      updateNotificationState,
    ]
  );

  const handleFileChange = useCallback(
    async (event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      setImportState((prev) => ({ ...prev, isParsing: true }));
      try {
        const parsed = await parseMultiProductWorkbook(file);
        await buildImportPreview(parsed.rows || [], file.name);
      } catch (error) {
        updateNotificationState({
          notifyMessage: "อ่านไฟล์ไม่สำเร็จ",
          notifyDetail: "ตรวจสอบไฟล์ Excel แล้วลองใหม่",
          notifyTone: "error",
          notifyAction: "",
        });
      } finally {
        setImportState((prev) => ({ ...prev, isParsing: false }));
      }
    },
    [buildImportPreview, updateNotificationState]
  );

  const handleConfirmImport = useCallback(async () => {
    if (!importState.preview.products.length) return;
    setImportState((prev) => ({ ...prev, isSubmitting: true }));
    try {
      const payload = {
        mode: importState.mode,
        strategy: importState.strategy,
        products: importState.preview.products.map((product) => ({
          sku: product.sku,
          formula_code: "DEFAULT",
          wip_qty_input_mode: product.wipQtyInputMode,
          base_batch: product.baseBatch,
          base_output_boxes: product.baseOutputBoxes,
          items: product.items,
        })),
      };

      const response = await fetch("/api/production-boms/import-batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || (response.status === 207 && result?.results?.some((r) => r.status !== "ok"))) {
        updateNotificationState({
          notifyMessage: "นำเข้าไม่สำเร็จบางส่วน",
          notifyDetail: "ตรวจสอบรายการที่ผิดพลาดในพรีวิว",
          notifyTone: "error",
          notifyAction: "",
        });
      } else {
        updateNotificationState({
          notifyMessage: "นำเข้าสำเร็จ",
          notifyDetail: "",
          notifyTone: "success",
          notifyAction: "",
        });
      }

      const importedSkus = new Set(payload.products.map((p) => p.sku));
      if (selectedProductCode && importedSkus.has(selectedProductCode)) {
        await Promise.all([
          loadBomDetails(selectedProductCode, undefined, { formulaCode: normalizeFormulaCode(selectedFormulaCode) }),
          fetchProducts(),
        ]);
      } else {
        await fetchProducts();
      }
    } catch (error) {
      updateNotificationState({
        notifyMessage: "นำเข้าไม่สำเร็จ",
        notifyDetail: "กรุณาลองใหม่อีกครั้ง",
        notifyTone: "error",
        notifyAction: "",
      });
    } finally {
      setImportState((prev) => ({
        ...prev,
        isSubmitting: false,
        isModalOpen: false,
      }));
    }
  }, [fetchProducts, importState.mode, importState.preview.products, importState.strategy, loadBomDetails, selectedFormulaCode, selectedProductCode, updateNotificationState]);

  const handleOpenImport = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  useEffect(() => {
    if (!uiState.selectedProductCode) return;
    if (isSelectedFormulaLocalDraft) return;
    const controller = new AbortController();
    loadBomDetails(uiState.selectedProductCode, controller.signal, {
      formulaCode: normalizeFormulaCode(uiState.selectedFormulaCode),
    });
    return () => controller.abort();
  }, [isSelectedFormulaLocalDraft, uiState.selectedProductCode, uiState.selectedFormulaCode, loadBomDetails]);

  const handleRefreshBom = useCallback(async () => {
    if (
      !uiState.selectedProductCode
      || editorState.isDirty
      || editorState.editingRowId
      || isSelectedFormulaLocalDraft
    ) {
      return;
    }
    await loadBomDetails(uiState.selectedProductCode, undefined, {
      formulaCode: normalizeFormulaCode(uiState.selectedFormulaCode),
    });
  }, [
    editorState.editingRowId,
    editorState.isDirty,
    isSelectedFormulaLocalDraft,
    loadBomDetails,
    uiState.selectedFormulaCode,
    uiState.selectedProductCode,
  ]);

  useEffect(() => {
    if (versions.length === 0) {
      setSelectedVersionId("");
      setActiveVersionId("");
      return;
    }
    const exists = versions.some((version) => version.id === selectedVersionId);
    if (!exists) {
      setSelectedVersionId(versions[0].id);
    }
  }, [versions, selectedVersionId]);

  useEffect(() => {
    updateNotificationState({ activeDiffTab: "updated" });
  }, [selectedVersionId, updateNotificationState]);

  const isAllSelected =
    bomRows.length > 0 && selectionState.selectedRows.size === bomRows.length;
  const stepItems = [
    { id: 1, label: "เลือกสินค้า" },
    { id: 2, label: "เลือกวัตถุดิบ" },
    { id: 3, label: "ตรวจ/บันทึก" },
  ];
  const latestVersion = versions[0];
  const versionForSummary =
    (activeVersionId && versions.find((version) => version.id === activeVersionId)) ||
    latestVersion;
  const lastUpdatedAt = versionForSummary?.updatedAt || null;
  const lastEditor = versionForSummary?.updatedBy || "-";
  const hasRejectedLatestVersion =
    latestVersion?.status === "rejected" && versionForSummary?.id !== latestVersion?.id;
  const canRequestApproval = Boolean(
    requireBomApproval &&
    canManage &&
    selectedProductCode &&
    latestVersion?.versionNo &&
    latestVersion.versionNo > 1 &&
    !editorState.isDirty &&
    !isLoadingBom &&
    status !== "rejected"
  );
  const shouldPromptApproval = requireBomApproval && canRequestApproval;
  const showToast = Boolean(notifyMessage);
  const canEditBaseBoxes = !isReadOnly && (baseBoxesEditing || !latestVersion?.versionNo);
  const selectedFormulaLabel = selectedFormula
    ? `${selectedFormula.formula_name} (${selectedFormula.formula_code})`
    : `${DEFAULT_FORMULA_NAME} (${DEFAULT_FORMULA_CODE})`;

  useEffect(() => {
    if (!notifyMessage) return;
    const timeout = setTimeout(() => {
      updateNotificationState({ notifyMessage: "", notifyDetail: "", notifyAction: "", notifyTone: "neutral" });
    }, notifyTone === "error" ? 6000 : 4500);
    return () => clearTimeout(timeout);
  }, [notifyMessage, notifyTone, updateNotificationState]);

  const handleSelectAll = () => {
    if (isAllSelected) {
      updateSelectionState({ selectedRows: new Set() });
      return;
    }
    const next = new Set();
    bomRows.forEach((row) => next.add(row.id));
    updateSelectionState({ selectedRows: next });
  };

  const handleSelectFormula = useCallback((nextFormulaCode) => {
    const normalizedCode = normalizeFormulaCode(nextFormulaCode);
    if (!selectedProductCode || normalizedCode === normalizeFormulaCode(selectedFormulaCode)) {
      return;
    }
    const nextFormulaDraftKey = createFormulaDraftKey(selectedProductCode, normalizedCode);
    const isLocalDraftFormula = localDraftFormulaKeys.has(nextFormulaDraftKey);
    updateUiState({ selectedFormulaCode: normalizedCode });
    updateEditorState({ isDirty: isLocalDraftFormula, baseBoxesEditing: isLocalDraftFormula });
    updateSelectionState({ selectedRows: new Set() });
    setSelectedVersionId("");
    setActiveVersionId("");
  }, [
    localDraftFormulaKeys,
    selectedFormulaCode,
    selectedProductCode,
    updateUiState,
    updateEditorState,
    updateSelectionState,
  ]);

  const handleOpenRenameFormula = useCallback(() => {
    if (!selectedFormula || isReadOnly || isSelectedFormulaLocalDraft || editorState.isDirty) return;
    setFormulaRenameState({
      isOpen: true,
      formulaName: selectedFormula.formula_name || "",
      isSaving: false,
      error: "",
    });
  }, [editorState.isDirty, isReadOnly, isSelectedFormulaLocalDraft, selectedFormula]);

  const handleRenameFormula = useCallback(async () => {
    const formulaName = formulaRenameState.formulaName.trim();
    const formulaCode = normalizeFormulaCode(selectedFormulaCode);
    if (!selectedProductCode || !formulaName || formulaRenameState.isSaving) return;

    setFormulaRenameState((prev) => ({ ...prev, isSaving: true, error: "" }));
    try {
      const response = await fetch(
        `/api/production-boms/${encodeURIComponent(selectedProductCode)}/formulas/${encodeURIComponent(formulaCode)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "rename", formulaName }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "แก้ไขชื่อสูตรไม่สำเร็จ");
      }

      setFormulaRenameState({ isOpen: false, formulaName: "", isSaving: false, error: "" });
      await Promise.all([
        loadBomDetails(selectedProductCode, undefined, { formulaCode }),
        fetchProducts(),
      ]);
      updateNotificationState({
        notifyMessage: "แก้ไขชื่อสูตรสำเร็จ",
        notifyDetail: `${formulaCode} เปลี่ยนชื่อเป็น ${formulaName}`,
        notifyTone: "success",
        notifyAction: "",
      });
    } catch (error) {
      setFormulaRenameState((prev) => ({
        ...prev,
        isSaving: false,
        error: error?.message || "แก้ไขชื่อสูตรไม่สำเร็จ",
      }));
    }
  }, [
    fetchProducts,
    formulaRenameState.formulaName,
    formulaRenameState.isSaving,
    loadBomDetails,
    selectedFormulaCode,
    selectedProductCode,
    updateNotificationState,
  ]);

  const handleDeactivateFormula = useCallback(async () => {
    const formulaCode = normalizeFormulaCode(selectedFormulaCode);
    if (
      !selectedProductCode
      || formulaCode === DEFAULT_FORMULA_CODE
      || isReadOnly
      || isSelectedFormulaLocalDraft
      || editorState.isDirty
    ) return;
    if (!window.confirm(`ต้องการปิดใช้งานสูตร ${selectedFormulaLabel} ใช่หรือไม่?`)) return;

    updateLoadingState({ isVersionActionLoading: true });
    try {
      const response = await fetch(
        `/api/production-boms/${encodeURIComponent(selectedProductCode)}/formulas/${encodeURIComponent(formulaCode)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "deactivate" }),
        }
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload?.error || "ปิดใช้งานสูตรไม่สำเร็จ");
      }

      updateUiState({ selectedFormulaCode: DEFAULT_FORMULA_CODE });
      updateSelectionState({ selectedRows: new Set() });
      await Promise.all([
        loadBomDetails(selectedProductCode, undefined, { formulaCode: DEFAULT_FORMULA_CODE }),
        fetchProducts(),
      ]);
      updateNotificationState({
        notifyMessage: "ปิดใช้งานสูตรสำเร็จ",
        notifyDetail: `ซ่อนสูตร ${formulaCode} แล้ว โดยยังเก็บประวัติเวอร์ชันเดิมไว้`,
        notifyTone: "success",
        notifyAction: "",
      });
    } catch (error) {
      updateNotificationState({
        notifyMessage: "ปิดใช้งานสูตรไม่สำเร็จ",
        notifyDetail: error?.message || "กรุณาลองใหม่อีกครั้ง",
        notifyTone: "error",
        notifyAction: "",
      });
    } finally {
      updateLoadingState({ isVersionActionLoading: false });
    }
  }, [
    editorState.isDirty,
    fetchProducts,
    isReadOnly,
    isSelectedFormulaLocalDraft,
    loadBomDetails,
    selectedFormulaCode,
    selectedFormulaLabel,
    selectedProductCode,
    updateLoadingState,
    updateNotificationState,
    updateSelectionState,
    updateUiState,
  ]);

  const closeFormulaModal = useCallback(() => {
    setFormulaModalState({
      isOpen: false,
      formulaCode: "",
      formulaName: "",
      seedMode: "blank",
      error: "",
    });
  }, []);

  const handleCreateFormula = useCallback(() => {
    if (!selectedProductCode || isReadOnly) return;
    const nextCode = buildNextFormulaCode(formulaOptions);
    setFormulaModalState({
      isOpen: true,
      formulaCode: nextCode,
      formulaName: `สูตร ${nextCode}`,
      seedMode: "blank",
      error: "",
    });
  }, [formulaOptions, isReadOnly, selectedProductCode]);

  const handleConfirmCreateFormula = useCallback(() => {
    const normalizedCode = normalizeFormulaCode(formulaModalState.formulaCode);
    if (!normalizedCode) {
      setFormulaModalState((prev) => ({
        ...prev,
        error: "กรุณาระบุรหัสสูตร",
      }));
      return;
    }

    const exists = formulaOptions.some((formula) => formula.formula_code === normalizedCode);
    if (exists) {
      closeFormulaModal();
      handleSelectFormula(normalizedCode);
      updateNotificationState({
        notifyMessage: `เลือกสูตร ${normalizedCode} แล้ว`,
        notifyDetail: "สูตรนี้มีอยู่แล้วในรายการ",
        notifyTone: "success",
        notifyAction: "",
      });
      return;
    }

    const normalizedName = normalizeFormulaName(
      formulaModalState.formulaName || `สูตร ${normalizedCode}`
    );
    const shouldCloneCurrentFormula = formulaModalState.seedMode === "clone";
    const seedRows = shouldCloneCurrentFormula
      ? bomRows.map((row) => ({
        ...row,
        id: createRowId(),
      }))
      : [];

    updateDataState((prev) => {
      const current = prev.formulasByProduct[selectedProductCode] || [];
      return {
        formulasByProduct: {
          ...prev.formulasByProduct,
          [selectedProductCode]: [
            ...current,
            {
              formula_code: normalizedCode,
              formula_name: normalizedName,
            },
          ],
        },
      };
    });
    updateDataState((prev) => ({
      rowsByProduct: {
        ...prev.rowsByProduct,
        [selectedProductCode]: seedRows,
      },
      versionsByProduct: {
        ...prev.versionsByProduct,
        [selectedProductCode]: [],
      },
    }));
    updateUiState({
      selectedFormulaCode: normalizedCode,
      status: "draft",
      baseBatch: shouldCloneCurrentFormula ? normalizePositiveNumber(uiState.baseBatch, 1) : 1,
      baseOutputBoxes: shouldCloneCurrentFormula ? normalizePositiveNumber(uiState.baseOutputBoxes, 1) : 1,
      wipQtyInputMode: shouldCloneCurrentFormula ? (uiState.wipQtyInputMode || WIP_QTY_INPUT_MODES.UNIT) : WIP_QTY_INPUT_MODES.UNIT,
      note: "",
    });
    setLocalDraftFormulaKeys((prev) => {
      const next = new Set(prev);
      next.add(createFormulaDraftKey(selectedProductCode, normalizedCode));
      return next;
    });
    updateEditorState({ isDirty: true, baseBoxesEditing: true });
    setSelectedVersionId("");
    setActiveVersionId("");
    closeFormulaModal();
    updateNotificationState({
      notifyMessage: `เพิ่มสูตร ${normalizedCode} สำเร็จ`,
      notifyDetail: "สูตรใหม่ถูกแยกเป็นร่างแล้ว กดปุ่ม 'บันทึก' เพื่อบันทึกลงระบบ",
      notifyTone: "success",
      notifyAction: "",
    });
  }, [
    bomRows,
    closeFormulaModal,
    formulaModalState.formulaCode,
    formulaModalState.formulaName,
    formulaModalState.seedMode,
    formulaOptions,
    handleSelectFormula,
    selectedProductCode,
    updateDataState,
    updateEditorState,
    updateNotificationState,
    updateUiState,
    uiState.baseBatch,
    uiState.baseOutputBoxes,
    uiState.wipQtyInputMode,
    setLocalDraftFormulaKeys,
    setSelectedVersionId,
    setActiveVersionId,
  ]);

  const handleOpenCloneDrawer = useCallback(async () => {
    if (!selectedProductCode || isReadOnly) return;
    const nextCode = buildNextFormulaCode(formulaOptions);
    setCloneDrawerState({
      isOpen: true,
      products: [],
      isLoading: true,
      searchTerm: "",
      selectedProductCode: "",
      selectedFormulaCode: "",
      formulaCode: nextCode,
      formulaName: `สูตร ${nextCode}`,
      error: "",
    });

    try {
      const response = await fetch(`/api/production-bom-products?bomFilter=with&iccatCodes=${encodeURIComponent(allowedCategoryCodes.join(","))}`);
      if (!response.ok) {
        throw new Error("โหลดรายการสินค้าต้นแบบไม่สำเร็จ");
      }
      const payload = await response.json();
      const rows = Array.isArray(payload.data) ? payload.data : [];
      const cloneProducts = rows.map((row) => ({
        code: row.sku_code,
        name: row.sku_name,
        category: row.iccat_code,
        categoryName: row.iccat_name,
        unit: row.uom_name,
        formulaOptions: row.formula_options || [],
      })).filter(p => p.code !== selectedProductCode);

      setCloneDrawerState((prev) => ({
        ...prev,
        products: cloneProducts,
        isLoading: false,
      }));
    } catch (err) {
      setCloneDrawerState((prev) => ({
        ...prev,
        isLoading: false,
        error: err.message || "เกิดข้อผิดพลาดในการโหลดสินค้า",
      }));
    }
  }, [allowedCategoryCodes, formulaOptions, isReadOnly, selectedProductCode]);

  const handleConfirmClone = useCallback(async () => {
    const normalizedCode = normalizeFormulaCode(cloneDrawerState.formulaCode);
    if (!normalizedCode) {
      setCloneDrawerState((prev) => ({ ...prev, error: "กรุณาระบุรหัสสูตรใหม่" }));
      return;
    }

    const exists = formulaOptions.some((formula) => formula.formula_code === normalizedCode);
    if (exists) {
      setCloneDrawerState((prev) => ({ ...prev, error: `รหัสสูตร ${normalizedCode} นี้มีอยู่แล้วในรายการ` }));
      return;
    }

    const sourceProductCode = cloneDrawerState.selectedProductCode;
    const sourceFormulaCode = cloneDrawerState.selectedFormulaCode;
    if (!sourceProductCode) {
      setCloneDrawerState((prev) => ({ ...prev, error: "กรุณาเลือกสินค้าต้นทางจากตาราง" }));
      return;
    }

    updateLoadingState({ isLoadingBom: true });
    setCloneDrawerState((prev) => ({ ...prev, isOpen: false }));

    try {
      const response = await fetch(`/api/production-boms/${encodeURIComponent(sourceProductCode)}?formulaCode=${encodeURIComponent(sourceFormulaCode)}`);
      if (!response.ok) {
        throw new Error("ไม่สามารถดึงข้อมูลสูตรจากสินค้าต้นทางได้");
      }
      const payload = await response.json();

      const product = productMap.get(selectedProductCode) || dataState.materials.find(m => m.code === selectedProductCode);
      const parentType = product ? (product.itemType || resolveItemTypeByCategory(product.category || product.iccat_code)) : "UNKNOWN";

      const rawItems = Array.isArray(payload.items) ? payload.items : [];

      const seedRows = rawItems.map((item) => ({
        id: createRowId(),
        materialCode: item.material_sku_code,
        materialGoodsCode: item.material_goods_code || "",
        materialName: item.material_name,
        itemType: resolveItemTypeByCategory(item.iccat_code),
        qty: Number(item.qty),
        unit: item.uom_name || "",
        note: item.notes || "",
        planningOffsetDays: normalizePlanningOffsetDays(item.planning_offset_days, 0),
        calculationBasis: ["HEADCOUNT", "MACHINE_COUNT", "DOUGH_SET_COUNT"].includes(
          String(item.calculation_basis || "JOB_QTY").toUpperCase()
        )
          ? String(item.calculation_basis || "JOB_QTY").toUpperCase()
          : "JOB_QTY",
        headcountBase: Number(item.headcount_base) > 0 ? Number(item.headcount_base) : 1,
        headcountRoundMode: ["UP", "DOWN", "NEAREST"].includes(String(item.headcount_round_mode || "").toUpperCase())
          ? String(item.headcount_round_mode).toUpperCase()
          : "NONE",
        machineBase: Number(item.machine_base) > 0 ? Number(item.machine_base) : 1,
        machineRoundMode: ["UP", "DOWN", "NEAREST"].includes(String(item.machine_round_mode || "").toUpperCase())
          ? String(item.machine_round_mode).toUpperCase()
          : "NONE",
        doughSetBase: Number(item.dough_set_base) > 0 ? Number(item.dough_set_base) : 1,
        doughSetRoundMode: ["UP", "DOWN", "NEAREST"].includes(String(item.dough_set_round_mode || "").toUpperCase())
          ? String(item.dough_set_round_mode).toUpperCase()
          : "NONE",
      }));

      const childTypes = seedRows.map((r) => r.itemType);
      const matrixCheck = validateBomMatrix({ parentType, childTypes });
      if (!matrixCheck.ok) {
        updateNotificationState({
          notifyMessage: "โครงสร้าง BOM ที่คัดลอกมาไม่เข้ากัน",
          notifyDetail: matrixCheck.message,
          notifyTone: "error",
          notifyAction: "",
        });
        updateLoadingState({ isLoadingBom: false });
        return;
      }

      let nextBaseBatch = 1;
      let nextBaseOutputBoxes = 1;
      let nextWipQtyInputMode = WIP_QTY_INPUT_MODES.UNIT;

      const sourceVersion = payload.versions && payload.versions[0];
      if (sourceVersion) {
        nextBaseBatch = normalizePositiveNumber(sourceVersion.baseBatch, 1);
        nextBaseOutputBoxes = normalizePositiveNumber(sourceVersion.baseOutputBoxes, 1);
        nextWipQtyInputMode = sourceVersion.wipQtyInputMode === WIP_QTY_INPUT_MODES.BATCH
          ? WIP_QTY_INPUT_MODES.BATCH
          : WIP_QTY_INPUT_MODES.UNIT;
      }

      const normalizedName = normalizeFormulaName(
        cloneDrawerState.formulaName || `สูตร ${normalizedCode}`
      );

      updateDataState((prev) => {
        const current = prev.formulasByProduct[selectedProductCode] || [];
        return {
          formulasByProduct: {
            ...prev.formulasByProduct,
            [selectedProductCode]: [
              ...current,
              {
                formula_code: normalizedCode,
                formula_name: normalizedName,
              },
            ],
          },
        };
      });

      updateDataState((prev) => ({
        rowsByProduct: {
          ...prev.rowsByProduct,
          [selectedProductCode]: seedRows,
        },
        versionsByProduct: {
          ...prev.versionsByProduct,
          [selectedProductCode]: [],
        },
      }));

      updateUiState({
        selectedFormulaCode: normalizedCode,
        status: "draft",
        baseBatch: nextBaseBatch,
        baseOutputBoxes: nextBaseOutputBoxes,
        wipQtyInputMode: nextWipQtyInputMode,
        note: "",
      });

      setLocalDraftFormulaKeys((prev) => {
        const next = new Set(prev);
        next.add(createFormulaDraftKey(selectedProductCode, normalizedCode));
        return next;
      });

      updateEditorState({ isDirty: true, baseBoxesEditing: true });
      setSelectedVersionId("");
      setActiveVersionId("");

      updateNotificationState({
        notifyMessage: `เพิ่มสูตร ${normalizedCode} สำเร็จ`,
        notifyDetail: "สูตรถูกคัดลอกมาแล้ว กดปุ่ม 'บันทึกสูตร' ด้านขวาบนอีกครั้ง",
        notifyTone: "success",
        notifyAction: "",
      });
    } catch (err) {
      updateNotificationState({
        notifyMessage: "คัดลอกสูตรไม่สำเร็จ",
        notifyDetail: err.message || "เกิดข้อผิดพลาดในการดึงข้อมูลสูตร",
        notifyTone: "error",
        notifyAction: "",
      });
    } finally {
      updateLoadingState({ isLoadingBom: false });
    }
  }, [
    cloneDrawerState.formulaCode,
    cloneDrawerState.formulaName,
    cloneDrawerState.selectedProductCode,
    cloneDrawerState.selectedFormulaCode,
    formulaOptions,
    selectedProductCode,
    updateDataState,
    updateUiState,
    setLocalDraftFormulaKeys,
    updateEditorState,
    setSelectedVersionId,
    setActiveVersionId,
    updateNotificationState,
    productMap,
    dataState.materials,
    updateLoadingState,
  ]);

  const handleSelectRow = (rowId) => {
    updateSelectionState(prev => {
      const next = new Set(prev.selectedRows);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return { selectedRows: next };
    });
  };

  const handleRowChange = (rowId, key, value) => {
    let targetProductCode = null;
    for (const [prodCode, rows] of Object.entries(dataState.rowsByProduct)) {
      if (rows.some(r => r.id === rowId)) {
        targetProductCode = prodCode;
        break;
      }
    }
    if (!targetProductCode || isReadOnly) return;
    
    updateDataState((prev) => {
      const rows = prev.rowsByProduct[targetProductCode] || [];
      const nextRows = rows.map((row) =>
        row.id === rowId ? { ...row, [key]: value } : row
      );
      return { 
        ...prev,
        rowsByProduct: { ...prev.rowsByProduct, [targetProductCode]: nextRows } 
      };
    });
    setDirtyProductCodes((prev) => {
      const next = new Set(prev);
      next.add(targetProductCode);
      return next;
    });
    updateEditorState({ isDirty: true });
  };

  const handleDeleteRow = (rowId) => {
    let targetProductCode = null;
    let targetRow = null;
    for (const [prodCode, rows] of Object.entries(dataState.rowsByProduct)) {
      const found = rows.find(r => r.id === rowId);
      if (found) {
        targetProductCode = prodCode;
        targetRow = found;
        break;
      }
    }
    if (!targetProductCode || !targetRow || isReadOnly) return;
    const confirmText = `ต้องการลบ ${targetRow.materialGoodsCode || targetRow.materialCode} ใช่หรือไม่?`;
    if (!window.confirm(confirmText)) return;
    updateDataState((prev) => {
      const rows = prev.rowsByProduct[targetProductCode] || [];
      return { 
        ...prev,
        rowsByProduct: { ...prev.rowsByProduct, [targetProductCode]: rows.filter((item) => item.id !== rowId) } 
      };
    });
    setDirtyProductCodes((prev) => {
      const next = new Set(prev);
      next.add(targetProductCode);
      return next;
    });
    updateSelectionState(prev => {
      const next = new Set(prev.selectedRows);
      next.delete(rowId);
      return { selectedRows: next };
    });
    if (editingRowId === rowId) {
      updateEditorState({ editingRowId: "" });
    }
    updateEditorState({ isDirty: true });
  };

  const handleBulkApply = () => {
    if (!uiState.selectedProductCode || selectionState.selectedRows.size === 0 || isReadOnly) return;
    const baseValue = Number(bulkActionState.baseValue);
    if (bulkActionState.calculationBasis !== "JOB_QTY" && (!Number.isFinite(baseValue) || baseValue <= 0)) return;
    updateDataState(prev => {
      const rows = prev.rowsByProduct[uiState.selectedProductCode] || [];
      const nextRows = applyBomBulkEdit(rows, selectionState.selectedRows, {
        calculationBasis: bulkActionState.calculationBasis,
        baseValue,
      });
      return {
        ...prev,
        rowsByProduct: {
          ...prev.rowsByProduct,
          [uiState.selectedProductCode]: nextRows
        }
      };
    });
    setDirtyProductCodes((prev) => {
      const next = new Set(prev);
      next.add(uiState.selectedProductCode);
      return next;
    });
    updateSelectionState({ selectedRows: new Set() });
    setBulkActionState((prev) => ({ ...prev, baseValue: "" }));
    updateEditorState({ isDirty: true });
    updateNotificationState({
      notifyMessage: "ปรับรายการที่เลือกแล้ว",
      notifyDetail: "ตรวจสอบข้อมูลและกด 'บันทึกสูตร' เพื่อสร้างเวอร์ชันใหม่",
      notifyTone: "success",
      notifyAction: "",
    });
  };

  const handleBulkDelete = () => {
    if (!uiState.selectedProductCode || selectionState.selectedRows.size === 0 || isReadOnly) return;
    const selectedCount = selectionState.selectedRows.size;
    if (!window.confirm(`ต้องการลบวัตถุดิบที่เลือก ${selectedCount} รายการใช่หรือไม่?`)) return;

    updateDataState((prev) => {
      const rows = prev.rowsByProduct[uiState.selectedProductCode] || [];
      return {
        ...prev,
        rowsByProduct: {
          ...prev.rowsByProduct,
          [uiState.selectedProductCode]: removeSelectedBomRows(rows, selectionState.selectedRows),
        },
      };
    });
    setDirtyProductCodes((prev) => {
      const next = new Set(prev);
      next.add(uiState.selectedProductCode);
      return next;
    });
    updateSelectionState({ selectedRows: new Set() });
    updateEditorState({ isDirty: true, editingRowId: "" });
    updateNotificationState({
      notifyMessage: `ลบ ${selectedCount} รายการแล้ว`,
      notifyDetail: "กด 'บันทึกสูตร' เพื่อสร้างเวอร์ชันใหม่",
      notifyTone: "success",
      notifyAction: "",
    });
  };

  const handleAddMaterial = () => {
    if (isReadOnly) return;
    const material = materialMap.get(uiState.newMaterialCode);
    const targetCode = addingToProductCode || uiState.selectedProductCode;
    if (!material || !targetCode) return;
    const nextRow = {
      id: createRowId(),
      materialCode: material.code,
      materialGoodsCode: material.goodsCode || "",
      materialName: material.name,
      itemType: material.itemType || resolveItemTypeByCategory(material.category),
      uom: resolveMaterialInputUnit(material),
      qty: Number(uiState.newQty || "1"),
      note: "",
      planningOffsetDays: 0,
      calculationBasis: "JOB_QTY",
      headcountBase: 1,
      headcountRoundMode: "NONE",
      machineBase: 1,
      machineRoundMode: "NONE",
      doughSetBase: 1,
      doughSetRoundMode: "NONE",
    };
    updateDataState(prev => {
      const rows = prev.rowsByProduct[targetCode] || [];
      return {
        ...prev,
        rowsByProduct: {
          ...prev.rowsByProduct,
          [targetCode]: [...rows, nextRow]
        }
      };
    });
    setDirtyProductCodes((prev) => {
      const next = new Set(prev);
      next.add(targetCode);
      return next;
    });
    updateEditorState(prev => ({
      ...prev,
      recentMaterials: [material.code, ...prev.recentMaterials.filter((code) => code !== material.code)].slice(0, 6)
    }));
    updateEditorState({ isDirty: true });
    updateUiState({ newMaterialCode: "", newQty: "1" });
  };


  const handleBulkAdd = () => {
    if (!selectedProductCode || isReadOnly) return;
    const tokens = bulkInput
      .split(/[\s,]+/)
      .map((item) => item.trim().toUpperCase())
      .filter(Boolean);
    if (tokens.length === 0) return;
    const existingCodes = new Set(
      (rowsByProduct[selectedProductCode] || []).map((row) => getBomMaterialVariantKey(row))
    );
    let added = 0;
    let skipped = 0;
    const nextRows = [];
    tokens.forEach((code) => {
      const material = materialMap.get(code);
      const materialKey = `${String(material?.code || "").trim().toUpperCase()}::${String(material?.goodsCode || material?.code || "").trim().toUpperCase()}`;
      if (!material || existingCodes.has(materialKey)) {
        skipped += 1;
        return;
      }
      existingCodes.add(materialKey);
      nextRows.push({
        id: createRowId(),
        materialCode: material.code,
        materialGoodsCode: material.goodsCode || "",
        materialName: material.name,
        itemType: material.itemType || resolveItemTypeByCategory(material.category),
        uom: resolveMaterialInputUnit(material),
        qty: Number(newQty || "1"),
        note: "",
        planningOffsetDays: 0,
        calculationBasis: "JOB_QTY",
        headcountBase: 1,
        headcountRoundMode: "NONE",
        machineBase: 1,
        machineRoundMode: "NONE",
        doughSetBase: 1,
        doughSetRoundMode: "NONE",
      });
      added += 1;
    });
    if (added === 0) {
      updateEditorState({ bulkAddSummary: "ไม่มีรายการที่เพิ่มได้" });
      return;
    }
    updateDataState((prev) => {
      const rows = prev.rowsByProduct[selectedProductCode] || [];
      return { rowsByProduct: { ...prev.rowsByProduct, [selectedProductCode]: [...nextRows, ...rows] } };
    });
    updateEditorState((prev) => {
      const next = [...nextRows.map((row) => row.materialCode), ...prev.recentMaterials];
      return { recentMaterials: Array.from(new Set(next)).slice(0, 6) };
    });
    updateEditorState({ bulkAddSummary: `เพิ่ม ${added} รายการ · ข้าม ${skipped} รายการ` });
    updateUiState({ bulkInput: "" });
    updateEditorState({ isDirty: true });
  };

  // Handle batch add materials from MaterialSelectionDrawer
  const handleBatchAddMaterials = (itemsToAdd) => {
    const targetCode = addingToProductCode || uiState.selectedProductCode;
    if (!targetCode || isReadOnly) return;

    const existingCodes = new Set(
      (dataState.rowsByProduct[targetCode] || []).map((row) => getBomMaterialVariantKey(row))
    );

    const nextRows = [];
    itemsToAdd.forEach(({ material, qty }) => {
      const materialKey = `${String(material?.code || "").trim().toUpperCase()}::${String(material?.goodsCode || material?.code || "").trim().toUpperCase()}`;
      if (existingCodes.has(materialKey)) return;
      existingCodes.add(materialKey);
      nextRows.push({
        id: createRowId(),
        materialCode: material.code,
        materialGoodsCode: material.goodsCode || "",
        materialName: material.name,
        itemType: material.itemType || resolveItemTypeByCategory(material.category),
        unit: resolveMaterialInputUnit(material),
        qty: Number(qty) || 1,
        note: "",
        planningOffsetDays: 0,
        calculationBasis: "JOB_QTY",
        headcountBase: 1,
        headcountRoundMode: "NONE",
        machineBase: 1,
        machineRoundMode: "NONE",
        doughSetBase: 1,
        doughSetRoundMode: "NONE",
      });
    });

    if (nextRows.length === 0) return;

    updateDataState((prev) => {
      const rows = prev.rowsByProduct[targetCode] || [];
      return {
        ...prev,
        rowsByProduct: {
          ...prev.rowsByProduct,
          [targetCode]: [...rows, ...nextRows]
        }
      };
    });
    setDirtyProductCodes((prev) => {
      const next = new Set(prev);
      next.add(targetCode);
      return next;
    });

    updateEditorState((prev) => {
      const next = [...nextRows.map((row) => row.materialCode), ...prev.recentMaterials];
      return { ...prev, recentMaterials: Array.from(new Set(next)).slice(0, 6) };
    });

    updateEditorState({ isDirty: true });
  };

  const handleOpenMaterialPicker = () => {
    if (!selectedProductCode) return;
    if (!canSelectMaterials) {
      updateNotificationState({
        notifyMessage: "ไม่สามารถเพิ่มรายการวัตถุดิบได้",
        notifyDetail: "สินค้า Parent ต้องเป็นประเภท FG หรือ WIP เท่านั้น",
        notifyTone: "error",
        notifyAction: "",
      });
      return;
    }
    loadMaterials(undefined, { force: true });
    updateUiState({ isMaterialPickerOpen: true });
  };

  const handleSaveVersion = async () => {
    if (!selectedProductCode || isReadOnly) return;
    updateLoadingState({ isLoadingBom: true });
    try {
      const productCodesToSave = new Set(dirtyProductCodes);
      if (productCodesToSave.size === 0) {
        productCodesToSave.add(selectedProductCode);
      }

      for (const prodCode of productCodesToSave) {
        const prodRows = dataState.rowsByProduct[prodCode] || [];
        const product = productMap.get(prodCode) || dataState.materials.find(m => m.code === prodCode);
        const parentType = product ? (product.itemType || resolveItemTypeByCategory(product.category || product.iccat_code)) : "UNKNOWN";
        const childTypes = prodRows.map((row) =>
          row.itemType || resolveItemTypeByCategory(resolveRowMaterialVariant(row)?.category)
        );
        const matrixCheck = validateBomMatrix({ parentType, childTypes });
        if (!matrixCheck.ok) {
          updateLoadingState({ isLoadingBom: false });
          updateNotificationState({
            notifyMessage: `โครงสร้าง BOM ของ ${prodCode} ไม่ถูกต้อง`,
            notifyDetail: matrixCheck.message,
            notifyTone: "error",
            notifyAction: "",
          });
          return;
        }

        const isProdFg = parentType === BOM_ITEM_TYPES.FG;
        const isProdWip = parentType === BOM_ITEM_TYPES.WIP;
        const resolvedFormulaCode = prodCode === selectedProductCode ? selectedFormulaCode : DEFAULT_FORMULA_CODE;
        const resolvedFormulaName = prodCode === selectedProductCode ? (selectedFormula?.formula_name || DEFAULT_FORMULA_NAME) : DEFAULT_FORMULA_NAME;
        const resolvedWipQtyInputMode =
          prodCode === selectedProductCode &&
          isProdWip &&
          uiState.wipQtyInputMode === WIP_QTY_INPUT_MODES.BATCH
            ? WIP_QTY_INPUT_MODES.BATCH
            : WIP_QTY_INPUT_MODES.UNIT;
        const resolvedBaseBatch = prodCode === selectedProductCode
          ? normalizePositiveNumber(uiState.baseBatch, 1)
          : 1;
        const resolvedBaseOutputBoxes = prodCode === selectedProductCode
          ? normalizePositiveNumber(uiState.baseOutputBoxes, 1)
          : 1;

        const payload = {
          status: prodCode === selectedProductCode ? status : "approved",
          note: prodCode === selectedProductCode ? note : "Saved recursively via BOM Tree editor",
          base_batch: resolvedBaseBatch,
          base_output_boxes: resolvedBaseOutputBoxes,
          wip_qty_input_mode: resolvedWipQtyInputMode,
          formula_code: normalizeFormulaCode(resolvedFormulaCode),
          formula_name: normalizeFormulaName(resolvedFormulaName),
          items: prodRows.map((row) => {
            const rowMaterial = resolveRowMaterialVariant(row);
            const rowItemType = row.itemType || resolveItemTypeByCategory(rowMaterial?.category);
            return {
              material_sku_code: row.materialCode,
              material_goods_code: row.materialGoodsCode || null,
              qty: row.qty,
              uom_name: resolveBomRowInputUnit(row, rowMaterial),
              notes: row.note ?? row.notes ?? "",
              planning_offset_days: rowItemType === BOM_ITEM_TYPES.WIP
                ? normalizePlanningOffsetDays(row.planningOffsetDays, 0)
                : 0,
              calculation_basis: ["HEADCOUNT", "MACHINE_COUNT", "DOUGH_SET_COUNT"].includes(
                String(row.calculationBasis || "").toUpperCase()
              )
                ? String(row.calculationBasis).toUpperCase()
                : "JOB_QTY",
              headcount_base: Number(row.headcountBase) > 0 ? Number(row.headcountBase) : 1,
              headcount_round_mode: ["UP", "DOWN", "NEAREST"].includes(String(row.headcountRoundMode || "").toUpperCase())
                ? String(row.headcountRoundMode).toUpperCase()
                : "NONE",
              machine_base: Number(row.machineBase) > 0 ? Number(row.machineBase) : 1,
              machine_round_mode: ["UP", "DOWN", "NEAREST"].includes(String(row.machineRoundMode || "").toUpperCase())
                ? String(row.machineRoundMode).toUpperCase()
                : "NONE",
              dough_set_base: Number(row.doughSetBase) > 0 ? Number(row.doughSetBase) : 1,
              dough_set_round_mode: ["UP", "DOWN", "NEAREST"].includes(String(row.doughSetRoundMode || "").toUpperCase())
                ? String(row.doughSetRoundMode).toUpperCase()
                : "NONE",
            };
          }),
        };

        const response = await fetch(
          `/api/production-boms/${encodeURIComponent(prodCode)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          }
        );
        if (!response.ok) {
          const errorPayload = await response.json().catch(() => ({}));
          throw new Error(errorPayload?.error || `ไม่สามารถบันทึกสูตรสำหรับ ${prodCode} ได้`);
        }
      }

      await Promise.all([
        loadBomDetails(uiState.selectedProductCode, undefined, { formulaCode: normalizeFormulaCode(selectedFormulaCode) }),
        fetchProducts(),
        loadMaterials(undefined, { force: true }),
      ]);

      setLocalDraftFormulaKeys((prev) => {
        const next = new Set(prev);
        next.delete(createFormulaDraftKey(selectedProductCode, selectedFormulaCode));
        return next;
      });
      setDirtyProductCodes(new Set());
      updateUiState({ note: "" });
      updateEditorState({ isDirty: false });
      updateEditorState({ baseBoxesEditing: false });
      const shouldPromptAfterSave = requireBomApproval && Boolean(latestVersion?.versionNo);
      updateNotificationState({
        notifyMessage: "บันทึกเวอร์ชันใหม่สำเร็จ",
        notifyDetail: `สูตร ${normalizeFormulaCode(selectedFormulaCode)} ถูกบันทึกลงระบบแล้ว`,
        notifyTone: "success",
        notifyAction: shouldPromptAfterSave ? "approval" : "",
      });
    } catch (error) {
      updateLoadingState({ isLoadingBom: false });
      updateNotificationState({
        notifyMessage: "บันทึกเวอร์ชันไม่สำเร็จ",
        notifyDetail: error.message || "กรุณาลองใหม่อีกครั้ง",
        notifyTone: "error",
        notifyAction: "",
      });
    }
  };

  const handleRequestApproval = async () => {
    if (!canRequestApproval || isNotifyLoading) return;
    updateNotificationState({ isNotifyLoading: true });
    updateNotificationState({ notifyMessage: "", notifyDetail: "", notifyAction: "", notifyTone: "neutral" });
    try {
      const payload = {
        sku_code: uiState.selectedProductCode,
        sku_name: selectedProduct?.name || "",
        editor_name: lastEditor || "",
        changes: latestVersion?.changes || [],
      };
      const response = await fetch("/api/line/notify", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => ({}));
        throw new Error(errorPayload?.error || "ส่งแจ้งเตือนไม่สำเร็จ");
      }
      updateNotificationState({
        notifyMessage: "ส่งคำขออนุมัติไปที่ LINE แล้ว",
        notifyDetail: "ระบบกำลังรอการอนุมัติจากผู้มีสิทธิ์",
        notifyTone: "success",
        notifyAction: "",
      });
    } catch (error) {
      updateNotificationState({
        notifyMessage: error?.message || "ส่งแจ้งเตือนไม่สำเร็จ",
        notifyDetail: "กรุณาลองใหม่อีกครั้ง",
        notifyTone: "error",
        notifyAction: "",
      });
    } finally {
      updateNotificationState({ isNotifyLoading: false });
    }
  };

  const handleRevertVersion = async (version) => {
    if (!selectedProductCode || isReadOnly || !version?.id || version.status === "rejected") return;
    const confirmText = `ต้องการย้อนกลับไปใช้ ${version.version} ใช่หรือไม่?`;
    if (!window.confirm(confirmText)) return;
    updateLoadingState({ isVersionActionLoading: true });
    try {
      const response = await fetch(
        `/api/production-bom-versions/${encodeURIComponent(version.id)}/revert`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );
      if (!response.ok) {
        updateLoadingState({ isVersionActionLoading: false });
        return;
      }
      const payload = await response.json();
      await Promise.all([loadBomDetails(uiState.selectedProductCode), fetchProducts()]);
      if (payload?.version?.id) {
        setSelectedVersionId(payload.version.id);
      }
    } catch (error) {
      updateLoadingState({ isVersionActionLoading: false });
    } finally {
      updateLoadingState({ isVersionActionLoading: false });
    }
  };

  const handleDeleteVersion = async (version) => {
    if (!uiState.selectedProductCode || isReadOnly || !version?.id) return;
    const confirmText = `ต้องการซ่อน ${version.version} ใช่หรือไม่?`;
    if (!window.confirm(confirmText)) return;
    updateLoadingState({ isVersionActionLoading: true });
    try {
      const response = await fetch(
        `/api/production-bom-versions/${encodeURIComponent(version.id)}`,
        { method: "DELETE" }
      );
      if (!response.ok) {
        updateLoadingState({ isVersionActionLoading: false });
        return;
      }
      await Promise.all([loadBomDetails(uiState.selectedProductCode), fetchProducts()]);
    } catch (error) {
      updateLoadingState({ isVersionActionLoading: false });
    } finally {
      updateLoadingState({ isVersionActionLoading: false });
    }
  };

  const isEditorTab = uiState.activeTab === "editor";
  const hasSelection = selectionState.selectedRows.size > 0;
  const isCompact = editorState.density === "compact";
  const cellPadding = isCompact ? "py-1.5" : "py-3";

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const isEditable =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      if (isEditable) return;
      if (event.key === "/" || (event.key.toLowerCase() === "k" && (event.ctrlKey || event.metaKey))) {
        event.preventDefault();
        openProductDrawer();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openProductDrawer]);

  useEffect(() => {
    if (!editorState.isDirty) return;
    const handleBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [editorState.isDirty]);

  useEffect(() => {
    if (isProductDrawerOpen) return;
    if (productList.length === 0) {
      if (uiState.selectedProductCode) {
        updateUiState({ selectedProductCode: "" });
        updateEditorState({ editingRowId: "" });
      }
      return;
    }
    const exists = productList.some(
      (product) => product.code === uiState.selectedProductCode
    );
    if (!exists) {
      const nextCode = productList[0].code;
      updateUiState({ selectedProductCode: nextCode });
      updateSelectionState({ selectedRows: new Set() });
      updateUiState({ activeTab: "editor" });
      updateEditorState({ bulkAddSummary: "" });
      updateUiState({ bulkInput: "" });
      updateUiState({ note: "" });
      updateUiState({ newMaterialCode: "" });
      updateEditorState({ editingRowId: "" });
      setSelectedVersionId(dataState.versionsByProduct[nextCode]?.[0]?.id || "");
      setActiveVersionId("");
      updateUiState({ status: dataState.bomStatusByProduct[nextCode] || "draft" });
    }
  }, [isProductDrawerOpen, productList, uiState.selectedProductCode, dataState.versionsByProduct, dataState.bomStatusByProduct, updateUiState, updateSelectionState, updateEditorState]);

  return (
    <PermissionGate
      permissionsAny={["production-line-bom-view", "production-line-bom-manage"]}
    >
      <div className="flex min-h-screen flex-col bg-[#f6f7f8] text-[#0f172a] font-sans">
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx"
          className="hidden"
          onChange={handleFileChange}
        />
        {showToast && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="w-full max-w-md rounded-[2px] border border-[#d4af37]/40 bg-[#0b2141] text-white shadow-2xl">
              <div className="flex items-start gap-3 px-5 py-4">
                <div className="mt-0.5">
                  {notifyTone === "success" ? (
                    <CheckCircle className="h-5 w-5 text-[#d4af37]" />
                  ) : notifyTone === "error" ? (
                    <AlertTriangle className="h-5 w-5 text-rose-300" />
                  ) : (
                    <Check className="h-5 w-5 text-white/80" />
                  )}
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">{notifyMessage}</p>
                  {notifyDetail && (
                    <p className="mt-1 text-xs text-white/70">{notifyDetail}</p>
                  )}
                  {!notifyDetail && notifyAction === "approval" && canRequestApproval && (
                    <p className="mt-1 text-xs text-white/70">ขั้นตอนถัดไป: ส่งคำขออนุมัติ</p>
                  )}
                  {notifyAction === "approval" && canRequestApproval && (
                    <button
                      type="button"
                      onClick={handleRequestApproval}
                      className="mt-3 inline-flex items-center gap-2 rounded-full border border-[#d4af37] bg-[#102C57] px-3 py-1.5 text-[11px] font-semibold text-[#d4af37] transition-colors hover:bg-[#0a2345]"
                    >
                      <Check aria-hidden="true" className="h-3.5 w-3.5" />
                      ส่งคำขออนุมัติ
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => updateNotificationState({ notifyMessage: "", notifyDetail: "", notifyAction: "", notifyTone: "neutral" })}
                  className="rounded-full p-1 text-white/70 hover:bg-white/10 hover:text-white"
                  aria-label="ปิดการแจ้งเตือน"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        )}
        <div className="bg-gradient-to-r from-[#102C57] via-[#0b2141] to-[#102C57] shadow-xl text-white shrink-0 z-40">
          <div className="max-w-[95%] mx-auto py-4">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                <div>
                  <h6 className="text-[#d4af37] font-bold tracking-[0.2em] text-[10px] uppercase mb-0.5">
                    Quickplan
                  </h6>
                  <h1 className="text-xl md:text-2xl font-bold text-white flex flex-wrap items-center gap-3">
                    <Layers size={28} className="text-[#d4af37]" />
                    BOM ไลน์การผลิต
                    <span className="text-[10px] bg-[#d4af37] text-[#102C57] px-2 py-0.5 rounded-full font-sans font-bold tracking-wider">
                      {productList.length.toLocaleString()} รายการ
                    </span>
                  </h1>
                </div>
                <div className="flex flex-col items-start gap-3 lg:items-end">
                  <button
                    type="button"
                    onClick={handleRefreshBom}
                    disabled={
                      !selectedProductCode
                      || isLoadingBom
                      || editorState.isDirty
                      || Boolean(editorState.editingRowId)
                      || isSelectedFormulaLocalDraft
                    }
                    title={editorState.isDirty ? "บันทึกการแก้ไขก่อนรีเฟรชข้อมูล" : "โหลดข้อมูล BOM ล่าสุด"}
                    className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/10 px-4 py-2 text-[11px] font-semibold text-white shadow-sm transition-colors hover:border-[#d4af37] hover:text-[#d4af37] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <RefreshCw aria-hidden="true" className={`h-4 w-4 ${isLoadingBom ? "animate-spin" : ""}`} />
                    รีเฟรชข้อมูล
                  </button>
                  <div className="relative hidden sm:block" ref={actionMenuRef}>
                    <div className="flex flex-wrap items-center gap-1">
                      <button
                        type="button"
                        onClick={handleOpenImport}
                        disabled={importState.isParsing}
                        className="inline-flex items-center gap-2 rounded-l-full rounded-r-none border border-white/40 bg-white/10 px-4 py-2 text-[11px] font-semibold text-white shadow-sm transition-colors duration-200 hover:border-[#d4af37] hover:text-[#d4af37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Plus aria-hidden="true" className="h-4 w-4" />
                        นำเข้า/ส่งออก
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsActionMenuOpen((prev) => !prev)}
                        aria-expanded={isActionMenuOpen}
                        className="inline-flex items-center rounded-r-full rounded-l-none border border-white/40 border-l-0 bg-white/10 px-2 py-2 text-white hover:border-[#d4af37] hover:text-[#d4af37] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37] focus-visible:ring-offset-2"
                      >
                        <ChevronDown aria-hidden="true" className="h-4 w-4" />
                      </button>
                    </div>
                    {isActionMenuOpen && (
                      <div
                        role="menu"
                        className="absolute right-0 mt-2 w-60 rounded-2xl border border-gray-200 bg-white text-[#102C57] shadow-2xl z-50"
                      >
                        <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-gray-500">
                          เทมเพลต / นำเข้า / ส่งออก
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setIsActionMenuOpen(false);
                            handleDownloadTemplate();
                          }}
                          className="flex w-full items-center gap-2 px-4 py-2 text-sm font-semibold hover:bg-gray-50 focus-visible:outline-none focus-visible:bg-gray-100"
                        >
                          <FileSpreadsheet className="h-4 w-4 text-emerald-600" />
                          ดาวน์โหลดเทมเพลต (หลายสินค้า)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsActionMenuOpen(false);
                            handleOpenImport();
                          }}
                          className="flex w-full items-center gap-2 px-4 py-2 text-sm font-semibold hover:bg-gray-50 focus-visible:outline-none focus-visible:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={importState.isParsing}
                        >
                          <Plus className="h-4 w-4 text-[#102C57]" />
                          นำเข้า Excel (หลายสินค้า)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsActionMenuOpen(false);
                            handleExportCurrent();
                          }}
                          disabled={!selectedProductCode || !bomRows.length}
                          className="flex w-full items-center gap-2 px-4 py-2 text-sm font-semibold hover:bg-gray-50 focus-visible:outline-none focus-visible:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          <Copy className="h-4 w-4 text-gray-600" />
                          Export BOM สินค้าปัจจุบัน
                        </button>
                      </div>
                    )}
                  </div>
                  {hasRejectedLatestVersion && (
                    <p className="text-[11px] font-semibold text-rose-200">
                      เวอร์ชัน {latestVersion?.version || "-"} ถูกปฏิเสธแล้ว ·
                      ระบบยังใช้งาน{versionForSummary?.version ? ` ${versionForSummary.version}` : " เวอร์ชันก่อนหน้า"} อยู่
                    </p>
                  )}
                </div>
              </div>
              <div className="grid gap-2 text-xs text-white/70 grid-cols-2 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl border border-[#d4af37]/30 bg-[#102C57]/70 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60">
                    สินค้า
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {selectedProduct?.code || "-"}
                  </p>
                  <p className="text-[11px] text-white/70">
                    {selectedProduct?.name || "-"}
                  </p>
                </div>
                <div className="rounded-xl border border-[#d4af37]/30 bg-[#102C57]/70 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60">
                    เวอร์ชันล่าสุด
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {versionForSummary?.version || "ยังไม่มี"}
                  </p>
                  <p className="text-[11px] text-white/70">
                    {lastUpdatedAt ? formatDate(lastUpdatedAt) : "-"}
                  </p>
                </div>
                <div className="rounded-xl border border-[#d4af37]/30 bg-[#102C57]/70 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60">
                    ผู้แก้ไขล่าสุด
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">{lastEditor}</p>
                  <p className="text-[11px] text-white/70">
                    {selectedProduct?.line || "-"}
                  </p>
                </div>
                <div className={`rounded-xl border px-3 py-2 ${STATUS_SUMMARY_STYLES[status] || "border-[#1f2937]/60 bg-[#0f172a] text-white"}`}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/60">
                    สถานะสูตร
                  </p>
                  <p className="mt-1 text-sm font-semibold text-white">
                    {STATUS_OPTIONS.find((option) => option.id === status)?.label}
                  </p>
                  <p className="text-[11px] text-white/70">
                    {bomRows.length} วัตถุดิบ
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Custom style for high-quality printing & brand design */}
          <style>{`
            @media print {
              @page {
                size: A4 portrait;
                margin: 10mm;
              }
              body {
                background: white !important;
                color: black !important;
              }
              body * {
                visibility: hidden;
              }
              #print-bom-root-container, #print-bom-root-container * {
                visibility: visible;
              }
              #print-bom-root-container {
                position: absolute !important;
                left: 0 !important;
                top: 0 !important;
                width: 100% !important;
                margin: 0 !important;
                padding: 0 !important;
              }
              .no-print, .no-print * {
                display: none !important;
                visibility: hidden !important;
              }
              .print-capture-hidden, .print-capture-hidden * {
                display: none !important;
                visibility: hidden !important;
              }
              table {
                border-collapse: collapse !important;
                width: 100% !important;
                margin-top: 15px !important;
                table-layout: fixed !important;
              }
              th, td {
                border: 1px solid #cbd5e1 !important;
                padding: 6px 8px !important;
                color: black !important;
                font-size: 11px !important;
              }
              th {
                background-color: #102C57 !important;
                color: #d4af37 !important;
                font-weight: bold !important;
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
              }
              input, select {
                border: none !important;
                background: transparent !important;
                padding: 0 !important;
                font-size: 11px !important;
                color: black !important;
                width: 100% !important;
                appearance: none !important;
                -webkit-appearance: none !important;
                -moz-appearance: none !important;
              }
              /* Column width adjustments to fit A4 Portrait exactly */
              th:nth-child(1), td:nth-child(1) { display: none !important; }
              th:nth-child(8), td:nth-child(8) { display: none !important; }
              th:nth-child(2), td:nth-child(2) { width: 20% !important; }
              th:nth-child(3), td:nth-child(3) { width: 30% !important; }
              th:nth-child(4), td:nth-child(4) { width: 10% !important; }
              th:nth-child(5), td:nth-child(5) { width: 22% !important; }
              th:nth-child(6), td:nth-child(6) { width: 8% !important; }
              th:nth-child(7), td:nth-child(7) { width: 10% !important; }
            }
          `}</style>

          <div className="mx-auto flex w-full max-w-[95%] flex-col gap-6 py-6 pb-28 lg:pb-6">
            {/* HORIZONTAL TOP CONTROL PANEL */}
            <div className="rounded-[2px] border border-[#d4af37]/35 bg-[#102C57] p-4 shadow-sm flex flex-col gap-4 no-print">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#d4af37]">
                    สินค้า / WIP
                  </label>
                  <button
                    type="button"
                    onClick={openProductDrawer}
                    className="flex h-11 w-full items-center justify-between gap-3 rounded-[2px] border border-[#d4af37]/30 bg-white px-3 text-left text-sm font-semibold text-[#102C57] transition-colors hover:border-[#d4af37] hover:bg-[#fffaf0] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d4af37]"
                  >
                    <span className="min-w-0">
                      <span className="block truncate">
                        {selectedProduct ? `${selectedProduct.code} - ${selectedProduct.name}` : "เลือกสินค้า"}
                      </span>
                      <span className="block truncate text-[10px] font-semibold text-gray-500">
                        {selectedProduct ? `${selectedProduct.category || "-"} / ${selectedProduct.unit || "-"}` : `${productList.length.toLocaleString()} รายการพร้อมเลือก`}
                      </span>
                    </span>
                    <Search aria-hidden="true" className="h-4 w-4 shrink-0 text-[#d4af37]" />
                  </button>
                </div>

                {/* Legacy inline selector kept hidden while the drawer owns product selection. */}
                <div className="hidden">
                  <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#d4af37]">
                    สินค้า / WIP (Finished Good / WIP)
                  </label>
                  <div className="relative flex items-center rounded-[2px] border border-[#d4af37]/30 bg-white px-3 py-2 focus-within:border-[#d4af37] focus-within:ring-1 focus-within:ring-[#d4af37]">
                    <Search aria-hidden="true" className="h-4 w-4 text-gray-400 shrink-0 mr-2" />
                    <input
                      id="product-search-input"
                      name="product-search-input"
                      type="text"
                      ref={productSearchRef}
                      value={isSelectOpen ? searchTerm : (selectedProduct ? `${selectedProduct.code} - ${selectedProduct.name}` : "")}
                      onFocus={handleSearchFocus}
                      onChange={(event) => updateFilterState({ searchTerm: event.target.value })}
                      className="w-full bg-transparent text-sm text-[#102C57] placeholder:text-gray-400 focus-visible:outline-none font-semibold"
                      placeholder="ค้นหาตามรหัส/ชื่อสินค้า (กด / หรือ Ctrl+K)…"
                      autoComplete="off"
                    />
                    {(isSelectOpen && searchTerm) || (!isSelectOpen && selectedProductCode) ? (
                      <button
                        type="button"
                        onClick={() => {
                          if (isSelectOpen) {
                            updateFilterState({ searchTerm: "" });
                          } else {
                            updateUiState({ selectedProductCode: "" });
                          }
                        }}
                        className="text-gray-400 hover:text-gray-600 focus-visible:outline-none shrink-0"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>

                  {/* Floating Dropdown List */}
                  {isSelectOpen && (
                    <div className="absolute left-0 right-0 top-full mt-1 z-50 rounded-[2px] border border-gray-200 bg-white shadow-2xl overflow-hidden max-h-[320px] flex flex-col">
                      <div className="bg-[#102C57] px-3 py-2 flex items-center justify-between text-white shrink-0">
                        <span className="text-[10px] uppercase font-bold tracking-[0.1em] text-[#d4af37]">ผลลัพธ์การค้นหา</span>
                        <span className="text-[10px] bg-white/10 px-2 py-0.5 rounded-full font-bold">
                          {productList.length.toLocaleString()} รายการ
                        </span>
                      </div>
                      <div
                        ref={listRef}
                        className="overflow-y-auto grow bg-white"
                        style={{ height: productList.length > 0 ? `${Math.min(300, productList.length * 68)}px` : "auto" }}
                      >
                        <div
                          style={{
                            height: `${rowVirtualizer.getTotalSize()}px`,
                            position: "relative",
                            width: "100%"
                          }}
                        >
                          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                            const product = productList[virtualRow.index];
                            if (!product) return null;
                            const isActive = product.code === uiState.selectedProductCode;
                            return (
                              <button
                                key={product.code}
                                type="button"
                                onClick={() => {
                                  const nextFormulaCode = normalizeFormulaCode(
                                    dataState.formulasByProduct[product.code]?.[0]?.formula_code || DEFAULT_FORMULA_CODE
                                  );
                                  updateUiState({ selectedProductCode: product.code });
                                  updateUiState({ selectedFormulaCode: nextFormulaCode });
                                  updateSelectionState({ selectedRows: new Set() });
                                  updateUiState({ activeTab: "editor" });
                                  updateEditorState({ bulkAddSummary: "" });
                                  updateUiState({ bulkInput: "" });
                                  updateUiState({ newMaterialCode: "" });
                                  setSelectedVersionId(
                                    dataState.versionsByProduct[product.code]?.[0]?.id || ""
                                  );
                                  updateUiState({ status: dataState.bomStatusByProduct[product.code] || "draft" });
                                  setIsSelectOpen(false);
                                }}
                                className={`absolute left-0 right-0 flex w-full flex-col gap-0.5 border-b border-gray-100 px-4 py-2.5 text-left text-xs transition-colors duration-150 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d4af37] ${
                                  isActive
                                    ? "bg-[#102C57] text-white"
                                    : "bg-white text-[#102C57] hover:bg-gray-50"
                                }`}
                                style={{
                                  top: 0,
                                  transform: `translateY(${virtualRow.start}px)`,
                                }}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-bold">{product.code}</span>
                                  <span className={`rounded-[2px] px-1.5 py-0.2 text-[9px] font-bold ${
                                    isActive ? "bg-white/20 text-[#d4af37]" : "bg-[#102C57]/10 text-[#102C57]"
                                  }`}>
                                    {product.category}
                                  </span>
                                </div>
                                <span className="truncate opacity-80 font-medium">{product.name}</span>
                                <span className="text-[10px] opacity-60">
                                  {product.line ? `${product.line} · ${product.uom || "-"}` : product.uom || "-"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        {isLoadingProducts && (
                          <div className="px-4 py-6 text-center text-xs text-gray-500">กำลังโหลด...</div>
                        )}
                        {!isLoadingProducts && productList.length === 0 && (
                          <div className="px-4 py-6 text-center text-xs text-gray-500">ไม่พบสินค้า</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Category Filter */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="product-category-filter" className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#d4af37]">
                    หมวดสินค้า
                  </label>
                  <select
                    id="product-category-filter"
                    name="product-category-filter"
                    value={categoryFilter}
                    onChange={(event) => updateFilterState({ categoryFilter: event.target.value })}
                    className="h-11 rounded-[2px] border border-[#d4af37]/30 bg-white px-3 text-sm font-semibold text-[#102C57] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d4af37]"
                  >
                    <option value="all">หมวดสินค้าทั้งหมด</option>
                    {productCategoryOptions.map((category) => (
                      <option key={category.value} value={category.value}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Line Filter */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="product-line-filter" className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#d4af37]">
                    ประเภทไลน์การผลิต
                  </label>
                  <select
                    id="product-line-filter"
                    name="product-line-filter"
                    value={lineFilter}
                    onChange={(event) => updateFilterState({ lineFilter: event.target.value })}
                    className="h-11 rounded-[2px] border border-[#d4af37]/30 bg-white px-3 text-sm font-semibold text-[#102C57] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d4af37]"
                  >
                    <option value="all">ไลน์ผลิตทั้งหมด</option>
                    {lineOptions.map((line) => (
                      <option key={line.id} value={line.id}>
                        {line.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status Filter */}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="product-bom-filter" className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#d4af37]">
                    สถานะสูตร
                  </label>
                  <select
                    id="product-bom-filter"
                    name="product-bom-filter"
                    value={statusFilter}
                    onChange={(event) => updateFilterState({ statusFilter: event.target.value })}
                    className="h-11 rounded-[2px] border border-[#d4af37]/30 bg-white px-3 text-sm font-semibold text-[#102C57] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d4af37]"
                  >
                    <option value="all">สถานะสูตรทั้งหมด</option>
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {!selectedProductCode ? (
              <div className="rounded-[2px] border border-dashed border-[#102C57]/20 bg-white py-20 text-center no-print">
                <Layers className="mx-auto h-12 w-12 text-[#102C57]/40 animate-pulse" />
                <h3 className="mt-4 text-sm font-bold text-[#102C57] uppercase tracking-[0.2em]">กรุณาเลือกผลิตภัณฑ์</h3>
                <p className="mt-2 text-xs text-gray-500">กรุณาเลือกหรือค้นหาผลิตภัณฑ์ด้านบนเพื่อแสดงสูตรย่อยและตรวจสอบโครงสร้าง BOM</p>
              </div>
            ) : (
              <div id="print-bom-root-container" className="flex min-w-0 flex-col gap-4">
                {/* Print Header (Visible only when printing) */}
                <div className="hidden print:block mb-6 border-b-2 border-[#102C57] pb-4">
                  <div className="flex justify-between items-end">
                    <div>
                      <h1 className="text-xl font-bold text-[#102C57]">รายงานตรวจสอบโครงสร้างสูตรสินค้า (BOM Tree Hierarchy)</h1>
                      <p className="text-xs text-gray-500 mt-1">รายละเอียดวัตถุดิบและ WIP ในกระบวนการผลิต</p>
                    </div>
                    <div className="text-right text-[10px] text-gray-400">
                      วันที่พิมพ์: {formatDate(new Date())}
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-xs border border-[#102C57]/10 p-4 bg-[#102C57]/[0.02] rounded-[2px]">
                    <div><span className="font-bold text-[#102C57]">รหัสสินค้า (FG Sku):</span> {selectedProduct?.code || "-"}</div>
                    <div><span className="font-bold text-[#102C57]">เวอร์ชันสูตร (Version):</span> {versionForSummary?.version || "ยังไม่มี"}</div>
                    <div className="col-span-2"><span className="font-bold text-[#102C57]">ชื่อสินค้า (Product Name):</span> {selectedProduct?.name || "-"}</div>
                    <div><span className="font-bold text-[#102C57]">หมวดหมู่ (Category):</span> {selectedProduct?.category || "-"}</div>
                    <div><span className="font-bold text-[#102C57]">ไลน์การผลิต (Line):</span> {selectedProduct?.line || "-"}</div>
                    <div><span className="font-bold text-[#102C57]">สูตรการผลิต (Formula):</span> {selectedFormulaLabel || "-"}</div>
                    <div><span className="font-bold text-[#102C57]">สถานะสูตร (Status):</span> {STATUS_OPTIONS.find((option) => option.id === status)?.label || "-"}</div>
                    <div><span className="font-bold text-[#102C57]">ผู้แก้ไขล่าสุด (Last Editor):</span> {lastEditor || "-"}</div>
                    <div><span className="font-bold text-[#102C57]">ปรับปรุงล่าสุด (Last Updated):</span> {lastUpdatedAt ? formatDate(lastUpdatedAt) : "-"}</div>
                  </div>
                </div>

                <div className="relative rounded-[2px] border border-gray-200 bg-white p-4 shadow-sm print:border-none print:p-0 no-print">
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                    {/* Left: Product Info (Col 4) */}
                    <div className="lg:col-span-4 flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`rounded-[2px] border px-1.5 py-0.5 text-[10px] font-bold ${
                          selectedProductType === BOM_ITEM_TYPES.WIP
                            ? "border-[#d4af37]/75 bg-[#fff7db] text-[#8a6d1f]"
                            : "border-[#102C57]/35 bg-[#102C57]/10 text-[#102C57]"
                        }`}>
                          {selectedProductType}
                        </span>
                        <h2 className="text-base font-bold text-[#102C57]">{selectedProduct?.code}</h2>
                        <span className="text-[10px] text-gray-500 font-semibold bg-gray-100 px-1.5 py-0.5 rounded-[2px]">{selectedProduct?.category}</span>
                        <span className="text-[10px] text-gray-500 font-semibold bg-gray-100 px-1.5 py-0.5 rounded-[2px]">{selectedProduct?.line || "-"}</span>
                      </div>
                      <div className="text-xs font-semibold text-[#5b6b7a] truncate max-w-[350px]" title={selectedProduct?.name}>
                        {selectedProduct?.name}
                      </div>
                    </div>

                    {/* Middle Left: Formula Select (Col 3) */}
                    <div className="lg:col-span-3 flex flex-col gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">สูตรที่ใช้งาน</span>
                      <div className="flex items-center gap-1.5">
                        <select
                          value={selectedFormulaCode || DEFAULT_FORMULA_CODE}
                          onChange={(event) => handleSelectFormula(event.target.value)}
                          disabled={!selectedProductCode || isLoadingBom}
                          className="h-8 rounded-[2px] border border-gray-200 bg-white px-2 text-xs font-semibold text-[#102C57] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d4af37] grow"
                        >
                          {formulaOptions.map((formula) => {
                            const code = normalizeFormulaCode(formula.formula_code);
                            const isDraft = localDraftFormulaKeys.has(createFormulaDraftKey(selectedProductCode, code));
                            return (
                              <option key={code} value={code}>
                                {formula.formula_name} ({code}){isDraft ? " *ร่าง" : ""}
                              </option>
                            );
                          })}
                        </select>
                        <button
                          type="button"
                          onClick={handleOpenRenameFormula}
                          disabled={
                            !selectedProductCode
                            || isReadOnly
                            || isSelectedFormulaLocalDraft
                            || editorState.isDirty
                            || isVersionActionLoading
                          }
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] border border-gray-200 bg-white text-[#102C57] transition-colors hover:border-[#d4af37] hover:bg-[#fff7db] disabled:cursor-not-allowed disabled:opacity-40 no-print"
                          title={editorState.isDirty ? "บันทึกการแก้ไขก่อนเปลี่ยนชื่อสูตร" : "แก้ไขชื่อสูตร"}
                          aria-label="แก้ไขชื่อสูตร"
                        >
                          <Pencil size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={handleDeactivateFormula}
                          disabled={
                            !selectedProductCode
                            || selectedFormulaCode === DEFAULT_FORMULA_CODE
                            || isReadOnly
                            || isSelectedFormulaLocalDraft
                            || editorState.isDirty
                            || isVersionActionLoading
                          }
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] border border-rose-200 bg-white text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-40 no-print"
                          title={selectedFormulaCode === DEFAULT_FORMULA_CODE ? "สูตรหลัก DEFAULT ปิดใช้งานไม่ได้" : "ปิดใช้งานสูตร"}
                          aria-label="ปิดใช้งานสูตร"
                        >
                          <Trash2 size={12} />
                        </button>
                        <button
                          type="button"
                          onClick={handleCreateFormula}
                          disabled={!selectedProductCode || isReadOnly}
                          className="inline-flex h-8 items-center justify-center gap-1 rounded-[2px] border border-[#d4af37] bg-white px-2.5 text-[11px] font-bold text-[#102C57] transition-colors hover:bg-[#fff7db] disabled:opacity-50 no-print shrink-0"
                        >
                          <Plus size={12} />
                          เพิ่มสูตร
                        </button>
                      </div>
                    </div>

                    {/* Middle Right: Production Base (Col 3) */}
                    <div className="lg:col-span-3 flex flex-col gap-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">ฐานสูตรการผลิต</span>
                      <div className="flex items-center gap-1">
                        {showBaseBatchInput && (
                          <input
                            id="base-batch"
                            name="base-batch"
                            type="number"
                            min={0.0001}
                            step="0.0001"
                            value={baseBatch}
                            onChange={(event) => {
                              updateUiState({ baseBatch: event.target.value });
                              if (latestVersion?.versionNo) updateEditorState({ isDirty: true });
                            }}
                            disabled={!canEditBaseBoxes}
                            className="h-8 w-14 rounded-[2px] border border-gray-200 bg-white px-1.5 text-xs font-semibold text-[#102C57] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d4af37] shrink-0"
                            placeholder="Batch"
                          />
                        )}
                        <input
                          id="base-output-boxes"
                          name="base-output-boxes"
                          type="number"
                          min={0.0001}
                          step="0.0001"
                          value={baseOutputBoxes}
                          onChange={(event) => {
                            updateUiState({ baseOutputBoxes: event.target.value });
                            if (latestVersion?.versionNo) updateEditorState({ isDirty: true });
                          }}
                          disabled={!canEditBaseBoxes}
                          className="h-8 w-20 rounded-[2px] border border-gray-200 bg-white px-1.5 text-xs font-semibold text-[#102C57] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d4af37] shrink-0"
                          placeholder={selectedProductUnit}
                        />
                        <div className="h-8 px-2 flex items-center justify-center rounded-[2px] border border-[#d4af37]/30 bg-[#fff7db] text-[10px] font-bold text-[#8a6d1f] whitespace-nowrap shrink-0">
                          {isSelectedProductFg || isSelectedWipUnitMode
                            ? `${baseOutputDisplay} ${selectedProductUnit}`
                            : `${boxesPerBatch > 0 ? NUMBER_FORMAT.format(boxesPerBatch) : "-"} ${selectedProductUnit}/b`}
                        </div>
                        {latestVersion?.versionNo ? (
                          <button
                            type="button"
                            onClick={() =>
                              updateEditorState((prev) => ({
                                baseBoxesEditing: !prev.baseBoxesEditing,
                              }))
                            }
                            disabled={isReadOnly}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-[2px] border border-gray-200 bg-white text-[#102C57] hover:border-[#d4af37] disabled:opacity-50 no-print shrink-0"
                            title={baseBoxesEditing ? "ล็อกการแก้ไข" : "แก้ไขฐานสูตร"}
                          >
                            <Pencil size={12} />
                          </button>
                        ) : null}
                      </div>
                    </div>

                    {/* Right: Actions (Col 2) */}
                    <div className="lg:col-span-2 md:col-span-12 flex lg:justify-end md:justify-start items-end gap-2 h-full pb-0.5 no-print">
                      <button
                        type="button"
                        onClick={handleSaveVersion}
                        disabled={isReadOnly || isLoadingBom || !selectedProductCode}
                        className="inline-flex h-8 items-center gap-1 rounded-[2px] bg-[#d4af37] px-3 py-1.5 text-xs font-bold text-[#102C57] shadow-sm hover:bg-[#b5952f] disabled:opacity-50 shrink-0"
                      >
                        <Save className="h-3.5 w-3.5" />
                        บันทึกสูตร
                      </button>
                      {canManage && requireBomApproval && (
                        <button
                          type="button"
                          onClick={handleRequestApproval}
                          disabled={!canRequestApproval || isNotifyLoading}
                          className="inline-flex h-8 items-center gap-1 rounded-[2px] border border-[#d4af37] bg-[#102C57] px-3 py-1.5 text-xs font-bold text-[#d4af37] shadow-sm hover:bg-[#0a2345] disabled:opacity-50 shrink-0"
                        >
                          <Check className="h-3.5 w-3.5" />
                          ส่งขออนุมัติ
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2 no-print">
                    {TAB_OPTIONS.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => updateUiState({ activeTab: tab.id })}
                        className={`rounded-[2px] px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37] focus-visible:ring-offset-2 touch-manipulation ${activeTab === tab.id
                          ? "bg-[#d4af37] text-[#102C57]"
                          : "bg-[#102C57]/10 text-[#102C57] hover:bg-[#102C57]/20"
                          }`}
                        aria-pressed={activeTab === tab.id}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {isEditorTab ? (
                  <div className="rounded-[2px] border border-gray-200 bg-white p-5 shadow-sm mt-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="no-print">
                        <p className="text-sm font-semibold text-[#102C57] uppercase tracking-[0.1em]">
                          สูตรการผลิตหลัก (BOM Tree)
                        </p>
                        <p className="text-xs text-gray-500">
                          แสดงความเชื่อมโยงวัตถุดิบและ WIP ทุกระดับ · พิมพ์เพื่อส่งให้ฝ่ายผลิตตรวจสอบ
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 no-print">
                        <button
                          type="button"
                          onClick={() =>
                            updateEditorState((prev) => ({
                              density: prev.density === "compact" ? "comfortable" : "compact",
                            }))
                          }
                          className="inline-flex items-center gap-1.5 rounded-[2px] border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-[#102C57] hover:bg-[#102C57]/5 transition-colors duration-150"
                          title={isCompact ? "เปลี่ยนเป็นขนาดปกติ" : "เปลี่ยนเป็นขนาดกะทัดรัด"}
                        >
                          <ListFilter className="h-4 w-4 text-[#d4af37]" />
                          {isCompact ? "โหมดปกติ" : "โหมดกะทัดรัด"}
                        </button>
                        <button
                          type="button"
                          onClick={handleExpandAll}
                          disabled={!selectedProductCode || isLoadingBom}
                          className="inline-flex items-center gap-1.5 rounded-[2px] border border-[#d4af37] bg-white px-3 py-1.5 text-xs font-bold text-[#102C57] hover:bg-[#102C57]/5 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ChevronDown className="h-4 w-4 text-[#d4af37]" />
                          ขยายทั้งหมด
                        </button>
                        <button
                          type="button"
                          onClick={handleCollapseAll}
                          disabled={!selectedProductCode}
                          className="inline-flex items-center gap-1.5 rounded-[2px] border border-gray-200 bg-white px-3 py-1.5 text-xs font-bold text-[#102C57] hover:bg-[#102C57]/5 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <ChevronRight className="h-4 w-4" />
                          ยุบทั้งหมด
                        </button>
                        {!isReadOnly && (
                          <button
                            type="button"
                            onClick={handleOpenCloneDrawer}
                            disabled={!selectedProductCode}
                            className="inline-flex items-center gap-1.5 rounded-[2px] border border-[#d4af37] bg-white px-3 py-1.5 text-xs font-bold text-[#102C57] hover:bg-[#102C57]/5 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Copy className="h-4 w-4 text-[#d4af37]" />
                            คัดลอกจากสินค้าอื่น
                          </button>
                        )}
                        {!isReadOnly && (
                          <button
                            type="button"
                            onClick={handleOpenMaterialPicker}
                            disabled={!canSelectMaterials}
                            className="inline-flex items-center gap-2 rounded-[2px] border border-[#d4af37] bg-[#d4af37] px-3 py-1.5 text-xs font-bold text-[#102C57] transition-colors duration-200 hover:bg-[#b5952f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37] focus-visible:ring-offset-2 touch-manipulation disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label="เลือกวัตถุดิบ"
                          >
                            <Plus aria-hidden="true" className="h-4 w-4" />
                            เลือกวัตถุดิบ
                          </button>
                        )}
                      </div>
                    </div>
                    {isSelectedProductWip && (
                      <div className="mt-3 inline-flex rounded-[2px] border border-gray-200 bg-white p-1 text-xs no-print">
                        <button
                          type="button"
                          onClick={() => updateUiState({
                            wipQtyInputMode: WIP_QTY_INPUT_MODES.UNIT,
                            baseBatch: 1,
                          })}
                          className={`rounded-[2px] px-3 py-1.5 font-bold transition-colors ${
                            wipQtyInputMode === WIP_QTY_INPUT_MODES.UNIT
                              ? "bg-[#102C57] text-white"
                              : "text-[#102C57] hover:bg-[#102C57]/10"
                          }`}
                        >
                          ผูก WIP: กรอกเป็นหน่วย
                        </button>
                        <button
                          type="button"
                          onClick={() => updateUiState({ wipQtyInputMode: WIP_QTY_INPUT_MODES.BATCH })}
                          className={`rounded-[2px] px-3 py-1.5 font-bold transition-colors ${
                            wipQtyInputMode === WIP_QTY_INPUT_MODES.BATCH
                              ? "bg-[#102C57] text-white"
                              : "text-[#102C57] hover:bg-[#102C57]/10"
                          }`}
                        >
                          ผูก WIP: กรอกเป็นชุด
                        </button>
                      </div>
                    )}


                    <div id="bom-print-table-container" className="mt-4 overflow-x-auto lg:overflow-visible bg-white">
                       <table className="bom-column-order w-full table-fixed border-collapse text-left text-sm table-bordered table-compact">
                          <thead className="bg-[#102C57] text-sm uppercase tracking-wider text-white text-center sticky top-0 z-20 shadow-md">
                          <tr>
                            <th className="w-10 px-1 py-2 xl:px-2 xl:py-3 font-semibold border-b border-[#0f172a] no-print">
                              <input
                                type="checkbox"
                                name="select-all"
                                checked={isAllSelected}
                                onChange={handleSelectAll}
                                disabled={isReadOnly}
                                className="h-4 w-4 rounded-[2px] border-white/60 text-[#102C57] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37] focus-visible:ring-offset-2"
                                aria-label="เลือกทั้งหมด"
                              />
                            </th>
                            <th className={`w-[170px] px-1 font-bold uppercase tracking-wider text-[#d4af37] border-b border-[#102C57] text-left ${isCompact ? "text-[13px] py-1.5" : "text-[15px] py-2 xl:py-3"}`}>รหัสวัตถุดิบ</th>
                             <th className={`w-[370px] px-1 font-bold uppercase tracking-wider text-[#d4af37] border-b border-[#102C57] text-left ${isCompact ? "text-[13px] py-1.5" : "text-[15px] py-2 xl:py-3"}`}>ชื่อวัตถุดิบ</th>
                             <th className={`w-[90px] px-1 font-bold uppercase tracking-wider text-[#d4af37] border-b border-[#102C57] text-center ${isCompact ? "text-[13px] py-1.5" : "text-[15px] py-2 xl:py-3"}`}>จำนวน</th>
                             <th className={`w-[90px] px-1 font-bold uppercase tracking-wider text-[#d4af37] border-b border-[#102C57] text-center ${isCompact ? "text-[13px] py-1.5" : "text-[15px] py-2 xl:py-3"}`}>หน่วย</th>
                             <th className={`w-[310px] px-1 font-bold uppercase tracking-wider text-[#d4af37] border-b border-[#102C57] text-center ${isCompact ? "text-[13px] py-1.5" : "text-[15px] py-2 xl:py-3"}`}>ฐานคำนวณ</th>
                             <th className={`w-[130px] px-1 font-bold uppercase tracking-wider text-[#d4af37] border-b border-[#102C57] text-center print-capture-hidden ${isCompact ? "text-[13px] py-1.5" : "text-[15px] py-2 xl:py-3"}`}>วันในแผน</th>
                             <th className={`w-[65px] px-1 font-bold uppercase tracking-wider text-[#d4af37] border-b border-[#102C57] text-center no-print ${isCompact ? "text-[13px] py-1.5" : "text-[15px] py-2 xl:py-3"}`}>แก้ไข</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white text-gray-950">
                          {flattenedTreeRows.map((row) => {
                            const rowMaterial = resolveRowMaterialVariant(row);
                            const rowItemType = row.itemType || resolveItemTypeByCategory(rowMaterial?.category);
                            const rowUnit = resolveBomRowInputUnit(row, rowMaterial) || "-";
                            const isChild = row.depth > 0;
                            const isEditableRow = !isChild && !isReadOnly;
                            const displayQty = row.displayQty ?? row.qty;
                            return (
                            <tr
                              key={row.id}
                              className={`text-black font-bold transition-all duration-300 ${isCompact ? "text-[13px]" : "text-[15px]"} ${
                                editingRowId === row.id
                                  ? "bg-amber-50/40 border-y border-dashed border-[#d4af37]/50 shadow-sm"
                                  : isChild
                                    ? "bg-[#d4af37]/[0.02] hover:bg-blue-50/30"
                                    : "hover:bg-blue-50/30"
                              }`}
                            >
                              <td className={`px-1 xl:px-2 ${cellPadding} text-center no-print`}>
                                {!isChild ? (
                                  <input
                                    type="checkbox"
                                    name={`select-${row.id}`}
                                    checked={selectedRows.has(row.id)}
                                    onChange={() => handleSelectRow(row.id)}
                                    disabled={isReadOnly}
                                    className="h-4 w-4 rounded-[2px] border-[#cbd5f5] text-[#102C57] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37] focus-visible:ring-offset-2"
                                    aria-label={`เลือก ${row.materialCode}`}
                                  />
                                ) : (
                                  <span className="text-[#d4af37]/40 select-none text-xs font-mono">│</span>
                                )}
                              </td>
                              <td className={`w-[170px] px-1 xl:px-2 ${cellPadding}`}>
                                <div 
                                  className="flex flex-col" 
                                  style={{ paddingLeft: `${row.depth * 1.25}rem` }}
                                >
                                  <div className={`flex items-center flex-wrap ${isCompact ? "gap-1" : "gap-1.5"}`}>
                                    {isChild && (
                                      <span className="text-[#d4af37]/60 font-mono select-none">└─</span>
                                    )}
                                    <span className={`font-bold text-black ${isCompact ? "text-[13px]" : "text-[15px]"}`}>
                                      {row.materialGoodsCode || row.materialCode}
                                    </span>

                                    {rowItemType && rowItemType !== "UNKNOWN" && (
                                      <span
                                        className={`rounded-[2px] border px-1.5 py-0.2 text-[9px] font-bold uppercase tracking-wider ${
                                          rowItemType === "WIP"
                                            ? "border-black/50 bg-[#d4af37]/20 text-black"
                                            : "border-black/50 bg-gray-100 text-black"
                                        }`}
                                      >
                                        {rowItemType}
                                      </span>
                                    )}
                                    {rowItemType === "WIP" && (
                                      <button
                                        type="button"
                                        onClick={() => toggleWipExpand(row.materialCode)}
                                        className="p-1 hover:bg-[#102C57]/5 rounded-[2px] text-[#d4af37] transition shrink-0 no-print"
                                        title={expandedWipCodes.has(row.materialCode) ? "ยุบสูตรย่อย" : "ขยายสูตรย่อย"}
                                      >
                                        {expandedWipCodes.has(row.materialCode) ? (
                                          <ChevronDown size={isCompact ? 11 : 13} />
                                        ) : (
                                          <ChevronRight size={isCompact ? 11 : 13} />
                                        )}
                                      </button>
                                    )}
                                    {rowItemType === "WIP" && !isReadOnly && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setAddingToProductCode(row.materialCode);
                                          updateUiState({ isMaterialPickerOpen: true });
                                        }}
                                        className="inline-flex h-4.5 w-4.5 items-center justify-center rounded-[2px] border border-[#d4af37]/40 bg-white text-[#102C57] hover:bg-[#102C57]/5 transition-colors shrink-0 no-print"
                                        title={`เพิ่มวัตถุดิบลงในสูตรของ WIP (${row.materialCode})`}
                                      >
                                        <Plus size={isCompact ? 9 : 11} className="text-[#d4af37]" />
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className={`w-[370px] px-1 xl:px-2 ${cellPadding}`}>
                                <div className="flex flex-col justify-center min-h-[28px]">
                                  <div className={`flex items-center flex-wrap ${isCompact ? "gap-1 leading-tight" : "gap-2 mt-0.5"} text-black font-bold`}>
                                    <span className={`truncate max-w-[300px] xl:max-w-[360px] ${isCompact ? "text-[13px]" : "text-[15px]"}`} title={row.materialName}>
                                      {row.materialName}
                                    </span>
                                  </div>
                                </div>
                              </td>
                              <td className={`w-[90px] px-1 xl:px-2 ${cellPadding} tabular-nums text-center`}>
                                <label className="sr-only" htmlFor={`${row.id}-qty`}>
                                  จำนวน
                                </label>
                                <input
                                  id={`${row.id}-qty`}
                                  name={`${row.id}-qty`}
                                  type="number"
                                  inputMode="decimal"
                                  min="0"
                                  step="0.0001"
                                  value={displayQty === "" ? "" : displayQty}
                                  onChange={(event) => {
                                    if (!isEditableRow) return;
                                    const raw = event.target.value;
                                    if (raw === "") {
                                      handleRowChange(row.id, "qty", "");
                                      return;
                                    }
                                    const next = Number(raw);
                                    handleRowChange(
                                      row.id,
                                      "qty",
                                      Number.isFinite(next) ? next : ""
                                    );
                                  }}
                                  onBlur={(event) => {
                                    if (!isEditableRow) return;
                                    if (event.target.value !== "") return;
                                    handleRowChange(row.id, "qty", 0);
                                  }}
                                  disabled={!isEditableRow || editingRowId !== row.id}
                                  className={`w-full min-w-0 rounded-[2px] border border-gray-300 disabled:border-transparent bg-white text-black font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37] focus-visible:ring-offset-2 disabled:bg-transparent disabled:text-black ${isCompact ? "px-1.5 py-0.5 text-[13px] h-7" : "px-2 py-1 text-[15px] h-9"}`}
                                  autoComplete="off"
                                />
                              </td>
                              <td className={`w-[90px] px-1 xl:px-2 ${cellPadding} text-black font-bold text-center ${isCompact ? "text-[13px]" : "text-[15px]"}`}>
                                {rowUnit}
                              </td>
                              <td className={`w-[310px] px-1 xl:px-2 ${cellPadding} text-center`}>
                                <div className="flex items-center gap-1 justify-center">
                                  <label className="sr-only" htmlFor={`${row.id}-calc-basis`}>
                                    ฐานคำนวณ
                                  </label>
                                  <select
                                    id={`${row.id}-calc-basis`}
                                    name={`${row.id}-calc-basis`}
                                    value={row.calculationBasis || "JOB_QTY"}
                                    onChange={(event) =>
                                      handleRowChange(row.id, "calculationBasis", event.target.value)
                                    }
                                    disabled={!isEditableRow || editingRowId !== row.id}
                                    className={`rounded-[2px] border border-gray-300 disabled:border-transparent bg-white font-bold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37] focus-visible:ring-offset-2 disabled:bg-transparent disabled:text-black shrink-0 ${
                                      isCompact 
                                        ? "px-1 py-0.5 text-[13px] h-7 w-[130px]" 
                                        : "px-2 py-1 text-[15px] h-9 w-[155px]"
                                    }`}
                                  >
                                    <option value="JOB_QTY">อิงจำนวนงาน</option>
                                    <option value="HEADCOUNT">อิงจำนวนคน</option>
                                    <option value="MACHINE_COUNT">อิงจำนวนเครื่อง</option>
                                    <option value="DOUGH_SET_COUNT">อิงจำนวนชุดแป้ง</option>
                                  </select>
                                  {(
                                    row.calculationBasis === "HEADCOUNT"
                                    || row.calculationBasis === "MACHINE_COUNT"
                                    || row.calculationBasis === "DOUGH_SET_COUNT"
                                  ) && (
                                    <>
                                      <input
                                        type="number"
                                        min="0.0001"
                                        step="0.0001"
                                        value={
                                          row.calculationBasis === "MACHINE_COUNT"
                                            ? (row.machineBase ?? 1)
                                            : row.calculationBasis === "DOUGH_SET_COUNT"
                                              ? (row.doughSetBase ?? 1)
                                              : (row.headcountBase ?? 1)
                                        }
                                        onChange={(event) =>
                                          handleRowChange(
                                            row.id,
                                            row.calculationBasis === "MACHINE_COUNT"
                                              ? "machineBase"
                                              : row.calculationBasis === "DOUGH_SET_COUNT"
                                                ? "doughSetBase"
                                                : "headcountBase",
                                            event.target.value
                                          )
                                        }
                                        disabled={!isEditableRow || editingRowId !== row.id}
                                        className={`rounded-sm border border-gray-300 disabled:border-transparent bg-white text-black font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37] focus-visible:ring-offset-2 disabled:bg-transparent disabled:text-black shrink-0 ${
                                          isCompact 
                                            ? "px-1 py-0.5 text-[12px] h-7 w-[50px]" 
                                            : "px-2 py-1 text-[13px] h-9 w-[60px]"
                                        }`}
                                        placeholder={
                                          row.calculationBasis === "MACHINE_COUNT"
                                            ? "เครื่อง"
                                            : row.calculationBasis === "DOUGH_SET_COUNT"
                                              ? "ชุดแป้ง"
                                              : "คน"
                                        }
                                      />
                                      <select
                                        value={
                                          row.calculationBasis === "MACHINE_COUNT"
                                            ? (row.machineRoundMode || "NONE")
                                            : row.calculationBasis === "DOUGH_SET_COUNT"
                                              ? (row.doughSetRoundMode || "NONE")
                                              : (row.headcountRoundMode || "NONE")
                                        }
                                        onChange={(event) =>
                                          handleRowChange(
                                            row.id,
                                            row.calculationBasis === "MACHINE_COUNT"
                                              ? "machineRoundMode"
                                              : row.calculationBasis === "DOUGH_SET_COUNT"
                                                ? "doughSetRoundMode"
                                                : "headcountRoundMode",
                                            event.target.value
                                          )
                                        }
                                        disabled={!isEditableRow || editingRowId !== row.id}
                                        className={`rounded-sm border border-gray-300 disabled:border-transparent bg-white text-black font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37] focus-visible:ring-offset-2 disabled:bg-transparent disabled:text-black shrink-0 ${
                                          isCompact 
                                            ? "px-1 py-0.5 text-[12px] h-7 w-[65px]" 
                                            : "px-2 py-1 text-[13px] h-9 w-[75px]"
                                        }`}
                                      >
                                        <option value="NONE">ไม่ปัด</option>
                                        <option value="UP">ปัดขึ้น</option>
                                        <option value="DOWN">ปัดลง</option>
                                        <option value="NEAREST">ปัดปกติ</option>
                                      </select>
                                    </>
                                  )}
                                </div>
                              </td>
                              <td className={`px-1 xl:px-2 ${cellPadding} print-capture-hidden`}>
                                {rowItemType === BOM_ITEM_TYPES.WIP ? (
                                  <div className={isCompact ? "space-y-0.5" : "space-y-1"}>
                                    <label
                                      className="sr-only"
                                      htmlFor={`${row.id}-planning-offset`}
                                    >
                                      วันผลิต WIP
                                    </label>
                                    <select
                                      id={`${row.id}-planning-offset`}
                                      name={`${row.id}-planning-offset`}
                                      value={normalizePlanningOffsetDays(row.planningOffsetDays, 0)}
                                      onChange={(event) =>
                                        handleRowChange(
                                          row.id,
                                          "planningOffsetDays",
                                          normalizePlanningOffsetDays(event.target.value, 0)
                                        )
                                      }
                                      disabled={!isEditableRow || editingRowId !== row.id}
                                      className={`w-full rounded-[2px] border border-[#d4af37]/40 disabled:border-transparent bg-white font-bold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37] focus-visible:ring-offset-2 disabled:bg-transparent disabled:text-black ${isCompact ? "px-1.5 py-0.5 text-[13px] h-7" : "px-2 py-1 text-[15px] h-9"}`}
                                    >
                                      {PLANNING_OFFSET_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>
                                          {option.label}
                                        </option>
                                      ))}
                                    </select>
                                    <p className={`${isCompact ? "text-[11px]" : "text-[12px]"} text-black font-bold mt-0.5 leading-none`}>
                                      {getPlanningOffsetLabel(row.planningOffsetDays)}
                                    </p>
                                  </div>
                                ) : (
                                  <span className={`inline-flex rounded-[2px] border border-black/15 bg-transparent font-bold text-black leading-none ${isCompact ? "px-1.5 py-1 text-[12px]" : "px-2 py-1.5 text-[14px]"}`}>
                                    {getRawPlanningDateLabel(selectedProductType)}
                                  </span>
                                )}
                              </td>
                              <td className={`px-1 xl:px-2 ${cellPadding} no-print`}>
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateEditorState((prev) => ({
                                        editingRowId: prev.editingRowId === row.id ? "" : row.id
                                      }))
                                    }
                                    disabled={!isEditableRow}
                                    className={`inline-flex items-center justify-center bg-transparent transition-all duration-300 hover:scale-115 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${isCompact ? "h-7 w-7" : "h-8 w-8"} ${editingRowId === row.id ? "text-emerald-600 hover:text-emerald-700 rotate-180" : "text-[#102C57] hover:text-[#d4af37]"}`}
                                    aria-label="แก้ไขรายการ"
                                  >
                                    {editingRowId === row.id ? (
                                       <Check className={isCompact ? "h-4 w-4" : "h-5 w-5"} aria-hidden="true" />
                                     ) : (
                                       <Pencil className={isCompact ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden="true" />
                                     )}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteRow(row.id)}
                                    disabled={!isEditableRow}
                                    className={`inline-flex items-center justify-center bg-transparent text-rose-700 transition-colors duration-200 hover:text-rose-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${isCompact ? "h-7 w-7" : "h-8 w-8"}`}
                                    aria-label="ลบรายการ"
                                  >
                                    <Trash2 className={isCompact ? "h-3.5 w-3.5" : "h-4 w-4"} aria-hidden="true" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                            );
                          })}
                          {flattenedTreeRows.length === 0 && (
                            <tr>
                              <td
                                colSpan={8}
                                className="px-4 py-8 text-center text-sm text-gray-500"
                              >
                                ยังไม่มีสูตรสำหรับสินค้านี้
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-4 rounded-2xl border border-gray-200 bg-[#f8fafc] p-4 no-print">
                      <label
                        htmlFor="version-note"
                        className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500"
                      >
                        บันทึกโน้ตเวอร์ชันใหม่
                      </label>
                      <div className="mt-2 grid gap-3 lg:grid-cols-[1fr_auto]">
                        <input
                          id="version-note"
                          name="version-note"
                          value={note}
                          onChange={(event) => updateUiState({ note: event.target.value })}
                          disabled={isReadOnly}
                          className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-[#102C57] placeholder:text-gray-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37] focus-visible:ring-offset-2"
                          placeholder="อธิบายสิ่งที่เปลี่ยน…"
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          disabled={isReadOnly}
                          className="inline-flex items-center justify-center gap-2 rounded-full border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-[#102C57] transition-colors duration-200 hover:border-[#cbd5f5] hover:text-[#0a2345] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37] focus-visible:ring-offset-2 touch-manipulation"
                        >
                          <ChevronRight aria-hidden="true" className="h-4 w-4" />
                          เตรียมสร้างเวอร์ชัน
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#102C57]">
                          เวอร์ชันย้อนหลัง
                        </p>
                        <p className="text-xs text-gray-500">
                          ดูว่าใครแก้ไขอะไร และ diff แบบอ่านง่าย
                        </p>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="rounded-full border border-gray-200 bg-white px-2 py-1 font-semibold">
                          {versions.length} เวอร์ชัน
                        </span>
                      </div>
                    </div>

                    <div className="mt-4 grid gap-4 lg:grid-cols-[260px_1fr]">
                      <div className="space-y-2">
                        {versions.map((version) => {
                          const isActive = version.id === selectedVersionId;
                          const badgeStyle =
                            STATUS_BADGE_STYLES[version.status] ||
                            "border-gray-200 bg-gray-50 text-gray-600";
                          const shortNote = truncateText(version.note, 70);
                          return (
                            <button
                              key={version.id}
                              type="button"
                              onClick={() => setSelectedVersionId(version.id)}
                              className={`w-full rounded-2xl border px-4 py-3 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37] focus-visible:ring-offset-2 touch-manipulation ${isActive
                                ? "border-[#102C57] bg-[#102C57] text-white"
                                : "border-[#e2e8f0] bg-[#f8fafc] text-[#102C57] hover:bg-[#e2e8f0]"
                                }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold">
                                    {version.version}
                                  </span>
                                  <span
                                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${isActive
                                      ? "border-white/40 text-white/80"
                                      : badgeStyle
                                      }`}
                                  >
                                    {version.status}
                                  </span>
                                </div>
                                <span
                                  className={`text-xs ${isActive ? "text-white/70" : "text-gray-500"
                                    }`}
                                >
                                  {formatDate(version.updatedAt)}
                                </span>
                              </div>
                              <p
                                className={`mt-1 text-xs ${isActive ? "text-white/80" : "text-gray-600"
                                  }`}
                                title={version.note}
                              >
                                {shortNote || "-"}
                              </p>
                            </button>
                          );
                        })}
                        {versions.length === 0 && (
                          <div className="rounded-2xl border border-dashed border-[#e2e8f0] px-4 py-6 text-center text-sm text-gray-500">
                            ไม่มีประวัติการแก้ไข
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border border-gray-200 bg-[#f8fafc] p-4">
                        {versionDetail ? (
                          <div className="space-y-4">
                            <div>
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                                    รายละเอียดเวอร์ชัน
                                  </p>
                                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#102C57]">
                                    <span className="rounded-full bg-white px-3 py-1 font-semibold">
                                      {versionDetail.version}
                                    </span>
                                    <span
                                      className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${STATUS_BADGE_STYLES[versionDetail.status] || "border-gray-200 bg-gray-50 text-gray-600"
                                        }`}
                                    >
                                      {versionDetail.status}
                                    </span>
                                    <span className="rounded-full border border-[#d4af37]/40 bg-[#d4af37]/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#8a6d1f]">
                                      {isSelectedProductFg || (isSelectedProductWip && versionDetail.wipQtyInputMode !== WIP_QTY_INPUT_MODES.BATCH)
                                        ? `ฐานสูตร ${NUMBER_FORMAT.format(Number(versionDetail.baseOutputBoxes || 1))} ${selectedProductUnit}`
                                        : `ฐานสูตร ${NUMBER_FORMAT.format(Number(versionDetail.baseBatch || 1))} batch = ${NUMBER_FORMAT.format(Number(versionDetail.baseOutputBoxes || 1))} ${selectedProductUnit}`}
                                    </span>
                                    {isSelectedProductWip && (
                                      <span className="rounded-full border border-[#102C57]/20 bg-[#102C57]/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#102C57]">
                                        โหมดกรอก: {versionDetail.wipQtyInputMode === WIP_QTY_INPUT_MODES.BATCH ? "ชุด" : "หน่วย"}
                                      </span>
                                    )}
                                    <span className="inline-flex items-center gap-2 text-xs text-gray-600">
                                      <User aria-hidden="true" className="h-3 w-3" />
                                      {versionDetail.updatedBy}
                                    </span>
                                    <span className="text-xs text-gray-600">
                                      {formatDate(versionDetail.updatedAt)}
                                    </span>
                                  </div>
                                  {versionDetail?.id === activeVersionId && (
                                    <span className="mt-2 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[10px] font-semibold text-emerald-700">
                                      เวอร์ชันที่ใช้งาน
                                    </span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => handleRevertVersion(versionDetail)}
                                    disabled={
                                      isReadOnly ||
                                      isVersionActionLoading ||
                                      versionDetail?.status === "rejected"
                                    }
                                    title={
                                      versionDetail?.status === "rejected"
                                        ? "เวอร์ชันนี้ถูกปฏิเสธและไม่สามารถย้อนกลับได้"
                                        : undefined
                                    }
                                    className="rounded-full border border-gray-200 bg-white px-3 py-2 text-[11px] font-semibold text-[#102C57] transition-colors duration-200 hover:border-[#d4af37] hover:text-[#0a2345] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    ย้อนกลับเวอร์ชันนี้
                                  </button>
                                </div>
                              </div>
                              <div className="mt-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-[#5b6b7a]">
                                {versionDetail.note || "-"}
                              </div>
                            </div>

                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                                สิ่งที่เปลี่ยน
                              </p>
                              {versionDetail.changes.length > 0 ? (
                                <div className="mt-2 max-h-32 overflow-y-auto pr-2">
                                  <ul className="space-y-2 text-sm text-[#102C57]">
                                    {versionDetail.changes.map((item) => (
                                      <li
                                        key={item}
                                        className="flex items-start gap-2"
                                      >
                                        <span className="mt-1 h-2 w-2 rounded-full bg-[#d4af37]" />
                                        <span title={item}>
                                          {truncateText(item, 90)}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              ) : (
                                <p className="mt-2 text-xs text-gray-500">
                                  ไม่มีการเปลี่ยนแปลง
                                </p>
                              )}
                            </div>

                            <div>
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
                                  Diff Center
                                </p>
                                <div className="flex flex-wrap items-center gap-2 text-[10px] font-semibold">
                                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">
                                    เพิ่มใหม่ {versionDetail.diff.added.length}
                                  </span>
                                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-amber-700">
                                    ปรับปรุง {versionDetail.diff.updated.length}
                                  </span>
                                  <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-rose-700">
                                    ลบออก {versionDetail.diff.removed.length}
                                  </span>
                                </div>
                              </div>
                              <div className="mt-3 rounded-2xl border border-gray-200 bg-white p-4">
                                <div className="flex flex-wrap items-center gap-2">
                                  {[
                                    { id: "added", label: "เพิ่มใหม่" },
                                    { id: "updated", label: "ปรับปรุง" },
                                    { id: "removed", label: "ลบออก" },
                                  ].map((tab) => (
                                    <button
                                      key={tab.id}
                                      type="button"
                                      onClick={() => updateNotificationState({ activeDiffTab: tab.id })}
                                      className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors duration-200 ${activeDiffTab === tab.id
                                        ? "bg-[#102C57] text-white"
                                        : "bg-[#f1f5f9] text-[#102C57] hover:bg-[#e2e8f0]"
                                        }`}
                                    >
                                      {tab.label}
                                    </button>
                                  ))}
                                </div>
                                <div className="mt-3 max-h-64 overflow-y-auto pr-2">
                                  {(() => {
                                    const diffItems =
                                      activeDiffTab === "added"
                                        ? versionDetail.diff.added
                                        : activeDiffTab === "removed"
                                          ? versionDetail.diff.removed
                                          : versionDetail.diff.updated;
                                    if (!diffItems.length) {
                                      return (
                                        <p className="text-xs text-gray-500">
                                          ไม่มีรายการในหมวดนี้
                                        </p>
                                      );
                                    }
                                    return (
                                      <div className="grid gap-2">
                                        {diffItems.map((item) => (
                                          <div
                                            key={item.label}
                                            className="rounded-xl border border-gray-200 bg-[#f8fafc] px-3 py-2 text-xs text-[#102C57]"
                                          >
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="font-semibold">
                                                {truncateText(item.label, 64)}
                                              </span>
                                              {activeDiffTab === "updated" ? (
                                                <span className="text-[10px] text-amber-700">
                                                  {truncateText(item.before, 22)} {"→"} {truncateText(item.after, 22)}
                                                </span>
                                              ) : (
                                                <span className="text-[10px] text-gray-500">
                                                  {truncateText(item.after || item.before, 26)}
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-[#e2e8f0] px-4 py-6 text-center text-sm text-gray-500">
                            เลือกเวอร์ชันเพื่อดูรายละเอียด
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

              </div>
            )}
          </div>
          {hasSelection && isEditorTab && !isReadOnly && (
            <div
              className="fixed bottom-20 left-1/2 z-[70] w-[calc(100%-2rem)] max-w-[780px] -translate-x-1/2 rounded-[4px] border border-[#d4af37]/70 bg-[#0b2141]/[0.98] p-2.5 text-white shadow-[0_18px_55px_rgba(2,6,23,0.38)] backdrop-blur lg:bottom-6 no-print"
              role="toolbar"
              aria-label="จัดการรายการ BOM ที่เลือก"
            >
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex h-9 shrink-0 items-center gap-2 border-r border-white/15 pr-3">
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-[2px] bg-[#d4af37] px-1.5 text-xs font-black text-[#102C57]">
                    {selectedRows.size}
                  </span>
                  <span className="text-xs font-bold">รายการที่เลือก</span>
                </div>

                <select
                  value={bulkActionState.action}
                  onChange={(event) => setBulkActionState((prev) => ({
                    ...prev,
                    action: event.target.value,
                  }))}
                  className="h-9 rounded-[2px] border border-white/20 bg-white px-2 text-xs font-bold text-[#102C57] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]"
                  aria-label="เลือกคำสั่งแบบกลุ่ม"
                >
                  <option value="edit">เปลี่ยนฐานคำนวณและค่าฐาน</option>
                  <option value="delete">ลบรายการที่เลือก</option>
                </select>

                {bulkActionState.action === "edit" ? (
                  <>
                    <select
                      value={bulkActionState.calculationBasis}
                      onChange={(event) => setBulkActionState((prev) => ({
                        ...prev,
                        calculationBasis: event.target.value,
                      }))}
                      className="h-9 min-w-[145px] rounded-[2px] border border-white/20 bg-white px-2 text-xs font-bold text-[#102C57] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]"
                      aria-label="ฐานคำนวณสำหรับรายการที่เลือก"
                    >
                      <option value="JOB_QTY">อิงจำนวนงาน</option>
                      <option value="HEADCOUNT">อิงจำนวนคน</option>
                      <option value="MACHINE_COUNT">อิงจำนวนเครื่อง</option>
                      <option value="DOUGH_SET_COUNT">อิงจำนวนชุดแป้ง</option>
                    </select>
                    {bulkActionState.calculationBasis !== "JOB_QTY" && (
                    <label className="relative block">
                      <span className="sr-only">ค่าฐานสำหรับรายการที่เลือก</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        min="0.0001"
                        step="0.0001"
                        value={bulkActionState.baseValue}
                        onChange={(event) => setBulkActionState((prev) => ({
                          ...prev,
                          baseValue: event.target.value,
                        }))}
                        placeholder="ค่าฐาน"
                        className="h-9 w-24 rounded-[2px] border border-white/20 bg-white px-2 text-xs font-bold text-[#102C57] placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]"
                      />
                    </label>
                    )}
                    <button
                      type="button"
                      onClick={handleBulkApply}
                      disabled={
                        bulkActionState.calculationBasis !== "JOB_QTY"
                        && (!Number.isFinite(Number(bulkActionState.baseValue)) || Number(bulkActionState.baseValue) <= 0)
                      }
                      className="inline-flex h-9 items-center gap-1.5 rounded-[2px] bg-[#d4af37] px-3 text-xs font-black text-[#102C57] transition-colors hover:bg-[#e3c45c] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <Check size={14} />
                      นำไปใช้
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={handleBulkDelete}
                    className="inline-flex h-9 items-center gap-1.5 rounded-[2px] bg-rose-600 px-3 text-xs font-black text-white transition-colors hover:bg-rose-500"
                  >
                    <Trash2 size={14} />
                    ลบ {selectedRows.size} รายการ
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => updateSelectionState({ selectedRows: new Set() })}
                  className="ml-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[2px] border border-white/20 text-white/75 transition-colors hover:bg-white/10 hover:text-white"
                  aria-label="ยกเลิกการเลือกทั้งหมด"
                  title="ยกเลิกการเลือก"
                >
                  <X size={15} />
                </button>
              </div>
            </div>
          )}

          <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white/95 px-4 py-3 shadow-[0_-12px_30px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden no-print">
            <div className="mx-auto flex w-full max-w-[95%] items-center gap-2">
              {!isReadOnly && (
                <button
                  type="button"
                  onClick={handleOpenCloneDrawer}
                  disabled={!selectedProductCode}
                  className="flex-1 rounded-[2px] border border-[#d4af37] bg-white px-2 py-2 text-[11px] font-bold text-[#102C57] transition-colors duration-200 hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Copy className="mr-1 inline-block h-3.5 w-3.5 text-[#d4af37]" />
                  คัดลอกจากสินค้าอื่น
                </button>
              )}
              <button
                type="button"
                onClick={handleSaveVersion}
                disabled={isReadOnly || isLoadingBom || !selectedProductCode}
                className="flex-1 rounded-[2px] bg-[#d4af37] px-2 py-2 text-[11px] font-bold text-[#102C57] transition-colors duration-200 hover:bg-[#b5952f] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
              >
                {isLoadingBom ? "กำลังบันทึก..." : "บันทึกสูตร"}
              </button>
            </div>
          </div>
        </div >
      </div >

      {isProductDrawerOpen && (
        <div className="fixed inset-0 z-[9999] flex justify-end bg-[#07111f]/55 backdrop-blur-[2px] no-print">
          <button
            type="button"
            aria-label="ปิดตัวเลือกสินค้า"
            className="hidden flex-1 cursor-default lg:block"
            onClick={() => setIsProductDrawerOpen(false)}
          />
          <aside className="flex h-full w-full max-w-[840px] flex-col border-l border-[#d4af37]/40 bg-white shadow-[-24px_0_60px_rgba(2,6,23,0.25)]">
            <div className="border-b border-[#d4af37]/35 bg-[#102C57] px-5 py-4 text-white">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#d4af37]">
                    BOM Product Selector
                  </p>
                  <h2 className="mt-1 text-lg font-bold">เลือกรายการสินค้า</h2>
                  <p className="mt-1 text-xs font-medium text-white/70">
                    เลือกสินค้า FG หรือ WIP เพื่อดูและแก้ไขสูตรผลิต
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsProductDrawerOpen(false)}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] border border-[#d4af37]/40 text-[#d4af37] transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d4af37]"
                  aria-label="ปิดตัวเลือกสินค้า"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto]">
                <label className="relative block">
                  <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#102C57]/55" />
                  <input
                    value={searchTerm}
                    onChange={(event) => updateFilterState({ searchTerm: event.target.value })}
                    placeholder="ค้นหารหัสสินค้า หรือชื่อสินค้า"
                    className="h-10 w-full rounded-[2px] border border-[#d4af37]/35 bg-white pl-9 pr-3 text-sm font-semibold text-[#102C57] placeholder:text-[#64748b] focus:border-[#d4af37] focus:outline-none focus:ring-1 focus:ring-[#d4af37]"
                    autoComplete="off"
                  />
                </label>
                <div className="flex items-center gap-2 rounded-[2px] border border-[#d4af37]/30 bg-white/10 px-3 text-xs font-bold text-white">
                  <ListFilter className="h-4 w-4 text-[#d4af37]" />
                  {productList.length.toLocaleString()} รายการ
                </div>
              </div>
            </div>

            <div className="grid gap-3 border-b border-gray-200 bg-[#f8fafc] px-5 py-3 sm:grid-cols-2">
              <select
                value={categoryFilter}
                onChange={(event) => updateFilterState({ categoryFilter: event.target.value })}
                className="h-9 rounded-[2px] border border-gray-200 bg-white px-3 text-xs font-semibold text-[#102C57] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d4af37]"
                aria-label="กรองหมวดสินค้า"
              >
                <option value="all">หมวดสินค้าทั้งหมด</option>
                {productCategoryOptions.map((category) => (
                  <option key={category.value} value={category.value}>
                    {category.label}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(event) => updateFilterState({ statusFilter: event.target.value })}
                className="h-9 rounded-[2px] border border-gray-200 bg-white px-3 text-xs font-semibold text-[#102C57] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d4af37]"
                aria-label="กรองสถานะสูตร"
              >
                <option value="all">สถานะสูตรทั้งหมด</option>
                <option value="draft">ร่าง</option>
                <option value="pending_review">รอตรวจ</option>
                <option value="approved">อนุมัติแล้ว</option>
                <option value="rejected">ไม่อนุมัติ</option>
              </select>
            </div>

            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full table-fixed border-collapse text-sm">
                <thead className="sticky top-0 z-10 bg-[#102C57] text-left text-[11px] font-bold uppercase tracking-[0.08em] text-[#d4af37]">
                  <tr>
                    <th className="w-[72px] px-4 py-3 text-center">ลำดับ</th>
                    <th className="w-[140px] px-4 py-3">รหัสสินค้า</th>
                    <th className="px-4 py-3">ชื่อสินค้า</th>
                    <th className="w-[110px] px-4 py-3">หน่วย</th>
                    <th className="w-[120px] px-4 py-3 text-center">สถานะ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {productList.map((product, productIndex) => {
                    const isActive = product.code === drawerSelectedProductCode;
                    const productStatus = dataState.bomStatusByProduct[product.code] || "draft";
                    return (
                      <tr
                        key={product.code}
                        onClick={() => setDrawerSelectedProductCode(product.code)}
                        onDoubleClick={() => handleSelectProduct(product)}
                        className={`cursor-pointer transition-colors ${
                          isActive ? "bg-[#fff7db]" : "bg-white hover:bg-[#f8fafc]"
                        }`}
                      >
                        <td className="px-4 py-3 text-center align-middle text-xs font-bold text-[#102C57]">
                          {productIndex + 1}
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <div className="flex items-center gap-2">
                            <span className={`h-2 w-2 rounded-full ${isActive ? "bg-[#d4af37]" : "bg-gray-300"}`} />
                            <span className="font-bold text-[#102C57]">{product.code}</span>
                          </div>
                          <div className="mt-1 text-[10px] font-semibold text-gray-500">
                            {product.category || "-"}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-middle">
                          <div className="truncate font-semibold text-[#102C57]" title={product.name}>
                            {product.name || "-"}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-middle text-xs font-bold text-[#102C57]">
                          {product.unit || "-"}
                        </td>
                        <td className="px-4 py-3 text-center align-middle">
                          <span className={`inline-flex min-w-[86px] justify-center rounded-[2px] border px-2 py-1 text-[11px] font-bold ${
                            STATUS_BADGE_STYLES[productStatus] || "border-gray-200 bg-gray-50 text-gray-600"
                          }`}>
                            {PRODUCT_STATUS_LABELS[productStatus] || productStatus}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {isLoadingProducts && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm font-semibold text-gray-500">
                        กำลังโหลดรายการสินค้า...
                      </td>
                    </tr>
                  )}
                  {!isLoadingProducts && productList.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm font-semibold text-gray-500">
                        ไม่พบสินค้า
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="border-t border-gray-200 bg-white px-5 py-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 text-xs text-gray-500">
                  <span className="font-bold text-[#102C57]">
                    {selectedDrawerProduct?.code || "-"}
                  </span>
                  <span className="mx-2 text-gray-300">/</span>
                  <span className="truncate">
                    {selectedDrawerProduct?.name || "ยังไม่ได้เลือกสินค้า"}
                  </span>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => setIsProductDrawerOpen(false)}
                    className="h-9 rounded-[2px] border border-gray-300 bg-white px-4 text-xs font-bold text-[#102C57] transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d4af37]"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    disabled={!selectedDrawerProduct}
                    onClick={() => handleSelectProduct(selectedDrawerProduct)}
                    className="inline-flex h-9 items-center gap-2 rounded-[2px] bg-[#d4af37] px-4 text-xs font-bold text-[#102C57] transition-colors hover:bg-[#c19b2d] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d4af37] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Check className="h-4 w-4" />
                    เลือกสินค้า
                  </button>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Material Selection Drawer */}
      <MaterialSelectionDrawer
        isOpen={uiState.isMaterialPickerOpen}
        onClose={() => {
          updateUiState({ isMaterialPickerOpen: false });
          setAddingToProductCode(null);
        }}
        materials={dataState.materials}
        existingMaterialCodes={new Set(activeProductRowsForAdding.map(row => row.materialCode))}
        existingMaterialKeys={new Set(activeProductRowsForAdding.map((row) => getBomMaterialVariantKey(row)))}
        allowedComponentTypes={allowedDrawerComponentTypes}
        initialComponentType={allowedDrawerComponentTypes[0] || "RAW"}
        onConfirm={(items) => {
          handleBatchAddMaterials(items);
          updateUiState({ isMaterialPickerOpen: false });
          setAddingToProductCode(null);
        }}
      />
      <MultiProductImportPreviewModal
        isOpen={importState.isModalOpen}
        preview={importState.preview}
        mode={importState.mode}
        strategy={importState.strategy}
        onModeChange={(mode) => setImportState((prev) => ({ ...prev, mode }))}
        onStrategyChange={(strategy) => setImportState((prev) => ({ ...prev, strategy }))}
        onConfirm={handleConfirmImport}
        onClose={() => setImportState((prev) => ({ ...prev, isModalOpen: false }))}
        isSubmitting={importState.isSubmitting}
      />
      {formulaRenameState.isOpen && (
        <div className="fixed inset-0 z-[10020] flex items-center justify-center bg-[#07111f]/65 p-4 backdrop-blur-[2px] no-print">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void handleRenameFormula();
            }}
            className="w-full max-w-md overflow-hidden rounded-[4px] border border-[#d4af37]/45 bg-white shadow-2xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="rename-formula-title"
          >
            <div className="flex items-start justify-between gap-3 bg-[#102C57] px-5 py-4 text-white">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#d4af37]">
                  Formula management
                </p>
                <h3 id="rename-formula-title" className="mt-1 text-lg font-bold">
                  แก้ไขชื่อสูตร
                </h3>
                <p className="mt-1 text-xs text-white/65">
                  รหัส {normalizeFormulaCode(selectedFormulaCode)} จะยังคงเดิม
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFormulaRenameState({
                  isOpen: false,
                  formulaName: "",
                  isSaving: false,
                  error: "",
                })}
                disabled={formulaRenameState.isSaving}
                className="inline-flex h-8 w-8 items-center justify-center rounded-[2px] border border-white/20 text-white/75 hover:bg-white/10 hover:text-white disabled:opacity-40"
                aria-label="ปิดหน้าต่างแก้ชื่อสูตร"
              >
                <X size={15} />
              </button>
            </div>
            <div className="space-y-3 px-5 py-5">
              <label className="block">
                <span className="mb-1.5 block text-xs font-bold text-[#102C57]">ชื่อสูตรใหม่</span>
                <input
                  autoFocus
                  type="text"
                  value={formulaRenameState.formulaName}
                  onChange={(event) => setFormulaRenameState((prev) => ({
                    ...prev,
                    formulaName: event.target.value,
                    error: "",
                  }))}
                  maxLength={120}
                  className="h-10 w-full rounded-[2px] border border-slate-300 px-3 text-sm font-semibold text-[#102C57] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#d4af37]"
                  placeholder="ชื่อสูตร"
                />
              </label>
              {formulaRenameState.error && (
                <p className="rounded-[2px] border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">
                  {formulaRenameState.error}
                </p>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <button
                type="button"
                onClick={() => setFormulaRenameState({
                  isOpen: false,
                  formulaName: "",
                  isSaving: false,
                  error: "",
                })}
                disabled={formulaRenameState.isSaving}
                className="h-9 rounded-[2px] border border-slate-300 bg-white px-4 text-xs font-bold text-[#102C57] hover:bg-slate-50 disabled:opacity-40"
              >
                ยกเลิก
              </button>
              <button
                type="submit"
                disabled={!formulaRenameState.formulaName.trim() || formulaRenameState.isSaving}
                className="inline-flex h-9 items-center gap-1.5 rounded-[2px] bg-[#d4af37] px-4 text-xs font-black text-[#102C57] hover:bg-[#e3c45c] disabled:opacity-40"
              >
                <Save size={14} />
                {formulaRenameState.isSaving ? "กำลังบันทึก..." : "บันทึกชื่อสูตร"}
              </button>
            </div>
          </form>
        </div>
      )}

      {formulaModalState.isOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-[#07111f]/55 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-[2px] border border-[#d4af37]/35 bg-gradient-to-b from-[#102C57] to-[#0b2141] shadow-[0_24px_60px_rgba(2,6,23,0.45)]">
            <div className="flex items-start justify-between border-b border-[#d4af37]/25 px-5 py-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#d4af37]/80">
                  Formula Setup
                </p>
                <h3 className="mt-1 text-lg font-bold text-white">เพิ่มสูตรการผลิต</h3>
                <p className="text-xs text-white/70">กำหนดรายละเอียดรหัสและชื่อสูตรให้เรียบร้อยก่อนบันทึก</p>
              </div>
              <button
                type="button"
                onClick={closeFormulaModal}
                className="rounded-full border border-[#d4af37]/30 p-1.5 text-[#d4af37] transition-colors hover:bg-white/10"
                aria-label="ปิดหน้าต่างเพิ่มสูตร"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div className="grid grid-cols-1 gap-4">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d4af37]/85">
                    รหัสสูตร
                  </span>
                  <input
                    value={formulaModalState.formulaCode}
                    onChange={(event) =>
                      setFormulaModalState((prev) => ({
                        ...prev,
                        formulaCode: event.target.value.toUpperCase(),
                        error: "",
                      }))
                    }
                    placeholder="เช่น F2 หรือ ALT-A"
                    className="h-11 w-full rounded-[2px] border border-[#284871] bg-[#0a1930] px-3 text-sm font-semibold text-white placeholder:text-[#9bb2d2]/65 focus:border-[#d4af37] focus:outline-none focus:ring-2 focus:ring-[#d4af37]/30"
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d4af37]/85">
                    ชื่อสูตร
                  </span>
                  <input
                    value={formulaModalState.formulaName}
                    onChange={(event) =>
                      setFormulaModalState((prev) => ({
                        ...prev,
                        formulaName: event.target.value,
                        error: "",
                      }))
                    }
                    placeholder="เช่น สูตรทดแทนแป้ง"
                    className="h-11 w-full rounded-[2px] border border-[#284871] bg-[#0a1930] px-3 text-sm font-semibold text-white placeholder:text-[#9bb2d2]/65 focus:border-[#d4af37] focus:outline-none focus:ring-2 focus:ring-[#d4af37]/30"
                  />
                </label>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d4af37]/85">
                  เริ่มต้นสูตรใหม่
                </p>
                <div className="grid gap-2 grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setFormulaModalState((prev) => ({ ...prev, seedMode: "blank", error: "" }))}
                    className={`rounded-[2px] border px-3 py-2 text-left text-xs font-semibold transition-colors ${formulaModalState.seedMode === "blank"
                      ? "border-[#d4af37] bg-[#d4af37]/15 text-white"
                      : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                      }`}
                  >
                    <p className="font-bold">เริ่มแบบว่าง</p>
                    <p className="mt-1 text-[10px] font-normal text-white/50 leading-tight">เพิ่มวัตถุดิบใหม่เองทั้งหมด</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormulaModalState((prev) => ({ ...prev, seedMode: "clone", error: "" }))}
                    className={`rounded-[2px] border px-3 py-2 text-left text-xs font-semibold transition-colors ${formulaModalState.seedMode === "clone"
                      ? "border-[#d4af37] bg-[#d4af37]/15 text-white"
                      : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                      }`}
                  >
                    <p className="font-bold">คัดลอกจากสูตรปัจจุบัน</p>
                    <p className="mt-1 text-[10px] font-normal text-white/50 leading-tight">เหมาะสำหรับสูตรทางเลือกอื่นๆ</p>
                  </button>
                </div>
              </div>

              {formulaModalState.error && (
                <p className="rounded-[2px] border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200">
                  {formulaModalState.error}
                </p>
              )}
              <p className="text-[11px] text-white/50 leading-normal">
                หลังเพิ่มสูตรแล้ว ต้องกดปุ่ม &quot;บันทึกสูตร&quot; ด้านขวาบนอีกครั้ง เพื่อสร้างเวอร์ชันและบันทึกลงระบบ
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-[#d4af37]/20 bg-[#081d3d]/90 px-5 py-4">
              <button
                type="button"
                onClick={closeFormulaModal}
                className="rounded-[2px] border border-white/20 bg-transparent px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] text-white transition-colors hover:bg-white/10"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleConfirmCreateFormula}
                className="rounded-[2px] bg-[#d4af37] px-4 py-2 text-xs font-bold uppercase tracking-[0.1em] text-[#102C57] shadow-[0_8px_20px_rgba(212,175,55,0.3)] transition-colors hover:bg-[#c29c27]"
              >
                บันทึกสูตร
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clone BOM Selector Drawer */}
      {cloneDrawerState.isOpen && (
        <div className="fixed inset-0 z-[120] flex justify-end bg-[#07111f]/55 backdrop-blur-[2px] no-print">
          <button
            type="button"
            onClick={() => setCloneDrawerState((prev) => ({ ...prev, isOpen: false }))}
            className="absolute inset-0 cursor-default bg-transparent focus-visible:outline-none"
            aria-label="ปิดกล่องคัดลอกสูตร"
          />
          <aside className="relative z-10 flex h-full w-full max-w-[960px] flex-col border-l border-[#d4af37]/40 bg-white shadow-[-24px_0_60px_rgba(2,6,23,0.25)]">
            <div className="border-b border-[#d4af37]/35 bg-[#102C57] px-5 py-4 text-white">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.24em] text-[#d4af37]">
                    BOM Cross-Product Cloner
                  </p>
                  <h2 className="mt-1 text-lg font-bold">คัดลอก BOM จากสินค้าอื่น</h2>
                  <p className="mt-1 text-xs font-medium text-white/70">
                    เลือกสินค้าและสูตรต้นทางเพื่อโคลนโครงสร้างวัตถุดิบลงในการจัดสูตรใหม่
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCloneDrawerState((prev) => ({ ...prev, isOpen: false }))}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] border border-[#d4af37]/40 text-[#d4af37] transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#d4af37]"
                  aria-label="ปิดการคัดลอกสูตร"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex flex-1 min-h-0">
              {/* Left Pane: Products with BOM list */}
              <div className="flex flex-1 flex-col min-h-0 border-r border-gray-200">
                <div className="p-4 border-b border-gray-100 bg-[#f8fafc]">
                  <label className="relative block">
                    <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#102C57]/55" />
                    <input
                      value={cloneDrawerState.searchTerm}
                      onChange={(event) =>
                        setCloneDrawerState((prev) => ({ ...prev, searchTerm: event.target.value }))
                      }
                      placeholder="ค้นหารหัส หรือชื่อสินค้าต้นทางที่มี BOM แล้ว..."
                      className="h-10 w-full rounded-[2px] border border-gray-200 bg-white pl-9 pr-3 text-sm font-semibold text-[#102C57] placeholder:text-[#64748b] focus:border-[#d4af37] focus:outline-none focus:ring-1 focus:ring-[#d4af37]"
                      autoComplete="off"
                    />
                  </label>
                </div>

                <div className="flex-1 overflow-auto">
                  {cloneDrawerState.isLoading ? (
                    <div className="flex h-32 items-center justify-center text-xs font-semibold text-[#102C57]/70">
                      กำลังโหลดรายการสินค้า...
                    </div>
                  ) : filteredCloneProducts.length === 0 ? (
                    <div className="flex h-32 items-center justify-center text-xs font-semibold text-gray-500">
                      ไม่พบสินค้าต้นทางที่มี BOM ตรงกับที่ค้นหา
                    </div>
                  ) : (
                    <table className="w-full table-fixed border-collapse text-sm">
                      <thead className="sticky top-0 z-10 bg-[#102C57] text-left text-[11px] font-bold uppercase tracking-[0.08em] text-[#d4af37]">
                        <tr>
                          <th className="w-[150px] px-4 py-3">รหัสสินค้า</th>
                          <th className="px-4 py-3">ชื่อสินค้า</th>
                          <th className="w-[140px] px-4 py-3">หมวดหมู่</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filteredCloneProducts.map((product) => {
                          const isSelected = product.code === cloneDrawerState.selectedProductCode;
                          return (
                            <tr
                              key={product.code}
                              onClick={() => {
                                const formulas = product.formulaOptions || [];
                                const firstFormula = formulas[0]?.formula_code || "DEFAULT";
                                setCloneDrawerState((prev) => ({
                                  ...prev,
                                  selectedProductCode: product.code,
                                  selectedFormulaCode: firstFormula,
                                  error: "",
                                }));
                              }}
                              className={`cursor-pointer transition-colors ${
                                isSelected ? "bg-[#fff7db]" : "bg-white hover:bg-[#f8fafc]"
                              }`}
                            >
                              <td className="px-4 py-3 align-middle font-bold text-[#102C57]">
                                {product.code}
                              </td>
                              <td className="px-4 py-3 align-middle text-[#102C57]">
                                {product.name}
                              </td>
                              <td className="px-4 py-3 align-middle text-xs text-gray-500">
                                {product.categoryName || product.category}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              {/* Right Pane: Clone Configuration Form */}
              <div className="w-[340px] bg-[#f8fafc] p-5 flex flex-col justify-between overflow-y-auto">
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-[0.15em] text-[#102C57] border-b border-gray-200 pb-2">
                      รายละเอียดสูตรใหม่
                    </h4>
                  </div>
                  
                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d4af37]/85">
                      รหัสสูตรใหม่
                    </span>
                    <input
                      value={cloneDrawerState.formulaCode}
                      onChange={(event) =>
                        setCloneDrawerState((prev) => ({
                          ...prev,
                          formulaCode: event.target.value.toUpperCase(),
                          error: "",
                        }))
                      }
                      placeholder="เช่น F2 หรือ ALT-A"
                      className="h-10 w-full rounded-[2px] border border-gray-300 bg-white px-3 text-sm font-semibold text-[#102C57] focus:border-[#d4af37] focus:outline-none focus:ring-1 focus:ring-[#d4af37]"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.18em] text-[#d4af37]/85">
                      ชื่อสูตรใหม่
                    </span>
                    <input
                      value={cloneDrawerState.formulaName}
                      onChange={(event) =>
                        setCloneDrawerState((prev) => ({
                          ...prev,
                          formulaName: event.target.value,
                          error: "",
                        }))
                      }
                      placeholder="เช่น สูตรทดแทนแป้ง"
                      className="h-10 w-full rounded-[2px] border border-gray-300 bg-white px-3 text-sm font-semibold text-[#102C57] focus:border-[#d4af37] focus:outline-none focus:ring-1 focus:ring-[#d4af37]"
                    />
                  </label>

                  <div className="pt-2 border-t border-gray-200">
                    <h4 className="text-xs font-bold uppercase tracking-[0.15em] text-[#102C57] pb-2">
                      ข้อมูลสูตรต้นแบบ
                    </h4>
                  </div>

                  <div className="rounded-[2px] border border-gray-200 bg-white p-3 space-y-2">
                    <div>
                      <p className="text-[9px] font-bold uppercase tracking-wider text-gray-500">สินค้าต้นแบบ</p>
                      <p className="text-xs font-bold text-[#102C57]">
                        {cloneDrawerState.selectedProductCode
                          ? cloneDrawerState.selectedProductCode
                          : "ยังไม่ได้เลือกสินค้า"}
                      </p>
                      {cloneDrawerState.selectedProductCode && (
                        <p className="text-[11px] text-gray-600 line-clamp-2 leading-normal mt-0.5">
                          {cloneDrawerState.products.find(p => p.code === cloneDrawerState.selectedProductCode)?.name}
                        </p>
                      )}
                    </div>

                    {cloneDrawerState.selectedProductCode && (
                      <div className="pt-1">
                        <label className="block">
                          <span className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-gray-500">
                            สูตรต้นแบบที่ต้องการคัดลอก
                          </span>
                          <select
                            value={cloneDrawerState.selectedFormulaCode}
                            onChange={(event) =>
                              setCloneDrawerState((prev) => ({
                                ...prev,
                                selectedFormulaCode: event.target.value,
                                error: "",
                              }))
                            }
                            className="h-9 w-full rounded-[2px] border border-gray-300 bg-white px-2 text-xs font-semibold text-[#102C57] focus:border-[#d4af37] focus:outline-none"
                          >
                            {(() => {
                              const prod = cloneDrawerState.products.find(p => p.code === cloneDrawerState.selectedProductCode);
                              const formulas = prod?.formulaOptions || [];
                              if (formulas.length === 0) {
                                return <option value="DEFAULT">สูตรหลัก (DEFAULT)</option>;
                              }
                              return formulas.map((f) => (
                                <option key={f.formula_code} value={f.formula_code}>
                                  {f.formula_name} ({f.formula_code})
                                </option>
                              ));
                            })()}
                          </select>
                        </label>
                      </div>
                    )}
                  </div>
                </div>

                <div className="space-y-3 pt-4 border-t border-gray-200">
                  {cloneDrawerState.error && (
                    <p className="rounded-[2px] border border-rose-300/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-600 leading-normal">
                      {cloneDrawerState.error}
                    </p>
                  )}
                  
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setCloneDrawerState((prev) => ({ ...prev, isOpen: false }))}
                      className="flex-1 h-10 rounded-[2px] border border-gray-300 bg-white text-xs font-bold uppercase tracking-[0.1em] text-[#102C57] hover:bg-gray-50 transition-colors"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmClone}
                      className="flex-1 h-10 rounded-[2px] bg-[#d4af37] text-xs font-bold uppercase tracking-[0.1em] text-[#102C57] shadow-[0_8px_20px_rgba(212,175,55,0.2)] hover:bg-[#c29c27] transition-colors"
                    >
                      ยืนยันการคัดลอก
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      )}
    </PermissionGate >
  );
}
