"use client";

import { useEffect, useMemo, useState } from "react";
import { Archive, LogOut, Power, RefreshCw, Save, ShieldAlert, Trash2, UserCog, X, User, KeyRound, Building2, ShieldCheck } from "lucide-react";
import { adminFetch } from "@/lib/adminClient";
import SettingsTable from "@/components/settings/SettingsTable";
import WeightScalePaginationBar from "@/features/production-line/components/WeightScalePaginationBar";
import SettingsDialog from "@/components/settings/SettingsDialog";

export default function UserManagementPanel({ roles, departments, isLoading }) {
  const [users, setUsers] = useState([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [listPage, setListPage] = useState(1);
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
    return users.filter((user) => {
      if (departmentFilter && user.department?.id !== departmentFilter) return false;
      if (statusFilter && (user.deleted_at ? "deleted" : user.is_archived ? "archived" : user.is_active ? "active" : "inactive") !== statusFilter) return false;
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
  }, [searchTerm, users, departmentFilter, statusFilter]);
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / 15));
  const safePage = Math.min(listPage, totalPages);
  const pagedUsers = filteredUsers.slice((safePage - 1) * 15, safePage * 15);

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
    <div className="settings-catalog">
      {/* 1. Edit User Form Block (Shown only when selected) */}
      {selectedUser && (
        <SettingsDialog compact label="แก้ไขผู้ใช้" onClose={clearSelection} busy={isSubmitting || isActionSubmitting}>
        <form
          onSubmit={handleSubmit}
          className="settings-edit-form"
        >
          <div className="settings-modal-title"><h2>แก้ไขผู้ใช้</h2><button type="button" aria-label="ปิดการแก้ไขผู้ใช้" disabled={isSubmitting || isActionSubmitting} onClick={clearSelection}><X size={18}/></button></div>

          {/* Form Grid */}
          <div className="settings-user-fields">
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-600">ชื่อผู้ใช้งาน (USERNAME)</label>
              <span className="settings-input-icon"><User size={15}/></span>
              <input
                value={formState.username}
                onChange={(event) =>
                  setFormState((prev) => ({ ...prev, username: event.target.value }))
                }
                className="w-full h-9 px-3 border border-slate-200 bg-white text-xs font-semibold focus:outline-none rounded-[2px]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-600">บทบาท</label>
              <span className="settings-input-icon"><ShieldCheck size={15}/></span>
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
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-600">แผนก</label>
              <span className="settings-input-icon"><Building2 size={15}/></span>
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
              <label className="text-[10px] font-black uppercase tracking-wider text-slate-600">รหัสผ่านใหม่ (ถ้าเปลี่ยน)</label>
              <span className="settings-input-icon"><KeyRound size={15}/></span>
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
          </div>

          {/* Account Actions Section */}
          <details className="settings-account-actions"><summary>คำสั่งบัญชีและความปลอดภัย</summary>
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
                {selectedUser.is_active ? "ปิดใช้งานบัญชี" : "เปิดใช้งานบัญชี"}
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
                ออกจากทุกเครื่อง
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
                เก็บเข้าคลัง
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
                ลบถาวร
              </button>
            </div>
            
            {!viewerMeta.isSuperAdmin && (
              <div className="inline-flex items-center gap-1.5 text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-100 px-3 py-1.5 rounded-[2px] select-none">
                <ShieldAlert size={12} />
                <span>บัญชีปัจจุบันไม่มีสิทธิ์ Super Admin จึงไม่สามารถใช้คำสั่งลบถาวร (Hard Delete) ได้</span>
              </div>
            )}
          </details>

          {statusMessage && <p role="status" className={statusTone === "error" ? "text-rose-600" : "text-emerald-700"}>{statusMessage}</p>}
          <div className="settings-modal-actions settings-user-save">
            <button type="button" disabled={isSubmitting || isActionSubmitting} onClick={clearSelection}>ยกเลิก</button>
            <button type="submit" disabled={isSubmitting || isActionSubmitting} className="settings-primary">{isSubmitting ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}</button>
          </div>
        </form>
        </SettingsDialog>
      )}

      {/* 2. User Catalog List Block */}
      <div className="border border-slate-200 rounded-[2px] overflow-hidden bg-white">
        <div className="settings-filter-row">
          <input aria-label="ค้นหาผู้ใช้" value={searchTerm} onChange={(event) => {setSearchTerm(event.target.value);setListPage(1);}} placeholder="ค้นหาชื่อผู้ใช้ แผนก หรือบทบาท..." />
          <select aria-label="กรองแผนก" value={departmentFilter} onChange={(event) => {setDepartmentFilter(event.target.value);setListPage(1);}}><option value="">ทุกแผนก</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>
          <select aria-label="กรองสถานะผู้ใช้" value={statusFilter} onChange={(event) => {setStatusFilter(event.target.value);setListPage(1);}}><option value="">ทุกสถานะ</option><option value="active">ใช้งาน</option><option value="inactive">ปิดใช้งาน</option><option value="archived">Archive</option><option value="deleted">ลบถาวร</option></select>
          <button type="button" className="settings-primary" disabled={isLoadingUsers} onClick={loadUsers}><RefreshCw size={14} />รีเฟรช</button>
        </div>

        {loadError && (
          <div className="px-5 py-3 text-xs font-bold text-rose-600 border-b border-rose-100 bg-rose-50">
            {loadError}
          </div>
        )}

        {/* Catalog Table */}
        <SettingsTable label="จัดการผู้ใช้">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase font-black tracking-widest text-[9px]">
                <th className="settings-sequence">ลำดับ</th><th className="px-5 py-3.5">ชื่อผู้ใช้งาน</th>
                <th className="px-5 py-3.5">แผนก (Department)</th>
                <th className="px-5 py-3.5">บทบาท (Access Role)</th>
                <th className="px-5 py-3.5 text-center">สถานะใช้งาน</th>
                <th className="px-5 py-3.5 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoadingUsers ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-slate-400 italic">
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
                pagedUsers.map((user, index) => (
                  <tr key={user.id} className="hover:bg-slate-50/50 transition">
                    <td>{(safePage - 1) * 15 + index + 1}</td><td className="px-5 py-3.5 font-bold text-[#102C57]">{user.username}</td>
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
                        แก้ไข
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
        </SettingsTable>
        <WeightScalePaginationBar page={safePage} totalPages={totalPages} totalCount={filteredUsers.length} limit={15} onPageChange={setListPage} isLoading={isLoadingUsers} />
      </div>
    </div>
  );
}
