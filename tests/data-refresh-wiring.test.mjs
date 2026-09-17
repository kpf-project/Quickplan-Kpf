import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");

function readSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const bomEditorSource = readSource(
  "src/features/production-line/components/BomEditorPageClient.js"
);
const materialClaimsSource = readSource(
  "src/features/production-planning/components/MaterialClaimsWorkspaceModernClient.js"
);
const performanceDashboardSource = readSource(
  "src/features/performance/components/PerformanceDashboardPageClient.js"
);
const routingSettingsSource = readSource(
  "src/features/production-line-settings/components/RoutingSettingsTab.js"
);

test("BOM uses explicit refresh instead of reloading full details every five seconds", () => {
  assert.doesNotMatch(bomEditorSource, /setInterval\(tick,\s*5000\)/);
  assert.match(bomEditorSource, /const handleRefreshBom = useCallback/);
  assert.match(bomEditorSource, /รีเฟรชข้อมูล/);
});

test("material claims disables fixed polling and offers throttled focus plus manual refresh", () => {
  assert.doesNotMatch(materialClaimsSource, /refreshInterval:\s*15000/);
  assert.match(materialClaimsSource, /refreshInterval:\s*0/);
  assert.match(materialClaimsSource, /focusThrottleInterval:\s*60000/);
  assert.match(materialClaimsSource, /const handleManualRefresh = useCallback/);
  assert.match(materialClaimsSource, /lastRefreshedAt/);
});

test("performance dashboard loads on demand and displays its last successful refresh", () => {
  assert.doesNotMatch(performanceDashboardSource, /setInterval\(loadData,\s*15000\)/);
  assert.match(performanceDashboardSource, /lastRefreshedAt/);
  assert.match(performanceDashboardSource, /อัปเดตล่าสุด/);
});

test("Routing save shows a dismissible success toast for three seconds", () => {
  assert.match(routingSettingsSource, /const \[successToast, setSuccessToast\] = useState\(null\)/);
  assert.match(routingSettingsSource, /window\.setTimeout\([\s\S]*3000/);
  assert.match(routingSettingsSource, /setSuccessToast\(\{[\s\S]*บันทึก Routing สำเร็จ/);
  assert.match(routingSettingsSource, /fixed right-4 top-20 z-\[230\]/);
  assert.match(routingSettingsSource, /role="status"/);
  assert.match(routingSettingsSource, /onClick=\{dismissSuccessToast\}/);
});
