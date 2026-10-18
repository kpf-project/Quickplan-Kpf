"use client";

import { Check, Loader2 } from "lucide-react";
import ProductPicker from "@/components/ProductPicker";

export default function WeightScaleLiveProductPickerModal({ canOperate, isSaving, onClose, onProductProfileChange, onSave, onSearchChange, onSelectProduct, productError, productProfile, products, productsError, searchTerm, selectedProduct, stationId, stationName }) {
  return <ProductPicker products={products} selectedProduct={selectedProduct} onSelectProduct={onSelectProduct} searchTerm={searchTerm} onSearchChange={onSearchChange} onClose={onClose} stationId={stationId} stationName={stationName} error={productsError}>
    <h3>ตั้งค่าก่อนเริ่มชั่ง</h3>
    <strong>{selectedProduct?.name || "เลือกสินค้าจากตาราง"}</strong>
    <p className="text-sm text-slate-500">{selectedProduct?.code || "เลือกสินค้า แล้วตรวจ LOT และน้ำหนักภาชนะก่อนใช้งาน"}</p>
    {productError ? <p role="alert" className="text-sm text-rose-700">{productError}</p> : null}
    <p className="text-sm text-slate-500">LOT และบาร์โค้ดออกอัตโนมัติเมื่อรับเข้าสำเร็จ ตามวันผลิตและกะจากระบบกลาง ไม่ต้องกรอกเอง</p>
    <label className="flex flex-col gap-1 text-sm font-bold">น้ำหนักภาชนะ (kg)
      <input type="number" inputMode="decimal" step="0.001" min="0" value={productProfile.tareWeightKg} onChange={event => onProductProfileChange("tareWeightKg", event.target.value)} disabled={!selectedProduct || isSaving} placeholder="เช่น 10.000" />
    </label>
    <button type="button" onClick={onSave} disabled={!selectedProduct || !canOperate || isSaving} className="!bg-[var(--surface-navy,#10345d)] !text-white">
      {isSaving ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />}ใช้สินค้านี้
    </button>
  </ProductPicker>;
}
