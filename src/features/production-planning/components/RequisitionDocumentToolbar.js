"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, EyeOff, FileSpreadsheet, MoreHorizontal, Plus } from "lucide-react";
import styles from "./RequisitionPreviewPresentation.module.css";

export function requisitionDocumentId(key) {
  return `requisition-${encodeURIComponent(key)}`;
}

export function roomAtScrollPosition(papers, edge, atBottom, pendingKey) {
  if (pendingKey && papers.some((paper) => paper.key === pendingKey)) return pendingKey;
  return (atBottom ? papers.at(-1) : papers.find((paper) => paper.bottom > edge + 16))?.key;
}

export function RequisitionDocumentActions({ document: doc, dateColumns = [], onManage, onSupplemental, onReset, onHide }) {
  const keys = doc.sourceDocumentKeys?.length ? doc.sourceDocumentKeys : [doc.documentKey];
  const canSupplement = dateColumns.some((date) => doc.exportedByDate?.[date] === true);
  return (
    <div className={styles.documentActions} aria-label={`จัดการใบเบิก ${doc.roomLabel || doc.roomId || ""}`}>
      <button type="button" onClick={() => onManage(keys)}><Plus size={15} />เพิ่มวัตถุดิบ</button>
      <button type="button" className={styles.hideDocumentAction} onClick={() => onHide(keys)}><EyeOff size={15} />ซ่อนใบนี้</button>
      <details className={styles.moreMenu}>
        <summary><MoreHorizontal size={15} />เพิ่มเติม</summary>
        <div>
          <button type="button" disabled={!canSupplement} onClick={(event) => { event.currentTarget.closest("details").open = false; onSupplemental(keys[0]); }}><FileSpreadsheet size={15} />ใบเบิกเพิ่มเติม</button>
          <button type="button" onClick={(event) => { event.currentTarget.closest("details").open = false; onReset(keys); }}>รีเซ็ตใบนี้</button>
        </div>
      </details>
    </div>
  );
}

export default function RequisitionDocumentToolbar({ documents, onActiveChange }) {
  const [selectedKey, setSelectedKey] = useState("");
  const navigationRef = useRef(null);
  const pendingKey = useRef(null);
  const settleTimer = useRef(null);
  const active = documents.find((doc) => doc.documentKey === selectedKey) || documents[0];

  useEffect(() => {
    onActiveChange?.(active?.documentKey || "");
  }, [active?.documentKey, onActiveChange]);

  useEffect(() => {
    let frame;
    let scroller = navigationRef.current?.parentElement;
    while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    scroller ||= document.scrollingElement;
    const settle = () => { pendingKey.current = null; };
    const track = (event) => {
      // Horizontal tab/table scrolling must not change the selected paper.
      if (event && event.target !== scroller && event.target !== document) return;
      clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(settle, 180);
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const edge = navigationRef.current?.getBoundingClientRect().bottom || 0;
        const papers = documents.flatMap((doc) => {
          const element = document.getElementById(requisitionDocumentId(doc.documentKey));
          return element ? [{ key: doc.documentKey, bottom: element.getBoundingClientRect().bottom }] : [];
        });
        const atBottom = scroller && scroller.scrollHeight > scroller.clientHeight && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2;
        const current = roomAtScrollPosition(papers, edge, atBottom, pendingKey.current);
        if (current) setSelectedKey(current);
      });
    };
    const interrupt = (event) => {
      if (event.type === "keydown" && !["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(event.key)) return;
      if (event.type === "pointerdown" && navigationRef.current?.contains(event.target)) return;
      if (pendingKey.current) scroller?.scrollTo({ top: scroller.scrollTop, left: scroller.scrollLeft, behavior: "instant" });
      settle();
      track();
    };
    window.addEventListener("scroll", track, true);
    const interruptionEvents = ["wheel", "touchstart", "pointerdown", "keydown"];
    interruptionEvents.forEach((type) => window.addEventListener(type, interrupt, { capture: true, passive: true }));
    track();
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(settleTimer.current);
      pendingKey.current = null;
      window.removeEventListener("scroll", track, true);
      interruptionEvents.forEach((type) => window.removeEventListener(type, interrupt, true));
    };
  }, [documents]);

  if (!active) return null;
  const jump = (doc) => {
    if (!doc) return;
    const element = document.getElementById(requisitionDocumentId(doc.documentKey));
    if (!element) return;
    clearTimeout(settleTimer.current);
    pendingKey.current = doc.documentKey;
    settleTimer.current = setTimeout(() => { pendingKey.current = null; }, 1200);
    setSelectedKey(doc.documentKey);
    element.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const index = documents.indexOf(active);

  return (
    <div ref={navigationRef} className={styles.documentNavigation}>
      <nav className={styles.roomNavigation} aria-label="ไปยังใบเบิก">
        <button type="button" aria-label="ไปใบเบิกก่อนหน้า" disabled={index === 0} onClick={() => jump(documents[index - 1])}><ChevronLeft size={16} /></button>
        <div className={styles.roomLinks}>
          {documents.map((doc) => (
            <button key={doc.documentKey} type="button" aria-current={doc === active ? "location" : undefined} onClick={() => jump(doc)}>
              {String(doc.roomLabel || doc.roomId || doc.ownerDepartmentName || "ใบเบิก").replace(/^\[[^\]]+\]\s*/, "").trim() || "ใบเบิก"}
              <span> ({doc.previewProductCount || 1})</span>
            </button>
          ))}
        </div>
        <button type="button" aria-label="ไปใบเบิกถัดไป" disabled={index === documents.length - 1} onClick={() => jump(documents[index + 1])}><ChevronRight size={16} /></button>
      </nav>
    </div>
  );
}
