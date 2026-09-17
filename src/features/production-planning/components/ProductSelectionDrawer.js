"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Check,
  Layers3,
  Package,
  Search,
  Settings2,
  Users,
  Workflow,
  X,
} from "lucide-react";

const DEFAULT_FORMULA_CODE = "DEFAULT";
const DEFAULT_FORMULA_NAME = "Default BOM";

function normalizeFormulaOptions(product) {
  const rawOptions = Array.isArray(product?.formula_options) ? product.formula_options : [];
  if (!rawOptions.length) {
    return [{
      formula_code: DEFAULT_FORMULA_CODE,
      formula_name: DEFAULT_FORMULA_NAME,
      bom_version_id: null,
    }];
  }

  return rawOptions.map((option) => ({
    formula_code: String(option?.formula_code || DEFAULT_FORMULA_CODE).trim().toUpperCase(),
    formula_name: String(option?.formula_name || DEFAULT_FORMULA_NAME).trim(),
    bom_version_id: option?.bom_version_id || null,
  }));
}

function getFormulaDisplayName(formula) {
  const formulaCode = String(formula?.formula_code || DEFAULT_FORMULA_CODE).trim().toUpperCase();
  const formulaName = String(formula?.formula_name || "").trim();
  if (formulaCode === DEFAULT_FORMULA_CODE) {
    return DEFAULT_FORMULA_NAME;
  }
  return formulaName || formulaCode;
}

function normalizeTimeInputValue(value) {
  const normalized = String(value || "").trim();
  const match = normalized.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return normalized;
  }
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
    return normalized;
  }
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return normalized;
  }
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatThaiTimeLabel(value) {
  const normalized = normalizeTimeInputValue(value);
  if (!/^\d{2}:\d{2}$/.test(normalized)) {
    return "-";
  }
  return `${normalized} น.`;
}

function buildShiftMap(sectionShiftGroups = []) {
  const sectionMap = new Map();
  (Array.isArray(sectionShiftGroups) ? sectionShiftGroups : []).forEach((section) => {
    const sectionId = String(section?.id || "").trim();
    if (!sectionId) return;
    sectionMap.set(sectionId, {
      id: sectionId,
      name: String(section?.name || "").trim() || null,
      departmentId: String(section?.departmentId || "").trim() || null,
      departmentCode: String(section?.departmentCode || "").trim().toUpperCase() || null,
      departmentName: String(section?.departmentName || "").trim() || null,
      shifts: Array.isArray(section?.shifts) ? section.shifts : [],
    });
  });
  return sectionMap;
}

function getDefaultSection(sectionShiftGroups = []) {
  return (Array.isArray(sectionShiftGroups) ? sectionShiftGroups : []).find(
    (section) => Array.isArray(section?.shifts) && section.shifts.length > 0
  ) || null;
}

function getDefaultDraft(product, sectionShiftGroups = []) {
  const formula = normalizeFormulaOptions(product)[0];
  const defaultSection = getDefaultSection(sectionShiftGroups);
  const defaultShift = defaultSection?.shifts?.[0] || null;

  return {
    product,
    qty: 1,
    lineStaffCount: "",
    lineMachineNo: "",
    lineDoughSetCount: "",
    scheduleSectionDefId: defaultSection?.id || null,
    scheduleSectionName: defaultSection?.name || null,
    shiftId: defaultShift?.shiftId || null,
    shiftCode: defaultShift?.shiftCode || null,
    shiftName: defaultShift?.shiftName || null,
    workStartTime: defaultShift?.startTime || "08:00",
    workEndTime: defaultShift?.endTime || "16:00",
    itemNote: "",
    formulaCode: formula.formula_code,
    formulaName: getFormulaDisplayName(formula),
    bomVersionId: formula.bom_version_id,
  };
}

function resolveSectionShift(sectionMap, sectionDefId, shiftIdOrCode = "") {
  const section = sectionMap.get(String(sectionDefId || "").trim());
  if (!section) return { section: null, shift: null };
  const target = String(shiftIdOrCode || "").trim();
  const shift = section.shifts.find((candidate) => (
    String(candidate?.shiftId || "") === target
    || String(candidate?.shiftCode || "") === target
  )) || section.shifts[0] || null;
  return { section, shift };
}

function ModalContent({
  categories,
  products,
  categoryProductOptions,
  sectionShiftGroups,
  onClose,
  onConfirm,
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [bomStatusFilter, setBomStatusFilter] = useState("all");
  const [selectedType, setSelectedType] = useState(() => String(categories[0]?.id || ""));
  const [selectedItems, setSelectedItems] = useState(new Map());
  const [mobileStep, setMobileStep] = useState("catalog");
  const effectiveSelectedType = selectedType || String(categories[0]?.id || "");
  const sectionMap = useMemo(() => buildShiftMap(sectionShiftGroups), [sectionShiftGroups]);

  const availableProducts = useMemo(() => {
    if (!effectiveSelectedType) return products;
    const mapped = categoryProductOptions.get(String(effectiveSelectedType)) || [];
    if (!mapped.length) return [];
    const allowedSku = new Set(mapped.map((product) => String(product?.SKU_CODE || "").trim().toUpperCase()));
    return products.filter((product) => allowedSku.has(String(product?.SKU_CODE || "").trim().toUpperCase()));
  }, [categoryProductOptions, effectiveSelectedType, products]);

  const filteredProducts = useMemo(() => {
    const normalizedSearch = String(searchTerm || "").trim().toLowerCase();
    return availableProducts.filter((product) => {
      const matchesSearch = !normalizedSearch
        || String(product?.SKU_CODE || "").toLowerCase().includes(normalizedSearch)
        || String(product?.SKU_NAME || "").toLowerCase().includes(normalizedSearch);
      const hasBom = product?.hasBom !== false;
      const matchesBomStatus = bomStatusFilter === "all"
        || (bomStatusFilter === "has_bom" && hasBom)
        || (bomStatusFilter === "no_bom" && !hasBom);
      return matchesSearch && matchesBomStatus;
    });
  }, [availableProducts, bomStatusFilter, searchTerm]);

  function toggleProduct(product) {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      const sku = String(product?.SKU_CODE || "").trim().toUpperCase();
      if (!sku) return next;

      if (next.has(sku)) {
        next.delete(sku);
      } else {
        next.set(sku, getDefaultDraft(product, sectionShiftGroups));
        setMobileStep("details");
      }
      return next;
    });
  }

  function updateSelectedItem(sku, patch) {
    setSelectedItems((prev) => {
      const next = new Map(prev);
      const current = next.get(sku);
      if (!current) return prev;
      next.set(sku, { ...current, ...patch });
      return next;
    });
  }

  function handleSectionChange(sku, nextSectionId) {
    const { section, shift } = resolveSectionShift(sectionMap, nextSectionId);
    updateSelectedItem(sku, {
      scheduleSectionDefId: section?.id || null,
      scheduleSectionName: section?.name || null,
      shiftId: shift?.shiftId || null,
      shiftCode: shift?.shiftCode || null,
      shiftName: shift?.shiftName || null,
      workStartTime: shift?.startTime || "08:00",
      workEndTime: shift?.endTime || "16:00",
    });
  }

  function handleShiftChange(sku, sectionDefId, shiftValue, currentItem) {
    const { shift } = resolveSectionShift(sectionMap, sectionDefId, shiftValue);
    updateSelectedItem(sku, {
      shiftId: shift?.shiftId || null,
      shiftCode: shift?.shiftCode || null,
      shiftName: shift?.shiftName || null,
      workStartTime: shift?.startTime || currentItem.workStartTime,
      workEndTime: shift?.endTime || currentItem.workEndTime,
    });
  }

  function handleConfirm() {
    const payload = Array.from(selectedItems.values()).map((item) => ({
      categoryId: effectiveSelectedType,
      skuCode: String(item?.product?.SKU_CODE || "").trim().toUpperCase(),
      quantity: Number(item?.qty || 0) || 0,
      lineStaffCount: item?.lineStaffCount,
      lineMachineNo: item?.lineMachineNo,
      lineDoughSetCount: item?.lineDoughSetCount,
      scheduleSectionDefId: item?.scheduleSectionDefId,
      scheduleSectionName: item?.scheduleSectionName,
      shiftId: item?.shiftId,
      shiftCode: item?.shiftCode,
      shiftName: item?.shiftName,
      workStartTime: item?.workStartTime,
      workEndTime: item?.workEndTime,
      itemNote: item?.itemNote,
      formulaCode: item?.formulaCode,
      formulaName: item?.formulaName,
      bomVersionId: item?.bomVersionId,
    })).filter((item) => item.categoryId && item.skuCode && item.quantity > 0);

    if (!payload.length) return;
    onConfirm(payload);
    onClose();
  }

  const showCatalogPanel = mobileStep === "catalog";
  const showDetailsPanel = mobileStep === "details";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5">
      <div className="absolute inset-0 bg-slate-950/45 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex h-[100dvh] w-full max-w-7xl flex-col overflow-hidden rounded-none border border-[#102C57]/15 bg-white shadow-2xl sm:h-[min(92vh,860px)] sm:rounded-[28px]">
        <div className="flex items-center justify-between border-b border-[#102C57]/10 bg-[linear-gradient(90deg,#102C57_0%,#183866_60%,#f5f1e4_100%)] px-5 py-4 text-white">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#f2d68a]">Planning Modal</div>
            <h2 className="mt-1 flex items-center gap-2 text-lg font-bold">
              <Package size={18} className="text-[#f2d68a]" />
              วางแผนการผลิตประจำวัน
            </h2>
            <p className="mt-1 text-xs text-white/75">
              เลือก FG หรือ WIP ที่อนุญาต แล้วกำหนดจำนวน คน เครื่อง ชุดแป้ง section กะ และเวลาให้ครบก่อนเพิ่มลงแผน
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition hover:bg-white/15"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setMobileStep("catalog")}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
              showCatalogPanel
                ? "bg-[#102C57] text-white shadow-sm"
                : "border border-slate-200 bg-slate-50 text-slate-600"
            }`}
          >
            เลือกสินค้า
          </button>
          <button
            type="button"
            onClick={() => setMobileStep("details")}
            className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${
              showDetailsPanel
                ? "bg-[#102C57] text-white shadow-sm"
                : "border border-slate-200 bg-slate-50 text-slate-600"
            }`}
          >
            รายการที่เลือก ({selectedItems.size.toLocaleString()})
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[1.2fr_0.9fr]">
          <section className={`${showCatalogPanel ? "flex" : "hidden"} min-h-0 flex-col border-b border-slate-200 lg:flex lg:border-b-0 lg:border-r`}>
            <div className="grid gap-3 border-b border-slate-200 bg-slate-50 px-4 py-4 sm:grid-cols-[220px_minmax(0,1fr)_170px]">
              <select
                value={effectiveSelectedType}
                onChange={(event) => setSelectedType(event.target.value)}
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#102C57]"
              >
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="ค้นหา SKU หรือชื่อสินค้า FG/WIP"
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm text-slate-700 outline-none focus:border-[#102C57]"
                />
              </div>
              <select
                value={bomStatusFilter}
                onChange={(event) => setBomStatusFilter(event.target.value)}
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#102C57]"
              >
                <option value="all">ทุกสถานะ BOM</option>
                <option value="has_bom">มีสูตร BOM แล้ว</option>
                <option value="no_bom">ยังไม่มี BOM</option>
              </select>
            </div>

            <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white px-4 py-2 text-[11px]">
              <div className="text-slate-500">เลือก FG หรือ WIP ได้หลายรายการในวันเดียว แล้วกำหนด section และกะให้แต่ละรายการแยกกัน</div>
              <div className="rounded-full border border-[#102C57]/15 bg-[#102C57]/5 px-2.5 py-1 font-semibold text-[#102C57]">
                เลือกแล้ว {selectedItems.size.toLocaleString()} รายการ
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              <div className="grid gap-2 xl:grid-cols-2">
                {filteredProducts.map((product) => {
                  const sku = String(product?.SKU_CODE || "").trim().toUpperCase();
                  const isSelected = selectedItems.has(sku);
                  const hasBom = product?.hasBom !== false;
                  const productKind = product?.planningProductType === "WIP" || String(product?.ICCAT_CODE || "").trim() === "03"
                    ? "WIP"
                    : "FG";
                  return (
                    <button
                      key={sku}
                      type="button"
                      onClick={() => toggleProduct(product)}
                      className={`rounded-2xl border p-4 text-left transition ${
                        isSelected
                          ? "border-[#102C57] bg-[#102C57]/5 shadow-sm"
                          : "border-slate-200 bg-white hover:border-[#102C57]/30 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-mono text-[11px] font-semibold text-[#102C57]">{sku}</div>
                          <div className="mt-1 text-sm font-semibold text-slate-800">{product?.SKU_NAME}</div>
                        </div>
                        <div className={`inline-flex h-6 w-6 items-center justify-center rounded-full border text-xs ${
                          isSelected
                            ? "border-[#102C57] bg-[#102C57] text-white"
                            : "border-slate-300 bg-white text-slate-400"
                        }`}>
                          {isSelected ? <Check size={13} /> : null}
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          productKind === "WIP"
                            ? "border-[#d4af37]/50 bg-[#fff8e2] text-[#102C57]"
                            : "border-[#102C57]/20 bg-[#102C57]/5 text-[#102C57]"
                        }`}>
                          {productKind}
                        </span>
                        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
                          hasBom
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-amber-200 bg-amber-50 text-amber-700"
                        }`}>
                          {hasBom ? "มีสูตร BOM แล้ว" : "ยังไม่มี BOM"}
                        </span>
                        <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
                          {product?.UTQ_NAME_1 || product?.UTQ_NAME || "-"}
                        </span>
                      </div>
                    </button>
                  );
                })}
                {filteredProducts.length === 0 ? (
                  <div className="col-span-full rounded-2xl border border-dashed border-slate-300 px-4 py-10 text-center text-sm text-slate-500">
                    ไม่พบ FG/WIP ตามเงื่อนไขที่เลือก
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section className={`${showDetailsPanel ? "flex" : "hidden"} min-h-0 flex-col bg-[linear-gradient(180deg,#fbfcfe_0%,#f5f7fb_100%)] lg:flex`}>
            <div className="border-b border-slate-200 px-4 py-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#102C57]">Selected Items</div>
                  <div className="mt-1 text-sm font-semibold text-slate-700">{selectedItems.size.toLocaleString()} รายการ</div>
                </div>
                <div className="rounded-full border border-[#102C57]/15 bg-white px-3 py-1 text-[11px] font-semibold text-[#102C57]">
                  ต้องเลือก section และกะให้ครบ
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMobileStep("catalog")}
                className="mt-3 inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:border-[#102C57]/30 hover:text-[#102C57] lg:hidden"
              >
                กลับไปเลือกสินค้า
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {selectedItems.size === 0 ? (
                <div className="flex h-full flex-col items-center justify-center text-center text-slate-400">
                  <Settings2 size={28} />
                  <div className="mt-3 text-sm font-semibold">เลือก FG/WIP จากฝั่งซ้ายก่อน</div>
                  <div className="mt-1 text-xs">แล้วกำหนดจำนวน คน เครื่อง ชุดแป้ง section กะ และเวลา</div>
                </div>
              ) : (
                <div className="space-y-3">
                  {Array.from(selectedItems.values()).map((item) => {
                    const sku = String(item?.product?.SKU_CODE || "").trim().toUpperCase();
                    const formulaOptions = normalizeFormulaOptions(item?.product);
                    const selectedSection = sectionMap.get(String(item.scheduleSectionDefId || "").trim()) || null;
                    const shiftOptions = Array.isArray(selectedSection?.shifts) ? selectedSection.shifts : [];
                    const productKind = item?.product?.planningProductType === "WIP" || String(item?.product?.ICCAT_CODE || "").trim() === "03"
                      ? "WIP"
                      : "FG";
                    return (
                      <article key={sku} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-mono text-[11px] font-semibold text-[#102C57]">{sku}</div>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm font-semibold text-slate-800">
                              <span>{item?.product?.SKU_NAME}</span>
                              <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${
                                productKind === "WIP"
                                  ? "border-[#d4af37]/50 bg-[#fff8e2] text-[#102C57]"
                                  : "border-[#102C57]/20 bg-[#102C57]/5 text-[#102C57]"
                              }`}>
                                {productKind}
                              </span>
                            </div>
                          </div>
                          {item?.product?.hasBom === false ? (
                            <div className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-700">
                              <AlertTriangle size={12} />
                              ยังไม่มี BOM
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                              มี BOM แล้ว
                            </div>
                          )}
                        </div>

                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-[11px] font-semibold text-slate-500">จำนวนงาน</label>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.qty}
                              onChange={(event) => updateSelectedItem(sku, { qty: event.target.value })}
                              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-right text-sm font-semibold text-[#102C57] outline-none focus:border-[#102C57]"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] font-semibold text-slate-500">สูตร BOM</label>
                            <select
                              value={item.formulaCode}
                              onChange={(event) => {
                                const nextFormula = formulaOptions.find((formula) => formula.formula_code === event.target.value);
                                updateSelectedItem(sku, {
                                  formulaCode: nextFormula?.formula_code || DEFAULT_FORMULA_CODE,
                                  formulaName: getFormulaDisplayName(nextFormula),
                                  bomVersionId: nextFormula?.bom_version_id || null,
                                });
                              }}
                              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#102C57]"
                            >
                              {formulaOptions.map((formula) => (
                                <option key={`${sku}-${formula.formula_code}`} value={formula.formula_code}>
                                  {getFormulaDisplayName(formula)} ({formula.formula_code})
                                </option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] font-semibold text-slate-500">Section</label>
                            <select
                              value={item.scheduleSectionDefId || ""}
                              onChange={(event) => handleSectionChange(sku, event.target.value)}
                              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#102C57]"
                            >
                              <option value="">เลือก section</option>
                              {(sectionShiftGroups || []).map((section) => (
                                <option key={section.id} value={section.id}>
                                  [{section.departmentCode}] {section.name}
                                </option>
                              ))}
                            </select>
                            <div className="mt-1 text-[10px] text-slate-500">
                              {selectedSection
                                ? `${selectedSection.departmentName || "-"}`
                                : "ต้องเลือก section ก่อนเลือกกะ"}
                            </div>
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] font-semibold text-slate-500">กะของ section</label>
                            <select
                              value={item.shiftId || item.shiftCode || ""}
                              onChange={(event) => handleShiftChange(sku, item.scheduleSectionDefId, event.target.value, item)}
                              disabled={!item.scheduleSectionDefId}
                              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#102C57] disabled:bg-slate-100"
                            >
                              <option value="">เลือกกะ</option>
                              {shiftOptions.map((shift) => (
                                <option key={shift.id || shift.shiftId || shift.shiftCode} value={shift.shiftId || shift.shiftCode}>
                                  {shift.label || shift.shiftLabel || shift.shiftName}
                                </option>
                              ))}
                            </select>
                            <div className="mt-1 text-[10px] text-slate-500">
                              {item.shiftName ? `กะที่เลือก: ${item.shiftName}` : "ยังไม่ได้เลือกกะ"}
                            </div>
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                              <Users size={12} className="mr-1 inline" />
                              จำนวนคน
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={item.lineStaffCount}
                              onChange={(event) => updateSelectedItem(sku, { lineStaffCount: event.target.value })}
                              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-center text-sm text-slate-700 outline-none focus:border-[#102C57]"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                              <Workflow size={12} className="mr-1 inline" />
                              จำนวนเครื่อง
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={item.lineMachineNo}
                              onChange={(event) => updateSelectedItem(sku, { lineMachineNo: event.target.value })}
                              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-center text-sm text-slate-700 outline-none focus:border-[#102C57]"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                              <Layers3 size={12} className="mr-1 inline" />
                              จำนวนชุดแป้ง
                            </label>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={item.lineDoughSetCount}
                              onChange={(event) => updateSelectedItem(sku, { lineDoughSetCount: event.target.value })}
                              className="h-10 w-full rounded-lg border border-slate-200 px-3 text-center text-sm text-slate-700 outline-none focus:border-[#102C57]"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] font-semibold text-slate-500">เวลาเริ่มงาน</label>
                            <input
                              type="text"
                              value={item.workStartTime}
                              onChange={(event) => updateSelectedItem(sku, { workStartTime: event.target.value })}
                              onBlur={(event) => updateSelectedItem(sku, { workStartTime: normalizeTimeInputValue(event.target.value) })}
                              inputMode="numeric"
                              placeholder="08:00"
                              maxLength={5}
                              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#102C57]"
                            />
                            <div className="mt-1 text-[10px] text-slate-500">
                              ใช้เวลา 24 ชั่วโมง เช่น 08:00 | ตอนนี้: {formatThaiTimeLabel(item.workStartTime)}
                            </div>
                          </div>
                          <div>
                            <label className="mb-1 block text-[11px] font-semibold text-slate-500">เวลาสิ้นสุดงาน</label>
                            <input
                              type="text"
                              value={item.workEndTime}
                              onChange={(event) => updateSelectedItem(sku, { workEndTime: event.target.value })}
                              onBlur={(event) => updateSelectedItem(sku, { workEndTime: normalizeTimeInputValue(event.target.value) })}
                              inputMode="numeric"
                              placeholder="16:00"
                              maxLength={5}
                              className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 outline-none focus:border-[#102C57]"
                            />
                            <div className="mt-1 text-[10px] text-slate-500">
                              ใช้เวลา 24 ชั่วโมง เช่น 16:00 | ตอนนี้: {formatThaiTimeLabel(item.workEndTime)}
                            </div>
                          </div>
                        </div>

                        <div className="mt-3">
                          <label className="mb-1 block text-[11px] font-semibold text-slate-500">หมายเหตุ</label>
                          <textarea
                            rows={2}
                            value={item.itemNote}
                            onChange={(event) => updateSelectedItem(sku, { itemNote: event.target.value })}
                            className="min-h-[72px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#102C57]"
                            placeholder="เช่น งานด่วน / ใช้คนเพิ่ม / รันเครื่องแยก"
                          />
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 bg-white px-4 py-4">
              <button
                type="button"
                onClick={handleConfirm}
                disabled={selectedItems.size === 0}
                className="h-12 w-full rounded-xl bg-[#102C57] text-sm font-bold text-white transition hover:bg-[#0d2549] disabled:cursor-not-allowed disabled:opacity-50"
              >
                เพิ่มลงแผน ({selectedItems.size.toLocaleString()})
              </button>
            </div>
          </section>
        </div>

        <div className="border-t border-slate-200 bg-white px-4 py-3 lg:hidden">
          {showCatalogPanel ? (
            <button
              type="button"
              onClick={() => setMobileStep("details")}
              className="h-11 w-full rounded-xl border border-[#102C57]/20 bg-[#102C57]/5 text-sm font-bold text-[#102C57] transition hover:bg-[#102C57]/10"
            >
              ไปยังรายการที่เลือก ({selectedItems.size.toLocaleString()})
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function ProductSelectionDrawer({
  isOpen,
  onClose,
  categories = [],
  products = [],
  categoryProductOptions = new Map(),
  sectionShiftGroups = [],
  onConfirm,
}) {
  const [openInstance, setOpenInstance] = useState(0);

  useEffect(() => {
    if (isOpen) {
      setOpenInstance((prev) => prev + 1);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <ModalContent
      key={openInstance}
      categories={categories}
      products={products}
      categoryProductOptions={categoryProductOptions}
      sectionShiftGroups={sectionShiftGroups}
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
