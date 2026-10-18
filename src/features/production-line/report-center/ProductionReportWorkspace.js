"use client";

import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { flushSync } from "react-dom";
import {
  ReportDocument,
  ReportFilterBar,
  ReportPageHeader,
  ReportViewToolbar,
  ReportScreenFooter,
  ReportTable,
  exportReportExcel,
  reportSystemStyles,
} from "@/components/reporting/ReportSystem";
import { useUserProfile } from "@/lib/useUserProfile";
import { A4_LANDSCAPE_SPEC, A4_PORTRAIT_SPEC } from "@/lib/print/printStandards";
import { paginateReportItems } from "@/features/attendance/utils/paginateReportItems";
import { buildCenterReportModel } from "./reportDefinitions";
import styles from "./ProductionReportWorkspace.module.css";
import { navigateReport } from "./reportNavigation";
import { PIECE_RATE_REPORT_VIEWS } from "@/features/production-line/reportCenter";
import { useReportSearch } from "@/components/reporting/useReportSearch";
import ReportSearchStatus from "@/components/reporting/ReportSearchStatus";
import { afterReportPaint } from "@/components/reporting/reportSearch";
import ReceiptErpExport from "./ReceiptErpExport";

function thaiDate(value) {
  if (!value) return "ทั้งหมด";
  return new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Asia/Bangkok" })
    .format(new Date(`${value}T12:00:00+07:00`));
}

function nowText() {
  return new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date());
}

function filterRows(rows, query, fields = null) {
  const keyword = query.trim().toLocaleLowerCase("th-TH");
  if (!keyword) return rows;
  const filtered = [];
  let pendingGroup = null;
  let matchedProduct = false;
  rows.forEach((row) => {
    if (row._kind === "group") {
      pendingGroup = row;
      matchedProduct = false;
      return;
    }
    if (row._kind === "subtotal") {
      if (matchedProduct) filtered.push(row);
      pendingGroup = null;
      return;
    }
    if ([row, ...(row._parts || [])].some((part) => (fields ? fields.map(key => part[key]) : Object.values(part)).some((item) => String(item ?? "").toLocaleLowerCase("th-TH").includes(keyword)))) {
      if (pendingGroup) filtered.push(pendingGroup);
      pendingGroup = null;
      matchedProduct = true;
      filtered.push(row);
    }
  });
  return filtered;
}

export default function ProductionReportWorkspace({ initialReport, renderCell, loading = false, searchError = "" }) {
  const router = useRouter();
  const params = useSearchParams();
  const profile = useUserProfile();
  const model = useMemo(() => buildCenterReportModel(initialReport.reportId, initialReport.payload), [initialReport]);
  const { definition } = model;
  const [dateFrom, setDateFrom] = useState(model.dateFrom);
  const [dateTo, setDateTo] = useState(model.dateTo);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [productCodes, setProductCodes] = useState(model.selectedProductCodes);
  const [zoom, setZoom] = useState(100);
  const [busy, setBusy] = useState(false);
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const beforePrint = () => flushSync(() => setPrinting(true));
    const afterPrint = () => setPrinting(false);
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, []);
  const [printPages, setPrintPages] = useState([[]]);
  const [measurement, setMeasurement] = useState(null);
  const { searching, search, error: submitError } = useReportSearch(loading, executeSearch);
  const updating = searching || measurement?.rows !== model.rows;
  const actionsBusy = busy || updating || Boolean(searchError);
  const measurementRef = useRef(null);
  const printedBy = profile.username || "ผู้ใช้งานระบบ";
  const updatedAt = nowText();
  const deferredQuery = useDeferredValue(query);
  const filteredRows = useMemo(() => filterRows(model.rows, deferredQuery, initialReport.reportId === "scale-inbound" ? ["product", "lotNo"] : null), [model.rows, deferredQuery, initialReport.reportId]);
  const erpFilters = useMemo(() => ({ dateFrom: model.dateFrom, dateTo: model.dateTo, productCodes: model.selectedProductCodes, search: query }), [model.dateFrom, model.dateTo, model.selectedProductCodes, query]);
  const dataRows = filteredRows.filter((row) => !row._kind);
  const totalPages = Math.max(1, printPages.length);
  const pageRows = printPages[Math.min(page, totalPages) - 1] || [];
  const dateLabel = model.dateFrom ? definition.dateMode === "single" ? thaiDate(model.dateFrom) : `${thaiDate(model.dateFrom)} – ${thaiDate(model.dateTo || model.dateFrom)}` : "ข้อมูลคงเหลือปัจจุบัน";
  const paper = definition.orientation === "landscape" ? A4_LANDSCAPE_SPEC : A4_PORTRAIT_SPEC;
  const reportFamily = ["scale-inbound", "stock-issue", "stock-balance", "jam-inbound", "jam-fg", "jam-issue", "prison-inbound", "prison-issue"].find((id) => initialReport.reportId === id || initialReport.reportId === `${id}-detail`);
  const isPieceRateReport = PIECE_RATE_REPORT_VIEWS.some((view) => view.value === initialReport.reportId);

  function changeView(value) {
    const next = new URLSearchParams(params.toString());
    next.set("report", isPieceRateReport ? value : `${reportFamily}${value ? "-detail" : ""}`);
    next.delete("view");
    if (dateFrom) next.set("dateFrom", dateFrom);
    if (dateTo) next.set("dateTo", dateTo);
    next.delete("productCodes");
    productCodes.forEach((code) => next.append("productCodes", code));
    navigateReport(router, `/production-line/reports?${next.toString()}`);
  }

  function changeJamFilter(key, value) {
    const next = new URLSearchParams(params.toString());
    next.delete(key);
    const values = Array.isArray(value) ? (value.length ? value : ["none"]) : [value];
    values.forEach((item) => next.append(key, item));
    navigateReport(router, `/production-line/reports?${next.toString()}`);
  }

  useEffect(() => {
    setBusy(false);
    setDateFrom(model.dateFrom);
    setDateTo(model.dateTo);
    setProductCodes(model.selectedProductCodes);
    setPage(1);
  }, [model.dateFrom, model.dateTo, model.selectedProductCodes, initialReport.reportId]);

  useEffect(() => {
    setPage((current) => Math.min(current, Math.max(1, printPages.length)));
  }, [printPages.length]);

  useEffect(() => {
    let cancelled = false;
    const measure = async () => {
      await document.fonts.ready;
      await afterReportPaint();
      if (cancelled) return;
      const root = measurementRef.current;
      const body = root?.querySelector("[data-report-body]");
      const head = root?.querySelector("[data-report-table-head]");
      const rows = Array.from(root?.querySelectorAll("[data-report-row]") || []);
      if (!body || !head || rows.length !== model.rows.length) return;

      const bodyStyle = window.getComputedStyle(body);
      const availableHeight = body.clientHeight
        - (Number.parseFloat(bodyStyle.paddingTop) || 0)
        - (Number.parseFloat(bodyStyle.paddingBottom) || 0)
        - head.getBoundingClientRect().height;
      const rowHeights = rows.map((row) => {
        let height = row.getBoundingClientRect().height;
        let part = row;
        for (let index = 1; index < Number(row.dataset.reportPartCount || 1); index += 1) {
          part = part.nextElementSibling;
          if (part) height += part.getBoundingClientRect().height;
        }
        return height;
      });
      const totalHeight = root.querySelector("[data-report-total]")?.getBoundingClientRect().height || 0;
      setMeasurement({ rows: model.rows, heights: new Map(model.rows.map((row, index) => [row, rowHeights[index]])), availableHeight, totalHeight });
    };
    measure();
    return () => { cancelled = true; };
  }, [model.rows, definition.orientation]);

  useLayoutEffect(() => {
    if (measurement?.rows !== model.rows) return;
    // Filtering reuses measured heights instead of laying out every row again.
    // Group rows keep their next visible row together, even after filtering.
    const heights = filteredRows.map((row) => measurement.heights.get(row) || 0);
    filteredRows.forEach((row, index) => {
      if (row._kind === "group" && heights[index + 1]) {
        heights[index] += heights[index + 1];
        heights[index + 1] = 0;
      }
    });
    setPrintPages(paginateReportItems(filteredRows, heights, measurement.availableHeight, measurement.totalHeight));
  }, [filteredRows, model.rows, measurement]);

  function executeSearch() {
    const next = new URLSearchParams(params.toString());
    if (dateFrom) next.set("dateFrom", dateFrom); else next.delete("dateFrom");
    if (dateTo) next.set("dateTo", dateTo); else next.delete("dateTo");
    next.delete("productCodes");
    productCodes.forEach((code) => next.append("productCodes", code));
    if (next.toString() === params.toString()) {
      window.dispatchEvent(new Event("kpf-report-refresh"));
      return;
    }
    navigateReport(router, `/production-line/reports?${next.toString()}`);
  }

  function reset() {
    setQuery("");
    setDateFrom(model.dateFrom);
    setDateTo(model.dateTo);
    setProductCodes([]);
    setPage(1);
  }

  async function excel() {
    if (actionsBusy) return;
    setBusy(true);
    try {
      await exportReportExcel({
        title: definition.printTitle,
        columns: definition.columns,
        rows: filteredRows,
        fileName: `${initialReport.reportId}-${model.dateFrom || "current"}.xlsx`,
        filters: [
          { label: "แผนก", value: model.departmentName },
          { label: "ช่วงวันที่", value: dateLabel },
        ],
      });
    } finally {
      setBusy(false);
    }
  }

  async function printReport() {
    if (actionsBusy) return;
    setBusy(true);
    setPrinting(true);
    try {
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.print();
    } finally {
      setPrinting(false);
      setBusy(false);
    }
  }

  const table = (rows, showTotal = true, interactive = false) => (
    <ReportTable
      columns={definition.columns}
      rows={rows}
      totalRow={showTotal ? model.totalRow : null}
      subtotalSpan={definition.subtotalSpan}
      totalSpan={definition.totalSpan}
      renderCell={interactive ? renderCell : undefined}
    />
  );
  const documentProps = {
    orientation: definition.orientation,
    title: definition.printTitle,
    subtitle: definition.subtitle,
    departmentName: model.departmentName,
    dateLabel,
    productLabel: model.selectedProductCodes.length ? `เลือก ${model.selectedProductCodes.length} รายการ` : "สินค้าทั้งหมด",
    printedAt: updatedAt,
    printedBy,
    reportId: definition.reportId,
    page: Math.min(page, totalPages),
    totalPages,
  };

  return (
    <section className={styles.workspace}>
      <style>{`@media print{@page{size:${paper.size};margin:${paper.marginCss}}.app-sidebar-desktop,.app-sidebar-mobile-overlay,.app-sidebar-mobile-trigger,.app-sidebar-mobile-panel,.app-sidebar-mobile-bottom-nav,button[aria-label="ผู้ช่วย AI KPF Quickplan"],aside[aria-label="เมนูผู้ช่วย AI"]{display:none!important}main{padding:0!important}}`}</style>
      <ReportPageHeader {...definition} updatedAt={updatedAt} printedBy={printedBy} busy={actionsBusy} onPrint={printReport} onExcel={excel} />
      <ReportFilterBar
        dateFrom={dateFrom}
        dateTo={dateTo}
        showDates={definition.showDates !== false}
        dateMode={definition.dateMode}
        productOptions={model.productOptions}
        selectedProductCodes={productCodes}
        query={query}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onQueryChange={(value) => { setQuery(value); setPage(1); }}
        onProductCodesChange={(value) => { setProductCodes(value); setPage(1); }}
        onSearch={search}
        onReset={reset}
        busy={busy || updating}
        searching={updating}
        customControls={initialReport.reportId.startsWith("wages") ? <div className={reportSystemStyles.filterField}><span>สถานะเอกสาร</span><div className={reportSystemStyles.checkboxOptions}>{[["hideCancelled", "ซ่อนยกเลิก"], ["hideReplaced", "ซ่อนแทนที่"]].map(([key, label]) => <label key={key}><input type="checkbox" checked={params.get(key) !== "false"} onChange={(event) => changeJamFilter(key, String(event.target.checked))} />{label}</label>)}</div></div> : initialReport.reportId.startsWith("jam-") && ["inbound", "inbound-fg"].includes(definition.reportType) ? <label className={reportSystemStyles.filterField}><span>สถานะใบชั่ง</span><select value={params.get("status") || "inbound"} onChange={(event) => changeJamFilter("status", event.target.value)}><option value="inbound">รับเข้าทั้งหมด</option><option value="ready">พร้อมเบิก</option><option value="issued">เบิกแล้ว</option><option value="cancelled">ยกเลิกชั่ง</option></select></label> : initialReport.reportId === "jam-issue-detail" ? <div className={reportSystemStyles.filterField}><span>สถานะการเบิก</span>{["issue", "issue_void"].map((status) => {
          const selected = params.getAll("issueStatuses").length ? params.getAll("issueStatuses") : ["issue"];
          return <label key={status}><input type="checkbox" checked={selected.includes(status)} onChange={() => changeJamFilter("issueStatuses", selected.includes(status) ? selected.filter((value) => value !== status) : [...selected, status])} />{status === "issue" ? "เบิกสำเร็จ" : "ยกเลิกเบิก"}</label>;
        })}</div> : null}
      />
      <ReportViewToolbar
        views={isPieceRateReport ? PIECE_RATE_REPORT_VIEWS : reportFamily ? [{ value: false, label: "สรุป" }, { value: true, label: "ละเอียด" }] : []}
        activeView={isPieceRateReport ? initialReport.reportId : initialReport.reportId.endsWith("-detail")}
        onViewChange={changeView}
        actions={initialReport.reportId === "scale-inbound" ? <ReceiptErpExport filters={erpFilters} disabled={actionsBusy || dateFrom !== model.dateFrom || dateTo !== model.dateTo || JSON.stringify(productCodes) !== JSON.stringify(model.selectedProductCodes)} /> : null}
        page={Math.min(page, totalPages)} totalPages={totalPages} zoom={zoom} onPageChange={setPage} onZoomChange={setZoom}
      />
      <ReportSearchStatus loading={updating} error={searchError || submitError} hasPrevious />
      {initialReport.error && <p role="alert" className={styles.error}>{initialReport.error}</p>}
      {initialReport.warnings?.length > 0 && <p role="status" className={styles.error}>{initialReport.warnings.join(" · ")}</p>}
      <div className={styles.canvas} aria-busy={updating}>
        <div className={styles.screenDocument} style={{ zoom: zoom / 100 }}><ReportDocument {...documentProps}>{table(pageRows, page >= totalPages, true)}</ReportDocument></div>
        {printing && <div className={styles.printDocument}>{printPages.map((rows, index) => <div className={styles.printPage} key={index}><ReportDocument {...documentProps} page={index + 1} totalPages={printPages.length}>{table(rows, index === printPages.length - 1)}</ReportDocument></div>)}</div>}
        {measurement?.rows !== model.rows && <div className={styles.measureDocument} aria-hidden="true"><ReportDocument {...documentProps} variant="measure" documentRef={measurementRef}>{table(model.rows)}</ReportDocument></div>}
      </div>
      <ReportScreenFooter
        totalCount={dataRows.length}
        updatedAt={updatedAt}
        page={Math.min(page, totalPages)}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </section>
  );
}

