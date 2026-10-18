"use client";

import { useState } from "react";
import { HIGHLIGHT_PALETTE, LEGACY_HIGHLIGHTS, normalizeHighlightColor } from "../services/scheduleHighlightColors";
import styles from "./ScheduleHighlightPicker.module.css";

export default function ScheduleHighlightPicker({ value, onChange, label = "สีไฮไลต์" }) {
  const current = LEGACY_HIGHLIGHTS[value] || normalizeHighlightColor(value) || "#FFFFFF";
  const [hex, setHex] = useState(current);
  const [invalid, setInvalid] = useState(false);
  const [hexEdited, setHexEdited] = useState(false);
  const [previousValue, setPreviousValue] = useState(value);
  if (previousValue !== value) { setPreviousValue(value); setHex(current); setInvalid(false); setHexEdited(false); }
  const choose = (color) => { setInvalid(false); setHexEdited(false); onChange(color); };
  const apply = () => {
    if (!hexEdited) return;
    const color = normalizeHighlightColor(hex);
    if (!color?.startsWith("#")) { setInvalid(true); return; }
    setHex(color); choose(color);
  };
  return <div className={styles.field} role="group" aria-label={label}>
    <span>{label}</span>
    <details className={styles.picker}>
      <summary><span className={styles.swatch} style={{ backgroundColor: current }} />{value ? current : "ไม่มีสี"}</summary>
      <div className={styles.panel}>
        <strong>สีมาตรฐาน</strong>
        <div className={styles.palette}>{HIGHLIGHT_PALETTE.map(color => <button key={color} type="button" aria-label={`เลือกสี ${color}`} aria-pressed={current === color && Boolean(value)} style={{ backgroundColor: color }} onClick={() => choose(color)} />)}</div>
        <div className={styles.custom}>
          <input aria-label="เลือกสีไฮไลต์อิสระ" type="color" value={current} onChange={event => choose(event.target.value.toUpperCase())} />
          <input aria-label="รหัสสี HEX" value={hex} maxLength={7} aria-invalid={invalid} onChange={event => { setHex(event.target.value); setHexEdited(true); setInvalid(false); }} onBlur={apply} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); apply(); } }} />
        </div>
        {invalid && <small role="alert">ใช้รหัส HEX เช่น #EAF0F7</small>}
        <button type="button" onClick={() => choose(null)}>ล้างสีไฮไลต์</button>
      </div>
    </details>
  </div>;
}
