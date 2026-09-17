"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Layers, ShieldCheck } from "lucide-react";

export default function RolePermissionsForm({
  roles,
  permissionGroups,
  onSaveRole,
  onDeleteRole,
  isLoading,
}) {
  const allPermissionIds = useMemo(() => (
    permissionGroups.flatMap((group) => {
      const sectionItems = (group.sections || []).flatMap((section) => section.items || []);
      const items = sectionItems.length ? sectionItems : (group.items || []);
      return items.map((item) => item.id);
    })
  ), [permissionGroups]);

  const [roleName, setRoleName] = useState("");
  const [baseRoleId, setBaseRoleId] = useState("");
  const [editRoleId, setEditRoleId] = useState("");
  const [selectedPermissions, setSelectedPermissions] = useState([]);
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTone, setStatusTone] = useState("neutral");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const editableRoles = useMemo(
    () => roles.filter((role) => !role.is_system),
    [roles]
  );

  const activeEditRole = useMemo(
    () => editableRoles.find((role) => role.id === editRoleId),
    [editableRoles, editRoleId]
  );

  useEffect(() => {
    if (!baseRoleId || editRoleId) {
      return;
    }
    const baseRole = roles.find((role) => role.id === baseRoleId);
    if (!baseRole) {
      return;
    }
    const basePermissions = baseRole.permissions?.includes("*")
      ? allPermissionIds
      : (baseRole.permissions ?? []);
    const filtered = basePermissions.filter((id) => allPermissionIds.includes(id));
    setSelectedPermissions(filtered);
    if (!roleName) {
      setRoleName(baseRole.name);
    }
  }, [allPermissionIds, baseRoleId, editRoleId, roleName, roles]);

  useEffect(() => {
    if (!editRoleId) {
      return;
    }
    const editRole = roles.find((role) => role.id === editRoleId);
    if (!editRole) {
      return;
    }
    const basePermissions = editRole.permissions?.includes("*")
      ? allPermissionIds
      : (editRole.permissions ?? []);
    const filtered = basePermissions.filter((id) => allPermissionIds.includes(id));
    setSelectedPermissions(filtered);
    setRoleName(editRole.name);
  }, [allPermissionIds, editRoleId, roles]);

  const togglePermission = (id) => {
    setSelectedPermissions((current) => (
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    ));
  };

  const toggleGroup = (groupIds, shouldSelect) => {
    setSelectedPermissions((current) => {
      const currentSet = new Set(current);
      if (shouldSelect) {
        groupIds.forEach((id) => currentSet.add(id));
      } else {
        groupIds.forEach((id) => currentSet.delete(id));
      }
      return Array.from(currentSet);
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const trimmedName = roleName.trim();
    if (!trimmedName) {
      setStatusMessage("กรุณาระบุชื่อบทบาทก่อนบันทึก");
      setStatusTone("error");
      return;
    }
    setIsSubmitting(true);
    setStatusMessage("");
    setStatusTone("neutral");
    try {
      await onSaveRole({
        id: editRoleId || null,
        name: trimmedName,
        permissions: selectedPermissions,
      });
      setStatusMessage(editRoleId ? "อัปเดตบทบาทเรียบร้อยแล้ว" : "บันทึกบทบาทเรียบร้อยแล้ว");
      setStatusTone("success");
    } catch (error) {
      setStatusMessage(error?.message ?? "ไม่สามารถบันทึกบทบาทได้");
      setStatusTone("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!editRoleId || !onDeleteRole) {
      return;
    }
    const confirmText = `ต้องการลบบทบาท "${roleName}" ใช่หรือไม่?`;
    if (!window.confirm(confirmText)) {
      return;
    }
    setIsSubmitting(true);
    setStatusMessage("");
    setStatusTone("neutral");
    try {
      await onDeleteRole(editRoleId);
      setEditRoleId("");
      setRoleName("");
      setBaseRoleId("");
      setSelectedPermissions([]);
      setStatusMessage("ลบบทบาทเรียบร้อยแล้ว");
      setStatusTone("success");
    } catch (error) {
      setStatusMessage(error?.message ?? "ไม่สามารถลบบทบาทได้");
      setStatusTone("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Header Info Block */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-4 border-b border-slate-100 select-none">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d4af37]">
            Roles & Access Levels
          </span>
          <h2 className="text-[16px] font-black text-[#102C57] mt-0.5">
            จัดการสิทธิ์การเข้าถึงระบบ
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            สร้างบทบาทใหม่ หรือเลือกบทบาทที่ต้องการแก้ไขเพื่อปรับปรุงสิทธิ์
          </p>
        </div>
        <div className="border border-[#102C57]/20 bg-[#fdf7e6] px-3 py-1.5 text-[10px] font-bold text-[#102C57] tracking-wider uppercase rounded-[2px]">
          AUTHORIZATION DESK
        </div>
      </div>

      {/* Role configuration fields */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="space-y-1.5">
          <label className="text-[11px] font-black uppercase tracking-wider text-slate-600">ชื่อบทบาท</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <ShieldCheck size={15} />
            </span>
            <input
              value={roleName}
              onChange={(event) => setRoleName(event.target.value)}
              placeholder="เช่น ผู้จัดการคลังสินค้า"
              className="w-full h-10 pl-9 pr-3 border border-slate-200 bg-white text-xs font-semibold focus:outline-none rounded-[2px]"
            />
          </div>
          <p className="text-[10px] text-slate-400 italic">ตั้งชื่อเป็นทางการ เช่น ฝ่ายจัดซื้อ, สารสนเทศ</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-black uppercase tracking-wider text-slate-600">แก้ไขบทบาทที่มีอยู่</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <ShieldCheck size={15} />
            </span>
            <select
              value={editRoleId}
              onChange={(event) => setEditRoleId(event.target.value)}
              className="w-full h-10 pl-9 pr-3 border border-slate-200 bg-white text-xs font-semibold focus:outline-none rounded-[2px]"
            >
              <option value="">+ สร้างบทบาทใหม่</option>
              {editableRoles.map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
          </div>
          <p className="text-[10px] text-slate-400 italic">เลือกเพื่อแก้ไข/อัปเดต หรือกดลบ</p>
        </div>

        <div className="space-y-1.5">
          <label className="text-[11px] font-black uppercase tracking-wider text-slate-600">คัดลอกโครงสิทธิ์จาก</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <Layers size={15} />
            </span>
            <select
              value={baseRoleId}
              onChange={(event) => setBaseRoleId(event.target.value)}
              className="w-full h-10 pl-9 pr-3 border border-slate-200 bg-white text-xs font-semibold focus:outline-none rounded-[2px]"
            >
              <option value="">เริ่มต้นใหม่จากศูนย์</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>{role.name}</option>
              ))}
            </select>
          </div>
          <p className="text-[10px] text-slate-400 italic">คัดลอกสิทธิ์ที่มีอยู่แล้วเป็นต้นแบบ</p>
        </div>
      </div>

      {/* Permissions Tree Area */}
      <div className="space-y-4 pt-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-slate-100">
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-[#102C57]">สิทธิ์การเข้าถึงหน้าและแท็บ</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">เลือกโมดูลที่ต้องการให้อนุญาตสิทธิ์การเข้าถึง</p>
          </div>
          <button
            type="button"
            onClick={() => toggleGroup(allPermissionIds, true)}
            disabled={isLoading || allPermissionIds.length === 0}
            className="text-[10px] font-black uppercase tracking-widest text-[#102C57] hover:text-[#d4af37] border border-slate-200 px-3 py-1.5 rounded-[2px] transition hover:bg-slate-50"
          >
            เลือกทั้งหมด
          </button>
        </div>

        <div className="space-y-6">
          {isLoading ? (
            <div className="border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-xs text-slate-500 rounded-[2px]">
              กำลังโหลดรายการกลุ่มสิทธิ์ความปลอดภัย...
            </div>
          ) : permissionGroups.length === 0 ? (
            <div className="border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-xs text-slate-500 rounded-[2px]">
              ไม่พบบทบาทหรือรายการสิทธิ์ใด ๆ ในระบบ
            </div>
          ) : permissionGroups.map((group) => {
            const sectionItems = (group.sections || []).flatMap((section) => section.items || []);
            const groupItems = sectionItems.length ? sectionItems : (group.items || []);
            const groupIds = groupItems.map((item) => item.id);
            const selectedCount = groupIds.filter((id) => selectedPermissions.includes(id)).length;
            const allSelected = selectedCount === groupIds.length;
            return (
              <div key={group.id} className="border border-slate-200 bg-white rounded-[2px] overflow-hidden">
                {/* Header Group */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-3 bg-slate-50 border-b border-slate-200 select-none">
                  <div>
                    <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider">{group.title}</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">{group.description}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold text-slate-600">เลือกแล้ว {selectedCount}/{groupIds.length}</span>
                    <button
                      type="button"
                      onClick={() => toggleGroup(groupIds, !allSelected)}
                      className="text-[9px] font-black uppercase tracking-widest text-[#102C57] hover:text-[#d4af37] border border-slate-200 px-2 py-1 rounded-[2px] bg-white transition hover:bg-slate-50"
                    >
                      {allSelected ? "CLEAR ALL" : "SELECT GROUP"}
                    </button>
                  </div>
                </div>

                {/* Sub Permissions Grid */}
                <div className="p-4 space-y-4">
                  {(group.sections && group.sections.length > 0
                    ? group.sections
                    : [{ id: "default", title: "", items: groupItems }]
                  ).map((section) => (
                    <div key={section.id} className="space-y-2">
                      {section.title ? (
                        <div className="text-[10px] font-black uppercase tracking-widest text-[#102C57]/80">
                          {section.title}
                        </div>
                      ) : null}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {(section.items || []).map((item) => {
                          const isChecked = selectedPermissions.includes(item.id);
                          return (
                            <label
                              key={item.id}
                              className={`flex items-start gap-3 border p-3 cursor-pointer transition-all duration-150 rounded-[2px] ${
                                isChecked
                                  ? "border-[#d4af37] bg-[#fdf7e6] text-[#102C57]"
                                  : "border-slate-200 bg-white hover:border-slate-300"
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => togglePermission(item.id)}
                                disabled={isSubmitting}
                                className="mt-0.5 h-3.5 w-3.5 border-slate-300 text-[#102C57] focus:ring-[#102C57] rounded-[2px]"
                              />
                              <div className="min-w-0">
                                <span className="block text-xs font-black tracking-wide text-slate-800">{item.label}</span>
                                <span className="block text-[10px] text-slate-400 font-mono tracking-tighter truncate mt-0.5">{item.path}</span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Form Actions Footer */}
      <div className="border-t border-[#e2e8f0] pt-6 mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h4 className="text-xs font-black text-[#102C57] uppercase tracking-wider">
            {editRoleId ? "บันทึกการแก้ไขสิทธิ์" : "บันทึกข้อมูลบทบาทใหม่"}
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5 font-medium">สิทธิ์การใช้งานจะถูกปรับปรุงให้สมาชิกทั้งหมดในกลุ่มนี้โดยอัตโนมัติ</p>
          {statusMessage && (
            <p
              className={`text-[11px] font-bold mt-1.5 ${
                statusTone === "error"
                  ? "text-rose-600"
                  : statusTone === "success"
                  ? "text-emerald-600"
                  : "text-slate-600"
              }`}
            >
              {statusMessage}
            </p>
          )}
          {activeEditRole && activeEditRole.user_count > 0 && (
            <p className="text-[10px] mt-1 text-amber-700 italic font-bold">
              * ไม่แนะนำให้ลบบทบาทนี้เนื่องจากมีผู้ใช้ {activeEditRole.user_count} คนผูกโยงอยู่
            </p>
          )}
        </div>

        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row shrink-0">
          <button
            type="button"
            onClick={handleDelete}
            disabled={
              isSubmitting ||
              !editRoleId ||
              !activeEditRole ||
              activeEditRole.user_count > 0
            }
            className="w-full sm:w-auto h-11 px-5 text-rose-700 text-xs font-black uppercase tracking-widest hover:bg-rose-50 border border-rose-200 transition rounded-[2px] flex items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-60"
          >
            ลบบทบาทนี้
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full sm:w-auto h-11 px-6 bg-[#d4af37] hover:bg-[#102C57] text-[#102C57] hover:text-white text-xs font-black uppercase tracking-widest shadow-sm hover:border-[#102C57] transition rounded-[2px] flex items-center justify-center gap-1.5 border border-[#d4af37]"
          >
            <ClipboardCheck size={14} />
            {isSubmitting
              ? "กำลังบันทึก"
              : editRoleId
              ? "บันทึกการแก้ไข"
              : "บันทึกบทบาทใหม่"}
          </button>
        </div>
      </div>
    </form>
  );
}
