export function validatePieceRateIssueProductRoles({ fgProduct, wipLog } = {}) {
  if (!fgProduct) return "กรุณาระบุสินค้า FG ก่อนสแกนป้าย WIP";
  if (!wipLog) return "ไม่พบข้อมูลสินค้า WIP ในป้าย";
  return "";
}
