import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

test("report-center documents and embedded legacy reports share Noto Sans Thai Looped, including code and numeric cells", () => {
  const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
  assert.match(read("src/app/layout.js"), /Noto_Sans_Thai_Looped/);
  assert.match(read("src/features/production-line/components/ReportCenterClient.js"), /className=\{styles.center\} data-report-center/);
  assert.match(read("src/components/ProductionLineShell.js"), /production-report-embedded/);
  assert.match(read("src/components/reporting/ReportSystem.js"), /data-report-document/);
  const css = read("src/app/globals.css");
  assert.match(css, /\[data-report-center\] \*,[\s\S]*\.production-report-embedded \*,[\s\S]*\[data-report-document\] \*\s*\{\s*font-family: var\(--font-noto-sans-looped\), "Noto Sans Thai Looped", sans-serif !important;/);
});
