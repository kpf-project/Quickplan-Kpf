"use client";

import { useState } from "react";
import { AlertCircle, Ban, Loader2, X } from "lucide-react";

export default function WeightScaleLiveVoidModal({
  receipt,
  isOpen,
  onClose,
  onConfirmVoid,
  isProcessing = false,
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");

  if (!isOpen || !receipt) {
    return null;
  }

  const isIssued = Boolean(receipt?.isIssued || receipt?.metadata?.issuedAt);

  async function handleSubmit(event) {
    event.preventDefault();
    if (isIssued) {
      setError("ไม่สามารถยกเลิกได้ เนื่องจากสินค้านี้ถูกเบิกใช้งานไปแล้ว");
      return;
    }

    try {
      setError("");
      await onConfirmVoid?.(receipt.id, reason);
      setReason("");
      onClose();
    } catch (err) {
      setError(err?.message || "เกิดข้อผิดพลาดในการยกเลิกรายการชั่ง");
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 px-4 py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="void-modal-title"
        className="flex w-full max-w-lg flex-col overflow-hidden border border-[#d7dde5] bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 bg-[var(--surface-navy,#001F3F)] px-5 py-3 text-white">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-sm border border-rose-500/30 bg-rose-500/10 text-rose-400">
              <Ban size={16} />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#d4af37]">
                STOCK INTEGRITY GUARD
              </p>
              <h3 id="void-modal-title" className="text-base font-bold text-white">
                ยกเลิกรายการชั่งรับเข้า
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isProcessing}
            className="inline-flex h-8 w-8 items-center justify-center text-slate-400 hover:text-white"
            aria-label="ปิดหน้าต่าง"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-5">
          {error ? (
            <div className="flex items-start gap-2.5 border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          ) : null}

          {isIssued ? (
            <div className="flex items-start gap-2.5 border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <AlertCircle size={16} className="mt-0.5 shrink-0 text-amber-600" />
              <div>
                <p className="font-bold">⚠️ รายการนี้ถูกเบิกไปใช้งานแล้ว</p>
                <p className="mt-1 text-slate-600">
                  ตามหลักมาตรฐานสต็อกสากล ห้ามยกเลิกใบชั่งรับเข้าที่มีการเบิกจ่ายออกไปแล้ว กรุณาติดต่อหัวหน้างานหรือทำการยกเลิกใบเบิกก่อน
                </p>
              </div>
            </div>
          ) : null}

          {/* Receipt Info Card */}
          <div className="border border-slate-200 bg-slate-50 p-3.5 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <span className="text-[10px] uppercase text-slate-500">เลขบาร์โค้ด:</span>
                <p className="font-mono text-sm font-black text-[#001F3F]">{receipt.barcode}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-500">รหัส / LOT:</span>
                <p className="font-semibold text-slate-800">
                  {receipt.productCode} <span className="text-slate-400">|</span> {receipt.lotNo}
                </p>
              </div>
              <div className="col-span-2">
                <span className="text-[10px] uppercase text-slate-500">ชื่อสินค้า:</span>
                <p className="font-medium text-slate-800">{receipt.productName || "-"}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-500">น้ำหนักสุทธิ (NET):</span>
                <p className="text-base font-black text-slate-900">
                  {Number(receipt.netWeightKg || 0).toFixed(2)} kg
                </p>
              </div>
              <div>
                <span className="text-[10px] uppercase text-slate-500">เวลาที่ชั่ง:</span>
                <p className="text-slate-700">{receipt.weighedAt ? new Date(receipt.weighedAt).toLocaleTimeString("th-TH") : "-"}</p>
              </div>
            </div>
          </div>

          {/* Reason Input */}
          <div>
            <label htmlFor="void-reason" className="block text-xs font-bold text-slate-700">
              เหตุผลในการยกเลิก <span className="text-slate-400 font-normal">(ระบุหรือไม่ก็ได้)</span>:
            </label>
            <input
              id="void-reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={isProcessing || isIssued}
              placeholder="เช่น ชั่งน้ำหนักผิด, สติกเกอร์พิมพ์เสีย, ถังชำรุด"
              className="mt-1.5 w-full border border-slate-300 px-3 py-2 text-xs focus:border-[#001F3F] focus:outline-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="mt-2 flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-100"
            >
              ยกเลิก / ปิด
            </button>
            <button
              type="submit"
              disabled={isProcessing || isIssued}
              className="inline-flex items-center gap-1.5 border border-rose-600 bg-rose-600 px-4 py-2 text-xs font-black uppercase tracking-wider text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
            >
              {isProcessing ? (
                <>
                  <Loader2 size={13} className="animate-spin" />
                  <span>กำลังยกเลิก...</span>
                </>
              ) : (
                <>
                  <Ban size={13} />
                  <span>ยืนยันยกเลิกรายการชั่งนี้</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
