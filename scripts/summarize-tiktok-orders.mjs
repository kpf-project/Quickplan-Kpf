import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FileBlob,
  SpreadsheetFile,
  Workbook,
} from "file:///C:/Users/Riew/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const inputPath = path.join(repoRoot, "tiktok-source.xlsx");
const outputPath = path.join(repoRoot, "tiktok-order-substatus-summary.xlsx");

const targetStatuses = [
  "จัดส่งสำเร็จ",
  "ยกเลิกแล้ว",
  "รอเข้ารับ",
  "อยู่ระหว่างขนส่ง",
];

function normalize(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function findHeader(values, headerName) {
  const maxRows = Math.min(values.length, 30);
  for (let rowIndex = 0; rowIndex < maxRows; rowIndex += 1) {
    const row = values[rowIndex] ?? [];
    for (let colIndex = 0; colIndex < row.length; colIndex += 1) {
      if (normalize(row[colIndex]).toLowerCase() === headerName.toLowerCase()) {
        return { rowIndex, colIndex };
      }
    }
  }
  return null;
}

const sourceBlob = await FileBlob.load(inputPath);
const sourceWorkbook = await SpreadsheetFile.importXlsx(sourceBlob);
const sourceSheet = sourceWorkbook.worksheets.getItemAt(0);
const usedRange = sourceSheet.getUsedRange(true);
const values = usedRange.values;

const header = findHeader(values, "Order Substatus");
if (!header) {
  throw new Error("Column 'Order Substatus' was not found in the first worksheet.");
}

const counts = new Map();
let totalWithStatus = 0;
let blankStatus = 0;

for (let rowIndex = header.rowIndex + 1; rowIndex < values.length; rowIndex += 1) {
  const status = normalize(values[rowIndex]?.[header.colIndex]);
  if (!status) {
    blankStatus += 1;
    continue;
  }
  totalWithStatus += 1;
  counts.set(status, (counts.get(status) ?? 0) + 1);
}

const summaryRows = targetStatuses.map((status) => [status, counts.get(status) ?? 0]);
const matchedTotal = summaryRows.reduce((sum, row) => sum + row[1], 0);
const otherRows = [...counts.entries()]
  .filter(([status]) => !targetStatuses.includes(status))
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "th"))
  .map(([status, count]) => [status, count]);

const workbook = Workbook.create();
const summarySheet = workbook.worksheets.add("Summary");
summarySheet.showGridLines = false;

summarySheet.getRange("A1:D1").values = [["TikTok Order Substatus Summary", null, null, null]];
summarySheet.mergeCells("A1:D1");
summarySheet.getRange("A1").format = {
  fill: "#0F766E",
  font: { bold: true, color: "#FFFFFF", size: 16 },
  horizontalAlignment: "center",
};

summarySheet.getRange("A3:B3").values = [["Order Substatus", "Order Count"]];
summarySheet.getRange("A3:B3").format = {
  fill: "#134E4A",
  font: { bold: true, color: "#FFFFFF" },
};
summarySheet.getRangeByIndexes(3, 0, summaryRows.length, 2).values = summaryRows;
summarySheet.getRange(`A${4 + summaryRows.length}:B${4 + summaryRows.length}`).values = [
  ["รวม 4 สถานะที่เลือก", matchedTotal],
];
summarySheet.getRange(`A${4 + summaryRows.length}:B${4 + summaryRows.length}`).format = {
  fill: "#CCFBF1",
  font: { bold: true },
};

summarySheet.getRange("D3:E7").values = [
  ["Metric", "Value"],
  ["Rows with status", totalWithStatus],
  ["Blank status rows", blankStatus],
  ["Other statuses", otherRows.reduce((sum, row) => sum + row[1], 0)],
  ["Source sheet", sourceSheet.name],
];
summarySheet.getRange("D3:E3").format = {
  fill: "#134E4A",
  font: { bold: true, color: "#FFFFFF" },
};

if (otherRows.length > 0) {
  const otherStartRow = 11;
  summarySheet.getRange(`A${otherStartRow}:B${otherStartRow}`).values = [["Other Order Substatus", "Order Count"]];
  summarySheet.getRange(`A${otherStartRow}:B${otherStartRow}`).format = {
    fill: "#475569",
    font: { bold: true, color: "#FFFFFF" },
  };
  summarySheet.getRangeByIndexes(otherStartRow, 0, otherRows.length, 2).values = otherRows;
}

summarySheet.getRange("B:B").format.numberFormat = "#,##0";
summarySheet.getRange("E:E").format.numberFormat = "#,##0";
summarySheet.getRange("A:E").format.autofitColumns();
summarySheet.freezePanes.freezeRows(3);

const detailSheet = workbook.worksheets.add("Status Counts");
detailSheet.getRange("A1:B1").values = [["Order Substatus", "Order Count"]];
detailSheet.getRange("A1:B1").format = {
  fill: "#134E4A",
  font: { bold: true, color: "#FFFFFF" },
};
const allRows = [...counts.entries()]
  .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "th"))
  .map(([status, count]) => [status, count]);
if (allRows.length > 0) {
  detailSheet.getRangeByIndexes(1, 0, allRows.length, 2).values = allRows;
}
detailSheet.getRange("B:B").format.numberFormat = "#,##0";
detailSheet.getRange("A:B").format.autofitColumns();
detailSheet.freezePanes.freezeRows(1);

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);

console.log(JSON.stringify({
  inputPath,
  outputPath,
  sourceSheet: sourceSheet.name,
  headerRow: header.rowIndex + 1,
  headerColumn: header.colIndex + 1,
  targetCounts: Object.fromEntries(summaryRows),
  totalWithStatus,
  blankStatus,
  otherStatuses: Object.fromEntries(otherRows),
}, null, 2));
