"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import useSWR from "swr";

// ─── Constants ─────────────────────────────────────────────────────────────────
const STATUS = { draft: "draft", ready: "ready_to_export", exported: "exported" };
const DAY_TH = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const MONTH_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

// ─── Helpers ────────────────────────────────────────────────────────────────────
const fetcher = (url) => fetch(url).then((r) => r.json());

function fmtDate(dateStr) {
  try {
    const d = new Date(`${dateStr}T00:00:00.000Z`);
    return `${DAY_TH[d.getUTCDay()]} ${d.getUTCDate()} ${MONTH_TH[d.getUTCMonth()]}`;
  } catch { return dateStr; }
}

function fmtQty(qty) {
  const n = Number(qty);
  if (!Number.isFinite(n)) return "—";
  return n % 1 === 0 ? n.toLocaleString("th-TH") : n.toLocaleString("th-TH", { maximumFractionDigits: 3 });
}

// Build matrix: date → dept → rows
function buildMatrix(poolRows) {
  const claimed = (poolRows || []).filter((r) => r.claimStatus === "claimed");
  const dateMap = new Map();
  claimed.forEach((row) => {
    const date = row.bucketDate;
    if (!date) return;
    if (!dateMap.has(date)) dateMap.set(date, new Map());
    const deptId = row.ownerDepartmentId || "unknown";
    const dept = dateMap.get(date);
    if (!dept.has(deptId)) {
      dept.set(deptId, {
        deptId,
        deptName: row.ownerDepartmentName || row.ownerDepartmentCode || deptId,
        deptCode: row.ownerDepartmentCode || "",
        rows: [],
      });
    }
    dept.get(deptId).rows.push(row);
  });
  return Array.from(dateMap.keys())
    .sort()
    .map((date) => ({ date, depts: Array.from(dateMap.get(date).values()) }));
}

// Build sourceRowKey → group map from fetched groups
function buildKeyGroupMap(groups) {
  const map = new Map();
  (groups || []).forEach((g) => {
    (g.items || []).forEach((item) => {
      const key = String(item.source_row_key || "").trim();
      if (key) map.set(key, g);
    });
  });
  return map;
}

// ─── Status Badge ───────────────────────────────────────────────────────────────
function GroupStatusBadge({ status }) {
  if (status === STATUS.exported) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
        <span className="h-1.5 w-1.5 rounded-full bg-slate-400" /> exported
      </span>
    );
  }
  if (status === STATUS.ready) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> พร้อม export
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
      <span className="h-1.5 w-1.5 rounded-full bg-amber-400" /> draft
    </span>
  );
}

// ─── Group Card (within a day-dept block) ──────────────────────────────────────
function GroupCard({ group, onConfirm, onDelete, onReopen }) {
  const isReady = group.status === STATUS.ready;
  const isExported = group.status === STATUS.exported;
  return (
    <div className={`flex items-center justify-between rounded-lg border px-3 py-2 text-sm ${isReady ? "border-emerald-200 bg-emerald-50" : isExported ? "border-slate-200 bg-slate-50" : "border-amber-200 bg-amber-50"}`}>
      <div className="flex items-center gap-2 min-w-0">
        <GroupStatusBadge status={group.status} />
        <span className="font-semibold text-slate-700 truncate">
          {group.group_name || `ใบเบิก`}
        </span>
        <span className="text-slate-400 text-[11px]">
          {group.itemCount} รายการ
        </span>
        {group.document_no && (
          <span className="font-mono text-[11px] text-slate-500">{group.document_no}</span>
        )}
      </div>

      {!isExported && (
        <div className="flex items-center gap-1 ml-2 shrink-0">
          {!isReady && (
            <button
              onClick={() => onConfirm(group.id)}
              className="rounded-md bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 transition-colors"
            >
              ยืนยัน
            </button>
          )}
          {isReady && (
            <button
              onClick={() => onReopen(group.id)}
              className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              แก้ไข
            </button>
          )}
          {!isReady && (
            <button
              onClick={() => onDelete(group.id)}
              className="rounded-md border border-red-200 px-2 py-1 text-[11px] font-semibold text-red-500 hover:bg-red-50 transition-colors"
            >
              ลบ
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Day-Dept Block ─────────────────────────────────────────────────────────────
function DayDeptBlock({ deptEntry, date, groups, keyGroupMap, onCreateGroup }) {
  const { deptId, deptName, deptCode, rows } = deptEntry;

  // Rows not yet in any group
  const ungroupedRows = rows.filter((r) => !keyGroupMap.has(r.sourceRowKey));

  // Groups that belong to this dept on this date
  const deptGroups = groups.filter((g) => {
    if (!g.items?.length) return false;
    return g.items.some((item) => {
      const row = rows.find((r) => r.sourceRowKey === item.source_row_key);
      return !!row;
    });
  });

  const allGrouped = ungroupedRows.length === 0;

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
        <div className="flex items-center gap-2">
          {deptCode && (
            <span className="rounded-full bg-[#102C57]/10 px-2 py-0.5 text-[10px] font-bold text-[#102C57]">
              {deptCode}
            </span>
          )}
          <span className="text-sm font-semibold text-slate-700">{deptName}</span>
          <span className="text-[11px] text-slate-400">
            {rows.length} รายการ claimed
          </span>
        </div>

        <div className="flex items-center gap-2">
          {allGrouped ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              จัดครบแล้ว
            </span>
          ) : (
            <span className="text-[11px] text-amber-600 font-semibold">
              รอจัด {ungroupedRows.length} รายการ
            </span>
          )}

          {ungroupedRows.length > 0 && (
            <button
              onClick={() => onCreateGroup({ date, deptId, deptName, deptCode, rows, ungroupedRows })}
              className="flex items-center gap-1 rounded-lg bg-[#102C57] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#102C57]/90 transition-colors"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              จัดใบเบิก
            </button>
          )}
        </div>
      </div>

      {/* Existing groups */}
      {deptGroups.length > 0 && (
        <div className="space-y-1.5 px-4 py-2.5">
          {deptGroups.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              onConfirm={async (id) => {
                const res = await fetch(`/api/production-planning/requisition/groups/${id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "confirm" }),
                });
                if (!res.ok) {
                  const d = await res.json();
                  alert(d.error || "เกิดข้อผิดพลาด");
                }
              }}
              onDelete={async (id) => {
                if (!confirm("ลบกลุ่มใบเบิกนี้?")) return;
                const res = await fetch(`/api/production-planning/requisition/groups/${id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "delete" }),
                });
                if (!res.ok) {
                  const d = await res.json();
                  alert(d.error || "เกิดข้อผิดพลาด");
                }
              }}
              onReopen={async (id) => {
                const res = await fetch(`/api/production-planning/requisition/groups/${id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "reopen" }),
                });
                if (!res.ok) {
                  const d = await res.json();
                  alert(d.error || "เกิดข้อผิดพลาด");
                }
              }}
            />
          ))}
        </div>
      )}

      {/* No groups yet placeholder */}
      {!deptGroups.length && ungroupedRows.length > 0 && (
        <div className="px-4 py-3 text-[11px] text-slate-400">
          กด &quot;จัดใบเบิก&quot; เพื่อแบ่งกลุ่มวัตถุดิบสำหรับคีย์ ERP
        </div>
      )}
    </div>
  );
}

// ─── Grouping Drawer ────────────────────────────────────────────────────────────
function GroupingDrawer({ drawerState, lookup27Departments, onClose, onSaved }) {
  const [ticked, setTicked] = useState(() => new Set());
  const [groupName, setGroupName] = useState("");
  const [deptCode, setDeptCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { date, deptId, deptName, ungroupedRows, masterPlanNo, grain } = drawerState;

  // Fetch pattern for this ownerDepartmentId
  const patternUrl = deptId
    ? `/api/production-planning/requisition/patterns?ownerDepartmentId=${encodeURIComponent(deptId)}`
    : null;
  const { data: patternData } = useSWR(patternUrl, fetcher, { revalidateOnFocus: false });
  const patterns = useMemo(
    () => (Array.isArray(patternData?.data) ? patternData.data : []),
    [patternData]
  );

  // Build map: materialGoodsCode → groupName (from most recent pattern)
  const patternMap = useMemo(() => {
    const map = new Map();
    patterns.forEach(({ groupName: gn, materialGoodsCodes }) => {
      (materialGoodsCodes || []).forEach((code) => {
        if (!map.has(code)) map.set(code, gn);
      });
    });
    return map;
  }, [patterns]);

  // Classify rows: known (in pattern) vs new (never grouped before)
  const knownRows = ungroupedRows.filter((r) => patternMap.has(r.materialGoodsCode || r.materialSkuCode));
  const newRows = ungroupedRows.filter((r) => !patternMap.has(r.materialGoodsCode || r.materialSkuCode));

  const toggleAll = () => {
    if (ticked.size === ungroupedRows.length) setTicked(new Set());
    else setTicked(new Set(ungroupedRows.map((r) => r.sourceRowKey)));
  };

  const toggleRow = (key) => {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Apply a suggested pattern group: tick matching rows + fill group name
  const applyPattern = (suggestion) => {
    const codeSet = new Set(suggestion.materialGoodsCodes || []);
    const matchedKeys = ungroupedRows
      .filter((r) => codeSet.has(r.materialGoodsCode || r.materialSkuCode))
      .map((r) => r.sourceRowKey);
    setTicked(new Set(matchedKeys));
    setGroupName(suggestion.groupName);
  };

  const handleSave = async () => {
    if (ticked.size === 0) { setError("กรุณาเลือกรายการอย่างน้อย 1 รายการ"); return; }
    setSaving(true);
    setError("");
    try {
      const selectedKeys = ungroupedRows
        .filter((r) => ticked.has(r.sourceRowKey))
        .map((r) => r.sourceRowKey);

      const res = await fetch("/api/production-planning/requisition/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterPlanNo,
          grain,
          dateFrom: date,
          dateTo: date,
          sourceRowKeys: selectedKeys,
          groupName: groupName.trim() || null,
          lookup27DepartmentCode: deptCode || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "สร้างกลุ่มไม่สำเร็จ");
      onSaved();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // Filter patterns to only those that have at least 1 matching ungrouped row
  const activeSuggestions = patterns.filter((s) =>
    (s.materialGoodsCodes || []).some((code) =>
      ungroupedRows.some((r) => (r.materialGoodsCode || r.materialSkuCode) === code)
    )
  );

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-[#102C57] px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold text-white/60 uppercase tracking-wide">จัดใบเบิก</p>
            <h3 className="text-sm font-bold text-white mt-0.5">
              {fmtDate(date)} — {deptName}
            </h3>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-white/10 transition-colors">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Pattern suggestions */}
        {activeSuggestions.length > 0 && (
          <div className="border-b border-slate-100 bg-amber-50 px-5 py-3">
            <p className="mb-2 text-[11px] font-semibold text-amber-700 uppercase tracking-wide">
              แนะนำจากรูปแบบก่อนหน้า
            </p>
            <div className="flex flex-wrap gap-2">
              {activeSuggestions.map((s) => {
                const matchCount = (s.materialGoodsCodes || []).filter((code) =>
                  ungroupedRows.some((r) => (r.materialGoodsCode || r.materialSkuCode) === code)
                ).length;
                return (
                  <button
                    key={s.groupName}
                    type="button"
                    onClick={() => applyPattern(s)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 transition-colors"
                  >
                    <svg className="h-3 w-3 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                    </svg>
                    {s.groupName}
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-700">
                      {matchCount} รายการ
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[10px] text-amber-600">
              กดเพื่อเลือกวัตถุดิบตามรูปแบบ — แก้ไขได้ก่อนบันทึก
            </p>
          </div>
        )}

        {/* Form fields */}
        <div className="border-b border-slate-100 px-5 py-3 space-y-2.5 bg-slate-50">
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">ชื่อกลุ่ม (ไม่บังคับ)</label>
            <input
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="เช่น ห้องตีแป้ง, ห้องแพ็ค"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-300 focus:border-[#102C57] focus:outline-none focus:ring-1 focus:ring-[#102C57]"
            />
          </div>
          {lookup27Departments?.length > 0 && (
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">รหัสแผนกใน ERP</label>
              <select
                value={deptCode}
                onChange={(e) => setDeptCode(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#102C57] focus:outline-none focus:ring-1 focus:ring-[#102C57]"
              >
                <option value="">— ไม่ระบุ —</option>
                {lookup27Departments.map((d) => (
                  <option key={d.code} value={d.code}>{d.code} — {d.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Material list */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              วัตถุดิบที่ยังไม่ได้จัดกลุ่ม ({ungroupedRows.length} รายการ)
            </span>
            <button
              onClick={toggleAll}
              className="text-[11px] font-semibold text-[#102C57] hover:underline"
            >
              {ticked.size === ungroupedRows.length ? "ยกเลิกทั้งหมด" : "เลือกทั้งหมด"}
            </button>
          </div>

          <div className="space-y-1">
            {/* Known materials (have pattern) */}
            {knownRows.map((row) => {
              const isChecked = ticked.has(row.sourceRowKey);
              const suggestedGroup = patternMap.get(row.materialGoodsCode || row.materialSkuCode);
              return (
                <label
                  key={row.sourceRowKey}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${isChecked ? "border-[#102C57]/30 bg-[#102C57]/5" : "border-slate-100 bg-white hover:bg-slate-50"}`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleRow(row.sourceRowKey)}
                    className="h-4 w-4 rounded border-slate-300 text-[#102C57] focus:ring-[#102C57] accent-[#102C57]"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-slate-800 leading-snug truncate">
                        {row.materialName || row.materialGoodsCode || row.materialSkuCode}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-slate-400 font-mono">
                        {row.materialGoodsCode || row.materialSkuCode}
                      </span>
                      {suggestedGroup && (
                        <span className="inline-flex items-center rounded-full bg-amber-50 px-1.5 py-0 text-[9px] font-semibold text-amber-600 border border-amber-200">
                          {suggestedGroup}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold text-slate-700 tabular-nums">
                      {fmtQty(row.issueQty)}
                    </div>
                    {row.unit && (
                      <div className="text-[10px] text-slate-400">{row.unit}</div>
                    )}
                  </div>
                </label>
              );
            })}

            {/* New materials (no pattern) */}
            {newRows.length > 0 && (
              <>
                {knownRows.length > 0 && (
                  <div className="flex items-center gap-2 py-1.5">
                    <div className="flex-1 border-t border-dashed border-slate-200" />
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                      วัตถุดิบใหม่ — ยังไม่เคยจัดกลุ่ม
                    </span>
                    <div className="flex-1 border-t border-dashed border-slate-200" />
                  </div>
                )}
                {newRows.map((row) => {
                  const isChecked = ticked.has(row.sourceRowKey);
                  return (
                    <label
                      key={row.sourceRowKey}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${isChecked ? "border-[#102C57]/30 bg-[#102C57]/5" : "border-dashed border-slate-200 bg-white hover:bg-slate-50"}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleRow(row.sourceRowKey)}
                        className="h-4 w-4 rounded border-slate-300 text-[#102C57] focus:ring-[#102C57] accent-[#102C57]"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-slate-800 leading-snug truncate">
                            {row.materialName || row.materialGoodsCode || row.materialSkuCode}
                          </span>
                          <span className="shrink-0 rounded-full bg-sky-50 px-1.5 py-0 text-[9px] font-semibold text-sky-600 border border-sky-200">
                            ใหม่
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {row.materialGoodsCode || row.materialSkuCode}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-slate-700 tabular-nums">
                          {fmtQty(row.issueQty)}
                        </div>
                        {row.unit && (
                          <div className="text-[10px] text-slate-400">{row.unit}</div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 px-5 py-3 bg-slate-50">
          {error && (
            <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600 border border-red-100">{error}</p>
          )}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500">
              เลือกแล้ว <strong>{ticked.size}</strong> / {ungroupedRows.length} รายการ
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onClose}
                disabled={saving}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleSave}
                disabled={saving || ticked.size === 0}
                className="rounded-lg bg-[#102C57] px-4 py-2 text-sm font-semibold text-white hover:bg-[#102C57]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "กำลังบันทึก…" : "บันทึกกลุ่ม"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Export Bar ─────────────────────────────────────────────────────────────────
function ExportBar({ groups, masterPlanNo }) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState("");

  const readyGroups = (groups || []).filter((g) => g.status === STATUS.ready);
  const totalGroups = (groups || []).filter((g) => g.status !== STATUS.exported).length;

  const handleExport = async () => {
    if (!readyGroups.length) return;
    setExporting(true);
    setExportError("");
    try {
      const res = await fetch("/api/production-planning/requisition/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupIds: readyGroups.map((g) => g.id) }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Export ไม่สำเร็จ");
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const fileName = disposition.match(/filename="(.+)"/)?.[1]
        || `${String(masterPlanNo || "requisition").toUpperCase()}_export.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setExportError(e.message);
    } finally {
      setExporting(false);
    }
  };

  if (!groups?.length) return null;

  return (
    <div className="sticky bottom-0 z-20 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-lg">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-sm">
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">กลุ่มทั้งหมด</span>
            <span className="text-lg font-bold text-slate-700 tabular-nums leading-tight">{totalGroups}</span>
          </div>
          <div className="h-8 w-px bg-slate-100" />
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">พร้อม export</span>
            <span className={`text-lg font-bold tabular-nums leading-tight ${readyGroups.length > 0 ? "text-emerald-600" : "text-slate-400"}`}>
              {readyGroups.length}
            </span>
          </div>
          <div className="h-8 w-px bg-slate-100" />
          <div className="flex flex-col">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">exported แล้ว</span>
            <span className="text-lg font-bold text-slate-400 tabular-nums leading-tight">
              {groups.filter((g) => g.status === STATUS.exported).length}
            </span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          {exportError && (
            <p className="text-xs text-red-500">{exportError}</p>
          )}
          <button
            onClick={handleExport}
            disabled={exporting || readyGroups.length === 0}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {exporting ? (
              <>
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                กำลัง export…
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                Export Excel ({readyGroups.length} ใบเบิก)
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────────
export default function MatrixGroupingClient({
  initialPoolRows = [],
  masterPlanNo = "",
  grain = "daily",
  lookup27Departments = [],
}) {
  const [drawerState, setDrawerState] = useState(null);

  // Fetch groups (live)
  const groupsUrl = masterPlanNo
    ? `/api/production-planning/requisition/groups?masterPlanNo=${encodeURIComponent(masterPlanNo)}`
    : null;
  const { data: groupsData, mutate: mutateGroups } = useSWR(groupsUrl, fetcher, {
    refreshInterval: 15000,
    revalidateOnFocus: true,
  });
  const groups = useMemo(
    () => (Array.isArray(groupsData?.data) ? groupsData.data : []),
    [groupsData]
  );

  const keyGroupMap = useMemo(() => buildKeyGroupMap(groups), [groups]);
  const matrix = useMemo(() => buildMatrix(initialPoolRows), [initialPoolRows]);

  const claimedCount = useMemo(
    () => (initialPoolRows || []).filter((r) => r.claimStatus === "claimed").length,
    [initialPoolRows]
  );

  const openDrawer = useCallback((info) => {
    setDrawerState({ ...info, masterPlanNo, grain });
  }, [masterPlanNo, grain]);

  const handleSaved = useCallback(async () => {
    await mutateGroups();
    setDrawerState(null);
  }, [mutateGroups]);

  // No claimed rows at all
  if (!claimedCount) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white py-10 text-center">
        <p className="text-sm font-semibold text-slate-500">ยังไม่มีวัตถุดิบที่ถูกเคลม</p>
        <p className="mt-1 text-xs text-slate-400">เคลมวัตถุดิบในส่วนด้านล่างก่อน จึงจะจัดกลุ่มใบเบิกได้</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Per-day sections */}
      {matrix.map(({ date, depts }) => (
        <div key={date} className="space-y-2">
          {/* Date header */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-600 uppercase tracking-wide">{fmtDate(date)}</span>
            <div className="flex-1 border-t border-slate-200" />
          </div>

          {/* Dept blocks */}
          {depts.map((dept) => (
            <DayDeptBlock
              key={dept.deptId}
              deptEntry={dept}
              date={date}
              groups={groups}
              keyGroupMap={keyGroupMap}
              onCreateGroup={openDrawer}
            />
          ))}
        </div>
      ))}

      {/* Export bar */}
      <ExportBar groups={groups} masterPlanNo={masterPlanNo} />

      {/* Drawer */}
      {drawerState && (
        <GroupingDrawer
          drawerState={drawerState}
          lookup27Departments={lookup27Departments}
          onClose={() => setDrawerState(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
