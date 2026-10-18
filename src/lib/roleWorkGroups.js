import { permissionItems } from "./permissionMatrix.js";

const GROUPS = [
  ["production", "งานการผลิต"],
  ["hr", "ทรัพยากรบุคคล"],
  ["data", "ข้อมูลหลัก"],
  ["settings", "ตั้งค่าระบบ"],
  ["compatibility", "สิทธิ์เดิมและงานอื่น"],
  ["sensitive", "ข้อมูลสำคัญและการอนุมัติ"],
];
const WORK = [
  [/^(production-output-|production-packing-output-)/, "บันทึกผลผลิต", "ยกเลิกรายการแยกจากการบันทึก เพื่อป้องกันผลกระทบสต็อก"],
  [/^(production-weigh-|production-scale-receipt-|central-scale-)/, "ชั่งรับสินค้าเข้า", "รวมทั้งการรับคืนจากการชั่ง"],
  [/^production-jam-usage-/, "บันทึกการใช้แยม", "ตรวจสอบ LOT และน้ำหนักที่ใช้จริงก่อนบันทึก"],
  [/^production-prison-/, "คลังเรือนจำ", "การรับเข้า เบิกคืน และยกเลิกมีผลต่อยอดคงเหลือ"],
  [/^production-stock-/, "เบิกจ่ายสินค้า", "ยกเลิกใบเบิกมีผลต่อสต็อกโดยตรง"],
  [/^production-fg-wip-/, "คลังสินค้า FG / WIP", "ตรวจสอบ LOT และจำนวนก่อนทำรายการ"],
  [/^production-piece-rate-/, "บันทึกงานคิดค่าแรง", "สิทธิ์ดูจำนวนเงินและแก้อัตราค่าแรงกำหนดแยกด้านล่าง"],
  [/^(production-line-bom-|production-line-planning-|plan\.)/, "สูตรและแผนการผลิต", "การอนุมัติสูตรและการเผยแพร่แผนต้องได้รับสิทธิ์เพิ่มเติม"],
  [/^(raw-|raw-materials-|admin-requisition$|admin-returns$|stock-inventory$)/, "คลังวัตถุดิบ", "ครอบคลุมวัตถุดิบและวัสดุสิ้นเปลือง"],
  [/^wip-opening-/, "สต็อกตั้งต้น WIP", "จำนวนตั้งต้นมีผลต่อยอดคงเหลือ"],
];
const LABELS = {
  "production-line-bom-view": "เปิดดูสูตร", "production-line-bom-manage": "สร้างและแก้ไขสูตร", "production-line-bom-approve": "อนุมัติสูตร",
  "production-line-planning-view": "เปิดดูแผน", "production-line-planning-manage": "สร้างและแก้ไขแผน",
  "plan.publish_master": "เผยแพร่แผน", "plan.edit_own_dept": "แก้ไขแผนแผนกตนเอง", "plan.calculate_own_dept": "คำนวณแผนแผนกตนเอง", "plan.view_all": "เปิดดูแผนทุกแผนก",
  "raw-materials-summary": "เปิดดูคงเหลือรวม", "raw-materials-lot": "เปิดดูคงเหลือแยก LOT", "raw-materials-movement": "เปิดดูการเคลื่อนไหว",
  "central-scale-view": "เปิดดูรายการชั่งกลาง", "central-scale-receive": "บันทึกรับเข้าจากเครื่องชั่ง",
  "production-line-attendance-piece-rate-money-view": "ดูจำนวนเงินค่าแรง",
};

export function buildRoleWorkGroups(permissionGroups) {
  const groups = new Map(GROUPS.map(([id, title]) => [id, { id, title, rows: new Map() }]));
  for (const source of permissionGroups) {
    for (const item of permissionItems(source)) {
      const key = item.perm_key || "";
      const sensitive = /(?:^|-)cost(?:-|$)/.test(key) || /(?:money|rate)-(?:view|write|manage|edit)$/.test(key) || /^production-settings-(?:piece-rate|snack-wage)-/.test(key);
      const work = WORK.find(([pattern]) => pattern.test(key));
      const groupId = sensitive ? "sensitive" : work ? "production" : /^hr-/.test(key) || source.id === "hr" ? "hr" : /^data-/.test(key) || source.id === "data_admin" ? "data" : source.id === "system_settings" || /^(production-line-settings-|production-settings-)/.test(key) ? "settings" : "compatibility";
      const label = LABELS[key] || item.label.replace(/\s*\((View|Manage|Approve)\)$/, (match, action) => " · " + ({ View: "เปิดดู", Manage: "จัดการ", Approve: "อนุมัติ" }[action]));
      const title = sensitive ? "สิทธิ์ข้อมูลสำคัญ" : work?.[1] || item.label.replace(/\s*\((View|Manage|Approve)\)$/, "");
      const rowId = sensitive ? "sensitive" : work?.[1] || key.replace(/-(view|write|manage|approve|cancel)$/, "");
      const rows = groups.get(groupId).rows;
      if (!rows.has(rowId)) rows.set(rowId, { id: rowId, title, note: sensitive ? "ข้อมูลนี้มีผลกระทบต่อค่าใช้จ่ายขององค์กร ควรจำกัดเฉพาะผู้ที่ได้รับมอบหมาย" : work?.[2] || (groupId === "compatibility" ? "สิทธิ์เดิมยังใช้งานได้ตามขอบเขตเดิมของระบบ" : "ขอบเขตแผนกกำหนดที่ผู้ใช้งาน"), items: [] });
      rows.get(rowId).items.push({ ...item, label });
    }
  }
  return [...groups.values()].map((group) => ({ ...group, rows: [...group.rows.values()] })).filter((group) => group.rows.length);
}
