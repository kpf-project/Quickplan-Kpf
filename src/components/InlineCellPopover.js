"use client";
import { useState } from "react";
import styles from "./InlineCellPopover.module.css";

export default function InlineCellPopover({ label, disabled = false, children }) {
  const [position, setPosition] = useState({left:0,top:0});
  if (disabled) return <span>{label}</span>;
  return <details className={styles.cell} onToggle={event => {
    if (!event.currentTarget.open) return;
    const anchor = event.currentTarget.querySelector("summary").getBoundingClientRect();
    const panel = event.currentTarget.querySelector("[data-cell-panel]").getBoundingClientRect();
    setPosition({left:Math.max(8, Math.min(anchor.left, window.innerWidth-panel.width-8)),top:Math.max(8, Math.min(anchor.bottom+4, window.innerHeight-panel.height-8))});
  }} onKeyDown={event => {
    if (event.key === "Escape") { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector("summary")?.focus(); }
  }} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false; }}>
    <summary>{label}</summary><div data-cell-panel className={styles.panel} style={position}>{children}</div>
  </details>;
}
