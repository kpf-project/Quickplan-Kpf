"use client";

// MatrixWorkspaceClient - unified matrix: claim + group + export in one view
import { useState, useMemo, useCallback, useEffect } from "react";
import useSWR from "swr";

const DAY_TH = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const MONTH_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

const fetcher = (url) => fetch(url).then((r) => r.json());

// Helpers

function parseDateHeader(dateStr) {
  if (!dateStr) return { dayName: "-", dayNum: "-", monthName: "" };
  try {
    const d = new Date(`${dateStr}T00:00:00.000Z`);
    return { dayName: DAY_TH[d.getUTCDay()], dayNum: d.getUTCDate(), monthName: MONTH_TH[d.getUTCMonth()] };
  } catch { return { dayName: "", dayNum: dateStr, monthName: "" }; }
}

function fmtDate(dateStr) {
  const { dayName, dayNum, monthName } = parseDateHeader(dateStr);
  return `${dayName} ${dayNum} ${monthName}`;
}

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

function formatSourceSkuHeader(rows = []) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const sourcePlanSummaries = Array.from(
    safeRows.reduce((map, row) => {
      (Array.isArray(row?.sourcePlanSummaries) ? row.sourcePlanSummaries : []).forEach((summary) => {
        const planId = String(summary?.planId || "").trim();
        if (!planId || map.has(planId)) return;
        map.set(planId, {
          planId,
          skuName: String(summary?.skuName || summary?.skuCode || "").trim(),
          plannedQty: Number(summary?.plannedQty) || 0,
          unit: String(summary?.unit || "").trim() || "ชุด",
        });
      });
      return map;
    }, new Map()).values()
  );
  const wipLines = Array.from(
    sourcePlanSummaries.reduce((map, summary) => {
      const key = String(summary?.skuName || summary?.skuCode || "").trim();
      if (!key) return map;
      if (!map.has(key)) {
        map.set(key, {
          name: key,
          plannedQty: 0,
        });
      }
      const target = map.get(key);
      target.plannedQty += Number(summary?.plannedQty) || 0;
      return map;
    }, new Map()).values()
  ).map((row) => ({
    ...row,
    displayQty: fmtQty(row.plannedQty) || "0",
  }));

  if (!wipLines.length) return null;

  return {
    lines: wipLines,
  };
}

function QuantityCell({ qty, statusTone = "default", trailing = null }) {
  if (!qty) return <span className="text-slate-200 text-xs">-</span>;

  const qtyToneClass =
    statusTone === "claimed"
      ? "text-emerald-700"
      : statusTone === "partial"
        ? "text-amber-700"
        : "text-slate-800";

  return (
    <div className="flex w-full max-w-full items-center overflow-hidden pl-1">
      <span className="flex h-5 w-9 shrink-0 items-center justify-start">{trailing}</span>
      <span className={`shrink-0 whitespace-nowrap text-left text-sm font-bold tabular-nums ${qtyToneClass}`}>{qty}</span>
    </div>
  );
}

function MatrixColGroup({ datesCount = 0, fitToPage = false }) {
  const safeDatesCount = Math.max(1, Number(datesCount) || 1);
  if (fitToPage) {
    const dateWidth = `${64 / safeDatesCount}%`;
    return (
      <colgroup>
        <col style={{ width: "8%" }} />
        <col style={{ width: "22%" }} />
        <col style={{ width: "6%" }} />
        {Array.from({ length: safeDatesCount }).map((_, index) => (
          <col key={`date-col-${index + 1}`} style={{ width: dateWidth }} />
        ))}
      </colgroup>
    );
  }

  return (
    <colgroup>
      <col style={{ width: "104px" }} />
      <col style={{ width: "248px" }} />
      <col style={{ width: "64px" }} />
      {Array.from({ length: safeDatesCount }).map((_, index) => (
        <col key={`date-col-${index + 1}`} style={{ width: "128px" }} />
      ))}
    </colgroup>
  );
}

// Build matrix: dates[], deptGroups[]
function buildMatrix(poolRows) {
  if (!Array.isArray(poolRows) || !poolRows.length) return { dates: [], deptGroups: [] };

  const dateSet = new Set();
  poolRows.forEach((r) => { if (r.bucketDate) dateSet.add(r.bucketDate); });
  const dates = Array.from(dateSet).sort();

  const deptMap = new Map();
  poolRows.forEach((row) => {
    const deptId = row.ownerDepartmentId || "unknown";
    if (!deptMap.has(deptId)) {
      deptMap.set(deptId, {
        deptId,
        deptName: row.ownerDepartmentName || row.ownerDepartmentCode || deptId,
        deptCode: row.ownerDepartmentCode || "",
        materialMap: new Map(),
      });
    }
    const dept = deptMap.get(deptId);
    const matCode = row.materialGoodsCode || row.materialSkuCode || "";
    const section = row.demandSource === "subplan_raw" ? "wip" : "fg";
    const matKey = `${section}|${matCode}`;
    if (!dept.materialMap.has(matKey)) {
      dept.materialMap.set(matKey, {
        matCode, matSkuCode: row.materialSkuCode || matCode,
        matName: row.materialName || matCode, unit: row.unit || "", section, byDate: {},
      });
    }
    const mat = dept.materialMap.get(matKey);
    if (row.bucketDate) {
      const ex = mat.byDate[row.bucketDate];
      const qty = Number(row.issueQty ?? row.requiredQty ?? 0);
      mat.byDate[row.bucketDate] = {
        qty: (ex?.qty ?? 0) + qty,
        claimed: row.claimStatus === "claimed",
        allClaimed: (ex?.allClaimed ?? true) && row.claimStatus === "claimed",
        sourceRowKey: row.sourceRowKey,
      };
    }
  });

  const deptGroups = Array.from(deptMap.values()).map((dept) => {
    const all = Array.from(dept.materialMap.values());
    return {
      ...dept,
      wipMaterials: all.filter((m) => m.section === "wip").sort((a, b) => a.matName.localeCompare(b.matName, "th")),
      fgMaterials: all.filter((m) => m.section === "fg").sort((a, b) => a.matName.localeCompare(b.matName, "th")),
    };
  }).sort((a, b) => (a.deptCode || a.deptName).localeCompare(b.deptCode || b.deptName, "th"));

  return { dates, deptGroups };
}

// Per date + dept: count of claimed/unclaimed pool rows
function getDayDeptStats(poolRows, date, deptId) {
  const rows = poolRows.filter((r) => r.bucketDate === date && r.ownerDepartmentId === deptId);
  const claimed = rows.filter((r) => r.claimStatus === "claimed");
  return { total: rows.length, claimed: claimed.length, unclaimed: rows.length - claimed.length };
}

// Rows for a given date+dept that are claimed but not in any active group
function getUngroupedClaimedRows(poolRows, groupItemKeys, date, deptId) {
  return poolRows.filter(
    (r) =>
      r.bucketDate === date &&
      r.ownerDepartmentId === deptId &&
      r.claimStatus === "claimed" &&
      !groupItemKeys.has(r.sourceRowKey)
  );
}

// Build sourceRowKey -> group map from groups list
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

function buildClaimedAdjustmentRows(poolRows, keyGroupMap, claimDeptId = "") {
  const normalizedClaimDeptId = String(claimDeptId || "").trim();
  const rows = Array.isArray(poolRows) ? poolRows : [];

  return rows
    .filter((row) => {
      if (!normalizedClaimDeptId) return true;
      return String(row.claimDepartmentId || "").trim() === normalizedClaimDeptId;
    })
    .map((row) => {
      const sourceRowKey = String(row.sourceRowKey || "").trim();
      const group = keyGroupMap.get(sourceRowKey) || null;
      const replacementOptions = rows
        .filter((candidate) => {
          const candidateKey = String(candidate.sourceRowKey || "").trim();
          const sameSlot =
            candidate.bucketDate === row.bucketDate
            && String(candidate.ownerDepartmentId || "").trim() === String(row.ownerDepartmentId || "").trim()
            && String(candidate.demandSource || "").trim() === String(row.demandSource || "").trim();
          if (!sameSlot) return false;
          if (candidateKey === sourceRowKey) return true;
          if (keyGroupMap.has(candidateKey)) return false;
          return candidate.claimStatus !== "claimed";
        })
        .sort((left, right) => {
          const sectionCompare = String(left.demandSource || "").localeCompare(String(right.demandSource || ""));
          if (sectionCompare !== 0) return sectionCompare;
          return String(left.materialName || left.materialGoodsCode || "").localeCompare(
            String(right.materialName || right.materialGoodsCode || ""),
            "th"
          );
        })
        .map((candidate) => ({
          sourceRowKey: String(candidate.sourceRowKey || "").trim(),
          materialSkuCode: candidate.materialSkuCode,
          materialGoodsCode: candidate.materialGoodsCode || candidate.materialSkuCode,
          materialName: candidate.materialName || candidate.materialGoodsCode || candidate.materialSkuCode,
          unit: candidate.unit || row.unit || "",
          demandIssueQty: Number(candidate.demandIssueQty ?? candidate.issueQty ?? candidate.requiredQty ?? 0),
        }));

      return {
        ...row,
        sectionLabel: row.demandSource === "fg_direct" ? "FG Direct" : "WIP/Subplan",
        sourceRowKey,
        isLocked: Boolean(group) || row.claimStatus === "claimed",
        lockReason:
          row.claimStatus === "claimed"
            ? "เคลมแล้ว"
            : group
              ? `อยู่ใน${group.group_name || "ใบเบิก"}แล้ว`
              : "",
        replacementOptions,
        nextSourceRowKey: sourceRowKey,
        nextIssueQty: String(Number(row.issueQty || 0)),
      };
    })
    .sort((left, right) => {
      const dateCompare = String(left.bucketDate || "").localeCompare(String(right.bucketDate || ""));
      if (dateCompare !== 0) return dateCompare;
      const deptCompare = String(left.ownerDepartmentCode || left.ownerDepartmentName || "").localeCompare(
        String(right.ownerDepartmentCode || right.ownerDepartmentName || ""),
        "th"
      );
      if (deptCompare !== 0) return deptCompare;
      return String(left.materialName || left.materialGoodsCode || "").localeCompare(
        String(right.materialName || right.materialGoodsCode || ""),
        "th"
      );
    });
}

// Status Badge

function GroupStatusBadge({ status }) {
  if (status === "exported") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">
      <span className="h-1 w-1 rounded-full bg-slate-400" /> exported
    </span>
  );
  if (status === "ready_to_export") return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">
      <span className="h-1 w-1 rounded-full bg-emerald-500" /> พร้อม export
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">
      <span className="h-1 w-1 rounded-full bg-amber-400" /> draft
    </span>
  );
}

function ClaimAdjustmentsBar({ totalRows = 0, editableRows = 0, lockedRows = 0, onOpen }) {
  if (!totalRows) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[#102C57]/12 bg-white px-5 py-4 shadow-sm">
      <div className="space-y-1">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#102C57]/70">จัดการรายการเคลมแล้ว</div>
        <div className="text-sm font-semibold text-slate-800">แก้จำนวนของรายการที่ยังไม่เคลมแบบแยกจากตารางหลัก</div>
        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
          <span>ทั้งหมด {totalRows} รายการ</span>
          <span>แก้ไขได้ {editableRows} รายการ</span>
          {lockedRows > 0 && <span>ติดใบเบิกแล้ว {lockedRows} รายการ</span>}
        </div>
      </div>
      <button
        type="button"
        onClick={onOpen}
        className="rounded-xl bg-[#102C57] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[#1a3d6b]"
      >
        จัดการจำนวนที่ยังไม่เคลม
      </button>
    </div>
  );
}

function ClaimMaterialPickerDrawer({
  isOpen,
  options = [],
  title = "",
  onClose,
  onSelect,
}) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredOptions = useMemo(() => {
    const normalized = String(searchTerm || "").trim().toLowerCase();
    if (!normalized) return options;
    return options.filter((option) =>
      String(option?.materialName || "").toLowerCase().includes(normalized)
      || String(option?.materialGoodsCode || "").toLowerCase().includes(normalized)
      || String(option?.materialSkuCode || "").toLowerCase().includes(normalized)
    );
  }, [options, searchTerm]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-300">
        <div className="border-b border-gray-100 bg-[#102C57] px-5 py-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f2d68a]">Material Picker</div>
              <div className="mt-1 text-lg font-bold">เลือกวัตถุดิบ</div>
              <div className="mt-1 text-xs text-white/70">{title || "รายการนี้ถูกล็อกไว้สำหรับข้อมูลที่เคลมแล้ว"}</div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/15"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="border-b border-slate-200 bg-slate-50 px-4 py-4">
          <div className="relative">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="7" />
              <path strokeLinecap="round" strokeLinejoin="round" d="m20 20-3.5-3.5" />
            </svg>
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="ค้นหารหัสหรือชื่อวัตถุดิบ"
              className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-700 outline-none focus:border-[#102C57]"
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="grid gap-2">
            {filteredOptions.map((option) => (
              <button
                key={option.sourceRowKey}
                type="button"
                onClick={() => onSelect(option)}
                className="rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-[#102C57]/25 hover:bg-slate-50"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-slate-800">{option.materialName || option.materialGoodsCode || option.materialSkuCode}</div>
                    <div className="mt-1 text-[11px] font-mono text-slate-400">{option.materialGoodsCode || option.materialSkuCode}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold text-[#102C57]">{fmtQty(option.demandIssueQty) || "-"}</div>
                    <div className="text-[11px] text-slate-500">{option.unit || "-"}</div>
                  </div>
                </div>
              </button>
            ))}
            {!filteredOptions.length && (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                ไม่พบวัตถุดิบที่ตรงกับคำค้น
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ClaimAdjustmentsModal({
  state,
  saving = false,
  onClose,
  onChange,
  onSave,
}) {
  if (!state) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
      <div className="absolute inset-0" onClick={saving ? undefined : onClose} />
      <div className="relative z-10 flex max-h-[88vh] w-full max-w-7xl flex-col overflow-hidden rounded-2xl border border-[#102C57]/15 bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-5 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#102C57]">จัดการจำนวนที่ยังไม่เคลม</div>
          <div className="mt-1 text-base font-bold text-slate-900">แก้จำนวนรายวันของรายการที่ยังไม่ถูกเคลม</div>
          <div className="mt-1 text-xs text-slate-500">รายการที่เคลมแล้วหรือถูกนำไปจัดใบเบิกแล้วจะล็อกแก้ไขอัตโนมัติ</div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
          <table className="w-full min-w-[1260px] text-left text-xs">
            <thead className="bg-slate-50 text-[11px] text-slate-600">
              <tr>
                <th className="px-3 py-2">วันที่</th>
                <th className="px-3 py-2">แผนกเจ้าของ</th>
                <th className="px-3 py-2">รายการเดิม</th>
                <th className="px-3 py-2">รายการสินค้า</th>
                <th className="px-3 py-2 text-right">จำนวนเดิม</th>
                <th className="px-3 py-2 text-right">จำนวนที่เบิก</th>
                <th className="px-3 py-2">หน่วย</th>
                <th className="px-3 py-2">สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {state.rows.map((row) => {
                const selectedOption =
                  row.replacementOptions.find((option) => option.sourceRowKey === row.nextSourceRowKey)
                  || row.replacementOptions[0]
                  || null;

                return (
                  <tr key={row.sourceRowKey} className="border-b border-slate-100 align-top">
                    <td className="px-3 py-3 text-slate-600">{formatShortThaiDate(row.bucketDate)}</td>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-slate-700">{row.ownerDepartmentName || row.ownerDepartmentCode || "-"}</div>
                      <div className="text-[11px] text-slate-400">{row.sectionLabel}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="font-semibold text-slate-800">{row.materialName || row.materialGoodsCode || row.materialSkuCode}</div>
                      <div className="text-[11px] text-slate-400">{row.materialGoodsCode || row.materialSkuCode}</div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="min-w-[280px] rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                        <div className="truncate font-semibold text-slate-700">{selectedOption?.materialName || row.materialName || "-"}</div>
                        <div className="mt-0.5 text-[11px] text-slate-400">{selectedOption?.materialGoodsCode || selectedOption?.materialSkuCode || row.materialGoodsCode || row.materialSkuCode || "-"}</div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-semibold text-slate-500">{fmtQty(row.demandIssueQty) || "-"}</td>
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={row.nextIssueQty}
                        disabled={saving || row.isLocked}
                        onChange={(event) => onChange(row.sourceRowKey, "nextIssueQty", event.target.value)}
                        className="w-28 rounded-lg border border-slate-300 px-3 py-2 text-right text-sm text-slate-800 focus:border-[#102C57] focus:outline-none focus:ring-1 focus:ring-[#102C57]/20 disabled:cursor-not-allowed disabled:bg-slate-100"
                      />
                    </td>
                    <td className="px-3 py-3 text-slate-600">{selectedOption?.unit || row.unit || "-"}</td>
                    <td className="px-3 py-3">
                      {row.claimStatus === "claimed" ? (
                        <span className="inline-flex rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                          เคลมแล้ว
                        </span>
                      ) : row.isLocked ? (
                        <span className="inline-flex rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-500">
                          {row.lockReason}
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                          พร้อมแก้ไข
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-5 py-4">
          <div className="text-xs text-slate-500">แก้ได้เฉพาะแถวที่ยังไม่เคลมและยังไม่ถูกจัดลงใบเบิก</div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              ปิด
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="rounded-lg bg-[#102C57] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? "กำลังบันทึก..." : "บันทึกการเปลี่ยนแปลง"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Grouping Drawer

function GroupingDrawer({ drawerState, lookup27Departments, onClose, onSaved }) {
  const [ticked, setTicked] = useState(() => new Set());
  const [groupName, setGroupName] = useState("");
  const [deptCode, setDeptCode] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { date, deptId, deptName, ungroupedRows, masterPlanNo, grain } = drawerState;

  // Pattern memory
  const { data: patternData } = useSWR(
    deptId ? `/api/production-planning/requisition/patterns?ownerDepartmentId=${encodeURIComponent(deptId)}` : null,
    fetcher, { revalidateOnFocus: false }
  );
  const patterns = useMemo(() => (Array.isArray(patternData?.data) ? patternData.data : []), [patternData]);

  const patternMap = useMemo(() => {
    const map = new Map();
    patterns.forEach(({ groupName: gn, materialGoodsCodes }) => {
      (materialGoodsCodes || []).forEach((code) => { if (!map.has(code)) map.set(code, gn); });
    });
    return map;
  }, [patterns]);

  const activeSuggestions = useMemo(() =>
    patterns.filter((s) =>
      (s.materialGoodsCodes || []).some((code) =>
        ungroupedRows.some((r) => (r.materialGoodsCode || r.materialSkuCode) === code)
      )
    ), [patterns, ungroupedRows]
  );

  const knownRows = ungroupedRows.filter((r) => patternMap.has(r.materialGoodsCode || r.materialSkuCode));
  const newRows = ungroupedRows.filter((r) => !patternMap.has(r.materialGoodsCode || r.materialSkuCode));

  // Reset state when drawer opens for a new context
  useEffect(() => {
    setTicked(new Set());
    setGroupName("");
    setDeptCode("");
    setError("");
  }, [date, deptId]);

  const toggleAll = () => {
    if (ticked.size === ungroupedRows.length) setTicked(new Set());
    else setTicked(new Set(ungroupedRows.map((r) => r.sourceRowKey)));
  };

  const toggleRow = (key) => setTicked((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const applyPattern = (suggestion) => {
    const codeSet = new Set(suggestion.materialGoodsCodes || []);
    const keys = ungroupedRows.filter((r) => codeSet.has(r.materialGoodsCode || r.materialSkuCode)).map((r) => r.sourceRowKey);
    setTicked(new Set(keys));
    setGroupName(suggestion.groupName);
  };

  const handleSave = async () => {
    if (ticked.size === 0) { setError("กรุณาเลือกรายการอย่างน้อย 1 รายการ"); return; }
    setSaving(true); setError("");
    try {
      const selectedKeys = ungroupedRows.filter((r) => ticked.has(r.sourceRowKey)).map((r) => r.sourceRowKey);
      const res = await fetch("/api/production-planning/requisition/groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterPlanNo, grain, dateFrom: date, dateTo: date,
          sourceRowKeys: selectedKeys, groupName: groupName.trim() || null,
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

  const MatRow = ({ row }) => {
    const isChecked = ticked.has(row.sourceRowKey);
    const suggestedGroup = patternMap.get(row.materialGoodsCode || row.materialSkuCode);
    return (
      <label className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${isChecked ? "border-[#102C57]/30 bg-[#102C57]/5" : "border-slate-100 bg-white hover:bg-slate-50"}`}>
        <input type="checkbox" checked={isChecked} onChange={() => toggleRow(row.sourceRowKey)}
          className="h-4 w-4 rounded border-slate-300 accent-[#102C57]" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-semibold text-slate-800 truncate">
              {row.materialName || row.materialGoodsCode || row.materialSkuCode}
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[10px] text-slate-400 font-mono">{row.materialGoodsCode || row.materialSkuCode}</span>
            {suggestedGroup && (
              <span className="rounded-full bg-amber-50 border border-amber-200 px-1.5 text-[9px] font-semibold text-amber-600">
                {suggestedGroup}
              </span>
            )}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-sm font-bold text-slate-700 tabular-nums">{fmtQty(row.issueQty) || "-"}</div>
          {row.unit && <div className="text-[10px] text-slate-400">{row.unit}</div>}
        </div>
      </label>
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]" onClick={onClose} />
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between bg-[#102C57] px-5 py-4">
          <div>
            <p className="text-[11px] font-semibold text-white/60 uppercase tracking-wide">สร้างใบเบิก</p>
            <h3 className="text-sm font-bold text-white mt-0.5">{fmtDate(date)} - {deptName}</h3>
          </div>
          <button onClick={onClose} className="rounded-full p-1.5 hover:bg-white/10">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Pattern suggestions */}
        {activeSuggestions.length > 0 && (
          <div className="border-b border-amber-100 bg-amber-50 px-5 py-3">
            <p className="mb-2 text-[11px] font-semibold text-amber-700 uppercase tracking-wide">แนะนำจากรูปแบบเก่าที่หาได้</p>
            <div className="flex flex-wrap gap-2">
              {activeSuggestions.map((s) => {
                const n = (s.materialGoodsCodes || []).filter((code) =>
                  ungroupedRows.some((r) => (r.materialGoodsCode || r.materialSkuCode) === code)
                ).length;
                return (
                  <button key={s.groupName} type="button" onClick={() => applyPattern(s)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-white px-3 py-1 text-[11px] font-semibold text-amber-800 hover:bg-amber-100 transition-colors">
                    ใช้ {s.groupName}
                    <span className="rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-700">{n}</span>
                  </button>
                );
              })}
            </div>
            <p className="mt-1.5 text-[10px] text-amber-600">กดเพื่อเลือกรูปแบบเดิม แล้วแก้ไขก่อนบันทึกได้</p>
          </div>
        )}

        {/* Form */}
        <div className="border-b border-slate-100 bg-slate-50 px-5 py-3 space-y-2.5">
          <div>
            <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">ชื่อใบเบิก (ถ้ามีหลายฉบับ)</label>
            <input value={groupName} onChange={(e) => setGroupName(e.target.value)}
              placeholder="เช่น ใบเบิกบรรจุ, ใบเบิกวัตถุดิบหลัก"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-300 focus:border-[#102C57] focus:outline-none focus:ring-1 focus:ring-[#102C57]" />
          </div>
          {lookup27Departments?.length > 0 && (
            <div>
              <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">รหัสแผนกใน ERP</label>
              <select value={deptCode} onChange={(e) => setDeptCode(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-[#102C57] focus:outline-none focus:ring-1 focus:ring-[#102C57]">
                <option value="">- ไม่ระบุ -</option>
                {lookup27Departments.map((d) => (
                  <option key={d.code} value={d.code}>{d.code} - {d.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Material list */}
        <div className="flex-1 overflow-y-auto px-5 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
              วัตถุดิบที่ยังไม่ถูกจัดใบเบิก ({ungroupedRows.length})
            </span>
            <button onClick={toggleAll} className="text-[11px] font-semibold text-[#102C57] hover:underline">
              {ticked.size === ungroupedRows.length ? "ยกเลิกทั้งหมด" : "เลือกทั้งหมด"}
            </button>
          </div>
          <div className="space-y-1">
            {knownRows.map((row) => <MatRow key={row.sourceRowKey} row={row} />)}
            {newRows.length > 0 && (
              <>
                {knownRows.length > 0 && (
                  <div className="flex items-center gap-2 py-1.5">
                    <div className="flex-1 border-t border-dashed border-slate-200" />
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">วัตถุดิบใหม่</span>
                    <div className="flex-1 border-t border-dashed border-slate-200" />
                  </div>
                )}
                {newRows.map((row) => {
                  const isChecked = ticked.has(row.sourceRowKey);
                  return (
                    <label key={row.sourceRowKey} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${isChecked ? "border-[#102C57]/30 bg-[#102C57]/5" : "border-dashed border-slate-200 bg-white hover:bg-slate-50"}`}>
                      <input type="checkbox" checked={isChecked} onChange={() => toggleRow(row.sourceRowKey)}
                        className="h-4 w-4 rounded border-slate-300 accent-[#102C57]" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-slate-800 truncate">
                            {row.materialName || row.materialGoodsCode || row.materialSkuCode}
                          </span>
                          <span className="shrink-0 rounded-full bg-sky-50 border border-sky-200 px-1.5 text-[9px] font-semibold text-sky-600">ใหม่</span>
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono mt-0.5">{row.materialGoodsCode || row.materialSkuCode}</div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-sm font-bold text-slate-700 tabular-nums">{fmtQty(row.issueQty) || "-"}</div>
                        {row.unit && <div className="text-[10px] text-slate-400">{row.unit}</div>}
                      </div>
                    </label>
                  );
                })}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-100 bg-slate-50 px-5 py-3">
          {error && <p className="mb-2 rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600">{error}</p>}
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-slate-500">
              เลือกแล้ว <strong>{ticked.size}</strong> / {ungroupedRows.length}
            </span>
            <div className="flex items-center gap-2">
              <button onClick={onClose} disabled={saving}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">
                ยกเลิก
              </button>
              <button onClick={handleSave} disabled={saving || ticked.size === 0}
                className="rounded-lg bg-[#102C57] px-4 py-2 text-sm font-semibold text-white hover:bg-[#102C57]/90 disabled:opacity-50 disabled:cursor-not-allowed">
                {saving ? "กำลังบันทึก..." : "บันทึกใบเบิก"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// Group Action Buttons

function GroupActions({ group, onMutate }) {
  const [pending, setPending] = useState(false);

  const doAction = async (action) => {
    if (action === "delete" && !confirm("ลบใบเบิกนี้?")) return;
    setPending(true);
    const res = await fetch(`/api/production-planning/requisition/groups/${group.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error || "เกิดข้อผิดพลาด");
    }
    setPending(false);
    onMutate();
  };

  const isReady = group.status === "ready_to_export";
  const isExported = group.status === "exported";

  return (
    <div className="flex items-center gap-1">
      {!isReady && !isExported && (
        <button onClick={() => doAction("confirm")} disabled={pending}
          className="rounded px-2 py-0.5 text-[10px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">
          ยืนยัน
        </button>
      )}
      {isReady && (
        <button onClick={() => doAction("reopen")} disabled={pending}
          className="rounded border border-slate-300 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50">
          แก้ไข
        </button>
      )}
      {!isExported && (
        <button onClick={() => doAction("delete")} disabled={pending}
          className="rounded border border-red-200 px-2 py-0.5 text-[10px] font-semibold text-red-500 hover:bg-red-50 disabled:opacity-50">
          ลบ
        </button>
      )}
    </div>
  );
}

// Dept Table

function DeptTable({ dept, dates, poolRows, keyGroupMap, groups, claimDeptId, pendingClaimKey, onClaimDay, onOpenDrawer, onMutateGroups, selectedCellKeys, onToggleCell, releasingKeys, onReleaseCell, onEditMaterialRow }) {
  const today = new Date().toISOString().slice(0, 10);
  const isMatRowPast = (mat) => {
    const datesWithData = dates.filter((date) => mat.byDate[date]);
    return datesWithData.length > 0 && datesWithData.every((date) => date < today);
  };
  const hasWip = dept.wipMaterials.some((mat) => !isMatRowPast(mat));
  const hasFg = dept.fgMaterials.some((mat) => !isMatRowPast(mat));
  if (!hasWip && !hasFg) return null;
  const colSpan = dates.length + 3;
  const fitToPage = true;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Dept header bar */}
      <div className="flex items-center justify-between bg-[#102C57] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white">{dept.deptName}</span>
          {dept.deptCode && (
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white/80">{dept.deptCode}</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-white/60">
          {hasWip && <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" />WIP {dept.wipMaterials.filter((mat) => !isMatRowPast(mat)).length}</span>}
          {hasFg && <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-sky-400" />FG {dept.fgMaterials.filter((mat) => !isMatRowPast(mat)).length}</span>}
        </div>
      </div>

      <div className="w-full overflow-x-hidden">
        <table className="w-full table-fixed border-collapse">
          <MatrixColGroup datesCount={dates.length} fitToPage={fitToPage} />
          <thead>
            {/* Row 1: date + claim */}
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="sticky left-0 z-20 border-r border-slate-900/40 bg-slate-50 px-2 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                รหัสสินค้า
              </th>
              <th className="sticky left-[104px] z-20 border-r border-slate-900/40 bg-slate-50 px-2 py-2.5 text-left text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                ชื่อสินค้า
              </th>
              <th className="sticky left-[352px] z-20 border-r border-slate-900/40 bg-slate-50 px-1 py-2.5 text-center text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
                หน่วย
              </th>
              {dates.map((dateStr) => {
                const claimKey = `${dateStr}|${dept.deptId}`;
                const isPending = pendingClaimKey === claimKey;
                const stats = getDayDeptStats(poolRows, dateStr, dept.deptId);
                const allClaimed = stats.total > 0 && stats.unclaimed === 0;
                const sourceSkuHeader = formatSourceSkuHeader(
                  poolRows.filter(
                    (row) =>
                      row.bucketDate === dateStr
                      && row.ownerDepartmentId === dept.deptId
                      && row.demandSource === "subplan_raw"
                  )
                );

                return (
                  <th key={dateStr} className="border-l border-slate-900/40 px-1 py-1.5 text-center">
                    <div className="flex flex-col items-center gap-1.5">
                      <span className="text-[12px] font-bold text-slate-700 leading-tight">{formatShortThaiDate(dateStr)}</span>
                      {sourceSkuHeader ? (
                        <div className="w-full space-y-0.5 text-center text-[9px] leading-tight text-emerald-700">
                          {sourceSkuHeader.lines.map((line) => (
                            <div key={`${dateStr}-${dept.deptId}-${line.name}`} className="whitespace-nowrap">
                              <span className="font-medium">{line.name}</span>{" "}
                              <span className="text-[9px] font-semibold text-emerald-500">{line.displayQty}</span>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      {stats.total > 0 && (
                        allClaimed ? (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-semibold text-emerald-700">
                            <span className="h-1 w-1 rounded-full bg-emerald-500" />เคลมครบ
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={isPending || !claimDeptId}
                            onClick={() => onClaimDay(dateStr, dept.deptId)}
                            title={!claimDeptId ? "เลือกแผนกรับสิทธิ์ก่อน" : `เคลม ${stats.unclaimed} รายการ`}
                            className={`rounded-md px-2 py-0.5 text-[10px] font-semibold transition-colors mt-0.5 ${
                              isPending ? "bg-slate-100 text-slate-400 cursor-wait"
                              : !claimDeptId ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                              : "bg-[#102C57] text-white hover:bg-[#1a3d6b]"
                            }`}
                          >
                            {isPending ? "กำลังเคลม..." : `เคลม ${stats.unclaimed}`}
                          </button>
                        )
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {/* WIP section */}
            {hasWip && (
              <>
                <tr className="border-y bg-amber-50 border-amber-200">
                  <td colSpan={colSpan} className="sticky left-0 bg-amber-50 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-amber-800">
                    WIP - วัตถุดิบกึ่งสำเร็จรูป
                  </td>
                </tr>
                {dept.wipMaterials.map((mat, i) => (
                  (() => {
                    if (isMatRowPast(mat)) return null;
                    const hasEditableRow = dates.some((date) => {
                      const cell = mat.byDate[date];
                      return cell && !cell.allClaimed;
                    });
                    return (
                  <tr key={mat.matCode} className={`border-b border-slate-300 hover:bg-slate-50/70 group ${i % 2 === 0 ? "bg-white" : "bg-slate-50/30"}`}>
                    <td className={`sticky left-0 z-10 border-b border-slate-300 border-r border-slate-900/40 px-2 py-2 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/30"} group-hover:bg-slate-50/70`}>
                      <div className="whitespace-nowrap text-[11px] font-semibold text-slate-800 font-mono" title={mat.matCode}>{mat.matCode}</div>
                    </td>
                    <td className={`sticky left-[104px] z-10 border-b border-slate-300 border-r border-slate-900/40 px-2 py-2 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/30"} group-hover:bg-slate-50/70`}>
                      <div className="flex items-center gap-1.5">
                        <div className="whitespace-nowrap text-[11px] font-semibold text-slate-800" title={mat.matName}>{mat.matName}</div>
                        {hasEditableRow ? (
                          <button
                            type="button"
                            onClick={() => onEditMaterialRow({ dept, material: mat })}
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:border-[#102C57]/30 hover:text-[#102C57]"
                            title="แก้รายการในแถวนี้"
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 20h9" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                            </svg>
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td className={`sticky left-[352px] z-10 border-b border-slate-300 border-r border-slate-900/40 px-1 py-2 text-center ${i % 2 === 0 ? "bg-white" : "bg-slate-50/30"} group-hover:bg-slate-50/70`}>
                      <div className="whitespace-nowrap text-[11px] font-semibold text-slate-700" title={mat.unit}>{mat.unit || "-"}</div>
                    </td>
                    {dates.map((date) => {
                      const cell = mat.byDate[date] || null;
                      const qty = fmtQty(cell?.qty);
                      const isSelected = cell?.sourceRowKey && selectedCellKeys?.has(cell.sourceRowKey);
                      const isReleasing = cell?.sourceRowKey && releasingKeys?.has(cell.sourceRowKey);
                      return (
                        <td key={date} className={`overflow-hidden border-b border-slate-300 px-2 py-2.5 text-left border-l border-slate-900/40 ${cell?.allClaimed ? "bg-emerald-50/40" : isSelected ? "bg-amber-50" : ""}`}>
                          <QuantityCell
                            qty={qty}
                            statusTone={cell?.allClaimed ? "claimed" : "default"}
                            trailing={
                              cell?.allClaimed && cell?.sourceRowKey ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    disabled={!!isReleasing}
                                    onClick={() => onReleaseCell(cell.sourceRowKey)}
                                    className="rounded border border-emerald-300 px-1.5 py-0.5 text-[9px] font-semibold leading-tight text-emerald-600 hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-40"
                                    title="คืนสิทธิ์การเคลม"
                                  >
                                    {isReleasing ? "..." : "คืน"}
                                  </button>
                                </div>
                              ) : !cell?.allClaimed && cell?.sourceRowKey && claimDeptId ? (
                                <input
                                  type="checkbox"
                                  checked={!!isSelected}
                                  onChange={() => onToggleCell(cell.sourceRowKey)}
                                  className="h-3.5 w-3.5 rounded border-amber-300 accent-amber-600 cursor-pointer"
                                  title="เลือกเพื่อเคลม"
                                />
                              ) : null
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                    );
                  })()
                ))}
              </>
            )}

            {/* FG section */}
            {hasFg && (
              <>
                <tr className="border-y bg-sky-50 border-sky-200">
                  <td colSpan={colSpan} className="sticky left-0 bg-sky-50 px-4 py-1.5 text-[11px] font-bold uppercase tracking-widest text-sky-800">
                    FG / แพ็ค - วัตถุดิบบรรจุ
                  </td>
                </tr>
                {dept.fgMaterials.map((mat, i) => (
                  (() => {
                    if (isMatRowPast(mat)) return null;
                    const hasEditableRow = dates.some((date) => {
                      const cell = mat.byDate[date];
                      return cell && !cell.allClaimed;
                    });
                    return (
                  <tr key={mat.matCode} className={`border-b border-slate-300 hover:bg-slate-50/70 group ${i % 2 === 0 ? "bg-white" : "bg-slate-50/30"}`}>
                    <td className={`sticky left-0 z-10 border-b border-slate-300 border-r border-slate-900/40 px-2 py-2 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/30"} group-hover:bg-slate-50/70`}>
                      <div className="whitespace-nowrap text-[11px] font-semibold text-slate-800 font-mono" title={mat.matCode}>{mat.matCode}</div>
                    </td>
                    <td className={`sticky left-[104px] z-10 border-b border-slate-300 border-r border-slate-900/40 px-2 py-2 ${i % 2 === 0 ? "bg-white" : "bg-slate-50/30"} group-hover:bg-slate-50/70`}>
                      <div className="flex items-center gap-1.5">
                        <div className="whitespace-nowrap text-[11px] font-semibold text-slate-800" title={mat.matName}>{mat.matName}</div>
                        {hasEditableRow ? (
                          <button
                            type="button"
                            onClick={() => onEditMaterialRow({ dept, material: mat })}
                            className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 transition-colors hover:border-[#102C57]/30 hover:text-[#102C57]"
                            title="แก้รายการในแถวนี้"
                          >
                            <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 20h9" />
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
                            </svg>
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td className={`sticky left-[352px] z-10 border-b border-slate-300 border-r border-slate-900/40 px-1 py-2 text-center ${i % 2 === 0 ? "bg-white" : "bg-slate-50/30"} group-hover:bg-slate-50/70`}>
                      <div className="whitespace-nowrap text-[11px] font-semibold text-slate-700" title={mat.unit}>{mat.unit || "-"}</div>
                    </td>
                    {dates.map((date) => {
                      const cell = mat.byDate[date] || null;
                      const qty = fmtQty(cell?.qty);
                      const isSelected = cell?.sourceRowKey && selectedCellKeys?.has(cell.sourceRowKey);
                      const isReleasing = cell?.sourceRowKey && releasingKeys?.has(cell.sourceRowKey);
                      return (
                        <td key={date} className={`overflow-hidden border-b border-slate-300 px-2 py-2.5 text-left border-l border-slate-900/40 ${cell?.allClaimed ? "bg-emerald-50/40" : isSelected ? "bg-sky-50" : ""}`}>
                          <QuantityCell
                            qty={qty}
                            statusTone={cell?.allClaimed ? "claimed" : "default"}
                            trailing={
                              cell?.allClaimed && cell?.sourceRowKey ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    disabled={!!isReleasing}
                                    onClick={() => onReleaseCell(cell.sourceRowKey)}
                                    className="rounded border border-emerald-300 px-1.5 py-0.5 text-[9px] font-semibold leading-tight text-emerald-600 hover:bg-emerald-100 disabled:cursor-wait disabled:opacity-40"
                                    title="คืนสิทธิ์การเคลม"
                                  >
                                    {isReleasing ? "..." : "คืน"}
                                  </button>
                                </div>
                              ) : !cell?.allClaimed && cell?.sourceRowKey && claimDeptId ? (
                                <input
                                  type="checkbox"
                                  checked={!!isSelected}
                                  onChange={() => onToggleCell(cell.sourceRowKey)}
                                  className="h-3.5 w-3.5 rounded border-sky-300 accent-sky-600 cursor-pointer"
                                  title="เลือกเพื่อเคลม"
                                />
                              ) : null
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                    );
                  })()
                ))}
              </>
            )}

            {/* Requisition group row - per date */}
            <tr className="border-t-2 border-slate-200 bg-slate-50/80">
              <td colSpan={3} className="sticky left-0 bg-slate-50/80 px-4 py-2 text-[11px] font-bold text-slate-500 uppercase tracking-wide">
                ใบเบิก
              </td>
              {dates.map((dateStr) => {
                const stats = getDayDeptStats(poolRows, dateStr, dept.deptId);
                const ungrouped = getUngroupedClaimedRows(poolRows, new Set(keyGroupMap.keys()), dateStr, dept.deptId);

                // Groups that have items for this date+dept
                const dayGroups = groups.filter((g) =>
                  (g.items || []).some((item) => {
                    const row = poolRows.find((r) => r.sourceRowKey === item.source_row_key);
                    return row?.bucketDate === dateStr && row?.ownerDepartmentId === dept.deptId;
                  })
                );

                return (
                  <td key={dateStr} className="border-b border-slate-300 px-2 py-2 border-l border-slate-900/40 align-top">
                    <div className="flex flex-col gap-1 items-start">
                      {/* Existing group cards */}
                      {dayGroups.map((g) => (
                        <div key={g.id} className="w-full rounded-lg border bg-white px-2 py-1.5 space-y-1">
                          <div className="flex items-center justify-between gap-1">
                            <div className="min-w-0">
                              <div className="text-[11px] font-semibold text-slate-700 truncate">
                                {g.group_name || "ใบเบิก"}
                              </div>
                              <div className="flex items-center gap-1 mt-0.5">
                                <GroupStatusBadge status={g.status} />
                                <span className="text-[9px] text-slate-400">{g.itemCount} รายการ</span>
                              </div>
                            </div>
                          </div>
                          {g.status !== "exported" && (
                            <GroupActions group={g} onMutate={onMutateGroups} />
                          )}
                        </div>
                      ))}

                      {/* Add group button (if there are claimed but ungrouped rows) */}
                      {stats.claimed > 0 && ungrouped.length > 0 && (
                        <button
                          type="button"
                          onClick={() => onOpenDrawer({ date: dateStr, deptId: dept.deptId, deptName: dept.deptName, deptCode: dept.deptCode, ungroupedRows: ungrouped })}
                          className="inline-flex items-center gap-1 rounded-lg border border-dashed border-[#102C57]/30 px-2.5 py-1 text-[11px] font-semibold text-[#102C57] hover:bg-[#102C57]/5 transition-colors w-full justify-center"
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                          </svg>
                          ใบเบิก ({ungrouped.length})
                        </button>
                      )}

                      {/* Not claimed yet */}
                      {stats.total > 0 && stats.claimed === 0 && (
                        <span className="text-[10px] text-slate-300">รอเคลม</span>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// Export Bar

function ExportBar({ groups, masterPlanNo, onMutateGroups }) {
  const [exporting, setExporting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const readyGroups = useMemo(() => (groups || []).filter((g) => g.status === "ready_to_export"), [groups]);
  const exportedGroups = useMemo(() => (groups || []).filter((g) => g.status === "exported"), [groups]);

  if (!groups?.length) return null;

  const handleExport = async () => {
    const ids = readyGroups.map((g) => g.id);
    if (!ids.length) return;
    setExporting(true);
    try {
      const res = await fetch("/api/production-planning/requisition/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupIds: ids, masterPlanNo }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || "Export ไม่สำเร็จ");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `requisition-${masterPlanNo}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="sticky bottom-0 z-30 rounded-xl border border-slate-200 bg-white shadow-lg overflow-hidden">
      {/* Group list panel */}
      {expanded && (
        <div className="border-b border-slate-100 max-h-64 overflow-y-auto">
          {groups.map((g) => (
            <div key={g.id} className="flex items-center justify-between gap-3 px-5 py-2.5 border-b border-slate-50 last:border-0 hover:bg-slate-50">
              <div className="flex items-center gap-2 min-w-0">
                <GroupStatusBadge status={g.status} />
                <span className="text-sm font-semibold text-slate-700 truncate">{g.group_name || "ใบเบิก"}</span>
                <span className="text-[10px] text-slate-400 shrink-0">{g.itemCount} รายการ</span>
              </div>
              <GroupActions group={g} onMutate={onMutateGroups} />
            </div>
          ))}
        </div>
      )}

      {/* Bottom bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
        <div className="flex items-center gap-4 text-[11px]">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="flex items-center gap-1.5 hover:text-[#102C57] transition-colors"
          >
            <svg className={`h-3.5 w-3.5 text-slate-400 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m19 9-7 7-7-7" />
            </svg>
            <div className="flex flex-col items-center">
              <span className="text-lg font-bold text-slate-800 tabular-nums leading-tight">{groups.length}</span>
              <span className="text-slate-400">ใบเบิกทั้งหมด</span>
            </div>
          </button>
          <div className="flex flex-col items-center">
            <span className="text-lg font-bold text-amber-600 tabular-nums leading-tight">
              {(groups || []).filter((g) => g.status === "draft").length}
            </span>
            <span className="text-slate-400">Draft</span>
          </div>
            <div className="flex flex-col items-center">
              <span className="text-lg font-bold text-emerald-600 tabular-nums leading-tight">{readyGroups.length}</span>
              <span className="text-slate-400">พร้อม export</span>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-lg font-bold text-slate-400 tabular-nums leading-tight">{exportedGroups.length}</span>
              <span className="text-slate-400">Exported แล้ว</span>
            </div>
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || readyGroups.length === 0}
          className="inline-flex items-center gap-2 rounded-xl bg-[#102C57] px-5 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-[#1a3d6b] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {exporting ? (
            <><svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>กำลัง export...</>
          ) : (
            <><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>Export Excel ({readyGroups.length} ใบเบิก)</>
          )}
        </button>
      </div>
    </div>
  );
}

// Summary Bar

function SummaryBar({ poolRows, dates }) {
  if (!poolRows?.length) return null;
  const total = poolRows.length;
  const claimed = poolRows.filter((r) => r.claimStatus === "claimed").length;
  const pct = total > 0 ? Math.round((claimed / total) * 100) : 0;
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
      <div className="flex flex-1 min-w-[200px] flex-col gap-1">
        <div className="flex items-center justify-between text-[11px]">
          <span className="font-semibold text-slate-600">ความคืบหน้าการเคลม</span>
          <span className="font-bold text-slate-700">{pct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-emerald-500 transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="h-8 w-px bg-slate-100 hidden sm:block" />
      <div className="flex items-center gap-6 text-[11px]">
        <div className="flex flex-col items-center">
          <span className="text-lg font-bold text-slate-800 tabular-nums leading-tight">{total}</span>
          <span className="text-slate-400">ทั้งหมด</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-lg font-bold text-emerald-600 tabular-nums leading-tight">{claimed}</span>
          <span className="text-slate-400">เคลมแล้ว</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-lg font-bold text-amber-600 tabular-nums leading-tight">{total - claimed}</span>
          <span className="text-slate-400">รอเคลม</span>
        </div>
        <div className="flex flex-col items-center">
          <span className="text-lg font-bold text-slate-600 tabular-nums leading-tight">{dates.length}</span>
          <span className="text-slate-400">วัน</span>
        </div>
      </div>
    </div>
  );
}

// Main Export

export default function MatrixWorkspaceClient({
  initialPoolRows = [],
  masterPlanNo = "",
  grain = "daily",
  dateFrom = "",
  dateTo = "",
  departments = [],
  lookup27Departments = [],
}) {
  // Claim dept selector
  const [claimDeptId, setClaimDeptId] = useState(
    () => departments?.length === 1 ? String(departments[0]?.id || "") : ""
  );
  const [pendingClaimKey, setPendingClaimKey] = useState("");
  const [claimFeedback, setClaimFeedback] = useState({});
  const [drawerState, setDrawerState] = useState(null);
  const [adjustmentState, setAdjustmentState] = useState(null);
  const [adjustmentSaving, setAdjustmentSaving] = useState(false);

  // Per-row selection
  const [selectedCellKeys, setSelectedCellKeys] = useState(() => new Set());
  const [claimingSelected, setClaimingSelected] = useState(false);

  // Release tracking
  const [releasingKeys, setReleasingKeys] = useState(() => new Set());

  // Pool SWR
  const poolQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (masterPlanNo) p.set("masterPlanNo", masterPlanNo);
    if (grain) p.set("grain", grain);
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo) p.set("dateTo", dateTo);
    return p.toString();
  }, [masterPlanNo, grain, dateFrom, dateTo]);

  const { data: poolPayload, mutate: mutatePool } = useSWR(
    masterPlanNo ? `/api/production-planning/material-claims/pool?${poolQuery}` : null,
    fetcher, { fallbackData: { data: initialPoolRows }, revalidateOnFocus: false }
  );
  const poolRows = useMemo(() => (Array.isArray(poolPayload?.data) ? poolPayload.data : []), [poolPayload]);

  // Groups SWR
  const { data: groupsData, mutate: mutateGroups } = useSWR(
    masterPlanNo ? `/api/production-planning/requisition/groups?masterPlanNo=${encodeURIComponent(masterPlanNo)}` : null,
    fetcher, { refreshInterval: 15000, revalidateOnFocus: true }
  );
  const groups = useMemo(() => (Array.isArray(groupsData?.data) ? groupsData.data : []), [groupsData]);
  const keyGroupMap = useMemo(() => buildKeyGroupMap(groups), [groups]);
  const claimedAdjustmentRows = useMemo(
    () => buildClaimedAdjustmentRows(poolRows, keyGroupMap, claimDeptId),
    [poolRows, keyGroupMap, claimDeptId]
  );
  const editableAdjustmentCount = useMemo(
    () => claimedAdjustmentRows.filter((row) => !row.isLocked).length,
    [claimedAdjustmentRows]
  );

  const { dates, deptGroups } = useMemo(() => buildMatrix(poolRows), [poolRows]);

  const refreshAll = useCallback(() => Promise.all([mutatePool(), mutateGroups()]), [mutatePool, mutateGroups]);

  // Claim a whole day for a dept
  const handleClaimDay = useCallback(async (date, ownerDeptId) => {
    if (!claimDeptId) return;
    const key = `${date}|${ownerDeptId}`;
    const rowsToClaim = poolRows.filter(
      (r) => r.bucketDate === date && r.ownerDepartmentId === ownerDeptId && r.claimStatus !== "claimed"
    );
    if (!rowsToClaim.length) return;

    setPendingClaimKey(key);
    const results = await Promise.all(rowsToClaim.map((row) =>
      fetch("/api/production-planning/material-claims/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterPlanNo, grain,
          materialSkuCode: row.materialSkuCode,
          materialGoodsCode: row.materialGoodsCode || row.materialSkuCode,
          ownerDepartmentId: row.ownerDepartmentId,
          demandSource: row.demandSource || "subplan_raw",
          workDate: row.bucketDate,
          departmentId: claimDeptId,
          source: "manual_claim",
        }),
      }).then((r) => r.json())
    ));
    setPendingClaimKey("");
    const failed = results.find((r) => !r.ok && r.error);
    setClaimFeedback((prev) => ({ ...prev, [key]: { ok: !failed, msg: failed?.error || "" } }));
    await mutatePool();
  }, [claimDeptId, poolRows, masterPlanNo, grain, mutatePool]);

  const handleToggleCell = useCallback((sourceRowKey) => {
    setSelectedCellKeys((prev) => {
      const next = new Set(prev);
      if (next.has(sourceRowKey)) next.delete(sourceRowKey); else next.add(sourceRowKey);
      return next;
    });
  }, []);

  const handleClaimSelected = useCallback(async () => {
    if (!claimDeptId || !selectedCellKeys.size) return;
    const rowsToClaim = poolRows.filter(
      (r) => selectedCellKeys.has(r.sourceRowKey) && r.claimStatus !== "claimed"
    );
    if (!rowsToClaim.length) { setSelectedCellKeys(new Set()); return; }
    setClaimingSelected(true);
    const results = await Promise.all(rowsToClaim.map((row) =>
      fetch("/api/production-planning/material-claims/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterPlanNo, grain,
          materialSkuCode: row.materialSkuCode,
          materialGoodsCode: row.materialGoodsCode || row.materialSkuCode,
          ownerDepartmentId: row.ownerDepartmentId,
          demandSource: row.demandSource || "subplan_raw",
          workDate: row.bucketDate,
          departmentId: claimDeptId,
          source: "manual_claim",
        }),
      }).then((r) => r.json())
    ));
    setClaimingSelected(false);
    setSelectedCellKeys(new Set());
    const failed = results.find((r) => !r.ok && r.error);
    if (failed) setClaimFeedback((prev) => ({ ...prev, selected: { ok: false, msg: failed.error } }));
    await mutatePool();
  }, [claimDeptId, selectedCellKeys, poolRows, masterPlanNo, grain, mutatePool]);

  const handleReleaseCell = useCallback(async (sourceRowKey) => {
    const row = poolRows.find((r) => r.sourceRowKey === sourceRowKey);
    if (!row || row.claimStatus !== "claimed") return;
    setReleasingKeys((prev) => new Set([...prev, sourceRowKey]));
    const res = await fetch("/api/production-planning/material-claims/release", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        masterPlanNo, grain,
        materialSkuCode: row.materialSkuCode,
        materialGoodsCode: row.materialGoodsCode || row.materialSkuCode,
        ownerDepartmentId: row.ownerDepartmentId,
        demandSource: row.demandSource,
        workDate: row.bucketDate,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setReleasingKeys((prev) => { const next = new Set(prev); next.delete(sourceRowKey); return next; });
    if (!res.ok) {
      const rawMsg = data.error || "";
      const friendlyMsg = rawMsg.toLowerCase().includes("requisition group")
        ? "มีใบเบิกที่ใช้รายการนี้อยู่แล้ว จึงยังคืนสิทธิ์ไม่ได้"
        : rawMsg || "คืนสิทธิ์ไม่สำเร็จ";
      alert(friendlyMsg);
    }
    await mutatePool();
  }, [poolRows, masterPlanNo, grain, mutatePool]);

  const openDrawer = useCallback((info) => {
    setDrawerState({ ...info, masterPlanNo, grain });
  }, [masterPlanNo, grain]);

  const handleOpenAdjustments = useCallback(() => {
    setAdjustmentState({
      rows: claimedAdjustmentRows.map((row) => ({
        ...row,
        nextSourceRowKey: row.nextSourceRowKey,
        nextIssueQty: row.nextIssueQty,
      })),
    });
  }, [claimedAdjustmentRows]);

  const handleOpenMaterialRowAdjustments = useCallback((info) => {
    const deptId = String(info?.dept?.deptId || "").trim();
    const matCode = String(info?.material?.matCode || "").trim().toUpperCase();
    const section = String(info?.material?.section || "").trim().toLowerCase();
    const rows = (poolRows || [])
      .filter((row) =>
        String(row.ownerDepartmentId || "").trim() === deptId
        && String(row.materialGoodsCode || row.materialSkuCode || "").trim().toUpperCase() === matCode
        && (row.demandSource === "subplan_raw" ? "wip" : "fg") === section
      )
      .map((row) => {
        const sourceRowKey = String(row.sourceRowKey || "").trim();
        const group = keyGroupMap.get(sourceRowKey) || null;
        const replacementOptions = (poolRows || [])
          .filter((candidate) => {
            const candidateKey = String(candidate.sourceRowKey || "").trim();
            const sameSlot =
              candidate.bucketDate === row.bucketDate
              && String(candidate.ownerDepartmentId || "").trim() === String(row.ownerDepartmentId || "").trim()
              && String(candidate.demandSource || "").trim() === String(row.demandSource || "").trim();
            if (!sameSlot) return false;
            if (candidateKey === sourceRowKey) return true;
            if (keyGroupMap.has(candidateKey)) return false;
            return candidate.claimStatus !== "claimed";
          })
          .sort((left, right) => String(left.materialName || left.materialGoodsCode || "").localeCompare(
            String(right.materialName || right.materialGoodsCode || ""),
            "th"
          ))
          .map((candidate) => ({
            sourceRowKey: String(candidate.sourceRowKey || "").trim(),
            materialSkuCode: candidate.materialSkuCode,
            materialGoodsCode: candidate.materialGoodsCode || candidate.materialSkuCode,
            materialName: candidate.materialName || candidate.materialGoodsCode || candidate.materialSkuCode,
            unit: candidate.unit || row.unit || "",
            demandIssueQty: Number(candidate.demandIssueQty ?? candidate.issueQty ?? candidate.requiredQty ?? 0),
          }));

        return {
          ...row,
          sectionLabel: row.demandSource === "fg_direct" ? "FG Direct" : "WIP/Subplan",
          sourceRowKey,
          isLocked: Boolean(group) || row.claimStatus === "claimed",
          lockReason:
            row.claimStatus === "claimed"
              ? "เคลมแล้ว"
              : group
                ? `อยู่ใน${group.group_name || "ใบเบิก"}แล้ว`
                : "",
          replacementOptions,
          nextSourceRowKey: sourceRowKey,
          nextIssueQty: String(Number(row.issueQty || 0)),
        };
      })
      .sort((left, right) => String(left.bucketDate || "").localeCompare(String(right.bucketDate || "")));
    if (!rows.length) return;
    setAdjustmentState({
      rows: rows.map((row) => ({
        ...row,
        nextSourceRowKey: row.nextSourceRowKey,
        nextIssueQty: row.nextIssueQty,
      })),
    });
  }, [poolRows, keyGroupMap]);

  const handleAdjustmentChange = useCallback((sourceRowKey, field, value) => {
    setAdjustmentState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        rows: prev.rows.map((row) => {
          if (row.sourceRowKey !== sourceRowKey) return row;
          return { ...row, [field]: value };
        }),
      };
    });
  }, []);

  const handleSaveAdjustments = useCallback(async () => {
    if (!adjustmentState?.rows?.length) {
      setAdjustmentState(null);
      return;
    }

    const changedRows = adjustmentState.rows.filter((row) => {
      if (row.isLocked) return false;
      if (row.claimStatus === "claimed") return false;
      const nextQty = Number(row.nextIssueQty);
      const currentQty = Number(row.issueQty || 0);
      const sameQty = Number.isFinite(nextQty) && Math.abs(nextQty - currentQty) < 0.0005;
      return !sameQty;
    });

    if (!changedRows.length) {
      setAdjustmentState(null);
      return;
    }

    setAdjustmentSaving(true);
    const results = await Promise.all(
      changedRows.map(async (row) => {
        const nextQty = Number(row.nextIssueQty);
        if (!Number.isFinite(nextQty) || nextQty < 0) {
          return { ok: false, error: `จำนวนไม่ถูกต้องสำหรับ ${row.materialName || row.materialGoodsCode}` };
        }

        const response = await fetch("/api/production-planning/material-claims/update", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            masterPlanNo,
            grain,
            materialSkuCode: row.materialSkuCode,
            materialGoodsCode: row.materialGoodsCode || row.materialSkuCode,
            ownerDepartmentId: row.ownerDepartmentId,
            demandSource: row.demandSource,
            workDate: row.bucketDate,
            issueQty: nextQty,
            note: row.claimNote || null,
          }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          return { ok: false, error: data?.error || "บันทึกการแก้ไขไม่สำเร็จ" };
        }
        return { ok: true };
      })
    );

    setAdjustmentSaving(false);
    const failed = results.find((row) => !row.ok);
    if (failed) {
      alert(failed.error || "บันทึกการแก้ไขไม่สำเร็จ");
      return;
    }

    setAdjustmentState(null);
    await refreshAll();
  }, [adjustmentState, masterPlanNo, grain, refreshAll]);

  const handleSaved = useCallback(async () => {
    await refreshAll();
    setDrawerState(null);
  }, [refreshAll]);

  if (!masterPlanNo) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
        <p className="text-sm font-semibold text-slate-600">กรุณาเลือกเลขที่แผน</p>
        <p className="mt-1 text-xs text-slate-400">เลือกแผนการผลิตเพื่อดูวัตถุดิบที่ต้องเคลม</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Claim dept selector (only when multiple depts) */}
      {departments.length > 1 && (
        <div className="flex items-center gap-3 rounded-xl border border-[#102C57]/15 bg-white px-4 py-3 shadow-sm">
          <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">แผนกที่รับสิทธิ์:</span>
          <select
            value={claimDeptId}
            onChange={(e) => {
              setClaimDeptId(e.target.value);
              setSelectedCellKeys(new Set());
            }}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#102C57]/30">
            <option value="">- เลือกแผนก -</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>{d.displayName || d.name || d.code || d.id}</option>
            ))}
          </select>
          {!claimDeptId && <span className="text-[11px] text-amber-600 font-medium">เลือกแผนกเพื่อเปิดใช้ปุ่มเคลม</span>}
        </div>
      )}

      {/* Claim feedback errors */}
      {Object.entries(claimFeedback).filter(([, v]) => !v.ok && v.msg).map(([key, v]) => (
        <p key={key} className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600">{key}: {v.msg}</p>
      ))}

      {/* Summary bar */}
      <SummaryBar poolRows={poolRows} dates={dates} />

      <ClaimAdjustmentsBar
        totalRows={claimedAdjustmentRows.length}
        editableRows={editableAdjustmentCount}
        lockedRows={claimedAdjustmentRows.length - editableAdjustmentCount}
        onOpen={handleOpenAdjustments}
      />

      {/* Empty state */}
      {!deptGroups.length && (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
          <p className="text-sm font-semibold text-slate-600">ไม่มีวัตถุดิบที่ต้องเคลมในช่วงนี้</p>
          <p className="mt-1 text-xs text-slate-400">{masterPlanNo} : QA อาจยังไม่ยืนยันแผนย่อย หรือยังไม่มีข้อมูล BOM</p>
        </div>
      )}

      {/* Dept tables */}
      {deptGroups.map((dept) => (
        <DeptTable
          key={dept.deptId}
          dept={dept}
          dates={dates}
          poolRows={poolRows}
          keyGroupMap={keyGroupMap}
          groups={groups}
          claimDeptId={claimDeptId}
          pendingClaimKey={pendingClaimKey}
          onClaimDay={handleClaimDay}
          onOpenDrawer={openDrawer}
          onMutateGroups={mutateGroups}
          selectedCellKeys={selectedCellKeys}
          onToggleCell={handleToggleCell}
          releasingKeys={releasingKeys}
          onReleaseCell={handleReleaseCell}
          onEditMaterialRow={handleOpenMaterialRowAdjustments}
        />
      ))}

      {/* Selected rows claim bar */}
      {selectedCellKeys.size > 0 && (
        <div className="sticky bottom-16 z-30 mx-auto max-w-sm rounded-2xl border border-[#102C57]/20 bg-[#102C57] px-5 py-3 shadow-xl flex items-center justify-between gap-4">
          <span className="text-sm font-semibold text-white">
            เลือกแล้ว <span className="font-extrabold">{selectedCellKeys.size}</span> รายการ
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedCellKeys(new Set())}
              className="rounded-lg border border-white/30 px-3 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10"
            >
              ล้าง
            </button>
            <button
              type="button"
              disabled={claimingSelected || !claimDeptId}
              onClick={handleClaimSelected}
              className="rounded-lg bg-white px-4 py-1.5 text-xs font-bold text-[#102C57] hover:bg-white/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {claimingSelected ? "กำลังเคลม..." : "เคลมที่เลือก"}
            </button>
          </div>
        </div>
      )}

      {/* Export bar */}
      <ExportBar groups={groups} masterPlanNo={masterPlanNo} onMutateGroups={mutateGroups} />

      {/* Drawer */}
      {drawerState && (
        <GroupingDrawer
          drawerState={drawerState}
          lookup27Departments={lookup27Departments}
          onClose={() => setDrawerState(null)}
          onSaved={handleSaved}
        />
      )}

      <ClaimAdjustmentsModal
        state={adjustmentState}
        saving={adjustmentSaving}
        onClose={() => {
          if (adjustmentSaving) return;
          setAdjustmentState(null);
        }}
        onChange={handleAdjustmentChange}
        onSave={handleSaveAdjustments}
      />
    </div>
  );
}
