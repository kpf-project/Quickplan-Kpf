const ATTENDANCE_ACCESS = Object.freeze([
  "production-line-attendance-view",
  "production-line-attendance-manage",
  "production-line-attendance-report-view",
  "production-line-attendance-report-manage",
]);

const ATTENDANCE_WORK_ACCESS = Object.freeze([
  "production-line-attendance-view",
  "production-line-attendance-manage",
]);

const ATTENDANCE_MENU_CARDS = Object.freeze([
  {
    href: "/production-line/attendance/scan",
    title: "ลงเวลาเข้า-ออก",
    description: "สแกนรหัสพนักงานเพื่อบันทึกเวลาเข้า-ออกงาน",
    action: "เปิดสแกนเนอร์",
    icon: "clock",
    permissionsAny: ATTENDANCE_ACCESS,
  },
  {
    href: "/production-line/fg-wip",
    title: "บันทึกผลผลิตและ WIP",
    description: "บันทึกรับเข้า เบิกจ่าย คืน และของเสียของสินค้าสำเร็จรูปกับงานระหว่างผลิต",
    action: "เปิดบันทึก FG / WIP",
    icon: "fg-wip",
    permissionsAny: ATTENDANCE_WORK_ACCESS,
  },
  {
    href: "/production-line/weight-scale",
    title: "ชั่งน้ำหนักผลิตภัณฑ์",
    description: "อ่านน้ำหนักจากเครื่องชั่ง บันทึกรับเข้า และออกบาร์โค้ดผลิตภัณฑ์อัตโนมัติ",
    action: "เปิดหน้าชั่งผลิตภัณฑ์",
    icon: "weight-scale",
    permissionsAny: ATTENDANCE_ACCESS,
  },
  {
    href: "/production-line/attendance/piece-rate-scan",
    title: "สแกนคิดค่าแรง",
    description: "สแกนบาร์โค้ดสินค้าและพนักงาน แล้วบันทึกน้ำหนักหรือจำนวนตามงานที่กำหนด",
    action: "เปิดสแกนคิดค่าแรง",
    icon: "piece-rate",
    permissionsAny: ATTENDANCE_ACCESS,
  },
]);

export function buildAttendanceMenuCards(permissionState = {}) {
  if (!permissionState.loaded) return [];
  if (permissionState.isAdmin) return [...ATTENDANCE_MENU_CARDS];

  const permissions = new Set(
    Array.isArray(permissionState.permissions) ? permissionState.permissions : []
  );
  return ATTENDANCE_MENU_CARDS.filter((card) =>
    card.permissionsAny.some((permission) => permissions.has(permission))
  );
}
