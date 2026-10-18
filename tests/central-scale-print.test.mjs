import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

function client(machine, changes = {}) {
  const stored = new Map();
  const calls = [];
  const receipt = { request_id: `request-${machine}`, point_id: `point-${machine}`, department_id: `dept-${machine}`,
    barcode: "11102680010001", lot_no: "1110268001-1", product_code: "PRODUCT", net_kg: "18.520", ...changes };
  const context = vm.createContext({ AbortSignal,
    window: { localStorage: { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value) } },
    fetchCentralInboundPrintReceipt: async ({ requestId }) => { calls.push({ recover: requestId }); return receipt; },
    createWeightScaleLabelBitmapPayload: (value, options) => ({ ...value, testNative: options?.useNativeBarcode }),
    fetch: async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ data: { printers: [{ name: `Printer-${machine}` }] } }) }; },
  });
  vm.runInContext(readFileSync("src/features/production-line/services/centralScalePrintClient.js", "utf8")
    .replace(/^import .*;\r?\n/gm, "").replaceAll("export ", "") + "\nthis.api = { saveCentralPrinterSelection, printCentralReceipt };", context);
  return { calls, stored, receipt, ...context.api };
}

test("20 computers print only to their own local printer without writing shared configuration or stock", async () => {
  await Promise.all(Array.from({ length: 20 }, async (_, machine) => {
    const c = client(machine);
    await c.saveCentralPrinterSelection({ printerName: `Printer-${machine}` });
    await c.printCentralReceipt({ requestId: c.receipt.request_id, pointId: c.receipt.point_id, departmentId: c.receipt.department_id });
    const print = c.calls.find(call => call.url?.endsWith("/central-scale/print"));
    assert.equal(print.url, "http://127.0.0.1:41951/central-scale/print");
    assert.equal(JSON.parse(print.options.body).printerName, `Printer-${machine}`);
    assert.equal(JSON.parse(print.options.body).weightDecimals, 3);
    assert.equal(JSON.parse(print.options.body).testNative, true);
    assert.equal(JSON.parse(print.options.body).timeZone, "Asia/Bangkok");
    assert.equal(c.calls.filter(call => call.options?.method === "POST").length, 1);
    assert.equal(c.calls.filter(call => call.recover).length, 1);
  }));
});

test("history is filtered by actual department and point, not just matching product code", () => {
  const source = readFileSync("src/features/production-line/components/WeightScaleLivePageClient.js", "utf8");
  const start = source.indexOf("function filterStationReceipts(");
  const end = source.indexOf("\n}", start) + 2;
  const context = vm.createContext({});
  vm.runInContext(source.slice(start, end) + "\nthis.filter = filterStationReceipts;", context);
  const receipts = [
    { id: "own", workstationId: "A", departmentId: "BISCUIT", productCode: "SAME" },
    { id: "other-dept", workstationId: "A", departmentId: "OTHER", productCode: "SAME" },
    { id: "other-pc", workstationId: "B", departmentId: "BISCUIT", productCode: "SAME" },
  ];
  assert.deepEqual(context.filter(receipts, "A", "BISCUIT").map(row => row.id), ["own"]);
  assert.equal(context.filter(receipts, "A", null).length, 0);
});

test("wrong point, department, request or invalid receipt never reaches printer", async () => {
  for (const changes of [{ point_id: "other" }, { department_id: "other" }, { request_id: "other" }, { net_kg: "NaN" }, { barcode: "invalid" }]) {
    const c = client(1, changes);
    await assert.rejects(c.printCentralReceipt({ requestId: "request-1", pointId: "point-1", departmentId: "dept-1" }));
    assert.equal(c.calls.filter(call => call.url).length, 0);
  }
});

test("central agent handler uses explicit job printer and never saves legacy configuration", async () => {
  const source = readFileSync("local-print-agent/server.js", "utf8");
  const handler = source.slice(source.indexOf("async function handlePrintCentralScaleLabel"), source.indexOf("function createServer()"));
  const jobs = [];
  const context = vm.createContext({ collectJsonBody: async request => request,
    listInstalledPrinters: async () => [{ name: "A" }, { name: "B" }],
    buildTsplLabel: body => body.barcodeValue, sendRawToPrinter: async job => jobs.push(job), sendJson: () => {} });
  vm.runInContext(handler + "\nthis.handle = handlePrintCentralScaleLabel;", context);
  const config = { printerName: "LEGACY", pieceRatePrinterName: "OTHER" };
  const nativeBarcode = { type: "128", x: 160, y: 286, height: 64, narrow: 2, wide: 4 };
  await Promise.all(["A", "B"].map(printerName => context.handle({ printerName, barcodeValue: "11102680010001", labelBitmap: {}, nativeBarcode }, {}, config)));
  assert.deepEqual(jobs.map(job => job.printerName).sort(), ["A", "B"]);
  assert.deepEqual(config, { printerName: "LEGACY", pieceRatePrinterName: "OTHER" });
  assert.doesNotMatch(handler, /writeJsonFile|handleSave|config\.printerName\s*=/);
  for (const invalid of [undefined, { ...nativeBarcode, type: "QR" }, { ...nativeBarcode, narrow: 0 }]) {
    await context.handle({ printerName: "A", barcodeValue: "11102680010001", labelBitmap: {}, nativeBarcode: invalid }, {}, config);
  }
  assert.equal(jobs.length, 2);
});

test("native renderer never creates or scales a barcode bitmap; legacy default stays unchanged", () => {
  let barcodeCalls = 0;
  let drawImageCalls = 0;
  const texts = [];
  const context = vm.createContext({
    JsBarcode: () => { barcodeCalls++; },
    window: { btoa: text => Buffer.from(text, "binary").toString("base64") },
    document: { createElement: () => {
      const canvas = { width: 0, height: 0 };
      canvas.getContext = () => ({ fillRect() {}, strokeRect() {}, fillText(text) { texts.push(text); },
        measureText: () => ({ width: 10 }), drawImage: () => { drawImageCalls++; },
        getImageData: () => ({ width: canvas.width, height: canvas.height, data: new Uint8ClampedArray(canvas.width * canvas.height * 4) }) });
      return canvas;
    } },
  });
  vm.runInContext(readFileSync("src/features/production-line/services/weightScaleLabelBitmap.js", "utf8")
    .replace(/^import .*;\r?\n/gm, "").replaceAll("export ", "") + "\nthis.render = createWeightScaleLabelBitmapPayload;", context);
  const label = { barcodeValue: "11102680010001", netWeightKg: "18.520", tareWeightKg: "0.500", weightDecimals: 3,
    weighedAt: "2026-10-11T18:30:00Z", timeZone: "Asia/Bangkok" };
  const native = context.render(label, { useNativeBarcode: true });
  assert.equal(barcodeCalls, 0);
  assert.equal(drawImageCalls, 0);
  assert.equal(native.nativeBarcode.type, "128");
  assert.equal(native.labelBitmap.widthDots, 640);
  assert.equal(native.labelBitmap.heightDots, 400);
  assert.equal(native.printer.labelWidthMm, 80);
  assert.equal(native.printer.labelHeightMm, 50);
  assert.ok(texts.includes("12/10/69 01:30:00"));
  assert.ok(texts.some(text => text.includes("18.520")));
  const legacy = context.render(label);
  assert.equal(barcodeCalls, 1);
  assert.equal(drawImageCalls, 1);
  assert.equal(legacy.nativeBarcode, undefined);
});

test("print agent emits native BARCODE after the text bitmap without rasterizing the bars", () => {
  const source = readFileSync("local-print-agent/server.js", "utf8");
  const start = source.indexOf("function buildTsplBitmapLabel(");
  const end = source.indexOf("function sendRawToPrinter(", start);
  const context = vm.createContext({ Buffer, sanitizeTsplText: (value, fallback) => String(value || fallback) });
  vm.runInContext(source.slice(start, end) + "\nthis.build = buildTsplBitmapLabel;", context);
  const result = context.build({ barcodeValue: "11102680010001",
    labelBitmap: { widthDots: 8, heightDots: 1, dataBase64: "/w==" },
    nativeBarcode: { type: "128", x: 160, y: 286, height: 64, narrow: 2, wide: 4 },
  }, { paper: { widthMm: 80, heightMm: 50 } });
  const raw = result.toString("latin1");
  assert.match(raw, /SIZE 80 mm,50 mm/);
  assert.match(raw, /BARCODE 160,286,"128",64,0,0,2,4,"11102680010001"/);
  assert.ok(raw.indexOf("BARCODE") > raw.indexOf("BITMAP"));
  assert.equal(raw.match(/BARCODE/g).length, 1);
});
