"use client";

import { useState } from "react";
import { Plus, Pencil, RotateCcw, Save, X, Calendar, Hash, FileSpreadsheet } from "lucide-react";
import { fetchJson } from "@/lib/clientFetch";

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  
  // Format to Thai timezone or standard local string
  const d = String(date.getDate()).padStart(2, "0");
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const y = date.getFullYear() + 543; // BE Year
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  
  return `${d}/${m}/${y} ${hh}:${mm} น.`;
}

function formatNextDocumentNo(sequenceKey, lastValue) {
  const nextValue = Number(lastValue || 0) + 1;
  return `${sequenceKey}/${String(nextValue).padStart(4, "0")}`;
}

export default function RequisitionSequenceSettingsPanel({ payload, mutate, isLoading }) {
  const [editingSeq, setEditingSeq] = useState(null);
  const [editLastValue, setEditLastValue] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newSequenceKey, setNewSequenceKey] = useState("");
  const [newLastValue, setNewLastValue] = useState("0");
  
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const sequences = Array.isArray(payload?.data) ? payload.data : [];

  const handleEditClick = (seq) => {
    setEditingSeq(seq);
    setEditLastValue(String(seq.last_value ?? 0));
    setErrorMsg("");
    setSuccessMsg("");
  };

  const handleSaveEdit = async () => {
    if (!editingSeq) return;
    const value = parseInt(editLastValue, 10);
    if (Number.isNaN(value) || value < 0) {
      setErrorMsg("กรุณากรอกตัวเลขจำนวนเต็มตั้งแต่ 0 ขึ้นไป");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetchJson("/api/production-planning/requisition/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sequenceKey: editingSeq.sequence_key,
          lastValue: value,
        }),
      });

      if (!res.ok) {
        throw new Error(res.error?.message || "บันทึกข้อมูลไม่สำเร็จ");
      }

      setSuccessMsg(`อัปเดตเลขรันนิ่งของ ${editingSeq.sequence_key} สำเร็จ`);
      setEditingSeq(null);
      await mutate();
    } catch (err) {
      setErrorMsg(err.message || "เกิดข้อผิดพลาดในการบันทึกข้อมูล");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateSequence = async () => {
    const key = newSequenceKey.trim().toUpperCase();
    const value = parseInt(newLastValue, 10);

    if (!key) {
      setErrorMsg("กรุณากรอกรหัสพรีฟิกซ์ (เช่น XA6908)");
      return;
    }
    if (!/^XA\d{4}$/.test(key)) {
      setErrorMsg("รหัสพรีฟิกซ์ต้องอยู่ในรูปแบบ XAตามด้วยตัวเลข 4 หลัก (เช่น XA6908)");
      return;
    }
    if (Number.isNaN(value) || value < 0) {
      setErrorMsg("กรุณากรอกตัวเลขจำนวนเต็มตั้งแต่ 0 ขึ้นไป");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");
    setSuccessMsg("");

    try {
      const res = await fetchJson("/api/production-planning/requisition/sequences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sequenceKey: key,
          lastValue: value,
        }),
      });

      if (!res.ok) {
        throw new Error(res.error?.message || "สร้างพรีฟิกซ์ไม่สำเร็จ");
      }

      setSuccessMsg(`สร้างพรีฟิกซ์ ${key} สำเร็จ`);
      setIsCreateOpen(false);
      setNewSequenceKey("");
      setNewLastValue("0");
      await mutate();
    } catch (err) {
      setErrorMsg(err.message || "เกิดข้อผิดพลาดในการสร้างพรีฟิกซ์");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Action Banner / Alerts */}
      {(successMsg || errorMsg) && (
        <div className="flex flex-col gap-2">
          {successMsg && (
            <div className="rounded-[2px] border-2 border-emerald-600 bg-emerald-50 px-4 py-3 text-xs font-black uppercase tracking-[0.5px] text-emerald-800 flex items-center justify-between">
              <span>{successMsg}</span>
              <button onClick={() => setSuccessMsg("")} className="text-emerald-800 hover:text-emerald-950 font-bold">X</button>
            </div>
          )}
          {errorMsg && (
            <div className="rounded-[2px] border-2 border-[#DA291C] bg-[#FFF9F9] px-4 py-3 text-xs font-bold uppercase tracking-[0.5px] text-red-800 flex items-center justify-between">
              <span>{errorMsg}</span>
              <button onClick={() => setErrorMsg("")} className="text-red-800 hover:text-red-950 font-bold">X</button>
            </div>
          )}
        </div>
      )}

      {/* Main Settings Card */}
      <section className="rounded-[2px] border-2 border-[#102C57] bg-white p-6 shadow-none">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between border-b border-[#102C57]/10 pb-4 mb-6">
          <div>
            <h2 className="text-lg font-black text-[#102C57] flex items-center gap-2">
              <Hash className="h-5 w-5 text-[#d4af37]" />
              ตั้งค่าเลขรันนิ่งเอกสารใบเบิก
            </h2>
            <p className="text-xs text-[#667085] font-bold mt-1 uppercase tracking-[0.5px]">
              กำหนดและควบคุมลำดับเลขรันนิ่งล่าสุดสำหรับการส่งออก Excel (ตาราง: production_requisition_document_sequences)
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setIsCreateOpen(true);
              setErrorMsg("");
              setSuccessMsg("");
            }}
            className="inline-flex items-center gap-2 rounded-[2px] border border-[#102C57] bg-[var(--surface-navy,#102C57)] px-4 py-2 text-xs font-black uppercase tracking-[1.28px] text-white transition hover:bg-[#fff8e2] hover:text-black hover:border-[#d4af37] cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            เพิ่มพรีฟิกซ์ใหม่
          </button>
        </div>

        {/* Sequences Table */}
        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-xs text-black border-2 border-black">
            <thead>
              <tr className="bg-[var(--surface-navy,#102C57)] text-white">
                <th className="w-[20%] border-r border-b border-black px-4 py-3 text-left font-black uppercase tracking-[1px]">พรีฟิกซ์ (Prefix)</th>
                <th className="w-[20%] border-r border-b border-black px-4 py-3 text-right font-black uppercase tracking-[1px]">เลขล่าสุด (Last Value)</th>
                <th className="w-[25%] border-r border-b border-black px-4 py-3 text-center font-black uppercase tracking-[1px]">ตัวอย่างเลขถัดไป (Next Number)</th>
                <th className="w-[20%] border-r border-b border-black px-4 py-3 text-center font-black uppercase tracking-[1px]">อัปเดตล่าสุด (Last Updated)</th>
                <th className="w-[15%] border-b border-black px-4 py-3 text-center font-black uppercase tracking-[1px]">การจัดการ (Actions)</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-xs font-bold text-[#667085] bg-[#FCFCF9]">
                    กำลังโหลดข้อมูลเลขรันนิ่ง...
                  </td>
                </tr>
              ) : sequences.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-xs font-bold text-[#8F8F8F] bg-[#FCFCF9]">
                    ไม่พบข้อมูลประวัติชุดเลขรันนิ่งในระบบ
                  </td>
                </tr>
              ) : (
                sequences.map((seq) => {
                  const isEditing = editingSeq?.sequence_key === seq.sequence_key;
                  return (
                    <tr key={seq.sequence_key} className="bg-white hover:bg-slate-50 transition border-b border-black last:border-b-0">
                      {/* Sequence Key */}
                      <td className="border-r border-black px-4 py-3 font-mono font-black text-sm text-[#102C57]">
                        {seq.sequence_key}
                      </td>

                      {/* Last Value */}
                      <td className="border-r border-black px-4 py-3 text-right font-bold text-sm">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={editLastValue}
                            onChange={(e) => setEditLastValue(e.target.value)}
                            className="w-24 h-8 text-right px-2 font-mono font-bold rounded-[2px] border-2 border-[#102C57] bg-white outline-none focus:border-[#d4af37]"
                          />
                        ) : (
                          <span>{(seq.last_value ?? 0).toLocaleString()}</span>
                        )}
                      </td>

                      {/* Sample Next Number */}
                      <td className="border-r border-black px-4 py-3 text-center font-mono font-bold text-sm text-[#8a6a00] bg-[#fff8e2]/60">
                        {isEditing ? (
                          <span>{formatNextDocumentNo(seq.sequence_key, editLastValue)}</span>
                        ) : (
                          <span>{formatNextDocumentNo(seq.sequence_key, seq.last_value)}</span>
                        )}
                      </td>

                      {/* Last Updated */}
                      <td className="border-r border-black px-4 py-3 text-center text-gray-500 font-bold">
                        {formatDateTime(seq.updated_at)}
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-center">
                        {isEditing ? (
                          <div className="flex justify-center gap-1.5">
                            <button
                              type="button"
                              onClick={handleSaveEdit}
                              disabled={submitting}
                              className="inline-flex h-8 px-2.5 items-center gap-1 rounded-[2px] bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] tracking-[0.5px] transition cursor-pointer"
                            >
                              <Save className="h-3 w-3" />
                              บันทึก
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingSeq(null)}
                              className="inline-flex h-8 px-2.5 items-center gap-1 rounded-[2px] bg-gray-500 hover:bg-gray-600 text-white font-extrabold text-[10px] tracking-[0.5px] transition cursor-pointer"
                            >
                              <X className="h-3 w-3" />
                              ยกเลิก
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleEditClick(seq)}
                            className="inline-flex h-8 px-3 items-center gap-1 rounded-[2px] border border-[#102C57] bg-[#fff8e2] text-[#8a6a00] font-extrabold text-[10px] tracking-[0.5px] transition hover:bg-[#d4af37] hover:text-black cursor-pointer"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                            แก้ไขเลข
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Create Sequence Modal (Ferrari Design) */}
      {isCreateOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-[var(--surface-navy,#102C57)]/55 backdrop-blur-sm">
          <div className="bg-white rounded-[2px] border-2 border-[#102C57] shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-4 bg-[var(--surface-navy,#102C57)] text-white flex justify-between items-center border-b border-black">
              <div>
                <h3 className="text-base font-black uppercase tracking-[1px] text-white flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-[#d4af37]" />
                  เพิ่มรหัสพรีฟิกซ์ใหม่
                </h3>
                <div className="text-[10px] text-[#8F8F8F] font-bold mt-1 uppercase tracking-[0.5px]">
                  สำหรับเตรียมชุดเลขที่ใช้รันใบเบิกของเดือนในอนาคต
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="text-white/70 hover:text-white transition-colors text-sm font-black"
              >
                X
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-[11px] font-black uppercase tracking-[1px] text-[#666666] mb-1.5">
                  รหัสพรีฟิกซ์ (Prefix Key)
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={newSequenceKey}
                  onChange={(e) => setNewSequenceKey(e.target.value)}
                  placeholder="ตัวอย่างเช่น XA6909"
                  className="w-full h-10 px-3 rounded-[2px] border-2 border-[#CCCCCC] font-mono font-bold text-sm bg-white outline-none focus:border-[#102C57] focus:ring-0"
                />
                <span className="text-[9px] text-[#8F8F8F] block mt-1.5 font-bold uppercase tracking-[0.5px]">
                  * รูปแบบ: XA + ปี พ.ศ. 2 หลัก + เดือน 2 หลัก (เช่น XA6908)
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-black uppercase tracking-[1px] text-[#666666] mb-1.5">
                  ค่ารันล่าสุดก่อนเริ่มใช้ (Last Value)
                </label>
                <input
                  type="number"
                  min="0"
                  value={newLastValue}
                  onChange={(e) => setNewLastValue(e.target.value)}
                  placeholder="เช่น 0"
                  className="w-full h-10 px-3 rounded-[2px] border-2 border-[#CCCCCC] font-mono font-bold text-sm bg-white outline-none focus:border-[#102C57] focus:ring-0"
                />
                <span className="text-[9px] text-[#8F8F8F] block mt-1.5 font-bold uppercase tracking-[0.5px]">
                  * หากเริ่มใช้เป็นใบแรก ให้ใส่ค่าเป็น 0 (ใบเบิกใบแรกจะรันได้เลข 0001)
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-[#e4e7ec] bg-slate-50 px-6 py-4">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                disabled={submitting}
                className="rounded-[2px] border border-[#CCCCCC] bg-white px-4 py-2 text-xs font-black uppercase tracking-[1.28px] text-black transition hover:bg-slate-100 cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleCreateSequence}
                disabled={submitting}
                className="rounded-[2px] border border-[#102C57] bg-[var(--surface-navy,#102C57)] hover:bg-[var(--surface-navy,#0c2345)] px-4 py-2 text-xs font-black uppercase tracking-[1.28px] text-white transition cursor-pointer"
              >
                ยืนยันการเพิ่ม
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
