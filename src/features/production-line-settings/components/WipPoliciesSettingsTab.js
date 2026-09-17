"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckSquare, RefreshCcw, Search } from "lucide-react";
import {
  fetchProductionWipPolicies,
  updateProductionWipPolicies,
} from "@/features/production-line-settings/services/productionLineSettingsClient";

const DEFAULT_LIMIT = 300;
const SUPPLY_MODE_OPTIONS = [
  { value: "stock", label: "ใช้สต็อก" },
  { value: "make_to_order", label: "ผลิตสด" },
  { value: "hybrid", label: "ผสม" },
];

function normalizeSupplyMode(value, fallback = "stock") {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "make_to_order") return "make_to_order";
  if (normalized === "hybrid") return "hybrid";
  return fallback;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function buildDraftForRow(row) {
  return {
    supplyMode: normalizeSupplyMode(row?.supplyMode),
    isActive: row?.isActive !== false,
    allowMasterPlan: row?.allowMasterPlan === true,
    requiresRequisition: row?.requiresRequisition === true,
    note: normalizeText(row?.note),
  };
}

function isDraftChanged(row, draft) {
  if (!row || !draft) return false;
  return (
    normalizeSupplyMode(draft.supplyMode) !== normalizeSupplyMode(row.supplyMode)
    || Boolean(draft.isActive) !== Boolean(row.isActive)
    || Boolean(draft.allowMasterPlan) !== Boolean(row.allowMasterPlan)
    || Boolean(draft.requiresRequisition) !== Boolean(row.requiresRequisition)
    || normalizeText(draft.note) !== normalizeText(row.note)
  );
}

export default function WipPoliciesSettingsTab({ canManage = false }) {
  const [rows, setRows] = useState([]);
  const [errorMessage, setErrorMessage] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");
  const [modeFilter, setModeFilter] = useState("all");
  const [draftBySku, setDraftBySku] = useState({});

  const loadRows = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    setFeedbackMessage("");
    const result = await fetchProductionWipPolicies({
      search: search.trim(),
      limit: String(DEFAULT_LIMIT),
    });
    setLoading(false);
    if (!result.ok) {
      setErrorMessage(result.error?.message || "โหลดนโยบาย WIP ไม่สำเร็จ");
      return;
    }
    const nextRows = Array.isArray(result.data?.data) ? result.data.data : [];
    setRows(nextRows);
    setDraftBySku({});
  }, [search]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!mounted) return;
      await loadRows();
    })();
    return () => {
      mounted = false;
    };
  }, [loadRows]);

  const rowBySku = useMemo(() => {
    const map = new Map();
    rows.forEach((row) => {
      const skuCode = String(row?.skuCode || "").trim().toUpperCase();
      if (!skuCode) return;
      map.set(skuCode, row);
    });
    return map;
  }, [rows]);

  const displayedRows = useMemo(() => {
    if (modeFilter === "all") return rows;
    return rows.filter((row) => normalizeSupplyMode(row?.supplyMode) === modeFilter);
  }, [modeFilter, rows]);

  const editedCount = useMemo(() => Object.keys(draftBySku).length, [draftBySku]);

  const handleDraftChange = useCallback((row, patch) => {
    const skuCode = String(row?.skuCode || "").trim().toUpperCase();
    if (!skuCode) return;

    setDraftBySku((prev) => {
      const current = prev[skuCode] || buildDraftForRow(row);
      const nextDraft = {
        ...current,
        ...patch,
      };
      const next = { ...prev };
      if (isDraftChanged(row, nextDraft)) {
        next[skuCode] = nextDraft;
      } else {
        delete next[skuCode];
      }
      return next;
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!canManage || editedCount === 0) return;
    const changedRows = Object.entries(draftBySku)
      .map(([skuCode, draft]) => {
        const source = rowBySku.get(skuCode);
        if (!source) return null;
        return {
          skuCode,
          supplyMode: normalizeSupplyMode(draft.supplyMode, normalizeSupplyMode(source.supplyMode)),
          isActive: Boolean(draft.isActive),
          allowMasterPlan: Boolean(draft.allowMasterPlan),
          requiresRequisition: Boolean(draft.requiresRequisition),
          note: normalizeText(draft.note) || null,
        };
      })
      .filter(Boolean);

    if (!changedRows.length) return;

    setSaving(true);
    setErrorMessage("");
    setFeedbackMessage("");
    const result = await updateProductionWipPolicies({ rows: changedRows });
    setSaving(false);
    if (!result.ok) {
      setErrorMessage(result.error?.message || "บันทึกนโยบาย WIP ไม่สำเร็จ");
      return;
    }
    setFeedbackMessage(`บันทึกสำเร็จ ${changedRows.length.toLocaleString()} รายการ`);
    await loadRows();
  }, [canManage, draftBySku, editedCount, loadRows, rowBySku]);

  return (
    <div className="max-w-[95%] mx-auto py-4">
      <div className="mb-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3">
          <div>
            <h2 className="text-sm font-bold text-[#102C57]">นโยบาย WIP ต่อ SKU</h2>
            <p className="text-[11px] text-gray-500">
              กำหนดวิธีจัดหา WIP และเลือกเฉพาะ WIP ที่ต้องเบิกจากคลัง เพื่อให้แสดงใน Preview และ Export ใบเบิกเหมือนวัตถุดิบ
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[minmax(0,1fr)_170px_auto]">
            <div className="flex gap-2">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="ค้นหารหัสหรือชื่อ WIP..."
                className="h-9 flex-1 rounded-lg border border-gray-200 bg-gray-50 px-3 text-xs outline-none focus:ring-1 focus:ring-[#d4af37]"
              />
              <button
                type="button"
                onClick={loadRows}
                disabled={loading}
                className="h-9 px-4 rounded-lg bg-[#102C57] text-white"
              >
                <Search size={14} />
              </button>
            </div>
            <select
              value={modeFilter}
              onChange={(event) => setModeFilter(event.target.value)}
              className="h-9 rounded-lg border border-gray-200 bg-white px-3 text-xs text-[#102C57]"
            >
              <option value="all">ทุกโหมด</option>
              {SUPPLY_MODE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={loadRows}
                disabled={loading}
                className="h-9 px-3 rounded-lg border border-gray-200 bg-white text-xs font-semibold text-[#102C57] disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-1.5">
                  <RefreshCcw size={12} />
                  รีเฟรช
                </span>
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canManage || saving || editedCount === 0}
                className="h-9 px-4 rounded-lg bg-[#d4af37] text-xs font-bold text-[#102C57] disabled:opacity-50"
              >
                <span className="inline-flex items-center gap-1.5">
                  <CheckSquare size={13} />
                  บันทึกที่แก้ไข ({editedCount})
                </span>
              </button>
            </div>
          </div>
          {errorMessage ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-600">
              {errorMessage}
            </div>
          ) : null}
          {feedbackMessage ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
              {feedbackMessage}
            </div>
          ) : null}
          {!canManage ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
              โหมดดูอย่างเดียว: คุณสามารถดูนโยบาย WIP ได้ แต่ไม่สามารถบันทึกการแก้ไข
            </div>
          ) : null}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="max-h-[70vh] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-[#102C57] text-white">
              <tr>
                <th className="px-3 py-2 text-left">SKU WIP</th>
                <th className="px-3 py-2 text-left">รหัสซื้อขาย</th>
                <th className="px-3 py-2 text-left">ชื่อสินค้า</th>
                <th className="px-3 py-2 text-center">หน่วย</th>
                <th className="px-3 py-2 text-center">โหมด</th>
                <th className="px-3 py-2 text-center">ใช้งาน</th>
                <th className="px-3 py-2 text-center">วางในแผนหลัก</th>
                <th className="px-3 py-2 text-center">เบิกจากคลัง</th>
                <th className="px-3 py-2 text-left">หมายเหตุ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-gray-500">
                    กำลังโหลด...
                  </td>
                </tr>
              ) : displayedRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-3 py-8 text-center text-gray-500">
                    ไม่พบรายการ WIP
                  </td>
                </tr>
              ) : (
                displayedRows.map((row) => {
                  const skuCode = String(row?.skuCode || "").trim().toUpperCase();
                  const draft = draftBySku[skuCode];
                  const merged = draft
                    ? {
                      ...row,
                      ...draft,
                    }
                    : row;
                  const changed = Boolean(draft);
                  return (
                    <tr key={skuCode} className={changed ? "bg-[#fff8e2]" : ""}>
                      <td className="px-3 py-2 font-mono font-semibold text-[#102C57]">
                        {skuCode}
                      </td>
                      <td className="px-3 py-2 font-mono text-gray-600">
                        {row.goodsCode || skuCode}
                      </td>
                      <td className="px-3 py-2 text-gray-700">{row.skuName || "-"}</td>
                      <td className="px-3 py-2 text-center text-gray-600">{row.uomName || "-"}</td>
                      <td className="px-3 py-2">
                        <select
                          value={normalizeSupplyMode(merged.supplyMode)}
                          disabled={!canManage}
                          onChange={(event) =>
                            handleDraftChange(row, { supplyMode: event.target.value })
                          }
                          className="h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-xs text-[#102C57] disabled:opacity-60"
                        >
                          {SUPPLY_MODE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={merged.isActive !== false}
                          disabled={!canManage}
                          onChange={(event) =>
                            handleDraftChange(row, { isActive: event.target.checked })
                          }
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={merged.allowMasterPlan === true}
                          disabled={!canManage || merged.isActive === false}
                          onChange={(event) =>
                            handleDraftChange(row, { allowMasterPlan: event.target.checked })
                          }
                          title="ให้ WIP รหัสนี้เลือกได้ในหน้าวางแผนหลัก"
                        />
                      </td>
                      <td className="px-3 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={merged.requiresRequisition === true}
                          disabled={!canManage || merged.isActive === false}
                          onChange={(event) =>
                            handleDraftChange(row, { requiresRequisition: event.target.checked })
                          }
                          title="ให้ WIP รหัสนี้เบิกจากคลัง แสดงใน Preview, Export Excel และจัด LOT อัตโนมัติเหมือนวัตถุดิบ"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={normalizeText(merged.note)}
                          disabled={!canManage}
                          onChange={(event) =>
                            handleDraftChange(row, { note: event.target.value })
                          }
                          placeholder="เช่น ผลิตหน้างาน"
                          className="h-8 w-full rounded-md border border-gray-200 bg-white px-2 text-xs outline-none focus:ring-1 focus:ring-[#d4af37] disabled:opacity-60"
                        />
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
