const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");
const { resolvePrinterForJob } = require("./printer-profile");

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 41951;
const DEFAULT_DOCUMENT_NAME = "KPF Weight Scale Label";
const CONFIG_PATH = path.join(__dirname, "config.json");
const EXAMPLE_CONFIG_PATH = path.join(__dirname, "config.example.json");
const POWERSHELL_SCRIPT_PATH = path.join(__dirname, "send-raw-to-printer.ps1");

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return null;
  }
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + "\n", "utf8");
}

function loadConfig() {
  const exampleConfig = readJsonFile(EXAMPLE_CONFIG_PATH) || {};
  const userConfig = readJsonFile(CONFIG_PATH) || {};

  return {
    host: process.env.KPF_PRINT_AGENT_HOST || userConfig.host || exampleConfig.host || DEFAULT_HOST,
    port: Number.parseInt(
      process.env.KPF_PRINT_AGENT_PORT || userConfig.port || exampleConfig.port || DEFAULT_PORT,
      10
    ),
    printerName:
      process.env.KPF_PRINTER_NAME
      || userConfig.printerName
      || exampleConfig.printerName
      || "",
    pieceRatePrinterName:
      process.env.KPF_PIECE_RATE_PRINTER_NAME
      || userConfig.pieceRatePrinterName
      || exampleConfig.pieceRatePrinterName
      || "",
    documentName:
      process.env.KPF_PRINT_DOCUMENT_NAME
      || userConfig.documentName
      || exampleConfig.documentName
      || DEFAULT_DOCUMENT_NAME,
    paper: {
      widthMm: Number.parseFloat(
        process.env.KPF_LABEL_WIDTH_MM
        || userConfig?.paper?.widthMm
        || exampleConfig?.paper?.widthMm
        || 80
      ),
      heightMm: Number.parseFloat(
        process.env.KPF_LABEL_HEIGHT_MM
        || userConfig?.paper?.heightMm
        || exampleConfig?.paper?.heightMm
        || 50
      ),
    },
  };
}

function saveConfigPatch(patch) {
  const currentConfig = readJsonFile(CONFIG_PATH) || {};
  const nextConfig = {
    ...currentConfig,
    ...patch,
    paper: {
      ...currentConfig.paper,
      ...patch.paper,
    },
  };
  writeJsonFile(CONFIG_PATH, nextConfig);
  return loadConfig();
}

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function runPowerShellJson(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "powershell.exe",
      [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        command,
      ],
      {
        windowsHide: true,
      }
    );

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `PowerShell exited with code ${code}.`));
        return;
      }

      try {
        resolve(stdout.trim() ? JSON.parse(stdout) : []);
      } catch {
        reject(new Error("Invalid printer list response from Windows."));
      }
    });
  });
}

async function listInstalledPrinters() {
  const command = [
    "$printers = Get-CimInstance Win32_Printer |",
    "Select-Object Name,Default,WorkOffline,PrinterStatus,PortName,DriverName |",
    "Sort-Object Name;",
    "$printers | ConvertTo-Json -Depth 3",
  ].join(" ");

  const payload = await runPowerShellJson(command);
  const printerRows = Array.isArray(payload) ? payload : payload ? [payload] : [];

  return printerRows.map((printer) => ({
    name: String(printer?.Name || "").trim(),
    isDefault: Boolean(printer?.Default),
    isOffline: Boolean(printer?.WorkOffline),
    printerStatus: printer?.PrinterStatus ?? null,
    portName: String(printer?.PortName || "").trim(),
    driverName: String(printer?.DriverName || "").trim(),
  })).filter((printer) => printer.name);
}

function sendJson(response, statusCode, payload) {
  setCorsHeaders(response);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function collectJsonBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    request.on("data", (chunk) => {
      chunks.push(chunk);
      const size = chunks.reduce((total, item) => total + item.length, 0);
      if (size > 1024 * 1024) {
        reject(new Error("Payload too large."));
      }
    });

    request.on("end", () => {
      try {
        const rawBody = Buffer.concat(chunks).toString("utf8");
        resolve(rawBody ? JSON.parse(rawBody) : {});
      } catch (error) {
        reject(new Error("Invalid JSON payload."));
      }
    });

    request.on("error", (error) => {
      reject(error);
    });
  });
}

function sanitizeTsplText(value, fallback = "-") {
  const normalized = String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/"/g, "'")
    .trim();

  if (!normalized) {
    return fallback;
  }

  return normalized;
}

function formatWeight(value, fractionDigits = 2) {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  if (!Number.isFinite(parsed)) {
    return "-";
  }

  return parsed.toFixed(fractionDigits);
}

function normalizeUnitLabel(value) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.toLowerCase() === "kg") {
    return "กก.";
  }

  return normalized;
}

function formatTimestamp(value) {
  const parsed = new Date(value || Date.now());
  if (Number.isNaN(parsed.getTime())) {
    return "-";
  }

  const yy = String(parsed.getFullYear() + 543).slice(-2);
  const mm = String(parsed.getMonth() + 1).padStart(2, "0");
  const dd = String(parsed.getDate()).padStart(2, "0");
  const hh = String(parsed.getHours()).padStart(2, "0");
  const mi = String(parsed.getMinutes()).padStart(2, "0");
  const ss = String(parsed.getSeconds()).padStart(2, "0");

  return `${dd}/${mm}/${yy} ${hh}:${mi}:${ss}`;
}

function buildTsplLabel(payload, config) {
  const barcodeValue = sanitizeTsplText(payload.barcodeValue, "");
  if (!barcodeValue) {
    throw new Error("barcodeValue is required.");
  }

  if (payload?.labelBitmap && typeof payload.labelBitmap === "object") {
    return buildTsplBitmapLabel(payload, config);
  }

  const productCode = sanitizeTsplText(payload.productCode);
  const productName = sanitizeTsplText(payload.productName);
  const lotNo = sanitizeTsplText(payload.lotNo);
  const weighedAt = sanitizeTsplText(formatTimestamp(payload.weighedAt));
  const unitLabel = sanitizeTsplText(normalizeUnitLabel(payload.unitLabel));
  const tareWeightLine = sanitizeTsplText(`Tare : ${formatWeight(payload.tareWeightKg, 2)}`);
  const netWeightLine = sanitizeTsplText(
    `NET ${formatWeight(payload.netWeightKg, 2)} ${unitLabel}`
  );
  const labelWidthMm = Number.isFinite(Number(payload?.printer?.labelWidthMm))
    ? Number(payload.printer.labelWidthMm)
    : config.paper.widthMm;
  const labelHeightMm = Number.isFinite(Number(payload?.printer?.labelHeightMm))
    ? Number(payload.printer.labelHeightMm)
    : config.paper.heightMm;

  return [
    "CODEPAGE UTF-8",
    "SIZE " + `${labelWidthMm} mm,${labelHeightMm} mm`,
    "GAP 2 mm,0 mm",
    "DIRECTION 1",
    "REFERENCE 0,0",
    "CLS",
    `TEXT 370,10,"0",0,2,2,"${weighedAt}"`,
    `TEXT 16,50,"0",0,2,2,"Code : ${productCode}"`,
    "BAR 16,94,116,4",
    `TEXT 16,106,"0",0,2,2,"Product : ${productName}"`,
    "BAR 16,150,176,4",
    `TEXT 16,162,"0",0,2,2,"Lot : ${lotNo}"`,
    "BAR 16,206,82,4",
    `TEXT 410,162,"0",0,2,2,"${tareWeightLine}"`,
    "BAR 410,206,104,4",
    `TEXT 92,204,"0",0,4,4,"${netWeightLine}"`,
    `BARCODE 178,262,"128",64,1,0,2,4,"${barcodeValue}"`,
    `TEXT 220,334,"0",0,2,2,"${barcodeValue}"`,
    "PRINT 1,1",
  ].join("\r\n") + "\r\n";
}

function buildTsplBitmapLabel(payload, config) {
  const bitmap = payload.labelBitmap;
  const widthDots = Number.parseInt(String(bitmap.widthDots || ""), 10);
  const heightDots = Number.parseInt(String(bitmap.heightDots || ""), 10);
  const dataBase64 = String(bitmap.dataBase64 || "").trim();

  if (!Number.isFinite(widthDots) || widthDots <= 0) {
    throw new Error("labelBitmap.widthDots is required.");
  }

  if (!Number.isFinite(heightDots) || heightDots <= 0) {
    throw new Error("labelBitmap.heightDots is required.");
  }

  if (!dataBase64) {
    throw new Error("labelBitmap.dataBase64 is required.");
  }

  const widthBytes = Math.ceil(widthDots / 8);
  const expectedLength = widthBytes * heightDots;
  const bitmapBytes = Buffer.from(dataBase64, "base64");

  if (bitmapBytes.length !== expectedLength) {
    throw new Error(
      `labelBitmap byte length mismatch. Expected ${expectedLength}, got ${bitmapBytes.length}.`
    );
  }

  const labelWidthMm = Number.isFinite(Number(payload?.printer?.labelWidthMm))
    ? Number(payload.printer.labelWidthMm)
    : config.paper.widthMm;
  const labelHeightMm = Number.isFinite(Number(payload?.printer?.labelHeightMm))
    ? Number(payload.printer.labelHeightMm)
    : config.paper.heightMm;
  const header = [
    "SIZE " + `${labelWidthMm} mm,${labelHeightMm} mm`,
    "GAP 2 mm,0 mm",
    "DIRECTION 1",
    "REFERENCE 0,0",
    "CLS",
    `BITMAP 0,0,${widthBytes},${heightDots},0,`,
  ].join("\r\n");
  const nativeBarcode = payload?.nativeBarcode;
  let nativeBarcodeCommand = "";
  if (nativeBarcode && typeof nativeBarcode === "object") {
    const barcodeValue = sanitizeTsplText(payload.barcodeValue, "");
    const type = sanitizeTsplText(nativeBarcode.type, "128");
    const x = Number.parseInt(String(nativeBarcode.x ?? ""), 10);
    const y = Number.parseInt(String(nativeBarcode.y ?? ""), 10);
    const height = Number.parseInt(String(nativeBarcode.height ?? ""), 10);
    const narrow = Number.parseInt(String(nativeBarcode.narrow ?? ""), 10);
    const wide = Number.parseInt(String(nativeBarcode.wide ?? ""), 10);

    if (
      barcodeValue
      && Number.isFinite(x) && x >= 0
      && Number.isFinite(y) && y >= 0
      && Number.isFinite(height) && height > 0
      && Number.isFinite(narrow) && narrow > 0
      && Number.isFinite(wide) && wide >= narrow
    ) {
      nativeBarcodeCommand = `BARCODE ${x},${y},"${type}",${height},0,0,${narrow},${wide},"${barcodeValue}"\r\n`;
    }
  }

  return Buffer.concat([
    Buffer.from(header, "ascii"),
    bitmapBytes,
    Buffer.from(`\r\n${nativeBarcodeCommand}PRINT 1,1\r\n`, "ascii"),
  ]);
}

function sendRawToPrinter({ printerName, documentName, rawContent }) {
  return new Promise((resolve, reject) => {
    const rawBuffer = Buffer.isBuffer(rawContent)
      ? rawContent
      : Buffer.from(rawContent, "utf8");
    const base64Payload = rawBuffer.toString("base64");

    const args = [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      POWERSHELL_SCRIPT_PATH,
      "-PrinterName",
      printerName,
      "-DocumentName",
      documentName,
      "-PayloadFromStdin",
    ];

    const child = spawn(
      "powershell.exe",
      args,
      {
        windowsHide: true,
      }
    );

    let stderr = "";

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });

    child.stdin.write(base64Payload + "\n");
    child.stdin.end();

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `Print process exited with code ${code}.`));
    });
  });
}

async function handleHealth(response, config) {
  sendJson(response, 200, {
    ok: true,
    data: {
      service: "kpf-weight-scale-print-agent",
      printerName: config.printerName || null,
      pieceRatePrinterName: config.pieceRatePrinterName || null,
      paper: config.paper,
    },
  });
}

async function handlePrinters(response, config) {
  const printers = await listInstalledPrinters();
  sendJson(response, 200, {
    ok: true,
    data: {
      printers,
      selectedPrinterName: config.printerName || null,
    },
  });
}

async function handlePieceRatePrinters(response, config) {
  const printers = await listInstalledPrinters();
  sendJson(response, 200, {
    ok: true,
    data: {
      printers,
      selectedPrinterName: config.pieceRatePrinterName || null,
    },
  });
}

async function handleSavePrinterSelection(request, response) {
  const body = await collectJsonBody(request);
  const printerName = String(body?.printerName || "").trim();

  if (!printerName) {
    sendJson(response, 400, {
      ok: false,
      error: "printerName is required.",
    });
    return;
  }

  const printers = await listInstalledPrinters();
  const matchedPrinter = printers.find((printer) => printer.name === printerName);

  if (!matchedPrinter) {
    sendJson(response, 404, {
      ok: false,
      error: "Selected printer was not found on this workstation.",
    });
    return;
  }

  const nextConfig = saveConfigPatch({
    printerName: matchedPrinter.name,
  });

  sendJson(response, 200, {
    ok: true,
    data: {
      printerName: nextConfig.printerName,
    },
  });
}

async function handleSavePieceRatePrinterSelection(request, response) {
  const body = await collectJsonBody(request);
  const printerName = String(body?.printerName || "").trim();
  if (!printerName) {
    sendJson(response, 400, { ok: false, error: "printerName is required." });
    return;
  }
  const printers = await listInstalledPrinters();
  const matchedPrinter = printers.find((printer) => printer.name === printerName);
  if (!matchedPrinter) {
    sendJson(response, 404, { ok: false, error: "Selected printer was not found on this workstation." });
    return;
  }
  const nextConfig = saveConfigPatch({ pieceRatePrinterName: matchedPrinter.name });
  sendJson(response, 200, {
    ok: true,
    data: { printerName: nextConfig.pieceRatePrinterName },
  });
}

async function handlePrintWeightScaleLabel(request, response, config) {
  const body = await collectJsonBody(request);

  if (!config.printerName) {
    sendJson(response, 500, {
      ok: false,
      error: "Printer name is not configured. Update local-print-agent/config.json first.",
    });
    return;
  }

  const rawContent = buildTsplLabel(body, config);
  await sendRawToPrinter({
    printerName: config.printerName,
    documentName: config.documentName,
    rawContent,
  });

  sendJson(response, 200, {
    ok: true,
    data: {
      printerName: config.printerName,
      barcodeValue: String(body.barcodeValue || "").trim(),
      printedAt: new Date().toISOString(),
    },
  });
}

async function handlePrintPieceRateLabel(request, response, config) {
  const body = await collectJsonBody(request);
  let printerName = resolvePrinterForJob(config, "piece-rate");
  const printerNameOverride = String(body?.printerNameOverride || "").trim();
  if (printerNameOverride) {
    const printers = await listInstalledPrinters();
    const matchedPrinter = printers.find((printer) => printer.name === printerNameOverride);
    if (!matchedPrinter) {
      sendJson(response, 404, { ok: false, error: "Selected test printer was not found." });
      return;
    }
    printerName = matchedPrinter.name;
  }
  if (!printerName) {
    sendJson(response, 500, {
      ok: false,
      error: "Piece-rate printer is not configured.",
    });
    return;
  }
  const rawContent = buildTsplLabel(body, config);
  await sendRawToPrinter({
    printerName,
    documentName: "KPF Piece Rate Label",
    rawContent,
  });
  sendJson(response, 200, {
    ok: true,
    data: {
      printerName,
      barcodeValue: String(body.barcodeValue || "").trim(),
      printedAt: new Date().toISOString(),
    },
  });
}

async function handlePrintCentralScaleLabel(request, response, config) {
  const body = await collectJsonBody(request);
  const printerName = String(body?.printerName || "").trim();
  const printers = await listInstalledPrinters();
  if (!printerName || !printers.some(printer => printer.name === printerName)
    || !/^\d{14}$/.test(body?.barcodeValue || "")
    || !body?.labelBitmap || body?.nativeBarcode?.type !== "128"
    || !["x", "y", "height", "narrow", "wide"].every(key => Number.isInteger(body.nativeBarcode[key]))
    || body.nativeBarcode.x < 0 || body.nativeBarcode.y < 0 || body.nativeBarcode.height <= 0
    || body.nativeBarcode.narrow <= 0 || body.nativeBarcode.wide < body.nativeBarcode.narrow) {
    sendJson(response, 400, { ok: false, error: "Central printer or native Code 128 barcode is invalid." });
    return;
  }
  const rawContent = buildTsplLabel(body, config);
  await sendRawToPrinter({ printerName, documentName: "KPF Central Scale Label", rawContent });
  sendJson(response, 200, { ok: true, data: { printerName, barcodeValue: body.barcodeValue, spooledAt: new Date().toISOString() } });
}

function createServer() {
  return http.createServer(async (request, response) => {
    const config = loadConfig();

    if (request.method === "OPTIONS") {
      sendJson(response, 200, { ok: true });
      return;
    }

    try {
      if (request.method === "GET" && request.url === "/health") {
        await handleHealth(response, config);
        return;
      }

      if (request.method === "GET" && request.url === "/printers") {
        await handlePrinters(response, config);
        return;
      }

      if (request.method === "GET" && request.url === "/piece-rate/printers") {
        await handlePieceRatePrinters(response, config);
        return;
      }

      if (request.method === "POST" && request.url === "/config/printer") {
        await handleSavePrinterSelection(request, response);
        return;
      }

      if (request.method === "POST" && request.url === "/piece-rate/config/printer") {
        await handleSavePieceRatePrinterSelection(request, response);
        return;
      }

      if (request.method === "POST" && request.url === "/print/weight-scale-label") {
        await handlePrintWeightScaleLabel(request, response, config);
        return;
      }

      if (request.method === "POST" && request.url === "/central-scale/print") {
        await handlePrintCentralScaleLabel(request, response, config);
        return;
      }

      if (request.method === "POST" && request.url === "/print/piece-rate-label") {
        await handlePrintPieceRateLabel(request, response, config);
        return;
      }

      sendJson(response, 404, {
        ok: false,
        error: "Route not found.",
      });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: error?.message || "Unexpected print agent error.",
      });
    }
  });
}

const config = loadConfig();
const server = createServer();

// Global uncaught exception handlers to prevent the process from crashing on spooler/COM port drops
process.on("uncaughtException", (error) => {
  console.error("[CRITICAL] Uncaught exception in print agent process:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("[CRITICAL] Unhandled rejection at:", promise, "reason:", reason);
});

server.listen(config.port, config.host, () => {
  console.log(
    `[kpf-weight-scale-print-agent] listening on http://${config.host}:${config.port}`
  );
});
