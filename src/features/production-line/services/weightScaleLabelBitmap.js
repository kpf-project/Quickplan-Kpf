"use client";

import JsBarcode from "jsbarcode";

const DOTS_PER_MM = 8;
const LABEL_WIDTH_MM = 80;
const LABEL_HEIGHT_MM = 50;
const LABEL_WIDTH_DOTS = LABEL_WIDTH_MM * DOTS_PER_MM;
const LABEL_HEIGHT_DOTS = LABEL_HEIGHT_MM * DOTS_PER_MM;

function parseNumber(value, fallback = 0) {
  const parsed = Number.parseFloat(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeUnitLabel(value) {
  const normalized = String(value || "").trim();
  if (!normalized || normalized.toLowerCase() === "kg") {
    return "\u0e01\u0e01.";
  }
  return normalized;
}

function formatThaiTimestamp(value) {
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

function drawUnderlinedText(ctx, text, x, y, font, underlineWidth = null) {
  ctx.font = font;
  ctx.fillText(text, x, y);

  const metrics = ctx.measureText(text);
  const width = underlineWidth ?? metrics.width;
  ctx.fillRect(x, y + 5, width, 3);
}

function drawTextFit(ctx, text, x, y, maxWidth, font, minSize = 28) {
  const match = /^(.+?)(\d+)px(.+)$/.exec(font);
  if (!match) {
    ctx.font = font;
    ctx.fillText(text, x, y);
    return;
  }

  const [, prefix, sizeText, suffix] = match;
  let size = Number.parseInt(sizeText, 10);
  while (size > minSize) {
    ctx.font = `${prefix}${size}px${suffix}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  ctx.fillText(text, x, y);
}

function bytesToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return window.btoa(binary);
}

function canvasToMonoBitmapBase64(canvas) {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const widthBytes = Math.ceil(width / 8);
  const bitmap = new Uint8Array(widthBytes * height).fill(0xff);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const luminance = data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114;
      if (data[offset + 3] > 0 && luminance < 170) {
        const byteIndex = y * widthBytes + Math.floor(x / 8);
        bitmap[byteIndex] &= ~(0x80 >> (x % 8));
      }
    }
  }

  return bytesToBase64(bitmap);
}

export function createWeightScaleLabelBitmapPayload(label) {
  if (typeof document === "undefined") {
    return label;
  }

  const canvas = document.createElement("canvas");
  canvas.width = LABEL_WIDTH_DOTS;
  canvas.height = LABEL_HEIGHT_DOTS;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = "#000000";
  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 3;
  ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);

  const productCode = String(label.productCode || "-").trim() || "-";
  const productName = String(label.productName || "-").trim() || "-";
  const lotNo = String(label.lotNo || "-").trim() || "-";
  const barcodeValue = String(label.barcodeValue || "").trim();
  const unitLabel = normalizeUnitLabel(label.unitLabel);
  const tareWeight = parseNumber(label.tareWeightKg, 0).toFixed(2);
  const netWeight = parseNumber(label.netWeightKg, 0).toFixed(2);
  const weighedAt = formatThaiTimestamp(label.weighedAt);

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "right";
  ctx.font = "30px Arial, Tahoma, sans-serif";
  ctx.fillText(weighedAt, 612, 38);

  ctx.textAlign = "left";
  drawUnderlinedText(ctx, "Code", 30, 86, "bold 38px Arial, Tahoma, sans-serif");
  ctx.font = "38px Arial, Tahoma, sans-serif";
  ctx.fillText(`: ${productCode}`, 128, 86);

  drawUnderlinedText(ctx, "Product", 30, 133, "bold 38px Arial, Tahoma, sans-serif");
  drawTextFit(
    ctx,
    `: ${productName}`,
    190,
    133,
    406,
    "36px Arial, Tahoma, sans-serif",
    24
  );

  drawUnderlinedText(ctx, "Lot", 30, 180, "bold 38px Arial, Tahoma, sans-serif");
  ctx.font = "36px Arial, Tahoma, sans-serif";
  ctx.fillText(`: ${lotNo}`, 98, 180);

  drawUnderlinedText(ctx, "Tare", 414, 180, "bold 36px Arial, Tahoma, sans-serif");
  ctx.font = "36px Arial, Tahoma, sans-serif";
  ctx.fillText(`: ${tareWeight}`, 512, 180);

  ctx.textAlign = "center";
  ctx.font = "bold 56px Arial, Tahoma, sans-serif";
  ctx.fillText(`NET ${netWeight} ${unitLabel}`, 320, 252);

  const barcodeCanvas = document.createElement("canvas");
  JsBarcode(barcodeCanvas, barcodeValue || "-", {
    format: "CODE128",
    width: 2.2,
    height: 58,
    displayValue: false,
    margin: 0,
    background: "#ffffff",
    lineColor: "#000000",
  });
  ctx.drawImage(barcodeCanvas, 146, 292, 348, 58);

  ctx.font = "32px Arial, Tahoma, sans-serif";
  ctx.fillText(barcodeValue, 320, 386);

  return {
    ...label,
    labelBitmap: {
      widthDots: canvas.width,
      heightDots: canvas.height,
      dataBase64: canvasToMonoBitmapBase64(canvas),
    },
    printer: {
      ...label.printer,
      labelWidthMm: LABEL_WIDTH_MM,
      labelHeightMm: LABEL_HEIGHT_MM,
    },
  };
}
