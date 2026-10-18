"use client";

import { useMemo, useState, useEffect } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Sparkles, Upload, X, Calendar } from "lucide-react";
import { getProductOptions, moveImportRow, updateImportRow } from "@/lib/scheduleImportReview";
import ScheduleVisionSectionTable from "./ScheduleVisionSectionTable";

function productLabel(product) {
  return [product.sourceBrand, product.sourceProduct, product.sourceSize].filter(Boolean).join(" · ") || "ไม่พบข้อความสินค้า";
}

function unresolvedIssue(issue) {
  return String(issue || "").includes("ต้องยืนยันสินค้า");
}

export default function ScheduleVisionImportModal({
  isOpen,
  onClose,
  deptId,
  templateId,
  dateFrom,
  dateTo,
  onConfirm,
}) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [reviewed, setReviewed] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState("all");

  const rows = useMemo(() => preview?.rows ?? [], [preview]);
  const sections = useMemo(() => preview?.sections ?? [], [preview]);
  const sectionMap = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections]);

  const docDateRange = useMemo(() => {
    const dates = rows.map((r) => r.dayKey).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(String(d || "")));
    if (!dates.length) return null;
    const sorted = [...dates].sort();
    return { min: sorted[0], max: sorted[sorted.length - 1] };
  }, [rows]);

  const isDocOutOfRange = useMemo(() => {
    if (!docDateRange) return false;
    return docDateRange.min < dateFrom || docDateRange.max > dateTo;
  }, [docDateRange, dateFrom, dateTo]);

  const rowCountBySection = useMemo(() => {
    const map = new Map();
    rows.forEach((r) => {
      map.set(r.sectionDefId, (map.get(r.sectionDefId) || 0) + 1);
    });
    return map;
  }, [rows]);

  const blockingIssues = useMemo(() => rows.flatMap((row) => [
    ...row.issues.filter((issue) => !unresolvedIssue(issue)),
    ...row.products.filter((product) => product.status !== "resolved").map(() => "ยังไม่ได้เลือกสินค้า"),
  ]), [rows]);

  const displayedSections = useMemo(() => {
    if (!sections.length) return [];
    if (activeSectionId === "all") {
      return sections.filter((s) => (rowCountBySection.get(s.id) || 0) > 0);
    }
    return sections.filter((s) => s.id === activeSectionId);
  }, [sections, activeSectionId, rowCountBySection]);

  useEffect(() => {
    if (sections.length === 1) {
      setActiveSectionId(sections[0].id);
    } else {
      setActiveSectionId("all");
    }
  }, [sections]);

  function resetAndClose() {
    setFile(null);
    setError("");
    setPreview(null);
    setReviewed(false);
    setActiveSectionId("all");
    onClose();
  }

  async function analyze() {
    if (!file) return;
    setLoading(true);
    setError("");
    setPreview(null);
    setReviewed(false);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("deptId", deptId);
      form.append("templateId", templateId);
      form.append("dateFrom", dateFrom);
      form.append("dateTo", dateTo);
      const response = await fetch("/api/production-planning/schedule/vision-import/preview", {
        method: "POST",
        body: form,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "อ่านเอกสารไม่สำเร็จ");
      setPreview(payload?.data ?? null);
    } catch (nextError) {
      setError(nextError?.message || "อ่านเอกสารไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  }

  function selectProduct(rowId, columnKey, selectionKey) {
    setReviewed(false);
    setPreview((current) => ({
      ...current,
      rows: current.rows.map((row) => {
        if (row.id !== rowId) return row;
        const product = row.products.find((item) => item.columnKey === columnKey);
        const section = sectionMap.get(row.sectionDefId);
        const candidate = getProductOptions(section, columnKey).find((item) => item.selectionKey === selectionKey);
        if (!candidate) return row;
        const column = section.columns.find(item => item.key === columnKey);
        const productLabels = section.columns.filter(item => item.key === columnKey || item.key === column.auto_fill_field).map(item => `${item.label}:`);
        return {
          ...row,
          issues: row.issues.filter(issue => !productLabels.some(label => issue.startsWith(label))),
          rowData: { ...row.rowData, ...candidate.rowPatch },
          products: row.products.map((item) => item.columnKey === columnKey
            ? { ...item, status: "resolved", selectedKey: selectionKey, isSuggested: false, isExact: false, learnAlias: Boolean(product?.candidates.some(option => option.selectionKey === selectionKey)), userConfirmed: true, reviewReason: null }
            : item),
        };
      }),
    }));
  }

  function updateCell(rowId, patch) {
    setReviewed(false);
    setPreview((current) => ({
      ...current,
      rows: current.rows.map((row) => {
        if (row.id !== rowId) return row;
        return updateImportRow(row, patch, sectionMap.get(row.sectionDefId));
      }),
    }));
  }

  function updateRowSection(rowId, nextSectionDefId) {
    setReviewed(false);
    setPreview((current) => ({
      ...current,
      rows: current.rows.map((row) => row.id === rowId
        ? moveImportRow(row, sectionMap.get(row.sectionDefId), sectionMap.get(nextSectionDefId)) : row),
    }));
  }

  function deleteRow(rowId) {
    setReviewed(false);
    setPreview((current) => ({
      ...current,
      rows: current.rows.filter((row) => row.id !== rowId),
    }));
  }

  function confirm() {
    const aliasMap = new Map();
    rows.forEach((row) => {
      row.products
        .filter((product) => product.learnAlias && product.selectedKey)
        .forEach((product) => {
          const candidate = getProductOptions(sectionMap.get(row.sectionDefId), product.columnKey).find((item) => item.selectionKey === product.selectedKey);
          if (!candidate) return;
          const key = `${row.sectionDefId}::${product.columnKey}::${String(product.sourceBrand || "").trim()}::${String(product.sourceProduct || "").trim()}::${String(product.sourceSize || "").trim()}`;
          aliasMap.set(key, {
            sectionDefId: row.sectionDefId,
            productColumnKey: product.columnKey,
            sourceBrand: product.sourceBrand,
            sourceProduct: product.sourceProduct,
            sourceSize: product.sourceSize,
            sourceFormula: product.sourceFormula,
            skuCode: candidate.skuCode,
            formulaCode: candidate.formulaCode,
            userConfirmed: product.userConfirmed === true,
          });
        });
    });
    const aliases = Array.from(aliasMap.values());
    onConfirm({
      rows: rows.map((row) => ({
        sectionDefId: row.sectionDefId,
        dayKey: row.dayKey,
        rowData: { ...row.rowData, visionProductSources: row.products.map(product => ({ columnKey: product.columnKey, sourceBrand: product.sourceBrand, sourceProduct: product.sourceProduct, sourceSize: product.sourceSize, sourceFormula: product.sourceFormula, userConfirmed: product.userConfirmed === true })) },
      })),
      aliases,
      dateRange: docDateRange ? { dateFrom: docDateRange.min, dateTo: docDateRange.max } : null,
    });
    resetAndClose();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#0B192C]/75 p-3 backdrop-blur-sm">
      <div className="flex max-h-[95vh] w-full max-w-[1440px] flex-col overflow-hidden rounded-lg border border-[#d4af37]/40 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between bg-[var(--surface-navy,#102C57)] px-5 py-3.5 text-white">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold tracking-wide">
              <Sparkles size={17} className="text-[#d4af37]" /> นำเข้าแผนการผลิตจากรูป/PDF ด้วย Vision AI
            </div>
            <p className="mt-0.5 text-xs text-blue-100/75">
              ตรวจทานตัวเลข สินค้า และสูตรผลิตก่อนบันทึก · ระบบใส่ตัวเลือกที่คะแนนสูงสุดให้ เว้นว่างเมื่อไม่พบตัวที่ผ่านเงื่อนไข (แก้ไขได้)
            </p>
          </div>
          <button type="button" onClick={resetAndClose} className="rounded p-1 text-white/70 hover:bg-white/10 hover:text-white">
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Upload Area */}
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-3.5">
            <label className="flex cursor-pointer items-center gap-3">
              <span className="rounded-md bg-white p-2.5 text-[#102C57] shadow-sm border border-slate-200"><Upload size={18} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-bold text-slate-800">{file?.name || "เลือกภาพถ่าย แสกน หรือ PDF แผนการผลิต"}</span>
                <span className="text-xs text-slate-500">รองรับ PNG, JPEG, WEBP, GIF หรือ PDF (ไม่เกิน 14 MB)</span>
              </span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
                className="sr-only"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setPreview(null);
                  setError("");
                }}
              />
            </label>
            <div className="mt-2.5 flex items-center justify-between border-t border-slate-200/60 pt-2.5">
              <span className="text-xs text-slate-500">
                ช่วงวันที่แผน: <strong className="text-slate-700">{dateFrom}</strong> ถึง <strong className="text-slate-700">{dateTo}</strong>
              </span>
              <button
                type="button"
                disabled={!file || loading}
                onClick={analyze}
                className="inline-flex items-center gap-1.5 rounded-md bg-[var(--surface-navy,#102C57)] px-4 py-1.5 text-xs font-bold text-white shadow hover:bg-[#163b73] disabled:opacity-40"
              >
                {loading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} className="text-[#d4af37]" />}
                {loading ? "กำลังอ่านและแยกข้อมูลตามเทมเพลต..." : "เริ่มอ่านเอกสาร"}
              </button>
            </div>
          </div>

          {error ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          ) : null}

          {/* Preview Workbench */}
          {preview ? (
            <div className="space-y-3">
              {/* Summary Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-100/80 px-4 py-2.5 border border-slate-200">
                <div className="flex items-center gap-3">
                  <div>
                    <span className="text-xs font-bold text-slate-800">{preview.documentTitle || "ตารางแผนการผลิต"}</span>
                    <span className="ml-2 text-xs text-slate-500">
                      (แผนกที่ตรวจพบ: <strong className="text-slate-700">{preview.detectedDepartment || "ตรงตามแผนก"}</strong>)
                    </span>
                  </div>
                  <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-800">
                    พบทั้งหมด {rows.length} แถว
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  {blockingIssues.length === 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-bold text-emerald-800">
                      <CheckCircle2 size={13} /> พร้อมใส่ลงแบบร่าง
                    </span>
                  ) : (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-3 py-0.5 text-xs font-bold text-amber-800"
                      title={[...new Set(blockingIssues)].join(" · ")}
                    >
                      <AlertTriangle size={13} /> ต้องระบุข้อมูล {blockingIssues.length} จุด
                      <span className="hidden sm:inline font-normal text-amber-700">
                        ({[...new Set(blockingIssues)].slice(0, 2).join(", ")}{[...new Set(blockingIssues)].length > 2 ? "..." : ""})
                      </span>
                    </span>
                  )}
                </div>
              </div>

              {/* Document Date Range Notice */}
              {isDocOutOfRange && docDateRange ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Calendar size={15} className="text-amber-600 shrink-0" />
                    <div>
                      <span className="font-bold">ตรวจพบวันที่ในเอกสาร: {docDateRange.min} ถึง {docDateRange.max}</span>
                      <span className="ml-1 text-amber-700">(ช่วงแผนงานปัจจุบันคือ {dateFrom} ถึง {dateTo})</span>
                    </div>
                  </div>
                  <span className="rounded bg-amber-200/80 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                    ระบบจะปรับช่วงวันที่ของแผนให้อัตโนมัติเมื่อกดบันทึก
                  </span>
                </div>
              ) : null}

              {/* Section Tabs (When multi-section) */}
              {sections.length > 1 ? (
                <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 pb-1">
                  <button
                    type="button"
                    onClick={() => setActiveSectionId("all")}
                    className={`rounded-t-md px-3.5 py-1.5 text-xs font-bold transition-colors ${
                      activeSectionId === "all"
                        ? "border-b-2 border-[#102C57] bg-[var(--surface-navy,#102C57)] text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    ทั้งหมด ({rows.length})
                  </button>
                  {sections.map((section) => {
                    const count = rowCountBySection.get(section.id) || 0;
                    return (
                      <button
                        key={section.id}
                        type="button"
                        onClick={() => setActiveSectionId(section.id)}
                        className={`rounded-t-md px-3.5 py-1.5 text-xs font-bold transition-colors ${
                          activeSectionId === section.id
                            ? "border-b-2 border-[#102C57] bg-[var(--surface-navy,#102C57)] text-white"
                            : count > 0
                            ? "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            : "bg-slate-50 text-slate-400 hover:bg-slate-100"
                        }`}
                      >
                        {section.name} ({count})
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {/* Section Tables */}
              {displayedSections.map((section) => {
                const sectionRows = rows.filter((r) => r.sectionDefId === section.id);
                if (!sectionRows.length && activeSectionId === "all") return null;

                return (
                  <div key={section.id} className="rounded-lg border border-slate-300 bg-white shadow-sm overflow-hidden mb-4">
                    {/* Section Header */}
                    <div className="flex items-center justify-between bg-slate-100 px-4 py-2 border-b border-slate-300">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black uppercase text-[#102C57]">{section.name}</span>
                        <span className="rounded bg-white px-2 py-0.5 text-[10px] font-bold text-slate-600 border border-slate-200">
                          {sectionRows.length} รายการ
                        </span>
                      </div>
                    </div>

                    <ScheduleVisionSectionTable section={section} rows={sectionRows} onUpdate={updateCell} onDelete={deleteRow} />
                    <details className="border-t border-slate-200 bg-slate-50">
                      <summary className="cursor-pointer px-4 py-2 text-xs font-semibold text-slate-700">
                        ตรวจทานผล AI / ข้อความจากกระดาษ / ย้าย Section ({sectionRows.length} แถว)
                      </summary>
                      <div className="divide-y divide-slate-200 px-4">
                        {sectionRows.map((row, index) => (
                          <div key={row.id} className="space-y-2 py-3 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <strong>แถว {index + 1} · {row.dayKey || "ไม่พบวันที่"}</strong>
                              {sections.length > 1 ? (
                                <label className="flex items-center gap-2">ย้าย Section
                                  <select aria-label={`ย้าย Section แถว ${index + 1}`} value={row.sectionDefId} onChange={event => updateRowSection(row.id, event.target.value)} className="rounded border border-slate-300 bg-white px-2 py-1">
                                    {sections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                                  </select>
                                </label>
                              ) : null}
                            </div>
                            {row.products.map(product => (
                              <div key={product.columnKey} className="grid gap-1">
                                <span>กระดาษ: {productLabel(product)} · {product.isSuggested ? "AI แนะนำ — กรุณาตรวจทาน" : product.status === "resolved" ? "จับคู่แล้ว" : "ยังไม่ได้เลือกสินค้า/สูตร"}</span>
                                <select aria-label={`ตรวจเลือกสินค้าแถว ${index + 1} ${product.columnKey}`} value={product.selectedKey || ""} onChange={event => selectProduct(row.id, product.columnKey, event.target.value)} className="max-w-full rounded border border-slate-300 bg-white px-2 py-1">
                                  <option value="">เลือกสินค้าและสูตรในขอบเขต Section</option>
                                  {getProductOptions(section, product.columnKey).map(option => <option key={option.selectionKey} value={option.selectionKey}>{option.skuCode} · {option.name} ({option.formulaName})</option>)}
                                </select>
                                {product.reviewReason ? <p className="text-amber-800">{product.reviewReason}</p> : null}
                              </div>
                            ))}
                            {row.issues.map(issue => <p key={issue} className="text-red-700">{issue}</p>)}
                            {row.warnings?.map(warning => <p key={warning} className="text-amber-800">{warning}</p>)}
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                );
              })}

              {!rows.length ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-6 text-center text-sm font-bold text-amber-800">
                  ไม่พบรายการผลิตในช่วงวันที่ {dateFrom} ถึง {dateTo} หรือเอกสารไม่มีข้อมูลตาราง
                </div>
              ) : null}

              {/* Review Confirmation */}
              <label className="flex items-center gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-xs font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={reviewed}
                  onChange={(event) => setReviewed(event.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-[#102C57] focus:ring-[#d4af37]"
                />
                ฉันตรวจเทียบวันที่ กะ สินค้า สูตร และตัวเลขกับเอกสารต้นฉบับแล้ว พร้อมส่งเข้าแบบร่าง
              </label>
            </div>
          ) : null}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3">
          <div className="text-xs text-slate-500">
            {rows.length > 0 ? (
              <span>
                พร้อมนำเข้า <strong>{rows.length}</strong> แถวลงในแบบร่างของระบบ
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={resetAndClose}
              className="rounded-md border border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={!rows.length || blockingIssues.length > 0 || !reviewed}
              onClick={confirm}
              className="inline-flex items-center gap-1.5 rounded-md bg-[#d4af37] px-5 py-2 text-xs font-black text-[#102C57] hover:bg-[#e0bd45] shadow-sm disabled:cursor-not-allowed disabled:opacity-40"
            >
              <CheckCircle2 size={14} /> ยืนยันและใส่ลงแบบร่าง
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
