/**
 * Application Topology & Route Graph for KPF Quickplan System.
 * Provides machine-readable and human-friendly metadata for every screen,
 * required permissions, and action capabilities across all factory departments.
 */

export const SYSTEM_TOPOLOGY = [
  {
    id: "weight-scale-issue",
    title: "ระบบชั่งน้ำหนักและเบิกจ่าย (Weight Scale Issue)",
    path: "/weight-scale",
    category: "Operations",
    description: "สถานีชั่งน้ำหนักดิจิทัลสำหรับเบิกจ่ายวัตถุดิบและตัดสต็อกออกจากคลัง พร้อมพิมพ์สติกเกอร์บาร์โค้ดติดภาชนะ",
    publicAccess: true,
    allowedRoles: ["*"],
    requiredPermissions: [],
    primaryActions: [
      "สแกนบาร์โค้ดหรือเลือกรหัสวัตถุดิบ (เช่น แป้งผสม, สารตั้งต้น)",
      "หักน้ำหนักภาชนะอัตโนมัติ (Tare STABLE)",
      "บันทึกยอดเบิกจ่ายสุทธิและพิมพ์สติกเกอร์บาร์โค้ด (Windows / ESC-POS)",
    ],
    troubleshooting: "หากค่านิ่งไม่ขึ้น ตรวจสอบสาย RS232 COM Port หรือ Local Scale Agent ที่พอร์ต 41952",
  },
  {
    id: "weight-scale-return",
    title: "ระบบชั่งคืนวัตถุดิบเข้าสต็อก (Weight Scale Return)",
    path: "/production-line/weight-scale/return",
    category: "Operations",
    description: "สถานีชั่งน้ำหนักคืนวัตถุดิบหรือเนื้อขนมที่เหลือหลังเลิกกะ เพื่อคำนวณการใช้จริง (Actual Usage = เบิก - คืน)",
    publicAccess: true,
    allowedRoles: ["*"],
    requiredPermissions: [],
    primaryActions: [
      "สแกนบาร์โค้ดถังเดิมหรือค้นหาจากรายการที่เบิกไป",
      "ชั่งน้ำหนักของเหลือจริงบนตาชั่งดิจิทัล",
      "กดยืนยันเพื่อตัดสต็อกคืนเข้าคลัง และพิมพ์สติกเกอร์บาร์โค้ดชั่งคืน",
    ],
    troubleshooting: "หากสแกนไม่พบบาร์โค้ด ให้ตรวจสอบว่าบาร์โค้ดนี้ถูกยกเลิกหรือเคยชั่งคืนไปแล้วหรือไม่",
  },
  {
    id: "jam-piece-rate-scan",
    title: "ระบบบันทึกเนื้อขนมป้ายแยม (Jam Piece-Rate Scan)",
    path: "/production-line/attendance/piece-rate-scan",
    category: "Operations",
    description: "สถานีงานบันทึกและชั่งรับงานผลิตเนื้อขนมป้ายแยม (WIP เช่น WKB-0064), เบิกไปประกอบร่าง FG, ชั่งคืนของเหลือ และรับเข้า/เบิกงานเรือนจำ",
    publicAccess: true,
    allowedRoles: ["*"],
    requiredPermissions: [],
    primaryActions: [
      "ชั่งเข้า (รับงานผลิต WIP): เลือกสินค้า + สแกน QR พนักงาน + ชั่งน้ำหนักถาด + พิมพ์สติกเกอร์บาร์โค้ด",
      "เบิกไปใช้: สแกนบาร์โค้ดถาดป้ายแยม WIP เพื่อนำไปประกอบร่าง/ผลิตต่อเป็น FG",
      "ชั่งคืน: ชั่งคืนเนื้อขนมหรือแยมที่เหลือหลังเลิกกะ",
      "งานเรือนจำ: รับเข้าเรือนจำ (บันทึก LOT/กระบะ) และเบิกเรือนจำ",
      "รายงาน: กดปุ่มรายงานบนหน้าจอเพื่อดูยอดผลงานและสต็อกคงเหลือประจำวัน",
    ],
    troubleshooting: "หากสติกเกอร์ไม่ออก ตรวจสอบสถานะเครื่องพิมพ์ Windows บนแถบหัวข้อ หรือทดสอบพิมพ์ผ่านปุ่มตั้งค่า",
  },
  {
    id: "input-output-report",
    title: "รายงานเบิกเปลือก / วัตถุดิบและผลผลิต (Input-Output)",
    path: "/production-line/attendance/report/input-output",
    category: "Reporting",
    description: "รายงานสรุปการเบิกเปลือกใช้จริง แยมใช้จริงหลังหักใบคืน ของเสีย และยอดผลผลิต (FG) ประจำวัน",
    publicAccess: false,
    allowedRoles: ["role-1771497622584", "หัวหน้าแผนกบิสกิต", "supervisor", "manager", "admin", "planner"],
    requiredPermissions: ["production-line-attendance-report-manage", "production-line-attendance-view"],
    primaryActions: [
      "เลือกช่วงวันที่รายงาน",
      "ตรวจสอบยอดเปลือกที่ใช้จริง (รหัสเปลือก, LOT, จำนวน, น้ำหนัก กก.)",
      "ตรวจสอบยอดแยมที่ใช้จริง เทียบกับยอดผลผลิต FG ที่ได้รับ",
    ],
    troubleshooting: "หากยอดเปลือกติดลบ ตรวจสอบว่ามีการบันทึกรับเข้าจากเตาอบหรือเลือกวันที่สลับกันหรือไม่",
  },
  {
    id: "packing-output",
    title: "บันทึกและรายงานผลผลิตบรรจุ (Packing Output)",
    path: "/production-line/attendance/packing-output",
    category: "Operations & Reporting",
    description: "บันทึกยอดผลผลิตสำเร็จรูปของแผนกบรรจุลงปี๊บ กล่อง ซอง และพิมพ์บาร์โค้ดพาเลท",
    publicAccess: false,
    allowedRoles: ["packing", "supervisor", "admin", "manager"],
    requiredPermissions: ["production-line-attendance-manage"],
    primaryActions: [
      "เลือกสินค้าสำเร็จรูป (FG)",
      "บันทึกจำนวนปี๊บ/กล่อง/พาเลทที่บรรจุเสร็จ",
      "ตรวจสอบยอดสะสมประจำกะ",
    ],
    troubleshooting: "หากไม่พบรหัสสินค้าสำเร็จรูป ให้ตรวจสอบสถานะการเปิดใช้งานในระบบสินค้าหลัก",
  },
  {
    id: "planning-control-center",
    title: "ศูนย์ควบคุมแผนการผลิต (Planning Control Center)",
    path: "/production-line/planning/control-center",
    category: "Planning",
    description: "ศูนย์กลางสร้างและติดตาม Master Plan แผนการผลิตประจำวัน แผนกย่อย (Sub-plans) และ Preview ใบเบิก ERP",
    publicAccess: false,
    allowedRoles: ["planner", "admin", "manager"],
    requiredPermissions: ["production-line-planning-view", "production-line-planning-manage", "plan.view_all"],
    primaryActions: [
      "แท็บ Master Plan: สร้างและอนุมัติแผนผลิตหลักประจำเดือน/สัปดาห์",
      "แท็บงานแผนก: ดูและคำนวณแผนย่อย (ผสม, อบ, บรรจุ)",
      "แท็บ Preview ใบเบิก: ตรวจสอบความต้องการวัตถุดิบและส่งออกใบเบิก ERP",
    ],
    troubleshooting: "หากยอด Preview ไม่ตรงกับ BOM ให้ตรวจสอบเวอร์ชันสูตรที่อนุมัติในระบบ BOM Master",
  },
  {
    id: "material-claims",
    title: "ระบบจัดสรรและตัดเบิกวัตถุดิบตามแผน (Material Claims)",
    path: "/production-line/planning/claims",
    category: "Planning & Warehouse",
    description: "จัดการ Pool วัตถุดิบ จัดสรรโควตาตามแผนการผลิต ป้องกันการเบิกชนกันข้ามแผนก",
    publicAccess: false,
    allowedRoles: ["planner", "warehouse", "admin"],
    requiredPermissions: ["production-line-planning-manage", "stock-inventory"],
    primaryActions: [
      "ตรวจสอบ Pool วัตถุดิบที่รอเบิก",
      "จัดสรรวัตถุดิบให้แต่ละแผนก (Claim / Reassign / Release)",
      "ยืนยันยอดเบิกประจำวัน",
    ],
    troubleshooting: "หาก Claim ไม่สำเร็จ ให้ตรวจสอบว่าวัตถุดิบถูกล็อกโดยแผนกอื่นอยู่หรือไม่",
  },
  {
    id: "bom-master",
    title: "สูตรการผลิต (BOM Master)",
    path: "/production-line/bom",
    category: "Product Development & QA",
    description: "จัดการโครงสร้างสูตรสินค้า ส่วนผสม วัตถุดิบทดแทน ขออนุมัติสูตร และประวัติเวอร์ชันสูตร",
    publicAccess: false,
    allowedRoles: ["qa", "qa-biscuit", "product-dev", "costing", "admin"],
    requiredPermissions: ["production-bom-manage", "production-bom-view"],
    primaryActions: [
      "สร้างและปรับปรุงโครงสร้างสูตรสินค้า (Bill of Materials)",
      "ส่งสูตรขออนุมัติไปยัง QA / ผู้บริหาร",
      "ตรวจสอบเวอร์ชันสูตรที่ Active ในสายการผลิต",
    ],
    troubleshooting: "สูตรที่ยังไม่อนุมัติ (Pending) จะไม่ถูกนำไปคำนวณใน Master Plan",
  },
  {
    id: "piece-rate",
    title: "บันทึกค่าแรงชิ้นงาน (Piece Rate)",
    path: "/production-line/piece-rate",
    category: "Operations & HR",
    description: "สแกนผลงานรายชิ้นของพนักงานฝ่ายผลิต เพื่อคำนวณค่าแรงตามปริมาณชิ้นงานที่ทำได้จริง",
    publicAccess: false,
    allowedRoles: ["supervisor", "hr", "admin"],
    requiredPermissions: ["production-line-attendance-manage"],
    primaryActions: [
      "สแกน QR Code พนักงาน",
      "เลือกงานและชั่งน้ำหนักชิ้นงาน",
      "ตรวจสอบยอดสะสมและอัตราค่าแรงต่อหน่วย",
    ],
    troubleshooting: "หากสแกนไม่ติด ตรวจสอบความคมชัดของ QR หรือค้นหาด้วยรหัสพนักงาน KPF-XXXXX",
  },
  {
    id: "raw-materials-lot",
    title: "คลังวัตถุดิบแยกตาม LOT (Raw Materials LOT)",
    path: "/raw-materials/lot",
    category: "Warehouse",
    description: "ตรวจสอบสต็อกคงเหลือของวัตถุดิบและบรรจุภัณฑ์แยกตามรุ่นการผลิต (LOT) และคลังจัดเก็บ",
    publicAccess: false,
    allowedRoles: ["warehouse", "supervisor", "admin", "planner"],
    requiredPermissions: ["raw-materials-lot", "stock-inventory"],
    primaryActions: [
      "ค้นหารหัสวัตถุดิบหรือชื่อสินค้า",
      "ตรวจสอบยอดคงเหลือแยกตาม LOT, วันหมดอายุ, และตำแหน่งจัดเก็บ",
      "ตรวจสอบสถานะการกักกัน (Hold) หรือพร้อมใช้ (Available)",
    ],
    troubleshooting: "หากยอด LOT ไม่ตรงกับของจริง ให้เปิดหน้า Stock Card Audit เพื่อตรวจสอบประวัติเคลื่อนไหว",
  },
  {
    id: "raw-materials-summary",
    title: "สรุปยอดวัตถุดิบคงเหลือและ Min/Max (Raw Materials Summary)",
    path: "/raw-materials/summary",
    category: "Warehouse & Purchasing",
    description: "ภาพรวมยอดคงเหลือวัตถุดิบทุกรายการ เทียบจุดสั่งซื้อขั้นต่ำ (Min) และปริมาณสต็อกสูงสุด (Max)",
    publicAccess: false,
    allowedRoles: ["warehouse", "purchasing", "admin", "planner"],
    requiredPermissions: ["raw-materials-summary", "stock-inventory"],
    primaryActions: [
      "ตรวจสอบรายการวัตถุดิบที่ใกล้หมดสต็อก (ต่ำกว่าจุด Reorder Point)",
      "เปรียบเทียบหน่วยคลังกับหน่วย ERP",
      "ส่งออกรายงานสต็อกสรุป",
    ],
    troubleshooting: "หากตัวเลขไม่ตรงกับ ERP ให้กดปุ่มซิงค์ข้อมูลจาก Gateway เพื่อรีเฟรชยอดล่าสุด",
  },
  {
    id: "production-costing",
    title: "ต้นทุนการผลิตและ Yield Loss (Production Costing)",
    path: "/production-line/costing",
    category: "Cost Accounting & Management",
    description: "วิเคราะห์ต้นทุนวัตถุดิบจริง ค่าแรงชิ้นงาน ส่วนต่างสูญเสีย (Yield Loss) และต้นทุนต่อหน่วย",
    publicAccess: false,
    allowedRoles: ["costing", "acc", "manager", "admin"],
    requiredPermissions: ["production-costing-view", "production-costing-manage"],
    primaryActions: [
      "วิเคราะห์ต้นทุนจริงของแต่ละ LOT การผลิต",
      "ตรวจสอบสัดส่วนการใช้วัตถุดิบจริงเทียบกับสูตรมาตรฐาน (Actual vs Standard)",
      "ดูรายงานต้นทุนค่าแรงและของเสียสะสม",
    ],
    troubleshooting: "ข้อมูลต้นทุนต้องการสถานะ LOT ที่ปิดงานสมบูรณ์แล้วจึงจะคำนวณ Yield ได้ถูกต้อง 100%",
  },
  {
    id: "hr-consolidated",
    title: "รายงานสแกนเวลาเข้า-ออกงาน (HR Attendance Consolidated)",
    path: "/hr/consolidated",
    category: "HR",
    description: "ตรวจสอบเวลาสแกนนิ้วและการเข้างานของพนักงานประจำวัน แยกตามแผนกและกะทำงาน",
    publicAccess: false,
    allowedRoles: ["hr", "admin"],
    requiredPermissions: ["admin-employees"],
    primaryActions: [
      "ตรวจสอบเวลาเข้า-ออกงานรายวัน",
      "ตรวจจับพนักงานที่ขาด ลา มาสาย หรือไม่ได้สแกนนิ้ว",
      "ส่งออกข้อมูลสำหรับทำเงินเดือน (Payroll)",
    ],
    troubleshooting: "หากพนักงานสแกนไม่ติด ให้ตรวจสอบประวัติการลงทะเบียนนิ้วมือหรือรหัสในฐานข้อมูล",
  },
  {
    id: "system-settings",
    title: "การตั้งค่าระบบ สิทธิ์ความปลอดภัย และฮาร์ดแวร์ (System Settings)",
    path: "/admin/settings",
    category: "Administration",
    description: "จัดการสิทธิ์ผู้ใช้งาน (RBAC), การเชื่อมต่อตาชั่ง/เครื่องพิมพ์, และระบบความปลอดภัย",
    publicAccess: false,
    allowedRoles: ["admin"],
    requiredPermissions: ["system-settings-manage"],
    primaryActions: [
      "กำหนด Role และ Permission ให้ผู้ใช้งาน",
      "ตั้งค่า Hardware Device Profiles (Scale / Printer)",
      "ตรวจสอบ Audit Logs ความปลอดภัยของระบบ",
    ],
    troubleshooting: "หน้านี้สงวนสิทธิ์เฉพาะผู้ดูแลระบบหลักเท่านั้น",
  },
];

/**
 * Filter topology to only return routes the user is allowed to access
 */
export function getAuthorizedRoutes(userContext) {
  if (!userContext) return SYSTEM_TOPOLOGY.filter((r) => r.publicAccess);
  if (userContext.isAdmin) return SYSTEM_TOPOLOGY;

  const userRoles = new Set((userContext.roles || []).map((r) => String(r).toLowerCase()));
  const userPerms = new Set(userContext.permissions || []);

  return SYSTEM_TOPOLOGY.filter((route) => {
    if (route.publicAccess) return true;
    if (route.allowedRoles.includes("*")) return true;

    const roleMatch = route.allowedRoles.some((r) => userRoles.has(String(r).toLowerCase()));
    if (roleMatch) return true;

    const permMatch = route.requiredPermissions.some((p) => userPerms.has(p));
    if (permMatch) return true;

    return false;
  });
}

/**
 * Search topology by natural language query, intent, or keywords
 */
export function findRouteByIntent(query = "", userContext = null) {
  const q = String(query).trim().toLowerCase();
  if (!q) return null;

  const accessibleRoutes = getAuthorizedRoutes(userContext);

  // Exact path or ID match
  const exact = accessibleRoutes.find(
    (r) => r.path.toLowerCase() === q || r.id.toLowerCase() === q
  );
  if (exact) return exact;

  // Best score matching
  let bestRoute = null;
  let bestScore = 0;

  for (const route of accessibleRoutes) {
    let score = 0;
    const titleLower = route.title.toLowerCase();
    const descLower = route.description.toLowerCase();

    if (titleLower.includes(q)) score += 50;
    if (descLower.includes(q)) score += 20;

    for (const action of route.primaryActions) {
      if (action.toLowerCase().includes(q)) score += 15;
    }

    const words = q.split(/[\s,/-]+/).filter((w) => w.length >= 2);
    for (const w of words) {
      if (titleLower.includes(w)) score += 10;
      if (descLower.includes(w)) score += 5;
    }

    if (score > bestScore) {
      bestScore = score;
      bestRoute = route;
    }
  }

  return bestScore >= 10 ? bestRoute : null;
}
