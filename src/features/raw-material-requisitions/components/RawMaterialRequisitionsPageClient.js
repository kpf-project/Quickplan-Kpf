"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Search, ClipboardList, List, Grid3x3, Undo2 } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { usePermissions } from "@/lib/usePermissions";
import { fetchRawMaterialRequisitions } from "@/features/raw-material-requisitions/services/rawMaterialRequisitionsClient";

const pad2 = (value) => String(value).padStart(2, "0");

const formatDateInputValue = (date) => (
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`
);

const formatDateDisplay = (value) => {
  if (!value) return "-";
  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return `${pad2(parsed.getDate())}-${pad2(parsed.getMonth() + 1)}-${parsed.getFullYear()}`;
};

const getDefaultDateRange = () => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  return {
    from: formatDateInputValue(startOfMonth),
    to: formatDateInputValue(now),
  };
};

export default function RawMaterialRequisitionsPage({ initialTab = "requisition" }) {
  const activeTab = initialTab === "return" ? "return" : "requisition";
  const [records, setRecords] = useState([]);
  const [returnRecords, setReturnRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hasLoadedInitial, setHasLoadedInitial] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [pagination, setPagination] = useState({ page: 1, totalPages: 1, totalRecords: 0, pageSize: 100 });
  const [returnPagination, setReturnPagination] = useState({ page: 1, totalPages: 1, totalRecords: 0, pageSize: 100 });
  const [cursorInfo, setCursorInfo] = useState({ next: null, hasMore: false });
  const [returnCursorInfo, setReturnCursorInfo] = useState({ next: null, hasMore: false });
  const [cursorMap, setCursorMap] = useState({ 1: null });
  const [returnCursorMap, setReturnCursorMap] = useState({ 1: null });
  const [searchText, setSearchText] = useState("");
  const deferredSearchText = useDeferredValue(searchText);
  const [dateFrom, setDateFrom] = useState(() => getDefaultDateRange().from);
  const [dateTo, setDateTo] = useState(() => getDefaultDateRange().to);
  const scrollRef = useRef(null);
  const tableScrollRef = useRef(null);
  const horizontalScrollRef = useRef(null);
  const horizontalScrollContentRef = useRef(null);
  const horizontalScrollWrapperRef = useRef(null);
  const horizontalScrollThumbRef = useRef(null);
  const cursorMapRef = useRef(cursorMap);
  const returnCursorMapRef = useRef(returnCursorMap);
  const activeRequestRef = useRef(null);
  const latestRequestIdRef = useRef(0);
  const router = useRouter();
  const permissionState = usePermissions();
  const canViewRequisition = permissionState.loaded
    ? (permissionState.isAdmin ||
      permissionState.permissions.includes("admin-requisition"))
    : false;
  const canViewReturn = permissionState.loaded
    ? (permissionState.isAdmin ||
      permissionState.permissions.includes("admin-returns"))
    : false;

  useEffect(() => {
    if (!permissionState.loaded) {
      return;
    }
    if (!canViewRequisition && !canViewReturn) {
      router.replace("/unauthorized");
      return;
    }
    if (activeTab === "requisition" && !canViewRequisition) {
      router.replace(canViewReturn ? "/raw-material-requisitions/return" : "/unauthorized");
      return;
    }
    if (activeTab === "return" && !canViewReturn) {
      router.replace(canViewRequisition ? "/raw-material-requisitions/requisition" : "/unauthorized");
    }
  }, [activeTab, canViewRequisition, canViewReturn, permissionState.loaded, router]);

  useEffect(() => {
    cursorMapRef.current = cursorMap;
  }, [cursorMap]);

  useEffect(() => {
    returnCursorMapRef.current = returnCursorMap;
  }, [returnCursorMap]);

  useEffect(() => {
    return () => {
      activeRequestRef.current?.abort();
    };
  }, []);

  const loadData = useCallback(async (page = 1, type = "requisition", options = {}) => {
    const cursorOverride = Object.prototype.hasOwnProperty.call(options, "cursor")
      ? options.cursor
      : undefined;
    const resetCursors = Boolean(options.resetCursors);
    const searchValue = Object.prototype.hasOwnProperty.call(options, "searchValue")
      ? String(options.searchValue || "").trim()
      : deferredSearchText.trim();
    const requestId = latestRequestIdRef.current + 1;
    latestRequestIdRef.current = requestId;
    activeRequestRef.current?.abort();
    const controller = new AbortController();
    activeRequestRef.current = controller;
    setLoading(true);
    setErrorMessage("");
    try {
      const isRequisition = type === "requisition";
      const pageSize = isRequisition ? pagination.pageSize : returnPagination.pageSize;
      const cursorValue = cursorOverride !== undefined
        ? cursorOverride
        : (isRequisition ? cursorMapRef.current[page] : returnCursorMapRef.current[page]);
      const params = new URLSearchParams();
      params.set("page", page.toString());
      params.set("pageSize", pageSize.toString());
      if (searchValue) {
        params.set("search", searchValue);
      }
      if (dateFrom) {
        params.set("dateFrom", dateFrom);
      }
      if (dateTo) {
        params.set("dateTo", dateTo);
      }
      if (cursorValue) {
        params.set("cursor", cursorValue);
      }

      const endpoint = isRequisition
        ? "/api/raw-material-requisitions"
        : "/api/raw-material-returns";
      const result = await fetchRawMaterialRequisitions(params, endpoint, { signal: controller.signal });
      if (requestId !== latestRequestIdRef.current) {
        return;
      }
      if (!result.ok) {
        throw new Error("Unable to load requisition data.");
      }
      const payload = result.data;
      const nextCursor = payload?.cursor?.next ?? null;
      if (isRequisition) {
        setRecords(payload?.data ?? []);
        setPagination(payload?.pagination ?? { page: 1, totalPages: 1, totalRecords: 0, pageSize: 100 });
        setCursorInfo(payload?.cursor ?? { next: null, hasMore: false });
        setCursorMap((prev) => {
          const base = resetCursors ? { 1: null } : { ...prev };
          base[page] = cursorValue ?? null;
          base[page + 1] = nextCursor;
          return base;
        });
      } else {
        setReturnRecords(payload?.data ?? []);
        setReturnPagination(payload?.pagination ?? { page: 1, totalPages: 1, totalRecords: 0, pageSize: 100 });
        setReturnCursorInfo(payload?.cursor ?? { next: null, hasMore: false });
        setReturnCursorMap((prev) => {
          const base = resetCursors ? { 1: null } : { ...prev };
          base[page] = cursorValue ?? null;
          base[page + 1] = nextCursor;
          return base;
        });
      }
    } catch (error) {
      if (controller.signal.aborted) {
        return;
      }
      setErrorMessage(error?.message || "Failed to load data.");
    } finally {
      if (requestId === latestRequestIdRef.current) {
        setLoading(false);
        setHasLoadedInitial(true);
      }
      if (activeRequestRef.current === controller) {
        activeRequestRef.current = null;
      }
    }
  }, [dateFrom, dateTo, deferredSearchText, pagination.pageSize, returnPagination.pageSize]);

  useEffect(() => {
    if (!permissionState.loaded) {
      return;
    }
    if (activeTab === "requisition" && !canViewRequisition) {
      return;
    }
    if (activeTab === "return" && !canViewReturn) {
      return;
    }
    loadData(1, activeTab, { cursor: null, resetCursors: true });
  }, [activeTab, canViewRequisition, canViewReturn, loadData, permissionState.loaded]);


  const handleSearch = () => {
    loadData(1, activeTab, { cursor: null, resetCursors: true, searchValue: searchText });
  };

  const handleKeyDown = (event) => {
    if (event.key === "Enter") {
      handleSearch();
    }
  };

  const canGoNext = activeTab === "requisition"
    ? cursorInfo.hasMore && Boolean(cursorMap[pagination.page + 1])
    : returnCursorInfo.hasMore && Boolean(returnCursorMap[returnPagination.page + 1]);

  const rows = useMemo(() => records.map((record, index) => ({
    id: `${record.DI_REF || "ref"}-${record.TRD_SEQ || "seq"}-${index}`,
    ...record,
  })), [records]);

  const returnRows = useMemo(() => returnRecords.map((record, index) => ({
    id: `${record.DI_REF || "ref"}-${record.TRD_SEQ || "seq"}-${index}`,
    ...record,
  })), [returnRecords]);

  const activeRows = activeTab === "requisition" ? rows : returnRows;
  const rowVirtualizer = useVirtualizer({
    count: activeRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 48,
    overscan: 10,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalSize = rowVirtualizer.getTotalSize();
  const showLoadingState = loading || !hasLoadedInitial;

  useEffect(() => {
    const tableEl = tableScrollRef.current;
    const barEl = horizontalScrollRef.current;
    const barContentEl = horizontalScrollContentRef.current;
    const wrapperEl = horizontalScrollWrapperRef.current;
    const thumbEl = horizontalScrollThumbRef.current;
    if (!tableEl || !barEl || !barContentEl || !wrapperEl || !thumbEl) {
      return;
    }

    const updateVisibility = () => {
      const hasOverflow = tableEl.scrollWidth > tableEl.clientWidth + 1;
      wrapperEl.style.display = hasOverflow ? "block" : "none";
    };

    const updateBar = () => {
      barContentEl.style.width = `${tableEl.scrollWidth}px`;
      updateVisibility();
    };

    const updateThumb = () => {
      const trackWidth = barEl.clientWidth;
      const visibleWidth = tableEl.clientWidth;
      const totalWidth = tableEl.scrollWidth;
      if (!trackWidth) {
        return;
      }
      if (totalWidth <= visibleWidth) {
        thumbEl.style.width = `${trackWidth}px`;
        thumbEl.style.transform = "translateX(0px)";
        return;
      }
      const ratio = visibleWidth / totalWidth;
      const thumbWidth = Math.max(trackWidth * ratio, 36);
      const maxScroll = totalWidth - visibleWidth;
      const maxThumbTravel = trackWidth - thumbWidth;
      const left = maxScroll > 0 ? (tableEl.scrollLeft / maxScroll) * maxThumbTravel : 0;
      thumbEl.style.width = `${thumbWidth}px`;
      thumbEl.style.transform = `translateX(${left}px)`;
    };

    const syncTableToBar = () => {
      if (barEl.scrollLeft !== tableEl.scrollLeft) {
        barEl.scrollLeft = tableEl.scrollLeft;
      }
      updateThumb();
    };

    const syncBarToTable = () => {
      if (tableEl.scrollLeft !== barEl.scrollLeft) {
        tableEl.scrollLeft = barEl.scrollLeft;
      }
      updateThumb();
    };

    updateBar();
    updateThumb();
    tableEl.addEventListener("scroll", syncTableToBar, { passive: true });
    barEl.addEventListener("scroll", syncBarToTable, { passive: true });
    window.addEventListener("resize", updateBar);
    window.addEventListener("resize", updateThumb);

    return () => {
      tableEl.removeEventListener("scroll", syncTableToBar);
      barEl.removeEventListener("scroll", syncBarToTable);
      window.removeEventListener("resize", updateBar);
      window.removeEventListener("resize", updateThumb);
    };
  }, [activeRows.length, activeTab]);

  return (
    <div className="flex flex-col h-screen bg-[#f8f9fa] text-[#1e293b] font-sans overflow-hidden">
      <div className="bg-gradient-to-r from-[#102C57] to-[#0f172a] shadow-xl text-white shrink-0 z-40">
        <div className="max-w-[95%] mx-auto py-4">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <div>
                <h6 className="text-[#d4af37] font-bold tracking-[0.2em] text-[10px] uppercase mb-0.5 flex items-center gap-2">
                  ผู้ดูแลข้อมูล
                  <span className="text-[10px] bg-[#d4af37] text-[#102C57] px-2 py-0.5 rounded-full font-sans font-bold tracking-wider">
                    {(activeTab === "requisition" ? pagination.totalRecords : returnPagination.totalRecords).toLocaleString()} รายการ
                  </span>
                </h6>
                <h1 className="text-xl md:text-2xl font-bold font-serif text-white flex items-center gap-3">
                  <ClipboardList size={26} className="text-[#d4af37]" />
                  ใบเบิกวัตถุดิบ
                  <span className="flex items-center gap-1 sm:hidden">
                    {canViewRequisition && (
                      <Link
                        href="/raw-material-requisitions/requisition"
                        className={`flex h-6 w-6 items-center justify-center rounded-full border transition ${activeTab === "requisition"
                          ? "border-[#d4af37] bg-[#d4af37] text-[#102C57]"
                          : "border-white/15 text-white/60 hover:text-white hover:border-white/40"
                          }`}
                        aria-label="ใบเบิกวัตถุดิบ"
                      >
                        <List size={12} />
                      </Link>
                    )}
                    {canViewReturn && (
                      <Link
                        href="/raw-material-requisitions/return"
                        className={`flex h-6 w-6 items-center justify-center rounded-full border transition ${activeTab === "return"
                          ? "border-[#d4af37] bg-[#d4af37] text-[#102C57]"
                          : "border-white/15 text-white/60 hover:text-white hover:border-white/40"
                          }`}
                        aria-label="ใบคืนวัตถุดิบ"
                      >
                        <Undo2 size={12} />
                      </Link>
                    )}
                  </span>
                </h1>
              </div>
            </div>

            <div className="hidden sm:flex bg-black/20 p-1 rounded-lg self-start lg:self-auto w-fit">
              {canViewRequisition && (
                <Link
                  href="/raw-material-requisitions/requisition"
                  className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${activeTab === "requisition"
                    ? "bg-[#d4af37] text-[#102C57] shadow-sm"
                    : "text-white/50 hover:text-white hover:bg-white/5"
                    }`}
                >
                  <List size={14} />
                  ใบเบิกวัตถุดิบ
                </Link>
              )}
              {canViewReturn && (
                <Link
                  href="/raw-material-requisitions/return"
                  className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 ${activeTab === "return"
                    ? "bg-[#d4af37] text-[#102C57] shadow-sm"
                    : "text-white/50 hover:text-white hover:bg-white/5"
                    }`}
                >
                  <Grid3x3 size={14} />
                  ใบคืนเบิกสินค้าวัตถุดิบ
                </Link>
              )}
            </div>

            <div className="grid grid-cols-2 lg:flex lg:flex-row items-center gap-2 bg-white/5 p-2 rounded-xl text-sm border border-white/10">
              <div className="col-span-2 lg:col-span-1">
                <div className="flex gap-2 lg:block">
                  <div className="relative flex-1 lg:w-64">
                    <input
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="ค้นหาเลขที่เอกสาร/รหัสสินค้า/โครงการ..."
                      className="w-full h-9 pl-3 pr-8 rounded-lg bg-black/20 border border-white/10 text-white placeholder:text-white/30 text-xs focus:ring-1 focus:ring-[#d4af37] outline-none"
                    />
                  </div>
                  <button
                    onClick={handleSearch}
                    disabled={loading}
                    className="h-9 px-4 bg-[#d4af37] hover:bg-[#b5952f] text-[#102C57] text-xs font-bold rounded-lg shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2 lg:hidden"
                  >
                    <Search size={14} />
                    {loading ? "..." : "ค้นหา"}
                  </button>
                </div>
              </div>

              <div className="col-span-2 lg:col-span-1 flex flex-row flex-nowrap gap-2">
                <label className="flex flex-col flex-1 min-w-0 text-[10px] text-[#d4af37]/80 font-semibold uppercase tracking-wider">
                  วันที่เริ่มต้น
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(event) => setDateFrom(event.target.value)}
                    className="mt-1 h-9 w-full px-2 rounded-lg bg-[#0b2142]/70 border border-[#1e3a5f] text-white text-xs focus:ring-1 focus:ring-[#d4af37] focus:border-[#d4af37] outline-none"
                  />
                </label>
                <label className="flex flex-col flex-1 min-w-0 text-[10px] text-[#d4af37]/80 font-semibold uppercase tracking-wider">
                  ถึงวันที่
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(event) => setDateTo(event.target.value)}
                    className="mt-1 h-9 w-full px-2 rounded-lg bg-[#0b2142]/70 border border-[#1e3a5f] text-white text-xs focus:ring-1 focus:ring-[#d4af37] focus:border-[#d4af37] outline-none"
                  />
                </label>
              </div>

              <div className="flex-1 hidden lg:block"></div>

              <button
                onClick={handleSearch}
                disabled={loading}
                className="hidden lg:flex col-span-2 lg:col-span-1 w-full lg:w-auto h-9 px-6 bg-[#d4af37] hover:bg-[#b5952f] text-[#102C57] text-xs font-bold rounded-lg shadow-sm active:scale-95 transition-all items-center justify-center gap-2"
              >
                <Search size={14} />
                {loading ? "..." : "ค้นหา"}
              </button>

              <div className="col-span-2 lg:col-span-1 flex items-center justify-between lg:justify-start gap-2 rounded-lg px-2 py-1 text-[10px] text-white/90 border border-white/10 bg-black/20 shadow-[0_6px_18px_rgba(15,23,42,0.2)]">
                <button
                  onClick={() => loadData((activeTab === "requisition" ? pagination.page : returnPagination.page) - 1, activeTab)}
                  disabled={(activeTab === "requisition" ? pagination.page : returnPagination.page) <= 1 || loading}
                  className="h-7 px-3 rounded-md border border-[#b5952f] bg-[#d4af37] text-[#102C57] hover:bg-[#b5952f] disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  ก่อนหน้า
                </button>
                <span className="px-3 py-1 rounded-md bg-black/30 border border-white/10 text-[10px] tracking-wide">
                  หน้า {activeTab === "requisition" ? pagination.page : returnPagination.page} / {activeTab === "requisition" ? pagination.totalPages : returnPagination.totalPages}
                </span>
                <button
                  onClick={() => loadData((activeTab === "requisition" ? pagination.page : returnPagination.page) + 1, activeTab)}
                  disabled={!canGoNext || loading}
                  className="h-7 px-3 rounded-md border border-[#b5952f] bg-[#d4af37] text-[#102C57] hover:bg-[#b5952f] disabled:opacity-50 disabled:cursor-not-allowed transition"
                >
                  ถัดไป
                </button>
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

      <div
        ref={(node) => {
          scrollRef.current = node;
          tableScrollRef.current = node;
        }}
        className="flex-1 -mt-1 overflow-x-auto overflow-y-auto w-full px-0 pb-4 relative z-10 scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-transparent"
      >
        <div className="bg-white rounded-none shadow-sm border border-gray-200 overflow-visible">
          <div className="hidden lg:block table-scroll">
            <div className="requisition-table-scroll">
              <table className="requisition-table w-full border-collapse text-left text-[10px] xl:text-xs table-bordered">
              <thead
                className="bg-[#102C57] text-white sticky top-0 z-20 shadow-md"
                style={{ display: "table", tableLayout: "fixed", width: "100%" }}
              >
                <tr>
                  <th className="px-3 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap w-32">เลขที่เอกสาร</th>
                  <th className="px-3 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap w-24">วันที่</th>
                  <th className="px-3 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap w-32">แผนก</th>
                  <th className="px-3 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap w-24">รหัสสินค้า</th>
                  <th className="px-3 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">ชื่อสินค้า</th>
                  <th className="px-3 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap w-24">ล็อต</th>
                  <th className="px-1 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap w-14">คลัง</th>
                  <th className="px-3 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap w-24">หน่วย</th>
                  <th className="px-3 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap w-20 text-right">จำนวน</th>
                  <th className="px-3 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">หมายเหตุ</th>
                </tr>
              </thead>
              <tbody
                className="divide-y divide-gray-100 bg-white text-gray-700"
                style={activeRows.length > 0 ? { height: `${totalSize}px`, position: "relative", display: "block", width: "100%" } : undefined}
              >
                {showLoadingState && activeRows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                      กำลังโหลดข้อมูล...
                    </td>
                  </tr>
                ) : activeRows.length > 0 ? (
                  virtualRows.map((virtualRow) => {
                    const row = activeRows[virtualRow.index];
                    if (!row) {
                      return null;
                    }
                    return (
                      <tr
                        key={row.id}
                        ref={rowVirtualizer.measureElement}
                        data-index={virtualRow.index}
                        className="hover:bg-blue-50/50 transition-colors"
                        style={{
                          position: "absolute",
                          top: 0,
                          left: 0,
                          width: "100%",
                          transform: `translateY(${virtualRow.start}px)`,
                          display: "table",
                          tableLayout: "fixed",
                        }}
                      >
                        <td className="px-3 py-3 whitespace-nowrap w-32 font-mono text-[#102C57]" title={row.DI_REF || "-"}>
                          <span className="requisition-cell">{row.DI_REF}</span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap w-24" title={formatDateDisplay(row.DI_DATE)}>
                          <span className="requisition-cell">{formatDateDisplay(row.DI_DATE)}</span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap w-32" title={row.DEPT_THAIDESC || "-"}>
                          <span className="requisition-cell">{row.DEPT_THAIDESC}</span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap w-24 font-mono" title={row.TRD_SH_CODE || "-"}>
                          <span className="requisition-cell">{row.TRD_SH_CODE}</span>
                        </td>
                        <td
                          className="px-3 py-3 whitespace-nowrap"
                          title={row.TRD_SH_NAME || "-"}
                        >
                          <span className="requisition-cell">{row.TRD_SH_NAME}</span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap w-24" title={row.TRD_LOT_NO || "-"}>
                          <span className="requisition-cell">{row.TRD_LOT_NO || "-"}</span>
                        </td>
                        <td className="px-1 py-3 whitespace-nowrap w-14" title={row.WL_CODE || "-"}>
                          <span className="requisition-cell">{row.WL_CODE}</span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap w-24" title={row.TRD_UTQNAME || "-"}>
                          <span className="requisition-cell">{row.TRD_UTQNAME}</span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap w-20 text-right" title={row.TRD_QTY ?? "-"}>
                          <span className="requisition-cell">{row.TRD_QTY}</span>
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap" title={row.DI_REMARK || "-"}>
                          <span className="requisition-cell">{row.DI_REMARK || "-"}</span>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={10} className="px-6 py-12 text-center text-gray-500">
                      ไม่พบข้อมูล
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </div>

          <div
            ref={horizontalScrollWrapperRef}
            className="hidden lg:block sticky bottom-0 z-30 bg-white requisition-scrollbar-wrapper"
          >
            <div className="requisition-scrollbar">
              <div ref={horizontalScrollRef} className="requisition-scrollbar-proxy">
                <div ref={horizontalScrollContentRef} className="h-3" />
              </div>
              <div ref={horizontalScrollThumbRef} className="requisition-scrollbar-thumb" />
            </div>
          </div>

          <div className="lg:hidden flex flex-col gap-3 p-4">
            {showLoadingState && activeRows.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 text-sm">กำลังโหลดข้อมูล...</div>
                ) : activeRows.length > 0 ? (
                  activeRows.map((row) => (
                    <div key={`mobile-${row.id}`} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="text-[10px] text-gray-400 font-mono mb-1">เลขที่เอกสาร: {row.DI_REF}</div>
                      <div className="font-bold text-[#102C57] text-sm">{row.TRD_SH_NAME}</div>
                      <div className="text-[10px] text-gray-500">รหัสสินค้า: {row.TRD_SH_CODE}</div>
                    </div>
                    <span className="text-[10px] text-gray-400">วันที่: {formatDateDisplay(row.DI_DATE)}</span>
                  </div>
                    <div className="mt-2 text-xs text-gray-600">
                      <div>แผนก: {row.DEPT_THAIDESC}</div>
                      <div>คลัง: {row.WL_CODE} • {row.TRD_UTQNAME}</div>
                      <div>จำนวน: {row.TRD_QTY}</div>
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

