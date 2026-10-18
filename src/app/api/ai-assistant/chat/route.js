import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/sessionToken";
import { getSupabaseAdmin } from "@/lib/adminApi";
import { getUserPermissions } from "@/lib/permissionsData";
import { runChatConversation } from "@/features/ai-assistant/services/chatOrchestrator";

export async function POST(request) {
  try {
    // 1. Authenticate user session
    const session = getSessionFromRequest(request);
    if (!session || !session.userId) {
      return NextResponse.json(
        { ok: false, error: "กรุณาเข้าสู่ระบบก่อนใช้งาน AI Assistant" },
        { status: 401 }
      );
    }

    // 2. Parse request body
    const body = await request.json().catch(() => ({}));
    const rawMessages = body?.messages;
    if (!Array.isArray(rawMessages) || rawMessages.length === 0) {
      return NextResponse.json(
        { ok: false, error: "ข้อความไม่ถูกต้อง (messages array is required)" },
        { status: 400 }
      );
    }

    // Sanitize messages
    const messages = rawMessages.slice(-10).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content || "").trim().slice(0, 2000),
    }));

    // 3. Resolve user identity and roles
    const supabaseAdmin = getSupabaseAdmin();
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("username, full_name")
      .eq("id", session.userId)
      .maybeSingle();

    const permissionData = await getUserPermissions(session.userId);

    // Resolve user's named roles
    let roleNames = [];
    try {
      const { data: userRoleRows } = await supabaseAdmin
        .from("user_roles")
        .select("roles(name, role_key)")
        .eq("user_id", session.userId);

      if (userRoleRows) {
        roleNames = userRoleRows
          .map((r) => r.roles?.name || r.roles?.role_key)
          .filter(Boolean);
      }
    } catch {
      // Fallback
    }

    const userContext = {
      userId: session.userId,
      username: profile?.username || session.userId,
      fullName: profile?.full_name || "",
      isAdmin: Boolean(session.isAdmin || permissionData?.isAdmin),
      permissions: permissionData?.permissions || session.permissions || [],
      roles: roleNames,
    };

    // 4. Run conversation
    const result = await runChatConversation({
      messages,
      userContext,
      request,
    });

    // 5. Silent Telemetry Logging (Runs in background, records every query & unanswered gap without user needing to report)
    const { logQueryTelemetrySilently } = await import("@/features/ai-assistant/services/aiTelemetryService.js");
    const lastUserQuery = messages.filter((m) => m.role === "user").slice(-1)[0]?.content || "";
    logQueryTelemetrySilently({
      userContext,
      userQuery: lastUserQuery,
      responseMessage: result.message,
      executedTools: result.executedTools || [],
      isFallback: Boolean(result.isFallback),
    }).catch((logErr) => {
      console.warn("Telemetry logging failed silently:", logErr?.message || logErr);
    });

    return NextResponse.json({
      ok: true,
      message: result.message,
      executedTools: result.executedTools,
      userContext: {
        username: userContext.username,
        isAdmin: userContext.isAdmin,
        roles: userContext.roles,
      },
    });
  } catch (error) {
    console.error("AI Assistant Chat Error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "เกิดข้อผิดพลาดในการประมวลผลคำตอบ",
      },
      { status: 500 }
    );
  }
}
