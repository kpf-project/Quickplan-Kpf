# KPF Weight Scale Local Print Agent

Local Windows print agent for silent barcode label printing from the weight scale page.

## What it does

- Receives label payloads from the Next.js app on `http://127.0.0.1:41951`
- Builds a raw TSPL label for TSC printers
- Sends the raw command directly to the installed Windows printer queue
- Prints without opening the browser print dialog

## Supported label content

- Product code
- Product name
- LOT
- Net weight
- Weighed date/time
- Barcode graphic
- Barcode text

## Important note about Thai text

This first version sends raw TSPL using ASCII-safe text. Barcode, SKU, LOT, date/time, and net weight are reliable.

If product names contain Thai characters, the exact output depends on the printer font/firmware setup. For many TSC setups, product code and LOT should be treated as the primary reliable text on the label.

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
4. Install the hidden Windows Scheduled Task
5. Start the local print agent immediately
6. Check `http://127.0.0.1:41951/health`

If the workstation has no internet access or no `winget`, install Node.js LTS manually first, or place portable Node at `local-print-agent\node\node.exe`, then run `install-workstation.cmd` again.

### Manual run

1. Copy `config.example.json` to `config.json`
2. Run:

```bash
npm start
```

3. Open the weight scale page, go to `ตั้งค่า > คอนฟิก`
4. Click refresh and choose the Windows printer from the dropdown
5. Save the setting once
6. Keep the agent running on the workstation that prints labels

## Automatic startup with Windows

Recommended workstation install:

```bash
npm run install-task
```

This creates a Windows Scheduled Task for the current Windows user, starts the agent now, and starts it again after sign-in. This is more reliable than a Startup-folder shortcut and does not require Docker.

The scheduled task runs through `run-agent-hidden.ps1`, so the Node.js console window is hidden and operators cannot accidentally close it from the taskbar.

Remove the scheduled task:

```bash
npm run uninstall-task
```

Legacy Startup-folder shortcut:

Install automatic startup:

```bash
npm run install-startup
```

Remove automatic startup:

```bash
npm run uninstall-startup
```

This creates a shortcut in the current Windows user's Startup folder so the local print agent starts automatically after sign-in.

## Optional Windows Service with NSSM

For IT-managed workstations, you can install the agent as a Windows Service by placing `nssm.exe` in this folder or passing `-NssmPath`.

```bash
npm run install-service:nssm
```

Remove the service:

```bash
npm run uninstall-service:nssm
```

Important: Windows services commonly run as `LocalSystem`. Some USB/driver printers are installed only for the interactive user, so the service may not see the same printers. If that happens, use `npm run install-task` or configure the service account to the production workstation user.

## Health check

```bash
GET http://127.0.0.1:41951/health
```

## Printer list endpoint

```bash
GET http://127.0.0.1:41951/printers
```

Each printer entry includes:

- `name`
- `isDefault`
- `isOffline`
- `portName`
- `driverName`

## Save selected printer

```bash
POST http://127.0.0.1:41951/config/printer
Content-Type: application/json
```

```json
{
  "printerName": "TSC TE200"
}
```

## Print endpoint

```bash
POST http://127.0.0.1:41951/print/weight-scale-label
Content-Type: application/json
```

Request example:

```json
{
  "barcodeValue": "WSR-20260419-WKB0028-ABC123",
  "productCode": "WKB-0028",
  "productName": "CRACKER",
  "lotNo": "260419-A",
  "netWeightKg": 15.2,
  "weighedAt": "2026-04-19T10:30:00.000Z",
  "unitLabel": "kg",
  "printer": {
    "labelWidthMm": 85,
    "labelHeightMm": 50
  }
}
```
