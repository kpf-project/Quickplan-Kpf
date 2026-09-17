"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
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
import {
  assignDepartmentProducts,
  assignDepartmentUsers,
  createProductionDepartment,
  deleteProductionDepartment,
  fetchDepartmentProducts,
  fetchDepartmentUsers,
  fetchProductsCache,
  fetchProductionDepartments,
  fetchProductionUsers,
  unassignDepartmentProducts,
  unassignDepartmentUsers,
  updateProductionDepartment,
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
  const [departmentSearch, setDepartmentSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [userSearch, setUserSearch] = useState("");
  const [selectedUserRole, setSelectedUserRole] = useState("editor");

  const [departments, setDepartments] = useState([]);
  const [products, setProducts] = useState([]);
  const [users, setUsers] = useState([]);
  const [assignedProducts, setAssignedProducts] = useState([]);
  const [assignedUsers, setAssignedUsers] = useState([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState(null);

  const [selectedProducts, setSelectedProducts] = useState(new Set());
  const [selectedAssignedProducts, setSelectedAssignedProducts] = useState(new Set());
  const [selectedUsers, setSelectedUsers] = useState(new Set());
  const [selectedAssignedUsers, setSelectedAssignedUsers] = useState(new Set());

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(DEFAULT_FORM);
  const [activeSubTab, setActiveSubTab] = useState("products"); // "products" or "users"
  
  // Client-side search and pagination states to prevent endless scrolling
  const [assignedSearch, setAssignedSearch] = useState("");
  const [assignedPage, setAssignedPage] = useState(1);
  const [availablePage, setAvailablePage] = useState(1);
  
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

  // Client-side filtering for Assigned Products
  const filteredAssignedProducts = useMemo(() => {
    const term = String(assignedSearch || "").trim().toLowerCase();
    if (!term) return assignedProducts;
    return assignedProducts.filter(item => 
      String(item.sku_code || "").toLowerCase().includes(term) ||
      String(item.sku_name || "").toLowerCase().includes(term)
    );
  }, [assignedProducts, assignedSearch]);

  // Paginated Assigned Products
  const paginatedAssignedProducts = useMemo(() => {
    const start = (assignedPage - 1) * ITEMS_PER_PAGE;
    return filteredAssignedProducts.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredAssignedProducts, assignedPage]);

  const totalAssignedPages = useMemo(() => {
    return Math.ceil(filteredAssignedProducts.length / ITEMS_PER_PAGE) || 1;
  }, [filteredAssignedProducts]);

  // Paginated Available Products
  const paginatedAvailableProducts = useMemo(() => {
    const start = (availablePage - 1) * ITEMS_PER_PAGE;
    return products.slice(start, start + ITEMS_PER_PAGE);
  }, [products, availablePage]);

  const totalAvailablePages = useMemo(() => {
    return Math.ceil(products.length / ITEMS_PER_PAGE) || 1;
  }, [products]);

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

  const loadProducts = useCallback(async (customSearchText = null) => {
    setIsLoadingProducts(true);
    const searchVal = customSearchText !== null ? customSearchText : productSearch;
    try {
      const result = await fetchProductsCache({
        page: "1",
        pageSize: "150",
        search: searchVal,
        iccatCodes: "03,04,04-1,04-2",
      });
      if (!result.ok) {
        setErrorMessage(result.error?.message || "โหลดสินค้าไม่สำเร็จ");
        return [];
      }
      setAvailablePage(1); // Reset page on new load
      return result.data?.data ?? [];
    } catch (err) {
      setErrorMessage("เกิดข้อผิดพลาดในการโหลดสินค้า");
      return [];
    } finally {
      setIsLoadingProducts(false);
    }
  }, [productSearch]);

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
      return;
    }
    setIsLoadingAssigned(true);
    try {
      const [productsResult, usersResult] = await Promise.all([
        fetchDepartmentProducts(departmentId),
        fetchDepartmentUsers(departmentId),
      ]);
      if (productsResult.ok) {
        setAssignedProducts(productsResult.data?.data ?? []);
      }
      if (usersResult.ok) {
        setAssignedUsers(usersResult.data?.data ?? []);
      }
      if (!productsResult.ok || !usersResult.ok) {
        setErrorMessage("โหลดข้อมูลการผูกแผนกไม่สำเร็จ");
      }
      // Reset pagination when department changes
      setAssignedPage(1);
      setAssignedUserPage(1);
      setAssignedSearch("");
      setAssignedUserSearch("");
      setSelectedAssignedProducts(new Set());
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
      const [nextDepartments, nextProducts, nextUsers] = await Promise.all([
        loadDepartments(),
        loadProducts(),
        loadUsers(),
      ]);
      if (!mounted) return;
      setDepartments(nextDepartments);
      setProducts(nextProducts);
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
    const nextProducts = await loadProducts(tagValue);
    setProducts(nextProducts);
  };

  return (
    <div className="w-full max-w-[1700px] mx-auto py-6 px-3 sm:px-6">
      {/* Premium Eyebrow Header */}
      <header className="mb-6 border-b border-[#102C57]/10 pb-5 flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <span className="text-xs font-black tracking-[0.25em] text-[#d4af37] uppercase font-mono block mb-1">
            DEPARTMENT & PRODUCTS SCOPE
          </span>
          <h1 className="text-3xl font-black text-[#102C57] tracking-tight">
            จัดการหมวดหมู่และขอบเขตแผนก
          </h1>
          <p className="text-sm font-bold text-[#102C57] mt-1">
            กำหนดรหัสแผนกของ ERP และบริหารจัดการสิทธิ์สินค้าความรับผิดชอบ รวมถึงสมาชิกบุคลากรในแต่ละส่วนการผลิต
          </p>
        </div>
        <button 
          type="button" 
          onClick={openCreateModal} 
          disabled={!canManage} 
          className="h-10 px-5 rounded-[3px] bg-[#d4af37] text-[#102C57] text-sm font-black flex items-center gap-2 hover:bg-[#c39e2b] transition duration-200 shadow-sm border border-[#d4af37] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <FolderPlus size={16} />
          <span>เพิ่มแผนกผลิตใหม่</span>
        </button>
      </header>

      {errorMessage ? (
        <div className="mb-6 rounded-[3px] border-l-4 border-red-500 bg-red-50 px-4 py-3 text-sm font-bold text-red-800 flex items-center justify-between shadow-sm animate-fadeIn">
          <span>{errorMessage}</span>
          <button type="button" onClick={() => setErrorMessage("")} className="text-red-800/80 hover:text-red-950">
            <X size={18} />
          </button>
        </div>
      ) : null}

      {/* Main Grid: Left sidebar for departments, Right workspace for details */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Side: Spacious Department List */}
        <section className="lg:col-span-3 bg-white border border-[#102C57]/10 rounded-[3px] shadow-sm overflow-hidden flex flex-col h-[700px]">
          <div className="bg-[#102C57] px-4 py-3.5 flex flex-col gap-2.5">
            <div className="flex justify-between items-center">
              <span className="text-xs font-black tracking-[0.2em] text-[#d4af37] uppercase font-mono">
                DEPARTMENTS ({departments.length})
              </span>
              {isLoadingDepartments && <Loader2 className="animate-spin text-[#d4af37]" size={14} />}
            </div>
            
            <div className="relative">
              <input 
                value={departmentSearch} 
                onChange={(e) => setDepartmentSearch(e.target.value)} 
                placeholder="ค้นหาชื่อแผนก / รหัสแผนก..." 
                className="w-full h-10 rounded-[3px] border border-white/10 bg-white/10 pl-10 pr-4 text-sm font-bold text-white placeholder-white/80 outline-none focus:bg-white/15 focus:border-[#d4af37] transition-all" 
              />
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/90" size={14} />
            </div>
          </div>

          <div className="overflow-y-auto p-2.5 space-y-2 flex-1 scrollbar-thin">
            {departments.map((department) => {
              const isSelected = selectedDepartmentId === department.id;
              return (
                <button 
                  key={department.id} 
                  type="button" 
                  onClick={async () => { 
                    setSelectedDepartmentId(department.id); 
                    await loadAssigned(department.id); 
                  }} 
                  className={`w-full rounded-[3px] border px-3.5 py-3.5 text-left transition-all duration-200 cursor-pointer ${
                    isSelected 
                      ? "border-[#d4af37] bg-[#fff8e2] shadow-sm relative before:absolute before:left-0 before:top-0 before:bottom-0 before:w-1 before:bg-[#d4af37]" 
                      : "border-[#102C57]/5 bg-white hover:bg-slate-50 hover:border-[#102C57]/20"
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <span className="text-xs font-mono font-black tracking-wider text-[#102C57] block uppercase">
                      {department.code}
                    </span>
                    {department.is_central_department ? (
                      <span className="rounded-full bg-[#102C57] px-2 py-0.5 text-[10px] font-black text-white tracking-wider uppercase">
                        แผนกกลาง
                      </span>
                    ) : null}
                  </div>
                  <h3 className={`text-base font-extrabold mt-1.5 tracking-tight text-[#102C57]`}>
                    {department.name}
                  </h3>
                  
                  <div className="mt-3 flex items-center justify-between text-xs font-extrabold text-[#102C57] pt-2 border-t border-[#102C57]/10 font-mono">
                    <span className="flex items-center gap-1.5">
                      <Package size={12} className="text-[#d4af37]" /> สินค้าผูก: <strong>{department.product_count || 0}</strong>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Users size={12} className="text-[#d4af37]" /> สมาชิก: <strong>{department.user_count || 0}</strong>
                    </span>
                  </div>
                </button>
              );
            })}
            {!departments.length && !isLoadingDepartments ? (
              <div className="py-12 text-center text-sm font-black text-[#102C57]">
                ไม่พบข้อมูลแผนกเบิกจ่าย
              </div>
            ) : null}
          </div>
        </section>

        {/* Right Side: Workspace with client-side paginated tables to prevent infinite scroll */}
        <section className="lg:col-span-9 flex flex-col gap-5">
          {selectedDepartment ? (
            <>
              {/* Department Header Spotlight */}
              <div className="bg-white border border-[#102C57]/10 rounded-[3px] p-5 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden">
                <div className="absolute right-0 top-0 translate-x-12 -translate-y-12 opacity-5 pointer-events-none">
                  <Layers size={180} className="text-[#102C57]" />
                </div>
                
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-black tracking-widest text-[#d4af37] uppercase bg-[#102C57] px-2.5 py-1 rounded-[2px]">
                      {selectedDepartment.code}
                    </span>
                    {selectedDepartment.is_central_department && (
                      <span className="text-[10px] font-black tracking-wider text-emerald-950 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-[2px] uppercase">
                        CENTRAL DEPT
                      </span>
                    )}
                  </div>
                  <h2 className="text-2xl font-black text-[#102C57] mt-2 tracking-tight">
                    {selectedDepartment.name}
                  </h2>
                  <p className="text-sm font-bold text-[#102C57] mt-1 max-w-xl">
                    {selectedDepartment.description || "— ไม่มีคำอธิบายแผนก —"}
                  </p>
                </div>

                <div className="flex gap-2 shrink-0 z-10 w-full md:w-auto">
                  <button 
                    type="button" 
                    onClick={openEditModal} 
                    disabled={!canManage} 
                    className="flex-1 md:flex-initial h-9 px-4 rounded-[3px] border border-[#102C57]/20 bg-white text-xs font-black text-[#102C57] flex items-center justify-center gap-1.5 hover:bg-slate-50 transition duration-200 disabled:opacity-50 cursor-pointer"
                  >
                    <Pencil size={13} />
                    <span>แก้ไขแผนก</span>
                  </button>
                  <button 
                    type="button" 
                    onClick={handleDeactivateDepartment} 
                    disabled={!canManage} 
                    className="flex-1 md:flex-initial h-9 px-4 rounded-[3px] border border-red-200 bg-red-50 text-xs font-black text-red-600 flex items-center justify-center gap-1.5 hover:bg-red-100/55 transition duration-200 disabled:opacity-50 cursor-pointer"
                  >
                    <Trash2 size={13} />
                    <span>ปิดใช้งานแผนก</span>
                  </button>
                </div>
              </div>

              {/* Tab Navigation inside Workspace */}
              <div className="border-b border-[#102C57]/10 flex gap-2 bg-white">
                <button
                  type="button"
                  onClick={() => setActiveSubTab("products")}
                  className={`px-5 py-3 text-sm font-black flex items-center gap-2 border-b-2 transition duration-200 cursor-pointer ${
                    activeSubTab === "products"
                      ? "border-[#d4af37] text-[#102C57] bg-[#fff8e2]/20 font-black"
                      : "border-transparent text-[#102C57]/60 hover:text-[#102C57]"
                  }`}
                >
                  <Package size={15} />
                  <span>สินค้าความรับผิดชอบ ({assignedProducts.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSubTab("users")}
                  className={`px-5 py-3 text-sm font-black flex items-center gap-2 border-b-2 transition duration-200 cursor-pointer ${
                    activeSubTab === "users"
                      ? "border-[#d4af37] text-[#102C57] bg-[#fff8e2]/20 font-black"
                      : "border-transparent text-[#102C57]/60 hover:text-[#102C57]"
                  }`}
                >
                  <Users size={15} />
                  <span>รายชื่อสมาชิกในแผนก ({assignedUsers.length})</span>
                </button>
              </div>

              {/* Sub-tab 1: Products Mapping (Redesigned with Pagination & Filters) */}
              {activeSubTab === "products" && (
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 animate-fadeIn">
                  
                  {/* Left Column: Assigned Products (Now Paginated + Instant Filtered) */}
                  <div className="xl:col-span-6 bg-white border border-[#102C57]/10 rounded-[3px] p-4.5 shadow-sm flex flex-col h-[520px]">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 mb-3">
                      <div>
                        <h4 className="text-sm font-black text-[#102C57]">
                          สินค้าในแผนกที่ผูกไว้
                        </h4>
                        <p className="text-xs font-bold text-[#102C57] mt-0.5">
                          รายการทั้งหมด ({filteredAssignedProducts.length} สินค้า)
                        </p>
                      </div>
                      <button 
                        type="button" 
                        onClick={handleUnassignProducts} 
                        disabled={!selectedAssignedProducts.size || !canManage || isLoadingAssigned} 
                        className="h-8 px-3.5 rounded-[2px] border border-red-300 bg-red-50 text-xs font-black text-red-600 flex items-center gap-1.5 hover:bg-red-100/70 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        <Trash2 size={13} />
                        <span>ยกเลิกที่เลือก ({selectedAssignedProducts.size})</span>
                      </button>
                    </div>

                    {/* Instant client-side search inside department */}
                    <div className="relative mb-3.5">
                      <input 
                        value={assignedSearch} 
                        onChange={(e) => {
                          setAssignedSearch(e.target.value);
                          setAssignedPage(1); // reset to page 1 on filter
                        }}
                        placeholder="พิมพ์เพื่อค้นหา/กรองสินค้าในแผนกนี้ทันที..." 
                        className="w-full h-9 rounded-[3px] border border-[#102C57]/20 bg-slate-50 pl-9 pr-3 text-xs font-bold text-[#102C57] outline-none focus:bg-white focus:border-[#d4af37] transition"
                      />
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#102C57]" size={14} />
                    </div>

                    <div className="overflow-hidden border border-[#102C57]/10 rounded-[2px] flex-1 flex flex-col bg-white">
                      <table className="w-full text-xs text-[#102C57] border-collapse table-fixed">
                        <colgroup>
                          <col className="w-[40px]" />
                          <col className="w-[105px]" />
                          <col />
                          <col className="w-[95px]" />
                        </colgroup>
                        <thead className="bg-[#eef3f8] border-b border-[#102C57]/10 text-xs font-black uppercase tracking-wider text-[#102C57]">
                          <tr>
                            <th className="px-2 py-2.5 text-center">เลือก</th>
                            <th className="px-2 py-2.5 text-left">รหัส SKU</th>
                            <th className="px-2 py-2.5 text-left">รายการสินค้า</th>
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
                                <td className="px-2 py-2 text-center align-middle" onClick={(e) => e.stopPropagation()}>
                                  <button
                                    type="button"
                                    onClick={() => handleSetOwnerProduct(item.sku_code)}
                                    disabled={!canManage || isOwner || isLoadingAssigned}
                                    className={`h-6.5 w-full rounded-[2px] text-[10px] font-black uppercase tracking-wider transition cursor-pointer ${
                                      isOwner 
                                        ? "bg-emerald-100 border border-emerald-300 text-emerald-950 cursor-default" 
                                        : "bg-white border border-[#102C57]/25 text-[#102C57] hover:bg-[#102C57]/5"
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
                              <td colSpan={4} className="py-12 text-center text-sm font-bold text-[#102C57]">
                                ไม่พบสินค้าผูกที่สอดคล้อง
                              </td>
                            </tr>
                          ) : null}
                          {isLoadingAssigned && (
                            <tr>
                              <td colSpan={4} className="py-12 text-center text-sm font-bold text-[#102C57]">
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
                  <div className="xl:col-span-6 bg-white border border-[#102C57]/10 rounded-[3px] p-4.5 shadow-sm flex flex-col h-[520px]">
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
                        onClick={async () => setProducts(await loadProducts())} 
                        className="h-9 px-3.5 rounded-[3px] bg-[#102C57] text-white text-xs font-bold hover:bg-[#102C57]/90 transition cursor-pointer"
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
                        แสดง {products.length > 0 ? (availablePage - 1) * ITEMS_PER_PAGE + 1 : 0} - {Math.min(availablePage * ITEMS_PER_PAGE, products.length)} จาก {products.length} รายการ
                      </span>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          disabled={availablePage === 1}
                          onClick={() => setAvailablePage(prev => Math.max(1, prev - 1))}
                          className="h-7 w-7 rounded-[2px] border border-[#102C57]/20 flex items-center justify-center hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed text-[#102C57] cursor-pointer"
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <span className="text-xs font-black text-[#102C57] px-1 font-mono">
                          {availablePage} / {totalAvailablePages}
                        </span>
                        <button
                          type="button"
                          disabled={availablePage === totalAvailablePages}
                          onClick={() => setAvailablePage(prev => Math.min(totalAvailablePages, prev + 1))}
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
                  </div>
                </div>
              )}

              {/* Sub-tab 2: Users Mapping (Redesigned with Pagination & Filter) */}
              {activeSubTab === "users" && (
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 animate-fadeIn">
                  
                  {/* Left Column: Current Users List (Paginated + Filtered) */}
                  <div className="xl:col-span-6 bg-white border border-[#102C57]/10 rounded-[3px] p-4.5 shadow-sm flex flex-col h-[520px]">
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
                  <div className="xl:col-span-6 bg-white border border-[#102C57]/10 rounded-[3px] p-4.5 shadow-sm flex flex-col h-[520px]">
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
                        className="h-9 px-3.5 rounded-[3px] bg-[#102C57] text-white text-xs font-bold hover:bg-[#102C57]/90 transition cursor-pointer"
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
                  </div>
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

      {/* Modern Chiaroscuro Add/Edit Modal */}
      {isModalOpen && canManage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-[2px] animate-fadeIn">
          <div className="w-full max-w-lg overflow-hidden bg-white shadow-2xl border border-[#102C57]/20 rounded-[4px] transform scale-100 transition duration-300">
            {/* Modal Header */}
            <div className="flex items-center justify-between bg-[#102C57] px-6 py-4 text-white">
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
