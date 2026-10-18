import { NextResponse } from "next/server";
import { getSessionFromRequest } from "@/lib/sessionToken";
import { getUserPermissions } from "@/lib/permissionsData";
import {
  getQueryGapsForReview,
  getVerifiedExemplars,
  saveVerifiedExemplars,
} from "@/features/ai-assistant/services/aiTelemetryService";

/**
 * GET: Retrieve telemetry gaps & verified exemplars
 */
export async function GET(request) {
  try {
    const session = getSessionFromRequest(request);
    if (!session || !session.userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const permissionData = await getUserPermissions(session.userId);
    const isAdmin = Boolean(session.isAdmin || permissionData?.isAdmin);
    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: "Forbidden: Admin required" }, { status: 403 });
    }

    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") || 50);

    const [gaps, exemplars] = await Promise.all([
      getQueryGapsForReview(limit),
      getVerifiedExemplars(true),
    ]);

    return NextResponse.json({
      ok: true,
      gaps,
      exemplars,
    });
  } catch (error) {
    console.error("AI Telemetry API GET Error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

/**
 * POST: Add or update verified exemplars (Human-in-the-Loop continuous learning)
 */
export async function POST(request) {
  try {
    const session = getSessionFromRequest(request);
    if (!session || !session.userId) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const permissionData = await getUserPermissions(session.userId);
    const isAdmin = Boolean(session.isAdmin || permissionData?.isAdmin);
    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: "Forbidden: Admin required" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const { action, question, answer, category, exemplars } = body;

    // Action 1: Add a single verified Q&A pair from a resolved gap
    if (action === "add_exemplar") {
      if (!question || !answer) {
        return NextResponse.json({ ok: false, error: "Question and answer are required" }, { status: 400 });
      }

      const currentExemplars = await getVerifiedExemplars(true);
      const updated = [
        {
          id: Date.now().toString(),
          question: String(question).trim(),
          answer: String(answer).trim(),
          category: category || "general",
          created_at: new Date().toISOString(),
        },
        ...currentExemplars.filter((e) => e.question !== String(question).trim()),
      ];

      await saveVerifiedExemplars(updated, session.userId);
      return NextResponse.json({ ok: true, message: "เพิ่มความรู้ที่ผ่านการตรวจแล้วสำเร็จ", count: updated.length });
    }

    // Action 2: Batch replace / update exemplars
    if (action === "save_all" && Array.isArray(exemplars)) {
      await saveVerifiedExemplars(exemplars, session.userId);
      return NextResponse.json({ ok: true, message: "บันทึกคลังความรู้สำเร็จ", count: exemplars.length });
    }

    return NextResponse.json({ ok: false, error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("AI Telemetry API POST Error:", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
