import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  createBarcodeScanQueue,
} from "../src/features/production-line/lib/barcodeScanQueue.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(testDir, "..");

test("rapid different barcodes are processed once in FIFO order", async () => {
  const queue = createBarcodeScanQueue();
  const calls = [];
  let releaseFirst;
  const firstGate = new Promise((resolve) => {
    releaseFirst = resolve;
  });

  const first = queue.enqueue("A", async (barcode) => {
    calls.push(`start:${barcode}`);
    await firstGate;
    calls.push(`end:${barcode}`);
    return barcode;
  });
  const second = queue.enqueue("B", async (barcode) => {
    calls.push(`start:${barcode}`);
    calls.push(`end:${barcode}`);
    return barcode;
  });

  assert.equal(first.accepted, true);
  assert.equal(second.accepted, true);
  await Promise.resolve();
  assert.deepEqual(calls, ["start:A"]);

  releaseFirst();
  assert.equal(await first.completion, "A");
  assert.equal(await second.completion, "B");
  assert.deepEqual(calls, ["start:A", "end:A", "start:B", "end:B"]);
});

test("a barcode already queued or processing is not accepted twice", async () => {
  const queue = createBarcodeScanQueue();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const first = queue.enqueue("  abc  ", async () => gate);
  const duplicate = queue.enqueue("ABC", async () => "duplicate");

  assert.equal(first.accepted, true);
  assert.equal(duplicate.accepted, false);
  assert.equal(queue.isPending("abc"), true);

  release("done");
  assert.equal(await first.completion, "done");
  assert.equal(queue.isPending("abc"), false);
});

test("a failed operation releases its barcode and does not block the next scan", async () => {
  const queue = createBarcodeScanQueue();
  const failed = queue.enqueue("A", async () => {
    throw new Error("network");
  });
  const next = queue.enqueue("B", async () => "saved");

  await assert.rejects(failed.completion, /network/);
  assert.equal(await next.completion, "saved");
  assert.equal(queue.isPending("A"), false);
  assert.equal(queue.isPending("B"), false);
});

test("cooldown rejects an immediate repeat after a successful scan", async () => {
  const queue = createBarcodeScanQueue({ cooldownMs: 30 });
  const first = queue.enqueue("ABC", async () => "saved");
  assert.equal(await first.completion, "saved");

  const immediateRepeat = queue.enqueue("abc", async () => "duplicate");
  assert.equal(immediateRepeat.accepted, false);

  await new Promise((resolve) => setTimeout(resolve, 35));
  const laterRepeat = queue.enqueue("ABC", async () => "saved-again");
  assert.equal(laterRepeat.accepted, true);
  assert.equal(await laterRepeat.completion, "saved-again");
});

test("stock issue page wires scanner submissions through the queue", () => {
  const source = fs.readFileSync(
    path.join(
      projectRoot,
      "src/features/production-line/components/ProductionStockIssuePageClient.js"
    ),
    "utf8"
  );

  assert.match(source, /createBarcodeScanQueue/);
  assert.match(source, /scanQueueRef\.current\.enqueue/);
  assert.match(source, /scanQueueRef\.current\.enqueue[\s\S]*createProductionStockIssueRequest/);
  assert.match(source, /scanQueueRef\.current\.enqueue[\s\S]*setBarcode\(""\)/);
});
