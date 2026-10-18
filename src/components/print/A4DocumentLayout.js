"use client";

import Image from "next/image";
import { useMemo } from "react";
import {
  generateA4PrintCSS,
  formatThaiPrintDateTime,
} from "@/lib/print/printStandards";

import ReportHeader from "./ReportHeader";

/**
 * Universal A4 Document Layout Component
 *
 * Implements ISO 32000-2 and W3C CSS Paged Media standards for all A4 printing.
 * Guarantees crisp vector text, 0.5pt vector strokes, repeated headers (table-header-group),
 * and fragmentation protection (break-inside: avoid).
 */
export default function A4DocumentLayout({
  orientation = "portrait",
  title = "รายงานมาตรฐาน",
  subtitle = "STANDARD REPORT",
  documentNo = null,
  meta = null, // e.g. { left: "แผนก: บรรจุ", center: "ช่วงวันที่: 01/09/69 - 20/09/69", right: "ประเภท: WIP" }
  printedAt = null,
  printedBy = "System",
  showOnScreen = false,
  tableSelector = ".a4-standard-document-table",
  fontSize = "10.5pt",
  customStyles = "",
  footer = null,
  children,
}) {
  const printedAtLabel = useMemo(() => {
    return printedAt || formatThaiPrintDateTime();
  }, [printedAt]);

  const printCss = useMemo(() => {
    return generateA4PrintCSS({
      orientation,
      tableSelector,
      fontSize,
    }) + (customStyles ? `\n@media print {\n${customStyles}\n}` : "");
  }, [orientation, tableSelector, fontSize, customStyles]);

  const containerVisibilityClass = showOnScreen
    ? "block a4-print-container"
    : "hidden print:block a4-print-container";

  return (
    <div className={containerVisibilityClass}>
      <style dangerouslySetInnerHTML={{ __html: printCss }} />

      <table className={tableSelector.replace(/^\./, "")}>
        <thead>
          <ReportHeader
            title={title}
            subtitle={subtitle}
            docNo={documentNo}
            meta={meta}
            printedAt={printedAtLabel}
            printedBy={printedBy}
            variant="table-rows"
            colSpan={100}
          />
        </thead>

        {/* Document Body */}
        <tbody>{children}</tbody>

        {/* Document Footer / Signatures / Summary Blocks (with keep-together) */}
        {footer && (
          <tfoot>
            <tr className="keep-together">
              <td colSpan={100} className="border-none p-0">
                {footer}
              </td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
