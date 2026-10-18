"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarRange,
  Download,
  Printer,
  RefreshCw,
} from "lucide-react";
import WeightScalePrimaryHeader from "@/features/production-line/components/WeightScalePrimaryHeader";
import { useUserProfile } from "@/lib/useUserProfile";
import { ReportHeader, ReportFilterBar } from "@/components/print";
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

function serializeReportModuleCssRules(rules, moduleClassNames) {
  let css = "";

  for (const rule of rules) {
    if (rule.cssRules) {
      const nestedCss = serializeReportModuleCssRules(rule.cssRules, moduleClassNames);
      if (nestedCss) {
        css += `${rule.cssText.slice(0, rule.cssText.indexOf("{"))}{${nestedCss}}\n`;
      }
      continue;
    }

    if (rule.selectorText) {
      const belongsToReport = moduleClassNames.some((className) =>
        rule.selectorText.includes(`.${CSS.escape(className)}`)
      );
      if (belongsToReport) css += `${rule.cssText}\n`;
      continue;
    }

    if (rule.cssText.startsWith("@page")) css += `${rule.cssText}\n`;
  }

  return css;
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
  const hasRows = page.rows.length > 0;
  const rowCount = page.rows.length;
  const displayRows = Array.from({ length: rowCount }, (_, index) => ({
    production: page.rows[index] || null,
    jam: page.rows[index]?.jam || null,
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
        <tr className="bg-[#f8f9fa] text-[#1a1c1e]">
          <th rowSpan={2}>#</th>
          <th colSpan={5} className="border-l border-l-slate-200">เปลือกที่ใช้จริง</th>
          <th colSpan={4} className="border-l border-l-slate-200">แยมใช้จริง</th>
          <th colSpan={4} className="border-l border-l-slate-200">WIP / FG ปลายทางและผลผลิต</th>
          <th colSpan={3} className="input-output-waste-cell border-l border-l-slate-200">ของเสีย (กก.)</th>
        </tr>
        <tr className="bg-[#f8f9fa] text-[#1a1c1e] font-bold border-b-2 border-[#1a1c1e]">
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
          const showDestination = Boolean(production?.fgCode);

          return (
            <tr key={`${page.date}-${page.dayPage}-${index}`} className="input-output-data-row hover:bg-slate-50/50">
              <td className="bg-slate-50/40 text-center font-bold text-slate-400">{index + 1}</td>

              <td className="border-l border-l-slate-200 text-center font-mono whitespace-nowrap">{showShell ? production.shellCode : "—"}</td>
              <td className="text-left">
                <span className="input-output-product-name">{showShell ? production.shellName : "—"}</span>
                {showShell && production.destinationRoomName ? (
                  <span className="mt-0.5 block text-[10px] font-bold text-amber-700">{production.destinationRoomName}</span>
                ) : null}
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

              <td className="border-l border-l-slate-200 bg-slate-50/20 text-center font-mono whitespace-nowrap">{showDestination ? production.fgCode : "—"}</td>
              <td className="bg-slate-50/20 text-left">
                <span className="input-output-product-name">{showDestination ? production.fgName : "—"}</span>
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
            <td colSpan={2} className="border-l border-l-slate-300 text-right">รวมผลผลิต:</td>
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
      <header className="pb-1">
        <ReportHeader
          title="รายงานสรุปวัตถุดิบและผลผลิตประจำวัน"
          subtitle="DAILY RAW MATERIAL & OUTPUT REPORT"
          meta={[
            { label: "ประจำวันที่", value: formatThaiDate(page.date) },
            { label: "แผนก", value: departmentName || "แผนกผลิต" },
          ]}
          printedAt={formatPrintedAt(generatedAt)}
          printedBy={username || "System"}
          page={page.dayPage}
          totalPages={page.dayPageCount}
          variant="block"
        />
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
          <ReportHeader
            title="รายงานสรุปวัตถุดิบและผลผลิต"
            subtitle="RAW MATERIAL & OUTPUT SUMMARY REPORT"
            meta={[
              { label: "แผนก", value: departmentName || "แผนกผลิต" },
              { label: "ช่วงวันที่", value: `${formatThaiDate(dateFrom)} ถึง ${formatThaiDate(dateTo)}` },
            ]}
            printedAt={formatPrintedAt(generatedAt)}
            printedBy={username || "System"}
            variant="table-rows"
            colSpan={15}
          />
          <tr className="input-output-print-table-header">
            <th rowSpan={2}>#</th>
            <th colSpan={4}>เปลือกที่ใช้จริง</th>
            <th colSpan={4}>แยมใช้จริง</th>
            <th colSpan={3}>WIP / FG ปลายทางและผลผลิต</th>
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
            const rowCount = Math.max(productionRows.length, 1);

            return (
              <tbody key={day.date} className="input-output-print-day-group">
                <tr className="input-output-print-date-row"><td colSpan={15}>วันที่ {formatThaiDate(day.date)}</td></tr>
                {Array.from({ length: rowCount }, (_, index) => {
                  const production = productionRows[index] || null;
                  const jam = production?.jam || null;
                  const showShell = Boolean(production?.shellCode && hasMeasuredValue(production.shellQuantity, production.shellWeightKg));
                  const showWaste = Boolean(production?.fgCode && Number(production.wasteWeightKg || 0) !== 0);
                  const showFg = Boolean(production?.fgCode && hasMeasuredValue(production.fgQuantity, production.fgWeightKg));
                  const showDestination = Boolean(production?.fgCode);

                  return (
                    <tr key={`${day.date}-${index}`} className={`input-output-print-data-row${index === rowCount - 1 ? " input-output-print-last-data-row" : ""}`}>
                      <td>{index + 1}</td>
                      <td>{showShell ? <span className="input-output-print-product-name">{production.shellCode} - {production.shellName}{production.destinationRoomName ? ` (${production.destinationRoomName})` : ""}</span> : "—"}</td><td className="input-output-lot-cell"><LotBreakdown lots={production?.shellLots} visible={showShell} /></td><td className="text-center">{showShell ? formatQuantity(production.shellQuantity) : "—"}</td><td className="text-center">{showShell ? formatNumber(production.shellWeightKg) : "—"}</td>
                      <td>{jam?.name || "—"}</td><td className="input-output-lot-cell"><LotBreakdown lots={jam?.lots} visible={Boolean(jam)} /></td><td className="text-center">{jam ? formatQuantity(jam.quantity) : "—"}</td><td className="text-center">{jam ? formatNumber(jam.weightKg) : "—"}</td>
                      <td>{showDestination ? <span className="input-output-print-product-name">{production.fgCode} - {production.fgName}</span> : "—"}</td><td className="text-center">{showFg ? formatQuantity(production.fgQuantity) : "—"}</td><td className="text-center">{showFg ? formatNumber(production.fgWeightKg) : "—"}</td>
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

export default function ProductionInputOutputReportPageClient({ initialData, reportCenter = false }) {
  const router = useRouter();
  const profile = useUserProfile();
  const [isPending, startTransition] = useTransition();
  const [dateFrom, setDateFrom] = useState(initialData?.filters?.dateFrom || "");
  const [dateTo, setDateTo] = useState(initialData?.filters?.dateTo || "");
  const [printMode, setPrintMode] = useState(PRINT_MODE_COMPACT);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isPrintingPdf, setIsPrintingPdf] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const pages = useMemo(() => buildPages(initialData?.days), [initialData?.days]);
  const warnings = Array.isArray(initialData?.warnings) ? initialData.warnings : [];

  const generatePdfBlob = async () => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 150_000);

    try {
      const reportRoot = document.querySelector("[data-print-report-root]");
      if (!reportRoot) throw new Error("ไม่พบเนื้อหารายงานสำหรับสร้าง PDF");

      const reportClone = reportRoot.cloneNode(true);
      reportClone.querySelectorAll(".input-output-screen-only, .input-output-screen-report")
        .forEach((element) => element.remove());
      reportClone.querySelectorAll("img").forEach((image) => {
        image.setAttribute("src", "/brand/LOGO-KPF1.png");
        image.removeAttribute("srcset");
        image.removeAttribute("sizes");
      });

      const stylesheetPaths = [];
      const inlineStyles = [];
      const reportModuleClasses = Array.from(reportRoot.classList);
      for (const stylesheet of document.styleSheets) {
        if (!stylesheet.href) {
          const reportCss = serializeReportModuleCssRules(
            stylesheet.cssRules,
            reportModuleClasses
          );
          if (reportCss) inlineStyles.push(reportCss);
          continue;
        }

        const stylesheetUrl = new URL(stylesheet.href, window.location.href);
        if (
          stylesheetUrl.origin === window.location.origin
          && stylesheetUrl.pathname.startsWith("/_next/static/")
        ) {
          const pathWithSearch = `${stylesheetUrl.pathname}${stylesheetUrl.search}`;
          if (!stylesheetPaths.includes(pathWithSearch)) {
            stylesheetPaths.push(pathWithSearch);
          }
        }
      }

      const response = await fetch(
        "/api/production-line/attendance/report/input-output/pdf",
        {
          method: "POST",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            dateFrom: initialData?.filters?.dateFrom || dateFrom,
            dateTo: initialData?.filters?.dateTo || dateTo,
            html: reportClone.outerHTML,
            bodyClass: document.body.className,
            stylesheetPaths: Array.from(new Set(stylesheetPaths)),
            inlineCss: inlineStyles.join("\n"),
          }),
          signal: controller.signal,
        }
      );
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload?.error || "ไม่สามารถสร้างไฟล์ PDF ได้");
      }

      const pdfBlob = await response.blob();
      if (pdfBlob.type !== "application/pdf") {
        throw new Error("เซิร์ฟเวอร์ไม่ได้ส่งไฟล์ PDF กลับมา");
      }

      return pdfBlob;
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const downloadPdfReport = async () => {
    setPdfError("");
    setIsDownloadingPdf(true);

    try {
      const pdfBlob = await generatePdfBlob();
      const blobUrl = URL.createObjectURL(pdfBlob);
      const link = document.createElement("a");
      link.href = blobUrl;
      const fileDateFrom = initialData?.filters?.dateFrom || dateFrom || "start";
      const fileDateTo = initialData?.filters?.dateTo || dateTo || "end";
      link.download = `รายงานวัตถุดิบและผลผลิต_${fileDateFrom}_${fileDateTo}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    } catch (error) {
      setPdfError(
        error?.name === "AbortError"
          ? "สร้าง PDF ใช้เวลานานเกินไป กรุณาลองใหม่"
          : error?.message || "ไม่สามารถสร้างไฟล์ PDF ได้"
      );
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const printReport = async () => {
    setPdfError("");
    setIsPrintingPdf(true);

    try {
      const pdfBlob = await generatePdfBlob();
      const blobUrl = URL.createObjectURL(pdfBlob);

      let printFrame = document.getElementById("pdf-silent-print-frame");
      if (printFrame) {
        printFrame.remove();
      }
      printFrame = document.createElement("iframe");
      printFrame.id = "pdf-silent-print-frame";
      printFrame.style.position = "fixed";
      printFrame.style.right = "0";
      printFrame.style.bottom = "0";
      printFrame.style.width = "4px";
      printFrame.style.height = "4px";
      printFrame.style.opacity = "0.01";
      printFrame.style.border = "none";
      printFrame.style.pointerEvents = "none";
      printFrame.src = blobUrl;
      document.body.appendChild(printFrame);

      let printed = false;
      const triggerPrint = () => {
        if (printed) return;
        printed = true;
        try {
          printFrame.contentWindow?.focus();
          printFrame.contentWindow?.print();
        } catch (e) {
          console.error("Print frame error:", e);
        } finally {
          setIsPrintingPdf(false);
          window.setTimeout(() => {
            printFrame?.remove();
            URL.revokeObjectURL(blobUrl);
          }, 60_000);
        }
      };

      printFrame.onload = () => {
        window.setTimeout(triggerPrint, 600);
      };
      window.setTimeout(triggerPrint, 1500);
    } catch (error) {
      setIsPrintingPdf(false);
      setPdfError(
        error?.name === "AbortError"
          ? "สร้าง PDF ใช้เวลานานเกินไป กรุณาลองใหม่"
          : error?.message || "ไม่สามารถสร้างไฟล์ PDF ได้"
      );
    }
  };

  const exportToExcel = async () => {
    try {
      const excelModule = await import("exceljs/dist/exceljs.min.js");
      const ExcelJS = excelModule?.default || excelModule;
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "KPF Production Line";
      workbook.created = new Date();

      const worksheet = workbook.addWorksheet("รายงานสรุปวัตถุดิบและผลผลิต");
      const columns = [
        { header: "ลำดับ", key: "seq", width: 8 },
        { header: "วันที่", key: "date", width: 14 },
        { header: "รหัสเปลือก", key: "shellCode", width: 14 },
        { header: "ชื่อเปลือก", key: "shellName", width: 28 },
        { header: "ห้องปลายทาง", key: "destinationRoomName", width: 18 },
        { header: "LOT เปลือก", key: "shellLots", width: 24 },
        { header: "จำนวนเปลือก", key: "shellQty", width: 14 },
        { header: "น้ำหนักเปลือก (กก.)", key: "shellWeightKg", width: 18 },
        { header: "ชื่อแยม", key: "jamName", width: 24 },
        { header: "LOT แยม", key: "jamLots", width: 24 },
        { header: "จำนวนแยม", key: "jamQty", width: 14 },
        { header: "น้ำหนักแยม (กก.)", key: "jamWeightKg", width: 18 },
        { header: "รหัสสินค้า FG", key: "fgCode", width: 16 },
        { header: "ชื่อสินค้า FG", key: "fgName", width: 28 },
        { header: "จำนวน FG", key: "fgQty", width: 14 },
        { header: "น้ำหนัก FG (กก.)", key: "fgWeightKg", width: 18 },
        { header: "ของเสีย: ป้าย (กก.)", key: "labelScrapKg", width: 18 },
        { header: "ของเสีย: หัก (กก.)", key: "brokenScrapKg", width: 18 },
        { header: "ของเสีย: ไหม้ (กก.)", key: "burntScrapKg", width: 18 },
      ];

      worksheet.columns = columns;

      const lastCol = String.fromCharCode(64 + columns.length);
      worksheet.mergeCells(`A1:${lastCol}1`);
      worksheet.getCell("A1").value = "รายงานสรุปวัตถุดิบและผลผลิตประจำวัน";
      worksheet.getCell("A1").font = { size: 16, bold: true, color: { argb: "FF102C57" } };

      worksheet.mergeCells(`A2:${lastCol}2`);
      worksheet.getCell("A2").value = `แผนก: ${initialData?.scope?.departmentName || "แผนกผลิต"} | ช่วงวันที่: ${formatThaiDate(initialData?.filters?.dateFrom || dateFrom)} ถึง ${formatThaiDate(initialData?.filters?.dateTo || dateTo)}`;
      worksheet.getCell("A2").font = { size: 11, color: { argb: "FF3A4A5E" } };

      const headerRow = worksheet.getRow(4);
      headerRow.values = columns.map((c) => c.header);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.alignment = { vertical: "middle", horizontal: "center" };
      headerRow.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF102C57" },
      };
      headerRow.height = 24;

      let seq = 1;
      const reportDays = Array.isArray(initialData?.days) ? initialData.days : [];

      for (const day of reportDays) {
        const productionRows = Array.isArray(day.rows) ? day.rows : [];
        for (const production of productionRows) {
          const jam = production?.jam || null;
          const shellLotsText = Array.isArray(production?.shellLots)
            ? production.shellLots.map((l) => `${l.lotNo} (${l.weightKg}kg)`).join(", ")
            : "";
          const jamLotsText = Array.isArray(jam?.lots)
            ? jam.lots.map((l) => `${l.lotNo} (${l.weightKg}kg)`).join(", ")
            : "";

          worksheet.addRow({
            seq: seq++,
            date: day.date,
            shellCode: production?.shellCode || "",
            shellName: production?.shellName || "",
            destinationRoomName: production?.destinationRoomName || "",
            shellLots: shellLotsText,
            shellQty: production?.shellQuantity || 0,
            shellWeightKg: production?.shellWeightKg || 0,
            jamName: jam?.name || "",
            jamLots: jamLotsText,
            jamQty: jam?.quantity || 0,
            jamWeightKg: jam?.weightKg || 0,
            fgCode: production?.fgCode || "",
            fgName: production?.fgName || "",
            fgQty: production?.fgQuantity || 0,
            fgWeightKg: production?.fgWeightKg || 0,
            labelScrapKg: production?.labelScrapWeightKg || 0,
            brokenScrapKg: production?.brokenScrapWeightKg || 0,
            burntScrapKg: production?.burntScrapWeightKg || 0,
          });
        }
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const fileDateFrom = initialData?.filters?.dateFrom || dateFrom || "start";
      const fileDateTo = initialData?.filters?.dateTo || dateTo || "end";
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `รายงานวัตถุดิบและผลผลิต_${fileDateFrom}_${fileDateTo}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      console.error("Export Excel error:", err);
      alert("ไม่สามารถส่งออก Excel ได้: " + (err?.message || ""));
    }
  };

  const applyFilters = () => {
    const params = new URLSearchParams();
    if (reportCenter) params.set("reportCenter", "1");
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    startTransition(() => {
      router.push(`/production-line/attendance/report/input-output?${params.toString()}`);
    });
  };

  return (
    <div data-print-report-root className={`${styles.reportRoot} ${printMode === PRINT_MODE_COMPACT ? styles.compactPrint : styles.dailyPrint} min-h-screen bg-[#f4f6f8] text-slate-900`}>
      <div className="input-output-screen-only">
        <WeightScalePrimaryHeader
          eyebrow="รายงานไลน์การผลิต"
          badge="วัตถุดิบและผลผลิต"
          title="รายงานสรุปวัตถุดิบและผลผลิตประจำวัน"
          description="สรุปเปลือกใช้จริง แยมใช้จริงหลังหักใบคืน ของเสีย และ FG ที่ได้ โดยเชื่อมความสัมพันธ์จาก BOM"
        />

        <div className="mx-auto w-full max-w-[84rem] px-4 py-6 sm:px-6 lg:px-8">
          <ReportFilterBar
            dateMode="range"
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            isLoading={isPending}
            onSearch={applyFilters}
            searchButtonLabel="แสดงรายงาน"
            onPrint={printReport}
            printButtonLabel={isPrintingPdf ? "กำลังเตรียม..." : "พิมพ์ A4"}
            onExportExcel={exportToExcel}
            excelButtonLabel="ส่งออก Excel"
            extraActions={
              <button
                type="button"
                onClick={downloadPdfReport}
                disabled={!pages.length || isDownloadingPdf}
                className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-[var(--surface-navy,#102C57)] px-3 text-xs font-bold text-white shadow-sm transition hover:bg-[#183b63] disabled:cursor-not-allowed disabled:opacity-60"
                title="ดาวน์โหลด PDF"
              >
                <Download size={14} className={isDownloadingPdf ? "animate-spin" : ""} />
                <span className="hidden sm:inline">{isDownloadingPdf ? "กำลังสร้าง..." : "PDF"}</span>
              </button>
            }
          >
            <div className="w-full sm:w-auto">
              <label className="block text-[11px] font-black uppercase tracking-wider text-[#64748b] mb-1">
                รูปแบบพิมพ์
              </label>
              <div className="relative flex h-10 items-center rounded-md border border-[#cbd5e1] bg-[#f8fafc] px-3 focus-within:border-[#102C57] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#102C57]/10 transition">
                <select
                  value={printMode}
                  onChange={(event) => setPrintMode(event.target.value)}
                  className="bg-transparent text-[13px] font-semibold text-[#102C57] outline-none cursor-pointer"
                  aria-label="รูปแบบการพิมพ์รายงาน"
                >
                  <option value={PRINT_MODE_COMPACT}>ประหยัดกระดาษ</option>
                  <option value={PRINT_MODE_DAILY}>แยกวันละแผ่น</option>
                </select>
              </div>
            </div>
          </ReportFilterBar>

          {pdfError ? (
            <div role="alert" className="mt-4 border border-rose-300 bg-rose-50 p-3 text-sm font-semibold text-rose-800">
              {pdfError}
            </div>
          ) : null}

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
