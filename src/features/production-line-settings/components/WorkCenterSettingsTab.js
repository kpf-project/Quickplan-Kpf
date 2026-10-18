"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Building2, Check, MapPin, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import {
  createProductionWorkCenter,
  createProductionDeliveryPoint,
  deleteProductionDeliveryPoint,
  deleteProductionWorkCenter,
  fetchProductionDeliveryPoints,
  fetchProductionDepartments,
  fetchProductionWorkCenterImpact,
  fetchProductionWorkCenters,
  updateProductionDeliveryPoint,
  updateProductionWorkCenter,
} from "@/features/production-line-settings/services/productionLineSettingsClient";

const DEFAULT_FORM = {
  id: null,
  departmentId: "",
  deliveryPointId: "",
  code: "",
  name: "",
  description: "",
  sortOrder: 0,
  isActive: true,
  requiresPlanning: false,
  consolidateRequisitionPreviewByDate: false,
};

const DEFAULT_DELIVERY_POINT_FORM = {
  id: null,
  code: "",
  name: "",
  description: "",
  sortOrder: 0,
  isActive: true,
};

function mapForm(row, fallbackDepartmentId = "") {
  if (!row) {
    return { ...DEFAULT_FORM, departmentId: fallbackDepartmentId };
  }
  return {
    id: row.id,
    departmentId: row.department_id || fallbackDepartmentId,
    deliveryPointId: row.delivery_point_id || "",
    code: row.code || "",
    name: row.name || "",
    description: row.description || "",
    sortOrder: Number(row.sort_order ?? 0),
    isActive: Boolean(row.is_active),
    requiresPlanning: Boolean(row.requires_planning),
    consolidateRequisitionPreviewByDate: Boolean(row.consolidate_requisition_preview_by_date),
  };
}

function normalizeText(value) {
  return String(value || "").trim();
}

export default function WorkCenterSettingsTab({ canManage = false }) {
  const [activeSubTab, setActiveSubTab] = useState("work-centers");
  const [departments, setDepartments] = useState([]);
  const [workCenters, setWorkCenters] = useState([]);
  const [deliveryPoints, setDeliveryPoints] = useState([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const [selectedWorkCenterId, setSelectedWorkCenterId] = useState(null);
  const [selectedDeliveryPointId, setSelectedDeliveryPointId] = useState(null);
  const [search, setSearch] = useState("");
  const [deliveryPointSearch, setDeliveryPointSearch] = useState("");
  const [includeInactive, setIncludeInactive] = useState(false);
  const [includeInactiveDeliveryPoints, setIncludeInactiveDeliveryPoints] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingDeliveryPoints, setLoadingDeliveryPoints] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeliveryPointModalOpen, setIsDeliveryPointModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteImpact, setDeleteImpact] = useState(null);
  const [deleteImpactLoading, setDeleteImpactLoading] = useState(false);
  const [deleteImpactError, setDeleteImpactError] = useState("");
  const [form, setForm] = useState(DEFAULT_FORM);
  const [deliveryPointForm, setDeliveryPointForm] = useState(DEFAULT_DELIVERY_POINT_FORM);

  const selectedDepartment = useMemo(
    () => departments.find((row) => row.id === selectedDepartmentId) || null,
    [departments, selectedDepartmentId]
  );
  const selectedWorkCenter = useMemo(
    () => workCenters.find((row) => row.id === selectedWorkCenterId) || null,
    [selectedWorkCenterId, workCenters]
  );
  const selectedDeliveryPoint = useMemo(
    () => deliveryPoints.find((row) => row.id === selectedDeliveryPointId) || null,
    [deliveryPoints, selectedDeliveryPointId]
  );

  const loadDepartments = useCallback(async () => {
    const result = await fetchProductionDepartments({ pageSize: "500" });
    if (!result.ok) {
      throw new Error(result.error?.message || "โหลดแผนกไม่สำเร็จ");
    }
    return Array.isArray(result.data?.data) ? result.data.data : [];
  }, []);

  const loadWorkCenters = useCallback(async ({
    departmentId = "",
    searchText = "",
    showInactive = false,
  } = {}) => {
    const result = await fetchProductionWorkCenters({
      departmentId,
      search: searchText,
      includeInactive: showInactive ? "true" : "false",
    });
    if (!result.ok) {
      throw new Error(result.error?.message || "โหลดห้องผลิตไม่สำเร็จ");
    }
    return Array.isArray(result.data?.data) ? result.data.data : [];
  }, []);

  const loadDeliveryPoints = useCallback(async ({
    searchText = "",
    showInactive = false,
  } = {}) => {
    const result = await fetchProductionDeliveryPoints({
      search: searchText,
      includeInactive: showInactive ? "true" : "false",
    });
    if (!result.ok) {
      throw new Error(result.error?.message || "โหลดจุดส่ง/รับคืนไม่สำเร็จ");
    }
    return Array.isArray(result.data?.data) ? result.data.data : [];
  }, []);

  const refresh = useCallback(async (departmentId = selectedDepartmentId) => {
    setErrorMessage("");
    setLoading(true);
    try {
      const rows = await loadWorkCenters({
        departmentId,
        searchText: search,
        showInactive: includeInactive,
      });
      setWorkCenters(rows);
      setSelectedWorkCenterId((current) => {
        if (current && rows.some((row) => row.id === current)) return current;
        return rows[0]?.id || null;
      });
    } catch (error) {
      setErrorMessage(error?.message || "โหลดข้อมูลไม่สำเร็จ");
      setWorkCenters([]);
      setSelectedWorkCenterId(null);
    } finally {
      setLoading(false);
    }
  }, [includeInactive, loadWorkCenters, search, selectedDepartmentId]);

  const refreshDeliveryPoints = useCallback(async () => {
    setErrorMessage("");
    setLoadingDeliveryPoints(true);
    try {
      const rows = await loadDeliveryPoints({
        searchText: deliveryPointSearch,
        showInactive: includeInactiveDeliveryPoints,
      });
      setDeliveryPoints(rows);
      setSelectedDeliveryPointId((current) => {
        if (current && rows.some((row) => row.id === current)) return current;
        return rows[0]?.id || null;
      });
    } catch (error) {
      setErrorMessage(error?.message || "โหลดจุดส่ง/รับคืนไม่สำเร็จ");
      setDeliveryPoints([]);
      setSelectedDeliveryPointId(null);
    } finally {
      setLoadingDeliveryPoints(false);
    }
  }, [deliveryPointSearch, includeInactiveDeliveryPoints, loadDeliveryPoints]);

  useEffect(() => {
    let mounted = true;
    async function loadInitial() {
      setLoading(true);
      setErrorMessage("");
      try {
        const deptRows = await loadDepartments();
        if (!mounted) return;
        setDepartments(deptRows);
        const firstDepartmentId = deptRows[0]?.id || "";
        setSelectedDepartmentId(firstDepartmentId);
        const [centerRows, deliveryPointRows] = await Promise.all([
          firstDepartmentId
            ? loadWorkCenters({ departmentId: firstDepartmentId })
            : Promise.resolve([]),
          loadDeliveryPoints(),
        ]);
        if (!mounted) return;
        setWorkCenters(centerRows);
        setDeliveryPoints(deliveryPointRows);
        setSelectedWorkCenterId(centerRows[0]?.id || null);
        setSelectedDeliveryPointId(deliveryPointRows[0]?.id || null);
      } catch (error) {
        if (mounted) setErrorMessage(error?.message || "โหลดข้อมูลไม่สำเร็จ");
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadInitial();
    return () => {
      mounted = false;
    };
  }, [loadDeliveryPoints, loadDepartments, loadWorkCenters]);

  const handleSelectDepartment = async (departmentId) => {
    setSelectedDepartmentId(departmentId);
    setSelectedWorkCenterId(null);
    await refresh(departmentId);
  };

  const openCreateModal = () => {
    setForm(mapForm(null, selectedDepartmentId));
    setIsModalOpen(true);
  };

  const openEditModal = () => {
    if (!selectedWorkCenter) return;
    setForm(mapForm(selectedWorkCenter, selectedDepartmentId));
    setIsModalOpen(true);
  };

  const openCreateDeliveryPointModal = () => {
    setDeliveryPointForm(DEFAULT_DELIVERY_POINT_FORM);
    setIsDeliveryPointModalOpen(true);
  };

  const openEditDeliveryPointModal = () => {
    if (!selectedDeliveryPoint) return;
    setDeliveryPointForm({
      id: selectedDeliveryPoint.id,
      code: selectedDeliveryPoint.code || "",
      name: selectedDeliveryPoint.name || "",
      description: selectedDeliveryPoint.description || "",
      sortOrder: Number(selectedDeliveryPoint.sort_order ?? 0),
      isActive: Boolean(selectedDeliveryPoint.is_active),
    });
    setIsDeliveryPointModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!canManage) return;
    const payload = {
      departmentId: form.departmentId,
      code: normalizeText(form.code).toUpperCase(),
      name: normalizeText(form.name),
      description: normalizeText(form.description),
      sortOrder: form.sortOrder,
      isActive: form.isActive,
      requiresPlanning: form.requiresPlanning,
      consolidateRequisitionPreviewByDate: form.consolidateRequisitionPreviewByDate,
      deliveryPointId: form.deliveryPointId || null,
    };

    if (!payload.departmentId || !payload.code || !payload.name) {
      setErrorMessage("กรุณาเลือกแผนก และกรอกรหัส/ชื่อห้องผลิต");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    try {
      const result = form.id
        ? await updateProductionWorkCenter(form.id, payload)
        : await createProductionWorkCenter(payload);
      if (!result.ok) {
        throw new Error(result.error?.message || "บันทึกห้องผลิตไม่สำเร็จ");
      }
      setIsModalOpen(false);
      setSelectedDepartmentId(payload.departmentId);
      await refresh(payload.departmentId);
      if (result.data?.data?.id) {
        setSelectedWorkCenterId(result.data.data.id);
      }
    } catch (error) {
      setErrorMessage(error?.message || "บันทึกห้องผลิตไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const handleDeliveryPointSubmit = async () => {
    if (!canManage) return;
    const payload = {
      code: normalizeText(deliveryPointForm.code).toUpperCase(),
      name: normalizeText(deliveryPointForm.name),
      description: normalizeText(deliveryPointForm.description),
      sortOrder: deliveryPointForm.sortOrder,
      isActive: deliveryPointForm.isActive,
    };

    if (!payload.code || !payload.name) {
      setErrorMessage("กรุณากรอกรหัสและชื่อจุดส่ง/รับคืน");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    try {
      const result = deliveryPointForm.id
        ? await updateProductionDeliveryPoint(deliveryPointForm.id, payload)
        : await createProductionDeliveryPoint(payload);
      if (!result.ok) {
        throw new Error(result.error?.message || "บันทึกจุดส่ง/รับคืนไม่สำเร็จ");
      }
      setIsDeliveryPointModalOpen(false);
      await refreshDeliveryPoints();
      if (result.data?.data?.id) {
        setSelectedDeliveryPointId(result.data.data.id);
      }
    } catch (error) {
      setErrorMessage(error?.message || "บันทึกจุดส่ง/รับคืนไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const handleDeliveryPointDelete = async () => {
    if (!selectedDeliveryPoint || !canManage) return;
    if (!window.confirm(`ลบจุดส่ง/รับคืน ${selectedDeliveryPoint.name} ใช่หรือไม่?`)) return;
    setSaving(true);
    setErrorMessage("");
    try {
      const result = await deleteProductionDeliveryPoint(selectedDeliveryPoint.id);
      if (!result.ok) {
        throw new Error(result.error?.message || "ลบจุดส่ง/รับคืนไม่สำเร็จ");
      }
      await refreshDeliveryPoints();
      await refresh(selectedDepartmentId);
    } catch (error) {
      setErrorMessage(error?.message || "ลบจุดส่ง/รับคืนไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const openDeleteModal = async () => {
    if (!selectedWorkCenter || !canManage) return;
    setDeleteModalOpen(true);
    setDeleteImpact(null);
    setDeleteImpactError("");
    setDeleteImpactLoading(true);
    try {
      const result = await fetchProductionWorkCenterImpact(selectedWorkCenter.id);
      if (!result.ok) {
        throw new Error(result.error?.message || "โหลดผลกระทบของห้องผลิตไม่สำเร็จ");
      }
      setDeleteImpact(result.data?.data || null);
    } catch (error) {
      setDeleteImpactError(error?.message || "โหลดผลกระทบของห้องผลิตไม่สำเร็จ");
    } finally {
      setDeleteImpactLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedWorkCenter || !canManage) return;
    setSaving(true);
    setErrorMessage("");
    try {
      const result = await deleteProductionWorkCenter(selectedWorkCenter.id);
      if (!result.ok) {
        throw new Error(result.error?.message || "ลบห้องผลิตไม่สำเร็จ");
      }
      setDeleteModalOpen(false);
      setDeleteImpact(null);
      await refresh(selectedDepartmentId);
    } catch (error) {
      setErrorMessage(error?.message || "ลบห้องผลิตไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="h-full min-h-[620px] bg-[#f6f7f9] text-[#102C57]">
      <div className="border-b border-[#d2d2d2] bg-white px-4 py-3">
        <div className="inline-flex overflow-hidden border border-[#d2d2d2] bg-white">
          <button
            type="button"
            onClick={() => setActiveSubTab("work-centers")}
            className={`inline-flex h-10 items-center gap-2 px-4 text-sm font-semibold ${
              activeSubTab === "work-centers"
                ? "bg-[var(--surface-navy,#102C57)] text-white"
                : "bg-white text-[#102C57] hover:bg-[#f6f7f9]"
            }`}
          >
            <Building2 size={16} className={activeSubTab === "work-centers" ? "text-[#d4af37]" : "text-[#102C57]"} />
            ห้องผลิต
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab("delivery-points")}
            className={`inline-flex h-10 items-center gap-2 border-l border-[#d2d2d2] px-4 text-sm font-semibold ${
              activeSubTab === "delivery-points"
                ? "bg-[var(--surface-navy,#102C57)] text-white"
                : "bg-white text-[#102C57] hover:bg-[#f6f7f9]"
            }`}
          >
            <MapPin size={16} className={activeSubTab === "delivery-points" ? "text-[#d4af37]" : "text-[#102C57]"} />
            จุดส่ง/รับคืน
          </button>
        </div>
      </div>

      {activeSubTab === "work-centers" ? (
      <div className="grid h-full gap-4 p-4 lg:grid-cols-[320px_1fr]">
        <section className="border border-[#d2d2d2] bg-white">
          <div className="border-b border-[#d2d2d2] bg-[var(--surface-navy,#102C57)] px-4 py-4 text-white">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#d4af37]">
              Work Centers
            </div>
            <h2 className="mt-1 text-lg font-semibold">แผนกหลัก</h2>
          </div>
          <div className="max-h-[520px] overflow-y-auto p-2">
            {departments.map((department) => {
              const active = department.id === selectedDepartmentId;
              return (
                <button
                  key={department.id}
                  type="button"
                  onClick={() => handleSelectDepartment(department.id)}
                  className={`mb-1 w-full border px-3 py-3 text-left transition-colors ${
                    active
                      ? "border-[#102C57] bg-[var(--surface-navy,#102C57)] text-white"
                      : "border-transparent bg-white text-[#102C57] hover:border-[#d2d2d2] hover:bg-[#f4f6f8]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className={`text-[11px] font-bold uppercase tracking-[0.08em] ${active ? "text-[#d4af37]" : "text-[#102C57]"}`}>
                        {department.code}
                      </div>
                      <div className="mt-0.5 text-sm font-semibold">{department.name}</div>
                    </div>
                    <Building2 size={16} className={active ? "text-[#d4af37]" : "text-slate-400"} />
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="border border-[#d2d2d2] bg-white">
          <div className="border-b border-[#d2d2d2] px-4 py-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#8f8f8f]">
                  ห้องผลิตภายใต้แผนก
                </div>
                <h2 className="mt-1 text-xl font-semibold text-[#102C57]">
                  {selectedDepartment ? selectedDepartment.name : "เลือกแผนก"}
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") refresh();
                    }}
                    placeholder="ค้นหารหัสหรือชื่อห้อง"
                    className="h-9 w-56 border border-[#cccccc] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#102C57]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => refresh()}
                  className="inline-flex h-9 items-center gap-2 border border-[#102C57] bg-[var(--surface-navy,#102C57)] px-3 text-xs font-semibold text-white hover:bg-[#081c3c]"
                >
                  <Search size={14} />
                  ค้นหา
                </button>
                <label className="inline-flex h-9 items-center gap-2 border border-[#d2d2d2] px-3 text-xs font-semibold text-slate-600">
                  <input
                    type="checkbox"
                    checked={includeInactive}
                    onChange={(event) => setIncludeInactive(event.target.checked)}
                    className="rounded border-slate-300 text-[#102C57]"
                  />
                  แสดงที่ปิดใช้งาน
                </label>
                <button
                  type="button"
                  onClick={openCreateModal}
                  disabled={!selectedDepartmentId || !canManage}
                  className="inline-flex h-9 items-center gap-2 border border-[#d4af37] bg-[#d4af37] px-3 text-xs font-bold text-[#102C57] hover:bg-[#b9972d] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Plus size={14} />
                  เพิ่มห้อง
                </button>
              </div>
            </div>
            {errorMessage && (
              <div className="mt-3 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {errorMessage}
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-[#eef1f5] text-[11px] uppercase tracking-[0.12em] text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">รหัส</th>
                  <th className="px-4 py-3 text-left">ชื่อห้องผลิต</th>
                  <th className="px-4 py-3 text-left">แผนก</th>
                  <th className="px-4 py-3 text-left">จุดส่ง/รับคืน</th>
                  <th className="px-4 py-3 text-center">ลำดับ</th>
                  <th className="px-4 py-3 text-center">รวม Preview/วัน</th>
                  <th className="px-4 py-3 text-center">ใช้วางแผน</th>
                  <th className="px-4 py-3 text-center">สถานะ</th>
                  <th className="px-4 py-3 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-14 text-center text-slate-400">
                      กำลังโหลดข้อมูล...
                    </td>
                  </tr>
                ) : workCenters.length ? (
                  workCenters.map((row) => {
                    const selected = row.id === selectedWorkCenterId;
                    return (
                      <tr
                        key={row.id}
                        onClick={() => setSelectedWorkCenterId(row.id)}
                        className={`cursor-pointer border-t border-[#e5e7eb] transition-colors ${selected ? "bg-[var(--surface-navy,#102C57)]/5" : "hover:bg-[#f7f8fa]"}`}
                      >
                        <td className="px-4 py-3 font-mono text-xs font-semibold text-[#102C57]">{row.code}</td>
                        <td className="px-4 py-3">
                          <div className="font-semibold text-[#102C57]">{row.name}</div>
                          {row.description ? (
                            <div className="mt-0.5 text-xs text-slate-400">{row.description}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {row.department_code ? `[${row.department_code}] ` : ""}{row.department_name}
                        </td>
                        <td className="px-4 py-3 text-slate-600">
                          {row.delivery_point_name ? (
                            <span>
                              {row.delivery_point_code ? `[${row.delivery_point_code}] ` : ""}
                              {row.delivery_point_name}
                            </span>
                          ) : (
                            <span className="text-slate-400">ยังไม่กำหนด</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-xs">{row.sort_order}</td>
                        <td className="px-4 py-3 text-center">
                          {row.consolidate_requisition_preview_by_date ? (
                            <span className="inline-flex border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
                              รวมยอดตามวัน
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">แยกตามสินค้า</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {row.requires_planning ? (
                            <span className="inline-flex border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">
                              วางแผน
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 border px-2 py-0.5 text-[11px] font-semibold ${row.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                            {row.is_active ? <Check size={12} /> : <X size={12} />}
                            {row.is_active ? "ใช้งาน" : "ปิดใช้งาน"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex gap-1">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedWorkCenterId(row.id);
                                setForm(mapForm(row, selectedDepartmentId));
                                setIsModalOpen(true);
                              }}
                              disabled={!canManage}
                              className="inline-flex h-8 w-8 items-center justify-center border border-[#d2d2d2] text-[#102C57] hover:border-[#102C57] disabled:opacity-50"
                              title="แก้ไข"
                            >
                              <Pencil size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="px-4 py-14 text-center text-slate-400">
                      ยังไม่มีห้องผลิตในแผนกนี้
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-[#d2d2d2] px-4 py-3">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <Building2 size={15} />
              ห้องผลิตจะถูกใช้ต่อใน Routing และ Material Allocation
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={openEditModal}
                disabled={!selectedWorkCenter || !canManage}
                className="inline-flex h-9 items-center gap-2 border border-[#102C57] bg-white px-3 text-xs font-semibold text-[#102C57] hover:bg-[var(--surface-navy,#102C57)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Pencil size={14} />
                แก้ไข
              </button>
              <button
                type="button"
                onClick={openDeleteModal}
                disabled={!selectedWorkCenter || !canManage || saving}
                className="inline-flex h-9 items-center gap-2 border border-red-200 bg-white px-3 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 size={14} />
                ลบห้อง
              </button>
            </div>
          </div>
        </section>
      </div>
      ) : (
        <div className="p-4">
          <section className="border border-[#d2d2d2] bg-white">
            <div className="border-b border-[#d2d2d2] px-4 py-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#d4af37]">
                    Delivery Points
                  </div>
                  <h2 className="mt-1 text-xl font-semibold text-[#102C57]">จุดส่ง/รับคืน</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    ใช้กำหนดหมายเหตุจุดส่งของห้องผลิต ไม่กระทบการแยกใบเบิก
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      value={deliveryPointSearch}
                      onChange={(event) => setDeliveryPointSearch(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") refreshDeliveryPoints();
                      }}
                      placeholder="ค้นหาจุดส่ง/รับคืน"
                      className="h-9 w-56 border border-[#cccccc] bg-white pl-9 pr-3 text-sm outline-none focus:border-[#102C57]"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => refreshDeliveryPoints()}
                    className="inline-flex h-9 items-center gap-2 border border-[#102C57] bg-[var(--surface-navy,#102C57)] px-3 text-xs font-semibold text-white hover:bg-[#081c3c]"
                  >
                    <Search size={14} />
                    ค้นหา
                  </button>
                  <label className="inline-flex h-9 items-center gap-2 border border-[#d2d2d2] px-3 text-xs font-semibold text-slate-600">
                    <input
                      type="checkbox"
                      checked={includeInactiveDeliveryPoints}
                      onChange={(event) => setIncludeInactiveDeliveryPoints(event.target.checked)}
                      className="rounded border-slate-300 text-[#102C57]"
                    />
                    แสดงที่ปิดใช้งาน
                  </label>
                  <button
                    type="button"
                    onClick={openCreateDeliveryPointModal}
                    disabled={!canManage}
                    className="inline-flex h-9 items-center gap-2 border border-[#d4af37] bg-[#d4af37] px-3 text-xs font-bold text-[#102C57] hover:bg-[#b9972d] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus size={14} />
                    เพิ่มจุดส่ง
                  </button>
                </div>
              </div>
              {errorMessage && (
                <div className="mt-3 border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {errorMessage}
                </div>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-[var(--surface-navy,#102C57)] text-white">
                  <tr>
                    <th className="px-4 py-3 text-left">รหัส</th>
                    <th className="px-4 py-3 text-left">ชื่อจุดส่ง/รับคืน</th>
                    <th className="px-4 py-3 text-left">หมายเหตุ</th>
                    <th className="px-4 py-3 text-center">ลำดับ</th>
                    <th className="px-4 py-3 text-center">สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingDeliveryPoints ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-14 text-center text-slate-400">
                        กำลังโหลดจุดส่ง/รับคืน...
                      </td>
                    </tr>
                  ) : deliveryPoints.length ? (
                    deliveryPoints.map((row) => {
                      const selected = row.id === selectedDeliveryPointId;
                      return (
                        <tr
                          key={row.id}
                          onClick={() => setSelectedDeliveryPointId(row.id)}
                          className={`cursor-pointer border-t border-[#e5e7eb] transition-colors ${selected ? "bg-[var(--surface-navy,#102C57)]/5" : "hover:bg-[#f7f8fa]"}`}
                        >
                          <td className="px-4 py-3 font-mono text-xs font-semibold text-[#102C57]">{row.code}</td>
                          <td className="px-4 py-3 font-semibold text-[#102C57]">{row.name}</td>
                          <td className="px-4 py-3 text-slate-600">{row.description || "-"}</td>
                          <td className="px-4 py-3 text-center font-mono text-xs">{row.sort_order}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`inline-flex items-center gap-1 border px-2 py-0.5 text-[11px] font-semibold ${row.is_active ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                              {row.is_active ? <Check size={12} /> : <X size={12} />}
                              {row.is_active ? "ใช้งาน" : "ปิดใช้งาน"}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-4 py-14 text-center text-slate-400">
                        ยังไม่มีจุดส่ง/รับคืน
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between border-t border-[#d2d2d2] px-4 py-3">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <MapPin size={15} />
                สร้างจุดส่งก่อน แล้วเลือกใช้ในฟอร์มห้องผลิต
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={openEditDeliveryPointModal}
                  disabled={!selectedDeliveryPoint || !canManage}
                  className="inline-flex h-9 items-center gap-2 border border-[#102C57] bg-white px-3 text-xs font-semibold text-[#102C57] hover:bg-[var(--surface-navy,#102C57)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Pencil size={14} />
                  แก้ไข
                </button>
                <button
                  type="button"
                  onClick={handleDeliveryPointDelete}
                  disabled={!selectedDeliveryPoint || !canManage || saving}
                  className="inline-flex h-9 items-center gap-2 border border-red-200 bg-white px-3 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Trash2 size={14} />
                  ลบจุดส่ง
                </button>
              </div>
            </div>
          </section>
        </div>
      )}

      {isModalOpen && canManage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--surface-navy,#102C57)]/70 p-4">
          <div className="w-full max-w-xl border border-[#303030] bg-white">
            <div className="flex items-start justify-between bg-[var(--surface-navy,#102C57)] px-5 py-4 text-white">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#d4af37]">
                  {form.id ? "Edit Work Center" : "New Work Center"}
                </div>
                <h3 className="mt-1 text-lg font-semibold">
                  {form.id ? "แก้ไขห้องผลิต" : "เพิ่มห้องผลิต"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={saving}
                className="text-white/60 hover:text-white"
                title="ปิด"
              >
                <X size={20} />
              </button>
            </div>
            <div className="grid gap-4 px-5 py-5">
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-semibold text-slate-500">แผนก</span>
                <select
                  value={form.departmentId}
                  onChange={(event) => setForm((prev) => ({ ...prev, departmentId: event.target.value }))}
                  className="h-10 border border-[#cccccc] bg-white px-3 outline-none focus:border-[#102C57]"
                >
                  <option value="">เลือกแผนก</option>
                  {departments.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.code ? `[${department.code}] ` : ""}{department.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="text-xs font-semibold text-slate-500">รหัสห้อง</span>
                  <input
                    value={form.code}
                    onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))}
                    placeholder="เช่น MIX"
                    className="h-10 border border-[#cccccc] px-3 font-mono outline-none focus:border-[#102C57]"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-xs font-semibold text-slate-500">ลำดับ</span>
                  <input
                    type="number"
                    min="0"
                    max="9999"
                    value={form.sortOrder}
                    onChange={(event) => setForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
                    className="h-10 border border-[#cccccc] px-3 outline-none focus:border-[#102C57]"
                  />
                </label>
              </div>
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-semibold text-slate-500">ชื่อห้องผลิต</span>
                <input
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="เช่น ห้องตีแป้ง"
                  className="h-10 border border-[#cccccc] px-3 outline-none focus:border-[#102C57]"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-semibold text-slate-500">จุดส่ง/รับคืน</span>
                <select
                  value={form.deliveryPointId}
                  onChange={(event) => setForm((prev) => ({ ...prev, deliveryPointId: event.target.value }))}
                  className="h-10 border border-[#cccccc] bg-white px-3 outline-none focus:border-[#102C57]"
                >
                  <option value="">ยังไม่กำหนด</option>
                  {deliveryPoints
                    .filter((point) => point.is_active || point.id === form.deliveryPointId)
                    .map((point) => (
                      <option key={point.id} value={point.id}>
                        {point.code ? `[${point.code}] ` : ""}{point.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-semibold text-slate-500">หมายเหตุ</span>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                  className="resize-none border border-[#cccccc] px-3 py-2 outline-none focus:border-[#102C57]"
                />
              </label>
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={form.consolidateRequisitionPreviewByDate}
                  onChange={(event) => setForm((prev) => ({
                    ...prev,
                    consolidateRequisitionPreviewByDate: event.target.checked,
                  }))}
                  className="rounded border-slate-300 text-[#102C57]"
                />
                รวมยอดวัตถุดิบใน Preview ตามวัน
              </label>
              <p className="-mt-2 border-l-4 border-blue-300 bg-blue-50 px-3 py-2 text-xs leading-5 text-blue-700">
                หากวันเดียวกันมีหลายสินค้า ระบบจะแสดงยอดวัตถุดิบรวมหนึ่งช่อง และกดดูที่มาจากแต่ละ FG ได้ โดยไม่เปลี่ยนกฎเอกสารต้นทางและ Export
              </p>
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={form.requiresPlanning}
                  onChange={(event) => setForm((prev) => ({
                    ...prev,
                    requiresPlanning: event.target.checked,
                  }))}
                  className="rounded border-slate-300 text-[#102C57]"
                />
                ใช้วางแผนการผลิต (WIP Planning)
              </label>
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                  className="rounded border-slate-300 text-[#102C57]"
                />
                ใช้งาน
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#d2d2d2] bg-[#f6f7f9] px-5 py-4">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                disabled={saving}
                className="h-10 border border-[#cccccc] bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={saving}
                className="h-10 border border-[#d4af37] bg-[#d4af37] px-4 text-sm font-bold text-[#102C57] hover:bg-[#b9972d] disabled:opacity-50"
              >
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {isDeliveryPointModalOpen && canManage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--surface-navy,#102C57)]/70 p-4">
          <div className="w-full max-w-xl border border-[#303030] bg-white">
            <div className="flex items-start justify-between bg-[var(--surface-navy,#102C57)] px-5 py-4 text-white">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#d4af37]">
                  {deliveryPointForm.id ? "Edit Delivery Point" : "New Delivery Point"}
                </div>
                <h3 className="mt-1 text-lg font-semibold">
                  {deliveryPointForm.id ? "แก้ไขจุดส่ง/รับคืน" : "เพิ่มจุดส่ง/รับคืน"}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsDeliveryPointModalOpen(false)}
                disabled={saving}
                className="text-white/60 hover:text-white"
                title="ปิด"
              >
                <X size={20} />
              </button>
            </div>
            <div className="grid gap-4 px-5 py-5">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  <span className="text-xs font-semibold text-slate-500">รหัสจุดส่ง</span>
                  <input
                    value={deliveryPointForm.code}
                    onChange={(event) => setDeliveryPointForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))}
                    placeholder="เช่น DP01"
                    className="h-10 border border-[#cccccc] px-3 font-mono outline-none focus:border-[#102C57]"
                  />
                </label>
                <label className="grid gap-1 text-sm">
                  <span className="text-xs font-semibold text-slate-500">ลำดับ</span>
                  <input
                    type="number"
                    min="0"
                    max="9999"
                    value={deliveryPointForm.sortOrder}
                    onChange={(event) => setDeliveryPointForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
                    className="h-10 border border-[#cccccc] px-3 outline-none focus:border-[#102C57]"
                  />
                </label>
              </div>
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-semibold text-slate-500">ชื่อจุดส่ง/รับคืน</span>
                <input
                  value={deliveryPointForm.name}
                  onChange={(event) => setDeliveryPointForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="เช่น จุดส่งหน้าห้องบดน้ำตาล"
                  className="h-10 border border-[#cccccc] px-3 outline-none focus:border-[#102C57]"
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-xs font-semibold text-slate-500">หมายเหตุ</span>
                <textarea
                  rows={3}
                  value={deliveryPointForm.description}
                  onChange={(event) => setDeliveryPointForm((prev) => ({ ...prev, description: event.target.value }))}
                  className="resize-none border border-[#cccccc] px-3 py-2 outline-none focus:border-[#102C57]"
                />
              </label>
              <label className="inline-flex items-center gap-2 text-sm font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={deliveryPointForm.isActive}
                  onChange={(event) => setDeliveryPointForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                  className="rounded border-slate-300 text-[#102C57]"
                />
                ใช้งาน
              </label>
            </div>
            <div className="flex justify-end gap-2 border-t border-[#d2d2d2] bg-[#f6f7f9] px-5 py-4">
              <button
                type="button"
                onClick={() => setIsDeliveryPointModalOpen(false)}
                disabled={saving}
                className="h-10 border border-[#cccccc] bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleDeliveryPointSubmit}
                disabled={saving}
                className="h-10 border border-[#d4af37] bg-[#d4af37] px-4 text-sm font-bold text-[#102C57] hover:bg-[#b9972d] disabled:opacity-50"
              >
                {saving ? "กำลังบันทึก..." : "บันทึก"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteModalOpen && canManage ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--surface-navy,#102C57)]/70 p-4">
          <div className="w-full max-w-5xl border border-[#303030] bg-white">
            <div className="flex items-start justify-between bg-[var(--surface-navy,#102C57)] px-5 py-4 text-white">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#d4af37]">
                  Delete Work Center
                </div>
                <h3 className="mt-1 text-lg font-semibold">ตรวจสอบก่อนลบห้องผลิต</h3>
              </div>
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                disabled={saving}
                className="text-white/60 hover:text-white disabled:opacity-50"
                title="ปิด"
              >
                <X size={20} />
              </button>
            </div>

            <div className="grid gap-4 px-5 py-5">
              <div className="border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-[#102C57]">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#b8860b]" />
                  <div>
                    <div className="font-semibold">
                      {selectedWorkCenter?.code ? `[${selectedWorkCenter.code}] ` : ""}
                      {selectedWorkCenter?.name || "-"}
                    </div>
                    <div className="mt-1 text-slate-700">
                      เมื่อยืนยัน ระบบจะล้างห้องนี้ออกจาก Routing ที่อ้างถึงอยู่ เพื่อให้ผู้ใช้กลับไปเลือกห้องผลิตใหม่
                    </div>
                  </div>
                </div>
              </div>

              {deleteImpactLoading ? (
                <div className="border border-[#d2d2d2] px-4 py-10 text-center text-sm text-slate-500">
                  กำลังโหลดรายการที่ได้รับผลกระทบ...
                </div>
              ) : deleteImpactError ? (
                <div className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {deleteImpactError}
                </div>
              ) : (
                <div className="overflow-hidden border border-[#d2d2d2]">
                  <div className="flex items-center justify-between border-b border-[#d2d2d2] bg-[#f6f7f9] px-4 py-3">
                    <div className="text-sm font-semibold text-[#102C57]">
                      Routing ที่ใช้ห้องนี้
                    </div>
                    <div className="text-xs font-semibold text-slate-500">
                      {deleteImpact?.impactCount || 0} รายการ
                    </div>
                  </div>
                  <div className="max-h-[360px] overflow-auto">
                    <table className="w-full min-w-[860px] text-sm">
                      <thead className="sticky top-0 bg-[var(--surface-navy,#102C57)] text-white">
                        <tr>
                          <th className="px-3 py-2 text-left">แผนก</th>
                          <th className="px-3 py-2 text-left">FG</th>
                          <th className="px-3 py-2 text-left">ชื่อ FG</th>
                          <th className="px-3 py-2 text-left">ประเภท</th>
                          <th className="px-3 py-2 text-left">รหัสวัตถุดิบ/WIP</th>
                          <th className="px-3 py-2 text-left">ชื่อรายการ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {deleteImpact?.impacts?.length ? (
                          deleteImpact.impacts.map((row) => (
                            <tr key={row.id} className="border-t border-[#d2d2d2]">
                              <td className="px-3 py-2 text-slate-700">
                                {row.departmentCode ? `[${row.departmentCode}] ` : ""}
                                {row.departmentName || "-"}
                              </td>
                              <td className="px-3 py-2 font-mono font-semibold text-[#102C57]">
                                {row.fgSkuCode || "-"}
                              </td>
                              <td className="px-3 py-2 text-slate-700">{row.fgSkuName || "-"}</td>
                              <td className="px-3 py-2">
                                <span className="inline-flex border border-[#d4af37]/50 bg-[#fff8e2] px-2 py-0.5 text-[11px] font-semibold text-[#102C57]">
                                  {row.componentType || "-"}
                                </span>
                              </td>
                              <td className="px-3 py-2 font-mono font-semibold text-[#102C57]">
                                {row.componentSkuCode || "-"}
                              </td>
                              <td className="px-3 py-2 text-slate-700">{row.componentSkuName || "-"}</td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={6} className="px-4 py-10 text-center text-slate-500">
                              ไม่พบ Routing ที่ใช้ห้องนี้
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 border-t border-[#d2d2d2] bg-[#f6f7f9] px-5 py-4">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                disabled={saving}
                className="h-10 border border-[#cccccc] bg-white px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={saving || deleteImpactLoading}
                className="h-10 border border-red-700 bg-red-700 px-4 text-sm font-bold text-white hover:bg-red-800 disabled:opacity-50"
              >
                {saving ? "กำลังลบ..." : "ยืนยันลบห้อง"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
