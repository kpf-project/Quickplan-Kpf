import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../src/features/raw-materials/components/RawMaterialsPageClient.js", import.meta.url),
  "utf8"
);

test("summary grid header is hidden while there are no rows", () => {
  assert.match(source, /summaryRows\.length > 0\s*\? \{\s*display: "grid"/);
  assert.match(source, /:\s*\{ display: "none" \}/);
});
