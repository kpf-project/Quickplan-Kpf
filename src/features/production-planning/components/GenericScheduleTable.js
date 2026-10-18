"use client";

import { useState, useCallback, useMemo, memo, useRef } from "react";
import { Plus, Trash2, X } from "lucide-react";
import SkuPickerModal from "./PlanningSkuPicker";
import { columnWidth, tableWidth } from "../services/scheduleColumnLayout";
import presentation from "./ScheduleTablePresentation.module.css";
import { highlightStyle } from "../services/scheduleHighlightColors";
import { DATE_COLUMN_ID } from "@/lib/scheduleDateLayout";
import { scheduleColumnsWithFormula, formulaCellCode, formulaCellPatch } from "@/lib/scheduleFormulaLayout";
import { applyColumnColors } from "@/lib/scheduleColumnColors";

const WEEK_DAYS = [
  { key: "mon", label: "\u0e08.", date: "" },
  { key: "tue", label: "\u0e2d.", date: "" },
  { key: "wed", label: "\u0e1e.", date: "" },
  { key: "thu", label: "\u0e1e\u0e24.", date: "" },
  { key: "fri", label: "\u0e28.", date: "" },
  { key: "sat", label: "\u0e2a.", date: "" },
];

const HIGHLIGHT_CLS = {
  blue: "bg-blue-50 text-blue-900",
  amber: "bg-amber-50 text-amber-900",
  orange: "bg-orange-50 text-orange-900",
  indigo: "bg-indigo-50 text-indigo-900",
  teal: "bg-teal-50 text-teal-900",
  purple: "bg-purple-50 text-purple-900",
};

const GROUP_HEADER_CLS = {
  blue: "bg-blue-100 text-blue-800",
  amber: "bg-amber-100 text-amber-800",
  orange: "bg-orange-100 text-orange-800",
  indigo: "bg-indigo-100 text-indigo-800",
  teal: "bg-teal-100 text-teal-800",
  purple: "bg-purple-100 text-purple-800",
};

function getColumnWidthStyle(col) {
  return { width: columnWidth(col) };
}

function formatShiftCellLabel(shift) {
  const name = String(shift?.shiftName || shift?.name || shift?.shiftCode || shift?.code || "").trim();
  const startTime = String(shift?.startTime || shift?.shiftStartTime || "").trim();
  const endTime = String(shift?.endTime || shift?.shiftEndTime || "").trim();
  const timeLabel = startTime && endTime ? ` (${startTime}-${endTime})` : "";
  return `${name || "กะ"}${timeLabel}`;
}

function buildShiftPatch(col, shift) {
  if (!shift) {
    return {
      [col.key]: null,
      shiftId: null,
      shiftCode: null,
      shiftName: null,
      workStartTime: null,
      workEndTime: null,
    };
  }

  const shiftId = String(shift?.shiftId || shift?.id || "").trim() || null;
  const shiftCode = String(shift?.shiftCode || shift?.code || "").trim().toUpperCase() || null;
  const shiftName = String(shift?.shiftName || shift?.name || "").trim() || shiftCode || null;
  const startTime = String(shift?.startTime || shift?.shiftStartTime || "").trim() || null;
  const endTime = String(shift?.endTime || shift?.shiftEndTime || "").trim() || null;

  return {
    [col.key]: formatShiftCellLabel(shift),
    shiftId,
    shiftCode,
    shiftName,
    workStartTime: startTime,
    workEndTime: endTime,
  };
}

function buildHeaderRows(columns) {
  const hasGroups = columns.some((c) => c.group_label);
  if (!hasGroups) {
    return { hasGroups: false, row1: columns.map((c) => ({ type: "col", col: c })), row2: [] };
  }

  const row1 = [];
  const row2 = [];
  const seenGroups = new Set();

  for (const col of columns) {
    if (!col.group_label) {
      row1.push({ type: "col", col, rowspan: 2 });
      continue;
    }

    const groupKey = `${col.group_order}::${col.group_label}`;
    if (!seenGroups.has(groupKey)) {
      seenGroups.add(groupKey);
      const groupCols = columns.filter(
        (candidate) =>
          candidate.group_label === col.group_label &&
          candidate.group_order === col.group_order
      );
      const color = groupCols.find((candidate) => candidate.header_highlight_color)?.header_highlight_color ?? null;
      row1.push({ type: "group", label: col.group_label, cols: groupCols, color, customColor: groupCols.some(candidate => candidate.header_color_explicit) });
    }
    row2.push(col);
  }

  return { hasGroups: true, row1, row2 };
}


const NumCell = memo(function NumCell({ value, onChange, highlight, placeholder = "\u2014" }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const hCls = HIGHLIGHT_CLS[highlight] ?? "";

  if (editing) {
    return (
      <td style={highlightStyle(highlight)} className={`border border-slate-300 p-0 ${hCls}`}>
        <input
          autoFocus
          type="number"
          min="0"
          className="w-full bg-blue-50 px-1.5 py-1.5 text-center text-sm focus:outline-none"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            const nextValue = draft === "" ? null : Number(draft);
            onChange(Number.isNaN(nextValue) ? null : nextValue);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === "Tab") {
              const nextValue = draft === "" ? null : Number(draft);
              onChange(Number.isNaN(nextValue) ? null : nextValue);
              setEditing(false);
            }
            if (e.key === "Escape") setEditing(false);
          }}
        />
      </td>
    );
  }

  return (
    <td
      style={highlightStyle(highlight)} className={`cursor-pointer border border-slate-300 px-1.5 py-1.5 text-center text-sm align-top hover:bg-slate-50 ${hCls}`}
      tabIndex={0}
      role="button"
      aria-label="แก้ไขจำนวน"
      onKeyDown={event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); setDraft(value != null ? String(value) : ""); setEditing(true); } }}
      onClick={() => {
        setDraft(value != null ? String(value) : "");
        setEditing(true);
      }}
    >
      {value != null ? (
        value.toLocaleString("th-TH")
      ) : (
        <span className="text-slate-300">{placeholder}</span>
      )}
    </td>
  );
});

const TextCell = memo(function TextCell({
  value,
  onChange,
  highlight,
  placeholder = "",
  className = "",
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const hCls = HIGHLIGHT_CLS[highlight] ?? "";

  if (editing) {
    return (
      <td style={highlightStyle(highlight)} className={`border border-slate-300 p-0 ${hCls} ${className}`}>
        <input
          autoFocus
          className="w-full bg-blue-50 px-1.5 py-1.5 text-sm focus:outline-none"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            onChange(draft);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onChange(draft);
              setEditing(false);
            }
            if (e.key === "Escape") setEditing(false);
          }}
        />
      </td>
    );
  }

  return (
    <td
      style={highlightStyle(highlight)} className={`cursor-pointer border border-slate-300 px-1.5 py-1.5 text-sm align-top whitespace-normal break-words leading-tight hover:bg-slate-50 ${hCls} ${className}`}
      tabIndex={0}
      role="button"
      aria-label="แก้ไขข้อความ"
      onKeyDown={event => { if (["Enter", " "].includes(event.key)) { event.preventDefault(); setDraft(value || ""); setEditing(true); } }}
      onClick={() => {
        setDraft(value || "");
        setEditing(true);
      }}
    >
      {value || <span className="text-slate-300">{placeholder}</span>}
    </td>
  );
});

const SkuPickerCell = memo(function SkuPickerCell({ value, onChange, skuMap, readOnly = false, highlight, aiProduct, label }) {
  const [modalOpen, setModalOpen] = useState(false);
  const sourceText = aiProduct ? [aiProduct.sourceBrand, aiProduct.sourceProduct, aiProduct.sourceSize].filter(Boolean).join(" · ") : "";
  const missing = Boolean(aiProduct && !value);

  return (
    <td style={highlightStyle(highlight)} className="border border-slate-300 px-1 py-0.5 align-top">
      <button
        onClick={() => {
          if (readOnly) return;
          setModalOpen(true);
        }}
        disabled={readOnly}
        style={missing ? { color: "#B45309", textDecoration: "underline", textUnderlineOffset: "3px" } : undefined}
        className={`w-full rounded px-1.5 py-1 text-left text-sm leading-tight whitespace-normal break-words transition-colors ${
          readOnly ? "" : "hover:bg-slate-50"
        } ${value ? "text-slate-800" : "text-slate-300"}`}
      >
        {value || (missing ? `${label}: ไม่พบสินค้าหรือสูตรที่ตรงกับ “${aiProduct.sourceProduct || "ไม่ทราบ"}”` : "เลือกสินค้า...")}
      </button>
      {sourceText ? <details className="px-1.5 pb-1 text-xs leading-tight" style={{ color: "#526B8A" }}>
        <summary className="cursor-pointer list-none underline underline-offset-[3px]" title="กดดูข้อความต้นฉบับเต็ม">จากใบ: {sourceText}</summary>
        <p className="mt-1 whitespace-pre-wrap break-words">{sourceText}{aiProduct.sourceFormula ? ` · สูตร: ${aiProduct.sourceFormula}` : ""}</p>
      </details> : null}

      {modalOpen && !readOnly ? (
        <SkuPickerModal
          skuMap={skuMap}
          currentValue={value}
          onSelect={onChange}
          onClose={() => setModalOpen(false)}
        />
      ) : null}
    </td>
  );
});

function brandTextColor(value) {
  const brand = String(value || "").trim();
  if (/ระฆังทอง/.test(brand)) return "#102C57";
  if (/แม่มะลิ|แม่มัลิ|\bKPF\b/i.test(brand)) return "#EF1717";
  return undefined;
}

const BrandAutoCell = memo(function BrandAutoCell({ value, highlight }) {
  return (
    <td style={highlightStyle(highlight)} className="border border-slate-300 px-1.5 py-1.5 text-center align-top">
      <span style={{ color: brandTextColor(value) }} className="inline-block max-w-full break-words rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">
        {value || "\u2014"}
      </span>
    </td>
  );
});

const ShiftCell = memo(function ShiftCell({ col, value, onChange, sectionShifts = [] }) {
  const options = Array.isArray(sectionShifts) ? sectionShifts : [];
  const selectedId = String(value?.shiftId || value?.id || "").trim();
  const selectedText = typeof value === "string" ? value : String(value?.label || value?.shiftLabel || "").trim();
  const matchedOption = options.find((shift) => (
    String(shift?.shiftId || shift?.id || "") === selectedId
    || formatShiftCellLabel(shift) === selectedText
  ));
  const selectedValue = String(matchedOption?.shiftId || matchedOption?.id || selectedText || "");

  return (
    <td style={highlightStyle(col.highlight_color)} className="border border-slate-300 px-1 py-0.5 align-top">
      <select
        className="w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-xs font-semibold text-[#102C57] outline-none focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37]/40"
        value={selectedValue}
        onChange={(event) => {
          const nextValue = event.target.value;
          const shift = options.find((item) => (
            String(item?.shiftId || item?.id || "") === nextValue
            || formatShiftCellLabel(item) === nextValue
          ));
          onChange(buildShiftPatch(col, shift || null));
        }}
      >
        <option value="">เลือกกะ</option>
        {!matchedOption && selectedText ? <option value={selectedText}>{selectedText}</option> : null}
        {options.map((shift) => {
          const valueKey = String(shift?.shiftId || shift?.id || formatShiftCellLabel(shift));
          return (
            <option key={valueKey} value={valueKey}>
              {formatShiftCellLabel(shift)}
            </option>
          );
        })}
      </select>
      {!options.length ? (
        <div className="mt-1 text-[10px] text-amber-600">ยังไม่ได้ตั้งกะให้ section นี้</div>
      ) : null}
    </td>
  );
});

function renderCell(col, rowData, onUpdateCells, skuMap, readOnly = false, sectionShifts = [], aiProduct) {
  const value = rowData[col.key] ?? null;
  const hCls = HIGHLIGHT_CLS[col.highlight_color] ?? "";

  if (col.col_type === "formula") {
    const code = formulaCellCode(rowData);
    const label = code === "DEFAULT" ? "หลัก" : code || "—";
    const options = [...new Map((skuMap.get(rowData[col.sku_key])?.formulaOptions || []).map(formula => [formula.formula_code, formula])).values()];
    return <td key={col.id} style={highlightStyle(col.highlight_color)} className={`border border-slate-300 px-1.5 py-1.5 text-center align-top text-sm ${hCls}`}>
      {readOnly || !options.length ? <span title={rowData.formulaName || rowData.formula_name || code}>{label}</span> : <><span className="hidden print:inline">{label}</span><select title={rowData.formulaName || rowData.formula_name || code} aria-label={`สูตรผลิต ${rowData[col.sku_key] || ""}`} className="w-full text-blue-600 underline underline-offset-2 text-sm print:hidden" value={code} onChange={event => { const formula = options.find(item => item.formula_code === event.target.value); if (formula) onUpdateCells(formulaCellPatch(formula)); }}>
        {!options.some(item => item.formula_code === code) && <option value={code}>{label}</option>}
        {options.map(item => <option key={item.formula_code} title={item.formula_name || item.formula_code} value={item.formula_code}>{item.formula_code === "DEFAULT" ? "หลัก" : item.formula_code}</option>)}
      </select></>}
    </td>;
  }

  if (readOnly) {
    let displayValue = value;
    if (displayValue === null || displayValue === undefined || displayValue === "") {
      displayValue = "\u2014";
    } else if (typeof displayValue === "number") {
      displayValue = displayValue.toLocaleString("th-TH");
    }

    const isCompactSingleLineCell =
      col.col_type === "number" ||
      col.col_type === "time" ||
      col.col_type === "shift" ||
      col.col_type === "brand_auto";
    const alignClass = isCompactSingleLineCell ? "text-center whitespace-nowrap" : "";

    return (
      <td
        key={col.id}
        style={highlightStyle(col.highlight_color)}
        className={`border border-slate-300 px-1.5 py-1.5 text-sm text-slate-700 align-top whitespace-normal break-words ${hCls} ${alignClass}`}
      >
        {col.col_type === "brand_auto" ? <span style={{ color: brandTextColor(value) }}>{displayValue}</span> : displayValue}
      </td>
    );
  }

  switch (col.col_type) {
    case "number":
      return (
        <NumCell
          key={col.id}
          value={value}
          onChange={(nextValue) => onUpdateCells({ [col.key]: nextValue })}
          highlight={col.highlight_color}
        />
      );

    case "brand_auto":
      return <BrandAutoCell key={col.id} value={value} highlight={col.highlight_color} />;

    case "shift":
      return (
        <ShiftCell
          key={col.id}
          col={col}
          value={value}
          onChange={(patch) => onUpdateCells(patch)}
          sectionShifts={sectionShifts}
        />
      );

    case "sku_picker":
      return (
        <SkuPickerCell
          key={col.id}
          aiProduct={aiProduct}
          label={col.label}
          highlight={col.highlight_color}
          value={value}
          onChange={(skuName, brand, chosenFormula) => {
            const patch = { [col.key]: skuName };
            if (col.auto_fill_field) patch[col.auto_fill_field] = brand;

            const product = skuMap.get(skuName);
            const formulaOptions = product?.formulaOptions || [];
            const formula = chosenFormula || formulaOptions[0] || null;

            if (formula) {
              patch.formulaCode = formula.formula_code;
              patch.formulaName = formula.formula_name;
              patch.bomVersionId = formula.bom_version_id;
              patch.formula_code = formula.formula_code;
              patch.formula_name = formula.formula_name;
              patch.bom_version_id = formula.bom_version_id;
            } else {
              patch.formulaCode = null;
              patch.formulaName = null;
              patch.bomVersionId = null;
              patch.formula_code = null;
              patch.formula_name = null;
              patch.bom_version_id = null;
            }
            onUpdateCells(patch);
          }}
          skuMap={skuMap}
          readOnly={readOnly}
        />
      );

    case "time":
      return (
        <TextCell
          key={col.id}
          value={value}
          onChange={(nextValue) => onUpdateCells({ [col.key]: nextValue })}
          placeholder="07:00-17:00"
          highlight={col.highlight_color}
          className="text-center whitespace-nowrap"
        />
      );

    default:
      return (
        <TextCell
          key={col.id}
          value={value}
          onChange={(nextValue) => onUpdateCells({ [col.key]: nextValue })}
          placeholder="\u2014"
          highlight={col.highlight_color}
        />
      );
  }
}

const TableRow = memo(function TableRow({
  row,
  day,
  columns,
  onUpdate,
  onDelete,
  skuMap,
  sectionShifts,
  readOnly = false,
  showDate = true,
  dateRowSpan = 1,
  dateLayout,
}) {
  const onUpdateCells = useCallback(
    (patch) => {
      if (readOnly) return;
      onUpdate(row.id, patch);
    },
    [readOnly, row.id, onUpdate]
  );

  const handleDelete = useCallback(() => {
    if (readOnly) return;
    onDelete(row.id);
  }, [readOnly, row.id, onDelete]);

  return (
    <tr className="group hover:bg-slate-50/60">
      {showDate && <td style={highlightStyle(dateLayout?.bodyColor)} rowSpan={dateRowSpan} className="w-40 border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 align-top leading-tight bg-slate-50/50">
        <strong className="block">{day.date}</strong><span className="mt-1 block">{day.label}</span>
      </td>}
      {columns.map((col) => renderCell(col, row.row_data, onUpdateCells, skuMap, readOnly, sectionShifts, row.aiProducts?.find(product => product.columnKey === col.key)))}
      {!readOnly ? (
        <td className="w-7 border border-slate-300 text-center">
          <button
            onClick={handleDelete}
            className="px-1 text-slate-200 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
          >
            <Trash2 size={11} />
          </button>
        </td>
      ) : <td aria-hidden="true" className="w-7 border border-slate-300" />}
    </tr>
  );
});

function DayGroupHeader({ day, colSpan }) {
  return (
    <tr>
      <td
        colSpan={colSpan}
        className="border-t-2 border-b border-b-slate-300 border-t-slate-400 bg-slate-50 px-3 py-1.5 text-xs font-semibold tracking-wide text-slate-600"
      >
        {day.full ?? `${day.label} ${day.date}`}
      </td>
    </tr>
  );
}

function AddDayFooter({ colSpan, days, onAdd }) {
  const [open, setOpen] = useState(false);

  return (
    <tr>
      <td colSpan={colSpan} className="border-t border-slate-300 bg-white px-3 py-2">
        {open ? (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">
              {"\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e41\u0e16\u0e27\u0e2a\u0e33\u0e2b\u0e23\u0e31\u0e1a\u0e27\u0e31\u0e19:"}
            </span>
            {days.map((day) => (
              <button
                key={day.key}
                className="rounded border border-slate-400 px-2.5 py-0.5 text-xs text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  onAdd(day.key);
                  setOpen(false);
                }}
              >
                {day.label} {day.date}
              </button>
            ))}
            <button
              className="text-xs text-slate-500 hover:text-slate-700"
              onClick={() => setOpen(false)}
            >
              {"\u0e22\u0e01\u0e40\u0e25\u0e34\u0e01"}
            </button>
          </div>
        ) : (
          <button
            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
            onClick={() => setOpen(true)}
          >
            <Plus size={11} /> {"\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e41\u0e16\u0e27\u0e43\u0e2b\u0e21\u0e48"}
          </button>
        )}
      </td>
    </tr>
  );
}

function ColumnHeading({ column, onSelect, onResize, selected }) {
  const drag = useRef(null);
  if (!onSelect && !onResize) return column.label;
  return <div className="relative flex min-h-6 items-center justify-center" style={selected ? { outline: "2px solid #0866d6", outlineOffset: 4 } : undefined}>
    <button type="button" className="w-full text-inherit" onClick={() => onSelect?.(column.id)}>{column.label}</button>
    {onResize && <span role="separator" aria-label={`ความกว้าง ${column.label}`} aria-orientation="vertical" aria-valuenow={columnWidth(column)} tabIndex={0}
      className="absolute -right-2 top-[-8px] bottom-[-8px] z-10 w-3 cursor-col-resize touch-none border-r border-blue-300 hover:bg-blue-200"
      onPointerDown={event => { event.preventDefault(); event.stopPropagation(); drag.current = { x: event.clientX, width: columnWidth(column) }; event.currentTarget.setPointerCapture(event.pointerId); onSelect?.(column.id); }}
      onPointerMove={event => { if (drag.current) onResize(column.id, Math.max(48, Math.min(1200, Math.round(drag.current.width + event.clientX - drag.current.x)))); }}
      onPointerUp={event => { drag.current = null; event.currentTarget.releasePointerCapture(event.pointerId); }} onPointerCancel={() => { drag.current = null; }}
      onKeyDown={event => { if (["ArrowLeft", "ArrowRight"].includes(event.key)) { event.preventDefault(); onResize(column.id, Math.max(48, Math.min(1200, columnWidth(column) + (event.key === "ArrowRight" ? 8 : -8)))); } }} />}
  </div>;
}

const TableHeader = memo(function TableHeader({
  dateLayout,
  headerRows,
  showActions = true,
  headerVariant = "default",
  showDate = true,
  onColumnSelect,
  onColumnResize,
  selectedColumnId,
}) {
  const { hasGroups, row1, row2 } = headerRows;
  const isNavy = headerVariant === "navy";
  const headerRowClass = isNavy
    ? "bg-[var(--surface-navy,#102C57)] text-[12px] font-semibold text-white"
    : "bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-700";
  const mainHeaderCellClass = isNavy
    ? "border border-[#0b2040] px-1.5 py-2 text-left align-top whitespace-normal break-words leading-tight"
    : "border border-slate-300 px-1.5 py-2 text-left text-slate-600 align-top whitespace-normal break-words leading-tight";
  const borderClass = isNavy ? "border border-[#0b2040]" : "border border-slate-300";

  return (
    <thead>
      <tr className={headerRowClass}>
        {showDate && <th style={highlightStyle(dateLayout?.headerColor)} rowSpan={hasGroups ? 2 : 1} className={mainHeaderCellClass}>
          <ColumnHeading column={{ id: DATE_COLUMN_ID, label: "วันที่", width: dateLayout?.width || 160 }} onSelect={onColumnSelect} onResize={onColumnResize} selected={selectedColumnId === DATE_COLUMN_ID} />
        </th>}

        {row1.map((item, index) => {
          if (item.type === "col") {
            const col = item.col;
            const widthStyle = getColumnWidthStyle(col);
            const highlightClass =
              (!isNavy || col.header_color_explicit) && col.header_highlight_color ? GROUP_HEADER_CLS[col.header_highlight_color] ?? "" : "";

            return (
              <th
                key={col.id}
                rowSpan={item.rowspan ?? 1}
                style={{ ...widthStyle, ...(!isNavy || col.header_color_explicit ? highlightStyle(col.header_highlight_color) : undefined) }}
                className={`${borderClass} px-1.5 py-2 text-center align-top whitespace-normal break-words leading-tight ${highlightClass}`}
              >
                <ColumnHeading column={col} onSelect={onColumnSelect} onResize={onColumnResize} selected={selectedColumnId === col.id} />
              </th>
            );
          }

          const groupClass = isNavy
            ? "bg-[var(--surface-navy,#102C57)] text-white"
            : GROUP_HEADER_CLS[item.color] ?? "bg-slate-100 text-slate-600";

          return (
            <th
              key={`group-${index}`}
              colSpan={item.cols.length}
              style={!isNavy || item.customColor ? highlightStyle(item.color) : undefined}
              className={`${borderClass} px-1.5 py-1.5 text-center align-top whitespace-normal break-words leading-tight ${groupClass}`}
            >
              {item.label}
            </th>
          );
        })}

        {showActions ? <th rowSpan={hasGroups ? 2 : 1} className={`${borderClass} w-7`} /> : null}
      </tr>

      {hasGroups ? (
        <tr
          className={
            isNavy
              ? "bg-[var(--surface-navy,#102C57)] text-[12px] font-semibold text-white"
              : "bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600"
          }
        >
          {row2.map((col) => {
            const highlightClass =
              (!isNavy || col.header_color_explicit) && col.header_highlight_color ? HIGHLIGHT_CLS[col.header_highlight_color] ?? "" : "";
            const widthStyle = getColumnWidthStyle(col);

            return (
              <th
                key={col.id}
                style={{ ...widthStyle, ...(!isNavy || col.header_color_explicit ? highlightStyle(col.header_highlight_color) : undefined) }}
                className={`${borderClass} px-1.5 py-1.5 text-center align-top whitespace-normal break-words leading-tight ${highlightClass}`}
              >
                <ColumnHeading column={col} onSelect={onColumnSelect} onResize={onColumnResize} selected={selectedColumnId === col.id} />
              </th>
            );
          })}
        </tr>
      ) : null}
    </thead>
  );
});

export default function GenericScheduleTable({
  section,
  rows,
  days,
  skuCatalog,
  onUpdate,
  onDelete,
  onAddRow,
  readOnly = false,
  headerVariant = "default",
  hideDayGroupHeader = false,
  sectionShifts = [],
  onColumnSelect,
  onColumnResize,
  selectedColumnId,
}) {
  const columns = useMemo(
    () => applyColumnColors(scheduleColumnsWithFormula(section.production_schedule_column_defs ?? section.columns ?? [], section.formula_layout), section.column_colors),
    [section.production_schedule_column_defs, section.columns, section.formula_layout, section.column_colors]
  );

  const skuMap = useMemo(() => {
    const nextMap = new Map();
    (skuCatalog ?? []).forEach((item) => nextMap.set(item.name, item));
    return nextMap;
  }, [skuCatalog]);

  const headerRows = useMemo(() => buildHeaderRows(columns), [columns]);
  const showDate = true;
  const dateLayout = section.date_layout || { width: 160 };
  const colSpan = (showDate ? 1 : 0) + columns.length + 1;
  const activeDays = days ?? WEEK_DAYS;

  return (
    <table style={{ width: tableWidth(columns, showDate, true, dateLayout.width), minWidth: tableWidth(columns, showDate, true, dateLayout.width) }} className={`${presentation.table} schedule-configured-table table-fixed border-collapse border border-slate-300 text-sm`}>
      <colgroup>
        {showDate && <col style={{ width: dateLayout.width || 160 }} />}
        {columns.map((col) => (
          <col key={col.id} style={getColumnWidthStyle(col)} />
        ))}
        <col className="w-7" />
      </colgroup>
      <TableHeader
        dateLayout={dateLayout}
        headerRows={headerRows}
        showActions={true}
        headerVariant={headerVariant}
        showDate={showDate}
        onColumnSelect={onColumnSelect}
        onColumnResize={onColumnResize}
        selectedColumnId={selectedColumnId}
      />
      <tbody>
        {activeDays.map((day) => {
          const acceptedKeys = [day.key, ...(day.altKeys ?? [])];
          const dayRows = rows.filter((row) =>
            acceptedKeys.includes(String(row.day_key || "").trim())
          );
          if (!dayRows.length) return null;

          return (
            <DayRowGroup
              dateLayout={dateLayout}
              key={day.key}
              day={day}
              rows={dayRows}
              columns={columns}
              colSpan={colSpan}
              skuMap={skuMap}
              sectionShifts={sectionShifts}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onAddRow={onAddRow}
              readOnly={readOnly}
              hideDayGroupHeader={true}
              showDate={showDate}
            />
          );
        })}
        {!readOnly && onAddRow ? <AddDayFooter colSpan={colSpan} days={activeDays} onAdd={onAddRow} /> : null}
      </tbody>
    </table>
  );
}

function DayRowGroup({
  dateLayout,
  day,
  rows,
  columns,
  colSpan,
  skuMap,
  sectionShifts,
  onUpdate,
  onDelete,
  onAddRow,
  readOnly = false,
  hideDayGroupHeader = false,
  showDate = true,
}) {
  return (
    <>
      {!hideDayGroupHeader ? <DayGroupHeader day={day} colSpan={colSpan} /> : null}
      {rows.map((row, index) => (
        <TableRow
          dateLayout={dateLayout}
          key={row.id}
          row={row}
          day={day}
          columns={columns}
          skuMap={skuMap}
          sectionShifts={sectionShifts}
          onUpdate={onUpdate}
          onDelete={onDelete}
          readOnly={readOnly || row.readOnly === true}
          showDate={showDate && index === 0}
          dateRowSpan={rows.length}
        />
      ))}
    </>
  );
}
