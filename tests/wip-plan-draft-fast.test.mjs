import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("loadMainPlanRowsForMasterPlan loads product metadata from products_cache instead of slow gateway /api/products", () => {
  const wipPlanningSource = fs.readFileSync(
    path.join(repoRoot, "src/lib/wipPlanning.js"),
    "utf8"
  );

  // Must use loadProductsMetaBySkus directly with supabaseAdmin in loadMainPlanRowsForMasterPlan
  assert.match(
    wipPlanningSource,
    /const productMetaBySku = await loadProductsMetaBySkus\(supabaseAdmin, rows\.map\(\(row\) => row\?\.sku_code\)\);/
  );

  // Must not call loadGatewayProductMetaBySkus in loadMainPlanRowsForMasterPlan
  assert.doesNotMatch(
    wipPlanningSource,
    /loadMainPlanRowsForMasterPlan[\s\S]*loadGatewayProductMetaBySkus/
  );
});

test("loadGatewayProductMetaBySkus includes in-memory cache to prevent redundant gateway calls", () => {
  const wipPlanningSource = fs.readFileSync(
    path.join(repoRoot, "src/lib/wipPlanning.js"),
    "utf8"
  );

  assert.match(wipPlanningSource, /const gatewayProductMetaCache = new Map\(\);/);
  assert.match(wipPlanningSource, /missingSkus\.length/);
});

test("DynamicProductionPlanning does not block SSR on self-referencing HTTP loopback requests", () => {
  const dynamicPlanningSource = fs.readFileSync(
    path.join(repoRoot, "src/components/DynamicProductionPlanning.js"),
    "utf8"
  );

  assert.match(dynamicPlanningSource, /const shouldPreloadPlanData = false;/);
});
