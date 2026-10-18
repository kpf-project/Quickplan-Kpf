import { calculateAverageWeightPerTin } from "../utils/buildFgPackingReportRows.js";

const text = (key, label, width, extra = {}) => ({ key, label, width, ...extra });
const numeric = (key, label, width, extra = {}) => text(key, label, width, { format: "number", align: "right", ...extra });
const common = { category: "ผลผลิตและของเสีย", departmentName: "ฝ่ายผลิต KP13", orientation: "landscape", dateMode: "single" };
export const OUTPUT_REPORTS = {
  "fg-wip": {
    ...common, title: "รายงานผลผลิต FG และ WIP รายวัน", printTitle: "รายงานสรุปยอดผลิต FG และ WIP ค้างไลน์", subtitle: "DAILY FG & WIP REPORT", description: "ผลผลิตสำเร็จรูปและยอด WIP ค้างไลน์ประจำวัน", totalSpan: 4,
    columns: [
      text("sequence", "#", "3%", { align: "center" }), text("lot_no", "LOT", "7%"), text("fg_barcode_snapshot", "รหัส", "8%"), text("fg_product_name_snapshot", "ชื่อสินค้าสำเร็จรูป FG", "16%"),
      text("fgQuantity", "จำนวน FG", "7%", { align: "right" }), numeric("fg_tin_qty", "เทียบเท่า FG (ปี๊บ)", "7%"), text("wip_product_code", "รหัส WIP", "8%"), text("wip_product_name_snapshot", "ชื่อสินค้า WIP ค้างไลน์", "16%"), numeric("wip_tin_qty", "ค้างไลน์ (ปี๊บ)", "7%"), numeric("overallTins", "ผลผลิตรวม (ปี๊บ)", "7%"),
      text("operator_username_snapshot", "ผู้บันทึก", "7%"), text("recordedTime", "เวลาบันทึก", "7%"),
    ],
  },
  "wip-balance": {
    ...common, title: "รายงานสรุปสต็อกคงเหลือ WIP ค้างไลน์", printTitle: "รายงานสรุปสต็อกคงเหลือ WIP", subtitle: "WIP STOCK BALANCE REPORT", description: "WIP ค้างไลน์สะสมและจำนวนคงเหลือแต่ละ LOT", orientation: "portrait", showDates: false, totalSpan: 4,
    columns: [text("sequence", "#", "8%", { align: "center" }), text("productCode", "รหัสสินค้า", "20%"), text("productName", "ชื่อสินค้า", "42%"), text("lotNo", "LOT", "18%"), numeric("remainingQty", "คงเหลือ (ปี๊บ)", "12%")],
  },
  "fg-packing": {
    ...common, title: "รายงานการบรรจุ", printTitle: "รายงานการบรรจุ", subtitle: "PACKING PRODUCTION REPORT", description: "ยอดยกมา เนื้อขนม ของเสีย ผลผลิต และยอดค้างไลน์ แยกตามสินค้า FG",
    columns: [
      text("fgCode", "รหัสสินค้า FG", "8%"), text("fgName", "ชื่อสินค้าสำเร็จรูป FG", "15%"), numeric("carriedOverTins", "ยอดยกมา (ปี๊บ)", "5%"),
      text("lots", "LOT", "10%", { group: "เนื้อขนมเบิกมาใช้", multiline: true }), text("lotWeightsText", "น้ำหนัก (กก.)", "8%", { group: "เนื้อขนมเบิกมาใช้", multiline: true, align: "right" }),
      numeric("actualWeightKg", "เนื้อขนมใช้จริง (กก.)", "8%"), numeric("scrapWeightKg", "เศษหัก (กก.)", "6%", { group: "ของเสีย" }), numeric("rejectedCanQty", "ปี๊บเสีย", "5%", { group: "ของเสีย" }),
      numeric("producedTins", "ปี๊บที่ผลิตได้", "7%", { group: "ผลิตงานได้" }), text("fgQuantity", "จำนวน FG", "8%", { group: "ผลิตงานได้" }), numeric("producedWeightKg", "น้ำหนัก (กก.)", "7%", { group: "ผลิตงานได้" }), text("averageGrams", "เฉลี่ยต่อปี๊บ (กรัม)", "7%", { group: "ผลิตงานได้", align: "right" }), numeric("remainingWipTins", "ยอดค้างไลน์ผลิต (ปี๊บ)", "6%"),
    ],
  },
};
const numberText = (value) => Number(value || 0).toLocaleString("th-TH", { maximumFractionDigits: 3 });
const sum = (rows, key) => Number(rows.reduce((total, row) => total + Number(row[key] || 0), 0).toFixed(3));

export function buildOutputReportModel(reportId, payload = {}) {
  const definition = OUTPUT_REPORTS[reportId];
  const rows = (payload.rows || []).map((row, index) => {
    if (reportId === "fg-wip") return { ...row, sequence: index + 1, fgQuantity: `${numberText(row.fg_case_qty)} ${row.fg_unit_snapshot || "กล่อง"}`, overallTins: Number(row.fg_tin_qty || 0) + Number(row.wip_tin_qty || 0), recordedTime: row.created_at ? new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Bangkok" }).format(new Date(row.created_at)) : "-" };
    if (reportId === "fg-packing") {
      const average = calculateAverageWeightPerTin(row.actualWeightKg, row.producedTins);
      return { ...row, lots: (row.lotWeights || []).map((lot) => lot.lotNo).join("\n") || "-", lotWeightsText: (row.lotWeights || []).map((lot) => Number(lot.weightKg || 0).toFixed(3)).join("\n") || "-", fgQuantity: (row.fgQuantities || []).map((group) => `${numberText(group.quantity)} ${group.unitName}`).join(" + ") || "-", averageGrams: average == null ? "—" : (average * 1000).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) };
    }
    return { ...row, sequence: index + 1 };
  });
  const totalRow = reportId === "wip-balance" ? { remainingQty: sum(rows, "remainingQty") } : reportId === "fg-wip" ? { fgQuantity: `${numberText(sum(rows, "fg_case_qty"))} หน่วย`, fg_tin_qty: sum(rows, "fg_tin_qty"), wip_product_code: "", wip_product_name_snapshot: "", wip_tin_qty: sum(rows, "wip_tin_qty"), overallTins: sum(rows, "overallTins"), operator_username_snapshot: "", recordedTime: "" } : null;
  return { definition, rows, totalRow, departmentName: common.departmentName, productOptions: payload.products || [], selectedProductCodes: payload.filters?.productCodes || [], dateFrom: payload.filters?.dateFrom || "", dateTo: payload.filters?.dateFrom || "" };
}
