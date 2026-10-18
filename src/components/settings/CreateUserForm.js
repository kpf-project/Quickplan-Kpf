"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, Building2, KeyRound, Plus, User } from "lucide-react";

export default function CreateUserForm({
  roles,
  departments,
  onAddDepartment,
  onCreateUser,
  isLoading,
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [roleId, setRoleId] = useState(roles[0]?.id ?? "");
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? "");
  const [newDepartment, setNewDepartment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAddingDepartment, setIsAddingDepartment] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (!roleId && roles.length) {
      setRoleId(roles[0].id);
    }
  }, [roleId, roles]);

  useEffect(() => {
    if (!departmentId && departments.length) {
      setDepartmentId(departments[0].id);
    }
  }, [departmentId, departments]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!roleId) {
      setErrorMessage("กรุณาเลือกบทบาทก่อนบันทึก");
      return;
    }
    setIsSubmitting(true);
    setStatusMessage("");
    setErrorMessage("");
    try {
      await onCreateUser({
        username: username.trim(),
        password,
        roleId,
        departmentId,
      });
      setStatusMessage("สร้างผู้ใช้งานเรียบร้อยแล้ว");
      setUsername("");
      setPassword("");
    } catch (error) {
      setErrorMessage(error?.message ?? "ไม่สามารถสร้างผู้ใช้งานได้");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddDepartment = async () => {
    const trimmed = newDepartment.trim();
    if (!trimmed) return;
    setIsAddingDepartment(true);
    setStatusMessage("");
    setErrorMessage("");
    let createdId = "";
    try {
      createdId = await onAddDepartment(trimmed);
      if (!createdId) {
        throw new Error("ไม่สามารถเพิ่มแผนกได้");
      }
      setStatusMessage("เพิ่มแผนกเรียบร้อยแล้ว");
    } catch (error) {
      setErrorMessage(error?.message ?? "ไม่สามารถเพิ่มแผนกได้");
    } finally {
      setIsAddingDepartment(false);
    }
    if (createdId) {
      setDepartmentId(createdId);
    }
    setNewDepartment("");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="settings-create-grid">
        <section className="settings-create-section">
          <h2>ข้อมูลเข้าสู่ระบบ</h2><p>กำหนดชื่อผู้ใช้และรหัสผ่านสำหรับการใช้งาน</p>
        {/* Username */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-black uppercase tracking-wider text-slate-600">
            ชื่อผู้ใช้งาน (Username)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <User size={15} />
            </span>
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              disabled={isLoading || isSubmitting}
              minLength={8}
              required
              placeholder="เช่น nextbeaver"
              className="w-full h-10 pl-9 pr-3 border border-slate-200 bg-white text-xs font-semibold focus:outline-none rounded-[2px]"
            />
          </div>
          <p className="text-[10px] text-slate-400 italic">ขั้นต่ำ 8 ตัวอักษร</p>
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-black uppercase tracking-wider text-slate-600">
            รหัสผ่าน (Password)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <KeyRound size={15} />
            </span>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={isLoading || isSubmitting}
              minLength={8}
              required
              placeholder="รหัสผ่านขั้นต่ำ 8 ตัวอักษร"
              className="w-full h-10 pl-9 pr-3 border border-slate-200 bg-white text-xs font-semibold focus:outline-none rounded-[2px]"
            />
          </div>
          <p className="text-[10px] text-slate-400 italic">ควรมีตัวเลขและอักขระพิเศษเพื่อความปลอดภัย</p>
        </div>

        </section>
        <section className="settings-create-section">
          <h2>บทบาทและแผนก</h2><p>กำหนดบทบาทและแผนกของผู้ใช้งาน</p>
        {/* Role Select */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-black uppercase tracking-wider text-slate-600">
            บทบาท (Role)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <BadgeCheck size={15} />
            </span>
            <select
              value={roleId}
              onChange={(event) => setRoleId(event.target.value)}
              disabled={isLoading || isSubmitting || roles.length === 0}
              className="w-full h-10 pl-9 pr-3 border border-slate-200 bg-white text-xs font-semibold focus:outline-none rounded-[2px]"
            >
              {roles.length === 0 ? (
                <option value="">ไม่พบบทบาทในระบบ</option>
              ) : (
                roles.map((role) => (
                  <option key={role.id} value={role.id}>{role.name}</option>
                ))
              )}
            </select>
          </div>
        </div>

        {/* Department Select */}
        <div className="space-y-1.5">
          <label className="text-[11px] font-black uppercase tracking-wider text-slate-600">
            แผนก (Department)
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
              <Building2 size={15} />
            </span>
            <select
              value={departmentId}
              onChange={(event) => setDepartmentId(event.target.value)}
              disabled={isLoading || isSubmitting || departments.length === 0}
              className="w-full h-10 pl-9 pr-3 border border-slate-200 bg-white text-xs font-semibold focus:outline-none rounded-[2px]"
            >
              {departments.length === 0 ? (
                <option value="">ไม่พบแผนกในระบบ</option>
              ) : (
                departments.map((department) => (
                  <option key={department.id} value={department.id}>{department.name}</option>
                ))
              )}
            </select>
          </div>
        </div>
        </section>
        <section className="settings-create-section">
          <h2>ตรวจสอบข้อมูล</h2><p>กรุณาตรวจสอบข้อมูลก่อนสร้างผู้ใช้</p>
          <dl className="settings-create-summary">
            <dt>ชื่อผู้ใช้งาน</dt><dd>{username.trim() || "—"}</dd>
            <dt>บทบาท</dt><dd>{roles.find((role) => role.id === roleId)?.name || "—"}</dd>
            <dt>แผนก</dt><dd>{departments.find((department) => department.id === departmentId)?.name || "—"}</dd>
          </dl>
        </section>
      </div>

      {/* Add Department Inline Section */}
      <details className="border border-slate-200 bg-slate-50/50 p-4 rounded-[2px]">
        <summary className="cursor-pointer text-sm font-semibold">เพิ่มแผนก (ถ้ามี)</summary>
        <label className="block text-[11px] font-black uppercase tracking-wider text-slate-600">
          หากไม่พบแผนก สามารถเพิ่มแผนกใหม่ได้ที่นี่
        </label>
        <div className="mt-2 flex gap-2">
          <input
            value={newDepartment}
            onChange={(event) => setNewDepartment(event.target.value)}
            disabled={isLoading || isAddingDepartment}
            placeholder="ระบุชื่อแผนก เช่น คลังแผ่นฟิล์ม"
            className="flex-1 h-9 px-3 border border-slate-200 bg-white text-xs font-semibold focus:outline-none rounded-[2px]"
          />
          <button
            type="button"
            onClick={handleAddDepartment}
            disabled={isLoading || isAddingDepartment}
            className="h-9 px-4 bg-[var(--surface-navy,#102C57)] text-white text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 transition hover:bg-[#d4af37] hover:text-[#102C57] rounded-[2px] border border-[#102C57] hover:border-[#d4af37]"
          >
            <Plus size={12} />
            {isAddingDepartment ? "กำลังบันทึก" : "เพิ่มแผนก"}
          </button>
        </div>
      </details>

      {/* Form Submission Footer */}
      <div className="border-t border-[#e2e8f0] pt-6 mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="min-w-0">
          <h4 className="text-xs font-black text-[#102C57] uppercase tracking-wider">ยืนยันข้อมูลผู้ใช้งาน</h4>
          <p className="text-[11px] text-slate-500 mt-0.5">กรุณาตรวจสอบชื่อผู้ใช้งานและบทบาทหน้าที่ก่อนกดสร้างบัญชี</p>
          {statusMessage && (
            <p className="text-[11px] text-emerald-600 font-bold mt-1.5">{statusMessage}</p>
          )}
          {errorMessage && (
            <p className="text-[11px] text-rose-600 font-bold mt-1.5">{errorMessage}</p>
          )}
        </div>
        <button
          type="submit"
          disabled={isLoading || isSubmitting}
          className="w-full sm:w-auto h-11 px-8 bg-[#d4af37] hover:bg-[var(--surface-navy,#102C57)] text-[#102C57] hover:text-white text-xs font-black uppercase tracking-widest transition-all duration-150 rounded-[2px] border border-[#d4af37] hover:border-[#102C57] shrink-0"
        >
          {isSubmitting ? "กำลังบันทึก" : "สร้างผู้ใช้งาน"}
        </button>
      </div>
    </form>
  );
}
