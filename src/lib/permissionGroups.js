const GROUP_META = {
  raw_materials: {
    title: "\u0e04\u0e25\u0e31\u0e07\u0e27\u0e31\u0e15\u0e16\u0e38\u0e14\u0e34\u0e1a",
    description: "\u0e2a\u0e34\u0e17\u0e18\u0e34\u0e4c\u0e2a\u0e33\u0e2b\u0e23\u0e31\u0e1a\u0e2b\u0e19\u0e49\u0e32\u0e41\u0e2a\u0e14\u0e07\u0e04\u0e25\u0e31\u0e07\u0e27\u0e31\u0e15\u0e16\u0e38\u0e14\u0e34\u0e1a\u0e41\u0e25\u0e30\u0e40\u0e2d\u0e01\u0e2a\u0e32\u0e23",
  },
  data_admin: {
    title: "\u0e08\u0e31\u0e14\u0e01\u0e32\u0e23\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25",
    description: "\u0e2b\u0e21\u0e27\u0e14\u0e01\u0e32\u0e23\u0e08\u0e31\u0e14\u0e01\u0e32\u0e23\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e2b\u0e25\u0e31\u0e01\u0e02\u0e2d\u0e07\u0e23\u0e30\u0e1a\u0e1a",
  },
  hr: {
    title: "HR",
    description: "\u0e2a\u0e34\u0e17\u0e18\u0e34\u0e4c\u0e2a\u0e33\u0e2b\u0e23\u0e31\u0e1a\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e41\u0e25\u0e30\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19\u0e1d\u0e48\u0e32\u0e22\u0e1a\u0e38\u0e04\u0e04\u0e25",
  },
  operations: {
    title: "\u0e07\u0e32\u0e19\u0e1b\u0e0f\u0e34\u0e1a\u0e31\u0e15\u0e34\u0e01\u0e32\u0e23",
    description: "\u0e2a\u0e34\u0e17\u0e18\u0e34\u0e4c\u0e2a\u0e33\u0e2b\u0e23\u0e31\u0e1a\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25\u0e1a\u0e38\u0e04\u0e25\u0e32\u0e01\u0e23\u0e41\u0e25\u0e30\u0e01\u0e32\u0e23\u0e40\u0e02\u0e49\u0e32\u0e07\u0e32\u0e19",
  },
  production_line: {
    title: "\u0e44\u0e25\u0e19\u0e4c\u0e1c\u0e25\u0e34\u0e15",
    description: "\u0e2a\u0e34\u0e17\u0e18\u0e34\u0e4c\u0e2a\u0e33\u0e2b\u0e23\u0e31\u0e1a\u0e2a\u0e39\u0e15\u0e23\u0e41\u0e25\u0e30\u0e15\u0e31\u0e49\u0e07\u0e04\u0e48\u0e32\u0e44\u0e25\u0e19\u0e4c\u0e1c\u0e25\u0e34\u0e15",
  },
  system_settings: {
    title: "\u0e15\u0e31\u0e49\u0e07\u0e04\u0e48\u0e32\u0e23\u0e30\u0e1a\u0e1a",
    description: "\u0e01\u0e32\u0e23\u0e15\u0e31\u0e49\u0e07\u0e04\u0e48\u0e32\u0e2a\u0e34\u0e17\u0e18\u0e34\u0e4c\u0e41\u0e25\u0e30\u0e1c\u0e39\u0e49\u0e43\u0e0a\u0e49\u0e07\u0e32\u0e19",
  },
  other: {
    title: "\u0e2d\u0e37\u0e48\u0e19\u0e46",
    description: "\u0e2a\u0e34\u0e17\u0e18\u0e34\u0e4c\u0e2d\u0e37\u0e48\u0e19\u0e46",
  },
};

const SECTION_META = {
  rm_stock: {
    title: "\u0e2a\u0e15\u0e47\u0e2d\u0e01\u0e04\u0e07\u0e40\u0e2b\u0e25\u0e37\u0e2d\u0e04\u0e25\u0e31\u0e07\u0e27\u0e31\u0e15\u0e16\u0e38\u0e14\u0e34\u0e1a",
  },
  rm_requisition: {
    title: "\u0e43\u0e1a\u0e40\u0e1a\u0e34\u0e01\u0e04\u0e25\u0e31\u0e07\u0e27\u0e31\u0e15\u0e16\u0e38\u0e14\u0e34\u0e1a",
  },
  data_main: {
    title: "\u0e2b\u0e19\u0e49\u0e32\u0e08\u0e31\u0e14\u0e01\u0e32\u0e23\u0e02\u0e49\u0e2d\u0e21\u0e39\u0e25",
  },
  ops_main: {
    title: "\u0e2b\u0e19\u0e49\u0e32\u0e1b\u0e0f\u0e34\u0e1a\u0e31\u0e15\u0e34\u0e01\u0e32\u0e23",
  },
  settings_main: {
    title: "\u0e2b\u0e19\u0e49\u0e32\u0e15\u0e31\u0e49\u0e07\u0e04\u0e48\u0e32\u0e23\u0e30\u0e1a\u0e1a",
  },
  production_line_main: {
    title: "\u0e2b\u0e19\u0e49\u0e32\u0e44\u0e25\u0e19\u0e4c\u0e1c\u0e25\u0e34\u0e15",
  },
};

const PERMISSION_MAP = {
  "raw-materials-summary": {
    groupId: "raw_materials",
    sectionId: "rm_stock",
    label: "\u0e23\u0e27\u0e21",
    path: "/raw-materials/summary",
  },
  "raw-materials-lot": {
    groupId: "raw_materials",
    sectionId: "rm_stock",
    label: "\u0e41\u0e22\u0e01 LOT",
    path: "/raw-materials/lot",
  },
  "raw-materials-movement": {
    groupId: "raw_materials",
    sectionId: "rm_stock",
    label: "\u0e40\u0e04\u0e25\u0e37\u0e48\u0e2d\u0e19\u0e44\u0e2b\u0e27",
    path: "/raw-materials/movement",
  },
  "admin-requisition": {
    groupId: "raw_materials",
    sectionId: "rm_requisition",
    label: "\u0e43\u0e1a\u0e40\u0e1a\u0e34\u0e01\u0e27\u0e31\u0e15\u0e16\u0e38\u0e14\u0e34\u0e1a",
    path: "/raw-material-requisitions/requisition",
  },
  "admin-returns": {
    groupId: "raw_materials",
    sectionId: "rm_requisition",
    label: "\u0e43\u0e1a\u0e04\u0e37\u0e19\u0e27\u0e31\u0e15\u0e16\u0e38\u0e14\u0e34\u0e1a",
    path: "/raw-material-requisitions/return",
  },
  "admin-consolidated": {
    groupId: "hr",
    sectionId: "data_main",
    label: "\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19\u0e2a\u0e41\u0e01\u0e19\u0e19\u0e34\u0e49\u0e27",
    path: "/hr/consolidated",
  },
  "admin-employees": {
    groupId: "hr",
    sectionId: "data_main",
    label: "\u0e17\u0e30\u0e40\u0e1a\u0e35\u0e22\u0e19\u0e1e\u0e19\u0e31\u0e01\u0e07\u0e32\u0e19",
    path: "/admin/employees",
  },
  "admin-products": {
    groupId: "data_admin",
    sectionId: "data_main",
    label: "\u0e2a\u0e34\u0e19\u0e04\u0e49\u0e32",
    path: "/admin/products",
  },
  "admin-sku-min-max": {
    groupId: "data_admin",
    sectionId: "data_main",
    label: "Min-Max",
    path: "/admin/sku-min-max",
  },
  "admin-suppliers": {
    groupId: "data_admin",
    sectionId: "data_main",
    label: "\u0e0b\u0e31\u0e1e\u0e1e\u0e25\u0e32\u0e22\u0e40\u0e2d\u0e2d\u0e23\u0e4c",
    path: "/admin/suppliers",
  },
  "stock-inventory": {
    groupId: "data_admin",
    sectionId: "data_main",
    label: "\u0e2a\u0e15\u0e47\u0e2d\u0e01\u0e27\u0e31\u0e15\u0e16\u0e38\u0e14\u0e34\u0e1a",
    path: "/stock-inventory",
  },
  "admin-settings": {
    groupId: "system_settings",
    sectionId: "settings_main",
    label: "\u0e15\u0e31\u0e49\u0e07\u0e04\u0e48\u0e32\u0e23\u0e30\u0e1a\u0e1a",
    path: "/admin/settings",
  },
  "production-line-settings-view": {
    groupId: "production_line",
    sectionId: "production_line_main",
    label: "\u0e15\u0e31\u0e49\u0e07\u0e04\u0e48\u0e32\u0e44\u0e25\u0e19\u0e4c\u0e1c\u0e25\u0e34\u0e15 (View)",
    path: "/production-line/settings",
  },
  "production-line-settings-manage": {
    groupId: "production_line",
    sectionId: "production_line_main",
    label: "\u0e15\u0e31\u0e49\u0e07\u0e04\u0e48\u0e32\u0e44\u0e25\u0e19\u0e4c\u0e1c\u0e25\u0e34\u0e15 (Manage)",
    path: "/production-line/settings/manage",
  },
  "production-line-attendance-view": {
    groupId: "production_line",
    sectionId: "production_line_main",
    label: "\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e07\u0e32\u0e19\u0e44\u0e25\u0e19\u0e4c\u0e1c\u0e25\u0e34\u0e15 (View)",
    path: "/production-line/attendance",
  },
  "production-line-attendance-manage": {
    groupId: "production_line",
    sectionId: "production_line_main",
    label: "\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e07\u0e32\u0e19\u0e44\u0e25\u0e19\u0e4c\u0e1c\u0e25\u0e34\u0e15 (Manage)",
    path: "/production-line/attendance/manage",
  },
  "production-line-attendance-report-view": {
    groupId: "production_line",
    sectionId: "production_line_main",
    label: "\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e07\u0e32\u0e19 (View)",
    path: "/production-line/attendance/report",
  },
  "production-line-attendance-report-manage": {
    groupId: "production_line",
    sectionId: "production_line_main",
    label: "\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19\u0e1a\u0e31\u0e19\u0e17\u0e36\u0e01\u0e07\u0e32\u0e19 (Manage)",
    path: "/production-line/attendance/report/manage",
  },
  "production-line-attendance-piece-rate-money-view": {
    groupId: "production_line",
    sectionId: "production_line_main",
    label: "\u0e14\u0e39\u0e04\u0e48\u0e32\u0e41\u0e23\u0e07\u0e23\u0e32\u0e22\u0e07\u0e32\u0e19\u0e2a\u0e41\u0e01\u0e19\u0e04\u0e34\u0e14\u0e04\u0e48\u0e32\u0e41\u0e23\u0e07",
    path: "/production-line/attendance/report/piece-rate?capability=money-view",
  },
  "production-line-planning-view": {
    groupId: "production_line",
    sectionId: "production_line_main",
    label: "\u0e27\u0e32\u0e07\u0e41\u0e1c\u0e19\u0e01\u0e32\u0e23\u0e1c\u0e25\u0e34\u0e15 (View)",
    path: "/production-line/planning",
  },
  "production-line-planning-manage": {
    groupId: "production_line",
    sectionId: "production_line_main",
    label: "\u0e27\u0e32\u0e07\u0e41\u0e1c\u0e19\u0e01\u0e32\u0e23\u0e1c\u0e25\u0e34\u0e15 (Manage)",
    path: "/production-line/planning/manage",
  },
  "plan.claim_material": {
    groupId: "production_line",
    sectionId: "production_line_main",
    label: "Claim วัตถุดิบ",
    path: "/production-line/planning/schedule",
  },
  "plan.release_claim": {
    groupId: "production_line",
    sectionId: "production_line_main",
    label: "Release Claim วัตถุดิบ",
    path: "/production-line/planning/schedule",
  },
  "plan.reassign_claim": {
    groupId: "production_line",
    sectionId: "production_line_main",
    label: "Reassign Claim วัตถุดิบ",
    path: "/production-line/planning/schedule",
  },
  "plan.view_claim_all": {
    groupId: "production_line",
    sectionId: "production_line_main",
    label: "ดู Material Claims ทั้งหมด",
    path: "/production-line/planning/schedule",
  },
  "plan.consolidate_cross_qa": {
    groupId: "production_line",
    sectionId: "production_line_main",
    label: "Consolidate Material Claims Cross QA",
    path: "/production-line/planning/schedule",
  },
  "plan.verify_materials": {
    groupId: "production_line",
    sectionId: "production_line_main",
    label: "ตรวจสอบวัตถุดิบก่อนเคลม",
    path: "/production-line/planning/schedule",
  },
  "production-line-bom-view": {
    groupId: "production_line",
    sectionId: "production_line_main",
    label: "\u0e2a\u0e39\u0e15\u0e23\u0e01\u0e32\u0e23\u0e1c\u0e25\u0e34\u0e15 (View)",
    path: "/production-line/bom",
  },
  "production-line-bom-manage": {
    groupId: "production_line",
    sectionId: "production_line_main",
    label: "\u0e2a\u0e39\u0e15\u0e23\u0e01\u0e32\u0e23\u0e1c\u0e25\u0e34\u0e15 (Manage)",
    path: "/production-line/bom/manage",
  },
  "production-line-bom-approve": {
    groupId: "production_line",
    sectionId: "production_line_main",
    label: "\u0e2a\u0e39\u0e15\u0e23\u0e01\u0e32\u0e23\u0e1c\u0e25\u0e34\u0e15 (Approve)",
    path: "/production-line/bom/approval",
  },
};

export const DEFAULT_PERMISSIONS = Object.entries(PERMISSION_MAP).map(
  ([permKey, entry]) => ({
    perm_key: permKey,
    label: entry.label,
    path: entry.path,
    group_key: entry.groupId ?? null,
  })
);

const GROUP_ORDER = [
  "hr",
  "raw_materials",
  "data_admin",
  "production_line",
  "operations",
  "system_settings",
  "other",
];

function getMeta(groupId) {
  return GROUP_META[groupId] || GROUP_META.other;
}

function sortItems(items) {
  return items.slice().sort((a, b) => a.label.localeCompare(b.label, "th-TH"));
}

export function buildPermissionGroups(permissions = []) {
  const grouped = new Map();

  permissions.forEach((permission) => {
    const mapped = PERMISSION_MAP[permission.perm_key];
    const groupId = mapped?.groupId || permission.group_key || "other";
    const sectionId = mapped?.sectionId || null;
    const label = mapped?.label || permission.label || permission.perm_key;
    const path = mapped?.path || permission.path || "";

    if (!grouped.has(groupId)) {
      grouped.set(groupId, new Map());
    }
    const sectionMap = grouped.get(groupId);
    const sectionKey = sectionId || "default";
    if (!sectionMap.has(sectionKey)) {
      sectionMap.set(sectionKey, []);
    }
    sectionMap.get(sectionKey).push({
      id: permission.id,
      perm_key: permission.perm_key,
      label,
      path,
    });
  });

  const groups = Array.from(grouped.entries()).map(([groupId, sectionMap]) => {
    const meta = getMeta(groupId);
    const sections = Array.from(sectionMap.entries()).map(([sectionId, items]) => ({
      id: sectionId,
      title: SECTION_META[sectionId]?.title || meta.title,
      items: sortItems(items),
    }));

    return {
      id: groupId,
      title: meta.title,
      description: meta.description,
      sections,
    };
  });

  groups.sort((a, b) => {
    const aIndex = GROUP_ORDER.indexOf(a.id);
    const bIndex = GROUP_ORDER.indexOf(b.id);
    if (aIndex === -1 && bIndex === -1) {
      return a.title.localeCompare(b.title, "th-TH");
    }
    if (aIndex === -1) return 1;
    if (bIndex === -1) return -1;
    return aIndex - bIndex;
  });

  return groups;
}
