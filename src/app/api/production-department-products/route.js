import { getSupabaseAdmin, jsonError, readJson } from "@/lib/adminApi";
import { requireTaskPermission } from "@/lib/taskPermissionGuard";
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
    await requireTaskPermission(request, "production-settings-department-products-view");

    const { searchParams } = new URL(request.url);
    const departmentId = normalizeParam(searchParams.get("departmentId"));
    if (!departmentId) {
      return Response.json({ error: "departmentId is required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    const { data, error } = await supabaseAdmin
      .from("production_department_products")
      .select("sku_code,is_owner,subcategory_id,products_cache(sku_name,iccat_code,iccat_name,uom_name)")
      .eq("department_id", departmentId)
      .order("sku_code", { ascending: true });

    if (error) {
      return Response.json({ error: "Failed to load department products" }, { status: 500 });
    }

    const subcategoryResult = await supabaseAdmin
      .from("production_department_product_subcategories")
      .select("id,name")
      .eq("department_id", departmentId);

    const subcategoryById = new Map(
      (subcategoryResult.data ?? []).map((row) => [row.id, row.name])
    );

    let linksBySku = new Map();
    try {
      const linksResult = await supabaseAdmin
        .from("production_department_product_subcategory_links")
        .select("sku_code,subcategory_id,is_primary")
        .eq("department_id", departmentId);

      if (!linksResult.error && Array.isArray(linksResult.data)) {
        for (const link of linksResult.data) {
          const sku = String(link.sku_code || "").trim().toUpperCase();
          if (!linksBySku.has(sku)) linksBySku.set(sku, []);
          const subName = subcategoryById.get(link.subcategory_id) || "";
          linksBySku.get(sku).push({
            id: link.subcategory_id,
            name: subName,
            is_primary: Boolean(link.is_primary),
          });
        }
      }
    } catch {
      // Gracefully fall back if links table not yet installed
    }

    const payload = (data ?? []).map((row) => {
      const sku = String(row.sku_code || "").trim().toUpperCase();
      const links = linksBySku.get(sku) || [];
      const subcategories = [...links];

      if (row.subcategory_id && !subcategories.some((s) => s.id === row.subcategory_id)) {
        subcategories.unshift({
          id: row.subcategory_id,
          name: subcategoryById.get(row.subcategory_id) ?? "",
          is_primary: true,
        });
      }

      const primary = subcategories.find((s) => s.is_primary) || subcategories[0] || null;
      const primaryId = primary?.id || row.subcategory_id || null;
      const primaryName = primaryId ? (subcategoryById.get(primaryId) || primary?.name || "") : "";

      return {
        sku_code: row.sku_code,
        is_owner: Boolean(row.is_owner),
        subcategory_id: primaryId,
        subcategory_name: primaryName,
        subcategories: subcategories.filter((s) => Boolean(s.id && s.name)),
        sku_name: row.products_cache?.sku_name ?? "",
        iccat_code: row.products_cache?.iccat_code ?? "",
        iccat_name: row.products_cache?.iccat_name ?? "",
        uom_name: row.products_cache?.uom_name ?? "",
      };
    });

    return Response.json({ data: payload });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST(request) {
  try {
    const { userId } = await requireTaskPermission(request, "production-settings-department-products-create");

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

export async function PATCH(request) {
  try {
    await requireTaskPermission(request, "production-settings-department-products-edit");

    const body = await readJson(request);
    const departmentId = normalizeParam(body.departmentId);
    const skuCodes = normalizeSkuCodes(body.skuCodes);
    const subcategoryId = normalizeParam(body.subcategoryId);
    const action = String(body.action || (subcategoryId ? "add" : "clear")).toLowerCase();

    if (!departmentId || !skuCodes.length) {
      return Response.json(
        { error: "departmentId and skuCodes are required" },
        { status: 400 }
      );
    }

    const supabaseAdmin = getSupabaseAdmin();
    if (subcategoryId) {
      const subcategoryResult = await supabaseAdmin
        .from("production_department_product_subcategories")
        .select("id")
        .eq("id", subcategoryId)
        .eq("department_id", departmentId)
        .maybeSingle();
      if (subcategoryResult.error || !subcategoryResult.data) {
        return Response.json(
          { error: "ไม่พบหมวดหมู่ย่อยในแผนกที่เลือก" },
          { status: 400 }
        );
      }
    }

    if (action === "remove") {
      try {
        if (subcategoryId) {
          await supabaseAdmin
            .from("production_department_product_subcategory_links")
            .delete()
            .eq("department_id", departmentId)
            .eq("subcategory_id", subcategoryId)
            .in("sku_code", skuCodes);
        }
      } catch {
        // Ignore if links table not yet installed
      }

      for (const sku of skuCodes) {
        let nextSubId = null;
        try {
          const remaining = await supabaseAdmin
            .from("production_department_product_subcategory_links")
            .select("subcategory_id")
            .eq("department_id", departmentId)
            .eq("sku_code", sku)
            .order("created_at", { ascending: true })
            .limit(1);
          nextSubId = remaining.data?.[0]?.subcategory_id || null;
          if (nextSubId) {
            await supabaseAdmin
              .from("production_department_product_subcategory_links")
              .update({ is_primary: true })
              .eq("department_id", departmentId)
              .eq("sku_code", sku)
              .eq("subcategory_id", nextSubId);
          }
        } catch {}

        await supabaseAdmin
          .from("production_department_products")
          .update({ subcategory_id: nextSubId })
          .eq("department_id", departmentId)
          .eq("sku_code", sku);
      }

      return Response.json({ ok: true });
    }

    if (!subcategoryId || action === "clear") {
      try {
        await supabaseAdmin
          .from("production_department_product_subcategory_links")
          .delete()
          .eq("department_id", departmentId)
          .in("sku_code", skuCodes);
      } catch {}

      const { error } = await supabaseAdmin
        .from("production_department_products")
        .update({ subcategory_id: null })
        .eq("department_id", departmentId)
        .in("sku_code", skuCodes);

      if (error) {
        return Response.json(
          { error: "Failed to update product subcategory" },
          { status: 500 }
        );
      }

      return Response.json({ ok: true });
    }

    if (action === "set_primary") {
      try {
        await supabaseAdmin
          .from("production_department_product_subcategory_links")
          .update({ is_primary: false })
          .eq("department_id", departmentId)
          .in("sku_code", skuCodes);

        await supabaseAdmin
          .from("production_department_product_subcategory_links")
          .update({ is_primary: true })
          .eq("department_id", departmentId)
          .eq("subcategory_id", subcategoryId)
          .in("sku_code", skuCodes);
      } catch {}

      const { error } = await supabaseAdmin
        .from("production_department_products")
        .update({ subcategory_id: subcategoryId })
        .eq("department_id", departmentId)
        .in("sku_code", skuCodes);

      if (error) {
        return Response.json(
          { error: "Failed to set primary subcategory" },
          { status: 500 }
        );
      }

      return Response.json({ ok: true });
    }

    // Default action: "add"
    const existingProducts = await supabaseAdmin
      .from("production_department_products")
      .select("sku_code,subcategory_id")
      .eq("department_id", departmentId)
      .in("sku_code", skuCodes);

    const existingMap = new Map(
      (existingProducts.data ?? []).map((p) => [p.sku_code, p.subcategory_id])
    );

    try {
      const linkRows = skuCodes.map((sku) => {
        const currentSubcategory = existingMap.get(sku);
        const isPrimary = !currentSubcategory || currentSubcategory === subcategoryId;
        return {
          department_id: departmentId,
          sku_code: sku,
          subcategory_id: subcategoryId,
          is_primary: isPrimary,
        };
      });

      await supabaseAdmin
        .from("production_department_product_subcategory_links")
        .upsert(linkRows, { onConflict: "department_id,sku_code,subcategory_id" });
    } catch {
      // Gracefully fall back if links table not yet installed
    }

    const unassignedSkus = skuCodes.filter((sku) => !existingMap.get(sku));
    if (unassignedSkus.length) {
      await supabaseAdmin
        .from("production_department_products")
        .update({ subcategory_id: subcategoryId })
        .eq("department_id", departmentId)
        .in("sku_code", unassignedSkus);
    }

    const { error } = await supabaseAdmin
      .from("production_department_products")
      .update({ subcategory_id: subcategoryId })
      .eq("department_id", departmentId)
      .in("sku_code", skuCodes.filter((sku) => !existingMap.get(sku) || existingMap.get(sku) === subcategoryId));

    if (error) {
      return Response.json(
        { error: "Failed to update product subcategory" },
        { status: 500 }
      );
    }

    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}

export async function DELETE(request) {
  try {
    await requireTaskPermission(request, "production-settings-department-products-delete");

    const body = await readJson(request);
    const departmentId = normalizeParam(body.departmentId);
    const skuCodes = normalizeSkuCodes(body.skuCodes);

    if (!departmentId || !skuCodes.length) {
      return Response.json({ error: "departmentId and skuCodes are required" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();
    try {
      await supabaseAdmin
        .from("production_department_product_subcategory_links")
        .delete()
        .eq("department_id", departmentId)
        .in("sku_code", skuCodes);
    } catch {}
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
