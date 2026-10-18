import { buildPieceRateIssueSummaryRows } from "../../attendance/utils/buildPieceRateIssueSummaryRows.js";

const sum = (rows, key) => Number(rows.reduce((total, row) => total + Number(row[key] || 0), 0).toFixed(3));
const product = (row) => `${row.productCode || "-"} - ${row.productName || "-"}`;
const date = (value) => String(value || "-").slice(0, 10);
const column = (key, label, width, numeric = false) => ({ key, label, width: `${width}%`, ...(numeric ? { format: "number", align: "right" } : {}) });
const sequence = column("sequence", "#", 4);
const balanceColumns = [sequence, column("product", "สินค้า", 49), column("lotNo", "LOT", 16), column("balanceQty", "จำนวนคงเหลือ", 13, true), column("balanceWeightKg", "น้ำหนักคงเหลือ (กก.)", 18, true)];
const receiptColumns = [sequence, column("barcode", "บาร์โค้ด", 11), column("productCode", "รหัสสินค้า", 10), column("productName", "ชื่อสินค้า", 20), column("lotNo", "LOT", 10), column("quantity", "จำนวน", 5, true), column("weightKg", "น้ำหนัก (กก.)", 8, true), column("time", "เวลา", 5), column("employeeCode", "รหัสพนักงาน", 10), column("employeeName", "ชื่อพนักงาน", 11), column("statusLabel", "สถานะ", 6)];
const issueColumns = [column("sequence", "#", 3), column("time", "วันที่–เวลาเบิก", 10), column("barcode", "บาร์โค้ดป้าย", 10), column("product", "สินค้า WIP", 25), column("lotNo", "LOT", 9), column("quantity", "จำนวน", 6, true), column("weightKg", "น้ำหนักเบิก", 8, true), column("fgProduct", "สินค้า FG ที่นำไปผลิต", 29)];
const summaryColumns = [column("sequence", "#", 10), column("lotNo", "LOT", 20), column("product", "สินค้า", 45), column("quantity", "จำนวน", 12, true), column("weightKg", "น้ำหนัก (กก.)", 13, true)];
const issueSummaryColumns = [sequence, column("issueDate", "วันที่เบิก", 8), column("wipProductCode", "รหัส WIP", 9), column("wipProductName", "สินค้า WIP", 18), column("lotWeightsText", "LOT / น้ำหนัก (กก.)", 16), column("quantity", "จำนวน", 6, true), column("totalWeightKg", "น้ำหนักรวม (กก.)", 10, true), column("fgProductCode", "รหัส FG", 9), column("fgProductName", "ชื่อสินค้า FG ที่ผลิต", 20)];
const movementGroups = [["opening", "ยกยอด"], ["inbound", "รับเข้า"], ["issue", "เบิก"], ["return", "ชั่งคืน"], ["waste", "ของเสีย"], ["actual", "ใช้จริง"], ["balance", "คงเหลือ"]];
const movementColumns = [column("sequence", "#", 2.5), column("product", "สินค้า", 20.5), column("lotNo", "LOT", 8), ...movementGroups.flatMap(([key, label]) => [
  { ...column(`${key}Qty`, "จำนวน", 4.9285, true), group: label },
  { ...column(`${key}WeightKg`, "น้ำหนัก", 4.9285, true), group: label },
])];
const prisonColumns = [sequence, column("time", "วันเวลา", 12), column("kindLabel", "ประเภท", 9), column("documentNo", "เลขเอกสาร", 13), column("barcode", "บาร์โค้ด", 12), column("product", "สินค้า", 22), column("lotNo", "LOT", 10), column("quantity", "จำนวน", 5, true), column("weightKg", "น้ำหนัก", 6, true), column("employee", "พนักงาน", 7)];
const config = (title, reportType, columns, subtotalSpan, extra = {}) => ({ title, printTitle: title, description: "ข้อมูลสินค้าและ LOT จากระบบบันทึกเนื้อขนมป้ายแยม", category: "ป้ายแยม", departmentName: "แผนกป้ายแยม", subtitle: "PIECE RATE STOCK REPORT", orientation: columns.length > 5 ? "landscape" : "portrait", reportType, columns, subtotalSpan, totalSpan: subtotalSpan, ...extra });
export const JAM_REPORTS = {
  "jam-inbound": config("รายงานรับเข้า WIP", "inbound", summaryColumns, 3),
  "jam-inbound-detail": config("รายงานรับเข้า WIP แบบละเอียด", "inbound", receiptColumns, 5),
  "jam-fg": config("รายงานรับเข้า FG ผลิตเสร็จ", "inbound-fg", summaryColumns, 3),
  "jam-fg-detail": config("รายงานรับเข้า FG แบบละเอียด", "inbound-fg", receiptColumns, 5),
  "jam-issue": config("รายงานสรุปเบิกป้ายแยม", "issue", issueSummaryColumns.map((item) => item.key === "totalWeightKg" ? { ...item, format: "weight" } : item), 5),
  "jam-issue-detail": config("รายงานเบิกป้ายแยมแบบละเอียด", "issue", issueColumns, 5),
  "jam-movement": config("รายงานเคลื่อนไหวป้ายแยม", "movement", movementColumns, 3),
  "jam-balance": config("รายงานคงเหลือป้ายแยม", "balance", balanceColumns, 3, { showDates: false }),
  "jam-prison-in": config("รายงานรับเข้าเรือนจำ", "prison", prisonColumns, 7, { prisonView: "receipt" }),
  "jam-prison-out": config("รายงานเบิกออกเรือนจำ", "prison", [sequence, column("time", "วันเวลาเบิก", 13), column("barcode", "บาร์โค้ดป้าย", 13), column("product", "สินค้า WIP", 23), column("lotNo", "LOT", 10), column("fgProduct", "สินค้า FG ที่ผลิต", 22), column("weightKg", "น้ำหนักเบิก", 8, true), column("remark", "หมายเหตุ", 7)], 6, { prisonView: "issue" }),
  "jam-prison-balance": config("รายงานคงเหลือเรือนจำราย LOT", "prison", balanceColumns, 3, { prisonView: "balance", showDates: false }),
};

export function buildJamReportRows(reportId, payload) {
  const definition = JAM_REPORTS[reportId];
  const source = payload.rows || [];
  let rows = [];
  let index = 0;
  const item = (row) => ({ ...row, _key: `row-${++index}`, sequence: index, product: product(row), quantity: row.quantityIn || row.quantityOut || 0, weightKg: row.weightInKg || row.weightOutKg || 0, time: row.movementAt ? new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(row.movementAt)) : "-", fgProduct: row.fgProductCode ? `${row.fgProductCode} - ${row.fgProductName || "-"}` : "-", statusLabel: row.status === "issued" ? "เบิกแล้ว" : row.status === "cancelled" ? "ยกเลิกชั่ง" : "พร้อมเบิก", employee: row.employeeCode || row.employeeName || "-", documentNo: row.documentNo || row.movementNo || "-" });
  if (reportId === "jam-issue") {
    rows = buildPieceRateIssueSummaryRows(source).map((row) => ({ ...row, _key: row.groupKey, sequence: ++index, lotWeightsText: row.lotWeights.map((lot) => `${lot.lotNo} · ${lot.weightKg}`).join(" | ") }));
  } else if (definition.reportType === "balance" || definition.prisonView === "balance" || definition.reportType === "movement") {
    const sorted = [...source].sort((a, b) => String(a.productCode).localeCompare(String(b.productCode), "th") || String(a.reportDate || "").localeCompare(String(b.reportDate || "")) || String(a.lotNo).localeCompare(String(b.lotNo), "th"));
    for (const [code, group] of Map.groupBy(sorted, (row) => row.productCode)) {
      let previousDate;
      for (const row of group) {
        if (definition.reportType === "movement" && previousDate !== row.reportDate) {
          previousDate = row.reportDate;
          rows.push({ _kind: "group", _key: `${code}-${previousDate}`, _label: `วันที่รายงาน: ${previousDate || "-"}` });
        }
        rows.push(item(row));
      }
      rows.push({ _kind: "subtotal", _key: `total-${code}`, _label: `รวม ${product(group[0])}`, ...Object.fromEntries(definition.columns.filter((col) => col.format === "number").map((col) => [col.key, sum(group, col.key)])) });
    }
  } else if (definition.reportType === "inbound" || definition.reportType === "inbound-fg") {
    const status = payload.filters?.status || "inbound";
    const active = source.filter((row) => status === "inbound" ? row.status !== "cancelled" : row.status === status).sort((a, b) => new Date(a.movementAt || 0) - new Date(b.movementAt || 0));
    for (const [day, daily] of Map.groupBy(active, (row) => date(row.movementAt))) {
      rows.push({ _kind: "group", _key: day, _label: `วันที่ ${day}` });
      if (reportId.endsWith("-detail")) rows.push(...daily.map((row) => ({ ...item(row), time: row.movementAt ? new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" }).format(new Date(row.movementAt)) : "-" })));
      else for (const [key, group] of Map.groupBy(daily, (row) => [row.lotNo, row.productCode, row.productName].join("|"))) {
        for (let start = 0; start < group.length; start += 20) {
          const chunk = group.slice(start, start + 20);
          rows.push({ ...item(chunk[0]), sequence: Math.floor(start / 20) + 1, _key: `${day}-${key}-${start}`, quantity: sum(chunk, "quantityIn"), weightKg: sum(chunk, "weightInKg") });
        }
        rows.push({ _kind: "subtotal", _key: `total-${day}-${key}`, _label: "ยอดรวม", quantity: sum(group, "quantityIn"), weightKg: sum(group, "weightInKg") });
      }
    }
  } else {
    let previousDate;
    const selected = source.filter((row) => definition.reportType !== "issue" || (payload.filters?.issueStatuses || ["issue"]).includes(row.kind));
    if (definition.reportType === "issue") selected.sort((a, b) => new Date(a.movementAt || 0) - new Date(b.movementAt || 0));
    for (const row of selected) {
      const day = date(row.movementAt);
      if (definition.reportType === "issue" && previousDate !== day) {
        previousDate = day;
        rows.push({ _kind: "group", _key: day, _label: `วันที่ ${day}` });
      }
      rows.push({ ...item(row), ...(definition.reportType === "issue" && row.kind === "issue_void" ? { quantity: row.quantityIn, weightKg: row.weightInKg, fgProduct: `${row.fgProductCode || "-"} - ${row.fgProductName || "-"} (ยกเลิกเบิก)` } : {}) });
    }
  }
  const data = rows.filter((row) => !row._kind);
  return { rows, totalRow: Object.fromEntries(definition.columns.filter((col) => col.format === "number").map((col) => [col.key, sum(data, col.key)])) };
}
