"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Printer,
  RefreshCw,
  Search,
} from "lucide-react";
import { useUserProfile } from "@/lib/useUserProfile";
import { ReportHeader, ReportFilterBar } from "@/components/print";

function formatQuantity(value) {
  const num = Number(value || 0);
  if (num === 0) return "-";
  return num.toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

export default function WipBalanceReportClient() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentViewPage, setCurrentViewPage] = useState(0);

  const loadData = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/production-line/fg-wip/issues", { cache: "no-store" });
      const payload = await response.json();
      if (response.ok && payload.data) {
        setRows(payload.data);
      }
    } catch (err) {
      // Mute
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const profile = useUserProfile();

  const printedAtLabel = useMemo(() => {
    return new Intl.DateTimeFormat("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());
  }, []);

  // Client-side search filtering
  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      row.productCode?.toLowerCase().includes(q) ||
      row.productName?.toLowerCase().includes(q) ||
      row.lotNo?.toLowerCase().includes(q) ||
      row.barcode?.toLowerCase().includes(q)
    );
  }, [rows, searchQuery]);

  const totalRemainingQty = useMemo(() => {
    return filteredRows.reduce((sum, row) => sum + (row.remainingQty || 0), 0);
  }, [filteredRows]);

  // Paginate items for print layout (A4 portrait)
  const reportPages = useMemo(() => {
    if (!filteredRows.length) return [];
    
    const pages = [];
    let currentPage = [];
    const PAGE_LIMIT = 26; // Limit items per page to prevent A4 height overflow

    filteredRows.forEach((row, index) => {
      currentPage.push({ ...row, sequence: index + 1 });
      if (currentPage.length === PAGE_LIMIT) {
        pages.push(currentPage);
        currentPage = [];
      }
    });

    if (currentPage.length > 0) {
      pages.push(currentPage);
    }
    return pages;
  }, [filteredRows]);

  return (
    <div className="min-h-screen bg-[#f4f6f8] text-[#262626]">
      {/* Screen Only Controls */}
      <div className="print:hidden">
        <header className="bg-[var(--surface-navy,#102C57)] text-white py-5 px-6">
          <div className="mx-auto max-w-5xl flex items-center justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-[#d4af37]">รายงานสต็อกสะสม</span>
              <h1 className="text-xl font-bold mt-1">รายงานสรุปสต็อกคงเหลือ WIP ค้างไลน์</h1>
            </div>
            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-2 bg-[#d4af37] text-[#102C57] hover:bg-[#c39e2c] px-4 py-2 text-sm font-bold shadow-md transition-all"
            >
              <Printer size={16} />
              พิมพ์รายงาน (A4 Portrait)
            </button>
          </div>
        </header>

        <div className="mx-auto max-w-5xl px-4 py-6">
          {/* Unified Report Filter Bar */}
          <ReportFilterBar
            dateMode="none"
            searchQuery={searchQuery}
            onSearchQueryChange={(query) => {
              setSearchQuery(query);
              setCurrentViewPage(0);
            }}
            searchPlaceholder="ค้นหารหัสสินค้า, ชื่อสินค้า, LOT หรือบาร์โค้ด"
            searchLabel="ค้นหาสินค้า / LOT / บาร์โค้ด"
            isLoading={loading}
            onReset={() => {
              setSearchQuery("");
              setCurrentViewPage(0);
            }}
            onPrint={() => window.print()}
            printButtonLabel="พิมพ์ A4 แนวตั้ง"
            summaryStats={[
              { label: "จำนวนรายการทั้งหมด", value: `${filteredRows.length.toLocaleString("th-TH")} รายการ` },
              { label: "จำนวนคงเหลือสะสมรวม", value: `${formatQuantity(totalRemainingQty)} ปี๊บ`, highlight: true },
            ]}
            className="mb-6"
          />
        </div>
      </div>

      {/* Visual Page Navigator (Screen Only) */}
      {reportPages.length > 0 && (
        <div className="print:hidden flex justify-center mb-6">
          <div className="flex items-center gap-4 bg-[var(--surface-navy,#102C57)] text-white px-6 py-2 rounded-full shadow-md">
            <button
              type="button"
              onClick={() => setCurrentViewPage((prev) => Math.max(0, prev - 1))}
              disabled={currentViewPage === 0}
              className="hover:text-[#d4af37] disabled:opacity-30 transition-colors"
              title="หน้าก่อนหน้า"
            >
              <ChevronLeft size={24} />
            </button>
            <div className="flex flex-col items-center min-w-[100px]">
              <span className="text-[9px] font-black uppercase text-[#d4af37]/70">แผ่นที่</span>
              <span className="text-sm font-bold">{currentViewPage + 1} / {reportPages.length}</span>
            </div>
            <button
              type="button"
              onClick={() => setCurrentViewPage((prev) => Math.min(reportPages.length - 1, prev + 1))}
              disabled={currentViewPage === reportPages.length - 1}
              className="hover:text-[#d4af37] disabled:opacity-30 transition-colors"
              title="หน้าถัดไป"
            >
              <ChevronRight size={24} />
            </button>
          </div>
        </div>
      )}

      {/* A4 Portrait Print Sheets */}
      <div className="flex flex-col items-center gap-8 py-4 print:gap-0 print:py-0">
        {reportPages.length ? (
          reportPages.map((pageRows, pageIndex) => (
            <section
              key={pageIndex}
              className={`w-full max-w-[210mm] bg-white print:shadow-none relative border border-[#b8c2cc] shadow-md p-8 ${
                pageIndex === currentViewPage ? "block" : "hidden print:block"
              }`}
              style={{ minHeight: "297mm", boxSizing: "border-box" }}
            >
              {/* @page portrait style override */}
              <style dangerouslySetInnerHTML={{ __html: `
                @page {
                  size: A4 portrait;
                  margin: 0;
                }
                @media print {
                  body {
                    background: white !important;
                  }
                  header, nav, .print-hidden, .print\\:hidden {
                    display: none !important;
                  }
                  section {
                    border: none !important;
                    box-shadow: none !important;
                    margin: 0 !important;
                    padding: 10mm 15mm !important;
                    width: 100% !important;
                    max-width: none !important;
                    min-height: auto !important;
                    page-break-after: always !important;
                  }
                }
              `}} />

              {/* Corporate Header */}
              <div className="mb-4">
                <ReportHeader
                  title="รายงานสรุปสต็อกคงเหลือ WIP"
                  subtitle="WIP Stock Balance Report (Portrait)"
                  meta={[
                    { label: "แผนก", value: "ไลน์ผลิต KP13 (ฝ่ายผลิตอาหารสำเร็จรูป)" },
                    { label: "ประเภทสต็อก", value: "WIP ค้างไลน์สะสม (เศษเหลือปลายวัน)" },
                  ]}
                  printedAt={printedAtLabel}
                  printedBy={profile.username || "System"}
                  page={pageIndex + 1}
                  totalPages={reportPages.length}
                  variant="block"
                />
              </div>

              {/* Main Portrait Table */}
              <table className="w-full text-[12px] border-collapse border border-slate-300 table-fixed">
                <colgroup>
                  <col className="w-[8%]" />
                  <col className="w-[20%]" />
                  <col className="w-[42%]" />
                  <col className="w-[18%]" />
                  <col className="w-[12%]" />
                </colgroup>
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300">
                    <th className="border border-slate-300 px-3 py-2 font-bold text-center">ลำดับ</th>
                    <th className="border border-slate-300 px-3 py-2 font-bold text-center">รหัสสินค้า</th>
                    <th className="border border-slate-300 px-3 py-2 font-bold text-left">ชื่อสินค้า</th>
                    <th className="border border-slate-300 px-3 py-2 font-bold text-center">LOT</th>
                    <th className="border border-slate-300 px-3 py-2 font-bold text-right">คงเหลือ (ปี๊บ)</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={`${row.productCode}-${row.lotNo}`} className="hover:bg-slate-50 odd:bg-white even:bg-slate-50/50">
                      <td className="border border-slate-300 px-3 py-2.5 text-center">{row.sequence}</td>
                      <td className="border border-slate-300 px-3 py-2.5 text-center font-mono">{row.productCode}</td>
                      <td className="border border-slate-300 px-3 py-2.5 text-left">{row.productName}</td>
                      <td className="border border-slate-300 px-3 py-2.5 text-center font-mono">{row.lotNo}</td>
                      <td className="border border-slate-300 px-3 py-2.5 text-right font-bold tabular-nums">{formatQuantity(row.remainingQty)}</td>
                    </tr>
                  ))}
                  {pageIndex === reportPages.length - 1 ? (
                    <tr className="bg-[var(--surface-navy,#102C57)] text-white font-bold">
                      <td colSpan={4} className="border border-[#102C57] px-3 py-3 text-right uppercase tracking-wider text-[10px]">
                        สรุปรวมคงเหลือทั้งหมด (Grand Total)
                      </td>
                      <td className="border border-[#102C57] px-3 py-3 text-right text-yellow-300 tabular-nums">
                        {formatQuantity(totalRemainingQty)}
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </section>
          ))
        ) : (
          <div className="w-full max-w-[210mm] bg-white border border-[#b8c2cc] px-6 py-12 text-center text-sm text-slate-500 shadow-sm">
            {loading ? (
              <div className="flex flex-col items-center justify-center gap-2 py-4">
                <Loader2 className="animate-spin text-[#102C57]" size={28} />
                <span>กำลังโหลดข้อมูลสต็อก WIP...</span>
              </div>
            ) : (
              "ไม่พบข้อมูลสรุปสต็อกคงเหลือ WIP ค้างไลน์สะสม"
            )}
          </div>
        )}
      </div>
    </div>
  );
}
