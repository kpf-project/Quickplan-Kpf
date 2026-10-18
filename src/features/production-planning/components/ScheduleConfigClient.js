"use client";

import { useState, useCallback, useMemo } from "react";
import { Plus, Trash2, ChevronUp, ChevronDown, Settings2, Eye, EyeOff, Check, X, GripVertical, Tags } from "lucide-react";
import ScheduleImportScopeDialog from "./ScheduleImportScopeDialog";
import GenericScheduleTable from "./GenericScheduleTable";
import ScheduleTemplateDesigner from "./ScheduleTemplateDesigner";
import ScheduleColumnColorFields from "./ScheduleColumnColorFields";
import { applyColumnColors } from "@/lib/scheduleColumnColors";
import useSWR from "swr";
import { fetcher } from "@/lib/clientFetch";
import {
  useScheduleTemplates,
  useScheduleTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  createSection,
  updateSection,
  deleteSection,
  reorderSections,
  createColumn,
  updateColumn,
  deleteColumn,
  reorderColumns,
} from "@/features/production-planning/hooks/useScheduleConfig";

// ── Constants ──────────────────────────────────────────────────────────────────

const COL_TYPES = [
  { value: "text",       label: "ข้อความ" },
  { value: "number",     label: "ตัวเลข" },
  { value: "time",       label: "เวลา (HH:MM)" },
  { value: "shift",      label: "กะการผลิต" },
  { value: "sku_picker", label: "เลือกสินค้า (SKU)" },
  { value: "brand_auto", label: "แบรนด์ (auto-fill)" },
];

const COLORS = ["", "blue", "amber", "orange", "indigo", "teal", "purple"];
const COLOR_THEMES = ["slate", "yellow", "amber", "indigo", "teal", "purple", "rose"];
const COLOR_BADGE = {
  "":       "bg-gray-100 text-gray-500",
  blue:     "bg-blue-100 text-blue-700",
  amber:    "bg-amber-100 text-amber-700",
  orange:   "bg-orange-100 text-orange-700",
  indigo:   "bg-indigo-100 text-indigo-700",
  teal:     "bg-teal-100 text-teal-700",
  purple:   "bg-purple-100 text-purple-700",
};
const THEME_HDR = {
  slate:  "from-slate-700 to-slate-600",
  yellow: "from-yellow-700 to-yellow-600",
  amber:  "from-amber-800 to-amber-700",
  indigo: "from-indigo-800 to-indigo-700",
  teal:   "from-teal-800 to-teal-700",
  purple: "from-purple-800 to-purple-700",
  rose:   "from-rose-800 to-rose-700",
};

// Mock SKU catalog for preview
const PREVIEW_SKU = [
  { name: "สินค้าตัวอย่าง A", brand: "KPF" },
  { name: "สินค้าตัวอย่าง B", brand: "ผักใจ" },
];

// Mock days for preview
const PREVIEW_DAYS = [
  { key: "mon", label: "จ.", date: "23/03", full: "จันทร์ 23 มี.ค." },
  { key: "tue", label: "อ.", date: "24/03", full: "อังคาร 24 มี.ค." },
];

const PREVIEW_SECTION_SHIFTS = [
  {
    id: "preview-shift-1",
    shiftId: "preview-shift-1",
    shiftCode: "SHIFT1",
    shiftName: "กะ 1",
    startTime: "07:00",
    endTime: "16:00",
  },
  {
    id: "preview-shift-2",
    shiftId: "preview-shift-2",
    shiftCode: "SHIFT2",
    shiftName: "กะ 2",
    startTime: "19:00",
    endTime: "04:00",
  },
];

// ── Inline edit field ──────────────────────────────────────────────────────────

function InlineEdit({ value, onSave, className = "" }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          autoFocus
          className={`border border-blue-300 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400 ${className}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { onSave(draft); setEditing(false); }
            if (e.key === "Escape") setEditing(false);
          }}
        />
        <button onClick={() => { onSave(draft); setEditing(false); }} className="text-green-600 hover:text-green-700"><Check size={12} /></button>
        <button onClick={() => setEditing(false)} className="text-gray-400 hover:text-gray-600"><X size={12} /></button>
      </span>
    );
  }
  return (
    <span
      className={`cursor-pointer hover:underline decoration-dotted ${className}`}
      onClick={() => { setDraft(value); setEditing(true); }}
    >
      {value}
    </span>
  );
}

const TYPE_THAI = {
  text:       "ข้อความ",
  number:     "ตัวเลข",
  time:       "เวลา",
  shift:      "กะการผลิต",
  sku_picker: "เลือกสินค้า",
  brand_auto: "แบรนด์ (อัตโนมัติ)",
};

// ── Column editor row ──────────────────────────────────────────────────────────

function ColumnRow({ col, onUpdate, onSaveColors, onDelete, onDragStart, onDragOver, onDrop, isDragOver }) {
  const [open, setOpen] = useState(false);
  const [savingColors, setSavingColors] = useState(false);
  const [colorError, setColorError] = useState("");
  async function saveColors(patch) {
    setSavingColors(true); setColorError("");
    try { await onSaveColors(patch); } catch (error) { setColorError(error.message || "บันทึกสีไม่สำเร็จ"); } finally { setSavingColors(false); }
  }

  async function save(patch) {
    await updateColumn(col.id, patch);
    onUpdate();
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={(e) => { e.preventDefault(); onDragOver(); }}
      onDrop={onDrop}
      className={`border rounded mb-1 bg-white transition-colors ${
        isDragOver ? "border-blue-400 bg-blue-50" : "border-gray-200"
      }`}
    >
      <div className="flex items-center gap-2 px-2 py-1.5 text-xs">
        <GripVertical size={12} className="text-gray-300 cursor-grab active:cursor-grabbing shrink-0" />
        <span className="text-gray-400 font-mono w-20 shrink-0">{col.key}</span>
        <InlineEdit value={col.label} onSave={(v) => save({ label: v })} className="min-w-[80px]" />
        <span className={`text-[10px] px-1.5 py-0.5 rounded ${COLOR_BADGE[col.highlight_color ?? ""]}`}>
          {TYPE_THAI[col.col_type] ?? col.col_type}
        </span>
        {col.group_label && (
          <span className="text-[10px] text-gray-400 italic">กลุ่ม: {col.group_label}</span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setOpen((o) => !o)} className="text-gray-400 hover:text-blue-500"><Settings2 size={12} /></button>
          <button onClick={onDelete} className="text-gray-300 hover:text-red-400"><Trash2 size={12} /></button>
        </div>
      </div>

      {open && (
        <div className="border-t border-gray-100 px-3 py-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs bg-gray-50">
          <label className="flex flex-col gap-1">
            <span className="text-gray-500">ประเภทข้อมูล</span>
            <select
              className="border border-gray-200 rounded px-1.5 py-1 text-xs"
              value={col.col_type}
              onChange={(e) => save({ colType: e.target.value })}
            >
              {COL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </label>

          <fieldset disabled={savingColors} className="contents"><ScheduleColumnColorFields headerColor={col.header_highlight_color} bodyColor={col.highlight_color} onChange={saveColors} /></fieldset>
          {colorError && <p role="alert" className="text-red-600">{colorError}</p>}

          <label className="flex flex-col gap-1">
            <span className="text-gray-500">ความกว้าง (px)</span>
            <input
              type="number" min="0"
              className="border border-gray-200 rounded px-1.5 py-1 text-xs"
              defaultValue={col.width ?? ""}
              onBlur={(e) => save({ width: e.target.value ? Number(e.target.value) : null })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-gray-500">เติมแบรนด์อัตโนมัติไปที่</span>
            <input
              type="text"
              className="border border-gray-200 rounded px-1.5 py-1 text-xs"
              defaultValue={col.auto_fill_field ?? ""}
              placeholder="รหัสคอลัมน์แบรนด์ เช่น brand"
              onBlur={(e) => save({ autoFillField: e.target.value || null })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-gray-500">ชื่อกลุ่มหัว</span>
            <input
              type="text"
              className="border border-gray-200 rounded px-1.5 py-1 text-xs"
              defaultValue={col.group_label ?? ""}
              placeholder="เช่น จำนวนผลผลิตที่ได้ตามแผน"
              onBlur={(e) => save({ groupLabel: e.target.value || null })}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-gray-500">ลำดับกลุ่ม</span>
            <input
              type="number" min="1"
              className="border border-gray-200 rounded px-1.5 py-1 text-xs"
              defaultValue={col.group_order ?? ""}
              placeholder="1, 2, 3..."
              onBlur={(e) => save({ groupOrder: e.target.value ? Number(e.target.value) : null })}
            />
          </label>
        </div>
      )}
    </div>
  );
}

// ── Auto-suggest key from Thai label ──────────────────────────────────────────

const KEY_HINTS = [
  ["แบรนด์",          "brand"],
  ["ชื่อสินค้า",       "skuName"],
  ["สินค้า",           "skuName"],
  ["หมายเหตุ",         "note"],
  ["เวลาทำงาน",        "time"],
  ["เวลา",             "time"],
  ["กะ",               "shift"],
  ["shift",            "shift"],
  ["น้ำหนักบรรจุ",     "packWeight"],
  ["น้ำหนัก",          "weight"],
  ["จำนวนงาน",         "qty"],
  ["จำนวนคน",          "people"],
  ["จำนวน",            "qty"],
  ["ไซส์",             "size"],
  ["ขนาด",             "size"],
  ["เครื่อง",          "machine"],
  ["ราคา",             "price"],
  ["ล็อต",             "lot"],
  ["บรรจุ",            "packQty"],
];

function suggestKey(label) {
  const clean = label.trim();
  for (const [th, en] of KEY_HINTS) {
    if (clean.includes(th)) return en;
  }
  return "";
}

// ── Section editor ─────────────────────────────────────────────────────────────

function SectionEditor({ section, isFirst, isLast, onUp, onDown, onRefresh, onDelete }) {
  const [scopeOpen, setScopeOpen] = useState(false);
  const [newColLabel, setNewColLabel]   = useState("");
  const [newColKey, setNewColKey]       = useState("");
  const [newColType, setNewColType]     = useState("text");
  const [newColGroup, setNewColGroup]   = useState("");
  const [keyEdited, setKeyEdited]       = useState(false);
  const [addError, setAddError]         = useState("");
  const [showPreview, setShowPreview]   = useState(false);
  const [dragId, setDragId]             = useState(null);  // id being dragged
  const [dragOverId, setDragOverId]     = useState(null);  // id being hovered

  const columns = useMemo(
    () => applyColumnColors(section.production_schedule_column_defs ?? [], section.column_colors),
    [section.production_schedule_column_defs, section.column_colors]
  );
  const existingKeys = useMemo(() => new Set(columns.map((c) => c.key)), [columns]);

  // Auto-suggest key; if base key already exists append _2, _3 etc.
  function resolveKey(base) {
    if (!existingKeys.has(base)) return base;
    let n = 2;
    while (existingKeys.has(`${base}_${n}`)) n++;
    return `${base}_${n}`;
  }

  function handleLabelChange(val) {
    setNewColLabel(val);
    setAddError("");
    if (!keyEdited) {
      const suggested = suggestKey(val);
      if (suggested) setNewColKey(resolveKey(suggested));
    }
  }

  // Preview mock rows
  const mockRows = useMemo(() => {
    if (!showPreview) return [];
    return PREVIEW_DAYS.map((d) => ({
      id: `mock-${d.key}`,
      section_def_id: section.id,
      day_key: d.key,
      display_order: 0,
      row_data: Object.fromEntries(
        columns.map((c) => [
          c.key,
          c.col_type === "number" ? 100
          : c.col_type === "brand_auto" ? "KPF"
          : c.col_type === "sku_picker" ? "สินค้าตัวอย่าง A"
          : c.col_type === "time" ? "07:00-17:00"
          : c.col_type === "shift" ? "กะ 1 (07:00-16:00)"
          : "ตัวอย่าง",
        ])
      ),
    }));
  }, [showPreview, columns, section.id]);

  async function addColumn() {
    const label = newColLabel.trim();
    if (!label) return;

    const rawKey = (newColKey.trim() || suggestKey(label)).replace(/\s+/g, "_") || `col_${Date.now()}`;
    // Client-side duplicate check
    const key = existingKeys.has(rawKey) ? resolveKey(rawKey) : rawKey;

    setAddError("");
    const payload = { key, label, colType: newColType };
    if (newColType === "sku_picker") payload.autoFillField = "brand";
    if (newColType === "shift") payload.width = 150;
    if (newColGroup.trim()) { payload.groupLabel = newColGroup.trim(); payload.groupOrder = 1; }

    const res = await createColumn(section.id, payload);
    if (!res?.ok) {
      setAddError(res?.error?.message ?? "เพิ่มคอลัมน์ไม่สำเร็จ — รหัสอาจซ้ำ ลองเปลี่ยนรหัส");
      return;
    }
    setNewColLabel("");
    setNewColKey("");
    setNewColType("text");
    setNewColGroup("");
    setKeyEdited(false);
    onRefresh();
  }

  async function handleDrop(targetId) {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const sorted = [...columns].sort((a, b) => a.display_order - b.display_order);
    const fromIdx = sorted.findIndex((c) => c.id === dragId);
    const toIdx   = sorted.findIndex((c) => c.id === targetId);
    if (fromIdx === -1 || toIdx === -1) return;
    // Reorder: remove from position, insert at target
    const next = [...sorted];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    const order = next.map((c, i) => ({ id: c.id, displayOrder: i + 1 }));
    setDragId(null);
    setDragOverId(null);
    await reorderColumns(section.id, order);
    onRefresh();
  }

  const grad = THEME_HDR[section.color_theme] ?? THEME_HDR.slate;

  return (
    <div className="mb-4 rounded-lg border border-gray-200 overflow-hidden shadow-sm">
      {/* Section header */}
      <div className={`flex items-center justify-between px-3 py-2 bg-gradient-to-r ${grad} text-white text-xs`}>
        <div className="flex items-center gap-2">
          <InlineEdit
            value={section.name}
            onSave={async (v) => { await updateSection(section.id, { name: v }); onRefresh(); }}
            className="font-semibold text-sm text-white bg-transparent"
          />
          <select
            className="text-[10px] bg-white/20 text-white rounded px-1 py-0.5 border-0 outline-none"
            value={section.color_theme}
            onChange={async (e) => { await updateSection(section.id, { colorTheme: e.target.value }); onRefresh(); }}
          >
            {COLOR_THEMES.map((t) => <option key={t} value={t} className="text-black">{t}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => setScopeOpen(true)} className="mr-2 flex items-center gap-1 rounded border border-white/40 px-2 py-1 text-xs hover:bg-white/10"><Tags size={13} />ขอบเขตสินค้า</button>
          <button onClick={() => setShowPreview((p) => !p)} className="opacity-70 hover:opacity-100" title="toggle preview">
            {showPreview ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
          <button disabled={isFirst} onClick={onUp}   className="opacity-60 hover:opacity-100 disabled:opacity-20"><ChevronUp   size={13} /></button>
          <button disabled={isLast}  onClick={onDown}  className="opacity-60 hover:opacity-100 disabled:opacity-20"><ChevronDown size={13} /></button>
          <button onClick={onDelete} className="opacity-60 hover:opacity-100 hover:text-red-200"><Trash2 size={13} /></button>
        </div>
      </div>

      {/* Columns list */}
      {scopeOpen && <ScheduleImportScopeDialog section={section} onClose={() => setScopeOpen(false)} />}
      <div className="p-3 bg-white">
        <p className="text-[11px] text-gray-400 mb-2 font-medium">คอลัมน์ ({columns.length})</p>
        {columns
          .slice()
          .sort((a, b) => a.display_order - b.display_order)
          .map((col) => (
            <ColumnRow
              key={col.id}
              col={col}
              onUpdate={onRefresh}
              onSaveColors={async patch => {
                const result = await updateSection(section.id, { columnColors: { ...section.column_colors, [col.id]: { ...section.column_colors?.[col.id], ...patch } } });
                if (!result.ok) throw new Error(result.error?.message || "บันทึกสีไม่สำเร็จ");
                await onRefresh();
              }}
              onDelete={async () => { await deleteColumn(col.id); onRefresh(); }}
              onDragStart={() => setDragId(col.id)}
              onDragOver={() => setDragOverId(col.id)}
              onDrop={() => handleDrop(col.id)}
              isDragOver={dragOverId === col.id && dragId !== col.id}
            />
          ))}

        {/* Add column */}
        <div className="flex flex-wrap items-center gap-2 mt-2">
          <input
            className="border border-gray-200 rounded px-1.5 py-1 text-xs w-28"
            placeholder="ชื่อหัวคอลัมน์"
            value={newColLabel}
            onChange={(e) => handleLabelChange(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addColumn(); }}
          />
          <input
            className="border border-gray-200 rounded px-1.5 py-1 text-xs w-24 font-mono"
            placeholder="รหัส (อังกฤษ)"
            value={newColKey}
            onChange={(e) => { setNewColKey(e.target.value); setKeyEdited(true); }}
          />
          <select
            className="border border-gray-200 rounded px-1.5 py-1 text-xs"
            value={newColType}
            onChange={(e) => setNewColType(e.target.value)}
          >
            {COL_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <input
            className="border border-gray-200 rounded px-1.5 py-1 text-xs w-36"
            placeholder="ชื่อกลุ่มหัว (ถ้ามี)"
            value={newColGroup}
            onChange={(e) => setNewColGroup(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addColumn(); }}
          />
          <button
            onClick={addColumn}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200"
          >
            <Plus size={11} /> เพิ่ม
          </button>
        </div>
        {!keyEdited && newColKey && (
          <p className="text-[10px] text-blue-500 mt-1">รหัสแนะนำจากชื่อ: <span className="font-mono">{newColKey}</span> — แก้ได้</p>
        )}
        {addError && (
          <p className="text-[10px] text-red-500 mt-1">⚠ {addError}</p>
        )}
      </div>

      {/* Live preview */}
      {showPreview && (
        <div className="border-t border-gray-200 bg-gray-50">
          <p className="text-[11px] text-gray-400 px-3 py-1.5 font-medium">Preview (ข้อมูลจำลอง)</p>
          <div className="overflow-x-auto">
            <GenericScheduleTable
              section={section}
              rows={mockRows}
              days={PREVIEW_DAYS}
              skuCatalog={PREVIEW_SKU}
              sectionShifts={PREVIEW_SECTION_SHIFTS}
              onUpdate={() => {}}
              onDelete={() => {}}
              onAddRow={() => {}}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main ScheduleConfigClient ──────────────────────────────────────────────────

export default function ScheduleConfigClient() {
  return <ScheduleTemplateDesigner management={<ScheduleConfigLegacy />} />;
}

function ScheduleConfigLegacy() {
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newSectionName, setNewSectionName]   = useState("");

  const { templates, mutate: mutateTemplates } = useScheduleTemplates();
  const { template, mutate: mutateTemplate }   = useScheduleTemplate(selectedTemplateId);

  // Load all active departments for the dept picker
  const { data: deptsData } = useSWR("/api/production-planning/departments", fetcher, { revalidateOnFocus: false });
  const allDepts = deptsData?.data ?? [];

  const sections = useMemo(
    () => (template?.sections ?? []).slice().sort((a, b) => a.display_order - b.display_order),
    [template]
  );

  async function handleCreateTemplate() {
    const name = newTemplateName.trim();
    if (!name) return;
    await createTemplate({ name });
    setNewTemplateName("");
    mutateTemplates();
  }

  async function handleAddSection() {
    const name = newSectionName.trim();
    if (!name || !selectedTemplateId) return;
    await createSection(selectedTemplateId, { name });
    setNewSectionName("");
    mutateTemplate();
  }

  async function moveSection(sectionId, direction) {
    const idx = sections.findIndex((s) => s.id === sectionId);
    if (direction === "up" && idx > 0) {
      const order = sections.map((s, i) => ({ id: s.id, displayOrder: i + 1 }));
      [order[idx], order[idx - 1]] = [order[idx - 1], order[idx]];
      order.forEach((o, i) => (o.displayOrder = i + 1));
      await reorderSections(selectedTemplateId, order);
      mutateTemplate();
    } else if (direction === "down" && idx < sections.length - 1) {
      const order = sections.map((s, i) => ({ id: s.id, displayOrder: i + 1 }));
      [order[idx], order[idx + 1]] = [order[idx + 1], order[idx]];
      order.forEach((o, i) => (o.displayOrder = i + 1));
      await reorderSections(selectedTemplateId, order);
      mutateTemplate();
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Page header */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <h1 className="text-base font-bold text-gray-800">ตั้งค่าเทมเพลตตารางผลิต</h1>
        <p className="text-xs text-gray-500 mt-0.5">กำหนด section และคอลัมน์แต่ละแผนก · Preview แบบ real-time</p>
      </div>

      <div className="flex gap-0 h-[calc(100vh-57px)]">
        {/* ── Left: template list ── */}
        <div className="w-64 shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
          <div className="p-3 border-b border-gray-100">
            <p className="text-xs font-semibold text-gray-500 mb-2">เทมเพลต</p>
            <div className="flex gap-1">
              <input
                className="flex-1 border border-gray-200 rounded px-1.5 py-1 text-xs"
                placeholder="ชื่อเทมเพลต"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateTemplate(); }}
              />
              <button onClick={handleCreateTemplate} className="px-2 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700">
                <Plus size={11} />
              </button>
            </div>
          </div>

          {templates.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => setSelectedTemplateId(tpl.id)}
              className={`w-full text-left px-3 py-2.5 text-xs border-b border-gray-50 hover:bg-blue-50 transition-colors ${
                selectedTemplateId === tpl.id ? "bg-blue-50 text-blue-700 font-semibold border-l-2 border-l-blue-500" : "text-gray-700"
              }`}
            >
              <p className="truncate">{tpl.name}</p>
              {tpl.production_departments && (
                <p className="text-gray-400 text-[10px] mt-0.5">{tpl.production_departments.name}</p>
              )}
            </button>
          ))}
        </div>

        {/* ── Right: section/column editor ── */}
        <div className="flex-1 overflow-y-auto p-6">
          {!selectedTemplateId ? (
            <div className="flex items-center justify-center h-full text-gray-400 text-sm">
              เลือกเทมเพลตจากรายการด้านซ้าย
            </div>
          ) : (
            <>
              {/* Template name + actions */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex-1 mr-4">
                  <h2 className="text-sm font-bold text-gray-800">{template?.name}</h2>
                  <p className="text-xs text-gray-400 mb-2">{sections.length} sections · {
                    sections.reduce((n, s) => n + (s.production_schedule_column_defs?.length ?? 0), 0)
                  } columns total</p>
                  {/* Dept picker */}
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-500 shrink-0">ผูกกับแผนก:</span>
                    <select
                      className="border border-gray-200 rounded px-2 py-1 text-xs bg-white"
                      value={template?.dept_id ?? ""}
                      onChange={async (e) => {
                        await updateTemplate(selectedTemplateId, { deptId: e.target.value || null });
                        mutateTemplate();
                        mutateTemplates();
                      }}
                    >
                      <option value="">(ยังไม่ได้ผูก)</option>
                      {allDepts.map((d) => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                    {template?.dept_id && (
                      <span className="text-[10px] text-green-600 bg-green-50 border border-green-200 rounded px-1.5 py-0.5">
                        ✓ ผูกแล้ว
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={async () => {
                    if (!confirm("ลบเทมเพลตนี้?")) return;
                    await deleteTemplate(selectedTemplateId);
                    setSelectedTemplateId(null);
                    mutateTemplates();
                  }}
                  className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1 border border-red-200 rounded px-2 py-1"
                >
                  <Trash2 size={11} /> ลบเทมเพลต
                </button>
              </div>

              {/* Sections */}
              {sections.map((sec, i) => (
                <SectionEditor
                  key={sec.id}
                  section={sec}
                  isFirst={i === 0}
                  isLast={i === sections.length - 1}
                  onUp={() => moveSection(sec.id, "up")}
                  onDown={() => moveSection(sec.id, "down")}
                  onRefresh={mutateTemplate}
                  onDelete={async () => {
                    if (!confirm(`ลบ section "${sec.name}"?`)) return;
                    await deleteSection(sec.id);
                    mutateTemplate();
                  }}
                />
              ))}

              {/* Add section */}
              <div className="flex items-center gap-2 mt-2">
                <input
                  className="flex-1 border border-gray-200 rounded px-2 py-1.5 text-xs"
                  placeholder="ชื่อ section ใหม่"
                  value={newSectionName}
                  onChange={(e) => setNewSectionName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleAddSection(); }}
                />
                <button
                  onClick={handleAddSection}
                  className="flex items-center gap-1 text-xs px-3 py-1.5 rounded bg-blue-600 text-white hover:bg-blue-700"
                >
                  <Plus size={11} /> เพิ่ม Section
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
