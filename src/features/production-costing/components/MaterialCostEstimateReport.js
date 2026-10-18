"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { AlertTriangle, Calculator, Loader2 } from "lucide-react";
import { ReportDocument, ReportPageHeader, ReportPreviewToolbar, ReportTable, exportReportExcel } from "@/components/reporting/ReportSystem";
import { A4_PORTRAIT_SPEC } from "@/lib/print/printStandards";
import { paginateReportItems } from "@/features/attendance/utils/paginateReportItems";
import styles from "./CostReport.module.css";

export default function MaterialCostEstimateReport(props) {
  const { products, skuCode, plannedQty, estimateDate, preparedBy, result, selectedProduct,
    loadingProducts, calculating, error, onSkuChange, onQuantityChange,
    onDateChange, onCalculate, onReset, money, quantity, dateLabel, statusMap } = props;
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(100);
  const [printing, setPrinting] = useState(false);
  const [exporting, setExporting] = useState(false);
  const measurementRef = useRef(null);
  const [measurement, setMeasurement] = useState(null);
  const [printedAt, setPrintedAt] = useState(() => new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date()));
  const columns = useMemo(() => [
    { key: "sequence", label: "#", width: "3%", align: "center" },
    { key: "materialGoodsCode", label: "รหัส", width: "9%" },
    { key: "materialName", label: "วัตถุดิบ", width: "25%" },
    { key: "requiredQty", label: "ปริมาณ", group: `ปริมาณ (ต่อ ${quantity(result?.plannedQty || plannedQty)} หน่วย)`, width: "7%", align: "right", render: (value) => quantity(value) },
    { key: "uomName", label: "หน่วย", group: `ปริมาณ (ต่อ ${quantity(result?.plannedQty || plannedQty)} หน่วย)`, width: "9%", align: "center" },
    { key: "unitPrice", label: "ราคา/หน่วย", width: "10%", align: "right", render: (value) => value == null ? "—" : money(value, 4) },
    { key: "receiptDate", label: "วันที่รับเข้า", width: "9%", align: "center", render: (value) => dateLabel(value) },
    { key: "invoiceNo", label: "เลขที่ INV", width: "13%" },
    { key: "totalAmount", label: "มูลค่า (บาท)", width: "9%", align: "right", render: (value) => value == null ? "—" : money(value) },
    { key: "statusLabel", label: "ตรวจสอบ", width: "6%", align: "center" },
  ], [result?.plannedQty, plannedQty, quantity, money, dateLabel]);
  const printColumns = columns.filter((column) => column.key !== "statusLabel");
  const printWidth = printColumns.reduce((sum, column) => sum + Number.parseFloat(column.width), 0);
  const normalizedPrintColumns = printColumns.map((column) => ({ ...column, width: `${Number.parseFloat(column.width) / printWidth * 100}%` }));
  const rows = useMemo(() => (result?.rows || []).map((row, index) => ({ ...row, sequence: index + 1,
    statusLabel: (statusMap[row.status] || statusMap.missing).label })), [result, statusMap]);
  const pages = measurement?.rows === rows ? measurement.pages : [rows];
  useLayoutEffect(() => {
    let cancelled = false;
    async function measure() {
      await document.fonts.ready;
      if (cancelled) return;
      const root = measurementRef.current;
      const body = root?.querySelector("[data-report-body]");
      const table = root?.querySelector("table");
      const head = root?.querySelector("[data-report-table-head]");
      if (!body || !table || !head) return;
      const bounds = body.getBoundingClientRect();
      const paddingBottom = Number.parseFloat(getComputedStyle(body).paddingBottom) || 0;
      const note = root.querySelector("[data-cost-note]");
      const totals = root.querySelector("[data-cost-totals]");
      // The physical body already excludes the repeated document header/footer.
      // Subtract metadata/table head and the recurring note; reserve totals only on the last page.
      const noteHeight = note ? note.getBoundingClientRect().height + (Number.parseFloat(getComputedStyle(note).marginTop) || 0) : 0;
      const availableHeight = bounds.bottom - paddingBottom - head.getBoundingClientRect().bottom - noteHeight - 2;
      const heights = Array.from(root.querySelectorAll("[data-report-row]"), (row) => row.getBoundingClientRect().height);
      const totalHeight = totals?.getBoundingClientRect().height || 0;
      setMeasurement({ rows, pages: paginateReportItems(rows, heights, availableHeight, totalHeight) });
    }
    measure();
    return () => { cancelled = true; };
  }, [rows, columns, estimateDate, selectedProduct]);
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
  const currentPage = Math.min(page, pages.length);
  const product = result?.product || selectedProduct;
  const totalQty = Number(result?.plannedQty || plannedQty);
  const documentProps = { orientation: "portrait", title: "ประมาณการต้นทุนจาก BOM",
    subtitle: "MATERIAL COST ESTIMATE REPORT", departmentName: "ฝ่ายผลิต",
    dateLabel: dateLabel(estimateDate), productLabel: product?.sku_code || "—",
    printedAt, printedBy: preparedBy, reportId: "REP-COST-ESTIMATE" };

  async function printReport() {
    if (!result) return;
    flushSync(() => {
      setPrintedAt(new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date()));
      setPrinting(true);
    });
    try {
      await document.fonts.ready;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      window.print();
    } finally { setPrinting(false); }
  }
  async function excel() {
    if (!result) return;
    setExporting(true);
    try {
      await exportReportExcel({ title: documentProps.title, columns, rows,
        fileName: `cost-estimate-${product?.sku_code}-${estimateDate}.xlsx`,
        filters: [{ label: "สินค้า", value: `${product?.sku_code} ${product?.sku_name}` },
          { label: "จำนวนผลิต", value: `${totalQty} ${product?.uom_name || "หน่วย"}` },
          { label: "วันที่", value: dateLabel(estimateDate) },
          { label: "รวมค่าวัตถุดิบ", value: money(result.totalMaterialCost) },
          { label: "ต้นทุนต่อหน่วย", value: totalQty > 0 ? money(result.totalMaterialCost / totalQty) : "—" }] });
    } catch (reason) { window.alert(reason.message || "ส่งออก Excel ไม่สำเร็จ"); }
    finally { setExporting(false); }
  }
  function documentContent(pageRows, lastPage, interactive) {
    return <>
      <div className={styles.metadata}>
        <span><b>สินค้า:</b> {product?.sku_code || "—"}<small>{product?.sku_name || "ยังไม่ได้เลือกสินค้า"}</small></span>
        <span><b>จำนวนผลิต:</b> {quantity(totalQty)} {product?.uom_name || "หน่วย"}</span>
        <span><b>สูตร BOM:</b> DEFAULT ที่อนุมัติแล้ว</span>
        <span><b>แหล่งราคา:</b> ราคาล่าสุด<small>ราคาไม่รวม VAT</small></span>
      </div>
      <ReportTable columns={interactive ? columns : normalizedPrintColumns} rows={pageRows} emptyMessage="เลือกสินค้าและจำนวนผลิต แล้วกดคำนวณ"
        renderCell={(column, row) => {
          if (column.key === "materialName") return <span>{row.materialName}{row.materialGoodsCode !== row.materialSkuCode && <small className={styles.sku}>SKU {row.materialSkuCode}</small>}</span>;
          if (column.key === "statusLabel") return interactive ? <Link title={`${row.reviewReason || row.statusLabel} — ดูที่มาราคา`} href={`/raw-material-receipts?search=${encodeURIComponent(row.materialGoodsCode || row.materialSkuCode)}`}>{row.statusLabel}</Link> : row.statusLabel;
          return undefined;
        }} />
      {result && lastPage && <div className={styles.totals} data-cost-totals>
        <div><b>รวมมูลค่าวัตถุดิบ (บาท)</b><strong>{money(result.totalMaterialCost)}</strong></div>
        <div><b>ต้นทุนต่อหน่วย (บาท / {product?.uom_name || "หน่วย"})</b><strong>{totalQty > 0 ? money(result.totalMaterialCost / totalQty) : "—"}</strong></div>
      </div>}
      <p className={styles.note} data-cost-note>ใช้สำหรับประมาณการ ไม่ใช่ต้นทุนจริง</p>
    </>;
  }
  return <main className={styles.workspace}>
    <ReportPageHeader title="ประมาณการต้นทุนจาก BOM" category="ต้นทุน" description="คำนวณจากสูตร BOM ที่อนุมัติแล้วและราคาล่าสุดไม่รวม VAT"
      updatedAt={printedAt} printedBy={preparedBy} busy={!result || calculating || exporting} onPrint={printReport} onExcel={excel} />
    <nav className={styles.tabs} aria-label="รายงานต้นทุน">
      <Link href="/production-line/reports?report=cost-estimate" aria-current="page">ประมาณการจาก BOM</Link>
      <Link href="/production-line/reports?report=cost-lot">ต้นทุนตาม WIP / FG</Link>
    </nav>
    <form className={styles.filters} onSubmit={onCalculate}>
      <label>สินค้า<input list="cost-estimate-products" value={skuCode} placeholder={loadingProducts ? "กำลังโหลดสินค้า…" : "เลือกสินค้าที่มี BOM อนุมัติแล้ว"} onChange={(event) => { onSkuChange(event.target.value); setPage(1); }} /><datalist id="cost-estimate-products">{products.map((entry) => <option key={entry.sku_code} value={entry.sku_code}>{entry.sku_name}</option>)}</datalist></label>
      <label>จำนวนผลิต (แผน)<div className={styles.quantity}><input aria-label="จำนวนผลิต (แผน)" type="number" min="0.0001" step="0.0001" value={plannedQty} onChange={(event) => { onQuantityChange(event.target.value); setPage(1); }} /><span>{product?.uom_name || "หน่วย"}</span></div></label>
      <label>วันที่ผลิต (แผน)<input type="date" value={estimateDate} onChange={(event) => { onDateChange(event.target.value); setPage(1); }} /></label>
      <label>แหล่งราคา<select aria-label="แหล่งราคา" value="latest" disabled><option value="latest">ราคาล่าสุด</option></select></label>
      <button type="submit" disabled={!selectedProduct || !(Number(plannedQty) > 0) || calculating}>{calculating ? <Loader2 size={18} className="animate-spin" /> : <Calculator size={18} />}คำนวณ</button>
    </form>
    {error && <p role="alert" className={styles.error}><AlertTriangle size={16} />{error}</p>}
    <div className={styles.canvas}>
      <div className={styles.screen}>
        <ReportPreviewToolbar page={currentPage} totalPages={pages.length} zoom={zoom} onPageChange={setPage} onZoomChange={setZoom} />
        <div className={styles.horizontalScroll}><div className={styles.document} style={{ zoom: zoom / 100 }}><ReportDocument {...documentProps} page={currentPage} totalPages={pages.length}>{documentContent(pages[currentPage - 1], currentPage === pages.length, true)}</ReportDocument></div></div>
      </div>
      {printing && <div className={styles.print}>{pages.map((pageRows, index) => <div className={styles.printPage} key={index}><ReportDocument {...documentProps} page={index + 1} totalPages={pages.length}>{documentContent(pageRows, index === pages.length - 1, false)}</ReportDocument></div>)}</div>}
      <div className={styles.measure} aria-hidden="true"><ReportDocument {...documentProps} variant="measure" documentRef={measurementRef}>{documentContent(rows, true, false)}</ReportDocument></div>
    </div>
    <div className={styles.secondary}><button type="button" onClick={onReset}>ล้างผลคำนวณ</button><button type="button" disabled>บันทึกเป็นแบบร่าง</button></div>
    <style>{`@media print { @page { size: ${A4_PORTRAIT_SPEC.size}; margin: ${A4_PORTRAIT_SPEC.marginCss}; } }`}</style>
  </main>;
}
