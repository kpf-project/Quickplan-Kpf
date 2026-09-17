import {
  Activity,
  BarChart2,
  Boxes,
  Calendar,
  ClipboardList,
  Database,
  Fingerprint,
  Gauge,
  Layers,
  Package,
  PackageCheck,
  PackageOpen,
  Scale,
  ScanFace,
  Settings,
  ShieldCheck,
  Truck,
  Warehouse,
} from "lucide-react";

export const buildNavItems = (requisitionHref) => [
  {
    key: "hr",
    label: "HR",
    icon: Fingerprint,
    children: [
      {
        href: "/hr/consolidated",
        label: "รายงานสแกนนิ้ว",
        icon: Fingerprint,
        permissionsAny: ["admin-consolidated"],
      },
      {
        href: "/admin/employees",
        label: "ทะเบียนพนักงาน",
        icon: Fingerprint,
        permissionsAny: ["admin-employees"],
      },
    ],
  },
  {
    key: "production_line",
    label: "ไลน์ผลิต",
    icon: Boxes,
    children: [
      {
        href: "/production-line/attendance",
        label: "บันทึกงานไลน์ผลิต",
        icon: ScanFace,
        permissionsAny: [
          "production-line-attendance-view",
          "production-line-attendance-manage",
          "production-line-attendance-report-view",
          "production-line-attendance-report-manage",
        ],
      },
      {
        href: "/production-line/attendance/piece-rate-scan",
        label: "บันทึกเนื้อขนมป้ายแยม",
        icon: ScanFace,
        permissionsAny: [
          "production-line-attendance-view",
          "production-line-attendance-manage",
          "production-line-attendance-report-view",
          "production-line-attendance-report-manage",
        ],
      },
      {
        href: "/production-line/fg-wip",
        label: "บันทึกผลผลิตและ WIP",
        icon: PackageCheck,
        permissionsAny: [
          "production-line-attendance-view",
          "production-line-attendance-manage",
        ],
      },
      {
        href: "/production-line/weight-scale",
        label: "ชั่งน้ำหนักผลิตภัณฑ์",
        icon: Gauge,
        iconPath: "/icons/scale.png",
        sidebarIconMaskScale: 1.3,
        permissionsAny: [
          "production-line-attendance-view",
          "production-line-attendance-manage",
          "production-line-attendance-report-view",
          "production-line-attendance-report-manage",
        ],
      },
      {
        href: "/production-line/stock",
        label: "นำเข้าสต็อกตั้งต้น",
        icon: Database,
        permissionsAny: [
          "production-line-attendance-view",
          "production-line-attendance-manage",
          "production-line-attendance-report-view",
          "production-line-attendance-report-manage",
        ],
      },
      {
        href: "/production-line/bom",
        label: "BOM ไลน์การผลิต",
        icon: Layers,
        permissionsAny: ["production-line-bom-view", "production-line-bom-manage"],
      },
      {
        href: "/production-line/planning/schedule",
        label: "วางแผนการผลิต",
        icon: Calendar,
        permissionsAny: ["production-line-planning-view", "production-line-planning-manage"],
      },
      {
        href: "/production-line/settings",
        label: "ตั้งค่า",
        icon: Settings,
        permissionsAny: [
          "production-line-settings-view",
          "production-line-settings-manage",
        ],
      },
    ],
  },
  {
    href: "/production-line/weight-scale-live",
    label: "ชั่งน้ำหนักจากเครื่องชั่ง",
    icon: Scale,
    iconPath: "/icons/scale.png",
    sidebarIconMaskScale: 1.3,
    permissionsAny: [
      "production-line-attendance-view",
      "production-line-attendance-manage",
      "production-line-attendance-report-view",
      "production-line-attendance-report-manage",
      "production-line-settings-view",
      "production-line-settings-manage",
    ],
  },
  {
    key: "raw_materials",
    label: "คลังวัตถุดิบ",
    icon: Warehouse,
    children: [
      {
        href: "/raw-materials",
        label: "สต็อกคลังวัตถุดิบ",
        icon: Package,
        permissionsAny: ["raw-materials-summary", "raw-materials-lot"],
      },
      {
        href: "/raw-material-receipts",
        label: "รับเข้าวัตถุดิบ",
        icon: PackageOpen,
        permissionsAny: ["raw-materials-lot"],
      },
      {
        href: requisitionHref,
        label: "ใบเบิกวัตถุดิบ",
        icon: ClipboardList,
        permissionsAny: ["admin-requisition", "admin-returns"],
      },
      {
        href: "/production-line/planning/material-verification",
        label: "ตรวจสอบวัตถุดิบ",
        icon: ShieldCheck,
        permissionsAny: ["plan.verify_materials"],
      },
      {
        href: "/raw-material-requisitions/export",
        label: "export ใบเบิก",
        icon: ClipboardList,
        permissionsAny: [
          "admin-requisition",
          "production-line-planning-view",
          "production-line-planning-manage",
          "plan.view_claim_all",
          "plan.claim_material",
          "plan.consolidate_cross_qa",
        ],
      },
    ],
  },
  {
    key: "data_admin",
    label: "Data",
    icon: Database,
    children: [
      {
        href: "/stock-inventory",
        label: "สต็อกวัตถุดิบ",
        icon: Package,
        permissionsAny: ["stock-inventory"],
      },
      {
        href: "/admin/products",
        label: "สินค้า",
        icon: Boxes,
        permissionsAny: ["admin-products"],
      },
      {
        href: "/admin/products/trade-codes",
        label: "รหัสซื้อขาย",
        icon: Boxes,
        permissionsAny: ["admin-products"],
      },
      {
        href: "/admin/sku-min-max",
        label: "Min-Max",
        icon: BarChart2,
        permissionsAny: ["admin-sku-min-max"],
      },
      {
        href: "/admin/performance",
        label: "Performance",
        icon: Activity,
        permissionsAny: ["admin-settings"],
        adminOnly: true,
      },
      {
        href: "/admin/suppliers",
        label: "ซัพพลายเออร์",
        icon: Truck,
        permissionsAny: ["admin-suppliers"],
      },
      {
        href: "/admin/department-lookup-27",
        label: "แผนก Lookup 27",
        icon: Database,
        permissionsAny: ["admin-products", "admin-settings"],
      },
    ],
  },
  {
    href: "/admin/settings",
    label: "ตั้งค่าระบบ",
    icon: Settings,
    permissionsAny: ["admin-settings"],
    adminOnly: true,
  },
];

export const GROUP_PERMISSION_KEYS = {
  hr: ["admin-consolidated", "admin-employees"],
  production_line: [
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
    "plan.verify_materials",
    "production-line-settings-view",
    "production-line-settings-manage",
  ],
  raw_materials: [
    "raw-materials-summary",
    "raw-materials-lot",
    "raw-materials-movement",
    "admin-requisition",
    "admin-returns",
    "production-line-planning-view",
    "production-line-planning-manage",
    "plan.view_claim_all",
    "plan.claim_material",
    "plan.verify_materials",
    "plan.consolidate_cross_qa",
  ],
  data_admin: [
    "stock-inventory",
    "admin-products",
    "admin-sku-min-max",
    "admin-suppliers",
    "admin-settings",
  ],
};

export function resolveNavigationTitle(pathname, requisitionHref = "/raw-material-requisitions/requisition") {
  const normalized = typeof pathname === "string" && pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;
  const navItems = buildNavItems(requisitionHref);
  const flatItems = navItems.flatMap((item) => item.children || [item]);
  const exactMatch = flatItems.find((item) => item.href === normalized);
  if (exactMatch?.label) return exactMatch.label;

  const prefixMatch = flatItems
    .filter((item) => normalized === item.href || normalized?.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0];
  if (prefixMatch?.label) return prefixMatch.label;

  const lastSegment = normalized?.split("/").filter(Boolean).at(-1) || "Home";
  return lastSegment
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}
