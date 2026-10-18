export function permissionItems(group) {
  return group.sections?.length ? group.sections.flatMap((section) => section.items || []) : (group.items || []);
}

const PRESENTATION = {
  "production-cost-view": ["cost", "ต้นทุนการผลิต", "เปิดดูต้นทุนการผลิต", "view"],
  "production-cost-write": ["cost", "ต้นทุนการผลิต", "บันทึกและแก้ไขต้นทุนการผลิต", "manage"],
  "raw-materials-summary": ["raw", "คลังวัตถุดิบ", "คงเหลือรวม", "view"],
  "raw-materials-lot": ["raw", "คลังวัตถุดิบ", "คงเหลือแยก LOT", "view"],
  "raw-materials-movement": ["raw", "คลังวัตถุดิบ", "เคลื่อนไหววัตถุดิบ", "view"],
  "central-scale-view": ["scale", "ชั่งและรับเข้ากลาง", "ดูหน้าชั่งกลาง", "view"],
  "central-scale-receive": ["scale", "ชั่งและรับเข้ากลาง", "บันทึกรับเข้าจากเครื่องชั่ง", "manage"],
  "wip-opening-view": ["opening", "สต็อคตั้งต้น WIP", "ดูสต็อคตั้งต้น WIP", "view"],
  "wip-opening-manage": ["opening", "สต็อคตั้งต้น WIP", "บันทึกสต็อคตั้งต้น WIP", "manage"],
  "plan.view_all": ["planning", "วางแผนการผลิต", "ดูแผนทุกแผนก", "view"],
  "plan.calculate_own_dept": ["planning", "วางแผนการผลิต", "คำนวณแผนแผนกตนเอง", "manage"],
  "plan.edit_own_dept": ["planning", "วางแผนการผลิต", "แก้ไขแผนแผนกตนเอง", "manage"],
  "plan.publish_master": ["planning", "วางแผนการผลิต", "เผยแพร่แผนหลัก", "special"],
  "plan.approve_exception": ["planning", "วางแผนการผลิต", "อนุมัติกรณีพิเศษ", "approve"],
  "plan.claim_material": ["claims", "การจัดสรรวัตถุดิบ", "จองวัตถุดิบ (Claim)", "special"],
  "plan.release_claim": ["claims", "การจัดสรรวัตถุดิบ", "ปล่อยการจองวัตถุดิบ", "special"],
  "plan.reassign_claim": ["claims", "การจัดสรรวัตถุดิบ", "โอนผู้รับผิดชอบการจอง", "special"],
  "plan.view_claim_all": ["claims", "การจัดสรรวัตถุดิบ", "ดูการจองวัตถุดิบทุกแผนก", "view"],
  "plan.consolidate_cross_qa": ["claims", "การจัดสรรวัตถุดิบ", "รวมการจองข้าม QA", "special"],
  "plan.verify_materials": ["claims", "การจัดสรรวัตถุดิบ", "ตรวจสอบวัตถุดิบก่อนจอง", "special"],
  "production-line-attendance-piece-rate-money-view": ["production_line", "ไลน์ผลิต", "ดูจำนวนเงินค่าแรง", "view"],
};

export function buildPermissionMatrix(groups) {
  const result = new Map();
  for (const group of groups) {
    for (const item of permissionItems(group)) {
      const key = item.perm_key || "";
      const presentation = PRESENTATION[key];
      const groupId = presentation?.[0] || group.id;
      if (!result.has(groupId)) result.set(groupId, { id: groupId, title: presentation?.[1] || group.title, rows: new Map() });
      const rows = result.get(groupId).rows;
      const match = key.match(/^(production-line-(?:bom|planning|settings|attendance|attendance-report))-(view|manage|approve)$/);
      const resource = match ? match[1] : item.id;
      const action = presentation?.[3] || (match ? match[2] : "special");
      if (!rows.has(resource)) rows.set(resource, { id: resource, label: presentation?.[2] || item.label.replace(/\s*\((View|Manage|Approve)\)$/, ""), cells: {} });
      // Duplicate registrations must remain visible rather than replacing a checkbox.
      if (rows.get(resource).cells[action]) rows.set(item.id, { id: item.id, label: item.label, cells: { [action]: item } });
      else
      rows.get(resource).cells[action] = item;
    }
  }
  return [...result.values()].map((group) => ({ ...group, rows: [...group.rows.values()] }));
}

export function permissionDiff(before, after) {
  const previous = new Set(before);
  const next = new Set(after);
  return { added: [...next].filter((id) => !previous.has(id)), removed: [...previous].filter((id) => !next.has(id)) };
}
