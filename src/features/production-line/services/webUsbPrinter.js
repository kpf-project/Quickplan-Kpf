"use client";

/**
 * Find bulk-out interface and endpoint for a USB device dynamically.
 */
export async function findPrinterEndpoint(device) {
  if (!device || !device.configuration) {
    throw new Error("Device configuration is not loaded or device is invalid.");
  }
  
  for (const iface of device.configuration.interfaces) {
    const interfaceNumber = iface.interfaceNumber;
    for (const alternate of iface.alternates) {
      for (const endpoint of alternate.endpoints) {
        if (endpoint.direction === "out" && endpoint.type === "bulk") {
          return {
            interfaceNumber,
            endpointNumber: endpoint.endpointNumber,
          };
        }
      }
    }
  }
  throw new Error("No bulk-out endpoint found on this USB device.");
}

/**
 * Format TSPL labels on the client side (matching server.js implementation).
 */
export function buildTsplLabel(payload) {
  const sanitizeText = (value, fallback = "-") => {
    const normalized = String(value || "")
      .replace(/[\r\n\t]+/g, " ")
      .replace(/"/g, "'")
      .trim();

    if (!normalized) {
      return fallback;
    }
    return normalized;
  };

  const formatWeight = (value, fractionDigits = 2) => {
    const parsed = Number.parseFloat(String(value ?? "").trim());
    if (!Number.isFinite(parsed)) {
      return "-";
    }
    return parsed.toFixed(fractionDigits);
  };

  const normalizeUnitLabel = (value) => {
    const normalized = String(value || "").trim();
    if (!normalized || normalized.toLowerCase() === "kg") {
      return "กก.";
    }
    return normalized;
  };

  const formatTimestamp = (value) => {
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
  };

  const barcodeValue = sanitizeText(payload.barcodeValue, "");
  if (!barcodeValue) {
    throw new Error("barcodeValue is required.");
  }

  const productCode = sanitizeText(payload.productCode);
  const productName = sanitizeText(payload.productName);
  const lotNo = sanitizeText(payload.lotNo);
  const weighedAt = sanitizeText(formatTimestamp(payload.weighedAt));
  const unitLabel = sanitizeText(normalizeUnitLabel(payload.unitLabel));
  const tareWeightLine = sanitizeText(`Tare : ${formatWeight(payload.tareWeightKg, 2)}`);
  const netWeightLine = sanitizeText(
    `NET ${formatWeight(payload.netWeightKg, 2)} ${unitLabel}`
  );
  const labelWidthMm = Number.isFinite(Number(payload?.printer?.labelWidthMm))
    ? Number(payload.printer.labelWidthMm)
    : 80;
  const labelHeightMm = Number.isFinite(Number(payload?.printer?.labelHeightMm))
    ? Number(payload.printer.labelHeightMm)
    : 50;

  return [
    "CODEPAGE UTF-8",
    `SIZE ${labelWidthMm} mm,${labelHeightMm} mm`,
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
    ""
  ].join("\r\n");
}

/**
 * Connect to device, claim interface, and transfer TSPL payload.
 */
export async function printWeightScaleLabelViaUsb(device, payload) {
  if (!device) {
    throw new Error("No USB device selected.");
  }

  const tsplString = buildTsplLabel(payload);
  const data = new TextEncoder().encode(tsplString);

  // Open device if not opened
  if (!device.opened) {
    try {
      await device.open();
    } catch (error) {
      if (String(error?.message || "").toLowerCase().includes("access denied")) {
        throw new Error(
          "ไม่สามารถเปิดเครื่องพิมพ์ผ่าน WebUSB ได้ เพราะ Windows/driver กำลังครอบครอง USB printer อยู่ ให้ใช้ Local Print Agent หรือเปลี่ยน driver เป็น WinUSB เฉพาะเครื่องนี้"
        );
      }
      throw error;
    }
  }

  // Select configuration (default to 1)
  try {
    if (device.configuration === null || device.configuration.configurationValue !== 1) {
      await device.selectConfiguration(1);
    }
  } catch (error) {
    console.warn("Failed to select configuration on WebUSB device:", error);
  }

  // Resolve bulk out interface & endpoint number
  const endpointInfo = await findPrinterEndpoint(device);

  // Claim interface
  await device.claimInterface(endpointInfo.interfaceNumber);

  try {
    // Send data
    const transferResult = await device.transferOut(endpointInfo.endpointNumber, data);
    if (transferResult?.status && transferResult.status !== "ok") {
      throw new Error(`WebUSB transfer failed with status: ${transferResult.status}`);
    }

    return {
      status: transferResult?.status || "ok",
      bytesWritten: transferResult?.bytesWritten ?? data.byteLength,
      endpointNumber: endpointInfo.endpointNumber,
      interfaceNumber: endpointInfo.interfaceNumber,
    };
  } finally {
    // Clean up connections
    try {
      await device.releaseInterface(endpointInfo.interfaceNumber);
    } catch (e) {
      console.warn("Failed to release WebUSB interface:", e);
    }
    try {
      await device.close();
    } catch (e) {
      console.warn("Failed to close WebUSB device:", e);
    }
  }
}
