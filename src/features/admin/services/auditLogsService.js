import { ApiError, getSupabaseAdmin, requireAdmin } from "@/lib/adminApi";

function parseNumber(value, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
}

function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const json = Buffer.from(String(cursor), "base64url").toString("utf8");
    const parsed = JSON.parse(json);
    const createdAt = typeof parsed?.created_at === "string" ? parsed.created_at : "";
    const id = typeof parsed?.id === "string" ? parsed.id : "";
    if (!createdAt || !id) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

function encodeCursor(row) {
  const payload = {
    created_at: row?.created_at || "",
    id: row?.id || "",
  };
  return Buffer.from(JSON.stringify(payload)).toString("base64url");
}

export async function listAuditLogs(request) {
  await requireAdmin(request);
  const { searchParams } = new URL(request.url);
  const page = parseNumber(searchParams.get("page"), 1);
  const pageSize = Math.min(parseNumber(searchParams.get("pageSize"), 50), 200);
  const cursor = decodeCursor(searchParams.get("cursor"));
  const search = (searchParams.get("search") || "").trim().toLowerCase();
  const type = (searchParams.get("type") || "").trim().toLowerCase();

  const typeMap = {
    auth: ["auth."],
    user: ["user."],
    bom: ["bom."],
    approval: ["bom.approval."],
    production: ["production-plan."],
    category: ["production-category.", "production-category-product."],
    role: ["role."],
    permission: ["permission."],
    approver: ["approver."],
  };
  const prefixes = typeMap[type] || null;

  const supabaseAdmin = getSupabaseAdmin();
  let query = supabaseAdmin
    .from("audit_logs")
    .select("id, actor_id, action, target_table, target_id, metadata, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (prefixes && prefixes.length) {
    const orParts = prefixes.map((prefix) => `action.ilike.${prefix}%`).join(",");
    query = query.or(orParts);
  }

  if (cursor) {
    query = query.or(
      `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
    );
  }

  const { data: rawLogs, error: logsError, count } = await query.limit(pageSize + 1);

  if (logsError) {
    throw new ApiError(500, "Failed to load audit logs", logsError.message);
  }
  let logs = Array.isArray(rawLogs) ? rawLogs : [];
  const hasMore = logs.length > pageSize;
  if (hasMore) {
    logs = logs.slice(0, pageSize);
  }

  const actorIds = Array.from(new Set((logs ?? []).map((item) => item.actor_id).filter(Boolean)));
  let actorMap = new Map();
  if (actorIds.length) {
    const { data: profiles, error: profilesError } = await supabaseAdmin
      .from("profiles")
      .select("id, username")
      .in("id", actorIds);
    if (profilesError) {
      throw new ApiError(500, "Failed to load audit actors", profilesError.message);
    }
    actorMap = new Map((profiles ?? []).map((row) => [row.id, row.username]));
  }

  let payload = (logs ?? []).map((log) => ({
    ...log,
    actor_username: actorMap.get(log.actor_id) || "-",
  }));

  if (search) {
    payload = payload.filter((log) => {
      const haystack = [
        log.actor_username,
        log.action,
        log.target_table,
        log.target_id,
        JSON.stringify(log.metadata || {}),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(search);
    });
  }

  return Response.json({
    logs: payload,
    pagination: {
      page,
      pageSize,
      total: count ?? payload.length,
      totalPages: Math.max(1, Math.ceil((count ?? payload.length) / pageSize)),
    },
    cursor: {
      next: hasMore ? encodeCursor(logs[logs.length - 1]) : null,
      hasMore,
    },
  });
}
