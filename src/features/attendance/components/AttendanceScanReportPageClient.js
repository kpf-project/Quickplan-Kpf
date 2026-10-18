"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  BarChart3,
  CalendarDays,
  Clock,
  Download,
  LayoutGrid,
  Printer,
  Search,
} from "lucide-react";
import { fetchAttendanceScanEvents } from "@/features/attendance/services/attendanceScanEventsClient";
import { ReportHeader, ReportFilterBar } from "@/components/print";

const EMPTY_PAGINATION = { page: 1, pageSize: 20, totalPages: 1, totalRecords: 0 };
const TABLE_COLUMN_COUNT = 11;
const PRINT_ROWS_PER_PAGE = 20;

function formatDisplayDate(value) {
  if (!value) return "-";
  const [year, month, day] = String(value).split("-");
  if (!year || !month || !day) return "-";
  return `${Number(day)}-${Number(month)}-${year}`;
}

function getTimeGapInfo(fingerInMorning, checkIn) {
  if (!fingerInMorning || fingerInMorning === "-" || !checkIn || checkIn === "-") {
    return { ms: null, display: "-", isRed: false, minutes: 0 };
  }

  try {
    const [fingerHour, fingerMinute, fingerSecond] = fingerInMorning.split(":").map(Number);
    const [roomHour, roomMinute, roomSecond] = checkIn.split(":").map(Number);
    const fingerDate = new Date(2000, 0, 1, fingerHour, fingerMinute, fingerSecond || 0);
    const roomDate = new Date(2000, 0, 1, roomHour, roomMinute, roomSecond || 0);
    const diffMs = roomDate.getTime() - fingerDate.getTime();
    const totalSeconds = Math.round(diffMs / 1000);
    const absSeconds = Math.abs(totalSeconds);
    const minutes = Math.floor(absSeconds / 60);
    const timeText = `${minutes} นาที`;

    return {
      ms: diffMs,
      display: diffMs < 0 ? `ก่อนสแกน ${timeText}` : timeText,
      isRed: diffMs > 0 && minutes >= 45,
      minutes,
    };
  } catch {
    return { ms: null, display: "-", isRed: false, minutes: 0 };
  }
}

function buildExportRows(rows) {
  return rows.map((row) => {
    const gapInfo = getTimeGapInfo(row.fingerInMorning, row.checkIn);
    return {
      date: formatDisplayDate(row.date),
      employeeCode: row.employeeCode || "-",
      employeeName: row.employeeName || "-",
      department: row.department || "-",
      fingerInMorning: row.fingerInMorning || "-",
      fingerOutLunch: row.fingerOutLunch || "-",
      fingerInAfternoon: row.fingerInAfternoon || "-",
      fingerOutEvening: row.fingerOutEvening || "-",
      checkIn: row.checkIn || "-",
      checkOut: row.checkOut || "-",
      timeGap: gapInfo.display,
      scannedBy: row.scannedBy || "-",
    };
  });
}

function buildPrintPages(rows) {
  const pages = [];
  let currentPage = [];
  let currentPageRowCount = 0;
  let currentDate = "";

  rows.forEach((row, index) => {
    if (currentPageRowCount >= PRINT_ROWS_PER_PAGE) {
      pages.push(currentPage);
      currentPage = [];
      currentPageRowCount = 0;
    }

    if (currentPage.length === 0 || row.date !== currentDate) {
      currentDate = row.date;
      currentPage.push({
        type: "date",
        id: `print-date-${row.date}-${index}`,
        label: formatDisplayDate(row.date),
      });
    }

    currentPage.push({
      type: "row",
      id: `print-row-${row.id}`,
      row,
    });
    currentPageRowCount += 1;
  });

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return pages;
}

export default function AttendanceScanReportPageClient() {
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [dateTo, setDateTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [printRenderedAt, setPrintRenderedAt] = useState(null);
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState(EMPTY_PAGINATION);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [exporting, setExporting] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const loadData = useCallback(async (targetPage = 1) => {
    setLoading(true);
    setErrorMessage("");

    try {
      const params = new URLSearchParams({
        page: String(targetPage),
        pageSize: "20",
      });

      if (search.trim()) params.set("search", search.trim());
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const result = await fetchAttendanceScanEvents(params);
      if (!result.ok) {
        throw new Error(result.error?.message || "Unable to load report");
      }

      setRows(result.data?.data || []);
      setPagination(result.data?.pagination || EMPTY_PAGINATION);
    } catch (error) {
      setRows([]);
      setPagination(EMPTY_PAGINATION);
      setErrorMessage(error?.message || "Unable to load report");
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, search]);

  const handleExportExcel = async () => {
    setExporting(true);

    try {
      const params = new URLSearchParams({
        page: "1",
        pageSize: "10000",
        export: "true",
      });

      if (search.trim()) params.set("search", search.trim());
      if (dateFrom) params.set("dateFrom", dateFrom);
      if (dateTo) params.set("dateTo", dateTo);

      const result = await fetchAttendanceScanEvents(params);
      if (!result.ok) {
        throw new Error(result.error?.message || "Unable to load data for export");
      }

      const allRows = result.data?.data || [];
      if (allRows.length === 0) {
        alert("ไม่มีข้อมูลที่จะออกรายงาน Excel");
        return;
      }

      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("บันทึกสแกนเข้า-ออก");

      worksheet.columns = [
        { header: "วันที่", key: "date", width: 15 },
        { header: "รหัส", key: "employeeCode", width: 15 },
        { header: "ชื่อ", key: "employeeName", width: 25 },
        { header: "แผนก", key: "department", width: 20 },
        { header: "เข้างาน", key: "fingerInMorning", width: 15 },
        { header: "พักเที่ยง", key: "fingerOutLunch", width: 15 },
        { header: "เข้าบ่าย", key: "fingerInAfternoon", width: 15 },
        { header: "เลิกงาน", key: "fingerOutEvening", width: 15 },
        { header: "เข้าห้อง", key: "checkIn", width: 12 },
        { header: "ออกห้อง", key: "checkOut", width: 12 },
        { header: "ส่วนต่าง", key: "timeGap", width: 18 },
        { header: "ผู้บันทึกสแกน", key: "scannedBy", width: 20 },
      ];

      const headerRow = worksheet.getRow(1);
      headerRow.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF102C57" },
      };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      headerRow.height = 30;

      headerRow.eachCell((cell) => {
        cell.border = {
          top: { style: "thin", color: { argb: "FFCCCCCC" } },
          left: { style: "thin", color: { argb: "FFCCCCCC" } },
          bottom: { style: "medium", color: { argb: "FFD4AF37" } },
          right: { style: "thin", color: { argb: "FFCCCCCC" } },
        };
      });

      buildExportRows(allRows).forEach((row) => {
        const addedRow = worksheet.addRow(row);
        addedRow.height = 24;
        addedRow.alignment = { vertical: "middle" };
        addedRow.font = { name: "Arial", size: 10 };

        [
          "date",
          "employeeCode",
          "fingerInMorning",
          "fingerOutLunch",
          "fingerInAfternoon",
          "fingerOutEvening",
          "checkIn",
          "checkOut",
          "timeGap",
        ].forEach((key) => {
          addedRow.getCell(key).alignment = {
            vertical: "middle",
            horizontal: "center",
          };
        });

        addedRow.eachCell((cell) => {
          cell.border = {
            top: { style: "thin", color: { argb: "FFE2E8F0" } },
            left: { style: "thin", color: { argb: "FFE2E8F0" } },
            bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
            right: { style: "thin", color: { argb: "FFE2E8F0" } },
          };
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob(
        [buffer],
        { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
      );
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `รายงานการลงเวลา_${dateFrom}_ถึง_${dateTo}.xlsx`;
      anchor.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Export Excel Error:", error);
      alert(error?.message || "เกิดข้อผิดพลาดในการดึงข้อมูลหรือสร้างไฟล์ Excel");
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    loadData(1);
  }, [loadData]);

  useEffect(() => {
    setPrintRenderedAt(new Date());
  }, []);

  const canGoPrev = pagination.page > 1 && !loading;
  const canGoNext = pagination.page < pagination.totalPages && !loading;

  const summaryLabel = useMemo(
    () => `${pagination.totalRecords.toLocaleString()} รายการ`,
    [pagination.totalRecords]
  );

  const groupedRows = useMemo(() => {
    const items = [];
    let currentDate = "";

    rows.forEach((row) => {
      if (row.date !== currentDate) {
        currentDate = row.date;
        items.push({
          type: "date",
          id: `date-${currentDate}`,
          date: currentDate,
          label: formatDisplayDate(currentDate),
        });
      }

      items.push({
        type: "row",
        id: row.id,
        row,
      });
    });

    return items;
  }, [rows]);
  const printPages = useMemo(() => buildPrintPages(rows), [rows]);

  const printDateLabel = printRenderedAt ? printRenderedAt.toLocaleDateString("th-TH") : "-";
  const printTimeLabel = printRenderedAt ? printRenderedAt.toLocaleTimeString("th-TH") : "-";

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-[#f4f6f9] font-sans text-slate-800 print:block print:min-h-0 print:overflow-visible print:bg-white print:p-0">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              @page {
                size: A4 landscape;
                margin: 6mm 8mm 6mm 8mm;
              }
              body, html, #__next, [data-reactroot] {
                background-color: #ffffff !important;
                color: #000000 !important;
                margin: 0 !important;
                padding: 0 !important;
                height: auto !important;
                min-height: auto !important;
              }
              body {
                font-size: 11px !important;
                line-height: 1.2 !important;
              }
              .min-h-screen,
              .relative.flex.flex-col {
                min-height: auto !important;
                height: auto !important;
                padding: 0 !important;
                margin: 0 !important;
              }
              .mx-auto,
              .bg-white {
                margin: 0 !important;
                max-width: 100% !important;
                width: 100% !important;
                box-shadow: none !important;
                border: none !important;
                border-radius: 0 !important;
              }
              .overflow-x-auto {
                display: contents !important;
              }
              table,
              tbody {
                width: 100% !important;
                border-collapse: collapse !important;
                margin: 0 !important;
                padding: 0 !important;
                page-break-inside: auto !important;
                break-inside: auto !important;
              }
              tr {
                height: auto !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
                page-break-after: auto !important;
                break-after: auto !important;
              }
              thead th {
                background-color: #f8f9fa !important;
                color: #1a1c1e !important;
                padding: 6px 4px !important;
                font-size: 10.5px !important;
                font-weight: bold !important;
                line-height: 1.2 !important;
                border: 1px solid #cbd5e1 !important;
                border-bottom: 2px solid #1a1c1e !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              tbody td {
                padding: 6px 4px !important;
                font-size: 10.5px !important;
                line-height: 1.2 !important;
                border: 1px solid #e2e8f0 !important;
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              tbody td span {
                font-size: 10.5px !important;
                line-height: 1.2 !important;
              }
              .print-date-divider td {
                padding: 8px 0 !important;
                border: none !important;
              }
              .print-report-page {
                display: block !important;
                margin: 0 !important;
                padding: 0 !important;
                overflow: hidden !important;
                break-inside: avoid-page !important;
                page-break-inside: avoid !important;
              }
              .print-page-break {
                display: block !important;
                height: 0 !important;
                margin: 0 !important;
                padding: 0 !important;
                border: 0 !important;
                break-before: page !important;
                page-break-before: always !important;
              }
              .print-report-header * {
                white-space: nowrap !important;
              }
              .print-report-header {
                break-after: avoid-page !important;
                page-break-after: avoid !important;
              }
              .print-report-table {
                width: 100% !important;
                border-collapse: collapse !important;
                table-layout: fixed !important;
                margin: 0 !important;
              }
              .print-report-table thead {
                display: table-header-group !important;
              }
              .print-report-table tbody,
              .print-report-table tr {
                break-inside: auto !important;
                page-break-inside: auto !important;
              }
              .print-report-table th,
              .print-report-table td {
                padding: 4px 5px !important;
                font-size: 9px !important;
                line-height: 1.1 !important;
              }
              .print-report-date-row td {
                border: none !important;
                padding: 6px 0 5px 0 !important;
              }
              .print-report-date-chip {
                display: inline-block !important;
                background: var(--surface-navy, #102c57) !important;
                color: #d4af37 !important;
                border: 1px solid rgba(212, 175, 55, 0.7) !important;
                padding: 2px 12px !important;
                font-size: 9px !important;
                font-weight: 700 !important;
                letter-spacing: 0.18em !important;
              }
            }
          `,
        }}
      />

      <div className="z-40 shrink-0 border-b-2 border-[#d4af37] bg-[var(--surface-navy,#102c57)] text-white print:hidden">
        <div className="mx-auto max-w-[95%] py-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-center">
              <div>
                <div className="flex items-center gap-2">
                  <h6 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#d4af37]">
                    ATTENDANCE SYSTEM
                  </h6>
                  <span className="rounded-sm bg-[#d4af37] px-2 py-0.5 font-sans text-[10px] font-bold tracking-wider text-[#102c57]">
                    {summaryLabel}
                  </span>
                </div>
                <h1 className="mt-1 flex items-center gap-2 font-serif text-xl font-bold tracking-wide text-white sm:text-2xl">
                  <BarChart3 size={24} className="text-[#d4af37]" />
                  รายงานการบันทึกเวลาปฏิบัติงาน (แยกเซสชัน)
                </h1>
              </div>

              <div className="hidden self-start rounded-sm border border-white/10 bg-black/20 p-1 sm:flex lg:self-auto">
                <Link
                  href="/production-line/attendance"
                  className="flex items-center gap-1.5 rounded-sm px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/60 transition-all hover:bg-white/5 hover:text-white"
                >
                  <LayoutGrid size={14} />
                  ลงเวลาบันทึกงาน
                </Link>
                <Link
                  href="/production-line/attendance/report"
                  className="flex items-center gap-1.5 rounded-sm bg-[#d4af37] px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider text-[#102c57] shadow-sm"
                >
                  <BarChart3 size={14} />
                  รายงาน
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="relative flex flex-col px-2 py-8 print:m-0 print:block print:p-0 print:py-4 sm:px-4">
        <div className="mx-auto mb-4 w-full max-w-[98%] overflow-hidden rounded-sm border border-slate-200 bg-white shadow-sm print:hidden">
          <button
            onClick={() => setShowHelp((current) => !current)}
            className="flex w-full items-center justify-between p-4 text-left text-sm font-semibold text-[#102c57] transition-colors hover:bg-slate-50"
          >
            <div className="flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0 text-[#102c57]" />
              <span>คำอธิบายความหมายและคอลัมน์ในรายงาน</span>
            </div>
            <span className="text-xs font-bold text-[#d4af37]">
              {showHelp ? "ซ่อนคำอธิบาย ▲" : "แสดงคำอธิบาย ▼"}
            </span>
          </button>
          {showHelp && (
            <div className="grid grid-cols-1 gap-4 border-t border-slate-100 bg-slate-50/50 p-4 text-xs text-slate-600 md:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-sm border border-slate-100 bg-white p-3 shadow-2xs">
                <span className="mb-1 block font-bold text-[#102c57]">1. ลายนิ้ว 4 ช่วงเวลา</span>
                ดึงจากเครื่องสแกนนิ้วหลักตามลำดับเวลาจริงของวันเดียวกัน ได้แก่ เช้า, พักเที่ยง, เข้าบ่าย และเลิกงาน
              </div>
              <div className="rounded-sm border border-slate-100 bg-white p-3 shadow-2xs">
                <span className="mb-1 block font-bold text-emerald-700">2. เข้าห้อง / ออกห้อง</span>
                เวลาบันทึกจากการสแกนใบหน้า หรือคีย์การ์ด เพื่อผ่านประตูเข้า-ออกห้องปฏิบัติงานผลิตในระบบปัจจุบัน
              </div>
              <div className="rounded-sm border border-slate-100 bg-white p-3 shadow-2xs">
                <span className="mb-1 block font-bold text-[#d4af37]">3. ส่วนต่าง</span>
                เปรียบเทียบเวลาระหว่างเข้างานกับการเข้าห้องครั้งแรกของวัน เพื่อดูช่วงเวลาที่ห่างกัน
              </div>
              <div className="rounded-sm border border-slate-100 bg-white p-3 shadow-2xs">
                <span className="mb-1 block font-bold text-rose-700">4. เตือนกรณีต่างเวลาเกิน 45 นาที</span>
                ถ้าเข้างานกับเวลาเข้าห้องห่างกันตั้งแต่ 45 นาทีขึ้นไป ระบบจะไฮไลต์สีแดงเพื่อช่วยตรวจสอบ
              </div>
            </div>
          )}
        </div>

        <div className="mx-auto w-full max-w-[98%] overflow-hidden rounded-sm border border-slate-200 bg-white shadow-sm print:block print:w-full print:max-w-full print:border-none print:shadow-none">
          <div className="border-b border-slate-200 bg-slate-50/50 p-5 print:hidden">
            <ReportFilterBar
              dateMode="range"
              dateFrom={dateFrom}
              dateTo={dateTo}
              onDateFromChange={setDateFrom}
              onDateToChange={setDateTo}
              searchQuery={search}
              onSearchQueryChange={setSearch}
              searchPlaceholder="ค้นหารหัสพนักงาน / ชื่อ / แผนก / สาขา"
              searchLabel="ค้นหาพนักงาน / แผนก"
              isLoading={loading}
              onSearch={() => loadData(1)}
              searchButtonLabel="ค้นหาข้อมูล"
              onReset={() => {
                setSearch("");
                const today = new Date().toISOString().slice(0, 10);
                setDateFrom(today);
                setDateTo(today);
                setTimeout(() => loadData(1), 0);
              }}
              onPrint={() => window.print()}
              printButtonLabel="พิมพ์รายงาน"
              onExportExcel={handleExportExcel}
              excelButtonLabel={exporting ? "กำลังส่งออก..." : "ส่งออก Excel"}
              isExporting={exporting}
              className="mb-0 border-0 bg-transparent p-0 shadow-none"
            />
          </div>

          {errorMessage && (
            <div className="border-b border-rose-100 bg-rose-50/50 px-5 py-3 text-sm font-medium text-rose-700">
              ⚠️ {errorMessage}
            </div>
          )}

          <div className="overflow-x-auto print:hidden">
            <div className="mb-4">
              <ReportHeader
                title="รายงานการบันทึกเวลาปฏิบัติงาน (แยกเซสชัน)"
                subtitle="ATTENDANCE SCAN SESSIONS REPORT"
                printedAt={`${printDateLabel} ${printTimeLabel}`}
                meta={[
                  { label: "ประจำวันที่", value: `${formatDisplayDate(dateFrom)} ถึง ${formatDisplayDate(dateTo)}` },
                ]}
              />
            </div>

            <table className="w-full border-collapse text-sm">
              <thead className="border-b-2 border-[#d4af37] bg-[var(--surface-navy,#102c57)] text-[11px] font-semibold uppercase tracking-wider text-white">
                <tr>
                  <th className="border-r border-[#1e3e6b]/40 px-4 py-3.5 text-left font-bold">รหัส</th>
                  <th className="border-r border-[#1e3e6b]/40 px-4 py-3.5 text-left font-bold">ชื่อ</th>
                  <th className="border-r border-[#1e3e6b]/40 px-4 py-3.5 text-left font-bold">แผนก</th>
                  <th className="border-r border-[#1e3e6b]/40 px-4 py-3.5 text-center font-bold">เข้างาน</th>
                  <th className="border-r border-[#1e3e6b]/40 px-4 py-3.5 text-center font-bold">พักเที่ยง</th>
                  <th className="border-r border-[#1e3e6b]/40 px-4 py-3.5 text-center font-bold">เข้าบ่าย</th>
                  <th className="border-r border-[#1e3e6b]/40 px-4 py-3.5 text-center font-bold">เลิกงาน</th>
                  <th className="border-r border-[#1e3e6b]/40 px-4 py-3.5 text-center font-bold text-[#d4af37]">เข้าห้อง</th>
                  <th className="border-r border-[#1e3e6b]/40 px-4 py-3.5 text-center font-bold text-[#d4af37]">ออกห้อง</th>
                  <th className="border-r border-[#1e3e6b]/40 px-4 py-3.5 text-center font-bold text-[#d4af37]">ส่วนต่าง</th>
                  <th className="px-4 py-3.5 text-left font-bold">ผู้บันทึกสแกน</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={TABLE_COLUMN_COUNT} className="bg-slate-50/10 px-4 py-12 text-center font-medium text-slate-400">
                      กำลังดำเนินการดึงข้อมูลรายงาน...
                    </td>
                  </tr>
                )}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td colSpan={TABLE_COLUMN_COUNT} className="bg-slate-50/10 px-4 py-12 text-center font-medium text-slate-400">
                      ไม่พบประวัติข้อมูลการสแกนในระบบตามช่วงเวลาที่กำหนด
                    </td>
                  </tr>
                )}
                {groupedRows.map((item) => {
                  if (item.type === "date") {
                    return (
                      <tr key={item.id} className="print-date-divider bg-white">
                        <td colSpan={TABLE_COLUMN_COUNT} className="px-4 py-4">
                          <div className="flex items-center gap-4">
                            <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#102c57] to-[#d4af37]" />
                            <span className="rounded-sm border border-[#d4af37]/50 bg-[var(--surface-navy,#102c57)] px-4 py-1 text-xs font-bold uppercase tracking-[0.22em] text-[#d4af37]">
                              {item.label}
                            </span>
                            <div className="h-px flex-1 bg-gradient-to-r from-[#d4af37] via-[#102c57] to-transparent" />
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  const row = item.row;
                  const gapInfo = getTimeGapInfo(row.fingerInMorning, row.checkIn);

                  return (
                    <tr key={item.id} className="border-b border-slate-100 transition-colors hover:bg-slate-50/80">
                      <td className="border-r border-slate-100 px-4 py-3 font-mono text-xs font-semibold text-[#102c57]">
                        {row.employeeCode || "-"}
                      </td>
                      <td className="border-r border-slate-100 px-4 py-3 font-medium text-slate-800">
                        {row.employeeName || "-"}
                      </td>
                      <td className="border-r border-slate-100 px-4 py-3 font-semibold text-slate-700">
                        {row.department || "-"}
                      </td>
                      <td className="border-r border-slate-100 px-4 py-3 text-center">
                        <span className="font-mono text-sm font-bold text-slate-700">
                          {row.fingerInMorning || "-"}
                        </span>
                      </td>
                      <td className="border-r border-slate-100 px-4 py-3 text-center">
                        <span className="font-mono text-sm font-bold text-slate-700">
                          {row.fingerOutLunch || "-"}
                        </span>
                      </td>
                      <td className="border-r border-slate-100 px-4 py-3 text-center">
                        <span className="font-mono text-sm font-bold text-slate-700">
                          {row.fingerInAfternoon || "-"}
                        </span>
                      </td>
                      <td className="border-r border-slate-100 px-4 py-3 text-center">
                        <span className="font-mono text-sm font-bold text-slate-700">
                          {row.fingerOutEvening || "-"}
                        </span>
                      </td>
                      <td className="border-r border-slate-100 px-4 py-3 text-center">
                        <span className="font-mono text-sm font-bold text-emerald-700">
                          {row.checkIn || "-"}
                        </span>
                      </td>
                      <td className="border-r border-slate-100 px-4 py-3 text-center">
                        <span className="font-mono text-sm font-bold text-amber-700">
                          {row.checkOut || "-"}
                        </span>
                      </td>
                      <td className="border-r border-slate-100 px-4 py-3 text-center">
                        {gapInfo.ms === null ? (
                          <span className="font-mono text-sm text-slate-400">-</span>
                        ) : gapInfo.ms < 0 ? (
                          <span className="inline-flex items-center gap-1 whitespace-nowrap font-mono text-sm font-semibold text-slate-500">
                            <Clock size={14} className="shrink-0 text-slate-400" />
                            {gapInfo.display}
                          </span>
                        ) : gapInfo.isRed ? (
                          <span className="inline-flex items-center gap-1 whitespace-nowrap font-mono text-sm font-bold text-rose-600">
                            <AlertCircle size={14} className="shrink-0 text-rose-500" />
                            {gapInfo.display}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 whitespace-nowrap font-mono text-sm font-bold text-slate-700">
                            <Clock size={14} className="shrink-0 text-slate-400" />
                            {gapInfo.display}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs font-medium text-slate-500">
                        {row.scannedBy || "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="hidden print:block">
            {printPages.map((page, pageIndex) => (
              <div key={`print-page-${pageIndex}`}>
                {pageIndex > 0 && <div className="print-page-break" aria-hidden="true" />}
                <section className="print-report-page">
                <ReportHeader
                  title="รายงานการบันทึกเวลาปฏิบัติงาน (แยกเซสชัน)"
                  subtitle="ATTENDANCE SCAN SESSIONS REPORT"
                  printedAt={`${printDateLabel} ${printTimeLabel}`}
                  page={pageIndex + 1}
                  totalPages={printPages.length}
                  meta={[
                    { label: "ประจำวันที่", value: `${formatDisplayDate(dateFrom)} ถึง ${formatDisplayDate(dateTo)}` },
                  ]}
                  className="mb-2"
                />

                <table className="print-report-table">
                  <thead className="border-b-2 border-[#d4af37] bg-[var(--surface-navy,#102c57)] text-[11px] font-semibold uppercase tracking-wider text-white">
                    <tr>
                      <th className="border-r border-[#1e3e6b]/40 px-4 py-3.5 text-left font-bold">รหัส</th>
                      <th className="border-r border-[#1e3e6b]/40 px-4 py-3.5 text-left font-bold">ชื่อ</th>
                      <th className="border-r border-[#1e3e6b]/40 px-4 py-3.5 text-left font-bold">แผนก</th>
                      <th className="border-r border-[#1e3e6b]/40 px-4 py-3.5 text-center font-bold">เข้างาน</th>
                      <th className="border-r border-[#1e3e6b]/40 px-4 py-3.5 text-center font-bold">พักเที่ยง</th>
                      <th className="border-r border-[#1e3e6b]/40 px-4 py-3.5 text-center font-bold">เข้าบ่าย</th>
                      <th className="border-r border-[#1e3e6b]/40 px-4 py-3.5 text-center font-bold">เลิกงาน</th>
                      <th className="border-r border-[#1e3e6b]/40 px-4 py-3.5 text-center font-bold text-[#d4af37]">เข้าห้อง</th>
                      <th className="border-r border-[#1e3e6b]/40 px-4 py-3.5 text-center font-bold text-[#d4af37]">ออกห้อง</th>
                      <th className="border-r border-[#1e3e6b]/40 px-4 py-3.5 text-center font-bold text-[#d4af37]">ส่วนต่าง</th>
                      <th className="px-4 py-3.5 text-left font-bold">ผู้บันทึกสแกน</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.map((item) => {
                      if (item.type === "date") {
                        return (
                          <tr key={item.id} className="print-report-date-row">
                            <td colSpan={TABLE_COLUMN_COUNT}>
                              <div className="flex items-center gap-4">
                                <div className="h-px flex-1 bg-gradient-to-r from-transparent via-[#102c57] to-[#d4af37]" />
                                <span className="print-report-date-chip rounded-sm">
                                  {item.label}
                                </span>
                                <div className="h-px flex-1 bg-gradient-to-r from-[#d4af37] via-[#102c57] to-transparent" />
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      const row = item.row;
                      const gapInfo = getTimeGapInfo(row.fingerInMorning, row.checkIn);

                      return (
                        <tr key={item.id} className="border-b border-slate-100">
                          <td className="border-r border-slate-100 px-4 py-3 font-mono text-xs font-semibold text-[#102c57]">
                            {row.employeeCode || "-"}
                          </td>
                          <td className="border-r border-slate-100 px-4 py-3 font-medium text-slate-800">
                            {row.employeeName || "-"}
                          </td>
                          <td className="border-r border-slate-100 px-4 py-3 font-semibold text-slate-700">
                            {row.department || "-"}
                          </td>
                          <td className="border-r border-slate-100 px-4 py-3 text-center">
                            <span className="font-mono text-sm font-bold text-slate-700">
                              {row.fingerInMorning || "-"}
                            </span>
                          </td>
                          <td className="border-r border-slate-100 px-4 py-3 text-center">
                            <span className="font-mono text-sm font-bold text-slate-700">
                              {row.fingerOutLunch || "-"}
                            </span>
                          </td>
                          <td className="border-r border-slate-100 px-4 py-3 text-center">
                            <span className="font-mono text-sm font-bold text-slate-700">
                              {row.fingerInAfternoon || "-"}
                            </span>
                          </td>
                          <td className="border-r border-slate-100 px-4 py-3 text-center">
                            <span className="font-mono text-sm font-bold text-slate-700">
                              {row.fingerOutEvening || "-"}
                            </span>
                          </td>
                          <td className="border-r border-slate-100 px-4 py-3 text-center">
                            <span className="font-mono text-sm font-bold text-emerald-700">
                              {row.checkIn || "-"}
                            </span>
                          </td>
                          <td className="border-r border-slate-100 px-4 py-3 text-center">
                            <span className="font-mono text-sm font-bold text-amber-700">
                              {row.checkOut || "-"}
                            </span>
                          </td>
                          <td className="border-r border-slate-100 px-4 py-3 text-center">
                            {gapInfo.ms === null ? (
                              <span className="font-mono text-sm text-slate-400">-</span>
                            ) : gapInfo.ms < 0 ? (
                              <span className="inline-flex items-center gap-1 whitespace-nowrap font-mono text-sm font-semibold text-slate-500">
                                <Clock size={12} className="shrink-0 text-slate-400" />
                                {gapInfo.display}
                              </span>
                            ) : gapInfo.isRed ? (
                              <span className="inline-flex items-center gap-1 whitespace-nowrap font-mono text-sm font-bold text-rose-600">
                                <AlertCircle size={12} className="shrink-0 text-rose-500" />
                                {gapInfo.display}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 whitespace-nowrap font-mono text-sm font-bold text-slate-700">
                                <Clock size={12} className="shrink-0 text-slate-400" />
                                {gapInfo.display}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs font-medium text-slate-500">
                            {row.scannedBy || "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                </section>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/50 px-5 py-4 print:hidden">
            <p className="text-xs font-medium text-slate-500">
              หน้า {pagination.page} / {pagination.totalPages} • ทั้งหมด {pagination.totalRecords.toLocaleString()} รายการ
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => canGoPrev && loadData(pagination.page - 1)}
                disabled={!canGoPrev}
                className="h-8 rounded-sm border border-slate-300 px-4 text-xs font-bold text-slate-600 transition-colors hover:bg-white disabled:opacity-40"
              >
                ก่อนหน้า
              </button>
              <button
                onClick={() => canGoNext && loadData(pagination.page + 1)}
                disabled={!canGoNext}
                className="h-8 rounded-sm border border-slate-300 px-4 text-xs font-bold text-slate-600 transition-colors hover:bg-white disabled:opacity-40"
              >
                ถัดไป
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
