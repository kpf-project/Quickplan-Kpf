"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Folder, Info, LockKeyhole, Plus, Search, Users } from "lucide-react";
import { permissionDiff, permissionItems } from "@/lib/permissionMatrix";
import { buildRoleWorkGroups } from "@/lib/roleWorkGroups";
import { TASK_PERMISSIONS } from "@/lib/taskPermissions";
import styles from "./RolePermissionsForm.module.css";
import SettingsDialog from "@/components/settings/SettingsDialog";
import SettingsTable from "@/components/settings/SettingsTable";
import { useUnsavedChanges } from "@/lib/tabState";

export default function RolePermissionsForm({ roles, permissionGroups, onSaveRole, onDeleteRole, isLoading, onDraftChange, taskPermissionsEnabled = false }) {
  const [roleId, setRoleId] = useState("");
  const [roleName, setRoleName] = useState("");
  const [selected, setSelected] = useState([]);
  const [baseline, setBaseline] = useState([]);
  const [baselineName, setBaselineName] = useState("");
  const [search, setSearch] = useState("");
  const [roleSearch, setRoleSearch] = useState("");
  const [collapsed, setCollapsed] = useState(["hr", "data", "settings", "compatibility"]);
  const [review, setReview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const role = roles.find((item) => item.id === roleId);
  const adminRole = role?.role_key === "admin";
  const items = useMemo(() => permissionGroups.flatMap(permissionItems), [permissionGroups]);
  const matrix = useMemo(() => buildRoleWorkGroups(permissionGroups), [permissionGroups]);
  const diff = permissionDiff(baseline, selected);
  const dirty = diff.added.length > 0 || diff.removed.length > 0 || baselineName !== roleName;
  useUnsavedChanges(dirty || busy);
  useEffect(() => {
    onDraftChange?.({ dirty, busy });
    return () => onDraftChange?.({ dirty: false, busy: false });
  }, [dirty, busy, onDraftChange]);
  const locked = isLoading || busy || Boolean(role?.is_system) || adminRole;
  const query = search.trim().toLocaleLowerCase();
  const visibleGroups = matrix.map((group) => ({
    ...group, rows: group.rows.filter((row) => !query || [group.title, row.title, ...row.items.flatMap((item) => [item.label, item.perm_key, item.path])].join(" ").toLocaleLowerCase().includes(query)),
  })).filter((group) => group.rows.length);

  function chooseRole(nextId, force = false) {
    if (busy || (!force && dirty && !window.confirm("มีสิทธิ์ที่ยังไม่บันทึก ต้องการละทิ้งการเปลี่ยนแปลงหรือไม่?"))) return;
    const next = roles.find((item) => item.id === nextId);
    const ids = next?.permissions?.includes("*") ? items.map((item) => item.id) : [...(next?.permissions || [])];
    setRoleId(nextId);
    setRoleName(next?.name || "");
    setBaselineName(next?.name || "");
    setSelected(ids);
    setBaseline(ids);
    setMessage("");
    setReview(false);
  }

  async function save() {
    if (locked || !roleName.trim()) return;
    setBusy(true);
    setMessage("");
    try {
      await onSaveRole({ id: roleId || null, name: roleName.trim(), permissions: selected, expectedPermissions: baseline });
      setBaseline([...selected]);
      setBaselineName(roleName.trim());
      if (!roleId) {
        setRoleName(""); setBaselineName(""); setSelected([]); setBaseline([]);
      }
      setReview(false);
      setMessage("บันทึกสิทธิ์เรียบร้อยแล้ว");
    } catch (error) {
      setMessage(error?.message || "บันทึกไม่สำเร็จ กรุณาลองใหม่");
    } finally { setBusy(false); }
  }

  async function removeRole() {
    if (locked || !role || role.user_count > 0 || !onDeleteRole || !window.confirm('ต้องการลบบทบาท "' + role.name + '" ใช่หรือไม่?')) return;
    setBusy(true);
    try {
      await onDeleteRole(role.id);
      setRoleId(""); setRoleName(""); setBaselineName(""); setSelected([]); setBaseline([]);
      setMessage("ลบบทบาทเรียบร้อยแล้ว");
    } catch (error) { setMessage(error?.message || "ลบบทบาทไม่สำเร็จ"); }
    finally { setBusy(false); }
  }

  return <div className={styles.layout}>
    <aside className={styles.roleList}>
      <h2>รายการบทบาท</h2>
      <div className="settings-search"><Search size={17} /><input aria-label="ค้นหาบทบาท" placeholder="ค้นหาบทบาท..." value={roleSearch} onChange={(event) => setRoleSearch(event.target.value)} /></div>
      <div className={styles.roleScroll} role="region" aria-label="รายการบทบาท" tabIndex={0}>
      {roles.filter((item) => item.name.toLocaleLowerCase().includes(roleSearch.toLocaleLowerCase())).map((item) => (
        <button key={item.id} type="button" disabled={busy} aria-pressed={roleId === item.id} onClick={() => chooseRole(item.id)}>
          {item.is_system ? <LockKeyhole size={21} aria-label="บทบาทระบบ อ่านอย่างเดียว" /> : <Users size={21} />}<span><strong>{item.name}</strong><small>{item.is_system ? "บทบาทระบบ · " : "ผู้ใช้บทบาทนี้ "}{item.user_count || 0} คน</small></span>
        </button>
      ))}
      </div>
      <button className={styles.createRole} type="button" disabled={busy} onClick={() => chooseRole("")}><Plus size={20} />สร้างบทบาทใหม่</button>
    </aside>
    <section className={styles.workspace} aria-label="กำหนดสิทธิ์บทบาท">
      {!taskPermissionsEnabled && <p className="settings-info" role="status">ขณะนี้ยังใช้สิทธิ์เดิม สิทธิ์แยกตามงานจะเปิดให้แก้ไขหลังติดตั้ง SQL และเปิดโหมดใหม่แล้วเท่านั้น</p>}
      <div className={styles.roleHeader}>
        <label>ชื่อบทบาท<input aria-label="ชื่อบทบาท" value={roleName} disabled={locked} placeholder="ระบุชื่อบทบาท" onChange={(event) => setRoleName(event.target.value)} /></label>
        <div className={styles.userCount}><Users size={23} /><span>ผู้ใช้บทบาทนี้<strong>{role?.user_count || 0} คน</strong></span></div>
        <p className={styles.departmentInfo}><Info size={21} />แผนกที่ได้รับมอบหมายกำหนดที่ผู้ใช้งาน แยกจากบทบาท</p>
      </div>
      <div className={`settings-search ${styles.search}`}><Search size={18} /><input aria-label="ค้นหาทุกสิทธิ์" placeholder="ค้นหาส่วนงานหรือสิทธิ์..." value={search} onChange={(event) => setSearch(event.target.value)} /></div>
      {adminRole ? <p className="settings-info">Admin มีสิทธิ์ทั้งหมดโดยอัตโนมัติ · แสดงเพื่ออ้างอิง ไม่สามารถแก้ไขได้</p> : role?.is_system && <p className="settings-info">บทบาทระบบแสดงเพื่ออ้างอิง ไม่สามารถแก้ไขหรือลบได้</p>}
      <SettingsTable label="กำหนดสิทธิ์ตามส่วนงาน">
        <thead><tr><th>ส่วนงาน</th><th>สิทธิ์ที่อนุญาต</th><th>ข้อควรรู้</th></tr></thead>
        <tbody>{visibleGroups.map((group) => {
          const closed = !query && collapsed.includes(group.id);
          return <Fragment key={group.id}>
            <tr className={styles.groupRow}><th colSpan={3}><button type="button" aria-expanded={!closed} onClick={() => setCollapsed((current) => current.includes(group.id) ? current.filter((id) => id !== group.id) : [...current, group.id])}>{group.id === "sensitive" ? <LockKeyhole size={21} /> : <Folder size={21} />}<span>{group.title}{closed && <small> ({group.rows.length} รายการ)</small>}</span>{closed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}</button></th></tr>
            {!closed && group.rows.map((row) => <tr key={row.id}><td>{row.title}</td><td><div className={styles.actions}>{row.items.map((item) => <label key={item.id} title={item.perm_key}><input type="checkbox" aria-label={item.label} disabled={locked || (!taskPermissionsEnabled && Boolean(TASK_PERMISSIONS[item.perm_key]))} checked={adminRole || selected.includes(item.id)} onChange={() => setSelected((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} /><span>{item.label}</span></label>)}</div></td><td className={styles.note}>{row.note}</td></tr>)}
          </Fragment>;
        })}{!visibleGroups.length && <tr><td colSpan={3}>ไม่พบสิทธิ์ที่ตรงกับคำค้น</td></tr>}</tbody>
      </SettingsTable>
      <footer className={`settings-permission-footer ${styles.footer}`}>
        <span>จัดการไม่รวมอนุมัติ · ขอบเขตแผนกกำหนดที่ผู้ใช้งาน</span>
        <strong>{dirty ? "ยังไม่บันทึก" : "ไม่มีการเปลี่ยนแปลง"} · เพิ่ม {diff.added.length} / ถอน {diff.removed.length}</strong>
        <button type="button" disabled={busy} onClick={() => chooseRole(roleId, true)}>ยกเลิก</button>
        <button type="button" className="settings-primary" disabled={locked || !roleName.trim() || !dirty} onClick={() => setReview(true)}>ตรวจสอบก่อนบันทึก</button>
      </footer>
      {role && !role.is_system && !adminRole && <button type="button" className="settings-delete-role" disabled={busy || role.user_count > 0} onClick={removeRole}>ลบบทบาท {role.user_count > 0 ? "(มีผู้ใช้งาน " + role.user_count + " คน)" : ""}</button>}
      {message && <p role="status">{message}</p>}
    </section>
    {review && <SettingsDialog label="ตรวจสอบสิทธิ์ก่อนบันทึก" busy={busy} onClose={() => setReview(false)}>
      <div className="settings-review"><h2>ตรวจสอบสิทธิ์ก่อนบันทึก</h2><p>บทบาท: {roleName} · ผู้ใช้งาน {role?.user_count || 0} คน</p><p className="settings-info">จัดการไม่เท่ากับอนุมัติ ตรวจสอบผู้รับสิทธิ์ก่อนบันทึก</p>
        {[["เพิ่มสิทธิ์", diff.added], ["ถอนสิทธิ์", diff.removed]].map(([title, ids]) => <section key={title}><h3>{title} ({ids.length})</h3>{ids.length ? ids.map((id) => { const item = items.find((entry) => entry.id === id); return <p key={id}>{item?.label || "สิทธิ์เดิมที่ไม่อยู่ในรายการ"}<small>{item?.perm_key || id}</small></p>; }) : <p>ไม่มีรายการ</p>}</section>)}
        <div className="settings-review-actions"><button type="button" disabled={busy} onClick={() => setReview(false)}>กลับไปแก้ไข</button><button type="button" className="settings-primary" disabled={busy} onClick={save}>{busy ? "กำลังบันทึก..." : "ยืนยันบันทึกสิทธิ์"}</button></div>
      </div>
    </SettingsDialog>}
  </div>;
}
