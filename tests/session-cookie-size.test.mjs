import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import crypto from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";

test("large permission sessions fit a browser cookie without losing any grants", () => {
  const context = vm.createContext({ crypto, Buffer, deflateRawSync, inflateRawSync, process: { env: { AUTH_SESSION_SECRET: "test-only-key" } } });
  const source = readFileSync("src/lib/sessionToken.js", "utf8").replace(/^import .*;\r?\n/gm, "").replace(/^export /gm, "");
  vm.runInContext(source + "\nthis.api={createSessionToken,verifySessionToken};", context);
  const permissions = Array.from({ length: 200 }, (_, i) => `production-line-permission-detailed-action-${i}`);
  const token = context.api.createSessionToken({ userId: "qa-user", sessionId: "qa-session", isAdmin: true, permissions });
  assert.ok(Buffer.byteLength(`kpf-session=${token}`) < 3800, `cookie is ${token.length} bytes`);
  const parsed = context.api.verifySessionToken(token);
  assert.deepEqual([...parsed.permissions], permissions);
  assert.equal(parsed.sessionId, "qa-session");
  assert.equal(context.api.verifySessionToken(token + "tampered"), null);
  const legacy = context.api.createSessionToken({ userId: "qa-user", sessionId: "old-session", permissions: ["view"] });
  assert.deepEqual([...context.api.verifySessionToken(legacy).permissions], ["view"]);
});
