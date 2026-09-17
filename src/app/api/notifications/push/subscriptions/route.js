import { ApiError, getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";

export const dynamic = "force-dynamic";

const ALLOWED_EVENT_TYPES = new Set([
  "planning.master_published",
  "planning.subplan_confirmed",
]);

function normalizeEventTypes(value) {
  if (!Array.isArray(value)) {
    return Array.from(ALLOWED_EVENT_TYPES);
  }
  const filtered = value
    .map((item) => String(item || "").trim())
    .filter((item) => ALLOWED_EVENT_TYPES.has(item));
  return filtered.length ? filtered : Array.from(ALLOWED_EVENT_TYPES);
}

function normalizeSubscription(value) {
  const endpoint = String(value?.endpoint || "").trim();
  const p256dh = String(value?.keys?.p256dh || "").trim();
  const auth = String(value?.keys?.auth || "").trim();
  if (!endpoint || !p256dh || !auth) {
    throw new ApiError(400, "Invalid push subscription");
  }
  return { endpoint, p256dh, auth };
}

async function requirePlanningUser(request) {
  return requirePermissionKeys(request, [
    "production-line-planning-view",
    "production-line-planning-manage",
  ]);
}

export async function GET(request) {
  try {
    const permission = await requirePlanningUser(request);
    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("web_push_subscriptions")
      .select("id,endpoint,event_types,enabled,last_seen_at,revoked_at,updated_at")
      .eq("user_id", permission.userId)
      .eq("enabled", true)
      .is("revoked_at", null)
      .order("updated_at", { ascending: false });

    if (error) {
      throw new ApiError(500, "Failed to load push subscriptions", error.message);
    }

    return Response.json({ ok: true, data: data || [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const permission = await requirePlanningUser(request);
    const body = await readJson(request);
    const subscription = normalizeSubscription(body?.subscription);
    const eventTypes = normalizeEventTypes(body?.eventTypes);
    const now = new Date().toISOString();

    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("web_push_subscriptions")
      .upsert(
        {
          user_id: permission.userId,
          endpoint: subscription.endpoint,
          p256dh: subscription.p256dh,
          auth: subscription.auth,
          event_types: eventTypes,
          enabled: true,
          revoked_at: null,
          last_error: null,
          user_agent: request.headers.get("user-agent") || null,
          last_seen_at: now,
          updated_at: now,
        },
        { onConflict: "endpoint" }
      )
      .select("id,endpoint,event_types,enabled,last_seen_at")
      .maybeSingle();

    if (error) {
      throw new ApiError(500, "Failed to save push subscription", error.message);
    }

    return Response.json({ ok: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request) {
  try {
    const permission = await requirePlanningUser(request);
    const body = await request.json().catch(() => ({}));
    const endpoint = String(body?.endpoint || "").trim();
    const db = getSupabaseAdmin();
    let query = db
      .from("web_push_subscriptions")
      .update({
        enabled: false,
        revoked_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", permission.userId);

    if (endpoint) {
      query = query.eq("endpoint", endpoint);
    } else {
      query = query.eq("enabled", true);
    }

    const { error } = await query;
    if (error) {
      throw new ApiError(500, "Failed to disable push subscription", error.message);
    }

    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
