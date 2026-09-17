"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Info, Loader2, PackagePlus, Plus, Trash2 } from "lucide-react";
import PieceRateWorkflowTabs from "@/features/attendance/components/PieceRateWorkflowTabs";
import {
  fetchPieceRatePrisonReceipts,
  submitPieceRatePrisonReceipt,
} from "@/features/attendance/services/pieceRatePrisonReceiptClient";
import styles from "./PieceRatePrisonReceiptForm.module.css";

const FIXED_PRODUCT_CODE = "WKB-0002-2";
const EMPTY_ROW = Object.freeze({ lotNo: "", quantity: "", weightKg: "", remark: "" });

function formatWeight(value) {
  return Number(value || 0).toLocaleString("th-TH", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

function formatDateTime(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function PieceRatePrisonReceiptForm({ onModeChange }) {
  const [product, setProduct] = useState(null);
  const [receipts, setReceipts] = useState([]);
  const [rows, setRows] = useState([{ ...EMPTY_ROW }]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const payload = await fetchPieceRatePrisonReceipts();
      setProduct(payload.product);
      setReceipts(payload.receipts || []);
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const totals = useMemo(() => rows.reduce((summary, row) => ({
    lots: summary.lots + (row.lotNo.trim() ? 1 : 0),
    quantity: summary.quantity + (Number(row.quantity) || 0),
    weight: summary.weight + (Number(row.weightKg) || 0),
  }), { lots: 0, quantity: 0, weight: 0 }), [rows]);

  const updateRow = (index, key, value) => {
    setRows((current) => current.map((row, rowIndex) => (
      rowIndex === index ? { ...row, [key]: value } : row
    )));
  };

  const addRow = () => setRows((current) => [...current, { ...EMPTY_ROW }]);
  const removeRow = (index) => setRows((current) => (
    current.length === 1 ? [{ ...EMPTY_ROW }] : current.filter((_, rowIndex) => rowIndex !== index)
  ));

  const submit = async () => {
    setMessage(null);
    const invalid = rows.find((row) => (
      !row.lotNo.trim()
      || !Number.isInteger(Number(row.quantity))
      || Number(row.quantity) <= 0
      || !Number.isFinite(Number(row.weightKg))
      || Number(row.weightKg) <= 0
    ));
    if (invalid) {
      setMessage({ type: "error", text: "กรุณากรอก LOT จำนวนกระบะ และน้ำหนักให้ครบทุกแถว" });
      return;
    }

    setSaving(true);
    try {
      const result = await submitPieceRatePrisonReceipt(rows.map((row) => ({
        lotNo: row.lotNo.trim(),
        quantity: Number(row.quantity),
        weightKg: Number(row.weightKg),
        remark: row.remark.trim(),
      })));
      setRows([{ ...EMPTY_ROW }]);
      setMessage({ type: "success", text: `รับเข้าสำเร็จ เลขที่เอกสาร ${result.documentNo}` });
      await loadData();
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className={styles.page}>
      <PieceRateWorkflowTabs activeMode="prison-receipt" onChange={onModeChange} />
      <section className={styles.content}>
        <header className={styles.hero}>
          <div>
            <p>PRISON WIP RECEIPT</p>
            <h1>รับเข้าเนื้อขนมเรือนจำ</h1>
            <span>รับเข้า WIP เข้าสต็อกกลาง · ไม่ผูกสินค้า FG</span>
          </div>
          <div className={styles.heroStats}>
            <strong>{FIXED_PRODUCT_CODE}</strong>
            <span>สินค้ารับเข้าประจำ</span>
          </div>
        </header>

        <div className={styles.modeStrip}>
          <button type="button" onClick={() => onModeChange?.("weigh-in")}>ชั่งเข้าปกติ</button>
          <button type="button" className={styles.activeMode}>รับเข้าเรือนจำ</button>
        </div>

        <section className={styles.card}>
          <div className={styles.cardTitle}>
            <PackagePlus aria-hidden="true" />
            <div><h2>บันทึกรับเข้า WIP</h2><p>สร้างเลขเอกสาร PRW อัตโนมัติเมื่อยืนยัน</p></div>
          </div>

          <div className={styles.stepRow}>
            <span className={styles.stepNo}>1</span>
            <div className={styles.stepLabel}><strong>สินค้า WIP</strong><small>กำหนดไว้สำหรับรับเข้าเรือนจำ</small></div>
            <div className={styles.fixedProduct}>
              <span className={styles.productStatus}>
                {loading ? <Loader2 className={styles.spin} /> : <PackagePlus aria-hidden="true" />}
              </span>
              <strong>{product?.code || FIXED_PRODUCT_CODE}</strong>
              <span>{product?.name || "กำลังโหลดข้อมูลสินค้า..."}</span>
              <em>{product?.weightUnit || "KG"}</em>
            </div>
          </div>

          <div className={styles.tableStepHeader}>
            <div><span className={styles.stepNo}>2</span><strong>ระบุ LOT จำนวน และน้ำหนัก</strong></div>
            <button type="button" onClick={addRow}><Plus /> เพิ่ม LOT</button>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.entryTable}>
              <thead><tr>
                <th>รหัส WIP</th><th>ชื่อ WIP</th><th>หมายเลข LOT</th><th>จำนวน</th>
                <th>หน่วย</th><th>น้ำหนัก ({product?.weightUnit || "KG"})</th><th>หมายเหตุ</th><th aria-label="จัดการ" />
              </tr></thead>
              <tbody>{rows.map((row, index) => (
                <tr key={index}>
                  <td><strong>{FIXED_PRODUCT_CODE}</strong></td>
                  <td>{product?.name || "-"}</td>
                  <td><input aria-label={`LOT แถว ${index + 1}`} value={row.lotNo} onChange={(event) => updateRow(index, "lotNo", event.target.value)} placeholder="ระบุ LOT" /></td>
                  <td><input aria-label={`จำนวนแถว ${index + 1}`} type="number" min="1" step="1" value={row.quantity} onChange={(event) => updateRow(index, "quantity", event.target.value)} placeholder="0" /></td>
                  <td className={styles.unitCell}>กระบะ</td>
                  <td><input aria-label={`น้ำหนักแถว ${index + 1}`} type="number" min="0.001" step="0.001" value={row.weightKg} onChange={(event) => updateRow(index, "weightKg", event.target.value)} placeholder="0.000" /></td>
                  <td><input aria-label={`หมายเหตุแถว ${index + 1}`} value={row.remark} onChange={(event) => updateRow(index, "remark", event.target.value)} placeholder="ไม่บังคับ" /></td>
                  <td><button type="button" className={styles.deleteButton} onClick={() => removeRow(index)} aria-label={`ลบแถว ${index + 1}`}><Trash2 /></button></td>
                </tr>
              ))}</tbody>
              <tfoot><tr><td colSpan="2">1 สินค้า</td><td>{totals.lots} LOT</td><td colSpan="2">รวม {totals.quantity.toLocaleString("th-TH")} กระบะ</td><td colSpan="3">น้ำหนักรวม {formatWeight(totals.weight)} {product?.weightUnit || "KG"}</td></tr></tfoot>
            </table>
          </div>

          {message ? <div className={styles.message} data-type={message.type}>{message.type === "success" ? <CheckCircle2 /> : <AlertCircle />}<span>{message.text}</span></div> : null}

          <footer className={styles.actionBar}>
            <div><Info /><span>รายการนี้จะเพิ่มสต็อก WIP และนำไปใช้เบิกแบบ FIFO ตาม LOT</span></div>
            <button type="button" className={styles.cancelButton} onClick={() => setRows([{ ...EMPTY_ROW }])}>ล้างข้อมูล</button>
            <button type="button" className={styles.submitButton} disabled={saving || loading} onClick={() => void submit()}>{saving ? <Loader2 className={styles.spin} /> : <PackagePlus />} ยืนยันรับเข้า</button>
          </footer>
        </section>

        <section className={styles.recentCard}>
          <div className={styles.recentTitle}><h2>รายการรับเข้าล่าสุด</h2><span>เลขเอกสารสร้างอัตโนมัติแบบรายวัน</span></div>
          <div className={styles.tableWrap}><table className={styles.recentTable}>
            <thead><tr><th>เลขที่เอกสารรับเข้า</th><th>วันที่/เวลา</th><th>สินค้า WIP</th><th>จำนวน LOT</th><th>จำนวน</th><th>น้ำหนัก</th><th>สถานะ</th></tr></thead>
            <tbody>{receipts.length ? receipts.map((receipt) => (
              <tr key={receipt.id}><td><strong>{receipt.documentNo}</strong></td><td>{formatDateTime(receipt.createdAt)}</td><td>{receipt.productCode}</td><td>{receipt.itemCount}</td><td>{receipt.totalQuantity.toLocaleString("th-TH")} กระบะ</td><td>{formatWeight(receipt.totalWeightKg)} {receipt.weightUnit}</td><td><span className={styles.successBadge}>รับเข้าสำเร็จ</span></td></tr>
            )) : <tr><td colSpan="7" className={styles.empty}>{loading ? "กำลังโหลดข้อมูล..." : "ยังไม่มีรายการรับเข้า"}</td></tr>}</tbody>
          </table></div>
        </section>
      </section>
    </main>
  );
}
