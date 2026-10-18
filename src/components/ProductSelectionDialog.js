"use client";

import Image from "next/image";
import { useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, Package, Search, X } from "lucide-react";
import WeightScalePaginationBar from "@/features/production-line/components/WeightScalePaginationBar";
import styles from "./ProductSelectionDialog.module.css";

function ProductPhoto({ product, large = false }) {
  const [failedUrl, setFailedUrl] = useState(null);
  return product?.imageUrl && failedUrl !== product.imageUrl
    ? <Image className={large ? styles.largePhoto : styles.photo} src={product.imageUrl} alt={product.name || ""} width={large ? 72 : 48} height={large ? 72 : 40} unoptimized onError={() => setFailedUrl(product.imageUrl)} />
    : <span className={styles.missing}>รูปไม่พร้อม</span>;
}

export default function ProductSelectionDialog({ products = [], selectedProduct = null, page = 1, totalCount = 0,
  searchTerm = "", loading = false, error = "", confirming = false, onSearchChange, onPageChange, onRetry, onClose, onConfirm,
  description = "รายการตามสิทธิ์ของหน้านี้" }) {
  const titleId = useId();
  const rootRef = useRef(null);
  const searchRef = useRef(null);
  const scrollRef = useRef(null);
  const [draft, setDraft] = useState(selectedProduct ? { product: selectedProduct, page, query: searchTerm } : null);
  const current = draft?.query === searchTerm ? draft : null;
  const valid = current && (current.page !== page || products.some(product => product.code === current.product.code));
  const enabled = valid && !loading && !error && !confirming;

  useEffect(() => {
    const previousFocus = document.activeElement;
    searchRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; previousFocus?.focus?.(); };
  }, []);
  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [page, searchTerm]);

  function handleKeyDown(event) {
    if (event.isComposing) return;
    if (event.key === "Escape" && !confirming) { event.preventDefault(); event.stopPropagation(); onClose(); return; }
    if (event.key === "Tab") {
      const nodes = [...rootRef.current.querySelectorAll("button:not(:disabled),input:not(:disabled),[tabindex='0']")].filter(node => node.getClientRects().length);
      if (!nodes.length) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === nodes.at(-1)) { event.preventDefault(); nodes[0].focus(); }
      return;
    }
    if (event.target.closest("button")) return;
    if (event.key === "Enter" && enabled) { event.preventDefault(); onConfirm(current.product); }
    if (["ArrowDown", "ArrowUp"].includes(event.key) && !loading && !error && !confirming && products.length) {
      event.preventDefault();
      const index = products.findIndex(product => product.code === current?.product.code);
      const next = index < 0 ? 0 : Math.max(0, Math.min(products.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
      setDraft({ product: products[next], page, query: searchTerm });
      scrollRef.current?.querySelectorAll("tbody tr")[next]?.scrollIntoView({ block: "nearest" });
    }
  }

  return <div className={styles.overlay}>
    <section className={styles.dialog} ref={rootRef} role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={handleKeyDown}>
      <header className={styles.header}><Package size={30} /><h2 id={titleId}>เลือกสินค้า</h2><span>{description}</span><button type="button" disabled={confirming} onClick={onClose} aria-label="ปิดตัวเลือกสินค้า"><X size={26} /></button></header>
      <div className={styles.search}><Search size={21} /><input ref={searchRef} aria-label="ค้นหารหัสหรือชื่อสินค้า" placeholder="ค้นหารหัสหรือชื่อสินค้า..." value={searchTerm} disabled={confirming} maxLength={200} onChange={event => onSearchChange(event.target.value)} />{searchTerm && <button type="button" disabled={confirming} aria-label="ล้างคำค้น" onClick={() => onSearchChange("")}><X size={18} /></button>}</div>
      {error && <div className={styles.error} role="alert">{error}{onRetry && <button type="button" onClick={onRetry}>ลองใหม่</button>}</div>}
      <div className={styles.scroll} ref={scrollRef} aria-busy={loading}>
        <table><colgroup><col className={styles.selectionColumn} /><col className={styles.sequenceColumn} /><col className={styles.photoColumn} /><col className={styles.codeColumn} /><col /><col className={styles.unitColumn} /></colgroup>
          <thead><tr><th aria-label="เลือก" /><th>ลำดับ</th><th>รูปสินค้า</th><th>รหัสสินค้า</th><th className={styles.name}>ชื่อสินค้า</th><th>หน่วย</th></tr></thead>
          <tbody>{products.map((product, index) => <tr key={product.code} className={current?.product.code === product.code ? styles.selected : ""} onClick={() => { if (!loading && !error && !confirming) setDraft({ product, page, query: searchTerm }); }}>
            <td><input type="radio" name={titleId} aria-label={`เลือก ${product.code} ${product.name}`} checked={current?.product.code === product.code} disabled={loading || !!error || confirming} onChange={() => setDraft({ product, page, query: searchTerm })} /></td>
            <td>{(page - 1) * 25 + index + 1}</td><td><ProductPhoto product={product} /></td><td>{product.code}</td><td className={styles.name}>{product.name}</td><td>{product.unitName || "—"}</td>
          </tr>)}{!products.length && <tr><td colSpan={6} className={styles.empty} role="status">{loading ? "กำลังโหลดสินค้า…" : error ? "โหลดรายการไม่สำเร็จ" : "ไม่พบสินค้า"}</td></tr>}</tbody>
        </table>
      </div>
      <div className={styles.pagination}><WeightScalePaginationBar page={page} totalPages={Math.max(1, Math.ceil(totalCount / 25))} totalCount={totalCount} limit={25} limitOptions={[25]} onPageChange={onPageChange} isLoading={loading || confirming} />{loading && products.length > 0 && <span role="status">กำลังโหลด…</span>}</div>
      <footer className={styles.footer}><div className={styles.summary}>{current ? <><ProductPhoto product={current.product} large /><div><small>รหัสสินค้า</small><strong>{current.product.code}</strong></div><div className={styles.summaryName}><small>ชื่อสินค้า</small><strong>{current.product.name}</strong></div><div><small>หน่วย</small><strong>{current.product.unitName || "—"}</strong></div></> : <span>เลือกรายการจากตาราง</span>}</div><div className={styles.confirm}><button type="button" disabled={!enabled} onClick={() => { if (enabled && current?.product) onConfirm(current.product); }}><CheckCircle2 size={22} />{confirming ? "กำลังตรวจสินค้า…" : "เลือกสินค้า"}</button><small>↑ ↓ เลื่อน · Enter เลือก · Esc ปิด</small></div></footer>
    </section>
  </div>;
}
