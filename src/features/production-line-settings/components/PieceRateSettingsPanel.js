"use client";

import { CheckSquare, Pencil, Plus, Scale, Search, Trash2, X, ChevronLeft, AlertCircle } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchProductionPieceRateSettings,
  updateProductionPieceRateSettings,
} from "@/features/production-line-settings/services/productionLineSettingsClient";

const INPUT_MODES = [
  { value: "kg", label: "ชั่งน้ำหนัก (กก.)" },
  { value: "pail", label: "กรอกปี๊บ" },
];

const WAGE_BASES = [
  { value: "kg", label: "คิดตามน้ำหนัก", hint: "ค่าแรงต่อกิโลกรัม" },
  { value: "count", label: "คิดตามจำนวน", hint: "1 ครั้งชั่ง = 1 จำนวน" },
];

function createClientUuid() {
  if (typeof globalThis !== "undefined" && globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  const part = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, "0");
  return `${part()}${part()}-${part()}-${part()}-${part()}-${part()}${part()}${part()}`;
}

function normalizeNumberInput(value, fallback = "0") {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }
  return String(value);
}

function parseNonNegativeNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Number(parsed.toFixed(4));
}

function parsePositiveNumber(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return Number(parsed.toFixed(4));
}

function createEmptyWeightOption(sortOrder = 0) {
  return {
    id: createClientUuid(),
    label: "",
    weightKg: "",
    isActive: true,
    sortOrder,
  };
}

function createEmptyProfile(sortOrder = 0) {
  return {
    id: createClientUuid(),
    name: "",
    inputMode: "kg",
    wageBasis: "kg",
    payRatePerKg: "0",
    payRatePerUnit: "0",
    kgPerPail: "",
    weightOptions: [createEmptyWeightOption(0)],
    isActive: true,
    sortOrder,
    assignedCount: 0,
  };
}

function buildStateFromPayload(payload = {}) {
  const profiles = Array.isArray(payload.profiles)
    ? payload.profiles.map((item, index) => ({
      id: item.id || createClientUuid(),
      name: String(item.name || ""),
      inputMode: item.inputMode === "pail" ? "pail" : "kg",
      wageBasis: item.wageBasis === "count" ? "count" : "kg",
      payRatePerKg: normalizeNumberInput(item.payRatePerKg, "0"),
      payRatePerUnit: normalizeNumberInput(item.payRatePerUnit, "0"),
      kgPerPail: item.kgPerPail === null || item.kgPerPail === undefined
        ? ""
        : normalizeNumberInput(item.kgPerPail, ""),
      weightOptions: Array.isArray(item.weightOptions) && item.weightOptions.length > 0
        ? item.weightOptions.map((weightItem, weightIndex) => ({
          id: weightItem.id || createClientUuid(),
          label: String(weightItem.label || ""),
          weightKg: normalizeNumberInput(weightItem.weightKg, ""),
          isActive: weightItem.isActive !== false,
          sortOrder: Number.isFinite(Number(weightItem.sortOrder))
            ? Math.max(0, Math.trunc(Number(weightItem.sortOrder)))
            : weightIndex,
        }))
        : (item.inputMode === "pail" && item.kgPerPail
          ? [{
            id: createClientUuid(),
            label: `${normalizeNumberInput(item.kgPerPail, "")} กก.`,
            weightKg: normalizeNumberInput(item.kgPerPail, ""),
            isActive: true,
            sortOrder: 0,
          }]
          : []),
      isActive: item.isActive !== false,
      sortOrder: Number.isFinite(Number(item.sortOrder))
        ? Math.max(0, Math.trunc(Number(item.sortOrder)))
        : index,
      assignedCount: Number(item.assignedCount || 0),
    }))
    : [];

  const products = Array.isArray(payload.products) ? payload.products : [];
  const mappingByCode = {};
  products.forEach((item) => {
    const code = String(item.code || "").trim().toUpperCase();
    if (code) {
      mappingByCode[code] = {
        profileId: item.profileId || "",
        weightOptionId: item.weightOptionId || "",
      };
    }
  });

  return {
    profiles,
    products,
    mappingByCode,
  };
}

function formatInputModeLabel(value) {
  return value === "pail" ? "กรอกปี๊บ" : "ชั่งน้ำหนัก";
}

function formatWageBasisLabel(value) {
  return value === "count" ? "ตามจำนวน" : "ตามน้ำหนัก";
}

function buildRateLabel(profile) {
  if (profile.wageBasis === "count") {
    return `${normalizeNumberInput(profile.payRatePerUnit, "0")} บาท/ครั้ง`;
  }
  return `${normalizeNumberInput(profile.payRatePerKg, "0")} บาท/กก.`;
}

export default function PieceRateSettingsPanel({ canManage = false }) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [search, setSearch] = useState("");
  const [profiles, setProfiles] = useState([]);
  const [products, setProducts] = useState([]);
  const [mappingByCode, setMappingByCode] = useState({});
  const [modalDraft, setModalDraft] = useState(() => createEmptyProfile());
  const [editingProfileId, setEditingProfileId] = useState("");
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState("unassigned");
  const [showDetailOnMobile, setShowDetailOnMobile] = useState(false);
  const [assignedSearch, setAssignedSearch] = useState("");
  const [assignMoreSearch, setAssignMoreSearch] = useState("");
  const [unassignedSearch, setUnassignedSearch] = useState("");
  const [isAssignMoreOpen, setIsAssignMoreOpen] = useState(false);
  const [selectedToAssign, setSelectedToAssign] = useState(new Set());
  const [selectedUnassigned, setSelectedUnassigned] = useState(new Set());
  const [bulkAssignProfileId, setBulkAssignProfileId] = useState("");

  const applyPayload = useCallback((payload) => {
    const next = buildStateFromPayload(payload);
    setProfiles(next.profiles);
    setProducts(next.products);
    setMappingByCode(next.mappingByCode);
  }, []);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    const result = await fetchProductionPieceRateSettings();
    setLoading(false);
    if (!result.ok) {
      setErrorMessage(result.error?.message || "โหลดค่าตั้งต้นอัตราค่าแรงสินค้าไม่สำเร็จ");
      return;
    }
    applyPayload(result.data?.data || {});
  }, [applyPayload]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadSettings();
    }, 0);
    return () => {
      window.clearTimeout(timer);
    };
  }, [loadSettings]);

  const sortedProfiles = useMemo(() => (
    [...profiles].sort((a, b) => {
      if (a.sortOrder !== b.sortOrder) {
        return a.sortOrder - b.sortOrder;
      }
      return a.name.localeCompare(b.name, "th");
    })
  ), [profiles]);

  const profileById = useMemo(() => (
    new Map(sortedProfiles.map((profile) => [profile.id, profile]))
  ), [sortedProfiles]);

  const selectedProfile = useMemo(() => {
    return sortedProfiles.find((p) => p.id === selectedProfileId);
  }, [sortedProfiles, selectedProfileId]);

  // Get all products mapped to each profile
  const assignedProductsByProfile = useMemo(() => {
    const map = new Map();
    profiles.forEach((p) => map.set(p.id, []));
    
    products.forEach((product) => {
      const mapping = mappingByCode[product.code];
      if (mapping?.profileId && map.has(mapping.profileId)) {
        map.get(mapping.profileId).push(product);
      }
    });
    return map;
  }, [profiles, products, mappingByCode]);

  // Get all unassigned products
  const unassignedProducts = useMemo(() => {
    return products.filter((product) => {
      const mapping = mappingByCode[product.code];
      return !mapping || !mapping.profileId;
    });
  }, [products, mappingByCode]);

  // Filter assigned products of current profile
  const filteredAssigned = useMemo(() => {
    const list = assignedProductsByProfile.get(selectedProfileId) || [];
    const keyword = String(assignedSearch || "").trim().toLowerCase();
    if (!keyword) return list;
    return list.filter((item) => (
      String(item.code || "").toLowerCase().includes(keyword)
      || String(item.goodsCode || "").toLowerCase().includes(keyword)
      || String(item.skuCode || "").toLowerCase().includes(keyword)
      || String(item.name || "").toLowerCase().includes(keyword)
      || String(item.brandName || "").toLowerCase().includes(keyword)
    ));
  }, [assignedProductsByProfile, selectedProfileId, assignedSearch]);

  // Filter unassigned products list
  const filteredUnassigned = useMemo(() => {
    const keyword = String(unassignedSearch || "").trim().toLowerCase();
    if (!keyword) return unassignedProducts;
    return unassignedProducts.filter((item) => (
      String(item.code || "").toLowerCase().includes(keyword)
      || String(item.goodsCode || "").toLowerCase().includes(keyword)
      || String(item.skuCode || "").toLowerCase().includes(keyword)
      || String(item.name || "").toLowerCase().includes(keyword)
      || String(item.brandName || "").toLowerCase().includes(keyword)
    ));
  }, [unassignedProducts, unassignedSearch]);

  // Filter products available to assign to current profile
  const availableToAssign = useMemo(() => {
    const currentProfileProducts = new Set((assignedProductsByProfile.get(selectedProfileId) || []).map(p => p.code));
    const list = products.filter(p => !currentProfileProducts.has(p.code));
    const keyword = String(assignMoreSearch || "").trim().toLowerCase();
    if (!keyword) return list;
    return list.filter((item) => (
      String(item.code || "").toLowerCase().includes(keyword)
      || String(item.goodsCode || "").toLowerCase().includes(keyword)
      || String(item.skuCode || "").toLowerCase().includes(keyword)
      || String(item.name || "").toLowerCase().includes(keyword)
      || String(item.brandName || "").toLowerCase().includes(keyword)
    ));
  }, [products, assignedProductsByProfile, selectedProfileId, assignMoreSearch]);

  const summary = useMemo(() => {
    const mappedProducts = products.reduce((count, item) => (
      mappingByCode[item.code]?.profileId ? count + 1 : count
    ), 0);
    const activeProfiles = profiles.reduce((count, item) => (
      item.isActive ? count + 1 : count
    ), 0);
    const countBasisProfiles = profiles.reduce((count, item) => (
      item.wageBasis === "count" ? count + 1 : count
    ), 0);

    return {
      totalProducts: products.length,
      mappedProducts,
      unmappedProducts: Math.max(0, products.length - mappedProducts),
      totalProfiles: profiles.length,
      activeProfiles,
      countBasisProfiles,
    };
  }, [mappingByCode, products, profiles]);

  const handleAssignSelected = useCallback(() => {
    if (selectedToAssign.size === 0) return;
    setMappingByCode((prev) => {
      const next = { ...prev };
      selectedToAssign.forEach((code) => {
        next[code] = {
          profileId: selectedProfileId,
          weightOptionId: "",
        };
      });
      return next;
    });
    setSelectedToAssign(new Set());
    setIsAssignMoreOpen(false);
  }, [selectedToAssign, selectedProfileId]);

  const handleUnassignProduct = useCallback((productCode) => {
    setMappingByCode((prev) => {
      const next = { ...prev };
      next[productCode] = {
        profileId: "",
        weightOptionId: "",
      };
      return next;
    });
  }, []);

  const handleBulkAssignUnassigned = useCallback(() => {
    if (selectedUnassigned.size === 0 || !bulkAssignProfileId) return;
    setMappingByCode((prev) => {
      const next = { ...prev };
      selectedUnassigned.forEach((code) => {
        next[code] = {
          profileId: bulkAssignProfileId,
          weightOptionId: "",
        };
      });
      return next;
    });
    setSelectedUnassigned(new Set());
    setBulkAssignProfileId("");
  }, [selectedUnassigned, bulkAssignProfileId]);

  const isAllUnassignedSelected = filteredUnassigned.length > 0 && selectedUnassigned.size === filteredUnassigned.length;
  const handleToggleSelectAllUnassigned = useCallback(() => {
    if (isAllUnassignedSelected) {
      setSelectedUnassigned(new Set());
    } else {
      setSelectedUnassigned(new Set(filteredUnassigned.map(item => item.code)));
    }
  }, [isAllUnassignedSelected, filteredUnassigned]);

  const isAllToAssignSelected = availableToAssign.length > 0 && selectedToAssign.size === availableToAssign.length;
  const handleToggleSelectAllToAssign = useCallback(() => {
    if (isAllToAssignSelected) {
      setSelectedToAssign(new Set());
    } else {
      setSelectedToAssign(new Set(availableToAssign.map(item => item.code)));
    }
  }, [isAllToAssignSelected, availableToAssign]);

  const closeProfileModal = useCallback(() => {
    setIsProfileModalOpen(false);
    setEditingProfileId("");
    setModalDraft(createEmptyProfile(profiles.length));
  }, [profiles.length]);

  const openCreateProfileModal = useCallback(() => {
    if (!canManage) {
      return;
    }
    setErrorMessage("");
    setEditingProfileId("");
    setModalDraft(createEmptyProfile(profiles.length));
    setIsProfileModalOpen(true);
  }, [canManage, profiles.length]);

  const openEditProfileModal = useCallback((profile) => {
    if (!canManage || !profile) {
      return;
    }
    setErrorMessage("");
    setEditingProfileId(profile.id);
    setModalDraft({
      id: profile.id,
      name: profile.name,
      inputMode: profile.inputMode,
      wageBasis: profile.wageBasis === "count" ? "count" : "kg",
      payRatePerKg: normalizeNumberInput(profile.payRatePerKg, "0"),
      payRatePerUnit: normalizeNumberInput(profile.payRatePerUnit, "0"),
      kgPerPail: profile.kgPerPail === null || profile.kgPerPail === undefined
        ? ""
        : normalizeNumberInput(profile.kgPerPail, ""),
      weightOptions: Array.isArray(profile.weightOptions) && profile.weightOptions.length > 0
        ? profile.weightOptions.map((weightItem, weightIndex) => ({
          id: weightItem.id || createClientUuid(),
          label: String(weightItem.label || ""),
          weightKg: normalizeNumberInput(weightItem.weightKg, ""),
          isActive: weightItem.isActive !== false,
          sortOrder: Number.isFinite(Number(weightItem.sortOrder))
            ? Math.max(0, Math.trunc(Number(weightItem.sortOrder)))
            : weightIndex,
        }))
        : [createEmptyWeightOption(0)],
      isActive: profile.isActive !== false,
      sortOrder: Number.isFinite(Number(profile.sortOrder))
        ? Math.max(0, Math.trunc(Number(profile.sortOrder)))
        : 0,
      assignedCount: Number(profile.assignedCount || 0),
    });
    setIsProfileModalOpen(true);
  }, [canManage]);

  const handleModalFieldChange = useCallback((field, value) => {
    setModalDraft((prev) => {
      if (field === "inputMode") {
        const nextInputMode = value === "pail" ? "pail" : "kg";
        return {
          ...prev,
          inputMode: nextInputMode,
          kgPerPail: nextInputMode === "kg" ? "" : prev.kgPerPail,
          weightOptions: nextInputMode === "pail"
            ? (prev.weightOptions?.length ? prev.weightOptions : [createEmptyWeightOption(0)])
            : [],
        };
      }

      if (field === "wageBasis") {
        return {
          ...prev,
          wageBasis: value === "count" ? "count" : "kg",
        };
      }

      return {
        ...prev,
        [field]: value,
      };
    });
  }, []);

  const handleWeightOptionChange = useCallback((weightOptionId, field, value) => {
    setModalDraft((prev) => ({
      ...prev,
      weightOptions: (prev.weightOptions || []).map((item) => (
        item.id === weightOptionId
          ? { ...item, [field]: value }
          : item
      )),
    }));
  }, []);

  const handleAddWeightOption = useCallback(() => {
    setModalDraft((prev) => ({
      ...prev,
      weightOptions: [...(prev.weightOptions || []), createEmptyWeightOption(prev.weightOptions?.length || 0)],
    }));
  }, []);

  const handleRemoveWeightOption = useCallback((weightOptionId) => {
    setModalDraft((prev) => {
      const nextWeightOptions = (prev.weightOptions || []).filter((item) => item.id !== weightOptionId);
      return {
        ...prev,
        weightOptions: nextWeightOptions.length > 0 ? nextWeightOptions : [createEmptyWeightOption(0)],
      };
    });
  }, []);

  const commitProfileDraft = useCallback(() => {
    if (!canManage) {
      return;
    }

    const name = String(modalDraft.name || "").trim();
    if (!name) {
      setErrorMessage("กรุณากรอกชื่อหัวข้ออัตราค่าแรง");
      return;
    }

    const duplicate = profiles.some((item) => (
      item.id !== editingProfileId
      && String(item.name || "").trim().toLowerCase() === name.toLowerCase()
    ));
    if (duplicate) {
      setErrorMessage(`พบชื่อหัวข้อซ้ำ: ${name}`);
      return;
    }

    const payRatePerKg = parseNonNegativeNumber(modalDraft.payRatePerKg);
    if (payRatePerKg === null) {
      setErrorMessage(`อัตราค่าแรงต่อกิโลของ "${name}" ต้องเป็นตัวเลขมากกว่าหรือเท่ากับ 0`);
      return;
    }

    const payRatePerUnit = parseNonNegativeNumber(modalDraft.payRatePerUnit);
    if (payRatePerUnit === null) {
      setErrorMessage(`อัตราค่าแรงต่อจำนวนของ "${name}" ต้องเป็นตัวเลขมากกว่าหรือเท่ากับ 0`);
      return;
    }

    let kgPerPail = "";
    let weightOptions = [];
    if (modalDraft.inputMode === "pail") {
      try {
        weightOptions = (modalDraft.weightOptions || []).map((item, index) => {
          const label = String(item.label || "").trim();
          const parsedWeightKg = parsePositiveNumber(item.weightKg);
          if (!label || parsedWeightKg === null) {
            throw new Error(`น้ำหนักมาตรฐานลำดับที่ ${index + 1} ของ "${name}" ไม่สมบูรณ์`);
          }
          return {
            id: item.id || createClientUuid(),
            label,
            weightKg: normalizeNumberInput(parsedWeightKg, ""),
            isActive: item.isActive !== false,
            sortOrder: Number.isFinite(Number(item.sortOrder))
              ? Math.max(0, Math.trunc(Number(item.sortOrder)))
              : index,
          };
        });
      } catch (error) {
        setErrorMessage(error.message || `น้ำหนักมาตรฐานของ "${name}" ไม่สมบูรณ์`);
        return;
      }
      if (weightOptions.length === 0) {
        setErrorMessage(`กรุณาเพิ่มน้ำหนักมาตรฐานอย่างน้อย 1 รายการสำหรับ "${name}"`);
        return;
      }
      kgPerPail = weightOptions[0]?.weightKg || "";
    }

    setProfiles((prev) => {
      const nextProfile = {
        id: modalDraft.id,
        name,
        inputMode: modalDraft.inputMode === "pail" ? "pail" : "kg",
        wageBasis: modalDraft.wageBasis === "count" ? "count" : "kg",
        payRatePerKg: normalizeNumberInput(payRatePerKg, "0"),
        payRatePerUnit: normalizeNumberInput(payRatePerUnit, "0"),
        kgPerPail,
        weightOptions,
        isActive: modalDraft.isActive !== false,
        sortOrder: Number.isFinite(Number(modalDraft.sortOrder))
          ? Math.max(0, Math.trunc(Number(modalDraft.sortOrder)))
          : prev.length,
        assignedCount: Number(modalDraft.assignedCount || 0),
      };

      if (!editingProfileId) {
        return [...prev, nextProfile];
      }

      return prev.map((item) => (item.id === editingProfileId ? nextProfile : item));
    });

    setSelectedProfileId(modalDraft.id);
    setErrorMessage("");
    closeProfileModal();
  }, [canManage, closeProfileModal, editingProfileId, modalDraft, profiles]);

  const handleDeleteProfile = useCallback((profileId) => {
    if (!canManage) {
      return;
    }

    setProfiles((prev) => prev.filter((item) => item.id !== profileId));
    setMappingByCode((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((code) => {
        if (next[code]?.profileId === profileId) {
          next[code] = {
            profileId: "",
            weightOptionId: "",
          };
        }
      });
      return next;
    });

    if (editingProfileId === profileId) {
      closeProfileModal();
    }

    setSelectedProfileId((prev) => (prev === profileId ? "unassigned" : prev));
  }, [canManage, closeProfileModal, editingProfileId]);

  const handleSave = useCallback(async () => {
    if (!canManage) {
      return;
    }

    const normalizedProfiles = [];
    const seenNames = new Set();

    for (let index = 0; index < profiles.length; index += 1) {
      const item = profiles[index];
      const name = String(item.name || "").trim();
      if (!name) {
        setErrorMessage(`กรุณากรอกชื่อหัวข้ออัตราค่าแรง ลำดับที่ ${index + 1}`);
        return;
      }

      const nameKey = name.toLowerCase();
      if (seenNames.has(nameKey)) {
        setErrorMessage(`พบชื่อหัวข้อซ้ำ: ${name}`);
        return;
      }
      seenNames.add(nameKey);

      const payRatePerKg = parseNonNegativeNumber(item.payRatePerKg);
      if (payRatePerKg === null) {
        setErrorMessage(`อัตราค่าแรงต่อกิโลของ "${name}" ต้องเป็นตัวเลขมากกว่าหรือเท่ากับ 0`);
        return;
      }

      const payRatePerUnit = parseNonNegativeNumber(item.payRatePerUnit);
      if (payRatePerUnit === null) {
        setErrorMessage(`อัตราค่าแรงต่อจำนวนของ "${name}" ต้องเป็นตัวเลขมากกว่าหรือเท่ากับ 0`);
        return;
      }

      let kgPerPail = null;
      let weightOptions = [];
      if (item.inputMode === "pail") {
        weightOptions = (item.weightOptions || []).map((weightItem, weightIndex) => {
          const label = String(weightItem.label || "").trim();
          const parsedWeightKg = parsePositiveNumber(weightItem.weightKg);
          if (!label || parsedWeightKg === null) {
            return null;
          }
          return {
            id: weightItem.id || createClientUuid(),
            label,
            weightKg: parsedWeightKg,
            isActive: weightItem.isActive !== false,
            sortOrder: Number.isFinite(Number(weightItem.sortOrder))
              ? Math.max(0, Math.trunc(Number(weightItem.sortOrder)))
              : weightIndex,
          };
        }).filter(Boolean);
        if (weightOptions.length === 0) {
          setErrorMessage(`กรุณากำหนดน้ำหนักมาตรฐานอย่างน้อย 1 รายการสำหรับ "${name}"`);
          return;
        }
        kgPerPail = weightOptions[0].weightKg;
      }

      normalizedProfiles.push({
        id: item.id,
        name,
        inputMode: item.inputMode === "pail" ? "pail" : "kg",
        wageBasis: item.wageBasis === "count" ? "count" : "kg",
        payRatePerKg,
        payRatePerUnit,
        kgPerPail,
        weightOptions,
        isActive: item.isActive !== false,
        sortOrder: Number.isFinite(Number(item.sortOrder))
          ? Math.max(0, Math.trunc(Number(item.sortOrder)))
          : index,
      });
    }

    const mappings = products.map((item) => ({
      productCode: item.code,
      goodsCode: item.goodsCode || item.code,
      skuCode: item.skuCode || "",
      profileId: mappingByCode[item.code]?.profileId || null,
      weightOptionId: mappingByCode[item.code]?.weightOptionId || null,
    }));

    const invalidProductMapping = products.find((item) => {
      const selectedProfile = profileById.get(mappingByCode[item.code]?.profileId || "");
      return selectedProfile?.inputMode === "pail" && !mappingByCode[item.code]?.weightOptionId;
    });
    if (invalidProductMapping) {
      setErrorMessage(`กรุณาเลือกน้ำหนักมาตรฐานให้สินค้า ${invalidProductMapping.code}`);
      return;
    }

    setSaving(true);
    setErrorMessage("");
    const result = await updateProductionPieceRateSettings({
      profiles: normalizedProfiles,
      mappings,
    });
    setSaving(false);

    if (!result.ok) {
      setErrorMessage(result.error?.message || "บันทึกหัวข้ออัตราค่าแรงสินค้าไม่สำเร็จ");
      return;
    }

    applyPayload(result.data?.data || {});
    closeProfileModal();
  }, [applyPayload, canManage, closeProfileModal, mappingByCode, products, profileById, profiles]);

  return (
    <section className="overflow-hidden rounded-[2px] border border-slate-200 bg-white text-[#181818] shadow-none">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-bold tracking-wider text-[#102C57] uppercase">หัวข้ออัตราค่าแรงสินค้า</h3>
            <p className="mt-1 text-xs text-[#666666]">
              กำหนดโปรไฟล์ค่าแรงและวิธีคิดค่าแรง จากนั้นเลือกผูกสินค้าเข้ากับหัวข้อตามความเหมาะสม
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={openCreateProfileModal}
              disabled={!canManage || saving || loading}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-[2px] border border-[#102C57] bg-white px-4 text-xs font-bold text-[#102C57] transition hover:bg-[#102C57]/[0.04] disabled:opacity-50"
            >
              <Plus size={14} />
              เพิ่มหัวข้อ
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!canManage || saving || loading}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-[2px] bg-[#102C57] px-4 text-xs font-bold text-white transition hover:bg-[#1b3e70] border border-[#102C57] disabled:opacity-50"
            >
              <CheckSquare size={14} />
              {saving ? "กำลังบันทึก..." : "บันทึกการตั้งค่า"}
            </button>
          </div>
        </div>

        {errorMessage ? (
          <div className="mt-3 rounded-[2px] border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col justify-between rounded-[2px] border border-slate-200 bg-white p-3 shadow-none border-l-4 border-l-[#102C57]">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#666666]">โปรไฟล์ทั้งหมด</span>
            <span className="mt-1 text-base font-bold text-[#102C57]">{summary.totalProfiles.toLocaleString()} รายการ</span>
          </div>
          <div className="flex flex-col justify-between rounded-[2px] border border-slate-200 bg-white p-3 shadow-none border-l-4 border-l-emerald-600">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#666666]">ใช้งานอยู่</span>
            <span className="mt-1 text-base font-bold text-emerald-700">{summary.activeProfiles.toLocaleString()} รายการ</span>
          </div>
          <div className="flex flex-col justify-between rounded-[2px] border border-slate-200 bg-white p-3 shadow-none border-l-4 border-l-[#d4a938]">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-[#666666]">สินค้าที่ยังไม่ผูก</span>
            <span className="mt-1 text-base font-bold text-[#d4a938]">{summary.unmappedProducts.toLocaleString()} รายการ</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col xl:flex-row min-h-[640px] bg-white border-t border-slate-200">
        {/* Sidebar: Profiles List */}
        <div className={`w-full xl:w-[320px] shrink-0 border-r border-slate-200 bg-slate-50/50 flex flex-col ${
          showDetailOnMobile ? "hidden xl:flex" : "flex"
        }`}>
          <div className="p-4 border-b border-slate-200 bg-slate-50">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#666666]">โปรไฟล์ & ตัวเลือกอัตราค่าแรง</span>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2 max-h-[calc(100vh-22rem)] min-h-[300px]">
            {/* Unassigned Card */}
            <button
              type="button"
              onClick={() => {
                setSelectedProfileId("unassigned");
                setShowDetailOnMobile(true);
              }}
              className={`w-full text-left p-3.5 rounded-[2px] border transition-all duration-200 ${
                selectedProfileId === "unassigned"
                  ? "border-[#d4a938] bg-amber-50/30 border-l-4 border-l-[#d4a938] shadow-sm"
                  : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex justify-between items-start">
                <span className="font-bold text-xs text-slate-800 tracking-wide">สินค้าที่ยังไม่ผูกค่าแรง</span>
                <span className="bg-amber-100 text-amber-800 text-[10px] font-bold px-2 py-0.5 rounded-[2px] uppercase">
                  {unassignedProducts.length} สินค้า
                </span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500 font-medium">
                รายการสินค้าตกค้างที่ยังไม่ได้รับการผูก
              </p>
            </button>

            {/* Profiles List */}
            {loading && (
              <div className="text-center py-8 text-xs text-slate-400 font-medium">กำลังโหลดโปรไฟล์...</div>
            )}
            {!loading && sortedProfiles.length === 0 && (
              <div className="text-center py-8 text-xs text-slate-400 font-medium">ยังไม่มีข้อมูลหัวข้ออัตราค่าแรง</div>
            )}
            {!loading && sortedProfiles.map((p) => {
              const count = assignedProductsByProfile.get(p.id)?.length || 0;
              const isSelected = selectedProfileId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    setSelectedProfileId(p.id);
                    setShowDetailOnMobile(true);
                  }}
                  className={`w-full text-left p-3.5 rounded-[2px] border transition-all duration-200 ${
                    isSelected
                      ? "border-[#102C57] bg-blue-50/20 border-l-4 border-l-[#102C57] shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <span className="font-bold text-xs text-[#102C57] tracking-wide line-clamp-1">{p.name}</span>
                    <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded-[2px] shrink-0 font-mono">
                      {count} SKU
                    </span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[11px] font-semibold">
                    <span className="text-[#666666] font-medium">{formatInputModeLabel(p.inputMode)} &bull; {formatWageBasisLabel(p.wageBasis)}</span>
                    <span className="text-[#102C57] font-bold">{buildRateLabel(p)}</span>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between text-[9px] uppercase tracking-wider font-bold">
                    <span className={p.isActive ? "text-emerald-700" : "text-slate-400"}>
                      {p.isActive ? "● ใช้งานอยู่" : "○ ปิดใช้งาน"}
                    </span>
                    <span className="text-slate-400">ลำดับ {p.sortOrder}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Detail Workspace */}
        <div className={`flex-1 p-4 sm:p-6 flex flex-col ${
          showDetailOnMobile ? "block" : "hidden xl:block"
        }`}>
          {/* Mobile Back Button */}
          <button
            type="button"
            onClick={() => setShowDetailOnMobile(false)}
            className="xl:hidden inline-flex items-center gap-1 text-xs font-bold text-[#102C57] mb-4 hover:underline"
          >
            <ChevronLeft size={14} />
            ย้อนกลับไปรายการหัวข้อ
          </button>

          {selectedProfileId === "unassigned" ? (
            /* Unassigned Products Detail Panel */
            <div className="space-y-6 flex-1 flex flex-col">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between border-b border-slate-200 pb-4">
                <div>
                  <h4 className="text-base font-bold text-[#102C57]">สินค้าที่ยังไม่ผูกอัตราค่าแรง</h4>
                  <p className="mt-1 text-xs text-[#666666]">
                    ค้นหาและเลือกสินค้าที่ตกค้างเพื่อทำการผูกเข้ากับโปรไฟล์อัตราค่าแรงแบบกลุ่ม (Bulk Assign)
                  </p>
                </div>
                <div className="relative min-w-[240px]">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    value={unassignedSearch}
                    onChange={(event) => setUnassignedSearch(event.target.value)}
                    placeholder="ค้นหารหัสสินค้า, ชื่อสินค้า..."
                    className="h-9 w-full rounded-[2px] border border-slate-300 bg-white pl-9 pr-3 text-xs text-[#181818] placeholder:text-slate-400 focus:border-[#102C57] focus:ring-1 focus:ring-[#102C57] outline-none"
                  />
                </div>
              </div>

              {/* Bulk Mapping Bar */}
              <div className="p-4 rounded-[2px] border border-amber-200 bg-amber-50/20 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs font-semibold text-amber-900">
                  เลือกสินค้าแล้ว <span className="font-bold text-base text-[#102C57] tabular-nums">{selectedUnassigned.size}</span> รายการ
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  <span className="text-xs font-bold text-slate-700">ผูกสินค้าที่เลือกเข้ากับโปรไฟล์:</span>
                  <select
                    value={bulkAssignProfileId}
                    onChange={(event) => setBulkAssignProfileId(event.target.value)}
                    className="h-9 rounded-[2px] border border-slate-300 bg-white px-3 text-xs text-[#181818] focus:border-[#102C57] outline-none"
                  >
                    <option value="">-- เลือกหัวข้ออัตราค่าแรง --</option>
                    {sortedProfiles.map((p) => (
                      <option key={p.id} value={p.id}>{p.name} | {buildRateLabel(p)}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleBulkAssignUnassigned}
                    disabled={!bulkAssignProfileId || selectedUnassigned.size === 0}
                    className="h-9 px-4 bg-[#102C57] text-white text-xs font-bold rounded-[2px] transition hover:bg-[#1c3f71] disabled:opacity-40"
                  >
                    ยืนยันการผูกสินค้า
                  </button>
                </div>
              </div>

              {/* Unassigned Table Container */}
              <div className="flex-1 overflow-auto border border-slate-200 rounded-[2px]">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wider text-[#102C57] font-bold border-b border-slate-200">
                    <tr>
                      <th className="px-3 py-2.5 text-left w-10">
                        <input
                          type="checkbox"
                          checked={isAllUnassignedSelected}
                          onChange={handleToggleSelectAllUnassigned}
                          className="h-4 w-4 rounded-[2px] border-slate-300 text-[#102C57] focus:ring-[#102C57]"
                        />
                      </th>
                      <th className="px-3 py-2.5 text-left w-[15%]">Trade Code</th>
                      <th className="px-3 py-2.5 text-left w-[15%]">SKU</th>
                      <th className="px-3 py-2.5 text-left">ชื่อสินค้า</th>
                      <th className="px-3 py-2.5 text-left w-[15%]">แบรนด์</th>
                      <th className="px-3 py-2.5 text-left w-[10%]">หน่วย</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white font-mono text-xs">
                    {filteredUnassigned.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-8 text-center text-slate-400 font-medium font-sans">ไม่พบสินค้าตกค้าง</td>
                      </tr>
                    ) : null}
                    {filteredUnassigned.map((item) => {
                      const isChecked = selectedUnassigned.has(item.code);
                      return (
                        <tr key={item.code} className="hover:bg-slate-50 transition-colors">
                          <td className="px-3 py-3">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setSelectedUnassigned((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(item.code)) {
                                    next.delete(item.code);
                                  } else {
                                    next.add(item.code);
                                  }
                                  return next;
                                });
                              }}
                              className="h-4 w-4 rounded-[2px] border-slate-300 text-[#102C57] focus:ring-[#102C57]"
                            />
                          </td>
                          <td className="px-3 py-3 font-bold text-[#102C57]">{item.goodsCode || item.code}</td>
                          <td className="px-3 py-3 text-slate-650">{item.skuCode || "-"}</td>
                          <td className="px-3 py-3 font-medium text-slate-800 font-sans">{item.name}</td>
                          <td className="px-3 py-3 text-slate-500 font-medium font-sans">{item.brandName || "-"}</td>
                          <td className="px-3 py-3 text-slate-500 font-semibold font-sans">{item.unit || "-"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            /* Profile Details & Mapping Pane */
            selectedProfile && (
              <div className="space-y-6 flex-1 flex flex-col">
                {/* Profile Meta Section */}
                <div className="border border-slate-200 rounded-[2px] bg-slate-50 p-4.5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#666666]">รายละเอียดอัตราค่าแรง</span>
                      <h4 className="text-lg font-bold text-[#102C57] mt-0.5">{selectedProfile.name}</h4>
                      <div className="mt-2.5 flex flex-wrap gap-2.5 text-xs font-semibold text-slate-700">
                        <span className="px-2.5 py-1 bg-white border border-slate-200 rounded-[2px]">
                          วิธีรับค่า: <strong className="text-[#102C57]">{formatInputModeLabel(selectedProfile.inputMode)}</strong>
                        </span>
                        <span className="px-2.5 py-1 bg-white border border-slate-200 rounded-[2px]">
                          วิธีคิดค่าแรง: <strong className="text-[#102C57]">{formatWageBasisLabel(selectedProfile.wageBasis)}</strong>
                        </span>
                        <span className="px-2.5 py-1 bg-white border border-slate-200 rounded-[2px]">
                          อัตราค่าแรง: <strong className="text-emerald-700">{buildRateLabel(selectedProfile)}</strong>
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => openEditProfileModal(selectedProfile)}
                        disabled={!canManage || saving || loading}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[2px] border border-slate-300 bg-white px-3.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
                      >
                        <Pencil size={12} />
                        แก้ไขหัวข้อ
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteProfile(selectedProfile.id)}
                        disabled={!canManage || saving || loading}
                        className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[2px] border border-red-200 hover:border-red-650 bg-white px-3.5 text-xs font-bold text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                      >
                        <Trash2 size={12} />
                        ลบหัวข้อ
                      </button>
                    </div>
                  </div>

                  {selectedProfile.inputMode === "pail" && (
                    <div className="mt-3.5 pt-3.5 border-t border-slate-200">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#666666]">น้ำหนักมาตรฐานที่มี ({selectedProfile.weightOptions?.length || 0}):</span>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {(selectedProfile.weightOptions || []).map((opt) => (
                          <span key={opt.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-[2px] border border-[#d4a938]/30 bg-amber-50/40 text-[#b48820] text-xs font-bold font-mono">
                            {opt.label} ({opt.weightKg} กก.)
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Assigned Products Title & Trigger */}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#102C57]">
                      สินค้าในหัวข้อนี้ ({filteredAssigned.length} รายการ)
                    </h4>
                  </div>
                  <div className="flex flex-wrap gap-2 items-center">
                    <div className="relative min-w-[200px]">
                      <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        value={assignedSearch}
                        onChange={(event) => setAssignedSearch(event.target.value)}
                        placeholder="ค้นหาสินค้าในหัวข้อ..."
                        className="h-8.5 w-full rounded-[2px] border border-slate-300 bg-white pl-9 pr-3 text-xs text-[#181818] outline-none"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsAssignMoreOpen(!isAssignMoreOpen)}
                      className="inline-flex h-8.5 items-center justify-center gap-1.5 rounded-[2px] bg-[#102C57] text-white px-3.5 text-xs font-bold transition hover:bg-[#1a3d6b]"
                    >
                      <Plus size={13} />
                      {isAssignMoreOpen ? "ปิดแผงผูกสินค้า" : "ผูกสินค้าเพิ่ม"}
                    </button>
                  </div>
                </div>

                {/* Inline Add/Assign Panel */}
                {isAssignMoreOpen && (
                  <div className="border border-slate-200 rounded-[2px] bg-slate-50 p-4 space-y-4 transition-all duration-300">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-slate-200 pb-3">
                      <div>
                        <h5 className="text-xs font-bold text-[#102C57] uppercase tracking-wider">ผูกสินค้าเพิ่มเติม</h5>
                        <p className="text-[11px] text-[#666666]">ติ๊กเลือกสินค้าที่ต้องการนำมาเข้าหัวข้อ &ldquo;{selectedProfile.name}&rdquo;</p>
                      </div>
                      <div className="relative min-w-[200px]">
                        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          value={assignMoreSearch}
                          onChange={(event) => setAssignMoreSearch(event.target.value)}
                          placeholder="ค้นหาสินค้าที่สามารถผูกได้..."
                          className="h-8 w-full rounded-[2px] border border-slate-300 bg-white pl-8 pr-2.5 text-xs outline-none"
                        />
                      </div>
                    </div>

                    {/* Available List Scroll Box */}
                    <div className="max-h-[240px] overflow-auto border border-slate-200 bg-white rounded-[2px]">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 bg-slate-100 text-[10px] text-slate-600 font-bold border-b border-slate-200">
                          <tr>
                            <th className="px-3 py-2 text-left w-10">
                              <input
                                type="checkbox"
                                checked={isAllToAssignSelected}
                                onChange={handleToggleSelectAllToAssign}
                                className="h-4 w-4 rounded-[2px]"
                              />
                            </th>
                            <th className="px-3 py-2 text-left w-[20%]">Trade Code</th>
                            <th className="px-3 py-2 text-left">ชื่อสินค้า</th>
                            <th className="px-3 py-2 text-left w-[20%]">แบรนด์</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 bg-white font-mono text-xs">
                          {availableToAssign.length === 0 ? (
                            <tr>
                              <td colSpan={4} className="px-3 py-6 text-center text-slate-400 font-sans">ไม่พบสินค้าอื่นๆ ให้เลือก</td>
                            </tr>
                          ) : null}
                          {availableToAssign.map((item) => {
                            const isChecked = selectedToAssign.has(item.code);
                            return (
                              <tr key={item.code} className="hover:bg-slate-50">
                                <td className="px-3 py-2">
                                  <input
                                    type="checkbox"
                                    checked={isChecked}
                                    onChange={() => {
                                      setSelectedToAssign((prev) => {
                                        const next = new Set(prev);
                                        if (next.has(item.code)) {
                                          next.delete(item.code);
                                        } else {
                                          next.add(item.code);
                                        }
                                        return next;
                                      });
                                    }}
                                    className="h-4 w-4 rounded-[2px]"
                                  />
                                </td>
                                <td className="px-3 py-2 font-bold text-[#102C57]">{item.goodsCode || item.code}</td>
                                <td className="px-3 py-2 font-medium font-sans">{item.name}</td>
                                <td className="px-3 py-2 text-slate-500 font-sans">{item.brandName || "-"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsAssignMoreOpen(false)}
                        className="h-8 px-3.5 border border-slate-300 text-xs font-semibold text-slate-700 bg-white rounded-[2px] hover:bg-slate-50"
                      >
                        ยกเลิก
                      </button>
                      <button
                        type="button"
                        onClick={handleAssignSelected}
                        disabled={selectedToAssign.size === 0}
                        className="h-8 px-4 bg-[#102C57] text-white text-xs font-bold rounded-[2px] transition hover:bg-[#1a3a6b] disabled:opacity-40"
                      >
                        ผูกสินค้าที่เลือก ({selectedToAssign.size} รายการ)
                      </button>
                    </div>
                  </div>
                )}

                {/* Assigned Table */}
                <div className="flex-1 overflow-auto border border-slate-200 rounded-[2px]">
                  <table className="w-full text-xs min-w-[800px]">
                    <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wider text-[#102C57] font-bold border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-2.5 text-left w-[15%]">Trade Code</th>
                        <th className="px-3 py-2.5 text-left w-[15%]">SKU</th>
                        <th className="px-3 py-2.5 text-left">ชื่อสินค้า</th>
                        <th className="px-3 py-2.5 text-left w-[15%]">แบรนด์</th>
                        <th className="px-3 py-2.5 text-left w-[10%]">หน่วย</th>
                        {selectedProfile.inputMode === "pail" && (
                          <th className="px-3 py-2.5 text-left w-[20%] font-sans">น้ำหนักมาตรฐาน</th>
                        )}
                        <th className="px-3 py-2.5 text-right w-20">จัดการ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white font-mono text-xs">
                      {filteredAssigned.length === 0 ? (
                        <tr>
                          <td colSpan={selectedProfile.inputMode === "pail" ? 7 : 6} className="px-3 py-10 text-center text-slate-400 font-medium font-sans">
                            ยังไม่มีสินค้าผูกเข้ากับหัวข้อนี้
                          </td>
                        </tr>
                      ) : null}
                      {filteredAssigned.map((item) => {
                        const mapping = mappingByCode[item.code] || {};
                        const hasNoWeight = selectedProfile.inputMode === "pail" && !mapping.weightOptionId;
                        return (
                          <tr key={item.code} className="hover:bg-slate-50 transition-colors">
                            <td className="px-3 py-3 font-bold text-[#102C57]">{item.goodsCode || item.code}</td>
                            <td className="px-3 py-3 text-slate-600">{item.skuCode || "-"}</td>
                            <td className="px-3 py-3 font-medium text-slate-800 font-sans">{item.name}</td>
                            <td className="px-3 py-3 text-slate-500 font-medium font-sans">{item.brandName || "-"}</td>
                            <td className="px-3 py-3 text-slate-500 font-semibold font-sans">{item.unit || "-"}</td>
                            {selectedProfile.inputMode === "pail" && (
                              <td className="px-3 py-2">
                                <div className="flex flex-col gap-1 font-sans">
                                  <select
                                    value={mapping.weightOptionId || ""}
                                    onChange={(event) => setMappingByCode((prev) => ({
                                      ...prev,
                                      [item.code]: {
                                        profileId: selectedProfileId,
                                        weightOptionId: event.target.value,
                                      },
                                    }))}
                                    disabled={!canManage || saving || loading}
                                    className={`h-8.5 w-full rounded-[2px] border bg-white px-2 text-xs text-[#181818] outline-none transition focus:ring-1 focus:ring-[#102C57] ${
                                      hasNoWeight ? "border-red-300 ring-1 ring-red-100" : "border-slate-300"
                                    }`}
                                  >
                                    <option value="">-- เลือกน้ำหนัก --</option>
                                    {(selectedProfile.weightOptions || []).map((opt) => (
                                      <option key={opt.id} value={opt.id}>{opt.label} ({opt.weightKg} กก.)</option>
                                    ))}
                                  </select>
                                  {hasNoWeight && (
                                    <span className="inline-flex items-center gap-0.5 text-[9px] text-red-655 font-bold uppercase tracking-wider">
                                      <AlertCircle size={10} />
                                      ต้องเลือกน้ำหนัก
                                    </span>
                                  )}
                                </div>
                              </td>
                            )}
                            <td className="px-3 py-2 text-right font-sans">
                              <button
                                type="button"
                                onClick={() => handleUnassignProduct(item.code)}
                                disabled={!canManage || saving || loading}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-[2px] border border-slate-200 text-slate-400 hover:text-red-600 hover:border-red-200 transition"
                                title="ยกเลิกการผูกสินค้า"
                              >
                                <Trash2 size={12} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}
        </div>
      </div>

      {isProfileModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#102C57]/40 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl overflow-hidden rounded-[2px] border border-slate-200 bg-white text-[#181818] shadow-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-[#102C57] px-5 py-4 text-white">
              <div>
                <h4 className="text-base font-bold tracking-wider uppercase">
                  {editingProfileId ? "แก้ไขหัวข้ออัตราค่าแรง" : "เพิ่มหัวข้ออัตราค่าแรง"}
                </h4>
                <p className="mt-1 text-xs text-slate-200 font-medium">
                  กำหนดวิธีรับค่าและวิธีคิดค่าแรงแยกกันได้ เช่น ชั่งน้ำหนักจริง แต่คิดค่าแรงเป็น 1 ครั้งต่อ 1 จำนวน
                </p>
              </div>
              <button
                type="button"
                onClick={closeProfileModal}
                className="inline-flex h-8 w-8 items-center justify-center rounded-[2px] border border-white/20 hover:border-white text-white hover:bg-white/10 transition"
              >
                <X size={15} />
              </button>
            </div>

            <div className="grid gap-4 px-6 py-5 md:grid-cols-2 max-h-[calc(100vh-12rem)] overflow-y-auto">
              <label className="space-y-1 text-xs font-semibold text-slate-700 md:col-span-2">
                <span className="text-[#102C57]">ชื่อหัวข้อ</span>
                <input
                  value={modalDraft.name}
                  onChange={(event) => handleModalFieldChange("name", event.target.value)}
                  disabled={!canManage || saving || loading}
                  placeholder="เช่น ขนมชั่งถุงใหญ่"
                  className="h-10 w-full rounded-[2px] border border-slate-300 bg-white px-3 text-sm text-[#181818] placeholder:text-slate-400 focus:border-[#102C57] focus:ring-1 focus:ring-[#102C57] outline-none transition"
                />
              </label>

              <label className="space-y-1 text-xs font-semibold text-slate-700">
                <span className="text-[#102C57]">วิธีรับค่า</span>
                <select
                  value={modalDraft.inputMode}
                  onChange={(event) => handleModalFieldChange("inputMode", event.target.value)}
                  disabled={!canManage || saving || loading}
                  className="h-10 w-full rounded-[2px] border border-slate-300 bg-white px-3 text-sm text-[#181818] focus:border-[#102C57] focus:ring-1 focus:ring-[#102C57] outline-none transition"
                >
                  {INPUT_MODES.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 text-xs font-semibold text-slate-700">
                <span className="text-[#102C57]">วิธีคิดค่าแรง</span>
                <select
                  value={modalDraft.wageBasis}
                  onChange={(event) => handleModalFieldChange("wageBasis", event.target.value)}
                  disabled={!canManage || saving || loading}
                  className="h-10 w-full rounded-[2px] border border-slate-300 bg-white px-3 text-sm text-[#181818] focus:border-[#102C57] focus:ring-1 focus:ring-[#102C57] outline-none transition"
                >
                  {WAGE_BASES.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>

              <div className="rounded-[2px] border border-[#102C57]/15 bg-[#102C57]/[0.02] p-4 md:col-span-2">
                <div className="flex items-start gap-3">
                  <div className="rounded-[2px] bg-white border border-[#102C57]/25 p-2 text-[#102C57] shadow-none">
                    <Scale size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-[#102C57] text-xs uppercase tracking-wider">
                      {WAGE_BASES.find((item) => item.value === modalDraft.wageBasis)?.label || "คิดตามน้ำหนัก"}
                    </div>
                    <p className="mt-1 text-xs text-[#666666] font-medium leading-relaxed">
                      {WAGE_BASES.find((item) => item.value === modalDraft.wageBasis)?.hint || "-"}
                    </p>
                  </div>
                </div>
              </div>

              {modalDraft.wageBasis === "count" ? (
                <label className="space-y-1 text-xs font-semibold text-slate-700">
                  <span className="text-[#102C57]">อัตราค่าแรงต่อจำนวน (บาท/ครั้ง)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={modalDraft.payRatePerUnit}
                    onChange={(event) => handleModalFieldChange("payRatePerUnit", event.target.value)}
                    disabled={!canManage || saving || loading}
                    className="h-10 w-full rounded-[2px] border border-slate-300 bg-white px-3 text-sm text-[#181818] focus:border-[#102C57] focus:ring-1 focus:ring-[#102C57] outline-none transition"
                  />
                </label>
              ) : (
                <label className="space-y-1 text-xs font-semibold text-slate-700">
                  <span className="text-[#102C57]">อัตราค่าแรงต่อกิโลกรัม (บาท/กก.)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={modalDraft.payRatePerKg}
                    onChange={(event) => handleModalFieldChange("payRatePerKg", event.target.value)}
                    disabled={!canManage || saving || loading}
                    className="h-10 w-full rounded-[2px] border border-slate-300 bg-white px-3 text-sm text-[#181818] focus:border-[#102C57] focus:ring-1 focus:ring-[#102C57] outline-none transition"
                  />
                </label>
              )}

              <label className="space-y-1 text-xs font-semibold text-slate-700">
                <span className="text-[#102C57]">ลำดับการแสดงผล</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={modalDraft.sortOrder}
                  onChange={(event) => handleModalFieldChange("sortOrder", event.target.value)}
                  disabled={!canManage || saving || loading}
                  className="h-10 w-full rounded-[2px] border border-slate-300 bg-white px-3 text-sm text-[#181818] focus:border-[#102C57] focus:ring-1 focus:ring-[#102C57] outline-none transition"
                />
              </label>

              {modalDraft.inputMode === "pail" ? (
                <div className="space-y-3 md:col-span-2 pt-2 border-t border-slate-100">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <span className="text-xs font-bold text-[#102C57]">น้ำหนักมาตรฐานต่อปี๊บ</span>
                      <p className="mt-0.5 text-[11px] text-slate-500 font-medium">
                        เพิ่มน้ำหนักได้หลายค่า เช่น 1.1 กก., 5 กก. เพื่อนำไปผูกกับ SKU แต่ละรายการ
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleAddWeightOption}
                      disabled={!canManage || saving || loading}
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[2px] border border-[#102C57] bg-white px-3 text-xs font-bold text-[#102C57] hover:bg-[#102C57]/5 transition disabled:opacity-50"
                    >
                      <Plus size={13} />
                      เพิ่มรายการน้ำหนัก
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {(modalDraft.weightOptions || []).map((weightOption, index) => (
                      <div key={weightOption.id} className="grid gap-3 rounded-[2px] border border-slate-200 bg-slate-50/50 p-3 sm:grid-cols-[1fr_180px_auto] items-end">
                        <label className="space-y-1 text-xs font-semibold text-slate-700">
                          <span className="text-[#102C57]">ชื่อรายการน้ำหนัก</span>
                          <input
                            value={weightOption.label}
                            onChange={(event) => handleWeightOptionChange(weightOption.id, "label", event.target.value)}
                            disabled={!canManage || saving || loading}
                            placeholder={`เช่น ${index === 0 ? "1.1 กิโลกรัม" : "5 กิโลกรัม"}`}
                            className="h-9 w-full rounded-[2px] border border-slate-300 bg-white px-3 text-sm text-[#181818] placeholder:text-slate-400 focus:border-[#102C57] focus:outline-none"
                          />
                        </label>
                        <label className="space-y-1 text-xs font-semibold text-slate-700">
                          <span className="text-[#102C57]">น้ำหนัก (กก.)</span>
                          <input
                            type="number"
                            min="0.0001"
                            step="0.0001"
                            value={weightOption.weightKg}
                            onChange={(event) => handleWeightOptionChange(weightOption.id, "weightKg", event.target.value)}
                            disabled={!canManage || saving || loading}
                            className="h-9 w-full rounded-[2px] border border-slate-300 bg-white px-3 text-sm text-[#181818] focus:border-[#102C57] focus:outline-none"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => handleRemoveWeightOption(weightOption.id)}
                          disabled={!canManage || saving || loading}
                          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-[2px] border border-red-200 hover:border-red-650 bg-white px-3 text-xs font-semibold text-red-600 hover:bg-red-50 transition disabled:opacity-50"
                        >
                          <Trash2 size={13} />
                          ลบ
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="rounded-[2px] border border-dashed border-slate-200 bg-slate-50/50 p-4 text-xs text-[#666666] font-medium md:col-span-2">
                  โหมดชั่งน้ำหนักจะดึงน้ำหนักจากตาชั่งโดยตรงเพื่อคิดค่าแรงตามจริง
                </div>
              )}

              <label className="flex items-center gap-2 text-xs font-bold text-[#102C57] md:col-span-2 select-none cursor-pointer">
                <input
                  type="checkbox"
                  checked={modalDraft.isActive}
                  onChange={(event) => handleModalFieldChange("isActive", event.target.checked)}
                  disabled={!canManage || saving || loading}
                  className="h-4 w-4 rounded-[2px] border-slate-300 text-[#102C57] focus:ring-[#102C57]"
                />
                เปิดใช้งานโปรไฟล์นี้
              </label>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-4 bg-slate-50">
              <button
                type="button"
                onClick={closeProfileModal}
                className="inline-flex h-9 items-center justify-center rounded-[2px] border border-slate-300 bg-white px-4 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={commitProfileDraft}
                disabled={!canManage || saving || loading}
                className="inline-flex h-9 items-center justify-center rounded-[2px] bg-[#102C57] px-4 text-xs font-bold text-white hover:bg-[#1b3e70] border border-[#102C57] transition disabled:opacity-50"
              >
                {editingProfileId ? "บันทึกการแก้ไข" : "เพิ่มหัวข้อ"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
