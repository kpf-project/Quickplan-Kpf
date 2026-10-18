import { JAM_REPORTS, buildJamReportRows } from "./jamReportDefinitions.js";
import { LABOR_REPORTS, buildLaborReportModel } from "./laborReportDefinitions.js";
import { OUTPUT_REPORTS, buildOutputReportModel } from "./outputReportDefinitions.js";
const number = (value) => Number(value || 0);
const sum = (rows, key) => Number(rows.reduce((total, row) => total + number(row?.[key]), 0).toFixed(3));

function dateText(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ""))) return value || "-";
  return new Intl.DateTimeFormat("th-TH", { day: "2-digit", month: "2-digit", year: "2-digit", timeZone: "Asia/Bangkok" })
    .format(new Date(`${value}T12:00:00+07:00`));
}

function lotText(lots, maximumFractionDigits = 3) {
  return Array.isArray(lots) && lots.length
    ? lots.map((lot) => `${lot.lotNo || "-"} · ${number(lot.quantity).toLocaleString("th-TH", { maximumFractionDigits })} · ${number(lot.weightKg).toLocaleString("th-TH", { maximumFractionDigits })}`).join("  |  ")
    : "-";
}

function issueProductText(row) {
  const source = `${row.productCode || ""} - ${row.productName || ""}`;
  if (row.destinationRoomName) return `${source} → ${row.destinationRoomName}`;
  return row.targetProductCode
    ? `${source} → ${row.targetProductCode} - ${row.targetProductName || "-"}`
    : source;
}

function productOptions(payload, rows) {
  const options = new Map();
  (payload.scope?.products || []).forEach((product) => options.set(product.code, { code: product.code, name: product.name }));
  (rows || []).forEach((row) => {
    if (row.productCode && !options.has(row.productCode)) options.set(row.productCode, { code: row.productCode, name: row.productName || row.productCode });
  });
  return Array.from(options.values()).sort((left, right) => left.code.localeCompare(right.code, "th"));
}

function movementRows(sourceRows) {
  const sorted = [...(sourceRows || [])].sort((left, right) => (
    String(left.productCode || "").localeCompare(String(right.productCode || ""), "th")
    || String(left.issueDate || "").localeCompare(String(right.issueDate || ""))
    || String(left.lotNo || "").localeCompare(String(right.lotNo || ""), "th")
  ));
  const result = [];
  let sequence = 0;

  for (const [productCode, rows] of Map.groupBy(sorted, (row) => row.productCode || "-")) {
    const openingByLot = new Map();
    const balanceByLot = new Map();
    const subtotal = Object.fromEntries(["inboundQuantity", "inboundWeightKg", "issueQuantity", "issueWeightKg", "returnQuantity", "returnWeightKg", "wasteQuantity", "wasteWeightKg", "actualQuantity", "actualWeightKg"].map((key) => [key, 0]));
    let currentDate = null;

    rows.forEach((row) => {
      const issueDate = row.issueDate || "-";
      const lotNo = row.lotNo || "-";
      if (issueDate !== currentDate) {
        result.push({ _kind: "group", _key: `date-${productCode}-${issueDate}`, _label: `วันที่รายงาน: ${dateText(issueDate)}` });
        currentDate = issueDate;
      }
      if (!openingByLot.has(lotNo)) openingByLot.set(lotNo, { quantity: number(row.openingQuantity), weight: number(row.openingWeightKg) });
      balanceByLot.set(lotNo, { quantity: number(row.balanceQuantity), weight: number(row.balanceWeightKg) });
      Object.keys(subtotal).forEach((key) => { subtotal[key] += number(row[key]); });
      sequence += 1;
      result.push({ _key: `${productCode}-${issueDate}-${lotNo}-${sequence}`, ...row, sequence, product: `${row.productCode || ""} - ${row.productName || ""}` });
    });

    subtotal.openingQuantity = sum(Array.from(openingByLot.values()), "quantity");
    subtotal.openingWeightKg = sum(Array.from(openingByLot.values()), "weight");
    subtotal.balanceQuantity = sum(Array.from(balanceByLot.values()), "quantity");
    subtotal.balanceWeightKg = sum(Array.from(balanceByLot.values()), "weight");
    result.push({ _kind: "subtotal", _key: `subtotal-${productCode}`, _label: `รวม ${productCode} - ${rows[0]?.productName || ""}`, ...subtotal });
  }
  return result;
}

function scaleSummaryRows(sourceRows) {
  const sorted = [...(sourceRows || [])].sort((left, right) => (
    String(left.groupDate || "").localeCompare(String(right.groupDate || ""))
    || String(left.productCode || "").localeCompare(String(right.productCode || ""), "th")
    || String(left.lotNo || "").localeCompare(String(right.lotNo || ""), "th")
  ));
  const result = [];
  let currentDate = "";
  let currentGroup = "";
  let groupRows = [];

  const flush = () => {
    if (!groupRows.length) return;
    groupRows.forEach((row, index) => result.push({
      _key: row.groupKey || `${currentGroup}-${index}`,
      sequence: index + 1,
      lotNo: row.lotNo,
      product: `${row.productCode || ""} - ${row.productName || ""}`,
      quantity: row.quantity,
      totalNetWeightKg: row.totalNetWeightKg,
    }));
    result.push({
      _kind: "subtotal",
      _key: `subtotal-${currentGroup}`,
      _label: "ยอดรวม",
      quantity: sum(groupRows, "quantity"),
      totalNetWeightKg: sum(groupRows, "totalNetWeightKg"),
    });
    groupRows = [];
  };

  sorted.forEach((row) => {
    const date = row.groupDate || "-";
    const group = row.parentGroupKey || `${date}|${row.lotNo || "-"}|${row.productCode || "-"}`;
    if (currentGroup && group !== currentGroup) flush();
    if (date !== currentDate) {
      result.push({ _kind: "group", _key: `date-${date}`, _label: `วันที่รายงาน: ${dateText(date)}` });
      currentDate = date;
    }
    currentGroup = group;
    groupRows.push(row);
  });
  flush();
  return result;
}

function scaleDetailRows(receipts) {
  const sorted = [...(receipts || [])].sort((left, right) => (
    String(left.weighedAt || "").localeCompare(String(right.weighedAt || ""))
    || String(left.productCode || "").localeCompare(String(right.productCode || ""), "th")
    || String(left.lotNo || "").localeCompare(String(right.lotNo || ""), "th")
  ));
  const result = [];
  let sequence = 0;
  for (const [key, rows] of Map.groupBy(sorted, (row) => `${String(row.weighedAt || "").slice(0, 10)}|${row.productCode || "-"}|${row.lotNo || "-"}`)) {
    const first = rows[0] || {};
    result.push({
      _kind: "group",
      _key: `group-${key}`,
      _label: `วันที่รายงาน: ${dateText(String(first.weighedAt || "").slice(0, 10))} · ${first.productCode || "-"} - ${first.productName || "-"} · LOT ${first.lotNo || "-"}`,
    });
    rows.forEach((row) => {
      sequence += 1;
      result.push({
        _key: row.id || `${key}-${sequence}`,
        sequence,
        barcode: row.barcode,
        product: `${row.productCode || ""} - ${row.productName || ""}`,
        lotNo: row.lotNo,
        quantity: 1,
        netWeightKg: row.netWeightKg,
        time: row.weighedAt ? new Intl.DateTimeFormat("th-TH", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Asia/Bangkok" }).format(new Date(row.weighedAt)) : "-",
      });
    });
    result.push({ _kind: "subtotal", _key: `subtotal-${key}`, _label: `สรุปยอด LOT ${first.lotNo || "-"}`, quantity: rows.length, netWeightKg: sum(rows, "netWeightKg"), time: "" });
  }
  return result;
}

function issueSummaryRows(sourceRows) {
  const mapped = (sourceRows || []).map((row) => ({ ...row, returnQuantity: row.returnQuantity || 0, returnWeightKg: row.returnWeightKg || 0, actualQuantity: row.actualQuantity ?? Math.max(0, number(row.quantity) - number(row.returnQuantity)), actualWeightKg: row.actualWeightKg ?? Math.max(0, number(row.totalWeightKg) - number(row.returnWeightKg)) })).sort((left, right) => (
    String(left.productCode || "").localeCompare(String(right.productCode || ""), "th")
    || String(left.issueDate || "").localeCompare(String(right.issueDate || ""))
    || String(left.lotNo || "").localeCompare(String(right.lotNo || ""), "th")
  ));
  const result = [];
  let sequence = 0;
  for (const [key, rows] of Map.groupBy(mapped, (row) => `${row.productCode || "-"}|${row.destinationRoomCode || "-"}|${row.issueStatus || "confirmed"}`)) {
    rows.forEach((row) => {
      sequence += 1;
      result.push({ _key: row.id || `${key}-${sequence}`, sequence, date: dateText(row.issueDate), lotNo: row.lotNo, product: issueProductText(row), issueType: row.issueType || "-", quantity: row.quantity, weightKg: row.totalWeightKg, returnQuantity: row.returnQuantity, returnWeightKg: row.returnWeightKg, actualQuantity: row.actualQuantity, actualWeightKg: row.actualWeightKg });
    });
    if (rows.length > 1) result.push({
      _kind: "subtotal",
      _key: `subtotal-${key}`,
      _label: `รวม ${rows[0]?.productCode || "-"} - ${rows[0]?.productName || "-"}`,
      quantity: sum(rows, "quantity"),
      weightKg: sum(rows, "totalWeightKg"),
      returnQuantity: sum(rows, "returnQuantity"),
      returnWeightKg: sum(rows, "returnWeightKg"),
      actualQuantity: sum(rows, "actualQuantity"),
      actualWeightKg: sum(rows, "actualWeightKg"),
    });
  }
  return result;
}

function issueDetailRows(sourceRows) {
  const result = [];
  let sequence = 0;
  for (const [key, rows] of Map.groupBy(sourceRows || [], (row) => [row.issueDate, row.lotNo, row.productCode, row.destinationRoomCode, row.issueType].join("|"))) {
    const first = rows[0] || {};
    result.push({ _kind: "group", _key: `group-${key}`, _label: `วันที่ ${dateText(first.issueDate)} · ${first.productCode || "-"} - ${first.productName || "-"} · LOT ${first.lotNo || "-"}` });
    rows.forEach((row) => {
      sequence += 1;
      result.push({ _key: row.id || row.issueItemId || `${key}-${sequence}`, sequence, dateTime: row.issuedAt ? new Intl.DateTimeFormat("th-TH", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Bangkok" }).format(new Date(row.issuedAt)) : dateText(row.issueDate), barcode: row.barcode, product: issueProductText(row), lotNo: row.lotNo, issueType: row.issueType || "-", quantity: row.quantity, weightKg: row.weightKg });
    });
    result.push({ _kind: "subtotal", _key: `subtotal-${key}`, _label: "สรุปรวมกลุ่ม", quantity: sum(rows, "quantity"), weightKg: sum(rows, "weightKg") });
  }
  return result;
}

function balanceRows(sourceRows) {
  const sorted = [...(sourceRows || [])].sort((left, right) => (
    String(left.productCode || "").localeCompare(String(right.productCode || ""), "th")
    || String(left.lotNo || "").localeCompare(String(right.lotNo || ""), "th")
  ));
  const result = [];
  let sequence = 0;
  for (const [productCode, rows] of Map.groupBy(sorted, (row) => row.productCode || "-")) {
    rows.forEach((row) => { sequence += 1; result.push({ _key: row.id || `${productCode}-${row.lotNo || sequence}`, ...row, sequence }); });
    result.push({ _kind: "subtotal", _key: `subtotal-${productCode}`, _label: `รวม (${productCode}) - ${rows[0]?.productName || "-"}`, balanceQuantity: sum(rows, "balanceQuantity"), balanceWeightKg: sum(rows, "balanceWeightKg") });
  }
  return result;
}

const common = {
  category: "ชั่งและสต็อก",
  departmentName: "แผนกบิสกิต",
  subtitle: "PRODUCTION LINE REPORT",
};

export const CENTER_REPORT_IDS = new Set([
  "stock-movement",
  "input-output",
  "scale-inbound",
  "scale-inbound-detail",
  "stock-issue",
  "stock-issue-detail",
  "stock-balance",
  "stock-balance-detail",
]);

export const CENTER_REPORTS = {
  "stock-movement": {
    ...common,
    title: "รายงานเคลื่อนไหวสินค้า",
    description: "ตรวจสอบยอดยกมา รับเข้า เบิก คืน ใช้จริง และคงเหลือรายวัน",
    printTitle: "รายงานเคลื่อนไหวสินค้า",
    reportId: "KPF-PL-STK-001",
    orientation: "landscape",
    subtotalSpan: 3,
    totalSpan: 3,
    columns: [
      { key: "sequence", label: "#", width: "2.5%", align: "center" },
      { key: "product", label: "สินค้า", width: "23%" },
      { key: "lotNo", label: "LOT", width: "9%" },
      { key: "openingQuantity", label: "จำนวน", group: "ยกยอด", width: "4.675%", format: "number", align: "right" },
      { key: "openingWeightKg", label: "น้ำหนัก", group: "ยกยอด", width: "4.675%", format: "number", align: "right" },
      { key: "inboundQuantity", label: "จำนวน", group: "รับเข้าสำเร็จ", width: "4.675%", format: "number", align: "right" },
      { key: "inboundWeightKg", label: "น้ำหนัก", group: "รับเข้าสำเร็จ", width: "4.675%", format: "number", align: "right" },
      { key: "issueQuantity", label: "จำนวน", group: "เบิกสำเร็จ", width: "4.675%", format: "number", align: "right" },
      { key: "issueWeightKg", label: "น้ำหนัก", group: "เบิกสำเร็จ", width: "4.675%", format: "number", align: "right" },
      { key: "returnQuantity", label: "จำนวน", group: "ชั่งคืน", width: "4.675%", format: "number", align: "right" },
      { key: "returnWeightKg", label: "น้ำหนัก", group: "ชั่งคืน", width: "4.675%", format: "number", align: "right" },
      { key: "wasteQuantity", label: "จำนวน", group: "ของเสีย", width: "4.675%", format: "number", align: "right" },
      { key: "wasteWeightKg", label: "น้ำหนัก", group: "ของเสีย", width: "4.675%", format: "number", align: "right" },
      { key: "actualQuantity", label: "จำนวน", group: "ใช้จริงสุทธิ", width: "4.675%", format: "number", align: "right" },
      { key: "actualWeightKg", label: "น้ำหนัก", group: "ใช้จริงสุทธิ", width: "4.675%", format: "number", align: "right" },
      { key: "balanceQuantity", label: "จำนวน", group: "คงเหลือ", width: "4.675%", format: "number", align: "right" },
      { key: "balanceWeightKg", label: "น้ำหนัก", group: "คงเหลือ", width: "4.675%", format: "number", align: "right" },
    ],
  },
  "input-output": {
    ...common,
    category: "ผลผลิตและวัตถุดิบ",
    title: "รายงานผลผลิตและวัตถุดิบ",
    description: "สรุปวัตถุดิบใช้จริง แยม ของเสีย และผลผลิตสำเร็จรูป",
    printTitle: "รายงานผลผลิตและวัตถุดิบ",
    reportId: "KPF-PL-STK-002",
    orientation: "landscape",
    subtotalSpan: 3,
    totalSpan: 3,
    columns: [
      { key: "sequence", label: "#", width: "2.5%", align: "center" },
      { key: "shellProduct", label: "รหัส / ชื่อวัตถุดิบ", group: "เปลือก / เนื้อขนม", width: "10.75%", screenWidth: "11.75%", multiline: true },
      { key: "shellLots", label: "LOT · จำนวน · น้ำหนัก (กก.)", group: "เปลือก / เนื้อขนม", width: "14%", screenWidth: "15%", unbrokenEntries: true },
      { key: "shellQuantity", label: "จำนวน", group: "เปลือก / เนื้อขนม", width: "5%", screenWidth: "5%", format: "number", align: "right" },
      { key: "shellWeightKg", label: "น้ำหนัก (กก.)", group: "เปลือก / เนื้อขนม", width: "6%", format: "weight", align: "right" },
      { key: "jamName", label: "ชื่อแยม", group: "แยมใช้จริง", width: "6%", screenWidth: "7%" },
      { key: "jamLots", label: "LOT · จำนวน · น้ำหนัก (กก.)", group: "แยมใช้จริง", width: "11.5%", screenWidth: "11%", unbrokenEntries: true },
      { key: "jamQuantity", label: "จำนวน", group: "แยมใช้จริง", width: "4.5%", screenWidth: "4.5%", format: "number", align: "right" },
      { key: "jamWeightKg", label: "น้ำหนัก (กก.)", group: "แยมใช้จริง", width: "5%", format: "weight", align: "right" },
      { key: "fgProduct", label: "รหัส / ชื่อสินค้า", group: "WIP / FG ปลายทางและผลผลิต", width: "12.75%", screenWidth: "12.25%" },
      { key: "fgQuantity", label: "จำนวน", group: "WIP / FG ปลายทางและผลผลิต", width: "5%", screenWidth: "4%", format: "number", align: "right" },
      { key: "fgWeightKg", label: "น้ำหนัก (กก.)", group: "WIP / FG ปลายทางและผลผลิต", width: "6.5%", screenWidth: "5.5%", format: "weight", align: "right" },
      { key: "labelScrapWeightKg", label: "ป้าย", group: "ของเสีย (กก.)", width: "3.5%", format: "weight", align: "right" },
      { key: "brokenScrapWeightKg", label: "หัก", group: "ของเสีย (กก.)", width: "3.5%", format: "weight", align: "right" },
      { key: "burntScrapWeightKg", label: "ไหม้", group: "ของเสีย (กก.)", width: "3.5%", format: "weight", align: "right" },
    ],
  },
  "scale-inbound": {
    ...common,
    title: "รายงานชั่งสรุป",
    description: "สรุปรายการชั่งรับเข้าฝ่ายผลิต แยกตามสินค้าและ LOT",
    printTitle: "รายงานสรุปชั่งรับเข้า",
    reportId: "KPF-PL-STK-003",
    orientation: "portrait",
    subtotalSpan: 3,
    totalSpan: 3,
    columns: [
      { key: "sequence", label: "#", width: "9%", align: "center" },
      { key: "lotNo", label: "LOT", width: "20%" },
      { key: "product", label: "สินค้า", width: "46%" },
      { key: "quantity", label: "จำนวน", width: "10%", format: "number", align: "right" },
      { key: "totalNetWeightKg", label: "น้ำหนัก (กก.)", width: "15%", format: "number", align: "right" },
    ],
  },
  "scale-inbound-detail": {
    ...common,
    title: "รายงานชั่งละเอียด",
    description: "รายการชั่งรับเข้าทุกรายการ พร้อมบาร์โค้ด เวลา และสถานะ",
    printTitle: "รายงานชั่งรับเข้าแบบละเอียด",
    reportId: "KPF-PL-STK-004",
    orientation: "portrait",
    subtotalSpan: 4,
    totalSpan: 4,
    columns: [
      { key: "sequence", label: "#", width: "5%", align: "center" },
      { key: "barcode", label: "บาร์โค้ด", width: "15%" },
      { key: "product", label: "สินค้า", width: "34%" },
      { key: "lotNo", label: "LOT", width: "17%" },
      { key: "quantity", label: "จำนวน", width: "6%", format: "number", align: "right" },
      { key: "netWeightKg", label: "น้ำหนัก (กก.)", width: "8%", format: "number", align: "right" },
      { key: "time", label: "เวลา", width: "15%", align: "center" },
    ],
  },
  "stock-issue": {
    ...common,
    title: "รายงานเบิกสรุป",
    description: "สรุปยอดเบิก คืน และใช้จริง แยกตามสินค้าและ LOT",
    printTitle: "รายงานสรุปเบิก-คืน-ใช้จริง",
    reportId: "KPF-PL-STK-005",
    orientation: "portrait",
    subtotalSpan: 5,
    totalSpan: 5,
    columns: [
      { key: "sequence", label: "#", width: "3%", align: "center" },
      { key: "date", label: "วันที่", width: "8%", align: "center" },
      { key: "lotNo", label: "LOT", width: "13%" },
      { key: "product", label: "สินค้า", width: "24%" },
      { key: "issueType", label: "ประเภท", width: "7%", align: "center" },
      { key: "quantity", label: "จำนวน", group: "เบิก", width: "5.5%", format: "number", align: "right" },
      { key: "weightKg", label: "น้ำหนัก", group: "เบิก", width: "9%", format: "number", align: "right" },
      { key: "returnQuantity", label: "จำนวน", group: "คืน", width: "5.5%", format: "number", align: "right" },
      { key: "returnWeightKg", label: "น้ำหนัก", group: "คืน", width: "9%", format: "number", align: "right" },
      { key: "actualQuantity", label: "จำนวน", group: "ใช้จริง", width: "5.5%", format: "number", align: "right" },
      { key: "actualWeightKg", label: "น้ำหนัก", group: "ใช้จริง", width: "10.5%", format: "number", align: "right" },
    ],
  },
  "stock-issue-detail": {
    ...common,
    title: "รายงานเบิกรายละเอียด",
    description: "รายการเบิกตามเอกสารและบาร์โค้ด พร้อมปลายทางการใช้งาน",
    printTitle: "รายงานเบิกแบบละเอียด",
    reportId: "KPF-PL-STK-006",
    orientation: "landscape",
    subtotalSpan: 6,
    totalSpan: 6,
    columns: [
      { key: "sequence", label: "#", width: "4%", align: "center" },
      { key: "dateTime", label: "วันที่–เวลาเบิก", width: "13%", align: "center" },
      { key: "barcode", label: "รหัสบาร์โค้ด", width: "13%" },
      { key: "product", label: "สินค้า WIP → สินค้าปลายทาง", width: "36%" },
      { key: "lotNo", label: "LOT", width: "10%" },
      { key: "issueType", label: "ประเภท", width: "8%", align: "center" },
      { key: "quantity", label: "จำนวน", width: "6%", format: "number", align: "right" },
      { key: "weightKg", label: "น้ำหนัก", width: "10%", format: "number", align: "right" },
    ],
  },
  "stock-balance": {
    ...common,
    title: "รายงานคงเหลือราย LOT สรุป",
    description: "ยอดคงเหลือปัจจุบันแยกตามสินค้าและ LOT",
    printTitle: "รายงานสรุปคงเหลือราย LOT",
    reportId: "KPF-PL-STK-007",
    orientation: "portrait",
    subtotalSpan: 4,
    totalSpan: 4,
    showDates: false,
    columns: [
      { key: "sequence", label: "#", width: "8%", align: "center" },
      { key: "productCode", label: "รหัสสินค้า", width: "20%" },
      { key: "productName", label: "ชื่อสินค้า", width: "38%" },
      { key: "lotNo", label: "LOT", width: "20%" },
      { key: "balanceQuantity", label: "จำนวนคงเหลือ", width: "14%", format: "number", align: "right" },
    ],
  },
  "stock-balance-detail": {
    ...common,
    title: "รายงานคงเหลือราย LOT รายละเอียด",
    description: "รายละเอียดรับเข้า เบิก คืน ใช้จริง และยอดคงเหลือของแต่ละ LOT",
    printTitle: "รายงานคงเหลือราย LOT แบบละเอียด",
    reportId: "KPF-PL-STK-008",
    orientation: "portrait",
    subtotalSpan: 4,
    totalSpan: 4,
    showDates: false,
    columns: [
      { key: "sequence", label: "#", width: "6%", align: "center" },
      { key: "productCode", label: "รหัสสินค้า", width: "16%" },
      { key: "productName", label: "รายการสินค้า", width: "34%" },
      { key: "lotNo", label: "LOT", width: "16%" },
      { key: "balanceQuantity", label: "จำนวน", width: "12%", format: "number", align: "right" },
      { key: "balanceWeightKg", label: "น้ำหนัก (กก.)", width: "16%", format: "number", align: "right" },
    ],
  },
};

for (const [id, title, detailed] of [
  ["prison-inbound", "รายงานสรุปรับเข้าเรือนจำ", false],
  ["prison-inbound-detail", "รายงานรับเข้าเรือนจำแบบละเอียด", true],
  ["prison-issue", "รายงานสรุปเบิกออกเรือนจำ", false],
  ["prison-issue-detail", "รายงานเบิกออกเรือนจำแบบละเอียด", true],
]) {
  const base = CENTER_REPORTS[detailed ? "stock-issue-detail" : "stock-issue"];
  CENTER_REPORTS[id] = { ...base, title, printTitle: title, reportId: "", ...(detailed ? {} : { columns: base.columns.filter((column) => column.key !== "issueType").map((column) => column.key === "product" ? { ...column, width: "31%" } : column), subtotalSpan: 4, totalSpan: 4 }) };
  CENTER_REPORT_IDS.add(id);
}
for (const id of ["prison-balance", "prison-movement"]) {
  const title = id === "prison-balance" ? "รายงาน LOT คงค้างเรือนจำ" : "รายงานสรุป ชั่ง-เบิก เรือนจำ";
  const movementGroups = id === "prison-balance"
    ? [["opening", "ยอดยกมา"], ["inbound", "รับเข้าในช่วง"], ["issue", "เบิกออกในช่วง"], ["balance", "คงเหลือปลายงวด"]]
    : [["inbound", "รับเข้า"], ["issue", "เบิกออก"], ["balance", "คงเหลือ"]];
  CENTER_REPORTS[id] = { ...common, title, printTitle: title, description: title, orientation: "landscape", totalSpan: id === "prison-balance" ? 2 : 3, columns: [
    ...(id === "prison-movement" ? [{ key: "date", label: "วันที่", width: "10%" }] : []),
    { key: "product", label: "สินค้า", width: id === "prison-balance" ? "28%" : "24%" },
    { key: "lotNo", label: "LOT", width: id === "prison-balance" ? "16%" : "18%" },
    ...movementGroups.flatMap(([prefix, group]) => [
      { key: `${prefix}Quantity`, label: "จำนวน", group, width: id === "prison-balance" ? "7%" : "8%", format: "number", align: "right" },
      { key: `${prefix}WeightKg`, label: "น้ำหนัก", group, width: id === "prison-balance" ? "7%" : "8%", format: "number", align: "right" },
    ]),
  ] };
  CENTER_REPORT_IDS.add(id);
}

export function buildCenterReportModel(reportId, payload = {}) {
  if (OUTPUT_REPORTS[reportId]) return buildOutputReportModel(reportId, payload);
  if (LABOR_REPORTS[reportId]) return buildLaborReportModel(reportId, payload);
  const definition = JAM_REPORTS[reportId] || CENTER_REPORTS[reportId] || CENTER_REPORTS["stock-issue"];
  let rows = [];
  let totalRow = null;

  if (JAM_REPORTS[reportId]) {
    ({ rows, totalRow } = buildJamReportRows(reportId, payload));
  } else if (reportId === "scale-inbound") {
    rows = scaleSummaryRows(payload.rows);
    totalRow = { quantity: payload.summary?.totalQuantity, totalNetWeightKg: payload.summary?.totalNetWeightKg };
  } else if (reportId === "scale-inbound-detail") {
    rows = scaleDetailRows(payload.receipts);
    totalRow = { quantity: payload.summary?.totalCount, netWeightKg: payload.summary?.totalNetWeightKg };
  } else if (["stock-issue", "prison-inbound", "prison-issue"].includes(reportId)) {
    rows = issueSummaryRows(payload.rows);
    const dataRows = rows.filter((row) => !row._kind);
    totalRow = Object.fromEntries(["quantity", "weightKg", "returnQuantity", "returnWeightKg", "actualQuantity", "actualWeightKg"].map((key) => [key, sum(dataRows, key)]));
  } else if (["stock-issue-detail", "prison-inbound-detail", "prison-issue-detail"].includes(reportId)) {
    rows = issueDetailRows(payload.rows);
    const dataRows = rows.filter((row) => !row._kind);
    totalRow = { quantity: sum(dataRows, "quantity"), weightKg: sum(dataRows, "weightKg") };
  } else if (["prison-balance", "prison-movement"].includes(reportId)) {
    rows = (payload.rows || []).map((row, index) => ({ ...row, _key: `${row.productCode}-${row.lotNo}-${index}`, date: dateText(row.issueDate || row.lastInboundDate), product: `${row.productCode} - ${row.productName}` }));
    totalRow = Object.fromEntries(definition.columns.slice(definition.totalSpan).map((column) => [column.key, sum(rows, column.key)]));
  } else if (reportId === "stock-movement") {
    rows = movementRows(payload.rows);
    totalRow = Object.fromEntries(definition.columns.slice(definition.totalSpan).map((column) => [column.key, number(payload.summary?.[column.key])]));
  } else if (reportId === "stock-balance" || reportId === "stock-balance-detail") {
    rows = balanceRows(payload.rows);
    const dataRows = rows.filter((row) => !row._kind);
    totalRow = Object.fromEntries(definition.columns.slice(definition.totalSpan).map((column) => [column.key, sum(dataRows, column.key)]));
  } else if (reportId === "input-output") {
    const selected = new Set(Array.isArray(payload.filters?.productCodes) ? payload.filters.productCodes : []);
    rows = (payload.days || []).flatMap((day) => {
      const fgTotals = new Map();
      (day.rows || []).forEach((row) => {
        if (!row.fgCode) return;
        const totals = fgTotals.get(row.fgCode) || { quantity: 0, weight: 0 };
        totals.quantity += number(row.fgQuantity);
        totals.weight += number(row.fgWeightKg);
        fgTotals.set(row.fgCode, totals);
      });
      const visibleRows = (day.rows || []).filter((row) => row.inputKind !== "wip" || (fgTotals.get(row.fgCode)?.quantity > 0 && fgTotals.get(row.fgCode)?.weight > 0));
      const matchedFg = new Set(visibleRows.filter((row) => selected.has(row.shellCode) || selected.has(row.fgCode)).map((row) => row.fgCode).filter(Boolean));
      const dayRows = visibleRows.filter((row) => !selected.size || selected.has(row.shellCode) || matchedFg.has(row.fgCode));
      if (!dayRows.length) return [];
      const mappedRows = dayRows.map((row, index) => ({ _key: `${day.date}-${index}`, sequence: index + 1, inputKind: row.inputKind, inputUnit: row.inputUnit, fgCode: row.fgCode, shellProduct: [row.shellCode, row.shellName].filter(Boolean).join(" - ") || "-", shellLots: lotText(row.shellLots), shellQuantity: row.shellQuantity, shellWeightKg: row.shellWeightKg, jamName: row.jam?.name || "-", jamLots: lotText(row.jam?.lots, 2), jamQuantity: row.jam?.quantity, jamWeightKg: row.jam?.weightKg, fgProduct: [row.fgCode, row.fgName].filter(Boolean).join(" - ") || "-", fgQuantity: row.fgQuantity, fgWeightKg: row.fgWeightKg, labelScrapWeightKg: row.labelScrapWeightKg, brokenScrapWeightKg: row.brokenScrapWeightKg, burntScrapWeightKg: row.burntScrapWeightKg }));
      const groupedRows = [];
      const wipFg = new Set(mappedRows.filter((row) => row.inputKind === "wip").map((row) => row.fgCode));
      const seen = new Set();
      mappedRows.forEach((row) => {
        if (!wipFg.has(row.fgCode)) { groupedRows.push(row); return; }
        if (seen.has(row.fgCode)) return;
        seen.add(row.fgCode);
        const parts = mappedRows.filter((part) => part.fgCode === row.fgCode);
        const output = Object.fromEntries(["fgQuantity", "fgWeightKg", "labelScrapWeightKg", "brokenScrapWeightKg", "burntScrapWeightKg"].map((key) => [key, sum(parts, key)]));
        groupedRows.push({ ...row, ...output, fgProduct: parts.find((part) => part.fgProduct !== "-")?.fgProduct || "-", _parts: parts, _rowSpanKeys: ["sequence", "fgProduct", ...Object.keys(output)] });
      });
      const rawRows = dayRows.filter((row) => row.inputKind !== "wip");
      const wipUnits = [...new Set(dayRows.filter((row) => row.inputKind === "wip").map((row) => row.inputUnit || ""))];
      return [
        { _kind: "group", _key: `date-${day.date}`, _label: `วันที่ ${dateText(day.date)}` },
        ...groupedRows.map((row, index) => ({ ...row, sequence: index + 1 })),
        { _kind: "subtotal", _key: `subtotal-${day.date}`, _label: wipUnits.length ? "รวมเปลือก" : `รวมวันที่ ${dateText(day.date)}`, shellQuantity: sum(rawRows, "shellQuantity"), shellWeightKg: sum(rawRows, "shellWeightKg"), jamName: "", jamLots: "", jamQuantity: sum(dayRows.map((row) => ({ value: row.jam?.quantity })), "value"), jamWeightKg: sum(dayRows.map((row) => ({ value: row.jam?.weightKg })), "value"), fgCode: "", fgName: "", fgQuantity: sum(dayRows, "fgQuantity"), fgWeightKg: sum(dayRows, "fgWeightKg"), labelScrapWeightKg: sum(dayRows, "labelScrapWeightKg"), brokenScrapWeightKg: sum(dayRows, "brokenScrapWeightKg"), burntScrapWeightKg: sum(dayRows, "burntScrapWeightKg") },
        ...wipUnits.map((unit) => ({ _kind: "subtotal", _key: `wip-${day.date}-${unit}`, _label: "รวมเนื้อขนม", inputUnit: unit, shellQuantity: sum(dayRows.filter((row) => row.inputKind === "wip" && (row.inputUnit || "") === unit), "shellQuantity"), shellWeightKg: sum(dayRows.filter((row) => row.inputKind === "wip" && (row.inputUnit || "") === unit), "shellWeightKg") })),
      ];
    });
  }

  return {
    definition,
    rows,
    totalRow,
    totalCount: rows.filter((row) => !row._kind).length,
    departmentName: payload.scope?.departmentName || payload.departmentName || definition.departmentName,
    productOptions: productOptions(payload, payload.rows),
    selectedProductCodes: Array.isArray(payload.filters?.productCodes) ? payload.filters.productCodes : [],
    dateFrom: payload.filters?.dateFrom || "",
    dateTo: payload.filters?.dateTo || payload.filters?.dateFrom || "",
  };
}
