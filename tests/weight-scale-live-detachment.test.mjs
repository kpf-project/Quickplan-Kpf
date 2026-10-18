import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

test("live workbench does not import legacy transaction services or loaders", () => {
  for (const path of [
    "src/features/production-line/components/WeightScaleLivePageClient.js",
    "src/app/production-line/weight-scale-live/page.js",
    "src/lib/scale/live-products.js",
    ...["receipts", "operations", "issues"].map(name => `src/app/api/scale/live/${name}/route.js`),
  ]) {
    const source = readFileSync(path, "utf8");
    assert.doesNotMatch(source, /from "@\/features\/production-line\/services\/scaleClient"|from "@\/lib\/scale\/(receipts|lots|catalog)"|from "@\/lib\/production-stock-(issues|returns)"|production_weight_scale_products/, path);
  }
});

test("every live transaction method rejects before reading a body or calling a stock service", async () => {
  for (const name of ["receipts", "operations", "issues"]) {
    const source = readFileSync(`src/app/api/scale/live/${name}/route.js`, "utf8")
      .replace(/^import .*;$/gm, "").replace(/export /g, "");
    const permissions = [];
    const context = vm.createContext({
      Response,
      process: { env: {} },
      requireWeightScaleLivePermission: async (_request, options) => permissions.push(options.manage),
      jsonError: error => Response.json({ error: error.message }, { status: 403 }),
    });
    vm.runInContext(source, context);
    for (const method of ["GET", "POST"]) {
      const response = await context[method]({ json() { throw new Error("must not consume transaction"); } });
      assert.equal(response.status, 503);
      assert.equal((await response.json()).code, "LIVE_WORKFLOW_NOT_CONFIGURED");
    }
    assert.deepEqual(permissions, [false, true]);
    context.requireWeightScaleLivePermission = async () => { throw new Error("Forbidden"); };
    assert.equal((await context.POST({})).status, 403);
  }
});

test("detached endpoints fail closed without a database transaction", () => {
  for (const name of ["receipts", "operations", "issues"]) {
    const source = readFileSync(`src/app/api/scale/live/${name}/route.js`, "utf8");
    assert.match(source, /requireWeightScaleLivePermission/);
    assert.match(source, /status: 503/);
    assert.doesNotMatch(source, /getSupabaseAdmin|\.from\(|\.rpc\(/);
  }
});

test("live UI and access do not retain legacy transaction or printer coupling", () => {
  for (const name of ["WeightScaleLiveReturnSection", "WeightScaleLiveVoidSection", "WeightScaleLiveIssueSection", "WeightScaleLivePageClient"]) {
    const source = readFileSync(`src/features/production-line/components/${name}.js`, "utf8");
    assert.doesNotMatch(source, /BISCUIT_PACKING|PACKING_400|sourceReceiptId|sourceIssueItemId|source_receipt|assertReceiptCanReprint|localPrintAgentClient|weightScaleReceiptLabel|createScaleLot|saveScaleProductConfig|setScaleCurrentLot/);
  }
  const access = readFileSync("src/lib/scale/live-access.js", "utf8");
  assert.doesNotMatch(access, /assertWeightScaleLiveReceiptAccess|production_weight_scale_products/);
  const client = readFileSync("src/features/production-line/services/weightScaleLiveClient.js", "utf8");
  assert.doesNotMatch(client, /\/config\/printer|\/print\/weight-scale-label|localStorage/);
  assert.match(client, /export const saveScaleAgentSerialConfig = unavailableLiveSetup/);
});
