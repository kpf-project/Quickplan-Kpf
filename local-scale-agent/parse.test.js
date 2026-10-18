const assert = require("node:assert/strict");
const { createWeighingCycleTracker, parseReadingLine } = require("./server.js");

const cases = [
  {
    name: "Defender 3000 ST,GS kg frame",
    input: "ST,GS,+   1.234 kg",
    expected: { weightKg: 1.234, unit: "kg", stable: true },
  },
  {
    name: "Defender 3000 US,NT gram frame",
    input: "US,NT,-  0.002 g",
    expected: { weightKg: -0.000002, unit: "g", stable: false },
  },
  {
    name: "plain weight line",
    input: "  15.20 kg",
    expected: { weightKg: 15.2, unit: "kg", stable: null },
  },
  {
    name: "lowercase stability tokens are accepted",
    input: "st,gs,+   2.500 kg",
    expected: { weightKg: 2.5, unit: "kg", stable: true },
  },
  {
    name: "negative kg without stability token",
    input: "-0.500 kg",
    expected: { weightKg: -0.5, unit: "kg", stable: null },
  },
  {
    name: "garbage line does not crash",
    input: "\u001f\u0000??hello",
    expected: { weightKg: null, unit: null, stable: null },
  },
  {
    name: "empty line",
    input: "",
    expected: { weightKg: null, unit: null, stable: null },
  },
  {
    name: "number without unit assumes kg",
    input: "   2.750",
    expected: { weightKg: 2.75, unit: null, stable: null },
  },
  {
    name: "OHAUS Continuous mode gross reading (0.45 G)",
    input: "    0.45       G",
    expected: { weightKg: 0.45, unit: null, stable: null },
  },
  {
    name: "OHAUS Continuous mode gross reading (15.00 G)",
    input: "   15.00       G",
    expected: { weightKg: 15, unit: null, stable: null },
  },
];

for (const testCase of cases) {
  const actual = parseReadingLine(testCase.input);

  if (testCase.expected.weightKg === null) {
    assert.equal(actual.weightKg, null, `${testCase.name}: weightKg`);
  } else {
    assert.ok(
      Math.abs(actual.weightKg - testCase.expected.weightKg) < 1e-9,
      `${testCase.name}: weightKg expected ${testCase.expected.weightKg}, got ${actual.weightKg}`
    );
  }

  assert.equal(actual.unit, testCase.expected.unit, `${testCase.name}: unit`);
  assert.equal(actual.stable, testCase.expected.stable, `${testCase.name}: stable`);
  assert.equal(actual.raw, testCase.input, `${testCase.name}: raw`);

  console.log(`ok - ${testCase.name}`);
}

console.log(`\n${cases.length} parser tests passed.`);

const cycleIds = ["cycle-a", "cycle-b"];
const trackCycle = createWeighingCycleTracker({
  createId: () => cycleIds.shift(),
});
assert.equal(trackCycle(0), null, "zero weight has no cycle");
assert.equal(trackCycle(10), "cycle-a", "first item starts a cycle");
assert.equal(trackCycle(10.001), "cycle-a", "the same item keeps its cycle");
assert.equal(trackCycle(0.04), null, "clearing the scale ends the cycle");
assert.equal(trackCycle(8), "cycle-b", "the next item starts a new cycle");
console.log("ok - weighing cycle remains unique until the scale is cleared");
