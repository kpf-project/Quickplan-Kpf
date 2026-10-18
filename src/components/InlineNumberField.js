"use client";

import { useRef, useState } from "react";
import styles from "./InlineNumberField.module.css";

export default function InlineNumberField({ value, onCommit, label, disabled = false, min = 0, step = "0.0001" }) {
  const [draft, setDraft] = useState(null);
  const cancelled = useRef(false);
  const [initial] = useState(value);
  function commit() {
    if (cancelled.current) { cancelled.current = false; return; }
    if (draft === null) return;
    const number = Number(draft);
    if (draft !== "" && Number.isFinite(number) && number >= min && number !== Number(value)) onCommit(number);
    setDraft(null);
  }
  return <input type={draft === null ? "text" : "number"} role="spinbutton" aria-valuenow={Number(value)} aria-valuemin={min} aria-label={label} value={draft ?? (value === "" || value == null ? "" : new Intl.NumberFormat("th-TH",{maximumFractionDigits:4}).format(Number(value)))}
    min={min} step={step} inputMode="decimal" disabled={disabled}
    className={styles.field} data-changed={Number(value) !== Number(initial)}
    onFocus={() => setDraft(String(value ?? ""))}
    onChange={event => setDraft(event.target.value)}
    onBlur={commit}
    onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); }
      if (event.key === "Escape") { event.preventDefault(); cancelled.current = true; setDraft(null); event.currentTarget.blur(); }
    }} />;
}
