import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    await requirePermissionKeys(request, [
      "production-line-planning-view",
      "production-line-planning-manage",
      "plan.edit_own_dept",
    ]);

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("production_requisition_document_sequences")
      .select("sequence_key, last_value, updated_at")
      .order("sequence_key", { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true, data: data || [] });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    await requirePermissionKeys(request, [
      "production-line-planning-manage",
      "plan.edit_own_dept",
    ]);

    const body = await readJson(request);
    const sequenceKey = String(body?.sequenceKey || body?.sequence_key || "").trim().toUpperCase();
    const lastValue = Number(body?.lastValue ?? body?.last_value ?? 0);

    if (!sequenceKey) {
      return NextResponse.json({ error: "sequenceKey is required" }, { status: 400 });
    }
    if (!Number.isInteger(lastValue) || lastValue < 0) {
      return NextResponse.json({ error: "lastValue must be a non-negative integer" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("production_requisition_document_sequences")
      .upsert({
        sequence_key: sequenceKey,
        last_value: lastValue,
        updated_at: new Date().toISOString(),
      }, { onConflict: "sequence_key" })
      .select("sequence_key, last_value, updated_at")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return jsonError(error);
  }
}
