import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const gatewaySource = fs.readFileSync(
  path.join(repoRoot, "kpf-api-gateway", "server.js"),
  "utf8"
);
const parseDateParamSource = gatewaySource.match(
  /function parseDateParam\(value\) \{[\s\S]*?\n\}/
);

test("keeps a YYYY-MM-DD gateway date on the same calendar day", () => {
  assert.ok(parseDateParamSource, "parseDateParam must exist in the gateway");
  const parseDateParam = new Function(
    `${parseDateParamSource[0]}; return parseDateParam;`
  )();

  assert.equal(
    parseDateParam("2026-07-15").toISOString().slice(0, 10),
    "2026-07-15"
  );
});
