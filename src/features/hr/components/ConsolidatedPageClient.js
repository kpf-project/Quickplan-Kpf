"use client";

import { useState, useEffect, useMemo } from "react";
import QRCode from "react-qr-code";
import Barcode from "react-barcode";
import { fetchConsolidated } from "@/features/hr/services/consolidatedClient";
import PermissionGate from "@/components/PermissionGate";

function ConsolidatedPageContent() {
  const [data, setData] = useState([]);
  const [meta, setMeta] = useState({ totalActive: 0, departments: [], branches: [] });
  const [pagination, setPagination] = useState({ page: 1, pageSize: 20, totalRecords: 0, totalPages: 1 });
  const [cursorInfo, setCursorInfo] = useState({ next: null, hasMore: false });
  const [cursorMap, setCursorMap] = useState({ 1: null });
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(new Date().toISOString().split("T")[0]);
  const [endDate, setEndDate] = useState(new Date().toISOString().split("T")[0]);
  const [searchText, setSearchText] = useState("");
  const [selectedDept, setSelectedDept] = useState("");
  const [selectedBranch, setSelectedBranch] = useState("");

  async function fetchData(page = 1, options = {}) {
    const cursorOverride = Object.prototype.hasOwnProperty.call(options, "cursor")
      ? options.cursor
      : undefined;
    const resetCursors = Boolean(options.resetCursors);
    setLoading(true);
    try {
      const cursorValue = cursorOverride !== undefined ? cursorOverride : cursorMap[page];
      const params = new URLSearchParams({
        startDate,
        endDate,
        search: searchText,
        department: selectedDept,
        branch: selectedBranch,
        page: page.toString(),
        pageSize: "20",
      });
      if (cursorValue) {
        params.set("cursor", cursorValue);
      }
      const result = await fetchConsolidated(params);
      if (!result.ok) {
        const detail = result?.error?.details || result?.data?.details;
        throw new Error(detail ? `${result?.error?.message || "Failed to fetch"}: ${detail}` : (result?.error?.message || "Failed to fetch"));
      }
      const payload = result.data ?? {};
      setData(payload.data || []);
      setMeta(payload.meta || { totalActive: 0, departments: [], branches: [] });
      setPagination(payload.pagination || { page: 1, pageSize: 20, totalRecords: 0, totalPages: 1 });
      setCursorInfo(payload.cursor || { next: null, hasMore: false });
      const nextCursor = payload.cursor?.next ?? null;
      setCursorMap((prev) => {
        const base = resetCursors ? { 1: null } : { ...prev };
        base[page] = cursorValue ?? null;
        base[page + 1] = nextCursor;
        return base;
      });
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchData(1, { cursor: null, resetCursors: true });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Summary Stats
  const stats = useMemo(() => {
    // TotalActive comes from Meta (Query from HR)
    const totalActive = meta.totalActive;

    // Present Today comes from Pagination TotalRecords (Count of joined rows)
    // Note: If filters (dept/branch) are applied, this number reflects the filter.
    // Ideally, "Present Today" might mean ALL present, but usually in a dashboard, 
    // numbers reflect the current view/filter context.
    const present = pagination.totalRecords;

    // Missing is rough calc: Total Active - Present
    // This is only accurate if NO filters are applied. 
    // If filters are applied, TotalActive (which is global) - Present (filtered) is wrong.
    // For now, let's keep it simple: Missing is valid only when no filters.
    // Or we can say "Missing" is N/A when filtered.
    // Let's display it anyway but user understands context.
    const missing = Math.max(0, totalActive - present);

    return { totalActive, present, missing };
  }, [meta, pagination]);

  const downloadSVGAsPNG = (id, filename, type = 'qr') => {
    const svg = document.getElementById(id);
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      const scale = type === 'qr' ? 1024 / svg.clientWidth : 2048 / svg.clientWidth;
      canvas.width = svg.clientWidth * scale;
      canvas.height = svg.clientHeight * scale;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const pngFile = canvas.toDataURL("image/png");
      const downloadLink = document.createElement("a");
      downloadLink.download = `${filename}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handleFilter = () => {
    fetchData(1, { cursor: null, resetCursors: true }); // Reset to page 1
  };

  const canGoNext = cursorInfo.hasMore && Boolean(cursorMap[pagination.page + 1]);

  return (
    <div className="flex flex-col h-screen bg-[#f8f9fa] text-[#1e293b] font-sans overflow-hidden">
      <div className="bg-gradient-to-r from-[#102C57] to-[#0f172a] shadow-xl text-white shrink-0 z-40">
        <div className="max-w-[95%] mx-auto py-4">
          <div className="flex flex-col gap-4">

            {/* Top Row: Title & Stats */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <div>
                <h6 className="text-[#d4af37] font-bold tracking-[0.2em] text-[10px] uppercase mb-0.5">
                  Executive Dashboard
                </h6>
                <h1 className="text-xl md:text-2xl font-bold font-serif text-white flex flex-wrap items-center gap-2">
                  รายงานสแกนนิ้ว
                  <div className="flex gap-2 ml-2">
                    <span className="text-[10px] bg-white/10 border border-white/10 px-2 py-0.5 rounded-full font-sans font-medium flex items-center gap-1">
                      ทั้งหมด: <b className="text-[#d4af37]">{stats.totalActive.toLocaleString()}</b>
                    </span>
                    <span className="text-[10px] bg-emerald-500/20 border border-emerald-500/30 px-2 py-0.5 rounded-full font-sans font-medium flex items-center gap-1">
                      มา: <b className="text-emerald-400">{stats.present.toLocaleString()}</b>
                    </span>
                    <span className="text-[10px] bg-red-500/20 border border-red-500/30 px-2 py-0.5 rounded-full font-sans font-medium flex items-center gap-1">
                      ขาด: <b className="text-red-300">{(searchText || selectedDept || selectedBranch) ? "-" : stats.missing.toLocaleString()}</b>
                    </span>
                  </div>
                </h1>
              </div>
            </div>

            {/* Filter Toolbar (Grid for Mobile) */}
            <div className="grid grid-cols-2 lg:flex lg:flex-row items-center gap-2 bg-white/5 p-2 rounded-xl text-sm border border-white/10 w-full">

              {/* Search - Full width on mobile */}
              <div className="relative col-span-2 lg:w-64">
                <input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleFilter()}
                  placeholder="ค้นหาชื่อ หรือ รหัส..."
                  className="w-full h-9 pl-3 pr-8 rounded-lg bg-black/20 border border-white/10 text-white placeholder:text-white/30 text-xs focus:ring-1 focus:ring-[#d4af37] outline-none"
                />
              </div>

              {/* Date Range - Full width on mobile */}
              <div className="col-span-2 lg:w-auto bg-black/20 rounded-lg p-0.5 border border-white/10 flex items-center">
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="flex-1 h-8 bg-transparent text-white text-[10px] px-2 outline-none [&::-webkit-calendar-picker-indicator]:invert opacity-80" />
                <span className="text-white/30 text-[10px]">-</span>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="flex-1 h-8 bg-transparent text-white text-[10px] px-2 outline-none [&::-webkit-calendar-picker-indicator]:invert opacity-80" />
              </div>

              {/* Branch Select - Half width mobile */}
              <select
                className="col-span-1 h-9 rounded-lg bg-black/20 border border-white/10 text-white text-[10px] px-2 outline-none w-full lg:w-40 [&>option]:text-black"
                value={selectedBranch}
                onChange={(e) => setSelectedBranch(e.target.value)}
              >
                <option value="">ทุกสาขา</option>
                {meta.branches?.map((br, i) => (
                  <option key={i} value={br}>{br}</option>
                ))}
              </select>

              {/* Dept Select - Half width mobile */}
              <select
                className="col-span-1 h-9 rounded-lg bg-black/20 border border-white/10 text-white text-[10px] px-2 outline-none w-full lg:w-40 [&>option]:text-black"
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
              >
                <option value="">ทุกแผนก</option>
                {meta.departments?.map((dept, i) => (
                  <option key={i} value={dept}>{dept}</option>
                ))}
              </select>

              <div className="flex-1 hidden xl:block"></div>

              {/* Search Button - Full Width Mobile */}
              <button
                onClick={handleFilter}
                disabled={loading}
                className="col-span-2 lg:w-auto h-9 px-6 bg-[#d4af37] hover:bg-[#b5952f] text-[#102C57] text-xs font-bold rounded-lg shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2"
              >
                {loading ? "..." : "ค้นหา"}
              </button>

              <div className="col-span-2 lg:col-span-1 flex items-center justify-between lg:justify-start gap-2 rounded-lg px-2 py-1 text-[10px] text-white/90 border border-white/10 bg-black/20 shadow-[0_6px_18px_rgba(15,23,42,0.2)]">
                <button
                  onClick={() => fetchData(pagination.page - 1)}
                  disabled={pagination.page <= 1 || loading}
                  className="h-7 px-3 rounded-md border border-[#b5952f] bg-[#d4af37] text-[#102C57] hover:bg-[#b5952f] disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  ก่อนหน้า
                </button>
                <span className="px-3 py-1 rounded-md bg-black/30 border border-white/10 text-[10px] tracking-wide">
                  หน้า {pagination.page} / {pagination.totalPages}
                </span>
                <button
                  onClick={() => fetchData(pagination.page + 1)}
                  disabled={!canGoNext || loading}
                  className="h-7 px-3 rounded-md border border-[#b5952f] bg-[#d4af37] text-[#102C57] hover:bg-[#b5952f] disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  ถัดไป
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto max-w-[95%] mx-auto w-full px-0 pb-4 relative z-10 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden mt-4">

          {/* Desktop Table */}
          <div className="hidden lg:block overflow-x-auto">
            <table className="w-full text-left border-collapse table-fixed md:table-auto">
              <thead className="bg-[var(--surface-navy,#102C57)] text-white sticky top-0 z-20 shadow-md">
                <tr>
                  <th className="py-3 px-2 lg:px-6 text-xs font-bold uppercase tracking-wider border-b border-[#0f172a] w-24">วันที่</th>
                  <th className="py-3 px-2 lg:px-6 text-xs font-bold uppercase tracking-wider border-b border-[#0f172a] w-28">รหัส</th>
                  <th className="py-3 px-2 lg:px-6 text-xs font-bold uppercase tracking-wider border-b border-[#0f172a]">ชื่อ-นามสกุล</th>
                  <th className="py-3 px-2 lg:px-6 text-xs font-bold uppercase tracking-wider border-b border-[#0f172a]">แผนก</th>
                  <th className="hidden xl:table-cell py-3 px-2 lg:px-6 text-xs font-bold uppercase tracking-wider border-b border-[#0f172a]">สาขา</th>
                  <th className="py-3 px-2 lg:px-6 text-xs font-bold uppercase tracking-wider text-center border-b border-[#0f172a] w-20">Barcode</th>
                  <th className="py-3 px-2 lg:px-6 text-xs font-bold uppercase tracking-wider text-center border-b border-[#0f172a] w-20">QR</th>
                  <th className="py-3 px-2 lg:px-6 text-xs font-bold uppercase tracking-wider text-center border-b border-[#0f172a] w-24">เข้า</th>
                  <th className="py-3 px-2 lg:px-6 text-xs font-bold uppercase tracking-wider text-center border-b border-[#0f172a] w-24">ออก</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {loading && data.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-gray-500">
                      กำลังโหลดข้อมูล...
                    </td>
                  </tr>
                ) : data.length > 0 ? (
                  data.map((row, idx) => {
                    const isSingleScan = row.CheckIn === row.CheckOut;
                    const qrId = `qr-${row.PRS_NO}-${idx}`;
                    const bcId = `bc-${row.PRS_NO}-${idx}`;

                    return (
                      <tr key={idx} className="hover:bg-blue-50/50 transition-colors group">
                        <td className="py-4 px-2 lg:px-6 text-sm text-gray-500 font-mono align-top">{row.DateStr}</td>
                        <td className="py-4 px-2 lg:px-6 text-sm font-semibold text-[#102C57] align-top">{row.PRS_NO}</td>
                        <td className="py-4 px-2 lg:px-6 text-sm text-gray-900 font-medium align-top break-words">{row.Name}</td>
                        <td className="py-4 px-2 lg:px-6 text-sm text-gray-600 align-top break-words">
                          <span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs font-medium border border-gray-200 inline-block">
                            {row.DEPT_THAIDESC ?? "-"}
                          </span>
                        </td>
                        <td className="hidden xl:table-cell py-4 px-2 lg:px-6 text-sm text-gray-600 align-top break-words">{row.BR_THAIDESC ?? "-"}</td>
                        <td className="py-4 px-2 lg:px-6 text-center align-top">
                          <div
                            className="flex justify-center cursor-pointer hover:scale-110 transition-transform bg-white p-1 rounded"
                            title="คลิกเพื่อโหลด Barcode"
                            onClick={() => downloadSVGAsPNG(bcId, `Barcode_${row.PRS_NO}`, 'barcode')}
                          >
                            <Barcode id={bcId} value={row.PRS_NO} width={1.2} height={40} displayValue={false} background="transparent" margin={0} />
                          </div>
                        </td>
                        <td className="py-4 px-2 lg:px-6 text-center align-top">
                          <div
                            className="flex justify-center cursor-pointer hover:scale-110 transition-transform bg-white p-1 rounded border border-gray-100 w-fit mx-auto"
                            title="คลิกเพื่อโหลด QR Code"
                            onClick={() => downloadSVGAsPNG(qrId, `QRCode_${row.PRS_NO}`, 'qr')}
                          >
                            <QRCode id={qrId} value={row.PRS_NO} size={48} />
                          </div>
                        </td><td className="py-4 px-2 lg:px-6 text-center align-top">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                            {row.CheckIn}
                          </span>
                        </td>
                        <td className="py-4 px-2 lg:px-6 text-center align-top">
                          {isSingleScan ? (
                            <span className="text-gray-300 font-mono text-xs">-</span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-100">
                              {row.CheckOut}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-gray-500">
                      <div className="flex flex-col items-center gap-2">
                        <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <p>ไม่พบข้อมูล</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="lg:hidden flex flex-col gap-3 p-4">
            {loading && data.length === 0 ? (
              <div className="text-center py-12 text-gray-500 animate-pulse">กำลังโหลดข้อมูล...</div>
            ) : data.length > 0 ? (
              data.map((row, idx) => {
                const isSingleScan = row.CheckIn === row.CheckOut;
                return (
                  <div key={idx} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-[var(--surface-navy,#102C57)] text-white flex items-center justify-center text-xs font-bold">
                          {row.Name.charAt(0)}
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-gray-800">{row.Name}</h3>
                          <span className="text-[10px] text-gray-400 font-mono">{row.PRS_NO}</span>
                        </div>
                      </div>
                      <span className="text-[10px] text-gray-400">{row.DateStr}</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 my-3">
                      <div className="bg-emerald-50 rounded-lg p-2 text-center border border-emerald-100">
                        <span className="block text-[9px] text-emerald-600 uppercase mb-0.5">Check In</span>
                        <span className="font-mono text-sm font-bold text-emerald-700">{row.CheckIn}</span>
                      </div>
                      <div className="bg-amber-50 rounded-lg p-2 text-center border border-amber-100">
                        <span className="block text-[9px] text-amber-600 uppercase mb-0.5">Check Out</span>
                        <span className="font-mono text-sm font-bold text-amber-700">
                          {isSingleScan ? "-" : row.CheckOut}
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between items-center text-[10px] text-gray-500 border-t border-gray-50 pt-2">
                      <span>{row.DEPT_THAIDESC ?? "-"}</span>
                      <span className="px-2 py-0.5 bg-gray-100 rounded-full">{row.BR_THAIDESC ?? "-"}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-12 text-gray-400 text-sm">ไม่พบข้อมูล</div>
            )}
          </div>

          {/* Pagination */}
        </div>
      </div>
    </div>
  );
}

export default function ConsolidatedPage() {
  return (
    <PermissionGate permissionsAny={["admin-consolidated", "hr-consolidated-view"]}>
      <ConsolidatedPageContent />
    </PermissionGate>
  );
}



