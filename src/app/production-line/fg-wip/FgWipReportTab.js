"use client";

import { useCallback, useEffect, useState, useMemo } from "react";
import { CalendarDays, Eye, Loader2, Printer, RefreshCcw, Search } from "lucide-react";
import WipBalanceReportClient from "./WipBalanceReportClient";
import FgPackingReportClient from "./FgPackingReportClient";

function formatDate(value) {
  if (!value) return "-";
  const [year, month, day] = String(value).split("-");
  return `${day}/${month}/${year}`;
}

function formatTime(isoString) {
  if (!isoString) return "-";
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString("th-TH", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZone: "Asia/Bangkok",
    }) + " น.";
  } catch (e) {
    return "-";
  }
}

function MetricCard({ label, value, tone = "navy" }) {
  const toneClass = tone === "gold" ? "border-[#d7a21f] bg-[#fff7df]" : "border-[#c9d5e4] bg-white";
  return (
    <div className={`rounded-lg border ${toneClass} px-4 py-3 shadow-sm`}>
      <div className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-black text-[#123c6c]">{value}</div>
    </div>
  );
}

export default function FgWipReportTab({ productionDate }) {
  const [subTab, setSubTab] = useState("daily");
  const [searchDate, setSearchDate] = useState(productionDate);
  const [reportDate, setReportDate] = useState(productionDate);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/production-line/fg-wip?productionDate=${encodeURIComponent(reportDate)}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "โหลดรายงานไม่สำเร็จ");
      setRecords(payload?.data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [reportDate]);

  useEffect(() => {
    setSearchDate(productionDate);
    setReportDate(productionDate);
  }, [productionDate]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Aggregate totals
  const totals = useMemo(() => {
    let totalFgCases = 0;
    let totalFgTins = 0;
    let totalWipTins = 0;
    let totalOverallTins = 0;

    records.forEach((row) => {
      totalFgCases += Number(row.fg_case_qty || 0);
      totalFgTins += Number(row.fg_tin_qty || 0);
      totalWipTins += Number(row.wip_tin_qty || 0);
      totalOverallTins += Number(row.fg_tin_qty || 0) + Number(row.wip_tin_qty || 0);
    });

    return { totalFgCases, totalFgTins, totalWipTins, totalOverallTins };
  }, [records]);

  const handlePrint = () => {
    window.print();
  };

  const handleSearch = (event) => {
    event.preventDefault();
    if (!searchDate || loading) return;
    if (searchDate === reportDate) {
      void loadData();
      return;
    }
    setReportDate(searchDate);
  };

  return (
    <div className="mx-auto max-w-[1550px] p-4 lg:p-6">
      {/* Sub-tab selection (print-hidden) */}
      <div className="print-hidden mb-6 flex border-b border-gray-200">
        <button
          type="button"
          onClick={() => setSubTab("daily")}
          className={`px-6 py-3 font-bold text-sm border-b-2 transition ${
            subTab === "daily"
              ? "border-[#102C57] text-[#102C57]"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          รายงานบันทึกประจำวัน
        </button>
        <button
          type="button"
          onClick={() => setSubTab("wip-balance")}
          className={`px-6 py-3 font-bold text-sm border-b-2 transition ${
            subTab === "wip-balance"
              ? "border-[#102C57] text-[#102C57]"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          รายงานสต็อก WIP ค้างไลน์สะสม
        </button>
        <button
          type="button"
          onClick={() => setSubTab("packing")}
          className={`px-6 py-3 font-bold text-sm border-b-2 transition ${
            subTab === "packing"
              ? "border-[#102C57] text-[#102C57]"
              : "border-transparent text-slate-500 hover:text-slate-700"
          }`}
        >
          รายงานการบรรจุ
        </button>
      </div>

      {subTab === "packing" ? (
        <FgPackingReportClient productionDate={productionDate} />
      ) : subTab === "wip-balance" ? (
        <WipBalanceReportClient />
      ) : (
        <div className="fg-wip-report">
      {/* Styles to configure Landscape A4 for printing */}
      <style dangerouslySetInnerHTML={{ __html: `
        .fg-wip-report {
          --navy: #123c6c;
          --navy-dark: #0b2d55;
          --gold: #d7a21f;
          --line: #c9d5e4;
        }

        .report-title-section {
          display: flex;
          align-items: end;
          justify-content: space-between;
          gap: 12px;
          padding-bottom: 6px;
          border-bottom: 2px solid var(--navy-dark);
        }

        .report-title-section h1 {
          margin: 0;
          color: var(--navy-dark);
          font-size: 22px;
          font-weight: 900;
        }

        .report-title-section p {
          color: #475569;
          font-size: 13px;
          margin: 2px 0 0;
        }

        .report-summary-text {
          text-align: right;
          font-size: 12px;
          color: #64748b;
        }

        .report-summary-text strong {
          display: block;
          color: var(--navy-dark);
          font-size: 24px;
          font-weight: 900;
        }

        .report-table-wrap {
          overflow-x: auto;
          border: 1px solid var(--line);
          border-radius: 8px;
          background: #fff;
        }

        .report-table {
          width: 100%;
          border-collapse: collapse;
          color: #0f172a;
          font-size: 13px;
        }

        .report-table th,
        .report-table td {
          border: 1px solid var(--line);
          padding: 8px 10px;
          vertical-align: middle;
          line-height: 1.35;
        }

        .report-table th {
          border-color: #aebbc9;
          background: #f1f5f9;
          color: var(--navy-dark);
          font-weight: 900;
          text-align: center;
        }

        .report-table tbody tr:nth-child(even) {
          background: #f8fafc;
        }

        .report-table tfoot td {
          background: #f1f5f9;
          font-weight: 900 !important;
          border-top: 2px solid var(--navy-dark);
        }

        .product-text-wrap {
          display: block;
          max-height: 2.5em;
          overflow: hidden;
          white-space: normal !important;
          word-break: break-word;
          line-height: 1.25;
          text-overflow: clip !important;
        }

        @media print {
          body {
            background: #fff !important;
          }
          body * {
            visibility: hidden;
          }
          .fg-wip-report,
          .fg-wip-report * {
            visibility: visible;
          }
          .fg-wip-report {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            min-height: auto !important;
            padding: 0 !important;
            background: #fff !important;
          }
          @page {
            size: A4 landscape !important;
            margin: 10mm !important;
          }
          .print-hidden {
            display: none !important;
          }
          .inbound-print-page {
            width: 297mm !important;
            border: none !important;
            box-shadow: none !important;
            padding: 0 !important;
            background: #fff !important;
          }
          .report-table-wrap {
            border: none !important;
            border-radius: 0 !important;
          }
          .report-table {
            width: 100% !important;
            table-layout: fixed !important;
          }
          .report-table th,
          .report-table td {
            font-size: 10px !important;
            padding: 3px 4px !important;
            border: 0.5px solid #cbd5e1 !important;
          }
          .report-table th {
            background: #f1f5f9 !important;
            color: #000000 !important;
            border: 0.5px solid #64748b !important;
          }
          .report-table tfoot td {
            background: #f1f5f9 !important;
            border-top: 1.5px solid #000000 !important;
          }
        }
      ` }} />

      {/* Toolbar / Header */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 bg-white p-4 border border-[#b9c4d0] shadow-sm print-hidden">
        <div>
          <h2 className="text-base font-bold text-[#061f43] flex items-center gap-2">
            <Eye size={18} className="text-[#d9a514]" />
            รายงานบันทึกผลผลิตสำเร็จรูป (FG) และ WIP ค้างไลน์
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            เลือกดูและพิมพ์รายงานด้วยความกว้างเต็มขนาด A4 แนวนอน
          </p>
        </div>
        <form onSubmit={handleSearch} className="flex flex-wrap items-end gap-2">
          <label className="grid gap-1 text-xs font-bold text-[#061f43]">
            <span className="flex items-center gap-1.5">
              <CalendarDays size={14} className="text-[#d9a514]" />
              วันที่รายงาน
            </span>
            <input
              type="date"
              value={searchDate}
              onChange={(event) => setSearchDate(event.target.value)}
              className="h-10 rounded border border-[#9eacbd] bg-white px-3 text-sm font-semibold text-[#061f43] outline-none focus:border-[#d9a514] focus:ring-2 focus:ring-[#d9a514]/20"
              aria-label="เลือกวันที่รายงาน"
              required
            />
          </label>
          <button
            type="submit"
            disabled={loading || !searchDate}
            className="flex h-10 items-center justify-center gap-2 rounded bg-[#d9a514] px-4 font-bold text-[#061f43] hover:bg-[#e3b72c] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            ค้นหา
          </button>
          <button
            type="button"
            onClick={loadData}
            disabled={loading}
            className="flex h-10 items-center justify-center gap-2 rounded border border-[#061f43] px-4 font-semibold text-[#061f43] hover:bg-[#edf2f7] disabled:opacity-50 cursor-pointer"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={15} />}
            รีเฟรช
          </button>
          <button
            type="button"
            onClick={handlePrint}
            disabled={loading || records.length === 0}
            className="flex h-10 items-center justify-center gap-2 rounded bg-[#061f43] px-4 font-semibold text-white hover:bg-[#0c2e5c] disabled:opacity-50 cursor-pointer"
          >
            <Printer size={16} className="text-[#d9a514]" />
            พิมพ์รายงาน (A4 แนวนอน)
          </button>
        </form>
      </div>

      {error ? (
        <div className="mb-4 border border-red-500 bg-red-50 px-4 py-3 text-sm text-red-700 print-hidden">
          {error}
        </div>
      ) : null}

      {/* Report Summary Header Layout */}
      <div className="inbound-print-page">
        <div className="report-title-section mb-4">
          <div>
            <div className="report-kicker font-black text-xs uppercase tracking-[0.18em] text-[#d7a21f]">
              DAILY FG & WIP REPORT
            </div>
            <h1>รายงานสรุปยอดผลิต FG และ WIP ค้างไลน์</h1>
            <p>ประจำวันที่ {formatDate(reportDate)} · ฝ่ายผลิตแผนก KP13</p>
          </div>
          <div className="report-summary-text">
            <span>จำนวนรายการ</span>
            <strong>{Number(records.length).toLocaleString("th-TH")}</strong>
          </div>
        </div>

        {/* Metric Summary Cards */}
        <div className="grid gap-3 md:grid-cols-4 mb-5 print-hidden">
          <MetricCard label="FG ผลิตเสร็จ (หน่วยกล่อง/ถุง)" value={`${totals.totalFgCases.toLocaleString()}`} />
          <MetricCard label="FG เทียบเท่า (ปี๊บ)" value={`${totals.totalFgTins.toLocaleString()} ปี๊บ`} />
          <MetricCard label="WIP ค้างไลน์ (ปี๊บ)" value={`${totals.totalWipTins.toLocaleString()} ปี๊บ`} tone="gold" />
          <MetricCard label="ยอดผลผลิตรวม (ปี๊บ)" value={`${totals.totalOverallTins.toLocaleString()} ปี๊บ`} tone="gold" />
        </div>

        {/* Report Data Table */}
        <div className="report-table-wrap">
          <table className="report-table">
            <thead>
              <tr className="text-[11px] uppercase tracking-wider">
                <th className="w-[40px] text-center">#</th>
                <th className="w-[80px] text-center">LOT</th>
                <th className="w-[120px]">รหัส</th>
                <th>ชื่อสินค้าสำเร็จรูป FG</th>
                <th className="w-[120px] text-right">จำนวน FG</th>
                <th className="w-[110px] text-right">เทียบเท่า FG (ปี๊บ)</th>
                <th className="w-[120px]">รหัส WIP</th>
                <th>ชื่อสินค้า WIP ค้างไลน์</th>
                <th className="w-[110px] text-right">ค้างไลน์ (ปี๊บ)</th>
                <th className="w-[120px] text-right">ผลผลิตรวม (ปี๊บ)</th>
                <th className="w-[90px] text-center print-hidden">ผู้บันทึก</th>
                <th className="w-[90px] text-center print-hidden">เวลาบันทึก</th>
              </tr>
            </thead>
            <tbody className="font-medium">
              {loading ? (
                <tr>
                  <td colSpan={12} className="px-3 py-12 text-center text-gray-500">
                    <Loader2 size={24} className="animate-spin mx-auto text-[#123c6c] mb-2" />
                    กำลังโหลดข้อมูลรายงาน...
                  </td>
                </tr>
              ) : records.length === 0 ? (
                <tr>
                  <td colSpan={12} className="px-3 py-16 text-center text-gray-400 font-bold">
                    ไม่มีข้อมูลบันทึกผลผลิตและ WIP วันที่ {formatDate(reportDate)}
                  </td>
                </tr>
              ) : (
                records.map((row, index) => {
                  const overallTins = Number(row.fg_tin_qty || 0) + Number(row.wip_tin_qty || 0);
                  const unitName = row.fg_unit_snapshot || "กล่อง";
                  return (
                    <tr key={row.id}>
                      <td className="text-center text-gray-500 font-bold">{index + 1}</td>
                      <td className="text-center font-mono font-bold text-[#123c6c]">{row.lot_no}</td>
                      <td className="font-mono text-gray-600">{row.fg_barcode_snapshot}</td>
                      <td className="text-gray-800 leading-normal" title={row.fg_product_name_snapshot}>
                        <div className="product-text-wrap">
                          {row.fg_product_name_snapshot}
                        </div>
                      </td>
                      <td className="text-right font-mono font-bold tabular-nums">
                        {Number(row.fg_case_qty || 0).toLocaleString()} {unitName}
                      </td>
                      <td className="text-right font-mono font-bold tabular-nums text-emerald-700">
                        {Number(row.fg_tin_qty || 0).toLocaleString()}
                      </td>
                      <td className="font-mono text-gray-600">{row.wip_product_code}</td>
                      <td className="text-gray-800 leading-normal" title={row.wip_product_name_snapshot}>
                        <div className="product-text-wrap">
                          {row.wip_product_name_snapshot}
                        </div>
                      </td>
                      <td className="text-right font-mono font-bold tabular-nums text-amber-700">
                        {Number(row.wip_tin_qty || 0).toLocaleString()}
                      </td>
                      <td className="text-right font-mono font-black tabular-nums bg-gray-50/50">
                        {overallTins.toLocaleString()}
                      </td>
                      <td className="text-center text-gray-600 print-hidden">{row.operator_username_snapshot || "-"}</td>
                      <td className="text-center text-gray-500 print-hidden">{formatTime(row.created_at)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {records.length > 0 && !loading && (
              <tfoot>
                <tr className="font-black text-sm">
                  <td colSpan={4} className="text-right text-gray-600 uppercase tracking-wider text-[11px] pr-4">
                    ยอดรวมทั้งหมด:
                  </td>
                  <td className="text-right font-mono tabular-nums">
                    {totals.totalFgCases.toLocaleString()} หน่วย
                  </td>
                  <td className="text-right font-mono tabular-nums text-emerald-800">
                    {totals.totalFgTins.toLocaleString()} ปี๊บ
                  </td>
                  <td colSpan={2}></td>
                  <td className="text-right font-mono tabular-nums text-amber-800">
                    {totals.totalWipTins.toLocaleString()} ปี๊บ
                  </td>
                  <td className="text-right font-mono text-[#123c6c] tabular-nums bg-[#fff7df] border-double border-b-2 border-t-2 border-[#123c6c]">
                    {totals.totalOverallTins.toLocaleString()} ปี๊บ
                  </td>
                  <td colSpan={2} className="print-hidden"></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
      </div>
      )}
    </div>
  );
}
