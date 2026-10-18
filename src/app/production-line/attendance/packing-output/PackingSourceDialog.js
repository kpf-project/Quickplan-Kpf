"use client";

import { Package, X } from "lucide-react";
import SettingsDialog from "@/components/settings/SettingsDialog";
import styles from "./PackingWorkspace.module.css";

export default function PackingSourceDialog({ product, loading, options, selected, onChange, onClose }) {
  const invalid = selected.some(row => !Number.isFinite(Number(row.use)) || Number(row.use) <= 0 || Number(row.use) > Number(row.remaining) || (row.unit_code !== "kg" && !Number.isInteger(Number(row.use))));
  return <SettingsDialog label="เลือกยอดค้างมาใช้" onClose={onClose}>
    <div className={styles.sourceDialog}>
      <header><h2>เลือกยอดค้างมาใช้</h2><button type="button" onClick={onClose} aria-label="ปิด"><X size={20} /></button></header>
      <div className={styles.sourceProduct}>
        <span>{product?.imageUrl ? <img src={product.imageUrl} alt={product.name} /> : <Package size={28} />}</span>
        <div><strong>{product?.code}</strong><p>{product?.name}</p></div>
      </div>
      <div className={styles.sourceScroll}>
        <table className={styles.sourcePickerTable}>
          <thead><tr><th aria-label="เลือก" /><th>LOT / วันที่รับเข้า</th><th>คงเหลือ</th><th>นำมาใช้</th></tr></thead>
          <tbody>{loading ? <tr><td colSpan={4} role="status">กำลังโหลดยอดคงเหลือ...</td></tr> : !options.length ? <tr><td colSpan={4}>ไม่มียอดค้างที่เลือกได้</td></tr> : options.map(item => {
            const chosen = selected.find(row => row.id === item.id);
            return <tr key={item.id} data-selected={Boolean(chosen)}>
              <td><input type="checkbox" aria-label={`เลือก LOT ${item.lot_no}`} checked={Boolean(chosen)} onChange={event => onChange(event.target.checked ? [...selected, { ...item, use: "" }] : selected.filter(row => row.id !== item.id))} /></td>
              <td><strong>{item.lot_no}</strong><small>{new Intl.DateTimeFormat("th-TH", { dateStyle: "short" }).format(new Date(`${item.work_date}T00:00:00+07:00`))}</small></td>
              <td>{Number(item.remaining).toLocaleString("th-TH")} {item.unit_label}</td>
              <td><input type="number" min="0" max={item.remaining} step={item.unit_code === "kg" ? "0.001" : "1"} disabled={!chosen} aria-label={`จำนวนที่ใช้ LOT ${item.lot_no}`} value={chosen?.use ?? ""} onChange={event => onChange(selected.map(row => row.id === item.id ? { ...row, use: event.target.value } : row))} /></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <footer><span>{selected.length ? `เลือก ${selected.length} รายการ` : "เลือก LOT ที่ต้องการนำมาใช้"}{invalid && <small role="status">กรอกจำนวนให้มากกว่า 0 และไม่เกินยอดคงเหลือ</small>}</span><button type="button" className={styles.saveButton} disabled={loading || invalid} onClick={onClose}>ยืนยันยอดที่นำมาใช้</button></footer>
    </div>
  </SettingsDialog>;
}
