import { getSupabaseAdmin, requireAdmin } from "@/lib/adminApi";
import { buildClientDiagnostic, sanitizeDiagnosticText } from "@/lib/clientDiagnosticsShared";
import { getSessionFromRequest, isWrapperRequest } from "@/lib/sessionToken";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 64 * 1024;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX = 60;
const rateLimitBuckets = new Map();

function resolveClientKey(request) {
  return request.headers.get("cf-connecting-ip")
    || request.headers.get("x-forwarded-for")?.split(",", 1)[0]
    || "unknown";
}

function isRateLimited(key) {
  const now = Date.now();
  const existing = rateLimitBuckets.get(key);
  if (!existing || now - existing.startedAt >= RATE_LIMIT_WINDOW_MS) {
    rateLimitBuckets.set(key, { startedAt: now, count: 1 });
    return false;
  }
  existing.count += 1;
  return existing.count > RATE_LIMIT_MAX;
}

function isValidIncidentId(value) {
  return /^WEB-\d{8}-\d{6}-[A-Z0-9]{6}$/.test(String(value || ""));
}

export async function POST(request) {
  if (request.headers.get("x-kpf-diagnostics") !== "1") {
    return Response.json({ error: "Invalid diagnostics request" }, { status: 400 });
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return Response.json({ error: "Payload too large" }, { status: 413 });
  }

  let rawPayload;
  try {
    rawPayload = await request.json();
  } catch {
    return Response.json({ error: "Invalid diagnostics payload" }, { status: 400 });
  }

  if (!isValidIncidentId(rawPayload?.incidentId)) {
    return Response.json({ error: "Invalid incident id" }, { status: 400 });
  }

  const session = getSessionFromRequest(request);
  if (!session && !isWrapperRequest(request)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const clientKey = resolveClientKey(request);
  if (isRateLimited(clientKey)) {
    return Response.json({ error: "Too many diagnostics" }, { status: 429 });
  }

  const payload = buildClientDiagnostic(rawPayload);
  const occurredAt = new Date(payload.occurredAt);
  if (Number.isNaN(occurredAt.getTime())) {
    return Response.json({ error: "Invalid occurrence time" }, { status: 400 });
  }

  const userAgent = sanitizeDiagnosticText(request.headers.get("user-agent") || "", 1_000);
  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin
    .from("client_runtime_diagnostics")
    .upsert({
      incident_id: payload.incidentId,
      event_type: payload.eventType,
      severity: payload.severity,
      message: payload.message,
      stack: payload.stack || null,
      digest: payload.digest || null,
      pathname: payload.pathname || null,
      deployment_id: payload.deploymentId || null,
      device_id: payload.deviceId || null,
      user_id: session?.userId || null,
      user_agent: userAgent || null,
      occurred_at: occurredAt.toISOString(),
      metadata: payload.metadata,
    }, {
      onConflict: "incident_id",
      ignoreDuplicates: true,
    });

  if (error) {
    return Response.json({
      error: "Unable to store diagnostics",
      ...(process.env.NODE_ENV === "development" ? {
        details: {
          code: error.code || "",
          message: sanitizeDiagnosticText(error.message || "", 1_000),
        },
      } : {}),
    }, { status: 500 });
  }

  return Response.json({ ok: true, incidentId: payload.incidentId }, { status: 202 });
}

export async function GET(request) {
  await requireAdmin(request);
  const { searchParams } = new URL(request.url);
  const incidentId = String(searchParams.get("incidentId") || "").trim();
  const parsedLimit = Number.parseInt(searchParams.get("limit") || "100", 10);
  const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), 200) : 100;

  const supabaseAdmin = getSupabaseAdmin();
  let query = supabaseAdmin
    .from("client_runtime_diagnostics")
    .select("id, incident_id, event_type, severity, message, stack, digest, pathname, deployment_id, device_id, user_id, user_agent, occurred_at, metadata, created_at")
    .order("occurred_at", { ascending: false })
    .limit(limit);

  if (incidentId) {
    query = query.eq("incident_id", incidentId);
  }

  const { data, error } = await query;
  if (error) {
    return Response.json({ error: "Unable to load diagnostics" }, { status: 500 });
  }
  return Response.json({ diagnostics: data || [] });
}
