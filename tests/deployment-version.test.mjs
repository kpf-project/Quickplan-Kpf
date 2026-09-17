import assert from "node:assert/strict";
import test from "node:test";

import {
  hasDeploymentChanged,
  resolveDeploymentId,
} from "../src/lib/deploymentVersion.js";

test("prefers an explicitly supplied Next deployment id", () => {
  assert.equal(
    resolveDeploymentId({
      nextDeploymentId: "release-explicit",
      vercelDeploymentId: "release-vercel",
      gitSha: "abc123",
      generatedId: "release-file",
    }),
    "release-explicit",
  );
});

test("falls back through platform and generated release identifiers", () => {
  assert.equal(resolveDeploymentId({ vercelDeploymentId: "release-vercel", gitSha: "abc123" }), "release-vercel");
  assert.equal(resolveDeploymentId({ gitSha: "abc123", generatedId: "release-file" }), "abc123");
  assert.equal(resolveDeploymentId({ generatedId: "release-file" }), "release-file");
});

test("detects only a real deployment change", () => {
  assert.equal(hasDeploymentChanged("release-a", "release-b"), true);
  assert.equal(hasDeploymentChanged("release-a", "release-a"), false);
  assert.equal(hasDeploymentChanged("", "release-b"), false);
  assert.equal(hasDeploymentChanged("release-a", ""), false);
});
