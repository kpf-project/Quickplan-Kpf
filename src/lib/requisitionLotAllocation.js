function toFiniteQty(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function roundQty(value) {
  return Number(Number(value || 0).toFixed(6));
}

function parseEncodedLotDate(value) {
  const lotNo = String(value || "").trim();
  const match = lotNo.match(/^(\d{2})(\d{2})(\d{2})/);
  if (!match) return null;

  const year = 2000 + Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const timestamp = Date.UTC(year, month - 1, day);
  const parsedDate = new Date(timestamp);
  if (
    parsedDate.getUTCFullYear() !== year
    || parsedDate.getUTCMonth() !== month - 1
    || parsedDate.getUTCDate() !== day
  ) {
    return null;
  }
  return timestamp;
}

export function compareLotsByEncodedDate(left, right) {
  const leftLotNo = String(left?.lotNo || "").trim();
  const rightLotNo = String(right?.lotNo || "").trim();
  const leftDate = parseEncodedLotDate(leftLotNo);
  const rightDate = parseEncodedLotDate(rightLotNo);

  if (leftDate !== null && rightDate !== null && leftDate !== rightDate) {
    return leftDate - rightDate;
  }
  if (leftDate !== null && rightDate === null) return -1;
  if (leftDate === null && rightDate !== null) return 1;

  const lotCompare = leftLotNo.localeCompare(rightLotNo, "en", {
    numeric: true,
    sensitivity: "base",
  });
  if (lotCompare !== 0) return lotCompare;
  return String(left?.warehouseCode || "").localeCompare(String(right?.warehouseCode || ""));
}

export function allocateAvailableBaseQty(requiredBaseQty, lots = []) {
  let remainingBaseQty = toFiniteQty(requiredBaseQty);
  const allocations = [];

  for (const lot of Array.isArray(lots) ? lots : []) {
    if (remainingBaseQty <= 0) break;

    const availableBaseQty = toFiniteQty(lot?.availableBaseQty);
    if (availableBaseQty <= 0) continue;

    const allocatedBaseQty = Math.min(remainingBaseQty, availableBaseQty);
    lot.availableBaseQty = roundQty(availableBaseQty - allocatedBaseQty);
    remainingBaseQty = roundQty(remainingBaseQty - allocatedBaseQty);
    allocations.push({ lot, allocatedBaseQty: roundQty(allocatedBaseQty) });
  }

  return {
    allocations,
    unallocatedBaseQty: remainingBaseQty,
  };
}

export function allocatePhysicalBaseQty(requiredBaseQty, lots = []) {
  let remainingBaseQty = toFiniteQty(requiredBaseQty);
  const allocations = [];

  for (const lot of Array.isArray(lots) ? lots : []) {
    if (remainingBaseQty <= 0) break;

    const packSize = toFiniteQty(lot?.stockPackSize) || 1;
    if (!Number.isFinite(lot.looseBaseQty) || !Number.isFinite(lot.packedBaseQty)) {
      const availableBaseQty = toFiniteQty(lot?.availableBaseQty);
      const wholePackCount = packSize > 1
        ? Math.floor((availableBaseQty + 1e-9) / packSize)
        : 0;
      lot.packedBaseQty = packSize > 1 ? roundQty(wholePackCount * packSize) : 0;
      lot.looseBaseQty = packSize > 1
        ? roundQty(availableBaseQty - lot.packedBaseQty)
        : availableBaseQty;
    }

    const portions = [
      { key: "looseBaseQty", sourceKind: "base" },
      { key: "packedBaseQty", sourceKind: "pack" },
    ];

    for (const portion of portions) {
      if (remainingBaseQty <= 0) break;
      const availableBaseQty = toFiniteQty(lot[portion.key]);
      if (availableBaseQty <= 0) continue;

      const allocatedBaseQty = Math.min(remainingBaseQty, availableBaseQty);
      lot[portion.key] = roundQty(availableBaseQty - allocatedBaseQty);
      if (portion.sourceKind === "pack" && packSize > 1) {
        const remainingWholePacks = Math.floor((lot.packedBaseQty + 1e-9) / packSize);
        const openedPackRemainder = roundQty(lot.packedBaseQty - (remainingWholePacks * packSize));
        lot.packedBaseQty = roundQty(remainingWholePacks * packSize);
        lot.looseBaseQty = roundQty(toFiniteQty(lot.looseBaseQty) + openedPackRemainder);
      }
      lot.availableBaseQty = roundQty(
        toFiniteQty(lot.looseBaseQty) + toFiniteQty(lot.packedBaseQty)
      );
      remainingBaseQty = roundQty(remainingBaseQty - allocatedBaseQty);
      allocations.push({
        lot,
        sourceKind: portion.sourceKind,
        allocatedBaseQty: roundQty(allocatedBaseQty),
      });
    }
  }

  return {
    allocations,
    unallocatedBaseQty: remainingBaseQty,
  };
}

function initializePhysicalLot(lot) {
  const packSize = toFiniteQty(lot?.stockPackSize) || 1;
  if (!Number.isFinite(lot.looseBaseQty) || !Number.isFinite(lot.packedBaseQty)) {
    const availableBaseQty = toFiniteQty(lot?.availableBaseQty);
    const wholePackCount = packSize > 1
      ? Math.floor((availableBaseQty + 1e-9) / packSize)
      : 0;
    lot.packedBaseQty = packSize > 1 ? roundQty(wholePackCount * packSize) : 0;
    lot.looseBaseQty = packSize > 1
      ? roundQty(availableBaseQty - lot.packedBaseQty)
      : availableBaseQty;
  }
  return packSize;
}

export function allocatePreferredPhysicalBaseQty(
  requiredBaseQty,
  lots = [],
  sourcePriority = ["base", "pack"]
) {
  let remainingBaseQty = toFiniteQty(requiredBaseQty);
  const allocations = [];
  const sourceLots = Array.isArray(lots) ? lots : [];
  sourceLots.forEach(initializePhysicalLot);

  const normalizedPriority = Array.from(new Set(
    (Array.isArray(sourcePriority) ? sourcePriority : [])
      .map((value) => String(value || "").trim().toLowerCase())
      .filter((value) => value === "base" || value === "pack")
  ));

  for (const sourceKind of normalizedPriority) {
    if (remainingBaseQty <= 0) break;
    const portionKey = sourceKind === "pack" ? "packedBaseQty" : "looseBaseQty";

    for (const lot of sourceLots) {
      if (remainingBaseQty <= 0) break;
      const packSize = initializePhysicalLot(lot);
      const availableBaseQty = toFiniteQty(lot[portionKey]);
      if (availableBaseQty <= 0) continue;

      const allocatedBaseQty = Math.min(remainingBaseQty, availableBaseQty);
      lot[portionKey] = roundQty(availableBaseQty - allocatedBaseQty);
      if (sourceKind === "pack" && packSize > 1) {
        const remainingWholePacks = Math.floor((lot.packedBaseQty + 1e-9) / packSize);
        const openedPackRemainder = roundQty(lot.packedBaseQty - (remainingWholePacks * packSize));
        lot.packedBaseQty = roundQty(remainingWholePacks * packSize);
        lot.looseBaseQty = roundQty(toFiniteQty(lot.looseBaseQty) + openedPackRemainder);
      }
      lot.availableBaseQty = roundQty(
        toFiniteQty(lot.looseBaseQty) + toFiniteQty(lot.packedBaseQty)
      );
      remainingBaseQty = roundQty(remainingBaseQty - allocatedBaseQty);
      allocations.push({
        lot,
        sourceKind,
        allocatedBaseQty: roundQty(allocatedBaseQty),
      });
    }
  }

  return {
    allocations,
    unallocatedBaseQty: remainingBaseQty,
  };
}
