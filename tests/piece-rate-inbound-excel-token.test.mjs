import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { verifyInboundExcelToken } from "../src/lib/inboundExcelToken.js";

test("Excel token permits only the inbound report and requires a matching hash", () => {
  const token = "test-only-token-with-enough-random-length";
  const hash = createHash("sha256").update(token).digest("hex");
  assert.equal(verifyInboundExcelToken(token, hash, "inbound", "csv"), true);
  assert.equal(verifyInboundExcelToken("wrong-token", hash, "inbound", "csv"), false);
  assert.equal(verifyInboundExcelToken(token, hash, "issue", "csv"), false);
  assert.equal(verifyInboundExcelToken(token, hash, "inbound", "json"), false);
  assert.equal(verifyInboundExcelToken(token, "", "inbound", "csv"), false);
});
