"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Search } from "lucide-react";
import PlanningCatalogDialog, { PlanningCatalogTable, PlanningCatalogRowNumber } from "@/features/production-planning/components/PlanningCatalogDialog";
import WeightScalePaginationBar from "./WeightScalePaginationBar";
import catalogStyles from "@/features/production-planning/components/RequisitionMaterialPicker.module.css";

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
    onConfirm,
    existingMaterialCodes = new Set(), // To prevent duplicates
    existingMaterialKeys = new Set(),
}) {
    const [searchTerm, setSearchText] = useState("");
    const [categoryFilter, setCategoryFilter] = useState("all");
    const [componentType, setComponentType] = useState(initialComponentType);
    const [selectedItems, setSelectedItems] = useState(new Map()); // Map<code, { material, qty }>
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(15);
    useEffect(() => { setPage(1); }, [searchTerm, categoryFilter, componentType, isOpen]);

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

    const totalPages = Math.max(1, Math.ceil(filteredMaterials.length / limit));
    const currentPage = Math.min(page, totalPages);
    const visible = filteredMaterials.slice((currentPage - 1) * limit, currentPage * limit);
    return <PlanningCatalogDialog title="เลือกวัตถุดิบ" description="เลือก RAW / WIP และระบุจำนวนตามหน่วยของแต่ละรายการ" onClose={onClose}>
      <div className={catalogStyles.body}>
        <div className={catalogStyles.catalog}>
          <div className={catalogStyles.filters}>
            <label className={catalogStyles.search}><Search size={17} /><input type="search" aria-label="ค้นหาวัตถุดิบ" placeholder="ค้นหารหัส Trade Code / ชื่อวัตถุดิบ" value={searchTerm} onChange={event => setSearchText(event.target.value)} /></label>
            <select aria-label="ประเภทวัตถุดิบ" value={componentType} onChange={event => setComponentType(event.target.value)}>{activeTypeOptions.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
            <select aria-label="หมวดวัตถุดิบ" value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)}><option value="all">ทุกหมวดหมู่</option>{uniqueCategories.map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}</select>
          </div>
          <PlanningCatalogTable>
            <thead><tr><th aria-label="เลือก" /><th>#</th><th>รหัส</th><th>ชื่อ</th><th>หน่วย</th><th>ประเภท</th><th>สถานะ</th></tr></thead>
            <tbody>{visible.map((material, index) => {
              const key = getMaterialVariantKey(material), selected = selectedItems.has(key);
              return <tr key={key} data-selected={selected} data-existing="false" onClick={() => handleToggleItem(material)}>
                <td><input type="checkbox" aria-label={`เลือก ${getDisplayMaterialCode(material)}`} checked={selected} onClick={event => event.stopPropagation()} onChange={() => handleToggleItem(material)} /></td>
                <PlanningCatalogRowNumber page={currentPage} limit={limit} index={index} />
                <td className={catalogStyles.code}>{getDisplayMaterialCode(material)}</td><td>{material.name}</td><td>{getDisplayMaterialUnit(material)}</td><td>{material.itemType}</td><td>{selected ? "เลือกแล้ว" : "—"}</td>
              </tr>;
            })}{!visible.length && <tr><td colSpan={7}>ไม่พบรายการที่เลือกเพิ่มได้</td></tr>}</tbody>
          </PlanningCatalogTable>
          <div className={catalogStyles.pagination}><WeightScalePaginationBar page={currentPage} totalPages={totalPages} totalCount={filteredMaterials.length} limit={limit} limitOptions={[15,25,50]} onPageChange={setPage} onLimitChange={value => { setLimit(value); setPage(1); }} /></div>
        </div>
        <aside className={catalogStyles.selection}>
          <div className={catalogStyles.selectionHeading}><strong>เลือกแล้ว ({selectedItems.size})</strong><button type="button" onClick={() => setSelectedItems(new Map())}>ล้างรายการทั้งหมด</button></div>
          <div className={catalogStyles.selectedList}>{Array.from(selectedItems.entries()).map(([key, {material, qty}]) => <div key={key}>
            <div><strong className={catalogStyles.code}>{getDisplayMaterialCode(material)}</strong><p>{material.name}</p>
              <label>จำนวน <input aria-label={`จำนวน ${getDisplayMaterialCode(material)}`} type="number" min="0.0001" step="0.0001" value={qty} onChange={event => handleUpdateQty(key, event.target.value)} style={{width:100,height:32,border:"1px solid #c5d2e3",borderRadius:3,padding:4}} /> {getDisplayMaterialUnit(material)}</label>
            </div><button type="button" onClick={() => handleToggleItem(material)}>ลบ</button>
          </div>)}</div>
        </aside>
      </div>
      <footer className={catalogStyles.footer}>
        {hasInvalidQty && <p role="alert">กรุณากรอกจำนวนมากกว่า 0 ให้ครบทุกรายการ</p>}
        <button type="button" onClick={onClose}>ยกเลิก</button>
        <button type="button" className={catalogStyles.primary} onClick={handleConfirm} disabled={!selectedItems.size || hasInvalidQty}>เพิ่ม {selectedItems.size} รายการ</button>
      </footer>
    </PlanningCatalogDialog>;
}



