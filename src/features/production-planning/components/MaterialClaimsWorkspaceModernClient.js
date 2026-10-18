"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import useSWR from "swr";

const EmbeddedProductionSchedule = dynamic(() => import("./ProductionScheduleClient"), {
  loading: () => null,
});

const fetcher = async (url) => {
  const response = await fetch(url);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || "โหลดข้อมูลไม่สำเร็จ");
  return payload;
};

function formatShortThaiDate(dateStr) {
  if (!dateStr) return "-";
  try {
    const d = new Date(`${dateStr}T00:00:00.000Z`);
    const day = String(d.getUTCDate()).padStart(2, "0");
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const year = String((d.getUTCFullYear() + 543) % 100).padStart(2, "0");
    return `${day}/${month}/${year}`;
  } catch {
    return dateStr;
  }
}

function fmtQty(qty) {
  const n = Number(qty);
  if (!Number.isFinite(n) || n === 0) return null;
  return n % 1 === 0 ? n.toLocaleString("th-TH") : n.toLocaleString("th-TH", { maximumFractionDigits: 3 });
}

function buildRangeLabel(dateFrom, dateTo) {
  const from = formatShortThaiDate(dateFrom);
  const to = formatShortThaiDate(dateTo);
  if (!dateFrom) return "-";
  if (!dateTo || dateFrom === dateTo) return from;
  return `${from} - ${to}`;
}

function buildKeyGroupMap(groups) {
  const map = new Map();
  (groups || []).forEach((group) => {
    (group.items || []).forEach((item) => {
      const key = String(item.source_row_key || "").trim();
      if (key) map.set(key, group);
    });
  });
  return map;
}

function flattenWorkspaceEntries(views = []) {
  const map = new Map();
  views.forEach((view) => {
    (view?.materials || []).forEach((material) => {
      Object.values(material?.byDate || {}).forEach((cell) => {
        (cell?.entries || []).forEach((entry) => {
          const key = String(entry?.sourceRowKey || "").trim();
          if (key && !map.has(key)) map.set(key, entry);
        });
      });
    });
  });
  return map;
}

function GroupStatusBadge({ status }) {
  if (status === "exported") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500"><span className="h-1 w-1 rounded-full bg-slate-400" />Exported</span>;
  }
  if (status === "ready_to_export") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700"><span className="h-1 w-1 rounded-full bg-emerald-500" />พร้อม export</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700"><span className="h-1 w-1 rounded-full bg-amber-400" />Draft</span>;
}

function GroupActions({ group, onMutate }) {
  const [pending, setPending] = useState(false);

  const doAction = async (action) => {
    if (action === "delete" && !confirm("ลบใบเบิกนี้?")) return;
    setPending(true);
    const response = await fetch(`/api/production-planning/requisition/groups/${group.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      alert(payload?.error || "เกิดข้อผิดพลาด");
    }
    setPending(false);
    onMutate();
  };

  const isReady = group.status === "ready_to_export";
  const isExported = group.status === "exported";

  return (
    <div className="flex items-center gap-1">
      {!isReady && !isExported ? <button type="button" onClick={() => doAction("confirm")} disabled={pending} className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">ยืนยัน</button> : null}
      {isReady ? <button type="button" onClick={() => doAction("reopen")} disabled={pending} className="rounded border border-slate-300 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">แก้ไข</button> : null}
      {!isExported ? <button type="button" onClick={() => doAction("delete")} disabled={pending} className="rounded border border-red-200 px-2 py-0.5 text-[10px] font-semibold text-red-500 hover:bg-red-50 disabled:opacity-50">ลบ</button> : null}
    </div>
  );
}

function GroupingDrawer({ drawerState, lookup27Departments, onClose, onSaved }) {
  const [ticked, setTicked] = useState(() => new Set());
  const [groupName, setGroupName] = useState("");
  const [deptCode, setDeptCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const { date, deptId, deptName, ungroupedRows, masterPlanNo, grain } = drawerState;

  useEffect(() => {
    setTicked(new Set());
    setGroupName("");
    setDeptCode("");
    setError("");
  }, [date, deptId]);

  const groupedRows = useMemo(() => {
    const map = new Map();
    (ungroupedRows || []).forEach((row) => {
      const key = [
        String(row?.materialGoodsCode || row?.materialSkuCode || "").trim(),
        String(row?.unit || "").trim(),
      ].join("::");
      if (!map.has(key)) {
        map.set(key, {
          key,
          materialName: row.materialName || row.materialGoodsCode || row.materialSkuCode,
          materialCode: row.materialGoodsCode || row.materialSkuCode,
          unit: row.unit || null,
          issueQty: 0,
          sourceRowKeys: [],
        });
      }
      const bucket = map.get(key);
      bucket.issueQty += Number(row?.issueQty || 0);
      bucket.sourceRowKeys.push(String(row?.sourceRowKey || "").trim());
    });
    return Array.from(map.values()).sort((left, right) => (
      String(left.materialName || "").localeCompare(String(right.materialName || ""), "th")
    ));
  }, [ungroupedRows]);

  const toggleAll = () => {
    const allKeys = groupedRows.flatMap((row) => row.sourceRowKeys);
    if (allKeys.length && allKeys.every((key) => ticked.has(key))) return setTicked(new Set());
    setTicked(new Set(allKeys));
  };

  const toggleRow = (keys) => {
    setTicked((prev) => {
      const next = new Set(prev);
      const normalizedKeys = Array.isArray(keys) ? keys : [keys];
      const allSelected = normalizedKeys.every((key) => next.has(key));
      if (allSelected) normalizedKeys.forEach((key) => next.delete(key));
      else normalizedKeys.forEach((key) => next.add(key));
      return next;
    });
  };

  const handleSave = async () => {
    if (!ticked.size) return setError("กรุณาเลือกรายการอย่างน้อย 1 รายการ");
    setSaving(true);
    setError("");
    try {
      const sourceRowKeys = ungroupedRows.filter((row) => ticked.has(row.sourceRowKey)).map((row) => row.sourceRowKey);
      const response = await fetch("/api/production-planning/requisition/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterPlanNo,
          grain,
          dateFrom: date,
          dateTo: date,
          sourceRowKeys,
          groupName: groupName.trim() || null,
          lookup27DepartmentCode: deptCode || null,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || "สร้างใบเบิกไม่สำเร็จ");
      onSaved();
    } catch (saveError) {
      setError(String(saveError?.message || "สร้างใบเบิกไม่สำเร็จ"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        <div className="flex items-center justify-between bg-[var(--surface-navy,#102C57)] px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/65">สร้างใบเบิก</p>
            <h3 className="mt-0.5 text-sm font-bold text-white">{formatShortThaiDate(date)} - {deptName}</h3>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-1.5 hover:bg-white/10"><svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg></button>
        </div>

        <div className="space-y-2.5 border-b border-slate-100 bg-slate-50 px-5 py-3">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">ชื่อใบเบิก</label>
            <input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="เช่น ใบเบิกวัตถุดิบหลัก" className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-300 focus:border-[#102C57] focus:outline-none focus:ring-1 focus:ring-[#102C57]" />
          </div>
          {lookup27Departments?.length ? (
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">รหัสแผนก ERP</label>
              <select value={deptCode} onChange={(event) => setDeptCode(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#102C57] focus:outline-none focus:ring-1 focus:ring-[#102C57]">
                <option value="">- ไม่ระบุ -</option>
                {lookup27Departments.map((department) => <option key={department.code} value={department.code}>{department.code} - {department.name}</option>)}
              </select>
            </div>
          ) : null}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">รายการที่พร้อมจัดใบเบิก ({groupedRows.length})</span>
            <button type="button" onClick={toggleAll} className="text-[11px] font-semibold text-[#102C57] hover:underline">{groupedRows.length > 0 && groupedRows.every((row) => row.sourceRowKeys.every((key) => ticked.has(key))) ? "ยกเลิกทั้งหมด" : "เลือกทั้งหมด"}</button>
          </div>
          <div className="space-y-1">
            {groupedRows.map((row) => {
              const isChecked = row.sourceRowKeys.every((key) => ticked.has(key));
              return (
                <label key={row.key} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${isChecked ? "border-[#102C57]/30 bg-[var(--surface-navy,#102C57)]/5" : "border-slate-100 bg-white hover:bg-slate-50"}`}>
                  <input type="checkbox" checked={isChecked} onChange={() => toggleRow(row.sourceRowKeys)} className="h-4 w-4 rounded border-slate-300 accent-[#102C57]" />
                  <div className="min-w-0 flex-1">
                    <div className="whitespace-nowrap text-sm font-semibold text-slate-800">{row.materialName}</div>
                    <div className="mt-0.5 whitespace-nowrap text-[10px] font-mono text-slate-400">{row.materialCode}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-bold tabular-nums text-slate-700">{fmtQty(row.issueQty) || "-"}</div>
                    {row.unit ? <div className="text-[10px] text-slate-400">{row.unit}</div> : null}
                  </div>
                </label>
              );
            })}
          </div>
        </div>

        <div className="border-t border-slate-100 bg-slate-50 px-5 py-3">
          {error ? <p className="mb-2 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p> : null}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500">เลือกแล้ว <strong>{groupedRows.filter((row) => row.sourceRowKeys.every((key) => ticked.has(key))).length}</strong> / {groupedRows.length}</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={onClose} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">ยกเลิก</button>
              <button type="button" onClick={handleSave} disabled={saving || ticked.size === 0} className="rounded-lg bg-[var(--surface-navy,#102C57)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--surface-navy,#102C57)]/90 disabled:cursor-not-allowed disabled:opacity-50">{saving ? "กำลังบันทึก..." : "บันทึกใบเบิก"}</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function SummaryBar({ poolRows, dates }) {
  if (!poolRows?.length) return null;
  const total = poolRows.length;
  const claimed = poolRows.filter((row) => row.claimStatus === "claimed").length;
  const pct = total > 0 ? Math.round((claimed / total) * 100) : 0;

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
      <div className="flex min-w-[220px] flex-1 flex-col gap-1">
        <div className="flex items-center justify-between text-[11px]"><span className="font-semibold text-slate-600">ความคืบหน้าการเคลม</span><span className="font-bold text-slate-700">{pct}%</span></div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} /></div>
      </div>
      <div className="hidden h-8 w-px bg-slate-100 sm:block" />
      <div className="flex items-center gap-6 text-[11px]">
        <div className="flex flex-col items-center"><span className="text-lg font-bold leading-tight tabular-nums text-slate-800">{total}</span><span className="text-slate-400">ทั้งหมด</span></div>
        <div className="flex flex-col items-center"><span className="text-lg font-bold leading-tight tabular-nums text-emerald-600">{claimed}</span><span className="text-slate-400">เคลมแล้ว</span></div>
        <div className="flex flex-col items-center"><span className="text-lg font-bold leading-tight tabular-nums text-amber-600">{total - claimed}</span><span className="text-slate-400">รอเคลม</span></div>
        <div className="flex flex-col items-center"><span className="text-lg font-bold leading-tight tabular-nums text-slate-600">{dates.length}</span><span className="text-slate-400">วัน</span></div>
      </div>
    </div>
  );
}

function ExportBar({ groups, masterPlanNo, onMutateGroups }) {
  const [exporting, setExporting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const readyGroups = useMemo(() => (groups || []).filter((group) => group.status === "ready_to_export"), [groups]);
  const exportedGroups = useMemo(() => (groups || []).filter((group) => group.status === "exported"), [groups]);

  if (!groups?.length) return null;

  const handleExport = async () => {
    const ids = readyGroups.map((group) => group.id);
    if (!ids.length) return;
    setExporting(true);
    try {
      const response = await fetch("/api/production-planning/requisition/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupIds: ids, masterPlanNo }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        alert(payload?.error || "Export ไม่สำเร็จ");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `requisition-${masterPlanNo}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="sticky bottom-0 z-30 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-lg">
      {expanded ? (
        <div className="max-h-64 overflow-y-auto border-b border-slate-100">
          {groups.map((group) => (
            <div key={group.id} className="flex items-center justify-between gap-3 border-b border-slate-50 px-5 py-2.5 last:border-0 hover:bg-slate-50">
              <div className="flex min-w-0 items-center gap-2">
                <GroupStatusBadge status={group.status} />
                <span className="whitespace-nowrap text-sm font-semibold text-slate-700">{group.group_name || "ใบเบิก"}</span>
                <span className="shrink-0 text-[10px] text-slate-400">{group.itemCount} รายการ</span>
              </div>
              <GroupActions group={group} onMutate={onMutateGroups} />
            </div>
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="flex items-center gap-4 text-[11px]">
          <button type="button" onClick={() => setExpanded((prev) => !prev)} className="flex items-center gap-1.5 transition-colors hover:text-[#102C57]">
            <svg className={`h-3.5 w-3.5 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
            </svg>
            <div className="flex flex-col items-center">
              <span className="text-lg font-bold leading-tight tabular-nums text-slate-800">{groups.length}</span>
              <span className="text-slate-400">ใบเบิกทั้งหมด</span>
            </div>
          </button>
          <div className="flex flex-col items-center"><span className="text-lg font-bold leading-tight tabular-nums text-amber-600">{(groups || []).filter((group) => group.status === "draft").length}</span><span className="text-slate-400">Draft</span></div>
          <div className="flex flex-col items-center"><span className="text-lg font-bold leading-tight tabular-nums text-emerald-600">{readyGroups.length}</span><span className="text-slate-400">พร้อม export</span></div>
          <div className="flex flex-col items-center"><span className="text-lg font-bold leading-tight tabular-nums text-slate-400">{exportedGroups.length}</span><span className="text-slate-400">Exported แล้ว</span></div>
        </div>

        <button type="button" onClick={handleExport} disabled={exporting || readyGroups.length === 0} className="inline-flex items-center gap-2 rounded-xl bg-[var(--surface-navy,#102C57)] px-5 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-[#1a3d6b] disabled:cursor-not-allowed disabled:opacity-50">
          {exporting ? "กำลัง export..." : `Export Excel (${readyGroups.length} ใบเบิก)`}
        </button>
      </div>
    </div>
  );
}

function ClaimsMatrixTable({
  title,
  subtitle,
  dates,
  materials,
  wipByDate,
  keyGroupMap,
  selectedRowKeys,
  onToggleCellSelection,
  onOpenDrawer,
  showBulkSelect = false,
  onSelectAll = null,
}) {
  const safeDateCount = Math.max(1, dates.length);
  const dateWidth = `${Math.max(8, 60 / safeDateCount)}%`;
  const dayClaimableMap = useMemo(() => {
    const map = new Map();
    dates.forEach((date) => {
      const rows = [];
      materials.forEach((material) => {
        const entries = Array.isArray(material?.byDate?.[date]?.entries) ? material.byDate[date].entries : [];
        entries.forEach((entry) => {
          if (entry.canClaim && entry.claimStatus !== "claimed") rows.push(entry);
        });
      });
      map.set(date, rows);
    });
    return map;
  }, [dates, materials]);
  const dayUngroupedMap = useMemo(() => {
    const map = new Map();
    dates.forEach((date) => {
      const rows = [];
      materials.forEach((material) => {
        const entries = Array.isArray(material?.byDate?.[date]?.entries) ? material.byDate[date].entries : [];
        entries.forEach((entry) => {
          if (entry.claimStatus === "claimed" && !keyGroupMap.has(entry.sourceRowKey)) rows.push(entry);
        });
      });
      map.set(date, rows);
    });
    return map;
  }, [dates, keyGroupMap, materials]);

  if (!materials.length) {
    return <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-12 text-center text-sm text-slate-400">ไม่มีข้อมูลในมุมมองนี้</div>;
  }

  return (
    <div className="overflow-hidden border border-slate-400 bg-white shadow-none">
      <div className="border-b border-slate-400 bg-[var(--surface-navy,#102C57)] px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold tracking-[0.08em] text-white">{title}</h3>
            {subtitle ? <p className="mt-1 text-[11px] text-white/70">{subtitle}</p> : null}
          </div>
          {showBulkSelect && onSelectAll ? (
            <div className="shrink-0 text-[11px] font-medium text-slate-400">เลือกเคลมได้รายวัน</div>
          ) : null}
        </div>
      </div>

      <div className="w-full overflow-x-hidden bg-white">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col style={{ width: "23%" }} />
            <col style={{ width: "6%" }} />
            {dates.map((date) => <col key={`date-${date}`} style={{ width: dateWidth }} />)}
            <col style={{ width: "8%" }} />
          </colgroup>
          <thead className="bg-[#EEF3F8]">
            <tr className="border-b border-slate-400">
              <th className="border-r border-slate-300 bg-[#EEF3F8] px-2 py-2 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-[#102C57]">วัตถุดิบ</th>
              <th className="border-r border-slate-300 bg-[#EEF3F8] px-1 py-2 text-center text-[11px] font-bold uppercase tracking-[0.08em] text-[#102C57]">หน่วย</th>
              {dates.map((date) => {
                const wipLines = Array.isArray(wipByDate?.[date]) ? wipByDate[date] : [];
                const dayClaimableRows = dayClaimableMap.get(date) || [];
                const dayUngroupedRows = dayUngroupedMap.get(date) || [];
                return (
                  <th key={date} className="border-r border-slate-300 bg-[#F8FAFC] px-1 py-2 align-top text-center text-[11px] font-semibold text-slate-700 last:border-r-0">
                    <div className="text-[11px] font-bold tracking-[0.04em] text-[#102C57]">{formatShortThaiDate(date)}</div>
                    {wipLines.length ? (
                      <div className="mt-1 border-t border-slate-300 pt-1">
                        {wipLines.map((line, index) => (
                          <div key={`${date}-${line.name}-${index}`} className="whitespace-nowrap text-[9px] leading-4 text-[#102C57]">
                            <span className="font-medium">{line.name}</span>{" "}
                            <span className="font-bold text-[#8B1E16]">{line.displayQty}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                    {showBulkSelect && onSelectAll && dayClaimableRows.length ? (
                      <div className="mt-1 border-t border-slate-300 pt-1">
                        <button
                          type="button"
                          onClick={() => onSelectAll(dayClaimableRows)}
                          className="border border-[#102C57] bg-white px-2 py-0.5 text-[9px] font-bold tracking-[0.04em] text-[#102C57] transition-colors hover:bg-[var(--surface-navy,#102C57)] hover:text-white"
                        >
                          เคลมทั้งหมด
                        </button>
                      </div>
                    ) : null}
                    {dayUngroupedRows.length ? (
                      <div className="mt-1">
                        <button
                          type="button"
                          onClick={() => onOpenDrawer({
                            date,
                            deptId: dayUngroupedRows[0]?.assignedDepartmentId || dayUngroupedRows[0]?.ownerDepartmentId || "",
                            deptName: title,
                            ungroupedRows: dayUngroupedRows,
                          })}
                          className="border border-dashed border-[#102C57]/40 px-2 py-0.5 text-[9px] font-bold tracking-[0.04em] text-[#102C57] transition-colors hover:bg-[var(--surface-navy,#102C57)] hover:text-white"
                        >
                          ใบเบิก {dayUngroupedRows.length}
                        </button>
                      </div>
                    ) : null}
                  </th>
                );
              })}
              <th className="border-l border-slate-300 bg-[#E6EDF5] px-1 py-2 text-center text-[11px] font-bold uppercase tracking-[0.08em] text-[#102C57]">รวม</th>
            </tr>
          </thead>
          <tbody>
            {materials.map((material, index) => {
              const rowClass = index % 2 === 0 ? "bg-white" : "bg-[#FAFBFC]";
              return (
                <tr key={`${title}-${material.materialKey || material.matGoodsCode || material.matSkuCode}`} className={`border-b border-slate-300 ${rowClass}`}>
                  <td className="border-r border-slate-300 px-2 py-2 align-top">
                    <div className="whitespace-nowrap text-[12px] font-semibold text-slate-800">{material.matName}</div>
                    <div className="mt-0.5 whitespace-nowrap text-[10px] font-mono text-slate-500">{material.matGoodsCode || material.matSkuCode}</div>
                  </td>
                  <td className="border-r border-slate-300 px-1 py-2 text-center text-[11px] font-medium text-slate-700"><span className="whitespace-nowrap">{material.unit || "-"}</span></td>
                  {dates.map((date) => {
                    const cell = material.byDate?.[date];
                    const entries = Array.isArray(cell?.entries) ? cell.entries : [];
                    const claimableEntries = entries.filter((entry) => entry.canClaim && entry.claimStatus !== "claimed");
                    const pendingVerifyEntries = entries.filter((entry) => (
                      !entry.materialVerified && entry.claimStatus !== "claimed"
                    ));
                    const selectedCount = claimableEntries.filter((entry) => selectedRowKeys.has(entry.sourceRowKey)).length;
                    const allSelected = claimableEntries.length > 0 && selectedCount === claimableEntries.length;
                    const someSelected = selectedCount > 0 && selectedCount < claimableEntries.length;
                    const totalRows = Number(cell?.totalRows || 0);
                    const claimedRows = Number(cell?.claimedRows || 0);
                    const isClaimed = totalRows > 0 && claimedRows === totalRows;
                    const isPartial = claimedRows > 0 && claimedRows < totalRows;
                    const isPendingVerify = pendingVerifyEntries.length > 0 && !claimableEntries.length && !isClaimed;
                    const statusLabel = isClaimed
                      ? "เคลมแล้ว"
                      : isPartial
                        ? "เคลมได้บางส่วน"
                        : isPendingVerify
                          ? "รอตรวจสอบวัตถุดิบ"
                          : claimableEntries.length
                            ? "รอเคลม"
                            : "-";
                    const toneClass = isClaimed ? "bg-emerald-50/40" : isPartial ? "bg-amber-50/40" : "";

                    return (
                      <td key={`${material.materialKey || material.matGoodsCode || material.matSkuCode}-${date}`} className={`border-r border-slate-300 px-1 py-2 align-top text-center last:border-r-0 ${toneClass}`}>
                        {cell ? (
                          <div className="flex min-h-[52px] flex-col items-center justify-center gap-1">
                            {claimableEntries.length > 0 ? (
                              <label className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-600">
                                <input type="checkbox" checked={allSelected} ref={(input) => { if (input) input.indeterminate = someSelected; }} onChange={() => onToggleCellSelection(claimableEntries)} className="h-3.5 w-3.5 rounded-none border-slate-400 accent-[#102C57]" />
                                เลือก
                              </label>
                            ) : <span className="text-[10px] text-transparent">.</span>}
                            <span className={`text-[13px] font-bold tabular-nums ${isClaimed ? "text-emerald-700" : isPartial ? "text-amber-700" : "text-slate-800"}`}>{fmtQty(cell.totalQty) || "-"}</span>
                            <span className="whitespace-nowrap text-[9px] font-semibold text-slate-500">{statusLabel}</span>
                          </div>
                        ) : <span className="text-[12px] text-slate-200">-</span>}
                      </td>
                    );
                  })}
                  <td className="border-l border-slate-300 bg-[#E6EDF5] px-1 py-2 text-center"><span className="text-[13px] font-bold tabular-nums text-[#102C57]">{fmtQty(material.weeklyTotal)}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MaterialClaimsWorkspaceModernClient({
  masterPlanNo = "",
  dateFrom = "",
  dateTo = "",
  lookup27Departments = [],
  schedulePlans = [],
}) {
  const [activeCentralSectionId, setActiveCentralSectionId] = useState("");
  const [activeQaTabId, setActiveQaTabId] = useState("");
  const [selectedRowKeys, setSelectedRowKeys] = useState(() => new Set());
  const [drawerState, setDrawerState] = useState(null);
  const [claimingSelected, setClaimingSelected] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [lastRefreshedAt, setLastRefreshedAt] = useState(null);

  const workspaceUrl = useMemo(() => {
    if (!masterPlanNo) return null;
    const query = new URLSearchParams({ masterPlanNo, grain: "daily", dateFrom, dateTo });
    return `/api/production-planning/material-claims/workspace?${query.toString()}`;
  }, [masterPlanNo, dateFrom, dateTo]);

  const {
    data: workspaceData,
    mutate: mutateWorkspace,
    isLoading,
    isValidating: isWorkspaceRefreshing,
  } = useSWR(workspaceUrl, fetcher, {
    refreshInterval: 0,
    revalidateOnFocus: true,
    focusThrottleInterval: 60000,
  });
  const {
    data: groupsData,
    mutate: mutateGroups,
    isValidating: isGroupsRefreshing,
  } = useSWR(
    masterPlanNo ? `/api/production-planning/requisition/groups?masterPlanNo=${encodeURIComponent(masterPlanNo)}` : null,
    fetcher,
    {
      refreshInterval: 0,
      revalidateOnFocus: true,
      focusThrottleInterval: 60000,
    }
  );

  const groups = useMemo(() => (Array.isArray(groupsData?.data) ? groupsData.data : []), [groupsData]);
  const keyGroupMap = useMemo(() => buildKeyGroupMap(groups), [groups]);
  const centralSections = useMemo(() => (Array.isArray(workspaceData?.centralSections) ? workspaceData.centralSections : []), [workspaceData]);
  const centralViews = useMemo(() => (Array.isArray(workspaceData?.centralViews) ? workspaceData.centralViews : []), [workspaceData]);
  const qaTabs = useMemo(() => (Array.isArray(workspaceData?.qaTabs) ? workspaceData.qaTabs : []), [workspaceData]);
  const qaViews = useMemo(() => workspaceData?.qaViews || {}, [workspaceData]);

  useEffect(() => {
    if (!activeCentralSectionId && centralSections.length > 0) setActiveCentralSectionId(centralSections[0].id);
  }, [activeCentralSectionId, centralSections]);

  useEffect(() => {
    if (!activeQaTabId && qaTabs.length > 0) setActiveQaTabId(qaTabs[0].id);
  }, [activeQaTabId, qaTabs]);

  const activeCentralView = useMemo(() => centralViews.find((section) => section.id === activeCentralSectionId) || centralViews[0] || null, [activeCentralSectionId, centralViews]);
  const activeQaView = useMemo(() => qaViews?.[activeQaTabId] || qaViews?.[qaTabs[0]?.id] || null, [activeQaTabId, qaTabs, qaViews]);
  const allViews = useMemo(() => [...centralViews, ...Object.values(qaViews || {})], [centralViews, qaViews]);
  const entriesByKey = useMemo(() => flattenWorkspaceEntries(allViews), [allViews]);
  const allRows = useMemo(() => Array.from(entriesByKey.values()), [entriesByKey]);
  const allDates = useMemo(() => {
    const dates = new Set();
    allRows.forEach((row) => { if (row?.bucketDate) dates.add(row.bucketDate); });
    return Array.from(dates).sort();
  }, [allRows]);

  const refreshAll = useCallback(async () => {
    await Promise.all([mutateWorkspace(), mutateGroups()]);
    setLastRefreshedAt(new Date());
  }, [mutateWorkspace, mutateGroups]);

  const handleManualRefresh = useCallback(async () => {
    setErrorMsg("");
    try {
      await refreshAll();
    } catch (refreshError) {
      setErrorMsg(String(refreshError?.message || "รีเฟรชข้อมูลไม่สำเร็จ"));
    }
  }, [refreshAll]);

  useEffect(() => {
    if (workspaceData || groupsData) {
      setLastRefreshedAt(new Date());
    }
  }, [groupsData, workspaceData]);

  const isRefreshing = isWorkspaceRefreshing || isGroupsRefreshing;

  const handleToggleCellSelection = useCallback((entries) => {
    const keys = entries.map((entry) => String(entry?.sourceRowKey || "").trim()).filter(Boolean);
    if (!keys.length) return;
    setSelectedRowKeys((prev) => {
      const next = new Set(prev);
      const allSelected = keys.every((key) => next.has(key));
      if (allSelected) keys.forEach((key) => next.delete(key));
      else keys.forEach((key) => next.add(key));
      return next;
    });
  }, []);

  const handleSelectAllRows = useCallback((entries) => {
    const keys = entries.map((entry) => String(entry?.sourceRowKey || "").trim()).filter(Boolean);
    setSelectedRowKeys(new Set(keys));
  }, []);

  const handleClaimSelected = useCallback(async () => {
    if (!selectedRowKeys.size) return;
    const rowsToClaim = Array.from(selectedRowKeys).map((key) => entriesByKey.get(key)).filter((entry) => entry && entry.canClaim && entry.claimStatus !== "claimed");
    if (!rowsToClaim.length) {
      setSelectedRowKeys(new Set());
      return;
    }
    setClaimingSelected(true);
    setErrorMsg("");
    try {
      const results = await Promise.all(rowsToClaim.map(async (row) => {
        const response = await fetch("/api/production-planning/material-claims/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            masterPlanNo,
            grain: "daily",
            sourceRowKey: row.sourceRowKey,
            materialSkuCode: row.materialSkuCode,
            materialGoodsCode: row.materialGoodsCode || row.materialSkuCode,
            ownerDepartmentId: row.ownerDepartmentId,
            demandSource: row.demandSource || "subplan_raw",
            workDate: row.bucketDate,
            departmentId: row.assignedDepartmentId,
            source: "manual_claim",
          }),
        });
        return response.json().catch(() => ({}));
      }));
      const failed = results.find((row) => row?.error);
      if (failed?.error) throw new Error(failed.error);
      setSelectedRowKeys(new Set());
      await refreshAll();
    } catch (claimError) {
      setErrorMsg(String(claimError?.message || "เคลมรายการที่เลือกไม่สำเร็จ"));
    } finally {
      setClaimingSelected(false);
    }
  }, [entriesByKey, masterPlanNo, refreshAll, selectedRowKeys]);

  const handleDrawerOpen = useCallback((state) => {
    setDrawerState({ ...state, masterPlanNo, grain: "daily" });
  }, [masterPlanNo]);

  const handleDrawerSaved = useCallback(async () => {
    setDrawerState(null);
    await refreshAll();
  }, [refreshAll]);

  if (!masterPlanNo) {
    return <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-14 text-center text-sm text-slate-500">กรุณาเลือกเลขแผนก่อน</div>;
  }

  return (
    <div className="space-y-5 pb-24">
      <section className="border border-slate-400 bg-white p-4 shadow-none">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#102C57]/70">ภาพรวมแผนหลัก</div>
            <div className="mt-1 text-lg font-bold text-[#102C57]">{masterPlanNo || "-"}</div>
            <div className="mt-1 text-sm text-slate-500">ช่วงวันที่ {buildRangeLabel(dateFrom, dateTo)}</div>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-2 border border-[#102C57] bg-white px-3 py-2 text-xs font-bold text-[#102C57] transition-colors hover:bg-[#EEF3F8] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw aria-hidden="true" className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              รีเฟรชข้อมูล
            </button>
            <span className="text-[11px] text-slate-500">
              อัปเดตล่าสุด {lastRefreshedAt ? lastRefreshedAt.toLocaleTimeString("th-TH") : "-"}
            </span>
          </div>
        </div>
        <div className="mt-4 space-y-4">
          {schedulePlans.map((plan) => (
            <div key={`${plan.id || plan.deptId}-${plan.deptId}`} className="overflow-hidden border border-slate-300 bg-[#FAFBFC]">
              <EmbeddedProductionSchedule embedded readOnly deptId={plan.deptId} masterPlanNo={masterPlanNo} dateFrom={dateFrom} dateTo={dateTo} />
            </div>
          ))}
          {!schedulePlans.length ? <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-400">ยังไม่พบตารางแผนหลักสำหรับเลขแผนนี้</div> : null}
        </div>
      </section>

      {errorMsg ? <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMsg}</div> : null}
      <SummaryBar poolRows={allRows} dates={allDates} />

      <section className="space-y-4 border border-slate-400 bg-white p-4 shadow-none">
        <div className="border-b border-slate-200 pb-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#102C57]/70">โซนวัตถุดิบส่วนกลาง</div>
          <div className="mt-1 text-sm text-slate-500">ใช้สำหรับวัตถุดิบที่แผนกส่วนกลางต้องเบิกให้ QA ทุกแผนกรวมกัน</div>
        </div>
        {centralSections.length ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {centralSections.map((section) => <button key={section.id} type="button" onClick={() => setActiveCentralSectionId(section.id)} className={`border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors ${section.id === activeCentralSectionId ? "border-[#102C57] bg-[var(--surface-navy,#102C57)] text-white" : "border-slate-300 bg-white text-[#102C57] hover:bg-[#EEF3F8]"}`}>{section.label}</button>)}
            </div>
            {activeCentralView ? <ClaimsMatrixTable title={`วัตถุดิบที่ ${activeCentralView.label} รับผิดชอบ`} subtitle="ติ๊กเพื่อเคลมรายการที่ต้องใช้ และกดปุ่มใบเบิกในช่องที่เคลมแล้วเพื่อรวมกลุ่มออกเอกสาร" dates={activeCentralView.dates || []} materials={activeCentralView.materials || []} wipByDate={activeCentralView.wipByDate || {}} keyGroupMap={keyGroupMap} selectedRowKeys={selectedRowKeys} onToggleCellSelection={handleToggleCellSelection} onOpenDrawer={handleDrawerOpen} showBulkSelect onSelectAll={handleSelectAllRows} /> : null}
          </>
        ) : <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-400">ยังไม่พบแผนกวัตถุดิบส่วนกลางในแผนนี้</div>}
      </section>

      <section className="space-y-4 border border-slate-400 bg-white p-4 shadow-none">
        <div className="border-b border-slate-200 pb-4">
          <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-[#102C57]/70">โซนวัตถุดิบของ QA รายแผนก</div>
          <div className="mt-1 text-sm text-slate-500">กดแท็บเพื่อดูวัตถุดิบของ QA แต่ละแผนก โดยยังใช้ตารางเดียวกับหน้าตรวจสอบวัตถุดิบ</div>
        </div>
        {qaTabs.length ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {qaTabs.map((tab) => <button key={tab.id} type="button" onClick={() => setActiveQaTabId(tab.id)} className={`border px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.08em] transition-colors ${tab.id === activeQaTabId ? "border-[#102C57] bg-[var(--surface-navy,#102C57)] text-white" : "border-slate-300 bg-white text-[#102C57] hover:bg-[#EEF3F8]"}`}>{tab.label}</button>)}
            </div>
            {activeQaView ? <ClaimsMatrixTable title={`วัตถุดิบของ ${activeQaView.label}`} subtitle="ใช้มุมมองนี้เพื่อตรวจว่าวัตถุดิบของ QA แผนกนั้นถูกเคลมครบหรือยัง" dates={activeQaView.dates || []} materials={activeQaView.materials || []} wipByDate={activeQaView.wipByDate || {}} keyGroupMap={keyGroupMap} selectedRowKeys={selectedRowKeys} onToggleCellSelection={handleToggleCellSelection} onOpenDrawer={handleDrawerOpen} /> : null}
          </>
        ) : <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-sm text-slate-400">ยังไม่พบแผนย่อยของ QA ในช่วงวันที่นี้</div>}
      </section>

      {selectedRowKeys.size > 0 ? (
        <div className="sticky bottom-16 z-30 mx-auto flex max-w-sm items-center justify-between gap-4 rounded-2xl border border-[#102C57]/20 bg-[var(--surface-navy,#102C57)] px-5 py-3 shadow-xl">
          <span className="text-sm font-semibold text-white">เลือกแล้ว <span className="font-extrabold">{selectedRowKeys.size}</span> รายการ</span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setSelectedRowKeys(new Set())} className="rounded-lg border border-white/30 px-3 py-1.5 text-xs font-semibold text-white/85 hover:bg-white/10">ล้าง</button>
            <button type="button" disabled={claimingSelected} onClick={handleClaimSelected} className="rounded-lg bg-white px-4 py-1.5 text-xs font-bold text-[#102C57] hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50">{claimingSelected ? "กำลังเคลม..." : "เคลมที่เลือก"}</button>
          </div>
        </div>
      ) : null}

      <ExportBar groups={groups} masterPlanNo={masterPlanNo} onMutateGroups={mutateGroups} />
      {drawerState ? <GroupingDrawer drawerState={drawerState} lookup27Departments={lookup27Departments} onClose={() => setDrawerState(null)} onSaved={handleDrawerSaved} /> : null}
      {isLoading ? <div className="rounded-2xl border border-slate-200 bg-white px-4 py-6 text-center text-sm text-slate-500">กำลังโหลดข้อมูลหน้าเคลม...</div> : null}
    </div>
  );
}

