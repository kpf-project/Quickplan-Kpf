"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import { adminFetch } from "@/lib/adminClient";

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("th-TH", {
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

  return (
    <div className="space-y-8">
      {/* Search and Filters Header Panel */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100 select-none">
        <div>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d4af37]">
            Security Audit Trail
          </span>
          <h2 className="text-[16px] font-black text-[#102C57] mt-0.5">
            บันทึกการใช้งานระบบ (Audit Logs)
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            ประวัติการปฏิบัติการและการเปลี่ยนแปลงการกำหนดค่าทั้งหมด
          </p>
        </div>

        {/* Filter Inputs Grid */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* Keyword Search */}
          <div className="relative">
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหาข้อความหรือชื่อผู้ใช้..."
              className="h-9 w-full sm:w-56 border border-slate-200 bg-white px-3 text-xs font-semibold focus:outline-none rounded-[2px]"
            />
          </div>
          
          <button
            type="button"
            onClick={handleApplySearch}
            className="h-9 px-4 bg-[#102C57] hover:bg-[#d4af37] text-white hover:text-[#102C57] text-[10px] font-black uppercase tracking-widest border border-[#102C57] hover:border-[#d4af37] transition rounded-[2px]"
          >
            SEARCH
          </button>

          {/* Type Selector */}
          <select
            value={typeFilter}
            onChange={(event) => {
              const nextType = event.target.value;
              setTypeFilter(nextType);
              fetchLogs(1, search, nextType, { cursor: null, resetCursors: true });
            }}
            className="h-9 w-40 border border-slate-200 bg-white px-2.5 text-xs font-semibold focus:outline-none rounded-[2px]"
          >
            <option value="all">ทุกแผนก/กิจกรรม</option>
            <option value="auth">การลงทะเบียน/เข้าใช้</option>
            <option value="user">จัดการผู้ใช้ระบบ</option>
            <option value="bom">โครงสูตรการผลิต (BOM)</option>
            <option value="approval">การอนุมัติสูตร BOM</option>
            <option value="production">แผนกระบวนการผลิต</option>
            <option value="category">หมวดประเภทสินค้า</option>
            <option value="role">บทบาทหน้าที่ผู้เข้าใช้</option>
            <option value="permission">สิทธิ์การเข้าถึงเมนู</option>
            <option value="approver">รหัสยืนยันตัวตนผู้อนุมัติ</option>
          </select>

          <button
            type="button"
            onClick={() => fetchLogs(page, search, typeFilter)}
            className="h-9 px-3 border border-slate-200 hover:border-slate-300 text-slate-600 text-[10px] font-black uppercase tracking-widest transition rounded-[2px] flex items-center justify-center gap-1.5 bg-slate-50"
          >
            <RefreshCw size={11} />
            REFRESH
          </button>
        </div>
      </div>

      {loadError && (
        <div className="p-3 text-xs font-bold text-rose-600 border border-rose-100 bg-rose-50 rounded-[2px]">
          {loadError}
        </div>
      )}

      {/* Main Logs Table Block */}
      <div className="border border-slate-200 rounded-[2px] overflow-hidden bg-white">
        {/* Mobile View List */}
        <div className="md:hidden space-y-4 p-4">
          {isLoading ? (
            <div className="border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-xs text-slate-500 rounded-[2px]">
              กำลังดึงข้อมูลบันทึกความปลอดภัย...
            </div>
          ) : visibleLogs.length === 0 ? (
            <div className="border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-xs text-slate-500 rounded-[2px]">
              ไม่พบรายการการปฏิบัติการที่เข้าเกณฑ์
            </div>
          ) : (
            visibleLogs.map((log) => (
              <div key={log.id} className="border border-slate-200 p-4 rounded-[2px] space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="block font-bold text-[#102C57] text-xs">{log.actor_username || "-"}</span>
                    <span className="block text-[10px] text-slate-400 font-medium mt-0.5">{formatDate(log.created_at)}</span>
                  </div>
                  <span className="inline-flex items-center rounded-[2px] border border-[#102C57]/20 bg-[#fdf7e6] px-2 py-0.5 text-[9px] font-black text-[#102C57] uppercase tracking-wider">
                    {formatAction(log.action)}
                  </span>
                </div>
                <div className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-[2px] font-medium border border-slate-100">
                  <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">รายละเอียด</span>
                  {buildSummary(log)}
                </div>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {buildDetailChips(log).map((chip) => (
                    <span key={`${chip.label}-${chip.value}`} className="border border-slate-200 bg-white px-2 py-0.5 text-[9px] font-bold text-slate-600 rounded-[2px]">
                      {chip.label}: {chip.value}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Desktop View Table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-xs text-left border-collapse table-fixed">
            <colgroup>
              <col className="w-[18%]" />
              <col className="w-[15%]" />
              <col className="w-[20%]" />
              <col className="w-[47%]" />
            </colgroup>
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200 uppercase font-black tracking-widest text-[9px] select-none">
                <th className="px-5 py-3.5">เวลาปฏิบัติการ (Timestamp)</th>
                <th className="px-5 py-3.5">ผู้รับผิดชอบ</th>
                <th className="px-5 py-3.5">กิจกรรม</th>
                <th className="px-5 py-3.5">รายละเอียดผลการสั่งการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-slate-400 italic font-medium bg-white">
                    กำลังดึงข้อมูลบันทึกความปลอดภัยจากเซิร์ฟเวอร์...
                  </td>
                </tr>
              ) : visibleLogs.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center text-slate-400 italic font-medium bg-white">
                    ยังไม่มีรายงานการปฏิบัติการระบบในส่วนนี้
                  </td>
                </tr>
              ) : (
                visibleLogs.map((log) => {
                  const chips = buildDetailChips(log);
                  return (
                    <tr key={log.id} className="hover:bg-slate-50/30 transition">
                      <td className="px-5 py-4 align-top">
                        <span className="block font-bold text-[#102C57]">{formatDate(log.created_at)}</span>
                        <span className="block text-[9px] text-slate-400 font-mono tracking-tighter mt-1">ID: #{String(log.id || "").slice(0, 8)}</span>
                      </td>
                      <td className="px-5 py-4 align-top font-bold text-slate-800">
                        <span className="block">{log.actor_username || "-"}</span>
                        <span className="block text-[9px] text-slate-400 font-medium tracking-wide uppercase mt-1">{formatTarget(log)}</span>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <span className="inline-flex items-center rounded-[2px] border border-[#102C57]/20 bg-[#fdf7e6] px-2.5 py-0.5 text-[10px] font-black text-[#102C57] uppercase tracking-wider">
                          {formatAction(log.action)}
                        </span>
                      </td>
                      <td className="px-5 py-4 align-top">
                        <p className="text-slate-800 font-semibold leading-relaxed">
                          {buildSummary(log)}
                        </p>
                        
                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          {chips.slice(0, 4).map((chip) => (
                            <span key={`${chip.label}-${chip.value}`} className="border border-slate-200 bg-slate-50/50 px-2 py-0.5 text-[9px] font-bold text-slate-600 rounded-[2px]">
                              {chip.label}: {chip.value}
                            </span>
                          ))}
                          {chips.length > 4 ? (
                            <button
                              type="button"
                              onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                              className="text-[9px] font-black uppercase tracking-widest text-[#102C57] hover:text-[#d4af37] border border-slate-200 px-2 py-0.5 bg-white transition hover:bg-slate-50 rounded-[2px]"
                            >
                              {expandedId === log.id ? "HIDE META" : "SHOW MORE META"}
                            </button>
                          ) : null}
                        </div>

                        {expandedId === log.id ? (
                          <div className="mt-2.5 border border-slate-200 bg-[#fafafb] p-3 text-[10px] space-y-1 rounded-[2px] max-w-lg font-mono">
                            {chips.map((chip) => (
                              <div key={`${chip.label}-${chip.value}`} className="flex justify-between border-b border-slate-100 pb-1 last:border-0 last:pb-0 gap-3">
                                <span className="font-bold text-slate-500 uppercase tracking-wider">{chip.label}</span>
                                <span className="text-slate-800 break-all">{chip.value}</span>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 px-5 py-4 bg-slate-50/50 select-none">
          <button
            type="button"
            onClick={() => fetchLogs(page - 1, search, typeFilter)}
            disabled={!canGoPrev || isLoading}
            className="h-8 px-4 bg-[#102C57] disabled:bg-slate-200 text-white disabled:text-slate-400 text-[10px] font-black uppercase tracking-widest border border-[#102C57] disabled:border-slate-200 transition hover:bg-[#d4af37] hover:text-[#102C57] hover:border-[#d4af37] disabled:hover:bg-slate-200 disabled:hover:text-slate-400 disabled:hover:border-slate-200 rounded-[2px] disabled:cursor-not-allowed select-none"
          >
            PREV
          </button>
          <span className="text-[10px] font-black text-slate-700 uppercase tracking-wider">
            PAGE {pagination.page} / {pagination.totalPages} • TOTAL {pagination.total.toLocaleString()} EVENTS
          </span>
          <button
            type="button"
            onClick={() => fetchLogs(page + 1, search, typeFilter)}
            disabled={!canGoNext || isLoading}
            className="h-8 px-4 bg-[#102C57] disabled:bg-slate-200 text-white disabled:text-slate-400 text-[10px] font-black uppercase tracking-widest border border-[#102C57] disabled:border-slate-200 transition hover:bg-[#d4af37] hover:text-[#102C57] hover:border-[#d4af37] disabled:hover:bg-slate-200 disabled:hover:text-slate-400 disabled:hover:border-slate-200 rounded-[2px] disabled:cursor-not-allowed select-none"
          >
            NEXT
          </button>
        </div>
      </div>
    </div>
  );
}



