import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");
const helperPath = path.join(
  repoRoot,
  "src/features/production-line/services/stockReturnWeight.js"
);
const returnServicePath = path.join(repoRoot, "src/lib/production-stock-returns.js");
const returnPagePath = path.join(
  repoRoot,
  "src/features/production-line/components/WeightScaleReturnPageClient.js"
);
const returnRoutePath = path.join(
  repoRoot,
  "src/app/api/production-stock/returns/route.js"
);

test("stock return weights subtract source tare from gross weight", async () => {
  assert.ok(fs.existsSync(helperPath), "stock-return weight helper should exist");
  const { calculateStockReturnWeights } = await import(pathToFileURL(helperPath));

  assert.deepEqual(
    calculateStockReturnWeights({ grossWeightKg: 14.88, tareWeightKg: 2.8 }),
    {
      grossWeightKg: 14.88,
      tareWeightKg: 2.8,
      netWeightKg: 12.08,
      isValid: true,
      error: "",
    }
  );
});

test("stock return weights reject tare that is negative or not below gross", async () => {
  assert.ok(fs.existsSync(helperPath), "stock-return weight helper should exist");
  const { calculateStockReturnWeights } = await import(pathToFileURL(helperPath));

  assert.equal(
    calculateStockReturnWeights({ grossWeightKg: 10, tareWeightKg: -1 }).isValid,
    false
  );
  assert.equal(
    calculateStockReturnWeights({ grossWeightKg: 10, tareWeightKg: 10 }).isValid,
    false
  );
});

test("issued barcode lookup returns tare from its original inbound receipt", () => {
  const source = fs.readFileSync(returnServicePath, "utf8");

  assert.match(source, /from\("production_weight_receipts"\)/);
  assert.match(source, /select\("tare_weight_kg"\)/);
  assert.match(source, /eq\("id",\s*data\.source_receipt_id\)/);
  assert.match(source, /sourceTareWeightKg:/);
});

test("return page pre-fills editable source tare and calculates net from gross", () => {
  const source = fs.readFileSync(returnPagePath, "utf8");

  assert.match(source, /calculateStockReturnWeights/);
  assert.match(source, /const \[tareWeightInput, setTareWeightInput\] = useState\("0"\)/);
  assert.match(source, /setTareWeightInput\(String\(item\.sourceTareWeightKg \?\? 0\)\)/);
  assert.match(source, /value=\{tareWeightInput\}/);
  assert.match(
    source,
    /onChange=\{\(event\) => \{[\s\S]{0,300}setTareWeightInput\(event\.target\.value\)/
  );
  assert.match(source, /น้ำหนักสุทธิ/);
});

test("return request submits gross tare and tare source while server recomputes net", () => {
  const pageSource = fs.readFileSync(returnPagePath, "utf8");
  const routeSource = fs.readFileSync(returnRoutePath, "utf8");
  const serviceSource = fs.readFileSync(returnServicePath, "utf8");

  assert.match(pageSource, /grossWeightKg:\s*weights\.grossWeightKg/);
  assert.match(pageSource, /tareWeightKg:\s*weights\.tareWeightKg/);
  assert.match(pageSource, /tareSource:/);
  assert.match(routeSource, /grossWeightKg:\s*body\?\.grossWeightKg/);
  assert.match(routeSource, /tareWeightKg:\s*body\?\.tareWeightKg/);
  assert.match(routeSource, /tareSource:\s*body\?\.tareSource/);
  assert.match(serviceSource, /calculateStockReturnWeights/);
  assert.match(serviceSource, /p_gross_weight_kg:\s*weights\.grossWeightKg/);
  assert.match(serviceSource, /p_tare_weight_kg:\s*weights\.tareWeightKg/);
  assert.match(serviceSource, /p_tare_source:\s*tareSource/);
});

test("stock return RPC persists gross tare and net while movement uses net", () => {
  const migrationName = fs.readdirSync(path.join(repoRoot, "supabase/migrations"))
    .find((name) => name.endsWith("_add_stock_return_tare.sql"));
  assert.ok(migrationName, "stock return tare migration should exist");
  const source = fs.readFileSync(
    path.join(repoRoot, "supabase/migrations", migrationName),
    "utf8"
  );

  assert.match(source, /p_gross_weight_kg numeric/);
  assert.match(source, /p_tare_weight_kg numeric/);
  assert.match(source, /p_tare_source text/);
  assert.match(source, /v_net_weight_kg[^;]*v_gross_weight_kg\s*-\s*v_tare_weight_kg/);
  assert.match(
    source,
    /values \([\s\S]*v_issue\.product_config_id,[\s\S]*v_gross_weight_kg,[\s\S]*v_tare_weight_kg,[\s\S]*v_net_weight_kg/
  );
  assert.match(source, /'tareSource', v_tare_source/);
  assert.match(source, /'grossWeightKg', v_return_receipt\.gross_weight_kg/);
  assert.match(source, /'tareWeightKg', v_return_receipt\.tare_weight_kg/);
  assert.match(source, /weight_in_kg[\s\S]*v_net_weight_kg/);
  assert.doesNotMatch(
    source,
    /drop function[^;]*create_production_stock_return/i,
    "the legacy net-only RPC must remain available until the new app is deployed"
  );
  assert.match(
    source,
    /revoke execute on function public\.create_production_stock_return\(\s*text, numeric, numeric, text, uuid, text\s*\) from public, anon, authenticated/i
  );
  assert.match(
    source,
    /grant execute on function public\.create_production_stock_return\(\s*text, numeric, numeric, text, uuid, text\s*\) to service_role/i
  );
});
