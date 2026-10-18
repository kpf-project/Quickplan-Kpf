"use client";

import { useRef, useState } from "react";
import styles from "./RequisitionPreviewPresentation.module.css";

export default function EditableRequisitionQtyCell({ value, onSave, label = "แก้ไขจำนวน" }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const active = useRef(false);
  const input = useRef(null);
  const restoreFocus = useRef(false);
  const parsed = draft.trim() === "" ? 0 : Number(draft);
  const valid = Number.isFinite(parsed) && parsed >= 0;

  const save = async () => {
    if (!active.current || pending.current) return;
    if (!valid) { setError("กรุณากรอกจำนวนตั้งแต่ 0 ขึ้นไป หรือล้างช่องเพื่อเอายอดออก"); return; }
    const qty = Number(parsed.toFixed(3));
    if (qty === Number(value || 0)) {
      restoreFocus.current = typeof document !== "undefined" && document.activeElement === input.current;
      active.current = false;
      setEditing(false);
      return;
    }
    pending.current = true;
    setSaving(true);
    setError("");
    try {
      if (await onSave(qty) === false) {
        setError("บันทึกไม่สำเร็จ กรุณาตรวจสอบสถานะด้านบน แล้วกด Enter เพื่อลองอีกครั้ง");
      } else {
        restoreFocus.current = typeof document !== "undefined" && document.activeElement === input.current;
        active.current = false;
        setEditing(false);
      }
    } catch (saveError) {
      setError(saveError?.message || "บันทึกไม่สำเร็จ กด Enter เพื่อลองอีกครั้ง");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  if (editing) return (
    <span className={styles.inlineQuantity}>
      <input ref={input} data-requisition-quantity autoFocus type="text" inputMode="decimal" aria-label={label} aria-invalid={Boolean(error)} aria-busy={saving} readOnly={saving}
        value={draft} onFocus={(event) => event.target.select()} onChange={(event) => { setDraft(event.target.value); setError(""); }} onBlur={save}
        onKeyDown={(event) => {
          if (event.nativeEvent?.isComposing) return;
          if (event.key === "Escape") {
            event.preventDefault();
            if (!pending.current) { active.current = false; restoreFocus.current = true; setEditing(false); setError(""); }
          } else if (event.key === "Enter") {
            event.preventDefault();
            return save();
          } else if (event.key === "Tab") {
            if (!valid) event.preventDefault();
            const result = save();
            if (valid) {
              const container = event.currentTarget?.closest('[role="dialog"]') || event.currentTarget?.closest("[data-requisition-document]");
              const cells = Array.from(container?.querySelectorAll("[data-requisition-quantity]") || []);
              const index = cells.indexOf(event.currentTarget);
              const next = index >= 0 ? cells[index + (event.shiftKey ? -1 : 1)] : null;
              if (next) { event.preventDefault(); next.focus(); }
            }
            return result;
          }
        }} />
      {saving ? <span role="status" className={styles.quantityFeedback}>กำลังบันทึก...</span> : null}
      {error ? <span role="alert" className={styles.quantityError}>{error}</span> : null}
    </span>
  );

  return <button type="button" data-requisition-quantity className={styles.quantityButton} aria-label={label} title="คลิกเพื่อแก้ไข · Enter/Tab หรือคลิกออกเพื่อบันทึก · Esc เพื่อยกเลิก"
    ref={(node) => { if (node && restoreFocus.current) { restoreFocus.current = false; node.focus(); } }}
    onClick={() => { active.current = true; setDraft(Number(value) > 0 ? String(value) : ""); setError(""); setEditing(true); }}>
    {Number(value) > 0 ? Number(value).toLocaleString("th-TH", { maximumFractionDigits: 3 }) : "-"}
  </button>;
}
