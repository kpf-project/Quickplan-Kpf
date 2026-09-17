"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { X, Search, Check, Package, Plus, Trash2, List, ShoppingCart, Filter, AlertTriangle } from "lucide-react";

const COMPONENT_TYPE_OPTIONS = [
    {
        id: "WIP",
        label: "WIP",
        hint: "หมวด 03",
    },
    {
        id: "RAW",
        label: "RAW",
        hint: "หมวด 01, 02, 05, 08, 10",
    },
];

function getMaterialVariantKey(material) {
    const skuCode = String(material?.code || "").trim();
    const goodsCode = String(material?.goodsCode || skuCode).trim();
    return `${skuCode}::${goodsCode}`;
}

function getDisplayMaterialCode(material) {
    const skuCode = String(material?.code || "").trim();
    const goodsCode = String(material?.goodsCode || skuCode).trim();
    return goodsCode || skuCode;
}

function getDisplayMaterialUnit(material) {
    const itemType = String(material?.itemType || "").trim().toUpperCase();
    const wipQtyInputMode = String(material?.wipQtyInputMode || "").trim().toLowerCase();
    if (itemType === "WIP" && wipQtyInputMode === "batch") {
        return "ชุด";
    }
    return material?.unit || material?.uom || "-";
}

export default function MaterialSelectionDrawer({
    isOpen,
    onClose,
    materials,
    allowedComponentTypes = ["WIP", "RAW"],
    initialComponentType = "WIP",
    categoryOptions = [],
    onConfirm,
    existingMaterialCodes = new Set(), // To prevent duplicates
    existingMaterialKeys = new Set(),
}) {
    const [searchTerm, setSearchText] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [componentType, setComponentType] = useState(initialComponentType);
    const [selectedItems, setSelectedItems] = useState(new Map()); // Map<code, { material, qty }>
    const [activeTab, setActiveTab] = useState("materials"); // "materials" | "selected" (Mobile only)

    const activeTypeOptions = useMemo(() => {
        const allowed = new Set(
            (Array.isArray(allowedComponentTypes) ? allowedComponentTypes : [])
                .map((value) => String(value || "").trim().toUpperCase())
                .filter(Boolean)
        );
        const filtered = COMPONENT_TYPE_OPTIONS.filter((option) => allowed.has(option.id));
        return filtered.length > 0 ? filtered : COMPONENT_TYPE_OPTIONS.filter((option) => option.id === "RAW");
    }, [allowedComponentTypes]);

    const defaultComponentType = useMemo(() => {
        const normalizedInitial = String(initialComponentType || "").trim().toUpperCase();
        if (activeTypeOptions.some((option) => option.id === normalizedInitial)) {
            return normalizedInitial;
        }
        return activeTypeOptions[0]?.id || "RAW";
    }, [activeTypeOptions, initialComponentType]);

    // Reset state when opened
    useEffect(() => {
        if (isOpen) {
            setSearchText("");
            setCategoryFilter("all");
            setComponentType(defaultComponentType);
            setSelectedItems(new Map());
            setActiveTab("materials");
        }
    }, [defaultComponentType, isOpen]);

    useEffect(() => {
        if (!activeTypeOptions.some((option) => option.id === componentType)) {
            setComponentType(defaultComponentType);
        }
    }, [activeTypeOptions, componentType, defaultComponentType]);

    // Filter Logic
    const filteredMaterials = useMemo(() => {
        const seenKeys = new Set();
        return materials.filter(m => {
            const matchesType = String(m.itemType || "").toUpperCase() === componentType;
            const matchesSearch =
                m.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
                String(m.goodsCode || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
                m.name.toLowerCase().includes(searchTerm.toLowerCase());

            const matchesCategory = categoryFilter === "all" || m.category === categoryFilter;

            // Exclude already existing materials
            const materialKey = getMaterialVariantKey(m);
            const hasVariantKeys = existingMaterialKeys instanceof Set && existingMaterialKeys.size > 0;
            const notExisting = hasVariantKeys
                ? !existingMaterialKeys.has(materialKey)
                : !existingMaterialCodes.has(m.code);

            if (!(matchesType && matchesSearch && matchesCategory && notExisting)) {
                return false;
            }

            if (seenKeys.has(materialKey)) {
                return false;
            }
            seenKeys.add(materialKey);
            return true;
        });
    }, [materials, searchTerm, categoryFilter, existingMaterialCodes, existingMaterialKeys, componentType]);

    // Get unique categories from materials
    const uniqueCategories = useMemo(() => {
        const map = new Map();
        materials.forEach(m => {
            if (String(m.itemType || "").toUpperCase() !== componentType) return;
            if (m.category && !map.has(m.category)) {
                map.set(m.category, m.categoryName || m.category);
            }
        });
        return Array.from(map.entries());
    }, [materials, componentType]);

    useEffect(() => {
        if (categoryFilter === "all") return;
        const hasCategory = uniqueCategories.some(([code]) => String(code) === String(categoryFilter));
        if (!hasCategory) {
            setCategoryFilter("all");
        }
    }, [categoryFilter, uniqueCategories]);

    const resolveCategoryOption = (opt) => {
        if (!opt) return null;
        if (typeof opt === "string") {
            return { code: opt, label: opt };
        }
        if (Array.isArray(opt)) {
            return { code: opt[0], label: opt[1] || opt[0] };
        }
        const code = String(opt.code ?? opt.value ?? opt.label ?? "").trim();
        const label = String(opt.label ?? opt.name ?? opt.displayName ?? "").trim() || code;
        return { code, label };
    };

    const handleToggleItem = (material) => {
        const newMap = new Map(selectedItems);
        const key = getMaterialVariantKey(material);
        if (newMap.has(key)) {
            newMap.delete(key);
        } else {
            newMap.set(key, {
                material,
                qty: "" // Let user type manually
            });
        }
        setSelectedItems(newMap);
    };

    const handleUpdateQty = (code, val) => {
        const item = selectedItems.get(code);
        if (item) {
            if (val === "") {
                setSelectedItems(new Map(selectedItems.set(code, { ...item, qty: "" })));
                return;
            }
            const parsed = Number(val);
            if (!Number.isFinite(parsed)) {
                setSelectedItems(new Map(selectedItems.set(code, { ...item, qty: "" })));
                return;
            }
            const normalizedInput = Math.max(0.0001, parsed);
            const newQty = normalizedInput;
            setSelectedItems(new Map(selectedItems.set(code, { ...item, qty: newQty })));
        }
    };

    const isQtyValid = useCallback((qty) => {
        if (qty === "") return false;
        const parsed = Number(qty);
        return Number.isFinite(parsed) && parsed >= 0.0001;
    }, []);

    const hasInvalidQty = useMemo(() => {
        if (!selectedItems.size) return false;
        return Array.from(selectedItems.values()).some(({ qty }) => !isQtyValid(qty));
    }, [isQtyValid, selectedItems]);

    const handleConfirm = () => {
        if (hasInvalidQty) {
            return;
        }
        const itemsToAdd = Array.from(selectedItems.values()).map(({ material, qty }) => {
            const parsed = Number(qty);
            return { material, qty: Number.isFinite(parsed) && parsed >= 0.0001 ? parsed : 0.0001 };
        });
        if (itemsToAdd.length > 0) {
            onConfirm(itemsToAdd);
        }
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Drawer Panel */}
            <div className="relative w-full max-w-[1100px] bg-white shadow-2xl flex flex-col h-full animate-in slide-in-from-right duration-300">

                {/* Header */}
                <div className="px-4 lg:px-6 py-4 border-b border-gray-100 flex justify-between items-center bg-[#102C57] text-white shrink-0">
                    <div className="flex flex-col">
                        <h2 className="text-lg font-bold flex items-center gap-2">
                            <Package size={20} className="text-[#d4af37]" />
                            เลือกวัตถุดิบ
                            <span className="text-xs font-normal opacity-70 bg-[#d4af37]/20 px-2 py-0.5 rounded-full border border-[#d4af37]/30">
                                ทั้งหมด {materials.length.toLocaleString()} รายการ
                            </span>
                        </h2>
                        <p className="text-xs text-white/60 hidden lg:block ml-7">เลือกรายการและระบุจำนวนที่ต้องการ</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-white/10 rounded-full transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Mobile Tabs */}
                <div className="flex border-b border-gray-200 lg:hidden shrink-0">
                    <button
                        onClick={() => setActiveTab("materials")}
                        className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 ${activeTab === "materials"
                            ? "text-[#102C57] border-b-2 border-[#102C57] bg-blue-50/50"
                            : "text-gray-500"
                            }`}
                    >
                        <List size={16} />
                        รายการวัตถุดิบ
                    </button>
                    <button
                        onClick={() => setActiveTab("selected")}
                        className={`flex-1 py-3 text-sm font-bold flex items-center justify-center gap-2 ${activeTab === "selected"
                            ? "text-[#102C57] border-b-2 border-[#102C57] bg-blue-50/50"
                            : "text-gray-500"
                            }`}
                    >
                        <ShoppingCart size={16} />
                        ที่เลือก ({selectedItems.size})
                    </button>
                </div>

                {/* Content Container */}
                <div className="flex-1 flex overflow-hidden relative">

                    {/* Left: Material List (Selection) */}
                    <div className={`
            flex-1 flex flex-col min-w-0 bg-white absolute inset-0 lg:static transition-transform duration-300
            ${activeTab === "materials" ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          `}>
                        {/* Toolbar */}
                        <div className="p-4 bg-gray-50/50 border-b border-gray-100 flex flex-col gap-2 shrink-0">
                            <div
                                role="tablist"
                                aria-label="เลือกประเภทคอมโพเนนต์"
                                className="inline-flex w-fit rounded-xl border border-[#102C57]/15 bg-white p-1 shadow-sm"
                            >
                                {activeTypeOptions.map((option) => {
                                    const isActiveType = componentType === option.id;
                                    return (
                                        <button
                                            key={option.id}
                                            id={`component-tab-${option.id.toLowerCase()}`}
                                            type="button"
                                            role="tab"
                                            aria-selected={isActiveType}
                                            aria-controls={`component-panel-${option.id.toLowerCase()}`}
                                            onClick={() => {
                                                setComponentType(option.id);
                                                setCategoryFilter("all");
                                            }}
                                            className={`rounded-lg px-3 py-1.5 text-xs font-bold uppercase tracking-[0.14em] transition-colors ${
                                                isActiveType
                                                    ? "bg-[#102C57] text-[#f2d68a]"
                                                    : "text-[#102C57] hover:bg-[#102C57]/10"
                                            }`}
                                        >
                                            {option.label}
                                        </button>
                                    );
                                })}
                            </div>
                            <p className="text-[11px] font-semibold text-[#8a6d1f]">
                                {activeTypeOptions.find((item) => item.id === componentType)?.hint}
                            </p>
                            <div
                                id={`component-panel-${componentType.toLowerCase()}`}
                                role="tabpanel"
                                aria-labelledby={`component-tab-${componentType.toLowerCase()}`}
                                className="flex flex-col sm:flex-row gap-2"
                            >
                            {/* Category Filter */}
                            <div className="relative sm:w-40 shrink-0">
                                <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <select
                                    value={categoryFilter}
                                    onChange={(e) => setCategoryFilter(e.target.value)}
                                    className="w-full h-10 pl-9 pr-8 rounded-lg border border-gray-200 text-sm focus:border-[#102C57] focus:ring-1 focus:ring-[#102C57] outline-none appearance-none bg-white cursor-pointer"
                                >
                                    <option value="all">ทุกหมวดหมู่</option>
                                    {(categoryOptions.length > 0 ? categoryOptions : uniqueCategories).map((opt) => {
                                        const resolved = resolveCategoryOption(opt);
                                        if (!resolved || !resolved.code) return null;
                                        const keyCode = String(resolved.code).trim();
                                        const displayLabel = keyCode.toLowerCase() === "all"
                                            ? "ทุกหมวดหมู่"
                                            : resolved.label || keyCode;
                                        return (
                                            <option key={keyCode} value={keyCode}>
                                                {displayLabel}
                                            </option>
                                        );
                                    })}
                                </select>
                            </div>
                            {/* Search */}
                            <div className="relative flex-1">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                                <input
                                    value={searchTerm}
                                    onChange={(e) => setSearchText(e.target.value)}
                                    placeholder="ค้นหารหัส หรือ ชื่อวัตถุดิบ..."
                                    className="w-full h-10 pl-9 pr-4 rounded-lg border border-gray-200 text-sm focus:border-[#102C57] focus:ring-1 focus:ring-[#102C57] outline-none"
                                />
                            </div>
                            </div>
                        </div>

                        {/* Table */}
                        <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin scrollbar-thumb-gray-300">
                            <table className="w-full text-sm table-fixed">
                                <thead className="sticky top-0 bg-gray-50 z-10">
                                    <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
                                        <th className="w-10 px-2 py-3"></th>
                                        <th className="w-[120px] px-2 py-3 font-semibold">รหัส</th>
                                        <th className="px-3 py-3 font-semibold">ชื่อวัตถุดิบ</th>
                                        <th className="w-[80px] px-2 py-3 font-semibold">หน่วย</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {filteredMaterials.map(material => {
                                        const materialKey = getMaterialVariantKey(material);
                                        const isSelected = selectedItems.has(materialKey);
                                        return (
                                            <tr
                                                key={materialKey}
                                                onClick={() => handleToggleItem(material)}
                                                className={`cursor-pointer transition-colors select-none ${isSelected
                                                    ? "bg-blue-50 hover:bg-blue-100"
                                                    : "bg-white hover:bg-gray-50"
                                                    }`}
                                            >
                                                <td className="px-2 py-3">
                                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${isSelected ? "bg-[#102C57] border-[#102C57]" : "border-gray-300 bg-white"}`}>
                                                        {isSelected && <Check size={12} className="text-white" />}
                                                    </div>
                                                </td>
                                                <td className="px-2 py-3 font-mono text-gray-600 whitespace-nowrap">
                                                    <div className="font-semibold text-[#102C57]">{getDisplayMaterialCode(material)}</div>
                                                    {material.code && getDisplayMaterialCode(material) !== material.code ? (
                                                        <div className="text-[11px] text-gray-400">SKU หลัก {material.code}</div>
                                                    ) : null}
                                                    {material.goodsCode && getDisplayMaterialCode(material) !== material.code ? (
                                                        <div className="text-[11px] text-gray-400">รหัสซื้อขาย {material.goodsCode}</div>
                                                    ) : null}
                                                </td>
                                                <td
                                                    className="px-3 py-3 text-gray-800 font-medium break-words whitespace-normal line-clamp-2"
                                                    title={material.name}
                                                >
                                                    {material.name}
                                                </td>
                                                <td className="px-2 py-3 text-gray-500 whitespace-nowrap">
                                                    {getDisplayMaterialUnit(material)}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            {filteredMaterials.length === 0 && (
                                <div className="text-center py-12 text-gray-400 text-sm">ไม่พบวัตถุดิบ</div>
                            )}
                        </div>

                        {/* Mobile: Floating Summary Bar */}
                        <div className="lg:hidden p-4 border-t border-gray-200 bg-white">
                            <button
                                onClick={() => setActiveTab("selected")}
                                disabled={selectedItems.size === 0}
                                className="w-full h-11 bg-[#102C57] hover:bg-[#1a3b6d] text-white text-sm font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                ไปกรอกจำนวน ({selectedItems.size})
                            </button>
                        </div>
                    </div>

                    {/* Right: Selected & Quantity (Batch Input) */}
                    <div className={`
            w-full lg:w-[320px] bg-gray-50 flex flex-col shrink-0 border-l border-gray-200 absolute inset-0 lg:static transition-transform duration-300 z-10
            ${activeTab === "selected" ? "translate-x-0" : "translate-x-full lg:translate-x-0"}
          `}>
                        <div className="p-4 border-b border-gray-200 bg-white shrink-0 hidden lg:block">
                            <h3 className="font-bold text-gray-700 text-sm flex items-center justify-between">
                                รายการที่เลือก
                                <span className="bg-[#102C57] text-white text-[10px] px-2 py-0.5 rounded-full">
                                    {selectedItems.size}
                                </span>
                            </h3>
                        </div>

                        <div className="flex-1 overflow-y-auto p-3 space-y-3 scrollbar-thin scrollbar-thumb-gray-300">
                            {selectedItems.size === 0 ? (
                                <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-2 opacity-60">
                                    <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center">
                                        <Plus size={20} />
                                    </div>
                                    <p className="text-xs">เลือกวัตถุดิบจากรายการ</p>
                                    <button
                                        onClick={() => setActiveTab("materials")}
                                        className="text-[#102C57] text-xs font-bold underline lg:hidden"
                                    >
                                        กลับไปเลือกวัตถุดิบ
                                    </button>
                                </div>
                            ) : (
                                Array.from(selectedItems.values()).map(({ material, qty }) => {
                                    const materialKey = getMaterialVariantKey(material);
                                    return (
                                    <div key={materialKey} className="bg-white p-3 rounded-lg shadow-sm border border-gray-200 animate-in slide-in-from-bottom-2 duration-200">
                                        <div className="flex justify-between items-start mb-2 gap-2">
                                            <div className="min-w-0">
                                                <div className="text-[11px] font-mono font-semibold text-[#102C57]">{getDisplayMaterialCode(material)}</div>
                                                {material.code && getDisplayMaterialCode(material) !== material.code ? (
                                                    <div className="text-[10px] font-mono text-gray-400">SKU หลัก {material.code}</div>
                                                ) : null}
                                                {material.goodsCode && getDisplayMaterialCode(material) !== material.code ? (
                                                    <div className="text-[10px] font-mono text-gray-400">รหัสซื้อขาย {material.goodsCode}</div>
                                                ) : null}
                                                <div className="text-xs font-medium text-gray-800 line-clamp-2 leading-tight">{material.name}</div>
                                                {String(material?.itemType || "").toUpperCase() === "WIP" && String(material?.wipQtyInputMode || "").trim().toLowerCase() === "batch" ? (
                                                    <div className="mt-1 text-[10px] font-semibold text-[#8a6d1f]">กรอกจำนวนเป็นชุด</div>
                                                ) : null}
                                                <div className="mt-1">
                                                    <span
                                                        className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] ${
                                                            material.itemType === "WIP"
                                                                ? "border-[#d4af37]/70 bg-[#d4af37]/15 text-[#8a6d1f]"
                                                                : "border-[#102C57]/35 bg-[#102C57]/10 text-[#102C57]"
                                                        }`}
                                                    >
                                                        {material.itemType}
                                                    </span>
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleToggleItem(material)}
                                                className="text-gray-300 hover:text-red-500 transition-colors p-1 shrink-0"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                        <div className="flex items-center gap-2 mt-2">
                                            <div className="flex-1 relative">
                                                <input
                                                    type="number"
                                                    value={qty === "" ? "" : qty}
                                                    onChange={(e) => handleUpdateQty(materialKey, e.target.value)}
                                                    step="0.0001"
                                                    min="0.0001"
                                                    className={`w-full h-10 px-3 rounded-lg text-sm font-bold text-[#102C57] focus:border-[#d4af37] focus:ring-1 focus:ring-[#d4af37] outline-none ${qty === "" || isQtyValid(qty) ? "border-gray-200" : "border-red-400 bg-red-50"}`}
                                                    placeholder="กรอกจำนวน"
                                                />
                                            </div>
                                            <span className="text-xs text-gray-500 shrink-0 min-w-[40px] text-right truncate">
                                                {getDisplayMaterialUnit(material)}
                                            </span>
                                        </div>
                                    </div>
                                );
                                })
                            )}
                        </div>

                        {/* Footer Actions */}
                        <div className="p-4 bg-white border-t border-gray-200 shrink-0">
                            <button
                                onClick={handleConfirm}
                                disabled={selectedItems.size === 0 || hasInvalidQty}
                                className="w-full h-12 bg-[#102C57] hover:bg-[#1a3b6d] text-white text-sm font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none active:scale-95"
                            >
                                ยืนยัน ({selectedItems.size})
                            </button>
                        {hasInvalidQty && (
                            <div
                                role="alert"
                                className="mt-2 flex items-center gap-1 text-[11px] text-red-500"
                            >
                                <AlertTriangle size={12} />
                                กรุณากรอกจำนวนที่มากกว่า 0 ก่อนยืนยัน
                            </div>
                        )}
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
}



