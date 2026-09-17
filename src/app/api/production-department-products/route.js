import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requirePermissionKeys } from "@/lib/permissionGuard";
import { normalizeParam } from "@/lib/validation";

function normalizeSkuCodes(values) {
  if (!Array.isArray(values)) return [];
  return Array.from(
    new Set(
      values
        .map((value) => String(value || "").trim().toUpperCase())
        .filter(Boolean)
    )
  );
}

export async function GET(request) {
  try {
    await requirePermissionKeys(request, [
      "production-line-settings-view",
      "production-line-settings-manage",
    ]);

    const { searchParams } = new URL(request.url);
    const departmentId = normalizeParam(searchParams.get("departmentId"));
    if (!departmentId) {
      return Response.json({ error: "departmentId is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("production_department_products")
      .select("sku_code,is_owner,products_cache(sku_name,iccat_code,iccat_name,uom_name)")
      .eq("department_id", departmentId)
      .order("sku_code", { ascending: true });

    if (error) {
      return Response.json({ error: "Failed to load department products" }, { status: 500 });
    }

    const payload = (data ?? []).map((row) => ({
      sku_code: row.sku_code,
      is_owner: Boolean(row.is_owner),
      sku_name: row.products_cache?.sku_name ?? "",
      iccat_code: row.products_cache?.iccat_code ?? "",
      iccat_name: row.products_cache?.iccat_name ?? "",
      uom_name: row.products_cache?.uom_name ?? "",
    }));

    return Response.json({ data: payload });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const { userId } = await requirePermissionKeys(request, [
      "production-line-settings-manage",
    ]);

    const body = await readJson(request);
    const departmentId = normalizeParam(body.departmentId);
    const skuCodes = normalizeSkuCodes(body.skuCodes);
    const ownerSkuCodes = normalizeSkuCodes(body.ownerSkuCodes);

    if (!departmentId || !skuCodes.length) {
      return Response.json({ error: "departmentId and skuCodes are required" }, { status: 400 });
    }

    const rows = skuCodes.map((skuCode) => ({
      department_id: departmentId,
      sku_code: skuCode,
      created_by: userId,
    }));

    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin
      .from("production_department_products")
      .upsert(rows, { onConflict: "department_id,sku_code" });

    if (error) {
      return Response.json({ error: "Failed to assign products to department" }, { status: 500 });
    }

    if (ownerSkuCodes.length) {
      const clearOwnerResult = await supabaseAdmin
        .from("production_department_products")
        .update({ is_owner: false })
        .in("sku_code", ownerSkuCodes);
      if (clearOwnerResult.error) {
        return Response.json({ error: "Failed to clear existing product owner" }, { status: 500 });
      }

      const assignOwnerResult = await supabaseAdmin
        .from("production_department_products")
        .update({ is_owner: true })
        .eq("department_id", departmentId)
        .in("sku_code", ownerSkuCodes);
      if (assignOwnerResult.error) {
        return Response.json({ error: "Failed to assign product owner" }, { status: 500 });
      }
    } else {
      const existingOwnerResult = await supabaseAdmin
        .from("production_department_products")
        .select("sku_code")
        .in("sku_code", skuCodes)
        .eq("is_owner", true);
      if (existingOwnerResult.error) {
        return Response.json({ error: "Failed to validate product owners" }, { status: 500 });
      }

      const ownerSkuSet = new Set(
        (existingOwnerResult.data ?? [])
          .map((row) => String(row?.sku_code || "").trim().toUpperCase())
          .filter(Boolean)
      );
      const missingOwnerSkus = skuCodes.filter((skuCode) => !ownerSkuSet.has(skuCode));

      if (missingOwnerSkus.length) {
        const assignFallbackOwnerResult = await supabaseAdmin
          .from("production_department_products")
          .update({ is_owner: true })
          .eq("department_id", departmentId)
          .in("sku_code", missingOwnerSkus);
        if (assignFallbackOwnerResult.error) {
          return Response.json({ error: "Failed to assign fallback product owner" }, { status: 500 });
        }
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request) {
  try {
    await requirePermissionKeys(request, [
      "production-line-settings-manage",
    ]);

    const body = await readJson(request);
    const departmentId = normalizeParam(body.departmentId);
    const skuCodes = normalizeSkuCodes(body.skuCodes);

    if (!departmentId || !skuCodes.length) {
      return Response.json({ error: "departmentId and skuCodes are required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const ownerRowsResult = await supabaseAdmin
      .from("production_department_products")
      .select("sku_code,is_owner")
      .eq("department_id", departmentId)
      .in("sku_code", skuCodes);
    if (ownerRowsResult.error) {
      return Response.json({ error: "Failed to load product ownership before delete" }, { status: 500 });
    }
    const removedOwnerSkus = Array.from(
      new Set(
        (ownerRowsResult.data ?? [])
          .filter((row) => Boolean(row?.is_owner))
          .map((row) => String(row?.sku_code || "").trim().toUpperCase())
          .filter(Boolean)
      )
    );

    const { error } = await supabaseAdmin
      .from("production_department_products")
      .delete()
      .eq("department_id", departmentId)
      .in("sku_code", skuCodes);

    if (error) {
      return Response.json({ error: "Failed to remove products from department" }, { status: 500 });
    }

    if (removedOwnerSkus.length) {
      const fallbackRowsResult = await supabaseAdmin
        .from("production_department_products")
        .select("id,sku_code")
        .in("sku_code", removedOwnerSkus)
        .order("id", { ascending: true });
      if (fallbackRowsResult.error) {
        return Response.json({ error: "Failed to recover product owner after delete" }, { status: 500 });
      }

      const fallbackIdBySku = new Map();
      (fallbackRowsResult.data ?? []).forEach((row) => {
        const skuCode = String(row?.sku_code || "").trim().toUpperCase();
        if (!skuCode || fallbackIdBySku.has(skuCode)) return;
        fallbackIdBySku.set(skuCode, row.id);
      });
      const fallbackIds = Array.from(fallbackIdBySku.values());
      if (fallbackIds.length) {
        const ownerUpdateResult = await supabaseAdmin
          .from("production_department_products")
          .update({ is_owner: true })
          .in("id", fallbackIds);
        if (ownerUpdateResult.error) {
          return Response.json({ error: "Failed to set fallback product owner" }, { status: 500 });
        }
      }
    }

    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
