import test from "node:test";
import assert from "node:assert/strict";
import { formatReportDateText, formatReportGroupLabel } from "../src/lib/print/reportDate.js";

test("report dates share a full Buddhist year and DD-MM-YYYY order", () => {
  assert.equal(formatReportDateText("2026-10-13"), "13-10-2569");
  assert.equal(formatReportDateText("13/10/2569 – 15/10/2569"), "13-10-2569 – 15-10-2569");
  assert.equal(formatReportDateText("15/10/69 19:44"), "15-10-2569 19:44");
  assert.equal(formatReportDateText("13-10-2569"), "13-10-2569");
});

test("date headings leave LOT identifiers, non-date labels and invalid dates alone", () => {
  assert.equal(formatReportGroupLabel("วันที่ 2026-10-13 · WKB-0002 · LOT 2026-10-14"), "วันที่ 13-10-2569 · WKB-0002 · LOT 2026-10-14");
  assert.equal(formatReportGroupLabel("รวม WKB-0002 · LOT 2026-10-14"), "รวม WKB-0002 · LOT 2026-10-14");
  assert.equal(formatReportDateText("2026-02-30"), "2026-02-30");
  assert.equal(formatReportDateText("1310260005-1"), "1310260005-1");
  assert.equal(formatReportDateText(null), null);
});
