import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = fs.readFileSync(
  path.join(repoRoot, "src/features/production-planning/components/QaSubplanWorkbenchClient.js"),
  "utf8"
);

test("automatic BOM calculation preserves manually entered WIP quantities", () => {
  assert.match(
    source,
    /regenerateSectionFromBom\(\{\s*preserveDraftLines:\s*true\s*}\)/
  );
});
