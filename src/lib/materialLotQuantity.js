function toFiniteNumber(value, fieldName) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${fieldName} must be a finite number`);
  }
  return parsed;
}

function roundQty(value) {
  return Number(Number(value || 0).toFixed(6));
}

function decimalText(value) {
  const text = String(value ?? "").trim();
  if (!text.includes(".")) return "";
  return text.split(".")[1] || "";
}

function packIntegerDigits(packSize) {
  return String(Math.trunc(Math.abs(packSize))).length;
}

function resolveRemainderBaseQty(remainderText, packSize) {
  if (!remainderText) return 0;

  if (remainderText.length <= packIntegerDigits(packSize)) {
    const wholeBaseQty = Number(remainderText);
    if (Number.isFinite(wholeBaseQty) && wholeBaseQty < packSize) {
      return wholeBaseQty;
    }
    throw new Error("remainder exceeds pack size");
  }

  const decimalBaseQty = Number(`0.${remainderText}`);
  if (decimalBaseQty >= packSize) {
    throw new Error("remainder exceeds pack size");
  }
  return decimalBaseQty;
}

function formatRemainderText(remainder, packSize) {
  if (remainder <= 0) return "";
  const remainderText = String(remainder).replace(/^0\./, "");
  if (Number.isInteger(remainder) && remainderText.length <= packIntegerDigits(packSize)) {
    return remainderText;
  }
  return remainderText;
}

export function mixedTradeQtyToBaseQty(qty, packSize) {
  const safeQty = toFiniteNumber(qty, "qty");
  const safePackSize = toFiniteNumber(packSize || 1, "packSize");
  if (safePackSize <= 0) {
    throw new Error("packSize must be greater than 0");
  }
  if (safePackSize === 1) {
    return roundQty(safeQty);
  }

  const fullPack = Math.trunc(safeQty);
  const remainderText = decimalText(qty);
  const remainderBaseQty = resolveRemainderBaseQty(remainderText, safePackSize);

  if (remainderBaseQty >= safePackSize) {
    throw new Error("remainder exceeds pack size");
  }

  return roundQty((fullPack * safePackSize) + remainderBaseQty);
}

export function conventionalPackQtyToBaseQty(qty, packSize) {
  const safeQty = toFiniteNumber(qty, "qty");
  const safePackSize = toFiniteNumber(packSize || 1, "packSize");
  if (safePackSize <= 0) {
    throw new Error("packSize must be greater than 0");
  }

  return roundQty(safeQty * safePackSize);
}

export function baseQtyToConventionalTradeQty(baseQty, packSize) {
  const safeBaseQty = toFiniteNumber(baseQty, "baseQty");
  const safePackSize = toFiniteNumber(packSize || 1, "packSize");
  if (safePackSize <= 0) {
    throw new Error("packSize must be greater than 0");
  }

  return roundQty(safeBaseQty / safePackSize);
}

export function baseQtyToMixedTradeQty(baseQty, packSize) {
  const safeBaseQty = toFiniteNumber(baseQty, "baseQty");
  const safePackSize = toFiniteNumber(packSize || 1, "packSize");
  if (safePackSize <= 0) {
    throw new Error("packSize must be greater than 0");
  }
  if (safePackSize === 1) {
    return roundQty(safeBaseQty);
  }

  const fullPack = Math.trunc(safeBaseQty / safePackSize);
  const remainder = roundQty(safeBaseQty - (fullPack * safePackSize));
  if (fullPack <= 0) {
    const remainderText = formatRemainderText(remainder, safePackSize);
    return remainderText ? Number(`0.${remainderText}`) : 0;
  }
  if (remainder <= 0) {
    return fullPack;
  }

  const remainderText = formatRemainderText(remainder, safePackSize);
  return Number(`${fullPack}.${remainderText}`);
}
