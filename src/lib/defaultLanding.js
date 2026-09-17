// Default landing should point to the primary daily workspace first.
const DEFAULT_PATH = "/production-line/attendance";
const PRODUCTION_LINE_GROUP_KEYS = [
  "production-line-attendance",
  "production-line-attendance-view",
  "production-line-attendance-manage",
  "production-line-attendance-report-view",
  "production-line-attendance-report-manage",
  "production-line-bom-view",
  "production-line-bom-manage",
  "production-line-planning-view",
  "production-line-planning-manage",
  "plan.claim_material",
  "plan.release_claim",
  "plan.reassign_claim",
  "plan.view_claim_all",
  "plan.consolidate_cross_qa",
  "production-line-settings-view",
  "production-line-settings-manage",
];

const PERMISSION_PATHS = [
  { key: "raw-materials-summary", path: "/raw-materials/summary" },
  { key: "raw-materials-lot", path: "/raw-materials/lot" },
  { key: "raw-materials-movement", path: "/raw-materials/movement" },
  { key: "production-line-planning-view", path: "/production-line/planning/schedule" },
  { key: "production-line-planning-manage", path: "/production-line/planning/schedule" },
  { key: "production-line-bom-view", path: "/production-line/bom" },
  { key: "production-line-bom-manage", path: "/production-line/bom" },
  { key: "production-line-settings-view", path: "/production-line/settings" },
  { key: "production-line-settings-manage", path: "/production-line/settings" },
  { key: "production-line-attendance-view", path: "/production-line/attendance" },
  { key: "production-line-attendance-manage", path: "/production-line/attendance" },
  { key: "production-line-attendance-report-view", path: "/production-line/attendance/report" },
  { key: "production-line-attendance-report-manage", path: "/production-line/attendance/report" },
  { key: "plan.consolidate_cross_qa", path: "/production-line/planning/schedule" },
  { key: "admin-requisition", path: "/raw-material-requisitions/requisition" },
  { key: "admin-returns", path: "/raw-material-requisitions/return" },
  { key: "admin-consolidated", path: "/hr/consolidated" },
  { key: "admin-products", path: "/admin/products" },
  { key: "admin-sku-min-max", path: "/admin/sku-min-max" },
  { key: "admin-suppliers", path: "/admin/suppliers" },
  { key: "admin-employees", path: "/admin/employees" },
  { key: "admin-attendance", path: "/admin/attendance" },
  { key: "admin-settings", path: "/admin/settings" },
];

export function resolveDefaultLandingPath({
  permissions = [],
  isAdmin = false,
} = {}) {
  if (isAdmin) {
    return DEFAULT_PATH;
  }

  const permissionSet = new Set(permissions);
  if (PRODUCTION_LINE_GROUP_KEYS.some((key) => permissionSet.has(key))) {
    return DEFAULT_PATH;
  }

  for (const entry of PERMISSION_PATHS) {
    if (permissionSet.has(entry.key)) {
      return entry.path;
    }
  }

  return "/unauthorized";
}
