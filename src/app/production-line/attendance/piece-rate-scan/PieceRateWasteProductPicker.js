"use client";

import { Package, ScanLine, Scale } from "lucide-react";

import PieceRateWorkflowTabs from "@/features/attendance/components/PieceRateWorkflowTabs";
import styles from "./PieceRateWasteWorkflow.module.css";

export default function PieceRateWasteProductPicker({ products, onSelect, workflowMode, onWorkflowModeChange }) {
  return (
    <main className={styles.page}>
      <PieceRateWorkflowTabs activeMode={workflowMode} onChange={onWorkflowModeChange} />
      <header className={styles.hero}>
        <div className={styles.heroTitle}>
          <div className={styles.heroIcon}><Scale /></div>
          <div><span className={styles.eyebrow}>WASTE WEIGH</span><h1>ชั่งของเสียจากการผลิต</h1><p>เลือกสินค้าหรือยิงบาร์โค้ด ก่อนอ่านน้ำหนักจาก Scale Agent</p></div>
        </div>
        <div className={styles.modeCard}><span>โหมดการทำงานปัจจุบัน</span><strong>บันทึกน้ำหนักของเสียแยกตามสินค้า</strong></div>
      </header>
      <section className={styles.workspace}>
        <div className={styles.panel}>
          <div className={styles.stepTitle}><span className={styles.stepNo}>01</span><div><h2>เลือกหรือสแกนสินค้า</h2><p>รองรับเครื่องสแกน USB และการเลือกจากรายการสินค้า</p></div></div>
          <select className={styles.selectBox} value="" onChange={(event) => onSelect(event.target.value)}>
            <option value="">เลือกจากรายการ หรือยิงบาร์โค้ดสินค้า</option>
            {products.map((record) => <option key={record.productBarcode} value={record.productBarcode}>{record.payload.product.goodsCode || record.payload.product.code} - {record.payload.product.name}</option>)}
          </select>
          <div className={styles.scanHint}><Package /><strong>รอรับสินค้า</strong><span>ยิงบาร์โค้ดสินค้าได้ทันที โดยไม่ต้องคลิกช่องกรอก</span></div>
        </div>
        <div className={`${styles.panel} ${styles.scalePanel}`}><ScanLine size={54} color="#7891ad" /><div className={styles.weight}>0.000<small>kg</small></div><div className={styles.badge}>รอเลือกสินค้า</div><button className={styles.action} type="button" disabled>บันทึกของเสีย</button></div>
      </section>
      <section className={styles.history}><div className={styles.historyHeader}>รายการล่าสุดในรอบนี้ <span>0 รายการ</span></div><div className={styles.historyEmpty}>ยังไม่มีรายการที่บันทึกในรอบนี้</div></section>
    </main>
  );
}
