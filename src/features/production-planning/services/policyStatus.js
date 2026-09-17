export const PLAN_POLICY_STATUSES = Object.freeze({
  READY: "ready",
  PARTIAL: "partial",
  BACKORDER: "backorder",
  BLOCKED: "blocked",
});

const PLAN_POLICY_STATUS_SET = new Set(Object.values(PLAN_POLICY_STATUSES));

export function normalizePlanPolicyStatus(value, fallback = PLAN_POLICY_STATUSES.READY) {
  const normalized = String(value || "").trim().toLowerCase();
  if (PLAN_POLICY_STATUS_SET.has(normalized)) {
    return normalized;
  }
  return fallback;
}

export function isConfirmedPlanPolicyStatus(value) {
  return PLAN_POLICY_STATUS_SET.has(String(value || "").trim().toLowerCase());
}
