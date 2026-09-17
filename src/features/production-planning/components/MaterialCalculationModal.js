"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckSquare,
  CircleCheck,
  MinusCircle,
  RefreshCcw,
  Save,
  X,
} from "lucide-react";

const formatNumber = (num) => {
  if (!Number.isFinite(num)) return "-";
  return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
};

const formatCeilNumber = (num) => {
  if (!Number.isFinite(num)) return "-";
  return Math.ceil(num).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
};

const normalizeSku = (value) => String(value || "").trim().toUpperCase();
const normalizeGoodsCode = (value, fallback = "") => {
  const normalized = normalizeSku(value);
  return normalized || normalizeSku(fallback);
};
const resolveMaterialCode = (item = {}) =>
  normalizeGoodsCode(item.goodsCode || item.materialGoodsCode, item.skuCode);
const resolveMaterialKey = (item = {}) => `${normalizeSku(item.skuCode)}::${resolveMaterialCode(item)}`;
const normalizeMaterialStatus = (value, fallback = "available") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "available" || normalized === "shortage" || normalized === "late-availability") {
    return normalized;
  }
  return fallback;
};

export default function MaterialCalculationModal({
  isOpen,
  onClose,
  result = [],
  breakdown = {},
  plannedItems = [],
  onRecalculate,
  onApplySelection,
  isRecalculating = false,
  applyActionLabel = "ใช้รายการที่เลือก",
}) {
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [qtyOverrides, setQtyOverrides] = useState(new Map());
  const [materialOverrides, setMaterialOverrides] = useState(new Map());
  const fgDemandRows = Array.isArray(breakdown?.fgDemand) ? breakdown.fgDemand : [];
  const wipDemandRows = Array.isArray(breakdown?.wipDemand) ? breakdown.wipDemand : [];
  const rawRequisitionRows = Array.isArray(breakdown?.rawRequisition) ? breakdown.rawRequisition : [];
  const warningRows = Array.isArray(breakdown?.warnings) ? breakdown.warnings : [];
  const planSummaries = Array.isArray(breakdown?.planSummaries) ? breakdown.planSummaries : [];
  const planMaterials = Array.isArray(breakdown?.planMaterials) ? breakdown.planMaterials : [];

  useEffect(() => {
    if (!isOpen) return;
    setSelectedIds(new Set(plannedItems.map((p) => p.id)));
    const initialQty = new Map();
    plannedItems.forEach((p) => initialQty.set(p.id, p.quantity));
    setQtyOverrides(initialQty);
    setMaterialOverrides(new Map());
  }, [isOpen, plannedItems]);

  const materialRows = useMemo(() => {
    const rows = Array.isArray(result) ? result : [];
    return rows.map((item) => {
      const sku = normalizeSku(item.skuCode);
      const goodsCode = resolveMaterialCode(item);
      const materialKey = resolveMaterialKey(item);
      const override = materialOverrides.get(materialKey);
      const mode = override?.mode || "formula";
      const baseRequired = Number(item.requiredQty) || 0;
      const baseIssue = Math.ceil(baseRequired);
      const customRequired = Number(override?.requiredQty);
      const customIssue = Number(override?.issueQty);
      const requiredQty = mode === "skip"
        ? 0
        : mode === "custom" && Number.isFinite(customRequired) && customRequired >= 0
          ? customRequired
          : baseRequired;
      const issueQty = mode === "skip"
        ? 0
        : mode === "custom" && Number.isFinite(customIssue) && customIssue >= 0
          ? customIssue
          : baseIssue;
      const stockQty = Number(item.stockQty) || 0;
      const backendStatus = normalizeMaterialStatus(item.materialStatus || item.status, "");
      const formulaIsEnough = backendStatus
        ? backendStatus === "available"
        : issueQty <= stockQty;
      const isEnough = mode === "formula" ? formulaIsEnough : issueQty <= stockQty;

      return {
        ...item,
        sku,
        goodsCode,
        materialKey,
        mode,
        baseRequired,
        baseIssue,
        requiredQty,
        issueQty,
        stockQty,
        isEnough,
        materialStatus: normalizeMaterialStatus(item.materialStatus, isEnough ? "available" : "shortage"),
        reason: String(override?.reason || "").trim(),
      };
    });
  }, [materialOverrides, result]);

  const insufficientItems = useMemo(
    () => materialRows.filter((item) => !item.isEnough),
    [materialRows]
  );

  const totalItems = materialRows.length;
  const sufficientCount = Math.max(0, totalItems - insufficientItems.length);

  const hasMissingReason = materialRows.some(
    (item) => item.mode !== "formula" && !item.reason
  );

  const hasInvalidCustomValues = materialRows.some((item) => {
    if (item.mode !== "custom") return false;
    return !Number.isFinite(Number(item.requiredQty)) ||
      Number(item.requiredQty) < 0 ||
      !Number.isFinite(Number(item.issueQty)) ||
      Number(item.issueQty) < 0;
  });

  const toggleSelect = (id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleRecalc = async () => {
    if (!onRecalculate) return;
    await onRecalculate(selectedIds, qtyOverrides);
  };

  const handleApply = () => {
    if (!onApplySelection) return;
    onApplySelection(selectedIds, qtyOverrides, {
      materials: materialRows.map((item) => ({
        skuCode: item.skuCode,
        goodsCode: item.goodsCode || item.skuCode,
        materialGoodsCode: item.goodsCode || item.skuCode,
        skuName: item.skuName,
        requiredQty: Number(item.requiredQty) || 0,
        issueQty: Number(item.issueQty) || 0,
        stockQty: Number(item.stockQty) || 0,
        requiredUnit: item.requiredUnit || item.unit || "",
        unit: item.requiredUnit || item.unit || "",
        leadTime: item.leadTime ?? "-",
        status: item.isEnough ? "Sufficient" : "Insufficient",
        materialStatus: normalizeMaterialStatus(item.materialStatus, item.isEnough ? "available" : "shortage"),
        diff: Number.isFinite(Number(item.diff)) ? Number(item.diff) : Number(item.stockQty) - Number(item.issueQty),
        override: item.mode === "formula"
          ? null
          : {
            mode: item.mode,
            reason: item.reason,
            baseRequiredQty: Number(item.baseRequired) || 0,
            baseIssueQty: Number(item.baseIssue) || 0,
          },
      })),
      planMaterials,
      planSummaries,
    });
    onClose();
  };

  const handleSuggest = async () => {
    if (!onRecalculate) return;
    setIsSuggesting(true);
    try {
      let ids = new Set(plannedItems.map((p) => p.id));
      for (let i = 0; i < plannedItems.length; i++) {
        const res = await onRecalculate(ids);
        const items = res?.data?.items ?? res?.items ?? [];
        const stillShort = items.some(
          (it) => normalizeMaterialStatus(it?.materialStatus, it?.status) !== "available"
        );
        if (!stillShort) {
          setSelectedIds(new Set(ids));
          return;
        }
        const remaining = plannedItems.filter((p) => ids.has(p.id));
        if (!remaining.length) break;
        const toRemove = remaining.reduce((max, p) => (p.quantity > max.quantity ? p : max), remaining[0]);
        ids.delete(toRemove.id);
      }
      setSelectedIds(new Set(ids));
    } finally {
      setIsSuggesting(false);
    }
  };

  const setOverrideMode = (materialKey, mode, baseRequired, baseIssue) => {
    setMaterialOverrides((prev) => {
      const next = new Map(prev);
      if (mode === "formula") {
        next.delete(materialKey);
        return next;
      }
      const current = next.get(materialKey) || {};
      next.set(materialKey, {
        mode,
        requiredQty: mode === "skip" ? 0 : (Number.isFinite(Number(current.requiredQty)) ? Number(current.requiredQty) : baseRequired),
        issueQty: mode === "skip" ? 0 : (Number.isFinite(Number(current.issueQty)) ? Number(current.issueQty) : baseIssue),
        reason: String(current.reason || ""),
      });
      return next;
    });
  };

  const setOverrideNumber = (materialKey, key, value) => {
    setMaterialOverrides((prev) => {
      const next = new Map(prev);
      const current = next.get(materialKey) || { mode: "custom", requiredQty: 0, issueQty: 0, reason: "" };
      next.set(materialKey, {
        ...current,
        mode: current.mode === "skip" ? "custom" : (current.mode || "custom"),
        [key]: value === "" ? "" : Math.max(0, Number(value) || 0),
      });
      return next;
    });
  };

  const setOverrideReason = (materialKey, reason) => {
    setMaterialOverrides((prev) => {
      const next = new Map(prev);
      const current = next.get(materialKey) || { mode: "custom", requiredQty: 0, issueQty: 0, reason: "" };
      next.set(materialKey, {
        ...current,
        reason,
      });
      return next;
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl overflow-hidden flex flex-col max-h-[92vh]">
        <div className="px-6 py-5 bg-[#102C57] text-white flex justify-between items-center shrink-0">
          <div>
            <h2 className="text-xl font-bold">สรุปรายการวัตถุดิบที่ต้องใช้</h2>
            <p className="text-xs text-white/70 mt-1">ก่อนบันทึก คุณสามารถปรับจำนวนใช้/จำนวนเบิกเฉพาะรอบนี้ได้</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10 rounded-full transition-colors"
          >
            <X size={22} />
          </button>
        </div>

        <div className="flex-1 overflow-auto bg-gray-50 p-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[#b91c1c] bg-[#fef2f2] px-3 py-2 text-xs text-[#7f1d1d] flex items-center gap-2">
              <AlertTriangle size={14} className="text-[#b91c1c]" />
              <div>
                <p className="font-semibold text-sm">วัตถุดิบขาด</p>
                <p className="text-[11px] text-[#7f1d1d]/80">{insufficientItems.length} รายการ</p>
              </div>
            </div>
            <div className="rounded-xl border border-[#102C57]/15 bg-white px-3 py-2 text-xs text-[#102C57] flex items-center gap-2 shadow-sm">
              <CircleCheck size={14} className="text-emerald-600" />
              <div>
                <p className="font-semibold text-sm">พร้อมใช้</p>
                <p className="text-[11px] text-[#102C57]/70">{sufficientCount} รายการ</p>
              </div>
            </div>
            <div className="rounded-xl border border-[#102C57]/10 bg-white px-3 py-2 text-xs text-[#102C57] flex items-center gap-2 shadow-sm">
              <CheckSquare size={14} className="text-[#d4af37]" />
              <div>
                <p className="font-semibold text-sm">รายการทั้งหมด</p>
                <p className="text-[11px] text-[#102C57]/70">{totalItems} รายการ</p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-[#102C57]/10 bg-white p-3 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#102C57]">สรุปการแตกสูตร</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-gray-200 bg-[#f8fafc] px-3 py-2 text-xs text-[#102C57]">
                FG Demand: <span className="font-bold">{fgDemandRows.length}</span> รายการ
              </div>
              <div className="rounded-lg border border-gray-200 bg-[#f8fafc] px-3 py-2 text-xs text-[#102C57]">
                WIP Demand: <span className="font-bold">{wipDemandRows.length}</span> รายการ
              </div>
              <div className="rounded-lg border border-gray-200 bg-[#f8fafc] px-3 py-2 text-xs text-[#102C57]">
                RAW Requisition: <span className="font-bold">{rawRequisitionRows.length}</span> รายการ
              </div>
            </div>
            {warningRows.length > 0 && (
              <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <p className="font-semibold">คำเตือนจาก BOM Explosion</p>
                <ul className="mt-1 list-disc pl-4">
                  {warningRows.slice(0, 5).map((warning, index) => (
                    <li key={`${warning?.skuCode || "warn"}-${index}`}>
                      {warning?.message || `SKU ${warning?.skuCode || "-"} มีปัญหาโครงสร้างสูตร`}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {materialRows.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-gray-400">
              <p>ไม่พบรายการวัตถุดิบ</p>
            </div>
          ) : (
            <>
              <div className="hidden lg:block bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-sm text-left border-collapse">
                  <thead className="bg-[#102C57] text-white font-semibold uppercase text-xs sticky top-0 z-10 shadow-sm">
                    <tr>
                      <th className="px-4 py-3 border-b border-[#0f1c36] w-[120px]">รหัสวัตถุดิบ</th>
                      <th className="px-4 py-3 border-b border-[#0f1c36]">ชื่อวัตถุดิบ</th>
                      <th className="px-4 py-3 border-b border-[#0f1c36] text-center w-[120px]">จำนวนใช้</th>
                      <th className="px-4 py-3 border-b border-[#0f1c36] text-center w-[120px]">จำนวนเบิก</th>
                      <th className="px-4 py-3 border-b border-[#0f1c36] text-center w-[120px]">คงเหลือ</th>
                      <th className="px-4 py-3 border-b border-[#0f1c36] text-center w-[100px]">หน่วย</th>
                      <th className="px-4 py-3 border-b border-[#0f1c36] text-center w-[120px]">สถานะ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {materialRows.map((item, idx) => {
                      const isInsufficientMat = !item.isEnough;
                      return (
                        <tr
                          key={`${item.materialKey}-${idx}`}
                          className={`${isInsufficientMat ? "bg-[#fef2f2]" : "bg-white"} hover:bg-blue-50/40 transition-colors`}
                        >
                          <td className="px-4 py-3 font-mono text-[#102C57] font-semibold">
                            {item.goodsCode || item.skuCode}
                            {item.goodsCode && item.goodsCode !== item.skuCode ? (
                              <div className="text-[10px] font-normal text-gray-400">{item.skuCode}</div>
                            ) : null}
                          </td>
                          <td className="px-4 py-3 text-gray-700">{item.skuName}</td>
                          <td className="px-4 py-3 text-center font-mono">{formatNumber(item.requiredQty)}</td>
                          <td className="px-4 py-3 text-center font-mono text-[#102C57] font-semibold">{formatCeilNumber(item.issueQty)}</td>
                          <td className={`px-4 py-3 text-center font-mono ${isInsufficientMat ? "text-red-600" : "text-emerald-700"}`}>
                            {formatNumber(item.stockQty)}
                          </td>
                          <td className="px-4 py-3 text-center text-gray-600">{item.requiredUnit || item.unit}</td>
                          <td className="px-4 py-3 text-center">
                            {isInsufficientMat ? (
                              <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-[#fee2e2] text-[#b91c1c] text-[11px] font-semibold min-w-[96px] justify-center">
                                <AlertTriangle size={12} /> ไม่พอ
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-emerald-100 text-emerald-700 text-[11px] font-semibold min-w-[96px] justify-center">
                                <CircleCheck size={12} /> พอ
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="rounded-xl border border-[#102C57]/15 bg-white shadow-sm">
                <div className="px-4 py-3 border-b border-gray-100">
                  <p className="text-sm font-semibold text-[#102C57]">ปรับจำนวนใช้/จำนวนเบิก (กรณีพิเศษ)</p>
                  <p className="text-[11px] text-gray-500">แก้เฉพาะรอบนี้ โดยไม่กระทบสูตร BOM หลัก และต้องระบุเหตุผลเมื่อมีการแก้ไข</p>
                </div>
                <div className="max-h-72 overflow-auto divide-y divide-gray-100">
                  {materialRows.map((item, idx) => (
                    <div key={`override-${item.materialKey}-${idx}`} className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded bg-blue-50 px-2 py-0.5 text-[11px] font-mono font-semibold text-[#102C57]">
                          {item.goodsCode || item.skuCode}
                        </span>
                        {item.goodsCode && item.goodsCode !== item.skuCode ? (
                          <span className="text-[10px] text-gray-400">SKU {item.skuCode}</span>
                        ) : null}
                        <span className="text-sm font-semibold text-gray-800">{item.skuName}</span>
                        <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.isEnough ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>
                          {item.isEnough ? "เพียงพอ" : "ไม่พอ"}
                        </span>
                      </div>
                      <div className="mt-2 grid gap-2 md:grid-cols-[140px_1fr_1fr_1.4fr]">
                        <select
                          value={item.mode}
                          onChange={(e) => setOverrideMode(item.materialKey, e.target.value, item.baseRequired, item.baseIssue)}
                          className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-xs font-semibold text-[#102C57] focus:border-[#102C57] focus:ring-1 focus:ring-[#102C57] outline-none"
                        >
                          <option value="formula">ตามสูตร</option>
                          <option value="custom">กำหนดเอง</option>
                          <option value="skip">ไม่เบิก</option>
                        </select>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={item.mode === "custom" ? (materialOverrides.get(item.materialKey)?.requiredQty ?? item.baseRequired) : item.requiredQty}
                          disabled={item.mode !== "custom"}
                          onChange={(e) => setOverrideNumber(item.materialKey, "requiredQty", e.target.value)}
                          className="h-9 rounded-lg border border-gray-200 px-2 text-xs font-semibold text-[#102C57] disabled:bg-gray-100"
                          placeholder="จำนวนใช้"
                        />
                        <input
                          type="number"
                          min={0}
                          step="1"
                          value={item.mode === "custom" ? (materialOverrides.get(item.materialKey)?.issueQty ?? item.baseIssue) : item.issueQty}
                          disabled={item.mode !== "custom"}
                          onChange={(e) => setOverrideNumber(item.materialKey, "issueQty", e.target.value)}
                          className="h-9 rounded-lg border border-gray-200 px-2 text-xs font-semibold text-[#102C57] disabled:bg-gray-100"
                          placeholder="จำนวนเบิก"
                        />
                        <input
                          type="text"
                          value={materialOverrides.get(item.materialKey)?.reason || ""}
                          onChange={(e) => setOverrideReason(item.materialKey, e.target.value)}
                          disabled={item.mode === "formula"}
                          className="h-9 rounded-lg border border-gray-200 px-2 text-xs text-gray-700 disabled:bg-gray-100"
                          placeholder={item.mode === "formula" ? "ไม่ต้องระบุเหตุผล" : "เหตุผลการแก้ไข"}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 px-4 py-3 border-b border-gray-100 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[#102C57]">เลือกรายการผลิตที่จะคำนวณ</p>
                <p className="text-[11px] text-gray-500">ติ๊กออกเพื่อลด/ตัดรายการ แล้วกด &quot;คำนวณใหม่&quot;</p>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set(plannedItems.map((p) => p.id)))}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
                >
                  <CheckSquare size={12} /> เลือกทั้งหมด
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedIds(new Set())}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
                >
                  <MinusCircle size={12} /> ล้าง
                </button>
              </div>
            </div>

            <div className="max-h-60 overflow-auto grid gap-2 sm:grid-cols-2 px-4 py-3 pr-3">
              {plannedItems.map((item) => {
                const checked = selectedIds.has(item.id);
                const currentQty = qtyOverrides.get(item.id) ?? item.quantity;
                return (
                  <label
                    key={item.id}
                    className={`flex items-start gap-3 rounded-xl border px-3 py-2 text-sm cursor-pointer transition-colors ${
                      checked ? "border-[#102C57] bg-[#f8fafc]" : "border-gray-200 bg-white"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 text-[#102C57]"
                      checked={checked}
                      onChange={() => toggleSelect(item.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs text-gray-600">
                        <span className="font-mono text-[#102C57] font-semibold bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                          {item.skuCode}
                        </span>
                        {item.hasBom === false && (
                          <span className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-2 py-0.5">
                            ไม่มีสูตร
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-semibold text-gray-800 truncate">{item.skuName}</p>
                      <p className="text-[11px] text-gray-500">
                        จำนวน Batch{" "}
                        <input
                          type="number"
                          min={0.0001}
                          step={0.0001}
                          value={currentQty}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (raw === "") {
                              setQtyOverrides((prev) => {
                                const map = new Map(prev);
                                map.set(item.id, "");
                                return map;
                              });
                              return;
                            }
                            const next = Math.max(0.0001, Number(raw) || 0.0001);
                            setQtyOverrides((prev) => {
                              const map = new Map(prev);
                              map.set(item.id, next);
                              return map;
                            });
                          }}
                          onBlur={(e) => {
                            if (e.target.value !== "") return;
                            setQtyOverrides((prev) => {
                              const map = new Map(prev);
                                map.set(item.id, 0.0001);
                                return map;
                              });
                          }}
                          className="w-20 inline-block rounded border border-gray-200 px-2 py-1 text-xs font-semibold text-[#102C57] bg-white"
                        />{" "}
                        {item.unit}
                      </p>
                    </div>
                  </label>
                );
              })}
              {plannedItems.length === 0 && <p className="text-xs text-gray-400">ไม่มีรายการผลิต</p>}
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-white border-t border-gray-200 flex flex-wrap justify-between items-center gap-3 shrink-0">
          <div className="text-[11px] text-gray-500">
            ปุ่ม &quot;{applyActionLabel}&quot; จะอัปเดตแผนผลิตด้วยค่าที่แก้ไขในหน้าต่างนี้
            {hasMissingReason && <span className="ml-2 text-amber-700">กรุณาระบุเหตุผลสำหรับรายการที่แก้ไข</span>}
            {hasInvalidCustomValues && <span className="ml-2 text-red-700">ค่าที่กำหนดเองต้องเป็นตัวเลขและไม่ติดลบ</span>}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSuggest}
              disabled={isSuggesting || isRecalculating || plannedItems.length === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-[#d4af37] bg-[#d4af37] text-sm font-semibold text-[#102C57] hover:bg-[#b5952f] disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isSuggesting ? (
                <>
                  <div className="h-4 w-4 animate-spin border-2 border-amber-400 border-t-transparent rounded-full" />
                  กำลังแนะนำ...
                </>
              ) : (
                <>
                  <AlertTriangle size={16} />
                  แนะนำรายการที่จะตัด
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleRecalc}
              disabled={selectedIds.size === 0 || isRecalculating}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-300 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isRecalculating ? (
                <>
                  <div className="h-4 w-4 animate-spin border-2 border-gray-400 border-t-transparent rounded-full" />
                  กำลังคำนวณใหม่...
                </>
              ) : (
                <>
                  <RefreshCcw size={16} />
                  คำนวณใหม่
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={hasMissingReason || hasInvalidCustomValues || selectedIds.size === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#102C57] text-white text-sm font-bold shadow-lg disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <Save size={16} />
              {applyActionLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
