import crypto from "node:crypto";

async function resolveSupabaseAdmin(customAdmin) {
  if (customAdmin) return customAdmin;
  try {
    const { getSupabaseAdmin } = await import("../../../lib/adminApi.js");
    return getSupabaseAdmin();
  } catch {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (url && key) {
      try {
        const { createClient } = await import("@supabase/supabase-js");
        return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
      } catch {
        return null;
      }
    }
    return null;
  }
}

const SETTINGS_KEY_EXEMPLARS = "ai_assistant.verified_exemplars";

// Cached exemplars in memory with 5-minute TTL to keep requests snappy & 100% free
let CACHED_EXEMPLARS = null;
let CACHE_EXPIRES_AT = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Patterns in AI text indicating inability to answer or missing data
 */
const UNANSWERED_PHRASES = [
  "ไม่พบแผนก",
  "ไม่พบข้อมูล",
  "ไม่พบรายการ",
  "ไม่สามารถตอบได้",
  "ไม่สามารถยืนยัน",
  "ไม่ขอเดาตัวเลข",
  "ไม่มีสิทธิ์เข้าถึง",
  "ACCESS_DENIED",
  "เกิดข้อผิดพลาดในการประมวลผล",
  "กระบวนการประมวลผลคำสั่งใช้เวลานานเกินกำหนด",
  "ไม่พบสูตร",
  "ไม่พบสินค้า",
];

/**
 * Analyze chat execution result to detect gaps, failures, or ambiguities
 * @param {Object} params
 * @param {string} params.query - User question
 * @param {string} params.responseMessage - AI answer
 * @param {Array} params.executedTools - Array of tools invoked
 * @param {boolean} params.isFallback - Whether offline fallback was used
 * @returns {Object} { isGap: boolean, outcome: string, reason: string, details: Object }
 */
export function detectQueryOutcome({
  query = "",
  responseMessage = "",
  executedTools = [],
  isFallback = false,
}) {
  const qClean = String(query || "").trim();
  const resClean = String(responseMessage || "").trim();

  // 1. Check for failed tools
  const failedTool = executedTools.find((t) => t.success === false || Boolean(t.error));
  if (failedTool) {
    return {
      isGap: true,
      outcome: "tool_error",
      reason: failedTool.error || `TOOL_FAILED_${failedTool.tool}`,
      details: {
        tool: failedTool.tool,
        error: failedTool.error,
        args: failedTool.args,
      },
    };
  }

  // 2. Check for explicit unanswered / missing data indicators
  for (const phrase of UNANSWERED_PHRASES) {
    if (resClean.includes(phrase)) {
      let specificReason = "DATA_NOT_FOUND_OR_UNANSWERED";
      if (resClean.includes("ไม่ขอเดาตัวเลข")) specificReason = "ZERO_HALLUCINATION_GUARD_TRIGGERED";
      else if (resClean.includes("ไม่พบแผนก")) specificReason = "DEPARTMENT_NOT_FOUND";
      else if (resClean.includes("ไม่มีสิทธิ์") || resClean.includes("ACCESS_DENIED")) specificReason = "ACCESS_DENIED";
      else if (resClean.includes("ไม่พบสูตร")) specificReason = "BOM_FORMULA_NOT_FOUND";
      else if (resClean.includes("ไม่พบสินค้า")) specificReason = "PRODUCT_NOT_FOUND";

      return {
        isGap: true,
        outcome: "unanswered",
        reason: specificReason,
        details: { matchedPhrase: phrase },
      };
    }
  }

  // 3. Check for Fallback activation
  if (isFallback) {
    return {
      isGap: true,
      outcome: "fallback_activated",
      reason: "GEMINI_API_FALLBACK_TRIGGERED",
      details: { isFallback: true },
    };
  }

  // 4. Successful answer
  return {
    isGap: false,
    outcome: "success",
    reason: "NORMAL_RESOLUTION",
    details: {},
  };
}

/**
 * Record Telemetry for user question silently in background
 * Does not throw errors to prevent interrupting user chat
 * @param {Object} params
 */
export async function logQueryTelemetrySilently({
  userContext,
  userQuery,
  responseMessage,
  executedTools = [],
  isFallback = false,
}) {
  try {
    const outcomeAnalysis = detectQueryOutcome({
      query: userQuery,
      responseMessage,
      executedTools,
      isFallback,
    });

    const supabaseAdmin = await resolveSupabaseAdmin();
    if (!supabaseAdmin) return;

    const recordId = crypto.randomUUID();
    const action = outcomeAnalysis.isGap ? "ai_query_gap" : "ai_query_resolved";

    const payload = {
      user_id: userContext?.userId || null,
      username: userContext?.username || "anonymous",
      user_role: userContext?.roles?.join(",") || (userContext?.isAdmin ? "admin" : "user"),
      user_query: String(userQuery || "").slice(0, 1000),
      outcome: outcomeAnalysis.outcome,
      failure_reason: outcomeAnalysis.reason,
      response_snippet: String(responseMessage || "").slice(0, 500),
      tools_invoked: executedTools.map((t) => ({
        tool: t.tool,
        success: t.success,
        error: t.error || null,
      })),
      details: outcomeAnalysis.details,
      timestamp: new Date().toISOString(),
    };

    // Non-blocking write to audit_logs
    await supabaseAdmin.from("audit_logs").insert({
      actor_id: userContext?.userId || null,
      action,
      target_table: "ai_assistant",
      target_id: recordId,
      metadata: payload,
    });
  } catch (err) {
    // Silent catch: logging must never crash the assistant
    console.warn("[aiTelemetryService] Silent logging error:", err?.message || err);
  }
}

/**
 * Fetch verified QA exemplars curated by Admins/Supervisors
 * Stored in `system_settings` table under `ai_assistant.verified_exemplars`
 * @param {boolean} forceRefresh
 * @returns {Promise<Array<{question: string, answer: string, category: string}>>}
 */
export async function getVerifiedExemplars(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && CACHED_EXEMPLARS && now < CACHE_EXPIRES_AT) {
    return CACHED_EXEMPLARS;
  }

  try {
    const supabaseAdmin = await resolveSupabaseAdmin();
    if (!supabaseAdmin) return [];

    const { data, error } = await supabaseAdmin
      .from("system_settings")
      .select("setting_value")
      .eq("setting_key", SETTINGS_KEY_EXEMPLARS)
      .maybeSingle();

    if (error || !data || !Array.isArray(data.setting_value?.exemplars)) {
      CACHED_EXEMPLARS = [];
      CACHE_EXPIRES_AT = now + CACHE_TTL_MS;
      return [];
    }

    CACHED_EXEMPLARS = data.setting_value.exemplars;
    CACHE_EXPIRES_AT = now + CACHE_TTL_MS;
    return CACHED_EXEMPLARS;
  } catch (err) {
    console.warn("[aiTelemetryService] Failed to load verified exemplars:", err?.message || err);
    return [];
  }
}

/**
 * Save or update verified exemplars (Admin Only)
 * @param {Array} exemplars
 * @param {string} updatedByUserId
 */
export async function saveVerifiedExemplars(exemplars, updatedByUserId) {
  if (!Array.isArray(exemplars)) {
    throw new Error("exemplars must be an array");
  }

  const supabaseAdmin = await resolveSupabaseAdmin();
  if (!supabaseAdmin) throw new Error("Supabase Admin client not available");

  const isUUID = updatedByUserId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(updatedByUserId);

  const { error } = await supabaseAdmin.from("system_settings").upsert({
    setting_key: SETTINGS_KEY_EXEMPLARS,
    setting_value: {
      exemplars: exemplars.slice(0, 500), // Cap at 500 verified pairs
      updated_at: new Date().toISOString(),
    },
    updated_by: isUUID ? updatedByUserId : null,
  });

  if (error) {
    throw new Error(`Failed to save exemplars: ${error.message}`);
  }

  // Invalidate cache immediately
  CACHED_EXEMPLARS = exemplars;
  CACHE_EXPIRES_AT = Date.now() + CACHE_TTL_MS;
  return true;
}

/**
 * Retrieve recent query gaps for Admin Review Dashboard
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function getQueryGapsForReview(limit = 50) {
  const supabaseAdmin = await resolveSupabaseAdmin();
  if (!supabaseAdmin) return [];

  const { data, error } = await supabaseAdmin
    .from("audit_logs")
    .select("id, actor_id, target_id, metadata, created_at")
    .eq("action", "ai_query_gap")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[aiTelemetryService] Error fetching query gaps:", error.message);
    return [];
  }

  return (data || []).map((row) => ({
    id: row.id,
    targetId: row.target_id,
    createdAt: row.created_at,
    userQuery: row.metadata?.user_query || "",
    outcome: row.metadata?.outcome || "unanswered",
    failureReason: row.metadata?.failure_reason || "UNKNOWN",
    username: row.metadata?.username || "unknown",
    userRole: row.metadata?.user_role || "user",
    toolsInvoked: row.metadata?.tools_invoked || [],
    responseSnippet: row.metadata?.response_snippet || "",
    details: row.metadata?.details || {},
  }));
}
