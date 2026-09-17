export const STOCK_ISSUE_HAS_CHILDREN_MESSAGE = "ไม่สามารถยกเลิกเบิกได้: มีประวัติชั่งคืนหรือของเสียที่อ้างอิงรายการนี้ กรุณาตรวจรายการปลายทางก่อน";

// Conservative: history requires reconciliation, even if a child was later voided.
export async function assertStockIssueHasNoChildren(db, issueItemId) {
  const [receipts, movements] = await Promise.all([
    db.from("production_weight_receipts").select("id")
      .eq("metadata->>sourceIssueItemId", issueItemId).limit(1),
    db.from("production_stock_movements").select("id")
      .eq("metadata->>sourceIssueItemId", issueItemId)
      .in("movement_type", ["return_in", "waste_out"]).limit(1),
  ]);
  if (receipts.error || movements.error) {
    throw new Error("ตรวจสอบรายการต่อเนื่องไม่สำเร็จ ยังไม่อนุญาตให้ยกเลิกเบิก");
  }
  if (receipts.data?.length || movements.data?.length) {
    throw new Error(STOCK_ISSUE_HAS_CHILDREN_MESSAGE);
  }
}
