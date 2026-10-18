"use client";

import { useState } from "react";
import { X } from "lucide-react";
import SettingsDialog from "@/components/settings/SettingsDialog";
import styles from "./PackingWorkspace.module.css";

const labels = { sachet: "ซอง", pack: "แพ็ค", pail: "ปี๊บ", carton: "ลัง" };
export default function PackingUnitDialog({ product, departmentId, onClose, onSaved }) {
  const [parent, setParent] = useState(product.units.find(unit => unit.code === "pack")?.code || product.units[0].code);
  const [child, setChild] = useState(Object.keys(labels).find(code => !product.units.some(unit => unit.code === code)) || "");
  const [quantity, setQuantity] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/admin/packing-units", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productCode: product.code, departmentId, unitVersion: product.unitVersion, parentCode: parent, childCode: child, quantity: Number(quantity) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "บันทึกหน่วยไม่สำเร็จ");
      await onSaved(); onClose();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <SettingsDialog label="หน่วยบรรจุ" busy={busy} onClose={onClose}><form className={styles.sourceDialog} onSubmit={submit}>
    <header><h2>หน่วยบรรจุ</h2><button type="button" disabled={busy} onClick={onClose} aria-label="ปิด"><X size={20} /></button></header>
    <div className={styles.sourceProduct}><div><strong>{product.code}</strong><p>{product.name}</p></div></div>
    <table className={styles.sourcePickerTable}><thead><tr><th>หน่วยใหญ่</th><th>จำนวนต่อหน่วย</th><th>หน่วยย่อย</th></tr></thead><tbody>
      {product.units.slice(1).map((unit, index) => <tr key={unit.code}><td>1 {unit.label}</td><td>{(unit.factor / product.units[index].factor).toLocaleString("th-TH")}</td><td>{product.units[index].label}</td></tr>)}
      {!product.unitSupplement && <tr><td><select aria-label="หน่วยใหญ่" value={parent} disabled={busy} onChange={event => setParent(event.target.value)}>{product.units.filter(unit => unit.code !== "kg").map(unit => <option value={unit.code} key={unit.code}>1 {unit.label}</option>)}</select></td><td><input aria-label="จำนวนต่อหน่วย" type="number" min="2" max="10000" step="1" required value={quantity} disabled={busy} onChange={event => setQuantity(event.target.value)} /></td><td><select aria-label="หน่วยย่อย" value={child} disabled={busy} onChange={event => setChild(event.target.value)}>{Object.entries(labels).filter(([code]) => !product.units.some(unit => unit.code === code)).map(([code, label]) => <option value={code} key={code}>{label}</option>)}</select></td></tr>}
    </tbody></table>
    <small className={styles.hint}>{product.unitSupplement ? "ตั้งค่าหน่วยเพิ่มเติมแล้ว ไม่แก้ไขเอกสารเดิม" : "เติมเฉพาะหน่วยที่ขาด บันทึกครั้งเดียวต่อสินค้า"}</small>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <footer><span>ไม่เปลี่ยนยอดย้อนหลัง</span><button type="submit" className={styles.saveButton} disabled={busy || !child || Boolean(product.unitSupplement)}>{busy ? "กำลังบันทึก..." : "บันทึกหน่วย"}</button></footer>
  </form></SettingsDialog>;
}
