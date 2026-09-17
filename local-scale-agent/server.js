const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");
const { SerialPort } = require("serialport");
const { WebSocketServer, WebSocket } = require("ws");
const { buildScaleRuntimeProfile } = require("./scale-runtime-profile");

const DEFAULT_HOST = "127.0.0.1";
const RUNTIME_PROFILE = buildScaleRuntimeProfile({
  baseDir: __dirname,
  profile: process.env.KPF_SCALE_AGENT_PROFILE,
});
const DEFAULT_PORT = RUNTIME_PROFILE.port;
const REOPEN_DELAY_MS = 5000;
const MAX_BUFFER_LENGTH = 64 * 1024;
const CONFIG_PATH = process.env.KPF_SCALE_AGENT_CONFIG_PATH
  ? path.resolve(process.env.KPF_SCALE_AGENT_CONFIG_PATH)
  : RUNTIME_PROFILE.configPath;
const EXAMPLE_CONFIG_PATH = path.join(__dirname, "config.example.json");

const VALID_DATA_BITS = [5, 6, 7, 8];
const VALID_PARITIES = ["none", "even", "odd", "mark", "space"];
const VALID_STOP_BITS = [1, 1.5, 2];

const LOG_FILE_PATH = path.join(__dirname, "scale-agent.log");

function log(level, message) {
  const timestamp = new Date().toISOString();
  const formatted = `[${timestamp}] [${level}] ${message}\n`;
  console.log(formatted.trim());
  try {
    fs.appendFileSync(LOG_FILE_PATH, formatted, "utf8");
  } catch (err) {
    // ignore logging errors
  }
}

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

function normalizeSerialConfig(value) {
  const source = value && typeof value === "object" ? value : {};

  return {
    path: String(source.path || "").trim(),
    baudRate: Number.parseInt(source.baudRate, 10) || 9600,
    dataBits: VALID_DATA_BITS.includes(Number(source.dataBits)) ? Number(source.dataBits) : 8,
    parity: VALID_PARITIES.includes(String(source.parity || "").toLowerCase())
      ? String(source.parity).toLowerCase()
      : "none",
    stopBits: VALID_STOP_BITS.includes(Number(source.stopBits)) ? Number(source.stopBits) : 1,
  };
}

function loadConfig() {
  const exampleConfig = readJsonFile(EXAMPLE_CONFIG_PATH) || {};
  const userConfig = readJsonFile(CONFIG_PATH) || {};

  return {
    serial: normalizeSerialConfig({ ...exampleConfig.serial, ...userConfig.serial }),
    agent: {
      host: process.env.KPF_SCALE_AGENT_HOST
        || userConfig?.agent?.host
        || exampleConfig?.agent?.host
        || DEFAULT_HOST,
      port: Number.parseInt(
        process.env.KPF_SCALE_AGENT_PORT
        || userConfig?.agent?.port
        || (RUNTIME_PROFILE.profile === "weight-scale" ? exampleConfig?.agent?.port : null)
        || DEFAULT_PORT,
        10
      ),
    },
  };
}

function saveSerialConfig(serialConfig) {
  const currentConfig = readJsonFile(CONFIG_PATH) || {};
  const nextConfig = {
    ...currentConfig,
    serial: normalizeSerialConfig(serialConfig),
  };
  writeJsonFile(CONFIG_PATH, nextConfig);
  return nextConfig.serial;
}

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Private-Network", "true");
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
      } catch {
        reject(new Error("Invalid JSON payload."));
      }
    });

    request.on("error", (error) => {
      reject(error);
    });
  });
}

function parseReadingLine(rawLine) {
  const raw = String(rawLine ?? "");

  let weightValue = null;
  const numericMatches = raw.match(/[+-]?\s*\d+(?:\.\d+)?/g) || [];
  if (numericMatches.length > 0) {
    const lastToken = numericMatches[numericMatches.length - 1].replace(/\s+/g, "");
    const parsed = Number.parseFloat(lastToken);
    if (Number.isFinite(parsed)) {
      weightValue = parsed;
    }
  }

  let unit = null;
  if (/\bkg\b/i.test(raw)) {
    unit = "kg";
  } else if (/\bg\b/.test(raw)) {
    unit = "g";
  }

  let stable = null;
  const tokens = raw
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((token) => token.toUpperCase());
  if (tokens.includes("ST")) {
    stable = true;
  } else if (tokens.includes("US")) {
    stable = false;
  }

  let weightKg = null;
  if (weightValue !== null) {
    weightKg = unit === "g" ? weightValue / 1000 : weightValue;
  }

  return { weightKg, unit, stable, raw };
}

function validateSerialConfig(body) {
  const source = body && typeof body === "object" ? body : {};
  const errors = [];

  const portPath = String(source.path ?? "").trim();

  const baudRate = Number.parseInt(source.baudRate, 10);
  if (!Number.isFinite(baudRate) || baudRate <= 0) {
    errors.push("baudRate must be a positive integer.");
  }

  const dataBits = Number(source.dataBits);
  if (!VALID_DATA_BITS.includes(dataBits)) {
    errors.push(`dataBits must be one of ${VALID_DATA_BITS.join(", ")}.`);
  }

  const parity = String(source.parity ?? "").toLowerCase();
  if (!VALID_PARITIES.includes(parity)) {
    errors.push(`parity must be one of ${VALID_PARITIES.join(", ")}.`);
  }

  const stopBits = Number(source.stopBits);
  if (!VALID_STOP_BITS.includes(stopBits)) {
    errors.push(`stopBits must be one of ${VALID_STOP_BITS.join(", ")}.`);
  }

  if (errors.length > 0) {
    return { errors };
  }

  return {
    config: {
      path: portPath,
      baudRate,
      dataBits,
      parity,
      stopBits,
    },
  };
}

const config = loadConfig();

let serialPort = null;
let serialBuffer = "";
let closingIntentionally = false;
let reopenTimer = null;
let portOpen = false;
let lastError = null;
let lastReading = null;
let writeIntervalTimer = null;

function broadcast(payload) {
  if (!wss) {
    return;
  }

  const message = JSON.stringify(payload);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

function setStatus(nextPortOpen, nextError) {
  const changed = portOpen !== nextPortOpen || lastError !== nextError;
  portOpen = nextPortOpen;
  lastError = nextError;

  if (changed) {
    broadcast({
      type: "status",
      portOpen,
      error: lastError,
      at: new Date().toISOString(),
    });
  }
}

function scheduleReopen() {
  if (reopenTimer || !config.serial.path) {
    return;
  }

  reopenTimer = setTimeout(() => {
    reopenTimer = null;
    openSerialPort();
  }, REOPEN_DELAY_MS);
  reopenTimer.unref();
}

function handleSerialData(chunk) {
  const rawString = chunk.toString("utf8");
  log("DEBUG", `Raw serial chunk received (${chunk.length} bytes): "${rawString.replace(/\r/g, "\\r").replace(/\n/g, "\\n")}"`);
  serialBuffer += rawString;

  if (serialBuffer.length > MAX_BUFFER_LENGTH) {
    serialBuffer = serialBuffer.slice(-MAX_BUFFER_LENGTH);
  }

  const lines = serialBuffer.split(/\r\n|\r|\n/);
  serialBuffer = lines.pop() ?? "";

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    const parsed = parseReadingLine(line);
    log("DEBUG", `Raw: "${line.replace(/\r|\n/g, "")}" -> parsed weight: ${parsed.weightKg} kg, unit: ${parsed.unit}, stable: ${parsed.stable}`);

    if (parsed.weightKg === null) {
      // Ignore syntax errors, empty frames, or invalid command responses like "ES"
      continue;
    }

    const reading = {
      type: "reading",
      ...parsed,
      at: new Date().toISOString(),
    };

    lastReading = reading;
    broadcast(reading);
  }
}

function closeSerialPort() {
  if (reopenTimer) {
    clearTimeout(reopenTimer);
    reopenTimer = null;
  }

  if (writeIntervalTimer) {
    clearInterval(writeIntervalTimer);
    writeIntervalTimer = null;
  }

  if (!serialPort) {
    return;
  }

  closingIntentionally = true;
  const portToClose = serialPort;
  serialPort = null;

  try {
    if (portToClose.isOpen) {
      portToClose.close(() => {});
    }
  } catch {
    // Ignore close failures; the port is being replaced anyway.
  }

  portToClose.removeAllListeners();
}

function openSerialPort() {
  closeSerialPort();

  const serialConfig = config.serial;
  if (!serialConfig.path) {
    setStatus(false, null);
    log("WARNING", "No serial port path configured.");
    return;
  }

  closingIntentionally = false;
  serialBuffer = "";

  log("INFO", `Attempting to open serial port ${serialConfig.path} (Baud: ${serialConfig.baudRate}, Data: ${serialConfig.dataBits}, Parity: ${serialConfig.parity}, Stop: ${serialConfig.stopBits})`);

  try {
    serialPort = new SerialPort({
      path: serialConfig.path,
      baudRate: serialConfig.baudRate,
      dataBits: serialConfig.dataBits,
      parity: serialConfig.parity,
      stopBits: serialConfig.stopBits,
      autoOpen: false,
    });
  } catch (error) {
    const errorMsg = error?.message || "Failed to create serial port.";
    setStatus(false, errorMsg);
    log("ERROR", `Failed to initialize SerialPort instance: ${errorMsg}`);
    scheduleReopen();
    return;
  }

  serialPort.on("data", handleSerialData);

  serialPort.on("error", (error) => {
    const errorMsg = error?.message || "Serial port error.";
    setStatus(false, errorMsg);
    log("ERROR", `Serial port error on ${serialConfig.path}: ${errorMsg}`);
  });

  serialPort.on("close", () => {
    if (closingIntentionally) {
      log("INFO", `Serial port ${serialConfig.path} closed intentionally.`);
      return;
    }

    const errorMsg = lastError || "Serial port closed unexpectedly.";
    setStatus(false, errorMsg);
    log("WARNING", `Serial port ${serialConfig.path} closed unexpectedly: ${errorMsg}`);
    scheduleReopen();
  });

  serialPort.open((error) => {
    if (error) {
      setStatus(false, error.message);
      log("ERROR", `Failed to open serial port ${serialConfig.path}: ${error.message}`);
      scheduleReopen();
      return;
    }

    setStatus(true, null);
    log("INFO", `Serial port ${serialConfig.path} opened successfully and is reading data.`);

    if (writeIntervalTimer) {
      clearInterval(writeIntervalTimer);
    }
    writeIntervalTimer = setInterval(() => {
      if (serialPort && serialPort.isOpen) {
        serialPort.write("IP\r\n", (writeErr) => {
          if (writeErr) {
            log("WARNING", `Failed to write polling command: ${writeErr.message}`);
          }
        });
      }
    }, 450);
  });
}

async function handleHealth(response) {
  sendJson(response, 200, {
    ok: true,
    portOpen,
    config: config.serial,
    lastReading,
    error: lastError,
  });
}

async function handlePorts(response) {
  const ports = await SerialPort.list();
  sendJson(response, 200, {
    ports: ports.map((port) => ({
      path: port.path || "",
      manufacturer: port.manufacturer || "",
      friendlyName: port.friendlyName || "",
      serialNumber: port.serialNumber || "",
    })),
  });
}

async function handleGetSerialConfig(response) {
  sendJson(response, 200, config.serial);
}

async function handleSaveSerialConfig(request, response) {
  const body = await collectJsonBody(request);
  const { config: nextSerialConfig, errors } = validateSerialConfig(body);

  if (errors) {
    sendJson(response, 400, {
      ok: false,
      error: errors.join(" "),
    });
    return;
  }

  config.serial = saveSerialConfig(nextSerialConfig);
  openSerialPort();

  sendJson(response, 200, {
    ok: true,
    config: config.serial,
  });
}

function createServer() {
  return http.createServer(async (request, response) => {
    log("INFO", `HTTP Request: ${request.method} ${request.url}`);

    if (request.method === "OPTIONS") {
      sendJson(response, 200, { ok: true });
      return;
    }

    const routePath = request.url.split("?")[0];

    try {
      if (request.method === "GET" && routePath === "/health") {
        await handleHealth(response);
        return;
      }

      if (request.method === "GET" && routePath === "/ports") {
        await handlePorts(response);
        return;
      }

      if (request.method === "GET" && routePath === "/config/serial") {
        await handleGetSerialConfig(response);
        return;
      }

      if (request.method === "POST" && routePath === "/config/serial") {
        await handleSaveSerialConfig(request, response);
        return;
      }

      sendJson(response, 404, {
        ok: false,
        error: "Route not found.",
      });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: error?.message || "Unexpected scale agent error.",
      });
    }
  });
}

let wss = null;

function start() {
  const server = createServer();

  wss = new WebSocketServer({ server, path: "/stream" });

  wss.on("connection", (socket, request) => {
    const clientIp = request.socket.remoteAddress;
    log("INFO", `WebSocket client connected from ${clientIp}`);

    socket.send(JSON.stringify({
      type: "status",
      portOpen,
      error: lastError,
      at: new Date().toISOString(),
    }));

    socket.on("error", (error) => {
      log("ERROR", `WebSocket error for client ${clientIp}: ${error?.message || error}`);
    });

    socket.on("close", () => {
      log("INFO", `WebSocket client disconnected from ${clientIp}`);
    });
  });

  server.listen(config.agent.port, config.agent.host, () => {
    log("INFO", `[kpf-local-scale-agent] listening on http://${config.agent.host}:${config.agent.port}`);
  });

  openSerialPort();

  return server;
}

if (require.main === module) {
  start();
}

module.exports = {
  parseReadingLine,
  validateSerialConfig,
  loadConfig,
  start,
};
