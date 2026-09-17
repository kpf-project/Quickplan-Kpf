"use client";

import { useState } from "react";
import {
  X,
  AlertTriangle,
  CheckCircle,
  Layers,
  List,
  ChevronRight,
  ChevronDown,
  ChevronsDown,
  ChevronsUp,
  Warehouse,
  Send,
  Calendar,
  Info,
} from "lucide-react";

function formatNumber(num) {
  if (!Number.isFinite(num)) return "-";
  return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function getFlattenedMaterials(materials, productSku) {
  if (!Array.isArray(materials)) return [];

  // BOM explosion can return the same material through more than one trace row.
  // Aggregate identical trace identities before building the tree; otherwise a
  // materialCode-only map overwrites the quantity but still renders the same node
  // more than once, making the breakdown disagree with the consolidated total.
  const aggregatedMap = new Map();
  materials.forEach((mat) => {
    const aggregationKey = [
      mat.parentMaterialCode || productSku || "",
      mat.materialCode || "",
      mat.materialGoodsCode || "",
      mat.stockSkuCode || "",
      mat.itemType || "",
      mat.unit || "",
      mat.baseUnit || "",
    ].join("::");
    const existing = aggregatedMap.get(aggregationKey);
    if (!existing) {
      aggregatedMap.set(aggregationKey, { ...mat });
      return;
    }
    existing.requiredQty = Number(existing.requiredQty || 0) + Number(mat.requiredQty || 0);
    existing.requiredBaseQty = Number(existing.requiredBaseQty || 0) + Number(mat.requiredBaseQty || 0);
    if (existing.originalRequiredQty !== undefined || mat.originalRequiredQty !== undefined) {
      existing.originalRequiredQty = Number(existing.originalRequiredQty || 0) + Number(mat.originalRequiredQty || 0);
    }
    if (existing.originalRequiredBaseQty !== undefined || mat.originalRequiredBaseQty !== undefined) {
      existing.originalRequiredBaseQty = Number(existing.originalRequiredBaseQty || 0) + Number(mat.originalRequiredBaseQty || 0);
    }
  });

  const aggregatedMaterials = Array.from(aggregatedMap.values());
  const nodes = aggregatedMaterials.map((mat, index) => ({
    ...mat,
    nodeKey: `${mat.parentMaterialCode || productSku || "root"}::${mat.materialCode}::${mat.materialGoodsCode || ""}::${index}`,
    children: [],
  }));
  const firstNodeByMaterialCode = new Map();
  nodes.forEach((node) => {
    if (!firstNodeByMaterialCode.has(node.materialCode)) {
      firstNodeByMaterialCode.set(node.materialCode, node);
    }
  });

  const roots = [];
  nodes.forEach((node) => {
    const parentCode = node.parentMaterialCode;
    const parentNode = firstNodeByMaterialCode.get(parentCode);
    if (parentCode && parentCode !== productSku && parentNode && parentNode !== node) {
      parentNode.children.push(node);
    } else {
      roots.push(node);
    }
  });

  const sortNodes = (nodes) => {
    nodes.sort((a, b) =>
      String(a.materialCode || "").localeCompare(String(b.materialCode || ""))
      || String(a.materialGoodsCode || "").localeCompare(String(b.materialGoodsCode || ""))
    );
    nodes.forEach((node) => {
      if (node.children.length > 0) {
        sortNodes(node.children);
      }
    });
  };
  sortNodes(roots);

  const flat = [];
  const traverse = (nodes, depth = 0) => {
    nodes.forEach((node) => {
      flat.push({ ...node, depth });
      if (node.children && node.children.length > 0) {
        traverse(node.children, depth + 1);
      }
    });
  };
  traverse(roots, 0);

  return flat;
}

export default function MaterialVerifyModal({
  isOpen,
  onClose,
  masterPlanNo,
  consolidated = [],
  breakdown = [],
  onSubmit,
  isSubmitting = false,
}) {
  const [activeTab, setActiveTab] = useState("consolidated"); // "consolidated" or "breakdown"
  const [confirmed, setConfirmed] = useState(false);
  const [expandedDepts, setExpandedDepts] = useState({});
  const [expandedSections, setExpandedSections] = useState({});
  const [expandedDates, setExpandedDates] = useState({});
  const [expandedMaterials, setExpandedMaterials] = useState({});

  if (!isOpen) return null;

  const shortagesCount = consolidated.filter((item) => item.shortageQty > 0).length;
  const sufficientCount = consolidated.length - shortagesCount;

  const toggleMaterial = (materialCode) => {
    setExpandedMaterials((prev) => ({
      ...prev,
      [materialCode]: !prev[materialCode],
    }));
  };

  const expandAllMaterials = () => {
    setExpandedMaterials(Object.fromEntries(
      consolidated.map((item) => [item.materialCode, true])
    ));
  };

  const collapseAllMaterials = () => {
    setExpandedMaterials({});
  };

  const toggleDept = (deptId) => {
    setExpandedDepts((prev) => ({ ...prev, [deptId]: !prev[deptId] }));
  };

  const toggleSection = (sectionId) => {
    setExpandedSections((prev) => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const toggleDate = (dateKey) => {
    setExpandedDates((prev) => ({ ...prev, [dateKey]: !prev[dateKey] }));
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center overflow-hidden bg-black/65 p-2 backdrop-blur-[3px] sm:p-4 animate-in fade-in duration-200">
      <div className="relative z-[301] flex max-h-[94dvh] w-full max-w-[1600px] flex-col overflow-hidden rounded-[4px] border border-[#102C57] bg-white shadow-xl">
        
        {/* Modal Header */}
        <div className="flex shrink-0 items-center justify-between border-b-2 border-[#d4af37] bg-[#102C57] px-4 py-3 text-white sm:px-6">
          <div>
            <div className="flex items-center gap-2">
              <Warehouse className="text-[#d4af37]" size={19} />
              <h2 className="text-base font-extrabold text-white sm:text-lg">
                ตรวจสอบวัตถุดิบก่อนส่งคลัง
              </h2>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              แผน {masterPlanNo || "-"} · รวมความต้องการจาก BOM และเทียบสต็อกคลัง 02 + 04
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white/10 text-white rounded transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="grid shrink-0 grid-cols-3 border-b border-slate-200 bg-white">
          <div className="flex min-h-16 items-center justify-center gap-3 border-r border-slate-200 px-3 py-2">
            <span className="text-xs font-semibold text-slate-600">วัตถุดิบทั้งหมด</span>
            <strong className="text-2xl text-[#102C57]">{consolidated.length}</strong>
          </div>
          <div className="flex min-h-16 items-center justify-center gap-3 border-r border-slate-200 px-3 py-2">
            <span className="text-xs font-semibold text-slate-600">เพียงพอ</span>
            <strong className="text-2xl text-emerald-700">{sufficientCount}</strong>
          </div>
          <div className="flex min-h-16 items-center justify-center gap-3 px-3 py-2">
            <span className="text-xs font-semibold text-slate-600">ไม่เพียงพอ</span>
            <strong className="text-2xl text-red-700">{shortagesCount}</strong>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 overflow-x-auto border-b border-slate-200 bg-white px-3 sm:px-5">
          <button
            onClick={() => setActiveTab("consolidated")}
            className={`flex items-center gap-2 px-6 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
              activeTab === "consolidated"
                ? "border-[#d4af37] bg-white text-[#102C57]"
                : "border-transparent text-slate-500 hover:text-[#102C57] hover:bg-slate-50"
            }`}
          >
            <List size={14} />
            ยอดรวมวัตถุดิบ
          </button>
          <button
            onClick={() => setActiveTab("breakdown")}
            className={`flex items-center gap-2 px-6 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${
              activeTab === "breakdown"
                ? "border-[#d4af37] bg-white text-[#102C57]"
                : "border-transparent text-slate-500 hover:text-[#102C57] hover:bg-slate-50"
            }`}
          >
            <Layers size={14} />
            แจกแจงตามแผนก / วันที่
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-auto bg-slate-50 p-2 sm:p-4">
          
          {activeTab === "consolidated" ? (
            /* CONSOLIDATED TAB */
            <div className="overflow-hidden rounded-[2px] border border-slate-300 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2">
                <span className="text-[11px] font-semibold text-slate-500">กดลูกศรเพื่อดูที่มาของความต้องการและสต็อกแยกคลัง</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={expandAllMaterials}
                    className="inline-flex h-8 items-center gap-1.5 rounded-[2px] border border-[#102C57] bg-white px-3 text-[11px] font-bold text-[#102C57] transition-colors hover:bg-slate-50"
                  >
                    <ChevronsDown size={13} />
                    เปิดทั้งหมด
                  </button>
                  <button
                    type="button"
                    onClick={collapseAllMaterials}
                    className="inline-flex h-8 items-center gap-1.5 rounded-[2px] border border-slate-300 bg-slate-100 px-3 text-[11px] font-bold text-slate-700 transition-colors hover:bg-slate-200"
                  >
                    <ChevronsUp size={13} />
                    ยุบทั้งหมด
                  </button>
                </div>
              </div>
              {shortagesCount > 0 && (
                <div className="flex items-center gap-2 border-b border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">
                  <AlertTriangle size={14} className="shrink-0" />
                  พบวัตถุดิบไม่เพียงพอ {shortagesCount} รายการ กรุณาตรวจสอบแถวสีแดงก่อนส่งคลัง
                </div>
              )}
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1320px] border-collapse text-left text-xs">
                  <thead>
                    <tr>
                      <th colSpan={2} className="border-r border-white/50 bg-[#102C57] px-3 py-2 text-center text-[11px] font-bold text-white">วัตถุดิบ</th>
                      <th colSpan={3} className="border-r border-white/50 bg-[#102C57] px-3 py-2 text-center text-[11px] font-bold text-white">ความต้องการจาก BOM</th>
                      <th colSpan={2} className="border-r border-white/50 bg-[#102C57] px-3 py-2 text-center text-[11px] font-bold text-white">สต็อกพร้อมใช้</th>
                      <th colSpan={2} className="bg-[#102C57] px-3 py-2 text-center text-[11px] font-bold text-white">ผลการตรวจ</th>
                    </tr>
                    <tr className="border-b border-slate-300 bg-slate-100 text-[10px] font-bold text-[#102C57]">
                      <th className="w-[235px] border-r border-slate-300 px-3 py-2">รหัสหลัก / ชื่อ</th>
                      <th className="w-[155px] border-r border-slate-300 px-3 py-2 text-center">รหัส BOM</th>
                      <th className="w-[175px] border-r border-slate-300 px-3 py-2 text-right">ต้องใช้ตาม BOM</th>
                      <th className="w-[105px] border-r border-slate-300 px-3 py-2 text-right">จำนวนมาตรฐาน</th>
                      <th className="w-[90px] border-r border-slate-300 px-3 py-2 text-center">หน่วยฐาน</th>
                      <th className="w-[185px] border-r border-slate-300 px-3 py-2 text-right">สต็อกอ่านง่าย</th>
                      <th className="w-[110px] border-r border-slate-300 px-3 py-2 text-right">สต็อกมาตรฐาน</th>
                      <th className="w-[120px] border-r border-slate-300 px-3 py-2 text-right">คงเหลือหลังใช้</th>
                      <th className="w-[105px] px-3 py-2 text-center">สถานะ</th>
                    </tr>
                  </thead>
                  <>
                    {consolidated.map((item, idx) => {
                      const isShort = item.shortageQty > 0;
                      const isExpanded = expandedMaterials[item.materialCode] === true;
                      const codes = Array.from(new Set((item.requirementComponents || []).map((component) => component.goodsCode).filter(Boolean)));
                      return (
                        <tbody key={`${item.materialCode}-${idx}`} className={isShort ? "bg-red-50/30" : "bg-white"}>
                          <tr className="border-b border-slate-200 hover:bg-slate-50">
                            <td className="border-r border-slate-200 px-3 py-2.5">
                              <button type="button" onClick={() => toggleMaterial(item.materialCode)} className="flex w-full items-start gap-2 text-left">
                                {isExpanded ? <ChevronDown size={15} className="mt-0.5 shrink-0 text-[#102C57]" /> : <ChevronRight size={15} className="mt-0.5 shrink-0 text-[#102C57]" />}
                                <span className="min-w-0">
                                  <strong className="block font-mono text-[12px] text-[#102C57]">{item.materialCode}</strong>
                                  <span className="block truncate font-semibold text-slate-800" title={item.materialName}>{item.materialName}</span>
                                  <small className="text-[9px] text-slate-500">SKU หลัก · หน่วยฐาน {item.baseUnit || item.unit}</small>
                                </span>
                              </button>
                            </td>
                            <td className="border-r border-slate-200 px-2 py-2 text-center">
                              <div className="flex flex-wrap justify-center gap-1">
                                {(codes.length ? codes : [item.materialGoodsCode]).map((code) => <span key={code} className="border border-[#102C57]/45 bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-[#102C57]">{code}</span>)}
                              </div>
                            </td>
                            <td className="border-r border-slate-200 px-3 py-2 text-right font-semibold text-[#102C57]">{item.requiredReadable || `${formatNumber(item.requiredQty)} ${item.unit}`}</td>
                            <td className="border-r border-slate-200 px-3 py-2 text-right font-mono font-bold">{formatNumber(item.requiredQty)}</td>
                            <td className="border-r border-slate-200 px-3 py-2 text-center font-semibold">{item.baseUnit || item.unit}</td>
                            <td className="border-r border-slate-200 px-3 py-2 text-right font-semibold text-[#102C57]">{item.stockReadable || `${formatNumber(item.stockQty)} ${item.unit}`}</td>
                            <td className="border-r border-slate-200 px-3 py-2 text-right font-mono font-bold">{formatNumber(item.stockQty)} {item.baseUnit || item.unit}</td>
                            <td className={`border-r border-slate-200 px-3 py-2 text-right font-mono font-bold ${isShort ? "text-red-700" : "text-emerald-700"}`}>{formatNumber(item.remainingQty ?? (item.stockQty - item.requiredQty))} {item.baseUnit || item.unit}</td>
                            <td className="px-2 py-2 text-center">
                              <span className={`inline-flex items-center gap-1 border px-2 py-1 text-[10px] font-bold ${isShort ? "border-red-300 bg-red-50 text-red-700" : "border-emerald-300 bg-emerald-50 text-emerald-700"}`}>
                                {isShort ? <AlertTriangle size={11} /> : <CheckCircle size={11} />}{isShort ? "ไม่เพียงพอ" : "เพียงพอ"}
                              </span>
                            </td>
                          </tr>
                          {isExpanded && (
                            <tr className="border-b border-slate-300 bg-[#f8fafc]">
                              <td colSpan={9} className="px-8 py-2.5">
                                <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr_1.5fr]">
                                  <div>
                                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#102C57]">ที่มาของความต้องการ</div>
                                    <div className="space-y-0.5 text-[10px] text-slate-700">
                                      {(item.requirementComponents || []).map((component) => <div key={component.goodsCode}><strong className="font-mono text-[#102C57]">{component.goodsCode}</strong> · {formatNumber(component.qty)} {component.unit} = {formatNumber(component.baseQty)} {item.baseUnit || item.unit}</div>)}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="mb-1 text-[10px] font-bold uppercase tracking-wider text-[#102C57]">สต็อกแยกคลัง</div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {(item.warehouseBreakdown || []).map((warehouse) => <span key={warehouse.warehouseCode} className="border border-[#102C57]/35 bg-white px-2 py-1 text-[10px] font-semibold text-[#102C57]">คลัง {warehouse.warehouseCode} · {warehouse.readableQty}</span>)}
                                    </div>
                                  </div>
                                  <div className="flex items-start gap-2 border-l border-slate-300 pl-3 text-[10px] text-slate-600">
                                    <Info size={13} className="mt-0.5 shrink-0 text-[#102C57]" />
                                    รหัสต่างหน่วยแต่เป็นวัตถุดิบเดียวกัน ระบบรวมเฉพาะคลัง 02 และ 04 แล้วเทียบด้วยหน่วยฐาน {item.baseUnit || item.unit}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </tbody>
                      );
                    })}
                    {consolidated.length === 0 && (
                      <tbody>
                        <tr>
                          <td colSpan={9} className="px-4 py-8 text-center text-slate-400 font-bold">
                            ไม่พบรายการวัตถุดิบ (BOM) สำหรับแผนงานผลิตรอบนี้
                          </td>
                        </tr>
                      </tbody>
                    )}
                  </>
                </table>
              </div>
            </div>
          ) : (
            /* BREAKDOWN TAB */
            <div className="space-y-2">
              <div className="border border-[#d4af37]/40 bg-[#fffdf5] px-3 py-2.5 text-xs leading-5 text-slate-600">
                แสดงที่มาของความต้องการตามลำดับ แผนก → Section → วันที่ผลิต → สินค้า โดยหน่วย BOM ยึดตาม Trade Code และจำนวนมาตรฐานใช้สำหรับรวมยอดเทียบสต็อก
              </div>
              {breakdown.map((dept) => {
                const isDeptExpanded = expandedDepts[dept.id] !== false; // default expanded
                const productCount = (dept.sections || []).reduce(
                  (total, section) => total + (section.dates || []).reduce(
                    (dateTotal, date) => dateTotal + (date.products || []).length,
                    0
                  ),
                  0
                );
                return (
                  <div key={dept.id} className="overflow-hidden rounded-[2px] border border-slate-300 bg-white">
                    {/* Department Header */}
                    <button
                      onClick={() => toggleDept(dept.id)}
                      className="flex w-full items-center justify-between border-b border-[#d4af37]/40 bg-[#102C57] px-3 py-2 text-left text-white"
                    >
                      <span className="flex items-center gap-2 text-sm font-bold">
                        {isDeptExpanded ? <ChevronDown size={14} className="text-[#d4af37]" /> : <ChevronRight size={14} className="text-[#d4af37]" />}
                        <span className="border border-white/40 px-2 py-0.5 font-mono text-[11px] font-bold text-[#d4af37]">
                          {dept.code}
                        </span>
                        แผนก {dept.name}
                      </span>
                      <span className="text-xs font-medium text-white/75">{productCount} รายการผลิต</span>
                    </button>

                    {isDeptExpanded && (
                      <div className="space-y-2 p-2">
                        {dept.sections.map((section) => {
                          const isSecExpanded = expandedSections[section.id] !== false; // default expanded
                          return (
                            <div key={section.id} className="overflow-hidden border border-slate-300">
                              {/* Section Header */}
                              <button
                                onClick={() => toggleSection(section.id)}
                                className="flex w-full items-center justify-between border-b border-slate-300 bg-slate-100 px-3 py-2 text-left"
                              >
                                <span className="flex items-center gap-2 text-[13px] font-bold text-[#102C57]">
                                  {isSecExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                                  Section: {section.name}
                                </span>
                                <span className="text-[11px] font-medium text-slate-500">{section.dates.length} วันผลิต</span>
                              </button>

                              {isSecExpanded && (
                                <div className="space-y-2 p-2">
                                  {section.dates.map((dt) => {
                                    const dateKey = `${section.id}::${dt.date}`;
                                    const isDateExpanded = expandedDates[dateKey] !== false; // default expanded
                                    return (
                                      <div key={dt.date} className="border border-slate-200">
                                        {/* Date Header */}
                                        <button
                                          onClick={() => toggleDate(dateKey)}
                                          className="flex w-full items-center justify-between border-b border-slate-200 bg-white px-3 py-2 text-left text-xs"
                                        >
                                          <span className="flex items-center gap-1.5 font-bold text-[#102C57]">
                                            {isDateExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                            <Calendar size={12} className="text-[#d4af37]" />
                                            วันที่ผลิต: {dt.date}
                                          </span>
                                          <span className="text-slate-500">{dt.products.length} สินค้า</span>
                                        </button>

                                        {isDateExpanded && (
                                          <div className="divide-y divide-slate-200">
                                            {dt.products.map((prod, pIdx) => (
                                              <div key={`${prod.skuCode}-${pIdx}`} className="bg-white">
                                                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-slate-200 bg-[#f8fafc] px-3 py-2">
                                                  <span className="border border-[#102C57]/45 bg-white px-2 py-0.5 font-mono text-xs font-bold text-[#102C57]">
                                                    {prod.skuCode}
                                                  </span>
                                                  <span className="text-[13px] font-bold text-slate-800">{prod.skuName}</span>
                                                  <span className="ml-auto text-xs font-semibold text-slate-600">
                                                    จำนวนผลิต <strong className="font-mono text-[#102C57]">{formatNumber(prod.plannedQty)}</strong> {prod.unit}
                                                  </span>
                                                </div>
                                                <div className="overflow-x-auto">
                                                  <table className="w-full min-w-[800px] border-collapse text-xs leading-5">
                                                    <thead className="bg-white text-[#102C57]">
                                                      <tr className="border-b border-slate-200">
                                                        <th className="w-[34%] border-r border-slate-200 px-3 py-2 text-left text-[12px]">รหัสหลัก / ชื่อวัตถุดิบ</th>
                                                        <th className="w-[16%] border-r border-slate-200 px-3 py-2 text-center text-[12px]">Trade Code</th>
                                                        <th className="w-[20%] border-r border-slate-200 px-3 py-2 text-right text-[12px]">ต้องใช้ตาม BOM</th>
                                                        <th className="w-[18%] border-r border-slate-200 px-3 py-2 text-right text-[12px]">จำนวนมาตรฐาน</th>
                                                        <th className="w-[12%] px-3 py-2 text-center text-[12px]">ประเภท</th>
                                                      </tr>
                                                    </thead>
                                                    <tbody>
                                                      {getFlattenedMaterials(prod.materials, prod.skuCode).map((mat, mIdx) => {
                                                        const isChild = mat.depth > 0;
                                                        return (
                                                          <tr key={`${mat.materialCode}-${mIdx}`} className={`border-b border-slate-100 last:border-b-0 ${isChild ? "bg-slate-50/70" : "bg-white"}`}>
                                                            <td className="border-r border-slate-200 px-3 py-2" style={{ paddingLeft: `${12 + (mat.depth * 18)}px` }}>
                                                              <div className="flex min-w-0 items-center gap-1.5">
                                                                {isChild && <span className="text-slate-400">└─</span>}
                                                                <strong className="shrink-0 font-mono text-[#102C57]">{mat.stockSkuCode || mat.materialCode}</strong>
                                                                <span className="truncate text-slate-600" title={mat.materialName}>· {mat.materialName}</span>
                                                              </div>
                                                            </td>
                                                            <td className="border-r border-slate-200 px-3 py-2 text-center"><span className="border border-[#102C57]/40 px-2 py-0.5 font-mono font-semibold text-[#102C57]">{mat.materialGoodsCode || mat.materialCode}</span></td>
                                                            <td className="border-r border-slate-200 px-3 py-2 text-right font-mono text-[13px] font-bold text-[#102C57]">{formatNumber(mat.requiredQty)} {mat.unit}</td>
                                                            <td className="border-r border-slate-200 px-3 py-2 text-right font-mono text-[13px] font-bold">{formatNumber(mat.requiredBaseQty ?? mat.requiredQty)} {mat.baseUnit || mat.unit}</td>
                                                            <td className="px-3 py-2 text-center"><span className={`border px-2 py-0.5 text-[10px] font-bold ${mat.itemType === "WIP" ? "border-amber-300 bg-amber-50 text-amber-800" : "border-sky-300 bg-sky-50 text-sky-800"}`}>{mat.itemType === "WIP" ? "WIP" : "RAW"}</span></td>
                                                          </tr>
                                                        );
                                                      })}
                                                    </tbody>
                                                  </table>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {breakdown.length === 0 && (
                <div className="border border-slate-300 bg-white py-12 text-center font-bold text-slate-400">
                  ไม่พบการแจกแจงแผนกผลิต
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex shrink-0 flex-col gap-3 border-t border-slate-300 bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <label className="flex items-start gap-2.5 cursor-pointer text-slate-700">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 rounded-[2px] border-slate-300 text-[#102C57] focus:ring-[#102C57]"
              checked={confirmed}
              disabled={consolidated.length === 0}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span className="text-[11px] font-semibold select-none leading-normal">
              ยืนยันข้อมูลก่อนส่งให้คลังตรวจสอบ
            </span>
          </label>
          
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="h-9 rounded-[2px] border border-[#102C57] px-5 text-xs font-bold text-[#102C57] transition-colors hover:bg-slate-50"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              disabled={!confirmed || isSubmitting || consolidated.length === 0}
              onClick={onSubmit}
              className="flex h-9 items-center gap-1.5 rounded-[2px] border border-[#d4af37] bg-[#d4af37] px-5 text-xs font-extrabold text-[#102C57] transition-colors hover:bg-[#c9a431] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <div className="h-3.5 w-3.5 animate-spin border-2 border-white border-t-transparent rounded-full" />
                  กำลังส่งตรวจ...
                </>
              ) : (
                <>
                  <Send size={12} />
                  ส่งตรวจวัตถุดิบ
                </>
              )}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
