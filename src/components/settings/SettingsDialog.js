"use client";

import { useEffect, useRef } from "react";
import "./settings.css";

export default function SettingsDialog({ children, onClose, busy = false, label, compact = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);
  return (
    <dialog ref={ref} className={compact ? "settings-dialog settings-dialog-compact" : "settings-dialog"} aria-label={label}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      {children}
    </dialog>
  );
}
