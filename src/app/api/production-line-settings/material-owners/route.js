import { NextResponse } from "next/server";
import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeParam } from "@/lib/validation";

export const dynamic = "force-dynamic";

function isMissingRelationError(error, tableName) {
  const message = String(error?.message || "").toLowerCase();
  const table = String(tableName || "").toLowerCase();
  return (
    String(error?.code || "") === "42P01"
    || message.includes(`relation "${table}"`)
    || message.includes("does not exist")
  );
}

async function loadUsedMaterialSkuCodesFromRouting(supabaseAdmin) {
  const result = await supabaseAdmin
    .from("production_routing_components")
    .select("component_sku_code, component_type")
    .eq("component_type", "RAW");

  if (result.error) {
    if (isMissingRelationError(result.error, "production_routing_components")) {
      return [];
    }
    throw result.error;
  }

  return Array.from(
    new Set(
      (Array.isArray(result.data) ? result.data : [])
        .map((row) => String(row?.component_sku_code || "").trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

// GET - list material owner assignments
export async function GET(request) {
  try {
    await requirePermissionKeys(request, ["production-line-settings-view", "production-line-settings-manage"]);

    const { searchParams } = new URL(request.url);
    const search = normalizeParam(searchParams.get("search")) || "";
    const departmentId = normalizeParam(searchParams.get("departmentId")) || "";
    const includeUsedRouting = String(searchParams.get("includeUsedRouting") || "1").trim() !== "0";

    const supabaseAdmin = getSupabaseAdmin();
    let query = supabaseAdmin
      .from("production_material_owners")
      .select(`
        id,
        material_sku_code,
        department_id,
        created_at,
        updated_at,
        products_cache!inner(sku_code, sku_name, iccat_code),
        production_departments!inner(id, name, code, is_active, deleted_at)
      `)
      .is("production_departments.deleted_at", null)
      .eq("production_departments.is_active", true)
      .order("material_sku_code");

    if (departmentId) {
      query = query.eq("department_id", departmentId);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    let rows = (data || []).map((row) => ({
      id: row.id,
      materialSkuCode: row.material_sku_code,
      materialName: row.products_cache?.sku_name || row.material_sku_code,
      iccatCode: row.products_cache?.iccat_code || "",
      departmentId: row.department_id,
      departmentName: row.production_departments?.name || row.department_id,
      departmentCode: row.production_departments?.code || "",
    }));

    if (search) {
      const term = search.toLowerCase();
      rows = rows.filter(
        (item) =>
          item.materialSkuCode.toLowerCase().includes(term)
          || item.materialName.toLowerCase().includes(term)
      );
    }

    const usedMaterialSkuCodes = includeUsedRouting
      ? await loadUsedMaterialSkuCodesFromRouting(supabaseAdmin)
      : [];

    return NextResponse.json({
      data: rows,
      meta: { usedMaterialSkuCodes },
    });
  } catch (error) {
    return jsonError(error);
  }
}

// POST - assign material to department (upsert)
export async function POST(request) {
  try {
    const permission = await requirePermissionKeys(request, ["production-line-settings-manage"]);

    const body = await readJson(request);
    const materialSkuCode = normalizeParam(body?.materialSkuCode)?.toUpperCase();
    const departmentId = normalizeParam(body?.departmentId);

    if (!materialSkuCode) {
      return NextResponse.json({ error: "materialSkuCode is required" }, { status: 400 });
    }
    if (!departmentId) {
      return NextResponse.json({ error: "departmentId is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("production_material_owners")
      .upsert(
        {
          material_sku_code: materialSkuCode,
          department_id: departmentId,
          updated_by: permission.userId,
          created_by: permission.userId,
        },
        { onConflict: "material_sku_code" }
      )
      .select("*")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    return jsonError(error);
  }
}

// DELETE - remove material owner assignment
export async function DELETE(request) {
  try {
    await requirePermissionKeys(request, ["production-line-settings-manage"]);

    const { searchParams } = new URL(request.url);
    const materialSkuCode = normalizeParam(searchParams.get("materialSkuCode"))?.toUpperCase();
    if (!materialSkuCode) {
      return NextResponse.json({ error: "materialSkuCode is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin
      .from("production_material_owners")
      .delete()
      .eq("material_sku_code", materialSkuCode);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
