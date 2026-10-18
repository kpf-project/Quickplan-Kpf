"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchSkuMinMax } from "@/features/sku-min-max/services/skuMinMaxClient";
import PermissionGate from "@/components/PermissionGate";

function SkuMinMaxPageContent() {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, totalRecords: 0, pageSize: 100 });
  const [cursorInfo, setCursorInfo] = useState({ next: null, hasMore: false });
  const [cursorMap, setCursorMap] = useState({ 1: null });
  const [iccatSearch, setIccatSearch] = useState("");
  const hasLoadedInitial = useRef(false);

  const loadData = useCallback(async (page = 1, options = {}) => {
    const cursorOverride = Object.prototype.hasOwnProperty.call(options, "cursor")
      ? options.cursor
      : undefined;
    const resetCursors = Boolean(options.resetCursors);
    setLoading(true);
    setErrorMessage("");
    try {
      const cursorValue = cursorOverride !== undefined ? cursorOverride : cursorMap[page];
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("pageSize", pagination.pageSize.toString());
      if (iccatSearch.trim()) {
        params.set("iccat", iccatSearch.trim());
      }
      if (cursorValue) {
        params.set("cursor", cursorValue);
      }

      const result = await fetchSkuMinMax(params);
      if (!result.ok) {
        throw new Error("Unable to load data.");
      }
      const payload = result.data;
      setRecords(payload?.data ?? []);
      setPagination(payload?.pagination ?? { page: 1, totalPages: 1, totalRecords: 0, pageSize: 100 });
      setCursorInfo(payload?.cursor ?? { next: null, hasMore: false });
      const nextCursor = payload?.cursor?.next ?? null;
      setCursorMap((prev) => {
        const base = resetCursors ? { 1: null } : { ...prev };
        base[page] = cursorValue ?? null;
        base[page + 1] = nextCursor;
        return base;
      });
    } catch (error) {
      setErrorMessage(error?.message || "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, [iccatSearch, pagination.pageSize, cursorMap]);

  useEffect(() => {
    if (hasLoadedInitial.current) {
      return;
    }
    loadData(1, { cursor: null, resetCursors: true });
    hasLoadedInitial.current = true;
  }, [loadData]);

  const handleSearch = () => {
    loadData(1, { cursor: null, resetCursors: true });
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      handleSearch();
    }
  };

  const canGoNext = cursorInfo.hasMore && Boolean(cursorMap[pagination.page + 1]);

  return (
    <div className="flex flex-col h-screen bg-[#f8f9fa] text-[#1e293b] font-sans overflow-hidden">
      <div className="bg-gradient-to-r from-[#102C57] to-[#0f172a] shadow-xl text-white shrink-0 z-40">
        <div className="max-w-[95%] mx-auto py-4">
          <div className="flex flex-col gap-4">

            {/* Top Row: Title & Search Toolbar */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <div>
                <h1 className="text-xl md:text-2xl font-bold font-serif text-white flex items-center gap-3">
                  ข้อมูลสินค้า ต่ำสุด/สูงสุด
                  <span className="text-[10px] bg-[#d4af37] text-[#102C57] px-2 py-0.5 rounded-full font-sans font-bold tracking-wider">
                    {pagination.totalRecords.toLocaleString()} รายการ
                  </span>
                </h1>
              </div>

              {/* Filter Toolbar (Flex Row for Mobile Compactness) */}
              <div className="flex flex-row items-center gap-2 bg-white/5 p-2 rounded-xl text-sm border border-white/10 w-full lg:w-auto">
                {/* Search Input */}
                <div className="relative flex-1 md:w-80">
                  <input
                    value={iccatSearch}
                    onChange={(event) => setIccatSearch(event.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="ค้นหาประเภทสินค้า..."
                    className="w-full h-9 pl-3 pr-8 rounded-lg bg-black/20 border border-white/10 text-white placeholder:text-white/30 text-xs focus:ring-1 focus:ring-[#d4af37] outline-none"
                  />
                </div>

                {/* Search Button */}
                <button
                  onClick={handleSearch}
                  disabled={loading}
                  className="w-auto h-9 px-4 bg-[#d4af37] hover:bg-[#b5952f] text-[#102C57] text-xs font-bold rounded-lg shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  <span className="hidden md:inline">ค้นหา</span>
                  <span className="md:hidden">🔍</span>
                </button>

                <div className="flex items-center justify-between gap-2 rounded-lg px-2 py-1 text-[10px] text-white/90 border border-white/10 bg-black/20 shadow-[0_6px_18px_rgba(15,23,42,0.2)]">
                  <button
                    onClick={() => loadData(pagination.page - 1)}
                    disabled={pagination.page <= 1 || loading}
                    className="h-7 px-3 rounded-md border border-[#b5952f] bg-[#d4af37] text-[#102C57] hover:bg-[#b5952f] disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    ก่อนหน้า
                  </button>
                  <span className="px-3 py-1 rounded-md bg-black/30 border border-white/10 text-[10px] tracking-wide">
                    หน้า {pagination.page} / {pagination.totalPages}
                  </span>
                  <button
                    onClick={() => loadData(pagination.page + 1)}
                    disabled={!canGoNext || loading}
                    className="h-7 px-3 rounded-md border border-[#b5952f] bg-[#d4af37] text-[#102C57] hover:bg-[#b5952f] disabled:opacity-50 disabled:cursor-not-allowed transition"
                  >
                    ถัดไป
                  </button>
                </div>
              </div>
            </div>

            {errorMessage && (
              <div className="text-[10px] text-red-300 bg-red-500/10 border border-red-500/20 px-3 py-1 rounded">
                {errorMessage}
              </div>
            )}

          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto max-w-[95%] mx-auto w-full px-0 pb-4 relative z-10 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-visible mt-4">
          {/* Desktop Table View */}
          <div className="hidden lg:block table-scroll">
            <table className="w-full border-collapse text-left text-sm table-bordered">
              <thead className="bg-[var(--surface-navy,#102C57)] text-sm uppercase tracking-wider text-white text-center sticky top-0 z-20 shadow-md">
                <tr>
                  <th className="px-2 lg:px-4 py-3 font-semibold border-b border-[#0f172a]">รหัส</th>
                  <th className="px-2 lg:px-4 py-3 font-semibold border-b border-[#0f172a]">ชื่อสินค้า</th>
                  <th className="px-2 lg:px-4 py-3 font-semibold border-b border-[#0f172a]">หน่วย</th>
                  {/* Hide less critical columns on Tablet */}
                  <th className="hidden xl:table-cell px-2 lg:px-4 py-3 font-semibold border-b border-[#0f172a]">หน่วยแสดง</th>
                  <th className="hidden xl:table-cell px-2 lg:px-4 py-3 font-semibold border-b border-[#0f172a]">บรรจุ</th>
                  <th className="px-2 lg:px-4 py-3 font-semibold border-b border-[#0f172a]" title="ระยะเวลาส่งของ">Lead Time</th>
                  <th className="px-2 lg:px-4 py-3 font-semibold border-b border-[#0f172a]">ต่ำสุด</th>
                  <th className="px-2 lg:px-4 py-3 font-semibold border-b border-[#0f172a]">สูงสุด</th>
                  <th className="px-2 lg:px-4 py-3 font-semibold border-b border-[#0f172a]" title="ต่ำสุดในการสั่งซื้อ">Min Order</th>
                  <th className="hidden xl:table-cell px-2 lg:px-4 py-3 font-semibold border-b border-[#0f172a]">ประเภท</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white text-gray-700">
                {loading && records.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-6 py-12 text-center text-gray-500">
                      กำลังโหลดข้อมูล...
                    </td>
                  </tr>
                ) : records.length > 0 ? (
                  records.map((record, index) => (
                    <tr key={`${record.SKU_CODE}-${record.AP_CODE}-${index}`} className="hover:bg-blue-50/50 transition-colors">
                      <td className="px-2 lg:px-4 py-3 font-mono text-[#102C57] align-top">{record.SKU_CODE}</td>
                      <td className="px-2 lg:px-4 py-3 align-top min-w-[150px] lg:min-w-[240px] break-words">{record.SKU_NAME}</td>
                      <td className="px-2 lg:px-4 py-3 align-top">{record.UTQ_NAME}</td>
                      <td className="hidden xl:table-cell px-2 lg:px-4 py-3 align-top">{record.UTQ_NAME_1}</td>
                      <td className="hidden xl:table-cell px-2 lg:px-4 py-3 align-top">{record.UTQ_QTY_1}</td>
                      <td className="px-2 lg:px-4 py-3 align-top text-center">{record.SKU_LEAD_TIME}</td>
                      <td className="px-2 lg:px-4 py-3 font-semibold align-top text-center">{record.SKU_MIN_QTY}</td>
                      <td className="px-2 lg:px-4 py-3 font-semibold align-top text-center">{record.SKU_MAX_QTY}</td>
                      <td className="px-2 lg:px-4 py-3 font-semibold text-[#102C57] align-top text-center">{record.SKU_MIN_ORDER}</td>
                      <td className="hidden xl:table-cell px-2 lg:px-4 py-3 align-top">
                        <span className="font-mono text-[#102C57]">{record.ICCAT_CODE}</span>
                        <span className="px-1 text-gray-300">-</span>
                        <span>{record.ICCAT_NAME}</span>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={11} className="px-6 py-12 text-center text-gray-500">
                      ไม่พบข้อมูล
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="lg:hidden flex flex-col gap-3 p-4">
            {loading && records.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">กำลังโหลดข้อมูล...</div>
            ) : records.length > 0 ? (
              records.map((record, index) => (
                <div key={`${record.SKU_CODE}-${record.AP_CODE}-${index}`} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col gap-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="inline-block bg-[var(--surface-navy,#102C57)] text-white text-[10px] px-2 py-0.5 rounded font-mono mb-1">{record.SKU_CODE}</span>
                      <h3 className="text-sm font-bold text-gray-800 leading-tight">{record.SKU_NAME}</h3>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-gray-50 text-xs text-center bg-gray-50/50 rounded-lg p-2">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-gray-400 uppercase">Unit</span>
                      <span className="font-semibold text-gray-700">{record.UTQ_NAME}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] text-gray-400 uppercase">Lead Time</span>
                      <span className="font-semibold text-gray-700">{record.SKU_LEAD_TIME} Days</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-1 pt-2 border-t border-dashed border-gray-200 text-xs text-center">
                    <div>
                      <span className="block text-[9px] text-gray-400 uppercase">Min</span>
                      <span className="font-bold text-[#d4af37] text-sm">{record.SKU_MIN_QTY}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] text-gray-400 uppercase">Max</span>
                      <span className="font-bold text-[#102C57] text-sm">{record.SKU_MAX_QTY}</span>
                    </div>
                    <div>
                      <span className="block text-[9px] text-gray-400 uppercase">Min Order</span>
                      <span className="font-bold text-blue-600 text-sm">{record.SKU_MIN_ORDER}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-gray-400 text-sm">ไม่พบข้อมูล</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SkuMinMaxPage() {
  return (
    <PermissionGate permissionsAny={["admin-sku-min-max", "data-sku-min-max-view"]}>
      <SkuMinMaxPageContent />
    </PermissionGate>
  );
}
