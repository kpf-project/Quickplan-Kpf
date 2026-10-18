import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import * as scaleClient from "../src/features/production-line/services/scaleClient.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const componentPath = path.join(
  repoRoot,
  "src/features/production-line/components/WeightScaleCancelPageClient.js"
);

function readSource() {
  return fs.readFileSync(componentPath, "utf8");
}

test("weight cancel history date changes reload cancelable rows immediately", () => {
  const source = readSource();

  assert.match(
    source,
    /const handlePickerDateChange = useCallback\(/,
    "cancel picker should centralize date changes"
  );
  assert.match(
    source,
    /handlePickerDateChange[\s\S]*loadPickerRows\(nextFilters\)/,
    "changing date filters should reload the cancelable list without requiring another click"
  );
  assert.match(
    source,
    /onChange=\{\(event\) => handlePickerDateChange\("dateFrom", event\.target\.value\)\}/,
    "dateFrom input should use the auto-loading date handler"
  );
  assert.match(
    source,
    /onChange=\{\(event\) => handlePickerDateChange\("dateTo", event\.target\.value\)\}/,
    "dateTo input should use the auto-loading date handler"
  );
});

test("barcode cancellation bypasses picker filters and submits the exact barcode once", async () => {
  assert.equal(typeof scaleClient.cancelScaleReceiptByBarcodeRequest, "function");

  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push({ url, options });
    return new Response(JSON.stringify({
      data: {
        id: "receipt-1",
        barcode: "03102600680108",
        alreadyCancelled: false,
      },
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  try {
    const result = await scaleClient.cancelScaleReceiptByBarcodeRequest(
      " 03102600680108 ",
      { voidReason: "operator correction" }
    );

    assert.equal(result.barcode, "03102600680108");
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "/api/scale/receipts/cancel-by-barcode");
    assert.equal(requests[0].options.method, "POST");
    assert.deepEqual(JSON.parse(requests[0].options.body), {
      barcode: "03102600680108",
      voidReason: "operator correction",
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("weight cancel scanner uses the direct barcode command through the duplicate queue", () => {
  const source = readSource();
  const scanFlow = source.slice(
    source.indexOf("const resolveBarcodeForCancel"),
    source.indexOf("const stopCameraScanner")
  );

  assert.match(scanFlow, /scanQueueRef\.current\.enqueue/);
  assert.match(scanFlow, /cancelScaleReceiptByBarcodeRequest/);
  assert.doesNotMatch(scanFlow, /fetchCancelableScaleReceipts/);
});
