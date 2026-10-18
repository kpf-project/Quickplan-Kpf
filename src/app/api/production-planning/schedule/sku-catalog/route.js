import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { loadScheduleSkuCatalog } from "@/lib/scheduleSkuCatalog";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    await requirePermissionKeys(request, [
      "production-line-planning-manage",
      "production-line-planning-view",
      "plan.edit_own_dept",
    ]);

    const searchParams = new URL(request.url).searchParams;
    const rawCodes = searchParams.get("iccatCodes");
    const iccatCodes = rawCodes
      ? rawCodes.split(",").map((code) => code.trim()).filter(Boolean)
      : ["04", "04-1", "04-2"];

    const db = getSupabaseAdmin();
    const catalog = await loadScheduleSkuCatalog(db, iccatCodes);

    return NextResponse.json({ ok: true, data: catalog });
  } catch (error) {
    return jsonError(error);
  }
}
