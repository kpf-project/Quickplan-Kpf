import "server-only";

import webpush from "web-push";

const PLANNING_EVENT_TYPES = new Set([
  "planning.master_published",
  "planning.subplan_confirmed",
  "planning.material_check_requested",
  "planning.material_check_accepted",
  "planning.material_check_rejected"
]);

let vapidConfigured = false;

function getVapidConfig() {
  const publicKey = process.env.WEB_PUSH_VAPID_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_VAPID_PRIVATE_KEY;
  const subject = process.env.WEB_PUSH_VAPID_SUBJECT || process.env.NEXT_PUBLIC_BASE_URL || "mailto:admin@example.com";

  return { publicKey, privateKey, subject };
}

function configureVapid() {
  if (vapidConfigured) return true;
  const { publicKey, privateKey, subject } = getVapidConfig();
  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(subject, publicKey, privateKey);
  vapidConfigured = true;
  return true;
}

function buildSubscription(row) {
  return {
    endpoint: row.endpoint,
    keys: {
      p256dh: row.p256dh,
      auth: row.auth,
    },
  };
}

function canReceiveEvent(row, eventType) {
  if (!eventType) return true;
  const eventTypes = Array.isArray(row.event_types) ? row.event_types : [];
  if (eventTypes.length === 0) return true;
  return eventTypes.includes(eventType);
}

async function markSubscriptionFailed(db, row, error) {
  const statusCode = Number(error?.statusCode || 0);
  const shouldDisable = statusCode === 404 || statusCode === 410;
  await db
    .from("web_push_subscriptions")
    .update({
      enabled: shouldDisable ? false : row.enabled,
      revoked_at: shouldDisable ? new Date().toISOString() : row.revoked_at,
      last_error: String(error?.body || error?.message || error || "Push delivery failed").slice(0, 1000),
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);
}

export function getPublicVapidKey() {
  return getVapidConfig().publicKey || "";
}

export async function sendPlanningPushNotification(db, eventType, payload, options = {}) {
  if (!PLANNING_EVENT_TYPES.has(eventType)) {
    return { ok: false, skipped: true, reason: "unsupported_event_type" };
  }
  if (!configureVapid()) {
    return { ok: false, skipped: true, reason: "missing_vapid_env" };
  }

  const query = db
    .from("web_push_subscriptions")
    .select("id,user_id,endpoint,p256dh,auth,event_types,enabled,revoked_at")
    .eq("enabled", true)
    .is("revoked_at", null);

  const userIds = Array.isArray(options.userIds)
    ? options.userIds.filter(Boolean)
    : [];
  if (userIds.length > 0) {
    query.in("user_id", userIds);
  }

  const { data, error } = await query;
  if (error) {
    return { ok: false, error: error.message };
  }

  const rows = (data || []).filter((row) => canReceiveEvent(row, eventType));
  const body = JSON.stringify({
    tag: eventType,
    renotify: true,
    ...payload,
    data: {
      eventType,
      ...(payload?.data || {}),
    },
  });

  const results = await Promise.allSettled(
    rows.map((row) =>
      webpush.sendNotification(buildSubscription(row), body, {
        TTL: 60 * 60 * 8,
        urgency: "high",
        topic: eventType.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 32),
      })
    )
  );

  await Promise.all(
    results.map((result, index) => {
      if (result.status === "fulfilled") return Promise.resolve();
      return markSubscriptionFailed(db, rows[index], result.reason);
    })
  );

  return {
    ok: true,
    attempted: rows.length,
    sent: results.filter((result) => result.status === "fulfilled").length,
    failed: results.filter((result) => result.status === "rejected").length,
  };
}
