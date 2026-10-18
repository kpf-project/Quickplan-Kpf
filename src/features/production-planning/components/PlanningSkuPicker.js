"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import WeightScalePaginationBar from "@/features/production-line/components/WeightScalePaginationBar";
import styles from "./PlanningSkuPicker.module.css";
import catalogStyles from "./RequisitionMaterialPicker.module.css";
import PlanningCatalogDialog, { PlanningCatalogTable, PlanningCatalogRowNumber } from "./PlanningCatalogDialog";

export default function PlanningSkuPicker({ skuMap, currentValue, onSelect, onClose, title = "เลือกสินค้า", description, requireBom = true, loading = false, error = "", onRetry, confirmLabel, detailsColumn }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [selectedName, setSelectedName] = useState(currentValue || "");
  const [formulas, setFormulas] = useState(new Map());
  const scroll = useRef(null);
  const titleId = useId();
  const list = useMemo(() => {
    const term = query.trim().toLowerCase();
    return Array.from(skuMap.entries()).filter(([name, item]) =>
      (filter === "all" || (filter === "has_bom" ? item.hasBom : !item.hasBom)) &&
      (!term || `${name} ${item.name || ""} ${item.skuCode || ""} ${(item.fgSkus || []).join(" ")}`.toLowerCase().includes(term)));
  }, [skuMap, query, filter]);
  const totalPages = Math.max(1, Math.ceil(list.length / limit));
  const safePage = Math.min(page, totalPages);
  const visible = list.slice((safePage - 1) * limit, safePage * limit);
  const selected = skuMap.get(selectedName);
  const enabled = !!selected && (!requireBom || selected.hasBom) && !loading && !error;

  useEffect(() => { if (scroll.current) scroll.current.scrollTop = 0; }, [safePage, limit, query, filter]);

  function confirm() {
    if (!enabled) return;
    const options = selected.formulaOptions || [];
    const formula = options.find(option => option.formula_code === formulas.get(selected.skuCode)) || options[0] || null;
    onSelect(selectedName, selected.brand, formula);
    onClose();
  }

  return <PlanningCatalogDialog title={title} description={description} onClose={onClose}>
      <div className={styles.toolbar}>
        <div className={catalogStyles.search}><Search size={18} /><input type="search" aria-label="ค้นหารหัสหรือชื่อสินค้า" placeholder="ค้นหารหัสสินค้า หรือ ชื่อสินค้า..." value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} /></div>
        {requireBom && <label>สถานะ BOM<select value={filter} onChange={event => { setFilter(event.target.value); setPage(1); }}><option value="all">ทุกสถานะ</option><option value="has_bom">มีสูตร BOM</option><option value="no_bom">ยังไม่มี BOM</option></select></label>}
      </div>
      <PlanningCatalogTable scrollRef={scroll} busy={loading}><colgroup><col className={styles.radioColumn} /><col style={{ width: 48 }} /><col className={styles.codeColumn} /><col className={styles.typeColumn} /><col /><col className={styles.unitColumn} /><col className={styles.formulaColumn} /></colgroup>
          <thead><tr><th aria-label="เลือก" /><th>#</th><th>รหัสสินค้า</th><th>ประเภท</th><th>ชื่อสินค้า</th><th>หน่วย (UOM)</th><th>{detailsColumn?.label || (requireBom ? "สูตรผลิต (BOM)" : "ใช้สำหรับ FG")}</th></tr></thead>
          <tbody>{visible.map(([name, item], index) => {
            const seen = new Set();
            const unique = (item.formulaOptions || []).filter(option => {
              const code = String(option.formula_code || "DEFAULT").trim().toUpperCase();
              if (seen.has(code)) return false;
              seen.add(code);
              return true;
            });
            return <tr key={name} data-selected={selectedName === name} data-existing={requireBom && !item.hasBom} onClick={() => { if (!loading && !error && (!requireBom || item.hasBom)) setSelectedName(name); }}>
              <td><input type="radio" name={titleId} aria-label={`เลือก ${item.skuCode} ${item.name || name}`} checked={selectedName === name} disabled={loading || !!error || (requireBom && !item.hasBom)} onChange={() => { if (!loading && !error && (!requireBom || item.hasBom)) setSelectedName(name); }} /></td><PlanningCatalogRowNumber page={safePage} limit={limit} index={index} />
              <td className={styles.code}>{item.skuCode || "—"}</td><td><span className={styles.badge}>{item.itemType || "FG"}</span></td><td className={styles.name}>{item.name || name}</td><td>{item.unit || "—"}</td>
              <td>{detailsColumn ? detailsColumn.render(item) : !requireBom ? item.fgSkus?.length ? <details className={styles.fgReferences} onClick={event => event.stopPropagation()}><summary aria-label={`ดู FG ที่ใช้ ${item.skuCode} (${item.fgSkus.length})`}>ดู FG ({item.fgSkus.length})</summary><ul>{item.fgSkus.map((code, index) => <li key={`${code}-${index}`}>{code}</li>)}</ul></details> : "—" : item.hasBom && unique.length ? <select aria-label={`สูตรผลิต ${item.skuCode}`} value={formulas.get(item.skuCode) || unique[0]?.formula_code || ""} onClick={event => event.stopPropagation()} onChange={event => { setFormulas(previous => new Map(previous).set(item.skuCode, event.target.value)); }}>
                {unique.map(option => <option key={option.formula_code} value={option.formula_code}>{option.formula_name || option.formula_code}</option>)}
              </select> : item.hasBom ? <span className={styles.badge}>มีสูตร</span> : <span className={styles.unavailable} title="ต้องผูกสูตร BOM ก่อนนำไปวางแผน">ยังไม่มี BOM</span>}</td>
            </tr>;
          })}{(loading || error || !visible.length) && <tr><td colSpan={7} className={styles.empty} role={error ? "alert" : "status"}>{loading ? "กำลังโหลดรายการ…" : error ? <>{error} {onRetry && <button type="button" onClick={onRetry}>ลองใหม่</button>}</> : "ไม่พบสินค้า"}</td></tr>}</tbody>
      </PlanningCatalogTable>
      <footer className={styles.footer}>
        <div className={catalogStyles.pagination}><WeightScalePaginationBar page={safePage} totalPages={totalPages} totalCount={list.length} limit={limit} limitOptions={[15, 25, 50]} onPageChange={setPage} onLimitChange={value => { setLimit(value); setPage(1); }} isLoading={loading || Boolean(error)} />{!list.length && <span>0 รายการ</span>}</div>
        <div className={styles.summary}><small>สินค้าที่เลือก</small><span>{selected ? <><strong>{selected.skuCode}</strong> {selected.name || selectedName}</> : "เลือกรายการจากตาราง"}</span>{selected && requireBom && !selected.hasBom && <small>ต้องผูกสูตร BOM ก่อนนำไปวางแผน</small>}</div>
        {currentValue && <button className={styles.clear} type="button" onClick={() => { onSelect(null, null); onClose(); }}>ล้างค่า</button>}
        <button className={catalogStyles.primary} type="button" disabled={!enabled} onClick={confirm}>{confirmLabel || (requireBom ? "ใช้สินค้านี้" : "ใช้ WIP นี้")}</button>
      </footer>
  </PlanningCatalogDialog>;
}
