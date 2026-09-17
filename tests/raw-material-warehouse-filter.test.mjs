import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("raw material stock queries include ERP storage location 02", async () => {
  const serverSource = await readFile(new URL("../kpf-api-gateway/server.js", import.meta.url), "utf8");
  const filterMatches = serverSource.match(/WARELOCATION\.WL_CODE IN \('OL', '1', '02'\)/g) ?? [];

  assert.equal(filterMatches.length, 4);
});
