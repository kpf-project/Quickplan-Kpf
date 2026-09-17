"use client";

import { useState, useCallback, useMemo, memo, useEffect, useRef } from "react";
import { AlertTriangle, ArrowRight, Plus, Trash2, Search, X } from "lucide-react";

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
  if (col?.width) return { width: col.width };
  if (col?.col_type === "time") return { width: 150 };
  return undefined;
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
      const color = groupCols.find((candidate) => candidate.highlight_color)?.highlight_color ?? null;
      row1.push({ type: "group", label: col.group_label, cols: groupCols, color });
    }
    row2.push(col);
  }

  return { hasGroups: true, row1, row2 };
}

function SkuPickerModal({ skuMap, currentValue, onSelect, onClose }) {
  const [q, setQ] = useState("");
  const [bomFilter, setBomFilter] = useState("all");
  const [blockedItem, setBlockedItem] = useState(null);
  const [selectedFormulas, setSelectedFormulas] = useState(new Map());
  const inputRef = useRef(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const list = useMemo(() => {
    const entries = Array.from(skuMap.entries());
    return entries.filter(([name, item]) => {
      if (bomFilter === "has_bom" && !item.hasBom) return false;
      if (bomFilter === "no_bom" && item.hasBom) return false;
      if (!q.trim()) return true;
      const lower = q.toLowerCase();
      return name.toLowerCase().includes(lower) || item.skuCode.toLowerCase().includes(lower);
    });
  }, [q, skuMap, bomFilter]);

  function handleSelect(name, item, chosenFormula = null) {
    if (!item?.hasBom) {
      setBlockedItem({ name, item });
      return;
    }
    const formulaOptions = item.formulaOptions || [];
    const selectedFormulaCode = selectedFormulas.get(item.skuCode) || formulaOptions[0]?.formula_code || "";
    const formula = chosenFormula || formulaOptions.find(f => f.formula_code === selectedFormulaCode) || formulaOptions[0] || null;
    onSelect(name, item.brand, formula);
    onClose();
  }

  const blockedSkuCode = String(blockedItem?.item?.skuCode || "").trim();
  const bomHref = blockedSkuCode
    ? `/production-line/bom?sku=${encodeURIComponent(blockedSkuCode)}`
    : "/production-line/bom";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B192C]/60 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mx-4 flex max-h-[78vh] w-full max-w-3xl flex-col rounded-[2px] border border-[#D4AF37]/45 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#D4AF37]/35 bg-[#0B192C] px-4 py-3 rounded-t-[2px]">
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#D4AF37]">
            เลือกสินค้า (SELECT PRODUCT)
          </h3>
          <button onClick={onClose} className="rounded-[2px] p-0.5 text-slate-400 hover:text-[#D4AF37]">
            <X size={16} />
          </button>
        </div>

        <div className="space-y-2 border-b border-[#102C57]/10 px-4 py-2.5">
          <div className="flex items-center gap-2 rounded-[2px] border border-slate-200 bg-slate-50 px-2.5 py-1.5 focus-within:border-[#D4AF37] focus-within:ring-1 focus-within:ring-[#D4AF37]/35">
            <Search size={13} className="shrink-0 text-slate-400" />
            <input
              ref={inputRef}
              className="flex-1 bg-transparent text-xs text-slate-700 placeholder-slate-400 focus:outline-none"
              placeholder="ค้นหาชื่อสินค้า หรือ รหัสสินค้า..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {q ? (
              <button onClick={() => setQ("")} className="text-slate-400 hover:text-slate-600">
                <X size={12} />
              </button>
            ) : null}
          </div>

          <div className="flex items-center gap-1.5">
            {[
              { value: "all", label: "ทุกสถานะ" },
              { value: "has_bom", label: "มีสูตร BOM" },
              { value: "no_bom", label: "ยังไม่มี BOM" },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setBomFilter(opt.value)}
                className={`rounded-[2px] px-3 py-0.5 text-[10px] uppercase tracking-wider font-bold transition-colors ${
                  bomFilter === opt.value
                    ? opt.value === "no_bom"
                      ? "bg-[#D4AF37] text-[#0B192C] font-black border border-[#D4AF37]"
                      : "bg-[#0B192C] text-[#D4AF37] border border-[#0B192C]"
                    : "border border-slate-200 text-slate-500 hover:border-[#D4AF37] hover:text-[#D4AF37] bg-white"
                }`}
              >
                {opt.label}
              </button>
            ))}
            <span className="ml-auto text-[10px] uppercase tracking-wider font-semibold text-slate-400">
              {list.length} รายการ
              {q || bomFilter !== "all" ? ` (จาก ${skuMap.size})` : ""}
            </span>
          </div>

          {blockedItem ? (
            <div className="rounded-[2px] border border-[#D4AF37]/70 bg-slate-50 px-3 py-2 text-[#0B192C]">
              <div className="flex items-start gap-2">
                <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[#D4AF37]" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-[#0B192C]">
                    สินค้านี้ยังไม่มี BOM ต้องผูกสูตรก่อนนำไปวางแผน
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-[#0B192C]/75">
                    {blockedSkuCode || "-"} {blockedItem.name || ""}
                  </div>
                </div>
                <a
                  href={bomHref}
                  className="inline-flex shrink-0 items-center gap-1 rounded-[2px] border border-[#D4AF37] bg-white px-2.5 py-1 text-[10px] uppercase tracking-wider font-bold text-[#0B192C] hover:bg-[#D4AF37] hover:text-[#0B192C] transition-colors"
                >
                  ไปหน้า BOM
                  <ArrowRight size={12} />
                </a>
              </div>
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-[120px_1fr_120px_60px_60px_90px] gap-0 border-b border-[#D4AF37]/25 bg-slate-50 px-4 py-2 text-[10px] font-black uppercase tracking-wider text-[#0B192C]">
          <span>รหัสสินค้า (SKU)</span>
          <span>ชื่อสินค้า (NAME)</span>
          <span>สูตรผลิต (BOM)</span>
          <span>หน่วย (UOM)</span>
          <span>ประเภท (TYPE)</span>
          <span>BOM STATUS</span>
        </div>

        <div className="flex-1 overflow-y-auto">
          {list.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-400">
              {"ไม่มีสินค้า"}
            </div>
          ) : (
            list.map(([name, item]) => {
              const formulaOptions = item.formulaOptions || [];
              const rawOptions = formulaOptions || [];
              // Deduplicate options in modal just in case
              const seen = new Set();
              const uniqueFormulas = [];
              rawOptions.forEach(opt => {
                const code = String(opt.formula_code || "DEFAULT").trim().toUpperCase();
                if (!seen.has(code)) {
                  seen.add(code);
                  uniqueFormulas.push(opt);
                }
              });

              const selectedFormulaCode = selectedFormulas.get(item.skuCode) || uniqueFormulas[0]?.formula_code || "";
              const currentFormula = uniqueFormulas.find(f => f.formula_code === selectedFormulaCode) || uniqueFormulas[0] || null;

              return (
                <div
                  key={name}
                  className={`grid w-full grid-cols-[120px_1fr_120px_60px_60px_90px] items-center gap-0 border-b border-slate-100 px-4 py-2.5 text-left transition-colors ${
                    currentValue === name ? "bg-[#102C57]/10 border-l-2 border-[#D4AF37]" : "hover:bg-[#0B192C]/5"
                  }`}
                >
                  <button
                    onClick={() => {
                      handleSelect(name, item, currentFormula);
                    }}
                    className="text-left font-mono text-[11px] font-semibold text-[#0B192C] truncate pr-2 h-full hover:text-[#D4AF37] transition-colors duration-150 animate-none"
                  >
                    {item.skuCode || "\u2014"}
                  </button>

                  <button
                    onClick={() => {
                      handleSelect(name, item, currentFormula);
                    }}
                    className="text-left text-xs font-semibold text-slate-800 truncate w-full pr-2 h-full hover:text-[#D4AF37] transition-colors duration-150 animate-none"
                    title={name}
                  >
                    {name}
                  </button>

                  <div className="px-1" onClick={(e) => e.stopPropagation()}>
                    {item.hasBom && uniqueFormulas.length > 0 ? (
                      <select
                        className="w-full rounded-[2px] border border-slate-200 bg-white px-1.5 py-0.5 text-[11px] font-bold text-[#0B192C] outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/35"
                        value={selectedFormulaCode}
                        onChange={(e) => {
                          const nextMap = new Map(selectedFormulas);
                          nextMap.set(item.skuCode, e.target.value);
                          setSelectedFormulas(nextMap);
                        }}
                      >
                        {uniqueFormulas.map((formula) => (
                          <option key={formula.formula_code} value={formula.formula_code}>
                            {formula.formula_name || formula.formula_code}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-[11px] text-slate-400">—</span>
                    )}
                  </div>

                  <span className="text-[11px] font-medium text-slate-600">{item.unit || "\u2014"}</span>

                  <span>
                    <span className={`inline-block rounded-[2px] border px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider ${
                      item.itemType === "WIP"
                        ? "border-[#D4AF37] bg-[#102C57]/5 text-[#0B192C]"
                        : "border-[#0B192C]/20 bg-[#0B192C]/5 text-[#0B192C]"
                    }`}
                    >
                      {item.itemType || "FG"}
                    </span>
                  </span>

                  <span>
                    {item.hasBom ? (
                      <span className="inline-block rounded-[2px] border border-[#0B192C]/20 bg-white px-1.5 py-0.5 text-[9px] font-bold text-[#0B192C] uppercase tracking-wider">
                        มีสูตร
                      </span>
                    ) : (
                      <span className="inline-block rounded-[2px] border border-[#D4AF37] bg-white px-1.5 py-0.5 text-[9px] font-bold text-[#D4AF37] uppercase tracking-wider">
                        ยังไม่มี
                      </span>
                    )}
                  </span>
                </div>
              );
            })
          )}
        </div>

        {currentValue ? (
          <div className="border-t border-slate-100 px-4 py-2">
            <button
              onClick={() => {
                onSelect(null, null);
                onClose();
              }}
              className="text-[10px] uppercase tracking-wider font-extrabold text-slate-400 transition-colors hover:text-red-500"
            >
              {"\u0e25\u0e49\u0e32\u0e07\u0e04\u0e48\u0e32"}
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const NumCell = memo(function NumCell({ value, onChange, highlight, placeholder = "\u2014" }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const hCls = HIGHLIGHT_CLS[highlight] ?? "";

  if (editing) {
    return (
      <td className={`border border-slate-300 p-0 ${hCls}`}>
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
      className={`cursor-pointer border border-slate-300 px-1.5 py-1.5 text-center text-sm align-top hover:bg-slate-50 ${hCls}`}
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
      <td className={`border border-slate-300 p-0 ${hCls} ${className}`}>
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
      className={`cursor-pointer border border-slate-300 px-1.5 py-1.5 text-sm align-top whitespace-normal break-words leading-tight hover:bg-slate-50 ${hCls} ${className}`}
      onClick={() => {
        setDraft(value || "");
        setEditing(true);
      }}
    >
      {value || <span className="text-slate-300">{placeholder}</span>}
    </td>
  );
});

const SkuPickerCell = memo(function SkuPickerCell({ value, rowData, onChange, onUpdate, skuMap, readOnly = false }) {
  const [modalOpen, setModalOpen] = useState(false);

  const matchedProduct = value ? skuMap.get(value) : null;
  const formulaOptions = useMemo(() => {
    const rawOptions = matchedProduct?.formulaOptions || [];
    const seen = new Set();
    const unique = [];
    rawOptions.forEach(opt => {
      const code = String(opt.formula_code || "DEFAULT").trim().toUpperCase();
      if (!seen.has(code)) {
        seen.add(code);
        unique.push(opt);
      }
    });
    return unique;
  }, [matchedProduct]);

  return (
    <td className="border border-slate-300 px-1 py-0.5 align-top">
      <button
        onClick={() => {
          if (readOnly) return;
          setModalOpen(true);
        }}
        disabled={readOnly}
        className={`w-full rounded px-1.5 py-1 text-left text-sm leading-tight whitespace-normal break-words transition-colors ${
          readOnly ? "" : "hover:bg-slate-50"
        } ${value ? "text-slate-800" : "text-slate-300"}`}
      >
        {value || "เลือกสินค้า..."}
      </button>

      {value && formulaOptions.length > 0 && (
        <div className="mt-1" onClick={(e) => e.stopPropagation()}>
          <select
            disabled={readOnly}
            className="w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-[11px] font-semibold text-[#102C57] outline-none focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37]/40"
            value={rowData?.formulaCode || rowData?.formula_code || "DEFAULT"}
            onChange={(e) => {
              const selectedCode = e.target.value;
              const formula = formulaOptions.find(f => f.formula_code === selectedCode);
              onUpdate({
                formulaCode: formula?.formula_code || "DEFAULT",
                formulaName: formula?.formula_name || "Default BOM",
                bomVersionId: formula?.bom_version_id || null,
                formula_code: formula?.formula_code || "DEFAULT",
                formula_name: formula?.formula_name || "Default BOM",
                bom_version_id: formula?.bom_version_id || null,
              });
            }}
          >
            {formulaOptions.map((formula) => {
              return (
                <option key={formula.formula_code} value={formula.formula_code}>
                  {formula.formula_name || formula.formula_code} ({formula.formula_code})
                </option>
              );
            })}
          </select>
        </div>
      )}

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

const BrandAutoCell = memo(function BrandAutoCell({ value }) {
  return (
    <td className="border border-slate-300 px-1.5 py-1.5 text-center align-top">
      <span className="inline-block max-w-full break-words rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500">
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
    <td className="border border-slate-300 px-1 py-0.5 align-top">
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

function renderCell(col, rowData, onUpdateCells, skuMap, readOnly = false, sectionShifts = []) {
  const value = rowData[col.key] ?? null;
  const hCls = HIGHLIGHT_CLS[col.highlight_color] ?? "";

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
        className={`border border-slate-300 px-1.5 py-1.5 text-sm text-slate-700 align-top whitespace-normal break-words ${hCls} ${alignClass}`}
      >
        {displayValue}
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
      return <BrandAutoCell key={col.id} value={value} />;

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
          value={value}
          rowData={rowData}
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
          onUpdate={onUpdateCells}
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
      <td className="w-40 border border-slate-300 px-1.5 py-1.5 text-sm font-medium text-slate-600 align-top leading-tight">
        {day.label} {day.date}
      </td>
      {columns.map((col) => renderCell(col, row.row_data, onUpdateCells, skuMap, readOnly, sectionShifts))}
      {!readOnly ? (
        <td className="w-7 border border-slate-300 text-center">
          <button
            onClick={handleDelete}
            className="px-1 text-slate-200 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
          >
            <Trash2 size={11} />
          </button>
        </td>
      ) : null}
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

const TableHeader = memo(function TableHeader({
  headerRows,
  showActions = true,
  headerVariant = "default",
}) {
  const { hasGroups, row1, row2 } = headerRows;
  const isNavy = headerVariant === "navy";
  const headerRowClass = isNavy
    ? "bg-[#102C57] text-[12px] font-semibold text-white"
    : "bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-700";
  const mainHeaderCellClass = isNavy
    ? "border border-[#0b2040] px-1.5 py-2 text-left align-top whitespace-normal break-words leading-tight"
    : "border border-slate-300 px-1.5 py-2 text-left text-slate-600 align-top whitespace-normal break-words leading-tight";
  const borderClass = isNavy ? "border border-[#0b2040]" : "border border-slate-300";

  return (
    <thead>
      <tr className={headerRowClass}>
        <th rowSpan={hasGroups ? 2 : 1} className={mainHeaderCellClass}>
          {"\u0e27\u0e31\u0e19\u0e17\u0e35\u0e48"}
        </th>

        {row1.map((item, index) => {
          if (item.type === "col") {
            const col = item.col;
            const widthStyle = getColumnWidthStyle(col);
            const highlightClass =
              !isNavy && col.highlight_color ? GROUP_HEADER_CLS[col.highlight_color] ?? "" : "";

            return (
              <th
                key={col.id}
                rowSpan={item.rowspan ?? 1}
                style={widthStyle}
                className={`${borderClass} px-1.5 py-2 text-center align-top whitespace-normal break-words leading-tight ${highlightClass}`}
              >
                {col.label}
              </th>
            );
          }

          const groupClass = isNavy
            ? "bg-[#102C57] text-white"
            : GROUP_HEADER_CLS[item.color] ?? "bg-slate-100 text-slate-600";

          return (
            <th
              key={`group-${index}`}
              colSpan={item.cols.length}
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
              ? "bg-[#102C57] text-[12px] font-semibold text-white"
              : "bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-600"
          }
        >
          {row2.map((col) => {
            const highlightClass =
              !isNavy && col.highlight_color ? HIGHLIGHT_CLS[col.highlight_color] ?? "" : "";
            const widthStyle = getColumnWidthStyle(col);

            return (
              <th
                key={col.id}
                style={widthStyle}
                className={`${borderClass} px-1.5 py-1.5 text-center align-top whitespace-normal break-words leading-tight ${highlightClass}`}
              >
                {col.label}
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
}) {
  const columns = useMemo(
    () => section.production_schedule_column_defs ?? section.columns ?? [],
    [section.production_schedule_column_defs, section.columns]
  );

  const skuMap = useMemo(() => {
    const nextMap = new Map();
    (skuCatalog ?? []).forEach((item) => nextMap.set(item.name, item));
    return nextMap;
  }, [skuCatalog]);

  const headerRows = useMemo(() => buildHeaderRows(columns), [columns]);
  const colSpan = 1 + columns.length + (readOnly ? 0 : 1);
  const activeDays = days ?? WEEK_DAYS;

  return (
    <table className="w-full table-fixed border-collapse border border-slate-300 text-sm">
      <colgroup>
        <col className="w-40" />
        {columns.map((col) => (
          <col key={col.id} style={getColumnWidthStyle(col)} />
        ))}
        {!readOnly ? <col className="w-7" /> : null}
      </colgroup>
      <TableHeader
        headerRows={headerRows}
        showActions={!readOnly}
        headerVariant={headerVariant}
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
              hideDayGroupHeader={hideDayGroupHeader}
            />
          );
        })}
        {!readOnly ? <AddDayFooter colSpan={colSpan} days={activeDays} onAdd={onAddRow} /> : null}
      </tbody>
    </table>
  );
}

function DayRowGroup({
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
}) {
  return (
    <>
      {!hideDayGroupHeader ? <DayGroupHeader day={day} colSpan={colSpan} /> : null}
      {rows.map((row) => (
        <TableRow
          key={row.id}
          row={row}
          day={day}
          columns={columns}
          skuMap={skuMap}
          sectionShifts={sectionShifts}
          onUpdate={onUpdate}
          onDelete={onDelete}
          readOnly={readOnly}
        />
      ))}
      {!readOnly ? (
        <tr>
          <td colSpan={colSpan} className="border border-slate-300 bg-slate-50/50 px-3 py-1">
            <button
              className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
              onClick={() => onAddRow(day.key)}
            >
              <Plus size={10} /> {"\u0e40\u0e1e\u0e34\u0e48\u0e21\u0e41\u0e16\u0e27"} {day.label} {day.date}
            </button>
          </td>
        </tr>
      ) : null}
    </>
  );
}
