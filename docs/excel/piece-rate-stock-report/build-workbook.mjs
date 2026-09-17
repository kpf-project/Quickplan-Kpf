import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputPath = process.argv[2];
if (!outputPath) throw new Error("Output path is required");

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("รายงานรับเข้า");
sheet.showGridLines = false;
sheet.tabColor = "#123C6C";

sheet.getRange("A2:K2").merge();
sheet.getRange("A2").values = [["รายงานรับเข้า WIP"]];
sheet.getRange("A2").format = {
  font: { name: "Arial", size: 16, bold: true, color: "#123C6C" },
  verticalAlignment: "center",
};
sheet.getRange("A3:K3").format.borders = {
  bottom: { style: "thin", color: "#94A3B8" },
};

sheet.getRange("A4:F5").values = [
  ["URL ระบบ", "https://production.kpfoods.co.th", null, null, "", "พร้อมใช้งาน"],
  ["วันที่เริ่ม", new Date("2026-09-01T00:00:00"), "วันที่สิ้นสุด", new Date(), "", ""],
];
sheet.getRange("A4:A5").format.font = { name: "Arial", size: 10, bold: true, color: "#334155" };
sheet.getRange("C5").format.font = { name: "Arial", size: 10, bold: true, color: "#334155" };
sheet.getRange("B4:B5").format.fill = "#FEF3C7";
sheet.getRange("D5").format.fill = "#FEF3C7";
sheet.getRange("B5").format.numberFormat = "dd/mm/yyyy";
sheet.getRange("D5").format.numberFormat = "dd/mm/yyyy";
sheet.getRange("F5").format.font = { name: "Arial", size: 10, italic: true, color: "#64748B" };

sheet.getRange("A6:K6").merge();
sheet.getRange("A6").values = [["กดปุ่มดึงรายงาน แล้วเข้าสู่ระบบด้วยบัญชีเดียวกับหน้าเว็บ รหัสผ่านจะไม่ถูกบันทึก"]];
sheet.getRange("A6").format.font = { name: "Arial", size: 10, italic: true, color: "#475569" };

const headers = [[
  "วันที่รับเข้า", "วันเวลารับเข้า", "บาร์โค้ด", "รหัสสินค้า", "ชื่อสินค้า", "LOT",
  "จำนวน", "น้ำหนัก (กก.)", "รหัสพนักงาน", "ชื่อพนักงาน", "สถานะ",
]];
sheet.getRange("A8:K9").values = [...headers, Array(11).fill(null)];
const table = sheet.tables.add("A8:K9", true, "PieceRateInboundReport");
table.style = "TableStyleMedium4";

sheet.getRange("A1:K9").format.font = { name: "Arial", size: 10, color: "#1E293B" };
sheet.getRange("A8:K8").format = {
  fill: "#123C6C",
  font: { name: "Arial", size: 10, bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
};
sheet.getRange("G9:H9").format.numberFormat = "#,##0.000";
sheet.freezePanes.freezeRows(8);

const widths = [13, 20, 20, 15, 28, 18, 12, 16, 16, 22, 14];
widths.forEach((width, index) => {
  sheet.getRangeByIndexes(0, index, 9, 1).format.columnWidth = width;
});
sheet.getRange("A2:K2").format.rowHeight = 28;
sheet.getRange("A8:K8").format.rowHeight = 24;

workbook.recalculate();
console.log((await workbook.inspect({
  kind: "table",
  range: "รายงานรับเข้า!A1:K9",
  include: "values,formulas",
  tableMaxRows: 12,
  tableMaxCols: 12,
})).ndjson);
console.log((await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 100 },
})).ndjson);

const preview = await workbook.render({ sheetName: "รายงานรับเข้า", range: "A1:K14", scale: 1.5, format: "png" });
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(`${outputPath}.png`, new Uint8Array(await preview.arrayBuffer()));
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
