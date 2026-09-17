export const FG_CATEGORY_OPTIONS = ["04", "04-1", "04-2"];
export const WIP_CATEGORY_OPTIONS = ["03"];
export const RAW_CATEGORY_OPTIONS = ["01", "02", "05", "08", "10"];
export const BOM_PARENT_CATEGORY_OPTIONS = [...FG_CATEGORY_OPTIONS, ...WIP_CATEGORY_OPTIONS];

export const BOM_ITEM_TYPES = {
  FG: "FG",
  WIP: "WIP",
  RAW: "RAW",
  UNKNOWN: "UNKNOWN",
};

export const BOM_VALIDATION_MATRIX = {
  [BOM_ITEM_TYPES.FG]: [BOM_ITEM_TYPES.WIP, BOM_ITEM_TYPES.RAW],
  [BOM_ITEM_TYPES.WIP]: [BOM_ITEM_TYPES.WIP, BOM_ITEM_TYPES.RAW],
  [BOM_ITEM_TYPES.RAW]: [],
};

export function normalizeCategoryCode(value) {
  return String(value || "").trim().toUpperCase();
}

export function resolveItemTypeByCategory(categoryCode) {
  const code = normalizeCategoryCode(categoryCode);
  if (FG_CATEGORY_OPTIONS.includes(code)) return BOM_ITEM_TYPES.FG;
  if (WIP_CATEGORY_OPTIONS.includes(code)) return BOM_ITEM_TYPES.WIP;
  if (RAW_CATEGORY_OPTIONS.includes(code)) return BOM_ITEM_TYPES.RAW;
  return BOM_ITEM_TYPES.UNKNOWN;
}

export function getAllowedChildTypes(parentType) {
  const normalizedParentType = String(parentType || "").trim().toUpperCase();
  const allowed = BOM_VALIDATION_MATRIX[normalizedParentType] || [];
  return new Set(allowed);
}

export function getAllowedComponentTypesForParent(parentType) {
  if (parentType === BOM_ITEM_TYPES.FG) {
    return [BOM_ITEM_TYPES.WIP, BOM_ITEM_TYPES.RAW];
  }
  if (parentType === BOM_ITEM_TYPES.WIP) {
    return [BOM_ITEM_TYPES.WIP, BOM_ITEM_TYPES.RAW];
  }
  return [];
}

export function validateBomMatrix({ parentType, childTypes, childEntries = [] }) {
  const normalizedParentType = String(parentType || "").trim().toUpperCase();
  const rawChildTypes = Array.isArray(childTypes) ? childTypes : [];
  const normalizedChildTypes = Array.from(
    new Set(rawChildTypes.map((type) => String(type || "").trim().toUpperCase()).filter(Boolean))
  );
  const details = [];

  if (normalizedParentType === BOM_ITEM_TYPES.UNKNOWN || !normalizedParentType) {
    return {
      ok: false,
      message: "ไม่สามารถระบุประเภทสินค้า Parent",
      details: [
        {
          scope: "parent",
          reasonTh: "ไม่สามารถระบุประเภทสินค้า Parent",
        },
      ],
    };
  }
  if (normalizedParentType === BOM_ITEM_TYPES.RAW) {
    return {
      ok: false,
      message: "สินค้า RAW ห้ามมีสูตร BOM",
      details: [
        {
          scope: "parent",
          reasonTh: "สินค้า RAW ห้ามมีสูตร BOM",
        },
      ],
    };
  }

  const normalizedEntries = (Array.isArray(childEntries) ? childEntries : []).map((entry) => ({
    ...entry,
    itemType: String(entry?.itemType || "").trim().toUpperCase() || "UNKNOWN",
  }));

  const hasUnknownChild = normalizedChildTypes.some((type) => type === BOM_ITEM_TYPES.UNKNOWN);
  if (hasUnknownChild) {
    const unknownEntryDetails = normalizedEntries
      .filter((entry) => entry.itemType === "UNKNOWN")
      .map((entry) => ({
        scope: "child",
        reasonTh: "ไม่สามารถระบุประเภทคอมโพเนนต์ได้",
        materialCode: entry?.materialCode || null,
        rowNumber: entry?.rowNumber ?? null,
      }));
    details.push({
      scope: "child",
      reasonTh: "มีคอมโพเนนต์ที่ไม่สามารถระบุประเภทได้",
    });
    return {
      ok: false,
      message: "มีคอมโพเนนต์ที่ไม่สามารถระบุประเภทได้",
      details: [...details, ...unknownEntryDetails],
    };
  }

  const allowedChildTypes = getAllowedChildTypes(normalizedParentType);
  const invalidTypes = normalizedChildTypes.filter((type) => !allowedChildTypes.has(type));
  if (invalidTypes.length > 0) {
    const invalidEntryDetails = normalizedEntries
      .filter((entry) => invalidTypes.includes(entry.itemType))
      .map((entry) => ({
        scope: "matrix",
        reasonTh: `Parent ประเภท ${normalizedParentType} ไม่อนุญาต child ประเภท ${entry.itemType}`,
        materialCode: entry?.materialCode || null,
        rowNumber: entry?.rowNumber ?? null,
        itemType: entry?.itemType || null,
      }));
    details.push({
      scope: "matrix",
      reasonTh: `Parent ประเภท ${normalizedParentType} ไม่อนุญาต child ประเภท ${invalidTypes.join(", ")}`,
    });
    return {
      ok: false,
      message: `Parent ประเภท ${normalizedParentType} ไม่อนุญาต child ประเภท ${invalidTypes.join(", ")}`,
      details: [...details, ...invalidEntryDetails],
    };
  }

  return { ok: true, message: "", details: [] };
}
