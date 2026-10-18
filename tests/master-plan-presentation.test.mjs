import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("master plan separates section controls from paper and uses underline department tabs", () => {
  const source = readFileSync("src/features/production-planning/components/ProductionScheduleClient.js", "utf8");
  assert.match(source, /styles\.departmentTab/);
  assert.match(source, /aria-pressed=\{isActiveDept\}/);
  assert.ok(source.indexOf("{/* Section navigation outside the document */}") < source.indexOf("{/* Document card */}"));
  assert.match(source, /styles\.paper/);
  assert.match(source, /styles\.tableViewport/);
  assert.match(source, /embedded \? "py-3" : "py-6"/);
  const paperCss = readFileSync("src/features/production-planning/components/ProductionSchedulePresentation.module.css", "utf8");
  assert.match(paperCss, /\.tableViewport\s*\{[^}]*margin: 16px;[^}]*scrollbar-gutter: stable/);
  assert.match(paperCss, /\.paper\s*\{\s*background: white;/);
  const designer = readFileSync("src/features/production-planning/components/ScheduleTemplateDesigner.js", "utf8");
  for (const name of ["canvas", "paper", "tableViewport"]) assert.ok(designer.includes(`paperStyles.${name}`));
  assert.match(source, /styles\.canvas/);
  assert.doesNotMatch(source, /embedded \? "overflow-x-auto px-4 py-4"/);
  const previewCss = readFileSync("src/features/production-planning/components/RequisitionPreviewPresentation.module.css", "utf8");
  assert.match(previewCss, /\.referenceContent:has\(> \.referenceSchedule\)\s*\{ padding: 0;/);
  assert.match(previewCss, /\.content > \.referencePaper:has\(\.referenceSchedule\)[^}]*max-width: 1760px/);
  const css = readFileSync("src/features/production-planning/components/ScheduleTablePresentation.module.css", "utf8");
  assert.match(css, /appearance:\s*none/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /text-decoration:\s*underline/);
  assert.doesNotMatch(css, /width:\s*\d+px/);
});
