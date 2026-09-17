import assert from "node:assert/strict";
import test from "node:test";

import {
  SESSION_REFRESH_INTERVAL_MS,
  shouldRefreshSession,
} from "../src/lib/sessionRefreshPolicy.js";

test("refreshes an authenticated visible online session", () => {
  assert.equal(
    shouldRefreshSession({ pathname: "/production-line", visible: true, online: true, inFlight: false }),
    true,
  );
});

test("does not refresh while hidden, offline, in flight, or on a public page", () => {
  assert.equal(shouldRefreshSession({ pathname: "/production-line", visible: false, online: true, inFlight: false }), false);
  assert.equal(shouldRefreshSession({ pathname: "/production-line", visible: true, online: false, inFlight: false }), false);
  assert.equal(shouldRefreshSession({ pathname: "/production-line", visible: true, online: true, inFlight: true }), false);
  assert.equal(shouldRefreshSession({ pathname: "/login", visible: true, online: true, inFlight: false }), false);
});

test("refresh interval stays comfortably below the wrapper session ttl", () => {
  assert.equal(SESSION_REFRESH_INTERVAL_MS, 15 * 60 * 1000);
  assert.ok(SESSION_REFRESH_INTERVAL_MS < 12 * 60 * 60 * 1000);
});
