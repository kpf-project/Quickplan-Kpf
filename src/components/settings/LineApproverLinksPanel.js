"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, RefreshCw, ToggleLeft, ToggleRight, MessageCircle, X } from "lucide-react";
import SettingsTable from "@/components/settings/SettingsTable";
import SettingsDialog from "@/components/settings/SettingsDialog";
import WeightScalePaginationBar from "@/features/production-line/components/WeightScalePaginationBar";
import { adminFetch } from "@/lib/adminClient";

export default function LineApproverLinksPanel() {
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [listPage, setListPage] = useState(1);
  const [editingId, setEditingId] = useState("");
  const [busy, setBusy] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [statusTone, setStatusTone] = useState("neutral");
  const [codeDrafts, setCodeDrafts] = useState({});
  const [approvalSettings, setApprovalSettings] = useState({
    requireApproval: true,
    isLoading: true,
    isSaving: false,
  });

  const loadUsers = async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const payload = await adminFetch("/api/admin/line-approvers");
      setUsers(payload.users ?? []);
    } catch (error) {
      setLoadError(error?.message ?? "โหลดรายชื่อผู้ใช้งานไม่สำเร็จ");
    } finally {
      setIsLoading(false);
    }
  };

  const loadApprovalSettings = async () => {
    setApprovalSettings((prev) => ({ ...prev, isLoading: true }));
    try {
      const payload = await adminFetch("/api/admin/bom-approval-settings");
      setApprovalSettings({
        requireApproval: payload?.settings?.requireApproval !== false,
        isLoading: false,
        isSaving: false,
      });
    } catch (error) {
      setApprovalSettings((prev) => ({ ...prev, isLoading: false, isSaving: false }));
      setStatusMessage(error?.message ?? "โหลดการตั้งค่าอนุมัติ BOM ไม่สำเร็จ");
      setStatusTone("error");
    }
  };

  useEffect(() => {
    loadUsers();
    loadApprovalSettings();
  }, []);

  useEffect(() => {
    const nextDrafts = {};
    (users ?? []).forEach((user) => {
      nextDrafts[user.id] = user.approver_code ?? "";
    });
    setCodeDrafts(nextDrafts);
  }, [users]);

  const filteredUsers = useMemo(() => {
    const keyword = searchTerm.trim().toLowerCase();
    return users.filter((user) => {
      if (departmentFilter && user.department?.id !== departmentFilter) return false;
      if (statusFilter === "linked" && !user.line_user_id) return false;
      if (statusFilter === "unlinked" && user.line_user_id) return false;
      const roleName = user.role?.name ?? "";
      const departmentName = user.department?.name ?? "";
      const code = user.approver_code ?? "";
      return [user.username, roleName, departmentName, code]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [searchTerm, users, departmentFilter, statusFilter]);

  const departments = [...new Map(users.filter((user) => user.department?.id).map((user) => [user.department.id, user.department])).values()];
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / 15));
  const safePage = Math.min(listPage, totalPages);
  const pagedUsers = filteredUsers.slice((safePage - 1) * 15, safePage * 15);
  const editingUser = users.find((user) => user.id === editingId);

  const updateLink = async (userId, action, extra = {}) => {
    if (busy) return;
    setBusy(true);
    setStatusMessage("");
    setStatusTone("neutral");
    try {
      await adminFetch("/api/admin/line-approvers", {
        method: "POST",
        body: JSON.stringify({ user_id: userId, action, ...extra }),
      });
      await loadUsers();
      if (action === "generate") {
        setStatusMessage("ออกโค้ดเชื่อม LINE ใหม่แล้ว");
      } else if (action === "clear") {
        setStatusMessage("ล้างการเชื่อมบัญชีแล้ว");
      } else if (action === "set-approver-code") {
        setStatusMessage("บันทึก approver code แล้ว");
      } else if (action === "clear-approver-code") {
        setStatusMessage("ลบ approver code แล้ว");
      } else if (action === "toggle-approver-code") {
        setStatusMessage("อัปเดตสถานะ approver code แล้ว");
      }
      setStatusTone("success");
    } catch (error) {
      setStatusMessage(error?.message || "อัปเดตไม่สำเร็จ");
      setStatusTone("error");
    } finally { setBusy(false); }
  };

  const updateBomApprovalSetting = async (requireApproval) => {
    setStatusMessage("");
    setStatusTone("neutral");
    setApprovalSettings((prev) => ({ ...prev, isSaving: true }));
    try {
      const payload = await adminFetch("/api/admin/bom-approval-settings", {
        method: "POST",
        body: JSON.stringify({ requireApproval }),
      });
      setApprovalSettings({
        requireApproval: payload?.settings?.requireApproval !== false,
        isLoading: false,
        isSaving: false,
      });
      setStatusMessage(
        requireApproval
          ? "เปิดโหมดบังคับส่งอนุมัติ BOM แล้ว"
          : "ปิดโหมดบังคับส่งอนุมัติ BOM แล้ว"
      );
      setStatusTone("success");
    } catch (error) {
      setApprovalSettings((prev) => ({ ...prev, isSaving: false }));
      setStatusMessage(error?.message || "บันทึกการตั้งค่าอนุมัติ BOM ไม่สำเร็จ");
      setStatusTone("error");
    }
  };

  const handleCopy = async (value) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setStatusMessage("คัดลอกรหัสแล้ว");
      setStatusTone("success");
    } catch (error) {
      setStatusMessage("ไม่สามารถคัดลอกรหัสได้");
      setStatusTone("error");
    }
  };

  const handleCodeChange = (userId, value) => {
    const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
    setCodeDrafts((prev) => ({ ...prev, [userId]: normalized }));
  };

  const handleSaveCode = async (userId) => {
    const code = (codeDrafts[userId] ?? "").trim().toUpperCase();
    if (!code) {
      setStatusMessage("กรุณาระบุ approver code ก่อนบันทึก");
      setStatusTone("error");
      return;
    }
    await updateLink(userId, "set-approver-code", { approver_code: code });
  };

  return <div className="settings-catalog settings-line-panel">
    <div className="settings-approval-band">
      <div><h2>การอนุมัติสูตรผ่าน LINE</h2><p>กำหนดรหัสผู้อนุมัติและเงื่อนไขขออนุมัติสูตรการผลิต</p></div>
      <button type="button" role="switch" aria-checked={approvalSettings.requireApproval} disabled={approvalSettings.isLoading || approvalSettings.isSaving}
        onClick={() => { if (window.confirm(approvalSettings.requireApproval ? "ปิดการบังคับขออนุมัติ BOM ผ่าน LINE ใช่หรือไม่?" : "เปิดการบังคับขออนุมัติ BOM ผ่าน LINE ใช่หรือไม่?")) updateBomApprovalSetting(!approvalSettings.requireApproval); }}>
        {approvalSettings.requireApproval ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}
        <span><strong>{approvalSettings.requireApproval ? "ต้องขออนุมัติก่อนใช้งาน" : "ไม่บังคับขออนุมัติ"}</strong><small>การตั้งค่านี้ใช้กับสูตรการผลิต BOM</small></span>
      </button>
    </div>
    <div className="settings-filter-row">
      <input aria-label="ค้นหาผู้อนุมัติ" value={searchTerm} onChange={(event) => {setSearchTerm(event.target.value);setListPage(1);}} placeholder="ค้นหาชื่อผู้ใช้ แผนก หรือบทบาท..." />
      <select aria-label="แผนกผู้อนุมัติ" value={departmentFilter} onChange={(event) => {setDepartmentFilter(event.target.value);setListPage(1);}}><option value="">ทุกแผนก</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select>
      <select aria-label="สถานะการเชื่อมต่อ LINE" value={statusFilter} onChange={(event) => {setStatusFilter(event.target.value);setListPage(1);}}><option value="">ทุกสถานะ LINE</option><option value="linked">เชื่อมต่อแล้ว</option><option value="unlinked">ยังไม่เชื่อมต่อ</option></select>
      <button type="button" className="settings-primary" disabled={isLoading || busy} onClick={loadUsers}><RefreshCw size={14} />รีเฟรช</button>
    </div>
    {loadError && <p role="alert" className="text-rose-600">{loadError}</p>}
    {statusMessage && <p role="status" className={statusTone === "error" ? "text-rose-600" : "text-emerald-700"}>{statusMessage}</p>}
    <SettingsTable label="ผู้มีสิทธิ์อนุมัติ LINE">
      <thead><tr><th className="settings-sequence">ลำดับ</th><th>ชื่อผู้ใช้งาน</th><th>แผนก</th><th>บทบาท</th><th>รหัสอนุมัติ</th><th>การเชื่อมต่อ LINE</th><th>สถานะโค้ด</th><th className="settings-action-column">จัดการ</th></tr></thead>
      <tbody>{isLoading ? <tr><td colSpan={8}>กำลังโหลด...</td></tr> : !pagedUsers.length ? <tr><td colSpan={8}>ไม่พบรายการ</td></tr> : pagedUsers.map((user,index) => <tr key={user.id}>
        <td>{(safePage - 1) * 15 + index + 1}</td><td>{user.username}</td><td>{user.department?.name || "—"}</td><td>{user.role?.name || "—"}</td>
        <td>{user.approver_code ? user.approver_code.slice(0,2) + "••••" : "—"}</td>
        <td><span className={user.line_user_id ? "settings-line-linked" : "settings-line-unlinked"}><MessageCircle size={14} />{user.line_user_id ? "เชื่อมต่อแล้ว" : "ยังไม่เชื่อมต่อ"}</span></td>
        <td><span className={"settings-status " + (user.approver_code && user.approver_code_active !== false ? "settings-status-active" : "settings-status-inactive")}>{user.approver_code ? user.approver_code_active !== false ? "ใช้งาน" : "ปิดใช้งาน" : "ยังไม่มีโค้ด"}</span></td>
        <td><button type="button" className="settings-row-action" disabled={busy} onClick={() => setEditingId(user.id)}>แก้ไข</button></td>
      </tr>)}</tbody>
    </SettingsTable>
    <WeightScalePaginationBar page={safePage} totalPages={totalPages} totalCount={filteredUsers.length} limit={15} onPageChange={setListPage} isLoading={isLoading} />
    {editingUser && <SettingsDialog compact label="แก้ไขรหัสอนุมัติ LINE" busy={busy} onClose={() => setEditingId("")}>
      <div className="settings-edit-form"><div className="settings-modal-title"><h2>รหัสอนุมัติ LINE · {editingUser.username}</h2><button type="button" aria-label="ปิด" disabled={busy} onClick={() => setEditingId("")}><X size={18}/></button></div>
        <label htmlFor="line-approver-code">รหัสอนุมัติ</label><input id="line-approver-code" value={codeDrafts[editingUser.id] || ""} disabled={busy} onChange={(event) => handleCodeChange(editingUser.id,event.target.value)} />
        {statusMessage && <p role="status" className={statusTone === "error" ? "text-rose-600" : "text-emerald-700"}>{statusMessage}</p>}
        <div className="settings-modal-actions"><button type="button" className="settings-primary" disabled={busy} onClick={() => handleSaveCode(editingUser.id)}>บันทึกรหัส</button><button type="button" disabled={busy || !editingUser.approver_code} onClick={() => handleCopy(editingUser.approver_code)}><Copy size={14}/>คัดลอกรหัส</button></div>
        <div className="settings-modal-actions"><button type="button" disabled={busy || !editingUser.approver_code} onClick={() => updateLink(editingUser.id,"toggle-approver-code",{approver_code_active: editingUser.approver_code_active === false})}>{editingUser.approver_code_active === false ? "เปิดใช้งานโค้ด" : "ปิดใช้งานโค้ด"}</button>
        <button type="button" className="text-rose-600" disabled={busy || !editingUser.approver_code} onClick={() => {if(window.confirm("ลบรหัสอนุมัติของ " + editingUser.username + " ใช่หรือไม่?")) updateLink(editingUser.id,"clear-approver-code");}}>ลบรหัสอนุมัติ</button></div>
        <button type="button" disabled={busy} onClick={() => setEditingId("")}>ปิด</button>
      </div>
    </SettingsDialog>}
  </div>;
}
