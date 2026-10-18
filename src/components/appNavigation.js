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

const PAGE_TASK_KEYS = {
  "/hr/consolidated": ["hr-consolidated-view"],
  "/admin/employees": ["hr-employees-view", "hr-departments-view"],
  "/admin/products": ["data-products-view", "data-products-cost-view"],
  "/admin/products/trade-codes": ["data-trade-codes-view"],
  "/admin/sku-min-max": ["data-sku-min-max-view"],
  "/admin/suppliers": ["data-suppliers-view"],
  "/raw-materials": ["raw-materials-summary-view", "raw-materials-lot-view", "raw-materials-movement-view"],
  "/raw-material-receipts": ["raw-materials-receipts-view", "raw-materials-production-receipts-view"],
  "/raw-material-requisitions/requisition": ["raw-materials-requisitions-view", "raw-materials-returns-view"],
  "/raw-material-requisitions/return": ["raw-materials-requisitions-view", "raw-materials-returns-view"],
  "/production-line/fg-wip": ["production-fg-wip-view", "production-fg-wip-write", "production-fg-wip-opening-write", "production-fg-wip-waste-write", "production-fg-wip-waste-cancel"],
  "/production-line/weight-scale": ["production-scale-receipt-view", "production-scale-receipt-write", "production-scale-receipt-cancel", "production-scale-receipt-report", "production-stock-return-view", "production-stock-return-write", "production-stock-waste-view", "production-stock-waste-write"],
  "/production-line/weight-scale-live": ["production-scale-receipt-view", "production-scale-receipt-write", "production-scale-receipt-cancel", "central-scale-view", "central-scale-receive"],
  "/production-line/stock": ["production-stock-opening-write"],
  "/production-line/attendance/piece-rate-scan": ["production-piece-rate-stock-view", "production-piece-rate-stock-issue-write", "production-piece-rate-stock-return-write", "production-piece-rate-stock-issue-cancel", "production-piece-rate-weigh-cancel"],
  "/production-line/settings": ["production-settings-material-owners-view", "production-settings-material-owners-write", "production-settings-material-owners-delete", "production-settings-piece-rate-view", "production-settings-piece-rate-rate-edit", "production-settings-snack-wage-view", "production-settings-snack-wage-rate-edit", "production-settings-bom-view"],
};

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
        href: "/production-line/reports",
        label: "ศูนย์รายงานไลน์ผลิต",
        icon: BarChart2,
        permissionsAny: ["production-line-attendance-view", "production-line-attendance-manage", "production-line-attendance-report-view", "production-line-attendance-report-manage", "production-line-planning-view", "production-line-planning-manage"],
      },
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
        href: "/production-line/attendance/packing-output",
        label: "บันทึกผลผลิตบรรจุ",
        icon: PackageCheck,
        permissionsAny: ["production-packing-output-view", "production-packing-output-write"],
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
        href: "/production-line/costing",
        label: "ต้นทุนการผลิต",
        icon: BarChart2,
        permissionsAny: [
          "production-cost-view",
          "production-cost-write",
          "production-line-attendance-view",
          "production-line-attendance-manage",
          "production-line-attendance-report-view",
        ],
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
        href: "/raw-materials/cost",
        label: "ต้นทุนวัตถุดิบตาม LOT",
        icon: BarChart2,
        permissionsAny: ["raw-materials-cost-view"],
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
].map((item) => item.children ? {
  ...item,
  children: item.children.map((child) => ({ ...child, permissionsAny: [...(child.permissionsAny || []), ...(PAGE_TASK_KEYS[child.href] || [])] })),
} : { ...item, permissionsAny: [...(item.permissionsAny || []), ...(PAGE_TASK_KEYS[item.href] || [])] });

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

for (const group of buildNavItems("/raw-material-requisitions/requisition")) {
  if (group.children && GROUP_PERMISSION_KEYS[group.key]) {
    GROUP_PERMISSION_KEYS[group.key] = [...new Set([...GROUP_PERMISSION_KEYS[group.key], ...group.children.flatMap((child) => child.permissionsAny || [])])];
  }
}

export const KNOWN_ROUTE_TITLES = Object.freeze({
  "/production-line/reports": "ศูนย์รายงานไลน์ผลิต",
  "/hr/consolidated": "รายงานสแกนนิ้ว",
  "/admin/employees": "ทะเบียนพนักงาน",
  "/admin/products": "ข้อมูลสินค้า",
  "/admin/products/trade-codes": "รหัสซื้อขาย",
  "/admin/sku-min-max": "Min-Max วัตถุดิบ",
  "/admin/performance": "Performance",
  "/admin/suppliers": "ซัพพลายเออร์",
  "/admin/department-lookup-27": "แผนก Lookup 27",
  "/admin/schedule-config": "ตั้งค่าตารางเวลา",
  "/admin/settings": "ตั้งค่าระบบ",
  "/admin/raw-material-requisitions": "ใบเบิกวัตถุดิบ (Admin)",
  "/admin/raw-material-requisitions/requisition": "ใบเบิกวัตถุดิบ",
  "/admin/raw-material-requisitions/returns": "ใบรับคืนวัตถุดิบ",
  "/raw-materials": "สต็อกคลังวัตถุดิบ",
  "/raw-material-receipts": "รับเข้าวัตถุดิบ",
  "/raw-material-requisitions": "ใบเบิกวัตถุดิบ",
  "/raw-material-requisitions/requisition": "ใบเบิกวัตถุดิบ",
  "/raw-material-requisitions/returns": "ใบรับคืนวัตถุดิบ",
  "/raw-material-requisitions/export": "export ใบเบิก",
  "/stock-inventory": "สต็อกวัตถุดิบ",
  "/production-line/attendance": "บันทึกงานไลน์ผลิต",
  "/production-line/attendance/piece-rate-scan": "บันทึกเนื้อขนมป้ายแยม",
  "/production-line/attendance/packing-output": "บันทึกผลผลิตไม่คิดค่าแรง",
  "/production-line/attendance/scan": "สแกนเข้างาน",
  "/production-line/attendance/report": "รายงานการเข้างาน",
  "/production-line/attendance/report/piece-rate": "รายงานค่าแรงรายชิ้น",
  "/production-line/attendance/report/piece-rate-summary": "รายงานสรุปค่าแรงรายชิ้น",
  "/production-line/attendance/report/input-output": "รายงานสรุปยอดผลิตและของเสีย",
  "/production-line/attendance/report/scan-events": "รายงานประวัติการสแกน",
  "/production-line/attendance/piece-rate-stock-inbound": "รายงานรับเข้าเนื้อขนม",
  "/production-line/attendance/piece-rate-stock-inbound-fg": "รายงานรับเข้า FG",
  "/production-line/attendance/piece-rate-stock-issues": "รายงานเบิกเนื้อขนม",
  "/production-line/attendance/piece-rate-stock-movement": "รายงานความเคลื่อนไหวเนื้อขนม",
  "/production-line/attendance/piece-rate-stock-balance": "รายงานสต็อกคงเหลือเนื้อขนม",
  "/production-line/attendance/piece-rate-stock-prison": "รายงานเบิกเรือนจำเนื้อขนม",
  "/production-line/fg-wip": "บันทึกผลผลิตและ WIP",
  "/production-line/weight-scale": "ชั่งน้ำหนักผลิตภัณฑ์",
  "/production-line/weight-scale-live": "ชั่งน้ำหนักจากเครื่องชั่ง",
  "/production-line/weight-scale/report": "รายงานชั่งน้ำหนัก",
  "/production-line/weight-scale/report-summary": "รายงานสรุปภาพรวมชั่งน้ำหนัก",
  "/production-line/weight-scale/cancel": "ยกเลิกการชั่งน้ำหนัก",
  "/production-line/weight-scale/return": "รับคืนสินค้าชั่งน้ำหนัก",
  "/production-line/weight-scale/waste": "บันทึกของเสียชั่งน้ำหนัก",
  "/production-line/stock": "นำเข้าสต็อกตั้งต้น",
  "/production-line/stock/opening-balance": "นำเข้าสต็อกตั้งต้น",
  "/production-line/stock/balance": "รายงานสต็อกคงเหลือ",
  "/production-line/stock/balance/lot": "รายงานสต็อกคงเหลือ LOT",
  "/production-line/stock/balance/summary": "รายงานสรุปสต็อกคงเหลือ",
  "/production-line/stock/issues": "เบิกจ่ายสต็อก",
  "/production-line/stock/issues/report": "รายงานเบิกสินค้า",
  "/production-line/stock/issues/report-summary": "รายงานสรุปเบิกสินค้า",
  "/production-line/stock/issues/cancel": "ยกเลิกใบเบิกสินค้า",
  "/production-line/stock/prison/issues": "เบิกสินค้าเรือนจำ",
  "/production-line/stock/prison/issues/report": "รายงานเบิกสินค้าเรือนจำ",
  "/production-line/stock/prison/issues/report-summary": "รายงานสรุปเบิกสินค้าเรือนจำ",
  "/production-line/stock/prison/issues/cancel": "ยกเลิกเบิกเรือนจำ",
  "/production-line/stock/prison/balance/lot": "สต็อกเรือนจำ LOT",
  "/production-line/stock/prison/balance/summary": "สรุปสต็อกเรือนจำ",
  "/production-line/stock/prison/report": "รายงานเรือนจำ",
  "/production-line/stock/prison/report-summary": "รายงานสรุปเรือนจำ",
  "/production-line/bom": "BOM ไลน์การผลิต",
  "/production-line/bom/approval": "อนุมัติสูตรการผลิต (BOM)",
  "/production-line/planning": "วางแผนการผลิต",
  "/production-line/planning/schedule": "วางแผนการผลิต",
  "/production-line/planning/schedule-report": "รายงานตารางแผนการผลิต",
  "/production-line/planning/claims": "รายการจองวัตถุดิบ",
  "/production-line/planning/material-verification": "ตรวจสอบวัตถุดิบ",
  "/production-line/planning/material-verify": "ตรวจสอบวัตถุดิบ",
  "/production-line/planning/capacity-planner": "วางแผนกำลังการผลิต",
  "/production-line/planning/notifications": "แจ้งเตือนการผลิต",
  "/production-line/planning/trace": "ตรวจสอบย้อนกลับ (Traceability)",
  "/production-line/planning/report": "รายงานการวางแผนผลิต",
  "/production-line/planning/requisition-preview": "พรีวิวใบเบิกวัตถุดิบ",
  "/production-line/settings": "ตั้งค่า",
  "/weight-scale": "ชั่งน้ำหนักผลิตภัณฑ์",
  "/weight-scale/report": "รายงานชั่งน้ำหนัก",
  "/weight-scale/report-summary": "รายงานสรุปภาพรวมชั่งน้ำหนัก",
});

export function resolveNavigationTitle(pathname, requisitionHref = "/raw-material-requisitions/requisition") {
  const normalized = typeof pathname === "string" && pathname.length > 1 && pathname.endsWith("/")
    ? pathname.slice(0, -1)
    : pathname;

  if (KNOWN_ROUTE_TITLES[normalized]) {
    return KNOWN_ROUTE_TITLES[normalized];
  }

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
