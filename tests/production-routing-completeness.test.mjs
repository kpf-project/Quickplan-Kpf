import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..");

function readSource(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

const completenessRouteSource = readSource(
  "src/app/api/production-routing-components/completeness/route.js"
);
const routingSettingsSource = readSource(
  "src/features/production-line-settings/components/RoutingSettingsTab.js"
);

test("Routing completeness API paginates queries to avoid PostgREST 1000-row limit", () => {
  // Check BOM headers pagination
  assert.match(
    completenessRouteSource,
    /\.from\("production_boms"\)[\s\S]*?\.range\(bomFrom,\s*bomFrom\s*\+\s*999\)/
  );

  // Check versions pagination
  assert.match(
    completenessRouteSource,
    /\.from\("production_bom_versions"\)[\s\S]*?\.range\(versFrom,\s*versFrom\s*\+\s*999\)/
  );

  // Check BOM items pagination
  assert.match(
    completenessRouteSource,
    /\.from\("production_bom_items"\)[\s\S]*?\.range\(itemFrom,\s*itemFrom\s*\+\s*999\)/
  );

  // Check routing components pagination
  assert.match(
    completenessRouteSource,
    /\.from\("production_routing_components"\)[\s\S]*?\.range\(rcFrom,\s*rcFrom\s*\+\s*999\)/
  );
});

test("RoutingSettingsTab normalizes SKU code and handles completenessLoading", () => {
  assert.match(
    routingSettingsSource,
    /routingCompleteness\[normSku\]\s*\|\|\s*routingCompleteness\[item\.skuCode\]/
  );
  assert.match(
    routingSettingsSource,
    /completenessLoading[\s\S]*?กำลังโหลด\.\.\./
  );
  assert.match(
    routingSettingsSource,
    /setCompletenessLoading\(true\)[\s\S]*?fetchRoutingCompleteness\(departmentId\)[\s\S]*?setCompletenessLoading\(false\)/
  );
});
