import assert from "node:assert/strict";
import test from "node:test";

import {
  isPwaRuntimeCacheName,
  isSunmiWrapperUserAgent,
  shouldRegisterPwaServiceWorker,
} from "../src/lib/wrapperPwaCache.js";

test("detects the Sunmi wrapper user agent token", () => {
  assert.equal(
    isSunmiWrapperUserAgent("Mozilla/5.0 Version/4.0 KPF-SUNMI-WRAPPER/1.0"),
    true,
  );
  assert.equal(isSunmiWrapperUserAgent("Mozilla/5.0 Chrome/120 Safari/537.36"), false);
});

test("does not register the PWA service worker inside the Sunmi wrapper", () => {
  assert.equal(
    shouldRegisterPwaServiceWorker("Mozilla/5.0 KPF-SUNMI-WRAPPER/1.0"),
    false,
  );
  assert.equal(shouldRegisterPwaServiceWorker("Mozilla/5.0 Chrome/120 Safari/537.36"), true);
});

test("targets only generated PWA runtime caches for wrapper cleanup", () => {
  assert.equal(isPwaRuntimeCacheName("workbox-precache-v2-https://production.kpfoods.co.th/"), true);
  assert.equal(isPwaRuntimeCacheName("static-js-assets"), true);
  assert.equal(isPwaRuntimeCacheName("next-data"), true);
  assert.equal(isPwaRuntimeCacheName("daily-work-offline-outbox"), false);
  assert.equal(isPwaRuntimeCacheName("piece-rate-offline-master"), false);
});
