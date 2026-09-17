const fs = require("node:fs");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

function loadPrintAgentExports(extraExports = ["buildTsplLabel"]) {
  const serverPath = path.resolve(__dirname, "../local-print-agent/server.js");
  const source = fs.readFileSync(serverPath, "utf8");
  const startupMarker = "const config = loadConfig();";
  const startupIndex = source.lastIndexOf(startupMarker);

  assert.notEqual(startupIndex, -1, "Unable to isolate print-agent startup code.");

  const testableSource =
    source.slice(0, startupIndex)
    + `\nmodule.exports = { ${extraExports.join(", ")} };\n`;
  const testModule = new Module(serverPath, module);
  testModule.filename = serverPath;
  testModule.paths = Module._nodeModulePaths(path.dirname(serverPath));
  testModule._compile(testableSource, serverPath);

  return testModule.exports;
}

function loadBuildTsplLabel() {
  return loadPrintAgentExports(["buildTsplLabel"]).buildTsplLabel;
}

test("TSPL label terminates the PRINT command with CRLF", () => {
  const buildTsplLabel = loadBuildTsplLabel();
  const label = buildTsplLabel(
    {
      barcodeValue: "KPF-TEST-001",
      productCode: "WKB-0030",
      productName: "TEST PRODUCT",
      lotNo: "LOT-001",
      netWeightKg: 45,
      unitLabel: "kg",
      weighedAt: "2026-06-25T09:16:00+07:00",
    },
    {
      paper: {
        widthMm: 80,
        heightMm: 50,
      },
    }
  );

  assert.ok(
    label.endsWith("PRINT 1,1\r\n"),
    "TSC printers need a command terminator after PRINT 1,1."
  );
});

test("TSPL bitmap label embeds raw one-bit image bytes", () => {
  const buildTsplLabel = loadBuildTsplLabel();
  const bitmapBytes = Buffer.from([0xff, 0x00, 0x81, 0x7e]);
  const label = buildTsplLabel(
    {
      barcodeValue: "25062600300001",
      labelBitmap: {
        widthDots: 16,
        heightDots: 2,
        dataBase64: bitmapBytes.toString("base64"),
      },
    },
    {
      paper: {
        widthMm: 80,
        heightMm: 50,
      },
    }
  );

  assert.ok(Buffer.isBuffer(label));
  assert.match(label.toString("latin1"), /BITMAP 0,0,2,2,0,/);
  assert.ok(label.includes(bitmapBytes));
  assert.ok(label.toString("latin1").endsWith("\r\nPRINT 1,1\r\n"));
});

test("piece-rate bitmap label prints CODE128 natively after the bitmap", () => {
  const buildTsplLabel = loadBuildTsplLabel();
  const bitmapBytes = Buffer.alloc(80 * 400, 0xff);
  const label = buildTsplLabel(
    {
      barcodeValue: "PC69080000001",
      labelBitmap: {
        widthDots: 640,
        heightDots: 400,
        dataBase64: bitmapBytes.toString("base64"),
      },
      nativeBarcode: {
        type: "128",
        x: 100,
        y: 294,
        height: 80,
        narrow: 2,
        wide: 4,
      },
    },
    {
      paper: {
        widthMm: 80,
        heightMm: 50,
      },
    }
  );

  const printable = label.toString("latin1");
  assert.match(
    printable,
    /BARCODE 100,294,"128",80,0,0,2,4,"PC69080000001"\r\nPRINT 1,1\r\n$/
  );
});

test("raw printer process uses a temp payload file instead of long command arguments", () => {
  const { buildRawPrintProcessArgs } = loadPrintAgentExports([
    "buildRawPrintProcessArgs",
  ]);
  const rawContent = Buffer.alloc(32_000, 0xff);
  const { args, cleanupPaths } = buildRawPrintProcessArgs({
    printerName: "TSC TE210",
    documentName: "KPF Weight Scale Label",
    rawContent,
  });

  try {
    assert.ok(args.includes("-PayloadFile"));
    assert.ok(!args.includes("-PayloadBase64"));
    const payloadFileIndex = args.indexOf("-PayloadFile") + 1;
    const payloadFile = args[payloadFileIndex];
    assert.equal(fs.readFileSync(payloadFile).length, rawContent.length);
    assert.ok(args.join(" ").length < 2000);
  } finally {
    for (const filePath of cleanupPaths) {
      fs.rmSync(filePath, { force: true });
    }
  }
});

test("TSPL label matches the large 80x50 production layout", () => {
  const buildTsplLabel = loadBuildTsplLabel();
  const label = buildTsplLabel(
    {
      barcodeValue: "25062600300001",
      productCode: "WKB-0030",
      productName: "\u0e41\u0e04\u0e23\u0e01\u0e40\u0e01\u0e2d\u0e23\u0e4c\u0e07\u0e32\u0e2b\u0e2d\u0e21 L 1.1 \u0e01\u0e01",
      lotNo: "22060030-1",
      tareWeightKg: 1.25,
      netWeightKg: 45,
      unitLabel: "\u0e01\u0e01.",
      weighedAt: "2026-06-26T17:00:00+07:00",
    },
    {
      paper: {
        widthMm: 80,
        heightMm: 50,
      },
    }
  );

  assert.match(label, /^CODEPAGE UTF-8\r\n/);
  assert.match(label, /SIZE 80 mm,50 mm/);
  assert.match(label, /"26\/06\/69 17:00:00"/);
  assert.match(label, /"Code : WKB-0030"/);
  assert.match(label, /"Product : /);
  assert.match(label, /"Lot : 22060030-1"/);
  assert.match(label, /"Tare : 1.25"/);
  assert.match(label, /"NET 45.00 \u0e01\u0e01\."/);
  assert.match(label, /BARCODE 178,262,"128",64,1,0,2,4,"25062600300001"/);
  assert.match(label, /TEXT 220,334,"0",0,2,2,"25062600300001"/);
});
