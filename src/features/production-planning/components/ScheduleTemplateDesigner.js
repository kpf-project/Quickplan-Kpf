"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Plus, Settings2, Trash2, Save, X } from "lucide-react";
import { useScheduleTemplates, useScheduleTemplate, updateColumn, updateSection, createColumn, deleteColumn } from "../hooks/useScheduleConfig";
import { columnWidth, standardWidth } from "../services/scheduleColumnLayout";
import GenericScheduleTable from "./GenericScheduleTable";
import ScheduleColumnColorFields from "./ScheduleColumnColorFields";
import ScheduleImportScopeDialog from "./ScheduleImportScopeDialog";
import styles from "./ScheduleTemplateDesigner.module.css";
import paperStyles from "./ProductionSchedulePresentation.module.css";
import { DATE_COLUMN_ID, normalizeDateLayout } from "@/lib/scheduleDateLayout";
import { scheduleColumnsWithFormula, normalizeFormulaLayout } from "@/lib/scheduleFormulaLayout";
import { applyColumnColors, normalizeColumnColors } from "@/lib/scheduleColumnColors";

const TYPES = { text: "ข้อความ", number: "ตัวเลข", time: "เวลา", shift: "กะการผลิต", sku_picker: "เลือกสินค้า", brand_auto: "แบรนด์อัตโนมัติ" };
const THEMES = { slate: "เทา", yellow: "เหลือง", amber: "อำพัน", indigo: "คราม", teal: "เขียว", purple: "ม่วง", rose: "ชมพู" };
const SAMPLES = ["ขนมปังกรอบ แยมสับปะรด 1.1 กก. (6ปี๊บ)", "ขนมปังกรอบ แยมสตรอเบอร์รี่ 320 ก. (12ปี๊บ)"];
const CATALOG = SAMPLES.map((name, i) => ({ name, skuCode: `EXAMPLE-${i + 1}`, brand: i ? "ระฆังทอง" : "KPF", hasBom: true, formulaOptions: [{ formula_code: "PREVIEW", formula_name: "สูตรตัวอย่าง" }] }));
const SHIFTS = [{ id: "example-shift", shiftId: "example-shift", shiftName: "กะ 1", startTime: "07:00", endTime: "16:00" }];

function previewDays() {
  const monday = new Date();
  monday.setHours(12, 0, 0, 0);
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  return Array.from({ length: 5 }, (_, i) => {
    const date = new Date(monday); date.setDate(date.getDate() + i);
    return { key: ["mon", "tue", "wed", "thu", "fri"][i], label: date.toLocaleDateString("th-TH", { weekday: "short" }), date: date.toLocaleDateString("th-TH"), full: date.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) };
  });
}

export default function ScheduleTemplateDesigner({ management }) {
  const { templates, error: templatesError, mutate: refreshTemplates } = useScheduleTemplates();
  const [templateId, setTemplateId] = useState("");
  const { template, error: templateError, isLoading, mutate } = useScheduleTemplate(templateId || templates[0]?.id);
  const [sectionId, setSectionId] = useState("");
  const [columnId, setColumnId] = useState("");
  const [patches, setPatches] = useState({});
  const [sectionPatches, setSectionPatches] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [manage, setManage] = useState(false);
  const [scope, setScope] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newType, setNewType] = useState("text");
  const days = useMemo(previewDays, []);
  const dirty = Object.keys(patches).length + Object.keys(sectionPatches).length > 0;
  const sections = (template?.sections || []).slice().sort((a, b) => a.display_order - b.display_order);
  const source = sections.find(item => item.id === sectionId) || sections[0];
  const columns = applyColumnColors(scheduleColumnsWithFormula((source?.production_schedule_column_defs || []).map(column => ({ ...column, ...patches[column.id] })), sectionPatches[source?.id]?.formula_layout || source?.formula_layout), sectionPatches[source?.id]?.column_colors || source?.column_colors);
  const column = columns.find(item => item.id === columnId) || columns[0];
  const section = source ? { ...source, ...sectionPatches[source.id], production_schedule_column_defs: columns } : null;
  const rows = section ? days.flatMap(day => SAMPLES.map((name, i) => ({ id: `${day.key}-${i}`, day_key: day.key, row_data: { ...Object.fromEntries(columns.filter(col => col.col_type !== "formula").map(col => [col.key, col.col_type === "sku_picker" ? name : col.col_type === "brand_auto" ? CATALOG[i].brand : col.col_type === "number" ? (i ? 8 : 120) : col.col_type === "shift" ? "กะ 1 (07:00-16:00)" : col.col_type === "time" ? "07:00-16:00" : /note/i.test(col.key) ? "ข้อมูลตัวอย่าง ไม่ใช่แผนจริง" : "ตัวอย่าง"])), formulaCode: "PREVIEW", formulaName: "สูตรตัวอย่าง" } }))) : [];

  useEffect(() => {
    if (!dirty) return;
    const guard = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  function edit(id, patch) {
    if (id.startsWith("formula:")) {
      const current = columns.find(col => col.id === id);
      setSectionPatches(previous => ({ ...previous, [source.id]: { ...previous[source.id], formula_layout: { ...source.formula_layout, ...previous[source.id]?.formula_layout, [id]: { width: current.width, label: current.label, display_order: current.display_order, highlight_color: previous[source.id]?.formula_layout?.[id]?.highlight_color ?? source.formula_layout?.[id]?.highlight_color ?? null, ...patch } } } }));
      return;
    }
    if (id === DATE_COLUMN_ID) {
      setSectionPatches(previous => ({ ...previous, [source.id]: { ...previous[source.id], date_layout: { width: 160, ...source.date_layout, ...previous[source.id]?.date_layout, ...patch } } }));
      return;
    }
    setPatches(previous => ({ ...previous, [id]: { ...previous[id], ...patch } }));
    setNotice("");
  }
  function editColors(id, patch) {
    if (id === DATE_COLUMN_ID) { edit(id, patch); return; }
    setSectionPatches(previous => ({ ...previous, [source.id]: { ...previous[source.id], column_colors: { ...source.column_colors, ...previous[source.id]?.column_colors, [id]: { ...source.column_colors?.[id], ...previous[source.id]?.column_colors?.[id], ...patch } } } }));
    setNotice("");
  }
  function discard() { setPatches({}); setSectionPatches({}); setError(""); setNotice(""); }
  function selectColumn(id) { setColumnId(id); setAdvanced(false); setEditorOpen(true); }
  function switchTemplate(value) {
    if (dirty && !window.confirm("ละทิ้งการตั้งค่าที่ยังไม่บันทึก?")) return;
    discard(); setTemplateId(value); setSectionId(""); setColumnId(""); setAdding(false);
  }
  function move(direction) {
    const index = columns.findIndex(item => item.id === column?.id), target = index + direction;
    if (target < 0 || target >= columns.length) return;
    const next = [...columns]; [next[index], next[target]] = [next[target], next[index]];
    next.forEach((item, i) => edit(item.id, { display_order: i + 1 }));
  }
  function recommend() {
    for (const item of sections) for (const col of item.production_schedule_column_defs || []) edit(col.id, { width: standardWidth(col) });
    setNotice("จัดความกว้างทุกส่วนงานในเทมเพลตนี้แล้ว ตรวจ Preview ก่อนบันทึก");
  }
  async function save() {
    try { Object.values(sectionPatches).forEach(patch => { if (patch.date_layout) normalizeDateLayout(patch.date_layout); if (patch.formula_layout) normalizeFormulaLayout(patch.formula_layout); if (patch.column_colors) normalizeColumnColors(patch.column_colors); }); } catch (failure) { setError(failure.message); return; }
    const allColumns = sections.flatMap(item => item.production_schedule_column_defs || []);
    if (Object.values(patches).some(p => (p.label !== undefined && !p.label.trim()) || (p.width !== undefined && (!Number.isInteger(Number(p.width)) || Number(p.width) < 48 || Number(p.width) > 1200)))) { setError("ชื่อหัวคอลัมน์ต้องไม่ว่าง และความกว้างต้องเป็นจำนวนเต็ม 48–1,200 px"); return; }
    setSaving(true); setError(""); setNotice("");
    let completed = 0;
    try {
      for (const [id, patch] of Object.entries(patches)) {
        if (!allColumns.some(item => item.id === id)) throw new Error("คอลัมน์เปลี่ยนไป กรุณาโหลดใหม่");
        const payload = {};
        for (const [key, value] of Object.entries(patch)) payload[({ col_type: "colType", highlight_color: "highlightColor", group_label: "groupLabel", group_order: "groupOrder", auto_fill_field: "autoFillField", display_order: "displayOrder" })[key] || key] = value;
        const result = await updateColumn(id, payload);
        if (!result.ok) throw new Error(result.error?.message || "บันทึกคอลัมน์ไม่สำเร็จ");
        completed++;
        setPatches(previous => { const next = { ...previous }; delete next[id]; return next; });
      }
      for (const [id, patch] of Object.entries(sectionPatches)) {
        const result = await updateSection(id, { ...(patch.color_theme !== undefined ? { colorTheme: patch.color_theme } : {}), ...(patch.date_layout ? { dateLayout: patch.date_layout } : {}), ...(patch.formula_layout ? { formulaLayout: patch.formula_layout } : {}), ...(patch.column_colors ? { columnColors: patch.column_colors } : {}) });
        if (!result.ok) throw new Error(result.error?.message || "บันทึกสีส่วนงานไม่สำเร็จ");
        completed++;
        setSectionPatches(previous => { const next = { ...previous }; delete next[id]; return next; });
      }
      await mutate();
      setNotice("บันทึกแล้ว · หน้าแผนหลักใช้ค่าที่บันทึกเมื่อโหลดข้อมูลใหม่");
    } catch (failure) {
      setError(`บันทึกสำเร็จ ${completed} รายการก่อนหยุด: ${failure.message} · ค่าที่ยังไม่สำเร็จยังอยู่ ให้ลองบันทึกอีกครั้ง`);
      await mutate();
    } finally { setSaving(false); }
  }
  async function add() {
    if (!newLabel.trim() || !section) return;
    setSaving(true); setError("");
    try {
      const key = `col_${crypto.randomUUID().replaceAll("-", "")}`;
      const brand = columns.find(item => item.col_type === "brand_auto");
      const result = await createColumn(section.id, { key, label: newLabel.trim(), colType: newType, width: standardWidth({ col_type: newType }), ...(newType === "sku_picker" && brand ? { autoFillField: brand.key } : {}) });
      if (!result.ok) throw new Error(result.error?.message || "เพิ่มคอลัมน์ไม่สำเร็จ");
      await mutate(); setAdding(false); setNewLabel("");
    } catch (failure) { setError(failure.message); } finally { setSaving(false); }
  }
  async function remove() {
    if (column?.col_type === "formula") return;
    if (!column || !window.confirm(`ลบคอลัมน์ “${column.label}”? คอลัมน์นี้จะหายจากตารางแผนหลักด้วย`)) return;
    setSaving(true);
    try { const result = await deleteColumn(column.id); if (!result.ok) throw new Error(result.error?.message || "ลบไม่สำเร็จ"); await mutate(); setColumnId(""); } catch (failure) { setError(failure.message); } finally { setSaving(false); }
  }

  if (manage) return <div className={styles.management}><button type="button" className={styles.back} onClick={() => { setManage(false); mutate(); refreshTemplates(); }}>กลับตัวออกแบบตาราง</button>{management}</div>;
  return <div className={styles.page}>
    <header className={styles.header}><div><h1>ตั้งค่าเทมเพลต</h1></div><div className={styles.actions}><small role="status">{saving ? "กำลังบันทึก…" : dirty ? "ยังไม่บันทึกการเปลี่ยนแปลง" : "ไม่มีการเปลี่ยนแปลงค้าง"}</small><button disabled={!dirty || saving} onClick={discard}>ยกเลิก</button><button className={styles.primary} disabled={!dirty || saving} onClick={save}><Save size={16} />{saving ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}</button></div></header>
    <fieldset disabled={saving} className={styles.controls}>
      <div className={styles.selectors}><label>เทมเพลต<select value={templateId || templates[0]?.id || ""} onChange={event => switchTemplate(event.target.value)}>{templates.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>ส่วนงาน / Section<select value={source?.id || ""} onChange={event => { setSectionId(event.target.value); setColumnId(""); setAdding(false); }}>{sections.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>สีส่วนงาน<select value={section?.color_theme || "slate"} onChange={event => setSectionPatches(previous => ({ ...previous, [section.id]: { ...previous[section.id], color_theme: event.target.value } }))}>{Object.entries(THEMES).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label><div className={styles.actions}><button disabled={!section || dirty} onClick={() => setScope(true)}>ขอบเขตสินค้า</button><button disabled={dirty} onClick={() => setManage(true)}><Settings2 size={15} />จัดการเทมเพลต / ส่วนงาน</button></div></div>
      <div className={styles.editorDock} role="region" aria-label="แถบตั้งค่าคอลัมน์">
      <div className={styles.editorTitle}><div className={styles.actions}><button disabled={!section || dirty} onClick={() => setAdding(!adding)}><Plus size={15} />คอลัมน์</button><details className={styles.more}><summary>··· เพิ่มเติม</summary><div><button disabled={!section} onClick={recommend}>จัดสัดส่วนมาตรฐานทุก Section</button><button disabled={!section || dirty} onClick={() => setScope(true)}>ขอบเขตสินค้า</button><button disabled={dirty} onClick={() => setManage(true)}>จัดการเทมเพลต / ส่วนงาน</button><button disabled={!column} onClick={() => setEditorOpen(true)}>แก้ไขคอลัมน์ที่เลือก</button></div></details></div></div>
      {!editorOpen && <p className={styles.editorEmpty}>คลิกหัวคอลัมน์ในตารางเพื่อปรับชื่อ สี และความกว้าง</p>}
      {columnId === DATE_COLUMN_ID && editorOpen && <div className={styles.columnPopover}><div className={styles.popoverHeading}><strong>วันที่</strong><button type="button" onClick={() => setEditorOpen(false)} aria-label="ปิดตั้งค่าวันที่"><X size={16} /></button></div><div className={styles.dateEditor}><label>ความกว้าง (px)<input aria-label="ความกว้างวันที่" type="number" min="48" max="1200" value={section?.date_layout?.width || 160} onChange={event => { if (event.target.value) edit(DATE_COLUMN_ID, { width: Number(event.target.value) }); }} /></label><ScheduleColumnColorFields headerColor={section?.date_layout?.headerColor} bodyColor={section?.date_layout?.bodyColor} onChange={patch => editColors(DATE_COLUMN_ID, patch)} /></div></div>}
      {column && columnId !== DATE_COLUMN_ID && editorOpen && <div className={styles.columnPopover}><div className={styles.popoverHeading}><strong>{column.label}</strong><div className={styles.actions}><button disabled={!column} onClick={() => move(-1)} aria-label="ย้ายคอลัมน์ซ้าย"><ArrowLeft size={15} /></button><button disabled={!column} onClick={() => move(1)} aria-label="ย้ายคอลัมน์ขวา"><ArrowRight size={15} /></button><button onClick={() => setAdvanced(!advanced)} aria-expanded={advanced} aria-label="ตั้งค่าคอลัมน์ขั้นสูง"><Settings2 size={15} /></button><button onClick={() => setEditorOpen(false)} aria-label="ปิดตั้งค่าคอลัมน์"><X size={16} /></button></div></div><div className={styles.ribbon}>
        <label>ชื่อหัวคอลัมน์<input value={column.label} maxLength={120} onChange={event => edit(column.id, { label: event.target.value })} /></label>
        {advanced && column.col_type !== "formula" && <label>ประเภทข้อมูล<select value={column.col_type} onChange={event => { if (window.confirm("เปลี่ยนชนิดข้อมูลอาจกระทบการกรอกและคำนวณของช่องนี้ ต้องการเปลี่ยนหรือไม่?")) edit(column.id, { col_type: event.target.value }); }}>{Object.entries(TYPES).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label>}
        <label>ความกว้าง (px)<input type="number" min="48" max="1200" value={columnWidth(column)} onChange={event => { if (event.target.value) edit(column.id, { width: Number(event.target.value) }); }} /></label>
        <ScheduleColumnColorFields headerColor={column.header_highlight_color} bodyColor={column.highlight_color} onChange={patch => editColors(column.id, patch)} />
      </div>{advanced && column.col_type !== "formula" && <div className={styles.advanced}><label>รหัสภายใน (ไม่เปลี่ยนย้อนหลัง)<input value={column.key} readOnly /></label><label>กลุ่มหัวคอลัมน์<input value={column.group_label || ""} onChange={event => edit(column.id, { group_label: event.target.value || null })} /></label><label>ลำดับกลุ่ม<input type="number" min="1" value={column.group_order || ""} onChange={event => edit(column.id, { group_order: event.target.value ? Number(event.target.value) : null })} /></label>{column.col_type === "sku_picker" && <label>เติมแบรนด์ไปที่<select value={column.auto_fill_field || ""} onChange={event => edit(column.id, { auto_fill_field: event.target.value || null })}><option value="">ไม่เติมอัตโนมัติ</option>{columns.filter(item => item.col_type === "brand_auto").map(item => <option key={item.id} value={item.key}>{item.label} ({item.key})</option>)}</select></label>}<button disabled={dirty} onClick={remove} className={styles.danger}><Trash2 size={15} />ลบคอลัมน์</button></div>}</div>}
      {adding && <div className={styles.add}><label>ชื่อคอลัมน์ใหม่<input value={newLabel} onChange={event => setNewLabel(event.target.value)} placeholder="เช่น หมายเหตุเพิ่มเติม" /></label><label>ประเภท<select value={newType} onChange={event => setNewType(event.target.value)}>{Object.entries(TYPES).map(([value, name]) => <option key={value} value={value}>{name}</option>)}</select></label><small>ระบบสร้างรหัสภายในให้ ไม่ต้องพิมพ์อังกฤษ</small><button disabled={!newLabel.trim()} onClick={add}>เพิ่มคอลัมน์ทันที</button><button aria-label="ปิดเพิ่มคอลัมน์" onClick={() => setAdding(false)}><X size={16} /></button></div>}
      </div>
    </fieldset>
    {(error || templatesError || templateError) && <div role="alert" className={styles.error}>{error || "โหลดการตั้งค่าไม่สำเร็จ"}<button onClick={() => { mutate(); refreshTemplates(); }}>ลองใหม่</button></div>}
    {notice && <div role="status" className={styles.notice}>{notice}</div>}
    <div className={styles.previewHeader}><small>คลิกหัวคอลัมน์เพื่อตั้งค่า · ลากเส้นแบ่งเพื่อปรับความกว้าง · ขนาดจริง 100%</small></div>
    <div className={paperStyles.designerCanvas}><div className={paperStyles.canvas}><div className={paperStyles.paper}><div className={`${paperStyles.tableViewport} ${styles.preview}`} aria-busy={isLoading}>
      {section ? <GenericScheduleTable section={section} rows={rows} days={days} skuCatalog={CATALOG} sectionShifts={SHIFTS} onUpdate={() => {}} onDelete={() => {}} onAddRow={() => {}} selectedColumnId={columnId === DATE_COLUMN_ID ? DATE_COLUMN_ID : column?.id} onColumnSelect={selectColumn} onColumnResize={(id, width) => { if (!saving) edit(id, { width }); }} /> : <p>{isLoading ? "กำลังโหลด…" : "เลือกหรือสร้างเทมเพลตเพื่อเริ่มตั้งค่า"}</p>}
    </div></div></div></div><p className={styles.hint}>ลากหัวเส้นแบ่ง หรือใช้ปุ่มลูกศรบนเส้นแบ่งเพื่อปรับขนาด · เลื่อนแนวนอนหากตารางกว้างเกินพื้นที่ · Preview ไม่บันทึกข้อมูลแผน</p>
    {scope && section && <ScheduleImportScopeDialog section={section} onClose={() => setScope(false)} />}
  </div>;
}
