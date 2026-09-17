"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, RefreshCw, ShieldCheck, ToggleLeft, ToggleRight, Users, XCircle } from "lucide-react";
import { adminFetch } from "@/lib/adminClient";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function LineApproverLinksPanel() {
  const [users, setUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
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
    if (!keyword) return users;
    return users.filter((user) => {
      const roleName = user.role?.name ?? "";
      const departmentName = user.department?.name ?? "";
      const code = user.approver_code ?? "";
      return [user.username, roleName, departmentName, code]
        .join(" ")
        .toLowerCase()
        .includes(keyword);
    });
  }, [searchTerm, users]);

  const summary = useMemo(() => {
    const total = filteredUsers.length;
    const linked = filteredUsers.filter((user) => Boolean(user.line_user_id)).length;
    const activeCodes = filteredUsers.filter((user) => user.approver_code && user.approver_code_active !== false).length;
    return { total, linked, activeCodes };
  }, [filteredUsers]);

  const updateLink = async (userId, action, extra = {}) => {
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
    }
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

  return (
    <div className="space-y-8">
      {/* Page Header & Stats Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 pb-4 border-b border-slate-100 select-none">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d4af37]">
            LINE & Approval System
          </span>
          <h2 className="text-[16px] font-black text-[#102C57] mt-0.5">
            กำหนดรหัสการอนุมัติระบบ LINE
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            ตั้งค่าโค้ดอนุมัติสำหรับผู้มีอำนาจเซ็น และเปิด/ปิดโหมดขออนุมัติ BOM
          </p>
        </div>

        {/* Stats Grid */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="border border-slate-200 px-3 py-1 bg-slate-50 text-[10px] font-bold text-slate-700 uppercase tracking-wider rounded-[2px]">
            ทั้งหมด: <span className="text-[#102C57] font-black">{summary.total}</span>
          </div>
          <div className="border border-slate-200 px-3 py-1 bg-slate-50 text-[10px] font-bold text-slate-700 uppercase tracking-wider rounded-[2px]">
            เชื่อม LINE: <span className="text-emerald-700 font-black">{summary.linked}</span>
          </div>
          <div className="border border-slate-200 px-3 py-1 bg-slate-50 text-[10px] font-bold text-slate-700 uppercase tracking-wider rounded-[2px]">
            โค้ดใช้งาน: <span className="text-[#d4af37] font-black">{summary.activeCodes}</span>
          </div>
          <button
            type="button"
            onClick={loadUsers}
            className="h-7 px-3 bg-[#102C57] text-white text-[9px] font-black uppercase tracking-widest flex items-center justify-center gap-1 border border-[#102C57] hover:bg-[#d4af37] hover:text-[#102C57] hover:border-[#d4af37] transition rounded-[2px]"
          >
            <RefreshCw size={10} />
            REFRESH
          </button>
        </div>
      </div>

      {/* BOM Approval Setting Toggle */}
      <div className="border border-slate-200 rounded-[2px] overflow-hidden bg-white">
        <div className="grid gap-0 lg:grid-cols-[1fr_auto]">
          <div className="p-5 select-none">
            <span className="text-[9px] font-black uppercase tracking-[0.25em] text-[#d4af37]">
              BOM Approval Configuration
            </span>
            <h3 className="text-sm font-black text-[#102C57] mt-0.5">การตั้งค่าการอนุมัติสูตรการผลิต (BOM Approval Mode)</h3>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
              เมื่อเปิดใช้งาน: การสร้างหรือแก้ไขสูตรสินค้า (BOM) ทุกรายการ จะต้องส่งคำขออนุมัติไปยังผู้มีอำนาจผ่านทางแอปพลิเคชัน LINE ก่อนที่จะสามารถนำไปใช้งานในกระบวนการผลิตได้จริง
            </p>
          </div>
          <div className="flex flex-col justify-center bg-slate-50/50 p-5 border-t lg:border-t-0 lg:border-l border-slate-200 lg:min-w-[280px]">
            <button
              type="button"
              onClick={() => updateBomApprovalSetting(!approvalSettings.requireApproval)}
              disabled={approvalSettings.isLoading || approvalSettings.isSaving}
              className={`w-full flex items-center justify-between gap-3 p-3 border transition rounded-[2px] disabled:opacity-50 disabled:cursor-not-allowed select-none ${
                approvalSettings.requireApproval
                  ? "border-[#d4af37] bg-[#fdf7e6] text-[#102C57]"
                  : "border-slate-200 bg-white text-slate-500 hover:border-slate-300"
              }`}
            >
              <div className="text-left">
                <span className="block text-xs font-black uppercase tracking-wider">
                  {approvalSettings.requireApproval ? "เปิด: ต้องขออนุมัติ" : "ปิด: อนุมัติทันที"}
                </span>
                <span className="block text-[10px] text-slate-500 mt-0.5">
                  {approvalSettings.requireApproval ? "บังคับตรวจสอบผ่าน LINE" : "บันทึกและพร้อมใช้งานทันที"}
                </span>
              </div>
              {approvalSettings.requireApproval ? (
                <ToggleRight className="h-7 w-7 text-[#d4af37]" />
              ) : (
                <ToggleLeft className="h-7 w-7 text-slate-400" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Catalog Search & Actions Status */}
      <div className="border border-slate-200 rounded-[2px] overflow-hidden bg-white">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 border-b border-slate-200 select-none bg-slate-50/50">
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-[#102C57]">รายชื่อผู้มีสิทธิ์อนุมัติสูตร</h3>
            <p className="text-[11px] text-slate-500 mt-0.5 font-medium">แก้ไขรหัสอนุมัติ (Approver Code) ประจำบุคคล</p>
          </div>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {statusMessage && (
              <span
                className={`text-[11px] font-bold px-3 py-1 rounded-[2px] border ${
                  statusTone === "success"
                    ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                    : "bg-rose-50 text-rose-700 border-rose-100"
                }`}
              >
                {statusMessage}
              </span>
            )}
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="ค้นหาชื่อ, แผนก, หรือรหัสอนุมัติ..."
              className="h-9 w-full sm:w-64 border border-slate-200 bg-white px-3 text-xs font-semibold focus:outline-none rounded-[2px]"
            />
          </div>
        </div>

        {loadError && (
          <div className="px-5 py-3 text-xs font-bold text-rose-600 border-b border-rose-100 bg-rose-50">
            {loadError}
          </div>
        )}

        {/* Desktop View Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase font-black tracking-widest text-[9px] select-none">
                <th className="px-5 py-3.5">ผู้ใช้งาน (User Details)</th>
                <th className="px-5 py-3.5">รหัสอนุมัติ (Approver Code)</th>
                <th className="px-5 py-3.5 text-center">สถานะโค้ด</th>
                <th className="px-5 py-3.5 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-slate-400 italic">
                    กำลังดึงข้อมูลรายชื่อผู้อนุมัติจากระบบ...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-8 text-center text-slate-400 italic">
                    ไม่พบบัญชีผู้อนุมัติที่ตรงตามตัวกรอง
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const isActive = user.approver_code_active !== false;
                  const draft = codeDrafts[user.id] ?? "";
                  return (
                    <tr key={user.id} className="hover:bg-slate-50/50 transition">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 flex items-center justify-center bg-[#102C57] text-[#d4af37] text-[10px] font-black rounded-[2px]">
                            {user.username?.slice(0, 2)?.toUpperCase() || "AP"}
                          </div>
                          <div>
                            <span className="block font-bold text-[#102C57]">{user.username}</span>
                            <span className="block text-[10px] text-slate-400 font-medium mt-0.5">
                              {user.department?.name ?? "-"} • {user.role?.name ?? "-"}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <input
                            value={draft}
                            onChange={(event) => handleCodeChange(user.id, event.target.value)}
                            placeholder="APPROVER-CODE"
                            className="h-8 w-36 border border-slate-200 bg-white px-2.5 text-xs font-mono font-bold tracking-wider text-slate-800 focus:outline-none rounded-[2px]"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveCode(user.id)}
                            className="h-8 px-3 bg-[#102C57] hover:bg-[#d4af37] text-white hover:text-[#102C57] text-[10px] font-black uppercase tracking-widest border border-[#102C57] hover:border-[#d4af37] transition rounded-[2px]"
                          >
                            SAVE
                          </button>
                          {user.approver_code ? (
                            <button
                              type="button"
                              onClick={() => handleCopy(user.approver_code)}
                              className="h-8 px-2 border border-slate-200 hover:border-slate-300 text-slate-600 text-[9px] font-black uppercase tracking-widest transition rounded-[2px] flex items-center gap-1 bg-slate-50"
                            >
                              <Copy size={11} />
                              COPY
                            </button>
                          ) : null}
                        </div>
                      </td>

                      <td className="px-5 py-3.5 text-center">
                        <div className="inline-flex flex-col items-center gap-1.5 select-none">
                          <button
                            type="button"
                            onClick={() => updateLink(user.id, "toggle-approver-code", { approver_code_active: !isActive })}
                            className={`inline-flex items-center gap-1 border px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest rounded-[2px] transition ${
                              isActive
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                                : "bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200"
                            }`}
                          >
                            {isActive ? <ToggleRight size={12} /> : <ToggleLeft size={12} />}
                            {isActive ? "ACTIVE" : "DISABLED"}
                          </button>
                        </div>
                      </td>

                      <td className="px-5 py-3.5 text-right">
                        <button
                          type="button"
                          onClick={() => updateLink(user.id, "clear-approver-code")}
                          disabled={!user.approver_code}
                          className="text-rose-700 hover:text-rose-900 text-[10px] font-black uppercase tracking-widest border border-rose-100 px-3 py-1.5 rounded-[2px] bg-rose-50/50 hover:bg-rose-50 transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          DELETE CODE
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
