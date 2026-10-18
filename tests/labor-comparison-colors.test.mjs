import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildLaborReportModel } from "../src/features/production-line/report-center/laborReportDefinitions.js";

test("employee average comparison adds a signed percentage without changing its source metric", () => {
  const values = [57.06,-13.06,0,-0.001,0.001,null,undefined,"invalid"];
  const model = buildLaborReportModel("wages-employee", { rows: values.map((vsTypeAveragePct,id) => ({id,vsTypeAveragePct})) });
  assert.deepEqual(model.rows.map(row => row.comparison), ["+57.06%","-13.06%","0.00%","0.00%","0.00%","-","-","-"]);
  assert.equal(model.rows[0].vsTypeAveragePct,57.06);
  assert.equal(model.definition.columns.find(col => col.key === "comparison").signedComparison,true);
  assert.equal(model.totalRow.comparison,"-");
  const table = fs.readFileSync(new URL("../src/components/reporting/ReportSystem.js",import.meta.url),"utf8");
  assert.match(table,/data-comparison=\{column.signedComparison/);
  const css = fs.readFileSync(new URL("../src/components/reporting/ReportSystem.module.css",import.meta.url),"utf8");
  assert.match(css,/data-comparison="positive".*color:#008a70!important/);
  assert.match(css,/data-comparison="negative".*color:#e00035!important/);
});
