import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const repoRoot = path.resolve(import.meta.dirname, "..");
const bitmapServicePath = path.join(
  repoRoot,
  "src",
  "features",
  "production-line",
  "services",
  "weightScaleLabelBitmap.js"
);

test("weight scale bitmap keeps white background as one bits for TSC BITMAP", () => {
  const source = fs.readFileSync(bitmapServicePath, "utf8");

  assert.match(
    source,
    /new Uint8Array\(widthBytes \* height\)\.fill\(0xff\)/,
    "The bitmap buffer must default to white pixels."
  );
  assert.match(
    source,
    /bitmap\[byteIndex\] &= ~\(0x80 >> \(x % 8\)\)/,
    "Only black pixels should clear a bit."
  );
  assert.doesNotMatch(
    source,
    /bitmap\[byteIndex\] \|= 0x80 >> \(x % 8\)/,
    "Setting black pixels to one inverts TSC BITMAP output."
  );
});

test("weight scale bitmap uses compact fonts and separated barcode text", () => {
  const source = fs.readFileSync(bitmapServicePath, "utf8");

  assert.match(source, /ctx\.font = "30px Arial, Tahoma, sans-serif"/);
  assert.match(source, /"bold 38px Arial, Tahoma, sans-serif"/);
  assert.match(source, /"36px Arial, Tahoma, sans-serif"/);
  assert.match(source, /ctx\.font = "bold 56px Arial, Tahoma, sans-serif"/);
  assert.match(source, /height: 58/);
  assert.match(source, /ctx\.drawImage\(barcodeCanvas, 146, 292, 348, 58\)/);
  assert.match(source, /ctx\.font = "32px Arial, Tahoma, sans-serif"/);
  assert.match(source, /ctx\.fillText\(barcodeValue, 320, 386\)/);
});

test("weight scale label provides native hardware Code 128 barcode configuration for local-print-agent", () => {
  const source = fs.readFileSync(bitmapServicePath, "utf8");

  assert.match(source, /nativeBarcode:\s*\{/);
  assert.match(source, /type:\s*"128"/);
  assert.match(source, /height:\s*64/);
  assert.match(source, /narrow:\s*2/);
  assert.match(source, /wide:\s*4/);
});

test("weight scale label embeds Code 128 in the bitmap by default", () => {
  const source = fs.readFileSync(bitmapServicePath, "utf8");

  assert.match(source, /useNativeBarcode = false/);
  assert.match(source, /if \(!useNativeBarcode\)\s*\{\s*ctx\.drawImage\(barcodeCanvas, 146, 292, 348, 58\)/);
});
