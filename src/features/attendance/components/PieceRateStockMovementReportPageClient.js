"use client";

console.log("[PieceRateStockReportClient] Module file initialized.");

import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useUserProfile } from "@/lib/useUserProfile";
import { paginateReportItems } from "@/features/attendance/utils/paginateReportItems";
import { buildPieceRateIssueSummaryRows } from "@/features/attendance/utils/buildPieceRateIssueSummaryRows";
import {
  ArrowLeft,
  Boxes,
  ChevronDown,
  ClipboardList,
  Download,
  FileDown,
  PackageCheck,
  PackageMinus,
  Printer,
  RefreshCw,
  Search,
  Shuffle,
} from "lucide-react";

const REPORT_TABS = [
  { key: "inbound", label: "รายงานรับเข้า WIP", icon: PackageCheck },
  { key: "inbound-fg", label: "รายงาน FG ผลิตเสร็จ", icon: PackageCheck },
  { key: "issue", label: "รายงานเบิก", icon: PackageMinus },
  { key: "movement", label: "รายงานเคลื่อนไหว", icon: Shuffle },
  { key: "balance", label: "รายงานคงเหลือ", icon: Boxes },
  { key: "prison", label: "รายงานเรือนจำ", icon: ClipboardList },
];

const MOVEMENT_GROUPS = [
  ["opening", "ยกยอด"],
  ["inbound", "รับเข้า"],
  ["issue", "เบิก"],
  ["return", "ชั่งคืน"],
  ["waste", "ของเสีย"],
  ["actual", "ใช้จริง"],
  ["balance", "คงเหลือ"],
];

const MOVEMENT_SCREEN_PAGE_SIZE = 20;
const PIECE_RATE_REPORT_START_DATE = "2026-08-11";

const REPORT_TYPES = new Set(REPORT_TABS.map((tab) => tab.key));

function today(offset = 0) {
  const date = new Date(Date.now() + offset * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatQty(value) {
  const numeric = Number(value || 0);
  if (!numeric) return "-";
  return numeric.toLocaleString("th-TH", {
    maximumFractionDigits: 0,
  });
}

function formatWeight(value, digits = 3) {
  const numeric = Number(value || 0);
  if (!numeric) return "-";
  return numeric.toLocaleString("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

function formatSummaryGroupDateLabel(dateStr) {
  if (!dateStr || dateStr === "-") return "-";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const [yearText, monthText, dayText] = parts;
  const buddhistYear = String(Number(yearText) + 543).slice(-2);
  return `${dayText}/${monthText}/${buddhistYear}`;
}

function getReportTitle(reportType) {
  if (reportType === "inbound") return "รายงานรับเข้าป้ายแยม (WIP)";
  if (reportType === "inbound-fg") return "รายงาน FG ที่ผลิตเสร็จ";
  if (reportType === "issue") return "รายงานเบิกป้ายแยม";
  if (reportType === "balance") return "รายงานคงเหลือป้ายแยม";
  if (reportType === "prison") return "รายงานรับเข้า–เบิกเรือนจำ";
  return "รายงานเคลื่อนไหวสต็อกป้ายแยม";
}

function normalizeReportType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return REPORT_TYPES.has(normalized) ? normalized : "inbound";
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

function ReportHeader({ reportType, dateFrom, dateTo, summary }) {
  const title = getReportTitle(reportType);
  return (
    <div className="report-title-section">
      <div>
        <div className="report-kicker">JAM LABEL STOCK REPORT</div>
        <h1>{title}</h1>
        <p>ช่วงวันที่ {dateFrom} ถึง {dateTo} · ข้อมูลแยกตามสินค้าและ LOT</p>
      </div>
      <div className="report-summary-text">
        <span>จำนวนรายการ</span>
        <strong>{Number(summary?.count || 0).toLocaleString("th-TH")}</strong>
      </div>
    </div>
  );
}

function SummaryCards({ reportType, summary }) {
  if (reportType === "balance") {
    return (
      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label="จำนวนคงเหลือ" value={`${formatQty(summary?.balanceQty)} รายการ`} />
        <MetricCard label="น้ำหนักคงเหลือ" value={`${formatWeight(summary?.balanceWeightKg)} kg`} tone="gold" />
        <MetricCard label="จำนวน LOT" value={`${Number(summary?.count || 0).toLocaleString("th-TH")} LOT`} />
      </div>
    );
  }

  if (reportType === "inbound" || reportType === "inbound-fg") {
    const isFg = reportType === "inbound-fg";
    return (
      <div className="grid gap-3 md:grid-cols-3">
        <MetricCard label={isFg ? "รายการ FG ผลิตเสร็จ" : "รายการรับเข้า"} value={`${Number(summary?.count || 0).toLocaleString("th-TH")} รายการ`} />
        <MetricCard label={isFg ? "จำนวน FG ผลิตเสร็จ" : "จำนวนรับเข้า"} value={`${formatQty(summary?.inboundQty)} รายการ`} />
        <MetricCard label={isFg ? "น้ำหนัก FG ผลิตเสร็จ" : "น้ำหนักรับเข้า"} value={`${formatWeight(summary?.inboundWeightKg)} kg`} tone="gold" />
      </div>
    );
  }

  if (reportType === "issue") {
    return (
      <div className="grid gap-3 md:grid-cols-4">
        <MetricCard label="รายการเบิก/คืน" value={`${Number(summary?.count || 0).toLocaleString("th-TH")} รายการ`} />
        <MetricCard label="เบิก" value={`${formatWeight(summary?.issueWeightKg)} kg`} />
        <MetricCard label="ชั่งคืน" value={`${formatWeight(summary?.returnWeightKg)} kg`} />
        <MetricCard label="ใช้จริงสุทธิ" value={`${formatWeight((summary?.issueWeightKg || 0) - (summary?.returnWeightKg || 0))} kg`} tone="gold" />
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-4">
      <MetricCard label="จำนวน LOT" value={`${Number(summary?.count || 0).toLocaleString("th-TH")} LOT`} />
      <MetricCard label="รับเข้า" value={`${formatWeight(summary?.inboundWeightKg)} kg`} />
      <MetricCard label="ใช้จริง" value={`${formatWeight(summary?.actualWeightKg)} kg`} />
      <MetricCard label="คงเหลือ" value={`${formatWeight(summary?.balanceWeightKg)} kg`} tone="gold" />
    </div>
  );
}

function EmptyRow({ colSpan, isLoading }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12 text-center text-sm font-bold text-slate-500">
        {isLoading ? (
          <span className="inline-flex items-center gap-2">
            <RefreshCw className="animate-spin" size={18} />
            กำลังโหลดข้อมูล
          </span>
        ) : "ไม่พบข้อมูลในช่วงที่เลือก"}
      </td>
    </tr>
  );
}

function DetailTable({ rows = [], isLoading, reportType }) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const isIssue = reportType === "issue";

  if (isIssue) {
    return (
      <div className="report-table-wrap">
        <table className="report-table detail-report-table">
          <thead>
            <tr>
              <th className="w-[48px]">#</th>
              <th className="min-w-[130px] text-left">วันเวลาเบิก</th>
              <th className="min-w-[125px] text-left">บาร์โค้ดป้าย</th>
              <th className="min-w-[180px] text-left">สินค้า WIP</th>
              <th className="min-w-[120px] text-left">LOT</th>
              <th className="min-w-[180px] text-left">สินค้า FG ที่ผลิต</th>
              <th className="w-[88px] text-right">น้ำหนักเบิก</th>
              <th className="min-w-[120px] text-left">หมายเหตุ</th>
            </tr>
          </thead>
          <tbody>
            {isLoading || !safeRows.length ? <EmptyRow colSpan={8} isLoading={isLoading} /> : null}
            {!isLoading && safeRows.map((row, index) => {
              const weight = row.weightOutKg || row.weightInKg;
              return (
                <tr key={row.id || `${row.kind}-${row.movementNo || row.documentNo || index}-${row.productCode}-${row.lotNo}`}>
                  <td className="text-center">{index + 1}</td>
                  <td className="whitespace-nowrap">{formatDateTime(row.movementAt)}</td>
                  <td className="font-mono text-[12px]">{row.barcode || "-"}</td>
                  <td>
                    <div className="font-bold text-[#0b2d55]">{row.productCode}</div>
                    <div className="line-clamp-2 text-[11px] leading-tight text-slate-700">{row.productName}</div>
                  </td>
                  <td className="font-mono text-[12px]">{row.lotNo || "-"}</td>
                  <td>
                    {row.fgProductCode ? (
                      <>
                        <div className="font-bold text-amber-800">{row.fgProductCode}</div>
                        <div className="line-clamp-2 text-[11px] leading-tight text-amber-900/80">{row.fgProductName}</div>
                      </>
                    ) : (
                      <span className="text-slate-400 font-medium text-[11px]">-</span>
                    )}
                  </td>
                  <td className="text-right font-black text-[#0b2d55]">{formatWeight(weight, 3)}</td>
                  <td className="text-[11px] text-slate-500 max-w-[150px] truncate">{row.remark || "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="report-table-wrap">
      <table className="report-table detail-report-table">
        <thead>
          <tr>
            <th className="w-[48px]">#</th>
            <th className="min-w-[130px] text-left">วันเวลา</th>
            <th className="min-w-[105px] text-left">ประเภท</th>
            <th className="min-w-[155px] text-left">เลขเอกสาร</th>
            <th className="min-w-[125px] text-left">บาร์โค้ด</th>
            <th className="min-w-[220px] text-left">สินค้า</th>
            <th className="min-w-[120px] text-left">LOT</th>
            <th className="w-[72px] text-right">จำนวน</th>
            <th className="w-[88px] text-right">น้ำหนัก</th>
            <th className="min-w-[150px] text-left">พนักงาน</th>
          </tr>
        </thead>
        <tbody>
          {isLoading || !safeRows.length ? <EmptyRow colSpan={10} isLoading={isLoading} /> : null}
          {!isLoading && safeRows.map((row, index) => {
            const qty = row.kind === "issue" ? row.quantityOut : row.quantityIn || row.quantityOut;
            const weight = row.kind === "issue" ? row.weightOutKg : row.weightInKg || row.weightOutKg;
            return (
              <tr key={row.id || `${row.kind}-${row.movementNo || row.documentNo || index}-${row.productCode}-${row.lotNo}`}>
                <td className="text-center">{index + 1}</td>
                <td className="whitespace-nowrap">{formatDateTime(row.movementAt)}</td>
                <td className="font-black">{row.kindLabel}</td>
                <td className="font-mono text-[12px]">{row.documentNo || row.movementNo || "-"}</td>
                <td className="font-mono text-[12px]">{row.barcode || "-"}</td>
                <td>
                  <div className="font-black text-[#0b2d55]">{row.productCode}</div>
                  <div className="line-clamp-2 text-[12px] leading-tight text-slate-700">{row.productName}</div>
                </td>
                <td className="font-mono text-[12px]">{row.lotNo || "-"}</td>
                <td className="text-right">{formatQty(qty)}</td>
                <td className="text-right font-bold">{formatWeight(weight, 3)}</td>
                <td className="text-[12px]">{row.employeeCode || row.employeeName || "-"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function buildBalanceDisplayItems(rows) {
  const byProduct = new Map();
  [...(Array.isArray(rows) ? rows : [])]
    .sort((left, right) => (
      String(left?.productCode || "").localeCompare(String(right?.productCode || ""), "th")
      || String(left?.lotNo || "").localeCompare(String(right?.lotNo || ""), "th")
    ))
    .forEach((row) => {
      const productCode = row?.productCode || "-";
      if (!byProduct.has(productCode)) byProduct.set(productCode, []);
      byProduct.get(productCode).push(row);
    });

  const items = [];
  let sequence = 0;
  byProduct.forEach((productRows) => {
    const firstRow = productRows[0] || {};
    productRows.forEach((row) => {
      sequence += 1;
      items.push({ type: "row", row, sequence });
    });
    items.push({
      type: "productSubtotal",
      productCode: firstRow.productCode,
      productName: firstRow.productName,
      quantity: productRows.reduce((sum, row) => sum + Number(row?.balanceQty || 0), 0),
      weightKg: productRows.reduce((sum, row) => sum + Number(row?.balanceWeightKg || 0), 0),
    });
  });
  return items;
}

function BalanceReportA4({ rows = [], summary = {}, isLoading, printedAtLabel, profile, variant = "screen" }) {
  const items = buildBalanceDisplayItems(rows);
  const pages = variant === "screen"
    ? [items]
    : Array.from({ length: Math.max(1, Math.ceil(items.length / 28)) }, (_, index) => items.slice(index * 28, (index + 1) * 28));
  const latestDate = today();

  return (
    <div className={`stock-report-balance ${variant === "print" ? "print-only" : "screen-only"}`}>
      {pages.map((pageItems, pageIndex) => (
        <section className="inbound-print-page balance-print-page" key={`${variant}-${pageIndex}`}>
          <InboundReportHeader
            reportKind="balance"
            dateFrom={latestDate}
            dateTo={latestDate}
            itemCount={rows.length}
            printedAtLabel={printedAtLabel}
            profile={profile}
          />
          <table className="balance-a4-table">
            <thead>
              <tr>
                <th className="w-[5%]">#</th>
                <th className="w-[49%] text-left">สินค้า</th>
                <th className="w-[16%] text-left">LOT</th>
                <th className="w-[13%] text-right">จำนวนคงเหลือ</th>
                <th className="w-[17%] text-right">น้ำหนักคงเหลือ (กก.)</th>
              </tr>
            </thead>
            <tbody>
              {isLoading || !pageItems.length ? <EmptyRow colSpan={5} isLoading={isLoading} /> : null}
              {!isLoading && pageItems.map((item, index) => {
                if (item.type === "productSubtotal") {
                  return (
                    <tr className="balance-product-subtotal" key={`subtotal-${item.productCode}-${pageIndex}-${index}`}>
                      <td colSpan={3} className="balance-product-name text-right">รวม {item.productCode} - {item.productName}</td>
                      <td className="text-right">{formatQty(item.quantity)}</td>
                      <td className="text-right">{formatWeight(item.weightKg, 3)}</td>
                    </tr>
                  );
                }
                return (
                  <tr key={`${item.row.productCode}-${item.row.lotNo}-${item.sequence}`}>
                    <td className="text-center">{item.sequence}</td>
                    <td className="balance-product-name">{item.row.productCode} - {item.row.productName}</td>
                    <td className="font-mono">{item.row.lotNo || "-"}</td>
                    <td className="text-right">{formatQty(item.row.balanceQty)}</td>
                    <td className="text-right font-black">{formatWeight(item.row.balanceWeightKg, 3)}</td>
                  </tr>
                );
              })}
            </tbody>
            {variant === "print" && pageIndex === pages.length - 1 ? (
              <tfoot>
                <tr>
                  <td colSpan={3} className="text-right">ยอดรวมทั้งรายงาน</td>
                  <td className="text-right">{formatQty(summary?.balanceQty)}</td>
                  <td className="text-right">{formatWeight(summary?.balanceWeightKg, 3)}</td>
                </tr>
              </tfoot>
            ) : null}
          </table>
        </section>
      ))}
    </div>
  );
}

function BalanceTable({ rows, isLoading }) {
  return (
    <div className="report-table-wrap">
      <table className="report-table balance-report-table">
        <thead>
          <tr>
            <th className="w-[48px]">#</th>
            <th className="min-w-[270px] text-left">สินค้า</th>
            <th className="min-w-[140px] text-left">LOT</th>
            <th className="w-[95px] text-right">จำนวนคงเหลือ</th>
            <th className="w-[110px] text-right">น้ำหนักคงเหลือ</th>
            <th className="w-[95px] text-right">รับเข้า</th>
            <th className="w-[95px] text-right">เบิก</th>
            <th className="w-[95px] text-right">ชั่งคืน</th>
            <th className="w-[95px] text-right">ของเสีย</th>
          </tr>
        </thead>
        <tbody>
          {isLoading || !rows.length ? <EmptyRow colSpan={9} isLoading={isLoading} /> : null}
          {!isLoading && rows.map((row, index) => (
            <tr key={`${row.productCode}-${row.lotNo}-${index}`}>
              <td className="text-center">{index + 1}</td>
              <td>
                <div className="font-black text-[#0b2d55]">{row.productCode}</div>
                <div className="line-clamp-2 text-[12px] leading-tight text-slate-700">{row.productName}</div>
              </td>
              <td className="font-mono text-[12px]">{row.lotNo || "-"}</td>
              <td className="text-right">{formatQty(row.balanceQty)}</td>
              <td className="text-right font-black">{formatWeight(row.balanceWeightKg, 3)}</td>
              <td className="text-right">{formatWeight(row.inboundWeightKg, 2)}</td>
              <td className="text-right">{formatWeight(row.issueWeightKg, 2)}</td>
              <td className="text-right">{formatWeight(row.returnWeightKg, 2)}</td>
              <td className="text-right">{formatWeight(row.wasteWeightKg, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatTimeOnly(value) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("th-TH", {
      timeZone: "Asia/Bangkok",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(value));
  } catch (e) {
    return "-";
  }
}

function formatPeriod(fromStr, toStr) {
  const formatSingle = (str) => {
    if (!str) return "-";
    const parts = str.split("-");
    if (parts.length !== 3) return str;
    const [year, month, day] = parts;
    return `${day}/${month}/${parseInt(year) + 543}`;
  };
  return `${formatSingle(fromStr)} ถึง ${formatSingle(toStr)}`;
}

function formatSingleDate(dateStr) {
  if (!dateStr) return "-";
  try {
    const parts = dateStr.split("-");
    if (parts.length !== 3) return dateStr;
    const [year, month, day] = parts;
    return `${day}/${month}/${parseInt(year) + 543}`;
  } catch (e) {
    return dateStr;
  }
}

function getInboundStatusLabel(status) {
  if (status === "ready") return "พร้อมเบิก";
  if (status === "issued") return "เบิกแล้ว";
  if (status === "cancelled") return "ยกเลิกชั่ง";
  return "-";
}

function InboundReportHeader({ dateFrom, dateTo, itemCount, printedAtLabel, profile, reportKind = "inbound" }) {
  const isIssueReport = reportKind === "issue";
  const isMovementReport = reportKind === "movement";
  const isBalanceReport = reportKind === "balance";
  const reportTitle = isMovementReport
    ? "รายงานเคลื่อนไหวสินค้า"
    : isBalanceReport ? "รายงานคงเหลือสินค้า" : isIssueReport ? "รายงานเบิกสินค้า" : reportKind === "inbound-fg" ? "รายงานรับเข้า FG ผลิตเสร็จ แบบละเอียด" : "รายงานรับเข้า WIP แบบละเอียด";
  const reportSubtitle = isMovementReport
    ? "Stock Movement Report"
    : isBalanceReport ? "Stock Balance Report" : isIssueReport ? "Goods Issue Report" : reportKind === "inbound-fg" ? "Finished Goods Detailed Receipt Report" : "WIP Detailed Receipt Report";
  return (
    <>
      <header className="flex justify-between items-start border-b-2 border-black pb-4 mb-4">
        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/LOGO-KPF1.png" alt="KPF" className="h-10 w-auto object-contain" />
          <div className="flex flex-col text-left">
            <h1 className="text-[14px] font-black leading-none uppercase">บริษัท เคพีฟู้ดส์ จำกัด</h1>
            <p className="text-[9px] font-bold tracking-wider">K.P. foods Co.,Ltd.</p>
          </div>
        </div>
        <div className="text-center pb-1">
          <h2 className="text-[18px] font-black leading-none uppercase">
            {reportTitle}
          </h2>
          <p className="text-[9px] font-bold uppercase tracking-[0.2em] mt-1">
            {reportSubtitle}
          </p>
        </div>
        <div className="text-[10px] leading-tight text-right flex flex-col gap-0.5">
          <div><span className="font-bold mr-1">วันที่พิมพ์:</span> {printedAtLabel}</div>
          <div><span className="font-bold mr-1">ผู้ออกรายงาน:</span> {profile?.username || profile?.name || "System"}</div>
        </div>
      </header>
      <div className="grid grid-cols-3 border-t border-dashed border-black pt-2 mb-3">
        <div className="flex gap-2 items-center text-left">
          <span className="text-[11px] font-black uppercase whitespace-nowrap">แผนก:</span>
          <span className="text-[11px] font-bold">แผนกป้ายแยม</span>
        </div>
        <div className="flex gap-2 items-center justify-center">
          <span className="text-[11px] font-black uppercase whitespace-nowrap">{isBalanceReport ? "ยอดล่าสุด ณ วันที่:" : "ช่วงวันที่:"}</span>
          <span className="text-[11px] font-bold">{isBalanceReport ? formatSingleDate(dateTo) : formatPeriod(dateFrom, dateTo)}</span>
        </div>
        <div className="flex gap-2 items-center justify-end text-right">
          <span className="text-[11px] font-black uppercase whitespace-nowrap">รายการ:</span>
          <span className="text-[11px] font-bold">{itemCount}</span>
        </div>
      </div>
    </>
  );
}

function sortMovementRowsByProduct(rows) {
  return [...(Array.isArray(rows) ? rows : [])].sort((left, right) => (
    String(left?.productCode || "").localeCompare(String(right?.productCode || ""), "th")
    || String(left?.reportDate || "").localeCompare(String(right?.reportDate || ""))
    || String(left?.lotNo || "").localeCompare(String(right?.lotNo || ""), "th")
  ));
}

function buildMovementDisplayItems(rows) {
  const items = [];
  const byProduct = new Map();
  sortMovementRowsByProduct(rows).forEach((row) => {
    const key = row.productCode || "-";
    if (!byProduct.has(key)) byProduct.set(key, []);
    byProduct.get(key).push(row);
  });
  let sequence = 0;
  [...byProduct.values()].forEach((productRows) => {
    const byDate = new Map();
    productRows.forEach((row) => {
      const date = row?.reportDate || "-";
      if (!byDate.has(date)) byDate.set(date, []);
      byDate.get(date).push(row);
    });
    [...byDate.entries()].sort(([left], [right]) => left.localeCompare(right)).forEach(([date, dateRows]) => {
      items.push({ type: "date", date });
      dateRows.forEach((row) => {
        sequence += 1;
        items.push({ type: "row", row, sequence });
      });
    });
    const subtotal = { productCode: productRows[0]?.productCode, productName: productRows[0]?.productName };
    MOVEMENT_GROUPS.forEach(([key]) => {
      subtotal[`${key}Qty`] = productRows.reduce((sum, row) => sum + Number(row?.[`${key}Qty`] || 0), 0);
      subtotal[`${key}WeightKg`] = productRows.reduce((sum, row) => sum + Number(row?.[`${key}WeightKg`] || 0), 0);
    });
    items.push({ type: "subtotal", row: subtotal });
  });
  return items;
}

function MovementReportA4({
  rows = [],
  isLoading,
  dateFrom,
  dateTo,
  printedAtLabel,
  profile,
  variant = "screen",
}) {
  const safeRows = sortMovementRowsByProduct((Array.isArray(rows) ? rows : []).filter(Boolean));
  const [movementCurrentPage, setMovementCurrentPage] = useState(0);
  const movementPageCount = Math.max(1, Math.ceil(safeRows.length / MOVEMENT_SCREEN_PAGE_SIZE));
  const activeMovementPage = Math.min(movementCurrentPage, movementPageCount - 1);
  const visibleRows = variant === "screen"
    ? safeRows.slice(
        activeMovementPage * MOVEMENT_SCREEN_PAGE_SIZE,
        (activeMovementPage + 1) * MOVEMENT_SCREEN_PAGE_SIZE
      )
    : safeRows;
  const displayItems = buildMovementDisplayItems(visibleRows).map((item) => (
    item.type === "row"
      ? { ...item, sequence: item.sequence + activeMovementPage * MOVEMENT_SCREEN_PAGE_SIZE }
      : item
  ));

  if (isLoading) {
    return (
      <div className={`inbound-report-${variant} rounded-xl border border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500`}>
        <RefreshCw className="mr-2 inline animate-spin" size={18} />
        กำลังโหลดข้อมูลรายงานเคลื่อนไหว...
      </div>
    );
  }

  if (!safeRows.length) {
    return (
      <div className={`inbound-report-${variant} rounded-xl border border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500`}>
        ไม่พบข้อมูลในช่วงที่เลือก
      </div>
    );
  }

  return (
    <div className={`inbound-report-container inbound-report-${variant} stock-report-movement flex w-full flex-col items-center`}>
      {variant === "screen" && movementPageCount > 1 ? (
        <div className="movement-pagination screen-only mb-4 flex w-full max-w-[1123px] items-center justify-between rounded-xl border border-[#c5c5d3]/40 bg-white px-4 py-3 shadow-sm">
          <div className="text-sm font-bold text-slate-700">
            หน้า {activeMovementPage + 1} จาก {movementPageCount}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-[#00236f] hover:bg-slate-200 disabled:opacity-50"
              onClick={() => setMovementCurrentPage((current) => Math.max(0, current - 1))}
              disabled={activeMovementPage === 0}
            >
              ก่อนหน้า
            </button>
            <button
              type="button"
              className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-[#00236f] hover:bg-slate-200 disabled:opacity-50"
              onClick={() => setMovementCurrentPage((current) => Math.min(movementPageCount - 1, current + 1))}
              disabled={activeMovementPage === movementPageCount - 1}
            >
              ถัดไป
            </button>
          </div>
        </div>
      ) : null}
      <section className="inbound-print-page movement-a4-page w-full max-w-[1123px] min-h-[794px] border border-slate-400 bg-white p-3 shadow-[0_4px_20px_rgba(0,0,0,0.1)]">
        <div className="screen-report-header">
          <InboundReportHeader
            dateFrom={dateFrom}
            dateTo={dateTo}
            itemCount={safeRows.length}
            printedAtLabel={printedAtLabel}
            profile={profile}
            reportKind="movement"
          />
        </div>
        <table className="movement-a4-table w-full table-fixed border-collapse text-black">
          <colgroup>
            <col style={{ width: "2.5%" }} />
            <col style={{ width: "20.5%" }} />
            <col style={{ width: "8%" }} />
            {Array.from({ length: 14 }, (_, index) => (
              <col key={index} style={{ width: "4.9285%" }} />
            ))}
          </colgroup>
          <thead>
            <tr className="print-report-header-row">
              <th colSpan={17}>
                <InboundReportHeader
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  itemCount={safeRows.length}
                  printedAtLabel={printedAtLabel}
                  profile={profile}
                  reportKind="movement"
                />
              </th>
            </tr>
            <tr className="movement-group-header">
              <th rowSpan={2}>#</th>
              <th rowSpan={2} className="text-left">สินค้า</th>
              <th rowSpan={2}>LOT</th>
              {MOVEMENT_GROUPS.map(([key, label]) => (
                <th key={key} colSpan={2}>{label}</th>
              ))}
            </tr>
            <tr className="movement-sub-header">
              {MOVEMENT_GROUPS.flatMap(([key]) => [
                <th key={`${key}-qty`}>จำนวน</th>,
                <th key={`${key}-weight`}>น้ำหนัก</th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {displayItems.map((item, index) => {
              if (item.type === "date") {
                return (
                  <tr key={`date-${item.date}-${index}`} className="movement-date-header">
                    <td colSpan={17} className="text-left">วันที่รายงาน: {formatSingleDate(item.date)}</td>
                  </tr>
                );
              }
              const row = item.row;
              if (item.type === "subtotal") {
                return (
                  <tr key={`subtotal-${row.productCode}-${index}`} className="movement-product-subtotal">
                    <td colSpan={3} className="text-right italic">รวม {row.productCode} - {row.productName}</td>
                    {MOVEMENT_GROUPS.flatMap(([key]) => [
                      <td key={`${key}-qty`} className="movement-number-cell text-right">{formatQty(row[`${key}Qty`])}</td>,
                      <td key={`${key}-weight`} className="movement-number-cell text-right">{formatWeight(row[`${key}WeightKg`], 3)}</td>,
                    ])}
                  </tr>
                );
              }
              return (
                <tr key={`${row.productCode}-${row.lotNo}-${row.reportDate}-${index}`}>
                  <td className="text-center">{item.sequence}</td>
                  <td className="text-left">
                    <div className="movement-product-text">
                      <strong>{row.productCode || "-"}</strong>{row.productName ? ` - ${row.productName}` : ""}
                    </div>
                  </td>
                  <td className="text-center font-mono">{row.lotNo || "-"}</td>
                  {MOVEMENT_GROUPS.flatMap(([key]) => [
                    <td key={`${key}-qty`} className="movement-number-cell text-right">{formatQty(row[`${key}Qty`])}</td>,
                    <td key={`${key}-weight`} className="movement-number-cell text-right font-bold">{formatWeight(row[`${key}WeightKg`], 3)}</td>,
                  ])}
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function InboundReportA4({
  rows = [],
  isLoading,
  dateFrom,
  dateTo,
  currentViewPage = 0,
  setCurrentViewPage,
  inboundPages = [],
  totalQty = 0,
  totalWeight = 0,
  printedAtLabel,
  profile,
  variant = "screen",
  onMeasuredPages,
  reportKind = "inbound",
}) {
  const measurementRef = useRef(null);
  const isIssueReport = reportKind === "issue";
  const isScreenInbound = variant === "screen" && (reportKind === "inbound" || reportKind === "inbound-fg");
  const pageHeight = 794;
  const columnCount = isIssueReport ? 8 : (isScreenInbound ? 11 : 9);

  const cellPadding = variant === "screen" ? "py-1.5 px-1.5" : "py-[3px] px-1";
  const textSize = variant === "screen" ? "text-xs" : "text-[10px]";
  const headingTextSize = variant === "screen" ? "text-xs" : "text-[10px]";
  const issueHeadingTextSize = variant === "screen" ? "text-xs" : "text-[9px]";

  useLayoutEffect(() => {
    if (variant !== "measure" || !onMeasuredPages || isLoading || !rows?.length) return;
    const root = measurementRef.current;
    const page = root?.querySelector(".inbound-print-page");
    const table = page?.querySelector(".inbound-data-table");
    if (!page || !table) return;

    const outerHeight = (element) => {
      if (!element) return 0;
      const styles = window.getComputedStyle(element);
      return element.getBoundingClientRect().height
        + (Number.parseFloat(styles.marginTop) || 0)
        + (Number.parseFloat(styles.marginBottom) || 0);
    };
    const pageStyles = window.getComputedStyle(page);
    const verticalPadding = (Number.parseFloat(pageStyles.paddingTop) || 0)
      + (Number.parseFloat(pageStyles.paddingBottom) || 0);
    const headerHeight = outerHeight(page.querySelector(".screen-report-header"));
    const tableHeaderHeight = outerHeight(table.querySelector("thead tr:not(.print-report-header-row)"));
    const continuationHeight = outerHeight(page.querySelector(".inbound-continuation-measure"));
    const finalFooterHeight = outerHeight(table.querySelector("tfoot"))
      + outerHeight(page.querySelector(".inbound-report-footer"));
    const rowElements = Array.from(table.querySelectorAll("tbody tr"));
    const rowHeights = rowElements.map((row) => outerHeight(row));
    const items = inboundPages[0] || [];
    const availableHeight = pageHeight - verticalPadding - headerHeight - tableHeaderHeight - continuationHeight;
    const finalFooterReserve = Math.max(0, finalFooterHeight - continuationHeight);
    onMeasuredPages(paginateReportItems(items, rowHeights, availableHeight, finalFooterReserve));
  }, [inboundPages, isLoading, onMeasuredPages, pageHeight, rows, variant]);
  console.log("[PieceRateStockReport] InboundReportA4 render start. Props:", {
    rowsCount: rows?.length,
    isLoading,
    dateFrom,
    dateTo,
    currentViewPage,
    inboundPagesCount: inboundPages?.length,
    totalQty,
    totalWeight
  });

  if (isLoading) {
    return (
      <div className={`inbound-report-${variant} rounded-xl border border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500`}>
        <RefreshCw className="animate-spin inline mr-2" size={18} />
        กำลังโหลดข้อมูลรายงานรับเข้า...
      </div>
    );
  }

  if (!rows || rows.length === 0) {
    return (
      <div className={`inbound-report-${variant} rounded-xl border border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500`}>
        ไม่พบข้อมูลในช่วงที่เลือก
      </div>
    );
  }

  return (
    <div ref={measurementRef} className={`inbound-report-container inbound-report-${variant} stock-report-${reportKind} flex flex-col items-center w-full`}>
      {/* Page selector for screen only */}
      {variant === "screen" && inboundPages && inboundPages.length > 1 && (
        <div className="screen-only flex items-center justify-between w-full max-w-[794px] mb-4 bg-white px-4 py-3 border border-[#c5c5d3]/40 rounded-xl shadow-sm">
          <div className="text-sm font-bold text-slate-700">
            หน้า {currentViewPage + 1} จาก {inboundPages.length}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-xs font-bold rounded-lg disabled:opacity-50 text-[#00236f]"
              onClick={() => setCurrentViewPage((prev) => Math.max(0, prev - 1))}
              disabled={currentViewPage === 0}
            >
              ก่อนหน้า
            </button>
            <button
              type="button"
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-xs font-bold rounded-lg disabled:opacity-50 text-[#00236f]"
              onClick={() => setCurrentViewPage((prev) => Math.min(inboundPages.length - 1, prev + 1))}
              disabled={currentViewPage === inboundPages.length - 1}
            >
              ถัดไป
            </button>
          </div>
        </div>
      )}

      {/* Pages Container */}
      <div className="w-full flex flex-col items-center gap-8">
        {inboundPages && inboundPages.map((pageRows, pageIndex) => {
          if (!pageRows) return null;
          const isCurrent = pageIndex === currentViewPage;
          const paddedItems = [...pageRows];

          return (
            <div
              key={pageIndex}
              className={`inbound-print-page bg-white shadow-[0_4px_20px_rgba(0,0,0,0.1)] print:!max-w-none border border-slate-400 flex flex-col ${
                variant === "screen" ? "w-full max-w-none min-h-[794px]" : "w-full max-w-[1123px] min-h-[794px]"
              } ${
                isCurrent ? "flex" : "hidden print:flex"
              }`}
              style={{ pageBreakAfter: "always", breakAfter: "always", padding: "2mm" }}
            >
              <div className="screen-report-header">
                <InboundReportHeader
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  itemCount={pageRows.filter((item) => item.type === "row").length}
                  printedAtLabel={printedAtLabel}
                  profile={profile}
                  reportKind={reportKind}
                />
              </div>

              <div className={`w-full ${variant === "screen" ? "overflow-x-auto" : "overflow-hidden"} flex-grow`}>
                <table className={`inbound-data-table w-full text-left border-collapse ${variant === "screen" ? "table-auto" : "table-fixed"}`}>
                  <colgroup>
                    {(isIssueReport
                      ? [3, 11, 11, 28, 9, 6, 8, 24]
                      : isScreenInbound
                      ? [4, 11, 10, 20, 10, 5, 8, 5, 10, 11, 6]
                      : [4, 12, 13, 21, 10, 5, 8, 12, 15]
                    ).map((width, index) => <col key={index} style={{ width: `${width}%` }} />)}
                  </colgroup>
                  <thead>
                    <tr className="print-report-header-row">
                      <th colSpan={columnCount}>
                        <InboundReportHeader
                          dateFrom={dateFrom}
                          dateTo={dateTo}
                          itemCount={pageRows.filter((item) => item.type === "row").length}
                          printedAtLabel={printedAtLabel}
                          profile={profile}
                          reportKind={reportKind}
                        />
                      </th>
                    </tr>
                    {isIssueReport ? (
                      <tr className="bg-[#f5f5f5] border-b border-slate-400">
                        {[
                          "#",
                          "วันที่–เวลาเบิก",
                          "บาร์โค้ดป้าย",
                          "สินค้า WIP",
                          "LOT",
                          "จำนวน",
                          "น้ำหนักเบิก",
                          "สินค้า FG ที่นำไปผลิต",
                        ].map((label, columnIndex) => (
                          <th
                            key={label}
                            className={`${variant === "screen" ? "py-2 px-2 text-[13px]" : "py-1 px-1 text-[9px]"} font-bold text-black whitespace-nowrap ${[5, 6].includes(columnIndex) ? "text-right" : "text-left"}`}
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    ) : isScreenInbound ? (
                      <tr className="bg-[#f5f5f5] border-b border-slate-400">
                        <th className="py-2 px-2 text-sm font-bold text-black whitespace-nowrap">#</th>
                        <th className="py-2 px-2 text-sm font-bold text-black whitespace-nowrap">บาร์โค้ด</th>
                        <th className="py-2 px-2 text-sm font-bold text-black whitespace-nowrap">รหัสสินค้า</th>
                        <th className="py-2 px-2 text-sm font-bold text-black whitespace-nowrap">ชื่อสินค้า</th>
                        <th className="py-2 px-2 text-sm font-bold text-black whitespace-nowrap">LOT</th>
                        <th className="py-2 px-2 text-sm font-bold text-black text-right whitespace-nowrap">จำนวน</th>
                        <th className="py-2 px-2 text-sm font-bold text-black text-right whitespace-nowrap">น้ำหนัก (กก.)</th>
                        <th className="py-2 px-2 text-sm font-bold text-black whitespace-nowrap">เวลา</th>
                        <th className="py-2 px-2 text-sm font-bold text-black whitespace-nowrap">รหัสพนักงาน</th>
                        <th className="py-2 px-2 text-sm font-bold text-black whitespace-nowrap">ชื่อพนักงาน</th>
                        <th className="py-2 px-2 text-sm font-bold text-black whitespace-nowrap">สถานะ</th>
                      </tr>
                    ) : (
                      <tr className="bg-[#f5f5f5] border-b border-slate-400">
                        <th className="py-1 px-1 text-[10px] font-bold text-black whitespace-nowrap">#</th>
                        <th className="py-1 px-1 text-[10px] font-bold text-black whitespace-nowrap">บาร์โค้ด</th>
                        <th className="py-1 px-1 text-[10px] font-bold text-black whitespace-nowrap">รหัสสินค้า / พนักงาน</th>
                        <th className="py-1 px-1 text-[10px] font-bold text-black whitespace-nowrap">ชื่อสินค้า</th>
                        <th className="py-1 px-1 text-[10px] font-bold text-black whitespace-nowrap">LOT</th>
                        <th className="py-1 px-1 text-[10px] font-bold text-black text-right whitespace-nowrap">จำนวน</th>
                        <th className="py-1 px-1 text-[10px] font-bold text-black text-right whitespace-nowrap">น้ำหนัก (กก.)</th>
                        <th className="py-1 px-1 text-[10px] font-bold text-black whitespace-nowrap">เวลา</th>
                      </tr>
                    )}
                  </thead>
                  <tbody className={`${textSize} text-black`}>
                    {paddedItems.map((item, idx) => {
                      if (item.type === "pad") {
                        return (
                          <tr key={`pad-${idx}`} className="border-b border-[#f0f0f0]">
                            {Array.from({ length: columnCount }, (_, columnIndex) => (
                              <td key={columnIndex} className={cellPadding}>&nbsp;</td>
                            ))}
                          </tr>
                        );
                      }

                      if (item.type === "dateDivider") {
                        return (
                          <tr key={`divider-${idx}`} className="bg-[#f5f5f5] border-b border-slate-400 font-bold">
                            <td colSpan={columnCount} className={`${variant === "screen" ? "py-2 px-3 text-xs" : "py-[3px] px-1 text-[9px]"} text-left font-black text-black uppercase tracking-wider`}>
                              วันที่ {formatSingleDate(item.date)}
                            </td>
                          </tr>
                        );
                      }

                      const row = item.data;
                      const timeStr = formatTimeOnly(row.movementAt);
                      const qty = row.quantityIn || row.quantityOut;
                      const weight = row.weightInKg || row.weightOutKg;

                      if (isIssueReport) {
                        const isVoidedIssue = row.kind === "issue_void";
                        const issueQty = isVoidedIssue ? row.quantityIn : row.quantityOut;
                        const issueWeight = isVoidedIssue ? row.weightInKg : row.weightOutKg;
                        const issueEmployeeCode = row.issueEmployeeCode || row.employeeCode;
                        const issueEmployeeName = row.issueEmployeeName || row.employeeName;
                        return (
                          <tr key={row.id || idx} className="border-b border-[#f0f0f0] hover:bg-[#fafafa] whitespace-nowrap">
                            <td className={`${cellPadding} text-center`}>{item.index}</td>
                            <td className={cellPadding}>{formatDateTime(row.movementAt)}</td>
                            <td className={`${cellPadding} font-mono`}>{row.barcode || "-"}</td>
                            <td className={`${cellPadding} ${variant === "screen" ? "whitespace-nowrap" : "whitespace-normal break-words"}`} title={`${row.productCode || ""} ${row.productName || ""}`.trim()}>
                              <div className="issue-product-text">
                                <span className="font-bold mr-1">{row.productCode || "-"}</span>
                                {row.productName || ""}
                              </div>
                            </td>
                            <td className={`${cellPadding} font-mono`}>{row.lotNo || "-"}</td>
                            <td className={`${cellPadding} text-right`}>{formatQty(issueQty)}</td>
                            <td className={`${cellPadding} text-right font-bold`}>{formatWeight(issueWeight, 3)}</td>
                            <td className={`${cellPadding} ${variant === "screen" ? "whitespace-nowrap" : "whitespace-normal break-words"}`} title={`${row.fgProductCode || ""} ${row.fgProductName || ""}`.trim()}>
                              <div className="issue-product-text">
                                {[row.fgProductCode, row.fgProductName].filter(Boolean).join(" ") || "-"}
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      if (isScreenInbound) {
                        return (
                          <tr key={row.id || idx} className="border-b border-[#f0f0f0] hover:bg-[#fafafa] whitespace-nowrap">
                            <td className={`${cellPadding} text-slate-500 text-center font-medium`}>
                              {item.index}
                            </td>
                            <td className={`${cellPadding} font-mono text-black`}>
                              {row.barcode || "-"}
                            </td>
                            <td className={`${cellPadding} font-mono text-black whitespace-nowrap`}>
                              {row.productCode || "-"}
                            </td>
                            <td className={`${cellPadding} font-medium text-left whitespace-nowrap`} title={row.productName}>
                              {row.productName || "-"}
                            </td>
                            <td className={`${cellPadding} font-mono text-black`}>
                              {row.lotNo || "-"}
                            </td>
                            <td className={`${cellPadding} text-right font-medium`}>
                              {qty !== undefined ? formatQty(qty) : "-"}
                            </td>
                            <td className={`${cellPadding} text-right font-medium`}>
                              {weight !== undefined ? formatWeight(weight, 3) : "-"}
                            </td>
                            <td className={`${cellPadding} text-center`}>
                              {timeStr}
                            </td>
                            <td className={`${cellPadding} font-mono text-black whitespace-nowrap`}>
                              {row.employeeCode || "-"}
                            </td>
                            <td className={`${cellPadding} text-left font-medium whitespace-nowrap`}>
                              {row.employeeName || "-"}
                            </td>
                            <td className={`${cellPadding} text-left font-medium whitespace-nowrap`}>
                              {row.status ? (
                                <span className={`inline-block px-2 py-0.5 rounded text-xs font-bold text-white border ${
                                  row.status === "ready"
                                    ? "bg-emerald-600 border-emerald-700"
                                    : row.status === "issued"
                                    ? "bg-blue-600 border-blue-700"
                                    : row.status === "cancelled"
                                    ? "bg-rose-600 border-rose-700"
                                    : "bg-slate-600 border-slate-700"
                                }`}>
                                  {getInboundStatusLabel(row.status)}
                                </span>
                              ) : "-"}
                            </td>
                          </tr>
                        );
                      }

                      return (
                        <tr key={row.id || idx} className="border-b border-[#f0f0f0] hover:bg-[#fafafa] whitespace-nowrap">
                          <td className={`${cellPadding} text-slate-500 text-center font-medium`}>
                            {item.index}
                          </td>
                          <td className={`${cellPadding} font-mono text-black`}>
                            {row.barcode || "-"}
                          </td>
                          <td className={`${cellPadding} font-mono text-black whitespace-normal break-words`}>
                            <div className="font-bold">{row.productCode || "-"}</div>
                            <div className="text-[8px]">{row.employeeCode || "-"}</div>
                            <div className="font-sans text-[8px]">{row.employeeName || "-"}</div>
                          </td>
                          <td className={`${cellPadding} font-medium text-left whitespace-normal break-words`} title={row.productName}>
                            {row.productName || "-"}
                          </td>
                          <td className={`${cellPadding} font-mono text-black`}>
                            {row.lotNo || "-"}
                          </td>
                          <td className={`${cellPadding} text-right font-medium`}>
                            {qty !== undefined ? formatQty(qty) : "-"}
                          </td>
                          <td className={`${cellPadding} text-right font-medium`}>
                            {weight !== undefined ? formatWeight(weight, 3) : "-"}
                          </td>
                          <td className={`${cellPadding} text-center`}>
                            {timeStr}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {inboundPages && pageIndex === inboundPages.length - 1 && (
                    <tfoot>
                      <tr className={`${variant === "screen" ? "bg-[#f5f5f5] text-sm" : "bg-[#f5f5f5] text-[10px]"} font-bold border-t-2 border-black`}>
                        <td className={`${variant === "screen" ? "py-2.5 px-3" : "py-2 px-1"} text-right`} colSpan={5}>Total / ยอดรวม:</td>
                        <td className={`${variant === "screen" ? "py-2.5 px-3" : "py-2 px-1"} text-right`}>{formatQty(totalQty)}</td>
                        <td className={`${variant === "screen" ? "py-2.5 px-3" : "py-2 px-1"} text-right`}>{formatWeight(totalWeight, 3)}</td>
                        <td colSpan={isIssueReport ? 1 : (isScreenInbound ? 4 : 3)}></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>

              {/* Signature Section - Rendered only on the last page */}
              {inboundPages && pageIndex === inboundPages.length - 1 ? (
                <footer className="inbound-report-footer mt-auto pt-4 flex justify-around gap-4 mt-6">
                  <div className="flex flex-col items-center gap-1 w-1/3">
                    <div className="w-full border-b border-black border-solid h-6 mb-1"></div>
                    <span className="text-[9px] font-bold uppercase">Receiver / ผู้รับสินค้า</span>
                    <span className="text-[9px] text-center">Date: ..... / ..... / .......</span>
                  </div>
                  <div className="flex flex-col items-center gap-1 w-1/3">
                    <div className="w-full border-b border-black border-solid h-6 mb-1"></div>
                    <span className="text-[9px] font-bold uppercase">Supervisor / ผู้ตรวจสอบ</span>
                    <span className="text-[9px] text-center">Date: ..... / ..... / .......</span>
                  </div>
                </footer>
              ) : (
                <div className="inbound-continuation-footer mt-auto pt-4 flex justify-between text-[9px] text-slate-400">
                  <span>* มีข้อมูลหน้าถัดไป</span>
                  <span>บริษัท เคพีฟู้ดส์ จำกัด</span>
                </div>
              )}
              {variant === "measure" ? (
                <div className="inbound-continuation-measure pt-4 flex justify-between text-[9px] text-slate-400">
                  <span>* มีข้อมูลหน้าถัดไป</span>
                  <span>บริษัท เคพีฟู้ดส์ จำกัด</span>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function InboundSummaryReportHeader({ dateFrom, dateTo, printedAtLabel, profile, reportKind = "inbound", pageIndex, totalPages, pageRowsCount = 0, variant }) {
  const isFG = reportKind === "inbound-fg";
  const reportTitle = isFG ? "รายงานสรุป FG ที่ผลิตเสร็จ" : "รายงานสรุปรับเข้าป้ายแยม (WIP)";
  const reportSubtitle = isFG ? "Finished Goods Summary Receipt Report" : "WIP Summary Receipt Report";
  
  return (
    <>
      <header className="flex justify-between items-start border-b-2 border-black pb-4 mb-4">
        <div className="flex items-center gap-3 text-left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/LOGO-KPF1.png" alt="KPF" className="h-10 w-auto object-contain" />
          <div className="flex flex-col">
            <h1 className="text-[14px] font-black leading-none uppercase text-black">บริษัท เคพีฟู้ดส์ จำกัด</h1>
            <p className="text-[9px] font-bold text-black tracking-wider">K.P. foods Co.,Ltd.</p>
          </div>
        </div>
        <div className="text-center pb-1">
          <h2 className="text-[18px] font-black leading-none uppercase text-black">{reportTitle}</h2>
          <p className="text-[9px] font-bold text-black uppercase tracking-[0.2em] mt-1">{reportSubtitle}</p>
        </div>
        <div className="text-[10px] leading-tight text-black text-right flex flex-col gap-0.5">
          <div><span className="font-bold mr-1">วันที่พิมพ์:</span> {printedAtLabel}</div>
          <div><span className="font-bold mr-1">ผู้ออกรายงาน:</span> {profile?.username || profile?.name || "System"}</div>
          {totalPages > 0 && variant !== "print" && (
            <div><span className="font-bold mr-1">หน้า:</span> {pageIndex + 1} / {totalPages}</div>
          )}
        </div>
      </header>
      <div className="grid grid-cols-3 border-t border-dashed border-black pt-2 mb-3">
        <div className="flex gap-2 items-center text-left">
          <span className="text-[11px] font-black uppercase whitespace-nowrap">แผนก:</span>
          <span className="text-[11px] font-bold">แผนกป้ายแยม</span>
        </div>
        <div className="flex gap-2 items-center justify-center">
          <span className="text-[11px] font-black uppercase whitespace-nowrap">ช่วงวันที่:</span>
          <span className="text-[11px] font-bold">{formatPeriod(dateFrom, dateTo)}</span>
        </div>
        <div className="flex gap-2 items-center justify-end text-right">
          <span className="text-[11px] font-black uppercase whitespace-nowrap">รายการสรุป:</span>
          <span className="text-[11px] font-bold">{pageRowsCount}</span>
        </div>
      </div>
    </>
  );
}

function InboundSummaryReportA4({
  variant = "screen",
  reportKind = "inbound",
  isLoading,
  dateFrom,
  dateTo,
  currentViewPage = 0,
  setCurrentViewPage,
  summaryPages = [],
  totalQty = 0,
  totalWeight = 0,
  printedAtLabel,
  profile,
}) {
  const isScreen = variant === "screen";
  const cellPadding = isScreen ? "py-1.5 px-3" : "py-1 px-1.5";
  const textSize = isScreen ? "text-xs" : "text-[10px]";

  if (isLoading) {
    return (
      <div className={`inbound-report-${variant} rounded-xl border border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500`}>
        <RefreshCw className="animate-spin inline mr-2" size={18} />
        กำลังโหลดข้อมูลรายงานสรุปรับเข้า...
      </div>
    );
  }

  if (!summaryPages || summaryPages.length === 0) {
    return (
      <div className={`inbound-report-${variant} rounded-xl border border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500`}>
        ไม่พบข้อมูลในช่วงที่เลือก
      </div>
    );
  }

  const allSummaryItemsCount = summaryPages.reduce((acc, page) => {
    return acc + (page ? page.filter(r => r.type === "item").length : 0);
  }, 0);

  return (
    <div className={`inbound-report-container inbound-report-${variant} flex flex-col items-center w-full`}>
      {isScreen && summaryPages.length > 1 && (
        <div className="screen-only flex items-center justify-between w-full max-w-[794px] mb-4 bg-white px-4 py-3 border border-[#c5c5d3]/40 rounded-xl shadow-sm">
          <div className="text-sm font-bold text-slate-700">
            หน้า {currentViewPage + 1} จาก {summaryPages.length}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-xs font-bold rounded-lg disabled:opacity-50 text-[#00236f]"
              onClick={() => setCurrentViewPage((prev) => Math.max(0, prev - 1))}
              disabled={currentViewPage === 0}
            >
              ก่อนหน้า
            </button>
            <button
              type="button"
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-xs font-bold rounded-lg disabled:opacity-50 text-[#00236f]"
              onClick={() => setCurrentViewPage((prev) => Math.min(summaryPages.length - 1, prev + 1))}
              disabled={currentViewPage === summaryPages.length - 1}
            >
              ถัดไป
            </button>
          </div>
        </div>
      )}

      <div className="w-full flex flex-col items-center gap-8">
        {summaryPages.map((pageRows, pageIndex) => {
          if (!pageRows) return null;
          const isCurrent = pageIndex === currentViewPage;

          return (
            <div
              key={pageIndex}
              className={`inbound-print-page bg-white shadow-[0_4px_20px_rgba(0,0,0,0.1)] print:!max-w-none border border-slate-400 flex flex-col ${
                isScreen ? "w-full max-w-[794px] min-h-[1123px]" : "w-full max-w-[794px] min-h-[1123px]"
              } ${
                isCurrent ? "flex" : "hidden print:flex"
              }`}
              style={{ pageBreakAfter: "always", breakAfter: "always", padding: "2mm" }}
            >
              <div className="screen-report-header print:hidden">
                <InboundSummaryReportHeader
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  printedAtLabel={printedAtLabel}
                  profile={profile}
                  reportKind={reportKind}
                  pageIndex={pageIndex}
                  totalPages={summaryPages.length}
                  pageRowsCount={allSummaryItemsCount}
                  variant={variant}
                />
              </div>

              <div className="w-full flex-grow overflow-hidden">
                <table className="inbound-data-table w-full text-left border-collapse table-fixed">
                  <colgroup>
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "20%" }} />
                    <col style={{ width: "45%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "13%" }} />
                  </colgroup>
                  <thead>
                    <tr className="print-report-header-row hidden print:table-row">
                      <th colSpan={5}>
                        <InboundSummaryReportHeader
                          dateFrom={dateFrom}
                          dateTo={dateTo}
                          printedAtLabel={printedAtLabel}
                          profile={profile}
                          reportKind={reportKind}
                          pageIndex={pageIndex}
                          totalPages={summaryPages.length}
                          pageRowsCount={allSummaryItemsCount}
                          variant={variant}
                        />
                      </th>
                    </tr>
                    <tr className="bg-[#f5f5f5] border-b border-slate-400">
                      <th className={`${cellPadding} text-sm font-bold text-black text-center whitespace-nowrap`}>#</th>
                      <th className={`${cellPadding} text-sm font-bold text-black text-center whitespace-nowrap`}>LOT</th>
                      <th className={`${cellPadding} text-sm font-bold text-black text-left whitespace-nowrap`}>สินค้า</th>
                      <th className={`${cellPadding} text-sm font-bold text-black text-right whitespace-nowrap`}>จำนวน</th>
                      <th className={`${cellPadding} text-sm font-bold text-black text-right whitespace-nowrap`}>น้ำหนัก (กก.)</th>
                    </tr>
                  </thead>
                  <tbody className={`${textSize} text-black`}>
                    {pageRows.map((vRow, vIndex) => {
                      if (vRow.type === "date-header") {
                        return (
                          <tr key={vIndex} className="bg-[#f5f5f5] border-b border-slate-400 font-bold">
                            <td colSpan={5} className={`${cellPadding} text-left font-black text-black uppercase tracking-wider`}>
                              วันที่ {formatSingleDate(vRow.date)}
                            </td>
                          </tr>
                        );
                      }

                      if (vRow.type === "item") {
                        const row = vRow.data;
                        return (
                          <tr key={vIndex} className="border-b border-[#f0f0f0] hover:bg-[#fafafa] whitespace-nowrap">
                            <td className={`${cellPadding} text-center`}>{vRow.sequence}</td>
                            <td className={`${cellPadding} font-mono text-center`}>{row.lotNo}</td>
                            <td className={`${cellPadding} text-left truncate`}>{row.productDisplay}</td>
                            <td className={`${cellPadding} text-right`}>{formatQty(row.quantity)}</td>
                            <td className={`${cellPadding} text-right font-bold`}>{formatWeight(row.totalNetWeightKg, 3)}</td>
                          </tr>
                        );
                      }

                      if (vRow.type === "subtotal") {
                        return (
                          <tr key={vIndex} className="bg-[#fbfcfd] border-b-2 border-slate-400 text-black font-bold">
                            <td colSpan={3} className={`${cellPadding} text-right font-bold`}>ยอดรวม</td>
                            <td className={`${cellPadding} text-right font-bold`}>{formatQty(vRow.qty)}</td>
                            <td className={`${cellPadding} text-right font-bold`}>{formatWeight(vRow.weight, 3)}</td>
                          </tr>
                        );
                      }
                      return null;
                    })}
                  </tbody>
                </table>
              </div>

              {/* Page Footer */}
              {pageIndex === summaryPages.length - 1 ? (
                <footer className="inbound-report-footer mt-auto pt-4 flex justify-around gap-4 mt-6">
                  <div className="flex flex-col items-center gap-1 w-1/3">
                    <div className="w-full border-b border-black border-solid h-6 mb-1"></div>
                    <span className="text-[9px] font-bold uppercase">Receiver / ผู้รับสินค้า</span>
                    <span className="text-[9px] text-center">Date: ..... / ..... / .......</span>
                  </div>
                  <div className="flex flex-col items-center gap-1 w-1/3">
                    <div className="w-full border-b border-black border-solid h-6 mb-1"></div>
                    <span className="text-[9px] font-bold uppercase">Supervisor / ผู้ตรวจสอบ</span>
                    <span className="text-[9px] text-center">Date: ..... / ..... / .......</span>
                  </div>
                </footer>
              ) : (
                <div className="inbound-continuation-footer mt-auto pt-4 flex justify-between text-[9px] text-slate-400">
                  <span>* มีข้อมูลหน้าถัดไป</span>
                  <span>บริษัท เคพีฟู้ดส์ จำกัด</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function IssueSummaryReportA4({
  variant = "screen",
  rows = [],
  isLoading,
  dateFrom,
  dateTo,
  printedAtLabel,
  profile,
}) {
  const isScreen = variant === "screen";
  const cellPadding = isScreen ? "px-1 py-2" : "px-1 py-1";
  const summaryRows = Array.isArray(rows) ? rows : [];
  const pageSize = isScreen ? 24 : Math.max(summaryRows.length, 1);
  const pages = [];

  for (let index = 0; index < summaryRows.length; index += pageSize) {
    pages.push(summaryRows.slice(index, index + pageSize));
  }

  const totalQty = summaryRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const totalWeight = summaryRows.reduce((sum, row) => sum + Number(row.totalWeightKg || 0), 0);

  if (isLoading) {
    return (
      <div className={`inbound-report-${variant} rounded-xl border border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500`}>
        <RefreshCw className="mr-2 inline animate-spin" size={18} />
        กำลังโหลดรายงานสรุปเบิก...
      </div>
    );
  }

  if (!pages.length) {
    return (
      <div className={`inbound-report-${variant} rounded-xl border border-slate-200 bg-slate-50 px-4 py-12 text-center text-sm text-slate-500`}>
        ไม่พบรายการเบิกสำเร็จในช่วงที่เลือก
      </div>
    );
  }

  return (
    <div className={`issue-summary-report inbound-report-container inbound-report-${variant} stock-report-issue flex w-full flex-col items-center overflow-x-auto`}>
      <div className="issue-summary-pages flex min-w-[1123px] flex-col items-center gap-8">
        {pages.map((pageRows, pageIndex) => (
          <div
            key={pageIndex}
            className="inbound-print-page flex min-h-[794px] w-[1123px] min-w-[1123px] max-w-[1123px] flex-col border border-slate-400 bg-white shadow-[0_4px_20px_rgba(0,0,0,0.1)] print:!max-w-none print:!min-w-0"
            style={{ pageBreakAfter: "always", breakAfter: "page", padding: "2mm" }}
          >
            <header className="mb-4 flex items-start justify-between border-b-2 border-black pb-4">
              <div className="flex items-center gap-3 text-left">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/brand/LOGO-KPF1.png" alt="KPF" className="h-10 w-auto object-contain" />
                <div>
                  <h1 className="text-[14px] font-black leading-none text-black">บริษัท เคพีฟู้ดส์ จำกัด</h1>
                  <p className="text-[9px] font-bold tracking-wider text-black">K.P. foods Co.,Ltd.</p>
                </div>
              </div>
              <div className="text-center">
                <h2 className="text-[18px] font-black leading-none text-black">รายงานสรุปเบิกป้ายแยม</h2>
                <p className="mt-1 text-[9px] font-bold uppercase tracking-[0.16em] text-black">Successful Issue Summary Report</p>
              </div>
              <div className="flex flex-col gap-0.5 text-right text-[9px] leading-tight text-black">
                <div><span className="font-bold">วันที่พิมพ์:</span> {printedAtLabel}</div>
                <div><span className="font-bold">ผู้ออกรายงาน:</span> {profile?.username || profile?.name || "System"}</div>
                <div><span className="font-bold">หน้า:</span> {pageIndex + 1} / {pages.length}</div>
              </div>
            </header>

            <div className="mb-3 grid grid-cols-3 border-t border-dashed border-black pt-2 text-[10px] text-black">
              <div><span className="font-black">แผนก:</span> แผนกป้ายแยม</div>
              <div className="text-center"><span className="font-black">ช่วงวันที่:</span> {formatPeriod(dateFrom, dateTo)}</div>
              <div className="text-right"><span className="font-black">สถานะ:</span> เบิกสำเร็จเท่านั้น</div>
            </div>

            <div className="w-full flex-grow overflow-hidden">
              <table className="issue-summary-table inbound-data-table w-full table-fixed border-collapse text-left text-black">
                <colgroup>
                  <col style={{ width: "4%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "9%" }} />
                  <col style={{ width: "19%" }} />
                  <col style={{ width: "16%" }} />
                  <col style={{ width: "6%" }} />
                  <col style={{ width: "10%" }} />
                  <col style={{ width: "8%" }} />
                  <col style={{ width: "20%" }} />
                </colgroup>
                <thead>
                  <tr className="border-b border-slate-400 bg-[#f5f5f5]">
                    <th className={`${cellPadding} text-center text-[10px] font-bold`}>#</th>
                    <th className={`${cellPadding} text-center text-[10px] font-bold`}>วันที่เบิก</th>
                    <th className={`${cellPadding} text-left text-[10px] font-bold`}>รหัส WIP</th>
                    <th className={`${cellPadding} text-left text-[10px] font-bold`}>สินค้า WIP</th>
                    <th className={`${cellPadding} text-left text-[10px] font-bold`}>LOT / น้ำหนัก (กก.)</th>
                    <th className={`${cellPadding} text-center text-[10px] font-bold`}>จำนวน</th>
                    <th className={`${cellPadding} text-center text-[10px] font-bold`}>น้ำหนักรวม (กก.)</th>
                    <th className={`${cellPadding} text-center text-[10px] font-bold`}>รหัส FG</th>
                    <th className={`${cellPadding} text-left text-[10px] font-bold`}>ชื่อสินค้า FG ที่ผลิต</th>
                  </tr>
                </thead>
                <tbody className={isScreen ? "text-[11px]" : "text-[10px]"}>
                  {pageRows.map((row, rowIndex) => (
                    <tr key={row.groupKey} className="border-b border-[#d9dee5] align-middle whitespace-nowrap">
                      <td className={`${cellPadding} text-center`}>{pageIndex * pageSize + rowIndex + 1}</td>
                      <td className={`${cellPadding} whitespace-nowrap text-center`}>{formatSingleDate(row.issueDate)}</td>
                      <td className={`${cellPadding} whitespace-nowrap font-mono font-bold`} title={row.wipProductCode}>{row.wipProductCode}</td>
                      <td className={`${cellPadding} issue-summary-name-cell whitespace-nowrap`} title={row.wipProductName}>{row.wipProductName}</td>
                      <td className={`${cellPadding} issue-summary-lot-cell`}>
                        {(row.lotWeights || []).map((lot) => (
                          <div key={lot.lotNo} className="issue-summary-lot-line">
                            <span className="font-mono font-bold">{lot.lotNo}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono">{formatWeight(lot.weightKg, 3)}</span>
                          </div>
                        ))}
                      </td>
                      <td className={`${cellPadding} text-center font-bold`}>{formatQty(row.quantity)}</td>
                      <td className={`${cellPadding} text-center font-bold`}>{formatWeight(row.totalWeightKg, 3)}</td>
                      <td className={`${cellPadding} whitespace-nowrap text-center font-mono font-bold`} title={row.fgProductCode}>{row.fgProductCode || "-"}</td>
                      <td className={`${cellPadding} issue-summary-name-cell whitespace-nowrap`} title={row.fgProductName}>{row.fgProductName || "-"}</td>
                    </tr>
                  ))}
                </tbody>
                {pageIndex === pages.length - 1 ? (
                  <tfoot>
                    <tr className="border-t-2 border-black bg-[#f5f5f5] font-black text-black">
                      <td colSpan={5} className={`${cellPadding} text-right`}>รวมทั้งหมด</td>
                      <td className={`${cellPadding} text-center`}>{formatQty(totalQty)}</td>
                      <td className={`${cellPadding} text-center`}>{formatWeight(totalWeight, 3)}</td>
                      <td className={cellPadding} colSpan={2}>รายการเบิกสำเร็จ {summaryRows.length.toLocaleString("th-TH")} กลุ่ม</td>
                    </tr>
                  </tfoot>
                ) : null}
              </table>
            </div>

            {pageIndex === pages.length - 1 ? (
              <footer className="mt-auto flex justify-around gap-4 pt-6">
                <div className="flex w-1/3 flex-col items-center gap-1">
                  <div className="mb-1 h-6 w-full border-b border-black" />
                  <span className="text-[9px] font-bold">ผู้รับสินค้า</span>
                  <span className="text-[9px]">วันที่ ..... / ..... / .......</span>
                </div>
                <div className="flex w-1/3 flex-col items-center gap-1">
                  <div className="mb-1 h-6 w-full border-b border-black" />
                  <span className="text-[9px] font-bold">ผู้ตรวจสอบ</span>
                  <span className="text-[9px]">วันที่ ..... / ..... / .......</span>
                </div>
              </footer>
            ) : (
              <div className="mt-auto flex justify-between pt-4 text-[9px] text-slate-400">
                <span>* มีข้อมูลหน้าถัดไป</span>
                <span>บริษัท เคพีฟู้ดส์ จำกัด</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PieceRateStockMovementReportPageClient() {
  const profile = useUserProfile();
  const [dateFrom, setDateFrom] = useState(PIECE_RATE_REPORT_START_DATE);
  const [dateTo, setDateTo] = useState(today());
  const [search, setSearch] = useState("");
  const [reportType, setReportType] = useState("inbound");
  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentViewPage, setCurrentViewPage] = useState(0);
  const [screenInboundPages, setScreenInboundPages] = useState([[]]);
  const [screenIssuePages, setScreenIssuePages] = useState([[]]);
  const [statusFilter, setStatusFilter] = useState("inbound");
  const [issueStatusFilters, setIssueStatusFilters] = useState(["issue"]);
  const [isSummaryView, setIsSummaryView] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [prisonView, setPrisonView] = useState("receipt");
  const isBalanceReport = reportType === "balance" || (reportType === "prison" && prisonView === "balance");

  console.log("[PieceRateStockReport] Main Render. State:", {
    dateFrom,
    dateTo,
    search,
    reportType,
    rowsCount: rows?.length,
    summaryKeys: Object.keys(summary || {}),
    isLoading,
    error,
    currentViewPage,
    statusFilter,
    profileLoaded: profile?.loaded,
    profileUser: profile?.username,
    isSummaryView,
    openDropdown
  });

  useEffect(() => {
    setCurrentViewPage(0);
  }, [rows]);

  useEffect(() => {
    setStatusFilter("inbound");
    setIssueStatusFilters(["issue"]);
    setCurrentViewPage(0);
    setIsSummaryView(false);
    setOpenDropdown(null);
  }, [reportType]);

  const printedAtLabel = useMemo(() => {
    return new Intl.DateTimeFormat("th-TH", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date());
  }, []);

  const filteredInboundRows = useMemo(() => {
    if (reportType !== "inbound" && reportType !== "inbound-fg") return rows;
    return rows.filter(row => {
      if (!row) return false;
      if (statusFilter === "inbound") return row.status !== "cancelled";
      if (statusFilter === "ready") return row.status === "ready";
      if (statusFilter === "issued") return row.status === "issued";
      if (statusFilter === "cancelled") return row.status === "cancelled";
      return true;
    });
  }, [rows, reportType, statusFilter]);

  const filteredIssueRows = useMemo(() => {
    if (reportType !== "issue") return [];
    return rows.filter((row) => issueStatusFilters.includes(row?.kind));
  }, [issueStatusFilters, reportType, rows]);

  const displayedBalanceRows = useMemo(() => {
    return rows;
  }, [rows]);

  const displayedBalanceSummary = useMemo(() => {
    if (reportType !== "balance") return summary;
    return displayedBalanceRows.reduce((result, row) => ({
      ...result,
      count: result.count + 1,
      balanceQty: result.balanceQty + Number(row?.balanceQty || 0),
      balanceWeightKg: result.balanceWeightKg + Number(row?.balanceWeightKg || 0),
    }), { count: 0, balanceQty: 0, balanceWeightKg: 0 });
  }, [displayedBalanceRows, reportType, summary]);

  const inboundSummaryRows = useMemo(() => {
    if (reportType !== "inbound" && reportType !== "inbound-fg") return [];
    if (!rows || !rows.length) return [];

    const groupedMap = new Map();
    const groupedKeys = [];

    const targetRows = rows.filter((row) => {
      const catCode = row.categoryCode || "";
      const isFG = ["04", "04-1", "04-2"].includes(catCode);
      const isTarget = reportType === "inbound-fg" ? isFG : !isFG;
      if (!isTarget) return false;

      if (statusFilter === "inbound") return row.status !== "cancelled";
      if (statusFilter === "ready") return row.status === "ready";
      if (statusFilter === "issued") return row.status === "issued";
      if (statusFilter === "cancelled") return row.status === "cancelled";
      return true;
    });

    targetRows.forEach((row) => {
      const dateStr = row.movementAt ? row.movementAt.split("T")[0] : "-";
      const lotNo = String(row.lotNo || "").trim() || "-";
      const productCode = String(row.productCode || "").trim() || "-";
      const productName = String(row.productName || "").trim() || "-";
      const groupKey = `${dateStr}|${lotNo}|${productCode}|${productName}`;

      if (!groupedMap.has(groupKey)) {
        const groupObj = {
          groupKey,
          groupDate: dateStr,
          lotNo,
          productCode,
          productName,
          productDisplay: productCode !== "-" ? `${productCode} - ${productName}` : productName,
          items: [],
        };
        groupedMap.set(groupKey, groupObj);
        groupedKeys.push(groupKey);
      }

      groupedMap.get(groupKey).items.push(row);
    });

    const CHUNK_SIZE = 20;
    const summaryRowsList = [];

    groupedKeys.forEach((key) => {
      const group = groupedMap.get(key);
      const items = group.items;

      for (let i = 0; i < items.length; i += CHUNK_SIZE) {
        const chunk = items.slice(i, i + CHUNK_SIZE);
        const qty = chunk.reduce((sum, item) => sum + Number(item.quantityIn || 0), 0);
        const weight = chunk.reduce((sum, item) => sum + Number(item.weightInKg || 0), 0);

        summaryRowsList.push({
          groupKey: `${group.groupKey}|chunk-${Math.floor(i / CHUNK_SIZE) + 1}`,
          parentGroupKey: group.groupKey,
          groupDate: group.groupDate,
          lotNo: group.lotNo,
          productCode: group.productCode,
          productName: group.productName,
          productDisplay: group.productDisplay,
          batchNo: Math.floor(i / CHUNK_SIZE) + 1,
          quantity: qty,
          totalNetWeightKg: Number(weight.toFixed(3)),
        });
      }
    });

    return summaryRowsList;
  }, [rows, reportType, statusFilter]);

  const inboundSummaryPrintRows = useMemo(() => {
    const virtualRows = [];
    const dateGroups = [];
    const dateMap = new Map();

    inboundSummaryRows.forEach((row) => {
      const prodDate = row.groupDate;
      const groupDateKey = prodDate;

      if (!dateMap.has(groupDateKey)) {
        const dateGroup = {
          key: groupDateKey,
          dateLabel: formatSummaryGroupDateLabel(prodDate),
          items: [],
          totalQuantity: 0,
          totalNetWeightKg: 0,
        };
        dateMap.set(groupDateKey, dateGroup);
        dateGroups.push(dateGroup);
      }

      const dateGroup = dateMap.get(groupDateKey);
      dateGroup.items.push(row);
      dateGroup.totalQuantity += row.quantity;
      dateGroup.totalNetWeightKg += row.totalNetWeightKg;
    });

    dateGroups.forEach((dateGroup) => {
      virtualRows.push({ type: "date-header", label: dateGroup.dateLabel, date: dateGroup.key });

      let currentGroupKey = "";
      let currentGroupItems = [];

      const flushCurrentGroup = () => {
        if (!currentGroupItems.length) return;

        currentGroupItems.forEach((item, index) => {
          virtualRows.push({ type: "item", data: item, sequence: index + 1 });
        });

        const groupQty = currentGroupItems.reduce((acc, i) => acc + (Number(i.quantity) || 0), 0);
        const groupWeight = currentGroupItems.reduce((acc, i) => acc + (Number(i.totalNetWeightKg) || 0), 0);
        virtualRows.push({
          type: "subtotal",
          qty: groupQty,
          weight: Number(groupWeight.toFixed(3)),
        });

        currentGroupItems = [];
      };

      dateGroup.items.forEach((item) => {
        const itemGroupKey = item.parentGroupKey;

        if (currentGroupKey && currentGroupKey !== itemGroupKey) {
          flushCurrentGroup();
        }

        currentGroupKey = itemGroupKey;
        currentGroupItems.push(item);
      });

      flushCurrentGroup();
    });

    return virtualRows;
  }, [inboundSummaryRows]);

  const inboundSummaryReportPages = useMemo(() => {
    if (!inboundSummaryRows.length) return [];

    let pages = [];
    let currentPage = [];
    let currentWeight = 0;
    const FIRST_PAGE_LIMIT = 35;
    const OTHER_PAGE_LIMIT = 45;

    inboundSummaryPrintRows.forEach((row) => {
      let rowWeight = 1;
      if (row.type === "date-header") rowWeight = 2.5;
      if (row.type === "subtotal") rowWeight = 1.2;

      const limit = pages.length === 0 ? FIRST_PAGE_LIMIT : OTHER_PAGE_LIMIT;

      if (currentWeight + rowWeight > limit) {
        pages.push(currentPage);
        currentPage = [];
        currentWeight = 0;
      }
      currentPage.push(row);
      currentWeight += rowWeight;
    });

    if (currentPage.length > 0) {
      pages.push(currentPage);
    }
    return pages;
  }, [inboundSummaryRows, inboundSummaryPrintRows]);

  const inboundSummaryTotalQty = useMemo(() => {
    return inboundSummaryRows.reduce((sum, r) => sum + r.quantity, 0);
  }, [inboundSummaryRows]);

  const inboundSummaryTotalWeight = useMemo(() => {
    return inboundSummaryRows.reduce((sum, r) => sum + r.totalNetWeightKg, 0);
  }, [inboundSummaryRows]);

  const inboundPages = useMemo(() => {
    if (reportType !== "inbound" && reportType !== "inbound-fg") return [];
    
    const allItems = [];
    let lastDate = null;
    let rowIndex = 0;
    
    const safeRows = Array.isArray(filteredInboundRows) ? filteredInboundRows.filter(r => r !== null && r !== undefined) : [];

    const sortedRows = [...safeRows].sort((a, b) => {
      const timeA = a && a.movementAt ? new Date(a.movementAt).getTime() : 0;
      const timeB = b && b.movementAt ? new Date(b.movementAt).getTime() : 0;
      return timeA - timeB;
    });

    sortedRows.forEach((row) => {
      if (!row) return;
      const dateStr = row.movementAt ? row.movementAt.split("T")[0] : null;
      if (dateStr && dateStr !== lastDate) {
        allItems.push({ type: "dateDivider", date: dateStr });
        lastDate = dateStr;
      }
      rowIndex++;
      allItems.push({ type: "row", data: row, index: rowIndex });
    });

    return [allItems];
  }, [filteredInboundRows, reportType]);

  const issuePages = useMemo(() => {
    if (reportType !== "issue") return [];
    const safeRows = (Array.isArray(filteredIssueRows) ? filteredIssueRows : []).filter(Boolean);
    const allItems = [];
    let lastDate = null;
    [...safeRows]
      .sort((left, right) => new Date(left?.movementAt || 0).getTime() - new Date(right?.movementAt || 0).getTime())
      .forEach((row, index) => {
        const date = row.movementAt ? row.movementAt.split("T")[0] : null;
        if (date && date !== lastDate) {
          allItems.push({ type: "dateDivider", date });
          lastDate = date;
        }
        allItems.push({ type: "row", data: row, index: index + 1 });
      });
    return [allItems];
  }, [filteredIssueRows, reportType]);

  useEffect(() => {
    const pageCount = reportType === "issue" ? screenIssuePages.length : screenInboundPages.length;
    setCurrentViewPage((page) => Math.min(page, Math.max(0, pageCount - 1)));
  }, [reportType, screenInboundPages.length, screenIssuePages.length]);

  const totalQty = useMemo(() => {
    return filteredInboundRows.reduce((sum, row) => sum + Number(row.quantityIn || 0), 0);
  }, [filteredInboundRows]);

  const totalWeight = useMemo(() => {
    return filteredInboundRows.reduce((sum, row) => sum + Number(row.weightInKg || 0), 0);
  }, [filteredInboundRows]);

  const issueTotalQty = useMemo(
    () => filteredIssueRows.reduce(
      (sum, row) => sum + Number(row?.kind === "issue_void" ? row?.quantityIn : row?.quantityOut || 0),
      0
    ),
    [filteredIssueRows]
  );
  const issueTotalWeight = useMemo(
    () => filteredIssueRows.reduce(
      (sum, row) => sum + Number(row?.kind === "issue_void" ? row?.weightInKg : row?.weightOutKg || 0),
      0
    ),
    [filteredIssueRows]
  );

  const issueSummaryRows = useMemo(
    () => reportType === "issue" ? buildPieceRateIssueSummaryRows(rows) : [],
    [reportType, rows]
  );

  const loadRows = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ report: reportType });
      if (reportType === "prison") params.set("prisonView", prisonView);
      if (!isBalanceReport) {
        params.set("dateFrom", dateFrom);
        params.set("dateTo", dateTo);
      }
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(`/api/attendance/piece-rate/stock/movements?${params}`, {
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "ไม่สามารถโหลดรายงานได้");
      setRows(payload?.data?.rows || []);
      setSummary(payload?.data?.summary || {});
    } catch (loadError) {
      setError(String(loadError?.message || "ไม่สามารถโหลดรายงานได้"));
      setRows([]);
      setSummary({});
    } finally {
      setIsLoading(false);
    }
  }, [dateFrom, dateTo, isBalanceReport, prisonView, reportType, search]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const nextReportType = normalizeReportType(params.get("report"));
    setReportType((current) => (current === nextReportType ? current : nextReportType));
  }, []);

  const activeTab = useMemo(
    () => REPORT_TABS.find((tab) => tab.key === reportType) || REPORT_TABS[0],
    [reportType]
  );

  try {
    return (
      <main className="piece-rate-stock-report min-h-screen bg-[#eef3f8] p-4 text-[#0b2d55]">
<section className="mx-auto max-w-[1900px] overflow-hidden rounded-xl border border-[#b9cadc] bg-white shadow-sm">
        <header className="screen-header">
          <div>
            <div className="header-kicker">PIECE RATE STOCK</div>
            <h1>รายงานสต็อกป้ายแยม</h1>
            <p>รับเข้า · เบิก · เคลื่อนไหว · คงเหลือ แยกตามสินค้าและ LOT</p>
          </div>
          <div className="header-actions">
            <button type="button" onClick={() => window.print()} className="secondary-action">
              <Printer size={17} />
              พิมพ์รายงาน
            </button>
            <button type="button" className="secondary-action">
              <FileDown size={17} />
              Export Excel
            </button>
            <Link href="/production-line/attendance/piece-rate-scan" className="secondary-action">
              <ArrowLeft size={17} />
              กลับหน้าสแกน
            </Link>
          </div>
        </header>

        {!["inbound", "issue", "movement", "balance"].includes(reportType) && (
          <div className="print-only">
            <ReportHeader reportType={reportType} dateFrom={dateFrom} dateTo={dateTo} summary={summary} />
          </div>
        )}

        <nav className="report-tabs">
          {REPORT_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = tab.key === reportType;
            const hasSubMenu = tab.key === "inbound" || tab.key === "inbound-fg" || tab.key === "issue";

            if (hasSubMenu) {
              return (
                <div key={tab.key} className="relative inline-block">
                  <button
                    type="button"
                    className={`${active ? "active" : ""} flex items-center gap-2`}
                    onClick={() => {
                      if (active) {
                        setOpenDropdown(prev => prev === tab.key ? null : tab.key);
                      } else {
                        setReportType(tab.key);
                        setIsSummaryView(false);
                        setOpenDropdown(tab.key);
                      }
                    }}
                  >
                    <Icon size={18} />
                    <span>{tab.label}</span>
                    <ChevronDown size={14} className={`ml-1 transition-transform ${openDropdown === tab.key ? "rotate-180" : ""}`} />
                  </button>

                  {openDropdown === tab.key && (
                    <div 
                      className="absolute left-0 mt-1 w-44 bg-white border border-slate-200 rounded-lg shadow-lg z-50 py-1 text-left"
                      style={{ boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)" }}
                    >
                      <button
                        type="button"
                        className="w-full text-left px-4 py-2 hover:bg-slate-50 text-xs font-bold text-slate-800 flex items-center gap-2"
                        onClick={() => {
                          setReportType(tab.key);
                          setIsSummaryView(false);
                          setOpenDropdown(null);
                        }}
                      >
                        <span className={`w-2 h-2 rounded-full ${!isSummaryView ? "bg-[#f5c84b]" : "bg-transparent border border-slate-300"}`}></span>
                        แบบรายละเอียด
                      </button>
                      <button
                        type="button"
                        className="w-full text-left px-4 py-2 hover:bg-slate-50 text-xs font-bold text-slate-800 flex items-center gap-2"
                        onClick={() => {
                          setReportType(tab.key);
                          setIsSummaryView(true);
                          setOpenDropdown(null);
                        }}
                      >
                        <span className={`w-2 h-2 rounded-full ${isSummaryView ? "bg-[#f5c84b]" : "bg-transparent border border-slate-300"}`}></span>
                        แบบสรุป
                      </button>
                    </div>
                  )}
                </div>
              );
            }

            return (
              <button
                key={tab.key}
                type="button"
                className={active ? "active" : ""}
                onClick={() => {
                  setReportType(tab.key);
                  setIsSummaryView(false);
                  setOpenDropdown(null);
                }}
              >
                <Icon size={18} />
                {tab.label}
              </button>
            );
          })}
        </nav>

        {reportType === "prison" ? (
          <div className="flex items-center gap-2 border-b border-[#c9d5e4] bg-white px-4 py-3">
            <span className="mr-2 text-xs font-black text-slate-500">ประเภทรายงาน</span>
            {[
              { key: "receipt", label: "รับเข้า" },
              { key: "issue", label: "เบิกออก" },
              { key: "balance", label: "คงเหลือแยก LOT" },
            ].map((item) => (
              <button key={item.key} type="button" onClick={() => setPrisonView(item.key)} className={`h-9 rounded-md border px-4 text-xs font-black ${prisonView === item.key ? "border-[#d7a21f] bg-[#f5c84b] text-[#0b2d55]" : "border-[#c9d5e4] bg-white text-slate-600"}`}>
                {item.label}
              </button>
            ))}
          </div>
        ) : null}

        <form
          className="filter-panel"
          onSubmit={(event) => {
            event.preventDefault();
            void loadRows();
          }}
        >
          {reportType !== "balance" && (
            reportType === "prison" && prisonView === "balance" ? null : <>
              <label>
                จากวันที่
                <input type="date" min={PIECE_RATE_REPORT_START_DATE} value={dateFrom} onChange={(event) => setDateFrom(event.target.value)} />
              </label>
              <label>
                ถึงวันที่
                <input type="date" min={PIECE_RATE_REPORT_START_DATE} value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
              </label>
            </>
          )}
          <label className="search-field">
            ค้นหา
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="เลขป้าย, เอกสาร, สินค้า, LOT, พนักงาน"
            />
          </label>
          {(reportType === "inbound" || reportType === "inbound-fg") && (
            <label>
              สถานะใบชั่ง
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="h-10 min-w-[150px] border border-[#c9d5e4] rounded-lg px-3 text-[#0f172a] text-sm font-bold bg-white focus:outline-none"
              >
                <option value="inbound">รับเข้าทั้งหมด</option>
                <option value="ready">พร้อมเบิก</option>
                <option value="issued">เบิกแล้ว</option>
                <option value="cancelled">ยกเลิกชั่ง</option>
              </select>
            </label>
          )}
          {reportType === "issue" && !isSummaryView && (
            <fieldset className="issue-status-filter flex flex-col gap-1 border-0 p-0">
              <legend className="mb-1 text-xs font-bold text-[#334155]">สถานะการเบิก</legend>
              <div className="flex h-10 items-center gap-1 rounded-lg border border-[#c9d5e4] bg-white px-2">
                {[
                  { value: "issue", label: "เบิกสำเร็จ" },
                  { value: "issue_void", label: "ยกเลิกเบิก" },
                ].map((option) => {
                  const isChecked = issueStatusFilters.includes(option.value);
                  return (
                    <label
                      key={option.value}
                      className={`issue-status-option flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm font-bold transition-colors ${isChecked ? "bg-[#eef4fb] text-[#123c6c]" : "text-[#64748b]"}`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => setIssueStatusFilters((current) => (
                          current.includes(option.value)
                            ? current.filter((value) => value !== option.value)
                            : [...current, option.value]
                        ))}
                        className="h-4 w-4 accent-[#123c6c]"
                      />
                      {option.label}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}
          <button type="submit" className="primary-action">
            <Search size={17} />
            ค้นหา
          </button>
          <button type="button" className="ghost-action" onClick={() => void loadRows()}>
            <RefreshCw size={17} />
            รีเฟรช
          </button>
        </form>

        <div className="report-body">
          {reportType === "movement" && (
            <>
              <div className="screen-only">
                <ReportHeader reportType={reportType} dateFrom={dateFrom} dateTo={dateTo} summary={summary} />
              </div>
              <SummaryCards reportType={reportType} summary={summary} />
            </>
          )}

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
              {error}
            </div>
          ) : null}

          <div className="active-report-label flex items-center justify-between">
            <span>{isSummaryView ? `สรุป${activeTab.label}` : activeTab.label}</span>
            <button type="button" onClick={() => window.print()}>
              <Download size={15} />
              พิมพ์ / บันทึก PDF
            </button>
          </div>

          {reportType === "movement" ? (
            <>
              <MovementReportA4
                variant="screen"
                rows={rows}
                summary={summary}
                isLoading={isLoading}
                dateFrom={dateFrom}
                dateTo={dateTo}
                printedAtLabel={printedAtLabel}
                profile={profile}
              />
              <MovementReportA4
                variant="print"
                rows={rows}
                summary={summary}
                isLoading={isLoading}
                dateFrom={dateFrom}
                dateTo={dateTo}
                printedAtLabel={printedAtLabel}
                profile={profile}
              />
            </>
          ) : reportType === "balance" ? (
            <>
              <BalanceReportA4
                variant="screen"
                rows={displayedBalanceRows}
                summary={displayedBalanceSummary}
                isLoading={isLoading}
                printedAtLabel={printedAtLabel}
                profile={profile}
              />
              <BalanceReportA4
                variant="print"
                rows={displayedBalanceRows}
                summary={displayedBalanceSummary}
                isLoading={isLoading}
                printedAtLabel={printedAtLabel}
                profile={profile}
              />
            </>
          ) : reportType === "prison" ? (
            prisonView === "balance" ? (
              <>
                <BalanceReportA4 variant="screen" rows={rows} summary={summary} isLoading={isLoading} printedAtLabel={printedAtLabel} profile={profile} />
                <BalanceReportA4 variant="print" rows={rows} summary={summary} isLoading={isLoading} printedAtLabel={printedAtLabel} profile={profile} />
              </>
            ) : (
              <DetailTable rows={rows} isLoading={isLoading} reportType={prisonView === "issue" ? "issue" : "prison"} />
            )
          ) : (reportType === "inbound" || reportType === "inbound-fg") ? (
            <>
              {isSummaryView ? (
                <>
                  <InboundSummaryReportA4
                    variant="screen"
                    reportKind={reportType}
                    isLoading={isLoading}
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    currentViewPage={currentViewPage}
                    setCurrentViewPage={setCurrentViewPage}
                    summaryPages={inboundSummaryReportPages}
                    totalQty={inboundSummaryTotalQty}
                    totalWeight={inboundSummaryTotalWeight}
                    printedAtLabel={printedAtLabel}
                    profile={profile}
                  />
                  <InboundSummaryReportA4
                    variant="print"
                    reportKind={reportType}
                    isLoading={isLoading}
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    summaryPages={[inboundSummaryPrintRows]}
                    totalQty={inboundSummaryTotalQty}
                    totalWeight={inboundSummaryTotalWeight}
                    printedAtLabel={printedAtLabel}
                    profile={profile}
                  />
                </>
              ) : (
                <>
                  <InboundReportA4
                    variant="screen"
                    reportKind={reportType}
                    rows={rows}
                    isLoading={isLoading}
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    currentViewPage={currentViewPage}
                    setCurrentViewPage={setCurrentViewPage}
                    inboundPages={screenInboundPages}
                    totalQty={totalQty}
                    totalWeight={totalWeight}
                    printedAtLabel={printedAtLabel}
                    profile={profile}
                  />
                  <InboundReportA4
                    variant="print"
                    reportKind={reportType}
                    rows={rows}
                    isLoading={isLoading}
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    inboundPages={inboundPages}
                    totalQty={totalQty}
                    totalWeight={totalWeight}
                    printedAtLabel={printedAtLabel}
                    profile={profile}
                  />
                  <InboundReportA4
                    variant="measure"
                    reportKind={reportType}
                    rows={rows}
                    isLoading={isLoading}
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    inboundPages={inboundPages}
                    totalQty={totalQty}
                    totalWeight={totalWeight}
                    printedAtLabel={printedAtLabel}
                    profile={profile}
                    onMeasuredPages={setScreenInboundPages}
                  />
                </>
              )}
            </>
          ) : reportType === "issue" ? (
            isSummaryView ? (
              <>
                <IssueSummaryReportA4
                  variant="screen"
                  rows={issueSummaryRows}
                  isLoading={isLoading}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  printedAtLabel={printedAtLabel}
                  profile={profile}
                />
                <IssueSummaryReportA4
                  variant="print"
                  rows={issueSummaryRows}
                  isLoading={isLoading}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  printedAtLabel={printedAtLabel}
                  profile={profile}
                />
              </>
            ) : (
              <>
                <InboundReportA4
                  reportKind="issue"
                  variant="screen"
                  rows={filteredIssueRows}
                  isLoading={isLoading}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  currentViewPage={currentViewPage}
                  setCurrentViewPage={setCurrentViewPage}
                  inboundPages={screenIssuePages}
                  totalQty={issueTotalQty}
                  totalWeight={issueTotalWeight}
                  printedAtLabel={printedAtLabel}
                  profile={profile}
                />
                <InboundReportA4
                  reportKind="issue"
                  variant="print"
                  rows={filteredIssueRows}
                  isLoading={isLoading}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  inboundPages={issuePages}
                  totalQty={issueTotalQty}
                  totalWeight={issueTotalWeight}
                  printedAtLabel={printedAtLabel}
                  profile={profile}
                />
                <InboundReportA4
                  reportKind="issue"
                  variant="measure"
                  rows={filteredIssueRows}
                  isLoading={isLoading}
                  dateFrom={dateFrom}
                  dateTo={dateTo}
                  inboundPages={issuePages}
                  totalQty={issueTotalQty}
                  totalWeight={issueTotalWeight}
                  printedAtLabel={printedAtLabel}
                  profile={profile}
                  onMeasuredPages={setScreenIssuePages}
                />
              </>
            )
          ) : (
            <DetailTable rows={rows} isLoading={isLoading} reportType={reportType} />
          )}
        </div>
        <style>
          {`
            .inbound-print-page {
              font-family: inherit !important;
            }
            .inbound-print-page,
            .inbound-print-page * {
              color: #000000 !important;
            }
            .inbound-print-page table {
              border-collapse: collapse !important;
            }
            .inbound-print-page table th,
            .inbound-print-page table td {
              border: 1px solid #cbd5e1 !important;
            }
            .inbound-print-page table tbody td {
              font-weight: 700 !important;
            }
            .inbound-report-print,
            .print-report-header-row {
              display: none;
            }
            .inbound-report-measure {
              position: fixed;
              left: -10000px;
              top: 0;
              width: 794px;
              visibility: hidden;
              pointer-events: none;
            }
            .stock-report-issue.inbound-report-measure {
              width: 1123px;
            }
            .movement-a4-table {
              font-size: 10.8px;
              line-height: 1.22;
            }
            .movement-a4-table th,
            .movement-a4-table td {
              border: 1px solid #cbd5e1;
              padding: 2.5px 4px;
              line-height: 1.22;
              vertical-align: middle;
              font-variant-numeric: tabular-nums;
            }
            .movement-a4-table th {
              border-color: #64748b;
              background: #f1f5f9;
              font-weight: 900;
              text-align: center;
              white-space: nowrap;
            }
            .movement-a4-table .movement-group-header th {
              background: #e2e8f0;
            }
            .movement-a4-table tbody tr:nth-child(even) {
              background: #f8fafc;
            }
            .movement-a4-table .movement-date-header td {
              border-left: 4px solid #123c6c;
              background: #e5e7eb;
              color: #111827 !important;
              font-weight: 900 !important;
              padding: 5px 12px;
            }
            .movement-a4-table .movement-product-subtotal td {
              background: #f8fafc;
              font-weight: 900 !important;
            }
            .movement-a4-table tfoot td {
              border-top: 2px solid #0f172a;
              background: #f1f5f9;
            }
            .movement-a4-table .movement-number-cell {
              padding-left: 2px;
              padding-right: 2px;
              font-size: 9.6px;
              font-stretch: condensed;
              letter-spacing: -0.35px;
              white-space: nowrap;
            }
            .stock-report-balance .inbound-print-page {
              width: 100%;
              max-width: 794px;
              min-height: 1123px;
              margin: 0 auto;
              border: 1px solid #94a3b8;
              background: #ffffff;
              padding: 16px;
              box-shadow: 0 4px 20px rgba(15, 23, 42, 0.1);
            }
            .balance-a4-table {
              width: 100%;
              table-layout: fixed;
              border-collapse: collapse;
              color: #0f172a;
              font-size: 11px;
              line-height: 1.25;
            }
            .balance-a4-table th,
            .balance-a4-table td {
              border: 1px solid #cbd5e1;
              padding: 5px 6px;
              vertical-align: middle;
              font-variant-numeric: tabular-nums;
            }
            .balance-a4-table th {
              border-color: #64748b;
              background: #f1f5f9;
              font-weight: 900;
              text-align: center;
            }
            .balance-a4-table .balance-product-subtotal td,
            .balance-a4-table tfoot td {
              background: #f8fafc;
              font-weight: 900 !important;
            }
            .balance-a4-table tfoot td {
              border-top: 2px solid #0f172a;
            }
            .balance-product-name {
              overflow: visible;
              white-space: nowrap;
              text-overflow: clip;
              font-size: 11px;
              letter-spacing: -0.1px;
            }
            .movement-product-text {
              display: block;
              max-height: 2.4em;
              overflow: hidden;
              white-space: normal;
              overflow-wrap: anywhere;
              line-height: 1.2;
              text-overflow: clip;
            }
            .stock-report-issue .issue-product-text {
              display: block;
              max-height: 2.5em;
              overflow: hidden;
              white-space: normal !important;
              overflow-wrap: anywhere;
              line-height: 1.25;
              text-overflow: clip !important;
            }
            .issue-summary-report .issue-summary-table th,
            .issue-summary-report .issue-summary-table td {
              white-space: nowrap !important;
              overflow: visible !important;
              text-overflow: clip !important;
              line-height: 1.25;
            }
            .issue-summary-report .issue-summary-name-cell {
              font-size: 10.5px !important;
              letter-spacing: -0.25px !important;
            }
            .issue-summary-report .issue-summary-lot-cell {
              white-space: normal !important;
            }
            .issue-summary-report .issue-summary-lot-line {
              display: flex;
              align-items: baseline;
              justify-content: flex-start;
              gap: 7px;
              min-width: 0;
              white-space: nowrap;
              font-variant-numeric: tabular-nums;
            }
            .issue-summary-report .issue-summary-lot-line + .issue-summary-lot-line {
              margin-top: 2px;
            }
            @media print {
              @page {
                size: ${(isSummaryView && reportType === "issue") || !(["balance"].includes(reportType) || isSummaryView) ? "A4 landscape" : "A4 portrait"} !important;
                margin: 0 !important;
              }
              .inbound-report-container {
                display: block !important;
              }
              .inbound-report-screen {
                display: none !important;
              }
              .inbound-report-measure {
                display: none !important;
              }
              .inbound-report-print {
                display: block !important;
              }
              .inbound-print-page {
                display: block !important;
                margin: 0 auto !important;
                border: none !important;
                box-shadow: none !important;
                width: 210mm !important;
                min-height: 0 !important;
                height: auto !important;
                padding: 2mm !important;
                page-break-after: auto !important;
                break-after: auto !important;
                box-sizing: border-box !important;
                background: #fff !important;
              }
              .stock-report-issue .inbound-print-page {
                width: 297mm !important;
              }
              .stock-report-issue.issue-summary-report .inbound-print-page {
                width: 297mm !important;
                max-width: 297mm !important;
                min-width: 0 !important;
                min-height: 0 !important;
                height: auto !important;
                break-after: auto !important;
                page-break-after: auto !important;
              }
              .stock-report-issue.issue-summary-report,
              .stock-report-issue .issue-summary-pages {
                width: 100% !important;
                min-width: 0 !important;
                overflow: visible !important;
              }
              .stock-report-issue.issue-summary-report {
                max-width: 297mm !important;
              }
              .stock-report-issue.issue-summary-report .inbound-print-page:last-child {
                break-after: auto !important;
                page-break-after: auto !important;
              }
              .stock-report-inbound .inbound-print-page,
              .stock-report-inbound-fg .inbound-print-page {
                width: ${isSummaryView ? "210mm" : "297mm"} !important;
              }
              .stock-report-movement .inbound-print-page {
                width: 297mm !important;
              }
              .stock-report-balance .inbound-print-page {
                width: 210mm !important;
                min-height: 297mm !important;
                padding: 5mm !important;
                break-after: page !important;
                page-break-after: always !important;
              }
              .stock-report-balance .inbound-print-page:last-child {
                break-after: auto !important;
                page-break-after: auto !important;
              }
              .inbound-print-page table {
                width: 100% !important;
                table-layout: fixed !important;
              }
              .inbound-print-page table th,
              .inbound-print-page table td {
                font-size: 10px !important;
                padding: 3px 4px !important;
                border: 0.5px solid #cbd5e1 !important;
                white-space: nowrap !important;
                overflow: visible !important;
                text-overflow: clip !important;
              }
              .inbound-print-page table thead th {
                border: 0.5px solid #000000 !important;
                background-color: #f5f5f5 !important;
              }
              .inbound-print-page table thead {
                display: table-header-group !important;
              }
              .print-report-header-row {
                display: table-row !important;
              }
              .print-report-header-row > th {
                padding: 0 0 2mm !important;
                border: 0 !important;
                background: #ffffff !important;
              }
              .screen-report-header {
                display: none !important;
              }
              .inbound-print-page table tbody tr {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }
              .inbound-print-page table td:nth-child(3) {
                overflow: hidden !important;
                text-overflow: clip !important;
              }
              .stock-report-issue .inbound-print-page table td:nth-child(4),
              .stock-report-issue .inbound-print-page table td:nth-child(8),
              .stock-report-issue .inbound-print-page table td:nth-child(9) {
                overflow: hidden !important;
                text-overflow: clip !important;
              }
              .stock-report-issue .issue-summary-table th,
              .stock-report-issue .issue-summary-table td,
              .stock-report-issue .issue-summary-table td:nth-child(3),
              .stock-report-issue .issue-summary-table td:nth-child(4),
              .stock-report-issue .issue-summary-table td:nth-child(5),
              .stock-report-issue .issue-summary-table td:nth-child(8),
              .stock-report-issue .issue-summary-table td:nth-child(9) {
                max-width: none !important;
                white-space: nowrap !important;
                overflow: visible !important;
                text-overflow: clip !important;
                font-size: 10.5px !important;
                letter-spacing: -0.25px !important;
                padding: 2px 2px !important;
              }
              .inbound-print-page table tfoot td {
                font-size: 10px !important;
                padding: 3px 4px !important;
                border: 0.5px solid #cbd5e1 !important;
              }
              .inbound-print-page table tfoot {
                display: table-row-group !important;
              }
              .stock-report-movement .movement-a4-table th,
              .stock-report-movement .movement-a4-table td {
                font-size: 10.8px !important;
                line-height: 1.22 !important;
                padding: 2.5px 4px !important;
                overflow: hidden !important;
                text-overflow: clip !important;
              }
              .stock-report-movement .movement-number-cell {
                padding-left: 1px !important;
                padding-right: 1px !important;
                font-size: 8.8px !important;
                font-stretch: condensed !important;
                letter-spacing: -0.35px !important;
                white-space: nowrap !important;
              }
              .stock-report-movement .movement-product-text {
                white-space: normal !important;
                max-height: 2.4em !important;
                overflow: hidden !important;
                text-overflow: clip !important;
              }
              .stock-report-movement .movement-date-header,
              .stock-report-movement .movement-product-subtotal {
                break-inside: avoid !important;
                page-break-inside: avoid !important;
              }
              .stock-report-movement .movement-date-header td {
                padding: 3px 6px !important;
                background: #e5e7eb !important;
                font-weight: 900 !important;
              }
            }
          `}
        </style>
      </section>

      <style jsx global>{`
        .piece-rate-stock-report {
          --navy: #123c6c;
          --navy-dark: #0b2d55;
          --gold: #d7a21f;
          --line: #c9d5e4;
        }

        .screen-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 18px 22px;
          color: #fff;
          background: linear-gradient(135deg, var(--navy-dark), var(--navy));
        }

        .header-kicker,
        .report-kicker {
          color: var(--gold);
          font-size: 11px;
          font-weight: 900;
          letter-spacing: 0.18em;
        }

        .screen-header h1 {
          margin: 2px 0 0;
          font-size: 26px;
          font-weight: 900;
        }

        .screen-header p,
        .report-title-section p {
          margin: 2px 0 0;
          font-size: 13px;
          color: #dbeafe;
        }

        .header-actions,
        .report-tabs,
        .active-report-label,
        .filter-panel {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .secondary-action,
        .primary-action,
        .ghost-action,
        .active-report-label button,
        .report-tabs button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          height: 40px;
          border-radius: 8px;
          padding: 0 14px;
          font-size: 13px;
          font-weight: 900;
          transition: 120ms ease;
        }

        .secondary-action {
          border: 1px solid rgba(255, 255, 255, 0.35);
          color: #fff;
          background: rgba(255, 255, 255, 0.06);
        }

        .primary-action {
          border: 1px solid var(--navy-dark);
          color: #fff;
          background: var(--navy-dark);
        }

        .ghost-action,
        .active-report-label button {
          border: 1px solid var(--line);
          color: var(--navy-dark);
          background: #fff;
        }

        .report-tabs {
          padding: 12px 16px;
          border-bottom: 1px solid var(--line);
          background: #f8fafc;
        }

        .report-tabs button {
          border: 1px solid var(--line);
          color: var(--navy-dark);
          background: #fff;
        }

        .report-tabs button.active {
          border-color: var(--gold);
          color: #111827;
          background: #f5c84b;
          box-shadow: inset 0 -2px 0 rgba(11, 45, 85, 0.18);
        }

        .filter-panel {
          padding: 14px 16px;
          border-bottom: 1px solid var(--line);
          background: #fff;
          flex-wrap: wrap;
        }

        .filter-panel label {
          display: grid;
          gap: 5px;
          color: var(--navy-dark);
          font-size: 12px;
          font-weight: 900;
        }

        .filter-panel input:not([type="checkbox"]) {
          height: 40px;
          min-width: 170px;
          border: 1px solid var(--line);
          border-radius: 8px;
          padding: 0 12px;
          color: #0f172a;
          font-size: 14px;
          font-weight: 700;
        }

        .filter-panel .issue-status-filter {
          flex: 0 0 auto;
          min-width: 0;
          max-width: 100%;
        }

        .filter-panel .issue-status-option {
          display: flex;
          white-space: nowrap;
        }

        .filter-panel .issue-status-option input[type="checkbox"] {
          flex: 0 0 auto;
          width: 16px;
          min-width: 16px;
          height: 16px;
          margin: 0;
          padding: 0;
        }

        .filter-panel .search-field {
          flex: 1;
        }

        .filter-panel .search-field input {
          width: 100%;
        }

        .report-body {
          display: grid;
          gap: 14px;
          padding: 16px;
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

        .active-report-label {
          justify-content: space-between;
          color: var(--navy-dark);
          font-size: 16px;
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

        .movement-report-table {
          min-width: 1540px;
          font-size: 12px;
        }

        .detail-report-table {
          min-width: 1180px;
        }

        .balance-report-table {
          min-width: 1050px;
        }

        .report-table th {
          border: 1px solid #294f7a;
          padding: 8px 8px;
          color: #fff;
          background: var(--navy);
          font-weight: 900;
          vertical-align: middle;
        }

        .report-table td {
          border: 1px solid #d7e1ec;
          padding: 7px 8px;
          vertical-align: middle;
        }

        .report-table tbody tr:nth-child(even) {
          background: #f8fafc;
        }

        .report-table tbody tr:hover {
          background: #fff8e5;
        }

        .print-only {
          display: none;
        }

        @media print {
          body {
            background: #fff !important;
          }

          body * {
            visibility: hidden;
          }

          .piece-rate-stock-report,
          .piece-rate-stock-report * {
            visibility: visible;
          }

          .piece-rate-stock-report {
            position: absolute;
            inset: 0;
            min-height: auto !important;
            padding: 0 !important;
            background: #fff !important;
          }

          .piece-rate-stock-report > section {
            max-width: none !important;
            border: 0 !important;
            border-radius: 0 !important;
            box-shadow: none !important;
          }

          .screen-header,
          .report-tabs,
          .filter-panel,
          .screen-only,
          .active-report-label,
          .header-actions {
            display: none !important;
          }

          .print-only {
            display: block !important;
            padding: 0 0 5px;
          }

          .report-body {
            gap: 7px !important;
            padding: 0 !important;
          }

          .report-title-section {
            padding-bottom: 4px !important;
          }

          .report-title-section h1 {
            font-size: 15px !important;
          }

          .report-title-section p,
          .report-kicker,
          .report-summary-text {
            font-size: 8px !important;
          }

          .report-summary-text strong {
            font-size: 14px !important;
          }

          .report-body > .grid {
            display: none !important;
          }

          .report-table-wrap {
            overflow: visible !important;
            border-radius: 0 !important;
          }

          .report-table,
          .movement-report-table,
          .detail-report-table,
          .balance-report-table {
            min-width: 0 !important;
            width: 100% !important;
            font-size: 7px !important;
          }

          .report-table th {
            padding: 2px 3px !important;
          }

          .report-table td {
            padding: 2px 3px !important;
            line-height: 1.12 !important;
          }

          .movement-report-table td:nth-child(2),
          .movement-report-table th:nth-child(2) {
            width: 17% !important;
          }

          .movement-report-table td:nth-child(3),
          .movement-report-table th:nth-child(3) {
            width: 8% !important;
          }
        }
      `}</style>
    </main>
  );
  } catch (err) {
    console.error("[PieceRateStockReport] Main Render crash:", err);
    return (
      <main className="min-h-screen bg-[#eef3f8] p-8 text-rose-800 font-mono">
        <div className="mx-auto max-w-2xl bg-rose-50 border border-rose-300 rounded-xl p-6 shadow-sm">
          <h2 className="text-xl font-bold mb-2">PieceRateStockMovementReportPageClient Render Crash</h2>
          <pre className="text-sm whitespace-pre-wrap">{err.stack || String(err)}</pre>
        </div>
      </main>
    );
  }
}

