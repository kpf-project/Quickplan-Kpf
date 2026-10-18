"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Search,
  RefreshCw,
  Plus,
  FileSpreadsheet,
  Layers,
  CheckCircle2,
  Clock,
  AlertCircle,
  DollarSign,
  X,
  Sparkles,
} from "lucide-react";
import ProductionCostDetailView from "./ProductionCostDetailView";

export default function ProductionCostOverviewClient() {
  // Navigation / Selected View
  const [selectedCostSheet, setSelectedCostSheet] = useState(null);
  const detailSectionRef = useRef(null);

  // Filter states
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [costType, setCostType] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);

  // Data states
  const [loading, setLoading] = useState(false);
  const [costSheets, setCostSheets] = useState([]);
  const [summary, setSummary] = useState({
    total_orders: 0,
    closed_count: 0,
    pending_count: 0,
    problem_count: 0,
    total_actual_cost: 0,
  });
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    totalRecords: 0,
    totalPages: 1,
  });

  // Modal: Calculate New Lot
  const [showNewLotModal, setShowNewLotModal] = useState(false);
  const [newLotInput, setNewLotInput] = useState("260918");
  const [isCalculatingDraft, setIsCalculatingDraft] = useState(false);
  const [draftError, setDraftError] = useState("");

  const fetchCostSheets = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (appliedSearch) params.set("search", appliedSearch);
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);
      if (costType) params.set("costType", costType);
      if (statusFilter) params.set("status", statusFilter);
      params.set("page", page.toString());
      params.set("pageSize", "20");

      const res = await fetch(`/api/production-costing/sheets?${params.toString()}`);
      const json = await res.json();
      if (res.ok) {
        setCostSheets(json.data || []);
        if (json.summary) setSummary(json.summary);
        if (json.pagination) setPagination(json.pagination);

        // If no sheet is currently selected, select the first one to show detail below
        if (json.data?.length > 0) {
          setSelectedCostSheet((current) => current || json.data[0]);
        }
      }
    } catch (err) {
      console.error("Failed to load cost sheets:", err);
    } finally {
      setLoading(false);
    }
  }, [appliedSearch, dateFrom, dateTo, costType, statusFilter, page]);

  useEffect(() => {
    fetchCostSheets();
  }, [fetchCostSheets]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setAppliedSearch(search.trim());
    setPage(1);
  };

  const handleResetFilters = () => {
    setSearch("");
    setAppliedSearch("");
    setDateFrom("");
    setDateTo("");
    setCostType("");
    setStatusFilter("");
    setPage(1);
  };

  const handleExport = () => {
    const header = [
      "MO Number", "วันที่ผลิต", "แผนก", "รหัสสินค้า", "ชื่อสินค้า", "ประเภท",
      "LOT", "ปริมาณผลิต", "หน่วย", "ต้นทุนต่อหน่วย", "มูลค่าต้นทุนรวม",
      "ต้นทุนมาตรฐาน", "ส่วนต่าง (%)", "สถานะ",
    ];
    const rows = costSheets.map((sheet) => {
      const standard = Number(sheet.standard_unit_cost || sheet.plan_unit_cost || 0);
      const variance = standard > 0 ? ((Number(sheet.unit_cost || 0) - standard) / standard) * 100 : "";
      return [
        sheet.cost_no, sheet.production_date, sheet.department_name || sheet.stage_key,
        sheet.sku_code, sheet.sku_name, sheet.cost_type, sheet.lot_no,
        sheet.actual_qty, sheet.uom_name, sheet.unit_cost, sheet.total_cost,
        standard || "", variance, sheet.status,
      ];
    });
    const csv = [header, ...rows]
      .map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","))
      .join("\r\n");
    const url = URL.createObjectURL(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `production-costing-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCalculateNewLot = async () => {
    if (!newLotInput.trim()) return;
    setIsCalculatingDraft(true);
    setDraftError("");

    try {
      const res = await fetch(
        `/api/production-costing/flour/draft?lotNo=${encodeURIComponent(newLotInput.trim())}`
      );
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setDraftError(json.error || "ไม่พบข้อมูลใบเบิกหรือใบรับเข้าของล็อตนี้ใน ERP");
        return;
      }

      // Open draft directly and scroll to detail view
      setSelectedCostSheet(json.data);
      setShowNewLotModal(false);
      setTimeout(() => {
        detailSectionRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (err) {
      setDraftError("เกิดข้อผิดพลาดในการเชื่อมต่อ ERP: " + err.message);
    } finally {
      setIsCalculatingDraft(false);
    }
  };

  const handleRowClick = async (sheet) => {
    try {
      const res = await fetch(`/api/production-costing/sheets/${sheet.id}`);
      const json = await res.json();
      if (res.ok && json.data) {
        setSelectedCostSheet(json.data);
      } else {
        setSelectedCostSheet(sheet);
      }
    } catch {
      setSelectedCostSheet(sheet);
    }

    setTimeout(() => {
      detailSectionRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
  };

  const handleSaveCostSheet = async (payload) => {
    try {
      const isExisting = Boolean(payload.id);
      const url = isExisting
        ? `/api/production-costing/sheets/${payload.id}`
        : `/api/production-costing/sheets`;
      const method = isExisting ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (res.ok && json.data) {
        setSelectedCostSheet(json.data);
        alert(
          payload.status === "closed"
            ? "ปิดต้นทุนเรียบร้อยแล้ว!"
            : "บันทึกแบบร่างเรียบร้อยแล้ว!"
        );
        fetchCostSheets();
      } else {
        alert("เกิดข้อผิดพลาดในการบันทึก: " + (json.error || "Unknown error"));
      }
    } catch (err) {
      alert("เกิดข้อผิดพลาด: " + err.message);
    }
  };

  const handleDrillDownWip = async (wipItem) => {
    if (wipItem.linked_cost_sheet_id) {
      try {
        const res = await fetch(`/api/production-costing/sheets/${wipItem.linked_cost_sheet_id}`);
        const json = await res.json();
        if (res.ok && json.data) {
          setSelectedCostSheet(json.data);
          detailSectionRef.current?.scrollIntoView({ behavior: "smooth" });
          return;
        }
      } catch (e) {
        console.error(e);
      }
    }

    // Try finding by lot
    if (wipItem.lot_no) {
      const res = await fetch(`/api/production-costing/sheets?search=${encodeURIComponent(wipItem.lot_no)}`);
      const json = await res.json();
      if (res.ok && json.data?.length > 0) {
        handleRowClick(json.data[0]);
        return;
      }
    }

    alert(`ยังไม่มีใบปิดต้นทุนของ WIP Lot: ${wipItem.lot_no || wipItem.item_code}`);
  };

  // Percentage metrics for KPI cards
  const totalOrders = summary.total_orders || 0;
  const closedPct = totalOrders > 0 ? ((summary.closed_count / totalOrders) * 100).toFixed(1) : 0;
  const pendingPct = totalOrders > 0 ? ((summary.pending_count / totalOrders) * 100).toFixed(1) : 0;
  const problemPct = totalOrders > 0 ? ((summary.problem_count / totalOrders) * 100).toFixed(1) : 0;

  return (
    <div className="space-y-2 pb-8 text-[#082c5c]">
      {/* ========================================================= */}
      {/* SECTION 1: ภาพรวมต้นทุนการผลิต (Production Cost Overview)   */}
      {/* ========================================================= */}
      <div className="space-y-2">
        {/* Top Header Bar */}
        <div className="flex flex-col gap-2 border-b border-slate-200 bg-white px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-[#082c5c]">
                ต้นทุนการผลิต (Production Cost Overview)
              </h1>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              ภาพรวมต้นทุนการผลิตตามใบสั่งผลิต แผนก สินค้า และ Lot
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNewLotModal(true)}
              className="inline-flex items-center gap-1.5 border border-[#0b3b70] bg-white px-3 py-1.5 text-xs font-semibold text-[#0b3b70] transition-colors hover:bg-blue-50"
            >
              <Plus className="w-3.5 h-3.5" /> คำนวณล็อตใหม่ (แป้งร่อน ERP)
            </button>
            <button
              onClick={handleExport}
              className="inline-flex items-center gap-1.5 bg-[#d9b223] px-3 py-1.5 text-xs font-semibold text-[#082c5c] transition-colors hover:bg-[#c7a116]"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" /> ส่งออกข้อมูล (Excel)
            </button>
          </div>
        </div>

        {/* Filter Bar */}
        <div className="border border-slate-200 bg-white px-3 py-2">
          <form onSubmit={handleSearchSubmit} className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2 lg:grid-cols-7">
            {/* Date Range From */}
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                ช่วงวันที่ (เริ่มต้น)
              </label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-600 focus:outline-none"
              />
            </div>

            {/* Date Range To */}
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                ช่วงวันที่ (สิ้นสุด)
              </label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-600 focus:outline-none"
              />
            </div>

            {/* Product Type */}
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                ประเภทสินค้า
              </label>
              <select
                value={costType}
                onChange={(e) => setCostType(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-600 focus:outline-none"
              >
                <option value="">ทั้งหมด (WIP & FG)</option>
                <option value="WIP">WIP กึ่งสำเร็จรูป</option>
                <option value="FG">FG สินค้าสำเร็จรูป</option>
              </select>
            </div>

            {/* Cost Status */}
            <div>
              <label className="block text-[11px] font-medium text-slate-600 mb-1">
                สถานะต้นทุน
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-600 focus:outline-none"
              >
                <option value="">ทั้งหมด</option>
                <option value="closed">ปิดต้นทุนแล้ว</option>
                <option value="draft">รอปิดต้นทุน</option>
                <option value="problem">มีปัญหา</option>
              </select>
            </div>

            {/* Search Box & Buttons */}
            <div className="flex items-end gap-1.5 lg:col-span-3">
              <div className="flex-1">
                <label className="block text-[11px] font-medium text-slate-600 mb-1">
                  ค้นหา
                </label>
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="รหัสสินค้า, ชื่อ, Lot, MO..."
                    className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg focus:ring-1 focus:ring-emerald-600 focus:outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="px-3.5 py-1.5 font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                ค้นหา
              </button>
              <button
                type="button"
                onClick={handleResetFilters}
                className="px-3 py-1.5 font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
              >
                รีเซ็ต
              </button>
            </div>
          </form>
        </div>

        {/* 5 KPI Cards (Exact Colors and Layout from Screenshot 2) */}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {/* 1. จำนวนใบสั่งผลิต */}
          <div className="flex items-center gap-3 border border-slate-200 bg-white px-3 py-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-50 text-blue-600">
                <Layers className="w-4 h-4" />
              </div>
            <div><div className="text-[11px] text-slate-600">จำนวนใบสั่งผลิต</div>
            <div className="font-mono text-xl font-bold text-slate-900">{summary.total_orders}</div>
            <div className="text-[10px] text-slate-500">รายการในช่วงที่เลือก</div>
            </div>
          </div>

          {/* 2. ปิดต้นทุนแล้ว */}
          <div className="bg-white p-2.5 border border-slate-200 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">ปิดต้นทุนแล้ว</span>
              <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
                <CheckCircle2 className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-slate-900">
              {summary.closed_count}
            </div>
            <div className="mt-1 text-[11px] text-emerald-700 font-semibold">{closedPct}%</div>
          </div>

          {/* 3. รอปิดต้นทุน */}
          <div className="bg-white p-2.5 border border-slate-200 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">รอปิดต้นทุน</span>
              <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-slate-900">
              {summary.pending_count}
            </div>
            <div className="mt-1 text-[11px] text-amber-700 font-semibold">{pendingPct}%</div>
          </div>

          {/* 4. มีปัญหา */}
          <div className="bg-white p-2.5 border border-slate-200 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-600">มีปัญหา</span>
              <div className="w-7 h-7 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                <AlertCircle className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-2xl font-bold font-mono text-slate-900">
              {summary.problem_count}
            </div>
            <div className="mt-1 text-[11px] text-rose-700 font-semibold">{problemPct}%</div>
          </div>

          {/* 5. มูลค่าต้นทุนรวม (Actual) */}
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50/60 p-2.5 border border-blue-200 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-blue-900">
                มูลค่าต้นทุนการผลิต (Actual)
              </span>
              <div className="w-7 h-7 rounded-lg bg-blue-600 text-white flex items-center justify-center">
                <DollarSign className="w-4 h-4" />
              </div>
            </div>
            <div className="mt-2 text-xl font-bold font-mono text-blue-950 truncate">
              {summary.total_actual_cost.toLocaleString("th-TH", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} <span className="text-xs font-normal">บาท</span>
            </div>
            <div className="mt-1 text-[10px] text-slate-500">รวมตามตัวกรองปัจจุบัน</div>
          </div>
        </div>

        {/* 14-Column Table matching Screenshot 2 */}
        <div className="overflow-hidden border border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/60 px-3 py-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <span>แสดง {costSheets.length} รายการ</span>
              <span className="text-slate-400">•</span><span className="font-medium text-blue-700">เลือกแถวเพื่อดูรายละเอียดด้านล่าง</span>
            </div>
            {loading && (
              <div className="flex items-center gap-1.5 text-xs text-blue-700 font-medium">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> กำลังโหลด...
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#f8f9fa] text-[#1a1c1e] font-bold border-b-2 border-[#1a1c1e] text-[11px]">
                <tr>
                  <th className="py-2.5 px-2.5">ลำดับ</th>
                  <th className="py-2.5 px-2.5">MO Number</th>
                  <th className="py-2.5 px-2.5">วันที่ผลิต</th>
                  <th className="py-2.5 px-2.5">แผนก</th>
                  <th className="py-2.5 px-2.5">รหัสสินค้า</th>
                  <th className="py-2.5 px-2.5">ชื่อสินค้า</th>
                  <th className="py-2.5 px-2.5">ประเภท</th>
                  <th className="py-2.5 px-2.5">Lot ที่ผลิต</th>
                  <th className="py-2.5 px-2.5 text-right">ปริมาณผลิต (หน่วย)</th>
                  <th className="py-2.5 px-2.5 text-right">ต้นทุนต่อหน่วย (Actual)</th>
                  <th className="py-2.5 px-2.5 text-right">มูลค่าต้นทุนรวม</th>
                  <th className="py-2.5 px-2.5 text-right">เปรียบเทียบ (Plan)</th>
                  <th className="py-2.5 px-2.5 text-right">ส่วนต่าง (%)</th>
                  <th className="py-2.5 px-2.5 text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono text-[11px]">
                {costSheets.length === 0 ? (
                  <tr>
                    <td colSpan={14} className="py-8 text-center text-slate-600 font-sans">
                      {loading
                        ? "กำลังโหลดข้อมูล..."
                        : "ไม่พบข้อมูลต้นทุนการผลิต กรุณากดปุ่ม '+ คำนวณล็อตใหม่ (แป้งร่อน ERP)' ด้านบน"}
                    </td>
                  </tr>
                ) : (
                  costSheets.map((sheet, index) => {
                    const isSelected = selectedCostSheet?.id === sheet.id;
                    const planCost = Number(sheet.standard_unit_cost || sheet.plan_unit_cost || 0);
                    const varPct = planCost > 0 ? ((sheet.unit_cost - planCost) / planCost) * 100 : null;

                    return (
                      <tr
                        key={sheet.id}
                        onClick={() => handleRowClick(sheet)}
                        className={`cursor-pointer transition-colors ${
                          isSelected
                            ? "bg-blue-50/80 border-l-4 border-blue-600 font-medium"
                            : "hover:bg-blue-50/40"
                        }`}
                      >
                        <td className="py-2.5 px-2.5 text-slate-500">{(page - 1) * 20 + index + 1}</td>
                        <td className="py-2.5 px-2.5 font-semibold text-blue-700 hover:underline">
                          {sheet.cost_no}
                        </td>
                        <td className="py-2.5 px-2.5 text-slate-700">{sheet.production_date}</td>
                        <td className="py-2.5 px-2.5 font-sans text-slate-600">
                          {sheet.department_name || (sheet.stage_key === "flour_sifting" ? "เตรียมแป้ง" : sheet.stage_key)}
                        </td>
                        <td className="py-2.5 px-2.5 font-semibold text-slate-800">{sheet.sku_code}</td>
                        <td className="py-2.5 px-2.5 font-sans text-slate-800 font-medium">
                          {sheet.sku_name}
                        </td>
                        <td className="py-2.5 px-2.5">
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-bold ${
                              sheet.cost_type === "WIP"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-purple-100 text-purple-800"
                            }`}
                          >
                            {sheet.cost_type}
                          </span>
                        </td>
                        <td className="py-2.5 px-2.5 font-semibold text-emerald-700">{sheet.lot_no}</td>
                        <td className="py-2.5 px-2.5 text-right font-bold text-slate-800">
                          {Number(sheet.actual_qty).toLocaleString()} {sheet.uom_name}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-bold text-slate-900">
                          {Number(sheet.unit_cost).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-bold text-slate-900">
                          {Number(sheet.total_cost).toLocaleString("th-TH", {
                            minimumFractionDigits: 2,
                          })}
                        </td>
                        <td className="py-2.5 px-2.5 text-right text-slate-600">
                          {planCost > 0 ? planCost.toFixed(2) : "—"}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-semibold">
                          {varPct == null ? (
                            <span className="text-slate-400">—</span>
                          ) : varPct >= 0 ? (
                            <span className="text-rose-600">+{varPct.toFixed(1)}%</span>
                          ) : (
                            <span className="text-emerald-600">{varPct.toFixed(1)}%</span>
                          )}
                        </td>
                        <td className="py-2.5 px-2.5 text-center">
                          {sheet.status === "closed" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span> ปิดแล้ว
                            </span>
                          ) : sheet.status === "problem" ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-800">
                              มีปัญหา
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">
                              รอปิดต้นทุน
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-600">
              <div>
                หน้า {pagination.page} จาก {pagination.totalPages}
              </div>
              <div className="flex items-center gap-1">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40"
                >
                  ก่อนหน้า
                </button>
                <button
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-2.5 py-1 rounded border border-slate-200 bg-white hover:bg-slate-100 disabled:opacity-40"
                >
                  ถัดไป
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* SECTION 2 & 3: รายละเอียดต้นทุน & Drill-down วัตถุดิบ        */}
      {/* ========================================================= */}
      {selectedCostSheet && (
        <div ref={detailSectionRef} className="border-t-4 border-[#0b3b70] pt-2">
          <ProductionCostDetailView
            costSheet={selectedCostSheet}
            onClose={() => setSelectedCostSheet(null)}
            onSave={handleSaveCostSheet}
            onDrillDownWip={handleDrillDownWip}
            onRefreshFromErp={
              selectedCostSheet.stage_key === "flour_sifting" && selectedCostSheet.lot_no
                ? () => {
                    setNewLotInput(selectedCostSheet.lot_no);
                    handleCalculateNewLot();
                  }
                : null
            }
          />
        </div>
      )}

      {/* Modal: Calculate New Flour Lot */}
      {showNewLotModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-emerald-50 to-teal-50">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-600 text-white">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">คำนวณต้นทุนแป้งร่อนจาก ERP</h3>
                  <p className="text-xs text-slate-500">ดึงใบเบิกแป้งดิบ ใบรับเข้าคลัง 03 และใบคืนอัตโนมัติ</p>
                </div>
              </div>
              <button
                onClick={() => setShowNewLotModal(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  ระบุรหัส LOT แป้งร่อน (รูปแบบ YYMMDD เช่น 260918)
                </label>
                <input
                  type="text"
                  value={newLotInput}
                  onChange={(e) => setNewLotInput(e.target.value)}
                  placeholder="เช่น 260918"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm font-mono focus:ring-2 focus:ring-emerald-600 focus:outline-none"
                />
                <p className="text-[11px] text-slate-600 mt-1">
                  * ระบบจะถอดรหัสเป็นวันที่ผลิต และค้นหาใบเบิก ERP ที่ Remark มีคำว่า &quot;ร่อนแป้ง&quot; ตรงกับวันที่นั้น
                </p>
              </div>

              {draftError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{draftError}</span>
                </div>
              )}

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-slate-600 space-y-1 text-[11px]">
                <div className="font-semibold text-slate-700">ตัวอย่าง LOT ที่ทดสอบสำเร็จในระบบ:</div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setNewLotInput("260918")}
                    className="px-2 py-0.5 bg-white border border-slate-300 rounded hover:border-emerald-600 font-mono text-emerald-800"
                  >
                    260918 (18/09/2569)
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewLotInput("260919")}
                    className="px-2 py-0.5 bg-white border border-slate-300 rounded hover:border-emerald-600 font-mono text-emerald-800"
                  >
                    260919
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewLotInput("260917")}
                    className="px-2 py-0.5 bg-white border border-slate-300 rounded hover:border-emerald-600 font-mono text-emerald-800"
                  >
                    260917
                  </button>
                </div>
              </div>
            </div>

            <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowNewLotModal(false)}
                className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors"
              >
                ยกเลิก
              </button>
              <button
                onClick={handleCalculateNewLot}
                disabled={isCalculatingDraft}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-sm transition-colors flex items-center gap-1.5"
              >
                {isCalculatingDraft ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> กำลังดึงข้อมูล...
                  </>
                ) : (
                  <>ดึงและเริ่มคำนวณ</>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
