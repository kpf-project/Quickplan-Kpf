"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, Layers, Settings, Search, Plus, Trash2, Pencil, CheckSquare, X } from "lucide-react";
import { usePermissions } from "@/lib/usePermissions";
import { DATA_TASK_PERMISSIONS } from "@/lib/dataTaskPermissions";
import DepartmentProductScopeTab from "@/features/production-line-settings/components/DepartmentProductScopeTab";
import MachineSettingsTab from "@/features/production-line-settings/components/MachineSettingsTab";
import PalletBarcodeSettingsTab from "@/features/production-line-settings/components/PalletBarcodeSettingsTab";
import PieceRateSettingsPanel from "@/features/production-line-settings/components/PieceRateSettingsPanel";
import ProductionShiftSettingsTab from "@/features/production-line-settings/components/ProductionShiftSettingsTab";
import MaterialOwnerSettingsTab from "@/features/production-line-settings/components/MaterialOwnerSettingsTab";
import WipPoliciesSettingsTab from "@/features/production-line-settings/components/WipPoliciesSettingsTab";
import WorkCenterSettingsTab from "@/features/production-line-settings/components/WorkCenterSettingsTab";
import RoutingSettingsTab from "@/features/production-line-settings/components/RoutingSettingsTab";
import {
  assignCategoryProducts,
  createProductionCategory,
  deleteProductionCategory,
  fetchCategoryProducts,
  fetchProductsCache,
  fetchProductionCategories,
  unassignCategoryProducts,
  updateProductionCategory,
} from "@/features/production-line-settings/services/productionLineSettingsClient";

const TAB_CONFIG = [
  { key: "type", label: "ประเภท", href: "/production-line/settings/type" },
  { key: "department-products", label: "หมวดหมู่สินค้าแผนก", href: "/production-line/settings/department-products" },
  { key: "work-centers", label: "ห้องผลิต", href: "/production-line/settings/work-centers" },
  { key: "routing", label: "Routing", href: "/production-line/settings/routing" },
  { key: "machine", label: "เครื่องพิมพ์", href: "/production-line/settings/machine" },
  { key: "shifts", label: "กะการผลิต", href: "/production-line/settings/shifts" },
  { key: "pallet-barcodes", label: "บาร์โค้ดพาเลท", href: "/production-line/settings/pallet-barcodes" },
  { key: "piece-rates", label: "อัตราค่าแรงสินค้า", href: "/production-line/settings/piece-rates" },
  { key: "wip-policies", label: "โหมด WIP", href: "/production-line/settings/wip-policies" },
  { key: "material-owners", label: "เจ้าของวัตถุดิบ", href: "/production-line/settings/material-owners" },
];

const TAB_RESOURCES = {
  type: ["categories", "category-products", "products-cache"],
  "department-products": ["department-products", "department-product-subcategories", "departments", "department-users"],
  "work-centers": ["work-centers", "delivery-points"],
  routing: ["routings", "routing-components", "routing-components-explode", "routing-components-completeness"],
  machine: ["machine"],
  shifts: ["shifts", "section-shifts"],
  "pallet-barcodes": ["pallet-barcodes"],
  "piece-rates": ["piece-rate", "piece-rate-rate", "snack-wage", "snack-wage-rate"],
  "wip-policies": ["wip-policies"],
  "material-owners": ["material-owners"],
};
const TAB_TASK_KEYS = Object.fromEntries(Object.entries(TAB_RESOURCES).map(([tab, resources]) => [tab,
  Object.keys(DATA_TASK_PERMISSIONS).filter((key) => resources.some((resource) => key.replace(/-(view|create|edit|write|delete)$/, "") === "production-settings-" + resource)),
]));

const DEFAULT_FORM = {
  id: null,
  code: "",
  name: "",
  description: "",
  is_active: true,
};

const formatDateDisplay = (value) => {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear();
  return `${d}-${m}-${y}`;
};

function ProductTypeMatrix({
  categories, selectedCategoryId, onSelectCategory, loadingCategories, onCreate,
  selectedCategory, canManage, products, assignedProducts, visibleAssignedProducts,
  assignedPage, assignedTotalPages, setAssignedPage, loadingProducts, loadingAssigned,
  productSearch, setProductSearch, onProductSearch, selectedProducts, toggleProductSelection,
  selectedAssigned, toggleAssignedSelection, onAssign, onUnassign, assignedCodeSet,
  pagination, canGoPrev, canGoNext, onPrev, onNext, onEdit, onDelete,
}) {
  return (
    <main className="mx-auto flex min-h-0 w-full max-w-[1800px] flex-1 flex-col bg-[#f7f8fa] px-3 py-3 sm:px-5 lg:h-full lg:px-7">
      <section className="shrink-0 border border-slate-200 bg-white">
        <div className="flex min-w-0 gap-0 overflow-x-auto [scrollbar-width:thin]">
          {loadingCategories ? <div className="px-5 py-8 text-sm text-slate-500">กำลังโหลดประเภท...</div> : null}
          {categories.map((category) => {
            const active = category.id === selectedCategoryId;
            return (
              <button key={category.id} type="button" onClick={() => onSelectCategory(category.id)} className={`min-w-[230px] flex-1 border-r border-slate-200 px-5 py-4 text-left transition ${active ? "border-b-2 border-b-[#d4af37] bg-[#fffdf7]" : "hover:bg-slate-50"}`}>
                <div className="text-sm font-black text-[#102C57]">{category.code}</div>
                <div className="mt-1 line-clamp-1 text-sm font-semibold text-slate-800">{category.name}</div>
                <div className="mt-4 text-xs font-bold text-[#102C57]">{Number(category.product_count || 0).toLocaleString()} รายการ</div>
              </button>
            );
          })}
          <button type="button" onClick={onCreate} disabled={!canManage} className="m-3 min-w-[220px] border border-dashed border-slate-300 px-5 py-4 text-sm font-bold text-slate-500 transition hover:border-[#d4af37] hover:text-[#102C57] disabled:opacity-50">
            <Plus size={16} className="mr-2 inline" /> เพิ่มประเภทสินค้า
          </button>
        </div>
      </section>

      <section className="mt-4 grid min-h-0 flex-1 grid-cols-1 border border-slate-200 bg-white lg:grid-cols-[minmax(0,1fr)_170px_minmax(0,1fr)]">
        <div className="flex min-h-[520px] min-w-0 flex-col border-b border-slate-200 lg:border-b-0 lg:border-r">
          <div className="border-b border-slate-200 px-4 py-4">
            <h2 className="text-lg font-black text-[#102C57]">คลังสินค้าทั้งหมด</h2>
            <p className="text-xs text-slate-500">ค้นหาและเลือกสินค้าที่ต้องการเพิ่มในประเภทนี้</p>
            <div className="mt-4 flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Search size={17} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} onKeyDown={(event) => event.key === "Enter" && onProductSearch()} placeholder="ค้นหา Trade Code หรือชื่อสินค้า..." className="h-11 w-full border border-slate-300 bg-white pl-10 pr-3 text-sm outline-none focus:border-[#102C57]" />
              </div>
              <button type="button" onClick={onProductSearch} disabled={loadingProducts} className="h-11 w-12 bg-[var(--surface-navy,#102C57)] text-white disabled:opacity-50" aria-label="ค้นหาสินค้า"><Search size={18} className="mx-auto" /></button>
            </div>
          </div>
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600">
            <span>เลือกแล้ว {selectedProducts.size.toLocaleString()} รายการ</span>
            <span>ทั้งหมด {pagination.totalRecords.toLocaleString()} รายการ</span>
          </div>
          <div className="min-h-0 flex-1 overflow-auto">
            {loadingProducts ? <div className="p-10 text-center text-sm text-slate-500">กำลังโหลดสินค้า...</div> : null}
            {!loadingProducts && products.map((item, index) => {
              const isAssigned = assignedCodeSet.has(item.sku_code);
              const tradeCode = item.trade_code || item.sku_code;
              const tradeCodeKey = `${tradeCode}::${item.sku_code}`;
              const itemKey = `${tradeCode}_${item.sku_code}_${index}`;
              const isSelected = selectedProducts.has(tradeCodeKey);
              return (
                <label key={itemKey} className={`grid h-11 cursor-pointer grid-cols-[28px_110px_minmax(0,1fr)_76px] items-center gap-2 border-b border-slate-100 px-4 transition ${isSelected ? "bg-[#fff8dc]" : "hover:bg-slate-50"} ${isAssigned ? "opacity-55" : ""}`}>
                  <input type="checkbox" disabled={isAssigned || !canManage} checked={isSelected} onChange={() => toggleProductSelection(tradeCodeKey)} className="h-4 w-4 accent-[#102C57]" />
                  <span className="truncate font-mono text-xs font-black text-[#102C57]">{tradeCode}</span>
                  <span className="min-w-0 truncate text-xs font-medium text-slate-800">{item.sku_name || "-"}{isAssigned ? <span className="ml-2 text-[10px] text-emerald-700">ผูกแล้ว</span> : null}</span>
                  <span className="truncate text-right text-[11px] font-semibold text-slate-600">{item.uom_name || "-"}</span>
                </label>
              );
            })}
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
            <span>หน้า {pagination.page.toLocaleString()} / {pagination.totalPages.toLocaleString()}</span>
            <div className="flex gap-2"><button type="button" onClick={onPrev} disabled={!canGoPrev || loadingProducts} className="h-8 border border-slate-300 px-3 disabled:opacity-40">ก่อนหน้า</button><button type="button" onClick={onNext} disabled={!canGoNext || loadingProducts} className="h-8 border border-[#102C57] bg-[var(--surface-navy,#102C57)] px-3 text-white disabled:opacity-40">ถัดไป</button></div>
          </div>
        </div>

        <div className="flex flex-row items-center justify-center gap-3 border-b border-slate-200 bg-[#fbfcfd] p-4 lg:flex-col lg:border-b-0 lg:border-r">
          <div className="text-center"><div className="text-xs font-bold text-slate-500">กำลังเลือก</div><div className="mt-1 text-4xl font-black text-[#102C57]">{selectedProducts.size}</div><div className="text-xs text-slate-500">รายการ</div></div>
          <button type="button" onClick={onAssign} disabled={!selectedCategoryId || selectedProducts.size === 0 || !canManage} className="inline-flex h-11 items-center gap-2 bg-[var(--surface-navy,#102C57)] px-5 text-sm font-bold text-white disabled:opacity-40">เพิ่มสินค้า <ArrowRight size={18} /></button>
          <button type="button" onClick={onUnassign} disabled={!selectedCategoryId || selectedAssigned.size === 0 || !canManage} className="inline-flex h-10 items-center gap-2 border border-slate-300 px-4 text-sm font-semibold text-slate-600 disabled:opacity-40"><ArrowLeft size={17} /> นำออก</button>
        </div>

        <div className="flex min-h-[520px] min-w-0 flex-col">
          <div className="flex items-start justify-between border-b border-slate-200 px-4 py-4">
            <div><h2 className="text-lg font-black text-[#102C57]">สินค้าใน {selectedCategory?.code || "ประเภท"}</h2><p className="text-sm font-semibold text-slate-700">{selectedCategory?.name || "เลือกประเภทสินค้า"}</p></div>
            <div className="flex gap-2"><button type="button" onClick={onEdit} disabled={!selectedCategory || !canManage} className="h-9 border border-slate-300 px-3 text-xs font-bold text-[#102C57]"><Pencil size={14} className="mr-1 inline" /> แก้ไข</button><button type="button" onClick={onDelete} disabled={!selectedCategory || !canManage} className="h-9 border border-red-200 px-3 text-xs font-bold text-red-600"><Trash2 size={14} className="mr-1 inline" /> ปิดใช้งาน</button></div>
          </div>
          <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600"><span>{assignedProducts.length.toLocaleString()} รายการ</span><button type="button" onClick={onUnassign} disabled={selectedAssigned.size === 0 || !canManage} className="disabled:opacity-40">นำออกที่เลือก ({selectedAssigned.size})</button></div>
          <div className="min-h-0 flex-1 overflow-auto">
            {loadingAssigned ? <div className="p-10 text-center text-sm text-slate-500">กำลังโหลดสินค้า...</div> : null}
            {!loadingAssigned && visibleAssignedProducts.map((item, index) => {
              const tradeCode = item.trade_code || item.sku_code;
              const tradeCodeKey = `${tradeCode}::${item.sku_code}`;
              const itemKey = `${tradeCode}_${item.sku_code}_${index}`;
              const isSelected = selectedAssigned.has(tradeCodeKey);
              return (
                <label key={itemKey} className={`grid h-11 cursor-pointer grid-cols-[28px_110px_minmax(0,1fr)_76px_24px] items-center gap-2 border-b border-slate-100 px-4 transition ${isSelected ? "bg-[#fff8dc]" : "hover:bg-slate-50"}`}>
                  <input type="checkbox" disabled={!canManage} checked={isSelected} onChange={() => toggleAssignedSelection(tradeCodeKey)} className="h-4 w-4 accent-[#102C57]" />
                  <span className="truncate font-mono text-xs font-black text-[#102C57]">{tradeCode}</span>
                  <span className="min-w-0 truncate text-xs font-medium text-slate-800">{item.sku_name || "-"}</span>
                  <span className="truncate text-right text-[11px] font-semibold text-slate-600">{item.uom_name || "-"}</span>
                  <X size={16} className="text-slate-400" />
                </label>
              );
            })}
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-600"><span>หน้า {assignedPage} / {assignedTotalPages}</span><div className="flex gap-2"><button type="button" onClick={() => setAssignedPage((page) => Math.max(1, page - 1))} disabled={assignedPage <= 1} className="h-8 border border-slate-300 px-3 disabled:opacity-40">ก่อนหน้า</button><button type="button" onClick={() => setAssignedPage((page) => Math.min(assignedTotalPages, page + 1))} disabled={assignedPage >= assignedTotalPages} className="h-8 border border-[#d4af37] bg-[#d4af37] px-3 font-bold text-[#102C57] disabled:opacity-40">ถัดไป</button></div></div>
        </div>
      </section>
    </main>
  );
}

export default function ProductionLineSettingsPageClient({ initialTab = "type" }) {
  const router = useRouter();
  const permissionState = usePermissions();
  const [categories, setCategories] = useState([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [categorySearch, setCategorySearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [products, setProducts] = useState([]);
  const [assignedProducts, setAssignedProducts] = useState([]);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [loadingAssigned, setLoadingAssigned] = useState(false);
  const [productPagination, setProductPagination] = useState({
    page: 1,
    pageSize: 50,
    totalPages: 1,
    totalRecords: 0,
  });
  const productPaginationRef = useRef(productPagination);
  const [productCursorInfo, setProductCursorInfo] = useState({ next: null, hasMore: false });
  const [productCursorMap, setProductCursorMap] = useState({ 1: null });
  const productCursorMapRef = useRef(productCursorMap);
  const [errorMessage, setErrorMessage] = useState("");
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [categoryForm, setCategoryForm] = useState(DEFAULT_FORM);
  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [selectedAssigned, setSelectedAssigned] = useState(new Set());
  const [assignedPage, setAssignedPage] = useState(1);
  const [, startTransition] = useTransition();

  const activeTab = ["type", "department-products", "work-centers", "routing", "machine", "shifts", "pallet-barcodes", "piece-rates", "wip-policies", "material-owners"].includes(initialTab)
    ? initialTab
    : "type";
  const taskPermissionsEnabled = permissionState.taskPermissionsEnabled === true;
  const legacySettingsAccess = permissionState.isAdmin || (!taskPermissionsEnabled && ["production-line-settings-view", "production-line-settings-manage"].some((key) => permissionState.permissions.includes(key)));
  const visibleTabs = TAB_CONFIG.filter((tab) => legacySettingsAccess || (TAB_TASK_KEYS[tab.key] || []).some((key) => permissionState.permissions.includes(key)));
  const canView = permissionState.loaded
    ? permissionState.isAdmin
      || legacySettingsAccess
      || (TAB_TASK_KEYS[activeTab] || []).some((key) => permissionState.permissions.includes(key))
    : false;
  const canManage = permissionState.loaded
    ? permissionState.isAdmin
      || (!taskPermissionsEnabled && permissionState.permissions.includes("production-line-settings-manage"))
      || (TAB_TASK_KEYS[activeTab] || []).some((key) => /-(create|edit|write|delete)$/.test(key) && permissionState.permissions.includes(key))
    : false;

  useEffect(() => {
    if (!permissionState.loaded) {
      return;
    }
    if (!canView) {
      const nextTab = TAB_CONFIG.find((tab) => (TAB_TASK_KEYS[tab.key] || []).some((key) => permissionState.permissions.includes(key)));
      router.replace(nextTab?.href || "/unauthorized");
    }
  }, [canView, permissionState.loaded, permissionState.permissions, router]);

  useEffect(() => {
    productCursorMapRef.current = productCursorMap;
  }, [productCursorMap]);

  useEffect(() => {
    productPaginationRef.current = productPagination;
  }, [productPagination]);

  const assignedCodeSet = useMemo(
    () => new Set(assignedProducts.map((item) => item.sku_code)),
    [assignedProducts]
  );
  const assignedPageSize = 20;
  const assignedTotalPages = Math.max(1, Math.ceil(assignedProducts.length / assignedPageSize));
  const visibleAssignedProducts = useMemo(
    () => assignedProducts.slice((assignedPage - 1) * assignedPageSize, assignedPage * assignedPageSize),
    [assignedPage, assignedProducts]
  );

  const loadCategories = useCallback(async () => {
    setLoadingCategories(true);
    const result = await fetchProductionCategories({ search: categorySearch });
    if (!result.ok) {
      setErrorMessage(result.error?.message || "โหลดประเภทไม่สำเร็จ");
      setLoadingCategories(false);
      return { data: [] };
    }
    setLoadingCategories(false);
    return { data: result.data?.data ?? [] };
  }, [categorySearch]);

  const loadProducts = useCallback(async (page = 1, options = {}) => {
    setLoadingProducts(true);
    const cursorOverride = Object.prototype.hasOwnProperty.call(options, "cursor")
      ? options.cursor
      : undefined;
    const resetCursors = Boolean(options.resetCursors);
    const cursorValue = cursorOverride !== undefined ? cursorOverride : productCursorMapRef.current[page];
    const result = await fetchProductsCache({
      search: productSearch,
      page: String(page),
      pageSize: "50",
      cursor: cursorValue ?? "",
    });
    if (!result.ok) {
      setErrorMessage(result.error?.message || "โหลดสินค้าไม่สำเร็จ");
      setLoadingProducts(false);
      return { data: [], pagination: productPaginationRef.current };
    }
    const payload = result.data ?? {};
    const data = payload.data ?? [];
    const pagination = payload.pagination ?? productPaginationRef.current;
    const cursorInfo = payload.cursor ?? { next: null, hasMore: false };
    setLoadingProducts(false);
    setProductCursorInfo(cursorInfo);
    setProductPagination(pagination);
    setProductCursorMap((prev) => {
      const base = resetCursors ? { 1: null } : { ...prev };
      base[page] = cursorValue ?? null;
      base[page + 1] = cursorInfo.next ?? null;
      return base;
    });
    return { data, pagination };
  }, [productSearch]);

  const loadAssignedProducts = useCallback(async (categoryId) => {
    if (!categoryId) {
      setAssignedProducts([]);
      return;
    }
    setLoadingAssigned(true);
    const result = await fetchCategoryProducts(categoryId);
    if (!result.ok) {
      setErrorMessage(result.error?.message || "โหลดสินค้าในประเภทไม่สำเร็จ");
      setLoadingAssigned(false);
      return;
    }
    setLoadingAssigned(false);
    setAssignedProducts(result.data?.data ?? []);
  }, []);

  useEffect(() => {
    if (!permissionState.loaded || !canView || activeTab !== "type") {
      return;
    }
    let isActive = true;
    const loadInitial = async () => {
      setErrorMessage("");
      const [categoryResult, productsResult] = await Promise.all([
        loadCategories(),
        loadProducts(1, { cursor: null, resetCursors: true }),
      ]);

      if (!isActive) {
        return;
      }
      const nextCategories = categoryResult.data ?? [];
      const nextProducts = productsResult.data ?? [];
      startTransition(() => {
        setCategories(nextCategories);
        setProducts(nextProducts);
      });
      const fallbackCategoryId = selectedCategoryId || nextCategories[0]?.id || null;
      if (fallbackCategoryId) {
        setSelectedCategoryId(fallbackCategoryId);
        await loadAssignedProducts(fallbackCategoryId);
      }
    };

    loadInitial();
    return () => {
      isActive = false;
    };
  }, [activeTab, canView, loadAssignedProducts, loadCategories, loadProducts, permissionState.loaded, selectedCategoryId, startTransition]);

  const handleCategorySearch = async () => {
    setErrorMessage("");
    const result = await loadCategories();
    if (result?.data) {
      setCategories(result.data);
      if (!selectedCategoryId && result.data[0]?.id) {
        setSelectedCategoryId(result.data[0].id);
        await loadAssignedProducts(result.data[0].id);
      }
    }
  };

  const handleProductSearch = async () => {
    setErrorMessage("");
    const result = await loadProducts(1, { cursor: null, resetCursors: true });
    if (result?.data) {
      setProducts(result.data);
      setSelectedProducts(new Set());
    }
  };

  const selectedCategory = categories.find((item) => item.id === selectedCategoryId) || null;

  const openCreateModal = () => {
    setCategoryForm(DEFAULT_FORM);
    setIsCategoryModalOpen(true);
  };

  const openEditModal = () => {
    if (!selectedCategory) return;
    setCategoryForm({
      id: selectedCategory.id,
      code: selectedCategory.code,
      name: selectedCategory.name,
      description: selectedCategory.description || "",
      is_active: Boolean(selectedCategory.is_active),
    });
    setIsCategoryModalOpen(true);
  };

  const handleSaveCategory = async () => {
    setErrorMessage("");
    const payload = {
      code: categoryForm.code.trim(),
      name: categoryForm.name.trim(),
      description: categoryForm.description.trim(),
      is_active: categoryForm.is_active,
    };
    if (!payload.code || !payload.name) {
      setErrorMessage("กรุณากรอกรหัสและชื่อประเภท");
      return;
    }

    const result = categoryForm.id
      ? await updateProductionCategory(categoryForm.id, payload)
      : await createProductionCategory(payload);
    if (!result.ok) {
      setErrorMessage(result.error?.message || "บันทึกประเภทไม่สำเร็จ");
      return;
    }
    const updated = result.data?.data;
    const nextCategories = await loadCategories();
    if (nextCategories?.data) {
      setCategories(nextCategories.data);
      if (updated?.id) {
        setSelectedCategoryId(updated.id);
      }
    }
    setIsCategoryModalOpen(false);
  };

  const handleDeleteCategory = async () => {
    if (!selectedCategory) return;
    const confirmed = window.confirm("ต้องการปิดใช้งานประเภทนี้หรือไม่?");
    if (!confirmed) return;
    const result = await deleteProductionCategory(selectedCategory.id);
    if (!result.ok) {
      setErrorMessage(result.error?.message || "ลบประเภทไม่สำเร็จ");
      return;
    }
    const nextCategories = await loadCategories();
    setCategories(nextCategories?.data ?? []);
    const nextId = nextCategories?.data?.[0]?.id || null;
    setSelectedCategoryId(nextId);
    await loadAssignedProducts(nextId);
  };

  const toggleProductSelection = (tradeCodeKey) => {
    setSelectedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(tradeCodeKey)) {
        next.delete(tradeCodeKey);
      } else {
        next.add(tradeCodeKey);
      }
      return next;
    });
  };

  const toggleAssignedSelection = (tradeCodeKey) => {
    setSelectedAssigned((prev) => {
      const next = new Set(prev);
      if (next.has(tradeCodeKey)) {
        next.delete(tradeCodeKey);
      } else {
        next.add(tradeCodeKey);
      }
      return next;
    });
  };

  const handleAssignSelected = async () => {
    if (!selectedCategoryId || selectedProducts.size === 0) return;
    const skuCodes = Array.from(
      new Set(
        Array.from(selectedProducts)
          .map((key) => (key.includes("::") ? key.split("::")[1] : key))
          .filter(Boolean)
      )
    );
    const result = await assignCategoryProducts(selectedCategoryId, skuCodes);
    if (!result.ok) {
      setErrorMessage(result.error?.message || "ผูกสินค้าไม่สำเร็จ");
      return;
    }
    setSelectedProducts(new Set());
    await Promise.all([loadAssignedProducts(selectedCategoryId), loadCategories()]);
  };

  const handleUnassignSelected = async () => {
    if (!selectedCategoryId || selectedAssigned.size === 0) return;
    const skuCodes = Array.from(
      new Set(
        Array.from(selectedAssigned)
          .map((key) => (key.includes("::") ? key.split("::")[1] : key))
          .filter(Boolean)
      )
    );
    const result = await unassignCategoryProducts(selectedCategoryId, skuCodes);
    if (!result.ok) {
      setErrorMessage(result.error?.message || "ลบสินค้าไม่สำเร็จ");
      return;
    }
    setSelectedAssigned(new Set());
    await Promise.all([loadAssignedProducts(selectedCategoryId), loadCategories()]);
  };

  const canGoNextProducts = productCursorInfo.hasMore
    && Boolean(productCursorMap[productPagination.page + 1]);
  const canGoPrevProducts = productPagination.page > 1;

  const handlePrevProducts = async () => {
    if (!canGoPrevProducts || loadingProducts) {
      return;
    }
    const prevPage = productPagination.page - 1;
    const result = await loadProducts(prevPage);
    if (result?.data) {
      setProducts(result.data);
      setSelectedProducts(new Set());
    }
  };

  const handleNextProducts = async () => {
    if (!canGoNextProducts || loadingProducts) {
      return;
    }
    const nextPage = productPagination.page + 1;
    const result = await loadProducts(nextPage);
    if (result?.data) {
      setProducts(result.data);
      setSelectedProducts(new Set());
    }
  };

  return (
    <div className="flex flex-col min-h-screen lg:h-screen bg-[#f8f9fa] text-[#1e293b] font-sans">
      <div className="bg-gradient-to-r from-[#102C57] to-[#0b2a54] shadow-xl text-white shrink-0 z-40">
        <div className="max-w-[95%] mx-auto py-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <div>
                <h6 className="text-[#d4af37] font-bold tracking-[0.2em] text-[10px] uppercase mb-0.5">
                  Quickplan
                </h6>
                <h1 className="text-xl md:text-2xl font-bold font-serif text-white flex flex-wrap items-center gap-3">
                  <Settings size={28} className="text-[#d4af37]" />
                  ตั้งค่าระบบการผลิต
                  <span className="text-[10px] bg-[#d4af37] text-[#102C57] px-2 py-0.5 rounded-full font-sans font-bold tracking-wider">
                    {activeTab === "type"
                      ? `${categories.length.toLocaleString()} รายการ`
                        : activeTab === "work-centers"
                          ? "ห้องผลิต"
                          : activeTab === "routing"
                            ? "Routing"
                        : activeTab === "machine"
                          ? "เครื่องพิมพ์"
                        : activeTab === "pallet-barcodes"
                            ? "บาร์โค้ดพาเลท"
                          : activeTab === "piece-rates"
                            ? "อัตราค่าแรงสินค้า"
                            : activeTab === "wip-policies"
                              ? "โหมด WIP"
                            : "แผนก"}
                  </span>
                </h1>
              </div>
            </div>

            <div className="w-full overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <div className="inline-flex min-w-max bg-[var(--surface-navy,#102C57)]/35 p-1 rounded-lg">
                {visibleTabs.map((tab) => (
                  tab.disabled ? (
                    <span
                      key={tab.key}
                      className="px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider whitespace-nowrap flex items-center gap-1.5 text-white/30"
                    >
                      <Layers size={14} />
                      {tab.label}
                    </span>
                  ) : (
                    <Link
                      key={tab.key}
                      href={tab.href}
                      className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider whitespace-nowrap transition-all flex items-center gap-1.5 ${
                        activeTab === tab.key
                          ? "bg-[#d4af37] text-[#102C57] shadow-sm"
                          : "text-white/50 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      <Layers size={14} />
                      {tab.label}
                    </Link>
                  )
                ))}
              </div>
            </div>

            {errorMessage && (
              <div className="text-[10px] text-red-300 bg-red-500/10 border border-red-500/20 px-3 py-1 rounded">
                {errorMessage}
              </div>
            )}
            {canView && !canManage && (
              <div className="text-[10px] text-amber-200 bg-amber-500/10 border border-amber-400/20 px-3 py-1 rounded">
                โหมดดูอย่างเดียว: ไม่สามารถเพิ่ม/แก้ไข/ลบ หรือผูกสินค้าได้
              </div>
            )}
          </div>
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto ${activeTab === "type" ? "lg:overflow-hidden" : ""}`}>
        {activeTab === "type" ? (
          <ProductTypeMatrix
            categories={categories}
            selectedCategoryId={selectedCategoryId}
            onSelectCategory={(categoryId) => {
              setSelectedCategoryId(categoryId);
              setAssignedPage(1);
              setSelectedAssigned(new Set());
              loadAssignedProducts(categoryId);
            }}
            loadingCategories={loadingCategories}
            onCreate={openCreateModal}
            selectedCategory={selectedCategory}
            canManage={canManage}
            products={products}
            assignedProducts={assignedProducts}
            visibleAssignedProducts={visibleAssignedProducts}
            assignedPage={assignedPage}
            assignedTotalPages={assignedTotalPages}
            setAssignedPage={setAssignedPage}
            loadingProducts={loadingProducts}
            loadingAssigned={loadingAssigned}
            productSearch={productSearch}
            setProductSearch={setProductSearch}
            onProductSearch={handleProductSearch}
            selectedProducts={selectedProducts}
            toggleProductSelection={toggleProductSelection}
            selectedAssigned={selectedAssigned}
            toggleAssignedSelection={toggleAssignedSelection}
            onAssign={handleAssignSelected}
            onUnassign={handleUnassignSelected}
            assignedCodeSet={assignedCodeSet}
            pagination={productPagination}
            canGoPrev={canGoPrevProducts}
            canGoNext={canGoNextProducts}
            onPrev={handlePrevProducts}
            onNext={handleNextProducts}
            onEdit={openEditModal}
            onDelete={handleDeleteCategory}
          />
        ) : activeTab === "legacy-type" ? (
        <div className="max-w-[95%] mx-auto min-h-0 lg:h-full py-4">
          <div className="min-h-0 lg:h-full flex flex-col lg:flex-row gap-4">
            <section className="lg:w-1/3 lg:h-full flex flex-col bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[#102C57]">ประเภทสินค้า</h2>
                  <p className="text-[10px] text-gray-400">จัดการหมวดหมู่สำหรับสูตรการผลิต</p>
                </div>
                  <button
                    onClick={openCreateModal}
                    disabled={!canManage}
                    className="h-8 px-3 bg-[#d4af37] hover:bg-[#b5952f] text-[#102C57] text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-2"
                  >
                  <Plus size={14} />
                  เพิ่ม
                </button>
              </div>

              <div className="p-4 border-b border-gray-100">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <input
                      value={categorySearch}
                      onChange={(event) => setCategorySearch(event.target.value)}
                      placeholder="ค้นหาประเภท..."
                      className="w-full h-9 pl-3 pr-8 rounded-lg bg-gray-50 border border-gray-200 text-xs focus:ring-1 focus:ring-[#d4af37] outline-none"
                    />
                  </div>
                  <button
                    onClick={handleCategorySearch}
                    disabled={loadingCategories}
                    className="h-9 px-4 bg-[var(--surface-navy,#102C57)] hover:bg-[#0b1f3f] text-white text-xs font-bold rounded-lg shadow-sm transition-all"
                  >
                    <Search size={14} />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-2">
                {loadingCategories ? (
                  <div className="text-center text-xs text-gray-400 py-6">กำลังโหลด...</div>
                ) : categories.length ? (
                  categories.map((category) => {
                    const isActive = selectedCategoryId === category.id;
                    return (
                      <button
                        key={category.id}
                        onClick={() => {
                          setSelectedCategoryId(category.id);
                          loadAssignedProducts(category.id);
                          setSelectedAssigned(new Set());
                        }}
                        className={`w-full text-left px-3 py-3 rounded-xl border transition-all mb-2 ${
                          isActive
                            ? "border-[#102C57] bg-[var(--surface-navy,#102C57)]/10"
                            : "border-transparent hover:border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-xs font-bold text-[#102C57]">{category.code}</div>
                            <div className="text-sm font-semibold text-gray-800">{category.name}</div>
                          </div>
                          <span className="text-[10px] bg-[var(--surface-navy,#102C57)] text-white px-2 py-0.5 rounded-full font-mono">
                            {(category.product_count ?? 0).toLocaleString()}
                          </span>
                        </div>
                        {category.description && (
                          <div className="text-[10px] text-gray-400 mt-1 line-clamp-2">
                            {category.description}
                          </div>
                        )}
                      </button>
                    );
                  })
                ) : (
                  <div className="text-center text-xs text-gray-400 py-6">ยังไม่มีประเภท</div>
                )}
              </div>
            </section>

            <section className="lg:flex-1 lg:h-full flex flex-col bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-sm font-bold text-[#102C57]">สินค้าในประเภท</h2>
                  <p className="text-[10px] text-gray-400">
                    {selectedCategory
                      ? `${selectedCategory.code} - ${selectedCategory.name}`
                      : "เลือกประเภทก่อนเพื่อจัดการสินค้า"}
                  </p>
                  {selectedCategory && (
                    <p className="text-[10px] text-gray-400">
                      อัปเดตล่าสุด: {formatDateDisplay(selectedCategory.updated_at)}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={openEditModal}
                    disabled={!selectedCategory || !canManage}
                    className="h-8 px-3 bg-[var(--surface-navy,#102C57)] hover:bg-[#0b1f3f] text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    <Pencil size={14} />
                    แก้ไข
                  </button>
                  <button
                    onClick={handleDeleteCategory}
                    disabled={!selectedCategory || !canManage}
                    className="h-8 px-3 bg-white border border-red-200 text-red-500 hover:bg-red-50 text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
                  >
                    <Trash2 size={14} />
                    ปิดใช้งาน
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-hidden grid grid-rows-[auto_auto_1fr] gap-4 p-4">
                <div className="bg-[#f8fafc] border border-gray-100 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-bold text-[#102C57]">สินค้าในประเภท</h3>
                    <button
                      onClick={handleUnassignSelected}
                      disabled={!selectedCategoryId || selectedAssigned.size === 0 || !canManage}
                      className="h-7 px-3 bg-white border border-gray-200 text-xs font-semibold rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                      ลบที่เลือก ({selectedAssigned.size})
                    </button>
                  </div>
                  <div className="max-h-[180px] overflow-y-auto">
                    {loadingAssigned ? (
                      <div className="text-center text-xs text-gray-400 py-4">กำลังโหลด...</div>
                    ) : assignedProducts.length ? (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-400">
                            <th className="text-left py-1 w-8"></th>
                            <th className="text-left py-1">รหัส</th>
                            <th className="text-left py-1">ชื่อสินค้า</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {assignedProducts.map((item, index) => {
                            const tradeCode = item.trade_code || item.sku_code;
                            const itemKey = `${tradeCode}_${item.sku_code}_${index}`;
                            return (
                              <tr key={itemKey}>
                                <td className="py-1">
                                  <input
                                    type="checkbox"
                                    disabled={!canManage}
                                    checked={selectedAssigned.has(item.sku_code)}
                                    onChange={() => toggleAssignedSelection(item.sku_code)}
                                    className="rounded border-gray-300 text-[#102C57]"
                                  />
                                </td>
                                <td className="py-1 font-mono text-[#102C57]">{tradeCode}</td>
                                <td className="py-1">{item.sku_name}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : (
                      <div className="text-center text-xs text-gray-400 py-4">ยังไม่มีสินค้าในประเภทนี้</div>
                    )}
                  </div>
                </div>

                <div className="bg-white border border-gray-100 rounded-xl p-3">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2 mb-2">
                    <h3 className="text-xs font-bold text-[#102C57]">ค้นหาสินค้าเพื่อผูกประเภท</h3>
                    <button
                      onClick={handleAssignSelected}
                      disabled={!selectedCategoryId || selectedProducts.size === 0 || !canManage}
                      className="h-7 px-3 bg-[#d4af37] hover:bg-[#b5952f] text-[#102C57] text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
                    >
                      <CheckSquare size={14} />
                      เพิ่มที่เลือก ({selectedProducts.size})
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <input
                      value={productSearch}
                      onChange={(event) => setProductSearch(event.target.value)}
                      placeholder="ค้นหารหัส/ชื่อสินค้า..."
                      className="flex-1 h-9 px-3 rounded-lg bg-gray-50 border border-gray-200 text-xs focus:ring-1 focus:ring-[#d4af37] outline-none"
                    />
                    <button
                      onClick={handleProductSearch}
                      disabled={loadingProducts}
                      className="h-9 px-4 bg-[var(--surface-navy,#102C57)] hover:bg-[#0b1f3f] text-white text-xs font-bold rounded-lg shadow-sm transition-all"
                    >
                      <Search size={14} />
                    </button>
                  </div>
                  <div className="mt-3 flex items-center justify-between text-[10px] text-gray-500">
                    <span>
                      หน้า {productPagination.page.toLocaleString()} / {productPagination.totalPages.toLocaleString()}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={handlePrevProducts}
                        disabled={!canGoPrevProducts || loadingProducts}
                        className="h-7 px-3 rounded-md border border-gray-200 bg-white text-[10px] font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        ก่อนหน้า
                      </button>
                      <button
                        onClick={handleNextProducts}
                        disabled={!canGoNextProducts || loadingProducts}
                        className="h-7 px-3 rounded-md border border-[#b5952f] bg-[#d4af37] text-[10px] font-semibold text-[#102C57] hover:bg-[#b5952f] disabled:opacity-50"
                      >
                        ถัดไป
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto border border-gray-100 rounded-xl">
                  {loadingProducts ? (
                    <div className="text-center text-xs text-gray-400 py-6">กำลังโหลดสินค้า...</div>
                  ) : products.length ? (
                    <table className="w-full text-xs">
                      <thead className="bg-[var(--surface-navy,#102C57)] text-white sticky top-0">
                        <tr>
                          <th className="text-left py-2 px-2 w-8"></th>
                          <th className="text-left py-2 px-2">รหัส</th>
                          <th className="text-left py-2 px-2">ชื่อสินค้า</th>
                          <th className="text-left py-2 px-2">หมวด</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {products.map((item, index) => {
                          const isAssigned = assignedCodeSet.has(item.sku_code);
                          const tradeCode = item.trade_code || item.sku_code;
                          const itemKey = `${tradeCode}_${item.sku_code}_${index}`;
                          return (
                            <tr key={itemKey} className="hover:bg-blue-50/50 transition-colors">
                              <td className="py-2 px-2">
                                <input
                                  type="checkbox"
                                  disabled={isAssigned || !canManage}
                                  checked={selectedProducts.has(item.sku_code)}
                                  onChange={() => toggleProductSelection(item.sku_code)}
                                  className="rounded border-gray-300 text-[#102C57]"
                                />
                              </td>
                              <td className="py-2 px-2 font-mono text-[#102C57]">{tradeCode}</td>
                              <td className="py-2 px-2">{item.sku_name}</td>
                              <td className="py-2 px-2 text-gray-500">
                                {item.iccat_code} {item.iccat_name ? `- ${item.iccat_name}` : ""}
                                {isAssigned && (
                                  <span className="ml-2 text-[10px] text-emerald-600">ผูกแล้ว</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <div className="text-center text-xs text-gray-400 py-6">ไม่พบสินค้า</div>
                  )}
                </div>
              </div>
            </section>
          </div>
        </div>
        ) : activeTab === "department-products" ? (
          <DepartmentProductScopeTab canManage={canManage} />
        ) : activeTab === "work-centers" ? (
          <WorkCenterSettingsTab canManage={canManage} />
        ) : activeTab === "routing" ? (
          <RoutingSettingsTab canManage={canManage} />
        ) : activeTab === "shifts" ? (
          <ProductionShiftSettingsTab canManage={canManage} />
        ) : activeTab === "pallet-barcodes" ? (
          <PalletBarcodeSettingsTab canManage={canManage} />
        ) : activeTab === "piece-rates" ? (
          <PieceRateSettingsPanel canManage={canManage} />
        ) : activeTab === "wip-policies" ? (
          <WipPoliciesSettingsTab canManage={canManage} />
        ) : activeTab === "material-owners" ? (
          <MaterialOwnerSettingsTab canManage={canManage} />
        ) : (
          <MachineSettingsTab canManage={canManage} />
        )}
      </div>

      {activeTab === "type" && isCategoryModalOpen && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[var(--surface-navy,#102C57)]/55 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="px-6 py-4 bg-[var(--surface-navy,#102C57)] text-white flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold">
                  {categoryForm.id ? "แก้ไขประเภท" : "เพิ่มประเภท"}
                </h2>
                <div className="text-xs text-blue-200 mt-1">
                  กำหนดรหัสและชื่อประเภทสำหรับผูกสินค้า
                </div>
              </div>
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                className="text-white/70 hover:text-white transition-colors"
              >
                X
              </button>
            </div>
            <div className="p-6 flex flex-col gap-4 text-sm">
              <div>
                <label className="block text-xs text-gray-500 mb-1">รหัสประเภท</label>
                <input
                  value={categoryForm.code}
                  onChange={(event) =>
                    setCategoryForm((prev) => ({ ...prev, code: event.target.value }))
                  }
                  className="w-full h-9 px-3 rounded-lg border border-gray-200 focus:ring-1 focus:ring-[#d4af37] outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">ชื่อประเภท</label>
                <input
                  value={categoryForm.name}
                  onChange={(event) =>
                    setCategoryForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  className="w-full h-9 px-3 rounded-lg border border-gray-200 focus:ring-1 focus:ring-[#d4af37] outline-none"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">คำอธิบาย</label>
                <textarea
                  rows={3}
                  value={categoryForm.description}
                  onChange={(event) =>
                    setCategoryForm((prev) => ({ ...prev, description: event.target.value }))
                  }
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:ring-1 focus:ring-[#d4af37] outline-none resize-none"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={categoryForm.is_active}
                  onChange={(event) =>
                    setCategoryForm((prev) => ({ ...prev, is_active: event.target.checked }))
                  }
                  className="rounded border-gray-300 text-[#102C57]"
                />
                <span className="text-xs text-gray-600">ใช้งาน</span>
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
              <button
                onClick={() => setIsCategoryModalOpen(false)}
                className="px-4 py-2 bg-white border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSaveCategory}
                className="px-4 py-2 bg-[#d4af37] hover:bg-[#b5952f] text-[#102C57] rounded-lg text-xs font-bold"
              >
                บันทึก
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
