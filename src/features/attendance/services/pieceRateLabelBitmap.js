"use client";

const DOTS_PER_MM = 8;
const WIDTH_DOTS = 80 * DOTS_PER_MM;
const HEIGHT_DOTS = 50 * DOTS_PER_MM;
const FONT_FAMILY = "Tahoma, Arial, sans-serif";

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

function breakLongWord(ctx, word, maxWidth) {
  const chunks = [];
  let chunk = "";
  for (const character of Array.from(word)) {
    const candidate = `${chunk}${character}`;
    if (chunk && ctx.measureText(candidate).width > maxWidth) {
      chunks.push(chunk);
      chunk = character;
    } else {
      chunk = candidate;
    }
  }
  if (chunk) chunks.push(chunk);
  return chunks;
}

function wrapText(ctx, text, maxWidth) {
  const rawWords = String(text || "-").trim().split(/\s+/).filter(Boolean);
  const words = rawWords.flatMap((word) => (
    ctx.measureText(word).width > maxWidth ? breakLongWord(ctx, word, maxWidth) : [word]
  ));
  const lines = [];
  let currentLine = "";

  for (const word of words) {
    const candidate = currentLine ? `${currentLine} ${word}` : word;
    if (currentLine && ctx.measureText(candidate).width > maxWidth) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = candidate;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.length ? lines : ["-"];
}

function balanceTextIntoLines(text, maxLines) {
  const normalizedText = String(text || "-").trim() || "-";
  if (maxLines <= 1) return [normalizedText];

  const words = normalizedText.split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    const characters = Array.from(normalizedText);
    const midpoint = Math.ceil(characters.length / 2);
    return [characters.slice(0, midpoint).join(""), characters.slice(midpoint).join("")].filter(Boolean);
  }

  let splitIndex = 1;
  let smallestDifference = Number.POSITIVE_INFINITY;
  for (let index = 1; index < words.length; index += 1) {
    const firstLine = words.slice(0, index).join(" ");
    const secondLine = words.slice(index).join(" ");
    const difference = Math.abs(firstLine.length - secondLine.length);
    if (difference < smallestDifference) {
      smallestDifference = difference;
      splitIndex = index;
    }
  }
  return [words.slice(0, splitIndex).join(" "), words.slice(splitIndex).join(" ")];
}

function fitWrappedText(ctx, text, { maxWidth, maxLines, startSize, minSize, weight = "bold" }) {
  for (let size = startSize; size >= minSize; size -= 1) {
    ctx.font = `${weight} ${size}px ${FONT_FAMILY}`;
    const lines = wrapText(ctx, text, maxWidth);
    if (lines.length <= maxLines) return { lines, size };
  }

  const balancedLines = balanceTextIntoLines(text, maxLines);
  for (let size = minSize - 1; size >= 8; size -= 1) {
    ctx.font = `${weight} ${size}px ${FONT_FAMILY}`;
    if (balancedLines.every((line) => ctx.measureText(line).width <= maxWidth)) {
      return { lines: balancedLines, size };
    }
  }
  return { lines: balancedLines, size: 8 };
}

function drawWrappedText(ctx, text, options) {
  const fitted = fitWrappedText(ctx, text, options);
  ctx.font = `${options.weight || "bold"} ${fitted.size}px ${FONT_FAMILY}`;
  fitted.lines.forEach((line, index) => {
    ctx.fillText(line, options.x, options.y + index * options.lineHeight);
  });
}

function drawLabel(ctx, label) {
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, WIDTH_DOTS, HEIGHT_DOTS);
  ctx.fillStyle = "#000";
  ctx.strokeStyle = "#000";
  ctx.lineWidth = 3;
  ctx.strokeRect(4, 4, WIDTH_DOTS - 8, HEIGHT_DOTS - 8);

  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";
  ctx.font = `bold 22px ${FONT_FAMILY}`;
  ctx.fillText(label.title, 620, 30);

  ctx.textAlign = "left";
  drawWrappedText(ctx, `สินค้า: ${label.productCode} ${label.productName}`, {
    x: 20,
    y: 57,
    maxWidth: 600,
    maxLines: 2,
    startSize: 31,
    minSize: 18,
    lineHeight: 31,
  });

  ctx.lineWidth = 2;
  ctx.strokeRect(19, 101, 390, 54);
  ctx.font = `bold 36px ${FONT_FAMILY}`;
  ctx.fillText(`LOT: ${label.lotNo}`, 31, 141);

  drawWrappedText(ctx, `พนักงาน: ${label.employeeCode} ${label.employeeName}`, {
    x: 20,
    y: 187,
    maxWidth: 600,
    maxLines: 2,
    startSize: 29,
    minSize: 16,
    lineHeight: 29,
  });

  ctx.textAlign = "center";
  const weight = fitWrappedText(ctx, label.weightText, {
    maxWidth: 590,
    maxLines: 1,
    startSize: 78,
    minSize: 52,
    weight: "bold",
  });
  ctx.font = `bold ${weight.size}px ${FONT_FAMILY}`;
  ctx.fillText(weight.lines[0], WIDTH_DOTS / 2, 289);

  ctx.font = `26px Arial, sans-serif`;
  ctx.fillText(label.documentNo, WIDTH_DOTS / 2, 389);
}

export function createPieceRateLabelBitmapPayload(label) {
  if (typeof document === "undefined") return label;
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH_DOTS;
  canvas.height = HEIGHT_DOTS;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  drawLabel(ctx, label);

  return {
    ...label,
    barcodeValue: label.barcode.value,
    labelBitmap: {
      widthDots: WIDTH_DOTS,
      heightDots: HEIGHT_DOTS,
      dataBase64: canvasToMonoBitmapBase64(canvas),
    },
    nativeBarcode: {
      type: "128",
      x: 100,
      y: 294,
      height: 80,
      narrow: 2,
      wide: 4,
    },
    printer: { labelWidthMm: 80, labelHeightMm: 50 },
  };
}
