import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(import.meta.dirname, "..");

test("local print agent defaults to 80x50 mm labels", () => {
  const configPath = path.join(repoRoot, "local-print-agent", "config.example.json");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

  assert.equal(config.paper.widthMm, 80);
  assert.equal(config.paper.heightMm, 50);
});

test("weight scale print payloads use 80x50 mm labels", () => {
  const servicePath = path.join(
    repoRoot,
    "src",
    "features",
    "production-line",
    "services",
    "weightScaleReceiptLabel.js"
  );
  const source = fs.readFileSync(servicePath, "utf8");

  assert.match(source, /LABEL_WIDTH_MM\s*=\s*80/);
  assert.doesNotMatch(source, /LABEL_WIDTH_MM\s*=\s*85/);
  assert.match(source, /LABEL_HEIGHT_MM\s*=\s*50/);
  assert.match(source, /LABEL_SYMBOLOGY\s*=\s*"CODE128"/);
});

test("WebUSB TSPL builder defaults to 80x50 mm labels", () => {
  const servicePath = path.join(
    repoRoot,
    "src",
    "features",
    "production-line",
    "services",
    "webUsbPrinter.js"
  );
  const source = fs.readFileSync(servicePath, "utf8");

  assert.match(source, /:\s*80;/);
  assert.doesNotMatch(source, /:\s*85;/);
  assert.match(source, /:\s*50;/);
});
