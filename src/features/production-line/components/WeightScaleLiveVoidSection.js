"use client";

import WeightScaleHistoryTable from "./WeightScaleHistoryTable";
import styles from "./WeightScaleWorkbench.module.css";

export default function WeightScaleLiveVoidSection() {
  const title = "ยกเลิกชั่ง";
  return <section className={styles.page}>
    <div className={styles.title}><h2>{title}</h2></div>
    <p role="status" className={styles.warning}>ยังไม่เปิดทำรายการ — รอระบบข้อมูลอิสระของหน้ากลาง ไม่มีการค้นหาหรือเปลี่ยนข้อมูลระบบเดิม</p>
    <WeightScaleHistoryTable title={title} count={0} empty columnCount={8} emptyMessage="ระบบข้อมูลอิสระยังไม่พร้อม">
      <thead><tr>{["ลำดับ","บาร์โค้ด","รหัสสินค้า","ชื่อสินค้า","LOT","น้ำหนักสุทธิ (kg)","วันที่ชั่ง","สถานะ"].map(column => <th key={column}>{column}</th>)}</tr></thead>
      <tbody />
    </WeightScaleHistoryTable>
  </section>;
}
