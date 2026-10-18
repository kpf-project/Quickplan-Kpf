"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, CheckSquare, Search, Copy, ChevronDown, X } from "lucide-react";
import {
  fetchProductionDepartments,
  fetchProductionRoutingExplosion,
  fetchProductionRoutingComponents,
  fetchProductionRoutingItems,
  fetchProductionWorkCenters,
  saveProductionRoutingComponents,
  fetchDepartmentProducts,
  fetchRoutingCompleteness,
  fetchProductionWipPolicies,
} from "@/features/production-line-settings/services/productionLineSettingsClient";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeSkuCode(value) {
  return normalizeText(value).toUpperCase();
}

function deriveItemType(iccatCode) {
  const normalized = normalizeText(iccatCode).toUpperCase();
  if (normalized === "03") return "WIP";
  if (normalized === "04" || normalized === "04-1" || normalized === "04-2") return "FG";
  return "RAW";
}

function mapRoutingOptions(rows = [], wipPolicyRows = []) {
  const masterPlanWipSkuCodes = new Set(
    wipPolicyRows
      .filter((row) => row?.isActive !== false && row?.allowMasterPlan === true)
      .map((row) => normalizeSkuCode(row?.skuCode))
      .filter(Boolean)
  );

  return rows
    .map((row) => ({
      skuCode: row.sku_code || "",
      skuName: row.sku_name || "",
      itemType: deriveItemType(row.iccat_code),
    }))
    .filter((row) => (
      row.skuCode
      && (
        row.itemType === "FG"
        || (row.itemType === "WIP" && masterPlanWipSkuCodes.has(normalizeSkuCode(row.skuCode)))
      )
    ))
    .sort((a, b) => a.skuCode.localeCompare(b.skuCode));
}

function componentTone(type) {
  if (type === "WIP") return "border-[#1d4ed8]/35 bg-[#e8f0ff] text-[#1e3a8a]";
  if (type === "PACK") return "border-[#0f766e]/30 bg-[#e6fffa] text-[#115e59]";
  return "border-[#d4af37]/40 bg-[#fff8e2] text-[#7a5a00]";
}

const THEME_PRESETS = [
  // 0: Blue (Biscuit)
  {
    border: "border-[#2563eb] focus:border-[#1d4ed8] focus:ring-[#1d4ed8]/20",
    bg: "bg-[#eff6ff]",
    text: "text-[#1e40af]",
    badge: "bg-[#2563eb] text-white",
    activeBtn: "bg-[#2563eb] hover:bg-[#1d4ed8] text-white border-[#2563eb]",
    bullet: "🔵",
  },
  // 1: Orange/Amber (Formula/Bakery)
  {
    border: "border-[#d97706] focus:border-[#b45309] focus:ring-[#b45309]/20",
    bg: "bg-[#fffbeb]",
    text: "text-[#92400e]",
    badge: "bg-[#d97706] text-white",
    activeBtn: "bg-[#d97706] hover:bg-[#b45309] text-white border-[#d97706]",
    bullet: "🟡",
  },
  // 2: Green (Snack/Chicken)
  {
    border: "border-[#059669] focus:border-[#047857] focus:ring-[#047857]/20",
    bg: "bg-[#ecfdf5]",
    text: "text-[#065f46]",
    badge: "bg-[#059669] text-white",
    activeBtn: "bg-[#059669] hover:bg-[#047857] text-white border-[#059669]",
    bullet: "🟢",
  },
  // 3: Purple/Violet (Sugar)
  {
    border: "border-[#8b5cf6] focus:border-[#7c3aed] focus:ring-[#7c3aed]/20",
    bg: "bg-[#f5f3ff]",
    text: "text-[#5b21b6]",
    badge: "bg-[#8b5cf6] text-white",
    activeBtn: "bg-[#8b5cf6] hover:bg-[#7c3aed] text-white border-[#8b5cf6]",
    bullet: "🟣",
  },
  // 4: Rose/Pink
  {
    border: "border-[#f43f5e] focus:border-[#e11d48] focus:ring-[#e11d48]/20",
    bg: "bg-[#fff1f2]",
    text: "text-[#9f1239]",
    badge: "bg-[#f43f5e] text-white",
    activeBtn: "bg-[#f43f5e] hover:bg-[#e11d48] text-white border-[#f43f5e]",
    bullet: "🔴",
  },
  // 5: Teal
  {
    border: "border-[#0d9488] focus:border-[#0f766e] focus:ring-[#0f766e]/20",
    bg: "bg-[#f0fdfa]",
    text: "text-[#115e59]",
    badge: "bg-[#0d9488] text-white",
    activeBtn: "bg-[#0d9488] hover:bg-[#0f766e] text-white border-[#0d9488]",
    bullet: "🐳",
  },
  // 6: Sky Blue
  {
    border: "border-[#0284c7] focus:border-[#0369a1] focus:ring-[#0369a1]/20",
    bg: "bg-[#f0f9ff]",
    text: "text-[#075985]",
    badge: "bg-[#0284c7] text-white",
    activeBtn: "bg-[#0284c7] hover:bg-[#0369a1] text-white border-[#0284c7]",
    bullet: "🌐",
  }
];

function getDeptTheme(deptCode, deptId) {
  const code = String(deptCode || "").trim().toUpperCase();
  if (code.includes("BIS") || code.includes("บิสกิต")) {
    return THEME_PRESETS[0];
  }
  if (code.includes("CHIC") || code.includes("ขาไก่")) {
    return THEME_PRESETS[2];
  }
  if (code.includes("PRP") || code.includes("ชั่งสูตร") || code.includes("ครีม")) {
    return THEME_PRESETS[1];
  }
  if (code.includes("SUG") || code.includes("น้ำตาล")) {
    return THEME_PRESETS[3];
  }

  // Dynamic mapping for future departments using a simple hash of the department code/id
  const seedString = deptId || deptCode || "default";
  let hash = 0;
  for (let i = 0; i < seedString.length; i++) {
    hash = seedString.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % THEME_PRESETS.length;
  return THEME_PRESETS[index];
}

const USAGE_OPTIONS = [
  { value: "DIRECT", label: "ใช้ตรง (DIRECT)" },
  { value: "PROCESS", label: "ใช้ผลิตกลาง (PROCESS)" },
];

export default function RoutingSettingsTab({ canManage = false }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successToast, setSuccessToast] = useState(null);

  const [departments, setDepartments] = useState([]);
  const [workCenters, setWorkCenters] = useState([]);
  const [fgOptions, setFgOptions] = useState([]);
  const [deptMappedSkuCodes, setDeptMappedSkuCodes] = useState(new Set());

  const [routingCompleteness, setRoutingCompleteness] = useState({});
  const [completenessLoading, setCompletenessLoading] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");
  const [selectedFgSkuCode, setSelectedFgSkuCode] = useState("");
  const [selectedFgSkuName, setSelectedFgSkuName] = useState("");
  const [search, setSearch] = useState("");
  const [remark, setRemark] = useState("");
  const [componentRows, setComponentRows] = useState([]);
  const [selectedRowKeys, setSelectedRowKeys] = useState(new Set());
  const [cloneModeActive, setCloneModeActive] = useState(false);
  const [sourceFgSkuCode, setSourceFgSkuCode] = useState("");

  const dismissSuccessToast = useCallback(() => {
    setSuccessToast(null);
  }, []);

  useEffect(() => {
    if (!successToast) return undefined;
    const timerId = window.setTimeout(() => {
      setSuccessToast((current) => (
        current?.id === successToast.id ? null : current
      ));
    }, 3000);
    return () => window.clearTimeout(timerId);
  }, [successToast]);

  const loadCompleteness = useCallback(async (departmentId) => {
    if (!departmentId) return;
    setCompletenessLoading(true);
    try {
      const res = await fetchRoutingCompleteness(departmentId);
      if (res.ok) {
        setRoutingCompleteness(res.data?.data || {});
      }
    } catch (err) {
      console.error("Failed to load routing completeness", err);
    } finally {
      setCompletenessLoading(false);
    }
  }, []);

  const selectedDepartment = useMemo(
    () => departments.find((row) => row.id === selectedDepartmentId) || null,
    [departments, selectedDepartmentId]
  );

  const workCentersByDepartment = useMemo(
    () => workCenters.filter((row) => (
      row.department_id === selectedDepartmentId
      || row.department_is_central === true
    )),
    [workCenters, selectedDepartmentId]
  );

  const workCenterById = useMemo(
    () => new Map(workCenters.map((row) => [row.id, row])),
    [workCenters]
  );

  const visibleRows = componentRows;

  const filteredFgOptions = useMemo(() => {
    const needle = normalizeText(search).toLowerCase();
    let base = fgOptions;
    if (selectedDepartmentId) {
      base = base.filter((item) => (
        deptMappedSkuCodes.has(normalizeSkuCode(item.skuCode))
      ));
    }
    if (!needle) return base;
    return base.filter((item) =>
      item.skuCode.toLowerCase().includes(needle)
      || normalizeText(item.skuName).toLowerCase().includes(needle)
    );
  }, [fgOptions, search, selectedDepartmentId, deptMappedSkuCodes]);

  const loadComponentMappings = useCallback(async (departmentId, fgSkuCode) => {
    if (!departmentId || !fgSkuCode) return [];

    const [bomResult, mappingResult] = await Promise.all([
      fetchProductionRoutingExplosion(fgSkuCode),
      fetchProductionRoutingComponents({
        departmentId,
        fgSkuCode,
      }),
    ]);

    if (!bomResult.ok) throw new Error(bomResult.error?.message || "โหลด BOM ของสินค้าที่เลือกไม่สำเร็จ");
    if (!mappingResult.ok) throw new Error(mappingResult.error?.message || "โหลด Routing เดิมไม่สำเร็จ");

    const bomItems = Array.isArray(bomResult.data?.data) ? bomResult.data.data : [];
    if (!bomItems.length) throw new Error("สินค้าที่เลือกยังไม่มีรายการ BOM ที่ใช้งาน");

    const oldMappings = Array.isArray(mappingResult.data?.data) ? mappingResult.data.data : [];
    const mappedByComponent = new Map(oldMappings.map((row) => [row.node_key, row]));

    return bomItems.map((item, index) => {
      const parentSkuCode = item.parent_sku_code || "";
      const componentSkuCode = item.component_sku_code || "";
      const componentGoodsCode = item.component_goods_code || componentSkuCode;
      const level = Number(item.level || 1);
      const nodeKey = item.node_key || `${parentSkuCode}|${componentSkuCode}|${level}|${index}`;
      let mapped = mappedByComponent.get(nodeKey);
      if (!mapped) {
        const fallbackList = Array.from(mappedByComponent.values());
        const sameParentAndSku = fallbackList.find(
          (m) =>
            normalizeSkuCode(m.component_sku_code) === normalizeSkuCode(componentSkuCode) &&
            normalizeSkuCode(m.parent_sku_code) === normalizeSkuCode(parentSkuCode)
        );
        if (sameParentAndSku) {
          mapped = sameParentAndSku;
        } else {
          const sameSku = fallbackList.find(
            (m) => normalizeSkuCode(m.component_sku_code) === normalizeSkuCode(componentSkuCode)
          );
          if (sameSku) {
            mapped = sameSku;
          }
        }
      }
      const usageType = String(mapped?.usage_type || "DIRECT").trim().toUpperCase() === "PROCESS"
        ? "PROCESS"
        : "DIRECT";
      return {
        rowKey: nodeKey,
        nodeKey,
        componentSkuCode,
        componentGoodsCode,
        componentSkuName: item.component_sku_name || componentSkuCode,
        componentUomName: item.uom_name || "",
        componentType: item.component_type || deriveItemType(item.iccat_code),
        iccatCode: item.iccat_code || "",
        parentSkuCode,
        parentIsFg: normalizeSkuCode(parentSkuCode) === normalizeSkuCode(fgSkuCode),
        level,
        roomMode: mapped?.room_mode || "explicit",
        workCenterId: mapped?.work_center_id || "",
        dispatchSplitMode: mapped?.dispatch_split_mode || "merge_all",
        usageType,
        issueOwnerDepartmentId: mapped?.issue_owner_department_id || departmentId,
      };
    });
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setErrorMessage("");
      try {
        const [deptResult, wcResult, itemResult, wipPolicyResult] = await Promise.all([
          fetchProductionDepartments({ pageSize: "500" }),
          fetchProductionWorkCenters({ includeInactive: "false" }),
          fetchProductionRoutingItems({ search: "", bomFilter: "with" }),
          fetchProductionWipPolicies({ limit: "1000" }),
        ]);
        if (!deptResult.ok) throw new Error(deptResult.error?.message || "โหลดแผนกไม่สำเร็จ");
        if (!wcResult.ok) throw new Error(wcResult.error?.message || "โหลดห้องผลิตไม่สำเร็จ");
        if (!itemResult.ok) throw new Error(itemResult.error?.message || "โหลดรายการสินค้าไม่สำเร็จ");
        if (!wipPolicyResult.ok) throw new Error(wipPolicyResult.error?.message || "โหลดนโยบาย WIP ไม่สำเร็จ");

        const nextDepartments = Array.isArray(deptResult.data?.data) ? deptResult.data.data : [];
        const nextWorkCenters = Array.isArray(wcResult.data?.data) ? wcResult.data.data : [];
        const nextFgOptions = mapRoutingOptions(
          itemResult.data?.data || [],
          wipPolicyResult.data?.data || []
        );

        let savedDeptId = "";
        let savedFgSku = "";
        let savedFgName = "";
        if (typeof window !== "undefined") {
          savedDeptId = localStorage.getItem("routing_selected_dept_id") || "";
          savedFgSku = localStorage.getItem("routing_selected_fg_sku_code") || "";
          savedFgName = localStorage.getItem("routing_selected_fg_sku_name") || "";
        }

        const chosenDeptId = nextDepartments.find((d) => d.id === savedDeptId)?.id || nextDepartments[0]?.id || "";
        
        let activeSkuCodes = new Set();
        let completenessData = {};
        if (chosenDeptId) {
          const [deptProductsRes, completenessRes] = await Promise.all([
            fetchDepartmentProducts(chosenDeptId),
            fetchRoutingCompleteness(chosenDeptId),
          ]);
          if (deptProductsRes.ok) {
            const mapped = deptProductsRes.data?.data || [];
            mapped.forEach((p) => {
              if (p.sku_code) {
                activeSkuCodes.add(String(p.sku_code).trim().toUpperCase());
              }
            });
          }
          if (completenessRes.ok) {
            completenessData = completenessRes.data?.data || {};
          }
        }

        let chosenFg = null;
        if (savedFgSku) {
          chosenFg = nextFgOptions.find((fg) => fg.skuCode === savedFgSku);
          if (!activeSkuCodes.has(normalizeSkuCode(savedFgSku))) {
            chosenFg = null;
          }
        }
        if (!chosenFg) {
          chosenFg = nextFgOptions.find((fg) => (
            activeSkuCodes.has(normalizeSkuCode(fg.skuCode))
          )) || null;
        }

        let nextRows = [];
        if (chosenDeptId && chosenFg?.skuCode) {
          nextRows = await loadComponentMappings(chosenDeptId, chosenFg.skuCode);
        }

        if (!active) return;
        setDepartments(nextDepartments);
        setWorkCenters(nextWorkCenters);
        setFgOptions(nextFgOptions);
        setDeptMappedSkuCodes(activeSkuCodes);
        setRoutingCompleteness(completenessData);
        setSelectedDepartmentId(chosenDeptId);
        setSelectedFgSkuCode(chosenFg?.skuCode || "");
        setSelectedFgSkuName(chosenFg?.skuName || "");
        setComponentRows(nextRows);
      } catch (error) {
        if (active) setErrorMessage(error?.message || "โหลดข้อมูลไม่สำเร็จ");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [loadComponentMappings]);

  const handleSelectDepartment = async (departmentId) => {
    setSelectedDepartmentId(departmentId);
    if (typeof window !== "undefined") {
      localStorage.setItem("routing_selected_dept_id", departmentId);
    }
    setSelectedRowKeys(new Set());
    setCloneModeActive(false);
    setLoading(true);
    setCompletenessLoading(true);
    setErrorMessage("");
    try {
      const [deptProductsRes, completenessRes] = await Promise.all([
        fetchDepartmentProducts(departmentId),
        fetchRoutingCompleteness(departmentId),
      ]);
      let nextFgSkuCode = "";
      let nextFgSkuName = "";
      const activeSkuCodes = new Set();
      if (deptProductsRes.ok) {
        const mapped = deptProductsRes.data?.data || [];
        mapped.forEach((p) => {
          if (p.sku_code) {
            activeSkuCodes.add(String(p.sku_code).trim().toUpperCase());
          }
        });
        setDeptMappedSkuCodes(activeSkuCodes);
      } else {
        setDeptMappedSkuCodes(new Set());
      }

      if (completenessRes.ok) {
        setRoutingCompleteness(completenessRes.data?.data || {});
      } else {
        setRoutingCompleteness({});
      }

      const currentOption = fgOptions.find((item) => item.skuCode === selectedFgSkuCode) || null;
      const isCurrentFgValid = selectedFgSkuCode && (
        activeSkuCodes.has(normalizeSkuCode(selectedFgSkuCode))
      );
      if (isCurrentFgValid) {
        nextFgSkuCode = selectedFgSkuCode;
        nextFgSkuName = selectedFgSkuName;
      } else {
        const firstValidFg = fgOptions.find((fg) => (
          activeSkuCodes.has(normalizeSkuCode(fg.skuCode))
        ));
        if (firstValidFg) {
          nextFgSkuCode = firstValidFg.skuCode;
          nextFgSkuName = firstValidFg.skuName;
        }
      }

      setSelectedFgSkuCode(nextFgSkuCode);
      setSelectedFgSkuName(nextFgSkuName);
      if (typeof window !== "undefined") {
        localStorage.setItem("routing_selected_fg_sku_code", nextFgSkuCode);
        localStorage.setItem("routing_selected_fg_sku_name", nextFgSkuName);
      }

      if (departmentId && nextFgSkuCode) {
        const nextRows = await loadComponentMappings(departmentId, nextFgSkuCode);
        setComponentRows(nextRows);
      } else {
        setComponentRows([]);
      }
    } catch (error) {
      setComponentRows([]);
      setErrorMessage(error?.message || "โหลดข้อมูลไม่สำเร็จ");
    } finally {
      setLoading(false);
      setCompletenessLoading(false);
    }
  };

  const handleSelectFg = async (skuCode) => {
    const target = fgOptions.find((row) => row.skuCode === skuCode) || null;
    setSelectedFgSkuCode(skuCode);
    setSelectedFgSkuName(target?.skuName || "");
    if (typeof window !== "undefined") {
      localStorage.setItem("routing_selected_fg_sku_code", skuCode);
      localStorage.setItem("routing_selected_fg_sku_name", target?.skuName || "");
    }
    setSelectedRowKeys(new Set());
    setCloneModeActive(false);
    setLoading(true);
    setErrorMessage("");
    try {
      const nextRows = await loadComponentMappings(selectedDepartmentId, skuCode);
      setComponentRows(nextRows);
    } catch (error) {
      setComponentRows([]);
      setErrorMessage(error?.message || "โหลด BOM ของสินค้าที่เลือกไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const handlePatchRow = (rowKey, patch) => {
    setComponentRows((prev) => prev.map((row) => (row.rowKey === rowKey ? { ...row, ...patch } : row)));
  };

  const resolveIssueOwnerFromWorkCenter = useCallback((workCenterId, fallbackDepartmentId = selectedDepartmentId) => {
    const workCenter = workCenterById.get(workCenterId);
    const ownerDepartmentId = String(workCenter?.department_id || "").trim();
    return ownerDepartmentId || fallbackDepartmentId;
  }, [selectedDepartmentId, workCenterById]);

  const handleChangeWorkCenter = (rowKey, workCenterId) => {
    handlePatchRow(rowKey, {
      workCenterId,
      issueOwnerDepartmentId: workCenterId
        ? resolveIssueOwnerFromWorkCenter(workCenterId)
        : selectedDepartmentId,
    });
  };

  const handleChangeRoomMode = (rowKey, roomMode) => {
    setComponentRows((prev) => prev.map((row) => {
      if (row.rowKey !== rowKey) return row;
      if (row.parentIsFg) return { ...row, roomMode: "explicit" };
      return {
        ...row,
        roomMode,
        workCenterId: roomMode === "inherit_parent" ? "" : row.workCenterId,
        issueOwnerDepartmentId: roomMode === "inherit_parent"
          ? selectedDepartmentId
          : row.issueOwnerDepartmentId,
      };
    }));
  };

  const handleChangeDispatchSplitMode = (rowKey, dispatchSplitMode) => {
    handlePatchRow(rowKey, { dispatchSplitMode });
  };

  const handleChangeUsageType = (rowKey, usageType) => {
    setComponentRows((prev) => prev.map((row) => {
      if (row.rowKey !== rowKey) return row;
      if (usageType === "PROCESS") {
        return {
          ...row,
          usageType: "PROCESS",
          issueOwnerDepartmentId: row.issueOwnerDepartmentId || selectedDepartmentId,
        };
      }
      return {
        ...row,
        usageType: "DIRECT",
        issueOwnerDepartmentId: selectedDepartmentId,
      };
    }));
  };

  const handleChangeIssueOwner = (rowKey, issueOwnerDepartmentId) => {
    handlePatchRow(rowKey, { issueOwnerDepartmentId });
  };

  const toggleSelectAll = () => {
    setSelectedRowKeys((prev) => {
      const allVisibleSelected = visibleRows.every((row) => prev.has(row.rowKey));
      const next = new Set(prev);
      if (allVisibleSelected) {
        visibleRows.forEach((row) => next.delete(row.rowKey));
      } else {
        visibleRows.forEach((row) => next.add(row.rowKey));
      }
      return next;
    });
  };

  const toggleSelectRow = (rowKey) => {
    setSelectedRowKeys((prev) => {
      const next = new Set(prev);
      if (next.has(rowKey)) {
        next.delete(rowKey);
      } else {
        next.add(rowKey);
      }
      return next;
    });
  };

  const handleBulkApplyWorkCenter = (workCenterId) => {
    const issueOwnerDepartmentId = resolveIssueOwnerFromWorkCenter(workCenterId);
    setComponentRows((prev) =>
      prev.map((row) =>
        selectedRowKeys.has(row.rowKey) && (row.roomMode || "explicit") === "explicit"
          ? { ...row, workCenterId, issueOwnerDepartmentId }
          : row
      )
    );
  };

  const handleBulkApplyDispatchSplitMode = (dispatchSplitMode) => {
    setComponentRows((prev) =>
      prev.map((row) =>
        selectedRowKeys.has(row.rowKey)
          ? { ...row, dispatchSplitMode }
          : row
      )
    );
  };

  const handleBulkApplyUsageType = (usageType) => {
    setComponentRows((prev) =>
      prev.map((row) => {
        if (!selectedRowKeys.has(row.rowKey)) return row;
        if (usageType === "PROCESS") {
          return {
            ...row,
            usageType: "PROCESS",
            issueOwnerDepartmentId: row.issueOwnerDepartmentId || selectedDepartmentId,
          };
        }
        return {
          ...row,
          usageType: "DIRECT",
          issueOwnerDepartmentId: selectedDepartmentId,
        };
      })
    );
  };

  const handleBulkApplyIssueOwner = (issueOwnerDepartmentId) => {
    setComponentRows((prev) =>
      prev.map((row) =>
        selectedRowKeys.has(row.rowKey)
          ? { ...row, issueOwnerDepartmentId }
          : row
      )
    );
  };

  const handleCloneRouting = async (sourceFgCode) => {
    if (!sourceFgCode || !selectedDepartmentId || !selectedFgSkuCode) return;
    setLoading(true);
    setErrorMessage("");
    try {
      const sourceMappings = await loadComponentMappings(selectedDepartmentId, sourceFgCode);
      if (!sourceMappings || !sourceMappings.length) {
        throw new Error("สินค้าต้นแบบไม่มีข้อมูลการผูก Routing");
      }

      setComponentRows((prev) => {
        return prev.map((targetRow) => {
          // Step 1: Same product code match (exact match)
          const exactMatch = sourceMappings.find(
            (src) => src.componentSkuCode === targetRow.componentSkuCode
          );
          if (exactMatch) {
            return {
              ...targetRow,
              workCenterId: exactMatch.workCenterId || "",
              dispatchSplitMode: exactMatch.dispatchSplitMode || "merge_all",
              usageType: exactMatch.usageType || "DIRECT",
              issueOwnerDepartmentId: exactMatch.issueOwnerDepartmentId || selectedDepartmentId,
            };
          }

          // Step 2: Same category type fallback (structural match)
          const typeMatch = sourceMappings.find(
            (src) => src.componentType === targetRow.componentType
          );
          if (typeMatch) {
            return {
              ...targetRow,
              workCenterId: typeMatch.workCenterId || "",
              dispatchSplitMode: typeMatch.dispatchSplitMode || "merge_all",
              usageType: typeMatch.usageType || "DIRECT",
              issueOwnerDepartmentId: typeMatch.issueOwnerDepartmentId || selectedDepartmentId,
            };
          }

          return targetRow;
        });
      });
    } catch (error) {
      setErrorMessage(error?.message || "โคลนเส้นทางการผลิตไม่สำเร็จ");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!canManage) return;
    setSuccessToast(null);
    if (!selectedDepartmentId || !selectedFgSkuCode || !selectedFgSkuName) {
      setErrorMessage("กรุณาเลือกแผนกและสินค้า FG / WIP ก่อนบันทึก");
      return;
    }

    const explicitWithoutRoom = componentRows.filter(
      (row) => (row.roomMode || "explicit") === "explicit" && !normalizeText(row.workCenterId)
    );
    if (explicitWithoutRoom.length) {
      setErrorMessage("มีรายการโหมดแยกห้องจริงที่ยังไม่ได้เลือกห้องผลิต");
      return;
    }

    const invalidOwnerRows = componentRows.filter((row) => !normalizeText(row.issueOwnerDepartmentId));
    if (invalidOwnerRows.length) {
      setErrorMessage("มีรายการที่ยังไม่ได้เลือกแผนกรับผิดชอบเบิก");
      return;
    }

    const mappings = componentRows
      .filter((row) => (row.roomMode || "explicit") === "inherit_parent" || normalizeText(row.workCenterId))
      .map((row) => {
        const rowRoomMode = row.parentIsFg ? "explicit" : (row.roomMode || "explicit");
        return {
          nodeKey: row.nodeKey,
          parentSkuCode: row.parentSkuCode,
          componentSkuCode: row.componentSkuCode,
          componentSkuName: row.componentSkuName,
          componentType: row.componentType,
          iccatCode: row.iccatCode,
          roomMode: rowRoomMode,
          workCenterId: rowRoomMode === "inherit_parent" ? null : row.workCenterId,
          dispatchSplitMode: row.dispatchSplitMode || "merge_all",
          usageType: row.usageType || "DIRECT",
          issueOwnerDepartmentId: row.issueOwnerDepartmentId || selectedDepartmentId,
        };
      });

    if (!mappings.length) {
      setErrorMessage("กรุณาเลือกห้องผลิตอย่างน้อย 1 รายการ");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    try {
      const result = await saveProductionRoutingComponents({
        departmentId: selectedDepartmentId,
        fgSkuCode: normalizeSkuCode(selectedFgSkuCode),
        fgSkuName: selectedFgSkuName,
        remark: normalizeText(remark),
        mappings,
      });
      if (!result.ok) throw new Error(result.error?.message || "บันทึก Routing ไม่สำเร็จ");
      setSuccessToast({
        id: Date.now(),
        message: "บันทึก Routing สำเร็จ",
      });
      loadCompleteness(selectedDepartmentId);
    } catch (error) {
      setErrorMessage(error?.message || "บันทึก Routing ไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  };

  const theme = getDeptTheme(selectedDepartment?.code, selectedDepartment?.id);

  return (
    <div className="h-full min-h-[620px] bg-[#f6f7f9] text-[#102C57] px-0 py-2 md:py-4">
      <style>{`
        @keyframes routing-toast-in {
          from { opacity: 0; transform: translate3d(18px, -8px, 0) scale(0.97); }
          to { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        }
        @keyframes routing-toast-progress {
          from { transform: scaleX(1); }
          to { transform: scaleX(0); }
        }
      `}</style>

      {successToast ? (
        <div
          className="fixed right-4 top-20 z-[230] w-[min(92vw,400px)]"
          style={{ animation: "routing-toast-in 180ms ease-out" }}
        >
          <div
            role="status"
            aria-live="polite"
            className="overflow-hidden rounded-xl border border-emerald-200 bg-white shadow-[0_18px_48px_rgba(15,23,42,0.22)]"
          >
            <div className="flex items-start gap-3 px-4 py-3.5">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <CheckCircle2 aria-hidden="true" className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold text-[#102C57]">{successToast.message}</p>
                <p className="mt-0.5 text-xs font-medium text-slate-500">
                  ระบบอัปเดตเส้นทางการผลิตเรียบร้อยแล้ว
                </p>
              </div>
              <button
                type="button"
                onClick={dismissSuccessToast}
                aria-label="ปิดการแจ้งเตือน"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#102C57] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
            <div className="h-1 bg-emerald-100">
              <div
                className="h-full origin-left bg-gradient-to-r from-emerald-600 to-[#d4af37]"
                style={{ animation: "routing-toast-progress 3s linear forwards" }}
              />
            </div>
          </div>
        </div>
      ) : null}

      {/* MAIN UNIFIED FULL-WIDTH CARD */}
      <section className="border-y md:border border-[#d2d2d2] bg-white rounded-none md:rounded-[2px] flex flex-col h-full lg:h-[calc(100vh-180px)] overflow-hidden">
        {/* HEADER BLOCK */}
        <div className="border-b border-[#d2d2d2] bg-[var(--surface-navy,#102C57)] px-4 py-3.5 text-white flex flex-col md:flex-row md:items-center md:justify-between gap-3 shrink-0">
          <div>
            <div className="text-xs font-bold uppercase tracking-[0.16em] text-[#d4af37]">
              Routing Master
            </div>
            <h2 className="mt-1 text-xl font-bold">ผูกห้องให้ลูกใน BOM ของ FG / WIP แผนหลัก</h2>
          </div>
          {/* Compact Department Selector inside Header to save space */}
          <div className="flex items-center gap-2 bg-[#0b1f3f] px-3 py-1.5 rounded border border-[#d4af37]/30 shrink-0">
            <span className="text-xs font-extrabold text-[#d4af37] tracking-wider uppercase whitespace-nowrap">
              แผนกรับผิดชอบ:
            </span>
            <select
              value={selectedDepartmentId}
              onChange={(event) => handleSelectDepartment(event.target.value)}
              className="bg-transparent text-sm font-bold text-white outline-none cursor-pointer focus:ring-0 border-0 p-0 pr-6"
              style={{ colorScheme: "dark" }}
            >
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id} className="text-slate-900 bg-white font-bold">
                  {dept.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* UNIFIED CONTROLS ROW (ABOVE TABLE) */}
        <div className="border-b border-[#d2d2d2] px-4 py-2.5 bg-[#f8fafc] flex flex-wrap items-center gap-3 shrink-0">
          {/* FG / master-plan WIP selector */}
          <div className="flex items-center gap-2 flex-1 min-w-[320px] md:min-w-[500px] max-w-2xl relative">
            <span className="text-xs font-extrabold text-[#102C57] tracking-wider uppercase whitespace-nowrap">
              สินค้า FG / WIP:
            </span>
            <div className="relative flex-1">
              <button
                type="button"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="h-9 w-full border border-[#cccccc] bg-white px-3 pr-8 text-[15px] font-bold text-slate-900 outline-none focus:border-[#102C57] rounded-[2px] cursor-pointer text-left flex items-center justify-between"
              >
                <span className="truncate">
                  {selectedFgSkuCode
                    ? `${selectedFgSkuCode} - ${selectedFgSkuName}`
                    : "เลือกสินค้า FG / WIP"}
                </span>
                <ChevronDown size={16} className="text-slate-500 shrink-0 ml-1" />
              </button>

              {dropdownOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40 cursor-default"
                    onClick={() => setDropdownOpen(false)}
                  />
                  <div className="absolute left-0 right-0 z-50 mt-1 max-h-64 overflow-y-auto border border-[#cccccc] bg-white shadow-lg rounded-[2px]">
                    <button
                      type="button"
                      onClick={() => {
                        handleSelectFg("");
                        setDropdownOpen(false);
                      }}
                      className="w-full text-left px-3 py-2 text-sm font-bold text-slate-500 border-b border-slate-100 hover:bg-slate-50 transition-all"
                    >
                      เลือกสินค้า FG / WIP
                    </button>
                    {filteredFgOptions.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-slate-500 italic">
                        ไม่พบข้อมูล FG / WIP ที่วางแผนหลักได้
                      </div>
                    ) : (
                      filteredFgOptions.map((item) => {
                        const normSku = normalizeSkuCode(item.skuCode);
                        const compInfo = routingCompleteness[normSku] || routingCompleteness[item.skuCode];
                        const isComplete = compInfo?.isComplete ?? false;

                        return (
                          <button
                            key={item.skuCode}
                            type="button"
                            onClick={() => {
                              handleSelectFg(item.skuCode);
                              setDropdownOpen(false);
                            }}
                            className={`w-full text-left px-3 py-2 text-[14px] font-bold flex items-center justify-between border-b border-slate-100 hover:bg-slate-50 transition-all ${
                              selectedFgSkuCode === item.skuCode
                                ? "bg-slate-50 text-[#102C57]"
                                : "text-slate-800"
                            }`}
                          >
                            <span className="flex min-w-0 items-center gap-2 truncate mr-2">
                              <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-extrabold ${
                                item.itemType === "WIP"
                                  ? "border-blue-200 bg-blue-50 text-blue-700"
                                  : "border-slate-200 bg-slate-50 text-slate-600"
                              }`}>
                                {item.itemType === "WIP" ? "WIP แผนหลัก" : "FG"}
                              </span>
                              <span className="truncate">{item.skuCode} - {item.skuName}</span>
                            </span>
                            {completenessLoading ? (
                              <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-slate-50 text-slate-400 border border-slate-200">
                                กำลังโหลด...
                              </span>
                            ) : compInfo ? (
                              compInfo.totalComponents === 0 ? (
                                <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-slate-50 text-slate-500 border border-slate-300/30">
                                  BOM ว่าง / ไม่มีลูก
                                </span>
                              ) : isComplete ? (
                                <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-600/30">
                                  ครบ
                                </span>
                              ) : (
                                <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-rose-50 text-rose-700 border border-rose-600/30">
                                  ยังไม่ครบ
                                </span>
                              )
                            ) : (
                              <span className="shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-slate-50 text-slate-500 border border-slate-300/30">
                                ไม่มี BOM
                              </span>
                            )}
                          </button>
                        );
                      })
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* FG / WIP Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ค้นหา FG / WIP..."
              className="h-9 w-48 border border-[#cccccc] bg-white pl-9 pr-3 text-[15px] font-bold text-slate-900 outline-none focus:border-[#102C57] rounded-[2px]"
            />
          </div>

          {/* COPY TEMPLATE TRIGGER WITH PROFESSIONAL ICON */}
          {selectedFgSkuCode && componentRows.length > 0 && (
            <button
              type="button"
              onClick={() => setCloneModeActive(!cloneModeActive)}
              className="h-9 px-3 border border-[#d4af37] bg-white text-[#d4af37] text-[13px] font-extrabold hover:bg-[#fffbeb] transition-all rounded-[2px] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Copy size={14} className="text-[#d4af37]" />
              <span>ดึงต้นแบบ</span>
            </button>
          )}
        </div>

            {/* CLONING EXPANDABLE PANEL */}
            {cloneModeActive && (
              <div className="mx-4 mt-2 flex flex-wrap items-center gap-3 border border-[#e2e8f0] bg-slate-50 p-3 rounded-[2px]">
                <div className="text-[12px] font-extrabold text-[#102C57] tracking-wider uppercase">
                  โคลนเส้นทางการผลิตจาก:
                </div>
                <select
                  value={sourceFgSkuCode}
                  onChange={(event) => setSourceFgSkuCode(event.target.value)}
                  className="h-8 min-w-[280px] border border-[#cccccc] bg-white px-2 text-sm font-bold text-slate-900 outline-none focus:border-[#102C57] rounded-[2px]"
                >
                  <option value="">เลือกสินค้าต้นแบบ</option>
                  {fgOptions
                    .filter((item) => item.skuCode !== selectedFgSkuCode)
                    .map((item) => (
                      <option key={item.skuCode} value={item.skuCode}>
                        {item.skuCode} - {item.skuName}
                      </option>
                    ))}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    if (!sourceFgSkuCode) return;
                    handleCloneRouting(sourceFgSkuCode);
                    setCloneModeActive(false);
                  }}
                  disabled={!sourceFgSkuCode}
                  className="inline-flex h-8 items-center bg-[var(--surface-navy,#102C57)] text-[#d4af37] px-3 text-sm font-extrabold hover:bg-[#0b1f3f] disabled:opacity-50 transition-all rounded-[2px]"
                >
                  ตกลง (Clone)
                </button>
                <button
                  type="button"
                  onClick={() => setCloneModeActive(false)}
                  className="inline-flex h-8 items-center px-3 text-sm font-extrabold text-slate-900 hover:text-black hover:bg-slate-100 transition-all border border-[#d2d2d2] rounded-[2px]"
                >
                  ยกเลิก
                </button>
              </div>
            )}

            {errorMessage ? (
              <div className="mx-4 mt-2 border border-red-200 bg-red-50 px-3 py-2 text-[15px] font-bold text-red-700 rounded-[2px]">
                {errorMessage}
              </div>
            ) : null}

          {/* BULK ACTION BAR */}
          {selectedRowKeys.size > 0 && (
            <div className="bg-[var(--surface-navy,#102C57)] text-[#d4af37] px-4 py-3 flex flex-wrap items-center justify-between gap-3 border-b border-[#d2d2d2] rounded-[2px] mx-4 my-2">
              <div className="flex items-center gap-2">
                <span className="text-[12px] bg-[#d4af37] text-[#102C57] px-2 py-0.5 rounded-full font-extrabold">
                  {selectedRowKeys.size} รายการ
                </span>
                <span className="text-sm font-extrabold text-white tracking-wider uppercase">
                  ตั้งค่าด่วนสำหรับแถวที่เลือก:
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {/* Bulk Work Center */}
                <select
                  onChange={(event) => {
                    if (event.target.value) {
                      handleBulkApplyWorkCenter(event.target.value);
                      event.target.value = "";
                    }
                  }}
                  className="h-8 border border-[#d4af37] bg-[var(--surface-navy,#102C57)] text-white px-2 text-xs font-bold outline-none rounded-[2px] cursor-pointer"
                >
                  <option value="" className="bg-white text-slate-800">เลือกห้องผลิต...</option>
                  {workCentersByDepartment.map((wc) => (
                    <option key={wc.id} value={wc.id} className="bg-white text-slate-800">
                      {wc.name}
                    </option>
                  ))}
                </select>

                {/* Bulk Dispatch Mode */}
                <select
                  onChange={(event) => {
                    if (event.target.value) {
                      handleBulkApplyDispatchSplitMode(event.target.value);
                      event.target.value = "";
                    }
                  }}
                  className="h-8 border border-[#d4af37] bg-[var(--surface-navy,#102C57)] text-white px-2 text-xs font-bold outline-none rounded-[2px] cursor-pointer"
                >
                  <option value="" className="bg-white text-slate-800">เลือกโหมดแยกใบ...</option>
                  <option value="merge_all" className="bg-white text-slate-800">รวมทุกประเภท</option>
                  <option value="split_by_material_type" className="bg-white text-slate-800">แยก RAW / PACK</option>
                </select>

                {/* Bulk Usage Type */}
                <select
                  onChange={(event) => {
                    if (event.target.value) {
                      handleBulkApplyUsageType(event.target.value);
                      event.target.value = "";
                    }
                  }}
                  className="h-8 border border-[#d4af37] bg-[var(--surface-navy,#102C57)] text-white px-2 text-xs font-bold outline-none rounded-[2px] cursor-pointer"
                >
                  <option value="" className="bg-white text-slate-800">เลือกการใช้งาน...</option>
                  {USAGE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value} className="bg-white text-slate-800">
                      {opt.label}
                    </option>
                  ))}
                </select>

                {/* Bulk Issue Owner */}
                <select
                  onChange={(event) => {
                    if (event.target.value) {
                      handleBulkApplyIssueOwner(event.target.value);
                      event.target.value = "";
                    }
                  }}
                  className="h-8 border border-[#d4af37] bg-[var(--surface-navy,#102C57)] text-white px-2 text-xs font-bold outline-none rounded-[2px] cursor-pointer"
                >
                  <option value="" className="bg-white text-slate-800">เลือกผู้รับผิดชอบเบิก...</option>
                  {departments.map((dept) => (
                    <option key={dept.id} value={dept.id} className="bg-white text-slate-800">
                      {dept.name}
                    </option>
                  ))}
                </select>

                {/* Cancel Select Button */}
                <button
                  type="button"
                  onClick={() => setSelectedRowKeys(new Set())}
                  className="h-8 border border-[#d4af37] text-white hover:bg-[#d4af37] hover:text-[#102C57] px-3 text-xs font-extrabold transition-all rounded-[2px]"
                >
                  ยกเลิกเลือก
                </button>
              </div>
            </div>
          )}

          {/* TABLE AREA */}
          <div className="overflow-x-auto flex-1">
            <table className="w-full min-w-[900px] table-fixed text-xs">
              <thead className="bg-[#eef1f5] text-xs uppercase tracking-[0.08em] text-slate-900 font-extrabold">
                <tr>
                  <th className="w-[3%] px-2 py-2 text-left">
                    <input
                      type="checkbox"
                      checked={visibleRows.length > 0 && visibleRows.every((row) => selectedRowKeys.has(row.rowKey))}
                      onChange={toggleSelectAll}
                      className="h-3.5 w-3.5 rounded-[2px] border-[#cccccc] text-[#102C57] focus:ring-[#102C57]/20 cursor-pointer"
                    />
                  </th>
                  <th className="w-[5%] px-2 py-2 text-left">ประเภท</th>
                  <th className="w-[12%] px-2 py-2 text-left">รหัส</th>
                  <th className="w-[24%] px-2 py-2 text-left">ชื่อใน BOM</th>
                  <th className="w-[6%] px-2 py-2 text-left">หน่วย</th>
                  <th className="w-[14%] px-2 py-2 text-left">ห้องผลิต</th>
                  <th className="w-[12%] px-2 py-2 text-left">แยกใบ</th>
                  <th className="w-[12%] px-2 py-2 text-left">การใช้งาน</th>
                  <th className="w-[12%] px-2 py-2 text-left">แผนกรับผิดชอบเบิก</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="px-3 py-10 text-center text-slate-400">
                      กำลังโหลดข้อมูล...
                    </td>
                  </tr>
                ) : visibleRows.length ? (
                  visibleRows.map((row) => {
                    const rowDept = departments.find((d) => d.id === row.issueOwnerDepartmentId) || selectedDepartment;
                    const rowTheme = getDeptTheme(rowDept?.code, rowDept?.id);
                    
                    const rowBorderColor = rowTheme.border.split(" ")[0] || "border-[#e5e7eb]";
                    const rowBgTint = `${rowTheme.bg}/10`;
                    
                    return (
                      <tr key={row.rowKey} className={`border-t border-[#e5e7eb] border-l-4 ${rowBorderColor} ${rowBgTint}`}>
                        <td className="px-2 py-2 align-top">
                          <input
                            type="checkbox"
                            checked={selectedRowKeys.has(row.rowKey)}
                            onChange={() => toggleSelectRow(row.rowKey)}
                            className="h-3.5 w-3.5 rounded-[2px] border-[#cccccc] text-[#102C57] focus:ring-[#102C57]/20 cursor-pointer"
                          />
                        </td>
                        <td className="px-2 py-2 align-top">
                          <span className={`inline-flex items-center border px-1.5 py-0.5 text-xs font-bold ${componentTone(row.componentType)}`}>
                            {row.componentType}
                          </span>
                        </td>
                        <td className="px-2 py-2 align-top font-mono text-xs font-extrabold text-[#102C57]">
                          <div
                            className="flex items-center gap-1.5"
                            style={{ paddingLeft: `${(row.level - 1) * 1.25}rem` }}
                          >
                            {row.level > 1 && (
                              <span className="text-[#d4af37]/60 font-mono select-none mr-0.5">└─</span>
                            )}
                            <span>{row.componentGoodsCode}</span>
                          </div>
                        </td>
                        <td className="px-2 py-2 align-top text-sm font-bold text-[#102C57]">
                          <div
                            title={row.componentSkuName}
                            className="max-h-[2.8em] overflow-hidden break-words leading-[1.4]"
                          >
                            {row.componentSkuName}
                          </div>
                        </td>
                        <td className="px-2 py-2 align-top text-xs font-bold text-[#102C57]">
                          {row.componentUomName || "-"}
                        </td>
                        <td className="px-2 py-2 align-top">
                          <select
                            value={row.workCenterId}
                            onChange={(event) => handleChangeWorkCenter(row.rowKey, event.target.value)}
                            disabled={(row.roomMode || "explicit") === "inherit_parent"}
                            className={`h-8 w-full border bg-white px-2 text-xs font-bold text-slate-900 outline-none transition-all focus:ring-2 rounded-[2px] ${theme.border}`}
                          >
                            <option value="">เลือกห้องผลิต</option>
                            {workCentersByDepartment.map((workCenter, index) => {
                              const bullets = [
                                "🔵", "🟠", "🟢", "🔴", "🟣", "🟤", "🟡", "⚫",
                                "🟦", "🟧", "🟩", "🟥", "🟪", "🟫", "🟨", "⬛",
                                "💙", "🧡", "💚", "❤️", "💜", "🤎", "💛", "🖤",
                                "🔶", "🔷", "⭐", "🌟", "💎", "🌀", "📍", "🎯", "🔔"
                              ];
                              const roomBullet = bullets[index % bullets.length];
                              return (
                                <option key={workCenter.id} value={workCenter.id}>
                                  {roomBullet} {workCenter.name}
                                </option>
                              );
                            })}
                          </select>
                        </td>
                        <td className="px-2 py-2 align-top">
                          <select
                            value={row.dispatchSplitMode || "merge_all"}
                            onChange={(event) => handleChangeDispatchSplitMode(row.rowKey, event.target.value)}
                            className={`h-8 w-full border px-2 text-xs font-bold outline-none transition-all focus:ring-2 rounded-[2px] ${
                              row.dispatchSplitMode === "split_by_material_type"
                                ? `${rowTheme.border} ${rowTheme.bg} ${rowTheme.text}`
                                : "border-[#cccccc] bg-white text-slate-900"
                            }`}
                          >
                            <option value="merge_all">รวมทุกประเภท</option>
                            <option value="split_by_material_type">แยก RAW / PACK</option>
                          </select>
                        </td>
                        <td className="px-2 py-2 align-top">
                          <select
                            value={row.usageType || "DIRECT"}
                            onChange={(event) => handleChangeUsageType(row.rowKey, event.target.value)}
                            className={`h-8 w-full border px-2 text-xs font-bold outline-none transition-all focus:ring-2 rounded-[2px] ${
                              row.usageType === "PROCESS"
                                ? `${rowTheme.border} ${rowTheme.bg} ${rowTheme.text}`
                                : "border-[#cccccc] bg-white text-slate-900"
                            }`}
                          >
                            {USAGE_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2 align-top">
                          <select
                            value={row.issueOwnerDepartmentId || selectedDepartmentId}
                            onChange={(event) => handleChangeIssueOwner(row.rowKey, event.target.value)}
                            className={`h-8 w-full border px-2 text-xs font-bold outline-none transition-all focus:ring-2 rounded-[2px] ${rowTheme.border} ${rowTheme.bg} ${rowTheme.text}`}
                          >
                            <option value="">เลือกแผนกรับผิดชอบเบิก</option>
                            {departments.map((department) => (
                              <option key={department.id} value={department.id}>
                                {department.name}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={9} className="px-3 py-10 text-center text-slate-900 font-bold text-sm">
                      ไม่พบรายการลูกใน BOM ของสินค้าที่เลือก
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* FOOTER ACTIONS */}
          <div className="flex items-center justify-between border-t border-[#d2d2d2] px-4 py-3 bg-white">
            <input
              value={remark}
              onChange={(event) => setRemark(event.target.value)}
              placeholder="หมายเหตุ (ถ้ามี)"
              className="h-9 w-full max-w-[420px] border border-[#cccccc] px-3 text-sm font-semibold text-slate-900 outline-none focus:border-[#102C57] rounded-[2px]"
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={!canManage || saving || loading}
              className={`ml-3 inline-flex h-9 items-center gap-2 border px-3 text-sm font-extrabold transition-all disabled:opacity-50 rounded-[2px] ${theme.activeBtn}`}
            >
              <CheckSquare size={14} />
              {saving ? "กำลังบันทึก..." : "บันทึก Routing"}
            </button>
          </div>
      </section>
    </div>
  );
}
