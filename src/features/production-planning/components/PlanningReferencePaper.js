"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronUp, Maximize2, Minimize2, Printer } from "lucide-react";
import styles from "./RequisitionPreviewPresentation.module.css";

export async function printPlanningReference(paper) {
  if (document.fullscreenElement) await document.exitFullscreen();
  const style = document.createElement("style");
  style.textContent = "@page { size: A4 landscape; margin: 10mm; }";
  const cleanup = () => {
    paper.removeAttribute("data-print-plan");
    style.remove();
    window.removeEventListener("afterprint", cleanup);
  };
  paper.setAttribute("data-print-plan", "true");
  document.head.appendChild(style);
  window.addEventListener("afterprint", cleanup);
  try { window.print(); } catch (error) { cleanup(); throw error; }
  return cleanup;
}

export default function PlanningReferencePaper({ title, metadata, onCollapse, children }) {
  const paperRef = useRef(null);
  const printCleanup = useRef(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const changed = () => setFullscreen(document.fullscreenElement === paperRef.current);
    document.addEventListener("fullscreenchange", changed);
    return () => {
      document.removeEventListener("fullscreenchange", changed);
      printCleanup.current?.();
    };
  }, []);
  const expand = async () => {
    setError("");
    try {
      if (document.fullscreenElement === paperRef.current) await document.exitFullscreen();
      else if (paperRef.current?.requestFullscreen) await paperRef.current.requestFullscreen();
      else setError("เบราว์เซอร์นี้ไม่รองรับเต็มจอ กรุณาใช้โหมดพิมพ์เพื่อดูเต็มหน้า");
    } catch { setError("เปิดเต็มจอไม่สำเร็จ กรุณาลองอีกครั้ง"); }
  };
  const print = async () => {
    setError("");
    try {
      printCleanup.current?.();
      printCleanup.current = await printPlanningReference(paperRef.current);
    } catch { setError("เปิดหน้าพิมพ์ไม่สำเร็จ กรุณาลองอีกครั้ง"); }
  };
  return (
    <section ref={paperRef} className={styles.referencePaper} aria-label={title}>
      <header className={styles.referenceHeader}>
        <div><h2>{title}</h2><p>{metadata}</p></div>
        <div className={styles.referenceActions}>
          <button type="button" onClick={expand}>{fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}{fullscreen ? "ออกจากเต็มจอ" : "เต็มจอ"}</button>
          <button type="button" onClick={print}><Printer size={14} />พิมพ์</button>
          {!fullscreen && <button type="button" onClick={onCollapse}><ChevronUp size={14} />ย่อ</button>}
        </div>
      </header>
      {error && <p role="alert">{error}</p>}
      <div className={styles.referenceContent}>{children}</div>
    </section>
  );
}
