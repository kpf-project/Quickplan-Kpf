"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { 
  ClipboardList, 
  Search, 
  Download, 
  Eye, 
  Calendar, 
  ArrowLeft, 
  RefreshCw, 
  CheckCircle2, 
  XCircle, 
  Copy, 
  Check 
} from "lucide-react";

export function RequisitionHistoryConsoleClient({
  masterPlanNo: initialMasterPlanNo = "",
  planOptions = [],
}) {
  const [masterPlanNo, setMasterPlanNo] = useState(initialMasterPlanNo || planOptions[0]?.planNo || "");
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [copiedDocNo, setCopiedDocNo] = useState(null);

  // Fetch groups with statuses=exported,cancelled
  const fetchHistory = useCallback(async () => {
    if (!masterPlanNo) return;
    setLoading(true);
    try {
      const response = await fetch(
        `/api/production-planning/requisition/groups?masterPlanNo=${masterPlanNo}&statuses=exported,cancelled`
      );
      if (!response.ok) throw new Error("Failed to fetch history");
      const payload = await response.json();
      setGroups(payload.data || []);
    } catch (error) {
      console.error("Error loading requisition history:", error);
    } finally {
      setLoading(false);
    }
  }, [masterPlanNo]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Handle Excel download
  const handleDownloadExcel = async (groupId, documentNo) => {
    setDownloadingId(groupId);
    try {
      const response = await fetch("/api/production-planning/requisition/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groupIds: [groupId] }),
      });
      if (!response.ok) throw new Error("Failed to export Excel file");
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${documentNo || `REQUISITION_${groupId}`}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      alert("ไม่สามารถดาวน์โหลดไฟล์ Excel ได้: " + err.message);
    } finally {
      setDownloadingId(null);
    }
  };

  // Clipboard copy helper
  const handleCopyText = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedDocNo(text);
    setTimeout(() => setCopiedDocNo(null), 2000);
  };

  // Process and filter groups
  const filteredGroups = useMemo(() => {
    return groups.filter((g) => {
      const q = searchQuery.toLowerCase().trim();
      if (!q) return true;
      return (
        String(g.document_no || "").toLowerCase().includes(q) ||
        String(g.group_name || "").toLowerCase().includes(q) ||
        String(g.metadata?.ownerDepartmentName || "").toLowerCase().includes(q) ||
        String(g.metadata?.roomLabel || "").toLowerCase().includes(q)
      );
    });
  }, [groups, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const active = groups.filter((g) => g.status === "exported").length;
    const cancelled = groups.filter((g) => g.status === "cancelled").length;
    const totalLines = groups.reduce((sum, g) => sum + (g.items?.length || 0), 0);
    return { active, cancelled, totalLines };
  }, [groups]);

  // View details
  const handleOpenDetails = (group) => {
    setSelectedGroup(group);
    setDrawerOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans pb-16">
      
      {/* 1. Header Banner */}
      <header className="bg-[var(--surface-navy,#102C57)] text-white py-6 px-4 sm:px-6 lg:px-8 border-b-4 border-[#d4af37] shadow-lg">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#d4af37]/10 rounded border border-[#d4af37]/30">
              <ClipboardList className="h-7 w-7 text-[#f2d68a]" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black uppercase tracking-wider text-white">
                ประวัติและตรวจสอบใบเบิกวัตถุดิบ
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 font-medium tracking-wide">
                Requisition History & Audit Console (Navy & Gold Premium Edition)
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 bg-[#0f172a]/40 border border-[#d4af37]/20 px-3.5 py-1.5 rounded-[2px]">
              <span className="text-xs font-bold text-[#f2d68a] uppercase tracking-wider">แผนหลัก:</span>
              <select
                value={masterPlanNo}
                onChange={(e) => setMasterPlanNo(e.target.value)}
                className="bg-[#0f172a] text-[#f2d68a] text-xs font-black focus:outline-none cursor-pointer border border-[#d4af37]/30 px-2 py-1 rounded-[2px] min-w-[180px]"
              >
                {planOptions.map((opt) => (
                  <option key={opt.planNo} value={opt.planNo} className="bg-[#0f172a] text-white font-bold">
                    {opt.planNo}
                  </option>
                ))}
              </select>
            </div>
            <Link
              href="/production-line/planning/schedule"
              className="inline-flex items-center gap-1 bg-[#d4af37] hover:bg-[#bfa032] text-[#102C57] text-xs font-bold px-3.5 py-2 rounded-[2px] shadow-md transition-all duration-200"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              กลับหน้าวางแผน
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-6 space-y-6">
        
        {/* 2. Overview Statistics */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white border-l-4 border-[#d4af37] p-4 shadow-sm rounded-[2px] transition-all hover:shadow-md">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">ใบเบิกที่ใช้งานจริง (Active)</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-black text-[#102C57] tracking-tight">{stats.active}</span>
              <span className="text-xs font-bold text-emerald-600">เอกสาร</span>
            </div>
          </div>
          <div className="bg-white border-l-4 border-slate-400 p-4 shadow-sm rounded-[2px] transition-all hover:shadow-md">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">ใบเบิกที่ถูกยกเลิก (Cancelled)</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-black text-slate-500 tracking-tight">{stats.cancelled}</span>
              <span className="text-xs font-bold text-slate-400">เอกสาร</span>
            </div>
          </div>
          <div className="bg-white border-l-4 border-[#102C57] p-4 shadow-sm rounded-[2px] transition-all hover:shadow-md">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">จำนวนรายการวัสดุรวม</p>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-black text-[#102C57] tracking-tight">{stats.totalLines}</span>
              <span className="text-xs font-bold text-slate-500">รายการ</span>
            </div>
          </div>
        </div>

        {/* 3. Filter and Toolbar */}
        <div className="bg-white p-4 shadow-sm border border-slate-200/60 rounded-[2px] flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="ค้นหาเลขเอกสาร, แผนก, กะ หรือห้องจัดเตรียม..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 pl-10 pr-4 py-2 text-xs sm:text-sm rounded-[2px] font-medium focus:outline-none focus:border-[#102C57] focus:ring-1 focus:ring-[#102C57]/20 transition-all"
            />
          </div>
          <div className="flex items-center gap-2 justify-end">
            <button
              onClick={fetchHistory}
              disabled={loading}
              className="inline-flex items-center gap-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold px-4 py-2 rounded-[2px] transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              รีเฟรชข้อมูล
            </button>
          </div>
        </div>

        {/* 4. History Data Table */}
        <div className="bg-white shadow-sm border border-slate-200/60 rounded-[2px] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-[var(--surface-navy,#102C57)] text-[#f2d68a] text-[11px] font-black uppercase tracking-widest border-b border-[#d4af37]/40">
                  <th className="py-3 px-4 w-44">เลขที่เอกสาร</th>
                  <th className="py-3 px-4 w-32">วันที่ออก</th>
                  <th className="py-3 px-4">รายละเอียดกลุ่มใบเบิก</th>
                  <th className="py-3 px-4 w-28">ประเภทการเบิก</th>
                  <th className="py-3 px-4 w-28 text-center">จำนวนรายการ</th>
                  <th className="py-3 px-4 w-32 text-center">สถานะการเบิก</th>
                  <th className="py-3 px-4 w-32 text-center">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs sm:text-sm font-medium">
                {loading ? (
                  <tr>
                    <td colSpan="7" className="text-center py-12 text-slate-400 font-bold">
                      <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2 text-[#d4af37]" />
                      กำลังโหลดประวัติใบเบิก...
                    </td>
                  </tr>
                ) : filteredGroups.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="text-center py-12 text-slate-400 font-bold">
                      ไม่พบประวัติการออกใบเบิกตามเงื่อนไขที่เลือก
                    </td>
                  </tr>
                ) : (
                  filteredGroups.map((group) => {
                    const isCancelled = group.status === "cancelled";
                    const formattedDate = group.exported_at
                      ? new Date(group.exported_at).toLocaleDateString("th-TH", {
                          day: "2-digit",
                          month: "2-digit",
                          year: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        }) + " น."
                      : "-";

                    const deptCode = group.metadata?.lookup27DepartmentCode || "";
                    const deptName = group.metadata?.ownerDepartmentName || "ไม่ระบุแผนก";
                    const room = group.metadata?.roomLabel || "";
                    const cleanRoom = room.replace(/^\[[^\]]+\]\s*/, "");
                    const shift = group.metadata?.shiftName || group.metadata?.shiftCode || "";

                    const detailParts = [
                      deptCode ? `[${deptCode}] ${deptName}` : deptName,
                      cleanRoom ? `ห้อง ${cleanRoom}` : "",
                      shift ? `กะ ${shift}` : ""
                    ].filter(Boolean);

                    return (
                      <tr 
                        key={group.id} 
                        className={`hover:bg-slate-50/80 transition-colors ${
                          isCancelled ? "bg-slate-50/50 text-slate-400" : ""
                        }`}
                      >
                        <td className="py-3.5 px-4 font-black">
                          <div className="flex items-center gap-1.5">
                            <span className={isCancelled ? "line-through text-slate-400" : "text-[#102C57]"}>
                              {group.document_no || "WAITING"}
                            </span>
                            {group.document_no && (
                              <button
                                type="button"
                                onClick={() => handleCopyText(group.document_no)}
                                className="p-1 hover:bg-slate-200 rounded transition-colors text-slate-400 hover:text-slate-600"
                                title="คัดลอกเลขเอกสาร"
                              >
                                {copiedDocNo === group.document_no ? (
                                  <Check className="h-3 w-3 text-emerald-600" />
                                ) : (
                                  <Copy className="h-3 w-3" />
                                )}
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-slate-500 font-bold tabular-nums">
                          {formattedDate}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-bold text-slate-700">
                            {detailParts.join(" - ")}
                          </div>
                          {group.group_name && (
                            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                              ป้ายกำกับ: {group.group_name}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 font-bold">
                          {group.claim_grain === "daily" ? (
                            <span className="px-2 py-0.5 rounded-[2px] bg-sky-100 text-sky-800 text-[10px] font-black uppercase">
                              รายวัน
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-[2px] bg-amber-100 text-amber-800 text-[10px] font-black uppercase">
                              รายสัปดาห์
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center font-bold tabular-nums">
                          {group.items?.length || 0}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          {isCancelled ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[10px] font-black uppercase border border-slate-300">
                              <XCircle className="h-3 w-3" />
                              ยกเลิกแล้ว
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-black uppercase border border-emerald-300">
                              <CheckCircle2 className="h-3 w-3" />
                              ใช้งานอยู่
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleOpenDetails(group)}
                              className="p-1.5 bg-slate-100 hover:bg-[var(--surface-navy,#102C57)]/10 hover:text-[#102C57] text-slate-600 rounded-[2px] transition-all"
                              title="ดูรายละเอียดสินค้า"
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDownloadExcel(group.id, group.document_no)}
                              disabled={downloadingId === group.id}
                              className="p-1.5 bg-[#d4af37]/10 hover:bg-[#d4af37]/20 text-[#102C57] hover:text-[#102C57] rounded-[2px] transition-all disabled:opacity-50"
                              title="ดาวน์โหลดไฟล์ Excel ใบเดิม"
                            >
                              <Download className={`h-3.5 w-3.5 ${downloadingId === group.id ? "animate-bounce" : ""}`} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </main>

      {/* 5. Requisition Detail Slide-Over Drawer */}
      {drawerOpen && selectedGroup && (
        <div className="fixed inset-0 z-[100] overflow-hidden font-sans">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity" onClick={() => setDrawerOpen(false)} />
          
          <div className="absolute inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-2xl bg-white shadow-2xl border-l-4 border-[#d4af37] flex flex-col">
              
              {/* Drawer Header */}
              <div className="bg-[var(--surface-navy,#102C57)] text-white py-5 px-6 border-b border-[#d4af37]/30 flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-black text-[#f2d68a] uppercase tracking-wider">
                    รายละเอียดใบเบิกวัตถุดิบ
                  </h3>
                  <p className="text-xs text-slate-300 font-bold mt-0.5 font-mono">
                    เอกสารเลขที่: {selectedGroup.document_no || "WAITING"}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="rounded-[2px] p-1.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs"
                >
                  ปิดหน้าจอ
                </button>
              </div>

              {/* Drawer Content */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                
                {/* Meta details grid */}
                <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 border border-slate-200/60 rounded-[2px] text-xs font-bold text-slate-600">
                  <div>
                    <span className="block text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">แผนกที่เบิก</span>
                    <span className="text-[#102C57] text-sm">
                      {selectedGroup.metadata?.ownerDepartmentCode ? `[${selectedGroup.metadata.lookup27DepartmentCode}] ` : ""}
                      {selectedGroup.metadata?.ownerDepartmentName || "ไม่ระบุแผนก"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">กะ & ห้องจัดเตรียม</span>
                    <span className="text-slate-700 text-sm">
                      ห้อง: {selectedGroup.metadata?.roomLabel?.replace(/^\[[^\]]+\]\s*/, "") || "ไม่ระบุ"} / กะ: {selectedGroup.metadata?.shiftName || "ไม่ระบุ"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">ประเภทแผนการผลิต</span>
                    <span className="text-slate-700 text-sm capitalize">
                      {selectedGroup.claim_grain === "daily" ? "แผนรายวัน" : "แผนสัปดาห์ / ควบรวม"}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">วันที่ออกเอกสาร</span>
                    <span className="text-slate-700 text-sm">
                      {selectedGroup.exported_at ? new Date(selectedGroup.exported_at).toLocaleString("th-TH") : "-"}
                    </span>
                  </div>
                </div>

                {/* Items Table */}
                <div className="space-y-2">
                  <h4 className="text-sm font-black text-[#102C57] uppercase tracking-wider">รายการสินค้าข้างในใบเบิก</h4>
                  <div className="border border-slate-200 rounded-[2px] overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs sm:text-sm">
                      <thead>
                        <tr className="bg-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-wider border-b border-slate-200">
                          <th className="py-2.5 px-4 w-44">รหัสซื้อขาย</th>
                          <th className="py-2.5 px-4">ชื่อวัตถุดิบ / สินค้า</th>
                          <th className="py-2.5 px-4 w-28 text-right">จำนวนเบิก</th>
                          <th className="py-2.5 px-4 w-24 text-center">หน่วย</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                        {selectedGroup.items && selectedGroup.items.length > 0 ? (
                          selectedGroup.items.map((item, itemIndex) => (
                            <tr key={item.id || itemIndex} className="hover:bg-slate-50/50">
                              <td className="py-2.5 px-4 font-black font-mono text-[#102C57]">
                                {item.material_goods_code}
                              </td>
                              <td className="py-2.5 px-4 text-slate-600 font-bold">
                                {item.metadata?.materialName || item.material_sku_code}
                              </td>
                              <td className="py-2.5 px-4 text-right font-black text-[#102C57] tabular-nums">
                                {Number(item.issue_qty || 0).toLocaleString(undefined, { minimumFractionDigits: 3 })}
                              </td>
                              <td className="py-2.5 px-4 text-center font-bold text-slate-500">
                                {item.metadata?.unit || "หน่วย"}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan="4" className="text-center py-6 text-slate-400 font-bold">
                              ไม่มีสินค้าในใบเบิกใบนี้
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

              </div>

              {/* Drawer Footer */}
              <div className="bg-slate-50 py-4 px-6 border-t border-slate-200 flex justify-between gap-4">
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="px-4 py-2 border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-[2px]"
                >
                  ปิดหน้าจอ
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadExcel(selectedGroup.id, selectedGroup.document_no)}
                  className="inline-flex items-center gap-1.5 bg-[var(--surface-navy,#102C57)] hover:bg-[#1a3d6b] text-white text-xs font-bold px-5 py-2.5 rounded-[2px] shadow-md transition-all"
                >
                  <Download className="h-4 w-4 text-[#f2d68a]" />
                  ดาวน์โหลด Excel ใบเดิม
                </button>
              </div>

            </div>
          </div>
        </div>
      )}

    </div>
  );
}
