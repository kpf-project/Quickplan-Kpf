"use client";

import { CheckSquare, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchProductionSnackWageSettings,
  updateProductionSnackWageSettings,
} from "@/features/production-line-settings/services/productionLineSettingsClient";

const WAGE_MODE_ARRANGED = "arranged";
const WAGE_MODE_NOT_ARRANGED = "not_arranged";

function normalizeRateInput(value, fallback = "0") {
  if (value === null || value === undefined) return fallback;
  return String(value);
}

function parseRateInput(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Number(parsed.toFixed(4));
}

function toModeLabel(mode) {
  if (mode === WAGE_MODE_ARRANGED) return "เรียงเนื้อขนม";
  if (mode === WAGE_MODE_NOT_ARRANGED) return "ไม่เรียงเนื้อขนม";
  return "ยังไม่กำหนด";
}

function buildPayloadState(payload = {}) {
  const products = Array.isArray(payload.products) ? payload.products : [];
  const mappingByCode = {};
  products.forEach((item) => {
    const code = String(item.code || "").trim().toUpperCase();
    if (!code) return;
    const mode = String(item.wageMode || "").trim().toLowerCase();
    mappingByCode[code] = (
      mode === WAGE_MODE_ARRANGED || mode === WAGE_MODE_NOT_ARRANGED
        ? mode
        : ""
    );
  });

  return {
    rates: {
      arrangedRatePerKg: normalizeRateInput(payload.rates?.arrangedRatePerKg, "0"),
      notArrangedRatePerKg: normalizeRateInput(payload.rates?.notArrangedRatePerKg, "0"),
    },
    products,
    mappingByCode,
  };
}

export default function SnackWageSettingsPanel({ canManage = false }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [search, setSearch] = useState("");
  const [rates, setRates] = useState({
    arrangedRatePerKg: "0",
    notArrangedRatePerKg: "0",
  });
  const [products, setProducts] = useState([]);
  const [mappingByCode, setMappingByCode] = useState({});

  const applyPayload = useCallback((payload) => {
    const next = buildPayloadState(payload);
    setRates(next.rates);
    setProducts(next.products);
    setMappingByCode(next.mappingByCode);
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    const result = await fetchProductionSnackWageSettings();
    setLoading(false);
    if (!result.ok) {
      setErrorMessage(result.error?.message || "โหลดค่าตั้งต้นการคำนวณค่าแรงไม่สำเร็จ");
      return;
    }
    applyPayload(result.data?.data || {});
  }, [applyPayload]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadSettings();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadSettings]);

  const visibleProducts = useMemo(() => {
    const keyword = String(search || "").trim().toLowerCase();
    if (!keyword) return products;
    return products.filter((item) => (
      String(item.code || "").toLowerCase().includes(keyword)
      || String(item.name || "").toLowerCase().includes(keyword)
    ));
  }, [products, search]);

  const summary = useMemo(() => {
    return products.reduce((acc, item) => {
      const code = String(item.code || "").trim().toUpperCase();
      const mode = mappingByCode[code] || "";
      if (mode === WAGE_MODE_ARRANGED) {
        acc.mappedArranged += 1;
      } else if (mode === WAGE_MODE_NOT_ARRANGED) {
        acc.mappedNotArranged += 1;
      } else {
        acc.unmapped += 1;
      }
      return acc;
    }, {
      mappedArranged: 0,
      mappedNotArranged: 0,
      unmapped: 0,
    });
  }, [mappingByCode, products]);

  const handleSave = useCallback(async () => {
    if (!canManage) return;

    const arrangedRatePerKg = parseRateInput(rates.arrangedRatePerKg);
    const notArrangedRatePerKg = parseRateInput(rates.notArrangedRatePerKg);
    if (arrangedRatePerKg === null || notArrangedRatePerKg === null) {
      setErrorMessage("กรุณากรอกอัตราค่าแรงให้เป็นตัวเลขมากกว่าหรือเท่ากับ 0");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    const mappings = products.map((item) => {
      const code = String(item.code || "").trim().toUpperCase();
      const mode = mappingByCode[code] || "";
      return {
        productCode: code,
        wageMode: mode || null,
      };
    });

    const result = await updateProductionSnackWageSettings({
      arrangedRatePerKg,
      notArrangedRatePerKg,
      mappings,
    });
    setSaving(false);

    if (!result.ok) {
      setErrorMessage(result.error?.message || "บันทึกค่าตั้งต้นการคำนวณค่าแรงไม่สำเร็จ");
      return;
    }

    applyPayload(result.data?.data || {});
  }, [applyPayload, canManage, mappingByCode, products, rates.arrangedRatePerKg, rates.notArrangedRatePerKg]);

  return (
    <section className="mt-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h3 className="text-sm font-bold text-[#102C57]">ตั้งค่าค่าแรงบันทึกเนื้อขนม 400g</h3>
          <p className="text-xs text-slate-500">
            กำหนดอัตราค่าแรงต่อกิโลกรัม และผูกสินค้า KB8 ว่าอยู่ในแบบเรียงหรือไม่เรียงเนื้อขนม
          </p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canManage || saving || loading}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-[#102C57] px-4 text-xs font-bold text-white disabled:opacity-50"
        >
          <CheckSquare size={14} />
          {saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
        </button>
      </div>

      {errorMessage ? (
        <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
          {errorMessage}
        </div>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <label className="space-y-1 text-xs text-slate-600">
          <span className="font-semibold text-[#102C57]">แบบเรียงเนื้อขนม (บาท/กก.)</span>
          <input
            type="number"
            min="0"
            step="0.0001"
            disabled={!canManage || loading || saving}
            value={rates.arrangedRatePerKg}
            onChange={(event) => setRates((prev) => ({ ...prev, arrangedRatePerKg: event.target.value }))}
            className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm"
          />
        </label>
        <label className="space-y-1 text-xs text-slate-600">
          <span className="font-semibold text-[#102C57]">แบบไม่เรียงเนื้อขนม (บาท/กก.)</span>
          <input
            type="number"
            min="0"
            step="0.0001"
            disabled={!canManage || loading || saving}
            value={rates.notArrangedRatePerKg}
            onChange={(event) => setRates((prev) => ({ ...prev, notArrangedRatePerKg: event.target.value }))}
            className="h-9 w-full rounded-lg border border-gray-200 px-3 text-sm"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-slate-600">
          สินค้าทั้งหมด: <span className="font-semibold text-slate-900">{products.length.toLocaleString()}</span>
        </span>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-emerald-700">
          แบบเรียง: <span className="font-semibold">{summary.mappedArranged.toLocaleString()}</span>
        </span>
        <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-blue-700">
          แบบไม่เรียง: <span className="font-semibold">{summary.mappedNotArranged.toLocaleString()}</span>
        </span>
        <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-amber-700">
          ยังไม่กำหนด: <span className="font-semibold">{summary.unmapped.toLocaleString()}</span>
        </span>
      </div>

      <div className="mt-4 rounded-xl border border-gray-100">
        <div className="border-b border-gray-100 p-3">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหาสินค้า KB8..."
              className="h-9 w-full rounded-lg border border-gray-200 pl-9 pr-3 text-sm"
            />
          </div>
        </div>

        <div className="max-h-[420px] overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">รหัสสินค้า</th>
                <th className="px-3 py-2 text-left">ชื่อสินค้า</th>
                <th className="px-3 py-2 text-left">หน่วย</th>
                <th className="px-3 py-2 text-left">ประเภทคำนวณค่าแรง</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-500">กำลังโหลดข้อมูล...</td>
                </tr>
              ) : null}
              {!loading && visibleProducts.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-slate-500">ไม่พบสินค้า KB8 ตามเงื่อนไขค้นหา</td>
                </tr>
              ) : null}
              {!loading && visibleProducts.map((item) => {
                const code = String(item.code || "").trim().toUpperCase();
                const currentMode = mappingByCode[code] || "";
                return (
                  <tr key={code}>
                    <td className="px-3 py-2 font-mono text-[#102C57]">{code}</td>
                    <td className="px-3 py-2">{item.name || "-"}</td>
                    <td className="px-3 py-2">{item.unit || "-"}</td>
                    <td className="px-3 py-2">
                      <select
                        value={currentMode}
                        disabled={!canManage || saving}
                        onChange={(event) => {
                          const nextMode = String(event.target.value || "").trim().toLowerCase();
                          setMappingByCode((prev) => ({
                            ...prev,
                            [code]: (
                              nextMode === WAGE_MODE_ARRANGED || nextMode === WAGE_MODE_NOT_ARRANGED
                                ? nextMode
                                : ""
                            ),
                          }));
                        }}
                        className="h-8 w-full rounded-md border border-gray-200 px-2 text-xs"
                      >
                        <option value="">ยังไม่กำหนด</option>
                        <option value={WAGE_MODE_ARRANGED}>เรียงเนื้อขนม</option>
                        <option value={WAGE_MODE_NOT_ARRANGED}>ไม่เรียงเนื้อขนม</option>
                      </select>
                      <p className="mt-1 text-[10px] text-slate-500">
                        ปัจจุบัน: {toModeLabel(currentMode)}
                      </p>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
