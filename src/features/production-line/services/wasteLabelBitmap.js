"use client";

import JsBarcode from "jsbarcode";

const WIDTH_DOTS = 640;
const HEIGHT_DOTS = 400;

function formatTimestamp(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function fitText(ctx, text, maxWidth, startSize, minSize = 20) {
  let size = startSize;
  while (size > minSize) {
    ctx.font = `${size}px Tahoma, Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 2;
  }
  return size;
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
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
        bitmap[y * widthBytes + Math.floor(x / 8)] &= ~(0x80 >> (x % 8));
      }
    }
  }
  return bytesToBase64(bitmap);
}

export function createWasteLabelBitmapPayload(label) {
  if (typeof document === "undefined") return label;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH_DOTS;
  canvas.height = HEIGHT_DOTS;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, WIDTH_DOTS, HEIGHT_DOTS);
  ctx.fillStyle = "#000";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 3;
  ctx.strokeRect(3, 3, WIDTH_DOTS - 6, HEIGHT_DOTS - 6);

  ctx.strokeRect(20, 17, 112, 38);
  ctx.font = "bold 25px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("WASTE", 76, 45);
  ctx.font = "bold 35px Tahoma, Arial, sans-serif";
  ctx.fillText(label.title, 320, 48);
  ctx.textAlign = "right";
  ctx.font = "22px Tahoma, Arial, sans-serif";
  ctx.fillText(formatTimestamp(label.recordedAt), 615, 43);

  ctx.textAlign = "left";
  ctx.font = "bold 31px Arial, sans-serif";
  ctx.fillText(`Code : ${label.productCode}`, 24, 95);
  const productText = `Product : ${label.productName}`;
  ctx.font = `${fitText(ctx, productText, 590, 30, 19)}px Tahoma, Arial, sans-serif`;
  ctx.fillText(productText, 24, 137);
  ctx.font = "bold 29px Tahoma, Arial, sans-serif";
  ctx.fillText(`ประเภท : ${label.wasteTypeLabel}`, 24, 180);
  ctx.fillRect(20, 194, 600, 2);

  ctx.textAlign = "center";
  ctx.font = `bold ${fitText(ctx, label.quantityText, 590, 70, 48)}px Tahoma, Arial, sans-serif`;
  ctx.fillText(label.quantityText, 320, 264);

  const barcodeCanvas = document.createElement("canvas");
  JsBarcode(barcodeCanvas, label.barcodeValue, {
    format: "CODE128",
    width: 2,
    height: 64,
    displayValue: false,
    margin: 0,
  });
  ctx.drawImage(barcodeCanvas, 100, 282, 440, 64);
  ctx.font = "25px Arial, sans-serif";
  ctx.fillText(label.barcodeText, 320, 382);

  return {
    ...label,
    labelBitmap: {
      widthDots: WIDTH_DOTS,
      heightDots: HEIGHT_DOTS,
      dataBase64: canvasToMonoBitmapBase64(canvas),
    },
    printer: { ...label.printer, labelWidthMm: 80, labelHeightMm: 50 },
  };
}
