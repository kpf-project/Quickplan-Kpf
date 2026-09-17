"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, LogOut, Power, RefreshCw, Save, ShieldAlert, Trash2, UserCog, XCircle } from "lucide-react";
import { adminFetch } from "@/lib/adminClient";

export default function UserManagementPanel({ roles, departments, isLoading }) {
  const [users, setUsers] = useState([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [formState, setFormState] = useState({
    username: "",
    password: "",
    roleId: "",
    departmentId: "",
  });
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTone, setStatusTone] = useState("neutral");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionReason, setActionReason] = useState("");
  const [isActionSubmitting, setIsActionSubmitting] = useState(false);
  const [viewerMeta, setViewerMeta] = useState({
    currentUserId: "",
    isSuperAdmin: false,
  });

  const resolveStatus = (user) => {
    if (user?.deleted_at) {
      return { label: "ลบถาวร", tone: "rose" };
    }
    if (user?.is_archived) {
      return { label: "Archive", tone: "amber" };
    }
    if (user?.is_active) {
      return { label: "ใช้งาน", tone: "emerald" };
    }
    return { label: "ปิดใช้งาน", tone: "slate" };
  };

  const loadUsers = async () => {
    setIsLoadingUsers(true);
    setLoadError("");
    try {
      const payload = await adminFetch("/api/admin/users");
      setUsers(payload.users ?? []);
      setViewerMeta({
        currentUserId: payload?.meta?.current_user_id ?? "",
        isSuperAdmin: Boolean(payload?.meta?.is_super_admin),
      });
    } catch (error) {
      setLoadError(error?.message ?? "โหลดข้อมูลผู้ใช้งานไม่สำเร็จ");
    } finally {
      setIsLoadingUsers(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const selectedUser = useMemo(
    () => users.find((user) => user.id === selectedUserId),
    [selectedUserId, users]
  );

  const filteredUsers = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    if (!keyword) {
      return users;
    }
    return users.filter((user) => {
      const departmentName = user.department?.name ?? "";
      const roleName = user.role?.name ?? "";
      return [
        user.username || "",
        departmentName,
        roleName,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [searchTerm, users]);

  const startEditUser = (user) => {
    setSelectedUserId(user.id);
    setFormState({
      username: user.username ?? "",
      password: "",
      roleId: user.role?.id ?? "",
      departmentId: user.department?.id ?? "",
    });
    setStatusMessage("");
    setStatusTone("neutral");
    setActionReason("");
  };

  const clearSelection = () => {
    setSelectedUserId("");
    setFormState({
      username: "",
      password: "",
      roleId: "",
      departmentId: "",
    });
    setStatusMessage("");
    setStatusTone("neutral");
    setActionReason("");
  };

  const handleUserAction = async (action, options = {}) => {
    if (!selectedUser) {
      return;
    }

    const { requiresReason = false, confirmMessage = "" } = options;
    const reason = actionReason.trim();
    if (requiresReason && reason.length < 3) {
      setStatusTone("error");
      setStatusMessage("กรุณาระบุเหตุผลอย่างน้อย 3 ตัวอักษร");
      return;
    }

    if (confirmMessage && typeof window !== "undefined") {
      const confirmed = window.confirm(confirmMessage);
      if (!confirmed) {
        return;
      }
    }

    setIsActionSubmitting(true);
    setStatusMessage("");
    setStatusTone("neutral");
    try {
      const payload = {
        action,
        user_id: selectedUser.id,
      };
      if (requiresReason) {
        payload.reason = reason;
      }
      if (action === "set_active") {
        payload.is_active = !Boolean(selectedUser.is_active);
      }

      await adminFetch("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      await loadUsers();

      if (action === "hard_delete") {
        clearSelection();
      } else {
        setFormState((prev) => ({ ...prev, password: "" }));
      }
      setStatusTone("success");
      setStatusMessage("ดำเนินการเรียบร้อยแล้ว");
      if (requiresReason) {
        setActionReason("");
      }
    } catch (error) {
      setStatusTone("error");
      setStatusMessage(error?.message ?? "ไม่สามารถดำเนินการได้");
    } finally {
      setIsActionSubmitting(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selectedUserId) {
      return;
    }
    const trimmedUsername = formState.username.trim();
    if (trimmedUsername.length < 8) {
      setStatusMessage("ชื่อผู้ใช้ต้องมีอย่างน้อย 8 ตัวอักษร");
      setStatusTone("error");
      return;
    }
    if (!formState.roleId) {
      setStatusMessage("กรุณาเลือกบทบาท");
      setStatusTone("error");
      return;
    }

    setIsSubmitting(true);
    setStatusMessage("");
    setStatusTone("neutral");
    try {
      const payload = {
        user_id: selectedUserId,
        username: trimmedUsername,
        role_id: formState.roleId,
        department_id: formState.departmentId || "",
      };
      if (formState.password.trim()) {
        payload.password = formState.password.trim();
      }
      await adminFetch("/api/admin/users", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      await loadUsers();
      setFormState((prev) => ({ ...prev, password: "" }));
      setStatusMessage("อัปเดตข้อมูลผู้ใช้งานเรียบร้อย");
      setStatusTone("success");
    } catch (error) {
      setStatusMessage(error?.message ?? "ไม่สามารถอัปเดตผู้ใช้งานได้");
      setStatusTone("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedStatus = selectedUser ? resolveStatus(selectedUser) : null;
  const isSelectedSelf = selectedUser?.id === viewerMeta.currentUserId;
  const canToggleActive = Boolean(selectedUser)
    && !selectedUser.is_archived
    && !selectedUser.deleted_at
    && !(isSelectedSelf && selectedUser.is_active);
  const canArchive = Boolean(selectedUser)
    && !selectedUser.is_archived
    && !selectedUser.deleted_at
    && !isSelectedSelf;
  const canHardDelete = Boolean(selectedUser)
    && viewerMeta.isSuperAdmin
    && !selectedUser.deleted_at
    && !isSelectedSelf;

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pb-4 border-b border-slate-100 select-none">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d4af37]">
            User Catalog
          </span>
          <h2 className="text-[16px] font-black text-[#102C57] mt-0.5">
            จัดการข้อมูลผู้ใช้งาน
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            แก้ไขชื่อผู้ใช้ รหัสผ่าน แผนก และสิทธิ์ระดับผู้ดูแลระบบ
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={loadUsers}
            disabled={isLoadingUsers}
            className="inline-flex items-center gap-2 bg-[#102C57] text-white text-[10px] font-black uppercase tracking-widest px-4 py-2 border border-[#102C57] hover:bg-[#d4af37] hover:text-[#102C57] hover:border-[#d4af37] transition rounded-[2px]"
          >
            <RefreshCw size={12} className={isLoadingUsers ? "animate-spin" : ""} />
            {isLoadingUsers ? "LOADING..." : "REFRESH"}
          </button>
        </div>
      </div>

      {/* 1. Edit User Form Block (Shown only when selected) */}
      {selectedUser && (
        <form
          onSubmit={handleSubmit}
          className="border border-[#d4af37]/30 bg-[#fdf7e6]/30 p-6 space-y-5 rounded-[2px]"
        >
          <div className="flex items-center justify-between gap-4 pb-2 border-b border-slate-200">
            <div>
              <p className="text-xs font-black uppercase tracking-wider text-[#102C57]">
                กำลังแก้ไขบัญชี: {selectedUser.username}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                เว้นรหัสผ่านว่างได้หากไม่ต้องการเปลี่ยนแปลง
              </p>
            </div>
            <button
              type="button"
              onClick={clearSelection}
              className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-rose-600 transition"
            >
              <XCircle size={13} />
              ยกเลิกการแก้ไข
            </button>
          </div>

          {/* Form Grid */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-600">Username</label>
              <input
                value={formState.username}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, username: event.target.value }))
                }
                className="w-full h-9 px-3 border border-slate-200 bg-white text-xs font-semibold focus:outline-none rounded-[2px]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-600">รหัสผ่านใหม่</label>
              <input
                type="password"
                value={formState.password}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, password: event.target.value }))
                }
                placeholder="ปล่อยว่างหากคงเดิม"
                className="w-full h-9 px-3 border border-slate-200 bg-white text-xs font-semibold focus:outline-none rounded-[2px]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-600">แผนก</label>
              <select
                value={formState.departmentId}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, departmentId: event.target.value }))
                }
                disabled={isLoading}
                className="w-full h-9 px-3 border border-slate-200 bg-white text-xs font-semibold focus:outline-none rounded-[2px]"
              >
                <option value="">ไม่ระบุแผนก</option>
                {departments.map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-600">บทบาท</label>
              <select
                value={formState.roleId}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, roleId: event.target.value }))
                }
                disabled={isLoading}
                className="w-full h-9 px-3 border border-slate-200 bg-white text-xs font-semibold focus:outline-none rounded-[2px]"
              >
                <option value="">เลือกบทบาท</option>
                {roles.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Account Actions Section */}
          <div className="border border-slate-200 bg-white p-4 rounded-[2px] space-y-4">
            <div>
              <h4 className="text-[10px] font-black uppercase tracking-wider text-slate-700">คำสั่งสิทธิ์และความปลอดภัย</h4>
              <p className="text-[10px] text-slate-400">ระบุเหตุผลและกดปุ่มด้านล่างเพื่อดำเนินการทันที</p>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-600">เหตุผลประกอบการสั่งการ</label>
              <input
                value={actionReason}
                onChange={(event) => setActionReason(event.target.value)}
                placeholder="ระบุสาเหตุ เช่น ปรับโครงสิทธิ์ผู้ใช้งานใหม่"
                className="w-full h-9 px-3 border border-slate-200 bg-white text-xs font-semibold focus:outline-none rounded-[2px]"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1">
              <button
                type="button"
                onClick={() => handleUserAction("set_active", {
                  requiresReason: true,
                  confirmMessage: selectedUser.is_active
                    ? "ยืนยันปิดใช้งานผู้ใช้นี้?"
                    : "ยืนยันเปิดใช้งานผู้ใช้นี้?",
                })}
                disabled={isActionSubmitting || !canToggleActive}
                className="h-9 inline-flex items-center justify-center gap-1.5 border border-slate-200 text-slate-800 text-[10px] font-black uppercase tracking-widest transition rounded-[2px] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
              >
                <Power size={12} />
                {selectedUser.is_active ? "DEACTIVATE ACCOUNT" : "ACTIVATE ACCOUNT"}
              </button>
              <button
                type="button"
                onClick={() => handleUserAction("force_logout_all", {
                  confirmMessage: "ยืนยันบังคับออกจากระบบทุกอุปกรณ์?",
                })}
                disabled={isActionSubmitting || Boolean(selectedUser.deleted_at)}
                className="h-9 inline-flex items-center justify-center gap-1.5 border border-amber-200 bg-amber-50 text-amber-700 text-[10px] font-black uppercase tracking-widest transition rounded-[2px] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-amber-100"
              >
                <LogOut size={12} />
                FORCE LOGOUT ALL
              </button>
              <button
                type="button"
                onClick={() => handleUserAction("archive", {
                  requiresReason: true,
                  confirmMessage: "ยืนยัน Archive ผู้ใช้นี้?",
                })}
                disabled={isActionSubmitting || !canArchive}
                className="h-9 inline-flex items-center justify-center gap-1.5 border border-orange-200 bg-orange-50 text-orange-700 text-[10px] font-black uppercase tracking-widest transition rounded-[2px] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-orange-100"
              >
                <Archive size={12} />
                ARCHIVE
              </button>
              <button
                type="button"
                onClick={() => handleUserAction("hard_delete", {
                  requiresReason: true,
                  confirmMessage: "ยืนยัน Hard delete ผู้ใช้นี้? การดำเนินการนี้ย้อนกลับไม่ได้",
                })}
                disabled={isActionSubmitting || !canHardDelete}
                className="h-9 inline-flex items-center justify-center gap-1.5 border border-rose-200 bg-rose-50 text-rose-700 text-[10px] font-black uppercase tracking-widest transition rounded-[2px] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-rose-100"
              >
                <Trash2 size={12} />
                HARD DELETE
              </button>
            </div>
            
            {!viewerMeta.isSuperAdmin && (
              <div className="inline-flex items-center gap-1.5 text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-[2px] select-none">
                <ShieldAlert size={12} />
                <span>บัญชีปัจจุบันไม่มีสิทธิ์ Super Admin จึงไม่สามารถใช้คำสั่งลบถาวร (Hard Delete) ได้</span>
              </div>
            )}
          </div>

          {/* Form Actions Footer */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-3 border-t border-slate-200">
            <div className="text-xs">
              {statusMessage ? (
                <span
                  className={`font-bold ${
                    statusTone === "error"
                      ? "text-rose-600"
                      : statusTone === "success"
                      ? "text-emerald-600"
                      : "text-[#8a6b10]"
                  }`}
                >
                  {statusMessage}
                </span>
              ) : (
                <span className="text-slate-500 italic">
                  ระบบบันทึกความปลอดภัยและประวัติการสั่งงานโดยอัตโนมัติ
                </span>
              )}
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center justify-center gap-1.5 bg-[#d4af37] text-[#102C57] text-[10px] font-black uppercase tracking-widest px-5 py-2.5 rounded-[2px] hover:bg-[#102C57] hover:text-white transition shadow-sm border border-[#d4af37]"
            >
              <Save size={12} />
              {isSubmitting ? "SAVING..." : "UPDATE CONFIG"}
            </button>
          </div>
        </form>
      )}

      {/* 2. User Catalog List Block */}
      <div className="border border-slate-200 rounded-[2px] overflow-hidden bg-white">
        {/* Table Search Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 border-b border-slate-200 select-none bg-slate-50/50">
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-[#102C57]">สารบัญผู้ใช้งานทั้งหมด</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">เลือกปุ่ม {"แก้ไข"} ท้ายรายชื่อเพื่อจัดการข้อมูลสิทธิ์</p>
          </div>
          <div className="relative">
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="ค้นหาตามชื่อ แผนก หรือบทบาท..."
              className="h-9 w-full sm:w-64 border border-slate-200 bg-white px-3 text-xs font-semibold focus:outline-none rounded-[2px]"
            />
          </div>
        </div>

        {loadError && (
          <div className="px-5 py-3 text-xs font-bold text-rose-600 border-b border-rose-100 bg-rose-50">
            {loadError}
          </div>
        )}

        {/* Catalog Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase font-black tracking-widest text-[9px]">
                <th className="px-5 py-3.5">Username</th>
                <th className="px-5 py-3.5">แผนก (Department)</th>
                <th className="px-5 py-3.5">บทบาท (Access Role)</th>
                <th className="px-5 py-3.5 text-center">สถานะใช้งาน</th>
                <th className="px-5 py-3.5 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoadingUsers ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-400 italic">
                    กำลังดึงข้อมูลรายชื่อพนักงานและผู้ใช้งานจากเซิร์ฟเวอร์...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-8 text-center text-slate-400 italic">
                    ไม่พบบัญชีผู้ใช้ที่สอดคล้องกับเงื่อนไขการค้นหา
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-5 py-3.5 font-bold text-[#102C57]">{user.username}</td>
                    <td className="px-5 py-3.5 text-slate-600 font-medium">
                      {user.department?.name ?? "-"}
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 font-medium">
                      {user.role?.name ?? "-"}
                    </td>
                    <td className="px-5 py-3.5 text-center">
                      {(() => {
                        const status = resolveStatus(user);
                        const toneClass = status.tone === "emerald"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : status.tone === "amber"
                          ? "bg-amber-50 text-amber-700 border-amber-200"
                          : status.tone === "rose"
                          ? "bg-rose-50 text-rose-700 border-rose-200"
                          : "bg-slate-100 text-slate-500 border-slate-200";
                        return (
                          <span
                            className={`inline-flex items-center rounded-[2px] border px-2 py-0.5 text-[10px] font-black uppercase tracking-wider ${toneClass}`}
                          >
                            {status.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <button
                        type="button"
                        onClick={() => startEditUser(user)}
                        disabled={Boolean(user.deleted_at)}
                        className="inline-flex items-center gap-2 text-[#102C57] hover:text-[#d4af37] text-[10px] font-black uppercase tracking-widest border border-slate-200 px-3 py-1.5 rounded-[2px] transition hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        EDIT USER
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
