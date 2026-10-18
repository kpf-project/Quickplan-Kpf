"use client";

import { Search } from "lucide-react";
import ProductsShell from "@/features/products/components/ProductsShell";
import { useProductsPage } from "@/features/products/hooks/useProductsPage";
import PermissionGate from "@/components/PermissionGate";

function ProductsPageContent() {
  const {
    rows,
    loading,
    pagination,
    searchText,
    setSearchText,
    iccatOptions,
    selectedIccat,
    isIccatOpen,
    setIsIccatOpen,
    handleSearch,
    toggleIccat,
    selectAllIccat,
    clearIccatSelection,
    fetchPage,
    canGoNext,
    exporting,
    exportError,
    handleExportExcel,
  } = useProductsPage();

  const iccatLabel = selectedIccat.length ? `${selectedIccat.length} หมวดหมู่` : "เลือกหมวดหมู่";

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2 bg-white/5 p-2 rounded-xl text-sm border border-white/10">
      <div className="flex-1 min-w-[190px]">
        <input
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          placeholder="ค้นหา SKU/ชื่อสินค้า..."
          className="w-full h-9 pl-3 pr-8 rounded-lg bg-black/20 border border-white/10 text-white placeholder:text-white/30 text-xs focus:ring-1 focus:ring-[#d4af37] outline-none"
        />
      </div>
      <div className="relative min-w-[140px] lg:ml-2">
        <button
          onClick={() => setIsIccatOpen((prev) => !prev)}
          className="w-full h-9 px-3 rounded-lg bg-black/20 border border-white/10 text-white text-xs flex items-center justify-between hover:bg-black/30 transition-colors"
        >
          <span className="truncate">{iccatLabel}</span>
          <span className="opacity-50 text-[10px]">▼</span>
        </button>
        {isIccatOpen && (
          <div className="absolute top-full left-0 mt-1 w-64 bg-white rounded-xl shadow-2xl p-2 z-50 border border-gray-100">
            <div className="flex justify-between items-center p-2 border-b border-gray-100 text-[10px] uppercase font-bold text-gray-500 mb-1">
              <span>หมวดหมู่</span>
              <div className="flex gap-2 text-[10px]">
                <button onClick={selectAllIccat} className="text-[#102C57] hover:underline">
                  เลือกทั้งหมด
                </button>
                <button onClick={clearIccatSelection} className="text-red-500 hover:underline">
                  ล้าง
                </button>
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto custom-scrollbar flex flex-col gap-0.5">
              {iccatOptions.map((option) => (
                <label key={option.ICCAT_CODE} className="flex items-center gap-2 p-1.5 hover:bg-gray-50 rounded cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedIccat.includes(option.ICCAT_CODE)}
                    onChange={() => toggleIccat(option.ICCAT_CODE)}
                    className="rounded w-3 h-3 text-[#102C57] border-gray-300"
                  />
                  <span className="text-xs text-gray-700 truncate">{option.ICCAT_NAME || option.ICCAT_CODE}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>
      <button
        onClick={handleSearch}
        disabled={loading}
        className="h-9 px-5 bg-[#d4af37] hover:bg-[#b5952f] text-[#102C57] text-xs font-bold rounded-lg shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2"
      >
        <Search size={14} />
        {loading ? "..." : "ค้นหา"}
      </button>
      <button
        onClick={handleExportExcel}
        disabled={loading || exporting}
        className="h-9 px-5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg shadow-sm active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {exporting ? "กำลัง export..." : "Export Excel"}
      </button>
      <div className="flex items-center gap-2 rounded-lg px-2 py-1 text-[10px] text-white/90 border border-white/10 bg-black/20 shadow-[0_6px_18px_rgba(15,23,42,0.2)]">
        <button
          onClick={() => fetchPage(pagination.page - 1)}
          disabled={pagination.page <= 1 || loading}
          className="h-7 px-3 rounded-md border border-[#b5952f] bg-[#d4af37] text-[#102C57] hover:bg-[#b5952f] disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          ก่อนหน้า
        </button>
        <span className="px-3 py-1 rounded-md bg-black/30 border border-white/10 text-[10px] tracking-wide">
          หน้า {pagination.page} / {pagination.totalPages}
        </span>
        <button
          onClick={() => fetchPage(pagination.page + 1)}
          disabled={!canGoNext || loading}
          className="h-7 px-3 rounded-md border border-[#b5952f] bg-[#d4af37] text-[#102C57] hover:bg-[#b5952f] disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          ถัดไป
        </button>
      </div>
    </div>
  );

  return (
    <ProductsShell
      title="สินค้า"
      description="ข้อมูลสินค้า"
      totalRecords={pagination.totalRecords}
      toolbar={toolbar}
    >
      <>
        {exportError ? (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {exportError}
          </div>
        ) : null}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-visible mt-4">
          <div className="hidden lg:block table-scroll overflow-x-auto">
            <table className="w-full min-w-[1280px] table-auto border-collapse text-left text-[10px] xl:text-xs table-bordered">
              <thead className="bg-[var(--surface-navy,#102C57)] text-[10px] xl:text-xs uppercase tracking-wider text-white text-center sticky top-0 z-20 shadow-md">
                <tr>
                  <th className="px-1 py-2 xl:px-2 xl:py-3 font-semibold border-b border-[#0f172a]">รหัสสินค้า</th>
                  <th className="px-1 py-2 xl:px-2 xl:py-3 font-semibold border-b border-[#0f172a]">ชื่อสินค้า</th>
                  <th className="px-1 py-2 xl:px-2 xl:py-3 font-semibold border-b border-[#0f172a]">ประเภทสินค้า</th>
                  <th className="px-1 py-2 xl:px-2 xl:py-3 font-semibold border-b border-[#0f172a]">หน่วยหลัก</th>
                  <th className="px-1 py-2 xl:px-2 xl:py-3 font-semibold border-b border-[#0f172a]">หน่วยย่อย</th>
                  <th className="px-1 py-2 xl:px-2 xl:py-3 font-semibold border-b border-[#0f172a]">แบรนด์</th>
                  <th className="px-1 py-2 xl:px-2 xl:py-3 font-semibold border-b border-[#0f172a]">รหัสหมวด</th>
                  <th className="px-1 py-2 xl:px-2 xl:py-3 font-semibold border-b border-[#0f172a]">ชื่อหมวด</th>
                  <th className="px-1 py-2 xl:px-2 xl:py-3 font-semibold border-b border-[#0f172a]">คลัง</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white text-gray-900">
                {loading && rows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-gray-500">กำลังโหลดข้อมูล...</td>
                  </tr>
                ) : rows.length > 0 ? (
                  rows.map((row) => (
                    <tr key={row.id} className="hover:bg-blue-50/50 transition-colors">
                      <td className="px-1 py-2 xl:px-2 xl:py-3 align-top text-xs font-mono">{row.SKU_CODE ?? "-"}</td>
                      <td className="min-w-[320px] px-1 py-2 xl:px-2 xl:py-3 align-top text-xs whitespace-normal break-words">{row.SKU_NAME ?? "-"}</td>
                      <td className="px-1 py-2 xl:px-2 xl:py-3 align-top text-xs">{row.ICCAT_NAME ?? "-"}</td>
                      <td className="px-1 py-2 xl:px-2 xl:py-3 align-top text-xs">{row.UTQ_NAME ?? "-"}</td>
                      <td className="px-1 py-2 xl:px-2 xl:py-3 align-top text-xs">{row.UTQ_NAME_1 ?? "-"}</td>
                      <td className="px-1 py-2 xl:px-2 xl:py-3 align-top text-xs">{row.BRN_NAME ?? "-"}</td>
                      <td className="px-1 py-2 xl:px-2 xl:py-3 align-top text-xs">{row.ICDEPT_CODE ?? "-"}</td>
                      <td className="px-1 py-2 xl:px-2 xl:py-3 align-top text-xs">{row.ICDEPT_THAIDESC ?? "-"}</td>
                      <td className="px-1 py-2 xl:px-2 xl:py-3 align-top text-xs">{row.WL_NAME ?? "-"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} className="px-6 py-12 text-center text-gray-500">ไม่มีข้อมูล</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="lg:hidden flex flex-col gap-3 p-4">
            {loading && rows.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-sm">กำลังโหลดข้อมูล...</div>
            ) : rows.length > 0 ? (
              rows.map((row) => (
                <div key={`mobile-${row.id}`} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="inline-block bg-[var(--surface-navy,#102C57)] text-white text-[10px] px-2 py-0.5 rounded font-mono mb-1">{row.SKU_CODE || "-"}</span>
                      <h3 className="text-sm font-bold text-gray-800 leading-tight">{row.SKU_NAME || "-"}</h3>
                  <div className="text-[10px] text-gray-500">{row.ICCAT_NAME ?? "-"}</div>
                  <div className="text-[10px] text-gray-500">{row.ICDEPT_CODE ?? "-"}</div>
                  <div className="text-[10px] text-gray-500">ICDEPT: {row.ICDEPT_THAIDESC ?? "-"}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                    <div className="bg-gray-50 rounded-lg p-2">
                      <span className="text-[10px] text-gray-400 block">หมวดหมู่</span>
                      <div className="font-mono text-[#102C57]">{row.ICCAT_CODE ?? "-"}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-2">
                      <span className="text-[10px] text-gray-400 block">หน่วย</span>
                      <div className="text-[11px] text-gray-700">{row.UTQ_NAME ?? "-"}</div>
                      <div className="text-[11px] text-gray-700">{row.UTQ_NAME_1 ?? "-"}</div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-12 text-gray-400 text-sm">ไม่มีข้อมูล</div>
            )}
          </div>
        </div>
      </>
    </ProductsShell>
  );
}

export default function ProductsPage() {
  return (
    <PermissionGate permissionsAny={["admin-products", "data-products-view", "data-products-cost-view"]}>
      <ProductsPageContent />
    </PermissionGate>
  );
}
