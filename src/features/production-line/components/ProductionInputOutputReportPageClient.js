"use client";

import Image from "next/image";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarRange,
  Printer,
  RefreshCw,
} from "lucide-react";
import WeightScalePrimaryHeader from "@/features/production-line/components/WeightScalePrimaryHeader";
import { useUserProfile } from "@/lib/useUserProfile";
import styles from "./ProductionInputOutputReport.module.css";

const ROWS_PER_PAGE = 16;
const PRINT_MODE_COMPACT = "compact";
const PRINT_MODE_DAILY = "daily";

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || value === "") return "—";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return parsed.toLocaleString("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatQuantity(value) {
  if (value === null || value === undefined || value === "") return "—";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "—";
  return parsed.toLocaleString("th-TH", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function formatThaiDate(value) {
  if (!value) return "—";
  const parsed = new Date(`${value}T00:00:00+07:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(parsed);
}

function formatPrintedAt(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
}

function buildPages(days) {
  return (Array.isArray(days) ? days : []).flatMap((day) => {
    const rows = Array.isArray(day.rows) ? day.rows : [];
    const chunkCount = Math.max(1, Math.ceil(rows.length / ROWS_PER_PAGE));
    return Array.from({ length: chunkCount }, (_, pageIndex) => ({
      ...day,
      rows: rows.slice(pageIndex * ROWS_PER_PAGE, (pageIndex + 1) * ROWS_PER_PAGE),
      dayPage: pageIndex + 1,
      dayPageCount: chunkCount,
      showTotals: pageIndex === chunkCount - 1,
    }));
  });
}

function hasMeasuredValue(quantity, weightKg) {
  return Number(quantity || 0) !== 0 || Number(weightKg || 0) !== 0;
}

function sumJam(jams, field) {
  return (Array.isArray(jams) ? jams : []).reduce(
    (total, row) => total + Number(row?.[field] || 0),
    0
  );
}

function LotBreakdown({ lots, visible }) {
  if (!visible || !Array.isArray(lots) || !lots.length) return "—";

  return (
    <div className="input-output-lot-breakdown">
      {lots.map((lot) => (
        <div key={lot.lotNo} className="input-output-lot-line">
          <span className="input-output-lot-no">{lot.lotNo || "-"}</span>
          <span className="input-output-lot-separator" aria-hidden="true">·</span>
          <span className="input-output-lot-quantity">{formatQuantity(lot.quantity)}</span>
          <span className="input-output-lot-separator" aria-hidden="true">·</span>
          <strong className="input-output-lot-weight">{formatNumber(lot.weightKg)}</strong>
        </div>
      ))}
    </div>
  );
}

function LotHeader() {
  return (
    <div className="input-output-lot-header">
      <span>LOT</span>
      <span className="input-output-lot-separator" aria-hidden="true">·</span>
      <span>จำนวน</span>
      <span className="input-output-lot-separator" aria-hidden="true">·</span>
      <span>น้ำหนัก (กก.)</span>
    </div>
  );
}

function ReportTable({ page, showHeaders = true }) {
  const jams = page.dayPage === 1 && Array.isArray(page.jams) ? page.jams : [];
  const hasRows = page.rows.length > 0 || jams.length > 0;
  const rowCount = Math.max(page.rows.length, jams.length);
  const displayRows = Array.from({ length: rowCount }, (_, index) => ({
    production: page.rows[index] || null,
    jam: jams[index] || null,
  }));
  const jamQuantity = sumJam(page.jams, "quantity");
  const jamWeightKg = sumJam(page.jams, "weightKg");

  return (
    <table className="input-output-technical-grid mt-3 w-full table-fixed border-collapse">
      <colgroup>
        <col className="w-[2.5%]" />
        <col className="w-[5%]" /><col className="w-[7.5%]" /><col className="w-[14%]" /><col className="w-[3.5%]" /><col className="w-[5%]" />
        <col className="w-[8%]" /><col className="w-[12%]" /><col className="w-[3.5%]" /><col className="w-[5%]" />
        <col className="w-[6%]" /><col className="w-[10%]" /><col className="w-[4%]" /><col className="w-[6.5%]" />
        <col className="w-[2.5%]" /><col className="w-[2.5%]" /><col className="w-[2.5%]" />
      </colgroup>
      {showHeaders ? (
        <thead>
        <tr className="bg-slate-50 text-slate-950">
          <th rowSpan={2}>#</th>
          <th colSpan={5} className="border-l border-l-slate-200">เปลือกที่ใช้จริง</th>
          <th colSpan={4} className="border-l border-l-slate-200">แยมใช้จริง</th>
          <th colSpan={4} className="border-l border-l-slate-200">สินค้าสำเร็จรูปที่ผลิตได้</th>
          <th colSpan={3} className="input-output-waste-cell border-l border-l-slate-200">ของเสีย (กก.)</th>
        </tr>
        <tr className="bg-white font-bold">
          <th className="border-l border-l-slate-200">รหัสเปลือก</th>
          <th>ชื่อเปลือก</th>
          <th><LotHeader /></th>
          <th>จำนวน</th>
          <th>น้ำหนัก (กก.)</th>
          <th className="border-l border-l-slate-200">ชื่อแยม</th>
          <th><LotHeader /></th>
          <th>จำนวน</th>
          <th>น้ำหนัก (กก.)</th>
          <th className="border-l border-l-slate-200">รหัสสินค้า</th>
          <th>ชื่อสินค้า</th>
          <th>จำนวน</th>
          <th>น้ำหนัก (กก.)</th>
          <th className="input-output-waste-cell border-l border-l-slate-200">ป้าย</th>
          <th className="input-output-waste-cell">หัก</th>
          <th className="input-output-waste-cell">ไหม้</th>
        </tr>
        </thead>
      ) : null}
      <tbody className="text-slate-700">
        {hasRows ? displayRows.map(({ production, jam }, index) => {
          const showShell = Boolean(
            production?.shellCode
            && hasMeasuredValue(production.shellQuantity, production.shellWeightKg)
          );
          const showWaste = Boolean(
            production?.fgCode
            && Number(production.wasteWeightKg || 0) !== 0
          );
          const showFg = Boolean(
            production?.fgCode
            && hasMeasuredValue(production.fgQuantity, production.fgWeightKg)
          );

          return (
            <tr key={`${page.date}-${page.dayPage}-${index}`} className="input-output-data-row hover:bg-slate-50/50">
              <td className="bg-slate-50/40 text-center font-bold text-slate-400">{index + 1}</td>

              <td className="border-l border-l-slate-200 text-center font-mono whitespace-nowrap">{showShell ? production.shellCode : "—"}</td>
              <td className="text-left">
                <span className="input-output-product-name">{showShell ? production.shellName : "—"}</span>
              </td>
              <td className="input-output-lot-cell text-left font-mono tabular-nums">
                <LotBreakdown lots={production?.shellLots} visible={showShell} />
              </td>
              <td className="text-center font-mono tabular-nums">{showShell ? formatQuantity(production.shellQuantity) : "—"}</td>
              <td className="text-center font-mono tabular-nums">{showShell ? formatNumber(production.shellWeightKg) : "—"}</td>

              <td className="border-l border-l-slate-200 bg-slate-50/20 text-left">
                <span className="input-output-product-name">{jam?.name || "—"}</span>
              </td>
              <td className="input-output-lot-cell bg-slate-50/20 text-left font-mono tabular-nums">
                <LotBreakdown lots={jam?.lots} visible={Boolean(jam)} />
              </td>
              <td className="bg-slate-50/20 text-center font-mono tabular-nums">{jam ? formatQuantity(jam.quantity) : "—"}</td>
              <td className="bg-slate-50/20 text-center font-mono tabular-nums">{jam ? formatNumber(jam.weightKg) : "—"}</td>

              <td className="border-l border-l-slate-200 bg-slate-50/20 text-center font-mono whitespace-nowrap">{showFg ? production.fgCode : "—"}</td>
              <td className="bg-slate-50/20 text-left">
                <span className="input-output-product-name">{showFg ? production.fgName : "—"}</span>
              </td>
              <td className="bg-slate-50/20 text-center font-mono font-bold tabular-nums text-slate-900">{showFg ? formatQuantity(production.fgQuantity) : "—"}</td>
              <td className="bg-slate-50/20 text-center font-mono font-bold tabular-nums text-slate-900">{showFg ? formatNumber(production.fgWeightKg) : "—"}</td>

              <td className="input-output-waste-cell border-l border-l-slate-200 text-right font-mono tabular-nums">{showWaste ? formatNumber(production.labelScrapWeightKg) : "—"}</td>
              <td className="input-output-waste-cell text-right font-mono tabular-nums">{showWaste ? formatNumber(production.brokenScrapWeightKg) : "—"}</td>
              <td className="input-output-waste-cell text-right font-mono tabular-nums">{showWaste ? formatNumber(production.burntScrapWeightKg) : "—"}</td>
            </tr>
          );
        }) : (
          <tr className="input-output-data-row">
            <td colSpan={17} className="text-center text-slate-400">
              ไม่พบข้อมูลในวันที่เลือก
            </td>
          </tr>
        )}
      </tbody>
      {page.showTotals ? (
        <tfoot className="bg-slate-100 font-bold text-slate-950">
          <tr>
            <td className="text-center text-[11px]">Σ</td>
            <td colSpan={3} className="text-right">รวมเปลือก:</td>
            <td className="text-center font-mono">{formatQuantity(page.totals.shellQuantity)}</td>
            <td className="text-center font-mono">{formatNumber(page.totals.shellWeightKg)}</td>
            <td colSpan={2} className="border-l border-l-slate-300 text-right">รวมแยมใช้จริง:</td>
            <td className="text-center font-mono">{formatQuantity(jamQuantity)}</td>
            <td className="text-center font-mono">{formatNumber(jamWeightKg)}</td>
            <td colSpan={2} className="border-l border-l-slate-300 text-right">รวมสินค้าสำเร็จรูป:</td>
            <td className="text-center font-mono">{formatQuantity(page.totals.fgQuantity)}</td>
            <td className="text-center font-mono">{formatNumber(page.totals.fgWeightKg)}</td>
            <td className="input-output-waste-cell border-l border-l-slate-300 text-right font-mono">{formatNumber(page.totals.labelScrapWeightKg)}</td>
            <td className="input-output-waste-cell text-right font-mono">{formatNumber(page.totals.brokenScrapWeightKg)}</td>
            <td className="input-output-waste-cell text-right font-mono">{formatNumber(page.totals.burntScrapWeightKg)}</td>
          </tr>
        </tfoot>
      ) : null}
    </table>
  );
}

function ReportSheet({ page, generatedAt, username, departmentName, warnings }) {
  return (
    <article className="input-output-sheet mx-auto bg-white text-slate-900 shadow-[0_10px_30px_rgba(15,23,42,0.14)]">
      <header className="grid grid-cols-[1fr_1.4fr_1fr] items-end gap-4 border-b-2 border-slate-900 pb-3">
        <div className="flex items-center gap-3">
          <Image src="/brand/LOGO-KPF1.png" alt="KPF" width={62} height={50} className="h-11 w-auto object-contain" priority />
          <div>
            <div className="text-[12px] font-black text-[#102C57]">บริษัท เคพีฟู้ดส์ จำกัด</div>
            <div className="text-[8px] font-semibold text-slate-500">K.P. foods Co.,Ltd.</div>
          </div>
        </div>
        <div className="text-center">
          <h2 className="text-[17px] font-black text-[#102C57]">รายงานสรุปวัตถุดิบและผลผลิตประจำวัน</h2>
          <p className="mt-1 text-[9px] font-semibold text-slate-600">ประจำวันที่ {formatThaiDate(page.date)}</p>
        </div>
        <div className="text-right text-[8px] leading-4 text-slate-500">
          <div>วันที่พิมพ์: <span className="font-semibold text-slate-800">{formatPrintedAt(generatedAt)}</span></div>
          <div>ผู้พิมพ์: <span className="font-semibold text-slate-800">{username || "System"}</span></div>
          <div>หน้า: <span className="font-semibold text-slate-800">{page.dayPage}/{page.dayPageCount}</span></div>
        </div>
      </header>

      <div className="mt-2 flex items-center justify-between text-[8px] text-slate-500">
        <span>แผนก: <strong className="text-slate-800">{departmentName || "แผนกผลิต"}</strong></span>
        <span>ความสัมพันธ์ FG ↔ เปลือก อ้างอิง BOM เท่านั้น ไม่อ้างอิงอัตราส่วนสูตร</span>
      </div>

      {warnings.length ? (
        <div className="mt-2 border border-rose-300 bg-rose-50 px-2 py-1 text-[8px] font-semibold text-rose-800">
          {warnings.map((item) => `${item.source}: ${item.message}`).join(" • ")}
        </div>
      ) : null}

      <ReportTable page={page} />

      <footer className="mt-3 flex items-center justify-between border-t border-slate-200 pt-2 text-[7px] text-slate-400">
        <span>แหล่งข้อมูล: ใช้จริงจากรายงานชั่ง-เบิก • แยมใช้จริงจากใบเบิกหักใบคืน • ของเสียและ FG จากระบบสแกนคิดค่าแรง</span>
        <span>แยมใช้จริง = น้ำหนักเบิก − น้ำหนักคืน โดยจับคู่เลขใบเบิกและรหัสแยม</span>
      </footer>
    </article>
  );
}

function CompactPrintSheet({ days, generatedAt, username, departmentName, warnings, dateFrom, dateTo }) {
  const reportDays = Array.isArray(days) ? days : [];

  return (
    <div className="input-output-compact-sheet-content bg-white text-slate-900">
      <table className="input-output-compact-print-table">
        <colgroup>
          <col className="w-[2.5%]" />
          <col className="w-[11.5%]" /><col className="w-[14%]" /><col className="w-[3.5%]" /><col className="w-[5%]" />
          <col className="w-[7%]" /><col className="w-[12%]" /><col className="w-[3.5%]" /><col className="w-[5%]" />
          <col className="w-[18%]" /><col className="w-[4%]" /><col className="w-[6.5%]" />
          <col className="w-[2.5%]" /><col className="w-[2.5%]" /><col className="w-[2.5%]" />
        </colgroup>
        <thead>
          <tr className="input-output-print-report-header">
            <th colSpan={15}>
              <div className="flex items-end justify-between">
                <div className="flex items-center gap-3 text-left">
                  <Image src="/brand/LOGO-KPF1.png" alt="KPF" width={44} height={40} className="h-10 w-auto object-contain" priority />
                  <div>
                    <div className="text-[12px] font-black text-[#102C57]">บริษัท เคพีฟู้ดส์ จำกัด</div>
                    <div className="text-[8px] font-semibold text-slate-500">K.P. foods Co.,Ltd.</div>
                  </div>
                </div>
                <div className="text-center">
                  <h2 className="text-[16px] font-black text-[#102C57]">รายงานสรุปวัตถุดิบและผลผลิต</h2>
                  <p className="mt-1 text-[8px] font-semibold text-slate-600">ช่วงวันที่ {formatThaiDate(dateFrom)} ถึง {formatThaiDate(dateTo)}</p>
                </div>
                <div className="text-right text-[8px] leading-4 text-slate-500">
                  <div>วันที่พิมพ์: <span className="font-semibold text-slate-800">{formatPrintedAt(generatedAt)}</span></div>
                  <div>ผู้พิมพ์: <span className="font-semibold text-slate-800">{username || "System"}</span></div>
                </div>
              </div>
            </th>
          </tr>
          <tr className="input-output-print-report-meta">
            <th colSpan={7} className="text-left">แผนก: <span className="font-black">{departmentName || "แผนกผลิต"}</span></th>
            <th colSpan={8} className="text-right">ข้อมูลเรียงตามวัน พร้อมยอดรวมแยกแต่ละวัน</th>
          </tr>
          <tr className="input-output-print-table-header">
            <th rowSpan={2}>#</th>
            <th colSpan={4}>เปลือกที่ใช้จริง</th>
            <th colSpan={4}>แยมใช้จริง</th>
            <th colSpan={3}>สินค้าสำเร็จรูปที่ผลิตได้</th>
            <th colSpan={3} className="input-output-waste-cell">ของเสีย (กก.)</th>
          </tr>
          <tr className="input-output-print-table-header">
            <th>รหัส / ชื่อเปลือก</th><th><LotHeader /></th><th>จำนวน</th><th>น้ำหนัก (กก.)</th>
            <th>ชื่อแยม</th><th><LotHeader /></th><th>จำนวน</th><th>น้ำหนัก (กก.)</th>
            <th>รหัส / ชื่อสินค้า</th><th>จำนวน</th><th>น้ำหนัก (กก.)</th>
            <th className="input-output-waste-cell">ป้าย</th><th className="input-output-waste-cell">หัก</th><th className="input-output-waste-cell">ไหม้</th>
          </tr>
        </thead>
        {warnings.length ? (
          <tbody>
            <tr className="input-output-print-warning-row"><td colSpan={15}>{warnings.map((item) => `${item.source}: ${item.message}`).join(" • ")}</td></tr>
          </tbody>
        ) : null}
        {reportDays.map((day) => {
            const productionRows = Array.isArray(day.rows) ? day.rows : [];
            const jams = Array.isArray(day.jams) ? day.jams : [];
            const rowCount = Math.max(productionRows.length, jams.length, 1);

            return (
              <tbody key={day.date} className="input-output-print-day-group">
                <tr className="input-output-print-date-row"><td colSpan={15}>วันที่ {formatThaiDate(day.date)}</td></tr>
                {Array.from({ length: rowCount }, (_, index) => {
                  const production = productionRows[index] || null;
                  const jam = jams[index] || null;
                  const showShell = Boolean(production?.shellCode && hasMeasuredValue(production.shellQuantity, production.shellWeightKg));
                  const showWaste = Boolean(production?.fgCode && Number(production.wasteWeightKg || 0) !== 0);
                  const showFg = Boolean(production?.fgCode && hasMeasuredValue(production.fgQuantity, production.fgWeightKg));

                  return (
                    <tr key={`${day.date}-${index}`} className={`input-output-print-data-row${index === rowCount - 1 ? " input-output-print-last-data-row" : ""}`}>
                      <td>{index + 1}</td>
                      <td>{showShell ? <span className="input-output-print-product-name">{production.shellCode} - {production.shellName}</span> : "—"}</td><td className="input-output-lot-cell"><LotBreakdown lots={production?.shellLots} visible={showShell} /></td><td className="text-center">{showShell ? formatQuantity(production.shellQuantity) : "—"}</td><td className="text-center">{showShell ? formatNumber(production.shellWeightKg) : "—"}</td>
                      <td>{jam?.name || "—"}</td><td className="input-output-lot-cell"><LotBreakdown lots={jam?.lots} visible={Boolean(jam)} /></td><td className="text-center">{jam ? formatQuantity(jam.quantity) : "—"}</td><td className="text-center">{jam ? formatNumber(jam.weightKg) : "—"}</td>
                      <td>{showFg ? <span className="input-output-print-product-name">{production.fgCode} - {production.fgName}</span> : "—"}</td><td className="text-center">{showFg ? formatQuantity(production.fgQuantity) : "—"}</td><td className="text-center">{showFg ? formatNumber(production.fgWeightKg) : "—"}</td>
                      <td className="input-output-waste-cell">{showWaste ? formatNumber(production.labelScrapWeightKg) : "—"}</td><td className="input-output-waste-cell">{showWaste ? formatNumber(production.brokenScrapWeightKg) : "—"}</td><td className="input-output-waste-cell">{showWaste ? formatNumber(production.burntScrapWeightKg) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
      </table>
    </div>
  );
}

function CompactPrintReport(props) {
  return (
    <article className="input-output-compact-report">
      <CompactPrintSheet {...props} />
    </article>
  );
}

export default function ProductionInputOutputReportPageClient({ initialData }) {
  const router = useRouter();
  const profile = useUserProfile();
  const [isPending, startTransition] = useTransition();
  const [dateFrom, setDateFrom] = useState(initialData?.filters?.dateFrom || "");
  const [dateTo, setDateTo] = useState(initialData?.filters?.dateTo || "");
  const [printMode, setPrintMode] = useState(PRINT_MODE_COMPACT);
  const pages = useMemo(() => buildPages(initialData?.days), [initialData?.days]);
  const warnings = Array.isArray(initialData?.warnings) ? initialData.warnings : [];

  const applyFilters = () => {
    const params = new URLSearchParams();
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    startTransition(() => {
      router.push(`/production-line/attendance/report/input-output?${params.toString()}`);
    });
  };

  return (
    <div className={`${styles.reportRoot} ${printMode === PRINT_MODE_COMPACT ? styles.compactPrint : styles.dailyPrint} min-h-screen bg-[#f4f6f8] text-slate-900`}>
      <div className="input-output-screen-only">
        <WeightScalePrimaryHeader
          eyebrow="รายงานไลน์การผลิต"
          badge="วัตถุดิบและผลผลิต"
          title="รายงานสรุปวัตถุดิบและผลผลิตประจำวัน"
          description="สรุปเปลือกใช้จริง แยมใช้จริงหลังหักใบคืน ของเสีย และ FG ที่ได้ โดยเชื่อมความสัมพันธ์จาก BOM"
        />

        <div className="mx-auto w-full max-w-[84rem] px-4 py-6 sm:px-6 lg:px-8">
          <section className="border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-700"><CalendarRange size={15} /> จากวันที่</span>
                  <input type="date" value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} className="h-10 min-w-52 border border-slate-300 px-3 text-sm outline-none focus:border-[#d4af37]" />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="inline-flex items-center gap-2 text-xs font-bold text-slate-700"><CalendarRange size={15} /> ถึงวันที่</span>
                  <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} className="h-10 min-w-52 border border-slate-300 px-3 text-sm outline-none focus:border-[#d4af37]" />
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <label className="flex h-10 items-center gap-2 border border-slate-300 bg-white px-3">
                  <span className="text-xs font-bold text-slate-700">รูปแบบพิมพ์</span>
                  <select
                    value={printMode}
                    onChange={(event) => setPrintMode(event.target.value)}
                    className="h-8 bg-transparent text-sm font-semibold text-slate-900 outline-none"
                    aria-label="รูปแบบการพิมพ์รายงาน"
                  >
                    <option value={PRINT_MODE_COMPACT}>ประหยัดกระดาษ</option>
                    <option value={PRINT_MODE_DAILY}>แยกวันละแผ่น</option>
                  </select>
                </label>
                <button type="button" onClick={applyFilters} disabled={isPending} className="inline-flex h-10 items-center gap-2 bg-[#102C57] px-5 text-sm font-bold text-white transition hover:bg-[#173b70] disabled:opacity-60">
                  <RefreshCw size={16} className={isPending ? "animate-spin" : ""} /> แสดงรายงาน
                </button>
                <button type="button" onClick={() => window.print()} disabled={!pages.length} className="inline-flex h-10 items-center gap-2 border border-[#102C57] px-5 text-sm font-bold text-[#102C57] transition hover:bg-slate-50 disabled:opacity-40">
                  <Printer size={16} /> พิมพ์ A4 แนวนอน
                </button>
              </div>
            </div>
          </section>

          {warnings.length ? (
            <div className="mt-4 flex items-start gap-3 border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-bold">ข้อมูลบางแหล่งโหลดไม่สำเร็จ รายงานจะแสดงคำเตือนบนกระดาษและไม่สร้างยอดทดแทน</div>
                <ul className="mt-1 list-disc pl-5 text-xs">
                  {warnings.map((warning) => <li key={`${warning.source}-${warning.message}`}>{warning.source}: {warning.message}</li>)}
                </ul>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {printMode === PRINT_MODE_DAILY ? (
        <main className="input-output-report-pages flex flex-col gap-6 overflow-x-auto px-3 pb-10 sm:px-6">
          {pages.length ? pages.map((page) => (
            <ReportSheet
              key={`${page.date}-${page.dayPage}`}
              page={page}
              generatedAt={initialData.generatedAt}
              username={profile.username}
              departmentName={initialData?.scope?.departmentName}
              warnings={warnings}
            />
          )) : (
            <div className="mx-auto w-full max-w-3xl border border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500 shadow-sm">
              ไม่พบข้อมูลในช่วงวันที่ที่เลือก
            </div>
          )}
        </main>
      ) : pages.length ? (
        <div className="input-output-screen-report">
          <CompactPrintSheet
            days={initialData?.days}
            generatedAt={initialData.generatedAt}
            username={profile.username}
            departmentName={initialData?.scope?.departmentName}
            warnings={warnings}
            dateFrom={initialData?.filters?.dateFrom}
            dateTo={initialData?.filters?.dateTo}
          />
        </div>
      ) : (
        <div className="mx-auto w-full max-w-3xl border border-slate-200 bg-white px-6 py-16 text-center text-sm text-slate-500 shadow-sm">
          ไม่พบข้อมูลในช่วงวันที่ที่เลือก
        </div>
      )}

      {pages.length ? (
        <div className="input-output-print-only">
          <CompactPrintReport
            days={initialData?.days}
            generatedAt={initialData.generatedAt}
            username={profile.username}
            departmentName={initialData?.scope?.departmentName}
            warnings={warnings}
            dateFrom={initialData?.filters?.dateFrom}
            dateTo={initialData?.filters?.dateTo}
          />
        </div>
      ) : null}

    </div>
  );
}
