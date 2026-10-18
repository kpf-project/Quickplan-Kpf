"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { AlertCircle, X } from "lucide-react";
import styles from "./WeightScaleWorkbench.module.css";

export function WeightScaleProductSummary({ item, products = [] }) {
  const product = products.find(product => product.code === item?.productCode);
  const imageUrl = product?.imageUrl || item?.imageUrl;
  return <div className={styles.product}>
    {imageUrl ? <Image src={imageUrl} alt={item?.productName || product?.name || "สินค้า"} width={140} height={120} unoptimized /> : null}
    <div><small>สินค้า</small><h2>{item?.productCode || "รอสแกนบาร์โค้ด"}</h2><p>{item?.productName || product?.name || "ตรวจสอบรายการเดิมก่อนดำเนินการ"}</p><small>LOT</small><strong>{item?.lotNo || "—"}</strong></div>
  </div>;
}

export function WeightScaleConfirmation({ open, item, reason, busy, onClose, onConfirm, products, title = "ยืนยันยกเลิกรายการชั่ง", note = "ยกเลิกรายการและปรับออกจากสต็อก โดยยังเก็บประวัติไว้" }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className={styles.confirm} aria-labelledby="scale-confirm-title" onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    <header><AlertCircle size={32} /><h2 id="scale-confirm-title">{title}</h2><button type="button" aria-label="ปิดหน้าต่าง" onClick={onClose} disabled={busy}><X size={20} /></button></header>
    <p>กรุณาตรวจสอบรายการก่อนยืนยัน</p>
    <WeightScaleProductSummary item={item} products={products} />
    <dl><dt>บาร์โค้ดใบชั่ง</dt><dd>{item?.barcode}</dd><dt>น้ำหนักสุทธิเดิม</dt><dd>{Number(item?.netWeightKg || 0).toFixed(3)} kg</dd><dt>วันที่ชั่งเดิม</dt><dd>{item?.weighedAt ? new Date(item.weighedAt).toLocaleDateString("th-TH", { timeZone: "Asia/Bangkok" }) : "—"}</dd><dt>วันที่ยกเลิกจริง</dt><dd>ตามเวลาระบบเมื่อยืนยัน</dd><dt>เหตุผล</dt><dd>{reason}</dd></dl>
    <p className={styles.note}>{note}</p>
    <footer><button type="button" onClick={onClose} disabled={busy} autoFocus>กลับไปตรวจสอบ</button><button type="button" className={styles.danger} onClick={onConfirm} disabled={busy}>{busy ? "กำลังยกเลิก…" : "ยืนยันยกเลิก"}</button></footer>
  </dialog>;
}
