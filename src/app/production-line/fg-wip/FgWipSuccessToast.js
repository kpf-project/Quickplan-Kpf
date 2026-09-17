"use client";

import { useEffect } from "react";
import { Check, X } from "lucide-react";
import styles from "./FgWipSuccessToast.module.css";

export default function FgWipSuccessToast({ message, onClose, duration = 3600 }) {
  useEffect(() => {
    if (!message) return undefined;
    const timeoutId = window.setTimeout(() => onClose?.(), duration);
    return () => window.clearTimeout(timeoutId);
  }, [duration, message, onClose]);

  if (!message) return null;

  return (
    <aside className={styles.toast} role="status" aria-live="polite">
      <div className={styles.goldRail} />
      <div className={styles.icon}><Check size={25} strokeWidth={3} /></div>
      <div className={styles.copy}>
        <span>ดำเนินการสำเร็จ</span>
        <strong>{message}</strong>
      </div>
      <button type="button" onClick={onClose} aria-label="ปิดข้อความแจ้งเตือน"><X size={18} /></button>
      <div className={styles.progress} style={{ animationDuration: `${duration}ms` }} />
    </aside>
  );
}
