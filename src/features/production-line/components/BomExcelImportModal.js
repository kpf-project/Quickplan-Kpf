"use client";

import { useMemo, useState } from "react";
import { Check, AlertTriangle, FileSpreadsheet, X, ArrowRight } from "lucide-react";

export default function BomExcelImportModal({
    isOpen,
    onClose,
    parsedData = [],
    onConfirm,
    existingMaterials = new Map() // Map<code, materialObj> to validate codes
}) {
    const [importMode, setImportMode] = useState("replace"); // "replace" | "append"

    const processedRows = useMemo(() => {
        return parsedData.map((row, index) => {
            // Flexible column matching
            const materialCode = String(row.Code || row.code || row["รหัส"] || row["วัตถุดิบ"] || "").trim();
            const qty = Number(row.Qty || row.qty || row["จำนวน"] || row["Quantity"] || 0);
            const note = row.Note || row.note || row["หมายเหตุ"] || "";
            
            const existing = existingMaterials.get(materialCode);
            const isValid = !!existing;
            
            return {
                id: `import-${index}`,
                code: materialCode,
                name: existing?.name || "ไม่พบรหัสวัตถุดิบนี้ในระบบ",
                qty: Math.max(0, qty),
                unit: existing?.uom || existing?.unit || "-",
                note,
                isValid,
                original: row
            };
        });
    }, [parsedData, existingMaterials]);

    const validCount = processedRows.filter(r => r.isValid).length;
    const invalidCount = processedRows.length - validCount;

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 text-[#102C57]">
            <div 
                className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />
            
            <div className="relative w-full max-w-4xl bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200 overflow-hidden">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 bg-[#102C57] text-white shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-white/10 rounded-lg">
                            <FileSpreadsheet className="w-6 h-6 text-[#d4af37]" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold">นำเข้าข้อมูล Excel</h2>
                            <p className="text-xs text-white/70">ตรวจสอบข้อมูลก่อนนำเข้าสู่ระบบ</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/70 hover:text-white"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6">
                    {/* Summary Stats */}
                    <div className="grid grid-cols-3 gap-4 mb-6">
                        <div className="p-4 rounded-xl border border-gray-100 bg-gray-50 flex flex-col items-center justify-center">
                            <span className="text-sm text-gray-500 font-medium">รายการทั้งหมด</span>
                            <span className="text-2xl font-bold text-[#102C57]">{processedRows.length}</span>
                        </div>
                        <div className="p-4 rounded-xl border border-emerald-100 bg-emerald-50 flex flex-col items-center justify-center">
                            <span className="text-sm text-emerald-600 font-medium">ข้อมูลถูกต้อง</span>
                            <span className="text-2xl font-bold text-emerald-700">{validCount}</span>
                        </div>
                        <div className={`p-4 rounded-xl border flex flex-col items-center justify-center ${invalidCount > 0 ? "border-rose-100 bg-rose-50" : "border-gray-100 bg-gray-50"}`}>
                            <span className={`text-sm font-medium ${invalidCount > 0 ? "text-rose-600" : "text-gray-400"}`}>ข้อมูลผิดพลาด</span>
                            <span className={`text-2xl font-bold ${invalidCount > 0 ? "text-rose-700" : "text-gray-400"}`}>{invalidCount}</span>
                        </div>
                    </div>

                    {/* Options */}
                    <div className="mb-6 p-4 rounded-xl border border-blue-100 bg-blue-50/50">
                        <h3 className="text-sm font-semibold mb-3">เลือกวิธีการนำเข้า</h3>
                        <div className="flex gap-4">
                            <label className={`flex-1 flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                importMode === "replace" 
                                ? "border-[#102C57] bg-white ring-1 ring-[#102C57]" 
                                : "border-gray-200 bg-white hover:border-gray-300"
                            }`}>
                                <input 
                                    type="radio" 
                                    name="importMode" 
                                    value="replace" 
                                    checked={importMode === "replace"} 
                                    onChange={(e) => setImportMode(e.target.value)}
                                    className="w-4 h-4 text-[#102C57]"
                                />
                                <div>
                                    <div className="font-semibold text-sm">แทนที่ทั้งหมด (Replace)</div>
                                    <div className="text-xs text-gray-500">ลบรายการเดิมทั้งหมดและใช้รายการใหม่</div>
                                </div>
                            </label>

                            <label className={`flex-1 flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                                importMode === "append" 
                                ? "border-[#102C57] bg-white ring-1 ring-[#102C57]" 
                                : "border-gray-200 bg-white hover:border-gray-300"
                            }`}>
                                <input 
                                    type="radio" 
                                    name="importMode" 
                                    value="append" 
                                    checked={importMode === "append"} 
                                    onChange={(e) => setImportMode(e.target.value)}
                                    className="w-4 h-4 text-[#102C57]"
                                />
                                <div>
                                    <div className="font-semibold text-sm">เพิ่มต่อท้าย (Append)</div>
                                    <div className="text-xs text-gray-500">เก็บรายการเดิมไว้และเพิ่มรายการใหม่ต่อท้าย</div>
                                </div>
                            </label>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                        <table className="w-full text-sm text-left border-collapse">
                            <thead className="bg-gray-50 text-gray-600 font-semibold border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-3 w-16 text-center">สถานะ</th>
                                    <th className="px-4 py-3">รหัสวัตถุดิบ</th>
                                    <th className="px-4 py-3">ชื่อรายการ</th>
                                    <th className="px-4 py-3 text-right">จำนวน</th>
                                    <th className="px-4 py-3 text-center">หน่วย</th>
                                    <th className="px-4 py-3">หมายเหตุ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {processedRows.map((row) => (
                                    <tr key={row.id} className={row.isValid ? "bg-white" : "bg-rose-50"}>
                                        <td className="px-4 py-3 text-center">
                                            {row.isValid ? (
                                                <Check size={16} className="mx-auto text-emerald-500" />
                                            ) : (
                                                <AlertTriangle size={16} className="mx-auto text-rose-500" />
                                            )}
                                        </td>
                                        <td className={`px-4 py-3 font-mono font-medium ${row.isValid ? "text-[#102C57]" : "text-rose-700"}`}>
                                            {row.code || <span className="text-gray-400 italic">ว่าง</span>}
                                        </td>
                                        <td className="px-4 py-3 text-gray-600">
                                            {row.name}
                                        </td>
                                        <td className="px-4 py-3 text-right font-mono">
                                            {row.qty.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 4 })}
                                        </td>
                                        <td className="px-4 py-3 text-center text-gray-500">
                                            {row.unit}
                                        </td>
                                        <td className="px-4 py-3 text-gray-500 truncate max-w-[200px]">
                                            {row.note}
                                        </td>
                                    </tr>
                                ))}
                                {processedRows.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="px-4 py-12 text-center text-gray-400">
                                            ไม่พบข้อมูลในไฟล์ Excel
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-gray-100 bg-gray-50 flex items-center justify-between shrink-0">
                    <div className="text-xs text-gray-500">
                        * รายการที่รหัสไม่ถูกต้องจะไม่ถูกนำเข้า
                    </div>
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onClose}
                            className="px-5 py-2.5 rounded-full border border-gray-200 bg-white text-sm font-semibold text-gray-600 hover:bg-gray-50 transition-colors"
                        >
                            ยกเลิก
                        </button>
                        <button
                            onClick={() => onConfirm(processedRows.filter(r => r.isValid), importMode)}
                            disabled={validCount === 0}
                            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full bg-[#102C57] text-sm font-semibold text-white shadow-lg shadow-blue-900/10 hover:bg-[#0a2345] hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            ยืนยันการนำเข้า
                            <ArrowRight size={16} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
