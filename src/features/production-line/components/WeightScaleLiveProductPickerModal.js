"use client";

import { Check, Loader2, Search, X } from "lucide-react";

export default function WeightScaleLiveProductPickerModal({
  canOperate,
  filteredProducts,
  isSaving,
  onClose,
  onProductProfileChange,
  onSave,
  onSearchChange,
  onSelectProduct,
  productError,
  productProfile,
  products,
  productsError,
  searchTerm,
  selectedProduct,
  selectedProductCode,
}) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/45 px-3 py-4 sm:px-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-product-selection-title"
        className="flex max-h-[90dvh] w-full max-w-[1280px] flex-col overflow-hidden border border-[#d7dde5] bg-white shadow-2xl"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-[#d7dde5] bg-[#0a1422] px-5 py-4 text-white sm:px-6">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.24em] text-[#d4af37]">
              เลือกสินค้า
            </p>
            <h2
              id="live-product-selection-title"
              className="mt-2 text-xl font-light uppercase tracking-[0.04em] sm:text-2xl"
            >
              เลือกผลิตภัณฑ์
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center border border-white/20 text-white transition hover:border-[#d4af37] hover:text-[#d4af37]"
            aria-label="ปิดตัวเลือกสินค้า"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:overflow-hidden">
          <div className="flex min-h-0 flex-col gap-4">
            <div className="relative shrink-0">
              <Search
                size={17}
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#7d8795]"
              />
              <input
                value={searchTerm}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder="ค้นหาชื่อสินค้า หรือรหัสสินค้า"
                className="h-12 w-full border border-[#d7dde5] bg-[#fbfcfd] pl-11 pr-4 text-sm text-[#102C57] outline-none transition focus:border-[#d4af37] focus:bg-white"
              />
            </div>

            <div className="min-h-0 overflow-auto border border-[#d7dde5]">
              {!filteredProducts.length ? (
                <div className="px-6 py-12 text-center text-sm text-[#7d8795]">
                  {products.length ? "ไม่พบสินค้าที่ตรงกับคำค้นหา" : "ไม่พบรายการสินค้า"}
                </div>
              ) : (
                <table className="w-full min-w-[720px] border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-[#102C57] text-white">
                    <tr className="text-left text-[11px] font-black uppercase tracking-[0.16em]">
                      <th className="w-[8%] border-r border-white/10 px-4 py-3 text-center text-[#f3d67a]">
                        ลำดับ
                      </th>
                      <th className="w-[18%] border-r border-white/10 px-4 py-3 text-[#f3d67a]">
                        รหัส
                      </th>
                      <th className="border-r border-white/10 px-4 py-3 text-[#f3d67a]">
                        ชื่อสินค้า
                      </th>
                      <th className="w-[13%] border-r border-white/10 px-4 py-3 text-center text-[#f3d67a]">
                        หน่วย
                      </th>
                      <th className="w-[14%] px-4 py-3 text-center text-[#f3d67a]">
                        จัดการ
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#e2e8f0]">
                    {filteredProducts.map((product, productIndex) => {
                      const isSelected = product.code === selectedProductCode;

                      return (
                        <tr
                          key={product.code}
                          className={isSelected ? "bg-[#fff8e2]" : "bg-white hover:bg-[#f8fafc]"}
                        >
                          <td className="border-r border-[#edf1f5] px-4 py-3 text-center text-xs font-black text-[#5f6b7b]">
                            {productIndex + 1}
                          </td>
                          <td className="border-r border-[#edf1f5] px-4 py-3 font-mono text-xs font-bold text-[#102C57]">
                            {product.code}
                          </td>
                          <td className="border-r border-[#edf1f5] px-4 py-3">
                            <p className="font-semibold leading-5 text-[#102C57]">
                              {product.name}
                            </p>
                            <p className="mt-1 text-[11px] font-bold text-[#7d8795]">
                              [{product.departmentCode || "ไม่ระบุแผนก"}] {product.departmentName}
                            </p>
                          </td>
                          <td className="border-r border-[#edf1f5] px-4 py-3 text-center text-xs font-bold uppercase tracking-[0.1em] text-[#5f6b7b]">
                            {product.unit || "-"}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => onSelectProduct(product.code)}
                              className={`inline-flex h-9 min-w-20 items-center justify-center border px-3 text-[11px] font-black uppercase tracking-[0.14em] transition ${
                                isSelected
                                  ? "border-[#d4af37] bg-[#fff8e2] text-[#102C57]"
                                  : "border-[#d7dde5] bg-white text-[#102C57] hover:border-[#d4af37]"
                              }`}
                            >
                              {isSelected ? "เลือกแล้ว" : "เลือก"}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {productsError ? (
              <p className="shrink-0 border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700">
                {productsError}
              </p>
            ) : null}
          </div>

          <aside className="border border-[#d7dde5] bg-[#fbfcfd]">
            <div className="border-b border-[#d7dde5] bg-[#102C57] px-5 py-4 text-white">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#d4af37]">
                ตั้งค่าก่อนเริ่มชั่ง
              </p>
              <h3 className="mt-2 text-lg font-bold text-white">
                {selectedProduct ? selectedProduct.name : "เลือกสินค้าจากตาราง"}
              </h3>
              <p className="mt-1 text-xs font-semibold text-white/65">
                {selectedProduct
                  ? `รหัส ${selectedProduct.code}${selectedProduct.unit ? ` / หน่วย ${selectedProduct.unit}` : ""}`
                  : "เลือกสินค้า แล้วตรวจ LOT และน้ำหนักภาชนะก่อนใช้งาน"}
              </p>
            </div>

            <div className="space-y-4 p-5">
              {productError ? (
                <div className="border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-700">
                  {productError}
                </div>
              ) : null}

              <label className="block">
                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-[#102C57]">
                  LOT ปัจจุบัน
                </span>
                <input
                  value={productProfile.lotNo}
                  onChange={(event) => onProductProfileChange("lotNo", event.target.value)}
                  disabled={!selectedProduct}
                  placeholder="ระบุ LOT ที่ต้องการใช้"
                  className="mt-2 h-11 w-full border border-[#d7dde5] bg-white px-3 text-base font-black text-[#102C57] outline-none transition focus:border-[#d4af37] disabled:bg-[#edf1f5] disabled:text-[#8b95a3]"
                />
                <p className="mt-2 text-xs leading-5 text-[#5f6b7b]">
                  ใช้ LOT ปัจจุบัน แก้เป็น LOT เดิม หรือระบุ LOT ใหม่ได้
                </p>
              </label>

              <label className="block">
                <span className="text-[11px] font-black uppercase tracking-[0.18em] text-[#102C57]">
                  น้ำหนักภาชนะ
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.001"
                  min="0"
                  value={productProfile.tareWeightKg}
                  onChange={(event) =>
                    onProductProfileChange("tareWeightKg", event.target.value)
                  }
                  disabled={!selectedProduct}
                  placeholder="เช่น 10.000"
                  className="mt-2 h-11 w-full border border-[#d7dde5] bg-white px-3 text-base font-black text-[#102C57] outline-none transition focus:border-[#d4af37] disabled:bg-[#edf1f5] disabled:text-[#8b95a3]"
                />
              </label>

              <div className="border border-[#e2e8f0] bg-white px-4 py-3">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-black uppercase tracking-[0.16em] text-[#5f6b7b]">
                    สถานะ
                  </span>
                  <span className="font-black text-[#102C57]">
                    {selectedProduct ? "พร้อมใช้งาน" : "รอเลือกสินค้า"}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={onSave}
                disabled={!selectedProduct || !canOperate || isSaving}
                className="flex h-12 w-full items-center justify-center gap-2 border-2 border-[#d4af37] bg-[#d4af37] px-4 text-sm font-black uppercase tracking-[0.18em] text-[#102C57] transition hover:bg-[#e6c15c] disabled:border-[#d7dde5] disabled:bg-[#edf1f5] disabled:text-[#8b95a3]"
              >
                {isSaving ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <Check size={18} />
                )}
                ใช้สินค้านี้
              </button>
            </div>
          </aside>
        </div>
      </section>
    </div>
  );
}
