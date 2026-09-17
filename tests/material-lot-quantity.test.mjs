import test from "node:test";
import assert from "node:assert/strict";
import {
  baseQtyToConventionalTradeQty,
  baseQtyToMixedTradeQty,
  conventionalPackQtyToBaseQty,
  mixedTradeQtyToBaseQty,
} from "../src/lib/materialLotQuantity.js";
import {
  allocateAvailableBaseQty,
  allocatePhysicalBaseQty,
  allocatePreferredPhysicalBaseQty,
  compareLotsByEncodedDate,
} from "../src/lib/requisitionLotAllocation.js";

test("conventionalPackQtyToBaseQty converts decimal pack balance to base quantity", () => {
  assert.equal(conventionalPackQtyToBaseQty(5.6, 5), 28);
});

test("conventional trade conversion follows ERP decimal-pack arithmetic", () => {
  assert.equal(conventionalPackQtyToBaseQty(5.3, 50), 265);
  assert.equal(conventionalPackQtyToBaseQty(13.9, 50), 695);
  assert.equal(conventionalPackQtyToBaseQty(0.22, 25), 5.5);
  assert.equal(baseQtyToConventionalTradeQty(265, 50), 5.3);
  assert.equal(baseQtyToConventionalTradeQty(100, 1), 100);
});

test("different trade units can consume one shared FIFO base-quantity pool", () => {
  const lots = [{ lotNo: "LOT-001", availableBaseQty: 150 }];
  const kgDemand = allocateAvailableBaseQty(conventionalPackQtyToBaseQty(100, 1), lots);
  const bagDemand = allocateAvailableBaseQty(conventionalPackQtyToBaseQty(5, 50), lots);

  assert.equal(kgDemand.unallocatedBaseQty, 0);
  assert.equal(lots[0].availableBaseQty, 0);
  assert.equal(bagDemand.unallocatedBaseQty, 200);
});

test("FIFO allocation exports only available stock and leaves no blank-LOT remainder row", () => {
  const lots = [{ lotNo: "LOT-001", availableBaseQty: 60 }];
  const result = allocateAvailableBaseQty(100, lots);

  assert.deepEqual(result.allocations.map((item) => ({
    lotNo: item.lot.lotNo,
    qty: item.allocatedBaseQty,
  })), [{ lotNo: "LOT-001", qty: 60 }]);
  assert.equal(result.unallocatedBaseQty, 40);
  assert.equal(lots[0].availableBaseQty, 0);
});

test("physical FIFO consumes an existing loose remainder before full packs in the same LOT", () => {
  const lots = [{ lotNo: "LOT-001", stockPackSize: 50, availableBaseQty: 280 }];
  const result = allocatePhysicalBaseQty(190, lots);

  assert.deepEqual(result.allocations.map((item) => ({
    sourceKind: item.sourceKind,
    qty: item.allocatedBaseQty,
  })), [
    { sourceKind: "base", qty: 30 },
    { sourceKind: "pack", qty: 160 },
  ]);
  assert.equal(result.unallocatedBaseQty, 0);
  assert.equal(lots[0].availableBaseQty, 90);
});

test("physical FIFO marks partial use from full packs as pack-source stock", () => {
  const lots = [{ lotNo: "LOT-001", stockPackSize: 50, availableBaseQty: 150 }];
  const result = allocatePhysicalBaseQty(130, lots);

  assert.deepEqual(result.allocations.map((item) => ({
    sourceKind: item.sourceKind,
    qty: item.allocatedBaseQty,
  })), [{ sourceKind: "pack", qty: 130 }]);
  assert.equal(lots[0].availableBaseQty, 20);
  assert.equal(lots[0].looseBaseQty, 20);
  assert.equal(lots[0].packedBaseQty, 0);
});

test("an opened-pack remainder becomes loose stock for the next request", () => {
  const lots = [{ lotNo: "LOT-001", stockPackSize: 50, availableBaseQty: 150 }];
  const first = allocatePhysicalBaseQty(30, lots);
  const second = allocatePhysicalBaseQty(100, lots);

  assert.deepEqual(first.allocations.map((item) => [item.sourceKind, item.allocatedBaseQty]), [
    ["pack", 30],
  ]);
  assert.deepEqual(second.allocations.map((item) => [item.sourceKind, item.allocatedBaseQty]), [
    ["base", 20],
    ["pack", 80],
  ]);
  assert.equal(lots[0].availableBaseQty, 20);
});

test("physical allocation keeps FIFO ahead of loose-stock preference across LOTs", () => {
  const lots = [
    { lotNo: "LOT-OLD", stockPackSize: 50, availableBaseQty: 50 },
    { lotNo: "LOT-NEW", stockPackSize: 50, availableBaseQty: 30 },
  ];
  const result = allocatePhysicalBaseQty(60, lots);

  assert.deepEqual(result.allocations.map((item) => ({
    lotNo: item.lot.lotNo,
    sourceKind: item.sourceKind,
    qty: item.allocatedBaseQty,
  })), [
    { lotNo: "LOT-OLD", sourceKind: "pack", qty: 50 },
    { lotNo: "LOT-NEW", sourceKind: "base", qty: 10 },
  ]);
});

test("hybrid FIFO reserves a requested full pack before fulfilling KG from loose LOT balances", () => {
  const lots = [
    { lotNo: "260815", stockPackSize: 25, availableBaseQty: 175 },
    { lotNo: "260803*", stockPackSize: 25, availableBaseQty: 5.6 },
    { lotNo: "260803*3", stockPackSize: 25, availableBaseQty: 3.5 },
    { lotNo: "260815*2", stockPackSize: 25, availableBaseQty: 18.45 },
  ];

  const packDemand = allocatePreferredPhysicalBaseQty(25, lots, ["pack", "base"]);
  const kgDemand = allocatePreferredPhysicalBaseQty(14, lots, ["base", "pack"]);

  assert.deepEqual(packDemand.allocations.map((item) => ({
    lotNo: item.lot.lotNo,
    sourceKind: item.sourceKind,
    qty: item.allocatedBaseQty,
  })), [
    { lotNo: "260815", sourceKind: "pack", qty: 25 },
  ]);
  assert.deepEqual(kgDemand.allocations.map((item) => ({
    lotNo: item.lot.lotNo,
    sourceKind: item.sourceKind,
    qty: item.allocatedBaseQty,
  })), [
    { lotNo: "260803*", sourceKind: "base", qty: 5.6 },
    { lotNo: "260803*3", sourceKind: "base", qty: 3.5 },
    { lotNo: "260815*2", sourceKind: "base", qty: 4.9 },
  ]);
});

test("requisition LOT order uses the YYMMDD prefix before the natural suffix", () => {
  const lots = [
    { lotNo: "260815", warehouseCode: "04" },
    { lotNo: "260803*16", warehouseCode: "04" },
    { lotNo: "260803*3", warehouseCode: "04" },
    { lotNo: "260803*", warehouseCode: "04" },
  ];

  assert.deepEqual(
    lots.sort(compareLotsByEncodedDate).map((lot) => lot.lotNo),
    ["260803*", "260803*3", "260803*16", "260815"]
  );
});

test("mixedTradeQtyToBaseQty converts 5.3 bags of 50 kg to 253 kg", () => {
  assert.equal(mixedTradeQtyToBaseQty(5.3, 50), 253);
});

test("mixedTradeQtyToBaseQty converts 0.244 bags of 25 kg to 0.244 kg", () => {
  assert.equal(mixedTradeQtyToBaseQty(0.244, 25), 0.244);
});

test("mixedTradeQtyToBaseQty converts 0.47 bags of 50 kg to 47 kg", () => {
  assert.equal(mixedTradeQtyToBaseQty(0.47, 50), 47);
});

test("mixedTradeQtyToBaseQty converts 0.3 bags of 50 kg to 3 kg", () => {
  assert.equal(mixedTradeQtyToBaseQty(0.3, 50), 3);
});

test("mixedTradeQtyToBaseQty converts 1.244 bags of 25 kg to 25.244 kg", () => {
  assert.equal(mixedTradeQtyToBaseQty(1.244, 25), 25.244);
});

test("mixedTradeQtyToBaseQty converts kg trade code without pack conversion", () => {
  assert.equal(mixedTradeQtyToBaseQty(18, 1), 18);
});

test("mixedTradeQtyToBaseQty rejects impossible remainder", () => {
  assert.throws(() => mixedTradeQtyToBaseQty(5.6, 5), /remainder exceeds pack size/);
});

test("baseQtyToMixedTradeQty converts 253 kg to 5.3 bags of 50 kg", () => {
  assert.equal(baseQtyToMixedTradeQty(253, 50), 5.3);
});

test("baseQtyToMixedTradeQty converts 0.244 kg to 0.244 bags of 25 kg", () => {
  assert.equal(baseQtyToMixedTradeQty(0.244, 25), 0.244);
});

test("baseQtyToMixedTradeQty converts 47 kg to 0.47 bags of 50 kg", () => {
  assert.equal(baseQtyToMixedTradeQty(47, 50), 0.47);
});

test("baseQtyToMixedTradeQty converts 3 kg to 0.3 bags of 50 kg", () => {
  assert.equal(baseQtyToMixedTradeQty(3, 50), 0.3);
});

test("baseQtyToMixedTradeQty keeps kg trade code unchanged", () => {
  assert.equal(baseQtyToMixedTradeQty(18, 1), 18);
});
