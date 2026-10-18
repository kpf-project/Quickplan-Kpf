"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, RefreshCw, Search } from "lucide-react";
import SettingsTable from "@/components/settings/SettingsTable";
import { adminFetch } from "@/lib/adminClient";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

const ACTION_LABELS = {
  "auth.login": "เข้าสู่ระบบ",
  "auth.logout": "ออกจากระบบ",
  "bom.create": "สร้างสูตรการผลิต",
  "bom.update": "แก้ไขสูตรการผลิต",
  "bom.version.create": "เพิ่มเวอร์ชันสูตร",
  "bom.version.update": "แก้ไขเวอร์ชันสูตร",
  "bom.item.create": "เพิ่มวัตถุดิบในสูตร",
  "bom.item.update": "แก้ไขวัตถุดิบในสูตร",
  "bom.item.delete": "ลบวัตถุดิบในสูตร",
  "bom.approval.request": "ส่งคำขออนุมัติสูตร",
  "bom.approval.approve": "อนุมัติสูตร",
  "bom.approval.reject": "ปฏิเสธสูตร",
  "production-plan.create": "สร้างแผนการผลิต",
  "production-plan.update": "แก้ไขแผนการผลิต",
  "production-plan.delete": "ลบแผนการผลิต",
  "production-category.create": "เพิ่มประเภทสินค้า",
  "production-category.update": "แก้ไขประเภทสินค้า",
  "production-category.delete": "ลบประเภทสินค้า",
  "production-category-product.create": "เพิ่มสินค้าเข้าประเภท",
  "production-category-product.delete": "ลบสินค้าออกจากประเภท",
  "role.create": "สร้างบทบาท",
  "role.update": "แก้ไขบทบาท",
  "role.delete": "ลบบทบาท",
  "user.create": "สร้างผู้ใช้งาน",
  "user.update": "แก้ไขผู้ใช้งาน",
  "user.activate": "เปิดใช้งานผู้ใช้",
  "user.deactivate": "ปิดใช้งานผู้ใช้",
  "user.force_logout_all": "บังคับออกจากทุกอุปกรณ์",
  "user.archive": "Archive ผู้ใช้งาน",
  "user.hard_delete": "ลบถาวรผู้ใช้งาน",
  "permission.create": "สร้างสิทธิ์ใหม่",
  "approver.update": "อัปเดตรหัสอนุมัติ",
};

function formatAction(action) {
  if (!action) return "-";
  return ACTION_LABELS[action] || action.replace(/\./g, " • ");
}

function formatTarget(log) {
  if (!log?.target_table) return "-";
  const id = log.target_id ? `#${String(log.target_id).slice(0, 8)}` : "";
  const table = log.target_table.replace(/_/g, " ");
  return `${table}${id ? ` ${id}` : ""}`;
}

function formatUserAgent(value) {
  if (!value || typeof value !== "string") return "";
  const ua = value.toLowerCase();
  const os = ua.includes("windows")
    ? "Windows"
    : ua.includes("mac os") || ua.includes("macintosh")
      ? "macOS"
      : ua.includes("android")
        ? "Android"
        : ua.includes("iphone") || ua.includes("ipad")
          ? "iOS"
          : "";
  const browser = ua.includes("edg/")
    ? "Edge"
    : ua.includes("chrome/")
      ? "Chrome"
      : ua.includes("safari/") && !ua.includes("chrome/")
        ? "Safari"
        : ua.includes("firefox/")
          ? "Firefox"
          : "";
  const parts = [os, browser].filter(Boolean);
  return parts.length ? parts.join(" • ") : "";
}

function buildSummary(log) {
  const meta = log?.metadata || {};
  const parts = [];

  if (meta.sku_code) parts.push(`SKU: ${meta.sku_code}`);
  if (meta.sku_name) parts.push(meta.sku_name);
  if (meta.version_no) parts.push(`เวอร์ชัน ${meta.version_no}`);
  if (meta.code) parts.push(`รหัส: ${meta.code}`);
  if (meta.name) parts.push(meta.name);
  if (meta.plan_group_id) parts.push(`กลุ่มแผน: ${meta.plan_group_id}`);
  if (meta.period_start && meta.period_end) {
    parts.push(`ช่วง ${meta.period_start}–${meta.period_end}`);
  }
  if (meta.record_count) parts.push(`จำนวน ${meta.record_count} รายการ`);
  if (meta.ip) parts.push(`IP ${meta.ip}`);
  const device = formatUserAgent(meta.user_agent);
  if (device) parts.push(device);

  return parts.length ? parts.join(" • ") : "-";
}

function buildDetailChips(log) {
  const meta = log?.metadata || {};
  const chips = [];
  if (meta.ip) chips.push({ label: "IP", value: meta.ip });
  if (meta.status_to) chips.push({ label: "สถานะ", value: meta.status_to });
  if (meta.status_from) chips.push({ label: "เดิม", value: meta.status_from });
  if (meta.items_count) chips.push({ label: "รายการ", value: String(meta.items_count) });
  if (meta.changes_count) chips.push({ label: "การเปลี่ยนแปลง", value: String(meta.changes_count) });
  if (meta.revoked_sessions) chips.push({ label: "เซสชันที่ยกเลิก", value: String(meta.revoked_sessions) });
  if (meta.approver_code) chips.push({ label: "รหัสอนุมัติ", value: meta.approver_code });
  if (meta.reason) chips.push({ label: "เหตุผล", value: meta.reason });
  const device = formatUserAgent(meta.user_agent);
  if (device) chips.push({ label: "อุปกรณ์", value: device });
  return chips;
}

export default function AuditLogPanel() {
  const initializedRef = useRef(false);
  const [logs, setLogs] = useState([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [pagination, setPagination] = useState({ page: 1, pageSize: 50, total: 0, totalPages: 1 });
  const [cursorInfo, setCursorInfo] = useState({ next: null, hasMore: false });
  const [cursorMap, setCursorMap] = useState({ 1: null });
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [expandedId, setExpandedId] = useState(null);

  const fetchLogs = useCallback(async (nextPage = page, nextSearch = search, nextType = typeFilter, options = {}) => {
    const cursorOverride = Object.prototype.hasOwnProperty.call(options, "cursor")
      ? options.cursor
      : undefined;
    const resetCursors = Boolean(options.resetCursors);
    const cursorValue = cursorOverride !== undefined ? cursorOverride : cursorMap[nextPage];
    setIsLoading(true);
    setLoadError("");
    try {
      const params = new URLSearchParams({
        page: nextPage.toString(),
        pageSize: pageSize.toString(),
      });
      if (cursorValue) {
        params.append("cursor", cursorValue);
      }
      if (nextSearch.trim()) {
        params.append("search", nextSearch.trim());
      }
      if (nextType && nextType !== "all") {
        params.append("type", nextType);
      }
      const payload = await adminFetch(`/api/admin/audit-logs?${params.toString()}`);
      setLogs(payload.logs ?? []);
      setPagination(payload?.pagination ?? { page: nextPage, pageSize, total: 0, totalPages: 1 });
      const nextCursor = payload?.cursor?.next ?? null;
      setCursorInfo(payload?.cursor ?? { next: null, hasMore: false });
      setCursorMap((prev) => {
        const base = resetCursors ? { 1: null } : { ...prev };
        base[nextPage] = cursorValue ?? null;
        base[nextPage + 1] = nextCursor;
        return base;
      });
      setPage(nextPage);
    } catch (error) {
      setLoadError(error?.message ?? "Failed to load logs");
    } finally {
      setIsLoading(false);
    }
  }, [cursorMap, page, pageSize, search, typeFilter]);

  useEffect(() => {
    if (initializedRef.current) {
      return;
    }
    initializedRef.current = true;
    fetchLogs(1, "", "all", { cursor: null, resetCursors: true });
  }, [fetchLogs]);

  const visibleLogs = useMemo(() => logs, [logs]);
  const canGoNext = cursorInfo.hasMore && Boolean(cursorMap[page + 1]);
  const canGoPrev = page > 1;

  const handleApplySearch = () => {
    fetchLogs(1, search, typeFilter, { cursor: null, resetCursors: true });
  };

  return <div className="settings-catalog">
    <div className="settings-filter-row">
      <select aria-label="ประเภทกิจกรรม" value={typeFilter} onChange={(event) => {const next = event.target.value;setTypeFilter(next);fetchLogs(1,search,next,{cursor:null,resetCursors:true});}}>
        <option value="all">ทุกกิจกรรม</option><option value="auth">เข้า–ออกระบบ</option><option value="user">จัดการผู้ใช้</option><option value="bom">สูตรการผลิต</option><option value="approval">อนุมัติสูตร</option><option value="production">แผนการผลิต</option><option value="category">ประเภทสินค้า</option><option value="role">บทบาท</option><option value="permission">สิทธิ์</option><option value="approver">รหัสอนุมัติ</option>
      </select>
      <div className="settings-search"><Search size={15}/><input aria-label="ค้นหาประวัติ" value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => {if(event.key === "Enter") handleApplySearch();}} placeholder="ค้นหาชื่อผู้ใช้ หรือรายละเอียด..." /></div>
      <button type="button" disabled={isLoading} onClick={handleApplySearch}>ค้นหา</button>
      <button type="button" className="settings-primary" disabled={isLoading} onClick={() => fetchLogs(page,search,typeFilter)}><RefreshCw size={14}/>รีเฟรช</button>
    </div>
    {loadError && <p role="alert" className="text-rose-600">{loadError}</p>}
    <SettingsTable label="ประวัติการใช้งาน">
      <thead><tr><th className="settings-sequence">ลำดับ</th><th>เวลา</th><th>ผู้ดำเนินการ</th><th>กิจกรรม</th><th>รายการที่เปลี่ยนแปลง</th><th className="settings-audit-summary">รายละเอียด</th></tr></thead>
      <tbody>{isLoading ? <tr><td colSpan={6}>กำลังโหลดประวัติ...</td></tr> : !visibleLogs.length ? <tr><td colSpan={6}>ไม่พบรายการ</td></tr> : visibleLogs.map((log,index) => <Fragment key={log.id}>
        <tr className={expandedId === log.id ? "settings-selected-row" : ""}>
          <td><button type="button" aria-label="รายละเอียดรายการที่ " aria-expanded={expandedId === log.id} onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}>{expandedId === log.id ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}<span>{(page - 1) * pageSize + index + 1}</span></button></td>
          <td>{formatDate(log.created_at)}</td><td>{log.actor_username || "—"}</td><td>{formatAction(log.action)}</td><td>{formatTarget(log)}</td><td>{buildSummary(log)}</td>
        </tr>
        {expandedId === log.id && <tr className="settings-audit-detail"><td colSpan={6}>
          <div className="settings-audit-detail-grid">
            <section><h3>ข้อมูลก่อนเปลี่ยน</h3>{log.metadata?.before || log.metadata?.status_from ? <pre>{JSON.stringify(log.metadata.before || {status:log.metadata.status_from},null,2)}</pre> : <p>รายการนี้ไม่มีข้อมูลก่อนเปลี่ยน</p>}</section>
            <section><h3>ข้อมูลหลังเปลี่ยน</h3>{log.metadata?.after || log.metadata?.status_to ? <pre>{JSON.stringify(log.metadata.after || {status:log.metadata.status_to},null,2)}</pre> : <p>รายการนี้ไม่มีข้อมูลหลังเปลี่ยน</p>}</section>
          </div>
          <div className="settings-audit-chips">{buildDetailChips(log).map((chip) => <span key={chip.label}>{chip.label}: {chip.value}</span>)}</div>
          <details><summary>ข้อมูลการบันทึกทั้งหมด</summary><pre>{JSON.stringify(log.metadata || {},null,2)}</pre></details>
        </td></tr>}
      </Fragment>)}</tbody>
    </SettingsTable>
    <div className="settings-list-footer"><span>หน้า {page} · ทั้งหมด {pagination.total.toLocaleString()} รายการ</span><button type="button" disabled={!canGoPrev || isLoading} onClick={() => fetchLogs(page - 1,search,typeFilter)}>ก่อนหน้า</button><strong>{page}</strong><button type="button" disabled={!canGoNext || isLoading} onClick={() => fetchLogs(page + 1,search,typeFilter)}>ถัดไป</button></div>
  </div>;
}



