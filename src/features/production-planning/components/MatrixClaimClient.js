"use client";

// MatrixClaimClient — interactive matrix: view materials + claim per day per dept
import { useState, useMemo } from "react";
import useSWR from "swr";

const DAY_TH = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const MONTH_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

const fetcher = (url) => fetch(url).then((r) => r.json());

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseDateHeader(dateStr) {
  if (!dateStr) return { dayName: "—", dayNum: "—", monthName: "" };
  try {
    const d = new Date(`${dateStr}T00:00:00.000Z`);
    return {
      dayName: DAY_TH[d.getUTCDay()],
      dayNum: d.getUTCDate(),
      monthName: MONTH_TH[d.getUTCMonth()],
    };
  } catch {
    return { dayName: "", dayNum: dateStr, monthName: "" };
  }
}

function formatQty(qty) {
  if (!Number.isFinite(qty) || qty === 0) return null;
  return qty % 1 === 0
    ? qty.toLocaleString("th-TH")
    : qty.toLocaleString("th-TH", { maximumFractionDigits: 3 });
}

// Transform flat pool rows → matrix data structure (same logic as MaterialMatrixView)
function buildMatrixData(poolRows) {
  if (!Array.isArray(poolRows) || !poolRows.length) {
    return { dates: [], deptGroups: [] };
  }

  const dateSet = new Set();
  poolRows.forEach((r) => { if (r.bucketDate) dateSet.add(r.bucketDate); });
  const dates = Array.from(dateSet).sort();

  const deptMap = new Map();
  poolRows.forEach((row) => {
    const deptId = row.ownerDepartmentId || "unknown";
    const deptName = row.ownerDepartmentName || row.ownerDepartmentCode || deptId;

    if (!deptMap.has(deptId)) {
      deptMap.set(deptId, {
        deptId,
        deptName,
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
        matCode,
        matSkuCode: row.materialSkuCode || matCode,
        matName: row.materialName || matCode,
        unit: row.unit || "",
        section,
        byDate: {},
      });
    }

    const mat = dept.materialMap.get(matKey);
    if (row.bucketDate) {
      const existing = mat.byDate[row.bucketDate];
      const qty = Number(row.issueQty ?? row.requiredQty ?? 0);
      // Track if ANY row for this cell is unclaimed
      const prevClaimed = existing?.allClaimed ?? true;
      mat.byDate[row.bucketDate] = {
        qty: (existing?.qty ?? 0) + qty,
        status: row.claimStatus || "unassigned",
        allClaimed: prevClaimed && row.claimStatus === "claimed",
        claimedBy: row.claimDepartmentName || row.claimDepartmentCode || null,
      };
    }
  });

  const deptGroups = Array.from(deptMap.values())
    .map((dept) => {
      const allMaterials = Array.from(dept.materialMap.values());
      const wipMaterials = allMaterials
        .filter((m) => m.section === "wip")
        .sort((a, b) => a.matName.localeCompare(b.matName, "th"));
      const fgMaterials = allMaterials
        .filter((m) => m.section === "fg")
        .sort((a, b) => a.matName.localeCompare(b.matName, "th"));
      return { ...dept, wipMaterials, fgMaterials };
    })
    .sort((a, b) => (a.deptCode || a.deptName).localeCompare(b.deptCode || b.deptName, "th"));

  return { dates, deptGroups };
}

// Count unclaimed rows for a specific date + dept from raw pool rows
function countUnclaimedForDay(poolRows, date, deptId) {
  return poolRows.filter(
    (r) => r.bucketDate === date && r.ownerDepartmentId === deptId && r.claimStatus !== "claimed"
  ).length;
}

function countClaimedForDay(poolRows, date, deptId) {
  return poolRows.filter(
    (r) => r.bucketDate === date && r.ownerDepartmentId === deptId && r.claimStatus === "claimed"
  ).length;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function SectionHeaderRow({ label, colSpan, colorScheme }) {
  const schemes = {
    amber: "bg-amber-50 text-amber-800 border-amber-200",
    sky: "bg-sky-50 text-sky-800 border-sky-200",
  };
  return (
    <tr className={`border-y ${schemes[colorScheme]}`}>
      <td
        colSpan={colSpan}
        className={`px-4 py-2 text-[11px] font-bold uppercase tracking-widest sticky left-0 ${schemes[colorScheme]}`}
      >
        {label}
      </td>
    </tr>
  );
}

function MatrixCell({ cell, unit }) {
  if (!cell) {
    return (
      <td className="px-2 py-2.5 text-center border-l border-slate-100">
        <span className="text-slate-200 text-xs select-none">—</span>
      </td>
    );
  }

  const isClaimed = cell.allClaimed && cell.qty > 0;
  const qtyText = formatQty(cell.qty);

  return (
    <td className={`px-2 py-2.5 text-center border-l border-slate-100 transition-colors ${isClaimed ? "bg-emerald-50/60" : ""}`}>
      {qtyText ? (
        <div className="flex flex-col items-center gap-0.5">
          <span className={`text-sm font-bold tabular-nums ${isClaimed ? "text-emerald-700" : "text-slate-800"}`}>
            {qtyText}
          </span>
          {unit && (
            <span className="text-[10px] text-slate-400 leading-none">{unit}</span>
          )}
          {isClaimed && (
            <span className="mt-0.5 inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700 leading-none">
              <span className="h-1 w-1 rounded-full bg-emerald-500 inline-block" />
              เคลมแล้ว
            </span>
          )}
        </div>
      ) : (
        <span className="text-slate-200 text-xs">—</span>
      )}
    </td>
  );
}

function MaterialRow({ mat, dates, isOdd }) {
  return (
    <tr className={`border-b border-slate-100 hover:bg-slate-50/70 transition-colors group ${isOdd ? "bg-white" : "bg-slate-50/30"}`}>
      <td className={`sticky left-0 z-10 px-4 py-2.5 min-w-[200px] max-w-[260px] ${isOdd ? "bg-white" : "bg-slate-50/30"} group-hover:bg-slate-50/70 transition-colors`}>
        <div className="text-sm font-semibold text-slate-800 leading-snug truncate" title={mat.matName}>
          {mat.matName}
        </div>
        {mat.matCode && mat.matCode !== mat.matName && (
          <div className="text-[10px] text-slate-400 font-mono leading-none mt-0.5 truncate">
            {mat.matCode}
          </div>
        )}
      </td>
      {dates.map((date) => (
        <MatrixCell key={date} cell={mat.byDate[date] || null} unit={mat.unit} />
      ))}
    </tr>
  );
}

// Dept table — shows material matrix + claim button per date column
function DeptMatrixTable({ dept, dates, poolRows, claimDeptId, onClaimDay, feedbackMap, pendingKey }) {
  const hasWip = dept.wipMaterials.length > 0;
  const hasFg = dept.fgMaterials.length > 0;
  const colSpan = dates.length + 1;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Dept header */}
      <div className="flex items-center justify-between bg-[#102C57] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold text-white">{dept.deptName}</span>
          {dept.deptCode && (
            <span className="rounded-full bg-white/15 px-2 py-0.5 text-[10px] font-semibold text-white/80">
              {dept.deptCode}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px] text-white/60">
          {hasWip && (
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
              WIP {dept.wipMaterials.length} รายการ
            </span>
          )}
          {hasFg && (
            <span className="flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
              FG {dept.fgMaterials.length} รายการ
            </span>
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse">
          <thead>
            <tr className="border-b-2 border-slate-200 bg-slate-50">
              {/* Material col header */}
              <th className="sticky left-0 z-10 bg-slate-50 px-4 py-3 text-left text-[11px] font-semibold text-slate-500 uppercase tracking-wide min-w-[200px]">
                วัตถุดิบ
              </th>

              {/* Date col headers — each has day info + claim button */}
              {dates.map((dateStr) => {
                const { dayName, dayNum, monthName } = parseDateHeader(dateStr);
                const key = `${dateStr}|${dept.deptId}`;
                const isPending = pendingKey === key;
                const fb = feedbackMap[key];
                const unclaimedCount = countUnclaimedForDay(poolRows, dateStr, dept.deptId);
                const claimedCount = countClaimedForDay(poolRows, dateStr, dept.deptId);
                const totalCount = unclaimedCount + claimedCount;
                const allDone = totalCount > 0 && unclaimedCount === 0;

                return (
                  <th
                    key={dateStr}
                    className="px-2 py-2 text-center min-w-[120px] border-l border-slate-100"
                  >
                    <div className="flex flex-col items-center gap-1">
                      {/* Date info */}
                      <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">
                        {dayName}
                      </span>
                      <span className="text-base font-bold text-slate-700 leading-tight">
                        {dayNum}
                      </span>
                      <span className="text-[10px] text-slate-400">{monthName}</span>

                      {/* Claim progress / button */}
                      {totalCount > 0 && (
                        <>
                          {allDone ? (
                            <span className="mt-0.5 inline-flex items-center gap-0.5 rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-semibold text-emerald-700">
                              <span className="h-1 w-1 rounded-full bg-emerald-500" />
                              เคลมครบ
                            </span>
                          ) : (
                            <>
                              <span className="text-[9px] text-slate-400">
                                {claimedCount}/{totalCount}
                              </span>
                              {fb && !fb.ok && (
                                <span className="text-[9px] text-red-600 text-center leading-tight max-w-[100px]">
                                  {fb.msg}
                                </span>
                              )}
                              <button
                                type="button"
                                disabled={isPending || !claimDeptId}
                                onClick={() => onClaimDay(dateStr, dept.deptId)}
                                title={!claimDeptId ? "เลือกแผนกรับสิทธิ์ก่อน" : `เคลม ${unclaimedCount} รายการ`}
                                className={`mt-0.5 rounded-md px-2 py-0.5 text-[10px] font-semibold transition-colors
                                  ${isPending
                                    ? "bg-slate-100 text-slate-400 cursor-wait"
                                    : !claimDeptId
                                    ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                                    : "bg-[#102C57] text-white hover:bg-[#1a3d6b] active:scale-95"
                                  }`}
                              >
                                {isPending ? "กำลังเคลม..." : `เคลม ${unclaimedCount}`}
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {hasWip && (
              <>
                <SectionHeaderRow
                  label="WIP — วัตถุดิบกึ่งสำเร็จรูป"
                  colSpan={colSpan}
                  colorScheme="amber"
                />
                {dept.wipMaterials.map((mat, i) => (
                  <MaterialRow key={mat.matCode} mat={mat} dates={dates} isOdd={i % 2 === 0} />
                ))}
              </>
            )}
            {hasFg && (
              <>
                <SectionHeaderRow
                  label="FG / แพ็ค — วัตถุดิบบรรจุ"
                  colSpan={colSpan}
                  colorScheme="sky"
                />
                {dept.fgMaterials.map((mat, i) => (
                  <MaterialRow key={mat.matCode} mat={mat} dates={dates} isOdd={i % 2 === 0} />
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
      <div className="h-8 w-px bg-slate-100 hidden sm:block" />
      <div className="flex items-center gap-6 text-[11px]">
        <div className="flex flex-col items-center">
          <span className="text-lg font-bold text-slate-800 tabular-nums leading-tight">{total}</span>
          <span className="text-slate-400">รายการทั้งหมด</span>
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

function EmptyState({ masterPlanNo }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
        <svg className="h-6 w-6 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
        </svg>
      </div>
      {masterPlanNo ? (
        <>
          <p className="text-sm font-semibold text-slate-600">ไม่มีวัตถุดิบที่ต้องเบิกในช่วงนี้</p>
          <p className="mt-1 text-xs text-slate-400">{masterPlanNo} — QA ยังไม่ได้ยืนยันแผนย่อย หรือยังไม่มีข้อมูล BOM</p>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-slate-600">กรุณาเลือกเลขที่แผน</p>
          <p className="mt-1 text-xs text-slate-400">เลือกแผนการผลิตเพื่อดูวัตถุดิบที่ต้องเบิก</p>
        </>
      )}
    </div>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────

export default function MatrixClaimClient({
  initialPoolRows = [],
  masterPlanNo = "",
  grain = "daily",
  dateFrom = "",
  dateTo = "",
  departments = [],
}) {
  // SWR — live pool data, deduplicated with MatrixGroupingClient if same URL
  const query = useMemo(() => {
    const p = new URLSearchParams();
    if (masterPlanNo) p.set("masterPlanNo", masterPlanNo);
    if (grain) p.set("grain", grain);
    if (dateFrom) p.set("dateFrom", dateFrom);
    if (dateTo) p.set("dateTo", dateTo);
    return p.toString();
  }, [masterPlanNo, grain, dateFrom, dateTo]);

  const apiUrl = masterPlanNo ? `/api/production-planning/material-claims/pool?${query}` : null;

  const { data: poolPayload, mutate } = useSWR(apiUrl, fetcher, {
    fallbackData: { data: initialPoolRows },
    revalidateOnFocus: false,
  });

  const poolRows = useMemo(
    () => (Array.isArray(poolPayload?.data) ? poolPayload.data : []),
    [poolPayload]
  );

  const { dates, deptGroups } = useMemo(() => buildMatrixData(poolRows), [poolRows]);

  // Claim dept selector — auto-select if only 1 dept assigned
  const [claimDeptId, setClaimDeptId] = useState(
    () => departments?.length === 1 ? String(departments[0]?.id || "") : ""
  );
  const [pendingKey, setPendingKey] = useState("");
  const [feedbackMap, setFeedbackMap] = useState({});

  const handleClaimDay = async (date, ownerDeptId) => {
    if (!claimDeptId) return;
    const key = `${date}|${ownerDeptId}`;

    const rowsToClaim = poolRows.filter(
      (r) =>
        r.bucketDate === date &&
        r.ownerDepartmentId === ownerDeptId &&
        r.claimStatus !== "claimed"
    );
    if (!rowsToClaim.length) return;

    setPendingKey(key);
    setFeedbackMap((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

    const results = await Promise.all(
      rowsToClaim.map((row) =>
        fetch("/api/production-planning/material-claims/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            masterPlanNo,
            materialSkuCode: row.materialSkuCode,
            materialGoodsCode: row.materialGoodsCode || row.materialSkuCode,
            ownerDepartmentId: row.ownerDepartmentId,
            demandSource: row.demandSource || "subplan_raw",
            grain,
            workDate: row.bucketDate,
            departmentId: claimDeptId,
            source: "manual_claim",
          }),
        }).then((r) => r.json())
      )
    );

    setPendingKey("");

    const failed = results.find((r) => !r.ok && r.error);
    if (failed) {
      setFeedbackMap((prev) => ({
        ...prev,
        [key]: { ok: false, msg: failed.error || "เคลมไม่สำเร็จ" },
      }));
    } else {
      setFeedbackMap((prev) => ({
        ...prev,
        [key]: { ok: true, msg: `เคลมแล้ว ${results.length} รายการ` },
      }));
      await mutate();
    }
  };

  return (
    <div className="space-y-4">
      {/* Claim dept selector (show only if multiple depts) */}
      {departments.length > 1 && (
        <div className="flex items-center gap-3 rounded-xl border border-[#102C57]/15 bg-white px-4 py-3 shadow-sm">
          <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">แผนกที่รับสิทธิ์:</span>
          <select
            value={claimDeptId}
            onChange={(e) => setClaimDeptId(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#102C57]/30"
          >
            <option value="">— เลือกแผนก —</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.displayName || d.name || d.code || d.id}
              </option>
            ))}
          </select>
          {!claimDeptId && (
            <span className="text-[11px] text-amber-600 font-medium">
              เลือกแผนกเพื่อเปิดใช้ปุ่มเคลม
            </span>
          )}
        </div>
      )}

      {/* Summary bar */}
      <SummaryBar poolRows={poolRows} dates={dates} />

      {/* Empty state */}
      {(!deptGroups.length || !dates.length) && (
        <EmptyState masterPlanNo={masterPlanNo} />
      )}

      {/* Matrix per department */}
      {deptGroups.map((dept) => (
        <DeptMatrixTable
          key={dept.deptId}
          dept={dept}
          dates={dates}
          poolRows={poolRows}
          claimDeptId={claimDeptId}
          onClaimDay={handleClaimDay}
          feedbackMap={feedbackMap}
          pendingKey={pendingKey}
        />
      ))}
    </div>
  );
}
