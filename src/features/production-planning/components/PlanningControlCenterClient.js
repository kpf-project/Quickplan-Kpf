"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import useSWR from "swr";
import {
  Save,
  Check,
  Plus,
  Trash2,
  Lock,
  Unlock,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Layers,
  FileText,
  Boxes,
  Calendar,
  Search,
  X,
} from "lucide-react";
import { fetchJson, fetcher } from "@/lib/clientFetch";
import { normalizePlanningMasterPlanOptions } from "@/lib/planningMasterPlanOptions";
import ProductionScheduleClient from "./ProductionScheduleClient";

// Formatting helpers
function formatDate(dateStr) {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("th-TH", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatNumber(value, digits = 2) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return "0.00";
  return parsed.toLocaleString("th-TH", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export default function PlanningControlCenterClient() {
  const [selectedMasterPlanNo, setSelectedMasterPlanNo] = useState("");
  const [activeDeptId, setActiveDeptId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [draftLines, setDraftLines] = useState([]);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [openSections, setOpenSections] = useState({});
  const [notification, setNotification] = useState({ type: "", text: "" });
  const [activeSection, setActiveSection] = useState(null);
  const [showWipEditor, setShowWipEditor] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [wipPickerTempId, setWipPickerTempId] = useState(null);

  // 1. Fetch master plans from the dedicated dropdown-options endpoint.
  const { data: plansData, isLoading: plansLoading } = useSWR(
    "/api/production-planning/master-plan-options",
    fetcher,
    { revalidateOnFocus: false }
  );

  // Normalize the dedicated API response for the dropdown.
  const masterPlans = useMemo(() => {
    return normalizePlanningMasterPlanOptions(plansData?.data);
  }, [plansData]);

  // Set default Master Plan to the latest one on load
  useEffect(() => {
    if (masterPlans.length > 0 && !selectedMasterPlanNo) {
      const latest = masterPlans[0];
      setSelectedMasterPlanNo(latest.masterPlanNo);
      setDateFrom(latest.periodStart);
      setDateTo(latest.periodEnd);
    }
  }, [masterPlans, selectedMasterPlanNo]);

  // Handle Master Plan dropdown change
  const handleMasterPlanChange = (masterPlanNo) => {
    const found = masterPlans.find((p) => p.masterPlanNo === masterPlanNo);
    if (found) {
      setSelectedMasterPlanNo(masterPlanNo);
      setDateFrom(found.periodStart);
      setDateTo(found.periodEnd);
    }
  };

  // 2. Fetch assigned departments
  const { data: deptsData, isLoading: deptsLoading } = useSWR(
    "/api/production-planning/departments?scope=assigned",
    fetcher,
    { revalidateOnFocus: false }
  );
  const departments = useMemo(() => {
    const list = deptsData?.data || [];
    // Exclude central department for operations planning tabs
    return list.filter(
      (d) =>
        !d.is_central_department &&
        !String(d.code).includes("CENTER") &&
        !String(d.name).includes("กลาง")
    );
  }, [deptsData]);

  // Set default department tab
  useEffect(() => {
    if (departments.length > 0 && !activeDeptId) {
      setActiveDeptId(departments[0].id);
    }
    setActiveSection(null);
  }, [departments, activeDeptId]);

  // 3. Fetch WIP subplan draft lines for selected Master Plan & active Department
  const draftUrl = useMemo(() => {
    if (!selectedMasterPlanNo || !activeDeptId) return null;
    return `/api/production-planning/wip-plan/draft?masterPlanNo=${encodeURIComponent(
      selectedMasterPlanNo
    )}&departmentId=${encodeURIComponent(activeDeptId)}`;
  }, [selectedMasterPlanNo, activeDeptId]);

  const {
    data: draftPayload,
    isLoading: draftLoading,
    mutate: mutateDraft,
  } = useSWR(draftUrl, fetcher, { revalidateOnFocus: false });

  const draftLinesData = useMemo(() => draftPayload?.data?.lines || [], [draftPayload]);
  const isLocked = Boolean(draftPayload?.meta?.subplanLocked);
  const existingSubplan = draftPayload?.meta?.existingSubplan || null;

  // Initialize draft lines local state
  useEffect(() => {
    if (draftLinesData) {
      setDraftLines(
        draftLinesData.map((line) => ({
          ...line,
          tempId: line.id || `line-${Date.now()}-${Math.random()}`,
        }))
      );
      // Open all accordions by default on load
      const sectionsMap = {};
      draftLinesData.forEach((line) => {
        const secName = line.sourceSectionName || "แผนกย่อยหลัก";
        sectionsMap[secName] = true;
      });
      setOpenSections(sectionsMap);
    }
  }, [draftLinesData]);

  // 4. Fetch the computed WIP shortages and suggestions (preview)
  const [previewData, setPreviewData] = useState(null);
  const loadPreviewData = useCallback(async () => {
    if (!selectedMasterPlanNo || !activeDeptId) return;
    try {
      const res = await fetchJson("/api/production-planning/explosion/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterPlanNo: selectedMasterPlanNo,
          departmentId: activeDeptId,
          wipDraftLines: [],
        }),
      });
      if (res.ok) {
        setPreviewData(res.data?.data || null);
      }
    } catch (e) {
      console.warn("Failed to load explosion preview", e);
    }
  }, [selectedMasterPlanNo, activeDeptId]);

  useEffect(() => {
    loadPreviewData();
  }, [loadPreviewData]);


  // 5. Fetch shifts for the selected department
  const sectionShiftKey = activeDeptId
    ? `/api/production-section-shifts?departmentId=${encodeURIComponent(activeDeptId)}`
    : null;
  const { data: sectionShiftsData } = useSWR(sectionShiftKey, fetcher, {
    revalidateOnFocus: false,
  });

  const sectionOptions = useMemo(() => sectionShiftsData?.sections || [], [sectionShiftsData]);

  useEffect(() => {
    if (sectionOptions.length > 0 && !activeSection) {
      setActiveSection(sectionOptions[0]);
    }
  }, [sectionOptions, activeSection]);

  const availableShifts = useMemo(() => {
    const list = [];
    const sections = sectionShiftsData?.sections || [];
    sections.forEach((sec) => {
      const shifts = sec.shifts || [];
      shifts.forEach((sh) => {
        if (!list.some((s) => s.shiftCode === sh.shiftCode)) {
          list.push(sh);
        }
      });
    });
    // Fallbacks if no shifts configured
    if (list.length === 0) {
      list.push(
        { shiftId: "S1", shiftCode: "A", shiftName: "กะเช้า" },
        { shiftId: "S2", shiftCode: "B", shiftName: "กะบ่าย" }
      );
    }
    return list;
  }, [sectionShiftsData]);

  const getShiftsForSection = useCallback((sectionId) => {
    const section = sectionOptions.find((item) => String(item.id) === String(sectionId));
    return section?.shifts?.length ? section.shifts : availableShifts;
  }, [sectionOptions, availableShifts]);

  // 6. Fetch all WIP SKUs from SKU catalog
  const { data: skuCatalogData } = useSWR(
    "/api/production-planning/schedule/sku-catalog",
    fetcher,
    { revalidateOnFocus: false }
  );

  const wipSkuCatalog = useMemo(() => {
    const items = skuCatalogData?.data || [];
    return items.filter(
      (item) =>
        String(item?.iccat_code || "").trim() === "03" ||
        String(item?.sku_code || "").startsWith("WIP")
    );
  }, [skuCatalogData]);

  // 7. Fetch all WIP products with limits to get batch size conversion factors
  const { data: wipProductsData } = useSWR(
    "/api/production-planning/wip-products?limit=1000",
    fetcher,
    { revalidateOnFocus: false }
  );
  const wipProducts = useMemo(() => wipProductsData?.data || [], [wipProductsData]);

  const wipCatalogMetaBySku = useMemo(() => {
    const map = new Map();
    wipProducts.forEach((row) => {
      const skuCode = String(row?.skuCode || row?.sku_code || "").trim().toUpperCase();
      if (!skuCode) return;
      const unitsPerBatch = Number(row?.unitsPerBatch ?? row?.units_per_batch ?? 0);
      const batchMode = String(row?.wipQtyInputMode || row?.wip_qty_input_mode || "").trim().toLowerCase() === "batch";
      map.set(skuCode, {
        factor: batchMode && unitsPerBatch > 0 ? unitsPerBatch : 1,
        displayUnit: String(row?.uomName || row?.uom_name || row?.uom || "").trim() || "kg",
        planningUnit: batchMode ? "ชุด" : (String(row?.uomName || row?.uom_name || row?.uom || "").trim() || "kg"),
      });
    });
    return map;
  }, [wipProducts]);

  const getWipMeta = useCallback((skuCode) => {
    const code = String(skuCode || "").trim().toUpperCase();
    const meta = wipCatalogMetaBySku.get(code);
    if (meta) return meta;
    return {
      factor: 1,
      displayUnit: "kg",
      planningUnit: "kg",
    };
  }, [wipCatalogMetaBySku]);

  // Group WIP local draft lines by sourceSectionName
  const groupedWipSections = useMemo(() => {
    const map = new Map();
    draftLines.forEach((line) => {
      const secName = line.sourceSectionName || "แผนกย่อยหลัก";
      if (!map.has(secName)) map.set(secName, []);
      map.get(secName).push(line);
    });
    return Array.from(map.entries()).map(([name, rows]) => ({ name, rows }));
  }, [draftLines]);

  // Filter or pre-populate grouped WIP sections based on active section from Weekly Matrix
  const displayedGroupedWipSections = useMemo(() => {
    if (!activeSection) return groupedWipSections;

    const activeSecName = String(activeSection.name || "").trim().toLowerCase();
    const matched = groupedWipSections.filter(
      (g) => String(g.name || "").trim().toLowerCase() === activeSecName
    );

    if (matched.length > 0) return matched;

    // If no draft lines exist for this section yet, we can return an empty group for it so the user can add rows!
    return [{ name: activeSection.name, rows: [] }];
  }, [groupedWipSections, activeSection]);

  // Toggle Accordion section
  const toggleSection = (sectionName) => {
    setOpenSections((prev) => ({
      ...prev,
      [sectionName]: !prev[sectionName],
    }));
  };

  // Inline inputs change handlers
  const handleLineChange = (tempId, field, value) => {
    setDraftLines((prev) =>
      prev.map((line) => {
        if (line.tempId !== tempId) return line;

        const updated = { ...line, [field]: value };
        // Auto fill SKU name and unit if skuCode changed
        if (field === "skuCode") {
          const matchSku = wipSkuCatalog.find((sku) => sku.sku_code === value);
          if (matchSku) {
            updated.skuName = matchSku.sku_name || "";
            updated.unit = matchSku.uom_name || matchSku.uom || "kg";
          }
        }
        return updated;
      })
    );
  };

  const handleSelectWipFromPicker = (selectedWip) => {
    if (!wipPickerTempId) return;
    setDraftLines((prev) =>
      prev.map((line) => {
        if (line.tempId !== wipPickerTempId) return line;
        return {
          ...line,
          skuCode: selectedWip.skuCode,
          skuName: selectedWip.name,
          unit: selectedWip.unit || line.unit || "kg",
        };
      })
    );
    setWipPickerTempId(null);
  };

  // Add new WIP line
  const handleAddWipRow = (sectionName) => {
    const targetSection = sectionOptions.find(
      (section) => String(section.name || "").trim() === String(sectionName || "").trim()
    ) || activeSection;
    const sectionShifts = getShiftsForSection(targetSection?.id);
    const defaultShift = sectionShifts[0] || {};
    const matchedSecDefId =
      targetSection && String(targetSection.name).trim().toLowerCase() === String(sectionName || "").trim().toLowerCase()
        ? targetSection.id
        : null;

    const newRow = {
      tempId: `line-${Date.now()}-${Math.random()}`,
      workDate: dateFrom || new Date().toISOString().slice(0, 10),
      skuCode: "",
      skuName: "",
      plannedQty: 0,
      unit: "kg",
      shiftId: defaultShift.shiftId || null,
      shiftCode: defaultShift.shiftCode || "A",
      shiftName: defaultShift.shiftName || "กะเช้า",
      sourceSectionDefId: matchedSecDefId,
      sourceSectionName: sectionName,
      workstreamCode: null,
      note: "",
    };
    setDraftLines((prev) => [...prev, newRow]);
    setOpenSections((prev) => ({ ...prev, [sectionName]: true }));
  };

  // Remove WIP line
  const handleRemoveWipRow = (tempId) => {
    setDraftLines((prev) => prev.filter((line) => line.tempId !== tempId));
  };

  // Trigger reactive update (Preview recalculation & sync)
  const triggerRecalculate = async () => {
    if (!selectedMasterPlanNo || !activeDeptId) return;
    setRecalculating(true);
    setNotification({ type: "", text: "" });
    try {
      const linesPayload = draftLines
        .filter((l) => l.skuCode && Number(l.plannedQty) > 0)
        .map((l) => ({
          workDate: l.workDate,
          skuCode: l.skuCode,
          plannedQty: Number(l.plannedQty),
          unit: l.unit,
          shiftId: l.shiftId,
          shiftCode: l.shiftCode,
          shiftName: l.shiftName,
          sourceSectionDefId: l.sourceSectionDefId,
          sourceSectionName: l.sourceSectionName,
          note: l.note || "",
        }));

      const res = await fetchJson("/api/production-planning/explosion/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterPlanNo: selectedMasterPlanNo,
          departmentId: activeDeptId,
          wipDraftLines: linesPayload,
          ignorePersistedDraft: true,
        }),
      });

      if (res.ok) {
        setPreviewData(res.data?.data || null);
        setNotification({ type: "success", text: "อัปเดตและคำนวณสูตรความต้องการวัตถุดิบเสร็จสิ้น" });
      } else {
        setNotification({ type: "error", text: res.error?.message || "คำนวณล้มเหลว" });
      }
    } catch (e) {
      setNotification({ type: "error", text: e.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ" });
    } finally {
      setRecalculating(false);
    }
  };

  // Save draft lines
  const handleSaveWipSubplan = async () => {
    if (!selectedMasterPlanNo || !activeDeptId) return;
    setSaving(true);
    setNotification({ type: "", text: "" });
    try {
      const lines = draftLines
        .filter((l) => l.skuCode && Number(l.plannedQty) > 0)
        .map((l) => ({
          workDate: l.workDate,
          skuCode: l.skuCode,
          plannedQty: Number(l.plannedQty),
          unit: l.unit,
          shiftId: l.shiftId,
          shiftCode: l.shiftCode,
          shiftName: l.shiftName,
          sourceSectionDefId: l.sourceSectionDefId,
          sourceSectionName: l.sourceSectionName,
          note: l.note || "",
        }));

      const res = await fetchJson("/api/production-planning/wip-plan/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterPlanNo: selectedMasterPlanNo,
          departmentId: activeDeptId,
          lines,
        }),
      });

      if (res.ok) {
        setNotification({ type: "success", text: "บันทึกข้อมูลร่างแผนย่อย WIP และระเบิดความต้องการวัตถุดิบเรียบร้อยแล้ว" });
        await mutateDraft();
        await loadPreviewData();
      } else {
        setNotification({ type: "error", text: res.error?.message || "ไม่สามารถบันทึกได้" });
      }
    } catch (e) {
      setNotification({ type: "error", text: e.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ" });
    } finally {
      setSaving(false);
    }
  };

  // Confirm subplan (locks editing)
  const handleConfirmSubplan = async () => {
    if (!selectedMasterPlanNo || !activeDeptId) return;
    if (
      !window.confirm(
        "คุณต้องการยืนยันแผนย่อย WIP นี้ใช่หรือไม่? การยืนยันนี้จะทำเอกสารเบิกจ่ายวัตถุดิบและระบบจะล็อกการปรับตัวเลขแผนนี้ถาวร"
      )
    ) {
      return;
    }

    setConfirming(true);
    setNotification({ type: "", text: "" });
    try {
      // Step 1: Save current lines first
      const lines = draftLines
        .filter((l) => l.skuCode && Number(l.plannedQty) > 0)
        .map((l) => ({
          workDate: l.workDate,
          skuCode: l.skuCode,
          plannedQty: Number(l.plannedQty),
          unit: l.unit,
          shiftId: l.shiftId,
          shiftCode: l.shiftCode,
          shiftName: l.shiftName,
          sourceSectionDefId: l.sourceSectionDefId,
          sourceSectionName: l.sourceSectionName,
          note: l.note || "",
        }));

      await fetchJson("/api/production-planning/wip-plan/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterPlanNo: selectedMasterPlanNo,
          departmentId: activeDeptId,
          lines,
        }),
      });

      // Step 2: Call confirm subplan API
      const res = await fetchJson("/api/production-planning/wip-plan/confirmed-subplans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          masterPlanNo: selectedMasterPlanNo,
          departmentId: activeDeptId,
        }),
      });

      if (res.ok) {
        setNotification({ type: "success", text: "ยืนยันแผนผลิตย่อยสำเร็จแล้ว ข้อมูลแผนถูกล็อกเพื่อเตรียมความพร้อมสำหรับขั้นตอนการเบิกวัตถุดิบถัดไป" });
        await mutateDraft();
        await loadPreviewData();
      } else {
        setNotification({ type: "error", text: res.error?.message || "การยืนยันล้มเหลว" });
      }
    } catch (e) {
      setNotification({ type: "error", text: e.message || "เกิดข้อผิดพลาดในการเชื่อมต่อ" });
    } finally {
      setConfirming(false);
    }
  };

  const activeDeptName = useMemo(() => {
    return departments.find((d) => d.id === activeDeptId)?.name || "";
  }, [departments, activeDeptId]);

  const matrixLines = useMemo(() => {
    const validLines = draftLines.filter((line) => line.skuCode && Number(line.plannedQty) > 0);
    if (!activeSection) return validLines;
    return validLines.filter((line) => (
      String(line.sourceSectionDefId || "") === String(activeSection.id || "")
      || String(line.sourceSectionName || "").trim() === String(activeSection.name || "").trim()
    ));
  }, [draftLines, activeSection]);

  const matrixColumns = useMemo(() => matrixLines.map((line, index) => ({
    ...line,
    key: `${line.workDate}|${line.shiftCode || line.shiftId || ""}|${line.skuCode}|${index}`,
    lookupKey: `${line.workDate}|${line.shiftCode || line.shiftId || ""}|${line.skuCode}`,
  })), [matrixLines]);

  const materialRows = useMemo(() => {
    const byLine = previewData?.rawPreviewByLine || [];
    const rowMap = new Map();
    matrixColumns.forEach((column) => {
      const trace = byLine.find((line) => (
        `${line.workDate}|${line.shiftCode || line.shiftId || ""}|${line.skuCode}` === column.lookupKey
      ));
      (trace?.materials || []).forEach((material) => {
        const key = `${material.materialSkuCode}|${material.materialGoodsCode || ""}`;
        if (!rowMap.has(key)) {
          rowMap.set(key, {
            code: material.materialGoodsCode || material.materialSkuCode,
            name: material.materialName || material.materialSkuCode,
            unit: material.unit || "unit",
            values: {},
          });
        }
        const row = rowMap.get(key);
        row.values[column.key] = Number(material.requiredQty || 0);
      });
    });
    if (!rowMap.size && Array.isArray(previewData?.rawPreview)) {
      previewData.rawPreview.forEach((material) => {
        const key = `${material.materialSkuCode}|${material.materialGoodsCode || ""}`;
        rowMap.set(key, {
          code: material.materialGoodsCode || material.materialSkuCode,
          name: material.materialName || material.materialSkuCode,
          unit: material.unit || "unit",
          values: {},
          aggregate: Number(material.requiredQty || 0),
        });
      });
    }
    return Array.from(rowMap.values()).sort((a, b) => String(a.name).localeCompare(String(b.name), "th"));
  }, [previewData, matrixColumns]);

  const plannedTotal = useMemo(
    () => matrixLines.reduce((sum, line) => sum + Number(line.plannedQty || 0), 0),
    [matrixLines]
  );

  const selectedSectionName = activeSection?.name || "ทุก Section";

  if (false) return (
    <DepartmentPlanningMatrix
      activeDeptId={activeDeptId}
      activeDeptName={activeDeptName}
      departments={departments}
      selectedMasterPlanNo={selectedMasterPlanNo}
      masterPlans={masterPlans}
      plansLoading={plansLoading}
      dateFrom={dateFrom}
      dateTo={dateTo}
      isLocked={isLocked}
      existingSubplan={existingSubplan}
      notification={notification}
      setNotification={setNotification}
      handleMasterPlanChange={handleMasterPlanChange}
      setActiveDeptId={setActiveDeptId}
      sectionOptions={sectionOptions}
      activeSection={activeSection}
      setActiveSection={setActiveSection}
      selectedSectionName={selectedSectionName}
      availableShifts={availableShifts}
      getShiftsForSection={getShiftsForSection}
      draftLines={draftLines}
      draftLoading={draftLoading}
      matrixColumns={matrixColumns}
      materialRows={materialRows}
      plannedTotal={plannedTotal}
      showWipEditor={showWipEditor}
      setShowWipEditor={setShowWipEditor}
      showSchedule={showSchedule}
      setShowSchedule={setShowSchedule}
      wipSkuCatalog={wipSkuCatalog}
      getWipMeta={getWipMeta}
      handleLineChange={handleLineChange}
      handleAddWipRow={handleAddWipRow}
      handleRemoveWipRow={handleRemoveWipRow}
      triggerRecalculate={triggerRecalculate}
      handleSaveWipSubplan={handleSaveWipSubplan}
      handleConfirmSubplan={handleConfirmSubplan}
      saving={saving}
      confirming={confirming}
      recalculating={recalculating}
    />
  );
  if (true) {
  return (
    <div className="min-h-screen bg-[#fafafa] text-[#181818] font-sans antialiased">
      {/* 1. Header & Controls Zone */}
      <section className="bg-[#102C57] px-6 py-6 text-white border-b-2 border-[#d4af37]">
        <div className="mx-auto max-w-[1760px]">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#d4af37]">
                  Planning & Operations
                </span>
                <span className="h-[2px] w-8 bg-white/20" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-white uppercase sm:text-3xl">
                Integrated Production Control Center
              </h1>
              <p className="text-xs text-white/70">
                ระบบจัดการและควบคุมแผนผลิตกึ่งสำเร็จรูปและรายงานความต้องการวัตถุดิบ
              </p>
            </div>

            {/* Global Controls Grid */}
            <div className="flex flex-wrap items-center gap-3">
              {/* Master Plan Selector */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-[#d4af37]">
                  SELECT MASTER PLAN / เลือกแผนหลัก
                </span>
                <select
                  value={selectedMasterPlanNo}
                  onChange={(e) => handleMasterPlanChange(e.target.value)}
                  className="h-10 bg-black/30 border border-white/20 text-white text-xs px-3 font-bold rounded-[2px] focus:outline-none focus:border-[#d4af37]"
                >
                  <option value="" disabled className="bg-[#102C57] text-white">
                    -- เลือกแผนหลัก --
                  </option>
                  {masterPlans.map((p) => (
                    <option key={p.masterPlanNo} value={p.masterPlanNo} className="bg-[#102C57] text-white">
                      {p.masterPlanNo} ({formatDate(p.periodStart)} - {formatDate(p.periodEnd)})
                    </option>
                  ))}
                </select>
              </div>

              {/* Weekly Date Range Viewer */}
              <div className="flex flex-col gap-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                  DATE RANGE / ช่วงวันผลิต
                </span>
                <div className="h-10 flex items-center bg-black/20 border border-white/10 text-white text-xs px-4 font-bold rounded-[2px]">
                  <Calendar size={14} className="mr-2 text-[#d4af37]" />
                  {dateFrom ? `${formatDate(dateFrom)} - ${formatDate(dateTo)}` : "-"}
                </div>
              </div>

              {/* Status Indicators */}
              <div className="flex items-center gap-2 mt-4 sm:mt-0">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-white/50">
                    PLAN STATUS / สถานะแผนผลิต
                  </span>
                  <div
                    className={`h-10 px-4 flex items-center text-xs font-bold rounded-[2px] border ${
                      isLocked
                        ? "bg-[#F13A2C]/10 border-[#F13A2C]/30 text-[#F13A2C]"
                        : "bg-[#03904A]/10 border-[#03904A]/30 text-[#03904A]"
                    }`}
                  >
                    {isLocked ? (
                      <>
                        <Lock size={12} className="mr-1.5" />
                        LOCKED / ยืนยันแผนแล้ว
                      </>
                    ) : (
                      <>
                        <Unlock size={12} className="mr-1.5" />
                        OPEN / แก้ไขได้
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1760px] p-6 space-y-6">
        {/* Alerts & Notifications */}
        {notification.text && (
          <div
            className={`border-l-4 p-4 text-xs font-bold rounded-[2px] flex items-center justify-between ${
              notification.type === "success"
                ? "bg-[#03904A]/10 border-[#03904A] text-[#03904A]"
                : "bg-[#F13A2C]/10 border-[#F13A2C] text-[#F13A2C]"
            }`}
          >
            <div className="flex items-center gap-2">
              <AlertCircle size={14} />
              <span>{notification.text}</span>
            </div>
            <button onClick={() => setNotification({ type: "", text: "" })} className="hover:opacity-75">
              ปิด
            </button>
          </div>
        )}

        {isLocked && (
          <div className="border border-[#d4af37] bg-[#d4af37]/5 p-4 rounded-[2px] flex gap-3 text-xs text-[#8a6d1c]">
            <Lock size={16} className="shrink-0 mt-0.5" />
            <div>
              <p className="font-bold uppercase tracking-wide">แผนผลิตนี้ถูกล็อกเนื่องจากยืนยันแผนผลิตย่อยสำเร็จแล้ว</p>
              <p className="mt-1">
                ข้อมูลปริมาณผลิตถูกล็อกเพื่อเตรียมออกใบเบิกจ่ายวัตถุดิบในขั้นตอนถัดไป ห้ามแก้ไขตัวเลขแผนผลิตเพื่อป้องกันความคลาดเคลื่อนของยอดวัตถุดิบ
              </p>
            </div>
          </div>
        )}

        {/* 2. Department Horizontal Tabs */}
        <div className="bg-white border border-slate-200 rounded-[2px] p-1 flex overflow-x-auto gap-1">
          {departments.map((d) => {
            const isActive = d.id === activeDeptId;
            return (
              <button
                key={d.id}
                onClick={() => {
                  setActiveDeptId(d.id);
                  setNotification({ type: "", text: "" });
                }}
                className={`h-11 px-6 whitespace-nowrap text-xs font-bold uppercase tracking-wider transition-all duration-150 rounded-[2px] flex items-center justify-center gap-2 ${
                  isActive
                    ? "bg-[#102C57] text-[#d4af37]"
                    : "text-slate-950 font-bold hover:bg-slate-100 hover:text-[#102C57]"
                }`}
              >
                <Boxes size={14} />
                {d.name}
              </button>
            );
          })}
        </div>

        {/* 3. Main Dashboard Workspace Layout */}
        {activeDeptId ? (
          <div className="space-y-6">
            {/* 3.1. Weekly Matrix Grid (แผนหลัก FG) at the top */}
            <div className="bg-white border border-slate-200 rounded-[2px] overflow-hidden shadow-sm">
              <div className="bg-[#102C57] px-4 py-3 flex items-center justify-between border-b border-slate-200">
                <div className="flex items-center gap-2">
                  <FileText className="text-[#d4af37]" size={16} />
                  <span className="text-xs font-bold uppercase tracking-widest text-[#d4af37]">
                    1. FG Weekly Production Matrix / ตารางวางแผนผลิตหลักรายกะ
                  </span>
                </div>
                <span className="text-[10px] text-white/50 font-semibold tracking-wider">
                  WEEKLY MATRIX CONTROLLER
                </span>
              </div>
              <div className="p-1">
                {/* Embed the familiar production schedule client */}
                {selectedMasterPlanNo && (
                  <ProductionScheduleClient
                    deptId={activeDeptId}
                    masterPlanNo={selectedMasterPlanNo}
                    dateFrom={dateFrom}
                    dateTo={dateTo}
                    embedded={true}
                    readOnly={isLocked}
                    onSectionChange={(idx, section) => {
                      setActiveSection(section);
                    }}
                  />
                )}
              </div>
            </div>

            {/* 3.2. WIP Subplans Grouped by collapsible sections */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white px-4 py-3 border border-slate-200 rounded-[2px]">
                <div className="flex items-center gap-2">
                  <Layers className="text-[#102C57]" size={16} />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#102C57]">
                    2. Work-In-Progress (WIP) Subplans / การปรับปรุงแผนย่อย WIP ({activeDeptName})
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={triggerRecalculate}
                    disabled={recalculating || isLocked}
                    className="h-8 px-4 flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-wider border border-[#102C57] text-[#102C57] rounded-[2px] transition hover:bg-[#102C57]/5 disabled:opacity-50"
                    title="ระเบิด BOM ค้นหาความต้องการวัตถุดิบและปรับยอดแนะนำอัตโนมัติ"
                  >
                    <RefreshCw size={11} className={recalculating ? "animate-spin" : ""} />
                    {recalculating ? "กำลังคำนวณ..." : "คำนวณความต้องการสูตร BOM"}
                  </button>
                </div>
              </div>

              {draftLoading ? (
                <div className="flex items-center justify-center p-12 bg-white border border-slate-200 rounded-[2px] text-xs text-slate-950 font-bold">
                  <RefreshCw className="animate-spin mr-2" size={14} />
                  กำลังโหลดข้อมูลแผนย่อย WIP...
                </div>
              ) : displayedGroupedWipSections.length === 0 ? (
                <div className="bg-white border border-slate-200 p-8 rounded-[2px] text-center text-slate-950 font-bold text-xs">
                  ไม่พบรายการกลุ่มงานของแผนกย่อยในแผนนี้ กดเครื่องมือคำนวณความต้องการสูตร BOM หรือเพิ่มรายการเพื่อปรับแผนผลิตย่อย
                  {!isLocked && (
                    <button
                      onClick={() => handleAddWipRow("แผนกย่อยหลัก")}
                      className="mt-3 mx-auto h-8 px-4 bg-[#102C57] text-[#d4af37] text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 rounded-[2px] hover:bg-[#102C57]/90"
                    >
                      <Plus size={12} /> Add First WIP Row / เพิ่มรายการใหม่
                    </button>
                  )}
                </div>
              ) : (
                displayedGroupedWipSections.map(({ name: sectionName, rows: wipRows }) => {
                  const isOpen = openSections[sectionName] !== false;
                  return (
                    <div
                      key={sectionName}
                      className="bg-white border border-slate-200 rounded-[2px] overflow-hidden shadow-sm transition-all duration-150"
                    >
                      {/* Section Header Accordion Trigger */}
                      <button
                        onClick={() => toggleSection(sectionName)}
                        className="w-full h-11 px-4 bg-slate-50 flex items-center justify-between border-b border-slate-200 hover:bg-slate-100 transition-colors"
                      >
                        <span className="text-xs font-bold text-[#102C57] uppercase tracking-wide">
                          {sectionName} ({wipRows.length} รายการ)
                        </span>
                        {isOpen ? (
                          <ChevronUp size={14} className="text-slate-950 font-bold" />
                        ) : (
                          <ChevronDown size={14} className="text-slate-950 font-bold" />
                        )}
                      </button>

                      {/* Section Content */}
                      {isOpen && (
                        <div className="p-4 overflow-x-auto">
                          <table className="w-full min-w-[960px] table-fixed border-collapse text-left text-xs">
                            <thead>
                              <tr className="border-b border-slate-200 text-slate-950 uppercase tracking-widest font-extrabold bg-slate-50/50">
                                <th className="py-3 px-3 text-[10px] text-slate-600 font-bold uppercase tracking-wider w-[11%] min-w-[90px]">กะการผลิต (Shift)</th>
                                <th className="py-3 px-3 text-[10px] text-slate-600 font-bold uppercase tracking-wider w-[14%] min-w-[120px]">รหัสสินค้า WIP</th>
                                <th className="py-3 px-3 text-[10px] text-slate-600 font-bold uppercase tracking-wider w-[20%] min-w-[185px]">ชื่อชิ้นงาน WIP</th>
                                <th className="py-3 px-3 text-[10px] text-slate-600 font-bold uppercase tracking-wider text-right w-[13%] min-w-[110px]">จำนวนปรับปรุง (ชุด)</th>
                                <th className="py-3 px-3 text-[10px] text-slate-600 font-bold uppercase tracking-wider w-[7%] min-w-[60px] text-center">หน่วย</th>
                                <th className="py-3 px-3 text-[10px] text-slate-600 font-bold uppercase tracking-wider text-right w-[12%] min-w-[110px]">น้ำหนักจริง (kg)</th>
                                <th className="py-3 px-3 text-[10px] text-slate-600 font-bold uppercase tracking-wider w-[19%] min-w-[170px]">หมายเหตุ</th>
                                {!isLocked && <th className="py-3 px-3 text-[10px] w-[4%] min-w-[40px] text-right"></th>}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {wipRows.length === 0 ? (
                                <tr>
                                  <td colSpan={isLocked ? 7 : 8} className="py-8 px-3 text-center text-slate-950 font-bold">
                                    ยังไม่มีรายการผลิตย่อยในกลุ่มงาน {sectionName} สำหรับแผนกนี้
                                    {!isLocked && (
                                      <button
                                        onClick={() => handleAddWipRow(sectionName)}
                                        className="mt-2 mx-auto h-7 px-3 bg-[#102C57] text-[#d4af37] text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 rounded-[2px] hover:bg-[#102C57]/90"
                                      >
                                        <Plus size={10} /> เพิ่มรายการ WIP
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ) : (
                                wipRows.map((row) => {
                                  const meta = getWipMeta(row.skuCode);
                                  const actualWeight = Number(row.plannedQty || 0) * meta.factor;
                                  
                                  return (
                                    <tr key={row.tempId} className="hover:bg-slate-50/40 transition-colors duration-150">
                                      {/* 1. Shift Select */}
                                      <td className="py-2.5 px-3">
                                        <select
                                          disabled={isLocked}
                                          value={row.shiftCode || "A"}
                                          onChange={(e) => {
                                            const code = e.target.value;
                                            const matched = availableShifts.find((s) => s.shiftCode === code);
                                            handleLineChange(row.tempId, "shiftCode", code);
                                            if (matched) {
                                              handleLineChange(row.tempId, "shiftId", matched.shiftId);
                                              handleLineChange(row.tempId, "shiftName", matched.shiftName);
                                            }
                                          }}
                                          className="h-8 w-full bg-white border border-slate-200 text-xs px-2 rounded-[2px] focus:outline-none focus:border-[#102C57] focus:ring-1 focus:ring-[#102C57]/20 disabled:bg-slate-50 disabled:text-slate-950 disabled:opacity-100 font-bold text-slate-950 transition-all"
                                        >
                                          {availableShifts.map((s) => (
                                            <option key={s.shiftId} value={s.shiftCode}>
                                              {s.shiftName} ({s.shiftCode})
                                            </option>
                                          ))}
                                        </select>
                                      </td>

                                      {/* 2. WIP SKU Selector */}
                                      <td className="py-2.5 px-3 font-mono font-bold text-slate-950">
                                        {isLocked || row.id ? (
                                          <span>{row.skuCode || "-"}</span>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => setWipPickerTempId(row.tempId)}
                                            className="h-8 w-full bg-white border border-slate-200 text-xs px-2.5 rounded-[2px] hover:border-[#102C57] focus:outline-none font-semibold text-slate-800 flex items-center justify-between gap-1 shadow-sm transition-all"
                                          >
                                            <span className={row.skuCode ? "font-bold text-[#102C57] font-mono" : "text-slate-400 font-sans font-normal"}>
                                              {row.skuCode || "ค้นหาและเลือกรหัส WIP..."}
                                            </span>
                                            <Search size={13} className="text-slate-400 shrink-0" />
                                          </button>
                                        )}
                                      </td>

                                      {/* 3. WIP Name */}
                                      <td className="py-2.5 px-3 font-bold text-slate-950 truncate">
                                        {row.skuName || "-"}
                                      </td>

                                      {/* 5. Adjust quantity (Planned Qty) */}
                                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-950">
                                        <input
                                          type="number"
                                          disabled={isLocked}
                                          value={row.plannedQty === 0 ? "" : row.plannedQty}
                                          onChange={(e) =>
                                            handleLineChange(
                                              row.tempId,
                                              "plannedQty",
                                              e.target.value === "" ? 0 : Number(e.target.value)
                                            )
                                          }
                                          className="h-8 w-full text-right bg-white border border-slate-200 text-xs px-2.5 font-bold font-mono rounded-[2px] focus:outline-none focus:border-[#102C57] focus:ring-1 focus:ring-[#102C57]/20 disabled:bg-slate-50 disabled:text-slate-950 disabled:opacity-100 text-slate-950 transition-all"
                                          placeholder="0.00"
                                        />
                                      </td>

                                      {/* 6. Unit */}
                                      <td className="py-2.5 px-3 font-bold text-slate-950 text-center">{meta.planningUnit}</td>

                                      {/* 7. Actual Weight (kg) */}
                                      <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-955">
                                        {formatNumber(actualWeight, 2)} <span className="text-[10px] text-slate-950 font-bold">{meta.displayUnit}</span>
                                      </td>

                                      {/* 8. Note */}
                                      <td className="py-2.5 px-3">
                                        <input
                                          type="text"
                                          disabled={isLocked}
                                          value={row.note || ""}
                                          onChange={(e) => handleLineChange(row.tempId, "note", e.target.value)}
                                          className="h-8 w-full bg-white border border-slate-200 text-xs px-2.5 text-slate-950 font-bold rounded-[2px] focus:outline-none focus:border-[#102C57] disabled:bg-slate-50 disabled:text-slate-950 disabled:opacity-100 placeholder-slate-950 placeholder:font-bold"
                                          placeholder="หมายเหตุประกอบ..."
                                        />
                                      </td>

                                      {/* Actions (Delete) */}
                                      {!isLocked && (
                                        <td className="py-2.5 text-right">
                                          <button
                                            onClick={() => handleRemoveWipRow(row.tempId)}
                                            className="p-1.5 text-slate-950 hover:text-[#F13A2C] font-bold transition-colors"
                                            title="ลบบรรทัด"
                                          >
                                            <Trash2 size={13} />
                                          </button>
                                        </td>
                                      )}
                                    </tr>
                                  );
                                })
                              )}
                            </tbody>
                          </table>

                          {/* Add Row Button */}
                          {!isLocked && (
                            <button
                              onClick={() => handleAddWipRow(sectionName)}
                              className="mt-3 h-8 px-3 border border-dashed border-slate-300 text-[10px] font-extrabold uppercase tracking-wider text-slate-950 hover:border-[#102C57] hover:text-[#102C57] flex items-center gap-1 transition-all rounded-[2px]"
                            >
                              <Plus size={11} />
                              Add WIP Item / เพิ่มตัวเลือกผลิต WIP กึ่งสำเร็จรูป
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* 4. Action Control Center Bar */}
            {!isLocked && (
              <div className="bg-slate-900 border border-slate-800 p-4 rounded-[2px] flex flex-col md:flex-row items-center justify-between gap-4 shadow-md">
                <div className="text-white space-y-0.5">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#d4af37]">
                    Production Control Panel / แผงบันทึกการทำงานหลัก
                  </h4>
                  <p className="text-[10px] text-white/50">
                    โปรดกดบันทึกเพื่อบันทึกแผนผลิตย่อย WIP และส่งยอดคำนวณวัตถุดิบเข้าสู่หน้าพรีวิวใบเบิกแยกห้องโดยอัตโนมัติ
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    onClick={handleSaveWipSubplan}
                    disabled={saving}
                    className="h-10 px-6 bg-white text-slate-900 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 rounded-[2px] transition hover:bg-[#d4af37] hover:text-slate-900 focus:outline-none disabled:opacity-50"
                  >
                    <Save size={13} />
                    {saving ? "Saving..." : "Save WIP Draft / บันทึกแผนผลิตย่อย WIP"}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-20 bg-white border border-slate-200 rounded-[2px] text-slate-950 font-bold text-xs">
            <Boxes size={28} className="text-slate-950 mb-2" />
            กรุณาเลือกแผนกเพื่อตรวจสอบและแสดงแผงควบคุมการผลิต
          </div>
        )}
      </div>
    </div>
  );
  }
}

function formatMatrixDate(dateString) {
  if (!dateString) return "-";
  const date = new Date(`${dateString}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateString;
  return date.toLocaleDateString("th-TH", { day: "2-digit", month: "2-digit" });
}

function DepartmentPlanningMatrix({
  activeDeptId,
  activeDeptName,
  departments,
  selectedMasterPlanNo,
  masterPlans,
  plansLoading,
  dateFrom,
  dateTo,
  isLocked,
  existingSubplan,
  notification,
  setNotification,
  handleMasterPlanChange,
  setActiveDeptId,
  sectionOptions,
  activeSection,
  setActiveSection,
  selectedSectionName,
  availableShifts,
  getShiftsForSection,
  draftLines,
  draftLoading,
  matrixColumns,
  materialRows,
  plannedTotal,
  showWipEditor,
  setShowWipEditor,
  showSchedule,
  setShowSchedule,
  wipSkuCatalog,
  getWipMeta,
  handleLineChange,
  handleAddWipRow,
  handleRemoveWipRow,
  triggerRecalculate,
  handleSaveWipSubplan,
  handleConfirmSubplan,
  saving,
  confirming,
  recalculating,
}) {
  const currentSectionShifts = activeSection ? getShiftsForSection(activeSection.id) : availableShifts;
  const sectionRows = draftLines.filter((line) => {
    if (!activeSection) return true;
    return String(line.sourceSectionDefId || "") === String(activeSection.id || "")
      || String(line.sourceSectionName || "").trim() === String(activeSection.name || "").trim();
  });
  const totalMaterials = materialRows.length;

  return (
    <div className="min-h-screen bg-[#f7f8fa] text-[#132238] font-sans antialiased">
      <header className="bg-[#102C57] text-white border-b-2 border-[#d4af37]">
        <div className="flex items-center justify-between px-5 py-3">
          <h1 className="text-xl font-extrabold tracking-tight">ตารางวัตถุดิบตามแผน WIP</h1>
          <button
            type="button"
            onClick={() => setShowWipEditor(true)}
            className="h-9 px-4 border border-white/70 text-white text-xs font-bold rounded-[2px] flex items-center gap-2 hover:bg-white/10"
          >
            <Layers size={14} /> เลือก WIP
          </button>
        </div>
      </header>

      <main className="p-5 space-y-4">
        {notification.text && (
          <div className={`flex items-center justify-between border-l-4 px-4 py-3 text-xs font-bold ${notification.type === "success" ? "border-[#03904A] bg-emerald-50 text-emerald-800" : "border-[#F13A2C] bg-red-50 text-red-800"}`}>
            <span className="flex items-center gap-2"><AlertCircle size={14} />{notification.text}</span>
            <button type="button" onClick={() => setNotification({ type: "", text: "" })}>ปิด</button>
          </div>
        )}

        <section className="grid grid-cols-1 gap-3 xl:grid-cols-[1.15fr_1.15fr_1.35fr_1.55fr_1fr_auto] items-end">
          <MatrixSelect label="แผนหลัก" value={selectedMasterPlanNo} onChange={handleMasterPlanChange} disabled={plansLoading}>
            <option value="">{plansLoading ? "กำลังโหลด..." : "เลือกแผนหลัก"}</option>
            {masterPlans.map((plan) => <option key={plan.masterPlanNo} value={plan.masterPlanNo}>{plan.masterPlanNo}</option>)}
          </MatrixSelect>
          <MatrixSelect label="แผนก" value={activeDeptId} onChange={(value) => setActiveDeptId(value)}>
            <option value="">เลือกแผนก</option>
            {departments.map((dept) => <option key={dept.id} value={dept.id}>{dept.name}</option>)}
          </MatrixSelect>
          <MatrixSelect label="Section" value={activeSection?.id || ""} onChange={(value) => setActiveSection(sectionOptions.find((section) => String(section.id) === String(value)) || null)}>
            <option value="">ทุก Section</option>
            {sectionOptions.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
          </MatrixSelect>
          <MatrixSelect label="ช่วงวันที่" value={dateFrom ? `${formatDate(dateFrom)} - ${formatDate(dateTo)}` : "-"} onChange={() => {}} readOnly>
            <option>{dateFrom ? `${formatDate(dateFrom)} - ${formatDate(dateTo)}` : "-"}</option>
          </MatrixSelect>
          <MatrixSelect label="กะ (Shift)" value={activeSection ? "section" : "all"} onChange={() => {}}>
            <option value={activeSection ? "section" : "all"}>{activeSection ? `ตาม Section (${currentSectionShifts.length})` : `ทั้งหมด (${availableShifts.length})`}</option>
          </MatrixSelect>
          <div className="flex gap-2 xl:justify-end">
            <button type="button" onClick={() => setShowSchedule(true)} className="h-9 whitespace-nowrap border border-[#102C57] px-3 text-xs font-bold text-[#102C57] rounded-[2px] hover:bg-slate-100">แผนหลัก FG</button>
            <button type="button" onClick={triggerRecalculate} disabled={recalculating || isLocked} className="h-9 whitespace-nowrap border border-[#102C57] px-3 text-xs font-bold text-[#102C57] rounded-[2px] hover:bg-slate-100 disabled:opacity-50">{recalculating ? "กำลังคำนวณ..." : "ตรวจสอบวัตถุดิบ"}</button>
            <button type="button" onClick={handleSaveWipSubplan} disabled={saving || isLocked} className="h-9 whitespace-nowrap border border-slate-300 bg-white px-3 text-xs font-bold rounded-[2px] disabled:opacity-50">{saving ? "กำลังบันทึก..." : "บันทึกร่าง"}</button>
            <button type="button" onClick={handleConfirmSubplan} disabled={confirming || isLocked} className="h-9 whitespace-nowrap bg-[#d4af37] px-4 text-xs font-extrabold text-[#102C57] rounded-[2px] disabled:opacity-50">{confirming ? "กำลังยืนยัน..." : "ยืนยันแผน"}</button>
          </div>
        </section>

        {isLocked && (
          <div className="flex items-center gap-2 border border-[#d4af37] bg-[#fff9e6] px-4 py-3 text-xs font-bold text-[#8a6d1c]"><Lock size={14} /> แผนก {activeDeptName} ถูกยืนยันแล้ว ไม่สามารถแก้ไขจำนวน WIP ได้</div>
        )}

        <section className="border border-slate-300 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-300 px-4 py-3">
            <div className="flex items-center gap-6 text-sm font-bold">
              <span>WIP ที่วางแผน <strong className="ml-2 text-lg text-[#102C57]">{matrixColumns.length}</strong> รายการ</span>
              <span className="h-7 w-px bg-slate-300" />
              <span>รวมปริมาณแผน (ทั้งหมด) <strong className="ml-2 text-lg text-[#102C57]">{formatNumber(plannedTotal, 2)}</strong> หน่วย</span>
            </div>
            <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-600">
              <Legend color="bg-[#f7cdd2]" label="มีแผน (Planned)" /><Legend color="bg-[#ef6c6c]" label="ขาดแคลน (Shortage)" /><Legend color="bg-[#b9dfc2]" label="เพียงพอ (Sufficient)" /><Legend color="bg-white border border-slate-300" label="ไม่มีความต้องการ (No Demand)" />
            </div>
          </div>

          <div className="flex items-center justify-between bg-[#d4af37] px-4 py-2 text-xs font-extrabold text-[#102C57]">
            <span>Section: {selectedSectionName}</span>
            <span>แผนก: {activeDeptName || "-"}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[1120px] w-full border-collapse text-xs">
              <thead>
                <tr className="bg-[#102C57] text-white">
                  <th rowSpan={3} className="sticky left-0 z-20 min-w-[135px] border-r border-white/30 px-3 py-2 text-left">รหัสวัตถุดิบ</th>
                  <th rowSpan={3} className="sticky left-[135px] z-20 min-w-[220px] border-r border-white/30 px-3 py-2 text-left">รายการวัตถุดิบ</th>
                  <th rowSpan={3} className="min-w-[70px] border-r border-white/30 px-2 py-2">หน่วย</th>
                  {matrixColumns.map((column) => <th key={column.key} className="min-w-[104px] border-r border-white/30 px-2 py-2 text-center">{column.skuName || column.skuCode}</th>)}
                  <th rowSpan={3} className="min-w-[85px] px-2 py-2">รวม</th>
                </tr>
                <tr className="bg-[#193d70] text-white">
                  {matrixColumns.map((column) => <th key={`${column.key}-date`} className="border-r border-white/20 px-2 py-1 text-center">{formatMatrixDate(column.workDate)}</th>)}
                </tr>
                <tr className="bg-[#244b7e] text-white">
                  {matrixColumns.map((column) => <th key={`${column.key}-shift`} className="border-r border-white/20 px-2 py-1 text-center">{column.shiftName || column.shiftCode || "-"}</th>)}
                </tr>
              </thead>
              <tbody>
                {draftLoading ? (
                  <tr><td colSpan={matrixColumns.length + 4} className="py-12 text-center font-bold text-slate-500"><RefreshCw size={15} className="mr-2 inline animate-spin" />กำลังโหลดข้อมูลแผน WIP...</td></tr>
                ) : materialRows.length === 0 ? (
                  <tr><td colSpan={matrixColumns.length + 4} className="py-12 text-center font-bold text-slate-500">ยังไม่มีข้อมูลวัตถุดิบสำหรับ Section และ WIP ที่เลือก</td></tr>
                ) : materialRows.map((row, rowIndex) => {
                  const total = matrixColumns.reduce((sum, column) => sum + Number(row.values[column.key] || 0), 0) || Number(row.aggregate || 0);
                  return <tr key={`${row.code}-${rowIndex}`} className="border-b border-slate-200 hover:bg-slate-50">
                    <td className="sticky left-0 z-10 border-r border-slate-200 bg-white px-3 py-2 font-mono font-bold">{row.code}</td>
                    <td className="sticky left-[135px] z-10 border-r border-slate-200 bg-white px-3 py-2 font-semibold">{row.name}</td>
                    <td className="border-r border-slate-200 px-2 py-2 text-center">{row.unit}</td>
                    {matrixColumns.map((column) => <td key={column.key} className={`border-r border-slate-200 px-2 py-2 text-center tabular-nums ${row.values[column.key] ? "bg-[#f7cdd2] font-bold" : "text-slate-400"}`}>{row.values[column.key] ? formatNumber(row.values[column.key], 4) : "-"}</td>)}
                    <td className="bg-[#e6f0ff] px-2 py-2 text-center font-extrabold tabular-nums">{formatNumber(total, 4)}</td>
                  </tr>;
                })}
                {materialRows.length > 0 && <tr className="bg-[#d4af37] font-extrabold text-[#102C57]">
                  <td colSpan={3} className="px-3 py-2 text-right">รวม</td>
                  {matrixColumns.map((column) => <td key={`total-${column.key}`} className="border-r border-[#b6911e] px-2 py-2 text-center">{formatNumber(materialRows.reduce((sum, row) => sum + Number(row.values[column.key] || 0), 0), 4)}</td>)}
                  <td className="px-2 py-2 text-center">{formatNumber(materialRows.reduce((sum, row) => sum + matrixColumns.reduce((colSum, column) => colSum + Number(row.values[column.key] || 0), 0), 0), 4)}</td>
                </tr>}
              </tbody>
            </table>
          </div>
        </section>

        <footer className="flex flex-wrap items-center gap-6 border border-slate-300 bg-white px-4 py-3 text-xs font-bold">
          <span className="text-[#102C57]">{activeDeptName || "-"} / Section {selectedSectionName}</span>
          <span className="h-5 w-px bg-slate-300" />
          <span>วัตถุดิบ {totalMaterials} รายการ</span>
          <span className="h-5 w-px bg-slate-300" />
          <span>สถานะ: <span className="text-emerald-700">พร้อมคำนวณ</span></span>
          {existingSubplan?.subPlanNo && <span className="ml-auto text-slate-500">Subplan: {existingSubplan.subPlanNo}</span>}
        </footer>
        <div className="border border-[#d4af37] bg-[#fff9e6] px-4 py-2 text-xs font-semibold text-[#8a6d1c]">ยอดวัตถุดิบคำนวณจาก BOM ของ WIP ตามจำนวนที่วางแผนใน Section และกะที่เลือก</div>
      </main>

      {showWipEditor && <WipEditorModal
        activeDeptId={activeDeptId}
        activeDeptName={activeDeptName}
        activeSection={activeSection}
        sectionOptions={sectionOptions}
        sectionRows={sectionRows}
        isLocked={isLocked}
        wipSkuCatalog={wipSkuCatalog}
        getWipMeta={getWipMeta}
        getShiftsForSection={getShiftsForSection}
        handleLineChange={handleLineChange}
        handleAddWipRow={handleAddWipRow}
        handleRemoveWipRow={handleRemoveWipRow}
        onOpenWipPicker={(tempId) => setWipPickerTempId(tempId)}
        onClose={() => setShowWipEditor(false)}
      />}

      {wipPickerTempId && (
        <WipPickerModal
          activeDeptId={activeDeptId}
          activeDeptName={activeDeptName}
          onSelect={handleSelectWipFromPicker}
          onClose={() => setWipPickerTempId(null)}
        />
      )}

      {showSchedule && selectedMasterPlanNo && activeDeptId && <div className="fixed inset-0 z-50 bg-[#102C57]/50 p-4 md:p-8">
        <div className="mx-auto flex h-full max-w-[1600px] flex-col overflow-hidden border border-slate-300 bg-white">
          <div className="flex items-center justify-between border-b-2 border-[#d4af37] bg-[#102C57] px-4 py-3 text-white"><strong>แผนหลัก FG ของ {activeDeptName}</strong><button type="button" onClick={() => setShowSchedule(false)} className="text-xs font-bold">ปิด</button></div>
          <div className="overflow-auto p-3"><ProductionScheduleClient deptId={activeDeptId} masterPlanNo={selectedMasterPlanNo} dateFrom={dateFrom} dateTo={dateTo} embedded readOnly={isLocked} onSectionChange={(idx, section) => { setActiveSection(section); setShowSchedule(false); }} /></div>
        </div>
      </div>}
    </div>
  );
}

function MatrixSelect({ label, value, onChange, children, disabled = false, readOnly = false }) {
  return <label className="block text-xs font-bold text-slate-700"><span className="mb-1 block">{label}</span><select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled || readOnly} className="h-9 w-full border border-slate-300 bg-white px-3 text-xs font-semibold text-[#132238] outline-none focus:border-[#102C57] disabled:bg-slate-100">{children}</select></label>;
}

function Legend({ color, label }) {
  return <span className="inline-flex items-center gap-1.5"><span className={`h-4 w-4 ${color}`} />{label}</span>;
}

function WipEditorModal({ activeDeptId, activeDeptName, activeSection, sectionOptions, sectionRows, isLocked, wipSkuCatalog, getWipMeta, getShiftsForSection, handleLineChange, handleAddWipRow, handleRemoveWipRow, onOpenWipPicker, onClose }) {
  return <div className="fixed inset-0 z-50 bg-[#102C57]/50 p-4 md:p-10"><div className="mx-auto flex max-h-full max-w-[1250px] flex-col overflow-hidden border border-slate-300 bg-white shadow-xl"><div className="flex items-center justify-between bg-[#102C57] px-4 py-3 text-white"><div><strong>เลือก WIP เพื่อวางแผน</strong><span className="ml-3 text-xs text-white/70">Section: {activeSection?.name || "ทุก Section"}</span></div><button type="button" onClick={onClose} className="text-xs font-bold hover:text-white/80">ปิด</button></div><div className="overflow-auto p-4"><div className="mb-3 flex flex-wrap gap-2">{sectionOptions.map((section) => <span key={section.id} className={`border px-3 py-1 text-xs font-bold ${String(section.id) === String(activeSection?.id) ? "border-[#102C57] bg-[#102C57] text-white" : "border-slate-300 text-slate-600"}`}>{section.name}</span>)}</div><div className="overflow-x-auto"><table className="min-w-[920px] w-full border-collapse text-xs"><thead><tr className="bg-[#102C57] text-white"><th className="px-3 py-2 text-left">วันที่</th><th className="px-3 py-2 text-left">กะของ Section</th><th className="px-3 py-2 text-left">รหัส WIP</th><th className="px-3 py-2 text-left">ชื่อ WIP</th><th className="px-3 py-2 text-right">จำนวนแผน</th><th className="px-3 py-2 text-center">หน่วย</th><th className="px-3 py-2 text-right">จัดการ</th></tr></thead><tbody>{sectionRows.map((row) => { const shifts = getShiftsForSection(row.sourceSectionDefId || activeSection?.id); const meta = getWipMeta(row.skuCode); return <tr key={row.tempId} className="border-b border-slate-200"><td className="px-3 py-2"><input type="date" disabled={isLocked} value={row.workDate || ""} onChange={(event) => handleLineChange(row.tempId, "workDate", event.target.value)} className="h-8 border border-slate-300 px-2" /></td><td className="px-3 py-2"><select disabled={isLocked} value={row.shiftCode || ""} onChange={(event) => { const shift = shifts.find((item) => item.shiftCode === event.target.value); handleLineChange(row.tempId, "shiftCode", event.target.value); if (shift) { handleLineChange(row.tempId, "shiftId", shift.shiftId); handleLineChange(row.tempId, "shiftName", shift.shiftName); } }} className="h-8 border border-slate-300 px-2">{shifts.map((shift) => <option key={shift.shiftId} value={shift.shiftCode}>{shift.shiftName} ({shift.shiftCode})</option>)}</select></td><td className="px-3 py-2">{isLocked || Boolean(row.id) ? <span className="font-mono font-bold">{row.skuCode || "-"}</span> : <button type="button" onClick={() => onOpenWipPicker(row.tempId)} className="h-8 w-full min-w-[170px] border border-slate-300 bg-white px-2.5 text-left font-mono text-xs hover:border-[#102C57] flex items-center justify-between gap-1 text-slate-800 rounded-sm shadow-sm transition-all"><span className={row.skuCode ? "font-bold text-[#102C57]" : "text-slate-400 font-sans font-normal"}>{row.skuCode || "ค้นหาและเลือกรหัส WIP..."}</span><Search size={13} className="text-slate-400 shrink-0" /></button>}</td><td className="px-3 py-2 font-semibold">{row.skuName || "-"}</td><td className="px-3 py-2"><input type="number" min="0" disabled={isLocked} value={row.plannedQty || ""} onChange={(event) => handleLineChange(row.tempId, "plannedQty", event.target.value === "" ? 0 : Number(event.target.value))} className="h-8 w-full border border-slate-300 px-2 text-right font-mono" /></td><td className="px-3 py-2 text-center">{meta.planningUnit}</td><td className="px-3 py-2 text-right"><button type="button" disabled={isLocked} onClick={() => handleRemoveWipRow(row.tempId)} className="text-red-700 disabled:opacity-30 hover:text-red-900"><Trash2 size={15} /></button></td></tr>; })}</tbody></table></div><button type="button" disabled={isLocked || !activeSection} onClick={() => handleAddWipRow(activeSection?.name)} className="mt-4 flex h-9 items-center gap-2 bg-[#102C57] px-4 text-xs font-bold text-white disabled:opacity-40 rounded"><Plus size={14} /> เพิ่ม WIP ใน Section นี้</button></div></div></div>;
}

function WipPickerModal({ activeDeptId, activeDeptName, onSelect, onClose }) {
  const [search, setSearch] = useState("");
  const { data, error, isLoading } = useSWR(
    activeDeptId ? `/api/production-planning/wip-options?departmentId=${activeDeptId}` : null,
    fetcher,
    { revalidateOnFocus: false }
  );

  const wipList = useMemo(() => data?.data || [], [data]);
  const meta = data?.meta;

  const filteredList = useMemo(() => {
    if (!search.trim()) return wipList;
    const q = search.trim().toLowerCase();
    return wipList.filter((item) => {
      const codeMatch = (item.skuCode || "").toLowerCase().includes(q);
      const nameMatch = (item.name || "").toLowerCase().includes(q);
      const fgMatch = (item.fgSkus || []).some((fg) => fg.toLowerCase().includes(q));
      return codeMatch || nameMatch || fgMatch;
    });
  }, [wipList, search]);

  return (
    <div className="fixed inset-0 z-[60] bg-[#102C57]/60 backdrop-blur-sm p-4 md:p-8 flex items-center justify-center animate-in fade-in duration-150">
      <div className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden border border-slate-300 bg-white shadow-2xl rounded-lg">
        {/* Header */}
        <div className="flex items-center justify-between bg-[#102C57] px-5 py-3.5 text-white">
          <div>
            <h3 className="font-bold text-base flex items-center gap-2">
              <Boxes size={18} className="text-[#d4af37]" />
              เลือก WIP สำหรับ {activeDeptName || "แผนกปัจจุบัน"}
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              แสดงเฉพาะ WIP ที่เชื่อมโยงกับ FG ของแผนกผ่าน BOM (ผูกกับ FG {meta?.fgCount || 0} รายการ)
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:bg-white/10 text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Search & Stats */}
        <div className="border-b border-slate-200 bg-slate-50 p-4 flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:w-96">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              autoFocus
              placeholder="ค้นหารหัส WIP, ชื่อ WIP หรือรหัส FG..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 w-full rounded border border-slate-300 bg-white pl-9 pr-3 text-xs focus:border-[#102C57] focus:outline-none focus:ring-1 focus:ring-[#102C57]"
            />
          </div>
          <div className="text-xs text-slate-500 font-medium self-end sm:self-center">
            พบ {filteredList.length} รายการจากทั้งหมด {wipList.length} WIP
          </div>
        </div>

        {/* Content list */}
        <div className="overflow-auto p-4 flex-1">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500 gap-2">
              <RefreshCw size={24} className="animate-spin text-[#102C57]" />
              <span className="text-xs font-semibold">กำลังโหลดรายการ WIP ของแผนก...</span>
            </div>
          ) : error ? (
            <div className="py-8 text-center text-xs text-red-600 font-semibold">
              เกิดข้อผิดพลาดในการโหลดข้อมูล: {error.message || "กรุณาลองใหม่อีกครั้ง"}
            </div>
          ) : filteredList.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 font-medium">
              {search ? "ไม่พบรายการ WIP ที่ตรงกับการค้นหา" : "ไม่มีรายการ WIP ที่ผูกกับ FG ของแผนกนี้ในระบบ"}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2">
              {filteredList.map((item) => (
                <button
                  key={item.skuCode}
                  type="button"
                  onClick={() => onSelect(item)}
                  className="group flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-md border border-slate-200 bg-white p-3 text-left transition-all hover:border-[#102C57] hover:bg-slate-50 hover:shadow-sm focus:outline-none"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[#102C57] group-hover:underline">
                        {item.skuCode}
                      </span>
                      {item.unit && (
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                          หน่วย: {item.unit}
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-semibold text-slate-800 mt-1 truncate">
                      {item.name || "-"}
                    </div>
                  </div>

                  {/* FG references */}
                  {item.fgSkus && item.fgSkus.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1 sm:max-w-xs justify-start sm:justify-end">
                      <span className="text-[10px] text-slate-400 font-medium">ใช้สำหรับ FG:</span>
                      {item.fgSkus.slice(0, 3).map((fg) => (
                        <span
                          key={fg}
                          className="rounded bg-blue-50 border border-blue-200 px-1.5 py-0.5 text-[10px] font-mono text-blue-700"
                        >
                          {fg}
                        </span>
                      ))}
                      {item.fgSkus.length > 3 && (
                        <span className="text-[10px] text-slate-400 font-medium">
                          +{item.fgSkus.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
