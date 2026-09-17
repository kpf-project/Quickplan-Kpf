function normalizeDeploymentId(value) {
  return String(value || "").trim();
}

export function resolveDeploymentId({
  nextDeploymentId,
  vercelDeploymentId,
  gitSha,
  generatedId,
} = {}) {
  return [nextDeploymentId, vercelDeploymentId, gitSha, generatedId]
    .map(normalizeDeploymentId)
    .find(Boolean) || "development";
}

export function hasDeploymentChanged(currentId, nextId) {
  const normalizedCurrent = normalizeDeploymentId(currentId);
  const normalizedNext = normalizeDeploymentId(nextId);
  return Boolean(
    normalizedCurrent
    && normalizedNext
    && normalizedCurrent !== normalizedNext,
  );
}
