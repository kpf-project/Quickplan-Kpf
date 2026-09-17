"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, Loader2, Search, X } from "lucide-react";
import {
  fetchPieceRatePrisonIssueLots,
  submitPieceRatePrisonIssue,
} from "@/features/attendance/services/pieceRatePrisonIssueClient";
import {
  calculatePrisonIssueQuantity,
  filterAndPaginatePrisonLots,
} from "@/features/attendance/utils/pieceRatePrisonIssue";
import styles from "./PieceRatePrisonIssueModal.module.css";

const PAGE_SIZE = 15;

function formatNumber(value, digits = 0) {
  return Number(value || 0).toLocaleString("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export default function PieceRatePrisonIssueModal({
  open,
  fgProduct,
  issueDate,
  onClose,
  onSuccess,
}) {
  const [lots, setLots] = useState([]);
  const [query, setQuery] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [page, setPage] = useState(1);
  const [weights, setWeights] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  const selectedLotNos = useMemo(() => new Set(
    Object.entries(weights).filter(([, value]) => Number(value) > 0).map(([lotNo]) => lotNo)
  ), [weights]);

  const pagination = useMemo(() => filterAndPaginatePrisonLots({
    lots,
    query,
    selectedLotNos,
    selectedOnly,
    page,
    pageSize: PAGE_SIZE,
  }), [lots, page, query, selectedLotNos, selectedOnly]);

  const selectedRows = useMemo(() => lots
    .filter((lot) => selectedLotNos.has(lot.lotNo))
    .map((lot) => ({
      ...lot,
      issueWeightKg: Number(weights[lot.lotNo]),
      issueQuantity: calculatePrisonIssueQuantity({
        availableQuantity: lot.availableQuantity,
        availableWeightKg: lot.availableWeightKg,
        issueWeightKg: Number(weights[lot.lotNo]),
      }),
    })), [lots, weights, selectedLotNos]);

  const totals = useMemo(() => selectedRows.reduce((sum, row) => ({
    quantity: sum.quantity + row.issueQuantity,
    weightKg: sum.weightKg + row.issueWeightKg,
  }), { quantity: 0, weightKg: 0 }), [selectedRows]);

  const loadLots = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const payload = await fetchPieceRatePrisonIssueLots();
      setLots(payload.lots || []);
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedOnly(false);
    setPage(1);
    setWeights({});
    void loadLots();
  }, [loadLots, open]);

  useEffect(() => setPage(1), [query, selectedOnly]);
  useEffect(() => {
    if (page !== pagination.currentPage) setPage(pagination.currentPage);
  }, [page, pagination.currentPage]);

  const toggleLot = (lot) => {
    setWeights((current) => ({
      ...current,
      [lot.lotNo]: Number(current[lot.lotNo]) > 0
        ? ""
        : Math.min(lot.availableWeightKg / lot.availableQuantity, lot.availableWeightKg).toFixed(3),
    }));
  };

  const updateWeight = (lot, value) => {
    const normalized = String(value).replace(/,/g, ".").replace(/[^\d.]/g, "");
    const [whole = "", ...decimalParts] = normalized.split(".");
    const decimal = decimalParts.join("").slice(0, 3);
    const input = decimalParts.length ? `${whole}.${decimal}` : whole;
    const weight = Number(input);
    const nextValue = input && Number.isFinite(weight) && weight > Number(lot.availableWeightKg)
      ? Number(lot.availableWeightKg).toFixed(3)
      : input;
    setWeights((current) => ({ ...current, [lot.lotNo]: nextValue }));
  };

  const setTrayFraction = (lot, fraction) => {
    const averageKg = lot.availableWeightKg / lot.availableQuantity;
    const weightKg = Math.min(lot.availableWeightKg, averageKg * fraction);
    setWeights((current) => ({ ...current, [lot.lotNo]: weightKg.toFixed(3) }));
  };

  const submit = async () => {
    if (!selectedRows.length || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const result = await submitPieceRatePrisonIssue({
        fgProductCode: fgProduct?.code || fgProduct?.goodsCode || fgProduct?.skuCode,
        issueDate,
        items: selectedRows.map((row) => ({ lotNo: row.lotNo, weightKg: row.issueWeightKg })),
      });
      onSuccess?.(result);
      onClose();
    } catch (error) {
      setMessage({ type: "error", text: error.message });
      await loadLots();
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;
  return (
    <div className={styles.backdrop}>
      <section className={styles.dialog} role="dialog" aria-modal="true" aria-labelledby="prison-issue-title">
        <header>
          <div><span>PRISON WIP ISSUE</span><h2 id="prison-issue-title">เบิกเนื้อขนมเรือนจำ</h2></div>
          <button type="button" onClick={onClose} aria-label="ปิด"><X /></button>
        </header>
        <div className={styles.context}>
          <div><small>สินค้า WIP</small><strong>WKB-0002-2</strong></div>
          <div><small>FG ปลายทาง</small><strong>{fgProduct?.code || fgProduct?.goodsCode} · {fgProduct?.name}</strong></div>
          <div><small>วันที่เบิก</small><strong>{issueDate}</strong></div>
        </div>
        <div className={styles.toolbar}>
          <label><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาหมายเลข LOT" autoFocus /></label>
          <label className={styles.selectedToggle}><input type="checkbox" checked={selectedOnly} onChange={(event) => setSelectedOnly(event.target.checked)} />แสดงเฉพาะที่เลือก</label>
          <span>คงเหลือ {lots.length} LOT</span>
        </div>
        {message ? <div className={styles.message} data-type={message.type}><AlertTriangle />{message.text}</div> : null}
        <div className={styles.tableWrap}>
          {loading ? <div className={styles.state}><Loader2 className={styles.spin} />กำลังโหลดสต็อก...</div> : (
            <table>
              <thead><tr><th></th><th>ลำดับ FIFO</th><th>หมายเลข LOT</th><th>วันที่รับเข้า</th><th>คงเหลือ</th><th>เฉลี่ย/กระบะ</th><th>น้ำหนักที่เบิกจริง (กก.)</th><th>เทียบเท่า (กระบะ)</th></tr></thead>
              <tbody>
                {pagination.rows.map((lot) => {
                  const selected = selectedLotNos.has(lot.lotNo);
                  const issueWeight = Number(weights[lot.lotNo]) || 0;
                  const issueQuantity = calculatePrisonIssueQuantity({
                    availableQuantity: lot.availableQuantity,
                    availableWeightKg: lot.availableWeightKg,
                    issueWeightKg: issueWeight,
                  });
                  return <tr key={lot.lotNo} data-selected={selected}>
                    <td><input type="checkbox" checked={selected} onChange={() => toggleLot(lot)} /></td>
                    <td><span className={styles.fifo}>#{lot.fifoOrder}</span></td>
                    <td><strong>{lot.lotNo}</strong></td>
                    <td>{lot.receiptDate || "-"}</td>
                    <td>{formatNumber(lot.availableQuantity)} กระบะ<br/><small>{formatNumber(lot.availableWeightKg, 3)} กก.</small></td>
                    <td>{formatNumber(lot.availableWeightKg / lot.availableQuantity, 3)} กก.</td>
                    <td>
                      <input className={styles.weightInput} inputMode="decimal" value={weights[lot.lotNo] ?? ""} onChange={(event) => updateWeight(lot, event.target.value)} placeholder="0.000" aria-label={`น้ำหนักที่เบิก LOT ${lot.lotNo}`} />
                      <div className={styles.quickWeights} aria-label="เลือกสัดส่วนกระบะ">
                        {[0.25, 0.5, 0.75, 1].map((fraction) => <button key={fraction} type="button" onClick={() => setTrayFraction(lot, fraction)}>{fraction === 1 ? "เต็ม" : `${fraction * 100}%`}</button>)}
                      </div>
                    </td>
                    <td className={styles.weight}>{formatNumber(issueQuantity, 3)}</td>
                  </tr>;
                })}
                {!pagination.rows.length ? <tr><td colSpan="8" className={styles.empty}>ไม่พบ LOT ที่ตรงกับเงื่อนไข</td></tr> : null}
              </tbody>
            </table>
          )}
        </div>
        <footer>
          <div className={styles.pagination}>
            <button type="button" onClick={() => setPage((value) => value - 1)} disabled={pagination.currentPage <= 1}><ChevronLeft />ก่อนหน้า</button>
            <b>หน้า {pagination.currentPage} / {pagination.totalPages}</b>
            <button type="button" onClick={() => setPage((value) => value + 1)} disabled={pagination.currentPage >= pagination.totalPages}>ถัดไป<ChevronRight /></button>
          </div>
          <div className={styles.summary}><span>เลือก <b>{selectedRows.length}</b> LOT</span><span><b>{formatNumber(totals.quantity, 3)}</b> กระบะ</span><span><b>{formatNumber(totals.weightKg, 3)}</b> กก.</span></div>
          <button className={styles.confirm} type="button" onClick={() => void submit()} disabled={!selectedRows.length || saving}>{saving ? <Loader2 className={styles.spin} /> : <CheckCircle2 />}ยืนยันการเบิก</button>
        </footer>
      </section>
    </div>
  );
}
