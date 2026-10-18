"use client";

import Image from "next/image";
import { Fragment, memo, useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Printer,
  RotateCcw,
  Loader2,
  Search,
} from "lucide-react";
import styles from "./ReportSystem.module.css";
import { formatReportDateText, formatReportGroupLabel } from "@/lib/print/reportDate";

const numberFormatter = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 3 });
const weightFormatter = new Intl.NumberFormat("th-TH", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

export function ReportPageHeader({ title, description, category = "ชั่งและสต็อก", updatedAt, printedBy, onPrint, onExcel, busy }) {
  return (
    <header className={styles.pageHeader}>
      <div>
        <p className={styles.breadcrumb}>ศูนย์รายงาน / {category}</p>
        <h1>{title}</h1>
        <p className={styles.description}>{description}</p>
      </div>
      <div className={styles.pageHeaderRight}>
        <p className={styles.liveStatus}><span />ข้อมูลล่าสุด: {formatReportDateText(updatedAt)}<small>โดย {printedBy}</small></p>
        <div className={styles.headerActions}>
          <button type="button" onClick={onPrint} disabled={busy} className={styles.printButton}>
            <Printer size={17} />พิมพ์ A4
          </button>
          <button type="button" onClick={onExcel} disabled={busy} className={styles.excelButton}>
            <FileSpreadsheet size={17} />ส่งออก Excel
          </button>
        </div>
      </div>
    </header>
  );
}

export function ReportFilterBar({
  dateFrom,
  dateTo,
  showDates = true,
  dateMode = "range",
  productOptions = [],
  selectedProductCodes = [],
  query,
  onDateFromChange,
  onDateToChange,
  onQueryChange,
  onProductCodesChange,
  onSearch,
  onReset,
  busy,
  searching = false,
  customControls,
}) {
  const [productsOpen, setProductsOpen] = useState(false);
  const productPicker = useRef(null);
  useEffect(() => {
    if (!productsOpen) return undefined;
    const close = (event) => { if (!productPicker.current?.contains(event.target)) setProductsOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [productsOpen]);

  return (
    <form className={styles.filterBar} role="search" aria-busy={searching} onSubmit={(event) => { event.preventDefault(); if (!busy) onSearch(); }}>
      {showDates && (
        <label className={styles.filterField}>
          <span>{dateMode === "single" ? "วันที่รายงาน" : "ช่วงวันที่"}</span>
          <div className={styles.dateRange}>
            <input aria-label="วันที่เริ่มต้นรายงาน" type="date" value={dateFrom} onChange={(event) => onDateFromChange(event.target.value)} />
            {dateMode !== "single" && <><b>–</b><input aria-label="วันที่สิ้นสุดรายงาน" type="date" value={dateTo} onChange={(event) => onDateToChange(event.target.value)} /></>}
          </div>
        </label>
      )}
      <div className={`${styles.filterField} ${styles.productFilter}`} ref={productPicker}>
        <span>สินค้า</span>
        <button type="button" className={styles.productButton} aria-expanded={productsOpen} onClick={() => setProductsOpen((open) => !open)}>
          <span>{selectedProductCodes.length ? `เลือกแล้ว ${selectedProductCodes.length} รายการ` : "ทุกสินค้าในรายงาน"}</span>
          <ChevronDown size={15} />
        </button>
        {productsOpen && (
          <div className={styles.productMenu}>
            <button type="button" className={styles.productClear} onClick={() => onProductCodesChange([])}>ทุกสินค้า</button>
            {productOptions.map((product) => {
              const checked = selectedProductCodes.includes(product.code);
              return (
                <label key={product.code}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onProductCodesChange(checked ? selectedProductCodes.filter((code) => code !== product.code) : [...selectedProductCodes, product.code])}
                  />
                  <span>{product.code} - {product.name}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
      <label className={`${styles.filterField} ${styles.queryField}`}>
        <span>ค้นหารหัส / LOT</span>
        <div className={styles.searchInput}><Search size={16} /><input aria-label="ค้นหาสินค้าหรือ LOT" value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="ค้นหาสินค้า, LOT หรือรหัส" /></div>
      </label>
      {customControls}
      <button type="submit" disabled={busy} className={styles.searchButton}>{searching ? <Loader2 size={16} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Search size={16} />}{searching ? "กำลังค้นหา…" : "ค้นหา"}</button>
      <button type="button" disabled={busy} onClick={onReset} className={styles.resetButton}><RotateCcw size={16} />ล้างตัวกรอง</button>
    </form>
  );
}

export function ReportDocument({
  orientation = "portrait",
  title,
  subtitle,
  departmentName,
  dateLabel,
  productLabel = "สินค้าทั้งหมด",
  printedAt,
  printedBy,
  reportId,
  page = 1,
  totalPages = 1,
  variant = "screen",
  documentRef,
  children,
}) {
  return (
    <article
      ref={documentRef}
      className={`${styles.documentPage} ${orientation === "landscape" ? styles.landscape : ""} ${variant === "measure" ? styles.measurementPage : ""}`}
      data-report-document
    >
      <header className={styles.documentHeader} data-report-header>
        <div className={styles.documentBrand}>
          <Image src="/brand/LOGO-KPF1.png" alt="KPF" width={54} height={42} priority unoptimized />
          <div><strong>บริษัท เคพีฟู้ดส์ จำกัด</strong><span>K.P. FOODS CO., LTD.</span></div>
        </div>
        <div className={styles.documentTitle}><h2>{title}</h2><p>{subtitle}</p></div>
        <div className={styles.documentAudit}><span>วันที่พิมพ์: <b>{formatReportDateText(printedAt)}</b></span><span>ผู้ออกรายงาน: <b>{printedBy}</b></span><span>หน้า: <b>{page} / {totalPages}</b></span></div>
      </header>
      <div className={styles.documentMeta} data-report-meta>
        <span>แผนก: <b>{departmentName}</b></span>
        <span>ช่วงวันที่: <b>{formatReportDateText(dateLabel)}</b></span>
        <span>สินค้า: <b>{productLabel}</b></span>
      </div>
      <div className={styles.documentBody} data-report-body>{children}</div>
      <footer className={styles.documentFooter} data-report-footer>
        <span>{reportId}</span><span>พิมพ์โดย {printedBy} · {formatReportDateText(printedAt)}</span><span>หน้า {page} / {totalPages}</span>
      </footer>
    </article>
  );
}

function columnGroups(columns) {
  const groups = [];
  columns.forEach((column) => {
    if (!column.group) {
      groups.push({ key: column.key, label: column.label, span: 1, standalone: true });
      return;
    }
    const last = groups.at(-1);
    if (last?.key === column.group && !last.standalone) last.span += 1;
    else groups.push({ key: column.group, label: column.group, span: 1, standalone: false });
  });
  return groups;
}

function cellValue(column, row) {
  const value = row[column.key];
  if (["issueType", "issue_type"].includes(column.key) || column.label === "ประเภทการเบิก") {
    const type = String(value ?? "").trim().toUpperCase().replace(/^เบิก\s*/, "");
    if (["KPF", "PB", "PRISON", "PROSIN"].includes(type)) {
      return <span className={styles.issueType} data-issue-type={type}>{value}</span>;
    }
  }
  if (column.unbrokenEntries) return <span className={styles.lotEntries}>{String(value ?? "-").split("  |  ").map((entry, index) => <span key={index} className={styles.unbrokenEntry}>{entry.split(" · ").map((part, partIndex) => <span key={partIndex}>{part}</span>)}</span>)}</span>;
  if (column.format === "number" || column.format === "weight") return Number(value || 0) === 0 ? "-" : (column.format === "weight" ? weightFormatter : numberFormatter).format(Number(value));
  if (column.render) return column.render(value, row);
  return value ?? "-";
}

export const ReportTable = memo(function ReportTable({ columns, rows, loading, emptyMessage = "ไม่พบข้อมูลตามเงื่อนไข", totalRow, subtotalSpan = 0, totalSpan = subtotalSpan, renderCell }) {
  const grouped = columns.some((column) => column.group);
  const groups = grouped ? columnGroups(columns) : [];
  return (
    <table className={styles.reportTable}>
      <colgroup>{columns.map((column) => <col key={column.key} style={{ width: column.width, "--screen-width": column.screenWidth }} />)}</colgroup>
      <thead data-report-table-head>
        {grouped && <tr>{groups.map((group) => <th key={group.key} data-column-group={group.standalone ? undefined : group.label} colSpan={group.span} rowSpan={group.standalone ? 2 : 1}>{group.label}</th>)}</tr>}
        <tr>{columns.map((column) => grouped && !column.group ? null : <th key={column.key} data-column-group={column.group}>{column.label}</th>)}</tr>
      </thead>
      <tbody data-report-table-body>
        {loading ? <tr><td colSpan={columns.length} className={styles.emptyCell}>กำลังโหลดข้อมูล…</td></tr> : rows.length ? rows.map((row, index) => {
          if (row._kind === "group") return <tr key={row._key || `group-${index}`} className={styles.groupRow} data-report-row data-keep-with-next><td colSpan={columns.length}>{formatReportGroupLabel(row._label)}</td></tr>;
          if (row._kind === "subtotal" && subtotalSpan > 0) {
            return <tr key={row._key || `subtotal-${index}`} className={styles.subtotalRow} data-report-row><td colSpan={subtotalSpan}>{formatReportGroupLabel(row._label)}</td>{columns.slice(subtotalSpan).map((column) => <td key={column.key} data-column-group={column.group} className={column.align === "right" ? styles.numeric : column.align === "center" ? styles.center : ""}>{cellValue(column, row)}</td>)}</tr>;
          }
          if (row._parts?.length) return <Fragment key={row._key || index}>{row._parts.map((part, partIndex) => <tr key={partIndex} data-report-row={partIndex === 0 ? "" : undefined} data-report-part-count={partIndex === 0 ? row._parts.length : undefined}>{columns.map((column) => {
            const merged = row._rowSpanKeys.includes(column.key);
            if (merged && partIndex > 0) return null;
            return <td key={column.key} rowSpan={merged ? row._parts.length : undefined} data-column-group={column.group} style={column.multiline ? { whiteSpace: "pre-line" } : undefined} className={column.align === "right" ? styles.numeric : column.align === "center" ? styles.center : ""}>{renderCell?.(column, merged ? row : part) ?? cellValue(column, merged ? row : part)}</td>;
          })}</tr>)}</Fragment>;
          return <tr key={row._key || row.id || index} data-report-row>{columns.map((column) => <td key={column.key} data-column-group={column.group} data-comparison={column.signedComparison ? (String(row[column.key]).startsWith("+") ? "positive" : String(row[column.key]).startsWith("-") && row[column.key] !== "-" ? "negative" : undefined) : undefined} style={column.multiline ? { whiteSpace: "pre-line" } : undefined} className={column.align === "right" ? styles.numeric : column.align === "center" ? styles.center : ""}>{renderCell?.(column, row) ?? cellValue(column, row)}</td>)}</tr>;
        }) : <tr><td colSpan={columns.length} className={styles.emptyCell}>{emptyMessage}</td></tr>}
      </tbody>
      {totalRow && <tfoot data-report-total><tr><td colSpan={totalSpan || Math.max(1, columns.length - 2)}>รวมทั้งสิ้น</td>{columns.slice(totalSpan || Math.max(1, columns.length - 2)).map((column) => <td key={column.key} data-column-group={column.group} className={column.align === "right" ? styles.numeric : column.align === "center" ? styles.center : ""}>{cellValue(column, totalRow)}</td>)}</tr></tfoot>}
    </table>
  );
});

export function ReportScreenFooter({ totalCount, updatedAt, page, totalPages, onPageChange }) {
  return (
    <footer className={styles.screenFooter}>
      <span>{numberFormatter.format(totalCount)} รายการ · ข้อมูล ณ {formatReportDateText(updatedAt)}</span>
      <nav aria-label="หน้ารายงาน">
        <button type="button" aria-label="หน้าก่อนหน้า" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft size={16} /></button>
        <strong>{page}</strong>
        <button type="button" aria-label="หน้าถัดไป" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}><ChevronRight size={16} /></button>
      </nav>
      <span className={styles.sheetCount}>แผ่นที่ {page} / {totalPages}</span>
    </footer>
  );
}

export function ReportViewToolbar({ views = [], activeView, onViewChange, actions, ...previewProps }) {
  return (
    <div className={styles.viewToolbar}>
      {views.length > 0 && <nav className={styles.viewTabs} aria-label="รูปแบบรายงาน">
        {views.map(({ value, label }) => <button key={value} type="button" aria-pressed={activeView === value} onClick={() => onViewChange(value)}>{label}</button>)}
      </nav>}
      <div className={styles.viewTools}>
        {actions}
        <ReportPreviewToolbar {...previewProps} />
      </div>
    </div>
  );
}

export function ReportPreviewToolbar({ page, totalPages, zoom, onPageChange, onZoomChange }) {
  return (
    <div className={styles.previewToolbar} aria-label="เครื่องมือดูตัวอย่างรายงาน">
      <div><button type="button" aria-label="หน้าก่อนหน้า" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft size={15} /></button><strong>หน้า {page} / {totalPages}</strong><button type="button" aria-label="หน้าถัดไป" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}><ChevronRight size={15} /></button></div>
      <div><button type="button" aria-label="ย่อรายงาน" disabled={zoom <= 70} onClick={() => onZoomChange(zoom - 10)}>−</button><strong>{zoom}%</strong><button type="button" aria-label="ขยายรายงาน" disabled={zoom >= 120} onClick={() => onZoomChange(zoom + 10)}>+</button></div>
    </div>
  );
}

export async function exportReportExcel({ title, columns, rows, fileName, filters = [] }) {
  const excelModule = await import("exceljs/dist/exceljs.min.js");
  const ExcelJS = excelModule.default || excelModule;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "KPF Production Line";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(title.slice(0, 31));
  sheet.columns = columns.map((column) => ({ header: column.group ? `${column.group}: ${column.label}` : column.label, key: column.key, width: column.excelWidth || 16 }));
  filters.slice().reverse().forEach((filter) => sheet.insertRow(1, [`${filter.label}: ${filter.value}`]));
  rows.filter((row) => !row._kind).forEach((row) => {
    (row._parts || [row]).forEach((part, index) => sheet.addRow(Object.fromEntries(columns.map((column) => [column.key, row._rowSpanKeys?.includes(column.key) ? (index === 0 ? row[column.key] ?? "" : "") : part[column.key] ?? ""]))));
  });
  const headerRow = filters.length + 1;
  sheet.getRow(headerRow).font = { bold: true, color: { argb: "FF102C57" } };
  sheet.getRow(headerRow).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEDF5FC" } };
  sheet.views = [{ state: "frozen", ySplit: headerRow }];
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export { styles as reportSystemStyles };
