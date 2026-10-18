const attendancePermissions = ["production-line-attendance-view", "production-line-attendance-manage", "production-line-attendance-report-view", "production-line-attendance-report-manage"];
const planningPermissions = ["production-line-planning-view", "production-line-planning-manage"];
const route = (id, label, path, dates = false, detail = null, centerMode = false) => ({ id, label, href: `/production-line${path}`, dates, detail: detail ? `/production-line${detail}` : null, centerMode });

const detailMenuIds = new Set(["scale-inbound-detail", "stock-issue-detail", "stock-balance-detail", "prison-inbound-detail", "prison-issue-detail"]);
export const PIECE_RATE_REPORT_VIEWS = [
  { value: "wages", label: "รวมเอกสาร" },
  { value: "wages-detail", label: "แยกเอกสาร" },
  { value: "wages-employee", label: "ตามพนักงาน" },
  { value: "wages-product", label: "ตามสินค้า" },
];

export function buildReportMenuGroups(groups, query = "") {
  const keyword = query.trim().toLocaleLowerCase("th-TH");
  return groups.map((group) => {
    const reports = group.reports.filter((report) => !PIECE_RATE_REPORT_VIEWS.slice(1).some((view) => view.value === report.id)).filter((report) => keyword
      ? `${group.label} ${report.label}`.toLocaleLowerCase("th-TH").includes(keyword)
      : !detailMenuIds.has(report.id));
    const sections = group.id === "stock" || group.id === "jam"
      ? [
        { label: "ทั่วไป", reports: reports.filter((report) => !report.id.includes("prison")) },
        { label: "เรือนจำ", reports: reports.filter((report) => report.id.includes("prison")) },
      ]
      : [{ label: "", reports }];
    return { ...group, sections: sections.filter((section) => section.reports.length) };
  }).filter((group) => group.sections.length);
}

// Existing report routes remain the source of data, document printing and exports.
export const REPORT_GROUPS = [
  { id: "planning", label: "แผนผลิต", icon: "CalendarDays", permissions: planningPermissions, reports: [
    route("planning-control", "ภาพรวมแผนผลิต", "/planning/report"),
  ] },
  { id: "output", label: "ผลผลิตและของเสีย", icon: "ChartColumn", permissions: attendancePermissions, reports: [
    route("fg-wip", "ผลผลิต FG และ WIP รายวัน", "/fg-wip?reportTab=daily", true),
    route("wip-balance", "WIP ค้างไลน์", "/fg-wip?reportTab=wip-balance"),
    route("fg-packing", "ผลผลิตบรรจุ", "/fg-wip?reportTab=packing", true),
  ] },
  { id: "stock", label: "ชั่งและสต็อก", icon: "Package", permissions: attendancePermissions, reports: [
    route("stock-movement", "รายงานเคลื่อนไหว", "/stock/balance/summary", true, null, true),
    route("scale-inbound", "รายงานชั่ง", "/weight-scale/report-summary", true, null, true),
    route("scale-inbound-detail", "รายงานชั่งละเอียด", "/weight-scale/report", true, null, true),
    route("stock-issue", "รายงานเบิก", "/stock/issues/report-summary", true, null, true),
    route("stock-issue-detail", "รายงานเบิกรายละเอียด", "/stock/issues/report", true, null, true),
    route("stock-balance", "รายงานคงเหลือราย LOT", "/stock/balance", false, null, true),
    route("stock-balance-detail", "รายงานคงเหลือราย LOT รายละเอียด", "/stock/balance/lot", false, null, true),
    route("prison-inbound", "รับเข้าเรือนจำ", "/stock/prison/report-summary", true, null, true),
    route("prison-inbound-detail", "รับเข้าเรือนจำละเอียด", "/stock/prison/report", true, null, true),
    route("prison-issue", "เบิกออกเรือนจำ", "/stock/prison/issues/report-summary", true, null, true),
    route("prison-issue-detail", "เบิกออกเรือนจำละเอียด", "/stock/prison/issues/report", true, null, true),
    route("prison-balance", "LOT คงค้างเรือนจำ", "/stock/prison/balance/lot", true, null, true),
    route("prison-movement", "เคลื่อนไหวเรือนจำ", "/stock/prison/balance/summary", true, null, true),
  ] },
  { id: "input-output", label: "ผลผลิตและวัตถุดิบ", icon: "FileText", permissions: attendancePermissions, standalone: true, reports: [
    route("input-output", "รายงานผลผลิตและวัตถุดิบ", "/attendance/report/input-output", true, null, true),
  ] },
  { id: "jam", label: "ป้ายแยม", icon: "Tag", permissions: attendancePermissions, reports: [
    route("jam-inbound", "รับเข้าป้ายแยม (WIP)", "/attendance/report/piece-rate-stock?reportType=inbound", true),
    route("jam-fg", "FG ผลิตเสร็จ", "/attendance/report/piece-rate-stock?reportType=inbound-fg", true),
    route("jam-issue", "เบิกป้ายแยม", "/attendance/report/piece-rate-stock?reportType=issue", true),
    route("jam-movement", "เคลื่อนไหวป้ายแยม", "/attendance/report/piece-rate-stock?reportType=movement", true),
    route("jam-balance", "คงเหลือป้ายแยม", "/attendance/report/piece-rate-stock?reportType=balance"),
    route("jam-prison-in", "เรือนจำ: รับเข้า", "/attendance/report/piece-rate-stock?reportType=prison&prisonView=receipt", true),
    route("jam-prison-out", "เรือนจำ: เบิกออก", "/attendance/report/piece-rate-stock?reportType=prison&prisonView=issue", true),
    route("jam-prison-balance", "เรือนจำ: คงเหลือ LOT", "/attendance/report/piece-rate-stock?reportType=prison&prisonView=balance"),
  ] },
  { id: "labor", label: "เวลาและค่าแรง", icon: "Clock3", permissions: attendancePermissions, reports: [
    route("scan-events", "สแกนเข้า–ออกงาน", "/attendance/report/scan-events", true),
    route("wages", "ค่าแรงรายชิ้น", "/attendance/report/piece-rate?viewMode=grouped", true),
    route("wages-detail", "ค่าแรงรายชิ้น: รายละเอียด", "/attendance/report/piece-rate?viewMode=detail", true),
    route("wages-employee", "ค่าแรงรายชิ้น: พนักงาน", "/attendance/report/piece-rate?viewMode=employee", true),
    route("wages-product", "ค่าแรงรายชิ้น: สินค้า", "/attendance/report/piece-rate?viewMode=product", true),
  ] },
  { id: "cost", label: "ต้นทุน", icon: "Database", permissions: attendancePermissions, reports: [
    route("cost-estimate", "ประมาณการต้นทุนวัตถุดิบ", "/costing/estimate"),
    route("cost-lot", "ต้นทุน FG / WIP ตาม LOT", "/costing?mode=lot"),
    route("cost-sheet", "Cost Sheet และต้นทางต้นทุน", "/costing?mode=workbench"),
  ] },
];

const REPORT_TASK_KEYS = {
  "fg-wip": ["production-fg-wip-view"], "wip-balance": ["production-fg-wip-view"], "fg-packing": ["production-fg-wip-view"],
  "stock-movement": ["production-stock-balance-view"], "stock-balance": ["production-stock-balance-view"], "stock-balance-detail": ["production-stock-balance-view"],
  "scale-inbound": ["production-scale-receipt-report"], "scale-inbound-detail": ["production-scale-receipt-report"],
  "stock-issue": ["production-stock-issue-report"], "stock-issue-detail": ["production-stock-issue-report"],
  "prison-inbound": ["production-prison-inbound-view"], "prison-inbound-detail": ["production-prison-inbound-view"],
  "prison-issue": ["production-prison-issue-report"], "prison-issue-detail": ["production-prison-issue-report"],
  "prison-balance": ["production-prison-balance-view"], "prison-movement": ["production-prison-balance-view"],
  "scan-events": ["production-attendance-scan-report"],
  "wages": ["production-piece-rate-report-view"], "wages-detail": ["production-piece-rate-report-view"],
  "wages-employee": ["production-piece-rate-report-view"], "wages-product": ["production-piece-rate-report-view"],
  "cost-estimate": ["production-cost-view"], "cost-lot": ["production-cost-view"], "cost-sheet": ["production-cost-view"],
};
export function visibleReportGroups(permissions, isAdmin) {
  return REPORT_GROUPS.map((group) => {
    if (isAdmin || group.permissions.some((key) => permissions.includes(key))) return group;
    const reports = group.reports.filter((report) => (
      REPORT_TASK_KEYS[report.id] || (report.id.startsWith("jam-") ? ["production-piece-rate-stock-view"] : [])
    ).some((key) => permissions.includes(key)));
    return { ...group, reports };
  }).filter((group) => group.reports.length);
}

function validDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

export function reportHref(report, filters, detail = false, embedded = true) {
  const url = new URL(detail && report.detail ? report.detail : report.href, "https://kpf.local");
  if (embedded) url.searchParams.set("reportCenter", "1");
  if (report.dates && (filters.dateFrom || filters.dateTo)) {
    if (!validDate(filters.dateFrom) || !validDate(filters.dateTo) || filters.dateFrom > filters.dateTo) {
      throw new Error("กรุณาเลือกช่วงวันที่ให้ถูกต้อง");
    }
    url.searchParams.set("dateFrom", filters.dateFrom);
    url.searchParams.set("dateTo", filters.dateTo);
  }
  return `${url.pathname}${url.search}`;
}
