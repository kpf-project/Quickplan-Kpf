"use client";

import { useCallback, useDeferredValue, useMemo, useState } from "react";
import useSWR from "swr";

const MATERIAL_TAB_ID = "all";

const fetcher = async (url) => {
  const response = await fetch(url);
  return response.json();
};

function formatShortThaiDate(dateStr) {
  if (!dateStr) return "-";
  try {
    const date = new Date(`${dateStr}T00:00:00.000Z`);
    const day = String(date.getUTCDate()).padStart(2, "0");
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const year = String((date.getUTCFullYear() + 543) % 100).padStart(2, "0");
    return `${day}/${month}/${year}`;
  } catch {
    return dateStr;
  }
}

function fmtQty(qty) {
  const value = Number(qty);
  if (!Number.isFinite(value) || value === 0) return "-";
  return value % 1 === 0
    ? value.toLocaleString("th-TH")
    : value.toLocaleString("th-TH", { maximumFractionDigits: 3 });
}

function EditableQtyCell({
  value,
  onSave,
  onReplace,
  onConfirmVerify,
  disabled,
  replaceDisabled = false,
  verifyDisabled = false,
  verified = false,
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const openEditor = () => {
    setDraft(String(value ?? ""));
    setEditing(true);
  };

  if (editing) {
    return (
      <div className="flex items-center justify-center gap-1">
        <input
          type="number"
          min="0"
          step="0.001"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          className="h-7 w-16 rounded-md border border-[#102C57]/30 px-1.5 text-center text-[12px] font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#102C57]/30"
          autoFocus
        />
        <button
          type="button"
          onClick={() => {
            onSave(Number(draft));
            setEditing(false);
          }}
          className="text-[10px] font-semibold text-emerald-600 hover:text-emerald-700"
        >
          บันทึก
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-[10px] font-semibold text-slate-400 hover:text-slate-600"
        >
          ยกเลิก
        </button>
      </div>
    );
  }

  return (
    <div className="group flex flex-col items-center justify-center gap-0.5">
      <div className="flex items-center justify-center gap-1">
        <span className="text-[13px] font-semibold text-slate-800">{fmtQty(value)}</span>
        {!disabled ? (
          <>
            <button
              type="button"
              onClick={openEditor}
              className="hidden h-5 w-5 items-center justify-center rounded text-slate-300 transition hover:bg-slate-100 hover:text-[#102C57] group-hover:flex"
              title="แก้ไขจำนวน"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 20h9" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" />
              </svg>
            </button>
            <button
              type="button"
              onClick={onReplace}
              disabled={replaceDisabled}
              className="hidden h-5 items-center justify-center rounded px-1 text-[10px] font-semibold text-slate-300 transition hover:bg-slate-100 hover:text-[#102C57] disabled:cursor-not-allowed disabled:text-slate-200 group-hover:flex"
              title="เปลี่ยนวัตถุดิบ"
            >
              เปลี่ยน
            </button>
          </>
        ) : null}
      </div>
      {verified ? (
        <span className="whitespace-nowrap text-[9px] font-semibold text-emerald-600">ตรวจสอบแล้ว</span>
      ) : onConfirmVerify ? (
        <button
          type="button"
          onClick={onConfirmVerify}
          disabled={verifyDisabled}
          className="whitespace-nowrap border border-[#102C57]/30 bg-white px-1.5 py-0.5 text-[9px] font-bold text-[#102C57] transition hover:bg-[var(--surface-navy,#102C57)] hover:text-white disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
        >
          ยืนยันตรวจสอบ
        </button>
      ) : null}
    </div>
  );
}

function ReplaceMaterialDrawer({
  state,
  saving = false,
  onClose,
  onSelect,
}) {
  const [searchText, setSearchText] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selectedKey, setSelectedKey] = useState("");
  const deferredSearchText = useDeferredValue(searchText);

  const searchUrl = useMemo(() => {
    if (!state) return null;
    const query = new URLSearchParams({
      limit: deferredSearchText ? "500" : "300",
    });
    if (deferredSearchText) {
      query.set("search", deferredSearchText);
    }
    return `/api/production-planning/material-verify/material-options?${query.toString()}`;
  }, [state, deferredSearchText]);

  const { data, isLoading } = useSWR(searchUrl, fetcher, { revalidateOnFocus: false });
  const options = useMemo(() => {
    const rows = Array.isArray(data?.data) ? data.data : [];
    return rows.filter((option) => {
      const currentKey = `${state?.materialSkuCode || ""}::${state?.materialGoodsCode || ""}`;
      const optionKey = `${option?.skuCode || ""}::${option?.goodsCode || ""}`;
      return optionKey !== currentKey;
    });
  }, [data, state]);
  const categoryOptions = useMemo(() => {
    return Array.from(
      options.reduce((map, option) => {
        const code = String(option?.category || "").trim();
        if (!code || map.has(code)) return map;
        map.set(code, option?.categoryName || code);
        return map;
      }, new Map()).entries()
    );
  }, [options]);
  const filteredOptions = useMemo(() => {
    if (categoryFilter === "all") return options;
    return options.filter((option) => String(option?.category || "").trim() === categoryFilter);
  }, [categoryFilter, options]);
  const selectedOption = useMemo(() => {
    if (!selectedKey) return null;
    return filteredOptions.find((option) => `${option.skuCode}::${option.goodsCode}` === selectedKey)
      || options.find((option) => `${option.skuCode}::${option.goodsCode}` === selectedKey)
      || null;
  }, [filteredOptions, options, selectedKey]);

  if (!state) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-slate-950/35" onClick={saving ? undefined : onClose} />
      <div className="relative flex h-full w-full max-w-[1120px] flex-col border-l border-slate-400 bg-white shadow-none">
        <div className="shrink-0 border-b border-slate-400 bg-[var(--surface-navy,#102C57)] px-5 py-4 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#f2d68a]">Material Verify</div>
              <div className="mt-1 flex items-center gap-2 text-lg font-bold">
                <span>เลือกวัตถุดิบ</span>
                <span className="rounded-full border border-[#f2d68a]/30 bg-[#f2d68a]/15 px-2 py-0.5 text-[11px] font-semibold text-[#f2d68a]">
                  ทั้งหมด {options.length.toLocaleString("th-TH")} รายการ
                </span>
              </div>
              <div className="mt-1 text-xs text-white/75">
                เปลี่ยนจาก {state.materialName} • {formatShortThaiDate(state.workDate)} • {state.departmentName}
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white transition hover:bg-white/15 disabled:opacity-50"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="min-h-0 flex flex-1 overflow-hidden">
          <div className="flex min-w-0 flex-1 flex-col border-r border-slate-200">
            <div className="shrink-0 border-b border-slate-300 bg-[#F5F7FA] px-4 py-4">
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative sm:w-44">
                  <select
                    value={categoryFilter}
                    onChange={(event) => setCategoryFilter(event.target.value)}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#102C57]"
                  >
                    <option value="all">ทุกหมวดหมู่</option>
                    {categoryOptions.map(([code, label]) => (
                      <option key={code} value={code}>
                        {label || code}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="relative flex-1">
                  <input
                    value={searchText}
                    onChange={(event) => setSearchText(event.target.value)}
                    placeholder="ค้นหารหัสหรือชื่อวัตถุดิบ"
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#102C57]"
                  />
                </div>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
              <table className="w-full table-fixed text-sm">
                <thead className="sticky top-0 z-10 bg-[#EEF3F8]">
                  <tr className="border-b border-slate-300 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-[#102C57]">
                    <th className="w-10 px-2 py-3" />
                    <th className="w-[150px] px-2 py-3">รหัส</th>
                    <th className="px-3 py-3">ชื่อวัตถุดิบ</th>
                    <th className="w-[90px] px-2 py-3">หน่วย</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredOptions.map((option) => {
                    const optionKey = `${option.skuCode}::${option.goodsCode}`;
                    const isSelected = optionKey === selectedKey;
                    return (
                      <tr
                        key={optionKey}
                        onClick={() => setSelectedKey(optionKey)}
                        className={`cursor-pointer transition-colors ${
                          isSelected ? "bg-blue-50 hover:bg-blue-100" : "bg-white hover:bg-slate-50"
                        }`}
                      >
                        <td className="px-2 py-3">
                          <div className={`flex h-5 w-5 items-center justify-center rounded border ${
                            isSelected ? "border-[#102C57] bg-[var(--surface-navy,#102C57)] text-white" : "border-slate-300 bg-white"
                          }`}>
                            {isSelected ? (
                              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                              </svg>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-2 py-3 align-top">
                          <div className="font-mono text-[12px] font-semibold text-[#102C57]">{option.goodsCode}</div>
                          {option.skuCode && option.skuCode !== option.goodsCode ? (
                            <div className="mt-0.5 text-[10px] text-slate-400">SKU {option.skuCode}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-3 align-top">
                          <div className="text-sm font-medium text-slate-800">{option.name}</div>
                          <div className="mt-0.5 text-[11px] text-slate-400">{option.categoryName || option.category || "-"}</div>
                        </td>
                        <td className="px-2 py-3 align-top text-[12px] font-semibold text-slate-600">
                          {option.unit || "-"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {!isLoading && !filteredOptions.length ? (
                <div className="px-4 py-10 text-center text-sm text-slate-500">
                  ไม่พบวัตถุดิบที่ตรงกับคำค้น
                </div>
              ) : null}
              {isLoading ? (
                <div className="px-4 py-10 text-center text-sm text-slate-500">
                  กำลังค้นหารายการวัตถุดิบ...
                </div>
              ) : null}
            </div>
          </div>

          <div className="hidden w-[320px] shrink-0 flex-col bg-slate-50 lg:flex">
            <div className="border-b border-slate-200 bg-white px-4 py-4">
              <h3 className="text-sm font-bold text-slate-700">รายการที่เลือก</h3>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {selectedOption ? (
                <div className="border border-slate-300 bg-white p-4 shadow-none">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#102C57]/70">วัตถุดิบใหม่</div>
                  <div className="mt-2 text-sm font-bold text-slate-800">{selectedOption.name}</div>
                  <div className="mt-1 text-[11px] font-mono text-slate-400">{selectedOption.goodsCode}</div>
                  <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <div className="text-slate-400">หน่วย</div>
                      <div className="mt-1 font-semibold text-slate-700">{selectedOption.unit || "-"}</div>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2">
                      <div className="text-slate-400">หมวดหมู่</div>
                      <div className="mt-1 font-semibold text-slate-700">{selectedOption.categoryName || selectedOption.category || "-"}</div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-400">
                  เลือกรายการจากตารางด้านซ้าย
                </div>
              )}
            </div>
            <div className="border-t border-slate-200 bg-white px-4 py-4">
              <button
                type="button"
                onClick={() => selectedOption && onSelect(selectedOption)}
                disabled={!selectedOption || saving}
                className="h-11 w-full rounded-xl bg-[var(--surface-navy,#102C57)] text-sm font-bold text-white transition hover:bg-[#1a3d6b] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "กำลังบันทึก..." : "ยืนยันการเปลี่ยน"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function MaterialTable({
  dates,
  materials,
  today,
  savingKeys,
  expandedSkus,
  setExpandedSkus,
  handleQtyChange,
  handleReplaceMaterial,
  handleConfirmVerify,
  handleConfirmDate,
  wipByDate = {},
  editable = true,
}) {
  const dateVerification = useMemo(() => {
    const map = new Map();
    dates.forEach((date) => {
      let totalRows = 0;
      let verifiedRows = 0;
      let unclaimedRows = 0;
      let unclaimedVerifiedRows = 0;
      materials.forEach((material) => {
        const cell = material.byDate?.[date];
        totalRows += Number(cell?.totalRows || 0);
        verifiedRows += Number(cell?.verifiedRows || 0);
        unclaimedRows += Number(cell?.unclaimedRows || 0);
        unclaimedVerifiedRows += Number(cell?.unclaimedVerifiedRows || 0);
      });
      map.set(date, {
        totalRows,
        verifiedRows,
        unclaimedRows,
        unclaimedVerifiedRows,
        verified: unclaimedRows > 0 && unclaimedVerifiedRows === unclaimedRows,
      });
    });
    return map;
  }, [dates, materials]);

  if (!materials.length) {
    return (
      <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-16 text-center text-sm text-slate-400">
        ไม่มีข้อมูลในมุมมองนี้
      </div>
    );
  }

  const dateCount = Math.max(1, dates.length);
  const dateWidth = `${Math.max(8, 57 / dateCount)}%`;

  return (
    <div className="border border-slate-400 bg-white shadow-none">
      <div className="w-full overflow-x-hidden overflow-y-visible">
        <table className="w-full table-fixed border-collapse">
          <colgroup>
            <col style={{ width: "23%" }} />
            <col style={{ width: "6%" }} />
            {dates.map((date) => (
              <col key={`col-${date}`} style={{ width: dateWidth }} />
            ))}
            <col style={{ width: "11%" }} />
          </colgroup>
          <thead className="bg-[#EEF3F8]">
            <tr className="border-b border-slate-300">
              <th className="sticky left-0 z-20 border-r border-slate-300 bg-[#EEF3F8] px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-[#102C57]">
                วัตถุดิบ
              </th>
              <th className="border-r border-slate-300 bg-[#EEF3F8] px-1.5 py-2 text-center text-[11px] font-bold uppercase tracking-[0.08em] text-[#102C57]">
                หน่วย
              </th>
              {dates.map((date) => {
                const wipLines = Array.isArray(wipByDate?.[date]) ? wipByDate[date] : [];
                const dateStatus = dateVerification.get(date) || { totalRows: 0, verifiedRows: 0, verified: false };
                const isPast = date < today;
                const isConfirmingDate = savingKeys.has(`verify-date|${date}`);
                return (
                  <th
                    key={date}
                    className={`border-r border-slate-300 bg-[#F8FAFC] px-1.5 py-2 text-center align-top text-[11px] font-semibold ${
                      date < today ? "text-slate-400" : "text-[#102C57]"
                    }`}
                  >
                    <div className="text-[12px] font-bold tracking-[0.04em]">{formatShortThaiDate(date)}</div>
                    {editable && handleConfirmDate && dateStatus.unclaimedRows > 0 ? (
                      <div className="mt-1 border-t border-slate-300 pt-1">
                        {dateStatus.verified ? (
                          <span className="whitespace-nowrap text-[9px] font-bold text-emerald-600">ตรวจสอบแล้ว</span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleConfirmDate(date)}
                            disabled={isPast || isConfirmingDate}
                            className="border border-[#102C57] bg-white px-2 py-0.5 text-[9px] font-bold tracking-[0.04em] text-[#102C57] transition-colors hover:bg-[var(--surface-navy,#102C57)] hover:text-white disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-300"
                          >
                            {isConfirmingDate ? "กำลังยืนยัน..." : "ยืนยันวันนี้"}
                          </button>
                        )}
                      </div>
                    ) : null}
                    {wipLines.length ? (
                      <div className="mt-1 border-t border-slate-300 pt-1 normal-case">
                        {wipLines.map((line, index) => (
                          <div
                            key={`${date}-${line.name}-${index}`}
                            className="whitespace-nowrap text-[10px] leading-4 text-[#102C57]"
                            title={`${line.name} ${line.displayQty}`}
                          >
                            <span className="font-medium">{line.name}</span>{" "}
                            <span className="font-bold text-[#8B1E16]">{line.displayQty}</span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </th>
                );
              })}
              <th className="border-l border-slate-300 bg-[#E6EDF5] px-1.5 py-2 text-center text-[11px] font-bold uppercase tracking-[0.08em] text-[#102C57]">
                รวม
              </th>
            </tr>
          </thead>
          <tbody>
            {materials.map((material, index) => {
              const rowKey = material.materialKey || material.matGoodsCode || material.matSkuCode;
              const isExpanded = expandedSkus.has(rowKey);
              const rowTone = index % 2 === 0 ? "bg-white" : "bg-[#FAFBFC]";
              const deptRows = Object.values(
                dates.reduce((accumulator, date) => {
                  const byDept = material.byDate?.[date]?.byDept || {};
                  Object.entries(byDept).forEach(([deptId, dept]) => {
                    if (!accumulator[deptId]) {
                      accumulator[deptId] = {
                        deptId,
                        deptName: dept.deptName,
                        canEdit: dept.canEdit !== false,
                        byDate: {},
                      };
                    }
                    accumulator[deptId].byDate[date] = dept;
                  });
                  return accumulator;
                }, {})
              );

              return [
                <tr key={rowKey} className={`border-b border-slate-300 ${rowTone}`}>
                  <td className={`sticky left-0 z-10 border-r border-slate-300 px-2.5 py-2 ${rowTone}`}>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setExpandedSkus((prev) => {
                          const next = new Set(prev);
                          if (next.has(rowKey)) next.delete(rowKey);
                          else next.add(rowKey);
                          return next;
                        })}
                        className="flex h-4 w-4 shrink-0 items-center justify-center text-slate-400 transition hover:bg-[#EEF3F8] hover:text-[#102C57]"
                        title={isExpanded ? "ซ่อนรายละเอียด" : "แสดงรายละเอียด"}
                      >
                        <svg
                          className={`h-3 w-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="m9 18 6-6-6-6" />
                        </svg>
                      </button>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-slate-800" title={material.matName}>
                          {material.matName}
                        </div>
                        <div className="text-[10px] font-mono text-slate-400" title={material.matGoodsCode || material.matSkuCode}>
                          {material.matGoodsCode || material.matSkuCode}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="border-r border-slate-300 px-1.5 py-2 text-center text-[12px] font-medium text-slate-600">
                    {material.unit || "-"}
                  </td>
                  {dates.map((date) => {
                    const cell = material.byDate?.[date];
                    const allClaimed = cell && cell.totalRows > 0 && cell.claimedRows === cell.totalRows;
                    return (
                      <td
                        key={date}
                        className={`border-r border-slate-300 px-1.5 py-2 text-center ${
                          allClaimed ? "bg-emerald-50/40" : ""
                        }`}
                      >
                        {cell ? (
                          <div className="flex flex-col items-center gap-0.5">
                            <span className={`text-[13px] font-semibold ${allClaimed ? "text-emerald-700" : "text-slate-800"}`}>
                              {fmtQty(cell.totalQty)}
                            </span>
                            {allClaimed ? (
                              <span className="text-[10px] font-semibold text-emerald-500">เคลมแล้ว</span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-[12px] text-slate-200">-</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="border-l border-slate-300 bg-[#E6EDF5] px-1.5 py-2 text-center">
                    <span className="text-[13px] font-bold text-[#102C57]">{fmtQty(material.weeklyTotal)}</span>
                  </td>
                </tr>,
                ...(isExpanded
                  ? deptRows.map((deptRow) => {
                      const deptWeekly = dates.reduce((sum, date) => sum + (deptRow.byDate[date]?.qty ?? 0), 0);
                      return (
                        <tr key={`${rowKey}|${deptRow.deptId}`} className="border-b border-slate-300 bg-[#F3F6FA]">
                          <td className="sticky left-0 z-10 border-r border-slate-300 bg-[#F3F6FA] px-2.5 py-2">
                            <div className="ml-7 flex items-center gap-1.5">
                              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--surface-navy,#102C57)]/60" />
                              <span className="text-[11px] font-semibold text-slate-600" title={deptRow.deptName}>
                                {deptRow.deptName}
                              </span>
                            </div>
                          </td>
                          <td className="border-r border-slate-300 px-1.5 py-2 text-center" />
                          {dates.map((date) => {
                            const cell = deptRow.byDate[date];
                            const isSaving = savingKeys.has(`${material.matSkuCode}|${date}|${deptRow.deptId}`);
                            const isVerifySaving = savingKeys.has(`verify|${material.matSkuCode}|${date}|${deptRow.deptId}`);
                            const isPast = date < today;
                            const actionDisabled = !editable || isSaving || isVerifySaving || isPast || cell?.allClaimed || deptRow.canEdit === false;
                            const verifyActionDisabled = !editable || isSaving || isVerifySaving || isPast || cell?.allClaimed || deptRow.canEdit === false;
                            return (
                              <td
                                key={date}
                                className={`border-r border-slate-300 px-1.5 py-2 text-center ${
                                  cell?.allClaimed ? "bg-emerald-50/40" : ""
                                }`}
                              >
                                {cell ? (
                                  <EditableQtyCell
                                    value={cell.qty}
                                    disabled={actionDisabled}
                                    replaceDisabled={actionDisabled}
                                    verifyDisabled={verifyActionDisabled}
                                    verified={Boolean(cell.verified)}
                                    onSave={(newQty) => handleQtyChange(
                                      material.matSkuCode,
                                      material.matGoodsCode,
                                      date,
                                      deptRow.deptId,
                                      deptRow.deptName,
                                      newQty
                                    )}
                                    onConfirmVerify={handleConfirmVerify ? () => handleConfirmVerify(
                                      material.matSkuCode,
                                      material.matGoodsCode,
                                      date,
                                      deptRow.deptId,
                                      deptRow.deptName
                                    ) : null}
                                    onReplace={() => handleReplaceMaterial({
                                      materialSkuCode: material.matSkuCode,
                                      materialGoodsCode: material.matGoodsCode,
                                      materialName: material.matName,
                                      workDate: date,
                                      departmentId: deptRow.deptId,
                                      departmentName: deptRow.deptName,
                                      issueQty: cell.qty,
                                    })}
                                  />
                                ) : (
                                  <span className="text-[12px] text-slate-200">-</span>
                                )}
                              </td>
                            );
                          })}
                          <td className="border-l border-slate-300 bg-[#E6EDF5] px-1.5 py-2 text-center">
                            <span className="text-[12px] font-semibold text-[#102C57]/70">{fmtQty(deptWeekly)}</span>
                          </td>
                        </tr>
                      );
                    })
                  : []),
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function MaterialVerifyClient({
  initialMasterPlanNo,
  initialDateFrom,
  initialDateTo,
  planOptions = [],
}) {
  const [masterPlanNo, setMasterPlanNo] = useState(initialMasterPlanNo || "");
  const [dateFrom, setDateFrom] = useState(initialDateFrom || "");
  const [dateTo, setDateTo] = useState(initialDateTo || "");
  const [activeTab, setActiveTab] = useState(MATERIAL_TAB_ID);
  const [savingKeys, setSavingKeys] = useState(new Set());
  const [errorMsg, setErrorMsg] = useState("");
  const [feedbackMsg, setFeedbackMsg] = useState("");
  const [expandedSkus, setExpandedSkus] = useState(new Set());
  const [replaceState, setReplaceState] = useState(null);
  const [replaceSaving, setReplaceSaving] = useState(false);

  const apiUrl = useMemo(() => {
    if (!masterPlanNo) return null;
    const query = new URLSearchParams({ masterPlanNo, grain: "daily", dateFrom, dateTo });
    return `/api/production-planning/material-verify?${query.toString()}`;
  }, [masterPlanNo, dateFrom, dateTo]);

  const { data, mutate, isLoading } = useSWR(apiUrl, fetcher, { revalidateOnFocus: false });

  const [rejectionReason, setRejectionReason] = useState("");
  const [isActing, setIsActing] = useState(false);

  const summaryUrl = useMemo(() => {
    if (!masterPlanNo) return null;
    return `/api/production-planning/material-verify/summary?masterPlanNo=${encodeURIComponent(masterPlanNo)}`;
  }, [masterPlanNo]);

  const { data: summaryData, mutate: mutateSummary } = useSWR(summaryUrl, fetcher, { revalidateOnFocus: false });

  const handleVerifyAction = useCallback(async (action) => {
    if (!masterPlanNo) return;
    if (action === "reject" && !rejectionReason.trim()) {
      setErrorMsg("กรุณาระบุเหตุผลในการปฏิเสธแผน");
      return;
    }

    setIsActing(true);
    setErrorMsg("");
    setFeedbackMsg("");

    try {
      const response = await fetch("/api/production-planning/material-verify/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterPlanNo,
          action,
          reason: rejectionReason.trim(),
        }),
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result?.error || `ทำรายการ ${action} ไม่สำเร็จ`);
      }

      setFeedbackMsg(action === "accept" ? "อนุมัติแผนการผลิตและเผยแพร่สำเร็จแล้ว" : "ปฏิเสธแผนการผลิตเรียบร้อยแล้ว");
      setRejectionReason("");
      await Promise.all([mutateSummary(), mutate()]);
    } catch (err) {
      setErrorMsg(err.message || "เกิดข้อผิดพลาดในการทำรายการ");
    } finally {
      setIsActing(false);
    }
  }, [masterPlanNo, rejectionReason, mutateSummary, mutate]);

  const dates = Array.isArray(data?.dates) ? data.dates : [];
  const materialView = data?.materialView || {
    materials: [],
    wipByDate: {},
    tab: { id: MATERIAL_TAB_ID, label: "รวมวัตถุดิบที่รับผิดชอบ" },
  };
  const planTabs = useMemo(() => (Array.isArray(data?.planTabs) ? data.planTabs : []), [data]);
  const planViews = data?.planViews || {};
  const meta = data?.meta || {};
  const today = new Date().toISOString().slice(0, 10);

  const allTabs = useMemo(
    () => [materialView.tab || { id: MATERIAL_TAB_ID, label: "รวมวัตถุดิบที่รับผิดชอบ" }, ...planTabs],
    [materialView.tab, planTabs]
  );

  const handleQtyChange = useCallback(async (matSkuCode, matGoodsCode, date, deptId, deptName, newTotalQty) => {
    const key = `${matSkuCode}|${date}|${deptId}`;
    setSavingKeys((prev) => new Set([...prev, key]));
    setErrorMsg("");

    try {
      const response = await fetch("/api/production-planning/material-verify/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterPlanNo,
          materialSkuCode: matSkuCode,
          materialGoodsCode: matGoodsCode,
          grain: "daily",
          materialOwnerDepartmentId: deptId,
          workDate: date,
          issueQty: newTotalQty,
          reason: "verify_adjustment",
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorMsg(payload?.error || "บันทึกไม่สำเร็จ");
      } else {
        setFeedbackMsg(`อัปเดต ${matSkuCode} วันที่ ${formatShortThaiDate(date)} (${deptName}) เรียบร้อย`);
        mutate();
      }
    } catch {
      setErrorMsg("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setSavingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [masterPlanNo, mutate]);

  const handleReplaceMaterial = useCallback((payload) => {
    setReplaceState(payload);
    setErrorMsg("");
  }, []);

  const handleConfirmDate = useCallback(async (date) => {
    const key = `verify-date|${date}`;
    setSavingKeys((prev) => new Set([...prev, key]));
    setErrorMsg("");

    try {
      const response = await fetch("/api/production-planning/material-verify/confirm-date", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterPlanNo,
          grain: "daily",
          workDate: date,
        }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorMsg(payload?.error || "ยืนยันตรวจสอบรายวันไม่สำเร็จ");
      } else {
        setFeedbackMsg(`ยืนยันตรวจสอบวันที่ ${formatShortThaiDate(date)} เรียบร้อย`);
        await mutate();
      }
    } catch {
      setErrorMsg("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setSavingKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }
  }, [masterPlanNo, mutate]);

  const handleSelectReplacement = useCallback(async (option) => {
    if (!replaceState) return;
    setReplaceSaving(true);
    setErrorMsg("");

    try {
      const response = await fetch("/api/production-planning/material-verify/replace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterPlanNo,
          grain: "daily",
          currentMaterialSkuCode: replaceState.materialSkuCode,
          currentMaterialGoodsCode: replaceState.materialGoodsCode,
          targetMaterialSkuCode: option.skuCode,
          targetMaterialGoodsCode: option.goodsCode,
          materialOwnerDepartmentId: replaceState.departmentId,
          workDate: replaceState.workDate,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setErrorMsg(payload?.error || "เปลี่ยนวัตถุดิบไม่สำเร็จ");
        return;
      }

      setFeedbackMsg(
        `เปลี่ยนวัตถุดิบ ${replaceState.materialName} เป็น ${option.name} วันที่ ${formatShortThaiDate(replaceState.workDate)} (${replaceState.departmentName}) เรียบร้อย`
      );
      setReplaceState(null);
      await mutate();
    } catch {
      setErrorMsg("เกิดข้อผิดพลาด กรุณาลองใหม่");
    } finally {
      setReplaceSaving(false);
    }
  }, [masterPlanNo, mutate, replaceState]);

  const modeLabel = meta.isAdmin
    ? "ผู้ดูแลระบบ เห็นวัตถุดิบทั้งหมด"
    : "เห็นเฉพาะวัตถุดิบที่แผนกของคุณรับผิดชอบ";

  const materials = Array.isArray(materialView?.materials) ? materialView.materials : [];
  const activePlanView = activeTab !== MATERIAL_TAB_ID ? planViews?.[activeTab] || null : null;

  return (
    <div className="space-y-3">
      <div className="border border-slate-400 bg-white p-3 shadow-none lg:p-2.5">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">แผนหลัก</label>
            <select
              value={masterPlanNo}
              onChange={(event) => setMasterPlanNo(event.target.value)}
              className="h-9 border border-slate-300 px-3 text-sm focus:border-[#102C57] focus:outline-none lg:h-8 lg:text-[13px]"
            >
              <option value="">- เลือกแผน -</option>
              {planOptions.map((planNo) => (
                <option key={planNo} value={planNo}>{planNo}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">วันที่เริ่ม</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="h-9 border border-slate-300 px-3 text-sm focus:border-[#102C57] focus:outline-none lg:h-8 lg:text-[13px]"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold text-slate-600">วันที่สิ้นสุด</label>
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="h-9 border border-slate-300 px-3 text-sm focus:border-[#102C57] focus:outline-none lg:h-8 lg:text-[13px]"
            />
          </div>
          <div className="ml-auto border border-[#102C57]/20 bg-[#EEF3F8] px-3 py-1.5 text-[11px] font-semibold text-[#102C57] lg:px-2.5 lg:py-1 lg:text-[10px]">
            {modeLabel}
          </div>
        </div>
      </div>

      {summaryData && (
        <div className="border-2 border-[#102C57] bg-white shadow-lg overflow-hidden flex flex-col md:flex-row gap-4 p-4 rounded-none">
          <div className="flex-1 space-y-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-[#d4af37]" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-[#102C57]">
                ผลการคำนวณและตรวจสอบความเพียงพอวัตถุดิบ
              </h3>
            </div>
            
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="bg-[#EEF3F8] p-3 border-l-2 border-[#102C57]">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">สถานะอนุมัติแผน</div>
                <div className="mt-1 text-sm font-bold text-[#102C57]">
                  {summaryData.status === "pending_verify" && "รอตรวจวัตถุดิบ (Pending)"}
                  {summaryData.status === "published" && "เผยแพร่แล้ว (Published)"}
                  {summaryData.status === "rejected" && "ถูกปฏิเสธ (Rejected)"}
                  {summaryData.status === "draft" && "แบบร่าง (Draft)"}
                </div>
              </div>
              <div className="bg-[#EEF3F8] p-3 border-l-2 border-[#d4af37]">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">วัตถุดิบรวม</div>
                <div className="mt-1 text-sm font-bold text-[#102C57]">
                  {summaryData.consolidated?.length || 0} รายการ
                </div>
              </div>
              <div className="bg-[#EEF3F8] p-3 border-l-2 border-red-500">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 font-bold">ขาดแคลน</div>
                <div className="mt-1 text-sm font-bold text-red-600">
                  {summaryData.consolidated?.filter((item) => item.shortageQty > 0).length || 0} รายการ
                </div>
              </div>
            </div>

            {summaryData.consolidated?.filter(item => item.shortageQty > 0).length > 0 ? (
              <div className="border border-red-200 bg-red-50/50 p-3 rounded-none text-xs">
                <p className="font-bold text-red-800">⚠️ รายการวัตถุดิบที่ขาดแคลนสำหรับแผนนี้:</p>
                <ul className="mt-1.5 space-y-1 list-disc list-inside text-red-700 font-medium font-mono">
                  {summaryData.consolidated
                    .filter(item => item.shortageQty > 0)
                    .map((item, idx) => (
                      <li key={`short-${item.materialCode}-${idx}`}>
                        {item.materialName} ({item.materialCode}) - ขาด {item.shortageQty.toLocaleString()} {item.unit} (มี {item.stockQty.toLocaleString()} / ใช้ {item.requiredQty.toLocaleString()})
                      </li>
                    ))
                  }
                </ul>
              </div>
            ) : (
              <div className="border border-emerald-200 bg-emerald-50/50 p-3 rounded-none text-xs text-emerald-800 font-semibold flex items-center gap-1.5">
                <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m5 13 4 4L19 7" />
                </svg>
                วัตถุดิบทุกรายการมีความเพียงพอสำหรับแผนการผลิตสัปดาห์นี้
              </div>
            )}
          </div>

          <div className="w-full md:w-[320px] border-t md:border-t-0 md:border-l border-slate-200 pt-4 md:pt-0 md:pl-4 flex flex-col justify-between">
            <div>
              <label className="text-[11px] font-bold uppercase tracking-wider text-[#102C57] block mb-1">
                ระบุหมายเหตุ / เหตุผลกรณีปฏิเสธแผนงาน
              </label>
              <textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                disabled={summaryData.status !== "pending_verify" || isActing}
                placeholder={summaryData.status === "pending_verify" ? "กรุณากรอกเหตุผล หากต้องการปฏิเสธแผน..." : "ไม่ต้องระบุ"}
                className="w-full h-20 text-xs border border-slate-300 p-2 focus:outline-none focus:border-[#102C57] bg-white text-slate-800 resize-none disabled:bg-slate-100 disabled:text-slate-500"
              />
            </div>

            {summaryData.status === "pending_verify" && (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => handleVerifyAction("reject")}
                  disabled={isActing}
                  className="flex-1 h-9 rounded-none border border-red-500 text-red-600 bg-white hover:bg-red-50 text-xs font-bold transition-all disabled:opacity-50"
                >
                  ปฏิเสธแผน (Reject)
                </button>
                <button
                  type="button"
                  onClick={() => handleVerifyAction("accept")}
                  disabled={isActing}
                  className="flex-1 h-9 rounded-none bg-[var(--surface-navy,#102C57)] border border-[#102C57] text-white hover:bg-[#0b1f3f] text-xs font-bold transition-all flex items-center justify-center gap-1 disabled:opacity-50"
                >
                  {isActing ? (
                    <div className="h-3 w-3 animate-spin border-2 border-white border-t-transparent rounded-full" />
                  ) : (
                    <>
                      <span className="text-[#d4af37]">✓</span> ยอมรับแผน (Accept)
                    </>
                  )}
                </button>
              </div>
            )}

            {summaryData.status === "published" && (
              <div className="mt-3 bg-emerald-100 border border-emerald-200 text-emerald-800 text-xs font-bold p-2 text-center">
                ยอมรับแผนการผลิตนี้แล้ว
              </div>
            )}

            {summaryData.status === "rejected" && (
              <div className="mt-3 bg-red-100 border border-red-200 text-red-800 text-xs font-bold p-2 text-center">
                ปฏิเสธแผนการผลิตนี้แล้ว
                {summaryData.rejectReason && (
                  <div className="font-normal mt-1 text-slate-600">
                    เหตุผล: &quot;{summaryData.rejectReason}&quot;
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {allTabs.length > 0 ? (
        <div className="border border-slate-400 bg-white px-2 py-2 shadow-none lg:px-2 lg:py-1.5">
          <div className="flex flex-wrap gap-1.5">
            {allTabs.map((tab) => {
              const isActive = tab.id === activeTab;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.08em] transition-colors lg:px-2.5 lg:py-1 lg:text-[11px] ${
                    isActive
                      ? "border-[#102C57] bg-[var(--surface-navy,#102C57)] text-white"
                      : "border-slate-300 bg-white text-[#102C57] hover:bg-[#EEF3F8]"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {errorMsg ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMsg}</div>
      ) : null}

      {feedbackMsg ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{feedbackMsg}</div>
      ) : null}

      {isLoading ? (
        <div className="rounded-xl border border-slate-200 bg-white py-16 text-center text-sm text-slate-400">กำลังโหลด...</div>
      ) : null}

      {!isLoading && !masterPlanNo ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
          เลือกแผนเพื่อดูข้อมูล
        </div>
      ) : null}

      {!isLoading && masterPlanNo && activeTab === MATERIAL_TAB_ID && !materials.length ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-white py-16 text-center text-sm text-slate-400">
          ไม่มีวัตถุดิบที่แผนกของคุณต้องรับผิดชอบในแผนนี้
        </div>
      ) : null}

      {!isLoading && masterPlanNo && activeTab !== MATERIAL_TAB_ID ? (
        <MaterialTable
          dates={dates}
          materials={Array.isArray(activePlanView?.materials) ? activePlanView.materials : []}
          today={today}
          savingKeys={savingKeys}
          expandedSkus={expandedSkus}
          setExpandedSkus={setExpandedSkus}
          handleQtyChange={handleQtyChange}
          handleReplaceMaterial={handleReplaceMaterial}
          handleConfirmVerify={null}
          handleConfirmDate={null}
          wipByDate={activePlanView?.wipByDate || {}}
          editable={false}
        />
      ) : null}

      {!isLoading && materials.length > 0 && activeTab === MATERIAL_TAB_ID ? (
        <MaterialTable
          dates={dates}
          materials={materials}
          today={today}
          savingKeys={savingKeys}
          expandedSkus={expandedSkus}
          setExpandedSkus={setExpandedSkus}
          handleQtyChange={handleQtyChange}
          handleReplaceMaterial={handleReplaceMaterial}
          handleConfirmVerify={null}
          handleConfirmDate={handleConfirmDate}
          wipByDate={materialView?.wipByDate || {}}
          editable
        />
      ) : null}

      <ReplaceMaterialDrawer
        state={replaceState}
        saving={replaceSaving}
        onClose={() => {
          if (!replaceSaving) setReplaceState(null);
        }}
        onSelect={handleSelectReplacement}
      />
    </div>
  );
}
