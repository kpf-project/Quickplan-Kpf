"use client";

import { PanelLeftClose, PanelLeftOpen, Plus, Search } from "lucide-react";
import styles from "./SettingsListSidebar.module.css";

export default function SettingsListSidebar({ title, items, selectedId, onSelect, search, onSearch, collapsed, onToggle, loading, onCreate, canCreate, createLabel = "เพิ่มรายการ" }) {
  return <aside className={styles.sidebar} data-collapsed={collapsed} aria-label={title}>
    <header>{!collapsed && <><strong>{title}</strong><span>{items.length}</span></>}<button type="button" onClick={onToggle} aria-label={collapsed ? `แสดง${title}` : `ยุบ${title}`} aria-expanded={!collapsed}>{collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}</button></header>
    {!collapsed && <label className={styles.search}><Search size={16} /><input aria-label={`ค้นหา${title}`} placeholder={`ค้นหา${title}...`} value={search} onChange={event => onSearch(event.target.value)} /></label>}
    <nav aria-label={`รายการ${title}`} aria-busy={loading}>{items.map(item => <button key={item.id} type="button" aria-current={selectedId === item.id ? "true" : undefined} onClick={() => onSelect(item.id)} title={`${item.code} · ${item.name}`}><span>{item.code}</span>{!collapsed && <span>{item.name}{item.is_central_department && <small>แผนกกลาง</small>}</span>}</button>)}{!items.length && !collapsed && <p>{loading ? "กำลังโหลด..." : "ไม่พบรายการ"}</p>}</nav>
    <footer><button type="button" onClick={onCreate} disabled={!canCreate} title={createLabel}><Plus size={17} />{!collapsed && createLabel}</button></footer>
  </aside>;
}
