"use client";

import { useMemo } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  X,
} from "lucide-react";

function formatCalculation(item) {
  const basis = item.calculation_basis || "JOB_QTY";
  if (basis === "HEADCOUNT") {
    return `${basis} / ${item.headcount_base || 1} / ${item.headcount_round_mode || "NONE"}`;
  }
  if (basis === "MACHINE_COUNT") {
    return `${basis} / ${item.machine_base || 1} / ${item.machine_round_mode || "NONE"}`;
  }
  if (basis === "DOUGH_SET_COUNT") {
    return `${basis} / ${item.dough_set_base || 1} / ${item.dough_set_round_mode || "NONE"}`;
  }
  return "JOB_QTY";
}

export default function MultiProductImportPreviewModal({
  isOpen,
  onClose,
  preview,
  mode,
  strategy,
  showDiff = true,
  onModeChange,
  onStrategyChange,
  onConfirm,
  isSubmitting,
}) {
  const {
    products = [],
    invalidRows = [],
    fileName = "",
    hasErrors = false,
  } = preview || {};

  const summary = useMemo(() => ({
    productCount: products.length,
    itemCount: products.reduce(
      (total, product) => total + (product.items?.length || 0),
      0
    ),
    invalidRowCount: invalidRows.length,
    invalidProductCount: products.filter(
      (product) => product.errors?.length
    ).length,
  }), [invalidRows.length, products]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 text-[#102C57] sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-black/45 backdrop-blur-sm"
        onClick={onClose}
        aria-label="ปิดหน้าต่างพรีวิว"
      />

      <div className="relative flex max-h-[92vh] w-full max-w-7xl flex-col overflow-hidden rounded-[2px] bg-white shadow-2xl">
        <header className="flex items-center justify-between gap-3 bg-[#102C57] px-5 py-3 text-white">
          <div className="flex items-center gap-3">
            <div className="border border-white/15 bg-white/10 p-2">
              <FileSpreadsheet className="h-5 w-5 text-[#d4af37]" />
            </div>
            <div>
              <p className="text-sm font-bold">พรีวิวไฟล์นำเข้า BOM</p>
              <p className="text-xs text-white/70">{fileName || "ไฟล์ Excel"}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="ปิด"
          >
            <X size={18} />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-5 lg:grid-cols-[250px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <section className="border border-gray-200 bg-gray-50 p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-600">
                สรุป
              </p>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt>สินค้าตัวแม่</dt>
                  <dd className="font-bold">{summary.productCount}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>รายการวัตถุดิบ</dt>
                  <dd className="font-bold text-emerald-700">{summary.itemCount}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>แถวที่มีปัญหา</dt>
                  <dd className="font-bold text-rose-700">{summary.invalidRowCount}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt>สินค้าที่ไม่ผ่าน</dt>
                  <dd className="font-bold text-amber-700">{summary.invalidProductCount}</dd>
                </div>
              </dl>
            </section>

            <OptionGroup
              title="โหมดนำเข้า"
              name="mode"
              value={mode}
              onChange={onModeChange}
              options={[
                { id: "replace", label: "Replace", detail: "แทนรายการเดิมทั้งหมด" },
                { id: "append", label: "Append", detail: "รวมกับรายการเดิม" },
              ]}
            />
            <OptionGroup
              title="เมื่อพบรายการซ้ำ"
              name="strategy"
              value={strategy}
              onChange={onStrategyChange}
              options={[
                { id: "overwrite", label: "Overwrite", detail: "ใช้ข้อมูลจากไฟล์" },
                { id: "skip", label: "Skip", detail: "คงข้อมูลเดิม" },
                { id: "sum", label: "Sum", detail: "รวมจำนวนเข้าด้วยกัน" },
              ]}
            />
          </aside>

          <main className="space-y-4">
            {products.map((product) => (
              <section
                key={product.sku}
                className="overflow-hidden border border-gray-200 bg-white"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-[#102C57]">{product.sku}</p>
                      <span className="border border-[#d4af37]/60 bg-[#fff7db] px-1.5 py-0.5 text-[10px] font-bold">
                        {product.parentType}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600">{product.name || "-"}</p>
                  </div>
                  <div className="text-right text-xs text-gray-600">
                    <p>
                      โหมด {String(product.wipQtyInputMode || "unit").toUpperCase()}
                    </p>
                    <p>
                      ฐาน {product.baseBatch} batch / {product.baseOutputBoxes}
                    </p>
                  </div>
                </div>

                {product.errors?.length > 0 && (
                  <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                    {product.errors.map((error) => (
                      <p key={error}>• {error}</p>
                    ))}
                  </div>
                )}

                {showDiff && product.diff && (
                  <div className="flex flex-wrap gap-2 border-b border-gray-100 px-4 py-2 text-[11px]">
                    <DiffBadge label="เพิ่ม" count={product.diff.added?.length || 0} />
                    <DiffBadge label="แก้ไข" count={product.diff.updated?.length || 0} />
                    <DiffBadge label="ลบ" count={product.diff.removed?.length || 0} />
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="min-w-[1100px] w-full text-xs">
                    <thead className="bg-[#102C57] text-white">
                      <tr>
                        <th className="px-3 py-2 text-left">แถว</th>
                        <th className="px-3 py-2 text-left text-[#d4af37]">รหัสที่ใช้จริง</th>
                        <th className="px-3 py-2 text-left">SKU</th>
                        <th className="px-3 py-2 text-left">ชื่อ</th>
                        <th className="px-3 py-2 text-right">จำนวน</th>
                        <th className="px-3 py-2 text-left">หน่วย</th>
                        <th className="px-3 py-2 text-left">ฐานคำนวณ / ฐาน / ปัด</th>
                        <th className="px-3 py-2 text-center">วันเหลื่อม</th>
                        <th className="px-3 py-2 text-left">หมายเหตุ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {(product.items || []).map((item, index) => (
                        <tr key={`${item.material_sku_code}-${item.material_goods_code}-${index}`}>
                          <td className="px-3 py-2 text-gray-500">
                            {item.rowNumber || "-"}
                          </td>
                          <td className="px-3 py-2 font-bold text-[#102C57]">
                            {item.material_goods_code}
                          </td>
                          <td className="px-3 py-2">{item.material_sku_code}</td>
                          <td className="px-3 py-2">{item.material_name || "-"}</td>
                          <td className="px-3 py-2 text-right font-bold">{item.qty}</td>
                          <td className="px-3 py-2">{item.uom_name || "-"}</td>
                          <td className="px-3 py-2">{formatCalculation(item)}</td>
                          <td className="px-3 py-2 text-center">
                            {item.planning_offset_days || 0}
                          </td>
                          <td className="px-3 py-2 text-gray-600">{item.notes || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}

            {invalidRows.length > 0 && (
              <section className="border border-rose-200 bg-rose-50">
                <div className="flex items-center gap-2 border-b border-rose-200 px-4 py-3 text-rose-800">
                  <AlertTriangle size={16} />
                  <p className="text-sm font-bold">
                    แถวที่ไม่ถูกต้อง ({invalidRows.length})
                  </p>
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-rose-100">
                  {invalidRows.map((row, index) => (
                    <div
                      key={`${row.rowNumber || "row"}-${index}`}
                      className="px-4 py-2 text-xs text-rose-800"
                    >
                      {row.message || row.reason}
                    </div>
                  ))}
                </div>
              </section>
            )}
          </main>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 bg-gray-50 px-5 py-3">
          <div className="flex items-center gap-2 text-xs text-gray-600">
            {hasErrors ? (
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            )}
            <span>
              {hasErrors
                ? "พบข้อมูลที่ต้องแก้ไขก่อนนำเข้า"
                : `พร้อมนำเข้า ${summary.itemCount} รายการ`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="border border-gray-300 bg-white px-4 py-2 text-sm font-bold text-gray-700 hover:bg-gray-100"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={hasErrors || summary.itemCount === 0 || isSubmitting}
              className="inline-flex items-center gap-2 bg-[#d4af37] px-5 py-2 text-sm font-bold text-[#102C57] hover:bg-[#b5952f] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
              ยืนยันนำเข้า
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function OptionGroup({ title, name, value, onChange, options }) {
  return (
    <section className="border border-gray-200 bg-white p-4">
      <p className="mb-3 text-xs font-bold uppercase tracking-wider text-gray-600">
        {title}
      </p>
      <div className="space-y-2">
        {options.map((option) => (
          <label
            key={option.id}
            className={`flex cursor-pointer items-start gap-2 border p-3 ${
              value === option.id
                ? "border-[#d4af37] bg-[#fff7db]"
                : "border-gray-200"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={option.id}
              checked={value === option.id}
              onChange={(event) => onChange?.(event.target.value)}
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-bold">{option.label}</span>
              <span className="block text-xs text-gray-500">{option.detail}</span>
            </span>
          </label>
        ))}
      </div>
    </section>
  );
}

function DiffBadge({ label, count }) {
  return (
    <span className="border border-gray-200 bg-white px-2 py-1 text-gray-700">
      {label} {count}
    </span>
  );
}
