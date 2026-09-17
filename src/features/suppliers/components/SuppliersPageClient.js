"use client";

import { Fragment } from "react";
import { useSuppliersPage } from "@/features/suppliers/hooks/useSuppliersPage";
import PermissionGate from "@/components/PermissionGate";

function SuppliersPageContent() {
  const {
    records,
    loading,
    errorMessage,
    pagination,
    cursorMap,
    searchText,
    setSearchText,
    loadData,
    canGoNext,
  } = useSuppliersPage();

  return (
    <div className="flex flex-col h-screen bg-[#f8f9fa] text-[#1e293b] font-sans overflow-hidden">
      <div className="bg-gradient-to-r from-[#102C57] to-[#0f172a] shadow-xl text-white shrink-0 z-40">
        <div className="max-w-[95%] mx-auto py-4">
          <div className="flex flex-col gap-4">

            {/* Top Row: Title & Stats */}
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <div>
                <h1 className="text-xl md:text-2xl font-bold font-serif text-white flex items-center gap-3">
                  รายการสั่งซื้อผู้ขาย
                  <span className="text-[10px] bg-[#d4af37] text-[#102C57] px-2 py-0.5 rounded-full font-sans font-bold tracking-wider">
                    {pagination.totalRecords.toLocaleString()} รายการ
                  </span>
                </h1>
              </div>

              <div className="flex flex-col md:flex-row gap-2 w-full md:w-auto">
                {/* Toolbar */}
                <div className="flex items-center gap-2 bg-white/5 p-2 rounded-xl text-sm border border-white/10 flex-1">
                  {/* Search Input */}
                  <div className="relative flex-1">
                    <input
                      value={searchText}
                      onChange={(e) => setSearchText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && loadData(1, { cursor: null, resetCursors: true })}
                      placeholder="ค้นหาชื่อสินค้า..."
                      className="w-full h-9 pl-3 pr-8 rounded-lg bg-black/20 border border-white/10 text-white placeholder:text-white/30 text-xs focus:ring-1 focus:ring-[#d4af37] outline-none min-w-[150px]"
                    />
                  </div>

                  {/* Search / Refresh Button */}
                  <button
                    onClick={() => loadData(1, { cursor: null, resetCursors: true })}
                    disabled={loading}
                    className="h-9 px-4 bg-[#d4af37] hover:bg-[#b5952f] text-[#102C57] text-xs font-bold rounded-lg shadow-sm active:scale-95 transition-all flex items-center justify-center gap-2"
                  >
                    {loading ? "..." : "ค้นหา"}
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
        <div className="mt-4">

          {/* ORDER LIST VIEW (Original) */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-visible">
            {/* Desktop Table View */}
            <div className="hidden lg:block table-scroll">
              <table className="w-full border-collapse text-left text-sm table-bordered">
                <thead className="bg-[#102C57] text-white sticky top-0 z-20 shadow-md">
                  <tr>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">วันที่</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">สถานะ</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">เลขที่เอกสาร</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">รหัสผู้ขาย</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">ชื่อผู้ขาย</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">สาขา</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">แผนก</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">รหัสโครงการ</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">ชื่อโครงการ</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">รหัสตลาด</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">รหัสโปรโมชั่น</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">กำหนดส่ง</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">วันที่ส่งจริง</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">วันที่ยกเลิก</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">จำนวนที่สั่ง</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">จำนวนรายการ</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">ภาษีมูลค่าเพิ่ม</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">จำนวนเงินรวม</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">สถานะการจ่าย</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">สถานะ 2</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">หน่วยนับ</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">จำนวนสินค้า</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">ของแถม</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">ราคาต่อหน่วย</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">คีย์เข้า</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">รหัสสินค้า 2</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">ชื่อสินค้า (ย่อ)</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">รหัสสินค้า</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">ชื่อสินค้า</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">จำนวนหน่วยย่อย</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">ลำดับ</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">หน่วยนับ (ย่อย)</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">จำนวน (ย่อย)</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">ราคาขาย</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">ภาษี (รายการ)</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">จำนวนเงิน (รายการ)</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">รหัสหมวดสินค้า</th>
                    <th className="px-4 py-3 font-semibold border-b border-[#0f172a] whitespace-nowrap">ชื่อหมวดสินค้า</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white text-gray-700">
                  {loading && records.length === 0 ? (
                  <tr>
                    <td colSpan={39} className="px-6 py-12 text-center text-gray-500">
                      กำลังโหลดข้อมูล...
                    </td>
                  </tr>
                ) : records.length > 0 ? (
                    records.map((record, index) => (
                      <tr key={`${record.DI_REF}-${record.SKU_CODE}-${index}`} className="hover:bg-blue-50/50 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">{record.DI_DATE}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.DI_ACTIVE}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.DI_REF}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.AP_CODE}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.AP_NAME}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.BR_CODE}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.DEPT_CODE}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.PRJ_CODE}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.PRJ_NAME}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.MKTP_CODE}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.PRMT_CODE}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.APPO_DUE_DA}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.TRH_SHIP_DATE}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.TRH_CANCEL_DATE}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.TRH_N_QTY}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.TRH_N_ITEMS}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.APPO_B_VAT}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.APPO_B_AMT}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.TRH_PSTATUS}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.DI_ACTIVE_2}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.TRD_UTQNAME}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.TRD_QTY}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.TRD_Q_FREE}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.TRD_U_PRC}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.TRD_G_KEYIN}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.GOODS_CODE}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.TRD_SH_NAME}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.SKU_CODE}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.SKU_NAME}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.TRD_UTQQTY}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.TRD_SEQ}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.UTQ_NAME}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.UTQ_QTY}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.TRD_B_SELL}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.TRD_B_VAT}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.TRD_B_AMT}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.ICCAT_CODE}</td>
                        <td className="px-4 py-3 whitespace-nowrap">{record.ICCAT_NAME}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={39} className="px-6 py-12 text-center text-gray-500">
                        ไม่พบข้อมูล
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View (Existing) */}
            <div className="lg:hidden flex flex-col gap-3 p-4">
            {loading && records.length === 0 ? (
                <div className="text-center py-12 text-gray-500">กำลังโหลดข้อมูล...</div>
              ) : records.length > 0 ? (
                records.map((record, index) => (
                  <div key={`${record.DI_REF}-${record.SKU_CODE}-${index}`} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                    {/* ... (Existing card content) ... */}
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <div className="text-[10px] text-gray-400 font-mono mb-1">{record.AP_CODE}</div>
                        <div className="font-bold text-[#102C57] text-sm">{record.AP_NAME}</div>
                      </div>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${record.DI_ACTIVE === 'Yes' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {record.DI_ACTIVE}
                      </span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between border-b border-dashed border-gray-100 pb-1">
                        <span className="text-gray-500 text-xs">เอกสาร:</span>
                        <span className="font-mono text-[#102C57] text-xs font-bold">{record.DI_REF}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-500 text-xs">สินค้า:</span>
                        <span className="font-medium text-gray-900 text-xs text-right w-2/3">{record.SKU_NAME}</span>
                      </div>
                      <div className="flex justify-between items-center bg-gray-50 p-1.5 rounded mt-2">
                        <div className="text-xs">
                          <div className="text-gray-500">จำนวน</div>
                          <div className="font-bold text-[#102C57]">{record.TRD_QTY?.toLocaleString()} {record.UTQ_NAME}</div>
                        </div>
                        <div className="text-right text-xs">
                          <div className="text-gray-500">ราคา/หน่วย</div>
                          <div className="font-bold text-[#102C57]">{record.TRD_U_PRC?.toLocaleString()}</div>
                        </div>
                      </div>
                      <div className="flex justify-between items-center pt-1">
                        <span className="text-[10px] text-gray-400">{record.DI_DATE}</span>
                        <span className="font-bold text-[#102C57] text-sm">{record.TRD_B_AMT?.toLocaleString()} ฿</span>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-gray-500">ไม่พบข้อมูล</div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

export default function SuppliersPage() {
  return (
    <PermissionGate permissionsAny={["admin-suppliers"]}>
      <SuppliersPageContent />
    </PermissionGate>
  );
}
