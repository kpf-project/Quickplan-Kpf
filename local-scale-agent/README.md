# KPF Local Scale Agent

Local Windows bridge agent that reads an OHAUS Defender 3000 weighing indicator over a USB-to-RS232 virtual COM port and streams parsed weights to the browser over WebSocket + REST.

## What it does

- Opens the configured serial COM port (OHAUS Defender 3000 connected via USB-to-RS232 adapter)
- Parses each ASCII weight frame (weight value, unit, stability flag) with a generic parser
- Streams readings to the Next.js app over WebSocket at `ws://127.0.0.1:41952/stream`
- Exposes REST endpoints on `http://127.0.0.1:41952` for health, port listing, and serial configuration
- Persists serial settings in `config.json` and reopens the port automatically on error/disconnect (retry every 5 seconds)

## REST endpoints

Base URL: `http://127.0.0.1:41952` — all endpoints return CORS header `Access-Control-Allow-Origin: *`.

### Health check

```bash
GET http://127.0.0.1:41952/health
```

```json
{
  "ok": true,
  "portOpen": false,
  "config": { "path": "COM3", "baudRate": 9600, "dataBits": 8, "parity": "none", "stopBits": 1 },
  "lastReading": null,
  "error": null
}
```

If `path` is empty the agent stays healthy with the serial port closed.

### List serial ports

```bash
GET http://127.0.0.1:41952/ports
```

Returns `{ "ports": [ { "path", "manufacturer", "friendlyName", "serialNumber" } ... ] }` from `SerialPort.list()`. Use this to find which COM port the USB-to-RS232 adapter got.

### Read serial config

```bash
GET http://127.0.0.1:41952/config/serial
```

### Save serial config

```bash
POST http://127.0.0.1:41952/config/serial
Content-Type: application/json
```

```json
{
  "path": "COM3",
  "baudRate": 9600,
  "dataBits": 8,
  "parity": "none",
  "stopBits": 1
}
```

Validates the payload, persists it to `config.json`, then closes and reopens the serial port with the new settings. Returns `{ "ok": true, "config": ... }`.

## WebSocket stream

```text
ws://127.0.0.1:41952/stream
```

Messages broadcast to every connected client:

Reading (one per parsed serial frame):

```json
{
  "type": "reading",
  "weightKg": 1.234,
  "unit": "kg",
  "stable": true,
  "raw": "ST,GS,+   1.234 kg",
  "at": "2026-07-23T04:00:00.000Z"
}
```

- `weightKg` is always kilograms; frames in grams are converted (`unit` keeps the original `"g"`).
- `stable` is `true` when the line has a standalone `ST` token, `false` for `US`, otherwise `null` (the web app does its own stability detection in that case).
- Garbage/unparseable lines still emit a reading with `weightKg: null` and the raw line.

Status (sent on connect and whenever the port state changes):

```json
{
  "type": "status",
  "portOpen": true,
  "error": null,
  "at": "2026-07-23T04:00:00.000Z"
}
```

## Serial configuration (Defender 3000)

Factory defaults, also the agent defaults in `config.example.json`:

```json
{
  "serial": {
    "path": "",
    "baudRate": 9600,
    "dataBits": 8,
    "parity": "none",
    "stopBits": 1
  },
  "agent": {
    "port": 41952
  }
}
```

The serial settings here must match the Defender 3000 indicator menu (RS232 setup): default is **9600 baud, 8 data bits, no parity, 1 stop bit (9600 8N1)**. If you changed the indicator menu, update `config.json` (or `POST /config/serial`) to the same values. Also enable continuous/print output on the indicator so it actually transmits frames.

Leave `path` empty to run the agent without opening any port (health stays `ok: true`, `portOpen: false`).

## Setup

### One-click workstation install

On a production workstation, double-click:

```text
install-workstation.cmd
```

The installer will:

1. Create `config.json` from `config.example.json` if needed
2. Check for Node.js
3. Install Node.js LTS with `winget` if Node.js is missing
4. Install the hidden Windows Scheduled Task (`KPF Local Scale Agent`)
5. Start the local scale agent immediately
6. Check `http://127.0.0.1:41952/health`

If the workstation has no internet access or no `winget`, install Node.js LTS manually first, or place portable Node at `local-scale-agent\node\node.exe`, then run `install-workstation.cmd` again.

### Manual run

1. Copy `config.example.json` to `config.json` and set the COM port path
2. Run:

```bash
npm install
npm start
```

## Automatic startup with Windows

Recommended workstation install:

```bash
npm run install-task
```

This creates a Windows Scheduled Task for the current Windows user, starts the agent now, and starts it again after sign-in.

The scheduled task runs through `run-agent-hidden.ps1`, so the Node.js console window is hidden and operators cannot accidentally close it from the taskbar.

Remove the scheduled task:

```bash
npm run uninstall-task
```

## Parser self-test

```bash
npm test
```

Runs sample Defender 3000 frames (`ST,GS,+   1.234 kg`, `US,NT,-  0.002 g`, `  15.20 kg`, garbage) through the parser and asserts the expected values.

## Troubleshooting

- **Garbage characters in `raw` / `weightKg: null` everywhere**: baud rate (or data bits/parity/stop bits) mismatch between `config.json` and the Defender 3000 RS232 menu. Wrong baud is the most common cause — make sure both sides are 9600 8N1.
- **No COM port listed in `/ports`**: the USB-to-RS232 adapter driver is missing. Install the driver for your adapter chipset (CH340/CH341 for cheap adapters, FTDI for FT232-based ones), then replug the adapter and check `/ports` again.
- **`portOpen: false` with an error in `/health`**: the port is configured but cannot be opened — check that no other program (terminal app, another agent) holds the COM port, and that the cable is connected. The agent retries opening every 5 seconds automatically.
- **Port number conflict**: change `agent.port` in `config.json` if something else already uses 41952.
