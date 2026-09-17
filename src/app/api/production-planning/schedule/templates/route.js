import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { listTemplates } from "@/lib/scheduleConfig";

export const dynamic = "force-dynamic";

// GET  /api/production-planning/schedule/templates?deptId=...
export async function GET(request) {
  try {
    await requirePermissionKeys(request, ["production-line-planning-manage", "production-line-planning-view"]);
    const deptId = new URL(request.url).searchParams.get("deptId") || null;
    const templates = await listTemplates(deptId);
    return NextResponse.json({ ok: true, data: templates });
  } catch (error) {
    return jsonError(error);
  }
}

// POST /api/production-planning/schedule/templates
export async function POST(request) {
  try {
    const permission = await requirePermissionKeys(request, ["production-line-planning-manage"]);
    const body = await readJson(request);
    const name = String(body?.name || "").trim();
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const db = getSupabaseAdmin();
    const { data, error } = await db
      .from("production_schedule_templates")
      .insert({ name, dept_id: body?.deptId || null, is_active: true, created_by: permission.userId })
      .select("*")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
}
