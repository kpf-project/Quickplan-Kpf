"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { 
  CheckSquare, 
  Pencil, 
  Plus, 
  Search, 
  Trash2, 
  Layers, 
  Users, 
  Package, 
  FolderPlus, 
  Check, 
  UserCheck, 
  Loader2,
  X,
  ChevronLeft,
  ChevronRight,
  Filter,
  Tag
} from "lucide-react";
import SettingsListSidebar from "@/components/settings/SettingsListSidebar";
import SettingsDialog from "@/components/settings/SettingsDialog";
import styles from "./DepartmentProductScope.module.css";
import { createDepartmentProductPager } from "../services/departmentProductPager";
import {
  assignDepartmentProducts,
  assignDepartmentUsers,
  createDepartmentProductSubcategory,
  createProductionDepartment,
  deleteDepartmentProductSubcategory,
  deleteProductionDepartment,
  fetchDepartmentProducts,
  fetchDepartmentProductSubcategories,
  fetchDepartmentUsers,
  fetchProductsCache,
  fetchProductionDepartments,
  fetchProductionUsers,
  unassignDepartmentProducts,
  unassignDepartmentUsers,
  renameDepartmentProductSubcategory,
  updateProductionDepartment,
  updateDepartmentProductSubcategory,
} from "@/features/production-line-settings/services/productionLineSettingsClient";

const DEFAULT_FORM = {
  id: null,
  code: "",
  name: "",
  description: "",
  is_active: true,
  is_central_department: false,
};

const ROLE_OPTIONS = [
  { value: "editor", label: "แก้ไขได้ (Editor)" },
  { value: "viewer", label: "ดูอย่างเดียว (Viewer)" },
];

const ITEMS_PER_PAGE = 8;

// Quick tag buttons for fast filtering
const QUICK_TAGS = [
  { label: "สับปะรด", value: "สับปะรด" },
  { label: "บิสกิต", value: "บิสกิต" },
  { label: "กะทิ / มะพร้าว", value: "มะพร้าว" },
  { label: "แป้ง", value: "แป้ง" },
  { label: "น้ำตาล", value: "น้ำตาล" },
];

export default function DepartmentProductScopeTab({ canManage = false }) {
  const [errorMessage, setErrorMessage] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [addProductsOpen, setAddProductsOpen] = useState(false);
  const [addUsersOpen, setAddUsersOpen] = useState(false);
  const [departmentSearch, setDepartmentSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [selectedUserRole, setSelectedUserRole] = useState("editor");

  const [departments, setDepartments] = useState([]);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [assignedProducts, setAssignedProducts] = useState([]);
  const [subcategories, setSubcategories] = useState([]);
  const [assignedUsers, setAssignedUsers] = useState([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(null);

  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [selectedAssignedProducts, setSelectedAssignedProducts] = useState(new Set());
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState("");
  const [newSubcategoryName, setNewSubcategoryName] = useState("");
  const [viewingProductSubcategories, setViewingProductSubcategories] = useState(null);
  const [selectedAddMoreSubcategoryId, setSelectedAddMoreSubcategoryId] = useState("");
  const [selectedUsers, setSelectedUsers] = useState(new Set());
  const [selectedAssignedUsers, setSelectedAssignedUsers] = useState(new Set());

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [activeSubTab, setActiveSubTab] = useState("products"); // "products", "subcategories", or "users"
  
  // Client-side search and pagination states to prevent endless scrolling
  const [assignedSearch, setAssignedSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [assignedPage, setAssignedPage] = useState(1);
  const [availablePage, setAvailablePage] = useState(1);
  const [availableHasMore, setAvailableHasMore] = useState(false);
  const productPager = useRef(null);
  const productRequest = useRef(0);
  if (!productPager.current) productPager.current = createDepartmentProductPager(fetchProductsCache);
  
  const [assignedUserSearch, setAssignedUserSearch] = useState("");
  const [assignedUserPage, setAssignedUserPage] = useState(1);
  const [availableUserPage, setAvailableUserPage] = useState(1);

  const [isLoadingDepartments, setIsLoadingDepartments] = useState(false);
  const [isLoadingAssigned, setIsLoadingAssigned] = useState(false);
  const [isLoadingProducts, setIsLoadingProducts] = useState(false);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  const selectedDepartment = useMemo(
    () => departments.find((item) => item.id === selectedDepartmentId) || null,
    [departments, selectedDepartmentId]
  );
  
  const assignedSkuSet = useMemo(
    () => new Set(assignedProducts.map((item) => item.sku_code)),
    [assignedProducts]
  );
  
  const ownerSkuSet = useMemo(
    () => new Set(assignedProducts.filter((item) => Boolean(item?.is_owner)).map((item) => item.sku_code)),
    [assignedProducts]
  );
  
  const assignedUserSet = useMemo(
    () => new Set(assignedUsers.map((item) => item.user_id)),
    [assignedUsers]
  );

  const categoryFilterOptions = useMemo(() => {
    const names = new Set();
    for (const s of subcategories) {
      if (s.name) names.add(s.name);
    }
    for (const item of assignedProducts) {
      if (item.subcategory_name) names.add(item.subcategory_name);
      if (Array.isArray(item.subcategories)) {
        item.subcategories.forEach((s) => s.name && names.add(s.name));
      }
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, "th"));
  }, [subcategories, assignedProducts]);

  // Client-side filtering for Assigned Products
  const filteredAssignedProducts = useMemo(() => {
    const term = String(assignedSearch || "").trim().toLowerCase();
    return assignedProducts.filter((item) => {
      const matchCategory =
        !categoryFilter ||
        item.subcategory_name === categoryFilter ||
        (Array.isArray(item.subcategories) &&
          item.subcategories.some((s) => s.name === categoryFilter));
      if (!matchCategory) return false;
      if (!term) return true;
      return (
        String(item.sku_code || "").toLowerCase().includes(term) ||
        String(item.sku_name || "").toLowerCase().includes(term) ||
        String(item.subcategory_name || "").toLowerCase().includes(term) ||
        (Array.isArray(item.subcategories) &&
          item.subcategories.some((s) =>
            String(s.name || "").toLowerCase().includes(term)
          ))
      );
    });
  }, [assignedProducts, assignedSearch, categoryFilter]);

  // Paginated Assigned Products
  const paginatedAssignedProducts = useMemo(() => {
    const start = (assignedPage - 1) * ITEMS_PER_PAGE;
    return filteredAssignedProducts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredAssignedProducts, assignedPage]);

  const totalAssignedPages = useMemo(() => {
    return Math.ceil(filteredAssignedProducts.length / ITEMS_PER_PAGE) || 1;
  }, [filteredAssignedProducts]);

  const paginatedAvailableProducts = products;

  // Client-side filtering for Assigned Users
  const filteredAssignedUsers = useMemo(() => {
    const term = String(assignedUserSearch || "").trim().toLowerCase();
    if (!term) return assignedUsers;
    return assignedUsers.filter(item => 
      String(item.username || "").toLowerCase().includes(term)
    );
  }, [assignedUsers, assignedUserSearch]);

  // Paginated Assigned Users
  const paginatedAssignedUsers = useMemo(() => {
    const start = (assignedUserPage - 1) * ITEMS_PER_PAGE;
    return filteredAssignedUsers.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredAssignedUsers, assignedUserPage]);

  const totalAssignedUserPages = useMemo(() => {
    return Math.ceil(filteredAssignedUsers.length / ITEMS_PER_PAGE) || 1;
  }, [filteredAssignedUsers]);

  // Paginated Available Users
  const paginatedAvailableUsers = useMemo(() => {
    const start = (availableUserPage - 1) * ITEMS_PER_PAGE;
    return users.slice(start, start + ITEMS_PER_PAGE);
  }, [users, availableUserPage]);

  const totalAvailableUserPages = useMemo(() => {
    return Math.ceil(users.length / ITEMS_PER_PAGE) || 1;
  }, [users]);

  const toggleSetValue = useCallback((setter, value) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }, []);

  const loadDepartments = useCallback(async () => {
    setIsLoadingDepartments(true);
    try {
      const result = await fetchProductionDepartments({ search: departmentSearch });
      if (!result.ok) {
        setErrorMessage(result.error?.message || "โหลดแผนกไม่สำเร็จ");
        return [];
      }
      return result.data?.data ?? [];
    } catch (err) {
      setErrorMessage("เกิดข้อผิดพลาดในการโหลดแผนก");
      return [];
    } finally {
      setIsLoadingDepartments(false);
    }
  }, [departmentSearch]);

  const loadProducts = useCallback(async (action = "open", search = "") => {
    const request = ++productRequest.current;
    setIsLoadingProducts(true);
    setErrorMessage("");
    try {
      const result = await productPager.current[action](search);
      if (request !== productRequest.current || !result) return;
      setProducts(result.data);
      setAvailablePage(result.page);
      setAvailableHasMore(result.hasMore);
    } catch (error) {
      if (request === productRequest.current) setErrorMessage(error.message || "โหลดสินค้าไม่สำเร็จ");
    } finally {
      if (request === productRequest.current) setIsLoadingProducts(false);
    }
  }, []);

  function openAddProducts() {
    setProductSearch("");
    setProducts([]);
    setAvailablePage(1);
    setAvailableHasMore(false);
    setAddProductsOpen(true);
    loadProducts("open");
  }

  const loadUsers = useCallback(async () => {
    setIsLoadingUsers(true);
    try {
      const result = await fetchProductionUsers({
        page: "1",
        pageSize: "150",
        search: userSearch,
      });
      if (!result.ok) {
        setErrorMessage(result.error?.message || "โหลดผู้ใช้ไม่สำเร็จ");
        return [];
      }
      setAvailableUserPage(1); // Reset page on new load
      return result.data?.data ?? [];
    } catch (err) {
      setErrorMessage("เกิดข้อผิดพลาดในการโหลดผู้ใช้");
      return [];
    } finally {
      setIsLoadingUsers(false);
    }
  }, [userSearch]);

  const loadAssigned = useCallback(async (departmentId) => {
    if (!departmentId) {
      setAssignedProducts([]);
      setAssignedUsers([]);
      setSubcategories([]);
      return;
    }
    setIsLoadingAssigned(true);
    try {
      const [productsResult, usersResult, subcategoriesResult] = await Promise.all([
        fetchDepartmentProducts(departmentId),
        fetchDepartmentUsers(departmentId),
        fetchDepartmentProductSubcategories(departmentId),
      ]);
      if (productsResult.ok) {
        setAssignedProducts(productsResult.data?.data ?? []);
      }
      if (usersResult.ok) {
        setAssignedUsers(usersResult.data?.data ?? []);
      }
      if (subcategoriesResult.ok) {
        setSubcategories(subcategoriesResult.data?.data ?? []);
      }
      if (!productsResult.ok || !usersResult.ok || !subcategoriesResult.ok) {
        setErrorMessage("โหลดข้อมูลการผูกแผนกไม่สำเร็จ");
      }
      // Reset pagination when department changes
      setAssignedPage(1);
      setAssignedUserPage(1);
      setAssignedSearch("");
      setAssignedUserSearch("");
      setSelectedAssignedProducts(new Set());
      setSelectedSubcategoryId("");
      setNewSubcategoryName("");
      setSelectedAssignedUsers(new Set());
      setSelectedProducts(new Set());
      setSelectedUsers(new Set());
    } catch (err) {
      setErrorMessage("เกิดข้อผิดพลาดในการดึงข้อมูลการผูกแผนก");
    } finally {
      setIsLoadingAssigned(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const loadInitial = async () => {
      setErrorMessage("");
      const [nextDepartments, nextUsers] = await Promise.all([
        loadDepartments(),
        loadUsers(),
      ]);
      if (!mounted) return;
      setDepartments(nextDepartments);
      setUsers(nextUsers);
      const firstDepartmentId = nextDepartments[0]?.id ?? null;
      setSelectedDepartmentId(firstDepartmentId);
      if (firstDepartmentId) {
        await loadAssigned(firstDepartmentId);
      }
    };
    loadInitial();
    return () => {
      mounted = false;
    };
  }, [loadAssigned, loadDepartments, loadProducts, loadUsers]);

  const openCreateModal = () => {
    setForm(DEFAULT_FORM);
    setIsModalOpen(true);
  };

  const openEditModal = () => {
    if (!selectedDepartment) return;
    setForm({
      id: selectedDepartment.id,
      code: selectedDepartment.code,
      name: selectedDepartment.name,
      description: selectedDepartment.description || "",
      is_active: Boolean(selectedDepartment.is_active),
      is_central_department: Boolean(selectedDepartment.is_central_department),
    });
    setIsModalOpen(true);
  };

  const handleSaveDepartment = async () => {
    if (!canManage) return;
    const payload = {
      code: form.code,
      name: form.name,
      description: form.description,
      is_active: form.is_active,
      is_central_department: Boolean(form.is_central_department),
    };
    
    setIsLoadingDepartments(true);
    const result = form.id
      ? await updateProductionDepartment(form.id, payload)
      : await createProductionDepartment(payload);
    
    if (!result.ok) {
      setErrorMessage(result.error?.message || "บันทึกแผนกไม่สำเร็จ");
      setIsLoadingDepartments(false);
      return;
    }
    
    setIsModalOpen(false);
    const nextDepartments = await loadDepartments();
    setDepartments(nextDepartments);
    const nextSelectedId = form.id || result.data?.data?.id || nextDepartments[0]?.id || null;
    setSelectedDepartmentId(nextSelectedId);
    await loadAssigned(nextSelectedId);
  };

  const handleDeactivateDepartment = async () => {
    if (!selectedDepartment || !canManage) return;
    if (!window.confirm(`ต้องการปิดใช้งาน ${selectedDepartment.name} ใช่หรือไม่?`)) return;
    
    setIsLoadingDepartments(true);
    const result = await deleteProductionDepartment(selectedDepartment.id);
    if (!result.ok) {
      const pendingCount = Number(result?.details?.pendingCount || 0);
      if (pendingCount > 0) {
        setErrorMessage(`ปิดใช้งานไม่ได้: แผนกนี้มีแผนค้าง ${pendingCount.toLocaleString()} รายการ`);
      } else {
        setErrorMessage(result.error?.message || "ปิดใช้งานแผนกไม่สำเร็จ");
      }
      setIsLoadingDepartments(false);
      return;
    }
    const nextDepartments = await loadDepartments();
    setDepartments(nextDepartments);
    const nextSelectedId = nextDepartments[0]?.id || null;
    setSelectedDepartmentId(nextSelectedId);
    await loadAssigned(nextSelectedId);
  };

  const handleAssignProducts = async () => {
    if (!selectedDepartmentId || !selectedProducts.size || !canManage) return;
    setIsLoadingAssigned(true);
    const result = await assignDepartmentProducts(selectedDepartmentId, Array.from(selectedProducts));
    if (!result.ok) {
      setErrorMessage(result.error?.message || "ผูกสินค้าไม่สำเร็จ");
      setIsLoadingAssigned(false);
      return;
    }
    setSelectedProducts(new Set());
    await Promise.all([
      loadAssigned(selectedDepartmentId),
      loadDepartments().then(setDepartments)
    ]);
  };

  const handleSetOwnerProduct = async (skuCode) => {
    if (!selectedDepartmentId || !skuCode || !canManage) return;
    const normalizedSku = String(skuCode || "").trim().toUpperCase();
    if (!normalizedSku) return;
    setIsLoadingAssigned(true);
    const result = await assignDepartmentProducts(
      selectedDepartmentId,
      [normalizedSku],
      [normalizedSku]
    );
    if (!result.ok) {
      setErrorMessage(result.error?.message || "กำหนด Owner ไม่สำเร็จ");
      setIsLoadingAssigned(false);
      return;
    }
    await loadAssigned(selectedDepartmentId);
  };

  const unassignedCount = useMemo(() => {
    return assignedProducts.filter(
      (item) => !item.subcategory_id && (!item.subcategories || item.subcategories.length === 0)
    ).length;
  }, [assignedProducts]);

  const subcategoryCountMap = useMemo(() => {
    const map = new Map();
    for (const item of assignedProducts) {
      const ids = new Set();
      if (item.subcategory_id) ids.add(item.subcategory_id);
      if (Array.isArray(item.subcategories)) {
        item.subcategories.forEach((s) => s.id && ids.add(s.id));
      }
      for (const id of ids) {
        map.set(id, (map.get(id) || 0) + 1);
      }
    }
    return map;
  }, [assignedProducts]);

  const handleSetProductSubcategory = async (action = "add") => {
    if (!selectedDepartmentId || !selectedAssignedProducts.size || !canManage) return;
    setIsLoadingAssigned(true);
    const result = await updateDepartmentProductSubcategory(
      selectedDepartmentId,
      Array.from(selectedAssignedProducts),
      selectedSubcategoryId || null,
      action
    );
    if (!result.ok) {
      setErrorMessage(result.error?.message || "บันทึกหมวดหมู่ย่อยไม่สำเร็จ");
      setIsLoadingAssigned(false);
      return;
    }
    setSelectedAssignedProducts(new Set());
    await loadAssigned(selectedDepartmentId);
  };

  const handleCreateSubcategory = async () => {
    const name = newSubcategoryName.trim();
    if (!selectedDepartmentId || !name || !canManage) return;
    setIsLoadingAssigned(true);
    const result = await createDepartmentProductSubcategory(selectedDepartmentId, name);
    if (!result.ok) {
      setErrorMessage(result.error?.message || "สร้างหมวดหมู่ย่อยไม่สำเร็จ");
      setIsLoadingAssigned(false);
      return;
    }
    setNewSubcategoryName("");
    setSelectedSubcategoryId(result.data?.data?.id || "");
    const categoriesResult = await fetchDepartmentProductSubcategories(selectedDepartmentId);
    if (categoriesResult.ok) {
      setSubcategories(categoriesResult.data?.data ?? []);
    }
    setIsLoadingAssigned(false);
  };

  const handleRenameSubcategory = async (subcategory) => {
    if (!selectedDepartmentId || !subcategory?.id || !canManage) return;
    const name = window.prompt("แก้ไขชื่อหมวดหมู่ย่อย", subcategory.name)?.trim();
    if (!name || name === subcategory.name) return;
    setIsLoadingAssigned(true);
    const result = await renameDepartmentProductSubcategory(
      selectedDepartmentId,
      subcategory.id,
      name
    );
    if (!result.ok) {
      setErrorMessage(result.error?.message || "แก้ไขชื่อหมวดหมู่ย่อยไม่สำเร็จ");
      setIsLoadingAssigned(false);
      return;
    }
    await loadAssigned(selectedDepartmentId);
    setSelectedSubcategoryId(subcategory.id);
  };

  const handleDeleteSubcategory = async (subcategory) => {
    if (!selectedDepartmentId || !subcategory?.id || !canManage) return;
    const assignedCount = assignedProducts.filter(
      (item) => item.subcategory_id === subcategory.id || item.subcategories?.some((s) => s.id === subcategory.id)
    ).length;
    if (assignedCount > 0) {
      setErrorMessage(`ลบไม่ได้ กรุณาย้ายหรือล้างหมวดของสินค้า ${assignedCount} รายการก่อน`);
      return;
    }
    if (!window.confirm(`ต้องการลบหมวดหมู่ “${subcategory.name}” ใช่หรือไม่?`)) return;
    setIsLoadingAssigned(true);
    const result = await deleteDepartmentProductSubcategory(
      selectedDepartmentId,
      subcategory.id
    );
    if (!result.ok) {
      setErrorMessage(result.error?.message || "ลบหมวดหมู่ย่อยไม่สำเร็จ");
      setIsLoadingAssigned(false);
      return;
    }
    await loadAssigned(selectedDepartmentId);
  };

  const handleUnassignProducts = async () => {
    if (!selectedDepartmentId || !selectedAssignedProducts.size || !canManage) return;
    setIsLoadingAssigned(true);
    const result = await unassignDepartmentProducts(selectedDepartmentId, Array.from(selectedAssignedProducts));
    if (!result.ok) {
      setErrorMessage(result.error?.message || "ยกเลิกผูกสินค้าไม่สำเร็จ");
      setIsLoadingAssigned(false);
      return;
    }
    setSelectedAssignedProducts(new Set());
    await loadAssigned(selectedDepartmentId);
  };

  const handleAssignUsers = async () => {
    if (!selectedDepartmentId || !selectedUsers.size || !canManage) return;
    setIsLoadingAssigned(true);
    const entries = Array.from(selectedUsers).map((userId) => ({ userId, role: selectedUserRole }));
    const result = await assignDepartmentUsers(selectedDepartmentId, entries);
    if (!result.ok) {
      setErrorMessage(result.error?.message || "ผูกผู้ใช้ไม่สำเร็จ");
      setIsLoadingAssigned(false);
      return;
    }
    setSelectedUsers(new Set());
    await loadAssigned(selectedDepartmentId);
  };

  const handleUnassignUsers = async () => {
    if (!selectedDepartmentId || !selectedAssignedUsers.size || !canManage) return;
    setIsLoadingAssigned(true);
    const result = await unassignDepartmentUsers(selectedDepartmentId, Array.from(selectedAssignedUsers));
    if (!result.ok) {
      setErrorMessage(result.error?.message || "ยกเลิกผูกผู้ใช้ไม่สำเร็จ");
      setIsLoadingAssigned(false);
      return;
    }
    setSelectedAssignedUsers(new Set());
    await loadAssigned(selectedDepartmentId);
  };

  const handleQuickTagFilter = async (tagValue) => {
    setProductSearch(tagValue);
    await loadProducts("search", tagValue);
  };

  return (
    <div className={styles.page}>
      {errorMessage ? (
        <div className="mb-6 rounded-[3px] border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm font-bold text-red-800 flex items-center justify-between shadow-sm animate-fadeIn">
          <span>{errorMessage}</span>
          <button type="button" onClick={() => setErrorMessage("")} className="text-red-800/80 hover:text-red-950">
            <X size={18} />
          </button>
        </div>
      ) : null}

      <div className={styles.layout} data-collapsed={sidebarCollapsed}>
        <SettingsListSidebar title="แผนก" items={departments} selectedId={selectedDepartmentId}
          search={departmentSearch} onSearch={setDepartmentSearch} loading={isLoadingDepartments}
          collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(value => !value)}
          onCreate={openCreateModal} canCreate={canManage} createLabel="เพิ่มแผนก"
          onSelect={async id => { setCategoryFilter(""); setSelectedDepartmentId(id); await loadAssigned(id); }} />
        <section className={styles.workspace}>
          {selectedDepartment ? (
            <>
              <div className={styles.heading}>
                <div><h2>{selectedDepartment.code} · {selectedDepartment.name}</h2>
                  <button type="button" onClick={openEditModal} disabled={!canManage} aria-label="แก้ไขแผนก"><Pencil size={15} /></button>
                </div>
                <details><summary aria-label="ตัวเลือกแผนก"><Layers size={16} /></summary>
                  <button type="button" onClick={handleDeactivateDepartment} disabled={!canManage}><Trash2 size={14} /> ปิดใช้งานแผนก</button>
                </details>
              </div>
              {/* Tab Navigation inside Workspace */}
              <div className={styles.tabs}>
                <button
                  type="button"
                  onClick={() => setActiveSubTab("products")}
                  className={`shrink-0 whitespace-nowrap px-5 py-3 text-sm font-black flex items-center gap-2 border-b-2 transition duration-200 cursor-pointer ${
                    activeSubTab === "products"
                      ? "border-[#d4af37] text-[#102C57] bg-[#fff8e2]/20 font-black"
                      : "border-transparent text-[#102C57]/60 hover:text-[#102C57]"
                  }`}
                >
                  <Package size={15} />
                  <span>สินค้า {assignedProducts.length}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSubTab("subcategories")}
                  className={`shrink-0 whitespace-nowrap px-5 py-3 text-sm font-black flex items-center gap-2 border-b-2 transition duration-200 cursor-pointer ${
                    activeSubTab === "subcategories"
                      ? "border-[#d4af37] text-[#102C57] bg-[#fff8e2]/20 font-black"
                      : "border-transparent text-[#102C57]/60 hover:text-[#102C57]"
                  }`}
                >
                  <Layers size={15} />
                  <span>หมวดหมู่ย่อย ({subcategories.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSubTab("users")}
                  className={`shrink-0 whitespace-nowrap px-5 py-3 text-sm font-black flex items-center gap-2 border-b-2 transition duration-200 cursor-pointer ${
                    activeSubTab === "users"
                      ? "border-[#d4af37] text-[#102C57] bg-[#fff8e2]/20 font-black"
                      : "border-transparent text-[#102C57]/60 hover:text-[#102C57]"
                  }`}
                >
                  <Users size={15} />
                  <span>ผู้ใช้งาน {assignedUsers.length}</span>
                </button>
              </div>

              {/* Sub-tab 1: Products Mapping (Redesigned with Pagination & Filters) */}
              {activeSubTab === "products" && (
                <div className={styles.products}>
                  
                  {/* Left Column: Assigned Products (Now Paginated + Instant Filtered) */}
                  <div className={styles.assigned}>
                    <div className={styles.toolbar} hidden={!selectedAssignedProducts.size}>
                      <div>{selectedAssignedProducts.size ? `เลือก ${selectedAssignedProducts.size} รายการ` : `สินค้าในแผนก ${filteredAssignedProducts.length} รายการ`}</div>
                      <div className="flex items-center gap-2">
                        {selectedAssignedProducts.size > 0 && <button type="button" onClick={handleUnassignProducts} disabled={!canManage || isLoadingAssigned}><Trash2 size={14} className="inline mr-1" />นำออกจากแผนก</button>}
                      </div>
                    </div>
                    {/* Instant client-side search inside department */}
                    <div className={styles.filters}><div className="relative">
                      <input 
                        value={assignedSearch} 
                        onChange={(e) => {
                          setAssignedSearch(e.target.value);
                          setAssignedPage(1); // reset to page 1 on filter
                        }}
                        placeholder="ค้นหารหัสหรือชื่อสินค้า..."
                        aria-label="ค้นหาสินค้าในแผนก"
                        className="w-full h-9 rounded-[3px] border border-[#102C57]/20 bg-slate-50 pl-9 pr-3 text-xs font-bold text-[#102C57] outline-none focus:bg-white focus:border-[#d4af37] transition"
                      />
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#102C57]" size={14} />
                    </div><select aria-label="หมวดหมู่ย่อย" value={categoryFilter} onChange={event => { setCategoryFilter(event.target.value); setAssignedPage(1); }}><option value="">ทุกหมวดหมู่ย่อย</option>{categoryFilterOptions.map(name => <option key={name} value={name}>{name}</option>)}</select><button type="button" disabled={!canManage} onClick={openAddProducts}><Plus size={15} />เพิ่มสินค้า</button></div>

                    <div className="overflow-hidden border border-[#102C57]/10 rounded-[2px] flex-1 flex flex-col bg-white">
                      <table className="w-full text-xs text-[#102C57] border-collapse table-fixed">
                        <colgroup>
                          <col className="w-[40px]" />
                          <col className="w-[105px]" />
                          <col />
                          <col className="w-[105px]" />
                          <col className="w-[95px]" />
                        </colgroup>
                        <thead className="bg-[#eef3f8] border-b border-[#102C57]/10 text-xs font-black uppercase tracking-wider text-[#102C57]">
                          <tr>
                            <th className="px-2 py-2.5 text-center">เลือก</th>
                            <th className="px-2 py-2.5 text-left">รหัส SKU</th>
                            <th className="px-2 py-2.5 text-left">รายการสินค้า</th>
                            <th className="px-2 py-2.5 text-left">หมวดย่อย</th>
                            <th className="px-2 py-2.5 text-center">คลัง / เจ้าของ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#102C57]/5 flex-1 overflow-y-auto">
                          {paginatedAssignedProducts.map((item) => {
                            const isOwner = ownerSkuSet.has(item.sku_code);
                            const isChecked = selectedAssignedProducts.has(item.sku_code);
                            return (
                              <tr 
                                key={item.sku_code} 
                                onClick={() => toggleSetValue(setSelectedAssignedProducts, item.sku_code)}
                                className={`hover:bg-slate-50 transition cursor-pointer text-xs font-bold ${
                                  isChecked ? "bg-[#fff8e2]" : ""
                                }`}
                              >
                                <td className="px-2 py-2 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleSetValue(setSelectedAssignedProducts, item.sku_code)}
                                    disabled={!canManage || isLoadingAssigned}
                                    className="h-4 w-4 rounded-[2px] border-[#102C57]/20 accent-[#102C57]"
                                  />
                                </td>
                                <td className="px-2 py-2 font-mono text-xs font-black text-[#102C57] align-middle">
                                  {item.sku_code}
                                </td>
                                <td className="px-2 py-2 font-black align-middle truncate text-[#102C57]">
                                  {item.sku_name}
                                </td>
                                <td className="px-2 py-2 align-middle text-[11px] font-black text-[#7b6215]">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="truncate">{item.subcategory_name || "—"}</span>
                                    {Array.isArray(item.subcategories) && item.subcategories.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setViewingProductSubcategories(item);
                                        }}
                                        title="คลิกเพื่อดูหมวดหมู่ทั้งหมด"
                                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-[3px] bg-[#d4af37]/20 hover:bg-[#d4af37]/35 text-[#102C57] font-mono text-[10px] font-bold border border-[#d4af37]/50 cursor-pointer transition shrink-0"
                                      >
                                        <span>+{item.subcategories.length - 1}</span>
                                      </button>
                                    )}
                                  </div>
                                </td>
                                <td className="px-2 py-2 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    onClick={() => handleSetOwnerProduct(item.sku_code)}
                                    disabled={!canManage || isOwner || isLoadingAssigned}
                                    className={`h-6.5 w-full rounded-[2px] text-[10px] font-black uppercase tracking-wider transition cursor-pointer ${
                                      isOwner 
                                        ? "bg-emerald-100 border border-emerald-300 text-emerald-950 cursor-default" 
                                        : "bg-white border border-[#102C57]/25 text-[#102C57] hover:bg-[var(--surface-navy,#102C57)]/5"
                                    }`}
                                  >
                                    {isOwner ? "Owner" : "ตั้ง Owner"}
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                          {!filteredAssignedProducts.length && !isLoadingAssigned ? (
                            <tr>
                              <td colSpan={5} className="py-12 text-center text-sm font-bold text-[#102C57]">
                                ไม่พบสินค้าผูกที่สอดคล้อง
                              </td>
                            </tr>
                          ) : null}
                          {isLoadingAssigned && (
                            <tr>
                              <td colSpan={5} className="py-12 text-center text-sm font-bold text-[#102C57]">
                                <Loader2 className="animate-spin inline-block mr-2" size={16} />
                                กำลังอัปเดตรายการ...
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination for Assigned Products */}
                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                      <span className="text-xs font-mono font-black text-[#102C57]">
                        แสดง {filteredAssignedProducts.length > 0 ? (assignedPage - 1) * ITEMS_PER_PAGE + 1 : 0} - {Math.min(assignedPage * ITEMS_PER_PAGE, filteredAssignedProducts.length)} จาก {filteredAssignedProducts.length} รายการ
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={assignedPage === 1}
                          onClick={() => setAssignedPage(prev => Math.max(1, prev - 1))}
                          className="h-7 w-7 rounded-[2px] border border-[#102C57]/20 flex items-center justify-center hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed text-[#102C57] cursor-pointer"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <span className="text-xs font-black text-[#102C57] px-1 font-mono">
                          {assignedPage} / {totalAssignedPages}
                        </span>
                        <button
                          type="button"
                          disabled={assignedPage === totalAssignedPages}
                          onClick={() => setAssignedPage(prev => Math.min(totalAssignedPages, prev + 1))}
                          className="h-7 w-7 rounded-[2px] border border-[#102C57]/20 flex items-center justify-center hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed text-[#102C57] cursor-pointer"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Add New Products (Now Paginated + Quick-Tags Filtered) */}
                  {addProductsOpen && <SettingsDialog label="เพิ่มสินค้าเข้าแผนก" busy={isLoadingAssigned} onClose={() => setAddProductsOpen(false)}>
                    <div className={styles.dialog}><header><h2>เพิ่มสินค้าเข้าแผนก · {selectedDepartment.code}</h2><button type="button" disabled={isLoadingAssigned} aria-label="ปิด" onClick={() => setAddProductsOpen(false)}><X size={18} /></button></header>
                    {errorMessage && <p role="alert" className="mb-3 text-sm text-red-700">{errorMessage}</p>}
                    <div className="bg-white flex flex-col">
                    <div>
                      <h4 className="text-sm font-black text-[#102C57]">
                        ผูกสินค้าเพิ่มเติม
                      </h4>
                      <p className="text-xs font-bold text-[#102C57] mt-0.5">
                        ค้นหาและจัดแบ่งสินค้าในระบบเข้าสู่แผนกผลิต
                      </p>
                    </div>

                    <div className="mt-2.5 flex gap-1.5">
                      <div className="relative flex-1">
                        <input 
                          value={productSearch} 
                          onChange={(e) => setProductSearch(e.target.value)} 
                          placeholder="พิมพ์เพื่อค้นหา..." 
                          className="w-full h-9 rounded-[3px] border border-[#102C57]/20 bg-slate-50 pl-8 pr-3 text-xs font-bold text-[#102C57] outline-none focus:bg-white focus:border-[#d4af37] transition" 
                        />
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#102C57]" size={14} />
                      </div>
                      <button 
                        type="button" 
                        onClick={() => loadProducts("search", productSearch)}
                        className="h-9 px-3.5 rounded-[3px] bg-[var(--surface-navy,#102C57)] text-white text-xs font-bold hover:bg-[var(--surface-navy,#102C57)]/90 transition cursor-pointer"
                      >
                        ค้นหา
                      </button>
                    </div>

                    {/* Quick Filters / Preset Search Shortcuts */}
                    <div className="mt-2 flex flex-wrap gap-1 items-center bg-slate-50 p-1 rounded">
                      <span className="text-[10px] font-black text-[#102C57] uppercase font-mono mr-1.5 flex items-center gap-0.5 shrink-0">
                        <Tag size={10} className="text-[#d4af37]" /> ค้นหาด่วน:
                      </span>
                      {QUICK_TAGS.map((tag) => (
                        <button
                          key={tag.value}
                          type="button"
                          onClick={() => handleQuickTagFilter(tag.value)}
                          className={`px-2 py-0.5 text-[10px] font-black rounded-[2px] border transition cursor-pointer ${
                            productSearch === tag.value
                              ? "bg-[#fff8e2] border-[#d4af37] text-[#102C57]"
                              : "bg-white border-slate-350 text-[#102C57] hover:bg-slate-100"
                          }`}
                        >
                          {tag.label}
                        </button>
                      ))}
                      {productSearch && (
                        <button
                          type="button"
                          onClick={() => handleQuickTagFilter("")}
                          className="px-2 py-0.5 text-[10px] font-black rounded-[2px] bg-red-100 border border-red-200 text-red-800 hover:bg-red-200 cursor-pointer"
                        >
                          ล้างคำค้น
                        </button>
                      )}
                    </div>

                    {/* Paginated Available Products Checklist */}
                    <div className="overflow-hidden border border-[#102C57]/10 rounded-[2px] mt-3 flex-1 flex flex-col bg-white">
                      <table className="w-full text-xs border-collapse table-fixed">
                        <colgroup>
                          <col className="w-[35px]" />
                          <col className="w-[95px]" />
                          <col />
                        </colgroup>
                        <tbody className="divide-y divide-[#102C57]/5 flex-1 overflow-y-auto">
                          {paginatedAvailableProducts.map((item) => {
                            const isAssigned = assignedSkuSet.has(item.sku_code);
                            const isChecked = selectedProducts.has(item.sku_code);
                            return (
                              <tr 
                                key={item.sku_code} 
                                onClick={() => !isAssigned && toggleSetValue(setSelectedProducts, item.sku_code)}
                                className={`cursor-pointer transition text-xs font-bold text-[#102C57] ${
                                  isAssigned 
                                    ? "bg-slate-50 opacity-60 cursor-not-allowed" 
                                    : isChecked 
                                      ? "bg-[#fff8e2]" 
                                      : "hover:bg-slate-50"
                                }`}
                              >
                                <td className="px-2 py-2 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                                  <input 
                                    type="checkbox" 
                                    disabled={!canManage || isAssigned} 
                                    checked={isChecked || isAssigned} 
                                    onChange={() => !isAssigned && toggleSetValue(setSelectedProducts, item.sku_code)}
                                    className="h-4 w-4 rounded-[2px] border-[#102C57]/20 accent-[#102C57]" 
                                  />
                                </td>
                                <td className="px-1 py-2 font-mono text-xs font-black text-[#102C57] truncate align-middle">
                                  {item.sku_code}
                                </td>
                                <td className="px-1.5 py-2 font-black text-[#102C57] truncate align-middle">
                                  {item.sku_name}
                                </td>
                              </tr>
                            );
                          })}
                          {!products.length && !isLoadingProducts ? (
                            <tr>
                              <td colSpan={3} className="py-12 text-center text-xs font-bold text-[#102C57]">
                                ไม่พบสินค้าพร้อมผูกเพิ่ม
                              </td>
                            </tr>
                          ) : null}
                          {isLoadingProducts && (
                            <tr>
                              <td colSpan={3} className="py-12 text-center text-xs font-bold text-[#102C57]">
                                <Loader2 className="animate-spin inline-block mr-2" size={14} />
                                กำลังโหลด...
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination for Available Products */}
                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                      <span className="text-xs font-mono font-black text-[#102C57]">
                        {isLoadingProducts ? "กำลังโหลด..." : `แสดง ${products.length} รายการในหน้านี้`}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={availablePage === 1 || isLoadingProducts}
                          onClick={() => loadProducts("previous")}
                          className="h-7 w-7 rounded-[2px] border border-[#102C57]/20 flex items-center justify-center hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed text-[#102C57] cursor-pointer"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <span className="text-xs font-black text-[#102C57] px-1 font-mono">
                          หน้า {availablePage}
                        </span>
                        <button
                          type="button"
                          disabled={!availableHasMore || isLoadingProducts}
                          onClick={() => loadProducts("next")}
                          className="h-7 w-7 rounded-[2px] border border-[#102C57]/20 flex items-center justify-center hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed text-[#102C57] cursor-pointer"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>

                    <button 
                      type="button" 
                      onClick={handleAssignProducts} 
                      disabled={!selectedDepartmentId || !selectedProducts.size || !canManage || isLoadingAssigned} 
                      className="mt-3.5 w-full h-9 rounded-[3px] bg-[#d4af37] text-[#102C57] text-xs font-black flex items-center justify-center gap-2 hover:bg-[#c39e2b] transition disabled:opacity-50 shadow-sm border border-[#d4af37] cursor-pointer"
                    >
                      <CheckSquare size={14} />
                      <span>ผูกสินค้าที่เลือกเข้าแผนก ({selectedProducts.size})</span>
                    </button>
                    </div></div></SettingsDialog>}
                </div>
              )}

              {/* Sub-tab 2: Department Product Subcategories */}
              {activeSubTab === "subcategories" && (
                <div className={styles.categoryLayout}>
                  <div className={styles.categoryList}>
                    <div>
                      <h4 className="text-sm font-black text-[#102C57]">หมวดหมู่ย่อยในแผนก</h4>
                      <p className="mt-0.5 text-xs font-bold text-[#102C57]">
                        แยกกลุ่มสินค้าเพื่อค้นหาและจัดการได้ง่ายขึ้น
                      </p>
                    </div>

                    <div className="mt-3 rounded-[3px] border border-[#d4af37]/40 bg-[#fff8e2]/50 p-2.5">
                      <div>
                        <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-[#102C57]">
                          สร้างหมวดหมู่ย่อยใหม่ในแผนกนี้
                        </span>
                        <div className="flex gap-2">
                          <input
                            aria-label="ชื่อหมวดหมู่ย่อยใหม่"
                            value={newSubcategoryName}
                            onChange={(event) => setNewSubcategoryName(event.target.value)}
                            maxLength={80}
                            placeholder="เช่น เนื้อขนม, เปลือกขนม, ครีม"
                            disabled={!canManage || isLoadingAssigned}
                            className="h-9 min-w-0 flex-1 rounded-[3px] border border-[#102C57]/20 bg-white px-3 text-xs font-bold text-[#102C57] outline-none focus:border-[#d4af37]"
                          />
                          <button
                            type="button"
                            onClick={handleCreateSubcategory}
                            disabled={!newSubcategoryName.trim() || !canManage || isLoadingAssigned}
                            className="flex h-9 shrink-0 items-center justify-center rounded-[3px] bg-[var(--surface-navy,#102C57)] px-3 text-xs font-black text-white transition hover:bg-[#173f70] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Plus size={14} />
                            <span className="sr-only">สร้างหมวดใหม่</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="mt-3 flex-1 overflow-y-auto rounded-[2px] border border-[#102C57]/10">
                      <button
                        type="button"
                        onClick={() => setSelectedSubcategoryId("")}
                        className={`flex w-full items-center justify-between border-b border-[#102C57]/5 px-3 py-2.5 text-left text-xs font-black transition ${
                          selectedSubcategoryId === ""
                            ? "bg-[var(--surface-navy,#102C57)] text-white"
                            : "text-[#102C57] hover:bg-slate-50"
                        }`}
                      >
                        <span>ยังไม่จัดหมวด / ล้างหมวด</span>
                        <span>{unassignedCount}</span>
                      </button>
                      {subcategories.map((subcategory) => {
                        const assignedCount = subcategoryCountMap.get(subcategory.id) || 0;
                        const isSelected = selectedSubcategoryId === subcategory.id;
                        return (
                          <div
                            key={subcategory.id}
                            className={`flex items-center border-b border-[#102C57]/5 last:border-b-0 ${
                              isSelected ? "bg-[var(--surface-navy,#102C57)] text-white" : "text-[#102C57] hover:bg-slate-50"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => setSelectedSubcategoryId(subcategory.id)}
                              className="flex min-w-0 flex-1 items-center justify-between px-3 py-2.5 text-left text-xs font-black"
                            >
                              <span className="truncate">{subcategory.name}</span>
                              <span className="ml-2">{assignedCount}</span>
                            </button>
                            {canManage ? (
                              <div className="flex shrink-0 items-center pr-1">
                                <button
                                  type="button"
                                  aria-label={`แก้ไขหมวด ${subcategory.name}`}
                                  title="แก้ไขชื่อหมวด"
                                  onClick={() => handleRenameSubcategory(subcategory)}
                                  disabled={isLoadingAssigned}
                                  className="rounded p-1.5 hover:bg-white/15 disabled:opacity-40"
                                >
                                  <Pencil size={13} />
                                </button>
                                <button
                                  type="button"
                                  aria-label={`ลบหมวด ${subcategory.name}`}
                                  title={assignedCount ? "ต้องย้ายหรือล้างสินค้าก่อนลบ" : "ลบหมวด"}
                                  onClick={() => handleDeleteSubcategory(subcategory)}
                                  disabled={isLoadingAssigned}
                                  className="rounded p-1.5 hover:bg-red-500/20 disabled:opacity-40"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                      {!subcategories.length ? (
                        <p className="px-3 py-10 text-center text-xs font-bold text-[#102C57]/60">
                          ยังไม่มีหมวดหมู่ย่อย
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className={styles.categoryProducts}>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <h4 className="text-sm font-black text-[#102C57]">จัดสินค้าเข้าหมวด</h4>
                        <p className="mt-0.5 text-xs font-bold text-[#102C57]">
                          {selectedSubcategoryId
                            ? `หมวดที่เลือก: “${subcategories.find((s) => s.id === selectedSubcategoryId)?.name || ""}”`
                            : "เลือกสินค้าแล้วกดเพิ่มเข้าหมวด หรือล้างหมวด"}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        {selectedSubcategoryId ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleSetProductSubcategory("add")}
                              disabled={!selectedAssignedProducts.size || !canManage || isLoadingAssigned}
                              className="h-9 shrink-0 rounded-[3px] bg-[#d4af37] px-4 text-xs font-black text-[#102C57] transition hover:bg-[#c39e2b] disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              เพิ่มเข้าหมวดที่เลือก ({selectedAssignedProducts.size})
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSetProductSubcategory("remove")}
                              disabled={!selectedAssignedProducts.size || !canManage || isLoadingAssigned}
                              className="h-9 shrink-0 rounded-[3px] border border-red-300 bg-red-50 px-3 text-xs font-black text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              นำออกจากหมวด ({selectedAssignedProducts.size})
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleSetProductSubcategory("clear")}
                            disabled={!selectedAssignedProducts.size || !canManage || isLoadingAssigned}
                            className="h-9 shrink-0 rounded-[3px] border border-red-300 bg-red-50 px-4 text-xs font-black text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            ล้างหมวดทั้งหมดให้สินค้าที่เลือก ({selectedAssignedProducts.size})
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="relative my-3">
                      <input
                        value={assignedSearch}
                        onChange={(event) => {
                          setAssignedSearch(event.target.value);
                          setAssignedPage(1);
                        }}
                        placeholder="ค้นหารหัส ชื่อสินค้า หรือหมวดหมู่ย่อย..."
                        className="h-9 w-full rounded-[3px] border border-[#102C57]/20 bg-slate-50 pl-9 pr-3 text-xs font-bold text-[#102C57] outline-none transition focus:border-[#d4af37] focus:bg-white"
                      />
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#102C57]" size={14} />
                    </div>

                    <div className="flex-1 overflow-y-auto rounded-[2px] border border-[#102C57]/10">
                      <table className="w-full table-fixed border-collapse text-xs text-[#102C57]">
                        <colgroup>
                          <col className="w-[44px]" />
                          <col className="w-[115px]" />
                          <col />
                          <col className="w-[150px]" />
                        </colgroup>
                        <thead className="sticky top-0 z-10 border-b border-[#102C57]/10 bg-[#eef3f8] font-black uppercase tracking-wider">
                          <tr>
                            <th className="px-2 py-2.5 text-center">เลือก</th>
                            <th className="px-2 py-2.5 text-left">รหัส SKU</th>
                            <th className="px-2 py-2.5 text-left">รายการสินค้า</th>
                            <th className="px-2 py-2.5 text-left">หมวดปัจจุบัน</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#102C57]/5">
                          {paginatedAssignedProducts.map((item) => {
                            const isChecked = selectedAssignedProducts.has(item.sku_code);
                            return (
                              <tr
                                key={item.sku_code}
                                onClick={() => toggleSetValue(setSelectedAssignedProducts, item.sku_code)}
                                className={`cursor-pointer font-bold transition hover:bg-slate-50 ${isChecked ? "bg-[#fff8e2]" : ""}`}
                              >
                                <td className="px-2 py-2 text-center" onClick={(event) => event.stopPropagation()}>
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => toggleSetValue(setSelectedAssignedProducts, item.sku_code)}
                                    disabled={!canManage || isLoadingAssigned}
                                    className="h-4 w-4 rounded-[2px] border-[#102C57]/20 accent-[#102C57]"
                                  />
                                </td>
                                <td className="px-2 py-2 font-mono font-black">{item.sku_code}</td>
                                <td className="truncate px-2 py-2 font-black">{item.sku_name}</td>
                                <td className="px-2 py-2 text-[11px] font-black text-[#7b6215] align-middle">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="truncate">{item.subcategory_name || "—"}</span>
                                    {Array.isArray(item.subcategories) && item.subcategories.length > 1 && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setViewingProductSubcategories(item);
                                        }}
                                        title="คลิกเพื่อดูหมวดหมู่ทั้งหมด"
                                        className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-[3px] bg-[#d4af37]/20 hover:bg-[#d4af37]/35 text-[#102C57] font-mono text-[10px] font-bold border border-[#d4af37]/50 cursor-pointer transition shrink-0"
                                      >
                                        <span>+{item.subcategories.length - 1}</span>
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                          {!filteredAssignedProducts.length && !isLoadingAssigned ? (
                            <tr>
                              <td colSpan={4} className="py-12 text-center text-sm font-bold">
                                ไม่พบสินค้าผูกที่สอดคล้อง
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>

                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                      <span className="text-xs font-mono font-black text-[#102C57]">
                        แสดง {filteredAssignedProducts.length > 0 ? (assignedPage - 1) * ITEMS_PER_PAGE + 1 : 0} - {Math.min(assignedPage * ITEMS_PER_PAGE, filteredAssignedProducts.length)} จาก {filteredAssignedProducts.length} รายการ
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={assignedPage === 1}
                          onClick={() => setAssignedPage((previous) => Math.max(1, previous - 1))}
                          className="h-7 w-7 rounded-[2px] border border-[#102C57]/20 flex items-center justify-center text-[#102C57] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <span className="px-1 text-xs font-mono font-black text-[#102C57]">
                          {assignedPage} / {totalAssignedPages}
                        </span>
                        <button
                          type="button"
                          disabled={assignedPage === totalAssignedPages}
                          onClick={() => setAssignedPage((previous) => Math.min(totalAssignedPages, previous + 1))}
                          className="h-7 w-7 rounded-[2px] border border-[#102C57]/20 flex items-center justify-center text-[#102C57] hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Sub-tab 3: Users Mapping (Redesigned with Pagination & Filter) */}
              {activeSubTab === "users" && (
                <div className={styles.users}>
                  
                  {/* Left Column: Current Users List (Paginated + Filtered) */}
                  <div className={styles.assigned}>
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
                      <div>
                        <h4 className="text-sm font-black text-[#102C57]">
                          บุคลากรประจำแผนก
                        </h4>
                        <p className="text-xs font-bold text-[#102C57] mt-0.5">
                          รายชื่อสมาชิกทั้งหมด ({filteredAssignedUsers.length} คน)
                        </p>
                      </div>
                      <button 
                        type="button" 
                        onClick={handleUnassignUsers} 
                        disabled={!selectedAssignedUsers.size || !canManage || isLoadingAssigned} 
                        className="h-7.5 px-3 rounded-[2px] border border-red-300 bg-red-50 text-xs font-black text-red-650 flex items-center gap-1 hover:bg-red-100/70 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <Trash2 size={13} />
                        <span>ยกเลิกผู้ใช้ที่เลือก ({selectedAssignedUsers.size})</span>
                      </button>
                    </div>

                    <div className={styles.userSearchRow}><button type="button" className={styles.addUserButton} disabled={!canManage} onClick={() => { setAvailableUserPage(1); setAddUsersOpen(true); }}><Plus size={15} />เพิ่มผู้ใช้งาน</button></div>
                    <div className="relative mb-3.5">
                      <input 
                        value={assignedUserSearch} 
                        onChange={(e) => {
                          setAssignedUserSearch(e.target.value);
                          setAssignedUserPage(1); // reset to page 1
                        }}
                        placeholder="พิมพ์เพื่อค้นหาชื่อสมาชิก..." 
                        className="w-full h-9 rounded-[3px] border border-[#102C57]/20 bg-slate-50 pl-9 pr-3 text-xs font-bold text-[#102C57] outline-none focus:bg-white focus:border-[#d4af37] transition"
                      />
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#102C57]" size={14} />
                    </div>

                    <div className="overflow-hidden border border-[#102C57]/10 rounded-[2px] flex-1 flex flex-col bg-white">
                      <table className="w-full text-xs text-[#102C57] border-collapse table-fixed">
                        <colgroup>
                          <col className="w-[40px]" />
                          <col />
                          <col className="w-[120px]" />
                        </colgroup>
                        <thead className="bg-[#eef3f8] border-b border-[#102C57]/10 text-xs font-black uppercase tracking-wider text-[#102C57]">
                          <tr>
                            <th className="px-3 py-2.5 text-center">เลือก</th>
                            <th className="px-3 py-2.5 text-left">ผู้ใช้งาน</th>
                            <th className="px-3 py-2.5 text-left">สิทธิ์การทำงาน</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#102C57]/5 flex-1 overflow-y-auto">
                          {paginatedAssignedUsers.map((item) => (
                            <tr key={item.user_id} className="hover:bg-slate-50 transition cursor-pointer text-xs font-bold" onClick={() => toggleSetValue(setSelectedAssignedUsers, item.user_id)}>
                              <td className="px-3 py-3 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                                <input 
                                  type="checkbox" 
                                  checked={selectedAssignedUsers.has(item.user_id)} 
                                  onChange={() => toggleSetValue(setSelectedAssignedUsers, item.user_id)} 
                                  disabled={!canManage || isLoadingAssigned} 
                                  className="h-4 w-4 rounded-[2px] border-[#102C57]/20 accent-[#102C57]" 
                                />
                              </td>
                              <td className="px-3 py-3 font-black text-[#102C57] align-middle">
                                {item.username}
                              </td>
                              <td className="px-3 py-3 align-middle">
                                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider ${
                                  item.role === "viewer"
                                    ? "bg-slate-100 text-slate-900 border border-slate-300"
                                    : "bg-emerald-50 border border-emerald-300 text-emerald-950"
                                }`}>
                                  {item.role === "viewer" ? "ดูอย่างเดียว (Viewer)" : "แก้ไขได้ (Editor)"}
                                </span>
                              </td>
                            </tr>
                          ))}
                          {!filteredAssignedUsers.length && !isLoadingAssigned ? (
                            <tr>
                              <td colSpan={3} className="py-12 text-center text-xs font-bold text-[#102C57]">
                                ไม่พบข้อมูลสมาชิกที่ตรงเงื่อนไข
                              </td>
                            </tr>
                          ) : null}
                          {isLoadingAssigned && (
                            <tr>
                              <td colSpan={3} className="py-12 text-center text-xs font-bold text-[#102C57]">
                                <Loader2 className="animate-spin inline-block mr-2" size={16} />
                                กำลังดำเนินการ...
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination for Assigned Users */}
                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                      <span className="text-xs font-mono font-black text-[#102C57]">
                        แสดง {filteredAssignedUsers.length > 0 ? (assignedUserPage - 1) * ITEMS_PER_PAGE + 1 : 0} - {Math.min(assignedUserPage * ITEMS_PER_PAGE, filteredAssignedUsers.length)} จาก {filteredAssignedUsers.length} คน
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={assignedUserPage === 1}
                          onClick={() => setAssignedUserPage(prev => Math.max(1, prev - 1))}
                          className="h-7 w-7 rounded-[2px] border border-[#102C57]/20 flex items-center justify-center hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed text-[#102C57] cursor-pointer"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <span className="text-xs font-black text-[#102C57] px-1 font-mono">
                          {assignedUserPage} / {totalAssignedUserPages}
                        </span>
                        <button
                          type="button"
                          disabled={assignedUserPage === totalAssignedUserPages}
                          onClick={() => setAssignedUserPage(prev => Math.min(totalAssignedUserPages, prev + 1))}
                          className="h-7 w-7 rounded-[2px] border border-[#102C57]/20 flex items-center justify-center hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed text-[#102C57] cursor-pointer"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Right Column: Add New Users (Paginated + Filter) */}
                  {addUsersOpen && <SettingsDialog label="เพิ่มผู้ใช้งานในแผนก" busy={isLoadingAssigned} onClose={() => setAddUsersOpen(false)}><div className={styles.dialog}><header><h2>เพิ่มผู้ใช้งาน · {selectedDepartment.code}</h2><button type="button" aria-label="ปิด" disabled={isLoadingAssigned} onClick={() => setAddUsersOpen(false)}><X size={18} /></button></header>{errorMessage && <p role="alert" className="text-sm text-red-700">{errorMessage}</p>}<div className="bg-white flex flex-col">
                    <div>
                      <h4 className="text-xs font-black text-[#102C57]">
                        เพิ่มผู้ใช้งานในแผนก
                      </h4>
                      <p className="text-xs font-bold text-[#102C57] mt-0.5">
                        ค้นหาและดึงบุคลากรในระบบเข้ามาผูกเพิ่ม
                      </p>
                    </div>

                    <div className="mt-2.5 flex gap-1.5">
                      <div className="relative flex-1">
                        <input 
                          value={userSearch} 
                          onChange={(e) => setUserSearch(e.target.value)} 
                          placeholder="ค้นหาชื่อผู้ใช้..." 
                          className="w-full h-9 rounded-[3px] border border-[#102C57]/20 bg-slate-50 pl-8 pr-3 text-xs font-bold text-[#102C57] outline-none focus:bg-white focus:border-[#d4af37] transition" 
                        />
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#102C57]" size={14} />
                      </div>
                      <button 
                        type="button" 
                        onClick={async () => setUsers(await loadUsers())} 
                        className="h-9 px-3.5 rounded-[3px] bg-[var(--surface-navy,#102C57)] text-white text-xs font-bold hover:bg-[var(--surface-navy,#102C57)]/90 transition cursor-pointer"
                      >
                        ค้นหา
                      </button>
                    </div>

                    <div className="mt-2.5">
                      <label className="mb-1 block text-xs font-black uppercase tracking-wider text-[#102C57]">
                        ระดับสิทธิ์ที่จะมอบให้
                      </label>
                      <select 
                        value={selectedUserRole} 
                        onChange={(e) => setSelectedUserRole(e.target.value)} 
                        className="h-8.5 w-full rounded-[3px] border border-[#102C57]/20 bg-white px-2.5 text-xs font-bold text-[#102C57] outline-none focus:border-[#d4af37] transition cursor-pointer"
                      >
                        {ROLE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="overflow-hidden border border-[#102C57]/10 rounded-[2px] mt-3 flex-1 flex flex-col bg-white">
                      <table className="w-full text-xs border-collapse table-fixed">
                        <colgroup>
                          <col className="w-[35px]" />
                          <col />
                          <col className="w-[100px]" />
                        </colgroup>
                        <tbody className="divide-y divide-[#102C57]/5 flex-1 overflow-y-auto">
                          {paginatedAvailableUsers.map((item) => {
                            const isAssigned = assignedUserSet.has(item.id);
                            const isChecked = selectedUsers.has(item.id);
                            return (
                              <tr 
                                key={item.id} 
                                onClick={() => !isAssigned && toggleSetValue(setSelectedUsers, item.id)}
                                className={`cursor-pointer transition text-xs font-bold text-[#102C57] ${
                                  isAssigned 
                                    ? "bg-slate-50 opacity-60 cursor-not-allowed" 
                                    : isChecked 
                                      ? "bg-[#fff8e2]" 
                                      : "hover:bg-slate-50"
                                }`}
                              >
                                <td className="px-2 py-2 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                                  <input 
                                    type="checkbox" 
                                    disabled={!canManage || isAssigned} 
                                    checked={isChecked || isAssigned} 
                                    onChange={() => !isAssigned && toggleSetValue(setSelectedUsers, item.id)}
                                    className="h-4 w-4 rounded-[2px] border-[#102C57]/20 accent-[#102C57]" 
                                  />
                                </td>
                                <td className="px-1 py-2 font-black text-[#102C57] truncate align-middle">
                                  {item.username}
                                </td>
                                <td className="px-1 py-2 text-right align-middle">
                                  {isAssigned ? (
                                    <span className="text-[9px] font-black tracking-wider text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-[2px] border border-emerald-100 uppercase">
                                      เป็นสมาชิก
                                    </span>
                                  ) : (
                                    <span className="text-xs font-bold text-[#102C57] truncate block max-w-[90px]">
                                      {item.home_department?.name || "ไม่มีสังกัด"}
                                    </span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                          {!users.length && !isLoadingUsers ? (
                            <tr>
                              <td colSpan={3} className="py-12 text-center text-xs font-bold text-[#102C57]">
                                ไม่พบผู้ใช้ในระบบพร้อมเพิ่ม
                              </td>
                            </tr>
                          ) : null}
                          {isLoadingUsers && (
                            <tr>
                              <td colSpan={3} className="py-12 text-center text-xs font-bold text-[#102C57]">
                                <Loader2 className="animate-spin inline-block mr-2" size={14} />
                                กำลังโหลด...
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination for Available Users */}
                    <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                      <span className="text-xs font-mono font-black text-[#102C57]">
                        แสดง {users.length > 0 ? (availableUserPage - 1) * ITEMS_PER_PAGE + 1 : 0} - {Math.min(availableUserPage * ITEMS_PER_PAGE, users.length)} จาก {users.length} คน
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={availableUserPage === 1}
                          onClick={() => setAvailableUserPage(prev => Math.max(1, prev - 1))}
                          className="h-7 w-7 rounded-[2px] border border-[#102C57]/20 flex items-center justify-center hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed text-[#102C57] cursor-pointer"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <span className="text-xs font-black text-[#102C57] px-1 font-mono">
                          {availableUserPage} / {totalAvailableUserPages}
                        </span>
                        <button
                          type="button"
                          disabled={availableUserPage === totalAvailableUserPages}
                          onClick={() => setAvailableUserPage(prev => Math.min(totalAvailableUserPages, prev + 1))}
                          className="h-7 w-7 rounded-[2px] border border-[#102C57]/20 flex items-center justify-center hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed text-[#102C57] cursor-pointer"
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>

                    <button 
                      type="button" 
                      onClick={handleAssignUsers} 
                      disabled={!selectedDepartmentId || !selectedUsers.size || !canManage || isLoadingAssigned} 
                      className="mt-3.5 w-full h-9 rounded-[3px] bg-[#d4af37] text-[#102C57] text-xs font-black flex items-center justify-center gap-2 hover:bg-[#c39e2b] transition disabled:opacity-50 shadow-sm border border-[#d4af37] cursor-pointer"
                    >
                      <UserCheck size={14} />
                      <span>มอบสิทธิ์ผู้ใช้ที่เลือก ({selectedUsers.size} คน)</span>
                    </button>
                    </div></div></SettingsDialog>}
                </div>
              )}
            </>
          ) : (
            <div className="bg-white border border-dashed border-[#102C57]/20 rounded-[3px] py-24 text-center">
              <Layers size={40} className="text-[#102C57]/30 mx-auto mb-3" />
              <h3 className="text-base font-black text-[#102C57]">
                ยังไม่ได้เลือกแผนก
              </h3>
              <p className="text-sm font-bold text-[#102C57] mt-1 max-w-sm mx-auto">
                กรุณาเลือกแผนกทางด้านซ้ายเพื่อจัดการสินค้าในความรับผิดชอบ รหัสแผนก ERP และมอบสิทธิ์สมาชิกผู้ใช้งาน
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Modal for viewing and managing multiple subcategories of a single product */}
      {viewingProductSubcategories && (
        <SettingsDialog
          label="หมวดหมู่ย่อยทั้งหมด"
          busy={isLoadingAssigned}
          onClose={() => setViewingProductSubcategories(null)}
        >
          <div className={styles.dialog}>
            <header>
              <div>
                <h2>หมวดหมู่ย่อยของสินค้า</h2>
                <p className="text-xs font-mono font-bold text-[#102C57]/70 mt-0.5">
                  {viewingProductSubcategories.sku_code} · {viewingProductSubcategories.sku_name}
                </p>
              </div>
              <button
                type="button"
                disabled={isLoadingAssigned}
                aria-label="ปิด"
                onClick={() => setViewingProductSubcategories(null)}
              >
                <X size={18} />
              </button>
            </header>

            <div className="bg-white flex flex-col p-1">
              <h4 className="text-xs font-black text-[#102C57] mb-2 uppercase tracking-wider">
                หมวดหมู่ย่อยที่สังกัดอยู่ ({viewingProductSubcategories.subcategories?.length || 0})
              </h4>

              <div className="overflow-hidden border border-[#102C57]/10 rounded-[2px] mb-4">
                <table className="w-full text-xs border-collapse">
                  <thead className="bg-[#eef3f8] border-b border-[#102C57]/10 text-xs font-black text-[#102C57]">
                    <tr>
                      <th className="px-3 py-2 text-left">ชื่อหมวดหมู่ย่อย</th>
                      <th className="px-3 py-2 text-center w-[100px]">สถานะ</th>
                      {canManage && <th className="px-3 py-2 text-center w-[140px]">จัดการ</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#102C57]/5">
                    {(viewingProductSubcategories.subcategories || []).map((sub) => {
                      const isPrimary = sub.is_primary || sub.id === viewingProductSubcategories.subcategory_id;
                      return (
                        <tr key={sub.id} className="hover:bg-slate-50 font-bold">
                          <td className="px-3 py-2 text-[#102C57]">{sub.name}</td>
                          <td className="px-3 py-2 text-center">
                            {isPrimary ? (
                              <span className="inline-block px-2 py-0.5 rounded-[2px] bg-[#fff8e2] border border-[#d4af37] text-[#102C57] text-[10px] font-black">
                                ★ หมวดหลัก
                              </span>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-normal">หมวดเสริม</span>
                            )}
                          </td>
                          {canManage && (
                            <td className="px-3 py-2 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                {!isPrimary && (
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      setIsLoadingAssigned(true);
                                      await updateDepartmentProductSubcategory(
                                        selectedDepartmentId,
                                        [viewingProductSubcategories.sku_code],
                                        sub.id,
                                        "set_primary"
                                      );
                                      await loadAssigned(selectedDepartmentId);
                                      setViewingProductSubcategories((prev) => {
                                        if (!prev) return null;
                                        return {
                                          ...prev,
                                          subcategory_id: sub.id,
                                          subcategory_name: sub.name,
                                          subcategories: prev.subcategories.map((s) => ({
                                            ...s,
                                            is_primary: s.id === sub.id,
                                          })),
                                        };
                                      });
                                      setIsLoadingAssigned(false);
                                    }}
                                    className="px-2 py-1 text-[10px] font-bold rounded bg-slate-100 hover:bg-slate-200 text-[#102C57]"
                                  >
                                    ตั้งเป็นหลัก
                                  </button>
                                )}
                                <button
                                  type="button"
                                  title="นำออกจากหมวดนี้"
                                  onClick={async () => {
                                    setIsLoadingAssigned(true);
                                    await updateDepartmentProductSubcategory(
                                      selectedDepartmentId,
                                      [viewingProductSubcategories.sku_code],
                                      sub.id,
                                      "remove"
                                    );
                                    await loadAssigned(selectedDepartmentId);
                                    setViewingProductSubcategories((prev) => {
                                      if (!prev) return null;
                                      const remaining = prev.subcategories.filter((s) => s.id !== sub.id);
                                      const newPrimary = remaining[0];
                                      return {
                                        ...prev,
                                        subcategory_id: newPrimary?.id || null,
                                        subcategory_name: newPrimary?.name || "",
                                        subcategories: remaining.map((s, idx) => ({
                                          ...s,
                                          is_primary: idx === 0,
                                        })),
                                      };
                                    });
                                    setIsLoadingAssigned(false);
                                  }}
                                  className="p-1 rounded text-red-600 hover:bg-red-50"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {(!viewingProductSubcategories.subcategories || !viewingProductSubcategories.subcategories.length) && (
                      <tr>
                        <td colSpan={canManage ? 3 : 2} className="py-4 text-center text-slate-400">
                          ยังไม่มีหมวดหมู่ย่อย
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {canManage && (
                <div className="mt-auto border-t border-slate-100 pt-3">
                  <span className="block text-[11px] font-black text-[#102C57] mb-1">
                    เพิ่มเข้าหมวดหมู่อื่นเพิ่มเติม:
                  </span>
                  <div className="flex gap-2">
                    <select
                      value={selectedAddMoreSubcategoryId}
                      onChange={(e) => setSelectedAddMoreSubcategoryId(e.target.value)}
                      className="h-8 flex-1 rounded border border-[#102C57]/20 bg-slate-50 px-2 text-xs font-bold text-[#102C57]"
                    >
                      <option value="">-- เลือกหมวดหมู่ย่อยที่ต้องการเพิ่ม --</option>
                      {subcategories
                        .filter(
                          (s) =>
                            !viewingProductSubcategories.subcategories?.some(
                              (existing) => existing.id === s.id
                            )
                        )
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      disabled={!selectedAddMoreSubcategoryId || isLoadingAssigned}
                      onClick={async () => {
                        if (!selectedAddMoreSubcategoryId) return;
                        setIsLoadingAssigned(true);
                        await updateDepartmentProductSubcategory(
                          selectedDepartmentId,
                          [viewingProductSubcategories.sku_code],
                          selectedAddMoreSubcategoryId,
                          "add"
                        );
                        await loadAssigned(selectedDepartmentId);
                        const addedSub = subcategories.find((s) => s.id === selectedAddMoreSubcategoryId);
                        setSelectedAddMoreSubcategoryId("");
                        setViewingProductSubcategories((prev) => {
                          if (!prev) return null;
                          const exists = prev.subcategories?.some((s) => s.id === addedSub?.id);
                          if (exists) return prev;
                          return {
                            ...prev,
                            subcategories: [
                              ...(prev.subcategories || []),
                              { id: addedSub.id, name: addedSub.name, is_primary: false },
                            ],
                          };
                        });
                        setIsLoadingAssigned(false);
                      }}
                      className="h-8 px-3 rounded bg-[var(--surface-navy,#102C57)] text-white text-xs font-black hover:bg-[var(--surface-navy,#102C57)]/90 disabled:opacity-40"
                    >
                      <Plus size={13} className="inline mr-1" /> เพิ่ม
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </SettingsDialog>
      )}

      {/* Modern Chiaroscuro Add/Edit Modal */}
      {isModalOpen && canManage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-[2px] animate-fadeIn">
          <div className="w-full max-w-lg overflow-hidden bg-white shadow-2xl border border-[#102C57]/20 rounded-[4px] transform scale-100 transition duration-300">
            {/* Modal Header */}
            <div className="flex items-center justify-between bg-[var(--surface-navy,#102C57)] px-6 py-4 text-white">
              <div>
                <span className="text-[10px] font-black tracking-[0.25em] text-[#d4af37] uppercase font-mono block">
                  DEPARTMENT CONFIGURATION
                </span>
                <h2 className="text-lg font-black mt-0.5">
                  {form.id ? "แก้ไขข้อมูลแผนกผลิต" : "เพิ่มแผนกผลิตใหม่"}
                </h2>
              </div>
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)}
                className="h-8 w-8 rounded-full flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 transition cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="space-y-4 p-6 text-sm text-[#102C57] font-bold">
              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-wider text-[#102C57]">
                  รหัสแผนก / รหัส ERP (เช่น KP13, KP27)
                </label>
                <input 
                  value={form.code} 
                  onChange={(e) => setForm((prev) => ({ ...prev, code: e.target.value }))} 
                  placeholder="พิมพ์รหัสแผนกเพื่อใช้ใน Excel ใบเบิก..."
                  className="h-10 w-full rounded-[3px] border border-[#102C57]/25 px-3 outline-none focus:border-[#d4af37] transition font-black text-[#102C57]" 
                />
              </div>
              
              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-wider text-[#102C57]">
                  ชื่อแผนกผลิต
                </label>
                <input 
                  value={form.name} 
                  onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))} 
                  placeholder="พิมพ์ชื่อเรียกของแผนก..."
                  className="h-10 w-full rounded-[3px] border border-[#102C57]/25 px-3 outline-none focus:border-[#d4af37] transition font-black text-[#102C57]" 
                />
              </div>
              
              <div>
                <label className="mb-1 block text-xs font-black uppercase tracking-wider text-[#102C57]">
                  รายละเอียด / คำอธิบายแผนก
                </label>
                <textarea 
                  rows={3} 
                  value={form.description} 
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} 
                  placeholder="ข้อมูลเพิ่มเติมเกี่ยวกับสิทธิ์หรือหน้าที่ของแผนกนี้..."
                  className="w-full rounded-[3px] border border-[#102C57]/25 px-3 py-2 outline-none focus:border-[#d4af37] transition text-sm font-bold text-[#102C57]" 
                />
              </div>
              
              <div className="pt-2">
                <label className="inline-flex items-center gap-3 cursor-pointer text-sm font-black text-[#102C57] select-none">
                  <input
                    type="checkbox"
                    checked={Boolean(form.is_central_department)}
                    onChange={(e) => setForm((prev) => ({ ...prev, is_central_department: e.target.checked }))}
                    className="h-4.5 w-4.5 rounded-[2px] border-[#102C57]/20 accent-[#102C57]"
                  />
                  <span>กำหนดเป็น &quot;แผนกกลาง&quot; (เบิกรวมความต้องการให้หลายแผนก)</span>
                </label>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex justify-end gap-2 border-t border-slate-100 bg-[#eef3f8] px-6 py-4">
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)} 
                className="rounded-[3px] border border-[#102C57]/20 bg-white px-5 py-2 text-xs font-black text-[#102C57] hover:bg-slate-50 transition cursor-pointer"
              >
                ยกเลิก
              </button>
              <button 
                type="button" 
                onClick={handleSaveDepartment} 
                className="rounded-[3px] bg-[#d4af37] px-5 py-2 text-xs font-black text-[#102C57] hover:bg-[#c39e2b] transition border border-[#d4af37] shadow-sm cursor-pointer"
              >
                {form.id ? "บันทึกการแก้ไข" : "สร้างแผนกใหม่"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
