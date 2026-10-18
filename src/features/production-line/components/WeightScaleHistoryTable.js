"use client";

import { Children } from "react";
import styles from "./WeightScaleHistoryTable.module.css";

export default function WeightScaleHistoryTable({ title, count, controls, footer, isLoading = false, empty = false, emptyMessage = "ยังไม่มีรายการ", columnCount = 1, children }) {
  const parts = Children.toArray(children);
  return <section className={styles.history} aria-label={title} aria-busy={isLoading}>
    <header className={styles.toolbar}>
      <h3>{title}{count !== undefined ? <small> ({count} รายการ)</small> : null}</h3>
      <div className={styles.controls}>{controls}</div>
    </header>
    <div className={styles.scroll}>
      <table>
        {parts[0]}
        {isLoading || empty ? <tbody><tr><td colSpan={columnCount} className={styles.empty}><span role="status">{isLoading ? "กำลังโหลดรายการ…" : emptyMessage}</span></td></tr></tbody> : parts.slice(1)}
      </table>
    </div>
    {footer ? <footer className={styles.footer}>{footer}</footer> : null}
  </section>;
}
