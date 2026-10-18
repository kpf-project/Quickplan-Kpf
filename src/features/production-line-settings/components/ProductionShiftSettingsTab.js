"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Clock3,
  GitBranch,
  MoonStar,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import {
  createProductionSectionShift,
  createProductionShift,
  deleteProductionSectionShift,
  deleteProductionShift,
  fetchProductionSectionShifts,
  fetchProductionShifts,
  updateProductionSectionShift,
  updateProductionShift,
} from "@/features/production-line-settings/services/productionLineSettingsClient";
import { inferCrossesMidnight, mapShiftRow } from "@/lib/productionShifts";
import { mapSectionShiftRow } from "@/lib/productionSectionShifts";

const DEFAULT_SHIFT_FORM = {
  id: null,
  code: "",
  name: "",
  startTime: "07:00",
  endTime: "16:00",
  crossesMidnight: false,
  sortOrder: 0,
  isActive: true,
};

const DEFAULT_ASSIGNMENT_FORM = {
  id: null,
  sectionDefId: "",
  shiftId: "",
  startTime: "07:00",
  endTime: "16:00",
  crossesMidnight: false,
  sortOrder: 0,
  isActive: true,
};

function sortShifts(rows = []) {
  return [...rows].sort(
    (a, b) =>
      Number(a.sortOrder || 0) - Number(b.sortOrder || 0)
      || String(a.code || "").localeCompare(String(b.code || ""))
  );
}

function sortAssignments(rows = []) {
  return [...rows].sort(
    (a, b) =>
      String(a.sectionName || "").localeCompare(String(b.sectionName || ""))
      || Number(a.sortOrder || 0) - Number(b.sortOrder || 0)
      || String(a.shiftCode || "").localeCompare(String(b.shiftCode || ""))
  );
}

function mapShiftForm(row = null) {
  if (!row) return { ...DEFAULT_SHIFT_FORM };
  return {
    id: row.id,
    code: row.code || "",
    name: row.name || "",
    startTime: row.startTime || "07:00",
    endTime: row.endTime || "16:00",
    crossesMidnight: row.crossesMidnight === true,
    sortOrder: Number(row.sortOrder ?? 0) || 0,
    isActive: row.isActive !== false,
  };
}

function mapAssignmentForm(row = null) {
  if (!row) return { ...DEFAULT_ASSIGNMENT_FORM };
  return {
    id: row.id,
    sectionDefId: row.sectionDefId || "",
    shiftId: row.shiftId || "",
    startTime: row.startTime || "07:00",
    endTime: row.endTime || "16:00",
    crossesMidnight: row.crossesMidnight === true,
    sortOrder: Number(row.sortOrder ?? 0) || 0,
    isActive: row.isActive !== false,
  };
}

function SectionCard({ section, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
        active
          ? "border-[#102C57] bg-[var(--surface-navy,#102C57)] text-white shadow-sm"
          : "border-[#d7dfeb] bg-white text-[#102C57] hover:border-[#102C57]/30 hover:bg-[#f7f9fc]"
      }`}
    >
      <div className={`text-[11px] font-bold uppercase tracking-[0.14em] ${active ? "text-[#d4af37]" : "text-[#8a6d1f]"}`}>
        {section.departmentCode || "DEPT"}
      </div>
      <div className="mt-1 text-sm font-semibold">{section.name}</div>
      <div className={`mt-1 text-[11px] ${active ? "text-white/75" : "text-[#102C57]/55"}`}>
        {section.departmentName || "-"}
      </div>
    </button>
  );
}

function ShiftModal({ open, form, setForm, saving, onClose, onSave }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--surface-navy,#102C57)]/45 px-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-[28px] border border-[#d7dfeb] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#102C57]/10 bg-[var(--surface-navy,#102C57)] px-5 py-4 text-white">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#d4af37]">Shift Master</div>
            <h3 className="mt-1 text-lg font-bold">
              {form.id ? "แก้ไขแม่แบบกะ" : "เพิ่มแม่แบบกะ"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10"
          >
            <X size={16} />
          </button>
        </div>

        <div className="grid gap-4 p-5 md:grid-cols-2">
          <label className="block">
            <div className="mb-1 text-sm font-semibold text-[#102C57]">รหัสกะ</div>
            <input
              value={form.code}
              onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value.toUpperCase() }))}
              className="h-11 w-full rounded-2xl border border-[#d7dfeb] px-3 text-sm outline-none focus:border-[#102C57]"
              placeholder="SHIFT1"
            />
          </label>
          <label className="block">
            <div className="mb-1 text-sm font-semibold text-[#102C57]">ชื่อกะ</div>
            <input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              className="h-11 w-full rounded-2xl border border-[#d7dfeb] px-3 text-sm outline-none focus:border-[#102C57]"
              placeholder="กะ 1"
            />
          </label>
          <label className="block">
            <div className="mb-1 text-sm font-semibold text-[#102C57]">เวลาเริ่ม</div>
            <input
              type="time"
              value={form.startTime}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  startTime: event.target.value,
                  crossesMidnight: inferCrossesMidnight(event.target.value, prev.endTime),
                }))
              }
              className="h-11 w-full rounded-2xl border border-[#d7dfeb] px-3 text-sm outline-none focus:border-[#102C57]"
            />
          </label>
          <label className="block">
            <div className="mb-1 text-sm font-semibold text-[#102C57]">เวลาสิ้นสุด</div>
            <input
              type="time"
              value={form.endTime}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  endTime: event.target.value,
                  crossesMidnight: inferCrossesMidnight(prev.startTime, event.target.value),
                }))
              }
              className="h-11 w-full rounded-2xl border border-[#d7dfeb] px-3 text-sm outline-none focus:border-[#102C57]"
            />
          </label>
          <label className="block">
            <div className="mb-1 text-sm font-semibold text-[#102C57]">ลำดับแสดงผล</div>
            <input
              type="number"
              min="0"
              value={form.sortOrder}
              onChange={(event) => setForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
              className="h-11 w-full rounded-2xl border border-[#d7dfeb] px-3 text-sm outline-none focus:border-[#102C57]"
            />
          </label>
          <div className="flex flex-col justify-end gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-[#102C57]">
              <input
                type="checkbox"
                checked={form.crossesMidnight}
                onChange={(event) => setForm((prev) => ({ ...prev, crossesMidnight: event.target.checked }))}
              />
              กะนี้ข้ามวัน
            </label>
            <label className="inline-flex items-center gap-2 text-sm text-[#102C57]">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
              />
              เปิดใช้งาน
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#d7dfeb] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-[#d7dfeb] px-4 py-2 text-sm font-semibold text-[#102C57]"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-2xl border border-[#d4af37] bg-[#d4af37] px-4 py-2 text-sm font-semibold text-[#102C57] disabled:opacity-50"
          >
            บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}

function AssignmentModal({
  open,
  form,
  setForm,
  saving,
  sectionCatalog,
  shiftOptions,
  onClose,
  onSave,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--surface-navy,#102C57)]/45 px-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-[28px] border border-[#d7dfeb] bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#102C57]/10 bg-[var(--surface-navy,#102C57)] px-5 py-4 text-white">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#d4af37]">Section Shift</div>
            <h3 className="mt-1 text-lg font-bold">
              {form.id ? "แก้ไขกะของ section" : "ผูกกะให้ section"}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <label className="block">
            <div className="mb-1 text-sm font-semibold text-[#102C57]">Section</div>
            <select
              value={form.sectionDefId}
              onChange={(event) => setForm((prev) => ({ ...prev, sectionDefId: event.target.value }))}
              className="h-11 w-full rounded-2xl border border-[#d7dfeb] bg-white px-3 text-sm outline-none focus:border-[#102C57]"
            >
              <option value="">เลือก section</option>
              {sectionCatalog.map((section) => (
                <option key={section.id} value={section.id}>
                  [{section.departmentCode}] {section.name}
                </option>
              ))}
            </select>
          </label>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <div className="mb-1 text-sm font-semibold text-[#102C57]">แม่แบบกะ</div>
              <select
                value={form.shiftId}
                onChange={(event) => {
                  const nextShift = shiftOptions.find((row) => row.id === event.target.value) || null;
                  setForm((prev) => ({
                    ...prev,
                    shiftId: event.target.value,
                    startTime: nextShift?.startTime || prev.startTime,
                    endTime: nextShift?.endTime || prev.endTime,
                    crossesMidnight: nextShift?.crossesMidnight === true,
                    sortOrder: nextShift?.sortOrder ?? prev.sortOrder,
                  }));
                }}
                className="h-11 w-full rounded-2xl border border-[#d7dfeb] bg-white px-3 text-sm outline-none focus:border-[#102C57]"
              >
                <option value="">เลือกกะ</option>
                {shiftOptions.map((shift) => (
                  <option key={shift.id} value={shift.id}>
                    {shift.code} - {shift.name}
                  </option>
                ))}
              </select>
            </label>

            <div className="rounded-2xl border border-[#d7dfeb] bg-[#fbfcfe] px-4 py-3 text-sm text-[#102C57]/70">
              <div className="flex items-center gap-2 font-semibold text-[#102C57]">
                <GitBranch size={14} />
                เวลาใช้งานจริงของ section
              </div>
              <div className="mt-2 text-xs">
                section เดียวกันสามารถใช้ชื่อกะเดียวกันได้ แต่กำหนดเวลาเริ่ม-จบต่างกันได้ตามการทำงานจริง
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <div className="mb-1 text-sm font-semibold text-[#102C57]">เวลาเริ่มจริง</div>
              <input
                type="time"
                value={form.startTime}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    startTime: event.target.value,
                    crossesMidnight: inferCrossesMidnight(event.target.value, prev.endTime),
                  }))
                }
                className="h-11 w-full rounded-2xl border border-[#d7dfeb] px-3 text-sm outline-none focus:border-[#102C57]"
              />
            </label>
            <label className="block">
              <div className="mb-1 text-sm font-semibold text-[#102C57]">เวลาสิ้นสุดจริง</div>
              <input
                type="time"
                value={form.endTime}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    endTime: event.target.value,
                    crossesMidnight: inferCrossesMidnight(prev.startTime, event.target.value),
                  }))
                }
                className="h-11 w-full rounded-2xl border border-[#d7dfeb] px-3 text-sm outline-none focus:border-[#102C57]"
              />
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <div className="mb-1 text-sm font-semibold text-[#102C57]">ลำดับแสดงผล</div>
              <input
                type="number"
                min="0"
                value={form.sortOrder}
                onChange={(event) => setForm((prev) => ({ ...prev, sortOrder: event.target.value }))}
                className="h-11 w-full rounded-2xl border border-[#d7dfeb] px-3 text-sm outline-none focus:border-[#102C57]"
              />
            </label>
            <div className="flex flex-col justify-end gap-3">
              <label className="inline-flex items-center gap-2 text-sm text-[#102C57]">
                <input
                  type="checkbox"
                  checked={form.crossesMidnight}
                  onChange={(event) => setForm((prev) => ({ ...prev, crossesMidnight: event.target.checked }))}
                />
                กะนี้ข้ามวัน
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-[#102C57]">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
                />
                เปิดใช้งาน
              </label>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[#d7dfeb] px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-2xl border border-[#d7dfeb] px-4 py-2 text-sm font-semibold text-[#102C57]"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="rounded-2xl border border-[#d4af37] bg-[#d4af37] px-4 py-2 text-sm font-semibold text-[#102C57] disabled:opacity-50"
          >
            บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ProductionShiftSettingsTab({ canManage = false }) {
  const [masterShifts, setMasterShifts] = useState([]);
  const [sectionCatalog, setSectionCatalog] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [shiftSearch, setShiftSearch] = useState("");
  const [sectionSearch, setSectionSearch] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [isShiftModalOpen, setIsShiftModalOpen] = useState(false);
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [shiftForm, setShiftForm] = useState(DEFAULT_SHIFT_FORM);
  const [assignmentForm, setAssignmentForm] = useState(DEFAULT_ASSIGNMENT_FORM);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const [shiftResult, sectionShiftResult] = await Promise.all([
        fetchProductionShifts({ includeInactive: "true" }),
        fetchProductionSectionShifts({
          includeInactive: "true",
          includeInactiveSections: "true",
        }),
      ]);

      if (!shiftResult.ok) {
        throw new Error(shiftResult.error?.message || "โหลดกะการผลิตไม่สำเร็จ");
      }
      if (!sectionShiftResult.ok) {
        throw new Error(sectionShiftResult.error?.message || "โหลดกะของแต่ละ section ไม่สำเร็จ");
      }

      const nextMasterShifts = sortShifts(
        Array.isArray(shiftResult.data?.data) ? shiftResult.data.data.map(mapShiftRow) : []
      );
      const nextSections = Array.isArray(sectionShiftResult.data?.sections)
        ? sectionShiftResult.data.sections
        : [];
      const nextAssignments = sortAssignments(
        Array.isArray(sectionShiftResult.data?.data)
          ? sectionShiftResult.data.data.map(mapSectionShiftRow)
          : []
      );

      setMasterShifts(nextMasterShifts);
      setSectionCatalog(nextSections);
      setAssignments(nextAssignments);
      setSelectedSectionId((current) => {
        if (current && nextSections.some((section) => section.id === current)) return current;
        return nextSections[0]?.id || "";
      });
    } catch (error) {
      setErrorMessage(error?.message || "โหลดข้อมูลกะไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filteredMasterShifts = useMemo(() => {
    const query = String(shiftSearch || "").trim().toLowerCase();
    return masterShifts.filter((row) => {
      if (!query) return true;
      return (
        String(row.code || "").toLowerCase().includes(query)
        || String(row.name || "").toLowerCase().includes(query)
      );
    });
  }, [masterShifts, shiftSearch]);

  const filteredSections = useMemo(() => {
    const query = String(sectionSearch || "").trim().toLowerCase();
    return sectionCatalog.filter((section) => {
      if (!query) return true;
      return (
        String(section.name || "").toLowerCase().includes(query)
        || String(section.departmentCode || "").toLowerCase().includes(query)
        || String(section.departmentName || "").toLowerCase().includes(query)
      );
    });
  }, [sectionCatalog, sectionSearch]);

  const selectedSection = useMemo(
    () => sectionCatalog.find((section) => section.id === selectedSectionId) || filteredSections[0] || null,
    [filteredSections, sectionCatalog, selectedSectionId]
  );

  const selectedSectionAssignments = useMemo(() => {
    const key = String(selectedSection?.id || "").trim();
    return assignments.filter((row) => String(row.sectionDefId || "").trim() === key);
  }, [assignments, selectedSection]);

  const assignmentShiftOptions = useMemo(() => sortShifts(masterShifts), [masterShifts]);

  const openCreateShiftModal = () => {
    setShiftForm({ ...DEFAULT_SHIFT_FORM });
    setIsShiftModalOpen(true);
  };

  const openEditShiftModal = (row) => {
    setShiftForm(mapShiftForm(row));
    setIsShiftModalOpen(true);
  };

  const openCreateAssignmentModal = () => {
    const defaultShift = masterShifts[0] || null;
    setAssignmentForm({
      ...DEFAULT_ASSIGNMENT_FORM,
      sectionDefId: String(selectedSection?.id || "").trim(),
      shiftId: defaultShift?.id || "",
      startTime: defaultShift?.startTime || "07:00",
      endTime: defaultShift?.endTime || "16:00",
      crossesMidnight: defaultShift?.crossesMidnight === true,
      sortOrder: selectedSectionAssignments.length,
    });
    setIsAssignmentModalOpen(true);
  };

  const openEditAssignmentModal = (row) => {
    setAssignmentForm(mapAssignmentForm(row));
    setIsAssignmentModalOpen(true);
  };

  const handleSaveShift = async () => {
    if (!canManage) return;
    setSaving(true);
    setErrorMessage("");
    try {
      const payload = {
        code: String(shiftForm.code || "").trim().toUpperCase(),
        name: String(shiftForm.name || "").trim(),
        startTime: shiftForm.startTime,
        endTime: shiftForm.endTime,
        crossesMidnight: shiftForm.crossesMidnight,
        sortOrder: Number(shiftForm.sortOrder ?? 0) || 0,
        isActive: shiftForm.isActive !== false,
      };
      const result = shiftForm.id
        ? await updateProductionShift(shiftForm.id, payload)
        : await createProductionShift(payload);
      if (!result.ok) {
        throw new Error(result.error?.message || "บันทึกกะการผลิตไม่สำเร็จ");
      }
      setIsShiftModalOpen(false);
      await refresh();
    } catch (error) {
      setErrorMessage(error?.message || "บันทึกกะการผลิตไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteShift = async (row) => {
    if (!canManage) return;
    if (!window.confirm(`ปิดใช้งาน ${row.name} ใช่หรือไม่?`)) return;
    setSaving(true);
    setErrorMessage("");
    try {
      const result = await deleteProductionShift(row.id);
      if (!result.ok) {
        throw new Error(result.error?.message || "ปิดใช้งานกะการผลิตไม่สำเร็จ");
      }
      await refresh();
    } catch (error) {
      setErrorMessage(error?.message || "ปิดใช้งานกะการผลิตไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAssignment = async () => {
    if (!canManage) return;
    setSaving(true);
    setErrorMessage("");
    try {
      const payload = {
        sectionDefId: assignmentForm.sectionDefId,
        shiftId: assignmentForm.shiftId,
        startTime: assignmentForm.startTime,
        endTime: assignmentForm.endTime,
        crossesMidnight: assignmentForm.crossesMidnight,
        sortOrder: Number(assignmentForm.sortOrder ?? 0) || 0,
        isActive: assignmentForm.isActive !== false,
      };
      const result = assignmentForm.id
        ? await updateProductionSectionShift(assignmentForm.id, payload)
        : await createProductionSectionShift(payload);
      if (!result.ok) {
        throw new Error(result.error?.message || "บันทึกกะของ section ไม่สำเร็จ");
      }
      setIsAssignmentModalOpen(false);
      await refresh();
    } catch (error) {
      setErrorMessage(error?.message || "บันทึกกะของ section ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAssignment = async (row) => {
    if (!canManage) return;
    if (!window.confirm(`ลบกะ ${row.shiftName} ออกจาก ${row.sectionName} ใช่หรือไม่?`)) return;
    setSaving(true);
    setErrorMessage("");
    try {
      const result = await deleteProductionSectionShift(row.id);
      if (!result.ok) {
        throw new Error(result.error?.message || "ลบกะของ section ไม่สำเร็จ");
      }
      await refresh();
    } catch (error) {
      setErrorMessage(error?.message || "ลบกะของ section ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5 bg-[#f6f7f9] p-4 text-[#102C57]">
      {errorMessage ? (
        <div className="rounded-2xl border border-[#e7b5b5] bg-[#fff5f5] px-4 py-3 text-sm text-[#b42318]">
          {errorMessage}
        </div>
      ) : null}

      <section className="rounded-[24px] border border-[#d7dfeb] bg-white shadow-sm">
        <div className="border-b border-[#102C57]/10 bg-[var(--surface-navy,#102C57)] px-5 py-4 text-white">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#d4af37]">Shift Master</div>
          <h2 className="mt-1 text-xl font-bold">แม่แบบกะการผลิต</h2>
          <p className="mt-1 text-sm text-white/75">
            ตั้งชื่อกะกลาง เช่น กะ 1 หรือ กะ 2 แล้วค่อยนำไปผูกกับเวลาใช้งานจริงของแต่ละ section
          </p>
        </div>

        <div className="p-4">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <label className="relative block w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#102C57]/45" />
              <input
                value={shiftSearch}
                onChange={(event) => setShiftSearch(event.target.value)}
                placeholder="ค้นหารหัสหรือชื่อกะ"
                className="h-11 w-full rounded-2xl border border-[#d7dfeb] bg-white pl-10 pr-3 text-sm outline-none focus:border-[#102C57]"
              />
            </label>
            {canManage ? (
              <button
                type="button"
                onClick={openCreateShiftModal}
                className="inline-flex items-center gap-2 rounded-2xl border border-[#d4af37] bg-[#d4af37] px-4 py-2.5 text-sm font-semibold text-[#102C57]"
              >
                <Plus size={16} />
                เพิ่มแม่แบบกะ
              </button>
            ) : null}
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredMasterShifts.map((row) => (
              <article key={row.id} className="rounded-2xl border border-[#d7dfeb] bg-[#fbfcfe] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8a6d1f]">{row.code}</div>
                    <div className="mt-1 text-base font-semibold">{row.name}</div>
                    <div className="mt-2 text-sm text-[#102C57]/70">
                      {row.startTime || "--:--"} - {row.endTime || "--:--"}
                    </div>
                  </div>
                  {row.crossesMidnight ? (
                    <MoonStar className="h-4 w-4 text-[#b8860b]" />
                  ) : (
                    <Clock3 className="h-4 w-4 text-[#102C57]/45" />
                  )}
                </div>
                <div className="mt-3 flex items-center justify-between text-[11px] text-[#102C57]/60">
                  <span>{row.isActive ? "ใช้งาน" : "ปิดใช้งาน"}</span>
                  <span>ลำดับ {row.sortOrder}</span>
                </div>
                {canManage ? (
                  <div className="mt-4 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => openEditShiftModal(row)}
                      className="inline-flex items-center gap-1 rounded-xl border border-[#102C57]/20 px-3 py-2 text-xs font-semibold text-[#102C57]"
                    >
                      <Pencil size={14} />
                      แก้ไข
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteShift(row)}
                      className="inline-flex items-center gap-1 rounded-xl border border-[#f1b6b6] px-3 py-2 text-xs font-semibold text-[#b42318]"
                    >
                      <Trash2 size={14} />
                      ปิดใช้งาน
                    </button>
                  </div>
                ) : null}
              </article>
            ))}
            {!loading && filteredMasterShifts.length === 0 ? (
              <div className="col-span-full rounded-2xl border border-dashed border-[#d7dfeb] px-4 py-10 text-center text-sm text-[#102C57]/55">
                ไม่พบกะตามคำค้นที่ระบุ
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rounded-[24px] border border-[#d7dfeb] bg-white shadow-sm">
        <div className="border-b border-[#102C57]/10 bg-[linear-gradient(90deg,#102C57_0%,#183866_68%,#f5f1e4_100%)] px-5 py-4 text-white">
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#d4af37]">Section Shift Matrix</div>
          <h2 className="mt-1 text-xl font-bold">กะตามแผนกและ section</h2>
          <p className="mt-1 text-sm text-white/75">
            แต่ละ section เลือกใช้กะเดียวกันได้ แต่กำหนดเวลาเริ่ม-จบต่างกันได้ตามการทำงานจริง
          </p>
        </div>

        <div className="grid gap-4 p-4 xl:grid-cols-[360px_minmax(0,1fr)]">
          <div className="space-y-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#102C57]/45" />
              <input
                value={sectionSearch}
                onChange={(event) => setSectionSearch(event.target.value)}
                placeholder="ค้นหา section หรือแผนก"
                className="h-11 w-full rounded-2xl border border-[#d7dfeb] bg-white pl-10 pr-3 text-sm outline-none focus:border-[#102C57]"
              />
            </label>
            <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
              {filteredSections.map((section) => (
                <SectionCard
                  key={section.id}
                  section={section}
                  active={section.id === selectedSection?.id}
                  onClick={() => setSelectedSectionId(section.id)}
                />
              ))}
              {!loading && filteredSections.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#d7dfeb] px-4 py-8 text-center text-sm text-[#102C57]/55">
                  ไม่พบ section ตามเงื่อนไขที่เลือก
                </div>
              ) : null}
            </div>
          </div>

          <div className="space-y-4">
            <div className="rounded-2xl border border-[#d7dfeb] bg-[#fbfcfe] p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#8a6d1f]">
                    {selectedSection?.departmentCode || "DEPT"}
                  </div>
                  <h3 className="mt-1 text-2xl font-bold text-[#102C57]">
                    {selectedSection?.name || "เลือก section"}
                  </h3>
                  <p className="mt-1 text-sm text-[#102C57]/65">
                    {selectedSection?.departmentName || "ยังไม่ได้เลือกแผนก"}
                  </p>
                </div>
                {canManage ? (
                  <button
                    type="button"
                    onClick={openCreateAssignmentModal}
                    disabled={!selectedSection}
                    className="inline-flex items-center gap-2 rounded-2xl border border-[#d4af37] bg-[#d4af37] px-4 py-2.5 text-sm font-semibold text-[#102C57] disabled:opacity-40"
                  >
                    <Plus size={16} />
                    ผูกกะให้ section นี้
                  </button>
                ) : null}
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-[#d7dfeb]">
              <div className="grid grid-cols-[1.6fr_1fr_1fr_150px] bg-[var(--surface-navy,#102C57)] px-4 py-3 text-sm font-semibold text-white">
                <div>กะที่ใช้</div>
                <div>เวลาเริ่ม</div>
                <div>เวลาสิ้นสุด</div>
                <div className="text-center">จัดการ</div>
              </div>
              <div className="divide-y divide-[#e7edf5] bg-white">
                {selectedSectionAssignments.map((row) => (
                  <div key={row.id} className="grid grid-cols-[1.6fr_1fr_1fr_150px] items-center px-4 py-3 text-sm text-[#102C57]">
                    <div>
                      <div className="font-semibold">{row.shiftName}</div>
                      <div className="mt-1 text-[11px] text-[#102C57]/55">{row.shiftCode}</div>
                    </div>
                    <div>{row.startTime || "-"}</div>
                    <div>{row.endTime || "-"}</div>
                    <div className="flex items-center justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => openEditAssignmentModal(row)}
                        className="inline-flex items-center gap-1 rounded-xl border border-[#102C57]/20 px-2.5 py-1.5 text-xs font-semibold text-[#102C57]"
                      >
                        <Pencil size={13} />
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteAssignment(row)}
                        className="inline-flex items-center gap-1 rounded-xl border border-[#f1b6b6] px-2.5 py-1.5 text-xs font-semibold text-[#b42318]"
                      >
                        <Trash2 size={13} />
                        ลบ
                      </button>
                    </div>
                  </div>
                ))}
                {!loading && selectedSection && selectedSectionAssignments.length === 0 ? (
                  <div className="px-4 py-10 text-center text-sm text-[#102C57]/55">
                    section นี้ยังไม่ผูกกะ
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      </section>

      <ShiftModal
        open={isShiftModalOpen}
        form={shiftForm}
        setForm={setShiftForm}
        saving={saving}
        onClose={() => setIsShiftModalOpen(false)}
        onSave={handleSaveShift}
      />

      <AssignmentModal
        open={isAssignmentModalOpen}
        form={assignmentForm}
        setForm={setAssignmentForm}
        saving={saving}
        sectionCatalog={sectionCatalog}
        shiftOptions={assignmentShiftOptions}
        onClose={() => setIsAssignmentModalOpen(false)}
        onSave={handleSaveAssignment}
      />
    </div>
  );
}
