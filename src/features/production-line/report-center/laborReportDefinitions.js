const text = (key, label, width) => ({ key, label, width });
const numeric = (key, label, width = "9%") => ({ key, label, width, format: "number", align: "right" });
const dateText = (value, time = false) => value ? new Intl.DateTimeFormat("th-TH", { dateStyle: "short", ...(time ? { timeStyle: "short" } : {}), timeZone: "Asia/Bangkok" }).format(new Date(String(value).length === 10 ? `${value}T12:00:00+07:00` : value)) : "-";
const common = { category: "เวลาและค่าแรง", departmentName: "ฝ่ายผลิต", subtitle: "TIME AND LABOR REPORT", orientation: "landscape", description: "รายงานข้อมูลตามช่วงวันที่ที่เลือก" };
export const LABOR_REPORTS = {
  "scan-events": { ...common, title: "รายงานสแกนเข้า–ออกงาน", printTitle: "รายงานสแกนเข้า–ออกงาน", columns: [
    text("employeeCode", "รหัส", "8%"), text("employeeName", "ชื่อพนักงาน", "19%"), text("department", "แผนก", "10%"),
    ...[["fingerInMorning", "เข้างาน"], ["fingerOutLunch", "พักเที่ยง"], ["fingerInAfternoon", "เข้าบ่าย"], ["fingerOutEvening", "เลิกงาน"], ["checkIn", "เข้าห้อง"], ["checkOut", "ออกห้อง"]].map(([key, label]) => text(key, label, "7%")),
    text("timeGap", "ส่วนต่าง", "10%"), text("scannedBy", "ผู้บันทึกสแกน", "11%"),
  ] },
  wages: { ...common, title: "รายงานค่าแรงรายชิ้น", printTitle: "รายงานค่าแรงรายชิ้น: รวมเอกสาร", viewMode: "grouped", subtotalSpan: 6, totalSpan: 6 },
  "wages-detail": { ...common, title: "รายงานค่าแรงรายชิ้น", printTitle: "รายงานค่าแรงรายชิ้น: แยกเอกสาร", viewMode: "detail", totalSpan: 6 },
  "wages-employee": { ...common, title: "รายงานค่าแรงรายชิ้น", printTitle: "รายงานค่าแรงรายชิ้น: ตามพนักงาน", viewMode: "employee", totalSpan: 3, columns: [
    text("employeeCode", "รหัส", "9%"), text("employeeName", "ชื่อพนักงาน", "25%"), text("employeeDepartment", "แผนก", "10%"),
    numeric("workDayCount", "วันทำงาน", "7%"), numeric("normalizedKgAmount", "กก.รวม", "10%"), numeric("kgPerDay", "กก./วัน"), numeric("typeAverageKgPerDay", "เฉลี่ยงาน"), { ...text("comparison", "เทียบเฉลี่ย %", "11%"), signedComparison: true, align: "center" }, numeric("wageAmount", "ค่าแรง", "10%"),
  ] },
  "wages-product": { ...common, title: "รายงานค่าแรงรายชิ้น", printTitle: "รายงานค่าแรงรายชิ้น: ตามสินค้า", viewMode: "product", orientation: "portrait", totalSpan: 5, columns: [
    text("sequence", "#", "6%"), text("date", "วันที่", "12%"), text("productCode", "รหัสสินค้า", "10%"), text("productBrandName", "แบรนด์", "10%"), text("productName", "ชื่อสินค้า", "37%"), numeric("countValue", "จำนวนรวม", "11%"), numeric("normalizedKgAmount", "น้ำหนักรวม", "14%"),
  ] },
};
for (const id of ["wages", "wages-detail"]) LABOR_REPORTS[id].columns = [
  text("date", id === "wages" ? "วันที่" : "เวลาชั่งจริง / ผู้บันทึก", "13%"), text("document", "เลขเอกสาร", "10%"), text("employeeCode", "รหัสพนักงาน", "10%"), text("employee", "ชื่อพนักงาน", "19%"), text("productCode", "รหัสสินค้า", "9%"), text("product", "ชื่อสินค้า", "22%"), numeric("normalizedKgAmount", "น้ำหนัก", "7%"), numeric("countValue", "จำนวน", "4%"), numeric("wageAmount", "ค่าแรง", "6%"),
];
LABOR_REPORTS.wages.columns = LABOR_REPORTS.wages.columns.map((column) => ({
  ...column,
  width: ({ date: "11%", document: "7%", employee: "24%" })[column.key] || column.width,
  align: ["date", "document", "employeeCode", "productCode", "normalizedKgAmount", "countValue", "wageAmount"].includes(column.key) ? "center" : "left",
}));

function timeGap(row) {
  if (!row.fingerInMorning || row.fingerInMorning === "-" || !row.checkIn || row.checkIn === "-") return "-";
  const seconds = (value) => value.split(":").reduce((total, part, index) => total + Number(part) * [3600, 60, 1][index], 0);
  const difference = seconds(row.checkIn) - seconds(row.fingerInMorning);
  return `${difference < 0 ? "ก่อนสแกน " : ""}${Math.floor(Math.abs(difference) / 60)} นาที`;
}

function comparisonText(value) {
  if (value == null || value === "" || !Number.isFinite(Number(value))) return "-";
  const rounded = Number(Number(value).toFixed(2));
  return `${rounded > 0 ? "+" : ""}${rounded.toFixed(2)}%`;
}

export function buildLaborReportModel(reportId, payload = {}) {
  const base = LABOR_REPORTS[reportId];
  const definition = { ...base, columns: base.columns.filter((column) => column.key !== "wageAmount" || payload.capabilities?.canViewMoney === true) };
  const rows = [];
  const source = payload.rows || [];
  const grouped = reportId === "wages";
  const sorted = grouped ? [...source].sort((a, b) => String(a.groupDayKey || a.loggedAt).slice(0, 10).localeCompare(String(b.groupDayKey || b.loggedAt).slice(0, 10)) || String(a.productName || "").localeCompare(String(b.productName || ""), "th-TH") || String(a.productCode || a.productSkuCode || "").localeCompare(String(b.productCode || b.productSkuCode || ""), "th-TH") || String(a.employeeName || "").localeCompare(String(b.employeeName || ""), "th-TH") || (Date.parse(b.loggedAt) || 0) - (Date.parse(a.loggedAt) || 0)) : source;
  let currentDate = "";
  sorted.forEach((sourceRow, index) => {
    const row = { ...sourceRow, mergedCount: sourceRow.mergedRowCount || 1 };
    const day = reportId === "scan-events" ? row.date : row.groupDayKey || String(row.loggedAt || "").slice(0, 10);
    if ((grouped || reportId === "scan-events") && currentDate !== day) {
      rows.push({ _kind: "group", _key: `date-${day}-${index}`, _label: `วันที่ ${dateText(day)}` });
      currentDate = day;
    }
    rows.push({ ...row, _key: row.id || index, sequence: index + 1, date: `${dateText(reportId === "wages-detail" ? row.loggedAt : row.dayKey || day || row.loggedAt, reportId === "wages-detail")}${row.operatorUsername ? ` · ${row.operatorUsername}` : ""}`, productCode: row.productCode || row.productSkuCode, product: [row.productName, row.weightOptionLabel].filter(Boolean).join(" · "), employee: [row.employeeName, row.employeeDepartment].filter(Boolean).join(" · "), document: grouped ? `${row.mergedCount || row.documentCount || 1} ใบ` : [row.docNo, row.docStatus, row.revisedFromDocNo ? `แก้จาก ${row.revisedFromDocNo}` : "", row.replacedByDocNo ? `แทนที่ ${row.replacedByDocNo}` : ""].filter(Boolean).join(" · "), comparison: comparisonText(row.vsTypeAveragePct), timeGap: reportId === "scan-events" ? timeGap(row) : undefined });
    if (grouped && row.isGroupedProductTail) rows.push({ _kind: "subtotal", _key: `subtotal-${row.id || index}`, _label: `รวม ${row.productCode || row.productSkuCode} - ${row.productName}`, normalizedKgAmount: row.groupSubtotalNormalizedKgAmount, countValue: row.groupSubtotalCountValue, wageAmount: row.groupSubtotalWageAmount });
  });
  const summary = payload.summary || {};
  const totalRow = reportId === "scan-events" ? null : { normalizedKgAmount: summary.totalKg, countValue: summary.totalCount, wageAmount: summary.totalWage, workDayCount: summary.totalWorkDays, kgPerDay: "", typeAverageKgPerDay: "", comparison: "-" };
  return { definition, rows, totalRow, departmentName: "ฝ่ายผลิต", productOptions: payload.products || [], selectedProductCodes: payload.filters?.productCodes || [], dateFrom: payload.filters?.dateFrom || "", dateTo: payload.filters?.dateTo || "" };
}
