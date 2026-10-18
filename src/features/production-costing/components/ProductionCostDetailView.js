"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Printer,
  FileSpreadsheet,
  Layers,
  Save,
  Lock,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  X,
  Plus,
  Trash2,
} from "lucide-react";

export default function ProductionCostDetailView({
  costSheet,
  onClose,
  onSave,
  onRefreshFromErp,
  onDrillDownWip,
}) {
  const [activeTab, setActiveTab] = useState("summary"); // 'summary' | 'materials' | 'expenses' | 'stock' | 'docs'
  const [materialFilterTab, setMaterialFilterTab] = useState("ALL"); // 'ALL' | 'WIP' | 'RM' | 'PACKING'
  const [selectedWipItem, setSelectedWipItem] = useState(() => {
    return (costSheet.materials || []).find((m) => m.item_type === "WIP") || null;
  });

  // Editable fields for DL & OH
  const [expenses, setExpenses] = useState(costSheet.expenses || []);
  const [actualQty, setActualQty] = useState(costSheet.actual_qty || 0);
  const [notes, setNotes] = useState(costSheet.notes || "");
  const [isSaving, setIsSaving] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);

  useEffect(() => {
    setExpenses(costSheet.expenses || []);
    setActualQty(costSheet.actual_qty || 0);
    setNotes(costSheet.notes || "");
    setSelectedWipItem((costSheet.materials || []).find((m) => m.item_type === "WIP") || null);
    setMaterialFilterTab("ALL");
  }, [costSheet]);

  // Live totals calculation
  const materialCost = useMemo(() => {
    return (costSheet.materials || []).reduce((sum, m) => sum + Number(m.total_amount || 0), 0);
  }, [costSheet.materials]);

  const dlCost = useMemo(() => {
    return expenses
      .filter((e) => e.expense_type === "DL")
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
  }, [expenses]);

  const ohCost = useMemo(() => {
    return expenses
      .filter((e) => e.expense_type === "OH")
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
  }, [expenses]);

  const totalCost = materialCost + dlCost + ohCost;
  const unitCost = Number(actualQty) > 0 ? totalCost / Number(actualQty) : 0;
  const planUnitCost = Number(costSheet.standard_unit_cost) || Number(costSheet.plan_unit_cost) || 0;
  const varianceDiff = unitCost - planUnitCost;
  const variancePct = planUnitCost > 0 ? (varianceDiff / planUnitCost) * 100 : null;

  const matPct = totalCost > 0 ? (materialCost / totalCost) * 100 : 0;
  const dlPct = totalCost > 0 ? (dlCost / totalCost) * 100 : 0;
  const ohPct = totalCost > 0 ? (ohCost / totalCost) * 100 : 0;

  // Material item counts
  const allMaterials = useMemo(() => costSheet.materials || [], [costSheet.materials]);
  const wipCount = allMaterials.filter((m) => m.item_type === "WIP").length;
  const rmCount = allMaterials.filter((m) => m.item_type === "RM").length;
  const packCount = allMaterials.filter((m) => m.item_type === "PACKING").length;

  const filteredMaterials = useMemo(() => {
    if (materialFilterTab === "ALL") return allMaterials;
    return allMaterials.filter((m) => m.item_type === materialFilterTab);
  }, [allMaterials, materialFilterTab]);

  const handleExpenseChange = (index, field, value) => {
    setExpenses((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleAddExpense = (type) => {
    setExpenses((prev) => [
      ...prev,
      {
        expense_type: type,
        description: type === "DL" ? "ค่าแรงงานเพิ่มเติม" : "ค่าใช้จ่ายโสหุ้ยเพิ่มเติม",
        qty: null,
        uom_name: "บาท",
        rate: null,
        amount: 0,
        remark: "",
      },
    ]);
  };

  const handleRemoveExpense = (index) => {
    setExpenses((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveAction = async (targetStatus) => {
    setIsSaving(true);
    try {
      const payload = {
        ...costSheet,
        status: targetStatus,
        actual_qty: Number(actualQty) || 0,
        material_cost: materialCost,
        dl_cost: dlCost,
        overhead_cost: ohCost,
        total_cost: totalCost,
        unit_cost: unitCost,
        standard_unit_cost: planUnitCost,
        variance_pct: variancePct,
        notes,
        expenses,
      };
      await onSave(payload);
    } finally {
      setIsSaving(false);
    }
  };

  const isClosed = costSheet.status === "closed";

  return (
    <div className="space-y-2">
      {/* Side-by-Side Grid (Section 2 on Left, Section 3 on Right) */}
      <div className="grid grid-cols-1 items-start gap-2 xl:grid-cols-12">
        {/* ========================================================= */}
        {/* SECTION 2: รายละเอียดต้นทุนการผลิต (Production Cost Detail) */}
        {/* ========================================================= */}
        <div className="space-y-3 border border-slate-200 bg-white p-3 xl:col-span-6">
          {/* Header & Breadcrumb */}
          <div>
            <div className="text-[11px] text-slate-600 mb-1">
              ต้นทุนการผลิต &gt; <span className="text-slate-700 font-medium">{costSheet.cost_no}</span>
            </div>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900 font-mono tracking-tight">
                  {costSheet.cost_no}
                </h2>
                {isClosed ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                    ปิดต้นทุนแล้ว
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                    รอปิดต้นทุน
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 text-xs">
                <button onClick={onClose} className="border border-slate-200 bg-white px-2.5 py-1.5 text-slate-600 hover:bg-slate-50">
                  <X className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => window.print()}
                  className="px-2.5 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg flex items-center gap-1"
                >
                  <Printer className="w-3.5 h-3.5" /> พิมพ์
                </button>
                <button
                  onClick={() => handleSaveAction("draft")}
                  disabled={isSaving || isClosed}
                  className="px-2.5 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 rounded-lg flex items-center gap-1"
                >
                  <Save className="w-3.5 h-3.5" /> บันทึกร่าง
                </button>
                <button
                  onClick={() => handleSaveAction("closed")}
                  disabled={isSaving || isClosed || Number(actualQty) <= 0}
                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-medium rounded-lg shadow-sm flex items-center gap-1"
                >
                  <Lock className="w-3.5 h-3.5" /> ปิดต้นทุนใหม่
                </button>
              </div>
            </div>
          </div>

          {/* Product Profile Card (Box with Thumbnail, Qty, and Badges) */}
          <div className="flex flex-col items-start gap-3 border border-slate-200/80 bg-slate-50/70 p-3 sm:flex-row">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center border border-amber-200 bg-amber-100/70 text-amber-800">
              <Layers className="w-8 h-8" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                    costSheet.cost_type === "FG"
                      ? "bg-purple-100 text-purple-800"
                      : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {costSheet.cost_type}
                </span>
                <span className="text-xs text-slate-500">
                  แผนก: {costSheet.department_name || costSheet.stage_key}
                </span>
              </div>

              <div className="text-sm font-bold text-slate-900 mt-0.5">
                {costSheet.sku_code} {costSheet.sku_name}
              </div>
              <div className="text-[11px] font-mono text-slate-500 mt-0.5">
                Lot: <span className="font-semibold text-slate-700">{costSheet.lot_no}</span>
              </div>

              {/* 4 Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-slate-200/60 text-[11px]">
                <div>
                  <span className="text-slate-600 block">วันที่ผลิต</span>
                  <span className="font-medium text-slate-800">{costSheet.production_date}</span>
                </div>
                <div>
                  <span className="text-slate-600 block">ปริมาณผลิต</span>
                  <span className="font-bold text-slate-900 font-mono">
                    {Number(actualQty).toLocaleString()} {costSheet.uom_name || "kg"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-600 block">ปริมาณดี</span>
                  <span className="font-bold text-slate-900 font-mono">
                    {(Number(actualQty) - Number(costSheet.waste_qty || 0)).toLocaleString()} {costSheet.uom_name}
                  </span>
                </div>
                <div>
                  <span className="text-slate-600 block">ของเสีย</span>
                  <span className="font-bold text-rose-600 font-mono">
                    {Number(costSheet.waste_qty || 0)} {costSheet.uom_name} ({costSheet.waste_rate_pct || 0}%)
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Sub Navigation Tabs */}
          <div className="flex border-b border-slate-200 gap-4 text-xs font-medium text-slate-600">
            <button
              onClick={() => setActiveTab("summary")}
              className={`pb-2 border-b-2 transition-colors ${
                activeTab === "summary"
                  ? "border-emerald-600 text-emerald-700 font-bold"
                  : "border-transparent hover:text-slate-900"
              }`}
            >
              สรุปต้นทุน
            </button>
            <button
              onClick={() => setShowExpenseModal(true)}
              className="pb-2 border-b-2 border-transparent text-slate-600 hover:text-emerald-700 flex items-center gap-1"
            >
              ค่าแรง / OH (แก้ไขได้)
            </button>
          </div>

          {/* Cost Summary Table & Unit Cost Box (Split 2 Columns inside Section 2) */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
            {/* Left: 3-Pillar Cost Table */}
            <div className="md:col-span-7">
              <div className="text-xs font-bold text-slate-900 mb-2">
                สรุปต้นทุนการผลิต (Actual Cost)
              </div>
              <table className="w-full text-left text-xs border border-slate-100 rounded-lg overflow-hidden">
                <thead className="bg-[#f8f9fa] text-[#1a1c1e] font-bold border-b-2 border-[#1a1c1e]">
                  <tr>
                    <th className="py-2 px-2.5">รายการ</th>
                    <th className="py-2 px-2.5 text-right">มูลค่า (บาท)</th>
                    <th className="py-2 px-2.5 text-right">สัดส่วน (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                  <tr>
                    <td className="py-2 px-2.5 font-sans flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded bg-emerald-500 shrink-0"></span>
                      <span>วัตถุดิบ (Material Cost)</span>
                    </td>
                    <td className="py-2 px-2.5 text-right font-bold text-slate-800">
                      {materialCost.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 px-2.5 text-right text-slate-600">{matPct.toFixed(1)}%</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-2.5 font-sans flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded bg-sky-500 shrink-0"></span>
                      <span>ค่าแรงงานตรง (Direct Labor)</span>
                    </td>
                    <td className="py-2 px-2.5 text-right font-bold text-slate-800">
                      {dlCost.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 px-2.5 text-right text-slate-600">{dlPct.toFixed(1)}%</td>
                  </tr>
                  <tr>
                    <td className="py-2 px-2.5 font-sans flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded bg-amber-500 shrink-0"></span>
                      <span>ค่าใช้จ่ายการผลิต (Overhead)</span>
                    </td>
                    <td className="py-2 px-2.5 text-right font-bold text-slate-800">
                      {ohCost.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 px-2.5 text-right text-slate-600">{ohPct.toFixed(1)}%</td>
                  </tr>
                  <tr className="bg-slate-50 font-bold font-sans">
                    <td className="py-2 px-2.5 text-slate-900">รวมต้นทุนการผลิต</td>
                    <td className="py-2 px-2.5 text-right font-mono text-emerald-700">
                      {totalCost.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-2 px-2.5 text-right font-mono text-slate-900">100%</td>
                  </tr>
                </tbody>
              </table>

              <button
                onClick={() => setShowExpenseModal(true)}
                className="mt-2 text-[11px] font-medium text-emerald-700 hover:text-emerald-800 flex items-center gap-1"
              >
                + แก้ไข/เพิ่ม ค่าแรง (DL) หรือ โสหุ้ย (OH) อิสระ
              </button>
            </div>

            {/* Right: Unit Cost Box vs Plan Box */}
            <div className="md:col-span-5 space-y-3">
              {/* Actual Unit Cost Box */}
              <div className="border border-emerald-200 bg-gradient-to-br from-emerald-50 to-teal-50 p-3">
                <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wide block">
                  ต้นทุนต่อหน่วย
                </span>
                <div className="mt-1 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-emerald-950 font-mono">
                    {unitCost.toFixed(2)}
                  </span>
                  <span className="text-xs font-semibold text-emerald-700">
                    บาท/{costSheet.uom_name || "kg"}
                  </span>
                </div>
                {costSheet.cost_per_bag_22_5 > 0 && (
                  <div className="text-[10px] text-emerald-800 mt-0.5">
                    หรือ {costSheet.cost_per_bag_22_5.toFixed(2)} บาท/ถุง (22.5 kg)
                  </div>
                )}
              </div>

              {/* Comparison vs Plan Box */}
              <div className="border border-slate-200 bg-slate-50 p-3 text-xs">
                <span className="text-[11px] text-slate-600 block">
                  เปรียบเทียบกับแผน (Standard/Plan)
                </span>
                <div className="mt-0.5 font-mono text-base font-bold text-slate-800">
                  {planUnitCost > 0 ? `${planUnitCost.toFixed(2)} บาท/${costSheet.uom_name || "kg"}` : "— ยังไม่มีต้นทุนมาตรฐาน"}
                </div>
                {variancePct != null && <div className="mt-1 flex items-center gap-1 text-[11px]">
                  {varianceDiff >= 0 ? (
                    <span className="text-rose-600 font-semibold flex items-center gap-0.5">
                      ↑ ส่วนต่าง +{varianceDiff.toFixed(2)} บาท (+{variancePct.toFixed(1)}%)
                    </span>
                  ) : (
                    <span className="text-emerald-600 font-semibold flex items-center gap-0.5">
                      ↓ ส่วนต่าง {varianceDiff.toFixed(2)} บาท ({variancePct.toFixed(1)}%)
                    </span>
                  )}
                </div>}
              </div>
            </div>
          </div>
        </div>

        {/* ========================================================= */}
        {/* SECTION 3: Drill Down - รายละเอียดวัตถุดิบ (Right Column)    */}
        {/* ========================================================= */}
        <div className="space-y-3 border border-slate-200 bg-white p-3 xl:col-span-6">
          {/* Header & Breadcrumb */}
          <div>
            <div className="text-[11px] text-slate-600 mb-1">
              ต้นทุนการผลิต &gt; {costSheet.cost_no} &gt; รายละเอียดวัตถุดิบ
            </div>
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-900 tracking-tight">
                รายการวัตถุดิบที่ใช้จริง
              </h2>
            </div>
          </div>

          {/* Filter Tabs: ทั้งหมด | WIP | วัตถุดิบ | บรรจุภัณฑ์ */}
          <div className="flex items-center gap-1.5 text-xs">
            <button
              onClick={() => setMaterialFilterTab("ALL")}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                materialFilterTab === "ALL"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              ทั้งหมด ({allMaterials.length})
            </button>
            <button
              onClick={() => setMaterialFilterTab("WIP")}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                materialFilterTab === "WIP"
                  ? "bg-amber-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              WIP ({wipCount})
            </button>
            <button
              onClick={() => setMaterialFilterTab("RM")}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                materialFilterTab === "RM"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              วัตถุดิบ ({rmCount})
            </button>
            <button
              onClick={() => setMaterialFilterTab("PACKING")}
              className={`px-3 py-1 rounded-lg font-medium transition-colors ${
                materialFilterTab === "PACKING"
                  ? "bg-purple-600 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              บรรจุภัณฑ์ ({packCount})
            </button>
          </div>

          {/* Materials Table with Clickable WIP Rows */}
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f8f9fa] text-[#1a1c1e] font-bold border-b-2 border-[#1a1c1e] text-[11px]">
                <tr>
                  <th className="py-2 px-2.5">ลำดับ</th>
                  <th className="py-2 px-2.5">รหัสวัตถุดิบ</th>
                  <th className="py-2 px-2.5">ชื่อวัตถุดิบ</th>
                  <th className="py-2 px-2.5">ประเภท</th>
                  <th className="py-2 px-2.5">Lot</th>
                  <th className="py-2 px-2.5 text-right">จำนวนที่ใช้</th>
                  <th className="py-2 px-2.5">หน่วย</th>
                  <th className="py-2 px-2.5 text-right">ราคา/หน่วย</th>
                  <th className="py-2 px-2.5 text-right">มูลค่า (บาท)</th>
                  <th className="py-2 px-1 text-center"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {filteredMaterials.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-6 text-center text-slate-600 font-sans">
                      ไม่มีรายการในหมวดนี้
                    </td>
                  </tr>
                ) : (
                  filteredMaterials.map((m, idx) => {
                    const isWip = m.item_type === "WIP";
                    const isSelected = selectedWipItem?.item_code === m.item_code;
                    return (
                      <tr
                        key={idx}
                        onClick={() => isWip && setSelectedWipItem(m)}
                        className={`transition-colors ${
                          isWip ? "cursor-pointer" : ""
                        } ${
                          isSelected
                            ? "bg-amber-100/60"
                            : isWip
                            ? "hover:bg-amber-50/70"
                            : "hover:bg-slate-50"
                        }`}
                      >
                        <td className="py-2 px-2.5 text-slate-500">{idx + 1}</td>
                        <td className="py-2 px-2.5 font-semibold text-slate-800">{m.item_code}</td>
                        <td className="py-2 px-2.5 font-sans text-slate-700 font-medium">
                          {m.item_name}
                        </td>
                        <td className="py-2 px-2.5">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                              m.item_type === "WIP"
                                ? "bg-amber-100 text-amber-800"
                                : m.item_type === "PACKING"
                                ? "bg-purple-100 text-purple-800"
                                : "bg-emerald-100 text-emerald-800"
                            }`}
                          >
                            {m.item_type}
                          </span>
                        </td>
                        <td className="py-2 px-2.5 text-emerald-700">{m.lot_no || "-"}</td>
                        <td className="py-2 px-2.5 text-right font-bold text-slate-800">
                          {Number(m.qty).toLocaleString()}
                        </td>
                        <td className="py-2 px-2.5 font-sans text-slate-500">{m.uom_name}</td>
                        <td className="py-2 px-2.5 text-right text-slate-600">
                          {Number(m.unit_price).toFixed(2)}
                        </td>
                        <td className="py-2 px-2.5 text-right font-bold text-slate-900">
                          {Number(m.total_amount).toLocaleString("th-TH", {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-2 px-1 text-center text-slate-400">
                          {isWip ? <ChevronRight className="w-3.5 h-3.5 text-amber-600" /> : null}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
              <tfoot className="bg-slate-50 border-t border-slate-200 font-bold text-xs">
                <tr>
                  <td colSpan={8} className="py-2.5 px-3 text-right font-sans text-slate-800">
                    รวมมูลค่าวัตถุดิบ:
                  </td>
                  <td className="py-2.5 px-3 text-right font-mono text-emerald-700">
                    {materialCost.toLocaleString("th-TH", { minimumFractionDigits: 2 })}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Selected WIP Card at the Bottom of Section 3 */}
          <div className="p-4 bg-gradient-to-br from-amber-50 to-orange-50/60 rounded-xl border border-amber-200">
            <div className="text-xs font-bold text-slate-900 mb-2 flex items-center justify-between">
              <span>ข้อมูลต้นทุนของ WIP ที่เลือก</span>
              {selectedWipItem && (
                <span className="text-[10px] text-amber-800 font-medium">
                  คลิกปุ่มขวาเพื่อวาร์ปไปดูใบต้นทุน
                </span>
              )}
            </div>

            {selectedWipItem ? (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-amber-500 text-white rounded-lg flex items-center justify-center shrink-0">
                    <Layers className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900">
                      {selectedWipItem.item_code} {selectedWipItem.item_name}
                    </div>
                    <div className="text-[11px] text-amber-900 font-mono">
                      Lot: {selectedWipItem.lot_no || "-"}
                    </div>
                    <div className="text-[11px] text-slate-600 mt-0.5">
                      ต้นทุนต่อหน่วย:{" "}
                      <span className="font-bold text-slate-900 font-mono">
                        {Number(selectedWipItem.unit_price).toFixed(2)} บาท/{selectedWipItem.uom_name}
                      </span>{" "}
                      • ใช้ไป:{" "}
                      <span className="font-bold text-slate-900 font-mono">
                        {Number(selectedWipItem.qty).toLocaleString()} {selectedWipItem.uom_name}
                      </span>
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => onDrillDownWip && onDrillDownWip(selectedWipItem)}
                  className="px-4 py-2 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors flex items-center justify-center gap-1 shrink-0"
                >
                  ดูรายละเอียดต้นทุน WIP Lot นี้ <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="py-3 text-center text-xs text-slate-600">
                ยังไม่มีรายการ WIP ในสูตรนี้ หรือยังไม่ได้เลือกแถว WIP
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expense Modal (For Manual DL and OH Overrides) */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  แก้ไขค่าแรงงานตรง (DL) และ โสหุ้ย (OH)
                </h3>
                <p className="text-xs text-slate-500">
                  กรอกยอดเงินที่ฝ่ายบัญชีคำนวณมานอกรอบ ระบบจะคำนวณต้นทุนต่อหน่วยใหม่ทันที
                </p>
              </div>
              <button
                onClick={() => setShowExpenseModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto text-xs">
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={() => handleAddExpense("DL")}
                  className="px-2.5 py-1 bg-sky-50 text-sky-700 border border-sky-200 rounded text-xs font-semibold"
                >
                  + เพิ่มค่าแรง (DL)
                </button>
                <button
                  onClick={() => handleAddExpense("OH")}
                  className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded text-xs font-semibold"
                >
                  + เพิ่มโสหุ้ย (OH)
                </button>
              </div>

              <table className="w-full text-left text-xs border border-slate-200 rounded-lg">
                <thead className="bg-slate-50 border-b border-slate-200 text-[11px] text-slate-600">
                  <tr>
                    <th className="py-2 px-2.5">ประเภท</th>
                    <th className="py-2 px-2.5">รายละเอียด</th>
                    <th className="py-2 px-2.5 text-right">มูลค่า (บาท)</th>
                    <th className="py-2 px-2.5">หมายเหตุ</th>
                    <th className="py-2 px-1 text-center"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {expenses.map((e, idx) => (
                    <tr key={idx}>
                      <td className="py-2 px-2.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            e.expense_type === "DL"
                              ? "bg-sky-100 text-sky-800"
                              : "bg-amber-100 text-amber-800"
                          }`}
                        >
                          {e.expense_type}
                        </span>
                      </td>
                      <td className="py-2 px-2.5">
                        <input
                          type="text"
                          value={e.description || ""}
                          onChange={(ev) => handleExpenseChange(idx, "description", ev.target.value)}
                          className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
                        />
                      </td>
                      <td className="py-2 px-2.5 text-right font-mono">
                        <input
                          type="number"
                          step="0.01"
                          value={e.amount || 0}
                          onChange={(ev) => handleExpenseChange(idx, "amount", ev.target.value)}
                          className="w-24 text-right px-2 py-1 border border-emerald-300 bg-emerald-50/40 rounded text-xs font-bold"
                        />
                      </td>
                      <td className="py-2 px-2.5">
                        <input
                          type="text"
                          value={e.remark || ""}
                          onChange={(ev) => handleExpenseChange(idx, "remark", ev.target.value)}
                          placeholder="หมายเหตุ..."
                          className="w-full px-2 py-1 border border-slate-200 rounded text-xs"
                        />
                      </td>
                      <td className="py-2 px-1 text-center">
                        <button
                          onClick={() => handleRemoveExpense(idx)}
                          className="p-1 text-slate-400 hover:text-rose-600"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end">
              <button
                onClick={() => setShowExpenseModal(false)}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg"
              >
                บันทึกการแก้ไข
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
