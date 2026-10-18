export const PRODUCTION_TASK_PERMISSIONS = {
  "production-piece-rate-rate-view": {
    label: "เปิดดูอัตราค่าแรงสำหรับบันทึกงาน",
    legacyKeys: ["production-line-attendance-view", "production-line-attendance-manage"],
    group: "production",
    path: "/production-line/attendance",
  },
  "production-piece-rate-report-view": {
    label: "ดูรายงานผลผลิตรายชิ้นและประวัติแก้ไข",
    legacyKeys: ["production-line-attendance-report-view","production-line-attendance-report-manage","production-line-attendance-view","production-line-attendance-manage"],
    group: "production",
    path: "/production-line/attendance",
  },
  "production-piece-rate-report-export": {
    label: "ส่งออก Excel รายงานผลผลิตรายชิ้น",
    legacyKeys: ["production-line-attendance-report-view","production-line-attendance-report-manage","production-line-attendance-view","production-line-attendance-manage"],
    group: "production",
    path: "/production-line/attendance",
  },
  "production-piece-rate-report-print": {
    label: "พิมพ์เอกสารรายงานผลผลิตรายชิ้น",
    legacyKeys: ["production-line-attendance-report-view","production-line-attendance-report-manage","production-line-attendance-view","production-line-attendance-manage"],
    group: "production",
    path: "/production-line/attendance",
  },
  "production-piece-rate-adjust": {
    label: "แก้ไขเอกสารผลผลิตรายชิ้น",
    legacyKeys: ["production-line-attendance-report-manage","production-line-attendance-manage"],
    group: "production",
    path: "/production-line/attendance",
  },
  "production-piece-rate-cancel": {
    label: "ยกเลิกเอกสารผลผลิตรายชิ้น",
    legacyKeys: ["production-line-attendance-report-manage","production-line-attendance-manage"],
    group: "production",
    path: "/production-line/attendance",
  },
  "production-piece-rate-master-view": {
    label: "ดูข้อมูลสินค้าและพนักงานสำหรับบันทึกผลผลิตรายชิ้น",
    legacyKeys: ["production-line-attendance-view","production-line-attendance-manage"],
    group: "production",
    path: "/production-line/attendance",
  },
  "production-piece-rate-record": {
    label: "บันทึกและนำเข้าผลผลิตรายชิ้น",
    legacyKeys: ["production-line-attendance-view","production-line-attendance-manage"],
    group: "production",
    path: "/production-line/attendance",
  },
  "production-attendance-scan-report": {
    label: "ดูรายงานสแกนเข้าออกงาน",
    legacyKeys: ["production-line-attendance-report-view","production-line-attendance-report-manage","production-line-attendance-view","production-line-attendance-manage","admin-attendance"],
    group: "production",
    path: "/production-line/attendance",
  },
  "production-piece-rate-prison-receipt-view": {
    label: "ดูรายการรับผลผลิตรายชิ้นเข้าเรือนจำ",
    legacyKeys: ["production-line-attendance-view","production-line-attendance-manage"],
    group: "production",
    path: "/production-line/attendance",
  },
  "production-piece-rate-prison-receipt-write": {
    label: "บันทึกรับผลผลิตรายชิ้นเข้าเรือนจำ",
    legacyKeys: ["production-line-attendance-view","production-line-attendance-manage"],
    group: "production",
    path: "/production-line/attendance",
  },
  "production-piece-rate-prison-issue-view": {
    label: "ดู LOT ผลผลิตรายชิ้นพร้อมเบิกจากเรือนจำ",
    legacyKeys: ["production-line-attendance-view","production-line-attendance-manage"],
    group: "production",
    path: "/production-line/attendance",
  },
  "production-piece-rate-prison-issue-write": {
    label: "เบิกผลผลิตรายชิ้นจากเรือนจำ",
    legacyKeys: ["production-line-attendance-view","production-line-attendance-manage"],
    group: "production",
    path: "/production-line/attendance",
  },
  "production-piece-rate-waste-write": {
    label: "บันทึกของเสียผลผลิตรายชิ้น",
    legacyKeys: ["production-line-attendance-view","production-line-attendance-manage","production-line-attendance-report-view","production-line-attendance-report-manage"],
    group: "production",
    path: "/production-line/attendance",
  },
  "production-piece-rate-stock-report": {
    label: "ดูรายงานสต็อกป้ายแยม",
    legacyKeys: [
      "production-line-attendance-view",
      "production-line-attendance-manage",
      "production-line-attendance-report-view",
      "production-line-attendance-report-manage",
    ],
    group: "production",
    path: "/production-line/attendance",
  },
  "production-stock-balance-view": {
    "label": "ดูยอดคงเหลือสต็อกผลิต",
    "legacyKeys": [
      "production-line-attendance-view",
      "production-line-attendance-manage",
      "production-line-attendance-report-view",
      "production-line-attendance-report-manage",
      "production-line-settings-view",
      "production-line-settings-manage"
    ],
    "group": "production",
    "path": "/api/production-stock/balance/summary"
  },
  "production-stock-issue-view": {
    "label": "ดูรายการและป้ายพร้อมเบิกสต็อกผลิต",
    "legacyKeys": [
      "production-line-attendance-view",
      "production-line-attendance-manage",
      "production-line-attendance-report-view",
      "production-line-attendance-report-manage",
      "production-line-settings-view",
      "production-line-settings-manage"
    ],
    "group": "production",
    "path": "/api/production-stock/issues"
  },
  "production-stock-issue-write": {
    "label": "บันทึกเบิกสต็อกผลิต",
    "legacyKeys": [
      "production-line-attendance-manage"
    ],
    "group": "production",
    "path": "/api/production-stock/issues"
  },
  "production-stock-issue-report": {
    "label": "ดูรายงานเบิกสต็อกผลิต",
    "legacyKeys": [
      "production-line-attendance-view",
      "production-line-attendance-manage",
      "production-line-attendance-report-view",
      "production-line-attendance-report-manage",
      "production-line-settings-view",
      "production-line-settings-manage"
    ],
    "group": "production",
    "path": "/api/production-stock/issues/report-summary"
  },
  "production-stock-issue-cancel": {
    "label": "ยกเลิกเบิกสต็อกผลิต",
    "legacyKeys": [
      "production-line-attendance-manage"
    ],
    "group": "production",
    "path": "/api/production-stock/issues/[issueItemId]/cancel"
  },
  "production-jam-usage-view": {
    "label": "ดูรายการใช้แยม",
    "legacyKeys": [
      "production-line-attendance-view",
      "production-line-attendance-manage"
    ],
    "group": "production",
    "path": "/api/production-stock/jam-usage"
  },
  "production-jam-usage-write": {
    "label": "บันทึกการใช้แยม",
    "legacyKeys": [
      "production-line-attendance-manage"
    ],
    "group": "production",
    "path": "/api/production-stock/jam-usage"
  },
  "production-stock-opening-write": {
    "label": "นำเข้าสต็อกตั้งต้น",
    "legacyKeys": [
      "production-line-attendance-view",
      "production-line-attendance-manage",
      "production-line-attendance-report-view",
      "production-line-attendance-report-manage",
      "production-line-settings-view",
      "production-line-settings-manage"
    ],
    "group": "production",
    "path": "/api/production-stock/opening-balances/import"
  },
  "production-prison-balance-view": {
    "label": "ดูยอดคงเหลือสต็อกเรือนจำ",
    "legacyKeys": [
      "production-line-attendance-view",
      "production-line-attendance-manage",
      "production-line-attendance-report-view",
      "production-line-attendance-report-manage",
      "production-line-settings-view",
      "production-line-settings-manage"
    ],
    "group": "production",
    "path": "/api/production-stock/prison/balance/summary"
  },
  "production-prison-inbound-view": {
    "label": "ดูรายการรับเข้าสต็อกเรือนจำ",
    "legacyKeys": [
      "production-line-attendance-view",
      "production-line-attendance-manage",
      "production-line-attendance-report-view",
      "production-line-attendance-report-manage",
      "production-line-settings-view",
      "production-line-settings-manage"
    ],
    "group": "production",
    "path": "/api/production-stock/prison/inbound/cancelable"
  },
  "production-prison-inbound-cancel": {
    "label": "ยกเลิกรับเข้าสต็อกเรือนจำ",
    "legacyKeys": [
      "production-line-attendance-view",
      "production-line-attendance-manage",
      "production-line-attendance-report-view",
      "production-line-attendance-report-manage",
      "production-line-settings-view",
      "production-line-settings-manage"
    ],
    "group": "production",
    "path": "/api/production-stock/prison/inbound/[inboundItemId]/cancel"
  },
  "production-prison-issue-view": {
    "label": "ดูรายการและป้ายพร้อมเบิกสต็อกเรือนจำ",
    "legacyKeys": [
      "production-line-attendance-view",
      "production-line-attendance-manage",
      "production-line-attendance-report-view",
      "production-line-attendance-report-manage",
      "production-line-settings-view",
      "production-line-settings-manage"
    ],
    "group": "production",
    "path": "/api/production-stock/prison/issues"
  },
  "production-prison-issue-write": {
    "label": "บันทึกเบิกสต็อกเรือนจำ",
    "legacyKeys": [
      "production-line-attendance-view",
      "production-line-attendance-manage",
      "production-line-attendance-report-view",
      "production-line-attendance-report-manage",
      "production-line-settings-view",
      "production-line-settings-manage"
    ],
    "group": "production",
    "path": "/api/production-stock/prison/issues"
  },
  "production-prison-issue-report": {
    "label": "ดูรายงานเบิกสต็อกเรือนจำ",
    "legacyKeys": [
      "production-line-attendance-view",
      "production-line-attendance-manage",
      "production-line-attendance-report-view",
      "production-line-attendance-report-manage",
      "production-line-settings-view",
      "production-line-settings-manage"
    ],
    "group": "production",
    "path": "/api/production-stock/prison/issues/report-summary"
  },
  "production-prison-issue-cancel": {
    "label": "ยกเลิกเบิกสต็อกเรือนจำ",
    "legacyKeys": [
      "production-line-attendance-view",
      "production-line-attendance-manage",
      "production-line-attendance-report-view",
      "production-line-attendance-report-manage",
      "production-line-settings-view",
      "production-line-settings-manage"
    ],
    "group": "production",
    "path": "/api/production-stock/prison/issues/[issueItemId]/cancel"
  },
  "production-stock-return-view": {
    "label": "ดูรายการคืนสต็อกผลิต",
    "legacyKeys": [
      "production-line-attendance-view",
      "production-line-attendance-manage",
      "production-line-attendance-report-view",
      "production-line-attendance-report-manage",
      "production-line-settings-view",
      "production-line-settings-manage"
    ],
    "group": "production",
    "path": "/api/production-stock/returns"
  },
  "production-stock-return-write": {
    "label": "บันทึกคืนสต็อกผลิต",
    "legacyKeys": [
      "production-line-attendance-manage"
    ],
    "group": "production",
    "path": "/api/production-stock/returns"
  },
  "production-stock-waste-view": {
    "label": "ดูรายการของเสียสต็อกผลิต",
    "legacyKeys": [
      "production-line-attendance-view",
      "production-line-attendance-manage",
      "production-line-attendance-report-view",
      "production-line-attendance-report-manage",
      "production-line-settings-view",
      "production-line-settings-manage"
    ],
    "group": "production",
    "path": "/api/production-stock/waste"
  },
  "production-stock-waste-write": {
    "label": "บันทึกของเสียสต็อกผลิต",
    "legacyKeys": [
      "production-line-attendance-manage"
    ],
    "group": "production",
    "path": "/api/production-stock/waste"
  },
  "production-scale-receipt-cancel": {
    "label": "ยกเลิกใบรับชั่งระบบเดิม",
    "legacyKeys": [
      "production-line-attendance-manage"
    ],
    "group": "production",
    "path": "/api/scale/receipts/[receiptId]/cancel"
  },
  "production-scale-receipt-view": {
    "label": "ดูใบรับชั่งระบบเดิม",
    "legacyKeys": [
      "production-line-attendance-view",
      "production-line-attendance-manage",
      "production-line-attendance-report-view",
      "production-line-attendance-report-manage",
      "production-line-settings-view",
      "production-line-settings-manage"
    ],
    "group": "production",
    "path": "/api/scale/receipts"
  },
  "production-scale-receipt-export": {
    "label": "ส่งออกใบรับชั่งระบบเดิมไป ERP",
    "legacyKeys": [
      "production-line-attendance-view",
      "production-line-attendance-manage",
      "production-line-attendance-report-view",
      "production-line-attendance-report-manage",
      "production-line-settings-view",
      "production-line-settings-manage"
    ],
    "group": "production",
    "path": "/api/scale/receipts/erp-export"
  },
  "production-scale-receipt-report": {
    "label": "ดูและพิมพ์รายงานรับชั่งระบบเดิม",
    "legacyKeys": [
      "production-line-attendance-view",
      "production-line-attendance-manage",
      "production-line-attendance-report-view",
      "production-line-attendance-report-manage",
      "production-line-settings-view",
      "production-line-settings-manage"
    ],
    "group": "production",
    "path": "/api/scale/receipts/report-summary"
  },
  "production-scale-receipt-write": {
    "label": "บันทึกใบรับชั่งระบบเดิม",
    "legacyKeys": [
      "production-line-attendance-manage"
    ],
    "group": "production",
    "path": "/api/scale/receipts"
  },
  "production-fg-wip-view": {
    "label": "ดูผลผลิต FG/WIP",
    "legacyKeys": [
      "production-line-attendance-view",
      "production-line-attendance-manage"
    ],
    "group": "production",
    "path": "/production-line/attendance"
  },
  "production-fg-wip-write": {
    "label": "บันทึกผลผลิต FG/WIP และเบิก WIP",
    "legacyKeys": [
      "production-line-attendance-view",
      "production-line-attendance-manage"
    ],
    "group": "production",
    "path": "/production-line/attendance"
  },
  "production-fg-wip-opening-write": {
    "label": "บันทึกสต็อกตั้งต้น WIP ปี๊บ",
    "legacyKeys": [
      "production-line-attendance-view",
      "production-line-attendance-manage"
    ],
    "group": "production",
    "path": "/production-line/attendance"
  },
  "production-fg-wip-waste-write": {
    "label": "บันทึกของเสีย FG/WIP",
    "legacyKeys": [
      "production-line-attendance-view",
      "production-line-attendance-manage"
    ],
    "group": "production",
    "path": "/production-line/attendance"
  },
  "production-fg-wip-waste-cancel": {
    "label": "ยกเลิกของเสีย FG/WIP",
    "legacyKeys": [
      "production-line-attendance-manage"
    ],
    "group": "production",
    "path": "/production-line/attendance"
  },
  "production-piece-rate-stock-view": {
    "label": "ดูสต็อกป้ายแยม",
    "legacyKeys": [
      "production-line-attendance-view",
      "production-line-attendance-manage",
      "production-line-attendance-report-view",
      "production-line-attendance-report-manage"
    ],
    "group": "production",
    "path": "/production-line/attendance"
  },
  "production-piece-rate-stock-issue-write": {
    "label": "เบิกสต็อกป้ายแยม",
    "legacyKeys": [
      "production-line-attendance-view",
      "production-line-attendance-manage",
      "production-line-attendance-report-view",
      "production-line-attendance-report-manage"
    ],
    "group": "production",
    "path": "/production-line/attendance"
  },
  "production-piece-rate-stock-return-write": {
    "label": "คืนสต็อกป้ายแยม",
    "legacyKeys": [
      "production-line-attendance-view",
      "production-line-attendance-manage",
      "production-line-attendance-report-view",
      "production-line-attendance-report-manage"
    ],
    "group": "production",
    "path": "/production-line/attendance"
  },
  "production-piece-rate-stock-issue-cancel": {
    "label": "ยกเลิกเบิกป้ายแยม",
    "legacyKeys": [
      "production-line-attendance-view",
      "production-line-attendance-manage",
      "production-line-attendance-report-view",
      "production-line-attendance-report-manage"
    ],
    "group": "production",
    "path": "/production-line/attendance"
  },
  "production-piece-rate-weigh-cancel": {
    "label": "ยกเลิกชั่งป้ายแยม",
    "legacyKeys": [
      "production-line-attendance-view",
      "production-line-attendance-manage",
      "production-line-attendance-report-view",
      "production-line-attendance-report-manage"
    ],
    "group": "production",
    "path": "/production-line/attendance"
  },
  "production-packing-output-view": {
    "label": "ดูผลผลิตบรรจุไม่คิดค่าแรง",
    "legacyKeys": [
      "production-line-attendance-view",
      "production-line-attendance-manage",
      "production-line-attendance-report-view",
      "production-line-attendance-report-manage"
    ],
    "group": "production",
    "path": "/production-line/attendance"
  },
  "production-packing-output-write": {
    "label": "บันทึกผลผลิตบรรจุไม่คิดค่าแรง",
    "legacyKeys": [
      "production-line-attendance-manage",
      "production-line-attendance-report-manage"
    ],
    "group": "production",
    "path": "/production-line/attendance"
  }
};
