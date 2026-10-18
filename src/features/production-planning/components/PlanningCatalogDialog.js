"use client";

import { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";
import styles from "./RequisitionMaterialPicker.module.css";

export default function PlanningCatalogDialog({ title, description, onClose, busy = false, children }) {
  const root = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const previous = document.activeElement, overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    root.current?.querySelector('input[type="search"]')?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus?.(); };
  }, []);
  return <div className={styles.overlay} onMouseDown={event => { if (!busy && event.target === event.currentTarget) onClose(); }}>
    <section ref={root} role="dialog" aria-modal="true" aria-labelledby={titleId} className={styles.dialog} onKeyDown={event => {
      if (event.isComposing) return;
      if (event.key === "Escape" && !busy) { event.preventDefault(); event.stopPropagation(); onClose(); }
      if (event.key !== "Tab") return;
      const controls = [...root.current.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),[tabindex="0"]')].filter(node => node.getClientRects().length);
      if (!controls.length) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === controls[0]) { event.preventDefault(); controls.at(-1).focus(); }
      else if (!event.shiftKey && document.activeElement === controls.at(-1)) { event.preventDefault(); controls[0].focus(); }
    }}>
      <header className={styles.header}><div><h2 id={titleId}>{title}</h2>{description && <p>{description}</p>}</div><button type="button" aria-label={`ปิด${title}`} disabled={busy} onClick={onClose}><X size={19} /></button></header>
      {children}
    </section>
  </div>;
}

export function PlanningCatalogTable({ children, busy = false, scrollRef }) {
  return <div className={styles.tableScroll} ref={scrollRef} aria-busy={busy}><table>{children}</table></div>;
}

export function PlanningCatalogRowNumber({ page, limit, index }) {
  return <td>{(page - 1) * limit + index + 1}</td>;
}
