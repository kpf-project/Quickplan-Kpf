import assert from "node:assert/strict";
import test from "node:test";

import {
  attemptRuntimeRecovery,
  buildRuntimeReloadUrl,
  getRuntimeRecoveryKey,
  isDeploymentRuntimeError,
  shouldCheckRuntimeVersion,
} from "../src/lib/wrapperRuntimeRecovery.js";

function createFakeWrapperWindow() {
  const values = new Map();
  const replaced = [];
  return {
    navigator: { userAgent: "Mozilla/5.0 KPF-SUNMI-WRAPPER/1.0" },
    location: {
      href: "https://production.kpfoods.co.th/production-line/attendance/piece-rate-scan",
      replace(url) {
        replaced.push(url);
      },
    },
    sessionStorage: {
      getItem(key) {
        return values.get(key) || null;
      },
      setItem(key, value) {
        values.set(key, value);
      },
    },
    replaced,
  };
}

test("recognizes deployment and chunk runtime failures", () => {
  assert.equal(isDeploymentRuntimeError(new Error("ChunkLoadError: Loading chunk 123 failed")), true);
  assert.equal(
    isDeploymentRuntimeError(new TypeError("__webpack_modules__[moduleId] is not a function")),
    true,
  );
  assert.equal(
    isDeploymentRuntimeError(new Error("Failed to fetch dynamically imported module")),
    true,
  );
});

test("does not reload for ordinary application errors", () => {
  assert.equal(isDeploymentRuntimeError(new Error("Employee code is required")), false);
  assert.equal(isDeploymentRuntimeError({ message: "Request failed", status: 500 }), false);
});

test("scopes one-shot recovery to the deployment id", () => {
  assert.equal(getRuntimeRecoveryKey("release-123"), "kpf-wrapper-runtime-recovery:release-123");
  assert.equal(getRuntimeRecoveryKey(""), "kpf-wrapper-runtime-recovery:unknown");
});

test("builds a same-page hard reload URL with the current deployment", () => {
  assert.equal(
    buildRuntimeReloadUrl(
      "https://production.kpfoods.co.th/production-line/attendance/piece-rate-scan?mode=single#scan",
      "release-123",
    ),
    "https://production.kpfoods.co.th/production-line/attendance/piece-rate-scan?mode=single&__kpf_dpl=release-123#scan",
  );
});

test("checks runtime version only for the wrapper scan page", () => {
  const wrapperUa = "Mozilla/5.0 KPF-SUNMI-WRAPPER/1.0";
  assert.equal(
    shouldCheckRuntimeVersion(wrapperUa, "/production-line/attendance/piece-rate-scan"),
    true,
  );
  assert.equal(shouldCheckRuntimeVersion(wrapperUa, "/production-line/planning"), false);
  assert.equal(
    shouldCheckRuntimeVersion("Mozilla/5.0 Chrome/149", "/production-line/attendance/piece-rate-scan"),
    false,
  );
});

test("hard reloads a wrapper only once for each deployment", async () => {
  const fakeWindow = createFakeWrapperWindow();
  const error = new Error("ChunkLoadError: Loading chunk 123 failed");
  let cleanupCount = 0;
  const cleanup = async () => {
    cleanupCount += 1;
  };

  assert.equal(await attemptRuntimeRecovery(fakeWindow, { error, deploymentId: "release-123", cleanup }), true);
  assert.equal(await attemptRuntimeRecovery(fakeWindow, { error, deploymentId: "release-123", cleanup }), false);
  assert.equal(cleanupCount, 1);
  assert.deepEqual(fakeWindow.replaced, [
    "https://production.kpfoods.co.th/production-line/attendance/piece-rate-scan?__kpf_dpl=release-123",
  ]);
});

test("does not hard reload for an ordinary wrapper application error", async () => {
  const fakeWindow = createFakeWrapperWindow();
  assert.equal(
    await attemptRuntimeRecovery(fakeWindow, {
      error: new Error("Employee code is required"),
      deploymentId: "release-123",
      cleanup: async () => {},
    }),
    false,
  );
  assert.deepEqual(fakeWindow.replaced, []);
});
